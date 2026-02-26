# DONE

## Completed Changes
- Reworked the BF2 Material Configuration panel to use two flat sections (`Base material`, `Texture tiling`) with divider styling and removed collapsible/boxed details wrappers.
- Removed Material Variation controls from the BF2 material panel flow while preserving existing rendering behavior for unchanged config paths.
- Replaced tint picker interaction with dedicated slider controls for `Tint hue`, `Tint saturation`, `Tint value`, and `Tint intensity`, keeping roughness/normal sliders intact.
- Implemented per-material tiling state (`tilingByMaterial`) so each selected wall material keeps its own tiling values and switching materials restores the correct tiling.
- Added an optional `showTitle` flag to `createTextureTilingMiniController` to support flat-section embedding without nested section labels.
- Added BF2 core regression tests covering flat material panel layout, removal of Material Variation UI, tint slider presence, and per-material tiling isolation/restore behavior.
- Updated `specs/buildings/BUILDING_2_SPEC_ui.md` to document the new flat section contract, slider-based tint controls, and per-material tiling behavior.
