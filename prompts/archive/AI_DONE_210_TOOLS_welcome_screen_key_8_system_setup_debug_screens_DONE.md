DONE

#Problem

On the Welcome screen, there isn’t a fast keyboard path to jump directly into the “System Setup” option 8 that lists the debugger-specific screens/tools. This slows down iteration when repeatedly entering debug tools during development.

# Request

Add a Welcome-screen shortcut so pressing `8` jumps straight into System Setup option 8 (the list of debugger-specific screens/tools), and ensure it’s obvious and reliable for keyboard-only use.

Tasks:
- From the Welcome screen, pressing `8` should open the System Setup flow directly at option 8 (the debugger/tools list).
- Ensure the debug-screens list is usable immediately via keyboard (no extra clicks required).
- Ensure the shortcut is discoverable on the Welcome screen (e.g., a visible hint that `8` opens the debug screens list).
- Ensure it does not conflict with existing Welcome screen shortcuts or text-input focus behaviors.
- Behavior correctness:
  - If System Setup / option 8 is unavailable for any reason, fail gracefully (no crash) and provide a clear message or fallback.
  - The list should continue to reflect the current registered debug tool screens (no hardcoded stale list).

Nice to have:
- Add quick-launch from the list (e.g., numeric shortcuts) to open a selected debugger screen immediately.
- Add a “back” action to return to the Welcome screen without losing state.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_210_TOOLS_welcome_screen_key_8_system_setup_debug_screens_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Rewired Welcome screen `8` shortcut to open System Setup directly in the Debugs list (instead of navigating to a single debug page).
- Added a visible Welcome hint (“8: Debugs”) and core tests validating the hint + key behavior.
- Updated SetupState debug menu close behavior so the direct-from-welcome flow returns to Welcome.
