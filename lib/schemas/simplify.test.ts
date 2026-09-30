import { describe, expect, it } from "vitest";
import fixtures from "../__fixtures__/simplify-listings.json";
import { inScope, parseListingsFeed, simplifyListingSchema } from "./simplify";

describe("simplifyListingSchema", () => {
  it("parses every real fixture record", () => {
    for (const record of fixtures) {
      expect(() => simplifyListingSchema.parse(record)).not.toThrow();
    }
  });

  it("rejects a record with a bad id", () => {
    const bad = { ...fixtures[0], id: "not-a-uuid" };
    expect(simplifyListingSchema.safeParse(bad).success).toBe(false);
  });
});

describe("parseListingsFeed", () => {
  it("skips malformed records without failing the run", () => {
    const feed = [...fixtures, { id: "broken" }, 42, null];
    const result = parseListingsFeed(feed);
    expect(result.listings).toHaveLength(fixtures.length);
    expect(result.malformedCount).toBe(3);
    expect(result.firstErrors.length).toBeGreaterThan(0);
  });

  it("throws on a non-array feed", () => {
    expect(() => parseListingsFeed({ listings: [] })).toThrow();
  });
});

describe("inScope", () => {
  const parsed = parseListingsFeed(fixtures).listings;

  it("keeps Summer 2027 listings, including multi-term ones", () => {
    const box = parsed.find((l) => l.company_name === "Box")!;
    expect(inScope(box)).toBe(true);
  });

  it("excludes N/A-term and other-season listings", () => {
    const labcorp = parsed.find((l) => l.company_name === "LabCorp")!;
    const strategic = parsed.find(
      (l) => l.company_name === "Strategic Education",
    )!;
    expect(inScope(labcorp)).toBe(false);
    expect(inScope(strategic)).toBe(false);
  });
});
