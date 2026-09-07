# Optional receiver illumination — AI 533 and AI 548

## Accepted configuration

The September 7, 2026 [AI 533 acceptance record](illumination_533_acceptance.md)
retains baked direct, baked indirect, AI 548 and the current engine. It records
the current publication, measured limits, historical comparison-map freshness
and optional desktop residency policy. Earlier first-pass measurements below
are historical evidence, not the current completion or default-promotion status.

## AI 548 gated extension

`receivers.enhanced` is a persisted, strict boolean, default false. Options exposes
it as **Enhanced baked illumination (AI 548)**. False selects the original AI 533
runtime/publication. True lazily imports the enhanced shader/runtime and selects
`assets/baked_lighting/receivers/enhanced/package_index.json`. Direct/indirect
intent and linking remain independent of this implementation selection.
Save/Cancel/Reset and presets carry the new flag. Each implementation retains its
own compatible CPU/GPU maps when disabled; only the selected implementation binds
geometry/material hooks. City changes, context loss and disposal retire both
caches. Active maps reject stale source immediately; inactive maps undergo a
full freshness check before reuse. There are at most two implementation caches, with no unbounded
profile history. Enhanced cold activation stages shadows before receiver packages
to bound concurrent decoding of the largest payloads.

The enhanced toggle title is immediately followed by a monochrome outlined warning
icon. Its tooltip says: "This feature is buggy and should not be used. It can cause
visual artifacts." The checkbox exposes the same warning as its accessible description.

The enhanced exporter uses four concurrent, deduplicated texture captures while
retaining byte-identical source identities. The default exporter still captures
sequentially. A frame watch compares matrices, source inventory/attribute shapes
and versions, texture sampling, material transport fields and authored semantics.
Captured scalar fields are deduplicated and grouped by their property schema.
Fixed property readers are compiled once per captured schema using JSON-quoted
property names. This replaces the expensive generic per-field lookup loop without
weakening the checked field inventory or redefining renderer properties. Array
snapshots are deduplicated by identity. Frame checks allocate no serialized profiles.
Private shader bookkeeping is excluded consistently with the source exporter.
Typed-array data edits follow Three's `needsUpdate`/version contract; source
matrices remain compared directly. Full comparison precedes reactivation.
Reversible property accessors and per-property reader columns were measured and
rejected because they slowed the renderer. The original generic watch also regressed
frame cost; the follow-up replaces it with the schema readers described above.

Options applies only changed settings groups for every live edit, including AO,
anti-aliasing and baked illumination. Screen AO (Off/SSAO/GTAO) is independent of
baked indirect illumination and sky occlusion. Changing it must not reapply road
materials, invalidate receiver sources, dispose cached maps or disable AI 548.
Cancel compares the initial UI snapshot with the applied UI snapshot, then restores
original engine values only for edited groups; hidden engine fields must not make
unchanged groups appear edited. Save, reopening Options, switching implementations
and toggling channels retain compatible maps. Actual source edits still require
the existing exact freshness checks. Default-page tests use isolated temporary city materials and shadow-free
fog fixtures so the automatic core suite cannot alter gameplay textures or CSM.
These fixture changes do not change the default material factory or game lighting.
### Directional representation

`chart-affine-irradiance-v1` stores `E(n) = max(0, c0 + cx*nx + cy*ny + cz*nz)` per
RGB component, evaluated in the receiver chart's orthonormal world frame. That
frame is recovered from view-position and lightmap-UV derivatives, so the final
runtime normal includes normal maps, bump maps and instance transforms without
changing PBR UVs. The four Cycles samples are the geometric normal and three
azimuths at `nz = 1/sqrt(3)`. The fit reproduces the geometric-normal sample
exactly before quantization and exactly reproduces affine irradiance fields.
It is an angular approximation, not full radiance storage.

The corrected v2 publication declares `coefficientLayout: flat-first-rgb-v1`.
Its three RGBA layers store `(Eflat.rgb, cz.r)`, `(cx.rgb, cz.g)`, and
`(cy.rgb, cz.b)`. Evaluation is `max(0, Eflat + cx*nx + cy*ny + cz*(nz-1))`.
This is algebraically equivalent to the original coefficients; old publications
remain readable. Flat surfaces need only the first indirect-layer sample.
The v2 pages additionally require `receiver_directional_flat_first_v1`. Older
open tabs reject this capability and keep live lighting instead of interpreting
the new bytes as old coefficients. Reloading loads the compatible enhanced decoder.
At binding time, geometric/vertex-normal agreement and transform handedness are
checked. Materials with normal/bump maps, back-face rendering, smooth normals or
sheared instances retain the complete directional path. Proven flat receivers
also omit the chart-frame reconstruction and direct-light cosine correction.

Primary bake evaluations use a white Lambert receiver; secondary rays retain the
reconstructed source material. Blender's bump-map smoothing correction is disabled
on the probe materials: it would otherwise modify the measurement for the three
artificial tilted normals. The analytic sun calibration agrees within 0.000001
irradiance units. Independent 256-sample colored-wall/overhang cases at 20–40°
record approximately 3–13% normalized RMS angular error, including Monte Carlo
noise; the worst case is directed toward the occluding wall. This limitation is
why the feature remains an opt-in preview. It does not provide GI on the bus.
Final receiver normals are evaluated live. Secondary-bounce surfaces still use
the existing offline material reconstruction, which does not reproduce all
custom shaders or normal/bump detail. This is not complete Blender/game material
parity, and the angular reference fixture does not measure that reconstruction error.

The enhanced compiler reconstructs procedural opacity for sidewalk dirt strips and
asphalt edge wear, using the original `uv` layer, authored fade and world-space
noise. The earlier reconstruction treated these participant surfaces as opaque,
incorrectly blocking illumination below decorative overlays. The correction is
confined to the enhanced bake and requires regenerated maps; raising samples or
changing HDRI intensity cannot repair the earlier zero-light texels.

The direct map remains geometric-normal irradiance. Its diffuse replacement is
scaled by `max(dot(runtimeNormal, sunDirection), 0) / dot(chartNormal, sunDirection)`
only when the denominator exceeds 0.05; otherwise live direct diffuse remains.
Static sun visibility is already in the map; moving-object visibility multiplies
once. Live specular/reflections remain. Existing AO composition is unchanged and
remains owned by AI 534.

### Coverage, storage and filtering

The enhanced first publication uses the same four 2048² pages, world texel density,
padding and explicit mip limits. It partitions oversized coplanar groups without
altering source triangles, uses rectangle packing and prioritizes nearby walls,
ground and useful larger surfaces. Individually oversized triangles and tiny
geometry details stay live; normal/bump maps are no longer a receiver exclusion.
Metallic, displaced, unsupported/custom and alpha receivers retain their original
fallback policies. The final manifest records every exclusion.

Indirect coefficients occupy three RGBA layers per spatial page, using the
declared layout (the original publication stored each color separately).
Independent per-layer component scale/bias quantizes values to
RGBA8, retaining signed/HDR range. Decoding is affine, so hardware linear/trilinear
filtering remains linear in irradiance; every mip shares the same authenticated
scale/bias as its base layer. The original RGBA16F decoder is unchanged. Directional
RGBA8 pages require `receiver_directional_sampling_v1`; the old runtime cannot
activate them. The two enhanced channels share one validated coordinate texture.
Non-instanced receivers use vertex coordinates directly, and keep indexed geometry
when shared indices have identical lightmap coordinates. Instanced receivers retain
their per-instance coordinate lookup.
Interpolated page identifiers are rounded to the nearest integer before selecting
directional coefficient layers and decode ranges. Truncation can select the
preceding page when perspective interpolation rounds a constant slightly down;
the GPU regression includes that boundary and independent instance values.

The enhanced material adapter restores its uniform references before drawing when
Three r183 reuses a cached shader with another variant's material uniform table.
It invalidates the uniform upload list only when ownership changes and restores
the original render callback on disable. Pixel regressions cover returning from
legacy to enhanced, debug colors and disabling a channel after reuse. Status-only
activation checks cannot establish that the GPU uses the selected values.
The pinned [Three r183 renderer](https://raw.githubusercontent.com/mrdoob/three.js/r183/src/renderers/WebGLRenderer.js)
calls the material callback before selecting its program; this adapter depends on
that audited ordering.

Evidence and controlled benchmarks live under
`tests/artifacts/screens/illumination_548/`. `same-coverage/` holds repacked copies
of the unchanged original bake to separate runtime/storage effects from changes
in coverage and directional representation. The enhanced bake took 1876.76 seconds
(31.3 minutes), at 64 samples and four diffuse bounces on the pinned existing CPU
Blender build. It maps 1680 triangles / 274 charts, including 140 normal-mapped
triangles, across 15,203.23 m². Coverage is focused rather than city-wide.

Of that area, 13,248 m² is ground (23 charts); the rest is selected sidewalks,
curbs and building trim. The original publication covered 19,986.58 m², mostly
different large surfaces. More mapped triangles do not imply greater city area
or complete facade coverage. Most facades remain excluded by custom-material,
metallic or page-budget policies. Increasing samples alone will not change that.
The overhang capture exposes a visible boundary between mapped and live triangles
on one underside. Its unmapped side matches the live-lighting reference; the
original publication covered that area differently. Whole-surface coverage and
budget allocation remain quality work before this can replace the original
preview. This boundary is distinct from atlas filtering or angular-fit error.

| Publication | GPU texture storage, both channels | CPU texture backing | Gzip download, both channels |
|---|---:|---:|---:|
| Original scalar | 347 MiB | 347 MiB | 49.31 MB |
| Same-coverage compact scalar fixture | 173.5 MiB | 173.5 MiB | 10.44 MB |
| Enhanced directional | 344.09 MiB | 344.09 MiB | 102.76 MB |

Enhanced direct pages occupy 85 MiB, indirect coefficient pages 255 MiB, and
shared coordinates 4.09 MiB. Visiting both implementations retains approximately
691 MiB in receiver textures, plus CPU backing, geometry/source metadata and
the separate shadow cache. Directional indirect spends the format saving on
three coefficient layers; its signed/noisy coefficients also compress less
effectively. The larger download is intentional quality storage, not a faster
runtime claim. Page streaming, eviction and releasing CPU backing are deferred.

Comparison with the full-precision city bake gives normalized RMS storage error
of 0.176% for direct RGB and 0.768% for indirect coefficients. Those measurements
are separate from the 3–13% angular approximation error. Four explicit mips share
decode ranges, and padded charts retain the existing mip-3 limit. Higher sample
convergence and higher-order directional fits remain follow-up work.

References: [Blender 5.2.1 bump-shadowing implementation](https://raw.githubusercontent.com/blender/blender/v5.2.1/intern/cycles/kernel/closure/bsdf.h),
[Valve directional-basis background](https://cdn.steamstatic.com/apps/valve/2004/GDC2004_Half-Life2_Shading.pdf).
The affine four-sample fit above is distinct from Valve's three-term RNM shader.

### Initial v1 measured runtime assessment

RTX 3060 / Ryzen 5 9600X, Chrome 151/D3D11, 1280×720, paused
`civic_center_curve_front`, default lighting, visibility map disabled, final view.
Each mode has three alternating-order runs with 30 warm-up and 300 measured
frames per run. GPU values use the existing engine timer without nested queries.
These are combined direct/indirect results:

| Implementation | CPU mean / median / p95 ms | GPU mean ms | Source check mean ms | Observed FPS |
|---|---:|---:|---:|---:|
| Original scalar | 20.60 / 20.30 / 23.80 | 14.33 | 2.02 | 47.66 |
| Compact scalar, same bake/coverage | 30.31 / 30.00 / 32.60 | 16.30 | 9.54 | 32.63 |
| Enhanced directional, revised coverage | 32.43 / 31.80 / 38.20 | 17.12 | 10.16 | 30.49 |

The compact representation demonstrates a storage benefit, not a frame-time
benefit. The stronger validation watch accounts for most of the measured CPU
increase; GPU render time also increases. Draw calls/triangles remain
1,842 / 2,519,283 in this workload. Per-shader time, bandwidth utilization and
driver peak VRAM are not separately measured. CPU arrays are counted as backing
storage rather than claimed process peak memory.
The [full assessment](../../tests/artifacts/screens/illumination_548/report.md)
records all five channel modes, variation, activation, resource timings and images.

Mapped screen coverage is 55.26% ground, 6.94% threshold and 10.41% overhang.
On mapped pixels, live-to-indirect RGB8 changes average 6.41, 53.88 and 73.19
respectively. Adding direct changes them by 0.54, 0.001 and 0.001. These display
differences support indirect assessment at selected surfaces, not a GI accuracy
claim or general direct-lighting promotion. Unmapped threshold pixels match live
exactly; the overhang mean differs by 0.09 RGB8 levels, including edges.

On `http://localhost:8001/`, the final successful Options check took 58.31 seconds
from opening Options to both channels active: 49.85 seconds source validation
(47.34 extraction, 0.84 source hashing, 1.45 channel hashing), 2.13 seconds shader
preparation and 13.3 ms binding preparation for 16 receivers. This timer excludes
initial page/gameplay setup. Two UI clicks reenabled the channels in 1.31 seconds;
switching from the original preview back to the enhanced cache took 144 ms. There
was one source export and no additional enhanced-map requests on warm reuse,
including reopening Options and Cancel.

The 58 texture requests during source validation averaged 2.56 seconds, with a
0.62-second mean pre-request interval and three response-body completions around
31 seconds. These requests overlap other renderer/shadow preparation. Resource
Timing does not separate server transfer from browser backpressure or render-thread
stalls; the long tails cannot be attributed to pure network bandwidth. No proven
port-8001 cold-start speedup is claimed.

Validation passed 38 focused Node checks, GPU normal/bump/instance/unmapped and
cached-program regressions, actual context recovery, cache teardown, linked UI,
caster identity, saved startup, default-page cache reuse and a controlled
20-second delayed-shadow activation. One earlier full-core profiling run rejected
static shadows at the existing live-city/sun identity gate; indirect stayed active
and direct stayed live. A repeat and the controlled delay passed. The intermittent
rejection's cause remains unisolated; diagnostics and trace are retained under
`tests/artifacts/screens/illumination_548/shadow-activation-failure/`. Automatic
core tests also report unrelated atmosphere/building/fog and renderer-less
postprocessing fixture failures. This is not a claim of full-suite or AI 533 release
completion.

## Follow-up v2 repair assessment

The corrected enhanced publication is
`3258e415cd9774dc132ba383a7086a5bc1144f7eee5978a06026d96ae70f80cf`.
Its 64-sample, four-2048²-page bake took 2050.34 seconds. It preserves authored
procedural transparency and uses the flat-first directional layout described above.
Download size is 82,480,457 bytes (19.74% below v1); resident texture storage is
unchanged. Normalized RMS packing error is 0.1759% direct RGB and 0.6250% indirect
coefficients. Coverage and the previously documented angular/material limitations
remain; the preview warning is retained.

The [repair assessment](../../tests/artifacts/screens/illumination_repair/report.md)
records matched curb captures and four alternating 300-frame runs per mode at
3520×1624, RTX 3060 / Chrome 151, both channels and High baked shadows active.
At the fixed captured gameplay camera, original/enhanced GPU means are
27.15/27.38 ms; frame-call means are 27.52/27.75 ms. This establishes approximate
parity, not a frame-rate gain over the original. Both modes submit 1447 calls and
1,930,504 triangles. There were no repeat map requests on compatible switching.
The installed v2 Options test on localhost:8001 passed with one source export,
retained disabled maps, no repeat enhanced downloads, and compatible cache reuse
after switching implementations, reopening Options and Cancel.
The earlier isolated source-watch experiment supports replacing the generic loop,
but is not a directly comparable whole-game benchmark. Further FPS work needs
measured reductions in the GPU scene/pass workload.

Validation also found a damaged installed default shadow package. The exact
published bytes were restored from an authenticated existing local artifact;
shadow-renderer code and checksum requirements were preserved.

## Scope

This opt-in assessment preview follows the user's request for different Blender
illumination, high-resolution maps, a moderate initial bake, later higher sample
counts, the existing Blender installation and headless execution. Direct and
indirect default off in Options → Baked lighting. Full AI 533 release validation
is still pending. AO, base PBR assets and the moving bus's live lighting remain.

## Mapping

### Complete coverage contract for new bakes

New scalar v2 and enhanced v4 compiler jobs use `complete-eligible-v1`.
The resolved source receiver inventory and material capabilities determine
eligibility. All nondegenerate triangles of every eligible material range and
every placement must receive coordinates. Tops, bevels, sides, small faces and
neighboring instances are subject to the same requirement. There are no camera
focus, distance, orientation or minimum-area selection rules. Chart partitioning
and packing affect layout only; they cannot decide which eligible faces survive.

The original scalar material restrictions remain explicit: unsupported channel
semantics, perturbed shading normals, displacement, custom shading, alpha and
metallic receivers stay live. Directional receivers support normal/bump maps but
retain the other restrictions. These are representation limitations, not atlas
budget exclusions. A disabled source receiver channel is also recorded explicitly.
`coverage-report.json` identifies every excluded receiver range and its reason.

An oversized triangle/chart, insufficient pages, or unsupported transport prevents
the entire new bake from starting. No partial atlas is returned or published.
The report records every eligible range's expected/planned triangle counts,
oversized charts, required pages, source hash and full profile. Density and page
size are not silently lowered. Zero-area triangles are counted separately.
Packing order and input discovery order do not change eligibility or completeness.

Bake participation is separate from runtime lightmap reception. Reconstruction
consumes the full static participant/receiver/caster inventories before assigning
atlas targets. A supported static non-receiver retains its authored material and
geometry for occlusion and colored bounce; disabling runtime baked lighting does
not remove it from the bake scene. The moving bus is outside this static source
and keeps live lighting/shadows. A material without transport support must be
implemented or explicitly resolved at the source contract; silently omitting it
does not produce a complete bake. Unsupported transport now fails preflight even
when that object needs no lightmap. The report distinguishes unsupported transport
from an eligible transport participant that intentionally has no lightmap.

The compiler writes a coverage report before invoking Blender. `--atlas-only true`
performs source validation and planning without requiring Blender verification or
launch. A failed coverage plan exits nonzero and writes no usable atlas/package.
New publications must pass the complete-coverage gate. Historical partial packages
remain readable for the installed comparison modes; their runtime, cached toggle
behavior and shader paths are unchanged by this offline contract. Historical
profiles remain available to the atlas API for reproducing old layouts, but the
compiler and publisher no longer generate/promote those partial previews.

The current city audit at 0.04150390625 m/texel plans the starting platform's
40/40 triangles and all 448 ground-tile placements (896/896 triangles).
It rejects publication: 712 pages are required by the current planar layout,
578 triangles across nine receiver ranges exceed a page, and 14 material
definitions lack participant transport support. The page requirement excludes
those oversized charts and is therefore not a complete-city capacity estimate.
The enhanced runtime currently supports eight atlas pages (24 indirect layers),
with a 512 MiB per-channel package bound. Increasing `--pages` beyond those limits
does not start a bake that the current runtime cannot load. Efficient UV/chart
layout, oversized geometry handling, residency/streaming and missing transport
adapters remain necessary before a complete replacement city bake can be shipped.
No new city maps were published as part of this contract change.

Validation includes complete bevel/instance coverage, order invariance, budget
rejection, source opt-out, unsupported transport and publication rejection tests.
`validate_transport_participants.py` reconstructs a floor receiver and a red wall
with no receiver/caster mapping, then uses both actual target installers in the
pinned Blender. The wall remains unselected, contributes red bounced light and
occludes sky light; hiding it removes both effects. This verifies supported opaque
transport independently of lightmap selection, not glass or full-city GI fidelity.

`ReceiverAtlas.js` groups coplanar triangles per resolved receiver and instance,
retains receiver/object/instance/chunk provenance, uses fixed rotation and stable
shelf packing, and assigns distinct coordinates to repeated instances. Runtime
clones geometry to non-indexed form, preserving base UVs/attributes. An instanced
table offset selects each placement without splitting instanced draws. Unmapped
objects sharing a material select a zero sentinel. Disposal restores originals.

The initial `ai533.cycles.diffuse.preview64.v1` profile uses four 2048² pages,
0.04150390625 m/texel (the shadow density), 16-pixel extension and explicit mips
0–3. Sampling clamps to mip 3 and cannot filter between pages. Oversized charts
or charts beyond the budget remain live; density is not silently reduced.
The corrected preview maps 800 triangles / 146 charts / 19,986.58 m² at 69.16% surface
occupancy. This is partial coverage. Runtime normal/bump maps, displacement,
custom shaders, alpha surfaces and metallic bake receivers remain live; exclusions
are recorded. A scalar texel does not claim to preserve a perturbed shading normal.

## Bake and composition

AI 529 verifies the exact existing Blender 5.2.1 LTS build `9e2066aef7ef`, archive,
executable and reconstruction. The preview uses Cycles CPU, 12 threads, seed 533,
64 fixed samples, four diffuse bounces and no adaptive sampling/denoising.

The three passes are sun-only direct with a black world; indirect with sun/world;
and world-only direct with the sun hidden. Published indirect adds the latter two
so replacing ambient retains visible sky illumination. The world uses the captured
HDR plus a physical hemisphere approximation. Bounce colors remain in transport;
receiver color is excluded. RGB is multiplied by pi for AI 527 irradiance units.
A unit-sun white Lambert probe measured 0.3183098137, against 1/pi = 0.3183098862.
The source dependency configuration and actual derived bake profile are separately
hashed; actual samples/density/padding/bounces are in the latter.

Indirect replaces `reflectedLight.indirectDiffuse` after lighting with
`E_indirect * BRDF_Lambert(material.diffuseColor)`, before existing AO/display.
Live indirect specular and direct lighting remain. Direct is experimental and
requires active AI 531/532 hybrid shadows. It replaces only the named sun's
incremental diffuse lobe with `E_direct * BRDF_Lambert(material.diffuseColor) * V_dynamic`.
Static visibility is already baked; live direct specular retains both shadow
layers. Disabling baked shadows restores live direct diffuse. Exposure, tone
mapping, reflection, transmission, emissive and bus lighting remain live.

## Payload and lifecycle

Channels have independent files, source/profile/output hashes, capability profiles
and failures. Both authenticate the same coordinate table. AI 530 validates the
decompressed container and chunks. Only RGBA16F receiver-page descriptors accept
explicit mips 1–3; static-depth formats stay base-only. Runtime mip generation is
disabled. Gzip is lossless outer transport.

The final direct package is 181,987,472 bytes / 15,830,853 gzip; indirect is
181,987,696 bytes / 33,474,517 gzip. Each resident channel uses 181,927,936 bytes
including its coordinate texture. Together they add 347 MiB, separate from the
shadow cache. Expanded coverage needs a measured streaming/residency policy.
Loaded channels remain cached in CPU/GPU memory when either or both illumination
toggles are off. Disabling both restores original geometry and material hooks,
turns off all receiver uniforms/debug views, and cancels unfinished loading.
The status reports `current · disabled cached` when maps are retained. Re-enabling
the same city/profile reuses validated source identity and resident textures,
checking source mutations and the current package index before restoring bindings.
There is no repeat map download, decoding or upload for a compatible cache.
City changes, source/profile/package incompatibility, context loss and final
disposal release the cache. Disabled caches perform no per-frame source scan.
All-component/mip float16 relative RMSE is 0.02102% direct and 0.01863% indirect;
maximum absolute errors are 0.001953125 and 0.003250122. These are packing errors,
not convergence measurements against a high-sample reference.
The final bake took 800.59 seconds: direct 230.33 s, bounced indirect 263.43 s,
sky direct 252.28 s, and the remaining time reconstructing and preparing data.

Activation independently exports/hashes the live city and lighting. Known
renderer-owned illumination hooks are excluded from authored material identity;
unknown patches remain unsupported. Source revisions, transforms and lighting
changes invalidate active bindings. Fetch/inflate/validate/upload and shader
preparation precede a frame-boundary enable. Missing, corrupt or stale data
retains current rendering. Invalidation/teardown restores bindings and disposes
resources.
The application preloads portal ornament inputs before synchronous city creation.
Material-variation direction normalization is idempotent, avoiding double-precision
drift between the active city and independent clean rebuilds. Cascade-shadow
defines are excluded only when the registered cascade hook owns the material.
The city's shadow-sidedness override retains separately accessible authored values;
changing the visibility path does not change authored material identity.
The original caster snapshot remains queryable while the cache suppresses live
casters, including traffic lights outside the legacy culler's index.
Explicit half-float mip uploads are GPU-tested; r183 requires the uncompressed
RGBA path of `CompressedArrayTexture` to upload every supplied array mip.

## Diagnostics and remaining work

Options exposes final, direct, indirect, combined linear, UV, page, unmapped,
difference and mip views. The offline inspector adds full atlas, island, padding,
occupancy and receiver/chunk provenance views. All evidence goes under
`tests/artifacts/screens/illumination_533/`.

Indirect remains an optional assessment feature; direct remains experimental.
Neither is promoted by default. Expanded coverage/directional normals, complete
seam/route/bus-shadow cases, bounded streaming and high-sample reference comparison
remain before full AI 533 completion. AI 534 retains ownership of AO migration.

## First-pass validation record

The installed bake identity is
`c374070758417f5f0241cf5804a8ebbaaddc953dd16ceac2109a4149b3e3a577`.
The [assessment report](../../tests/artifacts/screens/illumination_533/report.md)
contains five same-condition city modes, rooftop captures, coverage/irradiance
views, 52 passing Node checks and exact independent source comparisons. The GPU
fixture verifies linear diffuse/specular separation, dynamic shadow modulation,
explicit mip sampling and geometry restoration. The installed-assets city test
also verifies source-change fallback. The default-page loading test verifies
resource identity and zero additional map requests/exports across an off/on cycle;
the cache lifecycle test verifies cancellation and cleanup on teardown.

At 1280×720 on the RTX 3060, median frame times were 21.35 ms current, 22.45 ms
cached sun, 21.30 ms indirect, 22.75 ms combined and 23.00 ms direct. These short
samples do not establish a speed gain. Initial exact city validation took 110.15 s.
The rooftop view has 3.16% mapped pixels and a modest visible indirect change;
shaded-surface coverage should be expanded before a quality decision. Indirect
remains an opt-in assessment preview; direct promotion is deferred.

## Runtime stability and image corrections

### Program cache and activation transition

Receiver program keys describe shader variants only. Rebinding the same original
or enhanced bank does not append a unique activation serial. The material render
callback restores the selected bank's uniform references when Three r183 reuses
a cached program. Compatible programs and maps remain resident while disabled;
program count stabilizes after warming the selected variants and is released with
material disposal. It is not expected to return to the initial cold count on every
toggle. Actual WebGL regressions cover repeated bindings and final disposal.

First activation of newly loaded maps blends live and baked diffuse lighting over
400 ms. Existing diffuse lighting remains available during that transition,
including in the enhanced shader's optimized paths. Compatible resident toggles
activate immediately. Refreshing one channel does not disable an already active
bank while awaiting the package index or shader compilation. Source invalidation
still falls back immediately; a fade never permits stale source data to remain active.

### Enhanced pass and coverage corrections

While enhanced bindings are installed, a reversible wrapper around the postprocessing
render call hides inactive shadow-only merge helpers. Active live casters remain
available. With the existing separate GTAO blend pass, GTAO evaluates its texture
without the redundant diffuse-color copy or buffer swap. AO diagnostics and cached
update modes retain their existing behavior. Every temporary visibility/output
change is restored in `finally`; disabling enhanced bindings removes the wrapper.
The shared dynamic-shadow layer uses one explicit clear with automatic clearing
disabled for that draw, preserving clear behavior independently of renderer flags.

For non-instanced enhanced receivers, connected faces within one degree and one
material slot must have complete atlas coverage to replace live illumination.
Incomplete groups remain live, avoiding diagonal boundaries caused by page or
small-chart budgets. Disconnected surfaces, creases, and material boundaries are
independent. The filter changes only copied runtime coordinates, preserves the
authenticated package, and runs during binding. Instanced coverage is unchanged.
`runtimeCoverage` reports omitted triangles and bound objects separately from
offline atlas coverage. This conservatively reduces coverage; it does not fill gaps.

### Enhanced v3 bake correction

The v3 profile preserves each polygon's source material before rebuilding Blender
material slots; clearing those slots resets polygon indices to zero. The installed
Blender regression includes object-linked overrides and shared source geometry.

All four linear indirect irradiance directions are denoised before coefficient
fitting using Blender's HDR denoiser. Each chart rectangle, including its padding,
is processed independently with a reflected 32-pixel outer guard that is discarded
afterward. Charts never sample neighboring atlas charts. Direct irradiance remains
unfiltered. The profile records `isolated-chart-oidn-v1`; compiler hashes and the
receipt record the processing. Denoising reduces sampling noise, not angular-fit
error, incomplete coverage, or unsupported transport. The original AI 533 package
and the enhanced preview warning remain unchanged.

The published v3 identity is
`41ee1d3ead9e50419a590ce2445490a438e8033adf3bd18aafa95dd283e0d8bb`.
Baking/denoising took 2295.52 seconds, including 82.70 seconds of chart processing.
Combined transfer size is 46,970,345 bytes (43.05% below v2), with unchanged resident
texture storage. Packing normalized RMS error is 0.1759% direct and 0.5516% indirect.
The localhost:8001 publication was checked against the exact candidate bytes and
the current runtime source. The original receiver index hash remained unchanged.

Eight alternating 210-frame GPU windows at 3520×1624 on the RTX 3060/D3D11 path
compare this same enhanced scene with only pass pruning disabled/enabled. Mean GPU
time falls from 24.7491 to 23.2622 ms (6.01%); calls fall from 1799 to 1782 and
triangle submissions from 1,888,223 to 1,485,026. All eight full-frame pixel hashes
match, with no disjoint timer events. This is a same-view GPU measurement, not a
whole-route FPS guarantee or an enhanced-versus-original lighting comparison.
The candidate also passed cold blending, repeated bank switches, bounded GPU
resource/program counts, and cached-download checks before publication. See the
[follow-up evidence](../../tests/artifacts/screens/illumination_optimization/report.md)
for captures, raw measurements, coverage reductions and remaining image limits.

## World-direction and sampling correction

The enhanced `ai553.cycles.surface.complete<SAMPLES>.v3` profile uses
`worldDirection: outward-blender-z-up-v1` and defaults to 256 samples per pass.
Three positions/directions are reconstructed as Blender `(x, -z, y)`. Blender's
World Texture Coordinate Normal points inward, so it must be negated before
evaluating sky elevation. The outward direction feeds the environment texture
without another axis remap. This preserves Three's equirectangular convention
`u = 0.5 + atan2(z, x) / (2*pi)`, `v = 0.5 + asin(y) / pi`.

Earlier complete maps used an inverted sky/ground gradient and a rotated HDRI.
Those maps require rebaking; a runtime brightness adjustment cannot repair their
occlusion or bounce directions. `validate_environment_orientation.py` checks
actual Cycles reference pixels against the direction equations, distinct sky and
ground colors, and analytic direct-sun irradiance on differently oriented faces.
An intentionally inverted reference proves the hemisphere test catches the fault.

The correction changes offline radiance and sampling, retaining the same eligible
triangles, atlas coordinates, page dimensions, encoding and runtime shader path.
Only the enhanced publication is replaced; the original preview remains available.
The 256-sample integration reduces noise without increasing runtime map allocation.
This scalar bake supplies indirect diffuse light and sky occlusion. Direct sun
continues to use the existing static/moving visibility cache, so the enhancement
does not increase direct-shadow resolution. Broad blocked-sky darkening is distinct
from a direct-sun shadow and may occur on the sun-facing side of an occluder.

`receiver_environment_quality.pwtest.js` compares the previous and replacement
maps at five fixed cameras, checks direct-only image stability, complete coverage,
and resident texture/program reuse through repeated toggles. Generated evidence
belongs under `tests/artifacts/screens/illumination_quality/`.

The corrected 256-sample candidate is installed as
`96120628c34410b3c539d295ba2c10bff5dfb91f3846a3a5d098fbd219abfbdc`.
Its OptiX bake took 845.82 seconds. It retains the previous complete allocation
and coverage. Fixed-camera captures show reduced platform color mottling and
ground patchiness; direct-only images remain unchanged. The material diagnostic
also confirms that the Modern Bank's authored near-black burnt-cement base is
dark under both live and baked lighting despite valid indirect samples.
See `tests/artifacts/screens/illumination_quality/research.md` for numerical
direction checks, material isolation, remaining scalar-map limits and captures.

## AI 553 complete surface repair

The replacement candidate uses profile `ai553.cycles.surface.complete64.v2` behind
the existing AI 548 toggle. The original bank and historical directional package
reader remain independent. Complete reception follows resolved static roles and
material support: every eligible nondegenerate opaque triangle must have an atlas
address. Alpha surfaces remain live receivers but stay in the offline scene as
occluders and bounce participants. Moving objects are not static participants.
Missing transport semantics or insufficient atlas capacity fail the entire plan.

Blender Smart Project produces connected islands in transformed world units. The
compiler verifies source identity, unique face ownership, finite UVs, nonzero UV
area and full triangle coverage. A singular projection receives a deterministic
triangle projection; it is never discarded. Packing uses stable height/width/id
ordering and at least two interior texels along each island axis. Both the layout
and the emitted chart inventory are authenticated, including on resume.

The candidate covers 1,904,820 triangles: all 448 ground instances and all 40 faces
of the starting slab, including sides and bevels. The 233,232 alpha triangles have
an explicit live-receiver exclusion. Nine 4096² pages use a nominal 0.5 m indirect
texel density, increased for small islands, with two explicit mip levels. This is
a density choice for smooth indirect illumination; the existing approximately
4 cm static sun-depth cache remains responsible for sharp sunlight visibility.

The scalar surface bake samples a white diffuse primary receiver using its true
geometric normal. Secondary rays see the original PBR material, color textures,
vertex color, roughness, metalness, tangent normal/bump and declared alpha coverage.
Depth-only opaque alpha proxies do not override the material's bounce coverage.
Two 64-sample, four-diffuse-bounce passes capture indirect transport and visible sky.
There is no directional coefficient fit or duplicate direct-sun irradiance atlas.
Supported normal/bump maps still affect the runtime direct PBR response. Indirect
normal-map directionality is intentionally absent from this scalar representation.

Offline receiver objects are joined for baking, with all UV channels and materials
preserved. Negative-determinant instances receive the face-orientation correction
required to preserve their pre-join lighting. The triangle inventory must match
before and after joining; a Cycles fixture checks both ordinary and mirrored cases.
The profile records batching and CPU/OptiX backend, and the receipt records the
actual device and timing. No Blender installation or shared preferences are changed.

RGB9E5 preserves nonnegative HDR irradiance in four bytes per texel. Explicit mips
remain linear and hardware filtered. Exact RGBA32F coordinate rows are transported
in bounded chunks and shared between the channels. The direct reference is one
zero texel whose authenticated profile selects existing static/moving visibility;
its value is never sampled for sunlight. Three r183's public texture upload callback
uploads the extra RGB9E5 array mip levels; a GPU test verifies the sampled mip.

The page allocation is 720 MiB, plus 97.875 MiB shared coordinates and a 4-byte
direct reference. These figures exclude receiver geometry and the rest of the
renderer. Full-source compatibility includes alpha transport contributors even
when a historical channel hash omitted unsupported alpha materials. Disabling
the toggle restores original geometry and shaders while retaining compatible maps.

The initial three-page candidate failed actual raster acceptance on narrow details
despite complete UV inventory. A seven-page revision exposed a second defect:
neighboring faces could satisfy the raster predicate and then be split away.
The final planner requires each face's centroid cell to lie strictly inside that
same face. It reserves independent charts otherwise, and aligns those charts'
centroids to pixel centers. It keeps source face
attribution and increases local density instead of excluding the face. Cropping
remaining islands preserves their pixel grid. Raster guards account for float32
UV precision and do not treat edge-only samples as guaranteed coverage.

Unwritten texels are extended only from actual samples within their own chart;
valid dark samples are preserved, and a completely empty chart fails publication.
The explicit mips are regenerated from the padded base level. The authenticated
mapping records raster coverage and each encoded mip's hash, checked against the
actual parsed chunks at publication and runtime. UV completeness alone is insufficient.

The final plan uses nine pages (720 MiB) plus the shared coordinates, for
817.875 MiB before geometry and other renderer resources. A root package
authenticates extra page-package descriptors in its source descriptor. Each package
retains the 512 MiB container limit, exact source/profile identity, per-chunk hashes,
and no nested packages. The runtime stages all pages before activation and shares
one coordinate texture. It releases staged data on failure and retains successfully
loaded textures through ordinary toggles. Legacy publications use their existing
single-package path.

For non-instanced mapped meshes, the enhanced adapter resolves same-material,
same-facing coplanar overlaps by stable source-triangle ownership. Subtraction
preserves the union and interpolates all vertex attributes, including lightmap
coordinates. It changes only the private enhanced geometry; source meshes and
the original renderer are restored on disable. Alpha/live surfaces and distinct
material boundaries are not merged. This removes coincident sidewalk receivers
instead of adjusting their illumination to hide depth conflicts.

The validated replacement is installed as
`20744ee4a1a8f9bccf5837f64f49b4e2f5e0366074e3c01290dd85d279697898`.
All 1,757,473 charts contain real samples and every eligible triangle center is
written. Boundary padding fills 20,707 raw boundary samples without altering valid
lighting. The 64-sample OptiX bake took 633.77 seconds. Deep-shade mottling and
coarse/anisotropic indirect detail remain first-quality preview limitations;
the warning stays visible. Acute chart tips can require substantial nearest-sample
extension; this is not a high-quality per-corner irradiance result.

The reported curb point changes from two coincident source hits to one enhanced
hit. Matched curb, ground, platform and facade captures, channel isolation, saved
startup and six cached toggle cycles pass, including a fresh installed-URL run.
At 3520×1624 on RTX 3060/D3D11 with default lighting and high moving shadows,
three alternating 240-frame samples after 60-frame warmups measured mean GPU
times of 27.20 ms for the previous enhancement and 27.44 ms for this repair.
The original AI 533 mode measured 28.95 ms. This does not establish a new
enhancement speedup or a whole-route FPS guarantee. Full measurements and
remaining limitations are in `tests/artifacts/screens/illumination_553/report-final.md`.

## AI 554: facade sampling and one authored sun

Enhanced receiver preparation runs after normal-map evaluation and before the
clearcoat normal stage. It must not be injected into the normal-map include:
material variation retains that include only in its disabled preprocessor branch.
A rendered test with the real variation module verifies nonzero irradiance,
normal response, and single ambient replacement. The original material code is
unchanged and removing the receiver hook restores it.

The complete surface v4 profile declares `single-authored-sun-v1`. Its diffuse
environment separates the upper-hemisphere HDRI solar peak and its photographic
halo (a declared four-degree radius for the current default HDRI), replacing that
cap with the solid-angle-weighted sky radiance in the surrounding four-to-eight
degree annulus. This is an explicit environment transport choice, not receiver
selection or per-surface brightness adjustment. Other environment pixels and the
source HDRI remain unchanged. The extracted direction, energy, sky radiance and
pixel count are saved in the bake receipt's artifact directory. The separate
authored sun supplies surface sunlight through the existing high-resolution
shadow cache and contributes offline bounce. The HDRI's photographed sun must
not introduce a second hard shadow through the indirect atlas.

This changes enhanced diffuse transport only. Live specular reflections, glass,
moving objects, and the original preview retain their existing behavior. The
four-degree radius describes the default photograph's disc plus halo, not the
physical angular diameter of the authored sun (0.53 degrees). Higher samples
reduce sampling noise; they do not increase the atlas's spatial resolution.

The refinement run requests 896 samples per pass, targeting roughly 30 minutes
from measured scene preparation and 256-sample timings. Actual elapsed time and
fixed-camera evidence belong under `tests/artifacts/screens/illumination_refinement/`.
The shaded-bounce regression uses a downward-facing white receiver and a lit
green ground plane. Direct sunlight must be zero; indirect green bounce must
remain positive and disappear within numerical tolerance when the ground is
removed. A shaded underside being brighter than the live ambient approximation
is not, on its own, evidence of reversed direct shadows.

Recovery validates complete pass files before assembly. Sky and bounce must have
identical written-pixel masks: a mismatch is rejected before chart extension,
because filling a partially unwritten file would disguise data lost in a crash.
The recovery path preserves source/chart/compiler hashes, durably writes pages,
releases the reconstructed scene before CPU assembly, and authenticates recovery
script and pass hashes in the package. A missing original receipt is recorded
explicitly; replacement-pass measurements must not be presented as the lost
original timer.

The ordinary complete-surface writer uses the same bounded memory lifecycle:
discard chart data and orphaned meshes once UVs are installed, copy one image
page at a time, and release the reconstructed scene before assembling CPU mips.
Passes, assembled pages, progress and receipt files are flushed before atomic
replacement. The small output regression checks exact radiance/mip values and
that an interrupted write leaves the previous target intact.

Near-coincident opaque layers require visibility-aware filter padding. The city
floor is 1 mm below its grass tiles; texels on the hidden floor are correctly
dark in Cycles, but interpolating them at an exposed floor/tile boundary creates
a false dark stripe. Offline processing identifies same-facing parallel receiver
triangles separated by more than 1 micrometre and at most 2 mm, proves projected
overlap in world space, and masks only the hidden lower texels. Partial charts
extend their own exposed baked samples into that mask before mip generation.
Entirely hidden charts remain unchanged. Real gaps, opposing faces, nonoverlap
and exposed dark samples remain unchanged. Selection uses geometry, never object
names, cell indices or material-specific exceptions. The policy and processor
hashes are authenticated in the packages and add no runtime work.

`run.mjs --reprocess <completed-publication>` can apply a revised offline filter
to recovered passes without running Cycles again. It requires an unchanged
source, profile, atlas and Blender identity, verifies every recovered pass hash,
and writes a new content-addressed publication. The original baking-script hashes
remain the bake provenance; new processing hashes are recorded separately.
The original recovered files are read-only inputs to this operation.

## Linked illumination controls

Options includes a chain-link button beside the direct/indirect switches. Linking
defaults on and is persisted as `receivers.linked` through Save and presets; Reset
restores it. While linked, either switch sets both channel values in one live
change. Unlinking preserves their values and allows independent changes. Relinking
adopts the top (indirect) switch value for both. Existing saved channel values are
preserved on load; the link controls subsequent UI changes rather than forcing
programmatic channel settings to match. The icon exposes its pressed state and
supports keyboard activation.

## Loading correction

Runtime activation now requests `exportResolvedCityBakeIdentity`, which uses the
same geometry, material, texture and channel hashes as the offline export, without
building and round-trip-validating an unused BSIB file. The offline exporter keeps
its full package validation. Shared image data is captured once per compatible
source variant within each export; independent texture sampling remains hashed,
unsupported clones remain rejected, and each new export takes fresh snapshots.

Channel changes share one pending source check for the same city and lighting
profile. Disabling all channels cancels that work. Texture/profile fetches accept
cancellation, validation has a 180-second bound, and the Options status reports
the actual phase, texture progress and elapsed time. A source mismatch continues
to fall back; this correction does not bypass hash compatibility or alter the bake.

The first corrected Options test completed the source check in 9.02 seconds and
activated both installed channels. Its full activation took longer due to map
transfer/decompression while rendering. This is a diagnostic observation rather
than a controlled speedup benchmark. Regression evidence is stored under
`tests/artifacts/screens/illumination_533/loading/`.

Default-page regression coverage includes the automatic browser core tests and
the Welcome → bus selection → gameplay path. Core-test ornament fixtures must
restore the previous template in `finally`, including restoring an absent entry.
Leaving the dummy capital in the shared template cache changes four city meshes
and invalidates both lightmap channels even with default lighting settings. The
fix restores the real scene; it does not relax source hashes or require a rebake.
