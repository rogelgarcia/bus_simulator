# Texture Correction Pipeline

Standalone deterministic tool that generates per-texture correction config files for PBR materials.

## Scope

- Runs only as a tool under `tools/` (never in normal game runtime).
- Reads texture definitions from `assets/public/pbr/*/pbr.material.config.js`.
- Executes correction plugins in deterministic order.
- Writes correction config output per texture folder as `pbr.material.correction.config.js`.
- Emits a machine-readable run artifact with processed, skipped, and error cases.

## Run

Default full pass (writes outputs):

```bash
node tools/texture_correction_pipeline/run.mjs
```

Dry run:

```bash
node tools/texture_correction_pipeline/run.mjs --dry-run
```

Map-only deterministic QA analysis (no capture harness):

```bash
node tools/texture_correction_pipeline/run.mjs --analysis=map --dry-run
```

Full deterministic QA analysis + headless capture harness:

```bash
node tools/texture_correction_pipeline/run.mjs --analysis=full --material=pbr.grass_005 --write
```

Preset/profile/filter examples:

```bash
node tools/texture_correction_pipeline/run.mjs --preset=aces --class=grass,ground
node tools/texture_correction_pipeline/run.mjs --plugins=roughness_interval_remap,normal_intensity --skip-plugins=normal_intensity
node tools/texture_correction_pipeline/run.mjs --profile=tools/texture_correction_pipeline/src/default_profile.mjs
node tools/texture_correction_pipeline/run.mjs --analysis=full --capture-output=tools/texture_correction_pipeline/artifacts/captures
```

## Output

- Per texture: `assets/public/pbr/<slug>/pbr.material.correction.config.js`
- Run artifact JSON: `tools/texture_correction_pipeline/artifacts/last_run.json` (override with `--report=...`)
- Headless captures (full analysis mode): `tools/texture_correction_pipeline/artifacts/captures/<material>/...`

## Deterministic QA / Harness

- Map-level deterministic metrics:
  - format/resolution/bit-depth sanity + expected color space policy
  - albedo curves (luminance/saturation percentiles + clipping)
  - roughness curves (p10/p50/p90, usable range, near-constant detection)
  - normal map integrity (length error, Z distribution, orientation heuristic)
  - AO/metalness stats (mean/std/clipping + binary behavior hints)
  - cross-map gradient correlation + tiling periodic-correlation risk
- Render-level deterministic metrics (headless harness):
  - standardized camera poses + illumination presets
  - raw/corrected captures per material
  - color drift (`ΔE2000`), brightness/contrast drift, detail flatness, clipping
  - weighted anomaly score + “Material QA score” summary
- Correction plugins consume deterministic recommendations from analysis results.

## Current baseline

- Preset baseline: `aces`
- Plugins:
  - `roughness_inversion_guard` (optional high-confidence guard)
  - `scalar_map_clipping_guard` (optional high-confidence guard)
  - `roughness_interval_remap`
  - `albedo_balance`
  - `normal_intensity`
  - `metalness_policy` (non-metal class default; overridable per texture)
- Class defaults include category roughness targets/rationales (grass, ground/soil, stone, and all catalog classes).

## Report highlights

- `profileSummary`: active preset plugins, plugin defaults, and class/category defaults.
- `guardedCases`: materials where guard plugins emitted warnings.
- `processed[*].emittedAdjustments`: final deterministic per-texture payload emitted to config.
