import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const record = mutation({
  args: {
    listingId: v.id("listings"),
    kind: v.union(
      v.literal("applied"),
      v.literal("thumbs_up"),
      v.literal("thumbs_down"),
      v.literal("good_suggestion"),
      v.literal("bad_suggestion"),
    ),
  },
  handler: async (ctx, { listingId, kind }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const listing = await ctx.db.get(listingId);
    if (!listing) throw new Error("Unknown listing");

    await ctx.db.insert("feedback", {
      userId,
      listingId,
      kind,
      source: "web",
      createdAt: Date.now(),
    });
  },
});
