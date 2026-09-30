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

export const listingFieldsValidator = {
  sourceId: v.string(),
  company: v.string(),
  title: v.string(),
  category: v.string(),
  categoryRaw: v.string(),
  locations: v.array(v.string()),
  geo: v.optional(
    v.array(v.object({ lat: v.float64(), lon: v.float64(), name: v.string() })),
  ),
  remoteType: v.string(),
  sponsorship: v.string(),
  degrees: v.array(v.string()),
  url: v.string(),
  atsType: v.string(),
  atsRef: v.object({
    account: v.optional(v.string()),
    jobId: v.optional(v.string()),
  }),
  datePosted: v.number(),
  dateUpdated: v.number(),
  active: v.boolean(),
  raw: v.any(),
  contentHash: v.string(),
};

export default defineSchema({
  ...authTables,

  listings: defineTable({
    ...listingFieldsValidator,
    jdStatus: v.union(
      v.literal("pending"),
      v.literal("fetched"),
      v.literal("failed"),
      v.literal("unsupported"),
    ),
    jdSource: v.optional(v.string()),
    jdText: v.optional(v.string()),
    jdFetchedAt: v.optional(v.number()),
    jdError: v.optional(v.string()),
    jdAttempts: v.number(),
    ingestedAt: v.number(),
    embedPending: v.boolean(),
    embedding: v.optional(v.array(v.float64())),
    embeddingVersion: v.optional(v.string()),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_active", ["active"])
    .index("by_jdStatus", ["jdStatus"])
    .index("by_embedPending", ["embedPending"]),

  // Compact sourceId → contentHash map so hourly diffs never read full
  // listing documents (bandwidth budget in PLAN.md A5).
  ingestIndex: defineTable({
    chunk: v.number(),
    entries: v.array(
      v.object({ sourceId: v.string(), contentHash: v.string() }),
    ),
  }).index("by_chunk", ["chunk"]),

  ingestState: defineTable({
    lastCommitSha: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastNewCount: v.optional(v.number()),
    lastMalformedCount: v.optional(v.number()),
  }),

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
