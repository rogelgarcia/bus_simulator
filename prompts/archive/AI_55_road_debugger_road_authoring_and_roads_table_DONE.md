# Problem [DONE]

The Road Debugger scene has no way to author roads, inspect segments, or see
derived road debug geometry. We need a basic authoring workflow and a roads
table to drive hover/selection highlights.

# Request

Add road authoring and visualization to Road Debugger:
- Create multiple roads by clicking tiles to place points.
- Derive N-1 segments from N points and render debug lines/points.
- Provide a left roads table (expandable to segments) with hover highlighting.

Tasks:
- Add a bottom-center road creation popup:
  - Start a new road draft.
  - Click tiles to add draft points.
  - Done finalizes the road; Cancel discards the draft.
  - Support creating multiple roads.
- Render authored roads using the pipeline module:
  - Draw per-segment centerlines, direction centerlines, lane edges,
    asphalt edges, and point markers.
  - Add simple render toggles for these overlays (centerline/edges/points).
- Build the left roads table UI:
  - List all roads with stable ids and labels.
  - Expand a road row to show its segments.
  - Hover a road row highlights that road in the viewport.
  - Hover a segment row highlights that segment in the viewport.
- Add click-to-select for road/segment/point:
  - Show a small details panel with lane counts (F/B), point offsets,
    tangentFactor, and derived widths for the selection.
- Add per-road lane config UI (lanesF/lanesB in range 1..5) and rebuild visuals
  on change.
- Add/update browser-run tests validating:
  - Roads can be created from tile clicks (N points -> N-1 segments).
  - Hover/selection in the table triggers the expected highlight state.
  - Lane config edits update derived widths.

Constraints:
- Keep Road Debugger disconnected from city/gameplay systems.
- Keep UI/rendering in `src/graphics/` and state wiring in `src/states/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Implemented Road Debugger authoring flow (draft roads via tile clicks), pipeline-based debug rendering, roads/segments table with hover/selection + lane editing, and browser tests.
