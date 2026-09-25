# Pigeon marks on perching ledges (AI 572): the droppings of the few feral pigeons that roost on the block. Pigeons use
# an ornate old facade's horizontal surfaces -- cornice tops, window sills, the tops of string courses and capitals --
# the more so where the surface is high above the street, deep enough to stand on, sheltered from above, or tucked into
# an inner corner against a return (the buildingconservation.com "Bird damage" article; the Commons photos of the
# Broadway portal show a pigeon on its crown moulding, and spikes along it and the floor 2 ledge). Their droppings are
# whitish: drops heaped where the bird sits and spattered round it, and short drips that run over the edge onto the face
# below; uric acid etches the stone under a heavy deposit over time. This is a feature of the wear layer (AI 563): no
# noise, and no mark without a physical place.
#
# ONE ROOST AT A TIME (the rework of 2026-09-23). The first build marked every perch it found by one rule -- a pile and
# its drips at the same corner of every window, a veil along every used edge, a line along the whole crown: 1249 roosts
# and 360 drips -- and the user saw it at once: "the pigeon marker looks like a pattern, it was placed at the same
# position in all windows. there could be 2 or 3 in the entire building, and they should be put at different positions
# and different shape". A kept building has a few birds that keep to a few spots, for reasons the model does not carry:
# where a bird happened to settle, where the spikes are not, a sill nobody reaches to clean. So the perches the scan
# finds are only CANDIDATES now, every inner corner a bird can tuck into, each with its plausibility from the geometry;
# the build chooses two or three of them, and each chosen roost composes a deposit of its own. Everything is drawn from
# seeds made of stable ids (draw: the sha256 of "pigeon:" and a key), so every rebuild reproduces it exactly.
#
# THE LEDGES are found on the model, not listed. At every height where masonry has a flat top at least H_MIN over the
# pavement, a level ray from the street just above the height and one just below it, every 2 cm along each face: where
# the surface below stands in front of the one above, a ray straight down between them confirms a flat top there. Its
# standing depth runs from what stands on it (a wall, a pier, a window frame) to its outer edge; a top with nothing on
# it (the crown's) runs back to its own inner edge. Tops a few millimetres apart whose depths touch are one surface (a
# sill's cap and the window reveal's floor behind it). On this block that finds the crown's top, the band's top between
# floors 4 and 5 (the top floor's piers and its windows' deep reveals stand on it), the impost course, the capitals'
# abaci under the band, the window sills of floors 3 and 4 with their reveals, floor 2's windows standing on the ground
# floor crown's foot, and the ground floor cornice with the portals' crown mouldings and the openings row beside them.
#
# THE SITES. Along a ledge a site is a stretch with one wall behind it; it ends where that wall steps. Stepping forward,
# it is a RETURN: an inner corner a bird tucks into (a window reveal's jamb, a pier's side, a pier block standing on the
# cornice, an opening's side). What a site offers, per column: its standing depth (none under DEPTH[0], full from
# DEPTH[1]), its height, and its protection: 565's shelter from the overhangs over the space a bird occupies above it,
# and 565's `open` there, which counts a reveal's or a recess's sides as well. An exposed run keeps EXPOSED of a
# sheltered one's use.
#
# THE CHOICE. A candidate is a return a bird tucks into, its plausibility p the site's use at that end times how deep
# the return tucks it in. Each draws a key u ** (1 / p) from its own seed (a draw in which a corner's chance follows its
# p, and its key never moves when another corner comes or goes). The building holds three roosts or two (COUNT_P3). The
# first is the best key round the Broadway portal, where the Commons photo shows a pigeon on the portal's crown moulding
# and where the street views look: on that front, within FRONT_REACH of the portal's axis, under the band (FRONT_H), so
# the pavement sees its drips. Each next is the best key among the corners that differ from every roost chosen in the
# ledge they stand on (their family: sill, band top, cornice, ...), in face and by a storey in height (STOREY).
#
# A ROOST'S DEPOSIT is composed drop by drop (compose), on the stretch of ledge round its corner (its own footprint,
# the back's and the edge's depth per 2 cm column from the scan). The bird has two places: tucked into the corner,
# where its droppings pile, and at the edge in front, where it stands to watch the street; each roost draws where both
# lie, how its droppings split between them and how widely they spread, and how many it leaves (more on a better
# perch). A dropping has its own age, size (a log-normal about SIZE), elongation, turn and a lobe or two off its outline;
# a fresh one is thick and white and may still show the dark core of its faeces, an old one is a thin grey-beige film;
# some throw a satellite or two; a share are smears, trodden or rain-dragged along the ledge; a few strays lie further
# along, where the bird walked. Where droppings overlap the deposit builds up (1 - exp(-SAT x their sum)) and whitens;
# round the whole a grey-brown film soaks into the surface (HALO), etched paler round the heaviest. The walls cut a
# dropping that lands against them, the edge one that overhangs it: the ledge's own geometry. Nothing inside a mark is
# noise: its irregularity is its droppings'.
#
# ITS DRIPS (the critique of 2026-09-24: "each shows a pair of straight, parallel, even-width pale lines about 9 cm
# apart ... ending at the same height"; from the pavement the drips are all the street sees of a roost). The building's
# roosts take their drip counts from 1, 2 and 3 shuffled, so each count is as likely for any roost and no two roosts
# carry the same; a roost's drips string along the edge round its perch as widely as its bird wanders (from drips that
# merge to drips more than 20 cm apart), and their runs are drawn one per share of the range, so no two run alike. A
# drip is composed on the surface it runs down, followed along its axis millimetre by millimetre (trace_drip): the head
# the dropping left on the lip, wider than the run, lobed and spattered; the paste's run, flaring out of the head,
# thinning, necked, swelling in slugs where it paused, bending, slipping sideways where it hangs on an arris, thinned over
# a convex one and gathered in a concave one; and its end, a bulb where the paste stopped on its own, a pendant where it
# hung off an underside it could not hold to (its cling) or off an edge, or a thin broken tail of the liquid that ran on,
# over the moulding's step onto the next member. Thick parts are an off-white crust, thin ones a translucent chalky film.
#
# THE MASK holds three things, all in BLOCKS low on the atlas (under Z_DRIP): a ledge's top is one row of the atlas --
# every point of it stands at one height -- and a drip's outline needs millimetres, not the atlas's 2 cm. Each roost's
# deposit lies in its top's block, its stretch of ledge unrolled in (s, depth) at TAU a texel (2 mm; coarser only where
# a stretch does not fit): R the droppings' outline as a signed distance (crisp and smooth under the lookup's filter at
# any texel), G their deposit, B their dark cores' outline, A their age. Its drips lie in its CURTAIN block, the face
# under its edge unrolled in (s, z) at TAU_C: R the drips' outline, G their deposit (the tails and the film round them
# too), B the depth of the surface they ran on (the shader keeps them to it), A their age. The shader holds each block
# as constants (its face, height, extent and scale, from g.result): a top at that height inside that extent reads its
# deposit there, a face under an edge inside its curtain's extent its drips. The facade's own rows (above Z_DRIP) hold
# each drip's deposit at 2 cm in R, for the layer's elevation images and the published field only.
#
# PUBLISHED (no feature NEEDS pigeon): `sites`, `candidates`, `roosts`, `drips`, `field` and `profile` (see the README's
# "Pigeon marks on perching ledges (AI 572)").
import hashlib, math, re
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS, Z_GROUND, facade_of
from . import soiling

NAME = "pigeon"
AI = 572
LABEL = "pigeon marks on perching ledges"
ORDER = 260                      # a deposit laid over the others (soiling 200 .. rust 250), before the glass (300)
NEEDS = ("soiling",)             # the shelter and the rain's reach over each perch
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (1.00, 0.10, 0.10)
MASK = dict(res=0.02, channels=4, bits=8)   # the blocks (under Z_DRIP): a top's R the droppings' outline, G their
RES = MASK["res"]                           # deposit, B their cores' outline, A their age; a curtain's R the drips'
                                            # outline, G their deposit, B the surface's depth, A their age. The facade
                                            # rows: R a drip's deposit at 2 cm, for the elevations only

# ---------------------------------------------------------------------------------------------------- the ledges
H_MIN = 4.40            # a perch stands at least this high over the pavement (the portal's keystone and capitals, 4.2 m,
                        # do not; the ledges at 5.2 m do: a pigeon on the portal's crown moulding in the Commons photo)
LEVEL_BIN = 0.005       # the heights scanned: the flat masonry tops, binned this fine, ...
LEVEL_AREA = 0.02       # ... with at least this much area on the face, ...
LEVEL_JOIN = 0.012      # ... and bins this close cast as one height
EPS = 0.006             # the level rays just above and just below a height (and its bins' spread)
STEP_MIN = 0.065        # a ledge: the surface below a height stands at least this far in front of the one above it
                        # (just under DEPTH[0]: a narrower shelf, the crown's dentil shelf or the band's moulding, is none)
DOWN_TOL = 0.004        # and a ray straight down between them finds a flat top within this of the height
COARSE = 3              # each height is cast every this many columns first, and at every column only near what that finds
MERGE_DZ = 0.015        # tops this close in height whose depths touch are one standing surface (a sill's cap and the
MERGE_DD = 0.015        # window reveal's floor 5 mm above it; the crown's foot and floor 2's reveal floor)
OPEN_MAX = 1.60         # a top with nothing standing on it (the crown's) is sought this far back for its inner edge ...
OPEN_STEPS = 8          # ... by halving (to 6 mm)
D_FROM, REACH_RAY = 4.0, 12.0                 # the level rays: from this far out, this far
SEE_THROUGH = ("attachment_fire_escape",)     # the fire escapes are looked through, as runoff's elevation does

# ---------------------------------------------------------------------------------------------------- the sites
DEPTH = (0.065, 0.15)   # standing room: none under the first (a pigeon's foot and a margin), full from the second ...
ROOM = (0.25, 0.60)     # ... and a ledge deep enough for birds to sit behind one another (the crown's top, the band's in
ROOM_GAIN = 0.60        # front of the top floor's reveals) holds this much more use over the second
HEIGHT = (5.0, 15.0)    # the height's share rises from HEIGHT_FLOOR at the first height over the pavement to all of it at
HEIGHT_FLOOR = 0.35     # the second: pigeons keep to the high ledges, safe from the street, and the low ones are within a
                        # ladder's reach and kept clean (the real ground floor cornice and floor 2's ledge carry spikes)
RETURN_MIN = 0.03       # a site ends where the wall behind it steps by this much; forward, the step is a return
TUCK = (0.03, 0.15)     # a return begins to shelter a bird tucked against it at the first depth, fully from the second
SITE_MIN = 0.099        # a site narrower than a bird's width (10 cm) is a sliver: a mitre, a pocket beside a capital
BODY_Z = (0.05, 0.15, 0.25)   # a bird's body over the ledge: where its protection is read
ENCLOSE = 0.60          # 565's 1 - open (a reveal's or a recess's sides, the overhang too) counts at this share ...
PROTECT_FULL = 0.60     # ... and a protection this high counts in full
EXPOSED = 0.35          # an exposed run keeps this share of a sheltered one's use
USE_MIN = 0.02          # a site whose best use is under this is no perch (too narrow, too low)

# ---------------------------------------------------------------------------------------------------- the choice
P_MIN = 0.10            # a corner a bird would use less than this (use at the corner x how deep it tucks) is no roost
COUNT_P3 = 0.50         # the building holds three roosts with this chance, two otherwise
FRONT = "E"             # the first roost is round the Broadway portal (the Commons photo's pigeon on its crown moulding;
FRONT_REACH = 8.0       # the front the street views look at): within this of the portal's axis ...
FRONT_H = 15.0          # ... under this height over the pavement (under the band), where the pavement sees its drips
STOREY = 2.5            # every other roost stands at least this far in height from each one chosen (and on another
                        # face, on another family of ledge)

# ---------------------------------------------------------------------------------------------------- a roost's deposit
X_BEHIND, X_OUT = 0.25, 0.75    # the stretch of ledge a roost's deposit may cover: this far past its return (in front of
                                # the return's own wall, where the ledge runs on) and this far into its site
ROOST_X = (0.05, 0.16)  # where the bird sits tucked in and its droppings pile: this far along from the return ...
ROOST_Y = (0.04, 0.11)  # ... and this far in front of the back wall (at most half the standing depth)
PERCH_DX = (-0.12, 0.28)    # where it stands to watch the street: this far along from the pile (it may stand in front of
PERCH_Y = (0.06, 0.15)      # the return's end, where the ledge runs on); facing out, its droppings fall this far behind
                            # the outer edge (at most half the standing depth), and facing in, over it (the drips)
PILE_SHARE = (0.40, 0.85)   # the share of its droppings in the pile; the rest round the perch
DROPS = (60, 160)       # its droppings on the top at a plausibility of 1 (times 0.5 + p: a better perch is used more)
PILE_SPREAD = ((0.022, 0.050), (0.016, 0.035))    # the pile's spread (sd) along the ledge and across it, ...
PERCH_SPREAD = ((0.030, 0.080), (0.014, 0.030))   # ... the perch's, strung along the ledge
SIZE = (0.0065, 0.60)   # a dropping's half-length: the median, and the log-spread (of the mean of two normals) ...
SIZE_LIM = (0.0025, 0.018)  # ... held within these
ASPECT = (1.1, 2.0)     # a splat's length over its width
AGE = (0.0, 1.0)        # a dropping's age, 0 fresh .. 1 weathered (uniform): a fresh one white and thick, an old one a thin
AMOUNT = (0.25, 1.00)   # grey-beige film; its deposit at its middle from the second (fresh) to the first (old), ...
AMOUNT_JIT = 0.15       # ... give or take this share of it
FRESH = 0.40            # younger than this, its dark core (the faeces) may still show
LOBES = 0.80            # the share of the splats with a lobe or two off their outline (a splat is never an ellipse), ...
LOBE_R = (0.35, 0.75)   # ... this big (of the splat), ...
LOBE_D = (0.45, 1.05)   # ... this far off its middle
SMEAR = (0.08, 0.30)    # the share of a roost's droppings that are smears, trodden or rain-dragged along the ledge, ...
SMEAR_L = (2.5, 6.0)    # ... this many half-lengths long, ...
SMEAR_W = (0.45, 0.80)  # ... this wide (of the half-length), ...
SMEAR_A = (0.25, 0.55)  # ... this thin, ...
SMEAR_ANG = 0.50        # ... within this of the ledge's direction (radians)
SPLASH = 0.35           # the share of the splats that throw a satellite or two, ...
SAT_R = (0.15, 0.40)    # ... this big (of the splat), ...
SAT_D = (1.15, 2.10)    # ... this far out
CORE = (0.15, 0.55)     # the share of the fresh splats whose dark core still shows, ...
CORE_R = (0.28, 0.55)   # ... this big (of the splat), ...
CORE_OFF = 0.35         # ... off its middle by up to this
STRAYS = (1, 5)         # a few strays along the stretch, where the bird walked: ...
STRAY_SIZE = (0.45, 0.85)   # ... smaller ...
STRAY_AGE = (0.40, 1.00)    # ... and older
SDF_SPAN = 0.008        # a dropping's outline is kept as the distance to it, over this much to either side
SAT = 1.25              # the deposit where droppings overlap (each a dome, 1 - q^2 across it): 1 - exp(-SAT x their sum)
HALO = 0.25             # the grey film round a deposit (its organic part weathered and soaked in): this much of the
HALO_E = (0.012, 0.025) # deposit, blurred this far (sd); round the heaviest the surface is etched there too (ETCH)
AGE_EPS = 0.02          # a dropping's rim takes the roost's mean age as its dome thins to nothing
TAU = 0.002             # a roost's deposit is kept at this texel in the ledge's own s and depth, coarser only where its
                        # stretch does not fit the atlas's free rows or its face's width
TRIES = 10              # a dropping drawn off the ledge is drawn again, this many times at most

# ---------------------------------------------------------------------------------------------------- its drips
DRIP_COUNTS = (1, 2, 3)     # the building's roosts take their drip counts from these, shuffled (the key "drip counts"):
                            # each count as likely for any roost, and no two roosts carry the same
DRIP_SPREAD = (0.015, 0.18) # how widely a roost's drips string along the edge round its perch (sd): from drips that merge
                            # to drips more than 20 cm apart
DRIP_L = (0.04, 0.30)       # a drip's run down the face, along the surface, paste and tail: a roost's n drips take one n-th
                            # of this each (stratified) in a drawn order, so no two of its drips run alike
DRIP_V = (0.40, 1.00)       # its heaviness: its head's deposit (a faint grey one to a heavy white one)
DRIP_AGE = (0.0, 0.85)      # its age, as a dropping's (0 fresh .. 1 weathered): its tone
DRIP_W = (0.0025, 0.0060)   # the paste's half-width where it leaves the head, ...
FLARE = (0.30, 0.90)        # ... and wider by this share still right under the head, over FLARE_E (e-fold), ...
FLARE_E = 0.012
DRIP_THIN = (0.40, 0.75)    # ... thinning to this share of it at the paste's end ...
DRIP_TAPER = (0.5, 1.3)     # ... as (t / its run) ** taper, ...
BODY_V = (0.75, 0.50)       # ... its deposit falling from the first share of the head's to the second
SLUGS = (0, 3)              # the paste went down in slugs: up to this many swellings where it paused, ...
SLUG_W = (1.25, 1.85)       # ... this much wider (and thicker), ...
SLUG_L = (0.006, 0.015)     # ... over this much (e-fold)
BENDS = (1, 3)              # its axis bends this many times as the paste finds its way down, ...
BEND_A = (0.0015, 0.0045)   # ... each time by this much sideways, either way, ...
BEND_L = (0.010, 0.030)     # ... over this much of its run
HEAD_W = (1.7, 3.0)         # its head, the dropping that went over the lip: this many of the paste's half-widths wide, ...
HEAD_H = (0.0035, 0.009)    # ... this tall (half), ...
HEAD_AT = (0.001, 0.004)    # ... its middle this far down from the lip, ...
HEAD_TILT = 0.30            # ... turned by up to this (radians), ...
LOBE_P = (1.0, 0.60, 0.25)  # ... with a lobe, a second with the second chance and a third with the third, ...
HEAD_LOBE = (0.30, 0.65)    # ... each this big (of the head), 0.5 to 1.0 of it off its middle, along the lip or down
LOBE_TURN = 0.85            # ... within this many half-turns of straight down (a lobe never rises past the lip)
SPATTER = (0, 2)            # ... and up to this many spatters round it, ...
SPATTER_R = (0.0015, 0.0025)    # ... this big (radius), 1.3 to 2.3 of the head off its middle
END_BULB = 0.50             # its end: a bulb where the paste stopped on its own (this share of the drips), or a thin tail
PASTE = (0.35, 0.75)        # a tailed drip's paste runs this share of its run; the rest is the liquid's thin tail
BULB_R = (1.25, 2.0)        # a bulb: this many of the paste's half-widths there wide (at least BULB_MIN), ...
BULB_LONG = (1.0, 1.45)     # ... this much longer down the face than across
BULB_MIN = 0.002
PENDANT = (1.5, 2.3)        # where the paste hangs off an underside or an edge: a pendant this many half-widths wide
CLING = (0.72, 0.98)        # the paste holds to an underside that faces down up to this (its normal's z), then hangs off it
HANG_MIN = 0.006            # ... where the underside runs on for this much (an arris's rounding at a crept step does not)
NECK_P = 0.75               # a neck in the paste's run (this share of the drips): ...
NECK_AT = (0.25, 0.70)      # ... this far down it, ...
NECK_D = (0.50, 0.85)       # ... this thin (of its half-width there), ...
NECK_L = (0.005, 0.015)     # ... over this much (e-fold)
ARRIS_DEG = 20.0            # the surface turns by more than this at an arris (or steps by more than ARRIS_STEP), ...
ARRIS_STEP = 0.004
ARRIS_SHIFT = (0.0004, 0.0025)  # ... where the paste slips sideways by this, either way, ...
ARRIS_NECK = (0.70, 0.92)   # ... thins over a convex one (stretched over it) to this, ...
ARRIS_POOL = (1.05, 1.25)   # ... and gathers in a concave one to this, ...
ARRIS_E = 0.004             # ... over this much below it (e-fold)
LEAN = 0.015                # the run leans sideways by up to this share of its length
TAIL_W = (0.0009, 0.0016)   # the tail: this half-width, ...
TAIL_V = (0.12, 0.30)       # ... this share of the head's deposit, ...
TAIL_DASH = (2, 4)          # ... broken into this many dashes, ...
TAIL_GAP = (0.15, 0.45)     # ... with gaps this share of a dash between them, ...
DROPLET = (0.0012, 0.0022)  # ... ending in a droplet this big (radius) where it ran out
LIP_D = (0.003, 0.008)      # the head on the top: its half-depth behind the edge, as wide as the head
DRIP_SEG = 0.0015           # the paste's run is kept as a chain of round segments this long
HALO_D = 0.30               # the film round a drip: this much of its deposit, ...
HALO_DE = (0.003, 0.005)    # ... blurred this far (sd)

# ---------------------------------------------------------------------------------------------------- the path
PROFILE_DZ = 0.001      # a drip's path is followed down its axis at this step, with level rays from the street, ...
PROFILE_H = 0.45        # ... this far under its lip at most
CATCH_P = 0.03          # a surface standing this far out from the one above catches the slurry on its top
CREEP_P = 0.045         # a step back up to this deep is crept round (a sill's cove, a bead); deeper, it drips off
FRONT_TOL = 0.03        # a drip starts on the ledge's own front: within this of its edge's depth
Z_DRIP = 4.50           # the blocks lie under this height, the drips' facade rows over it

# ---------------------------------------------------------------------------------------------------- the mask's codes
D_LO, D_SPAN = -0.70, 1.70      # depths d over -0.70 .. +1.00 (B in a curtain block)
TAU_C = 0.002           # a roost's drips are kept at this texel in the face's s and z, coarser only where they do not fit
CURTAIN_UP = 0.006      # a curtain block reaches this far over the lip (its arris), ...
CURTAIN_PAD = (0.025, 0.015)    # ... and this far past its drips along the face and below them
BLOCK_Z0 = 0.10         # the blocks lie in the atlas's rows from this height ...
BLOCK_S0 = 0.20         # ... from this far into their face's region, ...
BLOCK_PAD = 3           # ... each ringed with this many texels of nothing, for the lookup's filter

# ---------------------------------------------------------------------------------------------------- the look
FRESH_COL = (0.62, 0.61, 0.57) # a fresh dropping's urates: off-white (linear), ...
OLD_COL = (0.26, 0.245, 0.21)   # ... weathered to a grey-beige as it ages (AGE), white while younger than TONE[0], all
TONE = (0.15, 0.85)             # grey-beige from TONE[1] ...
BUILD = 0.35            # ... and whiter where they build up, by this much from WHITE's first deposit to its second
WHITE = (0.60, 0.95)
DUNG = (0.40, 0.385, 0.35)      # a drip: a chalky, warm grey (linear) where it is thin or old, the fresh urates'
                                # off-white (FRESH_COL) where it is thick and young
RELIEF = 0.0006         # a dropping stands this proud of the top where its deposit is whole
EDGE_W = 0.05           # a dropping's edge: its outline code within this of 0.5 (about a millimetre)
CRUST = (0.05, 0.60)    # inside its outline a dropping covers CRUST_RIM at its thin rim (an old one weathered to a film),
CRUST_RIM = 0.30        # all of it where its deposit passes from the first to the second; at strength 1 a full crust covers
CRUST_COVER = 0.88      # the surface CRUST_COVER (never more than COVER_MAX)
COVER_MAX = 0.94
STAIN = (0.21, 0.20, 0.18)      # round the droppings a grey-brown film (linear), their organic part weathered and soaked
THIN = (0.03, 0.20)     # into the surface: it covers from the first deposit to the second, this much at most ...
STAIN_COVER = 0.45
STAIN_MAX = 0.50        # (never more than STAIN_MAX), ...
JOINT_FILM = 0.60       # ... this much more of it in a brick top's joints, where it soaks in deepest
ETCH_T = (0.08, 0.25)   # ... and round the heaviest, where the film is this strong, the surface is etched (ETCH)
CORE_COL = (0.10, 0.095, 0.075) # a fresh dropping's dark core (linear), ...
CORE_COVER = 0.55       # ... covering this much of it
MATTE = 0.90            # and it is at least this rough: chalky
HEAVY = (0.60, 0.95)    # a deposit is heavy (built up) from the first to the second
ETCH = 0.35             # round a heavy deposit the surface is etched: this far toward its own colour ETCH_GREY greyed ...
ETCH_GREY = 0.30
ETCH_TINT = (1.12, 1.09, 1.02)  # ... and a little paler and yellower, dull
DRIP_T = (0.20, 0.75)   # a drip's paste covers DRIP_RIM of DRIP_COVER where it is thin and all of it where its deposit
DRIP_RIM = 0.30         # passes from the first to the second: a translucent film where it thins, a crust at its head
DRIP_COVER = 0.82       # and its bulb
FILM_T = (0.04, 0.25)   # its tail and the film round it, outside its outline: a translucent chalky film from the first
FILM_D = 0.35           # deposit to the second, covering this much at most
RELIEF_D = 0.0004       # a drip stands this proud where its deposit is whole
TOP_TOL = 0.006         # a roost's top is read within this of the heights its stretch was found at
DEBUG_GAIN = 4.0        # the debug view: full colour from a quarter of the most a mark holds
MARK_UP = 0.20          # the debug view's line along a roost's stretch runs along its back edge this far over the top, and
ROOST_UP = 0.20         # its octahedron stands this far over its pile: clear of the deposit, which lies on the top

_MASONRY = np.array([c in classes.MASONRY for c in range(len(classes.NAMES))])
WINDOW = (classes.GLASS, classes.PAINT)
FACADE_IDX = {F.name: F.idx for F in FACADES}


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def s_at(f, c):
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * RES


def col_of(f, s):
    return int(math.floor((s - FACADES[f].s0) / RES))


def enc_d(d):
    return np.clip((np.asarray(d, np.float64) - D_LO) / D_SPAN, 0.0, 1.0)


def height_share(H):
    # none under H_MIN; from there HEIGHT_FLOOR, rising to 1 by HEIGHT[1] over the pavement
    return float(smooth(H_MIN - 0.10, H_MIN, H)) * (
        HEIGHT_FLOOR + (1.0 - HEIGHT_FLOOR) * float(smooth(HEIGHT[0], HEIGHT[1], H)))


def draw(key, n):
    """n uniforms in 0..1 from a roost's or a dropping's own seed: the sha256 of "pigeon:" and its key, two bytes each
    (more than sixteen carry on in the sha256 of the key and "#1", "#2", ...), so every rebuild draws the same values and
    nothing drawn for one thing moves when another changes."""
    out, i = [], 0
    while len(out) < n:
        h = hashlib.sha256(("pigeon:" + key + (f"#{i}" if i else "")).encode("utf-8")).digest()
        out += [int.from_bytes(h[2 * j:2 * j + 2], "big") / 65535.0 for j in range(16)]
        i += 1
    return out[:n]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def normal(u, v):
    # a standard normal from two uniforms (Box-Muller)
    return math.sqrt(-2.0 * math.log(max(u, 1e-6))) * math.cos(2.0 * math.pi * v)


# ---------------------------------------------------------------------------------------------------- the ledges
class Scan:
    """Level and vertical rays against the block, the fire escapes looked through."""

    def __init__(self, blk):
        self.blk = blk
        self.see = np.array([d["object"].startswith(SEE_THROUGH) for d in blk.inst], bool)
        self.rays = 0

    def level(self, F, S, z):
        """Per column s in S: the depth (nan where nothing) and the triangle (-1) of the first surface a level ray from
        the street meets at height z."""
        from mathutils import Vector
        dirv = Vector((-F.n[0], -F.n[1], 0.0))
        ray, see, ti = self.blk.bvh.ray_cast, self.see, self.blk.tri_inst
        D = np.full(len(S), np.nan); T = np.full(len(S), -1, np.int64)
        for j, s in enumerate(S):
            o = Vector(F.world(float(s), D_FROM, z)); left = REACH_RAY
            while True:
                loc, _, t, dist = ray(o, dirv, left); self.rays += 1
                if loc is None or not see[ti[t]]: break
                o = loc + dirv * 0.002; left -= dist + 0.002
            if loc is None: continue
            D[j] = F.n[0] * loc.x + F.n[1] * loc.y - F.c_n; T[j] = t
        return D, T

    def down(self, F, s, d, z0, reach):
        """A ray straight down from (s, d, z0): (z, triangle, normal z) of what it meets, or None."""
        from mathutils import Vector
        loc, nor, t, _ = self.blk.bvh.ray_cast(Vector(F.world(s, d, z0)), Vector((0.0, 0.0, -1.0)), reach)
        self.rays += 1
        return None if loc is None else (loc.z, t, nor.z)

    def profile(self, F, s, Z):
        """Per height z in Z at the column s: the depth (nan where nothing), the material class (-1) and the normal's
        d and z in the face's frame of the first surface a level ray from the street meets: the face under a lip as a
        drip runs down it."""
        from mathutils import Vector
        dirv = Vector((-F.n[0], -F.n[1], 0.0))
        ray, see, ti, tc = self.blk.bvh.ray_cast, self.see, self.blk.tri_inst, self.blk.tri_class
        D = np.full(len(Z), np.nan); C = np.full(len(Z), -1, np.int64); ND = np.zeros(len(Z)); NZ = np.zeros(len(Z))
        for j, z in enumerate(Z):
            o = Vector(F.world(float(s), D_FROM, float(z))); left = REACH_RAY
            while True:
                loc, nor, t, dist = ray(o, dirv, left); self.rays += 1
                if loc is None or not see[ti[t]]: break
                o = loc + dirv * 0.002; left -= dist + 0.002
            if loc is None: continue
            D[j] = F.n[0] * loc.x + F.n[1] * loc.y - F.c_n; C[j] = int(tc[t])
            ND[j] = F.n[0] * nor.x + F.n[1] * nor.y; NZ[j] = nor.z
        return D, C, ND, NZ


def levels(blk):
    """Per face, the heights at which masonry has flat tops at least H_MIN over the pavement, tops within LEVEL_JOIN of
    each other taken together (a sill's cap and the reveal floor 5 mm above it are scanned as one): (z, half its span,
    s0, s1) with the span along the face those tops cover."""
    P = blk.V[blk.T]
    cr = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); ln = np.linalg.norm(cr, axis=1)
    nz = cr[:, 2] / np.maximum(ln, 1e-12); area = 0.5 * ln
    cz = P[:, :, 2].mean(axis=1)
    sel = np.nonzero((nz > 0.95) & _MASONRY[np.clip(blk.tri_class, 0, None)] & (cz - Z_GROUND >= H_MIN - 0.01)
                     & (area > 1e-8))[0]
    cen = P[sel].mean(axis=1)
    fac = facade_of(cen[:, 0], cen[:, 1])
    out = {}
    for f, F in enumerate(FACADES):
        idx = sel[fac == f]
        if not len(idx): continue
        S, _, _ = F.sdz(P[idx, :, 0], P[idx, :, 1], P[idx, :, 2])
        zb = np.round(cz[idx] / LEVEL_BIN).astype(np.int64)
        bins = []
        for b in np.unique(zb):
            k = zb == b
            if area[idx[k]].sum() < LEVEL_AREA: continue
            z = float(b) * LEVEL_BIN
            if bins and z - bins[-1][1] <= LEVEL_JOIN + 1e-9:
                g = bins[-1]; bins[-1] = (g[0], z, min(g[2], float(S[k].min())), max(g[3], float(S[k].max())))
            else:
                bins.append((z, z, float(S[k].min()), float(S[k].max())))
        out[f] = [(round(0.5 * (a + b), 4), round(0.5 * (b - a), 4), s0, s1) for a, b, s0, s1 in bins]
    return out


def scan_face(sc, f, lvls, blk):
    """The flat tops of face f with open air over them: per column, the ledge records found at each height (a surface
    below standing in front of one above, a flat masonry top confirmed between them), merged where tops a few
    millimetres apart touch. Each height is cast every COARSE columns first, and at every column only near what that
    finds. Returns (records per column, the level rays over each height, where cast)."""
    F = FACADES[f]
    W = int(round(F.width / RES))
    recs = [[] for _ in range(W)]
    above = {}
    for z, hs, sa, sb in lvls:
        eps, tol = hs + EPS, hs + DOWN_TOL
        c0 = max(0, col_of(f, sa - 0.10)); c1 = min(W - 1, col_of(f, sb + 0.10))
        Da = np.full(W, np.nan); Ta = np.full(W, -1, np.int64); Db = np.full(W, np.nan); Tb = np.full(W, -1, np.int64)
        cast = np.zeros(W, bool)

        def cast_cols(cols):
            cols = cols[~cast[cols]]
            if not len(cols): return
            S = s_at(f, cols)
            Da[cols], Ta[cols] = sc.level(F, S, z + eps)
            Db[cols], Tb[cols] = sc.level(F, S, z - eps)
            cast[cols] = True
        cast_cols(np.arange(c0, c1 + 1, COARSE))
        cand = cast & np.isfinite(Db) & (~np.isfinite(Da) | (Db - Da >= STEP_MIN))
        if not cand.any(): continue
        near = np.zeros(W, bool)
        for k in np.nonzero(cand)[0]: near[max(c0, k - COARSE):min(c1, k + COARSE) + 1] = True
        cast_cols(np.nonzero(near)[0])
        above[z] = (Da, cast)
        cand = cast & np.isfinite(Db) & (~np.isfinite(Da) | (Db - Da >= STEP_MIN))
        for c in np.nonzero(cand)[0]:
            s = float(s_at(f, c)); db = float(Db[c]); open_ = not np.isfinite(Da[c])
            dm = db - 0.01 if open_ else 0.5 * (float(Da[c]) + db)
            h = sc.down(F, s, dm, z + eps + 0.02, eps + tol + 0.03)
            if h is None or abs(h[0] - z) > tol or h[2] < 0.9: continue
            if not _MASONRY[max(int(blk.tri_class[h[1]]), 0)]: continue
            x, y, _ = F.world(s, dm, z)
            if int(facade_of(x, y)) != f: continue                       # a top owned by the next face (the mitre)
            he = sc.down(F, s, db - 0.012, z + eps + 0.02, eps + tol + 0.03)    # the top at the outer edge itself
            z_edge = he[0] if he is not None and abs(he[0] - z) <= tol and he[2] >= 0.9 else h[0]
            back = float(Da[c])
            if open_:
                # nothing stands on it: its inner edge, the furthest back a ray straight down still finds this top
                lo, hi = dm, db - OPEN_MAX                                 # lo on the top, hi (maybe) past it
                for _ in range(OPEN_STEPS):
                    mid_ = 0.5 * (lo + hi)
                    q = sc.down(F, s, mid_, z + eps + 0.02, eps + tol + 0.03)
                    if q is not None and abs(q[0] - z) <= tol and q[2] >= 0.9: lo = mid_
                    else: hi = mid_
                back = lo
            recs[int(c)].append(dict(z=float(z_edge), zs=[float(h[0]), float(z_edge)], back=back, edge=db, open=open_,
                                     top=int(h[1]), behind=int(Ta[c]), front=int(Tb[c])))
    for c in range(W):
        rs = sorted(recs[c], key=lambda r: r["z"])
        merged = []
        for r in rs:
            m = next((m for m in merged if abs(m["z"] - r["z"]) <= MERGE_DZ + 1e-9 and
                      min(m["edge"], r["edge"]) >= max(m["back"], r["back"]) - MERGE_DD), None)
            if m is None:
                merged.append(dict(r, zs=list(r["zs"]))); continue
            if r["edge"] > m["edge"] + 1e-6:
                m["edge"], m["front"], m["z"] = r["edge"], r["front"], r["z"]     # the height at the outer edge
            if r["back"] < m["back"] - 1e-6:
                m["back"], m["behind"], m["open"] = r["back"], r["behind"], r["open"]
            m["zs"] += r["zs"]
        for m in merged:
            m["zg"] = float(np.mean([min(m["zs"]), max(m["zs"])]))              # the height the shader's gate keeps
            m["depth"] = m["edge"] - m["back"]
        recs[c] = merged
    return recs, above


# ---------------------------------------------------------------------------------------------------- the sites
KINDS = (("crown top", r"^ge_crown_c3"), ("band top", r"^(ge_cornice45_top|top_panel)"),
         ("impost course", r"^impost_course"), ("abacus", r"^ge_capital"),
         ("window sill", r"^(sill_|panel_)"), ("crown foot", r"^ge_crown$"),
         ("portal crown moulding", r"^fit_(inset|pier)"), ("openings row", r"^fit_zone"), ("cornice", r"^ge_cornice$"))


def kind_of(top_obj, behind_obj, behind_cls):
    # what a site is, for the build's account and the published data: a window's sill wherever a window stands on it
    if behind_cls in WINDOW and not top_obj.startswith("ge_crown_c3"): return "window sill"
    if top_obj.startswith("ge_cornice") and top_obj == "ge_cornice" and behind_obj.startswith(("fit_inset", "fit_pier")):
        return "portal crown moulding"
    for k, rx in KINDS:
        if re.match(rx, top_obj): return k
    return "other"


def family_of(st):
    """The ledge a site stands on, whatever stands on it: its kind, with a window's sill named for its ledge (the top
    floor's deep reveals are the band's top, floor 2's reveal floors the ground floor crown's foot)."""
    if st["kind"] != "window sill": return st["kind"]
    if re.match(r"^(ge_cornice45_top|top_panel)", st["top"]): return "band top"
    if re.match(r"^ge_crown", st["top"]): return "crown foot"
    return "sill"


def sites_of_face(ctx, f, recs, above, shelter, expo, front):
    """The perch sites of face f: stretches of one ledge with one wall behind them, split where that wall steps; each
    with its ends (a return tucks a bird in; a step back or the ledge's end does not), its use per column, and its
    LEDGE: the back's and the edge's depth and the heights found per column of the whole ledge at that height (nan where
    it has no top), the footprint a roost's deposit lies on."""
    blk = ctx.block
    F = FACADES[f]
    W = len(recs)
    # the ledges' heights on this face, clustered: records within 2 cm of each other are one ledge
    zs = sorted({round(r["z"], 3) for rc in recs for r in rc})
    clusters = []
    for z in zs:
        if clusters and z - clusters[-1][-1] <= 0.02: clusters[-1].append(z)
        else: clusters.append([z])
    lvl_keys = sorted(above)
    out = []
    for cl in clusters:
        zlo, zhi = cl[0] - 1e-6, cl[-1] + 1e-6
        at = [next((r for r in recs[c] if zlo <= round(r["z"], 3) <= zhi), None) for c in range(W)]
        zc = float(np.median(cl))
        zk = min(lvl_keys, key=lambda k: abs(k - zc))
        Da, castm = above[zk]
        nan = float("nan")
        ledge = dict(facade=f, z=zc, back=np.array([r["back"] if r else nan for r in at]),
                     edge=np.array([r["edge"] if r else nan for r in at]),
                     zedge=np.array([r["z"] if r else nan for r in at]),
                     zlo=np.array([min(r["zs"]) if r else nan for r in at]),
                     zhi=np.array([max(r["zs"]) if r else nan for r in at]))

        def above_at(c):
            return float(Da[c]) if 0 <= c < len(Da) and castm[c] else float("nan")
        c = 0
        while c < W:
            if at[c] is None: c += 1; continue
            run = [c]
            while run[-1] + 1 < W and at[run[-1] + 1] is not None: run.append(run[-1] + 1)
            c = run[-1] + 1
            # split where the wall behind steps
            cuts = [0]
            for i in range(1, len(run)):
                a, b = at[run[i - 1]], at[run[i]]
                if a["open"] != b["open"] or (not a["open"] and abs(b["back"] - a["back"]) >= RETURN_MIN): cuts.append(i)
            cuts.append(len(run))
            for i0, i1 in zip(cuts, cuts[1:]):
                cols = run[i0:i1]
                if len(cols) * RES < SITE_MIN: continue
                rs = [at[k] for k in cols]
                ends = []
                for side, cb, cn in (("L", cols[0], cols[0] - 1), ("R", cols[-1], cols[-1] + 1)):
                    me = at[cb]
                    if me["open"]: ends.append(dict(side=side, kind="open", tuck=0.0)); continue
                    nb = at[cn] if 0 <= cn < W else None
                    d_nb = (nb["back"] if nb is not None and not nb["open"] else
                            (above_at(cn) if nb is None else float("nan")))
                    step = d_nb - me["back"] if np.isfinite(d_nb) else float("nan")
                    if np.isfinite(step) and step >= RETURN_MIN:
                        tuck = min(step, me["depth"])
                        ends.append(dict(side=side, kind="return", tuck=round(float(tuck), 3)))
                    elif np.isfinite(step) and step <= -RETURN_MIN:
                        ends.append(dict(side=side, kind="step", tuck=0.0))
                    else:
                        ends.append(dict(side=side, kind="open", tuck=0.0))
                S = s_at(f, np.array(cols))
                depth = np.array([r["depth"] for r in rs]); edge = np.array([r["edge"] for r in rs])
                back = np.array([r["back"] for r in rs]); z_edge = np.array([r["z"] for r in rs])
                zg = np.array([r["zg"] for r in rs])
                # its protection: over the space a bird occupies above it, 565's shelter from the overhangs and its open
                # share (a reveal's sides count), where the street sees a surface; nothing over it is no protection
                prot = np.zeros(len(cols))
                for dz in BODY_Z:
                    zz = z_edge + dz
                    dep = soiling.sample(front, f, S, zz, key="depth")
                    has = np.isfinite(dep)
                    sh = soiling.sample(shelter, f, S, zz)
                    op = soiling.sample(expo, f, S, zz, key="open")
                    p = np.maximum(sh, ENCLOSE * (1.0 - op))
                    prot += np.where(has, np.clip(p, 0.0, 1.0), 0.0) / len(BODY_Z)
                H = float(np.median(z_edge)) - Z_GROUND
                use = smooth(DEPTH[0], DEPTH[1], depth) * height_share(H) * (
                    EXPOSED + (1.0 - EXPOSED) * smooth(0.0, PROTECT_FULL, prot)) * (
                    1.0 + ROOM_GAIN * smooth(ROOM[0], ROOM[1], depth))
                use = np.clip(use, 0.0, 1.0)
                tops = [blk.inst[blk.tri_inst[r["top"]]]["object"] for r in rs]
                behind = [blk.inst[blk.tri_inst[r["behind"]]]["object"] if r["behind"] >= 0 else "" for r in rs]
                top_obj = max(sorted(set(tops)), key=tops.count)
                bh_obj = max(sorted(set(behind)), key=behind.count)
                bcls = [int(blk.tri_class[r["behind"]]) if r["behind"] >= 0 else -1 for r in rs]
                bh_cls = max(sorted(set(bcls)), key=bcls.count)
                out.append(dict(facade=f, cols=np.array(cols), s=S, z=z_edge, zg=zg, back=back, edge=edge, depth=depth,
                                open=bool(rs[0]["open"]), prot=prot, use=use, H=H, ends=ends, top=top_obj, behind=bh_obj,
                                behind_cls=bh_cls, kind=kind_of(top_obj, bh_obj, bh_cls),
                                top_cls=int(blk.tri_class[rs[len(rs) // 2]["top"]]), ledge=ledge))
    return out


# ---------------------------------------------------------------------------------------------------- a drip's path
def trace_drip(sc, F, s, z_top, d_edge, run, cling):
    """A drip's path down the face under the lip at s, followed along its axis every PROFILE_DZ with level rays from the
    street, as runoff's film is walked: it starts on the ledge's own front (masonry within FRONT_TOL of the edge's depth,
    at or under the top) and runs on over masonry while each step stands no more than CATCH_P in front of the one above
    (further, a surface standing out catches it on its top) and no more than CREEP_P behind it (a sill's cove or a bead
    is crept round; deeper, it drips off the edge), for its run along the surface. Its paste hangs off where the surface
    turns under further than its cling (the normal's z under -cling) for HANG_MIN on end: an underside, not the rounding
    of an arris it creeps round; the liquid's thin tail follows on. Returns dict(z, t, d: the samples on its path, t
    along the surface from the lip; why it stopped: length, edge, caught, surface or reach; hang: the t where the paste
    hangs off, or None; arrises: (t, the turn in degrees, +1 convex / -1 concave)), or None where it never starts."""
    Z = z_top + 0.004 - PROFILE_DZ * np.arange(int(round(PROFILE_H / PROFILE_DZ)) + 5)
    D, C, ND, NZ = sc.profile(F, s, Z)
    ok = np.isfinite(D) & (C >= 0) & _MASONRY[np.clip(C, 0, None)]
    lip = np.nonzero(ok & (Z <= z_top + 0.0015) & (np.abs(np.nan_to_num(D, nan=-9.0) - d_edge) <= FRONT_TOL))[0]
    if not len(lip): return None
    k0 = int(lip[0])
    ang = np.degrees(np.arctan2(NZ, ND))            # the surface's normal in the (d, z) plane: 0 to the street, -90 down
    zs, ts, ds, ks = [float(Z[k0])], [0.0], [float(D[k0])], [k0]
    why, hang, under = "reach", None, None
    for k in range(k0 + 1, len(Z)):
        if not ok[k]: why = "surface"; break
        dd = float(D[k] - D[k - 1])
        if dd > CATCH_P: why = "caught"; break
        if dd < -CREEP_P: why = "edge"; break
        t = ts[-1] + math.hypot(PROFILE_DZ, dd)
        if NZ[k] < -cling and abs(dd) <= ARRIS_STEP:
            under = ts[-1] if under is None else under                  # an underside it cannot hold to begins
            if hang is None and t - under >= HANG_MIN: hang = under
        else:
            under = None
        zs.append(float(Z[k])); ts.append(t); ds.append(float(D[k])); ks.append(k)
        if ts[-1] >= run: why = "length"; break
    # the arrises it crosses: a step, or a turn of the surface by more than ARRIS_DEG over two samples
    arr = []
    for i in range(1, len(ks)):
        step = ds[i] - ds[i - 1]
        turn = float(ang[ks[i]] - ang[ks[max(i - 2, 0)]])
        if abs(step) > ARRIS_STEP: sign = 1 if step < 0 else -1          # a step back is convex, one forward concave
        elif abs(turn) > ARRIS_DEG: sign = 1 if turn < 0 else -1         # turning further down is convex
        else: continue
        if arr and ts[i] - arr[-1][0] < 0.003: continue                  # the same arris
        arr.append((ts[i], round(abs(turn), 1), sign))
    return dict(z=np.array(zs), t=np.array(ts), d=np.array(ds), why=why, hang=hang, arrises=arr)


def find_sites(ctx):
    """Every perch site on the block, face by face (see sites_of_face): those a bird can use at all."""
    blk = ctx.block
    sc = Scan(blk)
    shelter = ctx.field("soiling", "shelter"); expo = ctx.field("soiling", "exposure")
    front = ctx.field("soiling", "front")
    lv = levels(blk)
    sites, n_cols, unused = [], 0, 0
    for f in range(len(FACADES)):
        if f not in lv: continue
        recs, above = scan_face(sc, f, lv[f], blk)
        n_cols += sum(len(r) for r in recs)
        for st in sites_of_face(ctx, f, recs, above, shelter, expo, front):
            if float(st["use"].max()) < USE_MIN: unused += 1; continue
            sites.append(st)
    return sites, dict(levels={FACADES[f].name: [round(z, 3) for z, _, _, _ in v] for f, v in lv.items()}, rays=sc.rays,
                       ledge_columns=n_cols, unused=unused)


# ---------------------------------------------------------------------------------------------------- the choice
def candidates(sites):
    """Every inner corner a bird can tuck into: a site's end that is a return at least TUCK[0] deep. Its plausibility p
    is the site's use at that end (standing room, height, protection) times how deep the return tucks the bird in; a
    corner under P_MIN is none. Its id is its place (face, the return's s, the ledge's height), stable from one build to
    the next."""
    out = []
    for st in sites:
        F = FACADES[st["facade"]]
        for e in st["ends"]:
            if e["kind"] != "return": continue
            j = 0 if e["side"] == "L" else -1
            p = float(st["use"][j]) * float(smooth(TUCK[0], TUCK[1], e["tuck"]))
            if p < P_MIN: continue
            s_ret = float(st["s"][j]) + (-0.5 if e["side"] == "L" else 0.5) * RES      # the return's face
            gap = float(st["edge"][j] - (st["back"][j] + e["tuck"]))    # how far the return's front end stands behind
            out.append(dict(id=f"{F.name}:{s_ret:.2f}:{float(st['z'][j]):.2f}", site=st, facade=st["facade"],   # the edge
                            side=e["side"], s=s_ret, z=float(st["z"][j]), H=st["H"], family=st["family"],
                            kind=st["kind"], tuck=e["tuck"], gap=round(gap, 3), p=round(p, 4)))
    return out


def portal_axis(blk, face):
    """Where along `face` its portal stands: the middle of the portal instances' extent (the portal is one collection
    instanced once on each of three faces), and the instancer's name; (None, None) where the face has none."""
    by = {}
    for i, d in enumerate(blk.inst):
        if d["instancer"]: by.setdefault(d["instancer"], []).append(i)
    f = FACADE_IDX[face]
    for name in sorted(by):
        P = blk.V[np.unique(blk.T[np.isin(blk.tri_inst, by[name])])]
        lo, hi = P.min(axis=0), P.max(axis=0)
        x, y = 0.5 * (lo[0] + hi[0]), 0.5 * (lo[1] + hi[1])
        if int(facade_of(x, y)) == f:
            return float(FACADES[f].sdz(x, y, 0.0)[0]), name
    return None, None


def choose(cands, front_s):
    """The building's roosts: three of the candidates or two (COUNT_P3). Each candidate's key is u ** (1 / p), u from its
    own seed: the first is the best key round the Broadway portal (FRONT, within FRONT_REACH of its axis, under FRONT_H
    over the pavement), each next the best key among the candidates that differ from every roost chosen in family, in
    face and by STOREY in height. Returns the roosts (the candidates, with the rule that chose them and how many it
    chose from) and the count drawn."""
    n = 3 if draw("count", 1)[0] < COUNT_P3 else 2
    for c in cands: c["key"] = draw("roost:" + c["id"], 1)[0] ** (1.0 / c["p"])
    best = lambda pool: max(pool, key=lambda c: (c["key"], c["id"]))
    pool = [c for c in cands if c["facade"] == FACADE_IDX[FRONT] and front_s is not None
            and abs(c["s"] - front_s) <= FRONT_REACH and c["H"] < FRONT_H]
    assert pool, f"{NAME}: no candidate corner round the portal on {FRONT}"
    out = [dict(best(pool), rule="round the Broadway portal", pool=len(pool))]
    while len(out) < n:
        pool = [c for c in cands if all(c["family"] != o["family"] and c["facade"] != o["facade"]
                                        and abs(c["H"] - o["H"]) >= STOREY for o in out)]
        if not pool: break
        out.append(dict(best(pool), rule="apart from the others", pool=len(pool)))
    return out, n


# ---------------------------------------------------------------------------------------------------- a roost's deposit
def stretch(r):
    """The stretch of ledge a roost's deposit may cover: its ledge's columns from X_BEHIND past the return (in front of
    the return's own wall, where the ledge runs on) to X_OUT into the site, as far as the ledge runs unbroken. Returns
    the columns (ascending) and the direction into the site along s (+1 from a left end, -1 from a right one)."""
    st, lg = r["site"], r["site"]["ledge"]
    sg = 1 if r["side"] == "L" else -1
    has = np.isfinite(lg["edge"])
    c0 = int(st["cols"][0] if r["side"] == "L" else st["cols"][-1])
    cols = [c0]
    for direction, n in ((sg, int(round(X_OUT / RES))), (-sg, int(round(X_BEHIND / RES)))):
        c, k = c0, 0
        while k < n and 0 <= c + direction < len(has) and has[c + direction]:
            c += direction; k += 1; cols.append(c)
    return np.array(sorted(cols)), sg


class Footprint:
    """A roost's stretch of ledge: per column its back's and edge's depth, and where a point (s, d) is on its top."""

    def __init__(self, r, cols, sg):
        lg = r["site"]["ledge"]
        self.f, self.cols, self.sg = r["facade"], cols, sg
        self.c_lo, self.c_hi = int(cols[0]), int(cols[-1])
        self.back = lg["back"][self.c_lo:self.c_hi + 1]; self.edge = lg["edge"][self.c_lo:self.c_hi + 1]
        self.s_ret = r["s"]
        self.s_lo = float(s_at(self.f, self.c_lo)) - 0.5 * RES; self.s_hi = float(s_at(self.f, self.c_hi)) + 0.5 * RES
        self.zlo = float(np.nanmin(lg["zlo"][self.c_lo:self.c_hi + 1]))
        self.zhi = float(np.nanmax(lg["zhi"][self.c_lo:self.c_hi + 1]))

    def s_of(self, x):
        # a distance along the ledge from the return (into the site) as s
        return self.s_ret + self.sg * x

    def at(self, s):
        # (back, edge) of the column at s, or None off the stretch
        c = col_of(self.f, s)
        if c < self.c_lo or c > self.c_hi: return None
        return float(self.back[c - self.c_lo]), float(self.edge[c - self.c_lo])

    def inside(self, s, d, m=0.0):
        be = self.at(s)
        return be is not None and be[0] + m <= d <= be[1] - m

    def clamp_x(self, x):
        # a distance along from the return held on the stretch
        lo, hi = sorted((self.sg * (self.s_lo + 0.01 - self.s_ret), self.sg * (self.s_hi - 0.01 - self.s_ret)))
        return min(max(x, lo), hi)


def compose(r, fp, n_drips):
    """A roost's deposit, drop by drop, on its footprint `fp`, all drawn from its own seed (keys under its id): where the
    bird sits tucked in (its pile) and where it stands at the edge to watch (its perch), how its droppings split between
    them and spread round each; each dropping's size, elongation, turn and thickness, whether it is a smear, has lobes,
    throws satellites or shows a dark core; the strays; and its n_drips drips over the edge round the perch, what each
    draws (lay_drips traces and composes them). Returns the bird's draws, the shapes (splats and smears, in (s, d)), the
    cores, the drips' draws and the counts."""
    key = r["id"]
    u = draw(key + ":bird", 32)
    x_r = fp.clamp_x(mid(ROOST_X, u[0], u[1]))
    be = fp.at(fp.s_of(x_r)) or (r["site"]["back"][0], r["site"]["edge"][0])
    d_r = be[0] + min(mid(ROOST_Y, u[2], u[3]), 0.5 * (be[1] - be[0]))
    x_p = fp.clamp_x(x_r + mid(PERCH_DX, u[4], u[5]))
    be_p = fp.at(fp.s_of(x_p)) or be
    d_p = be_p[1] - min(mid(PERCH_Y, u[6], u[7]), 0.5 * (be_p[1] - be_p[0]))
    share = mid(PILE_SHARE, u[8], u[9])
    n = int(round(mid(DROPS, u[10], u[11]) * (0.5 + r["p"])))
    spread = dict(pile=(mid(PILE_SPREAD[0], u[12], u[13]), mid(PILE_SPREAD[1], u[14], u[15])),
                  perch=(mid(PERCH_SPREAD[0], u[16], u[17]), mid(PERCH_SPREAD[1], u[18], u[19])))
    centre = dict(pile=(fp.s_of(x_r), d_r), perch=(fp.s_of(x_p), d_p))
    smear_p, core_p = mid(SMEAR, u[20], u[21]), mid(CORE, u[22], u[23])
    n_stray = int(STRAYS[0] + (STRAYS[1] - STRAYS[0] + 1) * u[24]) if u[24] < 1.0 else STRAYS[1]
    halo_e = mid(HALO_E, u[25], u[26])
    shapes, cores = [], []
    counts = dict(pile=0, perch=0, smears=0, lobes=0, satellites=0, cores=0, strays=0, lost=0)

    def splat(kd, s, d, a, age, dk):
        # one dropping at (s, d) of half-length a and its age: a smear, or a splat with maybe a lobe or two off its
        # outline, satellites round it and, fresh, its dark core
        amt = (AMOUNT[1] - (AMOUNT[1] - AMOUNT[0]) * age) * (1.0 + AMOUNT_JIT * (2.0 * dk[31] - 1.0))
        if dk[0] < smear_p:
            L = a * mid(SMEAR_L, dk[1], dk[2]); w = a * mid(SMEAR_W, dk[3], dk[4])
            ang = SMEAR_ANG * (2.0 * dk[5] - 1.0)
            ts, td = math.cos(ang), math.sin(ang)
            shapes.append(("smear", s - 0.5 * L * ts, d - 0.5 * L * td, s + 0.5 * L * ts, d + 0.5 * L * td, w,
                           amt * mid(SMEAR_A, dk[6], dk[7]) / AMOUNT[1], age))
            counts["smears"] += 1
            return
        asp = mid(ASPECT, dk[1], dk[2]); ang = math.pi * dk[3]
        shapes.append(("splat", s, d, a, a / asp, ang, amt, age))
        if dk[32] < LOBES:
            for k in range(1 + (dk[33] < 0.4)):
                q = dk[34 + 7 * k:41 + 7 * k]
                t = 2.0 * math.pi * q[0]; rr = a * mid(LOBE_D, q[1], q[2]); ra = a * mid(LOBE_R, q[3], q[4])
                shapes.append(("splat", s + rr * math.cos(t), d + rr * math.sin(t), ra, ra / mid(ASPECT, q[5], q[4]),
                               math.pi * q[6], amt * (0.8 + 0.2 * q[3]), age))
                counts["lobes"] += 1
        if dk[4] < SPLASH:
            for k in range(1 + (dk[5] < 0.4)):
                t = 2.0 * math.pi * dk[6 + 3 * k]; rr = a * mid(SAT_D, dk[7 + 3 * k], dk[8 + 3 * k])
                ra = a * mid(SAT_R, dk[12 + k], dk[13 - k])
                shapes.append(("splat", s + rr * math.cos(t), d + rr * math.sin(t), ra, ra, 0.0, 0.8 * amt, age))
                counts["satellites"] += 1
        if kd != "stray" and age < FRESH and dk[14] < core_p:
            rc = a * mid(CORE_R, dk[15], dk[16]); t = 2.0 * math.pi * dk[17]; off = a * CORE_OFF * dk[18]
            cores.append(("splat", s + off * math.cos(t), d + off * math.sin(t), rc, rc / asp, ang, 1.0, age))
            counts["cores"] += 1

    for i in range(n):
        dk = draw(f"{key}:drop:{i}", 48)
        kd = "pile" if dk[21] < share else "perch"
        (cs, cd), (ss, sd) = centre[kd], spread[kd]
        for t in range(TRIES):
            q = dk if t == 0 else draw(f"{key}:drop:{i}:try:{t}", 32)
            s = cs + ss * normal(q[22], q[23]); d = cd + sd * normal(q[24], q[25])
            a = min(max(SIZE[0] * math.exp(SIZE[1] * 0.5 * (normal(q[26], q[27]) + normal(q[28], q[29]))),
                        SIZE_LIM[0]), SIZE_LIM[1])
            if fp.inside(s, d, 0.3 * a): break
        else:
            counts["lost"] += 1; continue
        splat(kd, s, d, a, AGE[0] + (AGE[1] - AGE[0]) * dk[30], dk)
        counts[kd] += 1
    for i in range(n_stray):
        dk = draw(f"{key}:stray:{i}", 48)
        for t in range(TRIES):
            q = dk if t == 0 else draw(f"{key}:stray:{i}:try:{t}", 32)
            x = -X_BEHIND + (X_BEHIND + X_OUT) * q[22]
            s = fp.s_of(x); be = fp.at(s)
            if be is None: continue
            d = be[0] + (be[1] - be[0]) * q[23]
            a = SIZE[0] * mid(STRAY_SIZE, q[24], q[25])
            if fp.inside(s, d, 0.3 * a): break
        else:
            counts["lost"] += 1; continue
        splat("stray", s, d, a, STRAY_AGE[0] + (STRAY_AGE[1] - STRAY_AGE[0]) * dk[30], dk)
        counts["strays"] += 1
    # the drips: from the perch, where the bird faces in with its tail over the edge, n_drips of them (drip_counts),
    # strung along the edge round it as widely as this roost's bird wanders (DRIP_SPREAD); each drip's run takes its own
    # share of DRIP_L (one of n in a drawn order), and it draws its heaviness, age, widths, head, end and cling. Where it
    # goes over the edge is drawn again (TRIES) where the lip does not start a path (lay_drips)
    ud = draw(key + ":drips", 8)
    spread_d = mid(DRIP_SPREAD, ud[0], ud[1])
    halo_c = mid(HALO_DE, ud[2], ud[3])
    order = sorted(range(n_drips), key=lambda k: (ud[4 + k], k))
    drips = []
    for i in range(n_drips):
        dk = draw(f"{key}:drip:{i}", 56)
        xs = [fp.clamp_x(x_p + spread_d * normal(dk[0], dk[1]))]
        xs += [fp.clamp_x(x_p + spread_d * normal(*draw(f"{key}:drip:{i}:try:{t}", 2))) for t in range(1, TRIES)]
        w0 = mid(DRIP_W, dk[6], dk[7])
        end = "bulb" if dk[20] < END_BULB else "tail"
        # its head's lobes (along the lip or down, never up past it) and the spatter round it
        uh = draw(f"{key}:drip:{i}:head", 24)
        lobes = [(mid(HEAD_LOBE, uh[3 + 4 * j], uh[4 + 4 * j]), 0.5 + 0.5 * uh[5 + 4 * j],
                  LOBE_TURN * math.pi * (2.0 * uh[6 + 4 * j] - 1.0), 0.6 + 0.4 * uh[4 + 4 * j])
                 for j, p in enumerate(LOBE_P) if uh[j] < p]
        n_spat = SPATTER[0] + min(int((SPATTER[1] - SPATTER[0] + 1) * uh[15]), SPATTER[1] - SPATTER[0])
        spatter = [(mid(SPATTER_R, uh[16 + 4 * j], uh[17 + 4 * j]), 1.3 + 1.0 * uh[18 + 4 * j],
                    2.0 * math.pi * uh[19 + 4 * j]) for j in range(n_spat)]
        # its slugs and bends, at shares of the paste's run (drip_shapes places them once its path is known)
        us = draw(f"{key}:drip:{i}:shape", 40)
        n_slug = SLUGS[0] + min(int((SLUGS[1] - SLUGS[0] + 1) * us[2]), SLUGS[1] - SLUGS[0])
        n_bend = BENDS[0] + min(int((BENDS[1] - BENDS[0] + 1) * us[3]), BENDS[1] - BENDS[0])
        slugs = [(0.15 + 0.80 * us[4 + 5 * j], mid(SLUG_W, us[5 + 5 * j], us[6 + 5 * j]),
                  mid(SLUG_L, us[7 + 5 * j], us[8 + 5 * j])) for j in range(n_slug)]
        bends = [(0.10 + 0.80 * us[19 + 6 * j], (1.0 if us[20 + 6 * j] < 0.5 else -1.0) * mid(BEND_A, us[21 + 6 * j],
                                                                                          us[22 + 6 * j]),
                  mid(BEND_L, us[23 + 6 * j], us[24 + 6 * j])) for j in range(n_bend)]
        drips.append(dict(
            k=i, key=f"{key}:drip:{i}", xs=xs, slot=order.index(i),
            run=DRIP_L[0] + (DRIP_L[1] - DRIP_L[0]) * (order.index(i) + dk[2]) / n_drips,
            v=mid(DRIP_V, dk[3], dk[4]), age=DRIP_AGE[0] + (DRIP_AGE[1] - DRIP_AGE[0]) * dk[5],
            w0=w0, flare=mid(FLARE, us[0], us[1]), thin=mid(DRIP_THIN, dk[8], dk[9]), taper=mid(DRIP_TAPER, dk[10], dk[11]),
            slugs=slugs, bends=bends,
            head_w=w0 * mid(HEAD_W, dk[12], dk[13]), head_h=mid(HEAD_H, dk[14], dk[15]),
            head_at=mid(HEAD_AT, dk[16], dk[17]), head_tilt=HEAD_TILT * (2.0 * dk[18] - 1.0), lobes=lobes,
            spatter=spatter,
            end=end, paste=1.0 if end == "bulb" else mid(PASTE, dk[21], dk[22]),
            bulb_r=mid(BULB_R, dk[23], dk[24]), bulb_long=mid(BULB_LONG, dk[25], dk[26]),
            pendant=mid(PENDANT, dk[27], dk[28]), cling=mid(CLING, dk[29], dk[30]),
            neck=((mid(NECK_AT, dk[32], dk[33]), mid(NECK_D, dk[34], dk[35]), mid(NECK_L, dk[36], dk[37]))
                  if dk[31] < NECK_P else None),
            lean=LEAN * (2.0 * dk[38] - 1.0), tail_w=mid(TAIL_W, dk[39], dk[40]), tail_v=mid(TAIL_V, dk[41], dk[42]),
            dashes=TAIL_DASH[0] + min(int((TAIL_DASH[1] - TAIL_DASH[0] + 1) * dk[43]), TAIL_DASH[1] - TAIL_DASH[0]),
            droplet=mid(DROPLET, dk[44], dk[45]), lip_d=mid(LIP_D, dk[46], dk[47]), lip_off=0.3 * (2.0 * dk[19] - 1.0)))
    bird = dict(pile=dict(x=round(x_r, 3), s=round(centre["pile"][0], 3), d=round(d_r, 3),
                          spread=[round(v, 3) for v in spread["pile"]]),
                perch=dict(x=round(x_p, 3), s=round(centre["perch"][0], 3), d=round(d_p, 3),
                           spread=[round(v, 3) for v in spread["perch"]]),
                share=round(share, 3), drops=n, smear=round(smear_p, 3), core=round(core_p, 3), halo_e=round(halo_e, 4),
                drips=n_drips, drip_spread=round(spread_d, 4), drip_halo=round(halo_c, 4))
    return bird, shapes, cores, drips, counts


def gblur(a, sd):
    # a gaussian blur, sd in texels (separable, zero outside)
    if sd <= 0.0: return a
    k = int(math.ceil(3.0 * sd)); x = np.arange(-k, k + 1)
    w = np.exp(-0.5 * (x / sd) ** 2); w /= w.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, k), w, mode="valid"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, k), w, mode="valid"), 1, a)


def raster(shapes, cores, grid, halo_e):
    """The shapes on a roost's block: grid = (s_lo, d_lo, tau, rows, cols), rows along the depth. R the droppings'
    OUTLINE, the signed distance to the edge of their union (0.5 on it, rising inside, over +-SDF_SPAN), so the lookup's
    filter keeps a curved edge smooth and crisp at any texel; G their DEPOSIT, a smooth measure of how thick they lie
    (the sum of their domes built up, 1 - exp(-SAT x sum), with the HALO film round it); B the dark cores' outline, as
    R; A their AGE, each dropping's weighted by its dome (0 fresh .. 1 weathered), which sets their tone."""
    s_lo, d_lo, tau, nr, nc = grid
    acc = np.zeros((nr, nc)); sdf = np.full((nr, nc), np.inf); csdf = np.full((nr, nc), np.inf)
    aged = np.zeros((nr, nc))
    pad = SDF_SPAN

    def box(s0, s1, d0, d1):
        i0 = max(0, int(math.floor((s0 - pad - s_lo) / tau))); i1 = min(nc, int(math.ceil((s1 + pad - s_lo) / tau)) + 1)
        j0 = max(0, int(math.floor((d0 - pad - d_lo) / tau))); j1 = min(nr, int(math.ceil((d1 + pad - d_lo) / tau)) + 1)
        if i1 <= i0 or j1 <= j0: return None
        return i0, i1, j0, j1, s_lo + (np.arange(i0, i1) + 0.5) * tau, d_lo + (np.arange(j0, j1) + 0.5) * tau

    def ellipse(dist, dome, s, d, a, b, ang, amt, age):
        rr = max(a, b); bx = box(s - rr, s + rr, d - rr, d + rr)
        if bx is None: return
        i0, i1, j0, j1, ss, dd = bx
        X = ss[None, :] - s; Y = dd[:, None] - d
        ca, sa = math.cos(ang), math.sin(ang)
        x, y = X * ca + Y * sa, -X * sa + Y * ca
        q = np.maximum(np.sqrt((x / a) ** 2 + (y / b) ** 2), 1e-9)
        grad = np.maximum(np.sqrt((x / (a * a)) ** 2 + (y / (b * b)) ** 2), 1e-9 / max(a, b))
        # the distance to the outline, to first order: (q - 1) / |grad q|
        dist[j0:j1, i0:i1] = np.minimum(dist[j0:j1, i0:i1], (q - 1.0) * q / grad)
        if dome is None: return
        h = amt * np.clip(1.0 - q * q, 0.0, None)
        dome[j0:j1, i0:i1] += h; aged[j0:j1, i0:i1] += h * age

    def capsule(dist, dome, s0, d0, s1, d1, w, amt, age):
        bx = box(min(s0, s1) - w, max(s0, s1) + w, min(d0, d1) - w, max(d0, d1) + w)
        if bx is None: return
        i0, i1, j0, j1, ss, dd = bx
        X = ss[None, :] - s0; Y = dd[:, None] - d0
        vx, vy = s1 - s0, d1 - d0; L2 = max(vx * vx + vy * vy, 1e-12)
        t = np.clip((X * vx + Y * vy) / L2, 0.0, 1.0)
        r = np.sqrt((X - t * vx) ** 2 + (Y - t * vy) ** 2)
        dist[j0:j1, i0:i1] = np.minimum(dist[j0:j1, i0:i1], r - w * (1.0 - 0.35 * t))   # narrowing as it drags ...
        h = amt * (1.0 - 0.6 * t) * np.clip(1.0 - (r / w) ** 2, 0.0, None)                      # ... and thinning
        dome[j0:j1, i0:i1] += h; aged[j0:j1, i0:i1] += h * age

    for sh in shapes:
        if sh[0] == "splat": ellipse(sdf, acc, *sh[1:])
        else: capsule(sdf, acc, *sh[1:])
    for sh in cores: ellipse(csdf, None, *sh[1:])
    T0 = 1.0 - np.exp(-SAT * acc)
    halo = HALO * gblur(T0, halo_e / tau)
    T = 1.0 - (1.0 - T0) * (1.0 - halo)
    mean = float(aged.sum() / max(acc.sum(), 1e-9))              # at a rim and just off it, the roost's own mean
    age = (aged + AGE_EPS * mean) / (acc + AGE_EPS)
    enc = lambda x: np.clip(0.5 - 0.5 * np.nan_to_num(x, posinf=1e3) / SDF_SPAN, 0.0, 1.0)
    O = enc(sdf)
    return O, np.clip(T, 0.0, 1.0), np.minimum(enc(csdf), O), np.where(O > 0.0, np.clip(age, 0.0, 1.0), 0.0)


def block_of(fp, taken):
    """Where a roost's block lies in the atlas and at what scale: its stretch's (s, d) extent at TAU a texel, coarser
    only where it does not fit the free rows under Z_DRIP or its face's region beside the blocks already there (`taken`,
    the region's s used so far). Returns (s_lo, d_lo, tau, rows, cols, the region's first column and first row)."""
    F = FACADES[fp.f]
    d_lo = float(np.nanmin(fp.back)) - 0.01; d_hi = float(np.nanmax(fp.edge)) + 0.01
    rows_cap = int((Z_DRIP - BLOCK_Z0 - 0.10) / RES) - 2 * BLOCK_PAD
    c0 = int(round((BLOCK_S0 + taken) / RES))
    cols_cap = int(F.width / RES) - c0 - int(round(BLOCK_S0 / RES)) - 2 * BLOCK_PAD
    tau = max(TAU, (d_hi - d_lo) / rows_cap, (fp.s_hi - fp.s_lo) / cols_cap)
    nr = int(math.ceil((d_hi - d_lo) / tau)); nc = int(math.ceil((fp.s_hi - fp.s_lo) / tau))
    return dict(s_lo=fp.s_lo, d_lo=d_lo, tau=tau, rows=nr, cols=nc, c0=c0 + BLOCK_PAD,
                r0=int(round(BLOCK_Z0 / RES)) + BLOCK_PAD)


def paint_block(ctx, mark, f, blk_, chans):
    # a roost's block into the atlas: arrays (rows along the depth, columns along s) into the named channels
    F = FACADES[f]
    c0, r0, nr, nc = blk_["c0"], blk_["r0"], blk_["rows"], blk_["cols"]
    s0 = F.s0 + c0 * RES + 0.25 * RES; s1 = F.s0 + (c0 + nc) * RES - 0.25 * RES
    z0 = ATLAS.z0 + r0 * RES + 0.25 * RES; z1 = ATLAS.z0 + (r0 + nr) * RES - 0.25 * RES
    for ch, v in chans.items():
        ctx.paint(mark, v, s0, s1, z0, z1, channel=ch, op="max")


# ---------------------------------------------------------------------------------------------------- the drips
def drip_counts(n):
    """How many drips each of the building's n roosts carries, in the order they were chosen: DRIP_COUNTS shuffled (the
    key "drip counts"), so a roost carries each count as likely as another and no two roosts carry the same."""
    assert n <= len(DRIP_COUNTS), f"{NAME}: more roosts than drip counts to share out"
    u = draw("drip counts", len(DRIP_COUNTS))
    order = sorted(range(len(DRIP_COUNTS)), key=lambda k: (u[k], k))
    return [DRIP_COUNTS[order[i]] for i in range(n)]


def lay_drips(sc, r, fp, dlist):
    """Each of a roost's drips traced down the face under its lip (trace_drip) from the first of its drawn places along
    the edge where the lip starts a path, and composed there (drip_shapes); one that starts nowhere is lost. Returns the
    laid drips, dict(dr, s, x, z_top, d_edge, path, shapes, info, lip): lip is the head's part on the top, a splat among
    the droppings as wide as the head, reaching the edge."""
    F = FACADES[r["facade"]]; lg = r["site"]["ledge"]
    out = []
    for dr in dlist:
        for x in dr["xs"]:
            s = fp.s_of(x); be = fp.at(s)
            if be is None: continue
            z_top = float(lg["zedge"][col_of(r["facade"], s)])
            path = trace_drip(sc, F, s, z_top, be[1], dr["run"], dr["cling"])
            if path is not None: break
        else:
            continue
        shapes, info = drip_shapes(dr, s, path)
        lip = ("splat", s + dr["lip_off"] * dr["head_w"], be[1] - dr["lip_d"], 0.9 * dr["head_w"], dr["lip_d"], 0.0,
               0.9 * dr["v"], dr["age"])
        out.append(dict(dr=dr, s=s, x=x, z_top=z_top, d_edge=be[1], path=path, shapes=shapes, info=info, lip=lip))
    return out


def drip_shapes(dr, s0, path):
    """A drip's shapes on the face under its lip, in (s, t), t down the surface along its path from the lip: its head
    (the dropping that went over the lip, wider than the run, a lobe or two off it); its paste's run, a chain of round
    segments whose half-width flares out of the head and thins as (t / run) ** taper, necks, swells where the paste
    paused (its slugs), thins over a convex arris and gathers in a concave one, and whose axis leans, bends and slips
    sideways at each arris; and its end: a pendant where the paste hangs off an underside it cannot hold to or where the
    surface under it ends, a bulb where it stopped on its own, or the liquid's thin tail, broken into dashes and ending
    in a droplet, which runs on where the paste could not. The shapes: ("ell", s, t, a, b, turn, deposit, outlined),
    ("seg", s0, t0, s1, t1, r0, r1, v0, v1, outlined), ("chain", S, T, W, V, outlined). Returns them and what the drip
    came to: its paste's run, how the paste ended, its tail's length, its furthest t."""
    v = dr["v"]
    t_end = float(path["t"][-1])
    run_p = min(dr["paste"] * dr["run"], t_end)
    how = "own"                                                     # the paste stopped on its own
    if path["hang"] is not None and path["hang"] < run_p:
        run_p, how = float(path["hang"]), "hung"                    # it hung off an underside it could not hold to
    elif run_p >= t_end - 1e-6 and path["why"] in ("edge", "caught", "surface"):
        how = path["why"]                                           # the surface under it ended first
    arr = []
    for k, (ta, _, sign) in enumerate(path["arrises"]):
        if ta <= dr["head_at"] + dr["head_h"]: continue            # the lip's own, under the head
        u = draw(f"{dr['key']}:arris:{k}", 5)
        arr.append((ta, (1.0 if u[0] < 0.5 else -1.0) * mid(ARRIS_SHIFT, u[1], u[2]),
                    mid(ARRIS_NECK if sign > 0 else ARRIS_POOL, u[3], u[4])))

    def axis(t):
        # its lean, its bends (each a smooth step sideways) and its slips at the arrises
        t = np.asarray(t, np.float64)
        a = s0 + dr["lean"] * t
        for at, amp, ln in dr["bends"]: a = a + amp * smooth(at * run_p - ln, at * run_p + ln, t)
        for ta, sh, _ in arr: a = a + sh * np.where(t > ta, 1.0 - np.exp(-np.clip(t - ta, 0.0, None) / ARRIS_E), 0.0)
        return a

    def width(t):
        # the paste's half-width at t, and what its neck, slugs and the arrises make of it (which its deposit follows)
        t = np.asarray(t, np.float64)
        m = np.ones_like(t)
        if dr["neck"] is not None:
            at, deep, ln = dr["neck"]
            m = m * (1.0 - (1.0 - deep) * np.exp(-((t - at * run_p) / ln) ** 2))
        for at, wide, ln in dr["slugs"]: m = m * (1.0 + (wide - 1.0) * np.exp(-((t - at * run_p) / ln) ** 2))
        for ta, _, fac in arr: m = m * (1.0 + (fac - 1.0) * np.exp(-((t - ta) / ARRIS_E) ** 2))
        x = np.clip(t / max(run_p, 1e-6), 0.0, 1.0)
        flare = 1.0 + dr["flare"] * np.exp(-np.clip(t - dr["head_at"], 0.0, None) / FLARE_E)
        return dr["w0"] * (1.0 - (1.0 - dr["thin"]) * x ** dr["taper"]) * flare * m, m

    hw, hh = dr["head_w"], dr["head_h"]
    shapes = [("ell", s0, dr["head_at"], hw, hh, dr["head_tilt"], 0.95 * v, True)]
    for size, dist, th, asp in dr["lobes"]:
        shapes.append(("ell", s0 + dist * hw * math.sin(th), max(dr["head_at"] + dist * hh * math.cos(th), 0.0),
                       size * hw, asp * size * hw, th, 0.80 * v, True))
    for rs, dist, ph in dr["spatter"]:
        shapes.append(("ell", s0 + dist * hw * math.sin(ph), max(dr["head_at"] + dist * hh * math.cos(ph), 0.0),
                       rs, rs, 0.0, 0.70 * v, True))
    reach = dr["head_at"] + dr["head_h"]
    if run_p > dr["head_at"] + DRIP_SEG:
        tt = np.append(np.arange(dr["head_at"], run_p, DRIP_SEG), run_p)
        ww, mm = width(tt)
        vv = v * (BODY_V[0] + (BODY_V[1] - BODY_V[0]) * np.clip(tt / run_p, 0.0, 1.0)) * np.sqrt(mm)
        shapes.append(("chain", axis(tt), tt, ww, vv, True))
        reach = max(reach, run_p)
    w_end = float(width(np.array([run_p]))[0][0]); s_end = float(axis(run_p))
    if how != "own":                                                # a pendant where it hangs off or the surface ends
        rp = max(BULB_MIN, dr["pendant"] * w_end)
        shapes.append(("ell", s_end, run_p - 0.35 * rp, rp, 1.2 * rp, 0.0, 0.95 * v, True))
        reach = max(reach, run_p + 0.85 * rp)
    elif dr["end"] == "bulb":                                       # a bulb where it stopped on its own
        rb = max(BULB_MIN, dr["bulb_r"] * w_end)
        shapes.append(("ell", s_end, run_p - 0.6 * rb * dr["bulb_long"], rb, rb * dr["bulb_long"], 0.0, 0.90 * v, True))
        reach = max(reach, run_p + 0.4 * rb * dr["bulb_long"])
    t_tail = min(dr["run"], t_end)                                  # the liquid runs on where the paste could not
    tail = 0.0
    if dr["end"] == "tail" and t_tail - run_p > 2.0 * dr["droplet"]:
        u = draw(dr["key"] + ":tail", 16)
        n, tv, tw, rd = dr["dashes"], dr["tail_v"] * v, dr["tail_w"], dr["droplet"]
        lens = [0.5 + u[i] for i in range(n)]
        gaps = [mid(TAIL_GAP, u[8 + i], u[4 + i]) * lens[i] for i in range(n - 1)] + [0.0]
        k = (t_tail - run_p - 2.0 * rd) / (sum(lens) + sum(gaps))
        t = run_p
        for i in range(n):
            t1 = t + lens[i] * k
            p0, p1 = (t - run_p) / (t_tail - run_p), (t1 - run_p) / (t_tail - run_p)
            shapes.append(("seg", float(axis(t)), t, float(axis(t1)), t1, tw * (1.0 - 0.3 * p0), tw * (1.0 - 0.3 * p1),
                           tv * (1.0 - 0.4 * p0), tv * (1.0 - 0.4 * p1), False))
            t = t1 + gaps[i] * k
        shapes.append(("ell", float(axis(t_tail - rd)), t_tail - rd, rd, 1.15 * rd, 0.0, 1.6 * tv, False))
        tail = t_tail - run_p
        reach = max(reach, t_tail + 0.15 * rd)
    return shapes, dict(paste=round(run_p, 4), how=how, tail=round(tail, 4), reach=round(reach, 4))


def enc_sdf(x):
    # a signed distance as the outline's code: 0.5 on the edge, rising inside, over +-SDF_SPAN
    return np.clip(0.5 - 0.5 * np.nan_to_num(x, posinf=1e3) / SDF_SPAN, 0.0, 1.0)


def _ellipse(X, Y, s, t, a, b, ang):
    # an ellipse's signed distance (to first order: (q - 1) / |grad q|) and its dome 1 - q^2, over X, Y
    ca, sa = math.cos(ang), math.sin(ang)
    x, y = (X - s) * ca + (Y - t) * sa, -(X - s) * sa + (Y - t) * ca
    q = np.maximum(np.sqrt((x / a) ** 2 + (y / b) ** 2), 1e-9)
    grad = np.maximum(np.sqrt((x / (a * a)) ** 2 + (y / (b * b)) ** 2), 1e-9 / max(a, b))
    return (q - 1.0) * q / grad, np.clip(1.0 - q * q, 0.0, None)


def _segment(X, Y, s0, t0, s1, t1, r0, r1):
    # a round segment's signed distance, its dome and where along it (0 .. 1) each point lies, over X, Y
    vx, vy = s1 - s0, t1 - t0; L2 = max(vx * vx + vy * vy, 1e-12)
    u = np.clip(((X - s0) * vx + (Y - t0) * vy) / L2, 0.0, 1.0)
    dist = np.sqrt((X - s0 - u * vx) ** 2 + (Y - t0 - u * vy) ** 2)
    r = r0 + (r1 - r0) * u
    return dist - r, np.clip(1.0 - (dist / r) ** 2, 0.0, None), u


def z_along(path, t):
    # the height at t along a drip's path; past its end, on down at its last slope
    p_t, p_z = path["t"], path["z"]
    j = max(0, len(p_t) - 6)
    slope = max(1.0, (p_t[-1] - p_t[j]) / max(p_z[j] - p_z[-1], 1e-6)) if len(p_t) > 1 else 1.0
    t = np.asarray(t, np.float64)
    return np.where(t > p_t[-1], p_z[-1] - (t - p_t[-1]) / slope, np.interp(t, p_t, p_z))


def t_along(path, z):
    # the t at which a drip's path passes a height: over its lip, on up the arris; under its end, at its last slope
    p_t, p_z = path["t"], path["z"]
    j = max(0, len(p_t) - 6)
    slope = max(1.0, (p_t[-1] - p_t[j]) / max(p_z[j] - p_z[-1], 1e-6)) if len(p_t) > 1 else 1.0
    z = np.asarray(z, np.float64)
    t = np.interp(z, p_z[::-1], p_t[::-1])
    t = np.where(z > p_z[0], -(z - p_z[0]), t)
    return np.where(z < p_z[-1], p_t[-1] + (p_z[-1] - z) * slope, t)


def extent_of(shapes):
    # a drip's shapes' extent in (s, t)
    s0 = t0 = np.inf; s1 = t1 = -np.inf
    for sh in shapes:
        if sh[0] == "ell":
            r = max(sh[3], sh[4]); s0, s1 = min(s0, sh[1] - r), max(s1, sh[1] + r); t0, t1 = min(t0, sh[2] - r), max(t1, sh[2] + r)
        elif sh[0] == "seg":
            r = max(sh[5], sh[6])
            s0, s1 = min(s0, sh[1] - r, sh[3] - r), max(s1, sh[1] + r, sh[3] + r)
            t0, t1 = min(t0, sh[2] - r, sh[4] - r), max(t1, sh[2] + r, sh[4] + r)
        else:
            S, T, W = sh[1], sh[2], sh[3]
            s0, s1 = min(s0, float((S - W).min())), max(s1, float((S + W).max()))
            t0, t1 = min(t0, float((T - W).min())), max(t1, float((T + W).max()))
    return s0, s1, t0, t1


def raster_curtain(laid, grid, halo_e):
    """The drips on a roost's curtain block: grid = (s_lo, z_lo, tau, rows, cols), rows up the face. A drip's shapes lie
    in (s, t), t down the surface along its own path, so a texel (s, z) is read at the t where its path passes that
    height (t_along): what a drip covers on a moulding's underside is as long as the paste ran there, however little
    height it takes. R the outline of the outlined shapes' union, G their deposit (the sum of their domes built up, 1 -
    exp(-SAT x sum), a chain's segments counted once, with the HALO_D film round it), as a top's; B the depth of the
    surface the drip nearest a texel ran on at that height, over its whole box, so the lookup's filter is exact at an
    edge; A their age, each drip's weighted by its deposit."""
    s_lo, z_lo, tau, nr, nc = grid
    S = s_lo + (np.arange(nc) + 0.5) * tau
    Zc = z_lo + (np.arange(nr) + 0.5) * tau
    sdf = np.full((nr, nc), np.inf); acc = np.zeros((nr, nc)); aged = np.zeros((nr, nc))
    near = np.full((nr, nc), np.inf); depth = np.full((nr, nc), np.nan)
    for dl in laid:
        p = dl["path"]
        es0, es1, _, et1 = extent_of(dl["shapes"])
        c0 = max(0, int(math.floor((es0 - CURTAIN_PAD[0] - s_lo) / tau)))
        c1 = min(nc, int(math.ceil((es1 + CURTAIN_PAD[0] - s_lo) / tau)))
        r0 = max(0, int(math.floor((float(z_along(p, et1)) - CURTAIN_PAD[1] - z_lo) / tau)))
        Zb = Zc[r0:]
        X = S[c0:c1][None, :]; Y = t_along(p, Zb)[:, None]
        shape = (len(Zb), c1 - c0)
        d_out = np.full(shape, np.inf); d_all = np.full(shape, np.inf); dep = np.zeros(shape)
        for sh in dl["shapes"]:
            if sh[0] == "ell":
                e, h = _ellipse(X, Y, *sh[1:6]); h = sh[6] * h; out = sh[7]
            elif sh[0] == "seg":
                e, h, u = _segment(X, Y, *sh[1:7]); h = (sh[7] + (sh[8] - sh[7]) * u) * h; out = sh[9]
            else:
                Sc, Tc, Wc, Vc, out = sh[1:]
                e = np.full(shape, np.inf); h = np.zeros(shape)
                for i in range(len(Tc) - 1):
                    ei, hi, u = _segment(X, Y, Sc[i], Tc[i], Sc[i + 1], Tc[i + 1], Wc[i], Wc[i + 1])
                    e = np.minimum(e, ei); h = np.maximum(h, (Vc[i] + (Vc[i + 1] - Vc[i]) * u) * hi)
            d_all = np.minimum(d_all, e)
            if out: d_out = np.minimum(d_out, e)
            dep += h
        sdf[r0:, c0:c1] = np.minimum(sdf[r0:, c0:c1], d_out)
        acc[r0:, c0:c1] += dep; aged[r0:, c0:c1] += dep * dl["dr"]["age"]
        take = d_all < near[r0:, c0:c1]
        near[r0:, c0:c1] = np.where(take, d_all, near[r0:, c0:c1])
        depth[r0:, c0:c1] = np.where(take, np.interp(Zb, p["z"][::-1], p["d"][::-1])[:, None], depth[r0:, c0:c1])
    T0 = 1.0 - np.exp(-SAT * acc)
    halo = HALO_D * gblur(T0, halo_e / tau)
    T = 1.0 - (1.0 - T0) * (1.0 - halo)
    mean = float(aged.sum() / max(acc.sum(), 1e-9))
    age = (aged + AGE_EPS * mean) / (acc + AGE_EPS)
    O = enc_sdf(sdf)
    B = np.where(np.isfinite(depth), enc_d(np.nan_to_num(depth, nan=D_LO)), 0.0)
    return O, np.clip(T, 0.0, 1.0), B, np.where((T > 0.0) | (O > 0.0), np.clip(age, 0.0, 1.0), 0.0)


def curtain_of(f, s_lo, s_hi, z_lo, z_hi, taken):
    """Where a roost's curtain block lies in the atlas and at what scale: the face under its edge, s_lo .. s_hi by z_lo ..
    z_hi, at TAU_C a texel, coarser only where it does not fit the free rows under Z_DRIP or its face's region beside the
    blocks already there (`taken`, the region's s used so far). Returns dict(s_lo, z_lo, tau, rows, cols, c0, r0)."""
    F = FACADES[f]
    rows_cap = int((Z_DRIP - BLOCK_Z0 - 0.10) / RES) - 2 * BLOCK_PAD
    c0 = int(round((BLOCK_S0 + taken) / RES))
    cols_cap = int(F.width / RES) - c0 - int(round(BLOCK_S0 / RES)) - 2 * BLOCK_PAD
    tau = max(TAU_C, (z_hi - z_lo) / rows_cap, (s_hi - s_lo) / cols_cap)
    nr = int(math.ceil((z_hi - z_lo) / tau)); nc = int(math.ceil((s_hi - s_lo) / tau))
    return dict(s_lo=s_lo, z_lo=z_lo, tau=tau, rows=nr, cols=nc, c0=c0 + BLOCK_PAD,
                r0=int(round(BLOCK_Z0 / RES)) + BLOCK_PAD)


def coarse(f, cb, T):
    """A curtain's deposit pooled (max) into the atlas's own 2 cm texels of face f, for the layer's elevation images and
    the published field: (the first row, the face-local columns, the array)."""
    S = cb["s_lo"] + (np.arange(cb["cols"]) + 0.5) * cb["tau"]
    Zc = cb["z_lo"] + (np.arange(cb["rows"]) + 0.5) * cb["tau"]
    cc = np.floor((S - FACADES[f].s0) / RES).astype(np.int64); rr = np.floor((Zc - ATLAS.z0) / RES).astype(np.int64)
    out = np.zeros((int(rr.max() - rr.min()) + 1, int(cc.max() - cc.min()) + 1))
    np.maximum.at(out, (np.broadcast_to((rr - rr.min())[:, None], T.shape),
                        np.broadcast_to((cc - cc.min())[None, :], T.shape)), T)
    return int(rr.min()), np.arange(int(cc.min()), int(cc.max()) + 1), out


def on_faces(cv):
    # each drip's deposit at 2 cm (R) above Z_DRIP; the rows under it hold the blocks
    m = cv[:, :, 0].copy()
    m[:int(math.floor((Z_DRIP - ATLAS.z0) / RES))] = 0.0
    return m


def elevation(cv):
    """The marks on the faces, for the layer's elevation images: each drip's deposit (on_faces), grown by a texel to
    either side, so the elevations' 5 cm grid does not fall between a centimetre-wide drip's texels."""
    m = on_faces(cv); g = m.copy()
    g[:, 1:] = np.maximum(g[:, 1:], m[:, :-1]); g[:, :-1] = np.maximum(g[:, :-1], m[:, 1:])
    return g


def paint_rows(ctx, mark, f, r_lo, cols, chans):
    """Paint arrays over rows r_lo.. (row 0 of each array = r_lo, the lowest) and the given face-local columns (a
    contiguous run) into the named channels, with max."""
    F = FACADES[f]
    c_lo, c_hi = int(cols[0]), int(cols[-1])
    nr = next(iter(chans.values())).shape[0]
    s0 = F.s0 + c_lo * RES + 0.25 * RES; s1 = F.s0 + (c_hi + 1) * RES - 0.25 * RES
    z0 = ATLAS.z0 + r_lo * RES + 0.25 * RES; z1 = ATLAS.z0 + (r_lo + nr) * RES - 0.25 * RES
    for ch, v in chans.items():
        ctx.paint(mark, v, s0, s1, z0, z1, channel=ch, op="max")


# ---------------------------------------------------------------------------------------------------- the build
def back_line(fp, z):
    # a roost's stretch for the debug view: a line along its back edge, MARK_UP over the top, where it hides none of the
    # deposit; kept where the back's depth changes
    F = FACADES[fp.f]
    pts, n = [], len(fp.back)
    for i in range(n):
        if i in (0, n - 1) or abs(fp.back[i] - fp.back[i - 1]) > 0.01 or abs(fp.back[i + 1] - fp.back[i]) > 0.01:
            s = float(s_at(fp.f, fp.c_lo + i)) + (-0.5 * RES if i == 0 else 0.5 * RES if i == n - 1 else 0.0)
            pts.append(F.world(s, float(fp.back[i]) + 0.03, z + MARK_UP))
    return pts if len(pts) > 1 else pts * 2


def build(ctx):
    import time
    from collections import Counter
    t0 = time.time()
    blk = ctx.block
    sites, info = find_sites(ctx)
    t1 = time.time()
    for st in sites:
        F = FACADES[st["facade"]]
        st["family"] = family_of(st)
        st["id"] = f"{st['kind']}:{F.name}:{float(st['s'][0]) - 0.5 * RES:.2f}:{float(np.median(st['z'])):.2f}"
    cands = candidates(sites)
    front_s, portal = portal_axis(blk, FRONT)
    chosen, n_drawn = choose(cands, front_s)
    sc = Scan(blk)
    n_drips = drip_counts(len(chosen))
    taken, roosts, drips = {}, [], []
    for r, nd in zip(chosen, n_drips):
        f = r["facade"]; F = FACADES[f]
        cols, sg = stretch(r)
        fp = Footprint(r, cols, sg)
        bird, shapes, cores, dlist, counts = compose(r, fp, nd)
        # its drips, each traced down the face under its lip; their heads' parts on the top lie among the droppings
        laid = lay_drips(sc, r, fp, dlist)
        shapes = shapes + [dl["lip"] for dl in laid]
        bl = block_of(fp, taken.get(f, 0.0))
        taken[f] = taken.get(f, 0.0) + (bl["cols"] + 2 * BLOCK_PAD) * RES + BLOCK_S0
        O, T, K, A = raster(shapes, cores, (bl["s_lo"], bl["d_lo"], bl["tau"], bl["rows"], bl["cols"]), bird["halo_e"])
        z_mid = 0.5 * (fp.zlo + fp.zhi)
        src = ctx.source("site:" + r["id"], "line", back_line(fp, z_mid), facade=f, what=r["family"],
                         site_kind=r["kind"], p=r["p"], rule=r["rule"])
        pt = ctx.source("roost:" + r["id"], "point",
                        [F.world(fp.s_of(bird["pile"]["x"]), float(bird["pile"]["d"]), z_mid + ROOST_UP)],
                        facade=f, what="roost", tuck=r["tuck"])
        mk = ctx.mark(src, f, what="deposit", family=r["family"])
        paint_block(ctx, mk, f, bl, {0: O, 1: T, 2: K, 3: A})
        curtain, mine = None, []
        if laid:
            # the face under its edge, as far as its drips reach: the curtain block, and their deposit at 2 cm on the
            # facade's own rows for the elevation images; the debug view marks where each drip stops
            ext = [extent_of(dl["shapes"]) for dl in laid]
            z_lo = min(float(z_along(dl["path"], e[3])) for dl, e in zip(laid, ext)) - CURTAIN_PAD[1]
            cb = curtain_of(f, min(e[0] for e in ext) - CURTAIN_PAD[0], max(e[1] for e in ext) + CURTAIN_PAD[0], z_lo,
                            max(dl["z_top"] for dl in laid) + CURTAIN_UP, taken.get(f, 0.0))
            taken[f] = taken.get(f, 0.0) + (cb["cols"] + 2 * BLOCK_PAD) * RES + BLOCK_S0
            Oc, Tc, Bc, Ac = raster_curtain(laid, (cb["s_lo"], cb["z_lo"], cb["tau"], cb["rows"], cb["cols"]),
                                            bird["drip_halo"])
            dm = ctx.mark(pt, f, what="drips", roost=r["id"], n=len(laid))
            paint_block(ctx, dm, f, cb, {0: Oc, 1: Tc, 2: Bc, 3: Ac})
            r_lo, ccols, arr = coarse(f, cb, Tc)
            paint_rows(ctx, dm, f, r_lo, ccols, {0: arr})
            for dl in laid:
                dr, p, inf = dl["dr"], dl["path"], dl["info"]
                z_stop = float(z_along(p, inf["reach"]))
                d_stop = float(np.interp(min(inf["reach"], float(p["t"][-1])), p["t"], p["d"]))
                ctx.path(dm, [F.world(dl["s"], d_stop + 0.012, z_stop - 0.02),
                              F.world(dl["s"], d_stop + 0.012, z_stop - 0.08)])
                mine.append(dict(
                    roost=r["id"], facade=f, k=dr["k"], slot=dr["slot"], s=round(dl["s"], 3), z_top=round(dl["z_top"], 3),
                    z_stop=round(z_stop, 3), run=round(dr["run"], 3), paste=inf["paste"], tail=inf["tail"],
                    reach=inf["reach"], end=dr["end"], paste_end=inf["how"], stop=p["why"],
                    hang=None if p["hang"] is None else round(p["hang"], 3), value=round(dr["v"], 3),
                    age=round(dr["age"], 3), w0=round(dr["w0"], 4), head=[round(dr["head_w"], 4), round(dr["head_h"], 4)],
                    lobes=len(dr["lobes"]), spatter=len(dr["spatter"]), slugs=len(dr["slugs"]),
                    bends=[round(b[1], 4) for b in dr["bends"]], cling=round(dr["cling"], 3), lean=round(dr["lean"], 4),
                    neck=None if dr["neck"] is None else [round(x, 4) for x in dr["neck"]],
                    arrises=[[round(a[0], 3), a[1], a[2]] for a in p["arrises"]]))
            curtain = dict(facade=f, s_lo=cb["s_lo"], s_hi=cb["s_lo"] + cb["cols"] * cb["tau"], z_lo=cb["z_lo"],
                           z_hi=cb["z_lo"] + cb["rows"] * cb["tau"], tau=cb["tau"], c0=cb["c0"], r0=cb["r0"],
                           rows=cb["rows"], cols=cb["cols"])
            drips += mine
        roosts.append(dict(
            id=r["id"], site=r["site"]["id"], family=r["family"], kind=r["kind"], facade=f, side=r["side"],
            s=round(r["s"], 3), z=round(r["z"], 3), H=round(r["H"], 2), tuck=r["tuck"], gap=r["gap"], p=r["p"],
            key=round(r["key"], 6), rule=r["rule"], pool=r["pool"], bird=bird, counts=counts, drips=mine,
            stretch=dict(s0=round(fp.s_lo, 3), s1=round(fp.s_hi, 3)),
            deposit=dict(area_cm2=round(float((O > 0.5).sum()) * bl["tau"] ** 2 * 1e4, 1),
                         thick_cm2=round(float(((O > 0.5) & (T > HEAVY[0])).sum()) * bl["tau"] ** 2 * 1e4, 1),
                         film_cm2=round(float((T > THIN[0]).sum()) * bl["tau"] ** 2 * 1e4, 1)),
            # what the shader reads (g.result): the top at z within tol, inside the stretch, reads its block; the face
            # under its edge, inside its curtain's extent, its drips
            top=dict(facade=f, z=round(z_mid, 4), tol=round(0.5 * (fp.zhi - fp.zlo) + TOP_TOL, 4),
                     s_lo=bl["s_lo"], s_hi=fp.s_hi, d_lo=bl["d_lo"], d_hi=bl["d_lo"] + bl["rows"] * bl["tau"],
                     tau=bl["tau"], c0=bl["c0"], r0=bl["r0"], rows=bl["rows"], cols=bl["cols"]),
            curtain=curtain))
    blocks = [t["top"] for t in roosts] + [t["curtain"] for t in roosts if t["curtain"]]
    assert all(b["r0"] + b["rows"] + BLOCK_PAD < int(Z_DRIP / RES) - 1 for b in blocks), \
        f"{NAME}: a block reaches the drips' rows"
    assert all(b["c0"] + b["cols"] + BLOCK_PAD <= int(round(FACADES[b["facade"]].width / RES)) for b in blocks), \
        f"{NAME}: a block runs out of its face's region"
    assert all(x["z_stop"] > Z_DRIP + 0.1 for x in drips), f"{NAME}: a drip runs down into the blocks' rows"
    publish(ctx, sites, cands, roosts, drips)
    # the build's account
    fam = Counter(c["family"] for c in cands)
    ctx.log(f"   pigeon: {len(sites)} perch sites ({info['unused']} ledges too narrow or low to use) found with "
            f"{info['rays']} rays in {t1 - t0:.1f} s; {len(cands)} candidate corners ("
            + ", ".join(f"{k} {v}" for k, v in sorted(fam.items(), key=lambda kv: -kv[1])) + ")")
    ctx.log(f"   pigeon: the building holds {n_drawn} roosts; the Broadway portal ({portal}) at s {front_s:.2f}; their "
            f"drips {', '.join(str(n) for n in n_drips)}")
    for t in roosts:
        b, c = t["bird"], t["counts"]
        ctx.log(f"   pigeon roost {t['id']:<18} {t['family']:<22} H {t['H']:5.2f} p {t['p']:.2f} key {t['key']:.4f} "
                f"({t['rule']}, of {t['pool']}): pile at {b['pile']['x']:+.2f} m, perch {b['perch']['x']:+.2f} m, "
                f"{b['share']:.0%} piled; {b['drops']} droppings ({c['pile']} piled, {c['perch']} at the perch, "
                f"{c['smears']} smears, {c['lobes']} lobes, {c['satellites']} satellites, {c['cores']} cores, "
                f"{c['strays']} strays, "
                f"{c['lost']} lost), {t['deposit']['area_cm2']:.0f} cm2 ({t['deposit']['thick_cm2']:.0f} thick, "
                f"{t['deposit']['film_cm2']:.0f} with the film); block {t['top']['cols']} x {t['top']['rows']} at "
                f"{t['top']['tau'] * 1000:.1f} mm")
        cu = t["curtain"]
        ctx.log(f"   pigeon   {len(t['drips'])} drips of {b['drips']}, spread {b['drip_spread'] * 100:.1f} cm"
                + (f", curtain {cu['cols']} x {cu['rows']} at {cu['tau'] * 1000:.1f} mm" if cu else ""))
        for x in t["drips"]:
            ctx.log(f"   pigeon   drip at s {x['s']:.3f}: run {x['run'] * 100:4.1f} cm ({x['end']}), paste "
                    f"{x['paste'] * 100:4.1f} cm ({x['paste_end']}), tail {x['tail'] * 100:4.1f} cm, reaches "
                    f"{x['reach'] * 100:4.1f} cm to z {x['z_stop']:.3f}; path stops ({x['stop']}), hang "
                    f"{'-' if x['hang'] is None else format(x['hang'] * 100, '.1f')}, cling {x['cling']:.2f}, "
                    f"value {x['value']:.2f}, age {x['age']:.2f}, w {x['w0'] * 1000:.1f} mm, head "
                    f"{x['head'][0] * 1000:.1f} x {x['head'][1] * 1000:.1f} mm, {x['lobes']} lobes, {x['spatter']} "
                    f"spatters, neck {'-' if x['neck'] is None else format(x['neck'][1], '.2f')}, {x['slugs']} slugs, "
                    f"{len(x['bends'])} bends, {len(x['arrises'])} arrises")
    ctx.log(f"   pigeon: {time.time() - t0:.1f} s in all, {sc.rays} rays for the drips' paths")


def publish(ctx, sites, cands, roosts, drips):
    """What a feature that NEEDS pigeon would read (none does); see the README for the formats."""
    out_sites = []
    for st in sites:
        out_sites.append(dict(
            id=st["id"], kind=st["kind"], family=st["family"], facade=st["facade"],
            s0=round(float(st["s"][0]) - 0.5 * RES, 3), s1=round(float(st["s"][-1]) + 0.5 * RES, 3),
            z=round(float(np.median(st["z"])), 3), H=round(st["H"], 2), depth=round(float(np.median(st["depth"])), 3),
            edge=round(float(np.median(st["edge"])), 3), back=round(float(np.median(st["back"])), 3), open=st["open"],
            protection=round(float(np.median(st["prot"])), 3), use=round(float(np.median(st["use"])), 3),
            use_max=round(float(st["use"].max()), 3), ends=st["ends"], top=st["top"], behind=st["behind"]))
    chosen = {t["id"] for t in roosts}
    out_c = [dict(id=c["id"], site=c["site"]["id"], family=c["family"], facade=c["facade"], side=c["side"], s=round(c["s"], 3),
                  z=round(c["z"], 3), H=round(c["H"], 2), tuck=c["tuck"], gap=c["gap"], p=c["p"], key=round(c["key"], 6),
                  chosen=c["id"] in chosen) for c in cands]
    ctx.publish("sites", out_sites); ctx.publish("candidates", out_c)
    ctx.publish("roosts", roosts); ctx.publish("drips", drips)
    cv = on_faces(ctx.canvas)
    H2, W2 = cv.shape[0] // 2, cv.shape[1] // 2
    ctx.publish("field", dict(res=2 * RES, z0=ATLAS.z0, data=cv[:H2 * 2, :W2 * 2].reshape(H2, 2, W2, 2).max(axis=(1, 3))
                              .astype(np.float16), atlas=ATLAS.to_dict(), note=(
        "the droppings on the faces under the roosts (0..1, a drip's deposit), max-pooled to 4 cm, rows from z0 up; the "
        "tops' deposit lies in each roost's block (roosts[i].top), the drips' own in its curtain block "
        "(roosts[i].curtain)")))
    ctx.publish("profile", dict(p_min=P_MIN, count_p3=COUNT_P3, front=FRONT, front_reach=FRONT_REACH, front_h=FRONT_H,
                                storey=STOREY, drops=DROPS, size=SIZE, drip_counts=DRIP_COUNTS, drip_spread=DRIP_SPREAD,
                                drip_l=DRIP_L, cling=CLING, tau=TAU, tau_c=TAU_C, note=(
        "p = the site's use at the corner x smooth(TUCK, tuck); key = u ** (1 / p), u = draw('roost:' + id); three roosts "
        "or two (COUNT_P3): the first the best key on FRONT within FRONT_REACH of its portal and under FRONT_H, each next "
        "the best key differing from every chosen one in family, face and by STOREY in height; the roosts' drip counts "
        "DRIP_COUNTS shuffled (draw('drip counts')); each roost's deposit and drips drawn from keys under its id "
        "(compose), each drip traced down the face under its lip (trace_drip) and composed on its path (drip_shapes)")))


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    import bpy
    img = bpy.data.images.get("WEAR_mask_" + NAME)
    assert img is not None, f"{NAME}: its mask image is not in the node library"
    res = g.result
    assert res is not None and "roosts" in res.fields, f"{NAME}: the shader reads its build's roosts (g.result)"
    st = g.i("Strength")
    masonry = g.is_class(*classes.MASONRY)
    joint = g.clamp(g.i("Joint"))
    up = g.upward(0.85, 0.95)
    # ---- the tops: each roost's block, read where its top is (its face, its height within tol, inside its stretch) at
    # the block's own scale: s and d unrolled, a texel tau
    U = V = W = None
    for t in res.fields["roosts"]:
        tp = t["top"]; F = FACADES[tp["facade"]]
        dz = g.absf(g.sub(g.i("Z"), tp["z"]))
        inside = g.mul(g.mul(g.eq(g.i("Facade"), float(tp["facade"])), g.lt(dz, tp["tol"] + 0.003)),
                       g.mul(g.mul(g.gt(g.i("S"), tp["s_lo"]), g.lt(g.i("S"), tp["s_hi"])),
                             g.mul(g.gt(g.i("D"), tp["d_lo"]), g.lt(g.i("D"), tp["d_hi"]))))
        k = RES / tp["tau"]
        uu = g.div(g.add(F.off + tp["c0"] * RES, g.mul(g.sub(g.i("S"), tp["s_lo"]), k)), ATLAS.width)
        vv = g.div(g.add(tp["r0"] * RES, g.mul(g.sub(g.i("D"), tp["d_lo"]), k)), ATLAS.height)
        w = g.mul(inside, g.one_minus(g.smooth(tp["tol"], tp["tol"] + 0.003, dz)))
        U = g.mul(inside, uu) if U is None else g.add(U, g.mul(inside, uu))
        V = g.mul(inside, vv) if V is None else g.add(V, g.mul(inside, vv))
        W = w if W is None else g.add(W, w)
    if U is None: U, V, W = 0.0, 0.0, 0.0
    col_t, age = g.image(img, g.vec(U, V, 0.0))
    O, T, K = g.sep(col_t)                          # the droppings' outline, their deposit, the cores' outline; their age
    tops = g.mul(g.clamp(W), g.mul(up, masonry))
    within = g.mul(g.smooth(0.5 - EDGE_W, 0.5 + EDGE_W, O), tops)              # inside a dropping: its edge crisp
    film = g.mul(g.mul(g.smooth(THIN[0], THIN[1], T), tops), g.one_minus(within))    # the film round the droppings,
    film = g.clamp(g.mul(film, g.add(1.0, g.mul(joint, JOINT_FILM))))                # held longer in a brick top's joints
    # ---- the faces under the edges: each roost's drips, from its curtain block (the face under its edge unrolled in
    # (s, z), a texel tau), read inside the curtain's extent on every masonry surface there but a top -- the lip's
    # arris, a fascia, a moulding's underside, the next member -- that stands where the drips ran (the depth it holds)
    U = V = W = None
    for t in res.fields["roosts"]:
        cp = t.get("curtain")
        if cp is None: continue
        F = FACADES[cp["facade"]]
        inside = g.mul(g.mul(g.eq(g.i("Facade"), float(cp["facade"])),
                             g.mul(g.gt(g.i("S"), cp["s_lo"]), g.lt(g.i("S"), cp["s_hi"]))),
                       g.mul(g.gt(g.i("Z"), cp["z_lo"]), g.lt(g.i("Z"), cp["z_hi"])))
        k = RES / cp["tau"]
        uu = g.div(g.add(F.off + cp["c0"] * RES, g.mul(g.sub(g.i("S"), cp["s_lo"]), k)), ATLAS.width)
        vv = g.div(g.add(cp["r0"] * RES, g.mul(g.sub(g.i("Z"), cp["z_lo"]), k)), ATLAS.height)
        U = g.mul(inside, uu) if U is None else g.add(U, g.mul(inside, uu))
        V = g.mul(inside, vv) if V is None else g.add(V, g.mul(inside, vv))
        W = inside if W is None else g.add(W, inside)
    if U is None: U, V, W = 0.0, 0.0, 0.0
    col_c, age_c = g.image(img, g.vec(U, V, 0.0))
    Oc, Tc, Bc = g.sep(col_c)                       # the drips' outline, their deposit, the surface's depth; their age
    face = g.mul(g.clamp(W), g.mul(masonry, g.one_minus(up)))
    here = g.one_minus(g.smooth(0.015, 0.03, g.absf(g.sub(g.i("D"), g.add(g.mul(Bc, D_SPAN), D_LO)))))
    cur = g.mul(face, here)
    outline_c = g.smooth(0.5 - EDGE_W, 0.5 + EDGE_W, Oc)
    within_c = g.mul(outline_c, cur)                                            # inside a drip: its edge crisp
    thick_c = g.smooth(DRIP_T[0], DRIP_T[1], Tc)
    paste = g.mul(within_c, g.add(DRIP_RIM, g.mul(thick_c, 1.0 - DRIP_RIM)))    # a translucent film where it thins
    film_c = g.mul(g.mul(g.smooth(FILM_T[0], FILM_T[1], Tc), cur), g.one_minus(within_c))    # its tail, the film round it
    # ---- the look. Old droppings are two things: the organic part, a greyish stain that soaks into the surface where
    # the deposit is thin (the film round them too), and the urates, a crust, off-white while fresh and weathering to a
    # grey-beige, whiter where it builds up; a fresh dropping's dark core shows in some. A drip is urates carried over the
    # edge: an off-white crust where it lies thick and young, a chalky grey film where it thins or has weathered. Round
    # the deposit the surface is etched: paler, a little yellowed
    stain_amt = g.mn(g.mul(g.mul(film, STAIN_COVER), st), STAIN_MAX)
    crust_top = g.mul(within, g.add(CRUST_RIM, g.mul(g.smooth(CRUST[0], CRUST[1], T), 1.0 - CRUST_RIM)))
    crust_amt = g.mn(g.mul(g.mul(crust_top, CRUST_COVER), st), COVER_MAX)
    drip_amt = g.mn(g.mul(g.add(g.mul(paste, DRIP_COVER), g.mul(film_c, FILM_D)), st), COVER_MAX)
    core_amt = g.mn(g.mul(g.mul(g.mul(g.smooth(0.5 - EDGE_W, 0.5 + EDGE_W, K), tops), CORE_COVER), st), CORE_COVER)
    etch_top = g.mul(g.mul(g.smooth(ETCH_T[0], ETCH_T[1], T), tops), g.one_minus(within))
    etch_c = g.mul(g.mul(g.smooth(ETCH_T[0], ETCH_T[1], Tc), cur), g.one_minus(within_c))
    etch = g.mn(g.mul(g.mx(etch_top, etch_c), g.mul(st, ETCH)), 1.0)
    col = g.i("Color")
    y = g.lum(col)
    etched = g.mix(g.mix(col, g.rgb(y, y, y), ETCH_GREY, 'RGBA'), g.rgb(*ETCH_TINT), 1.0, 'RGBA', 'MULTIPLY')
    col1 = g.mix(col, etched, etch, 'RGBA')
    col2 = g.mix(col1, g.rgb(*STAIN), stain_amt, 'RGBA')
    fresh = g.clamp(g.add(g.one_minus(g.smooth(TONE[0], TONE[1], age)), g.mul(g.smooth(WHITE[0], WHITE[1], T), BUILD)))
    col3 = g.mix(col2, g.mix(g.rgb(*OLD_COL), g.rgb(*FRESH_COL), fresh, 'RGBA'), crust_amt, 'RGBA')
    fresh_c = g.clamp(g.add(g.one_minus(g.smooth(TONE[0], TONE[1], age_c)), g.mul(g.smooth(WHITE[0], WHITE[1], Tc), BUILD)))
    col4 = g.mix(col3, g.mix(g.rgb(*DUNG), g.rgb(*FRESH_COL), g.mul(fresh_c, thick_c), 'RGBA'), drip_amt, 'RGBA')
    g.o("Color", g.mix(col4, g.rgb(*CORE_COL), core_amt, 'RGBA'))
    rough = g.i("Roughness")
    g.o("Roughness", g.mix(rough, g.mx(rough, MATTE), g.mx(g.mx(g.mx(crust_amt, stain_amt), etch), drip_amt)))
    # the relief: a dropping stands RELIEF proud where it lies thickest, a drip RELIEF_D, on the surface's own normal map
    # (the renderer reads the deposit again at its offsets for the slope), so a crust's rim catches the light and throws
    # a shadow
    bump = g.node('ShaderNodeBump')
    g.set(bump.inputs['Height'], g.add(g.mul(T, within), g.mul(g.mul(Tc, g.mul(outline_c, face)), RELIEF_D / RELIEF)))
    g.set(bump.inputs['Distance'], RELIEF)
    g.set(bump.inputs['Strength'], 1.0)
    g.set(bump.inputs['Normal'], g.i("Normal"))
    g.o("Normal", g.mix(g.i("Normal"), bump.outputs['Normal'], g.clamp(g.mul(g.add(tops, face), st)), 'VECTOR'))
    g.o("Debug", g.clamp(g.mx(g.mx(within, g.mul(g.mul(T, tops), DEBUG_GAIN)),
                              g.mx(within_c, g.mul(g.mul(Tc, cur), DEBUG_GAIN)))))
