import { v } from "convex/values";
import { buildFeatures, priorWeights } from "../lib/features";
import { applyHardFilters, type FilterableProfile } from "../lib/filters";
import { lookupCity } from "../lib/geo/data";
import { computePreferenceVector } from "../lib/rocchio";
import { parseNoJdPenalty, scoreFeatures } from "../lib/score";
import type { Preference } from "../lib/schemas/profileSeed";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

const SCORE_BATCH = 50;

function toFilterProfile(profile: Doc<"profiles">): FilterableProfile {
  return {
    classYear: profile.classYear,
    degreeLevel: profile.degreeLevel,
    gradDate: profile.gradDate,
    preferences: profile.preferences as Preference[],
  };
}

async function loadScoringContext(ctx: MutationCtx, profile: Doc<"profiles">) {
  const promoted = (
    await ctx.db
      .query("models")
      .withIndex("by_promoted", (q) => q.eq("promoted", true))
      .collect()
  ).sort((a, b) => b.version - a.version)[0];

  let weights = priorWeights(profile.preferences as Preference[]);
  let modelVersion = 0;
  if (promoted) {
    const userWeights = await ctx.db
      .query("userWeights")
      .withIndex("by_user_version", (q) =>
        q.eq("userId", profile.userId).eq("modelVersion", promoted.version),
      )
      .unique();
    weights = userWeights?.weights ?? promoted.globalWeights;
    modelVersion = promoted.version;
  }

  const feedback = await ctx.db
    .query("feedback")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .collect();
  const likedCompanies = new Set<string>();
  for (const entry of feedback) {
    if (entry.kind !== "applied" && entry.kind !== "thumbs_up") continue;
    const listing = await ctx.db.get(entry.listingId);
    if (listing) likedCompanies.add(listing.company.trim().toLowerCase());
  }

  return { weights, modelVersion, likedCompanies };
}

/** Scores the given listings for every profile and upserts matches. */
export const scoreListingsForUsers = internalMutation({
  args: { listingIds: v.array(v.id("listings")) },
  handler: async (ctx, { listingIds }) => {
    const profiles = await ctx.db.query("profiles").collect();
    if (profiles.length === 0) return;
    const now = Date.now();
    const noJdPenalty = parseNoJdPenalty(process.env.NO_JD_PENALTY);

    for (const profile of profiles) {
      const context = await loadScoringContext(ctx, profile);
      const filterProfile = toFilterProfile(profile);

      for (const listingId of listingIds) {
        const listing = await ctx.db.get(listingId);
        if (!listing || !listing.active) continue;

        const filterListing = {
          company: listing.company,
          title: listing.title,
          jdText: listing.jdText,
          category: listing.category,
          remoteType: listing.remoteType,
          sponsorship: listing.sponsorship,
          degrees: listing.degrees,
          locations: listing.locations,
          geo: listing.geo ?? [],
        };
        const { pass, droppedBy } = applyHardFilters(
          filterListing,
          filterProfile,
          lookupCity,
        );

        let features: Record<string, number> = {};
        let rawScore = 0;
        let score = 0;
        if (pass) {
          features = buildFeatures(
            {
              ...filterListing,
              embedding: listing.embedding,
              jdStatus: listing.jdStatus,
              datePosted: listing.datePosted,
            },
            {
              ...filterProfile,
              resumeEmbedding: profile.resumeEmbedding,
              preferenceVector: profile.preferenceVector,
            },
            { likedCompanies: context.likedCompanies, now, lookup: lookupCity },
          );
          ({ rawScore, score } = scoreFeatures(features, context.weights, {
            hasJd: listing.jdStatus === "fetched",
            noJdPenalty,
          }));
        }

        const existing = await ctx.db
          .query("matches")
          .withIndex("by_user_listing", (q) =>
            q.eq("userId", profile.userId).eq("listingId", listingId),
          )
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, {
            droppedBy,
            features,
            rawScore,
            score,
            modelVersion: context.modelVersion,
          });
        } else {
          await ctx.db.insert("matches", {
            userId: profile.userId,
            listingId,
            droppedBy,
            features,
            rawScore,
            score,
            modelVersion: context.modelVersion,
            exploration: false,
            createdAt: now,
          });
        }
      }
    }
  },
});

/** Full re-score: model promotion, preference change, resume change. */
export const rescoreAll = internalAction({
  args: {},
  handler: async (ctx) => {
    let cursor: string | null = null;
    let scored = 0;
    for (;;) {
      const page: {
        page: Id<"listings">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.scoring.listActiveListingIds, { cursor });
      for (let i = 0; i < page.page.length; i += SCORE_BATCH) {
        await ctx.runMutation(internal.scoring.scoreListingsForUsers, {
          listingIds: page.page.slice(i, i + SCORE_BATCH),
        });
        scored += Math.min(SCORE_BATCH, page.page.length - i);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`rescoreAll: scored ${scored} listings`);
  },
});

export const listActiveListingIds = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_active", (q) => q.eq("active", true))
      .paginate({ numItems: 200, cursor });
    return { ...page, page: page.page.map((l) => l._id) };
  },
});

/**
 * Rebuilds the Rocchio preference vector from current feedback and re-scores.
 * Run after feedback lands or a fresh resume embedding arrives.
 */
export const updatePreferenceVector = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile?.resumeEmbedding) return;

    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const liked: number[][] = [];
    const disliked: number[][] = [];
    for (const entry of feedback) {
      const listing = await ctx.db.get(entry.listingId);
      if (!listing?.embedding) continue;
      if (entry.kind === "applied" || entry.kind === "thumbs_up") {
        liked.push(listing.embedding);
      } else if (entry.kind === "thumbs_down") {
        disliked.push(listing.embedding);
      }
    }
    await ctx.db.patch(profile._id, {
      preferenceVector: computePreferenceVector(
        profile.resumeEmbedding,
        liked,
        disliked,
      ),
    });
  },
});
