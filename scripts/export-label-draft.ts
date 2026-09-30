/**
 * Exports ~200 varied scored listings for bootstrap labeling. Writes, all
 * under the gitignored data/labels/:
 *   - draft.csv                 the sheet to label (label/reason start empty)
 *   - jd/<listingId>.txt        cleaned JD text for every row that has one
 *   - profile.json              the profile (preferences + strengths + resume
 *                               text) that labels must be judged against
 *
 * Usage: pnpm tsx scripts/export-label-draft.ts <email> [count]
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  const { rows, profile } = (await res.json()) as {
    rows: {
      listingId: string;
      company: string;
      title: string;
      location: string;
      url: string;
      score: number;
      droppedBy: string | null;
      hadJd: boolean;
      jdText: string | null;
    }[];
    profile: Record<string, unknown> | null;
  };
  if (profile === undefined) {
    throw new Error(
      "The deployment doesn't return a profile — deploy the latest Convex code first.",
    );
  }
  if (profile === null) {
    throw new Error(`No profile found for ${email} on this deployment.`);
  }

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

  // Fresh JD directory so stale files from a previous export can't mislead.
  await rm("data/labels/jd", { recursive: true, force: true });
  await mkdir("data/labels/jd", { recursive: true });
  let jdCount = 0;
  for (const row of rows) {
    if (row.jdText) {
      await writeFile(`data/labels/jd/${row.listingId}.txt`, row.jdText, "utf8");
      jdCount++;
    }
  }
  await writeFile(
    "data/labels/profile.json",
    JSON.stringify(profile, null, 2),
    "utf8",
  );
  console.log(
    `wrote data/labels/draft.csv (${rows.length} rows), ` +
      `${jdCount} JD files under data/labels/jd/, and data/labels/profile.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
