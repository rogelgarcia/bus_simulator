# Problem [DONE]

The Road Debugger needs a standalone, deterministic road engine that is not
coupled to the existing city/gameplay road code. We need a clear data schema
and a pure rebuild pipeline that produces derived geometry and render
primitives.

# Request

Implement the Road Debugger road schema and a deterministic pipeline module
that derives segments, edges, and debug render primitives from user-authored
roads.

Tasks:
- Define a serializable data schema with stable ids:
  - `Road` with `id`, `name`, `lanesF`, `lanesB`, and `points`.
  - `RoadPoint` with `id`, `tileX`, `tileY`, `offsetX`, `offsetY`,
    `tangentFactor`.
  - Derived `Segment` data with stable ids and per-segment geometry.
- Conventions:
  - Segment direction is `Pi -> Pi+1` and defines "forward".
  - Centerline is the divider between directions (asymmetric widths allowed).
  - Right-hand driving: forward lanes are on the right side of the divider.
  - Reuse lane width default `4.8` and the same tile size as the city map.
  - Asphalt margin outside last lane is `0.1 * laneWidth` on each side.
- Add a deterministic rebuild pipeline module (standalone file):
  - Input: roads + global settings (tile size, lane width, flags).
  - Output: derived geometry data + render primitives list.
  - Derived per-segment geometry includes:
    - Centerline polyline for the segment.
    - Direction centerlines for directions that have lanes.
    - Lane-edge and asphalt-edge polylines and their point markers.
    - Asphalt strip rectangle/OBB representation for the segment.
- Ensure pipeline output is stable/deterministic for the same input.
- Add/update browser-run tests validating:
  - N points produce N-1 segments.
  - Lane/asphalt offsets match the laneWidth + 10% margin rules.
  - Deterministic output for the same input ordering and ids.

Constraints:
- Keep the road engine logic isolated from city/gameplay road generation.
- Keep UI/rendering out of the pipeline module (return render primitives only).
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a standalone Road Debugger pipeline module that derives segments/edges/OBBs plus serializable render primitives, with browser tests for counts, offsets, and determinism.
