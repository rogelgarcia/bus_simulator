DONE
# Problem

In Building Fabrication 2, left mouse button camera behavior is incorrect for the intended workflow. Left mouse currently behaves like right mouse instead of controlling camera look/angle.

# Request

Update Building Fabrication 2 camera input mapping so left mouse button controls camera look (angle rotation) with clear, non-conflicting behavior relative to right mouse.

Tasks:
- Change BF2 camera controls so dragging with left mouse rotates camera look/angle.
- Ensure left mouse no longer mirrors right mouse behavior.
- Preserve right mouse behavior as currently intended (no regression).
- Ensure the interaction is consistent across normal BF2 editing/navigation states.
- Validate there are no input conflicts with existing selection/interaction flows in BF2.
- Update any relevant Building Fabrication 2 control documentation/spec notes under `specs/buildings/` if behavior contracts are documented there.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_410_BUILDINGS_building_fabrication2_left_mouse_look_camera_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_410_BUILDINGS_building_fabrication2_left_mouse_look_camera_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary
- Updated BF2 camera mapping so left mouse drag is the dedicated orbit/look control while right mouse drag pans (no mirrored left/right orbit behavior).
- Preserved BF2 tool-capture consistency: ruler/layout modes still disable camera mouse controls and keep left-button interaction ownership.
- Updated BF2 camera mapping coverage in `tests/core.test.js` to assert left-orbit and right-pan mappings explicitly.
- Documented the BF2 mouse contract in `specs/buildings/BUILDING_2_SPEC_ui.md` with explicit right-drag pan behavior.
