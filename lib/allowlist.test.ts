import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  it("splits, trims, and lowercases", () => {
    expect(parseAllowedEmails(" A@b.com , c@d.com ,")).toEqual([
      "a@b.com",
      "c@d.com",
    ]);
  });

  it("returns empty for undefined or empty", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("")).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  const list = "owner@example.com, second@example.com";

  it("matches case-insensitively", () => {
    expect(isEmailAllowed("Owner@Example.COM", list)).toBe(true);
  });

  it("rejects emails not on the list", () => {
    expect(isEmailAllowed("intruder@example.com", list)).toBe(false);
  });

  it("rejects when the list is empty — closed by default", () => {
    expect(isEmailAllowed("owner@example.com", undefined)).toBe(false);
    expect(isEmailAllowed("owner@example.com", "")).toBe(false);
  });

  it("rejects missing email", () => {
    expect(isEmailAllowed(undefined, list)).toBe(false);
  });
});
