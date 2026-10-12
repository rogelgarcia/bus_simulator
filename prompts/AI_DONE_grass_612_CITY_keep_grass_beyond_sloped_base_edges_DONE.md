DONE

## Completed changes

- Passed each rendered foundation slab's final ground-contact contour into gameplay grass coverage, including the bus-start reservation base.
- Excluded the complete top and sloped apron from the existing shared mask used by detailed grass, transitions, litter and distant canopy, without changing slab geometry or adding a fixed setback.
- Added regressions for actual city slabs, rotated building/bus footprints, merged aprons, sidewalk joins and retained grass gaps.
- Updated the gameplay grass and building slab specifications with the shared boundary contract.

## Validation

- Reproduced the original failure before the patch: 11,110 of 14,256 boundary samples leaked across 58 of 60 rendered city slabs.
- Final gameplay validation: zero leaking boundary samples across all 60 slabs and zero leaks at 3,444 rendered slab triangle centers.
- Five additional boundary cases passed 3,483 top/slope/foot checks, plus explicit retained-gap and sidewalk-connection assertions.
- 22 Node tests passed across `building_slab_plan`, `building_slab_boundary`, `city_construction_placement` and `grass_settings`.
- Five browser tests passed across `grass_slab_exclusion`, `grass_gameplay_modes` and `grass_debug_v2_grass`, covering both lab strategies, Texture/3D switching, save/cancel/reset, reload, scene re-entry and driving.
- Inspected matched before/after close, low-angle, overhead, transition and far views of the bus base and a building base. The capture helper checks line of sight to avoid hiding the edge behind neighboring buildings. Camera-window changes retain the same exclusion.
- The current bus lab places its bus on the road and has no foundation-slab instance; its scene remains unchanged and both existing strategies passed.
- No grass asset or slab geometry changed, so no offline bake was needed. The existing gameplay visibility-map warning remains unrelated to this correction. This is a coverage fix, not a performance optimization; no performance claim is made.
- `git diff --check` passed. No commits were created.

## Evidence

Generated evidence remains gitignored under `tests/artifacts/screens/grass/ai612_sloped_base_exclusion/`:

- `before-{bus,building}-{close,low,overhead,transition,far}.png` and matching `after-` captures.
- `before-coverage.json`, `after-coverage.json`, `boundary-cases.json`, `before-test.log` and `after-test.log`.
- The retained baseline mode (`AI612_CAPTURE_PHASE=before`) removes only the new slab-mask draw in browser routing, leaving workspace code intact; its gameplay assertion fails as expected. Normal test mode validates the fixed runtime.

# Problem

The new gameplay grass grows through the sloped edges of the bases used for buildings and the bus. These bases extend beyond their top surfaces or object footprints. Grass must begin outside the complete base, after the slope meets the surrounding ground.

# Request

Correct grass coverage around building bases and the bus base so their top surfaces and sloped edges remain clear and grass grows only beyond their outer ground-contact boundary.

Tasks:
- Identify the actual building-base and bus-base geometry involved in the reported issue, including the full sloped apron. Use its outer ground-contact boundary as the grass exclusion boundary, rather than only the building/bus footprint or the top edge of the base.
- Apply the correction to both kinds of base wherever they are used with the new grass system. Verify the affected gameplay locations and any corresponding bus-lab instance.
- Keep all visible grass representations consistent with that boundary: detailed blades, transition geometry, litter and distant canopy must not appear rooted inside or protrude through the slope. Grass should resume naturally immediately outside it without an unnecessarily wide bare border.
- Respect the actual footprint after placement, rotation, sizing and any existing slab merging or sidewalk clipping. Keep valid neighboring grass areas intact, including corners and gaps between separate bases.
- Preserve the existing base geometry and its slope. Correct the grass coverage rather than hiding the issue by flattening, shrinking or removing the base, or by disabling grass nearby.
- Preserve the current Texture / 3D options and default 3D renderer. Keep Texture mode free of standing grass and keep the removed edge-blend feature removed.
- Update the applicable grass and base-coverage specifications to describe which boundary owns the exclusion and how every grass representation follows it.

## Repository context

- Follow-up to completed AI 611; leave its completed prompt intact.
- Gameplay contract: `specs/grass/GRASS_GAMEPLAY.md`.
- Gameplay placement and foundation-slab assembly: `src/graphics/visuals/city/City.js`. Building footprints currently enter grass coverage before the later slab assembly; trace the authoritative final geometry for both reported base types.
- Shared grass runtime and coverage: `src/graphics/engine3d/grass/runtime/`, including `GrassCoverageMask.js` and `GameplayGrassRenderer.js`.
- Current bus lab: `debug_tools/grass_debug_v2.html`, `src/graphics/gui/grass_debugger_v2/` and `specs/grass/GRASS_DEBUG_V2.md`.
- AI 613 separately covers curved grass boundaries and an experimental bus-lab layout. This task covers exclusion around sloped bases.
- Follow `ai_rules/PROJECT_RULES.md` and `ai_rules/TESTING_RULES.md`. If an offline bake is required, use the registered `node tools/bake.mjs` framework and retain its validation/publication gates.

## Validation and acceptance

- Reproduce the reported intersection at a building base and the bus base, then confirm the full slope is clear from close, low-angle and overhead views.
- Verify coverage at the top, middle and outer foot of each slope, plus grass immediately outside it. Include representative rotated or merged bases and sidewalk joins where supported by the existing base system.
- Inspect near, transition and far grass while moving the camera. The corrected edge must remain stable across LOD changes and gameplay camera-window movement.
- Add focused coverage regression checks tied to the final base boundary, and run relevant existing grass checks. Verify mode switching and the bus lab still work.
- Save before/after screenshots and any generated logs or reports under `tests/artifacts/screens/grass/ai612_sloped_base_exclusion/`; keep them gitignored and untracked.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to `AI_DONE_grass_612_CITY_keep_grass_beyond_sloped_base_edges_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, validation results and paths to generated evidence.
- If performance optimization is undertaken, include a same-condition before/after table with frame time, FPS and relevant workload metrics. Identify hardware, resolution, graphics settings, workload/camera, warm-up, sample count and statistic used. Mark unavailable metrics as `not measured` with a reason.
