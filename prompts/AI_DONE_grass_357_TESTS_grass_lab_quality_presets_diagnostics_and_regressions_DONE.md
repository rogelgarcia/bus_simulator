# DONE

# Problem

Grass quality, LOD stability, boundary appearance, and cost can drift without repeatable camera/lighting reviews, explicit quality presets, and automated regressions. The isolated lab must prove the system before gameplay is allowed to consume it.

# Request

Complete the Grass Lab validation workflow, tune quality presets, and add deterministic visual/performance regression coverage for the full offline grass system.

This is step 8 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Make automatic LOD the default lab workflow while retaining explicit manual tier forcing for diagnostics.
- Provide repeatable camera presets covering the existing `0.5, 1, 1.5, 2, 3, and 5 m` inspection heights plus a representative gameplay-style bus camera.
- Provide grazing, medium, top-down, stationary, and moving/flyover paths that exercise every LOD handoff.
- Provide deterministic daylight, overcast, golden-hour, and night/street-lit lighting reviews.
- Display active LOD, effective distance/angle bias, per-tier instances and triangles, grass-specific draw calls, CPU update time, GPU time when supported, and instance-buffer update frequency.
- Define low/default/high quality presets with explicit differences in near radius, cluster radius, density, accents, and far cutoff; lower presets must fail gracefully to texture and boundary geometry.
- Tune the default preset toward these initial budgets at `1080p`: average grass GPU time `<= 1.5 ms`, average grass CPU update `<= 0.6 ms`, typical grass-specific draws `4-6`, hard draw ceiling `12` during transitions, and typical visible grass geometry `<= 100K` triangles.
- Add repeatable regression coverage for near-carpet readability, physical height, hard substrate boundary, straight and corner sidewalk cuts, tree accents, top-down behavior, grazing behavior, transition continuity, deterministic reloads, and camera-motion stability.
- Add a stress scenario and documented baseline that can reveal draw-call, triangle, overdraw, buffer-upload, or timing regressions without making one GPU model the universal pass/fail authority.
- Require an explicit lab approval record before the gameplay integration prompt begins.

Acceptance outcomes:
- The default preset meets the documented budget on the project baseline environment or records a justified revised budget before approval.
- Automated checks catch obvious LOD popping, missing grass edges, non-determinism, and major cost regressions.
- Low quality preserves the substrate/grass boundary and far surface even when most grass geometry is disabled.
- Gameplay is still untouched when the lab is approved.

## Sequence dependency

- Requires completed AI 350 through `AI_DONE_grass_356_MESHES_tree_tufts_and_localized_grass_accents_lab_DONE.md`, including `GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md` and `LOCALIZED_GRASS_ACCENTS_V1.md`.
- Preserve the deterministic hard-coverage reference metrics and screenshot cameras from `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V1.md` while validating later LOD and accent tiers.
- Completed and recorded the historical V1 approval before the corrective sequence; current gameplay authorization requires AI 362.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update all affected dynamic AI files with the measured baseline and remaining pending obligations.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_357_TESTS_grass_lab_quality_presets_diagnostics_and_regressions_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completed changes

- Added one automatic-LOD-first Validation tab with exact-height, handoff, top-down, far, bus, stationary, and flyover reviews.
- Added low/default/high quality presets with explicit ranges, density, accents, cutoff, and a texture/boundary-only low fallback.
- Added daylight, overcast, golden-hour, and night/street-lit lighting reviews plus rolling per-tier, timing, draw, triangle, and buffer-upload diagnostics.
- Tuned near-carpet batching to keep the default approval camera at five logical grass draws without changing grass placement or density.
- Added deterministic budget/approval contracts, focused Node and browser regression coverage, a high-preset stress scenario, and explicit checked approval evidence.
- Captured the multi-height and multi-pose approval set under `tests/artifacts/screens/grass/ai357/` and left gameplay unchanged.
- Updated the dynamic AI 349 tracker and the then-current gameplay dependency with the V1 validation contract and record; the reconciliation below supersedes that authorization.

## Post-completion sequence reconciliation

- This completed V1 validation workflow and its measurements remain historical evidence.
- Later native-4K and zoomed visual review rejected the V1 result as gameplay authorization; `GRASS_LAB_APPROVAL_AI357.json` no longer unblocks integration.
- Corrective AI 358 through AI 361 and an approved AI 362 V2 record are mandatory before the gameplay adapter in AI 363 may begin.
