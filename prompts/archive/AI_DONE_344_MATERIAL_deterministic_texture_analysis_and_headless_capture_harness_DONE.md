# DONE

#Problem

We can visually detect material issues (too shiny grass, wrong roughness balance, brightness drift), but we need objective and repeatable analysis to drive corrections at scale.

Manual review alone is too slow and inconsistent.

# Request

Implement deterministic analysis and deterministic headless rendering harness support for the texture correction pipeline so correction configs can be generated from measurable signals.

Tasks:
- Build this as a **standalone/headless tool workflow** (CLI/script driven), separate from normal game runtime.
- For each texture/material set, compute deterministic map-level analysis metrics, including a minimum QA set:
  - file/format sanity (resolution, aspect, bit depth, expected color space: albedo sRGB, scalar maps linear)
  - albedo curves (linearized luminance percentiles p1/p50/p99, saturation percentiles, black/white clipping)
  - roughness curves (p10/p50/p90, usable range width, near-constant-map detection)
  - normal map integrity (unpacked normal length error, Z distribution, channel orientation consistency)
  - AO/metalness stats (mean/std, clipping, binary-vs-continuous behavior checks)
  - cross-map consistency (gradient/edge correlation across albedo/normal/roughness)
  - tiling risk (autocorrelation and/or FFT periodic-peak detection)
- Add category-aware analysis so thresholds/baselines can differ by class (grass, soil, rock, etc.) while still being deterministic.
- Make calibration outputs preset-aware by render preset/tone-mapping profile (structure supports multiple presets).
- Build a headless harness that renders each texture in standardized capture setups (fixed camera poses, fixed lighting setups, fixed exposure/tone mapping, fixed geometry variants/angles).
- For now, run and generate baseline calibration for preset `aces` only.
- Produce capture outputs needed for evaluation (for example: raw/corrected comparisons and multi-angle validation captures).
- Treat single-capture decisions as heuristic only; require multi-angle/multi-condition captures for stronger confidence before labeling a material as physically off.
- From standardized captures, compute deterministic render-level drift/anomaly features:
  - color drift (CIE Lab + DeltaE2000 vs reference profile)
  - brightness/contrast drift (mean luminance + RMS/local contrast)
  - detail flatness indicators (gradient energy + Laplacian variance)
  - clipping percentage near black/white in linear space
- Compute an overall per-material anomaly score using a deterministic formula (weighted sum and/or Mahalanobis distance over selected features).
- Ensure harness and analysis are reproducible across runs for unchanged inputs (same ordering, same deterministic settings).
- Feed analysis + harness outcomes into the correction pipeline so each filter can emit correction output to per-texture config JS files.
- Runtime rule: headless analysis/capture/correction must run only via tool scripts; in-game runtime may only read already-generated configs/results.
- Expose the deterministic QA/anomaly results in machine-readable outputs and in a concise "Material QA score" summary section suitable for calibration/export reporting.
- Generate a machine-readable report per run with:
  - metrics per texture
  - detected discrepancies/outliers
  - recommended and applied correction values
  - references to generated captures

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to `prompts/AI_DONE_344_MATERIAL_deterministic_texture_analysis_and_headless_capture_harness_DONE.md`
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary of changes
- Added deterministic map QA analysis modules (file/format sanity, albedo/roughness/normal/AO/metalness metrics, cross-map consistency, tiling-risk scoring).
- Added deterministic render QA scoring modules (Lab + DeltaE2000 drift, brightness/contrast/detail/clipping drift, weighted anomaly and QA scoring).
- Added a deterministic headless capture harness scenario (`material_calibration_capture`) and integrated it into the harness registry.
- Added a headless runtime layer for static server + Playwright browser sessions and integrated capture/metric extraction workflow.
- Integrated analysis flow into the texture correction pipeline, including recommended plugin options derived from analysis and QA summary embedding into correction configs.
- Extended run artifacts with analysis mode and a concise `materialQaSummary` section for calibration/export reporting.
- Added Node unit tests for QA scoring/recommendation determinism and retained pipeline regression tests.
- Updated tool/spec documentation to cover map QA, headless capture harness behavior, and analysis CLI modes.
