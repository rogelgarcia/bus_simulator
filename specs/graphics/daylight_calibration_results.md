# Executed daylight calibration — AI 565

Executed on 2026-09-09 with **86/86 transport/model checks passing**, all three injected faults detected, and four focused pipeline/math tests passing. This validates the specified model and isolated renderer measurements; it does not certify real-world weather, city materials or complete game GI. Production settings and accepted bake assets are unchanged.

## Conditions and measured scale

The [daylight contract](daylight_calibration.md) pins Blender 5.2.1 LTS (9e2066aef7ef), its multiple-scattering atmosphere and spectral assumptions. Solar azimuth/elevation are 45°/35°, diameter 0.53°, observer altitude 100 m, air/ozone multipliers 1, and model ground albedo 0.3. Clear/hazy aerosol multipliers are 0.25/2; they are not measured optical depths. Overcast uses published CIE S011/E:2003 / ISO15469:2004, with assumed D65 color and 10,000 lux horizontal normalization.

| Profile | Condition | Estimated sun horizontal lux | Estimated sky horizontal lux | Sun / sky |
| --- | --- | ---: | ---: | ---: |
| D01 | Clear | 52,147 | 7,236 | 7.21 |
| D02 | Hazy | 50,053 | 9,423 | 5.31 |
| D03 | CIE overcast | 0 | 10,000 | 0 |

These are model-derived quantities using its CIE-Y spectral integral, not a universal RGB watts-to-lux conversion. Numerical solar integration residuals are 0.38% (clear) and 1.19% (hazy), within the predefined 1.5% tolerance. This agreement is between a renderer and independent quadrature of the same published model; atmospheric/model accuracy is not established to those percentages. No measured blue-sky dataset or local weather measurements were supplied.

D01 is the clear-day calibration baseline; D02 remains a valid hazier alternative and D03 an overcast control. None is promoted as a final beauty winner before AI 566 establishes material reflectance. One exposure multiplier, **0.03613327709602517 (−4.790528084304614 EV)**, maps the D01 horizontal 18% card to linear Y=0.18 and remains fixed for every pose, condition and display operator. D03 consequently looks much darker at this clear-day camera exposure. That deliberate brightness difference must not be removed by per-image fitting.

## What was checked

- Sun centroid and axes, solar spectral quadrature, horizontal/east/north card radiance, source additivity, sunlit/shaded ratios, sky chromaticity, and CIE distribution/normalization. Three negative controls detect duplicated sky energy, wrong solar orientation and a missing blue channel.
- Actual GameEngine renderer captures under the exported disc-free sky plus measured sunlight. The largest card relative error is **7.39%**, within the declared 10% native approximation tolerance. Preserve this residual; do not hide it with material or light scaling.
- Smooth diffuse/reflective spheres with explicit material assignments. Glossy transport passes verify that the reflective sphere is active. Visual comparison confirms the same sky/horizon orientation and sun-highlight location. Cycles additionally reflects the nearby floor and diffuse sphere; global native PMREM does not provide these local reflections or ground-contact shadows in this isolated test.
- Near/far shadow profiles use a 0.2 m / 2 m blocker-to-receiver gap. Clear Cycles 10–90% penumbra widths are **3.00 / 29.73 mm**; native widths are **4.35 / 31.10 mm**. The native uniform solar disc, finite shadow-map resolution and Cycles limb darkening explain remaining representation differences; this is not a claim of exact shadow parity.
- All five canonical camera poses and four bus placements, including `bus_shared_01_02`, render in original and opaque neutral material modes: **30 city EXRs / 60 display images**, plus 34 Cycles fixture EXRs and 35 native captures. The neutral override changes alpha/transmission/emission and is a geometry diagnostic, not a faithful material replacement.
- Both display paths use the same raw linear pixels and exposure: Three.js r183 ACESFilmic and authenticated Blender AgX/None, with creative grading off. Five pose sheets, multi-selection, the keyboard carousel and neutral rows passed automated browser review without JavaScript errors.

## Legacy audit and reuse

The preserved game control has white directional sunlight **7**, hemisphere **1.22**, HDRI `german_town_street_2k` at **0.28**, exposure **1.02**, azimuth/elevation 45°/35°. Its hemisphere ground tint is linear RGB approximately (0.02315, 0.04374, 0.01370). Its separate visible sky uses horizon `#A8D2EE`, zenith `#1F6FC8`, haze and a visual sun/glare; these are not a calibrated radiometric source. Cascaded shadow-light entries represent one sun, not additional energy. Existing sun intensity, HDRI values and visual-disc parameters have no established SI equivalence.

The legacy exporter combines HDRI and hemisphere/π, approximates Phong with GGX, omits unsupported procedural interiors/bump hooks, and normalizes legacy analytic skies to arbitrary targets. Earlier analytic-sky axis/altitude inputs also differ from the pinned atmosphere convention; they remain labeled legacy. The experiment corrects the convention in its own implementation rather than changing historical images or game settings.

Reuse authenticated all 788 original runtime source hashes, checked tracked asset changes, packed scene identity, OCIO/LUT hashes, five camera projections and four bus associations. Maximum recorded export projection error is below 0.001 pixel. Ten game baseline screenshots retain their existing baked data, exposure and metadata. Sixty AI 563 images preserve S01/S02/S04/S08/F04/U04 controls with original card-matched exposures. Their differently lit/exposed pixels are historical comparisons, not physical error targets.

## Artifacts and timings

The final selected run is `tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/`. Generated files remain gitignored:

- [Comparison viewer](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/report/index.html), [measurements](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/report/summary.json), and [runtime candidate mapping](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/report/daylight_profile.json).
- [Pose 02 comparison](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/report/pose_02_daylight_comparison.png) and [pose 03 comparison](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/report/pose_03_daylight_comparison.png); all five pose sheets are retained.
- [Reusable city](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/daylight_city.blend) and [corrected fixture scene](../../tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07/fixture_revisions/657ecdad0cedf3b5-1788994281386/fixtures.blend). `fixture_revision.json` selects this corrected revision; the original fixture scene and rejected measurements remain historical evidence.

Run conditions: RTX 3060 via OPTIX, four CPU threads, 1920×1080 city images, 128 maximum samples with adaptive threshold 0.015 and OpenImageDenoise; raw undenoised fixtures use 512 samples. Native capture used Chrome 151.0.7922.176, Three.js r183 and ANGLE/D3D11 on the same GPU.

| Measured work | Seconds |
| --- | ---: |
| Blender preparation | 6.73 |
| 30 original city render receipts combined | 583.13 |
| 34 selected corrected fixture render receipts combined | 29.85 |
| 35 native captures | 4.21 |
| Final analysis and display generation | 16.73 |
| Viewer checks and five comparison screenshots | 5.41 |
| Sum of these measured stages | **646.07 (10 min 46 s)** |

This is a measured stage sum, not a fresh uninterrupted master-run wall clock. It excludes export reuse checks/process startup, investigation, rejected experiments and repeated validation. The final run was executed in stages with preserved fixture revisions. The last cached Blender render-stage traversal took 23.20 s; it reused valid EXRs and must not be reported as a cold render time. Future master executions record their own complete elapsed time in `execution.json`.

Visual review caught two fixture construction defects before handoff: a shadow camera/blocker alignment error and Blender context-dependent sphere material assignment. Both were corrected and rerendered in separate revisions. The analyzer reads the pinned Blender multipart glossy passes and now explicitly rejects a missing reflective material. Original city transport was unaffected.

No production runtime paths or defaults changed. Comparable before/after game FPS, CPU, GPU and memory deltas are therefore unavailable/not applicable to this offline change; capture/render durations are not substituted for runtime performance measurements.

## Handoff

AI 566 should now establish plausible asphalt, facade, paint, glass and rim inputs and exporter equivalence, then recheck these daylight candidates. AI 567 can subsequently perform bounded calibration with fixed material constraints. AI 562 owns full game application: coherent camera/environment/sun ownership, compatible rebakes, finite-source city shadows, local reflections, dynamic indirect transport and stable toggles. Old accepted bakes must never silently accompany the new transport. See the candidate JSON for exact axes, linear RGB units and source ownership.
