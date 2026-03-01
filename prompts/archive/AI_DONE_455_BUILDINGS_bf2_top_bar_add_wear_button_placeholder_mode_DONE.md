DONE

# Problem

Building Fabrication 2 top mode navigation needs an additional mode entry for future wear workflow expansion.

# Request

Add a new `Wear` button in BF2 top mode controls as a placeholder mode with no functional panel/content yet.

Tasks:
- In Building Fabrication 2 top mode buttons, add `Wear` to the right of `Decoration`.
- Keep existing `Building` and `Decoration` behavior unchanged.
- `Wear` mode should be present as selectable UI but remain empty/placeholder for now (no additional implementation logic required beyond stable mode presence).
- Ensure layout/alignment of top mode buttons remains clean and consistent.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_455_BUILDINGS_bf2_top_bar_add_wear_button_placeholder_mode_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_455_BUILDINGS_bf2_top_bar_add_wear_button_placeholder_mode_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Changes
- Added a new `Wear` editor-mode button to Building Fabrication 2 top mode controls to the right of `Decoration`.
- Extended BF2 editor-mode normalization/state handling to preserve `Wear` as a stable selectable mode without changing existing `Building` or `Decoration` behavior.
- Added a dedicated empty wear placeholder panel and mode-based right-panel visibility routing for a clean no-content `Wear` workflow.
- Updated top mode button layout styling to keep alignment consistent with three mode buttons.
- Updated the BF2 UI specification to document the new `Wear` placeholder mode semantics.
