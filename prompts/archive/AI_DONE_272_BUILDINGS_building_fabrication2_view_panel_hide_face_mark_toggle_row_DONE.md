#Problem (DONE)

In Building Fabrication 2, the `Hide face mark in view` control in the `View` panel is currently presented with the wrong UI affordance and layout (checkbox + grouped rectangle), making it inconsistent with the rest of the `View` panel controls.

# Request

Adjust the BF2 `View` panel UI so `Hide face mark in view` is rendered as a toggle (not a checkbox) and is laid out consistently with the other `View` panel buttons.

Tasks:
- Control type:
  - Render `Hide face mark in view` as a **toggle** control (not a checkbox).
- Layout:
  - Do not wrap this control in a dedicated group rectangle.
  - Place it at the same visual hierarchy level as the other `View` panel controls/buttons.
  - Give it its own dedicated row in the `View` panel.
- Behavior (no change):
  - Keep the existing behavior exactly as specified previously:
    - When enabled, and the mouse is in the viewport (not in configuration panels), do not draw the face selection line.
    - Internal face selection state continues updating; only the rendering of the face mark is suppressed under the condition above.

## Quick verification
- In BF2 `View` panel, `Hide face mark in view` appears as a toggle on its own row (no group rectangle).
- Toggling it preserves the existing hide/show behavior for the face mark in the viewport.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_272_BUILDINGS_building_fabrication2_view_panel_hide_face_mark_toggle_row_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Replaced the BF2 “Hide face mark in view” checkbox row with a proper toggle button row styled consistently with the View panel controls, without changing behavior.
