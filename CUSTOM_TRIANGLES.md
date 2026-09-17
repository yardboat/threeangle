# Custom triangles — Vercel edition

## Flow

1. A server-side grounded Gemini search identifies up to three exact works and facts. A formatting call produces validated JSON.
2. The user confirms a work and optionally answers “What grabbed you?”
3. Grounded research selects the missing two media formats and a bonus. A formatting call writes the six-scene reveal.
4. The original work keeps its exact title, creator and format. Results require one written work, one screen work, one specific podcast episode, and a distinct bonus.
5. Sources come from Gemini's search metadata. Source index validation proves reference presence, not that every claim is entailed. Live editorial review remains necessary.

Prioritize The Daily, 99% Invisible, Radiolab and This American Life when an individual episode fits. Never replace an episode with a whole feed. No fake production results.

## Hosting and persistence

- Standard Next.js on Vercel, Node runtime, 300-second route allowance. Each Gemini call times out after 100 seconds. No automatic paid retries.
- Server-only `GEMINI_API_KEY`, optional `GEMINI_MODEL`, and Neon `DATABASE_URL`.
- Postgres persists confirmed drafts, completed triangles, crate entries, and atomic daily counters. Each provider call gets an ID before execution and its full response (including usage metadata when supplied) is retained server-side. Pending rows may remain after provider/network failures; no dollar-cost estimate is claimed.
- Browser-scoped opaque sessions replace the old hosting platform's authentication. No client-supplied authentication headers are trusted. This is a pilot, not cross-device account login.
- Daily limits: 10 lookups and 3 generations per browser session; 100 lookups and 30 generations globally. Creating a new browser session resets its individual quota but not the global cap. These are request caps, not dollar budgets.
- Lookup and generation each use two Gemini calls. Failed calls consume quota.
- NDJSON sends actual research stages and heartbeats. The waiting screen rotates source-backed facts from lookup, not invented progress percentages.
- Keep the page open while generating. This is not a durable background queue. A saved result can be recovered by retrying the confirmed draft. Generation locks become retryable after four minutes.
- Custom hash links are browser-session scoped; they are not public share links.

## Verification

Automated fixture tests cover authentication boundary, cross-origin rejection, missing configuration, source index bounds, preserved seed, media formats, ownership, repeat recovery, quota and crate persistence. Session tests check HttpOnly/Secure/SameSite and rejection of spoofed host headers.

Before launch test real book, film and podcast seeds, ambiguous titles, nonexistent titles, quota exhaustion and crate reload. Judge whether every corner adds a specific, distinct perspective. The separate editorial review draft is not silently installed by this migration.
