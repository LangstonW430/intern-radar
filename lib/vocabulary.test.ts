import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  canonicalizeKeyword,
  customKeywordId,
  isCustomKeywordId,
  keywordDisplayName,
  keywordIdForInterest,
  matchVocabulary,
  VOCAB_BY_ID,
  VOCABULARY,
} from "./vocabulary";

describe("vocabulary file", () => {
  it("has unique ids and lowercase aliases", () => {
    expect(VOCAB_BY_ID.size).toBe(VOCABULARY.length);
    for (const entry of VOCABULARY) {
      for (const alias of entry.aliases) {
        expect(alias).toBe(alias.toLowerCase());
      }
    }
  });

  it("covers every category", () => {
    const seen = new Set(VOCABULARY.map((e) => e.category));
    for (const category of CATEGORIES) {
      expect(seen.has(category)).toBe(true);
    }
  });
});

describe("matchVocabulary", () => {
  it("resolves aliases to canonical ids", () => {
    const found = matchVocabulary(
      "We deploy on k8s, write C++ services, and fine-tune large language models.",
    );
    expect(found.has("kubernetes")).toBe(true);
    expect(found.has("cpp")).toBe(true);
    expect(found.has("llms")).toBe(true);
  });

  it("is case-insensitive with word boundaries", () => {
    expect(matchVocabulary("Experience with PyTorch required").has("pytorch")).toBe(true);
    expect(matchVocabulary("javascripting around").has("javascript")).toBe(false);
    expect(matchVocabulary("scalability matters").has("scala")).toBe(false);
  });

  it("returns empty for empty text", () => {
    expect(matchVocabulary("").size).toBe(0);
  });
});

describe("canonicalizeKeyword", () => {
  it("resolves ids, names, and aliases case-insensitively", () => {
    expect(canonicalizeKeyword("K8s")).toBe("kubernetes");
    expect(canonicalizeKeyword("Machine Learning")).toBe("machine-learning");
    expect(canonicalizeKeyword("kubernetes")).toBe("kubernetes");
    expect(canonicalizeKeyword(" gen ai ")).toBe("llms");
  });

  it("returns null for unknown terms", () => {
    expect(canonicalizeKeyword("underwater basket weaving")).toBeNull();
  });
});

describe("custom keyword ids", () => {
  it("builds stable namespaced slugs", () => {
    expect(customKeywordId("Underwater Basket Weaving")).toBe(
      "custom:underwater-basket-weaving",
    );
    expect(isCustomKeywordId("custom:underwater-basket-weaving")).toBe(true);
    expect(isCustomKeywordId("kubernetes")).toBe(false);
  });

  it("keywordIdForInterest prefers the vocabulary", () => {
    expect(keywordIdForInterest("k8s")).toBe("kubernetes");
    expect(keywordIdForInterest("mission critical cobbling")).toBe(
      "custom:mission-critical-cobbling",
    );
  });

  it("keywordDisplayName resolves both kinds", () => {
    expect(keywordDisplayName("kubernetes")).toBe("Kubernetes");
    expect(keywordDisplayName("custom:basket-weaving")).toBe("basket weaving");
  });
});
