#Problem

Enabling **GTAO denoise** in the game’s Ambient Occlusion options causes the screen to become white (or nearly white), effectively breaking rendering whenever denoise is enabled.

This appears to be specific to the GTAO denoise path (not GTAO default and not SSAO), suggesting a bug in how the denoise output is configured, blended, or composed in the post-processing pipeline.

# Request

Fix the GTAO denoise white-screen bug so that enabling denoise produces a valid denoised AO result (or safely falls back without breaking the scene).

Tasks:
- Reproduce the issue deterministically:
  - Enable GTAO, toggle denoise on, and confirm the white-screen behavior.
  - Identify whether the issue is universal or depends on resolution, quality preset, browser/GPU, or scene content.
- Investigate the post-processing AO pipeline configuration and determine why denoise produces a white output:
  - Verify GTAOPass output mode selection and blending behavior.
  - Verify required textures/buffers (depth/normal) are present and valid for the denoise stage.
  - Check for NaNs/infs or uninitialized render targets in the denoise shader path.
  - Confirm the pass ordering in the EffectComposer is correct when GTAO is enabled.
- Implement a correct denoise integration:
  - Ensure denoise output is composed correctly (no full-screen overwrite) and blended with the main scene as intended.
  - Ensure the denoise path respects intensity and does not clip to white.
- Add safe fallback behavior:
  - If denoise cannot run (missing buffers, unsupported features, runtime shader compile error, etc.), automatically fall back to non-denoised GTAO rather than breaking the frame.
  - Emit an explicit warning in console/dev logging when fallback happens.
- Update the Ambient Occlusion options UI behavior if needed:
  - If denoise is not supported in the current runtime environment, disable the toggle and show a short note (implementation-defined).
- Add a regression check:
  - A deterministic test or debug-mode sanity check that verifies enabling GTAO denoise does not produce an all-white frame.
  - The check can be headless or tool-driven (implementation-defined), but must be repeatable.

Constraints / notes:
- Keep SSAO behavior unchanged.
- Keep GTAO (non-denoise) behavior unchanged except for any shared fixes required to support denoise correctly.
- The solution must work with the current Three.js `GTAOPass` implementation used by the repo.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_314_UI_gtao_denoise_white_screen_fix_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
