# DONE

#Problem

Terrain/ground materials are currently corrected in an ad-hoc way, which makes results inconsistent across categories and hard to scale.

We need a deterministic correction pipeline that can process any texture set through pluggable filters and persist the corrections as configuration, without manually editing each material.

# Request

Create a plugin-based texture correction pipeline that can ingest materials from existing JS configs and produce per-texture correction config outputs.

Tasks:
- Implement this as a **standalone tool under `tools/`**, not as an in-game runtime system.
- Provide a script/CLI entrypoint that runs the full correction pass from terminal (batch mode).
- Build a pipeline entrypoint that reads texture definitions from the existing config JS sources and resolves, per texture:
  - category/class
  - texture/material id or name
  - map files used (albedo, normal, roughness, ao, metalness/orm, etc.)
  - texture folder location
- Define a plugin contract so each plugin can process one aspect of texture correction (for example: roughness normalization, albedo balancing, normal intensity normalization).
- Support deterministic plugin execution order and deterministic outputs for the same inputs.
- Allow enabling/disabling plugins per run and per category/class profile.
- For each processed texture, write correction outputs into a config JS file located in the texture folder, with a consistent structure that can be consumed by runtime tools.
- Make correction outputs preset-aware (calibration profile per render preset), even if only one preset is active initially.
- For now, implement and emit calibration data for preset `aces` as the initial baseline preset.
- Keep generation deterministic and idempotent: same inputs and enabled plugins must produce the same config output.
- Output is config-only (JS adjustments); do not overwrite source maps by default.
- Runtime rule: the game must only consume/read generated correction configs; plugin execution and correction generation must never run in normal game runtime.
- Preserve original source maps; corrections must be represented as config/metadata, not destructive overwrites.
- Provide run artifacts that summarize:
  - processed textures
  - plugins applied
  - generated/updated config files
  - skipped/error cases

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to `prompts/AI_DONE_343_TOOLS_texture_correction_pipeline_plugin_framework_DONE.md`
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary of changes
- Added `tools/texture_correction_pipeline/` as a standalone CLI tool with deterministic batch execution.
- Implemented config-source ingestion from `assets/public/pbr/*/pbr.material.config.js` resolving class, material id, maps, and folder paths.
- Implemented a deterministic plugin framework with a stable registry and initial plugins (`roughness_interval_remap`, `albedo_balance`, `normal_intensity`).
- Added preset-aware/class-aware profile resolution with run-time plugin allow/skip controls and initial `aces` baseline profile.
- Implemented per-texture correction config generation to `pbr.material.correction.config.js` with deterministic/idempotent output.
- Implemented machine-readable run artifacts summarizing processed materials, applied plugins, updated files, and skipped/error cases.
- Added tool documentation/registry and a dedicated material spec plus Node unit tests for pipeline determinism and plugin selection behavior.
