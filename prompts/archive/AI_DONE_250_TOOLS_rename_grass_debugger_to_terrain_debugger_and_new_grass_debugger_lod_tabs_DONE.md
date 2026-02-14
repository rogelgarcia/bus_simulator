#Problem (DONE)

The current “Grass Debugger” has grown to include a lot of terrain/material iteration functionality. We now need to:
1) Rename/re-scope the existing Grass Debugger into a **Terrain Debugger**.
2) Create a new dedicated **Grass Debugger** scene focused specifically on grass LOD experiments and grass blade inspection, starting from a simple foundation.

# Request

Rename the existing Grass Debugger tool to **Terrain Debugger**, and create a new standalone **Grass Debugger** tool with a simple 15x15 terrain + road test harness and an Options-style panel focused on grass LOD tabs (LOD 1–4). Start by implementing only LOD 1 behavior and an inspector for the LOD 1 grass mesh (using the Soccer Grass Blade lo-res procedural mesh), including density/randomization controls.

Tasks:
- Rename existing tool:
  - Rename the existing Grass Debugger tool/page/labels to **Terrain Debugger**.
  - Ensure its debug tool registry entry, URLs, and navigation reflect the new name.
  - Keep backward compatibility if any links/bookmarks exist (optional redirect), but prefer clean naming going forward.
- Create a new standalone Grass Debugger tool:
  - Add a new debug tool HTML page under `debug_tools/` and register it in `src/states/DebugToolRegistry.js`.
  - Layout matches other tools:
    - Left: 3D viewport
    - Right: docked configuration panel
  - ESC exits the tool.
  - allow the same camera controls from the terrain debugger (orbit, pan, zoom).
  - Add environment options panel:
    - IBL selection + intensity/background toggles
    - Sun/directional light strength controls (at minimum: sun intensity; )
- New Grass Debugger scene content:
  - Create a simple terrain plane/grid of **15x15 tiles**.
  - Add a road crossing/strip through the area (use existing road generator conventions).
  - Keep the scene minimal and stable for grass tuning.
- UI tabs for grass LOD:
  - Add 4 tabs: **LOD 1**, **LOD 2**, **LOD 3**, **LOD 4**.
  - Each LOD tab has:
    - Enable/disable toggle
    - Controls to define the region where it draws (distance ranges / ring distances)
    - Controls for camera-angle ranges (e.g., only render for grazing angles, etc.)
  - Add debug visualization options:
    - “Print selected LOD region on floor”,  with each LOD using a distinct color.
    - “Draw LOD boundary lines”, with each LOD using a distinct color.
    - can be enabled individually on each LOD tab.
    - Ensure these debug visuals update live when LOD region parameters change.
  - Start by implementing only **LOD 1** rendering and controls end-to-end; leave LOD 2–4 as UI-only stubs or disabled with “TODO” messaging.
- LOD 1 grass implementation:
  - Add a blade asset selector for LOD 1:
    - Allow selecting between **Soccer Grass Blade (lo-res)** and a **hi-res blade** variant.
    - Default to lo-res.
    - If a hi-res blade mesh does not exist yet, create one (new procedural mesh entry) and expose it in the selector.
  - Render grass in the LOD 1 region using a performant approach (instancing/batching).
  - Add randomization parameters for LOD 1:
    - Density (instances per area)
    - Random yaw
    - Random bend/tip bend within ranges
    - Random color variation within ranges (optional)
  - Ensure determinism via a seed so results are reproducible.
- LOD 1 grass inspector:
  - Add an “Inspect LOD 1 Grass” button that opens a popup/inspector view for the grass used in LOD 1.
  - Inspector should allow viewing:
    - Single blade
    - Small cluster/tuft (optional)
  - Allow adjusting the same key parameters (bend, colors, roughness/metalness) and seeing live updates.

Nice to have:
- A debug overlay that visualizes the active LOD 1 region and prints instance counts/draw calls.
- A “freeze random seed” toggle vs “regenerate” button.

## Quick verification
- Existing Grass Debugger is now labeled/registered as Terrain Debugger and still works.
- New Grass Debugger:
  - Opens from debug tools list, has 15x15 terrain and road.
  - Environment controls (IBL + sun intensity) visibly affect lighting.
  - LOD 1 tab can enable grass, control region, and adjust density/randomization.
  - Inspector opens and shows the Soccer Grass Blade lo-res mesh with live parameter changes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_250_TOOLS_rename_grass_debugger_to_terrain_debugger_and_new_grass_debugger_lod_tabs_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Renamed the old Grass Debugger into Terrain Debugger and added `debug_tools/terrain_debug.html` (with `debug_tools/grass_debug.html` kept as a legacy alias).
- Added a new standalone Grass Debugger tool registered in `src/states/DebugToolRegistry.js` with a simple 15x15 terrain + road harness and environment controls.
- Implemented LOD 1 instanced grass rendering (lo/hi-res Soccer Grass Blade selector, seed + density + randomization) plus live floor ring/boundary debug visuals.
- Added an “Inspect LOD 1 Grass” popup that edits blade prefab/material parameters and pushes key shape changes back into the LOD1 controls.
