#Problem (DONE)

In Building Fabrication, the camera is constrained so it cannot move below the floor/ground plane. This makes it difficult to inspect geometry, windows, and underside details from all angles and limits debugging and look-dev workflows.

# Request

Remove the “cannot go below the floor” camera limitation in Building Fabrication. The camera should be able to move freely in all directions with no floor/ground clamp.

Tasks:
- Identify where the Building Fabrication camera movement is being constrained (floor clamp, min Y limit, collision constraint, or controller settings).
- Remove or disable the constraint so the camera can move below the floor plane.
- Ensure all camera movement modes remain functional (orbit/pan/zoom, keyboard movement if supported).
- Ensure removing the clamp does not break:
  - Camera controls stability (no NaNs, no lock-ups)
  - UI interaction focus
  - Any existing camera presets (if present)
- Keep behavior consistent with other debug tools where camera movement is unrestricted.

Nice to have:
- Add an optional toggle “Clamp camera above ground” (default off) if you still want a safety option for some users.

## Quick verification
- In Building Fabrication:
  - Move the camera below the floor and back above it.
  - Confirm orbit/pan/zoom continue working and there are no visual/control glitches.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_248_BUILDINGS_building_fabrication_remove_camera_floor_clamp_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Removed the orbit “floor clamp” for Building Fabrication 2 by allowing the camera to rotate below the ground plane (kept legacy Building Fabrication unchanged).
