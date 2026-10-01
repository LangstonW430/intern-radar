import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { FEATURE_NAMES, priorWeights } from "../lib/features";
import { keywordInText, type JdExtract } from "../lib/jdExtract";
import type { Interest, Preference } from "../lib/schemas/profileSeed";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";

async function resolveWeights(
  ctx: QueryCtx,
  userId: Id<"users">,
  profile: Doc<"profiles"> | null,
): Promise<number[]> {
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
  return weights;
}

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
  required_skill_coverage: "You have the required skills",
  preferred_skill_coverage: "You have preferred skills",
  interest_match: "Mentions your interests",
  avoid_match: "Mentions things you avoid",
  degree_fit: "Degree level fits",
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
    const weights = await resolveWeights(ctx, userId, profile);

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

/** Everything the expandable match panel needs — extraction sections,
 * skill matching against the profile, interest hits, facts, and a
 * plain-language score explanation. */
export const detail = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const listing = await ctx.db.get(listingId);
    if (!listing) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const match = await ctx.db
      .query("matches")
      .withIndex("by_user_listing", (q) =>
        q.eq("userId", userId).eq("listingId", listingId),
      )
      .unique();

    const hasJd = listing.jdStatus === "fetched";
    const extract = (hasJd ? listing.jdExtract : null) as JdExtract | null;
    const userSkills = (profile?.skills ?? []).map((s) => s.trim());
    const userSkillSet = new Set(userSkills.map((s) => s.toLowerCase()));

    const jdSkills = extract?.skills ?? [];
    const requiredSkills = extract?.requiredSkills ?? [];
    const matchedSkills = jdSkills.filter((s) =>
      userSkillSet.has(s.toLowerCase()),
    );
    const missingRequired = requiredSkills.filter(
      (s) => !userSkillSet.has(s.toLowerCase()),
    );
    const preferredSkills = (extract?.preferredSkills ?? []).map((s) => ({
      name: s,
      have: userSkillSet.has(s.toLowerCase()),
    }));

    const interestText = `${listing.title}\n${listing.jdText ?? ""}`;
    const interestHits = ((profile?.interests ?? []) as Interest[])
      .filter((i) => i.strength !== "ignore")
      .map((i) => ({
        keyword: i.keyword,
        tag: i.tag,
        hit: keywordInText(i.keyword, interestText),
      }))
      .filter((i) => i.hit);

    // One line: the top contributors by |feature × weight|, excluding bias.
    let whyScore: string | null = null;
    if (match && match.droppedBy === null) {
      const weights = await resolveWeights(ctx, userId, profile);
      const top = FEATURE_NAMES.map((name, i) => ({
        name,
        contribution: (match.features[name] ?? 0) * weights[i],
      }))
        .filter((f) => f.name !== "bias" && Math.abs(f.contribution) > 0.15)
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 3)
        .map((f) => FACTOR_LABELS[f.name] ?? f.name);
      whyScore =
        top.length > 0
          ? `Scored ${(match.score * 100).toFixed(0)} mainly on: ${top.join("; ").toLowerCase()}`
          : `Scored ${(match.score * 100).toFixed(0)} with no single dominant factor`;
    }

    return {
      url: listing.url,
      hasJd,
      matchedSkills,
      missingRequired,
      preferredSkills,
      interestHits,
      requirements: extract?.requirements ?? [],
      preferred: extract?.preferred ?? [],
      responsibilities: (extract?.responsibilities ?? []).slice(0, 5),
      facts: extract?.facts ?? null,
      whyScore,
    };
  },
});
