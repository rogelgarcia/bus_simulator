#Problem (DONE)

There is a new/updated version of the “stone_setback_tower” building in the `downloads/` folder, but the game is still using the older integrated version. We want to upgrade/replace the in-game version with the new asset set.

# Request

Upgrade the in-game “stone_setback_tower” building to the new version from `downloads/`, keeping existing catalog IDs and references stable, and ensuring visuals/materials remain correct.

Tasks:
- Locate the new “stone_setback_tower” asset(s) in `downloads/` and the current in-game assets used for the existing building.
- Replace/upgrade the in-game assets:
  - Copy the new version into the correct in-game assets location(s) (do not reference `downloads/` at runtime).
  - Ensure the full asset set is updated together (mesh + textures + materials).
  - Keep the existing building catalog `id` stable so existing configs/maps still work.
- Validate transforms and placement:
  - Ensure scale, pivot/origin, rotation, and ground alignment are correct.
  - Ensure any collision/proxy behavior (if used) remains correct.
- Validate rendering:
  - Ensure PBR maps are wired correctly with correct color spaces (albedo sRGB; data maps linear; normal map flagged correctly).
  - Ensure any transparency/emissive windows behave correctly (no sorting issues, no missing textures).
  - Ensure there are no runtime warnings/errors about missing assets.
- Compatibility:
  - Ensure the building still spawns correctly in all relevant scenes and debug tools.
  - If the new asset uses different filenames/paths, update catalog/loader references accordingly while keeping the external ID unchanged.
- Performance sanity check:
  - Compare basic complexity (triangles/draw calls) vs the previous version and ensure it’s within expected bounds.

Nice to have:
- Keep the old version accessible under a different internal id for quick A/B inspection (only if it’s easy and does not clutter the catalog).
- Add a short note in docs/changelog for the asset upgrade.

## Quick verification
- Spawn/inspect stone_setback_tower in the city and inspector/debug scenes:
  - New model is visible, oriented correctly, and grounded properly.
  - No missing textures/material issues.
- Reload and confirm stability:
  - No intermittent asset loading issues; consistent appearance across reloads.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_226_BUILDINGS_upgrade_stone_setback_tower_from_downloads_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Updated the in-repo `stone_setback_tower` building config to match the new `downloads/` version (kept stable catalog id).
