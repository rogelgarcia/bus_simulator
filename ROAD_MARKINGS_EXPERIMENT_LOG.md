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

---

## 2026-01-27 — Fix: markings hidden by custom asphalt materials (polygonOffset / render order)

**User-reported effect**
- In gameplay: markings are not visible.
- In city view: markings become visible only when asphalt is disabled (suggesting asphalt is occluding/overdrawing).
- User notes they are using custom asphalt materials with roughness/normal maps (not default configs).

**Implementation (key changes)**
- Make decal-style markings materials always “win” against asphalt polygon offsets:
  - `resolveMaterials()` now forces stronger lane marking `polygonOffsetFactor/Units` (defaults `-1/-4`) and, when asphalt uses polygonOffset, pushes markings further forward (`factor - 2`, `units - 4`) (`src/graphics/visuals/city/RoadEngineRoads.js`).
- Ensure markings don’t rely on external config defaults for depth separation:
  - Enforced a minimum `road.markings.lift` of `0.003` meters (even if config sets `0`) (`src/graphics/visuals/city/RoadEngineRoads.js`).
- Ensure markings draw after asphalt/edge wear even if asphalt ends up in the transparent pass:
  - Markings mesh `renderOrder` now resolves to `max(asphalt, edgeWear) + 1` (`src/graphics/visuals/city/RoadEngineRoads.js`).
- Harden against external runtime tweaks:
  - Markings now re-sync `renderOrder` + decal `polygonOffset` every frame via `onBeforeRender`, so if gameplay code later changes asphalt render order or polygon offset, markings still render on top (`src/graphics/visuals/city/RoadEngineRoads.js`).

**Tests**
- Added a Playwright headless E2E guard that asserts markings change rendered pixels by toggling the `Markings` group visibility:
  - `tests/headless/e2e/road_markings_visible.pwtest.js`

**Follow-up (2026-01-27)**
- Headless captures showed diffs dominated by async grass texture loads, and markings still appeared missing.
- Increased default physical separation and decal depth bias:
  - Default `road.markings.lift` raised to `0.01` (and runtime min enforced) to reduce z-fighting at city camera depths.
  - Markings decal `polygonOffsetUnits` strengthened from `-4` → `-16` to bias depth-test decisively in favor of markings.

---

## 2026-01-27 — Root cause: shader compilation failures (markings “exist” but don’t render)

**Why this entry exists**
- After the depth/polygonOffset tweaks above, the **headless repro still showed `changedPixels = 0`** when toggling markings in `city_straight_road`.
- Even when asphalt was hidden and markings materials were forced to bright colors + depthTest disabled, pixels did not change.
- That evidence suggested the issue was not “occluded by asphalt” but “not rendering / program invalid”.

**Deterministic repro + guard**
- Added headless regression test:
  - `tests/headless/e2e/road_markings_visible.pwtest.js`
- Added deterministic scenario mirroring gameplay asphalt maps:
  - `tests/headless/harness/scenarios/scenario_road_markings_textured_asphalt.js`

**Key discovery**
- Capturing the browser console during the failing headless run showed shader compilation failures:
  1. `AsphaltEdgeWearVisuals` used `vUv` without guaranteeing `vUv` exists (missing `USE_UV`) → `'vUv' : undeclared identifier`.
  2. `AsphaltMarkingsNoiseVisuals` injected GLSL using local variable name `active`, which is treated as reserved/illegal on the target GLSL compiler (ANGLE) → `'active' : Illegal use of reserved word`.
  3. `AsphaltMarkingsNoiseVisuals` (and similar injectors) could be applied repeatedly before the first successful compile (e.g., while dragging sliders), stacking `onBeforeCompile` wrappers and producing duplicated shader declarations → `'vAsphaltMarkingsWorldPos' : redefinition`.
- These failures lead to invalid WebGL programs (`useProgram: program not valid`) and the markings toggle no longer affected pixels.

**Fix (final)**
- `src/graphics/visuals/city/AsphaltEdgeWearVisuals.js`: force UV varyings by setting `mat.defines.USE_UV = 1` for the injected material.
- `src/graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js`: rename injected GLSL local `active` → `enabledFlag`.
- `src/graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js` + `src/graphics/visuals/city/AsphaltEdgeWearVisuals.js`: make shader injection idempotent and ensure `onBeforeCompile` is installed only once per material.

**Verification**
- `npm run -s test:headless -- road_markings_visible.pwtest.js` now passes (both scenarios show a strong pixel diff when markings are toggled).
- `npm run -s test:headless -- gameplay_asphalt_markings_noise_no_shader_errors.pwtest.js` verifies that changing markings noise options in gameplay does not produce shader compile errors.

**Deep dive**
- Full writeup: `ROAD_MARKINGS_ISSUE_ANALYSIS.md`
