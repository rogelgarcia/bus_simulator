# Illumination bake compiler

Compiles a semantically validated AI 528 resolved-city package into deterministic,
self-describing AI 529 proof intermediates with Blender 5.2.1 LTS and Cycles CPU.
The compiler is an offline developer tool: the game neither launches Blender nor
loads these proof artifacts at runtime.

The package, checked-in toolchain contract, checked-in profile, and compiler
scripts are the only authorities. A user preference, startup file, add-on,
selected object, saved `.blend`, system Blender, automatic device choice, or
previous Blender scene cannot authorize an output.

## Pinned toolchain

[`toolchain.v1.json`](./toolchain.v1.json) pins the official portable Windows x64
build byte-for-byte:

| Field | Required value |
|---|---|
| Archive | `blender-5.2.1-windows-x64.zip` |
| Archive size | `404851964` bytes |
| Archive raw SHA-256 | `0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c` |
| Executable | `blender-5.2.1-windows-x64/blender.exe` |
| Executable size | `113014232` bytes |
| Executable raw SHA-256 | `8f7a131ad8bc148edc218b334f07d92a57f5a357fa66d913b290537fd8353c06` |
| `bpy.app.version` | `(5, 2, 1)` |
| `bpy.app.version_string` | `5.2.1 LTS` |
| Build hash | `9e2066aef7ef` |
| Platform / architecture | `Windows` / `x86_64` |
| Authoritative backend | Cycles CPU |

Both the archive and extracted executable must be supplied. The orchestrator
checks filename, byte length, and raw SHA-256 before starting Blender; Blender
then asserts its own version/build signature. The currently installed system
Blender is never discovered or used as a fallback. Keep the downloaded archive
and extracted distribution under the gitignored
`tests/artifacts/illumination_529/toolchain/` tree, or pass other explicit paths
to the exact same verified bytes.

Blender is spawned directly (`shell: false`) with this fixed prefix:

```text
blender.exe --background --factory-startup --disable-autoexec --offline-mode \
  --python-exit-code 1 --python tools/illumination_bake_compiler/blender/compiler.py -- <arguments>
```

The compiler receives an explicit environment and writes only within its staging
transaction. It does not use Blender UI state, automatic script execution, or
network access.

## Profiles

The checked-in proof profiles differ only in their fixed CPU thread count:

- [`proof_cpu_1.v1.json`](./profiles/proof_cpu_1.v1.json): one CPU thread.
- [`proof_cpu_12.v1.json`](./profiles/proof_cpu_12.v1.json): twelve CPU threads.

Both profiles are authoritative Cycles CPU configurations. They fix frame `1`,
seed `529`, tabulated Sobol sampling, 32 samples, path-bounce limits, light-tree
and caustics policy, world and sun values, camera projection, unit-white receiver
semantics, alpha threshold, the `uv_proof` bake target, 32 x 32 resolution,
four-pixel adjacent-face margin, and output encoding. Adaptive sampling, animated
seed, time limit, denoising, guiding, motion blur, depth of field, GPU use, and
automatic thread selection are disabled.

The final AI 529 evidence passed three clean runs at both one and twelve threads:
canonical pixels and raw EXR files were byte-identical across all six runs, and
each profile's three manifests were identical. The fixed twelve-thread profile
is therefore the promotion policy. A GPU profile or EEVEE render is
non-authoritative unless a future contract pins it separately and proves it
against Cycles CPU.

## Run

Run from the repository root. A representative explicit invocation is:

```text
node tools/illumination_bake_compiler/run.mjs \
  --input tests/artifacts/illumination_528/packages/bigcity2/default/representative_bigcity2.bsib \
  --archive tests/artifacts/illumination_529/toolchain/blender-5.2.1-windows-x64.zip \
  --blender tests/artifacts/illumination_529/toolchain/portable/blender-5.2.1-windows-x64/blender.exe \
  --profile tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json \
  --output-root tests/artifacts/illumination_529/compiler \
  --jobs depth,direct,indirect,ao \
  --reconstruction validate \
  --repeat 3
```

`--jobs` accepts a unique comma-separated subset of `depth`, `direct`,
`indirect`, and `ao`. Use `--reconstruction validate` for proof fixtures and
package-contract validation, or `--reconstruction full` to additionally rebuild
the selected resolved-city geometry/material inventory in stable-ID order. Full
reconstruction is a compiler audit; proof images remain the AI 529 diagnostics,
not production AI 531/AI 533 cache layouts.

Use repeated `--profile` flags or `--profiles <a.json,b.json>` to collect both
thread policies in one invocation. Runs remain grouped by profile, so only
same-profile manifests are required to share a digest; the runner separately
exposes canonical output hashes for cross-thread comparison.

The low-level Blender Python entry point is intentionally not the supported
operator command. The Node orchestrator is responsible for package semantic
validation, snapshotting, toolchain verification, receipt adaptation, output
rehashing, and atomic promotion.

## Validation and failure behavior

Before expensive work, the orchestrator validates all of the following:

- the toolchain contract and exact archive/executable bytes;
- Blender's runtime version tuple, LTS version string, build hash, platform, and
  architecture;
- the complete AI 528 `.bsib` container through
  `validateResolvedCityBakePackage`, including its framed final-file identity;
- compiler-reference, coordinate/color, source/channel hashes, buffer/accessor,
  topology, counts, bounds, material, texture, and alpha semantics;
- stable object/material/geometry/channel order and the deterministic
  reconstruction plan;
- the raw hashes of the toolchain file, selected profile, and canonical inventory
  of every `blender/*.py` compiler script.

Blender starts from factory state, creates its scene and proof fixtures from
declared data, and emits a compile receipt. The Node authority translates that
receipt into the common manifest, rehashes every EXR and canonical pixel file,
and rechecks all snapshotted inputs immediately before promotion.

Every validation, spawn, timeout, interruption, nonzero Blender exit, unsupported
semantic, missing/partial output, hash mismatch, path escape, permission error,
stale input/config/script, or promotion collision is fatal and produces a nonzero
tool exit. Errors carry a stable compiler error code and context. There is no
silent fallback to another Blender, device, material approximation, path, or
partial result.

## Atomic artifacts

Generated data remains gitignored:

```text
<output-root>/
  runs/<profile>/<run-id>/
    staging/<content-sha256>.<run-id>.partial/
    promoted/<content-sha256>/
  run_report.json
```

A run first creates a unique same-volume staging directory. Failed or interrupted
runs remain identifiable by the `.partial` suffix and are never authoritative.
Only after the receipt, manifest, declared files, hashes, and unchanged input
snapshots pass does the orchestrator atomically rename the directory to a new
content-addressed path under `promoted/`. Existing promoted paths are never
overwritten or deleted; a collision fails.

## Proof jobs and output meanings

The diagnostic jobs remain separate:

| Job selector | Output channel | Meaning |
|---|---|---|
| `depth` | `static_sun_depth` | Orthographic light-space nearest visible position/depth with explicit projection, near/far, empty coverage, and alpha threshold metadata. Empty texels use RGBA `(0, 0, 0, 0)`; occupied texels have alpha `1`. |
| `direct` | `direct_receiver` | Cycles diffuse direct-only lighting on a unit-white receiver. |
| `indirect` | `indirect_irradiance` | Cycles diffuse indirect-only irradiance, separate from direct. |
| `ao` | `static_ao_bent_normal` | Separate Cycles ambient-occlusion proof output; it does not imply that AI 533's final bent-normal representation exists yet. |

Transform, normal, UV, alpha-cutout, and channel-isolation assertions accompany
the image jobs. Cycles surface `SHADOW` bake is not used as a reusable
world-to-bus visibility cache. Opaque `ray_cast`/BVH checks are not accepted as
proof of alpha-tested foliage coverage: declared alpha UV/channel/threshold
semantics or deterministic silhouette geometry must be used.

Each selected image job writes two independently hashed payloads, with its
Python staging sidecar under `channels/<stable-job-id>/`:

1. a lossless scene-linear 32-bit RGBA OpenEXR diagnostic container under
   `raw/`; and
2. canonical decoded pixels under `canonical/`, as tightly packed
   lower-left-first little-endian
   float32 RGBA (`float32_little_endian_rgba_lower_left_v1`).

Canonicalization rejects NaN/infinity and normalizes negative zero. Display
transforms, exposure, tone mapping, grading, dither, and lossy image formats do
not enter authoritative data. Raw EXR bytes may contain container-level variance,
so their digest is reported independently from the canonical decoded-pixel
digest.

## Common intermediate manifest

The promoted `intermediate_manifest.json` is strict canonical JSON with schema
`bus-sim-illumination-intermediate-manifest-v1`. It has exactly these top-level
members:

```text
checks
compiler
configuration
input
outputs
profile
reconstruction
schema
```

The manifest binds:

- archive/executable digests and Blender build/CPU/thread signature;
- raw toolchain/profile digests and the digest of a canonical filename-sorted
  inventory containing every Blender compiler script's raw byte length and
  SHA-256;
- raw package digest plus AI 528 resolved-source, geometry, used-material, and
  per-channel source identities;
- reconstruction mode, stable ordering/identity policy, and inventory counts;
- sorted passed checks; and
- sorted outputs with channel descriptors, relative paths, dimensions, encoding,
  byte lengths, and separate raw/canonical SHA-256 values.

Artifact paths use forward slashes and cannot escape the promoted directory.
Authoritative manifests reject absolute host paths and host/timestamp metadata.
Wall time, memory, process output, and other machine-local observations belong
only in a separate non-authoritative report.

The per-channel Blender manifests and `compile_receipt.json` are internal staging
receipts. Consumers must use the validated common `intermediate_manifest.json`,
not treat a Blender receipt as a promoted contract.

## Repeatability interpretation

For each profile, three clean runs must produce byte-identical common manifests
and canonical float32 files. Compare decoded canonical floats exactly first.
If a platform produces unavoidable finite numeric drift, any proposed exception
must identify the exact channel/components and divergent values, use a
channel-specific tolerance stricter than the downstream visual budget, and be
recorded in the report; an unexplained or broad epsilon does not pass.

Report raw EXR identity separately. Matching raw EXR hashes is useful evidence,
but cannot replace canonical-pixel identity. Cross-profile comparison answers a
different question: whether the fixed twelve-thread policy agrees with the fixed
one-thread reference. It does not require the profile-bound manifests themselves
to share a digest, because profile identity and thread count are intentionally
part of the manifest.

Reports under `tests/artifacts/illumination_529/reports/` should identify every
promoted content address and include build signature, profile/job settings, wall
time, peak memory, raw output size, and the three-run hash/tolerance matrix.
Unavailable measurements must say `not measured` and why; they must not be
invented.

The completed run is recorded in
`tests/artifacts/illumination_529/reports/ai_529_completion_report.md`, with the
machine-readable matrix in `ai_529_metrics.json` and the original six-run report
under `repeatability_final_v2/run_report.json`. These files are gitignored
evidence, not runtime assets.

## Official Blender sources

- [Blender 5.2 release](https://www.blender.org/releases/5-2/)
- [Cycles baking](https://docs.blender.org/manual/en/5.2/render/cycles/baking.html)
- [Render passes](https://docs.blender.org/manual/en/5.2/render/layers/passes.html)
- [EEVEE limitations](https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html)
- [Command-line arguments](https://docs.blender.org/manual/en/5.2/advanced/command_line/arguments.html)
- [Blender render-testing handbook](https://developer.blender.org/docs/handbook/testing/render/)

The compiler contract is specified in
[`specs/graphics/illumination_bake_compiler.md`](../../specs/graphics/illumination_bake_compiler.md).
