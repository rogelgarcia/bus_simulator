# AI 534: ambient occlusion composition

Implementation: `src/graphics/visuals/postprocessing/DynamicAoRuntime.js`,
`AmbientOcclusionScope.js`, the existing post-processing pipeline, and dedicated
GLSL files under `src/graphics/shaders/materials/dynamic_ao*`.
The user accepted AI 533/548 static indirect lighting. AI 534 supplements it with
dynamic contact, while preserving the current engine and both baked channels.

## Contribution inventory and decisions

| Contribution | All / current engine | Dynamic Only with indirect |
|---|---|---|
| Baked indirect irradiance and sky occlusion | User-selected channel, unchanged | Own static environmental occlusion; no extra static-to-static term |
| Baked direct and shared sun visibility | Retained | Retained, never multiplied by the new AO factor |
| Separate Cycles AO / bent-normal channel | Not installed | Not added: accepted indirect already supplies broad static occlusion |
| Static vertex / instance AO | Existing setting and implementation | Suppressed in effective settings; intent preserved for returning to All |
| SSAO / GTAO | Existing methods, parameters, cadence, denoise and exclusions | Not executed; dedicated dynamic contact method instead |
| Exclusion mask | Retained AI 524 depth reuse, with its supported fallback | No mask render: receiver exclusion is resolved before ambient composition |
| Legacy bus contact rig | Available; heading, loaded extent and full chassis length corrected | Suppressed to avoid stacking a black overlay on dynamic AO |
| Dynamic directional bus shadow / self-shadow | Retained | Retained independently; represents blocked sun rather than ambient contact |
| Material AO maps | Preserved | Preserved as authored material microdetail; no asset AO maps deleted or globally rescaled |

AI 323 remains independent work on the existing static AO path; this change does
not claim its historical visibility request is resolved. AI 524 is consumed and
retained for All. AI 525 is already DONE and its selected retained-depth solution
remains in place; the rejected stencil/MRT prototypes are not reintroduced.

## Policy, coverage and limitations

The [AO settings contract](ambient_occlusion.md#ai-534-scope-selection) defines
activation, saved preferences, Off, presets and restoration. Automatic selection
uses the active receiver runtime, enabled indirect uniform and completed fade,
not the requested checkbox. Geometry attributes needed for dynamic receiver IDs
are installed only during the render and restored in `finally`. Runtime shader
hooks are excluded from authored bake-material classification; unrelated custom
hooks still require an adapter. A regression checks both hashes and source watches.

Dynamic-to-world contact is an **oriented opaque bounding-volume approximation**,
not a ray-traced silhouette or a new sun shadow. It supplies a continuous underside
footprint, including at wheel/floor contact, and works without an on-screen bus.
It can overestimate contact around large holes or appendages. Dynamic self/world
detail uses real scene depth and respects alpha cutouts, but retains ordinary
screen-space limitations: occluders entirely outside the camera view or hidden
behind the nearest depth layer may be missed. Increasing sample quality does not
recover unavailable layers. The technique does not promise Blender-quality
dynamic GI, arbitrary deformable-character silhouettes, or off-screen self AO.

All supplementary terms require at least one registered dynamic participant.
Overlapping terms use max rather than multiplying separate broad occlusion
factors. Dynamic Only uses no temporal AO history; a stationary camera still
updates moving objects. Its depth pass uses the final jittered camera and is
included in full-frame GPU timers and renderer draw counts. Its explicit
diagnostics expose calls, triangles, CPU submission time, target allocation,
participant count, intensity and effective factor range. The factor view isolates
the final dynamic multiplier; white means 1, minimum gray is 0.1.

Unbaked opaque receivers keep live ambient/environment lighting and receive
dynamic contact. Selecting Dynamic Only does not fabricate static GI for those
surfaces; broad static crevices can therefore differ from All. Losing compatible
indirect activation restores the live-scope preference. Alpha-excluded receivers,
transparent surfaces and unlit materials retain their original lighting. Cutout
occluders in Alpha Test mode keep texture holes; Exclude mode omits them from AO
depth. Material AO remains an authored term and can need asset-specific review if
a future texture contains broad lighting instead of local material detail.

## Bus underside audit

The installed CityBus has a closed downward-facing floor at all 15 tested points
across its center and length. Its floor is approximately 0.304 m above wheel-bottom
height. No replacement model or additional floor panel is necessary.

The old contact rig covered only 72% of the 13.8 m chassis length (9.936 m), capped
long buses at 11 m, and never rotated its long axis with bus heading. It now uses
the model's full length, projects the heading onto the receiving ground plane,
and refreshes its layout when the asynchronous model becomes ready. The dynamic
contact path covers the complete opaque footprint, including its center.

Evidence: `tests/artifacts/screens/illumination_534/bus-underside-audit.json`,
`city/bus-grounding.png`, and `city/dynamic-footprint-debug.png`. The last is an
intentional isolation capture with the bus hidden from the color pass so its
entire ground factor is visible.

## Validation

- `ambient_occlusion_scope.test.js`: settings migration, Off, overrides, both
  parameter banks, repeated effective/fallback transitions and serialization.
- `ambient_occlusion_scope_ui.pwtest.js`: actual Options controls, active versus
  loading/fallback state, preserved parameters, Save persistence and Cancel
  restoration without touching baked channels.
- `dynamic_ao_contact.pwtest.js`: linear ambient-only output, unchanged direct
  contribution, full chassis coverage, translation, rotation and warm programs.
- `dynamic_ao_interactions.pwtest.js`: separate self and static-world occluders,
  shared-material receiver exclusion, and transparent cutout holes.
- `dynamic_ao_source_contract.pwtest.js`: unchanged bake material catalog and
  canonical static geometry after repeated renders.
- `bus_underside_ao.pwtest.js`: real asset floor ray probes and heading/length.
- `ambient_occlusion_534.pwtest.js`: installed city/bake, GI alone / Dynamic / All,
  current engine, moving bus with stationary camera, Off/On, direct-only switch,
  retained baked resources, camera motion and FXAA/MSAA/TAA/Off.

The synthetic linear-output probes measured equal static ambient outside dynamic
reach; the direct-light delta agrees within 0.0001 with AO enabled/disabled.
The controlled shelf fixture distinguishes dynamic self and world-to-dynamic
contact and returns factor 1 through fully transparent cutout texels.

## Matched performance and visual evidence

Final run data and captures are under
`tests/artifacts/screens/illumination_534/city/`. Measurements use the same initial
bus/platform view at 1280×720, pixel ratio 1, fixed camera, frozen world, existing
lighting and AA settings. Each composition warms for 15 frames and samples 30
frames; GI comparisons have two rounds. CPU frame duration includes `gl.finish()`
to measure submitted work to completion, not only JavaScript dispatch. GPU values
come from disjoint timer queries. They are separate measurements and should not
be added. Exact hardware, camera, AA and raw samples are recorded in `result.json`.

September 7, 2026 run: RTX 3060, ANGLE D3D11, Chrome 151 on Windows, MSAA 8×.
Camera `[-28.1234, 10.7036, 39.7695]`, bus `[-46.1234, 1.7036, 23.7695]`.
GTAO uses the shipped High preset (intensity 1.05, radius 2.42), every-frame
updates and no denoise. Dynamic uses Medium, intensity 1, radius 1.5 m.
Alpha handling is Exclude. Static AO and legacy contact are off in this A/B.
The current compositions retain live shadows; the GI group uses accepted AI 548
direct/indirect and baked shadows. Compare AO costs within each lighting group.
Numbers are means ± population standard deviation. FPS is 1000/frame mean for
this synchronized harness, not a measurement of interactive display cadence.
GPU queries completed 29/30 or 58/60 samples with zero disjoint events.

| Composition | Frame ms | Equivalent FPS | GPU frame ms | Total calls | Total triangles |
|---|---:|---:|---:|---:|---:|
| Current, AO Off | 9.19 ± 0.59 | 108.85 | 10.65 ± 1.01 | 1,000 | 3,983,712 |
| Current, All GTAO | 14.38 ± 1.19 | 69.54 | 12.82 ± 0.54 | 1,487 | 4,739,074 |
| GI alone | 20.06 ± 2.18 | 49.86 | 8.33 ± 0.99 | 477 | 773,822 |
| GI + Dynamic Only | 23.16 ± 1.88 | 43.18 | 8.78 ± 1.21 | 503 | 843,357 |
| GI + All GTAO | 25.09 ± 2.67 | 39.85 | 12.78 ± 1.50 | 963 | 1,551,450 |

| AO work | Additional calls / triangles | Exclusion-mask calls / triangles | CPU AO submission |
|---|---:|---:|---:|
| Current, All GTAO | 487 / 755,362 | 79 / 341,498 | Not measured separately; existing pass exposes candidate-test timing only |
| GI + Dynamic Only | 26 / 69,535 | 0 / 0 | 5.75 ± 0.93 ms |
| GI + All GTAO | 486 / 777,628 | 79 / 341,498 | Not measured separately; existing pass exposes candidate-test timing only |

Dynamic Only reduces GPU frame cost by 31% versus GI + All in this scene, while
adding about 0.45 ms GPU time versus GI alone. The synchronized frame mean also
improves versus All, but its variation overlaps; this is not a universal FPS
claim. CPU traversal/submission remains material. AO-only GPU time is not
measured separately because its receiver shader work is fused into the color
pass. A precise isolated timer would require a different instrumentation path.
The bounded depth pass removes a full-city redraw; masking final pixels alone
would not account for the measured call reduction.

The final paired captures are `current-off.png`, `current-gtao.png`, `gi-off.png`,
`gi-dynamic.png`, and `gi-all.png`. Against GI alone, Dynamic changes 1.66% of
pixels by more than 2/255 in any RGB channel; All changes 14.25%. Mean absolute
RGB changes are 0.383/255 and 1.474/255 respectively (1280×720 canvas, UI inset
excluded). `image-metrics.json` stores those measurements. These are change-area
metrics, not perceptual accuracy scores. Inspection confirms localized bus
grounding and preserved broad static shading; the isolated footprint has a
continuous center with a soft outer edge. Synthetic tests provide the stronger
static-to-static/direct-light invariants and independent world/self probes.

Motion checks cover a parked bus, a moving bus with a stationary camera, camera
movement and off-screen contact. Dynamic contact recomputes each frame without
history. FXAA, MSAA, TAA and no-AA lifecycle checks passed; the timing table uses
only MSAA 8×. Warm toggles created no additional bake downloads or unbounded
shader growth, retained both channels, and restored canonical geometry. Existing
receiver material and render-optimization regressions also passed. No new
visual-regression baselines are accepted here.

Memory diagnostics estimate the two half-resolution color/depth attachments and
dynamic bounds table: 1,843,296 bytes (1.758 MiB) for one participant at this
resolution. Warm Off retains that allocation for reuse. They exclude driver
overhead, cached geometry copies and
existing baked lightmap allocations. Actual memory bandwidth and calibrated
perceptual quality are not measured: this harness has no GPU bandwidth counters
or perceptual reference image. Bounds contact and screen-depth limitations remain
explicit rather than being hidden by broad static AO.
