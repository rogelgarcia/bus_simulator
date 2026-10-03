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
  corrective D1a step are complete. Leave D2–D7 pending for later passes; D2 is next.
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

- [ ] Add independently addressed fine surface coverage/detail pages where D1's
  analytic reconstruction is source-limited. Evaluate a 25–50 cm near-camera
  coverage target, while retaining coarser coverage elsewhere and bounded residency.
- [ ] Retain reproducible authored/procedural boundary inputs, revisions and seeds;
  distinguish generated detail from original imported measurements. Raster
  upsampling alone must not be presented as new source fidelity.
- [ ] Integrate D1a's material micro-height competition with fine coverage pages,
  producing soil in rock gaps, irregular grass edges and plausible sand transitions.
  Normalize weights robustly, preserve a valid base layer and coherent
  normal/roughness response across independently arriving surface pages.
- [ ] Provide filtered hierarchy levels and neighborhood context sufficient for
  seamless borders; edits invalidate only affected pages and their dependencies.
  Fine surface streaming must remain independent of geometry/source query leases.
- [ ] Validate before/after edge quality, narrow features, all LOD/zoom transitions,
  cold loading, failures, repeated travel, editing and memory/upload bounds.

### D3. Non-repeating material sampling

- [ ] Add deterministic world-anchored stochastic patch sampling/blending to natural
  materials, maintaining coherence across base color, normals, ORM and micro-height.
- [ ] Preserve color distribution and contrast through blending and mip selection;
  compare histogram-preserving methods with cheaper alternatives using visual and
  GPU evidence. Correct derivatives and tangent normals under transforms.
- [ ] Preserve directional structures such as beach ripples through constrained
  rotations/orientation. Avoid obvious patch edges, ghosting, swimming and new grids.
- [ ] Keep expensive sampling limited to contributing layers and useful detail.
  Measure shader cost with otherwise identical coverage, cameras and assets.

### D4. Distinct macro, local and micro detail

- [ ] Separate unique landscape-scale variation, local material patches and close-up
  micro detail. Keep physical feature sizes stable as viewing distance changes.
- [ ] Supply suitable CC0 material sources and finer streamed tiers where measured
  texel density requires them; source quality, page encoding, compression, decoding
  and GPU residency must have explicit capability and fallback contracts. Retain
  D1a's homogeneous base-tile requirement when adding or replacing any material.
- [ ] Transition contributions using projected footprint, filtering and hysteresis
  for perspective movement/FOV and orthographic zoom. Avoid magnified pebbles/ripples.
- [ ] Add appropriate projection for steep surfaces and assess limited near-camera
  displacement only where it improves silhouettes/contact without corrupting
  authoritative terrain or collision expectations.
- [ ] Compare near, intermediate and aerial views for scale, texture repetition,
  sharpness, temporal stability, page seams and budget behavior.

### D5. Terrain-driven natural appearance and lighting

- [ ] Derive broad variation from meaningful terrain properties such as slope,
  exposed rock, moisture, flow and sediment deposition, with restrained noise.
  Bake operations requiring global context before local detail processing.
- [ ] Improve beach wet/dry transitions and land-water integration while preserving
  sea level, submerged terrain and source semantics. Separate visual treatment from
  any future hydrology simulation or water physics.
- [ ] Integrate consistent game illumination, terrain shadows and atmospheric depth
  as supported by the renderer, with explicit cost and graceful quality reduction.
- [ ] Define natural dressing inputs for later grass, rocks and vegetation so their
  distribution agrees with soil/coverage; actual large-scale prop placement remains
  separately scoped. Optional Gaea imports must use retained interoperable maps and
  provenance, not introduce a mandatory proprietary runtime dependency.
- [ ] Validate varied lighting/view conditions and source/authoring compatibility.

### D6. Profile-guided surface caching

- [ ] Profile combined material evaluation and streaming. Decide from measured
  evidence whether a generated surface-page cache is justified; record a reasoned
  no-cache outcome if its costs exceed demonstrated benefits.
- [ ] If justified, cache reusable material properties independently of camera
  lighting/view, with page identity, recipe/material/source revisions, gutters,
  filtered levels, generation scheduling, invalidation and bounded CPU/GPU storage.
- [ ] Keep coarse fallback, camera-motion prefetch, zoom response, cancellation and
  publication ordering explicit. Later roads/decals must have an extension contract.
- [ ] Compare uncached/cached quality, frame/GPU time, generation/upload spikes,
  bytes, latency and edit recovery under identical conditions.

### D7. Integrated quality and resource acceptance

- [ ] Verify a saved/editable coastal landscape from game POV, oblique travel,
  steep ground, shoreline and distant overview, with stable appearance through
  movement, FOV/zoom changes, pause, reload and repeated visits.
- [ ] Exercise source/soil edits, pinned old revisions, natural planning infill,
  seam consistency, corrupt/delayed requests, low budgets and complete disposal.
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

## On completion

- Mark the first line DONE and rename only after all deliverables pass to
  `AI_DONE_codex_landscape_577_MATERIAL_realistic_landscape_surfaces_and_multiscale_detail_DONE.md`.
- Keep the file in `prompts/`; do not archive automatically.
- Include one high-level summary per completed change, focused validation, actual
  before/after performance tables and artifact paths, and remaining limitations.
