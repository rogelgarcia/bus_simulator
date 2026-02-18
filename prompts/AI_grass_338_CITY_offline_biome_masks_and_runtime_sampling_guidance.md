#Problem

Transition quality and runtime cost are unstable when too much biome logic is evaluated dynamically instead of being authored and prepared ahead of runtime.

# Request

Create high-level guidance for separating offline biome-mask authoring from lightweight runtime sampling.

Tasks:
- Define which terrain/biome signals should be prepared offline versus evaluated at runtime.
- Define a high-level data contract for mask channels, expected semantics, and interoperability expectations.
- Define guidance for mask resolution strategy across near/mid/far terrain scales.
- Define streaming and fallback expectations when mask data is missing, delayed, or lower quality than expected.
- Define runtime budget expectations for sampling and blending so transitions remain stable under camera movement.
- Define validation and debugging expectations to detect stale, mismatched, or invalid offline mask data.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_338_CITY_offline_biome_masks_and_runtime_sampling_guidance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
