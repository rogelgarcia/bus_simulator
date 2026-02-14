#Problem (DONE)

We have a new procedural window modeling spec in `window_mesh_specification.md`, but it is not implemented in the codebase yet. We also lack a dedicated, standalone window-mesh debugger that allows fast iteration on window parameters without running the full game.

# Request

Implement the window mesh system described in `window_mesh_specification.md` in the game source (as reusable modules/models), and create an **independent standalone debugger** (debug-tool page) with complete controls for editing/tuning window meshes. The debugger should have its own UI, but it must read/use the same window model definitions from the app source. Later, this window model will be adapted to Mesh Inspector and Building Fabrication (out of scope for this prompt).

Tasks:
- Implement `window_mesh_specification.md`:
  - Create a window mesh generator that builds a procedural mesh with these layers:
    - Frame (outer border + optional internal grid/muntins)
    - Glass (tint/opacity + reflective properties)
    - Shade (discrete coverage levels, behind glass)
    - Interior (parallax/atlas-based interior appearance)
  - Support rectangular windows and optional arch top, including the “arch meets rectangle” frame behavior described in the spec.
  - Ensure parameters map directly to the spec (width/height, frame width/depth/color, bevel size/roundness, muntin columns/rows/width/depth/inset/UV offset/color/bevel, etc.).
  - Glass:
    - Implement opacity + tint and expand the reflection property set so glass reflections are fully configurable (align with existing reflection/IBL concepts in the project).
    - Support a Z offset to move the glass forward/back relative to the frame.
    - Ensure reflections apply only to the glass (not frames/muntins).
  - Shade:
    - Implement discrete coverage values (None/20%/50%/100%) with optional per-window randomization.
    - Implement shade color + subtle procedural fabric texture controls (scale + intensity) and a Z offset behind the glass.
  - Interior:
    - Implement interior atlas selection with a grid layout (cols/rows) and per-window random cell selection.
    - Implement parallax depth control and random horizontal flip.
    - Implement tint-range variation controls (hue/sat/brightness ranges) to reduce repetition.
  - Keep the system deterministic:
    - Add a seed/ID-driven randomness path so the same building/config produces stable per-window variation across reloads.
  - Keep it performance conscious:
    - Avoid per-frame rebuilds; rebuild only when settings change.
    - Ensure geometry/material reuse is effective across windows when possible.

- Create a standalone Window Mesh Debugger tool (independent of the game):
  - Add a new debug tool HTML page under `debug_tools/` and register it in `src/states/DebugToolRegistry.js`.
  - The debugger uses its own UI (Options-style) but reads the window model definitions from the app source modules.
  - Provide a test scene per spec:
    - Create a simple map and a square building with 3 floors and 3 windows per floor to exercise variations.
    - No building customization needed beyond a wall material choice; expose only a wall PBR selector (for lighting/material context).
  - Provide complete parameter controls for all window mesh settings defined in the spec (frame/muntins/glass/shade/interior).
  - Input/interaction:
    - Allow moving in the debugger viewport using arrow keys (document the keybinds; avoid conflicting with UI focus).
    - Keep mouse orbit/pan/zoom behavior consistent with other debug tools.
  - Provide debug aids:
    - Toggle visibility of each layer (frame/glass/shade/interior) to isolate issues.
    - Optional wireframe/normal visualization to validate geometry and offsets.
    - A deterministic “seed” field so users can reproduce a specific window variation layout.

Nice to have:
- Add import/export for the window model settings (JSON or ES module snippet) for quick iteration and later integration into Mesh Inspector / Building Fabrication.
- Add a small “preset” system for window styles (e.g., “modern”, “classic grid”, “arched”) usable by the debugger.

## Quick verification
- In the Window Mesh Debugger:
  - Toggling each layer on/off works and only affects that layer.
  - Adjusting key settings (frame width/depth, muntin rows/cols, glass Z offset, shade coverage, interior atlas selection) updates live and remains stable during camera motion.
  - Arrow-key movement works reliably without requiring mouse interaction.
  - With a fixed seed, reloading reproduces the same window variations.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_229_WINDOWS_implement_window_mesh_spec_and_standalone_debugger_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added window mesh settings model + deterministic per-window variation.
- Implemented procedural window mesh generator (frame/muntins/glass/shade/interior) as reusable modules.
- Added a standalone Window Mesh Debugger page + registered it in DebugToolRegistry.
- Added Node unit tests for the new window mesh settings/variation APIs.
