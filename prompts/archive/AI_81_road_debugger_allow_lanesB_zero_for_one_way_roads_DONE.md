# Problem [DONE]

Road Debugger currently assumes each road has at least 1 lane in each direction (`lanesF` and `lanesB` are constrained to 1..5). This prevents authoring one-way roads (single-direction roads), where one direction should have zero lanes.

# Request

Update Road Debugger so roads can be one-way by allowing `lanesB = 0` (and potentially `lanesF = 0` if needed for future flexibility), while keeping all geometry and overlays consistent with the centerline-as-divider convention.

Tasks:
- Update the Road Debugger schema and validation to allow one direction to be zero lanes:
  - Support `lanesF` range: 1..5 (keep forward required for now unless there’s already a need for `0`).
  - Support `lanesB` range: 0..5.
- Update all derived geometry calculations to handle zero-lane directions:
  - Road width becomes asymmetric (only one side has lanes + asphalt margin).
  - Ensure the center divider is still the road “centerline” reference (divider between directions), and the missing direction simply has no lane region.
  - Ensure edge lines (lane edge/asphalt edge) are still generated correctly for the existing side only.
- Update rendering/overlays:
  - Direction centerline should only render for directions that have lanes (if `lanesB=0`, do not render the backward direction centerline or arrows).
  - Lane arrows should only appear for existing lanes/directions.
  - Any telemetry/debug panels should clearly show `lanesB=0` and the resulting widths/offsets.
- Update UI controls:
  - In road creation and road editing UI, allow setting `lanesB` to 0.
  - Ensure labels make it clear this enables one-way roads.
- Update export/import and undo/redo to support the new range.
- Add a quick verification checklist:
  - Create a road with `lanesF=2, lanesB=0` and confirm only forward direction arrows/centerline render, and asphalt width matches forward lanes + margins only.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_81_road_debugger_allow_lanesB_zero_for_one_way_roads_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Quick verification checklist
- Create a road and set `lanesF=2, lanesB=0`; confirm only forward direction centerline + arrows appear, and the left asphalt width is only the margin.
- Export schema and re-import; confirm `lanesB` stays `0`.

Summary: Allowed `lanesB=0` end-to-end (UI + schema + rendering) so one-way roads render without backward centerlines/arrows.
