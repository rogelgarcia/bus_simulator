#Problem [DONE]

Building walls currently use only tiled PBR textures, which look too uniform/repetitive and lack “life” (weathering, random variation, stains, edge wear).

# Request

Create a "Material Variation system" that layers multiple *totally procedural* effects on top of existing tiled PBR materials to add believable variation and aging, while staying stable and reproducible per building.

Tasks:
- Define a clear pipeline of procedural steps where each step adds one effect; the pipeline should be composable so effects can be enabled/disabled independently.
- Ensure the variation is deterministic per building using a per-building `seed` (stable across reloads) so the same building always renders the same wear/variation.
- Support parameterization for each effect and for the pipeline as a whole (with sensible defaults and safe ranges).
- The system must work with tiled PBR inputs (baseColor, normal, ORM/ARM) and should primarily vary: roughness, baseColor tint/value, AO influence, and optional normal intensity.
- Effects to include (each as its own step in the pipeline):
  - Macro variation mask: large-scale random patches to break uniformity (drives subtle baseColor tint/value and roughness changes).
  - Saturation variation: subtle saturation shifts (bleached vs richer zones) driven by the same deterministic masks.
  - Roughness variation: additional noise-driven roughness modulation (micro + macro controls).
  - Vertical runoff / streaks: gravity-aligned streaking that can be height-weighted (optional “near ledges” emphasis).
  - Edge wear (non-flat): edge/corner/border wear that is irregular and noise-warped (supports “water erosion” style; affects baseColor + roughness).
  - Cavity dirt/grime: opposite of edge wear, emphasizing recessed areas or sheltered zones (drives slight darkening + roughness changes).
  - Dust accumulation: height-banded or occlusion-weighted dust that subtly lightens/desaturates and shifts roughness.
  - Wetness film: optional “recent rain” effect that darkens slightly and shifts roughness/spec response (can be driven by streak masks + height).
  - Sun bleaching / orientation wear: face-orientation-driven aging (bleaching/desaturation/roughness change) using a configurable “sun direction” or exposure model.
  - Moss/algae growth: optional damp/shaded growth bands (tint + roughness + optional detail normal influence), height/occlusion biased.
  - Soot/pollution staining: optional dark staining biased toward street level or vents/edges (tint/value + roughness).
  - Efflorescence/mineral deposits: optional chalky white streaks/patches biased by runoff patterns (value/saturation + roughness).
  - Anti-tiling assist: reduce visible repetition while still sampling the same PBR texture set.
  - Optional “detail” pass: small-scale detail influence that can strengthen perceived surface breakup without changing the underlying PBR set.
  - Optional “micro cracking/crazing” pass: very subtle crack-like breakup (primarily roughness + optional normal influence) for old plaster/concrete looks.
- Expose useful shared parameters that apply to multiple effects, such as:
  - `seed`
  - `seedOffset` (per-surface/per-layer deterministic variation without changing the building seed)
  - `worldSpaceScale` / `objectSpaceScale` (macro frequency)
  - `heightMin`/`heightMax` (for height-weighted effects)
  - `intensity` per effect and global intensity multiplier
  - `streakStrength`, `streakScale`, `streakDirection` (default: gravity/down)
  - `edgeWidth`, `edgeStrength`, `edgeNoiseWarp`
  - `grimeStrength`, `grimeScale`
  - `tintAmount`, `valueAmount`
  - `saturationAmount`
  - `sunDirection`, `sunBleachStrength`, `sunBleachExponent` (or equivalent exposure shaping controls)
  - `dustStrength`, `dustHeightBand` (or min/max), `dustScale`
  - `wetnessStrength`, `wetnessHeightBand` (or min/max), `wetnessScale`
  - `mossStrength`, `mossHeightBand` (or min/max), `mossScale`, `mossTint`
  - `sootStrength`, `sootHeightBand` (or min/max), `sootScale`
  - `efflorescenceStrength`, `efflorescenceScale`
  - `crackStrength`, `crackScale`
  - `roughnessAmount`, `normalAmount`
- Provide a lightweight default preset suitable for buildings (walls/roof/surfaces) and allow additional presets for different material roots (e.g., `wall` vs `surface`).
- Keep performance reasonable: avoid per-building expensive allocations; prefer shader-time procedural masks or cached resources.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_132_MATERIAL_material_variation_system`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Shader-based, deterministic material variation pipeline added and integrated into building PBR wall/roof materials (with presets + basic tests).
