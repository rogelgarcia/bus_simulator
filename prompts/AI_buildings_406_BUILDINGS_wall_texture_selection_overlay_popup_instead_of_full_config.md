#Problem

Wall texture authoring currently routes through a full material configuration flow even when the goal is only to pick a wall texture. This makes simple selection tasks slower and adds unnecessary complexity when texture-detail editing is not needed.

# Request

Implement a simplified wall texture selection workflow that uses a small overlay popup picker instead of opening the full material configuration experience.

Tasks:
- Add a compact wall texture picker overlay popup for building wall selection workflows.
- Ensure users can quickly browse/select available wall textures from this popup without entering full texture/material-detail editing.
- Keep the existing full configuration path available for advanced editing, but separate it clearly from quick texture picking.
- Make the popup usable in the building authoring flow with minimal steps and clear selection feedback.
- Support applying the selected texture immediately to the current target wall scope used by the authoring UI.
- Preserve existing behavior for projects/buildings that already rely on full configuration data.
- Add a straightforward way to open the advanced/full config only when explicitly requested by the user.
- Ensure popup state handling is deterministic (open/close/select/cancel) and does not leave stale UI selection state.
- Add/update tests for at least quick-pick selection application, cancel/no-change behavior, and advanced-path handoff.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
