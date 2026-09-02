# Building v2 — Facade Layout Specification (Bays)

This document specifies the **Facade Layout** model used to author building exteriors as a **2D facade description** (per face), which can later be converted into **3D building geometry** across multiple faces and layers.

Status: **Proposed (draft)**  
Scope: **Facade layout + deterministic layout rules** (no implementation details).

---

## 1. Goals

The system MUST:

- Model the exterior as **Faces** (labeled A, B, C, …) where each face has a **Facade**.
- Define each facade as a horizontal sequence of **Bays** (vertical strips).
- Support bay widths that are:
  - **Fixed** (absolute meters), or
  - **Flexible** (min/preferred/max + grow/shrink weights).
- Support **repeatable groups** of bays (pattern repeats) that expand “if it fits”.
- Support **local repetition ranges** inside groups (e.g., a “window slot” that repeats `min..max` times per group).
- Support deterministic ordering when distributing extra local repeats (default: **center-out**).
- Allow **per-layer reflow** within an explicitly compatible stable-run group
  while keeping the same bay ids/order and group repeat decisions in that
  group. Layers with incompatible silhouettes solve as separate groups.
- Support bays spanning multiple floors and (optionally) spanning multiple layers, with an explicit hint for **continuous mesh generation** (avoid visible breaks).
- Provide deterministic rules for **corner handling** (seams between adjacent faces).

Non-goals for the first iteration:

- Automatically sharing a facade across unrelated layer runs merely because
  their local letter ids match.
- Guessing topology remaps or silently discarding face-targeted authoring when a
  layer footprint changes face count/order.
- Backtracking constraint solvers; the fitting must be deterministic and explainable.

---

## 2. Terminology and coordinate system

### 2.1 Footprint, faces, and corners

- A **Footprint** is a simple polygon (clockwise vertex order) describing the building outline at a height band.
- A **Corner** is a polygon vertex.
- A **Face** is a polygon edge between consecutive corners.

### 2.2 Face identity (letters)

- Faces MUST carry persistent letter ids from `A..Z`. Initial legacy identity
  assignment follows clockwise order; subsequent topology edits preserve
  unaffected ids rather than relabeling by array position.
- The number of faces is **not limited** to 4.
- Faces may be at any angle; the editor may snap angles (e.g. 15°), but the model is defined by the polygon geometry.
- A face letter is local to its silhouette owner. Cross-layer sharing also
  requires stable lineage/remap provenance and compatible authored local-u
  orientation/topology; equal letters alone do not establish identity.

### 2.3 2D facade frame

For each face at a given layer:

- `u` is the horizontal axis along the face:
  - `u = 0` at the face’s start corner.
  - `u = L` at the face’s end corner, where `L` is the face length (meters).
- `v` is the vertical axis (meters), increasing upward from the building baseline.

The facade layout is authored in `(u, v)` and later mapped into 3D space for each face plane.

---

## 3. Floor layer silhouettes and facade compatibility

Buildings are defined in vertical **Layers** (floor layers and roof layers). This facade model targets vertical walls (typically from **floor layers**).

### 3.1 Applicability

- A `FacadeSpec` is authored per **floor layer** and per `faceId`.
- A floor layer owns its own face configuration; face master/slave linking is defined per floor layer (see §4.2).
- Within a floor layer, a face MAY be linked (slave) to another face (master) so it inherits the master’s authored facade layout for that floor layer.

### 3.2 Silhouette ownership and compatibility

A floor layer MAY resolve the building default, the preceding resolved floor
layer, or a detached owned silhouette. Field absence is exactly the legacy
`inherit_default` path. Detached layer groups MAY have different face counts,
orders, curves, and configurations; this is not itself invalid.

Facade continuity or a shared solve may cross layers only when participating
runs have compatible stable identity/remap lineage, `runForward` local-u
orientation, required straight/arc/split topology, and facade solver
constraints. Incompatible runs form separate facade groups and require an
explicit new or accepted remapped face design. Positional letters and geometric
proximity MUST NOT be used as an implicit mapping. Topology edits follow the
explicit target-remap/orphan review in
`BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md` §4.3.

---

## 4. Data model (logical schema)

This is a conceptual schema; concrete serialization can be JSON/ES module later.

### 4.1 BuildingSpec

- `layers: LayerSpec[]`
- `defaults?: BuildingFacadeDefaults`

### 4.2 LayerSpec (for facade concerns)

- `id: string`
- `type: 'floor' | 'roof'`
- If `type === 'floor'`:
  - `floors: int`
  - `floorHeight: meters`
  - `planOffset: meters`
  - `silhouette?: { mode: 'inherit_default' | 'inherit_previous' | 'detached', ... }`
    (absence is exactly `inherit_default`; detached data is defined by the
    topology/model specs)
  - `facades: Record<FaceId, FacadeSpec>` (facade authored per face for this floor layer)
  - `faceLinking?: FaceLinkingSpec`
  - (Optional) other layer properties (belts/roof/etc) are out of scope for this facade doc except where they affect vertical extents.

### 4.3 FacadeSpec

- `faceId: FaceId` (e.g. `"A"`)
- `cornerPolicy: CornerPolicy`
- `cornerCutouts?: CornerCutoutsSpec`
- `layout: FacadeLayout`
- `defaults: FacadeDefaults`
- `validation: FacadeValidationRules`

**CornerCutoutsSpec**

- `startMeters: meters` (>= 0) — desired cut length at the face start corner (along `t(F)` into the face interior)
- `endMeters: meters` (>= 0) — desired cut length at the face end corner (along `t(F)` into the face interior)

Notes:
- Corner cutouts are a **tangent-only** concept and do not change depth (`n(F)`).
- The mesh generator clamps the cut lengths based on feasibility near the corner (see `specs/buildings/BUILDING_2_FACADE_MESH_CONSTRUCTION_PHASES_SPEC.md`).

### 4.4 FaceLinkingSpec (master/slave per floor layer)

Face linking is an authoring concept used to reuse a single facade design across multiple faces within the **same floor layer**.

**FaceLinkingSpec**

- `links: Record<FaceId, FaceId>`
  - key: a **slave** face id
  - value: the **master** face id it is linked to

Rules:
- A face MUST NOT be both a master and a slave in a way that creates cycles (no loops).
- A linked (slave) face uses the master’s authored `FacadeSpec` for this floor layer (effective equivalence).
- Master and slave ids MUST both exist on the current layer's resolved
  silhouette. A topology edit that removes either endpoint enters the explicit
  remap/orphan review; normalization MUST NOT silently drop or redirect the
  link.

### 4.5 BF2 (current) serialization snapshot (groups)

Building Fabrication 2 currently stores a pragmatic subset of the conceptual `FacadeLayout` using:

- `facade.layout.bays.items: FacadeBaySpec[]` — the authored bay list in left→right order.
- `facade.layout.groups.items?: FacadeBayGroupSpec[]` — repeatable bay groups by membership reference (no duplication).

**FacadeBayGroupSpec**
- `id: string` (stable per face)
- `bayIds: string[]` (must reference `bays.items[*].id`)
- `repeat?: { minRepeats?: number, maxRepeats?: number | 'auto' }` (defaults to repeat-if-fits; editable in the BF2 group popup since AI 493)
- `arcade?: ArcadeSpec` (AI 493) — the arcade MODE of this group

Constraints:
- `bayIds` MUST be **contiguous** in `bays.items` order.
- Groups MUST NOT overlap (a bay may belong to at most one group).

**ArcadeSpec** (AI 493)
- `enabled: boolean`
- `springing: { mode: 'auto' | 'fixed', offsetMeters: number | null }` — the
  shared springing height above the floor line; `auto` picks the highest
  natural springing in the run.
- `impost: { enabled: boolean, heightMeters, projectionMeters, overhangMeters, material }`
  — the band on the run's pier bays whose top edge sits on the springing line.
  `enabled` is always serialized so a stored "no band" round-trips.

**FacadeStackingSpec** (AI 493, on `facade.layout.stacking`)
- `mode: 'lock_columns' | 'per_layer'` (default `lock_columns`)

`lock_columns` groups only compatible stable runs with the same authored
local-u orientation, required run topology, and bay-layout signature. It never
groups unrelated detached runs by face letter alone.

A rhythm needs no schema of its own: a bay group IS the repeating unit, and
in-group vs between-group spacing is just two pier bays of different widths
inside it. See §5.6 of `BUILDING_2_SPEC_engine.md` for the stacking lock and
§7.1 for the arcade.

---

## 5. Facade layout: bays, groups, and repeats

### 5.1 FacadeLayout

`FacadeLayout` is an ordered list of `LayoutItem`:

- `LayoutItem = BayItem | GroupItem | RepeatItem`

### 5.2 BayItem

A bay is a vertical strip with:

- stable identity (`bayId`)
- horizontal sizing rules
- optional depth rules
- vertical content rules

**BayItem**

- `type: 'bay'`
- `bayId: string` (stable within the face; MUST be unique per face)
- `label?: string` (for UI)
- `size: BaySizeSpec`
- `depth?: BayDepthSpec`
- `content: BayContentSpec`
- `continuity?: BayContinuitySpec`

### 5.3 GroupItem (repeatable pattern)

Groups allow pattern authoring without manually listing many bays.

**GroupItem**

- `type: 'group'`
- `groupId: string` (stable within the face; MUST be unique per face)
- `label?: string`
- `repeat: GroupRepeatSpec`
- `items: LayoutItem[]` (typically bays; nesting is allowed but SHOULD be kept shallow)

### 5.4 RepeatItem (local repetition range)

Repeat items allow expressing “a thing repeats inside the group”, e.g. “windows repeat 3–6 times before a column”.

**RepeatItem**

- `type: 'repeat'`
- `repeatId: string` (stable within the face; MUST be unique per face)
- `label?: string`
- `repeat: LocalRepeatSpec`
- `items: LayoutItem[]` (typically a single bay; nesting SHOULD be kept shallow)

---

## 6. Bay sizing model

All facade sizing values in this section are physical meters. Preferred
silhouette design size and runtime lot fitting MUST re-solve through valid named
plan stretch bands; neither operation may uniformly scale fixed/minimum bay
widths, openings, or facade details.

### 6.1 BaySizeSpec

Each bay MUST be either fixed or flexible.

**Fixed**

- `mode: 'fixed'`
- `width: meters` (MUST be > 0)

**Flexible**

- `mode: 'flex'`
- `min: meters` (MUST be > 0)
- `preferred: meters` (MUST be >= min)
- `max: meters` (MUST be >= preferred)
- `growWeight: number` (MUST be >= 0)
- `shrinkWeight: number` (MUST be >= 0)

Flexible bays participate in distributing extra/deficit length after repeats are expanded.

UI note (non-normative):
- Some authoring UIs may present “max = ∞”. A concrete serialization may encode this as `max = null` and treat it as “unbounded” at solve time.

### 6.2 Suggested defaults (non-normative)

- A “normal window bay” might be `flex` with:
  - `min` = window width minimum + margins
  - `preferred` = typical window bay width
  - `max` = preferred * 1.5 (or higher)
  - `growWeight` > 0, `shrinkWeight` > 0
- A “column/pilaster bay” might be `fixed` width or `flex` with low `growWeight`.

---

## 7. Repeat rules (“repeat if it fits”)

### 7.1 GroupRepeatSpec

- `mode: 'repeatIfFits' | 'pinned'`
- `minRepeats: int` (>= 0)
- `maxRepeats: int | 'auto'`
- `fitMetric: 'min' | 'preferred'`
- `repeatCountPolicy: 'global' | 'pinned'`
  - `global`: compute one repeat count for this compatible stable-run group
    (or for this layer alone when it has no compatible cross-layer members).
  - `pinned`: repeat count is fixed by authoring (`pinnedRepeats`).
- `pinnedRepeats?: int` (required when `repeatCountPolicy === 'pinned'`)
- `remainder: RemainderPolicy`

### 7.2 Global repeat count requirement (continuity)

To keep bay topology aligned within a compatible stable-run group:

- All repeat counts MUST be resolved once for the participating facade design.
- When `repeatCountPolicy = 'global'`, the solver MUST ensure the resolved
  repeat counts are feasible for every participating compatible layer length
  (see §9.2).

### 7.3 RemainderPolicy

Defines how leftover length is handled after expanding repeats.

- `mode: 'flexReflow' | 'center' | 'left' | 'right'`
  - `flexReflow`: distribute remainder via flexible bay weights.
  - `center/left/right`: treat remainder as “gap” space (padding) placed accordingly.

For this system, `flexReflow` SHOULD be the default.

### 7.4 LocalRepeatSpec (repeat range inside a group)

Local repeats define how a `RepeatItem` expands within a group instance.

- `minRepeats: int` (>= 0)
- `maxRepeats: int | 'auto'` (>= `minRepeats`)
- `distributionOrder: 'centerOut' | 'leftToRight' | 'rightToLeft'`

Rules:
- Local repeat counts MUST be resolved once per compatible stable-run group so
  bay topology stays identical within that group; incompatible silhouettes
  solve independently.
- When extra local repeats are assigned across multiple group instances, `centerOut` MUST allocate extras from the center of the face outward deterministically (with stable tie-breaks for even counts).

---

## 8. Bay content model (vertical rules)

Each bay contains vertical “segments” that describe what appears along `v`.

### 8.1 BayContentSpec

- `segments: VerticalSegmentSpec[]` ordered bottom→top

Segments MUST NOT overlap and MUST cover at least the vertical range the bay intends to define. Uncovered ranges are treated as wall using inherited defaults.

### 8.2 Vertical span addressing

Segments MAY be specified in one of these modes:

**Floors-based**

- `span: { mode: 'floors', from: FloorRef, to: FloorRef }`
- `FloorRef = { layerId: string, floorIndex: int }`
- The span is `[from, to)` (from inclusive, to exclusive).

**Layers-based**

- `span: { mode: 'layers', fromLayerId: string, toLayerId: string }`
- Indicates the full vertical extent from the bottom of `fromLayerId` to the top of `toLayerId` (inclusive).

**Meters-based**

- `span: { mode: 'meters', vStart: meters, vEnd: meters }`

Floors-based SHOULD be used for repeated per-floor openings; layers-based SHOULD be used for full-height elements.

### 8.3 Segment types

`VerticalSegmentSpec`:

- `span: VerticalSpan`
- `type: 'wall' | 'opening' | 'column'`
- `payload: WallSegment | OpeningSegment | ColumnSegment`

#### 8.3.1 WallSegment

- `material: MaterialSpec | 'inherit'`
- `depth: BayDepthSpec | 'inherit'`
- `tiling?: TilingSpec | 'inherit'`
- `materialVariation?: MaterialVariationSpec | 'inherit'`

#### 8.3.2 OpeningSegment (windows/doors)

- `openingType: 'window' | 'door'`
- `layout: OpeningLayoutSpec`
- `inset?: meters` (>= 0)
- `frame?: FrameSpec`
- `glass?: GlassSpec`
- `pbr?: WindowPbrSpec`
- `catalogId: string` (window/door type id)
- `params?: object` (type-dependent)

**OpeningLayoutSpec**

- `mode: 'onePerFloor' | 'fixedCount' | 'none'`
- If `onePerFloor`:
  - `height: meters` (or `heightFracOfFloor`)
  - `sillHeight: meters` (or `sillFracOfFloor`)
  - `horizontalAlign: 'center' | 'left' | 'right'`
  - `marginLeft?: meters`
  - `marginRight?: meters`
  - `minClearanceToBayEdge?: meters` (default > 0 to avoid touching bay edges)
- If `fixedCount`:
  - `count: int` (>= 1)
  - `verticalDistribution: 'even' | 'custom'`
  - `horizontalAlign: 'center' | 'left' | 'right'`

Rules:

- For `onePerFloor`, each floor within the span produces at most one opening in this bay.
- If an opening cannot fit within the bay’s effective width (after margins/clearance), it MUST be omitted and surfaced as a warning (not silently placed overlapping).

#### 8.3.3 ColumnSegment (pilasters / spacers)

- `material: MaterialSpec | 'inherit'`
- `extrude: meters` (can be negative for inset)
- `profile: 'flat' | 'rounded' | 'bevel' | string` (future-extensible)
- `cap?: ColumnCapSpec`
- `joinContinuously: boolean` (default true)

If `joinContinuously` is true, the generator SHOULD create a single continuous mesh for the column across the span, including across layer boundaries (producing step transitions at layer boundaries if the face plane offsets).

---

## 9. Layout solving (per face, per layer)

This section defines the high-level inputs/outputs for solving.

The canonical deterministic **v0** fitting algorithm (repeat groups center-out, apply per-bay `expandPreference` local repetition, then expand remainder with clamp/redistribute and deterministic tie-breaks) is specified in:
- `specs/buildings/BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`

### 9.1 Inputs

For a given face `F` and layer `K`:

- `L(F, K)` is the face length in meters.
- `cornerPolicy` defines reserved corner zones:
  - `Cstart(F)` and `Cend(F)` (meters).
- `Lusable(F, K) = max(0, L(F, K) - Cstart(F) - Cend(F))`.

### 9.2 Resolve repeat counts (global per face)
Repeat counts MUST be resolved deterministically per compatible stable-run
group and shared only across its participating layers, according to the
canonical algorithm in:
- `specs/buildings/BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`

### 9.3 Expand layout into a flat bay list

After resolving group repeat counts, flatten the facade layout into a bay list:

- `baysExpanded(F) = [bay0, bay1, ...]`

This list defines the bay topology for the face in this floor layer.

### 9.4 Solve bay widths per layer (reflow)
Widths are solved per layer, respecting min/max constraints, using equal distribution with clamp + redistribution and center-out tie-breaks as specified in:
- `specs/buildings/BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`

### 9.5 Overflow policy (invalid vs auto-fix)

`FacadeValidationRules` MUST specify what happens when a layer cannot fit:

- `overflowPolicy: 'invalid' | 'reduceRepeats'`

Rules:

- If `reduceRepeats`, the system MAY reduce repeat counts (globally for the face) until all layers fit.
- If no repeat reduction can make it fit (or no repeat groups exist), the facade MUST be marked invalid.

Default recommendation: `reduceRepeats` for early authoring, with a visible warning that repeat counts changed; `invalid` for final/exported assets.

### 9.6 Output of solving

For each face `F` and layer `K`, the solver produces:

- `ResolvedBay[]`, in order:
  - `bayId`
  - `uStart`, `uEnd`, `width`
  - resolved corner padding (implicitly from the reserved zones)

These resolved intervals are the “2D facade” result used for geometry generation.

---

## 10. Depth and inset/extrusion rules

### 10.1 BayDepthSpec

Bay depth MAY be authored as either a **uniform offset** or **per-edge offsets**.

**Uniform offset**
- `mode: 'offset'`
- `offset: meters` (negative inset, positive extrude)

**Per-edge offsets (BF2 v0 UI)**
- `mode: 'edgeOffsets'`
- `left: meters` (depth at the bay’s `uStart` edge)
- `right: meters` (depth at the bay’s `uEnd` edge)
- `linked?: boolean` (authoring convenience; when `true`/omitted, `left` and `right` are treated as equal)

Orientation rule:
- `Left`/`Right` are defined relative to the face’s `u` direction (`u=0` at face start corner → `u=L` at face end corner).

Future (non-normative):
- `blendAtEdges?: 'step' | 'miter' | 'bevel'` can control joins between adjacent bays with different depths.

### 10.2 Depth stacking (author intent)

Depth is evaluated in this order (later entries override earlier):

1. Base wall plane (from the layer footprint face plane)
2. Face default depth (from `FacadeDefaults`)
3. Bay depth (from `BayDepthSpec`)
4. Segment-specific depth (opening inset / column extrude)

---

## 11. Corner handling

Corners are seams between two adjacent faces. Corner policies MUST prevent double-ownership and must avoid cracks.

### 11.1 CornerPolicy

- `startCorner: CornerEndPolicy`
- `endCorner: CornerEndPolicy`

**CornerEndPolicy**

- `reserve: meters` (>= 0)
- `treatment: 'cap' | 'none' | 'wrap'`
- `ownership: 'thisFace' | 'neighborFace' | 'shared'`

### 11.2 Recommended default (v1)

To keep behavior simple and robust:

- Use `reserve + cap` with deterministic ownership:
  - Each corner is owned by exactly one face (e.g., the “lower letter” face owns the corner cap).
  - Corner caps hide minor depth mismatches between adjacent faces.

### 11.3 Corner cap geometry intent

A corner cap is a vertical element that:

- spans the wall vertical extent,
- occupies the reserved corner widths on both adjacent faces,
- is generated as a continuous mesh (no seams between layers).

### 11.4 Corner cutouts (tangent-only)

Corner cutouts are an optional authoring signal used to remove wall area near corners (primarily to support future corner windows).

- Expressed via `FacadeSpec.cornerCutouts`.
- Cut lengths are applied along face tangents (`u` axis), not along depth.
- The generator clamps cut lengths based on feasibility near the corner (default `minBayWidth = 0.1m`) and applies deterministic precedence when both faces compete for an unstable corner configuration (odd faces win).

---

## 12. Continuity across layers (single-mesh intent)

To reduce visible breaks at layer boundaries:

### 12.1 BayContinuitySpec

- `mode: 'stitchAcrossLayers' | 'perLayer'`
- `stitchPolicy?: 'mergeMeshes' | 'singleMeshPreferred'`

Rules:

- `stitchAcrossLayers` indicates that geometry for this bay SHOULD be treated
  as one continuous element only across a compatible stable-run group.
- Bay widths MAY change per layer due to reflow; continuity is maintained by connecting bay cross-sections at layer boundaries (creating step transitions).
- Openings SHOULD remain aligned to floor bands; an opening segment that spans layers MUST be explicitly authored (layers-based span), otherwise openings are per-floor/per-layer.
- An incompatible/missing/remapped run ends the stitch. Each side closes against
  its owning silhouette and the engine generates the watertight layer
  transition; the facade solver MUST NOT guess a replacement face.

---

## 13. Validation requirements

The system MUST validate and surface errors/warnings rather than silently falling back.

### 13.1 Hard errors (invalid configuration)

- Invalid local silhouette/identity data or an unresolved required topology
  remap decision.
- A requested cross-layer stitch/lock whose runs fail stable identity,
  orientation, topology, or solver compatibility.
- Any bay with invalid size constraints (min/preferred/max ordering, non-positive widths).
- No feasible solution under constraints and overflow policy.
- Overlapping vertical segments within a bay.

### 13.2 Warnings (configuration is usable but imperfect)

- A cross-layer continuity group split by an incompatible or missing run, when
  both resulting per-layer facade groups remain valid.
- Orphaned facade/link/material/decoration/attachment/stretch targets retained
  for explicit author resolution.
- Openings omitted due to insufficient bay width after margins/clearance.
- Repeat counts reduced (if using `reduceRepeats`) to satisfy constraints.
- Extremely small or large resolved bay widths (outside recommended ranges).

---

## 14. Relationship to previous “windows + spacer columns” model

This facade system replaces the old face-level “window spacing + optional spacer columns” approach:

- Spacer columns become **explicit column bays** or **column segments** within bays.
- Window placement becomes **bay-driven** (which bays contain openings), not “fill the face with evenly spaced windows”.

This increases authoring power while keeping deterministic fitting rules.

---

## 15. Local bay-boundary transitions (AI 541)

Bay fill first resolves physical strips and repeated occurrences. AI 541 then
matches stable source bay ids at consecutive Start/End endpoints; it never
matches by authored array index. Runout stations are meters along the resolved
front paths. The reserved span reduces usable content frontage before openings,
cuts, balconies, piers, or decorators are emitted.

The transition retains both source bay identities. Material and decoration
ownership follows the source side until the exact meeting sample J, then the
target side; meter UV distance continues along the curve. A relationship that
overlaps another reserved span or enters required content is blocked with the
two physical endpoint identities in its warning.

An opening that remains on a source bay front samples that strip at its own
resolved station. Its center uses the interpolated left/right bay depth, and
its tangent, outward normal, yaw, wall cut, reveals, and visible assembly all
use the same world-space strip plane. Repeated openings sample independently;
they must not share one average depth or the parent face's unsloped normal.

---

## 16. Open questions (to finalize before implementation)

1. **Default remainder policy:** whether leftover length should always reflow, or sometimes become padding gaps.
2. **Per-face vs per-layer overrides:** what overrides are allowed without breaking continuity (materials, window types, depth).
3. **Corner cap styling:** whether caps are a simple post, or derived from adjacent bay materials.
