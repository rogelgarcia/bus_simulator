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
