# DONE

## Completed Changes
- Added two new BF2 `View` debug toggles to isolate rendering suspects: `Disable suspect 1 (sun shadows)` and `Disable suspect 4 (face overlays)`, plus inline debug hint text.
- Wired `Disable suspect 1` to runtime shadow behavior in `BuildingFabrication2Scene` by toggling directional light shadow casting immediately without requiring geometry rebuild.
- Wired `Disable suspect 4` through BF2 scene-to-generator debug plumbing and gated the face override overlay/coplanar path in `BuildingFabricationGenerator`, with live rebuild on toggle change.
- Kept behavior debug-scoped and non-persistent per BF2 view-toggle conventions by resetting toggles on BF2 enter/exit defaults.
