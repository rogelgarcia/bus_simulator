DONE

# Problem

Window Debugger currently supports window and door authoring flows, but lacks a garage-specific mode with the required geometry, tabs, and state behavior.

# Request

Add a `Garage` option to Window Debugger (alongside existing Window/Door) with a simplified garage-specific UI and open/closed facade behavior, including wall cutting and deep interior-room generation when open.

Tasks:
- Add `Garage` as a creation option in addition to existing `Window` and `Door` in Window Debugger.
- For `Garage`, remove/omit the glass workflow (no Glass tab).
- Add a garage facade state control in a Facade tab: `Open` / `Closed`.
- In the same Facade tab, allow selecting garage closed-surface material (metal) for the `Closed` state.
- `Closed` state behavior:
  - render the closed garage surface using selected metal material.
- `Open` state behavior:
  - cut the wall at the garage opening.
  - generate an internal room volume behind the opening.
  - apply internal room material as `Concrete layers 2`.
  - room depth must be `50%` of the available building depth.
  - room footprint/clearance must extend beyond garage opening limits in width and height.
- Keep frame support for garage openings.
- For `Garage`, remove/disable these feature paths:
  - muntins
  - arches
  - shade option
  - decoration options
- Ensure switching between `Open` and `Closed` updates geometry/materials cleanly with no stale meshes or UI artifacts.
- Preserve existing non-garage window/door behavior.
- Update relevant specs under `specs/windows/` and/or `specs/buildings/` for garage mode, tab model, and open/closed behavior.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_415_WINDOWS_window_debugger_garage_option_open_closed_with_room_cut_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_415_WINDOWS_window_debugger_garage_option_open_closed_with_room_cut_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added `garage` as a first-class window fabrication asset type and exposed it in build-mode options/tests.
- Added a garage-only `Facade` tab with `Open/Closed` state and closed-panel metal material picker, plus garage-mode UI/tab gating for unsupported features.
- Implemented garage rendering behavior in the debugger view: closed metal panel, open wall cut + concrete interior room at 50% depth with expanded footprint.
- Updated relevant specs to document garage opening kind behavior, facade controls, and debugger open/closed garage flow.
