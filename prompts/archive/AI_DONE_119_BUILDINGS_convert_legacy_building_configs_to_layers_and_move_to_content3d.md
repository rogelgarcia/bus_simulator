# DONE

#Problem

Some city building configs still use the legacy “simple” format (e.g., `floors`, `floorHeight`, `style`, `windows` only) while other configs use the newer layer-based format (`layers` with floor/roof layers and per-layer materials/windows). This inconsistency causes duplicated compatibility logic and makes it harder to evolve building rendering and tooling.

Additionally, building configs currently live under `src/app/city/buildings/`, but they are effectively content definitions and should live under `src/graphics/content3d/` alongside other content catalogs.

# Request

Convert all existing city building configs that still use the legacy format into the new layer-based format, preserving their visual appearance and behavior, and move all building config definitions into `src/graphics/content3d/` (using subfolders as needed).

Tasks:
- Identify all building configs that do not define `layers` (legacy format) and convert them to the layer-based format:
  - Build equivalent `layers` (at minimum: one floor layer + one roof layer) so the generated buildings look the same as before.
  - Preserve config identity (`id`, `name`) and the effective legacy-derived fields (`floors`, `floorHeight`, `style`, `windows`) so existing city specs and UI behavior remain consistent.
  - Ensure materials/styles map correctly (brick stays brick, stone stays stone, etc.) and window dimensions/spacing match the prior legacy values.
- Migrate building config modules out of `src/app/city/buildings/` into `src/graphics/content3d/`:
  - Organize configs under a clear subfolder (e.g., `src/graphics/content3d/buildings/configs/`) and keep exports discoverable via a single index/registry module.
  - Update all imports/call sites (e.g., city loading and any tooling) to reference the new location without introducing dependency-direction issues.
  - Keep any public API for retrieving configs (`getBuildingConfigs()`, `getBuildingConfigById()`) available to app code, either by moving it or providing a thin re-export shim.
- Update any building-config export tooling so generated configs follow the new canonical location/shape (and do not reintroduce the legacy-only format).
- Remove/reduce any now-unneeded compatibility branching that existed solely to support legacy configs, as long as behavior stays the same.

Verification:
- App loads with no console errors.
- City generation/loading still finds building configs by `configId` and produces the same building appearance for the converted configs.
- Building Fabrication / building tooling continues to work with the new config locations.
- Browser tests still pass (`tests/core.test.js`), and add a minimal test that asserts:
  - No shipped building configs are legacy-only (all have `layers`),
  - Converted configs preserve their legacy-derived `floors`, `floorHeight`, `style`, and `windows` values.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_119_BUILDINGS_convert_legacy_building_configs_to_layers_and_move_to_content3d`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Moved city building configs into `src/graphics/content3d/buildings/configs/`, converted legacy configs to layer-based format, updated export tooling and docs, and added a test to ensure all shipped configs use `layers`.
