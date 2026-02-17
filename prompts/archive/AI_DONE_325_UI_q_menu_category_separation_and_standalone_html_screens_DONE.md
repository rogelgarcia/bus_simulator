# DONE

#Problem

The Q menu currently exposes too many mixed screens, and debugger tools are not separated from game-building tools.  
This creates discoverability issues and makes the menu hard to scale.  
In addition, several screens are not independently openable, which makes browser refreshes lose the current context.

# Request

Refactor the Q menu and screen architecture so that game-building tools and debug tools are clearly separated and each screen can be opened directly as a standalone HTML page.

Tasks:
- Create a top-level Q menu structure with only two broad groups:
  - Fabrication (game content building areas such as asphalt, city, buildings, etc.)
  - Debuggers (internal debugging/inspection tools)
- Keep the Fabrication options directly accessible from the Fabrication group.
- Keep Debuggers as one top-level entry and move all debugger screens under it as a second-level list.
- Ensure every Q screen is its own independent HTML file.
- Make screen-to-screen navigation work through direct opening of these HTML files, without requiring entering a parent menu first.
- Ensure a browser refresh preserves the currently open screen and does not return to a different mode.
- Redesign the Q menu layout to stay stable as new screens are added.
- Keep fabrication and debugger functionality isolated so changes in one group do not affect the other.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the AI file to `AI_DONE_325_UI_q_menu_category_separation_and_standalone_html_screens_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a grouped Q-menu registry that separates Fabrication and Debuggers and keeps group-specific screen definitions isolated.
- Refactored setup menu and gameplay overlay flows to use a two-level Fabrication/Debuggers menu while preserving direct quick shortcuts for fabrication screens.
- Switched Q-screen navigation to URL/HTML entrypoint routing so menu selections open standalone pages instead of only in-memory state transitions.
- Added standalone `screens/*.html` launch files for all state-based Q screens and wired `SceneShortcutRegistry` entries to those entrypoints.
- Updated app startup/routing to honor `?screen=<state>` and keep the URL synchronized with launchable scene states so browser refresh preserves the active Q screen.
- Extended headless UI smoke coverage to validate new group labels and verify map screen persistence across browser refresh.
