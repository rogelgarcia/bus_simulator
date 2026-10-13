# Proposed gameplay grass redesign

Status: bus-lab prototype implemented, 2026-10-13. Gameplay has not adopted it;
its current contract remains [GRASS_GAMEPLAY.md](GRASS_GAMEPLAY.md). The sections
below distinguish the implemented lab path from the remaining design targets.

The proposed replacement uses immutable grass patches, a small set of visual
representations, and a continuous grass ground surface. Camera movement selects
patches and updates small placement/LOD values instead of rebuilding instance
buffers. Visual simplification is allowed where differences are hard to notice
from the driving camera; nearby silhouettes, coverage and lighting remain the
reference for acceptance.

## Implemented lab path

Open `debug_tools/grass_debug_v2.html?grass=patches`. The **Fixed patches** and
**Latest baked** links retain the current camera and curved layout for comparison.
Both load the authenticated gameplay package. The lab no longer needs authoring
exports to run its baked reference; `?grass=current` retains that older dependency.
The default lab URL and gameplay still select the existing baked renderer.

The new shared `GrassPatchRenderer` owns immutable source geometry and placement
attributes, conservative occupancy grids, bounded mesh pools and shader distance
coverage. LOD0/1 use 2 m patches; LOD2-4 use 4 m patches. Together their shared
placement attributes contain 40 bytes. Moving pool objects updates ordinary mesh
transforms, without rewriting instance, vertex or index buffers. Templates and
shader variants are warmed during loading, including currently invisible levels.

The initial automatic ranges are 0.6 / 0.8 / 8 / 16 / 24 m, measured from the camera
to the ground in three dimensions. Camera elevation therefore reduces unnecessary
detail. Blades retain the package's authored geometry and reduced LOD3/4 assets;
new progressive density assets have not been baked. Distance cutoffs are currently
fixed, not yet calibrated from FOV and pixel size. Overlap uses complementary
opaque dissolve, with continuous litter-to-canopy shading on static 32 m surface
quads. Between 16 and 21.6 m, LOD4 color and the ground approach the same canopy
sample projected onto ground + 5 mm. The color match completes before geometric
dissolve at 21.6–24 m, avoiding a dark-blades/bright-ground ring. Existing external
visibility and brightness apply after this color match. The surface sits 5 mm
above ground.

The lab combines roadside rectangles and the optional curved plot in one union
mask. Each original outline retains even-odd fill semantics; separate outlines
form a union. Road exclusions are applied after that union. The terrain uses its
complement, and both grass strategies share the same scene-shadow projection.
Prepared grass samples cached external visibility. This lab has a stationary bus;
gameplay's moving-vehicle shadow lifecycle still needs integration and validation.

Forced LOD0–4 cover the full visible field, regardless of automatic distance or
camera height. Explicit mode switches expand the selected mesh pool to the finite
occupied grid and release the extra objects on returning to AUTO or another mode.
Geometry and placement buffers remain shared and immutable. AUTO retains its
bounded selection. The patch path exposes only its supported dissolve blend;
the reference retains its existing blend controls. OFF restores terrain.

`grass_patch_runtime.pwtest.js` covers moving/reversing cameras, low camera heights,
zero post-warmup buffer creation/uploads, stable geometry/program counts, GPU mask
agreement, external shadows, disposal and camera-preserving comparison links.
`grass_patch_route.pwtest.js` is an opt-in hardware comparison using matched route
poses in alternating orders, plus native wall-clock flights. Set
`GRASS_PATCH_BENCHMARK=1` and `PLAYWRIGHT_EXECUTABLE_PATH` to a hardware browser,
then run it through the selected-test runner. Evidence is under
`tests/artifacts/screens/grass/runtime_redesign/`.

Gameplay adoption remains the next stage after the requested lab test. It must
wire the shared renderer into `GameplayGrassRenderer`, preserve mode/disposal and
moving shadows, and validate grass placement in the game's AO/depth passes and
the supplied recording. The existing prepared assets remain the comparison
reference while progressive density and projected-size selection are evaluated.

### Lab measurements, 2026-10-13

These initial measurements precede the LOD appearance correction below.

Chrome 154 / ANGLE D3D11 / RTX 3060, 3814 x 1672 at DPR 2. These runs use the
lab's 4x MSAA, AO off and default lighting, not the recording's 8x MSAA/GTAO
configuration. They qualify this lab prototype, not whole-game frame pacing.
The working tree was based on `4166cc1ebca786364909832bbec2ccd0ed9c728e`;
the authenticated grass package hash was
`2edb472e86216b31a89b27b674daa3c7d55c8dd1a13bd80ac187293127affe07`.

Two warmed 360-pose comparisons ran in baked/patches/OFF then OFF/patches/baked
order. Each pose has a matched asynchronous GPU query, with no disjoint event
or missing sample. Synthetic route time advances about 89 ms per rendered pose;
these diagnostic laps do not represent wall-clock driving speed.

| Metric | Baked reference | Fixed patches |
| --- | ---: | ---: |
| Mean whole-scene GPU, two laps | 6.05 / 6.11 ms | 4.86 / 5.17 ms |
| Mean CPU update plus render submission | 7.56 / 8.35 ms | 1.00 / 0.91 ms |
| Grass update p95 | 5.6 / 6.2 ms | 0.1 / 0.1 ms |
| Mean submitted scene triangles | 2,350,879 | 393,528 |
| Mean scene draw calls | 365 | 75 |

Matched patches-minus-OFF GPU differences had medians 0.35 / 0.83 ms and p95
2.33 / 2.55 ms. These are paired pose differences, not subtracted percentiles.
The two rounds' spread is meaningful; do not treat the smallest value as a
precise isolated grass cost.

A separate native 32-second flight plus one-second hold collected 1,987 GPU
samples per strategy. Mean whole-scene GPU fell from 5.70 to 4.30 ms; mean CPU
fell from 5.46 to 0.94 ms, and CPU p99 from 12.1 to 1.4 ms. Both flights were
display-paced at about 60 FPS. There is no measured FPS increase in this lab.

The integration test observed zero buffer uploads or creations during 180
moving/reversing frames, including low camera heights. Geometry/program counts
remained stable. Its GPU coverage oracle found zero mismatches among 64,299
high-confidence pixels, detected external shadows, and verified disposal.
The first final run failed only on a Google icon-font QUIC request; the full
unchanged suite passed on retry. These initial measurement artifacts are preserved
in `tests/artifacts/screens/grass/runtime_redesign/moving_before_lod_correction/`;
`moving/` contains the latest comparison after the LOD correction.

Final regression runs passed all six tests across `grass_patch_runtime`,
`grass_curved_boundary` (both lab radii) and `grass_gameplay_curves` (the existing
game renderer), plus the opt-in hardware route comparison. JavaScript syntax
and diff whitespace checks passed.

The geometry target is not fully met: the patch route still peaks at 762,414
whole-scene triangles, with 722,868 attributable to grass against matched OFF
poses, exceeding the 500,000 grass-triangle goal.
User visual acceptance, gameplay AO/depth and moving shadows, FOV-based detail,
and the original recorded route remain open gates.

### LOD appearance correction, 2026-10-13

The reported black forced modes had two causes: forced selection still used the
automatic distance limit, and the runtime loader supplied a one-entry manual mip
array for litter textures. The [Three.js r183 texture loader](https://github.com/mrdoob/three.js/blob/r183/src/renderers/webgl/WebGLTextures.js)
treats that array as the complete mip chain and disables automatic generation,
leaving minified litter black. Single-level
assets now use automatic mip generation; authored canopy mip chains are preserved.
This loader correction applies to both the lab and the existing game renderer.

Restoring litter fixed the black background, but the terminal blend still had
23% normalized pixel-luminance error against LOD5 in a controlled 22.2–23.2 m
band. Projected color matching reduced that to approximately 0.1%; mean LOD4/LOD5
brightness in the broader test region differs by about 2%. These are controlled
regression measurements, not claims that all geometry views are identical.

`grass_patch_lod_consistency.pwtest.js` first reproduced the failures and now
checks all five forced blade levels above their former height cutoff, rendered
LOD2 ground coverage, matching terminal appearance and pool restoration. Images
and measurements are in `tests/artifacts/screens/grass/runtime_redesign/lod_consistency/`.

The corrected hardware comparison passed with the same submitted triangle count
and grass-update p95 of 0.1 ms. Patch CPU means were 0.83 / 1.05 ms versus
6.45 / 7.99 ms for baked. GPU means varied: patches 5.85 / 6.35 ms versus baked
6.27 / 9.26 ms, while the separate native flight measured 6.73 ms for patches
and 6.27 ms for baked. This run does not establish a reliable GPU speedup or an
isolated cost for the additional color sample; retain the complete controls in
`moving/` rather than extrapolating the earlier GPU result to this correction.

## Evidence and limits

The [recording investigation](../../debug_tools/regression_debugging/recording_slowdown_20261012.md)
reproduced repeated stalls during camera movement. Slow uploads were attributed
to grass instance matrices, including ground and canopy batches. These buffers
allocate 256 KiB or 1 MiB, and membership changes mark the entire array for upload.
Changing the usage hint to StreamDrawUsage did not eliminate the stalls.
Stationary controls were smooth, so stationary averages cannot qualify a fix.

The current package also retains substantial blade geometry over a large area:

| Representation | Triangles per square metre in the source assets |
| --- | ---: |
| LOD0 | 12,055.5 |
| LOD1 | 6,697.5 |
| LOD2 | 1,340.5 |
| LOD3 | 714 |
| LOD4 | 451.5 |

These are index counts divided by the 2 x 2 m source area, not measured submitted
triangles or GPU time. Coverage, frustum culling and overlapping transitions
change the actual workload. Current selection thresholds are 0.6 / 0.8 / 20 / 30 /
40 m. The large total scene draw-call increase in the recording has not been
attributed entirely to grass.

The recording's late GPU frame time is about 39 ms. Eliminating grass upload
stalls does not establish a 60 FPS whole-game result. The engine's 50 ms elapsed
time clamp also discards time during long frames; that is a separate pacing issue
to address without removing the physics catch-up budget.

## Recommended architecture

### Immutable patches

Use a bounded pool of patch objects on a fixed world grid. Start by comparing
4 m and 8 m patches: smaller patches improve culling but increase submissions.
Patch geometry and placement attributes are shared immutable templates uploaded
during loading. A world coordinate determines the template variation and seed.
Reassigning a pool slot changes its origin/seed and bounds, not its vertex or
instance buffers. Overlapping world positions retain exactly the same grass
when the camera crosses a patch boundary.

The CPU selects candidate patches, applies conservative occupancy and frustum
culling, and chooses a representation. It does not scan and repartition every
one-metre cell into camera-dependent instance lists. Occupancy is derived from
the authoritative coverage mask during city setup and invalidated only by a
coverage revision. Partially covered patches still use exact fragment coverage.

The GPU applies a patch origin to shared local placement data. Use immutable
instanced offsets or compact root attributes instead of full per-cell matrices.
Progressive density levels use precomputed, spatially balanced subsets with
stable root identities. Camera updates choose counts or immutable geometry views;
they never reorder root arrays. Geometry bounds include blade overhang and any
transition displacement.

Only patches whose detail can contribute are submitted. Rendering a dense city
and rejecting most of it in the vertex/fragment shader would still spend vertex
work and is not this design. Ordinary travel in the loaded flat city must cause
zero grass geometry/placement buffer uploads, including patch-boundary crossings.
Small uniforms and shadow rendering are measured separately.

This borrows the static-buffer and coarse-block selection principles from
[GPU-based geometry clipmaps](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry).
It is an adaptation to grass, not a claim that a terrain clipmap implements the
grass system. The required instancing is available in
[WebGL 2](https://registry.khronos.org/webgl/specs/latest/2.0/); a WebGPU migration
is not a prerequisite.

### Three visual roles

| Role | Proposed rendering | What must remain convincing |
| --- | --- | --- |
| Nearby | Real blade geometry, retaining authored shapes and color | Individual blades, roots, curb silhouettes and parallax |
| Middle distance | Much sparser, low-polygon blades over the ground surface | Coverage, height, depth cues and moving-camera continuity |
| Distance | Grass appearance in a continuous ground surface | Color variation, texture filtering and external shadows |

Initial comparison ranges are approximately 0-8 m, 8-25 m and beyond 25 m, with
narrow overlap bands. These are experiment inputs, not accepted cutoffs. Choose
final transitions from projected size, camera elevation/FOV and silhouette error.
At the recording's 1672-pixel height and 55-degree vertical FOV, a 10 cm feature
normal to the viewing direction is about 6.4 pixels tall at 25 m. Distance alone
therefore does not prove that flattening it is invisible. Grazing views and
roadside edges may need sparse blades farther out.

The middle population should be a stable subset of the near population, with
reduced shape detail and calibrated width/coverage. Do not compensate for lost
geometry simply by making every survivor very wide: clumping and brightness can
become more visible than the original detail reduction.

Cards are a measured alternative for the middle role, not the starting default.
The transition lab already documents clumping, coverage and parallax compromises
in card experiments. Compare compact fixed-orientation clusters against sparse
blades at the recorded resolution and MSAA setting. Count alpha overdraw and
atlas memory as well as triangles. A lower triangle count alone is insufficient.

Use one continuous litter-to-canopy ground shading path, preferably integrated
into the terrain material, with static coarse surface patches if separate
geometry is necessary. Eliminate camera-dependent ground membership and the
one-metre distant canopy instance matrices. Preserve world-space texture
variation and correct derivatives across variation cells; moving that work from
vertices to fragments must be benchmarked at the recorded resolution. Ground
integration must not create a second full-coverage layer unnecessarily.

The current elevated canopy and transition skirts cannot simply be deleted while
claiming visual equivalence. Validate the new surface height and blade-to-ground
handoff for holes, curb intersections and loss of volume. Keep any necessary
height transition in a continuous surface, without per-cell topology rebuilding.

### Stable transitions and bounded work

Use representation hysteresis so small camera movements cannot toggle a patch
back and forth. Blend only adjacent representations in bounded transition bands.
Preserve shared roots and world-stable variation; do not reseed or animate noise
to hide a switch. The recorded configuration uses MSAA rather than TAA, so
temporal accumulation cannot be assumed to hide stippling.

Keep a ceiling on visible patches, submitted blade geometry and overlap. If a
quality adjustment is needed, reduce low-value detail gradually and consistently;
do not change density in response to each individual slow frame. Debug and
overhead cameras should obey the same resource bounds with appropriate LODs.

## Retained contracts

- Reuse the filtered world-space coverage mask, even-odd road islands, final
  curved sidewalk contours, building exclusions and slab ground-contact contours.
  Apply it consistently to blades, transitions and the ground surface.
- Preserve the current palette, shaded roots, variation, view-dependent canopy
  appearance, sun intensity response and moving bus/building shadows.
- Keep the cached static/dynamic visibility service initially so upload and
  geometry changes can be measured independently. Its render cost belongs in
  the total grass budget. Sharing the game's authoritative shadow data can be a
  later measured optimization when projection, coverage and ownership agree.
- Preserve Texture/3D settings, preview/cancel/save behavior, lazy loading and
  disposal. No new player-facing experimental controls are required.
- Keep flat city ground as the supported terrain contract. Do not introduce a
  speculative terrain-streaming system into this replacement.
- Retain authenticated runtime assets and loading failures. New progressive
  geometry or atlases must extend the registered materials/grass/gameplay-runtime
  bake through `node tools/bake.mjs`, including validation/publication gates and
  the shared Blender configuration if Blender is needed.
- Put renderer code in `src/graphics/engine3d/grass/runtime/` and shader programs
  in dedicated files under `src/graphics/shaders/`. Share the production strategy
  with the lab instead of adding another divergent grass implementation.

## Alternatives and decision

| Strategy | Assessment |
| --- | --- |
| Partial uploads or rotated dynamic buffers | Useful short diagnostic/interim fix; retains membership rebuilding and the dense geometry workload |
| Immutable patches plus sparse blades and ground appearance | Recommended; directly removes the reproduced upload mechanism and permits independent GPU cost reduction |
| Cards throughout | Candidate only at suitable distances; existing visual compromises and alpha fill cost need testing |
| Shell layers or per-pixel ray marching | Not the first prototype; additional overlapping layers or fragment steps would need evidence of a win at this resolution |
| WebGPU compute-generated grass | Possible later backend; introduces broader renderer work before this WebGL2 design has been tested |

## Implementation and acceptance

1. Add the immutable patch path behind a developer comparison strategy, reusing
   existing authored assets, coverage and shadow service. Prewarm templates and
   shader variants during loading. Hold appearance and distances constant for
   this first comparison so the upload fix can be assessed independently.
2. Replace ground/canopy membership with the continuous surface. Introduce the
   three visual roles and compare progressive sparse blades with a compact card
   experiment only if the sparse path cannot meet the budget with acceptable
   coverage. Calibrate moving views before selecting transition ranges.
3. Promote only after gameplay lifecycle, exclusions, lighting and moving-route
   performance pass. Update GRASS_GAMEPLAY.md to the adopted behavior and remove
   obsolete production batching paths. Retain historical comparison evidence.

Provisional engineering targets on the RTX 3060 at 3814 x 1672, DPR 2, with the
recorded MSAA/AO/lighting settings are below. They are acceptance goals, not
measured results or guarantees:

| Metric | Initial target |
| --- | --- |
| Grass selection/update CPU | p95 <= 0.5 ms; p99 <= 1 ms |
| Geometry/placement buffer uploads during normal travel | 0 bytes after loading/prewarming, including anchor crossings |
| Incremental GPU frame cost versus matched Texture mode | median <= 2 ms; p95 <= 3 ms, including grass visibility passes |
| Grass camera-pass submissions | <= 100 draw calls and <= 500,000 triangles on the reference route |
| Movement-related stalls | No recurring grass-attributed upload or resource-creation spikes |

Measure whole-frame CPU/GPU and intervals as well as these scopes; a cheap
selection timer does not include stalls inside the renderer. Report per-frame
upload bytes/calls, draw calls, triangles, allocation events and shadow refreshes.
Record grass strategy/settings, package hash and source revision alongside poses.

Use the supplied moving route, both pose-per-frame diagnostic replay and
wall-clock-paced replay with skipped/interpolated poses as appropriate. Report
their pacing separately. Compare paired Texture/current/new runs with identical
camera samples and settings, alternating order across repeated warmed laps;
retain cold first-use results separately. GPU queries must be asynchronous,
submission-matched and disjoint-checked. Do not subtract unrelated percentile
summaries to estimate a grass percentile; compute paired differences from
matched samples and report their distribution and uncertainty.

Visual gates include near curb silhouettes, curves and islands, sloped slab
exclusions, front/rear/grazing/overhead views, moving bus shadows, LOD crossings,
patch crossings in both directions, reversals and teleports. Check for sliding,
popping, exposed ground holes, clumping, repetition, brightness changes and
shimmering in motion. Captures and diagnostic data stay gitignored under
`tests/artifacts/screens/grass/runtime_redesign/`. Extend the existing gameplay
mode, curved-boundary and slab suites and add a deterministic movement test that
verifies stable root placement and the absence of geometry buffer uploads.
