import { convexAuth } from "@convex-dev/auth/server";
import { isEmailAllowed } from "../lib/allowlist";
import { ResendOTP } from "./otp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP],
  callbacks: {
    // Second line of defense: no user document is ever created for an email
    // outside ALLOWED_EMAILS, regardless of provider.
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const email = typeof profile.email === "string" ? profile.email : undefined;
      if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
        throw new Error("This email is not authorized to sign in.");
      }
      if (existingUserId) {
        return existingUserId;
      }
      const normalized = email!.trim().toLowerCase();
      // A profile seeded before first sign-in already created this user —
      // link to it instead of creating a duplicate.
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
