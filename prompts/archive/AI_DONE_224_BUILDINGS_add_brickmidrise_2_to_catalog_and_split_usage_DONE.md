#Problem (DONE)

We have a new building asset in `downloads/` named “brickmidrise 2”, but it is not integrated into the game’s building catalog and therefore cannot be used by the city/building placement system. We also want more variety: currently “brickmidrise” appears too often as the same single variant.

# Request

Import “brickmidrise 2” from `downloads/` into the game, add it to the building catalog, and adjust building selection so that **half** of the instances that would have used the current “brickmidrise” instead use “brickmidrise 2”.

Tasks:
- Asset integration:
  - Locate “brickmidrise 2” in `downloads/`.
  - Copy the asset(s) into the game’s proper assets location(s) (do not reference `downloads/` at runtime).
  - Ensure any required textures/materials/meshes are included and load correctly in-game.
- Catalog registration:
  - Add “brickmidrise 2” as a new catalog building entry with stable identifiers (id/name) consistent with existing catalog conventions.
  - Ensure it is selectable/instantiable wherever catalog buildings are used (main city, debug/inspector scenes, etc.).
- Split usage (50/50):
  - Adjust the selection logic so that when the system would pick “brickmidrise”, it selects “brickmidrise 2” about **50%** of the time instead.
  - Ensure the distribution is deterministic/stable relative to world/building placement (no visible “flipping” between variants on reload unless the seed/config changes).
  - Avoid breaking existing maps/configs that explicitly reference the original “brickmidrise” id (they should still work).
- Quality checks:
  - Validate scale, pivot, ground alignment, and orientation match other buildings.
  - Ensure materials look correct under current lighting/post-processing (no missing textures, wrong color space, or incorrect transparency).
- Performance/safety:
  - Ensure the added building doesn’t cause large performance regressions (excessive draw calls/triangles) compared to the original.
  - Ensure there are no runtime warnings/errors from missing assets.

Nice to have:
- Add an explicit debug toggle or option to force “brickmidrise” vs “brickmidrise 2” for quick A/B comparison.
- Add a small note in docs/catalog comments describing that brickmidrise now has two variants with ~50/50 selection.

## Quick verification
- Spawn/inspect multiple midrise brick buildings:
  - Confirm both variants appear at roughly 50/50 frequency.
  - Confirm variant choice is stable across reloads with the same seed/config.
- Confirm the original “brickmidrise” id still resolves correctly when explicitly referenced.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_224_BUILDINGS_add_brickmidrise_2_to_catalog_and_split_usage_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added `brick_midrise_2` building config and registered it in the building catalog.
- Implemented deterministic 50/50 substitution when a map references `brick_midrise` (with optional URL override for A/B).
