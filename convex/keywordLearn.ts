import { v } from "convex/values";
import {
  aggregateTrainingRows,
  type FeedbackEvent,
} from "../lib/feedbackAggregate";
import { buildStructuralFeatures } from "../lib/features";
import { lookupCity } from "../lib/geo/data";
import {
  applyFeedbackStep,
  replayWeights,
  type ReplayListingInput,
} from "../lib/keywordLearn";
import { customKeywordHits, scoreListing } from "../lib/keywordScore";
import type { KeywordWeightMap } from "../lib/keywordWeights";
import { SCORING_CONFIG } from "../lib/scoringConfig";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { readKeywordStats } from "./keywordStats";
import { loadScoringContext, toFilterProfile } from "./scoring";

/**
 * Online learning from feedback, inside Convex: one logistic step per
 * feedback event (lib/keywordLearn), and a deterministic replay that
 * re-derives the whole map from history. Feedback on eval-split labeled
 * listings never trains, so the eval metric stays honest.
 */

function toEvent(doc: Doc<"feedback">): FeedbackEvent {
  return {
    userId: doc.userId,
    listingId: doc.listingId,
    kind: doc.kind,
    createdAt: doc.createdAt,
  };
}

async function evalListingIds(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Set<string>> {
  const labels = await ctx.db
    .query("labels")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(
    labels.filter((l) => l.split === "eval").map((l) => l.listingId as string),
  );
}

export function listingInputs(
  listing: Doc<"listings">,
  profile: Doc<"profiles">,
  context: Awaited<ReturnType<typeof loadScoringContext>>,
  now: number,
): ReplayListingInput {
  const hasJd = listing.jdStatus === "fetched";
  const structural = buildStructuralFeatures(
    {
      company: listing.company,
      title: listing.title,
      jdText: listing.jdText,
      category: listing.category,
      remoteType: listing.remoteType,
      sponsorship: listing.sponsorship,
      degrees: listing.degrees,
      locations: listing.locations,
      geo: listing.geo ?? [],
      embedding: listing.embedding,
      jdStatus: listing.jdStatus,
      datePosted: listing.datePosted,
      jdExtract: listing.jdExtract as never,
    },
    {
      ...toFilterProfile(profile),
      resumeEmbedding: profile.resumeEmbedding,
      skills: profile.skills,
    },
    { likedCompanies: context.likedCompanies, now, lookup: lookupCity },
  );
  return {
    structural,
    listingKeywords: listing.keywords ?? {},
    customHits: customKeywordHits(
      context.keywordWeights,
      listing.title,
      hasJd ? listing.jdText : null,
    ),
    hasJd,
  };
}

/** One learning step for the (user, listing) pair's current aggregate,
 * then a rescore of that user's matches. */
export const onFeedback = internalMutation({
  args: { userId: v.id("users"), listingId: v.id("listings") },
  handler: async (ctx, { userId, listingId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return;
    const listing = await ctx.db.get(listingId);
    if (!listing) return;
    if ((await evalListingIds(ctx, userId)).has(listingId)) return;

    const events = await ctx.db
      .query("feedback")
      .withIndex("by_user_listing", (q) =>
        q.eq("userId", userId).eq("listingId", listingId),
      )
      .collect();
    const [row] = aggregateTrainingRows(
      [],
      events.map(toEvent),
      SCORING_CONFIG.feedbackWeights,
    );
    if (!row) return;

    const stats = await readKeywordStats(ctx);
    const context = await loadScoringContext(ctx, profile);
    const inputs = listingInputs(listing, profile, context, Date.now());
    const { rawScore } = scoreListing({
      structural: inputs.structural,
      structuralWeights: context.structuralWeights,
      listingKeywords: inputs.listingKeywords,
      customHits: inputs.customHits,
      keywordWeights: context.keywordWeights,
      stats,
      hasJd: inputs.hasJd,
      noJdPenalty: 1, // p is the pre-penalty probability
    });
    const weights: KeywordWeightMap = applyFeedbackStep(
      context.keywordWeights,
      { ...inputs.listingKeywords, ...inputs.customHits },
      row.y,
      row.weight,
      rawScore,
      stats,
    );
    await ctx.db.patch(profile._id, { keywordWeights: weights });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreUser, { userId });
  },
});

/** Schedules a replay for every profile — after a vocabulary change. */
export const replayAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    for (const profile of profiles) {
      await ctx.scheduler.runAfter(0, internal.keywordLearn.replay, {
        userId: profile.userId,
      });
    }
  },
});

/** Resets to anchors and re-applies the user's full feedback history —
 * after an anchor edit, an interests change, or a vocabulary change. */
export const replay = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return;

    const excluded = await evalListingIds(ctx, userId);
    const events = (
      await ctx.db
        .query("feedback")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((e) => !excluded.has(e.listingId));

    const stats = await readKeywordStats(ctx);
    const context = await loadScoringContext(ctx, profile);
    const now = Date.now();
    const listings = new Map<string, ReplayListingInput>();
    for (const listingId of new Set(events.map((e) => e.listingId))) {
      const listing = await ctx.db.get(listingId);
      if (!listing) continue;
      listings.set(listingId, listingInputs(listing, profile, context, now));
    }

    const weights = replayWeights({
      anchors: context.keywordWeights,
      events: events.map(toEvent),
      listings,
      structuralWeights: context.structuralWeights,
      stats,
    });
    await ctx.db.patch(profile._id, { keywordWeights: weights });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreUser, { userId });
  },
});
