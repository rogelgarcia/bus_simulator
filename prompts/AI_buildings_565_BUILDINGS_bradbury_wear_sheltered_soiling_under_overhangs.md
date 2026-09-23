# Problem

On a city building, surfaces that rain never reaches keep the soot that settles on them, while rain
rinses it off open surfaces. The ICOMOS-ISCS glossary describes black crust as a crust "developing
generally on areas protected against direct rainfall or water runoff in urban environment", and soiling
as a very thin deposit of particles such as soot. Blocken & Carmeliet (2013) note that "reduced rainwash"
in sheltered places is what lets the deposit stay. Miller (1994) placed dirt in the same way, where
accessibility is low.

On the Bradbury block the sheltered surfaces are:
- the undersides of the crown cornice, its coffers and dentils;
- the underside of the band between floors 4 and 5 and its brackets;
- the underside of the impost course;
- the window heads and arch soffits, and the portal's recess and vault;
- the recessed storefront heads;
- the underside of the fire-escape platforms;
- the wall just below each of these, fading as the overhang's shelter runs out.

Los Angeles smog is not coal soot, so this should read as soiling, not thick black crust. This is a
feature of the wear layer (AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf
- https://dl.acm.org/doi/10.1145/192161.192244

# Request

Add sheltered soiling to the wear layer: a soft darkening wherever the building's own geometry keeps the
rain off.

Tasks:
- The strength at each point follows how sheltered that point is from falling and wind-blown rain by the
  building's actual overhangs. It is strongest right under a projection, fades with distance below it,
  and is zero where the surface is open to the sky.
- The overhang's own depth sets how far down its shelter reaches, so a deep cornice shelters further
  down than a thin moulding.
- The gradients are smooth and follow the geometry. There are no patches or spots within them.
- Exposed wall stays clean, and the feature never darkens open brick at random.
- It works on every exterior material (brick, terracotta, stone, painted metal), darkening and roughening
  it within that material's own look.
- Share how the rain-exposure measure is computed with AI 566, the washed counterpart, so the two agree.
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/sheltered_soiling/` (gitignored).
- Soiling off and on side by side for `hero_3q`, `st_up` and `st_portal`, plus a close-up under the
  crown and one inside the portal.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_565_BUILDINGS_bradbury_wear_sheltered_soiling_under_overhangs_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_565_BUILDINGS_bradbury_wear_sheltered_soiling_under_overhangs_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
