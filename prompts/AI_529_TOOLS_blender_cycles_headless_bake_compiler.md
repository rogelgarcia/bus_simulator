# Problem

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
