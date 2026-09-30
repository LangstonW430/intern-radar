import { describe, expect, it } from "vitest";
import {
  detectRemoteType,
  normalizeCategory,
  normalizeDegrees,
  normalizeSponsorship,
} from "./normalize";

describe("normalizeCategory", () => {
  it("maps current source values", () => {
    expect(normalizeCategory("AI/ML/Data")).toBe("ai_ml_data");
    expect(normalizeCategory("Software")).toBe("swe");
    expect(normalizeCategory("Hardware")).toBe("hardware");
    expect(normalizeCategory("Product")).toBe("product");
    expect(normalizeCategory("Quant")).toBe("quant");
  });

  it("maps legacy aliases", () => {
    expect(normalizeCategory("Software Engineering")).toBe("swe");
    expect(normalizeCategory("Data Science, AI & Machine Learning")).toBe(
      "ai_ml_data",
    );
    expect(normalizeCategory("Quantitative Finance")).toBe("quant");
    expect(normalizeCategory("Product Management")).toBe("product");
    expect(normalizeCategory("Hardware Engineering")).toBe("hardware");
  });

  it("falls back to other", () => {
    expect(normalizeCategory("Underwater Basket Weaving")).toBe("other");
  });
});

describe("normalizeSponsorship", () => {
  it("maps the four known values", () => {
    expect(normalizeSponsorship("Offers Sponsorship")).toBe("offers");
    expect(normalizeSponsorship("Does Not Offer Sponsorship")).toBe(
      "no_sponsorship",
    );
    expect(normalizeSponsorship("U.S. Citizenship is Required")).toBe(
      "us_citizenship_required",
    );
    expect(normalizeSponsorship("Other")).toBe("unknown");
  });

  it("treats anything unexpected as unknown", () => {
    expect(normalizeSponsorship("Maybe")).toBe("unknown");
  });
});

describe("detectRemoteType", () => {
  it("all-remote → remote (typo-tolerant)", () => {
    expect(detectRemoteType(["Remote in USA", "Remote in USa"])).toBe("remote");
  });

  it("mixed remote and physical → hybrid", () => {
    expect(detectRemoteType(["Remote in USA", "NYC"])).toBe("hybrid");
  });

  it("explicit hybrid → hybrid", () => {
    expect(detectRemoteType(["Hybrid in Seattle, WA"])).toBe("hybrid");
  });

  it("physical only → onsite", () => {
    expect(detectRemoteType(["San Jose, CA", "Austin, TX"])).toBe("onsite");
  });

  it("empty → unknown", () => {
    expect(detectRemoteType([])).toBe("unknown");
  });
});

describe("normalizeDegrees", () => {
  it("maps and dedupes", () => {
    expect(normalizeDegrees(["Bachelor's", "Master's", "PhD"])).toEqual([
      "bachelors",
      "masters",
      "phd",
    ]);
    expect(normalizeDegrees(["MBA", "JD"])).toEqual(["other"]);
  });

  it("empty means unstated", () => {
    expect(normalizeDegrees([])).toEqual([]);
  });
});
