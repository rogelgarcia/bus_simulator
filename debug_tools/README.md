# Debug Tools

This folder contains isolated debug screens that run outside the main game state machine.

## Add a new debug tool

1) Create a standalone HTML page under `debug_tools/` (peer to `debug_tools/atmosphere_debug.html`).
2) Register it in `src/states/DebugToolRegistry.js`.

## Navigation rules

- From the main game Setup screen: `Setup → Debugs` opens the Debug Tools submenu.
- In the Debug Tools submenu: `Esc` (or `Back`) returns to the main Setup menu.
- Inside a debug tool screen: `Esc` returns to `index.html` (Welcome screen).

