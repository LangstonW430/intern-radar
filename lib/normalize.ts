/**
 * Normalization of Simplify's freeform-ish fields into our enums.
 * Unknown values map to explicit fallbacks — never throw.
 */

export type NormalizedCategory =
  | "ai_ml_data"
  | "swe"
  | "hardware"
  | "product"
  | "quant"
  | "other";

const CATEGORY_MAP: Record<string, NormalizedCategory> = {
  "ai/ml/data": "ai_ml_data",
  "data science, ai & machine learning": "ai_ml_data",
  software: "swe",
  "software engineering": "swe",
  hardware: "hardware",
  "hardware engineering": "hardware",
  product: "product",
  "product management": "product",
  quant: "quant",
  "quantitative finance": "quant",
};

export function normalizeCategory(raw: string): NormalizedCategory {
  return CATEGORY_MAP[raw.trim().toLowerCase()] ?? "other";
}

export type NormalizedSponsorship =
  | "offers"
  | "no_sponsorship"
  | "us_citizenship_required"
  | "unknown";

const SPONSORSHIP_MAP: Record<string, NormalizedSponsorship> = {
  "offers sponsorship": "offers",
  "does not offer sponsorship": "no_sponsorship",
  "u.s. citizenship is required": "us_citizenship_required",
};

export function normalizeSponsorship(raw: string): NormalizedSponsorship {
  return SPONSORSHIP_MAP[raw.trim().toLowerCase()] ?? "unknown";
}

export type RemoteType = "onsite" | "remote" | "hybrid" | "unknown";

/**
 * Location strings look like "Remote in USA", "Hybrid in NYC", "Chicago, IL".
 * All-remote → remote; any remote/hybrid mixed with physical → hybrid.
 */
export function detectRemoteType(locations: string[]): RemoteType {
  if (locations.length === 0) return "unknown";
  const isRemote = (l: string) => /^\s*remote\b/i.test(l);
  const isHybrid = (l: string) => /hybrid/i.test(l);
  const remoteCount = locations.filter(isRemote).length;
  const hybridCount = locations.filter(isHybrid).length;
  if (hybridCount > 0) return "hybrid";
  if (remoteCount === locations.length) return "remote";
  if (remoteCount > 0) return "hybrid";
  return "onsite";
}

export type NormalizedDegree =
  | "bachelors"
  | "masters"
  | "phd"
  | "other";

const DEGREE_MAP: Record<string, NormalizedDegree> = {
  "bachelor's": "bachelors",
  "master's": "masters",
  phd: "phd",
};

/** Normalizes the degrees array; empty input means "unstated" and returns []. */
export function normalizeDegrees(raw: string[]): NormalizedDegree[] {
  const out = new Set<NormalizedDegree>();
  for (const d of raw) {
    out.add(DEGREE_MAP[d.trim().toLowerCase()] ?? "other");
  }
  return [...out];
}
