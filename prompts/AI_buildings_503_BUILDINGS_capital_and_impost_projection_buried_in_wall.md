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
