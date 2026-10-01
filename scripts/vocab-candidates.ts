/**
 * Mines fetched JD texts from the deployment for vocabulary candidates:
 * counts 1–3-gram document frequencies across all JDs and writes a review
 * sheet to gitignored data/vocab/candidates.csv, flagging terms the
 * vocabulary already covers. Boilerplate terms are stopword-filtered; the
 * output is for human curation of shared/vocabulary.json, never ingested
 * automatically.
 *
 * Usage: pnpm tsx scripts/vocab-candidates.ts [minDf]
 */
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { toCsv } from "../lib/csv";
import { canonicalizeKeyword } from "../lib/vocabulary";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* optional */
    }
  }
}

function siteUrl(): string {
  if (process.env.CONVEX_SITE_URL) return process.env.CONVEX_SITE_URL;
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (cloud?.includes(".convex.cloud")) {
    return cloud.replace(".convex.cloud", ".convex.site");
  }
  throw new Error("Set CONVEX_SITE_URL in .env.local");
}

// English function words plus JD boilerplate that would otherwise dominate
// the frequency table. A term is dropped when any of its tokens (1-grams) or
// its first/last token (n-grams) is a stopword.
const STOPWORDS = new Set(
  `a an and are as at be been being but by can could did do does for from had
   has have how i if in into is it its may might more most much must not of on
   or other our out over s so some such t than that the their them then there
   these they this those through to under up was we were what when where which
   while who whose why will with would you your yours
   ability able about across additional after all along also any applicable
   applicants application apply around assist assistance available based
   basis before benefits best better between both business candidate
   candidates career careers color commitment communication company
   compensation complete contact creed culture currently customers
   day days degree description detail details disability diverse diversity
   during duties dynamic each eligible email employee employees employer
   employment ensure environment equal etc every excellent exciting
   experience experiences gender great help here high highly hire hiring hour
   hours ideal identity include includes including information innovative
   intern interns internship internships job jobs join law learn learning
   level like limited location looking make making manager many member
   members mission national need needs new offer offers one only opportunity
   opportunities orientation origin others part people per performance
   perks please plus position positions pursuing race related religion
   required requirements responsibilities responsible resume role roles
   seeking semester sex sexual should skills status strong student students
   summer support team teams time tools training two understanding united
   university us use using various veteran we well within without
   work working world year years`
    .split(/\s+/)
    .filter(Boolean),
);

const TOKEN_PATTERN = /[a-z0-9][a-z0-9+#./-]*/g;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_PATTERN) ?? []).map((t) =>
    t.replace(/^[./-]+|[./-]+$/g, ""),
  );
}

function isNoise(token: string): boolean {
  return token.length < 2 || /^[\d.,$%/-]+$/.test(token);
}

/** Unique 1–3-grams of one document, stopword- and noise-filtered. */
export function documentTerms(text: string): Set<string> {
  const tokens = tokenize(text).filter((t) => !isNoise(t));
  const terms = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    if (!STOPWORDS.has(tokens[i])) terms.add(tokens[i]);
    for (const n of [2, 3]) {
      if (i + n > tokens.length) continue;
      const gram = tokens.slice(i, i + n);
      // Interior stopwords are fine ("head of ai"); boundary ones are not.
      if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[n - 1])) continue;
      terms.add(gram.join(" "));
    }
  }
  return terms;
}

const MAX_ROWS = 2000;

async function main() {
  loadEnv();
  const minDf = Number(process.argv[2]) || 5;
  const secret = process.env.ML_SHARED_SECRET;
  if (!secret) throw new Error("ML_SHARED_SECRET is not set");

  const df = new Map<string, number>();
  let docs = 0;
  let cursor: string | null = null;
  for (;;) {
    const url = new URL(`${siteUrl()}/ml/export`);
    url.searchParams.set("kind", "jd_texts");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      throw new Error(`export failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as {
      page: { title: string; jdText: string | null }[];
      isDone: boolean;
      continueCursor: string;
    };
    for (const item of body.page) {
      if (!item.jdText) continue;
      docs++;
      for (const term of documentTerms(`${item.title}\n${item.jdText}`)) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
    if (body.isDone) break;
    cursor = body.continueCursor;
  }
  if (docs === 0) throw new Error("no fetched JDs on this deployment yet");

  const rows = [...df.entries()]
    .filter(([, count]) => count >= minDf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ROWS)
    .map(([term, count]) => ({
      term,
      n: String(term.split(" ").length),
      df: String(count),
      docFraction: (count / docs).toFixed(3),
      inVocabulary: canonicalizeKeyword(term) ?? "",
    }));

  await mkdir("data/vocab", { recursive: true });
  await writeFile(
    "data/vocab/candidates.csv",
    toCsv(rows, ["term", "n", "df", "docFraction", "inVocabulary"]),
    "utf8",
  );
  console.log(
    `wrote data/vocab/candidates.csv: ${rows.length} terms ` +
      `(df >= ${minDf}) from ${docs} JDs`,
  );
}

const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/vocab-candidates.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
