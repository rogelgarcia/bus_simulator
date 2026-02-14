DONE

#Problem

The graphics options currently support anti-aliasing modes: Off, MSAA, SMAA, and FXAA. MSAA 8× significantly improves thin distant geometry (especially lane/road markings at low viewing angles), but it is expensive. SMAA/FXAA are cheaper but don’t adequately address sub-pixel aliasing on those details.

We want to add a temporal anti-aliasing option (TAA / SMAA T2x) so users can get more stable results on thin distant features without requiring MSAA 8×.

# Request

Add a new temporal AA option (TAA / SMAA T2x) to the anti-aliasing system and expose tuning controls in the Options panel, while keeping the UI clean and consistent.

Tasks:
- Add a new AA mode to the anti-aliasing selector named `TAA` (or `SMAA T2x`) alongside Off/MSAA/SMAA/FXAA.
- Add a dedicated `TAA` configuration section in the graphics options UI with quality presets and a `Custom` option.
- Add tunable controls for `TAA` that let the user trade stability vs sharpness vs ghosting (no need to dictate specific implementation; focus on the user-facing outcomes).
- When the user selects an AA mode, only show the configuration section for that mode (hide sections for other AA modes).
- Move the MSAA samples control into a dedicated `MSAA` section (matching the existing SMAA and FXAA sections).
- Ensure AA switching does not alter the scene’s look when Bloom/Sun Bloom/Color Grading are disabled (no “fog/haze”, tint shifts, or other unintended grading changes).
- Ensure `TAA` works correctly with the existing post-processing pipeline, with and without Bloom/Sun Bloom/Color Grading enabled.
- Persist the new `TAA` settings using the same conventions as existing AA settings (local storage + any existing URL override patterns, if applicable).
- Provide sensible default `TAA` settings that meaningfully improve thin distant details (lane markings, crosswalks, small signs) while keeping blur and ghosting acceptable.
- Add/update tests and debug hooks to cover:
  - settings sanitization + persistence for the new `TAA` settings
  - mode selection behavior
  - a regression guard against AA-dependent color/atmosphere shifts

## TAA tuning outcomes to support
- History accumulation strength (stability vs responsiveness).
- Jitter amount/behavior (stability vs shimmer).
- Sharpening/resolve behavior (counteract blur).
- Ghosting/clamping controls (limit trails/afterimages).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_228_UI_add_taa_smaa_t2x_antialiasing_options_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (Implemented)
- Added a new `taa` AA mode with persisted settings + URL overrides.
- Updated post-processing pipeline to support temporal accumulation (history + clamp/sharpen) and camera jitter for TAA.
- Updated Options → Graphics → Anti-aliasing UI: MSAA moved into its own section; TAA section added; only the active AA section is shown.
- Added/updated tests: TAA settings sanitization/persistence, harness AA sky color regression now covers TAA, and harness AA mode selection coverage.
