# DONE

#Problem

The Road Debugger pipeline currently generates road geometry but does not place traffic control props (stop signs, traffic lights) as part of the pipeline. This makes it harder to validate intersection behavior and road realism in the debugger. Gameplay already has traffic control placement logic that can serve as a reference, but the Road Debugger pipeline needs an equivalent stage with clear rules and UI toggles.

# Request

Add traffic signs/traffic lights placement to the Road Debugger road creation pipeline as a toggleable stage. Implement the placement engine in a separate module/file, and reference existing gameplay traffic control code for guidance.

Tasks:
- Implement a new Road Debugger pipeline stage: “Traffic Controls” (or similar), toggleable via the Road Debugger UI.
- Put the traffic control placement engine in a separate file/module (do not implement the full placement algorithm inline in the UI or pipeline coordinator). The pipeline stage should be thin wiring around the dedicated placement engine.
- Reuse/consult existing gameplay code for traffic controls for hints and consistency:
  - Identify existing traffic control placement and prop creation code paths and reuse them where feasible (models, materials, conventions, sizing).
  - Keep the Road Debugger stage aligned with gameplay visuals and naming (so it’s representative).
- Placement rules:
  - 4-way crossings:
    - If any connecting road has **3 lanes total or more**, place a **traffic light** (instead of stop signs for that junction).
  - T-junctions:
    - Place a **stop sign** on the road that is arriving into the T (the stem road), not on the continuing road.
  - Other junctions:
    - Place a **stop sign on every corner**.
- Traffic light placement details:
  - Place the traffic light **after the crossing**, on the **right side**, on the **sidewalk**.
  - Adjust the arm so the light aligns with the **center of the direction** it controls.
  - Perspective: if I approach a crossing, “my” traffic light is on the corner **after** the crossing, on the **right**.
- Integrations/constraints:
  - Use curb/sidewalk stage outputs if available for reliable “right side” placement and sidewalk offset.
  - Ensure placement is stable and deterministic with respect to road topology and does not flicker as the camera moves.
  - Ensure props are grouped and removable when the stage is disabled (clean add/remove on rebuild).
- UI:
  - Add stage toggle(s) to enable/disable traffic controls generation.
  - If needed, expose a small set of debug options (e.g., force stop signs, force traffic lights, show placement gizmos) to validate rules quickly.
- Validation:
  - Verify all junction types (straight continuation, T, 4-way, and other multi-branch) place the correct props per rules.
  - Verify no props are placed floating inside asphalt; lights should sit on sidewalk/right-side positions.
  - Add minimal browser-run tests for any new pure helper utilities (junction classification, lane total checks, stable placement direction selection), if feasible.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_159_ROADS_add_traffic_signs_and_lights_to_road_debugger_pipeline_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `src/app/road_decoration/traffic_controls/RoadTrafficControlPlacement.js` to classify junctions and compute deterministic stop sign / traffic light placements.
- Wired Road Debugger decoration pipeline steps `stop_signs` and `traffic_lights` to render props using existing traffic control visuals.
- Ensured Road Debugger overlay rebuild disposes non-owned materials to prevent GPU leaks; added minimal placement-rule tests.
