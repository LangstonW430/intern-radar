import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  dominantFactors,
  FACTOR_LABELS,
  topPositiveFactors,
} from "../lib/breakdownView";
import { keywordInText, type JdExtract } from "../lib/jdExtract";
import { agePenalty } from "../lib/keywordScore";
import type { Interest } from "../lib/schemas/profileSeed";
import { keywordDisplayName } from "../lib/vocabulary";
import { query } from "./_generated/server";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    // The top-scored window. Dropped matches score exactly 0, so the
    // descending index yields live rows first; reading much deeper would
    // blow the per-query read budget on listings' JD text.
    const max = Math.min(limit ?? 300, 300);

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
      .take(330);

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
        jdStatus: listing.jdStatus,
        category: listing.category,
        remoteType: listing.remoteType,
        datePosted: listing.datePosted,
        exploration: match.exploration,
        topFactors: topPositiveFactors(match.breakdown),
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

    // One line: the top contributors by |contribution|, from the stored
    // breakdown — the same numbers the score was built from.
    let whyScore: string | null = null;
    const scored = match && match.droppedBy === null ? match : null;
    if (scored?.breakdown) {
      const top = dominantFactors(scored.breakdown);
      whyScore =
        top.length > 0
          ? `Scored ${(scored.score * 100).toFixed(0)} mainly on: ${top.join("; ").toLowerCase()}`
          : `Scored ${(scored.score * 100).toFixed(0)} with no single dominant factor`;
    }

    // The full stored breakdown in display form, for the contributions panel.
    const breakdown = scored?.breakdown
      ? {
          bias: scored.breakdown.bias,
          keywordOther: scored.breakdown.keywordOther,
          keywords: scored.breakdown.keywords.map((k) => ({
            name: keywordDisplayName(k.id),
            weight: k.weight,
            idf: k.idf,
            position: k.position,
            contribution: k.contribution,
          })),
          structural: scored.breakdown.structural.map((s) => ({
            label: FACTOR_LABELS[s.name] ?? s.name,
            value: s.value,
            weight: s.weight,
            contribution: s.contribution,
          })),
        }
      : null;

    // Post-model multipliers, computed live so the panel can explain the
    // gap between the model probability and the displayed score.
    const ageDays = Math.max(0, (Date.now() - listing.datePosted) / 86_400_000);
    const appliedAgePenalty = agePenalty(ageDays);

    return {
      url: listing.url,
      hasJd,
      jdStatus: listing.jdStatus,
      agePenalty: appliedAgePenalty < 1 ? appliedAgePenalty : null,
      matchedSkills,
      missingRequired,
      preferredSkills,
      interestHits,
      requirements: extract?.requirements ?? [],
      preferred: extract?.preferred ?? [],
      responsibilities: (extract?.responsibilities ?? []).slice(0, 5),
      facts: extract?.facts ?? null,
      whyScore,
      breakdown,
    };
  },
});
