# Problem

Grass fields look jagged along curved roads instead of following the road's curve. The current bus lab primarily demonstrates straight roadside fields, so it needs a curved layout where grass boundaries can be inspected and adjusted before a later gameplay rollout.

# Request

Implement a curved grass area in the existing bus lab and make its visible grass boundary follow the curved road and surrounding hardscape smoothly.

Tasks:
- Add an accessible experimental area to `debug_tools/grass_debug_v2.html`'s bus scene, containing a curved road section, a junction with curved edges, or both. The layout must include a meaningful curved grass boundary and retain a usable bus scene and straight reference area.
- Make the experiment easy to revisit and adjust using the lab's existing scene/layout conventions. Support comparing different curve shapes or radii and their grass boundaries without requiring a separate lab or a new general-purpose road editor.
- Shape grass areas around the actual outer hardscape boundary, including sidewalks, curbs and sloped aprons where present. Show grass following both the inside and outside of a bend; if a junction is included, handle its rounded corners and connecting road edges continuously.
- Remove visible stair steps and rectangular field/cell silhouettes along those boundaries at normal inspection distances. Keep natural blade variation while making the overall field contour follow the curve accurately.
- Keep detailed blades, transition representations, litter and distant canopy aligned to the same intended curved boundary. Moving between LODs must not change the field outline, reveal square patches, leave holes or introduce hardscape overlap.
- Use the current bus lab's default baked grass strategy and shared renderer behavior. Preserve the bus, lighting/shadows, camera controls and existing comparison views so the curved area can be evaluated under the same conditions as the straight area.
- Keep this task's scene/layout experiment in the bus lab. Shared renderer changes may be made where appropriate, with regression checks for gameplay, but migration of the experimental road layout into the actual game is outside this prompt.
- Update `specs/grass/GRASS_DEBUG_V2.md` and any affected shared grass specification with the layout, how to access/adjust it, and the curved-boundary behavior. Do not reinstate the removed edge-blend option.

## Repository context

- Current bus lab scene and authored straight road: `src/graphics/gui/grass_debugger_v2/GrassDebugV2Scene.js`; trace its active baked grass adapter and field placement before changing coverage.
- Shared rendering and gameplay coverage modules: `src/graphics/engine3d/grass/runtime/`. Gameplay was migrated in completed AI 611; its contract is `specs/grass/GRASS_GAMEPLAY.md`.
- Road and sidewalk geometry: `src/graphics/visuals/city/RoadEngineRoads.js` and the existing road-engine/sidewalk builders it uses.
- `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md` explicitly records a rejected older approach. It is historical context, not an approved visual baseline for this task.
- AI 612 separately addresses grass growing through building and bus base slopes. Preserve that exclusion contract when work from both prompts is present.
- Follow `ai_rules/PROJECT_RULES.md` and `ai_rules/TESTING_RULES.md`. If baking is needed, register/reuse the appropriate `node tools/bake.mjs` domain/leaf and shared configuration rather than adding a standalone machine-specific command.

## Validation and acceptance

- Demonstrate at least one curved layout in the actual bus lab, with clearly inspectable inner and outer grass edges. Include junction views if a junction is part of the chosen layout.
- Capture overhead views showing the complete curve and ground-level close-ups showing grass placement against the hardscape. Compare the same views before and after the boundary correction where possible.
- Inspect near, transition and far distances, including camera movement across field/cell boundaries. Confirm smooth coverage without visible grid steps, edge popping, leaks onto hardscape or missing patches.
- Validate at least two curve shapes or radii so the correction is not tied to one fixed scene. Add focused regression coverage for the resulting boundary behavior and run relevant existing bus-lab checks; run gameplay checks if shared runtime code changes.
- Keep the existing straight scene/reference usable and report how to access and adjust the new experimental area.
- Save screenshots and generated traces, logs and reports under `tests/artifacts/screens/grass/ai613_curved_bus_lab/`; keep them gitignored and untracked.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to `AI_DONE_grass_613_CITY_curved_grass_boundaries_in_bus_lab_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, validation results, access instructions for the curved area and paths to generated evidence.
- If performance optimization is undertaken, include a same-condition before/after table with frame time, FPS and relevant workload metrics. Identify hardware, resolution, graphics settings, workload/camera, warm-up, sample count and statistic used. Mark unavailable metrics as `not measured` with a reason.
