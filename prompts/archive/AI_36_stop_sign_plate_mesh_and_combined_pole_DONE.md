# Problem [DONE]

We need a reusable 3D stop sign prop made from procedural meshes: a sign plate
that displays a stop sign texture, and a combined mesh that includes both the
pole and the sign plate.

# Request

Create procedural mesh assets for a stop sign plate and a combined stop sign
(pole + plate), using the existing sign pole mesh and a stop sign texture.

Tasks:
- Create a new procedural mesh asset for a stop sign plate:
  - Geometry is a hexagonal plate (6-sided) and is rotated/oriented so the
    front face is visible to the Mesh Inspector camera when first opened.
  - Provide stable region ids for selection (at least `plate:face`).
  - Use a texture material that shows a stop sign correctly on the plate.
  - Ensure UV mapping is correct for the plate so the sign is not mirrored and
    is centered.
- Use the existing street sign pole mesh as the pole component (or create a
  dedicated pole if needed) and create a combined procedural mesh asset:
  - Pole + stop sign plate combined into a single asset that can be placed in
    the world.
  - Attach the sign plate at an appropriate height and offset from the pole.
  - Preserve region ids for both pole and plate in the combined asset so the
    Mesh Inspector can pick them.
- Integrate the new assets into
  `src/graphics/assets3d/procedural_meshes/ProceduralMeshCatalog.js` so they
  appear in the Mesh Inspector list.
- Ensure the stop sign texture is sourced from the Traffic Signs texture
  collection (or add a dedicated stop sign texture entry if it does not exist
  yet), avoiding duplicate texture loads.
- Add/update browser-run tests validating:
  - The new mesh modules are importable.
  - The catalog exposes the new mesh ids.
  - The sign plate mesh has UVs in the expected range and uses the stop sign
    texture entry.

Constraints:
- Keep rendering assets in `src/graphics/`.
- Keep static-web compatibility (no bundler assumptions).
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added `mesh.stop_sign_plate.v1` (textured atlas-mapped plate) and `mesh.stop_sign.v1` (pole + plate) to the procedural mesh catalog with tests for ids, regions, and stop-sign UV mapping.
