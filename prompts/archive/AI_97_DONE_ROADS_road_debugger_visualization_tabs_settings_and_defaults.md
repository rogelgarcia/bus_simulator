# DONE

#Problem

Road Debugger visualization controls are scattered and not grouped by intent. Some toggles and property panels behave inconsistently:
- View toggles are mixed with settings (snapping/trim).
- Junction properties only appear when junction visualization is enabled, instead of being independently configurable.
- Points visualization appears broken (toggle does not show points).
- Segment visualization settings need their own configuration section.
- Default toggle state on entry is not aligned with expected workflow.

# Request

Reorganize visualization + settings controls into grouped sections and fix toggle/property behavior for predictable debugging.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.
Use the unified picking service from `AI_102_ROADS_road_debugger_unified_picking_service` for any hover-driven temporary visualization behavior (avoid bespoke hover logic per panel).

Tasks:
- Create a vertical, icon-only tab selector for visualization/config panels, with sections:
  - `Roads` visualization (road overlays)
  - `Junctions` visualization (junction overlays)
  - `Segments` visualization configuration (segment-specific overlays and settings)
  - `Grid` (global)
- Keep non-view settings out of visualization:
  - Snapping and Trim belong in a `Settings` area (not under visualization tabs).
  - Group Trim with Snapping (as requested).
- Group toggles by purpose:
  - Within Roads/Junctions tabs, group toggles into `Logical` vs `Geometry` subsections.
  - Ensure labels are unambiguous (avoid “roads” at multiple levels; use “segments”, “approaches”, “connectors” where relevant).
- Fix independent property visibility:
  - Junction property controls must be visible/editable regardless of whether junction visualization is enabled.
  - Visualization toggles only affect rendering, not the availability of property editors.
- Defaults on entry:
  - On entering Road Debugger, enable asphalt + markings by default.
  - Disable centerlines, edges, tangents by default.
- Fix points toggle:
  - Make sure “points” visualization actually renders points when enabled.
  - Ensure points are still temporarily shown for hovered entities when appropriate (per hover override rules).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_97_DONE_ROADS_road_debugger_visualization_tabs_settings_and_defaults`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Reorganized visualization into vertical tabs with grouped toggles, separated snap/trim into Settings, fixed points rendering toggle behavior, and set defaults (asphalt+markings on; centerlines/edges off).
