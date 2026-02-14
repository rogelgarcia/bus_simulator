#Problem

There is a blue-ish tint affecting distant objects (roads, trees, buildings) when the camera is at a low angle relative to the ground. This is visible in gameplay and the city debugger, and it persists even after toggling available Options settings. The tint does **not** appear in the Atmosphere debugger (confirmed), suggesting the cause is likely a city/gameplay-specific rendering step (fog, background/sky, post-processing, or material-level distance effects).

Additional observation: in the City view, simply zooming out is enough to notice the whole map gradually shifts toward a bluish tint as distance increases.

# Request

Investigate and fix the blue distance tint so distant scene colors remain natural/consistent across gameplay, city debugger, and atmosphere debug views.

Tasks:
- Reproduce the issue reliably:
  - Identify exact camera conditions that trigger it (low pitch angle, distance range, time-of-day/lighting preset, IBL on/off).
  - Capture before/after screenshots and note the active scene + settings.
- Isolate the source of the tint:
  - Compare rendering setup between gameplay/city debugger and the Atmosphere debugger (scene fog, background/sky, post-processing pipeline, renderer settings).
  - Check for global fog/atmosphere effects (fog color/near/far, height fog, distance haze) that could bias toward blue.
  - Check post-processing stages (bloom, color grading, tone mapping exposure) to confirm none are implicitly enabled or applied differently in gameplay/city.
  - Check material shaders (roads/trees/buildings) for any “distance tint” or “haze” logic that could be angle-dependent.
- Fix the root cause:
  - If it’s fog/atmosphere: adjust the fog model or color so it blends naturally (ideally derived from sky/horizon color) and is not overly blue.
  - If it’s post-processing coupling: ensure toggles truly disable stages and the pipeline updates live.
  - If it’s material-level: make the distance effect physically plausible, subtle, and consistent across materials (or remove it if it’s not needed).
- Ensure behavior is consistent:
  - Gameplay, city debugger, and atmosphere debugger should use the same “sky/fog/postprocess” defaults (unless intentionally different and documented).
- Add a regression test (headless):
  - Create a minimal deterministic harness scenario with a large **white** floor plane and a few simple objects.
  - Render from a low-angle camera and a higher-angle camera using the same exposure/tonemapping.
  - Sample pixels in the far region and assert the average color does not shift significantly toward blue (define an explicit threshold).
  - Store any screenshot/diff artifacts under `tests/artifacts/` and keep baselines/specs committed per `TESTING_RULES.md`.

Nice to have:
- Add a debug readout overlay that prints the active fog params (color/near/far/height) and active post-processing stages, so it’s easy to diagnose future tints.
- Add an option to temporarily visualize fog contribution (dev-only) to confirm whether the tint is fog-driven.
- Create an additional isolated “tint isolation” debugger screen with focused toggles (fog on/off, sky background on/off, post-processing stages on/off, material distance effects on/off) to quickly identify the effect causing the tint.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_201_MATERIAL_investigate_blue_distance_tint_at_low_camera_angles_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
