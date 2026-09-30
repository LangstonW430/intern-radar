import { Email } from "@convex-dev/auth/providers/Email";
import type { GenericActionCtx } from "convex/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { sendEmail } from "./lib/resendClient";

function generateCode(): string {
  const digits = new Uint8Array(8);
  crypto.getRandomValues(digits);
  return Array.from(digits, (b) => (b % 10).toString()).join("");
}

export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest(
    { identifier: email, token },
    // Convex Auth passes the action ctx as a second argument (untyped upstream).
    ctx?: GenericActionCtx<DataModel>,
  ) {
    if (!ctx) {
      throw new Error("missing action ctx in sendVerificationRequest");
    }
    // Sends are only allowed with a permit from /auth/request-code, where
    // Turnstile and the rate limits live. Throws otherwise.
    await ctx.runMutation(internal.authGuard.consumeSendPermit, {
      email: email.trim().toLowerCase(),
    });
    await sendEmail({
      to: email,
      subject: `intern-radar sign-in code: ${token}`,
      text: `Your intern-radar sign-in code is ${token}. It expires in 15 minutes.`,
    });
  },
});
