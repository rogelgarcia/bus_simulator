# Problem

Gameplay still renders flat Grass004 terrain without the corrected cohesive Grass Lab carpet, physical substrate boundary, automatic representation hierarchy, or localized tree accents. Importing a partial or V1-approved result would duplicate systems and preserve the visual defects found after AI 357.

# Request

Import the AI 362 visual/functional-approved and AI 537 performance-approved V2 Grass Lab system into gameplay as a thin adapter over the canonical runtime, assets, profiles, coverage contract, representation hierarchy, and quality presets.

This is step 15 and the final prompt in the offline-first grass sequence. AI 537
is step 14 and the final offline performance gate. AI 363 is the only prompt in
this sequence authorized to modify gameplay grass integration.

Tasks:
- Verify that AI 350 through AI 362 and AI 537 are complete before changing gameplay. Require `specs/grass/GRASS_LAB_APPROVAL_AI362.json` with `schema: "grass-lab-approval-v2"`, `status: "approved"`, `approvalScope: "visual_functional_motion_determinism"`, `performance.status: "deferred_to_ai537"`, exact `performanceOwnership` and `performance.ownership` values of `{ "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`, `gameplayTouched: false`, and `authorization.gameplayAuthorized: false`. Also require `specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json` with `schema: "grass-lab-performance-approval-v1"`, `approvalScope: "performance"`, `status: "approved"`, and `sourceVisualApproval.sha256` matching the SHA-256 of the exact UTF-8 file bytes of the current AI 362 approval record.
- Treat the AI 357 approval record as historical evidence only; it is not sufficient authorization for this prompt.
- Reuse the exact canonical V2 grass runtime and asset/profile contracts validated in Grass Lab snapshot contract version `10`. This includes AI 360's deterministic `1 m` ownership cells, `64` root bins per eligible square metre, exactly `3` fibers per represented root, final per-root AI 359 exact-polygon postchecks, and AI 358's shared opaque zero-emissive `nearBladeAppearance`/material response. It also includes AI 361 AutoLOD version `2`, canonical `3/8/25 m` effective thresholds, one shared exact-coverage one-metre field layout, complementary handoff samples, one-card billboards, two-card middle patches, and two-card localized accents with no worn batch. Do not fork or reimplement a gameplay-only grass renderer, material family, boundary system, or LOD evaluator.
- Integrate AI 359's polygon coverage and boundary-distance contract with city terrain generation so continuous substrate remains underneath and grass begins after roads and sidewalks with the approved exposed strip and shallow raised cut.
- Consume actual gameplay road/sidewalk outer loops and terrain transforms rather than approximating them with axis-aligned rectangles.
- Treat the canonical Grass Lab's `junctions.filletRadiusFactor: 1.0` as fixture-only evidence, not a gameplay default or requirement. Consume each gameplay road configuration and the exact sidewalk loops it actually renders.
- Preserve AI 359's source-loop identity, onset-loop offset, signed-distance orientation, root clearance, boundary signature invalidation, opaque cap, tree holes, and maximum-two-draw boundary contract. Transform the same renderer-owned loops into coverage space once; do not reconstruct occupancy from textures, route envelopes, or compatibility rectangles.
- Feed those gameplay loops and terrain bounds into the canonical AI 360 coverage input. Preserve `coverageMode: exact_polygon`, `boundarySignature`, `placementSignature`, `candidateBins`, `eligibleBins`, `representedBins`, `unrepresentedEligibleBins`, `eligibleAreaSquareMeters`, `representedAreaSquareMeters`, `rejectedByKind`, and `exactPostcheckFailures` in gameplay diagnostics and cache invalidation; representative exact fixtures require `unrepresentedEligibleBins === 0` and `exactPostcheckFailures === 0`.
- Feed the same AI 359 definition/config and boundary signature into AI 361 field and accent consumers. Preserve field `placementSignature`, candidate/eligible/represented/unrepresented units and areas, rejection kinds, exact root/envelope failures, per-tier/overlap counts, and cache invalidation; representative exact fixtures require zero unrepresented eligible units and zero exact failures.
- Use existing deterministic tree/feature placement records for validated localized accents. Preserve `substrateOwnership: coverage_tree_hole`, exact root/envelope eligibility, two-card `ACCENT_CLUMP` rendering, final texture-handoff visibility, and zero worn patch/triangle/draw/material cost.
- Integrate the approved `close mesh -> dense billboard -> cohesive middle patch -> far texture` hierarchy and preserve AutoLOD V2 weights, transition progress, automatic distance/angle handoffs, same-key complementary masks, overlap, hysteresis, and the effective `25 m` hard cutoff.
- Resolve all PBR assets, physical dimensions, tile metadata, and calibration through the global texture/catalog/calibration pipeline, retaining AI 358's shared corrected near material identity rather than creating a gameplay palette or calibration fork.
- Expose the approved low/default/high grass quality presets through existing gameplay graphics/options configuration, including the safe texture/substrate/boundary-only fallback.
- Preserve lab culling, update-frequency, draw-call, geometry, shadow, alpha/mip, material, exact-envelope, and stationary-upload constraints in the integrated city. Billboard/middle share AI 358's V2 `MID_CLUSTER` material, accents use V2 `ACCENT_CLUMP`, and neither path may add a gameplay-local loader or appearance fork.
- Replace conflicting flat-grass assumptions only where required by the adapter while preserving road, sidewalk, building, collision, navigation, and terrain-height behavior.
- Validate representative driving, stationary, reverse, grazing, top-down/debug, straight/curved/corner sidewalk, exposed-substrate, tree-heavy, bus-camera, handoff, and far scenes against AI 362's visual/functional baseline and AI 537's optimized performance baseline.
- Capture UI-free lossless PNG gameplay comparisons from a real `3840x2160` drawing buffer at pixel ratio `1`, inheriting AI 362's exact capture/metadata contract and AI 537's final optimized runtime. Never upscale lower-resolution output. Retain the AI 537-approved unchanged `1920x1080` runtime budget as the performance gate, including the `200,000` combined visible-grass triangle ceiling across the AI 359 boundary, AI 360 near carpet, billboard, middle, and localized-accent geometry; account explicitly for the recorded `95,219`-triangle AI 359 reference boundary in equivalent fixtures. Report 4K timing separately.
- Add focused gameplay integration, determinism, quality-preset, cutoff, boundary, and performance regressions without weakening Grass Lab tests. Assert AI 360's canonical `64`-bin density and `3` fibers per root plus AI 361's AutoLOD V2 config/weights, one-metre field-unit layout, complementary masks, exact root/envelope diagnostics/signatures, shared AI 358 material identities, no-worn-batch zeros, zero stationary uploads, and combined-budget accounting against AI 362's approved contract state and AI 537's approved performance state.
- Remove or clearly deprecate obsolete gameplay grass loading/configuration paths only after the canonical replacement is verified.

Acceptance outcomes:
- Gameplay matches the AI 362-approved visual/functional Grass Lab at equivalent camera, lighting, exposure, and quality conditions, and matches AI 537's optimized performance state under the approved benchmark conditions.
- Grass reads as one continuous maintained carpet: close mesh, dense billboard coverage, cohesive middle patches, then far texture without isolated bright objects.
- Sidewalks show the approved real exposed-substrate strip, shallow structural grass base, and separately approved blade-height variation without affecting gameplay physics. Grass may be longer or locally irregular; gameplay must not force it into a uniform soccer-field cut.
- No grass root or geometry crosses roads, sidewalks, trunks, or other hard exclusions.
- Near diagnostics match the actual gameplay AI 359 definition and approved AI 360 contract, including matching boundary signatures, `64` root bins per eligible square metre, `3` fibers per represented root, zero unrepresented eligible bins, and zero exact postcheck failures in representative exact fixtures.
- Billboard and middle diagnostics match the approved AI 361 definition, including the same gameplay boundary signature, one-metre shared field units, zero unrepresented eligible units, zero exact root/envelope failures, complementary adjacent-tier handoffs, and zero geometry beyond the effective cutoff.
- Localized accents retain approved city-shaped inputs and AI 358 `ACCENT_CLUMP` rendering while reporting AI 359 tree-hole substrate ownership and zero worn-substrate geometry/material cost.
- Near, billboard, middle, far, boundary, and localized-accent representations remain within AI 537-approved preset budgets and AI 362-approved handoff contracts, including the `200,000` combined visible-grass triangle ceiling.
- Disabling field geometry leaves a coherent substrate, far carpet texture, and physical-boundary fallback.
- There is one shared grass runtime and one shared material pipeline across the lab and gameplay.
- Native-4K comparison screenshots show no gameplay-only visual or functional regression against AI 362, and representative runtime measurements show no performance regression against AI 537.

## Sequence dependency

- Requires completed AI 350 through AI 362 plus AI 537; scoped V2 approval in `specs/grass/GRASS_LAB_APPROVAL_AI362.json` with `schema: "grass-lab-approval-v2"`, `status: "approved"`, `approvalScope: "visual_functional_motion_determinism"`, `performance.status: "deferred_to_ai537"`, exact `performanceOwnership` and `performance.ownership` values of `{ "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`, `gameplayTouched: false`, and `authorization.gameplayAuthorized: false`; and performance approval in `specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json` with `schema: "grass-lab-performance-approval-v1"`, `approvalScope: "performance"`, `status: "approved"`, and a `sourceVisualApproval.sha256` matching the SHA-256 of the exact UTF-8 file bytes of the current AI 362 approval record.
- Must consume `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`, the finalized `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md` (`64` root bins per eligible square metre, `3` fibers per represented root, exact AI 359 coverage diagnostics, and shared AI 358 material ownership), `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md` (AutoLOD version `2`, `3/8/25 m`, shared one-metre exact layout, and complementary handoffs), and `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md` (two-card V2 accents, tree-hole substrate ownership, and zero worn batch) without forking them.
- `specs/grass/GRASS_LAB_APPROVAL_AI357.json` and V1 contracts are historical and do not unblock gameplay.
- This is the sole gameplay-integration owner in the sequence.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 363 grass-sequence checklist item with the gameplay material consumers, loader/calibration migration, and any remaining shared-pipeline obligation. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not add a gameplay-local texture resolver or loader.
- If integration discovers a visual, functional, motion, determinism, V2-contract, or shared-runtime defect, stop integration and return the defect to its owning offline stage, creating a scoped corrective prompt if that original prompt is already DONE. Rerun AI 362 and then AI 537 after the correction. A performance-only defect returns to AI 537. Resume AI 363 only after both freshly generated approval records satisfy their scoped fields. AI 363 may change adapter wiring but must not alter an approved V2 design itself or create a gameplay-only fork.
- Leave completed AI 350 through AI 362 and AI 537 prompts in place as historical records after their own completion.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A Grass Lab versus gameplay cost table using AI 537's optimized Lab state for every representative scene and low/default/high quality preset. Report AI 359 boundary, near, billboard, middle-patch, accent, and combined visible triangles; logical draw calls by grass tier and total; total renderer draw calls; stationary/moving buffer updates; and measured CPU/GPU timing.
- Explicit Lab-to-gameplay and old-gameplay-to-new-gameplay cost deltas with pass/fail verdicts against the AI 537-approved budgets, plus visual/functional deltas against AI 362's scoped approval. Costs may not be replaced by qualitative statements.
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
