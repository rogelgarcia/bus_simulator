#Problem [DONE]

In the Inspector Room light controls UI, the Y slider has extra top spacing (margin/padding) that causes it to visually invade/overlap the brightness slider area. Also, the current hue control uses a color picker, but a simpler control scheme is preferred.

# Request

Improve the Inspector Room light controls layout and color controls:

Tasks:
- Fix the Y slider layout/spacing so it does not overlap or encroach on the brightness slider area.
  - Remove or adjust any incorrect margin/padding affecting the Y slider container.
  - Ensure the layout remains consistent across typical viewport/panel sizes.
  - Verify the brightness slider and Y slider have clear separation and no clipping.
- Remove the height indication label shown in the Y slider panel (keep the control functional, but remove the redundant label).
- Change the Y slider zero point mapping:
  - Make `Y = 0` appear at 25% from the bottom of the slider track (not centered).
  - The slider should allocate 25% of its range to negative Y (below 0) and 75% to positive Y (above 0).
  - Keep the mapping stable and intuitive (no jumps when crossing 0) and clamp to sensible min/max values.
- Replace the hue color picker with two sliders:
  - A “Color” slider that changes the light color hue (and/or a constrained color model appropriate for the current light implementation).
  - A separate “White/Black” slider that adjusts the color toward white vs black (brightness/value), without changing the hue control itself.
- Ensure both sliders are intuitive, have sensible ranges/defaults, and stay stable when toggling the light on/off or switching selection.
- Keep backwards compatibility for persisted settings:
  - If existing configs store a color value, map it into the new slider representation on load.
  - Ensure saving persists the new representation deterministically.
- Verify no regressions:
  - No console errors.
  - Light bulb visualization updates correctly based on the new color/value sliders.
  - Brightness slider behavior remains unchanged apart from the layout fix.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_136_TOOLS_inspector_room_light_controls_fix_y_slider_spacing_and_split_hue_sliders`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Fixed the Inspector Room Y slider layout and remapped its zero point, replaced the hue picker with Color + White/Black sliders, and added deterministic persistence/backwards-compatible loading for the new color representation.
