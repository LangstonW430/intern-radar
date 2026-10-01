import { v } from "convex/values";
import type { FeedbackEvent } from "../lib/feedbackAggregate";
import type { ReplayListingInput } from "../lib/keywordLearn";
import { internalQuery } from "./_generated/server";
import { listingInputs } from "./keywordLearn";
import { readKeywordStats } from "./keywordStats";
import { loadScoringContext } from "./scoring";

/**
 * Everything scripts/eval.ts needs to replay a user's keyword weights and
 * score their eval-split labels locally with the shared lib code: anchors,
 * feedback history, keyword stats, structural weights, and per-listing
 * scoring inputs for both the feedback and the eval listings.
 */
export const exportEval = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const wanted = email.trim().toLowerCase();
    const profiles = await ctx.db.query("profiles").collect();
    const profile = profiles.find((p) => p.email === wanted) ?? null;
    if (!profile) return null;

    const labels = await ctx.db
      .query("labels")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .collect();
    const evalLabels = labels.filter((l) => l.split === "eval");

    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .collect();
    const events: FeedbackEvent[] = feedback.map((f) => ({
      userId: f.userId,
      listingId: f.listingId,
      kind: f.kind,
      createdAt: f.createdAt,
    }));

    const stats = await readKeywordStats(ctx);
    const context = await loadScoringContext(ctx, profile);
    const now = Date.now();

    const listingIds = new Set([
      ...feedback.map((f) => f.listingId),
      ...evalLabels.map((l) => l.listingId),
    ]);
    const listings: Record<string, ReplayListingInput> = {};
    for (const listingId of listingIds) {
      const listing = await ctx.db.get(listingId);
      if (!listing) continue;
      listings[listingId] = listingInputs(listing, profile, context, now);
    }

    return {
      email: profile.email,
      anchors: context.keywordWeights,
      structuralWeights: context.structuralWeights,
      stats,
      events,
      evalLabels: evalLabels.map((l) => ({
        listingId: l.listingId as string,
        label: l.label,
        hadJd: l.hadJd,
      })),
      listings,
    };
  },
});
