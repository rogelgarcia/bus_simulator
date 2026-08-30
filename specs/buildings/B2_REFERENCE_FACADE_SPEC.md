# B2 Reference Facade

This document is the authored reference contract for the `b2` Building Fabrication 2 catalog entry. Measurements are in meters. The visual target is `downloads/references_ideas/b2.png`.

## Massing and floor stack

- The tower has a rectangular 18-wide front and 16-deep footprint.
- The occupied street facade comprises a 4.4-high lobby, a separate 1.35-high address and clerestory band, and six 4.25-high office floors.
- The catalog-level occupied-floor count remains eight: the lobby and address band form the first two authored floor layers, followed by the six office floors.
- Face `A` is the front. Face `B` establishes the side treatment; the rear and opposite side may inherit their corresponding rectangular facade rhythms.

## Continuous stone frame

- Every occupied facade is bounded by two fixed 1.05-wide pale stone end piers.
- The piers remain aligned through the lobby, address band, and all six office floors. They do not resize to absorb facade-fill error.
- Each pier projects 0.16 from the wall plane.
- The front clear span between the piers is exactly 15.9. The side clear span is exactly 13.9.
- Glazing is recessed 0.45 from the wall plane, producing a 0.61-deep reading relative to the pier faces.

## Lobby and address band

- The 15.9-wide front lobby glazing is divided into 5.25, 5.4, and 5.25 spans.
- The middle 5.4 span is the principal glazed entry. The outer spans remain storefront glazing.
- Each side uses one 13.9-wide glazed storefront between the end piers.
- The 1.35-high band above the lobby preserves the same outer-pier alignment.
- Its front middle bay is authored as `address_center`, aligned over the principal entry.
- Raised facade lettering reads `1200` and targets `A:address_center` on `floor_b2_address`.
- Glazed clerestory spans flank the address panel and continue on the sides.

## Office curtain wall

- `floor_b2_office` repeats exactly six times at 4.25 per floor.
- The 15.9-wide front clear span contains nine contiguous individual office windows, each `15.9 / 9` wide and recessed 0.45.
- The 13.9-wide side clear span contains eight contiguous individual office windows, each `13.9 / 8` wide and recessed 0.45.
- Every office module owns its own frame and glass. There are no solid masonry or dark-trim filler bays between the windows.
- The office base layer uses the pale stone slot, preventing broad dark structural returns. Each individual opening uses the curtain slot only on its narrow recessed jamb, so those reads join the thin dark window frames and 0.24-high spandrel bands rather than becoming additional pillars.
- Four stable soft, clear, lit, and cool window definitions cycle across each facade, keeping every module separately authored without attaching an interior atlas.
- Across six repeated office floors, the front therefore renders 54 individually framed office windows rather than six floor-wide panels.

## Rooftop terrace and pavilion

The rooftop silhouette is expressed entirely through ordinary BF2 layers rather than a custom rooftop descriptor.

- `floor_b2_terrace_slab` is a 0.45-high slab with `planOffset: -0.25`, creating the projecting terrace edge.
- `floor_b2_pavilion` is a 4-high glazed pavilion with `planOffset: 1.4`, setting it back from the terrace slab.
- `floor_b2_canopy` is a 0.32-high slab with `planOffset: -0.35`, extending beyond the pavilion glass.
- `floor_b2_guardrail` is a 1.05-high transparent glass guardrail with `planOffset: 0.12`.
- `roof_b2` closes the stack above the guardrail.

## Burban calibration

- The slender piers keep `burban`'s solid projected-frame character but use a rough, warm off-white concrete finish so they remain visibly pale under BF2 lighting.
- Lobby and clerestory glazing use Burban's clear, transmissive lower-glass calibration without parallax backing.
- Office and pavilion glazing use Burban's dark blue reflective curtain-glass calibration without parallax backing.
- Dark metal window frames retain Burban-calibrated material response and restrained profiles; only the two outer structural piers remain solid, and both use the pale stone slot.
- The glass guardrail stays transparent and reflective rather than becoming an opaque parapet.

## Catalog contract

- The configuration id is `b2`.
- `getBuildingConfigById('b2')` resolves the exact authored configuration.
- `getBuildingConfigs()` includes the same configuration object once.
