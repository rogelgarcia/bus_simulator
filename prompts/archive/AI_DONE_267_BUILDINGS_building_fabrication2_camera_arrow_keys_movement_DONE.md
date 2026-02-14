#Problem (DONE)

Building Fabrication 2 needs quick, predictable camera navigation without relying solely on mouse controls. Arrow-key camera movement is a familiar and efficient workflow for fabrication/debug screens.

# Request

Enable moving the camera using the keyboard arrow keys in Building Fabrication 2.

Tasks:
- Arrow key movement:
  - Support camera movement with:
    - `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
  - Movement should be intuitive in the current camera mode (e.g., pan in the ground plane or relative to camera orientation), consistent with other debug tools if applicable.
- Input focus rules:
  - Do not move the camera when the user is typing in an input field (sliders/numeric inputs/text inputs).
  - Ensure arrow key handling does not break UI navigation within popups/lists.
- Speed/tuning:
  - Choose a reasonable default movement speed.
  - Nice to have: support a modifier for faster movement (e.g., `Shift`).
- Robustness:
  - Avoid jitter; handle key repeat smoothly.
  - Ensure camera can still use existing orbit/pan/zoom controls.

## Quick verification
- In Building Fabrication 2, arrow keys move the camera as expected.
- Arrow keys do nothing when focused on a text/numeric input.
- Existing mouse camera controls still work.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_267_BUILDINGS_building_fabrication2_camera_arrow_keys_movement_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added BF2 camera panning via arrow keys (with Shift for faster movement) while preserving existing mouse orbit/pan/zoom.
- Blocked arrow-key camera movement while focused on text-editing UI elements (inputs/sliders/numeric/text/selects).
