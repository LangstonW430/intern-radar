import { describe, expect, it } from "vitest";
import { profileSeedSchema } from "./profileSeed";

const validSeed = {
  email: "owner@example.com",
  gradDate: "2028-05",
  classYear: "sophomore",
  degreeLevel: "bachelors",
  resumePath: "private/resume.pdf",
  digest: { frequency: "daily", threshold: 0.6, wildcards: 2 },
  preferences: [
    {
      type: "location",
      value: { places: ["Rochester, NY"], radiusMiles: 50 },
      strength: "soft",
    },
    { type: "workMode", value: ["remote", "hybrid"], strength: "soft" },
    { type: "roleCategory", value: ["ai_ml_data", "swe"], strength: "soft" },
    { type: "sponsorship", value: "no_sponsorship_needed", strength: "soft" },
    { type: "classYear", value: "exclude_mismatched", strength: "hard" },
    { type: "degreeLevel", value: "exclude_mismatched", strength: "hard" },
    { type: "excludeCompanies", value: [], strength: "hard" },
  ],
};

describe("profileSeedSchema", () => {
  it("accepts a fully valid seed", () => {
    const parsed = profileSeedSchema.parse(validSeed);
    expect(parsed.email).toBe("owner@example.com");
    expect(parsed.preferences).toHaveLength(7);
  });

  it("defaults resumePath", () => {
    const { resumePath: _omitted, ...rest } = validSeed;
    expect(profileSeedSchema.parse(rest).resumePath).toBe("private/resume.pdf");
  });

  it("rejects a bad gradDate", () => {
    expect(() =>
      profileSeedSchema.parse({ ...validSeed, gradDate: "May 2028" }),
    ).toThrow();
    expect(() =>
      profileSeedSchema.parse({ ...validSeed, gradDate: "2028-13" }),
    ).toThrow();
  });

  it("rejects unknown role categories (old enum values)", () => {
    expect(() =>
      profileSeedSchema.parse({
        ...validSeed,
        preferences: [
          { type: "roleCategory", value: ["research"], strength: "soft" },
        ],
      }),
    ).toThrow();
  });

  it("rejects an out-of-range threshold", () => {
    expect(() =>
      profileSeedSchema.parse({
        ...validSeed,
        digest: { ...validSeed.digest, threshold: 1.5 },
      }),
    ).toThrow();
  });

  it("rejects an invalid strength", () => {
    expect(() =>
      profileSeedSchema.parse({
        ...validSeed,
        preferences: [
          { type: "workMode", value: ["remote"], strength: "medium" },
        ],
      }),
    ).toThrow();
  });
});
