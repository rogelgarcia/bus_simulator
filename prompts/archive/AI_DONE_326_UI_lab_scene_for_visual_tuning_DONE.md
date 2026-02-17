# DONE

#Problem

We need a dedicated “Lab” scene for visual tuning and look development.  
The scene should be stable, repeatable, and focused on road/urban lighting evaluation, so artists can quickly assess visual quality without being distracted by gameplay state or time/weather changes.

# Request

Implement a separate Lab scene that is purpose-built for lighting and composition checks, and provide a compact set of camera presets plus parameter controls for tuning scene appearance.

Tasks:
- Create a dedicated Lab scene that includes:
  - a drivable road segment
  - a large open area around it
  - a small set of buildings (at least 3–5 blocks)
  - a curated set of props for scale and composition tests
- Implement the Lab scene as a dedicated standalone HTML page.
- Provide 4–6 camera presets tailored for visual review (e.g., overview, near-road, bus-follow, corner detail, close-material check).
- Add controls to adjust all relevant visual parameters used by the Lab scene (lighting, tone, shadows, post stack, and material/reflective behavior tuning), with clear value labels.
- Keep atmosphere settings fixed for now:
  - do not include weather controls
  - do not include time-of-day controls
- Ensure the scene starts in a consistent default configuration that is preserved when reopened.
- Add direct access from the UI/menu to open and return to the Lab scene quickly.
- Keep the scene independent from gameplay simulation logic so tuning can happen without active bus AI/path/fleet interactions.
- Document the preset and parameter set so artists can reproduce the same visual states across sessions.
- Make sure added assets are lightweight and organized consistently with existing asset and scene conventions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the AI file to `AI_DONE_326_UI_lab_scene_for_visual_tuning_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Completion Summary
- Added standalone `debug_tools/lab_scene.html` and `src/graphics/gui/lab_scene/main.js` for a dedicated Lab scene tool entrypoint.
- Implemented `LabSceneView` with deterministic city composition, curated props, and six camera presets for repeatable visual checks.
- Added persistent Lab state (`bus_sim.lab_scene.v3`) and fixed-atmosphere behavior while exposing lighting, shadows, post, and building visual tuning controls.
- Registered Lab scene quick access in `src/states/DebugToolRegistry.js` and wired quick-return behavior from the standalone page.
- Documented the workflow in `specs/graphics/lab_scene_visual_tuning.md` and added node/unit plus headless/e2e coverage for registry and load smoke checks.
- Follow-up tuning pass: added a crossing-front camera preset, explicit mouse camera navigation, road/sidewalk-grounded prop placement, larger traffic signal scale, game-aligned visual defaults, and enabled trees.
- Follow-up simplification pass: replaced full options dock with a single Layers tab (toggle-only controls, AA limited to MSAA 2x/8x, AO limited to SSAO/GTAO), removed the asphalt ball prop, and added a wider/lower right-side crossing camera preset with stop-sign visibility.
- Follow-up UX/framing pass: moved the Layers panel to the right, converted layer controls to button groups with AO `Off/SSAO/GTAO`, and moved the wide crossing camera + stop sign to the opposite street side.
- Follow-up traffic-controls pass: removed manually positioned signs/lights in LabScene and now rebuild traffic-control props from RoadEngine/asphalt-derived placements.
- Follow-up layout pass: split UI into left camera panel + right gameplay-style options panel, switched ON/OFF layer controls to toggle switches, and kept AO mode as `Off/SSAO/GTAO`.
- Follow-up cleanup pass: removed the `OriginAxes` helper from Lab Scene rendering.
