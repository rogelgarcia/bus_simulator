# Problem

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
- [ ] Capture the current game at the supplied pose with the matching baked
  channels fully active and fine shadow pages settled. Save effective settings,
  source/package identities, residency, renderer diagnostics and the original
  pose with the evidence; fail clearly if the bake is incompatible or inactive.
- [ ] Identify the actual sign, pole, building caster and receiving surface.
  Save an unmodified full frame and clearly labeled closeups of the defect.
- [ ] Establish whether the distortion exists in the depth representation,
  blocker selection, visibility filtering, coarse/fine map transition, or final
  lighting composition. Record measurements and rejected hypotheses here.
- [ ] Compare a matched Cycles reference and controlled small-caster/building
  cases to distinguish an artifact from physically valid overlapping penumbras.
- [ ] Fix the demonstrated cause generally, preserving nearby small-caster
  detail and smooth distant-caster shadows across static and moving receivers
  wherever the affected path applies.
- [ ] Add a deterministic regression that fails before the correction and
  passes afterward, including the reported scene and a controlled mixed-depth
  caster fixture using the actual production shader path.
- [ ] Validate nearby poses, the existing five comparison poses and repeated
  same-condition performance. Preserve the recent shader-loading improvements.
- [ ] Update the relevant shadow specifications, this prompt's findings and
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

- Prompt created from the user's exact pose. The reported deformation has not
  yet been reproduced or attributed by this task.
- Append reproduction results, hypotheses, evidence, fixes and remaining work
  here after each investigation/implementation pass.

## On completion

- Mark the document DONE in its first line only after the reproduction is fixed
  and validation is complete.
- Rename to
  `prompts/AI_DONE_graphics_573_ATMOSPHERE_small_caster_shadows_near_building_penumbrae_DONE.md`.
- Keep it in `prompts/`; archive only on explicit request.
- Add a high-level one-line summary per completed change, the demonstrated root
  cause, before/after/reference image paths and a same-condition performance
  table with benchmark conditions and any remaining limitations.
