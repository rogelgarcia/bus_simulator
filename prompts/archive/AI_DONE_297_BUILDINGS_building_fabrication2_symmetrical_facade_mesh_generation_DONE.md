#Problem (DONE)

In Building Fabrication 2 (BF2), the generated building facade/wall meshes can show:
- Non-symmetrical triangle topology between opposite faces (e.g., face A vs face C).
- More triangles than necessary in areas that should be simple planar regions.
- Occasional broken/degenerate triangles (likely caused by very small edges, nearly-collinear segments, or loop artifacts).

This makes the building look inconsistent, makes debugging harder, and can negatively affect lighting/shadows and performance.

The likely root cause is that some portions of the wall geometry depend on generic polygon triangulation (e.g., a silhouette loop being passed through a triangulator). Generic triangulation is not guaranteed to be symmetric across mirrored faces, and small numerical differences can cause different diagonals or degenerate triangles.

# Request

Improve BF2 building facade mesh generation so that opposite faces can be symmetrical, triangle counts are more predictable, and broken/degenerate triangles are avoided.

Tasks:
- Symmetry / topology:
  - Ensure opposite facade faces (A vs C, B vs D) can generate identical/consistent topology when their bay layouts and depth settings are mirrored.
  - Reduce reliance on generic triangulation where it produces inconsistent diagonals or extra triangles.
- Robustness:
  - Prevent broken/degenerate triangles in common editing scenarios (many bays, small bay widths, small depth offsets, nearly-collinear segments).
  - Add validation or cleanup steps for generated loops/strips so invalid geometry does not reach the final mesh builder.
- Mesh efficiency:
  - Avoid unnecessary subdivision; keep planar regions as a small set of quads/triangles when possible.
  - Maintain correct normals/UVs and preserve existing material assignment behavior.
- Scope:
  - BF2 building/facade mesh generation only.
  - Do not change the user-facing bay layout features (linking, repeating, depth edge offsets, etc.), except as needed to fix mesh quality.

## Suggested approach (optional idea, not mandatory)

Consider generating each facade face mesh independently as a strip/quad-based mesh, then connecting faces at corners afterward:
- Build a per-face polyline along the facade direction (u-axis) using the resolved bay boundaries and depth offsets.
- Create a “front” edge and a “back” edge for the face using the same segment breakpoints, then connect them with quads (two triangles per segment) using a consistent diagonal rule.
- This can make mirrored faces naturally symmetric because they share the same breakpoint structure and deterministic triangle diagonals.
- After generating the four independent face meshes (A/B/C/D), stitch them at corners with a small, deterministic “corner patch” strategy (e.g., miter/bevel rules) so that:
  - Adjacent faces share consistent corner vertices.
  - Depth differences across faces do not produce gaps or overlaps.

This idea aims to replace unpredictable polygon triangulation with a deterministic quad-strip topology per face, while still supporting per-bay depth offsets and wedge-like features.

## Quick verification
- Generate buildings with mirrored bay layouts on opposite faces; the triangle topology looks symmetrical (same diagonal patterns).
- No visible broken triangles when using many bays, small bay widths, and small depth offsets.
- Triangle count is reduced or remains stable in planar regions compared to before.
- No gaps/overlaps at facade corners; corners remain watertight or visually correct.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_297_BUILDINGS_building_fabrication2_symmetrical_facade_mesh_generation_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Quantized rect-facade silhouette points and ignored micro depth jitter to keep topology stable and symmetric.
- Hardened rect-facade loop simplification (min-edge pruning + near-collinear cleanup) before extruding walls.
- Added a headless BF2 regression test to prevent triangle explosions from micro depth noise.
