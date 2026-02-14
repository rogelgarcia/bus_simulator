# DONE

#Problem

Road Debugger currently lacks a centralized validation layer. When the authored road/junction state becomes invalid or problematic (overlaps, broken corners, dangling endpoints, invalid junction membership, impossible connector movements, etc.), the UI does not guide the user. This makes debugging slow because users must infer issues from visuals, and there is no “warning center” to identify problems or apply common fixes.

# Request

Add a Road Debugger validation system with a visible warning center and actionable fix suggestions (“quick fixes”) that help users keep the road network in a valid, predictable state.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.

Tasks:
- Add a validation pipeline step:
  - After the road engine/pipeline computes derived geometry/topology, run a deterministic validator that produces a list of issues.
  - Each issue must have: stable `issueId`, severity (`info|warning|error`), short label, optional details, and references to affected entities (roadId/segmentId/pointId/junctionId/connectorId).
- Define a first set of validations (extendable):
  - Overlaps remaining after trimming (segment-to-segment or junction-to-road overlap).
  - Broken corners on multi-segment roads (gap/sliver/degenerate patch candidates).
  - Dangling endpoints (endpoints near others but not in a junction; or endpoints that should be junctioned based on proximity rules).
  - Junction consistency errors (junction with <2 approaches, orphan connector edges, duplicate approaches, inconsistent same-road merge eligibility).
  - Invalid connector movements (e.g., movement connects endpoints with large vertical separation once multi-level roads exist; optional future).
  - Rendering degenerates (very short kept pieces, near-zero area junction polygon, etc.).
- Warning center UI:
  - Add a dedicated “Warnings” section in the **Left panel [control/visualization]** (or a compact badge + expandable panel) that lists current issues.
  - Each issue row supports hover/selection:
    - Hovering an issue highlights the referenced entity/entities in the viewport (temporarily visualizing them even if their visualization toggles are disabled).
    - Clicking an issue selects the primary entity and populates **Right top [detail]** with the relevant tree/details.
  - Provide filtering by severity and a “show only current selection issues” toggle.
- Fix suggestions (quick fixes):
  - For issues that can be addressed automatically, attach 1+ fix actions to the issue (e.g., “Create junction from nearby endpoints”, “Convert corner to junction patch”, “Remove degenerate kept piece”, “Re-run trim with recommended value”).
  - Quick fixes must be previewable where possible (highlight what will change) and must be undoable (integrate with undo/redo).
  - Quick fixes must be deterministic (same inputs produce same changes).
- Output panels:
  - **Right bottom [hover]** should show a short summary when hovering an issue (id, severity, label).
  - **Right top [detail]** should show full details and available quick fixes when an issue is selected.
- Keep scope tight:
  - Do not redesign the entire Road Debugger UI; integrate the warning center into the existing IA defined by `AI_93`.
  - Do not introduce new global settings unless needed; keep most controls within the warnings panel.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_101_DONE_ROADS_road_debugger_validation_warnings_and_quick_fixes`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added a deterministic validation layer producing issues with stable IDs, surfaced them in a Warnings panel with hover/selection sync, and implemented initial quick-fix actions.
