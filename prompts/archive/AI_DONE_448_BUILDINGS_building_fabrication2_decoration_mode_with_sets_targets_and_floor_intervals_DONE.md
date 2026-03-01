# DONE

# Problem

Building Fabrication 2 currently focuses on building authoring only. It needs a dedicated decoration workflow so users can target layers/bays and apply multiple wall decorations with placement controls.

# Request

Add a new Decoration mode to Building Fabrication 2 with decoration sets, target selection, and per-floor interval application controls.

Tasks:
- At the top of BF2, add two mode buttons:
  - `Building` (current behavior as-is)
  - `Decoration` (new workflow)
- In `Decoration` mode, add support for creating multiple `Decoration Set` entries.
- Each decoration set must define its target in this order:
  - target `Layer`
  - target `Bays`
- Within a decoration set, allow adding multiple decorations.
- Clicking add decoration creates a decoration group/editor block (similar to a floor layer card) with tabs and controls aligned to the wall decoration debugger model (for example type, positioning, etc.).
- Support decoration positioning along wall length.
- For floor-layer application, add controls to apply decorations by interval:
  - every `X` floors
  - `starting floor`
  - `ending floor`
  - presets: `First`, `Last`, `All`, `Every 2`
- Keep Building mode behavior stable and avoid regressions to current BF2 building authoring.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_448_BUILDINGS_building_fabrication2_decoration_mode_with_sets_targets_and_floor_intervals_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_448_BUILDINGS_building_fabrication2_decoration_mode_with_sets_targets_and_floor_intervals_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added BF2 right-panel editor modes (`Building` / `Decoration`) with stable Building-mode behavior.
- Added Decoration mode UI with multi-set authoring, ordered target selection (`Layer` then `Bays`), and per-set add/remove actions.
- Added per-set floor interval controls with raw fields (`Every`, `Start`, `End`) and quick presets (`First`, `Last`, `All`, `Every 2`).
- Added per-decoration tabbed editor blocks (`Type`, `Placement`, `Configuration`, `Material`) mapped to wall-decorator catalog properties/presets and wall-length span (`Start U` / `End U`).
- Added BF2 view-side decoration state model/callback wiring with sanitization against available layers/bays.
- Added export persistence for `wallDecorations` in `BuildingConfigExport` serialization/deserialization flow.
- Added BF2 UI/View regression tests in `tests/core.test.js` covering editor mode switching and decoration-set state updates.
- Updated `specs/buildings/BUILDING_2_SPEC_ui.md` with Decoration mode workflow requirements.
