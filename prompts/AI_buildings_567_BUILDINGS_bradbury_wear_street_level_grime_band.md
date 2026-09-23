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
