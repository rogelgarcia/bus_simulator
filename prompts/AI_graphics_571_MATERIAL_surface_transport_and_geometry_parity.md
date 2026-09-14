# Problem

AI570 confirms separate pose 04 irradiance losses before GPU delivery and a brick normal-angle tail even with normal maps disabled. Global exposure or ambient gain would conceal these differences.

# Request

Execute the next parity investigations, identify their root causes, and fix demonstrated faults. Preserve the calibrated lighting, frozen poses, opaque wall masks and historical evidence. Keep findings and file references here as incremental work proceeds.

## Plan
- [x] Separate page 3 raw samples, chart extension, overlap handling and seam constraints at the actual game sample coordinates.
- [x] Compare pose 04 neutral Lambert transport in the display export and exact bake reconstruction with identical lighting, sample and bounce limits; separate sky and sun bounce.
- [x] Check spatial bake convergence if the raw discrepancy survives scene alignment.
- [x] Inspect brick primary geometry and authored normals with normal maps disabled before changing material filtering.
- [x] Correct mixed-face normal measurement and validate a local density correction through the existing seam solver.
- [ ] Budget and integrate the production refinement, then validate all five native poses and repeat fresh-browser performance measurements before promotion.

## Frozen evidence and constraints

Artifacts remain under `tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai571_*`; no generated images or packages are tracked. Use registered `lighting/experiments/reference-matching` leaves and the shared local Blender configuration. User Blender PID 2820 is occupied: leave it untouched and use isolated headless regional Cycles renders with the full secondary-ray scene retained. Avoid editing stage inputs while jobs run.

Accepted inputs: `ai570_analysis_20260914_04`, `ai570_capture_20260914_02`, `ai570_cycles_20260914_03`, `ai568_surfaces_20260913_05`, and frozen controls `current_cycles_20260912_01`. Pose 04 full strict wall: Cycles neutral irradiance Y 13.61742, raw bake 12.75024, processed base 12.49955, GPU 12.49956. Raw deficit 6.37%; map processing adds 1.84 percentage points. GPU sampling and Lambert composition already validate. All measured pixels use page 3, LOD 0. Brick normal-off p95 mismatch remains 33.52 degrees; this is not proof of normal-texture error.

## Investigation log

- `seam-input.*.f32` is overwritten in place by the seam solver. Despite its name it contains the final pre-quantization values, not an archived pre-seam stage. Reconstruct chart extension independently into a new artifact directory before attributing its difference to seams.
- Processing `_01` failed before replay because the parsed package is immutable. Corrected the diagnostic to construct a resolved wrapper; no source data changed. `_02` validates all 1,382,871 chart hashes, raw pass hashes and page coverage statistics in 54.2s.
- Pose 04 whole strict wall Y: raw 12.750242, extension 12.793207 (+0.337%), hidden-sample replacement unchanged, seam result 12.499492 (-2.296% versus extended). At 6px inset extension/overlap are unchanged and seams decrease 1.485%. Seven measured charts on building_49_c: narrow 0.95m strips have only about 3 interior texels across. Seam correction lowers these by about 4.7%, while neighboring wider charts brighten. This suggests spatial transfer across chart boundaries; whether it is erroneous requires the matching transport/spatial reference.
- New files: `SurfaceTransport.mjs`, `SurfaceProcessing.mjs`, `surface_processing_analysis.py`, `surface_transport.py`, registered in reference-matching `jobs.mjs`, README, PROJECT_TOOLS and bake framework spec.
- Transport `_01` failed before rendering because Blender does not automatically import siblings beside a --python entry point. Added the tool directory to the isolated Python import path. `_02` validated eight cropped 512-sample renders in 216.8s. Matching bounce/sample limits changes the neutral result slightly; switching to exact source HDR/sun changes mean total diffuse about -0.23%; removing the moving bus changes it about +0.30%; source reconstruction reduces it about 1.95% relative to the display static scene. These are original-mask means pending the strict-mask summary. A raw atlas discrepancy survives all these controls; no exposure gain applied.
- Geometry game `_01` validated actual native/restored captures and world position/face normal outputs in 287.3s. Geometry Cycles `_01` validated in 32.3s. Pose 04 positions agree within 0.383mm at p95 and mesh normals exactly. Brick p95 position error is 17mm; game and Cycles each agree with their own geometric face normals. Cycles discrepant samples contain exact fractional mixtures such as (-0.7734375, 0, 0.2265625), while the matching ray-cast face and its three authored corner normals are (-1,0,0). These are 128-sample antialiasing averages across perpendicular faces, not a 33-degree normal-map defect. Fix the diagnostic to report mixed-face footprints separately using the length of the unnormalized face-normal AOV; retain full-wall radiance metrics.
- Spatial `_01` tests seven authenticated wall charts at 0.33m unjoined/joined, 0.165m and 0.0825m with the full original city transport. Both original and new chart coordinates are retained for exact sample remapping. No production bake replaced.

## Accepted results — 2026-09-14

### Brick diagnostic fault found and fixed

The previous 33.52-degree p95 normal discrepancy was dominated by comparing a single rasterized fragment to a normalized antialiasing average across perpendicular faces. Raw Cycles face normals expose the mixture; actual ray-hit geometry and authored normals agree. `surface_normal_metrics.py` checks the unnormalized face-normal length before reporting comparable normals. A synthetic perpendicular-face average regression check runs with the analysis. Full-wall radiance measurements still use the full original strict mask.

Pose 02: 50,417 strict pixels, 19,903 mixed-face pixels; 30,514 coherent pixels, of which 28,960 also agree in position within 2cm. On those comparable pixels mesh-normal median/p95/max are all 0 degrees. Face-normal p95 is 0.0198 degrees; position p95 is 4.41mm. Pose 04 has no mixed-face pixels in its strict selection: normals agree exactly and position p95 is 0.382mm. Do not tune normal-map amplitude or mesh smoothing to fix the old angle score. Comparable-face selection changes native brick diffuse ratio only from 0.96013 to 0.96489; the remaining radiance discrepancy is real and separate.

### Spatial lighting root cause and local correction

The raw atlas undersamples narrow architectural surfaces and the coarse seam solve spreads their disagreement into valid samples. It is not missing sample passes, GPU decoding, LOD selection, or an extra runtime multiplier. Source reconstruction/bounce-setting differences account for a smaller part of the target gap. No global exposure compensation is justified.

All following values are **neutral-wall scene-linear irradiance / matched source-scene Cycles**, not a whole-image parity percentage. Pose 04 strict wall has 29,657 pixels. Lighting, 512 samples, bounce limits, full secondary-ray city and camera are fixed. The exact source-scene target is 13.30916 mean irradiance Y.

| Control | Whole strict wall | Additional 6px inset |
|---|---:|---:|
| Installed processed map | 0.93916 | 0.97063 |
| Seven-chart 0.33m, no seam solve | 0.96491 | 0.99174 |
| Seven-chart 0.165m, no seam solve | 0.98187 | 0.99855 |
| Seven-chart 0.0825m, no seam solve | 0.99540 | 0.99854 |
| Entire receiver, 0.33m + internal seams | 0.93234 | 0.96972 |
| Entire receiver, narrow-axis refinement + internal seams | 0.96953 | 0.99469 |
| Entire receiver, 0.0825m + internal seams | 0.99559 | 0.99950 |

The native joined and unjoined seven-chart controls differ by less than 5e-7 in mean irradiance Y. Batching is not the cause. The slight difference between small-chart native rerenders and stored raw data (around 0.7% before extension) remains within this isolated sampling/transport-control difference and is reported, not hidden.

The full fine pilot still agrees within 0.44% after seam processing. Its seam-induced mean loss is about 0.05%, versus 3.21% in the native whole-receiver pilot. This validates better spatial resolution as a local correction without removing seam continuity. Narrow-axis-only refinement almost removes the seam loss but leaves a 3.05% overall deficit; long-axis sampling still matters. Reject it as a substitute for the full-fidelity candidate.

The pilot includes all charts of the measured receiver and its internal seams; other receiver objects remain present for transport but their cross-object seam constraints are not solved. The installed full-city seam result and the local pilot therefore are not bit-identical baselines. Keep this limitation when selecting a production policy.

### Cost and promotion status

| Local receiver pilot | Chart rectangle pixels including padding | Temporary float atlas | Sky + bounce bake time |
|---|---:|---:|---:|
| 0.33m | 33,648 | 512x512, 4 MiB | 20.02s |
| Narrow-axis refinement | 53,316 | 512x512, 4 MiB | 20.28s |
| 0.0825m | 165,668 | 1024x1024, 16 MiB | 23.22s |

These are local offline OPTIX pilot costs, not game GPU costs or city-wide memory projections. RTX 3060, fixed 512 samples, same city/receiver, one sky and one bounce render per variant. Scene reconstruction/import is excluded from the per-variant table. No runtime frame-time, FPS, calls or triangle benchmark was run because no production renderer, defaults or installed package changed. Game performance impact of a larger city atlas remains unmeasured and must be measured before promotion. Current installed atlas has 10 pages, each 4096 squared, two mip levels, RGB9E5.

### Durable evidence and files

Under `tests/artifacts/screens/ai562_acesfilmic_reference_matching/`:
- `ai571_processing_20260914_02`: exact extension/overlap replay, per-chart measurements; 54.2s.
- `ai571_transport_20260914_02`: eight full/sun regional controls and ray-hit/material records; 216.8s.
- `ai571_geometry_game_20260914_01`: actual-game position/normal/native/restored passes; 287.3s.
- `ai571_geometry_cycles_20260914_01`: two regional geometry AOV renders and concrete face/vertex evidence; 32.3s.
- `ai571_geometry_analysis_20260914_01`: corrected metrics, regression self-check, green coherent/orange mixed-face masks; 8.6s.
- `ai571_spatial_20260914_01`: seven-chart convergence/batching controls, exact remapped samples; 263.9s.
- `ai571_refined_20260914_01`: whole-receiver native/adaptive/fine bakes, internal seam solves and final measurements; 228.7s.

Successful stage time totals 1,091.8s (18m12s), excluding investigation/code work and the two failed early attempts. All outputs are gitignored. User Blender session 2820 was left untouched; owned jobs completed and closed. Framework tests passed 13/13; shader policy passed; actual-game captures validated restoration and unchanged lighting/bake/source controls.

Additional tracked scripts: `surface_geometry.py`, `surface_geometry_summary.py`, `surface_normal_metrics.py`, `surface_spatial.py`, `surface_spatial_analysis.py`, `SurfaceSpatialPost.mjs`; extended diagnostic GLSL/loader and RawRadiance/MaterialParity geometry phase. No machine-specific standalone bake command was added.

## Next production step

1. Budget a bounded facade-detail atlas using the validated 8.25cm target where needed, retaining coarser allocation elsewhere. Include full-city page packing, mips and cross-object seams; do not blindly increase the entire city's texel count 16x.
2. Build through the registered illumination hierarchy, preserve validation/publication gates and compare the candidate against the existing installed package.
3. Rerender all five native poses, retaining authored AO/materials and excluding glass only from the opaque-wall metrics. Validate that the extra density does not introduce seam/coverage regressions elsewhere.
4. Run the established fresh-browser repeated GPU/CPU workload before promotion. The additional roughly 2% source/export transport difference and the separate glossy/AO differences remain distinct follow-ups; 99.56% here does not establish 99% game-wide parity.

AI571 remains active until production integration and these promotion checks are complete. The current requested investigation steps and diagnostic correction are complete; the game has not yet adopted the local refinement.

## On completion

Mark DONE and rename to `AI_DONE_graphics_571_MATERIAL_surface_transport_and_geometry_parity_DONE.md`. Summarize changes, evidence and remaining limits. For production optimization changes report same-condition frame time/FPS, CPU/GPU times, calls, triangles and memory with hardware, resolution, warm-up and sample count. Mark unmeasured metrics honestly; do not substitute projections. Do not commit unless requested.
