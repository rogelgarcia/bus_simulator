# DONE — AI 520 per-floor silhouette Draw authoring

## Problem

Building Fabrication 2 can select faces from a small plan diagram and can adjust
one building-wide `footprintLoops` shape in the viewport, but it has no proper
silhouette-authoring workflow. Authors cannot draw or reposition logical faces,
create/remove face boundaries, author an arc directly, or give different floor
layers different face configurations. The compact face diagram also treats a
run as an endpoint-to-endpoint line, so it does not communicate authored
curvature.

The current model contracts conflict with the desired workflow: the config owns
one default footprint in meters, layers only apply relative `planOffset`, and the
topology specification rejects layers whose corner/face topology differs. At the
same time, final world size is often chosen by facade bay constraints and city
placement rather than by a fixed drawing size. A silhouette editor therefore
must distinguish shape/proportion authoring from default design-space dimensions
and from AI 514/515 runtime stretch fitting. It must not introduce uniform
scaling that changes authored window or bay widths.

# Request

Add a complete per-floor-layer `Draw` silhouette workflow to Building
Fabrication 2 and evolve the Building v2 model/specifications so the authored
shape, facade identity, and runtime sizing rules remain deterministic and
extensible.

Tasks:

- Add a visible `Draw` action alongside the `Faces` section of every floor-layer
  card. It opens a dedicated plan-authoring popup for that layer's working
  silhouette; `Apply` commits one atomic model edit and `Cancel` leaves the
  building byte-for-byte unchanged.
- In the popup, support creating, selecting, moving, inserting, and deleting
  corners and logical face runs; translating the whole silhouette; editing face
  position and relative span/proportion; splitting/merging collinear logical
  faces; and authoring either straight or circular-arc runs. Curvature must be
  editable visually and numerically with clear straight/curved state, direction,
  radius/sweep (or equivalent), and tangent feedback.
- Render curves as curves everywhere they are authored or selected: the popup,
  hit testing/highlighting, the compact `Faces` plan diagram, and plan preview.
  Arc tessellation is a display detail only; one authored arc remains one logical
  face with one face id.
- Define and implement per-floor-layer silhouette ownership. A layer can inherit
  the building default/previous layer shape or detach into an independently
  authored shape. Different layer groups may have different face counts and
  configurations. The UI must make inheritance, detachment, and the scope of an
  edit explicit, and transitions between differing layers must remain watertight
  for walls, caps/terraces, roofs, interiors, cornices, and decorations.
- Preserve stable corner and run/face identities through non-topology edits.
  When topology changes, deterministically retain unaffected ids, allocate new
  ids without recycling deleted identities during the edit session, and present
  a remap review for affected facade layouts, face links, materials,
  decorations, attachments, and stretch preferences. Never silently retarget or
  discard authored face data; unresolved/orphaned targets must be surfaced for
  an explicit choice. Respect the existing `runForward`, `split`, and arc
  metadata contracts.
- Replace the current cross-layer same-corner-count invariant with a documented
  compatibility/remapping contract. Column stacking, face links, and shared
  facade designs may continue across layers only when their stable face
  identity/orientation and solver constraints are compatible; otherwise the UI
  must require an explicit new/remapped face design rather than guessing from
  positional letters.
- Separate shape intent from actual size. The drawing workflow edits topology
  and proportions in a stable design frame; it must not require the author to
  choose the final lot dimensions. Define how an optional/default design-space
  width/depth (or an equivalent preferred-size representation) produces the
  deterministic catalog/BF2 preview and backwards-compatible meter
  `footprintLoops`, while fixed/minimum bay widths remain physical meters.
  Editing a default size must re-solve through allowed stretch bands rather than
  uniformly scale/shear windows, bays, or facade details.
- Coordinate per-layer silhouettes with the AI 514/515 extensibility rules.
  The placement envelope and its valid named stretch bands determine runtime lot
  fitting; compatible layer silhouettes inherit the same band deltas through
  stable run/band provenance instead of each layer independently filling the
  parcel. Pinned/incompatible bands and curved runs remain fixed unless a valid
  curve-preserving stretch rule is explicitly supported. An unreachable fit
  keeps the nearest valid deterministic result and reports why.
- Provide live authoring validation for clockwise/simple loops,
  self-intersections, duplicate/collapsed points, minimum face and bay-solver
  lengths, invalid arcs/tangencies, the A-Z logical-face limit, incompatible
  layer transitions, broken links/targets, and invalid stretch-band mappings.
  Hard errors disable `Apply`; warnings remain visible and identify the exact
  layer/face with an actionable explanation.
- Provide a useful preview inside the popup: labelled face ids and arc lengths,
  selected/hovered face feedback, neighboring layers as optional ghost outlines,
  current bay rhythm/solver minima, stretchable versus pinned bands, and both a
  default-design preview and a simulated lot-fit preview. The normal BF2 3D
  viewport must update from the working copy without prematurely mutating the
  saved model.
- Add popup-local undo/redo (buttons plus standard keyboard shortcuts). History
  must cover geometry, curvature, topology, identities/remaps, stretch metadata,
  and face-target decisions as coherent operations. Applying the popup is one
  reversible BF2 edit; cancel/reopen and undo/redo must preserve ids and metadata
  deterministically.
- Persist the complete contract through normalization, cloning, import/export,
  catalog thumbnails, BF2 reload, city config round-tripping, plan transforms,
  and runtime placement without dropping per-layer silhouettes, arc/split/run
  metadata, design-frame data, or stretch provenance. Existing configs with only
  building-level `footprintLoops` must load and render unchanged through an
  explicit backwards-compatible inheritance path.
- Update the Building v2 model, topology, engine, UI, facade-layout, and city
  placement specifications before or alongside implementation so default design
  size, per-layer topology, remapping, layer transitions, and runtime lot fitting
  each have one unambiguous owner.
- Add focused unit tests for design-space/default-size compilation, per-layer
  inheritance/detachment, stable ids and topology remapping, arc editing,
  validation, undo/redo, round-trip persistence, and propagation of one lot-fit
  stretch solution across compatible layers. Add a BF2 browser workflow test and
  deterministic captures showing two layer groups with different silhouettes,
  including a curved face visible as curved in both the editor and compact face
  diagram.

## On completion

- Mark the AI document as DONE in the first line.
- Rename in `prompts/` to:
  - `prompts/AI_DONE_520_BUILDINGS_per_floor_silhouette_draw_authoring_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_520_BUILDINGS_per_floor_silhouette_draw_authoring_DONE.md` on the `buildings` branch
- Do not move to `prompts/archive/` automatically.
- Move to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completed changes

- Added a versioned per-floor silhouette model with default/previous inheritance, independent detachment, stable A–Z run identities, and non-recycled corner identities.
- Added the BF2 `Draw` popup with corner/run creation, movement, translation, split/merge/delete, numeric span/position editing, circular arcs, tangents, and local undo/redo.
- Made popup preview, Apply, Cancel, and BF2 undo/redo transactional so Cancel preserves the saved config byte-for-byte and Apply is one reversible edit.
- Added explicit topology target review and materialization for facade layouts, links, materials, decorations, attachments, and stretch data, including recoverable orphan/remove/conflict ledgers.
- Rendered one authored arc as one curved logical face in the popup, compact plan, hit/highlight paths, walls, slabs, transitions, roofs, and no-facade fallback buildings.
- Added per-layer runtime plan resolution, mixed `runForward` local-u support, compatible capital continuity, and watertight transition undersides for differing adjacent shells.
- Separated preferred design size from physical facade sizing and routed preferred-size and lot-fit solves through named bands, authoritative provenance, and layer-specific facade minima.
- Added live validation for geometry, winding, arcs, solver lengths, layer compatibility, target decisions, stretch mappings, and the 26-face limit, with hard-error Apply blocking.
- Added selected-layer bay rhythm/minimum overlays, neighboring-layer ghosts, stretch/pinned indicators, default-size preview, and simulated lot-fit feedback.
- Preserved silhouette, arc, split, identity, remap, preferred-size, and provenance data through normalization, transforms, export, catalog-backed city round trips, placement, and runtime generation.
- Updated the Building v2 model, topology, engine, UI, facade-layout, fill-solver, and city-placement specifications for the new ownership and compatibility contracts.
- Added focused model/remap/persistence tests, three passing BF2 browser workflows, and deterministic editor/compact-plan screenshots for distinct lower and upper layer silhouettes.
