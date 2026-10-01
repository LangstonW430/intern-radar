/**
 * Scores the user's eval-split labels with the current scoring config and
 * prints precision@10 and AUC — once with weights replayed from the full
 * feedback history, once with initial (anchor) weights only, so the value
 * added by learning is visible.
 *
 * Replay and scoring run locally with the same lib code Convex uses; the
 * deployment only exports the inputs (shared-secret endpoint).
 *
 * Usage: pnpm tsx scripts/eval.ts <email>
 */
import process from "node:process";
import { precisionAtK, rankAuc, type ScoredLabel } from "../lib/evalMetrics";
import type { FeedbackEvent } from "../lib/feedbackAggregate";
import {
  replayWeights,
  type ReplayListingInput,
} from "../lib/keywordLearn";
import { scoreListing } from "../lib/keywordScore";
import type { KeywordStats } from "../lib/keywordStats";
import type { KeywordWeightMap } from "../lib/keywordWeights";
import { parseNoJdPenalty } from "../lib/score";

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

interface EvalExport {
  email: string;
  anchors: KeywordWeightMap;
  structuralWeights: Record<string, number>;
  stats: KeywordStats;
  events: FeedbackEvent[];
  evalLabels: { listingId: string; label: "good" | "bad"; hadJd: boolean }[];
  listings: Record<string, ReplayListingInput>;
}

function scoreEvalSet(
  data: EvalExport,
  weights: KeywordWeightMap,
  noJdPenalty: number,
): ScoredLabel[] {
  const rows: ScoredLabel[] = [];
  for (const label of data.evalLabels) {
    const listing = data.listings[label.listingId];
    if (!listing) continue;
    const { score } = scoreListing({
      structural: listing.structural,
      structuralWeights: data.structuralWeights,
      listingKeywords: listing.listingKeywords,
      customHits: listing.customHits,
      keywordWeights: weights,
      stats: data.stats,
      hasJd: listing.hasJd,
      noJdPenalty,
    });
    rows.push({ score, y: label.label === "good" ? 1 : 0 });
  }
  return rows;
}

function report(name: string, rows: ScoredLabel[]): void {
  const p10 = precisionAtK(rows, 10);
  const auc = rankAuc(rows);
  console.log(
    `${name.padEnd(22)} precision@10 = ${p10 === null ? "n/a" : p10.toFixed(3)}` +
      `   AUC = ${auc === null ? "n/a" : auc.toFixed(3)}   (${rows.length} labels)`,
  );
}

async function main() {
  loadEnv();
  const email = process.argv[2];
  if (!email) throw new Error("usage: eval.ts <email>");
  const secret = process.env.ML_SHARED_SECRET;
  if (!secret) throw new Error("ML_SHARED_SECRET is not set");

  const res = await fetch(
    `${siteUrl()}/admin/eval-export?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!res.ok) {
    throw new Error(`export failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as EvalExport;
  if (data.evalLabels.length === 0) {
    throw new Error(`no eval-split labels for ${email}`);
  }

  const evalSet = new Set(data.evalLabels.map((l) => l.listingId));
  const trainEvents = data.events.filter((e) => !evalSet.has(e.listingId));
  const listings = new Map(Object.entries(data.listings));
  const base = {
    anchors: data.anchors,
    listings,
    structuralWeights: data.structuralWeights,
    stats: data.stats,
  };
  const replayed = replayWeights({ ...base, events: trainEvents });
  const initialOnly = replayWeights({ ...base, events: [] });

  const noJdPenalty = parseNoJdPenalty(process.env.NO_JD_PENALTY);
  console.log(
    `eval for ${data.email}: ${data.evalLabels.length} eval labels, ` +
      `${trainEvents.length} feedback events replayed`,
  );
  report("replayed weights", scoreEvalSet(data, replayed, noJdPenalty));
  report("initial weights only", scoreEvalSet(data, initialOnly, noJdPenalty));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
