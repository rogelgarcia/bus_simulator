# Problem

Brickwork set against stone, cast stone or terracotta trim often shows a faint white bloom just below that
trim. The Brick Industry Association's Technical Note 23A names caps, copings, sills and lintels as trim
that "may contain soluble salts, which can contribute significantly to efflorescence on the face of
adjacent brickwork". Water carries the salts into the brick below, where they crystallise as it
evaporates. The ICOMOS-ISCS glossary adds that efflorescence comes from the material itself, unlike
deposits from outside, and that it follows the evaporation front.

On the Bradbury block the places are the brick just below:
- the window sills;
- the band between floors 4 and 5;
- the impost course;
- the crown's base;
- any trim where water gets into the wall, such as around the fire-escape anchors (AI 568).

Los Angeles is dry, so this should be faint. This is a feature of the wear layer (AI 563) and follows its
rule #1: nothing placed by noise.

Sources:
- https://www.gobrick.com/media/file/23a-tn23a.pdf
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/

# Request

Add efflorescence to the wear layer: a faint whitish salt bloom in the brickwork directly below stone and
terracotta trim.

Tasks:
- Sources are the lower edges of trim set into brick. Brick with no trim above it takes none.
- The bloom starts at the trim's lower edge and fades downward within a short distance, tens of
  centimetres, never a full storey.
- It is strongest in the mortar joints, where salts travel and deposit first, and weaker on brick faces.
  Its lower boundary follows the joints, not a smooth line and not noise.
- Wet paths make it stronger: below the ends of sills and where runoff (AI 564) crosses the trim's edge.
- It lightens and slightly desaturates the brick and mortar without covering the brick pattern. It stays
  faint by default.
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/efflorescence/` (gitignored).
- Off and on side by side for `st_corner` and `st_up`, plus close-ups under one sill and under the band.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_569_BUILDINGS_bradbury_wear_efflorescence_below_trim_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_569_BUILDINGS_bradbury_wear_efflorescence_below_trim_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
