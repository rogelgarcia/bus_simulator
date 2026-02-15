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
| assetSync | `tools/asset_sync/` | Sync full `assets/` from the sibling root repo (`../../bus_simulator/assets`) into this worktree using filesystem copy only (no git/worktree commands) | `node tools/asset_sync/run.mjs` |
| citySpecExporter | `tools/city_spec_exporter/` | Export authoritative JS city specs to JSON under `tests/artifacts/` | `node tools/city_spec_exporter/run.mjs` |
| optionsPresets | `tools/options_presets/` | Export/import Options presets and promote to defaults | `node tools/options_presets/promote_to_defaults.mjs path/to/preset.json --write` |
| runSelectedTest | `tools/run_selected_test/` | Run a selected test target via `tests/.selected_test` for fast AI/dev iteration | `node tools/run_selected_test/run.mjs` |
| promptNameValidator | `tools/prompt_name_validator/` | Validate AI prompt folder placement and naming conventions | `node tools/prompt_name_validator/run.mjs` |
| worktreeCreateAndSync | `tools/worktree_create_and_sync/` | Create/reuse a named worktree and run asset sync inside it | `node tools/worktree_create_and_sync/run.mjs <name>` |
