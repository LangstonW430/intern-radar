import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  feedbackRates,
  topWeightDrift,
  type GroupRate,
  type WeightDriftEntry,
} from "../lib/adminStats";
import { isAdminEmail } from "../lib/allowlist";
import type { KeywordWeightMap } from "../lib/keywordWeights";
import { internal } from "./_generated/api";
import {
  action,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";

/** Server-side gate: the signed-in user's email must be in ADMIN_EMAILS. */
async function isAdmin(ctx: QueryCtx): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return false;
  const user = await ctx.db.get(userId);
  return isAdminEmail(user?.email ?? undefined, process.env.ADMIN_EMAILS);
}

/** Drives the Admin nav link; the data queries re-check on every call. */
export const amIAdmin = query({
  args: {},
  handler: async (ctx) => isAdmin(ctx),
});

export const assertAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await isAdmin(ctx))) throw new Error("Not authorized");
  },
});

const THIRTY_DAYS_MS = 30 * 86_400_000;

/** Everything cheap in one read: ingest state, keyword stats, profiles,
 * 30-day feedback rates (top vs wildcard), and top weight drift. */
export const baseStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const ingest = await ctx.db.query("ingestState").first();
    const stats = await ctx.db.query("keywordStats").first();
    const profiles = await ctx.db.query("profiles").collect();

    const since = Date.now() - THIRTY_DAYS_MS;
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", since))
      .collect();
    const events = [];
    for (const event of feedback) {
      const match = await ctx.db
        .query("matches")
        .withIndex("by_user_listing", (q) =>
          q.eq("userId", event.userId).eq("listingId", event.listingId),
        )
        .unique();
      events.push({ kind: event.kind, exploration: match?.exploration ?? false });
    }

    return {
      ingest: ingest
        ? {
            lastRunAt: ingest.lastRunAt ?? null,
            lastCommitSha: ingest.lastCommitSha ?? null,
            lastError: ingest.lastError ?? null,
            lastNewCount: ingest.lastNewCount ?? null,
          }
        : null,
      keywordStats: stats
        ? {
            totalWithJd: stats.totalWithJd,
            distinctKeywords: Object.keys(stats.df).length,
          }
        : null,
      profiles: profiles.length,
      rates: feedbackRates(events),
      drift: topWeightDrift(
        profiles.map((p) => (p.keywordWeights ?? {}) as KeywordWeightMap),
      ),
      feedbackEvents30d: feedback.length,
    };
  },
});

export const listingsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 200, cursor });
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: page.page.map((l) => ({
        atsType: l.atsType,
        jdStatus: l.jdStatus,
        active: l.active,
      })),
    };
  },
});

export interface AtsJdStats {
  atsType: string;
  active: number;
  fetched: number;
  pending: number;
  failed: number;
  unsupported: number;
  /** fetched / (active minus still-pending), null before any attempts. */
  successRate: number | null;
}

export interface AdminOverview {
  ingest: {
    lastRunAt: number | null;
    lastCommitSha: string | null;
    lastError: string | null;
    lastNewCount: number | null;
  } | null;
  keywordStats: { totalWithJd: number; distinctKeywords: number } | null;
  profiles: number;
  rates: { top: GroupRate; exploration: GroupRate };
  drift: WeightDriftEntry[];
  feedbackEvents30d: number;
  jdByAts: AtsJdStats[];
}

export const overview = action({
  args: {},
  handler: async (ctx): Promise<AdminOverview> => {
    await ctx.runQuery(internal.admin.assertAdmin, {});

    const byAts = new Map<
      string,
      { active: number; fetched: number; pending: number; failed: number; unsupported: number }
    >();
    let cursor: string | null = null;
    for (;;) {
      const page: {
        page: { atsType: string; jdStatus: string; active: boolean }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.admin.listingsPage, { cursor });
      for (const l of page.page) {
        if (!l.active) continue;
        const bucket = byAts.get(l.atsType) ?? {
          active: 0,
          fetched: 0,
          pending: 0,
          failed: 0,
          unsupported: 0,
        };
        bucket.active++;
        if (l.jdStatus === "fetched") bucket.fetched++;
        else if (l.jdStatus === "pending") bucket.pending++;
        else if (l.jdStatus === "failed") bucket.failed++;
        else bucket.unsupported++;
        byAts.set(l.atsType, bucket);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const jdByAts: AtsJdStats[] = [...byAts.entries()]
      .map(([atsType, b]) => {
        const attempted = b.active - b.pending;
        return {
          atsType,
          ...b,
          successRate: attempted === 0 ? null : b.fetched / attempted,
        };
      })
      .sort((a, b) => b.active - a.active);

    const base = await ctx.runQuery(internal.admin.baseStats, {});
    return { ...base, jdByAts };
  },
});
