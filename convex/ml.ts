import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const MAX_JD_ATTEMPTS = 5;

/** Listings whose JD still needs fetching (strictly incremental export). */
export const exportJdPending = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_jdStatus", (q) => q.eq("jdStatus", "pending"))
      .paginate(paginationOpts);
    return {
      ...page,
      page: page.page
        .filter((l) => l.jdAttempts < MAX_JD_ATTEMPTS && l.active)
        .map((l) => ({
          listingId: l._id,
          url: l.url,
          atsType: l.atsType,
          atsRef: l.atsRef,
          jdAttempts: l.jdAttempts,
        })),
    };
  },
});

/** Listings whose stored embedding doesn't match their current text. */
export const exportEmbedPending = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_embedPending", (q) => q.eq("embedPending", true))
      .paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map((l) => ({
        listingId: l._id,
        title: l.title,
        company: l.company,
        category: l.category,
        jdText: l.jdText ?? null,
      })),
    };
  },
});

/** Profiles with resume text but no (current) resume embedding. */
export const exportResumesPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    return profiles
      .filter((p) => p.resumeText && !p.resumeEmbedding)
      .map((p) => ({ userId: p.userId, resumeText: p.resumeText! }));
  },
});

export const importJdBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        listingId: v.string(),
        jdStatus: v.union(
          v.literal("fetched"),
          v.literal("failed"),
          v.literal("unsupported"),
        ),
        jdSource: v.optional(v.string()),
        jdText: v.optional(v.string()),
        jdError: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const now = Date.now();
    let applied = 0;
    for (const item of items) {
      const id = ctx.db.normalizeId("listings", item.listingId);
      if (!id) continue;
      const listing = await ctx.db.get(id);
      if (!listing) continue;
      if (item.jdStatus === "fetched") {
        await ctx.db.patch(id, {
          jdStatus: "fetched",
          jdSource: item.jdSource,
          jdText: item.jdText,
          jdFetchedAt: now,
          jdError: undefined,
          // The embedding text just changed from title-only to full JD.
          embedPending: true,
        });
      } else if (item.jdStatus === "failed") {
        await ctx.db.patch(id, {
          jdStatus: listing.jdAttempts + 1 >= 5 ? "failed" : "pending",
          jdAttempts: listing.jdAttempts + 1,
          jdError: item.jdError,
          jdFetchedAt: now,
        });
      } else {
        await ctx.db.patch(id, {
          jdStatus: "unsupported",
          jdError: item.jdError,
        });
      }
      applied++;
    }
    return { applied };
  },
});

export const importEmbeddingsBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        listingId: v.string(),
        embedding: v.array(v.float64()),
        embeddingVersion: v.string(),
      }),
    ),
    resumes: v.array(
      v.object({
        userId: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, { items, resumes }) => {
    let applied = 0;
    for (const item of items) {
      const id = ctx.db.normalizeId("listings", item.listingId);
      if (!id) continue;
      const listing = await ctx.db.get(id);
      if (!listing) continue;
      await ctx.db.patch(id, {
        embedding: item.embedding,
        embeddingVersion: item.embeddingVersion,
        embedPending: false,
      });
      applied++;
    }
    for (const resume of resumes) {
      const userId = ctx.db.normalizeId("users", resume.userId);
      if (!userId) continue;
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (!profile) continue;
      await ctx.db.patch(profile._id, {
        resumeEmbedding: resume.embedding,
        // Until feedback exists, the preference vector is the resume itself.
        ...(profile.preferenceVector
          ? {}
          : { preferenceVector: resume.embedding }),
      });
      applied++;
    }
    return { applied };
  },
});
