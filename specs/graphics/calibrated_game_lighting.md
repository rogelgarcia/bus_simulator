# Calibrated game lighting — AI562

The calibrated 55° integration and corrected v3 transport are installed. Final
installed UHD verification is recorded below. Generated evidence is kept under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/runs/match-01/`.
Original targets and the pre-change installed-bake capture remain immutable.

## Source and display contract

The selected source is AI565's accepted `afternoon/afternoon-02` E55 atmosphere:
55° elevation, 45° azimuth, 0.53° solar diameter, altitude100m, air1,
ozone1 and aerosol0.25. The direct-normal linear-sRGB irradiance is
`[162.714329883607,139.737956495609,109.946178772385]` in the calibration's
radiometric RGB convention. The spectral calculation estimates97.0klux normal
and79.4klux horizontal. Those estimates are model results, not weather measurements.

The runtime directional light uses the first component as intensity and the
normalized RGB vector as color. The environment is the same model's **disc-free**
E55 sky at intensity1; hemisphere intensity is0. Visible and reflected sky share
that source. Its HDR conversion is checked against independent neutral receivers
before installation; the source EXR and conversion receipt are retained.

The display uses the installed Three r183 ACESFilmic operator, linear-sRGB scene
values, exposure multiplier0.0511001705221839 (−4.290528084304614EV), one sRGB
encoding and creative grade Off. The offline implementation retains Three's
internal exposure/0.6 convention. The exposure is global across all five views.
The calibrated display is a presentation choice following physical validation.

The original 35° targets remain visual references, including pose02's selected
image labelled+0.5EV. Their different sunlight and gallery framing prohibit
pixel-error scoring against the new 55° camera captures. Updated Cycles references
use actual exported game geometry, verified camera projection and the E55 source.

## Confirmed corrections

- Generated asphalt normals previously encoded the vertical tangent component
  in green. They now use tangent XYZ with positive blue; the regression fails
  against the old texture generator. Existing surface albedo is preserved.
- Paused game updates skipped city lighting transforms. The paused loop now
  updates visual state without advancing physics or traffic, keeping native sun
  cascades correct at locked capture poses.
- Several authored wall/ground materials suppress environment reflections with
  `envMapIntensity=0`. That also suppressed native diffuse sky in Current mode.
  For Standard/Physical materials, the calibrated environment now supplies its global diffuse intensity through
  the stock PMREM normal lookup independently of each material's reflection
  scale. Specular/clearcoat response and authored base colors remain unchanged.
  Non-calibrated environments retain their previous behavior. Receiver lightmaps
  replace this live diffuse term when applied, so it is not added twice. The
  hook changes runtime sky composition, not the exported BSDF or baked transport.
  Legacy Phong materials, including the bus, retain their authored environment
  response. Iterations006/007 exposed a separate washed-out bus defect: the
  original Phong materials had tone mapping disabled, so the direct renderer
  bypassed camera exposure after Baked mode removed the global AO/composer path.
  The no-post diagnostic reproduces the same pixels. Lit bus surfaces now retain
  the camera display transform in either path; base colors remain unchanged.
  A neutral0.18 surface under uniform0.5 radiance measures0.09 with reflections
  still disabled; repeated calibrated/legacy switches pass the browser regression.
- Exported Phong materials now preserve their actual specular F0 through
  Principled IOR and normalized tint. This is a BRDF approximation; it does not
  make Phong and Principled identical.
- Tagged opaque city window-interior materials receive a deterministic gray/beige
  silhouette texture with seed566 and no emission/transmission. Bus materials,
  window frames and unrelated black trim are excluded. These are opaque textured
  approximations, not physical room geometry or a verified interior-light model.
- Native depth24 foliage validation no longer imposes v4 implicit-gradient
  signed-permutation restrictions on v2 captures. Camera, lattice, source,
  coverage and byte checks remain enforced; the v4 restriction remains enforced
  for actual v4 fields.
- The calibrated55° profile is a separately available production candidate.
  The historical AI531 exact-eight release certificate keeps its original
  inventory. Adding a candidate does not recertify that aggregate release.
- Above the old basis-switch angle, `three-r183-source-lattice-v2` keeps the
  cache axes aligned with the native Three shadow camera. The historical basis
  remains supported and unchanged for existing low-angle packages. The55° grid
  spans960m at16384texels (5.859375cm/texel) so full-city coverage fits the
  unchanged512MiB container limit; the original680m grid at this angle exceeded
  that limit. Source, phase, filter, alpha and native-camera gates still apply.

## Shadow representation

For the high-sun basis, foliage is rendered through Three's native full shadow
map and read back in bounded tile regions. The earlier separately rasterized
tiles disagreed with the live renderer at an alpha-tested leaf edge, even with
aligned pixel centers. The native capture corrected that diagnostic sample;
the complete per-profile validation remains mandatory before installation.
Readback still uses the original Depth24 attachment and authenticated native
transfer, without filtering, occupancy corrections or relaxed tolerances.
The full source map is an offline capture allocation; the runtime package keeps
its existing tiled memory limits. Low-angle capture behavior is unchanged.
The executed 55° parity run (`parity-1789025870311-24340`) passed all 248 samples
across 124 foliage casters: zero occupancy/depth mismatches, maximum depth error
0.000030517578125 m. The validator requires each exact region within the native
source texture and its temporary non-comparison sampler; shifted regions remain
invalid. This is a shadow-data check, separate from final image acceptance.

Static sun data stores nearest occluder depth, not a Cycles beauty image or a
finite-source irradiance map. The calibrated final-view filter estimates blocker
separation in world metres, then uses separation×tan(angular radius) for its
filter footprint. Receiver-plane depth correction rejects self-occlusion on
sloping surfaces. Moving objects retain their independently updated depth map.
Multiplying separate static/dynamic visibility is an approximation where their
finite-source occlusion regions overlap.

Current cascades have an experimental 8-blocker/16-filter sample variant using
native BasicShadowMap depth. Static and moving cached paths use bounded filters
at the same angular diameter. The previous diagnostic/point-filter semantics
remain available for inspecting encoded data. Actual bake and frame-cost review
was required before accepting these variants; the final executed results are below.

## Preserved iteration history

The initial capture is `iterations/000_baseline`. Its CPU metric observed the
wrong frame entry point and is invalid; original GPU and image evidence is kept.
A separate frozen-source replay, `005_original_replay_streamed`, supplies the
valid CPU baseline without loading large source binaries into route strings.
At pose03 it measured22.3ms CPU median/25.8ms p95 and9.65ms GPU median/13.46ms p95.
Iteration001 documents
the paused-light-transform defect and is rejected. Iteration002 fixes that
defect;003 adds finite native filtering. All contain all five poses at1920×1080.

Fresh reference `references/calibrated-export-01` completed in309.6s including
export, reusable Blender scene and five128-sample OPTIX renders. Cameras01/02
share one bus. The early `review-03` groups27 images by pose and includes the original
targets, reference and four game iterations. Its metrics are display diagnostics,
not physical irradiance measurements or a photorealism score. This was an early
review; final UHD and installed-package acceptance are recorded below.

`native-55-01` passed14 independent raw sun/sky/additivity and finite-source
shadow checks in5.0s. This verifies the source-to-renderer conversion; it does
not certify full-city material or transport parity.
The native near/far fixture measures 10–90% shadow-transition widths of 3.043 mm
and 17.119 mm for 0.2 m and 2 m caster/receiver gaps. This verifies contact
hardening at the fixture's resolution. The city cache's 5.859 cm source pitch
still limits reconstructed near-contact detail; it is not millimetre-accurate
geometry, and its minimum reconstruction footprint must be assessed in the crops.

The registered `reference-matching/production` job builds or authenticates the
shadow and indirect dependencies in the shared bake runner before capture,
Cycles rendering and review. `reference-matching/install` requires successful
five-pose candidate capture, native checks and actual-game transition tests,
then uses the existing content-addressed publishers. It preserves previous
indexes and does not claim the historical exact-eight release certificate.

New baked captures also retain pose02/03 native scene-linear float32 images
with all lighting and with named directional lights temporarily zeroed. These
diagnostic renders bypass display/postprocessing and keep existing material AO
textures. Their difference isolates the live sun; their ambient remainder
includes sky, bounce, environment reflections and emission. Cycles sun-only
diffuse/glossy direct passes provide the comparable sun term. Cycles diffuse
direct in the combined environment must not be mislabeled as sun only.
Raw UHD captures transfer in bounded chunks instead of constructing a whole
image-sized browser string, and release the render target and readback buffer
after each diagnostic.

## Historical candidates and runtime checks

The complete E55 candidate run is
`tests/artifacts/screens/ai556_bake_framework/run-1789025159983-24340-8de59910`.
All eleven jobs validated in 2837.2 seconds (47 minutes 17 seconds), including
native foliage parity, sky visibility and bounced diffuse irradiance. The
receiver layout has seven 4096² pages and 1,393,538 charts. This is a compatible
new bake, not a relabelled 35° package. Installation is a separate gated action.

Iterations006 and007 are rejected diagnostic captures. Their images are retained,
but their interrupted mode checks cannot authorize installation. Iteration008
corrects the bus tone-mapping flag and removes inactive static visibility code
from Current shaders while retaining the verified resources. All five images and
the original completion/resource checks then passed. Those checks did not yet
measure full-mode main-thread stalls and were insufficient for publication.
The complete 1080p capture took
311.2 seconds; the separate Current capture009 took57.5 seconds. UHD capture010
took331.5 seconds and repeated those checks successfully.

At1920×1080 on RTX3060 / ANGLE D3D11, the same five locked poses use60 warm-up
frames and180 samples. Values below are median / p95 milliseconds. Original
replay005 retains the original35° production workload;008 uses55°, new sky/bounce
data, finite shadow filtering and the documented source fixes. These are whole
workload comparisons, not an isolated shader speedup.

| Pose | Original CPU | Calibrated baked CPU | Original GPU | Calibrated baked GPU |
| --- | --- | --- | --- | --- |
| 01 | 24.10 /27.90 | 19.30 /20.60 | 11.42 /13.28 | 10.92 /12.64 |
| 02 | 25.50 /26.60 | 21.30 /22.70 | 10.79 /11.43 | 10.52 /12.42 |
| 03 | 22.30 /25.80 | 17.60 /18.80 | 9.65 /13.46 | 10.35 /11.82 |
| 04 | 22.20 /25.40 | 18.90 /20.30 | 8.72 /15.22 | 9.06 /11.01 |
| 05 | 17.30 /21.40 | 13.90 /15.20 | 7.01 /13.43 | 8.35 /9.66 |

Pose03 calls changed856→779, triangles866,587→1,099,368, shader programs247→223,
textures119→102 and reported JS heap2.27→1.89GB. Heap snapshots are affected by
garbage collection. GPU queries are asynchronous and the latest result may repeat
across frames. Current009 costs20.98ms GPU median /26.04ms p95 at pose03 because
it renders live city cascades and the Current AO workload.

The1080p reflection checks exercised15 changes: two glass assignments, one body,
four rims, all seven and back to the exact original references, repeated three
times. No baked-world dropout occurred. Shader/texture/geometry counts plateaued
after the first round. The warm rounds took1.62 seconds each for all five settings;
their maximum frame gaps were35.6ms and35.3ms. The initial round's maximum was
71.8ms. UHD010 repeated the same material ownership checks, also with zero
dropouts and stable allocations.

Before iteration012, complete lighting-mode changes took substantial preparation:
Current26.8s and Auto28.9s at1080p; subsequent explicit Baked1.78s. UHD observed
23.6s,25.1s and1.62s respectively. These end-to-end preparation times must not be
advertised as instantaneous mode switching. They are separate from the reflection
controls. Iteration011 added mode-specific frame-gap measurement and exposed a
23–24 second main-thread block; it is rejected for publication despite having
completed the older capture checks.

Direct RGB baking has not been restored. The complete package's direct channel
is explicitly `hybrid-sun-visibility-v1`: shared shadow depth with live BRDF
evaluation. A second RGB direct atlas would add storage and ownership complexity
without repairing the confirmed display/sky/normal errors. Finite-source filtering
and the independently captured sun contribution are the retained direct-light
comparison. No claim is made that a separate full-city RGB-direct prototype was
benchmarked. Static/moving finite visibility overlap remains an approximation.

The initial UHD reference attempt is preserved as
`references/calibrated-export-02-4k`: Cycles could not open its deeply nested
Windows temporary tile path. The shared runner now records a stage-specific,
short `tests/artifacts/screens/baking_tmp/<hash>` runtime path. A regression checks
path length, workspace containment and distinct job isolation. The retry reuses
the authenticated export and writes a new immutable reference directory.

## Authored UV transform correction

The first UHD comparison exposed a material-scale mismatch: Blender showed much
larger facade bricks than the actual game. The runtime applies `uvTilingConfig`
after each texture matrix, but both the city glTF export and enhanced diffuse
transport adapter had omitted that transform. Adjusting sunlight cannot correct
this mismatch. New exports preserve the scale, offset and clockwise UV rotation,
with the glTF V-axis conversion applied explicitly. Cloned material userData may
contain plain objects instead of Three vectors; both forms are tested.

The first UV-corrected bakes declared `declared-alpha-coverage-uv-v2`; the final
raw-texture correction below supersedes it with v3. Historical v1/v2 formats stay
readable and are never relabeled. All versions authenticate complete source and
page identities. The corrected transport composes the override before wrapping
and applies it to the same texture slots as the runtime, including map alpha but
excluding independent alphaMap and bumpMap. The glTF adapter rejects combined
UV override/independent alphaMap until a slot-specific translation is supported.

Candidate010 and reference03 remain pre-correction evidence. Their successful
other checks do not establish material equivalence or authorize the final UV
corrected integration. A fresh reference and matching diffuse bake are required.

The UV-corrected pilot `calibrated-export-05-uv-pilot` completed five1080p beauty
renders plus two sun-only contributions in368.6s. Projection validation covered
125 visible points with maximum0.000662px error. The exporter applied1803
texture-node overrides. The previous03 UHD reference remains preserved.

Before rebaking, native008 versus corrected pilot05 regional mean scene-linear
luminance ratios were: pose02 shaded brick0.927, asphalt0.992; pose03 lit facade
1.006, canopy/interior aggregate0.955, shaded asphalt1.054. These region means are
diagnostic mixtures of surfaces, not calibrated parity tolerances. The right
building aggregate is0.432 and must not drive a global exposure change. Its
window material is authored as metallic glass with an independent runtime
reflection scale; that scale and local scene reflections differ from glTF's
Principled environment response. Material-index inspection identifies
`MAT_551_MeshPhysicalMaterial` (metalness1, roughness0.19, opacity0.96, IOR1.91,
`buildingWindowGlassOverride`). It is separate from the declared opaque fake-room
proxy. The adjacent wall and shaded red brick also retain material AO in the game,
while the pure Cycles reference intentionally excludes AO textures. This remaining
contribution needs separate inspection; it is not automatically a sunlight error.

Pre-bake UV validation includes four numerical/adapter regressions and every one
of the70 actual material transforms, including a plain-object cloned vector.
The loader browser regression accepts both authenticated v1 and v2 page shards,
rejects mismatched source shards and returns GPU allocations to zero. Fifty-one
related Node regressions cover source texture identity, full receiver coverage,
page padding, coplanar ownership/seams, old settings and calibrated exposure.

The material-index diagnostic erodes silhouette edges by two pixels and measures
only materials with at least 500 remaining pixels. Before the UV rebake, pose 03's
main lit facade has a game/Cycles named-sun ratio of 1.000, but its ambient ratio
is 0.453. Pose 02's red-brick material has ratios of 1.146 and 0.568 respectively.
This isolates a remaining ambient/material discrepancy that broad image averages
can conceal. Both materials use AO textures in the game; the physical reference
does not. A separate capture with material AO disabled is needed before deciding
whether that difference is texture occlusion, baked transport or both. This
diagnostic does not authorize changing albedo or increasing the calibrated sun.
The provisional per-material records are in
`diagnostics/uv-before-rebake/material_radiance.json` under the run directory.

## Corrected bake and shader readiness

The UV-corrected candidate is framework run
`run-1789034212109-29484-e4a88f5e`: all 11 stages validated in 2906.9 seconds
(48 minutes 27 seconds), at 128 OPTIX samples. It has seven 4096² receiver pages,
1,393,538 charts and 1,903,239 triangles. Native foliage parity has 124 casters,
248 samples, no occupancy mismatches and maximum depth error 0.000030517578125m.
The v2 package and its original validated inputs are retained; source changes to
the runtime do not relabel its lighting or material identity.

Iteration011 includes a third raw capture with material AO intensity zeroed.
It restores each original intensity before another game frame. The main pose03
facade's named-sun ratio is 1.000; ambient is 0.452 of Cycles' ambient result.
Removing texture AO raises the ratio to 0.520, or 0.576 against only Cycles'
diffuse ambient. Thus texture AO alone does not explain this difference. At that
point the remaining transport difference had no confirmed cause. The raw-texture
investigation below subsequently isolated the importer defect.
The current bake samples true geometric-normal diffuse irradiance and excludes
glossy bounces. It does not reproduce Cycles' full normal-mapped, glossy transport.

Pose02's metallic glazing also has an authored runtime reflection scale of 0.28
(`iblEnvMapIntensityScale`). The full scene-dependent Principled reflection in
Blender does not implement this environment-only artistic multiplier. This is
separate from the opaque interior proxy, and the bright glazing is not a target
for increasing ambient irradiance throughout the city.

The CPU profile in `diagnostics/mode-profile-01/modes.cpuprofile` identifies the
23–24 second stalls in Three's first-use `getProgramInfoLog`. Submitting shaders
without waiting for readiness let the visible render force synchronous linking.
The coordinator now holds the previous canvas image, continues RAF/UI processing,
and polls shader readiness before rendering the prepared mode. It selects the
actual postprocessing render target and dynamic-AO bindings during submission,
then restores renderer state before yielding. New requests supersede older work;
page hide/disposal cancels polling. A failed preparation retains the previous
image and exposes `view.error`; it cannot silently publish a partial frame.

Auto and Baked reuse the active configuration when their enabled channels agree.
They do not dismantle and rebuild the same receivers. Reflection changes retain
their existing detached-material preparation and keep the city rendering live.
Full world-mode preparation holds a frame rather than claiming to render the
previous world continuously. The initial preparation is still noticeable.

Iteration012 completed in 205.2 seconds (209.0 with framework validation):

| Change | End-to-end seconds | Longest RAF gap | RAF callbacks |
| --- | ---: | ---: | ---: |
| Baked → Current | 18.227 | 570.7ms | 965 |
| Current → Auto | 3.461 | 933.9ms | 139 |
| Auto → Baked | 0.157 | 35.6ms | 6 |

Fifteen reflection changes produced zero baked-world dropouts. Warm five-change
rounds took 1.655/1.618 seconds, with maximum frame gaps 35.3/35.6ms. Program,
texture and geometry counts plateaued, and Off restored exact authored material
references. Captures and installation now require a measured maximum transition
frame gap no greater than 2 seconds. That is an explicit regression ceiling for
this large city, not a claim of a stutter-free first mode change. Focused browser
tests cover cancellation, stale readiness, target restoration and no-op modes;
the four pre-existing transaction/rollback tests also pass.

## Historical target recovery

Image ranking against the original AI560 pilot and final ACESFilmic files finds
L00 / +0.5EV / neutral grade as the closest recipe for both selected targets.
At a 480×270 comparison size, display MAE is 0.01404 for pose02 and 0.02441 for
pose03; the next distinct lighting recipe is 0.03621/0.05151. Pilot images rank
slightly ahead of final renders. Screenshot rescaling and framing prevent an
exact source assertion, so this is labeled a probable match. Copies of the
closest unframed images, source EXRs, hashes, pose and recipe receipts are in
`diagnostics/recovered_targets/`. The original attachments remain authoritative
historical visual context and are never scored against the new 55° sunlight.

## Confirmed raw-texture transport defect

The remaining facade discrepancy was traced through primary-diffuse controls,
the exact BSIB sky, and a reconstruction of the actual static bake scene.
Swapping the world changed facade ambient by about 3%; it did not explain the
large deficit. The reconstructed source's asphalt had almost no diffuse response.
A native emission fixture then proved that assigning `colorspace_settings.name`
after populating a generated Blender image clears its pixel buffer, including
when assigning Non-Color. This affected raw color, normal and coverage inputs;
encoded images retained a reloadable source and were not affected in the same way.

The importer now configures raw buffers before population, decodes declared
sRGB RGB values exactly once into a linear float image, preserves linear alpha
and data, and packs generated images for reusable Blender scenes. The native
fixture checks rendered values and save/reload for sRGB, data, HDR and coverage.
The first three fixed emission checks have maximum errors below 0.00000023;
the expanded selected-test regression, including coverage and persistence, passes.

Control06 reproduces the same facade ambient as the separate reference export:
1.2355 versus 1.2437 mean scene-linear luminance, compared with 0.7933 before
the repair. These are static primary-diffuse controls, not new beauty targets;
the reconstructed source omits moving buses. Source06 completed in 205.6 seconds.
Original and rejected controls remain under the run's diagnostics directory.

New receiver packages use `declared-alpha-coverage-uv-raw-v3` and profile v6.
Historical v1/v2 packages remain readable with their original identities, but
AI562 installation requires v3. Native page-shard tests pass for all three
policies, including source authentication and GPU disposal. The corrected
indirect bake must be regenerated; changing sun strength, exposure or facade
albedo cannot repair this source-texture error.

The first v3 production attempt, `run-1789042962747-25368-57bbc7fc`, stopped at
native shadow parity after 15 minutes. The isolated oracle had stopped the game
loop and attempted to sample a shadow map before asynchronous view preparation
finished. It produced no validated replacement package. The oracle now selects
Current mode explicitly and waits through prepared frames before reading native
resources. A focused browser regression checks delayed allocation and propagation
of preparation errors. The depth, alpha and source-parity checks remain unchanged.

The retry's bounce pass validated in 793.8 seconds. A common-texel comparison
against v2 found zero changed coverage pixels across all seven pages. Mean
luminance ratios vary from 0.863 to 1.387 between pages, confirming a spatial
transport change rather than a uniform exposure multiplier. These atlas-wide
distributions are diagnostics, not image-acceptance scores. The exact values and
reproducible calculation are retained in `diagnostics/bounce_transport_delta.*`.

## Accepted v3 transport and installation

The corrected run `run-1789044043493-11812-7420a6a0` passed all 11 jobs in
2714.4 seconds (45 minutes 14 seconds). Bounce took 793.8 seconds and sky
visibility 766.8 seconds; both use 128 OPTIX samples. The seven 4096² pages
retain 1,393,538 charts and 1,903,239 triangles. Native foliage parity again
passed 248 samples over 124 casters, with no occupancy/depth mismatches and
maximum depth error 0.000030517578125 m.

Candidate `013_raw_texture_bake` passed all five actual-game captures and
two complete Current/Auto/Baked transition rounds in 208.3 seconds. Its
1920×1080 comparisons against the matched UV-corrected reference improved
linearized-display RMSE in all five poses. The changes are modest in the whole
image because the corrected ambient term is only one contribution:

| Pose | v2 / iteration012 RMSE | v3 / iteration013 RMSE |
| --- | ---: | ---: |
| 01 | 0.064676 | 0.064475 |
| 02 | 0.063036 | 0.062819 |
| 03 | 0.071747 | 0.070468 |
| 04 | 0.076091 | 0.075380 |
| 05 | 0.070809 | 0.070592 |

These scores compare equal cameras, source lighting, resolution and display;
they do not establish perceptual realism or a physical tolerance. The raw
material masks show why the change matters: pose03's main facade ambient
luminance rises from 0.592436 to 0.844204 (+42.5%), while named-sun luminance
remains 5.854753 versus Cycles 5.853620. Pose02's red brick ambient rises from
0.376370 to 0.426928 (+13.4%). No exposure, albedo or sun-strength change was
used to obtain these differences.

Residual transport is not claimed to be equal: without authored material AO,
the main facade ambient is 0.969772 versus Cycles diffuse ambient 1.181721;
the red brick is 0.460988 versus 0.536544. The geometric-normal, Lambertian
primary control agrees to about 1%, but atlas reconstruction, shading normals,
material AO and the beauty-render BRDF differ. Both receiver primary shaders
use diffuse roughness zero and the irradiance conversion multiplies by pi
exactly once. The remaining discrepancy has not been fully apportioned among
those representations. Global sky or exposure gain would conceal it and was
not applied. Glass and fake interiors retain the separately documented
material approximations; the calibrated game is closer, not pixel-equivalent.

The registered install stage authenticated the candidate capture, its source
and package bytes, all 14 native fixtures and transition checks before invoking
the maintained receiver and shadow publishers. `install-02` completed in 7.0
seconds and preserves previous indexes. The first `install-01` attempt was
denied write access at the shared asset junction before publication; its
diagnostic log remains. The accepted receiver directory is
`2f9d6e9f7aa3cddef232de1ab9185ec85d89d131712f7c6991c941a145ecc428`, with policy
`declared-alpha-coverage-uv-raw-v3`. This is a validated development cache;
it does not replace the separate historical aggregate release certification.

## Final 1080p runtime comparison

RTX3060 / ANGLE D3D11, identical five locked cameras and bus placements,
1920×1080 at pixel ratio1, 60 warm-up frames and 180 measured frames per pose.
Original replay005 retains the original35° lighting; candidate013 uses the
calibrated55° world, new diffuse transport and finite-sun filters. These are
whole-workload before/after measurements, not an isolated optimization. FPS is
1000 divided by measured mean frame interval. CPU/GPU pairs are median / p95
milliseconds; GPU queries are asynchronous and completed samples may repeat.

| Pose | Mean frame ms, before → after | FPS, before → after | CPU ms, before → after | GPU ms, before → after | Calls, before → after |
| --- | --- | --- | --- | --- | --- |
| 01 | 24.72 → 19.39 | 40.4 → 51.6 | 24.10/27.90 → 19.10/20.20 | 11.42/13.28 → 10.88/12.49 | 896 → 829 |
| 02 | 25.65 → 21.58 | 39.0 → 46.3 | 25.50/26.60 → 21.30/22.30 | 10.79/11.43 → 10.50/12.33 | 1080 → 1015 |
| 03 | 22.32 → 18.11 | 44.8 → 55.2 | 22.30/25.80 → 17.90/19.20 | 9.65/13.46 → 10.32/11.80 | 856 → 779 |
| 04 | 22.32 → 18.75 | 44.8 → 53.3 | 22.20/25.40 → 18.50/19.60 | 8.72/15.22 → 9.02/10.84 | 759 → 772 |
| 05 | 17.87 → 17.60 | 56.0 → 56.8 | 17.30/21.40 → 13.70/15.40 | 7.01/13.43 → 8.36/9.68 | 438 → 443 |

At pose03 triangles change866,587→1,099,368, programs247→125, textures119→101,
and reported JS heap2.274→1.938GB. Heap is sensitive to garbage collection;
these are observed counts, not a complete VRAM measurement. Receiver resources
report689,766,400 resident bytes including mapping, with587,202,560 bytes for
the indirect pages and143,553,961 compressed bytes. The original and calibrated
workloads differ; the higher GPU medians on poses03–05 are disclosed above.

Candidate013 reflection controls have zero baked-world dropouts and stable
program/texture/geometry counts after warm-up. The cold five-setting sequence
took5.37s with52.3ms maximum frame gap; repeated sequences took1.58/1.60s with
35.6/35.9ms maximum gaps. First Current preparation took18.09s but its maximum
frame gap was544.6ms, replacing the previous24s single block. First Auto took
3.32s with950.3ms maximum gap; explicit Baked took0.106s. The second round took
0.165/1.036/0.106s for Current/Auto/Baked, with maximum gaps70/864.1/35.2ms.
Full-mode preparation retains the last coherent image. It is not instantaneous
and still has subsecond hitches; reflection controls continue rendering the
world. The2s gate is a regression ceiling, not a stutter-free guarantee.

## Installed UHD acceptance and review

`iterations/014_installed_4k` reads the installed indexes directly, without
candidate routing. All five 3840×2160 captures have active E55 shadows, v3
indirect lightmaps and activation blend1. It completed in241.2 seconds,
including63.1 seconds of initial scene/bake preparation. The same60/180-frame
measurement procedure produces the following separate UHD workload results:

| Pose | Mean frame ms | Observed FPS | CPU median / p95 ms | GPU median / p95 ms |
| --- | ---: | ---: | --- | --- |
| 01 | 21.03 | 47.6 | 20.00 /27.10 | 20.68 /26.57 |
| 02 | 22.47 | 44.5 | 22.00 /24.50 | 21.63 /25.25 |
| 03 | 18.66 | 53.6 | 18.40 /19.50 | 16.04 /24.48 |
| 04 | 19.63 | 51.0 | 19.30 /20.90 | 21.05 /23.67 |
| 05 | 17.56 | 57.0 | 14.20 /15.30 | 18.75 /20.97 |

Fifteen reflection changes again produce zero world dropouts and stable
allocations. Warm five-setting rounds take1.66/1.64 seconds, with maximum frame
gaps35.6/35.5ms. First Current/Auto/Baked preparation takes19.07/3.39/0.109
seconds; repeated preparation takes0.248/1.074/0.100 seconds. Maximum full-mode
frame gap is950.5ms. There is no return of the23–24 second synchronous block.
Subsecond mode hitches remain explicitly outside a smooth-frame guarantee.

The final reference `references/calibrated-export-06-uv-4k` contains five UHD
256-sample Cycles/OPTIX beauty renders, pose02/03 sun-only passes, raw EXRs and
packed reusable `source_city.blend` / `calibrated_city.blend` files. It took
1078.3 seconds (17 minutes 58 seconds). Projection validation checks125 points
with maximum error0.000662 pixels; camera01/02 share one bus. All1803 authored
texture-node overrides are preserved. Later runtime readiness changes do not
alter the reference scene or light recipe.

`review-04` authenticates and groups92 images over five poses: original targets,
the original game,14 captured game iterations (including rejected diagnostics),
and four versions of the Cycles reference. It takes160.8 seconds to build the
page, full-resolution crops and measurements. The selected browser test passes
image decoding, five-pose grouping, full-resolution carousel, keyboard arrows,
original-frame navigation and three-column comparisons. Review screenshots are
in `../../report_qa/1789048032589/` relative to the run directory. All five final
game views and the pose02/03 target comparisons were visually inspected; the
canopy/interior history was also reviewed. Original35° targets stay visible and
are not scored against55° light. The calibrated diffuse/transparency/BRDF
limitations above remain visible rather than being hidden by exposure changes.

The accepted bake (45m14s), final Cycles reference (17m58s), installed capture
(4m01s) and report (2m41s) are stage timings, not the total investigation time.
All earlier bake, render and rejected diagnostic runs are retained separately.

## Reproduction and remaining boundaries

Use the leaf options and shared Blender configuration in the experiment README.
The executed sequence is: `baseline`, `sky`, `native-validation`,
`lighting/illumination`, candidate `capture`, `reference`, `install`, installed
`capture`, then `review`. Every expensive leaf is explicitly registered under
`node tools/bake.mjs`; the parent `reference-matching/production` automates the
compatible bake → capture → reference → review portion. New output directories
preserve immutable evidence. Existing source hashes and content receipts govern
reuse; changing source transport requires a new bake. Installation retains its
separate validation gates, including all-five applied states and actual-game
transition checks.

Selected deterministic regressions cover calibrated settings and old overrides,
source texture identity, raw sRGB/data/HDR/alpha transport plus packed reload,
authored UV transforms, generated asphalt normals, Phong F0/interior export,
diffuse sky independent of reflection intensity, finite-sun contact hardening,
native high-sun alpha projection, v1/v2/v3 receiver loading/disposal, paused
visual updates, asynchronous shader preparation and cancellation, and lighting
transactions. The final report browser regression and `git diff --check` pass.
The source conversion fixtures establish numerical checks; city image metrics
remain diagnostic. No blanket photorealism or custom-shader parity certificate
is issued. The twelve AI567 grazing material cases remain source-review evidence,
not a claim that every custom material now has an identical production BSDF.

Calibrated values are the new defaults. Saved explicit lighting/atmosphere
overrides remain honored; resetting those settings chooses the calibrated
defaults. Default bus reflection/probe switches are not forced on, and the
authored bus color values are unchanged. Legacy Phong shading with those
features Off still differs from Cycles' environment-lit Principled translation.
Further bus/glass or ambient-detail matching must be evaluated as a declared
material/transport change rather than another sun or exposure calibration.

Direct RGB baking remains disabled: the corrected source composition and
distance-dependent depth reconstruction are retained. A separate direct atlas
was not demonstrated to improve these confirmed failures and was not restored.
Native sun-only captures, depth/finite-source fixtures and Current/Baked images
document that decision; no unexecuted full-city RGB-direct benchmark is claimed.

## Same-angle viewing follow-up

The user requested that the visible comparison use55° for every version and
that the slideshow exclude intermediate iterations. Capture015
(`iterations/015_uncalibrated_55_4k`) reuses the authenticated original baseline's
light recipe on the corrected game runtime: white sun7, hemisphere1.22,
German-town HDRI0.28, exposure1.02, ACESFilmic and grading Off. Sun elevation is
changed to55° and azimuth stays45°. Original analytic sky/background settings
are retained; sun bloom is Off as in the calibrated captures. All five UHD
poses passed before/after checks of the actual sun angle, lighting recipe and
absence of active baked shadows/indirect. Capture took91.8 seconds.

This control uses Current mode because the historical35° bake is incompatible
with55°. It is not a rebake of the old recipe, nor a frozen-old-renderer replay.
The comparison consequently includes the live/baked transport difference;
its purpose is comparing complete old/new light configurations at the same
sun direction. The calibrated game and Cycles images are reused unchanged.

`review-05` uses columns in the requested order: uncalibrated game55°, final
calibrated game55°, calibrated Cycles55°. Only these three enter the image
carousel and labeled thumbnail strip. Every pose's original targets and
intermediate versions remain in a collapsed archive; diagnostic crops use
the three final comparison versions. The large-image caption identifies the
renderer, lighting mode, angle and exposure rather than only a run number.
The browser regression verifies three-slide wraparound, keyboard and thumbnail
navigation, all-five UHD controls, collapsed history and final-only crops.

## In-game daylight comparison

The Lighting tab has a Previous / Calibrated selector. Both recipes retain
55° elevation and 45° azimuth so shadows can be compared without moving the sun.
Previous uses the original white sun 7, hemisphere 1.22, German-town
HDRI 0.28, analytic visible sky and exposure 1.02 in Current mode. Calibrated
uses the measured E55 recipe and requests both matching baked shadows and
indirect illumination. Existing package compatibility and fallback rules apply.
Both select ACESFilmic, grading Off and sun bloom Off. Bus reflection/material
preferences, camera, vehicle placement and unrelated graphics controls remain
as selected. The selector compares light recipes on the current renderer; it
does not restore old renderer code or reuse a 35° bake at 55°.

Manual changes show Custom instead of falsely identifying a known recipe.
Save persists the actual lighting, atmosphere and baked preferences; Cancel
restores the prior complete settings. The options draft retains the environment
ID and linear sun color through edits, reset and persistence. Previously both
fields were omitted by the UI even though the engine supported them.

Options changes wait for a replacement HDR environment before applying the
associated atmosphere, postprocessing and baked-mode changes. Requests are
superseded together, including cancellation while loading. Existing view
preparation holds the last coherent city image while matching resources and
shaders prepare; the selector reports preparation rather than claiming that
the new baked view is already applied.

The glass/color differences in the comparison remain material/transport work:
runtime glass samples a global environment with authored per-material reflection
scales, while Cycles traces local scene visibility and uses exported window
approximations. Pose05 also retains facade shading differences. This selector
does not claim to resolve those differences or adjust source calibration to
conceal them.

### Selector validation

The first Current-to-Previous switch initially rendered only sky and line
outlines. Changing the environment switched the renderer from calibrated
finite-sun shadow sampling to PCF, but left the city's finite-sun material
shader attached. The focused regression reproduced the missing city rebuild;
the fix updates the renderer and city shadow system together and retains the
view until preparation completes. Switching recipes also updates the live
sun color, rather than only the serialized color.

Ten browser checks and two settings serialization checks pass. The full-city
test switches Previous → Calibrated twice, verifies unchanged camera/bus,
sun direction/color, shadow technique, no shader errors or prematurely exposed
baked frames, and checks Save and Cancel. Both final screenshots were inspected.
Evidence is under the gitignored
`tests/artifacts/screens/daylight_presets/1789079582896/`.
That run took 1.8 minutes: the first calibrated load took 56.5 seconds;
the other switches took 8–15 seconds, including resource/shader preparation.
These are transition timings from the test machine, not steady-frame costs.

### Following game defaults

Options has a **Use defaults** footer action. It applies all current Options
defaults, clears the saved overrides for the fourteen Options settings groups,
and closes the panel. It waits for lighting replacement before clearing storage;
if Cancel supersedes the pending load, the saved overrides are retained. Other
browser storage (vehicle selection, poses, etc.) is untouched.

With no saved override, each group's resolver reads its source defaults on the
next game load. Editing a defaults file therefore takes effect after a reload;
this is not hot reloading into an already running game. Existing URL overrides
still take precedence where supported.

Save now persists only groups changed during the Options session. Opening
Options and saving without edits does not freeze the defaults again. Explicitly
edited groups remain saved snapshots, while untouched groups keep following
defaults. Reset remains a preview of today's values; Reset followed by Save
explicitly saves that complete snapshot. Cancel does not change persistence.

The default-inheritance browser regression clears all fourteen groups, retains
unrelated storage, verifies an unchanged Save, serves a changed source exposure
on reload, and verifies both inherited and custom values. It also checks Reset,
Cancel during loading, and non-overlapping footer buttons at a narrow viewport.
The Options entry path now passes the live environment ID and sun color into
its draft; the missing fields previously changed to calibrated values on reopen.
All eleven browser checks for defaults, live editing, daylight presets and the
full city pass. Full-city evidence, including the Use defaults footer, is in
`tests/artifacts/screens/daylight_presets/1789086435934/`; the city run took
2.4 minutes. The defaults-file reload test changes only the served test response,
leaving the repository's calibrated source values unchanged.
