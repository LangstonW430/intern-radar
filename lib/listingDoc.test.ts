import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/simplify-listings.json";
import { isJdSupported, toListingSourceFields } from "./listingDoc";
import { parseListingsFeed } from "./schemas/simplify";

const listings = parseListingsFeed(fixtures).listings;

describe("toListingSourceFields", () => {
  it("normalizes and detects across all fixtures", () => {
    const box = toListingSourceFields(
      listings.find((l) => l.company_name === "Box")!,
    );
    expect(box.category).toBe("product");
    expect(box.atsType).toBe("greenhouse");
    expect(box.atsRef).toEqual({ account: "boxinc", jobId: "7550753" });
    expect(box.remoteType).toBe("onsite");

    const correlation = toListingSourceFields(
      listings.find((l) => l.company_name === "Correlation One")!,
    );
    expect(correlation.remoteType).toBe("remote");
  });

  it("converts feed seconds to ms", () => {
    const fields = toListingSourceFields(listings[0]);
    expect(fields.datePosted).toBe(listings[0].date_posted * 1000);
  });

  it("keeps the raw record", () => {
    const fields = toListingSourceFields(listings[0]);
    expect(fields.raw).toEqual(listings[0]);
  });
});

describe("isJdSupported", () => {
  it("supports the seven planned sources, not other", () => {
    for (const ats of [
      "greenhouse",
      "greenhouse_embedded",
      "lever",
      "ashby",
      "workday",
      "icims",
      "oracle",
    ]) {
      expect(isJdSupported(ats)).toBe(true);
    }
    expect(isJdSupported("other")).toBe(false);
  });
});
