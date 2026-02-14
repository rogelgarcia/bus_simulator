# DONE

#Problem

The game’s overall look currently depends mostly on lighting/exposure, which makes it harder to consistently achieve a specific “vibe” (warm afternoon glow, cool cinematic grade, etc.) across diverse assets and scenes. A LUT (Look-Up Table) color grade provides a simple, artist-friendly way to apply a cohesive final look to the 3D render.

# Request

Implement optional LUT-based color grading for the 3D scene and expose it in the in-game Options flow.

Tasks:
- Add an optional “Color Grading” setting that applies a LUT to the final 3D render (default: Off).
- Expose the setting in `OptionsState` (via `OptionsUI`) with a small set of presets (at least: Off, Warm, Cool) and an adjustable intensity/strength control.
- Persist the user’s selection across sessions (consistent with how other Options settings are saved/restored).
- Ensure the color grading affects only the 3D render output (do not tint/alter DOM-based UI/HUD).
- Keep the runtime as static browser files (no required bundling); any supporting resources (LUT files) must follow project asset rules.
- Ensure the implementation is safe to enable/disable at runtime and fails gracefully if the platform can’t support the chosen grade (fallback to Off with a clear message).
- Add a minimal regression check so enabling the option does not crash the game boot (and document how to verify the feature).

Nice to have:
- Provide a clear way to add/replace LUT presets (simple folder convention + naming).
- Add a lightweight debug readout so it’s easy to confirm which LUT/preset is active.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_178_MATERIAL_add_lut_color_grading_option_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added persisted LUT color grading settings with URL overrides (`grade`, `gradeIntensity`) and a simple preset catalog (Off/Warm/Cool).
- Integrated LUT grading into the post-processing pipeline (composer) so it affects only the 3D canvas output (HUD/UI unaffected).
- Added Options UI controls for preset + intensity and wired saving/app restart.
- Added LUT assets (`assets/public/luts/*.cube`) and headless harness/e2e smoke coverage for grading enablement.
