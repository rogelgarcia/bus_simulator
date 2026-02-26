# DONE

## Completed Changes
- Imported `downloads/window_fabrication_door_door_black_tall.json` into project-managed catalog data by embedding a new door catalog entry (`door_black_tall`) in `WindowFabricationCatalog`.
- Preserved existing catalog ordering/default behavior by appending the new door entry without changing default door/garage IDs.
- Kept runtime decoupled from `downloads/` by embedding the imported values directly in source-managed catalog config.
- Added unit coverage proving the imported door entry exists, carries wall-hint metadata, and resolves through case-insensitive catalog-name lookup.
- Updated `specs/windows/WINDOWS_BUILDER_TABS_AND_CONTROL_REUSE_SPEC.md` to explicitly require project-managed catalog sources and disallow runtime reads from `downloads/`.
