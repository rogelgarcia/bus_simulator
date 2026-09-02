# Terra & Mar Reference Facade

This document is the authored reference contract for the `terramar` Building
Fabrication 2 catalog entry, displayed as `Terra & Mar`. Measurements are
in meters.

## Source references

The primary unmarked source is
`downloads/references_ideas/b8.png` (1122 x 1402, 2,555,434 bytes, SHA-256
`EA6A43791C68CA199D43869833B8A7BC16AF7927FEC7010AD5147A47095D160B`).

Three user annotations refine the facade topology and upper terrace. Their
preserved comparison copies belong under
`tests/artifacts/screens/buildings/terramar/references/`:

- `annotated-pillars-balconies.png` (1032 x 1178, 2,877,459 bytes, SHA-256
  `E699F23CD3F21D518D29FC1372C8DD028BEADF34F12789B74E5A3484EFEBBD6D`);
- `annotated-faces-penthouse.png` (924 x 1162, 2,456,272 bytes, SHA-256
  `FD4DC1B80F49B26F8351DDE022D860CFBD63AD87ED73EC43CF95098B1F8B848F`);
- `annotated-curved-face-option.png` (930 x 1150, 2,461,356 bytes, SHA-256
  `A9E7C221BF320A434F75C8BA1B16D841A2743954C7C21E564B1A59110D51688F`).

The source files must not be renamed or altered. The annotations' face letters
are visual references, not canonical BF2 run identities. The image is a
near-front street-corner perspective with no scale marker, rear elevation or
measured roof plan. Dimensions below are authored targets inferred from
proportions and normal mixed-use storey heights.

## Massing and occupied floor stack

- The occupied stack is exactly eight floors and 29.45 m high:
  - one 4.8 m-high glazed retail and restaurant ground floor;
  - one 4.3 m-high upper podium restaurant or amenity floor;
  - five repeated 3.35 m-high residential floors;
  - one detached 3.6 m-high penthouse pavilion.
- The podium outer bounds are exactly 28 x 22 m, centered at the origin with
  `x = -14..14` and `z = -11..11`.
- The residential wall bounds are exactly 25 x 19 m, centered at the origin
  with `x = -12.5..12.5` and `z = -9.5..9.5`.
- Residential walls are inset approximately 1.5 m normal to every podium edge.
  Balcony platforms return approximately 1.5 m toward the podium outline.
- The penthouse is a detached 10 x 7.5 m rectangle with
  `x = -5..5` and `z = -5.25..2.25`. Its center is shifted 1.5 m toward
  the rear, preserving approximately 7.25 m of open terrace in front, 4.25 m
  at the rear and 7.5 m at each side before local clipped-corner variation.
- A zero-height podium-terrace roof sits between the podium and residential
  group. A second zero-height terrace roof sits between the residential group
  and penthouse. Neither roof counts as an occupied floor or owns a silhouette.
- The final roof follows the penthouse silhouette.

The target visual height is approximately 31 m after the final low parapet is
included.

## Layer silhouette ownership and topology

The podium and residential group are centered clipped octagons with eight
stable planar runs. Neither loop contains an arc. The building-default podium
loop is:

| Point | x | z | Outgoing run |
| --- | ---: | ---: | --- |
| Front-right | 7 | 11 | A |
| Front-left | -7 | 11 | H |
| Left-front shoulder | -14 | 4 | G |
| Left-rear shoulder | -14 | -4 | F |
| Rear-left | -7 | -11 | E |
| Rear-right | 7 | -11 | D |
| Right-rear shoulder | 14 | -4 | C |
| Right-front shoulder | 14 | 4 | B |

This gives a 14 m straight front, two approximately 9.90 m front chamfers, two
8 m side runs, a 14 m rear and matching rear chamfers.

The five-floor residential layer owns this detached loop:

| Point | x | z | Outgoing run |
| --- | ---: | ---: | --- |
| Front-right | 6.4 | 9.5 | A |
| Front-left | -6.4 | 9.5 | H |
| Left-front shoulder | -12.5 | 3.4 | G |
| Left-rear shoulder | -12.5 | -3.4 | F |
| Rear-left | -6.4 | -9.5 | E |
| Rear-right | 6.4 | -9.5 | D |
| Right-rear shoulder | 12.5 | -3.4 | C |
| Right-front shoulder | 12.5 | 3.4 | B |

The residential front is 12.8 m, each chamfer is approximately 8.63 m and each
side is 6.8 m.

The penthouse owns this detached rectangular loop:

| Point | x | z | Outgoing run |
| --- | ---: | ---: | --- |
| Front-right | 5 | 2.25 | A |
| Front-left | -5 | 2.25 | D |
| Rear-left | -5 | -5.25 | C |
| Rear-right | 5 | -5.25 | B |

Layer ownership is:

1. Ground resolves `inherit_default` and uses the podium loop.
2. Upper podium resolves `inherit_previous`.
3. The podium terrace roof follows the podium loop.
4. The five-floor residential group owns its detached clipped octagon.
5. The upper amenity terrace roof follows the residential loop.
6. The penthouse owns its detached rectangle immediately above that roof.
7. The final roof follows the penthouse loop.

This produces two changed adjacent occupied-floor boundaries:
podium-to-residential and residential-to-penthouse. Both transitions must form
watertight exposed caps and upper-floor undersides without cracks, open edges,
coplanar shimmer or guessed facade identities. All floor layers use
`planOffset: 0`; setbacks are authored in detached loop coordinates.

The current planar clipped topology is intentional. BF2 already supports
circular facade arcs for walls, openings, belts and roof edges, but its balcony
slabs and guards remain flat per-bay geometry. Converting B/H to curves before
the path-aware builder work would produce an internally inconsistent model.
Custom spline/path faces and systematic path-aware builder behavior are
deferred to AI 539.

## Ground-floor frontage and entrance

- The straight front run is a pale-stone sign and entrance plane.
- A broad opening approximately 8.6 m wide contains the centered glazed double
  entrance, contiguous sidelights and glazed transom.
- The complete entrance bay projects approximately 1.15 m beyond the adjacent
  ground storefront plane. It is a shallow entrance volume, not merely the
  balcony on the floor above and not a recessed opening.
- Full-height restaurant storefronts occupy the two front chamfers and continue
  around the short side runs. Slender charcoal frames divide each chamfer into
  two or three large panes.
- Ground glazing is approximately 3.4-to-3.8 m high and visibly transmissive.
- Street umbrellas, tables, pedestrians and palms in the references are
  context, not part of the building mesh contract.

## Terra & Mar sign

Two separate dark bronze or charcoal lettering records are centered over the
main entrance bay on straight front run A:

1. `TERRA & MAR`, uppercase serif, approximately 0.50 m high;
2. `COASTAL KITCHEN`, uppercase, approximately 0.22 m high.

The main line sits above the subtitle. Both are shallow extrusions of roughly
0.04-to-0.07 m and share target `A:b8_ground_entry`, keeping the text centered
over the entrance rather than at either building corner.

## Upper podium

- The second storey continues the pale-stone frame and full-height restaurant
  glazing at approximately 3.1-to-3.4 m clear height.
- Straight front A contains one centered terrace behind a transparent glass
  guard, aligned over the projecting entrance volume.
- Chamfer and side openings are broad two- or three-panel assemblies with
  aligned stone end piers.
- The upper podium terminates in a strong pale-stone slab/parapet line, not a
  classical cornice.

## Residential facade rhythm and adjacency-ready balconies

All five residential floors repeat one vertically aligned facade. The primary
visible runs are straight front A, actual right neighbor B, right side C, left
side G and actual left neighbor H. The annotations' left “E” therefore maps to
canonical H.

- Front A is exactly:
  - 3.00 m right balcony bay;
  - 0.65 m internal stone pier;
  - 5.50 m center balcony bay;
  - 0.65 m internal stone pier;
  - 3.00 m left balcony bay.
- The two A piers are approximately 3.08 m either side of the face center and
  remain well clear of both corners.
- Right neighbor B is an outer balcony, one centered 0.65 m pier and an
  A-adjacent balcony.
- Left neighbor H mirrors that rhythm: an A-adjacent balcony, one centered
  0.65 m pier and an outer balcony.
- Each B/H balcony span is approximately 3.988 m. There is no structural pier
  at either A-B or A-H corner.
- C/G and inferred rear runs retain a simpler balcony span between aligned end
  piers.
- A continuous 1.5 m-deep pale-stone belt closes the slab/fascia silhouette
  around each repeated level. Per-bay balcony platforms are a separate 0.04 m
  walking-surface finish raised 0.04 m above the band, avoiding coplanar overlap.
- Balcony guards are approximately 1.02 m high with cool-gray glass, slim
  charcoal top rails and posts at no more than approximately 1.6 m spacing.
- Glazing behind every balcony is a near-full-height 2.5-to-2.75 m slider
  assembly with warm reveal material.

The residential layer opts into the BF2 balcony-continuity contract with three
stable links. `b8_residential_front_to_right_chamfer` joins the physical start
edge of A's right balcony to the physical end edge of B's A-adjacent balcony;
`b8_residential_front_to_left_chamfer` joins the physical end edge of A's left
balcony to the physical start edge of H's A-adjacent balcony; and
`b8_residential_rear_to_right_chamfer` joins the physical end edge of E's outer
balcony to the physical start edge of D's E-adjacent balcony. D reuses A's
facade, so that last physical endpoint deliberately retains the stable source
bay id `b8_residential_front_balcony_right`. B remains a separately authored
physical facade instead of reusing H, so both front target bay ids stay direct
and inspectable. Each valid link generates one continuous platform/fascia
footprint and one uninterrupted outer guard path per selected floor,
suppressing the internal end guards and duplicate corner hardware. The center
A balcony and every unlinked balcony remain independent. Curved custom face
paths remain outside this stage and are deferred to AI 539.

## Recessed-balcony catalog variant

`terramar_recessed`, displayed as `Terra & Mar — Recessed Balconies`, is a
separate catalog version of the same building. It preserves the original
`terramar` massing, entrance, signs, materials, windows, floor stack,
penthouse and roof terraces. The original catalog entry remains unchanged.

The variant converts every balcony-enabled bay in the five-floor residential
group to the existing AI 489 `balcony.modern_recessed` mode. Each bay authors
a symmetric 1.5 m negative depth, so the window sits at the rear of a real
loggia void while the glass guard stays at the nominal facade line. The
residential belt extrusion is reduced from 1.5 m to 0.12 m so it reads as a
facade-edge slab rather than an outstanding balcony. The podium restaurant
terrace remains projecting.

The variant retains three explicit AI 537 `balconyContinuity` links across the
front-left, front-right, and mirrored rear cross-face balcony pairs. Recessed
continuity derives an implicit platform depth from each bay's 1.5 m notch, so
each linked pair emits one continuous outer platform and guard at the nominal
facade line rather than two disconnected balcony ends.

Each continuity link owns a balcony-only rounded corner transition with linked
0.42 m runouts and a centered meeting point. Only the visible platform edge,
fascia, glass guard, and rail curve through the adjacent face. The 1.5 m-deep
recessed wall and rear glazing retain their original straight planes and
authored window widths; no endpoint is pulled toward the physical corner and
no AI 541 wall-boundary relationship is authored. This does not fake AI 540's
planned full-height opaque front wall, optional internal partitions, or a
connected hidden cavity between neighboring loggias.

The recessed variant mirrors matching residential runs around the whole mass:
C reuses G in reverse, D reuses B in reverse, E reuses A in reverse, and F
reuses H. This preserves the front facade's balcony/pier language on the rear
and keeps the two sides geometrically mirrored instead of fitting layouts from
unrelated face lengths.

## Penthouse and exposed upper terrace

- The penthouse is a distinct floor layer, not a mechanical roof prop.
- Its front and rear are mostly glazed between 0.8 m stone piers. Its sides are
  mostly glazed between 0.75 m stone piers.
- The intermediate roof and penthouse are adjacent in layer order so the
  penthouse begins at the terrace plane without artificial parapet-height lift.
- The intermediate roof follows the full residential silhouette; the
  penthouse's smaller resolved loop is the central upper-mass keep-out.
- A low pale perimeter ring is required. Dense mechanical equipment is disabled.
- The current rooftop prop catalog cannot create the reference's planters,
  small trees, dining/lounge groups or pergola, and the roof editor does not
  provide a dedicated transparent guard. Those first-class authoring and
  amenity-population requirements are deferred to AI 538.

Extra occupied floors above a rooftop are supported and preferred over faking
the penthouse as a prop. Future configurations may add more floor layers above
an intermediate roof while preserving the same zero-height stack rule.

## Materials and color calibration

- **Pale limestone/precast:** `pbr.limestone_smooth`, tint near
  `0xD3C5BA`, roughness approximately `0.72..0.88`, restrained normal
  strength no greater than `0.5`.
- **Warm soffit/reveal:** stable warm material near `0xB77948`.
- **Frames and rails:** charcoal or dark bronze near `0x343233`, slender and
  subordinate.
- **Glass:** neutral cool blue-gray near `0x4F6572`, opacity approximately
  `0.82..0.94`, roughness no greater than `0.09`, transmission
  approximately `0.35..0.65`, HDR environment intensity at least `2.5`.

Heavy grime, brick coursing, coarse ashlar joints and high-contrast procedural
wear are not appropriate.

## Uncertainties and allowed inference

- Rear elevation and exact depth are unseen. Rear bays may mirror the front
  structural spacing with simpler glazing.
- Corner fascia is softly eased in the images, but current wall/glazing
  topology remains planar and faceted until AI 539 is implemented.
- Exact balcony join shape, roof-guard construction, penthouse interior and
  planter species cannot be measured from the perspective images.
- Amenity population is a required visual direction, but absence of a
  deterministic supported prop must be reported rather than replaced with
  unrelated mechanical equipment.

## Catalog and evidence contract

- Configuration id: `terramar`.
- Export: `TERRA_MAR_BUILDING_CONFIG`.
- Display name: `Terra & Mar`.
- `getBuildingConfigById('terramar')` resolves the exact authored object.
- `getBuildingConfigs()` includes it exactly once.
- Variant configuration id: `terramar_recessed`.
- Variant export: `TERRA_MAR_RECESSED_BUILDING_CONFIG`.
- Variant display name: `Terra & Mar — Recessed Balconies`.
- `getBuildingConfigById('terramar_recessed')` resolves the exact variant
  object, while `getBuildingConfigById('terramar')` continues to resolve the
  unchanged original.
- Final comparison preserves all source copies under
  `tests/artifacts/screens/buildings/<catalog-id>/references/`.
- Final rendered evidence uses the building showcase with an HDRI as both
  visible background and reflection source.
- Evidence includes distinct exact 3840 x 2160 front, three-quarter and
  low-angle base-to-top views. An additional elevated view must make the
  intermediate terrace and penthouse relationship legible.
