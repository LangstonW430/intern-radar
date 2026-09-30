import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { FEATURE_NAMES, priorWeights } from "../lib/features";
import type { Preference } from "../lib/schemas/profileSeed";
import { query } from "./_generated/server";

const FACTOR_LABELS: Record<string, string> = {
  embed_sim_resume: "Similar to your resume",
  embed_sim_pref: "Matches what you've liked",
  loc_proximity: "Near your preferred location",
  work_mode_match: "Work mode fits",
  role_category_match: "Role category fits",
  sponsorship_match: "Sponsorship fits",
  class_year_signal: "Class year fits",
  company_affinity: "Company you've engaged with before",
  recency: "Recently posted",
  has_jd: "Full description available",
};

function topFactors(
  features: Record<string, number>,
  weights: number[],
): string[] {
  return FEATURE_NAMES.map((name, i) => ({
    name,
    contribution: (features[name] ?? 0) * weights[i],
  }))
    .filter((f) => f.name !== "bias" && f.contribution > 0.2)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((f) => FACTOR_LABELS[f.name] ?? f.name);
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const max = Math.min(limit ?? 50, 100);

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const promoted = (
      await ctx.db
        .query("models")
        .withIndex("by_promoted", (q) => q.eq("promoted", true))
        .collect()
    ).sort((a, b) => b.version - a.version)[0];
    let weights = profile
      ? priorWeights(profile.preferences as Preference[])
      : new Array(FEATURE_NAMES.length).fill(0);
    if (promoted) {
      const userWeights = await ctx.db
        .query("userWeights")
        .withIndex("by_user_version", (q) =>
          q.eq("userId", userId).eq("modelVersion", promoted.version),
        )
        .unique();
      weights = userWeights?.weights ?? promoted.globalWeights;
    }

    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const feedbackByListing = new Map<string, string[]>();
    for (const entry of feedback) {
      const kinds = feedbackByListing.get(entry.listingId) ?? [];
      kinds.push(entry.kind);
      feedbackByListing.set(entry.listingId, kinds);
    }

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_user_score", (q) => q.eq("userId", userId))
      .order("desc")
      .take(300);

    const rows = [];
    for (const match of matches) {
      if (rows.length >= max) break;
      if (match.droppedBy !== null) continue;
      const listing = await ctx.db.get(match.listingId);
      if (!listing || !listing.active) continue;
      rows.push({
        matchId: match._id,
        listingId: match.listingId,
        company: listing.company,
        title: listing.title,
        url: listing.url,
        locations: listing.locations,
        score: match.score,
        hasJd: listing.jdStatus === "fetched",
        datePosted: listing.datePosted,
        exploration: match.exploration,
        topFactors: topFactors(match.features, weights),
        myFeedback: feedbackByListing.get(match.listingId) ?? [],
      });
    }
    return rows;
  },
});
