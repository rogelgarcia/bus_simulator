# DONE

#Problem

The Road Debugger generation pipeline does not currently generate sidewalks as a pipeline stage, even though sidewalks are part of the full road presentation in gameplay/other systems. Additionally, the Road Debugger UI needs clear controls to enable/disable pipeline stages so sidewalks can be toggled on/off during debugging and iteration.

# Request

Add sidewalk generation to the Road Debugger pipeline as a toggleable stage, and update the Road Debugger UI so the sidewalk stage can be enabled/disabled (and rebuilt) interactively.

Tasks:
- Add a “Sidewalks” stage to the Road Debugger pipeline:
  - Implement sidewalk generation as a pipeline stage that can be toggled independently.
  - Use a separate file/module for the sidewalk generation engine (do not implement the full sidewalk algorithm inline inside the UI or pipeline coordinator). Keep the pipeline stage as thin wiring around a dedicated sidewalk builder.
  - Prefer building sidewalks from the already-resolved road boundary geometry (after junctions/intersections), and/or from curb outputs if curbs exist in the pipeline:
    - If curbs are implemented, derive sidewalks from curb outer edges or curb polygons.
    - Otherwise, derive sidewalks from asphalt boundary offsets with appropriate width/lift rules.
  - Handle intersections/junctions robustly:
    - Ensure sidewalks do not self-intersect at corners.
    - Ensure continuity across adjacent segments and junction boundaries.
    - Ensure clean triangulation for intersection sidewalk polygons.
  - Use existing configuration defaults where possible (width, lift, material), and respect road surface Y offsets.
  - Put the sidewalk generation logic in a dedicated module/file (not inline in the UI or pipeline coordinator), similar to curb generation.
- Update Road Debugger UI:
  - Add a visible toggle to enable/disable the Sidewalks pipeline stage.
  - Ensure enabling/disabling triggers a recompute/rebuild and updates the scene immediately.
  - Keep controls consistent with existing UI styling conventions (Material Symbols, same layout).
- Validation:
  - Verify sidewalks render correctly on straight segments, turns, and multi-way junctions.
  - Verify sidewalks behave correctly when toggled with other stages (asphalt, curbs, debug overlays).
  - Add minimal browser-run tests for any new pure helpers introduced (offset/triangulation config normalization, etc.), if feasible.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_157_ROADS_add_sidewalks_to_road_debugger_pipeline_and_ui_controls_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a sidewalk mesh builder (`src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js`) that offsets the resolved road boundary (optionally starting from curb outer edges).
- Rendered sidewalks as a toggleable decoration pipeline stage in Road Debugger (`src/graphics/gui/road_debugger/RoadDebuggerView.js`).
- Updated decoration pipeline metadata/tooltips and added minimal browser-run tests for sidewalk mesh generation (`tests/core.test.js`).
