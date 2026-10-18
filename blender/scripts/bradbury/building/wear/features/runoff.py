# Runoff streaks below ledges (AI 564): the dark streaks rain draws down an old masonry facade below the places where
# its ledges shed their water. Rain collects on a horizontal projection and leaves it at particular places; on the way
# down the wall it picks up the dirt that settled there and leaves it behind as a streak ("dirt washing"). A projection
# without a proper drip lets its water creep back along its underside to the wall (Blocken & Carmeliet 2013, citing
# Robinson & Baker; Dorsey, Pedersen & Hanrahan 1996 simulated exactly these flow stains).
#
# Every streak has a source on the model and a path from it, both found in the built geometry:
#   SILL ENDS    every window sill (floors 3 and 4, the sill_* objects) sheds from both ends: the rain off the window and
#                the sill's own top gathers where the window strip's jambs meet the sill and runs down that inside
#                corner. In the deep field a sill sits inside its recessed window strip, so the streak hugs the jamb and
#                runs down the recessed spandrel to the head of the window below; on the raised stretches the spandrel
#                is flush with the wall, so the streak falls from the sill's end and straddles it.
#   BRACKETS     the consoles under the band between floors 4 and 5 touch the band and the wall: they carry the band's
#                water down to their feet, and a streak runs on from each foot.
#   CAPITALS     the brick columns' capitals under the band (their abaci reach out past it and take its drips) and the
#                capitals at the top floor's springing (they take what the arch rings shed): a narrow streak from each
#                drip on the foot, the few places the water leaves it by (below).
#   DRIP LINES   a course with no drip sheds along its underside instead, a softer and broader curtain: the crown
#                cornice, the impost course, the band, the ground floor's crown, its string course and, where the string
#                course breaks forward over a portal, the portal's crown moulding.
# The second floor has no sills: its windows stand on the ground floor crown's foot, a continuous ledge 0.4 m deep. Their
# water spreads over it and leaves with the crown's own over the crown's drip line, so the second floor sheds as part of
# that curtain, heavier below each window (glass sheds all the rain it takes) rather than as pairs from sill ends.
#
# THE PATH. Each column of a streak follows the film of water down the elevation (the face as the street sees it, on
# the mask's 2 cm texels, the fire escapes looked through since the film runs on behind them): over a step back of up to
# CREEP (a window strip's 9 cm head is crept round) and a step forward of up to CATCH (a bead is run over), until a
# surface standing further out takes it on its top (the sill, the band or the string course below, an arch ring), an
# edge throws it off (a window head, an opening, a recess deeper than CREEP) or it reaches glass, a frame or metal. So
# no streak continues through an opening, and none lies on glass or metal (the shader also keys on the material class).
#
# STRENGTH AND LENGTH follow the water the source collects: a sill's own length (its window sheds onto it) and its
# height (wind-driven rain hits a facade hardest at its top edge); how far a course stands out over the wall it sheds
# onto, less what drips clear of a deep soffit instead of creeping back to the wall (the band's 0.245 m soffit sheds most
# of its water clear, so its brackets carry it); and for the ground floor's crown, the windows that stand on it.
#
# ONE SOURCE AT A TIME (the rework of 2026-09-23). Every sill, bracket and capital on this building is the same shape,
# so the geometry alone sheds the same streak from each: the same mark stamped at every window, down every bracket (user
# 2026-09-23: marks must not repeat identically from one instance to the next). What makes one differ from the next on
# a real front is what the model does not carry -- a sill set a few millimetres out of level, a sound or an open joint
# where it meets the jamb, a window its tenant keeps clean, a band that drips clear over one bracket and not over the
# next -- so each source draws its own share of the water the geometry gives it, seeded from its own name or place (a
# rebuild draws the same values, and a change elsewhere on the model reshuffles nothing), within bounds: most a little
# lighter than the geometry's measure, a few heavier (a failed joint), some next to nothing, and a few nothing at all.
# The water then sets the streak as the geometry did: its value, its e-fold and a sill end's width all go as its square
# root, so a trickle is faint, short and thin and a heavy end long and broad. A sill splits its water between its ends
# by its fall (SILL_SPLIT), so its two ends differ; a bracket's water leaves over part of its foot (EXIT), wherever
# across it the foot sits lowest. The courses whose runs repeat -- the band, bay by bay between its brackets and over
# each pavilion, the impost pier by pier, the portals' mouldings -- draw each run's curtain value and reach, and each
# window on the ground floor's crown its extra water. The crown and the string course run whole along each face: one
# element each, a continuous band rather than a stamp, they keep the geometry's measure.
#
# A CAPITAL'S DRIPS (the critique of 2026-09-25). Shed as a sheet over part of its foot, every capital hung the same
# flat-topped panel on its shaft, full strength across half a metre with straight sides that followed nothing: one
# stamp, repeated on all four streets. The water that runs down a capital's bell does not leave its foot as a sheet: it
# gathers into rivulets, where the bell's sides bring theirs down to the foot's corners and where the front edge happens
# to sit low, and leaves by those. So each capital draws its water (dry often enough that some shafts stay clean, the
# rest one uniform across a wide range, a trace as likely as a heavy stream) and the one to three drips it leaves by,
# each at a corner or anywhere along the front, each with its share of the water; drips nearer than DRIP_GAP are one.
# Each drip sheds a narrow streak of its own, as a bracket's foot does: its value, its e-fold and its width go as the
# root of its own water, it widens as it falls (SPREAD) with the lateral profile, so its edges break on the bed joints
# like every other streak's, and two that widen into each other merge. It keeps to the shaft or the mullion it leaves
# onto: past that face's arris its water does not reach the wall behind. So one shaft carries a clear streak down one
# side, the next two faint ones, the next nothing.
#
# THE LOOK. The mask has two channels, both smooth: R, the deposit a streak leaves (falling with its descent and across
# its width), and A, how far inside its width a point is. On a brick's face the shader cuts the streak off at a crisp
# edge halfway out; along a bed joint and the lip of brick just under it (the layer's Bed signal, from the brick set's
# own height map) it lets the streak reach further, and down its length the joints hold it longer, because water hangs
# at the bed joints and spreads along them and mortar holds the dirt; an ashlar's joints do the same on stone. So the
# ragged edges and the ragged end come from the wall's own courses, and nothing here is noise. It darkens and greys the
# masonry's own colour and keeps it matte; the brick pattern stays under it, its normal map untouched.
#
# PUBLISHED for the features that follow the runoff (566 washes along these paths, 569 blooms below the sill ends and
# where the runoff crosses a trim's edge, 573 erodes the joints along them): `sources`, `streaks`, `drip_lines` and
# `field` (see the README's "Runoff streaks below ledges (AI 564)").
import hashlib, math, re
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS, Z_GROUND, facade_of

NAME = "runoff"
AI = 564
LABEL = "runoff streaks below ledges"
ORDER = 220
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.10, 0.35, 1.00)
MASK = dict(res=0.02, channels=2, bits=16)   # R: the deposit a streak leaves; A: how far inside its width a point is
RES = MASK["res"]

# ---------------------------------------------------------------------------------------------------- the film
CATCH = 0.03            # a surface standing this far out from the film takes it on its top
CREEP = 0.10            # a step back up to this deep is crept round (a window strip's head); a deeper one throws it off
DRIP_MAX = 0.35         # an edge further out than this from the wall below drips clear of it altogether
CREEP_LEN = 0.35        # the share of a course's water that creeps back along a soffit x deep: exp(-x / CREEP_LEN)
SEE_THROUGH = ("attachment_fire_escape",)    # ironwork standing clear of the wall: the film runs on behind it
D_FROM, REACH = 4.0, 12.0                     # the level rays: from this far out, this far
END_ZONE = 0.6          # within this of a face's end a hit counts only if it belongs to the face (the bisector rule)

# ---------------------------------------------------------------------------------------------------- the shape
LEN_CAP = 3.0           # with nothing to catch it, a streak is gone LEN_CAP e-folds below its source
SPREAD = 0.14           # a streak widens this much per metre of descent
LAT_HALF, LAT_P = 0.8, 6.0    # across a streak: 1 / (1 + (x / LAT_HALF) ** LAT_P), x = 1 at its width
LAT_REACH = LAT_HALF * 99.0 ** (1.0 / LAT_P)  # where that profile has fallen to 1%
END_SOFT = 0.04         # a curtain fades in over this much at the ends of its drip line
Z_TOP = 20.732          # the crown's top
EXPO_FOOT = 0.6         # wind-driven rain on a facade: EXPO_FOOT of the top edge's at the pavement, rising linearly

# the sources' water, as mask values (1.0 = the most a streak can take) and e-fold lengths in metres
SILL_REF = 2.735        # the two-window sill's length: the reference for the sills' water
SILL_AMP, SILL_EFOLD, SILL_W0 = 0.85, 0.55, 0.07
BRACKET_AMP, BRACKET_EFOLD = 0.55, 0.45       # the band's water, carried down the bracket
CAPITAL_AMP, CAPITAL_EFOLD = 0.40, 0.60       # the brick columns' capitals under the band
SPRING_AMP, SPRING_EFOLD = 0.40, 0.45         # the capitals at the top floor's springing
# a course standing CURTAIN_REF out over the wall it sheds onto. No height factor here: a course takes what runs down
# the facade above it as well as its own rain, which makes up for the lower courses' lower exposure
CURTAIN_AMP, CURTAIN_EFOLD, CURTAIN_REF = 0.60, 0.50, 0.40
CURTAIN_MAX = 0.80
CURTAIN_EFOLDS = (0.20, 1.00)                 # a curtain's e-fold stays within these
WINDOW_GAIN, WINDOW_SPREAD = (0.15, 1.05), 0.20   # the ground crown: this much more water below each window (drawn per
                                                  # window, 0.6 in the middle), spread this far over the ledge

# ---------------------------------------------------------------------------------------------------- one source at a time
# Each source's share of the water the geometry gives it, drawn from its own seed (the mean of two uniforms where a range
# is given: the middle likelier than the ends). 1.0 is the geometry's measure, the water every source had before
SILL_SPLIT = 0.30       # a sill's fall along its length: its left end takes 0.5 +- up to this of the water its ends take
SILL_FALL = (0.55, 1.15)    # the share of a sill's water that runs along it to its ends rather than off its front
SILL_DIRT = (0.75, 1.10)    # how much dirt that water carries (a window and sill its tenant keeps clean): the value only
SOUND_P = 0.18          # an end's joint with the jamb is sound this often: it lets SOUND_JOINT of the water reaching the
SOUND_JOINT = (0.00, 0.30)  # end into the corner ...
OPEN_JOINT = (0.70, 1.30)   # ... and otherwise this much, an open joint the most
DRY_P = 0.15            # a bracket: the band drips clear over it this often, and it carries DRY ...
DRY = (0.00, 0.30)
WET = (0.50, 1.40)      # ... and otherwise this much
EXIT = (0.55, 1.00)     # the share of a bracket's foot the water leaves over, wherever across the foot
WATER_MIN = 0.06        # a source that sheds less than this sheds no streak at all
K_MAX = 1.30            # and the water's square root is held to this (a failed joint, the heaviest)
RUN_SHARE = (0.70, 1.15)    # a run of the band, the impost or a portal's moulding: its curtain's value times this ...
RUN_STRETCH = (0.80, 1.20)  # ... and its e-fold times this
VARY_RUNS = ("band", "impost", "portal_moulding")
# a capital's drips (critique 2026-09-25): the water that runs down a capital's bell leaves its foot as a few rivulets,
# where the bell's sides bring theirs down to its corners and where its front edge happens to sit low, not as a sheet
# across the whole foot. Each capital draws its water and the drips it leaves by; 1.0 is the geometry's measure
CAP_DRY_P = dict(capital=0.30, springing=0.25)    # a capital sheds nothing this often: what drips onto it falls clear
CAP_WATER = (0.15, 1.60)    # otherwise its water: one uniform across the range, a trace as likely as a heavy stream
DRIPS_P = dict(capital=(0.40, 0.40, 0.20), springing=(0.60, 0.30, 0.10))   # it leaves by 1, 2 or 3 drips this often
CORNER_P = 0.50         # a drip leaves at a corner of the foot this often (a free one); otherwise at a low spot anywhere
                        # along its front edge
DRIP_W0 = 0.07          # a drip's stream is this wide at the foot at water 1, as a sill end's (it goes as the root)
DRIP_GAP = 0.08         # two drips nearer than this along the foot are one rivulet, with both shares

# the courses that shed along a drip line: the member whose underside is the drip line, the members that stand out over
# the wall with it, and the height they span; the string course breaks forward over each portal as its crown moulding
COURSES = (
    ("crown", r"^ge_crown_moulding$", r"^ge_crown_", 19.00, 20.80, None),
    ("impost", r"^impost_course", r"^impost_course", 17.60, 18.10, None),
    ("band", r"^ge_cornice45_bottom$", r"^(ge_cornice45_|ge_band45|ge_teeth45)", 15.55, 16.80, None),
    ("ground_crown", r"^ge_crown$", r"^ge_crown$", 5.80, 6.35, 6.292),      # the second floor's windows stand on it
    ("string_course", r"^ge_cornice$", r"^ge_cornice$", 5.18, 5.45, None),
)
STREAK_SOURCES = r"^(ge_bracket45|ge_capital)"     # what hangs under a course sheds its own streak, not its curtain
KIND_LABEL = dict(sill_end="sill end", bracket="bracket", capital="column capital", springing="springing capital",
                  crown="crown cornice", impost="impost course", band="band 4-5", ground_crown="ground floor crown",
                  string_course="string course", portal_moulding="portal crown moulding")

# ---------------------------------------------------------------------------------------------------- the look
AMOUNT = 0.85           # at strength 1 a mark of 1.0 goes this far toward DIRT; the strength scales it
DIRT_DARK = 0.40        # DIRT keeps this share of the masonry's own colour
DIRT_GREY = 0.55        # after losing this much of its saturation toward its own grey
MATTE = 0.85            # and is at least this rough: a dried deposit, never a wet sheen
JOINT_GAMMA = 0.5       # in a joint a mark reads as v ** JOINT_GAMMA: it holds on further down there
EDGE = (0.40, 0.60)     # on a face a streak's edge runs where its inside-ness passes from EDGE[0] to EDGE[1] ...
EDGE_LIP = 0.35         # ... and along a bed joint and its lip it runs this much further out

STOP_NONE, STOP_CAUGHT, STOP_EDGE, STOP_MATERIAL, STOP_LENGTH = range(5)
STOP_NAMES = ("none", "caught", "edge", "material", "length")
_MASONRY = np.array([c in classes.MASONRY for c in range(len(classes.NAMES))])


def _masonry(c):
    c = np.asarray(c, np.int32)
    return (c >= 0) & _MASONRY[np.clip(c, 0, len(_MASONRY) - 1)]


def exposure(z):
    return EXPO_FOOT + (1.0 - EXPO_FOOT) * min(max((z - Z_GROUND) / (Z_TOP - Z_GROUND), 0.0), 1.0)


def s_at(f, c):                  # a face-local column's centre
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * RES


def z_at(r):                     # a row's centre
    return ATLAS.z0 + (np.asarray(r) + 0.5) * RES


def col_of(f, s):
    return int(math.floor((s - FACADES[f].s0) / RES))


def row_of(z):
    return int(math.floor((z - ATLAS.z0) / RES))


def row_below(z):                # the highest row whose centre is at or below z
    return int(math.floor((z - ATLAS.z0) / RES - 0.5))


# ---------------------------------------------------------------------------------------------------- the elevation
class Elevation:
    """The facade as the street sees it on this mask's texel grid, cast lazily (only where a streak goes) and kept per
    face: the depth D of the first surface a level ray from the street meets at each texel centre, its material class C
    and its instance I. The fire escapes are looked through: they hang up to 0.85 m out from 3rd Street's wall, and the
    film on the wall runs on behind them."""

    def __init__(self, block):
        self.block = block
        self.see_through = np.array([d["object"].startswith(SEE_THROUGH) for d in block.inst], bool)
        self.H = ATLAS.shape(RES)[0]
        self.faces = {}
        self.rays = 0

    def arrays(self, f):
        if f not in self.faces:
            W = int(round(FACADES[f].width / RES))
            self.faces[f] = dict(D=np.full((self.H, W), np.nan, np.float32), C=np.full((self.H, W), -1, np.int8),
                                 I=np.full((self.H, W), -1, np.int32), done=np.zeros((self.H, W), bool))
        return self.faces[f]

    def width(self, f):
        return self.arrays(f)["D"].shape[1]

    def _cast(self, f, rows, cols):
        from mathutils import Vector
        a = self.arrays(f); F = FACADES[f]; bvh = self.block.bvh
        tri_class, tri_inst, skip = self.block.tri_class, self.block.tri_inst, self.see_through
        dirv = Vector((-F.n[0], -F.n[1], 0.0))
        planes = [(g.n[0], g.n[1], g.c_n) for g in FACADES]
        nx, ny, cn = F.n[0], F.n[1], F.c_n
        for r, c in zip(rows.tolist(), cols.tolist()):
            s = F.s0 + (c + 0.5) * RES; z = ATLAS.z0 + (r + 0.5) * RES
            o = Vector(F.world(s, D_FROM, z)); reach = REACH
            while True:
                loc, _, t, dist = bvh.ray_cast(o, dirv, reach)
                self.rays += 1
                if loc is None or not skip[tri_inst[t]]: break
                o = loc + dirv * 0.002; reach -= dist + 0.002
            a["done"][r, c] = True
            if loc is None: continue
            if s < END_ZONE or s > F.L - END_ZONE:
                ds = [px * loc.x + py * loc.y - pc for px, py, pc in planes]
                if max(range(len(ds)), key=ds.__getitem__) != f: continue
            a["D"][r, c] = nx * loc.x + ny * loc.y - cn
            a["C"][r, c] = tri_class[t]; a["I"][r, c] = tri_inst[t]

    def cells(self, f, rows, cols):
        """D, C, I at the given (row, face-local column) pairs, casting what has not been cast yet."""
        a = self.arrays(f)
        rr = np.asarray(rows, int); cc = np.asarray(cols, int)
        todo = ~a["done"][rr, cc]
        if todo.any(): self._cast(f, rr[todo], cc[todo])
        return a["D"][rr, cc].astype(np.float64), a["C"][rr, cc].astype(np.int32), a["I"][rr, cc]

    def rows(self, f, r0, r1, cols, step=1):
        """D, C, I over rows r0..r1-1 (every step-th) at the given columns (row 0 of each = r0, the lowest)."""
        rr, cc = np.meshgrid(np.arange(max(r0, 0), min(r1, self.H), step), np.asarray(cols, int), indexing="ij")
        D, C, I = self.cells(f, rr.ravel(), cc.ravel())
        return D.reshape(rr.shape), C.reshape(rr.shape), I.reshape(rr.shape)


def walk(el, f, cols, r_start, n_rows, first_ok=None):
    """Follow the film down each of `cols` (face-local) from row r_start for at most n_rows rows, casting only the rows
    it reaches. Returns (last, why, d0): per column the last row the film is still on, counted down from r_start
    (0 = r_start, -1 where it never starts), why it stopped there, and the depth of the surface it starts on."""
    cols = np.asarray(cols, int); m = len(cols)
    last = np.full(m, -1, int); why = np.full(m, STOP_NONE, np.int8); d0 = np.full(m, np.nan)
    if m == 0 or r_start < 0: return last, why, d0
    D, C, _ = el.cells(f, np.full(m, r_start), cols)
    d0 = D.copy()
    alive = np.isfinite(D) & _masonry(C)
    if first_ok is not None: alive &= first_ok
    last[alive] = 0
    d_prev = np.where(alive, D, 0.0)
    for k in range(1, n_rows):
        r = r_start - k
        if r < 0 or not alive.any(): break
        ia = np.nonzero(alive)[0]
        d, c, _ = el.cells(f, np.full(len(ia), r), cols[ia])
        fin = np.isfinite(d)
        step = np.where(fin, d - d_prev[ia], -1.0)
        caught = fin & (step > CATCH)
        edge = ~caught & (step < -CREEP)                    # nothing there, or a step back deeper than a crept-round head
        other = ~caught & ~edge & ~_masonry(c)              # glass, a frame, metal
        why[ia[caught]] = STOP_CAUGHT; why[ia[edge]] = STOP_EDGE; why[ia[other]] = STOP_MATERIAL
        on = ~(caught | edge | other)
        alive[ia[~on]] = False
        last[ia[on]] = k
        d_prev[ia[on]] = d[on]
    why[alive] = STOP_LENGTH
    return last, why, d0


def along(t, efold):
    # a streak's value down its length: it drops its dirt as it goes, and is gone LEN_CAP e-folds down
    L = LEN_CAP * efold
    x = np.clip((t - 0.75 * L) / (0.25 * L), 0.0, 1.0)
    return np.exp(-t / efold) * (1.0 - x * x * (3.0 - 2.0 * x))


def lateral(x):
    return 1.0 / (1.0 + (np.abs(x) / LAT_HALF) ** LAT_P)


# ---------------------------------------------------------------------------------------------------- one source at a time
def draw(key, n):
    """n uniforms in 0..1 from a source's own seed: the sha256 of its key, two bytes each, so every rebuild draws the
    same values and nothing drawn for one source moves when another changes."""
    h = hashlib.sha256(("runoff:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def joint_draw(key, p_low, low, high):
    # a sound joint (or a dry conduit) p_low of the time, anywhere in `low`; otherwise in `high`, its middle likelier
    u = draw(key, 3)
    return low[0] + (low[1] - low[0]) * u[1] if u[0] < p_low else mid(high, u[1], u[2])


def sill_draw(name):
    """A sill's own: the share of its ends' water its left end takes (its fall along its length), the share of its water
    that reaches its ends at all (its fall toward the street), and how much dirt that water carries."""
    u = draw("sill:" + name, 6)
    return 0.5 + SILL_SPLIT * (u[0] + u[1] - 1.0), mid(SILL_FALL, u[2], u[3]), mid(SILL_DIRT, u[4], u[5])


def conduit_draw(key):
    """A bracket's own: the water it carries (1 = the geometry's measure), the share of its foot the water leaves over,
    and where across the foot that exit sits (-1 hard against one side, 1 against the other)."""
    water = joint_draw(key, DRY_P, DRY, WET)
    u = draw(key + ":exit", 3)
    return water, mid(EXIT, u[0], u[1]), 2.0 * u[2] - 1.0


def capital_draw(what, name):
    """A capital's own: its water (0 when what drips onto it falls clear), and the drips it leaves its foot by, each with
    its share of that water (the shares drawn flat over every way of splitting it, so one drip may take most of it and
    another next to nothing), whether it leaves at a corner of the foot and which, and where along the front it sits
    otherwise (0 at the foot's left end, 1 at its right)."""
    u = draw(f"{what}:{name}:water", 2)
    water = 0.0 if u[0] < CAP_DRY_P[what] else CAP_WATER[0] + (CAP_WATER[1] - CAP_WATER[0]) * u[1]
    v = draw(f"{what}:{name}:drips", 1)[0]
    p = DRIPS_P[what]
    n = 1 if v < p[0] else 2 if v < p[0] + p[1] else 3
    drips = []
    for j in range(n):
        d = draw(f"{what}:{name}:drip:{j}", 4)
        drips.append(dict(weight=-math.log(1.0 - 0.999 * d[0]), corner=d[1] < CORNER_P, side="L" if d[2] < 0.5 else "R",
                          at=d[3]))
    total = sum(x["weight"] for x in drips)
    for x in drips: x["share"] = x["weight"] / total
    return water, drips


def place_drips(drips, water, a, b):
    """Where each drip leaves the part of the foot from a to b that stands on the shaft or mullion under it: a corner's
    stream runs down hugging that end, a front one's anywhere between, each as wide as its water makes it. Drips nearer
    than DRIP_GAP are one rivulet with both shares. Returns [dict(axis, w0, water, share, place)], left to right."""
    out, taken = [], set()
    for x in drips:
        w0 = DRIP_W0 * k_of(water * x["share"])
        if x["corner"] and len(taken) < 2:
            side = x["side"] if x["side"] not in taken else ("R" if x["side"] == "L" else "L")
            taken.add(side)
            s, place = (a + 0.5 * w0, "corner L") if side == "L" else (b - 0.5 * w0, "corner R")
        else:
            s, place = a + 0.5 * w0 + max(b - a - w0, 0.0) * x["at"], "front"
        near = [y for y in out if abs(y["axis"] - s) < DRIP_GAP]
        if near:
            near[0]["share"] += x["share"]
            if place != "front": near[0]["place"] = place
        else:
            out.append(dict(axis=s, share=x["share"], place=place))
    for y in out:
        # the rivulet's own water sets its width, and a corner's keeps hugging its end at that width
        y["water"] = water * y["share"]; y["w0"] = DRIP_W0 * k_of(y["water"])
        if y["place"] == "corner L": y["axis"] = a + 0.5 * y["w0"]
        elif y["place"] == "corner R": y["axis"] = b - 0.5 * y["w0"]
        y["axis"] = min(max(y["axis"], a + 0.5 * y["w0"]), b - 0.5 * y["w0"]) if b - a > y["w0"] else 0.5 * (a + b)
    return sorted(out, key=lambda y: y["axis"])


def run_draw(key):
    # a course run's own curtain: its value and its e-fold, times these
    u = draw(key, 4)
    return mid(RUN_SHARE, u[0], u[1]), mid(RUN_STRETCH, u[2], u[3])


def k_of(water):
    # a source's water to its streak's scale: the square root (as a sill's length sets its streak), held to K_MAX
    return min(math.sqrt(max(water, 0.0)), K_MAX)


def exit_span(s0, s1, share, at):
    # the part of a foot from s0 to s1 the water leaves over: `share` of its width, placed by `at` across it
    w = share * (s1 - s0); c = 0.5 * (s0 + s1) + at * 0.5 * (s1 - s0 - w)
    return c - 0.5 * w, c + 0.5 * w


# ---------------------------------------------------------------------------------------------------- painting
class Painter:
    def __init__(self, ctx, el):
        self.ctx, self.el = ctx, el
        self.stops = {}

    def run(self, mark, f, cols, z_top, amp, efold, shape, first_ok=None):
        """Walk `cols` down from just below z_top and paint amp * along(t) * shape(S, t) wherever the film is; amp is a
        number or one per column. Returns (cols, last, why, d0, r_start): the columns kept (those inside the face's
        atlas region) and the walk over them."""
        cols = np.asarray(cols, int)
        keep = (cols >= 0) & (cols < self.el.width(f))
        cols = cols[keep]
        amp = np.asarray(amp, float)
        if amp.ndim: amp = amp[keep]
        if first_ok is not None: first_ok = np.asarray(first_ok)[keep]
        r_start = row_below(z_top - 0.003)
        n_rows = int(math.ceil(LEN_CAP * efold / RES)) + 1
        last, why, d0 = walk(self.el, f, cols, r_start, n_rows, first_ok)
        for w in why[last >= 0]: self.stops[STOP_NAMES[w]] = self.stops.get(STOP_NAMES[w], 0) + 1
        if not (last >= 0).any(): return cols, last, why, d0, r_start
        k_max = int(last.max())
        c_lo, c_hi = int(cols.min()), int(cols.max())
        t = z_top - z_at(r_start - np.arange(k_max + 1))                   # the descent of each row, top row first
        S = s_at(f, cols)
        G = np.broadcast_to(shape(S[None, :], t[:, None]), (k_max + 1, len(cols))).copy()
        off = np.arange(k_max + 1)[:, None] > last[None, :]                 # below where the film stops in each column
        G[off] = 0.0
        V = np.clip(amp * along(t, efold)[:, None] * G, 0.0, 1.0)
        r_lo = r_start - k_max
        F = FACADES[f]
        s0 = F.s0 + c_lo * RES + 0.25 * RES; s1 = F.s0 + (c_hi + 1) * RES - 0.25 * RES
        z0 = ATLAS.z0 + r_lo * RES + 0.25 * RES; z1 = ATLAS.z0 + (r_start + 1) * RES - 0.25 * RES
        for ch, vals in ((0, V), (1, np.clip(G, 0.0, 1.0))):
            block = np.zeros((k_max + 1, c_hi - c_lo + 1))
            block[:, cols - c_lo] = vals
            block = block[::-1]                                             # row 0 = the lowest row, as the atlas
            S_, _, _ = self.ctx.grid(f, s0, s1, z0, z1)
            assert S_.shape == block.shape, (S_.shape, block.shape)
            self.ctx.paint(mark, block, s0, s1, z0, z1, channel=ch, op="max")
        return cols, last, why, d0, r_start


def _points_sdz(block, rec):
    P = block.points(rec)
    c = P.mean(axis=0); f = int(facade_of(c[0], c[1])); F = FACADES[f]
    S, D, Z = F.sdz(P[:, 0], P[:, 1], P[:, 2])
    return f, S, D, Z


def _stop_z(r_start, k):
    return float(z_at(r_start - k)) - 0.5 * RES      # the lower edge of the last row the film is on


def _record(pub, ctx, m, src, what, f, side, cols, last, why, d0, r_start, z, axis, s0, s1, d_src, amp, efold):
    """The mark's centre-line path for the debug view, and its entries in the published lists."""
    F = FACADES[f]
    j = int(np.argmin(np.abs(s_at(f, cols) - axis)))
    if last[j] < 0 and (last >= 0).any(): j = int(np.argmax(last))
    z_stop = _stop_z(r_start, max(int(last[j]), 0))
    d_path = (d0[j] if np.isfinite(d0[j]) else d_src) + 0.02
    ctx.path(m, [F.world(axis, d_path, z), F.world(axis, d_path, z_stop)])
    a = float(np.max(amp))
    pub["streaks"].append(dict(mark=m.id, source=src.id, kind=what, facade=f, axis=round(axis, 3), side=side,
                               s0=round(s0, 3), s1=round(s1, 3), z_top=round(z, 3), z_stop=round(z_stop, 3),
                               amp=round(a, 3), efold=round(efold, 3), stop=STOP_NAMES[int(why[j])]))
    pub["sources"].append(dict(id=src.id, kind=what, facade=f, s0=round(s0, 3), s1=round(s1, 3), z=round(z, 3),
                               d=round(d_src, 3), amp=round(a, 3), efold=round(efold, 3)))


# ---------------------------------------------------------------------------------------------------- the sources
def sill_ends(ctx, el, pt, pub):
    n = 0
    sills = []
    for rec in ctx.block.instances("sill_"):
        if rec["instancer"] is not None: continue
        f, S, D, Z = _points_sdz(ctx.block, rec)
        sills.append((f, float(Z.min()), float(S.min()), float(S.max()), float(D.max()), rec["object"]))
    for f, z, s0, s1, d_front, name in sorted(sills):
        F = FACADES[f]
        L = s1 - s0
        p_left, fall, dirt = sill_draw(name)
        r0 = row_below(z - 0.003)
        for end, s_end, sg, split in (("L", s0, 1.0, p_left), ("R", s1, -1.0, 1.0 - p_left)):
            # this end's water, 1 being what each end took before (half the sill's): its share of the sill's fall, the
            # share of the water that reaches the ends at all, and what its joint with the jamb lets into the corner
            joint = joint_draw(f"sill_end:{name}:{end}", SOUND_P, SOUND_JOINT, OPEN_JOINT)
            water = 2.0 * split * fall * joint
            k = math.sqrt(L / SILL_REF) * k_of(water)
            amp = min(1.0, SILL_AMP * k * exposure(z) * dirt); efold = SILL_EFOLD * k; w0 = SILL_W0 * k
            # a jamb below the end: the surface just outside the sill's span stands further out than the one inside
            D2, _, _ = el.cells(f, [r0 - 2, r0 - 2], [col_of(f, s_end - sg * 0.03), col_of(f, s_end + sg * 0.03)])
            corner = bool(np.isfinite(D2).all() and D2[0] - D2[1] > 0.02)
            src = ctx.source(f"{name}:{end}", "point", [F.world(s_end, d_front, z)], facade=f, what="sill_end",
                             object=name, end=end, length=round(L, 3), jamb=corner, water=round(water, 3),
                             dirt=round(dirt, 3))
            pub["drawn"].setdefault("sill_end", []).append(water)
            if water < WATER_MIN:                          # a sound end: its water drips off the sill's front
                pub["dry"]["sill_end"] = pub["dry"].get("sill_end", 0) + 1
                continue
            w_max = w0 + SPREAD * LEN_CAP * efold
            if corner:
                a, b = sorted((s_end, s_end + sg * LAT_REACH * w_max))
                axis = s_end + sg * 0.5 * w0

                def shape(S, t, s_end=s_end, sg=sg, w0=w0):
                    u = sg * (S - s_end)
                    return np.where(u >= 0.25 * RES, lateral(u / (w0 + SPREAD * t)), 0.0)
            else:
                a, b = s_end - 0.5 * LAT_REACH * w_max, s_end + 0.5 * LAT_REACH * w_max
                axis = s_end

                def shape(S, t, s_end=s_end, w0=w0):
                    return lateral((S - s_end) / (0.5 * (w0 + SPREAD * t)))
            side = "corner" if corner else "centred"
            m = ctx.mark(src, f, what="sill_end", side=side)
            cols, last, why, d0, r_start = pt.run(m, f, np.arange(col_of(f, a), col_of(f, b) + 1), z, amp, efold, shape)
            _record(pub, ctx, m, src, "sill_end", f, side, cols, last, why, d0, r_start, z, axis, s_end, s_end,
                    d_front, amp, efold)
            n += 1
    return n


def brackets(ctx, el, pt, pub):
    n = 0
    for rec in sorted(ctx.block.instances("ge_bracket45"), key=lambda r: r["object"]):
        f, S, D, Z = _points_sdz(ctx.block, rec)
        F = FACADES[f]
        order = np.argsort(S)
        groups = np.split(order, np.where(np.diff(S[order]) > 0.20)[0] + 1)      # one mesh per bay, one group per bracket
        for k, g in enumerate(groups):
            Sg, Dg, Zg = S[g], D[g], Z[g]
            z = float(Zg.min()); foot = Zg < z + 0.005
            s0, s1, d_foot = float(Sg[foot].min()), float(Sg[foot].max()), float(Dg[foot].max())
            sid = f"{rec['object']}#{k}"
            # this bracket's own: the band's water it carries, and the part of its foot that water leaves over
            water, share, at = conduit_draw("bracket:" + sid)
            e0, e1 = exit_span(s0, s1, share, at)
            kw = k_of(water)
            w0 = e1 - e0; axis = 0.5 * (e0 + e1); efold = BRACKET_EFOLD * kw
            amp = min(1.0, BRACKET_AMP * kw * exposure(z) / exposure(15.3))
            w_max = w0 + SPREAD * LEN_CAP * efold
            half = 0.5 * LAT_REACH * w_max

            def shape(Sx, t, axis=axis, w0=w0):
                return lateral((Sx - axis) / (0.5 * (w0 + SPREAD * t)))
            src = ctx.source(sid, "line", [F.world(s0, d_foot, z), F.world(s1, d_foot, z)], facade=f, what="bracket",
                             object=rec["object"], water=round(water, 3), exit=[round(e0, 3), round(e1, 3)])
            pub["drawn"].setdefault("bracket", []).append(water)
            if water < WATER_MIN:                          # the band drips clear over it
                pub["dry"]["bracket"] = pub["dry"].get("bracket", 0) + 1
                continue
            m = ctx.mark(src, f, what="bracket")
            cols, last, why, d0, r_start = pt.run(m, f, np.arange(col_of(f, axis - half), col_of(f, axis + half) + 1),
                                                  z, amp, efold, shape)
            # the published span is the exit's, the part of the foot the water leaves over, which the features that
            # follow take as the stream's width at its source
            _record(pub, ctx, m, src, "bracket", f, "centred", cols, last, why, d0, r_start, z, axis, e0, e1, d_foot,
                    amp, efold)
            n += 1
    return n


def capitals(ctx, el, pt, pub):
    """Each capital's drips: the rivulets its water leaves the foot by, each a narrow stream of its own down the shaft or
    mullion the capital stands on, widening as it falls, and merging with a neighbour where the two widen into each
    other. A capital that sheds nothing keeps its foot's marker and draws no stream."""
    n = 0
    for rec in sorted(ctx.block.instances("ge_capital"), key=lambda r: r["object"]):
        name = rec["object"]
        spring = name.startswith("ge_capital5")
        what = "springing" if spring else "capital"
        f, S, D, Z = _points_sdz(ctx.block, rec)
        F = FACADES[f]
        z = float(Z.min()); foot = Z < z + 0.01
        s0, s1, d_foot = float(S[foot].min()), float(S[foot].max()), float(D[foot].max())
        # this capital's own: its water, and the drips it leaves by
        water, drips = capital_draw(what, name)
        pub["drawn"].setdefault(what, []).append(water)
        # the part of the foot that stands on the shaft or mullion right under it: the water leaves there, onto the
        # surface the foot sits on; beside it (a window's frame beside a mullion) it would fall clear
        r0 = row_below(z - 0.003)
        cc = np.arange(col_of(f, s0), col_of(f, s1) + 1)
        cc = cc[(cc >= 0) & (cc < el.width(f))]
        D0, C0, _ = el.cells(f, np.full(len(cc), r0), cc)
        sits = np.isfinite(D0) & _masonry(C0) & (np.abs(np.nan_to_num(D0, nan=9.0) - d_foot) <= CATCH)
        runs = np.split(np.nonzero(sits)[0], np.where(np.diff(np.nonzero(sits)[0]) > 1)[0] + 1) if sits.any() else []
        placed = []
        if runs:
            best = max(runs, key=len)
            a = max(s0, float(s_at(f, cc[best[0]])) - 0.5 * RES); b = min(s1, float(s_at(f, cc[best[-1]])) + 0.5 * RES)
            placed = [y for y in place_drips(drips, water, a, b) if y["water"] >= WATER_MIN] if water > 0.0 else []
        if not placed:                                     # what drips onto it falls clear, or each drip is a trace
            ctx.source(name, "line", [F.world(s0, d_foot, z), F.world(s1, d_foot, z)], facade=f, what=what, object=name,
                       water=round(water, 3), drips=0)
            pub["dry"][what] = pub["dry"].get(what, 0) + 1
            continue
        pub["drips"].setdefault(what, []).append([y["place"] for y in placed])
        for j, y in enumerate(placed):
            k = k_of(y["water"])
            amp = min(1.0, (SPRING_AMP if spring else CAPITAL_AMP) * exposure(z) / exposure(15.3) * k)
            efold = (SPRING_EFOLD if spring else CAPITAL_EFOLD) * k
            axis, w0 = y["axis"], y["w0"]
            w_max = w0 + SPREAD * LEN_CAP * efold
            half = 0.5 * LAT_REACH * w_max
            cols = np.arange(col_of(f, axis - half), col_of(f, axis + half) + 1)
            cols = cols[(cols >= 0) & (cols < el.width(f))]
            # the stream keeps to the face it leaves onto: past the shaft's or the mullion's arris its water does not
            # reach the wall behind it
            Dr, Cr, _ = el.cells(f, np.full(len(cols), r0), cols)
            Da, _, _ = el.cells(f, [r0], [col_of(f, axis)])
            first_ok = np.isfinite(Dr) & _masonry(Cr) & (np.abs(np.nan_to_num(Dr, nan=9.0) - float(Da[0])) <= CATCH)

            def shape(Sx, t, axis=axis, w0=w0):
                return lateral((Sx - axis) / (0.5 * (w0 + SPREAD * t)))
            src = ctx.source(f"{name}:{j}", "point", [F.world(axis, d_foot, z)], facade=f, what=what, object=name,
                             drip=j, place=y["place"], water=round(y["water"], 3), share=round(y["share"], 3),
                             capital_water=round(water, 3))
            m = ctx.mark(src, f, what=what, side="centred")
            cols, last, why, d0, r_start = pt.run(m, f, cols, z, amp, efold, shape, first_ok)
            # the published span is the drip's width at the foot, which the features that follow take as the stream's
            # width at its source
            _record(pub, ctx, m, src, what, f, "centred", cols, last, why, d0, r_start, z, axis, axis - 0.5 * w0,
                    axis + 0.5 * w0, d_foot, amp, efold)
            n += 1
    return n


def _smooth(x, sigma_cols):
    # a gaussian along s, for water that spreads over a ledge before it leaves it
    r = int(math.ceil(3 * sigma_cols))
    if r < 1: return x
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_cols) ** 2); k /= k.sum()
    return np.convolve(np.pad(x, r, mode="edge"), k, mode="valid")


def drip_lines(ctx, el, pt, pub):
    """The courses' curtains: per face, the columns where a course is what the street sees just above its lower edge
    and a wall what it sees just below, grouped into runs; one source (a run of drip line) and one curtain per run."""
    blk = ctx.block
    names = [d["object"] for d in blk.inst]
    streak_src = np.array([re.match(STREAK_SOURCES, nm) is not None for nm in names])
    portal_bands = {}
    for d in blk.inst:
        if d["instancer"] and d["object"] == "frieze_band":
            f, S, _, _ = _points_sdz(blk, d)
            portal_bands.setdefault(f, []).append((float(S.min()), float(S.max())))
    n = 0
    for kind0, rx_drip, rx_catch, z_lo, z_hi, windows_on in COURSES:
        drip = np.array([re.match(rx_drip, nm) is not None for nm in names])
        catch = np.array([re.match(rx_catch, nm) is not None for nm in names])
        for f in range(len(FACADES)):
            F = FACADES[f]
            W = el.width(f)
            cc = np.arange(W)
            s_cols = s_at(f, cc)
            # the course's lowest visible row in each column, and what the street sees right below it
            ra, rb = row_below(z_lo) - 1, row_of(min(z_lo + 0.14, z_hi)) + 1
            Dz, Cz, Iz = el.rows(f, ra, rb + 1, cc)
            is_drip = (Iz >= 0) & drip[np.clip(Iz, 0, None)]
            low = np.argmax(is_drip, axis=0)
            lowc = np.clip(low, 1, None)
            d_edge = Dz[lowc, cc]; d_below = Dz[lowc - 1, cc]; c_below = Cz[lowc - 1, cc]; i_below = Iz[lowc - 1, cc]
            delta = d_edge - d_below
            ok = is_drip.any(axis=0) & (low >= 1) & np.isfinite(d_below) & _masonry(c_below)
            ok &= (delta >= -CATCH) & (delta <= DRIP_MAX) & ~streak_src[np.clip(i_below, 0, None)]
            ok &= (s_cols > -0.3) & (s_cols < F.L + 0.3)
            if not ok.any(): continue
            z_edge = z_at(ra + lowc) - 0.5 * RES                               # the course's lower edge, to a texel
            # how far the course stands out over the wall it sheds onto: its most projecting member, sampled every 4 cm
            # up its height and every 10 cm along it
            cs = cc[::5]
            Dc, _, Ic = el.rows(f, row_of(z_lo), row_of(z_hi) + 1, cs, step=2)
            on = (Ic >= 0) & catch[np.clip(Ic, 0, None)] & np.isfinite(Dc)
            seen = on.any(axis=0)
            if not seen.any(): continue
            front_s = np.where(on, Dc, -9.0).max(axis=0)
            front = np.interp(cc, cs[seen], front_s[seen])
            reach = np.clip(np.nan_to_num(front - d_below), 0.0, 1.0)
            kinds = np.full(W, kind0, object)
            if kind0 == "string_course":
                for a, b in portal_bands.get(f, []):
                    kinds[(s_cols >= a - 0.05) & (s_cols <= b + 0.05)] = "portal_moulding"
            wet = np.ones(W)
            if windows_on is not None:
                # the windows standing on this course shed all their rain onto it: more water below each one, spread
                # over the ledge before it leaves; how much more is each window's own (a joint in the ledge under it,
                # the ledge's fall there), drawn per window from where it stands
                _, Cw, _ = el.rows(f, row_of(windows_on + 0.12), row_of(windows_on + 0.12) + 1, cc)
                iw = np.nonzero(np.isin(Cw[0], (classes.GLASS, classes.PAINT)))[0]
                gain = np.zeros(W)
                for wg in (np.split(iw, np.where(np.diff(iw) > 1)[0] + 1) if len(iw) else []):
                    u = draw(f"window:{F.name}:{float(s_at(f, wg[0])) - 0.5 * RES:.2f}:"
                             f"{float(s_at(f, wg[-1])) + 0.5 * RES:.2f}", 2)
                    gain[wg] = mid(WINDOW_GAIN, u[0], u[1])
                    pub["drawn"].setdefault("window", []).append(float(gain[wg[0]]))
                wet = 1.0 + np.clip(_smooth(gain, WINDOW_SPREAD / RES), 0.0, WINDOW_GAIN[1])
            idx = np.nonzero(ok)[0]
            breaks = np.where((np.diff(idx) > 3) | (kinds[idx[1:]] != kinds[idx[:-1]]))[0]
            for run in np.split(idx, breaks + 1):
                kind = kinds[run[0]]
                if len(run) * RES < 0.06: continue                             # a sliver at a mitre or a return
                zb = float(np.median(z_edge[run]))
                sa, sb = float(s_at(f, run[0])) - 0.5 * RES, float(s_at(f, run[-1])) + 0.5 * RES
                catch_w = reach[run]
                amp = CURTAIN_AMP * np.sqrt(catch_w / CURTAIN_REF) * np.exp(-np.clip(delta[run], 0.0, None) / CREEP_LEN)
                amp = np.clip(amp * wet[run], 0.0, CURTAIN_MAX)
                efold = float(np.clip(CURTAIN_EFOLD * math.sqrt(float(np.median(catch_w)) / CURTAIN_REF),
                                      *CURTAIN_EFOLDS))
                if kind in VARY_RUNS:
                    # this run's own curtain (a bay of the band, a pier's impost, a portal's moulding), drawn from where
                    # it runs: how much of its course's water creeps back to the wall here, and how far it carries
                    share, stretch = run_draw(f"{kind}:{F.name}:{sa:.2f}:{sb:.2f}:{zb:.2f}")
                    amp = np.clip(amp * share, 0.0, CURTAIN_MAX)
                    efold = float(np.clip(efold * stretch, *CURTAIN_EFOLDS))
                    pub["drawn"].setdefault(kind, []).append(share)
                de = float(np.median(d_edge[run]))
                full = np.arange(run[0], run[-1] + 1)
                amp_full = np.zeros(len(full)); amp_full[run - run[0]] = amp
                first_ok = np.zeros(len(full), bool); first_ok[run - run[0]] = True
                # the ends fade where the drip line stops (a bracket, a capital, a pier's return); at a corner of the
                # block the course and its curtain carry on round onto the next face, so that end does not
                fa = sa if sa > 0.15 else -1e9
                fb = sb if sb < F.L - 0.15 else 1e9

                def shape(Sx, t, fa=fa, fb=fb):
                    return np.clip(np.minimum(Sx - fa, fb - Sx) / END_SOFT, 0.0, 1.0) + 0.0 * t
                src = ctx.source(f"{kind}:{F.name}:{n}", "line", [F.world(sa, de, zb), F.world(sb, de, zb)], facade=f,
                                 what=kind, length=round(sb - sa, 3))
                m = ctx.mark(src, f, what=kind)
                cols, last, why, d0, r_start = pt.run(m, f, full, zb, amp_full, efold, shape, first_ok)
                # the flow lines the debug view draws: about one a metre along the run, from the drip line to its stop
                good = np.nonzero(last >= 0)[0]
                k_lines = max(1, int(round((sb - sa) / 1.0)))
                for q in range(k_lines):
                    if not len(good): break
                    j = good[min(len(good) - 1, int((q + 0.5) * len(good) / k_lines))]
                    s = float(s_at(f, cols[j]))
                    ctx.path(m, [F.world(s, d0[j] + 0.02, zb), F.world(s, d0[j] + 0.02, _stop_z(r_start, last[j]))])
                zs = [_stop_z(r_start, x) for x in last[good]] or [zb]
                a_med = float(np.median(amp))
                pub["streaks"].append(dict(mark=m.id, source=src.id, kind=kind, facade=f, axis=round(0.5 * (sa + sb), 3),
                                           side="curtain", s0=round(sa, 3), s1=round(sb, 3), z_top=round(zb, 3),
                                           z_stop=round(float(np.median(zs)), 3), amp=round(a_med, 3),
                                           efold=round(efold, 3),
                                           stop=(STOP_NAMES[int(np.bincount(why[good], minlength=5).argmax())]
                                                 if len(good) else "none")))
                pub["sources"].append(dict(id=src.id, kind=kind, facade=f, s0=round(sa, 3), s1=round(sb, 3),
                                           z=round(zb, 3), d=round(de, 3), amp=round(a_med, 3), efold=round(efold, 3)))
                pub["drip_lines"].append(dict(kind=kind, facade=f, s0=round(sa, 3), s1=round(sb, 3), z=round(zb, 3),
                                              d_edge=round(de, 3), d_wall=round(float(np.median(d_below[run])), 3),
                                              reach=round(float(np.median(reach[run])), 3),
                                              soffit=round(float(np.median(delta[run])), 3)))
                n += 1
    return n


# ---------------------------------------------------------------------------------------------------- build
def build(ctx):
    el = Elevation(ctx.block)
    pt = Painter(ctx, el)
    pub = dict(sources=[], streaks=[], drip_lines=[], drawn={}, dry={}, drips={})   # drawn, dry, drips: the build's log
    n_sill = sill_ends(ctx, el, pt, pub)
    n_brk = brackets(ctx, el, pt, pub)
    n_cap = capitals(ctx, el, pt, pub)
    n_cur = drip_lines(ctx, el, pt, pub)
    # the field the following features paint from: this mask, max-pooled to 4 cm (row 0 = the atlas's bottom)
    cv = ctx.canvas[:, :, 0]
    H2, W2 = cv.shape[0] // 2, cv.shape[1] // 2
    field = cv[:H2 * 2, :W2 * 2].reshape(H2, 2, W2, 2).max(axis=(1, 3)).astype(np.float16)
    ctx.publish("sources", pub["sources"])
    ctx.publish("streaks", pub["streaks"])
    ctx.publish("drip_lines", pub["drip_lines"])
    ctx.publish("field", dict(res=2 * RES, z0=ATLAS.z0, data=field, atlas=ATLAS.to_dict(),
                              note="the runoff mask (0..1, the dirt a streak leaves) max-pooled to 4 cm, rows from z0 up"))
    by = {}
    for s in pub["streaks"]:
        b = by.setdefault(s["kind"], dict(n=0, amp=[], efold=[], drop=[], stop={}))
        b["n"] += 1; b["amp"].append(s["amp"]); b["efold"].append(s["efold"]); b["drop"].append(s["z_top"] - s["z_stop"])
        b["stop"][s["stop"]] = b["stop"].get(s["stop"], 0) + 1
    dry = sum(pub["dry"].values())
    ctx.log(f"   runoff: {n_sill} sill ends, {n_brk} brackets, {n_cap} capitals' drips, {n_cur} drip-line runs; "
            f"{el.rays} rays cast" + (f"; {dry} sources shed nothing" if dry else ""))
    for k, b in by.items():
        ctx.log(f"   runoff {KIND_LABEL.get(k, k):<22} {b['n']:4d}: value {np.median(b['amp']):.2f} "
                f"({min(b['amp']):.2f}..{max(b['amp']):.2f}), e-fold {np.median(b['efold']):.2f} m "
                f"({min(b['efold']):.2f}..{max(b['efold']):.2f}), runs "
                f"{np.median(b['drop']):.2f} m ({min(b['drop']):.2f}..{max(b['drop']):.2f}); stops "
                + ", ".join(f"{k2} {v}" for k2, v in sorted(b["stop"].items())))
    ctx.log("   runoff column stops: " + ", ".join(f"{k} {v}" for k, v in sorted(pt.stops.items())))
    for k, d in pub["drawn"].items():
        d = np.array(d)
        what = "window gain" if k == "window" else "curtain share" if k in VARY_RUNS else "water"
        heavy = f", {int((d > 1.3).sum())} above 1.3" if what == "water" else ""
        label = "ground crown window" if k == "window" else KIND_LABEL.get(k, k)
        ctx.log(f"   runoff drawn {label:<22} {len(d):4d}: {what} {np.median(d):.2f} "
                f"({d.min():.2f}..{d.max():.2f}), a quarter below {np.quantile(d, 0.25):.2f} and above "
                f"{np.quantile(d, 0.75):.2f}" + heavy + (f"; {pub['dry'][k]} shed nothing" if pub["dry"].get(k) else ""))
    for k, caps in pub["drips"].items():
        per = [len(c) for c in caps]; places = [p for c in caps for p in c]
        ctx.log(f"   runoff drips {KIND_LABEL.get(k, k):<22} {len(caps):4d} shed: {len(places)} drips, "
                + ", ".join(f"{q} drip{'s' if q > 1 else ''} {per.count(q)}" for q in (1, 2, 3) if per.count(q))
                + f"; at a corner {sum(p != 'front' for p in places)}, along the front {places.count('front')}")


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    v = g.mx(g.sep(g.i("Mask"))[0], 0.0)           # the deposit a streak leaves here
    inside = g.i("Mask Alpha")                     # how far inside its width: 1 on its axis, falling to 0 past its edge
    # masonry, on walls and returns: never a ledge's top, never glass or metal. Nor a soffit: every point of an underside
    # stands at one height and reads one row of the mask, so a drip line's value would lie flat across the whole soffit
    where = g.mul(g.is_class(*classes.MASONRY), g.mul(g.one_minus(g.upward()), g.one_minus(g.downward())))
    # the wall's own structure draws the edges: water hangs at a bed joint and spreads along it, so the joint and the lip
    # of brick just under it (Bed) hold the deposit, as an ashlar's joints do (Joint). On a face a streak ends at a crisp
    # edge halfway out across its width; along a joint it reaches EDGE_LIP further, and down its length the joints hold
    # it longer: its edges and its end break up course by course. Grain is left out on purpose: the dressed sandstone's
    # relief is a cloud with no joints in it, and a deposit held in its hollows would read as blotches
    hold = g.clamp(g.mx(g.i("Joint"), g.i("Bed")))
    reach = g.mul(hold, EDGE_LIP)
    edge = g.smooth(g.sub(EDGE[0], reach), g.sub(EDGE[1], reach), inside)
    vv = g.mul(g.mix(v, g.pow(v, JOINT_GAMMA), hold), edge)
    amt = g.mul(g.mul(vv, where), g.mul(g.i("Strength"), AMOUNT))
    col = g.i("Color")
    y = g.lum(col)
    dirt = g.scale_rgb(g.mix(col, g.rgb(y, y, y), DIRT_GREY, 'RGBA'), DIRT_DARK)
    g.o("Color", g.mix(col, dirt, amt, 'RGBA'))
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), MATTE), amt))
    # the debug view shows where the marks lie rather than how strong they are: full colour from a quarter of the most
    # a streak can hold, so the faint curtains read as plainly as the sill ends
    g.o("Debug", g.mul(g.mul(where, edge), g.clamp(g.mul(v, 4.0))))
