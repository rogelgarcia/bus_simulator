# DONE

# Problem

Placing a designed building in a city spec is hand-work, and the placement
model cannot express what a parcel actually is.

A building entry claims tiles and gets ONE of three whole-footprint behaviours
(`footprintPlacement`): `center` scales the design down and centres it in the
tile area, `anchor` keeps authored world coordinates exactly, `shift` keeps the
authored size and slides it back inside the area. None of them says "fill this
parcel, out to these limits, and stay clear of what is next to you", so every
non-generic building ends up with hand-tuned world coordinates in the spec.

What that costs today, observed while placing `modern_bank` in Big City 2:

- **The bank sits on top of the player bus spawn.** The bus spawns at the world
  origin (a bare `(0, 0)` literal in `GameplayState`), the parcel covers it, and
  nothing in the city model knows the spawn exists. The bus starts inside the
  building.
- **Tile claims have no conflict detection.** `CityMap.fromSpec` validates only
  that a tile is in bounds, is not road, and is adjacent to the claim so far —
  two buildings can claim the same tile and neither is told. Sharing a tile is
  sometimes exactly right (a building whose footprint occupies part of a square
  should be able to share the rest), but it should be deliberate, not silent.
- **A parcel loses the strip it can actually build on.** The build area comes
  from whole tiles minus road tiles minus a road margin
  (`computeBuildingLoopsFromTiles`), so a parcel facing an avenue is cut at the
  tile boundary and the buildable ground between that boundary and the kerb
  disappears. Both designed buildings on the avenue (`bradbury_block`,
  `modern_bank`) work around it with authored world loops.
- **Padding between neighbours is implicit.** The only spacing control is the
  road/base margin baked into the tile area; there is no way to say "keep N
  metres clear of the building next door", so gaps are whatever the hand-tuned
  coordinates happen to produce.

And the model has no room for what is coming: constructions that are NOT
buildings, with fixed sizes and precise placement — the bus starting position
first, and later other fixed installations. Buildings should accommodate around
those, not overlap them.

# Request

Give city placement a model that can express a parcel: which squares a
construction is assigned, how far it may extend within and beyond them, what it
must keep clear of, and how much room to leave its neighbours. Authoring a
placement should stop requiring hand-computed world coordinates.

Tasks:

- A construction can declare the square(s) it is assigned AND the limits it may
  extend up to, rather than only a tile list. Limits should be expressible
  against the things that actually bound a parcel — the kerb/street line, a
  neighbouring construction, an explicit distance — not only the tile grid.
- Within its limits a construction uses its parcel as fully as it can: a design
  that fits is placed at its authored size against the limit that matters
  (typically the street line), and is never silently scaled to fit.
- Two constructions may share a square deliberately, each occupying its own part
  of it. Overlapping claims that were NOT declared as shared are reported.
- A placement can ask for padding to its neighbours, and the result honours it.
- Non-building constructions are first-class placements: fixed size, precise
  location, reserved against the city grid. The player bus starting position
  becomes one of them instead of a literal in the gameplay state, so it is
  visible in the city spec and in the map debugger, and buildings placed near it
  are laid out around it rather than over it.
- Reserved areas are keep-out for buildings: a building whose parcel overlaps a
  reservation is placed clear of it, or reported when it cannot be.
- A reservation can carry its own ground treatment — the bus starting position
  should be able to render a slab connected to the sidewalk.
- The map debugger shows reservations and each construction's assigned squares
  and limits, so a placement can be judged there before it is driven in game.
- Existing placements keep working: the generic `configId` + tiles entries, and
  the two authored-loop placements on the avenue (`bradbury_block` anchored,
  `modern_bank` shifted), should either be expressible in the new model or keep
  behaving as they do now.

Verification should include the concrete case that motivated this: the bank on
the avenue parcel, placed with padding to the Bradbury, filling its parcel out
to the avenue street line, and clear of the bus starting position — with no
hand-computed world coordinates in the spec.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to `prompts/AI_DONE_buildings_519_CITY_construction_placement_squares_limits_and_reservations_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

# Summary of changes

- **Placement model (`src/app/city/placement/`)** — new app-layer module: a
  construction declares assigned `squares` plus per-side `limits`, the planner
  turns that into a parcel rectangle, cuts it clear of neighbours and
  reservations, and seats the design at its authored size (never scaled).
- **Street limits (`internal/StreetLines.js`)** — roads become keep-out bands
  (`lanes x laneWidth + shoulder + curb + sidewalk`); a `street` limit ray-casts
  from the parcel side to the kerb line, so a parcel gains the strip a narrow
  road leaves free and is pulled back off a wide avenue instead of being cut at
  the tile boundary.
- **Limit kinds** — `square` (default), `street`, `{construction, id, padding}`,
  `{distance, meters}`; plus a per-placement `padding` honoured against every
  other construction, and `front`/`align` for how the design is seated.
- **Reservations** — first-class non-building constructions (`spec.reservations`):
  fixed size, precise or parcel-derived location, reserved against the grid,
  keep-out for buildings, with their own `ground: 'slab'` treatment that runs
  through the building foundation-slab pass and meets the sidewalk.
- **Deliberate square sharing** — `sharesSquaresWith`; every undeclared
  overlapping claim is reported (`square_conflict`), along with
  `no_street_limit`, `unknown_construction`, `limit_cycle`, `parcel_empty`,
  `design_overflow`, `reservation_blocked`, `invalid_placement` on
  `map.placementDiagnostics` and the `[CityPlacement]` console log.
- **CityMap** — `fromSpec(spec, config, { roadGeometry })` runs the planner,
  stores `map.reservations` / `map.placementDiagnostics`, accepts `squares` as a
  `tiles` alias, and `exportSpec` round-trips the AUTHORED placement + the
  reservations (never the solved world loops).
- **City** — passes the live road geometry to the planner, uses a resolved
  parcel as the build area, adds reservation slabs and keeps scatter off them.
- **Bus starting position** — no longer a `(0, 0)` literal in `GameplayState`:
  it is the `bus_start` reservation on the city spec (a launch `?pose=` still
  overrides it).
- **Map debugger** — new `CityPlacementDebugOverlay` + "Placements" toggle:
  assigned squares, each resolved parcel with its declared limit edges, and
  reservations.
- **Big City 2** — `modern_bank` re-authored as a parcel (four squares, `north:
  'street'`, `west` 8 m from the Bradbury, 2 m padding) with NO hand-computed
  world coordinates: it lands flush on the avenue kerb line (z = 30.72) at its
  authored 34.15 x 30.4 m, 21.5 m clear of the Bradbury and 10.6 m clear of the
  bus start, which takes the lawn strip between them on a slab that meets the
  sidewalk. `bradbury_block` keeps its anchored authored loops unchanged.
- **Spec + tests** — `specs/city/construction_placement.md`;
  `tests/node/unit/city_construction_placement.test.js` (7 tests: street limit,
  authored-size seating, declared/undeclared sharing, reservation cut, overflow
  reporting, the Big City 2 bank case, export round-trip).
