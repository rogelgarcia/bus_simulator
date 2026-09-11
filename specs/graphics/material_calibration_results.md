# Material calibration results

AI 566 is implemented and executed. The accepted run is `tests/artifacts/screens/ai566_material_calibration/runs/material-08`: **209 checks pass, zero fail**, plus five Node regression tests. Production materials, user settings and published bakes are unchanged.

## Executed evidence

- [Comparison report](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/index.html): all five poses × three daylight cases × ACESFilmic/AgX, with installed game, original export, verified corrections and optional material proposal together. All 30 viewer selections loaded four images without browser errors.
- [Neutral measurements](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/fixture_metrics.json): 19 materials × 15 fixture cases, including separated sources/lobes, sphere highlight measurements and original/corrected GPU normals.
- [City measurements](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/city_metrics.json): 45 city EXRs including authenticated AI 565 originals, material brightness ratios and explicitly qualified low/high direct-light statistics. The report contains 100 city/baseline display images.
- [Candidate profile](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/candidate_profile.json), [correction report](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/corrections.json), [texture/alpha audit](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/texture_audit.json), and [source reference conditions](../../tests/artifacts/screens/ai566_material_calibration/runs/material-08/report/reference_manifest.json).
- Reusable `fixtures.blend` and `material_city.blend`, source audit, native float readbacks and raw multi-pass renders remain in that ignored run directory. The source inventory matches all 2,054 exported/runtime materials and records 2,734 texture objects.

Twelve of 285 material/fixture center comparisons exceed the predefined 20% review band; all occur at the 80° view, chiefly on legacy export approximations. They remain review results rather than failed analytical transport controls or certified parity. At the 35° combined-light view, the representative asphalt and grass differences are approximately 3.3% and 3.7%. No per-material exposure compensation was used.

The 24 detached bus-toggle combinations preserve base colors, restore original references and stabilize at four cached variants. The five Node tests cover generated normal-channel correction/source immutability, publication/output boundaries, invalid physical inputs, evidence tampering and the non-emissive window contract.

## Offline timing

Windows, RTX 3060, Blender 5.2.1/Cycles OPTIX, four CPU threads; city renders 1920×1080, 64 samples with adaptive sampling/denoising; neutral fixtures 2432×160, 128 samples without denoising. Three.js r183, Chrome 151.0.7922.176; isolated browser context, installed game bake fully activated before capture. Values below are measured wall durations for one successful stage, not statistical performance benchmarks.

| Stage | Time | Notes |
| --- | --- | --- |
| Original runtime audit | 129.8 s | Actual game startup and full inventory in `material-05`; authenticated reuse into final run took 0.3 s |
| Final scene preparation | 8.1 s | Includes Blender launch and reusable scenes |
| Final native capture | 138.6 s | Game readiness, effective input probes, toggle checks and 45 native fixture lobe readbacks |
| Final render stage | 591.5 s | 15 neutral plus 30 city EXRs; Blender process 578.4 s, sum of frame-render measurements 549.9 s |
| Analysis/report | About 49 s | 45 city images measured, two display transforms, contact sheets and validation |

The successful final stages total approximately **13.1 minutes with authenticated audit reuse**, or **15.3 minutes including the original audit duration**. This excludes development retries and time between manually invoked stages. Earlier raw images and diagnostic attempts remain preserved.

## Findings and decisions

| Finding | Evidence | Decision |
| --- | --- | --- |
| Generated asphalt normals use the wrong component order | `AsphaltFineTextures.js` writes `(-dhx, 1, -dhy)` into RGB, while the materials use tangent-space normals. The sampled map averages approximately `(0.5053, 0.9846, 0.5000)`, and the effective road normal points almost sideways. Road markings share this normal map. | Correct the generated map's green/blue order in the isolated candidate; keep source assets unchanged. AI 562 must integrate and validate the production fix, including derivative/UV orientation and bake invalidation. |
| Phong reflection color is attenuated again during export | The original exporter copies linear Phong specular RGB into a physical dielectric tint. A default dielectric F0 of 0.04 then multiplies it again. | The conversion candidate preserves authored normal-incidence F0 using IOR and normalized tint. Phong/GGX lobe equivalence is still approximate, and unusually high authored paint F0 is not certified as measured paint. |
| Grass is relatively smooth | Effective shader roughness is about 0.259; the source roughness-map mean is about 0.257. | Test `0.65 + 0.30 × source` as a dry, rough alternative. Moisture/species and the map's authoring intent remain unknown. Do not label the original a visibility bug merely because it reflects light. |
| Metallic building glazing is an artistic reflection shortcut | The representative material has white metallic color, metallic 1, roughness 0.09 and alpha blending/cutout settings. | Test dielectric reflections with black diffuse color, preserving the exported opacity. This is a reflection-layer approximation, not measured transmitting glass. Changing metallic to zero while leaving diffuse white would introduce white paint. |
| Custom shader export is incomplete | Runtime materials include world-space variation, shader lighting/AO and procedural interiors; the original experiment exporter strips custom hooks. | Record effective GPU samples separately from texture averages. AI 562 owns full adapters and production integration. |

## Appearance and reference limits

Representative effective shader samples from the native game (linear values, original mesh UVs and hooks) are:

| Surface | Mean RGB | Effective roughness |
| --- | --- | --- |
| Asphalt | 0.0242 / 0.0242 / 0.0242 | 0.952 |
| Grass | 0.1269 / 0.1621 / 0.0356 | 0.259 |
| White marking | 0.7709 / 0.7411 / 0.6025 | 0.546 |
| Sidewalk | 0.2747 / 0.2747 / 0.2747 | 1.000 |
| Red brick | 0.2779 / 0.1391 / 0.0862 | 0.782 |
| Pale masonry | 0.2892 / 0.2522 / 0.1984 | 0.635 |
| Bus paint | 0.02624 / 0.20508 / 1.00000 | Legacy Phong; do not interpret shininess as GGX roughness |
| Bus trim | 0 / 0 / 0 | Legacy Phong |
| Rim | 0.1343 / 0.1343 / 0.1343 | Legacy Phong |

These are projected material samples, not measured physical specimens or exhaustive texture integrals. Coverage varies by geometry. Pale masonry demonstrates why the final shader sample and the full texture average must remain separate: the crop, atlas region, UVs and multipliers can change their means.

The two non-sRGB color-slot flags belong to procedural window shades. Their custom shader reads the texture as linear scalar noise and applies it around a factor of one; blindly marking that map sRGB would be incorrect. The exporter must translate the shader's meaning rather than use the ordinary base-color-map rule. The inventory also records 1,727 AO-map bindings and no ordinary `lightMap` bindings; baked illumination can still be supplied by custom shader resources, so that count is not proof that the scene has no lightmaps.

The bus's original blue paint, black trim and gray rim base colors are retained. The optional GGX proposal changes reflection response; unchanged base colors do not guarantee identical displayed color under a different BRDF or light transport model. The authored-response correction and optional material choices remain separate variants.

The primary reference roles and source conditions are defined in [material calibration](material_calibration.md). None of the city assets has a measured sample identity. Published asphalt, concrete and grass reflectances are plausibility anchors, not a target value to force every texture toward. Cornell's measured samples likewise do not certify these assets.

The window substitute uses the shared deterministic gray/beige silhouette contract, zero emission and explicit opaque transport. Unknown custom shader, AO, alpha and normal-strength equivalence remains visible in the report rather than silently certified.

Aligned thumbnail color/AO correlations are grass 0.281, red brick −0.049 and pale masonry −0.599. Pale masonry is flagged for authoring review; the negative correlation does not establish duplicated illumination. Other representative materials lack paired readable maps, and remain explicitly unavailable for this diagnostic. Forty-eight runtime materials combine transparency and cutout rules, requiring an exporter adapter rather than a claim of exact imported-opacity parity.

## Handoff

- AI 567 consumes the versioned candidates and independent checks, with one daylight/exposure calibration. It must not optimize against an invalid or untranslatable reference.
- AI 562 integrates approved normal/material/export changes, preserves procedural texture detail and alpha behavior, regenerates affected bakes, and captures matched runtime evidence with measured CPU/GPU costs.
- AI 559/562 diagnoses direct-light visibility on actual production shaders. Neutral GGX visibility checks cannot certify those custom shaders.
- AI 551 owns city-local reflection probes.

Runtime frame time, FPS, CPU/GPU and memory changes are not measured: this task changes offline tools and detached diagnostic materials, not the production rendering path. Cache/reference checks are correctness checks, not a performance benchmark.

## Diagnostic revisions

Earlier attempts remain under the same artifact topic. They are not accepted final measurements:

- Runtime probing initially hit baked-resource JSON cloning and circular controller metadata. Diagnostic copies now preserve shared render resources and omit controller back-references; original game materials are restored.
- Blender preparation stalled while inserting one multi-megabyte JSON line into a text datablock. Readable multiline bindings limited to changed slots reduced successful scene preparation to about eight seconds.
- `material-07` retains the first 45-frame Blender batch before the generated road-normal correction. Its original native neutral sky input was too small for CubeUV's minimum mip layout, and returned zero ambient illumination. The analytical gray-card check caught this; the corrected 512×256 input returns 0.179648 for a 0.18 target (0.20% error).
- Cycles' antialiased material edges mix visible world radiance with surfaces. Lobe-conservation checks now use receiver interiors with a two-pixel material-index margin; raw EXRs retain the complete image.

The original shader normal near `(0,-1,0)` becomes approximately `(0,0,1)` in the same receiver-facing probe after correcting generated channels. At 20°, 35° and 80° views, the neutral GGX direct-specular shadow fraction is zero. These findings do not substitute for AI 562's actual game integration and city-level visibility checks.
