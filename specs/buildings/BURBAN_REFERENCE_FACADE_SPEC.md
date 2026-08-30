# Burban Reference Facade

This document is the authored reference contract for the `burban` Building Fabrication 2 catalog entry. Measurements are in meters.

## Massing and floors

- The footprint retains 36 × 28 overall bounds.
- The front-right face `B` is a quarter circle with radius 12 and three structural bays.
- The front-left face `F` is an independent quarter circle with radius 4 and one structural bay.
- The straight front face `A` between the tangent points is 20 wide.
- The building contains two 5-high podium floors and six 3.2-high upper floors.

## Lower facade grids

Ground and second floors use identical stone-pillar positions. Every lower window assembly is inset 0.76 behind the facade plane while the pillars project 0.12, producing a 0.88-deep reveal without stepping the wall strips.

- Face `A`: 0.9 end pillar, 10.5 entrance span, 1.2 pillar, 6.5 outer storefront span, 0.9 end pillar.
- Face `B`: 0.8 end pillar, 5.5 glass, 0.8 pillar, 5.2 glass, 0.8 pillar, remaining 4.9495559215 glass, 0.8 end pillar.
- Face `F`: 0.8 end pillar, remaining 4.6831853072 glass, 0.8 end pillar.

On face `A`, the entrance span uses `prefer_expand` and must never duplicate. The outer storefront plus its outer anchor pillar is the repeatable group. Stone pillar widths remain fixed.

## Storefront anatomy

- The ground floor is 5 high.
- The 10.5-wide entrance span is contiguous glazing: a 5-wide central double-door group between two 2.75-wide glazed sidelights, with no wall nibs between assemblies.
- The ground-floor door zone is 3.5 high with a 1.5-high glazed transom.
- The double-door leaves have one meeting-stile divider, no leaf muntins, prominent metal frames and 0.30-high solid kick panels.
- One oversized pull is visible on each leaf. The pulls use a 3× authored scale and are centered 1 above the outer door bottom.
- The black Urban Wear panel occupies the bottom 1.5 of the second floor above the entrance.
- The remaining 3.5 of that second-floor entrance span is glass.
- Other ground-floor top zones remain glass with black perimeter framing.
- The entrance is the first face-`A` opening beside the tangent to face `B`; the following bay is already curved.
- The second floor repeats the same glass and pillar positions at a full 5 height.
- Every non-sign second-floor window has a horizontal frame exactly 1.5 above its bottom, aligned with the top of the sign panel.
- No concrete belt divides the first and second floors. The only concrete separator is above the second floor.
- Lower pillars project 0.12 from the wall plane while the window assemblies are inset 0.76 using opening depth rather than a stepped bay wall.
- The second-to-third-floor concrete separator is 1.2 high, matching the dominant front pillar width. It follows the pillar profile with zero added extrusion, so no capital or cornice lip appears at pillar intersections.

## Upper curtain wall

- All upper vertical stone strips are uniformly 0.36 wide. Interior strip centerlines inherit the lower structural-pillar centerlines, so the glass spans may differ rather than shifting the structure to equalize them.
- The areas between those strips are continuous window placements, divided only by tiny metal mullions.
- The recurring upper floor separator is 0.56 high—twice its earlier thickness—and projects 0.12.
- Dark 0.22 metal panels appear above and below each upper window row.
- The upper glass is dark, highly reflective, partially transmissive mirror glass with a restrained blue tint and no parallax backing.
- Lower glass remains highly transmissive but carries a darker metallic reflection under the HDR environment.
- Pillars, concrete separators and upper wall strips use the same calibrated rough-concrete PBR slot. Its 0.35 texture tiling and subdued 0.35 normal strength keep the grain fine rather than coarse; the shared wall-base calibration prevents belts from rendering as a different texture.
- The roof edge is plain: no projecting cornice, crown molding, coping stack or dentil/teeth ornament.

Both curved faces bend the complete window placement. Curvature must add geometric subdivisions to the pane instead of increasing the authored repeat count or reducing the authored window width.
