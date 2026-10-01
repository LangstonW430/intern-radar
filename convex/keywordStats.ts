import { v } from "convex/values";
import {
  applyTransition,
  emptyKeywordStats,
  type KeywordStats,
  type StatsContribution,
} from "../lib/keywordStats";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

export async function readKeywordStats(ctx: QueryCtx): Promise<KeywordStats> {
  const doc = await ctx.db.query("keywordStats").first();
  return doc
    ? { totalWithJd: doc.totalWithJd, df: doc.df }
    : emptyKeywordStats();
}

type StatsFields = Pick<Doc<"listings">, "active" | "jdStatus" | "keywords">;

export function listingContribution(listing: StatsFields): StatsContribution {
  return {
    contributes: listing.active && listing.jdStatus === "fetched",
    keywordIds: Object.keys(listing.keywords ?? {}),
  };
}

export interface StatsTransition {
  before: StatsContribution;
  after: StatsContribution;
}

/** Applies a batch of listing transitions to the single stats document. */
export async function applyStatsTransitions(
  ctx: MutationCtx,
  transitions: StatsTransition[],
): Promise<void> {
  if (transitions.length === 0) return;
  const doc = await ctx.db.query("keywordStats").first();
  const stats: KeywordStats = doc
    ? { totalWithJd: doc.totalWithJd, df: { ...doc.df } }
    : emptyKeywordStats();
  let changed = false;
  for (const t of transitions) {
    changed = applyTransition(stats, t.before, t.after) || changed;
  }
  if (!changed) return;
  if (doc) {
    await ctx.db.patch(doc._id, stats);
  } else {
    await ctx.db.insert("keywordStats", stats);
  }
}

/** Full recount from the listings table — run after a vocabulary change or
 * keyword backfill; incremental updates keep it fresh otherwise. */
export const rebuild = internalAction({
  args: {},
  handler: async (ctx) => {
    const stats = emptyKeywordStats();
    let cursor: string | null = null;
    for (;;) {
      const page: {
        page: StatsFields[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.keywordStats.listStatsPage, { cursor });
      for (const listing of page.page) {
        const { contributes, keywordIds } = listingContribution(listing);
        if (!contributes) continue;
        stats.totalWithJd += 1;
        for (const id of keywordIds) {
          stats.df[id] = (stats.df[id] ?? 0) + 1;
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    await ctx.runMutation(internal.keywordStats.replaceStats, { stats });
    console.log(
      `keywordStats rebuilt: ${stats.totalWithJd} JD listings, ` +
        `${Object.keys(stats.df).length} keywords`,
    );
  },
});

export const listStatsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 200, cursor });
    return {
      ...page,
      page: page.page.map((l) => ({
        active: l.active,
        jdStatus: l.jdStatus,
        keywords: l.keywords,
      })),
    };
  },
});

export const replaceStats = internalMutation({
  args: {
    stats: v.object({
      totalWithJd: v.number(),
      df: v.record(v.string(), v.float64()),
    }),
  },
  handler: async (ctx, { stats }) => {
    const doc = await ctx.db.query("keywordStats").first();
    if (doc) {
      await ctx.db.replace(doc._id, stats);
    } else {
      await ctx.db.insert("keywordStats", stats);
    }
  },
});
