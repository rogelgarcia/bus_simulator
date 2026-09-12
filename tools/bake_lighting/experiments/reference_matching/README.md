# Calibrated game / Cycles comparison (AI562)

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
