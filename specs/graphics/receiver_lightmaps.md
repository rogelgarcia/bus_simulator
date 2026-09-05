# Optional receiver illumination — AI 533 first pass

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

Enhanced-only Options edits apply baked-lighting settings without reapplying
unrelated material settings. Cancel restores the original selection through the
same narrow path when no other settings were edited. This preserves cached source
objects, including when reopening Options with the original preview selected and
an enhanced cache retained. Default-page tests use isolated temporary city materials and shadow-free
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
