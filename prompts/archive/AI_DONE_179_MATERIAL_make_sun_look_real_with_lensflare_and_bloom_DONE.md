# DONE

#Problem

The sun currently reads as an artificial bright spot (a blurry/flat white circle) rather than a convincing light source. We want the sun to feel “camera-real”: a white-hot core that blooms into the sky, plus subtle lens artifacts (starburst/ghosting) that track correctly with camera motion.

# Request

Make the sun look like a realistic light source by combining bloom with a Three.js lens flare attached to the sun directional light.

Tasks:
- Add a sun visual effect that follows the directional “sun” light and renders lens flare elements (starburst + subtle ghosting) in a stable, non-distracting way.
- Load lens flare textures as project assets (follow asset rules; prefer `assets/public/` if they’re shareable) and ensure paths work with the existing CDN/import-map runtime (no bundling requirement).
- Ensure the effect works with the current tone mapping setup (ACES) and integrates with bloom so the sun core “bleeds” naturally into the sky instead of looking like a flat white disk.
- Ensure the flare respects camera movement and visibility (no obvious popping; avoid flares when the sun is not in view or is occluded if feasible).
- Keep performance reasonable: minimal draw overhead, avoid large textures by default, and allow the effect to be disabled.
- Expose a toggle (and basic strength controls if appropriate) in `OptionsState` (via `OptionsUI`) so players can enable/disable or adjust the effect.
- Add a small developer note describing how to tune the look (which textures/presets, sizes, strengths) and how to verify it visually.

Nice to have:
- Align the directional light’s apparent sun direction with the active IBL/sky background when applicable, so the “sun” feels consistent with the environment.
- Provide a couple of presets (subtle vs cinematic) without requiring code changes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_179_MATERIAL_make_sun_look_real_with_lensflare_and_bloom_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a sun lens flare rig (core + starburst + ghosting) driven by the directional sun light direction and faded when off-screen.
- Added shareable flare textures under `assets/public/lensflare/` and a small tuning doc at `docs/sun_flare_tuning.md`.
- Added persisted Sun Flare settings (enabled, preset, strength) with URL overrides, plus Options UI controls to configure it.
