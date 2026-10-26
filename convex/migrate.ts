import { v } from "convex/values";
import { buildJdExtract, JD_EXTRACT_VERSION } from "../lib/jdExtract";
import { JD_MAX_CHARS, trimJdText } from "../lib/jdTrim";
import { initialKeywordWeights } from "../lib/keywordWeights";
import { embedFeatureEnabled, SCORING_CONFIG } from "../lib/scoringConfig";
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
import { stripListing } from "./prune";

/**
 * One-shot migrations for the keyword-weight model, run manually with
 * `npx convex run` (same paginated action/query/mutation shape as
 * ml:backfillJdExtracts). Safe to re-run; version-gated unless forced.
 */

/** Recomputes listing keywords for every listing not on the current
 * vocabulary version, then rebuilds the keyword stats from scratch. */
export const backfillListingKeywords = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    let cursor: string | null = null;
    let updated = 0;
    for (;;) {
      const page: {
        page: {
          listingId: Id<"listings">;
          title: string;
          jdText: string | null;
          jdStatus: string;
          keywordsVersion: number | null;
        }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrate.listKeywordBackfillPage, {
        cursor,
      });
      const items = page.page
        .filter((l) => force || l.keywordsVersion !== VOCABULARY_VERSION)
        .map((l) => ({
          listingId: l.listingId,
          keywords: extractKeywords(
            l.title,
            l.jdStatus === "fetched" ? l.jdText : null,
          ),
        }));
      for (let i = 0; i < items.length; i += 50) {
        await ctx.runMutation(internal.migrate.patchKeywordsBatch, {
          items: items.slice(i, i + 50),
        });
        updated += Math.min(50, items.length - i);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    // Incremental stats can't survive a bulk rewrite — recount, then
    // replay every user's weights against the new vocabulary and IDFs.
    await ctx.runAction(internal.keywordStats.rebuild, {});
    if (updated > 0) {
      await ctx.runMutation(internal.keywordLearn.replayAll, {});
    }
    console.log(`backfillListingKeywords: updated ${updated} listings`);
  },
});

/** Gives every profile interest-derived keyword weights. Skips profiles
 * that already have a map unless forced (force discards learning). */
export const initKeywordWeights = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    const profiles = await ctx.db.query("profiles").collect();
    let updated = 0;
    for (const profile of profiles) {
      if (profile.keywordWeights !== undefined && !force) continue;
      await ctx.db.patch(profile._id, {
        keywordWeights: initialKeywordWeights(
          profile.interests ?? [],
          SCORING_CONFIG,
        ),
      });
      // Fold any pre-existing feedback into the fresh map.
      await ctx.scheduler.runAfter(0, internal.keywordLearn.replay, {
        userId: profile.userId,
      });
      updated++;
    }
    console.log(`initKeywordWeights: initialized ${updated} profiles`);
  },
});

export const listKeywordBackfillPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 100, cursor });
    return {
      ...page,
      page: page.page.map((l) => ({
        listingId: l._id,
        title: l.title,
        jdText: l.jdText ?? null,
        jdStatus: l.jdStatus,
        keywordsVersion: l.keywordsVersion ?? null,
      })),
    };
  },
});

export const patchKeywordsBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        listingId: v.id("listings"),
        keywords: v.record(v.string(), v.float64()),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    for (const item of items) {
      await ctx.db.patch(item.listingId, {
        keywords: item.keywords,
        keywordsVersion: VOCABULARY_VERSION,
      });
    }
  },
});

// ------------------------------------------------------------------ status

interface MigrateStatusSummary {
  profiles: number;
  profilesWithKeywordWeights: number;
  keywordStats: { totalWithJd: number; distinctKeywords: number } | null;
  scheduledPending: number;
  scheduledPendingNames: string[];
}

/** Migration progress/health report: paginated counts over listings and
 * matches, small-table summaries, and the scheduler backlog — so a
 * migration run can be watched to completion without guessing from logs. */
export const status = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const listings = {
      total: 0,
      active: 0,
      fetchedJd: 0,
      withKeywords: 0,
      onCurrentVocabVersion: 0,
    };
    let cursor: string | null = null;
    for (;;) {
      const page: {
        page: {
          active: boolean;
          jdStatus: string;
          hasKeywords: boolean;
          keywordsVersion: number | null;
        }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrate.statusListingsPage, { cursor });
      for (const l of page.page) {
        listings.total++;
        if (l.active) listings.active++;
        if (l.jdStatus === "fetched") listings.fetchedJd++;
        if (l.hasKeywords) listings.withKeywords++;
        if (l.keywordsVersion === VOCABULARY_VERSION) {
          listings.onCurrentVocabVersion++;
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const matches = {
      total: 0,
      withBreakdown: 0,
      withLegacyModelVersion: 0,
      dropped: 0,
    };
    cursor = null;
    for (;;) {
      const page: {
        page: {
          hasBreakdown: boolean;
          hasModelVersion: boolean;
          dropped: boolean;
        }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrate.statusMatchesPage, { cursor });
      for (const m of page.page) {
        matches.total++;
        if (m.hasBreakdown) matches.withBreakdown++;
        if (m.hasModelVersion) matches.withLegacyModelVersion++;
        if (m.dropped) matches.dropped++;
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const summary: MigrateStatusSummary = await ctx.runQuery(
      internal.migrate.statusSummary,
      {},
    );
    const report = { listings, matches, ...summary };
    console.log(JSON.stringify(report, null, 2));
    return report;
  },
});

export const statusListingsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 200, cursor });
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: page.page.map((l) => ({
        active: l.active,
        jdStatus: l.jdStatus,
        hasKeywords: l.keywords !== undefined,
        keywordsVersion: l.keywordsVersion ?? null,
      })),
    };
  },
});

export const statusMatchesPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("matches")
      .paginate({ numItems: 300, cursor });
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: page.page.map((m) => ({
        hasBreakdown: m.breakdown !== undefined,
        hasModelVersion: m.modelVersion !== undefined,
        dropped: m.droppedBy !== null,
      })),
    };
  },
});

export const statusSummary = internalQuery({
  args: {},
  handler: async (ctx): Promise<MigrateStatusSummary> => {
    const profiles = await ctx.db.query("profiles").collect();
    const stats = await ctx.db.query("keywordStats").first();
    // Recent entries cover anything our migrations scheduled; completed
    // history can be large, so only the newest slice is scanned.
    const recentScheduled = await ctx.db.system
      .query("_scheduled_functions")
      .order("desc")
      .take(500);
    const pending = recentScheduled.filter(
      (s) => s.state.kind === "pending" || s.state.kind === "inProgress",
    );
    return {
      profiles: profiles.length,
      profilesWithKeywordWeights: profiles.filter(
        (p) => p.keywordWeights !== undefined,
      ).length,
      keywordStats: stats
        ? {
            totalWithJd: stats.totalWithJd,
            distinctKeywords: Object.keys(stats.df).length,
          }
        : null,
      scheduledPending: pending.length,
      scheduledPendingNames: [...new Set(pending.map((s) => s.name))],
    };
  },
});

/**
 * One-shot storage shrink (safe to re-run). Inactive listings are stripped
 * immediately (prune.ts does this on a 14-day delay going forward) and their
 * matches deleted. Active listings lose the legacy raw feed copy and, while
 * embed_sim_resume is off, their embedding; JD text over JD_MAX_CHARS is
 * trimmed and the extract rebuilt without section bullets, with keywords and
 * keyword stats kept consistent with the stored text.
 */
export const shrinkListings = internalAction({
  args: {},
  handler: async (ctx) => {
    let cursor: string | null = null;
    const totals = { stripped: 0, slimmed: 0 };
    for (;;) {
      const page: {
        page: Id<"listings">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrate.listListingIdsPage, { cursor });
      for (let i = 0; i < page.page.length; i += 25) {
        const result: { stripped: number; slimmed: number } =
          await ctx.runMutation(internal.migrate.shrinkListingsBatch, {
            listingIds: page.page.slice(i, i + 25),
          });
        totals.stripped += result.stripped;
        totals.slimmed += result.slimmed;
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`shrinkListings: ${JSON.stringify(totals)}`);
    return totals;
  },
});

export const listListingIdsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 200, cursor });
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: page.page.map((l) => l._id),
    };
  },
});

export const shrinkListingsBatch = internalMutation({
  args: { listingIds: v.array(v.id("listings")) },
  handler: async (ctx, { listingIds }) => {
    const now = Date.now();
    const keepEmbeddings = embedFeatureEnabled();
    const transitions: StatsTransition[] = [];
    let stripped = 0;
    let slimmed = 0;
    for (const id of listingIds) {
      const listing = await ctx.db.get(id);
      if (!listing) continue;

      if (!listing.active) {
        if (listing.prunedAt === undefined) {
          await stripListing(ctx, listing, now);
          stripped++;
        }
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (listing.raw !== undefined) patch.raw = undefined;
      if (!keepEmbeddings && listing.embedding !== undefined) {
        patch.embedding = undefined;
        patch.embeddingVersion = undefined;
        patch.embedPending = true;
      }
      const extractVersion =
        (listing.jdExtract as { version?: number } | undefined)?.version;
      if (
        listing.jdStatus === "fetched" &&
        listing.jdText &&
        (listing.jdText.length > JD_MAX_CHARS ||
          extractVersion !== JD_EXTRACT_VERSION)
      ) {
        const jdText = trimJdText(listing.jdText);
        patch.jdExtract = buildJdExtract(jdText);
        if (jdText !== listing.jdText) {
          const keywords = extractKeywords(listing.title, jdText);
          transitions.push({
            before: listingContribution(listing),
            after: { contributes: true, keywordIds: Object.keys(keywords) },
          });
          patch.jdText = jdText;
          patch.keywords = keywords;
          patch.keywordsVersion = VOCABULARY_VERSION;
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(id, patch);
        slimmed++;
      }
    }
    await applyStatsTransitions(ctx, transitions);
    return { stripped, slimmed };
  },
});
