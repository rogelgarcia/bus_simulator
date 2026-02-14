#Problem (DONE)

Legacy building facades place windows by filling a face with evenly spaced windows and optional “space columns” inserted at fixed intervals. The new facade format is bay-based and needs a deterministic way to express and solve patterns like “every X windows, insert a column”, while still handling arbitrary face lengths (including resizing) without a complex backtracking solver.

# Request

Add repeatable multi-bay groups + ranged local repetition (v1), and implement a deterministic facade “fill” solver that uses **center-out ordering** when distributing extra repeated items. Also add a legacy conversion path from the old “window spacing + space columns” face format into the new bay-based facade format.

Tasks:
- Facade layout format:
  - Support a repeatable **group** that spans multiple bays (e.g., `[windows, column]`) so the pattern carries when the building is resized.
  - Support **local repetition ranges** for an item inside a group (e.g., `windowsPerGroup: min..max`).
  - Add an explicit ordering mode for distributing extra repetitions: `centerOut`.
  - Keep topology invariants across layers (same bay ids/order/count per face after solving).
- Layout solving (v1 deterministic rules):
  - Use a no-preferences-first policy: “fill with least amount of bays” (no aesthetic tuning yet).
  - Solve in phases:
    1) Start from minimum repeat counts (group repeats and local min repeats).
    2) If the face still cannot be filled because the layout cannot reach the required length even at max widths, increase repeats using this priority:
       - First: add whole **group** repeats while allowed.
       - Second: if no more groups can repeat, increase local repeated items inside existing groups one-by-one until no more can fit.
         - When only some groups can receive an extra item, assign extras in **center-out** order across the face (deterministic tie-breaks for even counts).
    3) Once repeat counts are finalized, distribute remaining length by expanding **equally** across all bays that can grow (respecting max).
  - Ensure results are stable/deterministic for the same inputs (no jitter between runs).
- Legacy conversion (old → new):
  - Convert face-wide “windows with spacing” into a bay layout that preserves spacing when repeated:
    - Create a `windowBay` where `marginLeft = marginRight = 0.5 * legacySpacing` so adjacent repeats yield the full spacing and face edges keep half-spacing.
  - Convert “space columns every X windows” into a repeatable group:
    - Express as `[window repeated (min..max), column]` where the default range can represent the legacy interval (and allow later resizing to distribute extras).
  - Imported legacy buildings should match legacy placement for their original sizes and behave reasonably when face length changes (pattern carries, and no forced trailing column if not needed).
- Validation + debugging:
  - Surface clear warnings/errors when the solver cannot fit within constraints (no silent fallback).
  - Provide debug visibility for: resolved group repeat count, per-group local repeat counts, and which groups received extra items under `centerOut`.

## Quick verification
- With a simple facade pattern (windows + column every X windows):
  - Resizing the face length changes repeat counts predictably and symmetrically (center-out).
  - Spacing between windows matches the legacy spacing model (half-spacing at the ends).
  - No overlaps; constraints (min/max) are respected; failures produce warnings/errors.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_257_BUILDINGS_facade_repeat_groups_center_out_fill_solver_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Added `FacadeLayoutFillSolver` to support repeatable facade groups, local repeat ranges, deterministic center-out extra distribution, and equal-width remainder expansion.
- Integrated the solver into building fabrication generation (walls/roofs) and surfaced per-face solver debug + warnings through the fabrication UI state.
- Added a legacy conversion path in Building Fabrication catalog import to create bay-based facade patterns (half-spacing margins + optional space columns) and window definition defaults, plus core tests for determinism and conversion invariants.
