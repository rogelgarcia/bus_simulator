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
