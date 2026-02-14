#Problem (DONE)

In gameplay/city scenes, sun shadows can look noticeably worse than Blender (including Eevee): shadow edges appear “stepped”/aliased and there can be visible light leaking into areas that should be fully shadowed (e.g., under building overhangs). This varies by mesh topology and scale, but Blender’s results remain crisp and stable, so the current Three.js shadow settings are likely too low-quality and/or not tuned for the scene scale.

These issues are typical of shadow-map rendering:
- “Stepped” edges are usually caused by insufficient effective shadow-map resolution (map size too low for the covered area) and/or wide shadow-camera bounds.
- “Light leaks” are commonly caused by depth precision + bias settings, overly large shadow near/far ranges, and/or thin single-sided geometry that doesn’t cast from the light’s POV.
- In some areas of the map, the bus can appear to receive little-to-no sun shadowing at all (as if it’s outside the shadow coverage), which suggests shadow coverage/cascades/frustum bounds may not be appropriate for the full gameplay area.

We need an end-user configurable way to improve shadow quality (and reduce leaks) without hardcoding a single global choice.

# Request

Implement configurable shadow quality controls in the Options UI under the **Graphics** tab, so users can improve shadow sharpness and reduce shadow leaks in the main gameplay city scene.

Tasks:
- Graphics options UI:
  - Add a new “Shadows” section under the Graphics tab.
  - Expose a user-facing “Shadow Quality” control that is easy to understand (e.g., presets like Off/Low/Medium/High/Ultra).
  - Persist the selection like other graphics options (survives reload).
- Runtime behavior:
  - Apply the chosen shadow quality at runtime without requiring a full page refresh (or clearly indicate if a restart is required).
  - Ensure the quality choice affects the main gameplay “sun” shadows (city directional light) and any other global shadow settings that are appropriate.
- Quality improvements (outcomes, not implementation):
  - Higher quality settings should produce noticeably sharper, less “stepped” shadow edges on building features like overhangs.
  - Higher quality settings should reduce or eliminate “light leak” artifacts where surfaces should be fully shadowed.
  - Lower quality settings should prioritize performance while remaining visually acceptable.
- Practical constraints:
  - Avoid settings that cause major performance regressions by default; keep current behavior as the default preset unless an alternative is clearly better.
  - Keep the controls safe: prevent extreme values that can break rendering on low-end GPUs.

## Possible solutions to consider (choose what fits best)
- Shadow-map resolution and filtering:
  - Increase per-light shadow-map resolution for higher presets.
  - Use a crisper shadow filtering mode for sharper edges (with an option/preset tradeoff).
- Shadow camera tightness / depth precision:
  - Reduce shadow camera near/far range where possible to improve depth precision.
  - Tighten directional-light shadow bounds to the visible gameplay area when feasible.
- Bias tuning:
  - Provide better defaults per preset for shadow bias and normalBias to reduce acne/peter-panning and leaks.
- Thin geometry casting:
  - Where appropriate, ensure thin overhang-like geometry can cast shadows as expected (e.g., two-sided shadow casting) without changing the general material look.

## Quick verification
- Options → Graphics shows a “Shadows” section with a “Shadow Quality” control.
- Switching presets changes shadow edge sharpness and aliasing in the city scene (obvious under building overhangs).
- Switching presets can reduce shadow leaks in previously problematic areas.
- The setting persists after reload.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_294_UI_graphics_options_shadow_quality_and_leak_fix_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `Shadow Quality` presets (Off/Low/Medium/High/Ultra) under Options → Graphics → Shadows, with preset export/import support.
- Applied shadow quality live at runtime (no refresh) by updating renderer shadow settings and the city sun’s shadow map size/bias.
- Fixed city sun shadow coverage by sizing the directional shadow camera bounds based on the gameplay city size, reducing “no shadows outside coverage” cases.
