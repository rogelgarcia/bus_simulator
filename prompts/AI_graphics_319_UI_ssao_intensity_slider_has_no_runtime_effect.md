#Problem

The SSAO intensity control appears to have no visible runtime effect, making AO tuning unreliable from the Graphics options.

# Request

Make SSAO intensity controls reliably affect the final rendered result during live gameplay/options tuning.

Tasks:
- Confirm and fix live SSAO intensity response so changing the slider produces a visible, continuous output change.
- Ensure intensity changes apply immediately without requiring mode toggles, restarts, or scene reloads.
- Ensure save/load and presets preserve the intended SSAO intensity behavior.
- Ensure debug/status output accurately reflects whether intensity is active or unsupported at runtime.
- Add deterministic regression coverage that verifies low vs high intensity produces measurable visual difference.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_319_UI_ssao_intensity_slider_has_no_runtime_effect_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
