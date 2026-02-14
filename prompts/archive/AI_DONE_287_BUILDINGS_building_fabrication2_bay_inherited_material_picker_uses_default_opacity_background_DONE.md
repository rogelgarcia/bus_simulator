#Problem (DONE)

In Building Fabrication 2, when a bay material is inherited, the bay editor currently uses a black thumbnail placeholder. This looks too heavy and inconsistent with the visual treatment used elsewhere for “default/inherited” material states.

# Request

Update the BF2 bay editor material picker so inherited bay materials use the same “default” opacity background style instead of a black background.

Tasks:
- Inherited bay material picker appearance (bay editor only):
  - When the bay material is inherited (no bay-level override), do not use a black thumbnail background.
  - Use the same opacity/background style that is used for the default/inherited material state elsewhere in BF2.
  - Keep a clear `Inherited` indication (label or equivalent), but keep the styling subtle and consistent with the default state.
- Do not change bay selector cards:
  - The bay selection cards/thumbnails must remain as-is (showing the resolved material preview).

Constraints:
- Visual/style change only (no behavioral changes to inheritance, linking, or solver logic).

## Quick verification
- In bay editor, inherited bay material shows the “default opacity” background style (not black) and still reads as inherited.
- Bay selector cards still show real material previews.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_287_BUILDINGS_building_fabrication2_bay_inherited_material_picker_uses_default_opacity_background_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Removed the solid black override for inherited bay material thumbnails in the bay editor picker (uses default opacity background).
- Updated BF2 UI spec to describe the default/inherited placeholder styling for bay editor materials.
- Updated the headless e2e test to assert the inherited bay editor thumb matches the default material thumb background style.
