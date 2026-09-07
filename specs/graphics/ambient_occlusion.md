# Ambient Occlusion (AO)

## Modes

- `off`: Disabled
- `ssao`: Screen-space ambient occlusion (cheaper)
- `gtao`: Ground-truth ambient occlusion (cleaner; optional denoise)

## AI 534 scope selection

The AO section has **Scope: All / Dynamic Only**. All retains Off / SSAO / GTAO,
static AO and the legacy contact-blob controls. Dynamic Only has an Off / On
control for **Dynamic AO**, its own intensity, radius, GTAO quality and factor
view, plus the common alpha policy. **Bus grounding: Underbody / GTAO** selects
the analytic floor approximation or the generic screen-space path for the bus.

Compatible indirect lighting selects Dynamic Only after its channel is effective
and the first-activation fade completes. Loading, rejected data, and direct-only
lighting keep the live scope. Losing indirect coverage restores that scope and
its unchanged controls. Both baked channels, AI 548 and the current engine remain
available. AO never changes their settings, resource identity or source hashes.

The existing `bus_sim.ambientOcclusion.v1` record now also stores:

- `scope`: live/direct-only scope, default `all`.
- `indirectScope`: effective-indirect scope, default `dynamic`. Choosing All while
  indirect is active changes this preference, so it survives Save and reload.
- `allMethod`: last enabled All method, retained across Dynamic Off / On.
- `dynamic`: `busMethod: 'analytic'`, intensity `1`, radius `1.5 m`, quality
  `medium`, debug view `false`. `busMethod: 'gtao'` enables the comparison path.
  Low / Medium / High request 8 / 16 / 32 GTAO samples (Three rounds these into
  complete directional steps); the analytic rectangle does not use sample rays.

The existing `mode` remains the master enable and All method. Scope selection
never enables Off. All and Dynamic parameter banks are independent. Save, preset
export/import and reload serialize both preferences and banks. Cancel restores
the entry snapshot; Reset restores the defaults above. The UI displays the
current effective scope and explains which lighting context owns its preference.

Dynamic classification comes from `getDynamicIlluminationObjects()`, including
the parked bus, rather than velocity or mesh names. The method composes:

- Bus-to-ground contact from the cosine-weighted form factor of an explicit
  downward floor rectangle in root-local coordinates. Ground clearance and
  lateral distance fade the term. It remains stable off screen and does not
  project the whole bus volume onto nearby walls. The optional `aoUnderbody`
  registry descriptor is fitted from the loaded bus floor; it is not inferred
  for arbitrary registered objects.
- Actual Three GTAO plus Poisson denoise on half-resolution, alpha-aware depth
  for dynamic self/world contact. Non-bus objects use this generic method.
  Geometry outside expanded participant bounds is omitted from depth rendering.
- Generic dynamic-to-static contact uses paired GTAO results with and without
  generic casters. Their visibility ratio removes existing static-to-static AO.
  Both passes use identical denoise noise. The extra depth/GTAO pair is skipped
  when only analytic bus casters are present.
- The maximum of these terms, normalized by intensity and clamped to a remaining
  ambient factor of `[0.1, 1]`. This multiplies indirect diffuse/specular after
  authored material AO. As requested, supplementary AO fades out when direct
  diffuse dominates indirect diffuse (ratio 0.1 to 0.5). This is an artistic
  direct-light-priority policy, not a claim that physical occlusion vanishes in
  sunlight. Direct sunlight, sun visibility and emission are unchanged.

Dynamic Only suppresses the legacy broad static AO and contact blobs in the
**effective** configuration, preserving their saved settings. It uses bounded
depth with fullscreen GTAO evaluation and no exclusion-mask pass. All keeps the shipped
AI 524 retained-depth mask and its AI 525 selected architecture.

See [AI 534 composition and validation](illumination_534_ao.md) for limitations,
contribution disposition, tests, bus geometry audit, captures and measurements.

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

The optional baked-illumination composition is defined in [AI 534](illumination_534_ao.md). A directional sun-depth cache or direct-light bake does not replace AO. All retains the existing static AO path; Dynamic Only suppresses it and relies on accepted indirect lighting for broad static occlusion.

## Bus contact shadow

The bus contact shadow is a cheap, bus-only grounding cue rendered as a small set of soft blobs under the wheels and chassis. In All scope it is independent of the AO mode and can be used even when `ambientOcclusion.mode = off`. Dynamic Only suppresses this overlay and uses ambient-only dynamic contact instead.

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
