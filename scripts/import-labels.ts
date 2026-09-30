/**
 * Imports the owner-reviewed data/labels/draft.csv into Convex with a fixed,
 * deterministic eval split (seeded shuffle; up to 50 labels, at most 25%).
 * Rows with an empty label column are skipped.
 *
 * Usage: pnpm tsx scripts/import-labels.ts <email> [path]
 */
import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseCsv, seededShuffle } from "../lib/csv";

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

async function main() {
  loadEnv();
  const email = process.argv[2];
  const path = process.argv[3] ?? "data/labels/draft.csv";
  if (!email) throw new Error("usage: import-labels.ts <email> [csv path]");
  const secret = process.env.ML_SHARED_SECRET;
  if (!secret) throw new Error("ML_SHARED_SECRET is not set");

  const rows = parseCsv(await readFile(path, "utf8"));
  const labeled = rows.filter((r) => {
    const label = r.label?.trim().toLowerCase();
    if (!label) return false;
    if (label !== "good" && label !== "bad") {
      throw new Error(`row ${r.listingId}: label must be good/bad, got "${r.label}"`);
    }
    return true;
  });
  if (labeled.length === 0) throw new Error("no labeled rows in the CSV");

  const evalCount = Math.min(50, Math.floor(labeled.length * 0.25));
  const shuffledIds = seededShuffle(
    labeled.map((r) => r.listingId).sort(),
    42,
  );
  const evalIds = new Set(shuffledIds.slice(0, evalCount));

  const items = labeled.map((r) => ({
    listingId: r.listingId,
    label: r.label.trim().toLowerCase() as "good" | "bad",
    reason: r.reason?.trim() ?? "",
    split: evalIds.has(r.listingId) ? ("eval" as const) : ("train" as const),
    hadJd: r.hadJd?.trim().toLowerCase() === "true",
  }));

  const res = await fetch(`${siteUrl()}/admin/import-labels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, items }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`import failed (${res.status}): ${body}`);
  console.log(
    `imported ${items.length} labels (${evalCount} eval, ${items.length - evalCount} train):`,
    body,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
