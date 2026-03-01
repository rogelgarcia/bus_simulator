# DONE

# Problem

In Building Fabrication 2, selecting the window `Black 6 panels tall` applies an incorrect wall cut value (`1`) when it should be `0`. The catalog configuration appears correct, so the issue is likely in BF2 implementation/wiring. Also, selecting a new window in BF2 does not fully reset window-related parameters to expected defaults/config values.

# Request

Fix BF2 window loading behavior so wall-cut values follow catalog/window configuration correctly, and ensure selecting a new window resets opening parameters deterministically.

Tasks:
- Investigate both catalog configuration and BF2 implementation for wall-cut resolution when selecting `Black 6 panels tall`.
- Validate catalog data and identify implementation-side mismatch causing wall-cut `1` instead of `0`.
- Fix BF2 so selected window wall-cut uses the correct resolved value (`0` for `Black 6 panels tall`) according to configuration precedence.
- On selecting/loading a new window in BF2, reset all opening/window parameters to:
  - BF2 defaults, then
  - apply selected window configuration overrides (window configuration takes precedence over defaults).
- Ensure this reset-and-override flow is stable across repeated window changes and does not leak previous window state.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_449_BUILDINGS_bf2_window_wallcut_override_and_window_selection_state_reset_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_449_BUILDINGS_bf2_window_wallcut_override_and_window_selection_state_reset_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Validated that `window_black_6_panels_tall` catalog wall-cut values are `cutWidthLerp: 0` and `cutHeightLerp: 0`, and identified BF2 generator hardcoding `{ cutX: 1, cutY: 1 }` as the mismatch.
- Updated BF2 generator window-definition resolution to carry `wall` cut config and use resolved per-placement wall-cut values for facade cutouts and garage facade meshes.
- Added BF2 view-side normalization for window definition wall-cut data (`wall`) and propagated it through catalog/legacy definition parsing.
- Implemented deterministic opening reset on window selection by rebuilding bay opening config from BF2 defaults plus selected definition overrides (size, muntins, visual defaults, garage facade, wall cut).
- Updated asset-type switching flow to reuse the same deterministic reset path instead of partially mutating previous opening state.
- Added core regression tests covering definition-reset behavior, repeated window swaps without state leakage, and wall-cut values following selected definition defaults.
