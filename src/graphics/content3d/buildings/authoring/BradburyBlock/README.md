> Location (2026-09-11): this folder, `src/graphics/content3d/buildings/authoring/BradburyBlock/`,
> holds the SCRIPTS that author the portal for the game config `configs/BradburyBlock.js` (any building's
> authoring goes in `authoring/<ConfigName>/`, matching `configs/<ConfigName>.js`). Everything generated is
> git-ignored under `tests/artifacts/`: the .blend files (`bradbury_portal.blend`, `ornaments/*.blend`) in
> `tests/artifacts/blender/bradbury/portal_project/`, renders and overlays in `tests/artifacts/screens/bradbury_fix/portal_project/`.
> Regenerate everything with `blender -b -P rebuild_portal.py -- 01 02 03 04 05 06 07 08` after
> `blender -b -P ornaments/capital.py` and `blender -b -P ornaments/arch_leaf.py`; or open the generated blend and rerun single pieces.
> The whole building with this portal in place: `blender -b -P assemble_building.py` (see the last section).
> Backups of earlier states remain under `tests/artifacts/blender/bradbury/portal_project_backups/`.

# Bradbury portal — standalone project (piece by piece)

Blank Blender project for the Broadway entrance portal only. Each piece is a
script under `pieces/` that builds into its own collection and can be re-run
(it clears its collection first); `portal_lib.py` holds the shared primitives,
materials and the render rig. The master file is `bradbury_portal.blend`.

Frame: x across the facade (0 = portal centre), y = depth (+y into the
building, the street at -y), z up from the threshold. The door leaf faces sit
at y = 0; the facade pieces will be built further out at negative y.

| # | Piece | Script | Collection | Status |
|---|-------|--------|------------|--------|
| 01 | Door set: four equal dark-oak leaves (2.50 m, the reference module) in two pairs (1+2, 3+4) meeting in the middle of each pair, a paneled column between the pairs topped by a small plain raised panel; each leaf has a glazed upper panel with a bolection molding, a carved foliage band on the top rail, a raised bottom panel with an oval boss in a molded frame, a brass kick plate and a black iron pull at mid-height on its meeting stile; one near-square transom light over each pair; head/top rails | `pieces/01_door.py` | `DOOR` | built 2026-09-10 |
| 02 | Paired piers: two square stone piers (0.34 m) on each side of the door set, 0.12 m clear of the jambs, side by side in depth at y = -1.75 and -1.36; plinth/step/fillet base 0.44 m, sunken panels on the passage and street faces, necking fillet, the same linked capital ornament as the pilasters (ornaments/capital.blend) scaled to the pier width and turned to face the passage, 0.18 m tall, its top level with the door glass (2.35 m) | `pieces/02_pillars.py` | `PILLARS` | built 2026-09-10 |
| 03 | Vestibule behind the doors: 5.90 x 7.00 m hall, glossy glazed-brick walls on a 0.35 m dark stone base, one round-arched opening (1.70 m, springing 2.30) in each side wall with a molded brick edge and a dark passage behind, street wall with oak paneling beside the door set (no arch inside: the ceiling starts at the top of the transom lights, 3.80 m), stepped oak cornice 3.80-4.10, coffered oak ceiling at 4.10 (side and end rows of 0.75 m coffers, a central molded panel with a round medallion), bronze pendant lamp with a lit globe, encaustic tile floor (diagonal checker) with a dark border; the +y end is open toward the lobby | `pieces/03_vestibule.py` | `VESTIBULE` | built 2026-09-10 |

| 04 | Entrance recess between the piers and the door: glazed-brick side walls running straight from the door set's edges (faces x = +/-1.60, no return beside the door) to the mouth at y = -2.10, with the piers standing against them and projecting into the recess; dark stone base, tile floor with a dark border, oak frieze above the door head, small oak cornice, coffered oak ceiling at 4.10 (border coffers around a central molded panel with a rosette), small bronze globe lamp near the mouth | `pieces/04_recess.py` | `RECESS` | built 2026-09-10 |

| 05 | Entrance slab: granite step 4.90 wide, 0.12 tall, from the recess mouth 0.75 m onto the sidewalk with a rounded front edge; plain sidewalk slab around it; granite fill under the recess floor | `pieces/05_slab.py` | `SLAB` | built 2026-09-10 |
| 06 | Arch: one rectangular stone block continuing the piers' edges (x +/-1.60, y -2.70 .. -1.97, z 2.35 .. 4.08) resting on the pier capitals, square at its borders, with the semicircular arch (radius 1.26 = the piers' inner faces) cut through its centre; the capitals' abaci project past it. Street-face ornament, from the opening outward: (4) a continuous 45-degree chamfer along the arris (3 cm on the face, 3 cm on the soffit) with square notches subtracted from it (3 x 3 cm bites out of the corner, 3 cm long, 5.5 cm pitch), so the edge reads as a row of small squares; (2) a strip of three fine concentric steps rising outward close to the opening (R 1.40 .. 1.46), springing from the pier capitals' abaci and stopping at the keystone's outline, then a plain band; (1) two sunken spandrel panels (3 cm) edged with the three-part molding (tiny square step, convex quarter-round, tiny square step) whose curved edge follows the arch at R 1.56 and whose straight edges follow the block's side (0.08 in), the top border (3.98) and the keystone (0.06 off), tapering to a thin tip at z 2.69; (3) a sunken panel carved into the soffit (4 cm, single carve, margins 0.10) edged with the same three-part molding as the pilaster panels. Keystone as a corbel from the photo, inside the tapered outline the spandrels keep clear of (0.24 -> 0.30 wide, 3.71 .. 3.98): a chamfered top block with small ribs, a tapering half-cylinder (r 0.085 .. 0.115) wrapped in four inverted-V rows of edged leaves, a knob at the bottom | `pieces/06_arch.py` | `ARCH` | built 2026-09-10 |

| 07 | Side pilasters: one each side of the arch block (x 1.605 .. 2.405), standing on the sidewalk (z -0.12), face 0.20 proud of the arch (y -2.90), back overlapping the recess wall ends (y -2.05); the piers' stepped plinth (top at 0.44) in the same pink stone, shaft with a sunken panel whose edge is a three-part molding (small square step at the face, convex quarter-round curving outward, small square step down to the field) running straight up to the capital, the linked capital ornament (ornaments/capital.blend; the old `capital_volute` build is kept in portal_lib for reference) (`capital_volute`: a row of edged acanthus leaves, bold snail volutes at the corners rising on the diagonal, a crown on each face curling into small snails at the top corners with a bud and a small palmette, plain two-tier abacus with a boss; 0.80 m) whose top (4.08) matches the top of the arch block | `pieces/07_pilasters.py` | `PILASTERS` | built 2026-09-10 |

| 08 | BRADBURY frieze band: plain stone band over the arch block and the pilaster capitals (x +/-2.405, y -2.90 .. -2.05, z 4.08 .. 4.50), flush with the pilasters and ending at their outer edges; the inscription "BRADBURY." as the lettering PBR decal (`assets/public/pbr/bradbury_lettering`, 2026-09-22; it replaced extruded Arial Black letters with a rim), its letters respaced in the image (`make_lettering_pbr.py`), 2.64 m wide and 0.368 tall with its ends 0.165 inside the capitals below, 1 mm proud of the band on a mesh that follows the letters; above each pilaster a foliage panel of leaves on curved branchlets in layered relief (leaves 2 cm, branches 2.6 cm, rosette to 3.8 cm): a small rosette, a wavy main branch to each side with three curling branchlets, edged leaves along the branches and at the branchlet ends; no dentil course or cornice yet | `pieces/08_frieze.py` | `FRIEZE` | built 2026-09-10 |

Piece 05 update: the step now spans only between the pilasters (x +/-1.60).

Piece 06/07 heights: the strips spring from the block's sides (R 1.60), so
their crown is at 3.95; the reference puts the spandrel top just above it
(keystone 3.71 .. 4.10), so the block top is 4.08 and the pilasters follow it
(capital top 4.08, shaft top 3.28). The three-part panel profile is shared:
`three_part_profile(D, w)` in `portal_lib.py` (pilasters 0.05 x 0.065, arch
soffit 0.04 x 0.06).

Piece 02 update: piers at x = +/-1.43 (faces 1.26 .. 1.60): backs on the
recess walls, projecting 0.34 m inward; the pair now stands at the mouth under
the arch ring (y centres -2.53 and -2.14) and carries it.
Piece 01 update: transom lights 6% under square (2.62 .. 3.73), top rail to
3.86; the vestibule and recess ceilings follow at 4.03.

Pier capital (`capital_pilaster` in `portal_lib.py`, traced from the user's
drawing): square leaf bell with an astragal, three acanthus leaves per face,
two mirrored S-scroll stems per face curling into snail spirals under the
abacus corners, bold corner volutes in the diagonal planes, and a molded
abacus in three tiers with chamfered corners (front face plus two angled
faces) carrying a small rosette on each face.

Running a piece from the headed Blender (MCP) or `blender -b bradbury_portal.blend -P pieces/01_door.py`:
each script saves the master file and writes renders to
`tests/artifacts/screens/bradbury_fix/portal_project/<nn>_<piece>_*.png`.

Door set dimensions: total width 3.20 m (jambs 0.10, four leaves 0.70 each,
column 0.20); leaves 2.50 m tall, 6 cm thick, hinge stile 0.11 / meeting
stile 0.09; kick plates 0.28 m; bottom panels 0.36-0.78 m; glass 0.94-2.35 m;
pulls 0.92-1.36 m; head rail 2.50-2.62; transom lights 2.62-3.80 (1.37 x
1.18 m per pair); top rail to 3.93 m.

## Ornaments (separate files)

Carved ornaments are rebuilt in their own files under `ornaments/`, each by a
script that builds at the origin with close-up cameras, so every iteration is
fast and the portal file stays untouched. The portal LINKS the ornament's mesh
datablock (Blender library link, not append): piece 07 links the mesh
`capital` from `ornaments/capital.blend` and makes both pilaster capitals
instances of it. The inner piers (piece 02) link the same mesh at 0.434 scale, rotated to
face the passage. Workflow: run `ornaments/capital.py` (it rebuilds and saves
`capital.blend`), then reopen `bradbury_portal.blend` or use File > External
Data > Reload Library, and the portal shows the new version; no portal script
needs to run. The link is stored relative to the portal file.

| Ornament | Script / file | Stage |
|----------|---------------|-------|
| Pilaster capital | `ornaments/capital.py` -> `ornaments/capital.blend` (mesh `capital`, linked by pieces 07 and 02), built by `capital_v2` in `portal_lib.py` | 1: base (neck astragal + bell flaring from the 0.80 x 0.85 footprint) and support (abacus fillet + slab), no carving; engaged: it wraps the front face and runs back along the sides for 80% of the front width, ending in a straight back plane, the plain pilaster / pier continuing up behind it; renders `screens/.../ornaments/capital_*.png` (2026-09-10) |

## Rendering without opening Blender

`render_portal.cmd` (or `blender -b bradbury_portal.blend -P render_portal.py --`)
renders three angles headlessly with Cycles on the GPU: `portal_front.png`,
`portal_low.png` and `portal_ornament.png` (close-up of the left pilaster
capital) into `tests/artifacts/screens/bradbury_fix/portal_project/renders/`.
Options: `--eevee` (quick preview), `--samples N`, `--size WxH`, `--out DIR`.
Linked ornaments are read from disk on load, so the renders always show the
last saved ornament.

## Overlay on a reference photo

`overlay_portal.py` (headless: `blender -b bradbury_portal.blend -P overlay_portal.py --`)
renders a level frontal view with a transparent film twice, surfaces only and
with purple 2 px Freestyle edges, and writes `overlay_features.json` with the
pixel position of named model features. `overlay_compose.py PHOTO OUT.png`
then aligns the render on the photo by the pilasters' outer edges and the
sidewalk line, composites the surfaces at 45% with the edges at full
strength, and draws arrows from each model feature to where the photo has it
(the photo's feature pixels are the `PHOTO_PX` table in the script; measured
on `references/user_entrance_frontal.png`, 1080 x 1440). The composite is a
difference treatment: photo tinted cyan with its detected edges in bright
cyan, model tinted orange at 50% with its Freestyle silhouette/crease lines
(lines pass minus surfaces pass) in solid magenta; agreement reads grey.
`--no-arrows` for the clean version. Outputs:
`screens/.../portal_project/overlay/portal_overlay_tinted*.png`; `--opaque`
renders plain frontals (`overlay/before|after/frontal.png`) for side-by-side
sheets, and `rebuild_portal.py -- 02 06 07 08` rebuilds pieces headlessly.

## Proportion pass from the photo overlay (2026-09-10)

Backup of the previous version: `../portal_project_backups/2026-09-10_v1_before_proportions/`.
Changes from `overlay/portal_overlay_arrows.png`: pilasters 0.76 wide (x
1.605 .. 2.365; the photo's shaft is 0.73, the jamb beside it belongs to the
pier), capital 0.55 tall on a 0.76 x 0.85 footprint, band 4.13 .. 4.80 with 0.36 m
letters, keystone and spandrel top at 4.10 just under the band, block top
4.13, spring line 2.25 (arch apex 3.51). The keystone is now a tall tapered
console bracket (0.20 -> 0.30 wide, 3.50 .. 4.10, S side profile projecting
0.03 at the bottom and 0.14 at the top), base shape only; its leaf carving
comes later. The dentil course and cornice above
the band are still not built; compare the band top with that in mind.

## Door depth and overlay camera calibration (2026-09-11)

Backup of the previous version: `../portal_project_backups/2026-09-11_v2_before_door_depth/`.
The door plane is `portal_lib.DOOR_Y` (-0.30, was 0.0): the doors stand 2.6 m
behind the pilaster face (user's call from the oblique photo of the entrance;
the frontal photo alone had suggested 1.7 m). Pieces 01 and 03 are still
modelled with the leaf faces at y 0 and shifted as objects; piece 04's recess
ends against the moved street wall. In the frontal photo the door set (leaves
2.50 tall, sill on the sidewalk row) appears at 0.88x the pilaster-face
scale; with the doors 2.6 m deep that would put the photographer about 18.5 m
out at eye height (1.66 m). The `overlay_portal.py` default is closer (--dist
6.75 --height 1.66 --lens 32, user's call): there the model's 3.20 m door set
appears as wide as the photo's 2.31 m; its leaves then read 1.80 m tall
against the photo's 2.20 m, because the model's set is wider than the photo's
(2.64 m) rather than deeper.

Also read from the photo, not applied yet (internal proportions, to confirm
before restructuring): the door set is about 2.64 m wide, the same as the
arch opening (intrados about 2.62-2.66 m, R 1.32) and the recess; i.e. the
piers are the ends of the recess walls, not free-standing inside a wider
recess (model: opening 2.52 / recess and door set 3.20). The floor of the
recess reads level with the sidewalk (no 0.12 step). The pilaster capitals
flare about 0.12 m beyond the shaft on each side and are about 0.38 m tall
(the 0.55 came from reading the panel top as the capital bottom).

`overlay_sheet.py` pairs each photo element with the model's own position of
that element (bounding boxes of the real objects, `overlay_features.json`):
red = photo, yellow = model, orange = elements on the recessed door plane.

`overlay_pair.py PHOTO MODEL.png OUT_DIR` writes the working pair
`pair_reference.png` / `pair_current.png` (same crop and size, the model
scaled so its band bottom and sidewalk sit on the photo's lines A and B):
the reference for the element-by-element work from 2026-09-11 on.

## Pilaster pass from the A/B pair (2026-09-11)

From the user's marks on `overlay/pair/pair_side_by_side.png`: the capital's
baseline rises to 3.77 (shaft taller, ornament shorter: `ornaments/capital.py`
H 0.39, was 0.55) with its top contour at 4.16, 0.03 above the band bottom;
the sunken panel ends 0.17 under the capital (3.60); the plinth's visible top
is its cap at 0.44 (block to 0.38, recessed neck, cap as wide as the block),
on the piers too. The pier capitals keep 0.25 of height (scaled from the
0.39 ornament). Not touched: the panel bottom (photo 0.96, model 0.74).

## Pilaster width from the A/B pair (2026-09-11)

In the pair frame (160 px/m from lines A and B) the photo's shaft is 0.725 m
with 0.06 m panel margins; the model had 0.76 and 0.12. Now PW 0.725 (x
1.605 .. 2.33, band and decals follow), panel margins 0.06, ornament file
W 0.725. At the 6.75 m camera the pilaster's side face and the shaded arch
sliver beside it add about 0.09 m of apparent width that the photo, taken
from further away, does not show.

## Feet and panel from the A/B pair (2026-09-11, second round)

The photo's plinth ends at row 1080 (0.50 m), with a bold rounded cap over
the block; the model's thin cap at 0.44 read as a line on a 0.38 block. Now
PLINTH_TOP / PLINTH_H 0.50: block to 0.42, cap body 0.06 proud (0.42 ..
0.46), stepped cap top to 0.485, fillet to 0.50, on the pilasters and the
piers. The sunken panel follows the user's box: 0.495 wide (0.115 margins),
0.86 .. 3.60.

## Piers and arch ring from the A/B pair (2026-09-11, third round)

User's marks: the inner pillar (pier) is the orange box, 0.26 wide, its
capital reaching down to the yellow line (1.91); the dark band between the
pilaster and the pier must go; the arch carving follows. In the photo the
ring's outer edge is tangent to the pilaster's inner edge and the ring is as
wide as the pier it springs from, so: piers 0.26 wide x 0.34 deep (x 1.34 ..
1.60), capital 1.91 .. 2.25; opening R 1.34 (apex 3.59); ring strips 1.42 ..
1.60 in three 0.06 steps; keystone 3.62 .. 4.10; spandrel edge R 1.68. The
pilasters stay: the blue box's edges are within 3 cm of their outer edges.

## Ornament +5% height, +10% depth (2026-09-11)

The shared capital is 0.41 tall (was 0.39) and its straight back runs 88%
of the front width along the sides (portal_lib.CAPITAL_DEPTH, was 80%). The
pilaster shaft ends at 3.75 (was 3.77) so the capital top stays at 4.16; the
panel top follows (3.58). The pier capitals keep 0.34 of height and take the
new depth. The capital grows toward the wall only: its neck front stays on
the pilaster face. Feet raised a bit more on request: PLINTH_TOP / PLINTH_H
0.56 (photo cap top 0.50), panel bottom 0.92.

## Capital depth = full pillar depth (2026-09-11)

portal_lib.CAPITAL_DEPTH is 0.85 / 0.725 (1.17): the capital's straight back
is at the back of the pilaster (y -2.05) and, on the piers, at the wall face
(x 1.60) so the pier capital touches the pilaster. The back-filling blocks
behind the capitals are skipped when the capital reaches the back.

Piers: the 12 mm raised strips on their passage and street faces were removed (2026-09-11); the faces are plain.

## Spandrel panels from the A/B pair (2026-09-11)

User's marks: the carving sits in a box from the pilaster to 0.33 m short
of the keystone, top on the blue line (3.98), foot on the yellow line at
the pilaster (3.13); its inner edge is a curve concentric with the arch,
ending in a tip, not a square. Now: side edge 0.09 in from the pilaster
(x 1.515), flat top 3.98, arc R 1.76 (foot at 3.15), a sharp tip at x 0.33.
The molding is lofted from exact inset outlines (one per profile point)
instead of a mitred loft, so the tip stays a point and the field recedes
from it; the spandrel's own profile is 0.05 wide with a 0.03 quarter-round
(the pilaster panels and the soffit keep three_part_profile).

Arch block: its sides now run 5 mm into the pilasters (BLOCK_HALF 1.61) so the hairline slit between them is gone (2026-09-11).

Archivolt: the three stepped strips became one band 0.12 wide (2/3 of 0.18), 5.3 mm proud (a third of the 24, +10%, then -40% for the base plate), R 1.48 .. 1.605 so its outer edge just touches the pilasters, one continuous piece behind the keystone; its outer fifth (0.024) is a rim standing 17.6 mm from the wall, the contour fillet seen in the close-up photo; its inner fifth is a second rim 54.5 mm from the wall (4x the outer rim's height above the plate), the bead-and-reel side (2026-09-11, user request).

## Stilted arch (2026-09-11)

The photo's intrados reads straight for about three notches above the pier
capital before it curves, and its soffit carving starts only at the curve.
Piece 06 now has STILT 0.10: the impost (pier capital top, block bottom) is
2.15 and the arch centre stays 2.25, so the crown, the band, the keystone and
the spandrels are unchanged. The straight jambs carry the same chamfer,
notches at the same pitch (distributed along jamb + arc + jamb) and the
band's straight legs; the soffit panel starts 0.02 after the curve starts.
The pier capitals are 1.91 .. 2.15 (0.24 tall). Not applied: the photo's
notches are about 0.09 apart, the model's 0.055.

Doors: DOOR_Y -0.55 (was -0.30): the gap between the back piers and the door leaves went from 1.67 to 1.42 m, 15% less, on request (2026-09-11).

Recess ceiling: a recess shallower than 1.8 m keeps one whole centre panel between the border beams (no end-coffer rows), and the rosette scales to fit it; the lamp hangs from its centre (2026-09-11, after the doors moved in).

Vestibule: hall depth 6.30 m from the door wall (was 7.00, -10%) on request (2026-09-11).

Archivolt profile (2026-09-11, user): three steps from the inner edge outward, band_steps(): inner fifth 5.3 mm; the riser to the plateau is a fifth of the width (25 mm, same as the tiny step's top face) so the plateau is 30.3 mm over three fifths; the outer riser is a fifth too, so the outer step is 55.3 mm; replaces the plate + two rims.

Bead-and-reel (`arch_beads`, 2026-09-11): on the band's tiny inner step, a 25 mm ball, a reel as thick as the bead through a flat middle and 40% at its ends (rises fast at the ends), a bead, beads squashed to 0.75 along the run, touching each other with no air, the reel length trimmed so whole units fill the run from impost to impost with a ball at both ends; sunk a fifth of a radius into the step.

Archivolt -10% (2026-09-11, user): band 0.1125 wide (fifth = 22.5 mm: outer step, risers, balls), plain strip to the notched edge 0.099; the band keeps touching the pilasters (outer edge 1.605), so the opening radius grew to 1.3635 (apex 3.61) and the piers are 0.2365 wide.

Leaf-and-tongue motif (`ornaments/arch_leaf.py` -> `arch_leaf.blend`, linked; 2026-09-11): a relief heightfield of the user's reference (cap bar, three stems, side leaves curling out, inner lobes, tongue), 27 x 59.5 mm with 12 mm of relief, instanced along the band's middle step at a 33 mm pitch with the cap at the outer edge.

## Whole building: `assemble_building.py`

`blender -b -P assemble_building.py [-- --no-render] [--samples N]` opens the game baseline
(`tests/artifacts/blender/bradbury/before/bradbury_block_before.blend`), removes the game's portal
parts, doors and steps on both portal faces (C, the Broadway entry looking +x at x 12.529, and E, the
game's mirrored copy looking -x at x -36.529), gives the ground floor the pink sandstone (as
build_portal_v3 did), fills the game's 5.6 m opening down to the 4.66 m this portal needs above the storefronts (collection
`PORTAL_FIT`), lays the storefronts out between EQUAL PIERS all around (user, 2026-09-12: the pier width is the
portal's pilaster shaft 0.725 plus the 0.08 strip on both sides = 0.885, `PIER_W`; the game's bays are read off
each hull face in order and, between two fixed edges (a building corner, whose column shows a 0.885 face on each
street, or the strip beside a portal pilaster, which the storefront runs straight into), scaled by one common
factor so the piers take exactly that width; the game's mirrored copy left a 4 m blank on each side of the
square NW corner, so a copy of the E face's standard bay fills it, `EXTRA_BAYS`; and the 3rd Street face A gets a
third portal, `PORTAL_A`, as far from the west corner as B's is from its north corner, with B's composition read
from that far corner, `MIRROR`: 2-glass, 3-glass, 2-glass, portal, 2-glass, 3-glass, then 2-glass fillers and the
door bay at the chamfer, the bays left over removed, so A equals B by construction, the portal itself a linked
instance; user 2026-09-12), the ground-floor piers
`fit_piers` are one ring on the wall plane with every storefront and both portals cut out (piers between
storefronts, corner piers with two street faces, narrow strips beside the portal pilasters), each bay's game
parts (fascia, transom, glass, frame, backdrops, divider) are stretched onto their opening in the bay's own
frame and moved out of the game's deep recess to the bay's inset behind the pier face (`INSET` 0.20; the
three-pane storefronts, the game's 4.06 bays, twice as deep, `INSET_WIDE` 0.40; the glazing frame 1 cm behind
the sign band's plane), raised so the transom ends on the band strip, and the game's wall and
interior shell (both hidden for now) are carved open around them (bisect + delete, since an exact boolean on
the game's open wall shell is unreliable), LINKS this project's `PORTAL` collection from
`bradbury_portal.blend` as two collection instances (`PORTAL_C`, `PORTAL_E` in `BRADBURY_PORTAL`; the
building always shows the portal's latest saved state, so rerun a piece and reopen) and builds the
ground-floor entablature around the building (`GROUND_ENTABLATURE`, from the photos and the user's review: a
small half-round bead 0.03, the teeth right above it standing on the wall itself (88 flush across the band, 44
from each edge to the middle of the lettering, gaps 60% of a tooth: 0.033 wide, 0.06 tall, 0.04 deep, pitch
0.053, the same around the building and on the jog's returns), a small 0.03 band flush with the teeth faces
that they connect to, a gentle convex molding (a shallow arc 0.12 tall and 0.10 out) on it, a thin squared
step 0.025 with a 6 mm round on its outer edges, top and bottom; 0.265 m in all, 0.16 m out; over the portal a block
(`fit_band_top_*`) carries the band's face and ends up to the cornice; all of it in the portal's own
frieze-band stone, no ashlar joint lines) on the
frieze band's top (world z 5.151), jogging out 0.20 over the band on both portal faces and stepping BACK 0.20
(`RECESS`: the portal band's step, and the three-pane storefront's own extra inset, so the edge over it reads like
the two-pane bays'; user 2026-09-12, reference) over every three-pane
storefront together with the band strip, the zone wall and the crown (the game's band wall is carved away over
those bays and the pocket lined, `fit_recess_*`, in the ashlar stone; teeth on the recess returns too, at the
regular pitch); the band's own strip
(`ge_band_strip`, 4.481 .. 5.156, 2 cm proud and 0.55 into the wall like the pier ring, past the deepest
storefront inset, the portal's stone) continues around the building under the bead; the game's two
ground-floor cornices (4.572 .. 4.842 and 5.842 .. 6.092) are removed, so are its flat cap planes on the wall top
(`roof__5`, `roof__6`, zero-thickness rings at 4.572 that showed as a lip inside the recess pockets), and its plain
band is stretched from the wall top (4.572) to the second floor (6.092); the game's ground-floor wall `wall__0` is hidden (eye + render), not
deleted: the wall is to be replaced by pillars later; the game's interior shells (`interior__*`, every floor) are
removed: the windows carry their own backdrops and the shells showed as white strips above each floor line (user
2026-09-12). The brick wall of floors 2 to 4 is rebuilt from scratch (`wall_floors_2_4`, user 2026-09-12): one closed
ring around the hull on the elevation's plane (`WALL_OUT` 0.20 out from it) and 0.25 thick (`WALL_T`), with a brick column on each side
of the pair over the Broadway and E portals unioned into it (`COL_W` 0.80 like the pier blocks it stands on,
flush with them, from the crown to the mid cornice) and two more of the same block on the Broadway face, over the
first storefront pier out from the portal on each side (user 2026-09-14, and the reference's own facade, which
carries a pilaster over every pier): same width, same height and the same front plane, so all four columns of the
face stand together (user), clear of the ground floor's crown, which reaches 0.365 out. One rectangular hole per window set (from the sill's
top to `RECESS_ABOVE` 0.30 over the frames, exactly as wide as the sill, which runs `RECESS_SIDE` 0.03 past the
set's boxes on each side); a separate panel mesh
per set (`panel_*`) sits in each hole, `RECESS_D` 0.06 in, filling the rest of the thickness, with the set's
window holes cut through it 1 cm inside the frames. The recess belongs to the window, not to the wall (user
2026-09-14, the way the top floor is built): the hole is cut out of the wall's own faces instead of bored
through it, so the wall keeps no reveal, and the panel brings its own -- four faces standing from its front out
to the wall's plane (`reveal_faces`) -- so a window and its recess are one object to pick up and move. Wall and
panels carry the game's brick material with the old wall's texture scale mapped along each face and up; the game's `wall__8` with its proud columns, end piers,
stepped capitals (`bay_capital__*`), recessed panels and separator strips is removed; the end bays' sills and
the chamfer bay's window parts come onto the field's depths first, and the end bays' windows, which the game
set 0.20 nearer the street to match its proud piers, go back to the common frame depth so every window has
the same reveal; the corner's three single windows get the same margin from the corner edge (the chamfer's,
centred on its face, sets it; the two end-bay windows slide to match). A window plus two margins from each chamfer
corner is where the corner's wall area ends, on the fourth pier (user 2026-09-12; a red marker line stood there
while that was being planned and was taken down once it was settled, user 2026-09-15); the corner is re-planned to
that line (user 2026-09-13): the two door bays beside the
chamfer become single-glass storefronts as wide as the chamfer bay (`CORNER_BAY_W` 2.231: copies of the nearest
two-pane storefront without the divider between its panes, held at that width by the layout), so corner pier, bay
and fourth pier span the marker distance; everything beyond the fourth pier moves toward the corner by `SHRINK`
0.502 on both faces and the outline follows (`HULL`: the north and west faces moved in, `HULL_GAME` the game's;
the game's geometry is moved onto it first thing, object by object, or vertex by vertex for the meshes that run
around the building, where a 0.502 strip of excess along each moving face is squeezed shut, slid per mesh so its
ends fall between the cornices' modillion blocks, the blocks inside it removed; the far faces' storefronts are laid
out again over the shorter faces); on the top floor the
corner's single windows and their arched holes in `wall__21` slide toward the corner to centre over the windows
below, like the chamfer's, and the flush pilaster closing each corner bay (the game's 3.929 .. 4.429, with its
impost and the parapet pedestal over it) moves whole to end on the marker; each upper-floor window's rearmost backdrop plane, a photo atlas of furnished rooms hidden behind the grey pane
over the glass, is removed with its image (user 2026-09-13; the atlas is found as the one image whose users are all
flat four-vertex planes and which is not the dark shop silhouette behind the storefront glass); the top floor's
panes, which the game tinted near white where floors 2 to 4 tint the same texture nearly black, take the material of
the floors below so every window above the storefronts reads alike (user 2026-09-13); and
the game's `wall__8` with its proud columns, end piers, stepped capitals
(`bay_capital__*`), recessed panels and separator strips is removed; the end bays' sills and the chamfer bay's
window parts come onto the field's depths first, and the end bays' windows, which the game set 0.20 nearer the street
to match its proud piers, go back to the common frame depth so every window has the same reveal. Every window sill box (`bf2_window_decoration__*`) is replaced in place by a
molded sill (`sill_*`, 0.10 tall, 0.05 out: a convex curve leaving the bottom at 10 degrees on a large radius into
a concave cove rising more than it projects and ending at 15 degrees, rounded into a vertical fillet, then a cap
overhanging it by 1 cm with two softly rounded front edges), one sill per set of windows spanning its two or three
boxes, its top at the frames' bottom; above every portal the windows the game happened to leave there go and a copy
of the nearest pair (frames, glass, backdrops, sill and, on the top floor, the panel) sits centred on the portal, the
rebuilt wall taking its holes from them (user 2026-09-12, every face and every floor above the storefronts);
user 2026-09-12, reference). Above the
cornice, up to the second floor: over the portal a pier block (`fit_pier_*`, 0.80 wide, flush with the band's
outer end) stands above each pilaster on the band plane and the zone between them (`fit_inset_*`) is inset 0.12
behind the block faces, with a small bar (`fit_bar_*`, 0.08 x 0.03) under the crown and a row of eleven rectangular
openings (0.18 x 0.34, 0.25 deep, the first and last starting right at the pier blocks) cut into the inset face
right below it; a crown molding `ge_crown`
runs around the building at its
top, about 0.17 tall to 0.15 out under a square edge 0.06. Its curve is an S (user 2026-09-16): a hollow sweeping up
out of the wall and a small convex crest rolling over into the square edge, the turn between them `M_S_TURN` 0.70 of
the way up the chord, so most of it is the hollow. `M_HOLLOW` 0.028 is how far the sweep hollows in from its own
chord, `M_BULGE` 0.015 how far the crest bellies out of its own -- the crest's round came down in the user's steps,
0.05 halved and then 40% off that again, while the arc kept its reach and its rise. The stack is built bottom-up from
the cornice step: the openings start
right on it, the bar sits on the openings, the crown on the bar, and the crown's square edge lands on the second
floor line (6.092): nothing of the plain wall band shows above it (user), the brick sits right on the edge. A foot
`M_FOOT_H` 0.20 tall then stands on that edge, the entablature's last member (user 2026-09-16): a square band taking
`M_FOOT_TAKE` 60% of the crown's projection, so 40% of the top ledge still shows outside it, with its top `M_FOOT_R`
2 cm rounded over convex. It rises past the floor line, against the foot of the brick rather than under it, and the
second floor's windows stand on it (user 2026-09-16): the foot is their sill, so they have none of their own and each
is 0.35 taller than it was, its head where it was and its feet let down onto `FOOT_TOP` 6.292. Only what is below the
meeting rail moves, so every rail keeps its thickness and the lower sash alone grows; the set is read and its panel
cut where the game left it and `drop` says how far that one comes down, because a bounding box is cached and editing
a mesh does not refresh it. Each window takes a copy of its mesh first: the game's windows share theirs, and without
that every floor moved 46 times over. The same row runs over the two storefronts beside the portal
(user 2026-09-12, reference): an edge capital (`fit_cap_*`, the pier plus the blocks' extra width inward, only
0.08 proud since the cornice ledge is 0.16 deep there) stands over the pier each of them shares with the
three-pane bay, the zone from the portal's block to it is a slab at the wall plane (`fit_zone_*`) with its own bar
and a row of openings at the portal row's pitch, and the crown jogs out over the edge capitals.

Every part of that zone is one solid, built the same way (user 2026-09-15: the edge capitals were a thin front
plate with the game's wall still standing behind it and a small backing plate beside it to cover the end of the
openings row -- "a side wall with a top cover, and another wall underneath"). The run from one edge capital to the
other is tiled by boxes that all reach `ZONE_IN` 0.30 into the wall -- capital, side slab, pier block, inset, pier
block, side slab, capital -- so each one closes the 5 mm overcut of its neighbour's end opening by itself and none
of them needs a lid. The game's band wall is carved out of that whole volume in one pass (`carve_faces` on `w7`
over the run, capitals included) instead of a pocket behind the openings only, so nothing of the game's is left
under them. Where an edge capital stands against a three-pane bay's recess, the capital's own outer face is the
pocket's side wall for its height, and the liner's side there (`fit_recess_*_L/R`) stops at the zone's bottom: the
crown's step closes the pocket above, and two stone walls in the same plane would fight.

Placement: the portal's spandrel face (y -2.70) goes on the wall plane, its sidewalk (z -0.12) on the
building base (z 0.201), so its threshold lands on the game's step top (0.321) and its frieze top at
5.121; local +x runs along the face to the viewer's right (a rotation, so the lettering reads correctly
on both faces). Output: `tests/artifacts/blender/bradbury/portal_project/bradbury_block.blend` (links
`//bradbury_portal.blend`; open it in Blender to see the whole block) and review renders
(`block_portal`, `block_portal_quarter`, `block_entablature`, `block_corner`, `block_back_portal`) in
`tests/artifacts/screens/bradbury_fix/portal_project/building/`.

Every window set on floors 2 to 5 is centred on the storefront bay below it (user 2026-09-13): the ground floor's
layout is the rhythm and the sets, which the game had spaced evenly, slide along their face to sit over it. A set is a
sill and everything standing on it. Sets and bays are paired in order along each face by the pairing that moves the
least in total, so a face with more bays than sets leaves one blank, which is what happens at the extra bay by the NW
corner. Each set goes to a bay of its own size (user 2026-09-15): the three-window set over the three-pane
storefront, the pair over a two-pane one, the single over a corner bay, and only among the bays that fit does the
pairing take the one that moves least (`pair_up`, a bitmask assignment rather than an in-order one). It is not
ordered along the face: on the 3rd Street face the game's triple stood before its three-pane bay and crosses the pair
to reach it. The sets standing over a portal travel together, centred on it, and where they cannot fit between their
neighbours (`MIN_PIER` 0.40 of wall on each side) the one furthest from the portal goes. Over each portal every floor
above the storefronts carries one copied pair, on all three entrances.

The game's three fire escapes, all on the 3rd Street face, stayed where it hung them while the window sets moved onto
the bays, leaving one over blank wall: the middle one is removed and each of the others slides onto the set nearest
it, so a stair always stands in front of windows (user 2026-09-15).

The whole elevation stands on one plane, `WALL_OUT` = `JOG` = 0.20 out from the hull (user 2026-09-15). It had been
layered: the brick field of floors 2 to 4 sat 0.20 *behind* the hull and the top floor's 0.08 behind it, while the
corner bays, the game's own cornices and the portal's band stood 0.20 in front, so the wall over every storefront
was a step behind the wall at the corners and the ground floor's stone hung out over both. Now the field walls come
forward onto the corners' plane (floors 2 to 4 by 0.40, the top floor by 0.28, their windows, sills and panels
travelling with them so every reveal keeps its depth), the ground floor's stone follows -- pier ring and band strip
`STRIP_OUT` 0.02 proud of it, bead, dentils, cornice and crown on it, the game's band wall `wall__7` pushed out to
it as the wall above the storefronts that it is -- and the portal goes forward the same 0.20, so its band still
jogs `JOG` ahead of the wall and its four brick columns stay flush with it. Only the storefronts stay where the game
left them, which makes them 0.20 deeper behind their piers (user: fix later if needed). The corner projection is
gone with it: there is nothing left for a corner to project from, so `CORNER_OUT`, `end_stretches`, `in_corner` and
the corner jog in `jogs_of` are all gone, and `loop` instead takes a `base` -- the whole loop offset -- and mitres
every corner with it (`corner_reach` still gives how far a run carries on past a corner to reach the mitre, and
`full_face` uses it for the dentil runs and the top floor's slabs). The top floor's wall is now one plain slab per
face, corner to corner.

The game's two cornice bands and its parapet come out the same 0.20 (user 2026-09-15), or the mid cornice -- whose
cap already sat at exactly 0.20 -- would have finished flush with the wall it caps and the top one would have lost
as much of its reach. Each is one mesh wrapping the building, so `push_out` moves it vertex by vertex: every polygon
is assigned to a face by its centre (`face_at`), a vertex takes the faces of the polygons that use it, and one that
two adjacent faces share goes to where their two offset planes cross (`mitre_out`) instead of being dragged back to
the corner by one of them. Vertices are matched by position rather than by index, since the runs are not welded
where they meet, and a run that stops just short of or just past a corner is mitred too: without that the bands tore
open at the chamfer, a 0.15 slot in the bracket course. The band wall is first pulled back onto the hull, because
the game set its chamfer run 0.05 proud of it (as it did that bay's window parts, `CHAMFER_OUT`), which had buried
the band strip and the whole dentil course on that face.

The brick of floors 2 to 5 sits `BRICK_BACK` 0.30 behind that plane (`BRICK_OUT` -0.10), and its columns and the
building's edges stand `COL_RELIEF` 0.30 proud of it (`COL_OUT` +0.20) (user 2026-09-16): the ground floor's stone
reads as the base it is, each course standing further out than the wall it carries -- brick at -0.10 with its columns
at +0.20, then the field cornice at +0.330 and crown at +0.365 over them, then the portal's own at +0.530 and +0.565.
It came back in three steps: 0.10, then 0.10 more with the columns held (which is why `COL_OUT` was briefly a plane of
its own), then 0.10 with everything together. The whole mass now moves on `BRICK_BACK` alone and the relief on
`COL_RELIEF`, independently. Before the first step the columns reached 0.035 PAST the crown's square edge they stand
on, an overhang that predated the one-plane move; they now clear it by 0.165, and by 0.245 where the crown breaks over
an edge capital. The whole wall moves, not just its face -- the columns are unioned into the ring and every window
reveal is measured from its plane -- so the windows, sills and panels of floors 2 to 4 and of the top floor travel
with it; every one of the 144 panels lands on the wall plane.

The building's edges come out to the columns' plane too (user 2026-09-16): `end_stretches` gives, for every face, the
stretch from each corner back to the second pier the ground floor has there -- the pillar the extrusion starts at --
and the wall of floors 2 to 4 and of the top floor projects across it to `COL_OUT` +0.30, the same depth the columns
have, with the windows, sills and panels standing in it coming out the same 0.30. Each stretch is carried past the
corner by `corner_reach` to where the two faces' projecting planes cross, so an edge reads as one mitred mass and not
a step; on floors 2 to 4 the stretch is unioned into the ring, on the top floor it is a slab of its own (corner,
field, corner). The chamfer is one bay wide, so the whole of that face is corner. Nothing under them has to move: the
crown's square edge already reaches +0.365 in the field, so a corner at +0.30 lands on it.

Each long face has a centre pavilion that behaves the same way (user 2026-09-16). The game gives the middle of the
3rd Street and north faces the treatment it gives a corner -- the wall standing proud and three parapet pedestals on
it, the outer two deep and the middle one shallow -- but putting the top floor back as one slab per face had
flattened it, leaving a plain wall under its own crown. `game_mids` reads it again off the game's wall (`wall_runs`,
the proud runs that are not the face's own ends) before the top floor is rebuilt, and `mid_stretches` lays it on
`MID_BAY` 6, the seventh bay in from the start of the face, running from the far edge of the pillar on one side to the
far edge of the pillar on the other (user 2026-09-16) -- the bays' own edges, `targets`, not the window groups' -- so
its returns stand on the pillars under them instead of half way across them, the way a corner stretch ends on its
pier, and it still breaks between two window groups and never across one. `out_stretches` is then
the corners and the pavilion together, and everything that was written for the corners -- the union into the ring on
floors 2 to 4, the slab per stretch on the top floor (now any number of them, not just corner-field-corner), the
plane each panel is measured from -- follows without a special case. The game's own s is no use for placing it: the
window sets have since moved onto the ground floor's bays and left it standing in the gap between two of them, and on
the 3rd Street face the pairing crosses, so `wall_warp` is skipped there and the wall could not even follow its sets.
Bay 6 is what the north face's wall does land on where it can follow, and it is the bay the user marked on 3rd
Street. The three pedestals then slide onto it, keeping the spacing the game gave them.

The building is one bay longer than the game shipped it (user 2026-09-16, and the reference's own facade): a new
two-window column on each long face, between the 3rd Street pavilion and the bay the fire escape hangs on. It is let
in before anything is measured off the geometry -- everything east of the cut moves out `BAY_GROW` 4.465 and the runs
that wrap the building stretch with it, vertex by vertex -- so the outline, the excess strips, the bay layout and
every ring built later simply follow the two longer faces (45.73 -> 50.19 and 48.56 -> 53.02). The two faces' window
rhythms are staggered and no single x is clear on both, so each takes its own cut in its own gap (`BAY_CUT_S` -2.43,
`BAY_CUT_N` -0.87) and the runs take a third between them (`BAY_CUT_X` -1.60), slid per mesh until it lands clear of
that mesh's own small elements -- the same trick the excess strips use. A run's vertices take their own face's cut,
not the mesh's one: the wrapping runs carry both faces, and a single cut that is clear on 3rd Street falls inside a
window bay on the north face. `wall__21` was stretched that way once and the panel it stretched came out lopsided --
its left half 2 cm shallower than its right, its rim tighter than its own lights, and the wall's cut left standing on
the glass. Cut per face, that panel now matches its neighbours layer for layer.

The gap is then filled with a copy of the two-window column just west of it, one bay east: its storefront only, since
that is what makes the layout count one more bay. The windows come from a general step at the end of the set move --
any bay with no set of its own takes a copy of the nearest set of its size, slid onto it, on every band alike -- so
the new column carries the same two windows on every floor, and the spare bay by the NW corner, blank since the
beginning, is filled too. The fire escape is left out of both copies. `column_spans` then gives the new pier its own
brick column without being told.

Two probe caveats, both the same kind: the probes carry their own copy of `HULL`, so they had to grow with the
building (11911 false backfaces and slivers at every height until they did), and `probe_backfaces`'s bands are
absolute heights, so the two upper ones had to rise with `UPPER_LIFT`.

The mid cornice's ornament is off for now, to come back with a different design (user 2026-09-16): the carved band
between the top floor and the one below it, on the mid cornice (`cornice_ornament__2466`, z 15.09..15.33). It is
picked by height, not by name, so a rebuild finds it wherever the game's numbering lands; the top cornice keeps its
own, the rich course at the head of the building under the parapet.

A capital stands at the top of every brick column (user 2026-09-16): the portal's own pilaster capital, `CAP_SRC`,
scaled whole -- 0.951, so the carving keeps its proportions. It starts where the window recess ends, `CAP_BOT` 15.242
(the panels' own top, read off them), and the column stops there too rather than running past it. Its base sits on the
column's face at `COL_OUT`, which puts its front at +0.312 and its flare proud of the shaft; it is 0.919 wide on a
0.80 column, centred on its span, its back running on into the wall where nothing sees it. The mesh comes from the
linked portal, so the capitals are built after the link, not with the wall.

The room for them is made by lifting everything from the mid cornice up -- that cornice, the top floor with its
windows, the top cornice, the parapet and the roof -- by `CAP_LIFT` 0.300 (user 2026-09-16; since 2026-09-17 the
first 0.300 of `UPPER_LIFT`, see the band below). The brick of floors 2
to 4 is built to the lifted underside, `WALL24_TOP` 15.632, so the band the lift opens over the fourth floor's windows
is plain wall and not a hole, and so is the band the removed ornament leaves. `roof__18`, `roof__19` and `roof__20`
are dropped with it: they were unused and put a lip over the fourth floor's window heads.

A probe caveat: `probe_backfaces`'s bands are absolute heights, so the two upper ones had to rise with the lift
(15.80 -> 16.10, 21.00 -> 21.30). Left where they were, they start inside the lifted cornice and every downward ray
hits its underside -- 8072 false backfaces, none of them real.

The band between floors 4 and 5 (user 2026-09-17, photos 1-3 of the reference; the brackets and the two cornices of
photos 4-7 are still to come): a rectangular band, `ge_band45_<face>_<k>`, on every deep run of every face -- the
field from a corner stretch's end to the centre pavilion and from the pavilion to the far corner, six runs in all --
standing on the capitals' top, `B45_Z0` = `WALL24_TOP` 15.632, up to `B45_Z1` 16.362. Its face is `B45_FRONT` +0.14:
`B45_STEP` 0.06 behind the raised bays' plane, the depth of the window recess (`RECESS_D`, asserted equal; photo 2's
"same depth"), so it makes a small step with them and never stands past them, and 0.24 proud of the field. It is
separate geometry from the wall (user), one box per run with its back in the wall (`BRICK_OUT - WALL_T`), in the
wall's own brick with the same course mapping, `BRICK_UV`, for now. The raised bays -- the corners and the centre
pavilions, "where the wall is less deep" -- carry none of it: their wall of floors 2 to 4 runs on up past 15.632 to
the band's top (the `out_stretches` union boxes reach `B45_Z1`), and the top floor's raised slabs start there rather
than at the floor line, so the gap the lift opens beside the band is closed by their own brick and the one seam is at
the band's top, where the top cornice will sit. The field slabs still start at `TOP_Z0`, their feet hidden behind the
band. The game's mid cornice, `cornice__2465` (picked by height, like its ornament), goes: the band takes its place
and new cornices at the band's foot and head are to come.

The band's stack is decided now so the lift is done once (user: the fifth floor has to move up for it): over the
capitals' top, `B45_STEPS_H` 0.08 for the bottom cornice's two steps and edge (the band box covers that strip until
the cornice is built), `B45_H` 0.65 of band (photos 1, 4 and 5: about 0.3 of the fourth floor's window height),
`B45_TOPC_H` 0.28 for the top cornice, and the fifth floor's sills stand on that at `B45_TOP` 16.642. Everything from
the mid cornice up is therefore lifted `UPPER_LIFT` = `B45_TOP` - `SILL5_GAME` (the sills' underside as the game has
them, 15.990, asserted at the lift) = 0.652, of which the first 0.300 is the capitals' room. Sections through the
band at 15.70, 16.00 and 16.30 read +0.14 on every deep run and +0.20 on every raised stretch, no misses; at 16.45 and
16.55 the plain top-floor wall shows above it (-0.10 field, +0.20 raised) and at 16.70 the sills; six sliver heights
through the band and the lifted top floor are clean and all twelve plane changes on the top floor still read a return
`-0.42..+0.20`. Not decided by the photos: whether "the window recess" is the 0.06 panel recess taken here or the
0.21 from the wall face to the frame, which would put the band's face at -0.01, only 0.09 proud of the field.

The brackets under the band (user 2026-09-17, photos 4 and 5, "dentils"): consoles hanging from the band's soffit
between the brick columns only -- nine over a three-window bay, six over a two-window bay, three over the single
window of the spare bay by the NW corner (`BRK_N`, the count read off the fourth floor's frames with `n_windows`) --
spaced evenly from column face to column face, none over the raised bays, which carry no band; 186 in 28 bays. Each is
`BRK_H` 0.34 tall, 0.14 wide at its head and 0.10 at its foot, flush with the band's face: a rectangular head only
`BRK_HEAD` 0.04 tall (user, second round: "a few cm", the first cut's 55% was far too much), then a hollow taper
back and down to a foot still `BRK_FOOT` 0.05 out; in the capitals' stone
(`PORTAL_sandstone_carved`, procedural, no UVs needed), one mesh per bay (`ge_bracket45_<face>_<run>_<bay>`), its
top on the band's foot. The capitals' abaci, 0.312 out, still stand past the band's face (+0.14): the capital is the
portal's own at the user's request and was not touched.

The cornices at the band's foot and head (user 2026-09-17, photos 6 and 7). Both go right round the building, over the
raised bays as well, and follow the silhouette: they are swept on the wall's own outline at their height, stepping out
over every raised stretch (`silhouette_jogs`, the `out_stretches` as jogs for `loop`, a corner stretch opening at its
face's start or closing at its end so the corner is mitred at the offset), so neither is interrupted where the band
ends. The bottom moulding (user 2026-09-17, second round, with a photo of the bracket course and one of a corner;
two earlier cuts had the wrong stack -- a strip down the whole capital zone, then steps rising straight from the
brackets' heads), bottom to top on a deep bay: the brackets; then, right on their tops (a thin plate between the two
was tried and taken out again at the user's request, the moulding let down the 2 cm it took), on the band's
outline (the band's face and the raised bays' wall, 0.06 apart), a taller band `C45_BAND_H` 0.10 only `C45_BAND`
0.5 cm proud of the wall it is on, a step 0.03 out and tall, a smaller step (0.045 out, 0.02 tall) and an edge ring
(0.06 out, 0.03 tall) with its outer corners rounded `E_EDGE_R` like the ground cornice's (`ge_cornice45_bottom`,
`moulding45_profile`); then the frieze. On the recessed bays "that band is extruded": the band box is the extrusion,
standing on the brackets' and capitals' tops at 15.632, the moulding's members on its foot and the ornament above
them; on a pavilion the same members stand on the wall, a plain band with a small ledge over it. `B45_STEPS_H` 0.18
for the moulding, `B45_H` 0.55 for the frieze, the band's top and the lift unchanged. The top cornice, on the band's top (`ge_cornice45_top`): a course of dentils 0.07 wide, 0.08
tall, 0.05 out at a 0.12 pitch on a backing plate 0.5 cm proud of the band (`ge_teeth45`, boxes along every run of the
band's outline with a 3 cm margin at each break and corner, as the ground floor's teeth are laid), a very small step
over them (to 0.06), a convex curve (0.08 out, 0.12 up, the ground cornice's gentle arc) and a square edge (0.02 out,
0.04 tall); 0.26 in all, the fifth floor's sills 2 cm over it, its edge 0.30 out on the field and 0.36 on the raised
bays.

Both mouldings are one mitred sweep each round the band's outline (`band45_path`: `loop` on `B45_FRONT` with
`silhouette_jogs` of 0.06 over the raised stretches), so at every break the profile turns the corner with the wall,
twice, a double L in plan (user 2026-09-17, third round, with a photo of a break: they must not end at the wall's edge
as two disconnected pieces). A first cut had built them as capped pieces per run -- a deep piece at the band's face
and a raised piece at `COL_OUT` meeting at the wall's return -- out of respect for the crown's fold at the edge
capitals. Working that fold through, it is not the shallow break that folds a mitred sweep but a *segment shorter than
the mitre reaches of the two corners bounding it*: a ring at a corner of turn t carries a profile point |o| along the
path by |o| tan(t/2), so between two same-sense corners closer than the sum of those reaches the back points cross
and the quad between them turns inside out -- the 0.80 edge capital against the crown's 0.44 back, whose soffit is
what showed black. A break's 0.06 return is bounded by a concave and a convex corner, whose mitres shift the same way
and never cross, and the raised and deep runs on either side are metres long; the mouldings' backs reach 0.30. The
backface probe, run at nine heights through the two mouldings, finds no first-hit backface at any break. Sections through the stack read, on every face, the
brick between the brackets and capitals at 15.45, the taller band +0.145 (+0.205 on the raised bays) at 15.64 and
15.70, the step +0.17 (+0.23) at 15.75, the smaller step +0.185 (+0.245) at 15.77, the edge ring +0.20 (+0.26) at
15.80, the band +0.14 at 16.00 and 16.30, the dentils at 16.40, the curve +0.24 (+0.30) at 16.50, the edge
+0.30 (+0.36) at 16.60, the plain wall at 16.63 and the sills at 16.70, with no miss anywhere; the backface count did
not move (the same 4 and 23 as before the band), no slivers at twelve heights, no open junction. Each moulding is one
ring of 31 path points; 1460 dentils.

The game's own Bradbury textures (user 2026-09-17): the export had drawn every brick surface in the generic
`pbr.red_brick`, but the catalog carries `pbr.bradbury_wall_terracotta_brick_tileable` (Roman terracotta brick,
tileable both ways, `tileMeters` 1.4) and `pbr.bradbury_top_band_terracotta_ornament` (the frieze's medallion field).
`pbr_material` builds each as a Principled material from the catalog's own files -- `basecolor.jpg` in sRGB, multiplied
by the packed map's red channel (AO); `arm.png`'s green to roughness and blue to metallic, as the game reads it;
`normal_gl.png` through a normal map at strength 1 -- with every image path relative to the .blend
(`bpy.path.relpath`, the same `//../../../../../assets/public/pbr/...` form the relinked maps use). The brick goes on
every mesh that used a red-brick material (`PBR_bradbury_wall_terracotta_brick_tileable`, 1.4 m tiles on the
metre-based UVs the walls and panels already carry; the export's six red-brick materials -- the walls, the panels, the
top floor, two roof strips and a few window parts, 167 meshes -- are left unused). The ornament is not a repeat vertically -- the catalog
notes say so: the central field only, four columns by three rows on a 4:3 patch, for clamped band placement, and
"keep the mapped band 4:3 or the medallions go oval" -- so the band boxes get their own metre UVs (`band_uvs`) and a
mapping that spans the image once from the moulding's top to the band's top (`B45_H` 0.55) and repeats it every 4/3
of that, 0.733 m, along the band: three rows of round medallions 0.18 m across, which is what the photos show. V is
clamped in the node tree (separate, clamp, combine) and U left to repeat: an image's own extension mode clamps both
axes at once, and a first cut that used it smeared the ornament's edge column along the whole band. The catalog's
height maps are not wired, as the game does not use them.

The two base colours retouched at the source (user 2026-09-17, with a reference photo: brick-to-brick variation, and a
band in the brick's own tone): the catalog's `basecolor.jpg` of both sets is rewritten by the scratchpad's
`retouch_bradbury_pbr.py`, which reads the originals from its backup (the source archives in `downloads/` keep them
too). The brick tile was one flat colour per strip repeated 72 times, which read as a pattern; every strip now carries
its own tint -- lightness drawn uniformly in 0.93..1.07 (no distribution tails: the first passes drew from a normal
with an 8.5% and then a 5% spread, and it was their tails, strips at 0.80 or 0.88, that stood out and "fought with
each other"), a warm/cool drift of up to 2% and a saturation of 1.0 to 1.05, never below the source's -- with the 16
course grooves and the joints
read off `height.png` and left untouched, so the wrap rows and joint columns are exactly as they were and the tile
still tiles (a strip that runs across the side wrap is one strip and gets one tint). The band's base colour, which was
lighter and more orange than the brick, is moved by three per-channel gains onto the retouched brick's mean times
0.88, the brick's tone a little darker, with no clipping. Both configs' `albedoNotes` record the retouch. Note that
`assets/` in this worktree is the main checkout's folder, so the retouched files are the one shared copy.

The bricks were 10% too big (user 2026-09-17): the brick set's `tileMeters` is 1.26 now, in its config and in the
material (`BRICK_TILE_M`). And the brick is tiled in bands to fight the repeat (user): in the material, every row of
tiles, one tile tall, is shifted along the wall by its own whole number of strips -- a white-noise hash of the row
picks 0 to 3, and that many quarter tiles are added to u -- so the bond runs on unbroken while the tile's repeats no
longer line up from one row to the next. That is a shader-side offset the game's material system has no field for;
the tile itself still repeats every 1.26 m within a row, and only a wider map with more independently tinted strips
would lengthen that.

The joints get more accent, in all four maps (user 2026-09-17): every course groove and joint is widened by 2 px on
each side with a third at half strength (about 2 mm a side at 1.26 m per 1254 px), and in that zone the base colour is
painted with the groove's own colour made 18% darker, the height is cut to the groove's floor less 10, the roughness is
raised by 0.10 and the AO taken down to 85%, and the normal map is recomputed from the new height in a band a pixel
wider than the zone, with its strength matched by amplitude to the original normal in that same zone -- the spread
of the original's x and y components over the spread of the original height's gradients, one factor per axis, OpenGL
+Y; a least-squares fit collapses because the AI-estimated normal's features sit a pixel or so off the height's -- so
the recomputed edges read as strongly as the untouched ones, and the tile stays periodic (every edit rolls round the
wrap). Everything is re-derived from the backed-up originals each time
`retouch_bradbury_pbr.py` runs.

The strip faces read as wood, not clay (user 2026-09-17): the AI drew every strip with fine horizontal streaks -- in a
strip the detail varies three times more across the rows than along them, in the colour, the normal and the roughness
alike -- which is grain. Each face is rebuilt as clay instead, in `retouch_bradbury_pbr.py` before the tints: from its
own mean colour, a soft mottle (periodic noise blurred to a 14 px blotch, +-1.5% lightness; a first cut at 3.5% read
as a dark pattern, user), a fine isotropic grain (+-1.0%) and sparse pits (one per 1400 px, 6% darker at the
centre); the height gets the same three at a shallow
relief and the roughness too (pits rougher and darker in the AO), and the normal map is now computed from that height
over the whole tile, joints and faces alike, so no grain survives anywhere. All the noise is made periodic through an
FFT blur, so the tile still wraps. The original maps are unchanged in the backup and the source zip.

The trim in the band's own colour (user 2026-09-17): the band's two mouldings with their dentils and brackets, and
every window sill (117 of them, which the export had in thirteen copies of the game's `terracotta_smooth` material,
rendering dark brown), and the capitals (user, third round), now share one material, `PBR_bradbury_terracotta_trim`
(`trim_material`). Its colour is the band's own mean, taken in linear light from the band file's pixels
(`linear_mean`; bpy hands an sRGB image's pixels over as raw bytes), as a flat base; the surface comes from the
normal and ORM maps of the game's `terracotta_smooth` set, the material the config gives the sills. Over the flat
base goes a slight variation the way terracotta varies -- piece by piece, the trim being blocks each fired a little
differently: a cell noise (Voronoi F1) about 0.7 m across gives every piece its own tone, +-1.5%, with a fine grain
over it (a noise at 40 per metre, +-0.8%). Three earlier cuts all showed as a pattern on the cornice's ledges: one
metre-scale noise at +-8% read as blobs; cells at +-4% still read as patches; and the set's own base colour, gained
up 2x onto the band's tone, carried soft patches of its own, so it is no longer used. Its maps are box-projected on
object coordinates (`projection = 'BOX'`), so the swept
mouldings, which have no UVs, take it as the sills do, tiled every 2 m rather than the catalog's 4 so the surface
detail shows at a moulding's scale.

The band as a framed panel (user 2026-09-17): the ornament field sits inside a plain margin `B45_MARGIN` 0.06 on all
four sides, in the trim's terracotta. The field keeps its size (`B45_FIELD_H` 0.55, the medallions 0.18) and the band
grows for the margin instead, `B45_H` 0.67, so the band's top, the top cornice, the sills and everything above rise
0.12 with it (`UPPER_LIFT` 0.772). Each run is built by `band_panel`: the front is nine faces, the field in material
slot 0 with UVs in metres from its own corner (so the ornament's mapping needs no offset and clamps at the field's
edges), the eight margin faces and the box's other five in slot 1, the trim. The margin is `B45_MARGIN` at the two
ends of a run as well, exactly the size it is above and below: a first cut gave the field whole medallion columns and
the rest of the run to the side margins, which came out anywhere from 0.061 to 0.135, not the same size on all four
sides as asked. Instead the field's UVs along the run are scaled by the nearest whole number of medallion columns over
its length, a stretch of at most half a column spread over a run's 68 to 137 columns (under 0.7%, printed at the
build), so no medallion is cut at the ends either. The probes' heights above the band rose 0.12 again.

The ground floor's stone (user 2026-09-17, a photo of the corner): the moulding under the brick -- the entablature
with its teeth, the band strip, the zone above it with its blocks, bars and openings, the crown -- and the storefront
piers are one smooth red-brown sandstone in the reference, darker and redder than the brick and without patches; the
model had them in the portal's pink ashlar (`PORTAL_sandstone`) and the piers in a darker, noisier stone
(`Sandstone_Pier`). They now share `PBR_bradbury_ground_stone`, built by `trim_material` like the trim: a flat colour
set against the brick's, `GROUND_RATIO` (0.64, 0.60, 0.74) of its sRGB mean per channel -- the photo has the stone at
about two thirds of the brick's brightness and redder -- with the smallest variation (+-1% per block, +-0.5% grain),
and the surface from the game's `brownstone` set, the smoothest stone in the catalog; its base colour is not used,
and the catalog's two red sandstones were both dark and patchy. The linked portal keeps its own stone. A block further down, from before this change, gave the entablature the portal's frieze band's stone once the
link had brought it in, and so handed the pink back to all of it but the piers: builds v64 and v65 rendered the
entablature pink for that reason. The block is gone (2026-09-18); the ground floor keeps its stone, and only the
linked portal is in its own.

The bay recess (user 2026-09-18, two photos of the inset bays, then a screenshot, a third photo and a second
screenshot): on the inset walls the window area of each bay -- its window sets, which stand one over the other on the
three floors, and the wall between them, from the crown's foot (`FOOT_TOP` 6.292) up to the capitals' foot (15.242,
where the window recesses end) -- steps back `BAY_D` 0.06, the window recess's own depth, to `BAY_OUT` -0.16, and its
windows, their recess panels and sills go back with it, so a window now stands two steps into the wall, the bay's and
then its own. The user's picture of it: take the windows and the wall between them out, which leaves a rectangular
hole three floors tall; make an inset round that hole; put the windows and the wall back in it. So the inset is
exactly as wide as the window sets (the sills in the run give the extent, and the floors' sets are asserted to agree
within 3 cm), its edge runs down the sets' own edges with no padding, and the field between it and the columns stays
standing, 0.25 to 0.56 wide; a blank bay gets no inset. The raised corner and centre stretches are not touched, as
asked. Two earlier cuts were wrong: build v66 recessed each run from column to column, `bay_spans`, the runs between
what stands proud of a face (`out_stretches` + `column_spans`), and that step folded into the columns' own returns,
which merely grew from 0.30 to 0.36, so the user's first screenshot rightly saw nothing new; build v68 framed the
window area with 0.20 of wall, which the second screenshot marked as incorrect padding, the photo's edge running down
the jambs. In `build_upper_wall`, once the corners are out and before the window sets are cut, the wall's front skin
inside each inset is taken out with `wall_faces_in` (its depth window a hair either side of `BRICK_OUT`, so only the
skin goes) and put back `BAY_D` deeper with its reveals: the top one, facing down, right under the 5 cm strip the
brackets hang from; the two sides, facing into the inset, in the same planes as the window panels' own side reveals,
which continue them a step further in on the window floors; and at the foot none, because the crown's top ledge at
6.292 is that face already (the crown reaches `E_IN` 0.44 back from its base, to -0.24), so a foot face there lies in
the crown's own plane and fights it. A first cut built it and the ledge probe showed the two trading hits along every
bay; the same coincidence had been there under the second floor's window panels since they were let down onto the
foot, so `reveal_faces` now takes `bottom=False` for those too. Over the three portals the crown jogs out with the
portal's band and its ledge stops short of the wall, so there (`over_portal`) the inset and the panel over it keep a
foot face of their own. The window parts in the insets then move back `BAY_D`, and a set inside an inset takes `fr =
BAY_OUT`, so its own panel and reveals sit a step behind it; the deletion window for a set's hole is `fr + 0.02`
rather than `fr + 0.05`, so the inset's reveals, whose centres lie 0.03 out from its plane, are not swept away with
the set's rectangle. The planes now read on the model: column +0.20, field -0.10, inset -0.16, window recess -0.22.

The window recess halved (user 2026-09-18, a screenshot of a window panel's reveal): `RECESS_D` is 0.03, from 0.06,
for the window sets of floors 2 to 4 -- the window's own step inside the bay inset -- so a window now stands 0.09
into the field rather than 0.12. The inset keeps `BAY_D` 0.06, the recess's depth when the inset was asked for, and
the band's step behind the raised bays, `B45_STEP` 0.06, which had been asserted equal to the window recess, is
asserted equal to the inset now. The top floor's windows, which have no inset, are not touched.

Probe caveats again: the probes' heights rose with the extra 0.352 (backfaces `ZS` and the downward bands, the sliver
heights, the junction probe's window), and three single hits at z 19.5 on `wall__21`'s back are a 1 mm hairline in
the game's own arch reveals of `top_panel_1976` and two others -- the fine arc of the panel face against the coarser
arc of its reveal -- reached only because the probe height now falls in that 15 cm over the arches; not new.

The parapet carries no pedestals (user 2026-09-16, and HABS CA-334's general view, `refs/loc`): the game stood a
1.10 m square post with a 1.22 m coping slab on it at each end and in the middle of every corner stretch and every
pavilion, and each reached 0.48 m back over the roof deck, so from above they read as boxes left standing on the roof.
The real building's parapet is a plain band under one straight coping from corner to corner, which is what is left
once all 68 of them go (`parapet_block*`; they were doubled as well, a second post and coping 8 cm behind the first,
hidden on every side but the top, where the two lids were coincident and rendered as a black patch). The crown above
each pavilion therefore no longer marks it -- `game_mids` reads the pavilions off the game's wall, not off the
parapet, so nothing else depends on them.

A bay is deep, and the stone zone over it steps back, when it is one of the game's three-pane storefronts -- or when
`DEEP_BAYS` names it (user 2026-09-16). It names bays 6 and 7 of the 3rd Street face, the two two-pane fillers
between the centre pavilion and the corner bay, counted along the face in the order the bays stand (`BAY_ORDER`).
Only their depth changes: they keep their two panes and the pair of windows over them, their storefront moves from
`INSET` 0.20 to `INSET_WIDE` 0.40 behind the pier face like a three-pane one, and being in `recesses` is what makes
the band strip, the band above it and the ground floor's entablature step back `RECESS` 0.15 over them. That face now
carries four recesses instead of two. The 0.885 pier left standing proud between the two of them breaks the
entablature and the dentil course cleanly, the same way the pier beside a three-pane bay does.

Every storefront pier carries a brick column up the wall of floors 2 to 4, so each column stands on the pillar under
it (user 2026-09-16). `column_spans` gives them, and three kinds are already standing before it counts: the pair that
continues a portal's pilasters, at the portal's own edges; the pier beside each of the two storefronts flanking a
portal, which takes the capitals' span (`CAP_SPANS`, below) so the three tiers over it line up; and any pier the wall
is already proud over -- inside a corner stretch or under a centre pavilion -- where that mass is the column, which is
the exception on the 3rd Street face, where the pavilion's two-window section covers both of its piers. Every pier
left over gets a column of its own, `COL_W` wide, centred on it. On the Broadway face the rule adds nothing at all,
which is what made it the model to read the rule off; it gave 3rd Street the five it was missing, and 5 and 6 to the
E and north faces, which had only their portal's pair or none.

The top floor's slabs are laid after the game's wall is cleared, not one at a time (user 2026-09-16). Clearing a run
took out the return the run before it had just built on their shared edge -- `wall_faces_in` reaches a little past the
rectangle it is given, as it must to cut the game's floor-tall triangles -- so the wall stood open for its whole 4 m
height wherever the plane changes, and from above one looked straight through it to the roof. All the clearing is
done first, then all the slabs, and every slab is given the same back, the deepest (`BRICK_OUT - TOP_T`), so a step's
return closes the whole end of the thinner slab beside it rather than only the part in front of it. The building's 12
plane changes on that floor all read a return `-0.42..+0.20` deep now.

The three tiers over the pier each storefront beside a portal shares with the bay beyond -- the edge capital, the
break the entablature makes over it and the brick column above -- are all `COL_W` 0.80 wide and
take one span, `CAP_SPANS`, worked out once (user 2026-09-16). It runs out to the pier's far edge, where the recess
beside it begins, so the capital meets that recess in a single step: centring the 0.80 block on the 0.885 pier instead
left a 4 cm strip of pier between the two, which the cornice then had to break across twice a few centimetres apart,
deforming it, and which needed a little cap of its own to fill. No caps: the span reaches the edge.

The wall of each level is one swept ring, and the two meet rather than overlap (user 2026-09-16). `ge_band_strip`
carries the band and its own crown -- the bead, the course of teeth and the cornice all stand on the band, so the wall
behind them belongs to it (user 2026-09-16) -- running `BAND_BOTTOM` .. `E_TOP` - 0.005 and stepping back from its
`STRIP_OUT` face to the wall plane at the band's top, which keeps the teeth's full 4 cm of relief against it instead of
the 2 cm they would have had against the strip's own face. `ge_upper_band` takes it from there (`E_TOP` - 0.005 ..
`FLOOR2_BOTTOM`), the zone above the cornice. Both run on `hull_path` and are `ZONE_IN` deep. The game's `wall__7` did both jobs at once and overlapped
the strip by 0.58, so it goes. Because the ring steps back over the three-pane storefronts on the same path as the
strip, each recess pocket is part of the two rings themselves: the plate-plus-two-slivers lining that used to be
fitted into the game's wall (`fit_recess_*_back/_L/_R`) is gone, and with it the rule that trimmed a sliver where an
edge capital shared its plane. Over the three central bays of a portal face the blocks and slabs are the wall, so the
ring is cut away there -- across the zone's own height only, since the course of teeth below still stands against it.

Known: where a moulding breaks forward by less than its own projection -- the crown reaches 0.165 out but an edge
capital breaks it only `CAP_OUT` 0.08 -- the mitre cannot wrap it. A mitre carries a profile point |o| from the path
|o|*tan(half the turn) along it as well, so on a break that shallow the point lands past the next ring and folds a
sliver of the strip inside out, a centimetre or two of black at each corner of the break. Tried and rejected:
butting re-entrant corners instead of mitring them (either sign leaves gaps worse than the folds, since this profile
straddles the path); capping the mitre's reach to the run (removes the folds but the pinch blends the whole way to
the next corner, squashing the crown from 0.365 to 0.322); the same cap with guard rings a centimetre either side of
each corner (keeps the profile exactly but the guard ring is then the one the mitre overshoots). The real fixes are
to break the crown by at least its own projection, or to build the breaks as separate mitred blocks rather than as
jogs in one sweep.

A path point in line with its neighbours and going the same way is dropped before a loop is swept (user 2026-09-15):
it adds a ring whose profile lies flat along the path, and where an edge capital's return runs straight on into the
recess's beside it -- both jogs step back to the wall plane at the same place, so the path went 0.28, 0.20, 0.05 at
one `s` -- that ring sat between two mitred ones and its outer point fell *behind* both of them, folding the sweep
and tearing a triangular hole in the crown's top ledge at all six edge capitals. `probe_backfaces.py` looks for the
whole class: it sweeps every face horizontally at 27 heights and downward over all four ledges, and reports any
first surface met that faces away from the ray, which is exactly what renders black.

`ge_cornice` reaches `E_CORNICE_OUT` 0.05 further out than the course of teeth it covers (user 2026-09-16). Its whole
front moves with that -- soffit, small band, ovolo and top step alike, each keeping its own shape -- and only its back
stays where it was, so the moulding is 5 cm deeper rather than 5 cm further away: it now oversails the dentils instead
of sitting flush with them. Measured top to bottom, every height of it moved +0.050 and nothing else moved at all; its
top ledge, which the edge capitals and the portal's pier blocks stand on, is 0.13 deeper in front of them than before.

`RECESS`, how far the stone zone steps back over a three-pane storefront, is capped at 0.15 (it used to be the
storefront's own extra inset, 0.20): on one wall plane the crown has to carry the brick over the pocket as well, so
its square edge now stands 0.015 proud of the brick instead of 0.065 behind it, where it left a shadow slot the
length of every recess. An assert keeps it under the crown's own reach.

The top floor is put together like the floors below it (user 2026-09-14): the wall is just the wall, and every window
set sits in a hole of its own with the recess, the arch rings and the stepped reveals on a panel of its own
(`top_panel_*`). The game had built all of that into `wall__21`, so each set's piece of that wall is cut out into a
panel object -- the rectangle it steps back over, measured against the wall's own plane, which the end and centre
pavilions stand 0.08 proud of -- plain brick closes the wall behind it, and a hole is cut again wherever the set
finally stands: `wall__21` keeps about 1,300 faces of plain wall where it carried 20,000 of window. A set -- sill,
frames, glass, panel -- then travels as one piece, which is what lets the windows over a portal be swapped for a
copied pair like the floors below; a panel that moves takes its u with it, so its brick still runs on into the wall's
courses. The wall still follows the sets, one rigid band per set and a linear ramp between, anchored at the corners
where it may not move, so its pavilions stay over their sets and the brick is neither stretched nor sheared. The
game's impost band -- its course of blocks at the springing of the arches -- is taken down before anything moves and
not laid again: the impost course is swept afresh at the end (below, with the top floor's windows).

Textures (`link_game_textures.py`): every map the glTF export packed into the file is pointed back at the game's
own asset under `assets/public/pbr`, with a path relative to the .blend (user 2026-09-13). The tool runs inside the
assembly and stands alone for any exported building:
`blender -b <file.blend> -P link_game_textures.py` relinks that file and saves it in place (`-- --dry-run` to look
first). It has been run on the baseline `bradbury_block_before.blend`, which went from 36 MB to 6.3 MB, so the
images now arrive already linked and the assembly's own pass finds nothing left to do. Those are the six materials the
building's config names (`red_brick`, `brownstone`, `terracotta_smooth`, `red_sandstone_block`,
`red_sandstone_noise`, `rough_concrete`) plus the `painted_plaster_wall` of the floor plates, 21 maps in all.
Each packed image is matched to its file by its own pixels rather than by name, and is then replaced by that file,
the packed copy deleted; nothing is written, which the script confirms from the size and date of every asset it read
(Blender's own unpack writes the packed pixels back to disk instead of using the file, so it is not used). The exporter had flipped every
image vertically, the glTF convention, so each texture node that now reads a file gets a mapping with V mirrored:
the same texel lands in the same place and the render is unchanged. The three maps the game draws at runtime and
never ships as files, the storefront silhouette and the two window maps, stay packed (the baseline also keeps the
interior photo atlas the assembly deletes). The block drops from 33 MB to 3.5 MB.

Collections in `bradbury_portal.blend`: `PORTAL` holds the piece collections (what the building links);
`RIG` (cameras, sun) and `PROPS` (the sidewalk slab of piece 05) are review-only and stay at the scene
root, outside the link.

The wall's hidden faces in flat colours (user 2026-09-18, after looking inside the wall's thickness): the wall of
floors 2 to 4 is a solid ring and its inner skin looked just like the outer one from within, so the faces that never
show from outside now carry solid colours near the brick's tone, each kind its own, to be told apart at a glance in
the viewport: `WALL_inner_skin` a shade darker on the ring's inner skin, `WALL_top_bottom` a shade lighter on the
ring's top and bottom (under the band and inside the crown), `WALL_panel_hidden` a shade pinker on the window panels'
backs and box sides, which sit between the two skins. `hide_faces` picks them by world-space centre and normal: the
inner skin by depth and an inward normal, the top and bottom by height, a panel's back by depth and a panel's box
sides by lying on its rectangle's rim behind its front, which leaves the reveals (on the rim but in front of the
front) and the window jambs (inside the rectangle) in brick. The colours are set on the node tree and on the
material's viewport colour, so Solid shading shows them too. Nothing that shows from outside changes; the inner skin
itself stays, since the columns and pavilions are joined to the ring by boolean unions that need its closed volume.


The base brightened (user 2026-09-18, a photo of the portal): the ground floor's one dark red-brown stone read too
dark under the brick, where the reference's moulding and portal are a pale sandstone a little pinker and brighter
than the brick. The moulding -- the entablature, the band strip, the zone with its blocks, bars and caps, the crown,
the band tops over the portals -- now takes `STONE_RATIO` (1.08, 1.22, 1.36) of the brick's sRGB mean per channel,
about (191, 140, 113), as `PBR_bradbury_ground_stone`; the storefront piers, the pier ring alone (the six `fit_pier_*` boxes are the zone's blocks beside the
pilasters, at the zone's height, and take the moulding's stone), keep their red-brown as `PBR_bradbury_pier_stone` at `PIER_RATIO` (0.77, 0.72, 0.89), about (136, 83, 74), a fifth lighter than the (113,
69, 61) of the first cut; both on brownstone's surface as before. The portal's own stone lives in `portal_lib.py`
(`mat_sandstone`), since the portal is linked from its generated file: its colour ramp now spreads a quarter either
way about the moulding's tone in linear light, (0.39, 0.20, 0.12) to (0.65, 0.33, 0.21), where it was a pinker and
darker (0.33, 0.17, 0.11) to (0.60, 0.36, 0.25). The generated portal file was retinted in place to the same values
(`retint_portal.py` in the scratchpad), which is what regenerating its pieces would give, without their renders.

The base's tones settled (user 2026-09-18, two more photos): the paler-than-brick moulding and the strong dark-red
piers of the day's second cut read as two different materials, where the reference has one stone throughout the
ground floor -- a little darker than the brick and redder, the piers the same stone only fresher. So `STONE_RATIO` is
(0.94, 0.835, 0.94), about (166, 96, 78) sRGB, 14% darker than the brick and with the red pulled up against the
green, and `PIER_RATIO` (0.99, 0.895, 1.0), about (175, 103, 83), the same hue a touch lighter; the portal's ramp in
`portal_lib.py` spreads a quarter either way about the moulding's tone, (0.286, 0.087, 0.057) to (0.476, 0.145,
0.095) in linear light, and the generated portal and ornament files were retinted in place again to match.

The base's order (user 2026-09-18, once more): that cut left the moulding and the portal darker than the piers,
which is the wrong way round. Now the moulding is `STONE_RATIO` (1.005, 0.965, 1.04), about (178, 111, 86) sRGB, the
brick's own tone a hair redder and 2% under it (user: brighter, and closer to the brick), the portal's ramp centred
on it, (0.334, 0.119, 0.070) to (0.556, 0.199, 0.116) in
linear light, and the piers `PIER_RATIO` (0.94, 0.835, 0.94), about (166, 96, 78), the same stone a tenth darker
than the moulding; the portal and ornament files retinted in place again.

The ground floor's stone with a real surface (user 2026-09-18: "a pbr texture on the moulding and portal, so it
behaves according to light"): the flat colour over brownstone's maps read as paint, and the portal's noise ramp had
one roughness for everything. Both now take a dressed-sandstone PBR set made for this block,
`assets/public/pbr/bradbury_sandstone_dressed`, generated by `make_sandstone_pbr.py` next to this file: 1024 px over
2 m (the user's call: there is little detail to carry) from periodic FFT noise, so it tiles by construction -- an albedo of a neutral tan under a cloudy mottle, a sand
grain, a sparkle, dark iron specks and a few pits, with a warm/cool drift on the clouds; a normal map from a height
field of the same layers (0.45 mm undulation, 0.07 mm grain, the slopes exaggerated 6x); roughness 0.66 with the
grain and occlusion sunk at the specks in arm.png; and a catalog config with provenance. `stone_material` in the
block box-projects the set on object coordinates and gains its albedo per channel onto the tone asked for, so the
moulding and the piers keep their `STONE_RATIO` and `PIER_RATIO` tones and gain the surface; the portal's
`mat_sandstone` in `portal_lib.py` does the same onto `SANDSTONE_SRGB` (the moulding's tone), finding the repository
from the piece's LIB path, from `__file__`, or from the open file's place under tests/artifacts, and falling back to
its old ramp if the set is missing. The generated portal and ornament files had their sandstone materials rebuilt in
place with `fill_sandstone` (`rebuild_portal_material.py` in the scratchpad), which is what regenerating the pieces
would give. Before-and-after renders: `showcase_5_portal_before.png`, `base_close_before.png`,
`portal_close_before.png` and the same names without the suffix.

The third filler by the corner (user 2026-09-18, a viewport screenshot): on 3rd Street the two-pane storefront
between the fire-escape bay and the corner bay had no recess in the moulding above it, where its two neighbours
toward the centre pavilion did. Those two were set as deep as a three-pane storefront on 2026-09-16 (`DEEP_BAYS`,
counted along the face), which is what gives a bay both the deeper storefront plane and the step back of the stone
zone and mouldings over it; the third filler now joins them, `DEEP_BAYS = {0: (6, 7, 8)}`, so the entablature has five
pockets on that face (the two three-pane bays and the three fillers) and the storefront below stands on the deep
plane like its neighbours. The two-pane bays flanking the portals on every face stay shallow, as the reference has
them.

The stone set retuned (user 2026-09-18, on the first renders with it: "smashed, and too coarse; it should be thin,
almost unnoticeable"): the first cut's grain read as coarse render. The generator's grain and sparkle are a quarter
of what they were (+-0.8% and +-0.4% in the albedo), the mottle +-3%, the height field 0.25 mm of undulation with
0.02 mm of grain and its slopes exaggerated 1.5x instead of 6x, the specks 150 to the square metre at -10% and the
pits 50, the roughness 0.62 varying +-0.025 with the grain. The materials read the files from disk, so the set was
regenerated in place and no rebuild was needed; the same close-ups were re-rendered. That cut proved too thin
(user: "I can't see it", and macro views 1.6 m off showed only the specks), so the generator's third setting is a
middle one: the grain 1.3 mm at +-1.4% (half the first cut), the sparkle +-0.8%, the slopes 3x, and a broad
soft cloud 0.3 m across at +-4% added over the +-3.5% mottle for the blotching the portal photo shows; specks 220
to the square metre at -12%. Three macro cameras (`stone_macro_band`, `stone_macro_pier`, `stone_macro_portal`
in the scratchpad's render_showcase.py) sit 1.6 to 2 m off the band, a pier and a pilaster for judging it; the
thin cut's renders are kept as `*_thin.png` beside the current ones.

The piers as panels (user 2026-09-18, a photo of a storefront pier): the real piers are clad in horizontal stone
panels with a thin joint between them. The user preferred a texture only if it added no complexity, else a small
3D carve; a texture would have meant a second set with the joints baked in and a mapping aligned to each pier's
foot, which the game's material system may not honour, so the joints are carved. The pier ring (`fit_piers`) is one
swept profile, and that profile now carries a V-notch 10 mm wide and 5 mm deep on its outer face at each of the five
course lines, six courses of 0.714 m over the ring's 4.285 m, so every pier face shows the joints, the corner piers'
two faces and the chamfer's included, cut by the sweep itself with no boolean and no new asset. The storefront
openings' cutters leave the piers' returns plane, so a joint stops at a return with its notch profile showing on the
return's outer edge, which is how such cladding meets a reveal. The two texture-route patches were written and left
unrun in the scratchpad.

The sill's profile and the crown's foot (user 2026-09-18, an edit-mode view of a sill and a view of the crown): the
sill had a big convex belly turning into its cove, too convex. It now reads, from the bottom up: a small square edge
(`SILL_LISTEL` 12 mm out, 8 mm tall), a half-round bead on it (`SILL_BEAD_R` 14 mm), the convex part at the very
bottom; a plain face straight up (`SILL_FASCIA_H` 20 mm); a cove, a quarter circle of `SILL_COVE_R` 24 mm opening out
under the cap; and the cap's square edge (`SILL_CAP_H` 20 mm, projecting `SILL_OUT` 50 mm), a small edge like the one
at the bottom, its two front edges rounded as before. The sum is the old `SILL_H` 0.10, so nothing above or below a
sill moves; the old tangent-angle constants are gone. The crown's hollow used to rise straight off the wall plane;
it now starts from a small convex edge at the foot. A first cut made that a square listel with the round on top of
it curling inward to a quirk; the user's arrow put the convex at the bottom corner itself, so the foot is a lip
`M_BEAD_OUT` 22 mm proud whose bottom corner is rounded on `M_BEAD_R` 12 mm. A second cut ran that round up into a
short face and a shelf, from which the hollow rose: a step above the convex curve (the user's red line asked for the
convex to run on into the concave). So the hollow now leaves the top of the round straight up, tangent to it, and
bends outward as it rises: a cubic whose first handle is `M_HOLLOW_RISE` 50 mm vertical and whose second is the old
control point's at the S turn, so the turn and the crest above it are as before; its tangent falls steadily from
vertical to the turn, and the first 2 cm stay within 2 mm of the lip's face.

The piers' joints, wrapped and deepened (user 2026-09-18, a screenshot of a pier): the V-notches in the ring's
profile marked the fronts only, and were too shallow, and there was no joint where a pier meets the moulding above.
The joints are now square grooves 10 mm tall and 15 mm deep (`PIER_JOINT_H`, `PIER_JOINT_D`) that wrap each pier,
its front and both returns into the storefronts, at the five course lines and once more right under the band strip.
They are booleans on the ring once its openings and the portals are cut, one exact boolean per box (a first cut
put all of a height's boxes in one cutter; they overlap where a front box meets its return boxes and at the corners,
and the exact solver kept only their intersection, leaving a slab one joint tall, so the build now asserts the ring's
face count after the cuts): the piers are read off the layout as the gaps between the
storefront openings, the portals' pilaster spans and the face ends; each gets a front box, which at a hull corner runs
on by `corner_reach` as far as the ring's front does, so the groove turns the corner with it; and where a pier's
return meets a storefront the box along that return goes back to the storefront's own front plane, where the
fascia, the transom bars and the glazing frame cover the groove's end. That plane is `WALL_OUT + inset` behind the
pier face (0.40, or 0.60 for a three-pane storefront): the storefronts stayed where the game left them when the wall
plane moved out by `WALL_OUT`, and the layout places their fronts at `hull + STRIP_OUT - inset`. A cut that went
back by the inset alone stopped halfway along the exposed return (user 2026-09-18, a viewport screenshot). The returns against the portals' pilasters, which stand proud of the piers, get none.
The top groove lies wholly in the ring's last centimetre under `BAND_BOTTOM`, so its ceiling is the strip's own
underside and the pier reads as parted from the moulding. The ring's profile is a plain rectangle again. The cutter frames stand on the hull, while the ring's profile stands on the wall plane `WALL_OUT` out
from it, so the boxes are measured out from the hull with `PIER_FRONT = WALL_OUT + STRIP_OUT`; a build that measured
them with `STRIP_OUT` alone cut its 696 boxes as closed voids 20 cm inside the ring and left every face plain, which
only a ray through a joint height showed (the face count had risen as if the cuts were right).

The sign band and the transom border (user 2026-09-18, a render of a pier): the white transom carries a black metal
border 1 cm proud of the storefront plane, the black sign band under it sat on the plane itself, and the pier's return
beside them showed the step between the two. The band now comes out with the border: `SF_BORDER` is the border's
projection, and the fascia is placed that much further out than the plane the transom keeps, so the two fronts are
flush and the return reads as one surface past them.

The top floor's impost course (user 2026-09-18, points 3 and 6 of the top windows; photos 011973, 011982, Highsmith:
the band hangs under the springing with its top edge on it, runs along every wall and round the corner piers, stops
at each window and returns into its reveal, and is missing on the narrow piers between grouped arches, which carry a
foliate capital as tall as it): `impost_course5`, one moulding `IMP_H` 0.32 tall (0.30 W) with its top on the
springing `TOP_SPRING` (17.300 game, 18.052 world), swept along the wall's own outline at that height --
`loop(silhouette_jogs(COL_OUT - BRICK_OUT), BRICK_OUT)`, the field at -0.10, the pavilions at +0.20, corners and jogs
mitred as the band's cornices are -- and cut at every window set's masonry span (first jamb to last: the narrow
piers inside a set carry none). Each piece returns `IMP_RET` 0.30 into the two outer jamb reveals it stops at, to a
centimetre before the frame, and `sweep(..., caps=True)` closes its ends. The profile, bottom up (user): a very small
square edge (20 x 12 mm), a face straight up 10 mm proud, a second small edge (35 x 15), the tall face 25 mm proud
(0.14), an edge rising on a convex bevel (a 60 x 55 mm quarter ellipse) and the top edge ring 100 mm proud, 48 mm
tall, its front corners rounded 4 mm; the back 40 mm in the wall; terracotta trim. Every narrow pier between two of a
set's windows carries the portal's capital (`ge_capital5`, the `ge_capital` mesh) with its neck as wide as the pier
(0.36 / 0.34), `CAP5_H` = `IMP_H` tall with its top on the springing, its neck flush with the pier's face, its abacus
0.036 proud and its back 0.30 in, inside the panel. The game's block course (`impost_band_*`, `BAND_Z`) is gone with its two readers.

The top floor's windows rebuilt, and the top floor made shorter (user 2026-09-18, four reference photos of the fifth
floor with a sketched impost silhouette): the game's top window was two square lights and a segmental arch over a
transom, in a hole with three stepped rings, on a sill of its own two centimetres over the band's top cornice, in a
floor 3.6 m tall above that cornice. The photos (HABS CA-334 011973 and 011982, Highsmith) show one rectangular light
under a true semicircular arch, one ring of brick stepping back once into a deep reveal, the sash standing straight on
the string course, and a floor about 2.2 opening-widths tall. So every set's panel (`top_panel_*`) is built again where
it finally stands, before the wall takes its hole: a plain box on its stretch's plane carrying the slab's own brick
courses, one opening per window cut through it (`cut_world_prism`: a rectangle from a 2 mm ledge over the cornice's
top `TOP_FOOT` up to the springing `TOP_SPRING` 1.31 above it, and a half circle of the window's own width, 1.05 or
1.00, over that), and one ring `RING_W` 0.15 wide let `RING_D` 0.08 into the wall round the arch alone, its floor a lip
over the springing where the impost course and the capitals end. Behind the plain 0.31 reveal stand a new frame of the
same shape (`mesh__t5_*_frame`, 0.06 wide, 0.08 deep, its outer edge buried 5 mm), a transom bar with its top 0.14
under the springing, the glass and the backdrop pane; the game's parts and the sills go, and the lift is measured from
the new frames, which stand where the game's sills' underside was. The band's top cornice is `B45_TOPC_H` 0.26 tall now
(= `T45_H`), so its very top is `B45_TOP` 16.742 and the frames stand on it; nothing on floors 2 to 4 changes. The
height: `TOP_HEAD_GAME` 19.592 is the game's wall head (asserted), `TOP_DROP` 1.242 the one lever, `TOP_Z1` their
difference, cross-checked against the head the windows ask for (`TOP_SPRING` + half the widest window + `TOP_OVER`
0.525 = 18.350); the two readers of the game wall's head use `TOP_HEAD_GAME`, and the lift moves the head group (the
roof deck, the dentil course, the top cornice, the parapet band and its coping, the eight objects from the game's head
up) by `UPPER_LIFT - TOP_DROP`, so the shorter wall stays closed against them: the block's top comes from 21.064 to
19.802. The coping, which the parapet push-out had left behind the band it caps, comes out with it; the rebuilt
panels' backs and box sides take the hidden-face colour like the other floors' panels. A review of the built block (2026-09-19) found three small things the shorter floor brings closer to the eye and
they are fixed with it: the roof deck's three planes, pushed out to the pavilions' face, lay in the parapet band's foot
plane and their backfaces fought the band's soffit seen from below between the dentils (they now ride `DECK_LIFT` 3 mm
above it, inside the band's solid); the game's top cornice carried a few smooth-shaded polygons among flat ones, a dark
triangle at the pavilion's jog (all flat now); and the narrow piers' capitals stood with their necks a millimetre
proud of the brick (`CAP5_SINK` 5 mm inside it now).

The roof crown (user 2026-09-19, the reference photos): the game's crown above the top floor's wall head -- its cornice
`cornice__2636`, its dentil course `cornice_ornament__2637`, the parapet band `mesh__2635` and the coping
`parapet_coping__2730` -- is taken down right after the lift (so the push-out, the head group's assert and the deck
lift above all still see the eight objects they were written for), and four courses are built in its place at the end
of the file: a two-step corbelled moulding `RC_M_H` 0.230 on the wall head `RC_Z0` 19.102, a frieze of flower tiles
`RC_FR_H` 0.550, a dentil course of a 0.100 plinth and 0.230 teeth, and a cornice of three fasciae (0.145, 0.135,
0.155) with a straight angular edge 0.085 on top. `RC_H` is 1.630, about 1.55 of the top floor's widest window, and the
block's top comes from 19.802 to **20.732**. The frieze is 0.550 because the installed set
(`assets/public/pbr/bradbury_flower_tiles`, its albedo already on the building's tone) is a seamless 2:1 image of two
square tiles repeating every 1.100 m, so at half the repeat the tiles are exactly square and a whole one fills the
course; its UVs are metres along each polygon's own horizontal tangent and metres up from the frieze's foot
(`crown_frieze_uvs`, `band_uvs` generalised so the chamfer and every jog return get their own plane).

It is built as **seven thin swept rings plus the teeth**, all in `FIT`, all `TRIM_PBR` but the frieze. `sweep` mitres a
break by carrying a profile point `|o|` ALONG the path as well as out (probed on this file's own band cornices:
`ge_cornice45_top`, max `o` 0.160, breaks at y 12.068 where `wall__21` breaks at 12.225), so one deep sweep projecting
0.620 would put its break 0.62 m off the wall's silhouette and the four courses would stagger against each other.
Each ring instead rides its own `loop` base (`front`, 0.000 to 0.500) and projects at most 0.120 over it, and `rc_jogs`
pads every raised stretch's free ends so that each course returns where it should where the wall changes depth; a
corner stretch's outer end is left alone, since that is what makes `loop` mitre the corner. The padding follows ONE
rule for the whole crown (user 2026-09-20, after three passes): `pad = RC_ANCHOR - front`, so a face projecting `p`
beyond the wall returns at the wall's corner offset outward by `p - RC_ANCHOR`, with `RC_ANCHOR` the corbel's first
step, 0.045. The corbel's first step therefore lands on the wall's own line, each course's foot lands on the face it
stands on (step two and the frieze together at 0.045, the plinth at 0.135, the bed at 0.275, the middle fascia at
0.365, the top fascia at 0.455) and every proud lip oversails the break by just what it projects, as a cornice does.
Padding each ring by its own outermost point instead -- the first cut -- anchored every ring on a different face, so
the top fascia sat 0.12 behind the two below it and the corbel's first step 0.045 behind the wall, and each of those
recesses read as a gap at the break.
How far a course may run past the break before it turns is scaled by `RC_JOG_K` 0.65 (user 2026-09-22, three ticks
drawn on the return: "i want it to stop at the red lines"). Anchoring alone sends the top course 0.530 past the wall's
line; the marks, read back by projecting the crown's own vertices into that same viewport, put the staircase at about
two thirds of it. K multiplies the stagger without moving the anchor, so the corbel's first step still lands on the
wall's own line and the order of the returns is unchanged: the weathered edge now runs 0.345 past the break instead of
0.530, c3 0.296, c2 0.237, c1 0.179, the plinth 0.088, the coffer 0.055.

`rc_jogs(0)` is `silhouette_jogs(RC_JOG)` exactly, asserted. Every profile's back is `-(front + RC_IN)`, so all seven
reach `RC_IN` 0.30 behind the field's wall plane whatever their front and the stack is one 0.280-thick parapet closed
on top by the cornice's own top face -- no separate parapet object. The dentils reuse the band cornice's generator
(`crown_teeth`, pitch 0.340, 0.110 proud of the coffer, 0.03 clear of each run's ends, corners carried by the raised
runs). Where the wall changes depth the rings' inner faces needed one more cut (user 2026-09-20): the same mitre that puts
each outer face on the wall's line carries each ring's back, `front + RC_IN` from its own path, that much further along
it, so the seven courses stepped onto a raised stretch at seven lines 0.39 apart (measured at the east break, whose
wall steps at y 12.230: the moulding and the frieze at 12.620, up to the cornice's top at 13.150) and the raised part
of each course looked as though it started late. The outer faces cannot move, so the overshoot is subtracted instead:
at every free jog, the material behind that stretch's own inner plane `RC_BACK_IN` -0.10 is cut from each ring over
the 0.90 m inside the jog that the deepest back can reach. The rings' shading is set again afterwards, since a boolean
returns a plain mesh. The roof deck stays and is the only thing closing the top: the game's planes lay at the pavilion outline, which
the 0.460-thick parapet band used to bury, so the wall head's 0.080 cap ring (`roof__26`, `roof__27`) goes with that
band and the two deck planes are laid again on the hull's own outline at `RC_DECK_OUT` -0.0775, corner for corner, so
their meshes and UVs stay: behind the moulding's field face and still past the parapet's back over a pavilion. (The
game's deck outline is not a plan offset of the hull -- its chamfer corner already stands 0.080 inside the east face --
so pushing each corner back off the faces it stands over leaves that face's edge slanting 0.19 over its 32 m, and the
parapet open behind it.)

## The arch rings follow the arch (2026-09-21)

From a photograph of the real top-floor window: "the texture inside and around the arc should follow its format; and
the color is a bit brighter and uniform, can this adjustment be done without an extra texture?" It can, and it needs
no new asset and no new geometry -- only the same image read in polar coordinates, and a second material off it.

**What was wrong.** `top_uvs` sorted every face by its normal alone: facing the street it took the wall's
`(along, up)`, facing sideways the reveal's `(depth, up)`. Nothing in it knew there was an arch, so the ring's face
wore the wall's horizontal coursing clipped to a curve and the soffit stretched badly toward the crown. The radiating
lines visible in the renders were not bricks at all -- they were the ring's 32 facets, flat-shaded.

**The mapping.** Any polygon whose vertices all lie in a window's ring annulus and at or above the springing now
takes polar UVs about that arch's centre: `u` out from the centre on the ring's face and into the wall on its soffit
and its outer side, `v` along the arc. The numbers come off the texture rather than out of the air -- an FFT of the
albedo says the set carries **exactly 8 bricks and 16 courses** in its 1.26 m tile, so a brick is 157.5 by 78.8 mm:

- `v` is scaled so the half circle is a whole number of those courses. At mid-radius 0.60 m the arc is 1.885 m, which
  is **24 voussoirs**, and every joint lands on one.
- `arch_voussoirs(W)` now drives the facet count of both cuts, the opening's and the ring's, so a facet is a voussoir.
- `u` spans **half a brick** across `RING_W` 0.15, not a whole one -- see the traps below.

**The colour** is a second material built from the same file: `pbr_material` gained `tone` and `flatten`, which mixes
the albedo toward its own mean. `ARCH_RING_TONE` 1.04 and `ARCH_RING_FLAT` 0.45 give the paler, evener ring the
photograph shows. The panels carry it as a fifth material slot, assigned by `top_uvs` as it maps.

**Three traps, in the order they bit, so they are not walked into again.**

1. **A whole brick across the ring is wrong.** The set is a running bond, so every other course carries its joint half
   a brick along; a whole brick's width of that put the joint down the **middle** of every second voussoir and the ring
   read as a light-dark chain. It survived flattening the colour to 80% of the mean, which is the tell: the joint is a
   groove in the **normal map**, and no amount of evening the albedo can reach it. Half a brick across lands that joint
   on the ring's own inner or outer edge, where its geometry already is. The brick then reads twice as long, which
   over 0.15 m is exactly what a voussoir is.
2. **There is no facet to hang a per-voussoir choice on.** Giving each voussoir its own whole brick looked like the
   tidy answer, but the boolean leaves the ring's whole face as a single n-gon -- a 50-gon on a 24-voussoir arch --
   so a per-polygon index applies to the entire ring at once. `v` has to run on around the arc.
3. **The flatten target must be linear.** A byte image hands its pixels back **sRGB encoded**, so averaging them raw
   and feeding that to a shader node as a colour gives a target twice as bright as the texture really is; the ring
   came out chalk white. `linear_mean` elsewhere in this file already converts, and the new code does the same.

### The retune, and the archivolt (2026-09-22)

On the first cut: "the tiles arround the windows also need to be smaller and more yellowish. and they are kind of
broken." The first two are constants -- `ARCH_RING_SCALE` 0.70, which the voussoir count follows, and `ARCH_RING_TONE`
now per channel at (1.06, 1.05, 0.86), green held and blue pulled back. **Broken was a fourth trap**, and a good one:
the voussoir joints were *kinked*, doglegging partway along. A renderer interpolates UVs **linearly** inside each
triangle, polar coordinates are not linear, and the ring's face is one n-gon whose triangulation ran clean across half
the arch. `top_uvs` now triangulates those faces itself (BEAUTY) after writing the exact polar UVs, so interpolation
happens over one facet and the joints run straight.

The ring's face is **flush with the wall** (user 2026-09-22, with those 67 faces selected: "arc around the window,
should be at the same level of the wall; you need to bring it forward"). It had been `RING_D` 80 mm back -- the panel
read 17779 at the wall, 17699 at the ring, 17459 at the reveal. Only the opening behind the voussoirs is recessed;
the voussoirs themselves are laid in the wall's own plane. `RING_D` is 2 mm rather than 0 because that cut is what
splits the ring's faces off the wall's so they can take their own mapping and material, and a boolean needs volume to
do it. The panel now reads 17779 wall, 17777 ring.

**The archivolt** (same day, a marked photo): "arround the arc, there is a decoration ... from center to out. it
starts with a small edge, then another small step, a longer straight line, then another step and the edge ... 1 cm on
each edge is fine", and "when there are multiple windows the decorations merge in the center when they meet".

`archivolt_profile()` is that silhouette read radially out from the band's inner edge, and it **only ever climbs**
(user, having selected the outermost ring of 64 faces: "the faces selected in the ide should be raised above the center
area ... from center to outward this decoration only increase heigh"). The first cut read the silhouette as
symmetric -- up, up, the straight, down, down -- which put the rim back at the height of the inner step. It is four
edges of `AV_EDGE` 0.010 instead: two up to the long straight `AV_FLAT_W` 0.095, which is the centre area at 20 mm
proud, then two more above it, the last forming the rim at 40 mm. `AV_STEP_W` 0.018 is each short flat, 0.149 wide
over all. The first rise stands at the ring's own outer boundary but entirely above the wall plane, so it never meets
the ring's recess wall, which runs below it. It is swept as a **closed solid**
over `AV_N` 64 facets from each ring's outer edge, built in the panel's own frame and laid in the world by it, and it
wears the building's own `TRIM_PBR`.

The merge needs no union. Where two arches are close enough for their bands to overlap, both are cut on the
**vertical plane halfway between their centres** -- and because every point of that plane is the same distance from
both centres, the profile (which depends only on radius) is identical on each side, so the two bands meet there
exactly and read as one. 81 bands, 84 such cuts.

## The windows' two gaps (2026-09-22)

From a Solid-viewport screenshot of a floor-4 pair, two arrows: "we observe 2 gaps: 1) between the wall and window
(needs to increase the depth of the window margin so it touches the window) 2) between window glass and background.
(increase the background size and maybe bring it closer to the glass". Both are one fault seen from two places -- a
line of sight past the window into the hollow building -- and both were on **every** window above the storefronts,
the top floor's included.

**The reveal ended short of the window.**

- The top floor's panels were `TOP_T` 0.32 deep, but a frame is `REVEAL_D` + `FRAME_D` = 0.39: its last 7 cm, the
  glass and the pane stood in open air behind the wall.
- On floors 2 to 4 every frame sits the same `WIN_IN` 0.21 behind its own wall's plane, whichever wall that is (field,
  bay inset or raised corner); measured identical on all the regular panels, and now asserted per frame at build
  time. The recess panel carrying the reveal was built to the wall's own back instead, which on the 84 bay-inset
  panels ended **1.9 cm in front of the frame's face** and 9.9 cm short of its back. The 24 corner and pavilion panels
  were deep enough already.
- Fix: `TOP_PANEL_T` = `REVEAL_D` + `FRAME_D` + 0.01 (0.40) for the top floor's panels alone, and `PANEL_T24` =
  `WIN_IN` + `WIN_D24` + 0.01 (0.30) behind the wall's plane for the recess panels, or the wall's own back where that
  is deeper. `TOP_T` itself stays: the plain wall beside the panels keeps it, and so do the capitals, whose depth is
  scaled from it -- changing it would have pushed every capital further out.

**The pane was the glass's own size, 5 cm behind it** -- all 150 of the game's, identically. Near the glass's edge
the eye cleared it. Each now sits **1 cm behind its glass** and reaches into the frame, so its rim is buried in the
frame's body: on the top floor `TOP_PANE_IN` 0.12 -> 0.07 with an outline of its own out to `FRAME_BURY` inside the
opening's edge; on floors 2 to 4 `PANE_BEHIND` 0.01 and out to the frame's rebate, `PANE_HIDE` 5 mm inside the
frame's outer face. At 1 cm the angle needed to see past its rim is steeper than any the reveal leaves open.

**Trap: the game's panes share their meshes**, one over some forty windows. Edited object by object, each window's
4 cm move landed on the same mesh again, and the first build put the floor 3 and 4 panes **1.8 m in front of the
wall**. Each pane now takes its own copy first, as the second floor's windows already did, and the pass measures
every pane again afterwards and fails the build if one is not exactly where it was sent.

**Proof, and where to look.** A ray probe fires 259,200 rays at a window from 36 oblique poses, lets them through the
glass, and counts those that get into the building:

| window | before | after |
|---|---|---|
| top floor (panel 1980) | 4,414 | 0 |
| floor 4, bay inset | 9,485 | 0 |
| floor 4, centre pavilion | 4,040 | 0 |

A **Cycles render does not show either gap**: the glass is dark and the building's inside unlit, so what shows through
is more dark (zero pixels changed at the worst pose). The Solid viewport lights every face alike and draws the panels'
hidden backs in their brown viewport colour, which is what was seen through the gaps -- check window work in Solid.

## The impost returns and the narrow-pier capitals (2026-09-22)

**The returns**, from a Solid screenshot with a red line on the springing: "reduce the inner part of the molding in
the top floor; the part that turns into the window. the red line shows the limit." A return carries the moulding's
whole profile round the jamb, so its top ring stood `IMP_RING_OUT` 0.10 into the opening, over the frame and onto
the glass. The red line was read against the arch's own scale in the screenshot -- the archivolt's outer edge, 0.824
from the arch's centre, gives 650 px/m -- and sits 0.055..0.06 in at the ring and on the moulding's own tall face
below it: the frame's width. So `IMP_CLIP` = `FRAME_W`: the moulding may cover the frame's face, never the glass.
One box per set, from `IMP_CLIP` inside its first jamb to `IMP_CLIP` inside its last, takes off everything reaching
further in. Nothing else of the moulding runs inside a set -- its narrow piers carry capitals -- so only the returns
are touched: the ring and the bevel end flat on the frame, and the lower edges, all within `IMP_EDGE2_OUT` of the
jamb, keep their profile. The build measures the moulding afterwards and fails if any of it reaches further in.

**The capitals**, from a close-up with two arrows: "behind the wall in some areas, we need to 1) increase the size
just a bit so it overcome the sides (1-2cm might be enough); and 2) bring it forward a bit if #1 is not enough".
Measured slice by slice, the foot was exactly the pier's width -- flush with both jambs -- and 5 mm inside the pier's
face (the `CAP5_SINK` of 2026-09-19), and the neck above the astragal dipped 3.4 mm back behind the brick again, so
the brick showed through there. Widening cannot reach the front, so both were needed: the foot `CAP5_WIDEN` 15 mm
wider than its pier and `CAP5_OUT` 5 mm proud of its face. No part of the front now stands less than 4.9 mm clear
of the brick, the foot clears each jamb by 7.4 mm, and the abacus stands 41 mm proud (it was 31).

## The inscription: the lettering PBR decal (2026-09-22)

"is there a bradbury pbr texture in the downloads? if so, replace the writing with that pbr image." There was:
`downloads/bradbury_lettering_PBR.zip`, an inscription decal -- "BRADBURY." on a transparent 2172 x 724 canvas, every
map sharing one byte-identical alpha, the relief (bevelled edges, a raised rim, a slightly sunk clay face) baked into
a normal map differentiated from its own 16-bit height. `make_lettering_pbr.py` (next to this file; `python
make_lettering_pbr.py` from anywhere) installs it from `downloads/` as `assets/public/pbr/bradbury_lettering` in the
catalog's layout: `basecolor.png` keeps the alpha (the catalog's rule: PNG only where a cutout needs it),
`normal_gl.png`, `arm.png` (AO, roughness, metalness 0), `height.png`, the pack's README, prompts and alignment
report, a `pbr.material.config.js` with its provenance (`buildingEligible: false`: a decal, not a wall material), and
an entry in `_manifest.json`. The data maps drop the alpha safely -- outside the letters they hold flat values -- and
the base colour is installed as delivered, not retinted. Note that `assets/` in a worktree is a junction to the main
checkout's, so the set lands in the one shared store, beside the other Bradbury sets.

**Respaced and enlarged** (same day: "edit the image to increase the space between the letters a bit" and "make it
bigger. it must shorten the distance to the capitals underneath by 50% (horizontal distance)"). The spacing is done
in the image, on every map alike: the nine glyphs are found as separate 8-connected shapes in the alpha, and the n-th
from the left moves `LETTER_SPACING_PX` 20 texels times n to the right, so every gap opens by the same 20 (6.6% of the
cap height) and the maps stay registered texel for texel; the canvas grows from 2172 to 2332. Empty columns cannot
split them -- R, A and D, and R, Y and the stop, overlap in their column projections -- and at any alpha at all the
R's and the A's faint rims, a texel apart, touch, so the glyphs are told apart above `CORE_ALPHA` 32 and each fainter
rim texel then joins the glyph it touches. The size is set from the pilaster capitals under the band: their tops
overhang the shafts, so their inner edges (x +-1.4842) are read off their own vertices, and the row's ends stand
`CAP_GAP` inside them -- half the 0.331 the first decal left. The row is 2.638 m wide and, at the respaced aspect of
7.18, 0.368 tall, 0.15 clear of the band's edges and 0.20 of the foliage panels; the piece asserts both.

`pieces/08_frieze.py` lays it where the extruded Arial Black letters and their rims were, centred in the band. The material cuts the letters out on the base colour's alpha at 0.5, as the pack's README
asks, and takes its relief from the normal map. The mesh under it follows the letters rather than being one quad: the
alpha is sampled on a `CELL_PX` 3-texel (3.4 mm) grid, kept wherever a letter shows, grown one cell, and merged into
12 flat faces. The texture, not the mesh, draws the edge in a render. A quad would render the same, but it draws as a
solid rectangle in the Solid viewport; this way the letters show there in their own mean colour. The object keeps the
name `frieze_letters`, so the overlay tools that measure it still find it. All three portal instances carry it.

**Tinted onto the wall** (2026-09-23: "adjust the tinting of the font so it matches better the color of the wall").
The image is warm terracotta, sRGB mean (200, 119, 71), against the band's (178, 111, 86): redder and short of
blue. The material gains it per channel, in linear light, onto the wall's own `SANDSTONE_SRGB`, the same way the
band's stone texture is gained onto it, so the letters are the same stone with the texture's variation and relief
kept (`LETTER_TONE` scales the target). Measured in the close-up render, letter faces against the band beside them:
11.9 sRGB levels apart before (+9 red, -6 blue), 2.7 after. In the Solid viewport the decal is drawn a shade (x0.8)
under the wall's colour, since a flat decal in exactly the band's colour would vanish there.

**Trap: new bmesh faces carry no normal until `bm.normal_update()`.** `dissolve_limit` compares face normals, so
without it the merge silently did nothing and the decal shipped as 53,277 quads; with it, 12 faces.

## The render scene: `build_scene.py`

Since AI 563 the scene links the **worn** block (`wear/bradbury_block_worn.blend`, written by `wear_layer.py`) by default and sets the wear layer's controls on itself; `wear=off` links the block itself exactly as described here. See "The wear layer (AI 563)" at the end.

`assemble_building.py` stays a model builder: it writes `bradbury_block.blend` and nothing else. The scene a ray-traced
still needs is a second file beside it (user 2026-09-20: "lets create a separate scene just for the render, and lets
start with the hdri", "keep it a separate scene/file"), written by

```
blender -b -P build_scene.py -- [key=value ...] [view ...]
```

into `bradbury_scene.blend`. Keys: `hdri` (the sky's strength, 1.0), `rot` (the sky turned about z, degrees), `sun` (a
lamp on the map's own sun, 0 = none), `ground` (`street` | `catch` | `none`), `exposure`, `samples`, `pct`, `res`; the
bare words are view names, and each one named is rendered into
`tests/artifacts/screens/bradbury_fix/portal_project/scene/`. The scene **links** the block instead of appending it
(`bpy.data.libraries.load(BLOCK, link=True, relative=True)`, 2194 objects into a `BRADBURY_BLOCK` collection), so the
block can go on being rebuilt and the scene picks its geometry up the moment it is opened again -- **but only for the
objects it already links.** A linked scene stores its object list BY NAME, resolved when it was built, so a rebuild
that changes existing objects' geometry or materials flows through, while objects the rebuild ADDS are simply absent.
That is how 81 new archivolts rendered as nothing at all (2026-09-22) while the ring's retune, which only changed
existing meshes and their material, showed up fine. Anything that adds objects needs `build_scene.py` run again; the
model file's
own inspection cameras and lights are unlinked, the scene bringing its own six (`st_corner`, `st_portal`, `st_along`,
`st_up` at a standing eye `Z_GROUND + EYE`, `hero_3q`, and since AI 574 `ref_3q`, the reference photo's stand, in its
own 3:2 frame -- see "The reference camera (AI 574)" at the end), Cycles on OptiX, AgX, 16:10.

The sky is the game's own — `assets/public/lighting/hdri/german_town_street_2k.hdr`, the default entry of
`IBLCatalog.js` — so a Cycles still and the engine light the block from the same sky. Where that sky's sun stands is
measured rather than guessed: `hdri_sun_direction` inverts Blender's equirectangular mapping (`u = (atan2(y, -x) + pi)
/ 2pi`, `v = (atan2(z, hypot(x, y)) + pi/2) / pi`, pixel rows bottom up), takes the brightest 0.005% of texels and
averages them as directions. This map reads **18.7 degrees up at azimuth 143.9** (105 texels, peak 95351 against a
mean of 0.70), and `sun=` puts a lamp there, on the map's own sun, for shadows crisper than a 2k image can throw.

That reading was mirrored (AI 574 item 9, 2026-09-25): Cycles maps u = 0.5 - atan2(y, x) / 2pi, and the Mapping node turns the lookup, so a texel at azimuth a is seen at a - rot; this map's sun stands at azimuth 74 at rot 250, not 33.9. The lamp was moved to the photo's sun and put back the same day at the user's request; it stands on the mirrored reading on purpose. See "The sun lamp (AI 574 item 9)" at the end.

### Before and after from one pose (2026-09-20)

`block=game` stands the **untouched game export** in the same scene, on the same cameras, under the same sky (user:
"can you generate a second screen, same pose, but using that version?"). It links
`tests/artifacts/blender/bradbury/before/bradbury_block_before.blend` -- the very file `assemble_building.py` opens, so
there is nothing to keep in step by hand -- and writes its own `bradbury_scene_before.blend` and its own shot folder,
`screens/.../portal_project/scene_before/`, so neither clobbers the other. The only thing that follows the block is the
ground: `SHRINK` and `BAY_GROW` are zero for the export, so the pavement is laid on the game's own outline (its far
kerbs land at x -53.73 / 29.73 against the built block's -53.23 / 34.19 -- the corner shrink and the extra bay, exactly).
The export reads 0.194 to **20.612** with 70 parts on `Z_GROUND`, so the same assert covers it.

`scene_compare/` holds the pairs side by side.

### Turning the sky (2026-09-20)

The map's own contents are scenery, and scenery at infinity has no scale. Its worst offender is a roadside sapling:
measured off the panorama it runs from -15.5 to +34.1 degrees of elevation, **49.6 degrees of sky**, which back from a
tripod at about 1.6 m makes it a **5.5 m tree standing 5.8 m from the camera** (its planting stake is visible beside
it). An environment texture keeps that angular size for ever and never shifts as the camera moves, so it fills 49.6
degrees while the whole 20.5 m block fills **29.8** from `st_corner` at 36.6 m: to look right where it appears to
stand, behind the block, it would have to be a **35 m tree** (user: "the tree behind the building, it is giant").
Nothing about the environment can be scaled -- it has no size -- so the only lever is which part of the map stands
behind the block.

`sweep_rot.py` (scratchpad) answers that by measurement: it opens the saved scene once and turns only the world's
Mapping node between frames, so a whole circle at 15 degrees costs 24 renders and no rebuilds (about 30 seconds). The
map has one clean stretch, the open field its own camera looked across, and `st_corner`'s frame is 65.5 degrees wide,
so it only fits between **rot 250 and 262**; `st_along` (54.4 degrees) wants **245 or less**; `hero_3q` (46.4) is happy
from 245 to 270. **250** is where all five views agree, and it lands the map's sun at azimuth **33.9** -- over
Broadway's shoulder, lighting that facade and shading 3rd Street's. It is now the default, with `sun` 8 and `hdri`
0.75 (the map's own sun is hazy: `sun=3` moved a frame by 1.86 grey levels on average, so the lamp carries the
modelling and the sky is pulled back to make room for it). `rot=0 sun=0 hdri=1` gives the plain map back.

### The ground (2026-09-20)

An HDRI is a picture at infinity: it lights the block beautifully but gives it nothing to meet and nothing to take its
shadow, so on the map alone the block floats (user: "the hdri makes the building to float, is there a strategy to land
it?"). Both halves of the cure are in the scene ("do both in one pass"). A **shadow catcher** renders as whatever lies
behind it and is still darkened by everything the block hides, sun and sky alike, so the map's own road takes the
contact shadow; and **real ground** — pavement, kerb and roadway — is laid from the block's own outline, which is what
puts the base at the right height and in the right perspective and gives the near field reflections that move with the
camera.

`ground=street`, the default, lays the real ground: `HULL` (the same outline `assemble_building.py` lays the walls on)
pushed out `PAVE_W` 4.20 m by `offset_poly` and **filled, not left as a ring** — filled, it runs on under the walls and
closes the floor of every recessed shopfront, whose glass starts at 0.194, 7 mm under the pavement; `scn_kerb` drops
the outline's `PAVE_H` 0.201 (the block's own base height) to the roadway at z 0; `scn_road` is one `clean_asphalt`
square out to `GND_R` 150 m; and the pavement on the far side of both streets, `ST_W` 13.0 m kerb to kerb, carries on
to the same edge as **a pinwheel of four rectangles** (south full width, then east, north and west each stopping at the
previous one's line) so they tile the outside of the streets without ever overlapping and z-fighting. The far kerbs
land at x -53.23 / 34.19 and y -35.08 / 34.58, which puts `st_corner` on a real pavement and `st_portal` out in
Broadway. Past 150 m there is no geometry at all: at that distance the map's own ground is a blur on the horizon and
the seam does not read. The materials are the catalog's, read the way the game reads them (base colour, the packed
AO / roughness / metal, the OpenGL normal) and tiled at each set's own `tileMeters` 4.0 over UVs that are metres:
`clean_asphalt`, `concrete_pavement`, `concrete` for the kerb. A 4 m tile over a street shows its repeat from any wide
lens, so a slow noise (22 m for the road, 14 m for the pavement) lifts and drops the tone by a tenth, which breaks the
grid without touching the surface.

Since AI 574 item 3 (2026-09-25) the pavement's corners are curb returns, its kerb a swept profile with a rolled edge and a gutter, and the far pavement eight blocks with the streets running on between them; see "The kerb and the sidewalk corners (AI 574 item 3)" at the end. The paragraph above describes the ground as it was first laid.

The catcher lies at z -0.050 out to 600 m, just under the roadway, so in street mode it shows only past the real
ground's edge. `ground=catch` drops the street and stands the catcher at the block's own pavement level instead, where
the map's road shows through it and takes the shadow — the quick version, and the one to use when the map's own street
should be the street. `ground=none` is the bare block. The block's base is asserted before any of it is laid: 71 of its
parts stand within 3 cm of `Z_GROUND` 0.201 (it reads 0.194 at its lowest and 20.732 at its highest), so ground laid at
that height meets it. The measurement has to come after `view_layer.update()` — a freshly linked object still carries
the `matrix_world` it had in the library, and before the update the block reads -1.498 with one part on the pavement.

The ground does take the block's shadow, and the proof is in the sun lamp rather than the eye: on the near ground of
`hero_3q`, adding `sun=20` at `rot=0` moves the mean from 96.4 to 96.6 — nothing, because that ground is in the block's
shadow — while at `rot=-84` it moves from 89.6 to 128.4, because there it is in the sun. What the default view does
**not** show is a shadow one can see, and that is the map's doing, not the ground's: its sun stands 18.7 degrees up, so
the block throws a 61 m shadow, and unrotated that shadow runs south-east, straight over everything the camera sees.
Both street facades are then backlit and the whole near field lies inside one shadow, which reads as flat light. A sun
across the frame is what shows the block standing on something: `rot=-84 sun=8 hdri=0.75` puts the map's sun in the
north-east, lights Broadway's facade, shades 3rd Street's and lays the shadow edge across the pavement at the corner.

## The wear layer (AI 563)

The block rendered as if it were finished yesterday, and two weathering passes had already been rejected for it: a
noise mottle on the trim (2026-09-17) and a whole-surface pass (2026-09-20), both "fake dark spot that looks hand made".
The user's rule #1 for this layer: **wear is never noise placed at random positions.** Every mark comes from a physical
source found on the model (a sill's end, a ledge's drip edge, an overhang, the pavement, an iron anchor) and follows a
physical path from it (down the wall, into shelter, up from the ground); the irregularity inside a mark comes from the
surface's own maps (the brick's joints, the stone's grain) or from its source's shape. AI 563 is the shared layer the
ten features (AI 564 to 573) plug into; it carries no wear of its own at its defaults, only a probe that proves it works.

It is a post-pass. `wear_layer.py` reads the built block and the portal and never writes them; it writes worn copies
beside them in `portal_project/wear/`, and `build_scene.py` links the worn block instead of the block. With the layer off
the scene links the untouched block, so "renders exactly as today" holds by construction, and it was checked anyway
(below). A rebuild takes about five seconds: no three-minute block rebuild per iteration.

### Commands

```
blender -b -P wear_layer.py --                       # the layer: masks, node library, worn portal, worn block, manifest
blender -b -P wear_layer.py -- features=runoff       # rebuild these features' masks, the rest from the cache
blender -b -P wear_layer.py -- elevations=1          # also draw each face square on with every feature's mask over it

blender -b -P build_scene.py --                      # bradbury_scene.blend: wear on at the default strengths (canonical)
blender -b -P build_scene.py -- wear=off             # bradbury_scene_wear_off.blend: the untouched block, as before AI 563
blender -b -P build_scene.py -- wear=debug           # bradbury_scene_wear_debug.blend: every mark in its feature's colour
blender -b -P build_scene.py -- wear_runoff=0.5 st_up    # any strength; view names render as before

blender -b -P render_wear.py -- wear=debug view=st_up                  # any mode, from the saved scene, no rebuild
blender -b -P render_wear.py -- wear=on wear_probe=1 cam=21,-3.35,9.2:16.8,-3.35,9.4:50 pct=50 samples=32

python wear_compare.py side OUT.png off.png on.png debug.png --labels "off|on|debug" --scale 0.5
python wear_compare.py diff before.png after.png --heat diff_x8.png
python wear_compare.py regions photo.jpg clean:x0,y0,x1,y1 mark:x0,y0,x1,y1
python wear_compare.py lighter feature_off.png feature_on.png [--again feature_on_2.png] --heat lighter.png
```

`render_wear.py` opens `bradbury_scene.blend` (or `scene=`), sets the controls, frames `view=` (one of the five cameras)
or `cam=x,y,z:tx,ty,tz:lens` (a camera at x,y,z looking at tx,ty,tz, as `VIEWS` is written), and writes one still to
`out=` or `tests/artifacts/screens/bradbury_wear/render_wear/<view>_<mode>.png`; `pct`, `samples`, `res`, `exposure`
as in `build_scene.py`. Nothing is saved back. `devices=gpu` (added by AI 570's critique fix, 2026-09-24) renders on
OptiX alone, which repeats to within one 8-bit level at every pixel; the default, `hybrid`, renders on OptiX and the
CPU together as the scene is set, and two such stills of one state differ wherever the two devices disagree (see "The
arch's black hairline" under edge wear). Compare two states of the layer with `devices=gpu`. `wear_compare.py` is
plain Python with Pillow (not Blender's).
`lighter` (added by AI 565's critique fix, 2026-09-24) is a deposit's check: a deposit darkens what it lies on and
never lights it up, so it lists the 8 px blocks of linear luminance the still with the feature on is lighter in than
the still with it off, by more than 2% and by more than 0.003, and exits with status 1 if there is any (`--again`, the
on still rendered a second time, leaves out the blocks the renderer itself does not repeat; `--heat` paints the lighter
blocks orange and the darker ones blue).

### What it writes, all in `portal_project/wear/`

| file | what |
|---|---|
| `masks/<feature>.png` | the feature's mask: the five faces unrolled side by side (the atlas, below), 16-bit grey or up to four channels |
| `wear_nodes.blend` | the `WEAR_layer` node group, its `WEAR_frame` and one `WEAR_F_<feature>` group per feature, with the mask images |
| `bradbury_portal_worn.blend` | the portal with `WEAR_layer` in its materials; the ornaments' linked materials worn as object-level copies |
| `bradbury_block_worn.blend` | the block with `WEAR_layer` in its materials, linking the worn portal; plus the debug view's source markers and whatever geometry a feature adds |
| `wear_manifest.json` | the source files' sha256, the atlas, per feature its label, default strength, controls, colour, counts and mask hash; `build_scene.py` reads it |
| `cache/<feature>.pkl` | a feature's sources, marks, paths, fields and apply data, for `features=` rebuilds |

Every path in them is relative (`//bradbury_portal_worn.blend`, `//wear_nodes.blend`, `//masks/...`,
`//../ornaments/...`, `//../../../../../../assets/...`), so a copy of `portal_project/` at the same depth renders the
same. The masks are derived from the model's geometry alone and are byte-identical from one build to the next (a
rebuild was checked against the manifest's hash). `build_scene.py` refuses a worn block older than the block, the portal
or the ornaments it was built from (their hashes are in the manifest): rerun `wear_layer.py`, or pass `wear_stale=ok`.
Note that a block with unsaved changes in an open Blender is not the block on disk, and the layer reads the disk.

### The switch and the controls

The controls are not in the materials. They are **custom properties of the scene that renders**, which every worn
material reads with Attribute nodes of type View Layer (looked up on the view layer, the scene, then the world; an
absent property reads 0):

- `wear`: 0 off, 1 on, 2 debug. The one switch.
- `wear_<feature>`: that feature's strength. 1.0 is its calibrated look (its module holds the absolute amounts), 0 turns
  it off alone, anything between or above scales it. The defaults come from each module's `DEFAULT_STRENGTH`.
- `wear_<feature>_<control>`: any extra control a feature declares (`CONTROLS`), e.g. an optional film, off by default.

`wear/controls.py` applies them all at once to a scene (`build_scene.py` at build time, `render_wear.py` before a
render): the properties, and the visibility of the scene's wear-only collections: `WEAR_SOURCES` (the source markers,
debug only, one child `WEAR_SRC_<feature>` per feature, shown only while that feature is on), `WEAR_GEO_<feature>`
(objects a geometry feature adds or substitutes, shown while it is on) and `WEAR_ORIG_<feature>` (the originals those
replace, shown while it is off). Every output of the layer is mixed from its untouched input by a factor that is 0 when
the layer is off, and a mix by 0 returns its first input exactly, so off is today's shading bit for bit. The render still
pays for the lookups when off.

Proof, every render at the scene's defaults (1920x1200, 128 spp, OptiX, AgX), against the pre-wear renders made from a
frozen copy of the project (`tests/artifacts/screens/bradbury_wear/series/final/before/`): the mean absolute difference in
8-bit levels over the whole frame, and the share of pixels off by more than 2. The noise floor is the untouched block
rendered again: two renders of the same scene differ too. That is the CPU, not the GPU: the stills render on OptiX and
the CPU together, Cycles gives the CPU a band of rows at the top of the frame that ends at another row every time, and
the two devices disagree at a few places (AI 570's critique fix, 2026-09-24, measured it); on OptiX alone
(`render_wear.py -- devices=gpu`) two renders differ by one 8-bit level at most, at any pixel. As of 2026-09-25 the
renderer no longer repeats the stills of `series/final/before/`: the same frozen pre-wear scene rendered again differs
from them by 0.27 to 0.38 levels, so render `wear_before/bradbury_scene.blend` again for an off-state check (AI 565's
second critique fix measured it; see its evidence).

| camera | noise floor (untouched block again) | worn scene, switched off | worn scene, on at defaults |
|---|---|---|---|
| hero_3q | 0.0165, 0.006% | 0.0163, 0.006% | 0.0165, 0.006% |
| st_corner | 0.0310, 0.055% | 0.0346, 0.072% | 0.0319, 0.057% |
| st_along | 0.0067, 0.004% | 0.0065, 0.003% | 0.0066, 0.003% |
| st_up | 0.0067, 0.003% | 0.0064, 0.001% | 0.0070, 0.003% |
| st_portal | 0.0162, 0.025% | 0.0161, 0.025% | 0.0162, 0.025% |

### The debug view

`wear=debug` turns every worn surface into clay grey (glass opaque, so a pane's marks show; metal matte since AI 568, so
a mark on the ironwork shows in its own colour), paints every mark in its feature's colour (only features whose strength
is above 0), and shows the sources: an octahedron for a point source, a square tube along a line source or an area's
outline, and a thinner tube along a mark's path (a streak's centre line), emissive in the feature's colour. A mark
cannot exist without a source: `paint()` needs a mark, a mark needs one of the feature's own sources, and the build
fails if any mask texel was painted outside every mark's box. The build prints the per-feature counts of sources, marks
and paths, and the manifest keeps them.

Colours, suggested so the ten read apart (a feature sets its own `DEBUG_COLOR`): 564 runoff blue (0.10, 0.35, 1.00), 565
soiling violet (0.55, 0.20, 0.95), 566 washed cyan (0.10, 0.95, 0.95), 567 street grime yellow (1.00, 0.85, 0.05), 568
rust orange (1.00, 0.40, 0.00), 569 efflorescence pink (1.00, 0.55, 0.75), 570 edge wear green (0.15, 0.85, 0.15), 571
glass grime teal (0.00, 0.55, 0.45), 572 pigeon red (1.00, 0.10, 0.10), 573 mortar erosion lime (0.60, 1.00, 0.20); the
probe is magenta.

### Where a mark lies: the faces and the atlas

The block's outline is five straight faces, the `HULL` every wall is laid on; each is a frame with `s` along it (left to
right as the street sees it), `d` out of the hull plane toward the street and `z` up. A point belongs to the face whose
plane it stands furthest in front of, so the corners split on their bisectors, and tops, soffits and returns belong to
the face they sit on.

| face | street | length | runs | out |
|---|---|---|---|---|
| S | 3rd Street | 50.19 | west to east | -y |
| SE | the chamfer | 4.00 | | +x -y |
| E | Broadway | 32.43 | south to north | +x |
| N | north face | 53.02 | east to west | +y |
| W | west face | 35.26 | north to south | -x |

Depths for orientation: the brick field at d -0.10, the bay insets -0.16, the columns and raised stretches +0.20, the
band's face +0.14, the piers' stone +0.22; the crown and the portals' bands reach about +0.8.

A feature's mask is one image, the **atlas**: the five faces side by side in (s, z) metres, each over s from -1.6 to its
length + 1.6 (corners, mitres, the crown's reach), z from 0 to 21.2, 192.4 m by 21.2 m in all (9620 x 1060 at the 2 cm
default). Every offset and size is a multiple of 0.2 m, so a feature may pick 1, 2, 4, 5, 10 or 20 cm (`MASK = dict(res=,
channels=1..4, bits=8|16)`) and one (u, v) serves every mask. At render time the shading point is projected onto its
face's plane and each feature's mask is read there: a mark painted at (s, z) lies on whatever surface the street sees at
that spot, and the brick's own joints, not the mask, give it its grain. 2 cm is plenty for a streak's edge, which the
joints draw; smooth fields (shelter, exposure) are happy at 5 or 10 cm and cost a quarter or a twenty-fifth.

The projection's one trait: every surface at (s, z) reads the mask there, so a column's return, a reveal's side or a
sill's top next to a mark takes the mark's edge value over its whole depth. A feature says which surfaces it means with
the face-frame normal: `g.facing()` (walls and fronts), `g.upward()` (tops), `g.downward()` (soffits), or `Nt`, `Nd`,
`Nz` and the depth `D` directly. The probe shows the pattern: its band stops at the sill's end, and without
`g.facing()` the column return beside that end turned magenta for its whole depth.

`elevations=1` draws each face square on at 5 cm, coloured by material class, and every feature's mask over it in the
feature's colour, into `tests/artifacts/screens/bradbury_wear/elevations/`: a check of where marks land before any render.

### What a material hands the layer

`WEAR_layer` stands between each exterior material's texture reads and its Principled BSDF: **Color** and **Roughness**
always, **Normal** where the material has a normal map (the map's output goes in and comes out, so relief is kept and a
feature may add to it), **Alpha** and **Transmission** on glass, **Metallic** on metal (added by AI 568: rust is an
oxide, not a metal), **Specular** on glass (the BSDF's Specular IOR Level, added by AI 571's rework: where dust covers a
pane there is no glass to reflect). Three more inputs come from the material's own maps: **Joint** (1 in a mortar joint, 0 on a brick's
face: from the brick set's `height.png`, read with the brick's own coordinates, its faces at the median and its joints
in the low tail; or a procedural Brick Texture's mortar factor), **Grain** (the set's own height or packed AO, spread
over about 0..1) and **Bed** (added by AI 564: 1 in a bed joint and on the lip of brick just under it, `BED_LIP` 12% of
a course deep, where water hanging at a bed joint spreads along it; the joint map read a second time a little higher in
the texture, so a head joint, vertical, does not widen; the set's 16 courses are counted in its own height map, so the
lip is a share of a course whatever the tile) and **Joint Wide** (added by AI 573: the joint grown `JOINT_GROW` 2.5% of
a course, 2 mm on the wall, past every edge; the set's joints are a one-pixel step in its height map, so no remapping of
Joint can widen them, and the map is read twice more, a little up and along and a little down and back, which widens bed
and head joints alike on both sides). Materials without them get Joint 0, Grain 0.5, Bed 0 and Joint Wide 0; a
procedural Brick Texture hands its mortar factor as Bed and Joint Wide too. A packed AO that is flat (the terracotta trim's reads 0.984 to 0.985)
gives Grain 0.5: spread over 0..1 it had turned the map's last-bit quantisation into a speckle (fixed in AI 564). Note
that the dressed sandstone's Grain is a cloud with no joints in it: a feature that holds a deposit in its hollows will
draw blotches.

Each material has a **class** (`wear/classes.py`), which is what a feature's response keys on: brick (the wall, the arch
rings), terracotta (the trim of sills, band, impost, crown, capitals, archivolts; the band's ornament; the crown's flower
tiles), stone (the ground floor's moulding and piers, the portal's sandstone, carved and granite, the lettering), glass
(the game's window glass, the storefront transoms, the portal's door glass), metal (the fire escapes, the storefront
frames, the doors' bronze hardware, the portal's iron and brass), paint (the game's window frames, the white transom panels), wood (the portal's
doors and ceilings), glazed (the portal recess's glazed brick and tiles), and none (the wall's hidden faces, the
backdrop panes behind the glass, the roof deck, the lamp globes), which the layer leaves alone. The build prints the
table. 66 materials are worn: 48 in the block, 18 in the portal.

A calibration trap: the scene's AgX view compresses a sunlit wall's tones, so an albedo change reads much smaller in the
picture. The probe's first cut took 45% off the brick's albedo and moved the rendered pixels by 6% (221 to 208 in red).
Judge a feature in rendered pixels, not in albedo.

### Plugging in a feature

A feature is one module in `wear/features/` and one line in `wear/registry.py` (`MODULES = [probe, runoff, ...]`). The
probe (`wear/features/probe.py`) is the smallest complete one. A module holds:

```
NAME = "runoff"                  # scene property wear_runoff, mask masks/runoff.png, node group WEAR_F_runoff
AI = 564
LABEL = "runoff streaks below ledges"
ORDER = 220                      # shader chain position, lowest first (see below)
NEEDS = ("soiling",)             # built after these, whose published fields it reads (optional)
DEFAULT_STRENGTH = 1.0           # the scene's default; the calibrated amounts live in the module
DEBUG_COLOR = (0.10, 0.35, 1.00)
MASK = dict(res=0.02, channels=1, bits=16)   # or leave MASK out for a feature without an atlas mask
CONTROLS = {"film": 0.0}         # optional extra scene controls, wear_<name>_<control>

def build(ctx): ...              # the geometry side, run on the built block
def shader(g): ...               # the shading side, run once into WEAR_F_<name>
def apply(actx): ...             # optional: attributes or geometry in the worn block
def apply_portal(actx): ...      # optional: the same in the worn portal
def elevation(canvas): ...      # optional: what the elevation images draw of its mask, (H, W) (channel 0 if absent)
```

**build(ctx)** finds sources on the model and paints marks. `ctx.block` is the open file's render-visible geometry
(portal instances included) in one world BVH:

- `block.instances(prefix)` gives instance records (`name`, `object`, `instancer`, `matrix`, `i`); `block.points(rec)`,
  `block.bbox(rec)` and `block.triangles(rec)` (world corners, unit normals, areas, classes) read one of them.
- `block.ray(origin, direction)`, `block.front(f, s, z)` (the first surface the street sees at (s, z) of face f) and
  `block.front_near(f, s, z, d)` return a `Hit`: point, normal, instance name, material, class, face and its (s, d, z).
- `block.front_map(f, res)` is `front` over a whole face (depth, class, normal z and instance per texel; cached;
  300,000 rays in 0.8 s); `block.front_grid(f, S, Z)` over any arrays.
- `block.trace_down(f, s, z_top)` follows a film of water down the face from just below z_top until something projecting
  catches it (`caught`, `ground`) or the surface ends (`opening`, `step back`, `step forward`); pass a larger `tol` to
  let it run over a shallow reveal. Below the Broadway sills it stops after 0.29 m, where the lower window's 3 cm
  recess begins.
- `geometry.FACADES[f]` (`.sdz(x, y, z)`, `.world(s, d, z)`, `.t`, `.n`, `.L`), `geometry.facade_of(x, y)`,
  `geometry.Z_GROUND` (0.201).

and `ctx` itself:

- `ctx.source(id, kind, points, facade, **info)`: a physical source, `point`, `line` or `area`, drawn in the debug view.
- `ctx.mark(source, facade, **info)`: one mark from it.
- `ctx.grid(f, s0, s1, z0, z1)`: the mask's texel centres (S, Z) over that part of face f.
- `ctx.paint(mark, values, s0, s1, z0, z1, channel=0, op="max")`: values (an array over the grid, or a function of S, Z)
  combined into the mask (max, add, screen, set, min).
- `ctx.path(mark, points)`: a polyline the debug view draws for the mark.
- `ctx.publish(key, value)` and `ctx.field(feature, key)`: share what one feature derives with the features that NEED it
  (the rain-exposure measure 565 computes and 566 and 573 use; the runoff paths 564 traces and 566, 569 and 573 follow;
  567's splash zone). Share at build time and paint your own mask from it; a feature's shader reads only its own mask.
- `ctx.stash`: plain data for the feature's `apply()`.

**shader(g)** writes the feature's node group with `g`, a small expression builder (`wear/nodes.py`, class `G`). The
group starts as a pass-through and the feature rewires what it changes. Inputs, `g.i(name)`: the state `Color`,
`Roughness`, `Normal`, `Alpha`, `Transmission`, `Metallic`, `Specular`; `Mask` (its atlas sample as a colour) and `Mask Alpha`;
`Attr` (its mesh attribute `wear_<name>`, 0 where absent); `Strength`; `Class`, `Joint`, `Grain`, `Bed`, `Joint Wide`; `Facade`, `S`,
`D`, `Z`, `H` (height above the pavement), `U`, `V`, `Nt`, `Nd`, `Nz`, `Position`, `True Normal`; `Clean Color` and
`Clean Roughness` (added by AI 566: the surface as the deposits find it, the state entering the first feature at ORDER
200 or later, for a feature that takes deposits off again; before the deposits it is the feature's own input). Outputs,
`g.o(name, value)`: the state, and `Debug` (how much of the mark is here, 0..1, not scaled by strength). `g.result` is
the feature's own build `Result` (its sources, marks, fields and stash; fresh, or from the cache in a `features=`
rebuild), for a shader whose constants are what its build found (added by AI 572's rework: its roosts' blocks, and their
drips' curtains). Helpers: `add sub mul div mn mx pow absf gt lt eq one_minus clamp map smooth math`,
`mix(a, b, t, 'FLOAT'|'RGBA'|'VECTOR', blend)`,
`rgb sep scale_rgb lum vec xyz vmath dot`, `attr image`, `is_class(...)`, `facing upward downward`, `control(name)`, and
`node(idname)` / `set(socket, value)` for anything else (a Bump node for the mortar's relief). Two rules keep the switch
exact: change the state only through `mix(input, changed, amount)` with `g.i("Strength")` a factor of `amount`, so
strength 0 hands the input on untouched; and never produce NaN or infinity (Cycles divides safely, but a power of a
negative number does not).

**apply(actx)** runs in the worn block before it is saved: `actx.object(name)`, `actx.own_mesh(obj)` (the game shares
meshes between windows: copy first), `actx.set_attribute(obj, values, domain)` (the float attribute the shader reads as
`Attr`), and `actx.add_object(name, mesh, replaces=None)` (an object of the feature's own, shown while the feature is on,
with `replaces` shown instead while it is off; a chipped copy of the pier ring, say). The portal is one collection
instanced three times, so nothing inside it can be switched per feature from the scene: geometry for the portals goes
into the block as objects placed with `PORTAL_A`, `PORTAL_C` and `PORTAL_E`'s transforms; masks and attributes on the
portal are fine.

**ORDER and NEEDS.** `ORDER` is the chain the looks are laid in; `NEEDS` is the build's dependency order. Suggested
chain: mortar erosion 100, edge wear 110, then the deposits, soiling 200, washed 210, runoff 220, street grime 230,
efflorescence 240, rust 250, pigeon 260, then glass 300 (the probe is 900). Suggested needs: washed on soiling and
runoff; efflorescence on runoff and rust; mortar erosion on soiling, runoff and street grime; pigeon on soiling, for
shelter. The AI numbers already build in that order. As built, washed stands at 225, after runoff: it takes the
soiling and a stream's deposit off again, so it must come after both (see its section).

### Calibration

The references are on disk in `tests/artifacts/screens/bradbury_fix/references/`: the 1960 HABS CA-334 photos
(`loc_habs_ca0212_001_corner_public_domain.jpg`, the corner; `loc_habs_ca0212_010_entrance_bays_public_domain.jpg`) and
current colour photos (`commons_*`). `wear_compare.py regions` measures named pixel boxes and gives each one's linear
luminance as a ratio of the first: measure a clean patch and a mark in the photo, render the same element in the same
light, measure the same pair, and tune the feature's constants until the ratios agree. Compare like with like: under the
crown the 1960 photo reads 0.26 of the open brick, and most of that is the cornice's own shadow, not soiling. Keep
`DEFAULT_STRENGTH` at 1.0 and put the calibration in the module, so the strength stays a plain dial.

### The probe, and the evidence for AI 563

The layer ships one feature of its own, `probe`, **off** (`DEFAULT_STRENGTH` 0): the band below one Broadway sill
(`sill_1016`, floor 3, the one nearest y -5), found on the model, followed down the wall with `trace_down` for 0.29 m to
the lower window's recess, painted as wide as the sill, darkening masonry that faces the street; magenta in the debug
view with the sill's drip edge and the band's path drawn. `wear_probe=1` turns it on. It exists to prove the plumbing end
to end and to be the template.

Evidence in `tests/artifacts/screens/bradbury_wear/framework/`: `<camera>_off_on_debug.png` for the five cameras (off |
on at the defaults | on with the probe | debug with the probe, 50%), `renders/` (the full-size stills), `diff/` (the
difference images, x8), `offstate_pixel_diff.txt` and `.json` (the table above, with the probe's footprint too), and
`renders/closeup/` (the probe's sill square on: off, on, debug).

## Runoff streaks below ledges (AI 564)

The first real wear feature, `wear/features/runoff.py` (`wear_runoff`, blue in the debug view): the dark streaks rain
draws down the facade below the places where its ledges shed water. Rain collects on a projection and leaves it at
particular places; on the way down the wall it picks up the dirt that settled there and leaves it behind ("dirt
washing"). A projection without a proper drip lets its water creep back along its underside to the wall, the most common
reason for dirt marks on facades (Blocken & Carmeliet 2013, citing Robinson & Baker; Dorsey, Pedersen & Hanrahan 1996
simulated these flow stains). Every streak has a source found on the built model and a path followed from it; nothing is
placed by noise, and the mask is byte-identical from one build to the next. Since the rework of 2026-09-23 each source
sheds its own share of the water ("One source at a time", below), so no two sill ends, brackets or capitals shed the
same streak; since the critique of 2026-09-25 a capital's water leaves its foot by a few drips of its own, each a narrow
streak, instead of as a sheet ("A capital's drips", below).

```
blender -b -P wear_layer.py -- features=runoff                 # rebuild its mask alone (about 7 s), the rest cached
blender -b -P render_wear.py -- wear=on wear_runoff=0 view=st_up    # off; 1 is the calibrated default, 2 twice as heavy
blender -b -P render_wear.py -- wear=debug view=st_up
```

### The sources

| kind | on the model | count | where the water goes | where it stops |
|---|---|---|---|---|
| sill end | both ends of every `sill_*` (floors 3 and 4) | 156 (6 shed nothing) | down the jamb's inside corner (112, the deep field) or straddling the end (44, raised stretches) | the part beyond the strip's 12 cm margin at the window head 0.59 m down; the corner channel runs on beside the lower window and fades (0.4 to 2.5 m, by the end's water) |
| bracket | the foot of each console under the band (the 28 `ge_bracket45_*` bay meshes split at gaps along the face) | 186 (7 shed nothing) | from the part of the foot its water leaves over, 0.06 to 0.10 m wide | a window head 0.35 m down (111), or down a mullion or pier (68, 0.4 to 1.6 m) |
| column capital | the foot of each `ge_capital.*` under the band: its drips, 1 to 3 (30 in all) | 22 (6 shed nothing) | from each drip, at a corner of the foot or along its front, a narrow streak down the column's face, widening as it falls | fades after 0.5 to 2.3 m |
| springing capital | the foot of each `ge_capital5.*` at the top floor's springing: its drips (37 in all) | 42 (14 shed nothing) | from each drip a narrow streak down the mullion | caught by the band's top cornice 0.99 m down (21), or fades before it (16) |
| crown cornice | the underside of `ge_crown_moulding` (19.10), the whole of each face | 5 runs | down the top floor's wall | caught by an arch ring (0.2 m) or the impost course (1.05 m) |
| impost course | the underside of `impost_course5` (17.73) | 44 runs | down the piers | fades after 0.64 to 0.90 m |
| band 4-5 | the underside of `ge_cornice45_bottom` (15.63), between brackets and capitals | 213 runs | over the wall and the window strip's 9 cm head | a window head (117) or fades (96, 0.8 to 1.8 m) |
| ground floor crown | the underside of `ge_crown` (5.86) | 5 runs | down the upper band | caught by the string course 0.44 m down |
| string course | the underside of `ge_cornice` (5.24) | 8 runs | down the band strip | the storefront heads 0.76 m down; down the piers it fades |
| portal crown moulding | `ge_cornice` where it breaks forward over a portal's frieze band (A, C, E) | 3 runs | down the BRADBURY frieze | the arch block's 20 cm step back, 0.76 m down |

The second floor has no sills: its windows stand on the ground floor crown's foot (6.292), a continuous ledge 0.4 m
deep. Their water spreads over it and leaves with the crown's own over the crown's drip line, so the second floor sheds
as part of that curtain, and the curtain is heavier below each window (glass sheds all the rain it takes), by that
window's own draw (`WINDOW_GAIN`, 0.15 to 1.05 more, 0.6 in the middle, spread 0.2 m over the ledge), rather than as
pairs from sill ends. Nor do the top floor's windows have sills: they stand on the band's top cornice, which the prompt
does not list, and which sheds onto the band's own frieze.

The courses' curtains are found, not listed by position: for each course and face, the columns where the course is what
the street sees just above its lower edge and a masonry wall what it sees just below, set back no more than `DRIP_MAX`
0.35 and not a bracket or a capital (those shed their own streak), grouped into runs.

### The path

Each column of a streak follows the film of water down the elevation, the face as the street sees it, cast lazily on the
mask's 2 cm texels (2.1 million level rays, the fire escapes looked through: they hang up to 0.85 m out from 3rd Street's
wall and the film runs on behind them). The film runs over a step back of up to `CREEP` 0.10 (the window strips' 9 cm
heads are crept round) and over a step forward of up to `CATCH` 0.03 (a bead); it stops where a surface standing further
out takes it on its top (the sill, the band or the string course below, an arch ring: "caught"), where an edge throws it
off (a window head, an opening, a recess deeper than 0.10: "edge"), or at glass, a frame or metal. So no streak runs
through an opening and none lies on glass or metal; the shader keys on the class as well. With nothing to stop it, a
streak is gone `LEN_CAP` 3 e-folds below its source.

A deep-field sill sits inside its recessed window strip, which runs from floor to floor with a 12 cm margin of recessed
panel between the jamb and the window's frame. The water off the sill gathers at its ends, where the strip's jambs meet
it, and runs down that inside corner: the streak hugs the jamb, most of it runs on beside the window below, and only its
inner part reaches the window head. On the raised stretches the spandrel is flush with the wall, so the streak falls
from the sill's end and straddles it.

### Strength and length: the water each source collects

- a sill end: the sill's own length `L` (its window sheds onto it), each end half of it: value `0.85 sqrt(L / 2.735)` times
  the height's exposure (wind-driven rain is heaviest at a facade's top edge: 0.6 at the pavement rising to 1 at 20.73),
  e-fold `0.55 sqrt(L / 2.735)` m, width at the source `0.07 sqrt(L / 2.735)` m. So a single window's sill (1.38) sheds a
  shorter, fainter streak than a pair's (2.74) and a triple's (3.89) a longer one; floor 4's are a little stronger than
  floor 3's.
- a course's curtain, per column: `0.60 sqrt(reach / 0.40) exp(-soffit / 0.35)`, where `reach` is how far the course
  stands out over the wall it sheds onto (its most projecting member, sampled every 4 cm up it) and `soffit` how far its
  lower edge stands out from the wall below it, the water that creeps back rather than dripping clear. No height factor:
  a course takes what runs down the facade above it as well as its own rain. So the band's deep runs, whose 0.245 m
  soffit throws most of their water clear, carry a faint curtain (0.30) while its brackets, which touch both band and
  wall, carry the water down in streaks (0.55); on the raised stretches, where its moulding sits on the wall, the band's
  curtain is 0.37; the crown, the top and the furthest out, sheds the heaviest (0.66).
- brackets 0.55 (e-fold 0.45); a capital 0.40 (0.60) under the band and 0.40 (0.45) at the springing, for its whole
  water leaving by one drip (each drip takes its share of it: "A capital's drips", below).

A streak widens `SPREAD` 0.14 m per metre of descent. That is the geometry's measure, the same for every source of one
kind; each source then sheds its own share of it.

### One source at a time (rework 2026-09-23)

Every sill, bracket and capital on this building is the same shape, so the measure above shed the same streak from each:
156 sill ends in 78 matching pairs, 186 matching bracket streaks, 64 matching capital curtains, the same mark stamped at
every window of a facade of identical windows (user 2026-09-23, reviewing the layer: marks must not repeat identically
from one instance to the next; noise inside a mark stays out, as before). What makes one streak differ from the next on a
real front is what the model does not carry: a sill set a few millimetres out of level, a sound or an open joint where it
meets the jamb, a window its tenant keeps clean, a band that drips clear over one bracket and not over the next. So each
source draws its own share of the water the geometry gives it, and the water sets the streak as the geometry did: its
value, its e-fold and a sill end's width all go as the water's square root (as a sill's length sets them), so a trickle
is faint, short and thin and a heavy end long, dark and broad.

| source | drawn | bounds |
|---|---|---|
| sill | its fall along its length: the share of its ends' water its left end takes, so its two ends differ | 0.5 ± 0.30 (`SILL_SPLIT`) |
| sill | the share of its water that runs along it to its ends rather than off its front | 0.55 to 1.15 (`SILL_FALL`) |
| sill | the dirt that water carries (a window and sill its tenant keeps clean): the value only | 0.75 to 1.10 (`SILL_DIRT`) |
| sill end | what its joint with the jamb lets into the corner: sound for about one end in six (`SOUND_P` 0.18) | sound 0 to 0.30, else 0.70 to 1.30 |
| bracket | the water it carries: the band drips clear over about one in seven (`DRY_P` 0.15) | dry 0 to 0.30, else 0.50 to 1.40 |
| bracket | the part of its foot the water leaves over, anywhere across the foot | 0.55 to 1.00 of its width (`EXIT`) |
| capital | its water and the drips it leaves its foot by: since the critique of 2026-09-25, see "A capital's drips" | |
| run of the band, the impost or a portal's moulding | its curtain's value, and its e-fold | 0.70 to 1.15, 0.80 to 1.20 |
| window on the ground floor crown | its extra water over the ledge | 0.15 to 1.05 (0.6 before) |

A sill end's water is `2 x split x fall x joint`, 1 being what each end took before (half the sill's). A source whose water
is under `WATER_MIN` 0.06 sheds nothing: its marker stays in the debug view, with no mark and no entry in the published
lists. The square root is held to `K_MAX` 1.3 (a failed joint, the heaviest). Where a range is given, the value is the
mean of two uniforms, the middle likelier than the ends. The seed is the source's own name or place (`draw`: the sha256
of `runoff:` and a key, two bytes to a uniform): the sill's object and its end, the bracket's bay mesh and its index, the
capital's object, a run's kind, face, span and height, a window's face and span. A rebuild draws the same values (the
mask's sha256 is the same from one build to the next), and a change elsewhere on the model reshuffles nothing. The crown
and the string course run whole along each face, one element each and a continuous band rather than a stamp: they keep
the geometry's measure, and so do the paths, the stopping rules, the joint-following edges and the look.

As built (the build prints it, `runoff drawn ...`):

| source | water | shed nothing | value | e-fold | runs |
|---|---|---|---|---|---|
| sill end | 0.78 (0.01..1.70): a quarter below 0.54, a quarter above 1.00, 7 above 1.3 | 6 of 156 | 0.55 (0.14..1.00), was 0.71 (0.47..0.85) | 0.48 m (0.14..0.82), was 0.55 | 1.47 m (0.44..2.48), was 1.68 (1.20..2.00) |
| bracket | 0.91 (0.00..1.34), 3 above 1.3 | 7 of 186 | 0.53 (0.14..0.64), was 0.55 | 0.43 m (0.11..0.52), was 0.45 | to a window head 0.35 m (111); down a mullion 0.41 to 1.61 m (68) |
| column capital | 0.98 (0.07..1.26); since the critique 0.67 (0 to 1.59) | none of 22; since the critique 6 | 0.40 (0.11..0.45), was 0.40; since the critique per drip 0.22 (0.10..0.49) | 0.59 m (0.16..0.67), was 0.60; since the critique 0.33 m (0.15..0.74) | 1.81 m (0.52..2.06), was 1.82; since the critique 1.02 m (0.48..2.26) |
| springing capital | 0.92 (0.03..1.36), 2 above 1.3; since the critique 0.53 (0 to 1.55) | 1 of 42; since the critique 14 | 0.40 (0.15..0.48), was 0.41; since the critique per drip 0.33 (0.12..0.52) | 0.43 m (0.16..0.52), was 0.45; since the critique 0.35 m (0.13..0.56) | to the band's top cornice 0.99 m (35), or 0.53 to 0.77 m (6); since the critique (21) and 0.43 to 0.95 m (16) |
| band run | its share 0.93 (0.73..1.13) | | 0.28 (0.22..0.41), was 0.30 | 0.49 m (0.26..0.58), was 0.50 | to a window head (117), or 0.82 to 1.78 m (96) |
| impost run | its share 0.94 (0.74..1.04) | | 0.27 (0.21..0.30), was 0.29 | 0.24 m (0.20..0.29), was 0.25 | 0.64 to 0.90 m, was 0.78 |
| portal moulding | shares 1.06 (3rd Street), 0.77 (Broadway), 0.83 (the west face) | | 0.34, 0.24, 0.26, was 0.32 | 0.28, 0.34, 0.35 m, was 0.31 | 0.76 m, the arch block's step |
| ground crown window | its gain 0.58 (0.26..0.99), 81 windows | | the curtain 0.46 (0.36..0.47), was 0.48 | | |

Most sources shed a little less than the geometry's measure (the median sill end's value is 0.78 of what it was, the
tenants' dirt included), about one in four more, a few next to nothing and 14 nothing at all (33 since the critique of
2026-09-25, 20 of them capitals). The published fields keep their keys and formats, so the features that follow take
the variation up on their rebuild (see "Published", below).

### A capital's drips (critique 2026-09-25)

The fresh-eyes review of the rework found the capitals still one stamp. Shed as a sheet over part of its foot (`EXIT`,
0.55 to 1.00 of it), every column capital hung the same flat-topped panel on its shaft: about 0.5 m wide on a 0.78 m
face, at full strength across its width, with straight sides that followed no geometry (the sheet's inside-ness was 1
across it, so the shader's joint-following edge had nothing to reach along), fading over about 1.8 m. Its water, the
mean of two uniforms under a square root, left 18 of the 22 at a value of 0.35 to 0.45 and a width of 0.46 to 0.67 m. On
the review's 4K elevations, runoff on against off in a box 0.1 to 0.7 m under each foot read 0.82 to 0.85 on 3rd Street
(in shade), 0.94 to 0.96 on Broadway and the north face (in sun) and 0.85 to 0.86 on the west face: 19 of the 22 alike.
The 42 springing capitals hung the same rectangle inside their mullions, weaker and more varied in strength.

The water that runs down a capital's bell does not leave its foot as a sheet. It gathers into rivulets, where the bell's
sides bring their water down to the foot's corners and where the front edge happens to sit a little low, and leaves by
those; the streaks under a capital start at those points, narrow, and widen as they fall. So each capital draws its own
(`capital_draw`, the sha256 of `runoff:` and the capital's object and what is drawn, two bytes to a uniform):

| per capital | drawn | bounds |
|---|---|---|
| its water | nothing: what drips onto it falls clear | column capitals 30% of the time, springing 25% (`CAP_DRY_P`) |
| | otherwise one uniform over a wide range: a trace as likely as a heavy stream | 0.15 to 1.60 (`CAP_WATER`) |
| its drips | how many rivulets the water leaves the foot by | 1, 2 or 3: 40, 40, 20% (column capitals), 60, 30, 10% (springing, half the foot) (`DRIPS_P`) |
| each drip | its share of the water, flat over every way of splitting it | one may take most of it, another next to nothing |
| each drip | where it leaves: at a corner of the foot (a free one) | half the time (`CORNER_P`) |
| | otherwise anywhere along the front edge | uniform |

The drips leave from the part of the foot that stands on the shaft or the mullion under it (the surface there within
`CATCH` of the foot's depth): the column capitals' feet stand 5 cm inside their shafts, the springing capitals' overhang
their mullions over the windows' frames by a centimetre. Drips nearer than `DRIP_GAP` 0.08 m are one rivulet, with both
shares; one whose water is under `WATER_MIN` 0.06 sheds nothing, and a capital none of whose drips sheds keeps its
foot's marker with no mark. Each drip sheds a streak of its own, as a bracket's foot does: with k the square root of its
own water (held to `K_MAX`), its value is `0.40 k` times the height's exposure (`CAPITAL_AMP`, `SPRING_AMP`), its e-fold
`0.60 k` (`0.45 k` at the springing) and its width at the foot `DRIP_W0 0.07 k`; it widens `SPREAD` 0.14 m per metre
with the lateral profile, so the shader breaks its edges on the bed joints as it does every streak's, and it starts at
its drip, not along a line across the foot. It keeps to the face it leaves onto: its columns are the ones whose surface
stands within `CATCH` of the drip's own, so past the shaft's or the mullion's arris its water does not reach the wall
0.3 m behind. Two that widen into each other merge (painted with max, as everywhere). The paths, the stops, the shader
and the look are unchanged.

As built (the build prints it, `runoff drawn ...` and `runoff drips ...`):

| | capitals | shed nothing | drips | 1, 2, 3 drips | at a corner, along the front | a drip's water | value | e-fold | runs |
|---|---|---|---|---|---|---|---|---|---|
| column capital | 22 | 6 | 30 | 6, 6, 4 | 10, 20 | 0.30 (0.06..1.53) | 0.22 (0.10..0.49) | 0.33 m (0.15..0.74) | 1.02 m (0.48..2.26) |
| springing capital | 42 | 14 | 37 | 20, 7, 1 | 20, 17 | 0.60 (0.08..1.55) | 0.33 (0.12..0.52) | 0.35 m (0.13..0.56) | to the band's top cornice 0.99 m (21), or 0.43 to 0.95 m (16) |

A drip's width at the foot is 3.8 cm at the median under the band and 5.5 cm at the springing (1.7 to 8.7): where the
sheet was 0.46 to 0.67 m and 0.21 to 0.36 m. Measured on the review's 4K elevations, rendered again before and after at
64 samples (`rework/runoff/critique_r2/wide/`): the runoff on against off in a box 0.1 to 0.7 m under each foot and
across all of it, and the darkest 3 cm wide strip in that box, a stream's core:

| face | before: box | after: box | after: darkest strip, capital by capital along the face |
|---|---|---|---|
| 3rd Street (shade) | 0.87 to 0.90 (0.97 at s 10.2) | 0.97 to 1.00 | nothing, 0.80, 0.84, 0.93, nothing, 0.91 |
| Broadway (sun) | 0.95 to 0.97 | 0.99 to 1.00 | 0.98, 0.93, nothing, 0.97 |
| north face (sun) | 0.95 to 0.97 | 0.99 to 1.00 | nothing, 0.99, 0.96, 0.96, nothing, 0.93, 0.96 |
| west face | 0.89 to 0.99 | 0.98 to 1.00 | nothing, 0.98, 0.84, 0.94, 0.95 |

So on every face one shaft carries a clear streak, a few a trace and some nothing, and no two alike: a single stream
down the middle of one shaft, a corner stream down the side of the next, three faint ones on another. The springing
capitals likewise (3rd Street's twelve: nothing, 0.88, 0.94, 0.85, 0.95, 0.84, 0.85, nothing, 0.91, 0.86, 0.93, nothing;
before, 0.80 to 0.97 as twelve rectangles). The west face drew 6 of its 9 springing capitals dry, a run of the dice of
about 1 in 100 that was left as drawn (no seed was picked): its top floor reads clean but for three mullions.

### The look

The mask (`masks/runoff.png`) has two 16-bit channels, both smooth: R, the deposit a streak leaves (its value along its
length times its profile across), and A, how far inside its width a point is (1 on its axis, falling to 0 past its
edge). Both are painted with max, so overlapping marks combine as the heavier of the two. The shader cuts a crisp edge on
a brick's face where A passes 0.5, lets it reach `EDGE_LIP` 0.35 further out along a bed joint and the lip under it (the
layer's Bed), and lets the joints hold it longer down its length (`R ** 0.5` there): water hangs at the bed joints and
spreads along them, and mortar holds the dirt, so a streak's edges and its end break up course by course, and an
ashlar's joints do the same on stone. The stone's and terracotta's Grain is deliberately not used: the dressed
sandstone's relief is a cloud with no joints in it, and a deposit held in its hollows read as blotches.

Where it lies, the colour goes `0.85 x value` of the way toward DIRT (the masonry's own colour, 55% greyed toward its own
grey, at 40% of its brightness), and the roughness to at least 0.85: darker, a little greyer, matte, the brick pattern
still under it and the normal map untouched. It never touches a ledge's top or a soffit (every point of an underside
reads one row of the mask, so a drip line's value would lie flat across the whole soffit), nor glass or metal.

### Calibration

Measured in rendered pixels, the linear luminance of the streak's core against the same box with `wear_runoff=0`, on the
full-size close-ups at the scene's defaults:

| sill end | top 20 cm | 0.2 to 0.5 m below |
|---|---|---|
| 3rd Street, in shade | 0.64 | 0.76 |
| Broadway, in sun | 0.84 | 0.90 |
| Broadway, in a column's shadow | 0.74 | 0.78 |

The references: the 1960 HABS photo of the Broadway bays (`loc_habs_ca0212_010`) shows that facade in sun with clean
spandrels at the sill ends, so a sill streak must stay under about 10% contrast at its 3 cm per pixel (a 7 cm streak of
16% blurs to about that over its two pixels); the Commons colour photo of the Broadway portal shows real streaks under the
cornice on the BRADBURY frieze at 0.75 to 0.8 of the stone beside them, and the curtains are set a little lighter than
that, a maintained building. The same albedo change reads much less in sun than in shade, because AgX compresses the
sunlit walls (see the framework's calibration trap): on sunlit Broadway the streaks are faint, on 3rd Street plain.
`AMOUNT` 0.85 carries the calibration; `DEFAULT_STRENGTH` stays 1.0.

Since the rework the table holds for a source that draws the geometry's measure (water 1, dirt 1), and the rest spread
round it. Measured the same way on the rework's close-up, eight sill ends of 3rd Street's south-west bays on floors 3 and
4, in shade, the runoff alone against no wear at all: before, all eight read 0.53 to 0.66 over their top 20 cm and ran
1.3 to 1.6 m; now they read 0.57 to 0.81 and run 0.3 to 1.6 m, and one sheds nothing. The typical streak is lighter than
before and a few are darker, so most spandrels read as clean as the HABS photo's, with a heavier one here and there. The
Broadway portal's moulding drew 0.77, so the frieze curtain the Commons photo measures is a value of 0.24 where it was
0.32: lighter still than the photo's streaks, a maintained building.

The capitals' drips (critique 2026-09-25) keep the capitals' own constants: a drip carrying a whole capital's water at
the geometry's measure takes the value the sheet had, 0.40, in a stream about 7 cm wide at the foot. On the review's 7 m
close-up of 3rd Street (in shade) the heaviest one, a single stream down the middle of the shaft at s 14.6 (water 1.48),
reads 0.80 of the wall without the runoff in its core, about as dark as the sheet's 0.82 there, which lay across half a
metre; on the sunlit faces the heaviest read 0.93. The rest spread down to traces of 0.96 to 0.99 and to nothing (the
table in "A capital's drips").

### The debug view

Blue: every mark's footprint at full colour from a quarter of the most a streak can hold, so the faint curtains read as
plainly as the sill ends; an octahedron at each sill's end (at its front-bottom corner), a square tube along each drip
line, bracket foot and capital foot, and a thin tube down each streak's centre line to where it stops (about one a metre
along a curtain): 684 sources, 670 marks, 1267 paths. The 14 sources that shed nothing keep their marker and draw no
streak; a bracket's or a capital's path runs down the middle of its exit, not of its foot. Since the critique of
2026-09-25 a capital that sheds shows an octahedron at each of its drips (on the foot's front edge) and a path down
each, and one that sheds nothing keeps its foot's square tube: 707 sources, 674 marks, 1271 paths, 33 of the sources
shedding nothing.

### Published for the features that follow

`ctx.field("runoff", key)` for a feature that NEEDS runoff (566 washes along these paths, 569 blooms below the sill ends
and where runoff crosses a trim's edge, 573 erodes the joints along them):

- `sources`: every source that sheds, `dict(id, kind, facade, s0, s1, z, d, amp, efold)` (a sill end has `s0 == s1`).
- `streaks`: every mark, `dict(mark, source, kind, facade, axis, side, s0, s1, z_top, z_stop, amp, efold, stop)`; `side`
  is `corner`, `centred` or `curtain`; `z_stop` is where the axis column (the median column for a curtain) stops.
- `drip_lines`: every course's run, `dict(kind, facade, s0, s1, z, d_edge, d_wall, reach, soffit)`: where the runoff
  leaves a trim's edge.
- `field`: `dict(res=0.04, z0, data, atlas, note)`, the mask's R channel max-pooled to 4 cm as a float16 array over the
  whole atlas, rows from z0 up: the deposit, 0..1, to paint from.

The kinds: `sill_end`, `bracket`, `capital`, `springing`, `crown`, `impost`, `band`, `ground_crown`, `string_course`,
`portal_moulding`.

Since the rework (2026-09-23) `sources` and `streaks` hold the sources that shed (670 of the 684; one whose water is under
`WATER_MIN` is left out), and a bracket's or a capital's `s0`, `s1` and `axis` are its exit, the part of its foot the water
leaves over, which 566 and 573 take as the stream's width at its source as they took the whole foot before. A sill end's
width at its source is still `SILL_W0 x efold / SILL_EFOLD`: its width and its e-fold go together. The keys and formats
are unchanged, and `drip_lines` is the same list. On the rework's rebuild the three features that follow took the
variation up:

- 566 (washed): 187 rinsed streams, from 194 (179 brackets and the 8 sill ends under 3rd Street's fire escapes): the dry
  brackets' streams are gone and each rinsed core narrows with its exit (its rinse covers 25,064 texels, from 32,904);
  its wash of the exposed zones is untouched (that channel is byte-identical).
- 569 (efflorescence): the wetness under the trim follows each stream, so the bloom's amount and reach vary from source to
  source: under the sills wet up to 0.57 (0.28..0.96), from 0.64 (0.37..0.83); under a bracket's foot 0.46 (0.01..0.58),
  from 0.50 (0.49..0.50); under a springing capital 0.36 (0.00..0.45), from 0.38. Its course grid is untouched.
- 573 (mortar erosion): 653 streaks walked, from 668, each as long as its own e-fold and as wide as its exit: the sill
  ends' erosion covers 19.5 m2 (from 26.8), the brackets' 11.2 (15.9), the column capitals' 15.2 (20.7), the springing
  capitals' 9.0 (13.6). 573 takes a capital's water from 564's constants rather than from `amp`, so its capitals follow
  the rework in length and width, not in strength (until 573's own rework, the same day, which reads each capital's
  drawn water off its e-fold: see its section).

Since the critique of 2026-09-25 a capital publishes one source and one streak per drip, with the same keys: the id
`<capital>:<j>` (j counts its drips from the left), `side` `centred`, `axis` the drip's middle and `s0`..`s1` its width
at the foot (`DRIP_W0 k`), `efold` its own (`0.60 k`, `0.45 k` at the springing); a capital that sheds nothing publishes
none (674 sources and streaks in all). So each follower reads a drip as the stream it is, with no change to its code:
566 takes a centred stream's width and profile as it takes a bracket's, 573 walks it as a capital's with its drawn water
(its e-fold over the kind's), and 569 lays a capital's bloom on the drip nearest the foot's middle. On the rebuild,
every change lies under the capitals (checked texel by texel), and every feature that does not follow the runoff is
byte-identical:

- 566 (washed): its rinse is unchanged, the same 159 streams (no capital's stream crosses a zone soiled enough to rinse;
  two springing drips now reach one's edge and are logged as too light), and its wash; only the mask's A, 564's deposit
  where the wash brightens a streak rather than taking it off, follows the drips (75,254 texels).
- 569 (efflorescence): the same 40 blooms, the 5 at capitals among them (column capitals `ge_capital.008` on Broadway
  and `.015` on the north face, springing capitals `ge_capital5.005`, `.031` and `.014`); their wet and their middles
  follow the drips (at `ge_capital.015` wet 0.48 from 0.42, at `ge_capital5.031` 0.18 from 0.31). Its mask changed in
  2,331 texels, all at those capitals.
- 573 (mortar erosion): 625 streaks walked, from 652. A drip's water erodes the joints only down its own narrow core: 12
  of the 30 column-capital drips erode any brick (0.43 m2, where the 21 sheets eroded 14.7) and 23 of the 37 springing
  drips (0.61 m2, from 8.5); the flat panels of eroded joints under the capitals are gone with the sheets. Its drops,
  corners, zones and splash are unchanged.

### What it changed in the framework

Backward compatible, and the probe still builds byte-identically (mask sha `37806c0b...`): `wear/nodes.py` hands every
material a fourth surface signal, **Bed** (above), and a flat packed AO no longer becomes a speckled Grain;
`wear/registry.py` lists `runoff`. The worn block keeps 2279 objects (2275 and the four markers), and the off switch and
`wear_runoff=0` still render as before the layer (`st_up` 0.0089 and 0.0071 mean levels, `st_corner` 0.0315 and 0.0318,
against a noise floor of 0.0067 and 0.0310).

### Evidence

In `tests/artifacts/screens/bradbury_wear/runoff_streaks/`: `<view>_off_on_debug.png` (runoff off | on at its default |
the debug view, 50%) for `st_corner`, `st_along`, `st_up`, `closeup_sill_pair_3rd`, `closeup_band_drip_3rd`, their
Broadway counterparts in sun and `medium_3rd`; `renders/` (the full-size stills, and the off-state checks
`st_up_wear_off.png`, `st_corner_wear_off.png`); `diff/` (off against on, x8, with the numbers as json, and the off-state
checks against the pre-wear renders).

The rework (2026-09-23), in `tests/artifacts/screens/bradbury_wear/rework/runoff/`: `<camera>_before_after.png` for the
five cameras and `closeup_` and `medium_before_after.png` (the whole layer before this pass, from
`tests/artifacts/blender/bradbury/wear_snap_rework_before/`, and after it); `closeup_` and `medium_off_on_debug.png`
(runoff off, on, and the debug view with the runoff alone); `closeup_` and `medium_runoff_alone_before_after.png` (no
wear, then the runoff alone before and after); `elevations/` (the layer's own `runoff_<face>.png`, and
`runoff_<face>_before_after_2cm.png`, each face's whole mask before and after); `crops/` (1:1: the close-up's sill ends,
runoff off and on and the runoff alone before and after, and the medium view's band with its brackets and column
capitals); `renders/` (the full-size stills, the off-state checks `<camera>_wear_off.png` among them); `diff/` (x8 heat
maps, `rework_numbers.json`, and `byte_identity.json`: every feature's cache and mask hash before and after, and the
worn files' changed meshes, only the debug markers of 564, 566, 569 and 573). The close-up is a camera at (-31.0, -26.6,
10.6) looking at (-31.0, -17.9, 10.6) with a 35 mm lens; the medium view at (-26.5, -34.0, 10.0) looking at (-26.5,
-17.9, 12.4), 35 mm.

The capitals' drips (critique 2026-09-25), in `tests/artifacts/screens/bradbury_wear/rework/runoff/critique_r2/`, every
still at 1920x1200 and 128 samples on OptiX alone (`devices=gpu`), the "before" from a copy of the layer as it stood
before the fix (kept, gitignored, as `portal_project/wear_runoff_r2_before/` with its scene
`portal_project/bradbury_scene_runoff_r2_before.blend`, which links it): `closeup_` and `medium_before_after.png` (the
whole layer before and after, and the runoff's own change x6 in each), `closeup_` and `medium_off_on_debug.png` (after:
runoff off, on, the debug view with the runoff alone), `closeup_` and `medium_debug_before_after.png`, and
`<camera>_before_after.png` for the five cameras; `wide/` (the review's four 4K elevations, before and after, runoff on
and off, 64 samples); `crops/` (every column capital of each face and the springing capitals of 3rd Street and the north
face from those elevations, x2: runoff off, on and its change, before and after; the review's own close-ups of 3rd
Street's and Broadway's columns at 1:1 and of 3rd Street's springing capitals at x2; the close-up's three shafts at 1:1,
one with nothing, one with a clear stream, one with a corner stream; `N_cap15_followers_before_after.png`, a north-face
capital whose efflorescence bloom now sits on its drip); `elevations/` (the layer's `runoff_<face>.png` and
`runoff_<face>_before_after_2cm.png`, each face's mask as the shader cuts it, before over after); `diff/`
(`capital_streaks_measured.json`, the table in "A capital's drips" for every capital; `byte_identity.json`, every
feature's cache and mask hash and the worn files compared datablock by datablock; `followers_changed.txt`, what changed
in 566, 569 and 573 and where; the off switch against the pre-wear block rendered again,
`<camera>_wear_off_vs_prewear.json`: 0.005 levels on average and 1 at most, on `st_up` and `st_corner`); `renders/` (the
stills); `audit/` (the measuring scripts and `runoff.py` as it stood before the fix). The close-up is a camera at
(-21.627, -27.579, 14.0) looking at (-21.627, -17.879, 14.0), 35 mm (3rd Street's shafts at s 10.2, 14.6 and 18.4); the
medium view at (-20.0, -36.0, 11.0) looking at (-20.0, -17.879, 13.0), 35 mm.

## Sheltered soiling under overhangs (AI 565)

`wear/features/soiling.py` (`wear_soiling`, violet in the debug view): the soft darkening a city leaves wherever the
building's own geometry keeps the rain off. Soot and dust settle on every surface of a facade; rain rinses them off the
open ones and the surfaces it cannot reach keep them (the ICOMOS-ISCS glossary's black crust "developing generally on
areas protected against direct rainfall or water runoff"; Blocken & Carmeliet 2013's "reduced rainwash"; Miller 1994's
dirt where accessibility is low). Los Angeles's smog is not coal soot, so it reads as soiling, a dulling and darkening
of each material's own colour, never as a black crust. Every value comes from a measure of how much rain the geometry
keeps off, texel by texel; nothing is placed by noise, and the mask is byte-identical from one build to the next. Since
the rework of 2026-09-23 each discrete element -- a window head, an arch, a sill, a storefront, a fire escape platform,
a portal -- takes its own seeded share of that soiling and its own reach, so no two identical heads are soiled exactly
alike, and the crown's top lip, which the run-off of the whole top washes, takes none (see "One element at a time" and
"The top's run-off" below). Since the critique of 2026-09-24 the deposit never lightens anything: a smooth finish keeps
its own gloss and bare metal is left polished (see "The look" and "Never lighter"). Since the critique of 2026-09-25
nothing the street sees only through glass is soiled: the storefronts' white transom panels, the portals' vestibules,
the parts of window and door frames that run on behind their panes (see "Behind glass").

```
blender -b -P wear_layer.py -- features=soiling                      # its mask alone (about 7 s), the rest cached
blender -b -P render_wear.py -- wear=on wear_soiling=0 view=st_up    # off; 1 is the calibrated default
blender -b -P render_wear.py -- wear=debug wear_runoff=0 view=st_up  # its marks alone, violet, with their drip edges
```

### The rain-exposure measure

**The rain** is wind-driven: seven inclinations off the vertical (`RAIN_THETA`, 10 to 70 degrees) times eleven
azimuths off each face's normal (`RAIN_PHI`, -75 to +75), every direction the same share of the rain. A wall facing
the street intercepts a direction's share times sin(theta) cos(phi), its horizontal component. A direction is kept off
a point when the ray from the point back toward the rain meets the building.

**The elevation** it is measured on is the facade as the street sees it on the mask's 5 cm texels: the depth of the
first surface a level ray meets (1.6 million rays in 3.3 s). The fire escapes are looked through (their open ironwork
shelters nothing and the wall behind them is the facade), and their six platforms are laid back in as the slabs they
are, 0.88 m deep from the wall to their front edge. Seen from the rain's side this depth map is the building's envelope:
a ray from a surface point is blocked exactly when, somewhere above it, the envelope stands further out than the ray
has got by then. One sweep down the whole atlas per direction finds that for every texel at once -- a horizon map,
the maximum of the envelope minus the ray's own advance carried row by row along a digital line whose column offsets
are global, so the line above any texel is its own and one running maximum per row serves them all -- and the 77
directions cost half a second. A grazing ray is blocked by degrees over 1 cm of depth (`SOFT`), so edges do not alias.

**Shelter** (`shelter`) is the share of the rain the building's OVERHANGS keep off the surface the street sees at
(s, z): 0 in the open, 1 right under a deep projection. A surface overhangs where it stands `OVH_MIN` 2 cm further out
than a surface below it within `OVH_LOOK` 2.5 m, before anything below stands further out than it and carries it (so
the second floor's wall does not overhang the storefronts under the ground floor's crown). Under a long projection p
deep, the rain model keeps off

| below the edge | 0.25 p | 0.5 p | p | 1.5 p | 2 p | 3 p | 4 p |
|---|---|---|---|---|---|---|---|
| shelter | 1.00 | 0.86 | 0.52 | 0.35 | 0.22 | 0.14 | 0.08 |

so the overhang's own depth sets how far down its shelter reaches, and the built model agrees: under the band's
0.245 m soffit the brick reads 1.0 right under it, 0.55 a fifth of a metre down and 0.36 at 0.3 m; the storefront
heads, 0.44 m deep, keep 0.45 of the rain off the transom 0.45 m below them; a sill's 3 to 5 cm, a few centimetres.

Only overhangs count here. A pier standing proud beside a recessed wall also keeps some slanting rain off the wall's
inside corner -- the full exposure keeps 0.44 off right beside a column standing 0.30 m proud of the field, 0.23 at
17 cm, 0.10 at a third of a metre -- and counting it put a darker band down every pier: open brick darkened by
something that is not shelter from above, the "fake ambient occlusion" the user rejected twice. The overhang shelter
there is 0.003. The corner's share is measured all the same, in the full exposure below, for the washed zones.

**Exposure** (`exposure`) is the same sweep with every surface blocking: `open`, the share of the rain that reaches the
surface past everything that stands out (overhangs, proud piers, recess sides), against an open wall facing the street;
times `catch`, the wind's catch across the face (Blocken & Carmeliet: most at the top edge and the top corners, then
down the side edges): 564's height law (0.6 at the pavement to 1 at the crown's top), raised by up to `CATCH_EDGE` 35%
in the top 3 m and within 3 m of a corner (the chamfer's 135 degree corners half of that), normalised to 1 at an open
top corner (`catch_ratio()`). `data` = `open` x `catch`. The soiling itself does not use `catch`: an open wall stays
clean wherever it is; where the rain is heavier is the washed zones' business (566), and the two agree because both
come out of the same sweep: where `shelter` is high, `open` is low.

### Undersides

A surface that faces down takes no rain at all, whatever stands above it: the soffits of the crown, its coffers and
dentils, the undersides of the band and its brackets and of the impost course, the window heads and arch soffits, the
portal's vault, the storefront heads and the fire escapes' platforms. A single atlas value at (s, z) cannot tell a
soffit from the wall below it -- every point of a soffit reads one row of the mask, the row of the projection's front
edge -- but the normal can. The shader soils a face by its own tilt as the rain model does: an open face tilted down
receives `(1 + Nz) ** 1.8` of an open wall's rain (within 0.03 of the model's sums: 0.54 at Nz -0.3, 0.31 at -0.5, 0.06
at -0.8), so its shelter is `1 - (1 + Nz) ** 1.8`, taken on faces turned more down than out (ramping in from Nz -0.30 to
-0.60, so a sill's front or a moulding's face barely tilted down is left to the mask). Since the rework the underside
term is multiplied by the share its element carries in the mask at that row (the drip edge's own row), so a head's
soffit is as heavy or as light as its head, and the crown's top lip, which faces 55 degrees down, takes none of it.

### The sources and the marks

The sources are the overhangs themselves: every **drip edge** on the elevation, an overhanging masonry texel (or a
platform) whose surface below steps back at least `EDGE_MIN` 3 cm, traced into runs of one family (8-connected) along
the edge; a run shorter than `RUN_MIN` 0.15 m (a dentil, an ornament's lobe) belongs to the overhang above it. Each run
is a line source along its lower front edge, and every sheltered texel is one mark from one run: the first drip edge
above it in its column, within that edge's reach (8 times its projection, at least 0.5 m), or, in the lateral penumbra
beside a projection's end or under a cove's own crest, the nearest labelled neighbour's. Only the texels a face's own
shading points read are painted -- those whose surface belongs to it by the bisector rule, not the next face seen
obliquely past a corner.

| family | on the model | runs | projection (median, range) | shelter reaches (median, range) |
|---|---|---|---|---|
| crown cornice | `ge_crown_*`: corbel, frieze, plinth, coffers, teeth, the three fasciae | 440 | 0.060 (0.040..0.190) | 0.10 (0.10..0.70) |
| band 4-5 | `ge_cornice45_*`, `ge_band45*`, `ge_teeth45` | 218 | 0.245 (0.040..0.245) | 0.40 (0.10..1.30) |
| band bracket | `ge_bracket45*` | 178 | 0.035 (0.035..0.057) | 0.25 (0.05..0.60) |
| impost course | `impost_course5` | 44 | 0.051 | 0.25 |
| window sill | `sill_*` | 74 | 0.033 | 0.15 |
| window head | `panel_*`, the bay insets' heads in `wall_floors_2_4` | 362 | 0.179 (0.030..0.180) | 1.35 (0.05..1.90) |
| arched window head | `top_panel_*`, `ge_archivolt*` | 81 | 0.308 | 1.93 (1.90..1.95) |
| ground floor crown | `ge_crown` | 5 | 0.056 | 0.45 (0.15..0.45) |
| string course | `ge_cornice`, `ge_bead`, `ge_teeth*` | 5 | 0.058 | 0.45 (0.45..0.50) |
| storefront head | `ge_band_strip`, `fit_*` over the storefronts | 45 | 0.390 (0.250..0.440) | 1.45 (0.45..3.40) |
| fire escape platform | `attachment_fire_escape_*`, 3 per stair | 6 | 0.960 (0.960..1.239) | 0.30 (0.30..0.55) |
| portal | the three portals' arch block, frieze and ornament | 21 | 0.037 (0.036..2.156) | 0.10 (0.05..3.50) |

1479 sources, 1479 marks, 1474 paths (the five runs of the crown's top lip, one per face, have nothing under them to
soil: see "The top's run-off"). "Reaches" is how far down the run's middle column its shelter stays above 0.10 (a
window head's reaches down its glass, which the soiling leaves alone). Build: about 6.5 s for the mask, and 18 s more
for what stands behind glass (see "Behind glass").

### One element at a time (rework 2026-09-23)

The user's review of the finished layer (2026-09-23) rejected marks that repeat identically from one instance to the
next ("the pigeon marker looks like a pattern, it was placed at the same position in all windows"; "check the other
features for pattern like results"). The shelter is the geometry's, and every window head, arch, sill, storefront,
fire escape platform and portal on this building is the same shape, so the measure alone soils each one exactly alike.
At the facade scale that reads as consistent shading rather than a stamp (the soiling follows the shade the geometry
already casts, and the 1960 HABS photos show the heads and arches evenly dark), but side by side at 1:1 every head
soffit and every arch intrados was the same tone to the pixel. What differs between them on a real front is what the
model does not carry -- a sound or a failed drip, a lintel reset, a window washed down with its frame, a tenant who
keeps the shop front clean -- so each of those **elements** now takes its own share of the soiling and its own
**stretch** of the reach (`VARY`), each the mean of two seeded uniforms between bounds, so the middle is likelier than
the ends:

| family | elements | share: bounds; drawn (median, range) | stretch: bounds; drawn (range) |
|---|---|---|---|
| window head (each opening, and each bay inset's head) | 362 | 0.70..1.15; 0.93 (0.71..1.13), 73 above 1 | 0.80..1.25; 0.84..1.22 |
| arched window head | 81 | 0.70..1.15; 0.92 (0.73..1.07), 19 above 1 | 0.80..1.25; 0.86..1.25 |
| window sill | 74 | 0.70..1.15; 0.94 (0.75..1.14) | 0.80..1.25; 0.84..1.22 |
| storefront head (a shop's tenant cleans its front, or not) | 45 | 0.55..1.15; 0.87 (0.61..1.10) | 0.80..1.25; 0.84..1.18 |
| fire escape platform | 6 | 0.70..1.15; 0.90 (0.89..0.98) | 0.80..1.25; 1.00..1.15 |
| portal (its drip edges together; times `PORTAL_KEEP` 0.70) | 3 | 0.62, 0.68, 0.75 | 0.92..1.08 |

The seed is the element's own place -- `sha256` of its family, face, span and height, or for a portal its instance
(`PORTAL_A`, `_C`, `_E`) -- so every rebuild draws the same values and a change elsewhere on the model reshuffles
nothing. The portals are the building's doors, washed down with the entrance; `PORTAL_KEEP` is that, and it is what
takes the vault from 0.55 of its clean luminance to 0.70 (see Calibration). The continuous courses -- the crown, the
band with the brackets under it, the impost, the string course, the ground floor's crown -- keep the whole measure:
each runs the length of its face as one element, and a bracket's underside is the band's own soiling (drawn bracket by
bracket it would read as a checker along the band).

A share and a stretch are **smooth fields, not labels** (`blend_elements`): at each texel, the elements' values weighted
by the shelter each would give there alone (`shelter_law`, the rain model's own fall-off under a long projection, down
the element's span and over its own lateral penumbra). The first cut painted each mark's texels with its own drip
edge's values, and under a fire escape platform, whose shelter lies over the window heads, inset heads and sills below
it, the marks' frontiers (the first edge above each texel, grown sideways into the penumbra) turned into angular steps
in the middle of one continuous shelter (`rework/soiling/audit/elevcmp_S_fire.png` is that first cut,
`rework/soiling/elevations/walls_S_fire_escape_before_after.png` the field as built). Weighted by shelter, the platform
leads where it shelters most and a value changes only where the shelter does. The one place an element's own value is
set outright is its drip edge's own row: a soffit reads that row and the one below it, so the edge row carries its
element's share and the soffit takes it -- unless the wall there is soiled by an overhang above it, whose share that
wall keeps. The stretch is `R ** (1 / stretch)`, which moves a gradient's foot up or down the wall as a longer or
shorter projection would, taken in from `SHOWN` to twice that so a mark's own margin still fades to nothing.

### The top's run-off (rework 2026-09-23)

The crown's top sheds its rain over its front arris, and its top 9 cm lean outward (`ge_crown_c3`: a face from d +0.40
at z 20.645 to +0.52 at the top, 20.732, facing 55 degrees down). By the rain alone that lip reads fully sheltered --
it faces down, and its upper part overhangs its lower -- so it was soiled by both terms (the mask read 0.68 there, the
underside term 0.95) and drew a dark line along the building's skyline: the lip rendered at 0.64 of its clean
luminance. But it carries the run-off of the whole top: with no drip at the arris, the water that goes over it runs
back along the lip's underside, which slopes down toward the wall, and down the fascia under it to the next arris, and
drips from that; and it is the building's most rain-beaten line (the catch above). The 1960 HABS crown
(`loc_habs_ca0212_001`) reads light along its top edge and dark only under the corona. So `top_runoff` follows that
film down every column of every face from the column's highest surface: on down a face while it steps less than
`TOP_TOL` 5 mm from one row to the next, back along an underside leaning out (Nz between -0.94 and -0.20, at most
`LIP_STEP` 0.15 m per row), and sideways along a wetted face for up to `TOP_SPREAD` 8 texels (under the return of a
corner pavilion's crown, where a column's own top is something else), until the surface steps back further (an arris
the water drips from) or out. On the crown it wets the lip and the fascia under it, 18,090 texels (45.2 m2, 0.25 m all
round the building), and stops at the fascia's bottom arris: the soffit under that arris, the next fasciae, the coffers,
the dentils and the frieze stay as they were. The lower cornices (the band's top, the ground floor's crown, the string
course) have a vertical fascia at the top whose 1.6 to 2 cm undercut drips before their bed mouldings, which stay
sheltered; the film is followed from the building's own top only.

### The mask

`masks/soiling.png` is 5 cm (3848 x 424, 26 MB of VRAM as float RGBA), four 16-bit channels (two before the rework):
R the shelter of the surface the street sees there as its element's soiling counts it (stretched by the element's
reach, and 0 where the top's run-off runs); G and B that element's share, G above 1 as (share - 1) / `UP_SPAN` 0.5 and
B below 1 as 1 - share, so a texel outside every mark (both 0) keeps the whole measure and one where the top's run-off
runs (B = 1) takes none; A that surface's depth (d from -3.0 to +1.5 over 0..1). The depth lets the shader tell
the recorded surface from something standing well in front of it: a point more than 0.10 to 0.25 m in front of the
recorded depth is not that surface (the fire escapes' bars, which were looked through, and the lowest centimetres of a
deep projection's front edge, which would otherwise take the wall's shelter from the texel below). Each mark carries a
two-texel margin so the depth is whole wherever the lookup filters. Tops take none of the mask (a ledge takes the rain
on its face whatever shelters the wall behind it).

### The look

Where the soiling lies, the colour goes toward DIRT -- the material's own colour 45% greyed toward a warm grey-brown
(its own luminance times (1.00, 0.95, 0.88): smog and dust, not soot), kept at 45% of its brightness -- by
`AMOUNT` 0.62 x the soiling x the strength, and on brick, terracotta and stone (`MATTE_ON`, the porous fabric the
deposit lodges in) the roughness goes to at least 0.80: darker, duller and matte, the material's own pattern still
under it and its normal map untouched. A smooth finish -- paint, metal, the varnished oak, the glaze -- keeps its own
gloss and only darkens (see "Never lighter" below). The soiling is the shelter through a smoothstep from
0.03 to 0.55 (an open wall stays clean), or the underside term, whichever is more, times the element's share read from
G and B (1 + 0.5 G - B: the underside term takes it too, which is how a soffit comes to differ from its neighbour's,
and the top's run-off takes the lip's to nothing). The mortar joints hold 35% more of it
than a brick's face (the layer's Joint, from the brick set's own height map), so the deposit keeps the brick's pattern
rather than lying over it like a shadow; the stone's cloudy Grain is not used (see runoff). Each class takes its
share: brick, terracotta and stone in full; painted metal (the storefront frames and fascia, the fire escapes, the
portal's iron door pulls) and paint (the window frames, the storefronts' white transom panels) 0.6; the portal's glazed
brick 0.4 and its oak 0.35, which hold less and are wiped by hand (the portal as a whole also takes `PORTAL_KEEP`);
bare metal none: a metal whose own metallic is 0.90 or more (`BARE`, fading in from 0.75) -- the portal's brass
kickplates and bronze lamps (1.0), the doors' bronze hardware (0.92) -- is polished by hand, as the user's photo of the
Broadway entrance shows its kickplates, while the game's painted iron and steel read 0.6 to 0.7 and keep their share;
glass none (AI 571 is the glass's), and nothing the street sees only through glass either, behind its pane (see
"Behind glass").

### Never lighter (critique 2026-09-24)

The fresh-eyes critique of the rework found the soiling making the Broadway portal's sunlit brass kickplates LIGHTER:
1.44 of their clean luminance in the close-up from the pavement (1.71 at the brightest), a flat pale gold panel where
the user's photo shows polished brass, and the floor tiles that mirror them 1.28, while the same portal's shaded
kickplates darkened to 0.82. The cause was the matte: every class went to a roughness of at least `MATTE` 0.80, and on
a smooth finish that spreads the finish's own gloss. A polished metal's whole look is its reflection, so roughened in
the low sun its lobe took in the sun itself. Checked over the whole building, the same happened, more faintly, to the
portal's varnished oak in sun (1.03 to 1.04) and to the storefronts' black metal fascias and frames in sun (up to 1.38
seen along Broadway from the crossing, 1.07 square on, 1.10 on the north face). No deposit here should do that: it
is a dark smog film, and the layer cannot dim a gloss (the specular level is routed on glass alone), only spread it. So
the matte is now the porous fabric's alone (`MATTE_ON`), where the deposit lodges in the pores and dulls the sheen --
seen along a sunlit facade it makes the sheltered bands darker, not lighter -- and every smooth finish keeps its gloss
while its colour (for a metal, the colour of its reflection) darkens as before; and bare metal takes none at all
(`BARE`, above).

The check is `wear_compare.py lighter` (see the framework's commands): a still with the soiling off against the same
still with it on, 8 px blocks of linear luminance, and any block lighter by more than 2% and by more than 0.003 fails;
`--again` (the on still rendered twice) leaves out the blocks the renderer itself does not repeat. On the full-size
stills, every other feature on (`rework/soiling/critique_r1/lighter/`), blocks lighter with the soiling on:

| still | before the fix | after |
|---|---|---|
| the Broadway portal from the pavement, 4.8 m (21.794, 0.880, 1.801) to (16.994, 0.880, 2.200) at 35 mm, in sun | 1558 | 0 (1 block not repeatable, left out) |
| the Broadway storefronts from the pavement, 10 m | 190 | 0 |
| Broadway's elevation at 4K, 36 m | 383 | 0 |
| the north face's elevation at 4K, 54 m, in sun | 162 | 0 |
| the north door and its bronze hardware, 5 m, in sun | 0 | 0 |
| `hero_3q`, `st_corner`, `st_along`, `st_up`, `st_portal` | 12, 58, 302, 0, 207 | 0, 0, 0, 0, 0 |

and in the portal close-up, the soiling's on / off:

| where | light | before the fix | after |
|---|---|---|---|
| the brass kickplates; the other door pair's | sun; shade | 1.44; 0.82 | 1.00; 1.00 |
| the floor tiles mirroring the sunlit kickplates | sun | 1.28 | 1.00 |
| the doors' oak panels; the rail over them | sun | 1.03; 1.04 | 0.94; 0.94 |
| the other pair's oak panels | shade | 0.92 | 0.96 |
| the recess's glazed brick side, seen edge-on | sun | 0.96 | 0.96 |
| the vault at its crown; open pier stone | shade; sun | 0.75; 1.00 | 0.75; 1.00 |

On the 4K elevation the portal's foot (the 6,294 pixels that read lighter) went from 1.34 to 1.00. The masonry's
numbers above and in the calibration are unchanged: on brick, terracotta and stone the shader computes exactly what
it did. One caution for the check: at half size and 32 spp it flagged three blocks along the sunlit return of the
Broadway pilaster, a sub-pixel edge seen almost edge-on. A variant with no roughness change at all flags the same
blocks, and rendered with 1024 fixed samples and no denoiser the edge's pixels move both ways (8 lighter and 18
darker by more than 0.01, no block over the margins): the renderer's edge noise, since the Principled BSDF picks its
lobes by their albedo and a darker colour draws different paths, which `--again` cannot see because a still repeats
exactly. Judge the check at full size.

### Behind glass (critique 2026-09-25)

The second fresh-eyes critique found the soiling on surfaces behind glass. The storefronts' white transom panels
(`Storefront_White_Paper`, class paint) stand 2.2 cm behind their transom glass: the glass from d -0.182 to -0.188 and
the panel's face at -0.21 (-0.382, -0.388 and -0.41 on the deeper storefronts). The mask records the first surface a
level ray meets, which is the glass, with the storefront head's shelter; the depth gate only rejects a point standing
in front of the recorded surface; so every panel took the head's shelter gradient at paint's share of 0.6, heaviest
at its top: 0.79 of its clean luminance at the top and 0.88 at the foot on 3rd Street, 0.77 to 0.85 across the west
face, where they were the most darkened surfaces on the face -- an even grey veil over every transom, and heaviest at
the top, against glass grime's own film (AI 571), which gathers toward the bottom rail. Neither street dust nor the
rain the shelter measure models reaches them. A probe of what the review poses see through glass found the same
behind the portals' doors (the vestibule's oak ceiling, beams and medallion, which the underside term mixed 0.10 to
0.24 of the way to the deposit) and on the parts of window and door frames and heads that run on behind their panes (a
display window's frame runs from 3 cm in front of its glass to 9 cm behind it, and its inner faces took the head's
shelter all through; a window head's brick reveal behind its pane, up to 0.5 of the way).

The mask cannot tell a panel from the pane in front of it: they share their texels, and its four channels are all in
use. So what the street sees only through glass is found on the model at build time (`indoors`) and carried by the
faces themselves:

1. **What each pane shows** (`pane_views`): from points `PANE_STEP` 0.30 m apart on each pane's street face, rays into
   the building over the fan a viewer in the street looks along (`PANE_EL` -30 to 60 degrees, `PANE_AZ` -60 to 60 off
   the face's inward normal), past the pane's own two faces to the first surface behind it; a second pane ends the
   ray, since what lies beyond it is not this pane's to show. 2.0 million rays, 3.5 s.
2. **Looked at from the street** (`_sight`): each face so seen, from its centre, from near each of its corners
   (`CORNER` 0.95) and from the first point a pane showed of each of its triangles (`PANE_HITS`: the vestibule's
   ceiling is seen between its beams, where neither its centre nor its corners are), along sight lines to 80
   viewpoints in front of its face (`VIEW_D` 0.6, 2, 8 and 25 m out; `VIEW_Z` 0.4, 1.6, 8 and 16 m up; `VIEW_S` 0, 4
   and 15 m along either way). A clear line counts only when most of 4 lines `SLIT` 2 cm beside it are clear too: the
   model leaves gaps of a few millimetres to over a centimetre between a pane and its door or frame (the Broadway
   portal's medallion is visible from the pavement through the slit beside a door's glass), which nobody sees the
   street through. A line that passes nothing but glass names the pane it is seen through: the plane of the first face
   of glass it meets that turns to the street (`BROAD`; not a pane's 6 mm edge).
3. **Judged in facets**, the faces of one plane that share a corner (a quad is two triangles, and one side of a bar
   must not come out half one way and half the other). A facet is indoors behind its pane when a point of it is seen
   through glass, the panes its points are seen through are one plane (within `PLANE_COS`, `PLANE_TOL`), and its points
   behind that plane are seen from the street through glass or not at all -- all but the odd one (`VETO_SHARE` a
   quarter: the chamfer's transom panel shows one corner past its frame, where the frame leaves the pier's slanted side
   open, while a recessed entrance behind a pane's plane would show most of its points). Points in FRONT of the plane
   may be seen: they are the part of the face the soiling keeps. A mesh with a facet indoors has every facet that
   reaches behind that pane looked at, in every object that draws it (the export shares one display window's frame
   between 15 windows), up to `TEST_ALL` 400 faces; and a mesh lying wholly behind the one pane its facets are seen
   through, none of them seen from the street without glass, is indoors whole, its hidden faces too.

Each face indoors carries its pane in its object's own space (`apply()` and `apply_portal()`): the normal toward the
street in the face attribute `wear_soiling_pane`, the offset in `wear_soiling`, which the shader reads as Attr. In the
object's own space one mesh serves every window it frames and all three portals, so the attributes are written in place
-- no mesh is copied and every object stays an instance of its mesh. The shader takes the soiling off a point standing
behind its face's pane, in the object's own space (Texture Coordinate: Object), from 1 mm behind the plane to all of it
at 3 mm (`PANE_GAP`; the panels stand 22 mm behind the back of their glass), and so cuts a frame's inner face where the
glass meets it: its outer 3 cm keep their soiling. Everywhere else the factor is exactly 1.

As built, 5,708 faces of 286 meshes (47 of them whole), on 370 objects of the block and 24 of the portal, in 18 s; 2
faces seen through two panes that are not one plane are left as they are:

| where | objects | faces | what |
|---|---|---|---|
| storefront transom panels | 36 | 432 | every panel whole, the chamfer's included |
| the top floor's arched windows | 162 | 2,106 | each frame's faces that run on behind its glass (25 of 108) and one face of each transom bar, cut at the glass |
| the export's other window and door frames | 153 | 1,100 | the display windows', the sashes', the mullions' and three doors' frames: the faces behind their glass (2 to 16 each), cut at the glass |
| brick window heads (`panel_*`) | 15 | 70 | a head's soffit and reveals where they run on behind the pane, cut at the glass |
| a fascia, two transom bars, a face of the piers | 4 | 5 | faces tucked behind the transom glass |
| the portal's vestibule (in all three portals) | 17 | 2,742 | medallion, lamp, arch, beams, cornice, ceiling, floors, jambs whole; its side walls and bases where they reach behind the door's plane |
| the portal's doors, their frame, post and post panel | 7 | 15 | the faces behind the door glass |

Checked from a much denser street: an audit (`rework/soiling/critique_r2/`, see Evidence) looked at 41,978 points
behind their panes on 11,984 faces (each portal counted three times) from 210 viewpoints (0.6 to 25 m out, 0.4 to 18 m
up, up to 20 m along) and the 17 cameras and review poses: the only points seen without glass are within 11 cm of the
chamfer transom panel's left end. No mesh was copied (the 394 objects keep the meshes the block gives them; the export's
shared window frames take the attributes once, 16 meshes), and with the soiling off the stills repeat the critique's to
one 8-bit level: the attributes change nothing but this feature's look. The one face of the piers (`fit_piers`, hidden
behind a transom) is on the object edge wear (AI 570) renders a chipped copy of while it is on: the copy, made before
this feature's apply, does not carry it, which changes nothing that can be seen.

Measured, full size, the soiling on against off (`wear_soiling=0`, every other feature on), at the panels' top band (z
4.30 to 4.40) and foot band (3.62 to 3.72), 0.10 m in from each side; and all on against wear off:

| still | panels | soiling on / off, top; foot: before, after | all on / wear off, top: before, after |
|---|---|---|---|
| 3rd Street from the pavement, 10 m, shade | 3 | 0.79..0.82; 0.90..0.93 -> 0.98..0.99; 1.00 | 0.64..0.71 -> 0.78..0.88 |
| Broadway from the pavement, 10 m, sun | 2 | 0.80..0.83; 0.98 -> 0.97; 1.00 | 0.77 -> 0.90..0.94 |
| the north face from the pavement, 10 m, sun | 3 | 0.83..0.89; 0.98 -> 0.97..0.99; 1.00 | 0.78..0.85 -> 0.91..0.95 |
| the west face at 4K, 38 m | 7 | 0.69..0.78; 0.86..0.94 -> 0.99; 1.00 | 0.62..0.74 -> 0.89..0.96 |
| 3rd Street at 4K, 52 m | 10 | 0.75..0.83; 0.87..0.93 -> 0.99..1.01; 1.00..1.01 | 0.57..0.72 -> 0.75..0.90 |

What is left at a panel's top is light, not deposit: the soiled head and frame bar just above it return less of the sky
onto it (the shader's factor is 0 on the panel, and its foot reads 1.00). All on against wear off the panels now read
as glass grime alone makes them: 0.90 to 0.98 on the west face (0.945 at the median, as the critique expected) and
0.75 to 0.91 on 3rd Street (0.83), whose sheltered transom glass glass grime keeps dustier; an even film, no longer
heaviest at the top.

What is not covered: a face the pane rays never meet keeps its soiling (they sample each pane every 0.30 m over 20
directions, and a mesh with a face indoors has all its faces looked at, so only a whole object hidden from them all
could slip through); a face seen from the building's hollow inside, back toward its own facade, lies in front of the
pane it is seen through and keeps its soiling (the backs of the storefronts' fascias, seen through a portal's doors past
its vestibule: black in every still); the 2 faces seen through two panes that are not one plane keep theirs; an object
whose modifiers change its faces would be skipped (none on this block); and the elevation images (`elevations=1`) still
draw the mask at the glass's texels, since the mask is as it was. A probe of the 17 poses (`diff/behind_glass_probe.json`,
the shader emulated on a 320 by 200 grid of camera rays through glass) counts the pixels seen through glass that the
soiling darkens by more than 0.02: see Evidence.

### Calibration

Measured in rendered pixels on the full-size evidence stills at the scene's defaults: the linear luminance of a box
with the soiling on, against the same box with `wear_soiling=0` (runoff on in both), `diff/calibration.json`:

| where | light | on / off |
|---|---|---|
| under the crown: the frieze of flower tiles, its top 5 cm under the plinth | sun | 0.83 |
| the same frieze at its foot, 0.5 m down | sun | 0.97 |
| the brick just under the corbel | the crown's shade | 0.84 |
| the brick 0.5 m under the crown; open brick between the arches | sun | 0.99; 0.99 |
| a fascia soffit of the crown | shade | 0.80 |
| the top floor's arch soffit; the portal's vault at its crown, near its springing | sun, shade | 0.60; 0.55, 0.58 |
| a coffer between the crown's dentils | deep shade | 0.47 |
| the band strip just under the string course; 0.2 m and 0.5 m lower | sun | 0.89; 0.97, 1.00 |
| a white transom panel under a storefront head: its top; its middle (behind glass: none since 2026-09-25, "Behind glass") | shade; sun | 0.71; 0.93 |
| the portal recess's oak ceiling | deep shade | 0.84 |
| open pier stone between two joints; open brick on the third floor | sun | 1.00; 1.00 |

The references: the Commons colour photos of the Broadway portal show the zone under each cornice, the coffers and
the arch's vault plainly darker than the open stone, and runoff (AI 564) measured the streaks on the BRADBURY frieze at
0.75 to 0.8 of the stone beside them; the sheltered walls here are set a little lighter than that, 0.83 to 0.89, a
maintained building. The deep cavities go further, 0.47 to 0.60, because there the change compounds: a coffer is lit
by light off its own soiled walls. The 1960 HABS corner (`loc_habs_ca0212_001`) has the crown's frieze at 0.26 of the
open brick, mostly the cornice's own shadow on a sunlit facade plus 1960's soot; in the crown close-up, in sun, the
frieze's top goes from 0.79 of the open brick to 0.66 with the soiling on, the same direction and well short of it. As
the framework found, AgX compresses the sunlit walls, so the same deposit reads more in the shade. `AMOUNT` 0.62 and
`DIRT_DARK` 0.45 carry the calibration; `DEFAULT_STRENGTH` stays 1.0.

**After the rework (2026-09-23)**, measured the same way at 128 spp on the same crown close-up camera (26, -2, 2) to
(17, -2, 19.2) at 70 mm, on `st_portal`, and square under the Broadway portal (19.6, 1.4, 1.1) to (16.6, 1.4, 3.9) at
20 mm, every other feature on; "before" is the frozen state before this pass against the same `wear_soiling=0` still
(`rework/soiling/diff/rework_numbers.json`):

| where | light | before | after |
|---|---|---|---|
| the crown's top lip | facing down | 0.64 | 1.00 |
| the fascia under it | sun | 0.91 | 1.00 |
| the soffit under that fascia, below the drip | shade | 0.50 | 0.58 |
| four neighbouring top floor arch soffits | sun | 0.55, 0.54, 0.53, 0.57 | 0.58, 0.54, 0.60, 0.57 |
| three neighbouring fourth floor head soffits | shade | 0.54, 0.54, 0.55 | 0.57, 0.59, 0.56 |
| the portal's intrados at the crown; near the springing; the architrave soffit over it | sun; shade; shade | 0.55; 0.92; 0.78 | 0.70; 0.95; 0.87 |
| a white transom panel's top (one storefront; none since 2026-09-25, "Behind glass") | shade | 0.71 | 0.71 |
| the frieze's top; a fascia soffit; a coffer; the band strip under the string course | | 0.83; 0.84; 0.48; 0.89 | unchanged |

The spread between neighbouring arches and heads before the rework was the light alone (each arch's position against
the sun); after it, each carries its own share on top. The deep cavities were flagged as possibly strong for a
maintained building: the one at street level, the portal's vault, is where the rework acts (the entrance is washed
down), and the vault now keeps the warm orange-brown the Commons photographs show instead of greying. The coffers
between the crown's dentils stay at 0.48: they are lit only by light off their own soiled walls, so the same deposit
compounds there, their absolute change is small (linear luminance 0.043 to 0.021, deep shade either way), and the
1960 photograph has that whole dentil band dark. The arch soffits, spread from 0.54 to 0.60, are a little lighter on
average than before (0.57 against 0.55), as the shares' median of 0.92 has them.

### The debug view

Violet: every soiled surface at full colour where its soiling is full, the sheltered walls fading with their shelter,
every underside, an element's own share fading it further (a lighter head is a paler violet); a square tube along each
drip edge and a thin tube down each run's middle to where the shelter its element's soiling counts falls below 0.10,
so a deep projection's path is visibly longer than a thin one's and a stretched element's longer than its neighbour's.
The crown's top lip shows no violet and its five drip edges no path, nor do the bare metals (the portal's brass
kickplates and bronze lamps, the doors' bronze hardware) since the critique of 2026-09-24, nor anything behind glass
since the critique of 2026-09-25 (though the debug view's glass, opaque, hides most of it). `wear=debug wear_runoff=0`
shows the soiling alone; with runoff on, its blue lies over the violet where both are.

### Published for the features that follow

`ctx.field("soiling", key)` for a feature that NEEDS soiling (566 washes where the rain reaches, 572 wants shelter for
its perches, 573 erodes the joints where the rain beats). The fields are float16 arrays over the whole atlas at 5 cm,
(424, 3848), rows from `z0` up, columns as every 5 cm mask (the atlas's own layout, `atlas`); `soiling.sample(field, f,
s, z, key="data")` reads one bilinearly at face f's (s, z), numpy arrays welcome, so a feature at another resolution
samples it at its own texel centres (`ctx.grid`). Values past a face's corner bisector are the next face seen
obliquely: sample a face at its own points.

- `shelter`: `dict(res, z0, atlas, data, note)`, the overhang shelter above (0..1).
- `exposure`: `dict(res, z0, atlas, data, open, catch, note)`: `data` the wind-driven rain the surface receives (0..1,
  1 at an open top corner), `open` its geometric share (all blocking), `catch` the wind's share across the face.
- `front`: `dict(res, z0, atlas, depth, cls, note)`, the elevation the measure was taken on: the depth of the first
  surface (nan where nothing, the fire escapes looked through) and its material class (-1 where nothing).
- `overhangs`: every source, `dict(id, kind, facade, s0, s1, z, d_edge, d_below, projection, object, element, share,
  stretch, reach, soiled_reach, texels)`: the drip edge's span, height and front, the surface below it, how far it
  stands out over that, its element (None for the continuous courses) with the share and stretch drawn for it, and its
  reach, the geometry's and as its element's soiling counts it.

All of these stay the geometry's measure of the rain; the elements' shares and the top's run-off are this feature's own
look and live only in its mask, so the features that NEED this one (566, 569, 571, 572, 573) rebuilt byte-identically
after the rework.
- `rain`: `dict(theta, phi, weights, ovh_min, ovh_look, platforms, note)`: the rain model and the fire escape platforms
  laid into the envelope.

How the others should read them, so the cleanest and the most soiled places agree: 566 washes by `exposure["data"]`
(or by `open` and `catch` apart: `open` is what makes a pier's front cleaner than the recessed wall beside it, `catch`
the top edge and corners), and keeps off wherever `shelter` is above about 0.05, which is where this feature starts; 573
erodes by `exposure["data"]` with runoff's paths and 567's splash zone, never where `shelter` is above about 0.2; 572
reads how sheltered a perch is from above as the `shelter` of the surface just above the ledge's back edge (and, to
count an inside corner or a pier's return beside it too, `1 - open` there), or finds what hangs over it in `overhangs`.

### What it changed in the framework

Nothing but `wear/registry.py`, which lists `soiling`. It builds first (ORDER 200, NEEDS nothing) and its shader stands
first in the chain, so runoff's streaks lie over the soiled colour. The probe and runoff masks build byte-identically
(`37806c0b...` and `4fa13d0c...`, as before), and the worn block keeps 2281 objects (2275 and six markers). The rework
changed nothing outside `soiling.py`: rebuilt whole, every other feature's mask and cache came out byte-identical to the
state before it, the worn block and the worn portal differ only in the soiling's own debug paths, and the worn block
keeps its 2697 objects (2275, 22 markers and the 400 of the geometry features). The critique's fix (2026-09-24) is the
shader alone, plus a check in `wear_compare.py` (`lighter`): rebuilt whole, every mask and cache is byte-identical to
the state before it, and so are the manifest's features, materials and objects; against a control build with the old
shader the worn block (2697 objects, 83 materials) and the worn portal (460 objects, 21 materials) are identical object
by object and material by material; of the node library's 13 groups only `WEAR_F_soiling` differs. No feature reads
the soiling's look at build time, so every other feature rebuilt byte-identically; in the render the only one laid over
a finish whose soiling changed is rust on the fire escapes' painted iron (its roughness under the platforms is now the
paint's own), and 3rd Street's first stair renders within 7 levels of before (mean 0.04, no pixel past 8).
The second critique's fix (2026-09-25) changes nothing in the framework either: the feature gained an `apply()` and an
`apply_portal()`, which write its two face attributes (the framework's `Attr` input carries the pane's offset, and the
shader reads `wear_soiling_pane` with an Attribute node of its own), and the build keeps what they write in its stash;
the mask and the published fields are as they were. Rebuilt whole, every mask and every other feature's cache is
byte-identical to the state before it; of the worn block's 2697 objects only the 370 indoors differ, in their mesh data
alone (the attributes; no mesh copied), of the worn portal's 460 only the 24 indoors, and of the node library's 13
groups only `WEAR_F_soiling`. The features that NEED soiling (566, 569, 571, 572, 573) read only the published fields,
and rebuilt byte-identically.

### Evidence

In `tests/artifacts/screens/bradbury_wear/sheltered_soiling/`: `<view>_off_on_debug.png` (soiling off | on at its
default | the debug view with the soiling alone, 50%) for `hero_3q`, `st_up`, `st_portal`, `crown_closeup` (under the
crown), `portal_inside` (the vault and the recess), `medium_broadway` and `fire_escape_3rd` (the platforms' shelter on
3rd Street, in shade); `renders/` (the full-size stills, and `<camera>_wear_off.png` for all five cameras); `diff/` (off
against on, x8, with the numbers as json; the off-state checks; `calibration.json`); `references/` (the reference crops
compared). Off against on, mean 8-bit levels over the frame and the share of pixels moved more than 8: `hero_3q` 1.17,
7.3%; `st_up` 2.36, 14.3%; `st_portal` 3.03, 15.0%; `crown_closeup` 6.15, 36.5%; `portal_inside` 3.53, 20.6%;
`medium_broadway` 3.04, 17.5%; `fire_escape_3rd` 0.71, 6.0%.

The off switch still renders as before the layer: the worn scene with `wear=off` against the pre-wear renders
(`series/final/before/`), mean levels and share of pixels off by more than 2, `hero_3q` 0.0134, 0.004%; `st_corner`
0.0282, 0.047%; `st_along` 0.0078, 0.009%; `st_up` 0.0101, 0.010%; `st_portal` 0.0141, 0.020% (the noise floor is
0.0067 to 0.0310). With `wear_soiling=0` the canonical scene is AI 564's: `st_up` against 564's own still, 0.0091,
0.010%.

The rework's evidence (2026-09-23) is in `tests/artifacts/screens/bradbury_wear/rework/soiling/`: `<view>_before_after.png`
(the state before this pass | after | the change, blue darker and orange lighter, full at 25%) for the five cameras,
`closeup` (the crown and the top floor arcade from the pavement, the pose above), `medium` (the upper Broadway front) and
`vault` (the Broadway portal from under it); `closeup_off_on_debug.png` and `medium_off_on_debug.png`; `crop_*_1to1.png`
(the crown's top edge; the arches and heads; the heads from `st_up`; the storefronts from `st_along`); `elevations/`
(each face's walls, the smoothstep of the mask times the share, before and after, and the fire escape zone the first
cut split into steps); `renders/` (the full-size stills, `<camera>_wear_off.png` included); `diff/` (the change maps,
x8 differences and `rework_numbers.json`); `audit/` (the audit's own renders). Before against after over the whole
frame, mean 8-bit levels and the share of pixels moved more than 8: `hero_3q` 0.13, 0.46%; `st_corner` 0.13, 0.46%;
`st_along` 0.20, 0.74%; `st_up` 0.22, 0.78%; `st_portal` 0.31, 1.17%; the close-up 0.52, 2.28%; the vault 0.95, 8.6%.
The worn scene switched off against the pre-wear renders: `hero_3q` 0.0166, 0.007%; `st_corner` 0.0319, 0.058%;
`st_along` 0.0066, 0.004%; `st_up` 0.0061, 0.001%; `st_portal` 0.0161, 0.025%, the noise floor.

The critique fix's evidence (2026-09-24) is in `rework/soiling/critique_r1/`: `E_portal_off_before_after.png` (the
Broadway portal from the pavement: soiling off | on before the fix | on after it), `E_portal_doors_change.png` (the
doors' foot at 1:1 with both change maps), `E_portal_change_before_after.png`, `E_portal_reference_kickplates.png` (the
user's photo of the entrance's kickplates beside the render), `E_storefronts_fascia.png` and `st_along_storefronts.png`
(the sunlit fascias); `lighter/` (the check's heat maps, orange where the soiling lightens, before and after, and
`lighter.json`); `diff/` (before against after for the five cameras and the extra stills, change x8, and the off-state
json); `renders/` (the full-size stills; the soiling-off stills serve before and after alike, since at strength 0 the
shader hands its input on exactly). Before against after, mean 8-bit levels and the share of pixels moved more than
8: `hero_3q` 0.03, 0.006%; `st_corner` 0.04, 0.017%; `st_along` 0.07, 0.054%; `st_up` 0.03, 0.002%; `st_portal`
0.11, 0.070%; the portal close-up 0.76, 2.1%. The worn scene switched off against the pre-wear renders: `hero_3q`
0.0165, 0.007%; `st_corner` 0.0319, 0.058%; `st_along` 0.0066, 0.003%; `st_up` 0.0060, 0.001%; `st_portal` 0.0161,
0.025%, the noise floor.

The second critique fix's evidence (2026-09-25) is in `rework/soiling/critique_r2/` (OptiX alone, `devices=gpu`, at the
scene's defaults; "before" is the critique's own stills in `rework/critique_round2/`, rendered the same way from the
state before the fix): `crops/W_wide_transoms_1to1.png` and `crops/S_wide_transoms_1to1.png` (the west face and 3rd
Street at 4K, 1:1 over their transoms: wear off | soiling off | all on before the fix | after it | after against before
x6 | after against wear off x6), `S_storefronts_before_after.png`, `E_storefronts_before_after.png` and
`N_piers_before_after.png` (the critique's storefront poses: soiling off | before | after | after against before | the
soiling's own change after), `<camera>_before_after.png` for the five cameras, `closeup_E_storefront_off_on.png` (a
Broadway storefront from the pavement, 5 m: off | on | the change | the debug view) and `medium_W_portal_off_on.png`
(the west portal and its storefronts, 14 m); `renders/` (the full-size stills, soiling off and wear off beside each;
`prewear_now/`, the frozen pre-wear scene rendered again the same day); `diff/` (the transoms measured, as json; before
against after for the five cameras, x8; the off-state json; `behind_glass_probe.json`); `lighter/` (the never-lighter
check on the 10 new stills: no block lighter in any); `audit/` (the dense audit's result and the scripts that measured
all this). Before against after, mean 8-bit levels and the share of pixels moved more than 2: `st_corner` 0.084, 1.05%;
`st_portal` 0.39, 5.17%; `st_along` 0.21, 3.47%; `st_up` 0.008, 0.002%; `hero_3q` 0.083, 0.96%; every moved pixel
lighter, 88 to 91% of them on the transom panels' faces as projected and the rest on the same panels' ends past their
frames. The probe of the 17 poses counts the pixels seen through glass that the soiling darkens by more than 0.02, on a
320 by 200 grid: 3rd Street's storefronts 6,269 before and 0 after, Broadway's 6,306 and 3, the north face's 6,379
and 4, the four faces' 4K poses 1,046 to 1,433 and 0 to 15, `st_portal` 3,923 and 23; the portals' close-ups keep
some 300 each (5,600 to 5,800 before), all deep in the dark vestibule and beyond it (the fascias' backs, see "What is
not covered"). With the soiling off the stills repeat the critique's to within one level (max 1).

The worn scene switched off against the frozen pre-wear scene rendered again the same day (`renders/prewear_now/`,
OptiX and the CPU as the scene is set), mean levels and share of pixels off by more than 2: `hero_3q` 0.0088, 0.0008%;
`st_corner` 0.0060, 0.0003%; `st_along` 0.0068, 0.0019%; `st_up` 0.0062, 0.0008%; `st_portal` 0.0081, 0.0015%, the
noise floor. Against the stills of 2026-09-23 in `series/final/before/` both differ alike, by 0.27 to 0.38 levels (1.7
to 4.9% of the pixels past 2): the renderer no longer repeats those stills (the machine had been restarted after a
crash), so an off-state check renders the frozen pre-wear scene (`wear_before/bradbury_scene.blend`) again first.
Rendered once more from the final build and its rebuilt scenes (`renders/final_check/`): switched off, `st_portal`
0.0073 and `hero_3q` 0.0088 against that pre-wear scene (max 5 levels, none past 8); on, the Broadway close-up repeats
its evidence still to within one level at every pixel.

## Rain-washed exposed zones (AI 566)

`wear/features/washed.py` (`wear_washed`, cyan in the debug view): the parts of the facade the rain keeps cleaner than
the rest, and the light streaks runoff rinses into soiled surfaces -- the washed counterpart of the sheltered soiling
(AI 565). Dirt from the air settles on a facade fairly evenly; what makes one place cleaner or dirtier than another is
the rain. The runoff review (Blocken & Carmeliet 2013, after Robinson & Baker) puts it in one line: "runoff can locally
rinse away deposited dirt". Wind-driven rain hits a facade hardest at its top edge and top corners, and it reaches the
fronts of whatever stands out past nothing, so those keep less of the deposit; where a stream of runoff runs through a
soiled zone it rinses its path light ("white washing"), the counterpart of 564's dirt washing. Every value comes from
565's rain-exposure sweep or from 564's streams; nothing is placed by noise, and the mask is byte-identical from one
build to the next. Since the rework of 2026-09-23 each stream rinses as its own water and its own line say ("One stream
at a time", below), so no two brackets carry the same tongue and the ones the band drips clear over carry none; the
wash of the exposed fronts, a continuous field of the geometry's, was audited and left as it was.

```
blender -b -P wear_layer.py -- features=washed                           # its mask alone (about 1.5 s), the rest cached
blender -b -P render_wear.py -- wear=on wear_washed=0 view=st_up         # off; 1 is the calibrated default
blender -b -P render_wear.py -- wear=on wear_washed_film=1 view=hero_3q  # with the optional atmospheric film
blender -b -P render_wear.py -- wear=debug wear_runoff=0 view=hero_3q    # washed cyan against the soiling's violet
```

### The exposure: 565's measure, refined for the projecting fronts

The measure is 565's own (`ctx.field("soiling", "exposure")`): `open`, the share of the wind-driven rain that reaches
the surface the street sees past everything that stands out, times `catch`, the wind's catch across the face (the
height law, raised by up to 35% in the top 3 m and within 3 m of the block's corners). It is refined in one respect, in
this feature's own copy: a front standing proud of the recessed brick field catches up to `PROUD_GAIN` 35% more of the
rain than the field does (the catch rises at the edges of whatever stands out as it does at the block's own; the same
35% as 565's edge term), from none at 5 cm in front of the field (d -0.10, checked on the model at build time) to all of
it from 25 cm. So the fronts of the projecting piers, columns, corner pavilions, the band and the crown measure as more
exposed than the recessed bays between them. 565's mask and fields are untouched; the refined measure is published as
this feature's own `exposure`.

### The wash: a matter of degree against the general facade

The materials as they are drawn are the general facade. A deposit settles at the balance between what the air brings,
the same everywhere, and what the rain rinses off, so the dirt a surface keeps goes as 1 / E; against the general facade
-- the median exposure of the open masonry the street sees (sheltered less than 565's 0.03), 0.544 of the most exposed
surface -- a surface receiving E is cleaner by 1 - E_gen / E, normalised to 1 at the most exposed masonry there is (an
open, proud top corner). At or below the general level nothing changes. On Broadway (the other faces read alike):

| where | E / E_gen | wash |
|---|---|---|
| a column's front, floor 2 (7.5 to 8.5 m) | 1.01 to 1.04 | 0.02 to 0.08 |
| a column's front, floor 3 (10 to 12 m) | 1.08 to 1.13 | 0.16 to 0.25 |
| a column's front, floor 4 (13 to 15 m) | 1.16 to 1.18 | 0.30 to 0.34 |
| a corner pavilion, floors 2 / 3 / 4 | 1.08 / 1.13 to 1.19 / 1.23 to 1.26 | 0.15 / 0.25 to 0.34 / 0.42 to 0.45 |
| a corner pavilion, 0.3 m from the corner, floor 4 | 1.27 | 0.46 |
| a corner pavilion, top floor | 1.28 to 1.29 | 0.48 to 0.49 |
| the crown's exposed fascias (20.0 to 20.6 m) | 1.14 to 1.26 | 0.27 to 0.45 |
| a recessed bay's spandrel; the recessed top floor | 0.80; 0.93 to 0.96 | 0 |

A third of the masonry is washed at all (35% from 0.05), a fifth from 0.25, 4.7% from 0.5 and 0.4% from 0.75: the
fronts of the upper floors, the corner pavilions, the crown. The field is smooth and the geometry's own.

### Where the wash meets the soiling

565 soils by the share of the rain the OVERHANGS keep off, and does not use the wind's catch ("where the rain is heavier
is the washed zones' business"). The two meet at the crown: its members each stand under the one above, which keeps a
fifth to a third of the rain off their fascias (shelter 0.16 to 0.37), so 565 soils them a little; yet up at the top
edge the wind drives so much more rain that those fascias still take more of it than the general facade (the table's
1.14 to 1.26), and by the same balance a surface that takes more rain than the general facade cannot hold more dirt. So
the wash takes 565's soiling back off in proportion to how washed a surface is: it goes toward its clean look of the
surface as the deposits found it. Where the shelter is heavy -- under the corona, under the band and the heads, every
soffit (turned down, never washed) -- the exposure is well below the general level and the soiling stands whole, so the
cleanest and the most soiled places come out of one sweep and never disagree. 565's calibrated soiled places are among
them: the frieze under the plinth, the brick under the corbel, the soffits and coffers, the vault and the transoms keep
their soiling exactly (the frieze's foot, half a metre lower, takes a wash of 0.09).

### White washing and dirt washing: the rinse

The review's Fig. 10 (Robinson & Baker) draws both on one wall: under a band, the soiled wall with white-washed fingers
where the water runs down it, and dirt-washed edges and tips where the water slows and soaks in. So each has its own
reason for where it lies. DIRT WASHING (564) is where runoff lays down what it carries: on open or lightly sheltered
wall, which the rain keeps cleaner than the water arriving from a ledge's top. WHITE WASHING (here) is where a stream --
the water one conduit sheds from one place: a sill's end, a bracket's foot, a capital -- runs through a zone 565 soils
heavily: the wall there is dirtier than anything the water brings, the flow keeps it wet and moving, and the dirt it
takes is left at the stream's edges and below the zone. A curtain -- 564's thin spread flow along a whole drip line --
carries too little water per metre to rinse and soaks into the dry sheltered wall instead (the dark streaks under the
portal's cornice in the colour photos, which 564 calibrated against), so it stays 564's.

Found on the model: every one of 564's streams (`ctx.field("runoff", "streaks")`, kinds `sill_end`, `bracket`,
`capital`, `springing`) whose path starts inside a zone 565 soils at least about half as heavily as it gets
(`RINSE_SOIL`: 565's own smoothstep of the shelter from 0.45 to 0.85), rinsed from its source down its path while the
zone stays soiled for the water it carries and no further (a soiled zone lower down, a window's head, is not its to
rinse), and up over the conduit that brings it the water: a bracket's own front, up to the drip line of the band it
hangs from (564's `drip_lines`, within 0.6 m). The core is a ramp inside the stream's visible width (564's own profile:
its cut `VIS`, 0.4 of its width, either side of the axis, widening by `SPREAD`), clean out to one share of that
half-width and rinsing nothing past another, so 564's deposit stays at the stream's rims; the shader cuts a soft edge
inside the ramp, reaching further along a bed joint and the lip under it. Which streams can rinse is the zone's: the
band's 179 brackets that shed at all (the zone under the band is the one 565 soils heaviest: shelter 0.5 to 0.9 at a
bracket's foot) and 8 sill ends on 3rd Street, whose streams run about 1 m through the shelter of the fire escapes'
platforms. How clean, how far and how broad each one rinses is its own ("One stream at a time", below): 152 brackets
rinse, 0.20 m down the wall at the median (0.04 to 0.30) below 0.35 m of bracket, and 7 of the sill ends, 0.76 to
1.14 m. The other sill ends cross only their sill's own shelter, soiled at most about half as heavily, and stay 564's
classic dark streaks; the capitals' streams start in the open.

### One stream at a time (rework 2026-09-23)

The user's review of the finished layer (2026-09-23) rejected marks that repeat identically from one instance to the
next ("the pigeon marker looks like a pattern, it was placed at the same position in all windows"; "check the other
features for pattern like results"); noise inside a mark stays out, as before. This feature's audit found one stamp and
one field.

**The rinse was a stamp.** Every bracket under the band is the same shape, so the rule rinsed the same light tongue with
the same dark rims under every one of them: before this pass 186 alike. 564's rework drew each bracket's water and the
part of its foot the water leaves over, which took the 7 dry brackets' tongues away and narrowed the rest with their
exits, but the rinse took nothing else from the water: every stream still rinsed its core in full from the drip line
down to where the zone's soiling fell under `RINSE_SOIL`, 113 of the 179 to the same 0.24 m below the same 0.35 m of
bracket front, so a trickle of water 0.12 rinsed as clean a tongue as a stream of 1.33. The conduit on each bracket's
front had become a stripe as narrow as the exit and set off the front's middle wherever the exit lay, and it read in the
sun as a painted highlight on every console. And the core's edge was cut as a streak's is, over 3 mm, with 564's own
crisp edge a centimetre further out: every tongue had two hard lines down each side (`crops/closeup_*_1to1.png`,
`crops/broadway_brackets_sun.png`).

**The wash of the fronts is a field, not a stamp, and was left as it was.** It is 565's rain exposure refined for the
proud fronts: a smooth function of height, of the nearness of the block's corners and top edge, and of how far a surface
stands proud. Identical columns under identical exposure wash alike, exactly as they are lit alike; the field has no
step inside a front (it rises smoothly up each column from the second floor to the band,
`elevations/washed_<face>.png`), and its only edges are the fronts' own arrises, where the surface already turns (a
corner pavilion's top floor against the recessed top floor beside it). Seen whole it reads as the upper floors, the
corners and the crown a shade cleaner, +3% in sun and +9% in shade at floor 4, not as a mark repeated per column
(`audit/third_wide_fronts_off_on.png`, `audit/bway_wide_fronts_off_on.png`, and at 1:1
`crops/fronts_columns_*_1to1.png`); a draw per front would have no reason on this building (the fronts' exposure is the
geometry's) and would put a step where two fronts of one pier meet. Its channels (R, and A) are byte-identical.

**What sets one rinse apart from the next now.** Two things, one found and one drawn:

- **Its water**, which 564 draws per source. A stream's e-fold over its kind's is its water's scale `k` (564 sets the
  e-fold by the square root of the water a source drew, and a sill end's by its sill's length too), held to 564's
  `K_MAX`. How clean the stream keeps its core is its `POWER`, the smoothstep of `k` over 0.30 to 1.15: 0.92 at `k` 1,
  the geometry's measure, 0.47 at `k` 0.71 (water 0.5, the least a wet source draws). How far it rinses is where the
  zone's soiling, counted as soiling x its water (`k` squared: the dirt a stream can carry off goes with the water
  itself) x its line's keep (below), still passes `RINSE_SOIL`, normalised at the zone's heart: a heavy, steady stream
  rinses on into the zone's fringe, a light or a wandering one only its heart. A stream whose water cannot outdo the
  zone's dirt anywhere (its water times its keep under `RINSE_SOIL`'s 0.45: every trickle 564 draws for a bracket the
  band drips clear over, one light and wandering bracket stream, and one sill end) rinses nothing, and 564's streak is
  all it has.
- **Its line**, which nothing on the model says: whether its water holds one line down the wall from rain to rain or
  shifts about (a foot that drips from one point or from several, a joint that channels it). It is drawn per stream,
  the mean of two uniforms from the sha256 of `washed:rinse:` and 564's source id (two bytes each, as 564 draws), 0
  wandering to 1 steady, so every rebuild draws the same and nothing drawn for one stream moves when another changes. A
  steady stream is clean out to `CORE_STEADY` 0.45 of the streak's visible half-width and rinses nothing past 0.85; a
  wandering one out to `CORE_WANDER` 0.20 and nothing past 1.00, broader and softer, keeping its core `WANDER_KEEP` 0.75
  as clean; linear between.

The core's edge is a ramp in the mask (B: 1 where the core is clean, 0 where it rinses nothing), inside which the shader
cuts a soft edge (`RIM`: B from 0.85 down to 0.25) that reaches `RIM_LIP` 0.20 further out along a bed joint and the lip
under it: 564's deposit at the rims deepens toward the streak's own edge instead of lying there as a band with two hard
sides. The conduit is the bracket's whole front, which the film of its water covers: clean at the drip line across the
foot's width (`CONDUIT_CORE`: out to 0.35 of its half-width, nothing past the console's arrises) as the stream's power
keeps it, gathering down the front into the stream's own core at the exit on the foot. The foot is found on the model
(`bracket_feet`: the brackets grouped along each bay mesh as 564 groups them, 564's source id for each).

As built (the build prints it, `washed rinse ...`):

| | rinsed | none | down the wall | its core as clean as | line |
|---|---|---|---|---|---|
| bracket | 152 of the 179 that shed | 27, too little water (and 564's 7 dry brackets shed nothing) | 0.20 m (0.04..0.30; 10% under 0.08, 10% over 0.24) | 0.77 (0.17..0.95), a quarter under 0.71 and over 0.82 | 0.51 (0.06..0.98) |
| sill end | 7 of 8 | 1 | 0.82 m (0.76..1.14) | 0.73 (0.61..0.92) | 0.39 (0.22..0.88) |

Before this pass all 186 brackets rinsed at 1.0, and after 564's rework 113 of the 179 still to the same 0.24 m; now no
two neighbouring brackets are alike (none of the 151 neighbouring pairs within 0.02 of each other's strength, the same
length and within 0.1 of each other's line), about one in six shows none, and the heaviest steady streams keep the old
look. The rinse covers 4.9 m2 of brick face (6.5 before this pass, 4.9 after 564's rework: the softer edges make up for
the tongues gone), and amounts to 3.0 m2 of full rinse (5.6 and 4.2).

### The sources and the marks

| kind | on the model | sources | marks |
|---|---|---|---|
| projecting front | each run of proud masonry at one depth (4-connected within 3 cm): a pier, a column, a pavilion below or above the band, a stretch of the band, a crown member; 20 texels (0.05 m2) at least | 328 | 328 |
| corner | the block's five corners, up the arris at the fronts' depth (the chamfer's two at half sharpness) | 5 | 10, one per face beside it |
| top edge | each face's top edge, along the crown's front | 5 | 5 |
| rinsed stream | one of 564's streams through a heavily soiled zone, with water enough to rinse it: 152 brackets, 7 sill ends | 159 | 159, each with its path |

497 sources, 502 marks, 159 paths (532, 537 and 194 before the rework). Every washed texel belongs to the source whose
rain makes it washed: a projecting front it lies on, else the block's corner it is near (within 565's 3 m, below the top
edge's zone), else its face's top edge (the catch rising toward the top of the face; a front smaller than 20 texels, a
dentil, goes there too). Build: about 1.5 s.

### The mask

`masks/washed.png` is 2 cm with four 8-bit channels: R the wash (565's 5 cm field, sampled bilinearly), G how much of
the soiling a stream rinses there (its own: its power, its line's keep and how far its water carries it), B how far
inside its rinsed core (a ramp: 1 where the core is clean, falling to 0 where the stream rinses nothing; up a bracket's
front, across the foot's width at the drip line), A how far inside one of 564's streaks (564's published deposit field,
grown one texel), where the wash brightens what it finds instead of taking it off. 2 cm because the rinsed cores are a
few centimetres wide and their edges follow 564's; 8 bits because every channel
is a smooth 0..1 amount, which keeps the image at 41 MB of VRAM as bytes, a quarter of a 16-bit mask at this resolution.

### The look

Washed masonry goes toward its own colour a little brighter (`BRIGHT` 25% at a full wash) and a little more saturated
(`SAT` 6%): the deposit that greys and dulls it rinsed off; the mortar joints keep `JOINT_KEEP` 40% of theirs, so the
brick reads crisper rather than bleached. It goes toward that look of the surface as the deposits found it -- the
framework's `Clean Color`, which takes 565's soiling off as above -- but inside one of 564's streaks (the mask's alpha)
it brightens what it finds instead, so a streak keeps its contrast on a washed wall. The crown's upper faces take the
rain square on whatever the elevation shows (every point of a top reads the row of the front below it), so the shader
washes the tops within the crown's own height (19.10 to 20.73) by their orientation, as 565 soils the undersides by
theirs; a sill's or the band's top below it keeps the dust 564's streams carry off it. The rinse takes a stream's core
`RINSE` 90% of the way back to the surface as the deposits found it at a full rinse (G 1), soiling and the stream's own
deposit alike, and its roughness with it; each stream as far as its G, inside the soft edge `RIM` cuts in its ramp.
Masonry only: glass, metal, paint and wood keep theirs. So the feature stands at ORDER 225, after soiling (200) and
runoff (220): it takes their deposits off, and must come after them.

### The optional film

`wear_washed_film` (0 by default, 1 in full): a very light, uniform atmospheric film over everything the rain does not
rinse -- the colour 35% of the way toward itself 35% greyed toward a dust grey at 80% of its brightness, and at least
0.75 rough -- which the wash takes off in proportion to how washed a surface is and the rinse wholly. Uniform: it has no
position of its own, never mottles, and settles as the soiling does (masonry in full, painted metal and paint 0.6, the
portal's glazed brick 0.4 and oak 0.35, glass not at all). It gives a dirtier general facade with something to wash off;
at 1 it moves `hero_3q` by 1.1 levels on average and `medium_3rd` by 1.6.

### Calibration

Measured in rendered pixels on the full-size evidence stills at the scene's defaults, the linear luminance of a box
with the wash on against the same box with `wear_washed=0` (soiling and runoff on in both), `diff/calibration.json`:

| where | light | on / off |
|---|---|---|
| a column's front and a corner pavilion, floor 4 | sun (Broadway) | 1.03 |
| the corner pavilion's top floor; the band's frieze | sun | 1.04; 1.02 |
| a column's front, floor 2 | sun; shade | 1.00; 1.01 |
| a column's front and a corner pavilion, floor 4 | shade (3rd Street) | 1.09 |
| the corner pavilion's top floor; the crown's front | shade | 1.10; 1.10 |
| a recessed spandrel; the recessed top floor | both | 1.00 |
| a rinsed stream's core under the band, against the soiled wall beside it | shade | 0.63 off, 1.25 on (before the rework) |
| a bracket's front (the rinsed conduit) | shade | 1.32 (before the rework) |
| since the rework: a rinsed core just under its bracket's foot, against the soiled wall 10 cm beside it | shade | 0.80 to 1.05 off, 1.25 to 1.75 on |
| since the rework: a bracket's front | shade | 1.24 to 1.31 where its stream rinses, 1.00 where it does not |

The reference is the 1960 HABS photo of the Broadway bays (`loc_habs_ca0212_010`), in sun: a pier's front reads 1.04
to 1.06 of the recessed spandrels beside it (`references/habs_ca0212_010_piers_vs_spandrels_boxes.png`). In the render
the light alone gives a column's front 1.04 to 1.07 of the spandrel (it sees more sky); with the wash the floors 2 and
3 stay there (1.07) and floor 4, where the wind-driven rain is heavier, reaches 1.07 to 1.10 -- the photo's order and a
little over it at the top, for a maintained building in a city that hardly rains. As the framework found, AgX compresses
the sunlit walls, so the same change reads about three times as much in the shade. A full rinse takes a core back to
the surface as the deposits found it, so under the band it reads as light as 565's soiling there is dark (the calibrated
0.80 to 0.84), the inverse of it. `BRIGHT` 0.25, `SAT` 0.06 and `RINSE` 0.90 carry the calibration; `DEFAULT_STRENGTH`
stays 1.0.

Since the rework each stream goes as far as its own water and line take it. Measured on the rework's close-ups of 3rd
Street's band (in shade; the poses under "Evidence"), with the other features on in all three states: of the 10 rinsed
brackets there, the 8 whose rinse reaches the box just under the foot read 1.25 to 1.75 of the soiled wall 10 cm beside
them (0.80 to 1.05 with the wash off: 564's streaks are lighter since its own rework) and 1.54 to 1.67 of themselves
with the wash off; the 2 whose rinse stops within 8 cm of the foot, 1.12 and 1.14. Before this pass the same boxes read
1.46 to 2.20 wherever the rinse reached them, and 1.32 to 1.75 under the 4 brackets in view that now carry too little
water to rinse (1.00 now: 564's faint streak, or none). A bracket's front reads 1.24 to 1.31 of itself unwashed where
its stream rinses and 1.00 where it does not, against 1.31 to 1.44 on every bracket before. So the typical tongue is a
little lighter-handed than the old one, the heaviest as strong, and the rest spread between (`diff/calibration.json`,
the boxes drawn in `diff/<view>_calibration_boxes.png`).

### The debug view

Cyan: the wash at full colour from half of the most there is (`DEBUG_GAIN` 2), so its gradient up the fronts shows, and
every rinsed core as strongly as its stream rinses it (a light stream's paler, a trickle's absent); an outline around
each projecting front, a tube up each corner and along each face's top edge, a tube at each rinsed stream's source and a
thin one down its path. `wear=debug wear_runoff=0` sets the wash against the soiling's violet, the contrast between
shelter and wash. In the sun, on Broadway, the debug cyan reads pale (AgX again); 3rd Street, in the shade, shows it
plainly. The elevations (`elevations=1`) draw the wash and, through `elevation()`, each stream's rinse as the shader
cuts it on a brick's face, so the streams read apart there too.

### Published for the features that follow

`ctx.field("washed", key)` for a feature that NEEDS washed (573 erodes the mortar where the rain beats):

- `exposure`: `dict(res=0.05, z0, atlas, data, open, catch, proud, general, note)`: 565's measure with the projecting
  fronts refined (`data` = open x catch, normalised to 1 at the most exposed masonry; `catch` 565's times the proud
  term; `proud` 0..1; `general` the open masonry's median, 0.544 in `data`'s units).
- `wash`: `dict(res=0.05, z0, atlas, data, note)`: the wash above, 0..1 (the crown's upper faces are washed in the
  shader, not here).
- `rinse`: every rinsed stream, `dict(id, source, kind, facade, axis, side, s0, s1, z_head, z_top, z_end, width,
  soil, water, power, line, core, peak, conduit)`: 564's source it comes from, its conduit's top, its source and the
  lower end of its rinse; since the rework also its water scale `k`, its power, its line, its core's clean and edge
  shares, the most it rinses below its source, and a bracket's foot (the conduit's width), None for a sill end. 159
  streams, from 187 after 564's rework and 194 before it.
- `fronts`: every projecting front, `dict(id, facade, s0, s1, z0, z1, depth, texels, wash)`.

The rework changed only `rinse`: `exposure`, `wash` and `fronts` are the same, so 573, the one feature that NEEDS this
one (it reads `exposure` and the helpers `owned_texels` and `label_fronts`, and walks 564's streaks itself rather than
this feature's rinse), rebuilt byte-identically.

How 573 should read them: erode by `exposure["data"]` against its `general` (the joints of the washed fronts, the crown
and the corners), with runoff's paths; never where 565's `shelter` is above about 0.2; a rinsed stream is a path where
the water runs heaviest, so its joints erode first.

### What it changed in the framework

Backward compatible, and the probe, runoff and soiling masks build byte-identically (`37806c0b...`, `4fa13d0c...`,
`6517dd79...`): `wear/nodes.py` hands every feature two more inputs, `Clean Color` and `Clean Roughness`, the state
entering the first feature at `DEPOSITS` 200 or later in the chain (the surface as the deposits find it, after the
fabric features mortar erosion and edge wear); `wear/registry.py` lists `washed`. The worn block keeps 2283 objects
(2275 and eight markers). With `wear_washed=0` the canonical scene renders as 565 left it: against 565's own stills,
`hero_3q` 0.0081 and `st_up` 0.0082 mean levels. The rework changed nothing outside `washed.py`: rebuilt whole, every
other feature's mask and cache (573's included) came out byte-identical to the state before it, the worn portal is the
same object for object, the worn block differs only in this feature's own debug markers, and it keeps its 2697 objects
(2275, 22 markers and the 400 of the geometry features).

### Evidence

In `tests/artifacts/screens/bradbury_wear/rain_washed/`: `<view>_off_on_debug.png` (washed off with soiling and runoff
on | on at its default | the debug view with the wash and the soiling | for the three street cameras, the debug view
with every feature, 50%) for `hero_3q`, `st_corner`, `st_up`, `medium_3rd` (3rd Street's east end in the shade, the
washed fronts), `closeup_band_3rd` (the rinsed streams under the band), `crown_closeup` (Broadway's crown in sun),
`bway_square` and `third_square` (the calibration views); `hero_3q_film.png` and `medium_3rd_film.png` (the optional
film); `renders/` (the full-size stills, and `<camera>_wear_off.png` for all five cameras); `diff/` (off against on, x8,
with the numbers as json; the off-state checks; `calibration.json`; `summary.json`); `references/` (the HABS photo and
the boxes measured on it). Off against on, mean 8-bit levels over the frame and the share of pixels moved more than 2:
`hero_3q` 0.46, 10.4%; `st_corner` 0.34, 7.5%; `st_up` 0.33, 5.2%; `medium_3rd` 0.73, 20.6%; `closeup_band_3rd` 0.79,
26.0%; `crown_closeup` 0.80, 12.9%.

The off switch still renders as before the layer: the worn scene with `wear=off` against the pre-wear renders
(`series/final/before/`), mean levels and share of pixels off by more than 2, `hero_3q` 0.0138, 0.004%; `st_corner`
0.0279, 0.046%; `st_along` 0.0075, 0.008%; `st_up` 0.0100, 0.011%; `st_portal` 0.0140, 0.020% (the noise floor is
0.0067 to 0.0310).

The rework (2026-09-23), in `tests/artifacts/screens/bradbury_wear/rework/washed/`: `<view>_before_after.png` (the
whole layer before this review pass, from `tests/artifacts/blender/bradbury/wear_snap_rework_before/`, after it, and the
change, orange lighter and blue darker, full at 25%) for the five cameras and the rework's poses;
`<pose>_off_on_debug.png` (washed off with every other feature on, on at its default, the debug view with the wash
alone) for the poses; `crops/` (1:1 and x2: the close-ups' brackets before this pass, after 564's rework and after this
one, and with the wash off; seven wet brackets in a row; Broadway's band in sun, where the old conduit stripes read
plainest; the fire escapes' sill ends; the medium view's band; and the fronts: neighbouring columns on both streets, off
and on); `elevations/` (the layer's own `washed_<face>.png`, now with each stream's rinse drawn, and
`rinse_band_<face>_before_after_2cm.png` and `rinse_fire_escapes_S_before_after_2cm.png`, the rinse along each face's
band and under the fire escapes at the mask's 2 cm, before this pass, after 564's rework and after this one); `audit/`
(the fronts' audit: 3rd Street in shade and Broadway in sun square on, washed off and on, and the wash's change;
`iterations/`, the rework's cuts); `renders/` (the full-size stills, `<camera>_wear_off.png` among them); `diff/` (the
change maps and x8 differences, `rework_numbers.json`, `calibration.json` with its boxes drawn, and
`byte_identity.json`). The poses are cameras at x, y, z looking at x, y, z with a lens in mm, as `VIEWS` is written: the
close-up (-13.8, -25.2, 14.7) to (-13.8, -17.9, 15.0), 50 mm (3rd Street's band in shade, eight brackets and a column);
`band_close2` the same 4.2 m east; `fire_close` (3.9, -26.0, 10.9) to (3.9, -17.9, 10.9), 35 mm; the medium view (4.0,
-34.0, 2.5) to (4.0, -17.9, 13.0), 35 mm; `crown_up` (26.0, -2.0, 2.0) to (17.0, -2.0, 19.2), 70 mm; `third_wide`
(-11.0, -60.0, 10.5) to (-11.0, -17.9, 10.5), 35 mm; `bway_wide` (55.0, 1.2, 10.5) to (17.0, 1.2, 10.5), 35 mm. The
wash switched on against off: the close-up 0.59 mean levels and 21% of its pixels moved more than 2 (0.79 and 26% in the
old `closeup_band_3rd`), the medium view 0.67 and 20%. The worn scene switched off against the pre-wear renders:
`hero_3q` 0.0166, 0.006%; `st_corner` 0.0320, 0.058%; `st_along` 0.0070, 0.005%; `st_up` 0.0063, 0.002%; `st_portal`
0.0161, 0.024%, the noise floor.

## Street-level grime band (AI 567)

`wear/features/street_grime.py` (`wear_street_grime`, yellow in the debug view): the darker foot of the building. Rain
splashes back off the pavement onto the lowest part of the stone, traffic and pedestrians leave their grime on it, and
damp rises from the ground (the ICOMOS-ISCS glossary lists rising damp among the causes of darkened "moist areas"). The
band is darkest at the pavement and fades upward with a soft top edge, one height all along a run; it lies only on the
stone that faces the pavement and the street, runs round each pier onto the jambs of the openings and stops at the
glass and the doors. Its sources are the ground itself, found on the model with the band's reach into each recess;
each run and each corner draws its own share of it (since the rework of 2026-09-23, below); nothing is placed by noise,
and the mask is byte-identical from one build to the next.

```
blender -b -P wear_layer.py -- features=street_grime                  # its mask alone (about 3.5 s), the rest cached
blender -b -P render_wear.py -- wear=on wear_street_grime=0 view=st_corner   # off; 1 is the calibrated default
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_edge_wear=0 view=st_along   # the band alone
```

### The street level

The feature casts its own elevation of every face on its 2 cm texels from 0.10 to 1.40 m, as the street sees it: the
depth, material, owner and normal of the first surface a level ray meets (622,700 rays, about a second). Nothing under
the pavement counts (the level rays at 0.19 find the granite fill under a portal's recess floor, which the scene's
pavement hides). What stands there is all stone:

- the pier ring (`fit_piers`, its front at d 0.22, the modal depth of the stone at the pavement, measured at build
  time): the 0.885 m storefront piers, the corner piers that wrap the block's corners with a face on each street (the
  chamfer's two turn 45 degrees), and the narrow strips beside the portal pilasters. Its returns run back 0.40 into the
  two-pane storefronts and 0.60 into the three-pane ones and the deep fillers, to the frames, and about 0.45 to the
  chamfer's door and the north face's door by its west corner: they are the openings' jambs;
- the three portals: the pilaster plinths, standing 0.24 proud of the ring (0.46); the granite step between them,
  0.12 tall with a rounded nose; the paired portal piers standing on the step at the mouth (their fronts at 0.25, 0.20
  behind the plinths), the portal's own jambs; and behind them the recess with its dark stone base and the doors, 2.2 m
  in.

The storefronts are glazed down to a 6 cm frame rail on the pavement: there is no stone under them, so what the prompt
calls the stone under the storefronts is, on this model, their jambs. A texel whose stone faces the street (its normal
at least 0.7 out of the face) is a **front**; any other stone texel (a moulding's profile, the step's rounded nose) takes
the band's values but stands on nothing and has no corners of its own.

### The ground, and how far the splash reaches

Splash is thrown by rain that lands on the ground, so the sources are the ground: the pavement, which the render scene
lays under the whole outline (it closes the floor of every recessed storefront too), and the portals' step. Every stone
texel finds the ground it stands on by a ray straight down from just in front of it: a top no more than `STEP_MAX` 0.20
over the pavement is a ground (the step, 0.321), anything else leaves the pavement (0.201). So a pier's band is measured
from the pavement and a portal pier's from the step's top.

How far back the wet ground runs in front of each column is measured with 565's own rain: every other one of its
inclinations and azimuths (20, 40, 60 degrees off the vertical; -75 to +75 by 30 off the face's normal), each taken by
a ground point by its vertical component, cos theta, and blocked where the ray from the point toward the rain meets the
building. The ground is probed every 5 cm along every other column, from 0.10 in front of the street line (the most
forward base within 2 m along the face) back to the first surface over the step (53,423 points, about 1.3 s). The open
pavement in front of the piers takes all of it (1.000); the ground is **wet** while it takes at least `WET` 40% of that,
and a surface loses the band over `REACH` 0.45, the splash's reach, behind the wet ground's back edge.

| where | the rain the ground takes | the wet ground runs back to |
|---|---|---|
| in front of a pier | 1.00 | the pier's face |
| a storefront recess, in its middle; beside a jamb | 0.76 to 1.00; 0.50 to 0.67 | the frames: its jambs take the band whole |
| a portal: the step in front of the mouth; under the arch block | 1.00; 0.86 | |
| a portal's recess floor, in its middle | 0.67 from d -0.05, 0.52 from -0.70, 0.38 from -1.10, 0.19 from -1.20 | d -1.08 |
| beside the portal piers | 0.50 back to d -0.35, 0.40, then 0.33 from -0.45 | d -0.38 to -0.43: their inner sides stand in it |
| behind the portal piers, the recess walls' dark stone base | | nothing: the portal piers' own faces; the base takes none |

A jamb stands exactly at its front's edge, so each column takes the deepest wet edge of its neighbours within `BLEED` 3
texels: the storefront's floor, not the pier's face, is what lies in front of a storefront jamb.

### The band

At a height H above its ground a front takes

    band = 0.25 exp(-H / 0.10) + 0.75 (1 - smoothstep(0, TOP, H)),   TOP 0.65, 0 above it

| H | 0 | 0.05 | 0.10 | 0.20 | 0.30 | 0.40 | 0.50 | 0.60 |
|---|---|---|---|---|---|---|---|---|
| band | 1.00 | 0.89 | 0.79 | 0.62 | 0.43 | 0.25 | 0.10 | 0.01 |

darkest at the ground, fading upward with a soft top edge: splash reaches about half a metre. The top edge is one height
all along a run. Each run takes the band times its own amount, with H over its own reach, and each corner its own gain,
zone and rubbing marks (see "One pier and one corner at a time", below); beyond those draws the band varies only with the
geometry:

- **Corners.** The convex vertical arrises that stand on the ground at the street front: a front whose neighbour along
  the face stands back at least `ARRIS_STEP` 0.06 (a return into an opening, a plinth's side) or is open air (the block's
  90 degree corners), or turns away from the street by `ARRIS_TURN` 0.30 (the chamfer's 135 degree corners, at half
  sharpness). Their texels are joined up their height; a run resting on another (a pilaster's shaft on its plinth,
  within 0.08 along the face and 0.12 above it) carries on as the same corner, which must stand at least 0.30 tall. Within
  its zone (`CORNER_W` 0.20 at the geometry's measure) of an arris, on both of its faces, the band is stronger (up to
  `CORNER_GAIN` 20% at the geometry's measure): a convex corner takes splash from more of the ground round it. Where
  hands and bags rub a corner, faint rubbing marks run on above the band to hand height (`CONTACT` 0.32 of the band's
  full value at the geometry's measure). On the arris's own front the zone falls off along the face; on its jamb it falls
  off with how far back from the arris a point stands (over `CORNER_W`), and a concave neighbour standing behind it (the
  pier strip beside a plinth) takes none.
- **Plinths.** A base standing in front of the pier ring (from 0.05, fully from 0.20: the portal plinths, the step) takes
  `PLINTH_GAIN` 12% more.
- **Openings.** The band lies on stone only, so it stops at the glass, the frames and the doors. Each front's values
  reach 3 texels past its edge into the opening, for its jamb, which reads them there.
- **Recesses.** Behind the wet ground it fades over the splash's reach (above).

### One pier and one corner at a time (rework 2026-09-23)

The pier ring is one stone repeated round the block, and the band above read only its geometry, so it stamped the same
mark on every pier. All 38 pier fronts (the storefront piers, and each face of the corner piers) took the same band, one
height and one strength, and all 100 corners took the same splash gain and the same rubbing marks, full to 0.70 m and
gone by 1.10. At 1:1 every pier carried the same U, and in shade on 3rd Street its horns read 0.83 of the clean stone at
0.70 m, the same at every arris (user 2026-09-23, reviewing
the layer: marks must not repeat identically from one instance to the next; noise inside a mark stays out, as before).
What makes one pier's foot differ from the next on a real street is what the model does not carry: a tenant who scrubs
the frontage, a paving slab that falls toward one pier and ponds at its foot, the doors people use and the corners they
turn, where hands, bags and shoulders touch the stone. So each run and each corner draws its own share of what the
geometry gives it, led by how busy the pavement in front of it is.

**How busy.** The pavement's entrances and the block's corners, where people turn in, turn the corner and wait to cross.
The entrances are each portal's mouth (its step run) and each door: an opening of the pier ring at least `OPENING_MIN`
1.0 wide with a pull at hand height in it. The build finds three, as 570 does: the chamfer's, the north face's by its
west corner and the west face's by its north corner. `busy` is 1 at them and falls off along the pavement with an e-fold
of `T_REACH` 2.0 (570's traffic is its base share plus the rest times this). An entrance's jambs (the arrises within
`MOUTH_PAD` 0.10 of its opening) and the block's corners count 1. Elsewhere, keep right: the flow nearest the wall keeps
it on its right and meets each pier's right-hand arris first, which takes the pavement's `busy` in full, the left-hand
one `LEAD_TRAIL` 0.70 of it.

| what | drawn | bounds |
|---|---|---|
| run | its amount, times the band (its tenant's care, how its paving drains) | 0.78 to 1.12 (`RUN_AMOUNT`), and up to 15% more on the busiest pavement (`RUN_TRAFFIC`) |
| run | scrubbed not long ago, about one in twelve (`SCRUB_P` 0.08): its amount instead | 0.40 to 0.65 (`SCRUB`) |
| run | its reach: the band's height over its ground, times this | 0.85 to 1.18 (`RUN_REACH`) |
| corner | its splash gain, times `CORNER_GAIN` | 0.40 to 1.40 (`GAIN`) |
| corner | its zone's reach along each face, times `CORNER_W` | 0.65 to 1.35 (`WIDTH`) |
| corner | whether hands and bags rub it at all: 4% on the quietest pavement, 75% at an entrance's jambs and the block's corners | linear in `busy` (`RUB_P`) |
| rubbed corner | its marks, times `CONTACT` | 0.50 to 1.30 (`RUB_AMOUNT`), times 0.70 on the quietest pavement up to 1 on the busiest (`RUB_LEAD`) |
| rubbed corner | full from the band up to this height over the pavement, then gone this much higher | 0.50 to 0.80 (`RUB_FULL`); 0.20 to 0.35 (`RUB_FADE`) |
| rubbed corner | the share of its marks its jamb takes; at an entrance's jambs, where the hands go | 0.25 to 0.75 (`JAMB`); 0.80 to 1.20 (`MOUTH_JAMB`) |

Where a range is given, the value is the mean of two uniforms, the middle likelier than the ends. The seed is the run's
or the corner's own place (`draw`: the sha256 of `street_grime:` and a key, two bytes to a uniform): a run's kind, face,
span and ground, a corner's face, place and side. A corner pier's two faces are one stone and one frontage, so both of
its runs draw from the block corner they wrap. A block corner, listed once for each street it fronts, draws once, and a
shaft resting on its plinth draws with it. A rebuild draws the same values (the mask's sha256 is the same from one build
to the next), and a change elsewhere on the model reshuffles nothing.

As built (the build prints it, `street_grime drawn ...`):

| | drawn | as built |
|---|---|---|
| runs | amount | 1.01 (0.49..1.20); one scrubbed, the pier at s 41.72 on 3rd Street (0.49) |
| runs | reach | 1.01 (0.87..1.16): a storefront pier's band tops out (where it falls to 0.10) at 0.44 to 0.58 m; it was 0.50 on every one |
| corners | gain; zone | 0.18 (0.10..0.27), was 0.20 at every corner; 0.20 m (0.14..0.26), was 0.20 |
| block corners | rubbed | 4 of the 5 (8 of the 10 listings): contact 0.26 to 0.39, gone by 0.90 to 1.00 m |
| portal jambs | rubbed | 10 of 12 (the plinths' inner corners and the portal piers): contact 0.23 to 0.41, gone by 0.84 to 1.06 m, the jamb 0.88 to 1.15 |
| door jambs | rubbed | 2 of 6 (the chamfer door's jamb on the 3rd Street side, the north door's east one): contact 0.33, 0.34 |
| near an entrance or a corner | rubbed | 11 of 22 (`busy` 0.45 to 0.66): contact 0.18 to 0.33 |
| the quiet rows of shop windows | rubbed | 5 of 50 (`busy` under 0.21): contact 0.18 to 0.30, gone by 0.82 to 0.98 m |

36 of the 100 listed corners (32 of the 95 arrises) carry rubbing marks, where every one did before, no two alike; the
other 64 carry only their own splash gain. The rubbed ones cluster where people are: the portals, the corner at the
crossing and the block's other corners. Along the quiet rows of shop windows a pier carries its own band and nothing up
its corners, with one arris in ten rubbed.

### The sources and the marks

| kind | on the model | sources | marks |
|---|---|---|---|
| pier run | the foot of each pier's front on the pavement (the strips beside the pilasters included) | 44 (35.52 m) | 44 |
| plinth run | each portal pilaster's plinth | 6 (4.94 m) | 6 |
| step run | each portal's granite step | 3 (9.34 m) | 3 |
| portal pier run | each portal pier's front, on the step's top | 6 (1.46 m) | 6 |
| corner | the exposed arrises: the piers' at every opening 72, the plinths' 12, the portal piers' 6, the block's 10 (the chamfer's four at half sharpness); 36 of them rubbed | 100 | 100 |

159 sources, 159 marks, 59 paths. A run is a line source along its foot (a front's lowest texel standing within 0.12 of
its ground, with nothing of the same part under it), joined along the face at one depth and one ground; its band is one
mark, and every band texel belongs to the run whose foot stands highest under it in its column. A corner is a line source
up its arris to where its zone falls to 0.10: its rubbing marks' top where hands rub it, the band's top where they do
not. Its zone is one mark. Build: about 3.5 s.

### The mask

`masks/street_grime.png` is 2 cm with four 8-bit channels (41 MB of VRAM as bytes), painted only from 0.10 to 1.40 m:
- R: the band a front takes there, over `R_SCALE` 1.5: its run's amount, measured up from its own ground over its reach,
  with a plinth's gain in. A heavy run's plinth reaches 1.24. Before the rework, R held the band itself and the plinths'
  feet clipped at 1.0 in 4,531 texels.
- G: what a corner adds to the band there, the most of two: its splash gain (its gain x its zone x the band), or, where
  it is rubbed, its rubbing marks less the band (their amount x `CONTACT` x its zone, the jamb's share on the jamb, x
  their own profile up the arris). The zone is the corner's sharpness, falling to 0 at its own reach along the front.
- B and A: the street front's depth there and the wet ground's back edge (both d over -1.40 .. +0.60).

The two depths let the shader tell each point where it stands: `d_wet - D` is how far behind the wet ground (the
recess's fall-off, 0 on anything in front of it), `d_ref - D` how far back from the front's arris (a jamb's corner zone,
over `CORNER_W`). The shader takes `(R_SCALE R + G near) att`, near `1 - smoothstep(0, CORNER_W, d_ref - D)` and att the
recess's fall-off: on a front, the band and its corner's extra; on a jamb, the corner's extra fading with its depth.
The rows under the pavement repeat the lowest row, so the lookup at the foot filters against itself. B and A are
byte-identical to what they were before the rework.

### The look

Where the band lies, the colour goes `AMOUNT` 0.78 x the band x the strength of the way toward DIRT: the stone's own
colour 10% greyed toward a warm grey (its luminance times (1.00, 0.94, 0.87)), at `DIRT_DARK` 40% of its brightness; and
the roughness goes to at least 0.80. Darker, a little duller and rougher, the stone's own texture under it and its
normal map untouched. Masonry only -- on this block the pier stone, the portal's sandstone, its granite step and dark
stone -- and only on walls and jambs (|Nz| under 0.55 in full, gone by 0.85: no tops, no soffits), never on what faces
into the building. It stands at ORDER 230, after the washed zones: a deposit laid over whatever the rain left.

### Calibration

Measured in rendered pixels on full-size square-on stills at the scene's defaults: the linear luminance of a box with
the band on against the same box with `wear_street_grime=0` (the other features on in both), `diff/calibration.json`:

| where | light | 0-5 cm | 5-15 | 15-25 | 25-35 | 35-45 | 45-55 | 55-65 |
|---|---|---|---|---|---|---|---|---|
| a pier, mid-run | shade (3rd Street) | 0.50 | 0.57 | 0.66 | 0.76 | 0.86 | 0.94 | 0.99 |
| a pier, mid-run | sun (Broadway) | 0.71 | 0.77 | 0.83 | 0.89 | 0.94 | 0.98 | 1.00 |
| a portal plinth, mid-run | shade | 0.45 | 0.51 | 0.61 | 0.72 | 0.83 | 0.93 | 0.99 |
| a portal plinth, mid-run | sun | 0.72 | 0.76 | 0.83 | 0.89 | 0.94 | 0.98 | 1.00 |

| at the arris | light | 0-10 cm | 30-40 cm | 60-80 cm (rubbing) | 85-100 cm |
|---|---|---|---|---|---|
| a pier | shade; sun | 0.44; 0.67 | 0.77; 0.90 | 0.83; 0.93 | 0.93; 0.97 |
| a portal plinth | shade; sun | 0.39; 0.65 | 0.74; 0.90 | 0.91; 0.92 | 0.99; 0.93 |

The reference is the user's photo of the Broadway portal (`references/user_entrance_frontal_plinth_boxes.png`, in
shade): the plinth blocks read 0.48, 0.48 and 0.43 (left) and 0.57, 0.55 and 0.43 (right) of the pilaster's shaft
above them, top to foot. That is mostly the plinths' own darker, redder stone and finish, which the model does not have,
and the grime on top of it; the band meets the photo at the foot (0.45 to 0.50 in shade) and fades above it, a
maintained building. The 1960 HABS photo of the same portal (`references/habs_ca0212_010_plinth_boxes.png`, in sun, 3 cm
a pixel) shows no band at all: its plinths read lighter toward the pavement (1.09 to 1.18 of the shaft), the bright
pavement's bounce on a washed building. As the framework found, AgX compresses the sunlit stone, so the same band reads
at 0.71 in the sun on Broadway and 0.50 in the shade on 3rd Street. `AMOUNT` 0.78 and `DIRT_DARK` 0.40 carry the
calibration; `DEFAULT_STRENGTH` stays 1.0.

The tables above are the geometry's measure, and since the rework (2026-09-23) a run drawn at 1 with an unrubbed corner
still reads them. Square-on stills at 1:1 (`rework/street_grime/audit/`) give the on/off ratio at the foot mid-pier and
at 0.70 m just inside each arris:
- 3rd Street, in shade: the piers at s 32.8 and 37.26 are both drawn 1.01. Their feet read 0.51 and 0.52, as before;
  their four arrises read 1.00 at 0.70 m, where all four read 0.835 before.
- Broadway, in sun: the piers at s 21.72 and 27.28 (drawn 0.92 and 0.87) read 0.755 and 0.79, where both read 0.73 and
  0.74 before; their arrises 1.00, where they read 0.93.
- The north face, in its grazing sun: the piers at s 18.08 and 22.28 (drawn 0.86 and 0.97) read 0.81 and 0.76, where
  both read 0.75 to 0.77 before.

In the medium still on 3rd Street, the scrubbed pier's foot reads 0.85 against 0.60 to 0.71 for its neighbours. Up a
rubbed arris at 0.70 m, the portal's plinths, piers and the strip beside them read 0.85 to 0.93 in shade.

### The debug view

Yellow: the band at full colour from a quarter of its foot (`DEBUG_GAIN` 4), and the rubbing marks at the corners that
carry them; a square tube along each run's foot, a tube up each corner's arris to where its zone falls to 0.10 (to hand
height at a rubbed corner, to the band's top at the rest), and a thin line along each run's top edge, where its band
falls to 0.10, which rises only at the rubbed corners. `wear=debug` with every other feature at 0 shows it alone (the
edge wear's green bands lie on the same arrises).

### Published for the features that follow

`ctx.field("street_grime", key)` for a feature that NEEDS street_grime (573 erodes the joints in the splash zone; 570
wears the corners on the pavement's path):

- `zone`: `dict(res=0.04, z0, atlas, data, note)`, the splash zone: the band as the street fronts take it, each run's
  and each corner's own (the run's amount and reach, the corner's gain and, where it is rubbed, its rubbing marks, and
  the recess fall-off in; 1 at the pavement mid-run at the geometry's measure, up to 1.5 at the foot of a heavy plinth's
  corner, the west portal's), max-pooled to 4 cm, float16 over the whole atlas, rows from `z0` up;
  `soiling.sample(field, f, s, z)` reads it.
- `runs`: every source run, `dict(id, facade, kind, object, s0, s1, d, z_ground, top, texels, amount, reach, busy,
  scrubbed)`; `kind` is `pier`, `plinth`, `step` or `portal pier`; `top` is its band's top edge over its ground, where
  the band falls to 0.10 (the median along the run: 0.44 to 0.58 on a storefront pier, 0.48 to 0.54 on a plinth, higher
  on a strip beside a pilaster, all corner); `amount` and `reach` its draws, `busy` the pavement in front of it,
  `scrubbed` whether it drew a scrubbed amount.
- `corners`: every exposed arris, `dict(id, facade, kind, side, s, d, z_ground, z0, z1, sharpness, object, gain, width,
  rubbed, contact, hand, jamb, busy, mouth)`; `kind` is `pier`, `plinth`, `portal pier` or `block corner`; `side` is the
  face the arris is on the right or left end of; `gain` its splash gain and `width` its zone's reach (both absolute);
  `rubbed` whether hands and bags rub it, and then `contact` its marks against the band's full value, `hand` the heights
  over the pavement they are full to and gone by, and `jamb` its jamb's share (`contact` 0, `hand` and `jamb` None where
  it is not rubbed); `busy` how busy it is, `mouth` the entrance whose jamb it is, if any.
- `entrances`: the portals' mouths and the doors, `dict(id, kind, facade, s0, s1, object)`.
- `ground`: `dict(res=0.02, e_open, wet, reach, d_ring, faces, note)`: per face and 2 cm column, `line` (the street
  line) and `d_wet` (how far back the wet ground runs, -1.40 past the block's corners).
- `profile`: the band's constants at the geometry's measure and its formula; `rub_full` and `rub_fade` are the bounds
  the rubbed corners draw their heights from (`hand`, the fixed 0.70 to 1.10, is gone with the rework).

For 573: the splash zone lies on stone under 1.2 m. No brick is within it on this block -- the brick starts at the
ground floor's crown, 6.29 m -- and the pier ring's first joint groove is at 0.915, above the band's top, so the
"lowest courses above the stone base" need another reason than the splash (564's ground-crown curtain, 566's exposure).
573 reads `profile`'s `top`, `foot_w`, `foot_e` and `reach`, the geometry's measure, which the rework left as they were.
For 570: `corners` are exactly the convex arrises standing on the pavement at the street front, with their sharpness;
a corner set back in a recess stands behind `ground.d_wet` at its column. 570 reads the step runs' spans, the corners'
places and kinds and `d_ring`, all as they were; `rubbed`, `contact`, `busy` and `mouth` say where hands and bags touch
each corner, for a wear that should agree with them.

Since the rework (2026-09-23) both rebuild byte-identical, because what they read is unchanged: 573's mask, and both
features' caches (their stashes and published fields with them).

### What it changed in the framework

Nothing but `wear/registry.py`, which lists `street_grime`. The probe, runoff, soiling and washed masks build
byte-identically (`37806c0b...`, `4fa13d0c...`, `6517dd79...`, `6c9963ea...`), the street grime mask is the same on a
rebuild (`16d42806...`), and the worn block keeps 2285 objects (2275 and ten markers).

The rework (2026-09-23) changed only this module. Its mask is the same on a rebuild (`79618df9...`). Every other
feature's mask and cache rebuilt byte-identically, 570's and 573's included (the fields they read are unchanged), and
the worn block keeps its 2697 objects (2275 and the layer's 422).

### Evidence

In `tests/artifacts/screens/bradbury_wear/street_grime/`: `<view>_off_on_debug.png` (street grime off | on at its
default | the debug view with the band alone | for the street cameras, the debug view with every feature, 50%) for
`st_corner`, `st_along` and `st_portal`, `closeup_pier_3rd` and `closeup_pier_bway` (one pier base with its jamb, in shade
and in sun), `closeup_plinths_bway` and `closeup_plinths_3rd` (the portal plinths, the step and the portal piers),
`closeup_chamfer` and `medium_chamfer` (the corner piers and the door jambs in the chamfer's grazing light);
`hero_3q_off_on.png`, `st_up_off_on.png`; `renders/` (the full-size stills, the square-on calibration stills `cal_*`,
and `<camera>_wear_off.png` for all five cameras); `diff/` (off against on, x8, with the numbers in `summary.json`; the
off-state checks; `calibration.json`); `references/` (the photos and the boxes measured on them). Off against on, mean
8-bit levels over the frame and the share of pixels moved more than 2: `st_corner` 0.074, 0.70%; `st_along` 0.057,
0.59%; `hero_3q` 0.076, 0.72%; the close-ups 0.76 to 1.85, 9 to 14%; `medium_chamfer` 0.48, 5.0%. `st_portal` and `st_up`
do not move (0.014, 0.006): their frames start 2.3 m up the wall and above the pavement.

The off switch still renders as before the layer: the worn scene with `wear=off` against the pre-wear renders
(`series/final/before/`), mean levels and share of pixels off by more than 2, `hero_3q` 0.0135, 0.004%; `st_corner`
0.0277, 0.046%; `st_along` 0.0075, 0.008%; `st_up` 0.0109, 0.014%; `st_portal` 0.0139, 0.020% (the noise floor is
0.0067 to 0.0310). With `wear_street_grime=0` the canonical scene renders as 566 left it: against 566's own stills,
`hero_3q` 0.0070, `st_up` 0.0053 and `st_corner` 0.0074 mean levels.

The rework (2026-09-23), in `tests/artifacts/screens/bradbury_wear/rework/street_grime/`. "Before" is the frozen state
before this review pass (`wear_snap_rework_before/`); "after" is the canonical scene. The poses are cameras at loc
looking at tgt, as `VIEWS` is written:

| pose | loc; tgt; lens | what |
|---|---|---|
| `closeup` | -23.6,-21.2,1.1; -20.4,-18.2,0.6; 28 | 3rd Street's portal, its west plinth, the strip beside it, the step and a portal pier, in shade |
| `medium` | -28.0,-27.0,1.7; -19.5,-18.1,1.0; 24 | 3rd Street toward its portal, the storefront piers on either side |
| `along_3rd` | -41.5,-23.0,1.7; -24.0,-18.1,1.0; 30 | along 3rd Street from the south-west corner pier |
| `pair_N` | -3.6,21.6,1.0; -3.6,17.6,0.75; 24 | two quiet piers of the north face, square on, 1:1 |
| `door_N` | -33.9,21.5,1.4; -33.9,17.6,0.8; 24 | the north face's door and its jambs |
| `chamfer` | 21.2,-22.1,1.45; 15.6,-16.5,0.8; 28 | the chamfer's corner piers and its door |

What the folder holds:
- `<pose>_before_after.png` and `<pose>_off_on_debug.png` (street grime off | on | the debug view with the band alone).
- For `closeup`, `medium` and `along_3rd`: `<pose>_debug_before_after.png` (the band alone, before and after) and
  `<pose>_ratio_before_after.png` (the mark alone as the on/off luminance ratio: the same U on every pier before, each
  pier's own band after).
- `<camera>_before_after.png` for the five cameras.
- `audit/`: the square-on pier pairs at 1:1 on 3rd Street, the north face and Broadway (`pairs_ratio_before_after.png`
  and the stills), and the published zone per face (`zone_strips_before.png` and `_after.png`).
- `elevations/` (the 5 cm elevations), `renders/` (the full-size stills), `ratio/`, and `diff/` (x8,
  `rework_numbers.json`, `byte_identity.json`).

Off against on at the default, mean 8-bit levels and the share of pixels moved more than 2: `closeup` 0.65, 8.0%;
`medium` 0.13, 1.7%; `along_3rd` 0.21, 2.7%; `pair_N` 0.67, 6.0%; `door_N` 0.73, 6.6%; `chamfer` 0.49, 4.8%. The
worn scene switched off still renders as before the layer against `series/final/before/`: `hero_3q` 0.0167, 0.006%;
`st_corner` 0.0319, 0.058%; `st_along` 0.0065, 0.003%; `st_portal` 0.0160, 0.024%; `st_up` 0.0060, 0.001%, within
the noise floor above.

## Rust stains from the fire escapes (AI 568)

`wear/features/rust.py` (`wear_rust`, orange in the debug view): what the two iron fire escapes on 3rd Street do to
themselves and to the wall they are fixed into. Iron rusts where it enters masonry and where water sits on it; the water
that runs off the ironwork carries the rust down the wall below (Chen et al. 2005's "stain bleeding", modelled from a
point source), and a corroding fixing can burst the masonry round it (the ICOMOS-ISCS glossary's "bursting"). The
sources are found on the fire escapes' own geometry: the points where they are fixed into the wall, and the free lower
edges of the platforms and the stair stringers, where water drips off the iron. Every stain has a source and a path from
it; nothing is placed by noise, and the mask and the ironwork's attributes are the same from one build to the next. No
two fixings, members, joints or platforms rust alike: each draws its own share from a seed of its own name (see "One at
a time").

```
blender -b -P wear_layer.py -- features=rust,efflorescence        # its mask and attributes, and 569's, which reads
                                                                  # them (about 13 s); the rest cached
blender -b -P render_wear.py -- wear=on wear_rust=0 view=hero_3q  # off; 1 is the calibrated default
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 view=hero_3q
```

### The ironwork, read from its own mesh

The two stairs are `attachment_fire_escape__2463` (3rd Street, s 19.35 to 22.05) and `__2464` (s 38.59 to 41.29),
1932 triangles each, every face of every box split from its neighbours by the export. The feature welds the triangles
back into members, pairs them into faces and names each member by its shape, per stair:

| member | count | what it is |
|---|---|---|
| platform | 3 | a slab 2.70 x 0.88 m, 6 cm thick, at floors 2, 3 and 4 (6.58, 9.58, 12.58), L-shaped round the hatch the drop ladder comes up through |
| stringer | 2 | the inclined sides of the two flights, their feet on a platform |
| handrail | 6 | inclined, their feet in the air |
| tread | 26 | 0.26 x 0.64 m plates between the stringers |
| post | 98 | the balusters, the front posts, the handrail posts and the ladder's rails |
| rail | 9 | the top rails: the front one and the two side ones on each platform |
| other | 14 | the ladder's rungs |

Each stair stands inside its window strip, jamb to jamb. Its back plane, where the ironwork stops toward the wall
(d -0.080), lies 2 cm in front of the piers (-0.10), 6 cm in front of the terracotta sills (-0.14) and 11 cm in front
of the strip's recessed panel (-0.19): the stair is carried by fixings that bridge that gap.

### The anchors

Only nine members per stair reach the back plane: the three platforms and their six side top rails. They are what is
fixed into the wall, each where masonry stands straight behind it within `ANCHOR_REACH` 0.20: a side top rail at its
rear end (it runs back to the wall with no post under that end), a platform at both ends of its rear edge (a plate is
carried at its corners, and along the rest of that edge the windows' glass stands behind it). Nothing else is an anchor:
the flights, the ladder and the posts stand on the platforms, and the model has no brackets under them (the 1960 HABS
photo shows the real stairs had). 24 anchors, 12 per stair: on each floor and each side, a rail's end and a platform's
corner in one column, 3 cm in from the stair's end. The stain and the run below are the geometry's measure, what a
fixing of that kind sheds with every one of its draws at 1 (all 24 did before the rework); each fixing's own is in "One
at a time".

| anchor | height | the masonry behind it | gap | stain | runs | stops |
|---|---|---|---|---|---|---|
| a side top rail's end, floors 2, 3, 4 | 7.62, 10.62, 13.62 | the strip's panel (brick) | 0.110 | 0.76 to 0.85 | 0.92 m | fades, or the sill below takes it |
| a platform's corner, floors 3, 4 | 9.61, 12.61 | the sill's front (terracotta) | 0.062 | 0.71, 0.92 | 1.23 m | fades |
| a platform's corner, floor 2 | 6.61 | the strip's panel | 0.110 | 0.69 | 0.31 m | caught by the ground floor's crown |

### The streaks

From each anchor the film of water is followed down the elevation exactly as runoff (AI 564) follows it -- its
`Elevation` and `walk`, 2 cm texels, the fire escapes looked through -- on the masonry behind the fixing: over a step
back of up to 10 cm (a sill's foot is crept round), until a surface standing further out takes it on its top (a sill
below, the ground floor's crown), an edge throws it off, or it fades out. The stain at the anchor is `AMP` 0.85 for a
rail's end and 1.0 for a platform's corner, which carries the deck's water, times the rain its member takes (below); it
falls off down the streak as runoff's streaks do, and a streak is gone three e-folds down (`EFOLD` 0.30 and 0.40 m). It
is `W0` 3 cm wide at the anchor and widens `SPREAD` 5 cm per metre, with a halo round the fixing, up to 1.5 cm wider
within 4 cm of it and reaching 2 cm above it: the rust spreading in the wet masonry round a fixing. That is the
geometry's measure; each fixing scales it by its own draws ("One at a time"), and a sound one sheds next to nothing.

The mask (`masks/rust.png`, 2 cm, four 8-bit channels, 41 MB of VRAM) does not paint a streak's width, which at 2 cm
would be a texel and a half; it paints where the streak is and where its axis runs. R is the stain down its length, G
the offset of its axis from the texel's centre, s_axis - s, and B its half-width there. The offset is linear in s, so
the lookup's bilinear filtering returns the exact offset at every shading point, and the shader cuts the streak's edge
analytically, crisp at any distance. The edge reaches `EDGE_LIP` 35% further along a bed joint and the lip of brick
under it, and the joints hold the stain further down (`JOINT_GAMMA`), as runoff's streaks do; the axis is a third
darker than the edges (`CORE`). G at 0 means no streak here. A footprint on a masonry top (below) uses R, B and A
instead; the shader reads the streak channels on walls and the footprint channels on tops.

### The drips and their footprints

Water leaves the iron at the free lower arrises of the platforms (their L-shaped outline, round the hatch too) and of
the stringers, and falls straight down. Drops are cast every 2 cm along those edges, each carrying its share of the rain
its member catches on its upper faces (their area facing up, times the rain it takes), spread over its drip edges -- a
stringer's evenly, a platform's more toward the side its deck falls to ("One at a time"):

| drip edge | length | catch | where the drops land |
|---|---|---|---|
| a floor-4 platform | 5.81 m | 1.61 m2 | the floor-3 platform (294 drops): its front top rail, its deck's edges |
| a floor-3 platform | 5.81 m | 1.23 m2 | the floor-2 platform (270); the pavement through its hatch (20 to 24); 4 on masonry |
| a floor-2 platform | 5.81 m | 1.21 m2 | the ground floor's crown (170 to 184), the pavement (108 to 122) |
| a stringer | 7.52 m | 0.04 to 0.05 m2 | the platform and the treads under its flight (376 to 378) |

A drop that lands on the ironwork rusts the face it lands on: within `FP_EDGE` 3 cm of an edge it widens that edge's
band, elsewhere, or on a face narrower than 8 cm (a rail's top), it rusts the whole face. So the upper platform's front
edge drips its whole length onto the front top rail below, whose top rusts from end to end, and its back and side edges
drip onto the lower deck's edges. A drop that lands on masonry is painted as a footprint on the top it lands on: per
texel column its catch (R) and the band of depth the drops fell in (A its centre, B its half-depth, with 1.5 cm of
splash), which the shader reads on surfaces facing up. Under each lowest platform that is a rust-brown U on the ground
floor's crown (6.29): the drip line of the platform's back edge and the two of its sides, as far out as the crown
reaches; a few drops fall past it onto the crown's lower steps and the string course. 8 footprints, 8 marks. The drops
that pass everything land on the pavement, which belongs to the render scene, not to the layer, and is left as it is.
Each U is heavier toward its own platform's low side: along its back line under stair 2463 it runs from 0.82 at the
west end to 0.41 at the east, under 2464 from 0.51 to 0.84 (both were 0.74 all along); its sides stay full.

### The iron's own rust

The ironwork's rust is not in the atlas: it lies on the ironwork's own mesh, as attributes the worn block carries per
face corner (`apply()`, on both stairs' meshes): `wear_rust` (the layer's `Attr`, the face's rust all over) and six
linear fields in two vectors, `wear_rust_e` and `wear_rust_f`: a band along each of the face's four edges and, on a
platform's faces at a fixing, a diamond round that corner. A band's field is p - d / R, d the distance to its edge (or,
for a diamond, the sum of the distances to the corner's two edges): linear over a planar face, so the renderer's
interpolation returns it exactly anywhere on the export's plain boxes, and the shader takes smoothstep(0, 1, field),
full to (p - 1) R from the edge, gone at p R. Each face edge is sorted by what it is:

| edge | how it is found | band (peak p, gone at) |
|---|---|---|
| joint | the member ends against another along the whole edge: three probes 3 mm past it all land inside another member (a rung's end in its rail, a post's top in its rail) or find another member's surface just beyond, facing back at it (a baluster's end under its rail, a tread's end at its stringer) | 3.0, 4 cm |
| wall | a rear member's end at the back plane, round one of its fixings | 4.0, 6 cm |
| upper arris | the edges of a face turned up, the top edge of a vertical face | 1.4, 1.2 cm, at most a fifth of the face |
| drip edge | the edges of a face turned down, the bottom edge of a vertical face | 1.8, 1.8 cm, at most a quarter of the face |
| vertical arris | the rest | none: it sheds its water |
| interior | the member's own face continues past it in the same plane (the platform's L is three quads) | none |

An edge that runs along a bar's length (its principal axis) is never a joint, and a member that only runs past or
beside another (a stringer crossing a baluster, a baluster 4 mm from a post) is not joined to it. An arris's peak is
scaled by the rain its member takes, and a downhill arris (a stringer's, a handrail's) keeps a third of it (`SLOPE`):
it sheds. The drips that land along an edge add to its peak (`FP_EDGE_GAIN` 1.5), those inside a face to its rust all
over (`FP_FACE_GAIN` 0.8). A face turned up holds standing water: `A_UP` 0.45 times the rain all over it. The rear end
of a rail at its fixing is rust all over, as far as its fixing has gone. Vertical faces keep their paint but for their
edges. Those are the geometry's measure: every band and every face's rust all over is also scaled by its member's
paint, a joint's band by its own joint's state and a fixing's band and diamond by the fixing's ("One at a time").

The rain a member takes is 565's wind-driven rain (every inclination and azimuth of its model, from the street side),
cast from the member's upper faces against the whole block and the ironwork itself: the share that reaches them, and the
rust scales with `WET_FLOOR` 0.40 + 0.60 x that. The top platform takes 0.87 of it, the lower ones about half, under
the platforms above: the upper stairs rust more. 8.8% of stair 2463's area and 9.2% of 2464's is rusty past half (tops
11.8% and 12.2%, vertical faces 7.4% and 7.9%, undersides 8.0%): the rails' tops under the drip lines, the platforms'
edges, the open joints. Before the rework both stairs had 11% (tops 15%, vertical faces 9%, undersides 11%).

### One at a time (rework 2026-09-23)

The user, reviewing the finished layer on 2026-09-23, rejected identical repetition as the opposite failure of noise:
the pigeon marks stood at the same place in every window, and every other feature was to be checked for "pattern like
results". This one had them. The two stairs are one mesh placed twice, and every fixing, member and joint on them is the
same shape, so the rules above stamped the same rust everywhere: the two stairs' band fields were byte-identical, the 24
streaks were four identical chains down the stairs' margins (the same stain and run at every floor, W and E, on both
stairs), and every baluster carried the same tick of rust at its head and at its foot, a dotted line along every
railing (`rework/rust/audit/`). What makes one fixing or joint differ from the next on a real fire escape is what the
model does not carry -- a fixing whose joint with the wall has held and one that has opened, a member repainted and one
left, a crevice the paint has bridged, a plate set a few millimetres out of level -- so each draws its own, within
bounds, from the sha256 of `"rust:"` and its own name, two bytes to a uniform, as runoff does: a rebuild draws the same
values, and nothing drawn for one moves when another changes. A range is drawn as the mean of two uniforms, the middle
likelier than the ends. 1 is the geometry's measure, what every one had before.

| what | seeded by | draws |
|---|---|---|
| a fixing's water: the share of its member's water it lets through | its anchor's id, `anchor:2463:4W:rail` | sound `SOUND_P` 40% of the time, `SOUND` 0 to 0.12; otherwise `LEAK` 0.35 to 1.50 |
| the rust that water carries | the same | `LOAD` 0.80 to 1.15, the stain's value only |
| how far down the wall it carries it | the same | `STRETCH` 0.60 to 1.50, the e-fold only |
| how fast the film spreads below it | the same | `FAN` 0.60 to 1.60, times `SPREAD` |
| the rust round the fixing itself | the same | `HALO` 0.50 to 1.40, times k, never past 1 |
| a member's paint | `member:<stair>:<member index>` | `PAINT` 0.55 to 1.30 |
| a joint's crevice, sealed or open | `joint:<stair>:<i>:<j>`, the two members it joins | sealed `JOINT_SOUND_P` 40% of the time, 0 to 0.30; otherwise `JOINT_OPEN` 0.45 to 1.50 |
| a platform's fall | `platform:<stair>:<floor>` | toward any side, and `FALL` 0.30 to 1.20 |

A fixing's water sets its streak as the geometry did, through k, its square root (as a sill's length sets runoff's):
the stain is `AMP` x rain x k x load, the e-fold `EFOLD` x k x stretch, the width at the fixing `W0` x k, the widening
`SPREAD` x fan, and the halo round the fixing k x halo of its most (`HALO_W`, `HALO_R`, `UP`), never past it: 569 keeps
its bloom off the most. A fixing that lets through less than `WATER_MIN` 0.06 sheds no streak: its marker stays, with
no mark and no path. Every
streak keeps its fixing's axis: the rail's end and the platform's corner below it share a column, and where their pads
meet the mask's axis channel is combined by max, so a streak shifted to one side would kink the halo under it.

The iron round a fixing rusts with it: its band and its plate's diamond are times `WALL_FLOOR` 0.40 + 0.60 k (a sound
fixing's crevice still holds some water), and a rail's rear end rusts all over to its paint times that, at most 1.
Every band on a member and its rust all over are times its paint, and a joint's band is times its joint's state as
well, the drips that land along an edge added on top of that. One draw serves a joint whichever member's band it is, so
the two rails meeting at a corner show the same state; 19 of the 249 member ends that carry a joint band per stair (a
corner post under two rails, a tread's end between a handrail and a post) touch two members and show two states, one
per face. A platform's deck falls toward one side: each drop off its drip edges carries its share of the catch times
exp(fall x), x its place along the fall from -1 on the high side to 1 on the low, the catch kept whole.

As built, the fixings (the draws' leak, then the streak's stain at the fixing, its width there and its run; "the sill"
and "the crown" where a ledge below takes it; a stain above 1 is held to 1 in the mask):

| fixing | stair 2463 | stair 2464 |
|---|---|---|
| floor 4 W, rail's end (13.62) | 0.63: 0.63, 2.4 cm, 0.80 m | 1.18: 1.04, 3.3 cm, 0.98 m, the sill |
| floor 4 E, rail's end | 0.73: 0.81, 2.6 cm, 0.98 m, the sill | 0.69: 0.63, 2.5 cm, 0.58 m |
| floor 4 W, platform's corner (12.61) | 1.11: 0.87, 3.2 cm, 1.25 m | sound, 0.06: 0.25, 0.8 cm, 0.31 m |
| floor 4 E, platform's corner | 1.10: 0.92, 3.1 cm, 1.43 m | 1.42: 1.16, 3.6 cm, 1.11 m |
| floor 3 W, rail's end (10.62) | 1.27: 0.90, 3.4 cm, 0.86 m | sound, 0.07: 0.18, 0.8 cm, 0.30 m |
| floor 3 E, rail's end | 0.61: 0.65, 2.4 cm, 0.98 m, the sill | 1.37: 0.98, 3.5 cm, 0.94 m |
| floor 3 W, platform's corner (9.61) | 0.45: 0.45, 2.0 cm, 0.97 m | sound, 0.01: no streak |
| floor 3 E, platform's corner | 0.68: 0.54, 2.5 cm, 1.25 m | sound, 0.05: no streak |
| floor 2 W, rail's end (7.62) | 0.76: 0.76, 2.6 cm, 0.76 m | 1.04: 0.78, 3.1 cm, 0.94 m |
| floor 2 E, rail's end | 1.20: 0.82, 3.3 cm, 1.32 m | 1.29: 0.91, 3.4 cm, 0.92 m |
| floor 2 W, platform's corner (6.61) | sound, 0.04: no streak | 0.81: 0.57, 2.7 cm, 0.31 m, the crown |
| floor 2 E, platform's corner | 0.52: 0.52, 2.1 cm, 0.31 m, the crown | 1.12: 0.66, 3.2 cm, 0.31 m, the crown |

5 of the 24 are sound: 3 shed nothing and 2 a faint 30 cm trickle. The 19 that leak let through 0.45 to 1.42 (median
1.04; 10 of them more than the geometry's measure, 4 more than 1.25). Their stains run 0.45 to 1.16, 0.77 on average
(0.69 to 0.92 before, 0.79 on average), 2.0 to 3.6 cm wide (all 3 cm before), for 0.58 to 1.43 m where they fade or a
sill takes them (0.92 and 1.23 m before) and 0.31 m where the crown does. So the wall carries 21 streaks where it had
24, 2 of them barely there, and the rest about as strong on average, each its own: the mask covers 5.96 m2, from 7.43.
Stair 2464's west margin on floors 3 and 4 is now nearly clean, where its east margin carries the two heaviest; 2463
streaks down both margins, each fixing to its own length. On the iron, the paint runs 0.59 to 1.26 on 2463 (median
0.95) and 0.56 to 1.27 on 2464 (0.90), and 102 and 98 of each stair's 256 joints are sealed, so along a railing a
baluster's head or foot is clean, lightly or heavily rusted in no order: along stair 2463's third-floor front the head
joints draw 0.24, 1.26, 1.14, 1.15, 0.93, 0.06, 0.05, 0.94 and so on. The platforms fall toward 178, 280 and 80
degrees on 2463 (floors 2, 3 and 4; 0 is east along the face, 90 toward the street) and toward 4, 305 and 350 on 2464,
by 0.63 to 0.98. `AMP`, `EFOLD`, `W0`, `SPREAD`, the halo, the bands and the look are unchanged: a fixing whose draws
are all 1 sheds the streak it shed before.

### The look

On masonry the stain is a filter, not a paint: the colour goes `AMOUNT` 1.0 x the stain of the way to itself times
`FILTER` (0.58, 0.36, 0.22), a warm filter that darkens and reddens the brick and turns the grey mortar orange-brown,
the mortar joints taking `JOINT_HOLD` 30% more, and the roughness goes to at least 0.85. The brick's pattern stays under
it and its normal map is untouched. Walls only (tops and soffits take the footprints' reading, never a streak's). On the
ironwork the paint fails: where its rust passes from `LOSS` 0.20 to 0.55 the surface turns from the black paint to rust,
thin rust (`RUST_DARK`, a dark brown) turning to bare oxide (`RUST_LIGHT`, an orange-brown) as it thickens, matte
(0.92) and no longer metallic -- rust is an oxide, a dielectric -- which is why the layer now routes Metallic on metal
(below). Metal only, and only where the attributes are: the storefront frames and the portal's bronze keep theirs.

### Calibration

Measured in rendered pixels on the full-size evidence stills at the scene's defaults: the linear luminance of a box on
the streak's core with the rust on, against the same box with `wear_rust=0` (every other feature on in both),
`diff/calibration.json` and `diff/calibration_boxes.png`. The view is `street_anchor_streak`, from the street up at the
west margin of stair 2464 below its floor-3 platform's corner, in 3rd Street's shade:

| where | on / off |
|---|---|
| the stain round the platform corner's fixing, seen through the gap over the platform's rear edge | 0.66 |
| the streak below the platform, its first 20 cm in view; then about every 18 cm down it | 0.72; 0.78, 0.85, 0.90 |

The reference is 564's own streaks under the sill ends on 3rd Street in shade (0.64 in their top 20 cm, 0.76 from 0.2 to
0.5 m): a rust streak from a fixing reads as strongly as a dirt streak from a sill end, narrower (3 cm against 7) and
orange-brown rather than grey, fading within a metre -- narrow and moderate, a maintained building in a dry climate. No
photograph shows the Bradbury's own fire escapes close enough to measure: the 1960 HABS corner has them about 20 px
tall. The streaks lie in the window strips' recessed margins, in the shade of 3rd Street and of the platforms, behind
the side railings, whose balusters stand in the fixings' own plane, and each platform hides the wall above it from the
pavement: from the street they are narrow darker lines, plainest below each platform's corner. The debug view and the
diagnostic render with the ironwork taken out (`anchor_streak_no_ironwork_*`) show them whole. On the ironwork the rust
reads plainly against the black paint: 11% of its area was rusty past half, the rails' tops under the drip lines, the
platforms' edges and the joints. `AMP`, `EFOLD`, `FILTER` and `AMOUNT` carry the wall's calibration, `BAND`, `A_UP`,
`LOSS` and the rust colours the iron's; `DEFAULT_STRENGTH` stays 1.0. The strength scales the stain on the masonry and
widens the bands on the iron (their fields are multiplied by it), so 0 is off and 2 twice the paint loss.

That calibration is the geometry's measure, and the rework left it as it was: a fixing whose draws are all 1 sheds the
streak measured above. The calibration view's own fixing, the floor-3 platform's west corner on stair 2464, now draws
as sound and sheds nothing, and the rail's end above it a faint 30 cm trickle; the fixings that leak stain the wall 0.77
at the fixing on average against 0.79 before, so the measured strength holds on average, from a fixing that is nearly
clean to one a little heavier than before. The iron is a little cleaner: 8.8% and 9.2% of the two stairs' area is rusty
past half, against 11%, since two joints in five are now sealed.

### The debug view

Orange: the stains on the masonry at full colour from a quarter of their most (`DEBUG_GAIN` 4), the streaks and the
footprints, and the ironwork where its paint is going. An octahedron marks each anchor, on the masonry behind its
fixing, with a short tube along the fixing from the iron to the wall; a square tube runs round each platform's drip
edges and along each stringer's. The streak's own path is not drawn down it: the tube would hide a stain barely wider
than itself, which the debug colour shows. `wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0`
shows the rust alone. Since this feature the debug view's clay is matte on metal too (`Metallic` 0), so a mark on the
ironwork reads in its own colour. A sound fixing that sheds nothing keeps its octahedron and has no tube (the tube is
its streak's path): 24 octahedra, 21 tubes. The debug colour is full from a quarter of a stain, so it shows where the
streaks lie and how far they run more than how strong each one is; the build's log lists every fixing's draws.

### Published for the features that follow

`ctx.field("rust", key)` for a feature that NEEDS rust (569 blooms round the anchors, where water gets into the wall):

- `anchors`: every fixing, `dict(id, fire_escape, member, anchor, floor, side, facade, s, z, d_iron, d_wall, gap, wall,
  wall_class, rain, leak, sound, wet)`: where it is (s, z on face `facade`; `d_wall` the masonry's surface it is fixed
  into, `d_iron` the back plane), what it fixes (`anchor` rail or platform), what is behind it (`wall`, `wall_class`),
  the rain its member takes (`rain`), the share of that water the fixing lets through (`leak`, and `sound` if it drew as
  sound) and so the water it lets into the wall: `wet` = rain x leak, at most 1 (before the rework `wet` was the rain).
- `streaks`: the streak of every fixing that sheds one (21), `dict(mark, source, facade, axis, z_top, z_stop, amp,
  efold, width, spread, halo, stop)`, each with its own `amp`, `efold`, `width` (at the fixing), `spread` (per metre)
  and `halo` (the share of `HALO_W`, `HALO_R` and `UP` it reaches, at most 1).
- `drips`: every drip edge, `dict(id, fire_escape, member, floor, facade, length, catch, drops, landed, fall)`; `fall`
  is a platform's, `dict(toward, strength)` (degrees in the face's plane, 0 along s, 90 toward the street), None for a
  stringer.
- `footprints`: every footprint on masonry, `dict(mark, source, onto, facade, s0, s1, z, d0, d1, amount, catch, drops)`.
- `iron`: per stair its members, faces, rear members, anchors, back plane, the count of each edge kind, the rain it
  takes, its members' paint (`min`, `median`, `max`), its joints (`n`, `sealed`) and the share of its area rusty past
  half.
- `field`: `dict(res=0.04, z0, data, atlas, note)`, the masonry stains (the mask's R), max-pooled to 4 cm, float16,
  rows from z0 up.

For 569: the wall is wet round every fixing that leaks, and the water enters it there; bloom below each anchor's
`(s, z)` on the masonry at `d_wall` (the sill's front on floors 3 and 4, the strip's panel elsewhere) as wet as its
`wet`, and read `field` or `streaks` to keep off the rust itself. The rework changed 569 with no change to its code: its
blooms round the fixings into brick (16) follow each fixing's water, 0.03 to 1.00 where they were 0.69 to 1.00, so a
sound fixing has next to none; 3 of its 8 fixings into sills (stair 2464's floor-3 corners and its floor-4 west
corner, all sound) no longer wet their sill past the runoff's own water, so it has 633 sources where it had 636; and it
keeps its bloom off each streak as the streak is now drawn. Its mask's depth and course channels are byte-identical,
and its amount and e-fold channels changed only within the two stairs' strips (3,387 and 6,103 texels).

### What it changed in the framework

Backward compatible: `wear/nodes.py` routes a sixth state, **Metallic**, through the layer on the metal class only
(`STATE`, `wear_material`'s routes, `build_layer`'s mix), because rust turns painted iron into an oxide, and "rust" on a
0.7-metallic surface reads as copper. Off, a mix by 0 returns the input exactly; a feature that does not touch it passes
it through; the debug view's clay sets it to 0. `wear/registry.py` lists `rust`. The probe, runoff, soiling, washed and
street grime masks build byte-identically (`37806c0b...`, `4fa13d0c...`, `6517dd79...`, `6c9963ea...`, `16d42806...`),
the rust mask is the same on a rebuild (`a1865e1b...`), and the worn block keeps 2287 objects (2275 and twelve markers).

The rework (2026-09-23) changed nothing outside `rust.py`. Every other feature's mask and cache builds byte-identically
but efflorescence's, which reads rust; the rust mask (`f3437ed7...`) and cache are the same on a rebuild; the worn block
keeps its 2697 objects, and object for object against the frozen state before this review pass only the two stairs,
the rust and efflorescence markers and the markers of the features reworked before it differ.

### Evidence

In `tests/artifacts/screens/bradbury_wear/rust_stains/`: `<view>_off_on_debug.png` (rust off | on at its default |
the debug view with the rust alone, 50%) for `hero_3q`, `st_corner`, `medium_fire_escape` (stair 2464 from across 3rd
Street, a little above), `closeup_anchor` (the rail's end fixed into the east margin at floor 4, the platform's corner
below it and the streak between), `closeup_platform_above` (the floor-3 platform from above: its rails' tops rusted by
the drips of the platform over it, its deck's edges, the joints) and `closeup_platform_below` (the floor-2 platform
from the street: the drip edges and the balusters' feet); `street_anchor_streak_off_on.png` (the calibration view);
`anchor_streak_no_ironwork_off_on_debug.png` (a diagnostic: the west margin of stair 2464 at floor 3 with the fire
escapes taken out of the render, the streak whole); `renders/` (the full-size stills, and `<camera>_wear_off.png` for
all five cameras); `diff/` (off against on, x8, with the numbers as json; `summary.json`; `calibration.json`);
`poses.json`. Off against on, mean 8-bit levels over the frame and the share of pixels moved more than 2: `hero_3q`
0.025, 0.21%; `st_corner` 0.017, 0.14%; `medium_fire_escape` 0.30, 2.8%; `closeup_anchor` 0.75, 6.9%;
`closeup_platform_above` 0.95, 9.5%; `closeup_platform_below` 0.40, 3.9%. The fire escapes are small in the two street
cameras' frames, so the rust barely moves them.

The off switch still renders as before the layer: the worn scene with `wear=off` against the pre-wear renders
(`series/final/before/`), mean levels and share of pixels off by more than 2, `hero_3q` 0.0135, 0.004%; `st_corner`
0.0283, 0.047%; `st_along` 0.0074, 0.008%; `st_up` 0.0084, 0.006%; `st_portal` 0.0143, 0.020% (the noise floor is
0.0067 to 0.0310). With `wear_rust=0` the canonical scene renders as 567 left it: against 567's own stills, `hero_3q`
0.0069 and `st_corner` 0.0061 mean levels.

The rework's evidence is in `tests/artifacts/screens/bradbury_wear/rework/rust/`. `audit/` holds the state it found:
the same anchor close-up on both stairs, identical; the decoded streaks, four identical columns. Then, each on both
stairs, before this review pass and after it (the "before" is the frozen `wear_snap_rework_before`, whose soiling and
runoff predate their own reworks): `closeup_before_after.png` and `closeup_railing_crop.png` (568's `closeup_anchor`
pose: the dotted row of identical ticks under the top rail broken up, each baluster's head its own),
`medium_before_after.png` (`medium_fire_escape`), `above_before_after.png` (`closeup_platform_above`),
`street_before_after.png` (`street_anchor_streak`) and `wide_before_after.png` (both stairs from across 3rd Street);
`closeup_off_on_debug.png` and `medium_off_on_debug.png` (stair 2464 now: off | on | debug); the streaks with the
ironwork taken out and the rust alone: `streaks_heat_before_after.png` (the rendered stain against no wear at all, x8:
eight identical streaks per stair before, each its own after, and stair 2464's floor-3 west margin clean),
`streaks_debug_before_after.png`, `streaks_no_ironwork_before_after.png` and `streaks_margins_before_after.png`;
`mask_streaks_before_after.png` (the mask decoded at 5 mm, the streaks as the shader cuts them); `elevations/` (the
rust on 3rd Street at 5 cm, before and after); `downstream/` (569 alone round the fixings, before and after);
`renders/` (the full-size stills; `off/` the worn scene switched off on the five cameras); `diff/` (x8 heat maps and
json); `poses.json`. Before against after, mean 8-bit levels and the share of pixels moved more than 2 (the soiling
and runoff reworks included): `closeup` 0.38, 6.0% (2464) and 0.38, 5.4% (2463); `medium` 0.21, 3.5% and 0.17, 2.0%;
`above` 0.48, 10.4% and 0.31, 3.6%; `street` 0.19, 2.6% and 0.16, 1.6%; `wide` 0.25, 4.0%. Off against on at the
default, stair 2464: `closeup` 0.57, 5.5%; `medium` 0.31, 3.6%. The worn scene switched off against the pre-wear
renders: `hero_3q` 0.0165, 0.006%; `st_corner` 0.032, 0.058%; `st_along` 0.0070, 0.006%; `st_up` 0.0060, 0.001%;
`st_portal` 0.016, 0.024%, the noise floor as before.

## Efflorescence below trim (AI 569)

`wear/features/efflorescence.py` (`wear_efflorescence`, pink in the debug view): the faint white salt bloom brickwork
shows just below the stone and terracotta trim set into it. The Brick Industry Association's Technical Note 23A names
caps, copings, sills and lintels as trim that "may contain soluble salts": water carries them out of the trim into the
brick below, where they crystallise on its face as it dries. The ICOMOS-ISCS glossary adds that efflorescence comes from
the material itself, unlike the deposits the air brings, and that it follows the evaporation front. Los Angeles is dry,
so the bloom is faint. Every mark has a source found on the model (a place where water gets in under a trim's lower
edge, a fire escape's fixing) and runs down the wall from it; its lower boundary is drawn on the brick's own courses;
nothing is placed by noise, and the mask is byte-identical from one build to the next. Since the rework of 2026-09-23
it blooms at a minority of the places where water could get in, each bloom its own ("One site at a time", below): most
trim shows none. Since the critique of 2026-09-24 each bloom is a bell hanging from its leak, a wide bloom is a faint
one, one wet stretch shows one bloom, and the salt comes out under the deposits instead of lifting a soiled band back
toward clean ("Its outline and its strength", below).

```
blender -b -P wear_layer.py -- features=efflorescence                    # its mask alone (about 6 s), the rest cached
blender -b -P render_wear.py -- wear=on wear_efflorescence=0 view=st_up  # off; 1 is the calibrated default
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 wear_rust=0 view=st_corner
```

### The sources

The feature casts the facade on 2 cm texels as runoff does (its `Elevation`, the fire escapes looked through), recording
each texel's material as well, where 565's published 5 cm `front` shows trim over brick. An edge column is a texel of
trim (terracotta or stone) standing directly over a texel of brick, set into it: the trim's front between 3 cm behind
the brick and `DRIP_MAX` 0.35 in front of it (the band's soffit is 0.25 deep), the brick on the wall's level courses
(below), and the brick running on at least `MIN_DROP` 0.10 under the edge, so a sliver of wall caught right under the
band's edge beside a column's capital (64 columns) is not one. Columns of one trim family whose edges stay within 3 cm of
each other make a run; its edge's height is settled by a ray straight up from the brick to the trim's underside. Each
run is split into its sites, the places along it where water could get into the brick (next section), and only a site
that leaks is a source.

| kind | on the model | runs | length | its sites | wet (median) | bloom |
|---|---|---|---|---|---|---|
| window sill | `sill_*` on floors 3 and 4 (their undersides at 9.54 and 12.54), over the spandrel's brick: the window strip's recessed panel, or the wall on the raised stretches | 78 | 218.3 m | its two ends (156) and its bed (78) | 0.51 at an end | 10 ends, no bed |
| band 4-5 | the underside of `ge_cornice45_bottom` (15.63) between its brackets and capitals; on the raised pavilions also `ge_cornice45_top` (16.48), which sits there on the brick | 224 | 185.1 m | 294 units | 0.27 (0 under the top cornice, which 564 does not shed from) | 7 |
| bracket's foot | each `ge_bracket45*` console's foot (15.29) | 186 | 19.5 m | 186 | 0.47 | 6 |
| column capital's foot | each `ge_capital.*` under the band, over its brick column (15.24) | 33 | 16.0 m | 33 | 0.36 | 2 |
| springing capital | each `ge_capital5*` at the top floor's springing (17.73) | 42 | 14.8 m | 42 | 0.36 | 3 |
| impost course | the underside of `impost_course5` (17.73), over the top floor's piers | 44 | 77.8 m | 44 | 0.26 | 3 |
| crown's base | the underside of `ge_crown_moulding` (19.10), round the whole block | 5 | 176.4 m | 147 units | 0.64 | 6 leak, 5 bloom (one joins its neighbour's) |
| fixing into brick | AI 568's anchors on the window strip's brick panel: the side rails' ends on floors 2 to 4, the floor-2 platforms' corners | | | 16 | 0.71 | 3 |
| fixing into a sill | AI 568's floor-3 and floor-4 platform corners, fixed to the sills' fronts: wetter brick under the sill there | | | 8 | 0.32 | 1 |

The archivolts over the top floor's arches stand over the arch rings (5,218 edge columns, 104 m): the rings are laid
round the arch and their courses are not level, and the bloom's lower boundary is drawn on level courses, so the rings
are left out. 612 runs of edge and 24 fixings make 1,004 sites; 41 leak, and one of them joins its neighbour's bloom:
40 sources, 40 marks, 40 paths (636, 636 and 1,082 before the rework, 41 of each before the critique); about 6 s and
1.28 million rays.

### One site at a time (rework 2026-09-23)

The user, reviewing the layer on 2026-09-23, rejected identical repetition as the opposite failure of noise (the pigeon
marks stood at the same place in every window) and asked for every feature to be checked for "pattern like results".
This one was the plainest case: every edge above was a source, and the same pale band lay under all 78 sills, under
every bracket's and capital's foot and along the whole band, impost and crown, 636 sources stamped alike (the render's
off-against-on difference, `rework/efflorescence/audit/third_wide_effl_off_vs_on_x8.png`, is one identical line under
every sill of 3rd Street). Real efflorescence is patchy between elements. Salt needs water inside the wall to carry it
out, and water gets in at a few places only -- a sill's joint with its jamb that has opened, a bed joint under a sill
whose drip has failed, an open joint between two units of a course, the hole round a fixing -- while most trim stays
sound and the brick under it shows nothing. Which it is, the model does not carry. So each run is split into SITES,
the places where water could get in, and each site draws from its own seed whether it leaks at all and, if it does, its
own bloom (`site_draw`: the sha256 of `efflorescence:` and the site's key, two bytes to a uniform; a range is the mean
of two uniforms, the middle likelier than the ends). A rebuild draws the same values, and nothing drawn for one site
moves when another changes. Noise inside a mark stays out, as before.

| site | seeded by | where its leak (the bloom's deepest point) lies |
|---|---|---|
| a sill's end: its joint with the jamb, where 564's water off the window gathers | `sill_end:<sill>:<L\|R>` | within `END_IN` 0.06 of 564's stream from that end |
| a sill's bed: water tracking back under a sill whose drip has failed | `sill_bed:<sill>` | anywhere along the sill that keeps its bloom, `BED_SHARE` 0.55 to 1.00 of the sill's length, on the sill |
| a bracket's, a column capital's or a springing capital's foot | its kind, face, object and foot's middle | on the part of the foot 564's stream leaves over (the middle third of a foot that sheds none) |
| the impost over one pier | `impost:<face>:<s0>:<s1>` | anywhere along the pier's middle three fifths |
| a unit of the band, the crown or any other course: a run in lengths of about `UNIT` 1.2 m, the terracotta's units, whose joints are what open | its kind, face, object, height and the unit's start | anywhere along the unit |
| a fire escape's fixing, into brick or into a sill | `fixing:<568's anchor id>` | at the fixing |

A site leaks with the chance `SITE_P` of its kind where it is wettest, and `LEAD_FLOOR` 0.25 of that where it is dry,
the smoothstep of its water over 0.10 to 0.90 between (`lead`): the water is 564's published deposit just under the
edge, over the site (at a sill's end over 10 cm either side of its stream; a sill's bed takes the mean of its ends), or
the water 568 lets in through a fixing (`wet`; 0.8 of it into a sill). So the wet paths lead -- a sill end that sheds
564's heaviest stream is four times as likely to leak as one that sheds nothing -- and still most sites stay sound. A
fixing has no floor: 568 has already drawn the water it lets in, and one it drew as sound lets in none. A site that
leaks draws its bloom:

| draw | bounds |
|---|---|
| the amount of salt: times the geometry's `A_BASE` + `A_WET` x wet (the edge's water, then the runoff's down the wall, as before) | `LEAK_AMOUNT` 0.55 to 1.15 |
| how far down it reaches: times the e-fold | `LEAK_REACH` 0.70 to 1.35 |
| its half-width along the edge, the mean of its two sides | `HALF_W`: a sill's end 0.08 to 0.22, a bracket's foot 0.05 to 0.14, a column capital's 0.12 to 0.34, a springing capital's 0.08 to 0.18, the impost 0.15 to 0.50, a band unit 0.15 to 0.45, a crown unit 0.25 to 0.75, a fixing 0.06 to 0.14 m |
| where its leak lies | as in the table above, uniform |
| how far it reaches to either side of the leak (since the critique) | (1 -+ `ASYM` 0.45 x a uniform from -1 to 1) x its half-width: it leans |
| how round its lower boundary is | `ROUND` 0.60 (a broad, rounded bottom) to 1.40 (a pointed one); 0.35 to 1.25 before the critique |

Across its width a bloom is a bell hanging from its leak (since the critique of 2026-09-24; before it, whole to 0.65 of
its half-width and fading to its ends only there, which drew a rectangle): the wall is wettest under the leak, so the
bloom is deepest and strongest there, and its lower boundary, still stepping down the courses, comes up a course at a
time to meet the trim on either side and leans toward the leak ("Its outline and its strength", below). It spreads
through the wall past its own trim's columns onto brick standing within `DEPTH_TOL` 3 cm of its own and on the same
courses, walked down from its edge: a sill's end onto the flush wall beside it on a raised stretch, a band's unit past
a bracket onto the next run (the bracket's own columns are terracotta), never onto a pier standing forward of the panel.
Where two blooms meet, each texel takes the one that blooms more there as its joints take it.

As built (the build prints every bloom, `efflorescence bloom ...`): 1,004 sites, 45.7 blooms expected, 41 drawn, 40
blooms (one crown unit joins its neighbour's, below). The amount is at the leak, with the width share of the critique.

| site | sites | chance to leak | expected | bloom | amount | its sides from the leak | joints reach |
|---|---|---|---|---|---|---|---|
| sill's end | 156 | 0.025 to 0.100 | 9.6 | 10 | 0.50 to 0.89 | 0.07 to 0.22 m | 0.17 to 0.35 m |
| sill's bed | 78 | 0.010 to 0.038 | 1.9 | 0 | | | |
| fixing into a sill | 8 | 0 to 0.43 | 1.5 | 1 | 0.94 | 0.12, 0.06 m | 0.26 m |
| bracket's foot | 186 | 0.020 to 0.059 | 8.0 | 6 | 0.43 to 0.72 | 0.04 to 0.18 m | 0.19 to 0.30 m |
| column capital's foot | 33 | 0.030 to 0.065 | 1.5 | 2 | 0.34, 0.39 | 0.16 to 0.32 m | 0.16, 0.20 m |
| springing capital | 42 | 0.025 to 0.055 | 1.8 | 3 | 0.60 to 0.64 | 0.06 to 0.21 m | 0.24 to 0.26 m |
| band unit | 294 | 0.018 to 0.033 | 6.9 | 7 | 0.29 to 0.50 | 0.13 to 0.47 m | 0.16 to 0.26 m |
| impost | 44 | 0.035 to 0.084 | 2.1 | 3 | 0.43 to 0.49 | 0.20 to 0.43 m | 0.19 to 0.29 m |
| crown unit | 147 | 0.049 to 0.057 | 7.3 | 6, 5 blooms | 0.33 to 0.49 | 0.20 to 1.37 m | 0.27 to 0.34 m |
| fixing into brick | 16 | 0 to 0.45 | 5.3 | 3 | 0.28 to 0.35 | 0.05 to 0.13 m | 0.23 to 0.35 m |

By face: 3rd Street 14 (4 of them at the fire escapes' fixings, 3 under the crown), the chamfer 3, Broadway 7, the
north face 9, the west face 7. One sill end in sixteen blooms, one bracket's foot in thirty; no two blooms are alike
(`rework/efflorescence/bloom_gallery.png` draws each one decoded from the mask as the rework left it,
`rework/efflorescence/critique_r1/bloom_gallery_*.png` each one before and after the critique). The draws left a few
coincidences, kept as drawn: the same jamb blooms on floors 3 and 4 twice (3rd Street s 27.8, Broadway s 4.6; a jamb
whose brick is wet through shows it at both sills; each bloom leans and reaches its own way), and three units of the
pavilions' top cornice leak though 564 sheds no water there (0.7 expected: that ledge takes the top floor's rain, which
564 does not model). Two neighbouring units of 3rd Street's crown leak too (s 37.1 and 38.3, above an impost and a
springing capital that bloom as well: that stretch of the top floor reads as its wettest); since the critique they show
as one bloom, not two dashes side by side. The mask covers 13.9 m2 (34,724 texels): 548.4 m2 before the rework and
18.4 m2 (46,022 texels) before the critique. Since 564's critique fix (2026-09-25) a capital sheds by its drips, each a
narrow stream: the same 40 blooms, the five at capitals now lying on the drip nearest the foot's middle, with their wet
read there (the column capitals' chance to leak 0.030 to 0.072, amounts 0.34 and 0.40; the springing capitals' 0.025 to
0.061, amounts 0.54 to 0.64), and the mask covers 13.7 m2 (34,256 texels).

### Its outline and its strength (critique 2026-09-24)

The fresh-eyes review of the reworked layer found the course units' blooms -- the crown's, less so the band's -- drawn
as pale grey-white rectangles one or two courses deep, flat along the moulding, with near-vertical ends and bright
white joints. On Broadway in the sun the crown's bloom at s 19.7 to 21.1 measured 1.12 of the brick beside it over its
first two courses (1.008 with the wear off), well past the few per cent the sill ends are calibrated to from the HABS
photo; it lifted the soiled band under the crown back toward clean, so it read as a cleaned or whitewashed patch; and
3rd Street's two neighbouring crown units, which both leaked with look-alike draws (amount 0.68 and 0.74, reach 0.26 and
0.32, half-width 0.55 and 0.63), read from the far pavement as a pair of matching pale dashes. The sill ends', brackets'
and fixings' blooms were faint and fine. Four changes, all in `efflorescence.py`:

- **A bell, not a band.** A bloom used to be whole to 0.65 of its half-width and to keep 0.30 of its depth and 0.55 of
  its amount at its ends, so the course the trim's edge cuts bloomed nearly whole across it and the ends stood as short
  vertical cuts. Now it is a bell hanging from its leak (`bell`): (1 - smoothstep(|x|)) ** power, x running from 0 at
  the leak to 1 at each end, each side as long as its own draw (`ASYM`: the two sides are (1 -+ 0.45 u) of the
  half-width), with no flat part. Its e-fold goes as the bell ** `ROUND` (0.60, a broad rounded bottom, to 1.40, a
  pointed one: at least 0.6, so the side comes up a course at a time over several centimetres rather than in a cut), so
  the lower boundary, still on the courses, climbs to meet the trim on either side and leans toward the leak; its
  amount goes as the bell ** (`FADE` 0.5 x round, at least 0.5), a little wider, so along the course the edge cuts the
  bloom fades out beyond the courses under it and comes to nothing along a slope.
- **A wide bloom is a faint one.** The water one leak lets in spreads over its bloom: a bloom whose half-width is
  wider than `W_REF` 0.18 m takes (0.18 / half) ** `W_POW` 0.5 of its amount (`spread`). As built the crown's units take
  0.54 to 0.72 of it, the band's 0.70 to 0.93, the impost's 0.68 to 0.88, the column capitals' 0.79 and 0.86; the sill
  ends 0.94 or all of it, the brackets, springing capitals and fixings all of it.
- **One wet stretch, one bloom.** Of the units of one course that leak (`COURSE_KINDS`: the band, the crown, any other
  course), neighbours at most `JOIN_GAP` 0.35 m apart (a bracket between two runs of the band) are one stretch; the unit
  that draws the most salt keeps its bloom and its side toward the other's leak reaches `JOIN_REACH` 0.55 to 0.95 of the
  way there, drawn from its own seed (`join`); the other draws none. On 3rd Street the unit at s 38.3 keeps its bloom,
  leak at s 39.25, reaching 0.36 m east and 1.37 m west toward the other's leak at s 37.41: one bloom from s 37.9 to
  39.6, deepest near its east end, where two matching dashes stood. It is the only join as built.
- **The salt comes out under the deposits, half of its lift along the brick's hue** (the look, below). The veil's lift
  is what it gives the clean brick; each channel of it is dimmed as the square root of how far the soiling, the streaks
  and the grime dimmed that channel of the clean brick (`UNDER_POW` 0.5: the crystals grow through the dirt, so they show
  a little more than the brick under it), so a bloom keeps the crown's soiled band soiled instead of lifting it back
  toward clean; and `SALT_HUE` 0.5 of the lift follows the brick's own hue (the same rise in luminance with its colour
  kept), which keeps the joints from turning blue-grey in the sun.

What did not change: which sites leak (the same 41, from the same draws), each bloom's amount, reach, half-width and
place draws (their uniforms are the rework's; the old skew's uniform now draws the lean), the profile down the wall,
the courses, the look's amounts, the mask's channels and the shader's course lookup.

Measured on full-size stills at the scene's defaults, every other feature on (`critique_r1/diff/bloom_ratios_start_after.json`):
what efflorescence adds to the linear luminance of the brick over each box, against the same still with it off, and
the box over the brick beside it on the same courses:

| bloom | box | before the critique | after |
|---|---|---|---|
| Broadway's crown (sun) | the critic's: s 19.74 to 21.14, the first two courses | +12.8%; 1.12 of the brick beside | +3.4%; 1.03 |
| | its own extent (s 20.10 to 21.12), two courses | +14.1% | +4.6% |
| | round its leak (0.4 m), two courses | +18.0% | +7.9% |
| 3rd Street's crown pair, now one bloom (shade) | both units, s 36.66 to 40.10 | +16.7%; 1.15 of the brick beside | +2.8%; 1.01 |
| | round its leak, two courses | +26.8% | +9.8% |
| 3rd Street's impost (shade) | its extent, the first 20 cm | +7.3% | +3.0% |
| Broadway's band unit (shade under the band) | its extent, the first 20 cm | +5.9% | +1.0% |
| Broadway's sill ends at s 4.6 (sun) | by the jamb, the first two courses, floor 4 and floor 3 | +8.3%, +6.1% | +5.6%, +3.0% |
| 3rd Street's `sill_1629` right end (shade) | by the jamb, the first two courses | +8.5% | +4.4% |

So a sunlit course bloom now stays within the few per cent the sill ends show, the soiled band under it stays soiled,
and the sill ends keep their look a little fainter where they lie over their own runoff streaks: the salt comes out
under that streak's deposit rather than over it. The band's units, drier (wet 0.24 to 0.32 against the crown's 0.64)
and under the band's soiled soffit, are now the faintest blooms, seen only close to. Iterating on these numbers (half
size, 32 samples, `critique_r1/it1` to `it5` and `diff/bloom_ratios_it*.json`): the salt wholly under the deposits
(`UNDER_POW` 1) left 3rd Street's crown bloom +8% at its leak and hard to see at all in the shade; a gentler dimming
(`UNDER_POW` 0.25) with a gentler width law (`W_POW` 0.35) took Broadway's crown to +5.8% over its extent and +9.9% at
its leak, past the few per cent; `SALT_HUE` moves the chroma only (0 and 0.4 give the same luminance to 0.3%), and at 0
the joints turn blue-grey in the sun.

### The level courses

The lower boundary has to follow the joints, and the joints are the brick set's, so the feature measures where they are.
The wall's brick (`PBR_bradbury_wall_terracotta_brick_tileable`) is mapped in world metres: on floors 2 to 4 its
texture's V is the world z, on the top floor (`wall__21` and the `top_panel_*` walls) it is -z + b, the texture upside
down. Its Mapping node scales by 1 / 1.26 m, and the set's height map holds 16 bed joints to a tile, 7 mm tall and
within 1.1 mm of even spacing, so the bed joints lie on level courses 7.875 cm apart, at z = (k + phase) 7.875 cm. The
phase is measured per object from its own UVs and the height map: 0.008 on floors 2 to 4, 0.792 on the top floor (158
objects). The build asserts the course and the joints' height, so a remapped brick fails loudly instead of drawing its
bloom off the joints. Here a course is a brick row and the bed joint under it. The arch rings (`PBR_bradbury_arch_ring`,
39 objects) are mapped round the arch and fit no level grid.

The shader finds the course a shading point lies in from its world z and the phase (the mask's alpha), and reads its own
mask a second time, at the centre of that course's top joint: every brick of the course, its head joints and the bed
joint under it take one value. So the bloom steps down the wall course by course and always ends at a bed joint, on
every face and every floor, at any distance, whatever the mask's resolution.

### The bloom

Per course, with t the depth of its top joint below the trim's edge (the course the edge cuts has t < 0 and blooms in
full), where a site leaks:

- the amount is its draw (0.55 to 1.15) x (`A_BASE` 0.50 + `A_WET` 0.50 x wet), times its width share (`spread`) and
  the bell across it ** (`FADE` x round, at least 0.5) (above);
- a brick's face blooms as exp(-t / e), e = `E_BASE` 0.08 x (1 + wet) m times its reach draw (0.70 to 1.35) and the
  bell across it ** round, down to the course where that falls below `CUT_FACE` 0.30;
- the joints bloom as exp(-t / (1.6 e)) (`JOINT_REACH`), down to the course where that falls below `CUT_JOINT` 0.25, and
  never more than `REACH_MAX` 0.45 m below the edge: the salts travel through the mortar and deposit there first;
- each cut comes in over its value to 1.5 times it (`CUT_SOFT`), so where a wet path widens the bloom it fades out
  sideways rather than along a line through a brick; down the wall every change still falls on a bed joint.

At a bloom's deepest point, with its reach draw at 1 (the draw stretches these by 0.70 to 1.35):

| wet | where | faces bloom to t | joints bloom to t |
|---|---|---|---|
| 0 | the pavilions' top cornice | 0.096 m: the course the edge cuts and the next | 0.18 m: about three courses more |
| 0.3 | the band's and the impost course's curtains | 0.13 m | 0.23 m |
| 0.5 | a bracket's foot, a sill's end | 0.14 m | 0.27 m |
| 0.8 | a sill's wettest ends; the crown's base | 0.17 m | 0.32 m |

Wet is AI 564's runoff: its published deposit (`field`), read at each texel, so the bloom follows a stream down and out
as it widens: under a sill's end 0.51 at the top (0 to 0.96, each end's own since 564's rework), a bracket's foot 0.47,
a capital's 0.36, the curtains of the band (0.27), the impost course (0.26) and the crown (0.64, 0.78 at most). A fire
escape's fixing (AI 568's `anchors`) lets water into the wall as well, as much as 568 drew for it (`wet`): a platform's
corner fixed to a sill's front wets the brick under that sill, 0.8 times that water, falling off as wide as its bloom
and over 0.30 m down; a rail's end or a floor-2 platform's corner fixed into the strip's brick panel wets the brick
round it, from 4 cm above the fixing and falling off over 0.20 m down (sideways, both as the bloom's bell). There is
no trim there, so the salt is the brick's own and the amount is the water's alone (its draw x 0.5 x wet). The bloom
keeps off 568's rust streaks, drawn from their published axis, width, spread and halo with 1.5 cm to spare, so it lies
beside the stain and never on it.

### The mask

`masks/efflorescence.png` is 2 cm with four 8-bit channels (41 MB of VRAM as bytes): R the amount, G the depth below the
trim's edge (-0.20 to 0.80 m: linear in z, so exact between texels), B the e-fold (0 to 0.40 m) and A the phase of the
brick's courses there. Each column of a bloom is painted over the brick it runs on, followed down the elevation as
runoff's film is (a surface standing 3 cm further out stops it, a step back of up to 10 cm is crept round, anything but
level brick of the same course grid ends it; 0.58 m at most): caught 136 columns, edge 49, length 610. The six rows
above the edge carry the site's values too, for the course the edge cuts, whose top joint lies above it; every mark is
padded two texels for the lookup's filter. Where the walk stops, the bloom stops (the shader gates on the local
amount). Where two blooms would share a texel the one that blooms more there takes it (none do as built). The mask
covers 34,724 texels, 13.9 m2 (1.37 million, 548 m2, before the rework; 46,022, 18.4 m2, before the critique).

### The look

A veil, not a paint: it lightens the brick and takes a little of its saturation, the brick's own pattern still under
it. Its lift is what it gives the clean brick (the layer's Clean Color, the surface before any deposit): half of it
toward `SALT` (0.78, 0.76, 0.72), a white a little warm with the city's dust, and `SALT_HUE` half of it along the
brick's own hue, the same rise in luminance with the brick's colour kept, since a thin film of crystals lets the brick
through (until the critique of 2026-09-24 all of it went toward `SALT`, which turned the joints blue-grey in the sun).
The salt comes out under the deposits: each channel of the lift is dimmed as the square root of how far the soiling,
the streaks and the grime dimmed that channel of the clean brick (`UNDER_POW` 0.5; the crystals grow through the dirt,
so they show a little more than the brick under it), and never takes more than the clean brick does, so a bloom keeps
the crown's soiled band soiled (laid over it at full strength it lifted the band back toward clean, a cleaned patch).
Its amount:

- on a brick's face `FACE_AMOUNT` 0.10 x the amount (at most `FACE_CAP` 0.55: the salt a wet path brings shows in the
  joints) x the face's profile x the brick's porosity;
- in a mortar joint `JOINT_AMOUNT` 0.30 x the amount x the joints' profile, so the joints turn from dark lines to
  paler ones. The joint is the layer's Joint (the brick set's own height map), and the lip of brick under each bed joint
  (`LIP` 12% of a course, found on the course grid, so under the joint on every floor, even where the texture is upside
  down) takes `LIP_SHARE` half of it: the salt spreading out of the joint;
- the porosity is each brick's own, read from its own tone as the material draws it (the layer's Clean Color): the
  lighter, less fired bricks of a wall are the more porous and take 1.45 times the bloom, the darker, harder ones 0.55
  (the set's faces run 0.195 to 0.288 in luminance, p10 to p90). So the bloom varies brick by brick with the bricks.

The roughness goes to at least 0.90 by the same amount (salt is matte); the normal map is untouched. Brick only, walls
and returns (never a top, a soffit, the trim itself, the stone, glass or metal). It stands at ORDER 240, after the
street grime and before the rust: in the chain it comes after the soiling and the streaks, and it lightens them only
as far as the salt shows through them.

### Calibration

Measured course by course in rendered pixels on the full-size evidence stills at the scene's defaults: the linear
luminance of the bloom with `wear_efflorescence` at 1 against 0 (every other feature on), over the brick faces and over
the joints apart, the joints found as the dark lines of the off still (`diff/calibration.json`):

| where | light | the course the edge cuts | 1st course under it | 2nd | 3rd |
|---|---|---|---|---|---|
| a sill's span (dry) | shade (3rd Street) | 1.17, 2.45 | 1.12, 2.38 | 1.01, 1.66 | 1.00, 1.00 |
| a sill's end by the jamb (wet) | shade | | 1.15, 2.15 | 1.14, 3.68 | 1.02, 2.61 |
| a sill's span (dry) | sun (Broadway) | 1.07, 1.97 | 1.05, 1.81 | 1.01, 1.51 | 1.00, 1.00 |
| a sill's end by the jamb (wet) | sun | 1.13, 2.80 | 1.08, 2.43 | 1.04, 2.12 | 1.01, 1.62 |
| the band, between two brackets | shade, under its soffit | | 1.20, 2.40 | 1.02, 2.56 | 1.00, 1.11 |
| under a bracket's foot | shade | 1.16, 1.15 | 1.11, 2.27 | 1.09, 2.76 | 1.01, 1.95 |
| the crown's base | shade, under the crown | 1.34, 5.4 | 1.21, 4.56 | 1.04, 2.96 | |

Each cell is the brick faces' ratio, then the joints'. The brick faces lighten a little, for a course or two; the
joints, dark lines in the brick set, turn pale for a course or two further; below that nothing changes, course for
course. The reference is the 1960 HABS photo of the Broadway bays (`loc_habs_ca0212_010`), in sun at about 3 cm a pixel
(`references/habs_ca0212_010_sills_boxes_x3.png` and `.json`): the two courses right under its sills read 0.99 to 1.03
of the spandrel's middle, 1.007 on average, once the first row, a sharpening halo off the sill's shadow, is left out. So
in sun the bloom must stay within a few per cent there on average: in the render the first two courses under a Broadway
sill average 1.08 and 1.03 over faces and joints together, faint, at the edge of what that photo resolves. As the
framework found, AgX compresses the sunlit wall, so the same salt reads about twice as much in the shade of 3rd Street,
and more again under the crown, where 565's soiling and 564's crown curtain have already darkened the brick: a white
veil shows most on dark brick, as salt does. `FACE_AMOUNT`, `JOINT_AMOUNT`, `FACE_CAP` and the profile's constants carry
the calibration; `DEFAULT_STRENGTH` stays 1.0.

That table measured the bloom before the rework, when every edge carried one. The rework left the look and the profile
as they were, so a bloom where a site leaks is measured the same way. On the rework's close-up (3rd Street, floor 4, in
shade: the right end of `sill_1629`, the one of its ends that leaks, `rework/efflorescence/diff/calibration_closeup_*.json`),
faces then the joint under each course: by the jamb, at the bloom's deepest point, 1.27, 3.19; 1.23, 2.88; 1.14, 1.97;
1.01, 1.79, and nothing below; 10 cm out along the sill 1.14, 2.19; 1.10, 2.03; 1.03, 1.56; 1.00, 1.34; 25 cm out 1.00
throughout. That is the old wet end's strength, now at one sill end in sixteen, fading sideways, where every sill used
to carry the band: the HABS photo's clean sills are what the render shows at almost every sill (on Broadway 2 ends of
28 bloom, one jamb on floors 3 and 4).

The critique (2026-09-24) recalibrated the course units against that measure: a sunlit patch must stay within the few
per cent the sill ends show. Course by course at the leak, faces then the joint under each course, before the critique
and after it (`critique_r1/diff/calibration_*.json`): Broadway's crown bloom (sun) 1.17, 3.56; 1.09, 2.48; 1.03, 2.01
then 1.09, 2.23; 1.05, 1.77; 1.01, 1.48; 3rd Street's crown bloom (shade) 1.19, 2.32; 1.04, 2.35 then 1.09, 1.48; 1.01,
1.50; Broadway's floor-4 sill end at s 4.6 (sun) 1.10, 2.39; 1.08, 2.42; 1.05, 2.15; 1.01, 1.98 then 1.07, 2.09; 1.06,
2.12; 1.03, 1.82; 1.01, 1.59. Over two courses the crown's bloom now reads 1.03 of the brick beside it in the sun (1.12
before), about what the sill ends give (the table in "Its outline and its strength").

### The debug view

Pink: the bloom at full colour from a third of its most (`DEBUG_GAIN` 3), course by course, faces and joints, so the
joints running on below the faces show. Since the rework only the sites that leak are sources: an octahedron at a point
site (a sill's end, a foot, a fixing) and a square tube along the stretch of edge a course's, the impost's or a bed's
bloom spans, just in front of the brick under it, and one thin tube per bloom, down from the edge at its deepest point
(its leak) to where its joints stop: 40 of each, where the 636 runs used to draw a tube along every sill and course
(41 before the critique; 3rd Street's joined crown bloom draws one tube along both its units). Since the critique the
pink of a course's bloom thins out along the trim toward both ends and is faint where the bloom is wide.
`wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 wear_rust=0` shows the bloom alone. In the
sun on Broadway the pink reads pale (AgX again); 3rd Street, in the shade, shows it plainly. `elevations=1` draws each
face's blooms through the feature's own `elevation()`, as its joints take them (the debug view's gain), not the brick
each mark was walked over.

### Published for the features that follow

`ctx.field("efflorescence", key)` for a feature that NEEDS efflorescence (none does yet; salts crystallising in the
joints are one of the ways mortar decays):

- `sources`: every site that leaks and blooms, `dict(id, kind, facade, s0, s1, z, d_edge, d_wall, phase, wet, amp,
  reach, half, half_l, half_r, middle, deepest, round, lean, leak, joins, object, wall)` (a fixing also its rust
  `anchor`): `s0`..`s1` the bloom's extent as laid, `amp` its amount at its leak, `reach` how far its joints reach
  there, `half` its drawn half-width, `half_l` and `half_r` how far it reaches to either side of its leak `deepest`,
  `middle` the middle of that, `lean` its asymmetry draw, `leak` its amount, reach and width shares (`spread`), `joins`
  (only where there are any) the neighbouring units whose leaks it took in; `kind` is `sill_end`, `sill_bed`,
  `bracket`, `capital`, `springing`, `impost`, `band`, `crown`, `trim`, `anchor` (a fixing into brick) or `anchor_sill`
  (a fixing into a sill). Before the rework it held every run; the critique added `half_l`, `half_r`, `lean`, `joins`
  and the width share.
- `sites`: every site, `dict(key, kind, facade, s0, s1, z, wet, p, leaks, laid)` (and `joined`, the keeper's key, for a
  unit whose leak joined its neighbour's bloom): where its leak may lie, its water, its chance to leak, whether it did
  and whether it laid a bloom of its own.
- `courses`: `dict(course, joint_half, phases, materials, note)`: the wall's level course grid, the bed joints at z = (k
  + phase) x course with the phase per `"object|material"`; a feature that works on the joints can find every bed joint
  in world z with it.
- `field`: `dict(res=0.04, z0, data, atlas, note)`: the bloom as the joints take it (0..1: the amount times the joints'
  per-course profile), max-pooled to 4 cm, float16, rows from `z0` up.

### What it changed in the framework

Nothing but `wear/registry.py`, which lists `efflorescence`. The feature reads its own mask a second time, inside its
own node group (the mask image it is given); the layer is untouched. The probe, runoff, soiling, washed, street grime
and rust masks build byte-identically (`37806c0b...`, `4fa13d0c...`, `6517dd79...`, `6c9963ea...`, `16d42806...`,
`a1865e1b...`), so do the rust attributes (568's cache is byte-identical), the efflorescence mask is the same on a
rebuild (`ee8ba631...`), and the worn block keeps 2289 objects (2275 and fourteen markers).

The rework (2026-09-23) changed nothing outside `efflorescence.py`, whose shader is untouched, and added its
`elevation()` hook. A full rebuild with nothing from the cache gives every other feature's mask and cache
byte-identically to the start of the rework; the efflorescence mask (`4e671621...`, from `a296ba59...`) and cache come
out the same from one build to the next; the worn block keeps its 2697 objects, and object for object only
efflorescence's two marker meshes differ from the start of the rework (`rework/efflorescence/diff/byte_identity.json`).
No feature NEEDS efflorescence, so nothing downstream changed.

The critique (2026-09-24) changed nothing outside `efflorescence.py` either: its build (the bell, the width share, the
join) and its shader's colour (the lift under the deposits, half along the brick's hue); the mask's channels, the
course lookup and the `elevation()` hook are as they were. Two full rebuilds with nothing from the cache give every
other feature's mask and cache byte-identically to the start of the critique fix; the efflorescence mask (`2452c80b...`,
from `4e671621...`) and cache (`b1b0a8a6...`) come out the same from a full build and a `features=efflorescence`
rebuild; the worn block keeps its 2697 objects and the worn portal its 460, and object for object only efflorescence's
two marker meshes differ (`critique_r1/diff/byte_identity.json`). The scenes link the same objects as before (2697, 21
markers, 401 geometry objects and the 400 originals they replace; 2275 with `wear=off`).

### Evidence

In `tests/artifacts/screens/bradbury_wear/efflorescence/`: `<view>_off_on_debug.png` (efflorescence off | on at its
default | the debug view with the bloom alone | for the two street cameras, the debug view with every feature, 50%) for
`st_corner` and `st_up`, `closeup_sill_3rd` (under one floor-4 sill on 3rd Street, in shade: its dry span and its wet
end by the jamb), `closeup_band_3rd` (under the band: the wall between its brackets and their feet),
`closeup_sill_end_3rd` (a sill's wet end at the jamb, closer), `closeup_sill_bway` (a Broadway sill in sun),
`closeup_crown_3rd` (the crown's base), `medium_top_3rd` (3rd Street's top floor from across the street: the crown's
base and the impost course), `medium_sills_3rd` (3rd Street's floors 3 and 4) and `closeup_fixing` (a rail's fixing in
the window strip's panel, 568's `closeup_anchor` pose; the bloom there is mostly behind the ironwork);
`hero_3q_off_on.png`; `renders/` (the full-size stills, and `<camera>_wear_off.png` for all five cameras); `diff/` (off
against on, x8, with the numbers as json; `summary.json` with the off-state checks; `calibration.json`); `references/`
(the HABS photo's sills and the boxes measured on it); `poses.json`. Off against on, mean 8-bit levels over the frame
and the share of pixels moved more than 2: `st_corner` 0.089, 1.2%; `st_up` 0.167, 2.1%; `hero_3q` 0.130, 1.7%;
`closeup_sill_3rd` 0.74, 10.5%; `closeup_band_3rd` 0.68, 10.1%; `closeup_sill_end_3rd` 0.93, 13.2%; `closeup_sill_bway`
1.27, 10.9%; `closeup_crown_3rd` 1.34, 14.3%; `medium_top_3rd` 0.43, 4.8%; `medium_sills_3rd` 0.15, 1.9%;
`closeup_fixing` 0.024, 0.2%. From the street the bloom is a faint line under each trim; close up it is the pale joints
and the lighter first courses.

The off switch still renders as before the layer: the worn scene with `wear=off` against the pre-wear renders
(`series/final/before/`), mean levels and share of pixels off by more than 2, `hero_3q` 0.0134, 0.004%; `st_corner`
0.0278, 0.046%; `st_along` 0.0076, 0.008%; `st_up` 0.0097, 0.009%; `st_portal` 0.0140, 0.020% (the noise floor is 0.0067
to 0.0310). With `wear_efflorescence=0` the canonical scene renders as 568 left it: against 568's own stills,
`st_corner` 0.0059, `hero_3q` 0.0072 and its `closeup_anchor` 0.0073 mean levels.

The rework's evidence is in `tests/artifacts/screens/bradbury_wear/rework/efflorescence/`. `audit/` holds the state it
found: 3rd Street whole, efflorescence off and on and their difference x8 (one identical line under every sill, the
band dashed at every bracket, the impost and the crown's base whole), the debug view with the bloom alone, and the top
floor and a medium view of the sills. Then: `<camera>_before_after.png` for the five cameras, `closeup_`, `medium_` and
`sills_row_before_after.png` (the whole layer before this review pass, from `wear_snap_rework_before`, and after it);
`closeup_off_on_debug.png` and `medium_off_on_debug.png` (off | on | the debug view with the bloom alone | with every
feature); `closeup_`, `medium_` and `third_wide_debug_start_after.png` (the debug view with the bloom alone at the start
of this rework and after it); `diff/<view>_efflorescence_alone_start_after_x8.png` (what efflorescence adds to the
render, |on - off| x8, at the start of the rework and after it, for the five cameras and the two poses) and
`diff/sills_row_efflorescence_alone_before_after_x8.png`; `bloom_gallery.png` (every bloom decoded from the mask as the
shader steps it, drawn 2.5 times over on a plain bond, labelled with its draws); `kinds/` (off and on under a bracket's
foot, a run of the band, a sill's end in the south-west bay, a fixing into a sill, and the crown's base at 1:1);
`crops/` (the close-up's bloom at 1:1 before, off and after; six neighbouring sill ends before and after, x2);
`elevations/` (`efflorescence_<face>_start_after.png`: each face's blooms at the start and after, both through
`elevation()`; `start/` and `after/` the layer's own images); `renders/` (the full-size stills: `before/`, `after/`,
`off/`, `start/`, `debug/`, and `wear_off/` the worn scene switched off); `diff/` (x8 heat maps, `rework_numbers.json`,
`calibration_closeup_*.json`, `byte_identity.json`); `poses.json`. The close-up is a camera at (-8.2, -20.6, 12.35)
looking at (-8.2, -17.72, 12.3) with a 50 mm lens; the medium view at (2.27, -26.0, 18.6) looking at (2.27, -17.9, 18.5),
35 mm.

What efflorescence adds to the render, off against on, the share of pixels moved more than 2 levels at the start of the
rework and after it: `st_corner` 1.16% and 0.05%; `st_portal` 0.68% and 0.00%; `st_along` 0.41% and 0.02%; `st_up`
2.03% and 0.08%; `hero_3q` 1.64% and 0.07%; the close-up 4.73% and 1.33%; the medium view 4.60% and 1.13%. The whole
layer before this review pass against after it (the earlier reworks included): `st_corner` 0.223 mean levels, 3.1%;
`st_portal` 0.426, 5.6%; `st_along` 0.272, 3.9%; `st_up` 0.399, 5.9%; `hero_3q` 0.272, 3.5%; the close-up 0.360, 4.4%;
the medium view 0.779, 10.3%. The worn scene switched off against the pre-wear renders: `hero_3q` 0.0164, 0.006%;
`st_corner` 0.0322, 0.058%; `st_along` 0.0065, 0.003%; `st_up` 0.0064, 0.002%; `st_portal` 0.0160, 0.024%, the noise
floor as before.

The critique fix's evidence (2026-09-24) is in `tests/artifacts/screens/bradbury_wear/rework/efflorescence/critique_r1/`,
the critic's own in `rework/critique_round1/fresh/`. At full size, the scene's defaults, `start` the state the fix began
from and `after` the fix: `crownE_start_after_1to1.png` (Broadway's crown bloom in the sun, the critic's pose: off, on
at the start, on after, and what efflorescence adds x8 at the start and after), `wettopS_start_after_1to1.png` (3rd
Street's crown pair, now one bloom, in shade), `wettopS_street_start_after_x2.png` (the same from the far pavement, 85
mm), `bandE_start_after_x2.png` (a band unit between two brackets), `sillsE_f4_start_after_x3.png` and
`sillS_start_after_1to1.png` (two sill ends, which keep their look), `medium_start_after.png` (the rework's medium view);
`<camera>_start_after.png` for the five cameras (every feature on, and what efflorescence adds x8, at the start and
after); `cu_crownE_off_on_debug.png`, `cu_crownE_1to1_off_on.png` (the close-up: Broadway's crown bloom from 3.2 m),
`cu_crownS_off_on_debug.png`, `medium_off_on_debug.png` and `mediumE_off_on_debug.png` (off | on | the debug view with
the bloom alone); `bloom_gallery_courses.png` and `bloom_gallery_points.png` (every bloom decoded from the mask as the
shader steps it, the start's above and the new one below over the same stretch of wall, 2.5 times over);
`elevations/efflorescence_<face>_start_after.png`; `it1/` to `it5/` (the iterations' crops); `renders/` (`start/`,
`after/` with efflorescence on, off (`_noeffl`) and the debug view with the bloom alone, the five cameras also with the
wear off, and the iterations at half size); `diff/` (`bloom_ratios_*.json`, `calibration_*.json`,
`cameras_efflorescence_alone.json`, `poses_efflorescence_alone.json`, `offstate.json` with its x8 heat maps,
`byte_identity.json`); `poses.json`. The close-up is a camera at (20.194, 5.5, 18.85) looking at (16.994, 5.5, 18.85)
with a 35 mm lens; the critic's pose, used as the medium view, at (21.994, 5.35, 18.9) looking at (16.994, 5.35, 18.9),
35 mm.

What efflorescence adds to the render, off against on, the share of pixels moved more than 2 levels before the critique
and after it: `st_corner` 0.051% and 0.018%; `st_portal` 0.001% and 0.001%; `st_along` 0.015% and 0.007%; `st_up` 0.084%
and 0.037%; `hero_3q` 0.073% and 0.024%; the critic's crown pose 1.34% and 0.56%; 3rd Street's top 1.74% and 0.46%; the
rework's close-up 1.35% and 0.61%; its medium view 1.13% and 0.29%. With `wear_efflorescence=0` the canonical scene
renders as it did at the start of the fix (mean levels 0.006 to 0.012, at most 0.003% of pixels off by more than 2, on
all twelve poses). The worn scene switched off against the pre-wear renders: `hero_3q` 0.0166, 0.006%; `st_corner`
0.0318, 0.057%; `st_along` 0.0063, 0.002%; `st_up` 0.0060, 0.002%; `st_portal` 0.0159, 0.025%, the noise floor as before.

## Edge wear and chips at street level (AI 570)

`wear/features/edge_wear.py` (`wear_edge_wear`, green in the debug view): what people, bags, carts, doors and wheels do
to the corners of the stone within their reach. The ICOMOS-ISCS glossary names both results: rounding, "preferential
erosion of originally angular stone edges leading to a distinctly rounded profile", and chipping, small pieces broken
off a block's edges. Along every convex arris of the street-level stone the pavement reaches, the stone is abraded -- a
little lighter, rougher, its edge turned round -- as much as the traffic that passes it, the height and the arris's own
share of the knocks say; and here and there a piece has come off: a real chip cut out of the mesh, fresh pale stone
inside, at one of the geometry's weak points (a joint, a plinth's corner, the ground) or anywhere along an arris within
reach of a knock. The arrises are read from the stone's own meshes and their exposure measured with rays from the block;
nothing is placed by noise. Which of the like places took a knock, how many each portal, door and corner lost and where,
and each chip's size, outline and age are drawn from seeds made of each place's own identity (the rework of 2026-09-23,
below), so the attributes and the chipped meshes are the same from one build to the next.

```
blender -b -P wear_layer.py -- features=edge_wear                  # its fields and chips (about 4 s), the rest cached
blender -b -P render_wear.py -- cam=18.00,0.30,1.25:17.22,-0.47,1.05:45                     # on, at its default
blender -b -P render_wear.py -- wear_edge_wear=0 cam=18.00,0.30,1.25:17.22,-0.47,1.05:45    # off: the originals
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 wear_rust=0 wear_efflorescence=0 wear_mortar_erosion=0 wear_pigeon=0 wear_glass_grime=0 view=st_along
```

It is the first feature that is not a mask. Its marks lie on the stone's own meshes, as attributes the shader reads (as
568's iron does), and in geometry of its own that the switch shows and hides (the framework's `add_object(...,
replaces=...)`): so it has no atlas image and costs no VRAM for one.

### The arrises

Every mesh with stone in it that reaches below `REACH_TOP` 2 m over the pavement is read edge by edge: the pier ring
(`fit_piers`) and, in the portal (read once, measured in each of its three instances), the pilasters' stepped plinths,
their shafts and panel mouldings, the portal piers, the granite step and the recess's dark stone base (17 objects). An
edge between two faces turning at least `TURN_MIN` 30 degrees, convex, is an arris; one turning 12 to 30 degrees is a facet
of a nose already rounded (the step's), worn but not rounded further. Edges are joined into lines by the pair of face
planes they lie between (two planes meet in one line), their runs merged along it, so an arris broken by the pier ring's
joint grooves is one line with a gap at each groove. 1711 convex lines; 222 are worn, because the street can reach them:

- not inside another solid (a probe 3 mm out along the arris's bisector, and a ray from it, find no solid round it: the
  portal pier's outer arris is buried in the plinth);
- not on the ground (a ledge's lower edge on the pavement) and not a joint groove's lip (a probe into the groove from
  the ledge meets the groove's opposite lip within 3 cm: the pier ring's grooves are 10 mm tall and 15 mm deep);
- open: rays leave it in at least `OPEN_MIN` 45% of its outward directions within 0.35 m (a groove's inner corner is
  shut in by its lips); an arris partly hidden (a plinth's side edge running back into the pier ring) is worn where it
  shows, its exposure 0 where it does not;
- exposed enough to wear: some point of it reaches `K_MIN` 0.06 (below), in the mean of its instances.

567's 100 corners are all among them (it lists each of the block's five corners once for each street it fronts).

### Exposure: the traffic an arris takes

The wear of an arris is its exposure, times its own draw (below: one at a time), times the height's share of the
knocks. The exposure is measured along each arris every 5 cm, from the block itself, in each instance:

| factor | what | on the model |
|---|---|---|
| traffic | the pavement's traffic along its stretch: `T_BASE` 0.45 everywhere, rising to 1 at an entrance or a block corner, where people turn, slow and carry things in and out, over `T_REACH` 2 m (e-fold) along the pavement round the block | entrances: the portals' mouths (567's step runs) and the doors, found as openings of the pier ring with a pull at hand height in them: the chamfer's (SE 0.88..3.12), the north face's (N 49.64..52.14) and the west face's (W 4.86..7.20) |
| street | how open it is toward the street: level and rising rays over the pavement side that get 1.5 m clear | 1 on a street front; 0.5 on a portal pier's side facing into the mouth behind the plinth |
| depth | how far it stands back behind the street line (the most forward stone within 0.6 m along the face at 0.3 m over the pavement): exp(-setback / `SET_E` 0.35); inside an entrance's mouth, exp(-setback / `IN_E` 1.2), where the people walking in reach it | a pier strip beside a plinth, 0.24 behind it: 0.50; the portal piers, 0.21 behind the plinths in the mouth: 0.85; the recess's base, 1.8 m in: 0.15 |
| sharpness | the turn over 90 degrees | 1 at a square corner, 0.5 at the chamfer's 135 degree corners |
| lead | Los Angeles walks on the right, so the flow nearest a facade keeps it on its right hand and runs toward the face's left end as the street sees it: each pier's right-hand arris meets it first and takes the knocks head on, the other `LEAD_TRAIL` 0.7 | block corners and entrance jambs meet flows both ways: 1 |
| orientation | an edge running with a flow is grazed, one across it struck: along the pavement `ALONG` 0.45 of it (a moulding's ledge along the facade); in a mouth the flow walks in, across the step's nose | vertical arrises and edges running back from the facade 1 |

At a height H over the pavement the knocks take (`knocks`): 0.55 at the foot (feet, wheels, brooms), all of them from
cart and knee height (0.35) to hip and bag height (1.10), none from `REACH_TOP` 2 m:

| H | 0 | 0.2 | 0.35 | 0.7 | 1.1 | 1.4 | 1.6 | 1.8 | 2.0 |
|---|---|---|---|---|---|---|---|---|---|
| knocks | 0.55 | 0.82 | 1.00 | 1.00 | 1.00 | 0.74 | 0.42 | 0.13 | 0 |

The worn arrises by their exposure (the block's 77, and one portal's 145: the three portals measure alike, within 0.01,
and each then wears them its own way):

| arrises | count | exposure |
|---|---|---|
| the doors' jambs: the chamfer's (SE 0.88, 3.12), the north face's (N 49.63, 52.14), the west face's (W 4.86, 7.20) | 6 | 1.00 |
| the block's corners: the SW, NW and NE, and the chamfer's two at half sharpness | 5 | 0.94; 0.49 |
| the piers' arrises at the storefronts, meeting the flow first | 33 | 0.26 .. 0.80, median 0.49 |
| the same, meeting it last | 33 | 0.18 .. 0.56, median 0.34 |
| a portal's plinths up their shafts (567's plinth corners): the 8 at the mouth; the outer ones, 4 leading and 4 trailing | 16 | 0.95 .. 1.00; 0.72 .. 0.81, 0.50 .. 0.57 |
| the plinths' ledge edges (the cap and its steps) | 18 | 0.61 .. 1.00 |
| the pilasters' panel mouldings, to 2 m (their rims, the facets of their quarter rounds, the lower rims' ledges) | 30 | 0.32 .. 0.83 |
| the portal piers at the mouth: their front arrises; set back into the recess, their other arrises and ledges | 8; 60 | 0.71 .. 0.75; 0.10 .. 0.75, median 0.41 |
| the step's nose (7 facets) and its top edge | 9 | 1.00; 0.42 .. 1.00 |
| the recess's dark stone base, 1.8 m in | 4 | 0.10 .. 0.13 |

### The wear: lighter, rougher, rounded

The shader reads, per face corner, the distances to the nearest `FIELDS` 2 worn arrises (`wear_edge_d`: in the face's
own plane, linear over it, so exact at any distance; for a nose facet the distance to its edge), each one's wear along
it (`wear_edge_k`: its exposure times its own draw, held within `K_CAP` 1) and the direction from it into the face, as
long as the tangent of half its turn (`wear_edge_u0`, `wear_edge_u1`: the mesh's coordinates, turned into the world per
instance). A pier's front carries its two arrises; a plinth's 4 cm cap face, which touches four, the two it wears most.
With w the wear times the knocks at the shading point:

- **the abraded band**: w times the square of a smoothstep falling from the arris to `BAND_W` 1 cm x sqrt(w) onto each
  face, most of it in the first few millimetres. The stone there goes `LIGHT_GAIN` 1.5 times lighter and 20% paler
  toward its own grey (its weathered skin rubbed off), and at least 0.85 rough;
- **the rounding**: within `ROUND_R` 5 mm x w of the arris the shading normal turns over the edge as a round's would:
  toward the arris by the stored tangent times u squared, u the share of that radius still to go, so 45 degrees at a
  square arris itself (the faces meet in a round) easing to nothing at the radius. Added to the material's own normal
  map, so its grain stays. Only materials that route a normal take it (the dressed sandstones of the pier ring and the
  portal; the granite step and the dark stone base have no normal map, and the step's nose is round already);
- **the chips' broken stone** (`wear_edge_wear`, the layer's `Attr`: on a chip's scar faces, how fresh that scar still
  is, 0.55 to 1): the stone's colour 35% paler toward a warm grey and lifted toward `FRESH_L` 0.34 in luminance (fresh
  sandstone is pale whatever its skin), by a gain held within 1.25..2.6: 1.6 times the pink portal sandstone, 2.3 times
  the darker pier stone; at least 0.92 rough; all of it as far as the scar is fresh, an old scar partly back toward its
  stone's weathered colour.

Masonry only; everything mixes from the input by the strength, so 0 hands the input on exactly. It stands at ORDER 110,
before the deposits (soiling 200, runoff 220, washed 225, street grime 230...), which lie over the abraded arrises in
proportion, so their contrast with the stone beside them stays; the washed zones' `Clean Color` includes it.

### The chips

A chip is an event: a piece knocked off an arris. The geometry says where one can come off and how often:

- **weak points**, found on the geometry. **Joints**, where a joint meets a vertical arris: the pier ring's grooves (a
  gap in the arris line, 10 mm) at 0.915 and 1.629 m (H 0.71 and 1.43), a pilaster shaft's foot on its plinth (H 0.68), a
  portal pier on its base (H 0.64 to 0.68); weakness 0.9. At a groove the chip takes the corner of the block nearer the height
  where the knocks gather (`H_PEAK` 0.75), the block above a joint below it and the block below a joint above it, three
  times in four (`TOWARD_PEAK`), and the other block otherwise. **Corners**, where three worn arrises meet: a corner of a
  plinth's stepped cap or of a portal pier's base (H 0.60 to 0.67); weakness 1. **Feet**, an arris's foot on the pavement
  or on the step; weakness 1, with 0.55 of the knocks there;
- **stretches**: every worn arris between its weak points, sample by sample (5 cm), where a cart's wheel, a dolly or the
  corner of a case can catch it; weakness 0.7 (`WEAK`), a stretch of arris being held on both sides.

Each place has a risk: its arris's wear x the knocks at its height x its weakness (x `GRANITE` 0.5 on the granite step).
The risk sets its rate of chips: none below `R_LO` 0.30, rising as a smoothstep to `RATE` 0.40 at a corner, 0.38 at a
joint and 0.22 at a foot from `R_HI` 0.95 on; along a stretch, to `KNOCK_RATE` 0.40 per metre.

The chips are counted per **element** and placed within it. The elements are each portal as a whole; on the pier ring,
each entrance's and each block corner's zone (its arrises within `ZONE` 1.5 m of the opening or of the corner, along the
pavement; the nearest wins), and the rest of each face. An element took its places' expected count (their rates summed)
times its own draw within `COUNT` 0.6..1.4, rounded up or down by one more draw (`N_CAP` 12 at most). Each chip fell on
one of its places by their rates: a weak point once at most; a stretch at one of its samples, anywhere within it, the
scar running on to each side. Then the strongest first, a chip yields to a stronger one on the same stone within
`CHIP_SPACING` 12 cm, or with its cutter against the other's.

A chip's size follows its risk: `CHIP_LEN` 1.2 to 4.8 cm along the arris and `CHIP_DEPTH` 0.4 to 1.7 cm into each face
from `R_LO` to a risk of 1, times its own size (0.70..1.40) and aspect (0.75..1.30: longer and shallower, or shorter and
deeper; x `KNOCK_SIZE` 0.8 for a knock), held within 1.0..6.0 cm and 0.35..2.2 cm. Its shape is its own:

| drawn | bounds |
|---|---|
| which face loses more: the one turned to the street, by | -0.30..0.55 (`ASYM`; on a corner chip, its two sides) |
| how that share changes from one end of the chip to the other | -0.35..0.35 (`TILT`) |
| the scar's section across the arris: a superellipse bulging a little into the stone, a shallow conchoidal fracture | 1.1..1.8 (`Q`: 1 would be flat across the corner, 2 an elliptic scoop) |
| how each end runs out along the arris: (1 - u^p)^(1/p) of its depth at u of the way | p 0.9..3.2 (`END`), drawn evenly: a pointed end, a round one, or a blunt break (a hinge) |
| from a joint or a foot, how far it runs at full depth before it runs out | 0..0.35 of its length (`PEAK`) |
| a knock's run behind its deepest point | 0.35..0.90 of its length ahead (`BACK`), the run's ends kept 20% clear |
| its facets, across and along; each facet's corner in or out by; each section's depth along it by | 2..4 and 3..5 (`ARC_SEG`, `LEN_SEG`); up to 18% (`JITTER`); up to 15% (`JITTER_ALONG`) |
| how fresh the scar still is | 0.55..1.00 (`FRESH`): a recent break, or one the weather has had for years |

A range is the mean of two uniforms (the middle likelier than the ends) unless it says evenly. The cutter is the convex
hull of those points: in sections along the arris for an edge chip (from a joint, `EXT_JOINT` 4 mm on into the groove;
from a foot, `EXT_FOOT` 10 mm under the ground), an octant of a superellipsoid for a corner chip; it reaches `MARGIN` 4 mm
outside the stone, tapering toward the arris, so it crosses the faces cleanly and a corner chip at a moulding's step does
not notch the block it sits on. One exact boolean per object with every chip's cutter (disjoint convex hulls); the scar
faces keep the stone's material and carry their chip's freshness. As built, element by element (the build prints it):

| element | expected | drawn | the chips: face and s, height over the pavement, length x depth |
|---|---|---|---|
| the 3rd Street portal (A, use 0.93) | 3.75 | 4 | the right plinth's foot (S 18.05, 0, 2.1 x 0.9 cm); two knocks up the right shaft's outer arris (S 18.11, 1.14 and 1.27, 2.6 x 0.5, 2.9 x 0.7); a knock on its panel moulding's rim (S 18.29, 1.24, 2.3 x 0.4) |
| the Broadway portal (C, use 0.95) | 3.95 | 5 | a knock on the left plinth's cap (E 14.35, 0.64, 4.4 x 1.0); the left portal pier: both corners of its base at the mouth (E 14.60, 0.67, 3.4 x 0.9 and 1.7 x 0.4) and a knock up its front arris (E 14.56, 1.07, 2.3 x 0.5); the right plinth's outer cap corner (E 18.32, 0.60, 2.4 x 0.7) |
| the west portal (E, use 1.06) | 5.81 | 6 (one knock yielded to a stronger chip 8 cm away) | both plinths' caps at the mouth (W 17.21 and 20.30, 0.60, 4.0 x 1.1, 4.2 x 1.3); the left portal pier's base (W 17.45, 0.60, 3.4 x 1.1); the right portal pier's foot on the step (W 20.07, 0.12, 3.1 x 0.8); the right shaft's foot on its plinth (W 20.36, 0.68, 2.8 x 0.7) |
| the chamfer door | 1.43 | 1 | its south jamb above the lower groove (SE 0.89, 0.71, 5.3 x 1.6) |
| the north door | 1.88 | 1 | a knock on its west jamb (N 52.14, 0.85, 4.2 x 0.9) |
| the west door | 2.42 | 2 | its south jamb above the lower groove (W 7.20, 0.71, 5.1 x 1.9); a knock on its north jamb (W 4.86, 1.14, 4.2 x 0.6) |
| the SW corner | 1.89 | 2 | on the corner pier's other arris: a knock (S 0.89, 0.74, 4.4 x 0.8) and below the upper groove (S 0.89, 1.43, 2.6 x 1.1) |
| the NE corner | 1.13 | 1 | the corner above the lower groove (E 32.65, 0.71, 4.9 x 1.3) |
| the NW corner | 0.58 | 1 | the corner above the lower groove (N 53.24, 0.71, 3.8 x 1.1) |
| the chamfer's east corner | 0.89 | 1 | the next pier's arris below the upper groove (E 0.89, 1.43, 3.0 x 0.9) |
| the chamfer's south corner | 0.08 | 0 | |
| the rest of 3rd Street, Broadway, the west face | 0.34, 0.05, 0.03 | 0 | |
| the rest of the north face | 0.17 | 1 | a small one above the lower groove (N 27.36, 0.71, 1.3 x 0.4) |

24 chips (24.4 expected): 10 on the pier ring, 4, 5 and 5 on the portals; 8 at joints, 6 at corners, 2 at feet, 8
knocks; 1.3 to 5.3 cm long (median 3.2), 0.35 to 1.9 cm deep (median 0.9), their scars 0.60 to 0.99 fresh (median 0.82).
Of the 359 weak points (231 on the pier ring, 128 over the portals) and the 455 stretches between them, 23 took chips
(one stretch two) and one knock yielded. 536
sources (512 worn arrises over the instances, 24 chips), 536 marks, 24 paths. Build: about 4 s and 0.6 million rays.

### One at a time (rework 2026-09-23)

The user, reviewing the finished layer on 2026-09-23, found the pigeon marks "placed at the same position in all
windows" and asked to "check the other features for pattern like results". Edge wear had that pattern in its chips (44
of them) and in its portals' arrises:

- the portal is one collection instanced three times, so the three portals' chips and worn arrises were one set shown
  three times: 8 chips per portal at the same 8 places (the plinths' caps and the shafts' feet at the mouth, the portal
  piers' bases), and always the right-hand plinth and shaft on the outer side, which meet the flow first (keep right);
- on the pier ring a chip came off wherever the risk passed 0.6, so every door jamb chipped at both joint grooves (4.2
  x 1.5 cm at H 0.71, 2.2 x 0.7 cm at 1.43: twelve alike, and each door's two jambs a mirror of each other), the three
  sharp block corners at 0.71 (3.9 x 1.3 cm) and the five arrises beside them at 0.71 (2.9 x 1.0 cm).

Which of the like places lost a piece is decided by what the model does not carry: a cart that caught one jamb, a flaw
in one block, a portal used more than another, a restoration that dressed one plinth again. So each draws its own:

| what | drawn | bounds |
|---|---|---|
| portal | its use: all its arrises' wear and their places' risk, times this | 0.80..1.20 (`USE`) |
| arris, per instance | its share of the knocks its exposure says: its band, its rounding, its places' risk | 0.60..1.20 (`WEAR`), times its portal's use, the wear held within `K_CAP` 1 (the calibrated most) |
| element | how many chips it took: its places' expected count times this, rounded by one more draw | 0.60..1.40 (`COUNT`) |
| element | where each fell: one of its places, by their rates | the places' rates |
| groove | which block the chip takes | the one toward the knocks' peak, 3 in 4 (`TOWARD_PEAK`) |
| chip | size, aspect, outline, section, facets and freshness | above |

The seed is each place's own: `draw` takes the sha256 of `edge_wear:` and a key, two bytes to a uniform (a longer run
carries on in the sha256 of the key and `#1`, `#2`...). The keys are the instance (`block`, `PORTAL_A`...), the object
and the place in the object's coordinates to the millimetre: an arris by its worn middle, a weak point by its point, a
stretch's sample by its index; an element by its name (`chips:door:W:4.86`), a portal by its instancer
(`portal:PORTAL_A`). A rebuild draws the same values (the cache is the same, byte for byte, from one full build to the
next), and a change elsewhere reshuffles nothing.

As built:

| | before the rework | after |
|---|---|---|
| chips | 44: 20 on the pier ring, 8 on each portal at the same 8 places | 24: 10 on the pier ring, 4, 5 and 5 on the portals, each where its own draw put it (above) |
| door jambs | all six chipped at both grooves, alike | 4 chips on 4 of the 6 jambs: two at a lower groove, two knocks at 0.85 and 1.14 m; no door is a mirror |
| block corners | the three sharp ones at the lower groove, alike | the NE and NW at the lower groove (4.9 x 1.3, 3.8 x 1.1 cm), the SW's next arris by a knock and at the upper groove |
| heights | 0.60 to 0.71 (the caps, the feet, the lower groove) and 1.43 | 0 and 0.12 (feet), 0.60 to 0.71 (caps, bases, shafts' feet, the lower groove), 0.74 to 1.27 (knocks), 1.43 |
| sizes | 10 sizes for 44 chips | every chip its own: 1.3 to 5.3 x 0.35 to 1.9 cm, its own outline, section and facets |
| an arris's wear | its exposure, the mean of the three portals' | its exposure times its own draw: 0.57..1.21 (median 0.87, half within 0.80..0.97); 15 of the 512 at the cap; a portal arris differs between the three portals by 0.11 at the median, 0.37 at most, none alike |

The chips at street level stay few, and more of the stone's knocks show as its worn arrises than as its chips; a
continuous field that follows the geometry (the knocks by height, the traffic along the pavement) is not a pattern in
itself, and each arris's own draw breaks the one repetition it had, the same line on every pier.

### Where the chips live: the switch

The pier ring's chipped copy, `WEAR_edge_fit_piers` (4168 faces to 4470), stands in for `fit_piers` while the feature is
on. The portal is one collection instanced three times, so its pieces cannot be switched per feature, nor told apart per
instance: the worn portal holds, for each instance, its own copy of each of the 13 worn stone pieces (the plinths, shafts
and panel mouldings, the four portal piers, the step and the recess's two bases) carrying that instance's fields and
chips (`WEAR_edge_PORTAL_A_pilaster_L_plinth`...), and a copy of the PORTAL collection with them in place of the
originals (`WEAR_edge_PORTAL_A`, `_C`, `_E`; a child collection holding none of them is shared as it is). The worn block
instances each in place of `PORTAL_A`, `_C`, `_E` while the feature is on (the framework's `WEAR_GEO_edge_wear` /
`WEAR_ORIG_edge_wear`). The originals are left exactly as the portal has them, with no fields of this feature's, so with
the feature off -- `wear_edge_wear=0`, or the layer off -- the scene renders the untouched ring and portal. The worn
block has 2697 objects: 2275, 21 markers and 401 of the geometry features (571's 396 glass copies, and this feature's
five: the ring's copy, the three portals' instancers and their twin, below); 2698 and 22 markers until 571's rework
dropped its drying lines' head-path marker.

Two things keep a portal switched on rendering exactly as the original does, but for the wear:

- **the same place, bit for bit**: a copy takes its original's parent and stored transform value by value
  (`_same_place`), and the build checks it (`_check_place`). An assigned `matrix_world` is decomposed again, and the
  quarter turns of PORTAL_C and PORTAL_E came back an ulp off (1.2e-7), so every ray entered the portal's space a hair
  apart from where it did.
- **a second instance of each copy** (`WEAR_edge_PORTAL_twins`): Cycles bakes an object's transform into a mesh it
  renders only once (a final render's static BVH), and the portal's own pieces are each rendered three times, so they
  stay in the portal's space. A copy rendered once is baked into the world, its vertices rounded another way round the
  quarter turn, and the portal's pieces, which touch and interpenetrate at coplanar faces (the portal piers' pair, the
  panel mouldings 3 mm into the shafts), z-fight there into dashes and open hairline cracks: in a close view of the
  Broadway portal, a dashed seam between its paired piers and a black line along a panel's frame, both gone with the
  twin. So one empty, `TWIN_Z` 1 km under the block and seen by volume scatter rays alone (there are no volumes),
  instances all three copies a second time.

The first build had the first of these (its one copy of the collection was instanced three times, so the second did not
arise), and measured it as the swap's tie-break: `st_portal`, whose frame starts
above the wear's reach, moved 0.046 levels on average with edge wear on, 0.17% of its pixels by more than 2, in
one-pixel lines along the pilasters' panel rims, the arch's mouldings and the doors' meeting stiles. Now it moves 0.0097
levels and 0.0025% of its pixels, under the noise of rendering it again (0.016, 0.025%).

### The arch's black hairline (critique 2026-09-24)

The fresh-eyes review of 2026-09-24 found a black hairline along the Broadway portal's intrados, about 3.6 m up, that
changed length from one still to the next with edge wear on: two identical stills differed in 295 pixels by more than 8
levels there, against 36 with it off (`rework/critique_round1/fresh/look/cu_E_portal_arch_seam_4renders_x2.png`). The
line is not the swap's. It is the portal's own model, and its length is the renderer's:

- **The model.** The soffit panel is carved into the arch block and edged with the three-part moulding
  (`pieces/06_arch.py`, `portal_lib.three_part_profile`), whose tiny step at the face has its riser exactly in the
  carved panel's wall. So the two objects (`soffit_molding` and `arch_block`, in ARCH) have faces lying in the panel's
  two walls, facing the same way: in the plane y -2.070 of the portal's space 68 faces of the moulding and 78 of the
  block, in y -2.570 60 and 75, over the whole intrados from the springing to the crown (x -1.40..1.40, z 2.27..3.65).
  Two surfaces in one plane z-fight and shadow each other: rays from the review's camera through the line's pixels
  land on those faces, on one object or the other from one pixel to the next (`seam_coplanar_model.png`: one flat
  colour per object, ragged where they meet). The line is in `bradbury_portal.blend` itself and in the stills made
  before the wear layer existed (`series/final/before/st_portal.png`). ARCH holds none of the worn pieces, so the
  per-portal copies share it as it is. The pilasters' panel mouldings (`pieces/07_pilasters.py`) take the same profile
  against their shafts' panel walls, and the thin dark lines along the pilasters' panels are the same thing.
- **The renderer.** The stills render on OptiX and the CPU together (`render_wear.py` and `build_scene.py` enable
  both, as the review's stills did). Cycles splits each frame between the two devices by rows and moves the split while
  it renders, by how long each device took: the CPU's share of the upper rows shrinks as the render goes on, to the
  top 100 to 160 rows of the 1200 (the rows it gave up keep the few samples it took there), and where its band ends
  differs from one render to the next. The two devices resolve the coplanar faces differently: in the review's pose
  OptiX draws the line the whole way up the intrados's left side, the CPU only where the sun reaches it. The line's
  upper end lies in those rows, so it stops wherever the CPU's band ended that time, with edge wear on or off
  (`seam_C_hybrid.png`; below the band the CPU's few samples only lift the line from black to 5 to 15 levels).

Measured in the review's pose (`cam=21.794,0.880,1.801:16.994,0.880,2.200:35`, full size, the scene's defaults) in a
box round the line's upper end (x 440..760, y 60..320), and over the frame above the wear's reach (rows 0..560):

| rendered on | edge wear on vs on again | off vs off again | on vs off |
|---|---|---|---|
| OptiX alone (`devices=gpu`), two stills of each state from a driver and two from `render_wear.py` | 0 px over 2 levels, the whole frame too (at most 1 level anywhere) | 0 | 1 px over 2 (5 levels) in the box; above the reach 84 over 2 and 2 over 8 (14 levels) |
| the CPU alone (an 800 x 280 window) | - | - | 1 px over 2 (5 levels) in the box |
| OptiX and the CPU, as the scene is set: four stills of each state, alternating | 96 to 565 px over 8 in the box; the CPU's band ending at rows 109, 112, 118, 161 | 24 to 543; rows 116, 118, 119, 127 | - |

On one device the switch is exact: the portal switched on renders as the original does wherever the wear does not
reach. What moves above the reach is the light the worn arrises and chips below bounce, a few levels at scattered
pixels, and a few specks along the right pilaster's dark line. The 3rd Street and west portals, the same pose in each
one's own frame (`seam_A.png`, `seam_E.png`): on OptiX alone on and off differ in 0 px over 2 levels in the box, and in
63 and 13 over the frame above the reach (5 and 6 levels at most); both lie in shade, where the line is dark on dark.
At the west portal two stills on both devices, one on and one off, differed in 247 pixels by more than 8 levels, all
in rows 113 to 141, the edge of the CPU's band; on OptiX alone, on and off differ nowhere above the reach by more than
8 levels.

Nothing in edge wear changed. The line goes when the moulding's step riser and the panel's wall stop sharing a plane: a
fix for the portal's own pieces (06, the arch; 07, the pilasters), which the wear layer reads as they are, not for a
wear feature. For stills that repeat, and so for comparing two states of the layer anywhere in the frame,
`render_wear.py` now takes `devices=gpu`: OptiX alone, no slower here (31 to 36 s a full-size still, against 33 to 47 s
on both devices). The default stays the scene's own, OptiX and the CPU together.

### Calibration

Measured on the first build, in rendered pixels, in linear luminance, on the full-size stills (`diff/calibration.json`
in `edge_wear/`), against the user's own photo of the Broadway portal's left pilaster in shade
(`references/user_zoom_left_pilaster.png`): there the plinth's worn arris reads 1.18 to 1.41 times the face beside it (a
4 px box straddling the line) and its chips 2.35 to 3.10 times. The look's constants are unchanged by the rework: a
worn arris reads as it did at the same wear (the arrises now wear 0.87 of their exposure at the median, so a little less
on the whole), and a chip as fresh as 1 as the chips did then, an older scar less.

| where | light | worn arris: vs the same pixels unworn; vs the face beside | chips vs the face beside (median; 90th percentile) |
|---|---|---|---|
| the photo: the left pilaster's plinth | shade | -; 1.18 .. 1.41 | 2.35 .. 3.10 |
| `plinth_corner_bway`: a plinth at the Broadway portal's mouth | sun | 1.34; 1.38 | 1.32; 1.37 |
| `pier_corner_ne`: the NE block corner's pier | sun | 1.39; 1.40 | 1.60; 1.65 |
| `plinth_corner_3rd`: a plinth at the 3rd Street portal's mouth | shade | 1.76; 1.01 | 0.99; 1.54 |
| `door_jamb_se`: the chamfer door's jamb, front in shade, return in sun | both | 2.39; 2.94 | - |

In sun the worn line sits inside the photo's range. In shade it is 1.76 times the same stone unworn, and level with the
face measured beside it, the brighter of the plinth's two faces there. The door jamb's line is its rounding: the round
turns the shaded front's arris toward the sun on the return, and it catches the light as a rounded arris does. The chips
stay short of the photo, 1.3 to 1.65 times the face against 2.35 to 3.10: the photo's stone is darker and redder than
the model's, so the same pale fresh stone stands out further from it. Lifting the scars further toward white on the
model's lighter stone read too white in the trials (white crescents), so the lift stops at `FRESH_L` 0.34 in luminance,
and the scars read as fractures by their facets and their shading.

### The debug view

Green: the nearest worn arris's band at full colour from 0.4 of wear, drawn 3.5 cm wide on each face so it reads from
the street, fading up to 2 m with the knocks; every chip's scar in full, however fresh. A square tube runs 10 cm off each
worn arris along its bisector, over its worn length; an octahedron stands 20 cm off each chip with a thin tube pointing
at it. The command above (every other feature at 0) shows the edge wear alone.

### Published for the features that follow

`ctx.field("edge_wear", key)` for a feature that NEEDS edge_wear:

- `arrises`: every worn arris per instance, `dict(id, object, instance, kind, facade, s, d, x, y, z0, z1, turn, nose,
  vertical, exposure, draw, wear, open, street, traffic, depth, lead, orient, mouth)`; `exposure` is the instance's own
  measure, `draw` its own share times its portal's use, `wear` the most it wears (the two, held within 1); `kind` is
  567's corner kind where it is one (pier, block corner, plinth, portal pier), else the stone and the edge (`portal pier
  ledge edge`, `step nose`, ...).
- `chips`: every chip per instance, `dict(id, key, object, instance, kind, facade, s, d, z, H, risk, length, depth,
  fresh, side, shape)`: `kind` joint, corner, foot or knock; `side` the block a groove's chip took (above, below);
  `shape` its section, ends, facets, asymmetry and tilt.
- `sites`: every weak point and every stretch per instance, `dict(key, object, instance, element, kind, facade, s, d, z,
  H, risk, rate, fate)`, `fate` chip, none or spaced out.
- `elements`: each element's expected and drawn count, `dict(id, expected, drawn)`.
- `entrances`: the portals' mouths and the doors, `dict(id, kind, facade, s0, s1, object, p0, p1)` (p along the
  perimeter).
- `profile`: the knocks' constants and formula, the band, the rounding, the weaknesses, rates and draws' bounds.

Notes for the features that follow: `fit_piers` and the portal instances are replaced while edge wear is on. The worn
copies are made in this feature's `apply` and `apply_portal` from the originals as they stand then (ORDER 110): an
attribute that a feature earlier in the chain (ORDER below 110) sets on `fit_piers` or on a portal piece is carried over
(the exact boolean keeps a target's attributes; the scar faces take 0), but one set by a later feature must be set on
`WEAR_edge_fit_piers` and on each portal's `WEAR_edge_PORTAL_<X>_` pieces too. The copies carry the attributes
`wear_edge_*` (the originals no longer do): a feature must not reuse those names.

### What it changed in the framework

Nothing but `wear/registry.py`, which lists `edge_wear`; nor did its rework. The probe, runoff, soiling, washed, street
grime, rust and efflorescence masks and caches build byte-identically (`37806c0b...`, `4fa13d0c...`, `6517dd79...`,
`6c9963ea...`, `16d42806...`, `a1865e1b...`, `ee8ba631...`; rust's attributes with its cache), and this feature's cache,
chipped meshes and attributes are the same on a rebuild. After the rework every other feature's mask and cache is
byte-identical to the build before it, and every other object in the worn block and the worn portal, its mesh,
materials, attributes and place, is the same object by object. Its critique fix changed no build: it added `devices=`
to `render_wear.py` (`gpu`: OptiX alone, for stills that repeat; the default unchanged).

### Evidence

The first build's evidence, before the rework, is under `tests/artifacts/screens/bradbury_wear/edge_wear/`: full-size
stills at the scene's defaults in `renders/`, each sheet at half size, left to right: edge wear off (`wear_edge_wear=0`,
every other feature on), on at its default, and the debug view with the other features off:

- `st_portal_off_on_debug.png` and `st_along_off_on_debug.png`: the prompt's two street views. `st_portal` looks up at
  the Broadway portal from across the street, its frame starting about 2.4 m up the portal, above the wear's reach: it
  shows the switch's tie-break (above), nothing else. `st_along`: the storefront piers up Broadway and the portal's base
  down the street;
- `pier_corner_ne_off_on_debug.png`: one pier corner at street level, the NE block corner in sun, its arris worn and
  chipped at the lower joint groove;
- `door_jamb_se_off_on_debug.png`: the chamfer door's jamb, its rounding and its chip at the joint groove;
- `plinth_corner_bway_off_on_debug.png`, `portal_bway_medium_off_on_debug.png`: the Broadway portal's plinths at the
  mouth, close and from the pavement; `plinth_corner_3rd_off_on.png`: the 3rd Street portal's, in shade;
- `st_corner_off_on.png`, `st_up_off_on.png`, `hero_3q_off_on.png`: the scene's own views, where the feature is a matter
  of millimetres at 2 m and under;
- `diff/summary.json` and its heat maps (x8), `diff/calibration.json`; `references/`: the photos, unaltered, with
  labelled crops and what was measured on them (`references.json`); `poses.json`.

| camera | off vs on: mean; share over 2 levels; over 8 | the layer off vs the pre-wear still | edge wear at 0 vs 569's still |
|---|---|---|---|
| `st_portal` | 0.046; 0.17%; 0.08% (the swap's tie-break) | 0.016; 0.025% | - |
| `st_along` | 0.018; 0.11%; 0.026% | 0.007; 0.003% | - |
| `st_corner` | 0.012; 0.039%; 0.003% | 0.031; 0.056% | 0.010; 0.009% |
| `st_up` | 0.007; 0.002%; 0.0001% | 0.006; 0.002% | 0.009; 0.015% |
| `hero_3q` | 0.016; 0.057%; 0.004% | 0.017; 0.007% | 0.011; 0.002% |

The layer off (`bradbury_scene_wear_off.blend`) renders the pre-wear stills (`series/final/before/<cam>.png`) to within
render noise, and so does edge wear at 0 with 569's evidence stills: the switch is exact. Cost: 1 to 2 s on a 12 to 23 s
still (5 to 10%), for the attribute reads and the rounding; the chipped copies add 605 faces to the pier ring and 165 to
each portal.

The rework's evidence is under `tests/artifacts/screens/bradbury_wear/rework/edge_wear/`, full-size stills at the scene's
defaults in `renders/` (`_on`, `_edgeoff`, `_debug`; `_before` and `_beforedebug` from the frozen state before the
rework, `wear_snap_rework_before/`), sheets at half size:

- `chipmap_before.png`, `chipmap_after.png`: the whole building at once, every face unrolled at street level with its
  worn arrises (as bright as their wear) and chips (as big as their length), and the three portals side by side in their
  own coordinates: before, three identical portal panels and every door jamb chipped at the same two heights; after,
  each its own;
- `portals_before_after.png`, `portals_debug_before_after.png`: the three portals from the same pose in each one's own
  frame (3rd Street and the west face in shade, Broadway in sun), before and after, and in the debug view (the
  octahedra are the chips);
- `doors_before_after.png`, `doors_debug.png`, `corners_before_after.png`: the three doors and the block's three sharp
  corners, before and after;
- `closeup_pier_bway_off_on_debug.png` and `_before_after.png`: the Broadway portal's left pier at the mouth, in sun,
  its worn arrises, the two chips at its base's corners and a knock up its front arris;
  `medium_portal_bway_off_on_debug.png` and `_before_after.png`: that portal's base from the pavement;
- `chips_contact_sheet.png` (and `chips/`): every one of the 24 chips, 0.55 m out along its arris's bisector, no two
  alike;
- `st_along_off_on.png`, `st_corner_off_on.png`; `diff/`: the heat maps (x8) and figures below; `references/`: the
  user's photo of the Broadway portal's left pilaster and its plinth crop, unaltered.

| camera | edge wear off vs on: mean; share over 2 levels; over 8 | the layer off vs the pre-wear still |
|---|---|---|
| `st_portal` | 0.0097; 0.0025%; 0% (no tie-break now) | 0.016; 0.024% |
| `st_along` | 0.012; 0.044%; 0.002% | 0.0065; 0.003% |
| `st_corner` | 0.011; 0.023%; 0.001% | 0.032; 0.058% |
| `st_up` | 0.0066; 0.001%; 0% | 0.0059; 0.001% |
| `hero_3q` | 0.013; 0.027%; 0.001% | 0.0165; 0.006% |
| the close-up | 0.57; 4.8%; 2.7% | - |
| the Broadway portal from the pavement | 0.13; 1.1%; 0.45% | - |

The critique's evidence (the arch's black hairline, above) is under `rework/edge_wear/critique_r1/`, at the review's
pose, full size and the scene's defaults, sheets at twice the pixels of the box round the line's upper end:

- `seam_critic_stills.png`: the review's four stills (off, off again, on, on again);
- `seam_C_single_device.png`: OptiX alone, edge wear on, on again, off and off again, the same to within a level; the
  CPU alone, on and off, the same; the line to the top on OptiX, only in the sun on the CPU;
- `seam_C_hybrid.png`: four stills of each state on both devices, the CPU's band's edge dashed: the line stops there;
  `seam_C_cpu_band.png`: the whole frame, the pixels a still on both devices differs in from one on OptiX alone: the
  lines of coplanar faces, where the CPU's samples lie;
- `seam_coplanar_model.png`: one flat colour per object (Workbench), the soffit moulding in the arch block's carved
  panel, ragged where their faces share a plane, and the pre-wear `st_portal` with the line already there;
- `seam_A.png`, `seam_E.png`: the 3rd Street and west portals, the same pose in each one's frame;
- `renders/` (`C/`, `A/`, `E/`: `gp_` OptiX alone, `hy_` both devices; `C_window/`: the 800 x 280 window, `cp_` the CPU
  alone; `render_wear_gpu/`: `render_wear.py -- devices=gpu`, each still its own process; `workbench/`) and
  `numbers.json`.

## Glass grime on the panes (AI 571)

`wear/features/glass_grime.py` (`wear_glass_grime`, teal in the debug view): the dust film a window pane gathers between
two cleanings. Dust settles out of the city's air over the whole pane, so the film is fairly even; only a pane the rain
reaches has water running down it, and that gathers a little more along its bottom rail and in its lower corners, where
the water dries. From the street a dusty pane reads a little duller, greyer and hazier than a clean one: its reflection
weaker and flatter, a faint grey veil over it, less of the room behind showing through; no lighter (the dust acts on
the pane's contrast, not on its brightness: "No lighter (critique 2026-09-24)", below), and never opaque. What sets
one pane apart from the next is mostly not the building but its tenant: windows are cleaned at different times, so each
window draws when it was last cleaned (reworked 2026-09-23, below), and the storefronts and the doors, washed from the
pavement, stay nearly clean. Nothing is placed by noise: every draw comes from a seed of the window's own, and the
attributes are the same from one build to the next.

```
blender -b -P wear_layer.py -- features=glass_grime                    # its lights and copies (about 8 s), the rest cached
blender -b -P render_wear.py -- wear_glass_grime=0 cam=20.9,9.89,7.65:16.99,9.89,7.65:30   # off; 1 is the default
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 wear_rust=0 wear_efflorescence=0 wear_edge_wear=0 wear_mortar_erosion=0 wear_pigeon=0 view=st_up
```

The close-up is three second-floor windows on Broadway, in sun: a neglected one, one cleaned this week and one whose
upper light the last cleaning missed.

Like edge wear it is not a mask: its marks lie on the glass's own meshes, as attributes the shader reads, so it has no
atlas image and costs no VRAM for one. The atlas would not do here: a mark painted at an (s, z) lands on whatever
stands there, the frame's bars and the backdrop behind the glass included, and a light's film must stop at its frame.

### The lights

Every glass the block renders is read as the street sees it: 411 instances, the block's 396 glass objects and the
portal's 5 (three times). Each one's plane and outline come from its own triangles; its **lights** -- the glass its frame
leaves open -- are found with short rays cast from `FRONT` 12 cm in front of it, in front of the frame's bars (2 to 6 cm
proud of the glass) but behind a wall's reveal (0.3 m and more) and the portal's arch (1.45 m), so only the window's own
frame bounds a light. Five scan lines each way at 1 cm find the bars (a run of positions where no scan line sees the
glass, with glass on both sides), and each light's edges are refined to 0.5 mm along its centre lines:

| window | lights | bars between them |
|---|---|---|
| the sashes of floors 2 to 4 (243 windows) | a lower and an upper light, 0.88 to 1.03 wide; floor 2's lower light 1.41 tall (its sash was let down 0.35), the rest 1.06 | the meeting rail, 6 cm |
| the top floor (81) | a rectangle 0.94 tall and an arch-headed light 0.60 tall to its crown | the transom bar, 16 cm |
| the storefronts (33 glass objects) | two or three lights, 1.34 to 2.15 wide, 2.73 tall | the dividers, 6 cm |
| the chamfer's, the north face's and the west face's doors (3) | two leaves each, 0.77 to 0.87 wide, 2.09 tall | the meeting stiles, 39 cm |
| the storefront transoms (36) | one light each, 2.15 to 4.93 wide, 0.86 tall | none |
| the portal's doors (4, three times) | one light each, 0.49 x 1.40 | none |
| the portal's transom (1, three times) | two lights, 1.36 x 1.10 | the door post, 27 cm |

780 lights over all instances. An arch-headed light's top edge falls toward its stiles; the frame's inner edge is
fitted there as a circle through nine measured points (within 0.8 mm on every top-floor window) and its centre is
asserted to stand on the light's axis. The lights of one mesh's three portal instances are asserted to agree to 3 mm.

### What each light takes

From 565's measure over the light's own texels -- only those whose recorded surface is the glass itself: where the
street sees something in front of it (the portal's arch before its transom lights, a fire escape's platform) the
measure is that surface's, not the glass's, and a light none of whose texels are its own takes its other instances',
its window's other lights' or its kind's -- and from its height:

- **its cleaning**, by the height of its middle over the pavement: `CLEAN_HAND` 0.18 of an upper window's dust where a
  hand reaches from the pavement (to `CLEAN_REACH` 2 m), rising through a smoothstep to all of it at `CLEAN_TOP` 6 m,
  above which nothing is washed from the street: the storefronts and the doors keep 0.18, the portal's transom lights
  0.38, the storefront transoms 0.53, every window from the second floor up all of it;
- **the rain kept off it**, 1 - 565's `open` (its reveal, its head, its jambs, its neighbours): a light the rain rarely
  rinses keeps a little more of its dust, `SHELTER_KEEP` 0.85 of its window's at 0.15 (a lower sash) rising through a
  smoothstep to 1.25 at 0.80 (the portal): a lower sash 0.85, an upper sash 0.91 to 0.95, a top-floor arched light 1.19;
- **the rain on it**, the mean of 565's `exposure` data over the light, in units of `RAIN_REF` 0.50 (the most exposed
  lights', floor 4's lower sashes, 0.46 to 0.56): the water that runs down it to its rail, which sets how much it
  gathers there (below). The portal's glass, 2 m into its vestibule, takes next to none.

| lights | count | size (median) | cleaning | rain kept off | keeps | rain | film: median (range) | under 0.15 | over 0.8 |
|---|---|---|---|---|---|---|---|---|---|
| floor 2 sash, lower; upper | 81; 81 | 0.98 x 1.41; 0.98 x 1.06 | 1.00 | 0.18; 0.32 | 0.85; 0.91 | 0.45; 0.38 | 0.54 (0.00..1.18); 0.71 (0.00..1.30) | 10; 7 | 11; 35 |
| floor 3 sash, lower; upper | 81; 81 | 0.98 x 1.06 | 1.00 | 0.19; 0.34 | 0.85; 0.93 | 0.48; 0.40 | 0.50 (0.00..1.14); 0.66 (0.02..1.26) | 12; 7 | 12; 23 |
| floor 4 sash, lower; upper | 81; 81 | 0.98 x 1.06 | 1.00 | 0.22; 0.36 | 0.86; 0.95 | 0.49; 0.41 | 0.43 (0.03..1.16); 0.67 (0.02..1.24) | 12; 9 | 10; 34 |
| top floor, lower; arched | 81; 81 | 0.93 x 0.94; 0.87 x 0.60 | 1.00 | 0.33; 0.64 | 0.93; 1.19 | 0.46; 0.26 | 0.53 (0.03..1.18); 0.94 (0.03..1.35) | 11; 5 | 16; 45 |
| storefront | 72 | 1.56 x 2.73 | 0.18 | 0.12 | 0.85 | 0.41 | 0.07 (0.01..0.21) | 65 | 0 |
| storefront transom | 36 | 3.30 x 0.86 | 0.53 | 0.52 | 1.09 | 0.24 | 0.32 (0.04..0.81) | 6 | 1 |
| door (chamfer, north, west) | 6 | 0.81 x 2.09 | 0.18 | 0.17 | 0.85 | 0.39 | 0.07 (0.00..0.08) | 6 | 0 |
| portal door | 12 | 0.49 x 1.40 | 0.18 | 0.79 | 1.25 | 0.10 | 0.05 (0.00..0.23) | 8 | 0 |
| portal transom | 6 | 1.36 x 1.10 | 0.38 | 0.99 | 1.25 | 0.01 | 0.32 (0.01..0.49) | 2 | 0 |

The film is in units of the dust one cleaning cycle leaves on an upper window. Within a kind the geometry's measure
hardly varies (behind the fire escapes and beside the block's corners); the films' ranges are the windows' own draws,
their tops saturated (below: the arched lights' 1.81 is 1.35).

### One window at a time (rework 2026-09-23)

The first cut laid the grime out by each pane's frame and the rain alone: a tide line and a soft gradient along every
bottom rail (in sun about twice the clean glass's luminance in the rail's first 3 cm), pale lower corners, and drying
lines hanging at a 7.5 cm pitch from every head; the middle of a light took next to nothing. On a block whose windows
are all alike that stamped the same pale band at every window, and the user rejected it: *"the windows dirt on the
bottom, it doesn't look realistic; i don't remember seeing such a dirty whitening pattern on a window"* (2026-09-23; the
review also asked every feature for marks that repeat identically from one instance to the next). The photos agree. In
the Commons colour photo of a portal and the floor above it (`commons_304_frontal_6.jpg`) the second floor's windows
each read a little different -- one a flat grey-blue haze, its neighbour a clear reflection of the sky and a tree,
others the blinds behind them -- and no rail carries a band; in the 1960 HABS photos the windows differ by their blinds
and curtains, not by any mark on the glass. What sets one pane apart from the next is what the model does not carry:
when its tenant last cleaned it. So each window draws its own cleaning, and the physics above only modulates it:

| drawn | for | bounds |
|---|---|---|
| when it was last cleaned, as a share of the dust a cycle leaves: anywhere in its cycle, evenly (a window cleaned last week beside one due next week) | each window: a glass object; a portal's glass, cleaned as one by the building's staff | 0 to 1 |
| neglected: a tenant who does not clean (a vacant office or shop), `NEGLECT_P` 0.08 of the tenants' windows; never an entrance | each window | older than a cycle, 1.00 to 1.40 (`NEGLECT`) |
| whether that cleaning missed the light that is hard to reach, which then keeps part of the cycle before's dust as well | each window | a sash's upper light 0.25 (a tenant barely reaches its outside from within), a top-floor arched light 0.35 (fixed), a portal's transom lights 0.35 (behind the arch, 3 m up) (`MISS_P`); then 0.35 to 0.90 more (`MISS_EXTRA`) |
| its own share of its window's dust: one cleaning leaves each pane a little different | each light | 0.85 to 1.15 (`JITTER`) |
| its gathering at the rail, at full rain | each light | 0.10 to 0.50 of its film (`GATHER`) |
| how far up the gathering reaches | each light | 0.10 to 0.26 m times the square root of its height, at most 0.40 of it (`REACH`) |
| each lower corner's extra share of the gathering, and the corners' width | each light | 0 to 0.70 each (`CORNER`), 4 to 10 cm (`CORNER_W`) |

A light's film = its cleaning x its age (its window's, plus the cycle before's where the cleaning missed it, at most
`AGE_MAX` 1.40) x what its shelter keeps x its own share, and then saturated (added by the critique of 2026-09-24): a
film is itself up to `FILM_KNEE` 1.0 and grows ever more slowly above it toward `FILM_MAX` 1.40, exponentially and as
steeply as below at the knee (1.2 becomes 1.16, 1.5 becomes 1.29, 1.8 becomes 1.35), since past about a cycle's dust a
pane sheds, to the wind and to what rain reaches it, about as much as settles on it. It caps what a neglected window,
a missed light and an arched light's deep reveal (its shelter keeps 1.19) add up to: 101 of the 780 lights were above
1.0, the arched lights up to 1.81, and none now passes 1.35; below the knee nothing moved. Where a range is given, the
value is the mean of two uniforms, the middle likelier than the ends. The seed is the sha256 of `glass_grime:` and a key, two bytes a uniform:
`window:<object>` (a portal's glass: `window:PORTAL_A`), `light:<object>:<index>` (`light:PORTAL_A:<object>:<index>`) and
`shape:<object>:<index>`. A rebuild draws the same (the cache is byte-identical from one build to the next), and a
change elsewhere on the model reshuffles nothing.

The portal is one collection seen three times, so its glass cannot differ by its attributes alone. Its three portals
stand on three faces (3rd Street, Broadway, the west face; the build asserts it), so each light's film is written once
per face of the block and the shader reads the one for the face the shading point stands on: each portal's glass keeps
its own.

As built (the build prints it, `glass_grime windows ...`, the kinds and `glass_grime neighbours ...`):

- 399 windows: 324 upper windows, 33 storefronts, 36 transoms, 3 doors, 3 portals. Last cleaned 0.56 of a cycle ago
  (median; 0.00 to 1.35). 31 neglected: 9 on floor 4, 7 on the top floor, 6 on floor 2, 3 on floor 3, 3 storefronts, 3
  transoms. 87 hard-to-reach lights missed: 24, 17 and 19 upper sashes on floors 2, 3 and 4, 25 arched lights, and the
  3rd Street portal's transom.
- The 648 upper lights: film 0.59 (median; a quarter under 0.30, a quarter over 0.84); 73 under 0.15, 186 over 0.8, 44
  over 1.2 (57 before the films saturated), none over 1.35. By window: 29 of the 324 clean (under 0.15), 101 lightly
  dusty (to 0.5), 91 moderately (to 0.8), 103 dusty. The upper lights take a little more than the lower (their shelter,
  and the cleanings that miss them).
- Neighbours: of 608 pairs of upper lights side by side in a row (one face, one kind), the films differ by 0.33
  (median; 0.35 before they saturated), and 41 pairs lie within 0.05 of each other. `critique_r1/filmmap/filmmap_all.png`
  draws every light on the five faces.
- The portals: 3rd Street (A) last cleaned 0.23 of a cycle ago, its transom missed: doors 0.05, transom 0.31 and 0.33;
  Broadway (C) 0.01: all of it near 0; the west face (E) 0.92: doors 0.20 to 0.23, transom 0.45 and 0.49.

The drying lines are gone. They hung at one pitch from every head, a ruled pattern at every window, nothing in the photos
shows them, and a pane set back in its reveal takes no rain at its head to start a rivulet from anyway.

### The film on a light

In the light's own frame, x from its left stile and y up from its bottom rail, the grime is its film, even over it,
lifted mildly toward the bottom rail and the lower corners:

    grime = film x (1 + gather x b(y) x (1 + left x c(x) + right x c(W - x)))

b falls from 1 at the rail to 0 at the gathering's reach and c from 1 at a stile to 0 at the corner's width, both
smoothsteps, flat where they start: no tide line along the rail and no hot spot in a corner. The gathering is as much as
the rain on the light: 0.28 (median; at most 0.49) on the lower sashes, 0.23 to 0.26 on the upper, 0.15 on the arched
lights, 0.00 to 0.06 on the portal's glass; its reach 0.17 to 0.21 m on a sash, 0.30 m on a storefront. In the renders
it barely shows (the rail's first centimetres sit in the sash's own shadow): it keeps a dusty pane from being a flat
card, never more.

### The look

The dust covers a share of the pane in proportion to its grime, `COVER` 0.12 of it at a grime of 1 (strength 1) and
never more than `COVER_MAX` 0.45, whatever the strength. On that share the pane is dust, not glass:

- less of the room behind shows through: Alpha rises by the cover's share of the see-through (the game's window glass,
  0.82, to 0.84 at a grime of 1), Transmission falls by it;
- the covered share of what the pane itself shows (cover / Alpha') does not reflect: the BSDF's Specular IOR Level
  falls by it, 14% at a grime of 1 on the window glass, so the reflection weakens. The layer routes Specular on glass
  since the rework (see "What it changed in the framework");
- the covered share takes the dust's own colour (since the critique of 2026-09-24, in full: there it is dust, not
  glass): `DUST` (0.054, 0.051, 0.046), a sooty warm grey as dark as the game's window glass's own colour (luminance
  0.051), which is the tone the clean pane renders in sun, so the pane turns greyer and flatter but no lighter (see "No
  lighter" below). On a clear pane (the transoms, the portal's glass), whose colour is its transmission's tint, the
  colour moves by the same share, so the light it lets through dims with the dust;
- the roughness stays the glass's own: the glass between the dust's grains still mirrors sharply, and what the grains
  scatter is the covered share's grey. The rework raised it (`BLUR`, 0.06 of the way toward 0.40 at a grime of 1) to
  soften the reflection, and it spread the sun's glint over a dusty pane near the sun's mirror direction as a white
  sheet: at 0.15 (its first value) over the whole light, at 0.06 still over the upper half, at twice the clean pane's
  light (`critique_r1/glare_bway_blur.png`). The critique of 2026-09-24 took it out (see "No lighter").

Never opaque: at the cap the game's window glass keeps 55% of its see-through (Alpha 0.90 at most) and a clear pane 55%
of its transmission; `renders/closeup_strength3.png` shows strength 3. Glass only, and only where a light's attributes
are. It stands at ORDER 300, after every deposit on the masonry; glass is no other feature's.

### No lighter (critique 2026-09-24)

The fresh-eyes critique of the rework found the glass still whitening. The band was gone, but in sun a dusty pane
rendered lighter than its clean self, the more so the dustier it was: on Broadway's 4K elevation the upper lights read,
by film, +4% (under 0.3), +9% (0.3-0.6), +16% (0.6-0.9), +23% (0.9-1.2), +29% (1.2-1.5) and +46% (one arched light at
1.81), about half the sunlit upper panes 15 to 30% paler and milkier, and from `st_portal` every pane sampled read 6 to
27% lighter than the pre-wear still. That contradicts the reference the rework cites, where the hazy pane reads a little
darker than its clear neighbour (0.44 against 0.47 of the brick). A dusty pane was not duller, it was whiter: what the
user had rejected.

The cause was the dust's colour. Half of it (`VEIL` 0.5) stood in for the glass's on the covered share, a light warm grey
(0.17 in luminance) against the game's window glass's 0.051, 3.3 times brighter, and in sun that colour is lit like a
wall. Its lost reflection and lost see-through hardly count there: the sunlit pane is its own colour lit, the sky's
reflection a small part of it. Three renders of each elevation at 32 spp -- the colour left unchanged, the old dust, a
black dust -- fit every light's on/off ratio as a straight line in the dust's brightness, and they say the same: with the
colour unchanged Broadway's panes read 1.00 to 1.02 by film (1.08 on the one arched light at 1.81), so the whitening
was the colour.

So the dust acts on the pane's contrast, not on its brightness:

- **its colour is as dark as the glass it hides**: `DUST` (0.054, 0.051, 0.046), a sooty warm grey of the window glass's
  own luminance, which is the tone the clean pane renders in sun. The covered share takes it whole -- the coverage
  model's own words, there it is dust, not glass -- so `VEIL` and `TINT` are gone. The dusty pane turns greyer (on
  Broadway's panes with a film of 0.9 to 1.5 its blue falls against its red from 39 to 33 sRGB levels, as far as the
  rework's dust took it) and flatter (what reflection and room it showed are covered), but no lighter;
- **the lost reflection and the lost see-through stay**, the cue the critique asked to keep; **the blur does not**. The
  critique asked to keep it too, but its one visible effect besides was a whitening: from `glare_bway`, a floor-4 pane
  on Broadway near the sun's mirror direction (`mesh__1613`'s upper light, film 0.99) read 2.06 of clean with it, the
  sun's glint spread over its upper half as a white sheet (in the rework too, 2.13), and 1.43, 1.16 and 1.02 with
  `BLUR` at 0.03, 0.015 and 0. Physically the dust does not roughen the glass: the glass between the grains mirrors
  sharply and the grains scatter into the covered share's grey. Without it the reflection over a dusty pane in shade
  still loses 6 to 10% of its contrast (with it 14 to 17%), so the reflection reads weaker and flatter, not blurred.
  With the new dust and the blur the north face's lightest pane read 1.11 (now 1.04), and the blur's glints were most
  of the lighter blocks the `lighter` check found with it (below);
- **a film saturates**, `FILM_KNEE` 1.0 toward `FILM_MAX` 1.40 (see "One window at a time"): the arched lights' 1.81 is
  1.35, and no light passes it;
- **a clear pane follows the same share**: its colour, its transmission's tint too, moves to the dust by the covered
  share, no longer three times as fast (`TINT`). The 3rd Street transoms, over their white panels in shade, the darkest
  glass the rework drew (0.62 of clean at a film of 0.81), now read 0.75; Broadway's in sun 0.96 to 0.99.

On the full-size stills (4K for the two sunlit elevations, 128 spp), each light's middle on against glass grime off,
linear luminance, every other feature on (`critique_r1/numbers.json`):

| elevation | light on it | film under 0.3 | 0.3-0.6 | 0.6-0.9 | 0.9-1.2 | 1.2-1.5 | lightest; darkest |
|---|---|---|---|---|---|---|---|
| Broadway, before | sun | 1.040 (33) | 1.089 (25) | 1.164 (36) | 1.226 (18) | 1.290 (7), 1.464 (1 over 1.5) | 1.464; 1.000 |
| Broadway, after | sun | 1.002 | 1.005 | 1.007 | 1.011 | 1.010 (8) | 1.024; 0.961 |
| north face, before | sun, low across it | 1.022 | 1.090 | 1.122 | 1.151 | 1.254, 1.177 (6 over 1.5) | 1.426; 0.999 |
| north face, after | sun, low across it | 1.000 | 1.003 | 0.995 | 0.987 | 0.985 | 1.037; 0.933 |
| 3rd Street, before | shade | 1.003 | 1.008 | 1.052 | 0.971 | 0.997, 0.997 (10 over 1.5) | 1.271; 0.805 |
| 3rd Street, after | shade | 0.987 | 0.966 | 0.942 | 0.902 | 0.883 | 0.998; 0.824 |

(the median by film, with the count of lights; "before" bins the rework's films, "after" the saturated ones). On
Broadway no pane is lighter by more than 2.4% now (66 of 120 were by more than 10%), and on the north face none by more
than 3.7% (82 of 200 were); in 8-bit sRGB their dustiest panes (film 0.9 to 1.5) moved +9.6 and +8.9 levels before,
+0.4 and -0.5 now, their blue against their red down 6 levels either way. In shade the lost reflection is all the dust
does: a pane that mirrors the bright sky dims by the share the dust covers, so 3rd Street's dustiest panes read 0.88 to
0.90 of clean -- 2 sRGB levels on panes that dark (4.5 at the most), the weaker reflection the critique asked to keep --
and none is lighter. Halving the specular loss would have held them at 0.94 to 0.96 and halved the cue; it was kept
whole.

From `st_portal`, every upper light it sees (27) against the pre-wear still, all wear on: the rework's read 1.13 (1.01
to 1.27; 23 over +5%), now 1.00 (0.99 to 1.00). The layer's other features do not touch the glass: glass grime off
reads 1.00 there too.

`wear_compare.py lighter` (8 px blocks of linear luminance lighter by more than 2% and 0.003, glass grime on against
off; a deposit's check, which the glass does not have to pass block by block): Broadway's 4K elevation 16,512 blocks
lighter with the rework, 734 with the new dust and the blur, 18 now; the north face's 14,308, 1,744 and 394; the
close-up 7,906, 334 and 88; `glare_bway` 6,960, 522 and 1; 3rd Street's 1 and 0. What is left is the flattening: where
a pane showed a dark reflection (its head's, the street's) the dust's even tone lies over it, as it darkens the same
pane where its reflection was bright (2,098 blocks darker on Broadway, 3,902 on the north face); no pane as a whole is
more than 4% lighter.

### Where the grime lives: the copies and the switch

A pane is cut along its bars' centre lines, behind the bars, so that every face lies in one light and its face corners
can carry that light's own coordinates (`wear_glass_grime_p`: x, y in metres, linear over the planar glass, so exact at
any distance), its size (`_l`: width, height), its gathering (`_k`: gather, reach, the corners' width; `_c`: the left and
the right lower corner's shares), and its film on each face of the block (`_f`: S, SE, E; `_g`: N, W; the block's glass
carries its one film on all five), and the layer's `Attr`, `wear_glass_grime`: the light's film (the portal's glass:
its three portals' mean), which gates the shader.

The cutting is done on a COPY of each of the block's glass objects, `WEAR_glass_<name>`, which renders in the original's
place while the feature is on (the framework's `add_object(..., replaces=...)`, like edge wear's pier ring): 396
copies, 355 of them cut, 1506 faces. The originals stay exactly as they were. Measured, this matters: with the cuts made
in place the layer switched off rendered the glass a little differently (a cut planar pane is the same surface, but the
renderer samples a differently triangulated, no longer instanced, alpha-blended pane a little differently: 2.4 times the
noise floor on the glass pixels, 1-level changes); with the copies the off switch is exact again. The portal's glass needs
no cut -- each door's glass and each transom light is its own box -- and carries its attributes in place;
`apply_portal` asserts that no face of it straddles a bar, since the portal cannot be switched per feature. Edge wear's
copies of the portal collection link the same glass objects (its DOOR and VESTIBULE collections), so the portal's glass
shows the grime with edge wear on and off. The worn block has 2697 objects: 2275, 21 markers, edge wear's 5 and these
396 (the first cut's head-path marker, drawn for its drying lines, is gone).

### Calibration

Measured in rendered pixels on the full-size stills at the scene's defaults: a light's middle with the feature on
against the same box with `wear_glass_grime=0` (every other feature on in both), as a share of the brick beside it
(`critique_r1/numbers.json`, `calibration`; the boxes are the rework's, in `iter/closeup_boxes.png` and
`iter/shade_boxes.png`); "the rework" is the look the critique of 2026-09-24 reviewed, rendered from this build with the
rework's module:

| light (film) | light on it | off | on | change | the rework |
|---|---|---|---|---|---|
| Broadway floor 2, `mesh__687` (neglected): upper (1.12, 1.15 before it saturated); lower (1.03) | sun | 0.198; 0.205 | 0.201; 0.207 | +1%; +1% | 0.250; 0.251 (+26%; +22%) |
| `mesh__688` (cleaned this week, 0.003): upper; lower | sun | 0.182; 0.207 | 0.182; 0.207 | none | none |
| `mesh__689`: upper, missed (0.73); lower (0.23) | sun | 0.195; 0.216 | 0.196; 0.216 | +1%; none | 0.225; 0.225 (+16%; +4%) |
| 3rd Street floor 3, `mesh__964`: upper (0.63); lower (0.55) | shade | 0.207; 0.147 | 0.196; 0.142 | -5%; -3% | 0.210; 0.153 (+1%; +4%) |
| `mesh__965`: upper (0.84); lower (0.93) | shade | 0.248; 0.160 | 0.229; 0.150 | -8%; -6% | 0.248; 0.169 (none; +6%) |

In sun a dusty pane reads as light as a clean one, and greyer: `mesh__687`'s upper light goes from (68, 93, 110) to
(73, 93, 108) in sRGB, its red up and its blue down, where the rework took it to a quarter lighter. It is flatter too:
the reflection's detail over that light falls by 7% (the standard deviation of its pixels, 3.6 to 3.3 levels). In
shade the street it reflects loses 6 to 10% of its contrast (5.3 to 5.0 and 4.6 to 4.2 levels; the rework's blur took
a sixth), and with it a little of its light: the dusty panes read 3 to 8% darker. A clean pane is untouched, and the
brick beside it too.

The reference: in that Commons photo of a portal and the floor above it (`references/frontal6_floor2_mid_pair.png`, a
crop of `commons_304_frontal_6.jpg`) a hazy second-floor window, a flat grey-blue sheet with the room behind barely
showing, reads 0.44 of the sunlit brick and its clear neighbour, reflecting the sky and a tree, 0.47
(`references/references.json`): what the dust takes is the reflection's detail and the view in, not the pane's darkness
(the hazy pane is 0.94 of the clear one), and no rail carries a band. The render now brackets that: a dusty pane in sun
reads 1.00 to 1.01 of clean, in shade 0.86 to 0.97 (see "No lighter"). The render's panes are darker than the photo's
(0.18 to 0.21 of the brick clean, the photo's processed and brighter), which is why the dust must not be lighter than
the glass: on a pane this dark a light dust is all that shows. The storefronts stay at 0.07 (median) and read as they
did. `COVER` and `DUST` carry the calibration; `DEFAULT_STRENGTH` stays 1.0, and `wear_glass_grime` 0.5 halves it.

### The debug view

Teal: the grime at full colour from 1 / `DEBUG_GAIN` (0.75) of it -- a dusty window full teal, a clean one clay grey, each
window its own -- and a square tube along each light's bottom rail, on the frame's face 3 cm in front of the glass. 780
sources and 780 marks; no paths (the first cut drew its drying lines' head). `wear=debug` with every other feature at 0
shows it alone (the command above). The portal's glass sits deep in its vestibule's shade: `portals_debug_exposure.png`
shows the three portals' glass at +2.5 stops, each its own.

### Published for the features that follow

`ctx.field("glass_grime", key)` for a feature that NEEDS glass_grime (none does):

- `lights`: every light per instance, `dict(id, object, instance, window, kind, facade, s0, s1, z0, z1, width, height,
  arch, cleaning, kept, shelter, rain, measured, age, neglected, missed, keep, jitter, raw, film, gather, reach, corners,
  corner_w)`: where it is, its size, its cleaning, 565's measure over it, its window's draw and its own, its film before
  it saturates (`raw`, added by the critique of 2026-09-24) and after, and its gathering;
- `windows`: every window's draw, `dict(window, instance, objects, lights, tenant, age, neglected)`;
- `profile`: the constants and the formula (the critique added `film`, the knee and the ceiling, and took `veil`,
  `tint`, `blur`, `dust_rough` and `blur_max` out of `look`).

Notes for the features that follow: while this feature is on, each of the block's glass objects is replaced by its
`WEAR_glass_<name>` copy; an attribute a later feature sets on the block's glass must be set on the copies too. The
attributes `wear_glass_grime*` are this feature's (the rework redefined `_l`, `_k` and `_c`, added `_f` and `_g` and
dropped `_r`).

### What it changed in the framework

The first cut: nothing but `wear/registry.py`, which lists `glass_grime`. The rework adds one route: the Principled
BSDF's **Specular IOR Level** passes through `WEAR_layer` on the glass class (`wear/nodes.py`: `Specular` in `STATE`, one
more route in `wear_material`), so a feature can weaken a pane's reflection; on every other material the group's new
`Specular` socket stands unconnected, and like every output it returns its input exactly while the layer or the feature
is off. Measured: a full rebuild reproduces every other feature's mask and cache byte for byte (their sha256 are those
of the start of the rework); and hashing the worn block and the worn portal object by object (geometry, every attribute,
materials, transforms, visibility, custom properties; the materials' node trees by socket name) against a build with the
first cut's module and `nodes.py`, all 3676 objects and materials that are not glass grime's are identical -- rust's and
edge wear's attributes, edge wear's chipped copies and every other worn material included -- the 18 glass materials
differ only in the new route, and the first cut's head-path marker is gone. The glass copies' cut geometry is unchanged
too. Cost: none measurable. The critique of 2026-09-24 changed nothing in the framework: the rebuild reproduces every
other feature's mask and cache byte for byte, and of the worn files' objects, node groups and materials only the 84
glass copies whose lights' films saturated and the `WEAR_F_glass_grime` group differ (the portal's glass, whose films
are all under 1, is unchanged).

### Evidence

The critique of 2026-09-24's evidence is in `tests/artifacts/screens/bradbury_wear/rework/glass_grime/critique_r1/`,
from full-size stills at the scene's defaults (1920x1200, the sunlit elevations at 3840x2400, 128 spp, AgX), every
other feature on throughout; "before" is the rework's look, rendered from this build with the rework's module (its
masks and caches reproduced byte for byte), "off" is `wear_glass_grime=0`:

- `closeup_before_off_after_debug.png` and `medium_before_off_after_debug.png`: before | off | after | the debug view
  with glass grime alone;
- `cu_E_f34_glass_1to1.png`, `cu_E_top_glass_1to1.png` (with the changes x6), `cam_st_portal_windows_1to1.png` (the
  pre-wear still | before | after), `N_mid_1to1_stack.png`, `S_mid_1to1_stack.png`: the critique's own crops again;
- `glare_bway_blur.png`: the sun's glint on `mesh__1613`, off | the rework | the new dust with the rework's blur |
  after;
- `<pose>_before_off_after.png`: `arched_bway`, `E_f34`, `E_top`, `glare_bway`, `shade_3rd`, `medium_3rd`,
  `storefront_3rd`, `transoms_3rd`, `portal_bway` and the five cameras;
- `numbers.json`: the per-light ratios by film on the three elevations (`lights`), the st_portal lights against the
  pre-wear still, the glare, the calibration boxes, the difference stats, the layer off against the pre-wear stills
  and the `lighter` counts; `E4k_lights_after.png`: Broadway's 120 upper lights boxed where they were measured, each
  with its film and its on/off ratio; `filmmap/`: every light's film on the five faces, saturated; `poses.json`;
- `renders/` (`before/`, `off/`, `after/`, `wearoff/` the layer switched off, `debug/`, and `iter_blur006/` the new
  dust with the rework's blur), `diff/` (off against after and before against after x8, and the `lighter` heat maps).

| camera | off vs on: mean; share over 2 levels | before vs after | the layer off vs the pre-wear still |
|---|---|---|---|
| `st_up` | 0.126; 3.1% | 0.422; 7.1% | 0.0059; 0.002% |
| `st_along` | 0.138; 1.7% | 0.212; 2.5% | 0.0065; 0.003% |
| `hero_3q` | 0.111; 1.4% | 0.197; 2.6% | 0.0169; 0.006% |
| `st_corner` | 0.092; 1.2% | 0.127; 1.7% | 0.0321; 0.059% |
| `st_portal` | 0.415; 9.7% | 0.990; 14.9% | 0.0162; 0.025% |

The layer switched off renders the pre-wear stills at the noise floor on all five cameras (the framework's table: the
untouched block rendered again differs from them by 0.0067 to 0.0310). On the close-ups, off vs on: `closeup` 0.41,
15.0%; `medium` 0.33, 9.8%; `shade_3rd` 0.44, 2.8%; `arched_bway` 0.57, 20.3%; `glare_bway` 0.33, 9.9% (the rework's
blur: 16 levels at most now, 103 before); `storefront_3rd` 0.053, 0.012%. The Broadway portal's arch-moulding flip
(below) is still there, the renderer's tie-break, not the glass.

The rework's evidence, in `tests/artifacts/screens/bradbury_wear/rework/glass_grime/` (the first cut's stays in
`tests/artifacts/screens/bradbury_wear/glass_grime/`), sheets at half size from full-size stills at the scene's defaults
(1920x1200, 128 spp, AgX); "before" is the first cut, rendered from the frozen `wear_snap_rework_before/` scene (every
other feature as it was before the review too):

- `closeup_before_after_off_debug.png`: the close-up above, before | glass grime off | after | the debug view with glass
  grime alone; `closeup_strengths.png`: 0 | 1 | 3; `closeup_debug_alone_all.png`;
- `medium_before_after_off_debug.png`: Broadway's floors 2 to 4 square on, every window its own, the close-up's three at
  the bottom middle; `medium_debug_alone_all.png`;
- `<pose>_before_off_on.png`: `shade_3rd` (3rd Street in shade), `arched_bway` (the top floor), `storefront_3rd` (nearly
  clean), `portal_bway`, `glare_bway` (the sun's glint on a dusty pane), `medium_3rd`, and the five cameras;
- `portals_debug_exposure.png`: the three portals' glass in the debug view at +2.5 stops, each its own film;
  `iter_glare_blur_specular.png`: the glint at `BLUR` 0.15, 0.06, and 0.06 with the weaker specular;
- `filmmap/`: every light's film on the five faces at the debug view's gain, a whole facade at a glance;
- `references/`: the colour photos (unaltered), the crops, `references.json`; `poses.json`;
- `renders/` (the full-size stills, the layer off and the untouched block again for the five cameras), `diff/` (off
  against on and before against after, x8, `summary.json`), `iter/` (the iterations: the first look, whose blur erased
  the reflections, the cover, veil and blur sweeps, the glare and specular tests).

| camera | off vs on: mean; share over 2 levels | before vs after | the layer off vs the pre-wear still | the untouched block again vs the pre-wear still |
|---|---|---|---|---|
| `st_up` | 0.443; 7.9% | 0.739; 12.6% | 0.0065; 0.002% | 0.0086; 0.005% |
| `st_along` | 0.285; 4.9% | 0.378; 5.7% | 0.0065; 0.003% | 0.0066; 0.004% |
| `hero_3q` | 0.237; 3.0% | 0.460; 6.0% | 0.0165; 0.006% | 0.0161; 0.006% |
| `st_corner` | 0.170; 2.1% | 0.322; 4.3% | 0.0299; 0.049% | 0.0318; 0.057% |
| `st_portal` | 1.157; 16.9% | 1.341; 20.9% | 0.0161; 0.024% | 0.0161; 0.024% |

On the close-ups, off vs on: `closeup` 1.57, 20.4%; `medium` 1.23, 18.0%; `shade_3rd` 0.40, 4.5%; `arched_bway` 1.91,
26.7%; `storefront_3rd` 0.073, 0.011%; `medium_3rd` 0.29, 3.4%. The layer switched off renders the pre-wear stills at the
noise floor on all five cameras (the untouched block rendered again differs from them as much). One known flip, not the
feature's: in `portal_bway` 60 pixels of the Broadway portal's arch moulding (a slot's end, where two of the portal's
faces are coplanar) change between glass grime off and on, whose glass copies change the scene's objects and so the
renderer's tie-break there; the first cut's toggle flipped the same spot, and the portal's own glass there is clean. Cost:
about 1 s on a still of 15 to 30 s, as before.

## Pigeon marks on perching ledges (AI 572)

`wear/features/pigeon.py` (`wear_pigeon`, red in the debug view): the droppings of the few feral pigeons that roost on
the block. Pigeons use an ornate old facade's horizontal surfaces -- cornice tops, window sills, the tops of string
courses and capitals -- the more so where the surface is high above the street, deep enough to stand on, sheltered from
above, or tucked into an inner corner against a return (buildingconservation.com, "Bird damage"). Their droppings are
whitish: drops heaped where the bird sits and spattered round it, and short drips that run over the edge onto the face
below; under a heavy deposit the uric acid etches the stone ("Behaviour of Pigeon Excreta on Masonry Surfaces"). The
Commons photos of the Broadway portal show a pigeon on the portal's crown moulding and anti-perching spikes along it and
along the floor 2 ledge: the perches are used, and the building is kept. So the block carries two or three roosts, each
on a perch found on the ledge geometry, each composed of droppings of its own, with one to three drips over its edge,
each composed on the moulding it runs down; nothing is noise, and every rebuild reproduces them exactly.

```
blender -b -P wear_layer.py -- features=pigeon                          # its ledges, roosts, drips and mask (about 25 s), the rest cached
blender -b -P render_wear.py -- wear_pigeon=0 cam=18.10,6.30,5.62:17.38,6.46,5.34:50   # off; 1 is the default
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 wear_rust=0 wear_efflorescence=0 wear_edge_wear=0 wear_glass_grime=0 wear_mortar_erosion=0 cam=18.10,6.30,5.62:17.38,6.46,5.34:50
```

### One roost at a time (rework 2026-09-23)

The first build marked every perch it found by one rule: a pile at every return, a drip or two from every pile, a veil
along every used edge and a thin line along the whole crown top -- 1249 roosts, 360 drips and 50,762 veil columns, the
same heap and the same drips at the same corner of every window. The user saw a pattern: *"the pigeon marker looks like
a pattern, it was placed at the same position in all windows. there could be 2 or 3 in the entire building, and they
should be put at different positions and different shape"* (2026-09-23; the review asked every feature for marks that do
not repeat identically from one instance to the next). A kept building has a few birds that keep to a few spots, for
reasons the model does not carry: where a bird happened to settle, where the spikes are not, a sill nobody reaches to
clean. So the perches the scan finds are only candidates now, and the build chooses two or three of them and composes
each roost's deposit on its own. The veil, the crown's line and the per-window piles are gone.

Every draw comes from `draw()`: the sha256 of `pigeon:` and a key, two bytes a uniform (more than sixteen carry on in
the sha256 of the key and `#1`, `#2`, ...). A range is the mean of two uniforms, the middle likelier than the ends. The
keys are stable ids: `count`; `roost:<face>:<the return's s>:<the ledge's height>` for each candidate corner
(`E:21.34:5.42`); `drip counts`; and, under a chosen roost's id, `:bird`, `:drop:<i>`, `:stray:<i>`, `:drips` and, under
a drip's `:drip:<i>`, its own `:try:<t>`, `:head`, `:shape`, `:arris:<k>` and `:tail`. A change elsewhere on the model
reshuffles nothing drawn for a place that stays.

| drawn | for | bounds |
|---|---|---|
| how many roosts the building holds | the building | three with `COUNT_P3` 0.50, two otherwise |
| its key, `u ** (1 / p)`: a draw in which a corner's chance follows its plausibility p, and which never moves when another corner comes or goes | each candidate corner | 0 to 1 |
| where the bird sits tucked in (its pile): along the ledge from the return, and in front of the back wall | each roost | 5 to 16 cm (`ROOST_X`); 4 to 11 cm, at most half the standing depth (`ROOST_Y`) |
| where it stands to watch the street (its perch): along from the pile, and behind the outer edge | each roost | -12 to +28 cm (`PERCH_DX`: in front of the return's end too, where the ledge runs on); 6 to 15 cm, at most half the depth (`PERCH_Y`) |
| the share of its droppings in the pile, the rest round the perch | each roost | 0.40 to 0.85 (`PILE_SHARE`) |
| how many droppings it leaves | each roost | 60 to 160 (`DROPS`) times 0.5 + p: a better perch is used more |
| how widely they spread (sd) round the pile, along and across | each roost | 2.2 to 5.0 cm, 1.6 to 3.5 cm (`PILE_SPREAD`) |
| ... and round the perch | each roost | 3.0 to 8.0 cm, 1.4 to 3.0 cm (`PERCH_SPREAD`) |
| the share of smears (trodden or rain-dragged along the ledge), of fresh droppings still showing their dark core, how many strays lie further along | each roost | 0.08 to 0.30 (`SMEAR`), 0.15 to 0.55 (`CORE`), 1 to 5 (`STRAYS`) |
| a dropping's place | each dropping | a normal round its pile or perch, drawn again (`TRIES` 10) while it falls off the ledge's top |
| its age, 0 fresh to 1 weathered, which sets its thickness (fresh thick and white, old a thin grey-beige film) | each dropping | even over 0 to 1 (`AGE`); a stray 0.40 to 1.00; thickness 1.00 to 0.25 (`AMOUNT`), give or take 15% |
| its half-length (a log-normal), elongation and turn | each dropping | median 6.5 mm, log-spread 0.60, held within 2.5 to 18 mm (`SIZE`, `SIZE_LIM`); 1.1 to 2.0 (`ASPECT`); any turn |
| a lobe or two off its outline, satellites thrown round it, a smear's length, width and angle | each dropping | 0.80 have lobes 0.35 to 0.75 of it, 0.45 to 1.05 of it off its middle (`LOBES`, `LOBE_R`, `LOBE_D`); 0.35 splash satellites (`SPLASH`, `SAT_R`, `SAT_D`); smears 2.5 to 6 half-lengths long, within 0.5 rad of the ledge (`SMEAR_*`) |
| its drips: how many, where, how far and how each is composed | the building, each roost, each drip | see "Its drips, one at a time" below |

What the geometry leads: which corners are candidates at all and their plausibility, where the ledge lets a dropping
lie (its back wall and returns, its outer edge), where the edge lets a drip go over and how far the face below lets it
run.

As built (the build prints it, `pigeon: ...`, one `pigeon roost ...` line each and one line per drip):

- 1288 perch sites (52 more too narrow or too low), 1041 candidate corners: sill 362, crown foot 250 (floor 2's reveal
  floors among them), band top 174 (the top floor's reveals among them), openings row 144, portal crown moulding 66,
  cornice 34, impost course 11. The draw gave two roosts.
- **E:21.34:5.42**, a pocket of the openings row over the storefront just north of the Broadway portal (5.4 m up, H
  5.21), p 0.40, the best key of the 140 corners round the portal. The bird sits in the pocket (its pile 13 cm from the
  pocket's side, against its back) and stands on the cornice's top in front of it, 18 cm along, 49% of its droppings in
  the pile: 79 droppings (30 piled, 49 at the perch; 14 smears, 70 lobes, 31 satellites, 6 dark cores, 3 strays), 111
  cm2 of droppings (15 cm2 built up), 138 cm2 with the film round them; one drip down the cornice's moulding (below).
  Its block: 445 x 209 texels at 2.3 mm.
- **S:36.70:16.74**, the band's top in front of a top-floor window on 3rd Street, against the pier's side (16.7 m up, in
  shade), p 0.86, the best key of the 415 corners that differ from the first in family, face and storey. Its pile lies
  in the corner against the window 8 cm from the pier, its perch at the band's edge 19 cm along, 66% piled: 174
  droppings (121 piled, 53 at the perch; 28 smears, 153 lobes, 70 satellites, 17 dark cores, 4 strays), 196 cm2 of
  droppings (40 built up), 257 cm2 with the film; two drips down the band's cornice, merged under one head (below). Its
  block: 293 x 209 texels at 3.5 mm (the reveal is 0.71 m deep, so its stretch needs the coarser texel to fit).
- On the five faces' elevations the droppings' facade texels went from 227,910 in the first build to 94 in the rework
  and 41 since the drips' critique: 3rd Street 65,324, 58 and 25; Broadway 42,542, 36 and 16; the chamfer, the north
  and the west face none (`elevations/`).

### Its drips, one at a time (critique 2026-09-24)

The fresh-eyes critique of the rework found the two roosts different on their ledges but alike from the street: *"Each
shows a pair of straight, parallel, even-width pale lines about 9 cm apart, running down the moulding below the ledge
and ending at the same height"* -- 8.7 cm apart at Broadway, both cut 14 cm down at the moulding's step (z 5.28 and
5.28), 9.4 cm apart on 3rd Street (16.52 and 16.56); close up the Broadway pair read as two painted white bars, and from
the pavement, where the droppings on a top cannot be seen, that ruled pair was all the street saw of a roost. Three
things made it: the count (1 + 0.5 to 4.99 times the perch's lead) came out two at both roosts; the rule that kept drips
apart (`DRIP_GAP` 8 cm and the columns each drip's codes owned) set both pairs at its floor; and the facade's 2 cm rows
held a drip only as a straight axis with one width per row, cut flat where its value fell through a threshold, walked
in 2 cm steps that ended each at the moulding's step or a texel from it. A drip is now composed on the surface it runs
down, millimetre by millimetre, and kept in a block of its own (the curtain, under "The mask"); and the building's drips
are drawn so that no two roosts show the same thing:

- **How many.** The building's roosts take their drip counts from 1, 2 and 3 shuffled (`DRIP_COUNTS`, the key `drip
  counts`): each count is as likely for any roost, and no two roosts carry the same.
- **Where along the edge.** Round the perch, where the bird faces in with its tail over the edge: a normal with the
  roost's own spread, `DRIP_SPREAD` 1.5 to 18 cm (sd). A bird that always faces in at one spot leaves drips that merge,
  one that wanders along the ledge leaves them more than 20 cm apart. A place where the lip starts no path is drawn
  again (`TRIES`).
- **How far each runs.** A roost's n drips take one n-th of `DRIP_L` 4 to 30 cm each, in a drawn order (stratified): of
  two, one runs under 17 cm and one over; three split the range in thirds. The run is along the surface, the paste's and
  its tail's together.
- **The rest** each drip draws for itself (the table below): its heaviness and age, the paste's width, its head, flare,
  taper, neck, slugs and bends, whether it ends in a bulb or a thin tail, and how far it holds to an underside.

**Its path** (`trace_drip`), walked as runoff's film is, by level rays from the street every `PROFILE_DZ` 1 mm down its
axis to `PROFILE_H` 45 cm: it starts on the ledge's own front (masonry within `FRONT_TOL` 3 cm of the edge's depth, at
or under the top) and runs on over masonry while a step stands no more than `CATCH_P` 3 cm out (further, a surface
standing out catches it on its top: `caught`) and no more than `CREEP_P` 4.5 cm back (a bead, a cove, a fillet's rounded
arris are crept round; deeper, it drips off the edge: `edge`), to its run along the surface (`length`), or until the
masonry ends (`surface`). Its paste hangs off an underside that faces down further than its cling (`CLING` 0.72 to 0.98,
its normal's z) for `HANG_MIN` 6 mm on end; the rounding of an arris it creeps round is no underside. Its thin liquid
tail follows whatever surface the path does. The path notes the arrises it crosses: a step of more than `ARRIS_STEP` 4
mm, or a turn of the surface by more than `ARRIS_DEG` 20 degrees over two samples; convex where it turns further down,
concave where it turns back. On both roosts' mouldings the path crosses a fillet or fascia, a crept step of 1.4 to 2 cm,
and a bed moulding's ovolo whose foot faces down at 0.89 (Broadway) and 0.83 (3rd Street). Broadway's ovolo ends on a
2.4 cm fillet over a 5 cm step back to its teeth (9 cm between them), where a drip drips off; 3rd Street's on a 2 cm
fillet over teeth only 1 cm back, which a drip creeps onto and runs down, to drip off their foot 5 cm over the band (or
off the fillet, 5.5 cm over the gap between two teeth).

**Its shapes** (`drip_shapes`), in (s, t), t down the surface along its path:

- the **head**, the dropping that went over the lip: an ellipse `HEAD_W` 1.7 to 3.0 times the paste's half-width wide
  and `HEAD_H` 3.5 to 9 mm tall (half), its middle `HEAD_AT` 1 to 4 mm under the lip, turned by up to `HEAD_TILT` 0.3
  rad, with one to three lobes (`LOBE_P` 1, 0.6, 0.25; `HEAD_LOBE` 0.30 to 0.65 of it, 0.5 to 1.0 of it off its middle,
  along the lip or down: within `LOBE_TURN` 0.85 half-turns of straight down, never up past the lip) and up to `SPATTER`
  two spatters round it (1.5 to 2.5 mm, 1.3 to 2.3 of it off its middle). Its part on the top lies among the droppings:
  a splat 0.9 of the head's width along the edge and `LIP_D` 3 to 8 mm deep (half), reaching the edge, set off along it
  by up to 0.3 of the head.
- the **paste's run**, a chain of round segments every `DRIP_SEG` 1.5 mm: its half-width `DRIP_W` 2.5 to 6 mm where it
  leaves the head, `FLARE` 30 to 90% wider right under it (e-fold `FLARE_E` 1.2 cm), thinning to `DRIP_THIN` 40 to 75%
  of that at the paste's end as (t / its run) ** `DRIP_TAPER` 0.5 to 1.3; in three drips of four (`NECK_P`) a neck, to
  `NECK_D` 50 to 85% over `NECK_L` 0.5 to 1.5 cm (e-fold) at `NECK_AT` 25 to 70% of the run; up to `SLUGS` three slugs,
  swellings where the paste paused on its way down (`SLUG_W` 1.25 to 1.85 times wider and thicker, e-fold `SLUG_L` 0.6
  to 1.5 cm, at 15 to 95% of the run); thinned to `ARRIS_NECK` 70 to 92% over a convex arris (stretched over it) and
  gathered to `ARRIS_POOL` 105 to 125% in a concave one (e-fold `ARRIS_E` 4 mm). Its axis leans by up to `LEAN` 1.5% of
  its run, bends `BENDS` one to three times by `BEND_A` 1.5 to 4.5 mm either way (each over `BEND_L` 1 to 3 cm, at 10 to
  90% of the run) and slips `ARRIS_SHIFT` 0.4 to 2.5 mm sideways under each arris: a meander of a few millimetres that
  follows the moulding.
- its **end**: a *pendant*, `PENDANT` 1.5 to 2.3 times the half-width there, where the paste hangs off an underside or
  the surface under it ends; else, at its own run, a *bulb* (`END_BULB`, half the drips: `BULB_R` 1.25 to 2 times the
  half-width there, at least `BULB_MIN` 2 mm, `BULB_LONG` 1 to 1.45 times as long as wide), or a *tail* (the other half:
  its paste runs `PASTE` 35 to 75% of its run, and the liquid the rest, `TAIL_W` 0.9 to 1.6 mm half-width, `TAIL_V` 12
  to 30% of the head's deposit, broken into `TAIL_DASH` two to four dashes with gaps of `TAIL_GAP` 15 to 45% of a dash
  between them, thinning, ending in a `DROPLET` 1.2 to 2.2 mm). A tail runs on where the paste could not, round a
  moulding's underside and over its foot onto the next member.

The deposit (thickness): the head 0.95 of the drip's heaviness (`DRIP_V` 0.40 to 1.00), its lobes 0.80, the spatter
0.70, the run 0.75 at the head falling to 0.50 at its end (`BODY_V`, times the square root of what the neck, slugs and
arrises make of its width: thicker in a slug, thinner in a neck), a bulb 0.90, a pendant 0.95; a dome across each shape,
the chain's segments counted once. Each drip's age (`DRIP_AGE` 0 to 0.85) sets its tone.

| drawn | for | bounds |
|---|---|---|
| the drip counts | the building | 1, 2 and 3 shuffled among the roosts (`drip counts`) |
| how widely its drips spread along the edge round the perch; the film's blur round them | each roost | 1.5 to 18 cm (sd, `DRIP_SPREAD`); 3 to 5 mm (`HALO_DE`) |
| the order its drips take the shares of `DRIP_L` | each roost | a drawn order |
| its place along the edge (and again, `:try:<t>`, where the lip starts no path) | each drip | a normal round the perch |
| its run; heaviness; age | each drip | its share of 4 to 30 cm; 0.40 to 1.00; 0 to 0.85 |
| the paste's half-width, flare, thinning and taper | each drip | 2.5 to 6 mm; 30 to 90%; to 40 to 75%; 0.5 to 1.3 |
| its head: width, height, depth under the lip, turn; lobes and spatter | each drip (`:head` for lobes and spatter) | 1.7 to 3.0 half-widths; 3.5 to 9 mm; 1 to 4 mm; +-0.3 rad; one to three lobes, none to two spatters |
| its neck, slugs and bends; its lean | each drip (`:shape` for slugs and bends) | as above |
| its slip and its thinning or gathering at each arris | each arris it crosses (`:arris:<k>`) | 0.4 to 2.5 mm either way; 70 to 92% (convex), 105 to 125% (concave) |
| its end: bulb or tail; the paste's share of a tailed run; a bulb's, a pendant's size | each drip | half and half; 35 to 75%; as above |
| its cling | each drip | 0.72 to 0.98 of straight down |
| its tail's width, deposit, dashes, gaps and droplet | each drip (`:tail`) | as above |
| where its head's part on the top lies | each drip | 3 to 8 mm behind the edge, +-0.3 of the head along it |

As built (the build prints one line per drip; published as `drips`):

| roost | drip | run drawn | paste | end | reaches (along the surface) | stops at z | what it looks like |
|---|---|---|---|---|---|---|---|
| Broadway, E:21.34:5.42 (one drip, spread 4.8 cm) | s 21.482 | 14.4 cm, the whole range its stratum | 14.4 cm, its own | a bulb | 14.6 cm | 5.302, 11.4 cm under the lip, 3 cm above the ovolo's foot | fresh (age 0.07), heaviness 0.59; a head 10.3 x 6.1 mm with two lobes and a spatter; 4.0 mm half-width, necked to 0.63, three slugs, bends of 2.6, 1.9 and 3.3 mm; it crosses the fillet, creeps round its 1.4 cm step and runs three quarters of the way down the ovolo |
| 3rd Street, S:36.70:16.74 (two drips 9 mm apart, spread 9.8 cm) | s 36.569 | 20.5 cm, the upper half | 18.1 cm: it hangs off the ovolo's foot (facing down 0.83, its cling 0.78) | a pendant | 18.6 cm | 16.594, 1.4 cm above the fillet | age 0.51, heaviness 0.67; a head 12.4 x 7.9 mm with two lobes; 4.6 mm, necked to 0.64, three slugs, bends of 3.5 and 3.6 mm |
| | s 36.578 | 11.0 cm, the lower half | 11.0 cm, its own | a bulb | 11.3 cm | 16.649, halfway down the ovolo | older (0.78), heaviness 0.68; a head 11.8 x 4.9 mm with a lobe and a spatter, merged with the first's into one; 5.2 mm, necked to 0.71, one slug, a bend of 3.3 mm |

So from the pavement Broadway shows one drip, a white head on the lip and a narrowing run with a bulb three quarters of
the way down the moulding, and 3rd Street a broad grey head over a fork: one short run with a bulb, one longer with a
pendant at the moulding's foot. Neither runs over the step onto the next member in this draw -- Broadway's stops above
it on its own run, 3rd Street's longer paste hangs at it; tails and the higher clings do. The drips' draws salted 24
ways over the same two roosts (a check, not the build) gave counts of one, two and three about
equally at each (9, 9 and 6 at Broadway; 7, 8 and 9 on 3rd Street), 48 tails and 47 bulbs of 95 drips, 79 pastes that
stopped on their own, 14 that hung off an underside and 2 at an edge, 28 drips running over the ovolo's foot onto the
fillet (and on 3rd Street onto the teeth), and neighbours from 2 mm (merged) to 27 cm apart: 11 of 47 pairs merged
under 1.5 cm, 3 over 20 cm, the median 3.5 cm.

### The ledges

Found on the model, not listed, as the first build found them. The flat masonry tops at least `H_MIN` 4.4 m over the
pavement give the heights to scan (their triangles facing up, binned by 5 mm, bins within 1.2 cm cast as one: a sill's
cap and the reveal floor 5 mm above it). At each height, every 2 cm along each face (every third column first, then
every column near what that finds), a level ray from the street just above the height and one just below it: where the
surface below stands at least `STEP_MIN` 6.5 cm in front of the one above, a ray straight down between them confirms a
flat masonry top at that height, and its **standing depth** runs from what stands on it (a wall, a pier, a window frame:
the upper ray's hit) to its outer edge (the lower ray's). A top with nothing on it (the crown's) runs back to its own
inner edge, found by halving (to 6 mm). Tops a few millimetres apart whose depths touch are one surface (a sill's cap
and the window reveal's floor behind it; the ground floor crown's foot and floor 2's reveal floors). The fire escapes
are looked through, as runoff's elevation does. 460,247 rays, about 22 s. Each ledge keeps its footprint per 2 cm column
-- its back's and edge's depth and the heights found -- which a roost's deposit lies on.

| ledge | height | sites | length | standing depth | use: median, max |
|---|---|---|---|---|---|
| the ground floor cornice | 5.42 | 112 | 150.7 m | 0.21 | 0.17, 0.56 |
| the portals' crown mouldings | 5.42 | 69 | 14.0 m | 0.33 | 0.22, 0.56 |
| the openings row beside them (the openings' floors) | 5.42 | 72 | 13.0 m | 0.46 | 0.49, 0.49 |
| the ground floor crown's foot: its shelf; the rest | 6.09; 6.29 | 19; 216 | 70.5; 89.8 m | 0.07; 0.34 | 0.00, 0.21; 0.17, 0.54 |
| floor 2's reveal floors, on the crown | 6.29 | 81 | 85.3 m | 0.51 | 0.22, 0.59 |
| floor 3's sills: before the windows; before the mullions | 9.64 | 81; 93 | 85.3; 17.7 m | 0.26; 0.08 | 0.23, 0.42; 0.02, 0.03 |
| floor 4's sills, the same | 12.64 | 81; 120 | 85.3; 23.8 m | 0.26; 0.08 | 0.35, 0.58; 0.03, 0.04 |
| the capitals' abaci | 15.63 | 22 | 19.6 m | 0.14 | 0.36, 0.39 |
| the band's top between floors 4 and 5 | 16.74 | 104 | 93.7 m | 0.40 | 0.44, 0.88 |
| the band's top in the top floor's window reveals | 16.74 | 81 | 83.8 m | 0.71 | 0.74, 1.00 |
| the impost course | 18.05 | 132 | 76.4 m | 0.10 | 0.14, 0.82 |
| the crown's top | 20.73 | 5 | 181.0 m | 0.90 | 0.56, 0.56 |

What the scan leaves is as telling: the crown's dentil shelf and the band's moulding step less than 6.5 cm (no standing
room), the portal's keystone and capitals stand at 4.2 m (under `H_MIN`), and a pocket or a mitre narrower than
`SITE_MIN` 10 cm (a bird's width) is a sliver.

### The sites, their use and the candidates

Along a ledge a **site** is a stretch with one wall behind it; it ends where that wall steps by `RETURN_MIN` 3 cm or
more. Stepping forward, the step is a **return**: an inner corner a bird tucks into (a window reveal's jamb, a pier's
side, a pier block standing on the cornice, an opening's side), which tucks it in as deep as the step or the ledge,
whichever is less; stepping back, or where the ledge ends, it is none. Per column, a site offers standing room (a
smoothstep of its standing depth from `DEPTH` 6.5 to 15 cm, and `ROOM_GAIN` 60% more from `ROOM` 0.25 to 0.60 m), height
(none under `H_MIN`, `HEIGHT_FLOOR` 0.35 at 5 m, all of it from 15 m: the low ledges are within a ladder's reach and
kept clean) and protection over the space a bird occupies (565's `shelter`, or `ENCLOSE` 0.60 of its `1 - open`; an
exposed run keeps `EXPOSED` 0.35), their product its **use**, at most 1.

A **candidate** is a return at least `TUCK` 3 cm deep: its plausibility p is the site's use at that end times the
smoothstep of the tuck from 3 to 15 cm; a corner under `P_MIN` 0.10 is none. The crown's top has no returns, so no
roost. The choice (`choose`):

- the **first** roost is the best key among the corners on the Broadway front (`FRONT`) within `FRONT_REACH` 8 m of the
  Broadway portal's axis (found from the portal instances' extent: `PORTAL_C` at s 15.93) and under `FRONT_H` 15 m over
  the pavement. It is where the Commons photo shows a pigeon on the portal's crown moulding, and where the street views
  look: from the pavement a top above eye level cannot be seen, so the street sees a roost by its drips, and under the
  band they are near enough to read;
- **each next** is the best key among the corners that differ from every roost chosen in family (the ledge the bird
  stands on: sill, crown foot, band top, openings row, portal crown moulding, cornice, impost course, abacus, crown top;
  a window's sill is named for its ledge, so a top-floor reveal is the band top and floor 2's reveal floor the crown's
  foot), in face, and by `STOREY` 2.5 m in height.

### A roost's deposit

A roost's deposit lies on its **stretch**: its ledge's columns from `X_BEHIND` 25 cm past its return (in front of the
return's own wall, where the ledge runs on) to `X_OUT` 75 cm into its site, as far as the ledge runs unbroken. The bird
has two places (the table above): tucked into the corner facing out, its droppings falling behind it into a pile
against the back wall; and at the edge in front, watching the street, its droppings falling a few centimetres behind
the edge, and when it turns to face in, over it (the drips). On a shallow sill the two nearly meet; in a deep reveal
they lie half a metre apart. Each dropping draws its own place round one of them, its age, size, elongation, turn, lobes
and satellites, or is a smear; a fresh one may show its dark core; a dropping drawn off the top (behind a wall, past the
edge, where the ledge ends) is drawn again. The walls cut a dropping that lands against them and the edge one that
overhangs it: the ledge's own geometry gives the outline there. Each drip's head adds its part on the top at the edge.

Each dropping is an ellipse (or a capsule for a smear), a dome `1 - q^2` across it. They are rasterised on the roost's
**block**, its stretch unrolled in (s, depth) at `TAU` 2 mm a texel (coarser where the stretch would not fit the atlas's
free rows or its face's region), into four fields:

- the **outline** of their union, as the signed distance to its edge (0.5 on it, over `SDF_SPAN` 8 mm to either side):
  the lookup's bilinear filter keeps a curved edge smooth and crisp at any texel, where a thresholded coverage turns to
  texel staircases (the first cut of this rework showed them);
- the **deposit**, `1 - exp(-SAT x the domes' sum)` (`SAT` 1.25): where droppings overlap it builds up, and round the
  whole the `HALO` 0.25 film, the deposit blurred 1.2 to 2.5 cm (drawn per roost);
- the dark **cores**' outline, as the droppings';
- their **age**, each dropping's weighted by its dome (the roost's mean at a rim, where a dome thins to nothing).

Nothing inside a mark is noise: its irregularity is its droppings', their outlines cut by the ledge.

### The mask

`masks/pigeon.png`, 2 cm, four 8-bit channels (9620 x 1060, 41 MB of VRAM). Everything the shader reads lies in
**blocks** in the atlas's free rows under `Z_DRIP` 4.5 m (rows 0.1 to 4.4 m, where no drip is), each ringed with
`BLOCK_PAD` 3 empty texels, in its own face's region, one atlas texel per block texel at the block's own scale:

- **a roost's top block**, its stretch in (s, depth) (above): R the droppings' outline, G their deposit, B the cores'
  outline, A their age;
- **a roost's curtain block**, the face under its edge in (s, z) at `TAU_C` 2 mm (coarser only where it would not fit),
  from `CURTAIN_UP` 6 mm over the lip (its arris) to 1.5 cm under the lowest drip's shapes and 2.5 cm past them along
  the face (`CURTAIN_PAD`). A drip's shapes lie in (s, t) along its own path, so each texel is filled at the t where its
  drip's path passes that height (`t_along`: over the lip on up the arris, under its end on down at its last slope), and
  a drip on a moulding's underside is as long as its paste ran there however little height that takes. R the outline of
  the heads', runs', bulbs' and pendants' union as a signed distance (a tail and its droplet are deposit only: soft);
  G their deposit, `1 - exp(-SAT x the sum)` with the `HALO_D` 0.30 film round it, blurred 3 to 5 mm; B the depth of the
  surface the drip nearest the texel ran on at that height, over its whole box (`enc_d`, -0.70 .. +1.00), so the
  lookup's filter is exact at an edge; A their age, each drip's weighted by its deposit. As built 43 x 68 texels
  (Broadway) and 43 x 85 (3rd Street).

A ledge's top is one row of the atlas (every point of it stands at one height) and a drip's outline needs millimetres,
so the shader cannot read either where it lies. It holds each block as constants instead -- the `roosts[i].top` and
`roosts[i].curtain` its build published, which it reads as `g.result` -- and reads them with two lookups:

- a surface facing up (`upward` 0.85 to 0.95), of masonry, on a top's face, within 6 mm of the heights its stretch was
  found at (plus half their spread; 3 mm soft) and inside its extent reads the top block at `u = (off + c0 x 2 cm + (S -
  s_lo) x 2 cm / tau) / W`, `v = (r0 x 2 cm + (D - d_lo) x 2 cm / tau) / H`;
- any other masonry surface on a curtain's face inside its extent (s_lo .. s_hi, z_lo .. z_hi) reads the curtain block
  at the same u and `v = (r0 x 2 cm + (Z - z_lo) x 2 cm / tau) / H`, and takes it where its depth D lies within 1.5 cm
  of the depth the block holds (fading to 3 cm): the lip's arris, a fascia, a moulding's underside, the next member,
  but not the wall behind the lip nor a return beside a drip.

The facade's own rows (above `Z_DRIP`) hold only each drip's deposit pooled to 2 cm in R, for the published field and
the layer's elevation images (`elevation(canvas)` draws it grown by a texel to either side, so the elevations' 5 cm grid
does not fall between a centimetre-wide drip's texels); the shader does not read them. 16 texels on Broadway and 25 on
3rd Street (the rework's facade rows held 36 and 58).

### The look

Inside a dropping's outline (its edge within `EDGE_W` 0.05 of the code's 0.5, about a millimetre) its crust covers
`CRUST_RIM` 0.30 at its thin rim and all of `CRUST_COVER` 0.88 where its deposit passes 0.05 to 0.60 (`CRUST`; never
more than `COVER_MAX` 0.94). Its colour is its age's: `FRESH_COL` (0.62, 0.61, 0.57) linear, an off-white, while it is
younger than `TONE` 0.15, weathering to `OLD_COL` (0.26, 0.245, 0.21), a grey-beige, by 0.85; where droppings build up
(`WHITE` 0.60 to 0.95 of deposit) it whitens by up to `BUILD` 0.35. A fresh dropping's core, where it shows, is
`CORE_COL` (0.10, 0.095, 0.075) at `CORE_COVER` 0.55. Round the droppings the film is a grey-brown stain, `STAIN` (0.21,
0.20, 0.18), from `THIN` 0.03 to 0.20 of deposit, at most `STAIN_COVER` 0.45, held `JOINT_FILM` 60% longer in a brick
top's joints; where the film round the heaviest runs `ETCH_T` 0.08 to 0.25 the surface is etched, `ETCH` 0.35 toward its
own colour `ETCH_GREY` 0.30 greyed and tinted `ETCH_TINT` (1.12, 1.09, 1.02). A dropping stands `RELIEF` 0.6 mm proud
where its deposit is whole: a Bump node on the surface's own normal, which the renderer reads again at its offsets (2
mm, the first try, tilted every rim toward the sun and turned the weathered droppings white).

A drip is urates carried over the edge, translucent and chalky where it thins: inside its outline it covers `DRIP_RIM`
30% of `DRIP_COVER` 0.82 where its deposit is thin and all of it where the deposit passes `DRIP_T` 0.20 to 0.75 -- a
film the stone shows through along its run, a crust at its head, slugs, bulb and pendant; outside its outline its tail
and the film round it cover up to `FILM_D` 0.35 from `FILM_T` 0.04 to 0.25 of deposit. Its tone is `DUNG` (0.40, 0.385,
0.35), a chalky warm grey, where it is thin or old, toward `FRESH_COL` where it is both thick and young (its age as a
dropping's, whitened where it builds up); it is etched round its heaviest as the droppings' film is, and stands
`RELIEF_D` 0.4 mm proud where its deposit is whole. Everything either covers turns at least `MATTE` 0.90 rough. It
stands at ORDER 260, over the other deposits (soiling 200 .. rust 250), under the glass (300); every change is mixed
from the chain's input by an amount with the strength a factor, so strength 0 renders exactly what came in.

### Calibration

Measured in rendered pixels at the scene's defaults: the linear luminance over the pixels the pigeon changes (by more
than 3% and by more than 0.004, 0.002 in shade), against the same pixels with `wear_pigeon=0` (every other feature on in
both), in a box round the drips for the face-on and street views and over the whole frame for the close-ups from above
(`critique_r1/diff/calibration.json`; in brackets the rework's, measured the same way on the same poses):

| | the Broadway roost, sun | the 3rd Street roost, shade |
|---|---|---|
| from above, the droppings on the top and the drips' heads: 10th percentile, median, 90th; the brightest 6 px box (a heap) | 1.09, 1.38, 1.71; 2.37 (1.09, 1.36, 1.70; 2.37) | 1.31, 1.86, 4.08; 6.35 (1.28, 1.78, 4.08; 6.37) |
| the drips face on, from under the cornice: 10th percentile, median, 90th; the brightest box (a head) | 1.08, 1.25, 1.49; 2.34 (1.08, 1.23, 1.54; 2.40) | 1.32, 1.72, 2.56; 5.02 (1.20, 1.58, 1.93; 2.40) |
| the drips from the far pavement (100 and 135 mm): median; the brightest box; pixels changed | 1.21; 1.35; 181 (1.19; 1.32; 408) | 1.67; 2.32; 323 (1.51; 1.60; 472) |

The droppings read as the rework's did (the tops changed only at the drips' heads). A drip's paste reads as bright as
the rework's bars did in sun, its thin parts a little fainter and its head a little whiter; in shade the merged pair's
broad head reads five times the dark terracotta, as a heap on a top does. From the pavement each roost now changes about
half the pixels it did, one drip or one forked mark where there was a ruled pair. The first build's calibration, on a
floor 4 sill's heap, was 1.88 in sun and 4.96 in shade: a dropping reads about as it did, and what changed is where and
how many. The references (`references/`, unaltered, as the first build studied them) bound the amount rather than
measure it: the Commons photos, about 0.5 cm a pixel on the portal's crown moulding, show a pigeon standing on that
moulding in front of a pier block, spikes along the moulding and the floor 2 ledge, and no whitewash on the spiked tops
or the unspiked ones. So the building holds two or three roosts, each a lived-in spot rather than a stain: plain close
up, a small white patch from across the street and, from the pavement, one drip under the Broadway roost's cornice, a
white head and a thin run (in `st_portal` a faint tick right of the portal, 32 pixels over 5 levels where the rework's
pair made 68). `DEFAULT_STRENGTH` stays 1.0; `wear_pigeon` 0.5 halves the covers, 2 doubles them up to their caps.

### The debug view

Red: every dropping in full (its outline) and its deposit from 1 / `DEBUG_GAIN` (a quarter) of the most, and every
drip in full with its film. Each roost is marked by a line along its stretch's back edge `MARK_UP` 20 cm over the top,
clear of the deposit on it, and an octahedron `ROOST_UP` 20 cm over its pile; each drip by a short path under where it
stops (2 to 8 cm below it, in front of the surface). 4 sources (2 lines, 2 roosts), 4 marks (each roost's deposit and
its drips), 3 paths. The perches that were not chosen are not drawn: they are candidates, listed in the published data,
not marks. `wear=debug` with every other feature at 0 shows it alone (the command above).

### Published

No feature NEEDS pigeon (573's NEEDS are soiling, runoff, washed and street grime). `ctx.field("pigeon", key)`:

- `sites`: every perch site, `dict(id, kind, family, facade, s0, s1, z, H, depth, edge, back, open, protection, use,
  use_max, ends, top, behind)`;
- `candidates`: every corner considered, `dict(id, site, family, facade, side, s, z, H, tuck, gap, p, key, chosen)`;
- `roosts`: the chosen, `dict(id, site, family, kind, facade, side, s, z, H, tuck, gap, p, key, rule, pool, bird,
  counts, drips, stretch, deposit, top, curtain)`: `bird` holds its draws (the pile's and the perch's place and spread,
  the pile share, the droppings' count, the smear and core shares, the film's blur, its drips' count, spread and film
  blur), `counts` what was composed, `deposit` its areas in cm2, and `top` and `curtain` what the shader reads;
- `drips`: `dict(roost, facade, k, slot, s, z_top, z_stop, run, paste, tail, reach, end, paste_end, stop, hang, value,
  age, w0, head, lobes, spatter, slugs, bends, cling, lean, neck, arrises)`: its draws and what its path made of them
  (`paste_end`: own, hung, edge, caught or surface; `stop`: why its path ended);
- `field`: the drips on the faces (0 .. 1), max-pooled to 4 cm, rows from `z0` up: `dict(res, z0, data, atlas, note)`;
  the tops' deposit lies in each roost's block, the drips' own in its curtain;
- `profile`: the choice's and the drips' constants and the rule.

### What it changed in the framework

`wear/nodes.py`: `build_feature_group(spec, result)` hands a feature's shader its own build `Result` as `g.result`
(fresh, or loaded from the cache in a `features=` rebuild; `None` elsewhere): this feature's shading constants are what
its build found. `build_library` passes `results.get(spec.NAME)`; every other feature's shader ignores it, and its
masks, caches and objects are byte-identical (below). Before the rework, `wear/registry.py` listed `pigeon` and
`wear/elevation.py` took a feature's own `elevation(canvas)`, as before. The drips' critique (2026-09-24) changed no
framework file: the curtains are more blocks, read with a second lookup in the feature's own shader.

Proved: the first build's code, run again with every other feature from the cache, reproduced the session's starting
mask and cache exactly (`d4b01dc3...`); against that state the rework's full rebuild keeps every other mask and cache
sha256-identical (`a2188273...` mortar erosion, `4e671621...` efflorescence, `f3437ed7...` rust, `026f11b4...` runoff,
`aa9607ec...` soiling, `79618df9...` street grime, `e4b1f976...` washed, `37806c0b...` probe, and the edge wear and
glass grime caches), and a per-object hash of the worn files (mesh, every attribute, material slots, transform,
instancing, custom properties) differs only in the pigeon's own markers `wear_src_pigeon` and `wear_path_pigeon`: 2697
objects in the worn block (2275 of the block, 21 markers, 401 geometry objects), 460 in the worn portal. The drips'
critique fix, against the state it started from: a full from-scratch rebuild changes only `masks/pigeon.png`
(`9f5c40ae...` to `8f9146e1...`), `cache/pigeon.pkl`, the object `wear_path_pigeon` (the drips' paths) and the node
group `WEAR_F_pigeon`; every other mask and cache, every other object of the worn block and the worn portal (2697 and
460) and every other node tree hash the same, and a `features=pigeon` rebuild reproduces the mask and cache byte for
byte. Cost: about 23 s of build (22 s the ledge scan, 1,365 rays for the drips' paths); the shader reads a top block
and a curtain block, two lookups for all roosts.

### Evidence

In `tests/artifacts/screens/bradbury_wear/rework/pigeon/`, the sheets at half size from full-size stills at the scene's
defaults; "before" is the first build's pigeon with every other feature as it now is (its code run again, with the
rest from the cache), "snapshot" the frozen state before this review pass (`wear_snap_rework_before/`):

- `closeup_*` (the Broadway roost from above, the rework's close-up), `medium_*` (the same in context), `r2_close_*`
  and `r2_medium_*` (the 3rd Street roost): `_before_after`, `_off_on_debug` (off | on | debug with the pigeon alone),
  `_snapshot_after`;
- `sills_bway_before_after.png`: Broadway's floor 4 sills from 7 m out, where the first build's pattern showed (a heap
  and drips at every window), now clean, with both debug views; `st_up_debug_before_after.png`: every perch marked, then
  the two roosts;
- `<camera>_before_after.png` for the five cameras (off | before | after), and `st_portal_crop_x4.png`, the Broadway
  roost's two drips as the street saw them;
- `elevations/`: each face's droppings before and after (`pigeon_<face>_before_after.png`, the roosts circled), the
  rework's `pigeon_E.png` and `pigeon_S.png`, and the first build's stale N, SE and W images (the layer does not delete
  a feature's elevation that it no longer draws);
- `blocks/`: each roost's top block drawn top-down, unlit, as stored;
- `renders/` (the full-size stills), `diff/` (the heat images, `summary.json` with each camera's footprint, the first
  build's against the rework's, `calibration.json`), `references/`, `poses.json`, `audit/` (the roosts and candidates).

The drips' critique fix, in `critique_r1/`, the same way; "before" is the rework's pigeon (its code run again, which
reproduced its mask `9f5c40ae...`, with every other feature as it now is), and every still was rendered in one sitting
after the GPU driver was reinstalled (below):

- `closeup_off_before_after_debug.png` (the report's close-up: the Broadway roost's droppings on the cornice top and its
  drip; off | before | after | debug with the pigeon alone) and `S_close_off_before_after_debug.png` (the 3rd Street
  roost the same way);
- `E_face_off_before_after_debug.png`, `S_face_off_before_after_debug.png` (each roost's drips from under its cornice)
  and their crops `E_face_crop_x2.png`, `S_face_crop_x2.png`;
- `street_E_x4.png`, `street_S_x4.png` (the critique's far-pavement views, 100 and 135 mm, cropped round the drips: off
  | before | after), `street_both_before_x4.png` and `street_both_after_x4.png` (the two roosts side by side: the same
  ruled pair twice, then one drip against a fork);
- `st_portal_off_before_after.png` and `st_portal_crop_x8.png` (the Broadway drip as the street camera sees it),
  `<camera>_off_after.png` for the other four cameras, `medium_off_before_after.png`, `r2_medium_off_before_after.png`,
  and the rework's poses from above, `old_closeup_before_after.png` and `r2_close_before_after.png`;
- `blocks/`: each roost's curtain as stored (deposit grey, outline red, rows up the face, the depth code beside it);
  `variety/`: the drips' draws salted 24 ways over the same two roosts (a check of the rule, not the build: salt 0 is
  the build), a sheet of the first twelve and one line per drip; `elevations/`: this build's `pigeon_E.png` and
  `pigeon_S.png`;
- `renders/` (`before/`, `before2/` the rework at the two new close-ups, `after/`, `off/` the pigeon at 0, `layer_off/`
  the scene switched off, `prewear_again/` the frozen pre-wear project rendered again), `diff/` (`footprint.json`,
  `calibration.json`, `layer_off_check.json`), `poses.json`; `crashed_run/` holds three half-size framing stills from a
  first attempt at this fix that a crash cut off, not evidence.

| camera | the pigeon on vs at 0: mean; share over 2 levels | the layer off vs the frozen pre-wear project rendered again | that render vs the pre-wear still of 2026-09-23 |
|---|---|---|---|
| `st_portal` | 0.0094; 0.003% (the rework's 0.0105; 0.008%) | 0.0077; 0.0004% | 0.295; 1.72% |
| `st_corner` | 0.0073; 0.004% | 0.0087; 0.005% | 0.295; 2.09% |
| `st_along` | 0.0077; 0.002% | 0.0069; 0.002% | 0.384; 4.89% |
| `st_up` | 0.0072; 0.004% | 0.0058; 0.0001% | 0.272; 2.12% |
| `hero_3q` | 0.0108; 0.003% | 0.0097; 0.001% | 0.355; 2.47% |

Only `st_portal` changes a pixel by more than 8 levels (0.0016%, the Broadway drip; the rework's pair 0.0033%). The
layer switched off no longer sits at the noise floor of the pre-wear stills (`series/final/before/`, 2026-09-23): it
differs from them by 0.27 to 0.38 levels, 1.7 to 4.9% of pixels by more than 2. So does the frozen pre-wear project
itself (`tests/artifacts/blender/bradbury/wear_before/bradbury_scene.blend`, rendered again now from its own cameras),
by the same amounts, and the layer switched off matches that fresh render at the noise floor (0.006 to 0.010). The
renderer changed, not the scene: every file the frozen scene reads predates its stills, and the NVIDIA display driver
(617.14) was installed again on 2026-09-24 at 22:23, after the computer crashed; the shift lies on the building and not
on the sky, as a changed denoiser's would. Until the pre-wear stills are rendered again, the layer off is checked
against `critique_r1/renders/prewear_again/`.

## Mortar joint erosion at exposed courses (AI 573)

`wear/features/mortar_erosion.py` (`wear_mortar_erosion`, lime in the debug view): the brick's mortar joints recessed
where water reaches the wall most, flush where it is sheltered. Rain and runoff wash the binder out of the mortar, the
joint's face sinks back from the brick's and the arrises it covered are laid bare, so the joint reads deeper, a little
wider and catches shadow; the ICOMOS-ISCS glossary files it under erosion, the loss of material from a surface.
Wind-driven rain beats hardest on a facade's top edge and top corners (Blocken & Carmeliet 2013), and concentrated
runoff below ledges and splash above a base wet the wall again and again. Every eroded joint lies where one of three
measures of that water puts it, each found on the model by an earlier feature; how far the erosion has got differs from
one drop of the facade and one corner of the block to the next, drawn from seeds (the rework of 2026-09-23, below); the
change follows the brick set's own joints and leaves the brick faces as they are; nothing is placed by noise, and the
mask is the same from one build to the next.

```
blender -b -P wear_layer.py -- features=mortar_erosion      # its mask alone (about 9 s), the rest cached
blender -b -P render_wear.py -- wear_mortar_erosion=0 cam=16.55,19.25,13.6:16.55,17.577,13.5:50   # off; 1 is the default
blender -b -P render_wear.py -- wear=debug wear_soiling=0 wear_runoff=0 wear_washed=0 wear_street_grime=0 wear_rust=0 wear_efflorescence=0 wear_edge_wear=0 wear_glass_grime=0 wear_pigeon=0 view=hero_3q
```

It NEEDS soiling, runoff, washed and street_grime, whose published fields it reads, and stands first in the shader
chain (ORDER 100).

### The water: three sources

| source | measured by | on this block | sources | share of the eroded texels |
|---|---|---|---|---|
| the wind-driven rain | 566's refined exposure against its general level, gated by 565's shelter | the corner pavilions' upper floors, strongest on their top floor and near the block's corners; the middle pavilions' top floor; the arch rings round the pavilions' top-floor windows | 109 exposed fronts | 55% |
| the runoff | 564's streaks, each walked down the elevation as 564 walks it | the crown's curtain on the top courses under it; the streams from the sill ends and the feet of the brackets and capitals; faintly under the band and the impost course | 652 streaks | 35% |
| the splash | 567's splash profile, measured up from the base's top | the lowest courses of brick on the ground floor crown's top (6.29 m) | 86 runs of ledge | 10% |

847 sources, 847 marks, 737 paths. They combine as the most of the three at each texel, and each is taken as far as the
mortar of the drop it lies on has got (below). About three tenths of the brick the street sees is eroded at all (376 m2
of 1253 from 0.05, on 565's 5 cm elevation of the brick) and an eighth more than half (154 m2; 394 and 195 m2 before the
rework); the rest keeps its joints as the texture draws them.

### The rain

The measure is 566's own (`ctx.field("washed", "exposure")`): 565's sweep of the wind-driven rain, `open` times the
wind's `catch`, with the projecting fronts' catch raised, and its `general` level, the open masonry's median (0.544). A
joint erodes where its surface takes clearly more rain than the general facade: by a smoothstep of E / E_gen from `X`
1.15 to 1.35, so the zone's edges fade with the measure itself, and never where 565's overhangs keep the rain off
(`SHELTER`: gone from a shelter of 0.10 to 0.25; 566's advice was never above about 0.2). Over the brick, by floor
(medians, 2 cm texels of brick, windows left out; the measure alone, before each drop's mortar and each corner's wetting
take it, below):

| where | E / E_gen | floor 2 | floor 3 | floor 4 | top floor |
|---|---|---|---|---|---|
| the pavilions at the block's SW, NW and NE corners, both faces | 1.1 to 1.48 | 0 | 0 (0.78 at p90) | 0.24 (1.0 at p90) | 0.84 |
| within a metre of the SW corner; 3 to 5 m in from it | | 0.05; 0 | 0.58; 0 | 1.0; 0.05 | 1.0; 0.64 |
| the chamfer's pavilion and its neighbours (SE) | 1.1 to 1.32 | 0 | 0 | 0.40 | 0.78 |
| the middle pavilions (N, S) | 1.2 to 1.34 | 0 | 0 | 0.05 | 0.65 |
| the recessed bays, the top floor's recessed wall | 0.80 to 0.96 | 0 | 0 | 0 | 0 |

So the erosion is strongest at the top corners and down the block's corner arrises, as the review has it, and within a
zone every joint takes about the same (a pavilion's top floor is a plateau at its drop's depth). The zones are traced as
566 traces its fronts: 4-connected texels of like depth, 20 texels (0.05 m2) at least (79 slivers of one to three
texels are left out). Each is one area source, its outline in the debug view, and names the drop it lies on.

### The runoff

Each of 564's streaks (`ctx.field("runoff", "streaks")` with its `sources`) is walked down the elevation from its source
exactly as 564 walks it -- its `Elevation` and `walk` on 2 cm texels, the fire escapes looked through, its shape across
the streak (`lateral`, `SPREAD`, a sill end's jamb-hugging profile, a curtain's soft ends), a capital's creep-back and
first columns -- so every stream stops where 564's film stops: caught by a surface further out, thrown off by an edge,
or at `LEN_CAP` of its deposit's e-folds. The water runs `WATER_K` 2 times as far as the dirt it drops (its value falls
as exp(-t / (2 e-fold)), cut where 564's streak ends), and the joints erode by a smoothstep of it from `RUN` 0.10 to
0.45. Each stream carries the water 564 drew for its source (564's rework): its value, and for a capital, whose value
573 works out from 564's constants and its creep-back, the square root of its drawn water, read off its e-fold as 566
reads it (before the rework every capital eroded at 0.93 whatever 564 drew). A curtain spreads its course's water along
a whole drip line and counts `CURTAIN_SHARE` 0.6 of a stream's. As built, each stream also taken as far as the mortar of
the drop it runs on has got (below; 1 off the drops, which is where most streams run):

| streak | count | 564's value | erosion at the source | runs | area |
|---|---|---|---|---|---|
| sill end, down the jamb's inside corner | 149 | 0.55 (0.14 to 1.00) | 1.00 (0.00 to 1.02) | 1.46 m (0.44 to 2.48) | 19.5 m2 |
| bracket's foot (566's rinsed streams) | 179 | 0.53 (0.14 to 0.64) | 1.00 (0.02 to 1.00) | 0.35 m to the window head (to 1.61 down a mullion) | 11.2 m2 |
| column capital's foot | 21 | 0.40 (0.16 to 0.45) | 0.76 (0.06 to 1.00) | 1.82 m (0.76 to 2.06) | 14.7 m2 |
| springing capital's foot | 41 | 0.40 (0.15 to 0.48) | 0.92 (0.04 to 1.04) | 0.99 m (0.53 to 0.99), to the band's top cornice | 8.5 m2 |
| the crown's curtain | 5 runs | 0.66 | 0.92 (0.18 on the repointed chamfer, 1.02 under a heavy top lift) | 0.22 to 1.04 m, to an arch ring or the impost course | 102.8 m2 |
| the band's curtain | 213 runs | 0.28 (0.22 to 0.41) | 0.09 (0.02 to 0.36) | 0.70 m (0.70 to 1.78) | 50.5 m2 |
| the impost course's curtain | 44 runs | 0.27 (0.21 to 0.30) | 0.07 (0.01 to 0.13) | 0.76 m (0.64 to 0.90) | 15.6 m2 |

Before 564's rework the table read 156 sill ends at 0.47 to 0.85 (1.68 m, 26.8 m2), 186 brackets at 0.55 (15.9 m2), 22
column and 42 springing capitals at 0.40 (20.7 and 13.6 m2) and the band's and the impost's curtains at 0.30 and 0.29
(59.1 and 18.1 m2). A stream at or above `RUN`'s top erodes in full, so most sill ends and brackets keep the calibrated
look at their source and differ in how far down and how wide they erode; the light ones, which 564 now draws, erode less.
Since 564's critique fix (2026-09-25) a capital sheds by one to three drips, each a narrow stream of its own, and 573
walks each drip as it walked the capital's sheet, as wide as the drip at the foot: 12 of the 30 column-capital drips
erode any brick (0.43 m2 in all) and 23 of the 37 springing ones (0.61 m2), where the rows above read 14.7 and 8.5 m2;
the flat panels of eroded joints under the capitals went with the sheets (see "A capital's drips" in 564's section).

The crown's curtain is what erodes the top courses under the crown: 565's shelter keeps the direct rain off them (the
recessed top floor takes 0.89 to 0.96 of the general facade's), but the water that creeps back along the crown's
underside runs down them, and so the rain's shelter gate is not applied to the runoff. The ground floor crown's, the
string course's and the portals' mouldings' curtains (16 runs) run over stone only and are left out.

### The splash above the base

567's splash zone (`ctx.field("street_grime", "zone")`) lies on the stone under 1.2 m, and no brick stands in it: the
brick begins at 6.29 m, on the ground floor crown's broad top, the top of the stone base (the pier ring's first joint
groove, 0.915 m, is above the band's top as well, and its joints are geometry, not a brick set's). That top is ground
too: the rain that lands on it splashes back onto the lowest courses of brick standing on it, and the water the ledge
holds wets their foot. Found on the model: every 2 cm column whose lowest brick (565's 5 cm front) stands on masonry
standing at least `LEDGE_MIN` 5 cm out in front of it; a ray straight down from just in front of the brick finds the
ledge's top, runoff's elevation just under it the ledge's front, and 567's own rain (`rain_dirs`, `rain_share`) cast from
the ledge's middle how much of the rain it takes. The splash is 567's profile (`ctx.field("street_grime", "profile")`:
`top` 0.65, `foot_w` 0.25, `foot_e` 0.10) up from the ledge's top, times that rain and the ledge's depth against 567's
`reach` 0.45, through a smoothstep from 0 to `SPLASH` 0.60. On this block: 86 runs, 88.6 m of the crown's top under
brick (all at 6.292), 0.10 to 0.57 deep (median 0.34), taking all of the rain (median 1.00) but under the fire escapes'
platforms on 3rd Street (0.04 to 0.3). A pier on a 0.34 m ledge erodes in full up its first 0.2 m, half at 0.3 m, none
from 0.5 m: the lowest four courses. Only the base's top: the same splash off the band's top under the top floor's
piers is not what the prompt asks for, and is left alone. At a pavilion's foot the splash is taken as far as the
pavilion's drop has got, like everything else on it (below).

### One drop and one corner at a time (rework 2026-09-23)

The corner pavilions are all the same shape and the rain's measure is the same at every corner of the block, so the rule
alone eroded the same zone on each: the top floor in full and a fade down the corner arris, mirrored on the two faces of
each corner. Measured on the mask (`audit/`), the windows 5.6 m wide at the block's square corners (both faces of the SW,
NE and NW corners, floors 2 to the crown, the corner at one side) differed by 0.006 to 0.031 in the mean of the
erosion's difference, with 1 to 8% of their texels off by more than 0.1 (the north face's at the NW corner, whose
windows are single lights, by about 0.05); the chamfer's pavilion stood the same on its 3rd Street and Broadway faces
(0.011); and the 22 pier fronts under the band carried one faint gradient each, all alike (peak 0.148, 730 texels). The
same band stamped on every pavilion (user 2026-09-23, reviewing the layer: marks must not repeat identically from one
instance to the next; noise inside a mark stays out, as before). The streams already follow 564's draws, but a
capital's ignored the water 564 drew for it (fixed above); the crown's curtain and the splash run whole along each face,
continuous height bands rather than stamps, and stay the measure's.

What sets one pavilion's joints apart from the next on a real front is what the model does not carry. **The mortar**: a
facade is pointed drop by drop, the vertical strip one scaffold or cradle covers, with its own batches and its own
weather while they cured, and a maintained front is repointed in campaigns and spot repairs, the top lift under the
parapet more often than the rest. So each **drop** -- 566's projecting fronts of brick at the pavilions' depth, 0.20 ±
0.03 (the crown's members stand as far out and are left out by their class): each pavilion's face and each pier front,
in two **lifts** divided by the band's top cornice (`LIFT_Z` 16.6 m), the body below and the top floor above -- draws
how far its erosion has got and how readily its mortar gives to the rain. **The wetting**: which side of a corner the weather comes from, a crown joint that leaks down
one arris, the neighbours that break the wind. So each **corner** of the block draws, on each of its two faces, how
strongly its catch rises at the arris and how far into the face it runs: soiling's catch law (`catch_ratio`) with the
corner's own side zone, the rain's measure times its catch over the law's.

| drawn | for | bounds |
|---|---|---|
| depth: how far the erosion has got, against the calibrated look | each drop and lift | 0.65 to 1.15 (`DEPTH_DRAW`); or, one in seven (`REPOINT_P` 0.15), repointed since: 0.15 to 0.40 (`REPOINTED`) |
| give: the exposure its mortar erodes at, the measure times this | each drop and lift | 0.96 to 1.04 (`GIVE`) |
| gain: the corner catch's rise at the arris | each corner, on each face | 0.50 to 1.40 (`CORNER_GAIN`) |
| reach: how far into the face the corner's catch runs, times `CATCH_SIDE` 3 m | each corner, on each face | 0.70 to 1.30 (`CORNER_REACH`) |

The exposure stays the lead: the draws move where along its gradient a zone ends and how deep its joints are, never where
it lies, and a pier front whose exposure is barely above the general facade's erodes or not by its give. A drop's depth
holds for all the water on it, the streams and the splash as well as the rain, so a repointed pavilion's sill streams
and top courses are fresh too; off the drops the mortar is the measure's (depth and give 1), which is where most streams
run. The depth past 1 is why the mask holds the erosion over `SCALE` 1.25 (below). Where a range is given the value is
the mean of two uniforms, the middle likelier than the ends; a repointed depth is one uniform. The seeds (`draw`: the
sha256 of `mortar_erosion:` and a key, two bytes to a uniform) are the drop's face, span and lift
(`drop:N:-0.20:5.10:top`) and the corner's face and end (`corner:E:end`), so a rebuild draws the same values and nothing
drawn for one moves when another changes. The corners' catch is checked against `soiling.catch_ratio` at build time:
with its gain and reach at 1 it must be the law.

As built (the build prints it, `mortar_erosion drops ...`): 44 drops, 33 bodies (11 pavilion faces, 22 pier fronts) and
11 top lifts, depth 0.87 in the body (0.17 to 1.06; 6 repointed, 5 past the calibrated look) and 0.92 on top (0.20 to
1.11; 3 repointed, 2 past it). The pavilions:

| pavilion | face | body: depth, give | top: depth, give | its corner's gain, reach |
|---|---|---|---|---|
| SW | 3rd Street | **0.38 repointed**, 0.978 | 0.99, 1.000 | 0.93, 1.07 |
| SW | west face | 1.00, 1.011 | 1.05, 1.004 | 0.81, 0.81 |
| SE | 3rd Street | 1.02, 1.007 | 0.81, 0.990 | 0.94, 1.03 (135 degrees) |
| SE | the chamfer | **0.32 repointed**, 1.012 | **0.20 repointed**, 0.997 | 0.89, 1.03; 1.11, 0.94 |
| SE | Broadway | 0.87, 0.991 | 0.93, 1.006 | 1.02, 1.05 (135 degrees) |
| NE | Broadway | 1.02, 1.023 | 1.11, 1.016 | **1.27**, 0.89 |
| NE | north face | 0.89, 1.032 | **0.30 repointed**, 0.995 | **0.63**, 0.97 |
| NW | north face | 0.79, 1.003 | **0.29 repointed**, 0.975 | 0.73, 0.84 |
| NW | west face | 0.85, 1.006 | 0.98, 1.001 | 1.00, 0.93 |
| middle | 3rd Street | 0.90, 1.023 | 0.86, 0.988 | |
| middle | north face | 0.83, 0.975 | 0.92, 0.992 | |

So the NE corner erodes hardest on Broadway, where its catch runs strong and its fade reaches the second floor (0.89 at
9 m by the arris, 0.34 before), and lightly on the north face (0.10 at 9 m, 0.46 at 11 m), whose top floor was
repointed; the chamfer, repointed in both lifts, reads nearly flush between its two eroded flanks; the SW corner's 3rd
Street body is fresh under a top floor eroded in full. The pier fronts' gradients, 0.148 on every one before, now peak
from 0.004 to 0.37: seven under 0.03 (three of the four repointed among them), four up to 0.10, ten from 0.10 to 0.22
and one, at s 14.15 on 3rd Street, at 0.37 down to 11.7 m. The same six square-corner windows now differ by 0.048 to
0.19 (15 pairs; 14 to 38% of their texels off by more than 0.1). Over 40 seeds (the built one and 39 others, the rain's
field alone), the pairs' median difference is 0.077 against the measure's 0.025, and one pair in 25 comes out under
0.03 against two in three. The west face's two pavilions, both eroded in full on top, and the north face's, both
repointed on top, are the likest pairs as built (0.048 and 0.064): the draws, not a rule, make them alike, and they
still differ in depth and in how far their corners reach. Over the brick the street sees, 376 m2 is eroded from 0.05
and 154 m2 more than half (394 and 195 m2 before): the drops sit a little under the calibrated look, as a maintained
front does.

### The mask

`masks/mortar_erosion.png`: 2 cm, one 8-bit channel (9620 x 1060; 10 MB as bytes, a quarter of an RGBA mask): the erosion
over `SCALE` 1.25 (a drop may go past the calibrated look, to 1.11 as built; the shader multiplies it back), the most of
the three sources at each texel, laid only on the brick the 2 cm elevation sees and grown `PAD` 2 texels into what is
not brick beside it (a window, the trim), so the lookup's filter keeps the brick's value to its edge and a reveal's
return, which reads the column at its edge, takes the front's value; brick beside a mark keeps its own zero. The rain's
zones are sampled bilinearly from the 5 cm measure, their values first grown two 5 cm texels into the non-brick round
them for the same reason. The elevation images draw the erosion itself (`elevation()`: the mask times `SCALE`).

### The look

Only the joints change, and only on brick walls and returns (the wall and the arch rings; never a top, a soffit, the
terracotta or the stone). The joints are the brick set's own: the layer's `Joint`, and `Joint Wide`, the joint grown
2 mm past each edge (new in the framework, below). With a the erosion (the mask times `SCALE`) times the strength:

- **the relief**: a Bump node on the joints, added to the brick's own normal map (its `Normal` input is the state's
  normal): the mortar sunk `DEPTH` 3 mm x a and the exposed arris ring round it half as far, so the groove is deeper
  and 2 mm wider on each side. Its height is the brick set's own (Joint, Joint Wide), which Cycles reads again at its
  offsets for the slope, while the erosion scales the node's distance, so the slope follows the joints and never the
  zone's gradient. In Cycles the walls turned from the light go dark while those turned toward a grazing light
  brighten only a little: in a controlled test (a wall lit 79 degrees off its normal, 18.7 up, as the scene's sun rakes
  the chamfer) a 45 degree facet turned toward the light read 1.27 times the flat wall where the cosine law says 1.96,
  and the one turned away read black -- the renderer bends a bumped normal back where its reflection would dip under
  the surface, and dims the light a bump turns toward it. So under a raking sun the groove reads as a shadow line with
  a faint lit lower lip, which is what deep joints look like at a distance;
- **the arris ring** (Joint Wide less Joint) keeps `ARRIS_KEEP` 0.70 ^ a of its brightness, in the groove's shade: the
  joint reads wider;
- **the mortar** keeps `MORTAR_KEEP` 0.62 ^ a of its brightness after going `SAND_GREY` 0.35 x a toward a sand grey
  (its own luminance times (1.00, 0.93, 0.80): the binder washed out, the sand left), and turns at least `MATTE` 0.90
  rough.

The factors are powers of a, so the strength scales them past 1 as it does below (2 is twice the erosion), and a = 0
hands the input on exactly. The brick faces (Joint Wide 0) keep their colour, roughness and normal. It stands at ORDER
100, the first in the chain: a change in the fabric, which every deposit after it lies over; 566's `Clean Color`
includes it, so the wash and the rinse leave it.

### Calibration

Measured in rendered pixels, in linear luminance, on the full-size stills at the scene's defaults (`diff/calibration.json`
and `summary.json`): per bed joint, its visible width (the rows darker than half the brick faces round it) and its
darkness against the faces, and the faces themselves (the middles of the bricks, 6 mm clear of every joint), off against
on:

| pose | light | joint width | joint's mean / faces | its darkest row / faces | faces on / off |
|---|---|---|---|---|---|
| `corner_top_raking`: the chamfer's top floor at 1.4 m, 0.53 mm a pixel | sun, 79 degrees off the normal | 7.4 to 10.5 mm | 0.22 to 0.17 | 0.15 to 0.04 | 1.000 |
| `corner_top_raking_n`: the NE pavilion's top floor, north face | sun, 56 degrees | 4.2 to 7.4 mm | 0.44 to 0.27 | 0.41 to 0.07 | 1.000 |
| `sheltered_raking_n`: the north face's recessed top floor wall | the same sun | 4.2 to 4.2 mm | 0.43 to 0.43 | 0.41 to 0.41 | 1.000 |
| `corner_top_medium`: the chamfer's top floor from 5 m, 1.9 mm a pixel | sun, 79 degrees | 5.6 to 9.4 mm | 0.23 to 0.21 | 0.18 to 0.09 | 1.000 |

Over a whole zone the wall darkens a little, since only its joints do: 0.95 to 0.96 in the raking close-ups, 0.97 from 5 m,
0.98 on 3rd Street's pavilion in shade from across the street (`third_pavilion`, 4.4 mm a pixel), 0.99 over the lowest
courses on Broadway in sun (`base_splash`). From the scene's cameras the joints are under a pixel and the change is a
faint crisping of the brick's pattern in the zones (0.05 to 0.10 levels on average, 0.6 to 1.4% of the pixels by more
than 2). The reference is the Commons colour photo of the Broadway portal (`references/`, unaltered, with
`commons_304_brick_courses_x3.png` and `references.json`): at about 4 mm a pixel the real joints are thin reddish
lines, 0.94 to 1.00 of the brick in a row mean, and the lowest courses above the portal's pier block on the ground
floor's crown read like the ones above them: tight, flush joints on a maintained, repointed frontage, and no photograph
shows the top corners close enough to see a joint. So the look is a judgement for a maintained building: plain close up
in a raking light, where the joints of the most exposed brick read as recessed shadow lines about 3 mm wider than
flush, and faint from the street. `DEPTH`, `ARRIS_KEEP`, `MORTAR_KEEP` and `SAND_GREY` carry it; `DEFAULT_STRENGTH`
stays 1.0, 0.5 halves it and 2 doubles it (`corner_top_raking_strengths.png`: 2.6, 4.3 and 6.5 levels on average over
the frame).

That calibration is the look at an erosion of 1, and it stands: the rework changed where and how far the joints have
got, not what an eroded joint looks like. A drop at depth 1 renders the table's joints; the drops as built sit at 0.87
(the bodies) and 0.92 (the tops) in the median, a few at 1.02 to 1.11, and the repointed ones at 0.17 to 0.38, their
joints within a few tenths of a millimetre of flush. The chamfer, where `corner_top_raking` and `corner_top_medium` were
measured, drew repointed in both lifts (0.32, 0.20), so those poses now show its joints nearly as the texture draws
them; the rework's close-up is the north face by the NE corner, in the same sun at 58 degrees (below).

### The debug view

Lime: the erosion at full colour from half of it (`DEBUG_GAIN` 2), on the brick walls and returns; an outline round
each exposed front, a square tube along each streak's source (an octahedron at a sill's end) and a thin one down its
path to where its water leaves the wall, a square tube along each run of the base's ledge and a thin one up its middle
to where the splash falls below a tenth. The joints' relief shows in the debug view too (the clay replaces the colour,
not the normal). `wear=debug` with every other feature at 0 shows it alone (the command above). In the sun on Broadway
the lime reads pale (AgX again); 3rd Street's shade shows it plainly.

### Published

`ctx.field("mortar_erosion", key)`, for any feature that follows: `field` (the erosion on the brick, 4 cm max-pooled,
float16, rows from `z0` up; 1 the calibrated look, to 1.11 as built), `zones` (every exposed front: `dict(id, facade, s0,
s1, z0, z1, depth, texels, peak, mean, ratio, drop)`, `drop` the key of the drop it lies on), `streams` (every streak
eroded: `dict(id, source, kind, facade, axis, s0, s1, z_top, z_stop, water, peak, texels)`), `splash` (every run of the
base's ledge: `dict(id, facade, s0, s1, z, d_wall, depth, rain, rain_min, wet, peak, columns)`), `drops` (added by the
rework: every drop and lift, `dict(key, facade, s0, s1, lift, depth, give, repointed)`), `corners` (added by the rework:
each corner of the block on each face, `dict(key, facade, end, gain, reach)`) and `profile` (the constants, the draws'
bounds and the formula). Nothing reads them yet.

### What it changed in the framework

`wear/nodes.py` hands every material a fifth surface signal, **Joint Wide** (`SURFACE`, `JOINT_GROW`, `_wide_signal`;
`surface_signals` returns four values and `wear_material` wires the fourth): the brick set's joint grown 2 mm past
every edge. The set's joints are a one-pixel step in its height map (faces at 0.655, the joint floor at 0.420, one
pixel between them: `Joint` goes 0, 0.45, 1), so no remapping of Joint could widen them; the map is read twice more, at
plus and minus 2.5% of a course along both U and V (a bed joint does not change along U nor a head joint along V, so
one diagonal pair widens both, on both sides), and the most of the three is the widened joint. Brick only; everything
else gets 0. Backward compatible: no earlier feature reads it, and a mix by 0 still returns the input exactly.
`wear/registry.py` lists `mortar_erosion`. A full rebuild reproduces every earlier mask and cache byte for byte
(`37806c0b...`, `4fa13d0c...`, `6517dd79...`, `6c9963ea...`, `16d42806...`, `a1865e1b...`, `ee8ba631...`, `d4b01dc3...`
and the ten caches), every earlier feature's mesh data hashes the same as before AI 573 (rust's and edge wear's
attributes, edge wear's chipped meshes, glass grime's 396 copies and attributes: 4679 meshes and objects in the worn
block, 514 in the worn portal), and this feature's mask and cache are the same on a rebuild (`fa8945fc...`,
`c3148c32...`). The worn block has 2697 objects: 2275, 22 markers, edge wear's 4 and glass grime's 396. Cost: about 9 s
of build (2.4 million rays, most of them the streaks' walks), 10 MB for the mask, and two more height-map reads per brick
shading point plus the Bump node's two offset evaluations: `st_up` 18 s a still, `st_portal` 30 s (572 measured 15 to
16 and 25 to 28), the same with the feature off.

The rework of 2026-09-23 changed no framework file: only `wear/features/mortar_erosion.py` (the drops and corners, the
capitals' water, the mask over `SCALE` and its `elevation()` hook). No feature NEEDS mortar erosion. A full rebuild
reproduces every other feature's mask and cache byte for byte, and object by object the worn block (2697 objects), the
worn portal (460) and the node library differ from a build with the code before the rework only in this feature's own
debug markers (`wear_src_mortar_erosion`, `wear_path_mortar_erosion`) and its node group (`WEAR_F_mortar_erosion`, the
mask times `SCALE`); this feature's mask and cache are the same on every rebuild (`47cc181b...`, `0307da10...`; the code
before the rework rebuilds its `a2188273...` exactly).

### Evidence

In `tests/artifacts/screens/bradbury_wear/mortar_erosion/`, the sheets at half size from full-size stills at the
scene's defaults (1920x1200, 128 spp, AgX, the scene's own sun and sky; no extra lamp):

- `st_up_off_on_debug.png`, `hero_3q_off_on_debug.png`: mortar erosion off | on at its default | the debug view with the
  erosion alone | the debug view with every feature; `st_up_off_on.png`, `hero_3q_off_on.png` at full size;
  `st_corner_off_on.png`, `st_portal_off_on.png`, `st_along_off_on.png`;
- `corner_top_raking_off_on_debug.png`: the raking close-up of a top corner, the SE corner pavilion's top floor on the
  chamfer at 1.4 m, the scene's sun raking it 79 degrees off its normal; `corner_top_raking_strengths.png`: 0 | 0.5 |
  1 | 2; `corner_top_medium_off_on_debug.png`: the same wall from 5 m;
- `raking_top_corner_vs_sheltered_n.png`: the contrast, both on and in the same sun (56 degrees on the north face): the
  NE corner pavilion's top floor (eroded) against the north face's recessed top floor wall (sheltered, its joints as the
  texture draws them); `corner_top_raking_n_off_on_debug.png`, `sheltered_raking_n_off_on_debug.png` (identical off and
  on: 0.015 levels, the noise floor);
- `base_splash_off_on_debug.png` (Broadway's floor 2 on the ground floor crown, in sun: the lowest courses),
  `third_pavilion_off_on_debug.png` (3rd Street's east pavilion from across the street, in shade),
  `stream_sill_3rd_off_on_debug.png` (a floor 4 sill on 3rd Street: its ends' streams down the jambs' inside corners);
- `renders/` (the full-size stills, and `<camera>_wear_off.png` for the five cameras), `diff/` (off against on, x8; the
  layer off against the pre-wear stills; the feature at 0 against 572's; `summary.json`, `calibration.json`),
  `references/` (the photo, unaltered, the crop measured, `references.json`), `poses.json`.

| camera | off vs on: mean; share over 2 levels | the layer off vs the pre-wear still | the erosion at 0 vs 572's still |
|---|---|---|---|
| `st_up` | 0.080; 0.81% | 0.0062; 0.002% | 0.0065 |
| `hero_3q` | 0.102; 1.36% | 0.0163; 0.006% | 0.0082 |
| `st_corner` | 0.076; 0.94% | 0.0317; 0.058% | 0.0057 |
| `st_portal` | 0.083; 0.72% | 0.0161; 0.025% | 0.0064 |
| `st_along` | 0.054; 0.63% | 0.0061; 0.001% | 0.0058 |

On the close-ups: `corner_top_raking` 4.29, 18.7%; `corner_top_raking_n` 6.52, 18.0%; `corner_top_medium` 2.26,
12.8%; `third_pavilion` 0.81, 7.9%; `base_splash` 0.38, 1.9%; `stream_sill_3rd` 0.11, 1.3%; `sheltered_raking_n`
0.015, 0.01%. The layer off (the worn scene switched off) renders the pre-wear stills and the erosion at 0 renders
572's to within render noise (the floor is 0.0067 to 0.0310; `st_corner`'s layer-off still has sat at 0.028 to 0.032
since 567). The canonical scene, rebuilt last, renders `corner_top_medium` and `corner_top_raking` through
`render_wear.py` to 0.0145 and 0.0115 of their evidence stills.

The rework's evidence is in `tests/artifacts/screens/bradbury_wear/rework/mortar_erosion/`, full-size stills at the
scene's defaults, the sheets at half size:

- `pavilions_before_after.png`: every corner pavilion's face square on from 20 m, the same pose on each
  (`pavilion_poses.json`; a face's far end mirrored, so the corner is always on the left): the erosion's effect (on
  against off) before this pass | after it, and the render after. Before, the six square corners and the chamfer's two
  flanks read as one mark; after, each its own;
- `closeup_off_on_debug.png`, `closeup_before_after.png`: the north face by the NE corner at floor 4 from 1.7 m, in the
  sun at 58 degrees; `medium_off_on_debug.png`, `medium_before_after.png`, `medium_debug_before_after.png`: the NE
  corner from 12 m, Broadway eroded down its arris and on its top floor, the north face only near the arris, its top
  floor repointed (`poses.json`);
- `<camera>_before_after.png` for the five cameras (the whole layer as this pass left it against before it) and
  `hero_3q_debug_before_after.png` (the erosion alone in the debug view, before | after: the chamfer repointed, every
  pavilion its own);
- `elevations/elev_<face>.png`: each face at 5 cm, the mask after 564's rework | after this one; `audit/`: the corner
  windows cut from the mask (`before/` and `after/corner_windows.png`; the pair differences quoted above in
  `corner_pairs_before.txt` and `corner_pairs_after.txt`), the band rows at 2 cm (`crop_band_rows_start_vs_after.png`:
  the capitals' streams now each their own; `crop_S_bays_before_vs_start.png`: 564's rework reaching the streams),
  `streams_after_vs_before_pass.txt` (the streams by kind, now and before this pass);
- `renders/`, `diff/` (the x8 differences and `summary.json`), `iter/` (the working renders at half size).

| camera | the erosion off vs on: mean; share over 2 levels | this pass's whole layer, before vs after | the layer off vs the pre-wear still |
|---|---|---|---|
| `st_up` | 0.068; 0.62% | 0.79; 13.5% | 0.0061; 0.002% |
| `hero_3q` | 0.088; 1.00% | 0.51; 6.8% | 0.0167; 0.006% (a first still 0.0216; the two differ by 0.0232) |
| `st_corner` | 0.062; 0.64% | 0.35; 4.7% | 0.0317; 0.057% |
| `st_portal` | 0.062; 0.54% | 1.40; 22.1% | 0.0161; 0.025% |
| `st_along` | 0.047; 0.54% | 0.40; 6.0% | 0.0067; 0.004% |

The close-up moves 5.74 levels on average with the erosion on (18.5% of its pixels by more than 2), the medium view
0.64 (5.5%; 0.66 and 5.8% before the rework on the same pose). From the pavilion poses the erosion moved every square
corner's face by 0.215 to 0.294 levels before (2.7 to 3.3% of the pixels) and moves them by 0.137 to 0.334 after
(`diff/pavilions_off_vs_on.json`): the SW corner's 3rd Street face the least, the NE corner's Broadway face the most.
Two stills of the same scene switched off differ by as much as the first `hero_3q` did from the pre-wear still: the
GPU is not bit-deterministic, and the band's ornament is where it shows. The canonical scene, rebuilt last, renders the
close-up through `render_wear.py` to 0.0075 of its evidence still.

## The reference camera (AI 574, 2026-09-25)

The scene is now judged against one photo: an aerial three-quarter view of the corner on a clear afternoon, the block
standing in a low-rise city (the user's reference of 2026-09-25, copied to
`tests/artifacts/screens/bradbury_scene/review_2026-09-25/reference_corner_aerial.png`; the review of the scene against
it, eight numbered gaps with arrows on both pictures, is `scene_review_reference_vs_ours.png` beside it). Every scene
item of AI 574 is compared from the photo's own stand, so that stand is a scene camera, `ref_3q`, the sixth in
`VIEWS`, and the first with a frame of its own: `(from, to, lens, frame)`, the frame `(3, 2)` kept on the camera object
as `frame` so `render_wear.py` renders it 3:2 as well (the other five stay 16:10).

Where the photo stands was read off the photo and then calibrated on the render. Its horizon lies 32% from the top --
the eye is at the height of the top-floor string course, about 16 m over the pavement; the chamfer corner stands at
44% of the width; the block fills 88% of the width; Broadway is seen squarer than 3rd Street (680 px for its 33 m
against 530 for 3rd Street's 50 m), so the camera stands 34 degrees south of east from the corner, not on the diagonal.
With 35 mm on the 36 mm sensor that puts the eye 40 m from the chamfer's midpoint `(15.58, -16.46)`, at
`(48.74, -38.83, 16.2)`, aimed 3 m to the camera's right of the corner and down to z 11.4 (6.8 degrees), so the horizon
falls a third down. Checked by blending the photo over the render at 50% with the photo's cornice top, base, horizon
and corner column drawn as lines (`tests/artifacts/screens/bradbury_scene/item6_camera/`): the cornice, the corner
column, the base and both facade ends land on the photo's own; 38 m made the block a tenth too wide, 42 m a tenth too
narrow. The block's proportions are not the photo's (the photo's building is a generic one), so the match is at the
corner and the extents, not window for window.

```
blender -b -P build_scene.py -- ref_3q            # rebuild, and render the reference view (1920x1280)
blender -b -P render_wear.py -- view=ref_3q       # the saved scene, from the same stand
```

**Measured, not eyeballed (AI 574 item 12, 2026-09-25; the user: "the camera still needs adjustments to match the
reference").** The overlay had matched the corner and the cornice but left the block 6% too low in the frame and its
right end 4% short. A hue mask of the brick (H under 32 or over 335 degrees, S over 0.30, V over 0.18) read from both
pictures, below the horizon so the background cannot pollute it, gives five numbers as fractions of the frame: the
wall ends at the base, the cornice top, the corner base and the corner column (the last two hand-read in the photo,
where the sunlit sidewalk passes the mask). Photo: 0.055 / 0.930 / 0.085 / 0.860 / 0.443. Ten candidate stands were
rendered at 40% and measured (`review_2026-09-25/scripts/measure_ours.py`, `hdri_test.py` with `cam_*`); what moved
each number: the eye height sets where the horizon crosses the block (it crosses at 14.4 m, a floor lower than
16); the tilt puts the horizon a third down; the distance sets the column height; the azimuth trades the two faces'
widths; and only a longer lens from further back lengthens both wall ends at once, since it compresses the
perspective (35 mm at 40 m left the right end 2% short, 40 mm at 44.5 m lands both). The stand that matches all five
within 0.007: eye 14.4 m over the pavement at (54.12, -38.71), 44.5 m from the chamfer's midpoint at azimuth -30,
40 mm, aimed 3.8 m to the camera's right of the corner and down to z 9.76. The block's proportions are not the
photo's building's, so a closer match than this is not a camera matter.

## The kerb and the sidewalk corners (AI 574 item 3, 2026-09-25)

The reference's kerb sweeps round the corner in one arc, and its kerb is a real curb: a rolled top edge, a face lighter
than the road, a dark gutter line along its foot (the user: "round the curbside in the corner and bevel it"). The
ground was laid with a sharp mitred kerb following the chamfer and a plain vertical ribbon for the kerb; now:

- **Curb returns.** `fillet` replaces every convex corner of a pavement polygon that stands inside the field with an
  arc of `KERB_R` 5.0 m tangent to both edges (the tangent points `r * tan(turn / 2)` back from the corner, `ARC_STEP`
  0.30 m sampling, so 27 segments to a quarter). The block's pavement is its kerb lines' rectangle (x -40.23 / 21.19,
  y -22.08 / 21.58), not the chamfered outline, so at the chamfer the kerb is one arc tangent to both streets and the
  pavement is widest there -- 5.9 m from the chamfer wall against `PAVE_W` 4.2 along the faces -- which is what the
  photo shows: a wider corner apron. (A single arc tangent to the chamfer kerb as well would need a 9.0 m radius and
  no apron; the photo's is about 5 m.) The arc's centre (16.19, -17.08) is 2.2 m from either end of the chamfer, so the
  pavement still runs on under the walls there.
- **The kerb profile.** `KERB_PROFILE` is swept round the kerb line by `kerbed_pavement`: from the pavement's edge a
  quarter round of `KERB_ROUND` 5 cm (four segments, shaded smooth), the face on the kerb line down to its foot, then
  the gutter pan `GUTTER_W` 0.35 m out to the asphalt seam, lying `GUTTER_Z` 2 mm over the road plane (Cycles never
  z-fights, but coplanar faces would). The pavement polygon is the kerb line pulled in by the rolled edge
  (`outward_normals`: the mitre of each vertex's two edge normals, scaled to move each edge by one unit), so the two
  meshes share their edge exactly. UVs are metres along the kerb and along the profile.
- **Grime.** The kerb mesh carries a float attribute `grime` (0.6 at the foot, 0.45 halfway across the pan, 0 at the
  seam and from 45% up the face) that `ground_material(grime=(name, strength))` multiplies into the base colour:
  the kerb material darkens by 0.40 of it, the gutter's by 0.60 -- the dark line along the foot. The kerb wears the
  pavement's own light set (`concrete_pavement`), so its face stands lighter than the asphalt as the photo's does (the
  plain `concrete` set, tried first, read as dark as the road); the gutter pan wears the plain set, darker.
- **Eight far blocks.** The far pavement was a pinwheel of four rectangles closing a moat of road round the block; now
  both streets run on to the field's edge and the pavement beyond them is eight blocks (`s`, `n`, `e`, `w` across from
  the faces, `se`, `ne`, `nw`, `sw` in the quadrants), each with the same kerb and curb returns at every corner that
  faces a crossing, and none at the field's edge. `st_corner` still stands on the `se` block's pavement.

Evidence: `tests/artifacts/screens/bradbury_scene/item3_kerb/` (the photo | before | after from `ref_3q`, the corner
crops, and close-ups of the return and the profile from a standing eye, before and after).

**The gutter pan went the same day** (AI 574 item 11; the user, pointing at the strip along the kerb foot: "decal").
A 0.35 m concrete pan lying on the asphalt along the kerb, however dark its set and its grime, is a light stripe
painted along the road from the reference camera's height. The profile now ends at the kerb's foot on the road
plane (an edge on the plane, not a coplanar face); the grime at the foot of the face stays. The photo's dark line
along the kerb is dirt on the asphalt, which is item 5's.

## The sun lamp (AI 574 item 9, 2026-09-25)

The user saw "a strange decal on the street" in the reference view: a hard-edged dark wedge across 3rd Street at the
bottom left of the frame, and a lit wedge beside it. It was the block's own shadow. The lamp stood on what
`hdri_sun_direction` read as the map's sun, azimuth 33.9 and 18.7 degrees up -- north-east and low -- so the block
threw a 60 m shadow south-west across the street toward the camera, and with the hazy sky giving the walls no
modelling to explain it, the shadow's edge read as a mark painted on the road. Two things were wrong:

- The reading was mirrored. `hdri_sun_direction` inverted u as `(atan2(y, -x) + pi) / 2pi` and then applied +rot;
  Cycles maps `u = 0.5 - atan2(y, x) / 2pi` (the image's centre column faces +x) and the world's Mapping node turns
  the lookup vector, so a texel at azimuth a is seen at a - rot. Poly Haven maps keep their sun near u = 0.6, i.e.
  azimuth -36 before any turn; this map's, at rot 250, stands at 74. Verified by render on 2026-09-25 (a pure-sky map
  turned by the corrected rule lit the block exactly as predicted; by the old one the sun landed behind it). The
  function now reads and turns the right way.
- The map's sun is the wrong sun anyway. The photo's stands high behind the reference camera's left shoulder, so
  `sun_az` / `sun_el` (default -60 / 45) put the lamp there and the block's shadow falls behind it, out of the frame;
  `sun_az=map` gives the old behaviour on the corrected reading. The sky is not turned to follow the lamp: at
  strength 0.75 through this map's haze nothing in the frame betrays where its disc is, and the sky item replaces
  the map.

Evidence: `tests/artifacts/screens/bradbury_scene/item9_sun/` (`ref_3q` before | after, and `st_corner`).

**Reverted the same day** (AI 574 item 10; the user, on seeing the result: "revert the illumination"). The lamp is
back on the map's sun as the mirrored reading gives it, azimuth 33.9 and 18.7 degrees up, so the scene's light is
what it has been since 2026-09-20, block shadow across 3rd Street and all; `sun_az` / `sun_el` stay as an option
(`sun_az=map` is the default). `hdri_sun_direction` keeps its mirrored formula on purpose, documented in place: the
correct convention above is what the sky item will use when it replaces the map and places the lamp explicitly.

## The road (AI 574 item 5, 2026-09-25)

The photo's asphalt is old and sun-bleached: a warm pale grey -- about sRGB 150/136/125 in the sun against the
kerb's 220, where ours read 112 neutral -- with alligator cracking over most of it, repairs paler and darker than
the field, and a dirt line along the kerb. The road had been `clean_asphalt` tiled at 4 m with a slow mottle: dark,
even and cool. Of the four asphalt sets in `assets/public/pbr` only `asphalt_02` is pale (mean sRGB 90 against
clean_asphalt's 69) and it carries two long cracks per tile, so `road_material` builds on it, in metres over the
road's UVs:

- **Anti-tiling.** The set's colour is read twice, once as it tiles and once turned a quarter, offset and scaled
  by 1.13, and the two trade places over a 9 m noise, so neither the 4 m repeat nor the set's own cracks line up
  across the street. Normal and roughness come from the first sample.
- **Bleaching.** The colour is tinted `ROAD_TINT` (1.08, 1.02, 0.94) and lifted `ROAD_LIFT` 1.12. In the reference
  view the road now reads 135-140 warm where the photo has 127-150.
- **Repairs.** A Manhattan Voronoi of `ROAD_PATCH_M` 9 m cells: the lowest fifth of cells go to 0.88 of the tone,
  the top fifth to 1.07, the rest stay; a 2.5 m noise across each cell keeps its edge from being dead straight. A
  first pass at 7 m and 0.80 / 1.12 read as painted rhombs and was softened.
- **Alligator cracking.** Two Voronoi networks (`ROAD_CRACK_M` 0.7 m and 1.7 times that) on an input warped by a
  1.4 m noise, their distance-to-edge thresholded to `ROAD_CRACK_W` 3 cm, darkening by `ROAD_CRACK_DARK` 0.40;
  a 0.25 m noise opens gaps along about a third of every crack, and the band out to three widths pales by
  `ROAD_CRACK_RIM` 0.10 (the crushed aggregate beside a real crack); only where a 16 m noise says the surface is
  cracked, `ROAD_CRACK_COVER` 0.62 of it. One network at 0.9 m with unbroken 5 cm cracks read as a honeycomb.
- **The kerb's dirt line.** An Ambient Occlusion node (4 samples, `ROAD_DIRT_M` 0.6 m) reads how much the kerb's own
  0.2 m face shades the road; one minus that, broken up by a 0.9 m noise, darkens the road by up to `ROAD_DIRT`
  0.50 at the foot. It follows every curb return by itself; at 4 samples it costs the reference view nothing
  measurable (30 s at 1920x1280 and 128 spp against 27 s before; a first pass at 8 samples and half size took twice
  as long as it should have).
- The slow 22 m mottle every ground set has stays.

Evidence: `tests/artifacts/screens/bradbury_scene/item5_asphalt/` (photo | before | after from `ref_3q`; the three
road regions of the photo beside ours at full size, v1 to v3; a street-level view down 3rd Street before and after).
Not done here: tire tracks (faint in the photo), the crown, lane paint (the photo has none in view).

**Randomised (AI 574 item 13, later the same day; the user: "cracks on the asphalt are good, but they read
pattern").** Two things repeated: the set's own long cracks, every 4 m tile in one direction, and the network's
cells, all one size. Now the set is laid per random cell: a Voronoi of `ROAD_TILE_M` 7 m gives every cell a feature
point and a random number, and `random_tile` samples the set turned about that point by the cell's own angle and
slid by its own offset, so no crack of the set repeats or shares a direction with its neighbour's; the two layouts
blended by the 9 m noise hide the cell seams (a crack ending at a seam reads as a crack ending). The networks skip
`ROAD_CRACK_SKIP` 22% of their cells (a second Voronoi, F1, at the same scale and input gives the same cells' random
numbers), every crack has its own strength (`ROAD_CRACK_VARY` 0.6 to 1 over a 2.2 m noise), the regions are ragged by
a 5 m noise on top of the 16 m one, and a sparse third network of `ROAD_BLOCK_M` 3.5 m block cracks (`ROAD_BLOCK_DARK`
0.30) lies over everything; the width went to 4.5 cm and the darkening to 0.55 to keep the network as visible as
before from the reference stand, where a crack is a fraction of a pixel and its width is its visibility. What did
not work: drifting the cells' size by feeding a 6 m noise into the Voronoi's Scale -- the scale multiplies world
metres, so 30 m from the origin the cells swirl into specks or stretch to 4 m and the network vanishes; three passes
went by before `debug_cracks.py` (the crack factor rendered top-down over a 12 m patch) showed it. Evidence in
`tests/artifacts/screens/bradbury_scene/item13_cracks/`.

## Tire wear and the curbs (AI 574 items 14 and 15, 2026-09-25)

**Tire wear** (the user: "add the tire wear threads as well"). Every lane of every street wears two wheel paths where
the tires run, a shade darker (rubber) and smoother (polish) than the field. `road_material` takes the streets'
lane bands, `LANES` -- for each of the four streets its axis, its centre line and its two kerb lines -- and for a
street along x reads the offset from the nearest lane centre off y: `wrap(y - centre - lane/2, -lane/2, lane/2)`
with `ROAD_LANE_M` 3.25 (four lanes in `ST_W` 13 m), folded about the track's half width (`ROAD_TRACK_M` 1.8) and
thresholded to a soft band `ROAD_WEAR_W` 0.34 m wide; the band's own kerb lines bound it (fading over 0.6 m), the
four streets take their maximum so the paths cross in the crossings, and an 8 m noise (`ROAD_WEAR_VARY_M`) lets the
wear come and go along the road between 0.4 and 1. The paths darken the colour by `ROAD_WEAR_DARK` 0.16 and lower
the set's roughness by `ROAD_WEAR_SMOOTH` 0.25; 0.12 and 0.18 were too faint from the reference stand. The wear is
applied before the kerb's dirt line and the packed AO, in the same chain.

**Reworked as bands of use (AI 574 item 16, 2026-09-26; the user: "it should look like bands of more usage, not a
single tire thread; where the tires usually go it has a different texture").** The stripes above read as a pattern.
Now each band is `ROAD_WEAR_W` 1.35 m wide with soft edges (solid over its middle half), so a lane's two paths nearly
merge into one worn zone with a less-worn centre; the coordinate is pushed sideways by a 12 m noise
(`ROAD_WEAR_WANDER` +-0.35 m) so the zones wander along the street; the lane index (the offset to the centre line
over `ROAD_LANE_M`, floored) gives the outer two lanes `ROAD_WEAR_OUTER` 0.4 of the inner two's use; and a 20 m noise
lets the use fall to 0.2 on some stretches. Inside the zone the surface is polished rather than darkened: the colour
is mixed `ROAD_POLISH_FLAT` 0.30 toward one flat tone (`ROAD_POLISH_TONE`, the road's own mean) and lightened
`ROAD_POLISH_LIGHT` 1.05, the roughness drops by `ROAD_WEAR_SMOOTH` 0.35 and the normal map's strength by
`ROAD_WEAR_FLATTEN` 0.60 (the Normal Map node's Strength input). A first pass at 1.1 m, 1.08 lighter and no lane
weighting still read as eight even stripes. Evidence: `tests/artifacts/screens/bradbury_scene/item16_wear_bands/`.

**The curbs** (the user: "implement the curbs", read as: make the kerb read as the photo's concrete curb, which
ours did not -- a smooth continuous rim in the sidewalk's texture where the photo's kerb is poured in segments with
joints and its own tone). `kerb_material` replaces `ground_material` on the kerb: the pavement's light set tiled
along the kerb mesh's UVs (u metres along the kerb line, v metres down the profile); a joint every `KERB_JOINT_M`
1.5 m, a dark line `KERB_JOINT_W` 2 cm wide (darkening `KERB_JOINT_DARK` 0.45) at the distance to the nearest joint
read off u wrapped to the segment; every segment its own tone, a white noise of the segment's index mapped to
+-`KERB_SEG_VARY` 7%; the face (v past the rolled edge, `KERB_ROUND` * 1.2) at `KERB_FACE_TONE` 0.90 of the top,
which is worn paler; and the foot's grime from the mesh's attribute as before (0.60 at the foot). The joints run
round the curb returns with the kerb line. Evidence: `tests/artifacts/screens/bradbury_scene/item14_tire_wear/`
and `item15_curbs/`.

## Street widths from the photo, and the wear per street (AI 574 items 17 and 18, 2026-09-26)

The user, on the wear bands: "you didn't take into consideration the width of the street; there probably space for
just one car there" -- and the photo bears it out. Its 3rd Street's far kerb shows at the frame's bottom left;
unprojected through the measured `ref_3q` camera onto the ground it stands about 5.3 m from the block's kerb (the
same unprojection puts the photo's block kerb 3.9 m outside ours, so the photo's sidewalks are wider too; that is
left alone). Its Broadway's far kerb is beyond the frame: at least 8 m. So `ST_W` became two widths, `ST_W_EW` 6.0 m
for 3rd Street and its northern twin and `ST_W_NS` 13.0 m for Broadway and its western twin; the far kerbs, the
eight far blocks and their curb returns follow, and in the reference view the far pavement of 3rd Street now shows
at the bottom left as the photo has it.

The wear is laid per street from what its width holds. `LANES` carries, for each of the four streets, its two kerb
lines, its travel-lane count and its parking strip: 3rd Street one lane and no parking (one car: one worn zone down
the middle), Broadway two lanes between `ROAD_PARK_M` 2.4 m parking strips (a zone each way, the strips clean). The
loop wraps the across-street coordinate to the lane width inside the travel zone, so the offset from the nearest
lane centre folds about the track's half width as before.

And the bands hold still (the user: "the tire wear also doesn't look like an S or as if the markings are dancing.
They are more stable, with some parts maybe wider, but really smooth changes"). The wander of item 16 is gone. Two
noises of the ALONG-street coordinate alone -- so nothing varies across the band -- drift each band's width by
+-`ROAD_WEAR_WIDTH_VARY` 25% over `ROAD_WEAR_WIDTH_M` 25 m and its strength between 0.4 and 1 over `ROAD_WEAR_VARY_M`
30 m; the Map Range that cuts the band takes its From Min / From Max from the width noise. Evidence:
`tests/artifacts/screens/bradbury_scene/item17_18_streets_wear/`.

## The road surface (AI 574 item 19, 2026-09-26)

The user: "the asphalt geometry is too flat; there should be small irregularities". The road had been one quad on
the plane z = 0. Now, near the block, it is a surface: `road_mesh` lays a 550x550 grid of `ROAD_GRID_M` 0.20 m cells
over the square of half extent `ROAD_GRID_R` 55 m -- every street the reference view sees -- and `road_height` sets
every vertex:

- **Undulation** at four scales, Perlin noise each on its own offset: `ROAD_UNDULATE` 18 m / 3 cm (settlement
  waves), 4 m / 2.2 cm (sags), 1.5 m / 1.1 cm and 0.6 m / 4.5 mm (the small irregularities; the grid carries the
  last with three cells to a wavelength).
- **A crown** across every street band the point lies in, parabolic, `ROAD_CROWN` 1.5 cm per metre of half width
  (10 cm at Broadway's centre line, 4.5 cm at 3rd Street's); at a crossing the higher wins.
- **Ruts** `ROAD_RUT` 1.2 cm deep along the wheel bands of item 18 (the same lane arithmetic), varying with the use.
- **A dip toward the gutter**, `ROAD_GUTTER_DIP` 1 cm over `ROAD_GUTTER_M` 0.7 m from each kerb.
- **Repair patches that sit proud or sunk.** A Manhattan Voronoi of `ROAD_PATCH_M` 9 m cells (mathutils' 3D one,
  sliced at z = 0, which also varies the cells' sizes); a number fixed by the cell's feature point puts the
  darker fifth of cells `ROAD_PATCH_SUNK` 8-15 mm down and the palest fifth `ROAD_PATCH_PROUD` 5-10 mm up, the step
  softening toward the cell's edge over `ROAD_PATCH_EDGE`. The cell's tone -- the same darker or paler, softened
  across the cell by a 2.5 m noise as the shader used to -- goes into the mesh's `ptone` float attribute, which
  `road_material` now reads in place of its own Voronoi, so colour and step coincide.
- **Settled utility trenches**, `ROAD_TRENCH_N` 3 per street from a fixed seed, `ROAD_TRENCH_W` 1 m wide, sunk
  `ROAD_TRENCH_DEPTH` 1.6 cm, their fill darker (`ROAD_TRENCH_TONE` 0.90, folded into `ptone`): on 3rd Street at
  x -16.6, 4.3 and -35.1, on Broadway at y -7.2, 18.1 and 29.3.
- All of it fades to nothing over `ROAD_GRID_FADE` 10 m inside the grid's edge, where four flat quads
  (`scn_road_far`, `ptone` 1) carry the road on to the field's edge on the plane.

The kerb profile gained a buried foot, `KERB_BURY` 8 cm under the plane, so the road may dip beside it without
opening a slit; the shadow catcher lies at -12 cm, under the deepest dip. Below the grid the shader adds
`ROAD_BUMP`, two noises as a Bump node on top of the set's normal (1.5 mm over 25 cm, 0.6 mm over 8 cm), worn
down in the wheel bands with the normal map; and the set's roughness is eased by `ROAD_ROUGH_SCALE` 0.85 (the
asphalt_02 set's mean 0.77 becomes 0.65; clean_asphalt's was 0.66), which is what lets the surface reflect the sky
enough for its waves to show -- the way a real road shows them.

Three passes. The first, 0.35 m cells and 2.5 / 0.8 / 0.3 cm, was invisible at street level: a road lit by a hazy
sky barely registers a one-percent slope, and the finest scale could not live on that grid. The second added the
0.2 m grid, the patches and the trenches; the steps showed, the waves still did not. The third raised the
amplitudes and added the bump and the eased roughness, and the view toward the sun across the crossing -- the
sheen of a flat plane against the same sheen broken into waves and patch edges -- is the proof
(`glare_crossing_before_flat.png` | `glare_crossing_after.png`). The grid costs about 20 s of build time and nothing
measurable at render. `debug_height.py` (the review's `scripts/`) renders the height about the plane top-down in
false colour with a contour per centimetre; `height_map_topdown_40m.png` shows the crowns, the patch steps and the
trenches at once. Evidence: `tests/artifacts/screens/bradbury_scene/item19_road_surface/`.

## The wear as a field, and the street width restored (AI 574 items 20 and 21, 2026-09-26)

The user, on the wheel bands of items 16-18: "still too abrupt, and very bright; I don't know about their size; on
the curved streets there should be curved markings, merging all of them in the center; the markings fade away more
naturally in reality" -- and on item 17: "you also shrunk the street width; that was not the objective; make the
side street larger".

**The width first.** `ST_W_EW` is 13.0 m again (item 17 had read the photo's far kerb and cut it to 6); both streets
carry a lane each way between `ROAD_PARK_M` 2.2 m parking strips (`LANES`).

**The wear left the shader.** `road_wear(x, y, lanes, crossings)` computes the field, 0..1, and `road_height` hands it
to `road_mesh`, which stores it on the grid as the `wear` float attribute the material reads (as it reads `ptone`),
so the ruts of item 19 now follow the wear exactly and the shader has no lane arithmetic left. What the field is:

- **Wheel paths without an edge.** Every travel lane wears two paths `ROAD_TRACK_M` 1.8 m apart, each a Gaussian
  across with `ROAD_WEAR_SIGMA` 0.55 m: half strength 0.65 m out, a tenth 1.2 m out; a lane's two meet at about a
  quarter between them, so a lane reads as one soft zone with two stronger lines, and the outer path's tail dies
  in the parking strip. They run dead straight; their strength drifts between 0.6 and 1 over `ROAD_WEAR_VARY_M`
  30 m and their width by +-`ROAD_WEAR_WIDTH_VARY` 25% over 25 m, from noises of the along-street coordinate alone.
- **One merged zone per crossing.** `road_crossings` pairs every x-street with every y-street (four crossings);
  over each crossing's middle -- a rounded square, the cubic superellipse of the offsets over the half widths,
  full inside `ROAD_MERGE_IN` 0.25 and gone at `ROAD_MERGE_OUT` 1.1 -- the wear is at least `ROAD_MERGE_STRENGTH`
  0.6 and the straight paths give way to it by `ROAD_MERGE_FADE` 0.5, so the paths coming in dissolve into one
  worn area rather than crossing as a grid.
- **Turning paths round every curb return.** At each of a crossing's four corners the return's centre is the corner
  moved `KERB_R` out on both axes, and a right turn's two wheel paths run as arcs concentric with the kerb,
  `ROAD_TURN_IN` 0.9 m and a track further outside it, over the kerb's quadrant and fading `ROAD_TURN_FADE` 15
  degrees past each end so they run into the straight paths of both streets, at `ROAD_TURN_STRENGTH` 0.5.
- **Fading.** The field is scaled by the grid's edge fade like the geometry, so the paths die out over 10 m toward
  the field's edge instead of stopping; the far ring carries wear 0.

**The polish, darker.** `ROAD_POLISH_LIGHT` is 0.92 (it had been 1.05: the bands read as bright stripes), the colour
flattened `ROAD_POLISH_FLAT` 0.25 toward the road's mean, the roughness lowered by `ROAD_WEAR_SMOOTH` 0.2 and the
normal map's strength by `ROAD_WEAR_FLATTEN` 0.5 at full wear. The wear now reads as slightly darker, smoother
zones -- most clearly from a low sun -- and its strength is the one knob to push if it should read more.

A first pass had the merged zone square (a box metric) and the polish so faint it vanished from above; the second
rounded it and deepened the polish. `debug_wear.py` (the review's `scripts/`) renders the `wear` attribute top-down;
`wear_field_topdown_44m.png` shows the paths, the arcs and the merged zone over the south-east crossing at once.
Evidence: `tests/artifacts/screens/bradbury_scene/item20_21_wear_field/`.

## The road graded, and the kerb raised (AI 574 items 22 and 23, 2026-09-26)

The user, on the height map of item 19: "the asphalt irregularities look like islands. That's not how it should
work. The asphalt should be higher at the center, but also, at the corner it should wave, make bellies, very
subtle and smooth" -- and: "the height of the sidewalk is correct? It looks a little thin to me."

**Graded like a road.** The islands were the two fine noise scales and the patch steps: closed cells and blobs.
Both are gone (`ROAD_UNDULATE` keeps 18 m / 3 cm and 8 m / 1.5 cm; `ROAD_PATCH_SUNK` and `ROAD_PATCH_PROUD` are
zero, the tone patches stay). What is left is how a street is graded:

- **The crown dominates**, parabolic, `ROAD_CROWN` 1.5 cm per metre of half width: 10 cm at each centre line.
- **Bellies at the corners.** Where the point lies in two street bands -- the crossing -- the crowns are combined
  by a softmax with temperature `ROAD_CROWN_SMOOTH` 3 cm: the larger where they differ, their mean where they
  meet, so the sharp valley a plain max left along the crossing's diagonals is now a smooth one, and the four
  corner quadrants belly gently down from both centre lines into the returns.
- **Waves pinned to the gutter.** The gutter line is a fixed grade, so the waves are multiplied by a pin that
  rises from 0 at any kerb to 1 at `ROAD_PIN_M` 2 m out. The distance to the kerb comes from `_pad_dist`: every
  pavement as a rectangle with its corners rounded to `KERB_R`, so the distance follows the curb returns (a
  per-band distance would have drawn spurious lines across the crossings' openings); `PADS` lists the block's
  pavement and the eight far blocks'.
- **The gutter** falls `ROAD_GUTTER_DIP` 2.5 cm over `ROAD_GUTTER_M` 1 m from that same distance, round the
  returns too; the ruts are `ROAD_RUT` 1 cm times the wear field; the trenches 1.2 m wide and 1 cm deep.

**The kerb raised.** From the matched `ref_3q` stand the photo's kerb face at the corner spans about three ticks
of 5 pixels against under two of ours, with the photo's kerb standing a little further off (its sidewalk is
wider): the photo's kerb reads about twice ours. `ROAD_Z` is -0.08 -- the block's base is fixed at `Z_GROUND`
0.201, so the plane sets the kerb's height -- which makes the kerb 28 cm, a tall downtown stone-block kerb, with
the gutter falling a further 2.5 cm into it; `KERB_JOINT_M` is 1.0 m, the length of the photo's blocks. Every
far kerb, the catcher (`ROAD_Z` - 0.12) and the kerb profile follow the plane. `debug_height.py` takes `plane=`
so the height map is read about the moved plane. Evidence:
`tests/artifacts/screens/bradbury_scene/item22_23_grading_kerb/` -- the height map before and after is the one
to look at first.

## The crossing's wear as the traffic's movements (AI 574 item 24, 2026-09-26)

The user drew over the wear field: "all lanes should go in all possible other lanes, and the curves should continue
from the straight line; the red lines show the bands' limits, the markings should mostly be inside them; make the
fading wider, more subtle; at the center, all sorts of combinations." Item 20's turning arcs had hugged the curb
returns, concentric with the kerb, outside the lanes' envelope and joined to nothing.

**Movements.** `road_crossings` now writes, for each crossing, the traffic's turns. Right-hand traffic: on the
street along x the south lane runs east and the north lane west; on the street along y the east lane runs north
and the west lane south. Each of the four arms brings one lane in, and that lane turns right into the lane leaving
on its right and left into the lane leaving on its left (straight through is the lane's own band). A turn is the
fillet between the incoming lane line and the outgoing one: for directions d1 in and d2 out meeting at P, the arc
of radius r has its centre at P - r d1 + r d2 and runs from the tangent point r before P to the one r after it, a
quarter circle from direction -d2 to direction d1 about the centre. Tangent at both ends is the point: the turn's
wheel paths leave the straight wheel paths and rejoin the next street's without a break, which is what "the
curves should continue from the straight line" asks. `ROAD_TURN_R_RIGHT` 7 m keeps a right turn's outer wheel
path well inside the envelope (about 4 m off the pavement corner); `ROAD_TURN_R_LEFT` 11 m sends every left turn
through the crossing's middle, where the four of them cross the eight straight paths -- the combinations.
`road_wear` lays each turn's two wheel paths as Gaussians of `ROAD_TURN_SIGMA` 0.8 (turning cars spread more than
through ones) at `ROAD_TURN_RIGHT` 0.5 and `ROAD_TURN_LEFT` 0.4, over the arc's quadrant only; the quadrant's
ends fall on the straight bands, which are stronger, so nothing shows a seam.

**Softer.** The straight paths' sigma is `ROAD_WEAR_SIGMA` 0.65 (half strength 0.77 m out); the wear has its own
edge fade, `ROAD_WEAR_FADE_M` 20 m inside the grid's edge (the geometry keeps 10), so the bands die out over a
long stretch; the merged zone is `ROAD_MERGE_STRENGTH` 0.45, rising from 1.2 to 0.2 of the half width, the
straight paths giving way to it by `ROAD_MERGE_FADE` 0.35. `road_crossings` asserts a lane each way; another lane
count needs its own movement table. Evidence: `tests/artifacts/screens/bradbury_scene/item24_movements/` (the
sketch is `user_sketch_movements.webp`; `wear_field_before.png` | `wear_field_after.png` is the comparison).

## The wear's profile, and the asphalt's roughness (AI 574 item 25, 2026-09-26)

The user: "reduce the strength of the tire wear; make the fading wider, and the peak narrower; and make the
asphalt more rough in general; it is too plastic right now."

**The profile.** A wheel path across is no longer one Gaussian but `_path`: a narrow peak on wide skirts --
`ROAD_WEAR_PEAK` 0.55 of a Gaussian of `ROAD_WEAR_CORE` 0.45 times the sigma (0.29 m for the straight paths: half
strength 0.34 m out) and the rest of one of `ROAD_WEAR_SKIRT` 2 times the sigma (1.3 m: a tenth 2.8 m out). A
lane's two paths add, since their skirts overlap between them, so a lane reads as one long soft zone with two
narrow lines in it; lanes, streets and the crossing's movements take the maximum as before. The whole field is
scaled by `ROAD_WEAR_GAIN` 0.65, and the polish is milder (`ROAD_POLISH_FLAT` 0.15, `ROAD_POLISH_LIGHT` 0.95,
`ROAD_WEAR_SMOOTH` 0.15, `ROAD_WEAR_FLATTEN` 0.3).

**The roughness.** Item 19 had eased the asphalt_02 set's roughness by 0.85 (mean 0.77 to 0.65) so the sheen of a
low sun would show the surface's waves; with the crown and the bellies of item 22 the surface shows without it,
and that sheen is what read as plastic. `ROAD_ROUGH_SCALE` is 1.10 (mean 0.85), the set's normal map is
strengthened by `ROAD_NORMAL_GAIN` 1.4 for the aggregate's grain, and `ROAD_BUMP` is deeper with a 2.5 cm grain
added (2.5 mm over 25 cm, 1.2 over 8, 0.4 over 2.5). The view toward the sun is the proof: a glossy sheet
before, a matte grain after. Evidence: `tests/artifacts/screens/bradbury_scene/item25_wear_profile_roughness/`.

## The kerb's top (AI 574 item 26, 2026-09-26)

The user: "the kerb seems to be thin, I don't see its border at the top of the sidewalk." The kerb of items 3, 15
and 23 had only its 5 cm rolled edge between the slabs and the face: seen from above it was a line, and the
photo's kerb is a course of stone blocks with a top of its own. `KERB_PROFILE` now begins at the slabs' edge,
steps up `KERB_TOP_PROUD` 8 mm onto the kerb, runs `KERB_TOP_W` 0.30 m across its flat top, and only then rounds
over the edge and drops down the face as before; `KERB_ROUND_FIRST` 2 marks where the round's quads start for
smooth shading, and `kerbed_pavement` insets the slabs by the top's width plus the round, so the slabs end where
the kerb begins. `kerb_material` gives the whole kerb `KERB_TONE` 0.88 of the slabs' set -- the photo's kerb is
a darker stone than its sidewalk -- a dark joint along the slabs (`sjoint`: the step's face and the first
centimetre of the top) and the face tone from `KERB_V_FACE`, past the top and the round; the metre joints of item
23 run across the top, so the kerb reads as blocks from above. Evidence:
`tests/artifacts/screens/bradbury_scene/item26_kerb_top/` (the photo's kerb beside ours at the same crop, before
and after).

## The kerb weathered (AI 574 item 27, 2026-09-26)

The user: "make the kerbs dirty. Water lines, dirt at the bottom, irregular shapes, edge wear." `kerb_material`
now ends in a weathering chain written in h, the height above the gutter's foot (0 there, the face's height at
the round's end), and u, the run along the kerb, every feature varying along u by its own noise so that nothing
repeats from block to block:

- **Dirt at the foot.** A band up to `KERB_FOOT_H` 10 cm, its top edge wandering +-`KERB_FOOT_VARY` 5 cm over
  1.7 m with a finer 0.3 m raggedness on top, darkest at the foot (`KERB_FOOT_DARK` 0.5), mottled at 8 cm, and
  heavier on some 4 m stretches than others.
- **Tide lines.** Two, from standing water, at `KERB_TIDE_H` 10 and 16 cm wobbling +-3 cm along the kerb, each
  sharp above and fading down over `KERB_TIDE_FADE` 4 cm, darkening `KERB_TIDE_DARK` 0.5, present on about two
  thirds of the length (a 3 m noise thresholded at 0.42-0.50: Perlin's Fac lives near 0.5, so a threshold of 0.6
  is almost never met -- the first pass showed no lines at all for that reason).
- **Grime over the face**, `KERB_GRIME` 0.3, in irregular patches from a 0.18 m noise gated by a 0.9 m one,
  heavier low down.
- **Drip streaks** down the face on `KERB_STREAK_P` 15% of the blocks (the block's own white noise picks them and
  places the streak within the block), `KERB_STREAK_W` 2 cm, broken along their length by a 5 cm noise.
- **The arris worn** pale by `KERB_EDGE_WEAR` 0.25 over `KERB_EDGE_BAND` 4 cm either side of the round where a
  0.9 m noise says it is worn, coming and going along the kerb; the roughness drops there. **Chips** on
  `KERB_CHIP_P` 10% of 0.25 m cells along the arris, `KERB_CHIP_R` 3 cm with a ragged outline, paler by
  `KERB_CHIP_LIGHT` 0.25.
- **The dirt's colour.** The foot band and the tide lines go `KERB_DIRT_AMT` 0.85 of the way to
  `KERB_DIRT_TINT`, a warm brown grime, rather than merely darker (a grey pass read as shadow); the roughness
  rises with the dirt.

Five passes. In the first the face's height was measured from the wrong end of the profile (`KERB_H_FACE` took
the round's end as the top) and the coverage threshold sat above Perlin's range, so nothing showed;
`debug_kerb.py` (the review's `scripts/`), which renders the weathering factor alone from any camera and can probe
any node of the chain by its location (`at=x,y`), found both. Evidence:
`tests/artifacts/screens/bradbury_scene/item27_kerb_weathering/`.

## The sky (AI 574 item 1, 2026-09-26)

The photo's sky is a deep clear blue to the top of the frame, paling toward the horizon and toward the right, with
thin cirrus and one small cumulus; the block stands in a crisp afternoon sun. The scene's sky was the game's default
`german_town_street_2k.hdr`, a street-level map whose sapling and field stood behind the block at the wrong scale
and whose hazy light came from the wrong side (the review of 2026-09-25, `sky_candidates_sheet.png`). The user
chose `kloofendal_43d_clear_puresky` from the five candidates and decided the steps: import it into the game, turn it
to the photo's sun, put the lamp on its disc, grade what the camera sees.

- **The map, imported.** Poly Haven's "Kloofendal 43d Clear (Pure Sky)" (Greg Zaal, CC0), the 2k `.hdr` and a 4k copy
  in `assets/public/lighting/hdri/` with one `kloofendal_43d_clear_puresky.source.json` beside them (page, download
  URLs, license, author, date, sizes, md5s, what uses which). `assets/` is the shared junction and gitignored
  (`.gitignore:2 /assets`), so nothing downloaded is committed. `IBLCatalog.js` gains
  `IBL_ID.KLOOFENDAL_43D_CLEAR_PURESKY_2K` ("Kloofendal 43d clear pure sky (2k)"); `DEFAULT_IBL_ID` stays the German
  map, since the game's default sky is not this item's. The 4k copy is the scene's backdrop: the reference stand sees
  40 px of frame per degree of sky, a 2k map holds 6. `node --test tests/node/assets` passes (the HDRI folder allows
  25 MB and 4096 px; the 4k file is 18.4 MB, 4096 x 2048).
- **The convention, corrected.** `hdri_sun_direction` now reads the map as Cycles does -- u = 0.5 - atan2(y, x) / 2pi,
  v = 0.5 + asin(z) / pi, row 0 at the bottom -- and returns the map's own sun; the mirrored reading of item 9/10 and
  its apologies are gone. This map's sun stands at azimuth -36.2, elevation 42.9 (u 0.600; `scripts/sky_stats.py`).
  The Mapping node turns the lookup, so a texel at azimuth a is seen at a - rot.
- **The turn and the lamp.** `rot` defaults to `auto`: the map turned so its sun stands at `sun_az`, which defaults
  to `SUN_AZ_PHOTO` +40, the photo's sun as measured below (rot = -36.2 - 40 = -76.2; the prompt's -60, rot 23.8, is
  still there as `sun_az=-60`). `sun_el` defaults to `map`,
  the disc's own elevation, so the lamp (`sun` 8, as before) sits exactly on the disc and the two throw one shadow.
  Their strengths were checked against each other: at strength 1 the map's sun carries 6.1 W/m2 facing and the rest
  of the sky 1.27 on the horizontal, so with the lamp the sun-to-sky ratio on the ground is 7.6 : 1; the photo's road
  reads about 8 : 1 between its sunlit and shaded asphalt. `HDRI_STRENGTH` is 1.0 (the map as photographed; the
  German map's 0.75 made room for a lamp its haze needed). Every old key still works: `hdri=<number>` is the
  strength as it was (`strength=` is the plain key now), `hdri=german rot=250 sun_az=map` rebuilds the old scene with
  the lamp on the German sun's real place (azimuth 73.9, 18.7 up), `sun=0`, `sun_el=45`, `exposure=`. The map is
  picked by name from `SKIES` (`kloofendal` takes the 4k copy, else the 2k; `kloofendal_2k`; `german`) or by path.
- **The visible sky, graded.** The frame's sky lies 3 to 10 degrees over the horizon (the horizon 32% down, the
  camera tilted 6.2 degrees), where this map is hazy: ungraded, the top-left corner (x 0.15, y 0.03) renders sRGB
  (135, 159, 184) against the photo's (130, 176, 225). The world's tree keeps the light and the picture apart: the
  Environment lookup feeds a Background (`SKY_LIGHT`, the map itself) that every ray but the camera's sees, and a
  Hue/Saturation node (`SKY_GRADE`, `SKY_SAT` 1.55, `SKY_VAL` 2.4) into a second Background (`SKY_SEEN`), a Mix
  Shader on Light Path's Is Camera Ray choosing between them. Saturation alone cannot reach the photo's blue: AgX
  desaturates as it compresses, so x2 gives (10, 130, 187) -- red gone, blue no higher -- because the photo's blue is
  a brighter blue, linear (0.22, 0.43, 0.75) against the map's (0.21, 0.33, 0.55). Value and saturation together do:
  `scripts/sky_tune.py` swept both on the saved scene (2 s a render of the top band, the map then turned to -60)
  and 1.55 / 2.4 lands the top-left at (131, 182, 223); turned to +40, where the scene now stands, the full render
  reads (132, 182, 222), within 6 levels on every channel either way. The grade never touches the light: the corner
  apron renders (189, 179, 169) whatever the grade (`tune/leak_*.png`). The photo pales from left to right toward the
  anti-solar point, and turned to +40 the map does too, less (top-right (162, 195, 225) against (186, 211, 237), the
  right horizon (199, 204, 212) against (209, 228, 240)); that residual is left alone. Nishita was not needed.
- **Exposure stays 0.** The sunlit slabs at the corner apron read (173, 164, 153) against the photo's (214, 193, 171),
  0.6 stop short; but the sunlit brick already sits at the photo's level (Broadway's hue-masked brick (194, 150, 131)
  against (196, 147, 115)), so the stop that would lift the slabs would put the walls 30 levels over. The shortfall is
  the slabs' albedo, item 4's.

**The photo's sun, measured: +40, and the default set to it.** The prompt had the sun at -60, behind the camera's
left shoulder, "both faces lit, 3rd Street the brighter" -- a hand reading of 2026-09-25. Measured while the item was
built (`scripts/brick_mean.py`, `shadow_edge.py`, `unproject_ground.py`; `item1_sky/item1_numbers.md`), the photo
says otherwise: its south face (3rd Street, on the left) is in shade, hue-masked brick (101, 66, 51), with no
fire-escape shadows at all (`tune/photo_left_face.png`); its east face (Broadway, on the right) is the sunlit one,
(196, 147, 115), its corbels shadowing down and to the left (`tune/photo_right_face.png`); and the dark far half of
3rd Street's road (luminance 34-47 against 110-134 lit) ends on a line that, unprojected through the `ref_3q` camera
onto the ground, runs at azimuth -136 straight from the block's south-east corner base (15.8, -17.9) -- the block's
own shadow, which puts the sun at about azimuth +40 (+-4), behind the camera's RIGHT shoulder, 42.9 up as the map has
it; the pavement at the wall base is shaded west of that line and lit east of it to within 0.3 m. A lamp at -60 lit
3rd Street's face to (211, 168, 149) (`ref_3q_after_sun-60_rejected.png`). At +40 the shipped render gives 3rd Street
(101, 64, 50) and Broadway (194, 150, 131), the photo's faces to within 2 levels (blue apart, the brick's own tone),
and the block's shadow across 3rd Street's road where the photo has it (road (24, 30, 37) against (35, 39, 49)). It is
also the side the light came from in the scene the user kept on 2026-09-25 when the -60 lamp was reverted (the
mirrored reading's lamp stood at 33.9). The user decided the same day: the measured sun stands, `SUN_AZ_PHOTO` is
40.0, `sun_az=-60` gives the prompt's reading on demand, and `item1_sun_alternative.png` keeps the comparison, photo |
rejected -60 | chosen +40. A second shadow edge parallel to the block's crosses the frame's bottom 7-8 m further
south-east: another caster to the north-east under the same sun, item 7's.

Under the horizon a pure sky is flat grey, and beyond the real ground's edge the frame shows it: that is item 2's
ground to the horizon, not a sky fault. Evidence: `tests/artifacts/screens/bradbury_scene/item1_sky/`
(`item1_reference_before_after.png`, `item1_sky_crop.png`, `ref_3q_after.png` -- the +40 state --,
`ref_3q_after_sun-60_rejected.png`, `item1_sun_alternative.png`, `item1_numbers.md`, the sweeps and photo crops under
`tune/`); the scripts beside the review's:
`sky_stats.py`, `sky_tune.py`, `measure_sky.py`, `brick_mean.py`, `shadow_edge.py`, `unproject_ground.py`,
`row_profile.py`.

## The ground to the horizon, and the haze (AI 574 item 2, 2026-09-26)

Beyond the streets the photo has dry vacant lots -- pale, nearly neutral dirt with dark specks, sunlit across 3rd
Street at sRGB (176, 164, 154), 64-78% of the slabs' brightness in linear light at saturation 0.13 -- each behind a
sidewalk strip along its kerb and bounded by low walls with dry tufts at their feet (item 28's); 3rd Street runs off
the frame's left edge and Broadway off its right, and everything far fades toward the sky. The scene's real ground
ended at `GND_R` 150 m, where the pure sky's flat grey showed through the catcher, so from every stand the block stood
on a concrete plain that ended in a seam.

- **The ground runs to the horizon.** `GND_FAR` 3500 m replaces `GND_R`: the eight far blocks, their kerbs and the
  four streets' far road quads all run to it, at the same world-space tiling throughout, so nothing ends. Extending
  the blocks was chosen over a plain taking over past 150 m, whose kerb ends and strip ends would have been seams of
  their own. From the reference stand 14.4 m up the edge lies 0.24 degrees under the level line, 9 px, and by then
  the haze has made it the sky's own colour; a ray cast through the `ref_3q` camera (`scripts/probe_rows.py`) hits
  `scn_pavement_far_nw` at 2882 m on row 420, with the horizon on row 409.
- **The far blocks are vacant lots.** `kerbed_pavement` takes `lot=(material, strip)`: the pavement becomes a sidewalk
  strip `PAVE_W` 4.2 m wide inside the kerb (a ring of quads) round an interior n-gon in the lot's material, one mesh,
  two slots; the block's own pavement stays filled. `lot_material` is two of the game's ground sets laid per random
  Voronoi cell (`LOT_TILE_M` 9 m, turned and slid per cell, as `road_material` lays the asphalt, so no tile repeats
  over a lot that runs to the horizon) and traded over a `LOT_BLEND_M` 30 m noise across `LOT_BLEND` 0.44-0.56 --
  patches of earth and of gravel, as a trodden lot has them; colour, packed AO / roughness and normal mixed by one
  factor; no tint, no lift, no mottle. The sets, `LOT_SETS`: brown_mud (1.3 m tiles) and rock_ground (4 m), chosen by
  numbers (`scripts/lot_colours.py`): each candidate's mean albedo against the pavement set's predicts what it would
  render as beside the photo's sunlit slabs -- brown_mud (176, 156, 128), nearest the photo's dirt in tone;
  rock_ground (192, 176, 160), nearest in greyness; gravelly_sand (244, 184, 129), far too bright and orange;
  forest_ground_06 (155, 116, 82), too dark. None of the game's grass sets is dry grass (all lush green), so the lot
  is dirt and the dry tufts come with item 28's wall. Rendered, the lot across 3rd Street reads (171, 164, 157) at the
  photo's (176, 164, 154) spot.
- **The haze.** `scn_haze`, a node group any material's final shader passes through (`hazed(m)` in the sky section
  wraps a material's output; the four ground materials are wrapped, and later items wrap walls, trees and cards the
  same way): Camera Data's View Distance mapped from `HAZE_NEAR` 150 m (nothing) to `HAZE_FAR` 3000 m (all sky), on
  camera rays only (Light Path), times an `Amount` input, into a Mix Shader with an Emission. The colour is not a
  constant: the horizon pales toward the frame's right (left (185, 195, 209), right (200, 205, 213) in the step-1
  render), so the group looks the sky up in the ray's own azimuth flattened to the horizon -- Geometry's Incoming
  negated with z dropped, normalised, through a Mapping turned as the sky is (`HAZE_TURN`), the same environment
  image, a Hue/Saturation copy of `SKY_GRADE` (`HAZE_GRADE`), at `HDRI_STRENGTH` -- so a plain that ends fully hazed
  meets the map behind it without a step in any direction (the map is continuous through its horizon: the row under
  it renders within a level of the row over it). Emission sampling is off on every hazed material so the ground is no
  mesh light. Not a world volume, which would haze the sky and cost samples. The sky section now precedes the ground
  section, because the group is made from the world's own lookup and turn. The factor rendered as itself
  (`scripts/debug_haze.py mode=factor`, decoded from the PNG's sRGB) tracks the design at every probed row: 0.958 at
  2882 m (designed 0.959), 0.447 at 1424 m (0.447), 0.078 at 367 m (0.076); it is 0 on the block, whose walls render
  identically with the group's Amount at 0 ((54, 33, 26) against (54, 33, 27) at x 0.08, y 0.45).
- **The cameras' far clip.** The first full render still showed the plain ending short: a band of sky between the
  ground and the horizon on rows 412 to about 436. Not the geometry (the ray cast found it there) but Blender's
  default camera clip of 1000 m, 0.6 degrees under the reference horizon. Every camera now gets `CAM_CLIP`, 2 x
  `GND_FAR`; `render_wear.py`'s `cam=` camera and `debug_haze.py`'s take the scene's own.

Two things found and left, for the record:

- **The shaded face darkened.** Nothing the camera sees of the block changed (the corner apron (173, 164, 153),
  Broadway's slabs (164, 158, 150), the road's shaded half (23, 29, 37) and its lit half (166, 162, 156) all within a
  level of step 1), but the hue-masked brick of 3rd Street's face, in shade, reads (85, 53, 42) against step 1's
  (101, 64, 50) and the photo's (101, 66, 51), and Broadway's (190, 147, 128) against (194, 150, 131). It is bounce
  light, attributed by rendering the face region in three ground states (`scripts/face_bounce.py`): with the lots
  given the pavement's concrete the face reads (91, 56, 43), and with a ring of Blender's default 0.8-grey material
  laid from 150 to 600 m -- what the shadow catcher, never given a material, was to every ray but the camera's until
  now -- it reads (95, 61, 48). Step 1's match of the shaded face had borrowed light from that plane; the lot's
  albedo, the photo's own, accounts for the rest. A brighter pavement (item 4) bounces more onto it, and the walls,
  trees and buildings of items 28 and 29 will change it again; left as measured.
- **The photo's far background** at the horizon is a hazy skyline and hills, (166, 175, 182) over the level line;
  ours is a bare plain fading into the sky, which is what this item intends (items 28 and 29 stand things on it).

Evidence: `tests/artifacts/screens/bradbury_scene/item2_ground_horizon/` (`item2_reference_before_after.png`,
`item2_horizon_left.png`, `item2_horizon_right.png`, `item2_along_3rd_street.png` -- a standing eye in the Broadway
crossing looking west along 3rd Street, before and after --, `ref_3q_after.png`, `along_3rd_before.png` /
`along_3rd_after.png`, `item2_numbers.md`, the passes, factor and attribution renders under `tune/`); the scripts
beside the review's: `lot_colours.py`, `debug_haze.py`, `probe_rows.py`, `face_bounce.py`.

## The near context: walls, hedges and the game's trees (AI 574 item 28, 2026-09-26)

Behind the block on both sides the photo has things at 80 to 130 m: on the Broadway side, past the block's east end,
a grey concrete wall about 2 m tall with a chain-link fence along its top, a hedge in front of it, three tree crowns
behind it and, further back, the shaded tan side of a warehouse; on the 3rd Street side, past the block's west end, a
low dark wall with dry grass tufts along it, a sunlit cream wall behind that, and trees 10-14 m tall whose tallest
crown reaches the horizon line. After item 2 the scene had dry lots to the horizon with nothing standing on them.
Item 28 wants all of it as geometry -- under this sun a card reads flat and its shadow is a sliver -- and the trees
as the game's own models, so they self-shadow and throw real shadows.

- **The photo, unprojected first.** Every element's frame fractions were read off the photo by column
  (`scripts/column_edges.py`: the mean of a column walked down in 0.005 steps, an edge where the luminance jumps)
  and unprojected onto the scene's ground through the reference stand (`scripts/unproject_ground.py`,
  `scripts/context_frame.py`, the same pinhole both ways). The right side lands: the grey wall's base
  (x 0.93-1.0, y 0.62) unprojects to (6.3, 33.1)-(9.2, 37.3), 86-88 m off, which is the N lot's kerb and sidewalk
  strip, and a 2 m wall on the strip's interior edge (y 39.13) projects to 0.562-0.600 against the photo's
  0.565-0.61. The left side cannot land: the photo's Bradbury has its vacant lot right against the block's west
  end, so the photo's low wall (x 0-0.06, y 0.555-0.605) unprojects onto the block's OWN south kerb and pavement
  here (x -25 to -38, y -20 to -24, 82-94 m), and the scene's 13 m west street plus 4.55 m from a kerb line to a
  lot's interior put the nearest ground a wall can stand on at x -57.75, 113-115 m off, 0.02-0.06 of the frame
  higher than the photo. That is left as the streets give it (never change the streets to fix a look).
- **The library: `build_context.py`.** The game's fifteen desktop trees (`assets/trees/Models/Desktop/SM_H_Tree_1..15
  .FBX`, `T_Leaf_Realistic9.TGA` 2048 RGBA with the cut-out in its alpha, its normal, `T_Trunk_Realistic9.TGA` and
  its normal) are imported once, headless, by `bpy.ops.import_scene.fbx` (Blender 5.2 has it, and a native
  `wm.fbx_import` beside it) into `tests/artifacts/blender/bradbury/portal_project/context_library.blend`:
  `blender -b -P src/graphics/content3d/buildings/authoring/BradburyBlock/build_context.py --` rebuilds it in
  about 40 s (`sheet=1` also renders the fifteen in a row at 10 m under the scene's sun to
  `item28_near_context/tune/library_sheet.png`). Each tree is one mesh with a trunk slot and a leaf slot (the game
  reads the same: a slot is foliage when its material's name says leaf); the importer applies the pack's
  centimetres as a 0.01 object scale, which is baked into the vertices so a linked mesh is metres with nothing to
  apply; the trunk's lowest vertex is the base, as in `TreeGenerator.js`, moved to z 0; the measured `height`
  (14.1 to 29.2 m native), `crown_z` (the lowest leaf: below the ground on trees 1-10, 2.6-7.4 m up on 11-15, which
  are bare-trunked) and `radius` are custom properties of the mesh. Two Cycles materials shared by all fifteen:
  `ctx_leaf` (the TGA's colour through a `LEAF_TINT` multiply, white in the library, into a Principled BSDF with
  `LEAF_TRANSLUCENT` 0.15 of a Translucent BSDF -- the sun comes through a crown -- mixed against a Transparent
  BSDF by the TGA's alpha, so it cuts out and shadows as a cut-out on both faces, plus the leaf normal map at 0.4)
  and `ctx_trunk` (its colour, roughness 0.85, its normal map at 0.7; the pack is an Unreal one and its green
  channel is taken as it comes). The transparent texels of the leaf TGA are already bled to the leaf colour
  ((174, 162, 112) mean), so there are no dark fringes. The FBX's own materials point at the author's drives and
  are dropped; `UCX_` collision meshes too.
- **Linked, placed, hazed: the context section of `build_scene.py`.** `context=on` (the default; `off` skips it;
  it needs the street ground) links the library's objects as the block is linked -- the prototypes sit on a
  hidden `CONTEXT_LIBRARY` shelf collection -- and places instances from `TREES`, a table of (x, y, library tree,
  height m, turn): each placement is a local object sharing the linked mesh, scaled to its height by the mesh's
  measured `height`, sunk `TREE_SINK` 0.05 as the game plants them, and carrying the scene's own copies of the two
  materials as object-level material slots, because a linked material cannot be edited and every material here
  passes through `hazed()`. The copies get `LEAF_TINT` (0.50, 0.42, 0.42): the game's foliage rendered sunlit at
  sRGB (163, 172, 111) against the photo's crowns (110, 104, 63), a yellower green half again as bright; tinted,
  the sunlit foliage reads (116, 104, 72) and the shaded side of a crown (59, 56, 24) against the photo's
  (52, 51, 31) (at translucency 0.30 the shaded side glowed at (92, 88, 40); 0.15 is a touch). 29 trees: on the N
  lot the three crowns the frame sees right of the block (2, 44) 9 m, (-4, 52) 9.5, (-10, 60) 8.5, three more to
  close the gaps between the game's airy crowns, and five for the other cameras; on the W lot eleven in the wedge
  the stand sees left of the block's west end (azimuth 166.7 to 169.4 from the eye), 13-14 m where the photo's
  tallest crown is (x 0.037-0.045: tops at frame y 0.324-0.334 against the photo's 0.33) and 10-11 m toward the
  frame's edge (the photo's tops there 0.385-0.405; ours 0.359-0.379), and five further north.
- **The walls, as boxes in the game's PBR sets.** `LOT_IN` = the kerb's top plus the strip, 4.55 m: a lot's interior
  begins there. The W lot is ringed by `ctx_wall_low`, `LOW_WALL_H` 1.2 m, `LOW_WALL_T` 0.25, `LOT_W_DEPTH` 75 m deep
  (base 0.548, top 0.529 at the frame's left edge); the cream wall is a walled yard `CREAM_YARD` (-72, -60, -17.2,
  -2.2) with `CREAM_WALL_H` 3.5 m walls 2 m behind it, so its sunlit east face rises from the low wall's top line to
  0.487, as the photo's cream band rises from its dark wall's top (0.55) to 0.495, and the trees behind the yard
  have their feet hidden by it, as the photo's do; a 2.4 m wall 18 m inside the lot was tried first and left a
  grey band of low wall under it where the photo has cream. The N lot has `ctx_wall_retaining`, `RET_WALL_H` 2.0,
  `RET_WALL_T` 0.3, along its south edge and `LOT_N_DEPTH` 40 m up its east edge, and the warehouse `SHED_N`
  (-30, -9, 68, 80, 6 m) whose shaded south face stands at the frame's right edge with its top at 0.440 (the
  photo's 0.44). Every box is grid-aligned and lit as the sun has it: the N lot's south faces in shade, as the
  photo's grey and tan walls read; the W lot's east faces in sun, as the photo's cream wall reads; the low wall's
  east face sunlit where the photo's south-facing one is shaded, so it is a dark plaster. The sets, `WALL_SETS`,
  were chosen by what a face renders as here, measured pass by pass: the retaining wall is `plastered_wall_02`
  lifted (1.45, 1.6, 1.8) -- `rough_concrete` rendered (92, 75, 56) against the photo's (135, 119, 107), too dark
  and brown (a south face here takes about (0.28, 0.20, 0.16) of its albedo times its AO in linear light: the sky
  and the strip's warm bounce), the plaster lifted evenly by 1.5 (132, 104, 90), pink; the low wall is
  `plastered_wall_05` tinted (0.6, 0.55, 0.5) (a sunlit east face takes about 4.3 times its albedo, and the dark
  set alone rendered (140, 142, 144)); the cream yard `plastered_wall_02` as it is ((216, 211, 206) against the
  photo's (238, 225, 211)); the warehouse the same plaster turned ochre (1.15, 0.95, 0.65), with `corrugated_iron_02`
  on its roof. `ground_material` gained a `tint`, `ground_mesh` a target collection.
- **The fence.** `ctx_fence_posts`: a six-sided post of `FENCE_POST_R` 3 cm every `FENCE_POST_M` 3 m, `FENCE_H` 1.8 m
  tall on the wall's top, and a square rail along the top; `ctx_fence_lattice`: one card along the wall's centre
  line whose material is galvanised wire where the UV (u along the run, v up, metres) lies within half a wire of
  either diagonal family of a diamond mesh (PINGPONG of (u +- v) / `FENCE_PITCH` 6 cm against `FENCE_WIRE`
  2.7 mm / sqrt 2 of the pitch) and clear elsewhere: about 12% cover, far under a pixel from 90 m, a grey veil that
  the photo also shows between the wall's top and the crowns (x 0.99, y 0.535-0.565; ours 0.527-0.562).
- **The hedge.** The photo's stands at the wall's foot, but on nearer, lower ground (its foot unprojects to 75 m,
  the block's own north kerb); here a hedge at the wall's foot hid the wall's face the photo shows, so it is a
  parkway planting `HEDGE_OFF` 2.1 m inside the N lot's kerb, `HEDGE_MODELS` (4, 1, 3) -- the library trees whose
  crowns reach the ground -- scaled to `HEDGE_H` 1.3-1.7 m, sunk `HEDGE_SINK` 0.3 so the bare stem is buried and
  the crown sits on the ground, every `HEDGE_STEP` 0.5-0.7 m so the airy crowns overlap into one mass (at 0.6-0.85 m
  and 1.1-1.4 m they read as a row of saplings from the street), 150 bushes along the north street and up
  Broadway. Its shadow, 1.5 m long, ends on the kerb's top: nothing new shadows a road.
- **The tufts.** `ctx_tufts`, one mesh of 6370 blades: along the low wall's foot on both sides of its east and
  south runs, a place every `TUFT_STEP` 0.35 m, `TUFT_P` 0.55 of them taken, `TUFT_OFF` 0.12-0.55 m out from the
  face, each tuft `TUFT_BLADES` 14-22 thin triangles `TUFT_LEN` 0.25-0.5 m long leaning `TUFT_LEAN` 15-45 degrees
  from vertical, `TUFT_COLOUR` (0.32, 0.23, 0.12) dry straw with 0.35 of translucency, every blade's tone its own
  (`TUFT_VARY` 0.2, an attribute the material reads). From the reference stand they are a few pixels at the
  wall's foot; they are there for the street-level cameras.
- **The sun, checked.** Every shadow runs to the west-south-west at 1.08 times the height; everything stands north
  or west of the streets; the road and pavement points of the BEFORE and AFTER renders are identical within a
  level ((0.97, 0.66) north street (168, 164, 159) / (167, 164, 158); (0.98, 0.75) Broadway (168, 163, 157) both;
  (0.10, 0.80) 3rd Street's shaded half (23, 29, 37) both; the corner apron (183, 174, 164) both), and the sky
  and horizon points too.

Numbers, photo against render (`item28_numbers.md`): the grey wall's top 0.565 / 0.562, its base 0.61 / 0.600,
the fence veil 0.535-0.565 / 0.527-0.562, the right crowns' tops 0.41-0.43 / 0.40-0.42, the warehouse top
0.44 / 0.440; the cream wall 0.495-0.55 / 0.487-0.529, the low wall 0.555-0.605 / 0.529-0.548, the left crowns'
tops 0.33 / 0.324-0.334 by the block and 0.385-0.405 / 0.359-0.379 at the edge (by the trees' own tops; the
rendered columns read foliage from 0.36 at x 0.01 and 0.33 at x 0.03, because the tall crowns spread across the
wedge); the hedge 0.615-0.67 / 0.585-0.605 (its crown projects to 0.573-0.600; the scene's north street lies where
the photo's hedge stands, and the photo's pavement at 0.67-0.685 is the block's own north kerb here at 0.694).
Tones: the wall face (135, 119, 107) / (130, 109, 101), the sunlit foliage
(115, 109, 72) / (116, 104, 72), the shaded crown side (52, 51, 31) / (59, 56, 24), the cream wall (238, 225, 211) /
(216, 211, 206). Expected and left for their own items: no lamp posts (item 8), no far white boxes or skyline
(item 29), no slab joints (item 4); the photo's cream boxes above the left trees show as the hazed plain until
item 29 stands them there.

Evidence: `tests/artifacts/screens/bradbury_scene/item28_near_context/` (`item28_reference_before_after.png`,
`item28_left.png`, `item28_right.png` -- photo | before | after at the same crops --, `item28_tree_closeup.png`, a
standing eye inside the N lot among the placed trees with the wall, the fence and the block beyond,
`ref_3q_after.png`, `item28_numbers.md`; under `tune/` the library sheet, the wall-and-hedge close-up from the
street, the passes and their composites); the scripts beside the review's: `context_frame.py`, `sample_points.py`,
`probe_frame.py`, `column_edges.py`.

## The far context: boxes, tree lines and the skyline (AI 574 item 29, 2026-09-26)

Beyond item 28's walls and crowns the photo goes on to the horizon. Left of the block, over the near crowns: a
red-brick low building cut by the frame's edge (x 0-0.02, y 0.38-0.41), behind it a white two-storey building with
dark windows (x 0.015-0.045, y 0.355-0.385) running on as a pale wing to the frame's edge, a cream one beside it, a
white sliver far off (x 0.025-0.035, y 0.33-0.335), a blue-grey band of low scrub (y 0.345-0.36), and on the horizon a
pale far city (y 0.325-0.345, (136-182)) with a darker block whose top stands just under the level line at x 0-0.02
((112, 125, 133)). Right of the block, over the near warehouse's top (0.44): a pale band of road (0.43-0.44), the
shaded ochre wall of a second warehouse (x 0.93-1.0, y 0.395-0.43), a row of white box trailers with one blue near
the east end (y 0.385-0.395), a dense dark tree line behind them (y 0.335-0.375, (44-104)), sunlit crowns breaking
the horizon at the frame's right edge (x 0.975-1.0, y 0.31-0.325), a hazy white low-rise skyline (x 0.93-0.975,
tops 0.325) and, over it, a far band reading (116-155) at 0.31-0.32. After item 28 the render showed the hazed plain
and the sky in all those places. Everything here is geometry on the lots -- grid-aligned boxes and more of the game's
trees -- lit by the same sun and hazed by the same group by distance alone; no card stands anywhere, so no Track To
was needed (a card would have taken one on the reference camera for the street-level views).

- **The photo, read by column and unprojected.** `scripts/column_edges.py` walked the far background at x 0.005-0.045
  and 0.935-0.995 in 0.005 steps; the new `scripts/zoom_crop.py` shows a region at 6x with a tick every 0.01 of the
  frame, which is how the layering was read (`item29_far_context/tune/photo_left_zoom.png`, `photo_right_zoom.png`);
  `scripts/context_frame.py` unprojected each element's top at plausible heights and its visible base at the ground.
  Where both show, they agree: the trailer row's top at 2.8 m gives 354 m and its base 346 m; the second tan wall's
  top at 5.2 m gives 226 m, its base 236 m -- a 5 m wall at 231 m on the NW lot, and the trailers behind it at 300 m
  with their wheels hidden by its top, as the photo has them. The white building's top at 9.2 m gives 231 m and the
  brick's at 6.2 m 254 m, but the photo hides the white's foot behind the brick's top, so the brick stands in front:
  7 m at 231 m, the white 10 m at 245 m behind it (pass 2 had them the other way round and showed the white's shaded
  south face where the photo has the brick). The tree line's top (y 0.335) gives 12 m crowns at 280 m or 8 m at
  745 m: 9-12 m at 360 m, more rows at 520 and 700 m, their feet behind the trailers. The far city's ground rows are
  1.2-1.7 km, the scrub's 660-1030 m. The "taller block" at x 0.01-0.03 turned out not to be tall: its top stands
  0.006 UNDER the horizon (the unprojection at 25 or 40 m goes behind the camera), so it is a 12 m dark block whose
  distance sets its tone.
- **The film, measured, and what the haze can do.** The first "dark" block (albedo 0.045) at 1.2 km rendered
  (160, 169, 180), not the 130 predicted by inverting the PNG's sRGB curve. The scene's film is AgX Medium High
  Contrast, which is no sRGB curve, so the new `scripts/agx_curve.py` renders emissive patches of known scene-linear
  value with the scene's own view settings and prints the table (0.2 shows as 125, 0.5 as 178, 1.0 as 208, 2.0 as
  229). Decoded with it: the hazed sky at the left horizon (185, 195, 209) is linear (0.58, 0.71, 1.03); the haze's
  floor -- a black surface's share of sky, factor (d - 150) / 2850 -- is (129, 140, 162) at 1.2 km on the left and
  (170, 176, 187) at 1.6 km on the right, so the photo's far hill (166, 175, 182) is 1.4-1.6 km of our haze; a
  sunlit east face renders about 3.4 x its albedo in radiance plus 0.06 of sun sheen from the Principled BSDF's 4%
  specular at roughness 0.7 (the camera stands between the sun and these faces), which is why even a black box
  reads 130 at a kilometre. Nothing about the haze was changed: things that read wrong moved. The tall block came
  from 1.2 km to 800 m as a matte near-black (`FAR_PLAIN["black"]` 0.015, `FAR_SPEC["black"]` 0.1: the sheen alone
  lifted it to a mid-grey) and reads (117, 130, 148) against the photo's (111, 126, 138); the far tree line went to
  1.3 km, where its tone is the far hill's; the far city's greys dropped to `FAR_PLAIN["grey"]` 0.12 and
  `["dark"]` 0.03 so the mix of sunlit and shaded faces lands in the photo's pale band.
- **The haze bug in every cut-out, fixed.** Every distant tree rendered as a pale ghost ((169, 169, 172) at 450 m
  where the photo has (56, 63, 59)): `hazed()` wrapped the leaf material's output, transparent branch included, so
  every clear texel a ray crossed added its share of sky, and a ray through a crown crosses dozens of cards. Under
  `HAZE_NEAR` 150 m the factor is 0, which is why item 28's crowns never showed it (its W-lot trees at 175-182 m
  paled by a percent per card). `hazed(m, at=(node, input))` now hazes the shader feeding a named socket instead of
  the output: the leaf inside `LEAF_CUTOUT`'s leaf input, the fence's wire inside `FENCE_WIRE`. The tree line at
  450 m then read (138, 139, 130), the table's prediction for hazed foliage there.
- **The mid-distance boxes: `FAR_BOXES`.** (name, x0, x1, y0, y1, height, material, parapet), grid-aligned, each on a
  lot's interior with its shadow inside it: `brick` (-184..-172, -1..7.7, 7 m, `red_brick` tinted (0.45, 0.42, 0.42):
  the set as it is rendered (205, 174, 158) in sun against the photo's brick mean (165, 130, 105); tinted it reads
  (171, 136, 122)), `white` (-196..-186, 6.5..14.5, 10 m, `plastered_wall_02` lifted (1.25, 1.27, 1.30): (225, 222, 218)
  against (222, 218, 206); it runs on west past the frame's edge so its shaded south face never shows and its east
  face stands for the photo's pale wing), `cream` (14.8..17, 8 m, item 28's cream plaster; the W lot's interior ends
  at y 17), `white2` (10 m at 1.1 km, plain white: (218, 219, 222) against the sliver's (196, 191, 188); a 12 m box at
  412 m showed a whole white wall where the photo has a sliver), `tan2` (-92..-60, 155..163, 5.2 m, the near
  warehouse's plaster lifted (1.9, 1.3, 0.78) since on the lot's dirt bounce the near tint rendered (102, 92, 83)
  against the photo's (137, 110, 92); now (130, 107, 90)) and `tall` (800 m). A `building()` is a box with a dark
  flat roof `FAR_PARAPET` 0.7 m below a `FAR_PARAPET_T` 0.3 m parapet ring; `tan2` has none and is 8 m deep, because
  from 14 m up a 30 m roof and then the far parapet's inner face filled the rows where the trailers show.
- **The trailers: `TRAILERS`, `TRAILER`, `TRAILER_DECK`, `TRAILER_BLUE`.** Ten bodies 2.5 x 12.5 x 2.6 m on 1.3 m of
  wheels (the photo's band is 4 m at 300 m), their east ends on x -105 from y 200 north at a 3 m pitch, the seventh
  blue. Parked side by side with north-south axes (pass 1) the camera saw only their shaded south ends and the row
  read grey; with east-west axes it sees a row of sunlit east ends with a sliver of shaded side between, the photo's
  look: (204, 205, 207) against (208, 208, 206), the blue one's end (185, 194, 207) at x 0.98 against the photo's
  (107, 121, 139) at 0.98-0.995. One mesh, the wheels dark, the roofs white.
- **The tree lines: `FAR_TREE_ROWS`, `FAR_ROW_PAIR`, `FAR_LEAF_TINT`, `FAR_TRUNK_TINT`.** Instances, not cards: the
  501 placements share the 15 linked meshes and cost nothing (the far section builds in 0.03 s; the full-size
  render takes 34 s). A row is ((x0, y0), (x1, y1), step, (height min, max)); every line is two staggered rows
  `FAR_ROW_PAIR` 8 m apart in models 1-10 only (crowns to the ground), because one row of airy crowns in any model
  read as pale saplings on visible trunks; the lines carry a second hazed copy of the leaf with the darker tint
  (0.28, 0.25, 0.22) and of the bark with (0.40, 0.38, 0.36), a darker species than the lot's open crowns, as the
  photo's dense windbreaks are darker than its crowns. On the right: lines at 360, 520 and 700 m (9-12, 8-11, 7-10 m);
  the far line at 1.3 km (14-20 m, its tops at 0.311-0.32 through the skyline's gaps; at 1.5 km in bare-trunked
  models it rendered pale pink, and sparse 600 m emergents read as lollipops); two sunlit 19-22 m crowns at 600 m at
  x 0.975-1.0. On the left: three scrub lines at 730, 880 and 1030 m (3.5-8 m). The tree line at 360 m reads
  (77, 83, 82) against the photo's (44, 53, 46): the haze's floor there is (58, 65, 80) for black and the game's
  foliage is the game's.
- **The skyline: `SKYLINE_ROWS`, `FAR_DEPTH`.** Rows of boxes of random width, gap and height along x (their south
  faces to the stand) or along y (their east faces), `FAR_DEPTH` 15-30 m deep, each box's material drawn from the
  row's palette shares: the right's white low-rise at 1.2 km (8-12 m; the photo's tops at 0.325, ours 0.323-0.329)
  and 1.45 km, the left's far city at 1.2, 1.65 and 2.1 km (6-14 m, grey/white/dark, greyer than the right's since
  the stand sees their east faces almost square). The right's skyline reads (194, 198, 204) at a white face against
  the photo's (188-211); the far city (156-181). The plain white of the skyline is plain because the warm plaster
  hazed read pink at a kilometre.
- **Item 28's W-wedge crowns, re-graded.** In pass 1 every left box was hidden: the four 13-14 m trees at x
  0.033-0.038, with crowns 4-7 m across at 130-175 m, spread over the whole wedge from y 0.33 down. The photo's own
  rows (its crowns at x 0-0.03 top out at 0.385-0.405, one narrow tall crown at x 0.04-0.055 to 0.33; item 28's
  numbers had noted the 0.02 deviation) now set `TREES`: 7.5-9 m where the stand sees x 0-0.035 (tops 0.377-0.40),
  and two tall ones (narrow-crowned models 2 and 7, 13.5 and 14 m) with their trunks at x 0.067 behind the block's
  edge, so only the west half of each crown shows at x 0.035-0.055 (tops 0.323-0.33). Nothing else of item 28 moved.
- **Consistency.** Every sky, road, pavement, block and near-context point of the step-3 render is identical to the
  level (the north street (167, 164, 158), Broadway (168, 163, 157), 3rd Street's shaded half (23, 29, 37), the
  corner apron (183, 174, 164), the faces (44, 29, 25) and (153, 98, 74), the cream wall (216, 212, 206), the grey
  wall (132, 113, 105), the top-left sky (132, 182, 222), the left horizon (185, 195, 209)); the plain has no seam;
  every shadow runs west-south-west at 1.08 x height onto its own lot (the nearest new thing to a strip is the
  brick's south face on y -1, the W lot's strip ending at y -17.5).

Numbers, photo against render (`item29_numbers.md`): every layer stands on the photo's row to within 0.005 of the
frame on both sides (dark block 0.325-0.345, white 0.355-0.375, brick 0.38-0.395; far band 0.315-0.33, tree line
0.335-0.375, trailers 0.38-0.39, warehouse 0.395-0.41). Tones: the tall block (117, 130, 148) / (111, 126, 138), the
white (225, 222, 218) / (222, 218, 206), the brick (171, 136, 122) / mean (165, 130, 105), the trailers
(204, 205, 207) / (208, 208, 206), the second warehouse (130, 107, 90) / (137, 110, 92), the tree line (77, 83, 82) /
(44, 53, 46), the far line (165, 171, 180) / (144, 154, 166), the edge crowns (126, 132, 130) / (103, 108, 82).
Residuals: the tree lines 20-35 levels paler than the photo's (the haze's floor at 360 m and 1.3 km); the white's
east face where the photo has a bluish pale wing; the near crowns end the second warehouse's wall at 0.41 where the
photo's reach 0.43 (item 28's crowns are 0.01-0.02 higher than the photo's). Expected and left: no lamp posts
(item 8), no second shadow across the road (item 7), no slab joints (item 4).

Evidence: `tests/artifacts/screens/bradbury_scene/item29_far_context/` (`item29_reference_before_after.png`,
`item29_left.png`, `item29_right.png`, `item29_horizon_band.png` -- photo | before | after at the same crops --,
`ref_3q_after.png`, `item29_numbers.md`; under `tune/` the photo's 6x crops, the four half-size passes with their
crops, the after crops, the horizon band's panels, `agx_curve.png`); the scripts beside the review's: `zoom_crop.py`,
`agx_curve.py`.

## Street furniture (AI 574 item 8, 2026-09-26)

The photo has three lamp posts and four vault covers, and nothing else standing on its streets: a tall grey post at
the frame's left edge (x 0.036) whose head stands at y 0.258, a tall dark one at the right edge (x 0.98, head 0.224),
a short black lantern post on 3rd Street's far pavement (x 0.027, lantern top 0.5375, foot 0.645), and dark steel
plates flush in the pavement by the kerb -- two on 3rd Street's side, one of them on the corner apron, two on
Broadway's. After item 29 the scene had none of it. Everything here was measured before it was placed, and two of the
measurements overturned the brief's reading.

- **The tall posts are high-mast lights, and their feet are hidden.** The horizon crosses the frame at y 0.32; both
  heads stand above it, so both are higher than the eye, 14.6 m, whatever their distance, and a post's height is
  what its head's ray gives at its foot (the new `scripts/post_height.py`: the ray through (0.036, 0.26) rises
  0.0324 m per metre out, the one through (0.98, 0.225) 0.0514). Traced row by row (`scripts/pole_extent.py`, the
  x of each row's strongest deviation from the band's median), the west pole shows against the sky, the white and
  brick boxes (paler than the brick, so a pale grey pole), through the crowns to 0.49, and never against the
  cream/tan wall: it stands behind that wall and before the trees, which here is inside `CREAM_YARD`, 6 m behind
  its east wall, 123 m out, 18.4 m tall, the yard hiding its foot as the photo's wall hides its own. The north
  pole is DARK ((43, 38, 39) where it crosses the white trailers) and ends at 0.4425, the near warehouse's top: on
  the rows below, against the shaded tan wall, a dark pole would have scored a deviation of 75 and nothing above
  55 was found, so it stands behind `SHED_N`, 8 m past its north wall, 149 m out, 22.1 m tall, its foot hidden by
  the warehouse and the N lot's crowns. The brief's "base y 0.67" for it is the photo's far pavement at 74 m -- our
  north street's roadway -- and the 8x zoom shows no pole there at all. `LAMP_POSTS` holds each as (name, x, y,
  kind, paint, height, turn): `ctx_post_west` (-66.1, -12.3) grey 18.4 m, `ctx_post_north` (-25.1, 88.0) dark
  22.1 m, each built by `tall_post`: a tapered twelve-sided pole `POST_TALL_R` 0.11 -> 0.05 m (0.14 / 0.07 rendered
  five pixels wide where the photo's poles are two) on a `POST_FLANGE`, a square crossbar `POST_BAR` 1.0 m
  (`POST_BAR_R` 0.045; the photo's heads measure 0.93 and 1.05 m across) with a `POST_LUM` 0.5 x 0.28 x 0.14 m
  luminaire box straddling each end, turned broadside to the stand (the head's ray less 90: 77.6 and 32.0), in
  matte plain paints `POST_PAINT` grey 0.22, dark 0.028, head 0.03 (dark at 0.015 blended to (66, 72, 80) against
  the sky where the photo's reads (102, 116, 124)). Rendered: the west head's top at 0.2605 (the photo's 0.258),
  pole x 0.0361 (0.0363), (149, 156, 164) against the sky ((147, 160, 175)), visible to the cream wall's top; the
  north head's top at 0.2245 (0.224), x 0.9777 (0.9798).
- **The black post is Poly Haven's `street_lamp_01`.** Its foot unprojects to (-23.8, -22.9), 79.5 m: 3rd Street's
  roadway, 0.8 m past our kerb line -- the photo's far pavement lies where this scene's road is (item 28), and the S
  lot's strip never enters the frame -- so it stands on the block's own south pavement on the same ray, 0.43 m
  inside the slabs' edge, (-30.7, -21.3), 86.6 m out; there the photo's lantern height comes to 3.96 m, and the
  model (Josh Dean, CC0: a black cast-iron post with a lantern and a crossbar under it, the photo's silhouette at
  4x) is 3.87 m, so it stands at its own size. The 1k glTF (five files, 2.16 MB) is installed in
  `assets/props/street_lamp_01/` with a `source.json` (page, download URLs, license, author, date, md5s, usedBy);
  `assets/` is the shared gitignored junction (`git check-ignore -v` -> `.gitignore:2:/assets`). `build_context.py`
  gains `PROPS`: each glTF imported with its images referenced where they are installed (`import_pack_images=False`),
  the transform baked, the lowest vertex on z 0, `height` and `radius` on the mesh, its materials renamed
  `ctx_prop_...` and any emission zeroed, saved as `ctx_prop_street_lamp_01`; `build_scene.py` links every
  `ctx_prop_` object beside the trees (`PROPS` by asset name), copies and hazes the prop's three materials
  (`CTX_prop_street_lamp_01`, `_glass`, `_bulb`) and places it by `place_prop` with those as object-level slots.
  Rendered: lantern top 0.540 (the photo's 0.5375), pole x 0.0255-0.0275 (0.0264-0.0269), foot 0.6175 (0.645: the
  pavement's, 7 m further out than the photo's, and in the block's shade where the photo's is sunlit).
- **The covers, measured, and two of them moved onto our pavement.** Found by local contrast (`scripts/
  find_covers.py drop=`: a pixel 40 under a 20 px blur of its surroundings; a plain threshold missed them, they are
  mid-tone) at (0.264, 0.841), (0.324, 0.902), (0.697, 0.857), (0.979, 0.771) -- 0.06 lower than the brief's
  numbers, and four, the fourth at the frame's right edge -- and sized from their pixel boxes at their distances
  (`scripts/cover_size.py`: a ground rectangle fills the frame across by a sin phi + b cos phi and up by
  (a cos phi + b sin phi) sin delta): 0.7 x 0.5, 0.9 x 0.45, 0.8 x 0.5, 0.9 x 0.6 m. C1 unprojects onto the slabs,
  (11.66, -21.03), and stands there; C2 onto the corner apron 0.19 m from the slabs' edge, pulled in along the
  return's radial so its outer edge keeps `COVER_GAP` 0.35, (17.44, -20.96), turned with the kerb; C3 and C4
  unproject 1.7 and 3.3 m INTO Broadway's road -- the photo's Broadway pavement runs wider than ours toward the
  right edge (its kerb reaches the edge at 0.775, ours at 0.729) -- so they stand at the gap inside our slabs' edge
  and are slid along the kerb to the photo's frame x (at the road points' stations they fell at 0.652 and 0.903),
  landing at (0.697, 0.816) and (0.975, 0.718). `COVERS` holds (x, y, along, across, turn). A cover is two thin
  closed boxes: a frame `COVER_RIM` 0.025 wider all round, `COVER_PROUD` 1 mm over the slabs in `COVER_RECESS`
  near black (the hairline recess), and the plate 3 mm proud inside it in `COVER_STEEL`; both reach `COVER_DEPTH`
  0.03 under the slabs, nothing is cut and nothing lies in their plane. The steel took three passes: at the photo's
  sRGB ratio of plate to slab, (0.16, 0.13, 0.105) with a 0.4 metallic sheen, the plates rendered 0.93 of the slabs
  and vanished; at (0.10, 0.07, 0.05) matte, 0.82 -- the Principled BSDF's default specular lays 0.04 linear of sky
  on a horizontal plate, a fifth of its light --; at (0.072, 0.055, 0.042), a third of the pavement set's mean albedo
  (0.216, 0.178, 0.136), with `COVER_STEEL_SPEC` 0.25, they read 0.72-0.79 of the slabs against the photo's
  0.64-0.75 (found on the render by the same local contrast at (0.329, 0.899), (0.697, 0.816), (0.974, 0.717)). C1
  renders sunlit, (139, 123, 110), where the photo's lies in the block's shade, (39, 38, 43): our shadow edge on the
  south pavement crosses y 0.834-0.837 at x 0.25-0.28 and the photo's shade runs past 0.851 there -- the block's
  south-east vertical edge stands at x 14.165 here against the photo's shadow line from (15.8, -17.9) at a sun of
  +40 +-4 (item 1), 1.2 m at the cover; left as the block and the sun give it.
- **No storm drain, no hydrant.** Every dark mark along both kerbs, round the corner and at the far kerb
  bottom-left was zoomed to 8x (`tune/photo_*_zoom.png`): kerb blocks' shaded faces, the gutter's dirt line,
  cracks, the corner door's glass, the shopfronts' plinths along Broadway's wall base. The photo has none, so none
  stands. `furniture=off` skips the section.
- **Consistency.** Every point of item 29's table -- the sky, both horizons, the roads, the pavements, the faces,
  the cornice, a shopfront, the walls, the foliage, the far context -- is identical to the level between the
  step-4 render and this one. Every shadow runs west-south-west at 1.08 x height: the west post's crosses the
  yard's south wall onto the W lot's strip and 3rd Street's westward road at azimuths 170-174 from the eye (outside
  the frame's left edge, behind the block from every other camera); the north post's crosses the N lot onto its
  west strip and the west street's road 75-80 m north of the block, behind the block; the black post's 4.2 m ends
  inside the block's own shadow. Nothing new falls on the block or on a road the stand sees.

Numbers, photo against render (`item8_numbers.md`): the west head 0.258 / 0.2605 at x 0.0363 / 0.0361; the north head
0.224 / 0.2245 at x 0.9798 / 0.9777; the lantern top 0.5375 / 0.540 at x 0.0266 / 0.0265, its foot 0.645 / 0.6175; the
covers on the photo's frame x to 0.005, C1 and C2 on the photo's row, C3 and C4 0.04-0.05 higher (the kerb's own
offset); the plates 0.72-0.79 of the slabs against 0.64-0.75; the west pole (149, 156, 164) against (147, 160, 175)
over the sky. Left: C1 sunlit where the photo's is shaded (the shadow edge, above); the north pole (63, 67, 73) against
the sky where the photo's blends to (102, 116, 124) (the photo's pole is thinner than a 1920 px pixel can be); the
black post in the block's shade on a pavement 7 m further out than the photo's, its foot 0.026 higher.

Evidence: `tests/artifacts/screens/bradbury_scene/item8_furniture/` (`item8_reference_before_after.png`,
`item8_left.png`, `item8_right.png`, `item8_pavement.png` -- photo | before | after at the same crops --,
`item8_closeup.png` -- the lantern post from 8 m and the corner apron's cover from 5 m, standing eyes --,
`ref_3q_after.png`, `item8_numbers.md`; under `tune/` the photo's 4-8x zooms of the posts, the covers and every kerb
foot, the half-size first pass with its crops, the shipped render's zooms, the two close-ups); the scripts beside the
review's: `post_height.py`, `pole_extent.py`, `find_covers.py`, `cover_size.py`.

## The off-frame neighbour's shadow (AI 574 item 7, 2026-09-26)

The photo has a second shadow across the crossing: a dark band along the frame's bottom from its left edge to x 0.53,
parallel to the block's own shadow with 5 m of sunlit road between them, thrown by something off the frame. After
item 8 the render had the block's shadow alone and the crossing's south-east quarter in full sun. The caster was
derived, not guessed -- what the band's edge is, where its caster must stand, how tall it must be, and whether it can
stand there without entering the frame or shadowing the block, every step by numbers -- and the answer is a
twelve-storey tower, not the three to six storeys the item expected.

- **The band, read.** The new `scripts/band_edge.py` scans each column of the frame's bottom from the bottom row up
  and takes the last dark sample before the road turns lit (a soft penumbra spans several samples, so the step is
  judged at the midpoint of the lit and dark levels, not between neighbours); 21 columns, x 0.08-0.48, unproject
  through the stand to ground points 0.16 m off one straight line through (19.44, -23.97) at azimuth -144 (a sun at
  36: item 1 read the block's own shadow at -136, so the photo's sun lies between and the scene's +40 stands). A
  shadow line along the sun's azimuth is a VERTICAL edge's, so the band is cast by another building's north-west
  corner standing north-east along that line: it crosses Broadway's far kerb at y -13.3 and the E lot's interior
  edge at y -10.0, so the caster stands on the E lot. The new `scripts/ground_map.py` lays a picture back onto the
  ground through the stand's pinhole (a top-down map of the crossing with the scene's kerbs drawn on, dark cells
  flagged) and `scripts/ground_intervals.py` prints the dark runs along ground rows, and they show the band has no
  other edge in the frame: south-east of its line it runs to the frame's bottom and left edges. What looked like a
  south end at y -30.8 is the photo's far kerb of 3rd Street, whose pale pavement beyond reads (116, 121, 131),
  concrete in the same shadow (the apron's lit slabs read (213, 192, 170), the slabs in the block's shade
  (84, 85, 90)); our roadway is 13 m and runs on there. On the road the band reads (49, 53, 64) against (35, 40, 50)
  in the block's shadow and (127, 115, 108) in the sun: a lighter shade, with more sky over it.
- **The line at the scene's sun.** Every shadow here runs along the lamp's azimuth, so the scene's line is laid at
  -140, not the photo's -144, and slid across the measured points to the offset where its frame crossing sits
  nearest the photo's edge on every column (`scripts/fit_neighbour.py`: 0.10 m north-west of the centroid,
  `NEIGHBOUR_EDGE` (19.38, -23.89)); the residual is the four degrees, shared out: 0.000-0.006 of the frame on the
  middle columns, 0.011 at the ends.
- **The corner and the height.** The tower's north-west corner stands where that line meets its west face,
  `NEIGHBOUR_X` 42.5 -- not the E lot's interior edge (38.74): at x 41.6 the tower's south-west vertical edge, base
  below the frame at (0.991, 1.321) and top above it at (1.092, -1.670), crossed the frame's bottom row at x 1.002,
  through the bottom-right corner; at 42.5 it crosses at 1.044 and all eight corners lie right of the frame at every
  height (the base is the nearest, since the camera tilts down). The north face is then y -4.49 (`nb_n`, computed
  from the edge point and the lamp's azimuth, so the corner follows the sun if the sun ever moves), the south face
  `NEIGHBOUR_S` -17.0 (the lot's edge is -17.53), 12.5 m deep and `NEIGHBOUR_W` 26 m wide eastward. The height is
  what carries the shadow to the frame's left edge: the line leaves the frame at ground (10.8, -31.1), frame
  (0, 0.913), 41.4 m from the corner, and a shadow is 1.08 x height at this sun (42.9 up), so 39.4 m with a metre of
  reach: `NEIGHBOUR_STOREYS` 12 of `NEIGHBOUR_STOREY_H` 3.3, 39.6 m to the parapet's top -- the class of building that
  stands across Broadway from the real Bradbury. Three to six storeys, 10-20 m, would carry the edge 11-22 m from the
  corner, to (34, -11) off the frame or just to its bottom edge at x 0.5: no band.
- **Nothing of it shadows the block.** The sun ray from the block's south-east base corner reaches the tower's west
  face 31 m up and 11 m north of its north face, the ray from the pavement's south-east corner 26 m up and 0.3 m
  north of it; the shadow's north-west line passes 0.22 m south-east of the pavement's corner (21.19, -22.08), 2.3 m
  clear of the curb return and 8.3 m clear of the block's corner, and crosses the frame's bottom edge at x 0.535: the
  apron, the kerb, the shopfronts and Broadway's face stay in the sun as the photo has them. The shadow polygon runs
  along the north-west line to (9.9, -31.9), down the west roof edge's shadow at x 9.9 to -44.4, along the south roof
  edge's at y -44.4 to x 35.9, and back up the south-east line to (68.5, -17).
- **A building of it.** `building()` from the far context, so a dark flat roof behind a `FAR_PARAPET` ring: the tower
  in the cream plaster of item 28's yard (`M_WALL["cream"]`), and a two-storey wing along Broadway north of it,
  `NEIGHBOUR_WING` (0.25, 0.5, 20, 20, 7.5): set back 0.25 m east of the tower's west face and overlapping it 0.5 m so
  no two faces coincide, 20 m deep, 20 m long to y 15.5, 7.5 m tall, in the far brick. The wing's shadow ends on the
  E lot's strip at (36.6, -10.2), below the frame's bottom-right corner, whose road is identical to three levels.
  Both hazed like everything on the lots; `neighbour=off` skips the section. No camera sees either box: from the
  stand the tower's nearest edge is 0.044 right of the frame; from st_corner 50 degrees right of the axis against a
  half field of 32.7; from hero_3q 29 degrees or more against 23.
- **Rendered.** The band's edge on the render (the same scan) runs at azimuth -140.4 through (19.48, -23.98) with
  0.06 m of scatter, and lands within 0.005 of the photo's on x 0.18-0.36 (+0.005 at 0.20, -0.0025 at 0.30, -0.005
  at 0.40), +0.010-0.0125 at x 0.08-0.12 and -0.0075 at 0.38-0.44: the ends carry the four degrees. On the ground the
  band's west edge is (22.0, -22), (19.5, -24), (16.9, -26), (14.6, -28), (12.2, -30) against the photo's (22.4, -22),
  (19.6, -24), (16.6, -26), (13.6, -28), (10.7, -30). The band reads (31, 36, 43) against the block's shadow's
  (19, 26, 34), 1.6x as the photo's is 1.4x; both shades are the scene's tone (item 1's), darker than the photo's
  (49, 53, 64) and (35, 40, 50) alike. The block's own shadow is unchanged to the tenth of a metre.
- **Consistency, and what a tall neighbour does to the light.** The sky, both horizons, the north street, Broadway's
  road north of the crossing, its slabs, the walls, the foliage, the far context and the frame's bottom-right corner
  are identical to the level. What moved is what the crossing lit: its asphalt south-east of the block, which bounced
  sunlight into the shaded south face and the shaded road, is two thirds in the tower's shadow now, and the tower
  takes about 23 degrees of eastern sky from the Broadway face. The 3rd Street face's hue-masked brick mean fell from
  (85, 53, 42) to (79, 50, 40), the Broadway face's from (190, 147, 128) to (189, 145, 126), the corner apron
  (183, 174, 164) to (182, 172, 161), the road in the block's shadow (23, 29, 37) to (19, 26, 34); the N lot's grey
  wall rose from (132, 113, 105) to (136, 115, 104) on the bounce off the tower's sunlit north face. The photo's faces
  are lit by the same geometry and read (101, 66, 51) and (196, 147, 115): the shaded face's gap, 22 levels of red, is
  the scene's shade budget (items 1 and 2 watched that face move with every bounce source), not the tower's.
- **The other cameras.** st_corner stands 1.1 m outside the tower's shadow (its south-east line crosses y -41 at
  x 39.9) and now looks across a crossing whose south-east quarter is in shade, the block sunlit beyond and nothing
  new in its frame (`tune/st_corner_after_half.png`): a street corner under a tall neighbour. The from-above view
  (`item7_from_above.png`: a camera 65 m over (28, -58) looking at the crossing, the stand's frame footprint, the
  stand and labels drawn on it by the new `scripts/overlay_frame.py`) shows the tower, its wing and the two parallel
  shadows.

Numbers, photo against render (`item7_numbers.md`): the band's edge on 21 columns, within 0.005 on x 0.18-0.36 and
0.0125 at worst; its ground line -144.1 / -140.4 (the photo's sun 35.9, the scene's 40); the band (49, 53, 64) /
(31, 36, 43), the block's shadow (35, 40, 50) / (19, 26, 34); the sunlit strip between the shadows 5.3 m / 7.8 m
across (our block's edge stands 2.5 m west of the photo's, item 8). Residuals: the far-left end of the edge 0.010-0.0125
low (the four degrees); the frame's bottom-left corner shaded asphalt where the photo has shaded concrete (the 13 m
street); the shaded face 6 levels darker than before the tower.

Evidence: `tests/artifacts/screens/bradbury_scene/item7_neighbour_shadow/` (`item7_reference_before_after.png`,
`item7_bottom_band.png` -- photo | before | after, the full frame and the bottom 30% --, `item7_from_above.png`,
`ref_3q_after.png`, `item7_numbers.md`; under `tune/` the photo's 2x, 3x and 8x bottom-left zooms, the top-down ground
maps of the crossing (photo | before and photo | after, dark cells flagged), the render's bottom-left against the
photo's, the st_corner half-size render, the from-above render bare); the scripts beside the review's: `band_edge.py`,
`ground_map.py`, `ground_intervals.py`, `fit_neighbour.py`, `overlay_frame.py`.

## The sidewalk: scored slabs, the fan and the grime line (AI 574 item 4, 2026-09-26)

The photo's pavement is poured concrete scored into large slabs: a transverse joint across each street's pavement
every couple of metres and a longitudinal joint along it, on the corner apron a fan of joints radiating from the curb
return with an arc joint across them, the slabs pale and warm in the sun with each a shade off its neighbours, a dark
line along the wall base where dirt collects against the plinths, dirt in the joints and against the kerb's top
course. After item 7 the scene's pavement was one clean tiling of the concrete_pavement set -- 0.65 m pavers with
mortar lines, a 14 m mottle over them -- reading (192, 183, 173) on the sunlit apron where the photo reads
(215, 192, 169), the shortfall item 1 had left to the albedo. Everything here was measured before it was laid, and
two of the measurements changed what was built.

- **The photo, laid onto the ground.** The new `scripts/pavement_map.py` lays the photo back onto the slabs' plane
  through the reference stand as 3 cm top-down maps of the two strips and the apron, stretches their local contrast
  so a joint is a dark line whatever the shadow does, and unwraps the apron in polar coordinates about the curb
  return's centre; the new `scripts/pavement_profiles.py` reads the joints off luminance profiles as dips under a
  running mean, along each strip and, across Broadway's, in 3 m windows, because the photo's Broadway side runs
  about 2 degrees skew to the scene's axes and a profile over the whole run smears every across-strip feature by
  metres. The transverse pitch is 2.0 m: on Broadway every consecutive pair of dips stands 1.95-2.0 m apart and the
  gaps are multiples of it; on 3rd Street, in the block's shade, the strong dips stand about 4 m apart with fainter
  ones between, the same scoring with every other joint reading darker. The longitudinal joint runs just inside the
  vault cover C3, about 1.1 m from the kerb top's inner edge. The fan, read at 8x, has five slabs to the quadrant,
  about 1.5 m apart at the kerb, and its arc joint continues the longitudinal joint round the corner; its centre is
  the photo's own return centre, which is not ours (the photo's Broadway pavement is about 6 m wide against our
  4.2, its kerb 1.7-3.3 m east of ours, items 7 and 8), so the count and the offsets transfer and the positions do
  not. The wall-base line is about 20 levels in the first decimetre of open slab, 10-15 at 0.2-0.3 m, gone by
  0.4-0.5 m. The kerb's top course reads 0.62-0.78 of the slabs. The numbers are in `item4_numbers.md`.
- **`pavement_material`, from world metres.** One material serves the block's pavement and the eight far strips.
  `kerbed_pavement` now writes each pavement object's kerb rectangle as the properties `pad_lo` and `pad_hi`
  (x0, y0 / x1, y1), which an Object Attribute node reads, so every point knows its distances to the four kerb lines:
  the nearest pair says which strip it is on, and a point within `KERB_R` of two kerb lines lies in a curb return's
  corner square. Straight strips: transverse joints along the strip at `PAVE_PITCH` 2.0 fitted to the run between
  the two returns (the block's south side, 51.4 m, takes 26 slabs of 1.98; its east side 17), so the first and last
  joints are the returns' tangent lines, which are also the fans' first and last radials; the longitudinal joint
  `PAVE_LONG` 1.1 m in from the slabs' edge. The corner: `PAVE_FAN_N` 5 radials to the quarter turn about the
  return's centre and the arc joint at `PAVE_ARC_R` 3.55 m (the slabs' edge at 4.65, less `PAVE_LONG`). A joint is a
  groove `PAVE_JOINT_W` 12 mm wide darkened `PAVE_JOINT_DARK` 0.55, its lips chamfered in the normal
  (`PAVE_JOINT_BEVEL` 6 mm by 3 mm, a Bump under the set's normal map) so the sun catches them, with dirt fading out
  beside it over `PAVE_JOINT_DIRT_M` 5 cm from `PAVE_JOINT_DIRT` 0.35 (the roughness up `PAVE_JOINT_ROUGH` 0.2 with
  it); the transverse and radial joints each at their own strength, `PAVE_JOINT_VARY` 0.45-1 from a white noise of
  the joint's index, which is what makes strong and faint joints alternate loosely as the photo's do; the kerb top's
  step gets the same dark line and `PAVE_KERB_JOINT_M` 5 cm of dirt on the slab side, from the pad's own geometry
  (the step is 8 mm: no occlusion reads it). Each slab's tone comes from a white noise of its index (along, across,
  which strip or corner, which piece), `PAVE_SLAB_VARY` +-4%. Nothing is cut: the covers of item 8 keep sitting on
  the slabs. No mottle.
- **The set, changed.** With the joints laid over the paver set its own pavers showed between them as a second,
  finer grid (`tune/dbg_apron_albedo.png`: the new `scripts/debug_pave.py` renders the material's Base Color as
  emission, the pattern without the light). The slabs are the game's rough_concrete set, the one plain poured
  surface among its concretes (`tune/concrete_sets_sheet.png`: concrete and concrete_layers_02 are board-formed
  walls, limestone_smooth and the plasters featureless, burnt_cement_panel near black), `PAVE_SET`; its colour
  variation is halved toward its mean (`PAVE_GRAIN` 0.45, `PAVE_SET_MEAN`) and its normal map runs at `PAVE_NORMAL`
  0.35, because as it comes the set read as a pebbled stucco from a 6 m stand. The kerb keeps the paver set.
- **The tint, by the film's curve.** The photo's sunlit apron (215, 192, 169) against the paver set's (192, 183, 173)
  is, through `scripts/agx_curve.py`'s table (192 is 0.67 linear, 215 is 1.24), a lift of (1.85, 1.21, 0.92),
  tempered in red to (1.7, 1.25, 0.97) so the slabs in the block's shade, lit by the sky alone, stay a neutral grey
  rather than turning brown: an albedo of (0.364, 0.22, 0.13), which over rough_concrete's mean is a `PAVE_TINT` of
  (0.76, 0.48, 0.39); rendered, the set's packed AO and rough face gave (205, 181, 165), so (1.29, 1.26, 1.06) more
  by the same curve: (0.96, 0.60, 0.41). The apron now renders (215-218, 190-195, 170-175) at four pure-slab points
  against the photo's (212-219, 189-196, 166-174); Broadway's slabs (215-219, 193-197, 174-178); the slabs in the
  block's shade (37-41, 31-35, 29-32), neutral, against the photo's (63-75, 66-75, 72-81) -- the scene's shade
  budget, as items 1 and 7 found on the road. Exposure stays 0. The point (0.44, 0.92) that the earlier items called
  the apron hits the kerb's rolled edge, so its (186, 174, 162) is a kerb-and-slab mix.
- **The grime line.** An Ambient Occlusion node reads the block's walls and plinths within `PAVE_GRIME_M` 0.7 m and
  its occlusion is mapped `PAVE_GRIME_OCC` 0.04-0.24 to a factor that takes the slabs `PAVE_GRIME` 0.6 of the way to
  their colour times `PAVE_GRIME_TINT` (0.50, 0.40, 0.31), a warm dirt, the roughness up `PAVE_GRIME_ROUGH` 0.15,
  loosened along the wall by a 0.9 m noise as the road's kerb dirt is. The mapping was measured, not guessed: the
  occlusion rendered as itself (`tune/dbg_occlusion.png`) reads 0.27 at a pier's foot and 0.19 at a shopfront's --
  Cycles' AO rays pass through the shopfront glass, which casts no opaque shadow, to the recess floor behind it --
  so the first mapping to 0.45 left a line of 3 levels. Now the slabs along Broadway read (198, 169, 151) at 3 cm
  from the wall, (199, 173, 154) at 0.25 m, (211, 184, 164) at 0.35 and (217, 193, 172) from 0.5 m out: 19-20 levels
  over the first quarter metre, gone by half a metre, against the photo's 27-44 in its first decimetre (with the
  plinths' shade), 16-24 in the second, 9-15 in the third; the kerb top's joint reads 15 levels dark within 5 cm of
  the kerb. The far strips get the same line at the lots' walls and under the hedge.
- **Rendered and read back.** The same profiles run on the render find dips every 1.98 m at 3-8% along Broadway and
  4-11% along 3rd Street (the photo's 3-10% at 1.95-2.0 m), the fan-centre search peaks at the scene's return
  centre, the radial dips 17 degrees apart (18 laid), the arc at r 3.75 (3.55 laid). Consistency: the sky, both
  horizons, every road point, the cornice, the walls, the foliage and the far context are identical to the level;
  the faces rose 3-4 levels of red and the N lot's grey wall 8 on the bounce off the warmer, brighter pavement.
  Every other point that moved is pavement.

Passes: the paver set with the joints over it (a second grid); rough_concrete at (0.76, 0.48, 0.39) (9-12 levels
short, stucco from 6 m, the grime 6 levels); the tint raised, the grain and normal calmed, the joints 12 mm with 5 cm
of dirt (the apron on the photo's, the grime 3 levels); the occlusion measured and the mapping set (shipped).

Evidence: `tests/artifacts/screens/bradbury_scene/item4_sidewalk/` (`item4_reference_before_after.png`,
`item4_pavement.png` -- the crop 0.20-0.75 / 0.72-0.98 --, `item4_corner_zoom.png` -- the apron at 0.28-0.52 /
0.84-0.99 --, photo | before | after; `item4_apron_closeup.png` from a stand 6 m up at (26, -27.5) looking at the
apron and `item4_wall_base.png` from a standing eye by the kerb along Broadway, before | after, the befores rendered
from the step-6 scene kept as `bradbury_scene_pre_item4.blend`; `ref_3q_after.png`; `item4_numbers.md`; under `tune/`
the photo's 8x zooms of the apron and of Broadway's cover C3, the ground maps, views, polar unwraps and profile graphs
under `tune/maps/`, the sets' sheet, the albedo, grime-factor and occlusion renders, the passes); the scripts beside
the review's: `pavement_map.py`, `pavement_profiles.py`, `wall_base_tone.py`, `debug_pave.py`.

## The flyover, and the boxes dressed (AI 574 items 30 and 31, 2026-09-26)

The user asked for a flyover of the scene for a phone (2026-09-26): portrait full HD, a sequence of slow moves --
the whole building from the air, a detail or two, the facade from its foot looking up at the sky, the portal close
enough that the door inside the arch shows, the whole block again to close -- with the background blurred a bit as
the photo's is, exported as a video, and with nothing that was placed for the reference stand alone showing up ugly.
Two things stood in the way. The neighbour tower and its wing (item 7) and the mid-distance boxes (item 29) were
plain slabs that only the stand never saw, and a moving camera would; and the scene had only ever rendered stills.

- **Item 31: the boxes dressed, in the shader.** `facade_material(base, storey_h, bay_w, window_w, window_h, sill_h,
  glass, ground=None, blind_share=FAC_BLIND_SHARE, name=None)` in the far context section copies a hazed set material
  and cuts window bays into it: the box's Object coordinates (the world's own metres, since every box is built in
  place) and its true normal give each point its coordinate along the face -- an x-face lays its bays along y, a
  y-face along x -- about the face's centre, and its height over the ground line, both read from the `fac_lo` /
  `fac_hi` properties `building()` now writes on the object (the pavement's `pad_lo` / `pad_hi` pattern, Object
  Attribute nodes); the bays stand at k x `bay_w` symmetric about the centre so no window is cut at a corner
  (`FAC_PIER_MIN` 0.5 m keeps the last one clear), the storeys at s x `storey_h` from the ground line, and nothing is
  laid on a roof, a parapet or under the ground (the roof plane is `fac_hi.z`). An opening is dark bluish glass
  (`FAC_GLASS` (0.020, 0.032, 0.050) at `FAC_GLASS_ROUGH` 0.12: the sky's 4% reflection is what makes it read as
  glass, its own Principled BSDF handed in by a Mix Shader before the haze group) inside a masonry reveal
  `FAC_REVEAL_W` 0.15 m wide in the wall's own set whose sides tilt in the normal through a Bump of `FAC_REVEAL_D`
  0.12 under the set's normal map (atan(D / W), 39 degrees: the shaded reveal every real opening shows); a sill and a
  lintel band `FAC_TRIM_H` 0.12 m, `FAC_TRIM_OVER` 0.08 past the opening, proud by `FAC_TRIM_PROUD` 0.35 of the
  reveal's depth in the same Bump, in a lighter stone (`FAC_TRIM_TINT` (1.12, 1.10, 1.06) multiplied under the base
  colour); and a share of the windows has a blind down (`FAC_BLIND` (0.16, 0.15, 0.135), `FAC_BLIND_ROUGH` 0.6, each
  drawn by a white noise of the window's own bay, storey and face), so no storey repeats the next. The wall between
  the windows is the set as it was; the geometry is untouched, so every shadow falls where it did. `FACADES` holds
  the recipes (storey_h, bay_w, window_w, window_h, sill_h, ground, blind share): `low` (3.0, 2.7, 1.3 x 1.5, 0.9,
  no ground storey, 0.12) for the brick, white and cream boxes, named in a ninth `FAR_BOXES` field, and `warehouse`
  (5.2, 4.0, 1.2 x 0.9 clerestory lights on a 3.2 m sill, no blinds) for the second warehouse; `NEIGHBOUR_FACADE`
  (3.6 m bays, 1.6 x 1.7 windows on 0.9 sills, the ground storey a lobby's 2.6 x 2.4 glazing on 0.3) at
  `NEIGHBOUR_STOREY_H` dresses the tower, `NEIGHBOUR_WING_FACADE` (3.3, 3.6, 1.6 x 1.5, 0.9, a 3.6 m shop storey of
  2.8 m openings on 0.3) the wing; `ground` starts the upper storeys above the ground storey's own height. Two
  passes: at 3.0 m bays an 8 m face held one column (the corner clearance), and the pale blind (0.30, 0.28, 0.25)
  rendered 208 on the film against the plaster's 216 (a boarded opening); 2.7 m bays hold three windows on every far
  face, the darker blind reads as a lit interior. Verified from a standing eye on the Broadway crossing
  (`item31_tower_standing.png`: seven and three bays a storey, twelve storeys, the lobby glazing, a plain parapet
  band), from 60 m up (`item31_tower_60m.png`) and from the W lot (`item31_far_boxes_standing.png`); in the
  reference view every one of item 4's consistency points is identical to the level and only the boxes' own pixels
  moved (1383 of 2.46 million over 6 levels: the white's, brick's and cream's window rows at x < 0.08, y 0.363-0.426,
  the warehouse's clerestory row at x > 0.90; `item31_numbers.md`).
- **Item 30: `render_flyover.py`.** In `render_wear.py`'s manner: it opens `bradbury_scene.blend`, adds a camera, a
  compositing node group and the output settings in memory, renders, and never saves the scene. Portrait 1080 x
  1920 at 24 fps, six shots of 3 s (`SHOTS`: name, lens, a pose function of the eased time -- smoothstep, so every
  move starts and ends at rest -- returning eye and aim in world metres; the lens is full-frame equivalent on the
  frame's long side, as a phone's is: Blender's AUTO sensor fit puts the 36 mm across the height here, so 24 mm sees
  73.7 degrees tall and 45.9 wide), cut hard. `check=1` projects the block's, the tower's and the door's boxes into
  each shot's first, middle and last frame (`world_to_camera_view`) and prints where they land, which is how the
  shots were placed (`flyover_numbers.md` has the table):

  | shot | lens | the move | what it shows |
  |---|---|---|---|
  | `air` | 24 | from (36, -103, 60) aimed at (-17, -2, 8) down to the reference stand's own eye and aim | the whole block from the air, the sunlit Broadway face opening as the camera swings from the south-south-east to the stand; the block x 0.24-0.89 of the frame at the start, 0.002-1.002 at the end; the tower right of the frame's edge throughout (x 1.09 at worst) |
  | `cornice` | 50 | a lateral dolly at z 19.6, 14 m off the Broadway face, from y -8 to -2, aimed 1.6 m down | the crown mouldings, the top band and the archivolt arches over the arched windows, the sky above |
  | `escapes` | 40 | on 3rd Street's roadway 14 m south of the face at x 3.9, rising from z 4 to 9, the aim from 6 to 10.5 | the eastern fire escape and its window bays, in the block's shade as the photo has them (the escape's iron 14 on the film against the brick's 48) |
  | `up` | 24 | a standing eye on Broadway's pavement 3.8 m from the wall at y -6, tilting from 58 to 68 degrees up while rising 0.5 m | the facade running up the frame from the shopfront band to the cornice and the sky |
  | `portal` | 35 | a push-in from (29.2, 4.4, 2.2) to (25.2, 3.0, 1.9), aimed at the door 2 m inside the arch, 3.5 to 2.1 m north of the portal's axis | the Broadway portal with the door showing past the arch: all four leaves, the transom, the recess lamp and the lit vestibule floor (the door x 0.25-0.74, y 0.46-0.70 of the last frame) |
  | `close` | 24 | a pull-up from the reference stand's framing: the eye swings from azimuth -30 to -42 about the chamfer's midpoint, 44.5 to 50 m out, 14.6 to 30 m up, the aim from the stand's to (-4.5, -1.5, 8) | the reference view rising into a view of the block and its shadow over the crossing, the far context soft behind |

  The background softened, as the photo's is, not by depth of field (a 40 mm lens at f/2 blurs nothing at these
  distances) but by a depth mask driving a Bokeh Blur in the compositor (`Scene.compositing_node_group` in Blender
  5.2, a node group with a Group Output): the Depth pass mapped from `BLUR_START_M` 2 m past the block's farthest
  corner from the camera -- set per frame, so the block is at 0 in every shot -- to `BLUR_FULL_M` 400 m further out,
  softened by `MASK_SOFT_PX` 2 (the pass is one sample a pixel, its silhouette aliased), times `BLUR_PX` 7 into the
  blur's per-pixel size (a rounded hexagon, `BOKEH_FLAPS` 6, `BOKEH_ROUND` 0.6): 0 on the block, at most 7 px at the
  horizon at 1080 wide, so the trailers, the tree lines and the lots go a little soft while the block stays sharp.
  The first design used the Mist pass and was rejected by rendering the pass itself (`debug=mist`, now `debug=mask`):
  a window pane passes a share of the camera's samples through to whatever lies behind, and the mist pass writes
  every hit weighted by its throughput, so it speckled on every pane (up to 0.45 with the mist starting past the
  block) and the panes would have shimmered under the blur from frame to frame; the Depth pass is written once, at
  the first hit whose alpha passes the film's threshold, and reads 0 on every probed point of the block, panes
  included (`tune/mask_sheet.png`). The film stays the scene's (AgX, its look, exposure 0).
  Render management: frames go to `flyover/frames/<shot>/<shot>_NNNN.png` and a frame already there is skipped, so a
  crash loses nothing; persistent data keeps the scene on the device between frames; OptiX alone (repeatable, as
  `render_wear.py` notes), the OptiX denoiser, adaptive sampling as the scene has it. Measured first: 7.2 s a frame
  at 48 samples, 9.3 at 64, so 64 samples fit the hour (432 frames); the quarter-size checks render in a second a
  frame. `encode=1` (the default of a full run) assembles the shots' frames in order into
  `flyover/bradbury_flyover_portrait_1080x1920.mp4` through a sequencer-only scene: image strips, MPEG-4 container,
  H.264 at the HIGH constant-rate quality, no audio (`image_settings.media_type = 'VIDEO'` first, or FFMPEG is not
  offered); the strips are display-referred PNGs, so that scene's view transform is Standard and nothing is graded
  twice (a four-frame round trip decoded back through a movie strip reads the source PNG within 1.65 levels on
  average with no shift in the means).
- **The composing-only artifacts, checked in every shot's first, middle and last frame** at a quarter size
  (`tune/pass1_*_sheet.png`, `pass2_*`): the neighbour tower and wing (dressed now, and out of every wide frame by
  the check: the approach was moved from (30, -125, 75) to (36, -103, 60), because from further back the tower's
  base corner sat inside the right edge at x 0.93-0.98 and the block was small, and it ends on the reference stand
  itself, the one pose on that axis where the whole block fits a 24 mm portrait frame and the tower clears it -- 30 m
  over the stand the tilt brought the tower's base in at x 0.90, further back the block overflowed -- so the close is
  the brief's other option, a pull-up, capped at 30 m so the block's flat roof does not fill the frame, swinging south
  as it rises so the tower keeps clear); the far boxes (dressed; soft in the wide frames); the trailers (soft, the
  top of the wide frames); the library shelf collection (`CONTEXT_LIBRARY`, `hide_render` already, and the view
  layer excludes it in the script; no prototype stands at the origin in any frame, the block's roof is clean); the
  shadow catcher (under the roadway, never seen); the tufts and the fence lattice (no low frame sees the lots'
  walls); the far edges of the lots and roads (soft, hazed, no seam); the hedge trees (the crowns behind the N lot's
  wall in the wide frames). The portal was rendered from three stands off its axis (`tune/door_angles_sheet.png`,
  `door_angle.py`): from the south the near pilaster hid the door's south leaf, from the north all four leaves show
  with the lit vestibule floor at their foot, so the push-in runs on the north side; the leaves read at luminance
  p50 25 against the sunlit pilasters' 173 -- dark wood in a recess, as they are, and readable (exposure untouched).
- **Cost.** 432 frames at 1080 x 1920 and 64 samples in 90.8 min of rendering (`render_full.log`): 8.0 s a frame on
  the approach and 8.6 on the pull-up, 13.5 on the cornice, 13.7 on the bottom-up, 15.4 on the fire escapes and 16.5
  on the portal -- the close shots fill the frame with the block's own shading, the wear layer, the glass and the
  ornament, where the reference stand's 9.3 s a frame had promised 67 min -- 12.6 s a frame over all, at the top of
  the hour-and-a-half budget and left at 64 samples; the encode 16 s. The MP4: 14.97 MB, 432 frames, 18.0 s at
  24 fps, 1080 x 1920, H.264 HIGH, no audio; frames 1, 200 and 432 decoded back from it match their PNGs within
  1.6-1.8 levels on average with no shift in the means. The frames on disk take 1.2 GB (gitignored).

Evidence: `tests/artifacts/screens/bradbury_scene/item31_dressed_boxes/` (`item31_reference_before_after.png`,
`item31_left.png`, `item31_right.png` -- photo | before | after at the far boxes --, `item31_tower_standing.png`,
`item31_tower_60m.png`, `item31_far_boxes_standing.png`, `ref_3q_after.png`, `item31_numbers.md`, `tune/`);
`tests/artifacts/screens/bradbury_scene/flyover/` (`bradbury_flyover_portrait_1080x1920.mp4`,
`flyover_shots_sheet.png` -- one full frame per shot --, `frames/<shot>/`, `flyover_numbers.md`, `render_full.log`,
`tune/` with the quarter-size sheets of every pass, the mist and depth masks, the door stands); the scripts beside
the review's: `flyover_sheet.py`, `door_angle.py`. Render it again with
`blender -b -P src/graphics/content3d/buildings/authoring/BradburyBlock/render_flyover.py -- samples=64`
(`check=1` prints the framing, `frames=first,mid,last pct=25` the quarter checks, `frames=none encode=1` the MP4
from frames already on disk).
