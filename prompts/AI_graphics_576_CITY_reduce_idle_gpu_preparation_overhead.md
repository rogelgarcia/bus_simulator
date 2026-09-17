# Problem

AI 572 reduced first-use texture/geometry stalls and fixed false sun-bloom
activation during camera turns. Its preparation system still incurs work after
nearby assets are ready: repeated city inspection and selection, per-draw resource
observation, readiness checks and effect dependency inspection.

The user requested a separate optimization task to reduce this ongoing overhead,
without losing preparation benefits or changing lighting/shadow quality.

# Request

Make completed nearby-resource preparation inexpensive during stationary and
warm-route gameplay. Resume preparation promptly when relevant scene, resource,
camera or effect state changes. Attribute the cost before changing behavior;
do not assume the entire measured FPS difference comes from one polling loop.

This is a new follow-up to completed AI 572, not a request to reopen it. Broader
ordinary rendering, receiver-validation and route-pacing investigation belongs
to `prompts/AI_graphics_575_CITY_sustained_route_frame_cost_and_pacing.md`.

## Evidence and starting point

Read:
- `prompts/AI_DONE_graphics_572_CITY_budgeted_nearby_gpu_resource_preparation_DONE.md`
- `specs/graphics/nearby_gpu_preparation.md`
- `src/graphics/visuals/preparation/NearbyGpuPreparation.js`
- `src/graphics/visuals/preparation/BloomResourcePreparation.js`
- `src/graphics/visuals/preparation/TextureResidency.js`
- `tools/gameplay_recording/README.md`

AI 572's original-route repeated comparison used three fresh Chrome processes per
side and three 2,518-frame laps per process. Hardware: RTX 3060 / ANGLE D3D11,
3520x1540 drawing buffer, DPR 2, current authored defaults, 90 stationary warm-up
frames, exact recorded bus/camera transforms and paused physics.

| Pooled metric | Before AI 572 | With AI 572 |
|---|---:|---:|
| Cold FPS | 52.63 | 51.69 |
| Warm FPS | 52.19 | 51.48 |
| Warm CPU median | 18.1 ms | 18.6 ms |
| Warm GPU median | 18.23 ms | 18.38 ms |
| Worst GPU frame across original-route laps | 72.62 ms | 33.60 ms |

The approximately 1.4% warm FPS decrease is an observed cohort difference, not a
guaranteed constant penalty. Additional-route baseline repeats demonstrated host
variation; compare against a fresh AI 572 baseline when implementing this task.
Scheduled preparation CPU was median/p99/max 0.1/0.3/0.7 ms warm. That diagnostic
does not include all visible-draw observation overhead; whole-frame CPU/FPS does.

Existing evidence is under `tests/artifacts/screens/ai572_nearby_resource_preparation/`:
`final-original-report.json`, `final-additional-report.json`, `final-image-comparison.json`,
and the `final-original-01` through `03` and `final-9xx-01` through `03` runs.
These generated artifacts remain gitignored. If unavailable, reproduce them rather
than treating the historical numbers as a new same-condition baseline.

## Implementation steps

- [ ] Measure the continuing work on stationary, fully prepared views and warm
  routes. Separate scanning/selection, queue execution, visible-draw observation,
  material/texture readiness and bloom dependency checks. Include allocation/GC
  evidence only when measured. Keep instrumented profiling separate from normal
  timing runs and distinguish scheduled CPU from total observer overhead.
- [ ] Avoid repeated scanning and selection when relevant coverage and scene
  state have not changed. Allow prepared stationary views to become quiet while
  promptly detecting new/replaced/moved objects and changed assets. Camera motion,
  rotation, reverse driving, fast turns and teleports must still prepare likely
  visible resources in time. Define and test any movement thresholds or bounded
  fallback discovery interval; merely extending all polling intervals is insufficient.
- [ ] Reduce redundant per-draw work for already-known geometry, materials and
  current texture allocations. Preserve source/sampler/version identity, material
  edits, shared ownership, visibility-miss handling and extra-residency accounting.
  Readiness caches must invalidate correctly; no stale references or permanent
  bypass that hides a later texture/geometry update.
- [ ] Avoid rebuilding/checking completed bloom preparation dependencies on every
  frame when their relevant state is unchanged. Preserve the final-camera emitter
  synchronization from AI 572. Settings changes, real sun visibility, resize,
  target/material recreation and context restoration must still behave correctly.
- [ ] Keep idle paths and diagnostics allocation-light where profiling justifies
  it. Preserve useful counters and explicit wake/invalidation diagnostics without
  moving expensive snapshot construction into ordinary gameplay. Do not add a
  background polling loop that survives city/engine disposal.
- [ ] Add focused behavioral regression tests for quiet prepared states and all
  relevant wake-up/invalidation cases. Update the preparation spec and this prompt
  with actual findings, changed files, choices and limitations.
- [ ] Run the repeated correctness/performance comparison below. Retain only
  measured improvements that preserve cold preparation effectiveness, image quality,
  resource ownership, startup behavior and memory bounds.

## Constraints

- Preserve lighting, shadows, texture resolution/mips, geometry/LOD, materials,
  culling correctness, exposure and tone mapping. No new bake is needed.
- Do not obtain a faster warm result by disabling preparation permanently, delaying
  visible objects, introducing placeholders, doing all work at startup, or moving
  first-use hitches to the next turn or activation.
- Preserve AI 572's current CPU/submission/queue/residency limits unless a measured
  change is justified and documented. Account for all preparation work, including
  observer cost outside the scheduled-work diagnostic.
- Retain safe disposal, city changes, cancellation, texture/material/geometry edits,
  context loss/restoration and resize. Never dispose borrowed resources merely to
  simplify caching or satisfy memory accounting.
- Keep graphics lifecycle code in `src/graphics/`, with minimal app integration.
  Follow project coding/testing rules and the existing selected-test runner.

## Validation and acceptance

1. Save evidence under `tests/artifacts/screens/ai576_idle_gpu_preparation/`.
   Screenshots, traces, raw samples, manifests and generated reports remain
   gitignored; track concise findings and reusable source/tests/specs only.
2. Baseline is the completed AI 572 implementation. Use identical hardware,
   resolution, settings, cameras, readiness gates and instrumentation on both sides.
   Run at least three fresh private Chrome processes per side, three laps each,
   on the original 0x120–0xAF5 route from
   `tests/artifacts/screens/baked_activation_stutter/route.busrec`. Preserve
   current-default settings, normal camera-stage replay and 90 stationary warm-up
   frames. Do not pre-drive the cold route or weaken bake readiness gates.
3. Include stationary controls at prepared poses such as 0x300 and a heavier view,
   plus repeated cold/warm 9xx-route checks around 0x672/0x689/0x98F and the older
   full approach to 0x25CE when effect behavior changes. Use several alternating
   before/after blocks where needed to distinguish a small improvement from system
   drift. Detect competing workloads; never terminate user applications.
4. Test stationary object insertion/replacement/movement, material/texture/source
   changes, geometry mutation, slow motion, reverse/fast turns, teleport, disposal,
   city reload, context loss/restoration, effect settings changes and resize. New
   required work must wake without a manual refresh; visible misses must render
   correctly and immediately. Sleeping must not mean stale scene state.
5. Preserve fixed-pose image equivalence and legitimate visible/occluded sun
   behavior. Check that false bloom at 0x98F/0x25CE remains fixed. Compare first-use
   events and the whole route so a removed idle cost does not conceal shifted hitches.
6. Report CPU/GPU median, p99, maximum and slowest-1% mean; actual frame interval/FPS;
   large excursions; calls, triangles, geometries, textures and programs; scheduled
   preparation and observer CPU; scans/selections/readiness checks, wakeups, misses,
   uploads and allocations; extra memory and startup costs. Verify visible-page
   status, stable baked generation and submission-matched valid GPU samples.
7. Success requires demonstrably quieter prepared states and a reproducible
   reduction in avoidable work without cold-route or quality regressions. If the
   FPS change is within noise, say so and report the attributable CPU/work reduction;
   do not claim the full previous 1–2% has been recovered without evidence.

## On completion

- Mark this AI document DONE in the first line and rename it to
  `prompts/AI_DONE_graphics_576_CITY_reduce_idle_gpu_preparation_overhead_DONE.md`.
- Keep it in `prompts/`; do not archive automatically or alter AI 572's completed
  checklist to describe this follow-up.
- Add a high-level one-line summary for each change and its relevant file paths.
- Include a same-condition before/after performance table with hardware, resolution,
  settings, workload/cameras, warm-up, sample counts and statistics. Distinguish
  logical memory estimates from measured residency. Mark unavailable metrics
  `not measured` with reasons; projections are not completion results.
- Document any remaining overhead and unsupported cases, and link saved visual evidence.
