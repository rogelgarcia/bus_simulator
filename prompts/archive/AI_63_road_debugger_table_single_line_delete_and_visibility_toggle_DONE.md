# Problem [DONE]

In the Road Debugger roads table, road rows can be visually noisy (multi-line
labels) and there is no quick way to remove a road or temporarily hide it while
keeping the geometry pipeline stable.

# Request

Improve the Road Debugger roads table:
- Render each road row as a single-line entry (no multi-line labels).
- Add a per-road delete button.
- Add a per-road visibility toggle that hides/shows that road in the viewport
  without changing the underlying geometry/connection calculations.

Tasks:
- Roads table UI:
  - Update styling/markup so each road row uses a single-line layout.
  - Add a delete/remove button per road row.
  - Add a visibility toggle per road row (eye icon or checkbox).
- Behavior:
  - Deleting a road removes it from the schema and triggers a rebuild.
  - Visibility toggle affects only rendering:
    - Hidden roads do not render in the viewport (asphalt/lines/markers).
    - Hidden roads are still included in geometry calculations such as
      crossings/trimming (do not change connections).
  - Hover/selection:
    - Hovering a hidden road in the table can still highlight it in the table,
      but viewport highlight should respect visibility (or optionally force a
      temporary reveal [better]); choose a consistent rule and document it.
- Data model:
  - Add a `visible` flag to the Road Debugger schema for roads (default true),
    or store visibility in view state keyed by road id.
  - Ensure visibility state is preserved across export/import if stored in the
    schema.
- Add/update browser-run tests validating:
  - Delete removes the road and triggers rebuild.
  - Visibility toggle hides viewport rendering but does not change derived
    geometry/trimming outputs.
  - Table rows remain single-line (basic DOM/class assertion).

Constraints:
- Keep changes scoped to Road Debugger modules.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Made road rows single-line and added per-road delete + visibility controls (render-only hiding) with tests for delete and visibility stability.
