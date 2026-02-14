# Problem [DONE]

Some 3D meshes expose a "skeleton" API (e.g., vehicles) to drive visual state.
Procedural meshes also need this capability, but there is no generic way to
declare which properties a mesh supports, nor a Mesh Inspector UI to edit those
properties and see the mesh update live.

# Request

Add a declarative skeleton/property schema system for meshes and integrate it
into the Mesh Inspector. Then implement a skeleton for the procedural traffic
light head so the active light (red/yellow/green/none) can be controlled. And also allow for the width of the pole to be adjusted on the composed traffic light mesh.

Tasks:
- Define a static, declarative schema format for mesh "skeleton properties":
  - Properties have stable ids + labels + typed data definitions.
  - Support at least an enum type (id/label/options) and a number type
    (id/label/min/max/step).
  - Expose the schema from a mesh asset in a consistent way (similar to how
    other models expose `userData.api`).
- Implement a skeleton/controller for
  `src/graphics/assets3d/procedural_meshes/meshes/TrafficLightHeadMesh_v1.js`:
  - Provide a property like `activeLight` with enum values:
    `none`, `red`, `yellow`, `green`.
  - When the value changes, update the mesh visuals so only the selected light
    appears "on" (and `none` turns them all off).
  - Ensure behavior works in both inspector material modes (semantic/solid),
    and persists correctly when the inspector toggles modes/wireframe.
  - Add a property like `poleWidth` with number type to adjust the width of the pole (traffic_light_pole:arm).
- For composed assets like
  `src/graphics/assets3d/procedural_meshes/meshes/TrafficLightMesh_v1.js`:
  - Expose child skeleton controls (e.g., the embedded head controls) in
    addition to any top-level controls.
  - Ensure child controls still work even if the composed mesh merges geometry
    into a single `THREE.Mesh` (map controls to the correct regions/material
    indices).
- Update the Mesh Inspector UI to render a "Skeleton" panel when an asset
  exposes schema-driven controls:
  - Build controls dynamically based on property type (enum -> select).
  - Apply updates immediately when the user changes a value.
  - Show child-control groupings for composed meshes (clear labels/sections).
  - Keep the inspector usable for meshes without skeletons (panel hidden).
- Add/update browser-run tests validating:
  - Traffic light head asset exposes the expected skeleton schema.
  - Setting `activeLight` updates the underlying mesh/material state.
  - Composed traffic light asset exposes the head controls as children and they
    affect the correct parts.

Constraints:
- Keep procedural mesh assets in `src/graphics/` and do not add bundler-only
  dependencies.
- Follow the repo comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added schema-driven skeleton controls to procedural meshes and the Mesh Inspector, enabling traffic light head light selection and adjustable composed traffic light pole width with tests.
