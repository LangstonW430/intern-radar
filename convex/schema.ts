import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const strengthValidator = v.union(
  v.literal("hard"),
  v.literal("strong"),
  v.literal("soft"),
  v.literal("ignore"),
);

export const preferenceValidator = v.union(
  v.object({
    type: v.literal("location"),
    value: v.object({
      places: v.array(v.string()),
      radiusMiles: v.optional(v.number()),
    }),
    strength: strengthValidator,
  }),
  v.object({
    type: v.literal("workMode"),
    value: v.array(v.string()),
    strength: strengthValidator,
  }),
  v.object({
    type: v.literal("roleCategory"),
    value: v.array(v.string()),
    strength: strengthValidator,
  }),
  v.object({
    type: v.literal("sponsorship"),
    value: v.string(),
    strength: strengthValidator,
  }),
  v.object({
    type: v.literal("classYear"),
    value: v.literal("exclude_mismatched"),
    strength: strengthValidator,
  }),
  v.object({
    type: v.literal("degreeLevel"),
    value: v.literal("exclude_mismatched"),
    strength: strengthValidator,
  }),
  v.object({
    type: v.literal("excludeCompanies"),
    value: v.array(v.string()),
    strength: strengthValidator,
  }),
);

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    gradDate: v.string(), // YYYY-MM
    classYear: v.string(),
    degreeLevel: v.string(),
    preferences: v.array(preferenceValidator),
    resumeText: v.optional(v.string()),
    resumeEmbedding: v.optional(v.array(v.float64())),
    preferenceVector: v.optional(v.array(v.float64())),
    threshold: v.number(),
    frequency: v.union(
      v.literal("instant"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    wildcards: v.number(),
    lastDigestAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),
});
