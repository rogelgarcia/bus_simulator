# Problem [DONE]

The game’s PBR materials (buildings, roads, vehicles, props) look too flat due to missing/insufficient image-based lighting (IBL). An HDR environment file has been added to the repository, but it is not currently loaded/applied by the game.

HDR file path: `assets/public/german_town_street_2k.hdr`

# Request

Load and apply the HDR as an environment map (IBL) so PBR materials gain believable lighting/reflections across the game.

Tasks:
- Add a shared IBL/environment loader utility that can:
  - Load the HDR file from `assets/public/german_town_street_2k.hdr`.
  - Generate a filtered environment map suitable for PBR lighting.
  - Apply it to the active Three.js scene in a way compatible with the project’s current renderer setup.
- Integrate IBL application into the game startup flow so that:
  - The environment map is applied on first entry (no “first render black” or requiring a state toggle to appear).
  - All scenes that use PBR materials (welcome/setup/gameplay/debuggers/inspectors) consistently receive the environment lighting, unless a scene explicitly opts out.
  - The scene background behavior is preserved (do not force the HDR as background unless explicitly desired).
- Add configuration knobs that make iteration easy:
  - A single place to adjust global `envMapIntensity` defaults (or equivalent) so materials aren’t overly shiny.
  - A way to disable/enable IBL for debugging/performance if needed.
- Ensure correct color-space behavior:
  - HDR/environment must be treated as lighting data (not sRGB albedo).
  - Do not regress existing sRGB output/tone mapping settings in the renderer.
- Performance considerations:
  - Avoid reloading/regenerating the environment map repeatedly per frame or per state transition.
  - Reuse/caching should ensure switching scenes doesn’t create multiple identical environment textures.
- Add a lightweight verification checklist:
  - Buildings and buses show subtle specular response and shading variation (not flat).
  - Switching scenes does not lose the environment lighting.
  - No console errors from loader imports or missing assets.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_77_load_hdr_ibl_environment_map_into_game_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Verification checklist:
- Buildings and buses show subtle specular response and shading variation (not flat).
- Switching scenes does not lose the environment lighting.
- No console errors from loader imports or missing assets.

Summary: Loaded the HDR as a cached PMREM IBL environment, applied it during engine startup (without forcing background), and added global intensity + URL toggles (`ibl`, `iblIntensity`, `iblBackground`).
