#Problem [DONE]

Even with tiled PBR materials, large building faces still show obvious repetition. The Material Variation system includes “anti-tiling assist” as a concept, but it needs a concrete pipeline stage and building fabrication UI controls so users can enable/tune it per building/layer.

# Request

Add a dedicated Anti-tiling stage to the Material Variation pipeline and expose it in the building fabrication UI as an optional, tweakable feature (deterministic per building seed).

Tasks:
- Implement an explicit “Anti-tiling” stage in the Material Variation pipeline that reduces visible repetition while still sampling the same PBR texture set.
  - Ensure the anti-tiling transform is applied consistently to baseColor, normal, and ORM so maps remain aligned.
  - Keep the result deterministic per building using the existing per-building `seed` (and support `seedOffset`/per-layer offsets if the system supports them).
  - Prefer an approach that avoids hard seams; transitions should be smooth (no obvious borders).
  - Provide a quality/performance balance:
    - A “fast” mode (e.g., mirrored repeat and/or single-variant remap).
    - An optional “quality” mode (e.g., stochastic/cell-based variation with blending) if appropriate for the project.
- Expose parameters for the Anti-tiling stage with sensible defaults and safe ranges, such as:
  - `enabled`
  - `mode` (fast/quality or similar)
  - `cellSize` / `macroCellSize` (world/object/UV space, whichever the pipeline uses)
  - `blendWidth` / `transitionSoftness`
  - `rotationAmount` (if using rotated tiles)
  - `offsetAmount` / `jitter`
  - `intensity` (how strongly the anti-tiling disrupts the base pattern)
- Update the building fabrication scene/UI to include an Anti-tiling section within Material Variation settings for applicable layers (at minimum: walls; optionally roofs/floors if Material Variation is shared there).
  - Allow enabling/disabling anti-tiling and editing the key parameters.
  - Ensure settings persist into exported building configs and round-trip correctly when reloading existing configs.
  - Keep backwards compatibility: existing configs without anti-tiling settings behave exactly as before.
- Verification:
  - Anti-tiling noticeably reduces repetition on large wall faces without introducing visible seams.
  - No misalignment between baseColor/normal/ORM after anti-tiling.
  - UI controls work and persist; no console errors.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_141_MATERIAL_add_anti_tiling_pipeline_stage_and_building_fabrication_ui`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Implemented deterministic anti-tiling UV warping (fast/quality) inside `MaterialVariationSystem` and exposed per-layer anti-tiling controls in the building fabrication UI.
