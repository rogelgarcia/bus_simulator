DONE

> **Human visual validation: REJECTED (2026-08-31).** The user rejected the complete offline-first grass solution spanning AI 350–362 and AI 537 after reviewing the final renders. This prompt is historical implementation evidence only: its DONE state does not approve the visual result, authorize gameplay integration, or define an acceptable baseline for future grass work. Any replacement must start from a new visual direction and receive explicit human approval.

# Problem

Individual blades at field scale are too sparse to look like carpet and too expensive to manage independently. Uniform lawn also should not be represented as visibly separated tufts.

# Request

Implement the near-camera maintained-grass layer as deterministic, instanced carpet patches in the canonical Grass Lab.

This is step 4 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Make a small area patch, rather than a blade or tuft, the primary runtime unit for uniform maintained grass.
- Start with approximately `1 m` patches containing a bounded density of lightweight blades, with a default evaluation range around `32-64` simplified blades per square metre.
- Use the low-cut runtime profile and single-material blade path from prior prompts, with `pbr.grass_low_cut_maintained_v1` remaining visible beneath the near geometry.
- Keep the far grass surface visible beneath the geometry so sparse runtime blades add silhouette and depth instead of carrying the entire carpet appearance.
- Render the visible near field through a minimal number of instanced draws, with deterministic per-patch variation that avoids a visible repeated stamp.
- Maintain static instance data while the camera remains in the same patch cell; recycle only entering/leaving patch rows or equivalent bounded work when the camera crosses cell boundaries.
- Restore valid bounds and chunk/patch frustum culling; do not solve visibility by disabling culling globally.
- Do not cast grass shadows by default, and avoid transparent blending for true blade geometry.
- Provide a manual near-layer force/disable control for lab inspection without creating a second runtime path.
- Record visible instances, triangles, draw calls, and instance-buffer update frequency in the lab diagnostics.

Acceptance outcomes:
- The near view reads as a continuous short carpet rather than isolated blades or repeated tufts.
- Camera motion does not trigger a full-field matrix rebuild every frame.
- Default near grass remains within the sequence performance budget with one material path.
- No gameplay files or gameplay terrain behavior are changed.

## Sequence dependency

- Requires completed `AI_DONE_grass_350_TOOLS_canonical_offline_grass_lab_and_baseline_DONE.md`, completed `AI_DONE_grass_351_MESHES_low_cut_grass_authoring_profile_and_bake_source_DONE.md`, and completed `AI_DONE_grass_352_MATERIAL_realistic_grass_carpet_and_baked_asset_family_DONE.md`.
- Supplies the near tier required by `AI_grass_355`.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update any affected dynamic AI file and record newly discovered runtime-performance obligations as pending items.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_353_MESHES_near_camera_instanced_grass_carpet_patches_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completed changes

- Added deterministic one-metre camera-cell carpet patches with a default `48` one-triangle blades/m² derived from the maintained low-cut profile.
- Batched visible cells into shared-geometry, single-material instanced chunks with valid bounds, frustum culling, opaque geometry, and grass shadows disabled.
- Kept stationary camera cells upload-free and limited cell crossings to entering/leaving chunk rewrites with live cache-churn diagnostics.
- Replaced the Grass Lab's legacy sparse near field with the new near tier while preserving the old inspector controls as collapsed, dormant inputs.
- Added automatic, force-on, and disabled modes; patch/density/radius controls; a repeatable grazing camera; and sparse-versus-approved comparison presets.
- Extended GrassEngine and Lab snapshots with near patch/blade instances, triangles, logical draws, material paths, buffer updates, stationary frames, and render-safety state.
- Added deterministic layout/culling regression coverage, documented the v1 near-patch contract, reconciled downstream dependencies, and marked AI 353 complete in dynamic AI 349.
- Captured matched 1280×720 comparison screenshots for `4` versus `48` simplified blades/m² while keeping `pbr.grass_low_cut_maintained_v1` visible beneath both.

## Post-completion sequence reconciliation

- This completed V1 scattered near tier remains historical. AI 360 supersedes it for downstream cohesive carpet geometry and exact edge clipping; its `1280×720` evidence cannot authorize AI 363.
