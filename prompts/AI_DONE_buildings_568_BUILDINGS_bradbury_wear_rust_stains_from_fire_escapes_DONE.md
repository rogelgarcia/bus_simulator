# DONE — AI 568: rust stains from the fire escapes

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

## Completion summary

- Added the wear feature `rust` (`wear/features/rust.py`, registered in `wear/registry.py`, ORDER 250, orange in the debug view): rust from the two fire escapes on 3rd Street, on the wall and on the ironwork itself, byte-identical from one build to the next, in about 5 s.
- Read the ironwork from its own meshes: welded the export's split faces back into 158 members per stair and named them by shape (3 platforms, 2 stringers, 6 handrails, 26 treads, 9 top rails, 98 posts, 14 rungs), and found the back plane where it stops toward the wall (2 cm in front of the piers, 6 cm in front of the sills, 11 cm in front of the window strip's panel).
- Found the 24 anchors on the geometry and nothing else: the nine members per stair that reach the back plane (three platforms and their six side top rails), each fixed where masonry stands straight behind it, a rail at its rear end and a platform at both ends of its rear edge; the debug view marks each one with an octahedron and its fixing with a tube from the iron to the wall.
- From each anchor, a narrow streak straight down the masonry behind it, followed with AI 564's elevation and film walk (the fire escapes looked through): 3 cm wide with a halo round the fixing, strongest at the anchor, fading over 0.9 to 1.2 m, or caught by the ground floor's crown under the lowest platforms; its edge is cut analytically from an axis-offset channel in the mask, crisp at 2 cm and 8 bits, and reaches along the bed joints.
- Cast the drips from the free lower edges of the platforms and the stringers onto whatever lies below: the lower platforms' rail tops and deck edges rust in the drip lines, and the ground floor's crown takes a rust-brown U under each lowest platform; the drops that reach the pavement are left to the render scene.
- Put the ironwork's own rust on its mesh as per-corner attributes (`wear_rust`, `wear_rust_e`, `wear_rust_f`): exact linear distance-to-edge bands along every face edge, sized by what the edge is (a joint where a member ends against another, a fixing, an upper arris, a drip edge; vertical and sloping arrises shed), widened by the drips that land there, standing water on the tops, and scaled by the rain each member takes (AI 565's rain); 11% of the ironwork's area is rusty past half and vertical faces keep their paint.
- Added the look: on masonry a warm filter over the wall's own colour, stronger in the mortar, the brick's pattern kept; on the iron the paint failing to a matte dark brown and then orange-brown oxide, no longer metallic.
- Routed Metallic through the wear layer for the metal class (`wear/nodes.py`), backward compatible, with the debug view's clay matte on metal.
- Calibrated in rendered pixels in 3rd Street's shade: the streak at 0.66 of the clean brick round the fixing and 0.72 to 0.90 down its length, on AI 564's sill-end streaks (0.64, 0.76).
- Published `anchors`, `streaks`, `drips`, `footprints`, `iron` and `field` for AI 569 (efflorescence round the anchors).
- Proved the off switch at the render noise floor against the pre-wear renders on all five cameras, rust at 0 against AI 567's own stills, the earlier masks byte-identical and the rust mask and attributes reproduced on a rebuild; left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/rust_stains/`.
- Documented the feature in the BradburyBlock README ("Rust stains from the fire escapes (AI 568)") and the Metallic state in the framework's own section.

## Rework (2026-09-23)

Feedback (user, 2026-09-23, on the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the same position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different postions and different shape. check the other features for pattern like results; the windows dirt on the bottom, it doesn't look realistic; i don't remember seeing such a dirty whitening pattern on a window."

- The audit found identical repeats (the two stairs' rust byte-identical, four identical streak chains, the same tick at every baluster joint), so `rust.py` now draws each fixing's leak (5 of 24 sound), load, length, spread and halo, each member's paint, each joint's state and each platform's fall from a seed of its own name; `anchors.wet` became the water a fixing lets in, so efflorescence (569) follows the leaking fixings, and every other feature is byte-identical (README: "One at a time (rework 2026-09-23)").
