import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Stratified sample of scored matches for bootstrap labeling: likely matches,
 * borderline, clear misses, and a few hard-filtered drops.
 */
export const exportLabelCandidates = internalQuery({
  args: { email: v.string(), count: v.optional(v.number()) },
  handler: async (ctx, { email, count }) => {
    const target = count ?? 200;
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!user) throw new Error(`no user for ${email}`);

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_user_score", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const survivors = matches.filter((m) => m.droppedBy === null);
    const dropped = matches.filter((m) => m.droppedBy !== null);

    const nTop = Math.round(target * 0.4);
    const nMid = Math.round(target * 0.3);
    const nBottom = Math.round(target * 0.2);
    const nDropped = target - nTop - nMid - nBottom;

    const takeSpread = <T>(items: T[], n: number): T[] => {
      if (items.length <= n) return [...items];
      const step = items.length / n;
      return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
    };

    const midStart = Math.floor(survivors.length * 0.4);
    const midEnd = Math.floor(survivors.length * 0.7);
    const picked = [
      ...survivors.slice(0, nTop),
      ...takeSpread(survivors.slice(midStart, midEnd), nMid),
      ...takeSpread(survivors.slice(midEnd), nBottom),
      ...takeSpread(dropped, nDropped),
    ];

    const seen = new Set<string>();
    const rows = [];
    for (const match of picked) {
      if (seen.has(match.listingId)) continue;
      seen.add(match.listingId);
      const listing = await ctx.db.get(match.listingId);
      if (!listing) continue;
      rows.push({
        listingId: match.listingId,
        company: listing.company,
        title: listing.title,
        location: listing.locations.join("; "),
        url: listing.url,
        score: match.score,
        droppedBy: match.droppedBy,
        hadJd: listing.jdStatus === "fetched",
        jdText: listing.jdText ?? null,
      });
    }
    return rows;
  },
});

export const importLabels = internalMutation({
  args: {
    email: v.string(),
    items: v.array(
      v.object({
        listingId: v.string(),
        label: v.union(v.literal("good"), v.literal("bad")),
        reason: v.string(),
        split: v.union(v.literal("train"), v.literal("eval")),
        hadJd: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { email, items }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!user) throw new Error(`no user for ${email}`);
    const now = Date.now();

    const existing = await ctx.db
      .query("labels")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const byListing = new Map(existing.map((l) => [l.listingId as string, l]));

    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      const listingId = ctx.db.normalizeId("listings", item.listingId);
      if (!listingId) continue;
      const prior = byListing.get(listingId);
      if (prior) {
        // The eval split is fixed forever — never reassign it on re-import.
        await ctx.db.patch(prior._id, {
          label: item.label,
          reason: item.reason,
          reviewed: true,
          hadJd: item.hadJd,
        });
        updated++;
      } else {
        await ctx.db.insert("labels", {
          userId: user._id,
          listingId,
          label: item.label,
          reason: item.reason,
          reviewed: true,
          split: item.split,
          hadJd: item.hadJd,
          createdAt: now,
        });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});
