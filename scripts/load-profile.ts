/**
 * Loads profile.seed.json (and the resume PDF it points at) into Convex via
 * the shared-secret /admin/seed-profile endpoint.
 *
 * Usage: pnpm seed:profile
 * Requires .env.local with NEXT_PUBLIC_CONVEX_URL (or CONVEX_SITE_URL) and
 * ML_SHARED_SECRET set on both sides.
 */
import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  profileSeedSchema,
  type SeedProfilePayload,
} from "../lib/schemas/profileSeed";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // file may not exist; fine
    }
  }
}

function siteUrl(): string {
  if (process.env.CONVEX_SITE_URL) return process.env.CONVEX_SITE_URL;
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!cloud) {
    throw new Error("Set CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_URL in .env.local");
  }
  if (cloud.includes(".convex.cloud")) {
    return cloud.replace(".convex.cloud", ".convex.site");
  }
  // Anonymous/local deployments serve HTTP actions on port + 1.
  const url = new URL(cloud);
  if (url.port) {
    url.port = String(Number(url.port) + 1);
    return url.toString().replace(/\/$/, "");
  }
  throw new Error(`Can't derive the HTTP actions URL from ${cloud}; set CONVEX_SITE_URL`);
}

async function extractResumeText(path: string): Promise<string | undefined> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch {
    console.warn(`No resume found at ${path} — seeding without resume text.`);
    return undefined;
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    console.warn("Resume PDF contained no extractable text.");
    return undefined;
  }
  return cleaned;
}

async function main() {
  loadEnv();
  const secret = process.env.ML_SHARED_SECRET;
  if (!secret) throw new Error("ML_SHARED_SECRET is not set");

  const raw: unknown = JSON.parse(await readFile("profile.seed.json", "utf8"));
  const seed = profileSeedSchema.parse(raw);
  const resumeText = await extractResumeText(seed.resumePath);

  const { resumePath: _unused, ...rest } = seed;
  const payload: SeedProfilePayload = { ...rest, resumeText };

  const res = await fetch(`${siteUrl()}/admin/seed-profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Seed failed (${res.status}): ${body}`);
  }
  console.log(
    `Profile seeded for ${seed.email}${resumeText ? ` with ${resumeText.length} chars of resume text` : ""}:`,
    body,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
