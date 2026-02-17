# Terrain Debugger ↔ Terrain Engine Contract

Status: Proposed  
Scope: Defines the coupling between the Terrain Debugger tool (`src/graphics/gui/terrain_debugger/`) and the standalone Terrain Engine (`src/app/city/terrain_engine/`).

## 1. Ownership and Lifecycle

- The Terrain Debugger owns the terrain engine instance.
- The engine is created after terrain geometry/grid is built (bounds are known).
- The engine is disposed when the debugger view is destroyed.
- On terrain rebuild (layout/slope/cloud/geometry changes), the debugger MUST update engine bounds to match the rebuilt terrain grid.

## 2. Bounds Mapping

The engine `bounds` MUST be derived from the current terrain grid:

- `minX = terrainGrid.minX`
- `maxX = minX + terrainGrid.widthTiles * terrainGrid.tileSize`
- `minZ = terrainGrid.minZ`
- `maxZ = minZ + terrainGrid.depthTiles * terrainGrid.tileSize`

Bounds are authoritative for:

- sampling clamping/coverage guarantees
- mask export domain used by debug rendering

## 3. Debugger State Payload (Persistable)

The debugger UI state MUST include a `terrain.engine` payload (serializable) covering:

- `seed`
- `patch` (at least `sizeMeters`, optional `originX/originZ`, optional `layout/voronoiJitter`, optional `warpScale/warpAmplitudeMeters`)
- `biomes` (mode, default biome, weights)
- `humidity`:
  - `mode` (`source_map` for debugger flow)
  - `cloud` controls (`subtilePerTile`, `scale`, `octaves`, `gain`, `lacunarity`, `bias`, `amplitude`)
- `materialBindings`:
  - `biomes`: per-biome dry/neutral/wet PBR material ids
  - `humidity`: slot-threshold and edge-band settings (`dryMax`, `wetMin`, `blendBand`, `edgeNoiseScale`, `edgeNoiseStrength`)
- `transition` (near-camera blend zone radius/feather + boundary band width)

The bounds are not stored in UI state and are always derived from terrain geometry.

## 4. Rendering Integration (High Level)

- The debugger renders ground appearance from terrain engine outputs.
- Humidity source map data is runtime-owned by the debugger view and pushed to the engine via `setSourceMaps({ humidity })`.
- The source map is generated from cloud-noise sampling with one humidity value per subtile.
- Debug views and mask exports may be view-dependent (because transition blending depends on camera/view origin).
- Switching debug views MUST NOT mutate long-lived renderer state in a way that breaks normal rendering after returning to the standard view.
- Standard mode shading MUST resolve final PBR from biome × humidity bindings (PBR-only; no humidity tint overlay workflow).
- Transition-band diagnostics MUST represent final PBR boundaries:
  - biome-boundary blend bands
  - humidity slot edge bands

## 5. Migration Notes (Legacy Controls)

Legacy terrain controls that are debugger-only and no longer authoritative should be removed/deprecated:

- single ground material picker
- UV scale/distance scaling controls
- terrain variation layers/macros intended for one-material workflows

Replacements MUST flow through the terrain engine config and derived outputs.

Additionally deprecated for this phase:

- humidity paint/brush/fill controls in Terrain Debugger UI
- humidity tint-centric controls that do not change PBR slot assignment
