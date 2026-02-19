# DONE

#Problem

The correction pipeline framework exists conceptually, but we still need a practical first-pass plugin set and baseline profiles so materials become consistently usable without manual per-texture tuning.

Without a curated initial set, outcomes will remain uneven across categories (especially grass/soil/rock).

# Request

Define and implement the initial texture-correction plugin bundle and category baseline profiles for deterministic, config-driven corrections.

Tasks:
- Deliver an initial plugin set focused on high-impact corrections:
  - roughness interval remap (min/max + response shaping)
  - albedo normalization (brightness/saturation balancing)
  - normal intensity normalization (reduce overly harsh microdetail)
- For roughness correction, require interval remap semantics that support:
  - `rough_out = minR + f(rough_in) * (maxR - minR)`
  - identity and gamma-shaped response options (`f(x)=x`, `f(x)=x^gamma`)
  - optional percentile normalization pre-pass (for example p5-p95 normalization) before interval remap
- Add optional guard plugins for map sanity where needed (for example: roughness inversion guard, scalar-map clipping guard), only when deterministic and high-confidence.
- Define baseline correction profiles by category/class, at minimum covering:
  - grass
  - soil
  - rock
  - any other terrain classes already present in catalog configs
- Define these baselines under a preset-aware calibration structure (per render preset), even if only one preset is populated initially.
- Initial populated preset must be `aces`.
- Ensure each profile includes clear default ranges/targets and allows per-texture overrides through generated config files.
- Include physically plausible starter ranges per category (for example dry grass roughness defaults around `minR 0.60-0.70` and `maxR 0.90-1.00`, with clear rationale and overridable values).
- Enforce non-metal defaults where appropriate material classes require it (for example grass keeps metalness at/near 0 unless explicitly overridden).
- Ensure deterministic plugin ordering and deterministic parameter output for identical inputs.
- Ensure outputs are compatible with the correction config generation flow (per-texture config file in texture folder) and can be consumed by runtime/calibration tools.
- Include a concise profile/report artifact that documents:
  - active plugins
  - category defaults
  - per-texture overrides emitted
  - skipped/guarded cases
- Preserve safe fallback behavior: raw/unadjusted mode must remain available and corrections must be reversible by config changes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to `prompts/AI_DONE_346_MATERIAL_initial_texture_correction_plugin_set_and_category_baselines_DONE.md`
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary of changes
- Added deterministic optional guard plugins (`roughness_inversion_guard`, `scalar_map_clipping_guard`) and integrated them in deterministic plugin order.
- Added deterministic `metalness_policy` plugin and class defaults so non-metal classes (including grass/ground/stone) enforce metalness near zero by default.
- Extended the ACES baseline profile with class targets/notes and full class coverage (including soil alias), plus physically plausible starter roughness ranges.
- Extended run artifact reporting with `profileSummary`, `guardedCases`, and per-material emitted payloads (`emittedAdjustments`, `emittedPluginOutputs`).
- Updated calibration consumption path to support roughness inversion (`invertInput`) in correction configs and shader-side remap.
- Added/updated Node unit tests for guard plugins, profile coverage, and updated baseline plugin expectations.
- Updated tool docs/spec entries to describe guard plugins, class defaults, and enhanced reporting contracts.
