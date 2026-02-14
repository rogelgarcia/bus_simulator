# Problem [DONE]

Road Debugger currently has road/segment hover and selection, but it is not
fully synchronized between the viewport and the left roads table. This makes it
hard to understand which road/segment is being inspected or edited.

# Request

Make hover and selection bidirectionally synchronized between the viewport and
the roads table:
- Hovering in the table highlights the road/segment in the viewport.
- Hovering in the viewport highlights the corresponding road/segment row in the
  table.
- Selecting in the table selects the corresponding road/segment in the viewport.
- Selecting in the viewport selects the corresponding road/segment in the table.

Tasks:
- Define a single source of truth for interaction state:
  - `hoveredRoadId`, `hoveredSegmentId`, `selectedRoadId`, `selectedSegmentId`,
    (and selected point id if applicable).
  - Ensure ids are stable across rebuilds (use stable ids from the schema /
    derived ids from the pipeline).
- Viewport -> table:
  - Implement viewport hover picking to resolve which road/segment is under the
    pointer (prefer asphalt mesh if available, otherwise use nearest line/point).
  - Update table hover styling and auto-scroll the table to keep the hovered
    row visible (optional).
  - Implement viewport click selection and sync it into the table selection.
- Table -> viewport:
  - Ensure existing table hover/selection emits events that update viewport
    highlight/selection.
- UI behavior rules:
  - Hover should clear when the pointer leaves the viewport or the table row.
  - Selection persists until another selection is made or cleared explicitly.
  - Interactions should not trigger when interacting with UI controls (inputs,
    buttons) unrelated to selection.
- Rendering:
  - Ensure highlight style is clearly visible both in viewport and in the table
    (distinct styles for hover vs selected).
- Add/update browser-run tests validating:
  - Hover in table updates viewport highlight state.
  - Hover in viewport updates table highlight state.
  - Selection in table updates viewport selection state.
  - Selection in viewport updates table selection state.

Constraints:
- Keep changes scoped to Road Debugger modules.
- Do not change other scenes.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added viewport hover picking + UI auto-expand so hover/selection state stays synchronized between the viewport and roads table, with tests covering table↔viewport sync.
