# Illumination Binary Package and Runtime Loader

## Status and authority

This is the AI 530 authority for transport, byte integrity, compatibility validation, asynchronous staging, atomic activation, mode control, disposal, and diagnostics. It consumes only a strictly validated AI 529 intermediate manifest and canonical decoded channel bytes. It does not define channel shading, static-sun lookup, bus shadow composition, receiver-light composition, AO policy, or Options UI.

The current renderer remains the permanent fallback. No package, Blender installation, generated directory, network request, or runtime extension is required to boot or render in `current` mode.

## V1 artifact set

A release contains:

- `package.ilpkg`: the authoritative embedded-manifest binary;
- `manifest.json`: an exact canonical JSON copy of the embedded manifest for discovery and early identity checks;
- `validation_report.json`: the pack/verify receipt, including the final file SHA-256 and measured byte/timing values.

Only `package.ilpkg` is trusted for activation. A sidecar may reject a candidate before the larger fetch, but the runtime still validates the embedded copy and all bytes. V1 artifacts are content-addressed by aggregate SHA-256 and are immutable.

## Binary layout

All integers are unsigned little-endian. All offsets are from byte zero unless a chunk field explicitly says `payloadRelativeOffset`. V1 uses `uint32` offsets because it rejects files above 512 MiB, far below the 4 GiB representation limit.

```text
fixed header (208 bytes)
canonical UTF-8 manifest
zero padding to 16-byte boundary
canonical UTF-8 chunk table
zero padding to 16-byte boundary
payload chunks in canonical chunk-ID order, each 16-byte aligned
zero padding between and after chunks as declared
```

Every padding byte is zero and hash-significant. A parser rejects implicit gaps, non-zero padding, overlap, wraparound, misalignment, out-of-bounds ranges, trailing data, and a declared length that differs from the exact file length.

### Fixed header

| Offset | Size | Field | V1 rule |
|---:|---:|---|---|
| 0 | 8 | magic | ASCII `ILPKG001` |
| 8 | 2 | major | `1` |
| 10 | 2 | minor | `0` |
| 12 | 4 | endian marker | `0x01020304` |
| 16 | 4 | header length | `208` |
| 20 | 4 | manifest offset | exactly `208` |
| 24 | 4 | manifest length | exact canonical UTF-8 bytes |
| 28 | 4 | chunk-table offset | aligned first byte after manifest padding |
| 32 | 4 | chunk-table length | exact canonical UTF-8 bytes |
| 36 | 4 | payload offset | aligned first byte after table padding |
| 40 | 4 | payload length | chunks plus declared zero padding |
| 44 | 4 | file length | exact artifact byte length |
| 48 | 4 | alignment | `16` |
| 52 | 4 | flags | `0`; unknown flags reject |
| 56 | 4 | chunk count | exact table count |
| 60 | 4 | capability-profile count | exact manifest count |
| 64 | 4 | channel count | exact manifest count |
| 68 | 4 | reserved | zero |
| 72 | 32 | manifest SHA-256 | raw SHA-256 of embedded manifest bytes |
| 104 | 32 | table SHA-256 | raw SHA-256 of embedded table bytes |
| 136 | 32 | payload SHA-256 | raw SHA-256 of all payload and payload padding bytes |
| 168 | 32 | aggregate SHA-256 | raw SHA-256 of the complete artifact with bytes 168–199 zeroed |
| 200 | 8 | reserved | zero |

The promotion receipt additionally records the ordinary final-file SHA-256. It is intentionally outside the file because a file cannot embed its own ordinary hash without a special convention.

## Manifest contract

The embedded manifest uses strict canonical JSON: UTF-8, sorted object keys, dense arrays, no insignificant whitespace, finite numbers only, and no host path, timestamp, or machine-local authority. Its schema is `bus-sim-illumination-package-manifest-v1` with semantic version `1`.

It contains, as independent records:

- city ID, lighting-profile ID, and selected capability-profile ID; the header aggregate SHA-256 is the immutable package identity;
- a capability-profile table with required channels, optional channels, required runtime capabilities, exposure status, and schema version;
- a channel table with channel ID, required/optional status, source-freshness SHA-256, profile SHA-256, compiler-signature SHA-256, ordered chunk IDs, and channel-output-integrity SHA-256;
- source provenance containing AI 528 resolved-source, geometry, used-material, input-package, and per-channel source hashes;
- compiler provenance containing the exact AI 529 Blender/archive/executable/build/backend/thread/config signature and the AI 530 packaging-policy signature;
- transport declarations for byte order, alignment, SHA-256, zero padding, independent compression, and explicit offline mips.

Coordinate metadata is explicit per chunk in `coordinateTransform`, alongside row origin and logical dimensions. V1 does not invent a second global coordinate-contract identifier that is absent from the AI 529 source descriptor.

Freshness and integrity answer different questions and never substitute for each other:

| Identity | Question | Failure class |
|---|---|---|
| resolved/per-channel source hash | Was this produced from the active resolved city and channel inputs? | `stale` / `source_mismatch` |
| lighting/channel profile hash | Was this produced for the requested lighting and capability semantics? | `stale` / `profile_mismatch` |
| compiler signature | Was this produced by the declared Blender, scripts, config, and deterministic packaging policy? | `stale` / `compiler_mismatch` |
| chunk/section/aggregate hash | Are these exact artifact bytes intact? | `failed` / `integrity_failure` |

The compiler-signature descriptor is canonicalized and hashed independently. Quantization, byte order, compression choice and parameters, mip policy, row origin, unpack alignment, and padding policy are part of that descriptor.

## Chunk table

The separate canonical table schema is `bus-sim-illumination-chunk-table-v1`. Each entry declares:

- stable chunk ID and owning channel ID;
- resource kind without any game asset name or shading algorithm;
- payload-relative offset, stored length, decoded length, alignment, compression, and both stored and decoded SHA-256;
- encoding, component precision, logical dimensions, row origin, mip level, and explicit coordinate metadata;
- the exact runtime capabilities needed to decode or upload that representation.

Chunks are strictly sorted by ID. V1 stores them in the same order, aligned to 16 bytes, with `compression = none`, so stored and decoded bytes/hashes are equal. The distinction remains mandatory so a later version can add bounded independent decompression without changing integrity semantics. V1 accepts only `mipLevel = 0`; later versions may define separately hashed explicit mip chunks. Runtime mip generation is forbidden.

Channel-output integrity is SHA-256 over the canonical ordered inventory of that channel's chunk IDs, decoded lengths, and decoded hashes. It is independent of physical packing and of the whole-artifact aggregate.

## Channel and capability policy

The known V1 transport channels are:

- `static_sun_depth`;
- `direct_receiver`;
- `indirect_irradiance`;
- `static_ao_bent_normal`;
- `receiver_mapping`.

The container is generic and may carry future channels. An unknown channel required by the selected capability profile always rejects activation. An unknown optional channel may be skipped only when its versioned policy is exactly `skip_unknown_optional_v1`; its bytes still participate in package integrity.

AI 527's activation profiles are represented exactly:

| Capability profile | Required channels | Required runtime capability | Exposure |
|---|---|---|---|
| `development.static_sun_v1` | `static_sun_depth` | compatible static-receiver sampling | internal validation only |
| `baked.hybrid_sun_v1` | `static_sun_depth` | bus sampling plus dynamic bus shadow layer | player selectable after AI 532 |
| `baked.hybrid_sun_indirect_v1` | prior data plus `receiver_mapping`, `indirect_irradiance` | compatible indirect receiver sampling | after channel validation |
| `baked.hybrid_sun_direct_indirect_v1` | prior data plus `direct_receiver` | compatible direct receiver sampling | after AI 533 promotion |

`transport.fixture_v1` is an internal transport-only test profile. It proves independent optional channels but cannot imply player-visible baked ownership.

## Encoding and compression decision

AI 529's OpenEXR files are evidence, not runtime bytes. The package tool revalidates the intermediate manifest and rehashes both EXR and canonical outputs, then packages only canonical decoded/explicitly quantized data.

V1's correctness fallback is uncompressed `rgba32f_le`, lower-left row origin, base mip only, `flipY = false`, `generateMipmaps = false`, and unpack alignment 1. This preserves AI 529 float32 values exactly and is sampled with nearest filtering unless a later channel owner proves a filterable representation. V1 also recognizes descriptors for raw bytes, `r8_unorm`, `rgba16f_le`, and `uint32_le`, but no channel is silently converted. AI 531 owns static-depth precision; AI 533 owns irradiance precision and compression. Their promotion requires the AI 527 error gates.

WebGL2 has core sized `R8`/`RG8`/`RGBA8` and 16-bit floating texture paths, while linear filtering of 32-bit floating textures requires `OES_texture_float_linear`; rendering into floating textures is a separate `EXT_color_buffer_float` concern. There is no single universal GPU block-compressed bitstream: WebGL2's required compressed-format rule permits ETC/EAC or the S3TC+sRGB+RGTC suite, while ASTC and BPTC remain optional. KTX2/Basis transcoding is therefore a possible future measured variant, not a hidden V1 dependency. Authoritative references:

- [WebGL 2.0 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
- [OES_texture_float_linear](https://registry.khronos.org/webgl/extensions/OES_texture_float_linear/)
- [EXT_color_buffer_float](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/)
- [WEBGL_compressed_texture_etc](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_etc/)
- [EXT_texture_compression_bptc](https://registry.khronos.org/webgl/extensions/EXT_texture_compression_bptc/)
- [WEBGL_compressed_texture_astc](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_astc/)
- [KTX 2.0 specification](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html)
- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)
- [Three.js DataTexture](https://threejs.org/docs/pages/DataTexture.html)

Transport compression and GPU encoding are independent. V1's required/default transport compression is `none`. HTTP content encoding may reduce transfer but never changes package identity after decoding. A future per-chunk deflate variant must be deterministic and compiler-signed, feature-detect worker decompression, cap output before allocation, and verify decoded length and SHA-256. Generic lossy compression is forbidden for depth, IDs, and mappings.

The final same-session survey used Headless Chrome 151 through ANGLE on an NVIDIA RTX 3060, one warmup and 20 measured 32×32 upload/finish/dispose cycles. These synthetic upload results compare transport-compatible representations only; they do not approve their precision for a channel:

| Encoding | Bytes | Mean upload |
|---|---:|---:|
| `rgba32f_le` | 16,384 | 0.310 ms |
| `rgba16f_le` | 8,192 | 0.230 ms |
| `r8_unorm` | 1,024 | 0.155 ms |

The measured context exposed float-linear, color-buffer-float, BPTC, and S3TC, but not ETC or ASTC. Compressed encoded sizes and upload costs are `not measured`: AI 530 has no deterministic compiler-signed semantic encoder, and AI 531/AI 533 own precision promotion. The complete canonical evidence is [`runtime_profile.json`](../../tests/artifacts/illumination_530/reports/runtime_profile.json). Exact uncompressed RGBA32F therefore remains the V1 correctness default rather than treating one workstation's optional extensions as universal.

## Validation order

Before exposing decoded data, the parser:

1. validates magic, version, endian marker, fixed header, flags, reserved bytes, exact file length, and defensive maxima;
2. validates section order, non-overlap, bounds, 16-byte alignment, and zero padding;
3. verifies manifest, table, payload, and aggregate SHA-256;
4. decodes canonical JSON and validates exact schemas, counts, stable IDs, and references;
5. validates channel/profile inventory and unknown-channel policy;
6. validates every chunk range, stored length/hash, compression, decoded length/hash, dimensions, format-derived byte count, and capability declaration;
7. recomputes every channel-output integrity hash, compiler signature, and the aggregate package identity;
8. compares city, lighting profile, selected capability profile, source freshness, and compiler expectations;
9. checks runtime capabilities and declared CPU/GPU memory before allocation or upload.

Malformed untrusted fields never become allocation sizes until bounds and safe-integer checks pass.

## Defensive limits and framework budgets

V1 rejects more than 512 MiB total, a chunk above 64 MiB, unsafe integer arithmetic, or a resource above the device's dimensions/layers. The browser runtime defaults to the framework's stricter 64 MiB preactivation response target. Its stream reader checks declared and observed length under a per-load cap, never accumulates an unbounded chunk list, validates an exact `Content-Length` when one is present, and fails closed when the fetch implementation cannot expose a bounded reader; it never falls back to an unbounded `arrayBuffer()`. Callers may tune the file cap but never raise it above the format ceiling. The runtime also defaults to 256 MiB steady and 384 MiB peak logical CPU limits: before it copies or parses fetched bytes, it reserves a conservative three-copy trust-boundary envelope plus every other in-flight generation and every active, staged, retiring, or safety-retained set. After parsing, each generation reserves its exact verified package plus sanitized plan peak until all partial allocations unwind, so supersession cannot bypass the shared CPU/GPU swap cap. Oversized backing buffers are counted, not merely their exposed view. The parser rejects an over-ceiling input before copying, snapshots a valid mutable input exactly once before its first asynchronous hash, verifies against that owned snapshot, exposes chunk views over it, and zeroes only the 32-byte aggregate field in place while hashing rather than cloning the full file. The implementation also bounds manifest/table bytes, profile/channel/chunk counts, total decoded CPU bytes, and declared GPU bytes.

Promotion targets remain those in the framework: at most 256 MiB package and GPU steady allocation, 32 MiB critical startup, 64 MiB fetched before first activation, 384 MiB GPU peak during swap, 500 ms worker validation/decode, 250 ms staged upload, at most 4 ms upload submitted in a gameplay frame, and a frame-boundary commit below 2 ms. Exceeding a hard device limit is `unsupported_capability`; exceeding a package contract limit is validation failure.

## Runtime capability checks

Before resource creation, the graphics loader checks the package's declared requirements against the injected runtime capability inventory. The WebGL probe records WebGL2, maximum 2D/array dimensions and layers, combined/fragment texture-unit budgets, fragment highp precision, exact available extensions, supported internal/compressed formats, and float-linear/color-buffer-float support. Its plan preflight rejects unsupported encodings, dimensions, or layer counts before chunk decode or GPU allocation. `EXT_color_buffer_float` is required only for a chunk used as a render target, not merely sampled.

Every resource follows fetch/read, hash, decode, CPU stage, GPU/resource creation, and set-level prewarm. All required resources remain inactive until the complete immutable set reaches `ready_to_commit`.

## Lifecycle and mode controller

The public requested modes are `current`, `baked`, and `auto`. Effective mode remains `current` until a complete compatible set is committed at frame begin.

Any configured `baked` or `auto` request must supply the live city ID, lighting-profile ID, selected capability-profile ID, and resolved-source SHA-256, either at runtime construction or on that load. Missing identity is quiet `unavailable/not_configured` and causes no fetch. Optional profile, compiler, and aggregate expectations can tighten the gate further. This prevents an internally valid package for another live city/source from activating merely because its own hashes are self-consistent.

The only public states are `unavailable`, `loading`, `active`, `stale`, `failed`, and `fallback`. Detail is expressed through `phase`, `reason`, `causeState`, and capability/error codes. Phases are `locating`, `fetching`, `validating`, `decoding`, `uploading`, `prewarming`, `ready_to_commit`, `committed`, `retiring`, and `disposed`.

- no configured URL/package is quiet `unavailable` with `reason = not_configured`;
- wrong source is `stale/source_mismatch`;
- wrong profile is `stale/profile_mismatch`;
- an unsupported representation is `unavailable/unsupported_capability` with a capability code; a verified but unknown resource/encoding pair uses the deterministic first lexicographic `resource_format:<resourceType>:<encoding>` code while the compatibility result retains every sorted channel/chunk/format tuple;
- byte corruption is `failed/integrity_failure` with a section/chunk code;
- cancellation/supersession is `fallback/cancelled` or `fallback/superseded` when a status is published;
- a failed `baked` or `auto` request resolves to `fallback/current_engine` while preserving `causeState` and its exact reason.

`current` cancels pending baked work and never fetches or samples baked data. `baked` and `auto` may start a load, but both render current until the staged set is complete. Mode changes, failure, staleness, teardown, and context loss schedule a complete snapshot change at the next frame boundary. No frame mixes ownership.

Superseded and retired resources remain alive until the controller's retirement boundary says submitted frames can no longer reference them, then dispose exactly once. If that safety wait fails, the controller records a stable retirement error and strongly retains the possibly in-use set; it never guesses that disposal is safe. Cancellation, repeated activation/deactivation, city teardown, and load thrashing share the same idempotent disposal path. A replacement preflight includes all currently live resource sets in its CPU/GPU baseline, and supersession remains distinct from ordinary cancellation. The controller never mutates persisted shadow, AO, IBL, exposure, or other current-engine settings.

## Diagnostics and instrumentation

Diagnostics are immutable snapshots and do not log per frame. They expose requested/effective mode, state, phase, reason, cause state, precise failure/capability code and retry trigger, candidate package/city/profile IDs, source/compiler/integrity hashes, selected/skipped channels, generation, cancellation/disposition, resident resource counts, logical CPU/GPU bytes, and timing samples for:

- fetch/read;
- hash/integrity;
- decode;
- CPU staging;
- GPU/resource upload;
- prewarm;
- frame-boundary activation;
- retirement/disposal.

Verified package/chunk backing bytes are released as soon as staging finishes. Logical peak CPU includes the bounded fetch/parser trust-boundary envelope, the verified package backing, staged chunk/decode copies, configured baseline, and every live set during replacement; logical peak GPU likewise includes the live replacement baseline. Little-endian WebGL uploads reuse the decoded backing store instead of creating another conversion copy. Physical browser-process and GPU residency are `not measured` because WebGL2 exposes no portable authoritative counters; logical allocation is never mislabeled as physical residency.

## Tooling, paths, and cache policy

`tools/illumination_package/run.mjs` provides `pack`, `inspect`, `verify`, and `promote`. `pack` requires an AI 529 canonical `intermediate_manifest.json`, validates and packages the exact same read of every declared intermediate byte, and emits a staged container, sidecar, and report. `verify` never trusts the sidecar. `promote` re-verifies the staged package and atomically renames it into a previously absent content-addressed release directory. A failed/partial stage never replaces a valid release. `tools/illumination_package/profile.mjs` produces the canonical same-condition runtime and WebGL format survey without downloading a browser.

Generated packages and reports live under `tests/artifacts/illumination_530/` during development and are gitignored. Production payload binaries are generated/distributed artifacts, not tracked source. A deployment may publish a small mutable `current.json` catalog with `Cache-Control: no-cache` and ETag; it points to an immutable URL containing the aggregate/final SHA-256, served with a long immutable cache policy. Bytes at a content-addressed URL are never overwritten. Browser cache state is never accepted as integrity proof.

## Deterministic fixture matrix

The Node fixture builder produces small containers for valid, missing optional channel, wrong city, wrong profile, stale source, unknown version, bad offsets, truncated bytes, swapped equal-size chunk payloads, chunk checksum failure, unsupported encoding/capability, cancellation, and repeated activate/deactivate cycles. Corruption fixtures reseal only the outer layers needed to reach the intended validation branch; no fixture is accepted accidentally because an earlier unrelated hash fails.

## Descendant boundary

AI 531 may define and sample `static_sun_depth`; AI 532 may add bus sampling and dynamic shadow composition; AI 533 may define receiver mappings/direct/indirect representations; AI 534 owns AO overlap policy; AI 535 owns persisted Options UI. Those steps consume the immutable committed resource snapshot. They do not bypass package validation, invent primary lifecycle states, or mutate current-mode settings.
