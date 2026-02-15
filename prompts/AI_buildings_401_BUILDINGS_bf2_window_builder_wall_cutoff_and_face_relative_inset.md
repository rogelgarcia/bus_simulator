#Problem
BF2 window placement has two regressions in the window builder that affect geometry correctness:

1. The wall is not being cut off at the window opening, so wall geometry overlaps window parts.
2. Inset values are being applied incorrectly: faces A and C use the same absolute delta even though they should be adjusted relative to each face orientation/position.

# Request
Make BF2 window fabrication/building behavior correctly respect window geometry boundaries and face-specific inset logic so inserted windows and edited windows match expected fabrication results.

Tasks:
- Ensure the BF2 window builder always creates a wall opening cutout where the window is placed so wall geometry does not overdraw on top of window parts.
- Preserve that wall cutout behavior across insert/edit flows and existing window variants.
- Compute window inset per face context (for example face C vs face A) so inset is adjusted relative to that face, not applied as a shared absolute delta.
- Keep default BF2 behavior unchanged except for correcting the cutout and face-relative inset logic.
- Confirm the window fabricator and popup preview reflect the corrected geometry and option values together consistently.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
