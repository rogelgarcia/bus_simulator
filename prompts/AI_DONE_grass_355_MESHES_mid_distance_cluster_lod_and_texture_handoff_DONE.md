# DONE

# Problem

The existing grass prototypes either keep geometry for hundreds of metres or require manually tuned LOD behavior. That is excessive for a secondary visual feature and does not guarantee a coherent handoff between near blades, medium clusters, and the far surface.

# Request

Implement the complete automatic Grass Lab LOD path from near carpet patches to baked clusters and then texture-only ground.

This is step 6 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Use the near carpet patch from the prior phase as the highest runtime detail tier.
- Add a mid-distance tier built from tightly cropped variants in the shared baked cluster atlas, with a starting target of one or two crossed cards per patch and one shared material.
- Consume `cluster_atlas.png`, `cluster_normal_gl.png`, `cluster_roughness.png`, and `cluster_ao.png` from `pbr.grass_low_cut_maintained_v1` through the shared PBR payload's auxiliary textures; keep its `0.35` alpha cutoff, alpha-to-coverage, clamped atlas sampling, and trilinear mip contract.
- Hand off to texture-only grass at a deliberately short distance appropriate for a bus simulator, initially evaluating near detail around `0-8/10 m`, cluster detail around `8/10-25/35 m`, and no grass geometry beyond that range.
- Use camera distance and view angle together to adjust effective tier ranges, without evaluating LOD independently for every blade.
- Add stable hysteresis and masked/dithered transition behavior so slow camera movement does not produce popping, flicker, or broad transparent overdraw.
- Keep manual tier forcing as an explicit diagnostic override while automatic behavior remains the canonical path.
- Keep normal, color, density, and dryness continuity between the surface, near patches, and clusters.
- Target one material/draw path per active geometry tier and preserve valid culling bounds.
- Avoid restoring the previous `120/260/340 m` geometry ranges unless measured evidence in the lab demonstrates a visual need within budget.
- Report active tier, effective distance/angle bias, instances, triangles, draw calls, and transition state through the existing lab diagnostics.

Acceptance outcomes:
- Near, medium, and texture-only representations form one visually coherent grass carpet.
- Grazing and top-down camera paths do not expose abrupt rings or rapid thrashing.
- The far field has no grass geometry after the configured cutoff.
- Automatic LOD stays lightweight and gameplay remains untouched.

## Sequence dependency

- Requires completed AI 350 through `AI_DONE_grass_353_MESHES_near_camera_instanced_grass_carpet_patches_DONE.md` plus `AI_DONE_grass_354_CITY_hard_grass_coverage_substrate_and_sidewalk_edge_lab_DONE.md` and its `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V1.md` contract.
- Tier transitions may dither geometry inside occupied grass, but must preserve AI 354's binary footprint, physical edge, and independent substrate channel.
- Supplies the complete field LOD path required by `AI_grass_357` and final integration.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update any affected dynamic AI file and record unresolved LOD or asset-pipeline follow-ups there rather than creating another competing Smart LOD prompt.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_355_MESHES_mid_distance_cluster_lod_and_texture_handoff_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completion summary

- Added one patch-level automatic LOD contract using ground distance, view angle, stable masked transitions, hysteresis, bounded manual forcing, and a short texture-only cutoff.
- Integrated the AI 353 near carpet as the highest tier and kept instance-buffer updates camera-cell and angle-bucket stable.
- Added one culled, shadow-free, atlas-backed mid-cluster instanced batch with one shared opaque PBR material and deterministic two-card patches.
- Consumed all four canonical cluster atlas maps from `pbr.grass_low_cut_maintained_v1` through `PbrTextureLoaderService` with the approved `0.35` cutoff, alpha-to-coverage, clamp, mip, and filtering policy.
- Reconciled the Grass Lab controls and diagnostics around automatic near, cluster, and texture representations plus repeatable grazing, top-down, and cutoff cameras.
- Preserved AI 354 hard coverage and expanded exclusions for complete near patches and rotated cluster cards without changing gameplay.
- Added focused deterministic tests, contract-v5 snapshot coverage, live WebGL verification, and the `GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md` handoff specification.
- Updated the offline sequence, downstream prompts, and active AI 349 texture-pipeline checklist while leaving the dynamic AI active.

## Post-completion sequence reconciliation

- This completed V1 sparse cluster handoff remains historical. AI 361 owns the current billboard/middle-patch hierarchy, automatic handoffs, and cutoff contract required for V2 approval.
