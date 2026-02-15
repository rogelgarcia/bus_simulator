#Problem

SSAO is producing occlusion in visually empty space (outside walls, between distant buildings) while missing expected contact/crease darkening (for example, under the bus). The result looks detached from scene geometry.

# Request

Improve SSAO quality so it darkens true local contacts/creases and avoids phantom occlusion in air/background regions.

Tasks:
- Reproduce the issue in deterministic scenarios that include walls, separated buildings, and bus-to-ground contact.
- Ensure SSAO no longer adds visible darkening in empty space or across large depth gaps.
- Ensure expected contact areas (grounded vehicle underside, wall-ground creases, tight crevices) are visibly occluded.
- Keep behavior stable across common camera angles and movement.
- Avoid regressions in non-SSAO AO paths while fixing SSAO behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_318_MATERIAL_ssao_occlusion_appears_in_empty_space_and_misses_expected_contacts_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
