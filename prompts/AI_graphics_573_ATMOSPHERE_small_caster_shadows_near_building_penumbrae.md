# Connection corrected with independent prop depth; performance/Cycles pending

User steering, 2026-09-17: implement the correction now, estimate cost, and defer
stress/performance measurements while Blender is running. Do not interrupt the
occupied Blender session. The current pass uses an independent finite-disc
ray/plane oracle for correctness; a fresh matched Cycles render remains pending.

## Problem

At the exact `bigcity2` bus/camera pose below, the user reports that the stop
sign's shadow is deformed where it interacts with the softened building shadow.
The apparent cause is building-shadow smoothing affecting the much smaller
caster. This is a reported symptom and a hypothesis, not an established diagnosis.

The game must preserve a small caster's appropriate silhouette and local
softness while retaining the building's broad, smooth finite-sun penumbra.
Overlap can physically change shadow visibility: a sign inside a building's
complete umbra should not create an extra dark shadow. Do not force an isolated
sign silhouette through areas where the building already blocks the sunlight.

# Request

Reproduce the defect, identify its root cause, and implement a general shadow
filtering or representation correction. Continue investigating until the cause
is demonstrated and the correction passes visual and performance validation.
Preserve the calibrated lighting and existing shadow quality elsewhere.

Tasks:
- [x] Correct the remaining cut through the sign silhouette at the building
  boundary reported after the first implementation. Compare smoothing off at
  the same pose and add a truly overlapping-depth regression; the earlier
  average-error test did not establish continuity through the building edge.
- [x] Capture the current game at the supplied pose with the matching baked
  channels fully active and fine shadow pages settled. Save effective settings,
  source/package identities, residency, renderer diagnostics and the original
  pose with the evidence; fail clearly if the bake is incompatible or inactive.
- [x] Identify the actual sign, pole, building caster and receiving surface.
  Save an unmodified full frame and clearly labeled closeups of the defect.
- [x] Establish whether the distortion exists in the depth representation,
  blocker selection, visibility filtering, coarse/fine map transition, or final
  lighting composition. Record measurements and rejected hypotheses here.
- [x] Compare controlled small-caster/building cases against finite-area ray
  visibility to distinguish filtering artifacts from physical overlap.
- [ ] Capture the matched Cycles city reference when Blender is available.
- [x] Fix the demonstrated cause generally, preserving nearby small-caster
  detail and smooth distant-caster shadows across static and moving receivers
  wherever the affected path applies.
- [x] Add a deterministic regression that fails before the correction and
  passes afterward, including the reported scene and a controlled mixed-depth
  caster fixture using the actual production shader path.
- [x] Finish visual review of nearby poses and the existing five comparison poses.
- [ ] Run the deferred repeated same-condition performance checks, including
  shader preparation. Preserve the recent shader-loading improvements.
- [x] Update the relevant shadow specifications, this prompt's findings and
  completion evidence; share before/after/reference images with the user.

## Exact reproduction pose

Preserve all values, including both quaternions. The simulation is paused and
the camera is locked. Keep this source pose in the tracked prompt; generated
capture inputs and results belong in the artifact directory below.

```json
{
  "version": 1,
  "city": "bigcity2",
  "bus": {
    "modelId": "city",
    "transform": {
      "position": {
        "x": -145.8740692138672,
        "y": 1.70357861618941,
        "z": 234.31646728515625
      },
      "quaternion": {
        "x": 0,
        "y": -0.6509509725629473,
        "z": 0,
        "w": 0.759119774027362
      }
    }
  },
  "camera": {
    "position": {
      "x": -126.56797490285533,
      "y": 4.019595890326595,
      "z": 230.43728133663325
    },
    "quaternion": {
      "x": -0.01953645685202498,
      "y": 0.7732579038038656,
      "z": 0.02385240329379669,
      "w": 0.6333416170722013
    },
    "fovDeg": 55,
    "locked": true
  },
  "simulation": {
    "paused": true
  }
}
```

## Existing evidence and constraints

Read the current implementation and these references before changing the filter:

- `specs/graphics/static_sun_depth_cache.md`, especially the receiver-plane,
  centre-blocker search-bound and fine-shadow/filter-cost sections.
- `specs/graphics/finite_sun_shadow.md` for the finite-source model and the
  limitations of reducing multiple blocker depths to a PCSS estimate.
- `src/graphics/shaders/materials/static_sun_depth.frag.glsl` and
  `src/graphics/shaders/materials/streamed_sun_depth.frag.glsl`.
- `src/graphics/shaders/materials/dynamic_sun_shadow.frag.glsl` and
  `src/graphics/shaders/lighting/finite_sun_shadow.frag.glsl`, when relevant to
  the reproduced path; the native calibration adapter is not automatically the
  same path as the production baked sampler.
- `tests/headless/e2e/static_sun_receiver_plane.pwtest.js`,
  `tests/headless/e2e/finite_sun_shadow.pwtest.js`, and the static-sun adapter,
  pipeline and streamed-residency tests.
- `debug_tools/regression_debugging/baked_shader_loading.md`.

An existing correction already bounds the blocker search by the centre ray's
measured separation when that ray is blocked. Receiver-plane depth is corrected
at actual texel centres. The production filter also rejects blockers outside
their possible solar cone. Do not treat these safeguards as missing; determine
which case escapes them in this pose, if they are involved at all.

Fine detail currently transitions to the complete parent map for broad
penumbras to avoid sparse-sampling bands. Investigate whether a distant blocker
changes the estimated radius or detail weight enough to discard a nearby sign
edge. Also consider mixed blocker depths, clear centre rays near thin edges,
insufficient depth coverage, guards, quantization and residency. These are
investigation leads, not instructions to choose an algorithm in advance.

Recent work specializes normal Final shaders separately from diagnostic views
and fixes ANGLE X3595/X4000 warnings. Three paired measurements reduced shader
preparation from 85–88 seconds to 28–29 seconds without changing shadow maps or
sampling quality. Preserve those changes, including source-only specialization,
valid material identities and explicit LOD-zero reads for unmipped depth maps.
They may still be uncommitted when this prompt is implemented; inspect the
working tree and preserve prior work. AI 572's nearby resource preparation is
a separate task and is not a dependency of this shadow correction.

## Investigation and acceptance

Use isolated diagnostics for raw/point visibility, finite-sun visibility, blocker
depth/separation, filter radius and detail contribution. Compare parent-only and
settled parent-plus-detail at the same pose. Keep exposure, sun direction and
angular diameter, AO, indirect illumination and material settings fixed. A
diagnostic disabling AO or other lighting must be labeled as such; it is not
the acceptance image. Verify sign geometry/alpha casting in the source maps
before assuming that an existing silhouette can be recovered by filtering.

The controlled fixture must include the sign alone, building alone and both
together, with close and distant blockers, a thin pole and sign plate, fully
lit/partially occluded/fully occluded regions, clear and blocked centre rays,
oblique receivers and a detail-page boundary. Compare the combined case to
finite-area light visibility; do not derive a false reference by adding,
multiplying or taking the minimum of independently blurred shadow images.

Reuse the existing export/reference tooling and a compatible Blender scene.
Match the camera projection/aspect, transforms, geometry, finite sun and output
transform. Check direct-sun visibility separately from RGB where differing
material or indirect-light responses would confuse the result. Allow expected
loss of sign contrast inside a building penumbra, but reject artificial shape
changes, halos, holes, detached edges or abrupt changes in softness/residency.

The fix must not be a stop-sign-specific exception, a pose-specific mask,
global sharpening, a smaller sun, a switch to point-source shadows, stronger
AO, a resolution reduction or a lighting/exposure adjustment. Maintain the
building's existing smooth penumbra and nearby contact shadows. If the depth
representation demonstrably lacks required information, document that limit
and validate the smallest general correction instead of hiding it with bias.

Save progressive evidence under
`tests/artifacts/screens/ai573_stop_sign_shadow/` (gitignored), including before,
after, Cycles reference, crops, diagnostic captures, measurements and logs.
Keep scripts/tests and the source pose reproducible in the repository. Use
`node tools/run_selected_test/run.mjs` for applicable checks. If rebaking is
actually necessary, use `node tools/bake.mjs` and the registered hierarchy in
`tools/baking/README.md` and `specs/tools/bake_framework.md`, with existing
source validation/publication gates and shared `blender.local.json` settings.
Do not create a separate machine-specific bake command.

Benchmark three before/after passes using fresh private browser processes and
the same hardware, drawing buffer, settings, pose, warm-up, frame count and
settled residency. Include a short repeatable camera movement around the defect
to detect flicker/page transitions. Report CPU/GPU frame-time median and p99,
FPS from elapsed intervals, calls, triangles, texture/geometry/program counts,
estimated additional GPU memory and shader preparation duration. Separate cold
preparation from warm rendering and diagnostic instrumentation. Report actual
cost changes, including increases; do not trade away quality to manufacture a
performance win. Metrics that cannot be obtained must say `not measured` and why.

## Findings and progress

### Reproduction and cause — 2026-09-17

- Starting revision: `8c364a5`. The exact source pose is also tracked in
  `tests/headless/e2e/fixtures/ai573_pose.json`. No sun, exposure, AO, indirect
  intensity, material, bake payload or map density changed.
- Private Chrome captured the pose at 1920x1080 with committed baked shadows,
  indirect activation blend 1, and 16 settled detail pages. Evidence records
  source hashes, package URL, settings, projection/transform, residency and render
  counters. The shadow package is the installed `ai527.sun.az045.el55` package
  under `framework/6f77ead307bb17286677e5a122877fa3731aa5aabfdc1957cf38a2f6c038dbbc-1789255068100`.
- CPU rays identify `mesh.stop_sign.v1 / StopSign / TrafficControls / City`, the
  `Sidewalk / Roads / City` receiver, and `building_42 / Buildings / City`.
  The sign caster is about 2.99 m along the sun ray from the receiver (including
  the 0.05 m ray-origin offset); the building is about 43.44 m away. The sign's
  plate/pole already exist in the depth field; the point diagnostic confirms the
  stored silhouette. This is not a missing caster or incompatible bake.
- Cause: radius estimation and final filtering used different depth assumptions.
  A shallow probe outside its own solar cone was correctly excluded from the
  radius estimate, yet a later broad PCF tap could land on that same shallow
  depth and treat it as part of the distant building. The streamed path could
  additionally fade away fine detail based on that broad radius. One effective
  depth/radius cannot represent both occluders in this neighborhood.
- The first small patch restricted final taps to their individual solar cones.
  Detail-only correction failed the regression; parent+detail reduced the error
  but caused visible city-surface leaks. Rejecting one stored depth does not prove
  a ray is clear. That approach was removed. A clear-centre restriction also
  failed the acceptance threshold and was removed.
- Final correction classifies the full observed probe-depth range separately
  from cone-qualified radius contributions. Mixed near/far footprints use two
  distance bands at the same 12 angular directions. Each direction combines its
  near and far occlusion before averaging. Detail supplies the nearby silhouette;
  the parent supplies smooth broad visibility. The existing one-depth filter,
  blocker-search bound and broad-only fallback remain for ordinary cases.
- A two-band draft which classified only cone-qualified probes still failed
  (10.76% sign-region error). The missing shallow classification, rather than
  merely choosing a different averaged radius, was essential to the fix.

### Correctness evidence

All paths below are under `tests/artifacts/screens/ai573_stop_sign_shadow/` and
gitignored. Original production shaders are preserved in `source/`.

- `before/game.png`, `after/game.png`: identical original user pose/settings.
- `before/point-diagnostic.png`, `after/point-diagnostic.png`: explicit hard-depth
  diagnostics, not accepted lighting views.
- `before/parent-only.png`, `after/parent-only.png`: same pose without fine lookup.
- `before/fixture/` and `after/fixture/`: production GLSL outputs, independent
  512-direction finite-disc ray/plane references and numerical results.
- `sign-shadow-comparison.png`, `fixture-comparison.png` and
  `five-poses-comparison.jpg`: labeled review sheets. Rebuild using
  `python tests/headless/e2e/fixtures/small_caster_review.py` (Pillow and NumPy).
- Five-pose review found no broad lighting or shadow-softness change. RGB mean
  absolute differences on the 0–255 scale were 0.00209, 0.00055, 0.00065,
  0.00141 and 0.05208 for poses 01–05. Pose 05 contains this sign/building overlap;
  only about 0.1024% of its pixels changed by more than 8 in any RGB channel.
  These image differences are not performance or reference-parity scores.
- Rejected candidate evidence remains in `cone-check/`, `cone-both/`,
  `cone-clear/`, `dual-depth/`; accepted reconstruction development in
  `dual-classify/`. These are investigation history, not alternate presets.

| Controlled case | Before sign-region mean error | After | Meaning |
|---|---:|---:|---|
| Sign/pole alone | 5.772% | 5.772% | Existing sampling/density error unchanged |
| Building alone | 5.331% | 5.331% | Existing broad softness unchanged |
| Both, flat receiver | 11.148% | 5.457% | Mixed-depth error reduced by about 51% |
| Both, oblique receiver | 11.221% | 5.447% | Receiver-plane correction preserved |
| Both, parent only | 19.019% | 16.152% | Coarse representation still limits the silhouette |
| Both across settled fine-page seam | — | 5.457% | Same as away from the seam |
| Sign fully inside building umbra | — | 0% | No invented shadow contrast or light leaks |
| Different gaps, 1 m and 30 m | — | 6.102% | No object/pose-specific calibration |

Errors are absolute differences in linear direct-sun visibility, not final RGB,
and the oracle tests combined ray occlusion instead of composing blurred images.
The 8% sign-region acceptance was set before the fix; the old shader fails it.
The existing parent/detail sloping-plane and contact-shadow tests pass, including
pixel-identical Final specialization versus the uniform Final variant. The final
game capture passed with no X3595/X4000 or shader/GL errors. Final source hashes
and deferred work are recorded in `validation-receipt.json`.

Final sequential verification passed all five Playwright tests across
`static_sun_small_caster.pwtest.js` (eight controlled cases),
`static_sun_receiver_plane.pwtest.js` (two tests),
`illumination_static_sun_depth_adapter.pwtest.js`, and
`static_sun_small_caster_gameplay.pwtest.js` (original pose, two nearby views and
five established poses). The previous selected-test target was restored.

The initially duplicated mixed/ordinary PCF bodies caused the old CSM adapter
check to time out at 90 seconds; original shaders passed its control run.
Sharing the PCF body restored a pass, then the final implementation paired
near/far comparisons in one bounded 12-or-24-iteration loop to avoid duplicating
unrolled bodies. The direction count remains 12 and all fixture image metrics
are unchanged. Streamed visibility retains an initialized single-exit result,
avoiding the X4000 return warning encountered in an early draft.

### Estimated cost and remaining sign-off

No stress benchmark, FPS claim or GPU time estimate has been derived from these
correctness captures while Blender is occupied.

| Resource/work | Expected change |
|---|---|
| Shadow texture/storage, geometry, render targets | 0 additional bytes |
| Draw calls / triangles / render passes | No added submissions |
| Ordinary single-depth filter | Same texture tap count; extra depth-range classification and branching |
| Mixed-depth visibility filter | 24 bilinear comparisons instead of 12: 96 rather than 48 depth fetches |
| Streamed mixed pixel vs old broad fallback | 9 detail probes + 96 fetches, versus 9 detail + 9 parent probes + 48 parent fetches; page-table work excluded |
| Whole-frame GPU / CPU / FPS / p99 | Not measured; deferred by user |
| Driver shader memory and compilation duration | Not measured; additional shader logic can increase these |

The extra sampling is confined to detected mixed-depth neighborhoods, so doubling
the local filter work does not mean doubling frame time. A nonzero ongoing GPU
cost is possible wherever those neighborhoods are visible; this is not only a
loading cost. Measure before deciding whether a further optimization is needed.

The model still uses a single front-depth field and two estimated bands. It cannot
recover hidden layers or promise exact arbitrary finite-source visibility. Fine
page fallback retains its existing resolution limits. Moving receivers use the
same corrected static lookup; the moving-caster shadow-map filter was not changed.

Reproduce via `node tools/run_selected_test/run.mjs` after selecting
`tests/headless/e2e/static_sun_small_caster.pwtest.js` or
`tests/headless/e2e/static_sun_small_caster_gameplay.pwtest.js` in
`tests/.selected_test`; restore the previous selection afterwards. `AI573_STAGE`
names the artifact subdirectory. `AI573_ALL_POSES=1` adds two nearby views and the
five established shared-bus poses. `AI573_BASELINE=1` routes the original shader
snapshots from `source/`; capture those from the starting revision before use.
Default tests use the repository shaders and do not require archived snapshots.

Remaining: matched Cycles city render, three clean paired
performance passes, cold shader-preparation comparison and a short moving-camera
sequence. Keep this prompt active until those deferred checks are completed.

## On completion

### Follow-up: missing half of the sign, 2026-09-17

The user correctly rejected the first result: smoothing-off shows the sign
connected to the building, while the first correction left half cut away. The
earlier adjacent fixture placed the building edge at -0.1 m and the sign between
-0.08 and +0.08 m, so it did not test actual overlap in the central depth map.
The new edge-at-zero case failed that implementation (16.212% sign-region error).
The first implementation's tests and screenshots above are historical evidence,
not final acceptance of the reported defect.

The missing cause is representation loss: the farther building is closer to the
sun and overwrites the sign's near-receiver geometry in the single front-depth
field. Angular rays that clear the building still need that hidden sign geometry.
Separating observed depths cannot recover it. Smoothing off hides the loss by
placing the complete building umbra at the central-ray boundary.

The correction adds `SmallCasterShadowCache` with independent, opaque triangle
depth layers for all traffic-control roots. This covers traffic signs and traffic
lights without a camera, position or mesh-name exception. Worker rasterization
and one-layer-per-frame uploads run during preparation; cached warm activation
reuses the result. Context cancellation terminates the worker and releases owned
textures. The existing authenticated source/sun/bake validation gates remain.
Unsupported prop geometry/coverage fails explicitly. Current lighting and zero
sun diameter bypass this supplementary visibility.

Each prop has a 256-square RG8 layer, plus a shared light-space spatial index.
The independently retained silhouette now continues through the building's soft
penumbra at the exact game pose. The full-umbra test still remains black. A new
direct assertion checks the hidden half of the sign is fully occluded, instead
of relying only on an average image error. This assertion reports 0 visibility
afterward. Overlap sign-region error is 7.994%; remaining discretization and
combined-penumbra approximations are not claimed to be exact ray tracing.

Artifacts under `tests/artifacts/screens/ai573_stop_sign_shadow/`:

- `overlap-before/fixture/8-combined.png`: failing first correction.
- `overlap-layer/fixture/8-combined.png` and `8-combined-reference.png`: updated
  production shader and independent finite-disc ray reference.
- `overlap-layer/game.png`, `point-diagnostic.png`, `connection-comparison.png`:
  exact same-pose corrected view, smoothing-off and labeled three-way closeup.
- `overlap-layer/nearby_*.png`, `pose_01.png` through `pose_05.png`: nearby and
  established visual captures. `evidence.json` records the active package,
  settled pages and new prop cache. An earlier `failure.json` records the rejected
  integration attempt with a wrong shader include path, since corrected.

The final game capture passed without shader warnings/errors, and the existing
receiver-plane and material-adapter checks passed. The CPU raster tests verify
nearest depth, empty texels, winding and depth interpolation. The cache ownership
test covers PVS-hidden geometry, disposal, unsupported coverage and cancellation.
The existing pipeline activation/rollback test also passed with the explicit
memory reservation. Final checks: two Node raster tests, nine controlled shader
cases in one test, one cache lifecycle test, two receiver-plane tests, one adapter
test, one pipeline test and one game-capture test. The five-pose review found no
broad lighting change: RGB mean differences against the first attempt were
0.00192, 0.00054, 0.00062, 0.00144 and 0.04978 on the 0–255 scale. Pose 05 contains
the corrected overlap. `overlap-layer/visual-difference.json` and the corresponding
five-pose sheet preserve that comparison.

Updated cost estimate supersedes the zero-additional-memory estimate above:

| Resource/work | Current result/estimate |
|---|---|
| Cached traffic props | 37 roots, 16,512 source triangles |
| Actual additional retained GPU / CPU bytes | 4,911,104 each (about 4.68 MiB each) |
| Planner reservation | 32 MiB each; actual cache and preparation bounded to cap |
| Additional disk bake payload | 0; derived from the matching live static geometry |
| Additional per-frame shadow draws / geometry | 0 |
| Fragment work | Two texture samplers; spatial-index reads, then up to 48 depth fetches per intersecting prop footprint |
| Runtime resource lifetime | Build once per prepared sun/city binding; warm activation retains it |
| FPS/GPU/p99/cold-start timing | Deferred while Blender is occupied; no performance claim |

The independent prop visibility bounds the existing scene visibility using the
minimum of filtered values. This preserves fully occluded interiors but is an
approximation for two partially overlapping penumbras. The existing two-band
filter still uses ray-paired comparisons internally. Other mesh families are not
automatically added to the independent cache; arbitrary hidden layers remain out
of scope. Clean performance, matched Cycles and continuous-camera sign-off remain
pending. Do not mark the prompt DONE yet.

Rebuild the connection sheet with
`python tests/headless/e2e/fixtures/small_caster_review.py --connection-stage overlap-layer`.

### Finalization gates

- Mark the document DONE in its first line only after the reproduction is fixed
  and validation is complete.
- Rename to
  `prompts/AI_DONE_graphics_573_ATMOSPHERE_small_caster_shadows_near_building_penumbrae_DONE.md`.
- Keep it in `prompts/`; archive only on explicit request.
- Add a high-level one-line summary per completed change, the demonstrated root
  cause, before/after/reference image paths and a same-condition performance
  table with benchmark conditions and any remaining limitations.
