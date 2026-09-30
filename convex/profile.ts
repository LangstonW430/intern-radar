import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { preferenceValidator } from "./schema";

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
    });
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
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
