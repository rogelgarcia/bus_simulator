# Building Fabrication — Facade Layout Specification (Bays)

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
- Allow **per-layer reflow** (faces can be different lengths per layer) while keeping:
  - the **same bay topology** across layers (same bay ids/order), and
  - the same **group repeat counts** across layers.
- Support bays spanning multiple floors and (optionally) spanning multiple layers, with an explicit hint for **continuous mesh generation** (avoid visible breaks).
- Provide deterministic rules for **corner handling** (seams between adjacent faces).

Non-goals for the first iteration:

- Supporting a layer footprint that changes polygon topology (face count/order changes).
- Per-layer bay graphs with different bay counts (this breaks vertical continuity).
- Backtracking constraint solvers; the fitting must be deterministic and explainable.

---

## 2. Terminology and coordinate system

### 2.1 Footprint, faces, and corners

- A **Footprint** is a simple polygon (clockwise vertex order) describing the building outline at a height band.
- A **Corner** is a polygon vertex.
- A **Face** is a polygon edge between consecutive corners.

### 2.2 Face identity (letters)

- Faces MUST be labeled with stable letter ids: `A`, `B`, `C`, … in clockwise order.
- The number of faces is **not limited** to 4.
- Faces may be at any angle; the editor may snap angles (e.g. 15°), but the model is defined by the polygon geometry.

### 2.3 2D facade frame

For each face at a given layer:

- `u` is the horizontal axis along the face:
  - `u = 0` at the face’s start corner.
  - `u = L` at the face’s end corner, where `L` is the face length (meters).
- `v` is the vertical axis (meters), increasing upward from the building baseline.

The facade layout is authored in `(u, v)` and later mapped into 3D space for each face plane.

---

## 3. Layer model and the “faces must match” constraint

Buildings are defined in vertical **Layers** (floor layers and roof layers). This facade model targets vertical walls (typically from floor layers).

### 3.1 Applicability

- A `FacadeSpec` is authored per `faceId` and applies to a set of layers (by default: all floor layers).
- A layer MAY override facade defaults (materials, window types), but MUST NOT change bay topology (ids/order/count).

### 3.2 Topology invariants

To preserve stable face ids and allow cross-layer continuity:

- All layers to which facades apply MUST have a footprint polygon with the **same number of corners** and **same face order**, so face ids `A..` map consistently.
- If a layer operation (e.g., `planOffset`) would change topology (edge collapses, vertex merge/split, face disappears), the configuration MUST be considered invalid for this facade system (until a future “remapping” feature exists).

---

## 4. Data model (logical schema)

This is a conceptual schema; concrete serialization can be JSON/ES module later.

### 4.1 BuildingSpec

- `layers: LayerSpec[]`
- `facades: Record<FaceId, FacadeSpec>`
- `defaults?: BuildingFacadeDefaults`

### 4.2 LayerSpec (for facade concerns)

- `id: string`
- `type: 'floor' | 'roof'`
- If `type === 'floor'`:
  - `floors: int`
  - `floorHeight: meters`
  - `planOffset: meters`
  - (Optional) other layer properties (belts/roof/etc) are out of scope for this facade doc except where they affect vertical extents.

### 4.3 FacadeSpec

- `faceId: FaceId` (e.g. `"A"`)
- `appliesToLayers: 'allFloorLayers' | string[]` (list of layer ids)
- `cornerPolicy: CornerPolicy`
- `layout: FacadeLayout`
- `defaults: FacadeDefaults`
- `validation: FacadeValidationRules`

---

## 5. Facade layout: bays, groups, and repeats

### 5.1 FacadeLayout

`FacadeLayout` is an ordered list of `LayoutItem`:

- `LayoutItem = BayItem | GroupItem`

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

---

## 6. Bay sizing model

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
  - `global`: compute one repeat count shared by all applicable layers of this face.
  - `pinned`: repeat count is fixed by authoring (`pinnedRepeats`).
- `pinnedRepeats?: int` (required when `repeatCountPolicy === 'pinned'`)
- `remainder: RemainderPolicy`

### 7.2 Global repeat count requirement (continuity)

To keep bay topology aligned across layers:

- All repeat counts MUST be resolved **once per face** and MUST be shared across all layers to which the facade applies.
- When `repeatCountPolicy = 'global'`, the solver MUST use the most restrictive layer face length (see §9.2).

### 7.3 RemainderPolicy

Defines how leftover length is handled after expanding repeats.

- `mode: 'flexReflow' | 'center' | 'left' | 'right'`
  - `flexReflow`: distribute remainder via flexible bay weights.
  - `center/left/right`: treat remainder as “gap” space (padding) placed accordingly.

For this system, `flexReflow` SHOULD be the default.

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

This section defines the deterministic fitting algorithm.

### 9.1 Inputs

For a given face `F` and layer `K`:

- `L(F, K)` is the face length in meters.
- `cornerPolicy` defines reserved corner zones:
  - `Cstart(F)` and `Cend(F)` (meters).
- `Lusable(F, K) = max(0, L(F, K) - Cstart(F) - Cend(F))`.

### 9.2 Resolve repeat counts (global per face)

When a group uses `repeatCountPolicy = 'global'`:

1. Compute `LminUsable(F)` as the minimum `Lusable(F, K)` across all layers to which the facade applies.
2. For each repeatable group, compute the group’s `metricWidth` based on `fitMetric`:
   - `min`: sum of `min` widths (or fixed widths) of all bays in the group.
   - `preferred`: sum of `preferred` (or fixed) widths.
3. Expand repeats to the maximum `N` such that the full layout’s metric sum fits within `LminUsable(F)`, clamped to `[minRepeats, maxRepeats]`.

This produces a single repeat count `N` used for every applicable layer for that face.

### 9.3 Expand layout into a flat bay list

After resolving group repeat counts, flatten the facade layout into a bay list:

- `baysExpanded(F) = [bay0, bay1, ...]`

This list MUST be identical (ids/order/count) across layers for the face.

### 9.4 Solve bay widths per layer (reflow)

For each layer `K`, solve widths so that the bays fill `Lusable(F, K)`:

1. Initialize:
   - fixed bays: `w = width`
   - flex bays: `w = preferred`
2. Compute `sumW = Σ w`.
3. Compute `delta = Lusable - sumW`.
4. If `delta > 0` (need to grow):
   - Distribute `delta` across flex bays proportionally to `growWeight`,
   - Respecting `max` constraints (bays stop growing at max; remaining delta is redistributed).
5. If `delta < 0` (need to shrink):
   - Distribute `-delta` across flex bays proportionally to `shrinkWeight`,
   - Respecting `min` constraints (bays stop shrinking at min; remaining deficit is redistributed).
6. If constraints prevent a solution (e.g., even all flex bays at min are too wide):
   - Apply `overflowPolicy` (see §9.5).

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

- `mode: 'offset'`
- `offset: meters` (negative inset, positive extrude)
- `blendAtEdges?: 'step' | 'miter' | 'bevel'` (controls joins between adjacent bays)

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

---

## 12. Continuity across layers (single-mesh intent)

To reduce visible breaks at layer boundaries:

### 12.1 BayContinuitySpec

- `mode: 'stitchAcrossLayers' | 'perLayer'`
- `stitchPolicy?: 'mergeMeshes' | 'singleMeshPreferred'`

Rules:

- `stitchAcrossLayers` indicates that geometry for this bay SHOULD be treated as one continuous element across applicable layers.
- Bay widths MAY change per layer due to reflow; continuity is maintained by connecting bay cross-sections at layer boundaries (creating step transitions).
- Openings SHOULD remain aligned to floor bands; an opening segment that spans layers MUST be explicitly authored (layers-based span), otherwise openings are per-floor/per-layer.

---

## 13. Validation requirements

The system MUST validate and surface errors/warnings rather than silently falling back.

### 13.1 Hard errors (invalid configuration)

- Face topology mismatch across applicable layers.
- Any bay with invalid size constraints (min/preferred/max ordering, non-positive widths).
- No feasible solution under constraints and overflow policy.
- Overlapping vertical segments within a bay.

### 13.2 Warnings (configuration is usable but imperfect)

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

## 15. Open questions (to finalize before implementation)

1. **Face id stability in editing:** how the “starting face” is chosen and persisted when the footprint polygon is edited.
2. **Default remainder policy:** whether leftover length should always reflow, or sometimes become padding gaps.
3. **Per-face vs per-layer overrides:** what overrides are allowed without breaking continuity (materials, window types, depth).
4. **Corner cap styling:** whether caps are a simple post, or derived from adjacent bay materials.

