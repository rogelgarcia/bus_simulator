# Ambient Occlusion (AO)

## Modes

- `off`: Disabled
- `ssao`: Screen-space ambient occlusion (cheaper)
- `gtao`: Ground-truth ambient occlusion (cleaner; optional denoise)

## Planned AI 534 scope selection

Status: requested design, not implemented. See
[AI 534](../../prompts/AI_534_MATERIAL_baked_gi_and_ambient_occlusion_migration.md).
The accepted direct/indirect channels, AI 548 and existing engine are retained.

The AO section will distinguish **Scope: All / Dynamic Only** from the AO
method/enable control. A segmented selector uses the same section, with only the
selected scope's controls shown and each scope's settings preserved separately.
Off continues to disable supplementary AO; an automatic scope change must not
enable it. Do not expose a method in Dynamic Only unless its implementation
actually supports the promised separation.

| Scope | Additional runtime occlusion |
|---|---|
| All | Existing full-scene AO behavior, respecting alpha/receiver exclusions and the selected method. |
| Dynamic Only | Dynamic self-occlusion and dynamic/world interactions in both directions: the world can occlude the bus, and the bus can occlude nearby pavement or walls. No additional static-to-static occlusion. |

Valid, effective baked indirect lighting selects Dynamic Only by default.
Requested-but-loading, failed or incompatible indirect data must not prematurely
remove current AO. Direct-only baking does not select Dynamic Only. Disabling or
losing indirect coverage restores the preserved current-engine configuration.
All remains available as an explicit comparison override while indirect is
active. Implementation must define and test the persisted override lifecycle,
Options Save/Cancel/Reset, presets and reloading; the UI reports effective scope.

Dynamic classification comes from authoritative mobility/registration, not
velocity or mesh-name heuristics. A parked bus is still dynamic. Static scene
depth/geometry remains available as an occluder for dynamic receivers, and static
receivers still accept dynamic contact. A bus-only receiver mask would omit ground
contact; a screen region filled with ordinary full AO would still duplicate static
occlusion. The existing receiver exclusion renderer is reusable infrastructure,
not by itself a Dynamic Only implementation.

The default target is baked static indirect light plus supplementary dynamic
grounding. Validate that static creases and thresholds are adequately represented;
record unbaked/material-detail exceptions rather than masking bake deficiencies
with broad static AO. Audit static AO, material AO and the existing bus contact
blobs for overlap. AO affects the approved ambient/indirect composition and must
not add another sun shadow or disable either baked illumination channel.

Compare GI alone, GI + Dynamic Only, GI + All and current-engine AO at matched
poses/settings. Measure the complete depth/mask/AO/composition cost, not only
the smaller visible output area. Check moving-bus updates even with a stationary
camera, neighborhood contacts, off-screen limits, alpha handling, coverage loss,
history reset and repeated toggles before claiming quality or performance gains.

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

The optional baked-illumination composition and migration boundary is defined in `specs/graphics/illumination_framework.md`. A directional sun-depth cache or direct-light bake does not replace AO. AI 534 owns the measured decision for static AO, baked GI contact information, SSAO/GTAO, and bus grounding; until then `current` mode preserves this behavior exactly.

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

The selected handling mode is authoritative for foliage and other alpha-cutout materials. `alpha_test` uses the source cutout silhouette (including a dedicated `material.userData.aoAlphaMap` when supplied). `exclude` removes the cutout geometry from AO depth/normal passes and masks those visible pixels out of final SSAO/GTAO composition, so the material neither contributes to nor receives screen-space AO. Normal lighting and shadow-map rendering are unaffected by this AO-only setting.

### Exclusion-mask depth reuse

The exclusion mask runs immediately after the visible-scene render and reuses its resolved depth texture. It clears the mask to the normal AO value, submits only visible excluded receivers, depth-tests them against visible-scene depth, and leaves that retained depth unchanged. An empty receiver set skips the mask render entirely. This avoids redrawing opaque buildings, roads, props, and the bus merely to reconstruct mask depth.

Receiver classification is generic. A whole object can opt out of receiving AO with `object.userData.ambientOcclusionReceiver = 'exclude'` or `object.userData.excludeFromAmbientOcclusionReceiver = true`; legacy foliage metadata remains supported. Alpha-cutout materials in `exclude` mode are handled per material group, so mixed-material meshes preserve opaque and cutout group behavior. Source alpha maps, cutoffs, sides, and alpha-to-coverage are copied into the mask material.

The retained-depth path supports the normal SSAO/GTAO, TAA, resolved MSAA, resize, and device-pixel-ratio lifecycle. It automatically uses the correct legacy full-scene mask when a usable composer depth texture is unavailable. `?aoExclusionDepthReuse=0` forces that legacy path for visual or performance A/B testing; `=1` selects the optimized path. Runtime AO diagnostics report the selected strategy, fallback reason, receiver candidates, mask calls/triangles, render/skip state, and candidate-test time.

## Material tagging (foliage)

To ensure alpha-blended foliage participates in AO alpha handling, tag foliage materials:

- `material.userData.isFoliage = true`

Alpha-tested materials (`material.alphaTest > 0`) are automatically treated as alpha-cutout for AO, even without tagging.

## Visual-only scene geometry

Meshes that exist only to draw the environment or a screen-facing visual effect must not enter AO depth/normal buffers. Tag them with `object.userData.excludeFromAmbientOcclusion = true`. The sky dome, sun bloom, sun rays, and lens flare rigs use this tag so their sphere/billboard geometry cannot create polygon or card-shaped AO artifacts.

The AO foliage debugger uses the production `PostProcessingPipeline` with the resolved gameplay bloom, sun bloom, anti-aliasing, lighting, sky, and sun-visual rigs. `?sunAligned=1` provides the deterministic sun-behind-foliage regression view.
