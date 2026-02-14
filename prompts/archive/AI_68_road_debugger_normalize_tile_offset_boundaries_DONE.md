# Problem [DONE]

In Road Debugger, a road control point is represented as `(tileX, tileY, offsetX, offsetY)` where offsets are relative to the tile center. With the current bounds/snapping, the system can produce duplicate representations for the exact same world position at tile boundaries:

- Example (Y axis): `tile (7,8) offsetY = +halfTile` is the same world point as `tile (7,9) offsetY = -halfTile`.

This causes instability and ambiguity in authoring, snapping, selection, export/import determinism, and any logic that depends on comparing points.

# Request

Update Road Debugger point authoring/editing so tile-boundary positions are represented in a single canonical way by normalizing offsets at the tile half-width boundary.

Tasks:
- Define a canonical representation rule for offsets:
  - Offsets must never be stored as `+halfTile` on any axis.
  - Any time an operation would produce `offsetX === +halfTile`, normalize it to `offsetX = -halfTile` and increment `tileX` by `+1`.
  - Any time an operation would produce `offsetY === +halfTile`, normalize it to `offsetY = -halfTile` and increment `tileY` by `+1`.
- Apply this normalization consistently across the Road Debugger:
  - During point creation (click placement).
  - During point dragging (including snapping + clamping to tile bounds).
  - During undo/redo state capture and restore.
  - During export/import (import must normalize legacy data; export must always emit canonical form).
  - During any pipeline computations that derive tile/offset from world coordinates.
- Ensure snapping and bounds remain intuitive:
  - Keep “center snap” available.
  - Keep the 10×10 per-tile snapping grid behavior, but ensure the “positive boundary” snap resolves to the adjacent tile’s negative boundary (canonical form).
- Update UI feedback so the user never sees an invalid `+halfTile` offset in any inspector/info panel (it should always display the normalized tile + offset).
- Add a small regression test (or a browser-run assertion in existing tests, if that’s the project pattern) that verifies:
  - Boundary equivalence normalizes deterministically (no duplicates).
  - `(+halfTile)` input always becomes `(-halfTile)` on the next tile.
  - The rule is applied on both axes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_68_road_debugger_normalize_tile_offset_boundaries_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added canonical tile-offset normalization (never store +halfTile), applied it across authoring/drag/snap/undo/export/import/pipeline, and added browser tests for deterministic boundary behavior.
