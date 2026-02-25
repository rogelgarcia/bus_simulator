DONE
# Problem

Window decorations in Building Fabrication 2 (sill, header, trim) are currently treated as direct component configuration instead of reusable style templates, and their behavior/export contract needs to change.

# Request

Introduce a template-driven, pluggable window-decoration system for BF2 where sill/header/trim are visualization-only, use constrained UI controls, and follow consistent width/material/shadow behavior.

Tasks:
- Make window decorations (sill, header, trim) visualization-only and ensure window export saves none of these decoration components or decoration settings.
- Add template/preset behavior where each style defines the shape and default sizes.
- Add a pluggable style mechanism: style plugins only draw decoration shape from resolved parameters; placement/alignment relative to the window is handled by a separate engine layer.
- Support material mode button group with exactly: `Match wall` (default), `Match frame`, `PBR`.
- Force cast/receive shadows always on for decoration visualization (not configurable).
- Implement sill UI as minimal controls only:
  - enabled toggle
  - type selector with `simple` as the only value for now
  - width mode: `Match window` or `15%`
  - depth option: `0.08` (default) or `0.02`
  - material mode
  - no additional inputs
- Apply the same parameter model to header, with default width mode set to `Match window`.
- Apply the same minimal UI model to trim as well (including consistent gap behavior derived by the system; no extra user inputs).
- Enforce width semantics:
  - `Match window` = 100% width
  - `15%` = 115% width (15% larger than window)
  - when `Match window` is selected, percentage expansion logic is ignored
- Set default geometry values for sill templates to:
  - height = `0.08`
  - depth = `0.08`
  - gap = `0`
  - offsets = `0`
- Set header defaults to the same baseline values, with width defaulting to `Match window`.
- Update relevant specs under `specs/windows/` and/or `specs/buildings/` to document the new decoration-template and export behavior.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_411_WINDOWS_building_fabrication2_window_decoration_templates_visualization_only_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_411_WINDOWS_building_fabrication2_window_decoration_templates_visualization_only_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary
- Added a new window-decoration template domain model with constrained style/width/material/depth enums, sanitization helpers, and deterministic width resolution semantics.
- Refactored debugger decoration state initialization/sanitization to use template defaults and wall-material-aware normalization.
- Reworked decoration UI to minimal first-pass controls for sill/header/trim and removed non-template advanced knobs.
- Updated decoration rendering to a pluggable style-plugin model with engine-owned placement/alignment and always-on cast/receive shadows.
- Enforced visualization-only export behavior by excluding decoration settings/components from debugger fabrication payloads.
- Updated window/building specs and added focused node unit tests for decoration template defaults, legacy sanitization mapping, and width-mode resolution.
