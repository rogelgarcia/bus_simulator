# DONE

#Problem

Road features (markings, curbs, crossings, traffic controls, etc.) need a unified “Road Decoration Pipeline” so features can be added incrementally as ordered steps. Right now there is no shared pipeline structure or Road Debugger UI controls for enabling/disabling these steps.

# Request

Create a Road Decoration Pipeline with placeholder steps (no feature implementation yet) and add a Road Debugger UI section to toggle each step on/off via icon buttons with tooltips.

Tasks:
- Add a new “Road Decoration Pipeline” structure that supports an ordered list of steps.
  - Each step must have: stable `id`, `label`, `icon` (Material Symbols Outlined), `tooltip`, and `enabled` flag.
  - The pipeline should be designed so each step can later be implemented as a function that consumes road inputs and emits decorations/geometry, but for now all steps are placeholders (no-op) and should not change existing rendering.
  - Ensure enabling/disabling a step is wired into the settings/state and triggers a rebuild/update path (even if the step currently does nothing).
- Include placeholder steps for all items described:
  - Lane/center/corner markings (center line, lane dividers, edge lines, corner/turn markings)
  - Curbs
  - Crossing markers (crosswalks, stop bars, yield triangles if applicable)
  - Stop signs
  - Traffic lights
  - Sidewalks / shoulders
  - Road props & safety (cones, barriers, bollards, guardrails, reflectors)
  - Street lighting (lamps)
  - Decals / wear (tire marks, cracks, patched asphalt, manholes/drains)
  - Parking/bus/bike markings (optional feature grouping)
  - Debug/metadata overlay step (optional; still a placeholder)
- Road Debugger UI:
  - In the Road Debugger scene UI, add a new section directly below the existing “Visualize” section named “Decoration pipeline”.
  - Render each pipeline step as an icon toggle button:
    - Button visually indicates enabled/disabled state (pressable + active state styling).
    - Button uses a Material Symbols Outlined icon matching the step.
    - Button has a tooltip describing the step.
  - Toggling a step updates the pipeline settings and refreshes the road build/visual output.
- Persistence/backwards compatibility:
  - Store pipeline step enabled/disabled state in the existing road debugger settings/state so it persists during the session (and persist across reloads if the road debugger already persists settings).
  - Default behavior should match current output (all placeholder steps effectively no-op and/or default disabled so visuals do not change).
- Guardrails:
  - Do not implement markings/curbs/sign placement logic yet; create only the scaffold (data model + UI + plumbing).
  - Ensure no console errors and no regressions in existing road debugger behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_143_ROADS_road_decoration_pipeline_structure_and_road_debugger_ui`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Added a no-op Road Decoration Pipeline scaffold (ordered steps + state) and Road Debugger icon toggles to enable/disable each step.
