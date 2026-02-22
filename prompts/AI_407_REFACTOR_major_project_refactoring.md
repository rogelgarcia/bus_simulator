# Problem

`TerrainDebuggerView` and `TerrainDebuggerUI` are too large and multi-responsibility, making changes risky and slow.

# Request

Refactor Terrain Debugger architecture into smaller, focused modules while keeping behavior stable and removing legacy UI format paths.

## Requirements Checklist
- [x] Define non-negotiable invariants for feature parity (terrain rendering behavior, biome tiling diagnostics, flyover tools, grass controls, and existing hotkeys).
- [x] Introduce a clear UI-to-view action contract so `TerrainDebuggerUI` emits typed actions and `TerrainDebuggerView` handles them via explicit dispatch.
- [x] Extract scene and lifecycle responsibilities from `TerrainDebuggerView` into a focused scene controller module.
- [x] Extract biome tiling and flyover orchestration from `TerrainDebuggerView` into a focused biome tiling controller module.
- [x] Extract terrain material and shader synchronization from `TerrainDebuggerView` into a focused material controller module.
- [x] Extract terrain engine configuration and mask update plumbing from `TerrainDebuggerView` into a focused terrain engine adapter module.
- [x] Replace ad-hoc listener/timer cleanup with a disposer registry pattern and ensure deterministic teardown paths.
- [x] Split `TerrainDebuggerUI` into modular tab builders (terrain, biome transition, biome tiling, variation, grass, environment, visualization, output).
- [x] Add shared UI control builders for repeated slider/toggle/select patterns to reduce duplicated DOM wiring logic.
- [x] Remove the legacy terrain tab format/path and migrate any remaining controls into the modular tab structure (`_buildTerrainTabLegacy` must be removed).
- [x] Reduce oversized methods by enforcing manageable method boundaries in extracted modules.
- [x] Keep requirements traceable in this checklist and only mark items complete after explicit implementation passes.

## Refactor Phases
1. Foundation:
- Define invariants, action contract, and module boundaries.
2. View Decomposition:
- Extract scene, biome tiling, material sync, and terrain engine adapters from `TerrainDebuggerView`.
3. UI Decomposition:
- Modularize `TerrainDebuggerUI` tabs and shared controls.
- Remove legacy terrain tab format/path.
4. Lifecycle Hardening:
- Consolidate disposal/cleanup paths and remove orphan wiring.
5. Stabilization:
- Verify behavior parity and close remaining checklist gaps.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- Refactor plan drafted and phased.
- Legacy terrain UI format removal is now explicitly tracked.
- Implementation pass 1: Added parity invariants module, typed UI action contract, scene/biome/material/terrain-engine controller modules, and disposer registry lifecycle wiring.
- Implementation pass 1: `TerrainDebuggerUI` now emits typed actions via `dispatchAction`, and `TerrainDebuggerView` handles explicit action dispatch.
- Implementation pass 1: Extracted shared UI control builders into `ui/TerrainDebuggerUiControlBuilders.js`.
- Implementation pass 1: Removed legacy terrain tab path and related dead methods (`_buildTerrainTabLegacy`, `_syncGroundMaterialPicker`, `_openGroundMaterialPicker`).
- Implementation pass 2: Split `TerrainDebuggerUI` tab construction into dedicated builder modules under `view/ui/tab_builders/` and rewired UI setup through `_createTabBuilders()` delegates.
- Implementation pass 2: Restored variation layer helper methods (`_getLayers`, `_addLayer`, `_removeLayer`, `_renderVariationLayers`) on `TerrainDebuggerUI` to preserve dynamic variation-layer behavior after extraction.
- Verification: `node --check` passed on modified/new modules, `node --test tests/node/unit/disposer_registry.test.js tests/node/unit/terrain_debugger_ui_action_contract.test.js` passed, and `npm run -s test:headless -- tests/headless/e2e/harness_smoke.pwtest.js` passed.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested

## On `make final` without full completion
- If the user asks for `make final` while checklist items are still open, do not use `DONE` naming.
- Rename to regular mode naming (`AI_...`) and keep all checklist items.
