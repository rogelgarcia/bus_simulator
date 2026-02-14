# Problem [DONE]

In Road Debugger, when clicking Export, the JSON text editor overflows its panel width (content/textarea goes outside the panel), making the export view hard to use.

# Request

Fix the Road Debugger Export JSON UI so the text editor always stays within the panel bounds and remains usable for large JSON content.

Tasks:
- Ensure the export JSON editor area respects the panel width and does not overflow horizontally.
- Make the JSON area readable and scrollable:
  - Horizontal scrolling should be available when needed (long lines), but the editor should not push the panel wider.
  - Vertical scrolling should work for large exports.
- Ensure styling is consistent with existing GUI panels (fonts, padding, colors).
- Verify behavior across common viewport sizes (narrow and wide layouts).
- Ensure no regressions to other panels (import, help/tooltips, roads table) that may share the same UI components/styles.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_75_road_debugger_export_json_panel_text_overflow_fix_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Updated schema modal CSS so the export JSON textarea uses border-box sizing, stays within panel bounds, and remains horizontally/vertically scrollable.
