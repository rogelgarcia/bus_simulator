# DONE

#Problem

The Road Debugger generation pipeline does not currently generate lane/line markings as a pipeline stage. Markings are important for validating lane counts, directions, junction behavior, and overall road readability. The Road Debugger UI also needs clear controls to toggle pipeline stages so markings can be enabled/disabled during iteration.

# Request

Add lane/line markings generation to the Road Debugger pipeline as a toggleable stage, and update the UI if needed so the markings stage can be enabled/disabled (and rebuilt) interactively. Implement the markings engine in a separate module/file.

Tasks:
- Add a “Markings” stage to the Road Debugger pipeline:
  - Implement lane/line markings as a pipeline stage that can be toggled independently.
  - Put the markings generation logic in a dedicated module/file (not inline in the UI or pipeline coordinator). Keep the pipeline stage as thin wiring around a markings builder/engine.
  - Prefer deriving markings from the resolved road geometry/topology:
    - Use lane counts/directions and centerline/asphalt geometry already computed by the pipeline.
    - Ensure markings follow curves and junction transitions cleanly.
  - Junction behavior requirements:
    - For 2-connector “continuation” junctions (i.e., a simple road continuation), keep center markings continuous: draw as a single continuous mesh that follows the road silhouette through the junction (no visible seam).
    - For crossings / multi-way junctions (3-way, 4-way, etc.):
      - Edge/border lines must continue through the junction, following the road silhouette/boundary around the junction.
      - Center lane lines must stop at the junction boundary (terminate at the end of the road segment) and should not be drawn through the intersection area.
    - Crosswalks:
      - Add crosswalk markings at appropriate junction types (at minimum 3-way and 4-way crossings).
      - When a crosswalk is present, reduce/trim center markings further so the crosswalk area is clear (center lines should terminate before the crosswalk and not overlap it).
      - Ensure crosswalk placement is stable and consistent with curb/sidewalk geometry (if those stages exist), and does not z-fight with asphalt.
- Respect existing configuration defaults where possible (line width, color, dash pattern, lift above asphalt, etc.).
- Ensure markings do not z-fight with asphalt and remain stable under camera motion.
- Update Road Debugger UI (if needed):
  - Add a visible toggle to enable/disable the Markings pipeline stage.
  - Ensure enabling/disabling triggers a recompute/rebuild and updates the scene immediately.
  - Keep controls consistent with existing UI styling conventions (Material Symbols, same layout).
- Validation:
  - Verify markings render correctly on straight segments, turns, and common junction types.
  - Verify markings behave correctly when combined with other stages (asphalt, curbs, sidewalks, debug overlays).
  - Add minimal browser-run tests for any new pure helpers introduced (config normalization, dash pattern math helpers, etc.), if feasible.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_158_ROADS_add_lane_markings_to_road_debugger_pipeline_and_ui_controls_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `src/app/road_decoration/markings/RoadMarkingsBuilder.js` to generate border lines, center/divider dashes, arrows, and crosswalks from RoadEngine derived data.
- Wired the Road Debugger decoration pipeline `markings` step to rebuild markings meshes (and kept it in sync with the Viz “Markings” toggle).
- Added minimal browser tests for border loop + crosswalk mesh output.
