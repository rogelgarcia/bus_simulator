# DONE

## Completed Changes
- Isolated the BF2 mid-building wall bug to bay openings feeding the legacy street-floor interior-shell derivation path.
- Prevented bay-driven openings (window/door/garage) from generating legacy interior shell meshes.
- Preserved bay opening wall cut generation by keeping facade cutouts/reveals generated from resolved bay placements.
- Added a core regression test that verifies bay `window`, `door`, and `garage` openings render while producing zero `buildingFab2Role="interior"` meshes.
- Updated `specs/buildings/BUILDING_2_SPEC_engine.md` to define interior shell generation as legacy run-window-only and forbid bay-driven auto-shell generation.
- Updated `specs/buildings/BUILDING_2_SPEC_model.md` to mark interior shell derivation as legacy run-window behavior, not bay-opening behavior.
- Verified the implementation with `core` tests (`node tools/run_selected_test/run.mjs`) passing.
