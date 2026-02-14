DONE

#Problem

Trees are currently using a lower-quality/non-desktop version, which makes foliage look worse than intended when running on desktop. We want the desktop tree assets/rendering path to be used so trees match the expected quality level.

# Request

Update the tree asset/rendering pipeline to use the **desktop** version of trees (models/materials/LODs) in the main game and relevant debug scenes, while keeping a safe performance fallback path when needed.

Tasks:
- Identify where tree variants are selected (asset loading, generator, quality settings, device detection, or build flags).
- Switch tree usage to the desktop version:
  - Ensure the main city scene uses the desktop tree meshes/materials by default.
  - Ensure debugger-specific scenes/tools that render trees also use the desktop version (or clearly opt out).
- Keep performance and compatibility sane:
  - If the desktop version is too heavy for some machines, provide an explicit fallback (e.g., “Auto/Low/Desktop” quality mode) rather than silently forcing a heavy path everywhere.
  - Avoid regressions to instancing/batching; keep draw calls and memory usage reasonable.
- Ensure visuals are correct:
  - Correct materials (albedo/normal/roughness if used), correct color space, correct transparency/alpha handling, and correct shadow behavior.
  - Ensure tree scale/orientation and placement remain correct.
  - Ensure wind/animation behavior (if any) remains consistent.
- Persistence/config:
  - If a quality mode is introduced, make sure it persists via Options/presets (if applicable) and has sensible defaults (desktop default on desktop).

Nice to have:
- Add a quick A/B toggle in a debug tool to compare desktop vs low tree versions and see performance impact.
- Add a small note in docs/options UI describing what “Desktop trees” changes.

## Quick verification
- Load the main city scene and confirm trees render with the desktop look (compare against the known desktop assets).
- Check at least one debug tool scene that includes trees (if any) for consistency.
- Sanity check perf/memory (no obvious spikes or crashes) and no missing textures/material warnings.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_216_MESHES_use_desktop_tree_assets_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Switched tree generation default from `mobile` to `auto` and made `auto` resolve to desktop on capable devices, with heuristics and explicit overrides.
- Added a persisted override via `localStorage` and a `?treeQuality=auto|desktop|mobile` URL param for explicit fallback control.
- Added a core test that validates tree quality resolution without needing to load heavy tree assets.
