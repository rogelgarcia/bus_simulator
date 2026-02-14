# DONE

#Problem

Building windows are currently rendered as flat textures on top of the wall, which looks artificial. A full geometric recess/frame system is desirable long-term, but a fast improvement is to fake depth via parallax + supporting shading cues (normal/AO influence) that work with the existing window texturing workflow.

# Request

Add an optional “fake depth” mode for windows in building fabrication using parallax/normal/AO-style shading, with a simple enable toggle and a strength control.

Tasks:
- Add a new option in the window configuration UI (building fabrication) to enable/disable “Fake depth” (parallax) for windows.
- Add a “Strength” control for the effect with a sensible default and safe min/max range.
- Add an optional “Inset/Recess (fake)” control (no mesh/geometry changes):
  - This must be a purely shader/material/texture-space effect; do not modify window or wall meshes.
  - The goal is to make the window read as inserted into the wall (avoid a floating/sticker look) by adding a convincing contact/reveal cue around the window perimeter.
  - Expose an `insetStrength` (or similar) with a sensible default; keep it subtle by default.
- When enabled, render windows with a depth illusion:
  - Apply a parallax-style offset (or equivalent UV/view-dependent offset) so the window interior appears recessed.
  - Enhance the illusion with normal influence and AO/darkening toward edges/corners as appropriate.
  - Keep the effect stable and not overly noisy; it should look good across common camera angles and distances.
- Ensure the effect integrates with existing window parameters (frame width/color, glass colors/gradient, spacing, etc.) without breaking current appearances when disabled.
- Maintain backwards compatibility:
  - Existing building configs without the new settings render exactly as before.
  - Persist the new settings in exported building configs.
- Performance and quality constraints:
  - Avoid heavy runtime allocations; keep the shader/material changes lightweight.
  - Provide a fallback path for devices/browsers where advanced shader features may not be available (at minimum: disable the effect gracefully).
- Verification:
  - Toggle works and persists.
  - Default strength looks subtle but noticeable.
  - No console errors or visual regressions when disabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_140_BUILDINGS_building_fabrication_windows_add_parallax_depth_fake`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Added an optional window fake-depth (parallax) mode with strength and inset controls, wired through schema/UI and applied via a lightweight shader patch.
