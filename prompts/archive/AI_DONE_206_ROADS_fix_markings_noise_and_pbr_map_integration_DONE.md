# DONE - Problem

The “extra noise on road markings” feature (from `AI_DONE_188_ROADS_toggle_apply_asphalt_noise_to_road_markings_DONE`) appears to have no visible effect. Markings still do not pick up the same asphalt material response (roughness/normal variation), so they look pasted-on and too clean. We also need clear, effective tuning controls for this behavior in the Options panel.

# Request

Fix the road-markings noise/PBR integration so markings can inherit subtle asphalt variation (especially roughness/normal response), and expose tuning controls in the Options Asphalt tab.

Tasks:
- Reproduce and confirm the issue:
  - Toggle the existing “apply asphalt noise to markings” setting on/off and verify it currently produces no visible change.
  - Identify which rendering path the markings use in gameplay/city (mesh overlay vs baked texture vs shader layer) and where the intended noise modulation is supposed to happen.
- Ensure markings receive asphalt variation in a visually meaningful but subtle way:
  - Apply roughness variation to markings (primary realism lever) and optionally very subtle albedo modulation.
  - Ensure markings also respond to normal variation appropriately (either by sharing the asphalt normal map where plausible or by adding a compatible “micro normal” so spec highlights aren’t unnaturally flat).
  - Keep readability: defaults should remain legible at distance and not become muddy.
- Verify the plumbing:
  - Ensure uniforms/defines used by the noise system actually update live when toggled.
  - Ensure the shader injection path runs for the markings material(s) used in gameplay/city (not only in a debugger scene).
  - Ensure the markings path isn’t bypassing PBR (e.g. MeshBasicMaterial / unlit pass) where noise would be invisible.
- Add/confirm Options controls (Asphalt tab):
  - A toggle for “Apply asphalt variation to markings”.
  - Strength sliders for markings modulation (at minimum roughness strength; optional albedo strength), with defaults lower than asphalt.
  - Any debug readout/visualization needed to confirm the feature is active (optional).
- Add a regression check:
  - Prefer a headless scenario or deterministic debug scene that renders a road segment with markings and asserts there is a measurable difference in appearance when the toggle is on vs off (pixel sampling or screenshot diff with tolerance).

Nice to have:
- Add a “markings PBR mode” switch (share asphalt normal vs independent micro-normal) if needed to keep highlights believable.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_206_ROADS_fix_markings_noise_and_pbr_map_integration_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary

- Markings noise now works even when asphalt fine roughness is disabled (uses the generated fine roughness texture as the source signal).
- Lived-in asphalt overlays (cracks/patches/tire wear) now render even when coarse albedo/roughness toggles are off.
- Markings meshes now include world-space UVs and can inherit the asphalt fine normal map when the feature is enabled.
- Added a deterministic harness scenario + Playwright regression test asserting a measurable pixel diff when toggling markings asphalt-noise on/off.
