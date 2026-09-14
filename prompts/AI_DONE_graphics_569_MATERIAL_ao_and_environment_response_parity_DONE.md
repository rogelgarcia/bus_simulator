DONE — audit and gated prototype completed; no production renderer promotion.

# Problem

Continue material-response parity after AI568. The calibrated game remains
2.2–12.8% darker on the fixed shaded opaque-wall masks than the material-resolved
physical Cycles reference. Matching authored AO policy reduces that difference
to 1.2–7.7%. Native reflection approximations vary with roughness and view angle.
The user authorized committing the performance retest and proceeding with AO
first, then a gated reflection prototype and five-pose/close-up validation.

# Request

Improve actual material equivalence without fitting global lighting to a single
image. Keep the physical Cycles reference distinct from artistic matching controls.
Preserve useful material detail, authored colors, existing independent bus
reflection settings and the validated v7 bake. Do not claim 99% full-scene parity.

## Incremental plan

- [x] Commit the three fresh-browser pose-04 timing repeats (`aa6a1dc`).
- [x] Trace authored AO through source assets, production bake and runtime;
  distinguish duplicate geometric occlusion from unresolved material relief.
- [x] Quantify the AO contribution and spatial detail on all five fixed opaque
  wall masks, retaining glass exclusions and independent close-up validation.
- [x] Validate AO using an explicit geometric fixture and source-material
  controls; retain useful crevice shading. Apply a production correction only
  when supported by the controls, not because it reduces beauty-image error.
- [x] Prototype an environment-response correction behind a reversible toggle,
  using the independent white/HDR roughness/view-angle fixtures from AI568.
- [x] Compare the prototype on all five poses and the saved close-up, with
  unchanged lighting/exposure, separate shaded/sunlit metrics and three balanced
  GPU repeats at pose 02. Retain failed candidates and explain rejection.
  Promote production changes only if accuracy and performance justify them.

## Starting evidence and constraints

- AI568 findings: `prompts/AI_DONE_graphics_568_MATERIAL_game_cycles_opaque_surface_parity_DONE.md`.
- All artifacts below use `tests/artifacts/screens/ai562_acesfilmic_reference_matching/`:
  `ai568_resolved_capture_20260913_01`, `ai568_surfaces_20260913_05`,
  `ai568_resolved_analysis_20260913_04`, `ai568_specular_fixture_20260913_06`,
  `ai568_closeup_analysis_20260913_02`, `ai568_pose04_perf_retest_20260913_01`.
- Original calibrated game control: `material_validation_20260913_01`;
  fixed masks: `current_cycles_20260912_01`.
- Direct sun, sky source, exposure and base colors are not free fitting variables.
- Cycles resolved materials include native procedural color/roughness/world
  normals at 32px/m; authored AO remains an explicit independent channel.
- Physical Cycles must not silently become the postprocessed authored-AO control.
- Native AO affects indirect diffuse and roughness/view-dependent indirect
  specular, not Base Color or direct sunlight. Preserve that separation.
- The three pose-04 repeats did not reproduce the former 16.8ms GPU p99. On p99
  was 11.50–11.57ms; one isolated Off frame was 16.861ms. These were direct-pose
  starts, not the original five-pose traversal. No route-stall fix is claimed.
- Use registered `node tools/bake.mjs` leaves and the shared ignored Blender
  configuration. Keep generated artifacts ignored, never overwrite prior runs,
  never interrupt the user's occupied Blender session or overlap GPU benchmarks
  with diagnostic renders.

## Investigation log

### AO source trace

`tools/receiver_lightmaps/blender/transport.py` and its parent material adapter in
`tools/illumination_bake_compiler/blender/reconstruct.py` import base color,
roughness, metalness and normals but do not connect authored texture AO to the
production transport shader. Neither the bake nor current physical Cycles export
displaces the wall into the mortar relief represented by those textures. Runtime
AO is separate and affects indirect diffuse/specular, not direct sun. The source
brick pack has a displacement texture but no calibrated physical height scale.
**Decision: retain authored AO.** This is not a proven duplicate-texture-AO bug;
removing it would erase unresolved crevice shading to match a flatter reference.

### Independent controls, 2026-09-14

All paths below are relative to the artifact root above.

- `ai569_ao_response_20260914_01`: all five fixed wall masks. Native AO composition
  closes within 0.000002 scene-linear radiance. Shaded-wall AO explains about
  7.05/7.01/1.00/4.24/4.34 percentage points of physical Cycles brightness across
  poses 01–05. It is not a uniform lighting deficit.
- A white-only energy-gain LUT was rejected: held-out sky maximum error increased
  46.8% to 49.1%, and 24/56 sky cells worsened. Three sunlit wall masks also had
  greater RGB error. Brighter is not automatically more correct.
- `ai569_ao_geometry_20260914_04`: accepted 1024-sample neutral Lambertian fixture,
  white environment, explicit 0/5/10/20mm mortar relief. Beauty equals color-weighted
  direct plus bounce. Flat output is 0.179998 for albedo 0.18. At 5/10/20mm,
  physical mean Y is 0.169531/0.163454/0.157597; deliberately duplicating geometric
  AO reduces it to 0.161907/0.154953/0.150681. This proves the distinction; it does
  not certify an arbitrary depth or AO strength for the game asset.
- Retained failed/superseded geometry runs: `_01` missing AOV, `_02` used an
  unsuitable unit-material/one-bounce Combined visibility estimator, `_03` EXR
  passes were separate subimages. `_04` explicitly interleaves direct/color/bounce
  passes and enforces radiance closure. Do not use `_02` visibility measurements.
- `ai569_view_ggx_20260914_01`: 64-sample visible-GGX diagnostic, fixed dielectric
  IOR 1.5, independently measured white energy. Held-out sky average absolute
  ratio error 4.88%, maximum 20.7%; insufficient sampling.
- `ai569_view_ggx_20260914_03`: 256 samples, same inputs. Held-out sky average
  error 1.59%, maximum 6.75%; white anchor maximum 0.462%. White is the fit set,
  not independent validation. `_02` failed to fetch the pinned browser dependency.
  The prototype reuses global PMREM, adds no local reflections and retains AO.
  It is an offline diagnostic uniform toggle, not a shipped Options preference.
- Native reference fixture sky error was mean 15.23%, maximum 46.77%. This supports
  direction-dependent filtering as a material-response cause. It does not establish
  whole-scene equivalence: local glossy visibility and surface details still differ.

### Final city validation and decision

**Preserve production materials, authored AO, lighting, exposure and installed
bakes. Reject both reflection candidates for production.** The gain-only method
failed held-out validation. The integral costs too much and does not improve all
city walls. Its reversible uniform switch is confined to experiment scripts;
there is no new Options preference. Normal gameplay imports none of the new
integration code and allocates no new LUT.

Final outputs, relative to the artifact root above:

- `ai569_environment_capture_20260914_02`: six actual-game views, native/prototype/
  restored raw radiance and current v7 bake/camera/settings/hash checks. 418.5s
  total; 416.8s capture including a fresh 118.3s game/bake load. First use also had
  a substantial diagnostic shader-compilation stall before the warm timings.
- `ai569_environment_analysis_20260914_01`: 24.9s. Original native control and
  restored output match exactly on every fixed opaque wall mask (maximum error 0).
  All six three-column sheets and the close-up were visually inspected.
- `ai569_ao_response_20260914_02`: 17.4s. Final AO attribution bounds background
  AOVs for image-wide arithmetic, with independent range checks on wall pixels.
  It retains the findings without nonmaterial-background overflow warnings.
- `ai569_view_ggx_20260914_04`: 19.2s. Final input contract and exact-Fresnel report
  labeling for the prototype. Same numerical outcome as `_03`.
- First city capture `_01` is retained: its image/control checks passed, but the
  framework rejected the overall run after an unrelated analysis file changed
  during execution. `_02` repeats the entire workflow with fixed tool inputs.

Shaded-wall scene-linear mean Y relative to physical Cycles (1.0 is equal):

| Pose | Production | 256-sample diagnostic | Interpretation |
|---|---:|---:|---|
| 01 | 0.89343 | 0.89887 | Small improvement |
| 02 | 0.87195 | 0.87733 | Brick improves only 0.54 percentage points |
| 03 | 0.97812 | 1.03244 | Mean overshoots; RGB MAE nevertheless decreases |
| 04 | 0.88097 | 0.87498 | Brightness deficit and RGB error worsen |
| 05 | 0.89646 | 0.91966 | Improvement, still below physical Cycles |

Pose-02 sunlit RGB error also increases slightly. The separately labeled
authored-AO Cycles control changes pose-02 ratio 0.94345 to 0.94927, not 0.99.
The close-up retains differences in glass/bus/shadow proxies, which are excluded
from opaque-wall accuracy claims. No close-up region score was invented.

RTX 3060 12 GiB, driver 591.86, 1920x1080, pose 02, identical lighting and display.
Three balanced Off/On and On/Off pairs, 120 measured frames each after 60 settling
plus 60 warmup frames; 720 measured frames total. Completed GPU queries are joined
by submission ID. Native uses the same installed hook with the uniform Off.
No Blender render overlapped timing; other user applications stayed open.

| Repeat | Native GPU median / p99 ms | Prototype GPU median / p99 ms | Native / prototype CPU median ms | Native / prototype frame median ms |
|---|---|---|---|---|
| 1 | 10.405 / 11.385 | 22.309 / 27.983 | 21.80 / 22.10 | 22.00 / 22.30 |
| 2 | 10.285 / 10.835 | 20.975 / 26.288 | 21.65 / 21.75 | 21.90 / 22.00 |
| 3 | 11.531 / 13.235 | 25.373 / 30.545 | 26.85 / 23.05 | 27.10 / 23.25 |

Do not translate GPU time alone into FPS. CPU/frame time varies, especially in
repeat 3, but the repeatedly doubled GPU cost rejects this implementation.
Every pair retains 1,034 calls / 1,392,572 triangles, 104 textures, 1,537 geometries
and 174 programs. The diagnostic adds one 896-byte float LUT, reuses PMREM and
allocates no reflection render target. Driver shader allocations are unknown.
This cost is not shipped to normal gameplay. Other poses have image validation,
not repeated timing; the measured pose suffices to reject promotion.

### Follow-up direction

The expensive correction barely changes brick, so do not prioritize a production
replacement or global gain without further controls. Next isolate the remaining
**normal/filtering and diffuse-versus-specular response** on the same brick pixels:
geometric-normal and fixed-roughness game/Cycles controls, then restore channels
individually. AI568's pose-02 diffuse ratio rises from 0.960 to 0.995 with a 6px
additional inset; normal-angle tails remain large and specular still differs.
This is a testable hypothesis, not proof of another bug. AO removal is unjustified
without calibrated relief. Any cheaper environment approximation needs rotated
fixtures, all-five-pose masks and GPU checks before promotion. These are future
incremental experiments; AI569 completes the audit/prototype/promotion decision.

### Reproduction and changed files

Use `node tools/bake.mjs --target <leaf>` with
`--set <leaf>:<option>=<value>`. All leaves use prefix
`lighting/experiments/reference-matching/`; folder names below use the artifact
root above. Every output must be new. Do not edit declared input files mid-run.

1. `ao-geometry-fixture`: `output=<new folder>`.
2. `ao-response-study`: `capture=ai568_resolved_capture_20260913_01`,
   `reference=ai568_surfaces_20260913_05`, `fixture=ai568_specular_fixture_20260913_06`.
3. `specular-fixture`: `input=ai568_surfaces_20260913_05`, the resolved capture,
   `method=view-ggx`, `energy-fixture=ai568_specular_fixture_20260913_06`,
   `integration-samples=256`.
4. `material-parity-capture`: `capture=material_validation_20260913_01`,
   `control=current_cycles_20260912_01`, `phase=environment`, the energy fixture,
   `integration-samples=256`, and tracked
   `pose=tools/bake_lighting/experiments/reference_matching/material_validation_closeup.json`.
5. `environment-analysis`: the new prototype `capture`,
   `original=ai568_resolved_capture_20260913_01`, `reference=ai568_surfaces_20260913_05`,
   `closeup=ai568_closeup_20260913_01`.

New tools: `AoResponseStudy.mjs`, `ao_response_study.py`, `AoGeometryFixture.mjs`,
`ao_geometry_fixture.py`, `EnvironmentAnalysis.mjs`, `environment_analysis.py`,
`EnvironmentBenchmark.mjs`, `EnvironmentFixture.mjs`, `ReferenceEnvironmentControl.js`.
Extended `MaterialParity.mjs`, `RawRadiance.mjs`, `SpecularFixture.mjs`,
`specular_fixture.py`, `jobs.mjs`. New loader and `environment_reference*.glsl`
are experiment-only. Updated README, PROJECT_TOOLS, framework spec and research
log. Generated PNGs/raw radiance/blend files/receipts are ignored. No production
assets or defaults changed. The earlier performance retest alone was committed
as `aa6a1dc`; this new implementation is left uncommitted for review.

Two fixture-contract tests and 13 bake-framework tests passed through the selected
runner; original selection restored byte-for-byte. Actual shader, restoration and
bake-input gates passed in the six-view run. Shader-source policy, syntax and
whitespace checks passed. Prompt naming accepts this name but the whole-repo
validator still reports the five pre-existing AI524/525/497/498/archived480 issues
recorded in AI568. Those unrelated prompt files were not renamed.

## On completion

- Mark DONE and rename to
  `prompts/AI_DONE_graphics_569_MATERIAL_ao_and_environment_response_parity_DONE.md`
  only when the agreed work is complete; retain pending investigations explicitly.
- Do not archive automatically.
- Record each accepted change, its physical/appearance tradeoff, exact artifacts
  and reproduction commands. Separate measured results from hypotheses.
- Include same-condition CPU/GPU/workload/memory measurements for runtime changes;
  offline tools consume no game-frame time. Record unknown driver allocations.
