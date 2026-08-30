# Problem

AI 357 completed a V1 validation workflow, but later zoomed review exposed scattered bright grass, weak tier matching, unclear sidewalk/substrate evidence, and artificial square fades. Its `1280x720` images and approval record therefore cannot authorize gameplay integration of the corrected visual design.

# Request

Validate and, where allowed, tune the completed corrective Grass Lab system at native 4K. Create a new V2 approval record only if material cohesion, physical boundary behavior, automatic LOD, motion stability, determinism, and runtime budgets all pass. Do not redesign ownership contracts or touch gameplay.

This is step 13 of the offline-first grass sequence and the final offline gate.

Tasks:
- Require completed AI 358 through AI 361 and the exact V2 contracts `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`, `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md`, `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md`, and `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md` before starting whole-system approval.
- Treat `specs/grass/GRASS_LAB_APPROVAL_AI357.json` and `GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` as historical V1 evidence. They are not sufficient dependencies for gameplay.
- Use automatic LOD and the default quality preset as the primary approval path. Manual tier forcing remains diagnostic only.
- Capture lossless native `3840x2160` PNGs from an actual `3840x2160` drawing buffer at pixel ratio `1`; never upscale a lower-resolution capture.
- Record and automatically verify each image's pixel dimensions, camera position and target, camera height, lighting, exposure, quality preset, active tiers, instances, triangles, logical draws, and asset/contract signatures.
- Capture clean UI-free visual frames and separate diagnostic-overlay frames. Produce matched before/after pairs with identical camera, lighting, exposure, and quality state.
- Include `0.30 m`, `0.50 m`, `1.00 m`, `1.50 m`, `2.00 m`, `3.00 m`, and `5.00 m` inspections; grazing, forward, oblique, top-down, bus, tree-base, and far views; and every close/billboard/middle/texture handoff.
- Include dedicated straight sidewalk, curved sidewalk, diagonal cut, inside corner, outside corner, irregular cut, low side profile, exposed substrate, and tree-substrate views that make the sidewalk/substrate/grass order unmistakable.
- Repeat critical material, edge, and handoff views under daylight, overcast, golden-hour, and night/street lighting.
- Capture texture-only and geometry-disabled fallback views proving low quality remains cohesive.
- Exercise stationary, forward, reverse, strafe, and flyover paths through every handoff and measure temporal flicker, alpha disappearance, popping, geometry beyond cutoff, and buffer updates.
- Add pixel/regression checks for isolated bright points, tier color/luminance discontinuity, zero-coverage mip collapse, missing coverage bins, sidewalk roots, boundary deviation, square substrate fades, excessive antialias width, height error, and non-deterministic reloads.
- Verify the appearance target from AI 358, the `80 +/- 20 mm` exposed substrate strip, the configured shallow structural-base height, the separately declared blade-height/irregularity distribution, `<=15 mm` grass-onset antialias width, and exact hard exclusions. Do not require a universal `25-30 mm` canopy.
- Re-measure the runtime gate at `1920x1080`: average GrassEngine CPU `<=0.60 ms`, whole-frame GPU proxy `<=1.50 ms` when supported, approximately `5-6` typical grass draws with `12` hard ceiling, `<=200,000` visible grass triangles, zero geometry beyond cutoff, and zero recurring stationary uploads. Report native-4K timing separately as informational hardware evidence.
- Return architectural failures to the owning prompt instead of hiding them with validation-only special cases. Limit tuning here to bounded preset values and evidence settings already owned by the approved contracts.
- Create `specs/grass/GRASS_LAB_VALIDATION_AND_APPROVAL_V2.md`, `specs/grass/GRASS_LAB_APPROVAL_AI362.json`, and the evidence directory `screens/grass_ai362/`.
- Set the AI 362 approval status to `approved` only if every required camera, lighting, boundary, material, motion, determinism, and budget gate passes with no missing evidence.
- Keep gameplay untouched.

Acceptance outcomes:
- Every delivered visual approval PNG is verified native `3840x2160`, UI-free, and traceable to exact state metadata.
- Close views read as a connected carpet with resolvable 3D fibers; later tiers simplify without becoming sparse or isolated.
- No view contains neon blades/cards, bright atlas pixels, visible card-shaped clumps, square brown fades, or a grass tier whose color separates from the far surface.
- Straight, curved, diagonal, and corner views clearly show a shallow raised grass carpet with a hard cut and real exposed substrate.
- Motion tests show no major shimmer, alpha/mip collapse, handoff ring, isolated remnant, or obvious pop.
- Low quality remains a coherent corrected texture, substrate, and physical-boundary fallback.
- The `1920x1080` runtime budget gates pass; native-4K timings are recorded separately.
- `GRASS_LAB_APPROVAL_AI362.json` lists no missing review, regression, or evidence item and reports `status: "approved"`.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358 through AI 361.
- Supersedes AI 357 only as the current gameplay-authorization gate; AI 357's completed prompt, screenshots, V1 spec, and measurements remain historical evidence.
- AI 363 may begin only after this prompt is DONE and `specs/grass/GRASS_LAB_APPROVAL_AI362.json` reports `status: "approved"`.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 362 grass-sequence checklist item with the validated material consumers and any shared-pipeline obligation discovered here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If validation changes a contract or dependency, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and AI 363 before completion.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record the new authorization state in the V2 approval files and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A consolidated before/after and per-tier cost table for every approval camera, motion path, lighting fixture, and quality preset. Report visible triangles by tier and total, logical draw calls by grass tier and total, total renderer draw calls, stationary/moving buffer updates, and measured CPU/GPU timing.
- Explicit average, maximum, delta, and pass/fail values against every default/high/worst-view budget. The AI 362 JSON approval record must reference the same measurements.
- A complete screenshot manifest with repository-relative PNG paths, before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active tiers, triangle count, grass/total draw-call counts, and image-dimension verification.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- Every camera, height, lighting, boundary, tree, fallback, handoff, motion, and far comparison required above. List missing evidence as a failed gate; this prompt cannot be marked DONE and `GRASS_LAB_APPROVAL_AI362.json` cannot report approval while anything is missing.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_362_TESTS_4k_grass_lab_visual_validation_performance_and_reapproval_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
