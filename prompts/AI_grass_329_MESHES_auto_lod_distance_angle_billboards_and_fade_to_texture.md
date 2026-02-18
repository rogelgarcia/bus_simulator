#Problem

Current grass LOD behavior requires manual control and does not reliably adapt detail by both distance and camera angle. This causes either excessive cost or visible quality breaks.

# Request

Implement automatic low-cut grass LOD selection with smooth transitions from tuft geometry to billboard clusters and finally to texture-only ground.

Tasks:
- Use distance and camera angle together to drive automatic LOD tier selection.
- Ensure the first ring remains highest detail, with rapid cost reduction by second/third rings.
- Introduce billboard and billboard-cluster behavior for farther rings.
- Add inward/camera-biased billboard orientation so grass remains readable in higher/top-down viewpoints.
- Fade detail progressively into ground texture so there is no abrupt visual cutoff.
- Include stability measures to avoid visible LOD popping/flicker during camera motion.
- Keep runtime cost aligned with lightweight bus-sim constraints.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_329_MESHES_auto_lod_distance_angle_billboards_and_fade_to_texture_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
