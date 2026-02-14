#Problem

The Inspector Room light controls are difficult to use and lack key UX features:
- The light mini viewport/gizmo does not rotate with the main camera, so dragging in the mini viewport moves the light in a direction that doesn’t match what the user sees in the main viewport. This forces “non-aligned” hand-eye movements.
- The “show light” toggle is not visually pressable/active-stateful, so it’s unclear whether the bulb/indicator is visible.
- There is no separate control to enable/disable the light’s effect vs merely showing/hiding the bulb visualization.
- The Y adjustment control is unintuitive: 0Y should be centered, light should support negative Y, and the control should offer more precision near the center while still allowing large ranges.
- There are no controls for light brightness and hue, and the bulb visualization does not reflect those settings.

# Request

Improve the Inspector Room light mini viewport and light controls so they are camera-aligned, stateful, and support precise-yet-wide-range adjustments for position and appearance (brightness/hue), with clear iconography and consistent behavior.

Tasks:
- Camera-aligned mini viewport:
  - Make the light mini viewport rotate with the main camera orientation so that drag directions match the apparent axes in the main viewport.
  - Ensure dragging in the mini viewport results in intuitive light movement that corresponds to the same perceived movement in the main viewport.
- Light toggles and UI affordance:
  - Make the “show light” (bulb visualization) toggle button visually pressable and indicate active state when enabled/disabled.
  - Add a separate toggle to enable/disable the actual light contribution (lighting effect) independently from showing the bulb.
  - Use appropriate Material Symbols Outlined icons for both toggles (consistent with project icon rules).
- Y adjustment improvements:
  - Make 0Y the midpoint of the Y widget; allow the light’s Y to go negative.
  - Change the Y slider mapping to be exponential (high precision near 0, larger steps farther away).
  - Ensure the numeric display (if present) stays accurate and stable, and clamp to sensible min/max ranges.
- Brightness and hue controls:
  - Add a slider to control light brightness/intensity with a sensible range and default.
  - Add a hue control if it makes sense for the light model used (otherwise provide a color temperature or color picker alternative).
  - Update the bulb visualization so it reflects brightness and hue (color/intensity/alpha) in a clear way.
- Keep behavior robust:
  - Ensure no console errors and no regressions in other Inspector Room controls.
  - Keep UI interactions from affecting camera controls when dragging within UI panels.
- Make the light bulb pivot point to be at the center of the bulb geometry.

Verification:
- Mini viewport rotates with camera; drag direction matches main viewport perception.
- Show/hide bulb toggle is clearly active/inactive; light effect enable/disable works independently.
- Y control has 0 centered, allows negative values, and feels precise near 0 with exponential scaling.
- Brightness and hue controls work; bulb reflects them.
- Browser tests still pass (`tests/core.test.js`), and add a minimal pure-logic test for the exponential slider mapping (0-centered, symmetric) if appropriate.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_131_TOOLS_inspector_room_light_panel_camera_aligned_gizmo_and_controls`
- Provide a summary of the changes made in the AI document (very high level, one liner)
