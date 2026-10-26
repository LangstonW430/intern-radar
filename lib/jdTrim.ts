import { headingType, isUnknownHeading } from "./jdExtract";

/**
 * Storage cap for cleaned JD text. Real postings carry a lot of page chrome
 * and boilerplate (benefits, EEO statements, cookie banners) that the
 * cleaner keeps; past this size the extra text costs database storage on
 * every listing without adding keyword signal.
 */
export const JD_MAX_CHARS = 8000;

type Line = { text: string; priority: boolean };

/**
 * Trims cleaned JD text to `maxChars`, keeping whole lines. The requirements
 * and preferred sections survive first (they drive position-weighted
 * keywords and skill coverage); the remaining budget is filled from the top
 * of the document so the intro and role description come next and trailing
 * boilerplate goes first. Text within the cap is returned unchanged.
 */
export function trimJdText(text: string, maxChars = JD_MAX_CHARS): string {
  if (text.length <= maxChars) return text;

  const lines = classifyLines(text.split("\n"));
  const keep = new Array<boolean>(lines.length).fill(false);
  let used = 0;

  const tryKeep = (i: number): boolean => {
    const cost = lines[i].text.length + 1;
    if (used + cost > maxChars) return false;
    keep[i] = true;
    used += cost;
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].priority && !tryKeep(i)) break;
  }
  for (let i = 0; i < lines.length; i++) {
    if (!keep[i] && !tryKeep(i)) break;
  }

  const out = lines
    .filter((_, i) => keep[i])
    .map((l) => l.text)
    .join("\n")
    .trim();
  // A single line longer than the whole budget (no newlines at all).
  return out.length > 0 ? out : text.slice(0, maxChars).trim();
}

// Mirrors splitSections' MAX_BULLETS: a section that runs on without a new
// heading (benefits, legal) stops being priority after this many lines.
const MAX_PRIORITY_LINES = 16;

function classifyLines(raw: string[]): Line[] {
  let inPriority = false;
  let priorityLines = 0;
  return raw.map((text) => {
    const type = headingType(text);
    if (type) {
      inPriority = type === "requirements" || type === "preferred";
      priorityLines = 0;
    } else if (isUnknownHeading(text)) {
      inPriority = false;
    }
    const priority = inPriority && priorityLines < MAX_PRIORITY_LINES;
    if (priority) priorityLines++;
    return { text, priority };
  });
}
