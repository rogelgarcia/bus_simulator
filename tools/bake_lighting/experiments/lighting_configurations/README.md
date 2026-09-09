# AI 560 lighting comparisons

Run the complete diagnostic experiment:

```sh
node tools/bake_lighting/experiments/lighting_configurations/run.mjs
```

The master captures the actual game, exports the city, runs six Cycles lighting
setups, derives color variants, analyzes them, renders a 4K shortlist and builds a
**pose-first** gallery. It never rebakes/publishes production data and is excluded
from production defaults. `--publish` fails. `--dry-run` lists the stage plan.

## Setup and resume

Use the repository's existing assets/dependencies and shared gitignored
`tools/baking/blender.local.json`. Set `executable` to the pinned Blender,
`browserExecutable` to Chrome, `pythonExecutable` to a Python containing NumPy,
OpenImageIO and PyOpenColorIO (the pinned Blender's bundled Python works), and
`renderDevice` to `CPU` or `OPTIX`. Missing configuration is created once with
instructions; nothing is downloaded. `archive` is not required here.

The master creates a new run unless an explicit run is supplied:

```sh
node tools/bake_lighting/experiments/lighting_configurations/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

All outputs remain under that gitignored artifact tree. Scripts and `config/*.json`
defaults are tracked. Resume verifies source/bake/config hashes and every output;
it never consumes an unrelated latest run. Ctrl+C/`--timeout-seconds` clean up only
owned processes. Browsers are isolated, GPU renders sequential, CPU threads bounded.

## Independent stages

Each stage has `node tools/bake_lighting/experiments/lighting_configurations/<stage>/run.mjs`.
Supply `:run=` above for existing runs. Preparation/capture can start a fresh run.

| Stage | Responsibility | Dependencies |
| --- | --- | --- |
| `prepare` | Tracked poses and installed source/bake identity snapshots | Node |
| `capture_baselines` | G00 screenshots, actual poses and applied-bake evidence | Chrome |
| `export_city` | Actual unculled city/bus GLB, cameras, linked bus placements, packed Blender project | Chrome + Blender |
| `verify_scene` | Reopen and evaluate all saved view-layer bus/camera transforms | Blender; no render |
| `render` | Multilayer linear EXRs, previews, source passes, calibration cards/sphere, reference Blender project | Blender |
| `postprocess` | AgX, real ACES 2.0 and exact runtime ACESFilmic exposure/grade variants | Python |
| `analyze` | Linear/display metrics, material regions, CSV/JSON, crops, provisional shortlist | Python |
| `capture_display_variants` | Native game tone/grading matrix using installed bakes, preserving G00 | Chrome |
| `report` | Offline gallery, pose-grouped sheets and timing/completion manifests | Chrome for sheets |

Render never starts the game. Postprocess/analyze never start Blender. Report uses
an offline HTML page, not the game. Only export rebuilds geometry. Tone changes
start at postprocess; threshold changes start at analyze; lighting changes reuse
the scene. Authenticated image receipts allow deterministic interruption recovery.

Render supports `--samples`, `--device` and scoped `quality=pilot|final`,
`poses=pose_01,pose_02`, `lights=L00,L01`, `resolution=1920x1080`,
`scene=<scene_manifest.json>`, `diagnostic=true`, `time-limit=<seconds>`.
Use `--set lighting/experiments/configurations/render:<option>=<value>`.
A reached render time limit fails quality validation. Postprocess/analyze accept
`quality=pilot|final` and an explicit `renders=<render_manifest.json>`; analyze
also accepts `processed=<postprocess_manifest.json>` and verifies that every
display record matches the supplied EXR's hash, pose, light and dimensions.
Capture-only 4K uses `:resolution=4k` on the capture entry.
An exporter-only rebuild accepts `export-city:source=<source_manifest.json>` and
validates the explicitly supplied GLB hash/source/poses before skipping the game.

## Scene contract

`source_poses.json` preserves the supplied payloads. `poses.json` defines five
unchanged camera quaternions and four buses. Views 01/02 share original bus 01
translated one meter along +X; the other transforms remain supplied. Square-pixel
16:9 is explicit because the original viewport was unknown. The 55° FOV is vertical.
Suspension/steering state was not supplied; the loaded rig is frozen.

G00 uses existing accepted shadows, enhanced indirect/AI 548, visibility and runtime
lighting/AO/display defaults, with Glass/Body/Rim controls Off. Personal Chrome
preferences and earlier AI 550 captures are not overwritten. Capture rejects
fallback, transitions, wrong sun profiles, missing resources, shader errors, pose
drift, clipped buses and conservative building-bound/ground-clearance failures.

Export includes scene-owned traffic signals and off-camera transport. Source PBR
clones lose runtime lightmap/AO/shader hooks; originals stay intact. Sky/glare meshes
are treated as environment/optical effects, not occluders. Geometry uses Three
`(x,y,z)` → Blender `(x,-z,y)` in meters. Visible landmarks/bus corners must project
within one pixel at 1080p. Named view layers exclude unrelated stored buses from
all ray types. Camera jobs never move buses. Textures are packed; OCIO is bundled.

## Lighting and color

`lighting.json` defines L00 source reconstruction, L01 clear daylight, L02 half sky,
L03 double sky, L04 photographic environment and L05 overcast. L00–L04 retain the
source sun direction. Sky solar discs are removed; one explicit Sun owns sunlight.
The proposed 80 klux / 12 klux trial is represented by relative radiance with the
same direct-normal/diffuse-horizontal ratio, not an asserted SI conversion.
Separate gray/white/color cards and a glossy sphere measure each setup. Exposure
remains globally 0 EV; gray-card exposure recommendations are reported separately.

Pilots: 1920×1080, 256 maximum/32 minimum samples, adaptive threshold .02.
Finals: 3840×2160, 1024 maximum/64 minimum samples, threshold .005. Bounces, seeds,
caustics and unclamped transport are tracked in `render_profiles.json`. A doubled
budget, independent seed and higher bounce limit provide a residual pilot check.
32-bit linear EXRs retain raw/denoised beauty, depth, normals, masks, transport
components and Sun/Sky light groups. Diffuse Direct includes environment light;
light groups include each source's bounces. Neither is a visibility mask.

`color_management.json` separates exposure, view and grade. T0 is Three.js r183
ACESFilmic plus sRGB encoding, distinct from real ACES 2.0. T1/T2 use the pinned
OCIO config. Linear Rec.709 is transformed, never relabeled ACEScg. Three transforms
at −1/−0.5/0/+0.5/+1 EV reuse the same EXRs. Both qualities include subtle
warm/cool/saturation/contrast alternatives for AgX only. Finals retain L00 plus
two provisional lighting candidates. The complete matrix contains 1,575 PNGs
from 45 beauty EXRs; the convergence diagnostic is analyzed separately.

The shortlist's declared clipping/saturation penalty aggregates all five poses; it
is a review aid, not a photorealism score. CSV/JSON, fixed image crops and material
masks support inspection. No automated ground-truth shadow-leak classifier,
perceptual hue rating or real-time FPS improvement is claimed.

Known limits: Phong shininess uses GGX approximation; shader-only interiors, grass
animation and procedural effects are not executed. glTF omits bump maps, reported
per material. Opaque windows do not gain invented transmission. L00 approximates
hemisphere fill and preserves the game's procedural gradient/haze without glare; its
transport remains approximate. L04 retains photographed context. Game/Cycles differences therefore include
material and environment translation, not only illumination.

The current terrain source explicitly suppresses environment reflections in the
game. Cycles evaluates reflections from its exported roughness map, so the grass
can appear wet. Do not reduce sky energy to compensate for this material
difference; assess a separately labeled roughness-calibration variant first.

## Review and reuse

Refresh all display choices and comparison pages from completed EXRs without
re-exporting geometry or retracing rays:

```sh
node tools/bake_lighting/experiments/lighting_configurations/review/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

Open `runs/<run-id>/report/index.html`: each pose has a game reference above
three tone columns, with one row per scene-lighting setup. Each sticky column
has its own 0.5 EV slider; only AgX has a look selector. Separate game tone/grading
menus use native G01 captures and preserve the original G00 reference. Clicking
an image opens a carousel with the game baseline first and the three tones after
it; use arrow buttons/keys or Escape. `diagnostics.html` retains wipe, crop and
blind-label tools. Select 1080p for all six lights or 4K for the shortlist.
Final contact sheets are `pose_01_comparison.png`
through `pose_05_comparison.png`. `timings.json` records successful stages and
path-tracing durations. Original baselines and EXRs remain available.

`capture_display_variants/run.mjs` independently captures the 120 native game
tone/grading references at 1080p and 4K. `verify_scene/run.mjs` reopens the saved
Blender scene and evaluates each view layer before comparing its bus/camera
matrices with the tracked poses. Both accept the same scoped `run` parameter;
neither changes the saved city or production bakes.

Display preferences may later map to exposure/view/grade controls. Sun/sky/IBL
changes need new authenticated bakes. Local bus GI/reflections and procedural
material parity remain separate engine work; this experiment changes no game
settings or published assets.

Sources: [Three.js r183](https://github.com/mrdoob/three.js/blob/r183/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js),
[Blender sky models](https://docs.blender.org/manual/en/latest/render/shader_nodes/textures/sky.html),
[existing CC0 environment](https://polyhaven.com/a/german_town_street).
