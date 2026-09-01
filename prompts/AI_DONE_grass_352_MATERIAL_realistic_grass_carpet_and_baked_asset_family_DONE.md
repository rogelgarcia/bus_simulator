DONE

> **Human visual validation: REJECTED (2026-08-31).** The user rejected the complete offline-first grass solution spanning AI 350–362 and AI 537 after reviewing the final renders. This prompt is historical implementation evidence only: its DONE state does not approve the visual result, authorize gameplay integration, or define an acceptable baseline for future grass work. Any replacement must start from a new visual direction and receive explicit human approval.

# Completed changes

- Registered `pbr.grass_low_cut_maintained_v1` at its documented `1.4 × 1.4 m` scale with explicit Grass004 CC0 provenance and a compatible forest-ground substrate.
- Added the deterministic Blender grass-material baker and generated separated far color/normal/AO/roughness/height/coverage maps plus one tightly framed eight-variant cluster atlas family and inspectable `.blend`.
- Extended the global catalog and `PbrTextureLoaderService` with catalog-driven auxiliary channels, clamped atlas sampling, trilinear mips, alpha-to-coverage policy, and no Grass Lab-local renderer loader.
- Added stable world-space macro variation and two-sample anti-tiling that changes material response without displacing or expanding the grass footprint.
- Added the dedicated Grass Lab Material fixture, source/matched/substrate comparison, atlas preview, daylight/overcast/grazing controls, diagnostics, and PBR availability startup ordering.
- Added provenance/spec documentation, downstream prompt reconciliation, dynamic AI 349 completion tracking, focused contract coverage, and 1280×720 acceptance screenshots.

# Problem

The current flat grass surface is too smooth, too uniformly green, and physically mis-scaled. The near geometry, mid-distance clusters, and far texture also need to share one visual source so their transitions do not reveal unrelated assets.

# Request

Create and validate the realistic low-cut grass carpet material and its matched baked asset family entirely in the canonical Grass Lab.

This is step 3 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Use the existing Grass004 PBR set as the initial reference/foundation unless a documented comparison in the lab demonstrates a superior licensed asset.
- Correct physical texture scale, reduce the overly saturated/smooth appearance, preserve useful roughness variation, and retain readable short-blade normal detail.
- Add stable macro/micro variation and anti-tiling behavior so large areas keep detail without showing an obvious repeating grid or swimming during camera movement.
- Define an explicit substrate material that remains visually compatible beneath and between the grass.
- From the profile and bake source created in the prior prompt, produce or update a matched asset family containing the far/top-down grass surface maps and the alpha-bearing oblique cluster atlas needed by later LOD work.
- Keep baked lighting out of base color while preserving separate normal, ambient-occlusion, roughness, height/coverage, and alpha information where applicable.
- Ensure card/coverage mip behavior remains stable at distance and does not introduce bright halos or rapid disappearance.
- Keep the cluster variants in one atlas/material path so later LODs do not multiply draw calls.
- Record source, license, physical dimensions, bake profile version, and deterministic generation inputs for every new or derived asset.
- Resolve all materials through the shared global PBR pipeline and calibration rules; do not add screen-local texture loading.

Acceptance outcomes:
- The lab shows a noticeably less artificial grass carpet under daylight, overcast, and grazing views.
- Physical scale is documented and consistent between surface maps and authored blades.
- Macro variation breaks repetition without changing the grass footprint.
- Far surface and cluster atlas share recognizable color, density, and dryness characteristics.

## Sequence dependency

- Requires completed `AI_DONE_grass_350_TOOLS_canonical_offline_grass_lab_and_baseline_DONE.md` and `AI_DONE_grass_351_MESHES_low_cut_grass_authoring_profile_and_bake_source_DONE.md`.
- Supplies material assets required by all later grass prompts.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` for every affected or newly discovered shared-pipeline item.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_352_MATERIAL_realistic_grass_carpet_and_baked_asset_family_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Post-completion sequence reconciliation

- This completed V1 material family remains historical. AI 358 supersedes it for downstream color matching, physical atlas dimensions, PBR response, and mip coverage; V1 screenshots do not authorize AI 363.
