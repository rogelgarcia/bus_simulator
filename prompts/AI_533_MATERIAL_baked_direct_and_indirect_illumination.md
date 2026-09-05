# Problem

Static sun visibility solves recurring shadow-caster work but does not provide bounced illumination. Cycles can bake direct and indirect diffuse contributions for static receivers, yet careless lightmap integration would paint shared materials, double-apply sun shadows, bake tone-mapped final color, lose PBR response, create atlas seams, or incorrectly imply that surface lightmaps can illuminate the moving bus.

Baked direct illumination may offer little benefit beyond the static depth cache and runtime sun shading, while baked indirect irradiance may materially improve grounding and reduce reliance on full-screen AO. Those outcomes must be separated and measured rather than assumed.

# Request

Implement optional, independently switchable static direct and indirect illumination channels for static world receivers using the AI 529 Cycles compiler and AI 530 payload system. Integrate them into the linear PBR lighting composition from AI 527 without changing shared base PBR textures or the dynamic bus-shadow contract.

## User clarification — September 4, 2026

- Preserve the current renderer and expose separate configuration-menu opt-ins.
- Blender brightness and color are intentionally allowed to differ; do not retune
  illumination to match the current renderer.
- Start with high-resolution maps at the baked-shadow texel density where useful.
- Use a moderate first bake for engine assessment, then increase samples later.
- Use the existing Blender installation; headless is preferred. Do not download Blender.

## First implementation pass

This remains an assessment preview, not a completed production acceptance record.
The implementation and current limitations are documented in
[`receiver_lightmaps.md`](../specs/graphics/receiver_lightmaps.md).

- [x] Deterministic planar charts, per-instance coordinates, padding and explicit mips.
- [x] Independent Cycles direct and indirect compiler outputs with receiver albedo excluded.
- [x] Linear PBR material integration, independent Options toggles, safe current-renderer fallback.
- [x] Runtime source/profile validation, staging, geometry restoration and resource disposal.
- [x] Shader views and offline atlas/occupancy/padding/provenance/precision inspection.
- [x] Exact source agreement between two clean exports and an independent live city,
  including runtime shadow-hook isolation, authored shadow-sidedness, ornament readiness,
  and idempotent material-variation normalization.
- [x] Finish the corrected 64-sample assessment bake and install validated assets.
- [x] Record five-mode city measurements, captures and separate direct/indirect decisions.
- [ ] Complete broader route/seam/material/instance and bus-shadow validation.
- [ ] Complete high-sample reference comparison and expanded-coverage residency policy.

First-pass evidence: [assessment report](../tests/artifacts/screens/illumination_533/report.md).
The installed 64-sample bake took 800.59 seconds. All five real-city modes,
source-change fallback, release on disable, 52 focused Node checks, material/mip
GPU checks and the Options UI passed. Indirect remains opt-in for assessment;
direct remains experimental, with promotion deferred because this sparse sunny
view does not establish a quality or performance benefit beyond cached shadows.
The prompt stays open for the remaining acceptance work above.

### Loading correction — September 4, 2026

- [x] Replace runtime offline-package generation with exact identity extraction,
  share pending source checks across channel toggles, deduplicate shared texture
  source captures, propagate cancellation, and expose bounded validation progress.
- [x] Verify real Options activation, cancellation and saved-toggle startup with
  both installed channels active; retain exact source compatibility checks.

The corrected source checks took approximately 9-12 seconds in the recorded runs;
map preparation is reported separately and can take longer. These are diagnostic
observations, not the controlled benchmarks requested by AI 548. Evidence is under
`tests/artifacts/screens/illumination_533/loading/`, with 54 passing focused Node
checks and separate menu/startup browser checks. The previously open user's scene
could not be inspected directly; a reload is required to pick up corrected code.

- [x] Fix default-page source mismatch caused by automatic core tests leaving a
  dummy ornament in the live template cache; restore test overrides in `finally`
  and cover ordinary Welcome/bus-selection/Options activation with core tests on.

The default-flow reproduction isolated four substituted capital meshes. Restoring
the real ornament produced the original direct and indirect channel identities
and both channels activated. Existing maps and compatibility checks are preserved.

### Disabled-map caching — user follow-up

- [x] Keep loaded direct and indirect maps in CPU/GPU memory when both controls
  are disabled, like the shadow cache. Restore normal geometry/shading while off;
  reuse compatible maps and validated source identity on re-enable. Cancel
  unfinished work and retain cleanup on invalidation, city change, context loss
  and final disposal. This supersedes the earlier release-on-disable behavior.

The default-page off/on regression retained the same two GPU resources with no
new map requests or source exports; re-enabling took 1.1 seconds in that run.
The separate cache lifecycle regression passed cancellation and teardown cleanup.
Evidence: `tests/artifacts/screens/illumination_533/loading/cache-reuse.json` and
`tests/artifacts/screens/illumination_533/cache-lifecycle-validation.log`.

### Linked illumination controls — user follow-up

- [x] Add a chain-link icon centered beside the direct and indirect switches,
  enabled by default. While linked, either switch sets both values in one update;
  unlinking restores independent control. Relinking uses the top indirect value.
- [x] Persist the link preference with lighting settings/presets, restore linking
  on Reset, and verify keyboard interaction, Save/Cancel behavior and placement.

## Execution gate

- Do not start until AI 527 through AI 532 are DONE.
- Use only the authoritative resolved-city export, compiler, payload, static shadow, and hybrid bus contracts already established.
- Do not remove or retune AO in this prompt; AI 534 owns that measured decision.

Tasks:
- Define deterministic receiver identity and a per-instance/per-chunk UV/lightmap mapping that supports roads, terrain, curbs, sidewalks, walls, roofs, buildings, props, and other approved static receivers.
- Resolve shared geometry and instancing explicitly through deterministic atlas mappings, controlled receiver duplication, world/chunk-space data, or another measured representation. Do not let shared base UVs force different instances to share lighting.
- Generate bake UVs/atlases deterministically with stable island ordering, texel density, rotation policy, padding/dilation, guard bands, mip safety, chunk boundaries, and provenance back to runtime receiver IDs.
- Validate Three.js/Blender transform, normal, tangent, UV-origin, winding, and receiver-material parity before a production bake.
- Use Blender 5.2.1/Cycles CPU through AI 529 with separate linear outputs:
  - diffuse direct only, with receiver color/albedo contribution explicitly excluded or documented according to the AI 527 composition contract;
  - diffuse indirect only, preserving physically relevant bounce color while avoiding multiplication by receiver base color twice.
- Do not use Combined/final-color baking. Keep specular, clear coat, reflection, transmission, emissive, exposure, tone mapping, and post effects at runtime unless a later dedicated prompt owns them.
- Keep direct and indirect channels logically and physically separable even if later packed. Allow either to be absent.
- Compare at least these measured configurations:
  - current engine only;
  - static sun cache plus runtime direct lighting;
  - baked direct plus cached visibility where composition is valid;
  - baked indirect plus runtime direct/cached visibility;
  - baked direct and indirect together.
- Ship baked direct only if it provides a justified quality/performance or consistency benefit beyond cached visibility and does not unnecessarily freeze runtime material/sun behavior. It is acceptable for the evidence to retain runtime direct sun and ship only indirect irradiance.
- Apply baked irradiance in the material lighting stage, never as a final-color overlay. Preserve runtime albedo/roughness/metalness response and prevent baked diffuse light from incorrectly illuminating metals/specular-only terms. Per AI 527, a scalar irradiance texel cannot claim to preserve a perturbed runtime shading normal: retain that receiver's overlapping live diffuse term unless this AI implements and validates a directional-irradiance representation evaluated with the runtime normal.
- Keep the moving bus outside static receiver lightmaps. It continues to use current runtime direct/IBL lighting plus the static/dynamic shadow visibility from AI 532; do not claim dynamic GI for the bus.
- Define named lighting-profile compatibility for sun, sky/IBL, environment intensity/color, material inputs relevant to bounce, and channel settings. A mismatched profile must not activate.
- Package/stream through AI 530 with deterministic quantization, measured precision, compression, mip generation, async upload, residency, and disposal.
- Add debug views for receiver IDs, UV islands, atlas/chunk occupancy, direct, indirect, combined linear contribution, invalid/unmapped texels, padding, mip level, seams, and current-vs-baked difference.
- Validate large surfaces, thin trims, vertical walls, rooflines, overhang/interior thresholds, adjacent chunks, repeated/shared instances, texture seams, low-resolution mips, city edges, and material categories.
- Benchmark bake time, atlas efficiency, disk/compressed size, download/decode/upload, GPU memory, shader cost, full-frame cost, and visual effect at AI 527 lab/route cases.

Acceptance requirements:
- Direct and indirect channels are independently authored, hashed, loaded, debugged, enabled, and invalidated.
- Shared PBR texture assets remain untouched; lighting is per resolved receiver/instance/chunk.
- No albedo, AO, shadow, exposure, or tone-mapping contribution is applied twice.
- Current mode and cities with no lightmaps render through the existing engine unchanged.
- The completion record makes an evidence-based ship/defer decision for direct lightmaps separately from indirect irradiance.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_533_MATERIAL_baked_direct_and_indirect_illumination_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking format/spec updates, bake profiles, atlas/receiver mapping, runtime material integration, debug views, tests, visual artifacts, and direct/indirect ship decisions.
- Include same-condition configuration tables with frame time/FPS, shader/pass cost, GPU memory, atlas efficiency, raw/packed/compressed sizes, load/decode/upload times, bake duration, visual-error/perceptual metrics, hardware, Blender signature/settings, game resolution/settings, route/poses, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
