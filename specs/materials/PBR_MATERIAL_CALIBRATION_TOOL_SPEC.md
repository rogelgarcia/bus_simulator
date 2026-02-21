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

### 3.4 Illumination stability and global resolver contract

Lighting uses one shared global resolver with two explicit paths:
- Default path (`L1 + L2`) for every screen:
  - `L1`: code defaults (`LIGHTING_DEFAULTS`)
  - `L2`: persisted browser overrides (`bus_sim.lighting.v1`)
- Calibration path (Material Calibration only):
  - when a preset is selected, a complete preset snapshot replaces the default merged path
  - replacement is full snapshot semantics (not shallow merge)

Calibration behavior requirements:
- deterministic (same preset id -> same numeric settings)
- stable across slot focus changes (no per-sample lighting drift)
- missing/invalid/incomplete preset snapshot must fall back to default path and surface a UI warning state
- exiting calibration must reload default global resolver settings so calibration preset mode never leaks to other states

First-pass calibration presets:
- `neutral` — soft baseline (IBL-enabled)
- `overcast` — softer directional contrast
- `sunny` — harder directional contrast for spec/roughness checks

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
  - Preset selector, including `Default (Global)` mode
  - Short preset description
  - Explicit mode status label:
    - default mode active (`L1 + L2`)
    - preset mode active (full replacement)
    - warning when falling back from missing/incomplete preset
  - Reset actions:
    - `Use default lighting` (clear active preset mode and return to merged default path)
    - `Reset saved defaults` (clear browser overrides in `bus_sim.lighting.v1`)

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

## 5. Storage / persistence

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
- `illuminationPresetId` may be empty (`''`) to represent global default lighting mode.

Global lighting persistence (shared across screens):
- Key: `bus_sim.lighting.v1`
- Stores user/browser overrides (`L2`) over code defaults (`L1`).
- Clearing this key resets default mode to pure code defaults.

---

## 6. Shared Calibration Resolver Contract (AI 349)

The Material Calibration tool is a first-class consumer of the shared runtime calibration layer:
- resolver module: `src/graphics/content3d/materials/PbrTextureCalibrationResolver.js`
- shared loader pipeline: `src/graphics/content3d/materials/PbrTexturePipeline.js`

Requirements:
- calibration overrides are resolved by `materialId` and cached for the active session,
- correction payload mapping must remain deterministic (generated tool output -> runtime override fields),
- calibration fallback must be safe (missing/invalid correction config resolves to defaults, no hard failure),
- tool refresh/reload actions may force resolver cache refresh during the current session.
