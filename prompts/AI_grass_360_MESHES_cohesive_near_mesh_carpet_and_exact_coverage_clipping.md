# Problem

The V1 near tier scatters simplified blades across one-metre cells. At close camera heights it reads as occasional objects standing over a flat texture instead of the continuous fibers and shallow volume of a cohesive natural grass layer. Conservative whole-patch rejection also leaves a visible gap near physical grass cuts.

# Request

Create a cohesive, low-cost near-camera 3D carpet in the dedicated Grass Lab. This prompt owns only the closest mesh representation and its exact clipping to AI 359's footprint. It must consume the corrected appearance and physical boundary unchanged.

This is step 11 of the offline-first grass sequence.

Tasks:
- Replace the scattered V1 near tier with area-based micro-mesh patches that read as continuous short turf at `0.30 m`, `0.50 m`, and `1.00 m` camera heights.
- Keep the corrected opaque far surface under the near geometry so simplification never reveals empty ground between fibers.
- Use the AI 358 material family and AI 359 occupancy, boundary-distance, and root-eligibility contracts without changing their appearance or footprint semantics.
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
