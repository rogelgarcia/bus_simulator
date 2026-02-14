# Problem [DONE]

Creating a road with multiple points (polyline road drafting) is currently
broken in the city debugger/editor workflow. The connection logic between
consecutive segments makes it hard to debug the failure mode.

# Request

Fix multi-point road creation by first implementing a stable "segment-by-
segment" build: treat each consecutive point pair as an independent road
section during drafting and rendering, without attempting to connect/fillet
joins yet.

Tasks:
- Identify where multi-point road drafting is broken (editor state, spec
  conversion, road generator assumptions, or rendering update path).
- Change the draft-to-spec conversion so that a polyline draft generates:
  - N-1 independent road sections for N points (each section is a simple
    2-point road).
  - Sections inherit the current lane/tag parameters.
  - No join/intersection/connection logic is applied between sections yet.
- Render the draft preview using these independent sections so:
  - As soon as there are at least 2 points, the first section renders.
  - Additional points add additional independent sections.
  - Removing/cancelling points removes corresponding sections cleanly.
- Keep the final "commit road" behavior consistent:
  - Decide whether committing creates a single polyline road spec or multiple
    segment specs; choose the approach that best matches the new road pipeline
    direction, but prioritize stability and minimal regressions.
- Add clear TODO/next-step hooks so later work can reintroduce proper
  connections/fillets between consecutive sections.
- Add/update browser-run tests validating:
  - Drafting 3+ points produces N-1 rendered sections.
  - No exceptions are thrown when adding points at arbitrary angles.
  - Cancelling/done cleans up draft state and preview meshes.

Constraints:
- Keep changes minimal and focused on restoring a working multi-point road
  authoring flow.
- Do not attempt to implement final connection rounding in this task.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Implemented segment-by-segment road preview during drafting (no joins) plus undo/cleanup hooks to stabilize multi-point road authoring.
