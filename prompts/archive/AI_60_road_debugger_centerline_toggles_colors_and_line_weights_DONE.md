# Problem [DONE]

In Road Debugger, the centerline visualization is not granular enough and the
line styling does not clearly distinguish between:
- the divider centerline (middle),
- the per-direction centerlines,
- and the lane/asphalt edge lines.


# Request

Improve Road Debugger line visualization by adding independent toggles for
different centerline types, assigning distinct colors, and adjusting line
weights so key lines are easier to read.

Tasks:
- Update Road Debugger UI toggles:
  - Split the current centerline toggle into two independent toggles:
    - Show middle centerline (divider).
    - Show direction centerlines.
- Update direction centerline styling:
  - Render direction centerlines in same solors independent of direction.
- Update edge line styling:
  - Render the lane-edge lines (edge of lanes) using a distinct color from
    centerlines.
  - Render the asphalt-edge lines (edge of asphalt including the 10% margin)
    using a distinct color from lane edges and centerlines.
- Line weight adjustments:
  - Make the asphalt edge line bolder.
  - Make the middle centerline bolder.
  - Keep other lines thinner for hierarchy/legibility.
- Ensure changes are applied consistently to:
  - Normal road rendering.
  - Hover/selection highlights and table-driven road/segment highlighting.
- Add/update browser-run tests validating:
  - The two centerline toggles independently control visibility of the
    corresponding render primitives.
  - Direction centerlines have distinct colors.

Constraints:
- Keep changes scoped to Road Debugger modules and its pipeline render
  primitives.
- Do not change other scenes unless refactoring shared line utilities is needed.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Split divider vs direction centerline toggles, switched Road Debugger lines to wide Line2 styling with distinct colors and thickness hierarchy, and added tests for toggle independence and direction-centerline color.
