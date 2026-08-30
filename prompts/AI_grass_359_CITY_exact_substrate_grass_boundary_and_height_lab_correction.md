# Problem

The V1 Grass Lab does not clearly show the physical order from sidewalk to exposed substrate to a shallow raised grass carpet. Its canonical irregular cuts are stepped rectangles, the road edge can read as a broad fading brown overlay, the far cap exposes artificial square or micro-cutout patterns, and sparse fringe blades do not create a convincing cut edge.

# Request

Correct the grass footprint, exposed substrate, shallow height, and physical sidewalk/tree boundary in the dedicated Grass Lab. This prompt owns where grass exists and how the cut edge reveals substrate. It must consume AI 358's corrected material family without changing field density, LOD tiers, or gameplay.

This is step 10 of the offline-first grass sequence.

Tasks:
- Derive the canonical grass exclusion boundary from the same actual road and sidewalk outer loops used to render the fixture, including straight runs, curves, diagonal cuts, inside corners, and outside corners.
- Replace the stepped-rectangle approval fixture with deterministic polygonal, diagonal, and curved cuts. Rectangle compatibility may remain, but it must not be the approval path.
- Define one deterministic polygon and boundary-distance contract that reports hard grass occupancy, distance from the physical cut, and root eligibility without coupling footprint coverage to material blending.
- Preserve continuous PBR substrate under the whole lawn and expose a real narrow substrate strip after the sidewalk before grass begins. Use a documented default of `80 mm` with an accepted range of `60-100 mm`.
- Keep the structural root/thatch base shallow and separately documented from visible blade-tip height. Use `25-30 mm` only as the initial base-height reference, not as a universal canopy limit; visible blades may be longer and irregular according to the selected profile. Provide a plausible cut side rather than a green vertical wall.
- Disable the legacy broad translucent dirt-strip fade wherever the maintained-grass boundary is active. The substrate reveal must come from uncovered substrate, not color blending.
- Keep the far grass cap opaque and stable inside its hard footprint. Do not use auxiliary far-surface alpha noise to punch visible square or micro holes through complete distant turf.
- Replace isolated sparse fringe blades with one continuous batched cut-edge treatment that reads as dense cut vegetation. Keep the combined physical edge to no more than two grass-boundary logical draws, excluding the existing substrate draw.
- Convert worn tree substrate from an opaque disc over live grass into a deterministic exclusion that reveals the shared substrate around the trunk.
- Expose the corrected occupancy, boundary-distance, and root-eligibility contract to later near and middle tiers without modifying their representation in this prompt.
- Add deterministic diagnostics for source-loop identity, grass-onset width, canopy height, boundary deviation, occupied and excluded samples, antialias width, root eligibility, triangles, and logical draws.
- Add regression fixtures for straight, curved, diagonal, inside-corner, outside-corner, tree-base, and reload-stability behavior, including proof that no cap, root/thatch, or cut-edge geometry owned here reaches road or sidewalk.
- Capture UI-free native `3840x2160` paired substrate-only and boundary-final images from identical cameras at `0.30 m`, `0.50 m`, and `1.00 m`, plus zoomable straight, curve, diagonal, inside-corner, outside-corner, and tree-base views. Disable legacy near, cluster, and localized grass geometry in these boundary-approval views so V1 tiers cannot hide or invalidate this prompt's ownership result.
- Keep near density, patch geometry, billboard/cluster geometry, automatic LOD, AI 358 grass appearance assets, quality presets, and gameplay unchanged.

Acceptance outcomes:
- Every approval view clearly reads as sidewalk, then `80 +/- 20 mm` of exposed substrate, then a hard root/thatch cut, then a shallow raised grass carpet.
- The shallow structural base height and the separate visible blade-height distribution are documented and visible in side profile. Longer or irregular blade tips are allowed and are not clipped to a universal `25-30 mm` canopy.
- The grass-onset antialias region is no wider than `15 mm`.
- Straight, curved, diagonal, inside-corner, and outside-corner cuts follow the rendered sidewalk geometry without rectangular stepping or square brown fades.
- No cap, root/thatch, or cut-edge geometry owned by AI 359 crosses the road, sidewalk, trunk, or other hard exclusion. Eligibility diagnostics prove that later blade/card/patch roots will be rejected there; AI 360 and AI 361 own enforcement by their respective geometry tiers.
- No isolated sparse fringe remains along the canonical edge.
- The corrected cap and cut edge use no more than two grass-boundary logical draws, excluding substrate.
- Reloading the same topology and seed reproduces identical boundary geometry and diagnostics.
- All required PNGs are native `3840x2160`, UI-free, and clearly expose the sidewalk/substrate/grass profile.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358, `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, and the historical AI 354 boundary work as the V1 correction baseline.
- Creates `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md` and supplies its footprint/root-eligibility contract to AI 360 through AI 363.
- Does not issue whole-system approval.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 359 grass-sequence checklist item with the cap, substrate, root/thatch, edge, loader, calibration, and consumer work completed here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If this prompt changes a contract, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and every downstream grass prompt that consumes it.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record corrections in V2 contracts and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A before/after cost table for every representative fixture and quality preset used here. Report visible grass triangles, boundary/cap triangles, grass logical draw calls, total renderer draw calls, and measured CPU/GPU timing when available.
- An explicit cost delta and budget verdict, including the physical edge's logical draws. Costs may not be replaced by qualitative statements.
- A screenshot manifest with workspace-relative file paths under the prompt-specific ignored evidence directory, before/after or substrate-only/final role, camera position/target/height, pose, lighting, exposure, quality preset, triangle count, and grass/total draw-call counts.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- All straight, curved, diagonal, inside-corner, outside-corner, tree-base, and `0.30/0.50/1.00 m` boundary comparisons required above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai359/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_359_CITY_exact_substrate_grass_boundary_and_height_lab_correction_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
