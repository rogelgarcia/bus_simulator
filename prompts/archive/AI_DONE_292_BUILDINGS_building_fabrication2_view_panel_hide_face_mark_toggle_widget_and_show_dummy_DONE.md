#Problem (DONE)

In Building Fabrication 2, the `View` panel needs two improvements:
1) `Hide face mark in view` is currently presented as the wrong control type (it must be a **toggle widget**, not a toggle button).
2) We need a quick viewport reference object to judge scale/positioning during authoring.

# Request

Update the BF2 `View` panel:
- Render `Hide face mark in view` as a toggle widget (not a toggle button).
- Add a new `Show dummy` toggle that places a reference ball in the viewport at a consistent location relative to the building.

Tasks:
- `Hide face mark in view` control type:
  - Render as a **toggle widget** (switch-style), not a toggle button.
  - Keep existing behavior unchanged:
    - When enabled, and the mouse is in the viewport (not configuration panels), do not draw the face selection line.
    - Internal face selection state continues updating; only the rendering is suppressed under the condition above.
- `Show dummy` toggle:
  - Add a toggle widget labeled `Show dummy` in the BF2 `View` panel.
  - When enabled:
    - Spawn/place the ball mesh used in the Meshes Debug tooling as a reference object.
    - Position it at the **left-front corner of the current building** (world-space corner based on the building footprint/AABB; pick the consistent “min X / min Z” corner used by the map coordinate system).
    - Ensure it is visible but does not interfere with authoring (no collisions/selection unless already supported).
  - When disabled (or when leaving BF2), remove/hide the dummy.
- Scope / persistence:
  - These toggles apply only inside Building Fabrication 2 and should not change global defaults outside BF2.
  - Default state is off (non-persistent) unless BF2 already persists view options.

## Quick verification
- In BF2 `View` panel, `Hide face mark in view` is a switch-style toggle widget (not a toggle button) and behavior is unchanged.
- Enabling `Show dummy` displays the reference ball at the building’s left-front corner; disabling it removes the ball.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_292_BUILDINGS_building_fabrication2_view_panel_hide_face_mark_toggle_widget_and_show_dummy_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- `Hide face mark in view` is now a switch-style toggle widget.
- Added `Show dummy` switch that spawns/removes a reference ball at the building’s min X / min Z corner.
- Reset view toggles to default off on BF2 entry (non-persistent).
- Updated UI spec and added a headless Playwright regression test.
