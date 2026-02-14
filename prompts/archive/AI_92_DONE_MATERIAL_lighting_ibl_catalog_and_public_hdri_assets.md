# DONE

#Problem

3D rendering-related code and “content definitions” are currently mixed under `src/graphics/assets3d/`, making it hard to discover where asset definitions live vs where the reusable fabrication/creation engine lives. This slows down iteration (especially for procedural assets, windows, traffic controls, and lighting) because it’s unclear whether a change should go into a reusable engine module or into a specific content/catalog module.

# Request

Introduce a clear first-level split under `src/graphics/` between:
- **Engine**: reusable fabrication/build logic (generators, builders, factories, loaders, shared math/utilities)
- **Content**: asset definitions and catalogs (procedural mesh definitions, catalogs/registries, texture sets/atlases, stable IDs, metadata)

Then apply this split to lighting/IBL as one concrete example (secondary goal).

Tasks:
- Folder division (primary):
  - Create two top-level folders under `src/graphics/`:
    - `src/graphics/engine3d/` for reusable fabrication/creation code.
    - `src/graphics/content3d/` for asset definitions + catalogs.
  - Define clear criteria for what goes into each:
    - **Engine**: generators/builders/factories/loaders/shared math; no hardcoded project-specific catalog IDs.
    - **Content**: catalogs/registries, stable IDs, metadata, and “asset definitions” that select/compose engine capabilities.
  - Migrate a small, representative set of modules first (do not attempt a full repo-wide move in one pass):
    - Procedural traffic light (semaphore) assets: move their catalog/definitions to `content3d`, and any shared fabrication helpers to `engine3d`.
    - Window textures: keep generation logic in `engine3d`, keep inspector-facing catalogs/IDs in `content3d`.
  - Preserve backward compatibility during migration by leaving thin re-export shims at the old import paths (matching existing patterns in the repo), so other modules do not need to be refactored all at once.
  - Ensure the new structure makes it easy to answer: “where is the asset definition?” (content) vs “where is the fabrication engine?” (engine).
- Lighting/IBL example (secondary):
  - Keep IBL implementation as engine code (under lighting/engine area).
  - Move the HDRI file currently at `assets/public/german_town_street_2k.hdr` to `assets/public/lighting/hdri/german_town_street_2k.hdr`.
  - If a preview image is available, store it next to the HDRI in the same folder.
  - Add a `content3d` lighting catalog with stable IDs + URLs (optional preview URL) and switch scenes to reference IBL by catalog ID (not hardcoded paths).
  - Ensure environment textures are cached/reused and not regenerated redundantly across scene transitions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_92_DONE_MATERIAL_lighting_ibl_catalog_and_public_hdri_assets`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added `engine3d/` + `content3d/` split with shims, migrated traffic lights + window texture inspector assets, and refactored IBL to use a content catalog id with moved HDRI asset + per-renderer caching.
