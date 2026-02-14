#Problem [DONE]

Signs and traffic controls are currently split across separate mesh/asset collections, which makes it harder to browse and inspect these related “street furniture” meshes in the Mesh Inspector.

# Request

Merge signs and traffic controls into a single “urban” collection for Mesh Inspector purposes, so they can be browsed and inspected together.

Tasks:
- Create a new Mesh Inspector collection/category named “Urban” (or similar) that groups together:
  - Traffic signs
  - Traffic lights / signals
  - Traffic control props (cones, barriers, bollards, posts, etc. as applicable in the current project)
- Move or alias existing sign and traffic control entries into this unified collection so they appear together in the Mesh Inspector.
  - Prefer a non-breaking approach (aliases/forwarding) if other parts of the code reference the existing collections by id.
- Ensure the Mesh Inspector UI shows the unified collection cleanly and that selection/loading still works for all moved items.
- Keep backwards compatibility:
  - Existing mesh ids and asset ids should remain stable.
  - Avoid breaking any existing references from city generation or other tooling.
- Verify:
  - All sign meshes and traffic control meshes are present in the new Urban collection.
  - No duplicates (unless intentionally aliased) and no missing assets.
  - Mesh Inspector thumbnails/previews still render correctly.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_138_MESHES_merge_signs_and_traffic_controls_into_urban_collection_for_mesh_inspector`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Added a new “Urban” Mesh Inspector collection that unions signs + traffic controls without changing mesh ids, plus a small test to verify membership and prevent duplicate entries.
