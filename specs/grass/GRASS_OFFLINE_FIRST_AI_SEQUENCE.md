# Grass Offline-First AI Sequence

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
11. `AI_grass_360_MESHES_cohesive_near_mesh_carpet_and_exact_coverage_clipping.md`
12. `AI_grass_361_MESHES_billboard_mid_patch_auto_lod_and_accent_reconciliation.md`
13. `AI_grass_362_TESTS_4k_grass_lab_visual_validation_performance_and_reapproval.md`
14. `AI_grass_363_CITY_import_revalidated_grass_lab_system_into_gameplay.md`

Prompts 350-362 are offline/lab-only. Prompt 363 is the sole gameplay-integration phase.

## Corrective V2 review state

AI 350 through AI 357 remain completed V1 history. Later native-4K and zoomed visual review rejected that result as authorization for gameplay because the grass read as scattered bright objects, tier colors did not merge with the far surface, and the sidewalk/substrate transition was not adequately demonstrated.

The unimplemented gameplay prompt formerly numbered AI 358 was renumbered to AI 363 before implementation so the corrective work has an explicit execution order. AI 358 is complete: its replacement native-4K evidence passes after correcting the shared card material, split coverage contract, fixture parity, and pixel-aligned validation. AI 359 is complete: it corrects the physical footprint and substrate cut. AI 360 is next and builds the cohesive near mesh; AI 361 owns billboard/middle tiers, handoffs, and accent rendering; AI 362 performs native-4K reapproval; and AI 363 alone integrates the approved result into gameplay.

`specs/grass/GRASS_LAB_APPROVAL_AI357.json` and `GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` remain historical evidence but no longer authorize gameplay. AI 363 is blocked until AI 362 creates `specs/grass/GRASS_LAB_APPROVAL_AI362.json` with `status: "approved"`.

## Ownership boundaries for the corrective sequence

| Concern | Sole corrective owner | Downstream consumers |
|---|---|---|
| Canonical grass color/PBR response, physical atlas dimensions, bake assets, and mips | AI 358 | AI 359-363 |
| Polygon footprint, exposed substrate, canopy height, root/thatch cut, and tree substrate exclusion | AI 359 | AI 360-363 |
| Cohesive closest-camera mesh carpet and exact root clipping | AI 360 | AI 361-363 |
| Billboard and middle-patch representations, automatic handoffs, and accent rendering reconciliation | AI 361 | AI 362-363 |
| Native-4K evidence, performance/regression gate, and current approval record | AI 362 | AI 363 |
| Gameplay adapter | AI 363 | Gameplay only |

AI 362 may tune bounded preset values while validating, but it must return architectural defects to the owning AI instead of creating validation-only behavior. AI 363 must consume the approved V2 contracts without a gameplay-only fork.

The canonical AI 359 handoff is `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`. It separates each rendered physical source loop from its grass-onset loop, defines hard occupancy plus positive-on-grass signed distance and root clearance, exposes stable source/signature identities, retains the continuous substrate through sidewalk and tree holes, and limits the opaque cap plus batched physical edge to two logical draws excluding substrate. AI 360-363 must consume those semantics without rectangle, alpha, or material-blend fallbacks.

The corrective V2 runtime has a hard ceiling of `200,000` visible grass triangles at the `1920x1080` performance gate. Lower practical targets remain desirable, and draw-call, CPU/GPU, cutoff, and stationary-upload gates still apply independently. Historical V1 records retain their original `100,000`-triangle limit as historical evidence.

## Superseded active prompts

The following older pending prompts were removed after their requirements were incorporated into this sequence:

| Superseded prompt | Current owner |
|---|---|
| `AI_243_MESHES_smart_grass_lod_camera_angle_distance_adaptive.md` | Historical AI 355; corrective AI 361; final validation AI 362 |
| `AI_grass_326_CITY_ground_to_grass_control_maps_and_data_contract.md` | Historical AI 354; corrective AI 359 |
| `AI_grass_327_MESHES_low_cut_grass_mesh_authoring_and_runtime_profile_export.md` | Historical AI 351/352; corrective appearance AI 358 and near mesh AI 360 |
| `AI_grass_328_MESHES_tuft_based_grass_grouping_and_placement_system.md` | AI 360 owns the primary near carpet; AI 361 reconciles localized rendering while retaining AI 356 placement semantics |
| `AI_grass_329_MESHES_auto_lod_distance_angle_billboards_and_fade_to_texture.md` | Corrective AI 361 |
| `AI_grass_330_TOOLS_grass_debugger_auto_lod_camera_lighting_and_overlays.md` | Historical AI 350/357; corrective validation AI 362 |
| `AI_grass_331_TESTS_grass_quality_presets_performance_budget_and_regressions.md` | Historical AI 357; current approval AI 362; final gameplay checks AI 363 |

Completed prompts in `prompts/` remain preserved as implementation history. Only stale dependency wording and explicit post-completion sequence notes are reconciled; completed work is not silently reopened or deleted.

## Scope boundaries with remaining active AIs

- AI 336 and AI 337 own soft transitions between terrain/biome surface materials. They do not own the hard occupancy edge of a raised grass carpet.
- AI 338 owns general offline biome-mask guidance. Corrective AI 359 owns grass-specific physical coverage and may consume compatible biome data without depending on an unfinished biome workflow.
- AI 339 owns general multi-biome tiling guidance. AI 358 applied the relevant material outcomes through the shared V2 grass catalog family and Grass Lab consumers; later grass prompts must consume that contract rather than fork it.
- AI 340 owns Terrain Debugger transition diagnostics. AI 362 owns the final Grass Lab validation matrix.
- AI 341 owns general procedural-terrain art overrides. Grass V1 work remains historical under AI 354/356; corrective physical boundary and rendering ownership belongs to AI 359/361.
- AI 349 remains the dynamic global texture/catalog/calibration tracker. Every grass AI must use that pipeline and update its scoped checklist item before completion; it must not be deleted, renamed, completed as a whole, or replaced by a grass-local loader.

## Dynamic/checklist AI rule

When a sequence prompt completes or supersedes a task tracked by an existing dynamic/checklist AI, leave the dynamic AI file in place and mark only the affected item complete. Add newly discovered unresolved obligations as pending items. Do not mark unrelated unfinished work complete.

## Required completion evidence

Every active prompt from AI 358 through AI 363 must append a completion-evidence summary before it is marked DONE. The summary must include measured triangle counts and logical/total draw calls with before/after deltas and budget verdicts, plus a manifest of the prompt's required screenshots. All completion screenshots must be UI-free lossless PNGs captured natively from a real `3840x2160` drawing buffer at pixel ratio `1`; JPEG, browser-scaled, or upscaled images do not satisfy the gate. A prompt cannot be completed while a required cost measurement or 4K screenshot is missing.

Performance summaries must state hardware, resolution, graphics settings, grass density/coverage, workload and camera/route, warm-up, sample count, and statistic. They must include frame time/FPS and relevant memory alongside geometry, draw-call, and measured CPU/GPU costs; unavailable metrics must be labeled `not measured` with a reason rather than replaced by projections.

Generated screenshots, comparison images, and machine-readable capture manifests remain local under the prompt-specific `tests/artifacts/screens/grass/ai###/` directory and must never be staged or committed. Tracked completion summaries may reference those workspace-relative artifact paths.
