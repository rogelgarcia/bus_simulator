#Problem (DONE)

Even with a correct top-down outline, facade meshes can still be unstable if they depend on generic triangulation (e.g., silhouette polygon triangulation). This can lead to:
- Non-symmetrical triangulation between mirrored/opposite faces.
- “More triangles than needed” in planar regions.
- Occasional broken/degenerate triangles when breakpoints are missing or nearly-collinear.
- Visual artifacts when transitioning between bay types (e.g., straight → wedge), such as incorrect diagonals/lines created across bay boundaries.

To make facade meshes predictable and symmetric, we need deterministic topology generation (primarily quads) driven by explicit per-face breakpoints.

# Request

Generate BF2 facade meshes as deterministic quad-strip geometry per face, and stitch corners with explicit corner patches, minimizing reliance on generic triangulation.

Tasks:
- Per-face deterministic meshing:
  - For each face, generate facade geometry using explicit breakpoints (bay boundaries, wedge transitions, etc.).
  - Use a consistent, deterministic triangle/quad topology so mirrored faces can be symmetric.
  - Ensure wedge bays are represented by a small number of predictable segments (e.g., 2–3 strip segments) without producing long incorrect diagonals.
- Corner patches:
  - Generate explicit corner patch geometry to connect adjacent faces cleanly using the resolved corner outputs from the corner strategy.
  - Avoid gaps/overlaps at corners for common depth combinations (positive/negative depth, mixed depths).
- Validation:
  - Add internal validation checks to catch:
    - missing breakpoints that would create long cross-bay edges
    - degenerate segments (near-zero lengths)
    - non-finite vertex data
  - Prefer deterministic clamping/cleanup over silently producing broken triangles.
- Compatibility / scope:
  - Keep existing BF2 bay authoring behavior (bays, linking, depth edge settings) intact.
  - Ensure materials/UVs/normals remain correct for existing shaders/materials.

## Proposal (optional implementation idea)
- Treat the face as a strip between an outer “reference line” and an inner offset line defined by the depth profile, then build vertical quads per breakpoint segment.

## Quick verification
- Mirrored faces produce visibly symmetric diagonal patterns in the triangulation.
- Straight → wedge bay transitions do not create spurious long edges/lines across bays.
- No broken triangles in stress cases: many bays, small bay widths, small depth changes, and mixed positive/negative depths.
- Corners remain watertight under mixed face depths.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_301_BUILDINGS_building_fabrication2_deterministic_quad_strip_facades_and_corner_patches_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Replaced the facade wall mesh path with deterministic quad-strip wall sides built from explicit breakpoints (bay boundaries + wedge transitions) instead of relying on generic polygon triangulation.
- Added explicit corner join segments based on resolved corner outputs to keep corners watertight under mixed depths.
- Kept bay/material authoring behavior intact and preserved existing headless regression coverage for corner resolution and triangle stability.
