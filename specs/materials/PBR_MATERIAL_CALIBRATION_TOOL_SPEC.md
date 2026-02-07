# PBR Material Calibration Tool (Phase 2)

Status: **Implemented (Phase 2 first pass)**  
Scope: Side-by-side calibration workflow for catalog-first PBR materials.

This spec defines the requirements and behavior of the in-game **Material Calibration** tool used by Phase 2 of `PBR_MATERIAL_NORMALIZATION_PIPELINE_SPEC.md`.

---

## 1. Purpose

The Material Calibration tool exists to make PBR material evaluation objective and repeatable:
- compare up to **3** materials side-by-side on standardized reference geometry
- switch between deterministic illumination presets without “drift”
- adjust catalog-driven parameters **per materialId** (no per-object tweaks)

---

## 2. Access / Entry

The tool is a state-machine scene:
- State id: `material_calibration`
- Available from the **Q menu** (Setup overlay), label: **Material Calibration**

---

## 3. Scene requirements

### 3.1 Slots / selection

- The viewport displays **up to 3** selected materials at a time (slots 1–3).
- Clicking a sample in the viewport sets that slot as the **active material** for the adjustment panel.
- Selecting a 4th material must not exceed 3 slots:
  - First pass rule: selecting a new material replaces the **active** slot (deterministic).

### 3.2 Reference geometry

- Each slot uses standardized reference geometry to inspect:
  - tiling/scale response (panel)
  - specular/roughness response (sphere/cube)
- Geometry layout is user-selectable (first pass):
  - Full: panel + sphere + cube
  - Panel only
  - Sphere only

### 3.3 Camera

- Camera must support **arrow-key panning** (with shift for faster movement).
- “Focus camera” actions must preserve the current orbit angle/distance style:
  - focusing another slot translates the camera target only (no angle drift)

### 3.4 Illumination stability

Illumination presets must be:
- deterministic (same preset id → same numeric settings)
- stable across slot focus changes (no “lighting changes per sample”)
- restored on exit (presets must not leak into other states)

First-pass presets:
- `neutral` — soft baseline (IBL-enabled)
- `overcast` — softer directional contrast
- `sunny` — harder directional contrast for spec/roughness checks

Notes:
- Presets may adjust exposure, IBL intensity, hemisphere intensity, and sun direction/intensity.
- IBL background must remain consistent (tool may use a solid background while keeping IBL environment).

---

## 4. UI layout & interactions

### 4.1 Bottom full-width Catalog panel

- Bottom dock spans the full screen width.
- Contains:
  - Category selector (Phase 1 `classId`s)
  - Material cards for that category
- Cards:
  - Click toggles selected/unselected
  - Enforces max 3 slots (replacement rule above)
  - Includes a **Focus camera** button

### 4.2 Left panels

- **Options** panel:
  - Tiling mode selector (Default vs 2×2 multiplier)
  - Layout mode selector
- **Illumination** panel:
  - Preset selector
  - Short preset description

### 4.3 Center overlay tools

- Center overlay shows **only** the ruler tool in first pass.
- Ruler:
  - click two points to measure distance in meters
  - label follows the midpoint projection as the camera moves

### 4.4 Right adjustment panel

- Shows the currently active material id.
- Baseline selection:
  - choose baseline from selected slots
  - if baseline becomes invalid (unselected), default to the first selected material
- Adjustment controls:
  - must map to per-`materialId` overrides (catalog-first)
  - must not be stored as per-object/mesh tweaks

---

## 5. Storage / persistence (Phase 2 first pass)

The calibration tool persists **tool state** and **per-material overrides** in `localStorage`:

- Key: `bus_sim.material_calibration.v1`
- Stored fields (first pass):
  - `selectedClassId`
  - `illuminationPresetId`
  - `layoutMode`
  - `tilingMode`
  - `activeSlotIndex`
  - `slotMaterialIds` (length 3, entries are `materialId` or `null`)
  - `baselineMaterialId`
  - `overridesByMaterialId` (map of `materialId` → numeric overrides)

Rules:
- Overrides must be stored **by `materialId`**, not by slot index.
- Overrides should be stored as a minimal diff from defaults when possible.
- The tool may apply overrides only within the calibration scene in Phase 2.
  - Exporting overrides back into catalog config modules is a later phase.

