# Problem [DONE]

The stop sign plate is too thick (depth along Z), and the traffic light head is
mounted too high on the arm (it sits above the arm centerline instead of being
centered on it).

# Request

Adjust procedural traffic props dimensions/placement:
- Reduce stop sign depth (Z thickness) by 80%.
- Lower the traffic light head by 50% of its height so it sits centered on the
  arm.

Tasks:
- Update the stop sign plate mesh in
  `src/graphics/assets3d/procedural_meshes/meshes/StopSignPlateMesh_v1.js`:
  - Reduce the plate thickness/depth by 80% (i.e. thickness * 0.2).
  - Keep `mesh.stop_sign_plate.v1` id stable and keep region ids stable.
  - Ensure UV mapping remains correct after the thickness change.
- Update the composed stop sign mesh in
  `src/graphics/assets3d/procedural_meshes/meshes/StopSignMesh_v1.js` if needed
  so the plate placement still looks correct after the thickness reduction
  (gap/back offset should not leave the plate floating or intersecting the
  pole).
- Update the traffic light head placement in
  `src/graphics/assets3d/procedural_meshes/meshes/TrafficLightMesh_v1.js`:
  - When attaching the head to the arm, translate the head so its vertical
    center (bounding box center Y) aligns with the arm attachment Y (arm
    midline).
  - Apply the same adjustment in the geometry rebuild path used by the arm
    length property.
  - Keep ids/region ids stable and keep skeleton controls working.
- Verify both assets look correct in the Mesh Inspector (semantic and solid
  modes).
- Add/update browser-run tests validating:
  - Stop sign plate bounding box depth is reduced by ~80% compared to the
    previous dimensions (within tolerance).
  - Traffic light head attach transform centers the head at the arm midline
    (head bbox center Y approximately equals arm center Y after placement).

Constraints:
- Keep changes under `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep changes minimal and focused on the requested adjustments.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Reduced stop sign plate thickness by 80% and added browser tests confirming the new depth and that the traffic light head stays centered on the arm (including after arm-length rebuilds).
