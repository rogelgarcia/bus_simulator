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
- Keep facade authoring stable within each silhouette and permit cross-layer
  continuity only for explicitly compatible stable runs (see §4).
- Keep “angled bays / wedge bays / depth offsets” as **facade features** that generate derived geometry, not as topology edits (see §5).

Non-goals for the first iteration:

- Footprints with holes/courtyards (multiple polygons).
- Self-intersecting polygons.
- Automatically changing face count/order due to facade features.
- Silently guessing topology remaps or retargeting authored face data by spatial
  proximity when corners/edges appear or disappear.

---

## 2. Terminology

- **Footprint**: A 2D polygon (in plan view) describing the building outline for a layer.
- **Corner**: A vertex of the footprint polygon with a persistent `cornerId` in
  an authored silhouette.
- **Edge**: The directed run from `corner[i]` → `corner[i+1]` (wrapping at the end); it is straight unless it carries arc metadata.
- **Face / run**: A logical facade surface corresponding to a footprint
  **edge**, identified by its persistent `runId`. Faces are the authoring units
  for facades.
- **Topology**: The ordered corner list and the resulting ordered edge/face list. “Same topology” means same corner count and same corner order.
- **Compatible run**: A run that retains the same stable identity, authored
  local-u orientation, and solver-relevant contract on each layer being grouped.

---

## 3. Footprint requirements

For any footprint used by Building Fabrication:

- Corners MUST be stored in **clockwise** order.
- The polygon MUST be **simple** (no self-intersections).
- Adjacent corners MUST NOT be coincident.
- Each edge length SHOULD be greater than a minimum practical threshold (to avoid degenerate faces that cannot host bays or corners), but the exact threshold is implementation-defined.
- A loop MUST contain no more than 26 logical runs because authored `runId`
  values are limited to `A..Z`.

Concave polygons (e.g., L-shaped footprints) are allowed.

---

## 4. Layer ownership, compatibility, and topology remapping

Different floor layers MAY resolve to different silhouettes, including different
corner/run counts. A topology mismatch is not by itself an invalid building.

### 4.1 Layer silhouette ownership

A floor layer's optional `silhouette.mode` resolves as follows:

- `inherit_default`: use the building-level default footprint.
- `inherit_previous`: use the preceding floor layer's resolved silhouette; this
  is invalid on the first floor layer.
- `detached`: use the silhouette owned by that layer.

Field absence is the legacy compatibility path and MUST behave exactly as
`inherit_default`, without rewriting or changing the existing meter
`footprintLoops`. Inheritance is live ownership, not a hidden copy. Detaching
copies the currently resolved shape, identities, curve/split metadata, and
stretch provenance into a new owner before local edits begin.

`planOffset` remains relative to the resolved layer below and MUST preserve the
resolved silhouette's logical topology. An offset that collapses/reorders runs
or cannot preserve an authored curve is invalid rather than silently changing
metadata.

### 4.2 Cross-layer compatibility

Two layer runs may participate in one facade-continuity or solver group only
when all of the following are true:

- both carry the same stable `runId` through shared inheritance, a recorded
  identity-preserving detachment from that owner, or an accepted explicit
  remap;
- their `runForward` values define the same authored local-u orientation;
- their straight/arc topology and any split boundary needed by the operation
  are compatible; and
- their facade/bay sizing and continuity constraints admit the same solver
  contract.

Whole-layer compatibility additionally requires the relevant run identities to
have the same cyclic adjacency for the operation being shared. Unrelated
detached silhouettes MAY reuse the same letter locally; that coincidence alone
never establishes compatibility. Incompatible layers form separate facade and
solver groups and remain valid, with their boundary handled as an explicit
layer transition by the engine.

### 4.3 Topology edits and target review

Moving a corner/run, translating the whole loop, changing relative span, or
editing a run's curvature without splitting it is a non-topology edit and MUST
preserve every identity. Insert, delete, split, merge, and reorder operations are
topology edits and MUST produce a deterministic change record containing:

- retained corner/run ids;
- newly allocated corner/run ids;
- removed ids and any possible explicit remap candidates; and
- every affected authored target.

New ids MUST be allocated deterministically from `A..Z` and MUST NOT reuse an id
retired during the authoring transaction/session. Identity allocation and
retirement state is part of undo/redo and round-trip state. A split retains the
source run id on the operation-defined source segment and allocates a new id to
the other segment; a merge records which source run is the retained owner.
These choices are recorded by the operation and MUST NOT be inferred later from
array position.

Stable identity alone is not orientation compatibility. If a retained `runId`
changes `runForward`, every target that consumes that run enters the same
decision-required review even though the letter still exists. It MUST NOT be
silently classified as retained. An accepted explicit remap records whether
the consumer must reverse local-u (`reverseLocalU`); the other safe choices are
to preserve the target as an orphan or deliberately remove it.
For a composite target such as a face link or decoration set, the chosen remap
applies only to its missing or orientation-incompatible references. Every
unaffected reference remains identity-mapped in the resolved target; review
must never collapse all references onto the one selected replacement.

Before a topology edit can commit, the author MUST review affected facade
layouts, face links, face materials, decoration targets, attachments, and named
stretch-band preferences/mappings. Each target receives an explicit
`retain`, `remap`, `orphan`, or deliberate removal decision. Automatic
suggestions may use known stable provenance, but MUST NOT guess from positional
letters or proximity. Unresolved targets remain surfaced as orphans; the system
MUST NOT silently delete or retarget them.

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

- Faces MUST use stable letter ids from `A..Z`.
- When identities are first bootstrapped for a legacy loop, face `A`
  corresponds to the first ordered edge, face `B` to the next edge, and so on
  clockwise. Once authored, persistent metadata is authoritative and an edit
  MUST NOT relabel unaffected runs merely because an edge was inserted or
  deleted.

### 6.2 Stability requirements

To keep face ids stable while editing:

- Every authored corner MUST carry a persistent `cornerId`; every authored run
  MUST carry a persistent `runId`.
- Editors MUST move existing corner records for geometry edits instead of
  rebuilding/relabeling the list.
- Reordering corners is a topology edit and follows §4.3. Winding normalization
  is a geometry representation transform, not a topology edit, and MUST transfer
  all identities and invert run orientation/arc metadata as specified below.

### 6.3 Persisted run identity

- An authored footprint point MUST carry `cornerId`; it also carries `runId` and
  `runForward` for the edge beginning at that point.
- `runId` is the stable logical face id and MUST be a unique letter `A..Z` within the loop.
- `runForward` records whether the point-list edge direction matches the facade's authored local-u direction. Winding normalization MUST transfer the run metadata to the reversed edge and invert `runForward`.
- Geometry-only transforms MUST preserve this metadata. Connector-wall edits
  allocate never-used ids without renaming existing runs.
- A legacy loop without identity metadata remains valid and renders through its
  existing deterministic frame derivation. Entering silhouette authoring assigns
  ids to the popup working copy; Cancel therefore leaves the source legacy model
  unchanged, while Apply persists the assigned identities atomically.

### 6.4 Circular facade runs

- A footprint point MAY attach `arc: { bulge, segments? }` to the logical run beginning at that point. `bulge = tan(signedSweep / 4)`; its sign selects the side of the chord. A non-zero finite bulge and the run endpoints determine the circle center, radius, and sweep. `segments` is an optional tessellation-quality hint, not topology.
- An arc run remains **one logical face** and keeps one `runId`. Its facade length and local `u` coordinate are circular arc length, not endpoint chord length.
- The facade frame MUST provide position, tangent, and outward normal as functions of `u`. Line/arc and arc/arc joins use the endpoint tangents; tangent-continuous authored joins therefore remain tangent after plan normalization.
- Winding reversal transfers the arc to the reversed source edge and negates its bulge. Translation and uniform scale preserve bulge; scale changes the derived radius and arc length through the endpoints.
- Wall panels and reveals, horizontal belts, floor spandrels, roof/parapet/coping loops, cornice profiles, and repeated cornice ornaments MUST consume the same sampled curve. Meter-based wall UV distance MUST continue across its tessellated segments without resetting.
- Openings on an arc solve bay widths in arc length, and one authored opening remains one opening at its solved width/count. Its existing glass, frame, wall-cut, sill/header, and storefront geometry is subdivided across width and bent through tangent samples; subdivision rings are geometry only, never semantic window repeats or extra mullions. A single flat chord spanning the curved run is not sufficient.
- A stretch/push-pull or lot-fit operation MUST keep an affected curved run
  fixed unless it declares a valid curve-preserving rule for that named band.
  Unaffected straight bands remain eligible; one curved run MUST NOT silently
  drop curve metadata or pin the whole silhouette.
- Building Fabrication 2 authors straight/curved state, inward/outward
  direction, and radius/sweep (or an equivalent canonical pair) in the layer's
  **Draw** transaction. Numeric and visual edits convert to canonical `bulge`
  metadata and expose endpoint-tangent feedback.
- The plan-view face picker MUST sample the same circular run for drawing, bounds, labels, and pointer hit testing. A curved run therefore appears and selects as one curved edge, never as several narrow logical faces.
- Arc tessellation is always display/geometry detail; splitting tessellation
  MUST NOT create corner ids, run ids, facade targets, or semantic repeats.

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

## 7.1 Rounded boundaries at physical corners (AI 541)

An AI 541 relationship may connect the outer resolved bay endpoint of one face
to the adjacent endpoint of the next physical face. The logical footprint,
run ids, and face count do not change. P0/P1 trim only the local facade-front
paths, while the rounded connector owns the intervening corner samples.

At that corner, an edge bevel, corner cut, sharp return/cap, or duplicate patch
must not compete with the rounded connector. Valid convex and valid concave
results use normal loop validation; collapsed or self-intersecting output is
blocked. Topology remap addresses endpoints by source run and bay ids and flips
Start/End only when that physical run reverses.

---

## 8. Validation requirements

The system MUST validate and surface errors/warnings rather than silently falling back:

- Hard error if a footprint is invalid (wrong winding, self-intersection,
  duplicate/collapsed points, collapsed edges, or more than 26 logical runs).
- Hard error for duplicate/missing authored `cornerId` or `runId`, exhausted or
  recycled transaction identities, invalid `runForward`, or an invalid first
  layer `inherit_previous` source.
- Warning if an edge/face is too short to reasonably host authored bays/features (exact thresholds are implementation-defined).
- Hard error when a face is shorter than its facade solver minimum.
- Hard error for invalid arc metadata, radius/sweep, or required tangency.
- Hard error for an invalid named stretch-band mapping or an unresolved target
  decision while applying a topology edit.
- An incompatible cross-layer topology/solver group is not a topology error;
  it MUST split continuity and produce an actionable transition/link warning.
- Straight-run edit/fit tools MUST surface each curved or pinned band they keep
  fixed.

---

## 9. Angle-preserving face extension and named stretch bands

Building Fabrication 2 exposes two plan edits and does not drag raw corners:

- **Stretch band:** a perpendicular cut is cast at either authored end of a face. Every footprint edge intersected by the cut MUST be parallel to the selected face within `0.5°`; vertex hits are epsilon-nudged. Each inside interval of a concave multi-wall cut is transformed together. Geometry on the chosen end side translates along the face tangent, so crossed faces gain or lose the same delta while every corner angle and run id stays unchanged.
- **Push/pull:** the selected face line offsets along its outward normal and re-intersects its two neighboring lines. A connected push is invalid for a parallel neighbor and clamps before any affected face falls below its facade-solver minimum.
- **Detached push:** when the selected face must move without extending its neighbors, two perpendicular connector faces bridge the old endpoints to the moved face. The moved parent keeps its id; connectors receive unused generated ids, inherit the parent face material, and start with a plain flexible bay layout.

All affected facades re-run the normal bay/group solver at their new lengths. Fixed/minimum bay sums clamp shrinking edits with a surfaced warning; repeat groups, flex bays, and arcade springing otherwise follow the existing facade-layout rules. Meter-seeded rooftop and decoration placements may reseed.

Silhouette design-size compilation and runtime lot fitting MUST express these
edits as named band applications with stable source-run provenance. Preferred
width/depth is a target for the allowed bands, not permission to uniformly
scale or shear the loop. A placement fit is solved once against its envelope;
the same band deltas are replayed on another layer only through an explicitly
compatible provenance mapping. Curved, pinned, or unmapped bands stay fixed.
When the target is unreachable, the nearest deterministic valid result is kept
and the limiting bands are reported.
