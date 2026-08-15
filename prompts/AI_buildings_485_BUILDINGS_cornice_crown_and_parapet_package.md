#Problem

Fabricated buildings end in a bare parapet: the roof layer supports only a plain ring, and floor-layer tops have only the flat `belt` band. Every masonry building in the reference set crowns with a projecting cornice â€” often with repeating dentils or corbel brackets underneath â€” and many also carry an intermediate cornice above the ground-floor base. The missing crown is the strongest "unfinished" tell on current buildings when seen from street level.

Reference images: `downloads/buildings_references/` â€” 2 (corbelled brick cornice + stepped parapet), 5 (heavy stone crown), 7/9/13/15 (bracketed crowns on brick towers), 12 (brick corbel-table parapet), 16 and m1â€“m4 (cornices at both the roofline and the top of the storefront base).

# Request

Add a cornice feature to building fabrication. Design principle (applies project-wide): ONE cornice feature with profile/ornament modes â€” not separate "roof cornice", "base cornice", "parapet" features. It must be attachable to the top of any layer: on the roof layer it is the crown; on a lower floor layer it is the intermediate cornice above a base.

Tasks:
- Add a `cornice` block to the layer schema (sibling of `belt`), with: profile mode (`flat_band`, `stepped`, `crown_molding`, `corbelled_brick`), total height, projection depth, and material selection following the same modes as window surrounds (`match_wall`, explicit material; use building material slots from AI 491 if that has landed).
- Repeating ornament module under the profile: `none | dentils | brackets`, with module width, depth, spacing, and material. Ornament geometry must be merged like all fabrication geometry (see `BuildingGeometryMerger`), not per-module draw calls.
- Parapet options on the roof layer: coping cap (small top band with slight overhang) and a `stepped` parapet silhouette variant (raised blocks at corners/center as in ref 2).
- Corners must wrap cleanly: miter the profile at facade corners, and keep ornament spacing visually continuous around the corner (no half-modules colliding at the seam).
- Respect facade silhouettes with `planOffset` differences between layers (cornice follows the layer's own footprint).
- Correct shadows and no z-fighting against the wall below and the roof/parapet above; verify with the game's sun setup.
- Update the `BuildingFabrication2` GUI so cornice options are editable and preview correctly in the thumbnail renderer.
- Use it in at least one showcase config (e.g. `stone_lowrise_2` crown + an intermediate cornice above a storefront base) and validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema normalization round-trip for the `cornice` block, and a generator-level test asserting cornice + ornament meshes are emitted and merged for a layer with the feature enabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
