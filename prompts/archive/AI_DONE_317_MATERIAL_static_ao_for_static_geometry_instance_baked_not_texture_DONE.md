# DONE

## Summary
- Added `ambientOcclusion.staticAo` to persisted AO settings (defaults + sanitization) and preset import normalization.
- Implemented Static AO as per-mesh/per-instance baked geometry attributes (`staticAo`) + MeshStandardMaterial shader patch (ambient-only occlusion + debug view).
- Wired Static AO into `GameEngine` and auto-scales SSAO/GTAO intensities when Static AO is enabled to reduce double-darkening.
- Added Options UI controls under Graphics → Ambient Occlusion and updated AO spec + unit tests.

#Problem

GTAO is expensive, and much of the scene is static (buildings, roads, sidewalks). A large portion of the perceived benefit of GTAO comes from stable contact occlusion on static geometry.

We want a **static/baked AO** approach to reduce runtime cost, but we cannot bake AO directly into shared base textures because:
- many buildings share the same PBR textures
- AO should differ per building instance and per placement (geometry + nearby occluders)
- time-of-day / lighting may change, and the system must avoid “painting” directional shadows into base textures

We need a static AO solution that is **instance-level** (or generated per chunk/mesh), and integrates as an option under the Ambient Occlusion settings.

# Request

Implement a **Static AO** system for static world geometry that is baked/derived per instance (not into shared base textures), and add its controls under **Graphics → Ambient Occlusion**.

Tasks:
- Define and implement a static AO strategy that:
  - is computed once (or infrequently) for static geometry (buildings/roads/props)
  - is stored per-instance/per-generated-mesh (not in shared PBR texture sets)
  - is stable across frames and camera movement (no temporal noise)
  - improves grounding and contact occlusion for static structures
- Provide multiple quality/cost options if appropriate (implementation choice), for example:
  - `Off`
  - `Vertex AO` (stored in vertex colors or per-vertex attribute)
  - `Lightmap AO` (stored in a dedicated AO texture using UV2 or an atlas)
  - Any other feasible option that fits the engine architecture
- Ensure the solution is **not directional shadow baking**:
  - It should represent ambient occlusion (geometry-driven), not sun-shadowing.
  - It should remain reasonable under different light directions/IBLs.
- Integrate under **Graphics → Ambient Occlusion**:
  - Add a “Static AO” section with:
    - mode selector
    - intensity
    - quality controls (if applicable: samples, bake resolution, etc.)
  - Define how static AO combines with SSAO/GTAO:
    - Avoid double-darkening by scaling or clamping when both are enabled.
    - Define a clear composition order (e.g., static AO first, then SSAO/GTAO as dynamic contact).
- Provide a workflow for generation:
  - When/how static AO is generated (on load, on chunk build, on demand)
  - How edits (e.g., BF2 building changes) invalidate and rebuild the AO data
- Add validation/repro:
  - A deterministic debug scene or toggle to verify static AO is applied and stable.
  - Confirm that enabling static AO allows reducing GTAO usage while preserving visual grounding.

Constraints / notes:
- Do not modify/bake AO into shared base textures in `assets/public/pbr/`.
- Prefer storing AO as:
  - vertex color/attribute, or
  - a dedicated per-instance AO texture/lightmap, or
  - another per-instance data channel that does not affect shared materials.
- Keep the system compatible with existing and planned AO features:
  - foliage alpha handling
  - GTAO caching/update-rate
  - bus contact shadow

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_317_MATERIAL_static_ao_for_static_geometry_instance_baked_not_texture_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
