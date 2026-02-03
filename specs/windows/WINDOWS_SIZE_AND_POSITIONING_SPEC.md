# Windows — Size and Positioning Spec

Status: **Proposed (draft)**  
Scope: Window Builder **Sizes & Positioning** tab and feature tabs that reuse the same controls.  
Non-goals: Final mesh generation details, rendering/shader implementation.

This spec defines the canonical **window sizing and positioning parameters** and how they relate to each other. All controls described here are intended to be reused across:
- the global **Sizes & Positioning** tab (grouped by feature), and
- each feature-specific tab (flat layout for that feature).

---

## 1. Coordinate and Units

- Length units are **meters**.
- “Z-offset” is defined as displacement along the window’s **local normal** (outward from the wall plane).
  - Positive z-offset moves the element **outward**.
  - Negative z-offset moves the element **inward**.
- “UV adjustments” refer to 2D texture coordinate adjustments applied to the element’s mapping (exact mapping reference is implementation-defined, but the controls must be consistent across elements).

### 1.1 Z layering reference planes (normative)

To make z-offsets unambiguous and consistent across UI and engine, define these local planes (all distances in meters):

- `zWall = 0`: the wall surface plane where the window opening is placed.
- Frame block reference (when the Frame feature is enabled):
  - `frameInset` (meters): recess of the whole window block into the wall (positive means deeper into the building).
  - `zFrameBase = zWall - frameInset`
- Frame extrusion:
  - `frameDepth` (meters): how far the frame extrudes outward from `zFrameBase`.
  - `zFrameFront = zFrameBase + frameDepth`

Feature enablement affects anchoring:
- If the **Frame** feature is disabled, then `zFrameBase` and `zFrameFront` are treated as `zWall` for anchoring purposes (the frame block does not exist).
- Any “against the frame” anchoring MUST fall back to “against the wall” when the Frame feature is disabled.

Per-element z-offsets are then applied relative to the appropriate anchor:
- Muntins are positioned relative to the **frame front** plane (see §10).
- Shade is positioned relative to the **frame front** plane (see §10).
- Glass is positioned relative to the **shade** when shade is enabled; otherwise relative to the **frame front** plane (see §10).
- Parallax/interior is positioned behind the glass/shade stack (see §10).

---

## 2. Window Size (Global)

### 2.1 Window (overall)

- `windowWidth`
- `windowHeight`

These define the overall window footprint size used for:
- wall cutout sizing (unless overridden by cut rules)
- frame sizing reference
- glass aperture baseline (after subtracting frame widths)

---

## 3. Frame Size

### 3.1 Frame edge widths

Frame edge widths are specified per side:
- `frameLeftWidth`
- `frameRightWidth`
- `frameTopWidth`
- `frameBottomWidth`

#### Link behavior (two-level)

Frame widths MUST support a two-level link system:
- **Link Level 1 (axis link)**:
  - Horizontal link: left == right
  - Vertical link: top == bottom
- **Link Level 2 (all link)**:
  - left == right == top == bottom

Defaults:
- All link enabled by default.

### 3.2 Frame arch

- `frameArchEnabled` (bool)
- `frameArchRatio` (number)

Normative definition:
- The arch rise (height above the rectangular top chord) is computed as:
  - `archRise = clamp(frameArchRatio, 0, +∞) * windowWidth`
  - and MUST be clamped so it cannot exceed the window height minus a small safety margin.

Additional first-pass arch behavior flags (existing spec alignment):
- `frameArchMeetsRectangleFrame` (bool): whether the arch meets the rectangular frame with a straight chord boundary.
- `frameArchTopPieceMode` (enum): `'frame' | 'muntin'`
- `frameArchClipVerticalMuntinsToRectWhenNoTopPiece` (bool)

These options exist to avoid ambiguous geometry at the arch/rectangle junction and to keep muntin behavior deterministic.

### 3.3 Frame depth (extrusion)

- `frameDepth` (meters): how far the frame extrudes outward from the wall reference plane (after applying `frameInset`).

---

## 4. Wall Cut Size / Cutout Alignment

The wall cut defines how the opening in the wall aligns relative to the window/frame.

### 4.1 Cutout reference (width/height lerp)

The wall cutout should support separate alignment for width and height, expressed as a normalized lerp:

- `wallCutWidthLerp` (number, default 0)
- `wallCutHeightLerp` (number, default 0)

Interpretation:
- Each lerp is clamped to `[0, 1]`.
- `0` means the wall cutout aligns to the **outer** boundary (outside of the frame).
- `1` means the wall cutout aligns to the **inner** boundary (glass opening boundary / aperture side).

Note: The naming is intentionally “lerp” and not “UV” to reflect that this affects **opening geometry alignment**, not just texture mapping.

---

## 5. Muntins Size

### 5.0 Enablement and layout (first pass)

Muntins MUST support a basic grid layout:
- `muntinsEnabled` (bool)
- `muntinColumns` (int, >= 0)
- `muntinRows` (int, >= 0)

Interpretation:
- `muntinsEnabled = false` disables all muntin geometry.
- When enabled:
  - `muntinColumns` controls vertical divisions (panes in X), and implies `muntinColumns - 1` internal vertical bars.
  - `muntinRows` controls horizontal divisions (panes in Y), and implies `muntinRows - 1` internal horizontal bars.
- Values MUST be clamped deterministically to safe ranges (implementation-defined), including `0` and `1` producing “no internal bars”.

### 5.1 Muntin bar widths

- `muntinVerticalWidth`
- `muntinHorizontalWidth`

Link behavior:
- Linked by default (`vertical == horizontal`) with a simple toggle.

Additional size parameters (existing spec alignment):
- `muntinDepth` (meters): how far muntins extrude (or how thick they are along the normal).
- `muntinInsetFromFrameFront` (meters): how far muntins are recessed from the frame front plane (can be 0).

---

## 6. Sill Size

- `sillWidth`
- `sillHeight`
- `sillDepth`

---

## 7. Balcony Size

- `balconyWidth`
- `balconyDepth`

Balcony sizing is defined in: `specs/windows/WINDOWS_BALCONY_SPEC.md`

First-pass canonical balcony height parameters:
- `balconyPlatformThickness`
- `balconyRailingHeight`

---

## 8. Header / Lintel Size

- `lintelWidth`
- `lintelHeight`
- `lintelDepth`

### 8.1 Lintel arch behavior

When `frameArchEnabled` is true:
- `lintelArchEnabled` MUST exist.
- Default: `lintelArchEnabled = true` when the window/frame is arched.

---

## 9. Trim Size

Trim edge widths are specified per side:
- `trimLeftWidth`
- `trimRightWidth`
- `trimTopWidth`
- `trimBottomWidth`

Link behavior:
- Same two-level link behavior as Frame (axis link + all link), with all-link default enabled.

### 9.1 Trim arch behavior

- `trimArchEnabled` (bool)
- Default: `trimArchEnabled = true` when `frameArchEnabled` is true.

---

## 10. Position (Z-offsets)

Z-offset controls exist to layer elements in depth and avoid z-fighting while allowing artistic control.

- Frame:
  - `frameInset` (meters): see §1.1. (First pass uses inset rather than a raw “frameZOffset”.)
- Muntins:
  - `muntinZOffset`
  - `muntinUvAdjustments` (see §11)
- Shade:
  - `shadeZOffset`
- Glass:
  - `glassZOffset`
- Parallax interior (future-facing, but reserve now):
  - `parallaxZOffset`

### 10.1 Normative z stacking (derived positions)

Given the reference planes in §1.1, compute the layer z positions as:

- Effective anchor planes:
  - `zFrameLayer = zFrameBase` (frame geometry is authored relative to the frame block; its extrusion is `frameDepth`)
  - `zFrameAnchor = frameEnabled ? zFrameFront : zWall`

- `zMuntinLayer`:
  - if frame is enabled: `zMuntinLayer = zFrameFront - muntinInsetFromFrameFront + muntinZOffset`
  - otherwise: `zMuntinLayer = zWall + muntinZOffset`

- `zShadeLayer`:
  - if frame is enabled: `zShadeLayer = zFrameFront + shadeZOffset`
  - otherwise: `zShadeLayer = zWall + shadeZOffset`

- `zGlassLayer`:
  - if shade is enabled: `zGlassLayer = zShadeLayer + glassZOffset` (glass positioned against shade)
  - otherwise: `zGlassLayer = zFrameAnchor + glassZOffset` (glass positioned against frame; if frame disabled, against wall)
- `zParallaxLayer`:
  - `zParallaxLayer = zGlassLayer + parallaxZOffset` (parallax positioned against the glass; typically negative)

This matches the intended authoring model:
- Frame is against the wall.
- Muntins/shade are against the frame.
- Glass is against the shade (when shade is present), otherwise against the frame.

---

## 11. Position (UV Adjustments)

For first pass, UV adjustments should exist as feature-local controls where needed, with a consistent shape:

- `uv.offsetU`, `uv.offsetV`
- `uv.scaleU`, `uv.scaleV`
- `uv.rotationDeg`

(All values are numeric; scales default to `1`, offsets default to `0`, rotation defaults to `0`.)

Feature-local parameters:
- Muntins: `muntinUvAdjustments`
- Sill: `sillUvAdjustments` (see §11.1)
- Balcony: `balconyUvAdjustments`
- Lintel: `lintelUvAdjustments` (see §11.2)

### 11.1 Sill UV adjustments (per-face)

Sill UV adjustments MUST support per-face overrides.

Define a canonical face set and order (used consistently across UI + engine):
- Faces: `front`, `top`, `bottom`, `left`, `right`, `back`
- Face order (for deterministic “first face” operations): `front`, `top`, `bottom`, `left`, `right`, `back`

Parameters:
- `sillUvAdjustments.default` (a `uv` object): applied when no per-face UV is specified.
- `sillUvAdjustments.faces` (map face -> `uv` object): per-face UV overrides.

Rules:
- If a face has an entry in `sillUvAdjustments.faces`, it MUST use that UV.
- Otherwise it MUST use `sillUvAdjustments.default`.

Note: Per-face *material* overrides are specified in the Materials/Finish spec; UV adjustments are part of positioning and are valid even when materials are linked.

### 11.2 Lintel UV adjustments (per-face + curved mapping)

Lintel UV adjustments MUST support per-face overrides using the same face set/order as §11.1.

Parameters:
- `lintelUvAdjustments.default` (a `uv` object)
- `lintelUvAdjustments.faces` (map face -> `uv` object)

In addition, lintel UV mapping MUST support an optional “curved” mapping mode for arched lintels (see Materials/Finish spec for the mapping mode and defaults).

---

## 12. Double Panel (Two-layer) Windows — First Pass

Goal: support a “split window” where the overall window is divided into two panels (vertical split or horizontal split). This primarily affects muntins and framing, and should remain intentionally simple.

### 12.1 Panel layout

Define a panel layout mode:
- `panelLayoutMode`: `'single' | 'double'`
- `panelSplitAxis`: `'vertical' | 'horizontal'` (only used when mode is `double`)
- `panelSplitRatio`: number in (0,1), interpreted as the fraction allocated to the “first” panel (left or top).

### 12.2 Divider behavior (cheap but useful)

When `panelLayoutMode = 'double'`, a divider exists between the two panels.

Define divider parameters:
- `panelDividerEnabled` (bool, default true)
- `panelDividerWidth` (meters)

To support “one of the two muntins needs an extra larger frame on one side”:
- `panelDividerBiasSide` (enum):
  - For vertical split: `'left_panel' | 'right_panel'`
  - For horizontal split: `'top_panel' | 'bottom_panel'`

Interpretation:
- Divider is rendered as a simple bar region between panels.
- The “biased” side can receive an additional thickness/overlay so one side looks like it has a larger frame edge.

Constraint (per requirements):
- Muntins share the same base width controls (`muntinVerticalWidth`/`muntinHorizontalWidth`).
- Only the divider is allowed to have a distinct width (`panelDividerWidth`).

### 12.3 Per-panel muntins (top part may have muntins; bottom may not)

Each panel MUST have independent muntin enablement and settings:
- `panel1.muntinsEnabled` (bool)
- `panel2.muntinsEnabled` (bool)

And per-panel muntin layout parameters (exact model is implementation-defined, but must allow “on/off per panel”):
- `panel1.muntinLayout...`
- `panel2.muntinLayout...`

Minimum requirement:
- It must be possible for:
  - top panel: muntins enabled
  - bottom panel: muntins disabled
  (and vice versa)

Suggested minimal per-panel layout (non-normative):
- `panelX.muntins.columns` (int)
- `panelX.muntins.rows` (int)

Where setting rows/cols to 0 disables that direction of subdivision for the panel.

---

## 13. Validation Rules (Minimums)

The system MUST enforce minimum values to prevent degenerate geometry:
- `windowWidth > 0`, `windowHeight > 0`
- Frame/trim widths must be `>= 0` and must not exceed half the corresponding window dimension (or clamp deterministically).
- `panelSplitRatio` must be clamped to a safe range (e.g., `[0.1, 0.9]`).

The exact clamps/tolerances are implementation-defined but MUST be deterministic and consistent across UI + engine.
