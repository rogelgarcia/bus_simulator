# DONE

## Summary of changes
- `src/app/buildings/RooftopPropsModel.js` (new): ONE rooftop feature with a prop set as modes (`water_tower`, `roof_bulkhead`, `mech_box`, `vent_pipe`) — three-free normalizer, prop/variant catalog with area-scaled scatter rules, seeded deterministic placement solver, and GUI preview configs.
- Placement solver: dart-throwing over the roof polygon with the parapet inner face as the region boundary, `edgeMarginMeters` + per-prop footprint radius clearance, `minSpacingMeters` between props, courtyard holes and the mass above a setback as keep-outs, and boxy props yawed onto the nearest roof edge.
- `RooftopPropGeometry.js` (new): procedural low-poly parts per prop kind (splayed leg frame + hooped wooden tank + conical cap; bulkhead with door face and flashing cap; mech box with curb, fan housings and louvres; hooded vent pipe) emitted under four shared material roles.
- Generator: roof-layer integration — solves placements per roof loop, merges parts per material role into at most four shadow-casting meshes that ride the existing `BuildingGeometryMerger` path (~2k triangles for a fully dressed large roof).
- Schema: roof layers gained a `props` block (`BuildingFabricationTypes`) that normalizes, clones and round-trips; absent when the feature is off so bare roofs are unchanged.
- Materials: one shared palette (`tank`, `frame`, `bulkhead`, `mech`) wired into the AI 491 slot pre-pass (`resolveBuildingConfigMaterials`), with the bulkhead defaulting to the wall material below it.
- BF2 GUI: roof layers gained a Rooftop props section — enable toggle, per-prop-type buttons with rendered thumbnails, density / edge margin / min spacing / seed offset (replacing the "more roof controls coming later" placeholder).
- Showcase: props enabled on `brick_midrise_2` (full set) and `stone_setback_tower` (setback terrace mechanicals, exercising the keep-out rule).
- Tests: node unit suite for schema round-trip, determinism, roof bounds, spacing/holes, area scaling and explicit hero placements; core-suite roof-layer schema round-trip; BF2 GUI e2e driving the section end to end; capture spec producing before/after pairs and roof close-ups.
- Specs: rooftop props documented in `BUILDING_2_SPEC_model` (§4 schema, §6 placement rules), `BUILDING_2_SPEC_engine` (§6.2.2) and `BUILDING_2_SPEC_ui` (§7.2.2).

#Problem

Fabricated roofs are empty slabs. From bus height the skyline constantly shows rooflines, and the references dress them with a small recurring set: wooden water towers on steel legs, roof access bulkheads, and mechanical/HVAC boxes. Their absence makes upper stories read as unfinished the same way bare walls did before decorations.

Reference images: `downloads/buildings_references/` — m4 (water tower silhouette), 16 (roof bulkheads and setback roof masses in the street scene), plus water towers/mechanicals as the standard NYC rooftop vocabulary implied across the tower refs.

# Request

Add a rooftop props feature to the roof layer. Design principle (applies project-wide): ONE rooftop feature with a prop-set and placement rules — not one feature per prop type.

Tasks:
- Prop set (procedural generators or `mesh_fabrication` assets, whichever fits the existing asset pipeline better):
  - `water_tower`: cylindrical wood tank, conical cap, steel leg frame; 1–2 size variants.
  - `roof_bulkhead`: simple box with a door face (roof access).
  - `mech_box`: HVAC-style boxes, 2–3 size variants.
  - `vent_pipe`: small cheap filler.
- Placement solver on the roof slab: seeded deterministic scatter with rules — keep clear of the parapet edge by a margin, minimum spacing between props, counts scaled by roof area, optional explicit placements in the config for hero buildings.
- Per-building config: enable/disable, allowed prop types, density; defaults tuned so mid/high-rise masonry buildings get a tower + bulkhead + a few boxes.
- Geometry merges into the building (`BuildingGeometryMerger`); correct sun shadows; keep triangle budgets low (these are mostly seen at distance — no high-poly detail).
- Update the `BuildingFabrication2` GUI: rooftop section with prop toggles/density and thumbnail preview.
- Showcase: enable on one or two existing tower configs; validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: placement determinism (same seed → same layout), bounds test (all props inside roof footprint minus margin), schema round-trip.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
