# Problem

At a grazing camera angle, asphalt inside the bus shadow shows a bright sheen that resembles unshadowed sunlight. From a higher angle, the same area appears dark. The user reports that grass previously showed a similar failure to respect sun shadows and asks whether there is a shared cause and generic solution.

User references: `codex-clipboard-5c835a96-1cfe-4332-916e-00c00281d0c3.png` (grazing-angle shine) and `codex-clipboard-57290b9e-6ec9-4a90-8cee-fb4d45297234.png` (higher-angle comparison). These establish the visual symptom, not the lighting component responsible. Environment reflections can remain visible in a sun shadow and become stronger at grazing angles; an actual direct-sun visibility leak must be distinguished from legitimate reflection or missing environment occlusion.

# Request

Diagnose the asphalt sheen, compare it with the earlier grass defect, and implement a shared lighting/material correction for any demonstrated visibility error. Preserve physically plausible reflections and accepted baked indirect lighting. Avoid an asphalt-specific brightness patch or making all shaded surfaces uniformly matte.

Tasks:

- [ ] Reproduce the reported asphalt/bus view and orbit the camera from high to grazing angles while holding the bus, sun, materials and lighting fixed. Capture actual effective illumination mode, active baked channels and shadow ownership, not only requested settings. Include a grass receiver and a neutral PBR receiver under the same occluder, with both a moving bus shadow and a static building shadow.
- [ ] Isolate direct sun diffuse, direct sun specular, environment specular, ambient/baked diffuse, AO and post-processing. Capture static visibility, moving-object visibility and composed sun visibility at the marked receiver positions. Prove which contribution changes with view angle and remains in fully occluded regions; do not diagnose from final tone-mapped color alone.
- [ ] Account for AI 535 source revalidation when isolating lighting. Changing IBL or sun intensity through normal settings can switch the whole setup to Current, invalidating an A/B comparison. Use controlled fixtures or contribution diagnostics that preserve the tested path, record effective state throughout, and do not weaken production compatibility checks for debugging.
- [ ] Trace the earlier grass fix through the relevant code/history and report whether the asphalt shares its root cause, shares only a symptom, or has a separate issue. Verify the existing named-sun contract, which already intends to attenuate incident light before direct diffuse/specular evaluation, against the actual compiled material programs and shader-hook order.
- [ ] Audit built-in Standard/Physical materials and relevant custom asphalt, grass and road-marking paths for unshadowed extra sun terms, incorrect sun identity, duplicate lighting, missing receiver participation, static/dynamic visibility composition, normal/bias errors and direct specular added after shadow application. Extend the correction through the shared lighting contract or appropriate material adapters rather than mesh names, road coordinates or camera-specific rules.
- [ ] If direct sunlight is leaking, make the same correctly composed named-sun visibility apply to all supported direct lobes, including diffuse, specular and clearcoat. Retain correct filtered edge behavior and avoid applying a visibility layer twice. Fully blocked direct sun must contribute no diffuse or specular energy beyond the measured filter/precision tolerance, independent of viewing angle. Other lights must retain their own visibility.
- [ ] If the sheen comes from environment reflections, determine whether it is plausible visible sky, insufficient local specular occlusion, an HDR sun/bright emitter inconsistent with the runtime sun, or a material/normal-map issue. Check geometric versus shading normals, reflection directions below the geometric horizon, roughness/metalness inputs and texture color-space/filtering. Document the identified mechanism before choosing a correction.
- [ ] Preserve the separation of direct sun visibility and environment visibility. Do not multiply the entire IBL, base color, emissive term or final image by the sun-shadow mask. Where a shared specular/horizon-occlusion correction is justified, apply it to the relevant environment contribution using suitable visibility and material inputs, preserve open-sky reflections, and document its approximation limits. Do not claim a scalar sun mask or diffuse AO fully represents directional environment occlusion.
- [ ] Correct demonstrated shared defects with the smallest appropriate change. Keep material authoring consistent: do not globally raise asphalt/grass roughness, lower reflection intensity, add more AO or clamp grazing Fresnel solely to hide a visibility error. If global environment maps lack necessary local information, state that limitation and relate it to AI 551 rather than silently pretending a complete local-reflection solution exists.
- [ ] Preserve Current/Baked/Auto, enhanced indirect activation and fallback, AO scope, shadow resolution/mode transitions and repeated runtime toggles. Keep AI 557's independent reflection-intensity work and AI 558's bus-contact softness work separate; neither is required to diagnose this issue. Do not revive baked-direct controls or require an unrelated city rebake.
- [ ] Update the owning lighting/material specs with the measured cause, shared visibility rule, covered material paths and remaining limitations. Explicitly answer whether this was the same grass problem and which generic fix was adopted, or why the remaining appearance is expected reflection behavior.

## Validation and evidence

- [ ] Add deterministic contribution-level regressions using linear rendered output. Compare fully lit and fully shadowed samples across camera angles, static/moving occluders, and representative normal-map/roughness settings. Include a sun-only case where blocked direct specular must vanish and an environment-only case where legitimate sky reflection remains. Test Current and active baked shadows with indirect both enabled and disabled.
- [ ] Exercise asphalt, grass, a neutral receiver and at least one supported Physical material with an extra direct lobe. Verify alpha-cutout grass behavior where applicable. Include moving bus/stationary camera and camera orbit/stationary bus to distinguish stale data from view-dependent shading.
- [ ] Provide aligned before/after images at the reported grazing and high angles, plus contribution/visibility views explaining the result. Save screenshots, user-reference copies, logs and capture manifests under `tests/artifacts/screens/illumination_559/`, all gitignored. Preserve original reference files. Reuse the existing lab/capture workflow; if a Cycles reference is useful, use the registered bake framework and matched scene inputs.
- [ ] Measure runtime impact under the same workload before/after, especially if adding reflection-occlusion work. Report frame time and equivalent FPS, available GPU/CPU pass timings, draw calls, texture/target cost, hardware, resolution, graphics settings, camera, warm-up, sample count and statistics. Label unavailable metrics as not measured with a reason; do not claim an optimization from projections. Verify no shader/texture-limit errors, resource churn or unintended bake invalidation.

## References

- `specs/graphics/illumination_framework.md`: contribution ownership and invalidation boundaries.
- `specs/graphics/static_sun_depth_cache.md`: named-sun shader composition and supported direct lobes.
- `specs/graphics/dynamic_sun_shadow.md`: moving-object shadow composition.
- `specs/graphics/illumination_runtime_modes.md`: effective mode and Lighting-tab compatibility.
- `specs/graphics/receiver_lightmaps.md` and `specs/graphics/ambient_occlusion.md`: retained environment/direct contributions and occlusion composition; use current AI 535 policy where historical preview text differs.
- [Filament material/lighting reference](https://google.github.io/filament/main/filament.html): Fresnel, specular occlusion and horizon-occlusion discussion. Use as background; validate any chosen approach against this engine's actual inputs and measured behavior.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_graphics_559_MATERIAL_shared_specular_visibility_and_grazing_shadow_leakage_DONE.md`.
- Add a high-level one-line summary per completed change, the asphalt/grass root-cause comparison, evidence links, regression results and same-condition before/after performance measurements.
- Do not move it to `prompts/archive/` automatically; archive only when explicitly requested.
