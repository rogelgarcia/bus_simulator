# Terra & Mar Reference Facade

This document is the authored reference contract for the `terramar` Building
Fabrication 2 catalog entry, displayed as `Terra & Mar`. Measurements are
in meters.

The sole source image is
`downloads/references_ideas/b8.png` (1122 x 1402, 2,555,434 bytes, SHA-256
`EA6A43791C68CA199D43869833B8A7BC16AF7927FEC7010AD5147A47095D160B`).
The preserved comparison copy belongs under
`tests/artifacts/screens/buildings/terramar/references/`; the source must not be
renamed or altered.

The image is a near-front street-corner perspective with no scale marker, no
rear elevation and no roof plan. Dimensions below are authored targets inferred
from facade proportions and normal mixed-use storey heights, not claims about
a measured real building. The large planar corner cuts are intentional. They
must not be replaced by a circular bow merely because the balcony fascia has
softly eased edges.

## Massing and occupied floor stack

- The occupied stack is exactly seven floors and 25.85 m high:
  - one 4.8 m-high glazed retail and restaurant ground floor;
  - one 4.3 m-high upper podium restaurant or amenity floor;
  - five repeated 3.35 m-high residential floors.
- The podium outer bounds are exactly 28 x 22 m, centered at the origin with
  `x = -14..14` and `z = -11..11`.
- The residential wall bounds are exactly 25 x 19 m, centered at the origin
  with `x = -12.5..12.5` and `z = -9.5..9.5`.
- The residential walls are therefore inset approximately 1.5 m normal to
  every podium edge. Projecting balconies return approximately 1.5 m toward
  the podium outline, so their outside slab edge nearly aligns with the base.
- A zero-height podium-terrace finish layer may sit between podium and
  residential floors. It does not count as an occupied floor and must not own
  a third plan.
- The final roof follows the residential silhouette. There is no separate
  crown, penthouse floor or bulky mechanical cap.

The target visual height is approximately 27 m after the low roof parapet and
transparent guard are included.

## Layer silhouette ownership and topology

The podium and tower are centered, clipped octagons with eight stable planar
runs. Neither loop contains an arc. In front-to-back clockwise order, the
building-default podium loop is:

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

The five-floor residential layer owns one detached loop with corresponding run
identities:

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
side is 6.8 m. The rounded visual read comes from small edge bevels, balcony
fascia and guardrail continuity across these planar segments, not from curved
logical facade runs.

Layer ownership is:

1. The ground floor resolves `inherit_default` and uses the podium loop.
2. The upper podium resolves `inherit_previous` and retains that loop.
3. A podium terrace finish, when present, follows the resolved podium loop.
4. The five-floor residential layer owns the detached smaller loop.
5. The final roof follows the resolved residential loop.

This produces exactly one changed adjacent occupied-floor boundary:
podium-to-residential. The exposed podium top and tower underside must form a
watertight terrace/soffit pair without cracks, open edges, coplanar shimmer or
spatially guessed facade identities. All occupied floor layers use
`planOffset: 0`; the setback is authored in the detached loop coordinates.

## Ground-floor frontage and entrance

- The straight front run is a pale-stone sign and entrance plane. A broad
  recessed opening approximately 8-to-9 m wide contains a centered glazed
  double entrance with contiguous sidelights and a glazed transom.
- The entrance recess is approximately 0.3-to-0.5 m deep. Its soffit and inner
  jambs use the warm wood-tone accent rather than more pale stone.
- Full-height restaurant storefronts occupy the two front chamfers and
  continue around the short side runs. Slender charcoal frames divide each
  chamfer into two or three large panes.
- The ground glazing is approximately 3.4-to-3.8 m high and visibly
  transmissive. It should reveal the physical interior shell or a restaurant
  interior treatment rather than read as an opaque blue panel.
- Small, restrained dark awnings may sit above selected side storefronts.
  Street umbrellas, café tables, pedestrians and palms in the source are
  context, not part of the building mesh contract.

## Terra & Mar sign

Two separate dark bronze or charcoal lettering records are centered above the
main entrance on the straight front run:

1. `TERRA & MAR`, uppercase serif, approximately 0.50 m high;
2. `COASTAL KITCHEN`, uppercase, approximately 0.22 m high.

The main line sits above the subtitle. Both are shallow extrusions of roughly
0.04-to-0.07 m and share the ground entrance bay target so they remain centered
when the facade is solved. The words and ampersand are exact; the subtitle must
not be changed to “Coastal Estates” or omitted.

## Upper podium

- The second storey continues the pale-stone frame and full-height restaurant
  glazing at approximately 3.1-to-3.4 m clear height.
- The straight front contains one centered terrace or shallow balcony behind
  a transparent glass guard. A continuous low planter reads along its outer
  edge.
- Chamfer and side openings are broad two- or three-panel assemblies with
  aligned stone end piers. Their low planting ledges may be represented by the
  same restrained balcony or attachment system.
- The upper podium terminates in a strong pale-stone slab/parapet line. It is
  not a classical cornice and carries no ornamental molding.

## Residential facade rhythm and segmented wrap balconies

All five residential floors repeat one vertically aligned facade. The five
visible plan segments are the straight front `A`, the right chamfer `B`, the
right side `C`, the left side `G` and the left chamfer `H`.

- Every visible segment carries its own projecting glass-balcony bay. The
  balconies are segmented by the octagon's structural piers, while aligned
  slab fascia and guard heights make them read as one wraparound terrace.
- Balcony projection is approximately 1.5 m from the residential wall plane.
  Slab/fascia thickness is approximately 0.38-to-0.46 m.
- Guards are approximately 1.05 m high, with clear or cool-gray glass, a slim
  charcoal top rail and posts at approximately 1.3-to-1.7 m spacing.
- The straight-front opening is approximately 11.5 m between 0.6-to-0.7 m end
  piers and uses three or four glazing columns.
- Each front-chamfer opening is approximately 7.5 m between 0.5-to-0.6 m end
  piers and uses two or three glazing columns.
- Each short side opening is approximately 5.8 m between roughly 0.5 m end
  piers and uses two glazing columns. Rear treatment is inferred and may use a
  simpler matching rhythm.
- Glazing behind every balcony is a near-full-height 2.5-to-2.75 m slider
  assembly. Warm wood-tone side reveals and the exposed head band form the
  honey-brown shadow bands visible
  between the pale stone frame and cool glass.
- Pale vertical piers remain aligned through all five floors at every plan-run
  junction. Horizontal slab bands also remain aligned; randomized bay widths
  or staggered balconies are not reference-faithful.

The implementation may use the projecting glass balcony preset per run. If a
continuous repeated belt is also used to close the slab line, its balcony
platforms must not produce coplanar overlap or z-fighting.

## Materials and color calibration

The retained palette has four principal material reads:

- **Pale limestone/precast:** use `pbr.limestone_smooth` as the starting slot,
  with an authored tint near `0xD3C5BA`, roughness approximately `0.72..0.88`
  and restrained normal strength no greater than `0.5`. Representative lit
  source pixels are approximately `#D3C3B7`, `#D6C8BC` and `#DACDC3`.
- **Warm soffit/reveal:** use a supported fine material such as
  `pbr.bronze_anodized_panel` with a non-metallic-looking calibration or a
  stable color slot near `0xB77948`. Lit source samples range around
  `#B57541..#BD8352`; shaded faces naturally fall much darker.
- **Frames and rails:** charcoal or dark bronze near `0x343233`, with moderate
  metalness and roughness. Profiles stay slender and subordinate.
- **Glass:** neutral cool blue-gray near `0x4F6572`, opacity approximately
  `0.82..0.94`, roughness no greater than `0.09`, transmission approximately
  `0.35..0.65` and HDR environment intensity at least `2.5`. It must remain
  reflective and transmissive rather than opaque or mirror-black.

Material variation may be subtle, but heavy grime, brick coursing, coarse
ashlar joints and high-contrast procedural wear are not appropriate.

## Roof, railing and greenery

- The flat roof repeats the clipped residential silhouette.
- A pale parapet or fascia approximately 0.45-to-0.60 m high carries a clear
  glass or slender dark guard to an overall edge height of roughly 1.1 m.
- Low perimeter planting runs behind the guard, with sparse taller shrubs or
  small trees concentrated near corners and spaced roughly 4-to-6 m apart.
- Balcony planting is irregular but restrained: small pots tend to sit beside
  piers and at chamfer transitions, leaving circulation clear.
- No mechanical penthouse, classical cornice, dense rooftop equipment field or
  opaque tall roof screen is visible. Unavoidable inferred mechanical items
  should remain below the parapet and out of the principal views.

Greenery is a required visual target for final reference matching but is not a
substitute for the facade topology. If the available facade/roof prop system
cannot place it deterministically, that limitation must be called out rather
than changing the massing.

## Uncertainties and allowed inference

- The rear elevation and exact depth are unseen. Rear bays may mirror the front
  structural spacing with simpler glazing.
- The corner fascia is softly eased in the image, but the glazing and stone
  frame read as planar facets. Small mesh bevels are allowed; a single bowed
  facade or quarter-circle logical run is not.
- Balcony depth, roof-guard construction and planter species cannot be measured
  from the perspective image. Refinements within the stated ranges are allowed
  after showcase comparison.
- The apparent restaurant use comes from signage and furnishing. The building
  config need not encode gameplay occupancy.

## Catalog and evidence contract

- The configuration id is `terramar`, its export is `TERRA_MAR_BUILDING_CONFIG`,
  and its display name is `Terra & Mar`.
- `getBuildingConfigById('terramar')` resolves the exact authored object.
- `getBuildingConfigs()` includes that object exactly once.
- Final reference comparison preserves the source copy under
  `tests/artifacts/screens/buildings/terramar/references/`.
- Final rendered evidence uses the standard building showcase with an HDRI as
  both visible background and reflection source and includes distinct exact
  3840 x 2160 front, three-quarter and low-angle base-to-top views.
