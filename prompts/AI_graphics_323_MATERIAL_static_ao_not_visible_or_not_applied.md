#Problem

Static AO does not appear to be working in gameplay: enabling it provides little or no visible effect where expected.

# Request

Restore reliable Static AO behavior so static world geometry receives stable, visible static ambient occlusion when enabled.

Tasks:
- Ensure Static AO visibly applies to intended static geometry in normal gameplay scenes.
- Ensure Static AO controls (mode/intensity/quality/radius/wall height/debug view) have expected runtime effect.
- Ensure Static AO updates correctly when relevant world/settings state changes.
- Ensure composition with SSAO/GTAO remains balanced (no unintended double-darkening, no silent zeroing).
- Add deterministic checks/coverage for enablement, visibility, and control responsiveness.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_323_MATERIAL_static_ao_not_visible_or_not_applied_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
