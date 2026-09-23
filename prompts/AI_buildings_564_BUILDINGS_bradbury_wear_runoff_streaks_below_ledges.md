# Problem

The Bradbury block has none of the dark vertical streaks that rain draws down an old masonry facade.
Rainwater collects on horizontal projections and leaves them at particular places. It runs off both
ends of a sill, and it creeps along the underside of any projection that has no proper drip, then down
the wall. On the way it picks up deposited dirt and leaves it behind as a dark streak: "dirt washing".
The omission of drips from projecting horizontal elements is one of the most common reasons for dirt
marks on facades (Blocken & Carmeliet 2013, citing Robinson & Baker). Dorsey, Pedersen & Hanrahan
(SIGGRAPH 1996) simulated exactly these flow stains.

On this building the sources are:
- both ends of every window sill on floors 2 to 4 (the top floor's windows have no sills);
- the drip line of the band between floors 4 and 5 and of its brackets;
- the impost course and the capitals at the top floor's springing;
- the crown cornice;
- the ground floor's string course and the portal's crown moulding.

This is a feature of the wear layer (AI 563) and follows its rule #1: no placement by noise, and every
streak traceable to its source.

Sources:
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf
- https://history.siggraph.org/learning/flow-and-changes-in-appearance-by-dorsey-pedersen-and-hanrahan/

# Request

Add runoff streaks to the wear layer: dark streaks that start at the places where ledges shed water and
run down the wall below them.

Tasks:
- Each sill sheds a streak from each end: two per sill, the classic pattern. A projection without a drip
  sheds along its drip line instead, a softer and broader curtain.
- A streak starts at its source as wide as the part that sheds the water and runs straight down the wall.
  It spreads a little, fades as it descends, and stops at the next element that catches or throws off the
  water (the window head or sill below, the band, the string course).
- A streak's strength and length follow how much water its source collects: a long ledge's run, a sill's
  own length. Streaks under the same kind of source match each other and differ only for physical
  reasons.
- A streak's ragged edges follow the wall's own structure: water hangs at bed joints and spreads along
  them. Its edges are not shaped by a noise function.
- On brick a streak reads as darker and a little greyer; on terracotta and stone as the equivalent; all
  matte. It never hides the brick pattern under it.
- No streak without a source, none on glass or metal, and none continuing through an opening.
- Own strength control through AI 563; zero removes every streak; visible in the debug view with its
  source.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/runoff_streaks/` (gitignored).
- Streaks off and on side by side for `st_corner`, `st_along` and `st_up`, plus one close-up of a sill
  pair and one of the band's drip line.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_564_BUILDINGS_bradbury_wear_runoff_streaks_below_ledges_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_564_BUILDINGS_bradbury_wear_runoff_streaks_below_ledges_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
