#Problem (DONE)

Building Fabrication 2 (BF2) facade mesh generation has become difficult to reason about and debug as bay depth features (negative depth/indentation, positive depth/extrusion, wedges) interact near corners. Current behavior can produce:
- Non-symmetrical topology between mirrored/opposite faces.
- Extra or inconsistent triangulation due to generic polygon triangulation.
- Corner-coupling surprises where changing one face’s depth unexpectedly affects adjacent faces.
- Visual artifacts when transitioning between bay types (e.g., straight → wedge) due to missing or mis-ordered breakpoints.

We are planning a new, more deterministic construction approach based on explicit construction phases:
- Work in per-face local frames (tangent + outward normal) so the system generalizes to rotated buildings and non-axis-aligned faces.
- Treat face “depth” as a normal-only contribution.
- Resolve corners via a pluggable corner strategy (winner rules can change later).
- Generate facade geometry primarily as deterministic quad strips (instead of relying on generic triangulation), then stitch at corners.

This is a large change and needs a clear specification describing the phases, invariants, and expected outcomes so implementation can proceed safely.

# Request

Create a building specification document that explains BF2 facade mesh construction in explicit phases, including terminology, invariants, and the role of corner resolution strategies.

Tasks:
- Add a new spec under `specs/buildings/` documenting BF2 facade mesh construction phases.
- The spec MUST cover:
  - Terminology and coordinate frames:
    - Define per-face tangent (`t`) and outward normal (`n`) in the ground plane.
    - Define “normal-only depth contribution” and what it means for offsets/corners.
  - Inputs and derived data:
    - What inputs are required from bay layout (widths, bay boundaries, depth settings, wedge settings).
    - What derived data structures are produced (breakpoints, depth profiles, per-face conditions, etc.).
  - Construction phases (high-level, ordered):
    - Phase 1: face extraction + local frames
    - Phase 2: per-face breakpoint/depth profile generation
    - Phase 3: top-down core outline construction and corner resolution (pluggable strategy)
    - Phase 4: per-face facade mesh generation as deterministic strips/quads
    - Phase 5: corner stitching/patching and watertightness rules
    - Phase 6: UVs, normals, material assignment, and validation
  - Corner strategy role:
    - Define what data a corner strategy consumes and what it outputs.
    - Describe how winner rules affect corner geometry.
  - Validation and failure modes:
    - What makes a loop/profile invalid (degenerate segments, self-intersections, near-duplicate points).
    - What the generator should do on invalid input (warnings, fallback behavior, etc.).
- Keep the spec implementation-agnostic:
  - Describe WHAT must happen and WHY, not specific file names or function signatures.
  - If including implementation ideas, label them as **Proposal**.

## Quick verification
- A new spec exists under `specs/buildings/` describing BF2 facade mesh construction phases.
- The spec is clear enough for a developer to implement the pipeline and understand how corners, wedges, and rotations are handled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_299_DOCUMENTATION_bf2_facade_mesh_construction_phases_spec_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md` defining BF2 facade mesh construction phases, corner strategy interface, and validation/failure-mode expectations.
