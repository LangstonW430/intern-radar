import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { buildJdExtract, JD_EXTRACT_VERSION } from "../lib/jdExtract";
import { extractKeywords, VOCABULARY_VERSION } from "../lib/vocabulary";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  applyStatsTransitions,
  listingContribution,
  type StatsTransition,
} from "./keywordStats";

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

/** Fetched JD texts for offline vocabulary mining (scripts/vocab-candidates). */
export const exportJdTexts = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_jdStatus", (q) => q.eq("jdStatus", "fetched"))
      .paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map((l) => ({
        listingId: l._id,
        title: l.title,
        jdText: l.jdText ?? null,
      })),
    };
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
    const rescore: Id<"listings">[] = [];
    const transitions: StatsTransition[] = [];
    for (const item of items) {
      const id = ctx.db.normalizeId("listings", item.listingId);
      if (!id) continue;
      const listing = await ctx.db.get(id);
      if (!listing) continue;
      if (item.jdStatus === "fetched") {
        const keywords = extractKeywords(listing.title, item.jdText ?? null);
        transitions.push({
          before: listingContribution(listing),
          after: {
            contributes: listing.active,
            keywordIds: Object.keys(keywords),
          },
        });
        await ctx.db.patch(id, {
          jdStatus: "fetched",
          jdSource: item.jdSource,
          jdText: item.jdText,
          jdExtract: item.jdText ? buildJdExtract(item.jdText) : undefined,
          jdFetchedAt: now,
          jdError: undefined,
          keywords,
          keywordsVersion: VOCABULARY_VERSION,
          // The embedding text just changed from title-only to full JD.
          embedPending: true,
        });
        rescore.push(id);
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
    await applyStatsTransitions(ctx, transitions);
    if (rescore.length > 0) {
      await ctx.scheduler.runAfter(0, internal.scoring.scoreListingsForUsers, {
        listingIds: rescore,
      });
    }
    return { applied };
  },
});

/** Recomputes jdExtract for every fetched listing (new dictionary or
 * extractor version). Safe to re-run; skips docs already on the current
 * version unless force is set. */
export const backfillJdExtracts = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    let cursor: string | null = null;
    let updated = 0;
    for (;;) {
      const page: {
        page: { listingId: Id<"listings">; jdText: string | null; extractVersion: number | null }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.ml.listFetchedJdPage, { cursor });
      const items = page.page
        .filter(
          (l) =>
            l.jdText &&
            (force || l.extractVersion !== JD_EXTRACT_VERSION),
        )
        .map((l) => ({
          listingId: l.listingId,
          jdExtract: buildJdExtract(l.jdText!),
        }));
      for (let i = 0; i < items.length; i += 50) {
        await ctx.runMutation(internal.ml.patchJdExtracts, {
          items: items.slice(i, i + 50),
        });
        updated += Math.min(50, items.length - i);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`backfillJdExtracts: updated ${updated} listings`);
  },
});

export const listFetchedJdPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_jdStatus", (q) => q.eq("jdStatus", "fetched"))
      .paginate({ numItems: 100, cursor });
    return {
      ...page,
      page: page.page.map((l) => ({
        listingId: l._id,
        jdText: l.jdText ?? null,
        extractVersion:
          (l.jdExtract as { version?: number } | undefined)?.version ?? null,
      })),
    };
  },
});

export const patchJdExtracts = internalMutation({
  args: {
    items: v.array(
      v.object({ listingId: v.id("listings"), jdExtract: v.any() }),
    ),
  },
  handler: async (ctx, { items }) => {
    for (const item of items) {
      await ctx.db.patch(item.listingId, { jdExtract: item.jdExtract });
    }
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
    const rescore: Id<"listings">[] = [];
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
      rescore.push(id);
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
      // A new resume vector invalidates every similarity — full re-score.
      await ctx.scheduler.runAfter(0, internal.scoring.updatePreferenceVector, {
        userId,
      });
      await ctx.scheduler.runAfter(1000, internal.scoring.rescoreAll, {});
      applied++;
    }
    if (rescore.length > 0) {
      await ctx.scheduler.runAfter(0, internal.scoring.scoreListingsForUsers, {
        listingIds: rescore,
      });
    }
    return { applied };
  },
});
