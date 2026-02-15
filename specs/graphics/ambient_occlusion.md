# Ambient Occlusion (AO)

## Modes

- `off`: Disabled
- `ssao`: Screen-space ambient occlusion (cheaper)
- `gtao`: Ground-truth ambient occlusion (cleaner; optional denoise)

## GTAO denoise + debug visualization

Setting: `ambientOcclusion.gtao`

- `denoise`:
  - Controls denoising quality for normal GTAO composition (final scene stays normally composed).
  - If denoise support is unavailable at runtime, the renderer falls back to stable non-denoised GTAO and emits a warning.
- `debugView`:
  - Inspection-only mode that intentionally shows GTAO denoise/filter output.
  - This is separate from normal denoise quality behavior and is not intended for gameplay view.

## GTAO update / caching

GTAO can be amortized by skipping expensive compute on some frames and reusing the last valid GTAO output.

Setting: `ambientOcclusion.gtao.updateMode`

- `every_frame` (default): Update GTAO every frame (highest cost, best responsiveness).
- `when_camera_moves`: Update GTAO only when the camera view state changes beyond thresholds.
- `half_rate`: Update GTAO every 2 frames.
- `third_rate`: Update GTAO every 3 frames.
- `quarter_rate`: Update GTAO every 4 frames.

Setting: `ambientOcclusion.gtao.motionThreshold` (used only when `updateMode = when_camera_moves`)

- `positionMeters`: minimum camera translation to trigger an update.
- `rotationDeg`: minimum camera rotation (angle delta) to trigger an update.
- `fovDeg`: minimum FOV change to trigger an update.

Notes:
- When updates are skipped, the compositor reuses the last GTAO result (AO does not “turn off”).
- Resizing / pixel ratio changes force a GTAO refresh and reset the cached result.

## Static AO

Static AO is a baked, stable occlusion term applied in materials for static world geometry (roads/sidewalks/buildings). It is stored per generated mesh instance in geometry attributes (not in shared texture sets).

Setting: `ambientOcclusion.staticAo`

- `mode`: `off` or `vertex`.
- `intensity`: strength multiplier in `[0, 2]`.
- `quality`: `low` / `medium` / `high` (implementation-defined cost/quality tradeoff).
- `radius`: ground falloff radius in meters.
- `wallHeight`: wall base falloff height in meters.
- `debugView`: render static AO factor as grayscale (validation).

Generation / invalidation:
- Baked on demand when enabled, and re-baked when `quality`, `radius`, or `wallHeight` changes, or when the city is regenerated.
- If building geometry changes at runtime (e.g., fabrication edits), force a re-bake by toggling Static AO mode or changing one of the bake parameters.

Composition with SSAO/GTAO:
- Static AO is applied first (material ambient occlusion).
- When Static AO is enabled, SSAO/GTAO intensities are automatically scaled down to reduce double-darkening.

## Bus contact shadow

The bus contact shadow is a cheap, bus-only grounding cue rendered as a small set of soft blobs under the wheels and chassis. It is independent of the AO mode and can be used even when `ambientOcclusion.mode = off`.

Setting: `ambientOcclusion.busContactShadow`

- `enabled`: toggle.
- `intensity`: opacity multiplier in `[0, 2]`.
- `radius`: blob radius in meters.
- `softness`: edge falloff in `[0.02, 1]` (higher = softer).
- `maxDistance`: fade out when the bus is airborne (measured as wheel-center → ground distance beyond wheel radius).

## Alpha foliage handling

AO uses depth/normal buffers that can treat alpha-cutout geometry (leaf cards, fences, etc.) as solid quads unless alpha is handled explicitly. This can cause “phantom occlusion” in visually transparent pixels.

Setting: `ambientOcclusion.alpha`

- `handling`
  - `alpha_test` (default): Render AO depth/normal using alpha-test so fully transparent pixels do not contribute to AO.
  - `exclude`: Exclude alpha-cutout/foliage geometry from AO depth/normal.
- `threshold` (only for `alpha_test`): Alpha-test cutoff in `[0.01, 0.99]` (default `0.5`).

## Material tagging (foliage)

To ensure alpha-blended foliage participates in AO alpha handling, tag foliage materials:

- `material.userData.isFoliage = true`

Alpha-tested materials (`material.alphaTest > 0`) are automatically treated as alpha-cutout for AO, even without tagging.
