# DONE — AI 564: runoff streaks below ledges

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

## Completion summary

- Added the wear feature `runoff` (`wear/features/runoff.py`, registered in `wear/registry.py`, ORDER 220, blue in the debug view): 684 sources found on the built model, each with one mark and its traced path, in a 2 cm two-channel atlas mask that rebuilds byte-identically in about 7 s.
- Added sill-end streaks: both ends of all 78 sills on floors 3 and 4 (156), down the window strip's jamb corner in the deep field and straddling the end on the raised stretches, their strength, length and width following the sill's length and height.
- Added the drip-line curtains of the crown cornice, the impost course, the band between floors 4 and 5, the ground floor crown, its string course and the portal crown moulding over the three portals, found as runs where each course overhangs a wall; their strength follows how far the course stands out and how much of its water creeps back along its soffit rather than dripping clear.
- Added streaks from the band's 186 brackets and from the capitals, 22 under the band and 42 at the top floor's springing: the conduits that carry the courses' water down to the wall.
- Decided the second floor physically: its windows stand on the ground floor crown's continuous foot, so its water leaves in that crown's curtain, heavier below each window, instead of as sill-end pairs.
- Added the path tracer: each streak column follows the film down the elevation (fire escapes looked through), creeping round shallow heads and stopping where a ledge catches it, an edge or opening throws it off, or glass, frames or metal begin.
- Added the look: darker, greyer and matte masonry with a crisp face edge that runs further out along the bed joints and their lips and holds on longer in the joints, so edges and ends break up course by course; nothing is noise, and the stone's cloudy grain is deliberately not used.
- Extended the framework, backward compatibly: the Bed surface signal (bed joints and the lip under them, from the brick set's own height map), and a fix so a flat packed AO (the terracotta trim's) gives a flat Grain instead of speckle.
- Calibrated in rendered pixels against the 1960 HABS Broadway bays (clean sunlit spandrels) and the colour photo of the portal frieze's streaks: a sill streak's core reads 0.84 of the clean brick in sun and 0.64 in shade.
- Published the runoff for the features that follow (566, 569, 573): its sources, streaks, drip lines and a 4 cm field of the deposit.
- Proved the off switch and zero strength at the render noise floor against the pre-wear renders, and left the canonical scene, the wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/runoff_streaks/`.
- Documented the feature in the BradburyBlock README ("Runoff streaks below ledges (AI 564)") and the framework's new Bed input.

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." The audit found the pattern here too:
every sill shed the same two streaks and every bracket and capital the same streak, each kind of the 684 at one length,
width and strength.

- Each sill end, bracket and capital now sheds its own seeded share of the water (a sill's fall splits it between its two
  ends, a sound or an open joint at each end, the tenant's dirt; a bracket's or capital's water and the part of its foot
  it leaves over), which sets its streak's value, e-fold and width: most a little lighter, about one in four heavier, 14
  of the 684 sources nothing at all; the band's, the impost's and the portals' moulding runs and the ground crown's
  windows draw their own curtains too, while the crown, the string course, the paths, the stops and the look are
  unchanged, and washed (566), efflorescence (569) and mortar erosion (573) took the variation up on their rebuild.
- Critique round 2 (2026-09-25): the fresh-eyes review found the capitals still one stamp: shed as a sheet over part
  of the foot, every column capital hung the same flat-topped panel on its shaft (about 0.5 m wide, full strength across
  it, straight sides following nothing; 19 of the 22 read alike on the 4K elevations), and the springing capitals the
  same rectangle inside their mullions. A capital's water now leaves its foot by one to three drips of its own, at a
  corner of the foot or anywhere along its front, each a narrow streak with the lateral profile and the spread (its
  edges break on the bed joints, it starts at its drip and keeps to the shaft or mullion it leaves onto); each capital
  draws its water (dry 30% of the time under the band, 25% at the springing, otherwise one uniform over 0.15 to 1.60)
  and its drips' number, places and shares, so one shaft carries a clear streak, the next a trace, the next nothing.
  Only `runoff.py` changed: one source and one streak per drip are published with the same keys, washed (566),
  efflorescence (569) and mortar erosion (573) followed on their rebuild with no code change and every other feature
  stayed byte-identical.
