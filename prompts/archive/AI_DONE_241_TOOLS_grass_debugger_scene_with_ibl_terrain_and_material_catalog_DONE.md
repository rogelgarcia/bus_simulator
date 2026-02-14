#Problem (DONE)

We need a dedicated, standalone Grass Debugger tool to iterate on terrain/ground materials and eventually the grass engine. Currently there is no isolated debugger scene with the correct terrain layout, IBL controls, movement controls, and material selection workflows for ground/grass textures.

# Request

Create a standalone **Grass Debugger** tool (independent debug tool page) with:
- Left: 3D viewport
- Right: docked configuration panel with tabs **Environment**, **Terrain**, **Grass**
- ESC to exit the debugger back to the main game
- Arrow keys movement in the debugger viewport
- GPU/perf information connected to the debugger UI (similar to other debug tools)
- IBL configuration options in the Environment tab

Tasks:
- Add a new standalone debug tool page under `debug_tools/` (peer to existing debug tools) and register it in `src/states/DebugToolRegistry.js`.
- UI layout:
  - Left-side 3D viewport (main canvas)
  - Right-side docked configuration panel
  - Tabs: **Environment**, **Terrain**, **Grass**
- Controls:
  - Arrow keys move the camera; keep mouse orbit/pan/zoom consistent with other tools.
  - ESC exits the tool.
  - Disable browser context menu for right-click interactions within the tool.
- Environment tab:
  - Add IBL configuration options consistent with existing tooling (enable/disable, HDR selection, intensity, background mode, exposure if applicable).
  - Display GPU/perf information where available (FPS, draw calls/triangles, renderer info, etc.).
- Terrain layout (test harness):
  - Create a center terrain area of **9x9 tiles**.
  - Along the +Z direction, deploy a road strip that is **9 tiles long** and represents **3x3 lanes** (3 lanes each direction or 3-wide road; match existing road generator conventions).
  - Outside the center 9x9, add:
    - A 1-tile ring around it.
    - An additional 2 tiles extending further in the forward direction (positive Z / upper Z index).
  - Terrain shaping:
    - Left-side tiles slope up at **15°**.
    - Right-side tiles slope up at **30°**.
    - Front (the extra 2-tile depth region) uses random-noise displacement.
    - Ensure tile edges connect seamlessly (no cracks between tiles). Tiles can be curved; they do not need to be planar.
- Terrain materials:
  - Allow selection of PBR materials for the ground (Terrain tab).
  - If there are grass/ground materials in `downloads/` that are not yet in-game, import them into the game’s PBR assets and add them to the catalog.
  - Add a “category/flag” in the material catalog to mark these as **ground** textures for filtering/pickers.
  - Add texture anti-repetition controls similar to Building Fabrication (UV scale/stretch, rotation, offset, any noise-based breakup controls already used elsewhere).

Nice to have:
- A “reset camera” button and a couple camera presets (low angle / high angle) to quickly test grazing-angle aliasing and tiling.
- A debug overlay to visualize tile boundaries and LOD rings (future grass work).

## Quick verification
- Open the Grass Debugger:
  - ESC exits correctly.
  - Arrow keys move the camera without triggering the browser context menu.
  - IBL controls affect lighting/background.
- Terrain layout matches spec:
  - 9x9 center, road strip on +Z, surrounding ring + forward extension, slopes and noise region present, no visible cracks.
- Ground material selection works:
  - PBR ground material renders correctly and anti-tiling controls change appearance live.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_241_TOOLS_grass_debugger_scene_with_ibl_terrain_and_material_catalog_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a standalone Grass Debugger page and registered it in `src/states/DebugToolRegistry.js`.
- Implemented docked tab UI (Environment/Terrain/Grass) with IBL + exposure controls and camera presets.
- Built a deterministic terrain harness (11x13 tile region, slopes, forward noise band) plus a 9-tile road strip.
- Extended `PbrMaterialCatalog` with `groundEligible` filtering and per-material map overrides; imported `grass_005` and `ground_037`.
- Added a Node unit test for the ground material catalog behavior.
