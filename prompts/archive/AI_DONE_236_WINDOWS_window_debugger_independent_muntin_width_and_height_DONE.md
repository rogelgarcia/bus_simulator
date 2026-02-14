#Problem (DONE)

Muntin sizing is currently too limited: a single “width” appears to govern both vertical muntin thickness and horizontal bar thickness. We need independent control for vertical and horizontal muntin thickness.

# Request

Add independent muntin thickness controls in the Window Mesh Debugger: one for vertical muntins (columns) and one for horizontal muntins (rows).

Tasks:
- Replace/extend the current single muntin width control with:
  - Vertical muntin width (columns)
  - Horizontal muntin height/thickness (rows)
- Ensure the new controls update live and behave predictably for different row/column counts.
- Ensure defaults preserve current behavior (e.g., initialize both thickness values from the old single value).
- Ensure the controls interact correctly with:
  - Muntin inset and depth
  - Arch behavior rules (if applicable)
  - Bevel settings (if applicable)

Nice to have:
- Add a small “link thickness” toggle to keep both thickness values in sync when desired.

## Quick verification
- Set vertical thickness high and horizontal thickness low:
  - Vertical bars are visibly thicker than horizontal bars.
- Increase row/col counts:
  - Spacing remains sensible and no geometry artifacts appear.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_236_WINDOWS_window_debugger_independent_muntin_width_and_height_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Split muntin thickness into independent `verticalWidth` and `horizontalWidth` settings (legacy `width` still supported as an input alias).
- Updated window muntin geometry (including arch join bar) to use the new independent thickness values.
- Updated Window Mesh Debugger UI with separate thickness sliders and a “Link Thickness” toggle to keep them in sync when desired.
