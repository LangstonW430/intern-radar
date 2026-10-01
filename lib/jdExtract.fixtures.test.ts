import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStructuralFeatures } from "./features";
import { buildJdExtract, splitSections } from "./jdExtract";
import { lookupCity } from "./geo/data";

/** Real cleaned JD text, generated from the recorded ATS fixtures. */
function fixture(name: string): string {
  return readFileSync(join(__dirname, "__fixtures__", name), "utf8");
}

const XCEL = fixture("jd_xcel_workday.txt");
const AQUATIC = fixture("jd_aquatic_greenhouse.txt");

describe("section splitting on real JDs", () => {
  it("Xcel (Workday): requirements, preferred, and colon-intro responsibilities", () => {
    const s = splitSections(XCEL);
    expect(s.requirements.some((b) => b.includes("Sophomore or higher"))).toBe(true);
    expect(s.preferred.some((b) => b.includes("Power BI"))).toBe(true);
    // "Typical intern responsibilities may include but are not limited to:"
    expect(s.responsibilities.some((b) => b.includes("dashboards"))).toBe(true);
  });

  it("Aquatic (Greenhouse): 'Desired qualities' maps to preferred and 'Benefits:' ends it", () => {
    const s = splitSections(AQUATIC);
    expect(s.requirements.some((b) => b.includes("Python programming"))).toBe(true);
    expect(s.preferred.some((b) => b.includes("Intellectually curious"))).toBe(true);
    // The unclassified "Benefits:" heading must stop the preferred section.
    expect(s.preferred.some((b) => /401k|medical/i.test(b))).toBe(false);
    expect(s.requirements.some((b) => /401k|medical/i.test(b))).toBe(false);
  });

  it("prose with no headings yields empty sections", () => {
    // The Xcel intro paragraphs alone carry no recognizable headings.
    const intro = XCEL.split("\n").slice(0, 3).join("\n");
    expect(splitSections(intro)).toEqual({
      requirements: [],
      preferred: [],
      responsibilities: [],
    });
  });
});

describe("skills and facts on real JDs", () => {
  const xcel = buildJdExtract(XCEL);
  const aquatic = buildJdExtract(AQUATIC);

  it("finds section-scoped skills in the Xcel JD", () => {
    expect(xcel.preferredSkills).toEqual(
      expect.arrayContaining(["Power BI", "SQL", "Python", "Excel"]),
    );
    expect(xcel.skills).toEqual(expect.arrayContaining(["Databricks"]));
  });

  it("extracts Xcel's hourly pay", () => {
    expect(xcel.facts.pay).toBe("$19.00 to $20.90 per hour");
    expect(xcel.facts.minGpa).toBeNull();
  });

  it("extracts Aquatic's degree levels and graduation window", () => {
    expect(aquatic.facts.degrees).toEqual(
      expect.arrayContaining(["bachelors", "masters", "phd"]),
    );
    expect(aquatic.facts.gradYears).toEqual([2027, 2028]);
  });

  it("finds required skills in Aquatic's requirements section", () => {
    expect(aquatic.requiredSkills).toEqual(
      expect.arrayContaining(["Python", "Machine Learning", "Statistics"]),
    );
  });
});

describe("coverage math end to end on a real JD", () => {
  const listing = {
    company: "Aquatic",
    title: "Quantitative Research Intern",
    jdText: AQUATIC,
    category: "quant",
    remoteType: "onsite",
    sponsorship: "unknown",
    degrees: [],
    locations: ["Chicago, IL"],
    geo: [],
    embedding: null,
    jdStatus: "fetched",
    datePosted: Date.now(),
    jdExtract: buildJdExtract(AQUATIC),
  };
  const profile = {
    classYear: "sophomore",
    degreeLevel: "bachelors",
    gradDate: "2029-05",
    preferences: [],
    skills: ["Python", "Statistics"],
  };
  const context = { likedCompanies: new Set<string>(), now: Date.now(), lookup: lookupCity };

  it("computes required coverage as hits over section skills", () => {
    const f = buildStructuralFeatures(listing as never, profile as never, context);
    const required = listing.jdExtract.requiredSkills;
    const expected =
      required.filter((s) => ["python", "statistics"].includes(s.toLowerCase()))
        .length / required.length;
    expect(f.required_skill_coverage).toBeCloseTo(expected, 5);
    expect(f.degree_fit).toBe(1); // bachelors is accepted (BS/MS/PhD)
  });
});
