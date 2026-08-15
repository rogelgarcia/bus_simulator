**DONE** (2026-08-15)

## Summary of changes
- Added `BuildingGeometryMerger` that merges a fabricated building's meshes by material at city build time, baking transforms into building-local space.
- Material deduplication is conservative: materials injecting custom shader code (UV tiling / material variation) are never shared across instances.
- Buckets key on material, geometry attribute signature, shadow/render flags, and the mesh flags the post-processing AO exclusion pass reads.
- Groups carrying `userData` (e.g. the windows group) are preserved as their own merge scopes; anonymous decoration groups are flattened.
- Wired into `City` behind `mergeBuildingGeometry` / `mergeDedupeMaterials` so authoring tools keep per-mesh picking; the showcase scenario can A/B it.
- Replaced the whole-map sun shadow camera with one fitted to the active view (110 m half extent, texel snapped, centred ahead of the camera), keeping every caster dynamic.
- Added a headless test asserting merging preserves triangle/vertex counts, world-space centroid, normals and bounds, custom-shader material count, and userData groups.
- Capture spec now discards one warm-up build, because a scenario's first build in a fresh page renders differently from later builds.

Results in BigCity2: city meshes 18,622 -> 2,775; scene render 8,604 -> 1,515 draw calls; camera-at-sky 5,471 -> ~1,200; shadow resolution 0.161 -> 0.054 m/texel (3x sharper).

Follow-up work (multi-resolution shadows, cascades) is tracked in
`prompts/AI_graphics_484_SHADOWS_cascaded_shadow_maps_and_sun_light_ownership.md`.

#Problem

City rendering became dramatically slower after the fabrication-engine buildings (`stone_lowrise_2`, `gov_center_2`, `mainstreet_block`) were added to Big City 2. Measured in gameplay (BigCity2, `?pose=civic_center_curve_front`):

- The `City` root holds **18,622 meshes**; **17,510 of them (94%)** belong to the three new fabrication configs.
- Per building: legacy configs are 4–28 meshes (`brick_midrise` 4, `stone_setback_tower` 28). New configs are **371** (`mainstreet_block`), **932 avg** (`stone_lowrise_2`, ×16 instances = 14,918), **1,108** (`gov_center_2`).
- The geometry itself is trivial: one `stone_lowrise_2` is 863 meshes but only 6,718 triangles — **8 triangles per mesh**. The cost is draw calls, not geometry. The dominant contributors are wall decorations (`edge_brick_chain` courses, `simple_skirt` shells + caps, `cornice_basic_block` blocks, `angled_support_profile` + caps), each emitting one mesh per segment/cap.
- Materials are fragmented: 114 material *instances* per building but only **68 structurally distinct** materials (57 distinct base-color textures, largely from per-face `materialVariation` bakes). Merging without deduping materials leaves ~114 buckets instead of ~68.
- One scene render costs **8,850 draw calls**; with the shadow map not rebuilt it is **3,230** — the sun's shadow pass is **5,620 calls (63%)**. Pointing the camera at the sky leaves **21 calls** of visible geometry, but still ~5,450 shadow calls, because the directional light's shadow camera spans the entire city (`half = size/2 + padding`, `far = 600`) and is rebuilt every frame (`shadowMap.autoUpdate = true`) even though the sun never moves.
- 98% of each building's shadow casters are sub-12-triangle decoration fragments (821 of 839 for `stone_lowrise_2`; 1,087 of 1,100 for `gov_center_2`).

The perf bar number itself is a whole-frame accumulation: `PostProcessingPipeline.render()` sets `info.autoReset = false` and resets once per frame, so `renderer.info.render.calls` sums shadow + scene + AO/bloom/composite passes. It is not "objects on screen".

# Request

Cut per-frame draw calls for fabricated buildings without changing how they look, and stop paying full shadow-pass cost for a static sun.

Tasks:
- Add a reusable merge pass that collapses a fabricated building's meshes into a few merged meshes, bucketed by material, run at city build time.
- Deduplicate structurally identical materials before merging so buckets collapse to the distinct-material count (~68/building) rather than the instance count (~114).
- Bake each source mesh's transform into the merged geometry, in the building's local space; keep `castShadow`/`receiveShadow`/`renderOrder`/visibility semantics by bucketing on them.
- Preserve groups that carry meaningful `userData` (e.g. the windows group and its `buildingWindowVisuals`) as their own merge scopes so runtime lookups and settings keep working; flatten anonymous decoration groups.
- Skip mesh kinds that must not be merged (instanced, skinned, morph targets) and fall back to leaving a bucket unmerged if geometry attributes are incompatible.
- Do not merge on the authoring path: `BuildingFabrication2` and the wall-decoration debugger need individual meshes for bay/decoration picking (`bayHighlightDataByLayerId`, per-mesh userData). Merging must be opt-in for gameplay/showcase consumers.
- Do not dispose source geometries/materials that come from shared caches (`BuildingWallTextureCache`, geometry caches); merging runs before first render, so detaching is enough.
- Reduce the sun shadow pass: stop rebuilding a static shadow map every frame and/or restrict the shadow camera to the region that actually needs shadows, while keeping dynamic casters (the bus) shadowing correctly. Note that three.js has one shadow map per light, so a naive `autoUpdate = false` freezes the bus shadow too.
- Verify no visual change: showcase captures for the affected buildings must match pre-change output, and gameplay framing must look identical.
- Report before/after draw calls for: full scene render, scene render with shadow rebuild suppressed, and camera-at-sky.
- Add/update tests: a unit test that merging preserves triangle count, world positions, and material identity for a synthetic group, and that preserved-userData groups survive the pass.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
