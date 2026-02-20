# AI_i_graphics_342 Workflow

Reference AI file: `prompts/AI_i_graphics_342_TOOLS_noise_fabrication_directional_line_and_grid_generators.md`

Use this loop for each requirement block:
1.1 Start the requirements block in AI 342.
1.2 Implement the block.
1.3 Do a full code quality and correctness review.
1.4 Mark that block requirements as complete in AI 342.
1.5 Return here and add a note under that block.
1.6 Compact context with current step and next step so progress is never lost.
Use the same pattern for each group (`2.1`-`2.6`, `3.1`-`3.6`, ...).

## Autonomous Execution Rules
- Run end-to-end through all groups without stopping for confirmation.
- Do not ask questions in chat while executing this workflow.
- If a question/ambiguity appears, write it in `Questions and Decisions Log` and immediately record the chosen decision, then continue.
- Do not execute commands that require escalated permissions.
- If a needed action would require permissions, choose a non-escalated alternative and continue; if no alternative exists, log the skipped action and proceed with the next executable step.
- Keep progress recoverable by updating `Compact Context Snapshot` at each step transition.

## Questions and Decisions Log
- _No entries yet._

## Compact Context Snapshot
- Active AI: `AI_i_graphics_342_TOOLS_noise_fabrication_directional_line_and_grid_generators.md`
- Workflow file: `AI_i_graphics_342_workflow.md`
- Execution mode: autonomous (`no stops`, `no chat questions`, `no escalated-permission commands`)
- Current step: `7.6` (Group 7 compaction complete)
- Next step: `DONE` (all workflow groups complete)
- Completed groups: Group 1, Group 2, Group 3, Group 4, Group 5, Group 6, Group 7
- Active group: none (workflow complete)
- Compaction rule: keep this section short and update after every step transition

## Group 1: Foundation and Compatibility
- [x] 1.1 Start Group 1 requirements block in AI 342
- [x] 1.2 Implement Group 1
- [x] 1.3 Run full review for code quality and correctness
- [x] 1.4 Mark Group 1 requirements complete in AI 342
- [x] 1.5 Add Group 1 completion note in this file
- [x] 1.6 Compact context (record current step and next step for Group 1)
Note: Completed in sequence; preserved `Value fBm`/`Ridged fBm` behavior and implemented generator-specific parameter models with no forced shared-only controls.

## Group 2: Generator and Preset Expansion
- [x] 2.1 Start Group 2 requirements block in AI 342
- [x] 2.2 Implement Group 2
- [x] 2.3 Run full review for code quality and correctness
- [x] 2.4 Mark Group 2 requirements complete in AI 342
- [x] 2.5 Add Group 2 completion note in this file
- [x] 2.6 Compact context (record current step and next step for Group 2)
Note: Completed in sequence; implemented directional/line/grid generators, baseline material-focused families, and practical presets including `Sidewalk Streaks`, seam singles, and `Stone Plates Grid`.

## Group 3: Catalog Data and Loading Contract
- [x] 3.1 Start Group 3 requirements block in AI 342
- [x] 3.2 Implement Group 3
- [x] 3.3 Run full review for code quality and correctness
- [x] 3.4 Mark Group 3 requirements complete in AI 342
- [x] 3.5 Add Group 3 completion note in this file
- [x] 3.6 Compact context (record current step and next step for Group 3)
Note: Completed in sequence; added runtime catalog module and schema validation, and enforced catalog-driven picker sourcing as the authoritative path.

## Group 4: Noise Picker UX and Guidance
- [x] 4.1 Start Group 4 requirements block in AI 342
- [x] 4.2 Implement Group 4
- [x] 4.3 Run full review for code quality and correctness
- [x] 4.4 Mark Group 4 requirements complete in AI 342
- [x] 4.5 Add Group 4 completion note in this file
- [x] 4.6 Compact context (record current step and next step for Group 4)
Note: Completed in sequence; added picker cards with descriptions/examples, hover details, mixing guidance, and `Normal`/safe-`Albedo`/channel-aware `ORM` hints.

## Group 5: Layer Stack Authoring Workflow
- [x] 5.1 Start Group 5 requirements block in AI 342
- [x] 5.2 Implement Group 5
- [x] 5.3 Run full review for code quality and correctness
- [x] 5.4 Mark Group 5 requirements complete in AI 342
- [x] 5.5 Add Group 5 completion note in this file
- [x] 5.6 Compact context (record current step and next step for Group 5)
Note: Completed in sequence; implemented tabbed layered stack (`+` add, replace semantics), per-layer blend/strength/transforms, rename/description/duplicate/lock/solo, and top-right reorder popup.

## Group 6: Export and Serialization
- [x] 6.1 Start Group 6 requirements block in AI 342
- [x] 6.2 Implement Group 6
- [x] 6.3 Run full review for code quality and correctness
- [x] 6.4 Mark Group 6 requirements complete in AI 342
- [x] 6.5 Add Group 6 completion note in this file
- [x] 6.6 Compact context (record current step and next step for Group 6)
Note: Completed in sequence; kept export button, switched to deterministic layered recipe JSON export, surfaced baked-map unavailability, and added map-target export scope with explicit ORM packing validation.

## Group 7: Migration, Performance, and Validation
- [x] 7.1 Start Group 7 requirements block in AI 342
- [x] 7.2 Implement Group 7
- [x] 7.3 Run full review for code quality and correctness
- [x] 7.4 Mark Group 7 requirements complete in AI 342
- [x] 7.5 Add Group 7 completion note in this file
- [x] 7.6 Compact context (record current step and next step for Group 7)
Note: Completed in sequence; implemented legacy v1→v2 layered migration, enforced `maxLayers=8` and `maxResolution=1024` with warnings, and shipped Node tests for catalog/actions/determinism/export/migration/roundtrip.
