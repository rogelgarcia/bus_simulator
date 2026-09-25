# DONE — AI 570: edge wear and chips at street level

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

## Completion summary

- Added the wear feature `edge_wear` (`wear/features/edge_wear.py`, registered in `wear/registry.py`, ORDER 110, green in the debug view): worn, rounded arrises and real chips on the street-level stone, byte-identical from one build to the next, in about 4 s.
- Read the arrises from the stone's own meshes, not by list: every convex edge turning 30 degrees or more on the pier ring and the portal's stone below 2 m (17 objects), joined into lines across the pier ring's joint grooves. Of 1711 convex lines, 222 are worn (77 on the block, 145 per portal), AI 567's 100 corners among them; buried edges, edges on the ground, groove lips and shut-in edges are left out by ray probes.
- Measured each arris's exposure with rays from the block: the pavement's traffic (rising toward the three portals' mouths, the three doors, found as pier-ring openings with a pull at hand height, and the block corners), how open it is to the street, how far it is set back behind the street line (the recess's base, 1.8 m in, takes 0.15), its sharpness, whether it meets the keep-right flow first, and whether it runs along the flow or across it. By height, the knocks are 0.55 at the foot, full from 0.35 to 1.1 m and gone by 2 m.
- Added the look from per-corner attributes (`wear_edge_d`, `wear_edge_k`, `wear_edge_u0/u1`): a narrow band along each worn arris, lighter, paler and rougher, and the shading normal turned round the edge within 5 mm, as on a rounded arris; masonry only, and 0 hands the input on exactly.
- Cut 44 chips as real geometry at the arrises' weak points, where the geometry decides: 20 on the pier ring (the six door jambs at both joint grooves, H 0.71 and 1.43; three block corners and five neighbouring arrises at the lower one) and 8 per portal (the plinth caps' corners, the shafts' feet and the portal piers' bases, at the mouth, plus the plinth and shaft that meet the flow first on the outer side). Their size, 2 to 5 cm, follows the risk (exposure x knocks x weakness, from 0.6). The scars are faceted conchoidal cuts from deterministic convex cutters, one exact boolean per object, with fresh, paler stone inside.
- Switched the chips through the framework's `replaces`: `WEAR_edge_fit_piers` stands in for `fit_piers`, and a copy of the PORTAL collection holding the six chipped pieces, instanced as `WEAR_edge_PORTAL_A/C/E`, stands in for the three portal instances. With the feature off, the untouched originals render.
- Calibrated in rendered pixels against the user's photo of the portal's left pilaster: in sun the worn line reads 1.34 to 1.40 times the face beside it (the photo: 1.18 to 1.41); the chips read 1.3 to 1.65 times, short of the photo's 2.35 to 3.10 on its darker stone, because whiter scars read too white on the model's lighter stone.
- Published `arrises`, `chips`, `entrances` and `profile` for the features that follow.
- Proved the off switch at the render noise floor against the pre-wear renders on all five cameras, and edge wear at 0 against AI 569's own stills. Measured the portal swap's renderer tie-break at interpenetrating joints (0.17% of `st_portal`'s pixels, above any wear) and matched it with an identical twin instance. The earlier masks, caches and rust attributes are byte-identical. Left the canonical, wear=off and wear=debug scenes built, with evidence in `tests/artifacts/screens/bradbury_wear/edge_wear/`.
- Documented the feature in the BradburyBlock README ("Edge wear and chips at street level (AI 570)").

## Rework (2026-09-23)

Feedback (user, 2026-09-23, on the finished wear layer): "the pigeon marker looks like a pattern, it was placed at the
same position in all windows. there could be 2 or 3 in the entiere building, and they should be put at different
postions and different shape. check the other features for pattern like results; the windows dirt on the bottom, it
doesn't look realistic; i don't remember seeing such a dirty whitening pattern on a window." The audit found the pattern
here. The three portals, one collection instanced three times, had the same 8 chips and the same worn arrises, always
chipped on the side that meets the flow first (keep right). A chip came off wherever the risk passed a threshold, so
all six door jambs chipped at both joint grooves (twelve alike, each door's jambs a mirror of each other), and the
block's corners and their neighbours at one height. That made 44 chips in 10 sizes.

- `edge_wear.py` now treats chips as events. Weak points (joints, corners, feet) and every stretch of arris within reach
  get a rate from their risk. Each element (a portal; an entrance's or a block corner's zone of the pier ring; the rest
  of a face) draws how many chips it took and where they fell. Each portal draws its own use, each arris its own share
  of the knocks (its band, rounding and risk), and each chip its own size, outline, section, facets and freshness, all
  seeded from its own place. The result is 24 chips (10 on the pier ring; 4, 5 and 5 on the portals), no two alike.
- Each portal now instances its own copy of the collection, with its own copies of the 13 worn pieces; the originals are
  untouched. The copies are placed bit for bit (an ulp in the old instancers' quarter turn was the "swap's tie-break").
  A twin instance 1 km under the block, seen by volume scatter rays alone, keeps Cycles from baking the single-user
  copies into world space, which had made z-fight dashes and hairline cracks at the portal's coplanar joints. `st_portal`
  now moves 0.0097 levels with edge wear on, under its noise floor; it was 0.046.
- Every other feature's mask and cache is byte-identical, and so are their objects in the worn files. The worn block has
  one more object (2698: the twin). README: "One at a time (rework 2026-09-23)" and "Where the chips live: the switch";
  evidence in `tests/artifacts/screens/bradbury_wear/rework/edge_wear/`.
- Critique round 1 (2026-09-24): the fresh-eyes review found a black hairline along the Broadway portal's intrados
  that changed length from one still to the next with edge wear on (295 pixels over 8 levels between two identical
  stills, 36 with it off) and laid it to the portal swap. It is not the swap's. The line is the portal model's own:
  the soffit panel's three-part moulding (`pieces/06_arch.py`, `portal_lib.three_part_profile`) has its step riser
  exactly in the carved panel's wall, so `soffit_molding` and `arch_block` (ARCH, which the copies share untouched)
  have faces in one plane that z-fight and shadow each other; it is in the pre-wear stills too, and the pilasters'
  panel mouldings share the profile and the fault. Its length is the renderer's: the stills render on OptiX and the
  CPU together, the CPU takes the top 100 to 160 rows by timing, and the two devices draw those faces differently. On
  OptiX alone, edge wear on, on again, off and off again are the same at the arch to within one level (one pixel of
  the box at 5), and at the other two portals on and off to within two. Edge wear is unchanged; `render_wear.py`
  gained `devices=gpu` (OptiX alone) for stills that repeat. The riser and the wall want separating in the portal's
  own pieces. README: "The arch's black hairline (critique 2026-09-24)"; evidence in
  `tests/artifacts/screens/bradbury_wear/rework/edge_wear/critique_r1/`.
