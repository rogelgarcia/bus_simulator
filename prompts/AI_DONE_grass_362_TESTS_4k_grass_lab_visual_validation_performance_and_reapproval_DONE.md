DONE

# Problem

AI 357 completed a V1 validation workflow, but later zoomed review exposed scattered bright grass, weak tier matching, unclear sidewalk/substrate evidence, and artificial square fades. Its `1280x720` images and approval record therefore cannot authorize gameplay integration of the corrected visual design.

# Request

Validate and, where allowed, tune the completed corrective Grass Lab system at native 4K. Create a scoped V2 approval record only if material cohesion, physical boundary behavior, automatic LOD, motion stability, and determinism pass. Measure the existing runtime budgets faithfully, but record `performance.status: "deferred_to_ai537"` rather than silently passing a failed row or optimizing the renderer here. Do not redesign ownership contracts or touch gameplay.

This is step 13 of the offline-first grass sequence and the visual, functional,
motion, and determinism approval gate. AI 537 is the subsequent and final
offline performance gate.

Tasks:
- Require completed AI 358 through AI 361 and the exact V2 contracts `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`, `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md`, `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md`, and `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md` before starting scoped visual/functional approval.
- Validate AI 360 against its finalized contract, not a retuned substitute: deterministic `1 m` ownership cells, `64` root bins per eligible square metre, exactly `3` fibers per represented root, final per-root AI 359 exact-polygon postchecks, and AI 358's shared opaque zero-emissive `nearBladeAppearance`/material response. Record and assert `coverageMode: exact_polygon`, `boundarySignature`, `placementSignature`, `candidateBins`, `eligibleBins`, `representedBins`, `unrepresentedEligibleBins`, `eligibleAreaSquareMeters`, `representedAreaSquareMeters`, `rejectedByKind`, and `exactPostcheckFailures`; exact approval fixtures require `unrepresentedEligibleBins === 0` and `exactPostcheckFailures === 0`.
- Validate Grass Lab snapshot contract version `10` and AI 361's `bus-simulator.grass-auto-lod` version `2` unchanged: force values `auto|near|billboard|middle|texture`, weights `{ near, billboard, middle, texture }`, canonical `3/8/25 m` effective thresholds, `2 m` transition width, `0.75 m` hysteresis, `12/70 deg` angle anchors, `0.8/1.2` angle scales, the three named transition states/progress values, and zero geometry at or beyond the effective cutoff.
- Validate AI 361's shared world-aligned `1 m` field layout and complementary handoffs. Record `boundarySignature`, `placementSignature`, `candidateUnits`, `eligibleUnits`, `representedUnits`, `unrepresentedEligibleUnits`, eligible/represented areas, `rejectedByKind`, `exactPostcheckFailures`, `exactEnvelopeFailures`, and per-tier/overlap unit counts; exact approval fixtures require zero unrepresented units and zero exact root/envelope failures.
- Validate one-card billboards and two-card middle patches through one shared AI 358 V2 `MID_CLUSTER` material, plus two-card localized clumps through the separate V2 `ACCENT_CLUMP` material. Both card families retain split coverage alpha, `0.35` cutoff, `world_up_blend: 1.0`, zero emissive, and the global loader/calibration path. Accents follow `1 - textureWeight`, use AI 359 exact root/envelope eligibility, and report `substrateOwnership: coverage_tree_hole` with zero worn patch/triangle/draw/material cost.
- Treat `specs/grass/GRASS_LAB_APPROVAL_AI357.json` and `GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` as historical V1 evidence. They are not sufficient dependencies for gameplay.
- Use automatic LOD and the default quality preset as the primary approval path. Manual tier forcing remains diagnostic only.
- Capture lossless native `3840x2160` PNGs from an actual `3840x2160` drawing buffer at pixel ratio `1`; never upscale a lower-resolution capture.
- Record and automatically verify each image's pixel dimensions, camera position and target, camera height, lighting, exposure, quality preset, evidence role, AutoLOD weights/transition progress, active tiers, exact coverage/placement signatures, eligible/represented/overlap units, instances, triangles, logical draws, and asset/material contract signatures.
- Capture clean UI-free visual frames and separate diagnostic-overlay frames. Produce matched before/after pairs with identical camera, lighting, exposure, and quality state.
- Because AI 362 validates rather than redesigns the completed runtime, the
  matched BEFORE side may consume AI 361's immutable final-code native-4K
  manifest and PNGs. In that case, map every designated before/after
  comparison to an exact AI 361 baseline recipe and verify both files,
  dimensions, hashes, camera
  position/target, lighting, exposure, and quality state. A missing or
  misaligned baseline fails the evidence gate; a clean/diagnostic-overlay pair
  is not a substitute for this before/after comparison. Review-only AI 362
  cameras with no true AI 361 counterpart remain required after evidence but
  must not be mislabeled as paired baseline comparisons.
- In the completion response, display representative final screenshots inline
  from multiple angles. File links may accompany them but must not be the only
  visual handoff.
- Include `0.30 m`, `0.50 m`, `1.00 m`, `1.50 m`, `2.00 m`, `3.00 m`, and `5.00 m` inspections; grazing, forward, oblique, top-down, bus, tree-base, and far views; and every close/billboard/middle/texture handoff.
- Include dedicated straight sidewalk, curved sidewalk, diagonal cut, inside corner, outside corner, irregular cut, low side profile, exposed substrate, and tree-substrate views that make the sidewalk/substrate/grass order unmistakable.
- Repeat critical material, edge, and handoff views under daylight, overcast, golden-hour, and night/street lighting.
- Capture texture-only and geometry-disabled fallback views proving low quality remains cohesive.
- Exercise stationary plus fixed-progress forward, reverse, strafe, and flyover paths through every handoff, resetting hysteresis before repeat runs. Measure deterministic equality, temporal flicker, alpha disappearance, popping, both-hidden/overlap units, geometry beyond cutoff, and buffer updates.
- Add pixel/regression checks for isolated bright points, tier color/luminance discontinuity, zero-coverage mip collapse, missing coverage bins/units, sidewalk roots, boundary or card-envelope deviation, square substrate fades, worn discs, excessive antialias width, height error, both-hidden handoff gaps, and non-deterministic reloads. Fail if AI 360's canonical density/fibers or AI 361's canonical tier config, shared field layout, complementary samples, exact diagnostics/signatures, material identities, or no-worn-batch contract drift.
- Verify RoadEngine sidewalk source identity against AI 359's source loops, positive/negative signed-distance orientation, root-clearance behavior, separate sidewalk/tree reveal diagnostics, zero source intrusions, stable boundary signatures, and the cap-plus-edge ceiling of two logical draws excluding substrate.
- Verify the appearance target from AI 358, the `80 +/- 20 mm` exposed substrate strip, the configured shallow structural-base height, the separately declared blade-height/irregularity distribution, `<=15 mm` grass-onset antialias width, and exact hard exclusions. Do not require a universal `25-30 mm` canopy.
- Re-measure the unchanged runtime gate at `1920x1080`: average GrassEngine CPU `<=0.60 ms`, measured whole-frame GPU timer-query mean `<=1.50 ms` when supported, approximately `5-6` typical grass draws with `12` hard ceiling, `<=200,000` combined visible grass triangles, zero geometry beyond cutoff, and zero recurring stationary uploads. The combined ceiling includes the AI 359 cap/edge boundary, AI 360 near carpet, billboard, middle, and localized-accent geometry; explicitly include the recorded `95,219`-triangle AI 359 reference boundary in the relevant fixture total. Report native-4K timing separately as informational hardware evidence. A measured performance failure does not become an AI 362 pass: preserve the actual result and set `performance.status: "deferred_to_ai537"`.
- Record exactly one row for each canonical measurement ID: `quality_low`, `quality_default`, `quality_high`, `default_worst_view`, and `default_transition_overlap`. AI 362 still requires every non-timing structural gate to pass: exact tier accounting, `<=200,000` combined triangles, `<=12` combined logical draws, `<=2` boundary draws, zero geometry beyond cutoff, and zero recurring stationary uploads. Only the CPU/GPU timing-budget verdicts are deferred.
- Return visual, functional, motion, or determinism failures to the owning prompt instead of hiding them with validation-only special cases. Limit tuning here to bounded evidence settings already owned by the approved contracts; transfer whole-scene GPU optimization to AI 537.
- Create `specs/grass/GRASS_LAB_VALIDATION_AND_APPROVAL_V2.md`, `specs/grass/GRASS_LAB_APPROVAL_AI362.json`, and the evidence directory `tests/artifacts/screens/grass/ai362/`. The approval JSON must use `schema: "grass-lab-approval-v2"`; carry `approvalScope: "visual_functional_motion_determinism"`, finalized AI 360 density/fiber settings and AI 361 AutoLOD config/weights, field/accent material identities, boundary/placement signatures, exact bin/unit/root counts, areas, rejections and postcheck/envelope failures, handoff overlap/unrepresented counts, worn-cost zeros, per-tier triangle/draw totals, buffer updates, and combined totals; include exact top-level `performanceOwnership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`; and include a `performance` object containing all five canonical `1920x1080` rows plus `status: "deferred_to_ai537"`, the same exact `ownership`, and `passRequired: false`. Record native-4K timing separately as informational `captureEvidence.native4kPerformanceMeasurements`, not as a sixth canonical performance-gate row. It must also preserve `gameplayTouched: false`, `authorization.status: "blocked_pending_ai537"`, and `authorization.gameplayAuthorized: false`.
- Set the scoped AI 362 `status` to `approved` only if every required camera, lighting, boundary, material, motion, determinism, and evidence-completeness gate passes. That scoped status does not assert that the performance budget passed and cannot authorize gameplay without AI 537's separate performance approval.
- Keep gameplay untouched.

Acceptance outcomes:
- Every delivered visual approval PNG is verified native `3840x2160`, UI-free, and traceable to exact state metadata.
- Close views read as a connected carpet with resolvable 3D fibers; later tiers simplify without becoming sparse or isolated.
- AI 360 remains at `64` root bins per eligible square metre and `3` fibers per represented root, uses AI 358's shared material response, matches the exact AI 359 boundary signature, and reports zero unrepresented eligible bins and zero exact postcheck failures in approval fixtures.
- AI 361 remains AutoLOD version `2` at canonical `3/8/25 m` effective thresholds, with only adjacent-tier handoffs, shared complementary samples, zero unrepresented eligible field units, zero exact root/envelope failures, and zero geometry beyond cutoff.
- Billboard, middle, and accent tiers match the far surface without neon/card bands, use their exact AI 358 shared V2 atlas families, and accents show no worn-substrate overlay or extra material/draw path.
- No view contains neon blades/cards, bright atlas pixels, visible card-shaped clumps, square brown fades, or a grass tier whose color separates from the far surface.
- Straight, curved, diagonal, and corner views clearly show a shallow raised grass carpet with a hard cut and real exposed substrate.
- Motion tests show no major shimmer, alpha/mip collapse, handoff ring, isolated remnant, or obvious pop.
- Low quality remains a coherent corrected texture, substrate, and physical-boundary fallback.
- The `1920x1080` runtime budget rows are measured and retained without substitution or omission, including the `200,000` combined visible-grass triangle accounting across the boundary and every representation tier. Their optimization and final pass/fail approval belong to AI 537; native-4K timings are recorded separately.
- `GRASS_LAB_APPROVAL_AI362.json` lists no missing visual, functional, motion, determinism, or evidence item; reports scoped `status: "approved"`; and reports `performance.status: "deferred_to_ai537"`. It is not sufficient gameplay authorization by itself.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358 through AI 361 and consumes the finalized AI 360 contract unchanged plus `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md` and `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md`: AutoLOD version `2`, `3/8/25 m` thresholds, one-metre exact field units, complementary handoffs, one-card billboards, two-card middle patches, two-card accents, AI 358 shared materials, and zero worn-disc rendering.
- Supersedes AI 357 as the current visual/functional V2 authorization record; AI 357's completed prompt, screenshots, V1 spec, and measurements remain historical evidence.
- AI 537 may begin only after this prompt is DONE and
  `specs/grass/GRASS_LAB_APPROVAL_AI362.json` satisfies the complete scoped
  `grass-lab-approval-v2` schema, approval scope, exact deferred ownership,
  and no-gameplay fields required above.
- AI 363 may not begin on the AI 362 record alone; it also requires completed
  AI 537 and `specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json` with
  `schema: "grass-lab-performance-approval-v1"`,
  `approvalScope: "performance"`, `status: "approved"`, and
  `sourceVisualApproval.sha256` matching the SHA-256 of the exact UTF-8 file
  bytes of the current AI 362 approval JSON.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 362 grass-sequence checklist item with the validated material consumers and any shared-pipeline obligation discovered here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If validation changes a contract or dependency, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md`, AI 537, and AI 363 before completion.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record the new authorization state in the V2 approval files and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A consolidated before/after and per-tier cost table for every approval camera, motion path, lighting fixture, and quality preset. Report AI 359 boundary, near, billboard, middle-patch, accent, and combined visible triangles; logical draw calls by grass tier and total; total renderer draw calls; stationary/moving buffer updates; and measured CPU/GPU timing.
- Explicit average, maximum, delta, and measured pass/fail values against every default/high/worst-view budget. The AI 362 JSON approval record must reference the same measurements and label their ownership `deferred_to_ai537`; a failing row is retained as a failure.
- State the hardware, resolution, graphics settings, grass density/coverage, workload and camera route, warm-up, sample count, and statistic for every measurement set. Include frame time/FPS and relevant memory; mark unavailable metrics as `not measured` with a reason instead of using projections.
- A complete screenshot manifest with workspace-relative PNG paths under the prompt-specific ignored evidence directory, before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active tiers, triangle count, grass/total draw-call counts, and image-dimension verification.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- Representative final screenshots displayed inline in the completion response
  from multiple angles; links or a manifest alone do not satisfy the visual
  handoff.
- Every camera, height, lighting, boundary, tree, fallback, handoff, motion, and far comparison required above. List missing scoped visual/functional/motion/determinism evidence or a missing performance measurement as a failed gate; a measured performance-budget miss remains deferred and is not itself an AI 362 completion failure.

## Completion evidence

- `specs/grass/GRASS_LAB_APPROVAL_AI362.json` is valid `grass-lab-approval-v2` and reports scoped `status: "approved"`, `approvalScope: "visual_functional_motion_determinism"`, `performance.status: "deferred_to_ai537"`, `gameplayTouched: false`, and `authorization.status: "blocked_pending_ai537"`. Performance remains a measured failure (`performanceCostPass: false`, `performanceStillFailing: true`); this approval does not authorize gameplay.
- `tests/artifacts/screens/grass/ai362/capture_manifest.json` reports `pass: true`, `visualFunctionalPass: true`, `regressionGatePass: true`, `baselineReferencePass: true`, `deterministicRepeatsPass: true`, `uniqueDeterministicMotion: true`, `performanceStructuralPass: true`, and no missing or unexpected recipe IDs.
- The shared catalog/calibration loader remained authoritative. Billboard and middle tiers use one exact AI 358 `MID_CLUSTER` material path, localized accents retain the separate `ACCENT_CLUMP` path, and the far/near family remains `pbr.grass_low_cut_maintained_v2`; no loader, URL resolver, palette, or calibration fork was added.

### Visual and regression evidence

| Evidence | Final result |
| --- | --- |
| Native-4K captures | 114/114 lossless PNGs verified at `3840x2160`, drawing buffer `3840x2160`, pixel ratio `1`, with 114 unique paths |
| Capture roles | 83 static and 31 motion; 74 clean UI-free frames, 40 separate diagnostic-overlay frames, and 7 deterministic repeats |
| Required coverage | 16/16 cameras, 4/4 lighting fixtures, 5/5 motion paths, and 33/33 evidence recipe IDs; every missing list is empty |
| AI 361 matched baselines | 36/36 pass; luminance ratio `1.0012339045`–`1.0065815644` (average `1.0024076296`) and bright-pixel delta exactly `0` |
| Scoped regressions | 29/29 pass, including signed-distance orientation, source-loop/boundary identity, handoff provenance, exact coverage, material identity, deterministic motion, and low-quality fallback |
| Runtime safety | No runtime errors, zero geometry beyond cutoff, zero recurring stationary uploads, and `gameplayTouched: false` |

The complete 114-record screenshot table is the `captures` array in `tests/artifacts/screens/grass/ai362/capture_manifest.json`. It records every PNG path, before/after role, camera position/target/height and pose, lighting, exposure, quality, active tiers, AutoLOD state, signatures, instances, triangles, logical and renderer draws, buffer-update state, image dimensions, and exact AI 361 baseline mapping. It includes every required review-only, boundary, tree, fallback, handoff, motion, and repeat recipe.

Representative clean final views:

- `tests/artifacts/screens/grass/ai362/after_clean_view_grazing.png`
- `tests/artifacts/screens/grass/ai362/after_clean_view_oblique.png`
- `tests/artifacts/screens/grass/ai362/after_clean_view_top_down.png`
- `tests/artifacts/screens/grass/ai362/after_clean_view_bus.png`
- `tests/artifacts/screens/grass/ai362/after_clean_boundary_low_side.png`
- `tests/artifacts/screens/grass/ai362/after_clean_boundary_tree_substrate.png`

### Canonical `1920x1080` performance measurements

All five rows used Chrome 151/WebGL2 through ANGLE Vulkan SwiftShader on Windows x64 with an AMD Ryzen 5 9600X and 12 logical processors. They use arithmetic means, 120 warm-up frames with 119 stable frames, and 120 CPU/frame samples. GPU samples are `not measured` because `EXT_disjoint_timer_query_webgl2` was unavailable. Canonical coverage remained exact-polygon, with 64 ownership bins per eligible square metre and 3 fibers per represented root.

| ID / preset / route | Workload | Warm-up ms | CPU mean / p95 ms | Frame mean ms / FPS | Timing verdict |
| --- | --- | ---: | ---: | ---: | --- |
| `quality_low` / low / billboard-middle | stationary quality preset | 66,555.5 | 0.048333 / 0.1 | 537.953333 / 1.859 | deferred failure |
| `quality_default` / default / billboard-middle | stationary quality preset | 90,407.8 | 0.375000 / 0.7 | 734.296667 / 1.362 | deferred failure |
| `quality_high` / high / billboard-middle | stationary quality preset | 93,597.8 | 0.595000 / 0.8 | 797.141667 / 1.254 | deferred failure |
| `default_worst_view` / default / top-down | stationary worst view | 66,856.1 | 0.254167 / 0.4 | 563.470000 / 1.775 | deferred failure |
| `default_transition_overlap` / default / close-billboard | stationary transition overlap | 94,832.7 | 0.323333 / 0.5 | 785.195000 / 1.274 | deferred failure |

| ID | Triangles: boundary / near / billboard / middle / accent / combined | Logical draws: boundary / near / billboard / middle / accent / combined | Renderer draws |
| --- | --- | --- | ---: |
| `quality_low` | 95,219 / 0 / 0 / 0 / 0 / 95,219 | 2 / 0 / 0 / 0 / 0 / 2 | 13 |
| `quality_default` | 95,219 / 9,408 / 550 / 8,500 / 0 / 113,677 | 2 / 1 / 1 / 1 / 0 / 5 | 16 |
| `quality_high` | 95,219 / 19,968 / 1,240 / 16,832 / 0 / 133,259 | 2 / 1 / 1 / 1 / 0 / 5 | 16 |
| `default_worst_view` | 95,219 / 4,224 / 250 / 4,408 / 0 / 104,101 | 2 / 1 / 1 / 1 / 0 / 5 | 16 |
| `default_transition_overlap` | 95,219 / 8,640 / 554 / 8,508 / 0 / 112,921 | 2 / 1 / 1 / 1 / 0 / 5 | 16 |

Across the canonical rows, CPU mean averaged `0.3191666 ms`, peaked at `0.595 ms`, and retained `0.005 ms` headroom to the `0.60 ms` budget. Frame mean averaged `683.6113334 ms` (`1.5048 FPS`), with row ranges of `537.953333`–`797.141667 ms` and `1.254`–`1.859 FPS`. Structural maxima were 133,259 combined triangles (66,741 below 200,000), 5 combined grass draws (7 below 12), 2 boundary draws (at the ceiling), 16 renderer draws, zero geometry beyond cutoff, and zero recurring stationary uploads. Missing supported GPU timing and the SwiftShader whole-frame results keep performance failed and owned by AI 537. AI 361 supplied no comparable approved cost baseline, so the 36 visual/state before/after comparisons and these five fresh cost rows remain separate rather than fabricating a performance delta.

Informational native-4K timing was recorded at `3840x2160`, default daylight, billboard-middle: 120 warm-up frames in `299,902.2 ms`, 119 stable frames, and 120 samples. CPU mean/median/p95/max were `0.654167/0.6/1.1/1.3 ms`; frame mean/median/p95/max were `2451.933333/2426/2659.2/3242 ms`, or `0.408 FPS`. GPU timing was unsupported for the same extension reason and hardware acceleration was false. Host memory was 33,463,193,600 bytes; JS heap was 68,000,000 used / 139,000,000 total / 3,760,000,000 limit; renderer resources were 20 geometries and 21 textures. GPU allocation bytes were not measured because WebGL exposes no authoritative allocation.

Focused evaluator/contract tests pass 47/47, the AI 361/AI 362 core suite passes 129/129, the V2 staging-asset browser suite passes 5/5, and syntax checks pass 21/21.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai362/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_362_TESTS_4k_grass_lab_visual_validation_performance_and_reapproval_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
