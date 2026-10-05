DONE

# Problem

The original vegetation library has twelve mature forms, but its trunks, roots
and branch intersections still show the compromises of the first low-cost pass.
The user requests the best detailed three-dimensional trunks first, with
optimization deferred to a later task.

# Request

Create detailed woody models for all three mature forms of London plane,
silver linden, northern red oak and arrowwood viburnum. The detail must exist in
the geometry and remain visible without bark textures.

Tasks:
- [x] Model natural root flares, continuous trunk-to-branch transitions and
  species-appropriate physical bark relief for all twelve forms.
- [x] Preserve the existing foliage geometry, cards, coverage, atlas images and
  silver-linden underside behavior.
- [x] Keep one implementation per species and retain the existing game trees;
  expose the new assets through the current original-library inspection flow.
- [x] Save editable detailed sources, reproducible recipes and authenticated
  publication metadata through the existing bake framework, using headless Blender.
- [x] Validate geometry and source integrity and inspect comparable textured,
  clay and raking-light close-ups of the roots, forks and bark.
- [x] Record actual model costs and the remaining scope for later optimization.

The previous triangle limits are superseded for this detail pass. Do not add a
quality selector, decimate the models or claim mobile performance. Original
procedural assets and verified CC0 downloads are allowed.

Visual evidence, captures and generated reports belong under
`tests/artifacts/screens/ai578_tree_trunks/` and remain gitignored.
The current contract is documented in `specs/trees/detailed_tree_trunks.md`.

## On completion

- Mark this document DONE in the first line and rename it to
  `prompts/AI_DONE_graphics_578_MESHES_detailed_3d_tree_trunks_DONE.md`.
- Keep it in `prompts/`; do not archive it automatically.
- Add a concise summary of each completed change, validation and evidence paths.
- Report actual triangle/file costs. Optimization, full-game frame timing and
  production tree replacement are deferred, not implied by these asset checks.

## Completion - 2026-10-03

Published v3 detailed wood for all twelve mature forms: fused trunks and branch
collars, descending root buttresses, species-specific geometric bark, localized
scars and matched 2048-pixel bark maps. Every form has a packed editable Blender
source. Headless authoring stays inside the registered bake framework; the four
species leaves and parent job passed authenticated publication. No decimation
or device tier was added.

All sixty foliage attribute hashes and thirty-six embedded foliage map hashes
match preserved v2 evidence exactly. All twelve wood meshes have zero boundary
edges, non-manifold edges and degenerate triangles. Tree wood is connected;
shrub stem groups are grounded. The original gameplay loader remains unchanged.

The four focused selected-test targets passed seven tests with zero failures,
including catalog, all-model imports, legacy loading, final showcase and actual
Inspector loading/framing checks. Evidence includes sixty-four 3840 x 2160
textured/clay showcase images and one UHD Inspector image. Final views were
reviewed for bark relief, roots, collars and distinct mature forms. Broad collar
mapping still stretches some grain, most visibly on linden; the earlier hard
chart seams and unrelated annular patches are fixed.

Actual models contain 1,065,126-3,017,464 triangles each, with two material
primitives; GLBs are 34.89-93.38 MiB and packed Blender sources 29.69-78.43 MiB.
The complete per-form table is in `specs/trees/detailed_tree_trunks.md`.
Retopology, detail baking, compression and production frame measurements remain
for the later optimization pass. Existing game trees have not been replaced.

Receipts and evidence:

- `tests/artifacts/screens/ai556_bake_framework/run-1791040604966-34768-0e4a8c6b/summary.json`
- `tests/artifacts/screens/ai578_tree_trunks/checks/summary.json`
- `tests/artifacts/screens/ai578_tree_trunks/final/capture_report.json`
- `tests/artifacts/screens/ai578_tree_trunks/final/foliage_preservation_and_geometry.json`
- `tests/artifacts/screens/ai578_tree_trunks/final/inspector/`

All owned Blender, browser and test-server workloads finished or were stopped;
the pre-existing interactive Blender session was left untouched.
