# DONE

> **Human visual validation: REJECTED (2026-08-31).** The user rejected the complete offline-first grass solution spanning AI 350–362 and AI 537 after reviewing the final renders. This prompt is historical implementation evidence only: its DONE state does not approve the visual result, authorize gameplay integration, or define an acceptable baseline for future grass work. Any replacement must start from a new visual direction and receive explicit human approval.

## Completion summary

- Added a deterministic binary grass-coverage contract with independent density, exclusion, humidity/dryness, and accent-eligibility semantics.
- Added one batched raised surface, one batched boundary lip, and one batched sparse fringe with bounded opaque draw/material cost.
- Raised the maintained carpet by `27.5 mm`, consumed `far_coverage.png` as a hard micro cutout, and preserved the continuous visible substrate below it.
- Expanded near-patch exclusions so complete blade patches stay outside sidewalks, corners, and approximate irregular cuts.
- Added Grass Lab coverage controls, deterministic straight/corner/irregular cameras, diagnostics, tests, specifications, and comparison screenshots.
- Updated the dynamic AI 349 checklist and the then-current downstream grass prompts while leaving gameplay untouched; current gameplay ownership is AI 363.

# Problem

The existing substrate work blends materials smoothly, but actual grass coverage must have a physically readable edge: substrate underneath, a shallow grass layer above it, and blades interrupting the boundary. Straight and corner sidewalk cuts currently have no grass height or fringe.

# Request

Implement and validate the ground-to-grass coverage contract, raised carpet edge, and sidewalk boundary behavior in the canonical Grass Lab.

This is step 5 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Define deterministic grass-control semantics for at least occupancy/coverage, density, exclusion, humidity/dryness response, and localized accent eligibility.
- Keep the binary grass-coverage decision distinct from soft transitions between substrate or biome materials.
- Represent maintained grass as a shallow layer approximately `25-30 mm` above its substrate where the coverage contract says grass exists.
- Show substrate continuously below the grass layer and through gaps between boundary blades; do not dissolve substrate and grass together with a broad smooth material crossfade.
- Consume `far_coverage.png` from the completed `pbr.grass_low_cut_maintained_v1` family as a data input where useful; do not reinterpret its grayscale values as a soft substrate/material blend.
- Reuse the existing sidewalk outer-boundary/offset work to validate straight edges, outside corners, inside corners, and approximate irregular cuts in the lab fixtures.
- Produce a batched grass lip/skirt and sparse fringe that follows those boundaries while keeping material and draw-call count bounded.
- Ensure blade roots and patches outside the grass footprint are rejected deterministically, including at corners and exclusion areas.
- Support hard coverage with only the narrow antialias/dither treatment needed to prevent pixel aliasing.
- Document how the grass contract can consume shared terrain/biome masks without becoming coupled to unfinished biome tooling.

Acceptance outcomes:
- Grass visibly begins after the sidewalk and has a small, consistent height above substrate.
- Substrate-to-grass boundaries read as cut vegetation, not a melted material gradient.
- Straight, curved/corner, and excluded-area fixtures remain stable after reload.
- The complete lab boundary is batched rather than rendered as one draw per edge segment.

## Sequence dependency

- Requires completed AI 350 through AI 352 and completed `AI_DONE_grass_353_MESHES_near_camera_instanced_grass_carpet_patches_DONE.md`; AI 352's material contract is `LOW_CUT_GRASS_MATERIAL_V1.md`, and AI 353's near-patch contract is `NEAR_GRASS_CARPET_PATCH_V1.md`.
- Supplies coverage and accent inputs required by `AI_grass_355` and `AI_grass_356`.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update affected dynamic AI files. Do not mark broad biome-transition work complete unless its own outcomes were actually implemented; record only the grass-specific contract as complete.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_354_CITY_hard_grass_coverage_substrate_and_sidewalk_edge_lab_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Post-completion sequence reconciliation

- This completed V1 boundary remains historical. AI 359 owns the V2 polygon footprint, real exposed-substrate strip, shallow cut height, and tree substrate exclusion required by AI 363.
