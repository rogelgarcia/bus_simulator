# Grass Offline-First AI Sequence

> **Human visual validation: REJECTED (2026-08-31).** This entire sequence is historical engineering evidence, not an approved visual baseline. The user rejected the final AI 350–362/AI 537 renders, AI 363 was cancelled and deleted without implementation, and no gameplay integration is authorized. See `GRASS_LAB_HUMAN_REJECTION.md`.

This document is the canonical execution order for the grass work. The complete grass system is authored, rendered, corrected, tuned, and approved in the dedicated Grass Lab before gameplay integration. Soccer-field grass is only a reference for cohesive carpet coverage, not a mandated style; profiles may use longer, uneven, and locally irregular blades over a shallow structural base.

## Required order

1. `AI_DONE_grass_350_TOOLS_canonical_offline_grass_lab_and_baseline_DONE.md`
2. `AI_DONE_grass_351_MESHES_low_cut_grass_authoring_profile_and_bake_source_DONE.md`
3. `AI_DONE_grass_352_MATERIAL_realistic_grass_carpet_and_baked_asset_family_DONE.md`
4. `AI_DONE_grass_353_MESHES_near_camera_instanced_grass_carpet_patches_DONE.md`
5. `AI_DONE_grass_354_CITY_hard_grass_coverage_substrate_and_sidewalk_edge_lab_DONE.md`
6. `AI_DONE_grass_355_MESHES_mid_distance_cluster_lod_and_texture_handoff_DONE.md`
7. `AI_DONE_grass_356_MESHES_tree_tufts_and_localized_grass_accents_lab_DONE.md`
8. `AI_DONE_grass_357_TESTS_grass_lab_quality_presets_diagnostics_and_regressions_DONE.md`
9. `AI_DONE_grass_358_MATERIAL_unified_grass_color_physically_scaled_atlases_and_mips_DONE.md`
10. `AI_DONE_grass_359_CITY_exact_substrate_grass_boundary_and_height_lab_correction_DONE.md`
11. `AI_DONE_grass_360_MESHES_cohesive_near_mesh_carpet_and_exact_coverage_clipping_DONE.md`
12. `AI_DONE_grass_361_MESHES_billboard_mid_patch_auto_lod_and_accent_reconciliation_DONE.md`
13. `AI_DONE_grass_362_TESTS_4k_grass_lab_visual_validation_performance_and_reapproval_DONE.md`
14. `AI_DONE_grass_537_REFACTOR_grass_lab_gpu_budget_optimization_and_approval_DONE.md`

Prompts 350-362 and AI 537 were offline/lab-only. The planned gameplay phase,
AI 363, was cancelled and its prompt deleted after human visual rejection.
Numeric ID order does not override this historical execution order.

## Human visual rejection

The final renders were reviewed by the user and rejected. Automated structural,
determinism, pixel-comparison, regression, and performance passes did not prove
acceptable visual quality. Every earlier approval claim below is preserved only
as a record of what the automation concluded at the time; none remains valid
for gameplay authorization or as a future visual baseline.

## Corrective V2 review state

AI 350 through AI 357 remain completed V1 history. Later native-4K and zoomed visual review rejected that result as authorization for gameplay because the grass read as scattered bright objects, tier colors did not merge with the far surface, and the sidewalk/substrate transition was not adequately demonstrated.

The unimplemented gameplay prompt formerly numbered AI 358 was renumbered to AI 363 before implementation so the corrective work had an explicit execution order. AI 358 through AI 362 and AI 537 completed their engineering scopes and automated evidence, but the final combined visual result was rejected by the user. AI 363 was cancelled and deleted; there is no downstream stage for this solution.

`GRASS_LAB_APPROVAL_AI357.json` and `GRASS_LAB_APPROVAL_AI362.json` remain historical machine-validation records and cannot authorize gameplay. The uncommitted AI 537 performance approval was removed after its source visual solution was rejected. `GRASS_LAB_HUMAN_REJECTION.md` is the current authoritative decision.

## Ownership boundaries for the corrective sequence

| Concern | Historical corrective owner | Current disposition |
|---|---|---|
| Canonical grass color/PBR response, physical atlas dimensions, bake assets, and mips | AI 358 | Human-rejected; historical reference only |
| Polygon footprint, exposed substrate, canopy height, root/thatch cut, and tree substrate exclusion | AI 359 | Human-rejected solution; coverage techniques may be studied |
| Cohesive closest-camera mesh carpet and exact root clipping | AI 360 | Human-rejected; do not reuse as an accepted visual baseline |
| Billboard and middle-patch representations, automatic handoffs, and accent rendering reconciliation | AI 361 | Human-rejected; do not integrate |
| Native-4K visual, functional, motion, and determinism approval | AI 362 | Machine record overridden by human rejection |
| Whole-scene GPU optimization and performance approval | AI 537 | Approval removed; tooling may be studied |
| Gameplay adapter | AI 363 | Cancelled; prompt deleted without implementation |

AI 362 may tune bounded evidence values while validating, but it must return
architectural defects to the owning AI instead of creating validation-only
behavior. Its scoped approval still requires every non-timing structural gate:
exact tier accounting, the `200,000` combined-triangle ceiling, the `12`
combined-draw ceiling, at most two boundary draws, zero cutoff geometry, and
zero recurring stationary uploads. Only CPU/GPU timing-budget verdicts are
deferred. AI 537 must preserve AI 362's scoped approval while optimizing the
whole Lab frame; a visual or functional contract change invalidates that
approval and returns to AI 362. Its performance record must bind the exact
current AI 362 approval SHA-256; a digest mismatch invalidates the performance
approval. AI 363 must consume both approved records and the V2 contracts
without a gameplay-only fork.

The canonical AI 359 handoff is `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`. It separates each rendered physical source loop from its grass-onset loop, defines hard occupancy plus positive-on-grass signed distance and root clearance, exposes stable source/signature identities, retains the continuous substrate through sidewalk and tree holes, and limits the opaque cap plus batched physical edge to two logical draws excluding substrate. AI 360, AI 361, AI 362, AI 537, and AI 363 must consume those semantics without rectangle, alpha, or material-blend fallbacks.

The canonical AI 360 handoff is `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md`. It defines deterministic one-metre ownership cells subdivided into area-complete root bins, three-fiber micro-clumps sampled through AI 359's exact root query, boundary-signature cache invalidation, absolute `0.040-0.075 m` visible tip elevations above the `0.0275 m` structural base, and one shared opaque zero-emissive material path. Forced-near remains bounded diagnostic evidence only. AI 361, AI 362, AI 537, and AI 363 may select, measure, optimize, or integrate this representation but may not replace its exact polygon clipping with whole-patch rectangles or sparse random placement.

The normative AI 361 handoffs are
`specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md` and
`specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md`. They define AutoLOD schema version
2 with `near`, `billboard`, `middle`, and `texture` weights at canonical
`3/8/25 m` effective thresholds; one shared exact-coverage one-metre field-unit
layout; complementary stable handoff masks; one-card billboard and two-card
middle representations; shared AI 358 V2 atlas materials; and explicit
two-card accents with no worn-substrate draw. AI 361 completed these contracts
only after its runtime, regression, structural-cost, and fresh final-code
native-4K gates passed: `84/84` focused unit/contract tests, `5/5` browser
cases, and all `60/60` required captures and visual/functional/motion checks.
The five measured CPU/GPU rows remain complete baseline evidence; their
overall performance verdict failed and is explicitly deferred through AI 362
to AI 537. Completion therefore does not omit a measurement, label a failure
as a pass, or weaken the unchanged performance gate.

The corrective V2 runtime has a hard ceiling of `200,000` visible grass triangles at the `1920x1080` performance gate. Lower practical targets remain desirable, and draw-call, CPU/GPU, cutoff, and stationary-upload gates still apply independently. AI 359's canonical boundary alone uses `95,219` triangles, so later approximately `50,000` targets are aspirational field-geometry guidance rather than a possible combined total for that fixture. AI 537 owns satisfying these unchanged performance gates after AI 362 freezes the visual/functional baseline. Historical V1 records retain their original `100,000`-triangle limit as historical evidence.

## Superseded active prompts

The following older pending prompts were removed after their requirements were incorporated into this sequence:

| Superseded prompt | Current owner |
|---|---|
| `AI_243_MESHES_smart_grass_lod_camera_angle_distance_adaptive.md` | Historical AI 355; corrective AI 361; visual validation AI 362; performance AI 537 |
| `AI_grass_326_CITY_ground_to_grass_control_maps_and_data_contract.md` | Historical AI 354; corrective AI 359 |
| `AI_grass_327_MESHES_low_cut_grass_mesh_authoring_and_runtime_profile_export.md` | Historical AI 351/352; corrective appearance AI 358 and near mesh AI 360 |
| `AI_grass_328_MESHES_tuft_based_grass_grouping_and_placement_system.md` | AI 360 owns the primary near carpet; AI 361 reconciles localized rendering while retaining AI 356 placement semantics |
| `AI_grass_329_MESHES_auto_lod_distance_angle_billboards_and_fade_to_texture.md` | Corrective AI 361 |
| `AI_grass_330_TOOLS_grass_debugger_auto_lod_camera_lighting_and_overlays.md` | Historical AI 350/357; corrective validation AI 362 |
| `AI_grass_331_TESTS_grass_quality_presets_performance_budget_and_regressions.md` | Historical AI 357; visual/functional approval AI 362; performance approval AI 537; final gameplay checks AI 363 |

Completed prompts in `prompts/` remain preserved as implementation history. Only stale dependency wording and explicit post-completion sequence notes are reconciled; completed work is not silently reopened or deleted.

## Scope boundaries with remaining active AIs

- AI 336 and AI 337 own soft transitions between terrain/biome surface materials. They do not own the hard occupancy edge of a raised grass carpet.
- AI 338 owns general offline biome-mask guidance. Corrective AI 359 owns grass-specific physical coverage and may consume compatible biome data without depending on an unfinished biome workflow.
- AI 339 owns general multi-biome tiling guidance. AI 358 applied the relevant material outcomes through the shared V2 grass catalog family and Grass Lab consumers; later grass prompts must consume that contract rather than fork it.
- AI 340 owns Terrain Debugger transition diagnostics. The completed Grass Lab validation/performance evidence is historical and human-rejected; AI 363 was cancelled and no gameplay-integration stage is active.
- AI 341 owns general procedural-terrain art overrides. Grass V1 work remains historical under AI 354/356; corrective physical boundary and rendering ownership belongs to AI 359/361.
- AI 349 remains the dynamic global texture/catalog/calibration tracker. Every grass AI must use that pipeline and update its scoped checklist item before completion; it must not be deleted, renamed, completed as a whole, or replaced by a grass-local loader.

## Dynamic/checklist AI rule

When a sequence prompt completes or supersedes a task tracked by an existing dynamic/checklist AI, leave the dynamic AI file in place and mark only the affected item complete. Add newly discovered unresolved obligations as pending items. Do not mark unrelated unfinished work complete.

## Required completion evidence

Historical corrective prompts AI 358 through AI 362 plus AI 537 retain their completion-evidence summaries. Those automated records did not satisfy human visual validation and cannot be reused as approval.

Performance summaries must state hardware, resolution, graphics settings, grass density/coverage, workload and camera/route, warm-up, sample count, and statistic. They must include frame time/FPS and relevant memory alongside geometry, draw-call, and measured CPU/GPU costs; unavailable metrics must be labeled `not measured` with a reason rather than replaced by projections.

Generated screenshots, comparison images, and machine-readable capture manifests remain local under the prompt-specific `tests/artifacts/screens/grass/ai###/` directory and must never be staged or committed. Tracked completion summaries may reference those workspace-relative artifact paths.
