#Problem (DONE)

BF2 bay width authoring needs a clearer, more discoverable control that supports both fixed widths and min/max ranges (including an infinite max), with consistent validation rules.

# Request

Implement an improved Bay `Width` UI control in BF2 that supports fixed vs range sizing in a compact, readable layout.

Tasks:
- Width control layout:
  - Left side: label `Width`.
  - Right side: a selectable mode control with two options:
    - `Fixed` (use a circle icon)
    - `Range` (use a left/right arrow icon)
- Fixed mode:
  - Show a single numeric input for width.
- Range mode:
  - Show two numeric inputs: `Min` and `Max`.
  - Include a toggle to set `Max` to infinite (`∞`).
- Validation + defaults:
  - Minimum acceptable width: `0.1m` (hard clamp / validation for fixed and min in range).
  - Default minimum for newly created bays: `1.0m` (even though the minimum acceptable is 0.1m).
  - Ensure the UI communicates invalid values clearly (no silent fallbacks).
- Model/spec alignment:
  - Ensure the authored bay width schema matches the existing model intent (fixed vs range + optional infinite max).
  - Update relevant building v2 specs under `specs/buildings/` if this UI introduces new authored fields or clarifies existing ones.

## Quick verification
- In BF2, the bay width control shows `Width` + a fixed/range mode selector on the same row.
- Switching modes updates the inputs accordingly (single input vs min/max + infinite toggle).
- Values are clamped/validated to minimum `0.1m`, while new bays start with a default width/min of `1.0m`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_275_BUILDINGS_building_fabrication2_bay_width_control_fixed_or_range_ui_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Reworked the BF2 bay Width UI into a compact “Width” row with Fixed/Range toggle buttons (icon + label) and mode-specific inputs.
- Updated new bay defaults so range min starts at `1.0m` while enforcing a minimum acceptable width of `0.1m`.
- Updated Building v2 UI specs to document bay width validation + defaults.
