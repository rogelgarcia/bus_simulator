#Problem (DONE)

In BF2 bay configuration, the `Repeatable` control is currently a checkbox and the texture repeat behavior is configured separately. The UI needs a clearer, more compact inline layout: `Repeatable` should be a toggle, and the texture repeat type should be selectable right next to it.

# Request

Update the BF2 bay configuration UI so `Repeatable` is a toggle and the texture repeat type combo appears inline in front of it.

Tasks:
- Repeatable control:
  - Replace the `Repeatable` checkbox with a **toggle widget**.
- Texture repeat type combo:
  - Add a combo/select control for the bay texture repeat type (e.g., `Restart on new bay`, `Continuous across repeats`, `Overflow ...`) as defined by the bay material/texture flow specification.
  - Place this combo **in front of** the `Repeatable` toggle on the same row (compact layout).
- Behavior (no change):
  - Keep the same underlying repeatability semantics and texture repeat type semantics as already specified.
  - Ensure the UI remains stable in height and does not introduce layout jumps when switching states.

## Quick verification
- In BF2 bay configuration, `Repeatable` is a toggle (not checkbox).
- The `Repeatable` toggle is on its own row, and the texture repeat type combo appears on the next row below.
- Changing either control updates the bay configuration without layout shifts.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_280_BUILDINGS_building_fabrication2_repeatable_toggle_and_texture_repeat_type_inline_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Placed `Repeatable` on its own row and moved the texture repeat type combo to a second row below it.
- UI: Replaced the Repeatable checkbox with a BF2 toggle switch widget (no behavior changes).
- CSS: Added BF2 toggle switch styles and compact row layout helpers.
