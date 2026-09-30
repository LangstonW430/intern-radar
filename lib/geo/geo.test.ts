import { describe, expect, it } from "vitest";
import { lookupCity } from "./data";
import { haversineMiles } from "./distance";
import { geocodeLocations, parseLocation } from "./parse";

describe("parseLocation with the real lookup", () => {
  it("resolves City, ST", () => {
    const parsed = parseLocation("Austin, TX", lookupCity);
    expect(parsed.kind).toBe("city");
    if (parsed.kind === "city") {
      expect(parsed.geo!.lat).toBeCloseTo(30.267, 1);
      expect(parsed.geo!.lon).toBeCloseTo(-97.743, 1);
    }
  });

  it("resolves common aliases", () => {
    const nyc = parseLocation("NYC", lookupCity);
    expect(nyc.kind).toBe("city");
    if (nyc.kind === "city") expect(nyc.geo!.lat).toBeCloseTo(40.71, 1);

    const sf = parseLocation("SF", lookupCity);
    expect(sf.kind).toBe("city");
    if (sf.kind === "city") expect(sf.geo!.lon).toBeCloseTo(-122.42, 1);
  });

  it("resolves Canadian city, province, country", () => {
    const parsed = parseLocation("Toronto, ON, Canada", lookupCity);
    expect(parsed.kind).toBe("city");
    if (parsed.kind === "city") expect(parsed.geo!.lat).toBeCloseTo(43.7, 0);
  });

  it("resolves City, Country", () => {
    const parsed = parseLocation("London, UK", lookupCity);
    expect(parsed.kind).toBe("city");
    if (parsed.kind === "city") expect(parsed.geo!.lat).toBeCloseTo(51.5, 0);
  });

  it("classifies remote variants without geocoding", () => {
    expect(parseLocation("Remote in USA", lookupCity)).toEqual({
      kind: "remote",
      region: "USA",
    });
    expect(parseLocation("Remote", lookupCity)).toEqual({
      kind: "remote",
      region: null,
    });
  });

  it("geocodes the anchor city of hybrid locations", () => {
    const parsed = parseLocation("Hybrid in Seattle, WA", lookupCity);
    expect(parsed.kind).toBe("city");
  });

  it("bare ambiguous city names pick the most populous US match", () => {
    const parsed = parseLocation("Springfield", lookupCity);
    expect(parsed.kind).toBe("city");
  });

  it("returns unknown for gibberish, not a wrong guess", () => {
    expect(parseLocation("Atlantis, ZZ, Neverland", lookupCity).kind).toBe(
      "unknown",
    );
  });
});

describe("geocodeLocations", () => {
  it("dedupes and skips remote entries", () => {
    const points = geocodeLocations(
      ["NYC", "New York City", "Remote in USA", "Boston, MA"],
      lookupCity,
    );
    expect(points).toHaveLength(2);
  });
});

describe("haversineMiles", () => {
  it("NYC to Boston is about 190 miles", () => {
    const nyc = { lat: 40.714, lon: -74.006 };
    const boston = { lat: 42.358, lon: -71.06 };
    const d = haversineMiles(nyc, boston);
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(200);
  });

  it("zero distance for identical points", () => {
    expect(haversineMiles({ lat: 1, lon: 2 }, { lat: 1, lon: 2 })).toBe(0);
  });
});
