# Project Tools

Registry of scripts under `tools/`. When adding a new tool, register it here.

| Name | Path | Purpose | Run |
|---|---|---|---|
| compareBusModels | `tools/compareBusModels.mjs` | Compare coach/city bus model offsets from wheel centers | `node tools/compareBusModels.mjs` |
| computeTreeConfig | `tools/computeTreeConfig.mjs` | Compute tree orientation/size metadata and write `TreeConfig.js` | `node tools/computeTreeConfig.mjs` |
| verifyTreeModels | `tools/verify_tree_models.mjs` | Verify tree model base alignment offline | `node tools/verify_tree_models.mjs` |
| downloadRapierDocs | `tools/download_rapier_docs.sh` | Download Rapier.js 3D API docs into `docs/rapier/` | `bash tools/download_rapier_docs.sh` |
| start | `tools/start` | Start the mesh fabrication live server on the project-standard port | `./tools/start` |
| redirectExportDetector | `tools/redirect_export_detector/` | Detect redirect re-export shim modules | `node tools/redirect_export_detector/run.mjs` |
| pbrMaterialImporter | `tools/pbr_material_importer/` | Import and normalize PBR materials from `downloads/` into local-only `assets/public/pbr/` | `python3 tools/pbr_material_importer/run.py` |
| assetSync | `tools/asset_sync/` | Replace this worktree `assets/`, `downloads/`, and `docs/` with symlinks to sibling root repo folders under `../../bus_simulator/` | `node tools/asset_sync/run.mjs` |
| citySpecExporter | `tools/city_spec_exporter/` | Export authoritative JS city specs to JSON under `tests/artifacts/` | `node tools/city_spec_exporter/run.mjs` |
| staticVisibilityBaker | `tools/static_visibility_baker/` | Bake and validate the `bigcity2` static potential-visibility set | `node tools/static_visibility_baker/run.mjs` |
| illuminationBakeExporter | `tools/illumination_bake_exporter/` | Export and validate the deterministic resolved-city illumination bake-input package | `node tools/illumination_bake_exporter/run.mjs` |
| illuminationBakeCompiler | `tools/illumination_bake_compiler/` | Verify the pinned Blender 5.2.1 LTS toolchain and compile validated illumination bake-input packages into deterministic Cycles CPU proof intermediates | `node tools/illumination_bake_compiler/run.mjs` |
| staticSunDepth | `tools/static_sun_depth/` | Compile guarded RG8 fixtures; publish authenticated shadow caches under `assets/baked_lighting/shadows/`; resume the deterministic Part A workflow; and run strict production/Lab Scene current-versus-cache validation | `node tools/static_sun_depth/run.mjs --help`; `node tools/static_sun_depth/finish_part_a.mjs --help`; `node tools/static_sun_depth/validate_lab.mjs --help` |
| illuminationPackage | `tools/illumination_package/` | Pack, inspect, verify, and atomically promote deterministic browser-loadable illumination containers | `node tools/illumination_package/run.mjs --help` |
| illuminationPackageProfile | `tools/illumination_package/profile.mjs` | Measure same-condition package lifecycle and WebGL2 format/upload behavior without downloading a browser | `node tools/illumination_package/profile.mjs --help` |
| optionsPresets | `tools/options_presets/` | Export/import Options presets and promote to defaults | `node tools/options_presets/promote_to_defaults.mjs path/to/preset.json --write` |
| textureCorrectionPipeline | `tools/texture_correction_pipeline/` | Run deterministic plugin-based PBR texture correction config generation (class baselines + guard plugins) with optional map QA + headless capture harness analysis | `node tools/texture_correction_pipeline/run.mjs` |
| runSelectedTest | `tools/run_selected_test/` | Run a selected test target via `tests/.selected_test` for fast AI/dev iteration | `node tools/run_selected_test/run.mjs` |
| meshFabricationLiveServer | `tools/mesh_fabrication_live_server/` | Serve mesh fabrication screen + `/api/mesh/current` with conditional `ETag`/`Last-Modified` responses for 1s polling | `python3 tools/mesh_fabrication_live_server/run.py` |
| meshFabricationHandoffFormatter | `tools/mesh_fabrication_live_server/format_handoff_json.mjs` | Format mesh handoff JSON deterministically and inline small arrays on a single line | `node tools/mesh_fabrication_live_server/format_handoff_json.mjs --file assets/public/mesh_fabrication/handoff/mesh.live.v1.json` |
| meshFabricationBusTireExporter | `tools/mesh_fabrication_live_server/export_bus_tires_to_handoff.mjs` | Extract representative city/coach bus tire meshes from OBJ/GLB and write mesh-fabrication compiled-topology handoff JSON for topology inspection | `node tools/mesh_fabrication_live_server/export_bus_tires_to_handoff.mjs --out assets/public/mesh_fabrication/handoff/mesh.live.v1.json` |
| meshFabricationDoubleDeckerTireExporter | `tools/mesh_fabrication_live_server/export_double_decker_tire_to_handoff.mjs` | Extract a representative double-decker bus tire mesh from GLB and write mesh-fabrication compiled-topology handoff JSON (live + backup) | `node tools/mesh_fabrication_live_server/export_double_decker_tire_to_handoff.mjs` |
| promptNameValidator | `tools/prompt_name_validator/` | Validate AI prompt folder placement and naming conventions; print next prompt id (`--next-id`) | `node tools/prompt_name_validator/run.mjs` |
| shaderPolicy | `tools/shader_policy/` | Scan `.js`/`.mjs` files for inline shader source assignments and enforce loader-only source policy | `node tools/shader_policy/run.mjs` |
| referenceImageInspector | `tools/reference_image_inspector/` | Inspect reference photos: size, scaled crops, average colours and row/column luminance profiles for measuring facade grids | `node tools/reference_image_inspector/run.mjs --file <png> --info` |
| facadeElevationValidator | `tools/facade_elevation_validator/` | Compare a rendered building elevation against its reference photo and report which proportions do not match | `node tools/facade_elevation_validator/run.mjs --ref <png> --shot <png>` |
| modernBankPbr | `tools/modern_bank_pbr/` | Generate the modern_bank PBR sets (burnt cement panel base, bronze anodized curtain wall skin) into `assets/public/pbr/` | `node tools/modern_bank_pbr/run.mjs` |
| worktreeCreateAndSync | `tools/worktree_create_and_sync/` | Create/reuse a named worktree and run shared-path symlink sync (`assets/`, `downloads/`, `docs/`) inside it | `bash tools/worktree_create_and_sync/run.sh <name>` |
| grassMaterialBaker | `tools/grass_material_baker/` | Deterministically bake the matched low-cut grass surface maps, cluster atlas, manifest, and Blender source | `blender --background --python tools/grass_material_baker/blender_bake.py -- <Grass004 folder> <output folder>` |
| grassLabCapture | `tools/grass_lab_capture/` | Capture deterministic UI-free native-4K Grass Lab PNG evidence and cost/camera metadata | `node tools/grass_lab_capture/run.mjs --phase=before` |
