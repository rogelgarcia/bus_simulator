# Near Grass Carpet Patch v1

## Runtime contract

AI 353 implements the Grass Lab's uniform near layer in `GrassNearCarpetSystem.js`. The primary placement unit is a deterministic `1 m` cell containing `48` simplified one-triangle blades by default. The blade dimensions, base/tip colors, bend, inclination, and roughness come from `grass.lowcut.maintained.v1`; the visible `pbr.grass_low_cut_maintained_v1` surface beneath the geometry remains responsible for continuous carpet coverage.

The runtime groups cells into `16 m` world chunks. Every visible chunk is one `THREE.InstancedMesh`; all chunks share one geometry and one opaque, vertex-colored material. Grass does not cast or receive shadows. Each mesh keeps frustum culling enabled and recomputes its instance bounds after a buffer write. AI 354 places the near layer at the coverage contract's default `27.5 mm` surface height and expands every exclusion by the full possible patch half-extent (`0.52 m` by default), so complete patches rather than individual roots stay outside roads, sidewalks, corners, and irregular cuts.

## Camera-cell stability and AI 355 handoff

The active cell set is derived from the camera's ground-plane patch cell and a bounded `12 m` radius. Identical seed, camera cell, terrain bounds, and exclusions reproduce the same patch positions, quarter-turn rotations, scales, and brightness variation.

While the camera remains in the same cell and view-angle bucket, no instance buffer is uploaded. Crossing a cell boundary diffs the prior and next sets, retains overlapping cells, and rewrites only chunks affected by entering or leaving cells. Configuration, terrain, source-geometry, or automatic-LOD changes explicitly clear the cache before rebuilding.

AI 355 makes the effective near range automatic: the default near tier ends at `9 m`, adjusted by the shared grazing/top-down angle scale. A stable per-patch mask and `0.75 m` hysteresis determine occupancy in the handoff band. The near material stays opaque; no per-blade LOD evaluation or blended transparency is introduced. Manual force-near is diagnostic and remains bounded by the shared geometry cutoff.

## Lab controls and diagnostics

The **Near source** tab exposes automatic, forced-on, and disabled modes plus patch size, simplified blade density, radius, a repeatable grazing camera, and `4/m²` versus `48/m²` comparison presets. The live readout reports patches, physical blade instances, triangles, logical draws, material paths, last/total buffer updates, stationary frames, entering/leaving/retained cells, and render-safety flags.

The older LOD1 sparse individual-blade controls remain collapsed and dormant. They are preserved only for later LOD reconciliation and inspection; they do not form a second live renderer.

## Scope

This is a historical V1 Grass Lab implementation only. AI 359 owns corrective coverage, AI 360 owns the cohesive near V2 replacement, AI 361 owns V2 handoffs and localized rendering, and AI 363 is the only gameplay-integration phase after AI 362 approval.
