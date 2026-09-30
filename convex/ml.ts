import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { FEATURE_NAMES, priorWeights } from "../lib/features";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

/**
 * Everything the trainer needs, in one export: labeled/feedback rows with
 * their scored feature snapshots, per-user prior weights, and the promoted
 * model's metrics. Small by construction (≤ a few hundred rows in Phase 1).
 */
export const exportTraining = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows: {
      userId: string;
      listingId: string;
      y: number;
      split: "train" | "eval";
      source: "label" | "feedback";
      kind: string;
      exploration: boolean;
      features: Record<string, number> | null;
    }[] = [];

    const matchFeatures = async (userId: Id<"users">, listingId: Id<"listings">) => {
      const match = await ctx.db
        .query("matches")
        .withIndex("by_user_listing", (q) =>
          q.eq("userId", userId).eq("listingId", listingId),
        )
        .unique();
      if (!match || match.droppedBy !== null) return null;
      return { features: match.features, exploration: match.exploration };
    };

    for (const label of await ctx.db.query("labels").collect()) {
      const match = await matchFeatures(label.userId, label.listingId);
      rows.push({
        userId: label.userId,
        listingId: label.listingId,
        y: label.label === "good" ? 1 : 0,
        split: label.split,
        source: "label",
        kind: label.label,
        exploration: match?.exploration ?? false,
        features: match?.features ?? null,
      });
    }

    for (const entry of await ctx.db.query("feedback").collect()) {
      const positive =
        entry.kind === "applied" ||
        entry.kind === "thumbs_up" ||
        entry.kind === "good_suggestion";
      const match = await matchFeatures(entry.userId, entry.listingId);
      rows.push({
        userId: entry.userId,
        listingId: entry.listingId,
        y: positive ? 1 : 0,
        split: "train", // feedback never joins the fixed eval set
        source: "feedback",
        kind: entry.kind,
        exploration: match?.exploration ?? false,
        features: match?.features ?? null,
      });
    }

    const profiles = await ctx.db.query("profiles").collect();
    const users = profiles.map((p) => ({
      userId: p.userId,
      priorWeights: priorWeights(p.preferences as never),
    }));

    const promoted = (
      await ctx.db
        .query("models")
        .withIndex("by_promoted", (q) => q.eq("promoted", true))
        .collect()
    ).sort((a, b) => b.version - a.version)[0];

    return {
      featureNames: FEATURE_NAMES,
      rows,
      users,
      promoted: promoted
        ? { version: promoted.version, metrics: promoted.metrics }
        : null,
    };
  },
});

/** Accepts a trained model; promotes only if precision@10 doesn't regress. */
export const importModel = internalMutation({
  args: {
    featureNames: v.array(v.string()),
    globalWeights: v.array(v.float64()),
    userWeights: v.array(
      v.object({ userId: v.string(), weights: v.array(v.float64()) }),
    ),
    metrics: v.any(),
  },
  handler: async (ctx, args) => {
    if (
      args.featureNames.length !== FEATURE_NAMES.length ||
      args.featureNames.some((n, i) => n !== FEATURE_NAMES[i])
    ) {
      throw new Error(
        `feature names mismatch: got ${args.featureNames.join(",")}`,
      );
    }
    if (args.globalWeights.length !== FEATURE_NAMES.length) {
      throw new Error("globalWeights length mismatch");
    }

    const all = await ctx.db.query("models").collect();
    const version = all.reduce((max, m) => Math.max(max, m.version), 0) + 1;
    const promoted = all
      .filter((m) => m.promoted)
      .sort((a, b) => b.version - a.version)[0];

    const newP10 = Number(args.metrics?.precisionAt10 ?? 0);
    const currentP10 = Number(promoted?.metrics?.precisionAt10 ?? -1);
    const promote = newP10 >= currentP10;

    const modelId = await ctx.db.insert("models", {
      version,
      globalWeights: args.globalWeights,
      featureNames: args.featureNames,
      metrics: args.metrics,
      promoted: promote,
      createdAt: Date.now(),
    });

    for (const uw of args.userWeights) {
      const userId = ctx.db.normalizeId("users", uw.userId);
      if (!userId || uw.weights.length !== FEATURE_NAMES.length) continue;
      await ctx.db.insert("userWeights", {
        userId,
        modelVersion: version,
        weights: uw.weights,
      });
    }

    if (promote) {
      if (promoted) {
        await ctx.db.patch(promoted._id, { promoted: false });
      }
      await ctx.scheduler.runAfter(0, internal.scoring.rescoreAll, {});
    }
    console.log(
      `model v${version}: p@10=${newP10} vs current ${currentP10} → ${promote ? "promoted" : "not promoted"}`,
    );
    return { version, promoted: promote, modelId };
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
    if (rescore.length > 0) {
      await ctx.scheduler.runAfter(0, internal.scoring.scoreListingsForUsers, {
        listingIds: rescore,
      });
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
