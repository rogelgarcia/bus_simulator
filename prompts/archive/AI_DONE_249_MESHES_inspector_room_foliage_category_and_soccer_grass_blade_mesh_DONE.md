#Problem (DONE)

The previous Grass Debugger approach (3D blades + impostors) did not work well and needs to be restarted from a simpler foundation. We currently don’t have a dedicated “Foliage” category in the Mesh Catalog for the Inspector Room to iterate on foliage meshes/materials in isolation.

# Request

Start over from a minimal, inspectable foundation:
1) Add a **Foliage** category to the Mesh Catalog in the Inspector Room.
2) Add a simple “soccer grass blade” mesh entry under that category, built procedurally from a tiny triangle budget.
3) Expose parameters to rotate the top blade portion around its base to create an adjustable bend angle.

Tasks:
- Mesh Catalog / Inspector Room:
  - Add a new category named **Foliage** to the Mesh Catalog used by the Inspector Room.
  - Ensure it shows up in the UI alongside existing categories and supports selecting/previewing entries.
- Soccer grass blade mesh (procedural):
  - Create a new mesh entry “Soccer Grass Blade” under the Foliage category.
  - Geometry requirements (simple, for iteration):
    - Use **3 triangles total**.
    - Build a **square base** (2 triangles).
    - Build a **triangle on top** (1 triangle) representing the blade tip.
  - Ensure sensible default dimensions in meters (e.g., a small blade height and width).
- Bend/rotation parameterization:
  - Allow the “top triangle” to rotate around its base edge (or pivot point) to create an angle relative to the square base.
  - Expose parameters in the Inspector Room UI to control:
    - Bend angle (degrees)
    - Optional: pivot position along the base/top junction (if needed)
  - Ensure parameter changes rebuild/update the mesh live.
- Rendering/inspection:
  - Ensure the mesh renders correctly in the Inspector Room with existing lighting/IBL.
  - Provide a couple debug toggles useful for mesh validation (wireframe, normals) if the Inspector Room already supports them.
- Code organization:
  - Implement the mesh generator as a reusable module consistent with the project’s mesh/material catalog patterns.
  - Avoid tying this implementation to the old grass debugger system; this is a new foundation for future foliage work.

Nice to have:
- Add a simple “random yaw rotation” parameter (0–360) to validate how the blade reads under different orientations.
- Add a “duplicate blade count” option in the Inspector Room preview (small instanced cluster) to see repetition quickly.

## Quick verification
- In Inspector Room:
  - Select Mesh Catalog → Foliage → Soccer Grass Blade.
  - Adjust bend angle:
    - The top triangle rotates relative to the base without breaking geometry.
  - Confirm no console errors and the mesh remains visible from typical camera angles.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_249_MESHES_inspector_room_foliage_category_and_soccer_grass_blade_mesh_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a `Foliage` collection to the Inspector Room mesh catalog.
- Added a procedural `Soccer Grass Blade` mesh (3 triangles) with live prefab params for bend angle, yaw, and instanced preview count.
