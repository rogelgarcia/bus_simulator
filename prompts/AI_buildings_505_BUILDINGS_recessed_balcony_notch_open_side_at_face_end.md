# Problem

A recessed balcony bay (negative depth + `balcony.placement: 'recessed'`)
placed at the END of a face renders with its corner-side face OPEN: no glass
infill, no wall — you look straight into the notch from around the building
corner and see the notch interior (parallax panel, floor slabs) edge-on.

AI 489's side covers are adjacency-driven: "sides that abut wall get no infill,
air-facing sides get the configured infill". At a face-end bay the outer side
has no same-face neighbour and is treated as wall-abutting, but at a building
corner there is no wall there — the notch cuts right through the corner mass
and the side faces open air. `ModernResidential2` avoids the hole by pairing a
recessed bay at the end of face A with one at the start of face B ("the notch
opens around the corner"), which suggests the corner case was designed around
rather than solved.

Two user-visible symptoms on the showcase Garden Court building (reported by
the user reviewing images 19 and 23, 2026-08-26 — "balcony missing side
window", "missing side glass"):

1. The edge balconies' side glass is missing — the notch columns at both ends
   of the front face are open toward the side street.
2. "A strange texture on the side of the window behind the fire escape": what
   reads as a defective texture patch beside the face-B window is actually the
   A-face notch INTERIOR (its dark parallax panel seen edge-on) showing through
   the open notch side, behind the fire escape.

Evidence (tests/artifacts/screens/showcase/):

- `probe_notch_corner.png` — the AB corner from the B side at floor height: the
  notch column is open, interior panels and slab edges visible in section.
- `showcase_23_garden_court_closeup_side_b.png` — the reported view: open notch
  sides at the left edge and the "strange texture" beside the second-floor
  window behind the fire escape.
- `showcase_19_garden_court_corner.png`, `showcase_22_garden_court_closeup_balconies.png`
  — the same notches from the front/corner.

Reproduction: Garden Court showcase config
(`tests/headless/visual/specs/_showcase_model_configs.js`, `GARDEN_COURT_CONFIG`),
face A `floor_gc2` bays `bay_1`/`bay_9`: fixed 2.6m, `depth -1.4`,
`balcony.modern_recessed`, at the first/last position of the face.

# Request

Close the notch side at a face end. The side cover adjacency test must ask
whether wall GEOMETRY actually abuts the notch side — at a face end that means
checking the adjacent face's wall run at the notch's depth range — instead of
assuming "no same-face neighbour = wall". When the side faces air, emit the
configured side infill (glass/railing) or a solid notch side wall. Keep the
`ModernResidential2` around-the-corner pairing working (two notches meeting at
a corner still leave their shared side open to each other).

## Delivery requirements
- Engine 2 only.
- Before/after screenshots of a corner notch from the side street, plus the
  around-the-corner paired case as a no-regression shot.
