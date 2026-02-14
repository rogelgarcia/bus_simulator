#Problem

Manual LOD distance thresholds are useful, but grass quality/performance is highly dependent on camera angle and proximity. At grazing angles, aliasing and density perception changes, and we want the system to adapt automatically for best quality/perf without constant manual tuning.

# Request

Add a “Smart LOD” system for the grass engine that automatically adapts LOD selection based on camera distance, camera angle, and other heuristics, and expose all parameters in a new **Smart LOD** tab in the Grass Debugger UI.

Tasks:
- Add a new UI tab: **Smart LOD**.
- Implement an adaptive LOD selector that considers at minimum:
  - Distance to camera
  - Camera angle relative to ground (grazing vs top-down)
  - Optional: screen-space density/coverage heuristics if feasible
- Ensure Smart LOD integrates with existing fixed LOD thresholds:
  - Allow toggling between “Manual LOD” and “Smart LOD”.
  - Provide a clear override/force mode for debugging.
- Expose tunable parameters in the Smart LOD tab:
  - Angle thresholds/curves
  - Distance curve/scales
  - Bias values to prefer higher/lower LOD under certain angles
  - Hysteresis/smoothing to avoid popping during camera movement
- Debuggability:
  - Add visualization showing which LOD is chosen and why (at least in aggregate: current bias, chosen ring distances, active LOD per tile).
  - Add a small live readout of camera angle and the resulting LOD bias.
- Performance:
  - Ensure the Smart LOD computation is lightweight (no heavy per-blade logic).
  - Ensure changes are stable and do not cause frame-to-frame thrashing.

Nice to have:
- A “record camera path” or a couple camera presets to validate Smart LOD behavior at different angles/distances.

## Quick verification
- Toggle Smart LOD on:
  - LOD adapts as camera moves closer/farther and as the camera angle changes.
  - No rapid popping/thrashing while slowly moving the camera.
- Toggle back to Manual LOD:
  - Manual thresholds apply exactly as configured.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_243_MESHES_smart_grass_lod_camera_angle_distance_adaptive_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
