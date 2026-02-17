# Building v2 — Facade Mesh Construction Phases (BF2)

Status: **Proposed (draft)**  
Scope: **Deterministic facade/wall mesh generation** for Building v2 / Building Fabrication 2 (BF2).  
Non-goals: UI authoring workflows, facade layout solving, or a concrete serialized schema.

This document specifies a **phase-based pipeline** for converting a *solved* facade layout (bays + depths) into a **watertight, rotation-agnostic, deterministic** facade mesh. The intent is to make the generator easier to reason about, easier to debug, and stable across mirrored faces and repeated builds.

Prerequisites / related specs:
- Facade layout model and depth authoring: `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- Engine responsibilities and general requirements: `specs/buildings/BUILDING_2_SPEC_engine.md`
- Face identity and footprint topology constraints: `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

---

## 1. Goals and invariants

The facade mesh generator MUST:

- **Be deterministic**: identical inputs produce identical topology and vertex ordering (within floating-point tolerance).
- **Be rotation-agnostic**: no hardcoded axis assumptions (faces may be at any angle).
- **Use normal-only depth**: authored depth affects geometry only along each face’s outward normal in the ground plane.
- **Treat corner cutouts as tangent-only trims**: when enabled, corner cutouts consume face length along `t(F)` near corners (not along `n(F)`), and are applied as a distinct phase from depth/bay extrusion.
- **Compute a stable minimum perimeter first**: before generating bay extrusion geometry, compute a top-down **minimum perimeter** (stable core outline) via per-face baseline depths and corner resolution. After this phase, the core perimeter is treated as stable.
- **Use positive-only bay extrusion**: bays MUST NOT inset/shrink geometry after the minimum perimeter is computed. Bay extrusion depth is **non-negative** and applied outward from the minimum perimeter.
- **Keep roof/top triangulation isolated from bay vertices**: the roof/top surface MUST be generated from the **minimum perimeter** (`MinPerimeterLoop`) only. Roof triangles MUST NOT reference bay breakpoint/extrusion vertices, and roof triangulation MUST NOT be performed over a combined “all vertices” pool.
- **Be symmetric when mirrored**: opposite/mirrored faces with mirrored inputs produce symmetric topology (no arbitrary triangulation diagonals).
- **Make corners explicit**: corner coupling is expected, but corner behavior MUST be deterministic and governed by a **pluggable corner strategy**.
- **Avoid overlapping duplicate surfaces**: bays MUST partition a face into segments that **share vertices/edges**. The generator MUST NOT create coplanar “overlay” faces for bays (no duplicate edges hidden by polygon offset).
- **Be robust**: handle small segments and near-collinear conditions without producing broken triangles; emit warnings rather than silently “doing something”.
- **Support debug inspection**: intermediate products (frames, breakpoints, resolved corners, outlines) should be inspectable (format is implementation-defined).

---

## 2. Terminology and coordinate frames

### 2.1 World and ground plane

This spec assumes a standard 3D world with:
- A defined **Up** axis (typically +Y).
- A **ground plane** perpendicular to Up (typically XZ).

All facade outline reasoning in Phases 1–5 is performed in the **ground plane** (top-down), then lifted/extruded vertically.

### 2.2 Face, corners, and direction

- A **Corner** is a footprint vertex.
- A **Face** is a footprint edge between consecutive corners, ordered clockwise (see topology spec).
- Each face has a **start corner** and **end corner**, defining a direction along the footprint order.

### 2.3 Per-face local frame (ground plane)

For each face `F` in a given layer, define a local orthonormal basis in the ground plane:

- Tangent `t(F)` (unit): points along the face from its start corner to its end corner.
- Outward normal `n(F)` (unit): points outward from the building footprint, perpendicular to `t(F)` in the ground plane.

The specific computation of “outward” is implementation-defined, but MUST be consistent with the footprint orientation so that `n(F)` always points exterior.

### 2.4 Face-local coordinates (`u`, `v`, `dAuth`, `dMin`, `e`)

Define face-local axes:
- `u` (meters): distance along `t(F)` from the face start corner (`u=0`) to the end corner (`u=L`).
- `v` (meters): vertical axis along Up (increasing upward).

Define depth-related scalars/functions:
- `dAuth(F, u)` (meters): the **authored** depth value along `n(F)` at position `u`. This is the authoring-level input and may be positive or negative.
- `dMin(F)` (meters): the per-face **minimum depth** value, used to construct the **minimum perimeter** (core outline). Normative default:
  - `dMin(F) = min_u(dAuth(F, u))` across all breakpoint samples on the face.
- `e(F, u)` (meters): the **bay extrusion delta** relative to the minimum perimeter. It MUST be non-negative:
  - `e(F, u) = max(0, dAuth(F, u) - dMin(F))`

The effective exterior depth at `u` is:
- `dEffective(F, u) = dMin(F) + e(F, u)`

### 2.5 Normal-only depth contribution

“Normal-only depth” means:

- Any depth value offsets geometry **only** along the face outward normal: `+n(F) * depth`.
- Depth MUST NOT introduce any tangent displacement component (no “sliding” along `t(F)` as part of depth).

If the authored intent includes “wedge-like” behavior (different depth at the left vs right edge of a bay), it is represented as **variation of `dAuth(F, u)`** along `u` (piecewise linear), not as a different axis or a special corner rule.

In this spec’s default model:
- The **minimum perimeter** is constructed using `dMin(F)` (Phase 3).
- All **bay extrusion** geometry is built using `e(F, u) >= 0` (Phase 4).

### 2.6 Corner cutouts (tangent-only)

Corner cutouts are a separate concept from depth:

- Depth affects geometry along `n(F)` (normal-only).
- Corner cutouts affect geometry along `t(F)` (tangent-only trims), removing wall area near corners as an L-shaped opening/void region.

For each footprint corner `C` shared by faces `Fprev` (ends at `C`) and `Fnext` (starts at `C`), define:

- `wantCutPrev` (meters): desired cut length into `Fprev` from the corner along `t(Fprev)` (toward the face interior).
- `wantCutNext` (meters): desired cut length into `Fnext` from the corner along `t(Fnext)` (toward the face interior).

The corner cut solver MUST:

- Treat inputs as non-negative.
- Compute per-face feasibility maxima (`maxCutPrev`, `maxCutNext`) that preserve a minimum segment width (normative default `minBayWidth = 0.1m`) on the corner-adjacent segment.
- Resolve `cutPrev`, `cutNext` deterministically (clamp + deterministic precedence when further reductions are necessary).

Corner cutouts MUST NOT move any geometry along `n(F)`; they only consume length along `t(F)` at the corner ends.

---

## 3. Inputs and derived data

### 3.1 Required inputs

The generator takes, for each applicable floor layer:

- **Footprint geometry** producing faces and corners (topology-stable across layers).
- A **solved facade layout** per face:
  - A flat list of resolved bays (each has `uStart`, `uEnd`, and stable `bayId`).
  - Reserved corner zones and corner policies (if used by the model).
- **Depth authoring inputs** (as specified by facade layout spec):
  - Face default depth (if any).
  - Per-bay depth:
    - uniform offset, or
    - per-edge offsets (`left` and `right`) enabling wedge-like depth variation.
  - (Optional) segment-level depth intent (e.g., opening inset, column extrude).
- **Vertical extents**:
  - floor count and floor height, or an equivalent description of facade vertical bands.
  - layer base height offsets.
- **Material + UV intent**:
  - effective wall material per face/bay (including linked/slave inheritance).
  - texture flow/tiling rules where applicable.

### 3.2 Derived data products (conceptual)

The pipeline produces (conceptually) the following intermediate products:

- `FaceFrame(F)`: start/end points, length `L`, and basis vectors `t(F)`, `n(F)`.
- `Breakpoints(F)`: an ordered list of `u` positions where topology or depth changes.
- `DepthProfileAuth(F)`: a piecewise linear function `dAuth(F, u)` defined across the face.
- `MinDepth(F)`: the scalar `dMin(F)` used for minimum perimeter construction.
- `ExtrusionProfile(F)`: a piecewise linear function `e(F, u)` defined across the face with `e(F, u) >= 0`.
- `EndpointConditions(F)`: the boundary conditions at `u=0` and `u=L` needed for corner resolution.
- `ResolvedCorner(C)`: corner strategy output for each footprint corner.
- `MinPerimeterLoop`: a closed, ordered polyline loop in the ground plane representing the **minimum perimeter** after applying `dMin(F)` and resolving corners.

These names are conceptual and do not imply specific types or files.

---

## 4. Construction phases (ordered)

### Phase 1: Face extraction + local frames

For each applicable layer:

1) Extract faces from the footprint polygon in clockwise order.
2) For each face `F`, compute `FaceFrame(F)`:
   - `t(F)` from start→end corner in the ground plane.
   - `n(F)` as the outward unit normal in the ground plane.
3) Validate basic geometry:
   - Face length `L` MUST be positive and above a minimum tolerance (implementation-defined).
   - Frames MUST be well-defined (no NaNs, no zero-length basis vectors).

**Invariant:** All later phases MUST use `t(F)`/`n(F)` rather than assuming global axes.

### Phase 2: Per-face breakpoint and depth profile generation

For each face `F`:

1) Build the **breakpoint set**:
   - MUST include `u=0` and `u=L`.
   - MUST include every bay boundary (`uStart`, `uEnd`).
   - MUST include any additional points required to represent depth changes:
     - discontinuities at bay boundaries,
     - wedge-like depth changes (where `left != right`),
     - any segment-level depth transitions (if applicable).
   - SHOULD include any reserved corner extents if the model uses corner reserve zones.

2) Construct the **authored depth profile** `dAuth(F, u)`:
   - Depth is a scalar in meters; positive extrudes, negative insets (authoring-level).
   - When per-edge depth offsets are used for a bay, the depth across that bay interval MUST vary **linearly** from the left edge depth at `uStart` to the right edge depth at `uEnd` (unless otherwise specified by future model rules).
   - Apply depth stacking in a deterministic order (e.g., face default then bay override then segment override), consistent with `BUILDING_2_FACADE_LAYOUT_SPEC.md`.

3) Normalize and validate breakpoints:
   - Breakpoints MUST be strictly increasing along `u`.
   - Near-duplicate breakpoints (within tolerance) MUST be merged deterministically.
   - Segments shorter than a minimum length tolerance MUST be eliminated deterministically (with a warning), rather than producing degenerate triangles.

4) Compute the per-face minimum depth:
   - Sample `dAuth(F, u)` at all breakpoints (and any additional required samples, such as wedge interior points if used).
   - Compute `dMin(F)` deterministically as the minimum sampled value.

5) Compute the **positive-only extrusion profile**:
   - For all samples/breakpoints, compute `e(F, u) = max(0, dAuth(F, u) - dMin(F))`.
   - This ensures all bay extrusion depths are non-negative.

**Output:** `Breakpoints(F)`, `DepthProfileAuth(F)`, `MinDepth(F)`, and `ExtrusionProfile(F)`.

### Phase 3: Minimum perimeter (top-down) construction and corner resolution (pluggable)

This phase produces a stable top-down **minimum perimeter** (core outline) to anchor deterministic meshing and the roof outline.

For each face `F`:

1) Construct the face’s **candidate minimum-perimeter offset segment** in the ground plane:
   - The minimum perimeter offset for a face is based on `dMin(F)` (a scalar).
   - Compute the base face endpoints (start corner and end corner).
   - Offset each endpoint by `n(F) * dMin(F)` to produce the candidate offset endpoints.
   - The candidate is a straight segment between those endpoints (in the ground plane).

2) Resolve each footprint corner using the **corner resolution strategy**:
   - Each physical corner is shared by two adjacent faces.
   - The two faces may propose different endpoint offset points and/or tangents.
   - The strategy MUST deterministically produce:
     - a resolved corner position (or a small resolved corner patch footprint),
     - and per-face boundary conditions for stitching (ownership, trim/extend, etc.).

3) Assemble the **MinPerimeterLoop**:
   - Adjacent faces MUST agree on shared corner outputs produced by the strategy.
   - The loop MUST be closed and ordered consistently with the footprint (clockwise).
   - The loop SHOULD avoid self-intersections; if self-intersections occur, they MUST be treated as a validation failure (see §6).

**Output:** per-corner resolved data + a complete `MinPerimeterLoop`.

### Phase 4: Per-face facade mesh generation as deterministic strips/quads

For each face `F`, generate its wall mesh using deterministic topology:

1) Determine the face’s **baseline boundary**:
   - The baseline boundary is the portion of the `MinPerimeterLoop` belonging to this face (including resolved endpoints).
   - This baseline is stable once Phase 3 completes and is the boundary used by the roof/top surface.

2) Treat the face as a **collection of bay segments that share edges**:
   - Subdivide the face along `u` using `Breakpoints(F)`.
   - Each segment corresponds to a bay/padding interval and MUST share its boundary edge(s) with adjacent segments (no duplicate vertices on the same edge).

3) Generate the **exterior wall surface** per segment using the extrusion profile:
   - For each segment `[u_i, u_{i+1}]`, compute the segment endpoint extrusions:
     - `e0 = e(F, u_i)`, `e1 = e(F, u_{i+1})` (both are `>= 0`).
   - The segment’s exterior wall surface is the vertical quad defined by the two top-down points:
     - `P0 = baseline(u_i) + n(F) * e0`
     - `P1 = baseline(u_{i+1}) + n(F) * e1`
     - lifted across the facade’s vertical extent.
   - This quad is the *only* primary exterior surface for that segment (no overlay duplicates).

4) Generate **transition (return) surfaces** at segment boundaries:
   - When two adjacent segments meet at a breakpoint `u_i` and their extrusion differs (`eLeft != eRight`):
     - Generate a vertical “return” quad at `u_i` connecting `baseline(u_i) + n(F) * eLeft` to `baseline(u_i) + n(F) * eRight` across the facade’s vertical extent.
   - This produces clean step transitions without long spurious diagonals.

5) Generate **top caps** for positive extrusions (roof is stable):
   - The base roof/top surface is generated from the **minimum perimeter** (`MinPerimeterLoop`) and does not change due to bays.
   - Roof/top surface triangulation MUST use only `MinPerimeterLoop` vertices (bay breakpoint/extrusion vertices MUST NOT be included).
   - For each face segment with any positive extrusion, generate a top cap in the horizontal plane at the roof height:
     - If `e0 > 0` and `e1 > 0`: cap is a quad between the baseline edge and the extruded edge.
     - If exactly one of `e0`, `e1` is `> 0`: cap is a triangle (wedge cap).
     - If both are `0`: no cap for that segment.
   - The cap MUST share edges with the roof along the baseline and MUST NOT create coplanar overlaps.

6) Vertical construction:
   - Lift/extrude the top-down wall/cap surfaces across the facade’s vertical extent.
   - If the model indicates continuity across layers, vertical stitching MUST preserve watertightness at layer boundaries.

7) Openings (windows/doors) and inset reveals:
   - Openings SHOULD be introduced by explicit **cutlines** (vertical + horizontal breakpoints) so topology stays deterministic (no cross-floor triangles or arbitrary diagonals).
   - If an opening contains an inset element (e.g., recessed window), the wall SHOULD generate an inward “reveal” surface by extruding the opening boundary along `-n(F)` by a model-driven depth.
   - Reveal faces SHOULD reuse the originating wall material and MUST use meter-based UVs on both axes (including depth) to avoid stretched textures.
   - For a reveal/return side face that sits on a boundary between two neighboring wall regions, ownership MUST be deterministic:
     - choose a single owner region using forward depth (the region closer to the observer in face-local front view wins),
     - apply that owner region’s wall material to the side face,
     - and keep the result independent from UV range ordering, winding, or incidental segment iteration order.

**Invariant:** Generic polygon triangulation SHOULD NOT be used for primary face surfaces; the topology MUST be driven by explicit breakpoints and per-segment quads/triangles.
**Invariant:** For any non-roof surface group (face walls, returns, bay caps, corner patches), triangles MUST NOT connect vertices belonging to non-adjacent faces. “Adjacency” here means:
- same face, or
- adjacent faces that share a corner (and only within the corner patch region).

### Phase 5: Corner cutouts, stitching / patching, and watertightness rules

#### 5.1 Corner cutouts (tangent-only)

After Phases 1–4 have produced stable face-local breakpoints and a resolved outline:

1) Gather corner cut wants:
   - For each corner, gather `(wantCutPrev, wantCutNext)` from the two adjacent faces (authoring-level inputs; source is implementation-defined).

2) Compute per-face max cuts:
   - Determine `maxCutPrev` and `maxCutNext` such that the corner-adjacent segment on each face retains at least `minBayWidth` (default `0.1m`).

3) Resolve cut lengths (single pass):
   - `cutPrev = clamp(wantCutPrev, 0, maxCutPrev)`
   - `cutNext = clamp(wantCutNext, 0, maxCutNext)`
   - If additional reductions are required (e.g., due to degenerate corner geometry), reduce the losing face first using deterministic precedence:
     - Odd faces win over even faces (A/C/E… win over B/D/F…).

4) Apply to geometry:
   - Wall mesh generation MUST not create wall faces within the cut intervals:
     - On `Fprev`, remove the interval `[L(Fprev) - cutPrev, L(Fprev)]`.
     - On `Fnext`, remove the interval `[0, cutNext]`.
   - The resulting corner opening boundary MUST be deterministic and free of overlapping coplanar duplicates.

#### 5.2 Corner stitching / patching

Corners are stitched using explicit corner outputs from Phase 3, bay extrusion ownership rules, and (when enabled) resolved corner cutouts:

- The corner strategy output MUST provide enough data to connect adjacent face meshes without gaps/overlaps.
- If both adjacent faces request positive bay extrusion right up to a corner, the corner policy MUST be deterministic:
  - A normative default is **odd faces win over even faces** (A/C/E… win).
  - The losing face MUST NOT extrude into the corner (it is clamped or ramped to `e=0` within a corner zone), preventing overlaps.
- When corner caps are used (via corner policy), the cap geometry:
  - MUST span the full facade vertical extent,
  - MUST be owned deterministically (no double-ownership),
  - SHOULD hide small mismatches between adjacent faces rather than producing cracks.

Watertightness requirements:
- Shared edges/vertices at face boundaries MUST coincide (within tolerance).
- Adjacent faces MUST share the same corner edge/vertex data (no duplicate overlapping corner edges).
- The result MUST NOT contain holes at corners or along bay depth transitions.

### Phase 6: UVs, normals, material assignment, and validation

After topology is built:

1) Assign normals:
   - Main wall surfaces use per-face outward normals (or equivalent derived normals).
   - Derived surfaces (returns, wedges, corner patches) MUST have correct outward orientation.
   - Any smoothing/hard-edge policy is implementation-defined, but MUST be stable/deterministic.

2) Assign UVs:
   - `u`-axis mapping is driven by face-local `u` distance.
   - `v`-axis mapping is driven by vertical distance.
   - Texture flow/tiling rules from the model MUST be respected (e.g., restart per bay vs continuous).

3) Assign materials:
   - Face/bay material overrides MUST map deterministically to the generated surfaces.
   - Derived surfaces SHOULD inherit from their originating bay/face unless the model specifies otherwise.

4) Validate final geometry (see §6):
   - Non-finite vertices MUST be rejected.
   - Degenerate triangles/quads MUST be eliminated deterministically or treated as failure.

---

## 5. Corner resolution strategy (pluggable interface)

### 5.1 Role and responsibility boundary

The **outline builder** (Phase 3) is responsible for:
- producing per-face frames and per-face offset endpoint candidates,
- collecting the inputs for each corner,
- assembling the final minimum perimeter loop (`MinPerimeterLoop`).

The **corner strategy** is responsible for:
- deterministically resolving each corner from the provided candidates,
- producing enough output data to make later stitching unambiguous.

Corner strategies MUST be swappable without rewriting the outline builder or face mesher.

### 5.2 Strategy inputs (conceptual)

For a given corner `C` shared by faces `Fprev` (ending at `C`) and `Fnext` (starting at `C`), the strategy consumes:

- The original footprint corner position.
- `FaceFrame(Fprev)` and `FaceFrame(Fnext)`.
- The endpoint offset candidates:
  - candidate endpoint position on each face’s offset polyline,
  - the endpoint tangent direction (along the face offset polyline near the corner),
  - the depth values at the endpoints.
- Corner policy inputs (if used): reserved widths, ownership hints, wrap/cap intent.
- Any deterministic priority signals (e.g., face ids) required for tie-breaking.

### 5.3 Strategy outputs (conceptual)

The strategy MUST output:

- A resolved corner position (or a resolved corner patch footprint) in the ground plane.
- Per-face boundary conditions sufficient to stitch:
  - which face “owns” the corner vertex/patch,
  - whether either face should trim/extend its offset endpoint,
  - and any extra corner vertices needed for a cap/patch.
- Optional debug metadata:
  - which candidate “won” and why,
  - computed intersection/miter/bevel conditions.

### 5.4 Determinism requirement

The strategy MUST:
- be a pure function of its inputs (no hidden state),
- use stable, explicit tie-breakers (e.g., by face id order) when candidates are equivalent within tolerance,
- avoid branching on unstable floating-point comparisons without tolerance bands.

### 5.5 Default winner rule (non-normative example)

An example of a simple deterministic policy is a **winner rule**:
- Choose one of the two adjacent faces as the “winner” at a corner, and use its endpoint as the primary anchor.
- A common rectangle-friendly default is “odd faces win over even faces” (e.g., A/C over B/D), but any rule MUST generalize to N-gon footprints (e.g., by face id ordering or priority tags).

This example is **not normative**; it exists to illustrate the role of a swappable corner policy.

---

## 6. Validation and failure modes

### 6.1 Invalid input conditions (examples)

The generator MUST treat the following as invalid (hard error or warning depending on severity):

- Invalid footprint geometry:
  - self-intersections, collapsed edges, or non-manifold corner ordering.
- Degenerate face frames:
  - zero-length faces, NaN basis vectors.
- Invalid breakpoints/profile:
  - unsorted breakpoints,
  - near-duplicate points that create near-zero segments,
  - non-finite or extreme depth values.
- Invalid resolved outline:
  - loop does not close,
  - outline self-intersects,
  - outline orientation inconsistent with expected ordering.
- Invalid mesh:
  - non-finite vertex data,
  - degenerate triangles/quads beyond tolerance.
- Invalid topology coupling:
  - non-roof triangles that connect vertices from non-adjacent faces,
  - roof triangles that reference non-`MinPerimeterLoop` vertices (bay breakpoint/extrusion vertices),
  - triangles that cross outline boundaries due to unconstrained triangulation of mixed vertex sets.

### 6.2 Required behavior on invalid input

The generator MUST:

- Emit explicit errors/warnings (no silent fallback).
- Prefer deterministic cleanup where safe:
  - merge near-duplicate points,
  - remove micro segments,
  - clamp depth values to sane bounds (bounds are implementation-defined but stable).
- If a face or corner remains invalid after cleanup:
  - the generator MUST produce a deterministic “safe” output for that region, such as:
    - rendering the base wall at depth `0` for the invalid segment/corner, or
    - applying a corner cap to hide a mismatch,
    - or omitting only the problematic derived surfaces while preserving the main face strip.

The exact fallback choice is implementation-defined, but MUST be stable and MUST preserve debuggability (it should be obvious that a fallback occurred).

---

## 7. Quick verification checklist

An implementation is considered compliant with this spec if:

- Rotating a building in the world does not change the correctness of depth application (depth stays normal-only in each face frame).
- Mirrored faces (e.g., A vs C) with mirrored bay/depth inputs produce symmetric topology (same diagonal pattern and breakpoint structure).
- A stable **minimum perimeter** is computed first and is not affected by later bay extrusion geometry.
- The roof/top surface is triangulated only from `MinPerimeterLoop` vertices (bay vertices do not pollute the roof).
- Bay extrusion is positive-only (`e >= 0`) and does not shrink/inset geometry after the minimum perimeter is computed.
- Wedge-like depth transitions do not create spurious long diagonals across multiple bays; topology is driven by explicit breakpoints and deterministic per-segment caps/returns.
- Corners are watertight (no gaps/overlaps) across mixed extrusion combinations (flat vs wedge vs square), with deterministic corner ownership (e.g., odd wins over even).
- Non-roof triangles never connect vertices from non-adjacent faces (only same-face or adjacent-corner patch connectivity is allowed).
- The generator reports invalid inputs explicitly and uses deterministic cleanup/fallback behavior.
