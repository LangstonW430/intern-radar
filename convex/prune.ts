import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

/**
 * Storage hygiene for listings the feed has dropped. Inactive listings are
 * never shown (matches list, digest, and scoring all skip them), yet each one
 * kept its full JD text, extract, embedding, and one match row per user.
 * After PRUNE_AFTER_MS of inactivity the heavy fields are stripped and the
 * matches deleted; the small listing stub stays so feedback and labels still
 * resolve and learning replay keeps its keywords. If the feed brings a
 * pruned listing back, ingest re-queues its JD fetch.
 */
export const PRUNE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH = 25;

/** Strips the heavy fields and deletes every user's match for the listing. */
export async function stripListing(
  ctx: MutationCtx,
  listing: Doc<"listings">,
  now: number,
): Promise<void> {
  await ctx.db.patch(listing._id, {
    jdText: undefined,
    jdExtract: undefined,
    embedding: undefined,
    embeddingVersion: undefined,
    embedPending: false,
    raw: undefined,
    deactivatedAt: listing.deactivatedAt ?? now,
    prunedAt: now,
  });
  const profiles = await ctx.db.query("profiles").collect();
  for (const profile of profiles) {
    const match = await ctx.db
      .query("matches")
      .withIndex("by_user_listing", (q) =>
        q.eq("userId", profile.userId).eq("listingId", listing._id),
      )
      .unique();
    if (match) await ctx.db.delete(match._id);
  }
}

/** Daily cron: prunes listings inactive for longer than PRUNE_AFTER_MS. */
export const pruneInactive = internalAction({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, { olderThanMs }) => {
    const cutoff = Date.now() - (olderThanMs ?? PRUNE_AFTER_MS);
    let cursor: string | null = null;
    let pruned = 0;
    for (;;) {
      const page: {
        page: Id<"listings">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.prune.listPrunable, { cursor, cutoff });
      for (let i = 0; i < page.page.length; i += PRUNE_BATCH) {
        await ctx.runMutation(internal.prune.pruneBatch, {
          listingIds: page.page.slice(i, i + PRUNE_BATCH),
        });
        pruned += Math.min(PRUNE_BATCH, page.page.length - i);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`pruneInactive: pruned ${pruned} listings`);
    return { pruned };
  },
});

/** Inactive, not yet pruned, deactivated before the cutoff. Listings that
 * went inactive before deactivatedAt existed count as old. */
export const listPrunable = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), cutoff: v.number() },
  handler: async (ctx, { cursor, cutoff }) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_active_pruned", (q) =>
        q.eq("active", false).eq("prunedAt", undefined),
      )
      .paginate({ numItems: 200, cursor });
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: page.page
        .filter((l) => (l.deactivatedAt ?? 0) <= cutoff)
        .map((l) => l._id),
    };
  },
});

export const pruneBatch = internalMutation({
  args: { listingIds: v.array(v.id("listings")) },
  handler: async (ctx, { listingIds }) => {
    const now = Date.now();
    for (const id of listingIds) {
      const listing = await ctx.db.get(id);
      // Re-checked here: the feed may have revived it since the query ran.
      if (!listing || listing.active || listing.prunedAt !== undefined) continue;
      await stripListing(ctx, listing, now);
    }
  },
});
