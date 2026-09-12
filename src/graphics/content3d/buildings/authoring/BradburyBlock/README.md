> Location (2026-09-11): this folder, `src/graphics/content3d/buildings/authoring/BradburyBlock/`,
> holds the SCRIPTS that author the portal for the game config `configs/BradburyBlock.js` (any building's
> authoring goes in `authoring/<ConfigName>/`, matching `configs/<ConfigName>.js`). Everything generated is
> git-ignored under `tests/artifacts/`: the .blend files (`bradbury_portal.blend`, `ornaments/*.blend`) in
> `tests/artifacts/blender/bradbury/portal_project/`, renders and overlays in `tests/artifacts/screens/bradbury_fix/portal_project/`.
> Regenerate everything with `blender -b -P rebuild_portal.py -- 01 02 03 04 05 06 07 08` after
> `blender -b -P ornaments/capital.py` and `blender -b -P ornaments/arch_leaf.py`; or open the generated blend and rerun single pieces.
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
