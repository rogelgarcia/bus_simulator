# DONE

# Problem

Bay capital and arcade impost bands project INTO the wall instead of out of it.
Both `emitCapitalStep` and the AI 493 arcade-impost emitter in
`src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js`
compute the band's plan footprint as:

```js
const dOut = planeDepth - projection;
const dIn = planeDepth + 0.04;
```

In facade-frame space positive depth is OUTWARD (`pointOnFacadeFrame` adds
`n·depth` with `n` the outward normal — re-verified empirically in AI 502 by
bounding-box: a `+0.6` bay renders 0.6m proud). So `planeDepth - projection`
buries the authored projection INSIDE the wall, and the visible relief of every
capital and impost band is the hardcoded 4cm (`+ 0.04`) constant, regardless of
what the author set. The sign convention was almost certainly misread when
these were written — the same inversion as `pier_grid_tower_2`'s config comment
("recessed 0.22m behind the piers": those strips actually render 0.22m PROUD).

Found while building the AI showcase set (2026-08-26).

Evidence (tests/artifacts/screens/showcase/):

- `showcase_06_arcade_hall_closeup_arcade.png` — an arcade run whose group
  authors `impost: { projectionMeters: 0.08 }`: 18 impost meshes exist in the
  parts (role `bay_arcade_impost`) but NO band is visible at the springing line
  on the piers.
- Probe measurement: on a face-A wall plane at z=12, an impost mesh's bounding
  box spans z ∈ [11.92, 12.04] — 8cm inside the wall, 4cm out.
- `showcase_11_setback_tower_corner.png`, `showcase_14_setback_tower_closeup_bevel.png`
  — pier capitals authored with `projection: 0.08` read as barely-there ledges
  (only the overhang widening in u is visible).

# Request

Make `projection` project outward for bay capitals and arcade imposts:
`dOut = planeDepth + projection`, embed `dIn = planeDepth - 0.04`, and check
any other consumer of the same pattern. Re-baseline the AI 487 capital and
AI 493 arcade visuals afterwards (`pier_grid_tower_2` and any capture specs
that show capitals), since shipped buildings will visibly gain the relief the
authors originally asked for.

## Delivery requirements
- Engine 2 only.
- Before/after screenshots of an arcade impost run and a pier capital.

## Summary of changes (2026-08-26)

- Flipped the plan footprint of both band emitters in
  `BuildingFabricationGenerator.js` to the outward-positive depth convention:
  `dOut = planeDepth + projection`, `dIn = planeDepth - 0.04` — in
  `emitCapitalStep` (bay capitals, AI 487) and the AI 493 arcade-impost
  emitter. Authored projection now renders proud of the bay plane; the 4cm
  constant is the wall embed, not the visible relief.
- Audited every other `projection` consumer (cornice cross-sections, quoins,
  storefront bulkhead/fascia slabs, corner treatment): none shares the
  inverted pattern; no other change needed.
- Core tests: `bay capitals project out of the wall, not into it (AI 503)` and
  `arcade imposts project out of the pier, not into it (AI 503)` — a 0.5m
  projection must reach 0.5m outside the 10m test tile's wall plane on the
  band's depth axis and embed only 4cm, which the inverted sign fails.
- New capture spec `ai503_capital_impost_capture.pwtest.js`: grazing close-ups
  of the arcade_hall impost run and the setback_tower pier capitals (scenario
  loaded with `mergeBuildingGeometry: false` so the role-tagged band meshes
  can be located by scene traverse); before shots taken against the pre-fix
  generator (`AI503_TAG=before`). Evidence pairs in
  `tests/artifacts/screens/buildings/ai503_*`.
- Re-baselined the visuals that show the affected bands: showcase views of
  arcade_hall and setback_tower, the AI 493 arcade captures, the AI 502 pier
  reference shots, and the `pier_grid_tower_2` catalog showcase shot.
- Documented the outward-positive band projection convention in
  `BUILDING_2_SPEC_engine.md` §arcade impost.
