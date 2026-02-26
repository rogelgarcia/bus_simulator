# DONE

## Completed Changes
- Added a floor-layer `Interior` ON/Off toggle in BF2 layout directly after `Floor height`.
- Wired BF2 UI-to-view callbacks so interior toggle changes are persisted in `layer.interior.enabled` and rebuild the model.
- Added default `interior: { enabled: false }` on new BF2 floor-layer creation paths.
- Extended floor-layer schema normalization to support `interior` state and deep-clone it safely.
- Implemented interior mesh generation per floor segment (interior walls, floor, and ceiling) when `interior.enabled` is true.
- Switched interior material to `pbr.painted_plaster_wall` (Painted Plaster Wall) for all interior mesh parts.
- Forced interior UV tiling to fixed `1m x 1m` by applying a material UV scale override.
- Added/updated regression tests for BF2 interior toggle UI behavior, BF2 view state mutation, schema defaults/cloning, and generator interior material/tiling behavior.
