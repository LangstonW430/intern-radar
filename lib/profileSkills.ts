import type { Interest } from "./schemas/profileSeed";
import {
  keywordIdForInterest,
  matchVocabulary,
  VOCAB_BY_ID,
} from "./vocabulary";

/**
 * Skill-list helpers for onboarding and settings. Suggestions are always
 * merged into what the user already has — detected skills never replace or
 * remove a user's edits.
 */

export function mergeSkillSuggestions(
  current: string[],
  detected: string[],
): string[] {
  const seen = new Set(current.map((s) => s.trim().toLowerCase()));
  const merged = [...current];
  for (const skill of detected) {
    const key = skill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(skill);
  }
  return merged;
}

/** The detected skills that aren't in the user's list yet — what the UI
 * offers as clickable suggestions. */
export function newSkillSuggestions(
  current: string[],
  detected: string[],
): string[] {
  const have = new Set(current.map((s) => s.trim().toLowerCase()));
  return detected.filter((s) => !have.has(s.trim().toLowerCase()));
}

/** A few starter interest suggestions from resume skills; interests
 * themselves default to empty — these are offers, never auto-added. */
export function suggestInterests(
  resumeSkills: string[],
  existing: Interest[],
  max = 5,
): string[] {
  const taken = new Set(existing.map((i) => i.keyword.trim().toLowerCase()));
  return resumeSkills
    .filter((s) => !taken.has(s.trim().toLowerCase()))
    .slice(0, max);
}

/** Domain / role / work-style vocabulary terms found in the resume text —
 * offered as interest chips alongside the detected skills (which have their
 * own list and would be noise here). Offers only, never auto-added. */
export function suggestInterestsFromResume(
  resumeText: string,
  existing: Interest[],
  max = 8,
): string[] {
  const taken = new Set(existing.map((i) => keywordIdForInterest(i.keyword)));
  const out: string[] = [];
  for (const id of matchVocabulary(resumeText)) {
    const entry = VOCAB_BY_ID.get(id);
    if (!entry || entry.category === "skill" || taken.has(id)) continue;
    out.push(entry.name);
    if (out.length >= max) break;
  }
  return out;
}
