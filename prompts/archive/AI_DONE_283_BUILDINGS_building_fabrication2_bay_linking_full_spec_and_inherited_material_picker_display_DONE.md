#Problem (DONE)

In Building Fabrication 2:
- Bay material selection should clearly indicate when it is inherited, without showing the inherited thumbnail inside the bay editor.
- Bay linking currently targets bay material only, but we need a more powerful workflow: link an entire bay specification from another bay (master/slave reference), similar to face linking.
- We also need a quick “Duplicate” action that creates a new bay linked to an existing bay.

# Request

Update BF2 bay editing so inherited material display is clearer and add full-bay linking (master/slave) with a top-row `Link` action and a bottom-row `Duplicate` action.

Tasks:
- Inherited material display (bay editor only):
  - When the bay’s wall texture/material is inherited (no override at this bay level):
    - Do not show the actual material thumbnail in the bay editor picker.
    - Show a black thumbnail placeholder and a label `Inherited`.
  - Note: the bay selection card/thumbnail (in the bay selector) must remain unchanged and should continue to show the resolved material preview for that bay.
- Full-bay linking (master/slave by reference):
  - Repurpose the existing “link from another bay” behavior so it links the **entire bay specification**, not just the material.
  - Add a `Link` button in the bay editor header row, alongside the move arrows and delete (garbage) icons.
  - Clicking `Link` opens a popup showing the list of bays; selecting a bay links the current bay to the selected bay as its master.
  - Linking semantics:
    - Linking must not deep-copy values.
    - Store a reference to the master bay (like face master/slave).
    - The linked (slave) bay inherits **all bay properties** from its master (width settings, material settings, window settings, texture flow, expand preference, etc.).
    - Prevent cycles and invalid targets; surface warnings/errors (no silent corruption).
  - UI for linked (slave) bays:
    - Show an indication such as `Linked to bay X` (X = master bay).
    - Do not show editable bay configuration on slaves, but keep layout stable (reserve the space and hide the config content using `visibility:hidden`-style behavior, not display none).
    - Provide an unlink action (location can be on the master or the slave, but it must exist and keep layout stable).
- Duplicate action:
  - Add a `Duplicate` button at the bottom of the bay editor panel.
  - Clicking `Duplicate` creates a new bay that is linked to the current bay as its master.
  - Do not change the current bay selection after duplicating (stay on the original bay).
- Specs update:
  - Update relevant building v2 specs under `specs/buildings/` to document full-bay linking semantics (reference inheritance, no deep copy) and how it composes with face linking.

Constraints:
- Keep behavior consistent with existing BF2 stable-layout rules for hidden/disabled configuration sections.
- Reuse shared popup/list UI builders.

## Quick verification
- In the bay editor, inherited material shows black thumbnail + `Inherited` label (no inherited thumbnail), while bay selector cards still show real material previews.
- `Link` in the bay header links the entire bay spec by reference; slave bays show `Linked to bay X` and are not editable.
- `Duplicate` creates a new bay linked to the current bay without switching selection.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_283_BUILDINGS_building_fabrication2_bay_linking_full_spec_and_inherited_material_picker_display_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Bay editor wall material picker shows a black thumbnail + `Inherited` label when there is no bay-level override (bay selector cards still show resolved previews).
- UI + model: Bay linking is now full-bay reference linking via `linkFromBayId` with a header-row `Link` action; linked bays show `Linked to Bay X` and suppress config with stable layout.
- UX + tests/specs: Added bay `Duplicate` (creates a new bay linked to the current bay without changing selection), updated specs, and updated headless e2e coverage.
