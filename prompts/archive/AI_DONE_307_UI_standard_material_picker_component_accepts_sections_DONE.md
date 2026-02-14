# DONE

## Summary
- Add shared standard material picker module under `src/graphics/gui/shared/material_picker/` (popup controller, row controller, thumbnail helpers).
- Migrate BF2 + Terrain Debugger to the shared picker APIs (sections-driven popup + reusable row).
- Remove duplicated BF1/BF2 thumbnail helper implementations (use shared helpers) and keep a back-compat re-export for the old row controller path.

#Problem

The project currently has multiple “material picker” implementations and duplicated helper logic across screens:
- BF2 builds a wall material picker using `PickerPopup` plus ad-hoc option construction and thumbnail helpers inside `BuildingFabrication2UI.js`.
- Terrain Debugger also uses `PickerPopup`, but builds its own ground material picker row and option list.
- BF1/legacy building fabrication has additional picker logic (`openMaterialPicker`, duplicated thumbnail helpers, etc.).

This leads to inconsistent UI/UX, duplicated code, and makes it harder to add new pickers (or update the design) across the project.

We want BF2’s picker experience to become the **standard**, and we want the standard picker to be **reusable** by any screen by passing explicit `sections` (so callers can decide which options to show, e.g., ground vs building walls).

# Request

Refactor the GUI so there is a single, reusable **Standard Material Picker** component that accepts `sections` and can be used both as:
- a picker widget/row in panels, and
- an overlay popup panel for selecting a material option.

Tasks:
- Create a shared material picker module:
  - Add a new reusable component under `src/graphics/gui/shared/` (folder name up to you, e.g. `shared/material_picker/`).
  - It must support:
    - A “row controller” (button + thumbnail + label) that can be embedded in any UI.
    - An overlay popup that shows a grid of selectable options.
  - The overlay popup MUST accept `sections` as input (caller-provided list of sections and options).
  - Keep the look and interaction consistent with BF2’s picker.
- Consolidate duplicated helpers:
  - Extract duplicated “set thumbnail to texture/color” helpers from BF1/BF2 into shared utilities.
  - Avoid having separate implementations in `BuildingFabricationUI.js` and `BuildingFabrication2UI.js`.
- Migrate call sites to use the standard picker:
  - Update BF2 to use the new shared material picker component (no behavior regressions).
  - Update Terrain Debugger’s ground material picker to use the same component and pass its own `sections` (ground options only).
  - If feasible, migrate BF1/legacy building fabrication pickers (`openMaterialPicker`) to the standard component, or provide a compatibility wrapper that delegates to the new picker.
- API shape (required):
  - The standard picker overlay API must be section-driven:
    - `open({ title, sections, selectedId, onSelect })`
    - where `sections = [{ label, options, allowEmpty? }]`
    - and `options = [{ id, label, kind: 'texture'|'color', previewUrl?, hex?, disabled? }]`
  - The row widget/controller must not hardcode the option list; it is purely a button/label/thumbnail view.
- Scope/constraints:
  - Do not change the actual material catalogs or ids.
  - Keep styling consistent and avoid large CSS rewrites; reuse existing picker styles where possible.

## Proposal (optional implementation ideas)
- Create:
  - `shared/material_picker/MaterialPickerPopupController.js` as a thin wrapper over `PickerPopup` (adds convenience around `sections` and selection).
  - `shared/material_picker/MaterialPickerRowController.js` (move/alias existing `createMaterialPickerRowController`).
  - `shared/material_picker/materialThumb.js` for `setMaterialThumbToTexture/setMaterialThumbToColor`.
- Keep backward compatibility by re-exporting the old controller from its old path or by adding a small shim to avoid breaking imports.

## Quick verification
- BF2 wall material picker still works (same options, same overlay UI, same selection behavior).
- Terrain Debugger ground material picker uses the same picker overlay and row widget and still works.
- No duplicated thumbnail helper logic remains in BF1/BF2 UI files (it lives in the shared module).
- Any new screen can open a material picker by passing `sections` without needing to duplicate UI code.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_307_UI_standard_material_picker_component_accepts_sections_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
