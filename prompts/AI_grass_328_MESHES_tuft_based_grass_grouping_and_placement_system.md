#Problem

Single-blade placement is not enough for performance or visual richness. The system needs grouped grass instances (tufts) as the primary runtime unit.

# Request

Implement a tuft-based low-cut grass placement model where each instance represents grouped blades with controlled variation.

Tasks:
- Treat tuft (grouped grass) as the core runtime primitive instead of isolated single blades.
- Support configurable tuft composition (group density/shape variation) driven by the runtime profile.
- Ensure tuft placement follows ground control maps and exclusion rules from prior phases.
- Add natural variation in rotation/scale/color within bounded ranges so fields avoid visual repetition.
- Keep near-ground proportions appropriate for low-cut grass (`< 10 cm` target).
- Preserve deterministic placement for reproducibility and debugging.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_328_MESHES_tuft_based_grass_grouping_and_placement_system_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
