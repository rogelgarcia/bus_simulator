#DONE #Problem

Mesh Inspector (key `6`) and Texture Inspector are implemented as separate screens with duplicated “room” setup logic (plane, grid, XYZ legend, lighting, camera controls). As the tooling grows, this duplication slows iteration and creates inconsistent behavior between the two inspectors (different lighting controls, camera feel, overlays).

# Request

Create a single unified **Inspector Room** screen that reuses one shared 3D scenario component (room) and supports inspecting either meshes or textures via a unified multi-level selection flow:
1) Choose mode: `Meshes` or `Textures`
2) Choose `Collection`
3) Choose `Item`

Then migrate the existing Mesh Inspector and Texture Inspector to use this unified Inspector Room, removing duplication and making controls consistent.

Tasks (grouped):

## A) Shared Inspector Room (reusable 3D scenario component)
- Extract the shared “inspection room” into a reusable component/module that owns:
  - 3D plane + optional gray material
  - grid rendering
  - XYZ axis overlay/legend rendering
  - lighting setup (and runtime control hooks)
  - camera controls (industry-standard orbit/pan/zoom)
- Design it so the inspected content is pluggable:
  - The room accepts “content providers” (mesh provider vs texture provider) as parameters/callbacks.
  - The only difference between Mesh vs Texture inspection is what content is placed in the room and what editor controls are shown.

## B) Unified Inspector UI and selection hierarchy
- Merge Mesh Inspector and Texture Inspector into one screen:
  - Add top-level selector: `Meshes` / `Textures`.
  - Then show a `Collection` selector.
  - Then show the `Item` selector for the chosen collection.
- Ensure selection state is stable and predictable:
  - Remember last selection (mode + collection + item), consistent with existing patterns (session or localStorage).

## C) Lighting controls (global, shared by the room)
- Remove texture-specific lighting controls and use a single lighting controller for the room.
- Add a lighting control panel at **left bottom**:
  - A square minimap representing top view XZ.
  - A vertical slider representing Y height.
  - User can position the light source by clicking/dragging in the minimap and adjusting Y with the slider.
  - Add a toggle to visualize the light in 3D as a glow/marker.

## D) XYZ overlay/legend improvements
- Enhance the XYZ overlay:
  - Add a cross with labels at ends: `+Z`, `-Z`, `+Y`, `-Y`, `+X`, `-X`.
- In the XYZ legend UI, add pressable icon buttons (with tooltips):
  - Toggle labels (enable/disable the +/- legend on the viewport).
  - Toggle axis lines (enable/disable the lines).
  - Toggle “always visible” axis lines (seen through meshes, if possible with the current renderer approach).
- Add a `|` separator in the legend and add:
  - Grid toggle (icon `#`).
  - Plane material toggle (enable/disable the gray material for the viewport plane).

## E) Mesh-specific controls
- For Mesh mode only:
  - Add an option to visualize the mesh pivot.
  - Render the pivot using an industry-standard format (e.g., axis gizmo at origin/pivot with clear colors and scale).

## F) Camera controls (industry standard)
- Replace the current camera controls with industry-standard behavior for inspection rooms:
  - Orbit: left mouse drag (or equivalent standard).
  - Pan: right mouse drag / middle mouse drag (standard).
  - Zoom: mouse wheel.
  - Ensure camera position can be changed (not only angle/zoom).
- Keep controls consistent across both Mesh and Texture inspection modes.

## F2) Camera view presets panel (top)
- Add a compact top panel similar in style to the XYZ legend panel that provides camera view preset buttons using industry-standard naming:
  - `Free` (default interactive orbit/pan/zoom view)
  - `Front` (look along -Z toward origin)
  - `Back` (look along +Z toward origin)
  - `Right` (look along -X toward origin)
  - `Left` (look along +X toward origin)
  - `Top` (look along -Y toward origin)
  - `Bottom` (look along +Y toward origin)
- Ensure switching to a preset:
  - Smoothly transitions the camera (no snapping unless explicitly desired).
  - Preserves a reasonable distance to the inspected content (fit-to-view or stable radius).
  - Does not change the selected item; it only changes the camera view.
- The panel should use icon buttons with tooltips and should not overlap other critical UI elements.

## G) Setup menu integration
- In the Setup menu, merge inspector entries into a single “Inspector Room” entry.
- Do not renumber other scenes; remove only the extra inspector item(s).
- Ensure Welcome screen hints remain consistent with the setup menu (if any shortcuts are shown there).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_106_DONE_MESHES_inspector_room_unify_mesh_texture_inspectors_and_shared_3d_scene`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added a unified Inspector Room screen with shared 3D room, unified selection flow, camera presets, lighting controls, and mesh/texture inspection modes.
