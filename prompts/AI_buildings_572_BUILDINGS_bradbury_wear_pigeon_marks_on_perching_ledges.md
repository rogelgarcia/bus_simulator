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
