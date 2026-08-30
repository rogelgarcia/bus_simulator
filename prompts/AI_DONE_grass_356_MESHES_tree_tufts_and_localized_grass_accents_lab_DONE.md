# DONE

# Problem

Uniform maintained grass benefits from area patches, but trees, worn ground, and selected boundary irregularities still need localized tufts to hide intersections and add natural variation. The previous tuft task incorrectly treated tufts as the primary primitive for the whole field.

# Request

Add deterministic, highly bounded tuft and accent placement around tree bases and other explicitly eligible local features in the canonical Grass Lab.

This is step 7 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Reserve tufts for accent zones; do not replace the uniform carpet patch system with field-wide tuft placement.
- Add representative tree fixtures that use the same placement record shape expected from the city tree generator.
- Support a small worn/darker substrate area at the trunk and a bounded ring of slightly longer, drier, or less uniform grass accents around it.
- Start with approximately `3-6` small clusters or equivalent bounded detail per tree and an initial geometry target around `4-12` visible triangles per tree accent.
- Render compatible tree accents through one global instanced material/atlas path rather than one mesh or draw per tree.
- Drive placement from the grass coverage/accent contract so tufts never appear on roads, sidewalks, excluded substrate, or inside the trunk.
- Keep all placement, variation, and profile selection deterministic for a fixed tree placement and seed.
- Allow the same accent mechanism to support rare boundary or worn-area irregularities without making those accents a mandatory part of every grass edge.
- Expose accent counts and draw/triangle cost in the Grass Lab diagnostics.

Acceptance outcomes:
- Tree/ground intersections read naturally in close views.
- Main lawn remains a uniform carpet rather than a collection of obvious clumps.
- Accent cost remains bounded and batched as tree count grows.
- Repeated reloads produce the same tree accents.

## Sequence dependency

- Requires completed AI 350 through `AI_DONE_grass_355_MESHES_mid_distance_cluster_lod_and_texture_handoff_DONE.md` and its `GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md` contract.
- Query `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V1.md` for binary occupancy and accent eligibility; humidity, dryness, or soft biome weights must not expand tuft placement beyond that footprint.
- Consume the separate `localized_tufts` recipe from `LOW_CUT_GRASS_PROFILE_V1.md`; do not reinterpret the `area_patch` carpet recipe as field-wide tufts.
- Supplies the localized accent layer required by `AI_grass_357` and final gameplay import.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update affected dynamic AI files and record any unresolved tree-placement contract issue as a pending item rather than adding an alternate tuft system.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_356_MESHES_tree_tufts_and_localized_grass_accents_lab_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completion summary

- Added a pure deterministic localized-accent contract that consumes city-shaped tree records, the `localized_tufts` profile recipe, AI 354 binary coverage, and explicit optional worn-feature records.
- Added four coverage-bounded single-card clusters per tree by default, totaling eight grass triangles per visible tree and rejecting every root inside trunks or excluded substrate.
- Added one global atlas-backed instanced grass batch that shares AI 355's four-map PBR cluster material, automatic near-tier mask, hysteresis, opacity, culling, and no-shadow policy.
- Added one global instanced worn-substrate batch resolved as `pbr.forrest_ground_01` through the shared PBR pipeline, with one small darker disc per eligible tree.
- Reconciled Grass Lab tree fixtures with the city generator's `x/y/z/rotation/scaleVar/variant` record shape and added one explicitly eligible optional worn-area feature.
- Added a Tree accents Lab tab with bounded controls, deterministic tree/feature cameras, placement/cost/signature/rejection diagnostics, and contract-v6 snapshots.
- Added deterministic unit coverage for geometry bounds, reload stability, binary eligibility, trunk/sidewalk rejection, batching, fixture shape, and Lab-only gameplay isolation.
- Captured matching before/after tree-base comparisons under `tests/artifacts/screens/grass/ai356/` and documented the completed `LOCALIZED_GRASS_ACCENTS_V1.md` contract.
- Updated the offline sequence, downstream prompts, and active AI 349 texture-pipeline checklist while leaving the dynamic AI active.

## Post-completion sequence reconciliation

- Deterministic V1 tree/feature placement remains historical input. AI 359 replaces the opaque worn-disc behavior with a real substrate exclusion, and AI 361 reconciles accent rendering with the cohesive field before AI 363.
