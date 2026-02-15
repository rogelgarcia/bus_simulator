#Problem

Bus contact shadow appears non-functional in gameplay: enabling it does not reliably produce a visible grounding shadow under the bus.

# Request

Make bus contact shadow reliably visible and tunable so the bus remains grounded even when full AO settings are reduced.

Tasks:
- Ensure contact shadow appears when enabled and follows the active gameplay bus target.
- Ensure runtime controls (intensity/radius/softness/max distance) produce visible, immediate changes.
- Ensure contact shadow remains stable on flat roads and mild slopes and fades appropriately when airborne.
- Prevent self-intersection/artifact behavior that would suppress or invalidate the effect.
- Add deterministic validation that the feature is active and rendering under expected gameplay conditions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_324_VEHICLES_bus_contact_shadow_not_visible_in_gameplay_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
