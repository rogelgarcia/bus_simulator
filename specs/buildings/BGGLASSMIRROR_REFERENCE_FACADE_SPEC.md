# BGGlassMirror Reference Facade

This document is the authored reference contract for the `bgglassmirror`
Building Fabrication 2 catalog entry. Measurements are in meters.

The sole source image is
`downloads/references_ideas/bglassmirror.png` (1122 x 1402, 2,312,160 bytes,
SHA-256
`A6FC40DFA18F58271EF3CBDF86E751910EEA403E782EBAC38F153E8E4DDC05E8`).
The catalog id intentionally contains `bgglassmirror`, while the original
reference filename contains `bglassmirror`; the source file must not be
renamed or altered.

The photograph is a near-front perspective with no scale marker and no usable
rear elevation. Dimensions other than the 44 m-wide design target are inferred
from facade proportions and standard office-storey heights. They are authored
targets, not claims about a measured real building. Coordinate refinements are
allowed when reference renders expose a better fit, provided the stable
topology, layer ownership, curve hierarchy, and facade rhythm below remain
unchanged.

## Massing and occupied floor stack

- Overall authored width is exactly 44 m.
- The base body is approximately 24 m deep. The middle-office bow projects about
  3 m beyond its shoulder chord, producing an approximate maximum depth of 27 m.
- The occupied stack is exactly 16 floors and 63 m high:
  - one 5.2 m-high lobby floor;
  - one 4.2 m-high podium floor;
  - thirteen 3.8 m-high office floors;
  - one 4.2 m-high crown floor.
- A roof layer closes the stack above the crown and uses the crown silhouette.
  The roof layer does not author a separate silhouette.
- The tall lobby, repeated office bands, and single crown floor are inferred
  from the image. The exact real-world floor count is not independently known.

## Layer silhouette ownership

The building deliberately exercises Building Fabrication 2 per-floor
silhouette transitions. Its building-default footprint is the largest
middle-office silhouette rather than the first layer's footprint.

1. The lobby owns a detached flat rectangular silhouette.
2. The podium uses `inherit_previous`, remaining identical to the lobby.
3. The thirteen-floor office layer uses `inherit_default`, resolving the
   building-default six- or eight-run bowed silhouette.
4. The crown owns a detached full-width flat-front silhouette.
5. The roof follows the already-resolved crown silhouette.

The stack therefore has exactly two changed adjacent-floor boundaries:
podium-to-office and office-to-crown. The first must expose/close the differing
podium and office plans; the second must stop the stronger middle-office curve
below the crown. At both boundaries the lower top cap and upper transition
underside must form a watertight terrace/soffit pair without cracks, open wall
edges, coplanar shimmer, or an invented cross-layer facade identity.

These changes are silhouette ownership changes, not `planOffset` substitutes.
The lobby, podium, office, and crown remain centered on the same authored
building axis.

## Building-default six- or eight-run office plan

The default outer loop is a simple clockwise silhouette with stable
`cornerId`, `runId`, and `runForward` metadata. The preferred reference-faithful
topology has six runs: three authored front runs followed by the right side,
back, and left side. An eight-run variant may retain two short connector runs
when that produces cleaner tangent joins without changing the visible
proportions.

In front-elevation order, the primary front is:

1. a straight left shoulder occupying about 30 percent of the facade and
   carrying the recessed loggia stack;
2. one central convex circular-arc run occupying about 56 percent of the
   facade and offset to the right of the building center;
3. a straight right shoulder occupying about 14 percent of the facade.

In the six-run form, the shoulders and the central arc share one front chord;
the point records preserve the shoulder/arc boundaries as authored logical
runs. In the eight-run form, one short connector may sit on each side of the
arc. The central arc, and any connectors used, are first-class plan runs;
facade bay depth must not fake or replace the main bow. Tessellation of the arc
remains geometry detail and must not create extra logical faces, windows,
mullions, or opening cuts.

The inferred design target assigns approximately 24.6 m of the 44 m-wide front to
the central arc chord, with about 3 m of outward sagitta. This corresponds to a
minor-arc bulge magnitude near `0.244`; its sign is determined by the clockwise
loop traversal. The 30/56/14 split places the chord midpoint about 3.5 to the
right of the building center. Exact endpoints may move during reference
matching, but the arc must remain visibly right-offset and narrower than the
full facade.

## Crown silhouette

The crown is not allowed to inherit the office loop. It owns a detached,
full-width flat-front silhouette with no circular run. The stronger central
curve therefore terminates completely below the crown instead of weakening
into another bow. The roof, screen, and roof edge follow this crown loop.

## Pale structural frame and horizontal bands

- The exposed structural frame reads as pale cool limestone or precast
  concrete, not bright emissive white and not dark structural metal.
- Vertical shoulder piers, central-arc jambs, window dividers, and horizontal
  floor bands use one coherent pale-stone material slot.
- Every repeated office floor ends in a continuous horizontal stone belt that
  follows the straight shoulders, connectors, and sampled circular arc.
- The Burban upper-divider proportions are the starting calibration: about
  0.56 m high and 0.12 m proud of the glazing plane. Small adjustments are allowed
  to match the image, but the bands must remain visibly structural and
  continuous around the bow.
- Stone surfaces should remain rough enough to separate from the mirror glass
  under an HDR environment. Fine-scale normal response is acceptable; coarse
  masonry or brick coursing is not.

## Mirror curtain wall

The office and crown glazing use dark blue, reflective, partially
transmissive mirror glass based on the accepted Burban calibration:

- opacity: `0.84`;
- tint: `0x485965`;
- metalness: `0.72`;
- roughness: `0.035`;
- transmission: `0.26`;
- IOR: `1.7`;
- environment-map intensity: `3.4`;
- glass z offset: `-0.025`.

Dark metal frames start from Burban's `0.32` roughness, `0.62` metalness,
`1.1` environment intensity, and restrained profile widths. Exact tint and
frame dimensions may be tuned, but the upper glass must remain blue-dominant,
highly reflective, non-opaque, and visibly responsive to the showcase HDRI.

The lobby uses clearer, more transmissive glass than the offices, with a
centered glazed entrance and slender dark or silver-gray framing. The solid
left lobby panel may carry the visible `120` address from the reference.

## Left-front loggia stack

- The office layer contains a semantically named `loggia` or `balcony` bay on
  the left-front shoulder.
- The front loggia is the final bay on its facade run and reaches the exterior
  corner. Its negative depth makes the adjoining side-wall corner join begin
  behind the notch, leaving the balcony open on that side.
- No full-depth wall or broad structural pier may close that outer corner. The
  regular left-side curtain wall continues from the recessed corner join.
- Its wall plane is materially recessed behind the pale frame, creating the
  repeated deep shadow slots visible in the reference.
- Because the office layer repeats thirteen times, one authored loggia rhythm
  produces a vertically aligned thirteen-storey stack.
- The recess keeps pale-stone side reveals and a transparent/reflective glass
  guardrail or equivalent low frontage. It must not read as a flat dark window
  texture pasted onto the main wall.

The photograph does not establish the recess depth. A target in the
approximately 1.4-to-2.0 m range is appropriate, subject to visual comparison
and opening-clearance constraints.

## Sides, rear, and roof

- Unseen side and rear details are inferred. They should continue the pale
  frame and dark curtain-wall language with a simpler deterministic rhythm.
- The roof edge is flat and restrained, with no classical crown, dentils, or
  projecting ornamental cornice.
- A low dark louver/screen mass and small mechanical bulkhead reproduce the
  rooftop silhouette. They sit on the crown-following roof rather than
  creating another occupied floor or another silhouette owner.

## Catalog and evidence contract

- The configuration id is `bgglassmirror`.
- `getBuildingConfigById('bgglassmirror')` resolves the exact authored object.
- `getBuildingConfigs()` includes that object exactly once.
- Final reference comparison must preserve the original source and copy it to
  `tests/artifacts/screens/buildings/bgglassmirror/references/`.
- Final rendered evidence must use the standard building showcase with an
  HDRI as both visible background and reflection source and include distinct
  3840 x 2160 front, three-quarter, and low-angle base-to-top views.
