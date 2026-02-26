# DONE

## Completed Changes
- Switched Window Debugger text-row inputs from numeric class usage to a dedicated text-input class so catalog name no longer inherits numeric-field behavior.
- Added `.options-text-input` styling with left text alignment and flexible full-width sizing for readable/editable catalog names.
- Kept `Catalog Name` growth behavior (`options-input-grow`) so the field uses available row width and stays aligned with adjacent controls.
- Preserved catalog-name model behavior (normalization, per-asset persistence, and update emission paths unchanged).
- Updated `specs/windows/WINDOWS_BUILDER_TABS_AND_CONTROL_REUSE_SPEC.md` to require text-input styling and expanded width for the asset `Catalog Name` control.
- Added a core regression test validating `Catalog Name` uses text-input class, does not use numeric class, and keeps grow layout class.
