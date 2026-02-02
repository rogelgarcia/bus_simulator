# Building v2 — Floorplan / Topology Specification

Status: **Proposed (draft)**  
Scope: **Footprint topology + face identity rules** (no implementation details)

This document defines how Building Fabrication represents a building’s **floorplan footprint** and how that footprint produces stable **Faces** (`A`, `B`, `C`, …) for facade authoring. It also clarifies that bay features (extrude/inset/wedge) may generate additional wall surfaces, but **must not** change the building’s logical face topology.

---

## 1. Goals

The system MUST:

- Represent each layer’s floorplan as a **simple polygon footprint** (clockwise corner order).
- Derive **logical faces** from the footprint edges and assign stable face identities (`A`, `B`, `C`, …).
- Support non-rectangular footprints (including **concave** shapes like L-shaped buildings) as first-class topology.
- Keep facade authoring stable across layers by enforcing topology invariants (see §4).
- Keep “angled bays / wedge bays / depth offsets” as **facade features** that generate derived geometry, not as topology edits (see §5).

Non-goals for the first iteration:

- Footprints with holes/courtyards (multiple polygons).
- Self-intersecting polygons.
- Automatically changing face count/order due to facade features.
- Solving arbitrary topology remapping across layers when corners/edges appear/disappear.

---

## 2. Terminology

- **Footprint**: A 2D polygon (in plan view) describing the building outline for a layer.
- **Corner**: A vertex of the footprint polygon.
- **Edge**: The directed segment from `corner[i]` → `corner[i+1]` (wrapping at the end).
- **Face**: A logical facade surface corresponding to a footprint **edge**. Faces are the authoring units for facades.
- **Topology**: The ordered corner list and the resulting ordered edge/face list. “Same topology” means same corner count and same corner order.

---

## 3. Footprint requirements

For any footprint used by Building Fabrication:

- Corners MUST be stored in **clockwise** order.
- The polygon MUST be **simple** (no self-intersections).
- Adjacent corners MUST NOT be coincident.
- Each edge length SHOULD be greater than a minimum practical threshold (to avoid degenerate faces that cannot host bays or corners), but the exact threshold is implementation-defined.

Concave polygons (e.g., L-shaped footprints) are allowed.

---

## 4. Topology invariants across layers

Facade authoring depends on stable face identity and consistent bay topology across layers. Therefore:

- All layers to which facade layouts apply MUST have footprints with the **same number of corners** and the **same corner order**.
- If a layer edit would cause a topology change (corner count changes, corner order changes, an edge collapses to ~0 length, corners merge/split), the configuration MUST be treated as **invalid** for the facade system (until a future remapping feature exists).
- Layer operations that offset/shrink/expand the plan are allowed only if they preserve topology (i.e., do not collapse edges or reorder corners).

This matches the “faces must match” constraint required by facade layout continuity.

---

## 5. Logical faces vs derived wall surfaces (“no fake faces”)

### 5.1 Logical faces

- Logical faces are defined **only** by the footprint edges.
- The set of logical faces for a footprint with `N` corners is `N` faces.

### 5.2 Derived surfaces (generated geometry)

Facade features may generate additional wall surfaces during 3D generation, including but not limited to:

- **Returns** on the sides of extruded/inset bays
- **Miter/bevel joints** between adjacent bays with different depth
- **Wedge/angled bay side faces**
- Corner caps or seam treatments

These surfaces:

- MUST be treated as **derived geometry**, not new logical faces.
- MUST NOT create new face ids or change face topology.
- SHOULD inherit materials/depth defaults from their originating face/bay unless explicitly overridden by future “return treatment” authoring.

Rationale: allowing facade features to create “fake faces” couples facade authoring to topology and makes face ids unstable under routine edits (e.g., toggling a wedge angle). It also complicates corner ownership, repeat solving, belt/roof alignment, and cross-layer continuity.

---

## 6. Face identity

### 6.1 Face labeling

- Faces MUST be labeled with stable letter ids: `A`, `B`, `C`, … in clockwise order.
- Face `A` corresponds to the first edge in the footprint’s ordered corner list (`corner[0]` → `corner[1]`).
- Face `B` corresponds to (`corner[1]` → `corner[2]`), and so on.

### 6.2 Stability requirements

To keep face ids stable while editing:

- Corner identity SHOULD be stable (each corner has a persistent identity in the model), and edits SHOULD primarily move corner positions rather than rebuild/reorder the corner list.
- A footprint edit that reorders corners changes which edge is face `A`, etc., and therefore MUST be considered a topology change.

Note: how the initial “corner[0]” is chosen is an editor/authoring concern. Once chosen, the system MUST preserve it (or explicitly treat changes as topology edits).

---

## 7. Relationship to facade layouts and bays

- Facade layouts are authored **per logical face**.
- Bay layouts partition the face length along the face’s local `u` axis; they do not alter the footprint.
- Bay depth (extrude/inset), wedge angles, and segment content affect geometry generation on that face, but do not create additional logical faces.

For detailed facade layout and fitting behavior, see `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.

---

## 8. Validation requirements (v1)

The system MUST validate and surface errors/warnings rather than silently falling back:

- Hard error if applicable layers do not share identical footprint topology (corner count/order).
- Hard error if a footprint is invalid (self-intersection, collapsed edges, etc.).
- Warning if an edge/face is too short to reasonably host authored bays/features (exact thresholds are implementation-defined).
