# Problem

Texture usage is inconsistent across the codebase. Some places load textures directly or apply local tiling/shading rules, while others use catalog metadata. Calibration data is also not consistently applied as a shared pipeline across tools/screens.

# Request

Implement one global PBR texture pipeline so every texture consumer resolves materials the same way: from catalog metadata, with tile-size defaults/fallbacks, and with calibration values applied consistently.

Tasks (checkbox tracking for iterative reuse):
- [x] Create a shared framework for material resolution and loading:
  - a single catalog-driven resolver for URLs + metadata (`tileMeters` and fallbacks),
  - a calibration resolver layer that merges calibration values by `materialId`,
  - a shared loader/service that returns a ready-to-use texture/material payload for consumers.
- [x] Define and enforce a single precedence contract for resolved values:
  - catalog defaults as baseline,
  - calibration overrides on top,
  - optional caller-local overrides last (only where explicitly needed).
- [x] Keep calibration non-dynamic at runtime:
  - calibration is loaded during app/session startup (or first use),
  - values are cached for the session,
  - updated calibration files are picked up on next app load/restart.
- [x] Review all code paths that load or resolve textures/materials:
  - identify direct URL usage, ad-hoc texture loaders, duplicated catalog access, and local calibration logic,
  - list/track all migration targets to the shared pipeline.
  - migration targets discovered in current review (keep this list live and expand as needed):
    - [x] `src/graphics/content3d/catalogs/PbrMaterialCatalog.js` (canonical URL + map-file + tile metadata resolver contract).
    - [x] `src/graphics/content3d/catalogs/BuildingStyleCatalog.js` (building style -> PBR material/url gateway).
    - [x] `src/graphics/gui/material_calibration/MaterialCalibrationView.js` (correction config import + calibration override resolution/merging).
    - [x] `src/graphics/gui/material_calibration/MaterialCalibrationScene.js` (`_ensureMaterialTextures`, `_loadTexture`, `_applySlotMaterial`, `_applySlotTiling`).
    - [x] `src/graphics/gui/terrain_debugger/view/TerrainDebuggerView.js` (`_loadTexture`, `_applyGroundMaterial`, biome-tiling calibration rig texture path, displacement-source texture resolution/preload).
    - [x] `src/graphics/gui/grass_debugger/view/GrassDebuggerView.js` (`_loadTexture`, `_applyGroundPbrMaterial`, substrate layer texture resolution).
    - [x] `src/graphics/gui/window_mesh_debugger/view/WindowMeshDebuggerView.js` (`_applyWallMaterial` loader/cache + hardcoded `GRASS_URLS` ground texture path).
    - [x] `src/graphics/gui/window_mesh_debugger/view/WindowMeshDecorationsRig.js` (decoration material texture resolution/loading + UV transforms).
    - [x] `src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js` (`_setPbrMaterial`, `_loadUrlTexture`, tile-metadata preview mapping).
    - [x] `src/graphics/assets3d/generators/buildings/BuildingGenerator.js` (`BuildingWallTextureCache`, `applyWallTextureToGroup`, `makeWallMaterial` texture application).
    - [x] `src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js` (`makeWallMaterial`, `makeTextureMaterialFromBuildingStyle`, UV tiling params from style/url/material id).
    - [x] `src/graphics/gui/building_fabrication/BuildingFabricationScene.js` (consumer path wiring `textureCache` into generator).
    - [x] `src/graphics/gui/building_fabrication2/BuildingFabrication2Scene.js` (consumer path wiring `textureCache` into generator).
    - [x] `src/graphics/gui/building_fabrication2/BuildingFabrication2ThumbnailRenderer.js` (consumer path wiring `textureCache` into generator thumbnails).
    - [x] `src/graphics/gui/sun_bloom_debugger/SunBloomDebuggerView.js` (manual `makePbrMapUrls` + manual `TextureLoader` floor PBR loading).
    - [x] `src/graphics/gui/atmosphere_debugger/AtmosphereDebuggerView.js` (manual `makePbrMapUrls` + manual `TextureLoader` floor PBR loading).
    - [x] `src/graphics/assets3d/generators/TerrainGenerator.js` (legacy direct `assets/public/grass.png` texture load path).
  - explicitly classify non-PBR texture systems as "migrate" vs "out of scope for AI 349":
    - [x] `src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js` (classified as out of scope for AI 349: non-PBR atlas workflow).
    - [x] `src/graphics/assets3d/textures/signs/SignAtlasTextureCache.js` (classified as out of scope for AI 349: sign atlas workflow).
    - [x] `src/graphics/visuals/sun/SunFlareRig.js` (classified as out of scope for AI 349: lens flare sprite workflow).
    - [x] `src/graphics/assets3d/generators/TreeGenerator.js` (classified as out of scope for AI 349: foliage/trunk texture workflow).
- [x] Migrate all identified texture consumers to the shared loader pipeline:
  - remove local/hardcoded texture resolution where applicable,
  - ensure each migrated consumer uses resolved tile sizing from catalog/calibration through the common contract.
- [x] Ensure terrain-related screens/tools (including Terrain Debugger) use the same global pipeline behavior as the rest of the system.
- [x] Add safeguards to prevent regressions:
  - fallback behavior when calibration is missing/invalid,
  - graceful behavior when assets are unavailable,
  - lightweight verification/tests for resolver precedence and representative migrated consumers.
- [x] Add diagnostics/logging hooks (dev-facing) to verify that a material was resolved through the global pipeline and which source supplied each effective value (catalog vs calibration vs local override).

Additional texture-path follow-ups discovered during review (non-blocking for this iteration):
- [x] `src/graphics/gui/terrain_debugger/view/TerrainDebuggerView.js` (`_updateTerrainPbrLegendUi` still reads preview URLs directly from catalog; evaluate whether to route this metadata-only path through pipeline diagnostics).
- [x] `src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js` (`getSelectedTextureMeta` still uses direct catalog URL resolution for `resolvedMaps` preview flags).
- [x] `src/graphics/gui/window_mesh_debugger/view/WindowMeshDebuggerView.js` + `src/graphics/gui/window_mesh_debugger/view/WindowMeshDecorationsRig.js` (shared explicit `TextureLoader` injection is still present; evaluate whether to simplify loader ownership to shared pipeline defaults).

## Grass sequence coordination

- The offline-first grass sequence is tracked by `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and prompts AI 350 through AI 363.
- [x] AI 350 made `debug_tools/grass_debug.html` the canonical Grass Lab, kept its ground/substrate materials on `PbrTextureLoaderService`, and removed the debugger's dormant direct texture-load/cache helper.
- [x] AI 351 added the deterministic low-cut profile and bake-source fixture without adding a material resolver or texture loader; Grass Lab ground/substrate PBR materials remain on `PbrTextureLoaderService`, while AI 352 owns the baked grass material family through the shared pipeline.
- [x] AI 352 registered `pbr.grass_low_cut_maintained_v1` plus its auxiliary far/atlas channels in `PbrMaterialCatalog`, loaded every renderer map through `PbrTextureLoaderService`, applied the shared catalog → calibration → explicit local-override precedence, and added no Grass Lab-local texture loader.
- [x] AI 353 kept `pbr.grass_low_cut_maintained_v1` visible through the existing Grass Lab `PbrTextureLoaderService` path and added only opaque near geometry inside `GrassEngine`; it introduced no texture resolver, loader, or calibration override.
- [x] AI 354 resolved the raised coverage surface through the same Grass Lab `PbrTextureLoaderService`, consumed the catalog payload's `far_coverage.png` auxiliary map as an opaque hard cutout, kept substrate resolution on the shared pipeline, and introduced no local texture resolver or loader.
- [x] AI 355 resolved the mid-cluster material through the existing Grass Lab `PbrTextureLoaderService`, consumed the shared payload's four auxiliary cluster maps in one material, and added no loader, URL resolver, or calibration path. The exact runtime contract is `specs/grass/GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md`.
- [x] AI 356 shared AI 355's atlas material for every localized grass card and resolved the worn `pbr.forrest_ground_01` material through the existing Grass Lab `PbrTextureLoaderService`; it introduced no local loader, URL resolver, or calibration path. The exact contract is `specs/grass/LOCALIZED_GRASS_ACCENTS_V1.md`.
- [x] AI 357 kept every low/default/high V1 validation preset on the already resolved far-surface, cluster-atlas, coverage, and worn-substrate material payloads; it added no texture URL, loader, resolver, calibration override, or gameplay consumer. Its baseline in `specs/grass/GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` is retained as historical evidence and no longer authorizes gameplay after corrective visual review.
- [x] AI 358 corrected `pbr.grass_low_cut_maintained_v2` through the shared catalog, `PbrTextureLoaderService`, and calibration consumers: atlas PBR channels are fully opaque, cutout coverage is a separate `alphaMap`, runtime cards and the material fixture share the zero-emissive response, and pixel-aligned native-4K validation passes. The exact contract is `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`.
- [ ] AI 359 must keep the corrected grass cap, root/thatch edge, and continuous substrate materials on the shared catalog/calibration pipeline while separating physical footprint occupancy from texture alpha and material blending.
- [ ] AI 360 must consume AI 358's shared corrected material payload for the cohesive near mesh and must not add a near-tier resolver, loader, or independent material calibration path.
- [ ] AI 361 must consume the shared atlas/material payload for billboard, middle-patch, and localized-accent rendering and must not add tier-local texture loading or appearance ownership.
- [ ] AI 362 must validate all corrected material consumers without adding another loader; if validation discovers a shared-pipeline obligation, record it here before issuing the V2 approval.
- [ ] AI 363 must migrate the gameplay grass consumer through the same shared catalog/calibration pipeline and remove or deprecate conflicting gameplay-local paths only after verification.
- Every grass-sequence prompt must resolve PBR textures, physical tiling metadata, and calibration through this shared pipeline rather than adding a Grass Lab or gameplay-local loader.
- If a grass-sequence prompt changes a migrated consumer, completes an item tracked here, or discovers another shared-pipeline obligation, it must update this dynamic checklist before that prompt is marked DONE.
- Leave this dynamic AI file in place. Mark only genuinely completed checklist items complete, and retain unrelated pending follow-ups.
- The current gameplay authorization gate is the future `specs/grass/GRASS_LAB_APPROVAL_AI362.json`; the AI 357 approval record remains historical.

## On completion
- For each iteration, only implement tasks that are still unchecked (`[ ]`).
- After implementing a task, mark it as checked (`[x]`) in this file.
- Keep this file active for multiple iterations; do not rename it to a `DONE` filename until explicitly requested.
- Keep the file in `prompts/` (do not move to `prompts/archive/` unless explicitly requested).
