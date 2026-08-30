# Problem

Directional shadow caching and direct lightmaps do not replace ambient occlusion. High-quality baked indirect illumination may already contain much of the static contact and crevice information that static AO or GTAO currently approximates, but low-resolution lightmaps can still miss small features and the moving bus still needs dynamic grounding.

The project also has overlapping AO work in AI 323, AI 524, and AI 525. Their real implementation status and measured results must be audited before adding another layer or removing an existing one.

# Request

Measure and define the final AO/contact-shadow composition for current and optional baked illumination modes. Retain, reduce, replace, or defer each AO path only from evidence, with explicit protection against double-darkening and with current-mode behavior preserved.

## Execution gate

- Do not start until AI 527 through AI 533 are DONE.
- Audit code, specs, tests, and benchmarks for AI 323, 524, and 525. Do not rebuild an already shipped retained-depth exclusion path merely because its prompt filename remains active.
- If AI 323/524/525 are still active, document whether this prompt consumes, supersedes, defers, or leaves each one independent before changing behavior.

Tasks:
- Inventory and isolate every occlusion/grounding contribution:
  - baked indirect irradiance/GI;
  - optional Cycles AO or bent-normal channel;
  - existing static vertex/instance AO;
  - SSAO;
  - GTAO;
  - AO exclusion masks and their render-path cost;
  - bus contact-shadow rig;
  - bus dynamic directional shadow and self-shadow;
  - material AO maps where present.
- Define separate composition policies for `current` and `baked` modes. Switching modes must restore the exact user settings and intensities associated with the target mode rather than destructively rewriting them.
- Establish controlled A/B configurations for no AO, each individual AO path, baked GI alone, and justified combinations.
- Compare static creases, wall/ground junctions, curbs, under overhangs, interior thresholds, roof details, foliage, bus wheels/underside, bus near walls/props, and motion/temporal stability.
- Determine whether baked indirect irradiance contains sufficient static occlusion to:
  - disable static AO;
  - reduce static AO to a subtle high-frequency term;
  - retain it unchanged;
  - replace it with a separate Cycles AO or bent-normal channel.
- Determine whether full-screen SSAO/GTAO remains justified for dynamic interactions after the bus dynamic map and contact rig are active. Prefer targeted dynamic grounding when it provides the required result at lower cost.
- Do not multiply multiple broad occlusion terms without an explicit bounded composition rule. Define intensity normalization/clamping and mode presets that prevent crushed corners, black foliage, dirty halos, and loss of indirect color.
- Keep AO separate from direct sun visibility. AO may affect ambient/indirect contribution according to the spec but must not become a second directional shadow.
- Re-evaluate AO alpha-cutout/exclusion behavior and the cost/benefit of AI 525 stencil/MRT experiments only if full-screen AO remains part of the selected baked-mode solution.
- Preserve current-mode AO visuals/settings unless a separately justified current-engine bug fix is explicitly in scope and validated against its own baseline.
- Add per-contribution debug isolation and a final composition view with numeric effective factors.
- Add deterministic current/baked runtime-switch tests, ensuring no intensity drift, stale history, double application, white/black frames, missing exclusion, or resource leak.
- Measure full-frame and AO-specific CPU/GPU time, calls/triangles, mask-path cost, bandwidth/memory, temporal cadence/history behavior, and visual outcomes under supported AA/resolution modes.

Acceptance requirements:
- Every AO/contact contribution has a documented disposition in current and baked modes.
- Any AO reduction is supported by static and dynamic visual evidence, not by the assumption that all baked lighting includes sufficient occlusion.
- Bus grounding remains convincing in motion without requiring an unjustified full-screen effect.
- Current mode remains available and retains its accepted behavior/settings.
- No tested combination produces unintended double-darkening or alpha-cutout artifacts.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_534_MATERIAL_baked_gi_and_ambient_occlusion_migration_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Record the disposition/supersession status of AI 323, 524, and 525 so future work does not duplicate resolved paths.
- Add a concise completion summary linking composition specs, selected presets, tests, visual comparisons, diagnostics, and migration decisions.
- Include same-condition tables for every tested composition: frame time/FPS, AO/mask calls and triangles, CPU/GPU time, bandwidth/memory where available, image/perceptual metrics, temporal behavior, hardware, resolution, AA/AO settings, route/poses, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
