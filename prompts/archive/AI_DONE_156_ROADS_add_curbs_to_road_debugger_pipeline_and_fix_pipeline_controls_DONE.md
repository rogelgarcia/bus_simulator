# DONE

#Problem

The Road Debugger pipeline currently focuses on asphalt/centerline-derived geometry and does not generate curbs as part of the pipeline output. Additionally, the Road Debugger UI is not correctly showing the controls to enable/disable pipeline items, making it hard to iterate on pipeline stages. Finally, “auto junction” is not enabled by default, requiring manual toggling each session.

# Request

Extend the Road Debugger road pipeline to generate curbs, fix the UI so pipeline stage controls are visible/usable, and enable auto junction by default.

Tasks:
- Add curb generation to the Road Debugger pipeline:
  - Implement curb geometry as a pipeline stage that can be toggled on/off like other stages.
  - Put the curb generation logic in a separate file/module (do not implement the full curb algorithm inline inside the UI or pipeline coordinator). Keep the pipeline stage as thin wiring around a dedicated curb builder.
  - Choose an approach appropriate for road boundaries and junction topology:
    - Prefer generating curbs by following the computed asphalt edge/boundary (after junctions/intersections are resolved), then offset/extrude to curb width/height.
    - Handle intersections/junctions so curb corners and joins are continuous and do not self-intersect.
    - Ensure curb meshes have correct normals, consistent height above/below asphalt, and stable UVs (if used).
  - Integrate with existing road rendering/materials:
    - Use the existing curb material palette/settings if available.
    - Respect road config (surfaceY, curb thickness/height/sink, sidewalk interaction if applicable).
- Fix Road Debugger UI pipeline controls:
  - Ensure the UI shows the list of pipeline items/stages and their enable/disable toggles.
  - Ensure toggling a stage triggers a recompute/rebuild and updates the view immediately.
  - Keep UX consistent with existing Road Debugger controls (Material Symbols, same styling conventions).
- Make “auto junction” enabled by default:
  - Update defaults so new sessions start with auto junction ON.
  - Ensure existing saved/debug configurations (if any) can still override this default.
- Validation:
  - Verify curb stage works on straight segments, turns, and multi-way junctions.
  - Verify enabling/disabling curb stage does not break asphalt stage outputs.
  - Add minimal browser-run tests for any new pure helpers introduced (geometry math utilities, config normalization), if feasible.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_156_ROADS_add_curbs_to_road_debugger_pipeline_and_fix_pipeline_controls_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a curb mesh builder (`src/app/road_decoration/curbs/RoadCurbBuilder.js`) and a Road Debugger curb pipeline stage toggle.
- Fixed the Road Debugger decoration pipeline UI by wiring `getDecorationPipeline()` / `toggleDecorationPipelineStep()` and using the shared default pipeline list.
- Enabled auto junction by default and persisted it in Road Debugger schema export/import.
- Added browser-run tests for curb mesh data generation (`tests/core.test.js`).
