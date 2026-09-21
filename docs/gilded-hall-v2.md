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

## Round two: navigation, disambiguation, and the triangle reveal

Structure and behaviour only. Visual design (surfaces behind text, the input-screen environment, moving the rest of the experience "into" the hall) is deliberately left for the designer.

- **Back.** Every screen after the landing has a Back button, and the browser's Back/Forward buttons work too. Screens are history entries (`lib/hall-client.ts`: `Screen`, `screenUrl`, `parentScreen`), merged into Next's own history state so the router does not hard-reload. Going back from a running generation cancels it; failures return to the confirm screen with the error kept. Custom triangles restore on reload via `GET /api/corner?id=`. A shared link to a mid-flow screen falls back to the landing screen. The landing shows no Collection or Saved buttons and no tagline; the header "The collection" link was dropped, and a "wander through the collection" link now sits under the reveal.
- **"It isn't the one."** On the choose-a-work screen, "None of these? Help us find it." opens a refine form: creator, format (Book, Article, Movie, Documentary, Show, Podcast episode) and year. Searching again sends those hints plus the shown-and-rejected matches (`exclude`, last six) to `identifyWork`, which tells the model not to return them and filters them out afterwards (`dropRejected`). The form opens by itself on zero matches or a "which episode?" 422. `lookupHintsSchema` and `FORMATS` live in `lib/corner-schema.ts` and `lib/formats.ts`.
- **The reveal is a triangle.** `app/v2/triangle.tsx` + `triangle.css`. Corners are the three works, sides are the threads between them (`bridges[i]` runs between corner i and i+1), the seal at the centroid is the common thread. Sides are SVG paths measured from the DOM so they stay attached at any width. Everything is a control: a corner lights its two sides, a side lights its two corners and shows the sentence between them, the centre lights all. "Walk the triangle" steps corner, side, corner, side, corner, side, centre (`lib/triangle-focus.ts`); ArrowLeft/ArrowRight/Escape work from anywhere. Under 700px the works stack and a small tappable triangle carries the geometry. Reduced motion draws the sides instantly.
- **Designer hooks.** Stage classes `hall-stage-*` on the shell; `.hall-tri*` (layout, lines, chips, seal, panel, mobile map) in `triangle.css`; `.hall-back`, `.hall-notit`, `.hall-refine*` in `flow.css`. Old plate/seal/`.hall-work-N`/`.hall-browse-nav` rules in `hall.css` are now dead code and can be deleted.

## Verification

- Local production build completed; TypeScript and scoped ESLint pass.
- Round two: `tests/hall-client.test.ts` now has eight tests (adds screen URL round-trip, `dropRejected`, and triangle walk order/lighting). A Playwright pass with mocked `/api/corner` and `/api/crate` covers back/forward, cancel, refine, the triangle at 1280/1024/768/390 wide, keyboard, and reduced motion. It was not run against the live model.
- `node --import tsx --test tests/hall-client.test.ts`: five tests covering chunked NDJSON, cached JSON, provider errors, incomplete results, premature stream end, and exact second-angle seed matching.
- Live preview: title lookup and confirmation for The Emerald Mile by Kevin Fedarko succeeded.
- Live preview: generated The River's Plumbing, with the submitted book, DamNation, a specific Daily episode, and a bonus.
- Live preview: saving the generated connection succeeded through `/api/crate`.
- Final responsive, second-angle and restoration results are recorded in the PR description.

## Assets

`public/hall/gilded-hall.webp` is an original image generated with the built-in image-generation tool, then compressed for delivery (about 174 KB). No reference photographs are published. The local fonts under `app/v2/fonts/` include their OFL licenses. Latin and extended Latin subsets are served as WOFF2; other scripts fall back to system fonts.

### Original image prompt

Use case: stylized-concept. Asset type: production website architectural hero background, wide landscape 16:9, high resolution. Create an original luminous European library hall for threeangle, a refined cultural discovery app. Immersive architectural editorial photograph meets subtly painterly fresco, symmetrical one-point perspective looking down an impossibly beautiful but believable airy reading hall. White plaster and pale marble piers, two levels of warm book stacks recessed at the far left and right edges, finely carved gilt capitals with RESTRAINED muted antique gold, a high barrel vault with very pale powder blue fresco sky and wispy ivory clouds, classical coffer outlines. No figurative religious frescoes. Enormous soft daylight from tall side windows. White accounts for 70 percent of scene. Deep warm walnut only in shelving, muted gold 5 percent. Foreground wide pale marble floor, clean quiet centre with no objects to leave room for HTML typography overlaid later; distant centre a softly sunlit arched doorway, believable architectural depth. Crop immersive, viewer at threshold at eye level, with the vault filling upper third and floor filling lower third, side aisles frame the centre. The centre should be luminous ivory low detail, architecture richly tactile at the periphery. Not a hotel lobby, not a dark Hogwarts library, no neon or sci-fi, no blurry bloom or lens flare, no people, no text, no lettering, no logos, no furniture blocking the foreground. Restrained, premium, serene yet awe inspiring. This is the actual hall interior for a website, not a UI mockup.
