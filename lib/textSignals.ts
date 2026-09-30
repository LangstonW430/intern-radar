/**
 * Explicit class-year and sponsorship signals extracted from listing text
 * (title + JD). Decision D1/D3: only explicit statements count — anything
 * unstated must read as "unstated", never as a conflict. Patterns are
 * deliberately conservative: "Senior Software Engineer" must not read as
 * "seniors only".
 */

const CLASS_WORD = "(freshman|freshmen|sophomore|junior|senior)";
const CLASS_PATTERNS = [
  // "rising seniors", "current juniors", "incoming sophomores"
  new RegExp(`\\b(?:rising|current|incoming)\\s+${CLASS_WORD}s?\\b`, "gi"),
  // "junior year", "senior standing", "sophomore students", "juniors only"
  new RegExp(`\\b${CLASS_WORD}s?\\s+(?:year|standing|students?|only)\\b`, "gi"),
  // "only juniors", "must be a sophomore"
  new RegExp(`\\b(?:only|must\\s+be(?:\\s+a)?)\\s+${CLASS_WORD}s?\\b`, "gi"),
];
const GRAD_LEVEL_PATTERNS: [RegExp, string][] = [
  [/\bmaster'?s\s+(?:students?|candidates?|degree\s+candidates?)\b/gi, "masters"],
  [/\b(?:phd|ph\.d\.?|doctoral)\s+(?:students?|candidates?)\b/gi, "phd"],
];
// "class of 2028", "graduating in 2028", "expected graduation ... 2028",
// "graduate between December 2027 and June 2028"
const CLASS_OF = /\bclass\s+of\s+(20\d{2})\b/gi;
const GRAD_NEAR = /\bgraduat\w*\b([^.;\n]{0,80})/gi;
const YEAR = /\b(20\d{2})\b/g;

export interface ClassYearMentions {
  classYears: Set<string>;
  gradYears: Set<number>;
}

export function extractClassYearMentions(text: string): ClassYearMentions {
  const classYears = new Set<string>();
  const gradYears = new Set<number>();

  for (const pattern of CLASS_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      classYears.add(m[1].toLowerCase().replace("freshmen", "freshman"));
    }
  }
  for (const [pattern, level] of GRAD_LEVEL_PATTERNS) {
    if (pattern.test(text)) classYears.add(level);
    pattern.lastIndex = 0;
  }
  for (const m of text.matchAll(CLASS_OF)) {
    gradYears.add(Number(m[1]));
  }
  for (const m of text.matchAll(GRAD_NEAR)) {
    for (const y of m[1].matchAll(YEAR)) {
      gradYears.add(Number(y[1]));
    }
  }
  return { classYears, gradYears };
}

export type ClassYearFit = "fit" | "mismatch" | "unstated";

export function classYearFit(
  profile: { classYear: string; gradDate: string },
  text: string,
): ClassYearFit {
  const { classYears, gradYears } = extractClassYearMentions(text);
  if (classYears.size === 0 && gradYears.size === 0) return "unstated";
  const gradYear = Number(profile.gradDate.slice(0, 4));
  if (gradYears.has(gradYear)) return "fit";
  if (classYears.has(profile.classYear)) return "fit";
  return "mismatch";
}

const SPONSORSHIP_CONFLICTS = [
  /\b(?:unable|not\s+able)\s+to\s+sponsor\b/i,
  /\b(?:cannot|can\s*not|will\s+not|do(?:es)?\s+not)\s+(?:currently\s+)?(?:offer|provide|support)?\s*(?:visa\s+)?sponsor/i,
  /\bno\s+(?:visa\s+)?sponsorship\b/i,
  /\bsponsorship\s+(?:is\s+)?not\s+(?:available|offered|provided)\b/i,
  /\bnot\s+eligible\s+for\s+(?:visa\s+)?sponsorship\b/i,
  /\bwithout\s+(?:employer\s+)?sponsorship\b/i,
  /\bu\.?s\.?\s+citizenship\s+(?:is\s+)?required\b/i,
  /\bmust\s+be\s+a\s+u\.?s\.?\s+citizen\b/i,
  /\bu\.?s\.?\s+citizens\s+only\b/i,
];

/** True only when the text explicitly rules out sponsorship (D3). */
export function sponsorshipConflictInText(text: string): boolean {
  return SPONSORSHIP_CONFLICTS.some((p) => p.test(text));
}
