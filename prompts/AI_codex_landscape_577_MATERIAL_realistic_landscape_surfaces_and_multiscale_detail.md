# Problem

The coastal landscape foundation from AI 576 is complete. Navigation, structured
terrain data, AI edits, geometry/appearance streaming and inspection work, but
the rendered landscape still has visibly stepped material boundaries and repeated
texture patterns. It must become convincing both at the game's point of view and
from a distant city-planning overview, with bounded resource use.

The current source samples are 1.953125 meters apart. Natural infill of imported
planning areas uses the 15.625-meter overview. Neither interpolation nor a larger
texture is additional measured source detail. Current texture tiers stop at 512
pixels, and the near/macro treatment repeats the same material at two scales.

The D1 review exposed a separate asset problem: several repeating textures already
contain contrasting dirt, grass, stones, bare patches or broad tonal changes inside
one tile. Repeating those distinctive patches creates recognizable landscape
patterns even when the material boundary itself is smooth. The accepted sand is
the reference for a visually even base material. Base tiles should describe one
homogeneous material with fine physical surface detail, without recognizable
patches or broad color changes; terrain coverage should decide where different
materials occur. Ordinary alpha blending also makes boundaries look like two
surfaces fading through each other instead of physically interleaving.

# Request

Develop the existing landscape surface system through the dependency-ordered
deliverables below. Keep all work and its completion record in this AI. Preserve
terrain authority, editing, immutable saved revisions, city bindings, nature-only
presentation and bounded camera/zoom-aware streaming. Deliver an inspectable,
visually verified improvement at each step rather than postponing verification.

## Execution and scope

- Implement one deliverable at a time, using subagents with maximum reasoning.
  Verify and commit each completed deliverable before proceeding. D1 and the
  corrective D1a step are complete. D2–D6 are complete. Leave D7 pending for a later
  pass; D7 is next.
- Use port 8002 for the worktree server, never 8001. Isolated automated fixture
  servers may use temporary OS-assigned ports. Open a renderer only for verification
  and captures, and close it after the run to release GPU resources.
- D1 must provide four matched before/after views of the actual coastal terrain.
  Capture the original four images before changing runtime behavior. Preserve
  their four matching after images and present comparisons in the handoff.
- Store all generated images, capture receipts, logs and performance data under
  `tests/artifacts/screens/landscape/ai577/<deliverable>/`; keep them gitignored.
- Follow `ai_rules/PROJECT_RULES.md`, coding/testing rules and canonical landscape
  specifications. Do not reopen or change completed AI 576.
- Any offline preparation must use the registered `node tools/bake.mjs` hierarchy
  and shared local configuration, with validation and publication gates intact.
- Use CC0 material sources when new imagery is needed, with original source URLs,
  author/license, physical dimensions and hashes retained. Do not silently change
  other materials or claim the entire coastal source package is CC0.
- Keep this work compatible with later asphalt, roads, buildings, vegetation and
  props. Do not place city objects or implement city construction in this AI.
- User direction, 2026-10-03 (during D2): achieve realism first; memory and
  performance requirements are flexible until D6 optimizes them. The shipped
  landscape budget becomes 384 MiB controlled CPU / 192 MiB estimated GPU in D2 and
  512 MiB / 256 MiB since D4 (measured geometry starvation at 384/192), with the
  unchanged 8 MiB per-frame upload cap. Allocations stay accounted and measured;
  before/after comparisons match budgets within each profile, and the historical
  128/64 MiB profile is retained for continuity.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Continuous coverage and antialiased transitions | Existing landscape | Material boundaries stop exposing coarse square cells and remain stable as the camera moves and zooms. |
| D1a. Homogeneous base materials and smart transitions | D1 | Repeated tiles no longer contain conspicuous mixed-material patches; material relief controls boundary interleaving. |
| D2. Local surface detail pages and material height blending | D1a | Finer authored/procedural boundaries and physical-looking material interleaving stream independently of geometry. |
| D3. Non-repeating material sampling | D2 | Ground materials lose obvious periodic patterns without losing contrast or directional coherence. |
| D4. Distinct macro, local and micro detail | D3 | The same landscape retains believable physical scale and detail from game POV to overview. |
| D5. Terrain-driven natural appearance and lighting | D4 | Materials, shore transitions and illumination form a coherent natural landscape. |
| D6. Profile-guided surface caching | D5 | Expensive surface work is cached where measurements justify it, within explicit budgets. |
| D7. Integrated quality and resource acceptance | D6 | Documented visual quality, editing compatibility, stable streaming and measured performance across the coastal landscape. |

### D1. Continuous coverage and antialiased transitions

- [x] Define a versioned visual coverage recipe/model separate from authoritative
  land-cover and semantic soil. Declare material ordering, world units, source
  binding/revision, reconstruction/filtering parameters and resource limits.
- [x] Replace category-cell response interpolation with normalized continuous
  material coverage and filtering based on projected surface footprint. Keep
  discrete IDs unfiltered. Analytic reconstruction is acceptable where it provides
  bounded sub-cell evaluation; label it derived visual detail rather than a finer
  measured raster, and record its source limits.
- [x] Remove the obvious stepped grid appearance at coastal sand/grass and other
  natural boundaries, without turning every transition into a wide blurry band.
  Boundary treatment must use world-space parameters and preserve narrow features
  as far as the source and requested footprint allow.
- [x] Preserve continuity at mask/tile borders, parent-child changes and mixed LOD;
  keep view-dependent detail and material residency independent of mesh density.
  Verify fixed-position perspective and orthographic zoom as well as movement.
- [x] Preserve authoritative heights, imported cover, explicit soil edits, exact
  queries and old saved-revision material bindings. Preserve natural presentation
  of planning-only areas. Do not change texture assets/patterns in this step.
- [x] Account for new source/halo/scratch/resident CPU and GPU bytes, upload work,
  sampler requirements and any additional worker requests. Retain coarse coverage,
  cancellation, failed-request diagnostics, low-budget behavior and release.
- [x] Verify the real terrain and focused synthetic boundary/seam/coverage cases.
  Capture four identical-camera before/after views and a same-condition performance
  comparison, inspect the images, document limitations, and commit D1.

### D1a. Homogeneous base materials and smart transitions

- [x] Audit every active natural landscape material at one-tile and repeated
  landscape scales. Document which sources contain mixed soil/grass/stone regions,
  recognizable features or broad tonal islands that reveal repetition.
- [x] Replace unsuitable landscape bindings with homogeneous single-material
  sources. Keep fine grain/blade/mineral detail, coherent normal/roughness/height
  response and plausible physical scale, while removing recognizable mixed patches
  and broad or subtle tile-scale color changes. Preserve the accepted sand material.
  Larger natural variation belongs to landscape data, not a repeating base tile.
- [x] Use retained CC0 sources where downloads are necessary, record original URLs,
  licenses, source dimensions and hashes, and install runtime assets in the game.
  Use the registered bake/publication hierarchy, preserve old immutable revisions
  and avoid changing unrelated users of shared material assets.
- [x] Replace ordinary coverage-only alpha blending with coverage-constrained,
  material-height-aware transitions: raised material features remain visible while
  lower areas fill with the neighboring material. Keep weights normalized and
  support bounded so absent materials cannot appear outside their coverage.
- [x] Filter height competition by projected footprint and texture residency to
  prevent sparkling or popping at distance. Apply the same resulting weights to
  base color, normals and surface properties; retain tile/LOD seam continuity,
  source semantics, query behavior and existing CPU/GPU/upload budgets.
- [x] Verify source selection visually, render four matched before/after views,
  test the new blend against ordinary alpha blending and exercise streaming,
  old bindings and low-memory behavior. Record measurements and limitations under
  `tests/artifacts/screens/landscape/ai577/d1a/`, close verification browsers, then
  commit this step. Do not mark the fine terrain detail pages or stochastic
  anti-tiling deliverables complete as part of this correction.

### D2. Local surface detail pages and material height blending

- [x] Add independently addressed fine surface coverage/detail pages where D1's
  analytic reconstruction is source-limited. Evaluate a 25–50 cm near-camera
  coverage target, while retaining coarser coverage elsewhere and bounded residency.
- [x] Retain reproducible authored/procedural boundary inputs, revisions and seeds;
  distinguish generated detail from original imported measurements. Raster
  upsampling alone must not be presented as new source fidelity.
- [x] Integrate D1a's material micro-height competition with fine coverage pages,
  producing soil in rock gaps, irregular grass edges and plausible sand transitions.
  Normalize weights robustly, preserve a valid base layer and coherent
  normal/roughness response across independently arriving surface pages.
- [x] Provide filtered hierarchy levels and neighborhood context sufficient for
  seamless borders; edits invalidate only affected pages and their dependencies.
  Fine surface streaming must remain independent of geometry/source query leases.
- [x] Validate before/after edge quality, narrow features, all LOD/zoom transitions,
  cold loading, failures, repeated travel, editing and memory/upload bounds.
- [x] Apply the realism-first direction: ship the 384/192 MiB profile and size fine
  page capacity for quality. Report measured memory, frame cost and geometry-LOD
  differences for the realism and historical 128/64 MiB profiles, and leave
  reductions to D6.

### D3. Non-repeating material sampling

- [x] Add deterministic world-anchored stochastic patch sampling/blending to natural
  materials, maintaining coherence across base color, normals, ORM and micro-height.
- [x] Preserve color distribution and contrast through blending and mip selection;
  compare histogram-preserving methods with cheaper alternatives using visual and
  GPU evidence. Correct derivatives and tangent normals under transforms.
- [x] Preserve directional structures such as beach ripples through constrained
  rotations/orientation. Avoid obvious patch edges, ghosting, swimming and new grids.
- [x] Keep expensive sampling limited to contributing layers and useful detail.
  Measure shader cost with otherwise identical coverage, cameras and assets.

### D4. Distinct macro, local and micro detail

- [x] Separate unique landscape-scale variation, local material patches and close-up
  micro detail. Keep physical feature sizes stable as viewing distance changes.
- [x] Supply suitable CC0 material sources and finer streamed tiers where measured
  texel density requires them; source quality, page encoding, compression, decoding
  and GPU residency must have explicit capability and fallback contracts. Retain
  D1a's homogeneous base-tile requirement when adding or replacing any material.
- [x] Transition contributions using projected footprint, filtering and hysteresis
  for perspective movement/FOV and orthographic zoom. Avoid magnified pebbles/ripples.
- [x] Add appropriate projection for steep surfaces and assess limited near-camera
  displacement only where it improves silhouettes/contact without corrupting
  authoritative terrain or collision expectations.
- [x] Compare near, intermediate and aerial views for scale, texture repetition,
  sharpness, temporal stability, page seams and budget behavior.
- [x] Request each material's tier from the texel density of the visible pages where
  that material occurs, not from the nearest page of any material, and fit the tiers
  to the appearance budget level by level. A constrained profile must never leave a
  visible material at its coarse fallback while others hold 1024 tiers (measured at
  384/192 during D4: the rock close-up bound rock at 32 pixels against HEAD's 512).

### D5. Terrain-driven natural appearance and lighting

- [x] Derive broad variation from meaningful terrain properties such as slope,
  exposed rock, moisture, flow and sediment deposition, with restrained noise.
  Bake operations requiring global context before local detail processing.
- [x] Improve beach wet/dry transitions and land-water integration while preserving
  sea level, submerged terrain and source semantics. Separate visual treatment from
  any future hydrology simulation or water physics.
- [x] Integrate consistent game illumination, terrain shadows and atmospheric depth
  as supported by the renderer, with explicit cost and graceful quality reduction.
- [x] Define natural dressing inputs for later grass, rocks and vegetation so their
  distribution agrees with soil/coverage; actual large-scale prop placement remains
  separately scoped. Optional Gaea imports must use retained interoperable maps and
  provenance, not introduce a mandatory proprietary runtime dependency.
- [x] Validate varied lighting/view conditions and source/authoring compatibility.
- [x] Replace the 15.625 m nearest-overview natural infill of planning-only areas, visible as
  large stair-stepped forest/grass outlines in aerial views beyond fine-page range (observed
  in the D3 baseline `rep-aerial-oblique`), with terrain-driven natural inference that stays
  consistent across native and generated levels.
- [x] Remove the ~1.3 m hexagonal light/dark grass patches that a low sun exposed in D3
  stochastic sampling (each patch turned the page's leaning normals toward another azimuth),
  keeping D3's repetition metrics.
- [x] Calibrate natural material response under the game's physical lighting: landscape-local
  albedo calibration against physical reference ranges (the first D5 lighting pass rendered
  pale grass and near-white rock), back-scattering rather than forward sheen for dry rough
  ground, and terrain-scale ground bounce so backlit slopes do not turn blue.

### D6. Profile-guided surface caching

- [x] Profile combined material evaluation and streaming. Decide from measured
  evidence whether a generated surface-page cache is justified; record a reasoned
  no-cache outcome if its costs exceed demonstrated benefits.
- [x] If justified, cache reusable material properties independently of camera
  lighting/view, with page identity, recipe/material/source revisions, gutters,
  filtered levels, generation scheduling, invalidation and bounded CPU/GPU storage.
- [x] Keep coarse fallback, camera-motion prefetch, zoom response, cancellation and
  publication ordering explicit. Later roads/decals must have an extension contract.
- [x] Compare uncached/cached quality, frame/GPU time, generation/upload spikes,
  bytes, latency and edit recovery under identical conditions.
- [x] Reduce the costs D4–D5 accepted for realism: the cold terrain program compile grew from
  5.5 s (D4) to 12–20 s on a fresh browser profile (D5), and D5 lighting, terrain fields,
  response and terrain appearance add +1.7 to +5.5 ms GPU at the four AI577 views (up to
  +6.1 ms elsewhere; medium and aerial views now exceed 16.7 ms). Keep the D5 appearance, or
  report each measured trade-off.

### D7. Integrated quality and resource acceptance

- [ ] Verify a saved/editable coastal landscape from game POV, oblique travel,
  steep ground, shoreline and distant overview, with stable appearance through
  movement, FOV/zoom changes, pause, reload and repeated visits.
- [ ] Exercise source/soil edits, pinned old revisions, natural planning infill,
  seam consistency, corrupt/delayed requests, low budgets and complete disposal.
- [ ] Decide the runtime surface cache default after a visual review of motion: the D6 cache
  (opt-in, 512/448 MiB) cuts terrain GPU time 56–67% at 1920×1080 within 0.4–0.9 sRGB bytes,
  but its 2,816 slots truncate outer rings at 4K and fast motion or zooms show coarser
  fallback pages. Scale its slots with the viewport and measure 1440p and 4K before enabling it.
- [ ] Restore `landscape_large_editing`: its city fixture still pins the AI 576 revision
  `hierarchy-afaf934…`, so setup fails since the D1a material-only publication. Re-pin
  deliberately or rework the check around immutable snapshots, keeping strict-pin refusal.
- [ ] Publish actual visual comparisons and reproducible same-condition benchmark
  results, quality profiles, limitations and canonical data/recipe references.
- [ ] Keep all prior deliverables checked only when their gates pass; mark this AI
  DONE only after D1, D1a and D2–D7 are complete. A partial handoff is not completion
  of this AI.

## Evidence and measurements

- Use real screenshots from the renderer. Four D1 views must include close game POV,
  an oblique beach edge, a top-down boundary and a wider view showing continuity.
  Match camera, projection, resolution/DPR, material bindings, lighting and budget
  between before/after. Retain originals and capture metadata.
- For material-replacement steps such as D1a, retain both binding snapshots and
  change only the declared source/processing/transition inputs. Match physical
  cameras, rendering settings, material residency tiers and resource budgets.
- Measure frame time/FPS, available GPU time, draw calls/triangles, controlled CPU
  buffers, estimated GPU allocations and upload/load behavior. Identify hardware,
  browser, viewport, quality, warm-up, sample count and statistics. Report missing
  metrics as not measured with a reason; never substitute projections.
- Test coverage values, normalization, source/semantic preservation, page/LOD seams,
  footprint behavior, resource admission and release. Visual review must check for
  blur, unnatural boundary movement, lost features, visible periodicity and shimmer.
- Compare performance under identical conditions at each step. Prior AI 576/nature
  benchmark numbers are historical references, not the new step's baseline.

## Research basis

- [Epic landscape materials and height blending](https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-materials-in-unreal-engine)
- [NVIDIA analytical filtering](https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-24-high-quality-filtering)
- [Heitz/Neyret stochastic texture synthesis](https://eheitzresearch.wordpress.com/722-2/)
- [Deliot/Heitz practical stochastic texture filtering](https://eheitzresearch.wordpress.com/738-2/)
- [Epic streaming virtual texturing](https://dev.epicgames.com/documentation/en-us/unreal-engine/streaming-virtual-texturing-in-unreal-engine)
- [Epic runtime virtual texturing](https://dev.epicgames.com/documentation/en-us/unreal-engine/runtime-virtual-texturing-in-unreal-engine)
- [Frostbite scalable terrain and procedural surface caching](https://www.ea.com/frostbite/amp/news/terrain-in-battlefield-3-a-modern-complete-and-scalable-system)
- [Gaea terrain erosion data](https://docs.gaea.app/reference/nodes/simulate/erosion)
- [Gaea tiled preparation](https://docs.gaea.app/using/using-gaea/build-and-export/tiled-builds.html)

## Completion record

### D1 completed — 2026-10-03

Original landscape AI 576 is complete and remains unchanged. D1 uses baseline
commit `b1b17bc6b714217729b6259be813517896dfe088`. D2–D7 remain pending; the next
implementation pass is D2.

Implemented continuous visual coverage with a versioned recipe, world-space
transition width, projected-footprint filtering and conservative local contour
reconstruction. Smooth two-material boundaries use a fitted contour only when it
preserves all classifications in the source neighborhood; complex boundaries and
narrow features retain the general reconstruction path. Authoritative categories,
heights, soil edits, saved material bindings and texture assets are unchanged.
The canonical contract is `specs/landscape/LANDSCAPE_SURFACE_COVERAGE.md`.

Coverage pages include canonical neighbor halos and continuous hierarchy-arrival
blending. The bounded worker visits at most nine cover pages without requesting
heights. Appearance demand reserves attainable material tiers before geometry
admission, preserving native query leases under the 16/8 MiB low-memory profile.
An exact uniform-region fast path avoids unnecessary reconstruction work.

Verification: 198 Node tests and 18 browser tests pass. Browser coverage includes
six appearance, six streaming, two lifecycle, one pinned-binding, one nature, one
four-view capture and one production-shader seam/fast-path test. Two geometry
ownership tests explicitly omit the optional appearance manifest to retain their
geometry-only allocation preconditions; the other four streaming tests retain
appearance, including the unchanged low-memory native-query integration case.
The seam probe has zero sampled edge jumps across mixed LOD and unequal arrival,
and the uniform fast path matches all 1,048,576 framebuffer bytes exactly. Final
captures have no shader warnings/errors or material-tier mismatches. Disposal
returns controlled CPU/GPU allocations and query leases to zero.

Four 1920×1080 before/after pairs use identical cameras, projection, DPR, materials,
lighting and budget settings. Comparisons retain the original pixels side by side:

- `tests/artifacts/screens/landscape/ai577/d1/comparisons/01-game-pov-comparison.png`
- `tests/artifacts/screens/landscape/ai577/d1/comparisons/02-oblique-comparison.png`
- `tests/artifacts/screens/landscape/ai577/d1/comparisons/03-top-down-comparison.png`
- `tests/artifacts/screens/landscape/ai577/d1/comparisons/04-medium-distance-comparison.png`

Originals, raw frames and capture reports are in the corresponding `before/` and
`after/` directories. The comparison manifest retains original image hashes;
the final report fingerprints 62 implementation files. Regression logs/receipts
are in `regressions/`, Node results in `node-regressions.txt`, and synthetic seam
evidence in `seams/`, all beneath the same gitignored D1 artifact directory.

Measured on Windows 10.0.26200 x64, Ryzen 5 9600X, 33,463,193,600 bytes system RAM,
RTX 3060 through ANGLE/D3D11, Chromium 151.0.7922.34. Each view has 30 warm-up and
120 sampled frames, at DPR 1 with antialiasing, low-power context preference,
ACES exposure 1.2, sRGB output, fixed sun/hemisphere lighting and water enabled.
Perspective FOV is 55 degrees; the top-down orthographic span is 50 meters.
Budgets are 128 MiB controlled CPU and 64 MiB estimated GPU.

| View | CPU frame median, ms before → after | GPU median, ms before → after | Final GPU p95, ms | Draws before → after | Triangles before → after |
| --- | --- | --- | --- | --- | --- |
| Game POV | 0.60 → 0.75 | 5.218 → 3.439 | 4.060 | 9 → 9 | 931,844 → 931,844 |
| Oblique | 0.70 → 0.80 | 5.915 → 4.592 | 5.103 | 11 → 9 | 1,198,084 → 931,844 |
| Top-down | 0.60 → 0.70 | 3.920 → 2.926 | 5.147 | 6 → 6 | 532,484 → 532,484 |
| Medium distance | 0.60 → 0.60 | 6.399 → 5.070 | 5.516 | 11 → 11 | 1,198,084 → 1,198,084 |

All four median frame intervals are 16.70 ms before and after, with mean FPS near
60. This is browser-paced output, not uncapped throughput. CPU values cover
synchronous frame work; worker CPU, process heap and driver VRAM are not measured
by this instrumentation. GPU values use unique completed timer queries associated
with sampled frames. The oblique after view contains fewer fine terrain meshes
because of budget admission, so its GPU comparison has a different geometry
workload. Repeated runs also vary: the preceding capture of the same shader and
standard allocation measured GPU medians of 4.16/5.82/2.41/8.16 ms. These results
do not establish a universal speed improvement.

| View | Controlled CPU, MiB before → after | Estimated GPU, MiB before → after | Camera settle, ms before → after |
| --- | --- | --- | --- |
| Game POV | 79.396 → 68.650 | 60.806 → 52.562 | 2490.1 → 2787.2 |
| Oblique | 79.396 → 68.650 | 60.806 → 52.562 | 788.5 → 1092.7 |
| Top-down | 73.806 → 78.672 | 52.806 → 55.082 | 998.5 → 992.9 |
| Medium distance | 79.396 → 84.672 | 60.806 → 63.082 | 1494.1 → 1686.3 |

Observed lifetime CPU peaks are 93.608 → 91.873 MiB; GPU peaks are
63.818 → 63.082 MiB. Combined maximum upload is 7,871,003 → 4,648,608 bytes/frame,
below the existing 8 MiB cap. The RGBA8 coverage array uses 4,632,228 bytes for
17 slots (1,362,420 for five), adding 2,386,562 bytes over the old default mask
array on both CPU and GPU. Maximum per-decode transient storage is 945,598 bytes.
The fragment sampler count remains 15.

Limitations: reconstruction cannot invent measured submeter detail from the
1.953125-meter source or 15.625-meter planning infill. Complex/nonseparable edges
and coarse distant categories remain source-limited; coarse categories are not
exact native-area averages. This step deliberately retains existing textures and
their visible repetition. Fine authored/procedural pages and material interleaving
belong to D2, anti-tiling to D3. The verification browsers are closed; the worktree
server remains on port 8002.

### D1a completed — 2026-10-03

This corrective step uses D1 commit `12ce9e678` as its before baseline. D1 remains
completed history; D2–D7 remain pending and D2 is the next implementation step.

- Documented the homogeneous base-tile rule and all six source audits in
  `specs/landscape/LANDSCAPE_BASE_MATERIALS.md`. Replaced five unsuitable soil
  bindings with four new CC0 material IDs plus the accepted sand reused for seabed.
  Grass uses ambientCG Grass008, plain/forest soil Ground006, and rock Granite005A.
  New landscape defaults use these bindings; existing immutable revisions retain
  their original sources. Fine physical detail remains, while broad tonal drift is
  removed by a declared periodic filter in the registered preparation pipeline.
- Preserved sand's base color, normal, calibration and ORM RGB bytes. Added real
  relative relief from retained displacement maps in ORM alpha, including correct
  16-bit source handling. No additional texture channel, sampler or allocation is
  required. Legacy manifests without relief metadata retain their old behavior.
- Added coverage-constrained height competition for material interleaving, using
  coherent weights for color, normals and surface properties. Footprint and
  residency filtering reduce fine competition at distance and through tier arrival.
- Extended the registered `landscape/appearance` leaf with explicit material-only
  bindings, immutable planned input, stale-input checks and current-terrain-last
  publication. Heights, land cover, soil semantics and authoring history are intact.
  Fixed budget identities to include soil ID when two bindings share a material,
  so their separate allocations and releases remain correctly accounted.

Publication produced 54 logical channel pages across 32/128/512 tiers, totaling
20,127,744 decoded bytes across all tiers. The maximum page remains 1 MiB and the
fragment sampler count remains 15. The periodic color filter's conservative typed
array estimate stays below 88 MiB within the existing 96 MiB offline working limit;
this is not a process RSS measurement. Source URLs, CC0 licenses, techniques,
dimensions, hashes, authored scale and processing recipes are retained in material
metadata. Final immutable terrain SHA-256:
`496f91b93facbbc9183d939d4da4e758852270fa71ed19e732ad1fa944127c20`;
appearance SHA-256:
`e7856366836d5cbf8a0c7d5ebb77862ca625dd08460b7c4b710b3a0cc6801ca8`.
Registered bake receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791060374027-45260-33a193d3/summary.json`.

Verification: 209 Node tests pass, followed by a passing rerun of the two affected
preparation tests after the planned-input hardening. All 21 browser checks pass:
six appearance, six streaming, two lifecycle, one pinned binding, one nature, one
seam, two height/budget, one PBR audit and one four-view capture test. The production
shader probe covers 22 scenarios with maximum CPU/GPU weight error 0.00579 in an
8-bit framebuffer. Relief changes 40,116 boundary pixels while leaving every
outside byte unchanged; a one-pixel camera shift has at most one byte of overlap
difference, with p99 zero. Six material audit strips contain 24 real PBR views at
one-tile and repeated scale. Both sand audit renders are byte-identical to baseline.

Evidence root: `tests/artifacts/screens/landscape/ai577/d1a/`.

- Four matched comparisons: `comparisons/01-game-pov-comparison.png`,
  `comparisons/02-oblique-comparison.png`, `comparisons/03-top-down-comparison.png`,
  and `comparisons/04-medium-distance-comparison.png`.
- Originals, capture metadata and sampled frames: `before/` and `after/`;
  material audits: `materials/pbr/`; transition proof: `height-probe/`.
- Node results: `node-regressions.txt`; retained browser receipts: `regression/`;
  full matched measurements: `performance-comparison.json`.
- `final-verification.json` seals the unchanged 63 runtime files, original baseline,
  final material manifests, verification code and evidence hashes. Captured runtime
  fingerprint: `e36b4bb97188b25add04a353c77f075bdc2f834ea2a7328e0dbbcef2023a3c00`.

Measured on Windows 10.0.26200 x64, Ryzen 5 9600X, approximately 32 GiB RAM,
RTX 3060 through ANGLE/D3D11, Chromium 151.0.7922.34. Four identical cameras use
1920×1080 at DPR 1, antialiasing, low-power context preference, ACES exposure 1.2,
sRGB output, fixed sun/hemisphere lighting and water enabled. Perspective FOV is
55 degrees; top-down orthographic span is 50 meters. Each pose has 30 warm-up and
120 sampled frames, with matched completed GPU timer queries. Budgets remain
128 MiB controlled CPU, 64 MiB estimated GPU and 8 MiB uploads/frame.

| View | Frame median, ms before → after | Mean FPS before → after | CPU median, ms before → after | GPU median, ms before → after | GPU p95, ms before → after | Draws, both | Triangles, both |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Game POV | 16.70 → 16.70 | 59.997 → 59.994 | 0.70 → 1.15 | 4.937 → 4.428 | 5.546 → 4.969 | 9 | 931,844 |
| Oblique | 16.70 → 16.70 | 59.994 → 59.997 | 0.70 → 0.90 | 5.569 → 5.219 | 6.060 → 5.834 | 9 | 931,844 |
| Top-down | 16.70 → 16.70 | 59.997 → 59.994 | 0.60 → 0.80 | 2.321 → 2.808 | 4.578 → 6.357 | 6 | 532,484 |
| Medium distance | 16.70 → 16.70 | 59.994 → 59.994 | 0.70 → 0.80 | 5.509 → 5.580 | 5.906 → 6.092 | 11 | 1,198,084 |

| View | CPU resident, MiB both | GPU resident, MiB both | CPU lifetime peak, MiB both | GPU lifetime peak, MiB both | Maximum upload, bytes/frame both | Camera settle, ms before → after |
| --- | --- | --- | --- | --- | --- | --- |
| Game POV | 68.650 | 52.562 | 88.452 | 63.082 | 4,194,300 | 2689.6 → 2789.8 |
| Oblique | 68.650 | 52.562 | 88.452 | 63.082 | 272,484 | 988.9 → 1086.4 |
| Top-down | 78.672 | 55.082 | 91.873 | 63.082 | 3,676,703 | 995.4 → 996.0 |
| Medium distance | 84.672 | 63.082 | 91.873 | 63.082 | 4,194,300 | 1694.4 → 1793.1 |

Material tiers, geometry counts, resident/peak allocations and upload maxima match
exactly in each pair. Frame output is browser-paced near 60 Hz; this is not an
uncapped throughput benchmark or evidence of a general speedup. CPU time measures
synchronous frame work. Worker CPU, process heap and actual driver VRAM are not
measured because the capture instrumentation does not expose them. Disposal returns
controlled CPU/GPU bytes and query leases to zero. No capture errors, warnings or
material-tier mismatches occurred. All verification browsers are closed; the
worktree server remains on port 8002.

Limitations: coarse forest/grass/sand junction shapes remain visible because this
step does not add finer terrain coverage. D2 supplies that separate capability.
Fine-grain periodicity can remain until D3's stochastic sampling. The height filter
integrates a locally planar score margin; combined maximum selection, support and
normalization make the multi-material result approximate rather than an exact
area integral. Source relief is a material appearance input, not measured terrain
elevation or collision. This completes D1a, not the entire AI.

### D2 completed — 2026-10-04

This step uses D1a commit `f4a84b6` as its rendering baseline; the separate infrastructure
commit `f873ae9` only lets the worktree server serve the shared junctioned asset store. D1 and
D1a remain completed history; D3–D7 remain pending and D3 is the next implementation step.

- Added generated fine coverage pages below the native level: L4/L5/L6 at 0.98, 0.49 and
  0.24 m (250/125/62.5 m pages), addressed on demand, in the unchanged D1 page format and in
  extra layers of the existing mask array, so the shader keeps fifteen samplers. The slot
  count is a compile-time define chosen from device uniform capacity (81 here: 17 native +
  64 fine). The canonical contract is `specs/landscape/LANDSCAPE_SURFACE_DETAIL.md`.
- Recipe `landscape-surface-detail-v3` (family seed 1207276911) builds canonical native
  support windows and smoothed vector boundaries (multi-label marching squares with a
  turning-limited quadratic fit), which turn staircases into lines while keeping one-cell
  strips, tapering strips and single-sample islands. It adds a shared world-anchored warp
  (48–6 m, mean about 0.81 m, at most 3 m, no folding), band-limited ridged breakup,
  exact authored override geometry, and data-driven pair widths of 0.8–2.0 m.
- The same warp runs in the terrain shader for native and coarser levels, so aerial views
  meander like the fine pages and the native-to-fine hand-off does not jump.
- Physical interleaving: `landscape-material-clumps-v1` reweights each transition with
  world-anchored per-material clump relief before the D1a height competition. Grass now thins
  into sand in tussocks and tufts, soil shows between rock relief, and forest soil and sand
  interleave in patches. Coverage normalization, absent materials, single-material interiors
  and tier-arrival stability are preserved.
- Fixed a D1 shader shortcut that skipped fitted contours when the 6×6 label support was
  uniform. CPU and GPU now match for wide generated bands; native coverage is unchanged.
- Runtime: two detail workers, a 64-slot fine pool, uniform-page resolution, and a
  content-addressed view cache of 48 pages that survives reload. Leases are independent
  of geometry and native queries; failures retain the parent and retry once.
- Inspection: snapshot, coverage and generator-sample hooks, `surface-level` and
  `surface-coverage` diagnostics, and `landscapeSurfaceDetail=off|50cm|25cm`.
- Following the user's realism-first direction, the shipped budget is 384 MiB CPU / 192 MiB
  GPU (appearance ceilings half of each total). At the historical 128/64 MiB the terrain
  geometry was GPU-degraded in every capture view; at 256/128 and above it meets its
  1.5-pixel target.

Verification: all 247 landscape Node tests pass. Browser suites run sequentially on port 8002 pass 37 tests: surface detail 8, surface seams 2, appearance 6, streaming 6, lifecycle 2, appearance binding 1, nature 1, material height blend 2, fabrication 2, navigation 2, planning 1, authoring 2, city binding 1 and the three-profile performance gate 1. `landscape_large_editing` stops during setup at the pre-existing stale city pin noted below. The production-shader height probe keeps the D1a legacy result of 40,116 changed boundary pixels. Its 15 clump parity cases stay within a 0.0058 GPU/JS weight error. The production-shader seam
probe shows no edge jump beyond its tolerances at adjacent L6 pages, mixed L5/L6 corners,
native↔L4 edges, uniform neighbors and warped native borders, and GPU and JavaScript warps
agree within 0.69 bytes. A soil edit on an isolated copy regenerated only the 2 pages it
touched; 6 came from the cache. Routing one native cover payload to HTTP 500 failed only
its 6 dependent L4 pages, each after two attempts, while native coverage stayed intact.
Repeated travel reuses cached pages with identical CPU/GPU bytes after each return, the
16/8 MiB profile has zero fine capacity, and disposal returns controlled bytes to zero.
The generator's 324 tested adjacent page pairs share bit-identical border texels.

Evidence root: `tests/artifacts/screens/landscape/ai577/d2/`.

- Matched four-view comparisons, realism profile (384/192 MiB):
  `realism/comparisons/01-game-pov-comparison.png`, `02-oblique-comparison.png`,
  `03-top-down-comparison.png` and `04-medium-distance-comparison.png`; the historical
  128/64 MiB pairs are in `comparisons/`, and the 256/128 MiB baseline is in `quality/before/`.
  All baselines were captured before rendering code changed and are sealed by
  `immutable-baseline.json`.
- Fifteen close-up before/after pairs at five boundary types (HEAD runtime served from an
  isolated export): `closeups/comparisons/`.
- The 50 cm/25 cm/off evaluation is in `evaluation/`, the generator review images in
  `generator/`, and the surface diagnostics in `diagnostics/`. Integration and clump tuning
  evidence is in `integration/` and `clumps/`, and the final regression logs are in
  `final/logs/` and `final/results.csv`.

Measured on Windows 10.0.26200 x64, Ryzen 5 9600X, about 32 GiB RAM, RTX 3060 through
ANGLE/D3D11, Chromium 151.0.7922.34. Cameras, projection, 1920×1080 at DPR 1, antialiasing,
lighting, water, material tiers and budgets match within each profile. Each pose has 30
warm-up and 120 sampled frames, with completed GPU timer queries. The frame interval moved
from 16.70 to about 17.5 ms between the morning baselines and the after captures. This is
environmental: in the same session, the unchanged HEAD runtime also paced at 17.4 ms.

Realism profile (384/192 MiB), before → after:

| View | GPU median, ms | GPU p95, ms | CPU median, ms | Draws | Triangles | CPU MiB | GPU MiB | Peak upload, bytes/frame | Settle, ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Game POV | 4.793 → 6.948 | 5.683 → 7.131 | 0.70 → 1.20 | 17 | 1,996,804 | 148.8 → 166.9 | 105.2 → 121.8 | 4,466,784 → 8,143,487 | 3289 → 3385 |
| Oblique | 5.019 → 11.181 | 5.647 → 11.893 | 0.60 → 1.30 | 19 | 2,263,044 | 148.8 → 170.0 | 105.2 → 121.8 | 272,484 → 544,968 | 1000 → 2520 |
| Top-down | 2.536 → 3.410 | 4.133 → 3.507 | 0.50 → 0.50 | 6 | 532,484 | 94.7 → 125.3 | 65.6 → 82.2 | 3,676,703 → 3,676,703 | 1192 → 1672 |
| Medium distance | 6.436 → 16.549 | 6.865 → 17.004 | 0.70 → 1.20 | 19 | 2,263,044 | 164.8 → 187.6 | 115.7 → 132.3 | 4,194,300 → 4,766,639 | 1986 → 2418 |

Resident fine pages (resident/capacity, uniform): 53/64 with 33 uniform, 64/64 with 34,
6/64 with 0, and 64/64 with 24. Lifetime peaks were 238.6 MiB CPU and 142.8 MiB GPU.

Historical profile (128/64 MiB), before → after: GPU medians 5.189 → 4.525, 5.400 → 6.363,
1.885 → 3.055 and 5.097 → 7.712 ms. Draws and triangles are identical (9/931,844,
9/931,844, 6/532,484 and 11/1,198,084). Fine capacity is 12 (12/12, 12/12, 6/12 and 12/12
resident). Peaks are 108.4 MiB CPU and 62.7 MiB GPU.

Fine-detail evaluation at 384/192 MiB with the warp and clumps on (GPU median, ms, for
off / 50 cm / 25 cm; fine pages resident at 50/25 cm):

| View | Off | 50 cm | 25 cm | Fine pages |
| --- | --- | --- | --- | --- |
| Game POV | 4.82 | 5.94 | 6.91 | 26 / 53 |
| Oblique | 7.12 | 9.24 | 11.15 | 31 / 64 |
| Top-down | 3.02 | 3.21 | 3.40 | 2 / 6 |
| Medium distance | 10.43 | 14.61 | 17.44 | 41 / 64 |

At the game POV, 50 cm and 25 cm pages look nearly identical because shader clumps provide
most near-field interleaving. The 25 cm target stays the realism default; 50 cm is the
measured D6 optimization candidate. Generation takes about 13–20 ms median per page in Node,
with a 29.4 ms mean and 72.5 ms p95 in the browser workers.

Limitations: GPU cost grows with fine coverage. The medium view goes from 6.4 to 16.5 ms
and the oblique and medium views fill all 64 slots; D6 owns these reductions. Fine detail
refines the source's designed macro shapes and planning-infill areas rather than
re-inferring them. Sand remains blurry at extreme close range (texel density, D4), and some
forest|sand pockets look smooth there. Effective band widths vary about 0.61–1.39× along a
boundary because of the warp. Breakup can interrupt strips narrower than about 1 m, and an
override over soil that changes along one edge can lose that boundary within about 0.4 m.
Two pre-existing issues remain: `landscape_large_editing` stops at a stale city revision pin
from the D1a material publication, and the top-down pose did not settle at an unusual
80/56 MiB profile on HEAD either. This completes D2, not the entire AI.

### D3 completed — 2026-10-04

This step uses D2 commit `802188db` as its before baseline: four matched views in
`d3/realism/before/` and seven repetition views in `d3/repetition/before/`, both sealed before
rendering changed. D1, D1a and D2 remain completed history; D4–D7 remain pending and D4 is next.

- Added world-anchored stochastic hex tiling (`landscape-hex-tiling-v1`, chunk
  `chunks/landscape/stochastic_tiling.glsl`, exact JavaScript mirror in
  `LandscapeMaterialSampling.js`) to every natural material and to both the near and macro
  lattices. A salted equilateral triangle grid with three cells per texture period gives each
  fragment three samples with hashed offsets and per-material constrained rotations. The lattice
  is seeded from the landscape seed, so it is deterministic and never depends on the camera.
- One weight set drives base color, ORM, the relief alpha consumed by the D1a competition and
  the D2 clumps, and normals, so all material channels stay coherent. UV gradients rotate with
  each sample before `textureGrad`. Tangent normals are blended as slopes after inverse
  rotation; a dominant rotated sample lights exactly like the unrotated path.
- Directional structure: grass, forest soil, rock and unknown substrate rotate freely. Sand and
  seabed are not rotated and are offset only along the ripple crests, so ripple orientation and
  phase continue across patch borders.
- The default `hex-contrast` weighting (barycentric⁷ × relief or luminance signal) preserves
  contrast. `hex-linear`, `hex-variance` (the Gaussian histogram-preserving operator with exact
  mip means) and the pre-D3 `single` path remain selectable through
  `landscapeMaterialSampling`/`setMaterialSampling` for A/B evidence. The full
  Gaussianized-texture and inverse-LUT method was evaluated offline: it was indistinguishable
  from `hex-variance` but needed new pages and per-material lookups, so it was not implemented.
- Cost control: per-material coverage gating, skipping the zero-weight macro lattice and
  negligible samples (1.86 fetches per lattice on average), a single compiled mode, and a
  uniform sample count. Samplers stay at fifteen with no new page or allocation. Fixed fragment
  uniforms rise from 125 to 134 vectors: this machine keeps 81 coverage slots, and the WebGL2
  minimum keeps 22.

Verification: all 258 landscape Node tests pass, including 11 sampling tests: hash determinism,
grid and barycentric continuity, rotation and offset constraints, gradient Jacobians, the
slope chain rule, variance preservation and the GLSL mirror. 34 browser tests across 11 suites
pass: height blend 3, surface detail 8, seams 2, appearance 6, nature 1, planning 1, streaming 6,
lifecycle 2, appearance binding 1, fabrication 2 and navigation 2. Authoring 2, city binding 1
and the three-profile performance gate 1 also pass; `landscape_large_editing` still stops at the pre-existing
stale city pin (tracked under D7).

The production-shader probe matches the JavaScript lattice at all 2,051 sampled texels. Rotated
dominant samples differ by 0 bytes from the unrotated path, and the largest step across patch
borders falls to 2 bytes at 8× zoom. A one-pixel shift gives p99 0. The legacy relief probe
keeps its 0.0058 weight error with stochastic tiling on and off. A 24-pixel orthographic camera
move in the real viewer stays within p99 1 byte, so there is no swimming. The `single` mode
reproduces the sealed HEAD frames within 1 byte apart from 2–3 pixels.

Evidence root: `tests/artifacts/screens/landscape/ai577/d3/`.

- Four matched realism views: `realism/comparisons/01-game-pov-comparison.png` through
  `04-medium-distance-comparison.png`.
- Repetition before/after: `comparisons/rep-*.png`; contrast-stretched low-frequency views:
  `comparisons/stretch-*.png`; four-mode crops: `comparisons/modes-*.png`.
- Metrics: `repetition/analysis.json`, `histogram/`, `performance/summary.json` and
  `stability/report.json`. Logs are in `final/`, `final2/` and `realism/`.

Measured on Windows 10.0.26200 x64, Ryzen 5 9600X, RTX 3060 through ANGLE/D3D11, Chromium
151.0.7922.34, 1920×1080 at DPR 1 and 384/192 MiB, with 30 warm-up and 120 sampled frames and
completed GPU timer queries. Matched realism views, before → after:

| View | GPU median, ms | GPU p95, ms | CPU median, ms | Draws / triangles | CPU / GPU MiB | Peak upload, bytes/frame |
| --- | --- | --- | --- | --- | --- | --- |
| Game POV | 6.910 → 7.628 | 7.609 → 8.237 | 1.20 → 1.20 | 17 / 1,996,804 (unchanged) | 166.9 / 121.8 (unchanged) | 8,143,487 (unchanged) |
| Oblique | 11.868 → 12.979 | 12.143 → 13.277 | 1.30 → 1.30 | 19 / 2,263,044 (unchanged) | 170.0 / 121.8 (unchanged) | 544,968 (unchanged) |
| Top-down | 3.401 → 3.762 | 3.504 → 3.826 | 0.50 → 0.60 | 6 / 532,484 (unchanged) | 125.3 / 82.2 (unchanged) | 3,676,703 (unchanged) |
| Medium distance | 17.466 → 18.698 | 17.808 → 19.263 | 1.20 → 1.30 | 19 / 2,263,044 (unchanged) | 187.3 → 187.6 / 132.3 | 4,494,155 (unchanged) |

Lifetime peaks were 237.6 MiB CPU and 142.8 MiB GPU, and disposal returns zero. The medium view
now exceeds the 16.7 ms frame budget, so its frame-interval p95 rose to 35.3 ms (occasional
dropped frames).

Repetition is the Pearson autocorrelation of high-passed luminance at the tile-period lag in
rendered uniform regions. Values for single → hex-contrast: grass 20 m 0.998 → 0.004; grass
60 m 0.966 → 0.045 near and 0.982 → 0.020 macro; grass 200 m 0.759 → 0.039; forest 60 m
0.986 → 0.021 near and 0.993 → 0.008 macro; forest 200 m 0.823 → 0.059; forest 1 km
0.931 → 0.003; sand 60 m 0.984 → 0.023.

Rendered contrast relative to single sampling (standard deviation; Wasserstein-1 distance in
sRGB bytes): hex-linear −19…−27% (0.38–1.42); hex-contrast −4.8…+1.2% (0.09–0.47);
hex-variance +0.8…+6.8% (0.18–0.63).

Mode GPU medians, single / hex-linear / hex-contrast / hex-variance in ms: game POV
6.87/7.61/7.54/7.70; oblique 11.52/12.56/12.80/13.09; top-down 3.41/3.79/3.74/3.79; aerial
oblique 16.94/19.78/19.65/20.47; beach POV 5.35/5.96/5.93/6.04; grass 60 m 2.98/3.51/3.26/3.58.
Compile plus first draw goes from 2.3 s (HEAD) to 3.6 s (hex-contrast).

Limitations: GPU and compile costs grow, and the medium-distance view now drops occasional
frames at 60 Hz; reductions belong to D6. hex-contrast keeps 1–5% less rendered contrast than
single sampling. The sand source's faint vertical light streaks remain as irregular ~10 m
segments, and its macro ripples are still magnified 4× (D4). Patches add faint cellular
variation of about 0.8 sRGB byte standard deviation at 200 m, so homogeneous sources remain
required. Removing the grass page's 2.15° mean normal lean darkens sunlit grass by about
0.45 bytes. Worker CPU and driver VRAM are not measured. This completes D3, not the entire AI.

### D4 completed — 2026-10-04

This step uses D3 commit `9ec8cf61` as its before baseline: four matched views in
`d4/realism/before/` and 18 detail poses in `d4/views/before/`, sealed before rendering changed.
D1–D3 remain completed history; D5–D7 remain pending and D5 is next.

- Physical scale (`landscape-physical-tiling-v1`): every material is sampled at its calibrated
  period at every distance. The former second lattice at four times the period, which magnified
  ripples and pebbles fourfold in the middle and far field, is removed; grass keeps 4 m and sand
  30 m at all distances.
- Landscape-scale variation (`landscape-macro-variation-v1`): two decorrelated world-anchored
  fields, tone and chroma, sum four rotated octaves at 400, 160, 64 and 25.6 m. Each octave fades
  by projected footprint so it never aliases, and per-material responses turn them into value,
  saturation, hue and roughness changes. `landscapeMacroField` is the input point for D5's
  terrain-driven terms.
- Micro detail (`landscape-micro-detail-v1`): a third layer of each material's surface array
  carries mean-neutral detail normal, relief and luminance. Sand and seabed pair with the CC0
  ambientCG Ground054 close-up sand at its real 3.5 m scale (3.42 mm per texel at 1024), sampled
  with its own stochastic lattice. It feeds the D1a competition and D2 clumps and fades before it
  could alias; it is never magnified beyond its resident texel.
- Filtering and steep ground: normal mip filtering (`landscape-normal-mip-vmf-v1`) widens GGX
  roughness from the length of mip-filtered normals, so distant ripples keep their averaged
  response instead of turning glossy. Slope-adaptive projection (`landscape-slope-projection-v1`)
  adds side projections only above about 24.6° of slope, so gentle ground keeps the established
  top projection bit for bit.
- Finer streamed tiers: the companion `appearance/multiscale.json` (schema
  `landscape-appearance-multiscale` v1, revision `multiscale-eedd520219823e11ff6c7381`) adds native
  1024 tiers for all six soils and the paired micro pages, prepared by the registered
  `landscape/appearance` bake leaf (`multiscale` request) with retained CC0 provenance, strict
  validation, deterministic output and an orphan guard; the schema-1 sidecar bytes are unchanged.
  The runtime reports explicit capability and fallback outcomes (`active`, `active-limited`,
  `absent`, `disabled`, `invalid`, `budget-denied`, `device-capacity`), splits a 1024 upload over
  up to four frames under the shared 8 MiB cap and only transitions to fully uploaded tiers.
- Material demand (`landscape-material-water-filling-v1`): each material requests the tier its own
  visible pages need, and the tiers are fitted to the appearance budget level by level with
  incumbent hysteresis. Verification of the first build found the old view-wide demand starving
  the rock close-up at 384/192 (rock at its 32-pixel fallback while four materials held 1024); the
  corrected demand binds rock at 1024 there and never leaves a visible material below a level that
  fits for all.
- Startup: the larger terrain program compiles through `KHR_parallel_shader_compile` before the
  first upload, so its 5.5 s compile no longer freezes the page (longest main-thread gap 76–90 ms,
  from 3.9 s).
- Budget: the shipped total is 512 MiB CPU / 256 MiB GPU. At 384/192 the 1024 tiers left telephoto
  beach geometry degraded (3.14 px against the 1.5 px target at FOV 8); at 512/256 it reaches
  0.21 px and nothing is budget-degraded.
- Displacement was assessed and rejected: a parallax-occlusion prototype changed only the sand
  close-up (mean 0.9 sRGB bytes) for +0.5 ms, cannot change silhouettes, and vertex displacement
  of the 1.95 m mesh would desynchronize picking, queries and future collision.

Verification: all 296 landscape Node tests pass (258 in D3), including companion validation,
preparation and published-asset tests, material demand and water-filling (with a 400-trial
randomized invariant), surface layers and the updated budget tests.
44 browser tests across 14 suites pass on the final tree: height blend 6, surface detail 8, seams 2,
appearance 8 (including the companion fallback and published-companion streaming tests), nature 1,
planning 1, streaming 6, lifecycle 3, appearance binding 1, fabrication 2, navigation 2, authoring 2,
city binding 1 and the three-profile performance gate 1. The gate's precondition now requires the
native geometry to exceed only the historical and constrained GPU limits, because the shipped
256 MiB limit can hold it. One earlier full run timed out once while a page started; the test passed
in isolation and in 10 repeats, and the terrain program wait is now flushed and bounded at 20 s.
`landscape_large_editing` still stops at the pre-existing stale city pin (tracked under D7).
The 13 failures in 11 non-landscape unit files are environmental and predate D4 (missing
OpenImageIO/PyOpenColorIO, shared-store asset gaps, other branches' expectations); D4 changes no
non-landscape code.

Feature scale and stability: the sand ripple peak stays at 0.84 m at 20 m and 60 m orthographic
spans, and the formerly magnified far-field ripple band loses 72–73% of its power at FOV 55 and 20.
On tilted probe planes the checker transitions per meter are 3.375/2.875/3.375/3.875 at
30/45/60/80° (top projection alone: 1.875 at 60°, 0.625 at 80°). On four camera paths the largest
frame-to-frame difference stays within 1.11× the median, so there is no popping. Holding each
pose for 10 s after settling causes no tier upload, load or eviction in any of the three
profiles. The final renders match the first D4 build within 3 sRGB bytes even where demand now
binds smaller tiers.

Evidence root: `tests/artifacts/screens/landscape/ai577/d4/`.

- Four matched views: `realism/comparisons/01-game-pov-comparison.png` through
  `04-medium-distance-comparison.png`.
- Detail poses and crops: `comparisons/` (sand, grass and rock close-ups, telephoto beach, far
  field, top-down sand, aerial and steep views), renders in `views/before/` and `views/final-d4c/`;
  the first build's sheets, which show the starved rock, are kept in `comparisons-pre-d4c/`.
- Materials and data: `materials/` (candidate audit, review sheets, bake receipts),
  `appearance-multiscale-validation.json`.
- Metrics: `performance/` (paired HEAD timings, `d4c-gpu-*.json`, micro A/B, compile and load
  timing), `analysis-feature-scale-companion.json`, `temporal/`, `displacement/`, `d4c/` and
  `regression/`.

Measured on Windows 10.0.26200 x64, Ryzen 5 9600X, RTX 3060 through ANGLE/D3D11, Chromium
151.0.7922.34, 1920×1080 at DPR 1 and 384/192 MiB, with 30 warm-up and 120 sampled frames and
completed GPU timer queries. The sealed baseline was captured in the morning; the after capture
ran in the afternoon while other applications kept the GPU about 35% busy, which raised the cost
floor of cheap views by about 2 ms for HEAD as well. Matched realism views, before → after:

| View | GPU median, ms | GPU p95, ms | CPU median, ms | Draws / triangles | CPU / GPU MiB | Peak upload, bytes/frame |
| --- | --- | --- | --- | --- | --- | --- |
| Game POV | 7.614 → 8.158 | 8.298 → 8.206 | 1.30 → 1.20 | 17 / 1,996,804 (unchanged) | 166.9 → 216.1 / 121.8 → 170.0 | 7,871,003 → 6,137,372 |
| Oblique | 12.891 → 12.984 | 12.983 → 13.063 | 1.30 → 1.20 | 19 / 2,263,044 (unchanged) | 170.0 → 219.2 / 121.8 → 170.0 | 544,968 (unchanged) |
| Top-down | 3.764 → 5.877 | 3.830 → 6.071 | 0.60 → 0.50 | 6 / 532,484 (unchanged) | 125.3 → 149.7 / 82.2 → 97.4 | 3,676,703 (unchanged) |
| Medium distance | 18.777 → 17.343 | 19.166 → 18.950 | 1.20 → 1.30 | 19 / 2,263,044 (unchanged) | 187.6 → 234.0 / 132.3 → 176.8 | 4,766,639 → 5,864,888 |

Same-session pairs (HEAD and final D4 run back to back under the same load) isolate the cost:
game POV 7.61 → 8.24 ms, oblique 12.12 → 13.04, top-down 5.33 → 5.85, medium distance
16.76 → 17.97 and aerial oblique 19.01 → 20.59 (about +7–8%); close-ups add 0.4–0.7 ms, of which
micro detail is at most 0.34 ms. The medium view's frame-interval p95 falls from 35.6 to 18.1 ms.
Lifetime peaks were 285.0 MiB CPU and 187.3 MiB GPU (D3: 237.6 / 142.8), with no denial, and
disposal returns zero. At the shipped 512/256 MiB the appearance share is 21–112 MiB of GPU
memory by pose (all five materials at 1024 only at the rock mid view), the largest total is
201.6 MiB at the telephoto beach and the lifetime peak 218.8 MiB. No pose is geometry- or
material-budget limited; wide views still report the fine-mask slot limit
(`appearance-mask-capacity`) exactly as D3 did.

Limitations: the four main views cost about 7–8% more GPU time than D3, and the medium and aerial
views exceed 16.7 ms; reductions belong to D6. Resident tiers keep their decoded CPU copies
(+46–49 MiB CPU at the main views). Compile plus first draw takes 5.5 s instead of 3.8 s and planning
becomes ready about 2 s later; the test-only `setMaterialSampling` switch still recompiles
synchronously. Micro normals are not part of the roughness widening term. Micro detail raises
near-field temporal contrast under motion (Laplacian 2.07 → 3.46 on the dolly path) and its
aliasing was not compared against a supersampled reference. Ground054 repeats a faint 35 × 20 cm
oval every 3.5 m in its relief, and the accepted sand's JPEG base color shows 8×8 blocks at 1024
outside the micro range. Grazing far-field ground stays soft under 4× anisotropic filtering. Demand
resolves only to 62.5 m fine pages, so soils sharing the camera's page are ordered by page count.
`landscape_large_editing` still stops at the stale city pin (D7). This completes D4, not the
entire AI.

### D5 completed — 2026-10-05

This step uses D4 commit `c67080ef` as its before baseline at the shipped 512/256 MiB profile: four
matched views in `d5/shipped/before/` and 32 detail views in `d5/views/before/` (coast, planning areas,
bluff, cliffs, hollows, horizon and the D4 poses), sealed with content hashes before rendering changed.
D1–D4 remain completed history; D6 and D7 remain pending and D6 is next.

- Terrain fields (`landscape-terrain-fields` v1, `specs/landscape/LANDSCAPE_TERRAIN_FIELDS.md`): the
  registered `landscape/terrain-fields` bake leaf computes global analyses on the full native grid first —
  Priority-Flood depression handling, MFD flow accumulation, wetness index, deposition, multi-scale
  convexity, rock exposure, horizon angles in 16 directions (8 stored), sky view and signed shoreline
  distance — then slices mask-aligned pages. Output is deterministic (the global stage runs twice per
  bake) and bound to the terrain revision; edited chunks go stale explicitly and fall back to neutral
  terms. Optional imported overrides (8/16-bit PNG with provenance) need no proprietary runtime.
- Game lighting: the viewer resolves the game's calibrated daylight (sun 45°/55°, physical sun
  irradiance, exposure 0.0511, ACES) without GameEngine. The calibrated HDR is the visible sky and its
  spherical-harmonic projection lights the ground (within 1.8% of the calibrated sky irradiance); no PMREM
  is built. Aerial perspective uses Rayleigh and Mie scattering with height falloff, and the water and
  submerged terrain use coastal-water optics over the exact in-water path. Tiers `low|standard|high`
  provide graceful reduction.
- Terrain shadows and response: horizon-based sun visibility with a soft solar disc, terrain-scale sky
  occlusion, single-bounce terrain-reflected light, and a natural-ground response (energy-preserving
  Oren–Nayar diffuse, Hapke opposition hot spot, natural-surface shadowing of specular) replacing the
  forward sheen of dry rough ground. Landscape-local calibration brings grass and rock into physical
  albedo ranges without touching the shared PBR store, and subtracting each page's mean normal lean
  removes the hexagonal patches a low sun exposed in D3's stochastic sampling.
- Terrain-driven appearance: a landscape-scale catena (moist hollows darker and richer, dry ridges
  lighter) derived from the fields with planning areas excluded so graded roads leave no ghost lines,
  restrained rock outcrops on steep convex slopes, weathered coastal rock instead of a near-white band,
  and a beach sequence of dry sand, a wet band (wet/dry albedo 0.53–0.60) and a glossy swash film.
  Variation comes from terrain properties only, never from added noise.
- Natural infill: planning-only areas display the bake's terrain-driven natural soil at every level
  (native, coarse and generated fine pages, recipe `landscape-surface-detail-v4`); the 15.625 m
  stair-stepped flood fill is now only an explicit per-chunk fallback for stale or missing data.
- Dressing inputs: `landscape-dressing-inputs` v1 (grass, shrub, tree, rock scatter and beach debris
  densities from soil coverage and fields) with an exact sampler, the viewer hook `dressingSample` and
  diagnostic views; it agrees with displayed soil, and prop placement remains out of scope.

Verification: all 381 landscape Node tests pass (296 in D4), including terrain-field algorithms on
synthetic grids, sidecar validation and determinism, natural inference across levels and staleness,
sky-irradiance projection, lighting, response, calibration, terrain-appearance and dressing mirrors.
58 browser tests across 17 suites pass on the final tree: height blend 6, surface detail 8, seams 2,
appearance 8, lighting 6, terrain fields 3, terrain appearance 4, nature 1, planning 1, streaming 6,
lifecycle 3, appearance binding 1, fabrication 2, navigation 2, authoring 3, city binding 1 and the
three-profile performance gate 1 (navigation and authoring in a re-run after two test fixes: the viewer
now installs its hooks after a larger shader set loads, sometimes after the load event, and a cold
browser profile needs up to 20 s to compile the terrain program, so those waits are 60 s and 30 s; the
viewer's own compile wait is bounded at 60 s). `landscape_large_editing` still stops at the
pre-existing stale city pin (D7).
GPU and JavaScript mirrors agree within 3e-4 for the fields, 0.1% for the water reflection map and
2e-6 relative for the response and terrain appearance.

Lighting and view validation: the 32 views were rendered under the calibrated sun, a 12° sun from four
azimuths and an overhead sun. Low sun no longer shows grass hexagons (patch luminance standard deviation
2.7–2.9 → 0.84–0.88 sRGB bytes, at the 0.84 single-sample floor) and the forward sheen falls from about
200 to 48 sRGB bytes; D3's repetition correlations are unchanged. Terrain shadows agree in 99.97% of
pixels under a pan and 99.70% between 300 m and 600 m views. Authoring: an edit in an urban block stales
exactly its native chunk, whose fields fade to neutral and whose infill falls back to the overview,
while a revert restores both.

Evidence root: `tests/artifacts/screens/landscape/ai577/d5/`.

- Four matched views: `shipped/comparisons/01-game-pov-comparison.png` through
  `04-medium-distance-comparison.png`.
- 32 before/after sheets and a contact sheet: `comparisons/`; renders in `views/before/` and
  `views/final/`.
- Fields: `fields/published/` (every field, sun sweeps, natural soil old vs new); infill A/B:
  `infill/iter1/comparisons/`; lighting: `lighting/`; response: `response/`; terrain appearance:
  `appearance/`.
- Metrics and logs: `performance/`, `lighting/performance/`, `response/performance/`,
  `appearance/performance/`, `terrain-fields-validation.published.json`, `load-trace.txt`, `regression/`.

Measured on Windows 10.0.26200 x64, Ryzen 5 9600X, RTX 3060 through ANGLE/D3D11, Chromium
151.0.7922.34, 1920×1080 at DPR 1 and 512/256 MiB, with 30 warm-up and 120 sampled frames and
completed GPU timer queries. Matched views, before → after (different sessions):

| View | GPU median, ms | GPU p95, ms | CPU median, ms | Draws / triangles | CPU / GPU MiB | Peak upload, bytes/frame |
| --- | --- | --- | --- | --- | --- | --- |
| Game POV | 8.168 → 12.445 | 8.223 → 12.700 | 1.30 → 1.40 | 17 → 18 / 1,996,804 → 1,999,022 | 216.1 → 235.4 / 170.0 → 188.0 | 5,864,888 → 6,137,372 |
| Oblique | 13.004 → 18.941 | 13.080 → 19.330 | 1.40 → 1.60 | 19 → 20 / 2,263,044 → 2,265,262 | 219.2 → 238.5 / 170.0 → 188.0 | 544,968 → 1,362,420 |
| Top-down | 5.934 → 6.602 | 6.065 → 6.869 | 0.60 → 0.80 | 6 → 7 / 532,484 → 534,702 | 149.7 → 168.9 / 97.4 → 115.3 | 3,676,703 (unchanged) |
| Medium distance | 17.343 → 21.182 | 18.924 → 21.903 | 1.30 → 1.70 | 19 → 20 / 2,263,044 → 2,265,262 | 234.0 → 253.2 / 176.8 → 194.7 | 5,864,888 (unchanged) |

The added draw and 2,218 triangles are the sky background, the haze backdrop and the single-pass water;
terrain geometry and its error are unchanged. Same-session pairs (D4 and D5 back to back in both
orders, mean of the two) put the D5 cost at +3.85 ms (+45%) at the game POV, +5.49 (+41%) oblique,
+1.69 (+35%) top-down and +4.74 ms (+29%) at medium distance; across all 22 timed views it is
+0.3 to +6.1 ms (+5% to +83%), largest on mid-distance soil and aerial views (aerial oblique
18.5 → 24.7 ms). Lifetime peaks were 306.8 MiB CPU and
205.3 MiB GPU (D4: 285.0 / 187.3) with no denial, and disposal returns zero. The terrain-field array adds
18.8 MB on CPU and GPU, the HDR sky 4 MiB plus a 12 MiB background cube outside the ledger.

Limitations: the realism costs are large and are D6's to reduce — up to +6.1 ms GPU per view, the
medium and aerial views now exceed the 16.7 ms frame budget (medium frame-interval p95 18.0 → 35.6 ms), and the cold terrain program
compile grows from 5.5 s to 12–20 s on a fresh browser profile (about 50 ms once Chromium has cached it);
the page stays responsive meanwhile. One sky (sun elevation 55°) lights every sun elevation, ground bounce
is single-scattering with unshadowed occluders, and backlit grass has no canopy transmission. The fields
come from a designed prototype terrain: graded roads dominate flow and wetness (hence the planning
exclusion, tuned to its 150 m grading feathers), the catena shows the generator's periodic undulations,
sky view is near 1 almost everywhere and no rock lies within the splash reach, so the wet-rock zone is
verified by mirrors only. The tide is a fixed falling-tide look, the water is flat, and haze is single
scattering. Natural-soil labels of fresh chunks next to an edit keep the original bake until it is re-run.
`landscape_large_editing` still stops at the pre-existing stale city pin (D7). This completes D5, not the
entire AI.

### D6 completed — 2026-10-05

This step uses D5 commit `83815e17` as its before baseline at 512/256 MiB: four matched views in
`d6/shipped/before/` and 32 detail views in `d6/views/before/`, sealed with content hashes. It landed in
three commits: the program-variant checkpoint `d9253037`, the cache core `2d334bb9` and this completion.
D1–D5 remain completed history; D7 remains pending and is next.

- Profile: the D5 terrain frame averages 12.1 ms GPU over 36 views — an unlit floor of 1.6 ms, coverage
  reconstruction 5.0 ms (surface warp 3.3, fine pages 1.9), material evaluation 3.5 ms and lighting with
  fields, response, atmosphere and water 2.0 ms. Overdraw is 1.00–1.07, so a depth pre-pass cannot help.
  The cold compile is dominated by the six inlined soil evaluations (37% of 8,508 DXBC slots; each soil
  adds 0.65–0.9 s), the coverage hierarchy (27%) and control flow rather than code size.
- Safe wins: every inspection view moved into a separately compiled diagnostics variant and the
  terrain-appearance switch became a compiled variant, both linked in parallel on an unrendered prototype
  before tiles switch. The cold compile on a fresh browser profile falls from 12.3 to 8.4 s and GPU time by
  0.3 ms on average, with output within one sRGB byte at three suns.
- Decision: a partial surface cache of the view-independent coverage and material results is justified
  (an emulation removed 69% of the frame); lighting, terrain fields, atmosphere and water stay per pixel.
  Later roads and decals extend the surface through a documented layer contract (world bounds, margin,
  order, revisions and a pure GLSL chunk; with the cache they join the page identity and composite during
  generation).
- Runtime surface cache (`landscape-surface-cache-v1`): a world-anchored virtual texture of 64² pages with
  4-texel gutters (1.56 cm mip 0, mips 0–12, toroidal clipmap indirection), an LRU atlas charged to the
  residency ledger, page identities from every input revision but never camera, light or time, monotonic
  invalidation, a deterministic CPU demand planner with motion and turn prefetch and cancellation, GPU
  generation by an unlit program variant under a controller that keeps batches near 1 ms, atomic
  publication, coarse-ancestor fallback, context-loss recovery and runtime rebinding across reloads. A near
  pass evaluates the uncached program per pixel wherever a pixel is finer than the cache texel, blended over
  a 0.75–1.0 texel band, so close-up ground keeps its exact D5 detail.
- Default and budget: the cache is opt-in (`landscapeSurfaceCache=on`) with its own 512/448 MiB profile
  (2,816 slots, 158.4 MiB; the streams keep the 256 MiB of the uncached profile); 512/256 and smaller
  profiles compile the uncached program from the start with an explicit reason. The shipped default stays
  the exact D5 frame under the user's realism-first direction; enabling the cache by default is a D7
  decision (see below).

Verification: all 417 landscape Node tests pass (381 in D5), including the cache contract, layout, demand,
controller, near-field reach (no fragment beyond a tile's reach can be weighted, on flat ground and 15–60°
slopes) and shader checks. With the cache off (the default) 64 browser tests across 18 suites pass on
the final tree: height blend 6, surface detail 8, seams 2, appearance 8, lighting 6, terrain fields 3,
terrain appearance 4, surface cache 5, nature 1, planning 1, streaming 6, lifecycle 4, appearance
binding 1, fabrication 2, navigation 2, authoring 3, city binding 1 and the performance gate 1. A full run
exposed a picking race: right after a programmatic camera change such as a preset, the pick ray used the
previous view's camera matrices, which refresh only at the next render, and the heavier D5–D6 frames
widened that window. `pickPoint` now refreshes the matrices first; a navigation test that picks in the same
task as a preset fails without the fix, and the authoring suite passed twice after it. Every landscape suite also passes with the cache on through
`LANDSCAPE_TEST_SURFACE_CACHE=on`, with outcomes identical to the cache-off run. With the cache off the output
is unchanged: the uncached programs equal the D6 core's and the 32 views match the sealed set within the
capture noise. The four matched AI577 views with the cache off
are identical to the sealed D5 baseline within one sRGB byte, with the same draws, triangles and memory and
no error or denial.

Cache on against off (paired in the same page, 36 views, 1920×1080, 512/448 MiB, RTX 3060 / ANGLE D3D11):

| Sun | GPU off: mean (max) ms | GPU on: mean (max) ms | Full-frame mean, sRGB bytes | Near-crop mean | Pixels > 16 bytes |
| --- | --- | --- | --- | --- | --- |
| Calibrated (45°, 55°) | 11.79 (24.50) | 5.20 (8.09) | 0.46 | 0.48 | 0.055% |
| Low (225°, 12°) | 11.81 (24.46) | 5.08 (8.04) | 0.86 | 1.01 | 0.32% |
| Overhead (45°, 85°) | 12.32 (25.60) | 4.12 (7.53) | 0.36 | 0.39 | 0.050% |

32 of 36 views are faster (aerial oblique 24.4 → 5.7 ms, medium distance 20.8 → 5.4 ms); the four d4 near
views are 1.5–1.9 ms slower because the near pass redraws most of their frame, and their near crops match
exactly. The worst full frame differs by 2.86 bytes (sand under a 12° sun) and the worst near crop by 3.50
bytes (steep urban ground under a 12° sun), a uniform speckle of relief shading. Page seams and
mip-transition steps match the uncached frame, and temporal sparkle and popping on the D4 camera paths are
equal or lower. The ledger peaks at 378–402 MiB with no denial or truncated demand; generation batches have
a p95 of 1.02–1.05 ms. In motion, missing pages show their coarser ancestors in 0–22% of frames up to 30 m/s,
11% during a 90°/s turn and 50% during a 55° → 8° zoom, clearing within 18 ms after the camera stops (stale
pages after turns take about 1.4 s); cache CPU stays at 0.1–0.9 ms median per frame. Cold start on a fresh
profile: first detailed frame 9.5 s (uncached 10.4 s), settled 13.8 s (10.7 s); an edit's reload settles in
5.2–6.4 s (uncached 3.7 s); a restored context settles 1.5 s after restoration. At 3840×2160 the demand
exceeds the 2,816 slots (outer rings truncated, 0.3–1.1 bytes) while GPU time falls from 16–56 to 5–15 ms.

Evidence root: `tests/artifacts/screens/landscape/ai577/d6/`.

- Profile and safe wins: `performance/` (`per-pose-final.md`, waterfall and component tables), `hlsl/`,
  `compile/`, `equality/`.
- Cache: `cache-core/` and `cache-final/` (`paired-cal|low225|overhead-table.md`, `matrix-summary.json`,
  `near-cost/`, `motion/`, `temporal/`, `cold/`, `edit-final/`, `context-final/`, `paired-4k/`,
  `suites-on|off/`); off/on sheet `d6-cache-off-on.png`.
- Matched views: `shipped/comparisons/`; regression logs: `regression-final/`.

Limitations: the cache is not pixel-identical, its 2,816 slots suit 1920×1080 only (1440p is at the edge,
4K truncates), it needs 192 MiB more GPU budget and 0.2–0.4 ms more CPU per frame, it settles 3.1 s later on a
cold start and regenerates every page after a reload or edit, fast motion and zooms show coarser fallback
pages, and the four near views cost 1.5–1.9 ms more. GPU page feedback is not built (the deterministic CPU
planner proved sufficient; the interface remains). The uncached default keeps D5's GPU cost apart from the
0.3 ms of the safe wins. Everything was measured on one GPU, driver and browser build, where register-driven
occupancy moves single views by ±1–5 ms between structurally equivalent programs. `landscape_large_editing`
still stops at the pre-existing stale city pin (D7). This completes D6, not the entire AI.

## On completion

- Mark the first line DONE and rename only after all deliverables pass to
  `AI_DONE_codex_landscape_577_MATERIAL_realistic_landscape_surfaces_and_multiscale_detail_DONE.md`.
- Keep the file in `prompts/`; do not archive automatically.
- Include one high-level summary per completed change, focused validation, actual
  before/after performance tables and artifact paths, and remaining limitations.
