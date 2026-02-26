# DONE

## Completed Changes
- Stepper/button-hold controls now update opening numeric inputs continuously while held.
- Added bottom opening height override control in BF2 bay opening editor.
- Added bottom opening vertical offset control relative to floor bottom.
- Added bottom opening height mode selector with `Fixed` and `Full` behavior.
- Added optional stacked top opening toggle above the bottom opening.
- Added top opening height override with width locked to the bottom opening width.
- Switched BF2 opening selection to shared window/door/garage catalog sources.
- Added door asset support in BF2 opening selection flow.
- Enabled optional stacked top opening on door placements.
- Added top opening frame-width override control.
- Added separate muntins toggles for bottom opening and top opening.
- Added `window_fixed` bay size mode where bay width is derived from opening width.
- Reworked opening picker UI to `Window`, `Door`, and `Garage` tabs and removed `Actions`.
- Enforced catalog-load-only behavior in BF2 (no in-panel creation/editing actions).
- Added opening repeat control for window openings with side-by-side placement.
- Enforced repeat defaults/rules: default `1`, supports `2` for windows, doors/garage forced to single.
- Preserved unrelated BF2 behavior and existing façade generation paths outside opening feature scope.
- Updated building specs for picker tabs, sizing/position controls, stacked top opening, repeat, and width-mode behavior.
