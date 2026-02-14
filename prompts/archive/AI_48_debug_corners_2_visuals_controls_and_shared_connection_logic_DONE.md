# Problem [DONE]

The "Debug Corners 2" scene needs stronger parity with the real road pipeline
(city debugger/gameplay) and better UX for iterating on corner connections:
missing background context (sky/grass), missing asphalt rendering, unclear
connection targets, and incomplete/awkward controls (hover should work on
asphalt, yaw/edges should be editable, telemetry/legend layout).

# Request

Upgrade the Debug Corners 2 scene to look and behave like a focused version of
the real city road system:
- Use sky + grass background.
- Render asphalt and connect roads using the same connection logic as city
  debugger/gameplay (no separate algorithm).
- Improve interaction and UI panels for editing, debugging, and visualization
  toggles.

Tasks:
- Visual environment:
  - Use the same sky dome/lighting approach as other debug scenes.
  - Add a grass ground plane/world (reusing existing city world/terrain
    textures where appropriate).
- Road rendering parity:
  - Render asphalt meshes for both road segments.
  - Use the same road connection/edge stitching logic as the city debugger or
    gameplay road generator (reuse shared code; do not fork logic).
  - Ensure lane count changes affect asphalt width (constant lane width).
- Interaction improvements:
  - Allow moving and rotating a road by hovering any part of its asphalt mesh
    (not just a gizmo or a thin line).
  - Mark the "side to be connected" with a blue ring marker at the centerline
    connection point (reuse the same blue ring marker style as the connector
    debugger).
  - Add a "connecting point" overlay option that shows the actual centerline
    endpoint where the road is trimmed/ends before connection.
  - Fix/implement missing editing for yaw and number of lanes so they are
    editable from the UI and reflected immediately.
- UI layout and panels:
  - Left panel: Debug options (toggles)
    - Render asphalt (toggle)
    - Render edges (toggle)
    - Render centerline (toggle)
    - Show connecting point (toggle)
  - Top-right: a compact legend explaining colors/markers (edges, centerline,
    connecting point, active road).
  - Bottom-right: edge telemetry panel showing angles, widths, endpoints,
    trim distances, and connection solution details.
  - Keep the scene self-contained and do not change other scenes except for
    extracting reusable helpers.
- Implementation constraints:
  - Do not modify the Connector Debugger behavior.
  - Prefer reusing existing materials/mesh builders/marker utilities.
- Add/update browser-run tests validating:
  - Toggle flags change what is rendered (at least at the scene object graph
    level).
  - Lane count and yaw edits update the computed connection telemetry.
  - Connection marker position matches the computed centerline endpoint.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Updated Debug Corners 2 with sky/grass, road2 asphalt rendering via shared road generator, improved hover/edit controls, and visualization/telemetry UI.
