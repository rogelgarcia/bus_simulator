# Problem

Current biome transitions look linear and blocky because they rely too heavily on simple gradient-style blending.

# Request

Create high-level guidance for a curved transition model based on boundary distance behavior, edge variation, and material-relief influence.

Tasks:
- Define the conceptual transition stages and the role of each stage (boundary shape, natural edge variation, and material-relief influence).
- Define the expected behavior of distance-based boundary bands for wide, medium, and narrow transitions.
- Define high-level guidance for introducing edge irregularity so boundaries avoid uniform straight patterns.
- Define high-level guidance for material-relief-aware blending so dominant surface detail can influence final mix behavior.
- Define quality and stability expectations (deterministic behavior, temporal consistency, no obvious popping when moving the camera).
- Define visual validation criteria to distinguish acceptable natural transitions from synthetic-looking gradients.

## Scope boundary

- This prompt applies to terrain/biome material mixing and relief-aware transition guidance.
- It does not own the physical edge of a raised grass carpet. AI 354 and `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V1.md` remain historical; corrective grass occupancy, sidewalk cuts, real substrate reveal, and narrow antialiased edge belong to AI 359 and its V2 contract.
- Noise or distance blending from this guidance may shape substrate materials or eligible-area masks, but it must not create a wide translucent grass-to-soil melt.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_337_MATERIAL_boundary_distance_noise_height_transition_guidance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
