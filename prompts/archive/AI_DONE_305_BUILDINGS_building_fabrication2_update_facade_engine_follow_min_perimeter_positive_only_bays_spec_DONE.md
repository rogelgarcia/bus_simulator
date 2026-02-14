#Problem (DONE)

Building Fabrication 2 (BF2) facade meshes currently exhibit topology and correctness issues that make the results look unstable and hard to debug:
- Bays can introduce overlapping/coplar “overlay” geometry (duplicate edges/faces), causing extra diagonals (an “X” look), non-symmetry, and z-fighting workarounds.
- Negative depth and corner coupling can produce unintuitive movement that is not “normal-only” (depth changes appear to move geometry along multiple axes).
- Wedge transitions can create incorrect long edges/lines across bay boundaries (e.g., straight bay followed by wedge bay creates a spurious line from the border to the wedge’s far edge).

These issues are largely caused by the current geometry approach mixing silhouette shaping and bay detail generation, plus relying on generic triangulation/overlay surfaces.

We have updated the facade construction specification to define a deterministic, phase-based pipeline that avoids these pitfalls:
`specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md`

# Request

Update the BF2 facade mesh engine to follow the updated construction specification:
- First compute a stable **minimum perimeter** (core outline).
- Then generate bays as **positive-only** extrusions from that minimum perimeter.
- Ensure bays partition faces with **shared edges** (no overlapping duplicate surfaces).
- Ensure corner behavior is deterministic and uses the existing odd-over-even priority rule (A/C/E… win).

Tasks:
- Spec compliance (required):
  - Treat `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md` as the source of truth for phases/invariants.
  - If implementation reveals gaps, update the spec and keep code/spec consistent.
- Phase 1–3: minimum perimeter:
  - Implement “compute minimum perimeter” using per-face `dMin(F)` and the existing corner resolution/prioritization logic.
  - After the minimum perimeter is produced, treat it as stable and do not let bay geometry mutate it.
  - Ensure this works for rotated buildings and non-axis-aligned face orientations (use per-face frames: tangent + outward normal).
- Phase 4: bays are segments with shared edges (no overlaps):
  - Represent each face as a collection of bay segments that share boundary edges (adjacent bays share the same edge vertices).
  - Ensure adjacent faces share the same corner edge/vertex data (no duplicate overlapping corner edges).
  - Remove/avoid coplanar overlay rendering for bays; do not rely on polygonOffset to hide duplicates.
- Positive-only extrusion:
  - Enforce that bay extrusion depth is non-negative (`e >= 0`) relative to the minimum perimeter.
  - Any authoring values that would imply negative bay extrusion must be absorbed into `dMin(F)` or clamped deterministically (per spec).
- Wedge / square extrusion topology (deterministic):
  - Wedge extrusion:
    - Top-down: top cap becomes a triangle when only one endpoint is extruded.
    - Front view: generate the exterior face quad (slanted if needed) plus the required return quad(s) where the extrusion steps against neighboring segments.
    - Do not create redundant “base” triangles where the un-extruded roof/face already exists.
  - Square extrusion:
    - Generate a top cap quad plus the necessary return quads to form the extrusion volume; keep topology deterministic and minimal.
- Corner extrusion conflict rule (odd wins):
  - When two adjacent faces both try to extrude into the same corner:
    - The odd-indexed face (A/C/E…) wins.
    - The even-indexed face must not extrude into the corner (clamp or ramp to `e=0` in a corner zone) to prevent overlaps.
  - Keep this rule pluggable so future strategies can be swapped without rewriting the core generator (per the corner strategy interface work).
- Debuggability and safety:
  - Add optional debug outputs to inspect:
    - per-face frames
    - computed `dMin(F)` and `e(F,u)` samples
    - corner winners and resolved corner positions
    - a summary of generated surfaces (counts by type: wall quads, return quads, top cap quads/triangles)
  - Prefer explicit warnings and deterministic cleanup over silently producing broken triangles.
- Regression verification (headless if needed):
  - Add a deterministic headless test (or node test) that covers:
    - straight → wedge transition does not produce spurious long edges
    - corner extrusion ownership is deterministic (odd wins; even clamps)
    - geometry contains no NaN/Infinity and avoids degenerate triangles beyond an epsilon

## Proposal (optional implementation ideas)
- Generate geometry in each face’s local `(u, n)` frame, then transform to world space, to guarantee “normal-only” behavior regardless of building rotation.
- Build per-segment surfaces explicitly:
  - one exterior wall quad per `[u_i, u_{i+1}]`
  - one return quad at breakpoints where `e` changes
  - one top cap quad/triangle per segment where `e > 0`
- Use a small “corner zone” length for clamping/ramping the losing face’s extrusion near corners to avoid T-junction artifacts.

## Quick verification
- Creating an “empty bay” does not introduce overlapping coplanar faces/duplicate edges (no “X” artifacts from overlays).
- Adding adjacent bays produces shared edges between bay segments (clean partitioning).
- Bay extrusion is positive-only relative to the minimum perimeter; negative bay extrusion does not occur.
- Straight → wedge transitions do not create incorrect long cross-bay edges/lines.
- Corner ownership behaves as expected (A/C win over B/D) and prevents corner overlap.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_305_BUILDINGS_building_fabrication2_update_facade_engine_follow_min_perimeter_positive_only_bays_spec_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Replaced coplanar facade strip overlay meshes with a single facade wall mesh that partitions segments via geometry groups/material indices (no polygonOffset).
- Added minimum-perimeter roof base + positive-only bay ring caps derived from per-face `dMin(F)` to keep the core outline stable and generate deterministic wedge/square top caps.
- Added/updated BF2 headless regressions to validate face mapping, corner winner behavior, shader stability, wedge transitions, and mesh invariants.
