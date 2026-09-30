# intern-radar — Phase 1 Plan

Status: **awaiting approval** (PROMPT.md Step 1). No code has been written.

---

## Part A — Step 0 findings (verified 2026-09-30)

### A1. Source repo and structured JSON

- Repo: `SimplifyJobs/Summer2027-Internships`, default branch **`dev`** (not `main`).
- Structured JSON: **`.github/scripts/listings.json`** (~12.8 MB), raw URL:
  `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`
- It contains **17,021 records spanning every season** (Summer 2026, Fall 2026, Summer 2027, …, plus `"N/A"`). We must filter to `terms` containing `"Summer 2027"`: **3,260 records, 2,105 active+visible** today.
- Fields per listing (exactly these 15 keys on every record):

  | Field | Type / values |
  |---|---|
  | `id` | UUID string — **stable unique ID** (17,021/17,021 unique) |
  | `company_name`, `title`, `url`, `company_url` | strings |
  | `source` | `"Simplify"` (98.8%) or a contributor's GitHub handle |
  | `category` | `AI/ML/Data`, `Software`, `Hardware`, `Product`, `Quant` + rare legacy aliases (`Software Engineering`, `Data Science, AI & Machine Learning`, etc.) |
  | `active` | boolean |
  | `is_visible` | boolean (among Summer 2027 actives, all are visible) |
  | `terms` | string array, e.g. `["Summer 2027"]` — listings can span multiple terms |
  | `date_posted`, `date_updated` | Unix **seconds** |
  | `locations` | string array, freeform: `"NYC"`, `"SF"`, `"Chicago, IL"`, `"Remote in USA"`, `"London, UK"`, `"Toronto, ON, Canada"` (1,587 distinct values incl. typos like `"Remote in USa"`) |
  | `sponsorship` | `"Other"` (**99.4%**), `"Does Not Offer Sponsorship"`, `"U.S. Citizenship is Required"`, `"Offers Sponsorship"` |
  | `degrees` | array: `Bachelor's`, `Master's`, `PhD`, `MBA`, `Associate's`, … (sometimes empty) |

- **There is no class-year field.** Only `degrees` and `terms`. See open question Q1.

### A2. ATS distribution (Summer 2027, active+visible, n=2,105)

| ATS | Count | Share |
|---|---|---|
| Workday | 810 | 38.5% |
| Greenhouse | 332 | 15.8% (216 direct `job-boards.greenhouse.io` + 116 embedded `?gh_jid=` on company sites) |
| other/unknown | 308 | 14.6% |
| iCIMS | 249 | 11.8% |
| Oracle Cloud | 202 | 9.6% |
| Ashby | 78 | 3.7% |
| SmartRecruiters | 37 | 1.8% |
| SuccessFactors | 35 | 1.7% |
| Lever | 25 | 1.2% |
| Rippling / Workable / Jobvite | 29 | 1.4% |

→ Direct Greenhouse + Lever + Ashby = **319 listings (15.2%)** get full JDs; **20.7%** if we also resolve embedded `gh_jid` boards (Q4). The other ~80% score on metadata embeddings only — `has_jd` feature matters.

Public endpoints, verified against live Summer 2027 listings:

- **Greenhouse** `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}` → `content` (HTML-**escaped** — must entity-decode then strip tags), `title`, `location.name`, `education`, `departments`, `offices`, `updated_at`. Board token + job id parse straight out of `job-boards.greenhouse.io/{token}/jobs/{id}` URLs.
- **Lever** `GET https://api.lever.co/v0/postings/{company}/{posting_id}` → `descriptionPlain`, `lists[]` (`{text, content}` HTML), `additionalPlain`, `text` (title), `categories{commitment, location, allLocations, team}`, `workplaceType`, `country`. Parses from `jobs.lever.co/{company}/{uuid}`.
- **Ashby** `GET https://api.ashbyhq.com/posting-api/job-board/{org}` → **all** of that org's jobs in one call: `id`, `title`, `descriptionHtml`, `descriptionPlain`, `location`, `secondaryLocations`, `isRemote`, `isListed`, `workplaceType`, `employmentType`. Org + job id parse from `jobs.ashbyhq.com/{org}/{uuid}`; batch per-org, then match by id.

### A3. Free-tier check vs CLAUDE.md

| Service | Limits (2026) | Verdict |
|---|---|---|
| Convex free (Starter) | 1M function calls/mo, 0.5 GB DB, 1 GB file storage, 1 GB DB bandwidth/mo, 1 GB egress/mo, 20 GB-hr action compute, crons + vector search included | **OK.** ~3.3k listings × 384-dim vectors ≈ 10 MB. Hourly cron ≈ 720 runs/mo. Mitigation: check the repo's head commit SHA via the GitHub commits API (tiny) and only download the 12.8 MB JSON on change; ML export/import payloads are a few MB nightly. |
| Vercel Hobby | 1M function invocations/mo, 100 GB transfer, 60 s function timeout, cron ≤ 1/day, **non-commercial personal use only** | **OK** — all crons live in Convex, so the 1/day Vercel cron cap is irrelevant. Non-commercial clause fine for a personal tool; revisit only if Phase 2+ ever monetizes. |
| Resend free | 3,000/mo **and 100/day**, up to 3 domains, requires verified domain | **OK** for single user (≤ a few digests/day). Fine through early Phase 2. |
| GitHub Actions | Free **unlimited** minutes on public repos; 10 GB cache/repo; scheduled workflows auto-disabled after 60 days without repo activity | **OK.** bge-small (~130 MB) + uv cache fit easily in 10 GB. Keepalive step required (already in CLAUDE.md; the workflow will re-enable itself via API + a dummy-commit fallback). |

Nothing in CLAUDE.md breaks a free tier.

### A4. Data-reality mismatches → open questions

- **Q1 — class year.** No class-year field exists. Proposal: the default-`hard` class-year filter only drops a listing when its title/JD text explicitly names a conflicting class ("juniors only", "Class of 2028", "penultimate year" vs. your year); everything else passes. The `class_year_signal` feature (when not hard) is 1 = explicit fit / 0.5 = unstated / 0 = explicit mismatch. Degree-level filtering uses the structured `degrees` array (empty array = pass).
- **Q2 — role categories.** The source has `AI/ML/Data` (merged), `Software`, `Hardware`, `Product`, `Quant` — no `research`, no ai_ml/data split. Proposal: change the profile enum to mirror the source: `ai_ml_data | swe | hardware | product | quant`, with legacy aliases normalized in. (Alternative: keep the CLAUDE.md enum and map `AI/ML/Data` → matches either `ai_ml` or `data`; `research` would match nothing.)
- **Q3 — sponsorship.** 99.4% of listings say `"Other"` (unknown). Proposal: a `hard` sponsorship preference only drops **explicit** conflicts (`Does Not Offer Sponsorship` / `U.S. Citizenship is Required` when you need sponsorship); `"Other"` always passes. Feature encoding: 1 = explicit match, 0.5 = unknown, 0 = explicit conflict. Expect low model signal.
- **Q4 — embedded Greenhouse boards.** 116 listings hide the board token behind `?gh_jid=` on company career pages. Resolvable by fetching the page once and extracting the token from the static embed script — but that's a fourth fetch path with more failure modes. Proposal: **defer**; treat as metadata-only in Phase 1.
- **Q5 — term filter.** Ingest only listings whose `terms` include `"Summer 2027"` exactly (multi-term listings included). 1,655 records have `terms: ["N/A"]` — excluded. Confirm.

---

## Part B — the plan

### B1. Folder layout

```
intern-radar/
├─ app/                      # Next.js App Router (thin UI only)
│  ├─ signin/                # Convex Auth email sign-in
│  ├─ matches/               # ranked matches + feedback actions
│  ├─ settings/              # preferences/strengths, threshold, frequency, wildcards
│  └─ f/[token]/             # email feedback link landing (HMAC token redemption)
├─ components/
├─ emails/                   # React Email digest template
├─ convex/
│  ├─ schema.ts
│  ├─ auth.config.ts / auth.ts
│  ├─ crons.ts               # hourly ingest, per-frequency digests
│  ├─ http.ts                # /ml/export, /ml/import/*, /feedback/redeem
│  ├─ ingest.ts  jd.ts  scoring.ts  digest.ts
│  ├─ profile.ts  feedbackFns.ts  labels.ts  models.ts
│  └─ lib/                   # convex-side helpers (env, clients)
├─ lib/                      # PURE logic — all unit-tested, no Convex imports
│  ├─ schemas/               # zod: simplify.ts, greenhouse.ts, lever.ts, ashby.ts
│  ├─ atsDetect.ts           # url → {ats, ids} parser
│  ├─ normalize.ts           # category/sponsorship/degrees/location-string normalization
│  ├─ geo/                   # lookup loader + haversine + alias table
│  ├─ diff.ts  filters.ts  features.ts  score.ts  digestSelect.ts
│  ├─ classYear.ts           # class-year extraction from title/JD text
│  ├─ html.ts                # entity-decode + tag-strip for JD HTML
│  └─ feedbackToken.ts       # HMAC sign/verify, expiry
├─ shared/features.json      # single source of truth for the feature vector (B5)
├─ scripts/
│  ├─ build-geonames.ts      # GeoNames cities dump → data/geonames/lookup.json
│  ├─ export-label-draft.ts  # step 10 CSV
│  └─ import-labels.ts       # reviewed CSV → Convex, fixed 50-label eval split
├─ data/
│  ├─ geonames/              # committed compact lookup (CC-BY, attributed in README)
│  └─ labels/                # GITIGNORED
├─ ml/                       # Python 3.12, uv
│  ├─ pyproject.toml
│  ├─ src/intern_radar_ml/
│  │  ├─ client.py           # Convex export/import HTTP client (shared secret)
│  │  ├─ embed.py            # bge-small via sentence-transformers
│  │  ├─ features.py         # loads shared/features.json, asserts names/order
│  │  ├─ train.py            # global LR + per-user L2-toward-global
│  │  └─ evaluate.py         # precision@10 on eval split
│  └─ tests/
├─ .github/workflows/ml.yml  # nightly cron + repository_dispatch + keepalive
├─ .githooks/commit-msg      # already exists at repo root — moves here
├─ private/                  # GITIGNORED (resume.pdf)
└─ profile.seed.json         # GITIGNORED (example stays committed)
```

### B2. Convex schema (tables → key fields → indexes)

- `listings` — `sourceId` (Simplify UUID), `company`, `title`, `category` (normalized), `categoryRaw`, `locations[]`, `geo[] {lat, lon, name}`, `remoteType` (`onsite|remote|hybrid|unknown`), `sponsorship` (normalized enum), `degrees[]`, `url`, `atsType` (`greenhouse|lever|ashby|workday|icims|oracle|other`), `atsRef` (parsed board/company/job ids), `jdText?`, `jdFetchedAt?`, `jdError?`, `datePosted`, `dateUpdated`, `active`, `raw` (original record), `ingestedAt`, `embedding?` (v.array(float64), 384-dim), `embeddingVersion?`
  - indexes: `by_sourceId`, `by_active`; vectorIndex `by_embedding` (dim 384)
- `profiles` — `userId`, `email`, `gradDate`, `classYear`, `degreeLevel`, `preferences[] {type, value, strength}`, `resumeText?`, `resumeEmbedding?`, `preferenceVector?`, `threshold`, `frequency` (`instant|daily|weekly`), `wildcards`, `lastDigestAt?` — index `by_userId`
- `matches` — `userId`, `listingId`, `droppedBy?` (rule name or null), `features` (name→value snapshot **at scoring time**), `score`, `modelVersion`, `exploration`, `sentAt?`, `createdAt` — indexes `by_user_listing`, `by_user_score`, `by_user_unsent`
- `feedback` — `userId`, `listingId`, `kind` (`applied|thumbs_up|thumbs_down|good_suggestion|bad_suggestion`), `source` (`web|email`), `createdAt` — indexes `by_user_listing`, `by_user`
- `labels` — `userId`, `listingId`, `label` (`good|bad`), `reason`, `reviewed`, `split` (`train|eval`) — index `by_user`, `by_split`
- `models` — `version`, `globalWeights[]`, `featureNames[]`, `metrics {precisionAt10, n_train, n_eval, ...}`, `promoted`, `createdAt`; `userWeights` — `userId`, `modelVersion`, `weights[]`
- `ingestState` — singleton: `lastCommitSha`, `lastRunAt`, `lastError?`, `lastNewCount`
- Convex Auth tables (from @convex-dev/auth)

### B3. zod schemas (all external data crosses one of these)

- `SimplifyListing` — the 15 fields in A1; unknown `category`/`sponsorship` values fall back to catch-all enums + raw preserved; records failing parse are skipped and counted in the ingest log.
- `GreenhouseJob` — `{ id, title, content, location {name}, updated_at, departments?, offices?, education? }`
- `LeverPosting` — `{ id, text, descriptionPlain, lists [{text, content}], additionalPlain?, categories {commitment?, location?, allLocations?}, workplaceType?, country? }`
- `AshbyBoard` — `{ jobs: [{ id, title, descriptionHtml, descriptionPlain?, location, secondaryLocations?, isRemote, isListed, workplaceType?, employmentType? }] }`
- `ProfileSeed` — mirrors `profile.seed.example.json`.
- ML import payloads — embeddings batch, model push (weights length must equal `featureNames` length must equal `shared/features.json`).

### B4. Feature vector (initial, order = vector order)

| # | Name | Computation | Prior weight |
|---|---|---|---|
| 0 | `bias` | constant 1 | fitted; prior ≈ −1 |
| 1 | `embed_sim_resume` | cosine(listing embedding, resume embedding), 0 if missing | 2.0 |
| 2 | `embed_sim_pref` | cosine(listing embedding, preference vector) — pref vector = resume embedding Rocchio-updated (+liked/applied, −disliked, α=1, β=0.5, γ=0.3, re-normalized) | 1.5 |
| 3 | `loc_proximity` | max over preferred places of `exp(−haversine_miles / max(radius, 50))`; 1.0 if listing remote & remote acceptable; 0 if no geo | by strength |
| 4 | `work_mode_match` | 1 if listing remoteType ∈ preferred modes, 0.5 if unknown, else 0 | by strength |
| 5 | `role_category_match` | 1 if normalized category ∈ preferred categories else 0 | by strength |
| 6 | `sponsorship_match` | 1 explicit match / 0.5 unknown (`Other`) / 0 explicit conflict | by strength |
| 7 | `class_year_signal` | 1 explicit fit / 0.5 unstated / 0 explicit mismatch (from title+JD text; only scored when strength ≠ hard) | by strength |
| 8 | `company_affinity` | 1 if user has applied/thumbs-upped this company before, 0 otherwise | 0.5 |
| 9 | `recency` | `exp(−days_since_posted / 14)` | 0.5 |
| 10 | `has_jd` | 1 if full JD text stored | 0.25 |

Strength→prior: `strong` = 1.0, `soft` = 0.4, `ignore` = 0 (feature emitted but zero-weighted so vector shape never changes). `hard` prefs never reach scoring (filtered first). Training clamps strength-feature weights to `[0, 2×prior]`-style bounds from `shared/features.json` so feedback tunes but can't invert a stated preference.

Score = `sigmoid(w · x)` in plain TS inside Convex; snapshot of `x` stored on the match.

### B5. Shared feature definition — `shared/features.json`

```json
{ "version": 1,
  "embeddingModel": "BAAI/bge-small-en-v1.5", "embeddingDim": 384,
  "features": [
    { "name": "bias", "prior": -1.0, "bounds": [-6, 6] },
    { "name": "embed_sim_resume", "prior": 2.0, "bounds": [0, 6] },
    { "name": "loc_proximity", "priorByStrength": {"strong": 1.0, "soft": 0.4}, "bounds": [0, 3] }
  ]
}
```
(abridged — one entry per B4 row). TS: imported directly, validated by zod at startup; `lib/features.ts` builds vectors in array order. Python: `ml/features.py` loads the same file and **fails the run** if names/order/dim disagree with what Convex exports. The model push includes `featureNames` and Convex re-verifies before accepting. One file, no drift.

### B6. Convex ⇄ Actions endpoints (all `Authorization: Bearer ML_SHARED_SECRET`, all on Convex `http.ts`)

- `GET /ml/export?cursor=&kind=listings|profiles|labels|feedback` — paginated JSON:
  - `listings`: id, title, company, category, jdText (or null) for all active Summer-2027 listings + `needsEmbedding` flag
  - `profiles`: userId, resumeText, current preference list (for Rocchio in TS? no — Rocchio stays in TS; profile export is for resume embedding only)
  - `labels`: listingId, label, split; `feedback`: listingId, kind, createdAt (train uses both; eval split rows are never trained on)
  - plus `model`: current promoted version + metrics
- `POST /ml/import/embeddings` — `{ items: [{listingId, embedding}], resumes: [{userId, embedding}] }`, batched ≤ 100/call
- `POST /ml/import/model` — `{ version, featureNames, globalWeights, userWeights: [{userId, weights}], metrics }`; Convex promotes only if `metrics.precisionAt10 >=` current promoted version's, else stores unpromoted + logs
- `POST /feedback/redeem` — HMAC-signed email-link token → records feedback (separate secret, `FEEDBACK_SIGNING_SECRET`, 14-day expiry, single-use per (token, kind))

Trigger path: profile/resume change in Convex → action calls GitHub `repository_dispatch` (`GITHUB_DISPATCH_TOKEN`) → same workflow as nightly.

### B7. Pipeline flow (Convex)

1. **Ingest (hourly cron):** GitHub commits API for head SHA of `dev` touching `.github/scripts/listings.json` → if same as `ingestState.lastCommitSha`, stop (no 12.8 MB download). Else fetch raw JSON, zod-parse per record (skip+count malformed), filter `terms ∋ "Summer 2027"` and `is_visible`, diff by `sourceId` (insert new, update `active`/`dateUpdated` on existing), batched mutations.
2. **Post-ingest (scheduled per new listing):** ATS detect → JD fetch (Greenhouse/Lever/Ashby only; Ashby batched per org) → clean text → store; geocode locations via committed lookup; set remoteType from location strings + ATS `workplaceType`/`isRemote`.
3. **Score (per new/updated listing × user):** hard filters (`{pass, droppedBy}`) → feature vector → sigmoid with user's current weights (or priors if no model) → store match + snapshot. Re-score all on model promotion or preference change.
4. **Digest (cron per frequency):** unsent matches above threshold since `lastDigestAt`, top-N + `wildcards` random below-threshold survivors (`exploration: true`), React Email via Resend, mark `sentAt`. `instant` = checked hourly after ingest.

### B8. ML job (nightly + dispatch)

1. Pull exports (B6). 2. Embed listings missing embeddings + any changed resume with bge-small (`sentence-transformers`, HF cache in Actions cache). JD text if present else `title + company + category`. 3. Push embeddings back. 4. Build training set: labels (train split) + feedback (applied/thumbs_up/good → 1, thumbs_down/bad → 0; exploration-sourced rows kept but flagged, weight 1.0 — revisit later), features recomputed from stored match snapshots exported with feedback. 5. Train global LR (scikit-learn, class-balanced), then per-user: LR with L2 penalty toward global weights (`w_user = argmin logloss + λ‖w − w_global‖²`), λ tuned by label count. Clamp to bounds. 6. Evaluate precision@10 on eval split. 7. Push model (B6); Convex decides promotion. 8. Keepalive step (re-enables workflow via GitHub API).

### B9. Build order (each step: typecheck + lint + tests green → conventional commit)

| # | Step (matches PROMPT.md) | Commit |
|---|---|---|
| 1 | Scaffold: pnpm + Next.js (App Router, strict TS, Tailwind) + Convex + Vitest; `ml/` uv + pytest; `.env.example`, `.gitignore`, `.githooks` + `core.hooksPath`; README w/ GeoNames attribution | `chore: scaffold app, convex, and ml workspaces` |
| 2 | Convex Auth email sign-in + `ALLOWED_EMAILS` gate | `feat: allowlisted email auth` |
| 3 | Profile schema, seed-loader mutation, unpdf resume extraction | `feat: profile seed and resume ingestion` |
| 4 | Ingest: GitHub client, zod, SHA short-circuit, diff, hourly cron + fixture tests from real JSON | `feat: hourly simplify ingest` |
| 5 | JD fetch: 3 ATS clients + HTML cleanup + recorded-fixture tests | `feat: greenhouse/lever/ashby jd fetch` |
| 6 | GeoNames preprocess script + committed lookup + location normalizer (aliases: NYC, SF, Remote in …) + tests | `feat: offline geocoding` |
| 7 | Hard filters, one test per preference type × strength | `feat: hard filters` |
| 8 | ML part 1: export endpoint, embed+push job, `ml.yml` (cron + dispatch + keepalive + caches) | `feat: nightly embedding job` |
| 9 | Scoring: `shared/features.json`, features, priors, sigmoid, snapshot, Rocchio | `feat: prior-weight scoring` |
| 10 | **STOP — labels.** Confirm `profile.seed.json` is filled → export ~200 varied listings to `data/labels/draft.csv` → Claude-drafted labels strictly from profile → **you review/edit** → import with fixed 50-eval split | `feat: label import tooling` (tooling only; data never committed) |
| 11 | Training + eval + versioned push + promotion gate | `feat: personalized training with precision@10 gate` |
| 12 | Matches page (score, top features in plain language, Applied→good-suggestion prompt, 👍/👎) + settings page | `feat: matches and settings ui` |
| 13 | Digest: React Email, Resend client, HMAC links, per-frequency crons, wildcards | `feat: email digests` |

Done-when (from PROMPT.md): full pipeline end-to-end, real digest received with working feedback from email + web, precision@10 reported for model v1 vs prior-weights baseline, all pure logic tested, CLAUDE.md Commands section verified.
