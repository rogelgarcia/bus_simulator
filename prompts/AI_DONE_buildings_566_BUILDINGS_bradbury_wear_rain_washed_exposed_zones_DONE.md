# DONE — AI 566: rain-washed exposed zones

# Problem

Airborne dirt settles on a facade fairly evenly. The difference between clean and dirty comes from rain.
Wind-driven rain hits a facade hardest at its top edge and top corners (Blocken & Carmeliet 2013), and
projecting surfaces facing the weather are rinsed more than recessed ones. Where runoff crosses soiled
surfaces it rinses light streaks into them: "white washing". Together with dirt washing (AI 564) this
gives "differential surface soiling", the characteristic light-and-dark rhythm of an old facade.

On the Bradbury block the washed zones are:
- the top edge of every facade and the corners of the block;
- the fronts of the projecting piers, columns and corner pavilions;
- the upper faces of the crown;
- light streaks where runoff crosses areas that are otherwise soiled.

Without this counterpart, soiling alone (AI 565) makes a facade look uniformly dull. This is a feature
of the wear layer (AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf

# Request

Add rain-washed zones to the wear layer: the parts of the facade that rain keeps cleaner than the rest,
and the light streaks that runoff rinses into soiled surfaces.

Tasks:
- Exposure to wind-driven rain decides where the facade is cleanest: the top edge and top corners of each
  face, and the fronts of projecting elements. Use the same rain-exposure measure as AI 565, so the
  cleanest and the most soiled areas are consistent with each other.
- Washed zones read slightly cleaner and brighter than the general facade. The change is small, a matter
  of degree against the rest of the wall, never a bleached patch.
- Where water runs across a soiled area, it rinses a lighter streak along its path, starting from a
  physical source.
- If a very light, uniform (never mottled) atmospheric film is needed for the washing to have something to
  remove, add it as its own control, off by default.
- No washed marks without an exposure or runoff reason, and no effect on glass.
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/rain_washed/` (gitignored).
- Off and on side by side for `hero_3q`, `st_corner` and `st_up`, with AI 565 on in both halves so the
  contrast between shelter and wash can be judged.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_566_BUILDINGS_bradbury_wear_rain_washed_exposed_zones_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_566_BUILDINGS_bradbury_wear_rain_washed_exposed_zones_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary

- Added the wear feature `washed` (`wear/features/washed.py`, registered in `wear/registry.py`, ORDER 225, cyan in the debug view): the zones the rain keeps cleaner and the light streaks runoff rinses into soiled surfaces, byte-identical from one build to the next, in about 1.5 s.
- Used AI 565's rain-exposure measure (its `open` times its wind `catch`), refined in the feature's own copy for the projecting fronts: a front standing proud of the recessed brick field catches up to 35% more of the rain, so the piers, columns, corner pavilions, the band and the crown measure as more exposed than the bays between them.
- Washed by the dirt balance against the general facade (the median exposure of the open masonry): a surface receiving E is cleaner by 1 - E_gen / E, normalised to 1 at the most exposed masonry; a third of the masonry is washed at all, rising up the fronts toward the top edge and the corners, nothing at or below the general level.
- Settled where the wash meets the soiling by the same balance: at the top edge the crown's fascias take more rain than the general facade although their members shelter each other a little, so the wash takes 565's light soiling back off there; where the shelter is heavy the exposure is below the general level and 565's soiling stands whole.
- Added the rinse (white washing) with its own reason, apart from 564's dirt washing: a stream of 564's that runs through a zone 565 soils heavily keeps its core clean there, soiling and deposit alike, and leaves its dirt at its rims and below the zone; the band's 186 brackets' streams (with the brackets' own fronts, their conduits) and 8 sill ends under 3rd Street's fire-escape platforms; curtains stay 564's.
- Declared 532 sources and 537 marks with 194 paths: 328 projecting fronts, the block's 5 corners (10 marks), 5 top edges and 194 rinsed streams; the crown's upper faces washed in the shader by their orientation.
- Added the look: masonry a little brighter and more saturated toward its own colour, the joints keeping a share of their dirt, 564's streaks keeping their contrast on a washed wall; glass, metal, paint and wood untouched; and the optional uniform atmospheric film (`wear_washed_film`, off by default) that the wash and the rinse take off.
- Calibrated in rendered pixels: washed fronts +3% in sun and +9 to 10% in shade at floor 4 and above, about 1% at floor 2; a column's front against the spandrel beside it 1.07 to 1.10 in sun against the 1960 HABS photo's 1.04 to 1.06; a rinsed core under the band from 0.63 to 1.25 of the soiled wall beside it.
- Extended the framework, backward compatibly: every feature group gets `Clean Color` and `Clean Roughness`, the surface as the deposits find it (the state entering ORDER 200); the probe, runoff and soiling masks build byte-identically.
- Published `exposure`, `wash`, `rinse` and `fronts` for the features that follow (573).
- Proved the off switch at the render noise floor against the pre-wear renders on all five cameras and `wear_washed=0` against AI 565's own stills, left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/rain_washed/`.
- Documented the feature and the framework's new inputs in the BradburyBlock README ("Rain-washed exposed zones (AI 566)").

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." The audit found the pattern in the
rinse: every bracket under the band carried the same light tongue with crisp dark rims, a trickle as clean as a heavy
stream, 113 of 179 to the same 0.24 m, and the conduit had become an off-centre stripe on every console front. The wash
of the exposed fronts is a continuous field of the geometry's with no step inside a front, and was left as it was.

- Each rinsed stream now rinses as its own water (564's draw: how clean, and how far into the zone) and its own seeded
  line (how broad and soft, and how clean) say, with a soft edge instead of a cut and the conduit over the bracket's
  whole front, gathering into the stream at its exit; trickles and 564's dry brackets rinse nothing (159 streams, from
  187: 152 brackets 0.04 to 0.30 m, 7 sill ends), the wash channels, the published `exposure`, `wash` and `fronts` are
  unchanged, and every other feature, mortar erosion (573) included, rebuilt byte-identically.
