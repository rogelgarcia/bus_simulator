# DONE

#Problem

PBR materials appear incorrect in the material/texture preview tooling (they load and look correct when applied to buildings, but previews are wrong). Additionally, the brick wall material is broken: it does not render correctly in previews and also fails to load/render correctly in the actual game/buildings. Looks like the brick wall texture files are missing or misconfigured. (resorted to flat version? instead of PBR?)

# Request

Fix PBR material preview rendering so previews match in-game appearance, and fix the brick wall material so it loads and renders correctly everywhere.

Tasks:
- Diagnose and fix why PBR material previews render incorrectly:
  - Ensure preview scene uses the correct material type and map slots (baseColor/albedo, normal, roughness/metalness/AO or ORM).
  - Ensure correct color space handling (sRGB for baseColor/emissive, linear for data maps).
  - Ensure lighting/environment in preview is valid and consistent (IBL/HDRI or equivalent), and tonemapping/exposure matches the main renderer where appropriate.
  - Ensure texture wrap/repeat/UV mapping in preview matches how buildings apply the same materials (including any scale/tiling metadata rules).
- Diagnose and fix the brick wall material end-to-end:
  - Identify which brick material id/spec is used by buildings and previews.
  - Fix any wrong file paths, missing assets, incorrect map assignments, or format issues causing the brick wall to be broken.
  - Ensure the brick wall material renders correctly both in preview and in-game.
- Make the preview pipeline resilient:
  - If a map is missing (e.g., no normal map), preview should still render without console errors.
  - Add clear fallback behavior (use a neutral material or show a “missing maps” state) but do not spam the console.

Verification:
- Preview tooling renders PBR materials correctly and consistently with in-game buildings.
- Brick wall renders correctly both in preview and in-game.
- App loads without console errors related to textures/materials.
- Browser tests still pass (`tests/core.test.js`), and add a minimal test that validates the brick wall material spec resolves to valid URLs/slots and that preview builder assigns expected maps (pure logic, no DOM pointer events required).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_122_MATERIAL_fix_pbr_preview_rendering_and_brick_wall_texture_loading`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Made inspector previews match in-game PBR mapping (correct tiling + slots), added resilient texture loading with clear one-time warnings, and added a small browser test for preview slot mapping.
