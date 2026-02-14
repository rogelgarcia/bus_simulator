#Problem (DONE)

After introducing bay-based facades, the building generator must produce consistent 3D geometry that matches the authored bay silhouette (including extrude/inset and angled wedge bays). Belts and roof structures must follow the updated silhouette so they don’t “ignore” bay depth changes.

# Request

Update Building Fabrication generation so walls, belts, and roofs follow the new bay-based facade silhouette across all layers.

Tasks:
- Convert the authored bay facade layout (per face) into 3D wall geometry that reflects:
  - bay width partitions (full face coverage)
  - per-bay wall material overrides
  - per-bay depth changes (extrude/inset)
  - angled/wedge bays with slanted side faces at 15° step increments
- Ensure bay depth transitions between adjacent bays produce correct connecting geometry (no cracks/overlaps), including where a bay is separated by a padding bay at regular depth.
- Ensure belts and roofs follow the final silhouette defined by the bays:
  - Belts should extrude/inset relative to the new wall surfaces/silhouette.
  - Roof rings/edges should align to the new outer silhouette where applicable.
- Keep the existing layer-based building system from `specs/BUILDING_FABRICATION_SPEC` working:
  - Layers still drive floors/roof placement.
  - The facade layout applies per face and is respected across all applicable floor layers.
- Add clear debug/validation feedback when a bay layout cannot generate valid geometry (surface warnings/errors instead of silent fallbacks).
- Ensure export from Building Fabrication includes the necessary facade/bay layout data so the same building can be generated outside the fabrication screen.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_256_BUILDINGS_building_fabrication_generate_geometry_from_bays_and_update_belts_roofs_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Updated `buildBuildingFabricationVisualParts` to generate walls from authored A–D bay layouts (depth offsets + wedge bays) and apply per-bay facade material overlays.
- Updated belts, roof surfaces, and roof rings to follow the bay silhouette, with generation warnings surfaced in Building Fabrication and logged in the City renderer.
- Extended building config export and city rendering to include/pass `facades` and `windowDefinitions`, and added a core test verifying bay silhouette impacts walls/belts/roof rings.
