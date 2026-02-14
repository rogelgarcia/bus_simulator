# DONE

#Problem

Road Debugger currently represents control point offsets in world/metric units (meters from tile center). This makes authored road data brittle: if the tile size changes (or world scale changes), previously saved roads will no longer occupy the same relative location within tiles. It also makes snapping semantics harder to preserve consistently across different tile sizes.

# Request

Change Road Debugger control point storage to use tile-relative UV units instead of metric offsets, so authored data is stable across tile size changes.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.

Tasks:
- Update the Road Debugger schema for road control points:
  - Replace metric offsets (`offsetX`, `offsetY` in meters) with tile-relative UV offsets (e.g., `offsetU`, `offsetV`) where:
    - `offsetU` and `offsetV` are normalized to tile size.
    - Range is `[-0.5, +0.5]` (tile center = 0; tile edges = ±0.5).
  - Keep `(tileX, tileY)` as the coarse locator.
- Update all conversions:
  - World position from point: `world = tileCenter + (offsetU * tileSize, offsetV * tileSize)`.
  - Point from world: compute nearest tile + normalized offsets, then canonicalize to avoid `+0.5` (boundary duplication).
- Update snapping behavior:
  - Snap should operate in UV space (or in “ticks” derived from UV) so snapping remains consistent regardless of tile size.
  - Ensure center snap is preserved and the existing “divide tile in 10 parts” behavior maps cleanly to UV (step = 0.1 of tile).
- Canonicalization:
  - Maintain the rule that `+0.5` offsets are not stored; they normalize to the adjacent tile at `-0.5` (same world position).
  - Apply this canonicalization during creation, dragging, undo/redo, export, and import.
- Migration / backward compatibility:
  - Support importing legacy JSON that contains metric offsets by converting them to UV using the tile size stored in the file (or a passed-in tile size), then normalizing.
  - Ensure export always emits the new UV-based schema.
- Update derived geometry pipeline:
  - Ensure all road/segment computations use world coordinates derived from `(tileX, tileY, offsetU, offsetV)` and the provided `tileSize`.
- Verification checklist:
  - Export a road network, change tile size, re-import, and confirm points land in the same relative positions within tiles.
  - Snapping grid behaves identically across different tile sizes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_103_DONE_ROADS_road_debugger_store_point_offsets_in_tile_uv_units`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Migrated control points from metric offsets to tile-relative UV offsets with canonicalization (+0.5 → next tile -0.5), updated world/snap conversions, and supported legacy imports.
