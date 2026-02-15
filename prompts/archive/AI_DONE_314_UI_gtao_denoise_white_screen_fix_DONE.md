# DONE

## Summary
- Reproduced/documented the root cause path: GTAO denoise was mapped to `GTAOPass.OUTPUT.Denoise` in `PostProcessingPipeline`, which is a visualization output path.
- Refactored GTAO runtime so normal denoise keeps normal composed rendering (`OUTPUT.Default`) and moved visualization behavior behind a dedicated `gtao.debugView` debug toggle.
- Added denoise/debug fallback handling with explicit warnings when denoise controls or debug output are unavailable or fail at runtime.
- Updated options/settings wiring (defaults, sanitization, draft/preset serialization, UI labels/status) so denoise and debug behavior are unambiguous and persisted.
- Added deterministic unit coverage for denoise-vs-debug policy behavior and AO setting persistence/sanitization.
- Updated `specs/graphics/ambient_occlusion.md` to document GTAO denoise semantics, debug visualization, and fallback behavior.

#Problem

Enabling **GTAO denoise** does not currently behave as a pure denoise quality option for the final scene render. Instead, the current behavior exposes a GTAO/filter-style output that is useful for inspection, but confusing for normal gameplay usage under a setting named only "denoise."

We want to preserve that interesting visualization behavior as an explicit debug capability, while making the normal GTAO denoise toggle perform true denoised AO integration in the final composed image.

# Request

Refactor GTAO denoise behavior so:
- normal AO settings use denoise as a true quality/composition feature (final scene remains normal),
- and the existing GTAO/filter output visualization is retained as a dedicated debug feature.

Tasks:
- Reproduce current behavior deterministically:
  - Enable GTAO and denoise and confirm current output behavior.
  - Document which path currently produces visualization-style output.
- Implement intended denoise behavior for normal rendering:
  - Enabling GTAO denoise must produce a denoised AO result in the final scene composition, not a debug/filter visualization output.
  - Ensure AO intensity/radius/quality controls still behave correctly with denoise enabled.
- Preserve the current visualization behavior as debug:
  - Add a dedicated debug control/mode for GTAO output inspection (naming and placement implementation-defined).
  - This debug feature should intentionally expose the GTAO/filter-style view without affecting default gameplay expectations.
- Ensure safe runtime fallback:
  - If denoise cannot run (missing buffers, unsupported features, runtime errors, etc.), automatically fall back to stable non-denoised GTAO.
  - Emit an explicit warning in console/dev logging when fallback happens.
- Update options UX text/labels as needed so behavior is unambiguous:
  - "GTAO denoise" should clearly map to denoised final rendering.
  - Debug visualization should be clearly marked as debug/inspection.
- Add regression coverage:
  - A deterministic test or sanity check that confirms GTAO denoise does not break/overwrite normal scene composition.
  - A deterministic test or sanity check that confirms debug output visualization mode is available and functional.

Constraints / notes:
- Keep SSAO behavior unchanged.
- Keep GTAO (non-denoise) behavior unchanged except for shared fixes required to support correct denoise/debug separation.
- The solution must work with the current Three.js `GTAOPass` implementation used by the repo.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_314_UI_gtao_denoise_white_screen_fix_DONE.md`
- Do not move to `prompts/archive/` automatically
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
