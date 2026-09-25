# DONE — AI 572: pigeon marks on perching ledges

# Problem

Downtown Los Angeles has pigeons, and pigeons use ornate old facades. Their droppings build up on window
ledges, cornices and parapets, the places they perch and roost. The uric acid etches stone and metal
over time. The ornate cornices of pre-war buildings are favourite perches, the more so where they are
high, deep enough to stand on, and sheltered from above. The marks are whitish: spatters on the
horizontal surface near its outer edge, and short drips that run over the edge onto the face below.

On the Bradbury block the perches are:
- the top of the crown and its coping;
- the top of the band cornice between floors 4 and 5;
- the deep window sills of the upper floors;
- the abaci of the capitals;
- the top of the impost course;
- the portal's crown moulding.

This is a feature of the wear layer (AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.buildingconservation.com/articles/birddamage/birddamage.htm
- https://www.researchgate.net/publication/325188162_Behaviour_of_Pigeon_Excreta_on_Masonry_Surfaces

# Request

Add pigeon marks to the wear layer: droppings where birds actually perch, not sprinkled across the
building.

Tasks:
- Perch sites are derived from the ledges themselves: horizontal surfaces deep enough for a pigeon to
  stand on, high above the street, and preferably sheltered from above or tucked into an inner corner or
  against a pier return. A ledge too narrow to stand on takes nothing.
- Marks concentrate at those sites, strongest where the site is most sheltered and near the ledge's outer
  edge, and thin out along exposed runs.
- A mark is a whitish spatter on the ledge top plus short drips over the edge onto the face below. It
  never appears as a speck on a vertical wall far from a perch.
- Heavily used sites show a little more build-up and a faint etched discolouration under the deposit.
- It stays subtle overall: a maintained building, not an abandoned one.
- Own strength control through AI 563; visible in the debug view with each perch site marked.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/pigeon_marks/` (gitignored).
- Off and on side by side for `hero_3q` and `st_up`, plus a close-up of the crown's top and one deep
  sill.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_572_BUILDINGS_bradbury_wear_pigeon_marks_on_perching_ledges_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_572_BUILDINGS_bradbury_wear_pigeon_marks_on_perching_ledges_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary

- Added the wear feature `pigeon` (`wear/features/pigeon.py`, registered in `wear/registry.py`, ORDER 260, NEEDS soiling, red in the debug view, `wear_pigeon` 1.0 by default): droppings only where birds perch, every mark from a perch site found on the ledge geometry, no noise, hash or seed, the mask byte-identical on every rebuild.
- Found the ledges on the model, not by list: level rays just above and below every flat masonry top at least 4.4 m up, confirmed by a ray down, standing depth from what stands on the top to its outer edge (the crown's open top to its inner edge), touching tops merged: 1288 sites on the crown's top, the band's top, the sills of floors 2 to 4 and the top floor's reveals, the impost course, the abaci, the ground floor cornice, the portals' crown mouldings and the openings row; ledges too shallow, too low or slivers take nothing.
- Graded each site's use by standing room, height (0.35 at 5 m to all of it at 15 m: the low ledges are kept clean and spiked) and protection (565's shelter and the reveals' enclosure), an exposed run keeping 0.35 of a sheltered one's; split the sites where the wall behind steps and made every forward step a roost (1249), its pile falling off over a third of a pigeon's length.
- Put a shallow corner's pile at the edge (the bird's tail over it) and a deep corner's against the back wall; drips only from the piles, at their quantiles, graded in strength and length (360, 7 to 27.5 cm), walked down the face as runoff's film is, a heap at each head, and a faint veil along the rest of a used edge.
- Packed it into one 2 cm 8-bit RGBA mask: the drips' deposit, axis offset (crisp at any distance), surface depth and veil in the facade rows; the tops' deposit, lobe width, height phase and centre depth in rows of their own read at a remapped height, with separate row groups for the edge and the deep corners.
- Made the look a chalky grey stain where the deposit is thin and a whitish urate crust where it builds up and in the drips, with a faint paler, yellowed etch round heavy deposits, matte; mixed from the chain's input so strength 0 renders exactly what came in.
- Calibrated in rendered pixels (in sun a heap reads 1.9 times the clean sill, a drip 1.5, the mid-sill spatter 1.14, the crown top's edge 1.17; in shade a heap 5 times the dark terracotta) and judged against the Commons photos' spiked, clean ledges for a maintained building: the street views change subtly (st_up 1.4% of pixels by more than 2 levels).
- Added a backward-compatible `elevation(canvas)` hook to `wear/elevation.py` (documented in the module API); proved the earlier masks, caches and mesh data byte-identical against a pre-572 rebuild, the layer off at the render noise floor against the pre-wear stills and the pigeon at 0 against 571's stills on all five cameras; left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/pigeon_marks/`.
- Documented the feature in the BradburyBlock README ("Pigeon marks on perching ledges (AI 572)"), with notes for AI 573.

## Rework (2026-09-23)

Feedback (user, reviewing the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same
position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions
and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look
realistic; i don't remember seeing such a dirty whitening pattern on a window." Here it was the pattern itself: one rule
put the same heap and drips at the same corner of every window (1249 roosts, 360 drips), a veil along every used edge
and a thin line along the whole crown top.

- The building now holds two roosts (a seeded draw between two and three), chosen from the perches the ledge scan finds:
  every inner corner a bird can tuck into is a candidate, weighted by its use (standing room, height, shelter) and how
  deep it tucks the bird in. The first is round the Broadway portal, where the Commons photo shows a pigeon and the
  street views look (a pocket of the openings row over the cornice, 5.4 m); each next differs from the others in the
  ledge it stands on, in face and by a storey (a top-floor reveal on 3rd Street, 16.7 m). The veil, the crown's line
  and the per-window piles are gone.
- Each roost composes its own deposit from seeds of its place: a pile where the bird sits tucked in and a scatter where
  it stands at the edge, 79 and 174 droppings of their own age (fresh ones white and thick, some with a dark core; old
  ones a thin grey-beige film), size, shape, lobes, satellites and smears, cut by the ledge's walls and edge, whiter
  where they build up, a grey-brown film and a faint etch round them; and its own drips over the edge, different in
  place, length, width and strength. No noise anywhere; every rebuild reproduces it (the mask's sha256 holds).
- The deposit lies in a block of the mask per roost, stored as a signed distance to the droppings' outline (crisp at
  any texel), which the shader reads through the build's own result: `wear/nodes.py` now hands a feature's shader its
  `Result` as `g.result`. Every other feature's mask, cache, attributes and meshes are byte-identical; the worn block
  keeps its 2697 objects. README: "Pigeon marks on perching ledges (AI 572)" rewritten, with "One roost at a time
  (rework 2026-09-23)", and `g.result` in the framework's section; evidence in
  `tests/artifacts/screens/bradbury_wear/rework/pigeon/`.
- Critique round 1 (2026-09-24): the fresh-eyes review found the two roosts different on their ledges but alike from
  the street, where their drips are all that shows: each a pair of straight, parallel, even-width pale lines about 9 cm
  apart ending at the same height (both pairs set at the old gap rule's floor and cut at the same moulding step), the
  Broadway pair reading close up as two painted white bars. The drips are now composed on the surface they run down,
  millimetre by millimetre, in a curtain block of the mask per roost: the roosts take their drip counts from 1, 2 and 3
  shuffled (Broadway one, 3rd Street two, merged under one head), strung round the perch as widely as the bird wanders
  (from merged to more than 20 cm apart), with stratified runs; each drip has a head with lobes and spatter on the lip,
  a flared, necked, slugged run that bends and slips a few millimetres at the moulding's arrises, and ends in a bulb, a
  pendant where it hangs off an underside it cannot hold to, or a thin broken tail that runs on over the step; thick
  parts crust, thin ones a translucent chalky film. From the pavement the two roosts no longer share a look (one drip
  against a fork); every other feature's mask, cache and worn object is unchanged. README: new "Its drips, one at a
  time (critique 2026-09-24)"; evidence in `tests/artifacts/screens/bradbury_wear/rework/pigeon/critique_r1/`.
