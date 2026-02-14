#Problem (DONE)

Arched window behavior is missing key configuration:
- The top horizontal piece for an arch can only render as the outer frame, but we need an option to render it as a muntin-style bar instead.
- When the arch is configured to not use the top horizontal frame piece, vertical muntins still render into the arch/top region, which is undesirable for common grid layouts (e.g., a 2x2 grid should not extend the vertical split into the arch area).

# Request

Extend arched window behavior in the Window Mesh Debugger with:
1) A mode for the arch’s top horizontal piece to render as outer frame or as a muntin.
2) A rule to suppress vertical muntins in the arch/top region when the top frame piece is not used.

Tasks:
- Add an option for arched windows to choose how the top horizontal piece is rendered:
  - As part of the outer frame.
  - As a muntin (with muntin material/width/depth rules).
- Add an option for arched windows where, if the “top horizontal frame piece” is disabled:
  - Do not render vertical muntins into the arch/top region (e.g., for 2x2, the first row/top region should have no vertical split).
- Ensure these options update live and behave consistently across different muntin grid settings (rows/cols).
- Ensure no gaps, overlaps, or z-fighting appear at the arch/rectangle boundary.

Nice to have:
- Add a few arched window presets (common grid layouts) to quickly validate the rules.

## Quick verification
- Configure an arched window with a 2x2 grid:
  - With top frame disabled, vertical muntin does not extend into the arch/top region.
  - With top frame enabled, top piece mode toggles between frame vs muntin behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_233_WINDOWS_window_debugger_arch_top_frame_modes_and_muntin_row_rules_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added arch settings for top-piece rendering mode and vertical-muntin clipping when no top piece.
- Updated window mesh geometry/generator so the arch top piece can render as frame or muntin, and vertical muntins can be clipped out of the arch region when desired.
- Added Window Mesh Debugger UI controls + a few arch presets for quick validation.
