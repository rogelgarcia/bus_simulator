# Problem

The V1 automatic LOD reduces a continuous turf surface to sparse crossed cards and isolated localized accents. Middle-distance grass therefore appears as individual highlighted pixels or tufts, and representation handoffs reveal rings, gaps, or a color change instead of simplifying one cohesive carpet.

# Request

Build the remaining cohesive offline hierarchy in the dedicated Grass Lab: close mesh, dense billboard coverage, cohesive middle patches, then texture-only turf. Reconcile localized tree accents with that hierarchy while preserving their deterministic placement inputs. This prompt owns tier selection and handoffs, not the underlying boundary or asset family.

This is step 12 of the offline-first grass sequence.

Tasks:
- Consume AI 358's physical asset/material family and shared zero-emissive `nearBladeAppearance`, AI 359's exact polygon coverage/root-eligibility sampler, and AI 360's cohesive near carpet without forking them.
- Treat AI 360's finalized near contract as immutable input: deterministic `1 m` ownership cells, `64` root bins per eligible square metre, exactly `3` fibers per represented root, and final per-root AI 359 exact-polygon postchecks. Preserve `coverageMode: exact_polygon`, `boundarySignature`, `placementSignature`, `candidateBins`, `eligibleBins`, `representedBins`, `unrepresentedEligibleBins`, `eligibleAreaSquareMeters`, `representedAreaSquareMeters`, `rejectedByKind`, and `exactPostcheckFailures` through the combined hierarchy diagnostics; default exact fixtures require `unrepresentedEligibleBins === 0` and `exactPostcheckFailures === 0`.
- Implement the canonical representation order `close mesh -> dense billboard coverage -> cohesive middle patches -> far texture`.
- Begin tuning from `0-3 m` close mesh, `3-8 m` billboard coverage, `8-25 m` middle patches, and texture-only beyond `25 m`; adjust only with documented visual and performance evidence.
- Ensure every eligible area in each active tier is represented until its handoff. Do not use one visible card every few metres, sparse whole-cell lotteries, or isolated tufts as the primary field representation.
- Make billboard and middle representations cover an area collectively. Their silhouettes, scale, orientation variation, and density must read as a low carpet rather than separate upright cards.
- Preserve the selected profile's blade-length and directional irregularity across simplified tiers. Longer grass is allowed, but it must remain cohesive and must not turn into isolated tall cards or highlighted tufts.
- Match every tier and localized accent to AI 358's far-surface appearance under daylight, overcast, golden-hour, and night lighting, with zero emissive contribution.
- Use AI 359's root eligibility at sufficient granularity that no tier crosses the physical grass cut and no whole-cell exclusion produces a visible moat.
- Preserve AI 359's signed-distance orientation, root clearance, source/onset identities, boundary signature, tree holes, opaque cap, and shared-substrate ownership. Rebuild affected tier placement when that signature changes; do not fall back to rectangle approximations or alpha-derived occupancy.
- Implement stable spatial handoffs with overlap and hysteresis. Remove representations coherently by sub-patch, blade, or coverage unit so transitions do not leave isolated remnants, empty rings, or grid patterns.
- Keep automatic distance and view-angle evaluation canonical. Manual tier forcing remains diagnostic and must never create geometry beyond the effective cutoff.
- Preserve AI 356's deterministic city-shaped tree and feature placement inputs, but reconcile accent rendering/materials with the corrected hierarchy. Consume AI 359's real substrate exclusion instead of rendering an opaque worn disc over live grass.
- Batch each representation globally or by bounded chunks, keep shadows disabled, use stable culling, and avoid recurring stationary uploads.
- Tune default quality toward `5-6` typical grass logical draws with a hard ceiling of `12` and approximately `50,000` visible field-hierarchy triangles where practical. Enforce the V2 hard ceiling of `200,000` as a combined visible-grass total across the AI 359 cap/edge boundary, AI 360 near carpet, billboard, middle, and localized-accent geometry; the recorded `95,219`-triangle AI 359 reference boundary must be included rather than hidden behind the field-only target.
- Add diagnostics for active tier, eligible and represented area, per-tier occupancy, instances, triangles, draws, transition overlap, color/luminance agreement, geometry beyond cutoff, culling, and buffer updates. Keep the finalized AI 360 exact-coverage diagnostics named above visible and report boundary, near, billboard, middle, accent, and combined triangle totals separately.
- Add deterministic forward, reverse, strafe, flyover, grazing, top-down, tree, physical-cut, cutoff, and reload regressions for both still and moving handoffs.
- Capture UI-free native `3840x2160` stills and lossless transition frames at close/billboard, billboard/middle, and middle/texture handoffs, plus tree accents, far turf, grazing, top-down, and bus-scale poses.
- Keep AI 358 asset rebaking, AI 359 boundary/substrate construction, AI 360 near-patch architecture, final whole-system approval, and gameplay unchanged.

Acceptance outcomes:
- The default field reads as one cohesive carpet from the camera through the far texture; it never looks like a flat surface sprinkled with bright objects.
- No eligible near, billboard, or middle occupancy bin is unintentionally empty because of sparse random tier placement.
- The near tier still reports `64` root bins per eligible square metre, `3` fibers per represented root, `coverageMode: exact_polygon`, matching AI 359/AI 360 boundary signatures, `unrepresentedEligibleBins === 0`, and `exactPostcheckFailures === 0` while using AI 358's shared material response.
- Tier identity is not apparent from color or luminance alone under any required lighting preset.
- Moving forward, backward, sideways, and through grazing views reveals no obvious ring, pop, halo, checkerboard, or isolated remnant at any handoff.
- Localized accents remain bounded to explicit features and no longer use an opaque substrate disc over grass.
- Sidewalk and tree roots are rejected through the same V2 polygon query, while the AI 359 cap/edge remains a separate maximum-two-draw boundary subsystem.
- No grass geometry crosses a hard exclusion or exists beyond the effective cutoff.
- Default views remain near `5-6` typical grass draws, never exceed `12`, and never exceed the V2 hard ceiling of `200,000` combined visible grass triangles including the AI 359 boundary and every field/accent tier.
- Low quality remains a coherent corrected texture, substrate, and physical-boundary fallback with field geometry disabled.
- Every required PNG is native `3840x2160`, UI-free, and accompanied by repeatable state metadata.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358, AI 359, and AI 360, including `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`, and the finalized `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md` contract with `64` root bins per eligible square metre, `3` fibers per represented root, exact AI 359 coverage diagnostics, and shared AI 358 material ownership.
- Creates `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md` and the mandatory `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md` rendering/substrate contract.
- Supplies the complete corrective lab runtime to AI 362 and AI 363.
- The V1 AI 355 handoff remains historical and is not the downstream approval contract.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 361 grass-sequence checklist item with the billboard, middle-patch, accent, loader/calibration, and consumer work completed here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If this prompt changes a contract, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and every downstream grass prompt that consumes it.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record corrections in V2 contracts and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A before/after and per-tier cost table for every representative fixture and quality preset. Report AI 359 boundary, near, billboard, middle-patch, accent, and combined visible grass triangles; per-tier and total grass logical draw calls; total renderer draw calls; and measured CPU/GPU timing when available.
- An explicit cost delta and budget verdict for default, high, worst-view, and transition-overlap states. Costs may not be replaced by patch/card/instance counts alone.
- For every comparison, state the hardware, resolution, graphics settings, grass density/coverage, workload and camera route, warm-up, sample count, and statistic. Include frame time/FPS and relevant memory alongside the required geometry, draw-call, and CPU/GPU measurements; mark unavailable metrics as `not measured` with a reason instead of using projections.
- A screenshot manifest with workspace-relative file paths under the prompt-specific ignored evidence directory, before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active tiers, triangle count, and grass/total draw-call counts.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- All close/billboard, billboard/middle, middle/texture, tree, far, grazing, top-down, bus-scale, and motion-transition comparisons required above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai361/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_361_MESHES_billboard_mid_patch_auto_lod_and_accent_reconciliation_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
