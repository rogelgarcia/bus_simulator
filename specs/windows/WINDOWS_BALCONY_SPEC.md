# Windows — Balcony Spec

Status: **Proposed (draft)**  
Scope: Window system balcony feature (geometry, sizing/positioning, materials/UV, first-pass railing types).  
Non-goals: Final art mesh assets, complex railing profiles, physics/collisions, or advanced parametric patterns beyond first-pass bars.

This spec defines a first-pass balcony model that is:
- composed of a **platform slab** and a **3-sided perimeter system**
- configurable per-side (left/front/right) for infill type (open/solid/glass/grid)
- capable of adding **corner posts** and optional extra posts
- compatible with per-face materials and per-face UV adjustments for the platform

Related specs:
- Builder tabs and control reuse: `specs/windows/WINDOWS_BUILDER_TABS_AND_CONTROL_REUSE_SPEC.md`
- Sizes and positioning: `specs/windows/WINDOWS_SIZE_AND_POSITIONING_SPEC.md`
- Materials and finish: `specs/windows/WINDOWS_MATERIALS_AND_FINISH_SPEC.md`
- Feature parameters: `specs/windows/WINDOWS_FEATURE_PARAMETERS_SPEC.md`

---

## 1. Coordinate, Attachment, and Naming

Balcony is authored in the window’s local space:
- +X: window local right
- +Y: up
- +Z: outward from wall (window local normal)

Balcony attachment:
- Balcony is attached to the window plane (same local space as frame/glass).
- Balcony platform is assumed to be **flush to the wall at the back edge** (no “back” face exposed), unless a future option adds a back face.

---

## 2. High-level Decomposition (first pass)

Balcony consists of:
1) **Platform slab** (ground block)
2) **Perimeter railing system** made of:
   - three sides: `left`, `front`, `right`
   - optional **posts**
   - optional **top rail** (“lean on” cap)
   - an **infill** per side (`open | solidWall | glassPanel | grid`)

---

## 3. Platform Slab

### 3.1 Platform size

Parameters:
- `balconyWidth` (meters): size along +X
- `balconyDepth` (meters): size along +Z (outward)
- `balconyPlatformThickness` (meters): size along +Y (slab thickness)

Optional placement:
- `balconyElevation` (meters, default 0): vertical offset applied to the entire balcony assembly.
  - Positive moves balcony upward.
  - Negative moves balcony downward.

### 3.2 Platform faces (5 faces)

The platform is treated as a slab attached to the wall, exposing 5 faces:
- `top`
- `bottom`
- `front`
- `left`
- `right`

The `back` face is not exposed by default (attached to wall).

Face order (normative, used for “first face” rules):
- `top`, `bottom`, `front`, `left`, `right`

---

## 4. Perimeter Railing System

### 4.1 Side enablement

Per side:
- `balconyRailing.sides.left.enabled` (bool)
- `balconyRailing.sides.front.enabled` (bool)
- `balconyRailing.sides.right.enabled` (bool)

Default:
- All three enabled.

### 4.2 Side infill type (per side)

Per side:
- `balconyRailing.sides.<side>.infillType` (enum):
  - `open`
  - `solidWall`
  - `glassPanel`
  - `grid`

Rules:
- When `infillType = open`, the side produces no infill geometry, but posts/top rail may still exist if enabled.

### 4.3 Railing global dimensions

Parameters:
- `balconyRailingHeight` (meters): height of the side system above the platform top surface.
- `balconyRailingThickness` (meters): base thickness used for “solidWall” infill and for framing baselines.
- `balconyRailingInsetFromEdge` (meters, default 0): inset of the railing footprint from the platform outer edge.

---

## 5. Posts (supports)

Posts are vertical supports for railing corners and optionally additional supports along sides.

### 5.1 Enablement and profile

Parameters:
- `balconyRailingPosts.enabled` (bool, default true when any side is enabled)
- `balconyRailingPosts.profile` (enum): `box` (first pass)
- `balconyRailingPosts.width` (meters)
- `balconyRailingPosts.depth` (meters)

### 5.2 Placement mode

Parameters:
- `balconyRailingPosts.mode` (enum):
  - `cornersOnly`
  - `maxSpacing`
  - `explicitPerSide`

Rules:
- Corner posts MUST exist when:
  - `balconyRailingPosts.enabled = true`, and
  - at least one of the adjacent sides is enabled.

Additional post placement:
- If `mode = maxSpacing`:
  - `balconyRailingPosts.maxSpacing` (meters) controls the maximum distance between posts.
- If `mode = explicitPerSide`:
  - `balconyRailingPosts.explicitCount.left` (int, >= 0)
  - `balconyRailingPosts.explicitCount.front` (int, >= 0)
  - `balconyRailingPosts.explicitCount.right` (int, >= 0)
  - Counts represent additional posts *between corners*.

---

## 6. Top Rail (cap)

Top rail is a horizontal piece along enabled sides at the top of the railing, intended as the “lean on” surface.

Parameters:
- `balconyTopRail.enabled` (bool, default true when any side is enabled)
- `balconyTopRail.width` (meters): cap width (perpendicular to side direction)
- `balconyTopRail.height` (meters): cap height (vertical thickness)
- `balconyTopRail.overhang` (meters, default 0): how far the cap overhangs outward beyond the infill footprint
- `balconyTopRail.cornerJoinMode` (enum): `butt | miter` (first pass default `butt`)

---

## 7. Infill Types (first pass behavior)

### 7.1 Solid wall infill

When `infillType = solidWall`, generate a simple wall strip per enabled side:
- height = `balconyRailingHeight`
- thickness = `balconyRailingThickness`

### 7.2 Glass panel infill

When `infillType = glassPanel`, generate one panel per enabled side.

Parameters:
- `balconyRailingGlass.thickness` (meters, default 0): if 0, render as a plane; otherwise as a thin slab.
- `balconyRailingGlass.gapFromPosts` (meters, default small value): horizontal inset so the panel does not intersect posts.

### 7.3 Grid infill (procedural bars)

First pass: grid infill is generated procedurally using repeated small box “bars” (no custom mesh required).

Parameters:
- `balconyRailingGrid.pattern` (enum): `verticalBars | verticalAndHorizontal` (first pass default `verticalBars`)
- `balconyRailingGrid.barWidth` (meters)
- `balconyRailingGrid.barDepth` (meters)
- `balconyRailingGrid.mode` (enum): `spacing | count`
  - if `spacing`: `balconyRailingGrid.barSpacing` (meters)
  - if `count`: `balconyRailingGrid.barCount` (int, >= 0)
- `balconyRailingGrid.gapFromPosts` (meters, default small value)

Future extension (out of scope):
- `balconyRailingGrid.panelMeshId` (string) to select a custom railing panel mesh asset.

---

## 8. Materials and UV Adjustments (balcony)

Balcony has multiple material groups, some of which support per-face overrides.

### 8.1 Platform materials (per-face)

Slots:
- `balconyPlatformMaterial` (default)
- `balconyPlatformFaceMaterials[face]` (optional per-face overrides, face set in §3.2)

Linking rule when not all faces specify materials (normative):
1) Let `Overrides` be the set of faces with an override.
2) If `Overrides` is empty, all faces use `balconyPlatformMaterial`.
3) Otherwise, pick `anchorFace` as the first face in the platform face order that has an override.
4) Any face without an override uses the `anchorFace` override material.

UV adjustments:
- `balconyPlatformUvAdjustments.default` (uv)
- `balconyPlatformUvAdjustments.faces[face]` (optional per-face uv overrides)

Rule:
- UV adjustments remain independently adjustable per face even when materials are linked via the rule above.

### 8.2 Railing materials

Slots (first pass):
- `balconyRailingPostMaterial`
- `balconyTopRailMaterial`
- Infill materials:
  - `balconyRailingWallMaterial` (for `solidWall`)
  - `balconyRailingGlassMaterial` (for `glassPanel`)
  - `balconyRailingGridMaterial` (for `grid`)

UV adjustments (first pass):
- `balconyRailingPostUvAdjustments` (uv)
- `balconyTopRailUvAdjustments` (uv)
- `balconyRailingInfillUvAdjustments` (uv) (applies to wall/grid; glass may ignore UV adjustments depending on shader)

---

## 9. Validation / Clamps (minimums)

Implementation MUST clamp deterministically to avoid degenerate geometry:
- `balconyWidth > 0`
- `balconyDepth > 0`
- `balconyPlatformThickness >= 0`
- `balconyRailingHeight >= 0`
- Thickness/width values >= 0, and must not exceed a safe fraction of balcony dimensions (implementation-defined).

---

## 10. Open Questions (explicitly deferred)

- Balcony “back” face options (if balcony is not always flush to wall)
- Railings with complex profiles or curved/ornamental meshes
- Per-face materials/UVs for all railing components (posts/top rail/infill) if needed
- Balcony collision/physics rules

