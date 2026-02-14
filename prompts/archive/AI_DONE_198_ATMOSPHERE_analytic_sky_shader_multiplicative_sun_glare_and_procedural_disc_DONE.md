DONE

#Problem

The current sun appearance has a few visual issues:

- Even with only the sun core enabled, a visible “ring”/edge is still present, suggesting the sun disc falloff (currently texture/SVG based) is producing a slope change/banding that reads as a ring when scaled and post-processed.
- The extended bright area around the sun in the sky should be larger and feel like atmospheric glare (not just a larger flat sprite).
- The current sky “sun glow” behavior can shift nearby sky hue (color changes) rather than reading as brightness-only.
- The intended sky gradient colors (from the previous sky-color prompt) appear darker in practice than expected, indicating a color-management / calibration mismatch (color space, tone mapping, exposure, grading).

# Request

Implement a simple analytic sky shader strategy that separates:

1) A stable sky baseline (vertical gradient + horizon haze),
2) A wide atmospheric sun glare term that preserves sky hue (multiplicative brightness),
3) A small hot sun disc rendered procedurally (shader-based) to eliminate the ring.

Tasks:
- Upgrade the sky dome shader (`src/graphics/assets3d/generators/SkyGenerator.js` / `createGradientSkyDome`) to include:
  - A baseline vertical gradient (zenith → horizon), plus an optional bottom “ground haze” band (2–3 color regions total).
  - A separate horizon haze term (controls: intensity, thickness, curve/falloff, optional tint).
  - A sun glare term based on angle between view direction and sun direction that applies as **multiplicative brightness** in linear space (e.g. `col *= (1.0 + glare)`), avoiding additive color shifts.
  - Parameters to control glare size and shape independently from the sun disc (so the bright region in the sky can be larger without inflating the disc).
- Replace the texture/SVG sun “disc” look with a **procedural disc** (shader-based) to remove the visible ring:
  - Use a smooth falloff curve (continuous derivative; e.g. Gaussian / exponential style) and optionally a 2-lobe model (tight hot core + wider soft disc).
  - Keep it neutral white by default (no tint), with an optional intensity scalar.
  - Optional subtle dithering/noise to reduce banding without visible texture.
- Preserve existing scene integration:
  - Keep `uSunDir` driven by the directional light, as it is today.
  - Ensure the upgraded sky still works in City, Inspector Room, Road Debugger, and other scenes that use `createGradientSkyDome`.
- Address the “sky colors are darker than expected” mismatch:
  - Verify and document the intended color space for authoring the sky colors (hex values) and how they map to on-screen appearance.
  - Add a simple calibration control (e.g. `skyIntensity` / `skyExposure`) and a debug toggle to render *baseline-only* (no haze, no glare) for quick A/B.
  - Ensure color grading/LUT and tone mapping behavior is intentional for the sky (avoid accidental double transforms or bypasses).
- Add atmosphere controls to in-game Options (gameplay):
  - Expose the key analytic-sky parameters (baseline gradient, haze, glare, sun disc intensity/size, skyIntensity/skyExposure, baseline-only debug toggle).
  - Add sun placement controls (azimuth + elevation) that drive the sun direction used by the sky and the scene’s directional light.
  - Ensure these options can be tuned live and affect all scenes that use the sky dome.
  - Ensure controls have sensible defaults and do not destabilize visuals (banding, overexposure) at typical ranges.
- Add atmosphere controls to the Atmosphere Debug tool (atmosphere-specific debugger):
  - Mirror the Options controls, plus any additional look-dev/debug-only toggles helpful for iteration (baseline-only, glare-only, disc-only, etc.).
  - Include sun placement controls (azimuth + elevation) for fast look-dev iteration.
  - Add a debug toggle to render a **pink ring** at the configured sun position/direction so it’s always obvious where the sun is, even when glare/disc are disabled or subtle.
  - Ensure the debug tool provides fast iteration for these parameters without requiring code edits.

Nice to have:
- Add a couple of analytic sky presets (e.g. “Clear”, “Hazy”) for quick iteration.
- Add debug UI toggles/sliders for glare/haze/disc sizing so tuning can be done in-app without code edits.
- Add a “brightness-only glare” mode that boosts luma while minimizing saturation shifts under strong glare.

## Quick verification
- View in scenes that show the sky + sun clearly:
  - Main city scene (daytime) and/or Inspector Room.
  - Toggle Bloom on/off and Sun flare core on/off to ensure the disc and glare are stable.
- Acceptance criteria:
  - With only the sun disc enabled, there is no obvious ring edge at typical camera distances and sizes.
  - The bright region around the sun is noticeably larger and reads as atmospheric glare (not a flat disk).
  - The glare brightens the sky without obvious hue shifts (sky retains its gradient character).
  - Baseline sky gradient colors match expectations once the chosen color-management path is finalized.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_198_ATMOSPHERE_analytic_sky_shader_multiplicative_sun_glare_and_procedural_disc_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added persisted atmosphere settings (sun + analytic sky) with URL overrides for fast iteration.
- Implemented an analytic sky dome shader: baseline gradient + horizon haze + multiplicative glare + procedural 2-lobe sun disc, plus exposure/dither controls and debug modes (incl. pink sun ring).
- Wired atmosphere settings through GameEngine and all sky-using scenes so sun direction + sky uniforms update live and sky visibility respects HDR background priority.
- Added Atmosphere controls to in-game Options and the Atmosphere Debug tool (mirrored look-dev controls + sun direction).
- Updated core browser tests to validate AtmosphereSettings defaults, URL overrides, and sky dome visibility rules.
