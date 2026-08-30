# DONE

## Completion summary

AI 527 established the architecture and before-state measurement contract without changing production rendering behavior. The authoritative specification is [`specs/graphics/illumination_framework.md`](../specs/graphics/illumination_framework.md); the tracked machine-readable baseline is [`tests/benchmarks/ai527_current_illumination_baseline_2026-08-30.json`](../tests/benchmarks/ai527_current_illumination_baseline_2026-08-30.json).

The specification now fixes:

- scene-linear ownership and formulas for live sun, cached static visibility, dynamic bus visibility, optional baked direct diffuse, indirect irradiance, live direct specular/transmission, IBL/reflection, emissive, AO, exposure, and post-processing;
- `current`/`baked`/`auto`, six public lifecycle states with structured phases/reasons, atomic frame-boundary switching, and minimum channel sets for player-visible baked profiles;
- Blender `5.2.1 LTS` portable x64 archive `blender-5.2.1-windows-x64.zip` with SHA-256 `0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c`, authoritative Cycles CPU radiometric baking, EEVEE preview-only, and scripted clean-scene operation;
- Three.js/Blender transform, precision, UV, alpha, color, irradiance-unit, normal-map, profile invalidation, shader-hook, validation-case, storage/loading/memory/performance, visual-error, seam, bake-time, and descendant dependency contracts.

The generic loader, static-sun, direct/indirect, and Options descendant prompts were aligned to those contracts. `current` remains the permanent compatibility oracle and never depends on Blender or a generated payload.

## Current-engine hardware baseline

Primary conditions: Windows x64; Google Chrome 151.0.7922.174 headless; WebGL2/ANGLE D3D11; NVIDIA GeForce RTX 3060; production BigCity2 with static visibility active; 1280x696 drawing buffer at pixel ratio 1; default AgX/exposure 0.86, hemisphere 1.46, sun 5.75, IBL 0.28, sun 45/35; 8x MSAA; GTAO every frame with retained-depth exclusion; single/high 16384 shadow map with merged casters. The profiler sampled 25 fixed regions in four directions (100 poses), ran one complete warm-up and two measured frames per pose, and ended each measured `city.update()` plus render with `gl.finish()`. Values are arithmetic means across 200 frames unless identified as pose statistics.

| Metric | Current before-state |
|---|---:|
| Synchronized CPU + GPU-complete frame time | 9.461 ms |
| Derived throughput | 105.70 FPS |
| Pose-mean median / nearest-rank p90 | 6.650 / 21.500 ms |
| Pose-mean population standard deviation | 7.851 ms (spatial, not temporal) |
| Whole frame | 1,249.70 calls / 2,592,844 triangles |
| Visible scene | 903.61 calls / 807,402 triangles |
| Shadow maps | 289.13 calls / 1,591,191 triangles |
| Static-world part of shadow maps | 270.37 calls / 1,566,749 triangles |
| Dynamic bus part of shadow maps | 18.76 calls / 24,442 triangles |
| AO exclusion | 50.96 calls / 194,245 triangles |
| Post-processing | 6.00 calls / 6 triangles |
| CPU-only / GPU-only / per-pass time | not measured; the profiler synchronizes the whole frame and collected no reliable timer-query split |
| Physical GPU residency / bandwidth | not measured; WebGL exposes no portable counter |

All 200 frames reconciled attributed submissions to renderer totals. A separate SwiftShader run reproduced every workload counter and is retained as a software fallback, not a promotion baseline. The earlier AI 524 RTX 3060 result remains historical corroboration.

Raw hardware results are [`tests/artifacts/illumination_527/current_regions_hardware.json`](../tests/artifacts/illumination_527/current_regions_hardware.json) and [`CURRENT_REGIONS_HARDWARE.md`](../tests/artifacts/illumination_527/CURRENT_REGIONS_HARDWARE.md). Software fallback results, exact artifact hashes, commands, settings, unavailable-metric reasons, and logical-versus-physical memory distinctions are in the tracked baseline.

Six RTX 3060 reference captures and their hashes are recorded in [`tests/artifacts/illumination_527/capture_manifest.json`](../tests/artifacts/illumination_527/capture_manifest.json), with PNGs under `tests/artifacts/screens/illumination_527/`. They cover walls, roofs, overhangs, high/low sun, foliage, AO/contact, roads, the bus, and bus-road contact. They do not prove a static-object shadow boundary crossing the bus; the architecture therefore requires AI 532 to create and validate the dedicated fixed 16-pose partial-bus-shadow fixture rather than overstating this baseline.

Focused AO/shadow/static-visibility tests passed 63/63. AI 528 is the next implementation step.

# Problem

`AI_DONE_526_ATMOSPHERE_illumination_framework_light_shadow_baking_master_plan_DONE.md` established the rationale for an optional baked-illumination framework, but production work must not begin until the project has one precise composition contract, engine decision, coordinate/color contract, compatibility boundary, and measured baseline.

The existing live Three.js lighting, single/cascaded sun shadows, AO, IBL, post-processing, and bus contact-shadow behavior must continue to work exactly as they do today. Baked illumination is an add-on that may be absent for a city, lighting profile, browser, or installation. It must never become a boot-time or gameplay requirement.

# Request

Write the authoritative illumination architecture specification and establish deterministic visual/performance baselines for every later AI in the 526 program. This step is specification, research, and measurement only; do not implement production baking, payload loading, or replacement lighting.

## Execution gate

- Start only after AI 526 is present under its DONE name.
- Read AI 408's global render-pipeline/lab requirements and define illumination as a consumer of that pipeline; do not create a competing renderer or duplicate the lab shell.
- Read AI 481 for canonical/derived identity and deterministic compiler principles, but do not adopt its live mesh-handoff payload as the city bake format.
- Audit the actual implementation state of AI 323, 497, 498, 520, 524, and 525 rather than trusting filenames alone.

Tasks:
- Create or update a dedicated illumination-framework specification under `specs/graphics/`.
- Define the complete lighting composition in linear space, with distinct terms and ownership for:
  - current live direct sun and other direct lights;
  - cached static sun visibility;
  - dynamic-caster visibility;
  - environment/IBL and baked indirect irradiance;
  - emissive, specular, reflection, and transmission behavior;
  - static AO, screen-space AO, and dynamic contact/grounding;
  - tone mapping, exposure, output conversion, and post-processing boundaries.
- State exactly which term each later bake may attenuate or add. A visibility mask may attenuate direct sun only; it must not darken IBL, emissive, reflections, or final color generically.
- Define three runtime capability modes at the architecture level:
  - `current`: always available and uses the existing live engine unchanged;
  - `baked`: activates only with a complete, compatible payload and supported runtime path;
  - `auto`: selects baked only when compatible and otherwise remains on current.
- Require runtime switching without page reload. Activation/deactivation must be atomic at a frame boundary; loading a baked payload must leave current lighting active until the baked state is complete.
- Treat missing baked assets as a normal supported condition. Define unavailable, loading, active, stale, failed, and fallback states without making the game depend on Blender or bake files at runtime.
- Define channel-specific profile and invalidation semantics. At minimum distinguish static sun depth/visibility, direct receiver illumination, indirect irradiance, and optional AO/bent-normal data.
- Lock the initial toolchain decision:
  - exact production target: official Blender `5.2.1 LTS` portable x64, compiler signature including archive checksum and `bpy.app` version/build hash;
  - authoritative radiometric baker: Cycles CPU;
  - EEVEE: optional preview only, never a production artifact backend;
  - GPU Cycles: optional draft/experimental accelerator only until it passes a separately signed reproducibility/tolerance gate;
  - static sun visibility: orthographic light-space depth tiles, not the Cycles surface `SHADOW` bake.
- Record the official basis for the engine decision:
  - `https://www.blender.org/releases/5-2/`
  - `https://docs.blender.org/manual/en/5.2/render/cycles/baking.html`
  - `https://docs.blender.org/manual/en/5.2/render/layers/passes.html`
  - `https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html`
  - `https://developer.blender.org/docs/handbook/testing/render/`
- Define Three.js-to-Blender coordinate and data conventions: units, handedness, Y-up/Z-up conversion, origin, transforms, winding, normals/tangents, UV origin, alpha semantics, color spaces, linear ranges, precision, and quantization ownership.
- Define representative fixed lab cases and real gameplay route/pose cases covering walls, roofs, roads, overhangs, low sun, foliage alpha cutouts, partial static shadows crossing the moving bus, bus self-shadow, and bus-ground contact.
- Capture same-condition baselines for the current engine before descendant work changes it. Include screenshots/raw comparisons and frame time/FPS, whole-frame and shadow/AO pass calls and triangles, CPU/GPU-complete timing where available, memory, resolution, settings, hardware, warm-up, sample count, statistic, and variance/noise signal.
- Establish explicit budgets and promotion gates for disk/download size, decode/upload time, resident GPU memory, shader cost, bake duration, static shadow-pass work removed, visual error, seams, and mode-switch latency.
- Define shader/pass extension points that comply with project shader-file policy and AI 408 ownership. Do not endorse new inline shader strings or unasserted Three.js chunk replacement.
- Produce a dependency/output table that later AIs can consume without reopening architectural ownership.

Acceptance requirements:
- The specification makes it possible to determine, for every lighting contribution, whether it belongs to current runtime rendering, a baked channel, a dynamic channel, or post-processing.
- `current` mode is explicitly the compatibility oracle and cannot depend on any generated payload.
- The engine choice, optional-feature lifecycle, coordinate/color conventions, baselines, and budgets are recorded with no unresolved decision that blocks AI 528.
- No production runtime behavior is changed by this prompt.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_527_ATMOSPHERE_illumination_composition_architecture_and_baselines_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the specification, baselines, raw artifacts, toolchain decision, budgets, and dependency contract.
- Include the measured current-engine baseline table with complete benchmark conditions. Mark unavailable metrics as `not measured` with a reason; do not substitute projections.
