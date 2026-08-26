# DONE

#Problem

> **Note: this prompt was split out of `AI_buildings_499` (plan edge bevels).**
> AI 499 shipped the `main_corners` scope. Its second scope, `all_convex_edges`,
> is implemented in the model and the silhouette but is **refused by the
> generator** because it breaks glazing — that is what this prompt is for.

`edgeBevel.scope = 'all_convex_edges'` is meant to chamfer every convex arris the
facade silhouette itself creates — bay-relief steps, pier edges — after bay
layout, as a vertex pass over the resolved loop. Enabling it costs the interior
shell its opening cuts on relief facades: the glazing then renders as a blank
pale panel instead of glass with a room behind it.

What is already known (diagnosed 2026-08-25 while finishing AI 499):

- Reproduced on `pier_grid_tower_2` with the bay recesses deepened to `-0.6m`
  and `edgeBevel: { enabled: true, scope: 'all_convex_edges', widthMeters: 0.08 }`.
- Rebuilding the same view with the layer's `interior: { enabled: false }` makes
  the artefact vanish, which identifies the **interior shell** — not the facade
  wall, not the window mesh — as the surface at fault.
- The shell does not consume the beveled loop directly: it derives its own loop
  from `frames` plus `cornerJoinPointWithDepths` mitre joins, then projects the
  facade cutouts onto it with `projectFacadeCutoutOntoShell`. Why the chamfer
  perturbs that projection is not yet understood.
- `main_corners` is unaffected, because it mutates the plan loop *before*
  anything is derived from it.

Current state in the tree (all from AI 499):
- `src/app/buildings/EdgeBevelModel.js` already implements the convex-vertex
  chamfer (`bevelConvexLoopVertices`), the edge-fraction clamp and the
  minimum-facet refusal, with node unit tests.
- `computeQuadFacadeSilhouette` already calls it behind
  `const wantsConvexBevel = false && ...`, and warns
  `Edge bevel: scope "all_convex_edges" is not implemented yet; …`.
- The opening-clearance guard (`openingClearanceAtU`) already pads the glass
  span by `EDGE_BEVEL_OPENING_REVEAL_ALLOWANCE_METERS`, because a window's hole
  is wider than its glass. That guard alone did NOT fix the artefact.
- The BF2 scope picker deliberately offers only `Main corners`.
- The core suite has one placeholder test, `EdgeBevel: all_convex_edges is held
  back and says so`, standing in for the two silhouette tests that covered the
  pass before it was gated.

# Request

Make `all_convex_edges` render correctly, then turn it back on.

Tasks:
- Find why the chamfer costs the interior shell its opening cuts. The most
  likely fix is to hand the shell the UN-beveled detail loop (the chamfer is an
  exterior nicety and the shell sits behind the wall), or to re-project the
  shell's cuts after the chamfer — but confirm the mechanism before choosing.
- Remove the `false &&` gate and the "not implemented yet" warning in
  `computeQuadFacadeSilhouette`, and restore `All convex edges` to the BF2 scope
  picker.
- Restore the two core-suite tests the gate replaced: `all_convex_edges` cuts
  bay-relief arrises, and a cut is refused when an opening leaves it no
  clearance. Add one that asserts the interior shell keeps a hole per opening
  with the scope on (the regression this prompt exists for).
- Verify the whole family still holds with the scope on: wall cutouts, the
  parallax interior behind glass (AI 495/496), belts, cornices and the roof band
  flowing around the facets, and no z-fighting along a facet.
- Keep the concave opt-in (`includeConcave`) working, and re-add its BF2 toggle.
- Re-check the clamps at a realistic width: a chamfer is a masonry detail
  (`EDGE_BEVEL_DEFAULT_WIDTH_METERS` is 6cm), and a cut can only ever be as deep
  as `EDGE_BEVEL_MAX_EDGE_FRACTION` of the step it sits on.
- Showcase: `all_convex_edges` on a config with pronounced pier relief, at a
  grazing angle where a facet reads as its own light value; validate in
  `tests/headless/harness/scenarios/scenario_building_showcase.js`.

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

## Summary of changes (2026-08-25)

- Diagnosed the real mechanism: not the convex-arris pass at all — `cornerJoinPointWithDepths` assumed the frame corner is the two faces' shared mitre point, and on a plan with beveled MAIN corners (which `all_convex_edges` includes) it collapsed each join onto a fold point, tilting every interior-shell run off its face line so the projected opening cutouts failed the wall builder's 2cm perpendicular match. `main_corners` had the same latent bug.
- Fixed `cornerJoinPointWithDepths` to anchor each face's offset line on its own frame point (identical result at sharp corners, true mitre at beveled ones).
- Added `cornerJoinPairWithDepths` / `buildCornerJoinLoopWithDepths`: loops derived at other depths (interior shell walls/floor/ceiling, roof core surface — both roof sites) follow the chamfer facet at a beveled corner instead of mitring through it.
- Removed the `false &&` gate and the "not implemented yet" warning in `computeQuadFacadeSilhouette`; the convex-arris pass now ships.
- Restored `All convex edges` to the BF2 scope picker (the `includeConcave` toggle comes back with it) and extended the edge-bevel e2e test to cover both.
- Core suite: replaced the placeholder with three tests — the pass cuts bay-relief arrises, a cut is refused without opening clearance, and the interior shell keeps a hole per opening with the scope on (the regression this prompt existed for).
- Re-verified clamps at the 6cm masonry default (`EDGE_BEVEL_MAX_EDGE_FRACTION` exercised by the new arris test); node unit suite for the model passes.
- New capture spec `ai501_convex_bevel_capture.pwtest.js`: pier_grid_tower_2 with window bays recessed −0.35, before/after wide shots plus a grazing manual-camera close-up where each pier chamfer reads as its own light value; asserts the beveled build gains facet triangles with zero bevel warnings.
- Updated `BUILDING_2_SPEC_engine/model/ui` to describe the shipped scope and the derived-loop facet rule.
