#Problem (DONE)

In Building Fabrication 2, the telemetry display (specifically the `tris` count) is not updating when meshes are regenerated/updated in the viewport. This makes it hard to evaluate performance impact while authoring buildings.

# Request

Fix BF2 telemetry so the `tris` number updates correctly whenever BF2 updates/regenerates meshes shown in the viewport.

Tasks:
- Telemetry correctness:
  - Ensure the displayed `tris` count reflects the current set of rendered meshes in the BF2 viewport.
  - When the building geometry changes (e.g., floor layers/faces/bays/windows/material changes that rebuild meshes), the telemetry must refresh.
- Update timing:
  - Update telemetry immediately after mesh rebuilds are applied (avoid stale values).
  - Avoid excessive recomputation every frame; update only when geometry/renderables actually change.
- Scope:
  - Apply this fix to Building Fabrication 2 viewport updates.
  - Do not break telemetry behavior in other scenes/tools.

## Quick verification
- Enter BF2 and create/edit a building such that meshes update in the viewport.
- Confirm the telemetry `tris` count changes correspondingly after each mesh update.
- Switching away from BF2 does not regress telemetry in other scenes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_276_BUILDINGS_building_fabrication2_telemetry_tris_not_updating_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a forced-refresh hook to PerfBar so BF2 can request an immediate telemetry update after rebuilds.
- Changed BF2 rebuild scheduling to apply rebuilds during the normal update cycle (pre-render) and trigger telemetry refresh when applied.
- Added a Playwright regression test to confirm `tris` changes after BF2 rebuilds.
