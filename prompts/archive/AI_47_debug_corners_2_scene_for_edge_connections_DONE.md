# Problem [DONE]

We need a dedicated, focused scene to debug road corner/connection behavior
between two road segments (edges, widths, tangents, rounding) without changing
or replacing the existing Connector Debugger.

# Request

Create a new debug scene/state named "Debug Corners 2" that follows the same
interaction style as the Connector Debugger, but is specialized for connecting
two configurable road segments. The scene must help iterate on corner
connection logic by visualizing road edges, target edges, and connection
curves, and by exposing lane/rotation controls and edge debug telemetry.

Tasks:
- Add a new state and entry point for "Debug Corners 2":
  - Register a new state in `src/main.js`.
  - Add a selection option in `src/states/SetupState.js` (do not modify the
    existing Connector Debugger option).
  - Create a state file under `src/states/` similar in structure to
    `src/states/ConnectorDebuggerState.js`.
- Create a new GUI module folder under `src/graphics/gui/` for this scene (do
  not reuse/rename the connector debugger folder; reuse code by importing).
- Scene content:
  - Two road segments rendered in world space.
  - Each road segment is independently configurable:
    - Lane count (support any number of lanes; use the same lane width rule as
      the road system: constant lane width, larger road for more lanes).
    - Rotation (yaw) around its local origin.
  - Each road has two outer edges; the user can choose one edge from each road
    as the "target edge" for connection.
  - The goal is to keep both edges connected via a rounded connection curve
    between the selected target edges.
- Interaction:
  - Hover a road segment to make it the active target for keyboard rotation.
  - Keyboard rotation while hovered (choose keys consistent with existing
    debugger conventions).
  - Mouse camera controls consistent with existing debug scenes (drag, zoom),
    without interfering with UI interactions.
- UI panels:
  - A configuration panel that exposes per-road controls:
    - Lane config for road A and road B.
    - Rotation controls for road A and road B (sliders and/or numeric input).
    - Target-edge selection for road A and road B (e.g., left/right).
  - A debug info panel that reports computed values:
    - Road widths, lane counts, normals/tangents, edge angles.
    - Edge intersection points, trim distances (if any), connection radius,
      and any fallback/clamp decisions.
  - Keep these panels separate and non-invasive to other scenes.
- Connection visualization:
  - Draw centerlines and both road edges for both roads.
  - Highlight selected target edges.
  - Render the computed connection curve and show tangent points.
  - Keep visuals stable and readable across a wide range of angles/lanes.
- Code reuse constraints:
  - Do not change the existing connector debugger scene.
  - Only refactor shared utilities if it reduces duplication (e.g., reusable
    camera drag/zoom helpers or line rendering helpers).
- Add/update browser-run tests validating:
  - The new state can be registered and entered without errors.
  - The scene can build two road segments for a range of lane counts.
  - Target edge selection affects which edges are used for connection
    computation (at least at the data/telemetry level).

- each road segment can be moved by dragging with the mouse
- the roads are not tied to the grid and can be positioned freely in the scene 
- once the user stops interacting with the roads, the connection curve updates to reflect the new positions

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a new Debug Corners 2 state/view with draggable road segments, lane/yaw/edge controls, and fillet telemetry to iterate on edge-connection logic.
