# Problem [DONE]

When multiple roads overlap or cross, asphalt should not overlap. We need a
global crossing trimming engine and strong debug tooling to understand how trim
decisions are made (overlap polygons, trim intervals, kept/dropped pieces).

# Request

Implement the Road Debugger crossing trimming engine and pipeline debug
visualization:
- Detect asphalt overlaps (including near-overlaps) using robust geometry.
- Trim/split segments deterministically so asphalt never overlaps.
- Expose pipeline-step debug toggles and a live threshold control.

Tasks:
- Crossing detection model:
  - Represent each segment asphalt as an oriented strip/rectangle (OBB).
  - Broad-phase: use AABB to skip pairs that cannot overlap.
  - Narrow-phase: use OBB overlap test (SAT) for strip-vs-strip overlap.
  - Treat near-overlap as crossing using threshold `0.1 * laneWidth`, measured
    between asphalt polygons/strips.
- Overlap polygon and trim intervals:
  - Build overlap polygons for expanded strips using convex clipping
    (Sutherland-Hodgman or equivalent).
  - Project overlap to each segment axis to derive [t0,t1] on [0..1].
  - Compute a crossing anchor tCross and enforce symmetric trimming around it.
  - Union all removed intervals per segment across all overlaps.
  - Split each segment into kept pieces (0..N) from the interval complement.
  - Drop kept pieces shorter than the snap step; delete fully trimmed segments.
  - Track dropped pieces for debugging (not rendered as asphalt).
- Debug controls:
  - Add a live threshold control (default 0.1 * laneWidth).
  - Add pipeline-step toggles to render:
    - raw segments (pre-trim)
    - computed strips
    - overlap polygons
    - removed intervals [t0,t1]
    - kept pieces
    - dropped pieces (red transparent polygons)
  - Add a highlight mode that can show AABB/OBB bounds and the exact asphalt
    polygon outline for the selected segment/piece.
- Add/update browser-run tests validating:
  - Trim results are deterministic for a fixed input.
  - No kept asphalt pieces overlap after trimming.
  - Splitting into multiple pieces works and is stable.
  - Dropped pieces are tracked and only rendered when the toggle is enabled.

Constraints:
- Keep Road Debugger disconnected from city/gameplay systems.
- Keep logic in the pipeline and keep UI as a consumer of render primitives.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added deterministic crossing trimming (AABB/SAT + overlap clipping), piece splitting/drop tracking, trim debug UI controls, and Task 58 pipeline tests.
