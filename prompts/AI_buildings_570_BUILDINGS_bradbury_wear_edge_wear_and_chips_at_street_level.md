# Problem

At street level the corners of stone take knocks and rubbing: people, bags, carts, doors, vehicles. The
ICOMOS-ISCS glossary names the results: rounding, "preferential erosion of originally angular stone edges
leading to a distinctly rounded profile", and chipping, "breaking off of pieces, called chips, from the
edges of a block". The Bradbury block's ground-floor stone has perfectly sharp, unmarked arrises all the
way down to the pavement.

On this building the worn places are:
- the vertical corners of the ground-floor piers;
- the portal pilasters and their plinths;
- the door jambs;
- the storefront bases;
- the front edges of anything low enough to be stepped on or knocked.

All of these lie within reach of the pavement: up to about two metres. This is a feature of the wear
layer (AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/

# Request

Add edge wear and chips to the wear layer: softened, lighter, rougher arrises and a few chips, only where
the street can reach them.

Tasks:
- Only convex edges within reach of the pavement take wear. It is strongest at hip and cart height and
  gone by about two metres. Edges above reach stay crisp.
- Worn edges read as slightly rounded, lighter and rougher, as abraded stone does, along the edge itself.
- Chips are discrete events at the weakest points of an edge: where a block joint meets the arris (the
  piers' horizontal joint grooves), at plinth corners, beside door openings. The geometry decides where
  they are, never a random scatter. Size and frequency follow how exposed the edge is.
- A chip reads as a small missing piece with fresh, lighter stone inside.
- Corners on the pavement's path take more wear than corners set back in a recess.
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/edge_wear/` (gitignored).
- Off and on side by side for `st_portal` and `st_along`, plus a close-up of one pier corner at street
  level.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_570_BUILDINGS_bradbury_wear_edge_wear_and_chips_at_street_level_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_570_BUILDINGS_bradbury_wear_edge_wear_and_chips_at_street_level_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
