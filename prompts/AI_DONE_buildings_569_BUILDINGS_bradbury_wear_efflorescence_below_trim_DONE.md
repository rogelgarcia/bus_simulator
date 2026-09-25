# DONE — AI 569: efflorescence below trim

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

## Completion summary

- Added the wear feature `efflorescence` (`wear/features/efflorescence.py`, registered in `wear/registry.py`, ORDER 240, pink in the debug view): a faint white salt bloom in the brickwork just below stone and terracotta trim, byte-identical from one build to the next, in about 8 s.
- Found the sources on the model, not by list: every lower edge of trim standing directly over brick as the street sees it and set into it (a 2 cm elevation that records each texel's material, candidates from AI 565's 5 cm front). They are 78 window sills, the band between floors 4 and 5 (224 runs of its lower edge and, on the raised pavilions, of its top cornice), 186 bracket feet, 33 column-capital feet, the impost course (44 runs) with its 42 springing capitals, and the crown's base round the whole block. AI 568's 24 fire-escape fixings are sources too: 16 into the window strips' brick, 8 into sills. Brick with no trim above it takes none; the arch rings under the archivolts are left out, because their courses are not level.
- Measured the wall brick's level course grid on the model: world-metre UVs, a 1.26 m tile, 16 bed joints of 7 mm, and a phase per object (0.008 on floors 2 to 4, 0.792 on the top floor, where the texture is mapped upside down). The shader reads the bloom once per course, at its top joint, through a second lookup of its own mask, so every brick, head joint and bed joint of a course blooms together and the lower boundary always falls on a bed joint.
- Shaped the bloom: strongest at the trim's edge, fading down within tens of centimetres (the faces for one to three courses, the joints further, never more than 0.45 m). It is stronger and longer along the wet paths: AI 564's runoff, read at each texel (the sill ends, the curtains of the band, impost course and crown, the bracket and capital feet), and the water the fixings let in. It keeps off AI 568's rust streaks.
- Added the look: a salt-white veil that lightens and slightly desaturates, far more in the mortar joints and the lip of brick under each bed joint than on the brick faces, varying brick by brick with each brick's own tone (its porosity), matte, on brick walls and returns only. The brick's pattern stays under it.
- Calibrated in rendered pixels: under a dry sill span the first course's faces rise 5% in sun and 12% in shade and its joints 1.8x and 2.4x, fading out within three courses. The 1960 HABS photo of the Broadway bays reads 0.99 to 1.03 under its sills, so the bloom stays faint.
- Published `sources`, `courses` (the wall's level course grid, the bed joints in world z) and `field` (the bloom in the joints) for AI 573.
- Proved the off switch at the render noise floor against the pre-wear renders on all five cameras, and efflorescence at 0 against AI 568's own stills. The earlier masks and the rust attributes are byte-identical and the new mask reproduces on a rebuild. Left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/efflorescence/`.
- Documented the feature in the BradburyBlock README ("Efflorescence below trim (AI 569)").

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." The audit found the pattern here in its
plainest form: every trim edge over brick was a source, so the same pale band lay under all 78 sills, every bracket's
and capital's foot and the whole band, impost and crown (636 sources stamped alike).

- Each trim edge is now split into sites where water could get in (a sill's two ends and its bed, each foot, the impost
  over each pier, the band and crown in terracotta units, each fire escape fixing), and each site draws from a seed of
  its own name whether it leaks, likelier where 564's runoff or 568's fixings bring water, and if so its own amount,
  reach, width, position, roundness and lean: 41 of 1,004 sites bloom (10 of 156 sill ends), the lower boundary still
  steps down the brick's courses, the shader and the look are unchanged, and every other feature rebuilt
  byte-identically (README: "One site at a time (rework 2026-09-23)").
- Critique round 1 (2026-09-24): the fresh-eyes review found the course units' blooms (the crown's, less so the band's)
  drawn as pale grey-white rectangles with near-vertical ends and bright white joints, 1.12 of the brick beside in the
  sun on Broadway (a few per cent is the sill ends' calibration), lifting the crown's soiled band back toward clean so
  it read as a cleaned patch, and two neighbouring 3rd Street crown units that both leaked drew two matching dashes.
  Each bloom is now a bell hanging from its leak (deepest and strongest there, falling to nothing at either end with
  no flat part, each side its own length, so the lower boundary climbs the courses to the trim and leans), a wide bloom
  is a faint one (the leak's water spread over its width), neighbouring units of a course that both leak show one bloom
  that reaches toward the other's leak, and the salt's lift comes out under the deposits, half of it along the brick's
  hue: Broadway's crown bloom now measures 1.03 of the brick beside it (+7.9% round its leak), 3rd Street's pair is one
  bloom, the sill ends keep their look a little fainter, 40 blooms from the same 41 leaks, and every other feature
  rebuilt byte-identically (README: "Its outline and its strength (critique 2026-09-24)").
