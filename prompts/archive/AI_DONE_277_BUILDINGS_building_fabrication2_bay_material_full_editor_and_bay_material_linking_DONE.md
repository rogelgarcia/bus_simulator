#Problem (DONE)

In Building Fabrication 2, bay material authoring is not yet at feature-parity with wall material authoring: the bay material editor must expose the full set of material controls (texture tiling, material variation, etc). Additionally, authoring many bays can be repetitive; we need a way to link a bay’s material configuration from another bay, similar to the face master/slave linking behavior.

# Request

Extend BF2 bay material editing so:
- bay material configuration exposes the same material controls as wall material configuration, and
- a bay can link (inherit) its material configuration from another bay via a “Link from another bay” action.

Tasks:
- Bay material editor parity:
  - Ensure the bay material editor exposes the same categories/controls as the wall material editor (e.g., `Base material`, `Texture tiling`, `Material variation`), with the same intent and UX patterns.
  - Keep the bay material picker UX consistent with the BF2 wall picker flow (thumbnail + name; opens the material configuration panel), per existing BF2 panel rules.
- Bay material linking (bay-level master/slave):
  - Add a button below the bay material section: `Link from another bay`.
  - Clicking it opens a popup listing the bays (use the current face’s bay list; show each bay’s number and a small material preview).
  - Selecting a bay links the current bay’s material configuration to the selected “master” bay.
  - Linking behavior:
    - Do not copy/duplicate the material configuration data.
    - Store a reference to the master bay (similar concept to face master/slave).
    - The linked (slave) bay inherits all bay material settings from the master bay.
    - Editing the master bay’s material updates all linked slave bays.
  - UI behavior for linked bay materials:
    - When editing a slave bay material, do not show editable material controls.
    - Instead, show an indication like `Linked to bay X` (X = master bay id/number), while keeping layout stable (reserve space; hide underlying controls using `visibility:hidden`-style behavior, not display none).
    - Provide a way to unlink a slave bay (from the master bay UI, or from the slave bay UI) without breaking layout stability.
- Interaction with face linking:
  - Respect the existing face master/slave rules:
    - If the selected face is a slave, bay material editing (including bay-to-bay linking) must not duplicate/copy any configs and must follow the locked/inherited behavior already established for slave faces.
- Specs update:
  - Update relevant building v2 specs under `specs/buildings/` to document:
    - bay material editor parity with wall material editor,
    - bay-to-bay material linking semantics (reference-based inheritance, not deep copy),
    - how this interacts with face linking (no copies).

## Quick verification
- In BF2, selecting a bay shows a bay material editor with the same sections/controls as the wall material editor.
- Clicking `Link from another bay` opens a popup bay list; selecting a bay links the material settings by reference.
- Editing the master bay’s material updates slave bays; slave bays show `Linked to bay X` and do not expose editable controls.
- Face-level slave states still prevent bay material edits and do not create duplicate configs.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_277_BUILDINGS_building_fabrication2_bay_material_full_editor_and_bay_material_linking_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Engine: Added per-bay wall material overrides (`wallBase`, `tiling`, `materialVariation`) and reference-based bay-to-bay material linking resolution (`materialLinkFromBayId`).
- UI: Added bay-to-bay material linking UX and expanded the bay Material Configuration panel to full parity (Base material + PBR, Texture tiling, Material variation).
- Specs: Updated Building v2 UI + engine specs to document bay material parity and bay-to-bay linking semantics.
- Tests: Added a headless e2e test validating bay material linking inheritance behavior.
