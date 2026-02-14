# DONE

#Problem

`src/graphics/content3d/` currently contains multiple catalog modules scattered across different subfolders (e.g., `lighting/IBLCatalog.js`, `procedural_meshes/ProceduralMeshCatalog.js`, `textures/TextureInspectorCatalog.js`, etc.). This makes it harder to discover “catalog” entry points and encourages inconsistent folder organization over time.

# Request

Move all `content3d` catalog modules into a single folder `src/graphics/content3d/catalogs/` and update imports across the codebase so everything still works.

Tasks:
- Create `src/graphics/content3d/catalogs/` and move all `*Catalog*.js` modules under `src/graphics/content3d/` into it.
- Preserve module APIs and behavior (no functional changes), only reorganize file locations.
- Update all imports/re-exports across `src/` to reference the new catalog paths.
- Keep the `src/graphics/assets3d/*` re-export shims working (if any re-export catalog modules, update them accordingly).
- Keep repo conventions (no extra inline comments, avoid unrelated refactors).

Verification:
- App loads without console errors.
- Browser-run tests still pass (`tests/core.test.js`).
- No broken imports remain (search for old catalog paths and ensure none remain).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_120_REFACTOR_move_content3d_catalogs_to_catalogs_folder`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Moved all `src/graphics/content3d/*Catalog*.js` modules into `src/graphics/content3d/catalogs/` and updated imports + assets3d shims accordingly.
