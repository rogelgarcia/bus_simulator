# DONE — AI 573: mortar joint erosion at exposed courses

# Problem

On an old brick wall the mortar joints are not uniformly intact. Where rain and runoff hit hardest, the
mortar washes out and the joints recede, catching shadow. Where the wall is sheltered, the joints stay
flush. Wind-driven rain hits a facade hardest at its top edge and top corners (Blocken & Carmeliet 2013).
Concentrated runoff below ledges (AI 564) and the splash zone at the base (AI 567) wet the wall
repeatedly too. The ICOMOS-ISCS glossary treats this under erosion, the loss of material from the
surface.

On the Bradbury block the eroded joints belong in:
- the top courses under the crown and at the building's corners;
- the paths of the runoff streaks;
- the lowest courses above the stone base.

Everywhere else they stay as the brick texture draws them today. This is a feature of the wear layer
(AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/

# Request

Add mortar joint erosion to the wear layer: deeper, darker, slightly wider joints where the wall is most
exposed to water, and intact joints elsewhere.

Tasks:
- Erosion follows exposure to water. Use the same rain-exposure measure as AI 565 and AI 566, the runoff
  paths of AI 564 and the splash zone of AI 567. It is strongest at the top corners and edges, along
  streak paths and just above the base, and absent in sheltered areas.
- Only the joints change: they read as recessed (deeper shadow in the relief, a little wider) and the
  exposed mortar slightly darker or sandier. The brick faces stay as they are.
- The change follows the brick texture's own joint pattern. Nothing is painted over the brick, and no
  noise is added.
- Within an exposed zone every joint is affected more or less evenly. The zone's edges fade with the
  exposure measure, not with a noise pattern.
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/mortar_erosion/` (gitignored).
- Off and on side by side for `st_up` and `hero_3q`, plus a raking-light close-up of a top corner and one
  of a sheltered wall for contrast.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_573_BUILDINGS_bradbury_wear_mortar_joint_erosion_at_exposed_courses_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_573_BUILDINGS_bradbury_wear_mortar_joint_erosion_at_exposed_courses_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary

- Added the wear feature `mortar_erosion` (`wear/features/mortar_erosion.py`, registered in `wear/registry.py`, ORDER 100, NEEDS soiling, runoff, washed and street_grime, lime in the debug view, `wear_mortar_erosion` 1.0 by default): the brick's mortar joints recessed where water reaches the wall most, flush where it is sheltered; no noise, hash or seed, the mask byte-identical on every rebuild.
- Placed the erosion by the water alone, three measures found by the earlier features: AI 566's rain exposure against its general level (from 1.15 to 1.35 times it, never under 565's overhang shelter), which puts it on the corner pavilions' upper floors, strongest on their top floor and down the block's corners; AI 564's streaks, each walked down the elevation exactly as 564 walks it (the sill ends' streams, the brackets' and capitals' feet, and the crown's curtain on the top courses under the crown; the thin curtains faintly); and the splash off the base's top, AI 567's own profile measured up from the ground floor crown's broad top where the brick begins (567's street splash zone lies on stone, with no brick in it).
- Packed it into one 2 cm 8-bit channel laid only on the brick the elevation sees and grown two texels into the surfaces beside it; 864 sources and marks (110 exposed fronts, 668 streaks, 86 runs of base ledge), each with its outline or path in the debug view.
- Made the look change the joints and nothing else, following the brick set's own joint pattern: a Bump node on the joints added to the brick's normal map (the mortar sunk 3 mm, the exposed arris half as far), the arris ring darkened into the groove's shade and the mortar darker, a little sandier and matte; the strength scales it past 1 and 0 hands the input on exactly; the brick faces render unchanged (1.000).
- Added a backward-compatible framework signal, `Joint Wide` (`wear/nodes.py`: the brick set's joint grown 2 mm past every edge, read from its height map twice more), because the set's joints are a one-pixel step no remapping can widen; no earlier feature reads it.
- Calibrated in rendered pixels: in the scene's sun raking the chamfer's top floor, a bed joint reads 7.4 to 10.5 mm wide and 0.22 to 0.17 of the brick with its shadowed lip at 0.04, the sheltered north wall unchanged in the same light; from the street a faint crisping of the brick (0.05 to 0.10 levels); judged against the Commons photo's flush, maintained joints.
- Proved every earlier mask, cache and mesh (attributes, chipped and substituted copies) byte-identical, the layer off at the render noise floor against the pre-wear stills and the erosion at 0 against AI 572's stills on all five cameras; left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/mortar_erosion/`.
- Documented the feature in the BradburyBlock README ("Mortar joint erosion at exposed courses (AI 573)") and the new input in the framework's sections.

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." The audit found the pattern here too:
the corner pavilions are the same shape and the rain's measure the same at every corner, so every pavilion carried the
same eroded zone (the top floor in full and a fade down the corner arris, mirrored on both faces of each corner; the
square corners' windows alike to within 0.006 to 0.031), the 22 pier fronts one faint gradient each, all alike, and
every capital's stream eroded at 0.93 whatever water AI 564's rework drew for it.

- Each drop of the facade (every pavilion's face and every pier front, 566's projecting brick fronts, in two lifts the
  band divides) now draws its mortar from a seed of its face, span and lift: how far its erosion has got (0.65 to 1.15
  of the calibrated look, or one in seven repointed since, 0.15 to 0.40) and the exposure it erodes at (0.96 to 1.04);
  each corner of the block draws, on each face, its catch's rise at the arris (0.50 to 1.40) and its reach into the face
  (0.70 to 1.30), soiling's catch law with the corner's own. The exposure still leads; a drop's depth holds for all the
  water on it; each capital's stream now carries 564's drawn water; the mask holds the erosion over 1.25 so a drop may
  pass the calibrated look. As built no two pavilions alike (the NE corner eroded to the second floor on Broadway and
  lightly on the north face; both of the north face's top floors and the whole chamfer repointed), the pier fronts
  from 0.004 to 0.37, the look of an eroded joint unchanged; every other feature's mask, cache, attributes and
  meshes byte-identical, 2697 objects. README: "Mortar joint erosion at exposed courses (AI 573)" with a new "One
  drop and one corner at a time (rework 2026-09-23)"; evidence in
  `tests/artifacts/screens/bradbury_wear/rework/mortar_erosion/`.
