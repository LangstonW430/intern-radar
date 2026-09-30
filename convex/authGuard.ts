import { v } from "convex/values";
import { evaluateRateLimit, OTP_LIMITS } from "../lib/rateLimit";
import { internalMutation } from "./_generated/server";

const PERMIT_TTL_MS = 2 * 60_000;

/**
 * Applies the three sign-in email limits atomically and, when allowed,
 * issues a single-use send permit for the email.
 */
export const checkLimitsAndIssuePermit = internalMutation({
  args: { email: v.string(), ip: v.string() },
  handler: async (ctx, { email, ip }) => {
    const now = Date.now();
    const checks: { key: string; windowMs: number; max: number }[] = [
      {
        key: `otp:email:${email}`,
        ...OTP_LIMITS.perEmail,
      },
      { key: `otp:ip:${ip}`, ...OTP_LIMITS.perIp },
      { key: "otp:global", ...OTP_LIMITS.globalDaily },
    ];

    // Evaluate all before writing any, so a denied request consumes nothing.
    const rows = [];
    for (const check of checks) {
      const doc = await ctx.db
        .query("rateLimits")
        .withIndex("by_key", (q) => q.eq("key", check.key))
        .unique();
      const result = evaluateRateLimit(
        doc ? { windowStart: doc.windowStart, count: doc.count } : null,
        now,
        check.windowMs,
        check.max,
      );
      if (!result.allowed) {
        return { allowed: false as const, reason: check.key.split(":")[1] };
      }
      rows.push({ doc, key: check.key, next: result.next });
    }
    for (const row of rows) {
      if (row.doc) {
        await ctx.db.patch(row.doc._id, row.next);
      } else {
        await ctx.db.insert("rateLimits", { key: row.key, ...row.next });
      }
    }

    // Clear stale permits for this email, then issue a fresh one.
    const permits = await ctx.db
      .query("authPermits")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const permit of permits) {
      await ctx.db.delete(permit._id);
    }
    await ctx.db.insert("authPermits", {
      email,
      expiresAt: now + PERMIT_TTL_MS,
    });
    return { allowed: true as const };
  },
});

/**
 * Called by the OTP provider right before sending. Throws when no valid
 * permit exists — which is what happens when someone bypasses
 * /auth/request-code and calls signIn directly.
 */
export const consumeSendPermit = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const now = Date.now();
    const permits = await ctx.db
      .query("authPermits")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const valid = permits.find((p) => p.expiresAt >= now);
    for (const permit of permits) {
      await ctx.db.delete(permit._id);
    }
    if (!valid) {
      throw new Error("Sign-in requests must go through /auth/request-code");
    }
  },
});
