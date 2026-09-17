# threeangle

One fascination. A written work, a film or show, and a specific podcast episode—plus an exceptional bonus.

This is the Vercel edition of the existing threeangle prototype: 24 curated worlds in a helix, the animated welcome, six-scene reveals, a personal crate, and a live “I have a title” flow powered by Gemini. The previous Sites deployment is preserved separately.

## Deploy on Vercel

1. Connect this repository to your existing Vercel project. Framework: Next.js; root: repository root. Build and install commands are in `vercel.json`.
2. Add `GEMINI_API_KEY` as a sensitive server environment variable in Preview and Production. Optional `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
3. In the project's Storage section, connect a Neon Postgres database from Vercel Marketplace. Its connection must supply `DATABASE_URL` to Preview and Production. Use separate databases/branches for those environments when available.
4. Deploy. The build creates the four tables with an additive, idempotent migration. Missing database configuration leaves custom generation disabled; curated browsing still builds.
5. Verify title lookup → confirmation → interest note → sourced wait-screen facts → complete triangle → crate → reload.

Never commit credentials. `.env.example` contains names only. The server never returns credentials.

## Personal crate in this pilot

Vercel cannot reuse the previous host's ChatGPT authentication headers. This edition uses a random 256-bit HttpOnly browser cookie. Records stay in Postgres and are scoped to that browser's token. It does not claim account sign-in or cross-device synchronization. Clearing cookies loses access. The UI explains this. Existing Sites crates remain on the old site. Account login and crate migration require a future explicit integration.

## Development

Node 22.13+; `npm ci`, copy `.env.example` to `.env.local` and fill privately, `npm run db:migrate`, `npm run dev`.

`npm test` exercises provider fixtures, limits, ownership and session security. `npm run build` verifies the Next.js production build. Neither proves Gemini's live editorial quality. See `CUSTOM_TRIANGLES.md` for the pipeline and validation limits.
