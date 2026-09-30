/**
 * Exports ~200 varied scored listings to data/labels/draft.csv for the owner
 * to label (good/bad + one-line reason). The label and reason columns start
 * empty unless a drafter fills them; nothing here guesses preferences.
 *
 * Usage: pnpm tsx scripts/export-label-draft.ts <email> [count]
 */
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { toCsv } from "../lib/csv";

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
  const count = Number(process.argv[3]) || 200;
  if (!email) throw new Error("usage: export-label-draft.ts <email> [count]");
  const secret = process.env.ML_SHARED_SECRET;
  if (!secret) throw new Error("ML_SHARED_SECRET is not set");

  const res = await fetch(
    `${siteUrl()}/admin/label-candidates?email=${encodeURIComponent(email)}&count=${count}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!res.ok) throw new Error(`export failed (${res.status}): ${await res.text()}`);
  const { rows } = (await res.json()) as {
    rows: {
      listingId: string;
      company: string;
      title: string;
      location: string;
      url: string;
      score: number;
      droppedBy: string | null;
      hadJd: boolean;
    }[];
  };

  const csv = toCsv(
    rows.map((r) => ({
      listingId: r.listingId,
      company: r.company,
      title: r.title,
      location: r.location,
      url: r.url,
      score: r.score.toFixed(3),
      droppedBy: r.droppedBy ?? "",
      hadJd: String(r.hadJd),
      label: "",
      reason: "",
    })),
    [
      "listingId",
      "company",
      "title",
      "location",
      "url",
      "score",
      "droppedBy",
      "hadJd",
      "label",
      "reason",
    ],
  );
  await mkdir("data/labels", { recursive: true });
  await writeFile("data/labels/draft.csv", csv, "utf8");
  console.log(`wrote data/labels/draft.csv with ${rows.length} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
