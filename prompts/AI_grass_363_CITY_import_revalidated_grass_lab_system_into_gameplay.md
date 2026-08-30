# Problem

Gameplay still renders flat Grass004 terrain without the corrected cohesive Grass Lab carpet, physical substrate boundary, automatic representation hierarchy, or localized tree accents. Importing a partial or V1-approved result would duplicate systems and preserve the visual defects found after AI 357.

# Request

Import the AI 362-approved V2 Grass Lab system into gameplay as a thin adapter over the canonical runtime, assets, profiles, coverage contract, representation hierarchy, and quality presets.

This is step 14 and the final prompt in the offline-first grass sequence. It is the only prompt in this sequence authorized to modify gameplay grass integration.

Tasks:
- Verify that AI 350 through AI 362 are complete and that `specs/grass/GRASS_LAB_APPROVAL_AI362.json` exists with `status: "approved"` before changing gameplay.
- Treat the AI 357 approval record as historical evidence only; it is not sufficient authorization for this prompt.
- Reuse the exact canonical V2 grass runtime and asset/profile contracts validated in the lab. Do not fork or reimplement a gameplay-only grass renderer, material family, boundary system, or LOD evaluator.
- Integrate AI 359's polygon coverage and boundary-distance contract with city terrain generation so continuous substrate remains underneath and grass begins after roads and sidewalks with the approved exposed strip and shallow raised cut.
- Consume actual gameplay road/sidewalk outer loops and terrain transforms rather than approximating them with axis-aligned rectangles.
- Treat the canonical Grass Lab's `junctions.filletRadiusFactor: 1.0` as fixture-only evidence, not a gameplay default or requirement. Consume each gameplay road configuration and the exact sidewalk loops it actually renders.
- Preserve AI 359's source-loop identity, onset-loop offset, signed-distance orientation, root clearance, boundary signature invalidation, opaque cap, tree holes, and maximum-two-draw boundary contract. Transform the same renderer-owned loops into coverage space once; do not reconstruct occupancy from textures, route envelopes, or compatibility rectangles.
- Use existing deterministic tree placement records for validated localized accents and substrate exclusions without rendering opaque wear discs over live grass.
- Integrate the approved `close mesh -> dense billboard -> cohesive middle patch -> far texture` hierarchy and preserve its automatic distance/angle handoffs, overlap, hysteresis, and hard cutoff.
- Resolve all PBR assets, physical dimensions, tile metadata, and calibration through the global texture/catalog/calibration pipeline.
- Expose the approved low/default/high grass quality presets through existing gameplay graphics/options configuration, including the safe texture/substrate/boundary-only fallback.
- Preserve lab culling, update-frequency, draw-call, geometry, shadow, alpha/mip, material, and stationary-upload constraints in the integrated city.
- Replace conflicting flat-grass assumptions only where required by the adapter while preserving road, sidewalk, building, collision, navigation, and terrain-height behavior.
- Validate representative driving, stationary, reverse, grazing, top-down/debug, straight/curved/corner sidewalk, exposed-substrate, tree-heavy, bus-camera, handoff, and far scenes against the AI 362 baseline.
- Capture UI-free lossless PNG gameplay comparisons from a real `3840x2160` drawing buffer at pixel ratio `1`, inheriting AI 362's exact capture/metadata contract. Never upscale lower-resolution output. Retain the approved `1920x1080` runtime budget as the performance gate and report 4K timing separately.
- Add focused gameplay integration, determinism, quality-preset, cutoff, boundary, and performance regressions without weakening Grass Lab tests.
- Remove or clearly deprecate obsolete gameplay grass loading/configuration paths only after the canonical replacement is verified.

Acceptance outcomes:
- Gameplay matches the AI 362-approved Grass Lab at equivalent camera, lighting, exposure, and quality conditions.
- Grass reads as one continuous maintained carpet: close mesh, dense billboard coverage, cohesive middle patches, then far texture without isolated bright objects.
- Sidewalks show the approved real exposed-substrate strip, shallow structural grass base, and separately approved blade-height variation without affecting gameplay physics. Grass may be longer or locally irregular; gameplay must not force it into a uniform soccer-field cut.
- No grass root or geometry crosses roads, sidewalks, trunks, or other hard exclusions.
- Near, billboard, middle, far, boundary, and localized-accent representations remain within the approved preset budgets and handoff contracts.
- Disabling field geometry leaves a coherent substrate, far carpet texture, and physical-boundary fallback.
- There is one shared grass runtime and one shared material pipeline across the lab and gameplay.
- Native-4K comparison screenshots and representative runtime measurements show no gameplay-only visual or performance regression.

## Sequence dependency

- Requires completed AI 350 through AI 362 and explicit V2 approval in `specs/grass/GRASS_LAB_APPROVAL_AI362.json`.
- Must consume `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`, `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md`, `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md`, and `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md` without forking them.
- `specs/grass/GRASS_LAB_APPROVAL_AI357.json` and V1 contracts are historical and do not unblock gameplay.
- This is the sole gameplay-integration owner in the sequence.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 363 grass-sequence checklist item with the gameplay material consumers, loader/calibration migration, and any remaining shared-pipeline obligation. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not add a gameplay-local texture resolver or loader.
- If integration discovers a V2 contract or runtime defect, stop integration and return the defect to its owning offline stage, creating a scoped corrective prompt if that original prompt is already DONE. Rerun AI 362 after the correction, and resume AI 363 only after a newly generated approval record/signature reports `status: "approved"`. AI 363 may change adapter wiring but must not alter an approved V2 design itself or create a gameplay-only fork.
- Leave completed AI 350 through AI 362 prompts in place as historical records after their own completion.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A Grass Lab versus gameplay cost table for every representative scene and low/default/high quality preset. Report visible triangles by grass tier and total, logical draw calls by grass tier and total, total renderer draw calls, stationary/moving buffer updates, and measured CPU/GPU timing.
- Explicit Lab-to-gameplay and old-gameplay-to-new-gameplay cost deltas with pass/fail verdicts against the AI 362-approved budgets. Costs may not be replaced by qualitative statements.
- A screenshot manifest with workspace-relative PNG paths under the prompt-specific ignored evidence directory, Lab/gameplay and before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active tiers, triangle count, grass/total draw-call counts, and image-dimension verification.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- All driving, stationary, reverse, grazing, top-down, sidewalk/corner/substrate, tree-heavy, bus, handoff, far, and geometry-disabled comparisons required above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai363/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_363_CITY_import_revalidated_grass_lab_system_into_gameplay_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
