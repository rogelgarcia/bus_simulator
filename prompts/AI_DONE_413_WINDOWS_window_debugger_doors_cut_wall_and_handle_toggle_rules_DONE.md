DONE

# Problem

Door creation in Window Debugger does not cut the wall opening as required, and door handle behavior is missing and needs rule-driven placement based on door panel divisions.

# Request

Update Window Debugger door behavior so doors always cut the wall, add a frame-tab handle toggle, and generate simple cylinder handles with deterministic placement rules driven by vertical muntin/panel layout.

Tasks:
- Ensure creating a door in Window Debugger cuts the wall opening (same expected cut behavior as windows, but for door geometry).
- In the Frame tab, add a toggle named `Add handles` for doors.
- When `Add handles` is enabled, generate handle geometry as simple cylinders:
  - diameter = `0.05m` (5 cm)
  - material inherits from frame material
  - use low-poly hex cylinders (6 sides) for the main handle and all handle subparts
  - add two extra horizontal connector cylinders that connect the main handle cylinder to the door surface (glass/wall side)
- Use vertical muntin-driven panel layout to place handles:
  - `0` vertical muntins (single panel): place one handle at `1.0m` height on the right side.
  - `1` vertical muntin (two panels): place two handles, one on the right side of the left panel and one on the left side of the right panel.
  - `2+` vertical muntins (three panels and beyond): place only two handles on the center-most panels.
- For odd panel counts in the `2+` vertical muntin case, pick a valid center-area panel pairing consistently (implementation may choose either valid center option).
- Ensure handle placement updates correctly when muntin count/layout changes.
- Ensure disabling `Add handles` removes/hides generated handles with no leftover geometry artifacts.
- Preserve existing non-door window behavior and avoid regressions in frame/muntin rendering.
- Update relevant specs under `specs/windows/` and/or `specs/buildings/` to document door wall-cut and handle placement rules.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_413_WINDOWS_window_debugger_doors_cut_wall_and_handle_toggle_rules_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_413_WINDOWS_window_debugger_doors_cut_wall_and_handle_toggle_rules_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary
- Fixed Window Debugger wall-hole bounds checks so base-aligned doors correctly cut the wall opening.
- Added `frame.addHandles` to window mesh settings/defaults/sanitization and covered it with unit tests.
- Added a door-only `Add handles` toggle in the Frame tab and synced visibility/enablement with asset mode.
- Added procedural door handle geometry generation (0.05m hex cylinders + two horizontal connectors) with deterministic muntin/panel-driven placement rules.
- Integrated handle geometry into window mesh generation/cache/disposal using frame material and frame layer instancing.
- Updated window feature specs to document door wall-cut validity at wall base and the new door handle rules/placement behavior.
