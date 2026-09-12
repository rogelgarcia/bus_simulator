# Problem

The optional baked-shadow mode is approximately 1 ms faster than the current
single/high shadow mode in the user's preliminary gameplay observation, but its
fixed `0.04150390625 m/texel` static cache is visibly coarser than the closest
cascade/high region, especially on foliage and other fine silhouettes. Loading
a uniformly higher-resolution city bake would multiply an already large
publication and resident texture, while the existing shared moving-object map
must continue to support self-shadowing and interactions between multiple
vehicles.

The runtime therefore needs a mixed resolution and residency policy that spends
static-shadow data and dynamic-shadow rendering only where they affect visible
receivers, without camera-dependent offline cascades, missing offscreen
occluders, LOD seams, bright fallback frames, or loss of the measured
performance advantage.

# Request

Design, implement, and validate a streamed multiresolution hybrid-shadow mode
for the existing AI 531 static cache, AI 532 generic moving-object layer, and
AI 535 runtime integration. Preserve the world-space offline cache for static
casters, add seamless receiver-driven resolution selection and bounded
residency, and independently right-size the real-time dynamic map for the
player bus and other interacting moving objects.

Treat the user's approximately 1 ms baked-versus-single/high result as a
preliminary observation, not final evidence. Reproduce it under controlled
same-condition measurements before using it as a performance baseline.

## Incremental progress — 2026-09-04

- Implemented the separately requested moving-object resolution control under
  Baked lighting. Medium preserves the current shared `2048 x 2048` map at
  `0.025 m/texel`; High uses `4096 x 4096` at `0.0125 m/texel`, preserving the
  approximately 51.2 m square coverage while doubling linear resolution.
- The control applies generically to the shared dynamic map used by the player
  bus and any other object registered through `registerDynamicIlluminationObject`.
- The independently owned dynamic target is rebuilt without evicting the
  static baked package or prepared receiver materials.
- All static multiresolution, paging, residency, transition, and controlled
  performance work in this prompt remains open.

## Execution boundaries

### Implemented prototype — 2026-09-11

- Added native detail-page generation, conservative shared-guard consolidation,
  integrity checks, recorded-route review and an original-shader control under
  `tools/bake_lighting/shadows/streamed/`, registered with `node tools/bake.mjs`.
- The calibrated 55-degree prototype has 56 pages around the supplied camera/bus
  pose, 1.7578125 cm texels, 1020-square interiors and 141-texel guards. Seven
  pages are empty. Its compressed payload is 8,257,797 bytes; generation took
  31.6 seconds. All 35,614,908 post-consolidation shared samples agree exactly.
- Added a bounded 16-layer GPU pool, two fetch/decode worker requests, one upload
  per frame, hashed compressed/raw data, receiver-footprint selection, predicted
  travel, retirement/arrival fades, valid parent fallback and lifecycle cleanup.
- The complete parent remains resident in this first prototype. The detail pool
  adds approximately 51.8 MiB, for approximately 500 MiB combined logical static
  texture storage. This is **not yet** the planned smaller coarse/far residency.
- Normal gameplay compiles the original shader. An explicit
  `streamedShadowPrototype=1` session exposes the experimental toggle. Local
  experiment packages can be selected with `streamedShadowIndex`; no streaming
  package has been installed into the production asset index.
- The stationary and recorded-route harness compares three paired passes in each
  of two fresh browsers and deliberately corrupts page responses. It uses current
  defaults for both variants and joins route GPU timings by submission number.
- Current evidence lives under `tests/artifacts/screens/illumination_547/`.
  `pages-02` is the validated native package. The first filtering version was
  rejected for jagged wall edges; it was replaced by bilinear visibility filtering.
  Initial corrected route measurements show a GPU/frame-submission regression,
  so this is not a production performance win or a completed AI 547.

Remaining acceptance work: improve route cost; evaluate and integrate the smaller
coarse/far parent; compare Current single/high and filtered silhouette quality;
cover two movers, dynamic fitting/clustering, context loss and moving LOD image
continuity; then decide whether the full-city/profile production bake is warranted.

Final prototype validation: `tests/artifacts/screens/illumination_547/review-04/`
and framework run `run-1789152991662-1876-05019b17` passed with source files held
fixed. Six paired 929-frame route laps across two fresh Chrome sessions measured
the following means of per-lap medians at 1920 x 1080 on the RTX 3060:

| Mode | Whole-render GPU | Frame-submission CPU wall time | Frame interval |
| --- | ---: | ---: | ---: |
| Existing baked map | 12.88 ms | 17.15 ms | 18.23 ms |
| Streamed detail | 13.38 ms | 17.28 ms | 18.38 ms |

These are paired whole-frame measurements on shared hardware, not isolated shadow
pass times or a certified win over Current single/high. Individual page upload
submission was at most 0.6 ms in the stationary checks. Detail textures returned
from 104 to 102 after disabling; corrupted page data left baked mode active with
zero corrupt resident pages. The complete parent still consumes 448 MiB.

A decoded-page queue regression was reproduced and fixed: pages now wait for
protected slots instead of being discarded and fetched again. Across the same
six laps, request increments fell from 803–826 to 32–39. The browser regression
test and normal parent-shader render test pass, as do 25 focused unit/framework
checks. Generation took 31.6 seconds; final repeated runtime validation took
470.3 seconds. Normal gameplay retains its original shader and streaming is off.

### September 11 calibration follow-up

Additional quality investigation: the regular calibrated map remains 5.2734375 cm
per texel versus the historical 35-degree map's 4.150390625 cm. The user explicitly
wants finer shadow detail restored. Two actual-GLSL regressions were reproduced
and corrected in the parent and streamed filters: per-texel receiver-plane
comparisons and a centre-blocker bound on the contact-shadow search. Clear-slope,
near-blocker and distant-penumbra browser checks pass. Evidence and research notes
are in `specs/graphics/static_sun_depth_cache.md` and
`tests/artifacts/screens/shadow_filter_quality/`. These filtering fixes apply in
normal gameplay, but they do not complete the finer-map rollout or change this
prompt's remaining acceptance work. Do not report the normal game's map as 1.76 cm;
that resolution remains confined to the explicit prototype.

The user requested implementation after the calibrated shadow-density review.
Use the exact calibrated 55-degree sun as the first prototype. The installed
shadow package and its authenticated descriptor are the baseline authority;
historical 35-degree dimensions below are planning history, not current inputs.
Keep the existing non-streamed baked mode available for comparisons. Add a
separate prototype toggle and retain a complete authenticated coarse fallback
before making any fine page visible. Do not make streaming the default before
the image, lifecycle, residency and repeated route benchmarks pass.

The first prototype must bake true finer static depth; splitting or upscaling
the existing image alone does not improve silhouette resolution. Reuse the
existing indirect maps. Store all new tools under the shared bake hierarchy and
all prototype evidence under `tests/artifacts/screens/illumination_547/`.

- Build on the existing static/dynamic visibility composition. Do not rebake
  moving objects; their positions are runtime state.
- Keep the legacy single/CSM shadow-map pass disabled while baked mode owns the
  sun-shadow term. The separately owned dynamic moving-object pass remains
  active.
- Do not change baked direct light, indirect light, GI, or AO policy owned by
  AI 533/534.
- Prototype one representative exact sun profile before scheduling all eight
  production profiles. Do not launch a full production rebake until the page
  format, quality, residency, and performance result are accepted.
- Current mode and all saved legacy shadow settings must remain unchanged and
  immediately restorable.

## Current measured geometry and planning values

Use these as design inputs and verify them from the authenticated descriptors
before implementation:

- Current static pitch: `0.04150390625 m/texel`.
- Two-times linear resolution: about `0.020751953125 m/texel`; this is still
  materially coarser than the approximately `0.012 m/texel` closest
  cascade/high observation.
- Three-times linear resolution: about `0.0138346354 m/texel`; this is the
  preferred first near-page prototype and is about 15% coarser than that
  cascade/high observation.
- Four-times linear resolution: about `0.0103759766 m/texel`; do not adopt it
  before the three-times prototype proves insufficient.
- Half linear resolution: about `0.0830078125 m/texel`; this is a coarse/far
  fallback candidate.
- Elevation-35 profiles currently use an `11 x 7` layout: 77 base tiles.
- Elevation-8 profiles currently use an `11 x 3` layout: 33 base tiles.
- A current guarded RG8 tile is `1878 x 1829`, about 6.55 MiB.
- Subdividing each base tile 3 x 3 creates 693 virtual near pages for an
  elevation-35 profile and 297 for an elevation-8 profile. These are virtual
  disk/page-table counts, not intended simultaneous residency.
- A roughly 50 m near region geometrically touches about 16 three-times pages;
  filtering borders, hysteresis, and travel-direction prefetch may raise the
  working set to roughly 25-36 pages, or about 105-236 MiB at the current page
  dimensions. These are projections to validate, not final measurements.
- A full elevation-35 half-resolution fallback is projected near 127 MiB.
- The current dynamic layer uses one `2048 x 2048` map at `0.025 m/texel`,
  providing about 51.2 m of fixed square coverage and approximately 32 MiB of
  modeled color-plus-depth target storage.

## Static-shadow outcomes

Tasks:

- Replace the monolithic all-tiles residency assumption with authenticated,
  independently fetchable and uploadable shadow pages plus a bounded physical
  GPU page pool. Page identity, hashes, sun/city/profile identity, format,
  guards, and lifecycle ownership must remain fail-closed.
- Provide a guaranteed coarse parent/fallback for every supported receiver
  coordinate before a finer page may activate. A missing, corrupt, late, or
  evicted fine page must fall back to valid coarser visibility, never to an
  unshadowed bright result.
- Prototype a three-times near level, retain a middle level where needed, and
  evaluate a half-resolution far level. Do not claim equivalence with
  cascade/high solely from nominal texel pitch; validate final filtered
  silhouettes and motion.
- Select static LOD per receiver fragment using projected footprint or an
  equivalent screen-error rule. Raw camera distance may be an input but must
  not be the only quality measure.
- Allow a bounded per-receiver/object LOD bias so the player bus can request
  high-resolution static shadows received from buildings and foliage. Large
  terrain, road, and building meshes must not be forced to one LOD for the
  whole object.
- Permit one object to cross multiple resolution regions. Same-LOD page guards
  must prevent tile seams, and cross-LOD transitions must blend validated
  visibility results rather than averaging encoded depths. Use a bounded
  transition band and hysteresis so driving does not create pops or page
  thrashing.
- Keep permanent dual-resolution sampling out of the normal path. If seamless
  transitions require sampling both levels, limit the extra work to the
  transition region or validate a stable single-level stochastic alternative.
- Preserve physical filter width, alpha-cutout semantics, bias behavior,
  receiver eligibility, light-space phase, and conservative no-light-leak
  behavior at every level. Coarse depth reduction must be conservative for the
  channel's depth convention; ordinary averaging is invalid.

## Visibility-driven residency outcomes

Tasks:

- Request fine pages from visible receiver coverage transformed into the
  static light-space grid. Do not request pages merely because their caster
  objects are visible, and do not discard an offscreen caster that projects a
  shadow onto a visible receiver.
- Keep a small resident page table containing availability, physical-layer
  mapping, LOD, integrity state, occupancy/empty state, and fallback ancestry.
- Avoid fetching and uploading authenticated pages known to be empty. Verify
  that empty-page metadata is independently covered by the package identity
  and cannot create false-lit results.
- Conservatively include the camera frustum/visible receiver footprint,
  filtering borders, elevated receivers, and sun-projected coverage needed for
  the final on-screen samples.
- Prefetch in the bus's predicted direction of travel, retain recently used
  pages with hysteresis, and use a bounded deterministic eviction policy.
- Expose page requests, hits, misses, fallbacks, evictions, empty-page skips,
  fetch/hash/decode/upload timings, CPU bytes, GPU pool bytes, and peak
  residency in diagnostics.
- Prove that page streaming does not introduce main-thread stalls, partial
  activation, use-after-dispose, stale-profile sampling, or unbounded network,
  disk, CPU, or GPU working sets.

## Dynamic moving-object outcomes

The dynamic map is not baked. It must continue to provide:

- moving object to static world shadows;
- static baked shadows received by moving objects;
- moving object self-shadowing; and
- moving object to moving object shadows, including two buses interacting.

Tasks:

- Keep the generic `registerDynamicIlluminationObject` cast/receive contract
  and make future vehicle/character/prop integration use one documented
  registration path that also preserves Current-mode CSM receiver setup.
- Evaluate higher resolution for the player bus independently of static-cache
  resolution. Distinguish reducing map pixel dimensions from reducing its
  world-space coverage: lower pixel dimensions can reduce clear/raster/fill
  cost, while the same pixel dimensions over a smaller area improve quality
  but do not by themselves reduce pixel work.
- Test the existing 2048 map with a finer density near `0.0125 m/texel` when
  its required sun-projected interaction extent fits roughly 25.6 m. Low sun,
  tall moving objects, and long projected shadows must expand or reshape the
  required coverage rather than clip.
- Do not default to a 4096 map merely to retain 51.2 m coverage at double
  linear resolution; it has four times as many pixels and modeled target
  storage near 128 MiB. Require measured justification.
- Prefer one tightly fitted local map for the player and nearby interacting
  movers. Partition widely separated movers into deterministic interaction
  clusters or atlas regions so distant traffic does not dilute the player's
  resolution. Objects whose shadows can reach each other must compose
  correctly even when clustering is active.
- Conservatively cull or lower the quality of a dynamic caster only when its
  sun-extruded shadow volume cannot affect visible receivers. Being outside
  the camera frustum alone is not sufficient.
- Evaluate a small contact/detail technique for tires and close underbody
  detail only if it is cheaper and more stable than increasing the entire
  dynamic map. It must not double-darken the same sun visibility term.
- Expose dynamic target dimensions, world density/extent, cluster inventory,
  caster draws/triangles, clear/raster GPU time, receiver sampling time, and
  target memory in diagnostics.

## Performance questions the implementation must answer

- Determine whether smaller static physical pages improve whole-frame time or
  primarily reduce download, validation, upload, and memory pressure. Static
  page dimensions do not automatically reduce visible-fragment sample count.
- Determine whether lower-dimension dynamic targets improve performance.
  Halving both dimensions quarters target pixels and should reduce clear/fill
  work, but does not reduce caster vertex work or CPU draw submission; measure
  each component.
- Determine whether visible-receiver/empty-page streaming improves steady GPU
  time, transition latency, and memory on the target hardware. It is expected
  to reduce resident/uploaded data and may improve texture-cache behavior, but
  page-table indirection, misses, uploads, and LOD blending may offset the
  gain.
- Determine whether dynamic shadow-volume culling or cluster resolution
  selection reduces dynamic pass work without missing offscreen casters whose
  shadows enter the frame.
- Retain a statistically credible whole-frame advantage over Current
  single/high. Do not promote based only on lower bytes, draw calls, triangles,
  or a noisy approximately 1 ms sample.

## Validation and evidence

Tasks:

- Capture same-condition Current single/high, existing baked, and streamed
  baked results at the same camera, sun profile, resolution, graphics options,
  warm-up, and sampling window.
- Include foliage edges, window/facade silhouettes, the player bus receiving a
  static tree/building shadow, the bus casting onto the world, bus self-shadow,
  two moving objects shadowing each other, LOD boundaries, rapid driving, and
  camera rotation.
- Add deterministic tests for page addressing, fallback ancestry, conservative
  coarse reduction, page integrity, empty metadata, residency bounds,
  prefetch/eviction, LOD hysteresis, transition continuity, dynamic clustering,
  long low-sun coverage, mode switching, context loss, and teardown.
- Put screenshots, comparison images, page visualizations, traces, and reports
  under `tests/artifacts/screens/illumination_547/`; do not commit generated
  artifacts.
- Screenshot comparisons are human verification evidence, not authorization
  for scenario-specific shader or map patches. When a visual run first fails,
  show that first failure in the chat; after it passes, show the final result.
  Do not post every intermediate attempt.
- Report both absolute and relative results for CPU frame time, GPU frame time,
  FPS, static receiver shader time, dynamic shadow pass time, draw calls,
  triangles, texture fetch policy, page misses, switch/upload stalls, resident
  CPU/GPU bytes, and peak memory. Record hardware/browser, resolution/settings,
  workload/camera, warm-up, sample count, statistic, and variance.

Acceptance requirements:

- Current remains visually and behaviorally unchanged and restores within one
  frame with fresh legacy maps.
- Streamed baked mode never renders a partial, stale, corrupt, or silently
  unshadowed page state.
- Near static quality is materially closer to cascade/high than the current
  bake, without visible same-LOD seams, cross-LOD seams, driving pops, or
  persistent dual-LOD shader cost.
- The player and at least one second moving object cast and receive correct
  static/dynamic/self/mover shadows.
- Runtime residency is bounded and materially below loading all near/middle/far
  pages simultaneously.
- The final same-condition benchmark retains a statistically credible
  whole-frame win over Current single/high and does not regress the existing
  baked mode without an explicitly approved quality/performance tradeoff.

## On completion

September 11 follow-up acceptance work:

- [x] Remove the visible bands within the left building's broad shadow in the
  streamed platform pose; retain the smooth Cycles/previous-parent transition.
- [ ] Correct the right building ledge's streaks without hiding them with broad
  blur. Both legacy filtering and finer pages still exhibit this defect.
- [x] Recover the shadow-filter performance budget before promotion. The
  registered `/toggle-review` with `benchmark=true` isolates Single/High,
  finite-sun baked and old-filter baked on identical current maps. Preserve
  all passes and report shared-machine timing spikes. Evidence is under
  `tests/artifacts/screens/shadow_filter_quality/benchmark-06/` and
  `historical-review-07/`. This is not a historical-checkout benchmark.

September 11 rollout: complete 55-degree native detail is installed, with 1.76 cm
texels and a bounded 16-page pool. Filter/guard/source/publication evidence is in
`tests/artifacts/screens/illumination_547/city-12/` and `city-review-16/`; published
manifest `2528f4de63eb625a3a611f21aa079bf4dbc6e49c69121abc349955f9d10733ca`.
Six fresh/warm stationary passes measured 11.26-11.48 ms GPU with detail, versus
12.97-13.29 ms for the older same-map filter reference. Six recorded route passes
measured 11.41-11.62 ms. Broad shadow bands are removed; very close ledge texel
aliasing remains visible despite the substantially narrower fringe. Keep the
ledge item and broader far-parent/dynamic-cluster milestones open. This is not
completion of the full AI 547 scope.

- Mark the AI document as DONE in the first line.
- Rename it to
  `prompts/AI_DONE_547_ATMOSPHERE_streamed_multiresolution_hybrid_shadows_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the offline page generator/package
  changes, runtime page pool and LOD selection, dynamic-map policy, diagnostics,
  tests, reports, and final screenshots.
- Include a same-condition before/after performance table covering Current
  single/high, the pre-AI-547 baked mode, and the final streamed hybrid mode.
  Report measured frame time and FPS plus pass timing, page/residency metrics,
  upload/switch behavior, and CPU/GPU memory. Mark unavailable metrics as
  `not measured` with a reason; projections in this prompt are not final
  measurements.
