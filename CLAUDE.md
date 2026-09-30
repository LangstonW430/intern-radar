# intern-radar

Watches the SimplifyJobs Summer 2027 internship list, filters and ranks new postings against each user's profile with a self-trained, per-user personalized model, and emails matches on a user-chosen schedule. Currently single-user (the owner) behind an allowlist; built so opening it to more users is removing the allowlist, not re-architecting.

## Hard constraints

- **$0 to run** while it's a personal tool. Only free tiers: Vercel Hobby, Convex free, Resend free, GitHub Actions, GitHub.
- **No paid AI APIs.** All matching, embedding, and learning uses open models and our own training code. No Anthropic/OpenAI/etc. calls anywhere in the app or pipeline.
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
- **Auth:** Convex Auth, email sign-in, allowlist-gated (`ALLOWED_EMAILS`)
- **Email:** Resend + React Email, sending from a verified subdomain of the owner's domain
- **ML job:** Python 3.12 on GitHub Actions (nightly cron + `repository_dispatch`), managed with uv
  - JD fetching: httpx against public/internal ATS JSON endpoints; Playwright (cached chromium) only as the iCIMS fallback
  - Embeddings: `BAAI/bge-small-en-v1.5` via fastembed (ONNX Runtime — no torch; lighter CI installs and runs under Windows App Control locally)
  - Models: logistic regression in plain numpy (global model regularized toward the prior weights, per-user weights L2-penalized toward global — a prior-mean penalty sklearn's LogisticRegression can't express, and at 11 features gradient descent is trivial)
  - Tests: pytest
- **Inference:** plain TypeScript inside Convex (dot product + sigmoid over stored weights). No model server.
- **Geocoding:** offline GeoNames cities dataset, preprocessed into a compact lookup committed to the repo (CC-BY; attribute in README)
- **Other:** zod (all external/untrusted data), unpdf (resume text), Vitest, pnpm

## Architecture

### Convex side (TypeScript)
1. **Ingest** (cron, hourly): fetch the Simplify repo's structured listings JSON (never the README). Skip if the commit SHA is unchanged. Parse with zod; skip + log malformed records. Diff on the stable listing ID; insert new ones. Source repo URL is config (`SOURCE_REPO`), so switching seasons is one change.
2. **Geocode:** normalize listing locations to coordinates via the offline lookup; mark remote/hybrid separately.
3. **JD text and embeddings arrive asynchronously** from the GitHub Actions job via the import endpoints (JD fetching lives in the Actions job, not Convex — see below). Import mutations re-score affected matches. Listings track `jdStatus` (`pending | fetched | failed | unsupported`), `jdSource`, `jdFetchedAt`, `jdError`.
4. **Hard filters** (pure TS): drop listings violating any preference set to `hard`. Record which rule dropped it. Class-year and sponsorship conflicts are detected from the title **and JD text** (explicit conflicts only; unstated/unknown passes); degree level uses the structured `degrees` field.
5. **Score:** build the feature vector for (listing, user), apply the user's current weights → `rawScore`. When there's no JD, the JD-dependent features (resume similarity, preference-vector similarity) are set to neutral, and the final score is `rawScore × NO_JD_PENALTY` (config, default 0.6) — a fixed post-model multiplier, **never a learned weight**. Store both scores **and the feature snapshot** on the match (training needs the features as they were at scoring time).
6. **Digest** (per-user frequency): top unsent matches above threshold since `lastDigestAt`, plus `wildcards` random below-threshold survivors flagged `exploration: true`. Links go to the matches page. Listings without a JD carry a "Couldn't read job description" label in both the digest and the matches page.

### GitHub Actions side (Python)
Nightly, and on `repository_dispatch` when a resume/profile changes:
1. Pull work from Convex HTTP export endpoints (shared-secret auth, `ML_SHARED_SECRET`). **Exports are strictly incremental** — only listings missing JDs or embeddings, plus labels/feedback since the last run. Never full-table exports. All write-backs go in batches of up to 100 records per HTTP call.
2. **Fetch JDs** for pending listings. Supported sources, in priority order: (1) Greenhouse — including embedded `?gh_jid=` boards, token resolved from the page — Lever, and Ashby via their public endpoints; (2) Workday via the internal CXS JSON endpoint its career pages use (tenant/site parsed from the URL, no headless browser); (3) Oracle Recruiting Cloud via its candidate-experience JSON endpoint; (4) iCIMS via plain HTTP first, Playwright fallback only where needed. Before building each of 2–4, test against ~20 real listings; if the success rate is under 50%, stop and report instead of building it. Rules for all fetching: per-host rate limiting (~1 request / 2 s per host to start), honest User-Agent, exponential backoff on errors/429s; fetch each JD once and re-fetch only if the listing record changes, with capped retries; store cleaned text only, never raw HTML; report per-listing `jdStatus`/`jdSource`/`jdError`; fail soft — a failed fetch never breaks the run.
3. Embed with bge-small (JD text if present, else title + company + category). **All embeddings come from this one job** so vectors are consistent.
4. Train: global logistic regression on all labels/feedback, then per-user weights with an L2 penalty toward the global weights (few labels → near global; many → personalized).
5. Evaluate on the held-out set; push weights and metrics back to Convex. A new model version is only promoted if precision@10 >= the current version's.

Caches (GitHub Actions cache): uv environment, the bge-small model, and the Playwright browser.

Scheduled workflows in public repos are auto-disabled after 60 days without repo activity — the workflow must include a keepalive mechanism.

## Preferences and filter strength

Every preference has a user-set strength: `hard` | `strong` | `soft` | `ignore`.
- `hard` → applied as a filter before scoring.
- `strong` / `soft` → a feature whose initial weight comes from the strength (strong > soft); the model tunes it from feedback within sensible bounds.
- `ignore` → not used.

Defaults: class-year and degree-level mismatches are `hard`; excluded companies are `hard`; everything else `soft`. Users can change any of them.

Data-reality semantics (the source data is mostly silent on these): a `hard` class-year filter only drops listings whose title or JD text explicitly names a conflicting class year; a `hard` sponsorship filter only drops explicit conflicts (structured field or JD text); unknown/unstated always passes. Role categories mirror the source enum: `ai_ml_data | swe | hardware | product | quant`.

Location preferences are distance-based: a feature that decays with distance from the preferred location(s), with an optional radius when set to `hard`.

## Features (initial set)

Resume↔listing embedding similarity; similarity to the user's preference vector (resume embedding nudged toward liked/applied listings, away from disliked — Rocchio); location proximity; remote/hybrid match; role-category match; sponsorship match; class-year signal (when not hard); has the user liked/applied to this company before; days since posted; has-JD flag.

When a listing has no JD, the two embedding-similarity features are set to neutral (so a title-only embedding can't push the score either way) and the fixed NO_JD_PENALTY multiplier applies after the model.

## Feedback signals

- **Applied** → strongest positive. Always followed by a separate prompt: "Was this a good suggestion?" (yes/no) — stored separately from applied.
- **Thumbs up / down** on any match.
- **No interaction** → no signal. Never treat it as negative.
- Exploration items are tagged so training can account for them.
- Every feedback action from email or the web is authenticated: web via session, email links via HMAC-signed, expiring tokens (`FEEDBACK_SIGNING_SECRET`).

## Cold start and evaluation

- Bootstrap labels: ~200 real listings with Claude-drafted labels (good/bad + one-line reason) against the owner's filled-in profile, drafted from JD text where available and noting per listing whether a JD existed (`hadJd`), **reviewed and corrected by the owner** before import. Labels live in Convex and in gitignored `data/labels/`, never committed.
- ~50 labels held out as a fixed eval set, never trained on.
- Primary metric: **precision@10** (of the top 10 ranked matches, how many are labeled good or applied to). Record it for every model version.
- Before any training exists, scoring uses strength-derived prior weights + similarity.

## Data model (Convex)

- `listings` — sourceId (unique), company, title, category, locations, geo, remoteType, sponsorship, degrees, url, atsType, atsRef, jdStatus, jdSource, jdText, jdFetchedAt, jdError, jdAttempts, datePosted, dateUpdated, active, raw, contentHash, ingestedAt, embedding (vector), embeddingVersion
- `ingestIndex` — compact sourceId→contentHash chunks so hourly diffs never read full listing docs (keeps DB bandwidth ~12–20% of the free-tier 1 GB/mo; estimates in PLAN.md A5)
- `profiles` — userId, gradDate, classYear, degreeLevel, preferences[{type, value, strength}], resumeText, resumeEmbedding, preferenceVector, threshold, frequency, wildcards, lastDigestAt
- `matches` — userId, listingId, droppedBy (hard rule or null), features, rawScore, score (after NO_JD_PENALTY), modelVersion, exploration, sentAt
- `feedback` — userId, listingId, kind (applied | thumbs_up | thumbs_down | good_suggestion | bad_suggestion), source (web | email), createdAt
- `labels` — userId, listingId, label, reason, reviewed, split (train | eval), hadJd
- `models` — version, globalWeights, featureNames, metrics, promoted, createdAt; `userWeights` — userId, modelVersion, weights
- `ingestState` — lastCommitSha, lastRunAt, lastError
- Convex Auth tables

## Conventions

- Pure logic (normalization, diffing, filters, features, scoring, digest selection) lives in plain TS modules with unit tests; Convex functions are thin wrappers.
- Feature names and order are defined once and shared (exported to JSON for Python) so TS inference and Python training never drift.
- Every external call (GitHub, ATS endpoints, Resend) goes through one small client module with timeouts and logged errors.
- Env vars documented in `.env.example`: `SOURCE_REPO`, `GITHUB_TOKEN` (optional), `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `ALLOWED_EMAILS`, `ML_SHARED_SECRET`, `FEEDBACK_SIGNING_SECRET`, `GITHUB_DISPATCH_TOKEN`, `NO_JD_PENALTY` (default 0.6).
- Add no dependency without stating why.

## Gitignored (must stay out of the public repo)

`.env*`, `profile.seed.json`, `private/` (resume), `data/labels/`, any feedback or training exports.

## Roadmap

- **Phase 1 (current):** everything above, single user behind the allowlist
- **Phase 2:** open sign-up — onboarding flow (resume upload → preference questions with strength settings), unsubscribe, per-user rate limits
- **Phase 3:** curated Greater Rochester company list as a second source (ATS-supported companies only)

## Commands

- `pnpm dev` / `npx convex dev` (local: `CONVEX_AGENT_MODE=anonymous npx convex dev`)
- `pnpm typecheck` / `pnpm lint` / `pnpm test`
- `pnpm seed:profile` — load `profile.seed.json` + `private/resume.pdf` into Convex
- `pnpm tsx scripts/export-label-draft.ts <email>` / `pnpm tsx scripts/import-labels.ts <email>` — bootstrap-label round trip (CSV in gitignored `data/labels/`)
- `pnpm tsx scripts/build-geonames.ts <cities1000.txt> <admin1CodesASCII.txt>` — rebuild the geo lookup
- `cd ml && uv run pytest`
- `cd ml && uv run python -m intern_radar_ml jd|embed|train` (needs `CONVEX_SITE_URL` + `ML_SHARED_SECRET`)
