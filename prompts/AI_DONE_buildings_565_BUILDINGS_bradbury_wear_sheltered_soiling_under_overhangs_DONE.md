# DONE — AI 565: sheltered soiling under overhangs

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

## Completion summary

- Added the wear feature `soiling` (`wear/features/soiling.py`, registered in `wear/registry.py`, ORDER 200, violet in the debug view): the soft darkening wherever the building's own overhangs keep the rain off, from a rain-exposure measure taken on the built model, byte-identical from one build to the next, in about 6 s.
- Added the rain-exposure measure: 77 wind-driven rain directions swept down a 5 cm elevation of every face (1.6 million rays, the fire escapes looked through and their platforms laid back in as slabs) as a horizon map, giving each surface the street sees the share of the rain that reaches it.
- Counted only what overhangs for the shelter (a surface blocks rain only where it stands out over something below it before anything carries it), so the shelter is strongest right under a projection, fades below it as far as the projection's own depth reaches, and is zero on open walls; the proud piers' inside corners are left clean, not darkened like ambient occlusion.
- Soiled every underside by its own orientation in the shader (the rain model's own fall-off with the tilt): the soffits of the crown, its coffers and dentils, the band and its brackets, the impost course, the window heads and arch soffits, the portal's vault, the storefront heads and the fire escapes' platforms.
- Traced 1479 drip edges as the sources, every sheltered texel a mark from the first one above it, each drawn in the debug view with a path down to where its shelter fades; a depth channel in the 5 cm mask keeps the fire escapes' bars and the front edges of deep projections from taking the wall's shelter.
- Added the look: darker, duller, grey-brown and matte within each material's own colour, the brick's mortar joints holding a little more; masonry in full, painted metal and paint in part, the portal's glazed brick and oak lightly, glass not at all.
- Calibrated in rendered pixels against the Commons colour photos and the 1960 HABS corner: sheltered walls 0.83 to 0.89 of the clean surface, soffits 0.80, the coffers, vault and arch soffits 0.47 to 0.60, open brick and stone 0.99 to 1.00.
- Published the measure for 566, 572 and 573: `shelter`, `exposure` (the geometric share of the rain times the wind's catch at the top edge and corners), `front`, `overhangs` and `rain`, with `sample()` and `catch_ratio()` helpers.
- Proved the off switch and `wear_soiling=0` at the render noise floor against the pre-wear renders and AI 564's, the probe and runoff masks byte-identical, and left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/sheltered_soiling/`.
- Documented the feature and the shared measure in the BradburyBlock README ("Sheltered soiling under overhangs (AI 565)").

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." Two earlier review points were judged
in the same pass: the deepest cavities at 0.47-0.60 of clean, and the crown's top lip reading as a dark line on the
skyline.

- Each window head, arch, sill, storefront, fire escape platform and portal now takes its own seeded share (0.70-1.15,
  storefronts 0.55-1.15) and reach stretch (0.80-1.25), blended by shelter so values change only where the shelter
  does; the portals are also kept as the washed-down entrance (x0.70, vault 0.55 -> 0.70); the crown's top lip and the
  fascia under it, washed by the top's run-off, are no longer soiled (0.64 -> 1.00); the continuous courses, the coffers
  (0.48) and the published fields are unchanged, and every other feature rebuilt byte-identically.
- Critique round 1 (2026-09-24): the fresh-eyes review found the soiling making the Broadway portal's sunlit brass
  kickplates LIGHTER (1.44x in the close-up from the pavement), because its matte roughness floor spread polished
  metal's gloss over the sun; a new `wear_compare.py lighter` check found the same, fainter, on the doors' oak and the
  storefronts' black metal fascias. The matte is now masonry's alone (a smooth finish keeps its gloss and only
  darkens) and bare metal (metallic 0.9 and up: the portal's brass and bronze, the doors' bronze hardware) takes no
  soiling; the check finds no block lightened in any of 11 full-size stills (1558 before in the portal close-up), and
  every mask, cache and worn object is unchanged.
- Critique round 2 (2026-09-25): the fresh-eyes review found the soiling on surfaces behind glass: the storefronts'
  white transom panels, 2.2 cm behind their transom glass, read the glass's texels and took the storefront head's
  shelter through it (0.79 of clean at the top and 0.88 at the foot on 3rd Street, 0.77-0.85 across the west face,
  the most darkened surfaces there). What the street sees only through glass is now found on the model at build time
  (rays from each pane into the building, sight lines from each face so seen to 80 street viewpoints, judged in
  facets) and each such face carries the plane of its pane, in its object's own space, as face attributes; the shader
  takes the soiling off behind that plane: the 36 transom panels whole, the portals' vestibules, and the parts of the
  windows' and doors' frames and heads that run on behind their glass. The panels now read 0.99-1.00 soiling on
  against off and only glass grime's even film against wear off (0.90-0.98 on the west face); an audit from 210 street
  viewpoints finds nothing flagged that the street sees without glass but one corner of the chamfer's panel; no mesh
  copied, and the mask, the published fields and every other feature byte-identical.
