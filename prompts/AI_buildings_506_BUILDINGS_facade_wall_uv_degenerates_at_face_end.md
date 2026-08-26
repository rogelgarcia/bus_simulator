# Problem

On the facade wall, the wall texture's U mapping is anchored PER BAY STRIP and
breaks down toward the trailing end of a face:

1. Texture U resets at strip boundaries. A UV dump of the Garden Court garage
   face (B, 13m, footprint 22x13) at mid-height shows each strip's U running
   from its own width down to 0 instead of continuing the face's run:
   garage bay z∈[4.95..1.75] → u 3.2→0, window bay z∈[0.4..-1.6] → u 2→0,
   window bay z∈[-2.95..-4.95] → u 2→0. Whether a seam is VISIBLE depends on
   whether the strip width happens to be a multiple of the texture period, so
   the defect surfaces intermittently (the 3.2m garage bay against 2m-period
   ashlar shows it; 2.0m window bays hide it).
2. Near the face's trailing end the mapping collapses entirely: the last
   ~1.5-2.5m of wall before the BC corner renders as ONE smeared texel column —
   a flat pale strip with no block pattern. The smear also surrounds the last
   window, which then reads as a window "wider than the wall" (its white
   surround appears to continue onto the smeared wall).

Geometry is NOT at fault — a probe confirms the ground facade wall covers the
full face (one contiguous span z∈[-6.5, 6.5]) and the last window's cut ends
1.75m before the corner. Material variation is NOT at fault either: the flat
strip and the oversized-window read persist with `materialVariation` disabled
(unlike the diagonal smearing filed as AI_buildings_504, which disappears).

Reported by the user reviewing showcase image 23 ("windows using more width
than the wall, and a strange texture when it is overflowing"). Found 2026-08-26.

Evidence (tests/artifacts/screens/showcase/):

- `probe_bc_corner.png` — straight-on close-up of the B face's last two windows
  and the BC corner: flat smeared strip from the last window to the corner; the
  last window's surround reads much wider than the first's.
- `probe_bc_corner_novar.png` — SAME view with material variation off: crisp
  ashlar everywhere else, the flat strip and oversized-window read remain.
- `showcase_23_garden_court_closeup_side_b.png` — the user's review framing
  (right of the garage, toward the corner).

Reproduction: Garden Court showcase config
(`tests/headless/visual/specs/_showcase_model_configs.js`, `GARDEN_COURT_CONFIG`),
`floor_gc1` face B: `[flex 0.9-2.0, garage 3.2, flex 0.7-1.6, window 2.0,
flex 0.9-2.0]` with a `[bay_3, bay_4]` auto-repeat group, face length 13m,
material `pbr.rusticated_ashlar` via the `base` slot. The layer has no per-bay
material overrides, so this is the plain single-material wall path.

# Request

- Make the facade wall's texture U continuous along a face for strips that
  share a material: the strip ranges' `uvStart` should carry the accumulated
  run (the AI 483/491 continuity rules), not restart at 0 per strip — and find
  why this face resets it (single-material faces with no explicit overrides
  may be taking a different path than faces with authored per-bay materials).
- Find and fix the trailing-end collapse: identify which segment(s) produce the
  constant-U smear across the last stretch of the face and why (suspect the
  trailing flex strip and/or the last window bay's sub-panels resolve an
  override whose mapping yields uAtA == uAtB).
- Unit-level guard over generated wall UVs, in the spirit of the AI 502 test:
  for a single-material face `[flex, opening, flex]`, texture U must advance
  monotonically (no resets, no zero-span panels) across the whole face.

## Delivery requirements
- Engine 2 only.
- Before/after of the Garden Court garage face corner (the two probe framings).
