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
      return await ctx.db.insert("users", {
        email: email!.trim().toLowerCase(),
      });
    },
  },
});
