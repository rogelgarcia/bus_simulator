# DONE — AI 529: Blender/Cycles Headless Bake Compiler

The illumination framework needs an offline compiler, not a manual Blender workflow. Production output must be reproducible from declared inputs and must not depend on an artist's `.blend` file, UI actions, startup preferences, selection, active object, device auto-selection, or previous Blender state.

The authoritative engine decision from AI 527 is Blender 5.2.1 LTS with Cycles CPU. The workstation may contain a different Blender patch version, so system installation discovery alone cannot authorize a production bake.

# Request

Implement the deterministic headless Blender/Cycles bake compiler and common intermediate-artifact contract. This prompt owns toolchain pinning, clean scene reconstruction, scripted bake execution, repeatability, and validated intermediate outputs. It does not yet ship production sun-cache, GI, AO, runtime-loader, or Options behavior.

## Execution gate

- Do not start until AI 527 and AI 528 are DONE.
- Consume only the versioned resolved-city package produced by AI 528.
- Treat the official Blender 5.2.1 LTS portable x64 archive as the production compiler. Record its official archive SHA-256, `bpy.app.version`, `bpy.app.version_string`, build hash, OS/architecture, and Cycles device/thread policy. Do not accept "latest" or an unverified system Blender.

Tasks:
- Add a dedicated version-controlled tool folder with README and `PROJECT_TOOLS.md` registration.
- Provide one documented orchestration command that validates the export, locates/verifies the exact Blender binary, starts Blender headlessly, reconstructs the scene, runs selected diagnostic bake jobs, validates outputs, and exits nonzero on any failure.
- Use a command-line shape equivalent to `--background --factory-startup --disable-autoexec --offline-mode --python-exit-code 1 --python <script> -- <args>`, adjusted only where official Blender 5.2.1 arguments require it.
- Never require manual Blender editing. The script must clear/recreate all state and explicitly construct collections, meshes, instances, materials, UV targets, light/world nodes, cameras, view layers, output nodes, and bake targets from the declared package.
- Treat saved `.blend` files as optional disposable diagnostics only. They may not be the source of truth or an input required for production promotion.
- Assert tool version/build, manifest schema, source hashes, coordinate contract, object inventory, counts, bounds, and supported material semantics before doing expensive work.
- Lock Cycles CPU as the authoritative radiometric backend. EEVEE may be exposed only as a non-authoritative visual preview and must never produce promoted artifacts.
- Allow GPU Cycles only under an explicitly labeled draft profile or a separately pinned hardware/backend/driver signature that passes comparison against CPU. Never silently select a device.
- Configure every bake-affecting value explicitly: CPU device, thread count, fixed frame, seed, animated seed off, Classic/Owen-Sobol sampling, samples, bounces, transparent bounces, adaptive sampling off, time limit zero, denoising off, caustics, clamps, light tree policy, motion blur/DOF off, world/light settings, alpha behavior, color management, UV target, image resolution/precision, margins, object order, and output paths.
- Seed or eliminate all procedural/random behavior and sort all objects, materials, tiles, images, and jobs by stable ID.
- Implement diagnostic proof jobs for:
  - orthographic light-space Z/depth/position output suitable for later static sun tiles;
  - Cycles diffuse direct-only output with receiver color semantics explicitly controlled;
  - Cycles diffuse indirect-only irradiance;
  - separate Cycles AO output;
  - transform, normal, UV, alpha-cutout, and channel-isolation fixtures.
- Do not use the Cycles surface `SHADOW` bake as the reusable world-to-bus cache; it combines shadow/lighting on static receiver surfaces rather than providing arbitrary-world-position visibility.
- For sun-depth proof output, use lossless linear 32-bit OpenEXR intermediates and prove how nearest visible depth, background/empty texels, precision range, orthographic projection metadata, and alpha thresholds are encoded.
- Treat geometry `Scene.ray_cast`/`BVHTree` results as an opaque-geometry oracle only. For alpha-tested casters, explicitly sample the declared alpha texture/UV/threshold or compile deterministic silhouette geometry; do not validate foliage as opaque triangles accidentally.
- Write illumination intermediates in linear/raw color space. Do not apply display transforms, exposure, tone mapping, final-color grading, or lossy image formats to authoritative data.
- Remove nondeterministic/timestamp/host metadata where possible. Hash canonical decoded pixels and later packed bytes separately from raw EXR container bytes.
- Include compiler script/config hashes, Blender archive/build signature, job profile, source/channel hashes, and output-channel descriptors in every intermediate manifest.
- Implement atomic staging: interrupted/failed jobs remain under temporary artifact locations and can never be mistaken for promoted outputs.
- Run at least three clean same-machine repeat bakes for small fixtures. Require identical manifests and canonical packed fixture output; attempt decoded-pixel exactness and document strict numeric tolerances for any unavoidable difference.
- Compare CPU results across available thread counts. Pin a repeatable thread policy; use a single-thread promotion profile only if multithreaded output cannot meet the repeatability gate.
- Add negative tests for wrong Blender patch/build, wrong archive checksum, missing Blender, wrong input hash, malformed geometry, unsupported alpha/material semantics, path/permission failure, interrupted bake, partial output, and stale compiler scripts/config.
- Document official decision sources in the README:
  - `https://www.blender.org/releases/5-2/`
  - `https://docs.blender.org/manual/en/5.2/render/cycles/baking.html`
  - `https://docs.blender.org/manual/en/5.2/render/layers/passes.html`
  - `https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html`
  - `https://docs.blender.org/manual/en/5.2/advanced/command_line/arguments.html`
  - `https://developer.blender.org/docs/handbook/testing/render/`

Acceptance requirements:
- A clean checkout with the exact declared input and verified Blender binary can reproduce every fixture without opening Blender interactively.
- No production result depends on user preferences, a hand-edited `.blend`, automatic device selection, or undeclared files.
- Direct, indirect, AO, and depth channels remain separate and self-describing.
- The game has no runtime dependency on Blender and behaves normally if the compiler is unavailable.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_529_TOOLS_blender_cycles_headless_bake_compiler_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking scripts, README, compiler/profile specs, fixture inputs/outputs, negative tests, and repeatability reports.
- Report Blender build/signature, CPU/thread policy, job settings, bake time, peak memory, raw output size, and the three-run hash/tolerance matrix. Mark unavailable metrics as `not measured` with a reason.

## Completion summary

Implemented the deterministic offline Blender/Cycles compiler, exact portable
toolchain gate, semantic AI 528 preflight, clean scene/fixture construction,
stable-ID full reconstruction audit, shell-free isolated Blender process,
canonical receipt adaptation, separately hashed EXR/canonical pixels, and
same-volume atomic promotion. No game/runtime code launches or depends on
Blender.

- Contract: [illumination compiler specification](../specs/graphics/illumination_bake_compiler.md)
- Tool: [README](../tools/illumination_bake_compiler/README.md), [orchestration CLI](../tools/illumination_bake_compiler/run.mjs), and [Blender entry point](../tools/illumination_bake_compiler/blender/compiler.py)
- Pinned configuration: [toolchain](../tools/illumination_bake_compiler/toolchain.v1.json), [one-thread profile](../tools/illumination_bake_compiler/profiles/proof_cpu_1.v1.json), and [twelve-thread profile](../tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json)
- Tests: [AI 529 compiler suite](../tests/node/unit/illumination_bake_compiler/), [AI 528 package validation](../tests/node/unit/illumination_bake_source_validation.test.js), [geometry](../tests/node/unit/illumination_bake_source_geometry.test.js), and [material/alpha](../tests/node/unit/illumination_bake_material_texture.test.js)
- Fixture input: [representative_bigcity2.bsib](../tests/artifacts/illumination_528/packages/bigcity2/default/representative_bigcity2.bsib)
- Evidence: [completion report](../tests/artifacts/illumination_529/reports/ai_529_completion_report.md), [machine-readable metrics](../tests/artifacts/illumination_529/reports/ai_529_metrics.json), [six-run matrix](../tests/artifacts/illumination_529/repeatability_final_v2/run_report.json), and [full reconstruction run](../tests/artifacts/illumination_529/full_reconstruction_final/run_report.json)

Pinned build: official `blender-5.2.1-windows-x64.zip`, archive SHA-256
`0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c`,
executable SHA-256
`8f7a131ad8bc148edc218b334f07d92a57f5a357fa66d913b290537fd8353c06`,
`bpy.app.version == (5, 2, 1)`, version string `5.2.1 LTS`, build hash
`9e2066aef7ef`, Windows x86_64, Cycles CPU. The final compiler-script
inventory SHA-256 is
`2d27a0246de0a93d4d858b4a50ce453313ebf3c99c556dd81e2d3d465a9a0406`.

Promotion policy: fixed 12 CPU threads on the 12-logical-thread Ryzen 5 9600X
host. Three one-thread runs took 42.315 s, 41.977 s, and 41.891 s; three
12-thread runs took 41.724 s, 41.911 s, and 41.788 s. These are end-to-end
compiler wall times. Bake-only time is `not measured` because the subprocess
contract does not emit a stable separate phase timer. Peak memory is
`not measured` because the shell-free subprocess contract exposes no reliable
cross-platform peak working-set metric and no polling sampler was added.

Job settings: frame 1, seed 529, tabulated Sobol, 32 samples, adaptive sampling
off, denoising/guiding/time limit off, fixed bounce/clamp/caustic/light-tree
policy, 32×32 lower-left RGBA float32 targets, four-pixel adjacent-face margin,
and separate depth, diffuse-direct, diffuse-indirect, and AO jobs. Raw EXR
output totals 28,879 bytes; canonical float32 output totals 65,536 bytes.

Repeatability gate: each profile's three authoritative manifests were
byte-identical. Canonical decoded outputs and raw EXR containers were
byte-identical across all six runs and both thread counts, so maximum absolute
and relative decoded differences are both 0 and the accepted tolerance is
strictly 0. Canonical hashes are AO
`abe1011959d976679f5a900d05c5320ba32c2d933a11529555eaf346b3d0b7a0`,
direct `a5fee724c952274042197508966ac71085b51e0004445f74a832052a9ccc2f2a`,
indirect `a6f553c58ed930ebb8aec7a956c17706ca986d4bcc1aacecf1cee4dd13a26374`,
and depth `b24cfecbfe36cfdbc4570173acc0ec8a729276701f2dc278a3160f45b44a210d`.

The final full-mode run promoted in 65.308 s and reconstructed 1,843 geometry
datablocks, 16,119 selected stable-ID instances, and 29,017 channel-role
mappings, with 5,529 normal-conversion and 5,976 UV checks. The full-mode
manifest SHA-256 is
`ff746a9f5c996e93f771a961df9ba72c361ef0b19c5e9b4209727573d5782e7d`.

Verification: 32/32 focused AI 529 tests passed; the complete illumination-bake
subset passed 68/68; every final promoted file was independently reopened,
schema-validated, and rehashed; and `git diff --check` passed. The full Node
unit suite ran 595 tests: 586 passed, 3 skipped, and 6 unrelated existing
workspace tests failed (facade attachment fallback, two missing/stale Grass V2
asset checks, markings debugger shortcut, texture-correction profile, and wall
decorator profile). No illumination or AI 529 test failed.
