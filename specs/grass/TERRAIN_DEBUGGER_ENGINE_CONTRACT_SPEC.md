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
- `transition`:
  - near-camera blend zone (`cameraBlendRadiusMeters`, `cameraBlendFeatherMeters`, `boundaryBandMeters`)
  - pair-profile defaults (`profileDefaults`)
  - explicit per-pair profiles (`pairProfiles`, keyed by canonical biome pair id)
- `terrain.biomeTransition`:
  - `biome1`, `biome2`
  - `debugMode` (`pair_isolation`, `transition_result`, `transition_weight`, `transition_falloff`, `transition_noise`, `pair_compare`)
  - `compareEnabled`
  - `baselineProfiles` (captured baseline profile by pair key)
  - preset `catalog` entries (id/name/biome pair/profile)
- `terrain.biomeTiling`:
  - `materialId` (single PBR applied across the full map for tiling validation)
  - `distanceTiling` (`enabled`, `nearScale`, `farScale`, `blendStartMeters`, `blendEndMeters`, optional `blendCurve`, `debugView`)
  - `variation` (`antiTilingEnabled`, `antiTilingStrength`, `antiTilingCellMeters`, `macroVariationEnabled`, `macroVariationStrength`, `macroVariationScale`)
  - `displacement` (`enabled`, `strength`, `bias`, `source`, `debugView`)
  - `geometryDensity`:
    - adaptive enable (`enabled`)
    - mode (`uniform` or `adaptive_rings`; debugger defaults to adaptive)
    - uniform density (`segmentsPerTile`)
    - adaptive densities (`nearSegmentsPerTile`, `farSegmentsPerTile`)
    - adaptive coverage (`nearRadiusMeters`, `transitionWidthMeters`, optional `renderDistanceMeters`)
    - adaptive transition shaping (`transitionSmoothing`, `transitionBias`)
    - adaptive transition debug ring density (`transitionDebugBands`)
    - adaptive wave shaping (`waveStrength`) with bounded limits (`waveMaxHeightMeters`, `waveMaxNeighborDeltaMeters`)
    - adaptive ring debug + center capture (`ringOverlayEnabled`, `centerOnApplyCamera`, optional `centerX/centerZ`)
    - optional auto rebuild cadence (`rebuildCadence`: `off` | `frame` | `frame_2` | `frame_4` | `frame_8` | `1s`, default `off`)
    - explicit apply trigger (`applyNonce`)

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

### 4.1 Biome Transition View Mode

When the active debugger tab is `Biome Transition`, the view MUST switch to a deterministic pair-authoring mode:

- Terrain layout is fixed to a deterministic `3 x 3` tile setup.
- Left side is authored as `Biome 1`, right side as `Biome 2`, with center area used for transition evaluation.
- Non-transition terrain concerns are suppressed for clarity (roads/cloud/slope effects disabled in this mode).
- Runtime terrain-engine config is adapted for repeatability in this view:
  - grid patching with deterministic origin tied to current terrain bounds
  - biome mode forced to `source_map` using a generated pair source map
  - humidity mode remains deterministic `source_map`
  - transition blend radius is expanded so the whole test area stays in transition-authoring context
- Tooling visuals for roads/grass groups are hidden in this mode to keep attention on terrain transition output.

### 4.2 Biome Transition Diagnostics + Compare

- Diagnostic modes are driven by `terrain.biomeTransition.debugMode`.
- `pair_compare` mode MUST support side-by-side baseline (left) vs tuned (right) output for the active pair.
- Baseline rendering MUST be generated from the same base engine config with only the active pair profile overridden.
- Debug visualizations SHOULD be sourced from `exportPackedMaskRgba8(...).transitionDebug` channels when relevant:
  - transition weight
  - falloff contribution
  - noise contribution
  - final transition result

### 4.3 Biome Tiling View Mode

When the active debugger tab is `Biome Tiling`, the view MUST switch to a deterministic single-texture validation mode:

- Terrain layout is fixed to a deterministic `15 x 40` tile setup.
- The tab provides two focus actions: overview framing and eye-height framing at `1.8m`.
- Non-tiling terrain concerns are suppressed for clarity (roads/cloud/slope effects disabled in this mode).
- A single selected PBR material is applied across all biome × humidity slots so the full map is uniform.
- Runtime terrain-engine config is adapted for repeatability in this view:
  - grid patching with deterministic origin tied to current terrain bounds
  - biome mode forced to `source_map` with a constant-biome source map for the full area
- Texture-size-by-distance controls MUST support near/far scale with blend start/end and a default linear-like curve.
- Distance diagnostics MUST support at least `blended`, `near-only`, and `far-only` inspection views.
- Variation controls MUST support anti-tiling and macro variation tuning for repetition checks.
- Displacement validation controls MUST support:
  - enable/disable
  - strength and bias tuning
  - source selection (`auto`, `displacement`, `ao`, `orm`) with explicit fallback visibility
  - inspection view modes (`standard`, `wireframe`, `displacement`-focused)
- Adaptive terrain LOD controls MUST stay compact and practical, with at minimum:
  - enable/disable adaptive terrain LOD
  - wireframe toggle
  - render distance
  - wave strength
  - wave maximum map height cap (`waveMaxHeightMeters`)
  - wave maximum local tile height range (`waveMaxTileRangeMeters`) for limiting highest-vs-lowest within one tile
  - compact LOD coverage/debug overlay toggle
  - optional per-tile LOD label debug toggle (`tileLodDebugEnabled`) that marks each base tile with resolved LOD detail (`segments/tile`)
  - auto rebuild cadence selection (`rebuildCadence`) with explicit no-auto-updates default (`off`)
  - explicit apply/rebuild action (`applyNonce`)
- Advanced adaptive parameters (near/far segment internals, transition shaping internals) MAY exist in state but SHOULD be smart-default-driven and not primary controls in the panel.
- Adaptive terrain mesh generation MUST be explicit (manual rebuild or configured cadence), with no implicit full-map mesh generation from unrelated toggle changes.
- Adaptive terrain mesh coverage in Biome Tiling MUST target the full finite terrain bounds (map border to map border), not camera viewport clipping.
- Adaptive auto-rebuild cadence MUST avoid shape drift when camera position is unchanged; unchanged geometry keys SHOULD skip rebuild and reuse existing mesh/material resources.
- Adaptive runtime MUST proactively enforce geometry safety budgets (max triangles/quads) before heavy builds, including near-ring-specific clamping, to avoid GPU overload.
- Adaptive ring visualization MUST provide clear near/transition boundary feedback in the Biome Tiling view.
- Adaptive geometry output MUST remain crack-free/continuous across near/far transition boundaries (no visible hard seams while moving camera).
- Wave shaping safety MUST enforce bounded behavior:
  - default absolute height cap `2.0m`, optional up to hard cap `10.0m`
  - default neighboring-step cap `0.5m`, optional up to hard cap `2.0m`
- Biome tiling diagnostics MUST report:
  - adaptive terrain geometry complexity (verts/tris/coverage)
  - last update cost (geometry rebuild + displacement update)
  - adaptive runtime diagnostics (visible chunk estimate, LOD/ring distribution, cadence, wave bounds)
  - active camera LOD state + transition blend and short rolling history (near/transition/far occupancy, boundary crossings, pop-candidate rate)
- URL deep-linking SHOULD persist biome-tiling authoring context (`tab`, selected PBR, and camera pose) so browser hard-refresh restores the same tiling setup.
- Tooling visuals for roads/grass groups are hidden in this mode to keep attention on terrain texture behavior.

## 5. Migration Notes (Legacy Controls)

Legacy terrain controls that are debugger-only and no longer authoritative should be removed/deprecated from the general Terrain tab:

- single ground material picker (moved to `Biome Tiling` validation workflow)
- UV scale/distance scaling controls (moved to `Biome Tiling` validation workflow)
- terrain variation layers/macros intended for one-material workflows (moved to `Biome Tiling` validation workflow)

Replacements MUST flow through the terrain engine config and derived outputs.

Additionally deprecated for this phase:

- humidity paint/brush/fill controls in Terrain Debugger UI
- humidity tint-centric controls that do not change PBR slot assignment
