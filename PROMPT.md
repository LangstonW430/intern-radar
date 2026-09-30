Read CLAUDE.md fully before doing anything. We're building Phase 1 of intern-radar: a $0, no-paid-AI-API app that ingests SimplifyJobs Summer 2027 postings, filters and ranks them with our own trained, per-user model, and sends me digests. The repo is public — nothing private gets committed.

## Step 0 — Verify before you design

1. Find the current SimplifyJobs Summer 2027 internships repo. Locate the structured listings JSON that generates the README (historically under `.github/scripts/`). Report: exact path, fields per listing, the stable unique ID, and how sponsorship, locations, active status, and category are represented. If there's no structured JSON, stop and tell me.
2. From a sample of real listing URLs, report roughly what share are Greenhouse, Lever, Ashby, Workday, and other. Confirm the public job-board endpoints for Greenhouse, Lever, and Ashby and what JD fields they return.
3. Confirm current free-tier limits for Convex, Vercel Hobby, Resend, and GitHub Actions and flag anything in CLAUDE.md that would break them.

## Step 1 — Plan, then wait

Write a plan covering: folder layout (Next.js app, `convex/`, `ml/`), Convex schema, zod schemas for listings and each ATS response, the feature list with how each is computed, the shared feature-definition format for TS and Python, the export/import endpoints between Convex and the Actions job, and the build order below with commit points. **Stop and wait for my approval before writing code.**

## Step 2 — Build (after approval), committing at each step once checks pass

1. **Scaffold:** Next.js (App Router, TS strict, Tailwind), Convex, Vitest, pnpm; `ml/` with uv + pytest. `.env.example`, `.gitignore` per CLAUDE.md, `git config core.hooksPath .githooks`. README with GeoNames attribution.
2. **Auth:** Convex Auth email sign-in, gated by `ALLOWED_EMAILS`.
3. **Profile:** schema + `profile.seed.example.json` (already in repo) + a mutation that loads `profile.seed.json`. Resume text extracted from `private/resume.pdf` with unpdf.
4. **Ingest:** GitHub client, zod parsing, commit-SHA short-circuit, diff, hourly cron. Unit tests with fixture data from the real JSON.
5. **JD fetch:** Greenhouse/Lever/Ashby clients, HTML-to-text cleanup, stored on the listing. Tests with recorded fixtures.
6. **Geocoding:** script that preprocesses the GeoNames cities dataset into a compact lookup; location normalizer with tests (including remote/hybrid and multi-location listings).
7. **Hard filters:** pure function returning `{ pass, droppedBy }`, one test per preference type and strength.
8. **ML job, part 1:** Convex export endpoint (shared-secret auth), Python job that embeds listings + resume with bge-small and pushes vectors back, GitHub Actions workflow (nightly cron + `repository_dispatch` + keepalive). Model/pip cache so runs stay fast.
9. **Scoring:** features + prior weights from strengths + sigmoid scoring in Convex, feature snapshot stored per match. Rocchio preference vector update.
10. **Bootstrap labels — STOP POINT.** Before this step, ask me to fill in `profile.seed.json` if I haven't. Then write a script that exports ~200 real listings (varied: likely matches, borderline, clear misses) to `data/labels/draft.csv` with columns `listingId, company, title, location, url, label, reason`. Draft each label (good/bad) and a one-line reason strictly from my profile — don't infer preferences I didn't set. **Stop and let me review and edit the CSV.** After I confirm, import it with a fixed random 50-label eval split.
11. **Training + eval:** global logistic regression, per-user weights with L2 toward global, precision@10 on the eval split, versioned push to Convex, promotion only if precision@10 >= current.
12. **Matches page:** ranked matches with score, top contributing features in plain language, and actions: Applied (then prompts "Was this a good suggestion?"), thumbs up/down. Settings page to edit preferences and their strength (hard/strong/soft/ignore), threshold, frequency, and wildcards.
13. **Digest:** React Email template, Resend client, HMAC-signed expiring feedback links, per-frequency cron, exploration wildcards tagged. Sends only to allowlisted users.

## Done when

- The full pipeline runs end to end: ingest → JD → geocode → filter → score → digest, and the Actions job trains and promotes a model
- I receive a real digest and can give feedback from both the email and the web
- precision@10 is reported for the first trained model vs. the prior-weights baseline
- All pure logic has tests; everything passes; CLAUDE.md's Commands section is filled in

Ask me whenever real data doesn't match these assumptions. Never guess at my profile or preferences.
