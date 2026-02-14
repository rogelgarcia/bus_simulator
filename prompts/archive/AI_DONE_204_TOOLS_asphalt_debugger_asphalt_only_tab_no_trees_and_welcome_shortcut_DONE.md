DONE

#Problem

The asphalt-independent debugger is intended for focused road/asphalt iteration, but right now it includes extra UI/tabs and may render unrelated scene elements (like trees), which adds noise and makes it harder to debug asphalt/markings issues. Also, launching it should be quick from the Welcome screen.

# Request

Refine the asphalt debugger so it’s asphalt-focused, lightweight, and easy to launch.

Tasks:
- Options UI:
  - In the asphalt debugger, show **only** the Asphalt tab in the options menu (hide/remove other tabs for this tool).
  - Ensure the options panel still updates settings live for asphalt-related controls.
- Scene content:
  - Do **not** render trees in the asphalt debugger scene (roads/markings + minimal context only).
  - Ensure removing trees does not break other scene setup (lighting/camera still works).
- Launch shortcut:
  - Make key `8` selectable from the Welcome screen to open the specific debugger options directly (consistent with other welcome shortcuts).
  - Ensure `Esc` returns back to Welcome cleanly.

Nice to have:
- Add a small label in the debugger UI header indicating “Asphalt Debugger” and current scenario/preset.
- Keep a deterministic default camera pose so comparisons are easier.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_204_TOOLS_asphalt_debugger_asphalt_only_tab_no_trees_and_welcome_shortcut_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Asphalt debugger Options UI now shows only the Asphalt tab (other tabs hidden for this tool).
- Asphalt debugger scene disables tree rendering for a cleaner, asphalt-focused view.
- Welcome screen key `8` now launches the asphalt debugger directly; `Esc` returns back to Welcome.
- Asphalt debugger Options header now identifies “Asphalt Debugger” and the current preset.
