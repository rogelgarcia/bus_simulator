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

| 08 | BRADBURY frieze band: plain stone band over the arch block and the pilaster capitals (x +/-2.405, y -2.90 .. -2.05, z 4.08 .. 4.50), flush with the pilasters and ending at their outer edges; the letters "BRADBURY." (Arial Black, a bold wide sans with no serifs like the reference; 0.28 m capitals, row 2.30 m wide) extruded 1.2 cm out of the band, with a 5 mm half-round rim along each letter's outline raised from the letter face (set just inside the edge); above each pilaster a foliage panel of leaves on curved branchlets in layered relief (leaves 2 cm, branches 2.6 cm, rosette to 3.8 cm): a small rosette, a wavy main branch to each side with three curling branchlets, edged leaves along the branches and at the branchlet ends; no dentil course or cornice yet | `pieces/08_frieze.py` | `FRIEZE` | built 2026-09-10 |

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
