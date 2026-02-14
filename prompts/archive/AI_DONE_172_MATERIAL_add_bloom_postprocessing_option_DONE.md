# DONE

#Problem

The game currently renders scenes directly via the renderer without a post-processing pipeline, so there is no bloom/glow effect available. We want a bloom effect that can be toggled from the Options menu (opened with key `0` from the Welcome screen), so lighting/visual style can be adjusted without code changes.

# Request

Add an optional Bloom (glow) post-processing effect to the rendering pipeline and expose an enable/disable control in the Options menu.

Tasks:
- Add a Bloom toggle in the Options menu (key `0`) that enables/disables the bloom effect.
- When enabled, render via a post-processing pipeline (composer) that applies bloom on top of the normal render output; when disabled, preserve the existing render path and visuals.
- Ensure enabling/disabling bloom is safe at runtime (no crashes, no duplicated render passes, no resource leaks) and works consistently across game states/scenes that render 3D content.
- Ensure the post-processing pipeline responds correctly to viewport changes (resize, pixel ratio changes) and preserves the current camera/scene render.
- Configure tone mapping appropriately so bloom behaves correctly with bright values, while maintaining acceptable visual parity when bloom is disabled.

Nice to have:
- Expose Bloom parameters in Options as tunables (ex: strength, radius, threshold) with sensible defaults.
- Persist the Bloom setting (and tunables, if added) across sessions using the same mechanism as other Options settings.
- Add a minimal automated “smoke” check (or a debug overlay readout) that confirms whether bloom is active to simplify troubleshooting.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_172_MATERIAL_add_bloom_postprocessing_option_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added an optional bloom post-processing pipeline (EffectComposer + UnrealBloomPass) integrated into the engine render path (bloom sources prioritized; sky + road markings excluded from bloom contribution).
- Added persisted Bloom settings (enabled + strength/radius/threshold) with URL overrides (`bloom`, `bloomStrength`, `bloomRadius`, `bloomThreshold`).
- Exposed Bloom controls in the Options UI and set Bloom enabled by default; updated headless tests to disable bloom via URL for stable baselines.
