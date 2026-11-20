import { v } from "convex/values";
import {
  ageInDays,
  agePenaltyFloorDays,
  DAY_MS,
  postModelScore,
} from "../lib/keywordScore";
import { parseNoJdPenalty } from "../lib/score";
import { SCORING_CONFIG } from "../lib/scoringConfig";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const AGING_BATCH = 200;

/**
 * Daily cron: re-applies the age penalty to stored match scores. A match's
 * score is computed when it is scored, but the penalty depends on the
 * clock, so without this a listing scored while fresh keeps its fresh score
 * (a 30-day-old posting showing 100). Only rawScore × the post-model
 * multipliers changes; the model probability and breakdown stay as scored.
 *
 * Reads only matches whose age is in the window where the penalty still
 * moves (past grace, up to a day beyond reaching the floor), via the
 * by_datePosted index — no listing docs.
 */
export const refreshAgedScores = internalMutation({
  args: {
    now: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    updated: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const { graceDays } = SCORING_CONFIG.agePenalty;
    const floorDays = agePenaltyFloorDays();
    const newest = now - graceDays * DAY_MS;
    const oldest = Number.isFinite(floorDays)
      ? now - (floorDays + 2) * DAY_MS
      : 0;
    const noJdPenalty = parseNoJdPenalty(process.env.NO_JD_PENALTY);

    const page = await ctx.db
      .query("matches")
      .withIndex("by_datePosted", (q) =>
        q.gte("datePosted", oldest).lte("datePosted", newest),
      )
      .paginate({ numItems: AGING_BATCH, cursor: args.cursor ?? null });

    let updated = args.updated ?? 0;
    for (const match of page.page) {
      if (match.droppedBy !== null || match.datePosted === undefined) continue;
      const score = postModelScore(
        match.rawScore,
        match.hasJd ?? true,
        noJdPenalty,
        ageInDays(now, match.datePosted),
      );
      if (Math.abs(score - match.score) < 1e-9) continue;
      await ctx.db.patch(match._id, { score });
      updated++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.aging.refreshAgedScores, {
        now,
        cursor: page.continueCursor,
        updated,
      });
    } else {
      console.log(`refreshAgedScores: updated ${updated} match scores`);
    }
  },
});
