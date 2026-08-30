# DONE

# Problem

The completed V1 Grass Lab uses grass geometry and card atlases that are brighter, greener, and less physically coherent than the turf surface below them. Some baked cards are also displayed at runtime dimensions that do not match their bake dimensions, and their alpha coverage collapses through mip levels. At distance this exposes isolated bright blades, pixels, and card silhouettes instead of one cohesive grass layer.

# Request

Create one corrected V2 grass appearance family in the dedicated Grass Lab. The far maintained-turf surface is the visual reference; every later mesh, billboard, patch, and localized accent must inherit its color and PBR response. Keep this prompt offline and do not change grass placement, coverage boundaries, LOD policy, or gameplay.

This is step 9 of the offline-first grass sequence and the first corrective prompt after the historical V1 work in AI 350 through AI 357.

Tasks:
- Capture native `3840x2160` pre-correction references with repeatable camera, lighting, exposure, and quality metadata before replacing any V1 appearance asset.
- Establish one canonical maintained-turf appearance contract for color, baked visual/fiber density, dryness, roughness, ambient occlusion, and world-space macro variation. Treat the far surface as the reference response for all geometry tiers; runtime placement density remains owned by AI 360 and AI 361.
- Treat soccer-field grass only as an example of dense carpet-like coverage, not as the required style. Support controlled variation in blade length, direction, density, dryness, and local irregularity, including grass that is visibly longer than closely cut turf.
- Remove self-lit grass behavior. Near grass, cards, patches, and localized accents must have zero emissive contribution and must darken consistently with the far surface.
- Re-bake every card, strip, clump, and patch atlas at declared physical dimensions that agree with its intended runtime dimensions within `5%`.
- Replace sparse absolute-green atlas imagery with dense turf coverage or neutral detail/mask information that can inherit the canonical far-surface appearance.
- Produce coherent base-color/detail, alpha or coverage, normal, roughness, and ambient-occlusion behavior without baked lighting or contradictory shading.
- Make alpha minification stable across every mip used before the geometry cutoff. Preserve intended coverage, dilate atlas cells into safe gutters, avoid cell bleeding, and prevent zero-coverage collapse, halos, or temporal glitter.
- Keep cutout grass opaque and depth-writing. Do not solve field coverage with transparent sorting.
- Evaluate the existing far texture at plausible world scale. If it cannot serve as the canonical reference, bake corrected top-down and oblique grass maps from the existing Blender grass-blade source over a realistic substrate, preserving natural length and directional irregularity rather than forcing a uniformly mown pattern.
- Register every corrected map, physical dimension, provenance value, and material identity through the global catalog and `PbrTextureLoaderService` pipeline. Do not add a Grass Lab-local resolver or loader.
- Publish the corrected contract as `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md` with the stable catalog/material identity `pbr.grass_low_cut_maintained_v2`, exact asset paths, channel semantics, physical dimensions, mip/coverage policy, provenance, calibration behavior, and compatibility rules.
- Add deterministic asset and renderer regressions for physical bake/runtime dimensions, zero emissive, shared appearance ownership, mip coverage, color/luminance agreement, catalog resolution, and repeatable output.
- Capture native-4K material comparisons under daylight, overcast, golden-hour, and night lighting, including texture-only, geometry-on, grazing, close, handoff, and far fixtures.
- Record measured color and luminance comparisons between the far surface and each corrected representation. Geometry-on versus texture-only median luminance must remain between `0.90` and `1.10` in neutral daylight and overcast fixtures.
- Keep grass footprint, exposed-substrate width, canopy height, geometry density, placement, LOD ranges, tier evaluator, quality budgets, and gameplay unchanged.

Acceptance outcomes:
- Enabling grass geometry no longer creates isolated high-luminance or over-saturated green points against the maintained-turf surface.
- Every grass representation belongs to one recognizable material family under all four lighting presets.
- Every corrected consumer resolves `pbr.grass_low_cut_maintained_v2` through the shared catalog/calibration pipeline; no V2 tier silently falls back to a V1 or local material identity.
- Near, billboard, patch, and accent materials have zero emissive contribution.
- Every baked card's declared dimensions agree with its runtime dimensions within `5%`.
- No mip used before the intended cutoff has zero useful alpha coverage, visible cell bleeding, or a bright/dark fringe.
- The corrected far surface reads as a cohesive natural grass layer with small-scale fiber variation and restrained macro variation rather than a flat, smooth green color. It may be short, longer, or locally irregular according to the selected profile.
- All required comparison PNGs are native `3840x2160`, UI-free, and have repeatable metadata.
- Gameplay remains untouched.

## Sequence dependency

- Requires the historical completed AI 350 through AI 357 prompts and their existing assets as the correction baseline.
- Creates `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md` and supplies that corrected V2 appearance family to AI 359 through AI 363.
- AI 357's V1 approval remains historical and does not authorize gameplay after this corrective sequence begins.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 358 grass-sequence checklist item with the material, asset-channel, loader, calibration, and consumer work completed here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If this prompt changes a contract, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and every downstream grass prompt that consumes it.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record corrections in V2 contracts and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A before/after cost table for every representative fixture and quality preset used here. Report visible grass triangles, grass logical draw calls, total renderer draw calls, and the measured CPU/GPU timing when available.
- An explicit cost delta and budget verdict. Material-only work must still report the measured triangle and draw-call counts as unchanged or explain any change; costs may not be omitted because geometry was not the primary task.
- A screenshot manifest with repository-relative file paths, before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active representation, triangle count, and grass/total draw-call counts.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- The required close, grazing, texture-only, geometry-on, handoff, far, and four-lighting comparisons defined above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_358_MATERIAL_unified_grass_color_physically_scaled_atlases_and_mips_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.

## Superseded completion evidence — reopened after visual review

The first completion was rejected after native-4K user review found that V2 mid-card pixels formed a severely dark horizon band and that the material fixture did not use the runtime card-lighting path. The broad foreground median-luminance ROI excluded the affected band and therefore produced a false `1.000` result. Preserve the measurements below as the rejected baseline; they do not approve AI 358. Current completion requires corrected card-local/fixture rendering, a pixel-aligned horizon-card gate, and replacement native-4K evidence.

### Completed changes

- Baked and installed the canonical `pbr.grass_low_cut_maintained_v2` family with restrained natural turf color, independent far PBR channels, and separate mid-cluster and accent-clump atlas families.
- Declared exact physical atlas dimensions (`1.15 × 0.055 m` mid clusters and `0.24 × 0.075 m` accents), 16 px cell gutters, 12 px RGB dilation, 1 px cell-local alpha conditioning, cutoff `0.35`, and validated useful coverage for all eight variants through mips 0-7.
- Removed the continuous atlas root ribbon: the bake records zero opaque-black conditioned pixels, no continuous root-ribbon detection, and bounded horizontal/top-down alpha runs.
- Routed far, near, mid, accent, coverage, and material-fixture consumers through the shared catalog and `PbrTextureLoaderService`; V1 remains available only for deterministic historical comparison.
- Removed V2 emissive contribution and matched the near palette to the corrected far surface (`#494E30` base through `#616743` tip, roughness `0.94`).
- Added a contract-driven V2 vegetation normal response that blends card normals `0.72` toward world up after normal-map application, while V1 retains its historical mesh normals and V2 emissive remains zero.
- Added deterministic Blender provenance, an inspectable `.blend`, manifest hashes, physical/mip/root-line asset regressions, V1/V2 runtime switching, and a native-4K Grass Lab evidence runner.
- Kept gameplay, placement, density, geometry topology, LOD distances, coverage boundaries, and triangle/draw-call ownership unchanged.

The remaining crossed-card footprint visible from elevated views is the unchanged AI 355 representation, not an atlas root ribbon. Its billboard/middle-patch replacement and angle-aware reconciliation remain owned by AI 361; the cohesive closest-camera layer remains owned by AI 360. This material task does not claim either geometry correction.

### Representative fixture cost comparison

CPU is the Grass Lab grass-update sample and GPU is the whole-frame timer sample when available. Timings are single deterministic settle-frame observations and can vary with the local GPU; triangles and calls are the architectural cost gate.

| Fixture | B→A grass tris | Δ | B→A grass calls | Δ | B→A total calls | Δ | B→A CPU ms | B→A GPU ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| material_daylight | 3240 → 3240 | 0 | 4 → 4 | 0 | 23 → 23 | 0 | 0.144 → 0.114 | 6.248 → 5.641 |
| material_overcast | 3240 → 3240 | 0 | 4 → 4 | 0 | 23 → 23 | 0 | 0.081 → 0.080 | 5.704 → 6.349 |
| material_golden | 5676 → 5676 | 0 | 4 → 4 | 0 | 24 → 24 | 0 | 0.103 → 0.105 | 5.377 → 5.395 |
| material_night | 3668 → 3668 | 0 | 4 → 4 | 0 | 22 → 22 | 0 | 0.103 → 0.118 | 5.506 → 5.524 |
| close_geometry_daylight | 21528 → 21528 | 0 | 5 → 5 | 0 | 18 → 18 | 0 | 0.120 → 0.096 | 3.896 → 4.460 |
| geometry_on_daylight | 21920 → 21920 | 0 | 5 → 5 | 0 | 18 → 18 | 0 | 0.095 → 0.099 | 4.424 → 5.285 |
| geometry_on_overcast | 21920 → 21920 | 0 | 5 → 5 | 0 | 18 → 18 | 0 | 0.113 → 0.115 | 7.191 → 4.558 |
| texture_only_daylight | 0 → 0 | 0 | 0 → 0 | 0 | 15 → 15 | 0 | 0.053 → 0.022 | 4.384 → 4.388 |
| texture_only_overcast | 0 → 0 | 0 | 0 → 0 | 0 | 15 → 15 | 0 | 0.034 → 0.025 | 3.457 → 4.810 |
| near_handoff_golden | 21760 → 21760 | 0 | 6 → 6 | 0 | 19 → 19 | 0 | 0.128 → 0.128 | 4.571 → 5.073 |
| far_texture_night | 22224 → 22224 | 0 | 6 → 6 | 0 | 20 → 20 | 0 | 0.106 → 0.106 | 4.215 → 4.279 |

### Quality-preset budget gate at 1920×1080

| Quality | B→A grass tris | Δ | B→A grass calls | Δ | B→A total calls | Δ | B→A CPU ms | B→A GPU ms | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| low | 0 → 0 | 0 | 0 → 0 | 0 | 15 → 15 | 0 | 0.015 → 0.028 | 3.687 → 2.538 | PASS ≤200k tris / ≤12 calls |
| default | 21464 → 21464 | 0 | 5 → 5 | 0 | 19 → 19 | 0 | 0.083 → 0.109 | 2.089 → 9.589 | PASS ≤200k tris / ≤12 calls |
| high | 61688 → 61688 | 0 | 6 → 6 | 0 | 20 → 20 | 0 | 0.082 → 0.082 | 3.141 → 3.415 | PASS ≤200k tris / ≤12 calls |

Material correction adds no triangles, logical grass calls, or renderer calls in any paired fixture or quality preset. The maximum measured preset is `61,688` visible grass triangles and `6` logical grass calls, leaving `138,312` triangles and `6` calls of headroom under the `200,000`/`12` gate. The default-preset GPU observation is retained as measured evidence rather than treated as a stable benchmark; it does not correspond to any geometry, call, or upload increase.

### Color and luminance gate

The fixed turf ROI is normalized `{ x: 0.20, y: 0.55, width: 0.60, height: 0.35 }`. Geometry-on versus texture-only median luminance must remain within `0.90-1.10`.

| Phase | Light | Geometry median Y | Texture median Y | Ratio | Geometry mean saturation | Texture mean saturation | Bright fractions G/T | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| before | daylight | 0.24314 | 0.24314 | 1.000 | 0.41860 | 0.41767 | 0.000000/0.000000 | PASS |
| before | overcast | 0.24706 | 0.24706 | 1.000 | 0.40325 | 0.40220 | 0.000000/0.000000 | PASS |
| after | daylight | 0.22745 | 0.22745 | 1.000 | 0.37495 | 0.37460 | 0.000000/0.000000 | PASS |
| after | overcast | 0.23137 | 0.23137 | 1.000 | 0.35781 | 0.35745 | 0.000000/0.000000 | PASS |

V2 reduces the neutral-fixture mean saturation while preserving the far/geometry luminance ratio and producing no sampled high-luminance outliers.

### Native-4K screenshot manifest

All 22 images below are UI-free lossless PNGs captured from a real `3840×2160` WebGL drawing buffer at renderer pixel ratio `1`; independent manifest validation reports `bad4k=0`. There are no missing required images or measurements. The full machine-readable record is `tests/artifacts/screens/grass/ai358/capture_manifest.json`. The capture recorded zero runtime errors in both phases. It also retained ten non-fatal Three.js texture warm-up warnings per phase (`Texture marked for update but no image data found`) while cloned textures were waiting for their shared image sources; the final images and asset requests resolved successfully.

| PNG | Phase / role | Camera position → target (m) | H | Pose | Light / exp. | Quality | Active representation | Tris | Calls grass/total |
|---|---|---|---:|---|---|---|---|---:|---:|
| `tests/artifacts/screens/grass/ai358/after_close_geometry_daylight.png` | after / geometry_on_close | (-9.97,0.30,-72.20) → (-10.32,0.04,-74.40) | 0.30 | grazing | daylight / 1.00 | default | geometry_on_close | 21528 | 5/18 |
| `tests/artifacts/screens/grass/ai358/after_far_texture_night.png` | after / far | (3.68,3.20,-28.40) → (5.68,0.08,-74.40) | 3.20 | far | night / 0.78 | default | far | 22224 | 6/20 |
| `tests/artifacts/screens/grass/ai358/after_geometry_on_daylight.png` | after / geometry_on_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | default | geometry_on_neutral_pair | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/after_geometry_on_overcast.png` | after / geometry_on_grazing | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | default | geometry_on_grazing | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/after_material_daylight.png` | after / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | daylight / 1.00 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/after_material_golden.png` | after / material_fixture | (-36.00,3.28,-109.50) → (-36.00,1.28,-128.00) | 3.28 | grazing | golden / 1.02 | default | material_fixture | 5676 | 4/24 |
| `tests/artifacts/screens/grass/ai358/after_material_night.png` | after / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | night / 0.78 | default | material_fixture | 3668 | 4/22 |
| `tests/artifacts/screens/grass/ai358/after_material_overcast.png` | after / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | overcast / 0.98 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/after_near_handoff_golden.png` | after / handoff | (-10.32,0.85,-65.40) → (-10.32,0.04,-74.40) | 0.85 | handoff | golden / 1.02 | default | handoff | 21760 | 6/19 |
| `tests/artifacts/screens/grass/ai358/after_texture_only_daylight.png` | after / texture_only | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | low | texture_only | 0 | 0/15 |
| `tests/artifacts/screens/grass/ai358/after_texture_only_overcast.png` | after / texture_only_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | low | texture_only_neutral_pair | 0 | 0/15 |
| `tests/artifacts/screens/grass/ai358/before_close_geometry_daylight.png` | before / geometry_on_close | (-9.97,0.30,-72.20) → (-10.32,0.04,-74.40) | 0.30 | grazing | daylight / 1.00 | default | geometry_on_close | 21528 | 5/18 |
| `tests/artifacts/screens/grass/ai358/before_far_texture_night.png` | before / far | (3.68,3.20,-28.40) → (5.68,0.08,-74.40) | 3.20 | far | night / 0.78 | default | far | 22224 | 6/20 |
| `tests/artifacts/screens/grass/ai358/before_geometry_on_daylight.png` | before / geometry_on_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | default | geometry_on_neutral_pair | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/before_geometry_on_overcast.png` | before / geometry_on_grazing | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | default | geometry_on_grazing | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/before_material_daylight.png` | before / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | daylight / 1.00 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/before_material_golden.png` | before / material_fixture | (-36.00,3.28,-109.50) → (-36.00,1.28,-128.00) | 3.28 | grazing | golden / 1.02 | default | material_fixture | 5676 | 4/24 |
| `tests/artifacts/screens/grass/ai358/before_material_night.png` | before / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | night / 0.78 | default | material_fixture | 3668 | 4/22 |
| `tests/artifacts/screens/grass/ai358/before_material_overcast.png` | before / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | overcast / 0.98 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/before_near_handoff_golden.png` | before / handoff | (-10.32,0.85,-65.40) → (-10.32,0.04,-74.40) | 0.85 | handoff | golden / 1.02 | default | handoff | 21760 | 6/19 |
| `tests/artifacts/screens/grass/ai358/before_texture_only_daylight.png` | before / texture_only | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | low | texture_only | 0 | 0/15 |
| `tests/artifacts/screens/grass/ai358/before_texture_only_overcast.png` | before / texture_only_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | low | texture_only_neutral_pair | 0 | 0/15 |

### Verification

- Installed V2 asset contract and hashes: 3/3 passed.
- V2 material/catalog/consumer/normal policy: 8/8 passed.
- Automatic LOD contract: 7/7 passed.
- Coverage and Lab-only boundary contract: 5/5 passed.
- Native capture contract: 6/6 passed.
- JavaScript and Python source syntax checks passed; Blender generation completed with the file reset to an empty unsaved scene.
- AI 349's scoped AI 358 dynamic-checklist item is complete; unrelated dynamic items remain active.
- No gameplay module imports or gameplay assets were changed.

## Completion evidence

### Completed changes

- Corrected the black/dark card defect at its runtime cause: atlas geometry has no per-vertex `color` attribute, so the atlas material now uses `vertexColors: false` instead of multiplying sampled albedo by a missing/default-black color; independent `instanceColor` brightness variation remains active.
- Re-baked both V2 atlas families as fully opaque base-color, normal, roughness, and AO maps plus separate grayscale coverage maps; runtime binds coverage through `alphaMap` and remaps `vAlphaMapUv` with the same atlas-cell transform.
- Conditioned every PBR RGB texel deterministically from the nearest opaque reference texel within its own atlas cell, retained 16 px zero-coverage gutters, and validated coverage for all eight variants through mips 0-7.
- Unified runtime cards and the full-atlas material fixture on the same `world_up_blend: 1.0` physically lit response with zero emissive contribution; V1 retains packed-alpha and mesh-normal behavior only for historical comparison.
- Added a pixel-aligned live-card band gate and settled-shader capture metadata so a narrow horizon defect cannot hide outside the broad foreground ROI or leave stale compiled-program diagnostics.
- Staged and captured the corrected V2 assets only from `tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2_split`; gameplay modules and gameplay assets remain untouched.

The split coverage contract adds one texture sample to each V2 card material and approximately `5.33 MiB` of GPU memory for the two RGBA8 coverage atlases including mipmaps. It adds `0` triangles and `0` draw calls. Faint crossed-card rows and sparse stem topology that remain visible in close/elevated views are unchanged representation work owned by AI 361, not a material-darkening fallback.

### Reopened defect verdict

The rejected V2 evidence preserved above measured a `0.50415` darkened-card fraction in both daylight and overcast. The corrected V2 measures `0.00222` in daylight and `0.00207` in overcast, with maximum three-row fractions `0.00723` and `0.00666`, all far below the `0.10` ceiling. The final 22-image comparison uses historical V1 for its formal `before` phase and corrected V2 for `after`; it does not relabel V1 as the broken V2. The rejected V2-to-corrected-V2 regression is documented by the preserved rejected measurement and this replacement gate.

Corrected runtime diagnostics are internally settled and consistent: authored and compiled signature `variant:midCluster:4x2:1024x512:g16:n:world_up_blend:1:a:separate_alpha_map:green`, distinct `alphaMap`, `vertexColors: false`, and mid/accent emissive intensities `0`.

### Representative fixture cost comparison

CPU is the Grass Lab grass-update sample; GPU is the whole-frame timer sample when available. Timings are single settled-frame observations and are not treated as a stable benchmark. Triangles and calls are the architectural gate.

| Fixture | B→A grass tris | Δ | B→A grass calls | Δ | B→A total calls | Δ | B→A CPU ms | B→A GPU ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| material_daylight | 3240 → 3240 | 0 | 4 → 4 | 0 | 23 → 23 | 0 | 0.095 → 0.130 | 4.568 → 6.000 |
| material_overcast | 3240 → 3240 | 0 | 4 → 4 | 0 | 23 → 23 | 0 | 0.069 → 0.117 | 5.707 → 5.351 |
| material_golden | 5676 → 5676 | 0 | 4 → 4 | 0 | 24 → 24 | 0 | 0.102 → 0.103 | 5.252 → 4.352 |
| material_night | 3668 → 3668 | 0 | 4 → 4 | 0 | 22 → 22 | 0 | 0.112 → 0.095 | 5.857 → 4.390 |
| close_geometry_daylight | 21528 → 21528 | 0 | 5 → 5 | 0 | 18 → 18 | 0 | 0.099 → 0.109 | 3.783 → 4.420 |
| geometry_on_daylight | 21920 → 21920 | 0 | 5 → 5 | 0 | 18 → 18 | 0 | 0.095 → 0.108 | 4.149 → 3.556 |
| geometry_on_overcast | 21920 → 21920 | 0 | 5 → 5 | 0 | 18 → 18 | 0 | 0.075 → 0.071 | 4.133 → 4.665 |
| texture_only_daylight | 0 → 0 | 0 | 0 → 0 | 0 | 15 → 15 | 0 | 0.029 → 0.042 | 4.809 → 4.028 |
| texture_only_overcast | 0 → 0 | 0 | 0 → 0 | 0 | 15 → 15 | 0 | 0.015 → 0.027 | 3.383 → 3.891 |
| near_handoff_golden | 21760 → 21760 | 0 | 6 → 6 | 0 | 19 → 19 | 0 | 0.139 → 0.109 | 3.585 → 4.600 |
| far_texture_night | 22224 → 22224 | 0 | 6 → 6 | 0 | 20 → 20 | 0 | 0.076 → 0.092 | 3.250 → 3.793 |

### Quality-preset budget gate at 1920×1080

| Quality | B→A grass tris | Δ | B→A grass calls | Δ | B→A total calls | Δ | B→A CPU ms | B→A GPU ms | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| low | 0 → 0 | 0 | 0 → 0 | 0 | 15 → 15 | 0 | 0.022 → 0.028 | 1.057 → 1.894 | PASS ≤200k tris / ≤12 calls |
| default | 21464 → 21464 | 0 | 5 → 5 | 0 | 19 → 19 | 0 | 0.090 → 0.069 | 1.355 → 3.575 | PASS ≤200k tris / ≤12 calls |
| high | 61688 → 61688 | 0 | 6 → 6 | 0 | 20 → 20 | 0 | 0.088 → 0.057 | 1.480 → 2.184 | PASS ≤200k tris / ≤12 calls |

The material correction changes no paired geometry or call count. The maximum preset is `61,688` visible grass triangles and `6` logical grass calls, leaving `138,312` triangles and `6` calls of headroom under the `200,000`/`12` gate. The maximum native-4K capture recipe is `22,224` triangles and `6` grass calls.

### Luminance and pixel-aligned card-band gates

Broad geometry-on versus texture-only median luminance must remain within `0.90-1.10`. The card-band gate uses the aligned normalized ROI `{ x: 0.05, y: 0.35, width: 0.90, height: 0.08 }` and requires the maximum three-row darkened fraction to remain at or below `0.10`.

| Phase | Light | Geometry median Y | Texture median Y | Ratio | Darkened pixels | Max raw row | Max 3-row | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| before V1 | daylight | 0.24314 | 0.24314 | 1.00000 | 0.00160 | 0.00666 | 0.00646 | PASS |
| before V1 | overcast | 0.24706 | 0.24706 | 1.00000 | 0.00125 | 0.00550 | 0.00530 | PASS |
| after V2 | daylight | 0.22745 | 0.22745 | 1.00000 | 0.00222 | 0.00781 | 0.00723 | PASS |
| after V2 | overcast | 0.23137 | 0.23137 | 1.00000 | 0.00207 | 0.00752 | 0.00666 | PASS |

### Native-4K screenshot manifest

All 22 images are UI-free lossless PNGs whose actual IHDR, viewport, canvas, and WebGL drawing-buffer dimensions are `3840×2160` at device/renderer pixel ratio `1`. There are no missing or extra PNGs and both phases recorded zero runtime errors. Each phase retains ten non-fatal Three.js texture warm-up warnings while shared image sources are attached; all capture-local material diagnostics and rendered maps are resolved. The machine-readable authority is `tests/artifacts/screens/grass/ai358/capture_manifest.json`.

| PNG | Phase / role | Camera position → target (m) | H | Pose | Light / exp. | Quality | Active representation | Tris | Calls grass/total |
|---|---|---|---:|---|---|---|---|---:|---:|
| `tests/artifacts/screens/grass/ai358/after_close_geometry_daylight.png` | after / geometry_on_close | (-9.97,0.30,-72.20) → (-10.32,0.04,-74.40) | 0.30 | grazing | daylight / 1.00 | default | geometry_on_close | 21528 | 5/18 |
| `tests/artifacts/screens/grass/ai358/after_far_texture_night.png` | after / far | (3.68,3.20,-28.40) → (5.68,0.08,-74.40) | 3.20 | far | night / 0.78 | default | far | 22224 | 6/20 |
| `tests/artifacts/screens/grass/ai358/after_geometry_on_daylight.png` | after / geometry_on_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | default | geometry_on_neutral_pair | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/after_geometry_on_overcast.png` | after / geometry_on_grazing | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | default | geometry_on_grazing | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/after_material_daylight.png` | after / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | daylight / 1.00 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/after_material_golden.png` | after / material_fixture | (-36.00,3.28,-109.50) → (-36.00,1.28,-128.00) | 3.28 | grazing | golden / 1.02 | default | material_fixture | 5676 | 4/24 |
| `tests/artifacts/screens/grass/ai358/after_material_night.png` | after / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | night / 0.78 | default | material_fixture | 3668 | 4/22 |
| `tests/artifacts/screens/grass/ai358/after_material_overcast.png` | after / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | overcast / 0.98 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/after_near_handoff_golden.png` | after / handoff | (-10.32,0.85,-65.40) → (-10.32,0.04,-74.40) | 0.85 | handoff | golden / 1.02 | default | handoff | 21760 | 6/19 |
| `tests/artifacts/screens/grass/ai358/after_texture_only_daylight.png` | after / texture_only | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | low | texture_only | 0 | 0/15 |
| `tests/artifacts/screens/grass/ai358/after_texture_only_overcast.png` | after / texture_only_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | low | texture_only_neutral_pair | 0 | 0/15 |
| `tests/artifacts/screens/grass/ai358/before_close_geometry_daylight.png` | before / geometry_on_close | (-9.97,0.30,-72.20) → (-10.32,0.04,-74.40) | 0.30 | grazing | daylight / 1.00 | default | geometry_on_close | 21528 | 5/18 |
| `tests/artifacts/screens/grass/ai358/before_far_texture_night.png` | before / far | (3.68,3.20,-28.40) → (5.68,0.08,-74.40) | 3.20 | far | night / 0.78 | default | far | 22224 | 6/20 |
| `tests/artifacts/screens/grass/ai358/before_geometry_on_daylight.png` | before / geometry_on_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | default | geometry_on_neutral_pair | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/before_geometry_on_overcast.png` | before / geometry_on_grazing | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | default | geometry_on_grazing | 21920 | 5/18 |
| `tests/artifacts/screens/grass/ai358/before_material_daylight.png` | before / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | daylight / 1.00 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/before_material_golden.png` | before / material_fixture | (-36.00,3.28,-109.50) → (-36.00,1.28,-128.00) | 3.28 | grazing | golden / 1.02 | default | material_fixture | 5676 | 4/24 |
| `tests/artifacts/screens/grass/ai358/before_material_night.png` | before / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | night / 0.78 | default | material_fixture | 3668 | 4/22 |
| `tests/artifacts/screens/grass/ai358/before_material_overcast.png` | before / material_fixture | (-36.00,11.78,-109.50) → (-36.00,1.28,-128.00) | 11.78 | oblique | overcast / 0.98 | default | material_fixture | 3240 | 4/23 |
| `tests/artifacts/screens/grass/ai358/before_near_handoff_golden.png` | before / handoff | (-10.32,0.85,-65.40) → (-10.32,0.04,-74.40) | 0.85 | handoff | golden / 1.02 | default | handoff | 21760 | 6/19 |
| `tests/artifacts/screens/grass/ai358/before_texture_only_daylight.png` | before / texture_only | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | daylight / 1.00 | low | texture_only | 0 | 0/15 |
| `tests/artifacts/screens/grass/ai358/before_texture_only_overcast.png` | before / texture_only_neutral_pair | (-10.62,0.50,-71.00) → (-10.32,0.04,-74.40) | 0.50 | grazing | overcast / 0.98 | low | texture_only_neutral_pair | 0 | 0/15 |

### Verification

- V2 material/catalog/consumer contract: 9/9 passed.
- Installed staged V2 asset contract and hashes: 3/3 passed.
- Native capture and card-band contract: 10/10 passed.
- Related Grass Lab, coverage, LOD, near, and localized-accent contracts: 53/53 passed.
- JavaScript syntax checks and the Blender baker Python AST check passed.
- The broader repository unit sweep still has unrelated existing failures and missing shared-asset links in this worktree; no scoped grass failure remains.
- AI 349's scoped AI 358 item is complete; unrelated dynamic items remain active.
- No gameplay module import or gameplay asset was changed.
