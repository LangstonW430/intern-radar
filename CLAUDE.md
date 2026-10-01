# intern-radar

Watches the SimplifyJobs Summer 2027 internship list, filters and ranks new postings against each user's profile with a per-user keyword-weight model learned online from their feedback, and emails matches on a user-chosen schedule. **Open sign-up from day one** — anyone can create an account (it just isn't advertised). `ADMIN_EMAILS` gates admin-only surfaces (`/admin`); everything else is available to any signed-up user.

## Hard constraints

- **$0 to run** while it's a personal tool. Only free tiers: Vercel Hobby, Convex free, Resend free, GitHub Actions, GitHub.
- **No paid AI APIs.** All matching, embedding, and learning uses open models and our own code. No Anthropic/OpenAI/etc. calls anywhere in the app or pipeline.
- **Public repo.** Nothing private is ever committed: no secrets, no profile data, no resumes, no labels, no feedback exports. Secrets live in Convex env vars, Vercel env vars, and GitHub encrypted secrets.

## Git and commit rules (non-negotiable)

- All commits are authored and credited to the repo owner only, using the git identity already configured. Never change `user.name` or `user.email`.
- Never add `Co-Authored-By: Claude`, `Generated with Claude Code`, `Claude-Session:`, or any other Claude/Anthropic attribution to commit messages, PR titles, or PR descriptions.
- Never pass `--author` or `--no-verify` to `git commit`. `.githooks/commit-msg` strips attribution as a backstop; `core.hooksPath` must point at `.githooks`.
- Conventional prefixes (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), imperative subject <= 72 chars, body only when the why isn't obvious.
- Small, focused commits, only after typecheck, lint, and tests pass.

## Stack

- **App:** Next.js (App Router), TypeScript strict, React, Tailwind — hosted on Vercel Hobby
- **Backend/DB:** Convex — tables, crons, scheduled functions, HTTP endpoints, file storage, vector search
- **Auth:** Convex Auth, email OTP sign-in, open sign-up. Abuse protection: Cloudflare Turnstile on the sign-in email request, rate limits per email / per IP / global daily (sign-in emails share Resend's 100/day free cap with digests, so the mail budget is guarded). OTP emails are only sent when a server-side single-use permit exists, so the gated endpoint can't be bypassed via direct `signIn` calls.
- **Email:** Resend + React Email, sending from a verified subdomain of the owner's domain
- **ML job:** Python 3.12 on GitHub Actions (nightly cron + `repository_dispatch`), managed with uv
  - JD fetching: httpx against public/internal ATS JSON endpoints; Playwright (cached chromium) only as the iCIMS fallback
  - Embeddings: `BAAI/bge-small-en-v1.5` via fastembed (ONNX Runtime — no torch; lighter CI installs and runs under Windows App Control locally). Embeddings feed only the optional `embed_sim_resume` feature, which is **off by default** (`shared/scoring.json`); nothing else depends on them.
  - Tests: pytest
- **Matching:** a per-user keyword → weight model in plain TypeScript inside Convex — a listing's score is a weighted sum of the vocabulary keywords it contains (rarity-weighted by IDF, position-weighted) plus structural terms at fixed strength-based weights, through a sigmoid. Weights update online from feedback; no trained model, no model server, no nightly training.
- **Geocoding:** offline GeoNames cities dataset, preprocessed into a compact lookup committed to the repo (CC-BY; attribute in README)
- **Other:** zod (all external/untrusted data), unpdf (resume text), Vitest, pnpm

## Architecture

### Convex side (TypeScript)
1. **Ingest** (cron, hourly): fetch the Simplify repo's structured listings JSON (never the README). Skip if the commit SHA is unchanged. Parse with zod; skip + log malformed records. Diff on the stable listing ID; insert new ones. Source repo URL is config (`SOURCE_REPO`), so switching seasons is one change.
2. **Geocode:** normalize listing locations to coordinates via the offline lookup; mark remote/hybrid separately.
3. **JD text and embeddings arrive asynchronously** from the GitHub Actions job via the import endpoints (JD fetching lives in the Actions job, not Convex — see below). Import mutations re-score affected matches. Listings track `jdStatus` (`pending | fetched | failed | unsupported`), `jdSource`, `jdFetchedAt`, `jdError`.
4. **Keywords:** on insert and on JD import, each listing gets `keywords` — vocabulary ids (`shared/vocabulary.json`, matched with the same symbol-safe word boundaries as the skill dictionary) mapped to a position weight (title 1.5 > requirements/preferred sections 1.2 > body 1.0, max wins; title-only without a JD). The single-document `keywordStats` table tracks per-keyword document frequency over active fetched-JD listings, updated incrementally (JD import, re-ingest, deactivation) with a rebuild action; IDF = `log((N+1)/(df+1)) + 1`, clamped by `idfMax`.
5. **Hard filters** (pure TS): drop listings violating any preference set to `hard`. Record which rule dropped it. Class-year and sponsorship conflicts are detected from the title **and JD text** (explicit conflicts only; unstated/unknown passes); degree level uses the structured `degrees` field.
6. **Score** (`lib/keywordScore.ts`): `rawScore = sigmoid(bias + Σ_k weight_k·idf_k·position_k + Σ_s strengthWeight_s·value_s)`; `score = rawScore × NO_JD_PENALTY` (config, default 0.6) `× agePenalty` — both fixed post-model multipliers, **never learned**. The age penalty is 1.0 for the first `graceDays` (7), then halves every `halfLifeDays` (21) down to a `floor` (0.25), so stale postings can't crowd out fresh ones no matter how well they match (`agePenalty` in `shared/scoring.json`). Learning and eval use the pre-penalty probability. Custom (out-of-vocabulary) interest keywords are matched live against title+JD with a fixed `defaultIdf`. Every match stores the structural feature values **and a breakdown** — top ±5 keyword contributions plus a remainder term and every structural contribution — that sums exactly to the logit, so the UI and digest can always show "why this score".
7. **Learn** (`convex/keywordLearn.ts`): every feedback event applies one logistic step to that user's keyword weights (see Feedback signals), then re-scores just that user's matches.
8. **Digest** (per-user frequency): top unsent matches above threshold since `lastDigestAt`, plus `wildcards` random below-threshold survivors flagged `exploration: true`. Links go to the matches page. Listings without a JD carry a "Couldn't read job description" label in both the digest and the matches page. Sent to any signed-up user who is subscribed; every digest includes an unsubscribe link (signed token, works without signing in) and a link to email settings.

### GitHub Actions side (Python)
Nightly, and on `repository_dispatch` when a resume/profile changes:
1. Pull work from Convex HTTP export endpoints (shared-secret auth, `ML_SHARED_SECRET`). **Exports are strictly incremental** — only listings missing JDs or embeddings. Never full-table exports. All write-backs go in batches of up to 100 records per HTTP call.
2. **Fetch JDs** for pending listings. Supported sources, in priority order: (1) Greenhouse — including embedded `?gh_jid=` boards, token resolved from the page — Lever, and Ashby via their public endpoints; (2) Workday via the internal CXS JSON endpoint its career pages use (tenant/site parsed from the URL, no headless browser); (3) Oracle Recruiting Cloud via its candidate-experience JSON endpoint; (4) iCIMS via plain HTTP first, Playwright fallback only where needed. Before building each of 2–4, test against ~20 real listings; if the success rate is under 50%, stop and report instead of building it. Rules for all fetching: per-host rate limiting (~1 request / 2 s per host to start), honest User-Agent, exponential backoff on errors/429s; fetch each JD once and re-fetch only if the listing record changes, with capped retries; store cleaned text only, never raw HTML; report per-listing `jdStatus`/`jdSource`/`jdError`; fail soft — a failed fetch never breaks the run.
3. Embed with bge-small (JD text if present, else title + company + category). **All embeddings come from this one job** so vectors are consistent. There is no training step — learning happens online inside Convex.

Caches (GitHub Actions cache): uv environment, the bge-small model, and the Playwright browser.

Scheduled workflows in public repos are auto-disabled after 60 days without repo activity — the workflow must include a keepalive mechanism.

## Preferences and filter strength

Every preference has a user-set strength: `hard` | `strong` | `soft` | `ignore`.
- `hard` → applied as a filter before scoring.
- `strong` / `soft` → for preferences, a structural term whose **fixed** weight comes from the strength (strong > soft; `strengthWeights` in `shared/scoring.json`) — never learned. For interests, the strength sets the keyword's initial weight (see Scoring), which feedback then tunes.
- `ignore` → not used.

Defaults: class-year and degree-level mismatches are `hard`; excluded companies are `hard`; everything else `soft`. Users can change any of them.

Data-reality semantics (the source data is mostly silent on these): a `hard` class-year filter only drops listings whose title or JD text explicitly names a conflicting class year; a `hard` sponsorship filter only drops explicit conflicts (structured field or JD text); unknown/unstated always passes. Role categories mirror the source enum: `ai_ml_data | swe | hardware | product | quant`.

Location preferences are distance-based: a feature that decays with distance from the preferred location(s), with an optional radius when set to `hard`.

## Scoring (keyword-weight model)

`score = sigmoid(bias + Σ_k weight_k × idf_k × position_k + Σ_s strengthWeight_s × value_s)`, then `× NO_JD_PENALTY` when there's no JD. Every constant — position weights, interest initials, strength weights, structural weights, IDF bounds, learning rate/decay/clamps, bias — lives in `shared/scoring.json` (zod-validated by `lib/scoringConfig.ts`).

- **Keyword terms:** `shared/vocabulary.json` holds canonical entries (id, name, aliases, category: skill | domain | role_type | work_style), seeded from the skill dictionary plus curated domain/role/work-style terms; `scripts/vocab-candidates.ts` mines JD n-gram document frequencies into gitignored `data/vocab/` for curation. Each user has `keywordWeights` on their profile: keyword → `{weight, initial, source: user|learned, sightings}`. Initials come from interests — want strong +1.0 / soft +0.5, avoid strong −1.5 / soft −0.75 (avoid is intentionally stronger); hard interests stay filters; unlisted keywords start at 0 and appear only once learned. Free-text interests outside the vocabulary get `custom:` keys, matched live at scoring time with a fixed `defaultIdf`.
- **Structural terms** (`lib/features.ts`, fixed weights, never learned): location proximity, work-mode match, role-category match, sponsorship match, class-year signal, company affinity (liked/applied to this company before), recency, required/preferred skill coverage, degree fit, and the optional `embed_sim_resume` behind a config flag (default off).
- **Explainability:** each match stores a breakdown (top ±5 keyword contributions + remainder, every structural contribution, bias) that sums exactly to the logit; the match detail panel, match-list chips, and the digest's one-line "why" all read it (`lib/breakdownView.ts`).
- A "Keyword weights" settings section lists every non-zero weight with its anchor, source, and sightings; edits set `initial = weight`, `source = user`, and trigger a replay; "reset learned weights" returns everything to its anchor.

## Feedback signals

- **Applied** → strongest positive. Always followed by a separate prompt: "Was this a good suggestion?" (yes/no) — stored separately from applied.
- **Thumbs up / down** on any match.
- **No interaction** → no signal. Never treat it as negative.
- Exploration items are tagged so learning can account for them.
- Every feedback action from email or the web is authenticated: web via session, email links via HMAC-signed, expiring tokens (`FEEDBACK_SIGNING_SECRET`). Unsubscribe links use the same signing scheme and work without signing in.

How feedback becomes a learning signal (`lib/feedbackAggregate.ts`, unchanged from the trained-model era): **one aggregate per (userId, listingId)**, never one per event. The target y is decided by the first matching rule — (1) the latest "Was this a good suggestion?" answer (good → 1, bad → 0), (2) else the latest thumbs (up → 1, down → 0), (3) else applied → 1; "latest" is by `createdAt`. The sample weight is `feedbackWeights.applied` (2.0) when the user applied to that listing — even when a suggestion answer set y — else `feedbackWeights.default` (1.0); both live in `shared/scoring.json`. Feedback on eval-split labeled listings never trains, so the eval metric stays honest.

How learning applies it (`lib/keywordLearn.ts`, run by `convex/keywordLearn.ts` the moment feedback lands): for each keyword k present in the listing, `weight_k += lr × sampleWeight × (y − p) × idf_k × position_k` where p is the current pre-penalty score; the step is capped at `rareCap / sightings` so one click can't swing a rarely seen keyword; then the weight decays toward its anchor (`weight_k −= lr × decay × (weight_k − initial_k)`) and is clamped to ±3. Sightings increment; keywords the user set keep `source: user`. `keywordLearn.replay` deterministically rebuilds the whole map by resetting to anchors and re-applying the full history in order — used after anchor edits, interest changes, vocabulary changes, and in tests. Every weight change re-scores just that user's matches.

## Cold start and evaluation

- **Labels are eval-only.** The label export/import tooling and the train/eval split survive, but train-split rows are unused — nothing trains on labels anymore. Labels live in Convex and in gitignored `data/labels/`, never committed.
- `pnpm tsx scripts/eval.ts <email>` replays the user's weights from their feedback history (via `/admin/eval-export`), scores the eval-split labels with the current scoring config, and prints **precision@10** and **AUC** — for both replayed weights and initial-weights-only, so the value added by learning is visible.
- Cold start is the interest-derived initial weights plus the strength-based structural weights; there is no separate prior-weight model.

## Data model (Convex)

- `listings` — sourceId (unique), company, title, category, locations, geo, remoteType, sponsorship, degrees, url, atsType, atsRef, jdStatus, jdSource, jdText, jdExtract, jdFetchedAt, jdError, jdAttempts, datePosted, dateUpdated, active, raw, contentHash, ingestedAt, embedding (vector), embeddingVersion, keywords (id → position weight), keywordsVersion
- `ingestIndex` — compact sourceId→contentHash chunks so hourly diffs never read full listing docs (keeps DB bandwidth ~12–20% of the free-tier 1 GB/mo; estimates in PLAN.md A5)
- `keywordStats` — single document: totalWithJd, df (keyword → document frequency over active fetched-JD listings)
- `profiles` — userId, gradDate, classYear, degreeLevel, preferences[{type, value, strength}], skills, interests, keywordWeights (keyword → {weight, initial, source, sightings}), resumeText, resumeEmbedding, threshold, frequency, wildcards, subscribed, lastDigestAt
- `rateLimits` — key (scope:identifier), windowStart, count; `authPermits` — email, expiresAt, consumed (single-use permits that gate OTP email sends)
- `matches` — userId, listingId, droppedBy (hard rule or null), features (structural values), rawScore, score (after NO_JD_PENALTY), breakdown (bias + keyword/structural contributions summing to the logit), exploration, sentAt
- `feedback` — userId, listingId, kind (applied | thumbs_up | thumbs_down | good_suggestion | bad_suggestion), source (web | email), createdAt
- `labels` — userId, listingId, label, reason, reviewed, split (train | eval), hadJd — eval-only now
- `ingestState` — lastCommitSha, lastRunAt, lastError
- Convex Auth tables

Removed in the keyword-weight pivot: the `models` and `userWeights` tables, `profiles.preferenceVector` (Rocchio), `matches.modelVersion`, the Python trainer and its export/import endpoints, and the `interest_match` / `avoid_match` / `has_jd` / `embed_sim_pref` features.

## Conventions

- Pure logic (normalization, diffing, filters, features, scoring, learning, digest selection) lives in plain TS modules with unit tests; Convex functions are thin wrappers.
- All scoring/learning constants live in `shared/scoring.json`; the keyword vocabulary in `shared/vocabulary.json`; the skill dictionary (extraction + coverage features) in `shared/skills.json`. Each is zod-validated at module load.
- Every external call (GitHub, ATS endpoints, Resend) goes through one small client module with timeouts and logged errors.
- Env vars documented in `.env.example`: `SOURCE_REPO`, `GITHUB_TOKEN` (optional), `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `ADMIN_EMAILS`, `ML_SHARED_SECRET`, `FEEDBACK_SIGNING_SECRET`, `GITHUB_DISPATCH_TOKEN`, `NO_JD_PENALTY` (default 0.6), `APP_URL`, `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Turnstile is skipped when unset — local dev).
- Add no dependency without stating why.

## Gitignored (must stay out of the public repo)

`.env*`, `profile.seed.json`, `private/` (resume), `data/labels/`, `data/vocab/`, any feedback exports.

## Onboarding and account lifecycle (Phase 1)

- Onboarding flow for every user (the owner included): resume upload to Convex file storage → text extraction with unpdf → **the PDF is deleted immediately after parsing** (only extracted text is kept) → preference questions with hard/strong/soft/ignore per preference (defaults above) → digest frequency/threshold/wildcards. `profile.seed.json` + `pnpm seed:profile` remain as a dev-only seeding shortcut.
- "Delete my account and data" removes the profile (keyword weights included), matches, feedback, labels, and auth records.
- `/privacy` page: what's stored, that resume PDFs are deleted after parsing, and how to delete your account.

## Roadmap

- **Phase 1 (current):** everything above — open sign-up with onboarding, abuse protection, unsubscribe, deletion
- **Phase 2:** curated Greater Rochester company list as a second source (ATS-supported companies only)

## Commands

- `pnpm dev` / `npx convex dev` (local: `CONVEX_AGENT_MODE=anonymous npx convex dev`)
- `pnpm typecheck` / `pnpm lint` / `pnpm test`
- `pnpm seed:profile` — load `profile.seed.json` + `private/resume.pdf` into Convex
- `pnpm tsx scripts/export-label-draft.ts <email>` / `pnpm tsx scripts/import-labels.ts <email>` — eval-label round trip (CSV in gitignored `data/labels/`)
- `pnpm tsx scripts/eval.ts <email>` — precision@10 + AUC on the eval-split labels, replayed vs initial-only weights
- `pnpm tsx scripts/vocab-candidates.ts [minDf]` — mine JD n-gram document frequencies into `data/vocab/candidates.csv` for vocabulary curation
- `pnpm tsx scripts/build-geonames.ts <cities1000.txt> <admin1CodesASCII.txt>` — rebuild the geo lookup
- `npx convex run migrate:backfillListingKeywords` / `migrate:initKeywordWeights` / `keywordStats:rebuild` — keyword-model migrations (safe to re-run)
- `cd ml && uv run pytest`
- `cd ml && uv run python -m intern_radar_ml jd|embed` (needs `CONVEX_SITE_URL` + `ML_SHARED_SECRET`)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
