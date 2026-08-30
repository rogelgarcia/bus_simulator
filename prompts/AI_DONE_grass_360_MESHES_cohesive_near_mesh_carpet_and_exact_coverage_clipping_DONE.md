DONE

# Problem

The V1 near tier scatters simplified blades across one-metre cells. At close camera heights it reads as occasional objects standing over a flat texture instead of the continuous fibers and shallow volume of a cohesive natural grass layer. Conservative whole-patch rejection also leaves a visible gap near physical grass cuts.

# Request

Create a cohesive, low-cost near-camera 3D carpet in the dedicated Grass Lab. This prompt owns only the closest mesh representation and its exact clipping to AI 359's footprint. It must consume the corrected appearance and physical boundary unchanged.

This is step 11 of the offline-first grass sequence.

Tasks:
- Replace the scattered V1 near tier with area-based micro-mesh patches that read as continuous short turf at `0.30 m`, `0.50 m`, and `1.00 m` camera heights.
- Keep the corrected opaque far surface under the near geometry so simplification never reveals empty ground between fibers.
- Use the AI 358 material family and AI 359 occupancy, boundary-distance, and root-eligibility contracts without changing their appearance or footprint semantics.
- Treat AI 359 boundary distance as positive on occupied grass and negative in an onset exclusion. Sample `rootEligible` at each blade/root or an equivalent proven sub-patch unit, preserve the declared root clearance, and invalidate placement caches when AI 359's boundary signature changes.
- Ensure every eligible close-region area receives a near representation. Do not use sparse random cell selection or isolated field-wide blades as the default path.
- Clip roots at blade or sub-patch granularity, or use deterministic edge variants, so the near carpet reaches the physical cut without crossing substrate or rejecting an entire patch because one corner overlaps an exclusion.
- Keep the structural turf base shallow while using a documented, configurable blade-height distribution. Blade tips may be longer, uneven, bent, and locally irregular; do not clip the entire mesh carpet to a universal `25-30 mm` canopy or make every blade the same height.
- Preserve shared geometry/material batching, chunk-level frustum culling, stable camera-cell ownership, static uploads while stationary, depth writing, and disabled grass shadows.
- Choose patch aggregation and mesh complexity by measured cohesion and budget rather than by literal real-world blade count. Reuse the existing grass-blade builder and Blender source where useful.
- Add diagnostics for eligible area, represented area, unrepresented occupancy bins, near instances, triangles, logical draws, material paths, boundary rejects/clips, buffer updates, culling, and stationary stability.
- Add forced-near diagnostic inspection, while leaving automatic multi-tier selection to AI 361.
- Add deterministic reload, clipping, no-sidewalk-root, culling, upload, and budget regressions.
- Capture UI-free native `3840x2160` texture-only versus near-mesh comparisons at `0.30 m`, `0.50 m`, and `1.00 m`, plus grazing, forward, oblique, top-down, physical-cut, and bus-scale views.
- Keep billboard and middle-patch representations, automatic LOD ranges and handoffs, localized accent placement, boundary construction, asset rebaking, final approval, and gameplay unchanged.

Acceptance outcomes:
- The closest lawn reads as one connected carpet with resolvable 3D fibers, not scattered blades or visible grid-cell stamps.
- No eligible near occupancy bin is unintentionally empty because of random placement.
- The near carpet reaches AI 359's physical cut without a conservative moat and without placing roots on exposed substrate, sidewalk, road, or tree exclusions.
- Rectangle compatibility data is not used when AI 359 supplies exact polygon exclusions; the same root test applies to sidewalk and tree onset loops.
- Geometry-on and texture-only color/luminance remain within AI 358's appearance contract.
- Side-profile evidence separately shows the shallow structural base and the selected blade-height range, including natural irregularity and any intentionally longer blades.
- Near rendering uses one normal material path and batched shared geometry, with no per-patch material or draw-call growth.
- Stationary cameras produce zero recurring instance-buffer uploads after settling.
- The prompt records measured triangle/draw costs for the required views and leaves enough headroom for AI 361's total default-field limit.
- Every required PNG is native `3840x2160` and UI-free.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358 and AI 359, including `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md` and `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`.
- Creates `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md` and supplies the cohesive near representation to AI 361 through AI 363.
- The V1 AI 353 near-patch result remains historical and is not the downstream approval contract.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 360 grass-sequence checklist item with the corrected near-mesh material payload, loader/calibration usage, and consumers completed here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If this prompt changes a contract, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and every downstream grass prompt that consumes it.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record corrections in V2 contracts and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A before/after cost table for every representative fixture and quality preset used here. Report visible near-grass triangles, total visible grass triangles, grass logical draw calls, total renderer draw calls, and measured CPU/GPU timing when available.
- An explicit cost delta and budget verdict for the near carpet, including default and worst required camera views. Costs may not be replaced by instance counts alone.
- For every comparison, state the hardware, resolution, graphics settings, grass density/coverage, workload and camera, warm-up, sample count, and statistic. Include frame time/FPS and relevant memory alongside the required geometry, draw-call, and CPU/GPU measurements; mark unavailable metrics as `not measured` with a reason instead of using projections.
- A screenshot manifest with workspace-relative file paths under the prompt-specific ignored evidence directory, before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active representation, triangle count, and grass/total draw-call counts.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- All texture-only/mesh-on, `0.30/0.50/1.00 m`, grazing, forward, oblique, top-down, cut-edge, and bus-scale comparisons required above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai360/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_360_MESHES_cohesive_near_mesh_carpet_and_exact_coverage_clipping_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.

## Completion evidence

### Completed changes

- Replaced the V1 scattered near blades with deterministic one-metre ownership cells containing 64 exact-tested root bins per square metre and three crossed micro-fibers per root.
- Consumed AI 359's exact polygon coverage ahead of legacy rectangles, sampled every root with the declared clearance, filled eligible partial bins, added grassward boundary rows, and retained zero missing eligible bins or postcheck intrusions.
- Reused AI 358's `pbr.grass_low_cut_maintained_v2` appearance directly through one opaque, depth-writing, zero-emissive, shadow-free shared material; no tier-local loader, calibration path, or new texture family was added.
- Separated the 27.5 mm structural base from absolute 40-75 mm tips, yielding 12.5-47.5 mm visible fibers with deterministic 2.2-5.8 mm widths, bends, inclination, brightness, and safe grassward reach.
- Batched shared geometry into at most 32 m chunks with chunk frustum culling, stable camera-cell ownership, deterministic transforms, and zero recurring uploads after a stationary settle.
- Added coverage-aware placement and sample caches whose identities include exact schema/version, polygon signature, definition bounds, sampling settings, placement settings, terrain bounds, and camera cell; config, terrain, and coverage changes now count and clear invalidations.
- Added forced texture-only and near-mesh inspection without importing automatic handoffs; clearing evidence mode restores normal near, mid-cluster, localized-accent, chunk, and debug visibility behavior.
- Expanded Grass Lab V9 UI/API diagnostics for cells, roots, fibers, eligible/represented area, rejects/clips, boundary rows, exact failures, material path, observed dimensions, culling, cache behavior, and buffer stability.
- Added the nine-pose paired native-4K capture matrix, hard approval gates, exact clipping evidence, combined 200,000-triangle checks, deterministic unit/headless regressions, the canonical V2 near-carpet spec, AI 349 ownership completion, and explicit AI 361-363 consumer contracts.
- Kept the work Grass Lab-only; gameplay ownership and assets are unchanged.

### Validation environment and method

- Date: 2026-08-30.
- Host: AMD Ryzen 5 9600X (6 cores / 12 logical processors), NVIDIA GeForce RTX 3060, driver 32.0.15.9186, Microsoft Windows 11 Pro 10.0.26200, Chrome 151.0.7922.176.
- Installed memory: 33,463,193,600 bytes visible system RAM; WMI reported 4,293,918,720 bytes adapter RAM. Per-process RAM, committed GPU memory, and peak allocation were **not measured** because the capture API exposes no process-memory sampler.
- Evidence workload: nine fixed cameras, each captured as an aligned `texture_only` / `near_mesh` pair under daylight, exposure 1, default quality, exact AI 359 boundary `grass-coverage-v2-8dfb0734`, coverage multiplier 1, 64 root bins/m², and three fibers/root.
- Every evidence image is one UI-free lossless PNG read from a real 3840×2160 WebGL drawing buffer at renderer pixel ratio 1 after 30 settling frames. Each row reports the single saved compositor frame and its same-frame settled metadata snapshot; this is not an average.
- Cost samples use the fixed `height_050` camera at 1920×1080, daylight/exposure 1, low/default/high settings, 60 settling frames, and the last settled metadata snapshot. CPU is the Grass Engine update sample and GPU is the renderer timer sample.
- Frame-time distributions and FPS were **not measured** because the harness records a last settled CPU/GPU snapshot rather than a statistically valid frame-time series. The 4K per-image CPU values in the machine-readable manifest can include the rolling window's one-time layout construction and are evidence metadata, not a steady-state benchmark.
- The split V2 material files were supplied through the repository-local Lab staging override at `tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2_split`; nothing was installed into or changed under gameplay assets.

### Before/after cost table

The fixed AI 359 coverage contributes 95,219 triangles and two opaque logical draws in every row. “Grass draws” is the capture API's near-field logical draw count; combined grass-related draws are therefore that value plus the two coverage draws.

| Phase | Quality | Near triangles | Total visible grass triangles | Grass draws | Renderer draws | Grass CPU ms | Whole-frame GPU ms | Near triangle delta | Budget |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Before V1 | Low | 0 | 95,219 | 0 | 13 | 0.036 | 0.508 | baseline | Pass |
| After V2 | Low | 0 | 95,219 | 0 | 13 | 0.056 | 0.750 | 0 | Pass |
| Before V1 | Default | 14,064 | 109,283 | 1 | 14 | 0.120 | 2.509 | baseline | Pass |
| After V2 | Default | 49,572 | 144,791 | 1 | 14 | 0.540 | 2.724 | +35,508 | Pass |
| Before V1 | High | 39,120 | 134,339 | 1 | 14 | 0.081 | 1.761 | baseline | Pass |
| After V2 | High | 87,840 | 183,059 | 1 | 14 | 0.739 | 5.148 | +48,720 | Pass |

Default V2 retains 55,209 triangles of combined headroom. The worst measured quality preset is high at 183,059 combined triangles, leaving 16,941 triangles below the 200,000 ceiling. The required physical-cut and bus views use four near draws plus the two fixed coverage draws, so their combined grass-related draw cost is six; the maximum total renderer count among required views is 15. All nine V2 mesh views report zero unrepresented eligible bins, zero exact-postcheck failures, zero ineligible emitted roots, zero sidewalk/tree intrusions, and zero last stationary uploads.

The physical-cut view records 7,954 eligible and represented bins, 657 boundary-completion roots, 8,570 correctly clipped sidewalk candidates, and 8,611 emitted roots / 25,833 fibers. Its observed tips are 40.000-74.989 mm, visible lengths 12.500-47.489 mm, and widths 2.201-5.799 mm. Required-view combined geometry ranges from 121,052 triangles at the physical cut to 144,791 triangles in the fixed near-field poses. The paired luminance ratio is 0.988-1.000, inside the 0.90-1.10 appearance gate.

### Test and gate results

- Focused Node contract/regression suite: **47/47 passed**.
- Real-browser Grass Lab validation: **2/2 passed** in 1.5 minutes using installed Chrome.
- Final capture refresh: **18/18 after images written**; combined before/after manifest contains **36/36 native-4K PNGs** and the AI 360 pair gate passes for both phases.
- `git diff --check`: passed before completion-record generation and again after finalization.
- Full repository Node run: 516 passed, 12 failed, 3 skipped. After correcting AI 360's stale budget fixture, the remaining failures are outside this change surface: unrelated facade/marking/decorator assertions, optional mesh-fabrication kernel modules, unavailable production-installed split V2 material assets, an inaccessible downloads fixture, and an unrelated texture-profile catalog gap. The scoped AI 360 suites above are clean.
- Machine-readable source of record: `tests/artifacts/screens/grass/ai360/capture_manifest.json`.

### Native-4K screenshot manifest

All paths are workspace-relative, all files are 3840×2160 PNGs, and all use renderer pixel ratio 1. “Near / combined” reports near triangles followed by near plus exact-coverage triangles. “Grass / renderer draws” reports the near-field logical count followed by the complete renderer count; add the fixed two coverage draws for the combined grass-related logical cost.

| Phase / role | File | Camera position → target (m); height | Pose | Light / exposure / quality | Active representation | Near / combined triangles | Grass / renderer draws |
|---|---|---|---|---|---|---:|---:|
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_height_030.png | (-45.97, 0.30, -115.40) → (-46.32, 0.04, -117.60); 0.30 | grazing | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_height_030.png | (-45.97, 0.30, -115.40) → (-46.32, 0.04, -117.60); 0.30 | grazing | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_height_050.png | (-46.62, 0.50, -114.20) → (-46.32, 0.04, -117.60); 0.50 | grazing | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_height_050.png | (-46.62, 0.50, -114.20) → (-46.32, 0.04, -117.60); 0.50 | grazing | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_height_100.png | (-45.52, 1.00, -112.40) → (-46.32, 0.04, -117.60); 1.00 | medium | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_height_100.png | (-45.52, 1.00, -112.40) → (-46.32, 0.04, -117.60); 1.00 | medium | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_grazing.png | (-47.52, 0.18, -114.80) → (-46.32, 0.04, -117.60); 0.18 | grazing_side | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_grazing.png | (-47.52, 0.18, -114.80) → (-46.32, 0.04, -117.60); 0.18 | grazing_side | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_forward.png | (-46.32, 0.62, -113.40) → (-46.32, 0.04, -117.60); 0.62 | forward | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_forward.png | (-46.32, 0.62, -113.40) → (-46.32, 0.04, -117.60); 0.62 | forward | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_oblique.png | (-43.52, 0.72, -114.00) → (-46.32, 0.04, -117.60); 0.72 | oblique | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_oblique.png | (-43.52, 0.72, -114.00) → (-46.32, 0.04, -117.60); 0.72 | oblique | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_top_down.png | (-45.92, 18.00, -116.90) → (-46.32, 0.04, -117.60); 18.00 | top_down | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_top_down.png | (-45.92, 18.00, -116.90) → (-46.32, 0.04, -117.60); 18.00 | top_down | daylight / 1 / default | near_mesh | 14,064 / 109,283 | 1 / 14 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_physical_cut_side_profile.png | (71.55, 0.30, 157.18) → (72.00, 0.03, 158.65); 0.30 | straight | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 12 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_physical_cut_side_profile.png | (71.55, 0.30, 157.18) → (72.00, 0.03, 158.65); 0.30 | straight | daylight / 1 / default | near_mesh | 2,688 / 97,907 | 4 / 13 |
| Before / texture | tests/artifacts/screens/grass/ai360/before_texture_only_bus_scale.png | (-72.00, 4.50, -163.50) → (-72.00, 1.60, -150.00); 4.50 | gameplay | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| Before / mesh | tests/artifacts/screens/grass/ai360/before_near_mesh_bus_scale.png | (-72.00, 4.50, -163.50) → (-72.00, 1.60, -150.00); 4.50 | gameplay | daylight / 1 / default | near_mesh | 7,248 / 102,467 | 3 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_height_030.png | (-45.97, 0.30, -115.40) → (-46.32, 0.04, -117.60); 0.30 | grazing | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_height_030.png | (-45.97, 0.30, -115.40) → (-46.32, 0.04, -117.60); 0.30 | grazing | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_height_050.png | (-46.62, 0.50, -114.20) → (-46.32, 0.04, -117.60); 0.50 | grazing | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_height_050.png | (-46.62, 0.50, -114.20) → (-46.32, 0.04, -117.60); 0.50 | grazing | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_height_100.png | (-45.52, 1.00, -112.40) → (-46.32, 0.04, -117.60); 1.00 | medium | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_height_100.png | (-45.52, 1.00, -112.40) → (-46.32, 0.04, -117.60); 1.00 | medium | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_grazing.png | (-47.52, 0.18, -114.80) → (-46.32, 0.04, -117.60); 0.18 | grazing_side | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_grazing.png | (-47.52, 0.18, -114.80) → (-46.32, 0.04, -117.60); 0.18 | grazing_side | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_forward.png | (-46.32, 0.62, -113.40) → (-46.32, 0.04, -117.60); 0.62 | forward | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_forward.png | (-46.32, 0.62, -113.40) → (-46.32, 0.04, -117.60); 0.62 | forward | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_oblique.png | (-43.52, 0.72, -114.00) → (-46.32, 0.04, -117.60); 0.72 | oblique | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_oblique.png | (-43.52, 0.72, -114.00) → (-46.32, 0.04, -117.60); 0.72 | oblique | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_top_down.png | (-45.92, 18.00, -116.90) → (-46.32, 0.04, -117.60); 18.00 | top_down | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_top_down.png | (-45.92, 18.00, -116.90) → (-46.32, 0.04, -117.60); 18.00 | top_down | daylight / 1 / default | near_mesh | 49,572 / 144,791 | 1 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_physical_cut_side_profile.png | (71.55, 0.30, 157.18) → (72.00, 0.03, 158.65); 0.30 | straight | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 12 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_physical_cut_side_profile.png | (71.55, 0.30, 157.18) → (72.00, 0.03, 158.65); 0.30 | straight | daylight / 1 / default | near_mesh | 25,833 / 121,052 | 4 / 14 |
| After / texture | tests/artifacts/screens/grass/ai360/after_texture_only_bus_scale.png | (-72.00, 4.50, -163.50) → (-72.00, 1.60, -150.00); 4.50 | gameplay | daylight / 1 / default | texture_only | 0 / 95,219 | 0 / 13 |
| After / mesh | tests/artifacts/screens/grass/ai360/after_near_mesh_bus_scale.png | (-72.00, 4.50, -163.50) → (-72.00, 1.60, -150.00); 4.50 | gameplay | daylight / 1 / default | near_mesh | 42,747 / 137,966 | 4 / 15 |
