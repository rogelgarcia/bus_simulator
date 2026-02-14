#Problem (DONE)

To adopt the facade layout approach, Building Fabrication needs to shift from “global wall controls + per-floor windows” toward **authoring one face at a time** with stable face identities (A, B, C, D for the initial rectangle) and a workflow that supports mirrored editing.

# Request

Add a “Face Editor” workflow in Building Fabrication with selectable faces and mirror-lock behavior, aligned with `specs/BUILDING_FABRICATION_FACADE_LAYOUT_SPEC.md`.

Tasks:
- Add face selection buttons: `A`, `B`, `C`, `D` (the initial rectangle’s four faces).
- Add a UI option to lock editing so:
  - `A` and `C` stay identical
  - `B` and `D` stay identical
- Mirror lock behavior:
  - When locked, edits made on one face should produce the **same left-to-right authored facade layout** on its paired face (no “reverse order / flip” behavior needed).
- When a face is selected:
  - Show the face’s facade/wall parameters (but **do not** show any windows options in this face-level panel).
  - Highlight the selected face in the 3D viewport in a clear but non-intrusive way.
- Keep all existing Layers / belts / roofs authoring from `specs/BUILDING_FABRICATION_SPEC` intact and compatible with per-face editing.
- Ensure face identities remain stable and understandable within the editor (A–D stays consistent for the initial footprint).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_253_BUILDINGS_building_fabrication_face_editor_and_mirror_lock_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Added a Face Editor panel with face selection (A–D), mirror lock (A=C, B=D), and per-face wall material + depth offset controls (no windows controls in this panel).
- Implemented per-building per-face facade defaults and mirror-lock sync behavior in `BuildingFabricationScene`.
- Added a clear, non-intrusive selected-face highlight in the 3D viewport and wired UI ↔ scene updates.
- Added core tests covering Face Editor UI presence and mirror-lock facade syncing.
