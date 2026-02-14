#DONE #Problem

The Mesh Inspector (key `6`) currently presents meshes in a way that becomes hard to navigate as the catalog grows. There is no first-level grouping (collection/category), so finding a specific mesh requires scrolling/searching through a flat list.

# Request

Add a two-level mesh selection hierarchy in the Mesh Inspector:
1) Select a **collection** (category)
2) Select a **mesh** within that collection

Tasks:
- Mesh catalog grouping:
  - Define a set of mesh collections (categories) for the existing mesh catalog (e.g., Buses, Buildings, Road Props, Procedural Meshes, Debug Meshes).
  - Ensure each mesh entry belongs to exactly one collection.
  - Provide stable collection IDs and labels.
- Mesh Inspector UI changes (key `6`):
  - Add a first-level menu/dropdown/list to choose the active collection.
  - Update the mesh list to show only meshes from the selected collection.
  - Preserve existing behavior for selecting and inspecting a mesh once chosen.
- Navigation UX:
  - Default to a sensible initial collection (e.g., last used, or the first collection).
  - Remember the last selected collection + mesh (per session or via localStorage, whichever matches existing patterns).
  - Ensure keyboard navigation (if present) still works with the two-level selection.
- Compatibility:
  - Do not break existing mesh IDs or any code that references them.
  - Ensure composed meshes and meshes with rigs/schemas still show their nested controls as before.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_105_DONE_MESHES_mesh_inspector_collection_then_mesh_selection`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added collection-first navigation to Mesh Inspector with stable collection IDs, filtered mesh lists per collection, and persisted last collection/mesh selection to localStorage.
