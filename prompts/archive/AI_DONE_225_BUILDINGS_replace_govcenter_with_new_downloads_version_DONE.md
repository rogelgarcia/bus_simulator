#Problem (DONE)

There is a new/updated version of the “govcenter” building available in the `downloads/` folder, but the game is still using the older integrated version. We want to replace the existing govcenter building asset in the game with the new version.

# Request

Replace the current in-game “govcenter” building with the new version from `downloads/`, ensuring existing references/configs keep working and visuals/materials remain correct.

Tasks:
- Locate the new govcenter asset in `downloads/` and the current in-game govcenter asset(s).
- Replace the in-game govcenter assets:
  - Copy the new version into the proper in-game assets location(s) (do not reference `downloads/` at runtime).
  - Ensure textures/materials/meshes are updated together (full set).
  - Keep the existing govcenter catalog `id` stable so anything referencing it continues to work.
- Validate transforms and placement:
  - Ensure scale, pivot/origin, rotation, and ground alignment match expectations (no floating/sinking, correct orientation).
  - Ensure collision/proxy behavior (if any) remains correct.
- Validate rendering:
  - Ensure PBR maps (albedo/normal/roughness/metalness/AO as applicable) are wired correctly with correct color spaces.
  - Ensure transparency and emissive behavior (if present) render correctly.
  - Ensure no missing texture warnings or console errors.
- Compatibility:
  - Ensure city/building placement systems still spawn govcenter correctly in all relevant scenes.
  - If the new asset introduces renamed files/paths, update loaders/catalog entries accordingly while keeping the external ID stable.
- Performance:
  - Compare basic perf characteristics vs old version (triangles/draw calls) and ensure the new version isn’t accidentally extreme.

Nice to have:
- Keep the old govcenter version available under a different internal name/id for quick A/B comparison (only if it’s easy and doesn’t clutter the catalog).
- Add a short note in docs/changelog about the replacement.

## Quick verification
- Spawn/inspect govcenter in the main city and inspector/debug scenes:
  - New model is visible and correct.
  - No missing assets/errors.
  - Scale/orientation/ground alignment correct.
- Reload and confirm stability:
  - No “flipping” or intermittent missing textures.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_225_BUILDINGS_replace_govcenter_with_new_downloads_version_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Replaced the in-repo `gov_center` building config with the updated version from `downloads/` (kept the same stable catalog id).
