import { describe, expect, it } from "vitest";
import { splitSections } from "./jdExtract";
import { JD_MAX_CHARS, trimJdText } from "./jdTrim";

const intro = Array.from({ length: 20 }, (_, i) => `Intro paragraph ${i} about the team.`).join("\n");
const requirements = [
  "Requirements",
  "- Pursuing a Bachelor's degree in Computer Science",
  "- Experience with Python and React",
  "- Strong communication skills",
].join("\n");
const preferred = [
  "Preferred Qualifications",
  "- AWS a plus",
  "- Kubernetes",
  "What we offer:",
].join("\n");
const boilerplate = Array.from(
  { length: 200 },
  (_, i) => `Benefits line ${i}: medical, dental, 401k and equal opportunity statement.`,
).join("\n");

describe("trimJdText", () => {
  it("returns text within the cap unchanged", () => {
    const text = `${intro}\n${requirements}`;
    expect(trimJdText(text)).toBe(text);
  });

  it("never exceeds the cap and cuts on line boundaries", () => {
    const text = `${intro}\n${boilerplate}`;
    const out = trimJdText(text, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    const lines = new Set(text.split("\n"));
    for (const line of out.split("\n")) expect(lines.has(line)).toBe(true);
  });

  it("keeps requirements and preferred sections buried under boilerplate", () => {
    const text = `${intro}\n${boilerplate}\n${requirements}\n${preferred}\n${boilerplate}`;
    const out = trimJdText(text, 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
    const sections = splitSections(out);
    expect(sections.requirements).toHaveLength(3);
    expect(sections.preferred).toEqual(["AWS a plus", "Kubernetes"]);
    // Remaining budget goes to the top of the document, not the tail.
    expect(out).toContain("Intro paragraph 0");
    expect(out).not.toContain("Benefits line 199");
  });

  it("caps a run-on priority section so boilerplate cannot eat the budget", () => {
    // No heading after "Requirements": the benefits lines would otherwise
    // all count as requirements and crowd out the intro.
    const text = `${intro}\n${requirements}\n${boilerplate}`;
    const out = trimJdText(text, 2000);
    expect(out).toContain("Intro paragraph 0");
    expect(out).toContain("Strong communication skills");
  });

  it("preserves original line order", () => {
    const text = `${intro}\n${boilerplate}\n${requirements}`;
    const out = trimJdText(text, 1200);
    expect(out.indexOf("Intro paragraph 0")).toBeLessThan(out.indexOf("Requirements"));
  });

  it("hard-cuts a single oversized line", () => {
    const text = "x".repeat(JD_MAX_CHARS + 500);
    expect(trimJdText(text)).toHaveLength(JD_MAX_CHARS);
  });
});
