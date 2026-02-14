DONE

#Problem

We want to iterate on “sun-only bloom / glare” effects without turning on global bloom for the whole game. The desired look is: when the sun is partially occluded by geometry, the sun still produces a soft bloom/glare spill around the silhouette edge, but the rest of the scene remains unaffected.

We already have an Atmosphere Debug tool (HDR background + IBL look-dev scene). We need an isolated debug tool scene that makes it easy to test multiple sun bloom strategies side-by-side with fast iteration controls.

# Request

Create a standalone “Sun Bloom Debugger” tool based on the existing Atmosphere Debug scene, and add a dedicated UI tab for configuring and comparing sun bloom/glare variations (without blooming the entire game).

Tasks:
- Add a new standalone debug tool page under `debug_tools/` (peer to `debug_tools/atmosphere_debug.html`) and register it in `src/states/DebugToolRegistry.js`.
- Reuse the existing Atmosphere Debug scene baseline (sky/background, sun direction control, HDRI/IBL controls) so the environment stays consistent with current look-dev workflows.
- Add a docked Options-style UI with tabs:
  - **Atmosphere** tab: keep existing Atmosphere Debug controls (HDR background, IBL toggles, intensity, etc.).
  - **Sun Bloom** tab: new controls for sun-only bloom/glare experimentation.
- In the Sun Bloom tab, implement a “variation selector” that can switch between (at minimum) these approaches:
  - **Baseline (no bloom)**: sun disc + existing flare only.
  - **Selective bloom (sun-only)**: bloom applied only to a sun buffer/layer and composited onto the main scene.
  - **Analytic glare (sky shader)**: multiplicative brightness glare around the sun direction (no post bloom).
  - **Occlusion-aware variant**: any approach that responds when the sun is partially occluded (edge spill stays visible).
- Provide an occlusion test harness in the scene:
  - A simple occluder object that can be moved/rotated/scaled across the sun screen position (slider/drag) to test partial occlusion.
  - A few camera presets to reproduce the same “sun behind object by a little amount” setup quickly.
- Make tuning fast and safe:
  - Controls for intensity, radius/size, threshold (if applicable), falloff curve, and “brightness-only” mode.
  - A/B comparison helper (toggle, split view, or quick preset buttons) so changes are easy to evaluate.
- Add a quick verification checklist in the tool (or console instructions):
  - What “good” looks like (no global bloom, sun-only spill, stable sky hue, stable ring-free disc).

Nice to have:
- A one-click “partial occlusion” preset that positions the occluder to barely cover the sun.
- Simple debug overlays (show sun layer buffer, show occlusion mask, show glare term).
- A small performance readout (ms) for each variation to compare cost.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_199_TOOLS_sun_bloom_debugger_scene_with_variations_tab_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added a new standalone Sun Bloom Debug tool page and registered it in the Debug Tool registry.
- Implemented a tabbed Options-style UI (Atmosphere + Sun Bloom) with A/B variation toggling and safe tuning controls.
- Built a sun-only bloom pipeline (selective + occlusion-aware) using an isolated sun disc emitter layer and additive composite, plus a bloom-buffer debug view.
- Added an occluder harness (screen-space offset, scale, rotation, distance) and camera presets to quickly reproduce partial-occlusion cases.
