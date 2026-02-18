#Problem

Grass Debugger currently requires manual LOD iteration and lacks the preset camera/lighting workflows needed for fast, repeatable tuning of low-cut grass.

# Request

Upgrade Grass Debugger to an auto-LOD-first workflow with standardized camera/lighting presets and clear diagnostic overlays.

Tasks:
- Make automatic LOD behavior the default mode in Grass Debugger.
- Keep manual LOD forcing available only as an explicit debug override.
- Add fixed camera height presets: `0.5m`, `1.0m`, `1.5m`, `2.0m`, `3.0m`, `5.0m`.
- Add multiple angle presets per height to validate grazing, medium, and top-down views.
- Add lighting presets suitable for grass evaluation (at minimum daylight, overcast, golden-hour, night street-lit).
- Display live debug overlays for active LOD, per-tier counts, and other essential grass runtime diagnostics.
- Ensure preset workflows are deterministic and repeatable between sessions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_330_TOOLS_grass_debugger_auto_lod_camera_lighting_and_overlays_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
