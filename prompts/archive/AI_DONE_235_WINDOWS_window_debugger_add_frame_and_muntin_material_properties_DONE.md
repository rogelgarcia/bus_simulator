#Problem (DONE)

Currently, frame and muntins only expose albedo/color controls, but we need fuller PBR control for look-dev. Without roughness/metalness/etc., frames and muntins cannot be tuned to match building styles.

# Request

Add independent PBR material property controls for frames and muntins in the Window Mesh Debugger, beyond albedo.

Tasks:
- Add frame material property controls:
  - Roughness
  - Metalness
  - Any other key properties already supported by the project’s material model (e.g., normal strength, envMapIntensity, emissive if relevant).
- Add muntin material property controls independently from the frame:
  - Same set of properties (roughness/metalness/etc.) with their own values.
- Ensure these properties update live in the debugger and render correctly under IBL/sun lighting.
- Ensure defaults preserve existing appearance (new controls should not change visuals until adjusted).

Nice to have:
- Add “inherit from frame” toggles for muntin material properties to speed up styling.

## Quick verification
- Increase frame metalness and lower roughness:
  - Frame becomes more reflective as expected.
- Change muntin roughness independently:
  - Muntins respond separately from the frame.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_235_WINDOWS_window_debugger_add_frame_and_muntin_material_properties_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added frame/muntin PBR settings (roughness, metalness, envMap intensity, normal strength) to the window mesh settings model and sanitizer.
- Wired the new settings into the window mesh material generator, keeping defaults identical to the previous look.
- Exposed the new controls in the Window Mesh Debugger UI, including a muntin “Material Inherit” toggle.
