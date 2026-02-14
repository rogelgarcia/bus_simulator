# Problem [DONE]

In the city/map debugger road creation workflow, draft points are not clearly
visible on the map. It is also hard to preview the resulting road because
asphalt is only visible after finishing the road, instead of updating while
placing points.

# Request

While creating a road in the city debugger, render draft point markers on the
map, and render a live asphalt preview as soon as there are at least two draft
points.

Tasks:
- In the map debugger road editor mode, visually mark every placed draft point
  on the map (not just the most recent point):
  - Use a clear marker style consistent with existing overlays (ring/outline
    style is acceptable).
  - Keep markers above the surface and not z-fighting with asphalt/ground.
  - Update markers live as points are added/removed/cancelled.
- Add a live road preview during drafting:
  - Once there are at least 2 draft points, generate a temporary road spec from
    the current draft and render asphalt for it immediately.
  - Update the preview on every added point and when cancelling/removing the
    last point.
  - Ensure the preview uses the same road generation/rendering path as the real
    roads (avoid a separate preview-only algorithm).
- Keep editor UX stable:
  - Do not interfere with existing selection/highlight overlays.
  - Do not trigger drafting interactions when the pointer is over UI panels.
  - Ensure cancel/done/reset actions clean up markers and preview meshes.
- Add/update browser-run tests validating:
  - Draft markers appear when points are placed and are cleared on cancel/done.
  - Preview asphalt is only rendered when draft point count >= 2.
  - Preview updates deterministically when points are added in a fixed order.

Constraints:
- Keep state/logic in `src/states/MapDebuggerState.js` and rendering/UI code in
  `src/graphics/gui/map_debugger/` or visuals modules as appropriate.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep changes minimal and focused on draft markers + live preview.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added road draft point ring markers and live asphalt preview while drafting roads in the map debugger.
