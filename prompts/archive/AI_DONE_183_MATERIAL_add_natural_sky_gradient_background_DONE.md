DONE
#Problem

The current sky/background color reads as unnatural. We want a more natural-looking blue sky gradient that is consistent and predictable across scenes.

# Request

Replace the current flat/unstyled sky background with a vertical gradient sky using these color stops:

- 0% → 10%: `#7BCFFF`
- 10% → 30%: `#31AFFF`
- 30% → 50%: `#1082E4`
- 50% → 100% (top): `#0B5AB0`

Tasks:
- Apply a sky gradient background in gameplay (and any other relevant scenes that currently use a flat background color) so the sky looks natural.
- Define “percent” in a clear, stable way (ex: screen-space vertical position or view-space up direction) so the gradient looks consistent as the camera moves/rotates.
- Ensure the gradient only affects the background/sky appearance (do not tint UI; do not unintentionally change environment lighting unless explicitly intended).
- Ensure the gradient plays nicely with fog and tone mapping (no odd banding, clipping, or washed-out look).
- If IBL background rendering is enabled (environment map used as background), ensure behavior is well-defined (ex: IBL background takes priority, or gradient can be forced on/off).
- Add a quick way to verify the gradient visually (documented steps or a small debug toggle) to confirm the stop positions and colors match the spec.

Nice to have:
- Automatically derive a matching fog color (or fog gradient) that blends naturally into the horizon portion of the sky gradient.
- Provide a simple config hook so future scenes can reuse the same sky gradient without duplicating setup.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_183_MATERIAL_add_natural_sky_gradient_background_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Updated `createGradientSkyDome()` to use the specified multi-stop natural sky gradient (with optional `?skyDebug=1` stop markers).
- Applied the new sky gradient defaults to gameplay + tool scenes that use the sky dome, and aligned fog/background behavior with IBL background priority.
- Documented visual verification steps in `README.md`.
