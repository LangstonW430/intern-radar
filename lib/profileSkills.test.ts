import { describe, expect, it } from "vitest";
import {
  mergeSkillSuggestions,
  newSkillSuggestions,
  suggestInterests,
} from "./profileSkills";

describe("mergeSkillSuggestions", () => {
  it("appends new detections without touching user entries", () => {
    const merged = mergeSkillSuggestions(
      ["Python", "My Niche Skill"],
      ["Python", "React"],
    );
    expect(merged).toEqual(["Python", "My Niche Skill", "React"]);
  });

  it("never removes a user's skills when detection no longer finds them", () => {
    // resume replaced; new resume doesn't mention TypeScript
    const merged = mergeSkillSuggestions(["TypeScript"], ["Go"]);
    expect(merged).toContain("TypeScript");
  });

  it("dedupes case-insensitively, keeping the user's spelling", () => {
    expect(mergeSkillSuggestions(["react"], ["React"])).toEqual(["react"]);
  });
});

describe("newSkillSuggestions", () => {
  it("returns only skills the user doesn't already have", () => {
    expect(newSkillSuggestions(["Python"], ["Python", "AWS"])).toEqual(["AWS"]);
  });
});

describe("suggestInterests", () => {
  it("offers up to max resume skills not already used as interests", () => {
    const suggestions = suggestInterests(
      ["Python", "React", "AWS", "Go", "Rust", "Kafka"],
      [{ keyword: "react", tag: "want", strength: "soft" }],
      3,
    );
    expect(suggestions).toEqual(["Python", "AWS", "Go"]);
  });
});
