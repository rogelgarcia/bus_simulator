#Problem (DONE)

The Window Mesh Debugger currently focuses on the window mesh layers (frame/glass/shade/interior), but it lacks common facade decoration elements that are often needed to evaluate how windows read on a wall: a **sill** (below), a **header/lintel** (above), and **trim/casing** (around). Without these, it’s hard to style windows and validate proportions/materials in context.

# Request

In the Window Mesh Debugger scene, add a new section called **Decoration** with options to enable and configure:
- Window sill
- Window header/lintel
- Window trim/casing

Each decoration type should support consistent geometry controls and PBR material controls (including UV adjustments).

Tasks:
- Add a **Decoration** section in the Window Mesh Debugger UI.
- Add “Sill” decoration:
  - Enable/disable toggle.
  - Geometry controls: width, height/thickness, depth, extrusion/offset relative to wall and window, and position controls relative to the window opening.
  - Material controls: choose from PBR materials or set a solid color; allow tuning roughness/metalness/normal strength (and any other relevant properties already used by the project).
  - UV controls: UV scale/stretch (U/V), offset, and rotation; ensure changes apply predictably.
- Add “Header/Lintel” decoration:
  - Same control set as Sill (geometry + material + UV).
  - Position it above the window opening with sensible defaults.
- Add “Trim/Casing” decoration:
  - Enable/disable toggle.
  - Geometry controls to define trim thickness/width and depth/extrusion around the window perimeter (with sensible corner behavior).
  - Same material + UV controls as above.
- Ensure decoration integrates correctly with the wall/window stack:
  - Decorations should not z-fight with the wall or the window frame.
  - Decorations should be positioned correctly for both rectangular and arched windows.
  - Decorations should update live when window dimensions change.
- Performance:
  - Keep decoration meshes reasonably efficient (avoid excessive subdivision unless needed).
  - Rebuild decoration geometry only when settings change (not every frame).

Nice to have:
- Presets for common styles (thin modern trim, heavy stone sill, etc.).
- “Match frame material” toggle to quickly reuse frame material settings for trim.
- Per-decoration toggles for casting/receiving shadows.

## Quick verification
- Enable sill/header/trim individually:
  - Each appears in the expected location and with correct orientation.
- Change window width/height and frame width:
  - Decorations follow the window correctly without gaps or overlaps.
- Adjust UV rotation/scale:
  - Material mapping changes are visible and stable.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_244_WINDOWS_window_debugger_add_window_decoration_sill_header_trim_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a new Decoration section in the Window Mesh Debugger UI with configurable sill, header/lintel, and trim/casing controls (geometry, materials, UV, shadows).
- Implemented efficient instanced decoration rendering in the debugger scene with PBR/solid/match-frame material modes and live updates tied to window size/arch.
