# Calibrated game / Cycles comparison (AI562)

AI570 primary-surface tests use `material-parity-capture:phase=primary-controls`
for poses 02 and 04. A uniform-only diagnostic bypasses primary normal mapping
and/or fixes effective roughness at 0.85. Native/restored beauty and receiver
coordinates, irradiance and LOD are retained. No baked transport or setting changes.
`primary-surface-reference` takes authenticated `input`, frozen-mask `control`
and new `output`, reuses
the saved resolved Blender scene, changes camera-ray material inputs only and
renders the same factorial plus a gray Lambert pose 04 full/sun control. Only
MAT396/MAT1624 primary inputs are changed. A padded wall render region retains
full camera dimensions and all secondary-ray geometry, and native region renders
are compared with the previous full-frame native reference.
`primary-surface-analysis` takes `capture`, `reference`, `bake-dir`, `output`;
it verifies that the offline bake matches the installed package, traces packed
mips against actual GPU sampling, checks Lambert composition and measures fixed
glass-excluded wall masks with 0/3/6px additional insets. These are diagnostic
stages, never publication. All commands run through `node tools/bake.mjs`.

AI568 distinguishes **production appearance** from **source-material lighting
controls**. The current glTF export omits procedural wall variation and texture
AO. Each new exported material retains a `comparisonContract`, including the
original variation parameters, and the reusable Blender material carries the
same metadata. These omissions prevent an appearance deficit from being reported
as isolated missing illumination. Existing authenticated references are retained.

`material-parity-capture` with `phase=source`, authenticated `capture`, `control`
and new `output` captures all five poses. It keeps original/restored game beauty,
AO-only bypass and source-material controls. Source controls temporarily remove
the same procedural layers omitted by glTF, retain source texture/factor/UV inputs,
and restore uniforms in `finally`. They never change production preferences or
installed bakes. `material-parity-analysis` automatically recognizes these captures
and writes all-five-pose current/Cycles pairs, three-column wall-only controls,
scene-linear lobe ratios, material/AO attribution and 3px/6px inset sensitivity.
The diagnostic image is explicitly labeled and is never called the current game.

`bake-progress-review` takes `current=<capture>`, `reference=<Cycles reference>`
and `output=<new artifact directory>`. It produces two-column current game/Cycles
comparisons. Optional `previous=<capture>` adds a previous-bake column and change
measurements; omit it to keep the images and report focused on current parity. It reuses
authenticated images and EXR material passes without launching Blender or the
game. An isolated browser adds captions to the image sheets. All five poses,
projection, exposure, graphics, material controls and fully
applied bakes must match before analysis. Source revision differences remain
explicit in the request. It creates five captioned previous/current/Cycles PNG
sheets (two columns without a previous capture), original-resolution images,
facade crops, inspectable eroded masks and
regional measurements. `bake_progress_regions.json` records the fixed regions.
The metrics measure displayed images, not raw irradiance or photorealism. Glass,
bus materials and reference convergence remain limitations; no publication or
defaults change occurs.

For a single exact pose, use the `pose-comparison` stage with `pose`, `output`
and `source-run`. It produces `game.png`, `cycles.png` and authenticated evidence.
It requires applied installed bakes by default. To document an already observed
game fallback, explicitly supply `expected-fallback` with the exact failure reason.
This waits for that terminal state and checks it before and after capture; it
does not override the game settings or activate an incompatible bake. Such an image
must be labeled as live fallback lighting, not as a baked-lighting comparison.

All stages use `node tools/bake.mjs --target lighting/experiments/reference-matching/<stage>`
and the shared ignored `tools/baking/blender.local.json`. These explicit experiment
jobs never enter the no-argument production bake set. Supply leaf options with
`--set <target>:<option>=<value>`; choose new output directories under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/`.

| Stage | Required inputs | Output / purpose |
| --- | --- | --- |
| `baseline` | `output` | Immutable original game, source and installed bake bytes; all five poses |
| `sky` | `source-run`, `output` | Validates E55 EXR → linear HDR transport. `--publish` installs only the verified sky asset |
| `capture` | `output`; optional `mode=current\|baked\|auto`, `quality=pilot\|final` | Actual game screenshots, poses, effective lighting, bake states and frame costs |
| `capture` replay | `replay` original baseline | Streams frozen source/assets through an isolated browser; records original served identity separately from the capture tool |
| `capture` uncalibrated55 | `uncalibrated-from` authenticated original baseline, `mode=current`, `quality=final` | Original measured lighting settings at55° on the corrected runtime; verifies light settings and rejects active incompatible bakes |
| `capture` candidate | `candidate-run` completed framework run, `mode=baked\|auto` | Revalidates receiver publication, routes candidate indexes only in the isolated browser and retains native compatibility gates. Does not replace installed indexes |
| `reference` | `capture`, `source-run`, `output`, `mode=background\|headed` | Actual city export, verified cameras/shared buses, reusable packed Blender scene, five Cycles EXRs and ACESFilmic PNGs |
| `native-validation` | `source-run`, `output` | 55° raw sun/sky/additivity and near/far finite-shadow fixtures, authenticated against the afternoon measurements |
| `shadow-diagnostic` | `input` BSIB, `production-root`, `native-cutout-root` | Retains failed native parity evidence with production eligibility explicitly false |
| `cutout-diagnostic` | `input` BSIB, authenticated `candidate-root` | Bounded foliage tile inspection; partial output cannot be published |
| `diagnostics` | `output` | Isolated sun, sky, visibility and normal-map contributions at pose03 |
| `transport-diagnostics` | `output`, optional `candidate-run` | Waits for applied Baked mode, then captures bus material/display diagnostics with an external deadline; diagnostic receipts cannot authorize installation |
| `transport-reference` | `input` authenticated reference, `capture`, `output`; optional `candidate-run`, `reconstruct-source=true` | Isolates geometric-normal primary diffuse response, optionally with the exact bake world and static scene. Dynamic bus regions are excluded from reconstructed-scene interpretation. |
| `transport-textures` | `output` | Native Cycles regression for raw sRGB, linear data, HDR and coverage inputs, including packed Blender save/reload. No game or bake publication. |
| `review` | `iterations` comma-separated capture directories, `reference`, `output` | Pose-grouped history, historical targets, regional crops, display diagnostics, cost tables and keyboard carousel |
| parent `reference-matching` | `baseline`, `source-run`, `output`; optional `history`, `mode`, `quality`, `blender-mode` | One capture → export/render → review iteration; resumes completed stages only under the same source/settings/recipe signature |
| `production` | Parent options plus shared `--profile ai527.sun.az045.el55`, `--samples`, `--device` | Authenticates or builds shadow/indirect dependencies, then runs the parent against those candidate indexes |
| `install` | `candidate-run`, `capture`, `native`, `output`, `--publish` | Requires five applied game views, successful native checks and stable actual-game transitions before installing development caches |

Pilot renders are 1920×1080, 128 Cycles samples; final renders are 3840×2160,
256 samples. Camera01/02 share one bus; other buses are excluded per view layer.
The original selected targets remain labeled historical: they do not have the
new 55° source light, so they are visual context rather than numerical truth.

When an `uncalibrated-from` capture is included in `review` iterations, the main
columns and the carousel show only uncalibrated game55°, final calibrated game55°
and calibrated Cycles55°, in that order. Thumbnail labels and the large-image
caption identify the renderer, live/baked mode and actual exposure. Earlier
iterations remain in collapsed archives and never enter the final slideshow.
Regional crops also default to these three versions.

The uncalibrated control preserves the measured original sun/hemisphere/HDRI,
visible sky and exposure settings, sets sun elevation55°/azimuth45°, uses
ACESFilmic with grading and sun bloom Off, and runs current corrected source.
Its original35° bake cannot apply. This is a comparison of complete lighting
configurations (including live versus baked transport), not a claim to isolate
calibration alone or replay the old renderer at55°.

Use the accepted afternoon run as `source-run`:
`tests/artifacts/screens/ai565_daylight_calibration/afternoon/afternoon-02`.
The source is measured before display exposure, uses one 0.53° sun and a disc-free
sky, and includes no duplicate hemisphere. The shared display is Three r183
ACESFilmic, multiplier0.0511001705221839, grade Off and one sRGB encoding. Capture
metadata reports every postprocessing setting. Original baselines preserve their
original optical settings; revised comparisons explicitly disable sun bloom.

Production bakes remain separately owned:

```sh
node tools/bake.mjs --target lighting/illumination --samples 128 --device OPTIX --profile ai527.sun.az045.el55 --timeout-seconds 14400
```

This builds complete compatible receivers and a validated shadow candidate. It
keeps installed indexes intact unless an existing publication stage is explicitly
invoked. The historical AI531 exact-eight aggregate release remains a separate
certificate; E55 is independently available and must pass its own native parity.
Never reuse a 35° shadow or bounce package under 55° input hashes.

High-sun foliage capture uses the full native Three shadow renderer and bounded
region readback. Each region, Depth24 attachment and sampler-restoration proof
is checked against the source grid; this avoids a separate tile rasterizer's
alpha-edge discrepancies. Diagnostic jobs never mint a production certificate.

At55°, the production basis uses `three-r183-source-lattice-v2` to align the
cache with the native shadow camera. Its default864m/16384 grid has a5.2734375cm
pitch, with2040-square tile interiors and2048-square stored tiles. This replaces
the960m/16384 grid (5.859375cm pitch); full-city coverage, the512MiB container and
64MiB chunk limits remain enforced. Existing compatible
low-angle profiles retain their680m/16384 grid and original basis. Native
validation derives its grid from the same authenticated profile contract.

The `production` parent adds the bake dependencies to the same shared runner;
it does not start a nested bake process or bypass the lock. Installation is a
separate final step so rejected candidates cannot replace the installed indexes.

For a shadow-only rebake, `capture` and `install` accept `shadow-run` alongside
`candidate-run`. The former supplies a completed framework shadow run; the latter
supplies the existing validated receiver run. Both summaries and package indexes
are hashed into the capture receipt. The receiver publication validator, exact
runtime source matching, five-pose capture, native validation and transition gates
remain required. This lets a shadow-density change reuse the installed-quality
indirect maps without rerendering their independent light transport.

Every iteration uses a new immutable directory. An interrupted stage is preserved;
choose a new iteration instead of overwriting partial images. Complete receipts
hash all outputs. Reuse accepts matching identities only. Export uses the AI560
cache after fresh source/material identity checks; Blender and browser processes
are owned and reaped by the shared framework. Leave a user's open Blender alone;
use an isolated background session when it is occupied.
The shared runner records `blender-runtime.json` in each stage and keeps temporary
tile files under `tests/artifacts/screens/baking_tmp/<stage-hash>/`. The short,
job-specific path avoids Windows filename limits during UHD tiled renders.

The review accepts optional comma-separated `rejected` iteration directories.
It verifies their saved image bytes, labels incomplete checks explicitly and
excludes those images from numerical acceptance comparisons. They remain visible
as progress history without inventing a successful capture receipt.

Frame timing: 60 warm-up frames and 180 measured frames per pose. CPU measures
`GameEngine.updateFrame`, including preparation and submission, and excludes
refresh waiting. GPU uses the existing asynchronous whole-frame timer; consecutive
samples can repeat the latest available result. Report median/p95, resolution,
GPU, draw calls and memory alongside the actual Current/Baked workload. The first
`000_baseline` CPU metric measured an inactive entry point and is invalid; immutable
`005_original_replay_streamed` provides the corrected original CPU measurement.
Candidate captures retain hashes and contents of the exact routed indexes
separately from ordinary disk resources; original installed indexes remain
untouched during comparison. UHD raw image transfers use bounded chunks.

Regional errors use linearized **display** pixels, not physical irradiance.
Native fixtures perform the independent raw radiance checks. Proxy interiors,
Phong versus Principled, procedural surface translation, AO and finite-shadow
reconstruction have stated approximation limits; a smaller image score does not
certify photorealism. Keep failed/rejected iterations and unknown historical
metadata visible. The existing three-tone AI560 viewer is unchanged.

The review's optional comma-separated `references` argument preserves prior authenticated Cycles exports in the history. Only `reference` supplies the current numerical comparison. New installation requires authored-UV and raw-texture transport v3; historical v1/v2 remain readable for baseline replay.

`transport-reference --set …:input=<reference> --set …:capture=<1080p capture>
--set …:output=<new directory>` reuses an authenticated city scene for a diagnostic
control. It uses primary Lambert diffuse with true geometric normals and zero
glossy bounces, retaining secondary authored materials and alpha boundaries. It
renders poses02/03 and their sun contributions, then measures native raw captures
on eroded material masks. Its separate `transport_receipt.json` is diagnostic
only and cannot stand in for the full physical reference or authorize publication.

City mode changes hold the previous canvas during cancellable shader readiness
polling. Reflection changes keep rendering the active city. Capture and install
require measured transition frame gaps ≤2s; the final capture repeats full modes
twice and records resources. This ceiling catches the former 24s first-use driver
stall; initial world preparation is still visible and is reported separately.
Report grids and thumbnails use 640px previews; the carousel opens original
full-resolution images. Raw measurements retain separate named-sun, ambient,
material-AO-off and Cycles diffuse-ambient values.

`lighting/experiments/reference-matching/material-diagnostics` accepts
`input=<authenticated pose-comparison directory>`, `output=<new AI562 directory>`
and `regions=<JSON of named normalized [left,top,right,bottom] rectangles>`.
It loads that exact pose in a fresh browser with repository defaults, requires
fully applied compatible indirect lighting and the reference's unchanged exposure,
then captures scene-linear beauty, material AO off, diffuse-only, diffuse without
material AO, and base color. The original raw capture is repeated to verify that
the static regions restore. Settings, pose, source hashes, material ray samples,
browser errors and before/after bake state are retained. The diagnostic shader
hook is loaded only by this harness and is removed after capture.

The analyser reuses the existing multilayer Cycles EXR, reconstructing diffuse
radiance as `(Diffuse Direct + Diffuse Indirect) * Diffuse Color`. Eroded material
masks and named regions quantify the difference before display transformation.
PNG comparisons use the same ACESFilmic exposure; base-color images are explicitly
unlit sRGB diagnostics. This job creates evidence only: it cannot change defaults,
rebake, install assets, or certify production parity. Raw game views bypass
postprocessing, and material texture AO must not be confused with screen/contact AO.

`material-analysis` accepts `input=<saved material diagnostic>` and a new `output`
directory to rerun analysis and assemble comparison PNGs without loading the game.
It rejects browser errors, changed settings and inactive bakes. Raw dimensions,
finite values, fixed exposure and static-region restoration must also pass.
The analyser uses the shared Python/OpenImageIO runtime; captioned comparison
images use the configured isolated browser, without requiring Pillow or publishing
a viewing page. The capture hides the layout-affecting performance bar and checks
the actual canvas size before rendering.

## Opaque building material review

The independent `lighting/experiments/reference-matching/building-review-capture`
leaf takes `output=<new AI562 artifact directory>` and optionally `pose=<exact
paused pose JSON>`. It captures the canonical five poses plus that custom pose,
compares opaque environment reflections on/off, and measures four passes per
variant across two fresh sequential browsers (60 warmup + 240 measured frames).
GPU samples are completed asynchronous queries joined by submission ID, not the
last displayed timer value. Settings, bake identities, material identity and
shader versions must remain unchanged. The custom pose also gets raw diffuse,
AO-off and albedo diagnostics. Outputs are authenticated and never published.

`material-response-capture` takes `capture=<authenticated fixed-display game capture>`,
`phase=matrix|validation`, and `output=<new directory>`. Matrix mode tests poses 02
and 03 with opaque reflections off/on crossed with authored material AO on/off.
AO is bypassed only synchronously inside rendering and restored before another
engine update, so the bake freshness check never sees a changed source material.
Validation mode tests reflection off/on across all five poses with material AO
retained. Both modes use two fresh sequential browsers and two balanced passes
per condition/browser, 240 matched GPU samples per pass. The source capture's
display, bloom, bus, lighting and baked preferences are retained explicitly.

For a focused timing repeat, validation accepts `pose-ids=pose_04` (or a
comma-separated subset) and `browser-runs=3`. Each repeat owns a fresh sequential
browser, uses both off/on and on/off pass orders, and retains all 240 measured
frames per condition/pass. Defaults remain all five poses and two browsers.
Unknown/duplicate pose IDs and browser counts outside 1–10 are rejected.

`material-response-analysis` takes `capture=<material-response capture>`,
`control=<authenticated current/Cycles bake-progress-review directory>`, and
`output`. It rejects changed poses, exposure, lighting, graphics or bake identity,
then reuses the control's fixed eroded material masks. It writes regional image
errors and repeated timing statistics. Validation produces only current game /
Cycles image pairs. Both modes also write `facades/` wall-only image pairs with
unmeasured pixels (including windows/frames) replaced by gray, plus game overlays
showing the selected wall pixels. Additional 3/6-pixel insets measure boundary
sensitivity and retain pixel counts in the JSON and Markdown report. These are
Cycles material-ID masks applied to aligned game captures, not independently
intersected game/Cycles ID passes. These leaves do not bake or publish assets. AO-off is a
diagnostic, not an automatic recommendation to remove authored material detail.

AI568 continues the opaque-wall study through two independent diagnostic leaves.
`material-parity-capture` takes `capture=<authenticated material validation>`,
`control=<current/Cycles bake-progress-review>`, and a new `output`. It retains
the calibrated v7 controls, sets opaque reflections On in an isolated browser,
and captures scene-linear AO-on/off beauty and diffuse, AO-off live-sun diffuse,
sky/bounce diffuse, albedo and a restored beauty for poses 02/03. Texture-AO
changes exist only inside a synchronous render. This is not a timed benchmark.
The engine is stopped for the raw pass sequence and resumed afterward: pausing
the simulation alone does not stop renderer/streaming updates. Frame identity
and restored wall radiance must pass before the analysis is accepted. Requested
shadow-detail pages must finish loading/uploading before freezing the frame.
`material-parity-analysis` takes that `capture` and a new `output`. It authenticates
the existing Cycles reference, reuses its full and sun-only EXRs, and compares
raw lobes on the frozen wall masks plus 3/6px insets. Outputs include albedo and
AO-off/diffuse wall-only pairs, term ratios and restoration/reconstruction checks.
Cycles Direct includes sky, so named-sun diffuse comes from the sun-only Direct
pass; full diffuse minus that term is compared to the game's sky/bounce diffuse.
Cycles Diffuse Color includes BSDF diffuse weighting: its ratio with game
diffuseColor and the color-normalized diffuse result are diagnostics, not exact
albedo/irradiance certification. No new Blender render or asset publication is
required. The incremental plan and evidence inventory live in
`prompts/AI_DONE_graphics_568_MATERIAL_game_cycles_opaque_surface_parity_DONE.md`.

`building-review-render` takes `capture=<capture directory>`,
`source-run=<authenticated afternoon source>` and `output=<new directory>`.
It exports a fresh reusable scene, resolving coplanar grass/road coverage, renders
all captured poses in Cycles, then reuses that scene for primary geometric-normal
Lambert controls. Both use identical exposure and the calibrated atmosphere.
The control is diagnostic only and cannot replace the full target or certify a bake.

`building-review-analysis` takes `capture`, `reference=<render directory>` and
`output`. It verifies inputs/poses/exposure, creates three-column image sheets
(Game original / Game reflections / full Cycles), a raw diffuse control sheet,
material-mask measurements, and a timing table. No viewing page is required.
The custom pose also reports reflection on/off RGB error against the full target
on eroded opaque material masks. These are display-image errors, separate from
the scene-linear diffuse ratios; neither is a full-scene photorealism score.
All three leaves use `node tools/bake.mjs --target <leaf> --set <leaf>:<key>=<value>`
and the shared local Blender/browser/Python configuration. Run them in that order;
rendering and GPU benchmarking must not run concurrently.

`irradiance-trace` takes `capture=<building review capture>`,
`reference=<building review render>`, `bake-dir=<original installed bake directory>`
and `output=<new AI562 directory>`. It verifies that the installed mapping and
package match the offline bake, captures actual GPU atlas coordinates/LOD,
irradiance and separate diffuse lobes, then samples the original Cycles passes,
processed float pages and authenticated RGB9E5 pages at those same addresses.
The report separates padding, quantization, GPU interpolation and Lambert
composition. It preserves and checks restoration of the original static image.
This diagnostic does not rebake, install or change production lighting.

`irradiance-analysis` takes `input=<preserved GPU trace>`, `output=<new directory>`
and optionally `control=<authenticated irradiance-reference directory>`. It checks
capture restoration and original pass/page hashes again. The optional control
adds separate sky/bounce comparisons with the same source-scene Cycles render.
It can validate a preserved capture whose original analysis failed, without
rewriting or certifying that failed run. Cross-renderer material-mask pixels
without receiver coordinates are counted separately and excluded from sampling.

`irradiance-reference` takes `input=<validated irradiance-analysis directory>` and
`output`. It first renders the exported scene with the bake's exact source world,
then reconstructs the static source package and repeats the render. Both use a
primary geometric-normal Lambert diagnostic. The dynamic bus is absent from the
static-source control; neither control is a replacement for the full target.

`irradiance-fixture` takes `input=<irradiance-reference directory>` and `output`.
It records inherited Cycles settings and checks sky and sun-bounce bake/render
parity in a 64-pixel fixture. The comparison multiplies white receiver irradiance
by the rendered material's albedo and checks linear radiance, without exposure.
The default uses the native surface setup. `sample-clamp=10` intentionally
reproduces the historical bright-bounce failure; it must not pass the parity gate.

`irradiance-wall` takes the same inputs. It selects an original brick chart visible
in the GPU trace, reuses its exact geometry and UV coordinates in the authenticated
static scene, and rebakes only that chart with indirect sample clamps 10 and 0.
It reports reproduction of the stored bake and the isolated clamp effect. These
tiny diagnostic bakes never replace production assets or skip publication gates.
`replay=<accepted wall directory>` reuses authenticated samples in a new output
directory. Analysis checks original page hashes, requires the control to reproduce
the stored chart within 6% (different sample counts/batching), and requires both
unclamped lobes to agree with Cycles within 2.5%. These local limits do not certify
the entire city. Existing v6 maps require a full validated v7 rebake after the
fix; reprocessing cannot restore paths discarded by sample clamping. The full
bake, installation and remaining game/Cycles differences are recorded in
`debug_tools/regression_debugging/receiver_irradiance_delivery.md`.
# AI568 causal reflection controls

`material-parity-capture` accepts `phase=reflections` for direct/environment
specular and primary flat-normal passes. Original material values and the engine
frame are restored; this does not change production settings.

`material-transport-control` accepts authenticated `input` (a reference directory)
and a new `output`. It reuses `calibrated_city.blend` to compare local versus
unoccluded glossy transport, with and without primary normal maps. Outputs are
diagnostic EXRs/PNGs and an authenticated receipt. It does not publish bakes.
# Native surface-material reference (AI568)

`/surface-reference` reuses an authenticated resolved `/reference` output (`input`,
new `output`) and validates the native atlas UV convention before rerendering.
`/surface-analysis` takes an authenticated raw material `capture`, the new
`reference`, and new `output`; it checks controls, input color/roughness and
wall-only radiance, and creates current-game/Cycles pairs. Both are standalone,
registered framework stages and cannot publish.

The existing `/reference` stage defaults to `surface-materials=on` and
`surface-density=32`; explicit `off` retains the original source-only diagnostic.
It accepts `surface-density=16|32|64` (pixels/metre) and evaluates opaque building
materials on camera-independent planar charts and imports their linear color,
roughness/metalness and world normals into Blender. Generated atlases remain
gitignored and are packed into the reusable blend. Texture AO is an independent
AOV, never baked into Base Color. View-distance blending and unsupported animated
or instanced surfaces fail explicitly. Fixed-density derivative filtering remains
an approximation and requires density/convergence validation. This option changes
the offline reference only; it neither changes the game nor publishes light maps.

`material-parity-capture:phase=resolved` captures all five poses with native
material values, world normal, authored AO and separate diffuse/specular lobes.
Optional `pose=<tracked pose JSON>` appends an independent close-up. The tracked
`material_validation_closeup.json` contains the user's additional brick view.
`surface-reference:capture=<resolved capture>` adds unmatched saved poses to the
reused scene and isolates their bus copies with view layers.

`surface-analysis:previous=<reference>` measures declared density convergence;
`transport=<material-transport-control output>` adds a same-reference glossy
visibility control. Use `material-transport-control:phase=global-only` to retain
all five poses with city meshes hidden from glossy rays only. The analyzer writes
physical current-game/Cycles pairs, input/lobe metrics and 0/3/6px wall-mask
sensitivity. It also writes explicitly labeled **Cycles + authored AO** wall-only
controls. These multiply sky/bounce diffuse by the exported AO and environment
specular by Three's roughness/view-dependent occlusion formula. Named sunlight,
Base Color and the physical reference remain unchanged. This artistic control
explains mismatched material policy; it is not a substitute physical reference.

`specular-fixture` takes an authenticated resolved `input`, native `capture`, and
new `output`. It isolates roughness and view angle under white and disc-free sky.
Actual geometry/projection checks precede rendering. `specular_integral.py`
independently integrates visible GGX with exact dielectric and Schlick Fresnel,
checks sample convergence and compares white-normalized angular response.
The job checks the analytic sky against the actual HDR file, retains native
shader source and records explicit engineering tolerances. It changes no game
shader, creates no production lookup texture and permits no publication.

# AI569 AO and environment response

All stages below are explicit leaves beneath
`lighting/experiments/reference-matching`, invoked through `node tools/bake.mjs`
with `--set <leaf>:<option>=<value>`. They use the shared Blender/browser/Python
configuration, require a new output directory and reject publication.

- `ao-response-study`: authenticated `capture` (resolved material passes),
  `reference`, white/sky `fixture`, and `output`. Attributes authored AO loss on
  the five frozen opaque wall masks and tests a white-only energy correction
  against held-out sky. Diagnostic AO bypass does not certify removal of AO.
- `ao-geometry-fixture`: `output`. Renders metric mortar relief under a neutral
  white world, checks direct/bounce closure and compares deliberately duplicated
  geometric AO. The source brick height is uncalibrated; fixture relief is not
  an inferred production material height. EXR passes must be interleaved.
- `specular-fixture:method=view-ggx`: additionally requires `energy-fixture`, an
  authenticated previous fixture. `integration-samples=64|256` controls visible
  GGX quadrature; white energy is the fit set and the disc-free sky is held out.
  This diagnostic is limited to F0 .04 dielectrics. The existing native method
  stays the default. Runtime hooks exist only in experiment pages.
- `material-parity-capture:phase=environment`: uses `capture`, `control`,
  `energy-fixture`, `output`, optional `pose=.../material_validation_closeup.json`
  and `integration-samples=64|256` (city default 256). Captures native/prototype/
  restored raw radiance for five poses and the optional close-up. The temporary
  control affects only opaque, nonmetallic Standard building materials, excludes
  windows, and retains authored AO. Pose 02 receives three balanced 120-frame
  whole-frame GPU timing repeats after warmup; no Blender process runs alongside
  this benchmark. All bakes, settings, camera and bus controls are checked.
- `environment-analysis`: `capture` (prototype), `original` (resolved native
  capture), `reference` (five Cycles views), `closeup` (Cycles custom view),
  `output`. Authenticates all inputs, tests restoration/native radiance drift,
  and writes full-resolution images, compact three-column sheets and opaque-wall
  measurements. Sheet order is current game / diagnostic prototype / physical
  Cycles. The optional AO-matched Cycles score is separately labeled artistic.

The experiment adds one 896-byte white-energy texture and reuses resident PMREM.
Driver shader allocations are unknown. Shader compilation is excluded from warm
GPU timing and must be considered separately before any promotion. The prototype
is intentionally absent from game defaults, Options and production baking.
AI569 records rejected candidates and the promotion decision; a validated tool
receipt certifies reproducibility, not visual superiority or acceptable cost.
## AI571 surface transport continuation

`surface-transport` authenticates AI570 analysis via `input`, requires a new `output`,
and supports `phase=processing` to replay page 3 extension and hidden-sample replacement
before comparing archived seam results, or `phase=transport` for controlled Cycles
reconstruction. Additional phases:

- `geometry`: also requires the authenticated `capture` from
  `material-parity-capture:phase=geometry`. Captures actual world positions and
  face normals, then compares to camera-matched Cycles AOVs and ray-hit records.
- `geometry-analysis`: requires `geometry`, the preceding geometry stage output.
  Rejects the misleading practice of normalizing mixed-face antialiasing AOVs
  before comparing them to single game fragments. Reports all pixels and
  comparable surface pixels separately; full-wall radiance scores remain intact.
- `spatial`: requires `processing` and `transport` outputs. Rebakes the seven
  measured charts at 0.33m joined/unjoined, 0.165m and 0.0825m. The full city
  remains present for secondary rays; new UVs map back to exact captured addresses.
- `refined`: uses those same inputs, includes every chart of the measured receiver,
  and compares baseline, narrow-axis refinement and full 0.0825m detail with
  the existing seam solver. Seams across other receiver objects are not part of
  this bounded pilot. It is not a production-package or city-wide memory test.

All phases require the same AI570 analysis `input` and a new `output`. Artifacts
remain under the experiment screenshot root; no publication. Example option
prefix: `--set lighting/experiments/reference-matching/surface-transport:phase=refined`.
The shared local toolchain supplies Blender, Python and device paths.
