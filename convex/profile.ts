import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
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
      return { userId, created: false, resumeChanged };
    }

    await ctx.db.insert("profiles", {
      userId,
      ...fields,
      resumeText: args.resumeText,
    });
    return { userId, created: true, resumeChanged: args.resumeText !== undefined };
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
