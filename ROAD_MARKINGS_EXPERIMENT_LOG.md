# Road Markings / Asphalt Experiments Log

This file tracks every road-rendering experiment from **2026-01-23** onward.

**Rule for future work**
- Every code change related to roads/asphalt/markings/curbs/sidewalks/camera depth must be logged here.
- Every effect you report (good/bad) must be appended here under the corresponding entry.

---

## 2026-01-23 — Baseline notes: Road Debugger strategy (sharp markings)

**How Road Debugger renders markings (why it looks sharp)**
- Uses **mesh geometry**, not baked textures:
  - Thick line strips are built by expanding each segment into quads (two triangles per segment) in `src/graphics/visuals/city/RoadMarkingsMeshes.js`.
  - Crosswalks/arrows are also triangles in the same mesh builder.
- Avoids z-fighting mostly via a **small vertical lift (Y)** above asphalt:
  - `markingY = asphaltY + layerEps` in `src/graphics/gui/road_debugger/RoadDebuggerView.js:2974`.
  - Additional small `paintLift` for some paint elements in `src/graphics/gui/road_debugger/RoadDebuggerView.js:3584`.
- Uses **MeshBasicMaterial flat colors** for markings and sets explicit **renderOrder** per marking category in `src/graphics/gui/road_debugger/RoadDebuggerView.js:3598`.

---

## 2026-01-23 — Experiment: baked markings into asphalt (CanvasTexture + shader blend)

**Goal**
- Remove coplanar asphalt/markings geometry to eliminate z-fighting and “markings draw over tires” artifacts without using floating meshes or hard renderOrder hacks.

**Implementation (key changes)**
- Added baked marking path (CanvasTexture + shader blend) in `src/graphics/visuals/city/RoadEngineRoads.js`:
  - `createRoadMarkingsTexture()` draws line segments + triangles into a canvas and uploads it as a `THREE.CanvasTexture`.
  - `createAsphaltMaterialWithMarkings()` blends the marking texture in `onBeforeCompile` using world XZ → UV mapping.
- Added options for baked tuning (resolution caps) in `src/graphics/visuals/city/RoadEngineRoads.js`:
  - `options.markingsTexturePixelsPerMeter`
  - `options.markingsTextureMaxSize`
- Fixed a crash in shader compile path by initializing `shader.extensions` before setting `derivatives`.

**User-reported effects**
- Markings became **blurry** (texture sampling).
- In gameplay at distance/low angle: **aliasing shimmer/flicker** (not z-fighting), and markings look **sharp at 0/90°** but **jagged at other angles**.
- In city debugger: markings **almost don’t show** and **flicker** when they do.

**Decision / Outcome**
- Baked approach is angle/resolution sensitive and trades z-fighting for texture aliasing/blur; kept as an opt-in path only.

---

## 2026-01-23 — Experiment: revert to mesh-based markings as default (gameplay + City debugger)

**Goal**
- Restore sharp markings at any road angle while keeping stability (no obvious z-fight) and avoiding “paint over tires” artifacts.

**Implementation (key changes)**
- Switched RoadEngine roads to default to **mesh markings**:
  - Default `markingsMode` now resolves to `'meshes'` unless explicitly set to `'baked'` in `src/graphics/visuals/city/RoadEngineRoads.js`.
- Tuned materials so decals behave in debug as well:
  - In `src/graphics/visuals/city/RoadEngineRoads.js`, debug-mode lane materials are converted to transparent “decal-style” `MeshBasicMaterial` (depthWrite off, polygonOffset on, NoBlending) so they render similarly to normal mode.
- Removed asphalt/sidewalk polygonOffset that was interfering with marking visibility:
  - `src/graphics/assets3d/textures/CityMaterials.js` no longer applies polygonOffset to `road` and `sidewalk`.
- Marking decal material settings (mesh mode):
  - `laneWhite`/`laneYellow`: `transparent: true`, `depthWrite: false`, `NoBlending`, `polygonOffsetUnits: -1` in `src/graphics/assets3d/textures/CityMaterials.js`.
- Tests updated back to mesh-default expectations:
  - `tests/core.test.js` expects `MarkingsWhite` mesh exists in default road rendering test.

**Status**
- Awaiting fresh user visual feedback after the switch back to mesh-default.

---

## 2026-01-23 — Supporting fixes (context for current state)

These are related changes made while chasing the regressions:
- Asphalt visibility fix (backface culling / winding): `src/app/road_engine/RoadEngineMeshData.js`.
- Sidewalk/curb top normals fix: `src/app/road_decoration/curbs/RoadCurbBuilder.js`, `src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js`.
- Gameplay bus spawn Y uses ground surface: `src/states/GameplayState.js`.
- City camera near-plane increased for depth precision: `src/app/city/City.js`.
- Reverted temporary ground `depthWrite=false` tweak: `src/graphics/assets3d/generators/TerrainGenerator.js`.

---

## 2026-01-23 — Issue: grass z-fighting with road (asphalt)

**User-reported effect**
- Grass is **z-fighting** with the road.
- User approved a simple solution: road can be “above” grass since grass is fully hidden under asphalt (collision to be revisited later).

**Implementation (current fix attempt)**
- Push grass surfaces “behind” roads via **polygonOffset on grass materials**:
  - `floorMat.polygonOffsetFactor/Units = 1` and `tilesMat.polygonOffsetFactor/Units = 1` in `src/graphics/assets3d/generators/TerrainGenerator.js`.

**Status**
- Awaiting user confirmation on whether road/grass flicker is gone.

---

## 2026-01-23 — Issue: markings z-fighting with asphalt (mesh mode)

**User-reported effect**
- Markings are **z-fighting** with the road/asphalt.

**Implementation (current fix attempt)**
- Apply a small physical “paint lift” using existing generator config:
  - `markingY = asphaltY + road.markings.lift` in `src/graphics/visuals/city/RoadEngineRoads.js`.
  - This follows the Road Debugger strategy (small Y separation) but keeps gameplay defaults (no forced renderOrder).

**Status**
- Awaiting user confirmation on whether markings/asphalt flicker is gone.

**User follow-up**
- ✅ Problem fixed (markings no longer z-fight with asphalt).
