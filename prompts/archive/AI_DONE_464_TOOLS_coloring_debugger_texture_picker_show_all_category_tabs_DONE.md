# DONE

In Coloring Debugger, the texture picker category tabs are currently limited and do not expose the full material taxonomy needed for testing.

# Request

Update the Coloring Debugger texture picker to support tabbed category navigation with all categories visible.

Tasks:
- Keep the texture picker category tabs UI pattern.
- Populate tabs with all available material categories (no reduced/filtered subset for this screen).
- Ensure category tab switching works correctly and updates picker entries accordingly.
- Keep behavior consistent with existing material picker interaction patterns.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_464_TOOLS_coloring_debugger_texture_picker_show_all_category_tabs_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_464_TOOLS_coloring_debugger_texture_picker_show_all_category_tabs_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Updated Coloring Debugger material picker wiring to use full PBR class sections, enabling tabbed category navigation across all available material categories.
- Kept the existing picker interaction model intact (same open/select flow) while ensuring tab switches correctly filter entries by selected category.
