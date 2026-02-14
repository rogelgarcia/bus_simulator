# DONE
#Problem

Several new PBR material packs were added under `downloads/` (primarily `.zip` archives). Right now they are not integrated into the app’s asset tree and cannot be selected/previewed consistently in tools (Building Fabrication / Inspector Room / Texture Inspector, etc.). This slows iteration and encourages ad-hoc references back into `downloads/`, which is against project asset rules.

# Request

Import the new PBR materials from `downloads/` into the application `assets/` tree in a clean, organized structure, and make them available across the app for preview and use:
- Use the smallest available resolution/variant for each material (prefer `*_1k*` over `*_2k*` when both exist) to keep the repo lightweight; only use higher-res files when no smaller equivalent exists.
- Prefer smaller file encodings for the same resource when quality is acceptable (e.g., prefer `.jpg` over `.png` for baseColor/albedo previews), while keeping data maps (normal/roughness/metalness/AO/ORM) in an appropriate format to avoid artifacts.
- Make appropriate “wall/building” materials selectable for building construction (including Building Fabrication).
- Make all imported materials available for inspection/preview via the texture/material inspector tooling.
- Special rule: if a material’s name/id is `grass` (or clearly a grass material), do not expose it as a building material, but do expose it in the texture inspector.

Tasks:
- Scan `downloads/` for new PBR material archives/folders and extract/copy them into an appropriate `assets/` subfolder (respecting asset/licensing rules; keep any attribution/license files alongside the assets).
- When multiple resolutions/variants exist for the same material, import only the smallest one and avoid duplicating the same material at multiple resolutions.
- When the same map is available in multiple encodings (e.g., `.jpg` and `.png`), pick the smaller file that preserves the needed quality and avoid importing both.
- Normalize the imported material structure and naming so each material has a stable id and predictable map filenames/slots (baseColor/albedo, normal, roughness/metalness/AO or ORM, etc.).
- Add a shared catalog/registry so the app can:
  - List all imported PBR materials for preview/inspection tooling.
  - List the subset of materials that are valid for building construction (exclude `grass` materials).
- Integrate building construction to use the catalog-driven materials:
  - Buildings can select a wall material from the imported set (existing styles must continue to work).
  - Building Fabrication UI surfaces the new material options without breaking existing flows.
- Integrate the texture/material inspector tooling to preview any imported material:
  - Ensure correct color space handling (sRGB vs linear) and consistent lighting/environment for preview.
  - Ensure `grass` materials appear here even if they are excluded from buildings.

Verification:
- App loads without console errors after importing the assets.
- Building Fabrication can construct buildings using the new building-eligible materials.
- Texture/material inspection UI can preview all imported materials (including `grass`).
- Browser-run tests still pass (`tests/core.test.js`), and add a minimal registry/categorization test if appropriate.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_116_MATERIAL_import_downloads_pbr_materials_and_expose_in_buildings_and_inspector`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Imported the new 1K PBR material packs into `assets/`, added a shared PBR material registry, exposed eligible materials in Building Fabrication, and exposed all materials in the Inspector Room texture tooling.
