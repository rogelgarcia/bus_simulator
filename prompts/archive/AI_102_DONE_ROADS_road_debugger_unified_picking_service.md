# DONE

#Problem

Road Debugger interaction logic (hover, selection, dragging, table ↔ viewport sync, and hit-testing) is implemented across multiple components. This leads to inconsistencies and recurring bugs:
- Different hit radii behavior at different zoom levels.
- Hover/selection precedence rules not applied uniformly.
- UI focus issues where clicking panels disrupts map interactions.
- “Temporary visualization on hover” behavior implemented ad-hoc.

# Request

Introduce a unified Road Debugger picking service that centralizes hit-testing, hover/selection resolution, and precedence rules. All Road Debugger UI + viewport interactions must use this service as the single source of truth.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.

Tasks:
- Create a single “picking” module/service that:
  - Takes mouse position + camera + scene/map data and returns a normalized “pick result” (point/segment/road/junction/connector/background).
  - Applies the precedence rules: point > segment > road, and hover overrides selected for rendering.
  - Supports distance-aware (screen-space) hit radii for points and other small targets.
  - Provides separate APIs for hover vs click vs drag start (so drag selection doesn’t conflict with hover).
- Integrate with UI and viewport:
  - Table hover/selection should generate the same normalized pick targets (by ID) and feed into the same hover/selection state machine.
  - Hovering in the **Right top [detail]** tree should also feed the same hover pipeline (and trigger temporary visualization override).
- Focus robustness:
  - Ensure map/viewport hover and click interactions remain responsive even after interacting with UI panels (no “stuck focus”).
  - Ensure pointer capture and event listeners are managed centrally so dragging always behaves consistently.
- Debug aids:
  - Add a small optional debug overlay to show what the picking service thinks is currently hovered (type + ID), for development verification.
- Migration:
  - Replace ad-hoc hit-testing in Road Debugger components with calls to the picking service, minimizing behavior regressions.
  - Keep the public API stable so future tools (junction tool, area selection, gizmo handling) can use it too.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_102_DONE_ROADS_road_debugger_unified_picking_service`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Implemented a unified Road Debugger picking service (hover/click/drag precedence + screen-space radii) and added an optional pick debug overlay for verification.
