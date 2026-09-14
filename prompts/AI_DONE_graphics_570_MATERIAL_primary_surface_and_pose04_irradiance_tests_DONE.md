# DONE — primary surface and pose 04 irradiance tests

# Problem

AI568/569 leave distinct opaque-wall differences: brick normal/filter response and a roughly 7% pose 04 diffuse deficit despite closely matched normals. Global light or exposure changes would confound these causes.

# Request

Execute tests 1 and 2 requested by the user. Preserve current game settings, bakes, lighting, poses and display. Reuse the authenticated resolved Cycles scene. Compare only opaque wall masks, excluding glass. Record all diagnostics, results and next steps here; do not promote a diagnostic into the game.

## Plan
- [x] Capture pose 02/04 native, geometric-normal, constant-roughness and combined controls in the actual game, restoring all controls afterwards.
- [x] Render equivalent camera-ray-only Cycles controls. Secondary rays retain original materials; add a neutral geometric Lambert control for pose 04.
- [x] Trace pose 04 installed irradiance through stored pixels, GPU sampling and Lambert composition; compare the neutral Cycles response.
- [x] Analyze frozen wall masks with 0/3/6px additional insets and preserve images, numeric evidence and execution times.
- [x] Explain what each test establishes and what remains to test next.

## Controls and interpretation

Use the 128-sample, 1920x1080 resolved reference `ai568_surfaces_20260913_05`, authenticated actual-game baseline `material_validation_20260913_01`, and frozen masks in `current_cycles_20260912_01`. ACESFilmic exposure remains -4.290528084304614 EV. Normal bypass changes primary shading only. Constant roughness is 0.85 in both engines. AO bypass is diagnostic; native appearance retains authored AO. Never interpret a regional luminance ratio as a whole-scene parity percentage. Surface insets also change the sampled wall area.

## Execution log

- Existing Blender PID 2820 is occupied; use an isolated headless framework stage, leaving that session untouched.
- All new stages register under `lighting/experiments/reference-matching`. Generated files remain in the existing gitignored experiment artifact root.
- Initial capture `_01` failed closed before measurements: the static-shadow adapter already expands the direct-light loop anchor. Move the diagnostic to the retained physical-material anchor and place normal bypass after procedural normal layers. Preserve failed evidence; use a new output for retry.
- Game capture `_02` validated in 322.6 seconds. All controls restored, baked blend 1, original settings preserved. Framework 13/13 unit checks and shader policy passed.
- Initial Cycles job `_01` was stopped after over five minutes on its first frame: 11.6 GiB GPU use and ~14 GiB process RAM left little headroom. Only the owned headless PID 9436 was stopped; user Blender PID 2820 remains untouched. Restrict experimental nodes to MAT396/MAT1624 and render padded measured-wall regions at unchanged projection/resolution. Rerender native regional controls to measure any difference from full-frame native sampling. Keep the full scene for secondary rays.
- Cycles regional `_02` validated in 105.7 seconds; native pose 02 masked diffuse exactly equals full-frame native. Analysis found 141/50,558 partial-coverage Cycles pixels (0.279%) in the frozen brick mask; the game constant override is exactly 0.85 everywhere. Add a common constant-material coverage gate to every variant (never a brightness threshold), reject if exclusions exceed 1%, and retain exclusion counts.
- Correct a confound before accepting normal-map results: Three's `nonPerturbedNormal` preserves interpolated authored normals, whereas Cycles `True Normal` also removes mesh smoothing. Use Cycles Geometry Normal for the normal-map factorial; reserve True Normal for the separate geometric Lambert irradiance control. Rerender in `_03`. Preserve failed analyzer outputs, including the corrected diagnostic syntax error in `_02`.

## On completion

Mark DONE and rename in prompts to `AI_DONE_graphics_570_MATERIAL_primary_surface_and_pose04_irradiance_tests_DONE.md`. Record validation and next steps. No production performance claim: these are offline diagnostic passes, not a shipped shader or bake change.

## Accepted results — 2026-09-14

These are **scene-linear diffuse game/Cycles luminance ratios**, with authored AO bypassed for isolation. They are not full-scene parity percentages. Camera, lighting, baked package, exposure, grade, geometry and secondary materials remain unchanged. The normal-off factorial preserves authored mesh smoothing in both renderers; the separate neutral Lambert control uses the true geometric normal. Internal variant IDs retain the earlier `geometric` name.

| Pose / primary control | Complete strict wall | Additional 3px inset | Additional 6px inset |
|---|---:|---:|---:|
| 02 / native | 0.96013 | 0.98457 | 0.99420 |
| 02 / normal maps off | 0.95834 | 0.98256 | 0.99179 |
| 02 / roughness fixed 0.85 | 0.95957 | 0.98422 | 0.99375 |
| 02 / both controls | 0.95739 | 0.98167 | 0.99106 |
| 04 / native | 0.93058 | 0.94744 | 0.96261 |
| 04 / normal maps off | 0.93097 | 0.94787 | 0.96250 |
| 04 / roughness fixed 0.85 | 0.92650 | 0.94337 | 0.95856 |
| 04 / both controls | 0.92686 | 0.94368 | 0.95819 |

### Test 1: brick normal maps, roughness and filtering sensitivity

- Neither normal removal nor matched constant roughness closes the diffuse gap. With both controlled it is 4.26% low versus 3.99% native. The game baked diffuse is invariant to these controls within maximum RGB error 1.2e-7, consistent with the scalar surface bake. Cycles primary BRDF response changes slightly.
- The deeper wall selection differs by only 0.58% natively and 0.89% with both controls. This identifies strong spatial/boundary sensitivity, **not proof that a particular texture filter is wrong**: insets remove actual wall areas too.
- Brick p95 normal disagreement remains 33.52 degrees with normal maps disabled (26.83 degrees at 6px inset), versus native 33.88 degrees. Median is zero in the disabled control. Therefore the tail cannot be attributed solely to normal-map textures. Underlying geometry, interpolated normals, overlapping surfaces and pixel-footprint correspondence need inspection before adjusting texture amplitude or light gain.
- Specular also remains different: whole strict-wall game environment/Cycles glossy ratio 0.85196 native and 0.85729 with both controls. Named-sun specular is negligible on this shaded selection; this is not a general equivalence of full glossy and environment-only passes. Constant roughness is not the missing large correction. The prior AI569 costly environment prototype remains rejected.
- Coverage gate excludes 141/50,558 brick pixels (0.279%) and 19/29,676 pose 04 pixels (0.064%) due to partial Cycles material coverage. Every variant uses the same gate, based on a known constant material value rather than brightness. Glass remains excluded. Strict masks have 50,417 and 29,657 pixels; 6px insets retain 13,506 and 15,116. Current game constant roughness is exactly 0.85 throughout the original masks.

### Test 2: pose 04 indirect diffuse delivery

The neutral geometric Lambert test removes the material-color, normal-map, AO and specular differences. The game is **8.21% low** for the whole strict wall, or **5.11% low** at the 6px inset. This confirms a lighting/transport discrepancy remains independently of those material features.

| Stage / mean scene-linear irradiance Y | Complete strict wall | Additional 6px inset |
|---|---:|---:|
| Cycles neutral Lambert target | 13.61742 | 13.89126 |
| Raw sky + bounce bake, bilinear sampled | 12.75024 | 13.38027 |
| Processed packed base map | 12.49955 | 13.18153 |
| Actual GPU sample | 12.49956 | 13.18159 |

- Raw bake is 6.37% below the neutral target (3.68% at 6px inset).
- Map processing decreases the sampled mean a further 1.97% relative to raw bake (1.49% at 6px), adding about 1.84 percentage points to the full-wall target deficit. This combines reconstruction/extension/seam processing; the present trace does not attribute the loss to one processing step.
- Actual GPU vs independently decoded stored-map relative RMS error: **0.0391%**. Packed quantization vs pre-quantized processed values: **0.0470%** relative RMS.
- Shader composition vs `GPU irradiance * albedo / pi`: relative RMS **3.76e-8** (0.00000376%). No extra runtime darkening is indicated.
- All selected wall pixels use page 3, **LOD 0**; mip reduction is not responsible here.
- Original sky/bounce receipts and packed mip hashes verify. Offline package matches installed source, mapping and indirect aggregate identity. Restored game beauty equals initial beauty exactly on measured masks.
- Both regional native Cycles diffuse means exactly match the previous full-frame native references, validating the cropped rendering optimization.

## Next steps, in priority order

1. Isolate pose 04 bake transport before another whole-city bake: render a neutral wall control from the exact bake reconstruction and compare with the display export under the same source world. Split sky and sun-bounce contributions; hold sample count and bounce limits equal. The current receiver profile is 0.33m, 512 samples, 4 diffuse bounces; the reference uses 128 adaptive samples and max 8 bounces. These differences are candidates, not demonstrated causes. Test one change at a time.
2. Trace page 3 before/after extension and seam constraints separately. Then test one-wall spatial convergence (0.33m versus 0.165m) if the raw-bake difference survives transport-scene alignment. Reuse the same full/inset wall masks and preserve raw/processed values; do not compensate globally with exposure or ambient gain.
3. For brick, visualize the remaining normal-angle tail with maps disabled, compare actual game versus Cycles world position/depth/normal and material IDs, and inspect authored smoothing and overlapping facade geometry. Only after alignment, test texture filtering independently. The current data does not establish a normal-texture or roughness-value fix.
4. After a proven targeted correction, rerun all five poses with native authored AO and original materials; include the established fresh-browser performance repeats before promotion.

## Artifacts and execution

All paths below are beneath `tests/artifacts/screens/ai562_acesfilmic_reference_matching/` and remain ignored:
- `ai570_capture_20260914_02`: accepted actual-game raw passes, 322.6s.
- `ai570_cycles_20260914_03`: accepted 10 regional Cycles renders, 103.6s total. Uses an isolated headless OPTIX process; original Blender PID 2820 remains open.
- `ai570_analysis_20260914_04`: accepted `analysis.json`, raw-stage trace, wall-only diagnostic pairs and current game/Cycles images, 17.3s.
- Successful stage times total 443.5s (7m24s), excluding failed/superseded diagnostic attempts recorded above. Render changes are diagnostic only. No game runtime performance or full rebake was performed in this task.
- Selected renderer: RTX 3060, 1920x1080, fixed ACESFilmic exposure. Native/restored captures and frozen settings validated. Framework tests 13/13 passed; shader policy and JS syntax checks passed. The previous tests/.selected_test bytes were restored.

## Files added or extended

- New registered orchestrators: `PrimarySurfaceTests.mjs`; render/analysis scripts `primary_surface_reference.py`, `primary_surface_analysis.py`; temporary browser control `PrimarySurfaceControl.js` in the reference-matching tool directory.
- New offline-only `PrimarySurfaceShaderLoader.js` and `primary_surface*.glsl` snippets under `src/graphics/shaders/materials/`.
- Extended existing `MaterialParity.mjs`, `RawRadiance.mjs`, `jobs.mjs`, tool README, `PROJECT_TOOLS.md`, `specs/tools/bake_framework.md`, and regression debugging notes. Prior AI569 work remains intact and uncommitted.
- No production lighting/material settings, packages or runtime import paths changed; no commit requested in this turn.
