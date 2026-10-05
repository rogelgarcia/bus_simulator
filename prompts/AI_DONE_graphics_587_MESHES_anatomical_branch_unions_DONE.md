DONE

# Problem

The photographic tree trunks still have artificial-looking bifurcations: narrow
tubes intersect a uniform trunk with abrupt corners and little growth anatomy.

# Request

Research real photographs and explanations of branch attachments, then improve
the wood geometry in the editable collection using headless Blender. Retain the
photographic PBR materials, existing foliage, three mature forms per species and
current gameplay assets. Model asymmetric lower collars, upper bark ridges and
gradual parent-to-branch transitions with independently varied proportions.
Save references with attribution and render close-ups from multiple directions.
Use the shared bake framework and preserve topology/publication validation.

## On completion

Mark DONE on the first line, record validation and artifacts, and rename to
`AI_DONE_graphics_587_MESHES_anatomical_branch_unions_DONE.md`.

## Completed changes

- Researched branch collars, bark ridges and fork grain anatomy using Purdue Extension, a credited Averilp photograph and Slater et al. (2014); retained three unmodified reference images with rights and source links.
- Rebuilt 576 attachments across all 15 mature models with asymmetric collars, descending parent shoulders, upper ridges and independently seeded proportions, fused into continuous wood before photographic bark displacement.
- Preserved photographed PBR materials and every foliage coordinate and transform; current gameplay trees remain unchanged.
- Registered the stage-only `vegetation/junctions` bake leaf with build, camera-only and render phases using the shared Blender configuration and original validation/publication gates.
- Corrected mixed-precision face-orientation checks for near-collinear planar ground-cap triangles; added a focused zero-displacement regression without relaxing the rejection threshold.
- Rendered 21 final Cycles/OPTIX images at 2560 × 1440, 128 adaptive samples: five views containing all three mature variants, a same-camera London plane comparison, and textured/clay fork studies. Hidden foliage is explicitly labelled in the relevant study views.

## Validation and evidence

- Full 15-model build passed manifold, boundary, displaced-face and triangle-limit validation; 38,717,342 detailed wood triangles in the authoring collection.
- The focused stationary-cap regression failed against the original precision code and passed after correction.
- Foliage signature before/after: `c0092ca1bc8ce4483a8e12486a7ea532860d8c0489c3b44b708568910174278d`.
- Camera-only framing pass verified that all mesh coordinates and transforms remained unchanged.
- `node tools/run_selected_test/run.mjs`: 13/13 bake-framework tests passed. Scoped `git diff --check` passed.
- Final package verified 21 unique full-resolution images and 74 local links.
- Review: `tests/artifacts/screens/ai587_branch_unions/final/index.html`.
- Photographic research: `tests/artifacts/screens/ai587_branch_unions/final/research.html`.
- Editable packed scene: `tests/artifacts/screens/ai587_branch_unions/final/mature_tree_arboretum.blend`.
- Checksums, render settings and build/render receipts: `tests/artifacts/screens/ai587_branch_unions/final/completion.json`.

The detailed models are a visual approximation of growth anatomy, not a mechanical
growth simulation. Existing PBR source approximations remain documented in the
scene package. Gameplay optimization is deferred as requested.
