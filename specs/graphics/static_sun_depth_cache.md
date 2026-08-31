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
AI 532 owns bus sampling and AI 535 owns player-facing Options behavior.

## V1 channel identity

The channel descriptor schema is `static-sun-depth-tile-set-v1`; its channel ID
is `static_sun_depth` and its channel version is `1`. Unknown fields and unknown
semantic strings reject validation. The immutable identity contains:

- the exact city ID, resolved channel-source SHA-256, static-caster inventory
  SHA-256, compiler-signature SHA-256, and alpha-semantics SHA-256;
- one normalized point direction from a world receiver toward the named sun;
- a stable world-to-light basis and origin;
- the complete row-major tile inventory, half-open global and per-tile bounds,
  square interior resolution, guard width, texel density, and payload hashes;
- signed light-depth range and exact RG8 quantization/empty representation; and
- comparison, empty, out-of-bounds, bias, and PCF policy.

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
ordered by increasing light-space Y and then X. Each tile has a square interior
and an equal guard on all four edges. The hashed V1 guard policy copies the
owning adjacent tile's interior texels across internal seams and clamps to the
nearest domain-edge interior texel at exterior edges. A guard must cover the
entire PCF radius; runtime mip generation and implicit linear filtering are
forbidden in V1. CPU activation verifies every internal, exterior, and corner
guard against the complete resident set before exposing it to sampling.

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
of the sun and does not claim physical penumbrae. Its only softness option is a
deterministic nearest box kernel with radius 0 or 1 texel (1×1 or 3×3).

Receiver bias is:

```text
constantMeters + normalOffsetScaleMeters *
    (1 - clamp(dot(worldNormal, sunPointDirectionWorld), -1, 1))
```

The comparison is
`receiverDepthMeters - biasMeters <= storedCasterDepthMeters`. Bias and kernel
values are hashed channel identity, not mutable ambient settings. Production
promotion must reject acne, peter-panning, halos, leaks, and seam hiding caused
by unmeasured bias or blur.

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

Supported debug variants are normal, cache visibility, tile layer, reconstructed
depth, receiver coordinates, residency/domain, applied bias, out-of-range,
seam proximity, and absolute current-versus-cache visibility difference.
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
the listener on disposal. The generic arbitrary-world sampler has only
position and receiver-normal inputs and contains no bus, route, or entity
policy.

While active, the pipeline rechecks the exact receiver material set and rejects
new unsupported/unhooked materials or newly shared outside-root materials
before rendering. Live provenance, scene traversal, light transforms, and
receiver checks are exception-contained; an accessor/proxy/traversal failure is
an identity failure that restores current ownership instead of escaping with
casters suppressed.

## Production sizing decision

The authoritative AI 528 inventory establishes a roughly 600 m city and
2,275,142 expanded triangles, but the checked AI 529 sun-depth output is only a
32×32 proof. The following is therefore a bounded production candidate, not a
promoted layout or visual-quality result:

| Item | Candidate | Reason |
|---|---:|---|
| Covered square | 640×640 m | Ten 64 m tiles per axis cover the approximately 600 m city with an explicit edge margin |
| Tile grid | 10×10 (100 layers) | Below the V1 256-layer target and preserves bounded spatial diagnostics |
| Interior | 544×544 texels/layer | 0.117647 m/texel; a 3×3 kernel spans about 0.353 m |
| Guard | 4 texels/edge | Covers radius-1 PCF and leaves room for deterministic edge duplication |
| Stored layer | 552×552 RG8 | Nearest, base mip only |
| Full payload/GPU logical bytes | 60,940,800 B (58.12 MiB) | Fits AI 530's 64 MiB single-chunk ceiling with 6,168,064 B headroom |
| Depth quantization | `range / 65534`, half-unit max | The actual measured city light-depth range must set and certify this value |

A denser 960-interior, 10×10 RG8 layout would require 187,404,800 bytes
(178.72 MiB) before package metadata. It is below the broad 256 MiB steady GPU
budget but violates AI 530's 64 MiB single-chunk/first-activation target and is
not selected. The 544-interior candidate still requires an exact fresh AI 528
export, measured light-space bounds, a production AI 529 tiled bake, alpha
parity, current-shadow comparisons, load/upload profiling, and a device layer
limit check before promotion.

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

## Current evidence and promotion gate

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
| Physical GPU memory | `not measured` — WebGL2 exposes no portable authoritative counter |
| Full-city image error and missing occluders | `not measured` — no production tiled bake exists |
| Current/cache frame and shadow-pass timings | `not measured` — the fixture is not representative |
| Full-city disk/load/decode/upload/residency | `not measured` — the production package is absent |
| Alpha-cutout parity | `not measured` — proof output cannot release production foliage |

Production promotion requires the immutable validation catalog, same-session
current/cache comparisons, zero missing occluders, strict numeric and image
tolerances, and the complete performance table requested by AI 531. Until all
rows are measured on a fresh source identity, the prompt remains active and the
runtime stays development-only with current-engine fallback.
