import { describe, expect, it } from "vitest";
import { evaluateRateLimit } from "./rateLimit";

describe("evaluateRateLimit", () => {
  const windowMs = 1000;
  const max = 3;

  it("starts a fresh window when none exists", () => {
    const r = evaluateRateLimit(null, 100, windowMs, max);
    expect(r).toEqual({ allowed: true, next: { windowStart: 100, count: 1 } });
  });

  it("counts up within the window and denies at the cap", () => {
    const w = { windowStart: 0, count: 1 };
    let r = evaluateRateLimit(w, 10, windowMs, max);
    expect(r.allowed).toBe(true);
    r = evaluateRateLimit(r.next, 20, windowMs, max);
    expect(r.allowed).toBe(true);
    expect(r.next.count).toBe(3);
    r = evaluateRateLimit(r.next, 30, windowMs, max);
    expect(r.allowed).toBe(false);
    expect(r.next.count).toBe(3);
  });

  it("resets after the window elapses", () => {
    const full = { windowStart: 0, count: max };
    const r = evaluateRateLimit(full, 1000, windowMs, max);
    expect(r).toEqual({
      allowed: true,
      next: { windowStart: 1000, count: 1 },
    });
  });
});
