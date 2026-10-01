import { v } from "convex/values";
import { initialKeywordWeights } from "../lib/keywordWeights";
import { SCORING_CONFIG } from "../lib/scoringConfig";
import { extractKeywords, VOCABULARY_VERSION } from "../lib/vocabulary";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

/**
 * One-shot migrations for the keyword-weight model, run manually with
 * `npx convex run` (same paginated action/query/mutation shape as
 * ml:backfillJdExtracts). Safe to re-run; version-gated unless forced.
 */

/** Recomputes listing keywords for every listing not on the current
 * vocabulary version, then rebuilds the keyword stats from scratch. */
export const backfillListingKeywords = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    let cursor: string | null = null;
    let updated = 0;
    for (;;) {
      const page: {
        page: {
          listingId: Id<"listings">;
          title: string;
          jdText: string | null;
          jdStatus: string;
          keywordsVersion: number | null;
        }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrate.listKeywordBackfillPage, {
        cursor,
      });
      const items = page.page
        .filter((l) => force || l.keywordsVersion !== VOCABULARY_VERSION)
        .map((l) => ({
          listingId: l.listingId,
          keywords: extractKeywords(
            l.title,
            l.jdStatus === "fetched" ? l.jdText : null,
          ),
        }));
      for (let i = 0; i < items.length; i += 50) {
        await ctx.runMutation(internal.migrate.patchKeywordsBatch, {
          items: items.slice(i, i + 50),
        });
        updated += Math.min(50, items.length - i);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    // Incremental stats can't survive a bulk rewrite — recount, then
    // replay every user's weights against the new vocabulary and IDFs.
    await ctx.runAction(internal.keywordStats.rebuild, {});
    if (updated > 0) {
      await ctx.runMutation(internal.keywordLearn.replayAll, {});
    }
    console.log(`backfillListingKeywords: updated ${updated} listings`);
  },
});

/** Gives every profile interest-derived keyword weights. Skips profiles
 * that already have a map unless forced (force discards learning). */
export const initKeywordWeights = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    const profiles = await ctx.db.query("profiles").collect();
    let updated = 0;
    for (const profile of profiles) {
      if (profile.keywordWeights !== undefined && !force) continue;
      await ctx.db.patch(profile._id, {
        keywordWeights: initialKeywordWeights(
          profile.interests ?? [],
          SCORING_CONFIG,
        ),
      });
      // Fold any pre-existing feedback into the fresh map.
      await ctx.scheduler.runAfter(0, internal.keywordLearn.replay, {
        userId: profile.userId,
      });
      updated++;
    }
    console.log(`initKeywordWeights: initialized ${updated} profiles`);
  },
});

export const listKeywordBackfillPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 100, cursor });
    return {
      ...page,
      page: page.page.map((l) => ({
        listingId: l._id,
        title: l.title,
        jdText: l.jdText ?? null,
        jdStatus: l.jdStatus,
        keywordsVersion: l.keywordsVersion ?? null,
      })),
    };
  },
});

export const patchKeywordsBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        listingId: v.id("listings"),
        keywords: v.record(v.string(), v.float64()),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    for (const item of items) {
      await ctx.db.patch(item.listingId, {
        keywords: item.keywords,
        keywordsVersion: VOCABULARY_VERSION,
      });
    }
  },
});
