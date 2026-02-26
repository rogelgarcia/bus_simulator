# DONE

## Completed Changes
- Removed forced panel-collapse behavior when opening the BF2 Material Configuration side panel.
- Preserved building options panel expanded/collapsed state across material picker open/select/apply flows.
- Added core UI regression coverage that simulates a material pick/apply and asserts the main options panel remains visible and state-stable.
- Verified selected materials still apply correctly in the same flow (`faceConfig.material` updates).
- Updated `specs/buildings/BUILDING_2_SPEC_ui.md` panel behavior contract to disallow automatic collapse during material-picking flows while preserving manual side-handle collapse/expand.
- Verified changes with the core test suite (`node tools/run_selected_test/run.mjs`) passing.
