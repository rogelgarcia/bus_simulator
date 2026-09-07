# Dynamic AO: bus grounding correction and lab

**Historical floor-only checkpoint.** The definition and implementation below
have been superseded by hemisphere-clipped bus-volume contact and removal of the
sunlight-dependent fade. See [the current AO contract](ambient_occlusion.md#ai-534-scope-selection)
and [current validation](illumination_534_ao.md#validation). The old tables are
retained as historical evidence, not measurements of the current implementation.

September 7, 2026. This corrects the contact implementation committed in
`a77656a`, following user captures of a broad black halo, contact spilling onto
walls, and AO darkening sunlit ground. It preserves the accepted AI 533/548
engine, baked direct/indirect channels, scope selection and All-mode controls.

## Decision

Default to **Underbody** for bus grounding, combined with actual Three GTAO for
visible self/world detail on dynamic receivers. Other registered dynamic objects
use GTAO. The saved **Bus grounding: Underbody / GTAO** control provides a live A/B
without changing either baked channel. Generic GTAO remains available for buses
whose underbody cannot be approximated by a floor rectangle.

| Method | Strengths | Limits / cost |
|---|---|---|
| Analytic bus floor | Continuous center coverage, stable off screen, smooth edge fade, no wall-volume halo; no extra floor camera or sampled rays | Approximate rectangle; fills wheel-well gaps; does not represent arbitrary undercarriage or bus-to-wall contact |
| Generic GTAO | Actual visible geometry, self-contact, nearby world contact, supports other dynamic shapes and cutouts | Missing off-screen/hidden depth layers; edge noise; paired depth/GTAO/denoise work to avoid adding static AO twice |
| Hybrid default | Analytic ground coverage plus GTAO self/world detail | Still pays one bounded depth + GTAO/denoise pair; CPU traversal remains material in the city |

This is a measured choice for the current box-like bus, not a claim that analytic
contact is universally more accurate than GTAO or a path-traced reference.

## Geometry and composition

`VehicleUnderbodyOccluder.js` examines opaque downward horizontal triangles in
root-local coordinates, groups coplanar faces at 0.1 mm precision, rejects sparse
planes (less than 85% rectangle coverage) and duplicate/overlapping candidates
(over 102%), and selects the lowest plane within 5% of the largest covered area.
These are explicit bus-approximation tolerances, not bake receiver selection.
The 85% fill allowance accommodates wheel wells. The initial 98% gate selected
an internal floor; actual underside ray probes caught this before adoption.

The real bus has a closed underside at all 15 audited center/length points.
The selected floor is at model-local Y=1.031716 m, approximately 0.304 m above
wheel bottom, with X=[-1.327275, 1.327275] and Z=[-5.676983, 6.116238] m.
No bus mesh update was necessary. Registration refreshes after the model loads.
An optional validated `aoUnderbody: {min:[x,y,z], max:[x,y,z]}` descriptor opts a
participant into the approximation; absence selects generic GTAO. Mobility is
still determined by the authoritative registry, including parked vehicles.

The shader integrates the cosine-weighted solid angle of that floor rectangle.
Clearance and lateral distance fade the result; supporting receiver normals
receive the term, vertical walls do not. Root inverse and basis are prepared on
the CPU, so the material shader does not invert a matrix per fragment. This
avoids the old enclosing-box nearest-point halo and fills the whole underside.

Three r183 GTAO evaluates half-resolution, alpha-aware bounded scene depth.
Low/Medium/High request 8/16/32 samples, followed by an eight-sample, two-pixel
Poisson denoise. Generic dynamic-to-static contact uses visibility with all
casters divided by visibility without generic casters; identical denoise noise
avoids stochastic differences between the pair. Static-to-static AO therefore
is not multiplied onto accepted baked indirect a second time. The second pair
is skipped when all casters use analytic underbodies. Dynamic receivers use the
full GTAO result for self/world contact. Screen-space hidden-layer limitations
still apply, especially around thin surfaces and silhouettes.

The maximum analytic/GTAO occlusion scales only indirect diffuse/specular, after
authored material AO, and clamps remaining visibility to at least 0.1. The user's
direct-light-priority policy fades supplemental AO out as direct diffuse exceeds
10–50% of indirect diffuse. Direct sunlight and emission themselves are never
multiplied. Physical ambient occlusion does not disappear in sunlight; this
explicit artistic policy prevents the dark overlay the user rejected.

## Reproducible experiments

Use the standard selected-test runner with:

- `tests/headless/e2e/dynamic_ao_bus_lab.pwtest.js`: actual installed bus on a
  neutral plane, sun / ambient-only shade / close wall, fixed 1280×720 camera.
  Both paths warm for 240 alternating frames, then each measurement warms for
  20 frames and records 80; method order reverses for the second round.
- `tests/headless/e2e/ambient_occlusion_534.pwtest.js`: installed city and accepted
  enhanced bake, 1280×720 MSAA 8×, fixed initial platform view. Each mode warms
  for 15 frames and records 30, repeated twice. Also validates lifecycle/AA.

Artifacts are gitignored under `tests/artifacts/screens/illumination_534/`:
`contact_lab/results.json`, `contact_lab/summary.json`, sun/shade/wall PNG pairs,
`contact_lab/analytic-footprint.png` and `city_contact/result.json` / PNG pairs.
The footprint deliberately hides the bus only during color rendering to expose
its complete analytic factor. It is a diagnostic view, not a beauty capture.

Hardware: RTX 3060, ANGLE D3D11, Windows, Chrome 151. GPU values below are complete
frame disjoint-query means ± population standard deviation. No disjoint events
occurred. Lab collected 160 samples/method; city collected 58/method. There is no
GPU clock lock and variation is substantial: this is not a universal FPS claim.
CPU submission and calls including `gl.finish()` are retained in raw JSON; browser
dispatch duration is not interchangeable with GPU execution or display cadence.

| Neutral bus lab | GPU frame ms | Total calls | Total triangles |
|---|---:|---:|---:|
| AO Off, warm | 1.48 ± 0.98 | 47 | 57,846 |
| Hybrid: analytic ground + GTAO detail | 2.87 ± 0.99 | 71 | 86,736 |
| Generic GTAO, including bus ground | 3.70 ± 1.88 | 75 | 86,752 |

| Installed city, both baked channels | GPU frame ms | Total calls | Total triangles |
|---|---:|---:|---:|
| AO Off | 7.05 ± 0.75 | 477 | 773,822 |
| Hybrid Dynamic Only | 7.68 ± 1.40 | 505 | 843,359 |
| Generic GTAO Dynamic Only | 8.57 ± 1.81 | 513 | 884,022 |
| All GTAO | 12.72 ± 1.51 | 963 | 1,551,450 |

Hybrid city GPU mean is 0.89 ms (10.4%) below generic Dynamic Only; each matched
round improved by 0.81 and 0.97 ms. The deviation ranges overlap, so treat the
size of the gain as indicative. CPU AO submission averages 5.75 ms hybrid and
6.17 ms generic; total synchronized JS-frame averages overlap and do not support
an additional CPU/FPS claim. The dependable structural saving is one depth pass
and one GTAO/denoise pair: eight calls and 40,663 triangles in this city view.

At this resolution, active color/depth targets and participant data estimate
5,529,744 bytes (5.27 MiB) hybrid and 11,059,344 bytes (10.55 MiB) generic. Switching
back retains the second allocation for warm reuse, as does AO Off. `targetBytes`
reports retained allocation; `activeTargetBytes` distinguishes the active work.
These estimates exclude cached geometry, noise textures, driver overhead and
the independently retained bake resources.

## Visual findings and regressions

The neutral shade captures show smoother continuous grounding from the analytic
floor; generic GTAO has more visible screen-edge speckling. The footprint has a
dark center and a narrow outward fade. The nearby wall remains free of the old
bounding-volume halo. Sun captures retain the actual directional shadow; the
material probe, rather than visual judgment alone, verifies direct-lit output.
No calibrated perceptual score or path-traced ground-truth image is claimed.

Passing checks include:

- Linear rendered pixels: full center/end coverage, translating/rotating bus,
  off-screen caster, vanishing padding at zero clearance, unchanged vertical
  wall and direct-lit output, repeated Off/On with stable program count.
- GTAO fixtures: visible dynamic self/world contact, generic-to-static contact,
  receiver exclusion, cutout holes, and a static corner whose raw GTAO is dark
  but whose supplemental ratio remains white (no duplicated static AO).
- Actual bus underside ray audit; material hashes and source geometry unchanged.
- Settings and UI: grounding-method Save/Cancel, AO Off, independent parameter
  banks, effective-indirect scope switching and fallback.
- Installed city: both baked channels remain active, parked/moving bus, camera
  motion, FXAA/MSAA/TAA/Off, Off/On recovery, no extra warm bake downloads, no
  shader/WebGL errors.

## References

- [Three GTAOPass](https://github.com/mrdoob/three.js/blob/r183/examples/jsm/postprocessing/GTAOPass.js)
  and [GTAO shader](https://github.com/mrdoob/three.js/blob/r183/examples/jsm/shaders/GTAOShader.js)
  provide the actual horizon-search and denoise implementation used here.
- [Practical Real-Time Strategies for Accurate Indirect Occlusion](https://research.activision.com/publications/2020-03/practical-real-time-strategies-for-accurate-indirect-occlusion)
  explains the GTAO approach and its screen-space assumptions.
- [GPU Gems: High-Quality Ambient Occlusion](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-12-high-quality-ambient-occlusion)
  discusses polygon form factors; the bus floor is a deliberately restricted
  analytic approximation, not an implementation of that chapter's full solver.
