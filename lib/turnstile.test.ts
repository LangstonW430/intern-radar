import { describe, expect, it } from "vitest";
import {
  evaluateTurnstileVerdict,
  expectedHostnameFromAppUrl,
} from "./turnstile";

describe("evaluateTurnstileVerdict", () => {
  const host = { expectedHostname: "internradar.example.com" };

  it("passes success + matching action + matching hostname", () => {
    expect(
      evaluateTurnstileVerdict(
        { success: true, action: "signin", hostname: "internradar.example.com" },
        host,
      ).ok,
    ).toBe(true);
  });

  it("fails on unsuccessful verification", () => {
    const verdict = evaluateTurnstileVerdict(
      { success: false, "error-codes": ["invalid-input-response"] },
      host,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("invalid-input-response");
  });

  it("fails on a token minted for a different action", () => {
    expect(
      evaluateTurnstileVerdict(
        { success: true, action: "signup-elsewhere", hostname: "internradar.example.com" },
        host,
      ).ok,
    ).toBe(false);
  });

  it("fails on a token from a different hostname", () => {
    expect(
      evaluateTurnstileVerdict(
        { success: true, action: "signin", hostname: "evil.example.net" },
        host,
      ).ok,
    ).toBe(false);
  });

  it("skips hostname check when APP_URL is unknown", () => {
    expect(
      evaluateTurnstileVerdict(
        { success: true, action: "signin", hostname: "anything.example" },
        { expectedHostname: null },
      ).ok,
    ).toBe(true);
  });

  it("tolerates responses without action/hostname fields", () => {
    expect(evaluateTurnstileVerdict({ success: true }, host).ok).toBe(true);
  });
});

describe("expectedHostnameFromAppUrl", () => {
  it("extracts the hostname", () => {
    expect(expectedHostnameFromAppUrl("https://internradar.example.com/x")).toBe(
      "internradar.example.com",
    );
    expect(expectedHostnameFromAppUrl("http://localhost:3000")).toBe("localhost");
  });

  it("returns null for missing or invalid urls", () => {
    expect(expectedHostnameFromAppUrl(undefined)).toBeNull();
    expect(expectedHostnameFromAppUrl("not a url")).toBeNull();
  });
});
