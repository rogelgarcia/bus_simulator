# Bright afternoon daylight

The user prefers strong mid-afternoon sunlight rather than the warmer visual
character of the 35° calibration. The preferred lab target is **55° elevation**;
65° is retained as a higher-sun alternative. These are declared visual conditions,
not a claim that every location has that sun at 15:00. Date, location and civil
time determine solar position; highest elevation occurs at solar noon.

Reference: [NOAA solar position calculator](https://gml.noaa.gov/grad/solcalc/).

## Controlled comparison

The registered `lighting/experiments/daylight-calibration/afternoon` leaf uses
the exact AI567 plausible D01 finalist as its 35° control. New 55°/65° Cycles
renders retain the original geometry, cameras, shared bus, materials, 45° azimuth,
0.53° solar diameter, air/ozone density 1, altitude 100m, clear aerosol density
0.25 and pinned Blender5.2.1 multiple-scattering model. The model computes sun
color, power, sky illumination, background and reflections together; no added
lamp, hemisphere fill, arbitrary sky tint or white-balance adjustment is used.

The original finalist exposure **−4.2905280843 EV** remains fixed for all five
poses and both display transforms (Three.js r183 ACESFilmic and Blender AgX/None).
Grading is Off. Per-angle neutral-card exposure is recorded for later integration
but does not normalize away the irradiance differences in this comparison.

The script authenticates the prior evidence, copies the scene, checks that the
current 35° model reproduces the old sun/sky integrals, then verifies the solar
spectral integral, direction and horizontal/east/north Lambertian receivers at
all three elevations. It saves a reusable scene containing each world and ten
new city EXRs. Thirty display images include five old raw controls and two tones.

## Scope of acceptance

This is a lighting preference comparison with physical Cycles checks. It does
not replace the completed AI565–567 reports or claim that native rendering is
validated at 55°/65°. AI562 must port the selected coherent atmosphere, repeat
native checks and regenerate compatible shadows and sun-driven bounce packages.
Game defaults and installed bakes remain unchanged in this experiment.

## Executed evidence — 2026-09-09

Accepted run: `tests/artifacts/screens/ai565_daylight_calibration/afternoon/afternoon-02/`.
The framework completed in **298.5 seconds**; the operation's internal timer before
final receipt hashing recorded 295.3 seconds. Hardware/settings: RTX3060, OPTIX,
four CPU threads, 1920×1080, 128 samples, seed567, adaptive threshold0.01, OIDN.
The ten city EXRs and thirty displayed images are retained. An initial import-name
collision stopped `afternoon-01` before any render; that failed attempt is retained.

| Sun elevation | Estimated direct-normal illuminance | Estimated direct horizontal illuminance | Shadow length / object height | Neutral-card EV (diagnostic only) |
| --- | ---: | ---: | ---: | ---: |
| 35° original | 90.6klux | 52.0klux | 1.428 | −4.791 |
| 55° afternoon | 97.0klux | 79.4klux | 0.700 | −5.359 |
| 65° higher sun | 98.5klux | 89.3klux | 0.466 | −5.517 |

Illuminance uses the model's independent spectral CIE-Y integral. These are modeled
conditions, not weather measurements. The 55° direct horizontal component is
approximately53% higher than at35°; this does not imply every facade gets53% more
light. A vertical facade can receive less direct light as the sun moves overhead.
The normalized direct-sun red/blue ratio drops from1.621 to1.480 at55° and1.450
at65°, consistent with a less warm source without a manual color correction.

All **17 physical checks passed**, including reproduction of the old35° sun/sky,
three spectral integrals, three sun directions and nine neutral receivers.
The largest receiver relative error was0.022%, within the declared7% threshold.
Four existing pipeline/math tests passed; the real-report browser test passed
and decoded every image at1920×1080. Review screenshots for poses02/03 are in
`report/qa/`. At the common exposure no55°/65° image had pixels with all three
display channels above0.99; this is a limited clipping diagnostic, not a complete
highlight-quality or photorealism score.

Visual review confirms shorter shadows and more sunlit asphalt at55°/65°.
55° is the preferred mid-afternoon target;65° reads closer to a high midday sun.
These remain separate retained candidates, with the original35° evidence intact.
The next production integration is explicitly tracked in AI562.
