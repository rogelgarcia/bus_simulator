# Problem

The accepted baked indirect lighting (including AI 548) is useful, but the daytime scene can still look artificial. The current bake inherited game lighting choices; neither those settings nor a brighter image prove that the scene is physically well lit. The user wants a controlled Blender ray-traced comparison using five supplied gameplay views, several lighting proposals, AgX/ACES and restrained grading, aiming for photorealism.

# Request

Build a reusable BigCity2 lighting experiment in Blender Cycles, with separate tracked scripts for each stage and a fully automated master to coordinate them. Track the default poses and suggested lighting configurations alongside the tools; keep generated scenes, images and run metadata gitignored. Render all five supplied camera views under a documented set of lighting configurations, compare consistent display transforms and image diagnostics, and present a ranked shortlist for the user to judge. Save the scene, all five cameras and four bus placements in a reusable Blender file: cameras 01 and 02 share one bus, while the three other locations each retain a separate copy.

This is a reference-rendering experiment. Its results should identify better lighting and bake-authoring targets and remaining material/geometry limitations. Keep the accepted engine, baked indirect/AI 548 and production assets intact; do not re-enable baked direct or promote a new game configuration merely because an offline image looks better.

There is no single universal "AAA lighting preset." Use established physically based game-production practices—consistent units, calibrated materials, one coherent sun/sky, controlled exposure, scene-linear transport, path-traced reference checks and documented color management. Clearly label the numerical proposals below as experimental starting points, not industry mandates or guaranteed physical truth.

## Implementation progress — automated comparison workflow (2026-09-08)

### Comparison viewer follow-up

- [x] Use three columns for ACESFilmic, AgX and ACES 2.0, with a game reference first and one subsequent row per scene-lighting configuration.
- [x] Keep tone headings and independent settings visible above their columns; expose stepped exposure controls at 0.5 EV increments.
- [x] Put the offline look/grade control only in the AgX column's settings section; do not show an irrelevant grade control for the other tones.
- [x] Capture native game tone-mapping and grading combinations with today's baked data, preserve original G00 references, and select these baselines through separate menus.
- [x] Clicking an image opens an in-page full-screen carousel ordered game baseline, ACESFilmic, AgX and ACES 2.0, with arrow icons, arrow keys and Escape.
- [x] Validate independent controls, carousel ordering and saved scene view-layer camera/bus transforms; publish the updated comparison pages and measured timings.

Completed comparison artifacts are in the run's `report/` directory: 30 pilot
and 15 final beauty renders, one transport diagnostic, 1,575 display variants,
10 original G00 references and 120 native G01 tone/grading references. All five
saved Blender view-layer poses pass fresh evaluation. Original workflow wall time
was 6,525 seconds, followed by 604 seconds for the expanded 4K display matrix and
1,841 seconds for the complete display-reference/analysis/gallery refresh.
These are measured invocations with documented cache reuse, excluding development
gaps. `review/run.mjs` rebuilds comparisons from saved EXRs without ray tracing.
The detailed material-parity and advanced semantic-validation requirements below
remain open; no production lighting preset has been promoted.

The follow-up request expands the completed baseline stage into the full workflow.
Tracked preparation, capture, standalone city export, Cycles rendering, color
processing, analysis, report stages and their JSON defaults now live in
`tools/bake_lighting/experiments/lighting_configurations/`. The master coordinates
six-light pilots, a provisional shortlist, matching 4K game baselines and final
references. See the owning README and `specs/graphics/lighting_configuration_experiments.md`.
This AI remains open for the detailed material/region-validation requirements
identified below; generated comparisons alone do not establish photorealism.

Validated run: `tests/artifacts/screens/illumination_560/runs/run-1788907361363-8928a069/`.
All five 1920×1080 G00 images and actual camera/bus-pose JSON companions were captured
with installed shadows, enhanced indirect and PVS active. Cameras 01/02 share the
authored placement; all five loaded buses fit their cameras and passed conservative
building-bounds/road-clearance checks. Inputs and requested assets retained their
hashes, and page/resource/shader diagnostics were empty. The run uses repository
defaults and original bus materials in an isolated browser, not personal Chrome
settings; prior AI 550 artifacts were preserved. No production bake ran.

Measured workflow time: **125.6 seconds**; game/bake startup **109.7 seconds**.
Five captures/pose evidence took **12.7 seconds** combined; remaining time covers
preparation, cleanup and identity verification. Four baseline boundary tests and
twelve shared bake-framework tests passed. All five images were visually inspected;
the owned browser and static server exited. An initial failed capture exposed the
performance bar's reserved 24-pixel inset; the capture now hides it through the
existing UI API before checking exact output resolution.

## 1. Reproducible inputs and Blender scene

- [x] During implementation, create tracked `config/source_poses.json` and `config/poses.json` under `tools/bake_lighting/experiments/lighting_configurations/`. The first preserves the exact supplied JSON appendix; the second defines the five cameras, four default bus placements and explicit camera-to-bus bindings, applying the shared-placement rule below. Scripts must load these versioned JSON defaults directly in a fresh checkout; they must not depend on ignored files or parse this Markdown at execution time. The existing ignored `tests/artifacts/screens/illumination_560/inputs/camera_poses.json` and `inputs/resolved_camera_poses.json` are authoring snapshots, not the canonical defaults. Keep camera IDs `pose_01` through `pose_05` stable; preserve every supplied camera position/full x/y/z/w quaternion and the three unaffected bus transforms. Keep the original input immutable and record the intentional shared-bus change separately; do not round, replace orientations with yaw or re-snap bus height. Save each run's effective inputs and any validated placement adjustment as ignored snapshots without rewriting the tracked defaults.
- [x] Use `bus_shared_01_02` for cameras 01 and 02. Its proposed transform is position `{ "x": -106.10667388916016, "y": 1.7035786161894098, "z": 42.647422790527344 }`, quaternion `{ "x": 0, "y": -0.6948783429914962, "z": 0, "w": 0.7191273103153519 }`: original bus 01 shifted one meter along world +X to leave framing room in the closer camera. Both camera transforms remain exactly supplied. Use `bus_03`, `bus_04`, `bus_05` for the remaining views. Validate the shared bus's loaded geometry/ground clearance, absence of collisions and visibility in **both** cameras before rendering. If a small adjustment is needed, choose one deterministic common placement, save it once with the reason, and use it for both views throughout every configuration; never restore overlapping copies or move the bus per camera. Generate the game baselines from these same resolved poses, not the two conflicting original bus placements.
- [x] The script must automatically capture **G00 — Game / existing baked data** for all five resolved poses from the actual game renderer. Use the already installed accepted baked shadows, enhanced indirect/AI 548 and applicable visibility data available today; do not rebake, regenerate, publish or replace those assets to create this baseline. Capture before changing experimental lighting or removing runtime lighting/material hooks for Blender export. Hide overlays, pause simulation and lock the camera; preserve the accepted lighting, AO, exposure, tone mapping and post-processing settings so G00 represents the game's current appearance.
- [ ] If AI 550 is implemented first, preserve its pre-change G00 captures and source/settings identities instead of overwriting them. Record its Enhanced bus lighting toggle, effective material variant and probe state in every game/export manifest. Add a separately labeled enhanced-game reference where available; the feature-Off original and feature-On result are different baselines. Freeze the chosen bus material variant across the primary Cycles lighting matrix, and exclude runtime diffuse-probe lighting from exported base color/emission. AI 550 remains optional for running the experiment; record which state was actually used.
- [x] Record baseline date, engine revision, city/material/source hashes, bake indexes/package identities and content hashes, saved settings, requested/effective Current/Baked/Auto mode and each channel's actual status. Wait for loading, validation, shader preparation and application to settle before capturing each view. Verify existing baked shadows and enhanced indirect are actually applied; retain each image's status evidence in its manifest. A missing/stale/incompatible package or fallback to Current must produce an explicit baseline validation failure, not a silently substituted screenshot. Never bypass compatibility checks or alter source light settings merely to force a pass. Snapshot the installed bake identities before the experiment; preserve an ignored asset snapshot or verify the same content hashes on resume so a later bake cannot silently change the baseline halfway through the comparison.
- [x] The original viewport was not included in the copied poses. Use 1920×1080 square pixels for the initial comparisons and 3840×2160 for the final shortlist, explicitly recording 16:9 as an assumption. Preserve the 55-degree **vertical** field of view in Blender; do not reinterpret it as horizontal lens angle. Capture G00 for all five views at both comparison resolutions when those stages run. Disable motion blur, depth of field, auto exposure, bloom, vignette and artificial sharpening for the primary controlled Cycles comparisons. If a matching post-neutralized game reference is useful, capture it separately as G01 with all deviations listed; never overwrite or relabel the unchanged G00 baseline.
- [x] Reconstruct/export the actual resolved game scene, not a proxy city. Reuse the maintained source export/reconstruction path where its contract supports the required surfaces. Audit coverage: bake receiver/caster exports may omit the dynamic bus, visual-only surfaces, full glossy/transmission materials, interiors or view-culled geometry. Include off-camera geometry needed for shadows, bounce and reflections. Wait for meshes, textures and bus readiness before export.
- [ ] Preserve material colors, texture color spaces, UV transforms, normal handedness/strength, roughness/metalness, glass thickness/transmission, alpha-cutout foliage, instancing and geometry scale. Translate supported rendering semantics explicitly. List unsupported shader/material approximations and their visible effect; do not silently substitute black glass, opaque leaves, clay materials or emission for actual light transport.
- [x] Export source PBR inputs rather than runtime-patched appearance. Avoid baking existing lightmaps, static AO, dynamic underbody AO, screen-space AO, baked shadows, tone mapping or display exposure into Cycles base color/emission and then lighting them again. The beauty reference should obtain occlusion and indirect light from transport, not an extra multiplied AO layer.
- [x] Document and validate Three.js Y-up/meters to Blender coordinates for geometry, light directions, bus anchor transforms and cameras. Use a consistent basis conversion and actual camera matrices, not hand-adjusted angles. Check several projected static landmarks and bus corners against the gameplay camera (target ≤1 pixel projection error at 1080p where semantics match); record any residual discrepancy before evaluating lighting.
- [x] Save `scene/<export-id>/bigcity2_lighting_lab.blend` below the artifact root, with five named cameras and four bus objects/collections as specified above. Linked mesh/material data may reduce memory; distinct placements keep independent transform/rig state. Cameras 01 and 02 must reference the **same bus object/collection**, not hidden duplicate buses. Each camera has a named scene/view layer selecting its associated placement. Exclude unrelated bus placements from all transport, including shadow, diffuse, glossy and transmission rays, not only camera visibility, so extra stored buses do not contaminate a reference. Keep the four placements stored for reuse, with no bus movement between camera jobs.
- [x] Preserve authored underbody/wheel geometry and document any unrecorded suspension/steering state as a limitation of these pose payloads. Extra diagnostic neutral materials may be separate variants, never an unexplained replacement in a beauty reference.
- [x] Save named lighting configurations, per-camera associations and color-management recipes with the Blender project or its sibling manifests. Pack resources where supported and permitted, otherwise save a relative-path dependency manifest with hashes. Reopen the saved file in a fresh isolated process and reproduce at least two camera/configuration combinations without re-exporting or moving the bus. A missing resource or OCIO dependency must be reported.

## 2. Proposed lighting matrix

Keep geometry/materials fixed for the primary matrix. Read the actual current sun direction and source intensities instead of assuming historical UI values are current. L00–L03 retain that sun direction to preserve a useful daylight/shadow comparison. G00 is the required game-rendered baseline using existing baked data; L00 is a new Cycles reconstruction and must never substitute for it.

| ID | Proposed configuration | Purpose and controlled changes |
| --- | --- | --- |
| L00 | Current-source Cycles reference | Reconstruct current sun, hemisphere/environment and material inputs using documented transport equivalents. Record unavoidable engine-to-Cycles differences. Keep an unaltered game screenshot alongside it; do not call the two renderers pixel-equivalent. |
| L01 | Calibrated clear daylight | One physical Sun plus a coherent procedural sky or an explicitly sun-separated HDRI. Start with a solar angular diameter of about 0.53°. Remove arbitrary ambient fill and added AO. Derive natural shadow illumination from sky visibility and bounced light. |
| L02 | L01 with less sky fill | Hold sun, exposure, materials and direction fixed; decrease sky radiance by one stop (×0.5). Test whether current shadows/facades are washed out. Label an independently adjusted sky as a sensitivity experiment, not a perfectly measured weather model. |
| L03 | L01 with more sky fill | Hold the same variables fixed; increase sky radiance by one stop (×2). Test whether shaded areas need more physically sourced fill rather than a hemisphere multiplier. |
| L04 | Calibrated photographic daylight HDRI | Use a suitably licensed, high-dynamic-range daylight environment with recorded provenance and normalization. Align its solar direction with the existing sun. Either use the HDRI sun alone or remove its solar component and use one explicit Sun; never double the solar energy. Compare spatial/color distribution of sky reflections and bounce. |
| L05 | Soft overcast daylight | Use a coherent diffuse overcast environment with no separate hard Sun. This tests photorealism under a different weather regime; do not score it as an exact replacement for the sunny reference. |

- [x] Run all six core configurations for all five cameras: 30 pilot beauty renders, plus the five gameplay baselines. For L01, propose a calibration target such as 80,000 lux direct-normal sun and 12,000 lux diffuse-horizontal sky as a **documented trial**, then report actual supported units and sensor/gray-card measurements. These are different receiving orientations; do not confuse their ratio with horizontal sun-to-sky contrast. Do not copy unitless game intensities into Blender watts or claim an exact lux conversion without the required radiometric/photometric assumptions. If absolute calibration is unavailable, declare a relative calibrated setup and retain measured ratios instead of inventing SI accuracy.
- [x] Use a separate calibration view with neutral gray/white and color patches plus a glossy reference sphere, excluded from the five beauty views. Choose and record a reference exposure/white balance there before comparing scene cameras. Avoid per-camera auto-normalization that conceals inconsistent lighting.
- [x] Check the environment's bright disc/halo, explicit Sun and visible sky agree in direction, extent and energy policy. Procedural sky and HDRI paths need the same one-sun ownership. Do not make specular brighter by adding a second solar emitter.
- [x] If useful after the core matrix, add bounded, separately labeled experiments: low-angle warm daylight with a coherently changed sky (e.g. 15-degree sun elevation); a warmer neutral white-balance interpretation; or higher-quality bounce transport. New sun directions/weather imply a new lighting/bake profile, not reuse of the current bake. Limit follow-ups to concrete hypotheses and keep the core reference comparisons available.
- [x] Inspect base-color, roughness, normal and glass assumptions when a surface remains implausible. Any material-correction experiment must be its own named variant with before/after parameters. Distinguish "lighting improved" from "asset/material corrected"; do not conceal material problems using exposure, saturation, AO or a tone curve.

## 3. Transport quality, raw passes and render budget

- [x] Use Blender **Cycles path tracing**, not Eevee or a viewport raster screenshot. Reuse `tools/baking/blender.local.json` and its first-use configuration behavior. Honor the configured/pinned Blender contract and record version, device, hardware and OCIO version. Follow the project's occupied-Blender rules; do not interrupt an existing session or render.
- [ ] Start pilots at 1920×1080 with a fixed seed, approximately 256 maximum samples, 32 minimum adaptive samples and noise threshold 0.02. Start final shortlisted references at 3840×2160, 1024 maximum samples and threshold 0.005; raise samples where convergence requires it. These are trial budgets, not evidence that a render is converged.
- [x] Record complete light-path settings. A reasonable initial reference is 12 total bounces with diffuse 4, glossy 4, transmission 8 and transparent 16, with volume settings declared. Check important dark contact/glass/foliage regions against a higher-bounce variant. Disable AO approximation and direct/indirect energy clamping for the reference unless a separately labeled comparison demonstrates their cost/benefit. Record caustic/filtering choices and their limits.
- [x] Retain unclipped scene-linear multilayer OpenEXR with working space/chromaticity metadata, raw noisy and denoised beauty, denoising data, depth/normals, material/object masks and available diffuse/glossy/transmission direct/indirect, emission/environment passes. Use light groups or controlled source-isolation renders for sun versus sky. Verify pass recombination semantics for the installed Blender: Cycles "diffuse direct" can include sky illumination and is not identical to this engine's direct-sun channel.
- [ ] Test convergence on shortlisted views using doubled samples or an independent seed, inspect denoising bias and preserve real texture/contact detail. Report residual noise and disagreements. Treat the result as a reference for its declared scene/model, not universal ground truth or proof that path tracing alone makes low-detail assets photorealistic.
- [x] Estimate wall time and memory from an initial pilot. Run jobs sequentially by default, checkpoint finished outputs and resume by pose/config/source identity. Expose optional samples, resolution, device and time-limit parameters through the established hierarchy. Distinguish a hard whole-run timeout from a per-render Cycles limit; reaching a time limit is not a quality pass. Do not perform an unbounded Cartesian search or require a fixed 30-minute render when the user did not request that for this experiment.
- [x] Implement and register the fully automated diagnostic experiment branch described below, reusing preparation dependencies and local Blender config. Keep expensive experiments outside the master script's default production bake set and preserve validation/publication gates. Document the invocation, outputs and resume behavior in the owning tool README, `tools/baking/README.md` and `PROJECT_TOOLS.md`; avoid another standalone machine-specific bake script.

## Modular scripts and fully automated master

- [ ] Implement the following independently callable stages under `tools/bake_lighting/experiments/lighting_configurations/`. Track every script, its Blender Python helpers, schemas, reusable support code and documentation in Git. Each stage owns one responsibility and a documented input/output contract; the master invokes those same stages rather than duplicating their work. Do not hide a monolithic experiment inside the exporter or make standalone stages invoke the entire workflow.

| Tracked entry point, relative to the experiment folder | Responsibility and inputs | Generated outputs / independence contract |
| --- | --- | --- |
| `prepare/run.mjs` | Load tracked defaults and optional overrides; resolve the run plan; inspect the game source, actual bus bounds and current bake identities/settings; validate the shared placement and camera bindings. | Versioned preparation manifest, effective input snapshots and readiness/placement evidence. May load the game for validation, but does not export a Blender file, capture comparison images or render. |
| `capture_baselines/run.mjs` | Capture real G00 gameplay images from prepared poses/settings and the already installed accepted baked packages, with application/status validation. | Game PNGs and `baseline_manifest.json`, including settings, bake hashes and framing. Independently runnable without Blender; never starts a bake. |
| `export_city/run.mjs` | Export the actual game city, materials, resources, cameras and four bus placements; build and validate the reusable Blender scene. Accept the prepared inputs, or prepare the tracked defaults through the shared preparation stage when invoked alone. | `.blend`, resource dependencies, `scene_manifest.json`, material-translation and projection diagnostics. A standalone city-to-Blender exporter: does not require baseline screenshots, run the lighting matrix or analyze images. |
| `render/run.mjs` | Read the exporter's saved `.blend` and scene manifest, plus tracked lighting and render-quality configurations; render the requested camera/configuration jobs in Cycles. | Scene-linear EXRs/passes and `render_manifest.json` with per-render settings, hashes, timing and quality/completion metadata. Runs from an existing export without starting the game or re-exporting the city. |
| `postprocess/run.mjs` | Read saved EXRs and render metadata, then apply tracked tone-mapping, exposure, white-balance and grade recipes. | Display images and `display_manifest.json`, recording the exact source EXR and color pipeline. Does not re-export or retrace transport. |
| `analyze/run.mjs` | Read game baseline images, linear/display renders and their manifests, plus tracked analysis definitions/thresholds. | Per-image JSON/CSV metrics, warnings, comparison metadata and a documented provisional shortlist. Does not launch the game or render jobs; preserves producer manifests and writes its own analysis outputs. |
| `report/run.mjs` | Read existing images, manifests, metrics and shortlist. | Local gallery, contact sheets and human-readable comparison report. Regenerates presentation without rerunning analysis or rendering. |
| `run.mjs` | Master: resolve dependencies, invoke the stages, coordinate pilot and final passes, track progress/resume and summarize completion. | Whole-run manifest and execution/checkpoint log. Orchestration only; actual export, capture, rendering, processing and analysis remain in their owning scripts. |

- [x] Give each stage a small README with standalone CLI examples, required inputs, defaults, outputs and failure behavior; register the hierarchy in the existing bake framework and `PROJECT_TOOLS.md`. Put Blender-only scene-building/render helpers in their owning stage folders and reuse existing browser/export/process infrastructure. These helpers are also tracked. The additional preparation, game-baseline, display-processing and report stages are required to make the entire experiment repeatable without coupling every change to a new city export or path trace.
- [x] Keep the following machine-independent default configuration files tracked under the experiment's `config/` folder, with versioned schemas and stable IDs: `source_poses.json` and `poses.json`; `lighting.json` containing L00–L05 and the suggested lighting parameters/calibration policies; `render_profiles.json` containing pilot/final sampling, resolution and transport defaults; `color_management.json` containing T0/T1/T2, exposure and grading recipes; and `analysis.json` containing region definitions, thresholds and provisional-shortlist rules. Resolve source-derived values such as the current sun direction explicitly and record their effective values per run. Keep hardware paths, local asset/OCIO locations and device selection in the shared ignored machine configuration. No duplicated hard-coded presets across scripts or runtime extraction of defaults from this prompt.
- [ ] Define versioned, machine-readable handoffs with relative asset paths where possible, source/config hashes, stable camera/bus/light IDs, effective parameters and validation/completion status. The renderer must accept an explicit exported scene and manifest; postprocessing and analysis must accept explicit upstream manifests. Required missing or incompatible inputs produce actionable errors, not hidden expensive upstream work. A standalone stage may reuse a documented preparation dependency, but must never silently run unrelated stages. Validate only prerequisites that the selected stage uses: analysis/report generation from existing outputs must not require a working Blender executable or game server. Reject unsupported options and propagate relevant master overrides through the hierarchy.
- [x] Create the tracked `tools/bake_lighting/experiments/lighting_configurations/run.mjs` as the no-parameter master for this experiment, registered as an explicit diagnostic target such as `lighting/experiments/configurations`. The standalone stage entry points and the master must use the shared bake framework and configuration. This is a required deliverable, not merely instructions for manually operating Blender.
- [ ] After normal first-use Blender configuration, `node tools/bake_lighting/experiments/lighting_configurations/run.mjs` must execute the complete experiment unattended: load tracked defaults and validate the shared bus placement → snapshot existing bake identities/settings and prepare the resolved plan → load the game and verify scene readiness and existing baked data → capture the five G00 game baselines and their status manifests → export the city and validate/save the Blender scene → run the camera × lighting pilot render loop → derive tone/exposure/grade variants → analyze and select a provisional final-quality shortlist using documented rules → capture matching final-resolution G00 baselines and run final Cycles renders → process/analyze the final outputs → build the report/gallery → verify fresh-file reuse → report output paths and completion status. The baseline stage is a required default dependency and must not invoke a production bake or publication job. Baseline capture and export consume the same resolved poses/source identity; capture G00 before any export-specific material preparation, without changing the accepted game appearance.
- [x] No manual map export, camera/bus placement, Blender scene preparation, per-configuration clicking or waiting for a human to pick the next render is allowed in that default workflow. Automate the provisional shortlist for the final pass; its heuristic must be documented and distinct from the user's later subjective choice. A fully automated run does not mean suppressing real missing-prerequisite or validation failures.
- [x] Read all machine-specific Blender/browser settings from the shared gitignored config and the existing framework's supported inputs. If configuration is missing, create its template and give the existing actionable configure-and-rerun message; if required tools/assets are unavailable, fail with a precise reason. Do not silently drop required cameras/configurations or label partial output complete. Do not install or substitute an unpinned Blender version to make a render pass.
- [ ] Provide optional propagated overrides for sample count, resolution, device, pose/config files or subsets, exported scene/manifest, output/run ID and timeout, plus dry-run/resume behavior. Defaults must cover all five cameras, the six-light pilot matrix, display comparisons and final shortlist. Persist the resolved plan before work begins; dry-run lists stage dependencies, inputs, outputs and cache decisions. Reuse the saved scene and EXRs when their relevant source/config hashes match: a lighting change reruns affected renders, a tone-mapping change starts at postprocessing, and an analysis-threshold change starts at analysis. None of those changes alone should re-export the city. Re-running interrupted work must preserve valid completed jobs and retry missing/failed jobs deterministically; never mix incompatible source snapshots or silently consume an unrelated latest output.
- [ ] The script owns only the server/browser/Blender processes it starts, cleans those up on completion/cancellation, and never terminates or repurposes an unrelated occupied Blender session. Keep per-stage/per-render logs, indented hierarchy, progress/ETA where meaningful, resumable checkpoints and nonzero exit codes for failed required stages. Check output files/readiness rather than assuming fixed sleeps mean loading or rendering finished.
- [ ] Validate the automation with a small end-to-end run (including both cameras sharing the bus, real G00 screenshots with active-bake evidence, at least two lighting variants, EXR reuse for tone mapping, restart/resume and a missing-resource failure), then run the complete requested experiment. Verify that a fresh checkout obtains all defaults from tracked configuration without pre-existing ignored input files. Exercise the exporter standalone, then render from its saved output in a fresh process; run analysis from saved images/manifests without game/render processes, and regenerate the gallery independently. Check that all five baseline files/manifests exist, their framing matches the resolved poses, and missing/incompatible baked data fails clearly without triggering a rebake. Record the exact commands and prove relevant configuration edits rerun only the affected stages. Save automation evidence under this experiment's ignored artifacts.

## 4. Tone mapping and color-grading experiments

- [x] Separate **transport**, **exposure/white balance**, **view/display transform**, and **creative grade**. Save scene-linear EXRs once and derive comparison images from them; do not rerender transport merely to change tone mapping. Never bake AgX/ACES, a LUT, exposure or grading into production radiance/irradiance maps.
- [x] Use the same named sRGB SDR output target and consistent image metadata for the main gallery. Compare (T0) the current runtime's exact supported tone/exposure transform, (T1) AgX with a neutral/base look, and (T2) a real version-pinned ACES Output Transform via an available OCIO config. Prefer ACES 2.0 if supported by the installed toolchain; otherwise explicitly label the supported ACES version and limitation. Three.js ACESFilmic approximations, Blender Filmic and a full ACES transform are distinct results, not interchangeable names.
- [x] Record working space, input transform, OCIO config/version/hash, display, view, look, exposure and white-balance settings. Convert the linear render into the correct working space when required; do not relabel linear Rec.709 as ACEScg. Apply the display transform once. If the exact runtime transform cannot be reproduced in Blender, derive it through the existing renderer or a verified offline equivalent and label that path, rather than silently substituting another curve.
- [x] For each core EXR, compare T0/T1/T2 at the reference exposure and at −1/+1 stop around it. Keep calibration-based reference exposure fixed across the five views for each light setup; retain a strict same-exposure panel for the controlled L01–L03 comparison. Equal-looking brightness alone is not equal physical lighting. Optional transform-specific exposure tuning must be a separately labeled second comparison.
- [ ] On shortlisted lighting only, test a restrained AgX contrast look and a neutral/subtle warm/subtle cool grade, one change at a time. Suggested grading bounds are about ±10% saturation and modest white-balance shifts around the reference; log exact settings. Include ungraded images. Keep cinematic teal/orange, crushed blacks, oversaturation, strong bloom and sharpening out of the neutral realism baseline.
- [ ] Produce the tone/exposure matrix from the pilot EXRs (up to 270 inexpensive display variants for six lights × five poses × three transforms × three exposures), not 270 separate path-traced jobs. Shortlist two lighting setups and the relevant display treatments, then render both plus L00 at final quality for all five poses (15 final beauty renders). Keep preview rankings provisional until final-quality checks confirm them.

## 5. Analysis and comparison deliverables

- [ ] Provide a local comparison gallery/contact sheets with camera IDs fixed in rows and configuration IDs in columns, aligned A/B or wipe views and full-resolution crops. Keep G00 — Game / existing baked data as the reference column for every camera and in the final shortlist comparisons. Include game-versus-Cycles crops and analyzer results, not only comparisons between Blender variants. Separate weather/time-of-day experiments from the same-sun comparison. Label images with renderer, baked package identity where applicable, light/transform/look/exposure, seed/samples, denoised/raw status and elapsed time; retain a blind-label option for preference review.
- [ ] Analyze both linear radiance and display output with declared color spaces and region masks. Report luminance distributions/percentiles, display highlight and black clipping fractions, RGB-channel clipping, saturation/chroma and hue changes, plausible neutral balance, dark-region noise, texture retention and anomalous fireflies. Values above 1 in an EXR are HDR energy, not automatically clipped pixels. Record the definition and threshold of every warning.
- [ ] Inspect the same material/world regions across variants: bus paint/windows and underbody, lit/shaded asphalt and markings, sidewalk corners, facade/trim, grass and glass. Measure lit-to-shadow ratios and contact profiles where regions are valid; distinguish legitimate view-dependent reflection from direct light leaking through shadows. Use source/pass evidence for suspected leaks; do not use the final image's darkness alone.
- [ ] Flag likely excesses (washed-out sky, flattened shadow contrast, clipped colored highlights, crushed entrances, glowing grass/asphalt, excessive color bleeding) with crop locations and evidence. Treat analyzers and optional no-reference image-quality scores as aids, not an objective "photorealism score." SSIM/PSNR only indicate agreement with an aligned reference under defined conditions; a histogram cannot prove physical correctness or user preference.
- [x] Reuse existing image-inspection tools where suitable, but do not feed HDR/16-bit data into an 8-bit-only analyzer or interpret encoded sRGB averages as linear luminance. Store per-image CSV/JSON metrics and human-readable notes. Identify unavailable analyses honestly.
- [ ] Present a ranked shortlist with strengths, defects and tradeoffs **across all five views**, not just the nicest frame. Explain which improvements arise from sun/sky balance, actual bounce/reflections, color management or asset quality. Include a recommendation, alternatives and remaining uncertainty so the user can choose.
- [x] Map the proposed winner back to game work: settings that can change at display time, source-light changes requiring new authenticated bakes, and runtime limitations such as dynamic bus GI/local reflections. Consider AI 550/551 and the grazing/contact investigations in AI 558/559 without silently implementing them or making them prerequisites for this experiment. Do not assume an incompatible bake remains applied when IBL/sun/hemisphere settings change.
- [ ] Keep the render performance record honest: resolution, samples, seed, noise settings, Blender/device/hardware, scene geometry/texture workload, peak memory where available and per-image elapsed time. This experiment does not claim a real-time FPS improvement; mark unmeasured runtime metrics accordingly. Any subsequently implemented runtime optimization requires a separate same-condition before/after frame-time/FPS and workload table.

## Artifact organization and completion

The experiment scripts, helpers, default poses, suggested lighting presets, render/color/analysis configurations, schemas and READMEs are tracked under `tools/bake_lighting/experiments/lighting_configurations/`. Keep the shared machine-specific `tools/baking/blender.local.json` gitignored. This distinction supersedes the earlier request to keep the default pose list only in ignored artifacts.

All generated material stays gitignored under `tests/artifacts/screens/illumination_560/`:

- `inputs/camera_poses.json` and `inputs/resolved_camera_poses.json`: existing authoring snapshots; scripts do not require them as defaults. Each run writes its immutable effective poses, lighting/render/color/analysis settings, original-config hashes and captured runtime settings under `runs/<run-id>/inputs/`.
- `scene/<export-id>/bigcity2_lighting_lab.blend`: reusable city, five cameras, four bus placements (one shared by cameras 01/02), plus `scene_manifest.json`, relative dependencies and reuse notes. Use an export identity to keep a later export from overwriting a scene used by an existing run; record the exact scene path/hash in the run manifest.
- `runs/<run-id>/manifest.json`: source hashes, effective parameters, camera/bus matrices, visibility selections, color pipeline, timing and completion/checkpoint state.
- `runs/<run-id>/runtime/`, `linear/`, `display/`, `diagnostics/`, `analysis/`, and `gallery/`: raw references and comparisons, named by stable pose/light/view/exposure IDs.
- `runs/<run-id>/runtime/G00_existing_baked/<resolution>/pose_01.png` through `pose_05.png` plus `baseline_manifest.json`: mandatory game baseline images and per-image settings, applied-channel statuses, source/bake hashes and framing metadata. Optional post-neutralized game captures live separately under `runtime/G01_controlled/`.

Do not commit generated/resolved run snapshots, .blend files, renders, reports, metrics or capture manifests. The authored default pose/configuration files are intentionally tracked; they are distinct from generated snapshots. This tracked prompt retains the exact user-supplied pose appendix as implementation provenance. Keep reusable implementation code and relevant tool/spec documentation tracked according to project conventions; do not place an ignore rule over the tool or configuration folders.

## References

These support the workflow, not a universal preset. Check installed-version semantics during implementation.

- [Epic: Physical Lighting Units](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-physical-lighting-units-in-unreal-engine): distinguish physical light quantities from engine-specific unitless settings and record exposure assumptions.
- [Blender: AgX color management](https://developer.blender.org/docs/release_notes/4.0/color_management/): AgX's highlight-color treatment; do not confuse display transforms with transport.
- [OpenColorIO: CG Config for ACES](https://opencolorio.readthedocs.io/en/latest/configurations/aces_cg.html): versioned configs, working spaces and DisplayViewTransform requirements.
- [Blender: Cycles sampling](https://docs.blender.org/manual/en/3.6/render/cycles/render_settings/sampling.html): sample limits, adaptive noise and render time limits; verify the installed version.
- [Blender: light paths](https://docs.blender.org/manual/en/2.83/render/cycles/render_settings/light_paths.html) and [render passes](https://docs.blender.org/manual/id/4.0/render/layers/passes.html): clamping/transport tradeoffs and pass meanings; these are older-version references, not the installed API contract.
- Project contracts: `specs/gameplay/gameplay_pose_launch.md`, `specs/graphics/illumination_runtime_modes.md`, `specs/graphics/illumination_framework.md`, `tools/baking/README.md`, `specs/tools/bake_framework.md`. Inspect current code where historical preview documentation disagrees.

## On completion

- Verify the tracked standalone stages, tracked default poses/lighting/configuration files, fully automated master, all five camera views with the shared bus rule, current-game G00 baselines using the pre-existing baked data, core comparisons, final shortlist, raw data, analyzer report and fresh-open Blender reuse check are delivered. Standalone-stage reuse, fresh-checkout defaults and baseline capture/validation are required for completion. Report any unsupported material/OCIO feature and unfinished render explicitly.
- Record the recommendation and artifact links; the user's final visual preference and any production rollout remain separate from delivering this experiment.
- Mark this AI document as DONE in the first line and add a high-level one-line summary per completed change with actual render costs and validation results.
- Rename to `prompts/AI_DONE_graphics_560_ATMOSPHERE_cycles_lighting_and_color_management_experiments_DONE.md`.
- Do not move to `prompts/archive/` automatically; archive only when explicitly requested.

## Exact supplied camera and bus poses

Use the following exact source data to create tracked `config/source_poses.json` during implementation, then create tracked `config/poses.json` with the shared-bus rule above. Scripts subsequently read those JSON files, not this Markdown. Each entry's `pose` is a valid `gameplayPose` payload. Original aspect ratio is unknown; the proposed comparison aspect is recorded explicitly.

```json
{
  "schemaVersion": 1,
  "experimentId": "illumination_560",
  "source": "User-supplied Copy camera position payloads, 2026-09-07",
  "coordinateSystem": "Three.js world space, meters, Y up; quaternions use x/y/z/w",
  "originalViewport": null,
  "comparisonViewport": {
    "width": 1920,
    "height": 1080,
    "pixelAspect": 1,
    "assumed": true
  },
  "finalViewport": {
    "width": 3840,
    "height": 2160,
    "pixelAspect": 1
  },
  "poses": [
    {
      "id": "pose_01",
      "pose": {
        "version": 1,
        "city": "bigcity2",
        "bus": {
          "modelId": "city",
          "transform": {
            "position": {
              "x": -107.10667388916016,
              "y": 1.7035786161894098,
              "z": 42.647422790527344
            },
            "quaternion": {
              "x": 0,
              "y": -0.6948783429914962,
              "z": 0,
              "w": 0.7191273103153519
            }
          }
        },
        "camera": {
          "position": {
            "x": -118.98739641828959,
            "y": 2.8164996302368595,
            "z": 46.97752256108899
          },
          "quaternion": {
            "x": -0.0004185723018374499,
            "y": -0.5733978952053874,
            "z": -0.00029295160782764093,
            "w": 0.8192768718514001
          },
          "fovDeg": 55,
          "locked": true
        },
        "simulation": {
          "paused": true
        }
      }
    },
    {
      "id": "pose_02",
      "pose": {
        "version": 1,
        "city": "bigcity2",
        "bus": {
          "modelId": "city",
          "transform": {
            "position": {
              "x": -111.12090301513672,
              "y": 1.70357861618941,
              "z": 42.49835205078125
            },
            "quaternion": {
              "x": 0,
              "y": -0.46745612688275184,
              "z": 0,
              "w": 0.8840162721578018
            }
          }
        },
        "camera": {
          "position": {
            "x": -129.8467871273507,
            "y": 3.4494314583231884,
            "z": 48.6168181746064
          },
          "quaternion": {
            "x": -0.01326405608946302,
            "y": -0.587041083593968,
            "z": -0.009620248979961533,
            "w": 0.8093913032634087
          },
          "fovDeg": 55,
          "locked": true
        },
        "simulation": {
          "paused": true
        }
      }
    },
    {
      "id": "pose_03",
      "pose": {
        "version": 1,
        "city": "bigcity2",
        "bus": {
          "modelId": "city",
          "transform": {
            "position": {
              "x": 43.21368264770508,
              "y": 1.70357861618941,
              "z": 41.514739990234375
            },
            "quaternion": {
              "x": 0,
              "y": 0.6950635333147163,
              "z": 0,
              "w": 0.7189483184875408
            }
          }
        },
        "camera": {
          "position": {
            "x": 58.863162720018984,
            "y": 2.79840830029203,
            "z": 53.47829195978014
          },
          "quaternion": {
            "x": 0.00011764952246445241,
            "y": 0.44309637184111866,
            "z": -0.00005815012816942476,
            "w": 0.8964739751037893
          },
          "fovDeg": 55,
          "locked": true
        },
        "simulation": {
          "paused": true
        }
      }
    },
    {
      "id": "pose_04",
      "pose": {
        "version": 1,
        "city": "bigcity2",
        "bus": {
          "modelId": "city",
          "transform": {
            "position": {
              "x": 77.64125061035156,
              "y": 1.70357861618941,
              "z": 177.13464672851563
            },
            "quaternion": {
              "x": 0,
              "y": -0.007072382142782312,
              "z": 0,
              "w": 0.9999749903926729
            }
          }
        },
        "camera": {
          "position": {
            "x": 61.261676907734575,
            "y": 4.6750204494531875,
            "z": 187.55253173299226
          },
          "quaternion": {
            "x": -0.04210622509033511,
            "y": -0.4807575345229718,
            "z": -0.023120541380274306,
            "w": 0.8755368064075427
          },
          "fovDeg": 55,
          "locked": true
        },
        "simulation": {
          "paused": true
        }
      }
    },
    {
      "id": "pose_05",
      "pose": {
        "version": 1,
        "city": "bigcity2",
        "bus": {
          "modelId": "city",
          "transform": {
            "position": {
              "x": -149.6728057861328,
              "y": 1.70357861618941,
              "z": 231.16934204101562
            },
            "quaternion": {
              "x": 0,
              "y": -0.5546042921376437,
              "z": 0,
              "w": 0.8321142224133073
            }
          }
        },
        "camera": {
          "position": {
            "x": -129.97369704099222,
            "y": 3.6455266653003706,
            "z": 232.23481817033417
          },
          "quaternion": {
            "x": -0.015480521101161935,
            "y": 0.6875902917573187,
            "z": 0.014665839066841829,
            "w": 0.7257856827686721
          },
          "fovDeg": 55,
          "locked": true
        },
        "simulation": {
          "paused": true
        }
      }
    }
  ]
}
```
