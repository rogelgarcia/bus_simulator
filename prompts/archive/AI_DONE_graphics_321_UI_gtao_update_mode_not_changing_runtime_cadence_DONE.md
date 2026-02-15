# DONE

# Problem

Changing GTAO update frequency does not appear to affect runtime behavior; GTAO seems to update every frame, and UI/debug readouts are inconsistent with selected update mode.

# Request

Make GTAO update mode controls reliably affect actual GTAO recompute cadence and ensure runtime debug/status clearly reflects true behavior.

Tasks:
- Ensure each GTAO update mode produces the intended update cadence during runtime.
- Ensure the selected mode is applied immediately and persists correctly through options save/load.
- Ensure debug/status text reflects real update decisions (updated vs cached, reason, support/fallback state).
- Ensure fallback behavior is explicit and visible when a selected mode cannot be honored.
- Add deterministic coverage for fixed-rate cadence and camera-motion-triggered update behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_321_UI_gtao_update_mode_not_changing_runtime_cadence_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).

## Completion summary
- Added GTAO cache-texture support resolution so cadence modes can reuse internal GTAO pass textures even when `gtaoMap` is unavailable in this runtime.
- Updated post-processing GTAO frame scheduling/finalization to use resolved cache texture support and preserve selected update cadence where supported.
- Improved GTAO debug status visibility with explicit cache mode labels and added deterministic unit coverage for cache support resolution.
