# DONE

#Problem

Every vertical arris on a fabricated building is razor-sharp: the four plan corners, and every convex edge the facade silhouette creates (projecting bay steps, pier edges). Sharp plan edges are a strong CG tell at street level — real masonry softens them with small chamfers, and beveled corners catch light along the cut. There is no plan-edge treatment in the fabrication schema today.

# Request

Add an edge bevel feature: cut vertical plan arrises at 45° with a configurable small width (~0.05–1.5 m), producing a smooth facet in the wall material. This is a plan/silhouette mutation, distinct from the overlay corner bands of `cornerTreatment` (AI_buildings_486).

Tasks:
- Schema: `edgeBevel` block per building — width, scope `main_corners | all_convex_edges`, per-corner overrides at the four main corners (enable/width). Concave arrises are skipped by default (optional opt-in). Facets always use the wall material; geometry only — facets get NO bays, window definitions, or decorations, and no new bay system is introduced.
- Main-corner bevels change the footprint before facade solving: integrate with the rect facade frames/silhouette pipeline (`computeQuadFacadeFramesFromLoop` currently hard-requires exactly 4 axis-aligned runs) so the diagonal corner run is treated as a corner connector — adjacent A–D faces shorten to the fold lines and bay layouts keep working on the four main faces. Keep this scoped to simple rect footprints first.
- `all_convex_edges` scope bevels the remaining convex arrises of the RESOLVED silhouette (bay-relief steps, pier edges) at silhouette assembly time, after bay layout is solved — no facade-solver changes for those edges. Constraint: bevel width must respect window/bay corner clearance so a cut at a run end never clips an opening (clamp or skip, with a warning).
- Loop-driven systems (walls, belts, cornices, simple-spacing windows, quoins on unbeveled corners) must simply flow around the cuts; verify no z-fighting and correct shadows along facets.
- Interaction with `cornerTreatment` (AI_486): beveled corners carry no quoins/strip — the corner feature skips them automatically.
- Forward-compat seam: emit each MAIN-corner bevel facet's frame (origin, direction, width) alongside `facadeFrames` in the generator output, so the facade-angle model (AI_buildings_498) can later attach layout semantics to wide corner facets without re-deriving geometry. Micro edge bevels do not emit frames.
- Update the `BuildingFabrication2` GUI (scope, width, per-corner overrides) and preview in the thumbnail renderer.
- Showcase: a beveled-corner variant of an existing config (and `all_convex_edges` on a config with projecting bays); validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema normalization round-trip; silhouette test for the main-corner bevel math (adjacent faces shorten correctly; the connector run is excluded from face lengths); generator-level test asserting bay-step edges are beveled under `all_convex_edges` and openings keep their clearance.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.


## Summary of changes

- New `src/app/buildings/EdgeBevelModel.js` — one three-free model shared by generator, GUI and tests: schema normalization, the facet-width vs cut-back math, the convex-vertex chamfer pass and the rect main-corner cut.
- `computeQuadFacadeFramesFromLoop` accepts a beveled plan (up to 8 runs): the four axis-aligned runs stay A–D at their shortened lengths and each diagonal becomes a reported corner facet.
- Connectors are matched in LOOP ORDER. Matching them by point equality compared qf-quantized frame endpoints against raw loop points, which silently failed on every non-round footprint, so the silhouette re-mitred the corner it had just cut — the visible "deformed edges" artefact.
- A loop that is not a plan (a resolved silhouette with bay relief) is refused exactly as it always was, rather than half-classified.
- `computeQuadFacadeSilhouette`: a beveled corner drops its shared mitre point — each face ends on its own fold line and takes its join `u` from the frame — and a corner cutout authored on a beveled corner is ignored with a warning.
- Generator: `edgeBevel` applied to every wall-outer loop (floor layers, the AI 493 reference probe, roof bands) before facade solving, so bays lay out on the shortened faces.
- Corner treatment skips beveled corners; belts, cornices, roof bands and the support slab flow around the facets unchanged.
- `edgeBevelCornerFacets` reported out of the generator as the forward-compat seam for the facade-angle model (AI 498).
- Config plumbed end to end: CityMap spec/entry, City, BF2 scene, thumbnail preview, config export, showcase override keys.
- BF2 GUI: an `Edge bevel` building-level section — on/off, scope, facet width, per-corner enable + width override.
- The default facet is 6cm: a chamfer is a masonry detail, not a cut corner.
- Specs updated: engine §6.2.3 (the feature contract), model (`edgeBevel` authoring), UI (the new section).
- Tests: 10 node unit tests, 4 core-suite silhouette/frame tests, a BF2 GUI e2e test, and a before/after + close-up capture spec.

## Carried over to AI 501

The second scope, `all_convex_edges`, is implemented in the model and the
silhouette but is refused by the generator: chamfering the resolved loop costs
the interior shell its opening cuts on relief facades and glazing renders as a
blank panel. The diagnosis and the remaining work moved to
`prompts/AI_buildings_501_BUILDINGS_edge_bevel_all_convex_edges_scope_and_interior_shell_cuts.md`.
The scope stays in the schema, is not offered in the BF2 scope picker, and warns
when a config asks for it.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
