# Threeangle editorial calibration

Version: `refined-24-v1`.

`refined-24.json` contains the 24 refined catalog records, assembled with the same current copy overlays used by the app, plus teaching notes. `manifest.json` records provenance and a content hash. The retired 100/107 collection is not used. The legacy Ghosteen corner is preserved as reference only; new custom outputs still require an exact podcast episode.

`lib/editorial.ts` supplies the shared brief to Gemini, the research-proposal instructions, and selection of up to three examples for each generation. Selection combines seed/interest relevance with the bounded-tangent and same-author redundancy lessons. It is lightweight lexical retrieval, not a learned taste model. All 24 are eligible; no claim is made that each live call sees the entire collection.

The generation route now supports honest research-limit/clarification responses and rejects a changed seed creator or format, in addition to the existing title/media/source checks. Source support and editorial quality still require human review; asking for an evidence record does not mechanically prove the claims.

The installable Gem instructions, full annotated knowledge document, sample review and rubric are standalone deliverables. The Gem uses reference context, not weight fine-tuning. The app uses the equivalent editorial brief via its existing Gemini API calls; it does not invoke a saved consumer Gem.

Validation on 2026-09-17: seven fixture-based functional tests and production build passed. Real Gemini output and live database persistence were not tested: API/database environment variables are unavailable locally, connected Vercel access returns no projects, and automatic approval blocked transmission of the reference material to Gemini and publication of this branch to GitHub. No deployment or saved Gem is claimed.

Resume by obtaining explicit authorization for those two rejected transmissions, pushing this branch, resolving the actual Vercel project access, and signing into Gemini through the secure browser handoff. Install the Gem and knowledge file, run the three review inputs once each, preserve all outcomes, and review source support and taste. Keep the old database-removal commit in the other local checkout separate; this branch preserves storage, ownership and usage caps.
