# DONE - Problem

Extra road surface features that should add realism (e.g. tire markings, edge wear, fractures/cracks, patchiness) are not visible in practice. This could mean they were never implemented, are not hooked up in the active rendering path, are disabled by default, or are too subtle to notice. We also need proper tuning controls in the Options panel to dial these effects.

# Request

Verify, fix, and expose tuning for road “wear” and “lived-in” surface features so they are visible and controllable without breaking realism or performance.

Tasks:
- Inventory and verify:
  - Identify the intended road wear systems (tire marks, edge wear, fractures/cracks, dirt/patchiness) and where they are implemented (materials/shaders/decals/overlays).
  - Confirm which of these are active in gameplay/city rendering and which are currently no-ops.
- Make the features visible (but not exaggerated):
  - Ensure each feature has a clear, perceptible effect at reasonable camera distances (close + mid + far), with sensible defaults.
  - Ensure features do not cause obvious tiling, shimmer, or “camo” patterns.
  - Keep performance reasonable (avoid many extra draw calls; prefer shader overlays where appropriate).
- Add/confirm Options controls (Asphalt tab):
  - Toggles for each major feature group (edge wear, tire wear, cracks/fractures, dirt/patchiness).
  - Strength + scale controls (world-space) with good defaults.
  - If a feature only changes size and not appearance (or does nothing), either make it meaningful or remove the misleading control.
- Debugging tooling:
  - Prefer integrating with the asphalt debugger so each wear feature can be toggled in isolation and verified.
  - Add a debug visualization mode (optional) to show feature masks (edge wear mask, crack mask, tire wear mask).
- Add a regression check:
  - Create a deterministic scenario (headless or debug tool) that makes it easy to confirm the features are active (baseline screenshot + diff when toggled off).

Nice to have:
- Provide presets (Clean / Subtle / Worn) that map to a known-good set of parameters.
- Document recommended parameter ranges and common failure modes (too strong contrast, wrong noise scale, UV-space noise causing repetition).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_207_ROADS_make_road_wear_features_visible_and_tunable_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary

- Increased lived-in wear visibility and tuning range (edge dirt / cracks / patches / tire wear) and bumped defaults so they’re perceptible in gameplay.
- Cracks/patches/tire wear now affect the asphalt normal response (via MaterialVariation normal factor), not just albedo/roughness.
- Edge dirt overlay strength mapping is stronger and supports wider widths.
- Added deterministic harness scenario + Playwright regression asserting each wear feature produces a measurable pixel change when toggled.
