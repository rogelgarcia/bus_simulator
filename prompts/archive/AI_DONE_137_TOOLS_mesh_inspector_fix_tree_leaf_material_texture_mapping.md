#Problem [DONE]

In the Mesh Inspector, trees are not loading/rendering correctly: the leaves that should have a leaf texture/material are instead using the trunk texture. This makes tree assets look wrong and makes it hard to inspect foliage materials.

# Request

Fix tree rendering in the Mesh Inspector so leaf meshes/materials use the correct leaf textures instead of the trunk texture.

Tasks:
- Reproduce and identify why leaf geometry/material selection ends up using trunk textures in the Mesh Inspector rendering path.
- Fix material assignment so tree leaves use their intended material/texture maps (baseColor/alpha/normal/etc. as applicable).
- Ensure the fix is correct for:
  - Trees with multiple sub-meshes (trunk + leaves as separate geometries/material slots).
  - Trees where leaves rely on alpha cutout/transparent textures.
  - Any instanced or batched rendering paths used by the inspector.
- Ensure the Mesh Inspector UI correctly lists and previews the distinct trunk vs leaf materials.
- Keep backwards compatibility with existing asset definitions and avoid breaking non-tree meshes.
- Add a small verification step (manual or automated where feasible) that detects mismatched material-to-mesh assignment for multi-material tree assets.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_137_TOOLS_mesh_inspector_fix_tree_leaf_material_texture_mapping`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Fixed tree leaf/trunk material assignment in the Mesh Inspector by tagging roles from the original loaded tree materials and applying them deterministically (with a small automated test verifying multi-material meshes).
