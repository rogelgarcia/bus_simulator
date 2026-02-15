# Building v2 — Engine Specification

Status: **Proposed (draft)**  
Scope: **Building v2 rendering/solving/validation rules** (no UI implementation details)

This document defines the **Building v2 engine**: how a Building v2 model is validated, solved, and converted into renderable geometry. It intentionally avoids UI concerns (see `specs/buildings/BUILDING_2_SPEC_ui.md`) and avoids locking down a concrete serialized schema in this file (see `specs/buildings/BUILDING_2_SPEC_model.md` and dedicated model specs).

---

## 1. Three-part split (engine vs UI vs model)

To keep the system stable and evolvable, Building v2 is defined as three distinct concerns:

1) **Engine** (this doc): deterministic rules and behaviors (solving, geometry generation, validation).
2) **UI**: authoring workflows that edit a model using reusable UI builders/framework patterns.
3) **Model**: the building specification that the UI writes and the engine consumes.

The UI MUST NOT implement solver rules implicitly; it must author explicit model intent, and the engine must be the sole source of truth for how that intent is interpreted.

---

## 2. Versioning and compatibility

### 2.1 Building v1 (legacy)

Building v1 refers to the legacy authoring/rendering system that places windows on faces using:
- face-wide “window spacing”, and
- optional “space columns” inserted between windows at a fixed interval,
and does not support bay/facade authoring.

The legacy spec is preserved for reference in `specs/buildings/BUILDING_1_SPEC_legacy.md`.

### 2.2 Building v2 (facade/bay)

Building v2 refers to the bay-based facade system with:
- per-face facade layouts,
- bays and repeatable groups,
- deterministic layout solving and validation,
- geometry generation that follows the authored facade silhouette.

### 2.3 Required compatibility behavior

- When a v1 building is loaded/imported, it MUST be converted to a v2 model and rendered via the v2 engine.
- Conversion rules are specified in `specs/buildings/BUILDING_1_TO_2_CONVERSION_SPEC.md`.

---

## 3. Core engine responsibilities

The v2 engine MUST:

- Validate floorplan topology and face identity stability (see §4).
- Resolve repeat counts and bay widths deterministically across layers (see §5).
- Convert solved facades into 3D geometry for:
  - walls,
  - belts,
  - roofs / roof rings,
  while following the bay silhouette (per-bay depth + wedge/edge depth) (see §6).
- Integrate bay content features (e.g., windows) with safe omission + warnings when constraints prevent placement (see §7).
- Surface errors/warnings/debug info clearly (no silent fallback) (see §8).

---

## 4. Floorplan topology and face identity

Building v2 defines **logical faces** from the building footprint edges.

- Faces are derived from a footprint polygon’s ordered edges and labeled `A`, `B`, `C`, … in clockwise order.
- “Angled bays / wedge bays / extrude/inset bays” may generate extra wall **surfaces** (returns, wedge sides, etc.), but MUST NOT create new logical faces or change face topology.

Authoring and continuity across layers requires topology invariants; see:
- `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

---

## 5. Facade layout solving (deterministic)

### 5.0 Floor layers, faces, and linking

- Facade solving is evaluated per **floor layer** and per **face** (face lengths come from that floor layer’s footprint).
- Face master/slave (linking/locking) relationships are defined **per floor layer** in the model/UI.
  - For a given floor layer, if a face is a **slave**, the engine MUST use the master face’s facade layout/solution for that floor layer (equivalent result).

### 5.1 Inputs

The solver takes:
- a Building v2 model,
- per-floor-layer footprints (face lengths) and layer stack rules,
- per-floor-layer per-face facade layouts (bays + groups),
and produces a per-layer resolved bay list (`uStart/uEnd/width` per bay) for geometry generation.

### 5.2 Determinism requirement

For the same inputs, the solver MUST produce the same output:
- no backtracking,
- no random tie-breaking,
- stable ordering rules.

### 5.3 Repeatable groups and local repeat ranges

Building v2 supports patterns like “every X windows, insert a column” by allowing:
- **group repetition** (repeat a multi-bay pattern), and
- **local repetition ranges** inside a group (e.g., a “window slot” that can repeat `min..max` times per group).

The facade data model is described in `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.

The canonical v0 deterministic fill algorithm (group repeat + bounded bay repeat + equal expand) is specified in:
- `specs/buildings/BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`

### 5.4 Center-out distribution

When distributing extra local repeated items (e.g., extra windows within groups), the solver MUST support **center-out** ordering across the face so resizing behaves symmetrically and deterministically.

### 5.5 Cross-layer continuity

To keep topology stable across layers:
- the resolved **bay id/order/count per face** MUST be identical across applicable layers.
- repeat counts MUST be shared across applicable layers for the face (the “most restrictive layer” determines repeat feasibility).

---

## 6. Geometry generation requirements

Given a solved facade layout, geometry generation MUST:

- Produce wall geometry that matches:
  - bay width partitions (full face coverage),
  - per-bay depth offsets (extrude/inset), including per-edge depth offsets (left/right in `u`),
  - wedge/angled bay side faces (15° step increments),
  - padding bays at regular depth,
  - correct joins between adjacent bays with different depth (no cracks/overlaps).
- Ensure belts and roofs follow the final wall silhouette defined by bays:
  - belts extrude/inset relative to the updated wall surface,
  - roof rings/edges align to the updated outer silhouette where applicable.
- Treat corner handling as a first-class requirement (reserved corner zones / caps / ownership) to avoid cracks; see `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.
- Support deterministic wall material UV continuity across bay boundaries using authored per-bay intent (e.g., `textureFlow`), so repeated bays or adjacent bays using the same resolved wall material can optionally share a continuous mapping.

### 6.1 Bay wall material overrides + bay-to-bay linking (full spec)

- A face’s effective wall material configuration MUST respect face master/slave rules:
  - if a face is a slave, it inherits the master face’s wall material configuration (no duplicated config is owned by slaves).
- A bay MAY override wall material and related wall material settings:
  - `wallMaterialOverride` (MaterialSpec),
  - `wallBase` (albedo tint / roughness / normal strength),
  - `tiling` (tile meters + UV transform),
  - `materialVariation` (wall material variation config).
- A bay MAY link (inherit) its **entire bay configuration** from another bay on the same face using `linkFromBayId`:
  - linking is **reference-based inheritance** (no deep copy/duplication of bay config),
  - link resolution is evaluated within the master face’s bay list (face slaves do not own independent bay lists),
  - the engine MUST resolve `linkFromBayId` chains transitively before solving/rendering.
- Authoring tools SHOULD keep bay-link graphs simple/deterministic:
  - avoid multi-hop chains by linking directly to the root master when possible,
  - if a bay with slaves becomes a slave, redirect its slaves to the new root master (no chained inheritance).
- Link resolution MUST:
  - detect missing targets and cycles,
  - emit warnings for invalid links,
  - ignore invalid links rather than silently guessing.
- Bay linking affects **all bay properties**, including but not limited to:
  - sizing (width mode, `size`),
  - solver hints (`expandPreference`),
  - UV intent (`textureFlow`),
  - material overrides and related settings (`wallMaterialOverride`, `wallBase`, `tiling`, `materialVariation`),
  - bay content features (windows/openings/etc) authored on the bay.

Compatibility note (transitional):
- For older configs, the engine MAY treat legacy `materialLinkFromBayId` as an alias of `linkFromBayId`.

---

## 7. Bay content features (windows, columns, etc.)

Building v2 moves from face-wide window spacing to **bay-driven content**:

- Windows/doors/openings are authored as bay content (segments/features) rather than “fill a face with evenly spaced windows”.
- If an opening cannot fit within a bay (after margins/clearances), it MUST be **omitted** and surfaced as a warning (never overlap).
- Window definitions are building-owned and reusable across bays; bays reference definitions by id.
- Bay window authoring is per-bay and includes:
  - `window.width.minMeters`,
  - `window.width.maxMeters` (`null` = infinity / fill available bay width),
  - `window.padding.leftMeters` / `window.padding.rightMeters` (linked by default).
- The effective bay minimum width MUST be clamped by bay-window requirements:
  - `effectiveBayMin = max(bayMin, windowMin + leftPadding + rightPadding)`.
- Face slaves do not own independent bay/window copies; they inherit the master face facade/bay/window config.
- Bay slaves (`linkFromBayId`) inherit the master bay window configuration by reference (no deep copy).

The detailed content model is described in `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.

---

## 8. Validation and debugging

The engine MUST validate and surface issues explicitly:

- Hard errors:
  - invalid footprint/topology for applicable layers,
  - invalid sizing constraints (non-positive widths, min/preferred/max ordering),
  - no feasible solution under constraints and overflow policy.
- Warnings:
  - openings omitted due to insufficient bay width,
  - repeat counts reduced/adjusted (if allowed by policy),
  - suspiciously small/large resolved widths.

The engine SHOULD expose debug information suitable for UI display:
- resolved group repeat count,
- per-group local repeat counts,
- which groups received “extra” local repeats under center-out distribution,
- final per-bay resolved widths.

---

## 9. Spec modularization requirement (important)

To avoid a single monolithic spec and to keep concepts isolated, **each major engine concept MUST live in its own spec file** under `specs/buildings/`.

This engine spec is the entrypoint/index; detailed specs SHOULD be split, for example:
- `BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`
- `BUILDING_2_FACADE_LAYOUT_SPEC.md`
- `BUILDING_1_TO_2_CONVERSION_SPEC.md`
- (future) `BUILDING_2_GEOMETRY_GENERATION_SPEC.md`
- (future) `BUILDING_2_WINDOWS_AND_OPENINGS_SPEC.md`
- `BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`
