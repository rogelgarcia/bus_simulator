# Problem [DONE]

When starting road creation in Road Debugger, the first tile click has no clear
viewport feedback, making it easy to lose track of which tile was selected as
the initial point.

# Request

In Road Debugger, when the user clicks to create a road (the first click of a
new draft), show a visible marker in the viewport indicating the selected tile.
A blue circle marker is acceptable.

Tasks:
- Detect the first tile selection of a new road draft.
- Render a blue circle marker centered on the selected tile in the viewport:
  - Keep it slightly above the ground/asphalt to avoid z-fighting.
  - Keep it visible regardless of other overlays (reasonable renderOrder).
- Ensure the marker updates correctly:
  - If the first point changes (cancel and restart, or restart a new draft),
    remove/replace the marker.
  - When additional points are added, keep the first-point marker visible (or
    clearly indicate the first point distinctly from other point markers).
  - When the draft is Done or Cancelled, clean up the marker.
- Add/update browser-run tests validating:
  - First click creates the marker.
  - Done/Cancel removes the marker.

Constraints:
- Keep changes scoped to Road Debugger modules (`src/graphics/gui/road_debugger/`
  and its pipeline/render primitives).
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a persistent blue ring marker for the first draft point’s tile (with cleanup on Done/Cancel) plus browser tests for marker creation/removal.
