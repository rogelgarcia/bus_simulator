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
- **Building-default footprint loops in meters** (tile-independent authoring shape):
  - stored as a default silhouette for the config,
  - used by BF2 and runtime when no placement override is provided.
- **Floorplan/footprint** data per layer (topology-preserving across applicable layers).
- **Facades**, authored per floor layer and per face id (`A`, `B`, `C`, …), using a bay/group layout model.
- **Per-floor-layer face relationships**:
  - Each floor layer has its own set of faces (derived from that layer’s footprint topology).
  - Face master/slave (linking/locking) relationships are defined **per floor layer**.
  - Floor count and floor height are properties of a **floor layer** (not of a face).
- **Materials**:
  - A building-level **base wall material** default exists.
  - Material configuration is authored per **floor-layer face**, and respects face master/slave inheritance (slaves do not duplicate config).
  - Wall-base tint uses a shared persisted state contract (`tintHueDeg`, `tintSaturation`, `tintValue`, `tintIntensity`, `tintBrightness`) plus compatibility `tintHex`.
  - Tint compose model:
    - `tintIntensity` mixes between neutral white (`0`) and HSV tint color (`1`),
    - `tintBrightness <= 1` darkens multiplicatively,
    - `tintBrightness > 1` lifts channels toward white (not channel clipping), enabling controlled whitening.
- **Bay content** definitions (openings/windows, columns, wall segments), with constraints and omission rules.
- **Reusable definitions** owned by the building (e.g., window definitions reused across bays).
- **Bay window configuration** authored per floor-layer face bay, including:
  - enabled/disabled state,
  - selected catalog/building-owned opening definition id,
  - opening asset type (`window` / `door` / `garage`),
  - per-bay opening size (`size.widthMeters`, `size.heightMeters`),
  - opening height mode (`fixed` / `full`),
  - vertical offset from floor bottom (`verticalOffsetMeters`),
  - repeat count (`repeat.count`) for side-by-side windows (window-only; doors/garages force `1`),
  - per-side minimum padding (`left`/`right`, linked by default).
  - per-opening muntin toggles (`muntins.bottomEnabled`, `muntins.topEnabled`),
  - optional stacked top opening config (`top.enabled`, `top.heightMode`, `top.heightMeters`, `top.verticalGapMeters`, `top.frameWidthMeters`).
- **Rooftop props** authored on a roof layer as `props` (AI 492) — ONE feature with a prop set, not one feature per prop kind:
  - `enabled` (absent/`false` drops the whole block so bare roofs round-trip unchanged),
  - `types`: allowed prop kinds from `water_tower` | `roof_bulkhead` | `mech_box` | `vent_pipe`,
  - `density` (count multiplier), `edgeMarginMeters`, `minSpacingMeters`, `seedOffset`,
  - `placements[]`: optional explicit hero placements (`type`, `variantId`, `x`, `z`, `rotationDegrees`) in roof-loop coordinates,
  - `materials`: one shared palette for the whole set (`tank`, `frame`, `bulkhead`, `mech`), each a material spec that accepts `slot:<name>` and resolves in the config pre-pass; `bulkhead` defaults to the wall material below.
- **Bay group rhythm** authored on `facade.layout.groups.items[*]` (AI 493) — the group IS the repeating rhythm unit, so a paired-window / wide-narrow rhythm needs no schema of its own:
  - `repeat.minRepeats` / `repeat.maxRepeats` (`'auto'` = repeat-if-fits),
  - `arcade`: the arcade MODE of that group — `springing.mode` (`auto` | `fixed` + `offsetMeters`) and `impost` (`enabled`, `heightMeters`, `projectionMeters`, `overhangMeters`, `material` accepting `slot:<name>`); `impost.enabled` is always serialized so "no band" round-trips.
- **Facade column stacking** authored on `facade.layout.stacking` (AI 493):
  - `mode: 'lock_columns'` (default, omitted when authored) | `'per_layer'`,
  - locked faces share one resolved bay pitch across every layer that authors the same bay layout, so windows stack across a setback.
- **Plan edge bevel** authored building-level as `edgeBevel` (AI 499) — ONE feature with scopes, not one feature per edge kind:
  - `enabled` (absent/`false` drops the whole block so a sharp building round-trips unchanged),
  - `scope`: `main_corners` (default) | `all_convex_edges` (AI 501 — see engine §6.2.3),
  - `widthMeters`: the width of the chamfer FACET (0.05–1.5m), not the cut-back,
  - `includeConcave`: opt-in for re-entrant arrises under `all_convex_edges`,
  - `corners`: per-main-corner `{ enabled, widthMeters | null }` overrides keyed `AB`/`BC`/`CD`/`DA` (null width = the building width).
- **Inheritance rules** for bay windows:
  - face slaves inherit facade/bay/window config from their master face (no duplicated per-slave copy),
  - bay linking is one-master/many-slaves per face (`linkFromBayId` on each slave),
  - bay slaves (`linkFromBayId`) inherit the master bay’s full window configuration by reference,
  - effective links are normalized to root masters (authoring avoids multi-hop chains).
- **Street-floor carve/interior shell derivation**:
  - street-floor wall carving is engine-derived from solved opening placements,
  - single-room interior shell generation is a legacy run-window-derived pass (not generated by bay-driven openings),
  - the shell is also emitted, with a warning, on any floor whose glazing has no parallax interior behind it, and is opaque from both sides and cut at every opening; see `BUILDING_2_SPEC_engine` §6.2.1,
  - v2 baseline does not require separate authored model fields for these derived meshes/material assignments.

Concrete schema definitions belong in dedicated specs:
- `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

---

## 5. Export/import expectations

- Exported building configs SHOULD be self-contained and portable.
- Loading an exported v2 config should reproduce the same building (modulo deterministic solver reflow when face lengths change).
- Importing a v1 config MUST convert to v2 and then render via v2.
- City placement/runtime MAY override a config’s default footprint loops (and related facade-driven dimensions) per placed building without mutating the source config.
- When city runtime uses a config’s default footprint loops (no per-instance override), those loops MUST be treated as building-local and translated to the placed building footprint centroid.

---

## 6. Rooftop prop placement rules (derived, not authored)

Placement is solved from the model rather than authored per prop, so the same
config renders identically everywhere:

- The placement region is the roof surface loop **inset by the parapet ring's
  `innerRadius`** — props stand on the slab the parapet encloses, not on the
  parapet — minus `edgeMarginMeters` and minus each prop's footprint radius.
- Courtyard holes are keep-out regions, and a roof carrying floor layers above
  it treats the mass above as a keep-out too: a setback roof is only a rooftop
  where the setback exposes it.
- Counts scale with usable roof area per prop kind (`ROOFTOP_PROP_CATALOG`
  `scatter`), multiplied by `density` and clamped to the kind's min/max.
- The scatter is seeded from the building's material-variation seed plus
  `seedOffset`: the same seed always yields the same layout.
- Explicit `placements` are placed first and count toward the scatter target; an
  explicit placement that violates the margin is rejected with a warning rather
  than hung over the street.
- Boxy props take the yaw of the nearest roof edge, so a scatter squares up to
  the parapet instead of reading as spill.

---

## 7. Wall decoration targeting and corner-resolution metadata

- `wallDecorations.sets[*].target` is authored as `layerId + allBays|bayRefs`, but runtime resolution expands these refs deterministically to preserve continuity rules:
  - linked faces inherit target refs using the same per-layer face master/slave + reverse-order rules used by facade/material solving;
  - face-boundary ownership expansion applies when adjacent edge depths differ, so the outmost-depth owner also applies decoration to the inherited adjacent edge wall.
- Runtime corner resolution is decoration-signature driven (`type + placement + relevant configuration/material fields`) and computed per bay edge.
- The derived `decoration.autoCorner` metadata may include:
  - `resolvedBayRefs`: effective bay refs after link/inheritance expansion;
  - `byBayRef[ref]`: edge flags (`start`/`end`), continuation meters (`continuationStartMeters`/`continuationEndMeters`), and edge style (`startCornerStyle`/`endCornerStyle`).
- Corner style rules:
  - adjacent-face continuity uses `exterior` style;
  - same-face inset/intrusion continuity uses `interior` style when an inset depth participates in the edge transition.
- `wallDecorations.sets[*].decorations[*].inheritOnDerivedSurfaces` (boolean, default `true`) controls whether a band decoration turns onto the connector walls a bay recession generates. Ownership is by depth (the proud side of the step owns the connector) and a neighbouring bay front is never claimed. It normalizes and round-trips like the rest of the decoration entry; see `BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC` §5.2.1 for the behaviour.
