# Project Tools

Registry of scripts under `tools/`. When adding a new tool, register it here.

| Name | Path | Purpose | Run |
|---|---|---|---|
| compareBusModels | `tools/compareBusModels.mjs` | Compare coach/city bus model offsets from wheel centers | `node tools/compareBusModels.mjs` |
| computeTreeConfig | `tools/computeTreeConfig.mjs` | Compute tree orientation/size metadata and write `TreeConfig.js` | `node tools/computeTreeConfig.mjs` |
| verifyTreeModels | `tools/verify_tree_models.mjs` | Verify tree model base alignment offline | `node tools/verify_tree_models.mjs` |
| downloadRapierDocs | `tools/download_rapier_docs.sh` | Download Rapier.js 3D API docs into `docs/rapier/` | `bash tools/download_rapier_docs.sh` |
| redirectExportDetector | `tools/redirect_export_detector/` | Detect redirect re-export shim modules | `node tools/redirect_export_detector/run.mjs` |
| pbrMaterialImporter | `tools/pbr_material_importer/` | Import and normalize PBR materials from `downloads/` into local-only `assets/public/pbr/` | `python3 tools/pbr_material_importer/run.py` |
| assetSync | `tools/asset_sync/` | Replace this worktree `assets/`, `downloads/`, and `docs/` with symlinks to sibling root repo folders under `../../bus_simulator/` | `node tools/asset_sync/run.mjs` |
| citySpecExporter | `tools/city_spec_exporter/` | Export authoritative JS city specs to JSON under `tests/artifacts/` | `node tools/city_spec_exporter/run.mjs` |
| optionsPresets | `tools/options_presets/` | Export/import Options presets and promote to defaults | `node tools/options_presets/promote_to_defaults.mjs path/to/preset.json --write` |
| textureCorrectionPipeline | `tools/texture_correction_pipeline/` | Run deterministic plugin-based PBR texture correction config generation (class baselines + guard plugins) with optional map QA + headless capture harness analysis | `node tools/texture_correction_pipeline/run.mjs` |
| runSelectedTest | `tools/run_selected_test/` | Run a selected test target via `tests/.selected_test` for fast AI/dev iteration | `node tools/run_selected_test/run.mjs` |
| meshFabricationLiveServer | `tools/mesh_fabrication_live_server/` | Serve mesh fabrication screen + `/api/mesh/current` with conditional `ETag`/`Last-Modified` responses for 1s polling | `python3 tools/mesh_fabrication_live_server/run.py` |
| meshFabricationHandoffFormatter | `tools/mesh_fabrication_live_server/format_handoff_json.mjs` | Format mesh handoff JSON deterministically and inline small arrays on a single line | `node tools/mesh_fabrication_live_server/format_handoff_json.mjs --file assets/public/mesh_fabrication/handoff/mesh.live.v1.json` |
| meshFabricationBusTireExporter | `tools/mesh_fabrication_live_server/export_bus_tires_to_handoff.mjs` | Extract representative city/coach bus tire meshes from OBJ/GLB and write mesh-fabrication compiled-topology handoff JSON for topology inspection | `node tools/mesh_fabrication_live_server/export_bus_tires_to_handoff.mjs --out assets/public/mesh_fabrication/handoff/mesh.live.v1.json` |
| meshFabricationDoubleDeckerTireExporter | `tools/mesh_fabrication_live_server/export_double_decker_tire_to_handoff.mjs` | Extract a representative double-decker bus tire mesh from GLB and write mesh-fabrication compiled-topology handoff JSON (live + backup) | `node tools/mesh_fabrication_live_server/export_double_decker_tire_to_handoff.mjs` |
| promptNameValidator | `tools/prompt_name_validator/` | Validate AI prompt folder placement and naming conventions; print next prompt id (`--next-id`) | `node tools/prompt_name_validator/run.mjs` |
| shaderPolicy | `tools/shader_policy/` | Scan `.js`/`.mjs` files for inline shader source assignments and enforce loader-only source policy | `node tools/shader_policy/run.mjs` |
| worktreeCreateAndSync | `tools/worktree_create_and_sync/` | Create/reuse a named worktree and run shared-path symlink sync (`assets/`, `downloads/`, `docs/`) inside it | `bash tools/worktree_create_and_sync/run.sh <name>` |
