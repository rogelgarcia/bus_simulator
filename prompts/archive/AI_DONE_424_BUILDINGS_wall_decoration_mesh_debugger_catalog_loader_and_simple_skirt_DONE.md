# DONE

## Completed Changes
- Added a new wall-decorator domain module under `src/app/buildings/wall_decorators/` with catalog APIs, debugger-state sanitization, catalog-entry loading, and procedural shape-spec generation.
- Seeded the catalog with `Simple Skirt` as a procedural generator that creates a bottom-aligned block and applies a 5 cm footprint oversize against the target wall dimensions.
- Implemented placement and application controls in the model (`Where to apply`: entire facade/half, `Mode`: face/corner, `Position`: top/near top/near bottom/bottom).
- Built a standalone Wall Decoration Mesh Debugger screen (`debug_tools/wall_decoration_mesh_debug.html`) with a fixed `10m × 3.5m` wall scenario and adjacent corner wall for continuity validation.
- Added debugger UI tabs (`Catalog`, `Placement`, `Position`, `Materials`) with direct material properties (no popup picker), including BF2-equivalent tint/roughness/normal and texture tiling/UV controls.
- Added a catalog loader bridge and runtime view pipeline to resolve selected decorator entries, generate decorator meshes, and apply the selected material/tiling settings to rendered shapes.
- Registered the new debug tool in `src/states/DebugToolRegistry.js` and added options-panel styling for the new tab-pane layout.
- Added regression coverage with node unit tests for catalog/placement generation and debug-tool registration, plus a core UI contract test for required tabs/controls.
- Added `specs/buildings/WALL_DECORATION_MESH_DEBUGGER_SPEC.md` documenting catalog/loader contracts, scene constraints, placement modes, position semantics, material controls, and `Simple Skirt` behavior.
