# Building v2 — UI Specification (Building Fabrication 2)

Status: **Proposed (draft)**  
Scope: **Authoring workflow and UI composition rules** (no engine/solver implementation details)

This document defines the Building v2 authoring UI (Building Fabrication 2). It specifies panel placement, authoring flow, and **UI framework reuse rules** to avoid duplicated UI code.

---

## 1. UI responsibilities

The UI MUST:
- Author a Building v2 **model** (see `specs/buildings/BUILDING_2_SPEC_model.md`).
- Drive the v2 **engine** only through model edits (no “hidden solver logic” in the UI).
- Surface engine validation/warnings and solver debug information when available.

---

## 2. UI framework reuse (required)

To prevent duplicated UI code across tools/screens:

- Building Fabrication 2 MUST reuse shared UI builders/framework components for:
  - panels and sections,
  - forms/inputs,
  - collapsible groups,
  - list editing (add/remove/reorder),
  - validation and error presentation,
  - popup pickers (materials, windows, etc.).
- Prefer **convention over configuration**:
  - adding a new UI item SHOULD be a one-line registration,
  - implementation details belong in the shared UI framework, not per-screen copy/paste.

---

## 3. Screen entry, lifecycle, and rendering toggles

Building Fabrication 2 MUST:
- be accessible from menus and hotkeys (discoverable like other fabrication/debug screens),
- open with **no building configured** (empty state),
- temporarily disable **sun bloom** while the screen is active and restore the prior bloom value on exit (non-persistent),
- keep camera/navigation consistent with other debug tools (no unnecessary movement clamps).
- allow camera **look** with **left mouse drag** during normal navigation (outside tool-capture modes such as layout adjustment and ruler placement), without translating the camera.
- use **right mouse drag** for camera orbit around the focus target.
- use **middle mouse drag** for camera pan.

---

## 4. Layout and panels (baseline placement)

The screen keeps the map/viewport and panel areas but removes roads entirely.

### 4.1 Top-left panel (building metadata)

The top-left contains:
- Building name
- Building type
- `Load` button
- `Export` button

### 4.2 View panel placement

The “view panel” is directly **below** the top-left building panel.

The view panel contains:
- View mode buttons: `Mesh`, `Wireframe`, `Floors`, `Plan`
- View toggles (switch-style widgets):
  - `Hide face mark in view` (default off, non-persistent): when enabled and the pointer is inside the viewport, suppress rendering of the face selection mark/line (selection state still updates).
  - `Show dummy` (default off, non-persistent): shows a reference ball (same mesh as the Meshes Debug tooling) positioned just outside the building’s **A/D corner** (world-space **min X / max Z** corner).
  - `Render slab` (default off, non-persistent): renders a support slab under the current building footprint to visually close ground gaps.
    - slab footprint is a rectangle expanded by `1m` on every side relative to the current building silhouette bounds,
    - slab top aligns with the building base plane and slab thickness extends downward only,
    - slab uses `Painted plaster wall` material (`pbr.plastered_wall_02`).
  - `Exploded decorations` (default off, non-persistent): hides building/wall/window meshes and renders wall decorations as separated exploded faces using the same explode behavior as the Wall Decoration Mesh Debugger.

### 4.3 Right panel (phase-based)

- Phase 1 (baseline): the right panel is **empty** (placeholder acceptable).
- Phase 2+: the right panel hosts Building and Face authoring widgets (see §6–§7).

### 4.4 Left “Fabrication” panel (phase 2+)

When “create building” authoring is enabled, add a left-side Fabrication panel containing a `Create Building` button:
- before creation, the screen is in the empty state,
- clicking `Create Building` spawns the initial building (see §7.1).

### 4.5 Bottom-center tool panel (phase 2+)

BF2 provides a bottom-center tool panel (overlay pill) for viewport tools. Phase 2+ includes:
- `Ruler` (toggle button):
  - click 1 sets point A (raycast)
  - mouse move previews a line + distance to point B (raycast)
  - click 2 fixes point B and keeps the measurement visible until toggled off

---

## 5. Load/Export UX

### 5.1 Load

Clicking `Load` opens a thumbnail browser for available building configs:

- The engine renders each building config into an offscreen/side buffer and generates a thumbnail.
- Thumbnails are shown in a **2 rows × 3 columns** grid per page.
- Paging uses arrows on the sides.
- Selecting a thumbnail loads that building config into Building Fabrication 2.

### 5.2 Export

`Export`:
- is disabled in the empty state (no building configured),
- exports the current building config in the same usability expectations as the existing building export flow.

---

## 6. Face selection + locking UI (phase 2+)

Face selection and face linking (master/slave) are scoped to a **floor layer** (not global for the whole building).

Within a given `Floor layer` section, the UI must support:

- Face buttons (initial rectangle): `A`, `B`, `C`, `D`
- Selecting a face highlights it in the viewport; allow “unselecting” back to none
- A `link` button that opens a popup to link faces for that floor layer:
  - Linking creates master/slave relationships within the floor layer.
  - The selected face is treated as the master; the popup selects which other faces become slaves.
  - Selecting a master or slave subtly highlights related faces (distinct from the selected highlight).
  - Slaves display `locked to X`.
  - Unlinking slaves is done from the master via the same `link` UI.

---

## 7. Floor layers and faces UI (phase 2+)

When building configuration widgets are enabled, the core authoring unit is the `Floor layer` group. The UI flow MUST be:

1) define the floor layer layout (floors + height)
2) then configure faces and face linking for that same floor layer

### 7.1 Create Building defaults

`Create Building` creates a building at the map center with:
- Footprint: **1 tile equivalent square footprint** (uses the current BF2 tile size for width/depth, editable via `Adjust Layout`)
- Floors: **1 floor** initial setup (via the initial `Floor layer`)
- Floor height: **3.5m** initial setup
- Default face linking (per-floor-layer):
  - Face `A` is the master of face `C`
  - Face `B` is the master of face `D`

### 7.2 Layer groups (minimal layout)

At the building level:
- Provide a top-level actions row with `+ Floor`, `+ Roof`, and a right-aligned `Adjust Layout` toggle (visible text label `Adjust Layout`).
- Provide an editor mode row with three buttons:
  - `Building` (existing layer/face authoring flow),
  - `Decoration` (wall decoration set authoring flow),
  - `Wear` (placeholder mode with no authoring content yet).
- `Adjust Layout` behavior:
  - enables direct silhouette editing in meters (tile-independent)
  - hover a face edge: highlight the edge and show an always-on-top wall overlay, then drag along the face normal
  - hover a corner/edge handle: show a ring handle, then drag that corner freely
  - holding `Shift` during corner drag snaps motion to the tangent of the closest adjacent wall line
  - holding `Control` during corner drag prefers snapping to a 90-degree corner when close enough
  - on facade hover, the selector bar is aligned to that facade edge direction (correct per-face rotation) and rendered on the building base line
  - while mouse-dragging in adjustment mode, show adjacent-face width guides on the ground:
    - face drag: show the two adjacent face widths
    - corner/edge drag: show the two adjacent face widths
    - guides/labels are visible only while the mouse is held for movement
  - while adjustment mode is active, show a small overlay panel above the ruler tool panel with a `Close` button that exits adjustment mode
  - face/corner drag must clamp to minimum allowed facade widths (including bay constraints), with absolute minimum `1.0m`
  - during drag, rebuild updates are throttled to at most `4Hz` (every `250ms`)
- Adding creates a `Floor layer` group with:
  - move up/down (arrow buttons),
  - delete (garbage button),
  - expand/collapse.
  - (If roof layers are supported in the current phase, apply the same group affordances to `Roof layer` groups.)
 - Enforce required minimums:
   - The building must always have **at least 1 floor layer**.
   - If there is only one floor layer, its delete button is disabled.
   - (If roof layers are supported, the building must always have **at least 1 roof layer** and the last roof layer delete is disabled.)

### 7.2.1 Decoration mode workflow

When `Decoration` mode is active:
- The right panel switches from layer cards to a `Decoration Sets` editor.
- Multiple `Decoration Set` entries can be added/removed.
- Each set must define its target in this order:
  1. `Layer` (floor layer target),
  2. `Bays` (all bays, or an explicit subset of bay refs from the selected layer).
- Each set includes floor-interval controls:
  - `Every` (X floors),
  - `Start` floor,
  - `End` floor (`0`/empty interpreted as last floor),
  - quick presets: `First`, `Last`, `All`, `Every 2`.
- Each set supports multiple decoration entries.
- Each decoration entry exposes tabbed controls aligned to the wall decoration catalog/debugger model:
  - `Type`,
  - `Placement`,
  - `Configuration` (preset groups + raw properties),
  - `Material`.
- Placement controls must include along-wall range positioning (`Start U`, `End U` in `[0..1]`).

When `Building` mode is active:
- existing layer/face/bay workflow remains unchanged.

When `Wear` mode is active:
- the right panel switches to an empty placeholder state for future wear workflow expansion,
- no additional authoring controls are shown yet.

### 7.3 Floor layer controls

Inside each `Floor layer` group, the UI order MUST be:

1) `Layout` section:
   - `Number of floors` (slider + numeric input)
   - `Floor height` (slider + numeric input)
   - `Interior` (`Off` / `On` grouped toggle, in this order):
     - default is `Off`,
     - toggle state must always reflect the current floor-layer runtime/model state,
     - repeated toggles in the same session must be deterministic (no stuck/ghost active state).
2) `Faces` section:
   - `A B C D` face buttons
   - a `link` button that opens a popup to select faces to link (master/slave) for this floor layer
3) `Materials` section (per face):
   - a wall material picker (thumbnail + name, no text label)
   - clicking opens the Material Configuration side panel scoped to the selected floor-layer face
   - if the selected face is a slave (linked), material editing is suppressed and the UI indicates it inherits from its master
4) `Bays` section (per face):
   - a **bay selector** (buttons) that selects which bay is being edited:
     - the first row is reserved for bay cards (a second row is allowed if bays overflow)
     - each bay button shows:
       - a resolved material preview (thumbnail),
       - a numeric label (bay order),
       - a compact icon row under the number (width mode + repeat preference)
     - empty state: when there are no bays, a single placeholder bay card is shown:
       - not selectable, dashed border, number label is `-`
     - the action row contains:
       - `+ Bay` card (placed on its own separate row, not in the first bay row)
       - `Grouping` card (opens the grouping manager panel)
     - a reserved “connector strip” row is always present under bay cards:
       - when groups exist, thin connector brackets appear under grouped bay ranges
       - when no groups exist, the strip remains (empty) to keep layout height stable
   - Grouping manager panel (repeat groups):
     - opens from the `Grouping` card in the bay selector action row
     - shows a preview list of bays (in order) at the top, and a list of existing groups below
     - `Create group` starts a selection mode:
       - selection must be a contiguous (adjacent) bay range
       - selection must not overlap existing groups
       - clicking `Done` creates the group
     - groups can be removed
     - the panel has a global `Done` button to close it
   - a **single bay configuration panel** (stable size) that edits the currently selected bay:
     - if there are no bays yet, the panel area remains reserved and shows a simple guidance overlay (e.g., “Add a bay to start configuring”)
   - the selected bay exposes a width mode:
     - `fixed`: `widthMeters`
     - `range`: `minMeters..maxMeters` where `maxMeters = null` is interpreted as infinity (UI uses an `∞` toggle)
     - `window_fixed`: derived fixed width from opening width + opening padding (window icon mode)
     - width validation:
       - minimum acceptable width is `0.1m` (applies to fixed width and to range min/max)
       - newly created bays default to `1.0m` min/width for authoring convenience
   - the selected bay exposes a `Depth` section:
     - `Left edge depth` and `Right edge depth` (slider + numeric input, meters)
     - positive values extrude; negative values inset
     - a floating link/unlink icon sits between the two rows:
       - when linked (default), editing either edge keeps both equal (uniform depth)
       - when unlinked, left/right edges can be authored independently (wedge-like depth)
     - edge semantics:
       - `Left`/`Right` are defined relative to the face’s `u` direction (u=0 at face start corner → u=L at face end corner)
       - `Left` is the bay’s `uStart` edge; `Right` is the bay’s `uEnd` edge
   - the selected bay exposes an `Expand preference` combobox that guides the fill solver:
     - `No Repeat` (`expandPreference = 'no_repeat'`)
     - `Prefer Repeat` (`expandPreference = 'prefer_repeat'`)
     - `Prefer Expand` (`expandPreference = 'prefer_expand'`, default for new bays)
   - the selected bay can optionally override wall material:
     - wall material picker (thumbnail + name, no label)
     - clicking opens the Material Configuration side panel scoped to that bay
     - if the bay has no wall material override, the bay editor material picker shows the default opacity thumbnail background + `Inherited` label (no inherited thumbnail in the bay editor picker)
     - a “clear override” action (shown as a small icon next to the picker when an override is active)
     - the bay Material Configuration panel exposes the same top-level sections as the face material panel:
       - `Base material` (including tint sliders + roughness + normal strength),
       - `Texture tiling`.
   - the selected bay exposes a `Windows/Doors` section:
     - picker-first selection row:
       - left row label is contextual by selected opening type (`Window`, `Door`, `Garage`),
       - right control is the opening picker.
     - opening picker uses the same thumbnail rectangle layout as material pickers and shows the currently selected opening thumbnail.
     - clicking the picker opens a catalog-only selector popup with 3 tabs:
       - `Window`,
       - `Door`,
       - `Garage`.
     - picker tab options come from Window Fabrication Catalog (same source as Window Debugger).
     - picker flow is load-only in BF2:
       - no `Actions` tab,
       - no in-BF2 create/edit of window/door/garage definitions.
     - below the picker, a selected-name row:
       - shows selected catalog item name or `none` when no opening is selected,
       - includes a clear/delete icon action that resets opening selection to `none`.
     - per-bay opening controls:
       - no editable type selector,
       - no legacy `Enable window/door/garage` toggle row,
       - no legacy `Selected` label row,
       - type/context labels are dynamic (`Window`, `Door`, `Garage`) instead of generic “opening” wording,
       - width/height/offset/repeat use slider + number controls,
       - main (bottom) height mode uses grouped buttons (`Fixed`, `Full Height`) positioned with the height controls,
       - left/right padding keeps link toggle behavior (linked by default).
     - repeat controls:
       - window openings support repeat count `1..5` (side-by-side),
       - door/garage openings are forced to repeat `1`.
     - stacked top opening controls:
       - supported for window and door openings,
       - top opening type follows the selected main opening type,
       - includes `Enable` on/off button group, height mode, height override, vertical gap, and top frame-width override,
       - top frame-width override uses `[label] [on/inherit] [setting]` pattern,
       - top frame-width input is authored with two-decimal precision,
       - top opening width follows the bottom opening width,
       - garage openings do not support stacked top opening.
     - muntin toggles:
       - separate `Bottom muntins` and `Top muntins` states.
     - main-section toggle controls:
       - `Bottom muntins` uses explicit `On/Off` grouped buttons,
       - `Shades` uses explicit `On/Off` grouped buttons,
       - defaults are inherited from the selected opening definition and can then be overridden per bay.
     - validation:
       - width/height must be positive,
       - width is clamped at runtime to each repeat slot’s usable width,
       - height is clamped at runtime per floor segment bounds.
     - when opening constraints increase required bay width, UI shows the effective clamped bay minimum width.
     - numeric controls must update in real time during press-and-hold increments (no single-click-only behavior).
   - Bay linking (bay-level master/slave, full spec):
     - the bay editor header row includes a `Link` action alongside the move arrows and delete icons
       - when the selected bay is linked (slave), the `Link` button border is yellow
     - clicking opens a popup listing bays for the current face; the selected bay is treated as the **master** for that popup
     - the popup supports toggling multiple slave bays for that master in one session (one master, many slaves)
     - if linking is initiated from a bay that is currently a slave, it is first promoted (unlinked) and then treated as the master
     - linking is reference-based inheritance of the full bay config (`linkFromBayId`, no deep copy)
     - link targets are normalized to the “root master” bay (chains are flattened; no multi-hop bay links)
     - if a bay that currently has slaves becomes a slave (is linked to another bay), its existing slaves are redirected to the new root master (no `C -> B -> A` chains)
     - in the bay selector, master cards do not show “linked to bay N” style labels; slave cards render as thin preview cards with only a link icon
     - slave selector cards must not show literal `default` fallback text for material previews
     - linked groups are color-coded with 7 rotating master hues; master cards use the base hue and slaves use a lighter variant of that same hue
     - when a bay is linked (slave), the UI shows an indication like `Linked to Bay X` and suppresses the entire bay configuration controls (layout remains reserved; hidden via `visibility:hidden`-style behavior)
     - an `Unlink` action is provided for linked bays
     - a `Duplicate` button exists at the bottom of the bay editor panel (master bays only):
       - clicking creates a new bay that links to the current bay (reference-based)
       - clicking does not change the current bay selection
   - the selected bay exposes a `texture flow` option that controls wall material UV continuity across bay boundaries:
     1) `Restart on new bay` (default) — mapping restarts per bay
     2) `Continuous across repeats` — if this bay expands into repeated instances, mapping continues across those repeats
     3) `Overflow left / Overflow right` — mapping can continue across adjacent bays when both sides resolve to the same material name
        - `Overflow left` is disabled for the leftmost bay
        - `Overflow right` is disabled for the rightmost bay

These must initialize to match the created building defaults when `Create Building` is used.

---

## 8. Materials (phase 2+)

### 8.1 Base wall material (building-level default)

The building properties (right) panel MUST include a base wall material picker:
- no text label,
- a rectangular material thumbnail group,
- clicking opens the Material Configuration side panel.

This base wall material is a building-level default used for walls unless overridden by face/bay rules.

### 8.2 Material Configuration side panel

Clicking the base wall material picker MUST open a Material Configuration panel:
- placed immediately to the left of the building properties panel,
- full screen height,
- same width as the building properties panel.

### 8.3 Side-by-side panel behavior during material picking

When the Material Configuration side panel opens next to the building properties panel:
- the building properties panel MUST keep its current expanded/collapsed state (no forced collapse),
- if expanded, it remains visible while opening/using/applying material picker selections,
- if collapsed by the user via the side-handle control, it remains collapsed until manually expanded again.

The side-handle collapse/expand control remains available for manual layout control; only automatic collapse on material-picking flows is disallowed.

### 8.4 Material Configuration contents and scope

The Material Configuration panel contains exactly two top-level flat sections (non-collapsible, no boxed details containers):
1) `Base material` — base wall material selection + fundamental wall inputs:
   - shared tint picker (hue wheel + SV triangle workflow) with explicit numeric `Hue`, `Saturation`, and `Value` controls,
   - explicit tint `brightness` and `intensity` controls inside the picker,
   - brightness behavior:
     - `<= 1`: multiplicative darkening,
     - `> 1`: controlled lift toward white,
   - live tint thumbnail/hex preview,
   - wall roughness and normal strength sliders.
2) `Texture tiling` — UV scale/offset/rotation controls and “override tile meters” behavior.

Material configuration is scoped per **floor-layer face**:
- if a face is a slave (linked), it MUST NOT own duplicated material configuration; it inherits from its master face.
- tiling overrides are tracked per selected wall material so switching materials restores that material’s own tiling values.

The Material Configuration panel MAY also be opened for a **bay material override**:
- the panel scope becomes “this bay within the selected floor-layer face”
- the same two top-level sections are shown (`Base material`, `Texture tiling`)
- bay settings inherit from the face material configuration until overridden
- if the bay is linked to another bay (bay master/slave), the panel shows `Linked to Bay X` and suppresses editable controls; an `Unlink` action is provided
