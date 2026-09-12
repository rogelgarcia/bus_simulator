# Static Directional Sun-Depth Cache

## Status and authority

This is the AI 531 authority for the optional `static_sun_depth` channel,
world-space visibility lookup, static-receiver shader composition, and static
caster handoff. AI 528 remains authoritative for resolved-city identity and
alpha inputs, AI 529 for Blender 5.2.1/Cycles CPU reconstruction and canonical
intermediates, and AI 530 for package integrity, capability checks, atomic
resource activation, fallback, and disposal.

The feature is internal/development opt-in. `current` remains the permanent
fallback and performs no package request, shader mutation, or caster handoff.
AI 532 extends this sampler to generic registered moving receivers and composes
one shared dynamic moving-caster field. AI 535 owns player-facing Options
behavior. See [`dynamic_sun_shadow.md`](dynamic_sun_shadow.md).

The AI 528 semantic source is
`bus-sim-illumination-bake-input-v2` with `schemaVersion: 2` and semantic
container version 2.0. Its byte-compatible `ILBSRC01` framing and fixed binary
header remain low-level version 1; that framing version does not make a
semantic V1 manifest acceptable.

## V1 channel identity

The channel descriptor schema is `static-sun-depth-tile-set-v1`; its channel ID
is `static_sun_depth` and its channel version is `1`. Unknown fields and unknown
semantic strings reject validation. The immutable identity contains:

- the exact city ID, resolved channel-source SHA-256, static-caster inventory
  SHA-256, compiler-signature SHA-256, and alpha-semantics SHA-256;
- one normalized point direction from a world receiver toward the named sun;
- a stable world-to-light basis and origin;
- the complete row-major tile inventory, half-open global and per-tile bounds,
  per-axis interior resolution, guard width, isotropic texel density, and
  payload hashes;
- signed light-depth range and exact RG8 quantization/empty representation; and
- comparison, empty, out-of-bounds, bias, and PCF policy.

The resolved-source channel profile additionally authenticates
`casterSidedness` as
`three-r183-effective-shadow-side-v1` with `twoSidedCasting: true`
and preservation semantics
`material-userdata-preserveShadowSide-or-isFoliage-v1`. Each selected
caster mapping retains authored `side`/`shadowSide` and carries
the independently verifiable combined preservation flag plus
`effectiveShadowSide`. Lab and Cycles depth capture use that effective
side, while ordinary visible reconstruction keeps the authored side. Any
missing field, invalid Three side enum, policy drift, or recomputation mismatch
rejects the source before baking.

Activation additionally compares the AI 530 city, lighting profile, capability
profile, resolved-source identity, and the `static_sun_depth` channel-source
identity supplied by the live city. A mismatch never becomes a sampleable
resource set.

The graphics pipeline requires a separate synchronous live-identity provider
whose result has exactly seven own data fields: city ID, lighting-profile ID,
resolved-source SHA-256, static-sun channel-source SHA-256, caster-inventory
SHA-256, alpha-semantics SHA-256, and an explicit
`developmentCacheAllowed: true` gate. Absence, exceptions, accessors, extra
fields, malformed hashes, or drift reject activation or synchronously return an
active cache to current shadows. This provider is independent of the package
request expectations, so stale request metadata cannot certify live ownership.

The canonical implementation is
[`src/app/illumination/static_sun_depth/`](../../src/app/illumination/static_sun_depth/).

## Coordinates and tiling

`sunPointDirectionWorld` points from a receiver toward the sun. The V1 depth
axis points the other way, from the sun into the city. The least-aligned world
axis is selected deterministically, with X winning ties; crossing that axis
with the depth axis produces the right axis, and crossing depth with right
produces up. The resulting orthonormal, right-handed basis is reproduced by the
runtime and is not accepted from a bake merely because it is close to unit
length.

World points are translated by `originWorld` and dotted with right, up, and
depth. XY lookup uses minimum-inclusive, maximum-exclusive bounds. Tiles are
ordered by increasing light-space Y and then X. Every layer has the same
rectangular per-axis interior and one isotropic texel pitch, with an equal
scalar guard on all four edges. The hashed V1 guard policy copies the owning
adjacent tile's interior texels across internal seams and clamps to the nearest
domain-edge interior texel at exterior edges. A guard must cover the entire PCF
radius; runtime mip generation and implicit linear filtering are forbidden in
V1. CPU activation verifies every internal, exterior, and corner guard against
the complete resident set before exposing it to sampling.

The runtime resource is one WebGL2 `DataArrayTexture`, one layer per tile, with
`RG8`, nearest minification/magnification, no mipmaps, lower-left row origin,
and unpack alignment 1. All declared layers must be resident and hash-verified
before frame-boundary activation. Partial streaming may prepare a future set,
but no receiver samples it until the required set is complete.

Every numeric value consumed by WebGL must survive `Math.fround` without
overflow, underflow of required-positive values, range collapse, or a
non-finite derived translation/tile size. Validation checks both the
high-precision contract and float32-derived world-to-light transforms, bounds,
depth range, texel size, and maximum bias before any GPU resource can activate.

## Depth encoding

Occupied signed light-space depth is mapped linearly over the closed declared
`minDepthMeters..maxDepthMeters` interval to integer codes `0..65534`, rounded
to nearest. Code `65535` is the sole empty/background value. Bytes are stored
most-significant first:

```text
code = (R << 8) | G
depthMeters = minDepthMeters + code / 65534 * (maxDepthMeters - minDepthMeters)
```

Empty samples inside the declared city domain are visible. Receiver depth or XY
outside the declared domain is fail-closed zero visibility. PCF taps that leave
the global domain are also occluded; taps that stay in-domain and decode empty
are visible. Inactive, incomplete, incompatible, stale, or unresident CPU
queries return zero visibility with an explicit status and cannot accidentally
sample an old set.

The maximum quantization error is half of
`(maxDepthMeters - minDepthMeters) / 65534`. Production promotion must report
that value against the current-shadow/BVH tolerance instead of assuming two
bytes are sufficient for every chosen depth range.

## Bias and softness

V1 chooses one point-direction depth field. It does not model the angular area
of the sun and does not claim physical penumbrae. Filter semantics are explicit
hashed identity. `square-nearest-box-v1` preserves the original deterministic
radius-0/radius-1 cache-texel kernel. It is not interchangeable with
`three-r183-vogel-5-linear-compare-v1`, which reproduces the live directional
filter used by the pinned renderer:

```text
phi = IGN(gl_FragCoord.xy) * 2*pi
IGN(p) = fract(52.9829189 * fract(dot(p, (0.06711056, 0.00583715))))
r(i) = sqrt((i + 0.5) / 5)
theta(i) = i * 2.399963229728653 + phi
offset(i) = (cos(theta), sin(theta)) * r(i) * radiusTexels
visibility = mean(five hardware-linear shadow comparisons)
```

Each hardware-linear shadow lookup is emulated as four depth comparisons with
the exact bilinear weights; interpolating encoded RG bytes is forbidden. The
identity stores sample count 5, radius, source shadow-map texture size and
world extent, `gl_FragCoord`/IGN rotation semantics, the four-compare policy,
and the source map's right/up world axes. Those axes must equal the canonical
Three r183 directional-camera roll derived from the sun direction and default
world-up vector. The runtime transforms that finite disk into cache-light XY;
it never assumes the cache basis has the same roll. Integer comparison taps
resolve through the complete tile grid, including an adjacent array layer at a
tile seam. Taps outside the global cache domain remain fail-closed.

The AI 531 Lab oracle derives and hashes the actual live source texture size,
because a host may cap the `single_high` request to its device limit. It
asserts a 680×680 m camera extent and `radiusTexels = 1.5`, and rejects any
difference between its recorded size/extent/radius/axes and the live camera.
Device-capped Lab evidence identifies that observed capability and cannot
certify a differently sized production source. Production v4 explicitly pins
`three-r183-single-high-effective-16384-v1`, a 16384×16384 source map, exact
`680 / 16384 = 0.04150390625` m pitch, and exact 0.062255859375 m disk
radius. Offline producers derive the same canonical source axes from the
profile sun direction; no live camera state or camera-relative roll is needed.

Bias semantics are versioned and field-exact. Existing
`constant-plus-normal-offset-v1` packages retain their original fragment-depth
formula:

```text
constantMeters + normalOffsetScaleMeters *
    (1 - clamp(dot(worldNormal, sunPointDirectionWorld), -1, 1))
```

The comparison is
`receiverDepthMeters - biasMeters <= storedCasterDepthMeters`. Bias and kernel
values are hashed channel identity, not mutable ambient settings. Production
promotion must reject acne, peter-panning, halos, leaks, and seam hiding caused
by unmeasured bias or blur.

The parity candidate
`geometric-normal-offset-plus-constant-depth-relief-v1` is explicitly different.
It matches Three r183 shadow bias order:

```text
biasedWorldPosition = worldPosition
    + geometricReceiverNormalWorld * geometricNormalOffsetMeters
biasedLightPosition = worldToLight(biasedWorldPosition)
visible = biasedLightPosition.depth - constantDepthReliefMeters
    <= storedCasterDepthMeters
```

`geometricReceiverNormalWorld` is the geometric/interpolated normal produced by
Three's vertex shadow path (`transformedNormal` converted to world space). It is
not the fragment shading normal and never includes a normal map. The world-space
offset occurs before projection, so both light-space XY lookup and depth move;
replacing it with a dot-product-only depth adjustment is not equivalent. The
AI 531 Lab oracle uses `geometricNormalOffsetMeters = 0.0232` and
`constantDepthReliefMeters = 0.0697915`, the exact `single_high` r183 values for
its 1..1440 m shadow camera. CPU callers must pass the same geometric receiver
normal that the vertex path interpolates. Legacy and geometric fields cannot be
mixed, and a Lab report for one model cannot certify a package hashed with the
other.

## Shader composition

Dedicated GLSL sources live at
[`static_sun_depth.vert.glsl`](../../src/graphics/shaders/materials/static_sun_depth.vert.glsl)
and
[`static_sun_depth.frag.glsl`](../../src/graphics/shaders/materials/static_sun_depth.frag.glsl).
The material adapter composes through the ordered shader-hook registry and
asserts the pinned Three.js revision/chunk anchors before changing a program.
Unsupported lit materials fail preparation instead of silently rendering with
mixed ownership.

The fragment hook identifies the named directional sun by view-space
direction. It multiplies that light's `IncidentLight.color` before Three.js
evaluates direct diffuse, direct specular, clearcoat, and supported direct
transmission lobes. It does not multiply albedo, final color, emissive, indirect
IBL/environment reflection, ambient light, or any other light. Road markings
therefore receive the same named-sun visibility as other compatible materials
without becoming dark decals.

Planned investigation: [AI 559](../../prompts/AI_graphics_559_MATERIAL_shared_specular_visibility_and_grazing_shadow_leakage.md)
traces the reported grazing-angle asphalt sheen inside bus shadows and compares
it with the earlier grass issue. It will distinguish direct-sun leakage from
environment reflection or missing specular visibility before selecting a shared
correction. The existing separation of named-sun visibility and environment
reflection above remains authoritative; this pending task does not authorize
multiplying all reflected or final color by a sun-shadow mask.

Supported debug variants are normal, cache visibility, tile layer, reconstructed
depth, receiver coordinates, residency/domain, applied bias, out-of-range,
seam proximity, absolute current-versus-cache visibility difference, dynamic
visibility/depth/projection/bias, composed visibility, and absolute
current-versus-hybrid difference.
Debug selection participates in the program cache key and is prewarmed before
activation. The comparison variant deliberately retains current static caster
submission while the cache hook is active; returning to a non-comparison
variant reacquires suppression. Difference is accumulated across all named-sun
CSM branches instead of being overwritten by the final branch. A second
near-aligned directional light that could satisfy the shader matcher makes the
live sun identity ambiguous and blocks activation.

## Atomic ownership and fallback

AI 530 first validates and decodes a complete immutable resource set. Its
resource factory closes the mutable decode boundary with one plan-accounted
owned RG8 allocation. Before the explicit `renderer.initTexture` upload
boundary, AI 531 independently authenticates every row-major layer and
validates every internal, exterior-clamped, and corner guard texel in that exact
allocation, then uploads the same bytes without another full-cache prewarm
copy. The public validator still snapshots untrusted caller data. AI 531 then
prewarms stock Standard/Physical variants, installs the real city hooks, and
compiles the exact attached scene while current static casters are still
enabled. Only after that compile succeeds does it suppress `castShadow` for
nodes below the resolved city root. Dynamic objects outside that root,
including the bus, are not traversed or modified. The controller snapshots
exact prior caster flags and any city shadow-culler state.

Changing to `current`, losing the city or sun identity, package failure,
staleness, context loss, disposal, or an activation exception restores all
snapshots and leaves current maps enabled. A failed replacement never disables
the currently valid set until the lifecycle selects current fallback at a
frame boundary. Replacing or removing the engine pipeline synchronously calls
its uninstall contract before transferring ownership; a failed uninstall keeps
the previous pipeline installed. The static-sun pipeline also listens for
`webglcontextlost`, restores current ownership synchronously, and unregisters
the listener on disposal. The generic arbitrary-world sampler contains no bus,
route, or entity policy. Its receiver normal is the same interpolated geometric
vertex normal defined above. The screen-rotated Three r183 filter additionally
requires exact `fragmentCoordinatePixels` corresponding to `gl_FragCoord.xy`;
missing or malformed screen context fails closed and never substitutes
world-space noise. The square filter needs no screen context.

While active, the pipeline rechecks the exact receiver material set and rejects
new unsupported/unhooked materials or newly shared outside-root materials
before rendering. Live provenance, scene traversal, light transforms, and
receiver checks are exception-contained; an accessor/proxy/traversal failure is
an identity failure that restores current ownership instead of escaping with
casters suppressed.

AI 532 prepares one receiver set containing the static city plus every generic
registered moving receiver root. The moving vertex supplies its current
render-pose world position before static-cache geometric bias, so a shadow edge
can cross individual roof, body, wheel, or compatible glass fragments without
whole-object darkening. The dynamic field has its own projection and bias and
multiplies the same named sun visibility; it never changes this static channel's
payload or freshness identity.

## Production exact-parity sizing decision

The authoritative AI 528 inventory establishes a roughly 600 m city and
2,275,142 expanded triangles, but the checked AI 529 sun-depth output remains a
32×32 proof. Production v4 fixes the exact layout contract. AI 531 Part A later
materialized and authenticated the complete accepted-caster eight-profile set;
its strict visual result remains failed and development-only.

The versioned chain is exact: the resolved-source channel is
`bus-sim-static-sun-depth-source-v4`, the request is
`ai531-static-sun-production-request-v4`, the raw Blender receipt is
`ai531-static-sun-production-render-receipt-v5`, and the normalized receipt is
`bus-sim-static-sun-depth-production-blender-receipt-v5`. Older request or
receipt schemas cannot certify this layout.

Strict comparison evidence rejects the phase-locked 65:64 pitch candidate: a
periodic rational lattice is not strict current/cache parity. The selected
cache pitch is exactly the live 16384-over-680 m source pitch, so the ratio is
1:1. On both light-space axes the authenticated minimum bound must satisfy:

```text
(boundsLightMeters.min[axis]
    + dot(originWorld, basisAxisWorld[axis])) / 0.04150390625
    is an integer texel-edge coordinate
```

That phase rule is `absolute-stable-basis-texel-edge-lattice-v1` and is
validated again from the normalized receipt and final descriptor.

| Item | Production v4 contract and measured Part A result | Reason |
|---|---:|---|
| Source/cache texel pitch | 0.04150390625 m; exact 1:1 | Equals `680 / 16384`; no rational resampling phase remains |
| Interior per layer | [1870, 1821] texels | Rectangular dimensions retain exact isotropic pitch while fitting the immutable package cap |
| Tile size | [77.6123046875, 75.57861328125] m | Exact interior dimensions multiplied by the exact pitch |
| Guard | 4 texels/edge | Stored symmetrically on every rectangular layer |
| Stored layer | [1878, 1829] RG8 | 6,869,724 exact logical bytes per layer |
| Tile arrays | 33 row-major layers for each elevation-8 profile; 77 for each elevation-35 profile | Both remain below the V1 256-layer ceiling |
| Payload/GPU logical bytes | 226,700,892 B per 33-layer profile; 528,968,748 B per 77-layer profile | Exact guarded RG8 dimensions multiplied by the measured layer count |
| Canonical layer-window chunks | [9, 9, 9, 6] for 33 layers; [9, 9, 9, 9, 9, 9, 9, 9, 5] for 77 | A 9-layer chunk is 61,827,516 B; 10 layers would exceed the immutable 64 MiB chunk cap |
| Authenticated packages | 226,754,672–226,755,120 B low profiles; 529,195,408–529,195,696 B high profiles; 3,023,801,792 B across all eight | Every package remains below the immutable 536,870,912 B (512 MiB) cap |
| Depth quantization | `range / 65534`, half-unit max | The measured city light-depth range must set and certify this value |

The package cap is not raised. Only the internal
`development.static_sun_v1` capability profile admits this candidate's static
logical limits:

| Static-sun development limit | Value |
|---|---:|
| Steady CPU | 512 MiB |
| Steady GPU | 512 MiB |
| Peak CPU during atomic replacement | 1536 MiB |
| Peak GPU during atomic replacement | 1024 MiB |

Those limits require the transfer-owned production fetch path during atomic
replacement. They account for declared package and RG8 resource bytes, not
JavaScript/process overhead or physical GPU residency. Generic runtime defaults
and the framework's player-selectable promotion gates remain unchanged. The
modeled package exceeds the normal 256 MiB promoted disk target and cannot
satisfy first-activation network policy without reduction or streaming, so this
tier remains internal even if correctness validation passes.

## Alpha and caster release gate

Opaque BVH/ray agreement cannot certify foliage. A production bake must use
the exact evaluated AI 528 coverage definition:

```text
opacity * vertexAlpha * mapAlpha * alphaMapGreen
discard when coverage < alphaTest
```

It must also reproduce material/shadow side, culling, UV transforms, texture
bytes, mip/LOD policy, and explicit forced-opaque shadow behavior. Every caster
category in the accepted current result—including roofs, overhangs,
decorations, traffic controls, curbs, props, and foliage—must either appear in
the hashed inventory or have a reviewed exclusion with an image consequence.
Any missing silhouette, alpha mismatch, or missing occluder blocks production
activation rather than becoming a tolerance.

Production native-field provenance is source-only. The package boundary
accepts only authenticated direct Depth24 readback v2, texture-gradient source
reconstruction v3, or source-only hole-fill v6 receipts. Validation reports,
screenshots, localization output, calibrated texels, and residual corrections
are diagnostic inputs and cannot be promoted into a production bake. The
orchestrator checks this allowlist before rendering, production-receipt
normalization rejects diagnostic identities, and release finalization checks
the normalized receipt again. A visually improved diagnostic field does not
override this provenance rule.

AI 531 Part A uses `tools/static_sun_depth/finish_part_a.mjs` as its resumable
development-readiness boundary. It checkpoints each of the exact eight
production profiles, proves that presentation-only validation state leaves all
package/publication bytes unchanged, requires Lab 8/8, and preserves the
user-approved 128/197 baseline with no more than 69 visual-only failures in the
unchanged 197-case production catalog. It accepts no nonvisual failure and can
reauthenticate/reassess a completed report after a workflow-policy update
without rerunning the GPU catalog. On 2026-09-03 AI 546 closed those cases by an
explicit user-approved defer because every affected-area result was below 0.5%
(maximum 0.486896749%). This does not change the strict report, activate
gameplay by default, or issue a release certificate.

## Current evidence and promotion gate

Bus appearance changes can stage replacement receiver materials against the
already active binding without deactivating this cache. The pipeline validates
unchanged alpha/depth/caster semantics, prewarms the candidate shaders, then adopts
receiver hooks and moving-caster material references synchronously with the mesh
swap. The existing depth texture and dynamic shadow target remain resident and
active. Failed or canceled candidates discard only their staged hooks. This
appearance-only transaction does not bypass source/profile validation or change
publication gates; see [vehicle lighting](vehicle_diffuse_probes.md).

The deterministic fixture compiler and checked artifact prove strict AI 529
input validation, RG8 quantization, guard generation, content addressing, and
CPU/runtime sampling. They do not prove production city coverage:

| Evidence | Result |
|---|---|
| Fixture interior/stored size | 32×32 / 36×36 with two guards |
| Fixture payload | 2,592 B |
| Quantization unit / theoretical max | 0.0152577 m / 0.00762886 m |
| Measured fixture maximum / mean error | 0.00474105 m / 0.00442239 m |
| Occupied / empty | 256 / 768 texels |
| Browser CPU/GPU sampler parity | 14 WebGL2 readbacks (Standard + Physical) passed within 2/255 across rotated basis/origin, signed and empty depths, fully lit/occluded PCF, internal guards, global edges, and normal bias |
| Browser composition scope | 10 final-color readbacks prove named-sun visible/occluded contrast while a non-aligned directional light, ambient light, and emissive remain visible for Standard + Physical |
| Atomic negative coverage | Whole-package corruption, forged per-layer hash, valid-hash invalid guards, stale request identity, live-source drift/exception, receiver-material drift, exact-city compile failure, context loss, and pipeline removal all retain/restore current |
| Strict density/phase evidence | Exact 0.04150390625 m source/cache pitch, 1:1 ratio, and integral stable-basis texel-edge phase are required; the phase-locked 65:64 candidate failed strict parity and is rejected |
| Production logical layout/package | Complete authenticated eight-profile index: four 33-layer packages and four 77-layer packages, totaling 3,023,801,792 B on disk; deterministic isolation passed |
| Physical GPU memory | `not measured` — WebGL2 exposes no portable authoritative counter |
| Full-city image error and missing occluders | Strict catalog passed 128/197; maximum aligned RGB error 95 B, maximum mean 0.258907 B, maximum pixels-over-four 0.486897%, 386 missing-occluder pixels in aggregate, maximum seam run 12 px, and zero seam-false-lit pixels; strict validation failed while the user-approved Part A development-readiness boundary passed |
| Current/cache frame and shadow-pass timings | `not measured` for promotion — the machine has concurrent processes and a shared GPU, and the fixture is not representative |
| Full-city disk/load/decode/upload/residency | 3,023,801,792 B measured package bytes across eight profiles; per-active-profile logical RG8 residency is 226,700,892 B or 528,968,748 B; load/decode/upload time and physical residency are `not measured` because the GPU session is shared |
| Alpha-cutout parity | 8/8 accepted-caster profiles, 1,800 sparse samples, zero occupancy and first-hit-depth mismatches, maximum matched depth error 0.000488281 m against the 0.005 m gate |

Production promotion requires the immutable validation catalog, same-session
current/cache comparisons, zero missing occluders, strict numeric and image
tolerances, and the complete performance table requested by AI 531. The Part A
report does not meet those release gates. Its separately approved 128/197
development-readiness boundary permits downstream development while the runtime
stays disabled by default with current-engine fallback. AI 546 is complete by
explicit defer: all 69 visual-only cases are accepted for the development
workflow because their affected area is below 0.5%, while the strict 128/197
status remains failed and uncertified.

## Calibrated high-sun density default (September 2026)

The high-sun source-aligned grid now uses capability
`three-r183-calibrated-864m-16384-v2`: 16384-square source depth over864m,
5.2734375cm/texel,2040-square interiors and four guard texels on each side.
Stored tiles are2048-square RG8. This replaces the calibrated960m grid
(5.859375cm/texel), increasing linear sample density by11.11% without removing
city receivers or casters. The historical680m low-sun grid remains unchanged.

Full-city BigCity2 bounds require8x7 tiles at the new density. Their logical
payload is448MiB versus366.88MiB previously. The512MiB container ceiling,
64MiB chunk ceiling, native16K region bounds, exact pixel phase, foliage parity,
source identity and publication gates remain enforced. Baking sample count does
not change these nearest-occluder depth maps. Runtime moving-object High remains
4096-square at1.25cm/texel and is independent of this static bake.

This is a denser default for the calibrated candidate, not a certification of
the historical aggregate release. The earlier35-degree bake had4.15cm texels;
matching that density at55degrees requires more than the current16K native
capture can cover over the full city, so this change does not promise that match.

## AI 547 streamed detail experiment

The first prototype uses the installed calibrated 55-degree descriptor as its
authenticated parent. Its static shadow layer remains complete while optional
detail pages arrive. Detail is true native Depth24 capture at three times the
parent density (1.7578125 cm per texel), packed into nearest-depth RG8 with
authenticated gzip transport. It is not an upscaled copy of the parent map.

The 1020-texel page interiors have 141-texel guards at the current depth range,
covering the finite-sun blocker search. Adjacent native viewport edge rounding
is reconciled using the nearest measured blocker at the identical world texel.
The original disagreements, corrections and exact post-consolidation overlap
checks are retained. Empty-page metadata is authenticated against all-empty
bytes. Unlisted, late, corrupt and evicted pages use the complete parent.

The initial package covers approximately 110 metres around one reference pose.
Runtime owns a bounded 16-layer pool, two worker requests and one upload per
frame. Arrival and retirement fades blend decoded visibility. Per-fragment
projected footprint selects detail; selection includes projected frustum bounds,
filtering guards and predicted mover travel. The complete parent plus detail
pool occupies approximately 500 MiB of logical GPU texture storage. Physical
VRAM allocation is not exposed by WebGL and is not claimed as measured.

This experiment does not yet replace full-parent residency with a coarse/far
pyramid, modify dynamic interaction clusters or certify all sun profiles.
Normal gameplay includes the detail sampler and defaults the independent
`shadows.streamedDetail` preference on (Options: **Fine building shadows**).
Explicit saved `false` remains off. The optional published streaming index must
match the installed parent descriptor exactly; missing or invalid detail keeps
the complete parent. `streamedShadowPrototype=0` disables the extension for
diagnostic comparisons. A custom gitignored experiment index still requires an
explicit `streamedShadowPrototype=1` URL. See the tool README and active AI 547
prompt for generation, publication gates and remaining broader milestones.

## Calibrated shadow filtering regression (September 11)

Calibration introduced finite-sun PCSS independently of the depth-map density.
The filter now corrects receiver depth at the actual texel centre for every
blocker and bilinear comparison. Correcting only the continuous sample position
could invent blockers on a sloping surface. The legacy point-source/debug path
keeps its existing comparison policy.

When the centre ray is blocked, its measured separation bounds the subsequent
blocker search. A nearby ledge must not acquire a broad penumbra merely because
an unrelated distant blocker lies in the original full-depth-range search disk.
The sun diameter, baked maps, bias contract and direct/indirect intensities are
unchanged. Both normal gameplay and optional streamed detail use the correction.
This remains a PCSS approximation. Filtering corrections and the separate native
detail-map generation must be evaluated independently.

The actual-GLSL regression in
`tests/headless/e2e/static_sun_receiver_plane.pwtest.js` covers unobstructed slopes,
a nearby blocker beside a distant blocker, and the broader penumbra expected
from a distant blocker. Before correction a clear sloping receiver produced
visibility as low as 106/255, and an opaque contact region leaked 13/255 light.
The isolated game before/after capture is registered as
`lighting/shadows/streamed/filter-review`; artifacts live under
`tests/artifacts/screens/shadow_filter_quality/`.

Research outcome: `review-01` isolated and corrected receiver-plane sampling;
`review-02` added the measured centre-blocker search bound; `review-03` repeated
the final pair and disabled the hybrid shadow hook. That diagnostic bypasses both
static and moving-object composition, despite its original `without-static-shadows`
filename; it is not an isolated static-only pass. `diagnostics-04`
compared the pre-calibration filter at exactly the current map density. The
older filter makes distant edges narrower but retains visible ledge artifacts;
turning it back on is not equivalent to restoring lost depth-map detail.
Normal gameplay retains the calibrated finite sun rather than changing its
diameter or substituting point-source shadows.

In the last matched pair, three GPU medians were 13.06/12.81/12.79 ms before
and 13.01/12.87/13.00 ms after. Earlier pairs showed up to about 0.4 ms higher
GPU cost; these shared-hardware observations are not a performance win claim.
No allocation or baked-channel default changes were made for the filter fix.

### Historical image and player-toggle follow-up

The September 11 historical review confirms that the finer streamed image has
visible bands inside the large platform shadow's penumbra. Its sampled 10–90%
display-luma width is still about 12–17 pixels, similar to the parent and Cycles;
the defect is the transition shape rather than simply its width. The nearby
right-hand ledge remains streaky with both the current and legacy filters on
the installed map. Finer map generation alone has not passed visual acceptance.

`lighting/shadows/streamed/toggle-review` validates baked on/off/on with the
same pose and indirect illumination. The shadow shader hooks really deactivate,
live casting resumes, and the restored baked capture is pixel-identical. That
initial off capture uses the repository's Cascade/High preference, not Single.
With `benchmark=true` the leaf explicitly selects Single/High and measures two
fresh browsers with three alternating passes per configuration. At 1920x1080
on RTX 3060, median-of-pass GPU times were 11.55 ms for Single/High with baked
indirect, 13.23 ms for baked finite-sun shadows, and 9.34 ms for the old filter
on the same current maps. The respective pass ranges were 10.53–21.72,
12.67–17.68 and 9.20–17.43 ms. These shared-machine stationary measurements
contain substantial spikes and do not certify route performance. Full Current
without baked indirect measured 14.95 ms median, with a 14.61–33.10 ms range;
its ambient/AO path differs, so it is not an isolated shadow-filter comparison.

Evidence and all pass summaries are under
`tests/artifacts/screens/shadow_filter_quality/benchmark-06/`;
`historical-review-07/` contains the research log and native-pixel crops.
The calibration filter is a demonstrated cost increase; replacing it globally
with hard shadows would also remove desired distance-dependent softness. Repair
the ledge representation/filtering and preserve smooth broad penumbras within
the older sampling budget before approving streaming. Existing synthetic shader
tests are insufficient image-level coverage for these two reported defects.

### Fine shadow rollout and filter cost recovery

The RG8 production sampler resolves a page once for each four-tap bilinear
comparison, uses authenticated guard texels across tile boundaries, and compares
the four packed depth codes together. Debug/other encodings retain the scalar
path. The finite-source path uses a centre probe plus two four-probe rings;
blockers outside their possible solar cone are rejected. A centre-blocked ray
bounds the search by its measured separation. Even a clear centre receives the
minimum bilinear edge comparison, avoiding a discontinuous lit-side early exit.
Twelve fixed-angle bilinear visibility taps preserve broad smooth transitions.

The detail pass uses the minor projected footprint to retain resolution on
foreshortened walls. Broad penumbras transition to the complete parent map;
sampling sparse high-resolution depth taps there produced visible bands without
adding useful detail. This does not change the calibrated 0.53-degree sun,
exposure, illumination intensity, or baked indirect maps.

The registered `/city` job generates all 2,016 detail cells for the matching
55-degree city profile at 0.017578125 m per texel, versus the installed parent's
0.052734375 m. Capture preserves the source's effective shadow sidedness and
reconciles guards in two bounded rows rather than loading every page into RAM.
The candidate has 809 nonempty payloads totalling 88,868,024 compressed bytes.
Runtime retains 16 pages (54,278,784 bytes including the page table) beside the
448 MiB parent: about 499.76 MiB of logical static texture storage. Detail is
three times denser along each axis, not an upsampled version of the parent.

`lighting/shadows/streamed/publish` requires complete matching source coverage,
authenticated payloads/guards, two fresh browsers with three repeated timing
passes, intact baked indirect lighting, corrupt-page fallback, and exact hashes
of the reviewed shadow shaders. It authenticates the installed copy before
atomically updating the optional detail index. Parent package publication and
identity gates remain unchanged. Other sun profiles use their complete parent
until a separately matching detail bake is available. The wider AI 547 work on
far-parent reduction and dynamic clustering remains open.

Published fine-detail manifest:
`2528f4de63eb625a3a611f21aa079bf4dbc6e49c69121abc349955f9d10733ca`.
The installed parent descriptor hash remains
`be8b97862f1fa4551386aa2d687d755be82098608fbe497604ed527acb787c58`.
Generation took approximately 5m22s; the final paired/route review took 9m01s.
At 1920x1080 on RTX 3060, six stationary fine-shadow passes had GPU medians
11.26-11.48 ms (middle sample 11.44 ms), and six route passes 11.41-11.62 ms
(middle sample 11.51 ms). The corrected parent-only path measured 10.36-10.53 ms
stationary and 10.69-10.79 ms on the route. These are measured whole-render
times, not isolated shader times or guaranteed performance on other hardware.
The older filter's same-map stationary reference measured 12.97-13.29 ms.

The left platform's measured display-luma transition remains 12/15/17 pixels
at the three fixed rows, versus 13/15/17 before; its smooth broad shadow is
preserved. The close right ledge fringe is narrower, but native texel aliasing
is still visible at very close inspection. This rollout does not claim analytic
or ray-traced subpixel silhouette reconstruction. Review artifacts:
`tests/artifacts/screens/illumination_547/city-review-16/`; original/corrected
native crops: `tests/artifacts/screens/shadow_filter_quality/final/comparison.png`.

Installed normal-game verification (`shadow_filter_quality/installed-17`) uses
Single/High as the retained live preference, identical indirect illumination,
two fresh browsers and three alternating passes each. GPU pass medians were
10.34-10.45 ms for fine baked shadows and 10.36-10.44 ms for Single/High.
This matched run demonstrates cost parity at this pose, not a statistically
meaningful speed advantage. All baked passes loaded 16 installed detail pages
without experiment-index routing. The difference from the earlier 11.4 ms run
is why cross-run timing comparisons are not treated as isolated measurements.
The white-building pose also passed installed baked/live/baked restoration in
`shadow_filter_quality/reference-18`; the initial and restored baked PNGs have
identical SHA-256 hashes and indirect illumination stayed enabled throughout.
