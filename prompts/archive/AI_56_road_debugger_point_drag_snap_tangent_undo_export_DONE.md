# Problem [DONE]

Road Debugger needs interactive editing: moving centerline points within tiles
with snapping/clamping, plus quality-of-life tools like undo/redo and JSON
export/import for regression scenarios.

# Request

Add point editing and editing utilities to Road Debugger:
- Drag points (clamped inside tile) with optional snap-to-subgrid.
- Edit per-point tangentFactor.
- Add undo/redo and JSON export/import (stable ids preserved).

Tasks:
- Implement point dragging in the viewport:
  - Dragging moves a centerline point within its tile.
  - Points must remain inside tile bounds (clamp).
  - Dragging can move a point to another tile:
    - Update (tileX,tileY) and recompute offsets from the new tile center.
- Snapping UX:
  - Snap grid step is `tileSize / 10` with center alignment.
  - Provide a snap toggle.
  - Allow holding a key to temporarily disable snap while dragging.
  - Add optional axis-lock while dragging.
  - Show snap-cell highlight feedback when snap is enabled.
- Tangent factor editing:
  - Allow editing `tangentFactor` for the selected point (slider/number).
- Undo/redo:
  - Add undo/redo covering road creation and point dragging.
  - Add Ctrl+Z shortcut for undo (and a redo shortcut).
- Export/import:
  - Export the road debugger schema as JSON.
  - Import JSON back and preserve stable ids and deterministic rebuild output.
- Add/update browser-run tests validating:
  - Dragging updates tile coords + offsets correctly across tile boundaries.
  - Snapping produces only allowed tile/10 positions and clamps inside tile.
  - Undo/redo reverts/applies point moves and road creation deterministically.
  - Export/import roundtrips without changing derived geometry results.

Constraints:
- Keep the pipeline deterministic and driven by the schema + settings.
- Keep Road Debugger disconnected from city/gameplay systems.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added point dragging with snapping/axis-lock, tangentFactor editing, undo/redo, and schema export/import with regression tests.
