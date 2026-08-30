# DONE

DESIGN AGREED (discussed with the user 2026-08-26) — this document is the
N-face CORE. The edit tools, organizer fitting and curved facades are split
into their own follow-ups: AI_buildings_512 (face extension edits),
AI_buildings_513 (city-organizer snap-to-space), AI_buildings_514 (curved
facades). This file was numbered 498 during the design discussion and is now
510 so the prompt numbers match the execution order (507 -> 514); 511-514
build on it.

#Problem

The facade layout system is quad-locked: `computeQuadFacadeFramesFromLoop`
requires the footprint to resolve to exactly 4 axis-aligned runs (faces A–D),
and every subsystem is keyed on that enum — facade specs, face linking,
`faceMaterials`, decoration-set targets, corner resolution, and the
BuildingFabrication2 face picker. Anything that is not a plain rectangle
cannot carry bays, window definitions, or decorations: chamfered corner bays
(refs 1/5), angled street frontages, multi-wing L/V/W buildings, hexagonal or
free-form polygon plans are all out of reach. The edge bevel (AI 499)
deliberately stops at cutting the geometry and leaves the facets layout-less.

Reference images: `downloads/buildings_references/` — 1 (chamfered corner
storefront), 5 (full-height chamfered corner bay). User sketches (2026-08-26
discussion): octagon plan, free-form sawtooth plan with acute corners,
rounded-corner plan (the rounded case is AI 516).

# Agreed design

A building has **N named faces** derived from the footprint polygon's runs —
NOT restricted to L/V/W: hexagons, octagons, and arbitrary (convex or
concave) polygons are in scope. Every face is a first-class facade with the
full feature set: bay layouts and fill patterns, window definitions, per-face
materials, face linking, decoration sets, and silhouette depth offsets.

Decisions from the discussion:

- **Face identity**: explicit face ids stored on the footprint runs (not
  positional letters). Rect footprints keep resolving to the same A–D so all
  existing content is untouched; new faces get generated ids (E, F, …) that
  survive footprint edits which do not change the run count.
- **Solving**: the bay/pattern solver runs per face on the face's run length,
  angle-agnostic — repetition, expansion and grouping rules (AI 493) apply
  unchanged on every face. Window placement is already run-based.
- **Corners**: corner resolution generalizes from orthogonal meetings to
  arbitrary angle pairs (the mitre already intersects offset lines —
  `cornerJoinPointWithDepths`). Acute corners need a mitre limit: past a
  spike threshold, fall back to a small bevel facet instead of an unbounded
  mitre point. `cornerTreatment` (quoins) and edge bevels must accept
  non-90° arrises or explicitly skip them with a warning.
- **Loop-driven subsystems** (interior shell, belts, cornices, roof rings,
  parapet, coping) follow the N-gon loop; they are mostly loop-driven today
  and must not assume 4 corners anywhere.
- **Bevel facets unify**: a wide corner bevel facet is promotable to a real
  face (this absorbs the old bevel-facet-window idea). Raise
  `EDGE_BEVEL_WIDTH_MAX_METERS` (1.5) to ~4m for MAIN plan corners so a
  chamfer wide enough to be a face can be authored; the arris-chamfer
  default stays tiny.
- **GUI**: BuildingFabrication2 needs a plan-view face picker (the four
  letter buttons do not scale to N faces); per-face editors stay as they are.
- **UV continuity** (AI 506 rule) applies along each face run; returns and
  mitres at arbitrary angles keep the AI 502 arris-anchoring behavior.

Out of scope here (own AIs): the face extension edits and their
perpendicular-ray validity rule (AI 514), organizer lot-fitting (AI 515),
curved/arc faces where decorations must sweep the curve (AI 516).

# Request

Implement the N-face model:

1. Footprint runs → N face frames with stable ids; rect compatibility
   mapping to A–D; face count/order changes remap by stored run ids.
2. Generalize the silhouette/bay solver, facade wall builder, window
   placement, face linking, `faceMaterials`, decoration targets and
   attachments to face-id keyed (no A–D enum assumptions).
3. Arbitrary-angle corner resolution with an acute-mitre limit fallback.
4. BF2 plan-view face picker; face configs editable for any face id.
5. First showcase: one L-shaped and one hexagonal catalog/showcase config
   exercising bays, repeat groups, windows, belts, cornice and a decoration
   set on non-A–D faces.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays +
  window definitions). Do not extend engine 1; it is deprecated and frozen.
- Core guards: rect footprints resolve to identical A–D layouts as before
  (regression); an L and a hexagon solve every face with bays/windows; acute
  corner produces the bevel fallback, not a spike.
- Finish with screenshots of the L and hexagon showcases plus close-ups of an
  angled corner join.

# Outcome (2026-08-27)

- `computeFacadeFramesFromLoop` (exported): quad path first (rects incl. AI
  499 bevel facets resolve to IDENTICAL A–D frames — regression-guarded),
  else one first-class face per exterior run — ids A, B, C, … assigned in
  loop order from the most street-facing run, `frames.order` carries the
  loop-chain; runs < 0.6m become corner facets; a quad connector > 1.55m
  refuses the quad mapping so wide chamfers promote to real faces.
- Face ids are now any letter A–Z everywhere: `isFaceId` relaxed in the
  generator, BuildingFabricationTypes (faceLinking/faceMaterials — a FOURTH
  silent whitelist), BuildingMaterialSlots, FacadeAttachmentsModel, BF2
  View/UI. Config walks iterate the spec's own face keys; frames-driven
  loops iterate `frames.order` (silhouette, wall builder, street-floor maps,
  interior shell pairs and loop detail, cap/zero join maps, balcony strips,
  face materials, roof facade blocks — no `['A','B','C','D']` literals left
  outside the quad resolver).
- Arbitrary-angle corners mitre via the existing offset-line intersection;
  an acute corner past `max(1.5m, 3×depth)` falls back to a bevel pair
  (fold-line points bridged by a chamfer) in `cornerJoinPairWithDepths` and
  the silhouette (synthetic facet corner), so no offset loop ever spikes.
  Caps/zero-depth loops now follow facets too (previously they mitred
  through the virtual sharp corner).
- BF2: plan-view face picker (footprint polygon with clickable labelled
  edges + hover) above the face buttons, both fed from the resolved face
  plan the View computes per config; per-face editors/link popup/decoration
  bay selector/attachment targets all iterate the dynamic face list.
- Edge bevel width max raised 1.5→4m so a face-worthy chamfer is authorable.
- Showcases in the catalog: `l_warehouse` (6 faces, courtyard faces D/E
  with painted-brick face override + fire escape on E, C linked to B) and
  `hex_pavilion` (regular hexagon, 6×14m faces, 120° mitres, D linked to A).
- Core guards: rect A–D identity, L/hex face derivation + every-face
  bays/windows in full builds, acute bevel-pair fallback, hex silhouette
  spike-free. Captures: `ai512_nface_capture.pwtest.js` → l_front /
  l_courtyard / l_notch_corner / hex_front / hex_corner.
- Deferred (own AIs): face extension edits (513-series renumbering:
  AI 514), organizer lot fitting (AI 515), curved faces (AI 516); persisted
  per-run face ids in footprint data (ids are deterministic geometric for
  now); N-face vertex-gizmo footprint editing in BF2.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
