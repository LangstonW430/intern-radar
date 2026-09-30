import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

/** Profiles eligible for a digest right now, with their settings. */
export const listProfiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    return profiles.map((p) => ({
      userId: p.userId,
      email: p.email,
      threshold: p.threshold,
      frequency: p.frequency,
      wildcards: p.wildcards,
      subscribed: p.subscribed !== false, // undefined = subscribed
      lastDigestAt: p.lastDigestAt,
    }));
  },
});

export const setSubscribed = internalMutation({
  args: { userId: v.id("users"), subscribed: v.boolean() },
  handler: async (ctx, { userId, subscribed }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("no profile for user");
    await ctx.db.patch(profile._id, { subscribed });
  },
});

/**
 * Unsent, surviving matches created since the last digest, joined with
 * listing display fields. Bounded by the since-window so hourly ticks stay
 * cheap (PLAN.md A5).
 */
export const candidates = internalQuery({
  args: { userId: v.id("users"), since: v.optional(v.number()) },
  handler: async (ctx, { userId, since }) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_user_created", (q) =>
        since === undefined
          ? q.eq("userId", userId)
          : q.eq("userId", userId).gt("createdAt", since),
      )
      .collect();

    const rows = [];
    for (const match of matches) {
      if (match.sentAt !== undefined || match.droppedBy !== null) continue;
      const listing = await ctx.db.get(match.listingId);
      if (!listing || !listing.active) continue;
      rows.push({
        matchId: match._id,
        listingId: match.listingId,
        score: match.score,
        title: listing.title,
        company: listing.company,
        locations: listing.locations.join(" · "),
        url: listing.url,
        hasJd: listing.jdStatus === "fetched",
      });
    }
    return rows;
  },
});

export const markSent = internalMutation({
  args: {
    userId: v.id("users"),
    matchIds: v.array(v.id("matches")),
    explorationIds: v.array(v.id("matches")),
    now: v.number(),
  },
  handler: async (ctx, { userId, matchIds, explorationIds, now }) => {
    const exploration = new Set(explorationIds);
    for (const matchId of matchIds) {
      await ctx.db.patch(matchId, {
        sentAt: now,
        ...(exploration.has(matchId) ? { exploration: true } : {}),
      });
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, { lastDigestAt: now });
    }
  },
});

/** Records email-link feedback exactly once per (user, listing, kind). */
export const recordEmailFeedback = internalMutation({
  args: {
    userId: v.id("users"),
    listingId: v.id("listings"),
    kind: v.union(
      v.literal("applied"),
      v.literal("thumbs_up"),
      v.literal("thumbs_down"),
      v.literal("good_suggestion"),
      v.literal("bad_suggestion"),
    ),
  },
  handler: async (ctx, { userId, listingId, kind }) => {
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_user_listing", (q) =>
        q.eq("userId", userId).eq("listingId", listingId),
      )
      .collect();
    if (existing.some((f) => f.kind === kind && f.source === "email")) {
      return { duplicate: true };
    }
    await ctx.db.insert("feedback", {
      userId,
      listingId,
      kind,
      source: "email",
      createdAt: Date.now(),
    });
    if (kind === "applied" || kind === "thumbs_up" || kind === "thumbs_down") {
      await ctx.scheduler.runAfter(0, internal.scoring.updatePreferenceVector, {
        userId,
      });
    }
    return { duplicate: false };
  },
});
