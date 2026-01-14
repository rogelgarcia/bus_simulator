# Project Tools

Registry of scripts under `tools/`. When adding a new tool, register it here.

| Name | Path | Purpose | Run |
|---|---|---|---|
| compareBusModels | `tools/compareBusModels.mjs` | Compare coach/city bus model offsets from wheel centers | `node tools/compareBusModels.mjs` |
| computeTreeConfig | `tools/computeTreeConfig.mjs` | Compute tree orientation/size metadata and write `TreeConfig.js` | `node tools/computeTreeConfig.mjs` |
| verifyTreeModels | `tools/verify_tree_models.mjs` | Verify tree model base alignment offline | `node tools/verify_tree_models.mjs` |
| downloadRapierDocs | `tools/download_rapier_docs.sh` | Download Rapier.js 3D API docs into `docs/rapier/` | `bash tools/download_rapier_docs.sh` |
| redirectExportDetector | `tools/redirect_export_detector/` | Detect redirect re-export shim modules | `node tools/redirect_export_detector/run.mjs` |

