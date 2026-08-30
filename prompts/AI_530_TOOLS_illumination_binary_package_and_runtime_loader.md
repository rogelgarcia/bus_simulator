# Problem

Raw Blender outputs are not safe runtime assets. The game needs a compact, versioned, independently verifiable binary format with explicit channel metadata, source freshness, compiler provenance, integrity hashes, asynchronous loading, capability checks, atomic activation, and disposal.

Baked illumination is optional. The normal game must boot and render through the current engine when no illumination payload exists, when a payload is incompatible, or when the browser cannot support the selected representation.

# Request

Implement the generic illumination binary packager, manifest contract, validator, and optional runtime loader foundation. This step owns transport and lifecycle only; it must not decide sun-cache filtering, bus shadowing, lightmap composition, AO policy, or Options UI.

## Execution gate

- Do not start until AI 527, AI 528, and AI 529 are DONE.
- Consume only validated AI 529 intermediates and the channel/profile contracts defined by AI 527.
- Keep source-freshness hashes, compiler signatures, and output-integrity hashes as separate concepts.

Tasks:
- Define and document a versioned binary container and compact sidecar/embedded manifest suitable for browser loading. Include magic, endian marker, schema/version, header length, profile/channel table, chunk table, offsets, lengths, encoding/precision, dimensions, coordinate transforms, source hashes, compiler signature, and per-chunk plus aggregate integrity hashes.
- Use SHA-256 for artifact integrity. Validate exact byte lengths, non-overlap, bounds, alignment, channel inventory, and aggregate identity before exposing decoded data.
- Define independent optional channels for static sun depth/visibility, direct illumination, indirect irradiance, AO/bent normals, receiver mappings, and future extensions. Unknown required channels must reject activation; unknown explicitly optional channels may be skipped only by versioned policy.
- Package canonical decoded/quantized data rather than trusting nondeterministic EXR container bytes. Make quantization, byte ordering, compression, mip generation, and padding deterministic and compiler-signed.
- Research and measure browser/WebGL2-compatible compression and texture formats before selecting defaults. Preserve a correct uncompressed/fallback fixture path and do not assume every device supports the same compressed or floating-point texture features.
- Add a pack/inspect/verify/promote command under a dedicated tool folder or the appropriate AI 529 tool boundary, with README and `PROJECT_TOOLS.md` registration.
- Stage outputs atomically and promote only after input, payload, and validation reports pass. Never overwrite the last valid production artifact with a failed/partial run.
- Create a runtime loader in the correct app/graphics layers that:
  - treats no configured payload as a normal `unavailable` state;
  - loads asynchronously and supports cancellation/teardown;
  - validates city/profile/schema/source identity before expensive upload;
  - validates every chunk and aggregate hash before activation;
  - checks runtime texture/precision/memory capabilities;
  - decodes and uploads into a staged inactive resource set;
  - activates only when all required resources for the requested capability are complete;
  - disposes rejected, superseded, cancelled, and deactivated resources without leaks.
- Define lifecycle states and structured reasons: unavailable, loading, ready, active, stale-source, incompatible-profile, unsupported-capability, corrupt, cancelled, failed, and current-engine fallback.
- Add a programmatic mode controller contract for `current`, `baked`, and `auto`, but do not add the Options UI yet:
  - `current` never requests or samples baked assets;
  - `baked` activates only a complete compatible payload and otherwise remains on current with a specific reason;
  - `auto` uses baked when ready/compatible and current otherwise;
  - transitions occur atomically at a frame boundary and never show a mixed partial state.
- Preserve the existing engine as the always-available fallback. Do not mutate its persisted shadow/AO/lighting settings merely because a baked payload loads or unloads.
- Make missing assets quiet by default and expose inspectable diagnostics without repeating console/HUD spam every frame.
- Create small deterministic fixture containers for valid, missing optional channel, wrong city, wrong profile, stale source, unknown version, bad offsets, truncated data, swapped chunks, checksum failure, unsupported format, cancellation, and repeated activate/deactivate cases.
- Add timing and memory instrumentation for fetch/read, hash, decode, CPU staging, GPU upload, activation, disposal, and resident resources.
- Document asset paths, caching policy, browser cache invalidation, maximum sizes, and whether production payloads are tracked, generated, or distributed separately.

Acceptance requirements:
- The current engine works with zero bake files and no Blender installation.
- No baked resource affects rendering before complete validation and atomic activation.
- Any corrupt, stale, missing, unsupported, or cancelled payload leaves current lighting active and reports one precise lifecycle reason.
- Repeated loading, runtime mode switching through the programmatic API, city teardown, and state transitions do not leak CPU/GPU resources.
- The generic loader does not contain asset names or channel-specific shading algorithms.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_530_TOOLS_illumination_binary_package_and_runtime_loader_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the format specification, pack/inspect/promote tools, loader API, fixtures, tests, and lifecycle diagnostics.
- Include a same-condition package/load table with raw/packed/compressed sizes, compression ratio, hash/decode/upload/activation/disposal times, peak CPU and GPU memory, browser/hardware, sample count, and statistic. Mark unavailable metrics as `not measured` with a reason.
