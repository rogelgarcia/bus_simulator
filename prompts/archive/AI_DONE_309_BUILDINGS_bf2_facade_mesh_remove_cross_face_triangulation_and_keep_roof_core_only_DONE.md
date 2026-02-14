# DONE

## Summary
- Generate roof/top triangulation from MinPerimeter (core) loop only (no bay/corner-cut vertices).
- Add `userData` tags for BF2 roof meshes to make inspection/tests reliable.
- Add a headless regression test to lock in deterministic, 4-vertex / 2-triangle roof cores under bays + corner cutouts.

#Problem

In Building Fabrication 2 (BF2), the generated facade mesh wireframe can contain many “random” long diagonals and connections after corner cutouts / corner sharing behavior is introduced (see prior corner-related work).

Observed issues:
- Vertices belonging to bays on one face connect directly to vertices belonging to bays on other faces that are **not adjacent**.
- There are many unnecessary internal diagonals that pollute the mesh topology.
- Some diagonals visually cross other edges/lines, making the mesh hard to reason about and debug.
- Mirrored/opposite faces do not consistently produce symmetric topology because triangulation diagonals vary with vertex pool/order.

Expected behavior:
- Bays on each face should form a clean, ordered outline for that face.
- That outline should connect to a stable **core/minimum perimeter** (“inner loop”) in an organized way.
- The roof/top surface should be based on the stable core loop and should not be polluted by bay breakpoint/extrusion vertices.
- Corner stitching should only connect **adjacent** faces at corners (no cross-building connectivity).

# Request

Update the BF2 facade mesh generator to eliminate cross-face triangulation artifacts and produce a clean, deterministic, symmetric mesh topology that matches the BF2 facade mesh construction spec.

Tasks:
- Update `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md` to explicitly define and enforce:
  - roof/top triangulation uses `MinPerimeterLoop` vertices only (no bay breakpoint/extrusion vertices),
  - non-roof triangles never connect non-adjacent faces (only same-face or adjacent-corner patch connectivity),
  - generic “triangulate everything” over a mixed vertex pool is not allowed for primary wall/cap surfaces.
- Update the facade mesh generation implementation so that:
  - the roof/top surface is generated from the **minimum perimeter** only and is isolated from bay vertex pools,
  - face wall surfaces are generated deterministically from per-face breakpoint segments (shared edges, no duplicate overlays),
  - depth transitions produce local “return” surfaces at breakpoints instead of introducing long diagonals,
  - corner patches only stitch adjacent faces and never connect across non-adjacent faces,
  - results are deterministic and symmetric under mirrored inputs.
- Add debug/validation checks (implementation-defined) that can detect and report:
  - non-roof triangles that connect non-adjacent faces,
  - roof triangles that reference non-core vertices,
  - invalid outlines (self-intersections / non-closure) and broken triangles.
- Add a deterministic regression test (headless if needed) that reproduces the problematic scenario (bays + corners) and fails if:
  - roof triangles include bay vertices, or
  - wall/cap/corner triangles connect non-adjacent faces, or
  - output topology differs across repeated builds with the same input.

Constraints / notes:
- Follow `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md` as canonical.
- The fix must be rotation-agnostic (no global X/Z assumptions).
- Keep the solution deterministic and debuggable (avoid silent triangulation fallbacks that reintroduce long diagonals).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_309_BUILDINGS_bf2_facade_mesh_remove_cross_face_triangulation_and_keep_roof_core_only_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
