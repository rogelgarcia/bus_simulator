# Problem

The game has global HDRI reflections but no dedicated local city reflection
captures. Glass, polished metal and glossy bus paint therefore do not reflect
the actual nearby facades, road and sky openings convincingly. Diffuse GI
lightmaps and the bus probes in AI 550 cannot supply these specular reflections.

# Request

Execute third, after AI 549 and AI 550, for daytime-shortlist item 2. Add local
baked reflection probes for static surroundings, with camera-dependent PBR
evaluation while playing. Preferred strategy: **baked** for static reflection
content; selective **hybrid** updates only where a measured use case justifies
their cost. Ordinary live sampling does not imply live recapture.

Tasks:

- Capture representative daylight city surroundings at useful local positions
  and publish roughness-filtered reflection data through the existing asset
  and lighting-profile lifecycle. Include supported static world detail and
  sky; do not bake the moving bus into an otherwise static reflection source.
- Define spatial influence, overlap/blending, appropriate local parallax
  correction and a global HDRI fallback. Reflective surfaces and the moving bus
  must transition between probe regions without abrupt brightness, orientation
  or reflection changes. Account for large surfaces spanning several regions.
- Apply the local environment to compatible glass, metal and glossy paint,
  respecting each material's roughness, Fresnel response, coating, tint and
  existing intensity policy. Preserve AI 549's Burban, B Glass and Terra & Mar
  glass repair and AI 550's bus material integration and diffuse GI.
- Keep specular reflection data separate from diffuse probes and lightmaps.
  Replacing an environment source must not accidentally add or remove a second
  diffuse-ambient contribution. Define capture exposure/color-space handling,
  exclusion of self-capture feedback, and supported treatment of transparent
  surfaces in the captured scene.
- Define a bounded authoring/capture process, resolution and coverage budgets,
  stale geometry/material/lighting detection, publication, streaming, cache
  eviction and explicit fallback. Avoid an uncontrolled cube render per object
  or per frame. Verify bindings after asynchronous asset loading and scene
  changes rather than assuming a new material inherits local reflections.
- Document reflection limits clearly: static captures do not show the moving
  bus or traffic in another building's glass, are not exact mirrors, and local
  parallax correction does not replace view-dependent refraction. Any optional
  dynamic update must have an explicit use case and measured budget; SSR,
  planar mirrors and general dynamic capture are not required by this prompt.
- Update material/illumination specs and the lighting reference with actual
  coverage, influence/freshness behavior, composition and limitations. Expose
  only useful quality choices to players; keep capture diagnostics in dev tools.

## Acceptance and evidence

- Use a daylight street with distinctive neighboring facades. Compare global
  HDRI only against local captures at identical camera, sun, exposure and
  material settings. Reflections must visibly correspond to nearby landmarks.
- Include Burban as the primary building case, B Glass and Terra & Mar as
  regressions, plus City Bus, Coach and Double Decker. Compare grazing and
  near-normal views, different roughnesses and a camera/vehicle path through
  probe boundaries. Confirm diffuse GI and direct shadows remain consistent.
- Test capture publication/loading, stale-profile rejection, region transitions,
  HDRI fallback, material lifecycle and bounded resources. Inspect seams,
  wrong-space reflections, overbrightness and large-surface parallax errors.
- Save prompt-specific evidence under
  `tests/artifacts/screens/ai551_local_reflection_probes/`.
- Measure full-frame cost, probe memory/residency and capture time separately.
  Compare representative gameplay coverage and quality against global HDRI;
  offline bake time must not be presented as saved runtime frame time.

## Starting references

- [Lighting reference](../specs/graphics/lighting_enhancement_reference.md), [illumination composition](../specs/graphics/illumination_framework.md), and [IBL integration](../src/graphics/engine3d/lighting/IBL.js).
- [AI 549 glass appearance](AI_graphics_549_WINDOWS_architectural_glass_appearance_and_baked_transmitted_sunlight.md) and [AI 550 bus GI/materials](AI_DONE_graphics_550_VEHICLES_baked_diffuse_probes_and_bus_material_readiness_DONE.md).
- [Window materials](../specs/windows/WINDOWS_MATERIALS_AND_FINISH_SPEC.md) and [runtime window material construction](../src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js).

## On completion

- Mark the AI document as DONE in the first line only when all required work is complete.
- Rename in `prompts/` to `AI_DONE_graphics_551_MATERIAL_local_baked_reflection_probes_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change and links to evidence.
- Include a same-condition before/after performance table: frame time/FPS,
  relevant CPU/GPU pass time, draw calls, resident/visible probes and texture
  memory, plus offline capture time separately. State hardware, resolution,
  settings, workload/camera, warm-up, sample count and statistic. Label missing
  metrics `not measured` with a reason; projections do not replace measurements.
