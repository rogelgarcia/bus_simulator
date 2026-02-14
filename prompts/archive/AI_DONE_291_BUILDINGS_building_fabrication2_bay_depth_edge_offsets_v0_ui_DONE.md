#Problem (DONE)

Building Fabrication 2 needs a v0 UI for authoring bay depth (extrude/inset). A single uniform depth slider is not enough because we also need wedge-like bays where only one edge is extruded/inset (or each edge has a different depth).

# Request

Implement a v0 BF2 bay depth UI using left/right edge controls with an in-between link icon, allowing authors to extrude/inset bays uniformly or per-edge.

Tasks:
- Bay depth controls (per bay):
  - Add a bay `Depth` section to the bay editor panel.
  - Provide two numeric/slider controls:
    - `Left edge depth`
    - `Right edge depth`
  - Depth is in meters:
    - Positive values extrude.
    - Negative values inset.
- Link control (floating between rows):
  - Add a small icon button (link/unlink) that visually sits *between* the left and right edge depth rows (floating in the gap between them).
  - When link is enabled:
    - Editing either side keeps both sides equal (uniform depth behavior).
  - When link is disabled:
    - Left and right edges can be edited independently (wedge behavior).
- Orientation definition:
  - Define `Left`/`Right` relative to the face’s `u` direction (from face start corner → face end corner) so it is consistent across faces.
- Defaults:
  - Default both edge depths to `0`.
  - Default link state to enabled (uniform) for new bays (unless you already have a different convention).
- Linked bay behavior:
  - If a bay is linked (bay master/slave), depth controls follow the same rules as other bay properties:
    - Slaves are not editable and inherit from the master.
- Specs update:
  - Update relevant building v2 specs under `specs/buildings/` to document per-bay edge depth authoring and left/right semantics.

## Quick verification
- Selecting a bay shows `Left edge depth` and `Right edge depth` controls in the bay editor.
- The floating link icon toggles linking; when linked, editing one edge updates the other.
- Left/right mapping is consistent per face (based on face `u` direction).
- Linked (slave) bays do not allow editing depth but inherit correctly.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_291_BUILDINGS_building_fabrication2_bay_depth_edge_offsets_v0_ui_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added left/right bay depth edge controls with a floating link toggle in BF2 bay editor.
- Wired depth editing into the BF2 config + rebuild pipeline, respecting linked (slave) bay inheritance.
- Extended the facade bay solver + generator to support per-edge bay depths and render facade strips against the updated silhouette.
- Updated v2 specs and added a headless e2e test for the new depth UI.
