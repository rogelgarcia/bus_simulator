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
- Footprint: **2×1 tiles**
- Floors: **4 floors** initial setup (via the initial `Floor layer`)
- Default face linking (per-floor-layer):
  - Face `A` is the master of face `C`
  - Face `B` is the master of face `D`

### 7.2 Layer groups (minimal layout)

At the building level:
- Provide a top-level `+ Floor` button to add floor layers.
- Adding creates a `Floor layer` group with:
  - move up/down (arrow buttons),
  - delete (garbage button),
  - expand/collapse.
  - (If roof layers are supported in the current phase, apply the same group affordances to `Roof layer` groups.)
 - Enforce required minimums:
   - The building must always have **at least 1 floor layer**.
   - If there is only one floor layer, its delete button is disabled.
   - (If roof layers are supported, the building must always have **at least 1 roof layer** and the last roof layer delete is disabled.)

### 7.3 Floor layer controls

Inside each `Floor layer` group, the UI order MUST be:

1) `Layout` section:
   - `Number of floors` (slider + numeric input)
   - `Floor height` (slider + numeric input)
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
       - `Base material` (including albedo tint / roughness / normal strength),
       - `Texture tiling`,
       - `Material variation`.
   - the selected bay exposes a `Window` section:
     - `Enable window` toggle (off = no bay window preview/placement for that bay)
     - window picker uses the same thumbnail rectangle layout as material pickers:
       - no row label text,
       - shows the currently selected building-owned window definition thumbnail.
     - clicking the picker opens a selector popup with:
       - existing building-owned window definitions,
       - `Create New`,
       - `Edit` for the currently selected definition.
     - `Create New` and `Edit` open the shared Window Fabrication popup (reused Window Debugger authoring UI):
       - wider controls area,
       - smaller viewport,
       - contextual 2×2 wall preview sample.
     - per-bay window controls:
       - width range (`min` + `max`, where `max = null` uses infinity / available bay width),
       - left/right padding with a link toggle (linked by default).
     - when window constraints increase the required bay width, the UI must show the effective clamped bay minimum width clearly.
   - Bay linking (bay-level master/slave, full spec):
     - the bay editor header row includes a `Link` action alongside the move arrows and delete icons
       - when the selected bay is linked (slave), the `Link` button border is yellow
     - clicking opens a popup listing the bays for the current face (each shows a bay number + a material preview)
     - selecting a bay links the current bay’s entire bay configuration to the selected bay by **reference** (no deep copy)
     - link targets are normalized to the “root master” bay (chains are flattened; no multi-hop bay links)
     - if a bay that currently has slaves becomes a slave (is linked to another bay), its existing slaves are redirected to the new root master (no `C -> B -> A` chains)
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

### 8.3 Side-by-side panel collapse behavior (required)

When a side panel is open next to the building properties panel:
- the building properties panel collapses into a thin expandable column,
- the thin column shows a left arrow expand button at the top,
- clicking the expand button shows the building properties panel again while keeping the thin column affordance available.

This collapse/expand behavior is a general rule for any panel that opens alongside the building properties panel.

### 8.4 Material Configuration contents and scope

The Material Configuration panel contains exactly three top-level collapsible sections:
1) `Base material` — base wall material selection + fundamental PBR inputs (albedo tint, roughness, normal strength).
2) `Texture tiling` — UV scale/offset/rotation controls and “override tile meters” behavior.
3) `Material variation` — wall material variation controls (same properties/intent as legacy Building Fabrication).

Material configuration is scoped per **floor-layer face**:
- if a face is a slave (linked), it MUST NOT own duplicated material configuration; it inherits from its master face.

The Material Configuration panel MAY also be opened for a **bay material override**:
- the panel scope becomes “this bay within the selected floor-layer face”
- the same three top-level sections are shown (`Base material`, `Texture tiling`, `Material variation`)
- bay settings inherit from the face material configuration until overridden
- if the bay is linked to another bay (bay master/slave), the panel shows `Linked to Bay X` and suppresses editable controls; an `Unlink` action is provided
