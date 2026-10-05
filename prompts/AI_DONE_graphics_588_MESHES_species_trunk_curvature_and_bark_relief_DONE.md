# Problem

The London plane bark reads as flat color and the mature trunks are too straight.
The requested irregularities are physical bark crevices and broken plate relief,
suitable for later PBR baking, plus larger bends informed by each species.

# Request

Research all five species' growth habits and reference photographs. Revise all
three mature forms per species with appropriately varied trunk and scaffold
curvature, retaining roots, continuous branch unions and attached solid foliage.
Recover the London plane scan's crevice detail in actual 3D and material shading.
Use headless Blender through the shared bake framework, keep an editable source,
and render species views, wood-only silhouettes and bark close-ups for review.
Leave gameplay asset replacement and mesh/PBR optimization for a later pass.

## Completed

- Researched documented growth habits and preserved six credited reference
  photographs. Modeling interpretations and source links are in
  `specs/trees/species_trunk_growth.md`.
- Added the registered `vegetation/growth` bake leaf, using shared headless
  Blender configuration and existing source-authentication/publication gates.
- Revised all 15 mature specimens with deterministic nonperiodic sweeps,
  species-specific crown deflection, pinned ground contact and transported
  foliage. Leaf forms, counts, scales and tint signatures are retained.
- Recovered London plane height from the original CC0 floating-point photographic
  scan and rebuilt the three detailed wood surfaces with calibrated crevice depth.
  Bark remains registered to the bent wood using rest coordinates.
- Saved the packed editable scene and calibrated height, plus 18 Cycles renders
  at 2560 × 1440 / 128 adaptive samples, including species groups, trunk close-ups,
  exposed wood and matching textured/clay bark views.
- Validated all 15 models: zero boundary/nonmanifold edges, no reversed faces,
  positive growth Jacobians, pinned roots and matching retained foliage signatures.
  Maximum numerical twig-endpoint error: 0.000000202 m. The selected bake-framework
  suite passed all 13 tests. Final PNG integrity, local gallery links and packed
  scene copy hash were checked.

Final review: `tests/artifacts/screens/ai588_trunk_growth/final/index.html`.
Photo references and explanation: the adjacent `research.html`.
Editable scene: the adjacent `mature_tree_arboretum.blend` (42,714,158 wood triangles).
Detailed results: the adjacent `completion.json`, `scene.json` and `relief.json`.

Gameplay tree assets remain unchanged. Optimized mesh and normal/AO atlas baking
are intentionally deferred to the later optimization pass requested by the user.
