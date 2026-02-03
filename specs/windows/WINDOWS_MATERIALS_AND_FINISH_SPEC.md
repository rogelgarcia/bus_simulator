# Windows — Materials and Finish Spec

Status: **Proposed (draft)**  
Scope: Window Builder **Materials/Finish** tab and feature tabs that reuse the same controls.  
Non-goals: Final shader authoring, PBR correctness tuning, or final UI visual design.

This spec defines the canonical **materials and finish parameters** for window features and how they relate to feature enablement, per-face overrides, and UV mapping behavior.

Related specs:
- Builder tabs and control reuse: `specs/windows/WINDOWS_BUILDER_TABS_AND_CONTROL_REUSE_SPEC.md`
- Sizes and positioning parameters (including UV adjustment object shape): `specs/windows/WINDOWS_SIZE_AND_POSITIONING_SPEC.md`
- Balcony feature details: `specs/windows/WINDOWS_BALCONY_SPEC.md`

---

## 1. Goals

The window materials/finish system MUST:
- Provide a consistent material selection experience across the project using the **standard material picker** component.
- Support per-feature materials (Frame, Muntins, Shade, Glass, Sill, Balcony, Lintel, Trim, Interior).
- Support per-face material overrides for **Sill** and **Lintel** in a deterministic way while allowing per-face UV adjustments even when materials are linked.
- Remain compatible with the “no duplicate UI” requirement (controls are reused across tabs via re-parenting).

---

## 2. Standard Material Picker (UI requirement)

All material selection UI in the window builder MUST use the standard picker component (the BF2 picker behavior is the reference).

The picker MUST accept **sections** so different screens can provide curated lists without hardcoding filter flags.

First-pass capability:
- A section is a titled group of selectable entries.
- Each entry represents either:
  - a material/texture preset, or
  - a simple color material (if supported by the project’s material system).

Note: The exact picker API and data source are implementation-defined, but the UI behavior MUST be standardized.

---

## 3. Feature Material Slots (first pass)

Each feature has a primary material slot (unless otherwise specified):
- Frame: `frameMaterial`
- Muntins: `muntinMaterial` (may default to inherit `frameMaterial`)
- Glass: `glassMaterial` (or a glass preset; may include tint/opacity controls elsewhere)
- Shade: `shadeMaterial`
- Sill: `sillMaterial`
- Balcony: `balconyMaterial` (details beyond this slot are deferred; see §7)
- Header/Lintel: `lintelMaterial`
- Trim: `trimMaterial`
- Interior/parallax: `interiorMaterial` (or interior preset selection; see interior specs)

Inheritance rules (normative):
- If a feature has an explicit “inherit from X” option in UI, inheritance MUST be explicit and deterministic.
- If no explicit inherit option exists, each feature material is independent.

---

## 3.1 Frame finish (bevel/roundness) — first pass

The frame uses a beveled/rounded look driven by procedural texture/shader parameters (not additional geometry).

These finish parameters MUST exist in the first pass and be exposed in:
- **Frame** tab, and
- **Materials/Finish** tab (grouped under Frame),
using the same reusable control section (no duplicate UI).

Parameters:
- `frameBevelSize` (0..1): fraction of frame width affected by bevel
- `frameBevelRoundness` (0..1): bevel profile sharpness (0) to smooth rounding (1)

Defaults (implementation-defined), but MUST be deterministic.

### 3.2 Muntins finish rule (inherit frame bevel)

First pass rule:
- Muntins MUST inherit `frameBevelSize` and `frameBevelRoundness` (no separate muntin bevel controls).

---

## 4. Per-Face Overrides (Sill and Lintel)

### 4.1 Face set and deterministic order

Sill and Lintel share a canonical face set and order (MUST match `specs/windows/WINDOWS_SIZE_AND_POSITIONING_SPEC.md`):
- Faces: `front`, `top`, `bottom`, `left`, `right`, `back`
- Face order: `front`, `top`, `bottom`, `left`, `right`, `back`

### 4.2 Override model

For `sill` and `lintel`, the system MUST support optional per-face material overrides:
- `sillFaceMaterials[face]` (optional, per face)
- `lintelFaceMaterials[face]` (optional, per face)

The feature-level material (`sillMaterial` / `lintelMaterial`) remains the default when no overrides are set.

### 4.3 Linking rule when not all faces specify materials

Requirement: if not all faces specify a material, faces without a material are linked to the first face that does.

Normative definition of **effective face material**:

Given a feature F in `{sill, lintel}`:
1) Let `Overrides = { face | FFaceMaterials[face] is set }`.
2) If `Overrides` is empty:
   - `effectiveMaterial(face) = FMaterial` (feature-level material) for all faces.
3) Otherwise:
   - Let `anchorFace` be the first face in Face order that is in `Overrides`.
   - For each `face`:
     - if `FFaceMaterials[face]` is set: `effectiveMaterial(face) = FFaceMaterials[face]`
     - else: `effectiveMaterial(face) = FFaceMaterials[anchorFace]`

This ensures:
- Setting a material on only one face automatically links all other faces to that same material.
- Adding a second face material breaks the link for that face only.

### 4.4 UV adjustments are independent of material linking

Even when a face’s material is linked via §4.3, its UV adjustments MUST remain independently adjustable.

UV adjustment storage and defaults are defined in `specs/windows/WINDOWS_SIZE_AND_POSITIONING_SPEC.md`:
- `sillUvAdjustments.{default,faces}`
- `lintelUvAdjustments.{default,faces}`

---

## 5. Lintel UV mapping for arches (proposal)

When `lintelArchEnabled` is true, the lintel may have curved geometry.

To avoid stretched planar UVs over the curved segment, introduce an optional mapping mode:
- `lintelUvMappingMode`: `'planar' | 'curved'`

Defaults:
- If `lintelArchEnabled` is false: `lintelUvMappingMode = 'planar'`
- If `lintelArchEnabled` is true: `lintelUvMappingMode = 'curved'` (proposal; acceptable to default to planar if needed for first implementation)

Curved mapping definition (non-normative guidance):
- Along the arch direction, set `u` proportional to arc length (0..1).
- Across thickness/height, set `v` using the corresponding face’s local axis.
- Curved mapping MUST still allow applying the standard `uv` adjustments (`offset/scale/rotation`) as a post-transform.

Implementation note: Curved mapping typically requires sufficient curve tessellation to look smooth.

---

## 6. Materials/Finish Tab Composition (UI)

The **Materials/Finish** global tab MUST:
- Compose material control sections grouped by feature (Frame, Muntins, Glass, Shade, Sill, Balcony, Lintel, Trim, Interior).
- Reuse the same control section instances as the feature tabs (no duplicate UI).

Visibility rule:
- If a feature is not applicable due to `openingKind` (e.g., Sill/Balcony for doors) or is force-disabled, the corresponding material sections MUST be hidden.

Sill and Lintel controls MUST include:
- Feature-level material selection
- Optional per-face override controls (with linked-face behavior per §4.3)
- Per-face UV adjustments (per size/position spec)
- A clear indication when a face material is linked to an anchor face

---

## 7. Balcony (deferred details)

Balcony material/UV behavior is more complex and is specified in: `specs/windows/WINDOWS_BALCONY_SPEC.md`

First pass:
- Provide balcony platform per-face materials/UVs and first-pass railing materials/UVs per `specs/windows/WINDOWS_BALCONY_SPEC.md`.

Future extension (out of scope for this spec):
- Railings/material groups
