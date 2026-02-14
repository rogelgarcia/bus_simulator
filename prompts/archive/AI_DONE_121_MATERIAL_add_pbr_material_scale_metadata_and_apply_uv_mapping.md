# DONE

#Problem

PBR materials currently render with an inconsistent perceived scale (e.g., bricks/tiles appear too small on walls/surfaces). The root issue is missing material-level metadata for real-world scale/UV density, so different screens/renderers can’t apply consistent repeat/tiling. Additionally, PBR packs often ship in multiple resolutions (1k/2k/4k), but the app lacks a canonical way to choose a preferred resolution per material.

# Request

Add PBR material metadata that defines real-world scale and preferred resolution, and update rendering/tools so PBR materials map at the correct on-screen/world scale across buildings and inspector/preview screens.

Tasks:
- Extend the PBR material catalog/registry to include per-material metadata:
  - Real-world scale information (e.g., how many meters a single texture “tile” represents).
  - Preferred resolution/variant selection for the available texture files (e.g., prefer 1k by default unless overridden).
  - Keep defaults/fallbacks so existing materials without metadata still render reasonably.
- Update building material usage so the perceived material scale is correct:
  - Buildings using PBR materials should apply repeat/UV scaling based on the material’s real-world scale metadata.
  - Existing non-PBR/legacy building styles must continue to look the same.
- Update inspector/preview tooling so material previews use the same scale rules:
  - Any “material preview sphere/plane” and texture/material inspector views should respect the material’s scale metadata.
  - Ensure consistent lighting and correct color-space handling remain intact.
- Show material metadata in the texture inspector UI:
  - Display the material id/name and key metadata fields (real-world scale, preferred resolution, available maps/variants).
  - Ensure the metadata display is concise and does not clutter the inspector layout.
- Ensure screens can adapt mapping when the target surface dimensions change:
  - When a surface is larger/smaller, the material should tile appropriately rather than appearing “too small” or “too large”.
  - Support a sensible per-material fallback when surface dimensions are unknown.

Verification:
- Buildings using PBR materials no longer show “too small” tiling by default; scale is consistent and predictable.
- Inspector/preview screens show the same material scale behavior as buildings.
- App loads without console errors and browser tests still pass (`tests/core.test.js`).
- Add a minimal pure-logic browser test validating the catalog metadata and the repeat/scale calculation for at least one material (no DOM pointer events required).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_121_MATERIAL_add_pbr_material_scale_metadata_and_apply_uv_mapping`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Added PBR material scale/variant metadata + repeat helpers, applied consistent tiling across buildings and inspector previews, and covered behavior with a small browser test.
