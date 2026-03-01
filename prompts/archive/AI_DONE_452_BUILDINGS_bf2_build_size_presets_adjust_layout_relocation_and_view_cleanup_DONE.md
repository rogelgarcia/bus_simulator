# DONE

## Problem

Building Fabrication 2 needs faster building footprint sizing controls and UI cleanup in the main/edit flow. Current placement of layout controls and debug toggles is not aligned with the desired workflow.

# Request

Update BF2 UI to add building size preset buttons near create actions, relocate layout adjustment controls, remove temporary debug toggles from view controls, and enable slab rendering by default.

Tasks:
- Under the `Create Building` button in BF2, add building footprint preset buttons:
  - `10x10`
  - `16x16`
  - `20x20`
  - `25x25`
  - `30x30`
  - `36x36`
- Each preset represents building size in meters and should resize the building footprint accordingly.
- Move `Adjust Layout` control from the right panel to the area below the footprint preset buttons.
- Remove the two debug toggles from the View panel (the suspect-isolation debug toggles).
- Set `Render slab` to enabled by default.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_452_BUILDINGS_bf2_build_size_presets_adjust_layout_relocation_and_view_cleanup_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_452_BUILDINGS_bf2_build_size_presets_adjust_layout_relocation_and_view_cleanup_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added six BF2 footprint preset buttons (`10x10`, `16x16`, `20x20`, `25x25`, `30x30`, `36x36`) under `Create Building`.
- Wired footprint presets to resize the active footprint to square meter sizes or create a new building at the selected size when none exists.
- Relocated `Adjust Layout` from the right-layer actions row to the fabrication panel directly below the footprint presets.
- Removed the suspect debug isolation toggles from the BF2 View panel so only production-facing view toggles remain.
- Changed BF2 slab view defaults so `Render slab` starts enabled when entering the scene.
- Updated BF2 core UI tests to validate new placement, footprint preset behavior, removed debug toggles, and slab default-on behavior.
