# Grass Lab Ownership Contract

> Sequence reconciliation: AI 350 through AI 357 describe the completed V1 implementation below. Later visual review introduced corrective AI 358 through AI 362, and AI 363 is now the sole gameplay adapter. AI 358 through AI 360 now supply the corrected material, boundary, and closest-mesh contracts. V2 contracts supersede the affected runtime claims for downstream work; `GRASS_LAB_APPROVAL_AI357.json` remains historical and cannot unblock gameplay.

## Canonical entry point

`debug_tools/grass_debug.html` is the only screen used to develop, measure, and approve grass before gameplay integration. `debug_tools/grass_lod_debug.html` is a legacy redirect and must not acquire independent behavior.

The lab uses the deterministic seed `grass-lab-baseline-v1`. Its default fixture contains maintained grass over a visible PBR substrate, an orthogonal road with straight sidewalk runs and corners, road/sidewalk exclusion rectangles, three stepped irregular-cut rectangles, and representative tree placements. Reset reloads this canonical state. The lab API at `window.__grassLab` exposes snapshot/reset controls, the versioned low-cut authoring profile export/save controls, and AI 357 quality/camera/lighting/path/stress/approval automation hooks.

## Ownership boundaries

| Owner | Responsibility | Must not own |
|---|---|---|
| Grass Lab | Offline fixtures, grass controls, visual approval, deterministic baseline capture, lab-only tree proxies | A second renderer, gameplay attachment, texture calibration |
| `GrassEngine` and `GrassConfig` | Reusable patch batching, geometry tiers, placement, LOD evaluation, exclusion, grass statistics | Debug-screen DOM, gameplay terrain policy, PBR catalog resolution |
| Global PBR pipeline | Catalog URLs, physical tile metadata, calibration precedence, shared texture loading | Grass placement or boundary rules |
| Terrain and biome systems | Ground geometry and eventual grass coverage inputs | An independently rendered debug grass field |
| Future gameplay adapter (AI 363) | Attach the AI 362-approved V2 runtime and contracts to gameplay terrain, road exclusions, and quality settings | Re-authoring the approved offline asset/runtime path |

## Runtime reconciliation

The live lab renderer is `src/graphics/engine3d/grass/GrassEngine.js`. The former Grass Debugger LOD1/LOD2 individual-blade methods remain dormant legacy inspector code; the lab loop does not build or update that renderer. AI 351 adds one isolated high-resolution bake-source comparison fixture in the Authoring tab and derives the live field configuration from `LowCutGrassProfile.js`. AI 352 adds the isolated Material fixture for source/far/substrate comparison, one-atlas review, and daylight/overcast/grazing acceptance. AI 353 adds `GrassNearCarpetSystem.js` inside the same engine: deterministic one-metre cells, shared patch geometry/material, bounded camera-cell updates, and valid chunk culling. AI 354 adds `GrassCoverageSurfaceSystem.js` and `GrassCoverageContract.js`: a binary raised surface, batched lip, sparse fringe, expanded near-patch exclusions, and deterministic straight/corner/irregular acceptance cameras. Terrain Debugger does not expose a Grass tab or instantiate these Grass Lab systems; this prevents a second approval path.

AI 355 adds the pure `GrassAutoLodContract.js` evaluator plus `GrassMidClusterSystem.js` inside the same engine. The automatic path now selects near patches, one atlas-backed mid-cluster batch, and texture-only coverage at short angle-adjusted ranges. Patch-stable masked transitions and hysteresis replace transparent fades; manual tier forcing remains diagnostic and cutoff-bounded. The dormant former hundreds-of-metres field renderer remains disabled.

AI 356 adds `GrassLocalizedAccentContract.js` and `GrassLocalizedAccentSystem.js`. Four city-shaped tree records and one explicit optional worn feature feed a coverage-bounded `localized_tufts` layout. One shared atlas batch renders near-tier grass cards and one shared substrate batch renders trunk wear. Field-wide tuft distribution remains prohibited.

AI 357 added `GrassLabValidationContract.js` plus the V1 Validation tab. Low/default/high presets, exact-height and LOD-handoff cameras, four deterministic lighting reviews, stationary/flyover paths, rolling budget diagnostics, stress sampling, regression gates, and an explicit approval record formed the V1 review route. Corrective AI 358 through AI 361 and AI 362 reapproval now form the only route to AI 363. Validation quality presets keep automatic LOD active and hide debug rings; manual forcing remains diagnostic.

The adapter contract is `src/graphics/gui/grass_debugger/GrassLabContract.js`.
Contract version `9` maps source controls into sanitized `GrassEngine` near,
cluster, localized-accent, automatic-LOD, exact-coverage, and validation
configuration and defines fixtures, terrain-grid metadata, repeatable cameras,
and the current snapshot schema. Historical AI 357 evidence used contract
version 7; it is not the current boundary or near approval contract.

AI 359 adds the exact RoadEngine-derived polygon footprint, continuous
substrate, opaque cap, two-draw physical edge, and hard tree-base holes defined
by `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`. AI 360 replaces the historical
whole-patch near rejection with the area-complete, per-root-clipped micro-carpet
defined by `NEAR_GRASS_CARPET_PATCH_V2.md`. The corrected near path consumes the
AI 359 boundary signature and AI 358 appearance while forced-near remains a
bounded diagnostic rather than a second LOD policy.

## Baseline diagnostics

The canonical snapshot records:

- grass patches, instances, estimated triangles, and logical grass draw calls;
- instance and triangle counts by LOD tier;
- smoothed GrassEngine update CPU time;
- whole-frame GPU time when timer queries are supported;
- total renderer calls and triangles for context;
- fixture counts, seed, runtime name, contract version, and LOD evaluation state.
- authoring source mesh, blade/triangle count, geometry hash, stable signature, and derived runtime triangle/material/group/draw properties.
- material-family identity, physical scale, separated map count, substrate identity, one-atlas draw contract, alpha/mip policy, and deterministic provenance.
- near-carpet ownership cells, `eligibleBins`, `representedBins`,
  `unrepresentedEligibleBins`, root and fiber instances,
  boundary/clipped/rejected/ineligible roots, boundary and placement signatures,
  configured/observed height range, triangles, logical draws, material paths,
  buffer update totals/frequency, cell churn, cache invalidation, and
  culling/shadow/transparency safety state.
- hard-coverage semantics and response inputs, physical height/cutout threshold, sidewalk/irregular boundary counts, corner counts, surface/lip/fringe triangles, and bounded draw/material cost.
- automatic tier, focus/view angle, effective distance/angle scale, transition state, near and cluster instances/triangles/draws, atlas policy, and actual geometry beyond the effective cutoff.
- localized tree/feature records, eligible and visible clusters, worn patches, triangles/draws, deterministic signature, rejected roots, and render/cutoff safety.

### AI 353 near-carpet reference

The approved `1 m`, `48 blades/m²`, `12 m` radius grazing fixture produced `439` patch instances, `21,072` one-triangle blades, `21,072` triangles, `4` logical draws, and `1` material path at the captured camera. Stationary frames reported `0` current buffer updates. These counts are deterministic at the same seed, coverage, and camera cell; timing remains hardware-dependent.

GPU timing is explicitly reported as unavailable when the browser or graphics context does not expose a supported timer query. The snapshot is logged as structured JSON and copied to the clipboard when browser permission allows it.

### AI 354 hard-coverage reference

The default binary footprint uses a `27.5 mm` raised surface, `0.35` far-coverage cutoff, `15 mm` maximum edge-AA treatment, and `0.35 m` sparse-fringe spacing. The canonical partition reports `9` sidewalk segments, `11` irregular segments, `12` outside corners, and `8` inside corners. It renders `130` top, `40` lip, and `2,600` fringe triangles through `3` logical draws and `2` materials. All coverage meshes are culled, opaque, and shadow-free. Reference captures live in `tests/artifacts/screens/grass/ai354/`.

### AI 355 automatic-LOD reference

`specs/grass/GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md` is authoritative. Defaults use a `9 m` near end, `30 m` texture-only cutoff, `2 m` masked transition width, and `0.75 m` hysteresis. The canonical camera displayed `34` near patches (`1,632` triangles in `3` chunk draws) plus `591` two-card clusters (`2,364` triangles in `1` draw). Grazing, top-down, past-cutoff, and manual texture checks all reported zero grass geometry beyond the effective cutoff.

### AI 356 localized-accent reference

`specs/grass/LOCALIZED_GRASS_ACCENTS_V1.md` is authoritative. At the deterministic tree camera one tree contributes `4` visible cards, `8` grass triangles, and one global atlas draw. The four tree-wear patches contribute `72` triangles in one global substrate draw. The signature `grass-accents-v1-4686ae3a` repeated after reload, all candidate roots passed coverage/trunk rejection, and zero accent geometry appeared beyond the automatic cutoff. Before/after captures live in `tests/artifacts/screens/grass/ai356/`.

### AI 357 validation and approval reference

`specs/grass/GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` is authoritative only for the historical V1 result. The stationary default `1.50 m` camera measured `0.07 ms` GrassEngine CPU, `0.87 ms` whole-frame GPU proxy, `5` logical grass draws, `21,492` visible grass triangles, `0.00` buffer uploads/s, and zero geometry beyond the cutoff on the 1280×720 WebGL2 RTX 3060 reference. The high/top-down stress view measured `26,912` triangles and `4` draws. The historical approval decision is recorded in `specs/grass/GRASS_LAB_APPROVAL_AI357.json`; captures live in `tests/artifacts/screens/grass/ai357/`. AI 362 must create the current V2 approval record.

### AI 350 reference capture

The canonical default state (including IBL) was captured on 2026-08-29 at a 1280×720 viewport with WebGL2 on an NVIDIA GeForce RTX 3060. This is a comparison point, not a cross-device budget:

| Metric | Reference value |
|---|---:|
| Grass instances | 8,552 |
| Estimated grass triangles | 45,716 |
| Logical grass draw calls | 5 |
| GrassEngine update CPU | 0.03 ms |
| Whole-frame GPU | 1.85 ms |
| Renderer totals | 26 calls / 98,846 triangles |

The displayed values are sampled and may vary slightly with camera timing, browser scheduling, and hardware. Deterministic seed/config counts at the same camera pose are the primary regression signal; timing is the supporting signal.

## Sequence rule

AI 351 through AI 362 must work through the canonical Lab URL and reusable engine/config contract. AI 363 is the only prompt allowed to import the AI 362-approved system into gameplay. Every prompt in the sequence must update the dynamic AI 349 texture-pipeline tracker after changing a PBR consumer or discovering a shared-pipeline obligation.
