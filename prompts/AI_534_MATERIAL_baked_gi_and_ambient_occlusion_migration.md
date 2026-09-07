# Problem

Directional shadow caching and direct lightmaps do not replace ambient occlusion. High-quality baked indirect illumination may already contain much of the static contact and crevice information that static AO or GTAO currently approximates, but low-resolution lightmaps can still miss small features and the moving bus still needs dynamic grounding.

The project also has overlapping AO work in AI 323, AI 524, and AI 525. Their real implementation status and measured results must be audited before adding another layer or removing an existing one.

# Request

Measure and define the final AO/contact-shadow composition for current and optional baked illumination modes. Retain, reduce, replace, or defer each AO path only from evidence, with explicit protection against double-darkening and with current-mode behavior preserved.

## User direction — September 7, 2026

Use the accepted baked indirect lighting for static environmental occlusion and
target supplementary runtime AO at dynamic interactions. This is the preferred
composition to implement and validate, rather than stacking full-scene AO over
the same baked static shading. Preserve baked direct, baked indirect, AI 548 and
the current engine. This update defines the next implementation; it does not
claim that Dynamic Only already exists.

- [ ] Add an AO **Scope** selector, **All / Dynamic Only**, within the existing
  AO section. Prefer one segmented toggle over two separate tabs. Keep scope
  separate from the AO method/enable control (`Off / SSAO / GTAO`, or the measured
  supported dynamic implementation). Show only controls relevant to the selected
  scope; retain independent All and Dynamic Only parameter sets.
- [ ] When compatible baked indirect illumination becomes effective, select
  Dynamic Only by default. Drive the automatic choice from actual channel
  activation/coverage, not a requested checkbox during loading or fallback.
  Direct-only baking does not trigger this switch. Preserve an explicit AO Off
  choice; changing scope must not turn AO back on.
- [ ] Preserve the prior current-engine/All configuration and restore it when
  indirect lighting is disabled, rejected or invalidated. Keep an explicit All
  override for comparison while indirect is active, without destroying either
  scope's saved parameters. Define how the override survives Save/Cancel,
  presets and reload; display the effective scope without a hidden override.
- [ ] Dynamic Only must include bus self-occlusion, world-to-bus occlusion and
  bus-to-world contact on nearby ground/walls. At least one participant in the
  added interaction must be dynamic. Static geometry must remain available to
  occlude dynamic receivers; static receivers must still receive occlusion from
  the bus. Excluding all static meshes from AO, masking only bus pixels, or
  applying ordinary full AO in a region around the bus is not sufficient.
- [ ] Classify dynamic participants using authoritative object mobility/registry
  data, including a stationary bus. Do not use mesh names, ad-hoc receiver lists
  or a velocity threshold. Extend the same policy to future registered vehicles,
  pedestrians and movable props.
- [ ] In Dynamic Only, suppress redundant broad static AO where valid indirect
  coverage already supplies it. Audit material AO separately rather than deleting
  authored microdetail. Document handling of unbaked/excluded receivers and
  coverage loss. Keep direct sun visibility independent and prevent bus contact
  blobs, dynamic AO and directional shadows from duplicating the same darkening.
- [ ] Reuse the retained-depth/exclusion infrastructure and bus contact path when
  appropriate, but validate contribution-level separation. Do not claim a
  performance gain from a final-output mask while retaining all expensive passes.
  Measure whether bounded dynamic work or a dedicated contact solution is better.
- [ ] Test GI alone, GI plus Dynamic Only, GI plus All, and the current engine's
  preserved AO. Cover bus wheels/underside, nearby walls, intersections, stationary
  camera with moving bus, stationary bus, camera movement, off-screen participants,
  alpha cutouts and scope/channel toggles. No lingering history or indirect-light
  disablement may result from an AO change.

The planned scope/lifecycle contract is documented in
[Ambient Occlusion](../specs/graphics/ambient_occlusion.md#planned-ai-534-scope-selection).

## Execution gate

The [AI 533 acceptance record](../specs/graphics/illumination_533_acceptance.md)
retains both baked direct and indirect lighting, AI 548 and the current engine.
Use those retained channels as inputs. AO migration must not remove them or
change the current engine merely to make it resemble Blender.

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
- Treat Dynamic Only with accepted indirect lighting as the requested default
  target. If a static detail is missing, record its cause and a bounded remedy;
  do not silently reinstate broad static AO or weaken the bake's coverage policy.
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
- Scope changes preserve direct/indirect activation and cached assets; AO Off
  remains off, stale/loading GI does not prematurely remove current AO, and
  effective Dynamic Only excludes static-to-static additions while retaining
  both directions of dynamic/world contact.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_534_MATERIAL_baked_gi_and_ambient_occlusion_migration_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Record the disposition/supersession status of AI 323, 524, and 525 so future work does not duplicate resolved paths.
- Add a concise completion summary linking composition specs, selected presets, tests, visual comparisons, diagnostics, and migration decisions.
- Include same-condition tables for every tested composition: frame time/FPS, AO/mask calls and triangles, CPU/GPU time, bandwidth/memory where available, image/perceptual metrics, temporal behavior, hardware, resolution, AA/AO settings, route/poses, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
