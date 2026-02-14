# DONE

#Problem

The game currently has multiple competing ways to define and apply materials/textures:

- A PBR material catalog exists, but it is organized as a mostly flat list and primarily uses “wall/surface” flags rather than real-world material classes.
- Inspector/debug tooling still exposes **non-PBR “plain” texture collections** (example: Building Walls) that have only a base color and no normal/roughness/metalness/AO information.
- Some systems accept raw texture URLs (legacy building wall textures), which encourages per-object/per-feature special cases and makes lighting unpredictable.

This causes visual inconsistency across the scene:
- materials respond differently to the same lights/IBL
- overly saturated/cartoonish surfaces
- roughness/specular response varies unpredictably
- artists end up “tweaking per object”, which does not scale

We want to start enforcing a “catalog-first” approach as Phase 1 of the material normalization pipeline:
- all building/ground/prop materials must come from the PBR catalog
- PBR entries must be grouped into human-friendly **material categories/classes** (asphalt, concrete, brick, grass, etc.)
- remove non-PBR texture collections from UI/tools (especially legacy building wall textures)
- create per-texture/per-folder configuration that defines the catalog metadata for each PBR texture set

# Request

Implement **Phase 1** of `specs/materials/PBR_MATERIAL_NORMALIZATION_PIPELINE_SPEC.md`, with a focus on making the game **catalog-first** and organizing PBR materials by **categories/classes**.

Tasks:
- Update/add specifications under `specs/materials/` to define:
  - the canonical PBR catalog schema (what metadata each PBR entry must have),
  - the list of material categories/classes used by the game (first pass),
  - how UI pickers present categories (sections) rather than a single flat “PBR collection”.
- Define the first-pass material categories/classes (examples; adjust as needed based on available textures):
  - asphalt
  - concrete
  - brick
  - plaster/stucco
  - stone
  - metal (painted vs bare if distinguishable)
  - roof_tiles
  - pavers
  - grass
  - sand/gravel/ground
- Inspect every existing PBR texture set under `assets/public/pbr/` and assign it to exactly one category/class.
- For each PBR texture set folder, create a local config file (inside the folder) that defines the catalog entry for that texture set (first pass). The config must include at least:
  - stable `materialId`
  - label/name
  - category/class assignment
  - usage flags (e.g., buildingEligible / groundEligible)
  - map filenames (baseColor/normal/orm, plus optional AO/roughness/metalness/displacement if the set uses non-standard names)
  - default tiling scale (tile meters) and any other canonical per-material defaults needed by the engine
  - a place for future normalization metadata (e.g., “base roughness intent”, albedo notes) even if not enforced yet
- Refactor the runtime PBR catalog so it is driven by these per-folder config files (no more hardcoded list as the source of truth).
  - If there is an existing global manifest in `assets/public/pbr/`, keep it only if it still serves a purpose; the runtime catalog must prefer the per-folder configs as canonical.
- Make the game catalog-first (without implementing a “detection tool”):
  - Remove or disable all non-PBR wall texture options exposed to users/tools (example: Inspector “Building Walls” collection).
  - Migrate building wall selection to reference PBR `materialId`s only.
  - Ensure any legacy building wall texture URLs are no longer used by default paths.
- Remove all non-PBR “plain” texture collections from inspector/tool UI where they overlap with PBR materials.
  - Specifically: remove the “Building Walls” collection and any similar collections that are basecolor-only and intended for wall materials.
  - Keep non-PBR textures that are not meant to be PBR surfaces (e.g., procedural windows/sign atlases) if they are outside the scope of “surface materials”.
- Update the relevant pickers/menus so materials are shown grouped by category/class (sections), not a flat list. This includes inspector/debug tools and any building/terrain editors that choose PBR materials.
- Ensure the refactor does not break existing scenes:
  - Provide a deterministic migration mapping from any legacy building styles/material IDs to their new PBR `materialId` equivalents.
  - Preserve old IDs as aliases only if needed for backwards compatibility (implementation-defined).

Manual actions (you will do after implementation):
- Review category assignments for each PBR set (confirm “asphalt vs concrete vs plaster”, etc.).
- Open the main game and inspector/debug tools and verify:
  - only PBR wall materials are selectable for building walls
  - categories render correctly and are easy to browse
  - no missing textures/materials after migration

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_310_MATERIAL_phase1_catalog_first_pbr_categories_and_remove_non_pbr_texture_collections_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added Phase 1 spec for a catalog-first, class-grouped PBR material registry (`specs/materials/PBR_MATERIAL_CATALOG_SPEC.md`) and aligned the pipeline spec.
- Added per-folder PBR catalog config modules under `assets/public/pbr/*/pbr.material.config.js` plus a collector index `assets/public/pbr/_catalog_index.js`.
- Refactored the runtime PBR catalog to consume the per-folder configs and expose class-grouped sections for pickers (`src/graphics/content3d/catalogs/PbrMaterialCatalog.js`).
- Migrated legacy building wall style IDs to deterministic PBR equivalents so legacy wall texture URLs are no longer used by default (`src/graphics/content3d/catalogs/BuildingStyleCatalog.js`).
- Removed the inspector’s non-PBR “Building Walls” collection and grouped PBR materials by class (`src/graphics/content3d/catalogs/TextureInspectorCatalog.js` + `src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js`).
- Updated building + terrain/grass material pickers to show PBR materials grouped by class and stop offering legacy basecolor-only wall textures.
