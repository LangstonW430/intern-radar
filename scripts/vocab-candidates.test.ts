import { describe, expect, it } from "vitest";
import { documentTerms } from "./vocab-candidates";

describe("documentTerms", () => {
  it("emits unique 1-3 grams without boundary stopwords", () => {
    const terms = documentTerms(
      "Build distributed systems for the trading desk. Distributed systems experience required.",
    );
    expect(terms.has("distributed")).toBe(true);
    expect(terms.has("distributed systems")).toBe(true);
    expect(terms.has("trading desk")).toBe(true);
    // boilerplate and stopword-bounded grams are dropped
    expect(terms.has("experience")).toBe(false);
    expect(terms.has("systems for")).toBe(false);
    expect(terms.has("the trading")).toBe(false);
  });

  it("keeps interior stopwords in n-grams", () => {
    expect(documentTerms("head of ai initiatives").has("head of ai")).toBe(true);
  });

  it("drops numeric noise and single characters", () => {
    const terms = documentTerms("earn $25 per hour in 2027 using c++");
    expect(terms.has("2027")).toBe(false);
    expect(terms.has("25")).toBe(false);
    expect(terms.has("c++")).toBe(true);
  });
});
