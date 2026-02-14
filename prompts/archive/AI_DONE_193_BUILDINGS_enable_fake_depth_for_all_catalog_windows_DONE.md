DONE

#Problem

The building fabrication system includes a “Fake depth (parallax)” feature for windows, but the current building catalog configs do not have it enabled. As a result, shipped buildings look flatter than intended and don’t benefit from the fake-depth window effect that improves depth/realism.

# Request

Enable the window fake-depth feature for all windows across all buildings in the catalog.

Tasks:
- Identify where catalog building window configs are defined (all building configs/styles used by the building generator) and how window settings are applied.
- Update the catalog defaults so every building’s window configuration enables fake depth by default:
  - Set `windows.fakeDepth.enabled = true` for all relevant window configs.
  - Apply consistent default parameters (strength/inset/frameWidth/aspect handling) using sensible values aligned with the existing fabrication UI defaults.
- Ensure the change covers all catalog buildings (not only a subset):
  - Any building config that defines `windows` should get fake depth enabled.
  - If there are multiple window “typeId” variants, ensure they all support fake depth (and handle unsupported types gracefully).
- Verify the effect is visible and not overly strong:
  - Ensure no obvious UV swimming/artifacts occur during camera motion.
  - Confirm performance impact is acceptable (shader variant count and draw calls remain reasonable).
- Add a quick validation step (how to confirm fake depth is active in at least 2–3 representative buildings).

Nice to have:
- Add a single shared default fake-depth config constant so future catalog buildings inherit it automatically.
- Add a “catalog migration” note listing the configs updated and the chosen parameter defaults.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_193_BUILDINGS_enable_fake_depth_for_all_catalog_windows_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Catalog migration note
- Default applied: `windows.fakeDepth = { enabled: true, strength: 0.06, insetStrength: 0.25 }`.
- Updated configs: `brick_midrise`, `stone_lowrise`, `blue_belt_tower`, `gov_center` (both floor layers), `stone_setback_tower` (both floor layers).

## Quick validation
- Run `python3 -m http.server 8000`, open `index.html`, then press `5` (Building Fabrication).
- Load `brick_midrise`, `stone_setback_tower`, and `gov_center` from the `Load config` dropdown.
- In the Windows panel, confirm `Fake depth (parallax)` is enabled and you can see parallax while moving the camera.

## Summary (done)
- Enabled `windows.fakeDepth` for every catalog building layer with windows (inlined config, editor-style).
- Added a core test to prevent regressions.
