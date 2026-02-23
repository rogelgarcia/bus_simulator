DONE

# Problem

In Building Fabrication 2, placing windows/doors in a bay does not provide direct controls to adjust placed opening width and height.

# Request

Add width and height inputs for bay-level window/door placement in Building Fabrication 2 so users can size openings directly during authoring.

Tasks:
- Add width and height inputs to the bay window/door placement controls in Building Fabrication 2.
- Apply width/height values to placed window and door openings in preview/runtime geometry.
- Ensure changing width/height updates placement output deterministically and immediately.
- Keep sensible defaults for width and height so existing flows continue to work without manual edits.
- Validate width/height ranges to prevent invalid geometry (non-positive or out-of-bounds for the target bay).
- Preserve existing placement behavior for properties not explicitly changed by the new size inputs.
- Update relevant specs under `specs/buildings/` and/or `specs/windows/` to document bay opening sizing controls and constraints.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_416_BUILDINGS_building_fabrication2_bay_window_door_width_height_inputs_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_416_BUILDINGS_building_fabrication2_bay_window_door_width_height_inputs_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added direct per-bay `Opening width` and `Opening height` controls in BF2 bay window/door authoring, wired to immediate rebuild callbacks.
- Added canonical bay window size support (`window.size.widthMeters` / `window.size.heightMeters`) in BF2 view state with legacy width-range compatibility.
- Updated generator bay placement to prioritize direct size values, clamp width to usable bay span and height to floor segment bounds, and keep deterministic placement.
- Added a core regression test that validates bay window placement size follows direct `window.size` width/height values.
- Updated BUILDING_2 specs (UI/model/engine) to document direct opening size controls, runtime clamping behavior, and legacy compatibility precedence.
