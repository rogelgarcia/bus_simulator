# DONE

## Completed Changes
- Fixed bay opening wall cutouts to use resolved per-slot opening points instead of stale/default coordinates.
- Unified wall cut placement and rendered opening placement so windows/doors cut where meshes are rendered.
- Applied bottom/main `Full Height` placement logic only to the main/bottom opening.
- Updated bottom/main `Full Height` computation to reserve enabled top-opening gap/height constraints.
- Added wall cut generation for stacked top openings when enabled.
- Raised opening repeat max from `2` to `5` across UI/view/solver/generator normalization.
- Renamed the bay opening section from `Opening` to `Windows/Doors`.
- Removed editable opening type select and replaced it with a read-only `Selected` row (`type · catalog item`).
- Made opening labels context-aware for Window/Door/Garage instead of generic opening wording.
- Replaced main width/height/offset/repeat numeric controls with slider + number rows.
- Replaced main height mode combo with grouped buttons (`Fixed`, `Full Height`) beside height controls.
- Added top frame width override row with `[On/Inherit] + value` behavior.
- Enforced two-decimal precision behavior for top frame width override values.
- Kept top opening behavior fixed to window context and reflected that in UI + normalized data.
- Preserved per-window muntin toggles for bottom/top openings.
- Added BF2 UI core coverage for section naming, read-only selection row, repeat slider max, grouped height mode, and top-frame override controls.
- Added BF2 generator core coverage for full-height bottom openings reserving top-opening space.
- Updated `specs/buildings/BUILDING_2_SPEC_ui.md` with new Windows/Doors UI contracts.
- Updated `specs/buildings/BUILDING_2_SPEC_engine.md` with full-height/top constraints, repeat range, and wall-cut consistency rules.
