DONE

#Problem

The current `sun_core.svg` uses multiple nested gradients (internal + external) that create a clearly visible circular edge around the sun core. This reads as an artificial “ring” rather than a natural white-hot sun core with a smooth falloff.

# Request

Redesign the sun core SVG so it uses a simple three-stage radial falloff without a visible ring:

1) A small solid white circle (hot core).
2) A medium radius region where the white fades to ~50% opacity.
3) A large radius region where the white fades smoothly to 0% opacity.

Tasks:
- Update `assets/public/lensflare/sun_core.svg` to implement the three-stage falloff described above.
  - Use a single smooth radial gradient (or layered shapes) that avoids banding/rings and removes the hard visible edge.
  - Keep the center fully white (no tint), and ensure opacity falloff is smooth.
- Ensure the new core looks correct when used in the sun flare rig:
  - No obvious ring at typical sizes.
  - Works well with bloom and tone mapping (does not create a flat disk).
- If needed, adjust the sun flare rig’s sizing defaults so the hot core stays small while the outer falloff provides the soft glow.
- Provide a quick verification step (where to view the sun flare and what “good” looks like).

Nice to have:
- Add a subtle dithering/noise to the outer falloff (very subtle) to reduce gradient banding on low-bit displays, without introducing visible texture.
- Create a second “softer” variant SVG (optional) if we want to A/B test.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_195_MATERIAL_redesign_sun_core_svg_three_stage_radial_falloff_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Verification (quick)
- In-app: open the Options panel → Lighting/Atmosphere section → enable `Sun flare` (preset `Subtle`).
- Look at the sun at typical gameplay distances (not zoomed all the way in): the core should read as a small white-hot center with a smooth, natural falloff (no obvious circular “ring” edge).

## Summary of changes
- Replaced `assets/public/lensflare/sun_core.svg` with a single white radial gradient using a three-stage opacity falloff (no tint, no nested gradients).
- Added optional A/B asset `assets/public/lensflare/sun_core_soft.svg` with a softer falloff curve.
