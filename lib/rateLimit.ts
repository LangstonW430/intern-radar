/** Fixed-window rate limiting, kept pure so the policy is testable. */

export interface RateLimitWindow {
  windowStart: number;
  count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  next: RateLimitWindow;
}

export function evaluateRateLimit(
  existing: RateLimitWindow | null,
  now: number,
  windowMs: number,
  max: number,
): RateLimitResult {
  if (!existing || now - existing.windowStart >= windowMs) {
    return { allowed: true, next: { windowStart: now, count: 1 } };
  }
  if (existing.count < max) {
    return {
      allowed: true,
      next: { windowStart: existing.windowStart, count: existing.count + 1 },
    };
  }
  return { allowed: false, next: existing };
}

/** Sign-in email budget: generous for humans, hostile to scripts, and small
 * next to Resend's shared 100/day cap so digests always have room. */
export const OTP_LIMITS = {
  perEmail: { windowMs: 3600_000, max: 5 },
  perIp: { windowMs: 3600_000, max: 20 },
  globalDaily: { windowMs: 86_400_000, max: 40 },
} as const;
