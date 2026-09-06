# Receiver lightmaps

Optional AI 533 Cycles diffuse atlas compiler. It consumes the validated AI 528
export, reuses AI 529's pinned reconstruction, and produces independent AI 530
direct and indirect packages. It never downloads or installs Blender.

New runs require **complete eligible coverage and supported scene transport**.
The AI 553 repair uses the existing AI 548 toggle and a connected UV layout:

```
node tools/receiver_lightmaps/unwrap.mjs path/to/source.bsib tests/artifacts/screens/receiver_unwrap path/to/existing/blender.exe
node tools/receiver_lightmaps/run.mjs --enhanced true --layout tests/artifacts/screens/receiver_unwrap/receiver-layout.json --atlas-only true --input path/to/source.bsib --output tests/artifacts/screens/receiver_preflight
```

`coverage-report.json` lists eligibility reasons, per-range triangle counts,
required pages, oversized charts and unsupported transport. No face is selected
by location, area or remaining capacity. Any missing eligible triangle rejects
the complete plan. The current city requires nine 4096² pages at a nominal
0.5 m per indirect-light texel, with extra density on narrow faces. Every triangle
must own an interior raster sample; another face's sample cannot satisfy that rule.
The existing high-resolution shadow cache remains unchanged. `--atlas-only` never
launches or verifies Blender. All ordinary commands below now apply this contract.

```
node tools/receiver_lightmaps/run.mjs --enhanced true --layout tests/artifacts/screens/receiver_unwrap/receiver-layout.json --input path/to/source.bsib --output tests/artifacts/screens/receiver_bake --samples 256 --installed true --device OPTIX
node tools/receiver_lightmaps/publish.mjs --enhanced --from tests/artifacts/screens/receiver_bake
```

`--blender` and `--archive` locate the exact existing 5.2.1 distribution. Defaults
use the sibling main workspace's verified distribution. Jobs run offline with
factory startup and isolated configuration, Python, OptiX/CUDA cache and temp paths.
The complete enhanced bake supports explicit `CPU` (default, 12 threads) or `OPTIX`;
an unavailable requested device fails instead of silently choosing another backend.
The interactive Blender session remains untouched.

`--output` must be below `tests/artifacts/`. Attempts use new `.partial` directories;
complete results are promoted by rename. `--resume <partial-directory>` packages a
completed bake without rebaking, after checking source, layout/profile, toolchain and scripts.
Large offline charts live in `charts.ndjson`; they are not downloaded by the game.
`bake/latest.json` identifies the last promoted result. After city validation,
`node tools/receiver_lightmaps/publish.mjs` authenticates both packages again,
copies them under `assets/baked_lighting/receivers/<identity>/`, and switches the
runtime index last. The shared asset junction can require filesystem approval.

The historical preview has four 2048-square pages, 680/16384 metres/texel, 16-pixel padding,
four explicit mips, and 64 samples. `--samples 256` increases integration time;
`--pages` changes the capacity budget, never which eligible faces get selected.
An insufficient budget or oversized chart now fails before baking. Neither flag
resolves scalar-normal limitations. New publications reject incomplete historical
preview packages; existing installed packages remain available for comparison.
Each channel is an independent `.ilpkg.gz`. Historical scalar maps use RGBA16F.
The complete enhanced maps use hardware-filtered RGB9E5 HDR (4 bytes/texel), without
page-wide exposure quantization. Exact RGBA32F coordinates are split into authenticated
row chunks below the container's 64 MiB chunk limit. Gzip is lossless transport.
Direct illumination uses the shared static/moving sun visibility and the live PBR
normal response; its package contains metadata and a 1×1 reference, not a duplicate
sun atlas. The direct toggle does not add another sun map in this profile.

`ReceiverPagePadding.mjs` extends unwritten pixels from the nearest actual sample
in the same chart. It preserves valid black samples, rejects empty charts and
regenerates explicit mips. The authenticated mapping includes raster counts and
hashes of the processed page bytes; both publication and runtime validate them.
`validate_surface_pixels.py` separately audits the unprocessed Cycles outputs;
boundary gaps in those raw images require chart padding before publication.
The complete bank uses 720 MiB of HDR pages plus 97.875 MiB of shared coordinates,
excluding geometry and other renderer allocations. Extra pages use authenticated
child packages, with the existing 512 MiB per-container limit unchanged.

`validate_surface_transport.py` runs both historical participant tests and the new
white-receiver/fractional-opacity tests; add `--optix` after its artifact directory
to verify the GPU backend. Static alpha surfaces remain transport participants
while keeping live shading at runtime. Forced-opaque depth-proxy flags do not override
their declared opacity for diffuse bounce. Complete packages additionally validate
the full resolved-source identity, since old channel hashes excluded those materials.

Select `tests/headless/e2e/receiver_complete_city.pwtest.js` to inspect an unpublished
candidate under `tests/artifacts/screens/illumination_553/bake/`. It captures the
reported platform, ground and curb views with isolated channels, checks saved startup
and repeated cached toggles, and compares fixed-camera GPU/frame costs.
Set `AI553_INSTALLED=1` for a fresh installed-URL verification and matched captures
against the historical enhancement; this run skips the repeated benchmark.

`inspect_atlas.py <promoted-directory> <artifact-output-directory>` uses NumPy/Pillow to
write full atlas previews, island/padding/occupancy overlays, receiver provenance
and quantization measurements. Run `calibrate_units.py` through the pinned Blender
CLI with the result JSON path following `--` to check irradiance units.

Select `tests/headless/e2e/receiver_lightmaps_preview.pwtest.js` or
`tests/headless/e2e/receiver_lightmaps_city.pwtest.js` in `tests/.selected_test`, then
run `node tools/run_selected_test/run.mjs`. The city check needs a completed default
bake and uses installed Chrome/D3D11 when available. It records 30 GPU-finished
frames after 10 warm-up frames at 1280×720.
Set `AI533_INSTALLED=1` after publishing to validate actual asset URLs instead of
the promoted bake fixture. Rooftop captures keep city/shadow-camera updates active.
`compare_captures.py <capture-directory>` measures display-space differences against
cached sun plus live diffuse, including the green receiver coverage mask. These
differences establish visible change, not accuracy against a reference renderer.
After the five-mode check and atlas inspection, `node tools/receiver_lightmaps/report.mjs`
consolidates the measurements into the artifact `report.md` and `summary.json`.

See [the specification](../../specs/graphics/receiver_lightmaps.md).

## Historical AI 548 directional implementation

Options → Baked lighting → **Enhanced baked illumination (AI 548)** selects a
separate implementation and publication. It defaults off; the original preview
and its assets remain available. Both implementations retain compatible maps
while inactive. No AI 548 shader modules or enhanced packages load with the new
toggle off before first use.

Historical directional bakes ran each direction in an isolated headless process and wrote
hashed checkpoints. After an interrupted run, repeat the same command with
`--resume <staging-directory>` to reuse complete directions; source, atlas,
compiler and output hashes must still match. Python uses a task-local cache path,
leaving the installed Blender and any open interactive session untouched.
`--installed true` uses the existing pinned executable when the original download
archive is unavailable or fails verification. It verifies executable bytes and
the running Blender build, and explicitly records that the archive hash is only
the source contract reference. It never downloads or installs Blender.

The historical enhanced compiler captured four primary directions and fitted an affine indirect
irradiance function. Its v2 layout stores flat RGB irradiance in the first layer,
with directional coefficients in the remaining components of three RGBA layers.
Flat surfaces therefore use one indirect sample; normal/bump surfaces retain the
full directional evaluation. The renderer also supports the original layout.
Runtime evaluates those coefficients against the final shading normal in the
chart frame. Direct diffuse uses its geometric-normal bake with a runtime cosine
ratio, retaining live direct light at grazing/back-facing geometric incidence.
Per-layer affine RGBA8 encoding remains linear through filtering and preserves
HDR/signed values through authenticated scale/bias metadata. This is an angular
approximation, not dynamic path tracing or GI on the bus.

The corrected enhanced bake preserves fading sidewalk-dirt and asphalt-edge
coverage. `validate_coverage.py`, run through the installed Blender with an artifact
directory after `--`, checks actual transparency and coefficient-layout equivalence.
The v3 profile also preserves per-face source materials while rebuilding Blender
slots and denoises all four indirect directions inside isolated chart rectangles
before fitting coefficients. Raw samples remain available for comparison. Direct
lighting remains unfiltered. `validate_target_materials.py` checks material ownership;
`validate_denoise.py -- <artifact-directory>` checks linear HDR energy, chart
isolation and noise reduction. Run these scripts through the installed Blender
with `--python-exit-code 1` so assertion failures fail the command.
To publish a repaired bake stored elsewhere under workspace artifacts, use
`publish.mjs --enhanced --from tests/artifacts/screens/illumination_repair/bake`.
`measure_precision.mjs --root tests/artifacts/screens/illumination_repair` compares
its encoded pages with the corresponding full-precision output.
`receiver_toggle_stability.pwtest.js` records real-game startup blends, repeated
off/on and original/enhanced switches, bounded shader/geometry/texture counts and
map-request reuse. `RECEIVER_UNPUBLISHED=1` selects the candidate under
`tests/artifacts/screens/illumination_optimization/bake` for validation before publication.
`receiver_illumination_repair.pwtest.js` captures the default city's curb with
each illumination channel isolated. Set `REPAIR_RUN=after` for a distinct artifact
directory and `REPAIR_UNPUBLISHED=1` to test repaired maps before publication.
`REPAIR_BENCHMARK=1` adds four alternating runs of 300 CPU/GPU frames per
implementation at the saved gameplay camera and 3520×1624 viewport, matching
the reported screen size. Run timing after Blender exits.

`--atlas-only true` writes a coverage report without launching Blender. Successful
plans also write `atlas.json` and a streamed `charts.ndjson` inventory. New profiles are scalar
`ai533.cycles.diffuse.complete<SAMPLES>.v2` and enhanced
`ai553.cycles.surface.complete<SAMPLES>.v3`; they reject the old focus/minimum-area
selection options. Old v1/v3 checkpoints cannot resume under this new profile.
Receiver exclusions do not remove static participants from reconstruction.
Unsupported participant materials fail the complete plan and require a transport
adapter; they cannot simply disappear from the bounce/occlusion scene.

The complete enhanced surface compiler joins receiver targets while preserving UV
channels, materials and mirrored-instance orientation. Run
`validate_surface_batching.py -- <artifact-directory>` through the pinned Blender
to compare joined and separate target lighting. `validate_surface_transport.py`
checks geometric-normal irradiance and declared-alpha static contributors. The
complete compiler authenticates both emitted atlas files before/after baking and
on resume. It does not accept a changed chart inventory under an old job identity.

Run `validate_transport_participants.py -- <artifact-directory>` through the pinned
Blender with `--python-exit-code 1` to verify that a non-lightmapped red wall still
contributes colored bounce and sky occlusion through both target installers. Use
task-local `BLENDER_USER_CONFIG`, `BLENDER_USER_EXTENSIONS` and
`PYTHONPYCACHEPREFIX` directories to isolate the test. The report is
`transport-participants.json` beneath the specified artifact directory.

`repack.mjs` converts the **unchanged** AI 533 bake into a separate artifact-only
compact fixture for controlled performance/precision comparisons. It does not
publish over the original maps.

Run `calibrate_directional.py` through the pinned headless Blender executable
for analytic sun-direction checks. `validate_directional.py` measures the angular
fit against independent 256-sample Cycles bakes of a colored wall and overhang.
Pass the artifact JSON destination after Blender's `--` separator.

Run `validate_environment_orientation.py -- <artifact-directory>` through the
same isolated Blender invocation to render an equirectangular direction reference
and a red-sky/blue-ground hemisphere. It compares actual Cycles pixels with the
Three direction equations and verifies that an intentionally reversed hemisphere
fails. World coordinates must be outward Blender Z-up directions: World Normal
points inward, and remapping it to Three axes rotates the environment twice.
The enhanced v3 profile records this convention and defaults to 256 samples per
pass; the map dimensions, formats and runtime shaders are unchanged.
Select `receiver_environment_quality.pwtest.js` after a candidate exists under
`tests/artifacts/screens/illumination_quality/bake/`. It compares five fixed city
cameras with the previous complete bake, checks that direct-only lighting remains
unchanged, and checks map/program reuse after toggling. Captures and numerical
reports stay under `tests/artifacts/screens/illumination_quality/validation/`.

`validate_environment_sun.py` checks the enhanced v4 diffuse-environment solar
separation with a synthetic bright disc and a uniform-sky negative control.
The default photograph's four-degree disc/halo cap is replaced by the surrounding
sky mean; the original HDRI remains untouched. `environment-sun.json` records the
derived direction, removed radiance and replacement sky. Source sunlight stays
in the shared high-resolution shadow path and contributes offline bounce.
`validate_shaded_bounce.py` uses the production sun orientation in a small CPU
bake: a downward-facing white surface must receive zero direct sunlight, green
bounce from a lit ground plane, and zero bounce when that plane is removed.

For the longer refinement run use `--samples 896 --device OPTIX --installed true`
with the complete layout and a fresh output root. This targets approximately
30 minutes from the preceding run's measurements; report `receipt.seconds`,
not the estimate, after completion. `receiver_refinement.pwtest.js` checks fixed
facade, platform, sidewalk and cornice poses, channel isolation and cached
toggles. `RECEIVER_CAPTURE` names a capture subdirectory under
`tests/artifacts/screens/illumination_refinement/`; `RECEIVER_TOPICS` optionally
restricts the comma-separated poses during diagnosis.
Set `RECEIVER_BAKE_ROOT` to an artifact bake root containing `latest.json` to
validate an unpublished candidate. Omit it to test the installed maps.

After an interrupted surface bake, `recover_surface_outputs.py -- <partial>`
validates the original source, atlas, compiler and every saved pass before
reassembling. It rejects unwritten or truncated pass data. If the sky pass was
lost, `resume_surface_sky.py -- <partial> <validated-reference-directory>` keeps
bounce only after its raster coverage matches an existing bake with the same
source and chart layout, then recomputes sky with the original profile. It writes
and flushes one page at a time and releases the scene before assembly. Use the
existing Blender CLI with `--python-exit-code 1`; after recovery, use the original
`run.mjs` arguments plus `--resume <partial>` to validate and package the result.
Recovery scripts live outside the frozen baking-script directory so their use
does not change the compiler that produced the surviving bounce pass. Package
provenance authenticates both scripts and pass hashes. Recovered receipts keep
the lost original timing and reconstruction fields null, with separate recovery
measurements and an explicitly labeled timing estimate.

Normal complete-surface bakes also discard the chart inventory and orphaned
meshes after joining receivers, save one image copy at a time, flush each output
before replacing its target, and release the scene before CPU mip assembly.
`validate_surface_outputs.py -- <artifact-directory>` checks exact float output,
mip values, bounded page reads and preservation of an existing file when a write
is interrupted. Run it with the existing Blender CLI and `--python-exit-code 1`.

`ReceiverSurfaceOverlap.mjs` builds offline hidden-texel masks for near-coincident
opaque receiver layers. Exact projected geometry and a declared 2 mm maximum gap
select the hidden lower samples; chart extension borrows only from the same
chart's exposed samples. This prevents the dark hidden city floor from bleeding
into its visible edge beside a grass tile. Real gaps and shaded exposed texels
are preserved, including on rotated surfaces. Node coverage lives in
`receiver_surface_overlap.test.js`; the refinement browser test checks irradiance
on opposite sides of the actual floor/tile boundary.

To process an already completed recovered bake with a newer padding algorithm,
repeat its original `run.mjs` arguments using `--reprocess <publication-directory>`
instead of `--resume`. The source directory must be a content-addressed child of
the output root, and recovered pass hashes, profile, source and atlas must match.
This creates a new publication from the verified pass files without another
Cycles run. Baking-script provenance remains unchanged; the new processor and
source-publication identity are authenticated separately. For large complete-city
atlases, allow Node an 8 GiB heap with `--max-old-space-size=8192`.

Select `receiver_directional_material.pwtest.js` for GPU normal-response and
dynamic-shadow composition checks. `receiver_lightmaps_548.pwtest.js` records
three alternating runs of 300 frames per mode, separate synchronized timings,
GPU queries, loading, memory and captures. Use `AI548_VARIANT=same-coverage` for
the repacked original; `AI548_VARIANT=enhanced` for the new publication;
`AI548_UNPUBLISHED=1` routes the new bake from artifacts before publication.
`AI548_SMOKE=1` is only a functional check and must not supply performance claims.
Set `AI548_VISUALS=1` on the enhanced run to capture matched ground, threshold and
overhang poses after timing finishes. `measure_precision.mjs` compares the actual
published encoding against full-precision bake coefficients; `report_548.mjs`
requires all three complete benchmark variants and writes the measured report.
Storage error and angular fit error are reported separately.
For diagnosis only, `AI548_MODE=combined` limits a smoke run to that channel mode;
`AI548_POST_COMPARE=1` adds overhang captures without postprocessing and without
AO after the visual sequence. Neither option changes production settings.
Run `compare_548.py` with NumPy/Pillow after the visual capture to measure mapped
screen coverage and display differences. It does not estimate GI accuracy.

`tests/headless/e2e/receiver_lightmaps_loading.pwtest.js` checks real Options
toggles, shared validation and resident-map reuse through the default Welcome and bus
selection flow, with automatic core tests enabled. Use `E2E_BASE_URL` to check an
existing game server. `receiver_lightmaps_startup.pwtest.js`
checks saved-settings startup against the installed bake. Evidence goes under
`tests/artifacts/screens/illumination_533/loading/`.
Use `AI548_VARIANT=enhanced` for both loading/startup checks to select the new
publication and write evidence under `illumination_548/loading/`. The loading
check also verifies both implementation caches, rapid switching and Cancel.
`receiver_lightmaps_cache_lifecycle.pwtest.js` checks disabled-cache retention,
cancellation and cleanup on city change, context loss and disposal.
`receiver_lightmaps_linked_controls.pwtest.js` checks linked/independent switch
behavior, one combined live update, keyboard controls, persistence and icon layout.
`receiver_recovery_548.pwtest.js` exercises actual WebGL context restoration with
a small receiver fixture. `receiver_freshness_548.pwtest.js` profiles the captured
source watch; `receiver_caster_source_548.pwtest.js` verifies authored caster
identity survives runtime shadow suppression.
`receiver_shadow_overlap_548.pwtest.js` delays the shadow-package response by
20 seconds and checks receiver activation while shadows are loading. The default
loading test records any rejected shadow identity and stops on dependency fallback.
