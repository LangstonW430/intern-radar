import { describe, expect, it } from "vitest";
import {
  buildJdExtract,
  extractFacts,
  extractSkills,
  keywordInText,
  splitSections,
} from "./jdExtract";

const SECTIONED_JD = [
  "About Acme",
  "We build widgets with software.",
  "What you'll do",
  "- Ship features in Python and TypeScript",
  "- Review code with senior engineers",
  "Minimum Qualifications",
  "- Pursuing a Bachelor's degree in Computer Science",
  "- Experience with React and Node.js",
  "- 3.0 minimum GPA",
  "Preferred Qualifications",
  "- Familiarity with AWS or GCP",
  "- Interest in machine learning",
].join("\n");

describe("splitSections", () => {
  it("routes bullets to the right section types", () => {
    const s = splitSections(SECTIONED_JD);
    expect(s.responsibilities).toHaveLength(2);
    expect(s.requirements).toHaveLength(3);
    expect(s.preferred).toHaveLength(2);
    expect(s.requirements[0]).toContain("Bachelor's degree");
  });

  it("classifies 'preferred qualifications' as preferred, not requirements", () => {
    const s = splitSections("Preferred Qualifications\n- Kubernetes");
    expect(s.preferred).toEqual(["Kubernetes"]);
    expect(s.requirements).toEqual([]);
  });

  it("returns empty sections, not guesses, when there are no headings", () => {
    const s = splitSections(
      "We want someone great with Python who ships fast and loves data.",
    );
    expect(s).toEqual({ requirements: [], preferred: [], responsibilities: [] });
  });

  it("ignores long prose lines that merely contain heading words", () => {
    const prose =
      "Our requirements are constantly evolving as the team grows and the responsibilities of the role shift over time, and this line is far too long to be a heading.";
    const s = splitSections(`${prose}\n- not a bullet of any section`);
    expect(s.requirements).toEqual([]);
  });
});

describe("extractSkills", () => {
  it("matches aliases with symbol-safe word boundaries", () => {
    const found = extractSkills(
      "Experience with C++, C#, .NET, and Node.js; scripting in Python.",
    );
    expect(found).toEqual(
      expect.arrayContaining(["C++", "C#", ".NET", "Node.js", "Python"]),
    );
  });

  it("does not match inside larger words", () => {
    expect(extractSkills("javascripted rusty pythonic")).toEqual([]);
  });

  it("canonicalizes aliases", () => {
    expect(extractSkills("we use golang and k8s")).toEqual(
      expect.arrayContaining(["Go", "Kubernetes"]),
    );
  });
});

describe("keywordInText", () => {
  it("word-boundary matches free text case-insensitively", () => {
    expect(keywordInText("robotics", "We build Robotics platforms")).toBe(true);
    expect(keywordInText("ai", "Retail chain")).toBe(false);
    expect(keywordInText("", "anything")).toBe(false);
  });
});

describe("extractFacts", () => {
  it("extracts degrees, gpa, grad years, pay, and duration", () => {
    const facts = extractFacts(
      [
        "Pursuing a Bachelor's degree, graduating between December 2028 and May 2029.",
        "3.0 minimum GPA required.",
        "This 12-week internship pays $29.00 to $32.00 an hour.",
      ].join("\n"),
    );
    expect(facts.degrees).toEqual(["bachelors"]);
    expect(facts.minGpa).toBe(3.0);
    expect(facts.gradYears).toEqual([2028, 2029]);
    expect(facts.pay).toBe("$29.00 to $32.00 an hour");
    expect(facts.duration).toBe("12-week");
  });

  it("returns nulls and empties when nothing is stated", () => {
    const facts = extractFacts("Join our team and do great work.");
    expect(facts).toEqual({
      degrees: [],
      minGpa: null,
      gradYears: [],
      pay: null,
      duration: null,
    });
  });

  it("ignores version-number lookalikes for GPA", () => {
    expect(extractFacts("We use Python 3.12 daily").minGpa).toBeNull();
  });
});

describe("buildJdExtract", () => {
  it("scopes required vs preferred skills to their sections", () => {
    const extract = buildJdExtract(SECTIONED_JD);
    expect(extract.requiredSkills).toEqual(
      expect.arrayContaining(["React", "Node.js"]),
    );
    expect(extract.requiredSkills).not.toContain("AWS");
    expect(extract.preferredSkills).toEqual(
      expect.arrayContaining(["AWS", "GCP", "Machine Learning"]),
    );
    expect(extract.skills).toEqual(expect.arrayContaining(["Python", "TypeScript"]));
    expect(extract.version).toBe(1);
  });
});
