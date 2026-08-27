# Building v2 — Engine Specification

Status: **Proposed (draft)**  
Scope: **Building v2 rendering/solving/validation rules** (no UI implementation details)

This document defines the **Building v2 engine**: how a Building v2 model is validated, solved, and converted into renderable geometry. It intentionally avoids UI concerns (see `specs/buildings/BUILDING_2_SPEC_ui.md`) and avoids locking down a concrete serialized schema in this file (see `specs/buildings/BUILDING_2_SPEC_model.md` and dedicated model specs).

---

## 1. Three-part split (engine vs UI vs model)

To keep the system stable and evolvable, Building v2 is defined as three distinct concerns:

1) **Engine** (this doc): deterministic rules and behaviors (solving, geometry generation, validation).
2) **UI**: authoring workflows that edit a model using reusable UI builders/framework patterns.
3) **Model**: the building specification that the UI writes and the engine consumes.

The UI MUST NOT implement solver rules implicitly; it must author explicit model intent, and the engine must be the sole source of truth for how that intent is interpreted.

---

## 2. Versioning and compatibility

### 2.1 Building v1 (legacy)

Building v1 refers to the legacy authoring/rendering system that places windows on faces using:
- face-wide “window spacing”, and
- optional “space columns” inserted between windows at a fixed interval,
and does not support bay/facade authoring.

The legacy spec is preserved for reference in `specs/buildings/BUILDING_1_SPEC_legacy.md`.

### 2.2 Building v2 (facade/bay)

Building v2 refers to the bay-based facade system with:
- per-face facade layouts,
- bays and repeatable groups,
- deterministic layout solving and validation,
- geometry generation that follows the authored facade silhouette.

### 2.3 Required compatibility behavior

- When a v1 building is loaded/imported, it MUST be converted to a v2 model and rendered via the v2 engine.
- Conversion rules are specified in `specs/buildings/BUILDING_1_TO_2_CONVERSION_SPEC.md`.

---

## 3. Core engine responsibilities

The v2 engine MUST:

- Validate floorplan topology and face identity stability (see §4).
- Resolve repeat counts and bay widths deterministically across layers (see §5).
- Convert solved facades into 3D geometry for:
  - walls,
  - belts,
  - roofs / roof rings,
  while following the bay silhouette (per-bay depth + wedge/edge depth) (see §6).
- Integrate bay content features (e.g., windows) with safe omission + warnings when constraints prevent placement (see §7).
- Surface errors/warnings/debug info clearly (no silent fallback) (see §8).

---

## 4. Floorplan topology and face identity

Building v2 defines **logical faces** from the building footprint edges.

- Faces are derived from a footprint polygon’s ordered edges and labeled `A`, `B`, `C`, … in clockwise order.
- “Angled bays / wedge bays / extrude/inset bays” may generate extra wall **surfaces** (returns, wedge sides, etc.), but MUST NOT create new logical faces or change face topology.

Authoring and continuity across layers requires topology invariants; see:
- `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

---

## 5. Facade layout solving (deterministic)

### 5.0 Floor layers, faces, and linking

- Facade solving is evaluated per **floor layer** and per **face** (face lengths come from that floor layer’s footprint).
- Face master/slave (linking/locking) relationships are defined **per floor layer** in the model/UI.
  - For a given floor layer, if a face is a **slave**, the engine MUST use the master face’s facade layout/solution for that floor layer (equivalent result).

### 5.1 Inputs

The solver takes:
- a Building v2 model,
- per-floor-layer footprints (face lengths) and layer stack rules,
- per-floor-layer per-face facade layouts (bays + groups),
and produces a per-layer resolved bay list (`uStart/uEnd/width` per bay) for geometry generation.

### 5.2 Determinism requirement

For the same inputs, the solver MUST produce the same output:
- no backtracking,
- no random tie-breaking,
- stable ordering rules.

### 5.3 Repeatable groups and local repeat ranges

Building v2 supports patterns like “every X windows, insert a column” by allowing:
- **group repetition** (repeat a multi-bay pattern), and
- **local repetition ranges** inside a group (e.g., a “window slot” that can repeat `min..max` times per group).

The facade data model is described in `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.

The canonical v0 deterministic fill algorithm (group repeat + bounded bay repeat + equal expand) is specified in:
- `specs/buildings/BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`

### 5.4 Center-out distribution

When distributing extra local repeated items (e.g., extra windows within groups), the solver MUST support **center-out** ordering across the face so resizing behaves symmetrically and deterministically.

### 5.5 Cross-layer continuity

To keep topology stable across layers:
- the resolved **bay id/order/count per face** MUST be identical across applicable layers.
- repeat counts MUST be shared across applicable layers for the face (the “most restrictive layer” determines repeat feasibility).

### 5.6 Column stacking lock (AI 493)

Faces of different lengths (a `planOffset` setback) previously re-fitted their
own repeat counts per layer, so the columns of a setback layer landed between
the columns below. The lock resolves the rhythm **once per face** and replays it:

- `facade.layout.stacking.mode` — `lock_columns` (default) or `per_layer`.
- The lock groups layers by **face id + bay layout signature** (bays + groups),
  so layers that deliberately author a different layout stay independent, and
  per-layer facades (the only shape the BF2 editor writes) are covered too.
- The reference is the **longest** face using that layout. Its solved
  **absolute bay widths** become the locked pitch (`topology.bayWidths`);
  locking repeat *counts* would be a no-op, because a count that fits a shorter
  face is exactly the count that face would have chosen for itself.
- Replaying the pitch on a shorter face drops whole repeats from the run and
  gives the slack to the bays outside the groups that carry no opening, so the
  remaining columns keep their absolute positions and the run stays centred.
- A face too short for even one pass of the locked widths MUST fall back to
  solving on its own, with a warning naming the shortfall.

The solver exposes this as `computeFacadeBaysTopology()` (reference solve) plus
the `topology` input of `solveFacadeBaysLayout()`.

---

## 6. Geometry generation requirements

Given a solved facade layout, geometry generation MUST:

- Produce wall geometry that matches:
  - bay width partitions (full face coverage),
  - per-bay depth offsets (extrude/inset), including per-edge depth offsets (left/right in `u`),
  - wedge/angled bay side faces (15° step increments),
  - padding bays at regular depth,
  - correct joins between adjacent bays with different depth (no cracks/overlaps).
- Ensure belts and roofs follow the final wall silhouette defined by bays:
  - belts extrude/inset relative to the updated wall surface,
  - roof rings/edges align to the updated outer silhouette where applicable.
- Treat corner handling as a first-class requirement (reserved corner zones / caps / ownership) to avoid cracks; see `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.
- Wall material UV continuity (AI 506): consecutive strips that resolve to the SAME wall material continue one accumulated texture run along the face — the pattern never resets at a strip boundary (whether a reset was visible used to depend on strip width vs texture period). A material change starts a fresh run. The old per-bay `textureFlow` gates (`repeats`/`overflow_*`) are subsumed by this rule; the field survives in the model for compatibility.
- Wall material variation MUST NOT displace the texture lookup by default (AI 504): the wall preset's anti-tiling (per-cell UV offset+rotation) is opt-in — it shears crisp coursing (ashlar) into diagonal dashes and exposes wall-segment seams. Wear/grime/streak layers modulate tint/roughness only.

### 6.1 Bay wall material overrides + bay-to-bay linking (full spec)

- A face’s effective wall material configuration MUST respect face master/slave rules:
  - if a face is a slave, it inherits the master face’s wall material configuration (no duplicated config is owned by slaves).
- A bay MAY override wall material and related wall material settings:
  - `wallMaterialOverride` (MaterialSpec),
  - `wallBase`:
    - tint state (`tintHueDeg`, `tintSaturation`, `tintValue`, `tintIntensity`, `tintBrightness`),
    - compatibility `tintHex` output,
    - compose behavior:
      - `tintIntensity` controls white-to-HSV tint mix,
      - `tintBrightness <= 1` darkens multiplicatively,
      - `tintBrightness > 1` lifts result toward white,
    - roughness / normal strength,
  - `tiling` (tile meters + UV transform),
  - `materialVariation` (wall material variation config).
- A bay MAY link (inherit) its **entire bay configuration** from another bay on the same face using `linkFromBayId`:
  - one master bay MAY have multiple slave bays,
  - linking is **reference-based inheritance** (no deep copy/duplication of bay config),
  - link resolution is evaluated within the master face’s bay list (face slaves do not own independent bay lists),
  - the engine MUST resolve `linkFromBayId` chains transitively before solving/rendering.
- Authoring tools SHOULD keep bay-link graphs simple/deterministic:
  - avoid multi-hop chains by linking directly to the root master when possible,
  - if a bay with slaves becomes a slave, redirect its slaves to the new root master (no chained inheritance).
- Link resolution MUST:
  - detect missing targets and cycles,
  - emit warnings for invalid links,
  - ignore invalid links rather than silently guessing.
- Bay linking affects **all bay properties**, including but not limited to:
  - sizing (width mode, `size`),
  - solver hints (`expandPreference`),
  - UV intent (`textureFlow`),
  - material overrides and related settings (`wallMaterialOverride`, `wallBase`, `tiling`, `materialVariation`),
  - bay content features (windows/openings/etc) authored on the bay.

Compatibility note (transitional):
- For older configs, the engine MAY treat legacy `materialLinkFromBayId` as an alias of `linkFromBayId`.

### 6.2 Street-floor carve + legacy interior shell (post-process)

- Building v2 MUST support a street-floor-special post-process pass after base facade wall generation.
- The street-floor carve pass MUST cut exterior facade walls at street-floor opening positions.
- Bay-driven openings (`layout.bays[].window`) MUST NOT generate an automatic interior shell mesh pass.
- The single-room interior shell pass is legacy and only applies to legacy run-window facade openings (`layer.windows.enabled` flow).
- When the legacy interior shell pass is active, it MUST:
  - derive one interior room wall plane per face from the innermost street-floor run-window opening depth on that face,
  - generate side-wall returns for run-window openings by extending opening reveal depth to the derived interior wall plane,
  - include interior wall/floor/ceiling meshes.
- Interior shell geometry MUST be inset slightly from the derived wall plane (e.g. ~`0.01m`) to avoid coplanar wall/shadow shimmer artifacts.
- Street-floor interior vertical span (legacy pass) MUST run from street-floor base elevation to `floorHeight - 0.10m`.
- Street-floor interior shell material assignments (legacy pass) are fixed:
  - interior walls: `Plastered wall 02` (`pbr.plastered_wall_02`)
  - interior floor: `Plastered wall 004` (`pbr.plastered_wall_04`)
  - interior ceiling: `Concrete layers 2` (`pbr.concrete_layers_02`)
- Bay opening reveals remain local to the opening cutout depth and do not derive/emit an interior room shell.
- Non-street-floor behavior remains unchanged unless explicitly defined by this pass.

### 6.2.1 Behind the glass (occlusion contract)

The rule is about **walls**, not about sightlines. A viewer may see *into* a building through a glazed opening, and straight *through* it when openings on opposite walls line up — that is a hole, and holes are see-through. What must never happen is seeing through **solid wall**.

- A glazed opening is **backed** when it carries a parallax interior panel (`visual.interior` resolves to anything other than `none`). A window shade does NOT back an opening: its shader discards every fragment once the blind is raised, which is exactly what `visual.disableShades` produces.
- An **unbacked** opening is one you can see into, so there has to be an inside to see. A floor layer carrying unbacked openings MUST emit the interior shell even when `interior.enabled` is false, and the engine MUST warn, naming the layer and the faces. Without a shell the floor is a hollow box and the view runs straight out the far side.
- Interior shell surfaces MUST be opaque from **both** sides. The shell is wound to face the room, so a single-sided material makes it vanish when seen from the other side: a sightline entering an opening then leaves the building through what should be solid wall, and the room reads as empty space. This is the defect the shell most often had.
- The interior shell MUST be cut at **every** opening, backed or not. A window is a hole: from inside the room it shows the outside, and from the street it shows the room. Leaving unbacked openings uncut to block sightlines is not a substitute for an opaque shell — it makes windows read as blank panes.
- A shell cut SHOULD stop a little short of the structural opening (~`0.08m` per side), which is what a reveal is. It also keeps the shell opaque where a window mesh does not quite fill its wall cutout, a gap grazing sightlines would otherwise slip through.
- That shrink only applies while the opening's frame plane sits clearly in FRONT of the shell, where the ring reads as the room's window return behind the glass. A frame inset to or past the shell plane (a deep-set sash, a recessed portal, a storefront glazed to interior depth) MUST get a shell cut that clears the whole wall cut instead (grown slightly past it), or the ring floats in front of the recessed frame as a pale surround (AI 507). The visible reveal for such openings is the facade wall's own reveal geometry (`revealDepth` = frame inset, wall material), which runs from the wall front to the frame plane and hides the grown hole's edge.
- Openings that are deliberately obscured (frosted bathroom sashes) MAY stay unbacked: the room behind their glass reads correctly.

### 6.2.2 Rooftop props (AI 492)

- A roof layer's `props` block MUST be solved into placements by the shared
  three-free solver (`src/app/buildings/RooftopPropsModel.js`), so the engine,
  the BF2 GUI and unit tests agree on one layout; placement rules are in
  `BUILDING_2_SPEC_model` §6.
- Prop geometry is procedural, not an imported asset: parts are boxes and
  low-segment cylinders, and the whole prop set uses a shared four-role material
  palette (`tank`, `frame`, `bulkhead`, `mech`).
- All parts of a role MUST be merged into one mesh per roof, so a fully dressed
  roof costs at most four draw calls and stays inside a low triangle budget
  (~2k triangles for a fully dressed large roof).
- Prop meshes join the building's solid meshes (tagged
  `userData.buildingFab2Role = 'rooftop_prop'`), so they merge through
  `BuildingGeometryMerger` and cast/receive sun shadows like the rest of the
  building.

### 6.2.3 Plan edge bevels (AI 499)

Every vertical arris is razor-sharp by default. `edgeBevel` cuts them at 45°.
It is ONE feature with two scopes, and it is a **silhouette mutation** — quite
unlike the overlay `cornerTreatment` (AI 486), which the two never share a
corner with.

- `scope: 'main_corners'` — the four plan corners are cut on the wall-outer
  loop **before facade solving**, so the adjacent faces shorten to the fold
  lines and lay their bays out on the shortened length. `widthMeters` is the
  width of the FACET; the cut-back along each face is `w / (2·sin(θ/2))`
  (`w / √2` at a square corner).
- `scope: 'all_convex_edges'` (AI 501) — additionally cuts every remaining
  convex arris of the RESOLVED silhouette (bay-relief steps, pier edges) in a
  vertex pass after layout; `includeConcave` opts the re-entrant arrises in.
  Corner facets and face joins are already resolved by then, so the pass only
  touches vertices interior to one face.

Rules:
- `computeQuadFacadeFramesFromLoop` MUST accept the beveled plan: the four
  axis-aligned runs are still A–D (a bevel shortens a face, it does not move
  its plane) and each diagonal run is a **corner facet** belonging to no face.
  Facets are reported as `frames.cornerFacets[cornerId]` with origin,
  direction, outward normal and width.
- A beveled corner has no shared mitre point: each face ends on its own fold
  line, and its join `u` comes from the frame length rather than from the
  virtual sharp corner the two face planes still intersect at.
- Loops DERIVED at other depths (the interior shell, the roof core surface)
  MUST follow the facet at a beveled corner — two fold points offset along
  their own face normals — never a mitre: a mitre join pokes through the
  chamfer, and anchoring it on the fold point tilts the face run off its face
  line, which is what silently rejected the shell's projected opening cutouts
  (AI 501).
- A cut may never eat more than `EDGE_BEVEL_MAX_EDGE_FRACTION` of either edge
  it sits between, and never reaches closer to an opening than its glass span
  plus `EDGE_BEVEL_OPENING_REVEAL_ALLOWANCE_METERS` — the hole a window carves
  is wider than its glass. The cut is clamped, or refused with a warning when
  what is left is below `EDGE_BEVEL_MIN_FACET_METERS`.
- A chamfer is a masonry detail: the default facet is
  `EDGE_BEVEL_DEFAULT_WIDTH_METERS` (6cm), and a facet wide enough to read as a
  fifth facade has to be asked for explicitly.
- Facets are geometry only: no bays, window definitions or decorations are
  placed on them, and they take the wall material (a facet spans two faces, so
  no per-bay override can claim it).
- A corner cutout authored on a beveled corner is ignored, with a warning.
- Beveled corners carry no quoins/strip: the corner treatment skips them.
- Loop-driven systems (walls, belts, cornices, roof bands, the support slab)
  need no changes — they offset the silhouette loop, and the miter offsetter
  already handles the 135° vertices a facet introduces.
- The generator reports main-corner facets as `edgeBevelCornerFacets` so the
  facade-angle model (AI 498) can later attach layout semantics to a wide
  corner facet without re-deriving the geometry. Micro edge bevels emit none.

### 6.2.4 Facade lettering (AI 508)

- Building name signage is authored per building as items on the wall
  decorations root: `wallDecorations.lettering[]` — `{ id, text, target,
  heightMeters, depthMeters?, letterSpacingRatio?, style?, material? }`. The
  root object travels opaquely through CityMap/City/export, so the list needs
  no per-field plumbing.
- `target` is `{ layerId, bayRef: "<face>:<bay>", zone?, floor?,
  yOffsetMeters? }`. `zone: 'bay'` (default) centers the sign in the floor's
  wall band; `zone: 'opening_header'` centers it in the frieze band between
  the bay opening's head (top opening included, portal step rise included) and
  the floor top. A rhythm-expanded bay resolves to the strip instance nearest
  the face middle.
- Letterforms come from a built-in stroke font (caps, digits, hyphen, period;
  extruded quad prisms, perpendicular butt ends) — no font-file pipeline.
  Unsupported characters render as spaces and warn. `style` has one mode,
  `raised_block`.
- One sign = ONE merged mesh, role `buildingFab2Role: 'facade_lettering'`, in
  the belts group (building merge + shadow set), standing on the bay's front
  plane (slightly embedded so the seam stays closed).
- Placement is deterministic and clamped by INK bounds (diagonal strokes
  overshoot the em box like type overshoot): the sign is centered on the
  target span, `yOffsetMeters` nudges it within its band but never out of it,
  and text that cannot fit at the authored height is scaled down uniformly
  with a warning. Unresolvable targets (missing bay/floor, header zone with
  no opening) warn and skip.
- `material` uses the capital wall-material dialect (explicit texture/color,
  `slot:<name>`, default `match_wall`), resolved in the AI 491 config
  pre-pass.

### 6.2.5 Classical ornament kit (AI 509)

- **Arched-band springing**: the `arched_band` header surround terminates BOTH
  arcs on the horizontal springing line (the classical impost cut). A radial
  end cut is a defect — on wide arches it left angled stubs ("ears") poking
  sideways past the shoulders.
- **Archivolt bands**: the `arched_band` header accepts `bands: N` (1..4) and
  `bandStepMeters`. The radial height splits into N nested rings; each ring
  steps back in depth toward the opening (outermost keeps the authored depth,
  every ring stays at least 20mm proud). Surround `depthMeters` snaps to the
  option list, which reaches 0.3m for portal-scale surrounds (0.24m archivolts
  used to silently snap down to 0.12m).
- **Molded capital profile**: `capital.profile: 'molded'` emits a four-course
  neck -> echinus -> cove -> abacus stack (mirrored for a base), keeping the
  AI 503 outward-positive projection convention. Profiles: `flat`, `stepped`,
  `molded`.
- **Continuous arcade impost**: `arcade.impost.continuous: true` also bands
  the jamb strips inside the run's opening bays (bay edge -> opening edge,
  between repeats), so the run reads as ONE band broken only by the arches.
  Opening spans come from the solved placements; the default still bands pier
  bays only.
- **Portal surround**: `portal.colonettes` ({shape `round | pilaster`,
  countPerSide 1..2, radiusMeters, widthMeters, projectionMeters, gapMeters,
  top `springing | arch_crown`, material}) emits engaged shafts flanking the
  entry — `round` = cylindrical colonettes (plinth + shaft + cap), `pilaster`
  = broad rectangular piers (the Bradbury reference) — rising from the
  threshold to the springing line or to the outermost order's crown;
  `portal.frieze` ({heightMeters, depthMeters, widthPaddingMeters,
  yOffsetMeters, material}) emits a panel band above the opening head. Roles:
  `portal_colonette`, `portal_frieze`.
- **Portal recess material**: `portal.recessMaterial` (zone material dialect,
  `slot` supported via the pre-pass) routes the recess reveal walls to a
  dedicated facade material group so a recessed entry can read as shadowed
  masonry; absent, the reveal keeps the wall run's material. All portal-part
  materials use the storefront-zone dialect and resolve slots in the AI 491
  pre-pass (windowDefinitions items).

### 6.2.6 Portal fabrication framework (AI 510, box + levels model)

- Entry portals are authored as **portal defs** in `PortalFabricationCatalog`
  (`src/app/buildings/`), referenced from a door opening as `portal.defId`;
  building-level `portalDefinitions.items` overrides/extends the catalog like
  `windowDefinitions` (plumbed through CityMap, City, config export, the BF2
  scene/thumbnail paths and the showcase scenario override keys).
- **The portal is a BOX inserted into the facade**: the facade opens to the
  box's rectangle (a plain rect cut; `revealDepth` is a token sliver hidden
  behind the box's 1cm flange) and the box's own mass forms the walls around
  the entry — face proud of the facade by `box.projectionMeters`, pier
  margins `box.sideMarginMeters` beside the outermost hole, face rising
  `box.topMarginMeters` over its crown. The box may not cut past its bay
  strip (clamped to slot + paddings; the pier margin gives way first). Role
  `portal_box`.
- **Nested inset LEVELS** (`levels[]`, outermost first, ≤4) telescope inward:
  each cuts a smaller hole into the previous face (`frameWidthMeters` of
  visible face ring) and steps `depthMeters` deeper, until the innermost
  hole IS the door cut — the door def mounts at the last face plane (its
  frame inset gains Σdepth − projection). Each level ring is ONE extrusion
  whose inner side wall is the return down to the next face. `arch: false`
  keeps that level's hole rectangular over an arched door; arched holes are
  EXACTLY concentric with the door's cut circle (R = w²/8r + r/2 — a true
  semicircular arch is `heightRatio: 0.5`, center on the springing line).
  The cutout's `shellRevealDepth` carries the true door plane so the AI 507
  shell rule still clears the frame. Role `portal_level`.
- **Ring mouldings** (`levels[i].ring`): a contour moulding on the face
  OUTSIDE that level's hole — semicircular rings over an arch, a
  rectangular frame otherwise — with `widthMeters`, `projectionMeters`,
  `profile` (`band | roll | cavetto` prismatic sub-bands) and `jambs`
  (`run | stop`); a `stop` ring is cut on the springing line and lands on
  impost sections. Role `portal_order`.
- **Imposts and base borrow the facade decorator sections** (the cornice
  profile kit): profiles `wedge` (projecting cap whose underside slopes
  back into the wall — the impost console), `skirt` (tall plinth face with
  a sloped top return — the foot), plus `flat | stepped | molded`. Both
  carry `walls: 'outer' | 'inner' | 'both'` — outer runs on the box face
  (imposts under stop-ring springings, base along the pier feet), inner
  runs on the reveal walls INSIDE the void (the impost band at the
  springing, the base at the threshold); 'both' circulates the entire
  structure. Roles `portal_impost`, `portal_base`.
- **Blind panel insets** (`panels[]`, ≤6, mirrored ±`xMeters`): rectangular
  holes punched through the box face with a recessed field plate behind
  (`depthMeters`) — the pier panels of the reference. Panels outside the
  box face are skipped. Role `portal_panel`.
- **Custom mesh parts**: `custom[]` entries reference registered ornament
  parts (`PortalOrnamentParts.js` — GLB assets under `assets/ornaments/`,
  loaded like the bus models; `foliate_capital` ships as the first part)
  with `anchor` (`springing | crown | jamb_base | capital | face`),
  `mount` (`relief` = a 3D decal ON the wall, ~40% of its depth projecting
  from the mount plane — the default for `face`; `proud` = free-standing),
  `scaleMeters` (target height) and offsets; role `portal_ornament`. The
  `face` anchor places the part anywhere on the box face (offset x from the
  portal center, mirrored; y above the threshold). The `capital` anchor
  crowns each colonette/pilaster cluster (shafts shorten to leave room;
  needs colonettes, else warns and falls back to springing). The building
  generator is synchronous, so parts MUST be preloaded
  (`preloadPortalOrnamentParts()`) before a deterministic scene builds —
  the PBR-calibration cold-start contract; City kicks the preload
  fire-and-forget, the showcase scenario awaits it. An un-preloaded part
  warns and skips.
- **Palette**: `palette` names part materials (box/level/ring/impost/panel/
  base/colonettes/frieze/recess/steps/custom) in the zone dialect with
  `slot` support (resolved in the AI 491 pre-pass). Unset part materials
  fall back to the palette — which itself defaults to a trim-like set,
  NEVER silently to the wall texture; `match_wall` is an explicit choice.
- **Migration**: the inline AI 488/509 `portal` config keeps working
  (steps/recess/colonettes/frieze/recessMaterial); with a def, inline parts
  the author explicitly wrote override the def's (def-path recess comes
  from the level depths), and colonette/frieze offsets account for the
  levels' added frame width. All portal roles are in the merge/shadow set.

### 6.3 BF2 support slab (view helper)

- Building Fabrication 2 MAY render an optional support slab helper under the building for viewport-only gap masking.
- This helper is controlled by a non-persistent view toggle (`Render slab`) and MUST NOT modify the authored model or exported config.
- When enabled:
  - slab bounds are rectangular in world XZ and expanded by `1m` per side beyond the current building silhouette bounds,
  - slab top Y aligns with the solved building base/floor plane,
  - slab thickness extends downward only from that top plane,
  - slab material uses `Painted plaster wall` (`pbr.plastered_wall_02`).
- Toggling on/off and rebuilding within the same session MUST not leak helper meshes or leave stale geometry.

### 6.4 BF2 exploded decorations mode (view helper)

- Building Fabrication 2 MAY expose a non-persistent `Exploded decorations` view toggle.
- When enabled:
  - building render groups (including window meshes) are hidden from view,
  - wall decorations are rendered as exploded triangle-face meshes,
  - the exploded-face separation behavior MUST reuse the same shared explode logic used by Wall Decoration Mesh Debugger (not a duplicate implementation).
- When disabled:
  - exploded helper meshes are removed,
  - normal BF2 mesh visibility state is restored according to the active view mode.
- Toggling on/off and rebuilding within the same session MUST not leak exploded helper meshes or leave stale visibility state.

---

## 7. Bay content features (windows, columns, etc.)

Building v2 moves from face-wide window spacing to **bay-driven content**:

- Windows/doors/openings are authored as bay content (segments/features) rather than “fill a face with evenly spaced windows”.
- If an opening cannot fit within a bay (after margins/clearances), it MUST be **omitted** and surfaced as a warning (never overlap).
- Opening definitions come from Window Fabrication Catalog and MAY be overridden by building-owned definitions with matching ids.
- Bay window authoring is per-bay and includes:
  - `window.assetType` (`window` / `door` / `garage`),
  - `window.size.widthMeters`,
  - `window.size.heightMeters`,
  - `window.heightMode` (`fixed` / `full`),
  - `window.verticalOffsetMeters` (offset from floor bottom),
  - `window.repeat.count` (window-only side-by-side repeat),
  - `window.padding.leftMeters` / `window.padding.rightMeters` (linked by default).
  - `window.muntins.bottomEnabled` / `window.muntins.topEnabled`,
  - optional stacked top opening (`window.top.*`) with top frame-width override.
- The effective bay minimum width MUST be clamped by bay-window requirements:
  - `effectiveBayMin = max(bayMin, windowWidth * repeatCount + leftPadding + rightPadding)`.
- Runtime placement clamps:
  - width clamps to resolved usable repeat slot width (`(baySpan - leftPadding - rightPadding) / repeatCount`),
  - height clamps to floor segment bounds for the target layer,
  - bottom/main `heightMode = full` uses the maximum available segment height from opening bottom offset while reserving enabled top-opening gap/height constraints,
  - `heightMode = full` behavior applies to the main/bottom opening only (not the top opening control),
  - stacked top opening width follows bottom opening width.
- Top opening behavior:
  - enabled for window and door assets,
  - top opening asset type is fixed to `window`,
  - disabled for garage assets.
- Repeat behavior:
  - `window` asset allows repeat `1..5`,
  - `door` and `garage` force repeat `1`.
- Wall-cut consistency:
  - facade wall cutouts MUST be generated from the same resolved per-floor opening placements used for rendered window/door meshes,
  - each repeated opening slot and each enabled stacked top opening MUST contribute its own wall cutout.
- Backward compatibility:
  - legacy `window.width.minMeters` / `window.width.maxMeters` MAY still be read for older configs,
  - when both legacy width range and `window.size.widthMeters` exist, `window.size.widthMeters` takes precedence.
- Face slaves do not own independent bay/window copies; they inherit the master face facade/bay/window config.
- Bay slaves (`linkFromBayId`) inherit the master bay window configuration by reference (no deep copy).

### 7.1 Arcade grouping (AI 493)

An arcade is a **mode of a bay group**, not a separate feature: `group.arcade`.
Because `archRise = arch.heightRatio * width`, arched openings of different
widths spring from different heights; the arcade makes the run share one line.

- `arcade.springing.mode` — `auto` (default) or `fixed` + `offsetMeters`.
- The auto line is the **highest natural springing** in the run, so every other
  arch flattens toward segmental and none is stilted past its own semicircle
  into a horseshoe.
- Each member's `arch.heightRatio` is re-derived from the shared line. An
  opening whose head sits at or below the line, or that would flatten below
  `ARCADE_MIN_RISE_RATIO`, keeps its own rise and MUST be warned about.
- The line is resolved **per floor** (segment height decides where the opening
  head lands) and MUST be the same answer for the rendered window mesh and for
  the facade wall cutout.
- `arcade.impost` (on by default, `enabled: false` to remove) bands the run's
  pier bays — the bays of the group that carry no opening — with their top edge
  on the springing line, so the piers read as arcade columns. Role:
  `bay_arcade_impost`; material uses the capital wall-material dialect
  (slot refs resolved by the material-slots pre-pass).
- Band projection convention (AI 503): facade-frame depth is outward-positive,
  so an impost's `projectionMeters` — and a bay capital's `projection` — stands
  the band proud of the bay's own plane, with a fixed 4cm embed back into the
  wall. `planeDepth - projection` is the buried-band bug, not the convention.

The detailed content model is described in `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`.

---

## 8. Validation and debugging

The engine MUST validate and surface issues explicitly:

- Hard errors:
  - invalid footprint/topology for applicable layers,
  - invalid sizing constraints (non-positive widths, min/preferred/max ordering),
  - no feasible solution under constraints and overflow policy.
- Warnings:
  - openings omitted due to insufficient bay width,
  - repeat counts reduced/adjusted (if allowed by policy),
  - suspiciously small/large resolved widths.

The engine SHOULD expose debug information suitable for UI display:
- resolved group repeat count,
- per-group local repeat counts,
- which groups received “extra” local repeats under center-out distribution,
- final per-bay resolved widths.

---

## 9. Spec modularization requirement (important)

To avoid a single monolithic spec and to keep concepts isolated, **each major engine concept MUST live in its own spec file** under `specs/buildings/`.

This engine spec is the entrypoint/index; detailed specs SHOULD be split, for example:
- `BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`
- `BUILDING_2_FACADE_LAYOUT_SPEC.md`
- `BUILDING_1_TO_2_CONVERSION_SPEC.md`
- (future) `BUILDING_2_GEOMETRY_GENERATION_SPEC.md`
- (future) `BUILDING_2_WINDOWS_AND_OPENINGS_SPEC.md`
- `BUILDING_2_FACADE_FILL_SOLVER_SPEC.md`
