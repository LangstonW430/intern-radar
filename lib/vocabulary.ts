import { z } from "zod";
import vocabularyJson from "../shared/vocabulary.json";
import { aliasPattern } from "./jdExtract";

/**
 * The keyword vocabulary for the per-user keyword-weight model.
 * shared/vocabulary.json is the single source of truth: canonical ids with
 * lowercase aliases, word-boundary matched with the same symbol-safe
 * semantics as the skill dictionary (c++, c#, .net all survive).
 */

export const CATEGORIES = [
  "skill",
  "domain",
  "role_type",
  "work_style",
] as const;
export type VocabCategory = (typeof CATEGORIES)[number];

const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  category: z.enum(CATEGORIES),
});
const vocabularyFileSchema = z.object({
  version: z.number().int().positive(),
  comment: z.string().optional(),
  entries: z.array(entrySchema).min(1),
});

export type VocabEntry = z.infer<typeof entrySchema>;

export const VOCABULARY_FILE = vocabularyFileSchema.parse(vocabularyJson);
export const VOCABULARY: VocabEntry[] = VOCABULARY_FILE.entries;
export const VOCABULARY_VERSION = VOCABULARY_FILE.version;

export const VOCAB_BY_ID: ReadonlyMap<string, VocabEntry> = new Map(
  VOCABULARY.map((e) => [e.id, e]),
);
if (VOCAB_BY_ID.size !== VOCABULARY.length) {
  throw new Error("shared/vocabulary.json contains duplicate ids");
}

const MATCHERS: { id: string; patterns: RegExp[] }[] = VOCABULARY.map((e) => ({
  id: e.id,
  patterns: e.aliases.map(aliasPattern),
}));

/** Canonical ids of every vocabulary entry present in the text. */
export function matchVocabulary(text: string): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  for (const matcher of MATCHERS) {
    if (matcher.patterns.some((p) => p.test(text))) {
      found.add(matcher.id);
    }
  }
  return found;
}

const ALIAS_TO_ID: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const entry of VOCABULARY) {
    // First entry wins on alias collisions (e.g. "c/c++" → cpp), matching
    // the dictionary-order precedence the skill extractor uses.
    for (const key of [entry.id, entry.name.toLowerCase(), ...entry.aliases]) {
      if (!map.has(key)) map.set(key, entry.id);
    }
  }
  return map;
})();

/** Resolve free text to a canonical vocabulary id, or null if unknown. */
export function canonicalizeKeyword(freeText: string): string | null {
  return ALIAS_TO_ID.get(freeText.trim().toLowerCase()) ?? null;
}

/**
 * Weight-map key for a free-text keyword outside the vocabulary. The slug is
 * stable so the same custom interest always maps to the same key.
 */
export const CUSTOM_KEYWORD_PREFIX = "custom:";

export function customKeywordId(freeText: string): string {
  const slugged = freeText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${CUSTOM_KEYWORD_PREFIX}${slugged}`;
}

export function isCustomKeywordId(id: string): boolean {
  return id.startsWith(CUSTOM_KEYWORD_PREFIX);
}

/**
 * The weight-map key for an interest keyword: its canonical vocabulary id
 * when the text resolves to one, else a namespaced custom key.
 */
export function keywordIdForInterest(freeText: string): string {
  return canonicalizeKeyword(freeText) ?? customKeywordId(freeText);
}

/** Display name for a weight-map key (vocab name, or the custom slug). */
export function keywordDisplayName(id: string): string {
  if (isCustomKeywordId(id)) {
    return id.slice(CUSTOM_KEYWORD_PREFIX.length).replace(/-/g, " ");
  }
  return VOCAB_BY_ID.get(id)?.name ?? id;
}
