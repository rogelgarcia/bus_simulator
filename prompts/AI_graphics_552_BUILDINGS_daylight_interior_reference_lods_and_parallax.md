# Problem

Daylight storefronts need convincing interior depth and bounced illumination
through glass without the city-wide cost of fully detailed rooms everywhere.
Existing parallax panels and minimal physical shells do not establish a shared
high-fidelity reference from which lower LODs can be derived. The user wants a
high-fidelity scenario first, lower-detail versions of it, and parallax at
selected locations for maximum visual quality.

The user specifically requested that the interior geometry strategy be stopped
and verified before implementation. Parallax must influence that strategy from
the outset, not be added after the room layout and LODs are already fixed.

# Request

Execute fourth, after AI 549, AI 550 and AI 551, for daytime-shortlist item 3.
Preferred strategy: **hybrid** overall — baked static daylight GI, authored
geometry/derived representations, runtime LOD selection and parallax, and live
glass/reflection response. Build on AI 521's BF2 interior model instead of
creating a competing authoring system. Night-focused fixtures are out of scope.

## Phase A — geometry and representation review; required stop

Tasks:

- Inspect AI 521, the BF2 engine/model/UI and curved-run specifications, and
  existing physical-room/parallax implementations. Identify what already ships
  and what is planned. Map this bounded scenario and its reusable authoring
  requirements onto AI 521; leave unrelated requirements in that prompt open.
- Propose one representative high-fidelity daylight storefront/lobby scenario,
  using Burban's curved podium as the preferred demanding case and a planar
  comparison. Reuse existing assets when suitable. Show reference images used
  for the proposal with provenance, and create a reviewable plan, cross-section
  and camera/sightline diagrams before changing production geometry or shaders.
- Specify which parts remain real geometry at each LOD: facade openings, room
  depth, floors/ceilings, structural columns, partitions, entrance reveals and
  close silhouette/occlusion features. Identify the exact proposed spots for
  parallax, their represented depth and valid distance/view-angle ranges. Curved
  bays must respect local normals and arc-length coordinates; one flat room
  image stretched across a curved frontage is not an acceptable default.
- Compare the proposed physical, reduced-geometry and parallax representations
  at close/oblique, middle and distant views, including camera movement,
  self-occlusion, opposite openings, transparent-glass ordering, perceived scale
  and expected LOD transitions. Explain where parallax fails and geometry must
  be retained. Decide how baked daylight remains consistent across representations
  without applying fresh GI to imagery that already contains the same lighting.
- Propose measurable visual/performance budgets and the source-of-truth asset
  strategy. Lower LODs and parallax content must derive from the same approved
  high-fidelity scene and lighting profile rather than unrelated room textures.
- Save the proposed strategy in the relevant building/interior specs, explicitly
  labeled proposed. Present the concrete design and tradeoffs to the user and
  **stop for explicit approval of the interior geometry/LOD/parallax strategy**.
  This gate comes from the user's request. Do not fabricate the final reference
  interior or implement the production model, renderer, UI or LOD system before
  approval. Research, diagrams and existing-scene inspection may proceed.

## Phase B — after explicit approval

- Create the approved high-fidelity reference scene in Building Fabrication 2
  and establish its daytime visual target before deriving lower LODs. Use real
  interior surfaces and selective props sufficient for convincing spatial depth.
- Apply the existing bake framework to daylight entering the actual geometry:
  sky obstruction, visible wall/floor/ceiling bounce, material color transfer and
  natural falloff into the room. Reuse supported glass transport from AI 549
  and reflection integration from AI 551. Fix actual bake coverage/material
  reconstruction defects; do not conceal an unlit room with emission or AO.
- Derive lower-geometry versions and the approved localized parallax content
  from that reference. Preserve recognizable layout, depth cues, light gradients
  and color balance across LODs. Define stable distance/quality transitions and
  fallback outside parallax's valid angles; avoid sliding rooms, mirrored views,
  disappearing columns, black gaps, flat opaque walls behind clear glass or
  doubled baked illumination.
- Integrate only the necessary reusable BF2 authoring and persistence slice
  with AI 521: materials, stable room/face identity, curved coordinates, LOD and
  representation choices must survive normalization, clone/import/export,
  reload, catalog placement and runtime generation. Update the engine/model/UI
  and lighting specs with the approved and implemented behavior.
- Verify scalability using repeated storefronts in a representative daytime
  city block. Record remaining AI 521 work explicitly; completing this bounded
  scene does not automatically complete its entire interior authoring system.

## Acceptance and evidence

- Record the user's Phase A approval and the approved design before Phase B.
- Use `tests/headless/harness/scenarios/scenario_building_showcase.js` and
  `tests/headless/visual/specs/harness_building_showcase_capture.pwtest.js`.
  Produce at least three distinct final 3840x2160 screenshots: straight-on
  front, three-quarter and a low-angle close-up from the building base upward.
  Use a fully loaded HDRI as both visible background and reflection source.
  Accompany final captures with the actual labeled source reference images.
- Save scene captures, comparisons, diagrams and reports under
  `tests/artifacts/screens/buildings/<building-id>/ai552/` and reference copies
  under `tests/artifacts/screens/buildings/<building-id>/references/`, preserving
  originals. Follow project asset/provenance and Blender-session rules.
- Add matched LOD0/lower-LOD/parallax comparisons from near/oblique, middle and
  far cameras, plus a movement sequence across transitions and an interior
  detail view. Prove daylight GI is visible separately from reflection and
  exposure changes. Include the three AI 549 buildings as glass regressions
  where shared behavior changes.
- Run meaningful checks for the changed authoring/persistence, curved-room
  coordinates, representation transitions, lighting freshness/composition and
  resource lifecycle. Compare both the existing baseline and the high-fidelity
  scene against the optimized city-block result under identical conditions.

## Starting references

- [AI 521 interior authoring](AI_buildings_521_BUILDINGS_transparent_storefront_interior_authoring.md) and [lighting reference](../specs/graphics/lighting_enhancement_reference.md).
- [BF2 engine](../specs/buildings/BUILDING_2_SPEC_engine.md), [model](../specs/buildings/BUILDING_2_SPEC_model.md), [UI](../specs/buildings/BUILDING_2_SPEC_ui.md), and [curved runs](../specs/buildings/BUILDING_2_CURVED_RUN_SPEC.md).
- [Burban facade](../specs/buildings/BURBAN_REFERENCE_FACADE_SPEC.md), [window mesh/interior behavior](../specs/window_mesh_specification.md), and [window materials](../specs/windows/WINDOWS_MATERIALS_AND_FINISH_SPEC.md).
- [Receiver lightmaps](../specs/graphics/receiver_lightmaps.md) and [illumination composition](../specs/graphics/illumination_framework.md).

## On completion

- Phase A alone is an intentional review stop, not completion of this prompt.
- Mark the AI document as DONE in the first line only after approved Phase B and
  all required acceptance work are complete.
- Rename in `prompts/` to `AI_DONE_graphics_552_BUILDINGS_daylight_interior_reference_lods_and_parallax_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change and links to evidence.
- Include a same-condition performance table for baseline, high-fidelity and
  optimized scenes: frame time/FPS, whole-frame and interior draw calls and
  triangles, relevant CPU/GPU time, visible rooms, light/probe count and texture
  memory. State hardware, resolution, graphics settings, workload/camera,
  warm-up, sample count and statistic. Label unavailable metrics `not measured`
  with a reason; projections do not replace measurements.
