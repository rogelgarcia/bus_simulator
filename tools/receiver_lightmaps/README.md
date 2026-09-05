# Receiver lightmaps

Optional AI 533 Cycles diffuse atlas compiler. It consumes the validated AI 528
export, reuses AI 529's pinned reconstruction, and produces independent AI 530
direct and indirect packages. It never downloads or installs Blender.

```
node tools/receiver_lightmaps/run.mjs --input tests/artifacts/illumination_528/ai533_v3/bigcity2.bsib --pages 4 --samples 64
```

`--blender` and `--archive` locate the exact existing 5.2.1 distribution. Defaults
use the sibling main workspace's verified distribution. Jobs run offline with
factory startup, CPU, 12 fixed threads and isolated configuration/temp paths.
The interactive Blender session remains untouched.

`--output` must be below `tests/artifacts/`. Attempts use new `.partial` directories;
complete results are promoted by rename. `--resume <partial-directory>` packages a
completed bake without rebaking, after checking source, atlas, toolchain and scripts.
`bake/latest.json` identifies the last promoted result. After city validation,
`node tools/receiver_lightmaps/publish.mjs` authenticates both packages again,
copies them under `assets/baked_lighting/receivers/<identity>/`, and switches the
runtime index last. The shared asset junction can require filesystem approval.

The preview has four 2048-square pages, 680/16384 metres/texel, 16-pixel padding,
four explicit mips, and 64 samples. `--samples 256` increases integration time;
`--pages` changes the coverage budget. Neither resolves scalar-normal limitations.
Each channel is an independent `.ilpkg.gz`, with linear RGBA16F irradiance and an
exact RGBA32F coordinate table. Gzip is lossless transport around the AI 530 container.

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

## AI 548 opt-in implementation

Options → Baked lighting → **Enhanced baked illumination (AI 548)** selects a
separate implementation and publication. It defaults off; the original preview
and its assets remain available. Both implementations retain compatible maps
while inactive. No AI 548 shader modules or enhanced packages load with the new
toggle off before first use.

```
node tools/receiver_lightmaps/run.mjs --enhanced true --pages 4 --samples 64 --output tests/artifacts/screens/illumination_548/bake
node tools/receiver_lightmaps/publish.mjs --enhanced
```

The enhanced bake runs each direction in an isolated headless process and writes
hashed checkpoints. After an interrupted run, repeat the same command with
`--resume <staging-directory>` to reuse complete directions; source, atlas,
compiler and output hashes must still match. Python uses a task-local cache path,
leaving the installed Blender and any open interactive session untouched.
`--installed true` uses the existing pinned executable when the original download
archive is unavailable or fails verification. It verifies executable bytes and
the running Blender build, and explicitly records that the archive hash is only
the source contract reference. It never downloads or installs Blender.

The enhanced compiler captures four primary directions and fits an affine indirect
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
To publish a repaired bake stored elsewhere under workspace artifacts, use
`publish.mjs --enhanced --from tests/artifacts/screens/illumination_repair/bake`.
`measure_precision.mjs --root tests/artifacts/screens/illumination_repair` compares
its encoded pages with the corresponding full-precision output.
`receiver_illumination_repair.pwtest.js` captures the default city's curb with
each illumination channel isolated. Set `REPAIR_RUN=after` for a distinct artifact
directory and `REPAIR_UNPUBLISHED=1` to test repaired maps before publication.
`REPAIR_BENCHMARK=1` adds four alternating runs of 300 CPU/GPU frames per
implementation at the saved gameplay camera and 3520×1624 viewport, matching
the reported screen size. Run timing after Blender exits.

`--atlas-only true` writes a coverage inventory without launching Blender.
`repack.mjs` converts the **unchanged** AI 533 bake into a separate artifact-only
compact fixture for controlled performance/precision comparisons. It does not
publish over the original maps.

Run `calibrate_directional.py` through the pinned headless Blender executable
for analytic sun-direction checks. `validate_directional.py` measures the angular
fit against independent 256-sample Cycles bakes of a colored wall and overhang.
Pass the artifact JSON destination after Blender's `--` separator.

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
