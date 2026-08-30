# BGlass Reference Facade

This document is the authored reference contract for the `bglass` Building
Fabrication 2 catalog entry. Measurements are in meters.

The sole source image is `downloads/references_ideas/bglass.png` (1122 x 1402,
2,248,074 bytes, SHA-256
`8A010F510B35A554EC9D3D7DBB0FF74B635E7D8E08EFA3AD6EDB657C405CA114`).
The preserved comparison copy belongs under
`tests/artifacts/screens/buildings/bglass/references/`; the source must not be
renamed or altered.

The photograph is a near-front street perspective with no scale marker and no
usable rear elevation. Dimensions and occupied-floor divisions below are
authored targets inferred from facade proportions and normal residential or
hotel storey heights, not claims about a measured real building.

## Massing and occupied floor stack

- The lower podium silhouette is 48 m wide and 28 m deep. Its bounds are
  `x = -27..21` and `z = -14..14`, deliberately centering the podium at
  `x = -3` rather than moving it through `planOffset`.
- The tower silhouette is 30 m wide and 22 m deep. Its bounds are
  `x = -15..15` and `z = -13..9`.
- The tower is therefore modestly biased toward the right side of the podium:
  the horizontal terrace/setback is 12 m on the left and 6 m on the right.
  The front setback is 5 m and the inferred rear setback is 1 m.
- The occupied stack is exactly 20 floors and 71.4 m high:
  - one 5.2 m-high glazed lobby floor;
  - one 4.2 m-high upper podium/amenity floor;
  - seventeen repeated 3.4 m-high tower floors;
  - one 4.2 m-high crown or penthouse floor.
- A zero-height, non-occupied terrace finish layer sits between the podium and
  tower. Its smooth off-white surface keeps the exposed slab visually clean
  without changing the 71.4 m occupied height or owning another silhouette.
- A final roof layer closes the stack above the crown without adding an
  occupied floor or another silhouette owner.

## Layer silhouette ownership

The building deliberately compares a broad base with a much narrower tower
through first-class Building Fabrication 2 layer silhouettes:

1. The building-default footprint is the wide 48 x 28 m podium loop.
2. The lobby resolves `inherit_default` and uses that loop.
3. The upper podium resolves `inherit_previous`, remaining identical to the
   lobby.
4. A zero-height terrace finish roof preserves the resolved podium loop.
5. The seventeen-floor tower owns one `detached` 30 x 22 m rectangular loop.
6. The crown resolves `inherit_previous`, retaining the tower loop.
7. The final roof has no authored silhouette and follows the already-resolved
   crown.

The stack has exactly one changed adjacent-floor boundary: podium-to-tower.
The exposed part of the podium top must become a watertight roof terrace and
the tower underside must close as a soffit. The transition may not contain
cracks, open wall edges, coplanar shimmer, or a facade identity guessed from
spatial proximity.

Every occupied floor layer uses `planOffset: 0`. The asymmetry is encoded in
the authored loop coordinates; it must not be recreated with relative offsets.
Both loops are simple, clockwise rectangles with stable `cornerId`, `runId`,
and `runForward` metadata. They contain no circular runs or curve metadata.
Face `A` is the street-facing front on both silhouettes.

## Podium facade and terrace

- Both podium floors read as a single broad, transparent civic-scale base
  bounded by a pale cool precast or stone perimeter frame.
- The ground floor has a centered glazed entrance with paired doors and clear,
  transmissive lobby glass. It must not read as an opaque blue wall.
- The upper podium continues the glazed amenity frontage and structural
  alignment. A restrained pale horizontal belt may mark the floor line.
- The top of the podium outside the tower footprint is the visible setback
  terrace. The broad left terrace is the principal silhouette cue and may
  carry sparse planters or landscaping, but it remains open rather than
  becoming another occupied mass.
- Side and rear podium treatments are inferred and may use a simpler glazed
  rhythm while preserving the same pale structural frame.

## Tower curtain wall and balcony stacks

The tower front is a flat rectangular facade. It has no bow, curved logical
run, or curve simulated with bay depth. Its dominant composition is a broad
central blue curtain-wall field flanked by two vertically aligned recessed
balcony stacks.

- The tower front authors one left and one right balcony/loggia bay with equal
  nominal widths and matching recess depths.
- Both balcony bays use negative depth, preferably about 1.4-to-2.0 m, and a
  recessed balcony preset with transparent or reflective glass guards.
- The balcony bays sit on opposite sides of the central curtain-wall bays. The
  central field remains wider than either balcony and is divided into
  renderable window modules rather than one over-wide opening.
- The seventeen-floor tower layer repeats the same paired bays, producing two
  straight, symmetric stacks with seventeen balconies each.
- The balcony back walls remain glazed. Dark soffits and side reveals provide
  the deep horizontal shadow slots visible in the reference; a flat dark
  texture on the main wall is not an acceptable substitute.
- Slender outer glass strips or metal corner returns may sit outside the
  balcony stacks when needed to match the photograph. They must not destroy
  the equal left/right balcony width and depth contract.

The central and outer tower glazing is blue-dominant, highly reflective and
partially transmissive. It must visibly receive the showcase HDRI. A suitable
starting range is opacity `0.75..0.94`, metalness at least `0.55`, roughness no
greater than `0.09`, transmission `0.12..0.45`, IOR `1.4..2.0`, and environment
intensity at least `2.0`. Mullions are slender dark blue-gray or charcoal metal
and remain subordinate to the glass field.

## Crown and roof

- The crown is one taller occupied floor on the unchanged tower silhouette.
- Its front may break the typical-floor symmetry to match the photograph: a
  deep open upper-left loggia and a brighter glazed upper-right corner are
  appropriate. It must remain recognizably part of the same rectangular tower.
- The roof edge is flat, light, and restrained. A low glass/aluminum screen or
  ring no more than about 0.5 m high may complete the parapet line.
- There is no projecting classical cornice, ornamental cap, bulky mechanical
  penthouse, or dense field of rooftop props.

## Catalog and evidence contract

- The configuration id is `bglass` and its display name is `B Glass`.
- `getBuildingConfigById('bglass')` resolves the exact authored object.
- `getBuildingConfigs()` includes that object exactly once.
- Final reference comparison preserves the source copy under
  `tests/artifacts/screens/buildings/bglass/references/`.
- Final rendered evidence uses the standard building showcase with an HDRI as
  both visible background and reflection source and includes distinct exact
  3840 x 2160 front, three-quarter, and low-angle base-to-top views.
