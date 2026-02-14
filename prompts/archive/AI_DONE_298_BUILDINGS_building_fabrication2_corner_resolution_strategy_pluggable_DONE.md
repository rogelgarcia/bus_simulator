#Problem (DONE)

In Building Fabrication 2 (BF2), facade bays can apply per-bay depth offsets (extrusions/indentations). When these depth changes occur near corners, adjacent faces become coupled:
- Face A’s end depth affects the shared A↔D corner geometry.
- Face D’s end depth affects the same corner geometry.
- If both faces have different depth requirements at the corner, naive “independent face mesh” generation can produce gaps, overlaps, inconsistent topology, and/or non-deterministic results.

We need a deterministic, repeatable way to resolve corner geometry from multiple face inputs, while keeping the solution future-proof (so we can change the “who wins” rule later).

# Request

Implement a **pluggable corner resolution strategy** for BF2 facade mesh generation. The system should compute a final corner patch/connection that is consistent, deterministic, and supports swapping the “winning rule” without rewriting the mesh generator.

Tasks:
- Corner definition + inputs:
  - Define what data is considered the “corner condition” for a face (e.g., the face’s start/end depth value(s), optional corner-local profile points, and any metadata needed to resolve ties).
  - Ensure the corner resolver receives the two adjacent faces’ corner conditions for each corner (A↔B, B↔C, C↔D, D↔A), and returns a resolved corner result that can be used for stitching/patching meshes.
- Pluggable strategy interface:
  - Create a clear interface/contract for a corner resolution strategy (e.g., “given two face corner conditions, produce the resolved corner geometry / resolved corner depths / resolved shared corner vertices”).
  - The mesh generator must depend on this interface, not a hardcoded rule, so alternative strategies can be introduced later.
  - Provide a default implementation strategy as the initial behavior.
- Default winning rule (initial strategy):
  - Use a deterministic “odd face index wins over even face index” rule:
    - Faces with odd index win over even (example mapping: A=1, B=2, C=3, D=4; so A and C win over B and D).
    - The winner determines the resolved corner outcome when the two faces disagree.
  - Ensure the rule is applied consistently at all corners.
- Corner patching / stitching outcomes:
  - Adjacent faces should connect without gaps or overlaps at corners.
  - The resulting geometry should be stable (no broken/degenerate triangles) and predictable across mirrored buildings.
  - The approach should not require face widths to dynamically change; instead, the corner resolver should determine the shared corner geometry that both faces attach to.
- Debuggability:
  - Add optional debug visibility/logging to inspect which face “won” at each corner and what values were chosen.
  - Keep debugging scoped to BF2 and avoid noisy logs in normal gameplay.

## Notes / optional ideas (not mandatory)
- Treat corner resolution as a small “corner patch” generator:
  - Generate per-face wall strips up to the corner boundary.
  - Use the resolved corner result to build a small patch (miter/bevel-like) that bridges the two faces’ end conditions.
- Keep the interface flexible:
  - Allow future strategies like “max depth wins”, “min depth wins”, “average”, or “prefer continuity” without changing the mesh generator’s core logic.

## Quick verification
- Create a building where face A has a corner-adjacent bay extruding and face D has a different corner-adjacent extrusion:
  - Corner remains watertight (no gaps/overlaps).
  - The winner is deterministic per the odd-over-even rule (A wins over D; C wins over B, etc.).
- Swap the corner strategy implementation (or stub a second strategy) and confirm behavior changes without refactoring the generator.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_298_BUILDINGS_building_fabrication2_corner_resolution_strategy_pluggable_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a pluggable rect-facade corner resolution strategy interface with a default odd-over-even winner rule.
- Wired corner resolution into rect facade silhouette generation (both wall loop + facade strip endpoints) for watertight deterministic corners.
- Added a BF2 headless regression test asserting the odd-over-even corner winner behavior.
