# DONE

# Problem

Window entries should not carry interior parallax data per-window in normal window catalog usage. BF2 needs consistent parallax defaults when parallax is enabled, and existing catalog windows need updated shade color.

# Request

Standardize parallax behavior and defaults across window catalog/BF2, with explicit fallback precedence.

Tasks:
- Ensure windows do not carry per-window interior parallax payload by default.
- Define parallax defaults as:
  - `depthMeters = 15`
  - `interiorZoom = 3`
  - `xScale = 4`
  - `yScale = 4`
  - `hueShiftMin = 0`
  - `hueShiftMax = 0`
  - `saturationMin = 0.8`
  - `saturationMax = 0.9`
  - `brightnessMulMin = 0.8`
  - `brightnessMulMax = 0.9`
- Set shade color to `#565851` for current catalog windows.
- In BF2, when parallax is enabled, apply the above parallax defaults.
- If parallax defaults are intended to be sourced from parallax catalog metadata, update that source and use it as the authoritative default instead of duplicating conflicting values.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_450_WINDOWS_window_parallax_defaults_shade_color_and_bf2_enable_fallback_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_450_WINDOWS_window_parallax_defaults_shade_color_and_bf2_enable_fallback_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Updated parallax interior preset metadata to the new authoritative defaults (`uvZoom=3`, `depth=15`, `scale=4x4`, and tint ranges `hue 0..0`, `sat 0.8..0.9`, `brightness 0.8..0.9`).
- Made `WindowMeshSettings` default interior values derive from preset metadata to avoid duplicated conflicting defaults.
- Updated `sanitizeWindowMeshSettings` so enabled interiors without explicit preset fall back to default preset, and preset values drive scale/tint/depth/zoom precedence.
- Updated window catalog entries to remove per-window interior parallax payload and keep only `interior.enabled` for window entries.
- Set catalog window shade color to `#565851` for current window entries and normalized retrieval to enforce that value.
- Added/updated unit and core regression assertions validating preset defaults, catalog normalization, and BF2 parallax-enabled fallback behavior.
