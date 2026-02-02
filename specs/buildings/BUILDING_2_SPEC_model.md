# Building v2 — Model Guidance Specification

Status: **Proposed (draft)**  
Scope: **Guidance on the Building v2 model as an authored artifact** (not a full schema specification)

This document explains what the Building v2 “model” is, how it is used, and what guarantees it must provide. It does not lock down a concrete JSON/ES module schema; concrete model schemas should live in dedicated spec files (e.g., facade layout/topology specs) and evolve carefully.

---

## 1. What “the model” is

The Building v2 model is the **single source of truth** for a building configuration:

- The UI **writes/edits** the model.
- The engine **validates/solves/renders** the model.
- Export produces a serialized form of the model (suitable for loading and rendering elsewhere).

The UI must not rely on “implicit behavior” not represented in the model.

---

## 2. Versioning and compatibility

- The model MUST be versioned (conceptually “v2”).
- A v1 building is not a valid v2 model; it MUST be converted to v2 for rendering/authoring.
- v1→v2 conversion rules are defined in `specs/buildings/BUILDING_1_TO_2_CONVERSION_SPEC.md`.

---

## 3. Stability requirements (ids + topology)

To keep authoring stable and to support continuity across layers:

- Identifiers SHOULD be stable where it matters (building id/name, layer ids, face ids, bay ids/group ids, window definition ids).
- Face identity is derived from the footprint topology and must be stable across applicable layers.
- Facade authoring depends on topology invariants; see:
  - `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

---

## 4. Core conceptual parts of the model (non-normative)

At a conceptual level, a Building v2 model includes:

- **Layers** (floor and roof layers), including floor counts/heights and layer offsets.
- **Floorplan/footprint** data per layer (topology-preserving across applicable layers).
- **Facades**, authored per floor layer and per face id (`A`, `B`, `C`, …), using a bay/group layout model.
- **Per-floor-layer face relationships**:
  - Each floor layer has its own set of faces (derived from that layer’s footprint topology).
  - Face master/slave (linking/locking) relationships are defined **per floor layer**.
  - Floor count and floor height are properties of a **floor layer** (not of a face).
- **Materials**:
  - A building-level **base wall material** default exists.
  - Material configuration is authored per **floor-layer face**, and respects face master/slave inheritance (slaves do not duplicate config).
- **Bay content** definitions (openings/windows, columns, wall segments), with constraints and omission rules.
- **Reusable definitions** owned by the building (e.g., window definitions reused across bays).

Concrete schema definitions belong in dedicated specs:
- `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

---

## 5. Export/import expectations

- Exported building configs SHOULD be self-contained and portable.
- Loading an exported v2 config should reproduce the same building (modulo deterministic solver reflow when face lengths change).
- Importing a v1 config MUST convert to v2 and then render via v2.
