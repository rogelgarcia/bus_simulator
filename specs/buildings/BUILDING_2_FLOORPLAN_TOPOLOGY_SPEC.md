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
- **Edge**: The directed run from `corner[i]` → `corner[i+1]` (wrapping at the end); it is straight unless it carries arc metadata.
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
- SHOULD inherit **band/belt wall decorations** from their originating face/bay: a band that reaches a bay edge turns onto the connector wall at that edge, so the course turns the corner as an L instead of stopping dead.

Rationale: allowing facade features to create “fake faces” couples facade authoring to topology and makes face ids unstable under routine edits (e.g., toggling a wedge angle). It also complicates corner ownership, repeat solving, belt/roof alignment, and cross-layer continuity.

#### 5.2.1 Decoration inheritance on connector walls

Inheritance exists **because derived surfaces have no authoring identity**: a connector wall carries no bay id, so no decoration set can ever target it. It therefore inherits from a neighbour. A neighbouring bay front *does* have a bay id, so it is authorable and MUST NOT be claimed by inheritance — a decoration never spills onto the next bay, and never over that bay's doors or windows.

Ownership of a connector wall is by depth:

- The **proud** side of the depth step owns the connector, because the connector is the side wall of that bay's own mass. This is the same outmost-depth ownership used for face-boundary corner resolution (`BUILDING_2_SPEC_model` §6).
- Inset bay B between A and C: both connectors are owned by A and C respectively.
- Extruded bay B between A and C: both connectors are owned by B.
- Two bays can never claim the same connector, because equal depths generate no connector at all.

Each wall decoration carries `inheritOnDerivedSurfaces: boolean` (default `true`, matching the SHOULD above). Set it to `false` to stop the decoration at the bay edge instead.

- The flag only affects **band-shaped** decorators — those whose face specs are a flat course plus its caps (`simple_skirt`, `ribbon`, `angled_support_profile`). A projecting awning or a dentil cornice has no meaningful reading on a 0.3m return, so the flag is a no-op for them.
- A connector segment inherits the **originating bay's** material selection, so `match_wall` resolves the same on the connector as on the bay it came from.
- At the joint, both sides extend by the band's own surface offset and drop their end caps, so the corner closes as an L instead of leaving a gap or overlapping visibly. A connector band is built to the connector's true width — decorators MUST NOT clamp a decorated surface up to a minimum width, or the band overhangs the corner it is supposed to turn.
- A partial `span` that stops short of a bay edge produces no joint on that side, and therefore no continuation.

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

### 6.3 Persisted run identity

- An authored footprint point MAY carry `runId` and `runForward`; the metadata belongs to the edge beginning at that point.
- `runId` is the stable logical face id and MUST be a unique letter `A..Z` within the loop.
- `runForward` records whether the point-list edge direction matches the facade's authored local-u direction. Winding normalization MUST transfer the run metadata to the reversed edge and invert `runForward`.
- Geometry-only transforms MUST preserve this metadata. Connector-wall edits allocate unused ids without renaming existing runs.

### 6.4 Circular facade runs

- A footprint point MAY attach `arc: { bulge, segments? }` to the logical run beginning at that point. `bulge = tan(signedSweep / 4)`; its sign selects the side of the chord. A non-zero finite bulge and the run endpoints determine the circle center, radius, and sweep. `segments` is an optional tessellation-quality hint, not topology.
- An arc run remains **one logical face** and keeps one `runId`. Its facade length and local `u` coordinate are circular arc length, not endpoint chord length.
- The facade frame MUST provide position, tangent, and outward normal as functions of `u`. Line/arc and arc/arc joins use the endpoint tangents; tangent-continuous authored joins therefore remain tangent after plan normalization.
- Winding reversal transfers the arc to the reversed source edge and negates its bulge. Translation and uniform scale preserve bulge; scale changes the derived radius and arc length through the endpoints.
- Wall panels and reveals, horizontal belts, floor spandrels, roof/parapet/coping loops, cornice profiles, and repeated cornice ornaments MUST consume the same sampled curve. Meter-based wall UV distance MUST continue across its tessellated segments without resetting.
- Openings on an arc solve bay widths in arc length, and one authored opening remains one opening at its solved width/count. Its existing glass, frame, wall-cut, sill/header, and storefront geometry is subdivided across width and bent through tangent samples; subdivision rings are geometry only, never semantic window repeats or extra mullions. A single flat chord spanning the curved run is not sufficient.
- The current stretch/push-pull and lot-fit tools are straight-run operations. They MUST reject or keep fixed a footprint containing arcs and surface that limitation instead of silently dropping curve metadata.
- In Building Fabrication 2, selecting a stable face exposes its footprint shape directly under the **Faces** picker: `Straight` removes the run arc; `Curved` authors an inward/outward circular bend and a sweep in degrees, converted to canonical `bulge` metadata. This control edits the shared building footprint, not a per-layer facade material/layout.
- The plan-view face picker MUST sample the same circular run for drawing, bounds, labels, and pointer hit testing. A curved run therefore appears and selects as one curved edge, never as several narrow logical faces.
- This control is the current safe authoring subset. Per-floor footprint silhouettes, freehand drawing, face repositioning, and coordinated default/proportional sizing require a separate silhouette-authoring model; the current building config has one primary footprint shared by its floor layers.

### 6.5 Collinear face split markers

- A footprint point MAY carry `split: true`. The marker belongs to the point itself and declares a logical face boundary between the incoming and outgoing collinear edges.
- Facade frame derivation MUST preserve a marked collinear boundary and expose each sub-run as its own stable `A..Z` face. Explicit `runId` / `runForward` metadata remains authoritative when present.
- Physical-loop consumers MUST ignore the logical marker and continue merging collinear runs. Cornice module fitting, corner treatments, caps, parapets, and other whole-wall operations therefore keep one physical straight run.
- Adjacent collinear faces at the same resolved depth share one point. At different depths, each face ends on its own offset line and the generated loop connects those two points with a perpendicular return wall; a parallel-line mitre is invalid.
- Import, export, city placement, plan transforms, and the BF2 editor MUST preserve `split: true` metadata.

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
- Hard error for invalid arc metadata; straight-run edit/fit tools MUST surface their explicit curved-run guard.

---

## 9. Angle-preserving face extension edits

Building Fabrication 2 exposes two plan edits and does not drag raw corners:

- **Stretch band:** a perpendicular cut is cast at either authored end of a face. Every footprint edge intersected by the cut MUST be parallel to the selected face within `0.5°`; vertex hits are epsilon-nudged. Each inside interval of a concave multi-wall cut is transformed together. Geometry on the chosen end side translates along the face tangent, so crossed faces gain or lose the same delta while every corner angle and run id stays unchanged.
- **Push/pull:** the selected face line offsets along its outward normal and re-intersects its two neighboring lines. A connected push is invalid for a parallel neighbor and clamps before any affected face falls below its facade-solver minimum.
- **Detached push:** when the selected face must move without extending its neighbors, two perpendicular connector faces bridge the old endpoints to the moved face. The moved parent keeps its id; connectors receive unused generated ids, inherit the parent face material, and start with a plain flexible bay layout.

All affected facades re-run the normal bay/group solver at their new lengths. Fixed/minimum bay sums clamp shrinking edits with a surfaced warning; repeat groups, flex bays, and arcade springing otherwise follow the existing facade-layout rules. Meter-seeded rooftop and decoration placements may reseed.
