# Illumination Framework

## Status and authority

This document is the architecture authority for the optional illumination program defined by AI 526 and decomposed into AI 527 through AI 536. It fixes composition, ownership, capability lifecycle, channel invalidation, toolchain, coordinate/color conventions, validation cases, budgets, and descendant handoffs. Later AIs may select encodings and algorithms inside these boundaries, but they must not reopen the boundaries implicitly.

The existing Three.js renderer is the permanent compatibility oracle and is called `current` mode below. Blender and generated illumination payloads are offline, optional inputs. They are never required for application startup, city loading, or normal gameplay.

AI 527 is specification and measurement only. It changes no production rendering behavior.

## Existing implementation audit

The audit is against code, not prompt filenames.

| Initiative | Implementation state at the AI 527 baseline | Framework disposition |
|---|---|---|
| AI 323 static AO visibility | Open. A vertex `staticAo` path exists and is default-off, but AI 323's visibility/repair work is not complete. Its built-in-material patch also predates the shader-file policy. | Preserve in `current`; AI 534 owns any migration, reduction, or removal. It is not a bake-source contract. |
| AI 497 shadow cost reduction | Partially shipped. Visible-region caster culling, merged building/prop casters, one shadow build per frame, and the current single/cascade presets are live. Remaining AI 497 work is still open. | These are the `current` shadow oracle and fallback. Do not copy their camera-relative culling decisions into an offline sun cache. |
| AI 498 bus shadow upgrade | Open. The runtime imports Three.js 0.183.2 and has no dedicated bus-only production shadow map. | AI 532 supersedes the overlapping bus-map portion. A Three.js upgrade remains independent work. |
| AI 520 color PVS | Shipped for buildings, traffic controls, and trees with canonical freshness checks and fail-open behavior. It restores color-hidden roots for shadow and auxiliary passes. | Reuse its deterministic/fail-open lessons only. Its camera-color visibility masks, hashes, and payload are forbidden as sun-shadow data. |
| AI 524 AO exclusion depth reuse | Shipped. Retained visible-scene depth plus excluded-receiver-only rendering is the production path, with a correct legacy fallback. | Keep unchanged until AI 534 makes an evidence-backed AO decision. |
| AI 525 AO architecture experiment | Complete experiment. Stencil and packed-alpha candidates were rejected; AI 524 remains production. | No MRT/stencil assumption enters the illumination design. |
| AI 408 global renderer/lab | The planned global pipeline checklist remains open, while `GameEngine` and `PostProcessingPipeline` currently own the operational frame. The existing Lab Scene is already the common validation shell. | Illumination is a consumer of that ownership. It must not create another renderer, frame loop, or lab. |

Current renderer facts that descendants must treat as compatibility inputs:

- Three.js import maps are pinned to 0.183.2.
- World rendering is right-handed, Y-up, with the city ground plane in X/Z.
- Output is sRGB; scene intermediates in the composer are linear-sRGB.
- Default lighting is AgX at exposure 0.86, hemisphere intensity 1.46, sun intensity 5.75, and IBL enabled at intensity 0.28.
- Default atmosphere sun is azimuth 45 degrees and elevation 35 degrees.
- Default shadows are single/high: one 16384 map, 340 m reach, PCF radius 1.5 texels.
- Default AO is GTAO every frame, alpha-cutout receivers excluded through the retained-depth mask; static AO and the bus contact-shadow rig are default-off.
- When post-processing is active, helper bloom/occlusion renders reuse old shadow maps and the main visible composer pass is the only shadow-map build for the frame.

The window/glazing specifications contain conflicting prose about opaque shadow silhouettes versus non-casting glass. AI 528 must export the evaluated runtime caster/material behavior and flag the conflict; it must not choose a rule from prose alone.

## Canonical and derived ownership

The authored city/configuration is the domain source. The fully resolved gameplay city plus an explicit illumination profile is the canonical bake source. Everything after that boundary is derived:

1. resolve authored city and active assets;
2. canonicalize stable IDs, geometry, transforms, materials, caster/receiver semantics, and profile inputs;
3. validate and hash the canonical record;
4. export a deterministic interchange package;
5. reconstruct and validate a clean Blender scene;
6. bake channel intermediates;
7. canonicalize and quantize outputs with project tools;
8. package, hash, and integrity-validate runtime chunks.

GLB files, Blender objects, `.blend` files, atlases, depth tiles, lightmaps, previews, and runtime binaries are derived artifacts. No Blender scene, UI, filename, or payload may invent canonical IDs or establish its own freshness. Runtime compatibility must be decided against a canonical source hash independently reconstructed from the live resolved city.

Freshness hashes answer “was this produced from the active source/profile/compiler inputs?” Integrity hashes answer “are these exact output bytes intact?” They are separate fields and failures.

The live mesh-fabrication handoff from AI 481 is not the city bake format. The illumination pipeline reuses its stable-identity, provenance, schema/version, canonical/derived, validation, and deterministic-stage principles only.

## Linear lighting composition

All physical lighting terms compose in scene-linear Linear-sRGB before color grading, tone mapping, output conversion, bloom, flare, and other display effects. Let `p` be a shaded fragment and `m` its material:

```text
L_scene(p) =
    VstaticSun(p, profile) * VdynamicSun(p, t) * LsunDirect(p, m)
  + sum(VdynamicLight[j](p, t) * LotherDirect[j](p, m))
  + Aindirect(p, m, mode) * LindirectDiffuse(p, m, mode)
  + LindirectSpecularAndReflection(p, m)
  + Lemissive(p, m)
  + LvolumeAndTransmissionResidual(p, m)
```

This is a logical ownership equation, not a requirement to merge all lobes into one shader function. A sun visibility value shadows every lobe caused by that sun—direct diffuse, direct specular/clearcoat, and explicitly supported direct transmission—but never indirect environment reflection/specular, emissive, or final color. The terms have these exact meanings:

| Term | Owner | May a baked channel change it? | Rule |
|---|---|---|---|
| `LsunDirect` | PBR material lighting for the named sun profile | A direct-receiver bake may replace direct diffuse only for mapped static receivers. | Live direct specular/clearcoat and supported direct transmission remain runtime terms. No lobe is both live and baked for the same receiver. |
| `VstaticSun` | Static-world sun-depth channel | Yes, AI 531 supplies it. | Multiplies only live lobes from the named sun. A baked direct-diffuse texel already contains static visibility and must not multiply it a second time. It never multiplies base color, final color, IBL, emission, environment reflection, AO, or post effects. |
| `VdynamicSun` | Dynamic caster layer | Yes, AI 532 supplies bus self/world visibility. | Combines with static visibility for the same sun, normally by multiplication/min visibility. The static cache excludes dynamic casters. |
| Other direct lights | Current live renderer unless a future separately named channel exists | No channel in AI 526 may silently absorb them. | Each light retains its own visibility and BRDF term. |
| `LindirectDiffuse` | Either current hemisphere/IBL diffuse or compatible baked indirect irradiance | AI 533 may replace overlapping current diffuse environment energy on mapped static receivers. | A profile must declare replacement or residual weighting. Unqualified addition of baked GI on top of the same live ambient/IBL energy is forbidden. |
| Indirect specular/reflection | Current live environment/reflection system | Not by the initial diffuse irradiance bake. | Static AO may currently affect it in `current`; that compatibility behavior is audited by AI 534, not silently copied. |
| Emissive surface output | Material | No. | Remains additive and unshadowed by a generic visibility mask. Its bounced contribution may be present in baked indirect and then invalidates that channel. |
| Transmission/volume | Current material/renderer, except the direct sun lobe named above | Only an explicitly supported, validated channel may replace it. | Unsupported bake semantics fail validation or stay live; they are not approximated without declaration. |
| Static AO/bent normal | Static AO channel | AI 534 decides whether it is retained with baked GI. | It describes local ambient visibility, never directional sun visibility. |
| SSAO/GTAO | Screen-space dynamic/detail AO | Current post pipeline | It remains separate from baked GI/AO. AI 534 resolves overlap and intensity. |
| Bus contact/grounding | Dynamic bus contact rig or AI 532 dynamic shadow | AI 534/532 may replace overlapping cues after measurement. | It must not darken the whole bus or become part of the static cache. |
| Exposure/tone map/output/post | Global pipeline after scene-linear composition | Never baked into production lighting channels. | Changing display exposure or tone mapping never invalidates a raw lighting bake. |

A lit road marking is a normal receiver: static visibility attenuates its direct sun lobe. The forbidden behavior is a dark decal or final-color multiplication that also dims its base color, IBL, reflection, or emissive contribution.

For a receiver using fully live sun shading, composition is:

```text
LsunLive = VstaticSun * VdynamicSun
         * (LsunDiffuseLive + LsunSpecularLive + LsunTransmissionLive)
```

For a mapped static receiver whose direct diffuse channel is active, the stored `EdirectBaked` already includes the static-caster visibility and static direct irradiance at that texel. Composition is:

```text
LsunBakedReceiver = VdynamicSun * (
    DiffuseBRDF(baseColor, metalness) * EdirectBaked
  + VstaticSun * (LsunSpecularLive + LsunTransmissionLive)
)
```

`VdynamicSun` therefore lets the moving bus shadow a baked static receiver. `VstaticSun` is still sampled for the live direct specular/transmission lobes but is not applied again to `EdirectBaked`. If a receiver or material cannot implement that split exactly, its complete sun term remains live and uses the static/dynamic visibility path.

Direct and indirect receiver channels use project-relative scene-linear irradiance units. A stored irradiance `E` is defined before receiver base color, metalness, and diffuse BRDF: for a unit-white, non-metallic Lambert receiver, `E = pi * Lout`. Cycles outputs must exclude receiver color and be converted/calibrated to this convention with a signed compiler profile and canonical unit-white fixtures; exposure or visual look tuning is not a unit conversion. Bounce-surface color remains an indirect input even though receiver color is excluded.

A scalar irradiance texel cannot reproduce a runtime normal map. V1 therefore keeps the overlapping live diffuse term for every receiver whose shading normal differs from the exported geometric/interpolated normal. AI 533 may promote such a receiver only by implementing a measured directional-irradiance representation evaluated with the runtime shading normal; it must not claim scalar lightmaps preserve normal-map response. Runtime roughness-dependent direct specular remains live, and runtime metalness continues to remove the diffuse BRDF contribution.

### Receiver classes

- Static world receiver: may use static sun visibility and, when mapped, baked direct/indirect/AO channels.
- Dynamic bus receiver: may sample static-world sun depth at each fragment and the dynamic bus layer. It does not use static receiver lightmaps.
- Other future dynamic receiver: defaults to `current` until it explicitly implements the same world-depth contract.
- Unsupported/editable/auxiliary receiver: uses `current`; it must never inherit a gameplay-camera baked mapping by accident.

### AO resolution rule

Logical AO sources remain independently inspectable, but a preset must resolve them to one declared indirect-visibility policy. It may not let static AO, baked GI contact darkness, SSAO/GTAO, and a contact decal all multiply at full strength by accident. `current` mode preserves today's behavior exactly. AI 534 owns the measured baked-mode policy and must compare static crevices, foliage, overhangs, interiors, bus-ground contact, and mode transitions before changing it.

## Capability modes and lifecycle

The controller exposes a requested mode and an effective mode.

| Requested | Effective behavior |
|---|---|
| `current` | Always `current`. No generated payload or Blender capability is consulted. |
| `baked` | `baked` only after a complete compatible resource set is staged; otherwise `current` with a stable fallback reason. |
| `auto` | Selects `baked` only when a complete compatible profile is available; absence is normal and otherwise remains `current`. |

The public controller status vocabulary is fixed:

| State | Meaning | Effective mode |
|---|---|---|
| `unavailable` | No package/profile exists, required WebGL capability is absent, or the city/camera/light mode is unsupported. | `current` |
| `loading` | Manifest/chunks are being fetched, validated, decoded, uploaded, and shader programs prewarmed in a staging set. | `current` |
| `active` | One fully compatible immutable baked resource set is committed. | `baked` |
| `stale` | Source, profile, coordinate, compiler, or channel freshness does not match the live resolved state. | `current` |
| `failed` | Integrity, schema, decode, upload, allocation, validation, or program preparation failed. | `current` |
| `fallback` | Stable controller outcome for a requested `baked`/`auto` mode after an unavailable/stale/failed/unsupported cause. Diagnostics retain the exact cause and retry trigger. | `current` |

Missing assets are not an exceptional application state. User-facing diagnostics are non-spamming; developer diagnostics retain requested/effective mode, state, package/profile IDs, source and integrity hashes, selected channel set, memory, load stage, and exact fallback code.

The public `state` is one of the six values above. More detailed labels required by descendants are structured fields, not additional competing primary states:

| Descendant label | Public state | Structured phase/reason |
|---|---|---|
| `ready` | `loading` | `phase = ready_to_commit`; validation/upload/prewarm finished, but no frame-boundary commit has occurred |
| `stale-source` | `stale` | `reason = source_mismatch` |
| `incompatible-profile` | `stale` | `reason = profile_mismatch` |
| `unsupported-capability` / `unsupported device` | `unavailable` | `reason = unsupported_capability` plus capability code |
| `corrupt` | `failed` | `reason = integrity_failure` plus chunk/hash code |
| `cancelled` | `fallback` | `reason = cancelled` or `superseded`; teardown may dispose without publishing a new status |
| `current-engine fallback` | `fallback` | `causeState` retains `unavailable`, `stale`, or `failed` and its exact reason |

Diagnostics also expose `phase` (`locating`, `fetching`, `validating`, `decoding`, `uploading`, `prewarming`, `ready_to_commit`, `committed`, `retiring`, or `disposed`) and resource disposition. `ready_to_commit` is immutable and complete but continues rendering `current` until the next frame-begin commit.

### Atomic transition invariants

1. Loading and validation happen in a staging resource set while the complete current path remains active.
2. Required channels for the selected baked profile, their bindings, and all shader programs are ready before commitment.
3. The controller commits one immutable frame snapshot at the frame-begin boundary. No frame may mix old and new ownership for overlapping terms.
4. Switching to `current`, or any stale/failure event, commits a complete current snapshot at the next frame boundary.
5. Resources from the previous snapshot remain alive until no submitted frame can reference them, then are disposed exactly once.
6. Cancellation, city teardown, context loss, mode thrashing, and repeated load failure must not leak CPU/GPU resources.
7. A live mode switch requires no page reload and no restart. Once staging is ready, its commitment meets the mode-switch budget below.

## Channel profiles and invalidation

Every physical channel has a separate descriptor, source hash, profile hash, compiler signature, output-integrity hash, optional chunk table, and compatibility result. Physical packing may combine channels only if descriptors remain independently reversible and validate atomically according to the package manifest.

| Channel ID | Stored meaning | Required profile inputs | Explicit non-inputs |
|---|---|---|---|
| `static_sun_depth` | Orthographic light-space nearest static-caster depth/coverage tiles | Static caster geometry/transforms; caster classification; alpha silhouette inputs; sun direction; tile bounds/layout; depth convention; resolution/precision; filter/bias compatibility class | Sun intensity/color; receiver albedo; IBL; exposure/tone map; camera color PVS |
| `direct_receiver` | Light-only direct irradiance for mapped static receivers | Receiver geometry/normals/mapping; caster inputs; sun direction, color, intensity, angular size/filter/sample model; supported direct lights; direct bake settings | Receiver base color when output is light-only; exposure/tone map; unrelated IBL |
| `indirect_irradiance` | Light-only bounced diffuse irradiance for mapped static receivers | Receiver mapping; complete participating static geometry; bounce-surface albedo/emissive/transmission semantics; sun/other baked lights; environment/IBL profile; bounce/sample settings | Receiver display exposure/tone map; dynamic bus transform |
| `static_ao_bent_normal` | Local ambient visibility and optional bent direction | Participating geometry/alpha; receiver mapping; AO radius/distance; rays/samples; sidedness; precision | Sun direction/intensity/color; IBL intensity; exposure/tone map |

### Input sensitivity matrix

`Y` means the channel is stale. `C` means stale only when that semantic is compiled into the named output. `N` means it is not a freshness input.

| Input change | Sun depth | Direct receiver | Indirect | AO/bent normal |
|---|:---:|:---:|:---:|:---:|
| Used static geometry/topology/placement | Y | Y | Y | Y |
| Static caster/receiver eligibility | Y | Y | Y | Y |
| Alpha texture/UV/transform/wrap/cutoff/sidedness | Y | Y | Y | Y |
| Sun azimuth/elevation | Y | Y | Y | N |
| Sun intensity/color | N | Y | Y | N |
| Sun angular size/filter model | C | Y | C | N |
| Environment/IBL profile | N | N | Y | N |
| Bounce-surface base color/rough transport material | N | N | Y | N |
| Receiver base color only | N | N for light-only output | N for light-only output | N |
| Static emissive source | N | N | Y | N |
| Receiver atlas/UV mapping | N | Y | Y | Y |
| AO radius/rays/samples | N | N | N | Y |
| Tile/atlas resolution, padding, precision, compression semantics | Y | Y | Y | Y |
| Channel compiler script/config version | Y | Y | Y | Y |
| Camera FOV/pose or color PVS | N | N | N | N |
| Tone mapping, exposure, color grade, bloom, AA | N | N | N | N |
| Bus pose/animation | N | N | N | N |
| Unused catalog entry | N | N | N | N |

Full-city invalidation is the first supported policy. Incremental rebuilds require a later proven dependency graph, stable chunk ownership, and cross-chunk seam model. A profile lookup is exact: mismatched sun/profile data is never sampled “close enough.”

### Minimum activation profiles

The generic AI 530 container may carry independently optional channels, but a named runtime capability declares an exact required set. User-facing `baked` never means “use whatever chunks happened to load.”

| Capability profile | Required data/runtime capability | Optional additions | Exposure |
|---|---|---|---|
| `development.static_sun_v1` | `static_sun_depth` and compatible static-receiver shader path | none | Internal AI 531 validation only; not player-selectable because bus composition is incomplete |
| `baked.hybrid_sun_v1` | `static_sun_depth`, AI 532 static-world sampling on the bus, and AI 532 dynamic bus self/world shadow layer | AO policy selected by AI 534 | Minimum player-selectable baked profile after AI 532 |
| `baked.hybrid_sun_indirect_v1` | `baked.hybrid_sun_v1`, receiver mapping, and `indirect_irradiance` | AO/bent normal selected by AI 534 | Player-selectable only after channel validation |
| `baked.hybrid_sun_direct_indirect_v1` | previous profile plus receiver mapping and `direct_receiver` | AO/bent normal selected by AI 534 | Player-selectable only if AI 533 promotes direct baking |

`development.static_sun_v1` is the only capability profile with the AI 531
high-memory static-sun validation tier. The immutable package cap remains
512 MiB; its profile-scoped logical ceilings are 512 MiB steady CPU, 512 MiB
steady GPU, 1536 MiB peak CPU, and 1024 MiB peak GPU during atomic replacement.
The tier requires the transfer-owned production fetch path and does not alter
generic runtime defaults.

The production v4 exact-parity model uses a 0.04150390625 m source/cache pitch
(strict 1:1; the 65:64 candidate is rejected), rectangular [1870, 1821]
interiors, [1878, 1829] guarded RG8 layers, and 77 layers. Its 528,968,748-byte
payload is partitioned into eight 9-layer chunks plus one 5-layer chunk; the
modeled 529,189,392-byte package remains below the cap. These are logical
projections, not a measured full-city artifact or physical residency result.
Performance, load, decode, upload, and timing remain `not measured` for
promotion while other processes share the machine and GPU.

This development allowance does not satisfy the player-selectable gates below:
the modeled package exceeds the normal 256 MiB promoted disk target and needs
reduction or streaming before promotion, in addition to the missing bus
composition owned by AI 532.

Direct-only or indirect-only packages remain valid transport fixtures, but they cannot activate the final player-facing `baked` mode. A receiver mapping is required whenever a receiver channel is required. Unknown required channels reject the profile; absent optional channels do not change ownership of a term.

## Baking toolchain decision

The initial authoritative compiler target is fixed:

- Archive: `blender-5.2.1-windows-x64.zip`, official portable x64 release.
- Official archive SHA-256: `0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c`.
- Radiometric engine: Cycles CPU.
- EEVEE: preview/debug only; its outputs cannot be promoted.
- GPU Cycles: draft/experimental only until a separately signed backend/device/driver profile passes repeatability and reference tolerances.
- Static world-to-any-receiver sun visibility: deterministic orthographic light-space depth tiles. Cycles surface `SHADOW` bake is not this channel.
- Authoritative raw image intermediates: lossless linear/raw 32-bit OpenEXR unless the owning descendant proves an equally inspectable lossless representation.

The compiler signature must include archive filename and SHA-256; `bpy.app.version`, `version_string`, `version_cycle`, decoded `build_hash`, build date/time, build platform/type; render engine and Cycles device; CPU/thread policy; OS/architecture; enabled add-ons; project script/config hashes; OCIO/config identity; and every bake-affecting setting. The absolute installation path is diagnostic, not a freshness input.

Authoritative runs start from a clean scripted scene in background mode. Scripts reset state, import only declared inputs, establish stable object/material order, assign every setting, fix seeds, disable adaptive sampling/animated seeds/time limits, and explicitly declare denoising. Manual selection, UI clicks, startup files, user preferences, an open `.blend`, or an earlier session are never inputs. `.blend` files are disposable diagnostics.

Official decision basis:

- [Blender 5.2 LTS release and 5.2.1 patch](https://www.blender.org/releases/5-2/)
- [Official Blender 5.2 archive index and checksum manifest](https://download.blender.org/release/Blender5.2/)
- [Cycles render baking](https://docs.blender.org/manual/en/5.2/render/cycles/baking.html)
- [Render passes](https://docs.blender.org/manual/en/5.2/render/layers/passes.html)
- [EEVEE limitations](https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html)
- [Blender render-test methodology](https://developer.blender.org/docs/handbook/testing/render/)

The basis is substantive: Cycles exposes separate direct/indirect/AO-capable baking and light passes; Blender's own render tests use reference images and acknowledge CPU/GPU/platform differences; EEVEE is approximate, GPU-only, half-precision in much of its pipeline, and unsupported on headless Windows systems. “Ray traced” is not a separate Blender production engine choice here: Cycles is Blender's path-traced/ray-traced offline renderer.

Cycles texture baking is deliberately used only for receiver-mapped lighting channels such as direct irradiance, indirect irradiance, and AO. It does reduce geometric reuse if interpreted as a replacement for shared PBR textures, so it must not modify the reusable base-color/normal/roughness assets. Lighting textures belong to resolved receiver instances or deterministic city chunks, remain separate from material textures, and carry their own source/profile hashes. The static sun-depth channel is receiver-independent and therefore preserves the most reuse: the same cache can shadow roads, walls, roofs, markings, and the moving bus.

## Coordinate and data contract

### Units, axes, and handedness

- One world unit is exactly one metre in Three.js and one metre in Blender. Blender `scene.unit_settings.scale_length = 1.0`.
- Three.js/world is right-handed: `+X = map X`, `+Y = up`, and `+Z = map Y`; map tile Y increases in `+Z`. Existing documents disagree about which low/high-Z direction is called north, so manifests, hashes, and tests use numeric vectors and map coordinates rather than compass aliases.
- Blender is right-handed and Z-up. The canonical conversion is a +90 degree rotation about X:

```text
Blender.x =  Three.x
Blender.y = -Three.z
Blender.z =  Three.y

Three.x =  Blender.x
Three.y =  Blender.z
Three.z = -Blender.y
```

The conversion matrix for column vectors is:

```text
C = [ 1  0  0  0
      0  0 -1  0
      0  1  0  0
      0  0  0  1 ]
```

`det(C) = +1`; conversion preserves handedness and winding. The canonical world origin is the live resolved city origin/world zero, with map origin metadata included. Export must not silently recenter the city. A future chunk-local origin is allowed only with an explicit double-precision world origin and exact inverse mapping in the manifest.

### Transforms and topology

- Three.js column-vector `matrixWorld` after the complete resolved scene update is authoritative. World composition is parent-to-child as implemented by Three.js.
- Blender reconstruction uses `M_blender = C * M_three * inverse(C)`. Do not use Euler decomposition as the authoritative transfer.
- Positions use `C`; normals use the inverse-transpose of the full linear transform and are renormalized; tangent XYZ follows the normal-space conversion and tangent `w` retains the bitangent orientation for this determinant-positive basis change.
- Front-face winding is counter-clockwise viewed from the front. Negative-determinant object transforms must be baked into geometry or explicitly normalized with a corresponding winding/normal/tangent correction; they may not pass through ambiguously.
- Indices and material groups retain deterministic ordering. Degenerate/non-finite topology, duplicate stable IDs, unsupported skinning/deformation, or unresolved modifiers fail export rather than being guessed.
- Canonical IDs come from the resolved source inventory. Blender object names are diagnostic aliases and cannot be runtime keys.

### Numeric precision and quantization ownership

- Canonical geometry attributes preserve their declared runtime typed-array representation, normally IEEE-754 binary32; indices preserve their unsigned width.
- World transforms, light/profile scalars, origins, and bounds are canonicalized as finite IEEE-754 binary64 values before sorted deterministic serialization.
- NaN, infinity, negative zero ambiguity, locale-formatted decimals, and unordered object-key serialization are rejected/normalized by AI 528's canonical serializer.
- Blender/compiler raw lighting and depth intermediates remain 32-bit float until project canonicalization.
- AI 530 owns package-level compression and generic quantization. AI 531 owns depth encoding precision. AI 533 owns direct/indirect receiver encoding. No exporter, Blender script, or runtime loader may apply an undocumented second quantization.
- Every quantized channel declares decode scale/offset, sentinel values, valid range, error bound, row origin, and filter/mip behavior in its descriptor.

### UV and image orientation

- Logical UV origin is lower-left: `(0,0)` is lower-left and `+V` is up.
- Production raw image rows are canonicalized to lower-left-first before packaging. A container with another native row order must declare it; the packager performs the one allowed flip and records the result. Runtime `flipY` is derived from the descriptor, never guessed from file type.
- UV set identity, atlas transform, padding, dilation, wrap, and mip rules are explicit and hash-significant for receiver channels.
- Normal maps use MikkTSpace-compatible tangent space unless a channel explicitly declares world/object space.

### Alpha and material semantics

- Alpha is a linear coverage scalar, not sRGB color.
- An alpha-tested caster resolves coverage from the evaluated runtime material inputs: opacity, map/alpha-map channel, UV set and transform, wrap/filter, row orientation, alpha threshold, side, and shadow-side/custom-depth behavior.
- Opaque coverage is one. Blended/transmissive materials are not coerced to opaque or cutout; unsupported cases remain on `current` or fail the relevant channel validation.
- AI 528 records the evaluated runtime `castShadow`/`receiveShadow` and material behavior. It does not infer caster semantics from asset category or the color PVS.

### Color and ranges

- Base-color and emissive color textures decode from sRGB to Linear-sRGB. Normal, roughness, metalness, AO, alpha, depth, visibility, masks, and IDs are non-color data.
- Production lighting channels store scene-linear Linear-sRGB values with no AgX/ACES/Neutral transform, exposure, color grading, dither, bloom, flare, or display conversion.
- Direct/indirect channels are light-only so receiver base color remains a live PBR material property. Bounce-surface color remains an indirect-channel input because it changes transport.
- Radiometric/irradiance intermediates allow finite non-negative values above one. Visibility and AO are clamped to `[0,1]`. Depth is metres or a descriptor-defined monotonic encoding with explicit near/far; normals are signed normalized data.
- Negative lighting, NaN, infinity, silently clipped HDR, or tone-mapped production channels fail validation.

The current game has a fixed user-adjustable exposure rather than camera metering. A future adaptive-exposure feature belongs after scene-linear lighting composition and before display output, with explicit metering, adaptation, and reset state plus the fixed-exposure fallback. It never changes or invalidates a lighting bake; it changes only how the same scene-linear result is displayed.

## Render and shader extension ownership

AI 408's global pipeline owns pass order. Until that abstraction is completed, `GameEngine` and `PostProcessingPipeline` are the operational owners. Illumination descendants attach through one central integration layer; they must not create a second frame loop, wrap `renderer.render`/`shadowMap.render` independently, or duplicate the Lab Scene.

The architectural hook sequence is fixed:

1. `illumination.frame_begin`: commit one immutable mode/resource snapshot.
2. `illumination.shadow_prepare`: `current` prepares existing single/CSM maps; `baked` binds static depth and prepares only declared dynamic casters.
3. `illumination.visible_material_bind`: bind channel resources/profile data for the main visible pass.
4. `illumination.linear_scene_complete`: scene-linear physical lighting is complete; AO and declared linear composites may consume depth/normal here.
5. `illumination.pre_output`: color grade/tone map/output/post retain global-pipeline ownership.
6. `illumination.frame_end`: retire old snapshots and publish diagnostics/timing.

Static visibility PVS restoration, sun-bloom occlusion filtering, auxiliary cameras, reflection captures, debug views, and photo/edit modes must consult the committed snapshot without mutating its ownership. Unsupported cameras select complete `current` behavior.

All new GLSL lives under `src/graphics/shaders/` and is loaded through the Shader Loader contract. No new inline shader strings are allowed. Built-in `MeshStandardMaterial` integration must use one audited central adapter with:

- GLSL chunks loaded from files;
- an exact supported Three.js revision range;
- asserted insertion anchors and fail-closed tests when upstream chunks change;
- deterministic variant keys and bounded feature combinations;
- chaining through a registry rather than competing `onBeforeCompile` replacements;
- source paths and active channel defines visible in diagnostics.

The current static-AO string/chunk patch is compatibility debt, not a template for baked illumination.

## Deterministic validation case registry

The existing Lab Scene remains the only look-development shell. Automated illumination runs must ignore persisted Lab/user settings and apply a complete explicit snapshot for lighting, sun, shadow type/quality, AO, IBL, exposure, tone mapping, bloom/sun effects, color grade, AA, resolution, pixel ratio, camera, city revision, bus render pose, and random seed.

### Fixed Lab cases

| Case ID | Existing Lab camera/fixture | Required coverage | Sun/profile |
|---|---|---|---|
| `illum.lab.overview_default` | `overview` | roofs, streets, vertical facades, global balance | 45/35 default |
| `illum.lab.road_wall_default` | `near_road` | asphalt, curb, wall base, contact contrast | 45/35 default |
| `illum.lab.bus_grounding_default` | `bus_follow` | bus self-shadow and bus-ground/contact cue | 45/35 default |
| `illum.lab.corner_low_sun` | `corner_detail` | long shadow over road/curb and a vertical receiver | azimuth 135, elevation 8 |
| `illum.lab.foliage_alpha_backlight` | `crossing_bus_right_wide` plus standard trees | alpha-cutout silhouettes and transmitted gaps | azimuth 225, elevation 12 |
| `illum.lab.glass_reflection_control` | `building_glass` | prove direct visibility does not generically dim IBL/reflection/emissive | 45/35 default |
| `illum.lab.overhang_receiver_fixture` | deterministic AI 531 Lab scenario, not a new shell | road, wall, roof, and underside/overhang receivers in one view | 45/35 and 135/8 |
| `illum.lab.partial_bus_shadow_fixture` | deterministic AI 532 Lab scenario using interpolated bus `renderPose` | static shadow boundary moves across bus body; static cache remains fixed | 16 equally spaced bus poses, 45/35 |

The last two fixtures are required outputs of their named descendants because the current Lab does not guarantee those geometric relationships. Their IDs, coverage, and sampling count are fixed here; descendants may add geometry to the Lab scenario registry but may not build another test application.

### Gameplay route/pose cases

| Case ID | Fixed source | Required coverage |
|---|---|---|
| `illum.game.civic_curve_front` | named pose `civic_center_curve_front` in BigCity2 | bus/front material, intersection, facade and road shadow read |
| `illum.game.regional_open` | profiler cell `(12,3)`, world `(0, -216)`, height 3.6831812722 m, pitch -9.673 degrees, four cardinal view vectors | open/roof horizon and low opportunity |
| `illum.game.regional_center` | profiler cell `(12,14)`, world `(0, 48)`, same camera profile | intersection, mixed walls/roads/trees |
| `illum.game.regional_dense` | profiler cell `(7,21)`, world `(-120, 216)`, same camera profile | dense southern geometry and high shadow workload |
| `illum.game.low_sun_matrix` | the three fixed poses above | azimuths 45/135/225/315 at elevations 8 and 35 degrees |
| `illum.game.partial_bus_route` | AI 532 fixed 16-pose route promoted into the gameplay-pose/route registry | partial static shadow across the moving bus and transition into/out of shadow |
| `illum.game.dynamic_bus_shadow` | same route with static cache held constant | bus self-shadow and bus-to-road/facade shadow |

For regional cases, map coordinates are authoritative and world coordinates are recorded as a convenience for the current BigCity2 origin `(-288,-288)` and 24 m tiles. A map/source hash mismatch invalidates the case rather than silently moving it.

Each visual result includes final-color, shadow-only/static-visibility, dynamic-visibility, direct, indirect, AO, depth/tile-ID, and seam debug views when those channels exist. Dynamic cases take the bus transform from interpolated `renderPose`, never a stale fixed-step physics pose.

## AI 527 current-engine baseline

The reproducible raw runs and capture manifest are under `tests/artifacts/illumination_527/`; deterministic PNGs are under `tests/artifacts/screens/illumination_527/`. The tracked summary is `tests/benchmarks/ai527_current_illumination_baseline_2026-08-30.json`.

The baseline protocol is:

- production BigCity2 renderer at a 1280x696 drawing size and pixel ratio 1;
- 25 fixed 5x5 map regions, one road cell per region, four cardinal view vectors: 100 poses;
- camera height 3.6831812722 m, pitch -9.673 degrees, FOV 55 degrees;
- one complete warm-up frame at each pose, followed by two measured frames;
- GTAO every frame, retained-depth AO exclusion, production color PVS active, default current lighting/post settings, and default single/high shadows;
- `city.update()` plus a complete render ending in `gl.finish()`, so elapsed time is synchronized CPU plus GPU-complete time;
- calls/triangles are attributed by wrapping submissions for measurement only and reconcile to renderer totals;
- arithmetic mean across 200 measured frames; the tracked summary derives median, nearest-rank p90, and population standard deviation over the 100 two-frame pose means, while the raw report retains every pose mean;
- GPU-only and CPU-only pass time are `not measured` when WebGL timer queries do not provide a reliable split;
- whole-process/GPU residency is `not measured` because WebGL exposes no portable physical residency counter. Known render-target allocations are reported separately, never as total residency.

The primary fresh 2026-08-30 run completed on installed Chrome 151.0.7922.174 with WebGL2/D3D11 on the NVIDIA GeForce RTX 3060. A separate headless Chromium/SwiftShader run is retained as a reproducible software fallback, not as a promotion baseline. The same production path also has an AI 524 RTX 3060 reference; it is retained as historical corroboration rather than mislabeled as a fresh rerun.

| Current-path measurement | Fresh RTX 3060 run | SwiftShader fallback | AI 524 RTX 3060 reference |
|---|---:|---:|---:|
| Synchronized frame time / derived FPS | 9.461 ms / 105.70 | 30.519 ms / 32.77 | 9.224 ms / 108.41 |
| Whole-frame calls / triangles | 1,249.70 / 2,592,844 | 1,249.70 / 2,592,844 | 1,249.70 / 2,592,844 |
| Visible calls / triangles | 903.61 / 807,402 | 903.61 / 807,402 | not separately reported |
| Shadow calls / triangles | 289.13 / 1,591,191 | 289.13 / 1,591,191 | not separately reported |
| Static shadow calls / triangles | 270.37 / 1,566,749 | 270.37 / 1,566,749 | not separately reported |
| Dynamic bus shadow calls / triangles | 18.76 / 24,442 | 18.76 / 24,442 | not separately reported |
| AO-exclusion calls / triangles | 50.96 / 194,245 | 50.96 / 194,245 | 50.96 / 194,245 |

The fresh hardware pose-mean distribution is 6.650 ms median, 21.500 ms nearest-rank p90, 7.851 ms population standard deviation, 1.900 ms minimum, and 40.450 ms maximum. The SwiftShader pose-mean distribution is 20.775 ms median, 71.950 ms nearest-rank p90, 26.739 ms population standard deviation, 2.700 ms minimum, and 145.850 ms maximum. Spatially different poses and browser scheduling create a wide distribution; exact workload counters are the durable decomposition. The AI 524 reference used the same size/settings/poses with two complete runs (400 measured frames); its reported value is the mean of the two synchronized run means. CPU-only time, GPU-only time, physical GPU residency, and bandwidth were not measured for the reasons recorded in the tracked summary. The values are a before-state only; AI 527 ships no optimization and therefore has no after-state.

## Budgets and promotion gates

Budgets apply per city and named lighting profile on the reference desktop tier unless a stricter platform profile is declared. The initial reference tier is Windows x64, installed Chrome 151, WebGL2/D3D11, NVIDIA GeForce RTX 3060, 1280x696, and pixel ratio 1. AI 536 must refresh both current and candidate on the same browser/driver/session before evaluating performance; this baseline anchors workload and expected order, not a perpetual absolute threshold. All timings require the same-condition method above or a documented successor with hardware, browser, resolution, warm-up, samples, statistic, variance, and synchronization.

| Area | Promotion target | Hard rejection/required action |
|---|---|---|
| Package disk size | <=256 MiB compressed per city/profile for all promoted channels; <=32 MiB critical startup set | >512 MiB or an unstreamable >64 MiB critical set requires redesign or explicit non-default tier |
| Network transfer | <=64 MiB before first compatible baked activation; remaining chunks stream after current gameplay is available | Baked assets that block startup, or >256 MiB mandatory first activation, fail |
| Decode/validation | <=500 ms worker wall time total; <=8 ms p95 main-thread task | Any unbounded main-thread decode or >16 ms main-thread task fails |
| GPU upload | <=250 ms staged wall time and <=4 ms submitted in any gameplay frame | A visible mixed state, allocation hitch >16.7 ms, or partial activation fails |
| GPU allocated-resource budget | <=256 MiB steady additional baked texture/buffer bytes; <=384 MiB peak during atomic swap, derived from declared dimensions/formats/mips/layers and reconciled with resource counters | >384 MiB steady or >512 MiB peak requires channel/resolution/streaming reduction; physical residency remains `not measured` when the browser exposes no counter |
| Shader cost | <=1.0 ms mean and <=1.5 ms p90 added sampling/composition cost at 1280x696 after prewarm | Compile hitch at commit, per-chunk variants, or >2 ms mean added cost fails |
| Full bake duration | Static depth <=30 min; direct <=4 h; indirect <=12 h; AO <=4 h; complete profile <=24 h on the recorded compiler host | Longer jobs stay experimental until reduced or explicitly approved as an offline high tier |
| Static shadow work | 100% of static casters absent from the normal per-frame shadow submission in baked mode; >=90% reduction in static shadow calls and triangles | Any missing static shadow receiver/caster, or static geometry still routinely rerendered, fails |
| Whole-frame performance | >=2.0 ms and >=10% median synchronized frame-time win in the representative route aggregate, without a p90 regression | Call/triangle savings without a statistically credible net frame win do not promote |
| Current compatibility | Pixel-identical current-mode captures and unchanged settings/options behavior | Any current-mode image, boot, city, or control regression fails |
| Static visibility correctness | Zero observed false-lit/missing-occluder pixels in binary shadow truth after conservative tolerance; final-color mean RGB error <=0.35/255, >4/255 pixels <=0.2%, isolated max <=64/255 | Any missing occluder, temporal pop, or systematic receiver omission fails |
| Direct/indirect reference | Against a separately rendered high-sample Cycles CPU reference: linear relative RMSE <=2%, 99th-percentile absolute error <=0.03 of reference white | NaN/negative/clipped HDR, energy double count, or error over either threshold fails |
| Tile/atlas seams | Zero false-lit seams; border debug delta <= one encoded depth unit for depth, <=1% reference-white radiance for lightmaps, and no >1-pixel continuous line over 2/255 in final color | Any visible stable or motion-exposed seam fails |
| Mode switch | Once staged, one frame-boundary commit, <=2 ms controller CPU work, no mixed frame; current restored within one frame on failure | Page reload, restart, multi-frame partial ownership, leak, or stale sampling fails |

The final AI 536 promotion decision includes disk, download, decode, upload, steady/peak CPU and GPU memory, shader/program count, lookup cost, static and dynamic shadow work, complete frame time, FPS, bake duration, corruption/fallback behavior, visual error, and switch loops in one report. Projections are labeled and cannot satisfy a gate.

## Descendant dependency and output contract

| AI | Consumes | Exclusive output | Must not own/reopen |
|---|---|---|---|
| 528 resolved city export/hash | This coordinate/data contract, canonical/derived rules, channel sensitivity | Canonical resolved source schema, stable ID/provenance inventory, evaluated material/alpha/caster semantics, deterministic source/profile hashes, round-trip validator | Blender engine selection, runtime binary loader, lighting composition |
| 529 Blender compiler | 527 toolchain + 528 validated export | Exact archive/build signature, clean scripted reconstruction, Cycles CPU proof bakes, repeatability report, raw channel intermediates | Runtime package/loader, EEVEE promotion, manual `.blend` authority |
| 530 package/loader/controller | Validated source/compiler/channel records | Versioned manifest/binary chunks, integrity validation, async staging, lifecycle controller implementing requested/effective modes programmatically | User Options UI, channel shading algorithms, partial unsafe activation |
| 531 static sun depth | Static-depth descriptor, 528 source, 529/530 compiler/package | Tiled depth generation, alpha silhouettes, sampling/filter/bias/streaming, static receiver integration and debug views | Color PVS reuse, bus dynamic caster ownership, final-color decal |
| 532 bus shadows | 531 static depth and controller hooks | Static-world visibility on bus fragments plus bus-only dynamic self/world shadow layer using render pose | Static city rerender, baked receiver lightmaps, overlapping AI 498 bus-map implementation |
| 533 direct/indirect | Receiver/source mappings and stable shadow composition | Separate light-only direct and indirect channels, atlas/chunk integration, measured promote/defer decisions | Shared base PBR texture mutation, AO policy, tone mapping in bake |
| 534 AO migration | All prior lighting/shadow channels and current AO evidence | Per-mode AO/contact policy, overlap measurements, AI 323/524/525 migration decision | Unmeasured AO removal or hidden double-darkening |
| 535 runtime Options/diagnostics | Complete programmatic controller and channel states | Persisted Current/Baked/Auto UI, transactional Save/Cancel/Reset, availability/fallback diagnostics | Loader internals or making baked assets mandatory |
| 536 release validation | 527 cases/budgets plus all implementation outputs | End-to-end truth/performance/corruption/absence/switch/rollback report and default-promotion decision | Relaxing gates without an explicit spec revision and evidence |

AI 528 may begin when AI 527 is DONE because every architectural input it needs is fixed here. Later AIs remain gated by the ordered DONE chain from AI 526.
