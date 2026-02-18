#Problem

Biome transitions are currently driven by a generic blend model, which causes mismatched visual behavior between different biome boundaries.

# Request

Create high-level guidance for a biome-pair transition profile system so future implementation prompts can target pair-specific behavior instead of one global rule.

Tasks:
- Define the biome-pair model and list how pair identities should be represented (for example `grass->dirt`, `dirt->rock`, `rock->snow`).
- Define which transition attributes should be configurable per pair (transition width intent, softness intent, edge breakup intent, material dominance intent).
- Define how shared defaults and pair-specific overrides should coexist when only part of a pair profile is authored.
- Define qualitative art-direction targets per pair type (soft/natural, medium/mixed, hard/abrupt) and when each is appropriate.
- Define acceptance criteria that can be reviewed visually for each pair before implementation work begins.
- Define constraints so this guidance remains reusable across terrain scales and biomes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_336_MATERIAL_biome_pair_transition_profiles_guidance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
