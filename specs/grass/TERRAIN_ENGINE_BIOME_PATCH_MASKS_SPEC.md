# Terrain Engine Specification (Biome Patch Masks)

Status: Proposed  
Scope: Deterministic, renderer-agnostic terrain surface sampler used by tools (Terrain Debugger) and future runtime systems.

## 1. Goals

The terrain engine MUST:

- Provide full-map ground coverage with no gaps (a default biome applies everywhere)
- Represent patch-based biome regions with hard borders at map scale
- Provide humidity as a continuous, deterministic field
- In Terrain Debugger workflows, allow humidity source-map generation from cloud noise with one humidity value per subtile
- Support graded biome transitions only inside a configurable near-camera blend zone
- Support explicit biome-pair transition profiles (with intent presets) so pair behavior is tunable independently
- Support texture/painterly source maps as optional inputs (biome + humidity)
- Provide a lightweight sampling API: `(worldX, worldZ) -> biome ids, humidity, blend`
- Optionally export mask rasters for debug rendering

## 2. Terminology

- Biome: Discrete ground surface category (v1: `stone`, `grass`, `land`).
- Patch: A region of constant primary biome at map scale (v1: `grid` or `voronoi` partition over world XZ).
- Patch ID: Stable deterministic identifier for a patch (integer).
- Near-camera blend zone: Area around the current view origin where boundary blending is allowed.
- Transition band: World-space width around patch boundaries inside which two biomes may blend.

## 3. Data Model (Serializable Config)

The engine config MUST be JSON-serializable and versioned.

### 3.1 Terrain Engine Config

```json
{
  "version": 1,
  "seed": "terrain-v1",
  "bounds": { "minX": -120, "maxX": 120, "minZ": -240, "maxZ": 240 },
  "patch": {
    "sizeMeters": 72,
    "originX": 0,
    "originZ": 0,
    "layout": "voronoi",
    "voronoiJitter": 0.85,
    "warpScale": 0.02,
    "warpAmplitudeMeters": 18
  },
  "biomes": {
    "mode": "patch_grid",
    "defaultBiomeId": "land",
    "weights": { "stone": 0.25, "grass": 0.35, "land": 0.40 }
  },
  "humidity": {
    "mode": "noise",
    "noiseScale": 0.01,
    "octaves": 4,
    "gain": 0.5,
    "lacunarity": 2.0,
    "bias": 0.0,
    "amplitude": 1.0
  },
  "transition": {
    "cameraBlendRadiusMeters": 140,
    "cameraBlendFeatherMeters": 24,
    "boundaryBandMeters": 10,
    "profileDefaults": {
      "intent": "medium",
      "widthScale": 1.0,
      "falloffPower": 1.0,
      "edgeNoiseScale": 0.02,
      "edgeNoiseStrength": 0.22,
      "dominanceBias": 0.0,
      "heightInfluence": 0.0,
      "contrast": 1.0
    },
    "pairProfiles": {
      "grass|land": {
        "intent": "soft",
        "widthScale": 1.4,
        "falloffPower": 0.9,
        "edgeNoiseScale": 0.02,
        "edgeNoiseStrength": 0.35,
        "dominanceBias": 0.0,
        "heightInfluence": 0.2,
        "contrast": 0.85
      }
    }
  }
}
```

### 3.2 Value Ranges and Defaults

- `version`: integer, required. v1 = `1`.
- `seed`: string, required. Used for all hashing/noise.
- `bounds`: required. Units are meters in world space.
  - `minX < maxX`, `minZ < maxZ`.
- `patch.sizeMeters`: float, `(0, +inf)`. Default `72`.
- `patch.originX/originZ`: floats (meters). Default `0`.
- `patch.layout`: `grid` (default) or `voronoi`.
- `patch.voronoiJitter`: float, `[0..1]`. Default `0.85`.
  - Only used when `patch.layout = voronoi`.
- `patch.warpScale`: float, `(0, +inf)`. Default `0.01`.
  - Only used when `patch.layout = voronoi` and `patch.warpAmplitudeMeters > 0`.
- `patch.warpAmplitudeMeters`: float, `[0..+inf)`. Default `0`.
  - When > 0, the Voronoi partition is domain-warped to produce curved/organic boundaries.
- `biomes.defaultBiomeId`: one of: `stone`, `grass`, `land`. Default `land`.
- `biomes.mode`: `patch_grid` (default) or `source_map` (requires a runtime biome source map).
- `biomes.weights`: non-negative floats, not all zero. Default as in example.
  - Engine normalizes weights to a distribution.
- `humidity.mode`: `noise` (default) or `source_map` (requires a runtime humidity source map).
- Terrain Debugger SHOULD set `humidity.mode=source_map` and generate humidity values from a deterministic cloud pattern over subtiles.
- `humidity.noiseScale`: float, `(0, +inf)`. Default `0.01`.
- `humidity.octaves`: integer, `[1..8]`. Default `4`.
- `humidity.gain`: float, `(0, 1]`. Default `0.5`.
- `humidity.lacunarity`: float, `[1..4]`. Default `2.0`.
- `humidity.bias`: float, `[-1..1]`. Default `0`.
- `humidity.amplitude`: float, `[0..1]`. Default `1`.
- `transition.cameraBlendRadiusMeters`: float, `[0..+inf)`. Default `140`.
- `transition.cameraBlendFeatherMeters`: float, `[0..+inf)`. Default `24`.
- `transition.boundaryBandMeters`: float, `[0..+inf)`. Default `10`.
- `transition.profileDefaults`: per-pair profile fallback used when no explicit pair entry exists.
- `transition.pairProfiles`: map keyed by canonical biome pair id (`stone|grass`, `stone|land`, `grass|land`).
  - Key ordering MUST be canonicalized (stable pair ordering, not directional input order).

### 3.3 Transition Pair Profile Fields

- `intent`: one of `soft`, `medium`, `hard`. Used as artistic preset category.
- `widthScale`: `[0.25..4.0]`, scales boundary-band width for this pair.
- `falloffPower`: `[0.3..3.5]`, reshapes the blend curve.
- `edgeNoiseScale`: `[0.0005..0.2]`, world-space edge irregularity frequency.
- `edgeNoiseStrength`: `[0.0..1.0]`, edge irregularity amplitude.
- `dominanceBias`: `[-0.5..0.5]`, secondary-vs-primary push in the pair transition.
- `heightInfluence`: `[-1.0..1.0]`, humidity/height-informed dominance influence.
- `contrast`: `[0.25..3.0]`, final transition clarity/softness shaping.

## 4. Determinism Requirements

Given an identical config:

- Patch IDs MUST be stable across runs (no Math.random).
- Patch biome assignment MUST be stable and derived from integer patch coordinates + seed.
- Humidity MUST be stable and derived from a deterministic noise function.
- Sampling MUST be continuous for humidity and piecewise-constant for primary biome (outside transition band).

## 4.1 Source Maps (Optional, Runtime-only)

The engine MAY accept runtime-only source maps (not JSON-serializable):

- Biome map: `uint8` values where `0=stone`, `1=grass`, `2=land`.
  - When enabled (`biomes.mode=source_map`), the biome for a patch is sampled at the patch center.
- Humidity map: `uint8` values mapped to `[0..1]`.
  - When enabled (`humidity.mode=source_map`), humidity is sampled bilinearly per position.
  - Terrain Debugger subtile cloud semantics:
    - one humidity value is generated for each subtile cell
    - values are derived from deterministic cloud-noise sampling using debugger seed + cloud params
    - repeated runs with identical config MUST produce identical humidity cells

## 5. Sampling Contract (Runtime API)

The engine provides a lightweight sampler for world positions.

### 5.1 Sample Output (v1)

```js
{
  patchId: 1234567890,
  primaryBiomeId: "grass",
  secondaryBiomeId: "land",
  biomeBlend: 0.0,
  humidity: 0.42,
  edgeDistanceMeters: 18.2,
  transition: {
    active: true,
    cameraAlpha: 0.8,
    pairKey: "grass|land",
    intent: "medium",
    widthScale: 1.0,
    falloffPower: 1.0,
    edgeNoiseStrength: 0.22,
    dominanceBias: 0.0,
    heightInfluence: 0.0,
    contrast: 1.0,
    rawWeight: 0.24,
    falloffWeight: 0.24,
    dominanceWeight: 0.24,
    finalWeight: 0.24,
    noiseOffsetMeters: -0.18
  }
}
```

Semantics:

- `patchId`: deterministic ID for the primary patch at `(x,z)`.
- `primaryBiomeId`: the patch biome (hard at map scale).
- `secondaryBiomeId`: neighboring patch biome across the closest boundary (may equal primary).
- `biomeBlend`: `[0..1]`, weight of `secondaryBiomeId`.
  - Outside the near-camera blend zone OR outside the transition band: MUST be `0`.
  - Inside the transition band and blend zone: MUST vary smoothly across the boundary and reach ~`0.5` at the boundary.
- `humidity`: `[0..1]`, continuous (noise/source map), clamped.
- `edgeDistanceMeters`: distance to the nearest patch boundary (>= 0).
- `transition.cameraAlpha`: `[0..1]` blend zone influence (0 outside zone, 1 well inside).
- `transition.pairKey`: canonical biome pair used for profile lookup.
- `transition.intent` + profile scalars: resolved per-pair profile used for this sample.
- `transition.rawWeight/falloffWeight/dominanceWeight/finalWeight`: ordered shaping stages for transition diagnostics.
- `transition.noiseOffsetMeters`: deterministic edge-noise displacement applied before shaping.

## 6. Mask Export (Optional)

The engine MAY export raster masks for debug rendering.

### 6.1 Packed RGBA8 Mask (Recommended)

For a `width x height` export over `bounds`:

- R: primary biome index (`0=stone`, `1=grass`, `2=land`)
- G: secondary biome index (`0=stone`, `1=grass`, `2=land`)
- B: `biomeBlend` mapped to `[0..255]`
- A: `humidity` mapped to `[0..255]`

Notes:

- The mask is intended for tools/debugger visualization and shader-based previews.
- The mask is view-dependent because `biomeBlend` depends on the near-camera blend zone.

### 6.2 Patch ID Mask

For patch diagnostics, a separate `Uint32Array` patch-id raster MAY be exported:

- one `uint32` per pixel storing the `patchId` at that sample.

### 6.3 Transition Debug Channels

Packed-mask export SHOULD include a `transitionDebug` payload with deterministic `Float32Array` channels:

- `rawWeight`
- `falloffWeight`
- `dominanceWeight`
- `finalWeight`
- `noiseOffsetMeters`

These channels MUST align 1:1 with exported pixels and MUST be stable for fixed config + view origin.

## 7. Migration Notes

- v1 supports `grid` and `voronoi` patch partitions; Voronoi may optionally be domain-warped for curved boundaries.
- Source maps (biome/humidity) are an optional input; the output contract remains stable.
- Rendering systems SHOULD treat the engine output as authoritative and derive materials/grass controls from it.

## 8. Biome × Humidity PBR Binding (Terrain Debugger)

Terrain Debugger standard rendering binds PBR baseColor textures using:

- Primary dimension: biome (`stone`, `grass`, `land`)
- Secondary dimension: humidity slot (`dry`, `neutral`, `wet`)

This creates a `3 x 3` binding matrix where each slot points to one PBR material id.

### 8.1 Slot Resolution

- Humidity slot thresholds:
  - `dry` for humidity `<= dryMax`
  - `wet` for humidity `>= wetMin`
  - `neutral` in between
- Recommended defaults:
  - `dryMax = 0.33`
  - `wetMin = 0.67`
  - narrow edge-band blend width around thresholds (`blendBand`, recommended `0.08`)
- Humidity slot transitions SHOULD be edge-band-only; broad full-area blending is not allowed.
- Organic/noisy edge perturbation MAY be applied, but it MUST be deterministic for fixed inputs.

### 8.2 Final Transition Interpretation

- Final visible transition bands are the union of:
  - biome-boundary blend bands (camera-zone constrained by engine transition settings)
  - humidity slot edge bands (threshold crossings)
- Transition diagnostics SHOULD visualize these final PBR boundaries, not only biome boundaries.
