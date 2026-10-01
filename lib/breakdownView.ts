import type { ScoreBreakdown } from "./keywordScore";
import { keywordDisplayName } from "./vocabulary";

/** Human labels for a stored score breakdown — shared by the matches API,
 * the match detail panel, and the digest's one-line "why". */

export const FACTOR_LABELS: Record<string, string> = {
  embed_sim_resume: "Similar to your resume",
  loc_proximity: "Near your preferred location",
  work_mode_match: "Work mode fits",
  role_category_match: "Role category fits",
  sponsorship_match: "Sponsorship fits",
  class_year_signal: "Class year fits",
  company_affinity: "Company you've engaged with before",
  recency: "Recently posted",
  required_skill_coverage: "You have the required skills",
  preferred_skill_coverage: "You have preferred skills",
  degree_fit: "Degree level fits",
};

export interface Factor {
  label: string;
  contribution: number;
}

export function breakdownFactors(breakdown: ScoreBreakdown): Factor[] {
  return [
    ...breakdown.structural.map((s) => ({
      label: FACTOR_LABELS[s.name] ?? s.name,
      contribution: s.contribution,
    })),
    ...breakdown.keywords.map((k) => ({
      label:
        k.contribution >= 0
          ? `Mentions ${keywordDisplayName(k.id)}`
          : `Mentions ${keywordDisplayName(k.id)} (works against it)`,
      contribution: k.contribution,
    })),
  ];
}

/** The strongest positive factors — the match list's chips. */
export function topPositiveFactors(
  breakdown: ScoreBreakdown | undefined,
  minContribution = 0.2,
  max = 3,
): string[] {
  if (!breakdown) return [];
  return breakdownFactors(breakdown)
    .filter((f) => f.contribution > minContribution)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, max)
    .map((f) => f.label);
}

/** The dominant factors by |contribution| — explanations. */
export function dominantFactors(
  breakdown: ScoreBreakdown | undefined,
  minAbs = 0.15,
  max = 3,
): string[] {
  if (!breakdown) return [];
  return breakdownFactors(breakdown)
    .filter((f) => Math.abs(f.contribution) > minAbs)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, max)
    .map((f) => f.label);
}

/** One line for the digest: the top 2–3 contributions, or null. */
export function whyLine(breakdown: ScoreBreakdown | undefined): string | null {
  const top = dominantFactors(breakdown, 0.15, 3);
  return top.length > 0 ? top.join(" · ") : null;
}
