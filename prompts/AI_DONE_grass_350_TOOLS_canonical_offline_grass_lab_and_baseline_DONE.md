# DONE — AI 350 canonical offline Grass Lab and baseline

> **Human visual validation: REJECTED (2026-08-31).** The user rejected the complete offline-first grass solution spanning AI 350–362 and AI 537 after reviewing the final renders. This prompt is historical implementation evidence only: its DONE state does not approve the visual result, authorize gameplay integration, or define an acceptable baseline for future grass work. Any replacement must start from a new visual direction and receive explicit human approval.

# Problem

Grass work is split between a reusable grass engine, Terrain Debugger integration, and a newer Grass Debugger implementation. Continuing in multiple screens or render paths would make visual iteration and later gameplay integration unreliable.

# Request

Establish one canonical, deterministic, offline Grass Lab by reusing the existing dedicated Grass Debugger screen, and make it the only screen used to develop and approve the grass system before gameplay integration.

This is step 1 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Reuse the existing dedicated Grass Debugger screen unless repository inspection proves it cannot support the work; do not create a third grass screen or another independent grass renderer.
- Reconcile the reusable grass engine and the newer debugger implementation so the lab exercises the same canonical runtime modules and data contracts intended for eventual gameplay use.
- Retire, isolate, or clearly label superseded experimental rendering paths after their useful behavior has been preserved.
- Provide deterministic lab fixtures for maintained grass, visible substrate, a straight sidewalk boundary, corner/cut boundaries, road exclusion, and representative tree placements.
- Provide a repeatable reset state and seed so screenshots and measurements can be compared between implementations.
- Display a minimal baseline of grass-specific instance counts, triangles, draw calls, and CPU/GPU timing when those measurements are available.
- Record the ownership boundary between the Grass Lab, reusable grass runtime, terrain/biome systems, and the future gameplay adapter.
- Use the existing global PBR material resolver/loader; do not introduce another texture-loading or calibration path.

Acceptance outcomes:
- One dedicated URL/screen is the documented entry point for all remaining offline grass prompts.
- The lab contains the boundary and tree fixtures needed by later prompts.
- The lab is deterministic and exposes a recorded pre-feature performance baseline.
- Gameplay rendering and gameplay terrain behavior are unchanged.

## Sequence dependency

- No grass-sequence prerequisite.
- Must complete before the later grass sequence; the current canonical range is AI 351 through AI 363.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update any affected dynamic AI file, especially `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md`; add a pending follow-up there if this work discovers an unresolved shared-pipeline obligation.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_350_TOOLS_canonical_offline_grass_lab_and_baseline_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completion summary

- Made `debug_tools/grass_debug.html` the single registered Grass Lab and converted the former LOD URL into a legacy redirect.
- Wired the lab to the reusable `GrassEngine` and isolated the superseded individual-blade and Terrain Debugger grass render paths.
- Added deterministic road, sidewalk-corner, exclusion, substrate, bus-anchor, and instanced tree fixtures with a canonical reset seed.
- Added live grass/frame diagnostics, structured baseline capture, and a recorded AI 350 reference measurement.
- Documented ownership and sequence boundaries, kept PBR resolution on the global pipeline, added contract regression tests, and updated dynamic AI 349.

## Post-completion sequence reconciliation

- This completed V1 baseline remains historical. Later visual review inserted corrective AI 358 through AI 362 and moved the still-unimplemented gameplay adapter to AI 363.
