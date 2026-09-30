import { v } from "convex/values";
import { diffListings, type IndexEntry } from "../lib/diff";
import { lookupCity } from "../lib/geo/data";
import { geocodeLocations } from "../lib/geo/parse";
import {
  isJdSupported,
  toListingSourceFields,
} from "../lib/listingDoc";
import { inScope, parseListingsFeed } from "../lib/schemas/simplify";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { fetchListingsJson, getLatestListingsSha } from "./lib/github";
import { listingFieldsValidator } from "./schema";

const BATCH_SIZE = 50;
const INDEX_CHUNK_SIZE = 1000;

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    try {
      const repo =
        process.env.SOURCE_REPO ?? "SimplifyJobs/Summer2027-Internships";
      const sha = await getLatestListingsSha(repo);
      const state = await ctx.runQuery(internal.ingest.getState, {});
      if (state?.lastCommitSha === sha) {
        await ctx.runMutation(internal.ingest.setState, {
          lastRunAt: now,
          lastError: undefined,
        });
        return;
      }

      const rawFeed = await fetchListingsJson(repo, sha);
      const { listings, malformedCount, firstErrors } =
        parseListingsFeed(rawFeed);
      if (malformedCount > 0) {
        console.warn(
          `ingest: skipped ${malformedCount} malformed records`,
          firstErrors,
        );
      }
      const scoped = listings.filter((l) => inScope(l));

      const index = await ctx.runQuery(internal.ingest.getIndexEntries, {});
      const { toInsert, toUpdate, toDeactivate, unchangedCount } =
        diffListings(scoped, index);
      console.log(
        `ingest: ${toInsert.length} new, ${toUpdate.length} changed, ` +
          `${toDeactivate.length} disappeared, ${unchangedCount} unchanged`,
      );

      const upserts = [...toInsert, ...toUpdate];
      for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
        await ctx.runMutation(internal.ingest.upsertBatch, {
          items: upserts.slice(i, i + BATCH_SIZE).map((l) => ({
            ...toListingSourceFields(l),
            geo: geocodeLocations(l.locations, lookupCity),
          })),
          now,
        });
      }
      for (let i = 0; i < toDeactivate.length; i += BATCH_SIZE) {
        await ctx.runMutation(internal.ingest.deactivateBatch, {
          sourceIds: toDeactivate.slice(i, i + BATCH_SIZE),
        });
      }
      await ctx.runMutation(internal.ingest.updateIndex, {
        upserts: upserts.map((l) => ({
          sourceId: l.id,
          contentHash: toListingSourceFields(l).contentHash,
        })),
        removals: toDeactivate,
      });
      await ctx.runMutation(internal.ingest.setState, {
        lastCommitSha: sha,
        lastRunAt: now,
        lastError: undefined,
        lastNewCount: toInsert.length,
        lastMalformedCount: malformedCount,
      });
    } catch (error) {
      console.error("ingest failed", error);
      await ctx.runMutation(internal.ingest.setState, {
        lastRunAt: now,
        lastError: String(error),
      });
    }
  },
});

export const getState = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("ingestState").first();
  },
});

export const setState = internalMutation({
  args: {
    lastCommitSha: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastNewCount: v.optional(v.number()),
    lastMalformedCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("ingestState").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("ingestState", args);
    }
  },
});

export const getIndexEntries = internalQuery({
  args: {},
  handler: async (ctx): Promise<IndexEntry[]> => {
    const chunks = await ctx.db.query("ingestIndex").collect();
    return chunks.flatMap((c) => c.entries);
  },
});

export const upsertBatch = internalMutation({
  args: {
    items: v.array(v.object(listingFieldsValidator)),
    now: v.number(),
  },
  handler: async (ctx, { items, now }) => {
    for (const item of items) {
      const existing = await ctx.db
        .query("listings")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", item.sourceId))
        .unique();

      if (!existing) {
        await ctx.db.insert("listings", {
          ...item,
          jdStatus: isJdSupported(item.atsType)
            ? "pending"
            : "unsupported",
          jdAttempts: 0,
          ingestedAt: now,
          embedPending: true,
        });
        continue;
      }

      const urlChanged = existing.url !== item.url;
      const titleChanged =
        existing.title !== item.title ||
        existing.company !== item.company ||
        existing.category !== item.category;
      await ctx.db.patch(existing._id, {
        ...item,
        // The JD lives at the URL; only a URL change makes it stale.
        ...(urlChanged
          ? {
              jdStatus: isJdSupported(item.atsType)
                ? ("pending" as const)
                : ("unsupported" as const),
              jdAttempts: 0,
              jdError: undefined,
              jdSource: undefined,
            }
          : {}),
        // Without a JD, the embedding is built from title+company+category.
        ...(titleChanged && !existing.jdText ? { embedPending: true } : {}),
        ...(urlChanged ? { embedPending: true } : {}),
      });
    }
  },
});

/** Recomputes geo for every listing — run after lookup/alias improvements. */
export const regeocodeAll = internalAction({
  args: {},
  handler: async (ctx) => {
    let cursor: string | null = null;
    let updated = 0;
    for (;;) {
      const page: {
        page: { listingId: Id<"listings">; locations: string[] }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.ingest.listLocationsPage, { cursor });
      const items = page.page.map((l) => ({
        listingId: l.listingId,
        geo: geocodeLocations(l.locations, lookupCity),
      }));
      if (items.length > 0) {
        await ctx.runMutation(internal.ingest.patchGeoBatch, { items });
        updated += items.length;
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`regeocode: updated ${updated} listings`);
  },
});

export const listLocationsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ numItems: 100, cursor });
    return {
      ...page,
      page: page.page.map((l) => ({
        listingId: l._id,
        locations: l.locations,
      })),
    };
  },
});

export const patchGeoBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        listingId: v.id("listings"),
        geo: v.array(
          v.object({ lat: v.float64(), lon: v.float64(), name: v.string() }),
        ),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    for (const item of items) {
      await ctx.db.patch(item.listingId, { geo: item.geo });
    }
  },
});

export const deactivateBatch = internalMutation({
  args: { sourceIds: v.array(v.string()) },
  handler: async (ctx, { sourceIds }) => {
    for (const sourceId of sourceIds) {
      const existing = await ctx.db
        .query("listings")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
        .unique();
      if (existing && existing.active) {
        await ctx.db.patch(existing._id, { active: false });
      }
    }
  },
});

export const updateIndex = internalMutation({
  args: {
    upserts: v.array(
      v.object({ sourceId: v.string(), contentHash: v.string() }),
    ),
    removals: v.array(v.string()),
  },
  handler: async (ctx, { upserts, removals }) => {
    const chunks = await ctx.db.query("ingestIndex").collect();
    chunks.sort((a, b) => a.chunk - b.chunk);

    const removalSet = new Set(removals);
    const position = new Map<string, { chunkIdx: number; entryIdx: number }>();
    chunks.forEach((chunk, chunkIdx) =>
      chunk.entries.forEach((entry, entryIdx) =>
        position.set(entry.sourceId, { chunkIdx, entryIdx }),
      ),
    );

    const working = chunks.map((c) => ({
      _id: c._id,
      chunk: c.chunk,
      entries: [...c.entries],
      dirty: false,
    }));
    const appends: { sourceId: string; contentHash: string }[] = [];

    for (const upsert of upserts) {
      const pos = position.get(upsert.sourceId);
      if (pos) {
        working[pos.chunkIdx].entries[pos.entryIdx] = upsert;
        working[pos.chunkIdx].dirty = true;
      } else {
        appends.push(upsert);
      }
    }
    if (removalSet.size > 0) {
      for (const w of working) {
        const before = w.entries.length;
        w.entries = w.entries.filter((e) => !removalSet.has(e.sourceId));
        if (w.entries.length !== before) w.dirty = true;
      }
    }

    for (const w of working) {
      if (w.dirty) {
        await ctx.db.patch(w._id, { entries: w.entries });
      }
    }

    let nextChunkNumber =
      working.length > 0 ? working[working.length - 1].chunk + 1 : 0;
    const lastChunk = working[working.length - 1];
    let queue = appends;
    if (lastChunk && lastChunk.entries.length < INDEX_CHUNK_SIZE) {
      const room = INDEX_CHUNK_SIZE - lastChunk.entries.length;
      const taken = queue.slice(0, room);
      queue = queue.slice(room);
      if (taken.length > 0) {
        await ctx.db.patch(lastChunk._id, {
          entries: [...lastChunk.entries, ...taken],
        });
      }
    }
    while (queue.length > 0) {
      await ctx.db.insert("ingestIndex", {
        chunk: nextChunkNumber++,
        entries: queue.slice(0, INDEX_CHUNK_SIZE),
      });
      queue = queue.slice(INDEX_CHUNK_SIZE);
    }
  },
});
