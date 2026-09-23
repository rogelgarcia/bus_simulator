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
