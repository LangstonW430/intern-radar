import { describe, expect, it } from "vitest";
import { shouldRedirectToOnboarding } from "./onboardingGate";

describe("shouldRedirectToOnboarding", () => {
  it("redirects a signed-in user without a profile", () => {
    expect(shouldRedirectToOnboarding(null, "/matches")).toBe(true);
    expect(shouldRedirectToOnboarding(null, "/settings")).toBe(true);
  });

  it("never redirects while the profile is still loading", () => {
    expect(shouldRedirectToOnboarding(undefined, "/matches")).toBe(false);
  });

  it("never redirects a user who has a profile", () => {
    expect(shouldRedirectToOnboarding({ userId: "u" }, "/matches")).toBe(false);
  });

  it("never redirects from onboarding itself (no loop)", () => {
    expect(shouldRedirectToOnboarding(null, "/onboarding")).toBe(false);
  });
});
