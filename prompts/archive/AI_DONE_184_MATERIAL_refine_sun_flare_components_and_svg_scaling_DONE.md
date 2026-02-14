DONE
#Problem

The current sun lens flare does not look natural. The “sun core waves” (halo/rings) are too strong, and their scale relationship to the core feels wrong. We also need more control over what flare components are rendered so we can dial in a subtle, believable look per scene/hardware.

# Request

Refine the sun flare visuals to be more natural and add customization options to choose which flare components are enabled.

Tasks:
- Redesign the sun flare into explicit components (at minimum: core, halo/waves, starburst, ghosting) so each can be enabled/disabled independently.
- Update the Options UI to let the user choose which flare components are active (use toggle-style controls, not a single checkbox).
- Make the “waves/halo” substantially more subtle (lower intensity/opacity, softer falloff) and much larger relative to the core so it reads as atmospheric bloom rather than a graphic overlay.
- Adjust the sun core artwork so the overall SVG asset can be scaled up ~4× while keeping the very center “hot core” the same apparent size (ex: separate inner/outer shapes, padding/viewBox changes, or layered sprites) so the halo can be large without inflating the central disk.
- Ensure changes are reflected live when tweaking Options (component toggles and sizes/strengths must visibly respond without needing a restart).
- Ensure the flare remains stable with camera motion (no distracting popping/jitter) and does not wash out the sky; keep bloom behavior independent and predictable.

Nice to have:
- Provide a couple of sensible presets (Off / Subtle / Cinematic) implemented as combinations of component toggles + tuned parameters.
- Add a small debug overlay/readout (optional) showing which components are enabled and their key parameters for quick tuning.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_184_MATERIAL_refine_sun_flare_components_and_svg_scaling_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Split sun flare into explicit components (core, halo/waves, starburst, ghosting) with per-component toggles in Options.
- Redesigned halo/waves to be larger and more subtle, and adjusted presets to avoid washing out the sky.
- Updated `sun_core.svg` scaling (4× padded SVG) and added `sun_halo.svg` for soft atmospheric halo; changes apply live.
