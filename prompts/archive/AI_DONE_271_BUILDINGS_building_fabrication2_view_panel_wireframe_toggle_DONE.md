#Problem (DONE)

Building Fabrication 2 does not currently offer a quick way to visualize geometry as wireframes for debugging/authoring, which makes it harder to inspect bay/layout geometry and face/layer boundaries.

# Request

Add a `Wireframe` option to the BF2 `View` panel that renders all objects as wireframes **except** the grass floor.

Tasks:
- View panel:
  - Add a toggle option named `Wireframe` under the BF2 `View` panel.
- Rendering behavior:
  - When `Wireframe` is enabled, render all scene objects in wireframe mode.
  - The grass floor must **not** be rendered as wireframe (keep its normal rendering).
  - When `Wireframe` is disabled, rendering returns to normal.
- Scope / safety:
  - The toggle affects only the Building Fabrication 2 scene (do not change global rendering defaults outside BF2).
  - Ensure the setting does not persist after leaving BF2 unless explicitly desired elsewhere (default is non-persistent).

## Quick verification
- Enter BF2: `Wireframe` toggle is present in the `View` panel and is off by default.
- Enable `Wireframe`: buildings/roads/helpers/etc render as wireframes; grass floor remains solid/normal.
- Disable `Wireframe`: everything returns to normal rendering.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_271_BUILDINGS_building_fabrication2_view_panel_wireframe_toggle_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Updated BF2 wireframe view mode to render the entire scene in wireframe (excluding `CityFloor`/ground tiles), keeping the grass floor solid.
