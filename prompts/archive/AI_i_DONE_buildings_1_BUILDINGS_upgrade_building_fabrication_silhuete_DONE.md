DONE
# Problem

Upgrade building fabrication silhouette quality.

# Request

Improve building fabrication silhouette behavior and visual output through iterative requirements and implementation cycles.

## Requirements Checklist
- [x] Upgrade building fabrication silhouette quality.
- [x] Remove tile coupling from building size authoring; building footprint/size must be fully tile-independent and defined in meters.
- [x] Add flexible building size controls in meters; while size changes, bays should update automatically with rebuilds capped to 4Hz (every 250ms).
- [x] Treat BF2-authored silhouette and size as default values only; city builder/runtime can override silhouette and dimensions arbitrarily per placed building.
- [x] Add `Adjust Layout` mode for direct layout editing in viewport.
- [x] Face adjustment: hover highlights the full face edge line and overlays an always-on-top wall gradient; dragging moves the face along its normal and updates both adjacent corners/edges together.
- [x] Edge adjustment: hover shows an edge ring handle; dragging moves that edge handle freely in any direction.
- [x] Edge adjustment edits a single corner vertex (not rigid whole-edge translation).
- [x] Shift modifier during edge adjustment snaps movement to the tangent direction of the closest wall line.
- [x] During face/edge adjustment, enforce minimum size constraints in local silhouette directions (affected face/edge normals-tangents and opposing boundaries), not global X/Z axes; clamp drag so sizes never go below allowed minimums even if pointer moves further.
- [x] If bay constraints allow smaller values, the absolute minimum allowed width for any affected facade run is `1.0m`.
- [x] Vertex control: while dragging a corner, holding `Control` prefers snapping to a 90-degree corner when close enough.
- [x] Place `Adjust Layout` in the building action row (`+ Floor` / `+ Roof`), right-aligned.
- [x] Facade hover selector bar must align with each hovered facade edge (correct per-face rotation) and render on the building base line.
- [x] Add a visible `Adjust Layout` text label on the adjust button.
- [x] Allow moving the camera with the left mouse button (outside tool-capture modes).
- [x] In adjustment mode, show an overlay panel above the ruler panel with a `Close` button to exit adjustment mode.
- [x] Fix `Adjust Layout` action button sizing so the icon+label button is not squashed.
- [x] While dragging (mouse held) in adjustment mode, show on-ground width guides for adjacent faces: for face drag show both adjacent face widths; for corner/edge drag show both adjacent face widths.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- Interactive session started from `start ai` with subject: "upgrade building fabrication silhuete".
- Implemented meter-based `footprintLoops` defaults in BF2, export, generator, city runtime, and city spec import/export pipeline.
- Added BF2 `Adjust Layout` tool with face-normal drag, corner drag, shift tangent snap, visual hover overlays, and corner ring handle.
- Added drag-time rebuild throttling (`4Hz`) and final immediate rebuild on drag end.
- Added local facade minimum-width clamping from bay constraints with absolute `1.0m` floor.
- Added Control-modifier right-angle snap preference for corner dragging (nearby 90-degree corner snap).
- Moved `Adjust Layout` toggle into the right-panel building action row (with `+ Floor` / `+ Roof`) and right-aligned it.
- Fixed hovered facade selector bar transform: per-facade edge alignment + base-line placement at building bottom.
- Updated the adjust control to render a visible `Adjust Layout` label beside the icon.
- Enabled BF2 camera orbit via left mouse drag for normal navigation, while keeping ruler/layout modes as left-button capture modes.
- Added an adjustment-mode overlay panel above the ruler tools with a `Close` button that exits adjustment mode.
- Fixed `Adjust Layout` action button CSS specificity/sizing so the labeled button keeps full width and spacing.
- Added adjacent-face width guide display during active layout drag (face drag and corner drag), rendered on-ground with projected width labels.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
