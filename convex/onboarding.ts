import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  applyInterestChange,
  initialKeywordWeights,
} from "../lib/keywordWeights";
import { SCORING_CONFIG } from "../lib/scoringConfig";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { interestValidator, preferenceValidator } from "./schema";

export const generateResumeUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    return await ctx.storage.generateUploadUrl();
  },
});

export const complete = mutation({
  args: {
    gradDate: v.string(),
    classYear: v.string(),
    degreeLevel: v.string(),
    preferences: v.array(preferenceValidator),
    skills: v.optional(v.array(v.string())),
    interests: v.optional(v.array(interestValidator)),
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
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const user = await ctx.db.get(userId);
    if (!user?.email) throw new Error("Account has no email");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.gradDate)) {
      throw new Error("gradDate must be YYYY-MM");
    }
    if (args.threshold < 0 || args.threshold > 1) {
      throw new Error("threshold must be between 0 and 1");
    }
    if (args.wildcards < 0 || args.wildcards > 10) {
      throw new Error("wildcards must be between 0 and 10");
    }

    const fields = {
      email: user.email,
      gradDate: args.gradDate,
      classYear: args.classYear,
      degreeLevel: args.degreeLevel,
      preferences: args.preferences,
      skills: args.skills ?? [],
      interests: args.interests ?? [],
      threshold: args.threshold,
      frequency: args.frequency,
      wildcards: args.wildcards,
      subscribed: true,
    };

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      const resumeChanged =
        args.resumeText !== undefined &&
        args.resumeText !== existing.resumeText;
      await ctx.db.patch(existing._id, {
        ...fields,
        keywordWeights: applyInterestChange(
          existing.keywordWeights ?? {},
          existing.interests ?? [],
          args.interests ?? [],
          SCORING_CONFIG,
        ),
        ...(args.resumeText !== undefined
          ? { resumeText: args.resumeText }
          : {}),
        ...(resumeChanged
          ? { resumeEmbedding: undefined, preferenceVector: undefined }
          : {}),
      });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        ...fields,
        keywordWeights: initialKeywordWeights(
          args.interests ?? [],
          SCORING_CONFIG,
        ),
        resumeText: args.resumeText,
      });
    }
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
    return { ok: true };
  },
});
