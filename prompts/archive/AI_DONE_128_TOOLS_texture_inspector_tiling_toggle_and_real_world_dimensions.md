# DONE

#Problem

The Texture Inspector is missing two key capabilities for validating material/texture usability:
1) There is no toggle to quickly view a texture as “tiled” (repeated) to evaluate seams and repetition.
2) There is no per-texture configuration for real-world dimensions, so the preview can’t represent correct scale. This makes it hard to judge whether textures will look correct when mapped onto buildings/roads.

# Request

Enhance the Texture Inspector UI and viewport preview so users can toggle tiling and edit a texture’s real-world dimensions, with sensible defaults and proportional preview behavior.

Tasks:
- Add a Texture Inspector view option to display textures as tiled:
  - Provide a clear UI toggle (labeled “Tiled”) in the Texture Inspector view.
  - When enabled, the preview should repeat the texture (wrap/repeat) instead of stretching it once.
  - When disabled, keep current single-sample preview behavior.
- Add per-texture real-world dimension configuration:
  - For each texture/material entry, add UI fields to set real-world width/height (in meters, or another consistent unit).
  - If dimensions are not set, initialize from a default value (global default and/or catalog default).
  - Persist the per-texture dimension settings within the app’s config/state (so it survives view refreshes during the session at minimum; do not persist across project reload).

- Keep preview proportions correct after dimension changes:
  - When dimensions are adjusted, the preview area in the viewport must maintain the texture’s real-world aspect ratio (width:height) and size.
  - For tiled mode, ensure repeats are computed from the real-world dimensions so the preview represents correct scale and density.
  - For non-tiled mode, ensure the displayed quad/plane maintains the correct proportion (no squashing/stretching) and size.
- Ensure behavior is consistent with any existing PBR/material scale metadata (if present) and does not conflict:
  - If the texture already has catalog metadata for real-world size, use it as the default starting value.
  - If the user overrides dimensions in the UI, the override should take precedence for preview.

Verification:
- Texture Inspector loads with no console errors.
- “Tiled” toggle works (repeat vs single-sample) and does not affect other tools.
- Real-world dimension controls default correctly, and changing them updates the preview while preserving proportions.
- Browser tests still pass (`tests/core.test.js`), and add a minimal pure-logic test for the repeat/scale/aspect calculation if appropriate.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_128_TOOLS_texture_inspector_tiling_toggle_and_real_world_dimensions`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Added a Tiled checkbox and per-texture real-world size controls to the Texture Inspector, updating the 3D preview to respect scale and adding a small pure-logic test.
