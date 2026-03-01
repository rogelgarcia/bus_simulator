# DONE

# Problem

New PBR textures were downloaded and need to be integrated into the project so they are available in the material system using the existing catalog structure.

# Request

Import the newly downloaded PBR textures into the project with proper organization and catalog registration.

Tasks:
- Move/copy the downloaded PBR texture sets from `downloads/` into the correct project asset location and folder taxonomy used by the material catalogs.
- Keep naming and file structure consistent with current project conventions for PBR sets (albedo/base color, normal, roughness/metalness/AO as applicable).
- Register the imported materials so they appear in the appropriate in-app material picker/catalog sections.
- Ensure preview/thumbnail and metadata wiring are valid for the imported entries.
- Validate that imported materials load correctly at runtime with no missing-map errors.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_447_MATERIAL_import_downloaded_pbr_textures_into_proper_catalog_organization_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_447_MATERIAL_import_downloaded_pbr_textures_into_proper_catalog_organization_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Changes
- Imported and normalized the five new `downloads/*_1k.zip` PBR sets into `assets/public/pbr/<material_slug>/` with canonical `basecolor/normal_gl/arm` map names.
- Copied full original texture packs (`textures/*`) for each new set into their material folders to preserve source map variants and metadata parity.
- Added new PBR material config entries for `beige_wall_001`, `concrete_pavement`, `leather_white`, `terlenka`, and `waffle_pique_cotton` with class/root/eligibility/tile metadata.
- Added correction metadata config files (`pbr.material.correction.config.js`) for all newly imported materials to keep calibration metadata wiring valid.
- Registered all five new materials in `assets/public/pbr/_catalog_index.js` so they resolve through `PbrMaterialCatalog` and appear in material pickers.
- Verified runtime map wiring by resolving each new material definition and confirming `baseColor`, `normal`, and `orm` files exist on disk.
- Ran PBR + core test coverage to confirm no catalog/profile regressions after import and registration.
