# DONE

#Problem

Building Fabrication 2 (BF2) currently lacks a clear, deterministic model for **bays that interact at corners** when adjacent faces both want to “occupy” the corner region (via positive or negative depth behavior).

Today, corner interactions can produce:
- Unintuitive coupling (changes appear to move geometry along multiple axes instead of “normal-only”).
- Overlapping/duplicate wall geometry near corners.
- Unstable topology (extra diagonals, broken triangles) when corner-adjacent bay behavior changes.

We need a single-pass, deterministic approach where the corner algorithm receives **suggested cut lengths** from the two adjacent faces and resolves a stable **L-shaped corner cutout region**. For now, the cutout simply means **the wall geometry is removed** in that region (a void). Later, when windows are introduced, the same cutout logic will be reused to place corner windows into the opening.

# Request

Update the building specifications and implement engine support for **single-pass corner bay cutouts** (L-shaped wall removals) in BF2.

Tasks:
- Update specs (required):
  - Update `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md` to define corner window cutouts as a first-class concept within the construction phases.
  - If needed, update the facade layout spec (`specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`) to define how faces/bays express **corner bay cut** intent (e.g., which bay(s) request a corner cut, and how cut “wants” are computed).
  - The spec MUST clearly distinguish:
    - minimum perimeter computation (core outline)
    - bay extrusion (positive-only, outward)
    - corner cutouts (removing wall area for corner-adjacent bay interactions; windows will reuse later)

## Corner Cutout Definition (normative)

For each footprint corner `C` shared by two adjacent faces `Fprev` (ends at `C`) and `Fnext` (starts at `C`):

### Inputs
- `wantCutPrev` (meters): desired cut length along `Fprev`’s tangent direction from the corner into the face interior.
- `wantCutNext` (meters): desired cut length along `Fnext`’s tangent direction from the corner into the face interior.

These “want” values are authoring-level intents (implementation-defined source), but MUST be treated as non-negative. They may be derived from bay settings near the corner (depth style, bay type, authoring toggles), but the cut solver only needs the scalar desires and constraints.

### Local frames (rotation-agnostic)
- Use each face’s local ground-plane frame:
  - tangent `t(F)` along the face edge
  - outward normal `n(F)` perpendicular to `t(F)`
- Cut lengths are applied along tangents:
  - A cut does **not** move geometry along `n(F)`; it consumes face length along `t(F)`.

### Feasibility limits via minimum bay width
Define a global or per-face minimum bay width `minBayWidth` (normative default: `0.1m`).

For each corner and face, compute a maximum feasible cut length:
- `maxCutPrev`: the maximum cut allowed on `Fprev` without reducing the adjacent bay segment(s) below `minBayWidth`.
- `maxCutNext`: same for `Fnext`.

The spec must define how these are computed from the solved bay layout near the corner (e.g., based on the first bay segment width adjacent to that corner, or based on available padding).

### Resolution (single pass)
Compute resolved cut lengths:
- `cutPrev = clamp(wantCutPrev, 0, maxCutPrev)`
- `cutNext = clamp(wantCutNext, 0, maxCutNext)`

If there is an additional global corner policy that requires further reduction (optional), apply it deterministically.

### Deterministic precedence (odd wins)
If both faces request cuts that cannot be fully satisfied due to constraints, apply deterministic priority:
- Odd-indexed faces (A/C/E/…) win over even-indexed faces (B/D/F/…).
- Concretely: when reductions are necessary, reduce the losing (even) face’s cut first (down to 0 if required), then reduce the winning face if constraints still require it.

### Geometry result (L-shaped cutout)
The resolved cutout is an L-shaped removal of wall near the corner:
- On `Fprev`, remove wall for the interval `[L(Fprev) - cutPrev, L(Fprev)]` near the corner endpoint.
- On `Fnext`, remove wall for the interval `[0, cutNext]` near the corner start.

This implies:
- The two faces no longer meet with a solid wall at the corner.
- The remaining wall geometry on each face must terminate at the cut endpoint.

It is explicitly allowed to introduce new vertices at:
- the cut endpoint on `Fprev`
- the cut endpoint on `Fnext`
- any additional vertices required to produce a watertight cut boundary and support window frame geometry.

## Engine implementation outcomes
- Wall generation:
  - Wall mesh generation MUST not create wall faces within the corner cutout regions.
  - No overlapping duplicate surfaces/edges are allowed for the cutout boundary.
  - The cut boundary must be watertight and deterministic.
- Do not implement window meshes yet:
  - The output of this task is the *cutout region in the wall* (a void).
  - Later, window placement will reuse the same resolved cutout region and ownership rules.
- Compatibility:
  - Works with rotated buildings and non-axis-aligned faces (always apply cut distances along face tangents in local frames).
  - Respects `minBayWidth` and never reduces bay segments below the minimum.

## Proposal (optional implementation ideas)
- Treat corner cutouts as a pre-processing step on the solved bay intervals:
  - Trim the first/last bay segment intervals by `cut` near corners (producing a “masked” interval list for wall generation).
- Later: add a dedicated “corner window module” that consumes the resolved cut polygon/edges and fills the void with frames/glass.

## Quick verification
- Creating a corner cut intent on two adjacent faces produces an L-shaped opening at the corner (no wall column).
- Cuts clamp correctly when they would violate `minBayWidth` (default `0.1m`).
- Odd faces win when both sides compete for the same corner space (even face cut is reduced first).
- Geometry is watertight at the cut boundary; no overlapping coplanar wall faces at the corner.
- Works the same when the building is rotated (cuts still align to the correct face tangents).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_306_BUILDINGS_building_fabrication2_corner_window_cutouts_single_pass_l_shape_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary

- Added corner cutouts as a first-class phase in `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md`.
- Documented `FacadeSpec.cornerCutouts` in `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.
- Implemented tangent-only corner cutouts in BF2 silhouette generation and ensured bay material overrides remain deterministic.
- Added a headless regression test to verify corner vertices are removed when cutouts are enabled.
