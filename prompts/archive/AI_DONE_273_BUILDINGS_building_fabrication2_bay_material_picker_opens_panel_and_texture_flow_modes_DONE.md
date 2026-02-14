#Problem (DONE)

In Building Fabrication 2, bay material selection is currently inconsistent with the newer “wall material picker opens the Material Configuration panel” flow, and the bay UI includes an explicit label (`overrides the face wall material`) that adds noise. Also, texture mapping currently restarts per bay, which prevents continuous material flow across repeated bays or adjacent bays that share the same material.

# Request

Improve BF2 bay material selection and texture mapping continuity:
- Clean up the bay material UI (remove the explicit override label).
- Make the bay material picker open the Material Configuration panel (same behavior as the wall material picker).
- Add a per-bay “texture flow” option to control whether the applied wall material restarts, continues across repeated bays, or overflows across adjacent bays using the same material.

Tasks:
- Bay material UI cleanup:
  - Remove the label text `overrides the face wall material` from the bay material selection UI.
  - Keep the existing “inherited vs overridden” indication pattern, but make it subtle (no explicit override sentence).
- Bay material picker behavior:
  - The bay material picker must follow the same behavior as the wall material picker:
    - Keep the picker UI (thumbnail + material name; no separate label).
    - Clicking the picker opens the Material Configuration side panel (using the established “collapse building properties into thin column” rule).
  - Ensure the Material Configuration panel edits the **selected bay’s** material override (or the inherited face material if no override is set, depending on the current design), without duplicating config for slave faces.
- Face linking rules (no copies):
  - Bay material configuration is per face (within a floor layer).
  - If the selected face is a slave, it must not duplicate/copy bay material configuration; it only declares that it inherits from its master face.
  - The UI must respect the existing locked/inherited behavior for slave faces (no editable bay material config on slaves).
- Texture flow modes (per bay):
  - Add a per-bay option that determines how wall material mapping behaves across bay boundaries.
  - Supported modes:
    1) `Restart on new bay` (current behavior; default)
       - Each bay instance starts the material mapping from the beginning (no continuity).
    2) `Continuous across repeats`
       - If the same bay repeats multiple times (from the bay repetition solver), the material mapping continues across those repeated instances as one continuous flow (no restart per repeated instance).
    3) `Overflow`
       - Enables continuity across **non-repeated** adjacent bays when they use the same resolved material name.
       - Overflow has two variations:
         - `Overflow left`
         - `Overflow right`
       - `Overflow left` is disabled for the leftmost bay in the facade layout.
       - `Overflow right` is disabled for the rightmost bay in the facade layout.
       - Overflow must only carry continuity across a boundary when both sides resolve to the same material name (otherwise it behaves like restart for that boundary).
  - Determinism:
    - The resulting mapping/offset behavior must be deterministic across runs (no random tie-breaks).
- Specs update:
  - Update relevant building v2 specs under `specs/buildings/` to document:
    - bay material picker opens Material Configuration panel,
    - per-bay texture flow mode options and their meaning,
    - how this interacts with face linking (master/slave inheritance).

## Quick verification
- In BF2, bay material selection no longer shows the explicit `overrides the face wall material` label.
- Clicking the bay material picker opens the Material Configuration panel (same side-panel behavior as wall picker).
- With repeated bays, switching to `Continuous across repeats` produces a continuous material flow across repeated instances (no per-instance restart).
- With adjacent non-repeated bays using the same material name, `Overflow left/right` produces continuous flow across that boundary (and is disabled at outermost edges accordingly).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_273_BUILDINGS_building_fabrication2_bay_material_picker_opens_panel_and_texture_flow_modes_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Removed the explicit bay wall material override label and kept a subtle inherited/overridden indication.
- Routed the bay material picker to open the Material Configuration side panel (bay-scoped) instead of a popup picker.
- Added per-bay `texture flow` modes and implemented deterministic UV continuity across repeats and overflow boundaries (only when both sides resolve to the same material).
- Updated Building v2 UI/engine specs under `specs/buildings/` to document bay material config + texture flow behavior.
