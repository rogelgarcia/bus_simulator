# DONE

## Summary
- Add Graphics → Ambient Occlusion options with SSAO controls (intensity/radius/quality) and persistence.
- Integrate SSAO into the post-processing pipeline with live toggling (no reload).
- Add AO settings to options preset export/import.
- Create a shared AO settings object (mode + per-mode settings) for future expansion.

#Problem

The game currently lacks screen-space ambient occlusion (AO). Even with good lighting, bloom, and color grading, the scene can look “flat” compared to raytraced renders because there is little-to-no contact shadowing in creases and at object intersections (e.g., bus-to-road contact, window frames, curb edges, under overhangs).

While the project supports AO inside ORM material textures, that does not provide dynamic, view-dependent contact occlusion for runtime geometry and animated objects.

# Request

Add **SSAO (Screen Space Ambient Occlusion)** as an optional post-processing effect, configurable from the Options UI under the **Graphics** tab.

Tasks:
- Graphics options UI:
  - Add an “Ambient Occlusion” (AO) section under Graphics.
  - Add a user-facing control to enable/disable SSAO.
  - Add advanced SSAO controls (keep defaults sane; expose only what is needed):
    - Intensity/strength
    - Radius (world-ish scale)
    - Quality preset (e.g., Low/Medium/High) OR sample count
    - Optional blur/denoise toggle (or quality preset that implies blur)
  - Persist settings like other graphics options (survive reload).
- Runtime behavior:
  - SSAO applies to the main gameplay renderer/postprocessing pipeline.
  - Toggling SSAO should take effect without a full page reload (unless technically impossible; if so, show a note).
  - SSAO should not “double darken” materials that already use strong baked AO; keep defaults conservative.
- Performance considerations:
  - Provide at least one “Low” quality mode suitable for weaker GPUs.
  - Prefer half-resolution or other optimizations when SSAO is enabled at low quality (if applicable).
  - Avoid excessive noise/shimmering; prefer stable results over aggressive AO.
- Visual correctness:
  - Avoid strong halos around silhouettes and thin geometry; tune bias/thresholds so AO does not bleed into open space.
  - AO should be visible but subtle in sunlight; more apparent in shadowed/indirect areas.
- Scope:
  - Options/UI + postprocessing only; no changes to building/bay generation logic.

## Proposal (optional implementation ideas)
- If a Three.js SSAO/SAO pass is available in the project’s Three version, use it; otherwise implement SSAO as a custom post-processing pass that uses depth (and normals if available).
- Consider adding a “Debug AO” view mode in an existing debug panel to help tune settings.

## Quick verification
- Options → Graphics shows an Ambient Occlusion section with SSAO controls.
- Enabling SSAO produces visible contact occlusion under the bus and around window frames/overhangs without heavy halos.
- Disabling SSAO returns to the baseline look.
- Settings persist after reload.
- Low/Medium/High modes show a measurable performance/quality tradeoff.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_303_UI_graphics_options_ssao_screen_space_ambient_occlusion_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
