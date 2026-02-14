# Problem [DONE]

`mesh.street_sign_pole.v1` is slightly oversized compared to other street props
and needs to be slimmer/shorter for better scene scale.

# Request

Reduce the street sign pole procedural mesh dimensions:
- Reduce height by 20%
- Reduce width (radius/diameter) by 10%

Tasks:
- Update `src/graphics/assets3d/procedural_meshes/meshes/StreetSignPoleMesh_v1.js`
  so the generated geometry is 20% shorter and 10% thinner while keeping the
  mesh id stable (`mesh.street_sign_pole.v1`) and keeping region ids stable.
- Ensure any dependent composed meshes (e.g., stop sign mesh) still align
  correctly with the updated pole dimensions (adjust attachment transforms if
  needed).
- Verify the mesh still previews correctly in the Mesh Inspector.
- Add/update browser-run tests validating the new bounding box dimensions are
  scaled as expected (within a small tolerance).

Constraints:
- Keep changes under `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep changes minimal and focused on resizing.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Resized `mesh.street_sign_pole.v1` to be 20% shorter and 10% thinner, relying on existing bbox-based attachment logic for composed signs, and added browser tests asserting the updated bounding box dimensions.
