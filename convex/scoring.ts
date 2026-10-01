import { v } from "convex/values";
import {
  buildStructuralFeatures,
  structuralWeights,
} from "../lib/features";
import { applyHardFilters, type FilterableProfile } from "../lib/filters";
import { lookupCity } from "../lib/geo/data";
import {
  customKeywordHits,
  scoreListing,
  trimBreakdown,
  type ScoreBreakdown,
} from "../lib/keywordScore";
import type { KeywordStats } from "../lib/keywordStats";
import { parseNoJdPenalty } from "../lib/score";
import type { Preference } from "../lib/schemas/profileSeed";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { readKeywordStats } from "./keywordStats";

const SCORE_BATCH = 50;

function toFilterProfile(profile: Doc<"profiles">): FilterableProfile {
  return {
    classYear: profile.classYear,
    degreeLevel: profile.degreeLevel,
    gradDate: profile.gradDate,
    preferences: profile.preferences as Preference[],
    interests: profile.interests as FilterableProfile["interests"],
  };
}

async function loadScoringContext(ctx: MutationCtx, profile: Doc<"profiles">) {
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

  return {
    keywordWeights: profile.keywordWeights ?? {},
    structuralWeights: structuralWeights(profile.preferences as Preference[]),
    likedCompanies,
  };
}

/** Scores the given listings and upserts matches — for every profile, or
 * only the given users (feedback learning rescopes one user). */
export const scoreListingsForUsers = internalMutation({
  args: {
    listingIds: v.array(v.id("listings")),
    userIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, { listingIds, userIds }) => {
    let profiles = await ctx.db.query("profiles").collect();
    if (userIds) {
      const wanted = new Set<string>(userIds);
      profiles = profiles.filter((p) => wanted.has(p.userId));
    }
    if (profiles.length === 0) return;
    const now = Date.now();
    const noJdPenalty = parseNoJdPenalty(process.env.NO_JD_PENALTY);
    const stats: KeywordStats = await readKeywordStats(ctx);

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
        let breakdown: ScoreBreakdown | undefined;
        if (pass) {
          const hasJd = listing.jdStatus === "fetched";
          features = buildStructuralFeatures(
            {
              ...filterListing,
              embedding: listing.embedding,
              jdStatus: listing.jdStatus,
              datePosted: listing.datePosted,
              jdExtract: listing.jdExtract as never,
            },
            {
              ...filterProfile,
              resumeEmbedding: profile.resumeEmbedding,
              skills: profile.skills,
            },
            { likedCompanies: context.likedCompanies, now, lookup: lookupCity },
          );
          const result = scoreListing({
            structural: features,
            structuralWeights: context.structuralWeights,
            listingKeywords: listing.keywords ?? {},
            customHits: customKeywordHits(
              context.keywordWeights,
              listing.title,
              hasJd ? listing.jdText : null,
            ),
            keywordWeights: context.keywordWeights,
            stats,
            hasJd,
            noJdPenalty,
          });
          rawScore = result.rawScore;
          score = result.score;
          breakdown = trimBreakdown(result.breakdown);
        }

        const existing = await ctx.db
          .query("matches")
          .withIndex("by_user_listing", (q) =>
            q.eq("userId", profile.userId).eq("listingId", listingId),
          )
          .unique();
        if (existing) {
          // replace, not patch: drops legacy fields (modelVersion) and any
          // stale breakdown when the listing is now filtered out.
          await ctx.db.replace(existing._id, {
            userId: profile.userId,
            listingId,
            droppedBy,
            features,
            rawScore,
            score,
            breakdown,
            exploration: existing.exploration,
            sentAt: existing.sentAt,
            createdAt: existing.createdAt,
          });
        } else {
          await ctx.db.insert("matches", {
            userId: profile.userId,
            listingId,
            droppedBy,
            features,
            rawScore,
            score,
            breakdown,
            exploration: false,
            createdAt: now,
          });
        }
      }
    }
  },
});

/** Full re-score: preference change, weight change, vocabulary change. */
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

/** Re-scores every active listing for one user — after their keyword
 * weights change (feedback step, settings edit, replay). */
export const rescoreUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
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
          userIds: [userId],
        });
        scored += Math.min(SCORE_BATCH, page.page.length - i);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`rescoreUser: scored ${scored} listings for ${userId}`);
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
