# Problem

The Bradbury block (the Blender authoring project in
`src/graphics/content3d/buildings/authoring/BradburyBlock/`: `assemble_building.py` builds
`bradbury_block.blend`, `build_scene.py` the raytraced render scene, `pieces/` the portal) renders as if
it were finished yesterday. The user wants a wear-and-tear layer that can be switched off.

Two earlier weathering passes were rejected. A procedural mottle/soiling pass on the trim (2026-09-17) and
a whole surface pass (2026-09-20) were both reverted: "this only created fake dark spot that looks hand
made". The user's rule #1 for this layer: wear must not look like noise placed at random positions.
Generic algorithms do that; this layer must not. Each mark must be localized where that kind of wear
physically happens, and must not read as noise inside the mark either.

Research gathered on 2026-09-23 points the same way from every discipline: wear has a cause and a path.
- Rain-driven runoff makes the visible patterns: it rinses deposited dirt away ("white washing") in some
  places and carries it down into dark streaks ("dirt washing") in others. Projections without proper
  drips are the most common cause of dirt marks. Wind-driven rain hits a facade's top edge and top
  corners hardest (Blocken & Carmeliet 2013).
- Soot builds into crusts on surfaces protected from rain and runoff (ICOMOS-ISCS glossary, 2008).
- In graphics, weathering is modelled from sources (points, areas, the environment) and their transport
  across the geometry, so the result is "customized to scene geometry and tailored to the weathering
  sources" (Chen et al. 2005, γ-ton tracing). Dirt settles where accessibility is low (Miller 1994).

Sources:
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/
- https://ttwong12.github.io/papers/gammaton/gammaton.pdf
- https://dl.acm.org/doi/10.1145/192161.192244

# Request

Build the shared wear layer that the individual wear features (AI 564 to AI 573) plug into. It carries
no wear of its own beyond what is needed to prove it works end to end.

Tasks:
- One switch turns the whole layer off. With it off, the block and the render scene render exactly as
  they do today: the same images within render noise, checked on the render scene's five cameras.
- Each wear feature has its own strength control; zero disables that feature alone. Defaults stay subtle.
  This is a well-kept building in a dry climate, calibrated against references, not a ruin.
- Every mark comes from a physical source on the model (a sill end, a ledge's edge, an overhang, the
  pavement, an iron anchor) and follows a physical path from it (down the wall, into shelter, up from the
  ground). Nothing is placed by random scatter or noise.
- Irregularity inside a mark comes from the surface's own structure (brick courses, mortar joints, stone
  and terracotta grain) or from the shape of its source, never from an unrelated noise function.
- Wear works through the existing materials: brick, terracotta, stone, glass, metal. It darkens,
  lightens, tints or roughens their own look under the same lighting, and leaves their normal maps and
  relief intact. It is not a floating overlay unless a feature cannot work otherwise.
- The wear masks are derived from the model's own geometry by the authoring scripts, so a rebuild
  reproduces them exactly. Generated images and files stay gitignored artifacts.
- A debug view shows every mark coloured by its feature, with its source visible. A mark without a source
  is a defect. The build prints a per-feature count of sources and marks.
- Calibrate strengths against the 1960 Library of Congress HABS photos of this building (HABS CA-334,
  e.g. photo 011973; see the BradburyBlock README for the reference sources) and against current photos.
- Out of scope: the game engine (AI 405 is the separate game-side wear system; do not change game code);
  frost spalling, moss, algae and lichen; heavy black crusts (Los Angeles is dry, and its smog is not
  coal soot).
- Document the layer in the BradburyBlock README: the switch, the controls, the debug view, and how a
  new feature plugs in.

Features that plug into this layer:
- AI 564 runoff streaks below ledges
- AI 565 sheltered soiling under overhangs
- AI 566 rain-washed exposed zones
- AI 567 street-level grime band
- AI 568 rust stains from the fire escapes
- AI 569 efflorescence below trim
- AI 570 edge wear and chips at street level
- AI 571 glass grime on panes
- AI 572 pigeon marks on perching ledges
- AI 573 mortar joint erosion at exposed courses

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/framework/` (gitignored).
- For each of the render scene's cameras (`hero_3q`, `st_corner`, `st_along`, `st_portal`, `st_up`),
  show the layer off and on side by side in one image, plus the debug view.
- Prove the off state matches the current renders: give the pixel difference against a render made
  before the change.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_563_BUILDINGS_bradbury_wear_layer_framework_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_563_BUILDINGS_bradbury_wear_layer_framework_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
