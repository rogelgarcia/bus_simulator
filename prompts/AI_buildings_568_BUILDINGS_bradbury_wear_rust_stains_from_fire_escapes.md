# Problem

The Bradbury block's two iron fire escapes (the `attachment_fire_escape` objects) are fixed into the brick,
and neither they nor the wall show any sign of it. Iron rusts where it enters masonry and where water sits
on it. Rust stains at fire-escape anchor points are a standard sign of deterioration on real buildings,
and corroding fixings can even burst the stone around them (ICOMOS-ISCS: "bursting"). Water that runs off
the ironwork carries the rust down onto the wall below. Chen et al. (2005) call this transport "stain
bleeding" and model it from a point source, the rust "dribble" from a leaky pipe.

On this building the sources are:
- every place a fire-escape bracket or anchor meets the wall;
- the edges of the platforms and stair stringers where water drips off the iron.

This is a feature of the wear layer (AI 563) and follows its rule #1: nothing placed by noise.

Sources:
- https://www.fireengineering.com/fire-safety/the-dangers-of-fire-escapes-tom-warren/
- https://www.icomos.org/public/publications/monuments_and_sites/15/pdf/Monuments_and_Sites_15_ISCS_Glossary_Stone.pdf/
- https://ttwong12.github.io/papers/gammaton/gammaton.pdf

# Request

Add rust staining to the wear layer: rust that bleeds from the fire escapes' anchor points down the wall,
and rust on the ironwork itself where water collects.

Tasks:
- Every point where a fire escape is fixed into the wall is a source, and nothing else is. The anchor
  points are found from the fire-escape geometry itself.
- From each anchor, a narrow orange-brown streak runs straight down the wall. It is strongest at the anchor
  and fades as it descends, stopping at the next ledge, opening or the ground.
- Where water drips off platform and stair edges onto a surface below, it leaves rust there in the drip's
  footprint.
- On the ironwork, rust gathers at joints, bolted connections, edges and upward-facing surfaces where water
  stands, while vertical faces stay mostly painted. Paint loss starts at edges.
- The stain reads as rust in the wall's own texture, staining the brick and mortar rather than covering
  them.
- Own strength control through AI 563; visible in the debug view with each anchor marked.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/rust_stains/` (gitignored).
- Off and on side by side for `hero_3q` and `st_corner`, plus close-ups of one anchor and one platform
  edge.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_568_BUILDINGS_bradbury_wear_rust_stains_from_fire_escapes_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_568_BUILDINGS_bradbury_wear_rust_stains_from_fire_escapes_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
