# Problem

The user reports that architectural glazing looks like plastic bottles. The
required buildings are **Burban (`burban`, main acceptance case)**, **B Glass
(`bglass`)**, and **Terra & Mar (`terramar`)**. Burban includes curved glazing;
the canonical B Glass and Terra & Mar silhouettes are planar. Do not assume
that their shared appearance problem has a single geometry cause.

The original daytime-lighting shortlist item 4 proposed baked colored
transmission shadows and caustics. The user's addendum makes convincing glass
surface appearance the main goal. A brighter pattern on a floor does not fix
plastic-looking glass, and diffuse lightmaps cannot replace view-dependent
reflection or refraction.

# Request

Execute this first in the user's sequence **549 -> 550 -> 551 -> 552**
(shortlist items **4 -> 1 -> 2 -> 3**). Improve the three named buildings' glass,
then add a bounded, demonstrable daytime application of static transmitted
sunlight. Preferred strategy: **hybrid** overall; runtime glass response and
baked supported illumination on static receiving surfaces.

Tasks:

- Reproduce and capture the issue on all three buildings, starting with Burban,
  under a loaded HDRI and the game's ordinary daytime settings. Inspect the
  resolved material and generated geometry, including persistence and runtime
  overrides. Compare Burban's lower clear glass and upper reflective glass.
- Diagnose the contributors separately: pane/shell thickness and scale,
  geometric normals and smoothing, curved-run subdivisions, backfaces or
  overlapping panes, reflection/transmission/opacity composition, roughness,
  tint, IOR, and environment intensity. Audit high metalness used as a glass
  reflection control; choose an appropriate dielectric/coated-glass response
  rather than treating all glazing as bulk metal. Current values are suspects,
  not proof of the cause.
- Make Burban read as architectural glazing at street distance and close
  oblique angles, with coherent reflections across curved panes, plausible
  grazing-angle response, restrained distortion, and readable depth through
  clear lower glazing. Apply the appropriate repair to B Glass and Terra & Mar.
  Preserve intended tint, facade rhythm, frame separation, and authored
  massing. Preserve Burban's actual curvature and the other buildings' planar
  topology; do not flatten or curve buildings to conceal a shading problem.
- Establish this improvement using the existing environment/reflection path;
  later AI 551 must not be a prerequisite for demonstrating the surface repair.
  Avoid using brighter global lighting, stronger AO, bloom, or hidden/opaque
  interiors to conceal the defect. Record any remaining empty-interior problem
  for AI 552; do not implement its interior geometry before its review gate.
- Extend the existing bake workflow for a bounded fixed-sun, fixed-glass,
  static-receiver example of colored transmitted shadows and, where the chosen
  glass geometry physically supports it, caustic concentration. Verify that
  the exporter and offline solver actually support those light paths. Preserve
  light-only data, exposure independence, and correct receiver material
  response. Declare the valid geometry/material/sun profile and invalidate stale
  results with an explicit fallback when that profile changes.
- Compose transmitted illumination with existing direct shadows, indirect GI
  and AO without opaque shadow masks incorrectly blocking it or double-counting
  the same energy. Runtime glass/refraction and moving objects remain separate.
  Do not promise dramatic caustics from ordinary clear planar panes. Demonstrate
  the strongest physically justified daylight result in a representative bounded
  case; identify unsupported cases honestly. Surface repair alone does not mark
  an unfinished required transport slice complete.
- Update the window/material and affected building specs with the resolved
  appearance contract and update the illumination specs with supported baked
  transport/composition, limitations and fallback behavior. Reuse the existing
  framework rather than adding an independent lighting system.

## Acceptance and evidence

- Provide matched before/after front, three-quarter and close grazing-angle
  views for all three buildings, plus a camera sweep of Burban's curved lower
  and upper glazing. Keep camera, sun, HDRI, exposure and postprocessing fixed.
  Show the actual source references used and verify environment reflections
  have loaded. The main result must visibly address the user's plastic look.
- Show glass repair alone, transmitted-light contribution alone, and the
  combined result. Prove bake loading, valid receivers, and stale-profile
  handling; a generated file or a virtually identical final screen is not
  sufficient evidence of a visible improvement.
- Use the BF2 building showcase and its capture workflow. Save prompt-specific
  captures, diagnostics and reports under
  `tests/artifacts/screens/buildings/<building-id>/ai549/`; preserve reference
  copies under `tests/artifacts/screens/buildings/<building-id>/references/`.
  For any newly modeled/catalog building, meet the project's three distinct
  3840x2160 final front, three-quarter and base-up views, using the HDRI as both
  visible background and environment, with labeled source references.
- Run focused material/composition, curved-geometry and bake integration checks
  appropriate to the actual changes. Record performance and memory costs under
  matched gameplay conditions; do not silently multiply transmission passes.

## Starting references

- [Lighting reference and execution sequence](../specs/graphics/lighting_enhancement_reference.md).
- [Burban](../specs/buildings/BURBAN_REFERENCE_FACADE_SPEC.md), [B Glass](../specs/buildings/BGLASS_REFERENCE_FACADE_SPEC.md), and [Terra & Mar](../specs/buildings/TERRAMAR_REFERENCE_FACADE_SPEC.md).
- [BF2 engine](../specs/buildings/BUILDING_2_SPEC_engine.md), [model](../specs/buildings/BUILDING_2_SPEC_model.md), [UI](../specs/buildings/BUILDING_2_SPEC_ui.md), and [curved runs](../specs/buildings/BUILDING_2_CURVED_RUN_SPEC.md).
- [Window materials](../specs/windows/WINDOWS_MATERIALS_AND_FINISH_SPEC.md) and [runtime glass construction](../src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js).
- [Receiver lightmaps](../specs/graphics/receiver_lightmaps.md) and [illumination composition](../specs/graphics/illumination_framework.md); inspect the AI 529/530/533 bake lineage and its actual supported transport.
- [Building showcase](../tests/headless/harness/scenarios/scenario_building_showcase.js) and [capture workflow](../tests/headless/visual/specs/harness_building_showcase_capture.pwtest.js).

## On completion

- Mark the AI document as DONE in the first line only when all required work is complete.
- Rename in `prompts/` to `AI_DONE_graphics_549_WINDOWS_architectural_glass_appearance_and_baked_transmitted_sunlight_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change and links to evidence.
- Include a same-condition before/after performance table: frame time/FPS,
  draw calls, triangles, relevant CPU/GPU pass time and memory. State hardware,
  resolution, graphics settings, workload/camera, warm-up, sample count and
  statistic. Label unavailable metrics `not measured` with a reason; projections
  do not replace measurements.
