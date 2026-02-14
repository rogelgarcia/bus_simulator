#Problem (DONE)

In Building Fabrication 2, bay repetition is currently exposed as a `Repeatable` boolean-like control, which is too limited. We need to capture an authoring preference about how the fill solver should behave for each bay: whether it should not repeat, prefer repeating, or prefer expanding width.

# Request

Replace the bay `Repeatable` control with a compact `Expand preference` combobox that supports three values and defaults appropriately.

Tasks:
- Replace `Repeatable`:
  - Change the label from `Repeatable` to `Expand preference`.
  - Replace the checkbox/toggle with a combobox/select containing:
    - `No Repeat`
    - `Prefer Repeat`
    - `Prefer Expand`
  - Default value for newly created bays: `Prefer Expand`.
- Behavior / model intent:
  - Persist the chosen expand preference in the building v2 model per bay.
  - Ensure this preference is available to the facade fill solver (engine-facing hint), without changing other bay properties.
- Specs update:
  - Update relevant specs under `specs/buildings/` to document the per-bay `expandPreference` (or equivalent) and how it is interpreted by the solver.

Constraints:
- Keep the UI compact (this is part of the bay editor panel).
- Do not introduce new solver modes beyond what’s needed to consume this preference.

## Quick verification
- In BF2 bay editor, `Repeatable` is replaced by `Expand preference` combobox with the 3 options.
- New bays default to `Prefer Expand`.
- The selection is saved in the building config and is visible to the engine/solver (no silent fallback).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_282_BUILDINGS_building_fabrication2_bay_expand_preference_combobox_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Replaced the bay `Repeatable` control with an `Expand preference` combobox (`No Repeat` / `Prefer Repeat` / `Prefer Expand`).
- Model + defaults: Added per-bay `expandPreference` (new bays default to `Prefer Expand`) and removed legacy `repeatable` when updating.
- Solver + specs: Updated the facade bays fill solver and building v2 specs to interpret `expandPreference` deterministically.
