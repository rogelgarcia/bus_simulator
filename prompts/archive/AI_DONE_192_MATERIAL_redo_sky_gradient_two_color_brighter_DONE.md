DONE

#Problem

The current sky gradient background is too dark and makes the scene feel less natural/bright. The previous multi-stop gradient approach is more complex than needed for the desired look.

# Request

Redo the sky background from `AI_183` as a simpler, brighter 2-color vertical gradient:

- Horizon color (0° / horizon): **TBD (brighter)**
- Zenith color (90° / straight up): **TBD (brighter)**

The current color used for horizon, use in zenith.. and create a new horizon much brighter. 

Tasks:
- Replace the existing sky/background implementation from the prior sky gradient work with a two-stop gradient (horizon → zenith).
- Define the gradient mapping clearly and stably (screen-space vertical or view-space “up” mapping) so it looks consistent as the camera moves/rotates.
- Ensure the result is brighter overall than the current sky (avoid the “too dark” look) and does not introduce visible banding.
- Ensure the gradient affects only background/sky appearance (do not tint UI; do not unintentionally change environment lighting unless explicitly intended).
- Ensure the sky plays nicely with fog and tone mapping (ACES + exposure): no clipping, washed-out horizon, or sudden transitions.
- Define clear behavior when IBL background rendering is enabled (environment map as background):
  - Decide priority (IBL background vs gradient) and make it configurable if needed.
- Make the two colors easy to tweak:
  - Centralize them in one config location (and/or allow URL params/dev toggles) so dialing in brightness and hue is fast.
  - Provide a quick verification step (where to look + how to confirm the two colors are correct at horizon/zenith).

Nice to have:
- Add an optional “curve” parameter (ease/gamma) to control how quickly the gradient transitions from horizon to zenith without adding more color stops.
- Optionally derive a matching fog color from the horizon color for a more cohesive atmosphere.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_192_MATERIAL_redo_sky_gradient_two_color_brighter_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Replaced the multi-stop sky shader with a brighter 2-color (horizon → zenith) gradient plus optional curve and subtle dithering to reduce banding.
- Centralized sky tuning + URL overrides (`skyHorizon`, `skyZenith`, `skyCurve`, `skyDither`, `skyFog`, `skyFogFromHorizon`) and added `skyBg` to choose IBL background vs gradient priority.
- Updated City + fabrication/road debugger scenes to use the shared sky settings for fog + sky visibility, and added core tests for the new settings + IBL visibility behavior.
