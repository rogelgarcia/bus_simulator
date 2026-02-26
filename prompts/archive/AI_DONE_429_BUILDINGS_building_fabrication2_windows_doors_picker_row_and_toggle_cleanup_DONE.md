# DONE

## Completed Changes
- Reworked BF2 `Windows/Doors` to picker-first selection by removing the legacy main opening enable toggle row.
- Changed the main picker row to use a contextual left label (`Window`, `Door`, `Garage`) and right-side picker control.
- Added a selected-name row directly below the picker that shows selected entry name or `none` when empty.
- Added a clear/delete icon action next to selected name that resets bay opening selection back to `none`.
- Removed the old read-only `Selected` label row from BF2 opening editor.
- Updated picker behavior so it can be opened even when a bay currently has no opening selected.
- Converted main `Bottom muntins` control to explicit `On/Off` grouped buttons.
- Converted main `Shades` control to explicit `On/Off` grouped buttons while preserving existing shade-disable data behavior.
- Updated top opening enablement UI to `Enable` label with right-aligned `On/Off` grouped buttons.
- Preserved existing BF2 opening placement/size/top-opening behavior outside the requested UI workflow changes.
- Updated `specs/buildings/BUILDING_2_SPEC_ui.md` to document picker-first row, `none` state + clear action, removed legacy rows, and new on/off toggle patterns.
- Added/updated regression tests in `tests/core.test.js` to validate the new BF2 UI contract and picker availability without an existing opening.
