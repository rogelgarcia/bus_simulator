DONE
#Problem

We’re adding more isolated debug tools/screens (ex: the Atmosphere debug scene) that are independent of the game. Right now, there isn’t a clean discoverable path from the existing Welcome → Setup (Q) flow to launch these debug screens, and we need a consistent “debug tools” submenu pattern.

# Request

Add a “Debugs” submenu entry in the Setup screen (opened via `Q` from Welcome) that lists isolated debug screens (starting with Atmosphere). The submenu should use the same blue Setup-style UI and support a reliable escape/back behavior.

Put the debugger files in a subfolder `debug_tools`.

Tasks:
- Add a numbered entry in the Setup menu named `Debugs`.
- When `Debugs` is selected, open a secondary menu (same Setup-style blue screen) listing available debug screens/tools.
  - Include the Atmosphere debug screen as the first entry.
  - Organize the submenu so new debug tools can be added easily (registry/list pattern).
- Launch behavior:
  - Selecting an entry should navigate to the corresponding debug tool/screen.
  - Ensure isolated debug screens can be entered from this menu without relying on gameplay state/engine.
- Back/escape behavior:
  - In the Debugs submenu, `Esc` should return to the main Setup menu.
  - In any of the isolated debug screens launched from this submenu, `Esc` should return to the main menu / index (Welcome screen).
- Ensure the existing Setup menu behavior remains intact for normal scene selection.
- Add minimal documentation (where to register a new debug tool and expected escape/back rules).

Nice to have:
- Show short descriptions under each debug entry (one line).
- Add a “Back” entry at the bottom of the Debugs submenu (in addition to Esc) for mouse users.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_191_TOOLS_setup_menu_debugs_submenu_for_isolated_debug_screens_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `Debugs` entry in Setup and a Setup-style Debug Tools submenu.
- Registered isolated debug tools via `src/states/DebugToolRegistry.js` and wired navigation to standalone HTML pages.
- Moved Atmosphere debug page + related docs under `debug_tools/` and enforced `Esc` back-to-`index.html` behavior.
