#Problem (DONE)

Building Fabrication currently behaves like a “scene with selectable buildings” and includes UI/logic for selecting and highlighting a building. We want to rebuild the workflow around authoring **one single building** with a deterministic starting footprint, as a foundation for adopting the new facade layout / bay-based authoring.

# Request

Update Building Fabrication so it always edits **one single building** with a fixed initial placement/footprint, and remove any “selected building” UX.

Tasks:
- Remove the “highlight selected building” option and any selection UX/logic that assumes multiple buildings in the fabrication scene.
- Ensure Building Fabrication always creates exactly **one** building instance to edit.
- When opening Building Fabrication, initialize the building footprint as a rectangle sized **2 tiles wide × 1 tile deep**, placed in the **middle of the map**.
  - This is a temporary starting footprint; later prompts will allow editing the silhouette via bays/facades.
- Keep the existing Layers / belts / roofs authoring workflow from `specs/BUILDING_FABRICATION_SPEC` working with this new single-building setup.
- Keep camera/navigation behavior consistent with other debuggers/fabrication screens (no new limitations introduced).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_252_BUILDINGS_building_fabrication_single_building_fixed_footprint_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Building Fabrication now always starts (and resets) with one building on a centered 2×1 footprint.
- Removed multi-building selection UX (create-building mode, building list/selection, selection border option, delete-selected-building flow).
- Kept layers/belts/roofs editing working by always editing the single active building, including after loading a catalog config.
- Updated core tests for the new centered footprint + simplified road-mode UI.
