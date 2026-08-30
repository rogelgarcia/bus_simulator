# Grass Lab Validation and Approval V1

> Historical V1 record: later native-4K and zoomed visual review rejected this result as authorization for gameplay. Keep the measurements and screenshots as completed AI 357 evidence, but require AI 358 through AI 361 corrections and an approved `GRASS_LAB_APPROVAL_AI362.json` before AI 363 may modify gameplay.

## Approval boundary

This was the authoritative AI 357 offline approval contract for V1. It validates the historical reusable Grass Lab runtime only; gameplay remained unchanged. It no longer authorizes gameplay integration.

Automatic LOD is the canonical review mode. Manual near/cluster/texture forcing remains available in the Cluster LOD tab for diagnosis and never expands geometry beyond the hard cutoff.

## Quality presets

| Preset | Near radius | Cluster / far cutoff | Density | Near / cluster geometry | Tree accents | Fallback |
|---|---:|---:|---:|---|---|---|
| Low | 6 m configured | 20 m configured | 0.55× | off / off | off | Raised alpha-tested surface, lip, fringe, substrate, and maintained texture remain |
| Default | 9 m | 30 m | 1.00× | 48 blades/m² / 2 cards per patch | 4 cards/tree | Automatic near → cluster → texture |
| High | 12 m | 42 m | 1.25× | 64 blades/m² / 2 cards per patch | 6 cards/tree | Expanded review/stress range |

All presets retain binary coverage, the `27.5 mm` physical grass layer, and hard sidewalk/irregular cuts. The low preset intentionally disables grass geometry so failure is coherent and cheap. Validation presets hide diagnostic LOD rings; those remain opt-in in tier tabs.

## Repeatable reviews

The Validation tab provides exact camera heights of `0.30`, `0.50`, `1.00`, `1.50`, `2.00`, `3.00`, and `5.00 m`, plus the existing `4.50 m` gameplay bus camera. Dedicated near/cluster handoff, cluster/texture handoff, top-down, and far texture-only poses supplement that ladder.

Lighting presets are daylight, overcast, golden hour, and night/street-lit proxy. Night replaces the daylight IBL background with a deterministic dark sky and enables the bounded street-light proxy. The stationary path proves upload settling; the nine-second flyover crosses near, cluster, and texture focus ranges.

## Diagnostics and budgets

The Lab reports active tier, focus distance, view angle and angle scale, per-tier instances/triangles, grass-specific logical draws, rolling GrassEngine CPU, whole-frame GPU timer proxy, and instance-buffer uploads per second. GPU timing is explicitly informational across hardware because the renderer currently exposes a whole-frame timer rather than an isolated grass pass.

The default `1920×1080` target remains:

- average GrassEngine CPU `≤ 0.60 ms`;
- average whole-frame GPU proxy `≤ 1.50 ms` when supported;
- `4–6` typical grass draws and `12` hard ceiling;
- `≤ 100,000` visible grass triangles;
- zero geometry beyond the angle-adjusted cutoff.

At the `1280×720` live approval viewport on WebGL2 / NVIDIA GeForce RTX 3060, the stationary default `1.50 m` camera produced this 22-sample baseline after a one-second warm-up:

| Metric | Measured |
|---|---:|
| GrassEngine update CPU | 0.07 ms average |
| Whole-frame GPU proxy | 0.87 ms average |
| Grass logical draws | 5 average / 5 maximum |
| Visible grass triangles | 21,492 |
| Stationary buffer uploads | 0.00/s |
| Geometry beyond cutoff | 0 |

The high/top-down stress view produced `26,912` grass triangles, `4` logical draws, `0.07 ms` average CPU, `0.63 ms` average GPU proxy, and `0.00` stationary uploads/s. The default flyover produced `4.75` average / `6` maximum grass draws, `0.37 ms` average CPU, `0.76 ms` average GPU proxy, and `14.09` uploads/s while moving; uploads settled to zero when stationary.

The near carpet now uses `32 m` render chunks. This changes batching only: blade placement, density, triangles, material, culling, and transition masks are unchanged. The approval camera therefore stays inside the `4–6` draw target without reducing visual density.

## Regression gates

`grass_lab_validation_contract.test.js` locks preset differences, the complete camera/lighting/path catalogs, deterministic budget evaluation, and the explicit approval gate. Existing focused contracts continue to cover physical blade height, near layout/camera-cell stability, hard surface/lip/fringe partitions, straight/corner/irregular cuts, automatic masked handoffs and hysteresis, deterministic localized accents, cutoff safety, and the material family.

`grass_lab_validation.pwtest.js` adds browser-level checks for deterministic reloads, low-quality boundary preservation, camera poses, handoff/cutoff behavior, triangle/draw ceilings, and flyover stability. The local standalone runner could not fetch the CDN-hosted Three.js modules under the sandbox network policy, so the same runtime cases were completed interactively in the in-app browser; the focused 42-test Node grass suite passed. This runner limitation is environmental and does not weaken the checked browser regression.

## Screenshot evidence

The approval set is stored under `screens/grass_ai357/` and includes exact `0.30`, `0.50`, `1.00`, and `1.50 m` views, the gameplay bus camera, near/cluster handoff, top-down, far texture-only, tree accent, night, low fallback, and high stress poses.

## Decision

Historical decision: V1 was approved at the time and the checked record remains in `specs/grass/GRASS_LAB_APPROVAL_AI357.json`. Later visual review revoked it as gameplay authorization. Gameplay is still untouched; AI 363 alone may integrate after AI 362 records an approved V2 result.
