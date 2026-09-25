# DONE — AI 571: glass grime on the panes

# Problem

The Bradbury block's window glass is spotless on every floor. Real window glass collects dirt in a
consistent way:
- Rain runs down the pane and dries along the bottom rail, leaving its dirt there.
- Dust gathers in the lower corners.
- Glass sheltered under a deep head or transom stays dustier.
- Upper floors are cleaned less often than the storefronts, which are washed at street level.

On this building the panes are the upper-floor sashes on floors 2 to 4, the top floor's arched lights,
and the storefront and transom glass. This is a feature of the wear layer (AI 563) and follows its rule
#1: nothing placed by noise.

Sources:
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf

# Request

Add glass grime to the wear layer: dirt on window panes where water and dust actually leave it.

Tasks:
- Each pane is dirtiest along its bottom rail and in its lower corners, as a soft gradient rising from
  the bottom. It is not an even film across the pane.
- Faint drying lines from the top edge of each pane downward, anchored to the pane's frame, not scattered.
- Panes in deep, sheltered reveals are a little dustier than panes flush with the wall.
- Upper floors take more grime than the ground-floor storefronts, which stay nearly clean.
- Grime lowers the glass's clarity and reflection where it lies, and never makes it opaque.
- The layout follows each pane's own frame, so panes of the same kind match, differing only for physical
  reasons (height, shelter).
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/glass_grime/` (gitignored).
- Off and on side by side for `st_along` and `st_up`, plus a close-up of one upper-floor sash and one
  top-floor arched light.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_571_WINDOWS_bradbury_wear_glass_grime_on_panes_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_571_WINDOWS_bradbury_wear_glass_grime_on_panes_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary

- Added the wear feature `glass_grime` (`wear/features/glass_grime.py`, registered in `wear/registry.py`, ORDER 300, NEEDS soiling, teal in the debug view): dirt on every pane of the block and the portal, from per-corner attributes on the glass's own meshes (no atlas mask), byte-identical from one build to the next, in about 7 s.
- Found every pane's lights on the model, not by list: short rays from just in front of each of the 411 glass instances find the frame's bars (the sashes' 6 cm meeting rails, the top floor's 16 cm transom bars, the storefronts' dividers, the doors' meeting stiles, the portal transom's post) and the 780 lights between them, their edges to 0.5 mm, the arch-headed lights' frame fitted as a circle (within 0.8 mm).
- Laid the grime out in each light's own frame: a tide line and a soft gradient rising from the bottom rail (as tall as the light's height makes it), dust in the lower corners, faint drying lines hanging evenly from the head, stile to stile, each as long as the rain on its stretch of head carries it, and a film only on sheltered lights; lights of the same kind match.
- Took every amount from physics: 565's rain measure over each light's own texels (the rain its reveal keeps off: the film and a heavier rail; the rain on its head, fitted across the light: the drying lines), and a cleaning share by height (0.18 where a hand reaches from the pavement, all of it from 6 m): storefronts and doors nearly clean, transoms half, upper floors full, the portal's deep-set glass dustiest per unit of cleaning.
- Made the look a dust film: toward a warm grey, rougher (the reflection blurs and dulls), less see-through (Alpha up, Transmission down), never opaque (at the heaviest the see-through keeps 56%, the transmission 52%).
- Switched the cut panes through the framework's `replaces`: each of the block's 396 glass objects has a copy cut behind its bars and carrying the attributes, rendered only while the feature is on, so the off switch renders the untouched glass (cutting in place had left 1-level noise on the glass). The portal's glass needs no cut and carries its attributes in place, with edge wear on or off.
- Calibrated in rendered pixels: in sun the bottom rail's first 3 cm read about 2 times the clean glass, 1.2 at 10 to 25 cm, the middles untouched, the storefronts at most 1.1; judged against the 1960 HABS photo (no heavy band) and the Commons photos (clean sashes and shop glass) for a maintained building.
- Proved the off switch at the render noise floor on all five cameras and glass grime at 0 against AI 570's stills; the earlier masks, caches, rust and edge wear attributes and chipped meshes are byte-identical. Left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/glass_grime/`.
- Documented the feature in the BradburyBlock README ("Glass grime on the panes (AI 571)").

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." Here it was the pattern itself: the same
pale tide band along every bottom rail, the same pale lower corners and the same ruled drying lines under every head, at
every one of the 780 lights.

- The grime is now an even dust film, set window by window: each window draws when its tenant last cleaned it (anywhere
  in its cycle; 8% neglected), whether that cleaning missed its hard-to-reach light (a sash's upper light, a top-floor
  arched light, a portal's transom), and each light a little more or less; height (the storefronts and doors stay
  nearly clean), the reveal's shelter and the rain on the pane modulate it, seeded from the glass object's name (a
  portal's glass from its portal, each of the three reading its own film by the face it stands on). Of 324 upper
  windows 29 are clean, 103 dusty; neighbours' films differ by 0.35 (median).
- The tide line, the pale corners and the drying lines are gone; only a mild, drawn gathering toward the rail and the
  lower corners remains, as much as the rain on the pane. The look is a coverage: a dusty pane is a little greyer (half
  the dust's colour on the covered share), hazier (less see-through), with a weaker reflection (the layer now routes the
  BSDF's Specular IOR Level on glass) and only a little blur (more spread the sun's glint into a white sheet). In sun a
  neglected window reads about a quarter lighter than it does clean; in shade next to no lighter, its reflection duller.
- Every other feature's mask, cache, attributes and meshes are byte-identical; the worn block has one object fewer
  (2697: the drying lines' head-path marker). README: "One window at a time (rework 2026-09-23)", "The film on a light",
  "The look" and the rest of the section; evidence in `tests/artifacts/screens/bradbury_wear/rework/glass_grime/`.
- Critique round 1 (2026-09-24): the fresh-eyes review found the glass still whitening, the whole pane now instead of
  a band: in sun a dusty pane read lighter than clean, the more so the dustier (Broadway's 4K elevation, by film: +16%
  at 0.6-0.9, +23% at 0.9-1.2, +46% on one arched light at 1.81; every pane sampled from `st_portal` 6-27% lighter than
  the pre-wear still), against the Commons pair the rework cited (the hazy pane 0.94 of its clear neighbour). The cause
  was the dust's light grey (0.17, 3.3 times the window glass's own luminance) lit by the sun on the covered share. The
  dust now acts on contrast, not brightness: its colour is a sooty grey as dark as the window glass (0.051, the tone the
  clean pane renders in sun), taken whole on the covered share (`VEIL` and `TINT` gone, so a clear pane dims by the
  cover's share, no longer three times as fast); the lost reflection and the lost see-through stay; the blur is gone
  (it spread the sun's glint over a dusty pane near the mirror direction as a white sheet, 2.06x clean, in the rework
  too); and a film saturates above a cycle's dust toward 1.40 (the arched lights' 1.81 is now 1.35). Broadway now
  reads 1.00-1.01 of clean at every film, no pane over +2.4% (66 of 120 were over +10%), and the 27 lights `st_portal`
  sees read 1.00 of the pre-wear still (1.13 before); the dusty panes are greyer as before but no lighter. In shade
  their weaker reflection leaves 3rd Street's dustiest panes 0.88-0.90 of clean (2 sRGB levels on panes that dark),
  and its transoms, darkest before at 0.62, read 0.75. Every other feature's mask, cache and worn objects are
  unchanged (README: "No lighter (critique 2026-09-24)").
