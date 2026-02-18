#Problem

Biome surfaces show visible repetition and weak scale continuity when texture tiling is managed as a single-scale setting.

# Request

Create high-level guidance for a multi-scale tiling strategy with anti-tiling behavior that preserves detail while reducing repetition.

Tasks:
- Define the intended role of macro-scale and micro-scale texture behavior and how they should complement each other.
- Define high-level per-layer tiling guidance so different biome materials can keep coherent texel density.
- Define anti-tiling guidance for reducing repeating patterns without breaking biome readability.
- Define transition expectations between near and far viewing distances so texture behavior remains stable.
- Define artifact-prevention expectations (pattern grid visibility, swimming effects, abrupt scale discontinuities).
- Define baseline tuning presets that can be used as starting points across different biome material families.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_339_MATERIAL_multiscale_tiling_and_anti_tiling_guidance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
