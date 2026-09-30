import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTP } from "./otp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const email = typeof profile.email === "string" ? profile.email : undefined;
      if (!email) {
        throw new Error("An email address is required to sign in.");
      }
      if (existingUserId) {
        return existingUserId;
      }
      const normalized = email.trim().toLowerCase();
      // A dev-seeded profile may already have created this user — link to it
      // instead of creating a duplicate.
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), normalized))
        .unique();
      if (existing) {
        return existing._id;
      }
      return await ctx.db.insert("users", { email: normalized });
    },
  },
});
