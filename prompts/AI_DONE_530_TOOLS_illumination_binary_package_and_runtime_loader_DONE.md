# DONE — AI 530: Illumination Binary Package and Runtime Loader

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
- Define independent optional transport channels for static sun depth/visibility, direct illumination, indirect irradiance, AO/bent normals, receiver mappings, and future extensions. Enforce AI 527's named capability-profile minimum channel sets at activation. Unknown required channels must reject activation; unknown explicitly optional channels may be skipped only by versioned policy.
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
- Implement AI 527's six public states (`unavailable`, `loading`, `active`, `stale`, `failed`, and `fallback`) plus its structured phase/reason mapping. Labels such as ready, stale-source, incompatible-profile, unsupported-capability, corrupt, cancelled, and current-engine fallback are the specified phase/reason combinations, not additional competing primary states.
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

## Completion summary

Implemented the deterministic `ILPKG001` V1 container, strict embedded manifest and chunk-table validators, exact SHA-256 hierarchy, AI 529 canonical-input adapter, content-addressed atomic publication, package CLI, bounded browser fetch, generic staged loader, real WebGL2 resource factory and capability probe, six-state lifecycle, three-mode controller, frame-boundary activation, safe retirement, and immutable diagnostics. The final runtime also owns mutable package bytes before asynchronous verification, bounds its pre-parse working set, counts every live set during replacement, preserves supersession diagnostics, refuses to dispose after a failed GPU-safety fence, and cleans up malformed post-allocation results. `current` mode fetches nothing and has no bake-file or Blender dependency.

- Contract: [binary package and runtime specification](../specs/graphics/illumination_binary_package.md)
- Tools: [README](../tools/illumination_package/README.md), [pack/inspect/verify/promote CLI](../tools/illumination_package/run.mjs), and [Chromium/WebGL profiler](../tools/illumination_package/profile.mjs)
- Package API: [public exports](../src/app/illumination/package/index.js), [container implementation](../src/app/illumination/package/IlluminationBinaryPackage.js), and [capability profiles](../src/app/illumination/package/IlluminationCapabilityProfiles.js)
- Runtime API: [facade](../src/graphics/illumination/runtime/IlluminationRuntime.js), [staged loader](../src/graphics/illumination/runtime/IlluminationResourceLoader.js), [WebGL2 probe/factory](../src/graphics/illumination/runtime/WebGl2IlluminationResources.js), and [mode controller](../src/app/illumination/runtime/IlluminationModeController.js)
- Diagnostics: [resource timing/memory diagnostics](../src/graphics/illumination/runtime/RuntimeDiagnostics.js) and [fixed lifecycle vocabulary](../src/app/illumination/runtime/IlluminationLifecycleCatalog.js)
- Fixtures/tests: [package fixture builder](../tests/node/unit/illumination_package/package_fixture.js), [package/CLI cases](../tests/node/unit/illumination_package/), and [runtime/WebGL cases](../tests/node/unit/illumination_runtime/)
- Evidence: [real AI 529-derived package](../tests/artifacts/illumination_530/packages_final/bigcity2/ai529.proof.cycles_cpu.threads_1.v1/development.static_sun_v1/releases/29737a08820dad176b4b3903e768ef39dd0cf38c45c41e123457e75e70c7c29c/package.ilpkg) and [canonical runtime/format profile](../tests/artifacts/illumination_530/reports/runtime_profile.json)

The real package has aggregate identity `29737a08820dad176b4b3903e768ef39dd0cf38c45c41e123457e75e70c7c29c`; pack, inspect, expectation-aware verify, and independent promotion all passed. The row below uses the same immutable package and runtime for every sample, with HTTP caching disabled and one unreported warmup.

| Condition | Raw AI 529 EXR | Packed file | Stored/compressed payload | Ratio | Fetch/read | Hash/validate | Decode | CPU stage | GPU upload | Activation | Disposal | Peak logical CPU / GPU | Browser / hardware | Samples / statistic |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| AI 529 proof, `development.static_sun_v1`, load → commit → deactivate → safe dispose | 28,879 B | 75,584 B | 65,536 B (`none`) | 1.000 | 0.945 ms | 0.660 ms | 0.005 ms | 0.020 ms | 0.165 ms | 0.000 ms | 0.015 ms | 226,752 B / 16,384 B | Headless Chrome 151.0.7922.176; ANGLE/D3D11; NVIDIA RTX 3060 | 20; arithmetic mean |

Physical browser-process peak CPU is `not measured` because the runtime exposes logical allocation accounting rather than per-cycle process RSS. Physical GPU peak is `not measured` because WebGL2 exposes no portable authoritative allocation counter. The same session measured deterministic 32×32 synthetic uploads for RGBA32F, RGBA16F, and R8 and recorded exact optional compression-extension availability; compressed encoded sizes/uploads remain `not measured` because AI 530 has no deterministic compiler-signed semantic encoder and AI 531/AI 533 own precision promotion.

Validation: 28/28 package/CLI tests, 61/61 runtime/WebGL tests, and 3/3 project guardrails pass. The repository-wide Node run is 679 passed, 7 failed, and 3 skipped; all seven failures are unrelated existing asset/catalog expectations outside the AI 530 change set (oversized local `assets.zip`, two missing grass outputs, and four pre-existing model/catalog assertions).
