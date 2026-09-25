# DONE — AI 567: street-level grime band

# Problem

At the foot of a city building the stone is darker than above. Rain splashes back off the pavement,
traffic and pedestrians leave grime, and damp rises from the ground; the ICOMOS-ISCS glossary lists
rising damp among the causes of darkened "moist areas". The band is darkest at pavement level and fades
upward with a soft top edge. It sits only on surfaces that face the street, and it breaks at openings.

On the Bradbury block it belongs on:
- the bases of the ground-floor piers;
- the plinths of the portal pilasters;
- the stone under the storefronts;
- the door jambs.

This is a feature of the wear layer (AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf

# Request

Add the street-level grime band to the wear layer.

Tasks:
- The grime is driven by height above the pavement: strongest at the ground and fading upward. Splash
  darkening reaches about half a metre; lighter rubbing marks can reach about hand height on exposed pier
  corners.
- Only surfaces facing the pavement and street take it. It stops at door and storefront openings and does
  not climb into recesses the pavement cannot splash.
- Corners and protruding plinths, which take more splash and contact, are a little stronger than flat
  runs between them.
- The top edge is soft and even along a run. Any variation comes from the geometry (corners, plinths,
  openings), never from noise.
- It works in the ground-floor stone's own look: darker and slightly rougher, the stone texture still
  visible.
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/street_grime/` (gitignored).
- Off and on side by side for `st_portal`, `st_along` and `st_corner`, plus a close-up of one pier base
  and the portal plinths.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_567_BUILDINGS_bradbury_wear_street_level_grime_band_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_567_BUILDINGS_bradbury_wear_street_level_grime_band_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary

- Added the wear feature `street_grime` (`wear/features/street_grime.py`, registered in `wear/registry.py`, ORDER 230, yellow in the debug view): the darker foot of the building's stone from splash, street grime and rising damp, byte-identical from one build to the next, in about 3.5 s.
- Cast the street level of every face on 2 cm texels (0.10 to 1.40 m) and found its stone: the pier ring's fronts and returns, the portal plinths, steps and portal piers; the storefronts, glazed down to a frame rail on the pavement, have no stone under them, so their stone is their jambs.
- Measured the band up from the ground each surface stands on (the pavement, or the step's top for the portal piers): darkest at the ground, fading with a soft top edge to nothing by 0.65 m, one height all along a run.
- Measured how far back the rain-wet ground runs in front of each column with AI 565's rain model, so the band wraps each pier onto the storefront and door jambs (their recess floors are pavement in the rain) and onto the portal piers at the mouth, and fades out behind the wet ground inside the portals' recesses.
- Found the 100 exposed convex arrises standing on the ground (the piers' at every opening, the plinths', the portal piers', the block's corners, the chamfer's at half sharpness): within 0.2 m of each, on both faces, the band is up to 20% stronger and faint rubbing marks run up to hand height; plinths standing proud of the pier ring take 12% more.
- Declared 159 sources and 159 marks with 59 paths: 59 runs (a line along each run's foot, its band one mark) and 100 corners (a line up each arris), the debug view drawing each run's top edge.
- Added the look: the stone's own colour darker, a little greyed and a little rougher, its texture and normal map untouched; masonry walls and jambs only, never tops, soffits, glass, frames or doors.
- Calibrated in rendered pixels against the user's photo of the Broadway portal's plinths (0.43 to 0.48 of the shaft, in shade): a pier's foot at 0.50 of the clean stone in shade and 0.71 in sun, 0.76 and 0.89 at 0.3 m, gone by 0.6 m; a plinth's at 0.45 and 0.72.
- Published `zone` (the splash zone), `runs`, `corners`, `ground` and `profile` for AI 573 and AI 570.
- Proved the off switch at the render noise floor against the pre-wear renders on all five cameras and street grime at 0 against AI 566's own stills, the earlier masks byte-identical, and left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/street_grime/`.
- Documented the feature in the BradburyBlock README ("Street-level grime band (AI 567)").

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." The audit found the pattern here: every
pier took the same band, and every one of the 100 corners the same +20% splash gain and the same rubbing marks to hand
height. At 1:1 each pier carried the same U, its horns 0.82 of the clean stone in shade on 3rd Street.

- Each run now draws its own amount (0.78-1.12, up to 15% more on busy pavement; about one in twelve scrubbed, 0.40-0.65)
  and reach (0.85-1.18). Each corner draws its own splash gain and zone, and whether it is rubbed at all, led by how busy
  the pavement is (the portals' mouths, the three doors the build finds, the block's corners, keep right): 36 of the 100
  are rubbed, most of them at the entrances and the block's corners and 5 of the 50 along the quiet rows of shop
  windows, each with its own strength, height and jamb share. The mask's G now holds each corner's extra over the band.
  The inventory, the depths and `profile` are unchanged, so edge wear (570) and mortar erosion (573) rebuilt
  byte-identically, as did every other feature.
