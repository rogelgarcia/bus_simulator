# Grass Lab Ownership Contract

> **Human visual validation: REJECTED (2026-08-31).** The complete AI 350–362/AI 537 solution is historical only. It cannot authorize gameplay or serve as an accepted visual baseline. AI 363 was cancelled and deleted without implementation. See `GRASS_LAB_HUMAN_REJECTION.md`.

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
| Cancelled gameplay adapter (AI 363) | No implementation; prompt deleted after human visual rejection | Importing any part of the rejected solution into gameplay |

## Runtime reconciliation

The live lab renderer is `src/graphics/engine3d/grass/GrassEngine.js`. The former Grass Debugger LOD1/LOD2 individual-blade methods remain dormant legacy inspector code; the lab loop does not build or update that renderer. AI 351 adds one isolated high-resolution bake-source comparison fixture in the Authoring tab and derives the live field configuration from `LowCutGrassProfile.js`. AI 352 adds the isolated Material fixture for source/far/substrate comparison, one-atlas review, and daylight/overcast/grazing acceptance. AI 353 adds `GrassNearCarpetSystem.js` inside the same engine: deterministic one-metre cells, shared patch geometry/material, bounded camera-cell updates, and valid chunk culling. AI 354 adds `GrassCoverageSurfaceSystem.js` and `GrassCoverageContract.js`: a binary raised surface, batched lip, sparse fringe, expanded near-patch exclusions, and deterministic straight/corner/irregular acceptance cameras. Terrain Debugger does not expose a Grass tab or instantiate these Grass Lab systems; this prevents a second approval path.

AI 355 adds the pure `GrassAutoLodContract.js` evaluator plus `GrassMidClusterSystem.js` inside the same engine. The automatic path now selects near patches, one atlas-backed mid-cluster batch, and texture-only coverage at short angle-adjusted ranges. Patch-stable masked transitions and hysteresis replace transparent fades; manual tier forcing remains diagnostic and cutoff-bounded. The dormant former hundreds-of-metres field renderer remains disabled.

AI 356 adds `GrassLocalizedAccentContract.js` and `GrassLocalizedAccentSystem.js`. Four city-shaped tree records and one explicit optional worn feature feed a coverage-bounded `localized_tufts` layout. One shared atlas batch renders near-tier grass cards and one shared substrate batch renders trunk wear. Field-wide tuft distribution remains prohibited.

AI 357 added `GrassLabValidationContract.js` plus the V1 Validation tab. Low/default/high presets, exact-height and LOD-handoff cameras, four deterministic lighting reviews, stationary/flyover paths, rolling budget diagnostics, stress sampling, regression gates, and an explicit approval record formed the V1 review route. Corrective AI 358 through AI 361, AI 362 machine validation, and AI 537 performance work are now rejected historical evidence with no gameplay route. Validation quality presets keep automatic LOD active and hide debug rings; manual forcing remains diagnostic.

The adapter contract is `src/graphics/gui/grass_debugger/GrassLabContract.js`.
AI 360 completed with contract version `9`, mapping source controls into
sanitized `GrassEngine` near, historical cluster/accent, automatic-LOD,
exact-coverage, and validation configuration. AI 361 incremented the snapshot
contract to version `10` with its V2 four-tier runtime, field diagnostics,
evidence roles, and deterministic motion controls. The existence of the
normative V2 specs does not itself satisfy that implementation gate. Historical
AI 357 evidence used contract version 7; it is not the current boundary, near,
or hierarchy approval contract.

AI 359 adds the exact RoadEngine-derived polygon footprint, continuous
substrate, opaque cap, two-draw physical edge, and hard tree-base holes defined
by `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`. AI 360 replaces the historical
whole-patch near rejection with the area-complete, per-root-clipped micro-carpet
defined by `NEAR_GRASS_CARPET_PATCH_V2.md`. The corrected near path consumes the
AI 359 boundary signature and AI 358 appearance while forced-near remains a
bounded diagnostic rather than a second LOD policy.

AI 361's normative runtime contracts are
`GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md` and
`LOCALIZED_GRASS_ACCENTS_V2.md`. The first evolves
`bus-simulator.grass-auto-lod` to version 2 with `3/8/25 m` close,
billboard, middle, and texture thresholds, a shared one-metre exact-coverage
field layout, complementary stable masks, and separate field-tier diagnostics.
The second retains deterministic tree/feature inputs, uses AI 359 root and
envelope eligibility plus AI 358's `ACCENT_CLUMP` material, follows the final
middle-to-texture handoff, and removes the V1 worn-disc batch. AI 361 completed
only after its prompt's runtime, regression, structural-cost, and fresh
final-code native-4K visual/functional/motion evidence gates passed.

AI 361 is complete in its hierarchy implementation scope. Its final evidence
passes `84/84` focused unit/contract tests, `5/5` browser cases, and `60/60`
required final-code native-4K capture, hash, visual, functional, and motion
checks. Its actual WebGL2 disjoint-timer query path records graphics
vendor/renderer, backend, sample/submission sequences, disjoint state, warm-up
stability, and raw samples; performance review uses aggregated mean/median/p95
values rather than a stale last query or CPU proxy. On the RTX 3060 D3D11
reference, the required five-row `1920x1080` performance set has a failed
overall GPU verdict even though every structural row and CPU mean passes. The
complete failed set is retained unchanged for AI 537. AI 362 has now issued
the scoped visual, functional, motion, and determinism approval at
`specs/grass/GRASS_LAB_APPROVAL_AI362.json` while recording
`schema: "grass-lab-approval-v2"`,
`performance.status: "deferred_to_ai537"`,
`performanceOwnership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`,
`performance.ownership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`,
`gameplayTouched: false`, and `authorization.gameplayAuthorized: false`;
it does not silently pass the failed performance gate. The completed evidence
passes `114/114` native-4K capture checks, all `29/29` V2 regressions, and
all `36/36` immutable AI 361 baseline pairs. The default structural row
records `113,677` combined grass triangles, `5` logical grass draws, zero
geometry beyond cutoff, and zero recurring stationary uploads. Every non-timing
structural gate passes.

AI 362 also records all five canonical `1920x1080` timing rows with complete
120-frame warm-up and 120 measured samples, plus a separate native-4K
informational row. The headless Chromium run used SwiftShader without
`EXT_disjoint_timer_query_webgl2`, so each canonical row truthfully retains a
failed `hardwareAdapter` check and unavailable GPU-query timing rather than
substituting a CPU proxy. Performance remains `deferred_to_ai537` in that
scoped visual/functional record; gameplay was not touched or authorized by
AI 362. AI 537 later completed automated performance work, but the user
rejected the source visual result. The uncommitted AI 537 approval record was
removed, the AI 362 machine record is historical only, and AI 363 is cancelled.

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
- AutoLOD schema/version, focus/view angle, effective distance/angle scale,
  four weights, transition state/progress, shared handoff identity, near,
  billboard, middle, and combined instances/triangles/draws, atlas policy, and
  actual geometry beyond the effective cutoff.
- localized tree/feature records, exact eligible and represented roots,
  two-card accent clumps, zero worn geometry/material cost, deterministic
  signature, rejected roots, and render/cutoff safety.

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

`specs/grass/GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` is authoritative only for the historical V1 result. The stationary default `1.50 m` camera measured `0.07 ms` GrassEngine CPU, `0.87 ms` whole-frame GPU proxy, `5` logical grass draws, `21,492` visible grass triangles, `0.00` buffer uploads/s, and zero geometry beyond the cutoff on the 1280×720 WebGL2 RTX 3060 reference. The high/top-down stress view measured `26,912` triangles and `4` draws. The AI 357 and AI 362 approval records remain historical machine evidence overridden by human visual rejection; the uncommitted AI 537 performance approval was removed.

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

AI 351 through AI 362 and AI 537 used the canonical Lab URL and reusable
engine/config contract. No prompt is currently allowed to import this rejected
system into gameplay. Any future restart requires a new visual direction, a
new prompt, and explicit human approval before a new gameplay adapter may be
created.
