# DONE

# Problem

In Building Fabrication 2, enabling the floor interior with shadows can produce a visible wave-like wall artifact. Interior enable/disable behavior is also inconsistent: sometimes it cannot be re-enabled after turning off, sometimes it cannot be turned off, and sometimes the toggle appears on while no interior is rendered.

# Request

Revise Building Fabrication 2 interior generation and interior toggle state handling so the interior feature is visually stable and deterministic.

Tasks:
- Remove the wave/shimmer artifact triggered by interior + shadows, ensuring interior/wall geometry and shadowing do not create overlap artifacts (including applying a small interior shrink/offset strategy, such as 1 cm, if needed).
- Make interior enable/disable fully reliable across repeated toggles, with no stuck states.
- Keep UI toggle state, runtime state, and rendered interior meshes synchronized at all times.
- Ensure disabling interior always removes/hides interior geometry, and re-enabling always restores it in the same session.
- Keep the fix scoped to Building Fabrication 2 and avoid regressions to existing non-interior behavior.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_433_BUILDINGS_building_fabrication2_interior_shadow_wave_and_toggle_reliability_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_433_BUILDINGS_building_fabrication2_interior_shadow_wave_and_toggle_reliability_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Fixed BF2 floor-interior toggle reliability by forcing immediate UI/model sync when interior enabled state changes, preventing stale button closure state and stuck toggles.
- Removed interior shadow wave risk by applying a small (`0.01m`) inset to the generated interior shell loop, with a safe fallback to the original loop if inset degenerates.
- Added/updated regression coverage in `tests/core.test.js` for interior toggle UI-sync behavior and interior shell inset geometry, and updated BF2 UI/engine specs to document deterministic toggle behavior and inset requirement.
