# PBR Texture Correction Pipeline Tool

Status: **Implemented (Phase 2 deterministic analysis + harness)**  
Scope: Offline deterministic config generation for texture correction metadata.

## 1. Purpose

Provide a standalone pipeline that:
- reads PBR material definitions from JS source configs
- runs deterministic correction plugins per material
- writes per-texture correction config JS outputs
- emits deterministic machine-readable run artifacts

The pipeline is an offline tool only. Runtime/game code must consume generated config files and must not execute plugins.

## 2. Entrypoint

- CLI: `node tools/texture_correction_pipeline/run.mjs`
- Tool root: `tools/texture_correction_pipeline/`

## 3. Source input contract

The pipeline ingests material definitions from:
- `assets/public/pbr/<slug>/pbr.material.config.js`

Resolved fields per material:
- `materialId`
- `classId`
- `label`
- `mapFiles`
- `resolvedMapFiles`
- texture folder path
- source config path

## 4. Plugin contract

Each plugin is registered with stable id and deterministic order.

Current baseline plugin chain (preset `aces`):
- `roughness_inversion_guard` (optional high-confidence guard)
- `scalar_map_clipping_guard` (optional high-confidence guard)
- `roughness_interval_remap`
- `albedo_balance`
- `normal_intensity`
- `metalness_policy` (class policy enforcer for non-metal defaults)

Plugin input:
- material metadata/map files
- preset id
- profile id
- class id
- merged plugin options (preset + class overrides)

Plugin output:
- `applied` flag
- optional `skippedReason`
- `pluginData` (plugin-specific deterministic payload)
- `adjustments` (runtime-consumable correction payload)

## 5. Preset-aware profile contract

Profiles are preset-scoped and support class-level overrides.

Top-level:
- `profileId`
- `presets[presetId]`

Preset payload:
- `enabledPlugins`
- `pluginOptions`
- `classProfiles[classId]`
  - `enabledPlugins` (optional)
  - `disabledPlugins` (optional)
  - `pluginOptions` (optional overrides)
  - `targets` (optional class roughness/metalness targets)
  - `notes` (optional rationale)

Initial baseline preset:
- `aces`
- includes class defaults for all terrain classes in catalog (`grass`, `ground`/`soil`, `stone`, etc.)

## 6. Generated correction config contract

Written per material to:
- `assets/public/pbr/<slug>/pbr.material.correction.config.js`

Schema payload:
- `schema`: `bus_sim.pbr_material_correction`
- `version`
- `toolId`, `toolEntry`
- material identity/path/map metadata
- `presets[presetId]`
  - `profileId`
  - `enabledPlugins`
  - `pluginOutputs`
  - `adjustments`
  - `warnings`

Idempotence rule:
- same inputs + same profile + same enabled plugins => byte-identical output file.

## 7. Run artifact contract

Written to:
- `tools/texture_correction_pipeline/artifacts/last_run.json` (default)

Schema payload:
- `schema`: `bus_sim.texture_correction_pipeline_report`
- `version`
- run options (`presetId`, `profileId`, mode, plugin run filters)
- `profileSummary`
  - active preset plugins
  - preset plugin defaults
  - class/category defaults (`pluginOptions`, `targets`, `notes`, class-level enable/disable)
- totals (`discovered`, `processed`, `created`, `updated`, `unchanged`, `skipped`, `errors`)
- `guardedCases` (materials where guard plugins emitted warnings)
- `materialQaSummary` table (`materialId`, `qaScore`, `anomalyScore`, review flags)
- arrays of `processed`, `skipped`, and `errors`
  - processed entries include deterministic emitted payloads:
    - `emittedPluginOutputs`
    - `emittedAdjustments`
    - warning list (includes guard warnings when triggered)

## 8. Deterministic map QA contract

Map analysis is deterministic and reproducible for unchanged inputs.

Minimum map QA set (per material):
- file/format sanity: existence, format, dimensions, aspect, bit depth, expected color space policy
- albedo curves: luminance percentiles (`p1/p50/p99`), saturation percentiles, clipping percentages
- roughness curves: `p10/p50/p90`, usable range width, near-constant detection
- normal integrity: unpacked normal length error, Z distribution, orientation heuristic
- AO/metalness stats: mean/std, clipping, binary-vs-continuous hints
- cross-map consistency: gradient correlation across albedo/roughness/normal channels
- tiling risk: periodic autocorrelation peak score (base color + roughness)

## 9. Headless capture harness contract

Full analysis mode uses deterministic headless captures:
- scenario id: `material_calibration_capture`
- fixed viewport and fixed timestep
- fixed camera recipes (front/oblique/panel-perpendicular)
- fixed illumination presets (`neutral`, `overcast`, `sunny`) with ACES baseline
- captures generated in raw/corrected pairs

Per-capture render metrics:
- average Lab color
- mean luminance, RMS contrast, local contrast
- detail flatness indicators (gradient energy, Laplacian variance)
- clipping percentages

Drift/anomaly:
- color drift: CIE Lab `ΔE2000` vs class reference profile
- weighted deterministic anomaly score across color/brightness/contrast/detail/clipping
- multi-condition policy: single-capture outlier => heuristic warning, 2+ outliers => review required

---

## 10. Runtime Consumption Contract (AI 349)

Generated correction configs are consumed by the shared runtime resolver:
- `src/graphics/content3d/materials/PbrTextureCalibrationResolver.js`

Runtime mapping requirements:
- `presets[presetId].adjustments` maps into runtime override keys:
  - albedo: brightness, hue, tint strength, saturation
  - normal: strength
  - roughness: interval remap (preferred) or scalar strength fallback
  - ao: intensity
  - metalness: scalar value
- overrides are sanitized/clamped before use.
- runtime merge order is catalog defaults -> calibration overrides -> local overrides.
- runtime does not execute analysis plugins; it only consumes generated config outputs.
