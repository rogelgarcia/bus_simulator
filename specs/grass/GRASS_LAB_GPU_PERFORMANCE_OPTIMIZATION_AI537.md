# Grass Lab GPU performance optimization — AI 537

> **Human visual validation: REJECTED (2026-08-31).** This specification documents the rejected AI 350–362/AI 537 solution for historical reference only. It is not an approved visual baseline and cannot authorize gameplay. See `GRASS_LAB_HUMAN_REJECTION.md`.

## Status and scope

AI 537 is complete and performance-approved for the offline Grass Lab. The
tracked decision is
`specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json`, with:

- `schema: "grass-lab-performance-approval-v1"`;
- `approvalScope: "performance"`;
- `status: "approved"`;
- `gameplayTouched: false`; and
- exact-byte binding to
  `specs/grass/GRASS_LAB_APPROVAL_AI362.json` SHA-256
  `4ed29ee73b3fa2f5cfd6428e86ba9a4ae4b6ce67bd1e19f5417b32f053e50b8e`.

The AI 362 visual, functional, motion, determinism, geometry, coverage,
material, and signature contracts remain the frozen source baseline. AI 537
does not authorize a gameplay-only material, LOD, coverage, or scheduling
fork.

## Finding and accepted design

The continuous control submitted the unchanged static Grass Lab scene on every
animation frame. That repeated whole-scene submission dominated the stationary
canonical rows even though GrassEngine updates, visible geometry, logical
draws, stationary uploads, and rendered output were already stable. The
accepted optimization is therefore demand-driven frame submission for the
offline Lab:

- the animation loop and GrassEngine update continue to run;
- `WebGLRenderer.render` runs for a bounded eight-frame dirty burst, active
  validation motion, asynchronous asset work, or continuous control mode;
- a current, quiescent stationary scene retains its already-presented WebGL
  frame instead of resubmitting identical work;
- state and presented revisions prove that a retained frame is current;
- an invalidation arriving after an action is scheduled cannot be marked
  presented by that older action;
- asynchronous texture, IBL, and context work prevents quiescence until it
  completes; and
- the public diagnostics distinguish `rendered` from `retained` frames and
  label renderer calls/triangles as the last successful render's structural
  cost.

Dirty-state coverage includes startup, camera position/quaternion/target,
projection and drawing-buffer changes, resize, capture entry/exit, UI and
quality state, material version, both lighting paths, boundary/near/hierarchy
evidence modes, LOD-hysteresis reset, positive grass-buffer uploads, texture
loading, IBL completion, WebGL context restoration, and document visibility
resume. Screenshot capture explicitly requests a real render, then waits for a
current quiescent frame. Demand-mode timing cannot begin until at least 30
consecutive current retained frames have been observed.

The measurement schema is intentionally explicit: its GPU scope is
`Grass Lab scheduled-frame GPU timer query`. Every query sample is linked to
the scheduled action, state revision, presented revision, and current-frame
verdict. The continuous control proves 120 rendered measurement frames per
row; the optimized run proves 120 current retained frames and zero renderer
submissions per row. This prevents an empty query from being mislabeled as a
timed `WebGLRenderer.render` call.

## Frozen conditions

| Condition | Recorded value |
|---|---|
| Host | Windows `10.0.26200`, x64 |
| CPU / RAM | AMD Ryzen 5 9600X, 12 logical CPUs, 33,463,193,600 bytes |
| Browser | Headless Chromium 151 |
| GPU backend | Hardware WebGL2, ANGLE D3D11 |
| GPU | NVIDIA GeForce RTX 3060 |
| Context | high-performance, antialias true, `SAMPLE_BUFFERS=1`, `SAMPLES=4` |
| Performance drawing buffer | `1920x1080`, pixel ratio `1` |
| Visual drawing buffer | native `3840x2160`, pixel ratio `1`, lossless PNG |
| Fixture | `grass-lab-canonical-v2`, seed `grass-lab-baseline-v1` |
| Contracts | Grass Lab snapshot v10, material v2, daylight canonical rows |
| CPU scope | `GrassEngine.update` |
| GPU scope | WebGL2 `EXT_disjoint_timer_query_webgl2` around each scheduled frame |
| Warm-up | 120 frames, at least 1 second, stable zero uploads; demand also 30 retained frames |
| Samples per row | 120 CPU, 120 frame, 119 unique valid GPU queries, 120 upload samples |
| Statistic | arithmetic mean, with median and p95 retained |
| Query integrity | zero disjoint events; unique submission sequences |
| Control / optimized | continuous `120 rendered / 0 retained`; demand `0 rendered / 120 retained` |

The final exact-code control was captured immediately before the demand run in
separate fresh browser pages. Full-matrix interleaving was not practical, so
both raw distributions and their standard errors are retained. Every row has a
resolved GPU improvement and no significant CPU regression.

## Same-condition timing

Values inside each CPU, GPU, and frame cell are `mean / median / p95` in
milliseconds. Each side has `120 / 119 / 120` CPU/GPU/frame samples.

| Canonical row | CPU before → after | GPU before → after | Frame before → after | FPS before → after | GPU mean delta | Verdict |
|---|---|---|---|---:|---:|---|
| `quality_low` | `0.030833 / 0 / 0.1` → `0.040833 / 0 / 0.1` | `3.107005 / 3.113984 / 3.560448` → `0.000009 / 0 / 0` | `16.668333 / 16.7 / 16.8` → `17.525 / 16.7 / 22.1` | `59.994` → `57.061` | `-3.106996 ms` | fail → pass |
| `quality_default` | `0.304167 / 0.3 / 0.4` → `0.210833 / 0.2 / 0.4` | `3.118114 / 2.997248 / 3.994624` → `0.000034 / 0 / 0` | `16.668333 / 16.7 / 16.9` → `16.666667 / 16.7 / 16.8` | `59.994` → `60.000` | `-3.118080 ms` | fail → pass |
| `quality_high` | `0.359167 / 0.3 / 0.5` → `0.306667 / 0.3 / 0.5` | `3.446182 / 3.531776 / 4.099072` → `0 / 0 / 0` | `17.2375 / 16.7 / 23.4` → `16.668333 / 16.7 / 16.8` | `58.013` → `59.994` | `-3.446182 ms` | fail → pass |
| `default_worst_view` | `0.205 / 0.2 / 0.4` → `0.166667 / 0.2 / 0.3` | `4.480430 / 4.423680 / 5.200896` → `0.000017 / 0 / 0` | `16.99 / 16.7 / 19.4` → `16.6675 / 16.7 / 16.8` | `58.858` → `59.997` | `-4.480413 ms` | fail → pass |
| `default_transition_overlap` | `0.370 / 0.3 / 0.7` → `0.215833 / 0.2 / 0.3` | `2.319833 / 2.155520 / 3.416064` → `0.000017 / 0 / 0` | `18.0625 / 16.7 / 27.4` → `16.669167 / 16.7 / 16.8` | `55.363` → `59.991` | `-2.319816 ms` | fail → pass |

All optimized CPU means are below `0.60 ms`; all optimized GPU means are
below `1.50 ms`. The GPU improvements resolve at 25.45 to 201.85 combined
standard errors. All rows have zero disjoint events and zero recurring
stationary uploads.

## Structural and renderer parity

Counts are identical before and after. Renderer calls and renderer triangles
are the last successful rendered frame's structural counters; optimized timing
frames retain that current frame and do not resubmit those calls.

| Row | Field / combined triangles | Near / billboard / middle / accent | Grass / combined draws | Boundary | Renderer calls / triangles | Cutoff / missing / exact failures / uploads |
|---|---:|---:|---:|---:|---:|---:|
| `quality_low` | `0 / 95,219` | `0 / 0 / 0 / 0` | `0 / 2` | `95,219 / 2` | `13 / 104,241` | `0 / 0 / 0 / 0` |
| `quality_default` | `18,458 / 113,677` | `9,408 / 550 / 8,500 / 0` | `3 / 5` | `95,219 / 2` | `16 / 122,699` | `0 / 0 / 0 / 0` |
| `quality_high` | `38,040 / 133,259` | `19,968 / 1,240 / 16,832 / 0` | `3 / 5` | `95,219 / 2` | `16 / 142,281` | `0 / 0 / 0 / 0` |
| `default_worst_view` | `8,882 / 104,101` | `4,224 / 250 / 4,408 / 0` | `3 / 5` | `95,219 / 2` | `16 / 113,123` | `0 / 0 / 0 / 0` |
| `default_transition_overlap` | `17,702 / 112,921` | `8,640 / 554 / 8,508 / 0` | `3 / 5` | `95,219 / 2` | `16 / 121,943` | `0 / 0 / 0 / 0` |

The boundary is exactly `495` cap + `966` root/thatch + `93,758` cut-edge
triangles = `95,219` through two logical draws. Every row remains under
`200,000` combined triangles and 12 combined logical draws.

## Memory

JS heap is measured; renderer resources are measured; authoritative GPU
allocation bytes are explicitly not measured because WebGL does not expose
them.

| Row | JS heap used / total before → after (bytes) | Geometries / textures |
|---|---|---:|
| `quality_low` | `99,802,297 / 155,209,449` → `88,670,912 / 149,289,636` | `18 / 21` |
| `quality_default` | `118,756,395 / 161,522,643` → `101,384,534 / 169,275,138` | `20 / 21` |
| `quality_high` | `109,135,555 / 182,104,083` → `127,754,402 / 182,890,322` | `20 / 21` |
| `default_worst_view` | `92,187,021 / 156,015,337` → `87,732,329 / 156,277,481` | `20 / 21` |
| `default_transition_overlap` | `92,116,529 / 161,258,173` → `117,689,733 / 161,520,317` | `20 / 21` |

The recorded JS heap limit is `4,395,630,592` bytes.

## Visual equivalence and regression evidence

The final evidence manifest is
`tests/artifacts/screens/grass/ai537/evidence_manifest.json`. Its immutable
inputs are:

- continuous control:
  `tests/artifacts/screens/grass/ai537/continuous_control/capture_manifest.json`,
  SHA-256
  `507468622ae997e82915c33f1a677f3ff175e85c988ba9bd3365c24d37a493d9`;
- optimized:
  `tests/artifacts/screens/grass/ai537/optimized/capture_manifest.json`,
  SHA-256
  `ca24bb2909cd449f4757699f1ed5614848af84c43ceb2c95943bb9486c25ffc4`;
- final AI 362 regression:
  `tests/artifacts/screens/grass/ai537/final_ai362_regression/capture_manifest.json`,
  SHA-256
  `a4b82629297a35f64041b20874a4fe3e2b3a0cba351e1daf5e0142433236da5c`.

All `60/60` native-4K A/B pairs pass exact state alignment and pixel parity:
`43` are byte-identical and `17` differ only within the cross-context
WebGL rasterization tolerance. The worst pair changes `329` of
`24,883,200` RGB channels (`0.0000132218`) by exactly one integer; any
per-channel delta above one fails. Human review passes all seven final roles.

| Final role | Optimized native-4K PNG | Pixel result | Human review |
|---|---|---:|---:|
| Low grazing | `optimized/after_grazing.png` | 50 channels × ±1 | pass |
| Forward | `optimized/after_forward_close_billboard_center.png` | 1 channel × ±1 | pass |
| Three-quarter oblique | `optimized/after_strafe_start.png` | exact SHA-256 | pass |
| Top-down | `optimized/after_top_down.png` | exact SHA-256 | pass |
| Close/billboard handoff | `optimized/after_handoff_pair_close_billboard_auto.png` | 35 channels × ±1 | pass |
| Physical cut | `optimized/after_physical_cut.png` | 44 channels × ±1 | pass |
| Tree view | `optimized/after_tree_accent.png` | 30 channels × ±1 | pass |

The final AI 362 revalidation verifies all `114/114` PNG hashes and native-4K
dimensions and passes all `29/29` regressions. Functional, exact-coverage,
motion, cutoff, and native-4K gates are all true. Runtime errors are empty and
gameplay remains untouched.

## Rejected experiments

- RGBA8 lookup/material consolidation and shared ORM variants did not produce
  a stable all-row win and risked AI 358's separated PBR channel contract.
- Substrate removal, geometry-complement shortcuts, zero-metalness changes,
  and disabling grass shadow receipt changed required scene/material output;
  they were rejected even where an isolated timing moved.
- Ground/occluder reordering and a depth prepass were neutral or regressed at
  least one canonical row after variance review.
- Static shadow caching did not deliver a repeatable all-row approval result
  and added invalidation complexity, so it was fully reverted.

No rejected experiment remains in runtime source.

## Approval and downstream rule

The generated performance record passes all nine adapter checks with no failed
check and verifies as `valid: true`, `stale: false`. It becomes invalid if
the exact AI 362 approval bytes change. AI 363 is now the next sequence step
and may begin only while both scoped approvals remain current; it alone owns
gameplay integration.
