DONE
#Problem

It’s hard to tune “atmosphere” (HDRI alignment, sun direction, exposure, bloom/flare interactions, material response) inside normal gameplay scenes because there’s too much going on. We need a dedicated, minimal look-dev scene (floor + reference spheres) that makes it obvious when lighting/IBL/tonemapping/post-processing are correct.

# Request

Create a new standalone “Atmosphere Debug” scene/page that is independent of the game runtime and uses a docked Options panel on the right for lighting controls.

Tasks:
- Add a new standalone entry point (separate from the game engine/state machine) that renders a simple Three.js scene for atmosphere/look-dev.
- Scene content:
  - A large floor plane using the PBR texture set `pbr.rocky_terrain_02` (proper color space, normal/roughness/metalness, and reasonable tiling).
  - Two reference spheres: one metallic and one glass-like (physically-based materials with sensible defaults).
  - Use the chosen HDR file as the environment/sky dome (background + environment lighting).
- Light alignment:
  - Place a directional “sun” light aligned to the HDR’s sun direction (use a deterministic method, e.g. sampling the HDR to find brightest direction, or a clearly-documented manual override if auto-detection is too complex).
  - Keep renderer tone mapping consistent with the rest of the project (ACES + exposure).
- Camera + controls:
  - Allow mouse camera movement consistent with other debug scenes.
  - Allow arrow-key movement (and/or WASD if already standard) while keeping controls responsive when the viewport is focused.
- UI layout (docked panel):
  - Use the existing Options-style panel for lighting parameters only (exposure, sun intensity, hemi intensity, IBL on/off, envMapIntensity, background toggle, etc.).
  - Dock the panel on the right (not an overlay): the viewport should occupy the remaining left space.
  - Ensure resizing the window updates layout correctly.
  - Options changes must apply live to the scene (no “restart” required).
- Isolation:
  - Do not use the game’s engine/state machine; build a minimal, separate renderer loop for this tool.
  - Reuse shared UI components/panels only (input capture should be limited to the docked panel; viewport input should remain available).

Nice to have:
- Add quick buttons/presets for common lighting setups (ex: “noon”, “golden hour”, “overcast”) that only affect the tool.
- Add a small HUD readout in the viewport (current HDR name, exposure, sun direction).
- Provide a simple way to swap HDRs/textures for A/B comparisons.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_182_TOOLS_atmosphere_debug_scene_with_docked_options_panel_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added standalone `atmosphere_debug.html` entry point with isolated renderer loop (no game engine/state machine).
- Implemented Atmosphere Debug look-dev scene (HDRI env + sun alignment, PBR floor, metallic + glass spheres).
- Added docked Options-style lighting panel and small in-viewport HUD with live updates.
