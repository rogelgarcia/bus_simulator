# AI 533 acceptance — retained optional illumination

## Retention decision, September 7, 2026

The user accepts the current visual result and reports better visuals and
performance with AI 548. Retain **both baked direct and baked indirect lighting**,
their independent and linked controls, the original comparison bank, and the
enhanced AI 548 implementation. Keep the current engine as a permanent selectable
renderer and automatic fallback. This acceptance does not change saved options,
default settings, AO composition, or the installed engine/bake.

AI 533 closes as an accepted optional feature. Its initial assessment-only
ship/defer decision is superseded by this explicit retention decision. This is
not AI 536's production/default promotion or a claim that every original desktop
budget has passed. AI 534 may use the retained channel contracts; AI 536 still
owns integrated release qualification.

## Exact retained behavior

| Component | Accepted disposition |
|---|---|
| Original baked direct channel | Keep available, independently switchable, with active baked-shadow compatibility required. Do not delete or silently replace its assets. |
| Original baked indirect channel | Keep available independently and together with direct. |
| Enhanced AI 548 bank | Keep the installed complete-surface bake and runtime optimizations, including cached maps, shader/program reuse and pass pruning. |
| Enhanced direct representation | Preserve `hybrid-sun-visibility-v1`: the direct control uses the shared static/moving sun visibility and live material response. The authenticated one-texel reference is not a second sun-radiance atlas. |
| Enhanced indirect representation | Preserve `surface-diffuse-v1`: baked diffuse bounce plus visible-sky contribution, without multiplying albedo twice. |
| Current engine | Preserve ordinary direct/ambient/IBL rendering, material response and automatic fallback. Baked files and Blender are optional at runtime. |
| Moving bus and glass | Keep their live lighting/reflection contracts; the bus receives static and moving-object shadows but no static receiver lightmap or claimed dynamic GI. |
| AO/contact policy | Unchanged here. AI 534 owns the measured composition decision and must preserve both retained channels. |

The installed original comparison maps are historical: the current geometry
repairs changed their source identity. The fresh acceptance check records
`direct_receiver_source_mismatch; indirect_irradiance_source_mismatch` and normal
engine fallback for that bank. Preserving those channels does not authorize
sampling stale maps or rewriting their hashes. AI 556 already records that the
old four-page scalar recipe cannot cover the complete current city (303 required
pages, eight unmappable ranges and 14 unsupported transport materials). It remains
an explicit compatibility target, not a silently reinstated partial-selection
bake. Current city acceptance and the separate enhanced direct/indirect checks
apply to the compatible AI 548 publication.

## Installed reference and coverage

Enhanced publication:
`e007c5db2a1815a9c834fbcd466fdc615c0ec121af8e069d0d54db8730dfba75`.

Resolved source:
`9f25d16a39920b3980914ece887b2c3852a9699a408e11b6b4b8bba60198f7e8`.

Profile `ai553.cycles.surface.complete896.v5`: 896 samples for each independent
sky/bounce pass, four diffuse bounces, nominal 0.5 m indirect texel spacing,
seven 4096² pages, two explicit mips, RGB9E5 and exact RGBA32F coordinates.
The coverage inventory contains 1,903,239 mapped opaque triangles and 1,393,538
charts. All 233,232 alpha-surface triangles have an explicit live-receiver
exclusion while remaining offline transport participants. No eligible receiver
samples or charts are missing. Occupancy is 6.89046% by the atlas's triangle-area
metric; the small-island and padding overhead is a real cost of complete coverage.

The completed source passes used Blender 5.2.1 LTS build `9e2066aef7ef`, OptiX on
NVIDIA GeForce RTX 3060, with the existing four-bounce profile and 12-thread
setting. Pass receipt timings are 1,385.596 s bounce and 1,525.655 s sky (2,911.251 s
total, excluding the separate final reprocessing run). The framework's final
filter/assembly/publication recovery took 356.2 s. The receipt's inherited
`signature.backend: cycles_cpu` describes the base compiler signature; its
explicit `backend: OPTIX` and device fields describe this actual bake. These
results must not be labeled an independent Cycles CPU reference.

## Residency and quality policy

The retained enhancement is an **optional desktop quality tier**. One exact
publication per receiver bank is cached until invalidation or teardown; switching
off restores ordinary geometry/shading while keeping loaded maps, as requested.
Original and enhanced banks may both be resident after comparison. Invalid source,
profile, payload or GPU capability falls back through the existing engine.
Publication integrity, full coverage, per-container 512 MiB limits, bounded
page-shard counts and hardware texture limits remain enforced.

The installed enhanced textures occupy 560 MiB for irradiance plus 97.8125 MiB
for shared coordinates and a four-byte direct reference: **657.8125 MiB** before
geometry, shadow targets, postprocessing or other engine resources. CPU texture
backing uses the same logical byte count. This is allocated texture storage, not
physical GPU residency or a peak-process measurement. If compatible, loading both
historical original channels adds 347 MiB; the current stale bank was rejected
before that allocation. The existing finite cache is not spatial streaming and is
not claimed to meet the framework's 256 MiB default-tier target.

Retain the current density and coverage for this accepted optional tier. Do not
silently discard small receivers, lower quality or evict a disabled bank to make
the measurement fit a default-tier target. AI 536 must evaluate constrained-device
behavior and measured swap peaks before promoting defaults; any later lower-memory
variant needs its own explicit profile and acceptance. AI 547's shadow streaming
does not, by itself, provide receiver-lightmap streaming.

The corrected 896-sample result, actual flat-surface GPU probes and the user's
visual comparisons establish acceptance of this installed result. Earlier 64/256
and directional maps also changed coverage, transport orientation, sun composition
and geometry; subtracting those images is **not** an isolated sample-convergence
test. Independent high-sample CPU convergence/perceptual error remains **not
measured** for default promotion. Retention under the user's visual decision is
explicit; no unmeasured accuracy threshold is marked passed.

## Same-session measurements, September 7, 2026

Windows, AMD Ryzen 5 9600X, NVIDIA GeForce RTX 3060, Chrome 151/D3D11,
1280×720 canvas, pixel ratio 1. Three fixed regions use world `(x,z)` positions
open `(0,-216)`, center `(0,48)` and dense `(-120,216)`, facing north at
height 3.68318 m, pitch -9.673° and FOV 55°. Each region runs five modes in three
rounds, reversing order on the middle round: 30 warm-up and 60 measured frames per
window, 2,700 measured frames total. Simulation is paused while rendering, city
updates and visibility updates continue. The same page retains warmed resources.

Lighting stays at exposure 1.02/ACES, sun intensity 7, hemisphere 1.22,
German town street 2k IBL intensity 0.28, sun azimuth 45°/elevation 35°.
GTAO is high, intensity 1.05, radius 2.42, denoise off, every-frame updates;
static AO and bus contact shadow are off. The recorded current-engine shadow
settings are `cascade/high`, `cascades: 0`, merged casters on and instanced detail
casters off; the cached modes use the installed static sun package and high
moving-object resolution. This preserves the tested configuration rather than
establishing identical shadow coverage between current and cached modes.

Frame time below measures `updateFrame` through `gl.finish()`, excluding the RAF
wait. Equivalent FPS is `1000 / median`, not observed display FPS. GPU time is the
separate asynchronous full-render timer mean, with zero disjoint events; it is
not isolated shader cost. Rows pool 540 frames across three different workloads,
so their standard deviation includes variation between regions. Calls/triangles
are arithmetic means over their measurement windows.

| Configuration | Median ms | p90 ms | Std. dev. ms | Equivalent FPS | GPU mean ms | Calls | Triangles |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current engine | 29.10 | 47.60 | 10.80 | 34.36 | 31.80 | 1452 | 2954452 |
| Cached sun, receiver lighting off | 20.10 | 25.00 | 5.70 | 49.75 | 16.68 | 1195 | 1554424 |
| Enhanced direct only | 28.40 | 33.70 | 6.45 | 35.21 | 17.16 | 1173 | 1360786 |
| Enhanced indirect only | 28.70 | 34.00 | 6.77 | 34.84 | 17.36 | 1173 | 1360786 |
| Enhanced direct and indirect | 28.80 | 33.70 | 6.77 | 34.72 | 17.24 | 1173 | 1360786 |

This run supports retaining the enhanced result as a quality option; it does not
show that receiver lighting always costs less than cached shadows alone. Against
that control, both channels add 8.70 ms to pooled synchronized median time and
0.56 ms to mean GPU time while reducing average calls/triangles. The user also
accepts AI 548's earlier before/after improvements; this table compares current
available modes, not AI 548 code before versus after. Independent direct and
indirect effective flags passed in every measured window. The original stale
comparison bank is excluded from the performance table, not presented as active.

Packed uncompressed container bytes include manifests, tables and duplicated
mapping data across channel/shard boundaries. They are not resident GPU bytes.

| Enhanced channel | Packed container bytes, all shards | Gzip bytes | Download ms | Inflate ms | Validate/decode ms | Upload submission ms |
|---|---:|---:|---:|---:|---:|---:|
| Direct | 106236192 | 17929934 | 336.3 | 217.3 | 323.9 | 15.5 |
| Indirect | 799684128 | 145612704 | 2372.6 | 852.7 | 3969.5 | 259.9 |
| Total | 905920320 | 163542638 | — | — | — | — |

Loading values are one local-server observation per channel from runtime
diagnostics, not network throughput or a statistically controlled cold-start
benchmark. Upload time measures submission, not a separately synchronized GPU
transfer. The warm-up `elapsedMs` fields include preparation and minimum frame
waits and may precede the final activation commit; do not interpret them as exact
time-to-visible lighting. Complete startup latency, isolated shader cost,
whole-process/physical GPU peaks, independent CPU-reference error and perceptual
metrics are **not measured** here. The current-engine startup issued no baked
package requests. Residency and bake durations are documented above.

## Validation and evidence

The fresh installed-city acceptance test passed in 8.3 minutes. It captured
cached-sun/enhanced comparisons in all four cardinal directions for each of three
regions (12 views), checked 16 moving-bus positions, and completed four further
off/on cycles. The bus had no static receiver mapping, retained its registered
dynamic shadow caster and drew dynamic shadows at every position; legacy static
caster submission remained suppressed. Resource counts stayed at 3,204 geometries,
132 textures and 317 programs through all four cycles, with no repeat package
requests, page errors or shader errors. Route captures inspected in the open,
center and dense areas showed no new flat-surface topology seams; this is bounded
route evidence, not a claim to have inspected every city surface.

Fresh focused browser checks also passed: two surface-material/coplanar-repair
tests, one authenticated page-shard lifecycle test and one render-pass pruning/
state-restoration test. No engine code, bake assets or defaults changed for this
acceptance pass.

- [Receiver mapping and material contracts](receiver_lightmaps.md), including
  alpha transport, single-sun composition, explicit mips and independent caches.
- [Framework composition and release budgets](illumination_framework.md).
- [Bake hierarchy and authenticated recovery](../tools/bake_framework.md).
- `tests/headless/e2e/receiver_acceptance_533.pwtest.js`: installed-package
  same-session channel/route measurements, independent effective-channel checks,
  cached switching, moving-bus registration and static-caster suppression.
- `tests/headless/e2e/receiver_refinement.pwtest.js`: flat corner charts, actual
  slab/sidewalk hits, both GPU mips, facade seams and repeated toggles.
- `tests/headless/e2e/receiver_surface_material.pwtest.js`: linear material
  composition, sun/indirect separation, normal response and explicit GPU mip.
- `tests/headless/e2e/receiver_page_shards.pwtest.js`: authenticated shard loading,
  rejection of mismatched source and disposal after success/failure.
- `tests/headless/e2e/receiver_render_optimizations.pwtest.js`: identical GPU
  output after pass pruning, with original rendering state restored afterward.
- Earlier renderer/normal/material, freshness, startup, AO-toggle independence,
  shader-cache and lifecycle evidence is recorded by AI 548, 553, 554 and 555.

Generated evidence remains gitignored under
`tests/artifacts/screens/illumination_533/acceptance/` and
`tests/artifacts/screens/illumination_refinement/corner-surface-final/`.
The acceptance directory contains `measurements.json`, `activation.json`,
`route.json`, `bus.json`, `result.json`, per-region `table.md` and route PNGs.
The final corner run passed with a maximum 0.6064% cross-mesh irradiance delta,
down from 19.7%; the reported facade (`building_49_d`, StoneLowrise2) passed its
wall-strip probes. Four warm cycles retained identical texture/geometry/program
counts without repeated map fetches, shader errors or fallback.

## Remaining integrated-release work

AI 536 retains independent CPU-reference convergence, the full low-sun and
wrong-profile matrix, constrained hardware, whole-process/physical GPU peak
measurements, default-tier residency/streaming reductions, full-frame promotion
thresholds and integrated AO/mode validation after AI 534/535. Those are named
qualification limits, not reasons to remove the accepted engine, direct channel,
indirect channel or AI 548.
