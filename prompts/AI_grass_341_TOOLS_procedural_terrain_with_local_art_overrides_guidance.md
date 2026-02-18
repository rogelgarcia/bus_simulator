#Problem

Fully procedural biome transitions are not enough for final visual quality in all locations, especially in hero areas and edge cases.

# Request

Create high-level guidance for combining procedural terrain transitions with local art overrides in a controlled, predictable workflow.

Tasks:
- Define override authoring modes that artists/designers can use to locally steer transition outcomes.
- Define priority and blending intent between global procedural rules and local overrides.
- Define constraints that keep local overrides deterministic, maintainable, and safe for iteration.
- Define collaboration expectations so overrides can be reviewed, tracked, and adjusted without breaking baseline behavior.
- Define quality gates to detect abrupt seams or unintended conflicts between adjacent override regions.
- Define acceptance criteria for deciding when to use procedural defaults versus local manual intervention.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_341_TOOLS_procedural_terrain_with_local_art_overrides_guidance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
