# threeangle

One fascination. A written work, a film or show, and a specific podcast episode—plus an exceptional bonus.

This is the Vercel edition of the existing threeangle prototype: 24 curated worlds in a helix, the animated welcome, six-scene reveals, a personal crate, and a live “What’s a work you love?” flow: works are found in real catalogs as you type, and Claude chooses and writes the other two corners. The previous Sites deployment is preserved separately.

## Deploy on Vercel

1. Connect this repository to your existing Vercel project. Framework: Next.js; root: repository root. Build and install commands are in `vercel.json`.
2. Add these as sensitive server environment variables in Preview and Production:
   - `ANTHROPIC_API_KEY` (or Vercel AI Gateway). Optional `AGENT_MODEL`.
   - `TMDB_KEY`: TMDB API key or read-access token, for film and TV posters and search. Without it, films and TV come from Apple and Wikipedia.
   - Optional: `GOOGLE_BOOKS_API_KEY` (raises the Google Books quota), `PODCASTINDEX_API_KEY` + `PODCASTINDEX_API_SECRET` (older podcast episodes), `CATALOG_SECRET` (signs search results; derived from other secrets when unset), `ADMIN_TOKEN` (24+ characters; unlocks `/api/admin/check`).
   - Before a public launch: `QUOTA_ENFORCED=1` (daily per-visitor limits on model calls).
3. In the project's Storage section, connect a Neon Postgres database from Vercel Marketplace. Its connection must supply `DATABASE_URL` to Preview and Production. Use separate databases/branches for those environments when available.
4. Deploy. The build creates the tables with an additive, idempotent migration. Missing database configuration leaves custom generation disabled; curated browsing still builds.
5. Verify typeahead → confirmation → “What did you love about it?” → quotes and progress while it thinks → reveal with covers → Share → Keep → reload.

Never commit credentials. `.env.example` contains names only. The server never returns credentials.

## Personal crate in this pilot

Vercel cannot reuse the previous host's ChatGPT authentication headers. This edition uses a random 256-bit HttpOnly browser cookie. Records stay in Postgres and are scoped to that browser's token. It does not claim account sign-in or cross-device synchronization. Clearing cookies loses access. The UI explains this. Existing Sites crates remain on the old site. Account login and crate migration require a future explicit integration.

## Development

Node 22.13+; `npm ci`, copy `.env.example` to `.env.local` and fill privately, `npm run db:migrate`, `npm run dev`.

`npm test` exercises the pipeline with model and catalog fixtures (signed picks, re-picks, sharing, quotas, quote cache, session security) and the catalog's matching rules. `npm run build` verifies the Next.js production build. Neither proves live editorial quality or live catalog coverage: run `npx tsx scripts/art-check.ts` (≈40 known works, reports hits and wrong matches) from a machine with network access, or `/api/admin/check?suite=art&token=…` on the deploy. `npx tsx scripts/backfill-art.ts` writes covers into the curated topics. See `CUSTOM_TRIANGLES.md` for the pipeline and validation limits.
