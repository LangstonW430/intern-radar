import skillsJson from "../shared/skills.json";
import { extractClassYearMentions } from "./textSignals";

/**
 * Rule-based extraction over cleaned JD text (newline-preserving output of
 * the Python html_to_text). No guesses: when a JD has no recognizable
 * section headings, the sections come back empty rather than inferred.
 */

export const JD_EXTRACT_VERSION = 1;

export interface JdFacts {
  degrees: string[]; // bachelors | masters | phd mentioned as pursued/required
  minGpa: number | null;
  gradYears: number[];
  pay: string | null; // raw matched snippet, e.g. "$29.00 to $32.00 an hour"
  duration: string | null; // e.g. "12-week"
}

export interface JdExtract {
  version: number;
  requirements: string[];
  preferred: string[];
  responsibilities: string[];
  skills: string[]; // canonical skill names found anywhere in the JD
  requiredSkills: string[]; // found within the requirements section
  preferredSkills: string[]; // found within the preferred section
  facts: JdFacts;
}

// ---------------------------------------------------------------- sections

type SectionType = "requirements" | "preferred" | "responsibilities";

const MAX_HEADING_LENGTH = 60;
const MAX_BULLETS = 15;
const MAX_BULLET_LENGTH = 250;

// Order matters: "preferred qualifications" must classify as preferred,
// not requirements.
const HEADING_PATTERNS: [SectionType, RegExp][] = [
  [
    "preferred",
    /\b(preferred|nice to have|bonus|desirable|desired|a plus|even better|great to have)\b/i,
  ],
  [
    "requirements",
    /\b(requirements?|qualifications?|minimum|basic qualifications|must[- ]haves?|what (you|you'?ll|you will) need|who you are|about you|what we('re| are) looking for)\b/i,
  ],
  [
    "responsibilities",
    /\b(responsibilit|what (you'?ll|you will) (do|be doing|work on)|day[- ]to[- ]day|your role|the role|duties|what to expect|in this role)\b/i,
  ],
];

function headingType(line: string): SectionType | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) return null;
  // A bulleted line is content, never a heading — "- 3.0 minimum GPA" must
  // not read as a "minimum qualifications" heading.
  if (/^[-–—•·*▪◦]/.test(trimmed)) return null;
  for (const [type, pattern] of HEADING_PATTERNS) {
    if (pattern.test(trimmed)) return type;
  }
  return null;
}

function cleanBullet(line: string): string {
  return line
    .replace(/^[\s\-–—•·*▪◦]+/, "")
    .trim()
    .slice(0, MAX_BULLET_LENGTH);
}

export interface JdSections {
  requirements: string[];
  preferred: string[];
  responsibilities: string[];
}

// An ALL-CAPS short line ("WHY YOU'LL LOVE IT HERE") is some other section's
// heading — it ends the current section even though we don't classify it.
function isUnknownHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) return false;
  if (/^[-–—•·*▪◦]/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

export function splitSections(jdText: string): JdSections {
  const sections: JdSections = {
    requirements: [],
    preferred: [],
    responsibilities: [],
  };
  let current: SectionType | null = null;
  for (const rawLine of jdText.split("\n")) {
    const type = headingType(rawLine);
    if (type) {
      current = type;
      continue;
    }
    if (isUnknownHeading(rawLine)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const bullet = cleanBullet(rawLine);
    if (bullet.length < 3) continue;
    if (sections[current].length < MAX_BULLETS) {
      sections[current].push(bullet);
    }
  }
  return sections;
}

// ------------------------------------------------------------------ skills

interface SkillEntry {
  name: string;
  aliases: string[];
}

const SKILLS: SkillEntry[] = (skillsJson as { skills: SkillEntry[] }).skills;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word boundaries that survive c++, c#, .net, node.js: no letter/digit/+/#
// directly before or after the alias.
function aliasPattern(alias: string): RegExp {
  return new RegExp(
    `(?<![a-z0-9+#])${escapeRegex(alias)}(?![a-z0-9+#])`,
    "i",
  );
}

const MATCHERS: { name: string; patterns: RegExp[] }[] = SKILLS.map((s) => ({
  name: s.name,
  patterns: s.aliases.map(aliasPattern),
}));

/** Canonical skill names present in the text, in dictionary order. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const matcher of MATCHERS) {
    if (matcher.patterns.some((p) => p.test(text))) {
      found.push(matcher.name);
    }
  }
  return found;
}

/** Word-boundary match for a free-text keyword (interests). */
export function keywordInText(keyword: string, text: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) return false;
  return aliasPattern(trimmed.toLowerCase()).test(text);
}

// ------------------------------------------------------------------- facts

const DEGREE_PATTERNS: [string, RegExp][] = [
  ["bachelors", /\b(bachelor'?s?|b\.?s\.?c?\b|undergraduate degree|4[- ]year degree|four[- ]year degree)/i],
  ["masters", /\b(master'?s?|m\.?s\.?c?\b|mba\b|graduate degree)/i],
  ["phd", /\b(ph\.?d|doctora(l|te))\b/i],
];

const GPA_PATTERNS = [
  /\b(\d\.\d{1,2})\s*(?:\/\s*4(?:\.0)?)?\s*(?:minimum\s+)?(?:cumulative\s+)?gpa/i,
  /\bgpa\s*(?:of|:)?\s*(?:at least\s*)?(\d\.\d{1,2})/i,
];

const PAY_PATTERN =
  /\$\s?\d[\d,]*(?:\.\d{2})?(?:\s*(?:-|–|to)\s*\$?\s?\d[\d,]*(?:\.\d{2})?)?\s*(?:per\s+hour|an\s+hour|\/\s*(?:hr|hour)|hourly)/i;

const DURATION_PATTERN =
  /\b(ten|twelve|\d{1,2})[- ](week|month)s?\b/i;

export function extractFacts(text: string): JdFacts {
  const degrees = DEGREE_PATTERNS.filter(([, p]) => p.test(text)).map(
    ([name]) => name,
  );

  let minGpa: number | null = null;
  for (const pattern of GPA_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const value = Number(m[1]);
      if (value >= 2 && value <= 4) {
        minGpa = value;
        break;
      }
    }
  }

  const pay = text.match(PAY_PATTERN)?.[0].replace(/\s+/g, " ").trim() ?? null;
  const durationMatch = text.match(DURATION_PATTERN);
  const duration = durationMatch
    ? `${durationMatch[1]}-${durationMatch[2]}`.toLowerCase()
    : null;

  return {
    degrees,
    minGpa,
    gradYears: [...extractClassYearMentions(text).gradYears].sort(),
    pay,
    duration,
  };
}

// ---------------------------------------------------------------- assemble

export function buildJdExtract(jdText: string): JdExtract {
  const sections = splitSections(jdText);
  return {
    version: JD_EXTRACT_VERSION,
    ...sections,
    skills: extractSkills(jdText),
    requiredSkills: extractSkills(sections.requirements.join("\n")),
    preferredSkills: extractSkills(sections.preferred.join("\n")),
    facts: extractFacts(jdText),
  };
}
