import { Email } from "@convex-dev/auth/providers/Email";
import { isEmailAllowed } from "../lib/allowlist";
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
  async sendVerificationRequest({ identifier: email, token }) {
    // First line of defense: never even email a code to someone off the list.
    if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
      throw new Error("This email is not authorized to sign in.");
    }
    await sendEmail({
      to: email,
      subject: `intern-radar sign-in code: ${token}`,
      text: `Your intern-radar sign-in code is ${token}. It expires in 15 minutes.`,
    });
  },
});
