# Deterministic Blender/Cycles illumination compiler

## Status and authority

This document is the authoritative AI 529 contract for turning a semantically
validated AI 528 resolved-city package into diagnostic, self-describing offline
illumination intermediates. It refines
[`illumination_framework.md`](./illumination_framework.md) and consumes
[`illumination_bake_input.md`](./illumination_bake_input.md). The framework owns
channel meaning and descendant boundaries, the bake-input specification owns
source identity, and this document owns the exact Blender toolchain, clean scene
reconstruction, Cycles proof jobs, deterministic output contract, and atomic
promotion.

AI 529 does not define the production static-sun layout, receiver atlases,
runtime container, streaming, activation, shaders, Options behavior, or final
promotion of baked mode. Those remain AI 530 through AI 536 work.

## Pinned production toolchain

The only authoritative compiler is the official Windows x64 portable archive:

| Field | Required value |
|---|---|
| Archive | `blender-5.2.1-windows-x64.zip` |
| Archive bytes | `404851964` |
| Raw archive SHA-256 | `0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c` |
| Blender version | `5.2.1 LTS`, `bpy.app.version == (5, 2, 1)` |
| Build hash | `9e2066aef7ef` |
| Build platform | `Windows` |
| Architecture | `x86_64` |
| Executable bytes | `113014232` |
| Raw executable SHA-256 | `8f7a131ad8bc148edc218b334f07d92a57f5a357fa66d913b290537fd8353c06` |
| Authoritative backend | Cycles CPU |

Raw file SHA-256 is used for the published archive, executable, scripts,
profiles, raw EXR files, and canonical pixel files. AI 528 source/package
identities continue to use the domain-framed hashing protocol declared by its
format. The two digest types are never substituted for each other.

A system Blender discovered by name or install location is not authoritative.
The orchestration command requires explicit paths to both the supplied archive
and its extracted executable, verifies both files against the pinned byte
contracts, and then checks the build signature from inside Blender. Extraction
is an operator preparation step, not an authority shortcut; the compiler does
not discover or accept an unchecked cache. No `--allow-latest`, version-range,
or unchecked-binary path exists.

The invocation prefix is fixed:

```text
blender.exe --background --factory-startup --disable-autoexec --offline-mode \
  --python-exit-code 1 --python <compiler.py> -- <compiler arguments>
```

The process is spawned directly with an argument array and `shell: false`.
User startup files, add-ons, saved preferences, automatic script execution,
network access, and hand-edited `.blend` files are outside the trust boundary.

## Orchestration and validation boundary

One command owns the complete transaction:

1. Verify the raw Blender archive and extracted executable signature.
2. Parse the complete `.bsib` container and run
   `validateResolvedCityBakePackage`; low-level container validity alone is not
   sufficient.
3. Assert the package compiler reference, coordinate/color contracts, source
   hashes, channel profiles, material/alpha support, counts, and bounds.
4. Canonicalize a stable-ID reconstruction plan and snapshot the input,
   profile, toolchain contract, and every compiler script.
5. Create a same-volume directory below `staging/` and restrict every Blender
   output path and compiler-owned temporary/configuration path to that stage.
6. Probe/assert the Blender build from `bpy`, clear factory state, construct the
   deterministic proof scene, optionally reconstruct the full resolved-city
   audit inventory, explicitly configure Cycles, and run the selected jobs.
7. Require a canonical receipt plus every declared raw and canonical output.
8. Recompute every output hash and recheck the input/script/config snapshots.
9. Rename the complete staging directory to a previously nonexistent,
   content-addressed directory below `promoted/`.

Any failure exits nonzero. A failed or interrupted directory remains below
`staging/` and has no promotion path. Existing promoted output is never deleted
or overwritten. Every existing content-address path is a collision and fails,
even when the requested digest is identical.

## Clean reconstruction

Reconstruction begins from factory startup and deletes/recreates all scene data
used by the compiler. Blender collection, object, mesh, material, image, camera,
world, light, view-layer, UV, output-node, and bake-target state is created by
the script. A `.blend` file may be emitted only as an optional diagnostic and
is never an input or promotion requirement.

`validate` mode performs complete Node and Blender package-contract validation
and constructs only the self-contained proof fixtures. `full` mode additionally
reconstructs the union of selected AI 528 channel mappings as a stable-ID audit;
it does not change the proof-image layouts into production cache layouts.

All package inventories and jobs are processed in ascending AI 528 stable-ID
order. Blender names are bounded diagnostic aliases; the complete stable ID is
stored as custom metadata and remains the authoritative mapping.

The coordinate conversion is applied to local data and transforms:

```text
Blender.x = Three.x
Blender.y = -Three.z
Blender.z = Three.y
```

Package matrices are column-major. Local positions, normals, tangents, winding,
indices, draw ranges, material groups, UV sets, and shared geometry identity are
preserved. Shared package geometry remains shared Blender mesh data where slot
semantics allow it; instances do not create independent geometry identity.
Unsupported component types, topology, transform determinants, material models,
texture formats, alpha modes, coverage operations, or channel semantics fail or
are excluded only when the AI 528 channel profile explicitly says `exclude`.
The V1 procedural-coverage adapters are restricted to
`sidewalk-edge-dirt-strip-v1` and `asphalt-edge-wear-v1`; both preserve their
declared metadata and are opaque for visibility because neither creates a
silhouette hole. Any other procedural adapter fails closed.

Texture color space, row origin, UV transform, wrap/filter, and `flipY` are
explicit. Alpha-tested casters use AI 528's exact coverage channel and threshold
or deterministic silhouette geometry. Blender `Scene.ray_cast`/`BVHTree` is an
opaque-geometry oracle only and cannot prove a foliage silhouette by itself.

## Explicit Cycles profile

Every compiler run consumes a versioned profile whose schema is
`bus-sim-illumination-compiler-profile-v1`. Profiles explicitly declare:

- Cycles CPU device, fixed thread count, and prohibition of automatic GPU use;
- fixed frame, seed, animated-seed state, Sobol policy, samples, and scrambling;
- adaptive sampling, time limit, denoising, guiding, and preview behavior;
- total, diffuse, glossy, transmission, transparent, and volume bounces;
- reflective/refractive caustics, direct/indirect clamps, and light-tree policy;
- motion blur, camera depth of field, transparent film, and object order;
- sun/world energy and linear color, receiver-color semantics, and alpha policy;
- bake target, UV name, resolution, precision, margins, and clearing behavior;
- EXR mode/depth/codec, canonical pixel encoding, row origin, and color space;
- display/view/exposure/gamma values, although display transforms never enter
  authoritative lighting pixels.

The proof profiles use unit-white diffuse receivers so direct and indirect
outputs are light-only. Base color remains a live runtime property. Production
intermediates are scene-linear Linear-sRGB; exposure, AgX, tone mapping, grading,
dither, bloom, and lossy encodings are forbidden.

GPU Cycles and EEVEE output cannot be promoted by these profiles. A future GPU
draft requires a separately pinned backend/device/driver signature and an
explicit comparison with CPU.

## Diagnostic jobs

AI 529 provides small deterministic proof fixtures rather than claiming final
AI 531/AI 533 layouts:

| Selector / stable output ID | Required proof |
|---|---|
| `depth` / `proof_static_sun_depth_position` | Orthographic light-space nearest depth/position, explicit near/far and projection metadata, RGBA `(0, 0, 0, 0)` empty texels, and cutout threshold in linear 32-bit RGBA OpenEXR |
| `direct` / `proof_diffuse_direct_only` | Cycles `DIFFUSE` bake with direct only and unit-white receiver semantics |
| `indirect` / `proof_diffuse_indirect_only` | Cycles `DIFFUSE` bake with indirect only, separate from direct |
| `ao` / `proof_ambient_occlusion_separate` | Separate Cycles AO bake with explicit profile settings |
| Receipt check: `transform_normal_uv_alpha` | Three-to-Blender transform, inverse-transpose normal direction, lower-left UV orientation, and alpha-cutout silhouette assertions |
| Receipt check: `channel_isolation` | Direct, indirect, AO, and depth outputs remain distinct and do not leak receiver color/display transforms into each other |

Cycles surface `SHADOW` bake is forbidden as a reusable world-to-bus cache. It
describes lighting/shadow on the baked receiver surface and cannot answer
visibility for arbitrary later world positions.

## Intermediate output contract

Each image job emits both:

1. a lossless 32-bit linear OpenEXR diagnostic file; and
2. canonical decoded pixels encoded as lower-left-first little-endian float32
   RGBA bytes.

The raw EXR container and decoded pixels are hashed separately. The canonical
pixel encoding normalizes negative zero and rejects NaN/infinity. Width, height,
component count, row origin, finite range, channel meanings, empty sentinel,
near/far, alpha threshold, and projection are recorded in the channel descriptor.

The authoritative manifest schema is
`bus-sim-illumination-intermediate-manifest-v1` with these exact top-level
members:

```text
checks[]
compiler
configuration
input
outputs[]
profile
reconstruction
schema
```

The compiler record binds the archive/executable hashes, Blender build,
architecture, CPU backend, and fixed thread count. Configuration binds raw
SHA-256 of the toolchain contract and profile plus the SHA-256 of a canonical,
filename-sorted inventory containing the raw byte length and SHA-256 of every
`blender/*.py` compiler script. Input binds the package raw digest plus AI 528
resolved-source, geometry, used-material, and per-channel source hashes.
Reconstruction records mode, stable-order policy, stable-ID preservation, and
inventory counts.

Outputs are stable-ID sorted and contain:

```text
id
channel
descriptor
raw:       { path, format, byteLength, sha256 }
canonical: { path, encoding, width, height, components, rowOrigin,
             byteLength, sha256 }
```

Paths are forward-slash artifact-relative paths. Authoritative manifests contain
no timestamp, hostname, username, absolute path, random run ID, elapsed time,
memory sample, process ID, or raw stdout. Those values may appear only in a
separate non-authoritative metrics report.

Blender's per-output manifests and `compile_receipt.json` are staging receipts.
The Node orchestrator validates and adapts them into the common
`intermediate_manifest.json`; downstream consumers use only the latter as the AI
529 contract.

## Repeatability and thread policy

Small proof fixtures run at least three times from clean factory state. The gate
requires identical canonical manifests and packed canonical pixels. Decoded
float pixels are compared exactly first; any accepted numeric tolerance must be
channel-specific, finite, stricter than the downstream visual budget, and
documented with the exact divergent values and environment. Raw EXR identity is
reported separately and is not substituted for decoded-pixel identity.

The host compares fixed 1-thread and fixed available-logical-thread CPU
profiles. Multithreaded CPU is the promotion policy when it passes the same
three-run gate. A fixed one-thread promotion profile is allowed only when the
multithreaded result cannot meet it. Automatic thread selection is never a
promotion policy.

## Artifacts and metrics

Generated output is gitignored below. The CLI nests each transaction by profile
and run so independent repeats may promote the same content address without
colliding:

```text
<output-root>/
  runs/<profile>/<run-id>/
    staging/<content-sha256>.<run-id>.partial/
    promoted/<content-sha256>/
  run_report.json
```

Reports identify the exact promoted manifest and include Blender signature,
CPU/thread policy, job settings, wall time, peak memory when measurable, raw
output size, and the three-run hash/tolerance matrix. Unavailable measurements
are written as `not measured` with a reason. No compiler artifact is loaded by
the game, and absence of Blender has no gameplay effect.

## Official decision sources

- <https://www.blender.org/releases/5-2/>
- <https://docs.blender.org/manual/en/5.2/render/cycles/baking.html>
- <https://docs.blender.org/manual/en/5.2/render/layers/passes.html>
- <https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html>
- <https://docs.blender.org/manual/en/5.2/advanced/command_line/arguments.html>
- <https://developer.blender.org/docs/handbook/testing/render/>
