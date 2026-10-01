# intern-radar

Watches the SimplifyJobs Summer 2027 internship list, filters and ranks new postings against your profile with a per-user keyword-weight model that learns from your feedback, and emails matches on your schedule.

Runs entirely on free tiers (Vercel Hobby, Convex, Resend, GitHub Actions) with no paid AI APIs — scoring and learning run in plain TypeScript inside Convex, and a nightly GitHub Actions job fetches job descriptions (plus optional open-model embeddings).

## Status

Phase 1 (single user) — under construction. See `PLAN.md`.

## Data attribution

Offline geocoding uses the [GeoNames](https://www.geonames.org/) cities1000
dataset, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
A compact lookup derived from it is committed at `data/geonames/lookup.json`
(rebuild with `pnpm tsx scripts/build-geonames.ts`).

## Development

After cloning, point git at the repo's hooks:

```sh
git config core.hooksPath .githooks
```

Commands:

- `pnpm dev` / `npx convex dev`
- `pnpm typecheck` / `pnpm lint` / `pnpm test`
- `pnpm seed:profile` — load `profile.seed.json` + `private/resume.pdf` into Convex
- `cd ml && uv run pytest`
- `cd ml && uv run python -m intern_radar_ml jd|embed`
