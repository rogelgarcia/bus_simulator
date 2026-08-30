# Problem

Static sun visibility solves recurring shadow-caster work but does not provide bounced illumination. Cycles can bake direct and indirect diffuse contributions for static receivers, yet careless lightmap integration would paint shared materials, double-apply sun shadows, bake tone-mapped final color, lose PBR response, create atlas seams, or incorrectly imply that surface lightmaps can illuminate the moving bus.

Baked direct illumination may offer little benefit beyond the static depth cache and runtime sun shading, while baked indirect irradiance may materially improve grounding and reduce reliance on full-screen AO. Those outcomes must be separated and measured rather than assumed.

# Request

Implement optional, independently switchable static direct and indirect illumination channels for static world receivers using the AI 529 Cycles compiler and AI 530 payload system. Integrate them into the linear PBR lighting composition from AI 527 without changing shared base PBR textures or the dynamic bus-shadow contract.

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
