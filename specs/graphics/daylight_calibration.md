# Coherent daylight contract

AI 565 introduces the explicit `lighting/experiments/daylight-calibration` experiment. Production city lighting, material appearance, reflection toggles and accepted bake data are unchanged. It builds on AI 564's linear transport/display checks and hands candidate transport to AI 566/567 and production integration to AI 562.

## Physical inputs and scale

Pin Blender **5.2.1 LTS, build 9e2066aef7ef**, Cycles, `ShaderNodeTexSky.MULTIPLE_SCATTERING`. Record executable and output receipts, the OCIO configuration and LUT identities, samples, device, seed and source export. This implementation uses four spectral samples and an Earth-specific multiple-scattering fit; it is a documented model, not measured local weather or a full spectral atmospheric solver.

The clear and hazy profiles use solar azimuth 45°, elevation 35°, angular diameter 0.53°, observer altitude **100 metres**, air density 1, ozone density 1 and aerosol multipliers 0.25 / 2. The model's ground albedo is fixed at 0.3. These multipliers are not measured aerosol optical depth or turbidity. Model ground/atmosphere multiple scattering is distinct from local city ground bounces.

The source code evaluates incident spectral irradiance at 630, 560, 490 and 430 nm, atmospheric attenuation and weighted XYZ. The harness independently integrates the same documented coefficients at 1024 steps rather than Cycles' 64 steps, then compares it with a fine camera measurement of the rendered solar disc. Blender applies limb darkening `0.4 + 0.6 sqrt(1-r²)`; its disc average is approximately 0.8. Omitting this factor would overstate the renderer's sunlight by 25%.

Estimated lux uses **683 × the model's CIE-Y spectral integral**. This is not a universal conversion for watts, RGB values, HDRI intensity or arbitrary Blender power. The four-wavelength approximation and renderer RGB conversion limit absolute accuracy. Report the numerical integration residual separately from unmeasured physical/model uncertainty.

The overcast control uses published **CIE S011/E:2003 / ISO15469:2004**:

`L(elevation) / Lz = (1 + 2 sin(elevation)) / 3`, with `E_horizontal = 7π Lz / 9`.

Normalize horizontal illuminance to **10,000 lux**. Equal linear Rec.709 RGB channels impose D65 chromaticity; this color and illuminance are experiment assumptions, not definitions imposed by the CIE luminance distribution. The 2024 ISO/CIE DIS is a draft. The overcast control has no direct sun. Lower-hemisphere environment is black; actual local ground supplies reflected light.

## Axes, source ownership and exposure

Three `(x,y,z)` → Blender `(x,-z,y)`, one unit per metre. Game solar vector is `(cos(el) sin(az), sin(el), cos(el) cos(az))`. For this pinned Sky node, rotation is clockwise from Blender +Y: `atan2(sun.x, sun.y)`. The Python altitude property is **metres**. Solar centroid measurements and independent cardinal receiver tests guard against silent axis errors. Earlier AI 560 legacy analytic-sky code used `atan2(y,x)` and altitude `0.1`; preserve it as legacy rather than reinterpreting its images as calibrated evidence.

Cycles candidate worlds supply the **entire** source through one atmospheric world, including its solar disc. There is no extra directional sun, hemisphere fill or camera-only blue background. Camera, glossy and diffuse rays evaluate the same world. Cycles' internal sun-guiding optimization is importance sampling of that source, not another light.

The game handoff separates a disc-free environment from measured direct-normal linear RGB. Use that sky for diffuse PMREM and reflections at intensity 1, and a single directional light with intensity 1 and `color = sunNormalRgb` in linear space. Alternatively use intensity `max(RGB)` and color `RGB/max(RGB)`. Disable the old hemisphere fill. Do not also illuminate with an environment containing the disc. The native finite angular sun is a uniform-disc approximation to the atmospheric limb-darkened disc. A consistent camera-visible sun disc still needs runtime integration; isolated fixtures omit it and disclose that limitation.

Exposure is a separate global policy: `multiplier = π / clear-horizontal-irradiance-Y`. This maps a clear-sun 18% Lambertian card to linear Y=0.18 before display, and is frozen across all conditions and poses. No per-pose or per-tone brightness fit. ACESFilmic is Three.js r183's display transform; AgX is Blender's authenticated OCIO display/view with look None. Both receive the same scene-linear Rec.709 values and exposure. Neither uses a creative grade. The user's generated blue-sky image is visual direction only.

## Evidence and acceptance

Preflight solar integration, axis and horizontal-receiver checks must pass before preparing reusable scenes. The analysis separately reports cardinal receiver radiance, sun-only/sky-only/combined additivity, overcast distribution/absolute normalization/chromaticity and shadow growth with receiver separation. Negative controls inject duplicated sky, a rotated sun and a missing blue channel.

Diffuse/reflective sphere views expose remaining native PMREM/local-bounce differences. Do not claim isolated receiver agreement proves city GI parity. Near/far shadow measurements retain the uniform-disc versus limb-darkening and shadow-resolution limitations. No production performance claim is made because production runtime rendering is unchanged.

Five original cameras and four bus placements are retained. The first two cameras share `bus_shared_01_02`. All 30 original/neutral transport renders and both display versions remain alongside raw EXRs. Original baked-game baselines and AI 563 artistic controls retain their own exposure, bake receipts and source metadata; their absolute pixel differences are not calibrated physical errors.

AI 566 must validate materials before final scene acceptance. The opaque neutral override is deliberately diagnostic and changes alpha/transmission/emission behavior. AI 562 must integrate the chosen transport with compatible newly keyed bakes, finite-source shadows, local reflection/indirect behavior and stable toggles. Never silently apply candidate lighting to old incompatible bake data.

## Primary sources

- [Blender Sky Texture documentation](https://docs.blender.org/manual/en/latest/render/shader_nodes/textures/sky.html): model scope and supported parameters; version pinned in the experiment rather than inferred from current online defaults.
- [Blender 5.2.1 spectral multiple-scattering implementation](https://github.com/blender/blender/blob/v5.2.1/intern/sky/source/sky_multiple_scattering.cpp): spectral inputs, fixed ground albedo, extinction/in-scattering and solar precomputation.
- [Blender 5.2.1 sky shader](https://github.com/blender/blender/blob/v5.2.1/intern/cycles/kernel/svm/sky.h): limb darkening, directional evaluation and sun guiding.
- [Blender parameter bridge](https://github.com/blender/blender/blob/v5.2.1/intern/cycles/blender/shader.cpp): altitude and solar parameters passed through to Cycles.
- [Published CIE Standard General Sky](https://www.cie.co.at/publications/spatial-distribution-daylight-cie-standard-general-sky): S011/E:2003 / ISO15469:2004; relative distributions and normalization scope.
- [CIE 215:2014 guide](https://www.cie.co.at/publications/cie-standard-general-sky-guide).
- [2024 draft listing](https://www.cie.co.at/publications/spatial-distribution-daylight-cie-standard-general-sky-0): explicitly DIS, not the published edition used here.
