# threeangle v2 — Gilded Hall

## Routes and preservation

- `/v2`: the new title-first experience. `/` retains the original design.
- `/?browse=1`: direct entry into the original topic browser.
- `/v2?triangle=<id>`: curated or browser-owned generated connection.
- `/v2/review`: responsive review frame (320, 390, 768px). Returns 404 on Vercel production. The iframe uses the real app and real API, not fixtures.

No production promotion or merge is part of this work. PR previews are the review surface.

## The experience

The threshold establishes a luminous architectural world. An engraved, floating triangle lets visitors explore Read, Watch and Listen. The title screen reduces the architecture to its edges and presents one field. Lookup confirms the actual work before generation. Thinking assembles ink geometry; real service status and sourced facts are shown when available. The reveal stages the three works around a central question, with expandable reading notes, a deeper connection, and a fourth discovery.

The existing `/api/corner` and `/api/crate` endpoints remain authoritative. The latest merged backend uses the triangle-building agent and existing Gem-derived editorial instructions with the 24 refined examples. This redesign does not swap providers or restore the obsolete 100-example set.

A completed draft is cached by the API. “Find another angle” therefore performs a fresh lookup, verifies the same title/creator/format, and submits the prior companion titles in `avoid`. Interrupted generations can retry the same draft to recover an already completed result.

The collection is browser-cookie scoped, matching the existing API. Results are not public share links. A custom result opened in another browser cannot access the originating browser's draft.

## Chief Creative & Brand Officer review — pass two

- **Special and spatial?** The hall is an original architectural image, visible at arrival and retained softly at the edges of subsequent screens. No shelf wallpaper, dark HUD, neon or particle field.
- **Distinctive enough?** Added an interactive engraved invitation to the opening: a small triangle teaches the three angles through hover, focus and click, instead of relying on the architecture alone.
- **Refined?** Cormorant Garamond carries the editorial voice; DM Sans carries the interface. Fonts are locally served and licensed. Gold is limited to fine construction lines, borders and flourishes.
- **Does real content break it?** The live Emerald Mile result exposed a six-line bibliographic title that overwhelmed the top vertex. Long colon-separated subtitles now set at a smaller editorial size while preserving the complete title. Lookup descriptions are shortened for the confirmation decision.
- **Playful and useful?** Work plates lift subtly, open substantive reading notes, and lead the reader into the expanded content. The bonus opens like a discovery from the next shelf. A second triangle keeps the original starting work.
- **Cohesive on small screens?** Mobile uses readable stacked plates connected by a fine vertical line, with the central question above. It does not shrink the desktop triangle into miniature text. Native dialog provides keyboard focus trapping and Escape dismissal.
- **Motion with restraint?** Slow drift, small pointer and scroll response, staggered reveal and ink drawing. Pause and system reduced-motion controls stop decorative motion.

## Verification

- Local production build completed; TypeScript and scoped ESLint pass.
- `node --import tsx --test tests/hall-client.test.ts`: five tests covering chunked NDJSON, cached JSON, provider errors, incomplete results, premature stream end, and exact second-angle seed matching.
- Live preview: title lookup and confirmation for The Emerald Mile by Kevin Fedarko succeeded.
- Live preview: generated The River's Plumbing, with the submitted book, DamNation, a specific Daily episode, and a bonus.
- Live preview: saving the generated connection succeeded through `/api/crate`.
- Final responsive, second-angle and restoration results are recorded in the PR description.

## Assets

`public/hall/gilded-hall.webp` is an original image generated with the built-in image-generation tool, then compressed for delivery (about 174 KB). No reference photographs are published. The local fonts under `app/v2/fonts/` include their OFL licenses. Latin and extended Latin subsets are served as WOFF2; other scripts fall back to system fonts.

### Original image prompt

Use case: stylized-concept. Asset type: production website architectural hero background, wide landscape 16:9, high resolution. Create an original luminous European library hall for threeangle, a refined cultural discovery app. Immersive architectural editorial photograph meets subtly painterly fresco, symmetrical one-point perspective looking down an impossibly beautiful but believable airy reading hall. White plaster and pale marble piers, two levels of warm book stacks recessed at the far left and right edges, finely carved gilt capitals with RESTRAINED muted antique gold, a high barrel vault with very pale powder blue fresco sky and wispy ivory clouds, classical coffer outlines. No figurative religious frescoes. Enormous soft daylight from tall side windows. White accounts for 70 percent of scene. Deep warm walnut only in shelving, muted gold 5 percent. Foreground wide pale marble floor, clean quiet centre with no objects to leave room for HTML typography overlaid later; distant centre a softly sunlit arched doorway, believable architectural depth. Crop immersive, viewer at threshold at eye level, with the vault filling upper third and floor filling lower third, side aisles frame the centre. The centre should be luminous ivory low detail, architecture richly tactile at the periphery. Not a hotel lobby, not a dark Hogwarts library, no neon or sci-fi, no blurry bloom or lens flare, no people, no text, no lettering, no logos, no furniture blocking the foreground. Restrained, premium, serene yet awe inspiring. This is the actual hall interior for a website, not a UI mockup.
