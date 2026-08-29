# City Construction Placement (parcels, limits, reservations)

Status: implemented (AI 519).

Source of truth:
- Model: `src/app/city/placement/` (`planCityConstructions`)
- Wiring: `src/app/city/CityMap.js` (`fromSpec` → `_applyPlacementPlan`)
- Rendering: `src/graphics/visuals/city/City.js`
- Debug view: `src/graphics/visuals/city/CityPlacementDebugOverlay.js` (map debugger "Placements" toggle)

## What a placement is

A **construction** is anything the city reserves ground for. Two kinds:

- **building** — an entry in `spec.buildings`.
- **reservation** — an entry in `spec.reservations`: not a building, fixed size,
  precise location, keep-out for buildings (the player bus starting position is
  one of these).

A construction declares:

1. the **squares** it is assigned (map tiles), and
2. the **limits** it may extend up to on each side.

Its **parcel** is the bounds of its squares with every side moved to its limit,
then cut clear of neighbours and reservations. Its design is seated inside that
parcel at its authored size — **a design is never scaled to fit**.

Authoring a placement therefore never requires hand-computed world coordinates.

## Sides

Side names follow the map grid (`CityMap.DIR`):

| side    | direction |
|---------|-----------|
| `north` | +z (tile y + 1) |
| `east`  | +x |
| `south` | −z |
| `west`  | −x |

## Spec shape

```js
{
    id: 'building_9_b',
    configId: 'modern_bank',
    squares: [[11, 13], [12, 13], [11, 12], [12, 12]],   // alias of `tiles`
    sharesSquaresWith: ['bus_start'],                    // deliberate overlap
    placement: {
        limits: {
            north: 'street',
            west: { type: 'construction', id: 'building_9', padding: 8 }
        },
        padding: 2,          // metres kept clear of every other construction
        front: 'north',      // the limit the design is seated against
        align: 'center'      // cross-axis: center | min | max
    }
}
```

`designLoops` may carry a design-space footprint (authored around the origin)
for entries with no `configId`; entries with a `configId` use the config's
`footprintLoops` as their design. A construction with **no** design footprint
fills its parcel.

### Limit kinds

| form | meaning |
|------|---------|
| `'square'` (default) | the assigned squares' boundary |
| `'street'` | the kerb line: the outer edge of the sidewalk of the nearest road off that side |
| `{ type: 'construction', id, padding }` | the named construction's facing edge, minus `padding` |
| `{ type: 'distance', meters }` | the square boundary, offset outward by `meters` (negative pulls in) |
| a bare number | shorthand for `distance` |

`'street'` is the limit that makes tile grids stop lying: it **extends** a
parcel across a tile boundary a narrow road does not fill, and **pulls it back**
when the tile row is narrower than the avenue running through it. It is computed
from the road geometry — `lanes × laneWidth + shoulder + curbThickness +
sidewalkWidth` off the centreline — by ray-casting outward from the parcel side
and taking the nearest hit across samples along the side. If no road is found
within `PLACEMENT_DEFAULTS.streetSearchMeters`, that side keeps its square
boundary and a `no_street_limit` diagnostic is reported.

### Front and alignment

`front` picks the limit the design is seated flush against; the remaining axis
uses `align`. If `front` is omitted and exactly one side is limited by the
street, that side becomes the front.

## Reservations

```js
{
    id: 'bus_start',
    type: 'bus_start',            // bus_start | area
    squares: [[10, 13]],
    size: { width: 5.2, depth: 14.0 },
    yawDeg: 0,
    clearance: 1.5,               // extra metres buildings must keep clear
    ground: 'slab',               // none | slab
    sharesSquaresWith: ['building_9'],
    placement: { limits: { north: 'street' }, padding: 4, front: 'north' }
}
```

A reservation may instead give an explicit `position: { x, z }` (plus optional
`offset`) when the location is absolute rather than parcel-derived.

The reserved area is axis-aligned; `yawDeg` is the pose handed to whatever
consumes the reservation (for `bus_start`, the player bus heading).

`ground: 'slab'` puts the reservation's rectangle through the same foundation
slab pass buildings use, so its apron runs into the sidewalk with the same
flush joint.

`RESERVATION_TYPE.BUS_START` is read by `GameplayState` for the player bus
starting position; a `?pose=` launch override still wins over it.

## Resolution order

1. Every construction gets a starting **extent**: authored world loops if it has
   them, otherwise the bounds of its assigned squares.
2. Reservations resolve, in spec order.
3. Placement-driven buildings resolve, each after the constructions its
   `construction` limits name (cycles are reported and resolved against the
   extents known so far).
4. For each: limits are applied, then the parcel is **cut** clear of every other
   construction — the cut that leaves the most parcel wins, preferring a cut
   that still fits the design, and never cutting the front side while another
   cut works.
5. The design is seated; overflow is reported, not scaled away.

An entry that carries **both** a `placement` block and authored world
`footprintLoops` is reported (`invalid_placement`): the parcel wins and the
world loops are ignored.

Buildings with **no** `placement` block keep the behaviour they have always had
(tile-derived build area, `footprintPlacement` of `center` / `anchor` /
`shift`). They cannot be laid out around a reservation, so an overlap with one
is reported instead.

## Opt-in stretch fitting

A building entry may set `fitToLot: true` to fit its authored BF2 footprint to
the resolved parcel or tile-derived build area. The default remains the fixed
placement path above. Stretch fitting uses the angle-preserving perpendicular
cuts from the BF2 footprint-edit model; it never uniformly scales or shears the
plan, and persisted A–Z run ids remain attached to the same facades.

The optional catalog/config `footprintStretch` block controls participation:

```js
footprintStretch: {
    quantumMeters: 0.1,
    faces: { A: 'prefer_expand', C: 'never' },
    bands: { 'A:start': { preference: 'allow', weight: 2 } }
}
```

Preferences are `prefer_expand`, `allow`, or `never`. Explicit band metadata
overrides its face metadata. Geometrically identical cuts are treated as one
band; an explicit `never` on any alias pins that band. When preferred bands are
available they absorb the side's delta before ordinary allowed bands. Multiple
participating bands divide the delta proportionally by weight (or by cut length
when no weight is authored), with seed-stable tie breaking.

Each side is fitted independently to the build-area bounds after the existing
outward reserve inset. Deltas are quantized and every affected facade is dry-run
through the bay solver. Solver minima, invalid footprint geometry, and pinned or
missing cuts clamp the result. An unreachable target keeps the nearest valid
size and emits a building warning; it never falls back to shearing the plan.
The same entry, lot, seed, and config must produce byte-stable fitted points.

## Diagnostics

Collected on `map.placementDiagnostics` and logged with a `[CityPlacement]`
prefix. Codes: `square_conflict`, `no_street_limit`, `unknown_construction`,
`limit_cycle`, `parcel_empty`, `design_overflow`, `reservation_blocked`,
`invalid_placement`.

## Map debugger

The "Placements" toggle draws assigned squares (blue fill), each resolved parcel
with its declared limit edges highlighted (cyan), and reservations (magenta fill
plus outline), so a placement can be judged before it is driven in game.

## Round-tripping

`CityMap.exportSpec()` exports the authored `placement` / `squares` /
`sharesSquaresWith` and `spec.reservations`, never the solved world loops: the
spec stays parcel-authored and re-planning it reproduces the same placement.

## Big City 2

- `building_9` (Bradbury) keeps its authored world loops with
  `footprintPlacement: 'anchor'` — the pre-parcel path, still supported.
- `building_9_b` (Modern Bank) is parcel-authored: four squares, `north:
  'street'`, `west` at 8 m from the Bradbury, 2 m default padding. It lands
  flush on the avenue kerb line at its authored 34.15 × 30.4 m.
- `bus_start` takes the lawn strip between the two, against the same kerb line,
  with a slab that meets the sidewalk. It cuts the bank's parcel, so the bank is
  laid out around the bus instead of over it.
