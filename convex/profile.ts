import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  applyInterestChange,
  removeKeywordWeight as removeKeyword,
  resetLearnedWeights as resetLearned,
  setUserWeight,
} from "../lib/keywordWeights";
import { SCORING_CONFIG } from "../lib/scoringConfig";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { interestValidator, preferenceValidator } from "./schema";

export const upsertFromSeed = internalMutation({
  args: {
    email: v.string(),
    gradDate: v.string(),
    classYear: v.string(),
    degreeLevel: v.string(),
    preferences: v.array(preferenceValidator),
    threshold: v.number(),
    frequency: v.union(
      v.literal("instant"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    wildcards: v.number(),
    resumeText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    const userId = user?._id ?? (await ctx.db.insert("users", { email }));

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const fields = {
      email,
      gradDate: args.gradDate,
      classYear: args.classYear,
      degreeLevel: args.degreeLevel,
      preferences: args.preferences,
      threshold: args.threshold,
      frequency: args.frequency,
      wildcards: args.wildcards,
    };

    if (existing) {
      const resumeChanged =
        args.resumeText !== undefined &&
        args.resumeText !== existing.resumeText;
      await ctx.db.patch(existing._id, {
        ...fields,
        ...(args.resumeText !== undefined
          ? { resumeText: args.resumeText }
          : {}),
        // Stale vectors must not outlive the text they were computed from;
        // the ML job regenerates them on its next run.
        ...(resumeChanged
          ? { resumeEmbedding: undefined, preferenceVector: undefined }
          : {}),
      });
      // Preferences may have changed — re-score everything against them.
      await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
      return { userId, created: false, resumeChanged };
    }

    await ctx.db.insert("profiles", {
      userId,
      ...fields,
      resumeText: args.resumeText,
    });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
    return { userId, created: true, resumeChanged: args.resumeText !== undefined };
  },
});

export const updateSettings = mutation({
  args: {
    preferences: v.array(preferenceValidator),
    threshold: v.number(),
    frequency: v.union(
      v.literal("instant"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    wildcards: v.number(),
    subscribed: v.optional(v.boolean()),
    skills: v.optional(v.array(v.string())),
    interests: v.optional(v.array(interestValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    if (args.threshold < 0 || args.threshold > 1) {
      throw new Error("threshold must be between 0 and 1");
    }
    if (args.wildcards < 0 || args.wildcards > 10) {
      throw new Error("wildcards must be between 0 and 10");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No profile yet — seed it first");
    await ctx.db.patch(profile._id, {
      preferences: args.preferences,
      threshold: args.threshold,
      frequency: args.frequency,
      wildcards: args.wildcards,
      ...(args.subscribed !== undefined ? { subscribed: args.subscribed } : {}),
      ...(args.skills !== undefined ? { skills: args.skills } : {}),
      ...(args.interests !== undefined
        ? {
            interests: args.interests,
            keywordWeights: applyInterestChange(
              profile.keywordWeights ?? {},
              profile.interests ?? [],
              args.interests,
              SCORING_CONFIG,
            ),
          }
        : {}),
    });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
  },
});

/** Settings edit of one keyword weight: becomes the user's anchor. */
export const updateKeywordWeight = mutation({
  args: { keywordId: v.string(), weight: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    if (!Number.isFinite(args.weight)) throw new Error("weight must be finite");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No profile yet");
    await ctx.db.patch(profile._id, {
      keywordWeights: setUserWeight(
        profile.keywordWeights ?? {},
        args.keywordId,
        args.weight,
        SCORING_CONFIG,
      ),
    });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
  },
});

export const removeKeywordWeight = mutation({
  args: { keywordId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No profile yet");
    await ctx.db.patch(profile._id, {
      keywordWeights: removeKeyword(
        profile.keywordWeights ?? {},
        args.keywordId,
      ),
    });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
  },
});

/** Discards everything feedback has learned: weights return to their
 * anchors and learned-only keywords disappear. */
export const resetLearnedWeights = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No profile yet");
    await ctx.db.patch(profile._id, {
      keywordWeights: resetLearned(profile.keywordWeights ?? {}),
    });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
  },
});

/** Deletes the account and all its data: profile, matches, feedback,
 * labels, user weights, and auth records. Irreversible. */
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_user_listing", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of matches) await ctx.db.delete(doc._id);

    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of feedback) await ctx.db.delete(doc._id);

    const labels = await ctx.db
      .query("labels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of labels) await ctx.db.delete(doc._id);

    const weights = await ctx.db
      .query("userWeights")
      .withIndex("by_user_version", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of weights) await ctx.db.delete(doc._id);

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile) await ctx.db.delete(profile._id);

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    await ctx.db.delete(userId);
    return { ok: true };
  },
});

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});
