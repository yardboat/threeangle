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

## Visual finish after the round-two handoff

The full uploaded archive was reconciled against commit `50feb81`; its navigation, refine API hints, rejection filter, tests, and triangle controls are included. The older unfinished local navigation experiment was not carried forward.

`app/v2/atmosphere.css` is the visual layer above the handoff's structural styles. It removes the label backplates, opens up the environments, introduces a second interior, and changes the treatment of the triangle's works, sides, centre and reading notes. `hall.tsx` now crossfades two lightweight full-viewport image layers; stage changes move the viewpoint and scroll/pointer input introduces restrained depth. System reduced motion and the existing motion switch stop decorative transitions.

The triangle retains the handoff's measured card geometry and all its controls. Ink is clipped to the measured card bounds so it does not run through transparent work titles. The centre is an engraved pair of rings; side labels name the two media they connect. Phone layout retains the interactive triangle map and readable full work titles below it.

### Second-room asset

`public/hall/reading-room.webp` (about 282 KB) was made with the built-in image-generation tool and compressed with Sharp. The original generated image is retained separately. No Shopify artwork or code was copied. The reference informed the relationship between environment, typography and movement.

Prompt: Use case: stylized-concept. Asset: full-bleed website environment for threeangle, landscape 16:9, no text, no interface. Create a luminous heavenly European library READING ROOM, an original Renaissance architectural painting rendered with editorial photographic depth. Eye level, looking through two monumental ivory marble columns at extreme left and right into a spacious pale powder-blue vaulted chamber. Soft sky-blue frescoes high overhead, restrained antique-gold relief on capitals, walnut bookshelves recessed on the extreme sides, sculptural stone balustrades. A softly lit ivory wall and tall arched opening far back at centre, neutral warm-light negative space in the central 55 percent where brown live typography will sit. Foreground pale stone floor with large elegant blue-grey window shadows makes the visitor feel standing IN the space; at lower right edge a small beautiful walnut reading table with one open book, mostly cropped. Rich dimensional architectural details at edges, full natural contrast, clearly visible blue ceiling and carved marble, no haze or white veil. Deep perspective, quiet expansive human-scale intimacy. Soft golden late-morning daylight enters from left, dreamy and special but believable. Not a whitewashed flat stock backdrop. No people, no religious figures, no chandeliers, no dark fantasy, no neon, no gradients artificially painted over the image, no text, no letters or watermark.

## Legibility and room journey — September 21

- Deep ink (#281C16) replaces mid-brown display text. Titles use a stronger font weight; supporting copy and media labels are larger and darker. Broad, feathered architectural lighting stabilizes the reading area without restoring text boxes.
- `world.tsx` owns four real image layers: Gilded Hall → Reading Room → Sunlit Gallery (thinking) → Rotunda (reveal). Confirmation moves closer into the reading alcove. Room transitions use an eased perspective move and crossfade.
- Pointer movement produces up to 34px of eased scene travel, independent of document height. Scroll shifts the camera; separate window light moves at another depth. Ambient motion uses transforms and opacity, with no particles or WebGL.
- “Look around” hides and disables the reading controls while preserving state, removes the reading light, and increases camera travel. The same control or Escape returns to the experience. Pause and system reduced motion stop camera, light and decorative animation.
- New original images: `public/hall/gallery.webp` and `public/hall/rotunda.webp`, generated with the built-in image tool and compressed with Sharp. Existing environments are preserved.
- Gallery prompt: luminous Renaissance library cloister, long powder-blue barrel vault, marble columns receding to a doorway, edge walnut shelves, pale low-detail central floor for deep-brown typography, daylight, no UI or text.
- Rotunda prompt: expansive circular Renaissance library, pale-blue coffered dome and sky oculus, three arched windows, ivory columns and walnut galleries at the edges, pale limestone centre, restrained gold, editorial photographic depth, no UI or text.

Browser verification on the PR preview: live lookup of The Emerald Mile by Kevin Fedarko, confirmation, generation, and arrival in the Rotunda all succeeded (The River’s Reckoning, with DamNation and the specific Daily episode). Checked arrival at 320/390px, input at 390px, and the desktop room journey. Look around and Escape restore the experience; side selection and keyboard stepping open the correct notes; Pause reports no room or light animations. The final visual pass offsets the side labels off the ink and tightens reveal spacing. All eight hall-client tests, scoped ESLint, and the production build pass. Browser extension metadata errors were excluded from app error assessment.

## Monument — September 26

Branch `design/monumental-hall` (off `codex/gilded-hall-v2`). A full aesthetic pass: monumental and cinematic rather than delicate. Behaviour, history, API use and the round-two focus logic (`lib/triangle-focus.ts`) are unchanged.

- **Direction.** Few words, big statements. Archivo (variable, OFL, `app/v2/fonts/`) set in expanded capitals carries the monument; Cormorant Garamond stays for editorial sentences. DM Sans is removed. One stylesheet, `app/v2/monument.css`, replaces the four layered files (`hall.css`, `triangle.css`, `flow.css`, `atmosphere.css`).
- **The day moves with the journey.** Morning in the Gilded Hall, afternoon in the Reading Room, golden hour in the Gallery while the library works, dusk in the Rotunda for the reveal. Text flips from ink to bone as the light falls (`hall-light` / `hall-dark`).
- **The room is a character.** `world.tsx` renders each painting through a depth map in one WebGL fragment shader (no library). The pointer or device tilt moves the camera inside the room, scrolling tilts the view to the floor, changing screen walks forward through the depth (near architecture passes first), and the reveal's prism nudges the camera as it turns. Depth maps (`public/hall/depth/*.webp`, about 4 KB each) were made with MiDaS DPT-Hybrid, then dilated and blurred so edges stretch the background rather than tear. Without WebGL, or with reduced motion / Pause, graded still images are shown and nothing animates.
- **The triangle is an object.** `prism.tsx`: a standing obsidian prism with gilded edges. Faces are the three works, edges are the threads, the crown holds the common thread. Every 60° turn is one step of Walk the triangle, so drag-to-turn settles on a face or an edge; tilting forward opens the crown. Engraving fades as a face turns away. The same object appears at every stage: an emblem in the Hall, the first face engraved on confirm, the other faces being engraved while thinking, complete under the oculus at the reveal.
- **Reveal.** Name, hook, then the prism in a shaft of light; the reading note (left) and the step rail (right) follow the prism. Keyboard: ArrowLeft/ArrowRight/Escape. The step rail is the accessible path (labelled buttons); prism faces are pointer affordances only.
- **Copy.** Kept, except the find screen headline now reads "What stayed with you?" (previously the placeholder) and the welcome drops the duplicate "Read · Listen · Watch" line.

Verification: TypeScript and `eslint app/v2` pass; `tests/hall-client.test.ts` 8/8; production build passes. `npm test` has 6 failures that also fail on `codex/gilded-hall-v2` (backend tests, unrelated). Visual review at 1440×900 and 390×844 across every screen and all seven reveal steps with `scripts/review-shots.mjs` (mocked APIs), plus drag, keyboard, Look around and Escape in a motion-on run.

## The drawn threeangle, transitions and the archive — September 26 (round two)

- **The symbol is a drawing, not an object.** `figure.tsx` replaces the obsidian prism. It is a construction drawing in the manner of Galileo's and Michelangelo's notebooks: a three-sided pyramid on a lazy susan, inked, hatched and annotated, with dashed hidden edges, a circumscribing circle, a plumb line, a compass arc and a height dimension. Faces are the works, edges the threads, and the apex the common thread, the one point all three faces reach. The apex keeps drifting, so the three faces never hold fixed proportions. Seen from directly above, the drawing becomes the threeangle mark. The header mark is the same drawing from above, gently alive.
- **Carried throughout.** It is Fig. I on the welcome (the table rests on each angle in turn), carries the first face while you confirm, searches while the library works (the apex wanders and the compass sweeps), and becomes the reveal's lazy susan, turning in 60° detents with a slight mechanical settle. Margin callouts name the work in focus.
- **Transitions.** The walk between rooms is longer (2.8 s), with a zoom blur toward the vanishing point, and mid-journey the rooms turn to archival film: silver, flickering, gate weave, scratches and dust, a silent-film iris, and a cut of archive footage when clips are present. Screen content arrives once the camera is under way.
- **Archive footage.** `archive.ts` + the shader's archive channel: clips flash through each journey and play on the Gallery's far arch while the library works, as if from a projector. The dark rooms keep a faint film texture. The clip list is empty until footage is pulled: `node scripts/fetch-archive.mjs` downloads the curated shortlist (`scripts/archive-shortlist.json`, 18 public-domain FedFlix shots found through destockd.com: card catalogs, stacks, reading rooms, pages, radio microphones, phonographs, typewriters, projection booths, a newsreel cameraman, a clapperboard) and encodes each as silent black-and-white WebM and MP4. It needs network access to `clips.destockd.com`.
- **Copy.** The welcome call to action now reads "Pick your starting point".
