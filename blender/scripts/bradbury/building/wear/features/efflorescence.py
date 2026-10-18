# Efflorescence below trim (AI 569): the faint white salt bloom brickwork shows just below the stone and terracotta trim
# set into it. The Brick Industry Association's Technical Note 23A names caps, copings, sills and lintels as trim that
# "may contain soluble salts, which can contribute significantly to efflorescence on the face of adjacent brickwork":
# water carries the salts out of the trim into the brick below, and they crystallise on its face as it dries. The
# ICOMOS-ISCS glossary adds that efflorescence comes from the material itself, unlike the deposits the air brings, and
# that it follows the evaporation front. Los Angeles is dry, so the bloom is faint.
#
# THE EDGES are found on the model, not listed: every lower edge of trim (terracotta or stone) that stands directly
# over brick as the street sees the facade, set into it (its front at most DRIP_MAX out from the brick below, and the
# brick running on at least MIN_DROP under it: a sliver of wall that something standing out catches right under the edge,
# beside a column's capital, is no source). On this block they are the window sills of floors 3 and 4, the band between
# floors 4 and 5 (its lower edge, the feet of its brackets and of the columns' capitals under it, and on the raised
# pavilions its top cornice, which sits there on brick), the impost course and the capitals at the top floor's springing,
# and the crown's base. Brick with no trim above it takes none. The fire escapes' fixings (AI 568) are places too: water
# gets into the wall where the iron enters it, into the brick round a rail's end, into the sill a platform's corner is
# fixed to and out of it into the brick below. The archivolts over the top floor's arches stand over the arch rings, whose
# courses run round the arch: the bloom's lower boundary is drawn on the level courses of the wall, so the rings are left
# out (they are counted).
#
# ONE SITE AT A TIME (the rework of 2026-09-23). Bloomed along every one of those edges, the rules below laid the same
# pale band under all 78 sills, every bracket's and capital's foot and the whole band, impost and crown: 636 sources
# stamped alike (user 2026-09-23: marks must not repeat identically from one instance to the next; noise inside a mark
# stays out, as before). Real efflorescence is patchy from one element to the next. Salt needs water INSIDE the wall to
# carry it out, and water gets in at a few places only -- a sill's joint with its jamb that has opened, a bed joint under
# a sill whose drip has failed, an open joint in a course, the hole round a fixing -- while most trim stays sound and the
# brick under it shows nothing. Which it is, the model does not carry. So each edge is split into its SITES, the places
# where water could get in: a sill's two ends (where 564's water gathers, at the jambs) and its bed; each foot of a
# bracket, a column capital or a springing capital; the impost over each pier; the band, the crown and any other course
# in lengths of about one terracotta unit (UNIT); each fixing. Each site draws from its own seed whether it leaks at all
# -- a minority do, and the wetter the site (564's water crossing its edge, 568's through a fixing) the likelier -- and,
# if it does, its own bloom: the amount of salt, how far down it reaches, how wide it spreads, where along the site it
# lies, how round its lower boundary is and which way it leans (site_draw). Most trim shows nothing; no two blooms match.
#
# ITS OUTLINE AND ITS STRENGTH (the critique of 2026-09-24). A bloom whole across most of its width, fading only at its
# ends, laid a pale strip a course or two deep under the crown and the band with near-vertical ends: a rectangle, 12%
# lighter than the brick beside it in the sun on Broadway, and two neighbouring crown units that both leaked drew two
# such dashes side by side. So a bloom is a bell hanging from its leak: deepest and strongest there, falling smoothly to
# nothing at either end with no flat part, each side as long as its own draw, so its lower boundary comes up a course at
# a time to meet the trim and leans toward the leak (bell). The water one leak lets in spreads over the bloom's width,
# so a wide bloom -- a course's unit, the impost over a pier -- is a faint one (spread), and one wet stretch shows as one
# bloom: of neighbouring units of a course that both leak, the one that draws the more salt keeps its bloom and reaches
# toward the other's leak (join).
#
# THE BLOOM starts at the trim's lower edge and fades downward within tens of centimetres: its amount falls off as
# exp(-t / e) with the depth t below the edge, and it ends where that falls below a cut. The wet paths make it stronger
# and longer: the water AI 564's runoff brings across the trim's edge (its published deposit just below the edge: a sill's
# ends, where the water off the window gathers; the curtains of the band, the impost course and the crown; a bracket's or
# a capital's foot), and a fire escape's fixing. The mortar joints carry it furthest, since the salts travel through the
# mortar and deposit there first: the joints reach JOINT_REACH times as far as a brick's face and take much more of it.
# Sideways a bloom fades out to its ends, where it is shallower and fainter: the wall is wettest under the leak, so the
# bloom is deepest and strongest there and its lower boundary rounds up to either side. It spreads through the wall past
# its own trim's columns onto brick at the same depth and on the same courses (a sill's end onto the flush wall beside
# it on a raised stretch, a band's run past a bracket onto the next run, never onto a pier standing forward of a panel).
#
# THE LOWER BOUNDARY FOLLOWS THE JOINTS. The wall's brick is mapped in world metres (its texture's V is the world z,
# reversed on the top floor), so its bed joints lie on level courses of COURSE_H, with a phase per object measured here
# from its own UVs and the brick set's own height map. The shader finds the course a shading point lies in from its
# world z and that phase (a mask channel), and reads the bloom once per course, at the course's top joint (a second
# lookup of this mask): every brick of a course, its head joints and the bed joint under it bloom together or not at
# all, so the bloom steps down course by course and always ends at a bed joint. Nothing is noise.
#
# THE LOOK lightens and slightly desaturates the brick and its mortar toward a salt white, a veil rather than a paint, so
# the brick's own pattern stays under it: a little on a brick's face, much more in the joints, which turn from dark lines
# to pale ones. It is matte. Half of its lift follows the brick's own hue, since a thin film of crystals lets the brick
# through (all of it toward the salt's white turned the joints blue-grey in the sun), and the salt comes out under the
# deposits: where the soiling or a streak has darkened the brick, the lift is dimmed with them, so a bloom keeps the
# crown's soiled band soiled (laid over it at full strength, it read as a cleaned patch). Brick walls and returns only
# (not tops, soffits, the trim, the stone); the rust stain of AI 568 is kept clear.
#
# PUBLISHED for any feature that follows (salts crystallising in the joints are one of the ways mortar decays): `sources`
# (the sites that leak, with their blooms), `sites` (every site and its draw), `courses` (the wall's level course grid)
# and `field` (see the README's "Efflorescence below trim (AI 569)").
import hashlib, math, re
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS
from . import runoff, soiling
from . import rust as rust_stains

NAME = "efflorescence"
AI = 569
LABEL = "efflorescence below trim"
ORDER = 240                      # a deposit laid over the others (soiling 200 .. street grime 230), before the rust (250)
NEEDS = ("soiling", "runoff", "rust")
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (1.00, 0.55, 0.75)
MASK = dict(res=0.02, channels=4, bits=8)   # R the bloom's amount at its trim's edge; G the depth below that edge; B its
RES = MASK["res"]                           # reach (e-fold); A the phase of the brick's level courses
assert RES == runoff.RES, "the walk runs on runoff's elevation grid"

# ---------------------------------------------------------------------------------------------------- the sources
TRIM = (classes.TERRACOTTA, classes.STONE)
SET_BACK = 0.03         # a trim's lower edge may stand this far behind the brick under it ...
DRIP_MAX = runoff.DRIP_MAX   # ... and at most this far out in front of it (the band's soffit is 0.25): set into it
MIN_DROP = 0.10         # the brick must run on at least this far below the edge (not a sliver caught beside a capital)
MIN_RUN = 0.06          # a run of edge shorter than this is a sliver at a mitre or a return
RUN_DZ = 0.03           # one run: its edge stays within this of the neighbouring column's
CATCH = runoff.CATCH    # the bloom's brick runs on down the wall as runoff's film does: a surface standing CATCH further
CREEP = runoff.CREEP    # out ends it, a step back of up to CREEP (a window strip's head) is crept round
FAMILIES = (            # what a trim is, by its object's name (the first match)
    ("sill", r"^sill_"),
    ("bracket", r"^ge_bracket45"),
    ("springing", r"^ge_capital5"),
    ("capital", r"^ge_capital"),
    ("band", r"^(ge_cornice45_|ge_band45|ge_teeth45)"),
    ("impost", r"^impost_course"),
    ("crown", r"^ge_crown_"),
    ("archivolt", r"^ge_archivolt"),
)
KIND_LABEL = dict(sill="window sill", bracket="band bracket's foot", capital="column capital's foot", band="band 4-5",
                  springing="springing capital", impost="impost course", crown="crown's base", archivolt="archivolt",
                  trim="other trim", anchor="fire escape fixing", anchor_sill="fixing in a sill",
                  sill_end="sill's end", sill_bed="sill's bed")

# ---------------------------------------------------------------------------------------------------- the course grid
COURSE_H = 1.26 / 16    # the wall brick's course: its set's 1.26 m tile holds 16 (measured and asserted at build time)
JOINT_HALF = 0.004      # a bed joint's half height: 3.5 mm in the set's height map, and half a millimetre to spare
JH_U = JOINT_HALF / COURSE_H    # the same in courses: a course is its brick row and the bed joint UNDER it

# ---------------------------------------------------------------------------------------------------- the bloom
A_BASE, A_WET = 0.50, 0.50      # the amount where a site leaks: the salt the trim holds, and more where the wall is wet
E_BASE, E_WET = 0.080, 1.00     # the e-fold down a brick's face (metres), longer where the wall stays wet
JOINT_REACH = 1.6       # the joints carry it this many times as far down
CUT_FACE = 0.30         # a brick's face blooms while exp(-t / e) is above this ...
CUT_JOINT = 0.25        # ... its joints while exp(-t / (JOINT_REACH e)) is: the bloom ends at the course where it falls
CUT_SOFT = 1.5          # below that (it comes in from the cut to CUT_SOFT times it, so where the wet paths widen it the
                        # bloom fades out sideways, not along a line through a brick)
REACH_MAX = 0.45        # and the joints never reach more than this below the edge (never a storey)
# the wetness: AI 564's runoff (its published deposit, read at each texel, so the bloom follows a stream down and out as
# it widens), and the water a fire escape's fixing lets in (AI 568's anchors), spreading from the fixing as wide as its
# bloom (HALF_W, below)
FIX_E = 0.30            # the water a fixing lets into a sill wets the brick under it, falling off over this (e-fold)
ANC_E = 0.20            # ... and round a fixing into brick, over this ...
ANC_UP = 0.04           # ... from this far above it (the wet brick round the hole)
ANC_SILL_WET = 0.80     # into a sill (a platform's corner): the water it lets into the sill wets the brick under the sill
RUST_GAP = (0.000, 0.015)   # the bloom keeps off AI 568's rust streaks, drawn from their published axis, width, spread and
                            # halo: gone at the stain's edge, whole this far outside it

# ---------------------------------------------------------------------------------------------------- one site at a time
# Whether a site leaks and, if it does, its bloom, drawn from its own seed (draw: the sha256 of "efflorescence:" and the
# site's key, two bytes to a uniform; a range is the mean of two uniforms, the middle likelier than the ends). A site
# leaks with the chance SITE_P of its kind where it is wettest and LEAD_FLOOR of that where it is dry, the smoothstep of
# its water over WET_LEAD between (lead): the wet paths lead, and still most sites stay sound. A fixing has no floor:
# 568 has already drawn the water it lets in, and one it drew as sound lets in none
SITE_P = dict(sill_end=0.10, sill_bed=0.04, bracket=0.08, capital=0.12, springing=0.10, impost=0.12, band=0.07,
              crown=0.06, trim=0.07, anchor=0.45, anchor_sill=0.45)
LEAD_FLOOR = 0.25
WET_LEAD = (0.10, 0.90)
FIXINGS = ("anchor", "anchor_sill")
UNIT = 1.20             # the band, the crown and any other course are split into sites about this long: the terracotta's
                        # units, whose joints are what open (the model carries none of its own)
END_IN = 0.06           # a sill's end blooms round its stream (564's axis), its leak up to this far to either side of it
LEAK_AMOUNT = (0.55, 1.15)  # a site that leaks: its amount, times the geometry's A_BASE + A_WET x wet ...
LEAK_REACH = (0.70, 1.35)   # ... its e-fold, times the geometry's ...
HALF_W = dict(sill_end=(0.08, 0.22), bracket=(0.05, 0.14), capital=(0.12, 0.34), springing=(0.08, 0.18),
              impost=(0.15, 0.50), band=(0.15, 0.45), crown=(0.25, 0.75), trim=(0.15, 0.45), anchor=(0.06, 0.13),
              anchor_sill=(0.06, 0.14))    # ... and its half-width along the edge (the mean of its two sides); a
                                           # sill's bed is ...
BED_SHARE = (0.55, 1.00)    # ... this share of the sill's, lying anywhere along it
# its outline (the critique of 2026-09-24): a bell hanging from the leak, (1 - smoothstep(|x|)) ** power across it with
# x -1 and 1 at its two ends, and no flat part: the wall is wettest under the leak
ASYM = 0.45             # each side reaches (1 -+ up to this) times the half-width from the leak, drawn: the bloom leans
ROUND = (0.60, 1.40)    # its e-fold goes as the bell ** this, drawn (a broad, rounded bottom to a pointed one; from 0.6,
                        # so its sides come up a course at a time rather than in a cut) ...
FADE = 0.50             # ... and its amount as the bell ** (FADE x that, and at least FADE: it comes to nothing along a
                        # slope, not in a cut): along the course the edge cuts, it fades out a little beyond the courses
                        # under it
W_REF, W_POW = 0.18, 0.50   # the water one leak lets in spreads over its bloom: one wider than W_REF (its half-width)
                            # takes (W_REF / half) ** W_POW of its amount (a crown's unit about half, a sill's end all)
COURSE_KINDS = ("band", "crown", "trim")    # one wet stretch, one bloom: of the units of one course that leak, neighbours
JOIN_GAP = 0.35         # this little apart (a bracket between two runs of the band) are one stretch, and the one that
JOIN_REACH = (0.55, 0.95)   # draws the more salt keeps its bloom, reaching this share of the way toward the other's leak
DEPTH_TOL = 0.03        # past its own edge's columns a bloom spreads onto brick standing within this of its own brick

# ---------------------------------------------------------------------------------------------------- the mask
T_NEG, T_SPAN = 0.20, 1.00      # G: the depth below the edge, t from -T_NEG to T_SPAN - T_NEG (linear in z: exact between
E_SPAN = 0.40                   # texels); B: the e-fold over 0 .. E_SPAN
PAD_UP = int(math.ceil(COURSE_H / RES)) + 2     # rows above the edge carrying the source's values: a course's top joint
PAD = 2                         # can stand a course above its brick; and texels round every mark for the lookup's filter

# ---------------------------------------------------------------------------------------------------- the look
SALT = (0.78, 0.76, 0.72)       # the bloom's white, a little warm: salt with the city's dust in it (linear)
SALT_HUE = 0.50         # this share of the veil's lift follows the brick's own hue (the same rise in luminance with its
                        # colour kept: a thin film of crystals lets the brick through), the rest goes toward SALT's white
UNDER_POW = 0.50        # the salt comes out under the deposits: each channel's lift is dimmed as the square root of how
                        # far they dimmed that channel of the clean brick (the crystals grow through the dirt, so they
                        # show a little more than the brick under it), and is never more than the clean brick takes
CLEAN_FLOOR = 0.01      # the clean brick's channel read no darker than this
FACE_AMOUNT = 0.10      # at strength 1 a full bloom veils a brick's face this far toward SALT, and a mortar joint
JOINT_AMOUNT = 0.30     # this far: a veil, the brick's own pattern under it
FACE_CAP = 0.55         # a face takes the amount up to this and no more: the salt the wet paths bring shows in the joints
LIP = 0.12              # the salt spreads out of each bed joint onto the brick under it, this share of a course deep (the
LIP_SHARE = 0.50        # lip is found on the course grid, so it lies under the joint on every floor) at this share of
                        # the joint's own amount
# a brick takes its share by how porous it is, read from its own tone: the lighter, less fired bricks of a wall are the
# more porous and take the salt up; the darker, harder ones less (the brick set's faces: luminance 0.195 to 0.288, p10
# to p90, as the material draws them with its AO)
POROUS = (0.195, 0.288)         # a face this light takes POROUS_SHARE[0] of the bloom, this light POROUS_SHARE[1]
POROUS_SHARE = (0.55, 1.45)
MATTE = 0.90            # the bloom leaves a surface at least this rough
DEBUG_GAIN = 3.0        # the debug view shows the bloom at full colour from a third of its most

STOP_NAMES = ("none", "caught", "edge", "material", "grid", "length")
STOP_NONE, STOP_CAUGHT, STOP_EDGE, STOP_MATERIAL, STOP_GRID, STOP_LENGTH = range(6)


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def s_at(f, c):
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * RES


def z_at(r):
    return ATLAS.z0 + (np.asarray(r) + 0.5) * RES


def family_of(name):
    for key, rx in FAMILIES:
        if re.match(rx, name): return key
    return "trim"


def reach_of(e):
    # how far below the edge the joints bloom: to the course where exp(-t / (JOINT_REACH e)) falls below CUT_JOINT
    return np.minimum(np.asarray(e, np.float64) * JOINT_REACH * math.log(1.0 / CUT_JOINT), REACH_MAX)


def rust_keep(streaks, f, S, Z):
    """1 where the bloom may lie, 0 on AI 568's rust streaks on face f at (S, Z): each streak's own width as it draws it
    (W0 widening SPREAD a metre, a halo round the fixing reaching UP above it), RUST_GAP to spare."""
    keep = np.ones(np.shape(S))
    for st in streaks:
        if st["facade"] != f: continue
        t = st["z_top"] - Z
        hw = (0.5 * (st["width"] + st["spread"] * np.maximum(t, 0.0))
              + rust_stains.HALO_W * np.exp(-(t / rust_stains.HALO_R) ** 2))
        on = (Z <= st["z_top"] + rust_stains.UP + RUST_GAP[1]) & (Z >= st["z_stop"] - RUST_GAP[1])
        k = smooth(RUST_GAP[0], RUST_GAP[1], np.abs(S - st["axis"]) - hw)
        keep = np.where(on, np.minimum(keep, k), keep)
    return keep


def course_values(z, z_edge, phase, e):
    """The bloom per course, as the shader draws it, at world heights z (numpy): (in the bloom, face profile, joint
    profile), each course read at its top joint."""
    u = np.asarray(z, np.float64) / COURSE_H - phase
    k = np.floor(u + JH_U)
    t = z_edge - (k + 1.0 + phase) * COURSE_H
    inside = t > -(1.0 + JH_U) * COURSE_H
    tp = np.maximum(t, 0.0)
    e = np.maximum(np.asarray(e, np.float64), 0.005)
    pf = np.exp(-tp / e); pj = np.exp(-tp / (e * JOINT_REACH))
    pf = pf * smooth(CUT_FACE, CUT_FACE * CUT_SOFT, pf)
    pj = np.maximum(pj * smooth(CUT_JOINT, CUT_JOINT * CUT_SOFT, pj), pf)
    return inside, pf * inside, pj * inside


# ---------------------------------------------------------------------------------------------------- one site at a time
def draw(key, n):
    """n uniforms in 0..1 from a site's own seed: the sha256 of its key, two bytes each, so every rebuild draws the same
    values and nothing drawn for one site moves when another changes."""
    h = hashlib.sha256(("efflorescence:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def lead(kind, wet):
    # how a site's water raises its chance of leaking: LEAD_FLOOR where it is dry (a fixing 0), 1 where it is wettest
    floor = 0.0 if kind in FIXINGS else LEAD_FLOOR
    return floor + (1.0 - floor) * float(smooth(WET_LEAD[0], WET_LEAD[1], wet))


def site_draw(key, kind, wet, lo, hi, span=None):
    """Whether a site leaks, and if it does, its bloom. Returns (p, bloom): p the chance it leaks, bloom None or
    dict(amount, reach, half, deep, half_l, half_r, lean, round): the amount and the e-fold as shares of the geometry's,
    the half-width, the leak where the bloom is deepest (anywhere in lo..hi; on a sill's bed anywhere the bloom stays on
    the sill, span its half-length), how far it reaches to either side of the leak and how round its lower boundary is."""
    u = draw(key, 10)
    p = SITE_P[kind] * lead(kind, wet)
    if u[0] >= p: return p, None
    lean = ASYM * (2.0 * u[8] - 1.0)
    if kind == "sill_bed":
        half = mid(BED_SHARE, u[5], u[6]) * span
        deep = lo + half * (1.0 + lean) + (hi - lo - 2.0 * half) * u[9]
    else:
        half = mid(HALF_W[kind], u[5], u[6])
        deep = lo + (hi - lo) * u[9]
    return p, dict(amount=mid(LEAK_AMOUNT, u[1], u[2]), reach=mid(LEAK_REACH, u[3], u[4]), half=half, deep=deep,
                   half_l=half * (1.0 + lean), half_r=half * (1.0 - lean), lean=lean,
                   round=ROUND[0] + (ROUND[1] - ROUND[0]) * u[7])


def bell(s, b, power):
    """A bloom across its width, as a share of what it is under its leak: 1 there, falling smoothly to nothing at its two
    ends (half_l to the left of the leak, half_r to the right), as (1 - smoothstep(|x|)) ** power."""
    d = np.asarray(s, np.float64) - b["deep"]
    x = np.where(d < 0.0, -d / b["half_l"], d / b["half_r"])
    return (1.0 - smooth(0.0, 1.0, x)) ** power


def fade(b):
    # the power of the bell a bloom's amount falls by across it
    return max(FADE, FADE * b["round"])


def spread(half):
    # the share of its amount a bloom this wide (half-width) takes: the water one leak lets in spreads over its width
    return min(1.0, (W_REF / half) ** W_POW)


def outline(b):
    # a bloom's draws as `sources` publishes them: its half-width, each side's reach from the leak, the middle of its
    # extent, the leak (its deepest point), how round it is, how it leans, its amount, reach and width shares, and the
    # units whose leaks it took in
    out = dict(half=round(b["half"], 3), half_l=round(b["half_l"], 3), half_r=round(b["half_r"], 3),
               middle=round(b["deep"] + 0.5 * (b["half_r"] - b["half_l"]), 3), deepest=round(b["deep"], 3),
               round=round(b["round"], 3), lean=round(b["lean"], 3),
               leak=dict(amount=round(b["amount"], 3), reach=round(b["reach"], 3), spread=round(spread(b["half"]), 3)))
    if b.get("joins"): out["joins"] = list(b["joins"])
    return out


def join(drawn):
    """One wet stretch, one bloom. `drawn` is a face's sites as (run, site, p, bloom) in order; among the units of one
    course that leak (COURSE_KINDS: one kind, edges within RUN_DZ), neighbours at most JOIN_GAP apart are one stretch.
    The unit that draws the most salt keeps its bloom and its side toward each other unit's leak reaches JOIN_REACH of
    the way there (drawn from its own seed), so its outline runs longer that way; the others draw no bloom of their own
    (bloom["joined"] names the keeper). Returns the number of units joined into another's bloom."""
    units = [d for d in drawn if d[3] is not None and d[1]["kind"] in COURSE_KINDS]
    n = 0
    for kind in COURSE_KINDS:
        ks = sorted((d for d in units if d[1]["kind"] == kind), key=lambda d: d[0]["ze"])
        courses = []                                    # the course each unit's edge lies on
        for d in ks:
            if courses and abs(d[0]["ze"] - courses[-1][-1][0]["ze"]) <= RUN_DZ: courses[-1].append(d)
            else: courses.append([d])
        for cs in courses:
            cs.sort(key=lambda d: d[1]["lo"])
            stretches = [[cs[0]]]
            for d in cs[1:]:
                if d[1]["lo"] - stretches[-1][-1][1]["hi"] <= JOIN_GAP: stretches[-1].append(d)
                else: stretches.append([d])
            for st in stretches:
                if len(st) < 2: continue
                keep = max(st, key=lambda d: d[3]["amount"])
                b = keep[3]
                u = draw(keep[1]["key"] + ":join", 2)
                reach = mid(JOIN_REACH, u[0], u[1])
                for d in st:
                    if d is keep: continue
                    to = d[3]["deep"] - b["deep"]
                    if to < 0.0: b["half_l"] = max(b["half_l"], -to * reach)
                    else: b["half_r"] = max(b["half_r"], to * reach)
                    d[3]["joined"] = keep[1]["key"]; b.setdefault("joins", []).append(d[1]["key"])
                    n += 1
    return n


def sites_of(run, wet_at, streams, sill_fix):
    """The sites along one run of trim edge, the places where water could get into the brick under it: dict(key, kind,
    lo, hi (where the middle of its bloom may lie), wet (the water crossing the edge there, 0..1), point (a point, or a
    stretch of the edge), span (a sill's half-length), fix (a fixing's water into a sill))."""
    fam, F, sa, sb, trim, ze = run["fam"], run["F"], run["sa"], run["sb"], run["trim"], run["ze"]
    out = []
    if fam == "sill":
        for end, s_end in (("L", sa), ("R", sb)):
            st = streams.get(f"{trim}:{end}")          # 564's stream from this end, where it sheds one
            ax = float(st["axis"]) if st is not None else s_end
            out.append(dict(key=f"sill_end:{trim}:{end}", kind="sill_end", lo=ax - END_IN, hi=ax + END_IN,
                            wet=wet_at(ax - 0.10, ax + 0.10), point=True))
        # the bed: water tracking back under a sill whose drip has failed, as much as its ends take
        out.append(dict(key=f"sill_bed:{trim}", kind="sill_bed", lo=sa, hi=sb, span=0.5 * (sb - sa),
                        wet=0.5 * (out[0]["wet"] + out[1]["wet"]), point=False))
        for a in sill_fix:
            if a["wall"] == trim and a["facade"] == F.idx:
                out.append(dict(key=f"fixing:{a['id']}", kind="anchor_sill", lo=a["s"], hi=a["s"], point=True,
                                wet=ANC_SILL_WET * a["wet"], fix=ANC_SILL_WET * a["wet"], anchor=a["id"]))
    elif fam in ("bracket", "capital", "springing"):
        # a foot: 564's stream leaves it over its exit, where the bloom's middle lies; a foot that sheds no stream
        # blooms, if at all, round its middle third
        st = [x for x in streams.values() if x["kind"] == fam and x["facade"] == F.idx and abs(x["z_top"] - ze) < 0.05
              and sa - 0.05 <= x["axis"] <= sb + 0.05]
        if st:
            x = min(st, key=lambda x: abs(x["axis"] - 0.5 * (sa + sb)))
            lo, hi = float(x["s0"]), float(x["s1"])
        else:
            lo, hi = sa + (sb - sa) / 3.0, sb - (sb - sa) / 3.0
        out.append(dict(key=f"{fam}:{F.name}:{trim}:{0.5 * (sa + sb):.2f}", kind=fam, lo=lo, hi=hi,
                        wet=wet_at(min(lo, hi) - 0.02, max(lo, hi) + 0.02), point=True))
    elif fam == "impost":
        # the impost over one pier: its bloom anywhere along the pier's middle
        q = 0.2 * (sb - sa)
        out.append(dict(key=f"impost:{F.name}:{sa:.2f}:{sb:.2f}", kind="impost", lo=sa + q, hi=sb - q,
                        wet=wet_at(sa, sb), point=False))
    else:
        # a course: a site to each unit, its bloom anywhere along it
        kind = fam if fam in SITE_P else "trim"
        n = max(1, int(round((sb - sa) / UNIT)))
        for i in range(n):
            a = sa + (sb - sa) * i / n; b = sa + (sb - sa) * (i + 1) / n
            out.append(dict(key=f"{kind}:{F.name}:{trim}:{ze:.2f}:{a:.2f}", kind=kind, lo=a, hi=b, wet=wet_at(a, b),
                            point=False))
    return out


# ---------------------------------------------------------------------------------------------------- the course grid
def course_grid(blk):
    """The level courses of the wall's brick, measured on the model: every brick-class material whose texture V is the
    world z on each object's walls (a = +-1, exactly), its tile and course from its own Mapping node and height map, and
    per (object, material) the phase of its bed joints: they stand at z = (k + phase) COURSE_H. The arch rings' UVs run
    round the arch and fit no level grid, so they have none."""
    import bpy, os
    mats = {}
    for i, nm in enumerate(blk.mat_names):
        if blk.mat_class[i] != classes.BRICK: continue
        m = bpy.data.materials.get(nm)
        if m is None or m.node_tree is None: continue
        nt = m.node_tree
        base = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and 'basecolor' in n.image.name.lower()), None)
        mp = [n for n in nt.nodes if n.type == 'MAPPING']
        uvn = [n for n in nt.nodes if n.type == 'UVMAP']
        if base is None or len(mp) != 1 or len(uvn) != 1: continue
        mp = mp[0]
        assert mp.vector_type == 'POINT' and max(abs(x) for x in mp.inputs['Rotation'].default_value) < 1e-9, \
            f"efflorescence: {nm}'s mapping is rotated"
        sy, ly = float(mp.inputs['Scale'].default_value[1]), float(mp.inputs['Location'].default_value[1])
        try: fp = bpy.path.abspath(base.image.filepath, library=base.image.library)
        except TypeError: fp = bpy.path.abspath(base.image.filepath)
        hp = os.path.join(os.path.dirname(os.path.normpath(fp)), "height.png")
        if not os.path.isfile(hp): continue
        img = bpy.data.images.load(hp, check_existing=True); img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        buf = np.empty(w * h * img.channels, np.float32); img.pixels.foreach_get(buf)
        H = buf.reshape(h, w, img.channels)[:, :, 0]          # row 0 = v 0, the image's bottom
        q = np.quantile(H, [0.5])
        bed = (H < q[0] - 0.04).mean(axis=1) > 0.5              # rows that are almost all joint: the bed joints
        starts = np.nonzero(bed & ~np.roll(bed, 1))[0]
        n = len(starts)
        if n < 2: continue
        cen, half = [], []
        for a in starts:
            b = a
            while bed[(b + 1) % h]: b += 1
            cen.append(((a + b) / 2.0 + 0.5) / h); half.append((b - a + 1) / 2.0 / h)
        cen = np.array(cen)
        # the joints' phase in the tile, as a share of a course: a circular mean of each centre's offset from k / n
        off = cen * n - np.round(cen * n)
        phi = float(np.angle(np.mean(np.exp(2j * np.pi * off))) / (2 * np.pi))
        course = 1.0 / (sy * n)
        mats[nm] = dict(course=course, phi=phi, n=n, sy=sy, ly=ly, uv=uvn[0].uv_map, half=float(np.median(half)) / sy,
                        spread=float(np.abs(off - phi).max()) * course)
    grid = {}                                                   # (object, material) -> phase
    level, other = {}, {}
    for d in blk.inst:
        if d["instancer"] is not None: continue
        o = bpy.data.objects.get(d["object"])
        if o is None or o.type != 'MESH' or not o.data.uv_layers: continue
        me = o.data
        for si, slot in enumerate(o.material_slots):
            m = slot.material
            if m is None or m.name_full not in mats: continue
            md = mats[m.name_full]
            uvl = me.uv_layers.get(md["uv"]) if md["uv"] else next((l for l in me.uv_layers if l.active_render), None)
            uvl = uvl or me.uv_layers.active
            M = np.array(o.matrix_world)
            co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
            W = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
            uv = np.empty(len(me.loops) * 2); uvl.data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
            vi = np.empty(len(me.loops), np.int64); me.loops.foreach_get("vertex_index", vi)
            npo = len(me.polygons)
            pm = np.empty(npo, np.int64); me.polygons.foreach_get("material_index", pm)
            ls = np.empty(npo, np.int64); me.polygons.foreach_get("loop_start", ls)
            lt = np.empty(npo, np.int64); me.polygons.foreach_get("loop_total", lt)
            pn = np.empty(npo * 3); me.polygons.foreach_get("normal", pn)
            pn = pn.reshape(-1, 3) @ M[:3, :3].T
            pn /= np.maximum(np.linalg.norm(pn, axis=1), 1e-12)[:, None]
            sel = np.nonzero((pm == si) & (np.abs(pn[:, 2]) < 0.3))[0]
            if not len(sel): continue
            loops = np.concatenate([np.arange(ls[p], ls[p] + lt[p]) for p in sel])
            z = W[vi[loops], 2]; v = uv[loops, 1]
            A_ = np.stack([z, np.ones_like(z)], axis=1)
            (a, b), *_ = np.linalg.lstsq(A_, v, rcond=None)
            err = float(np.abs(A_ @ np.array([a, b]) - v).max()) if len(z) else 0.0
            key = (o.name, m.name_full)
            if abs(abs(a) - 1.0) > 1e-4 or err > 1e-4:
                other[key] = round(float(a), 4); continue
            a = round(float(a))
            # the joints stand at V_tex = sy V + ly = (k + phi) / n, and V = a z + b: z = ((k + phi) course - ly / sy - b) / a
            z0 = (md["phi"] / (md["sy"] * md["n"]) - md["ly"] / md["sy"] - b) / a
            ph = (z0 / md["course"]) % 1.0
            if ph > 1.0 - 1e-3: ph = 0.0
            grid[key] = ph
            level[key] = (a, round(ph, 4))
    return mats, grid, level, other


# ---------------------------------------------------------------------------------------------------- the elevation
class Elevation(runoff.Elevation):
    """runoff's elevation (2 cm, the fire escapes looked through), with each texel's material too: whether the brick
    there lies on the wall's level courses is its material's and object's business."""

    def arrays(self, f):
        a = super().arrays(f)
        if "M" not in a: a["M"] = np.full(a["D"].shape, -1, np.int32)
        return a

    def _cast(self, f, rows, cols):
        from mathutils import Vector
        a = self.arrays(f); F = FACADES[f]; bvh = self.block.bvh
        tri_class, tri_inst, tri_mat, skip = self.block.tri_class, self.block.tri_inst, self.block.tri_mat, self.see_through
        dirv = Vector((-F.n[0], -F.n[1], 0.0))
        planes = [(g.n[0], g.n[1], g.c_n) for g in FACADES]
        nx, ny, cn = F.n[0], F.n[1], F.c_n
        for r, c in zip(rows.tolist(), cols.tolist()):
            s = F.s0 + (c + 0.5) * RES; z = ATLAS.z0 + (r + 0.5) * RES
            o = Vector(F.world(s, runoff.D_FROM, z)); reach = runoff.REACH
            while True:
                loc, _, t, dist = bvh.ray_cast(o, dirv, reach)
                self.rays += 1
                if loc is None or not skip[tri_inst[t]]: break
                o = loc + dirv * 0.002; reach -= dist + 0.002
            a["done"][r, c] = True
            if loc is None: continue
            if s < runoff.END_ZONE or s > F.L - runoff.END_ZONE:
                ds = [px * loc.x + py * loc.y - pc for px, py, pc in planes]
                if max(range(len(ds)), key=ds.__getitem__) != f: continue
            a["D"][r, c] = nx * loc.x + ny * loc.y - cn
            a["C"][r, c] = tri_class[t]; a["I"][r, c] = tri_inst[t]; a["M"][r, c] = tri_mat[t]

    def cells4(self, f, rows, cols):
        a = self.arrays(f)
        rr = np.asarray(rows, int); cc = np.asarray(cols, int)
        todo = ~a["done"][rr, cc]
        if todo.any(): self._cast(f, rr[todo], cc[todo])
        return (a["D"][rr, cc].astype(np.float64), a["C"][rr, cc].astype(np.int32), a["I"][rr, cc], a["M"][rr, cc])


class Grid:
    """The level course grid per texel: the phase of the brick the street sees (nan where it is not level brick)."""

    def __init__(self, blk, grid):
        self.phase = np.full((len(blk.inst), len(blk.mat_names)), np.nan)
        by_obj = {}
        for i, d in enumerate(blk.inst): by_obj.setdefault(d["object"], []).append(i)
        mix = {n: j for j, n in enumerate(blk.mat_names)}
        for (on, mn), ph in grid.items():
            for i in by_obj.get(on, []):
                if blk.inst[i]["instancer"] is None and mn in mix: self.phase[i, mix[mn]] = ph

    def of(self, I, M):
        I = np.asarray(I); M = np.asarray(M)
        ok = (I >= 0) & (M >= 0)
        out = np.full(I.shape, np.nan)
        out[ok] = self.phase[I[ok], M[ok]]
        return out


def walk(el, gr, f, cols, r0, ph, n_rows):
    """The bloom's brick down each of `cols` from its row r0 (the brick right under the edge): it runs on while the
    surface is brick on the same level courses, stepping out at most CATCH and back at most CREEP. Returns (last, why):
    the last row it is on, counted down from r0, and why it stopped."""
    cols = np.asarray(cols, int); r0 = np.asarray(r0, int); m = len(cols)
    last = np.zeros(m, int); why = np.full(m, STOP_LENGTH, np.int8)
    D0, _, _, _ = el.cells4(f, r0, cols)
    d_prev = D0.copy()
    alive = np.ones(m, bool)
    for k in range(1, n_rows):
        r = r0 - k
        ia = np.nonzero(alive & (r >= 0))[0]
        if not len(ia): break
        d, c, i, mt = el.cells4(f, r[ia], cols[ia])
        fin = np.isfinite(d)
        step = np.where(fin, d - d_prev[ia], -1.0)
        caught = fin & (step > CATCH)
        edge = ~caught & (step < -CREEP)
        other = ~caught & ~edge & (c != classes.BRICK)
        pg = gr.of(i, mt)
        off = ~caught & ~edge & ~other & ~(np.abs(np.nan_to_num(pg, nan=9.0) - ph[ia]) < 1e-3)
        stop = caught | edge | other | off
        why[ia[caught]] = STOP_CAUGHT; why[ia[edge]] = STOP_EDGE; why[ia[other]] = STOP_MATERIAL; why[ia[off]] = STOP_GRID
        alive[ia[stop]] = False
        on = ia[~stop]
        last[on] = k; d_prev[on] = d[~stop]
    return last, why


# ---------------------------------------------------------------------------------------------------- the edges
def find_edges(ctx, el, gr):
    """Every column (2 cm) of every face where trim stands directly over level brick, set into it: per face a list of
    dict(c, r0 (the brick row under the edge), z (the edge), d_trim, d_brick, trim (instance), brick (instance), phase).
    Candidates come from 565's 5 cm elevation; each is settled on runoff's 2 cm grid."""
    fr = ctx.field("soiling", "front")
    r5 = fr["res"]; C5 = np.asarray(fr["cls"], np.int32); D5 = np.asarray(fr["depth"], np.float64)
    blk = ctx.block
    names = [d["object"] for d in blk.inst]
    out, skipped = {}, dict(ring=0, drop=0)
    for F in FACADES:
        f = F.idx
        a0, a1 = ATLAS.cols(F, r5)
        C = C5[:, a0:a1]; D = D5[:, a0:a1]
        dd = np.nan_to_num(D[1:] - D[:-1], nan=-9.0)
        cand = np.isin(C[1:], TRIM) & (C[:-1] == classes.BRICK) & (dd >= -SET_BACK - r5) & (dd <= DRIP_MAX + r5)
        cell = np.zeros(C.shape, bool); cell[1:] |= cand; cell[:-1] |= cand
        g = cell.copy()                                         # grown a cell every way: the 2 cm pass settles it
        g[1:] |= cell[:-1]; g[:-1] |= cell[1:]
        h = g.copy(); h[:, 1:] |= g[:, :-1]; h[:, :-1] |= g[:, 1:]
        W2 = el.width(f); H2 = el.H
        r5_of = np.clip(np.floor((z_at(np.arange(H2)) - ATLAS.z0) / r5).astype(int), 0, C.shape[0] - 1)
        c5_of = np.clip(np.floor((s_at(f, np.arange(W2)) - F.s0) / r5).astype(int), 0, C.shape[1] - 1)
        need = h[r5_of[:, None], c5_of[None, :]]
        rr, cc = np.nonzero(need)
        if not len(rr): continue
        Dg, Cg, Ig, Mg = el.cells4(f, rr, cc)
        a = el.arrays(f)
        # the transitions: trim at row r + 1 over brick at row r, both cast
        both = need[:-1] & need[1:]
        tr = both & np.isin(a["C"][1:], TRIM) & (a["C"][:-1] == classes.BRICK)
        rows, cols = np.nonzero(tr)
        found = []
        for r, c in zip(rows.tolist(), cols.tolist()):
            d_t, d_b = float(a["D"][r + 1, c]), float(a["D"][r, c])
            if not (-SET_BACK <= d_t - d_b <= DRIP_MAX): continue
            ph = float(gr.of(a["I"][r, c], a["M"][r, c]))
            if not np.isfinite(ph):
                skipped["ring"] += 1; continue
            found.append(dict(c=c, r0=r, z=float(z_at(r)) + 0.5 * RES, d_trim=d_t, d_brick=d_b,
                              trim=int(a["I"][r + 1, c]), brick=int(a["I"][r, c]), phase=ph,
                              fam=family_of(names[int(a["I"][r + 1, c])])))
        out[f] = found
    return out, skipped


def refine(blk, f, e):
    # the edge's own height: a ray straight up from just in front of the brick under it meets the trim's underside
    F = FACADES[f]
    s = float(s_at(f, e["c"]))
    h = blk.ray(F.world(s, e["d_brick"] + 0.004, float(z_at(e["r0"]))), (0.0, 0.0, 1.0), 0.05)
    if h is not None and h.cls in TRIM and abs(h.z - e["z"]) <= 0.025: return float(h.z)
    return e["z"]


def group_runs(found):
    """The edge columns of one face in runs: consecutive columns of one trim family and one course grid whose edge stays
    within RUN_DZ of its neighbour's."""
    runs = []
    for e in sorted(found, key=lambda e: (e["fam"], round(e["phase"], 3), e["c"], -e["z"])):
        for run in reversed(runs[-8:]):
            p = run[-1]
            if (p["fam"] == e["fam"] and abs(p["phase"] - e["phase"]) < 1e-3 and 0 < e["c"] - p["c"] <= 1
                    and abs(p["z"] - e["z"]) <= RUN_DZ):
                run.append(e); break
        else:
            runs.append([e])
    return [r for r in runs if len(r) * RES >= MIN_RUN - 1e-9]


# ---------------------------------------------------------------------------------------------------- painting
class Face:
    """One face's mask at 2 cm while it is laid out: per texel the owner (a mark's index, -1 none), the amount, the
    bloom as the joints take it there (what decides between two marks), the edge's height, the e-fold and the phase;
    painted into the atlas through each mark at the end."""

    def __init__(self, f, H, W):
        self.f, self.H, self.W = f, H, W
        self.own = np.full((H, W), -1, np.int32)
        self.A = np.zeros((H, W)); self.ZE = np.zeros((H, W)); self.E = np.zeros((H, W)); self.P = np.zeros((H, W))
        self.V = np.zeros((H, W))
        self.conflicts = 0

    def lay(self, k, c, r_lo, r_hi, amp, z_edge, e, ph):
        """Column c, rows r_lo..r_hi (inclusive) to mark k, wherever nothing is there yet or it blooms more than what
        is (two sites' blooms that meet: the stronger shows); amp and e a number or one per row (r_lo first)."""
        n = r_hi - r_lo + 1
        amp = np.broadcast_to(np.asarray(amp, np.float64), (n,)); e = np.broadcast_to(np.asarray(e, np.float64), (n,))
        a, b = max(r_lo, 0), min(r_hi, self.H - 1)
        if b < a or not (0 <= c < self.W): return
        amp, e = amp[a - r_lo:b - r_lo + 1], e[a - r_lo:b - r_lo + 1]
        sl = slice(a, b + 1)
        _, pf, pj = course_values(z_at(np.arange(a, b + 1)), z_edge, ph, e)
        v = amp * np.maximum(pf, pj)
        free = self.own[sl, c] < 0
        take = free | (v > self.V[sl, c])
        self.conflicts += int((~free).sum())
        self.own[sl, c] = np.where(take, k, self.own[sl, c])
        self.A[sl, c] = np.where(take, amp, self.A[sl, c])
        self.V[sl, c] = np.where(take, v, self.V[sl, c])
        self.ZE[sl, c] = np.where(take, z_edge, self.ZE[sl, c])
        self.E[sl, c] = np.where(take, e, self.E[sl, c])
        self.P[sl, c] = np.where(take, ph, self.P[sl, c])

    def pad(self):
        """PAD texels round every mark take its neighbour's edge, e-fold and phase at no amount, so the lookup's filter
        never mixes them with nothing."""
        for _ in range(PAD):
            grown = self.own.copy()
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                sh = np.full_like(self.own, -1)
                rs, re_ = max(dr, 0), self.H + min(dr, 0); cs, ce = max(dc, 0), self.W + min(dc, 0)
                sh[rs:re_, cs:ce] = self.own[rs - dr:re_ - dr, cs - dc:ce - dc]
                take = (grown < 0) & (sh >= 0)
                if not take.any(): continue
                src_r = np.clip(np.arange(self.H)[:, None] - dr, 0, self.H - 1)
                src_c = np.clip(np.arange(self.W)[None, :] - dc, 0, self.W - 1)
                grown[take] = sh[take]
                for arr in (self.ZE, self.E, self.P):
                    arr[take] = arr[np.broadcast_to(src_r, (self.H, self.W))[take],
                                    np.broadcast_to(src_c, (self.H, self.W))[take]]
                self.A[take] = 0.0
            self.own = grown

    def paint(self, ctx, marks):
        F = FACADES[self.f]
        Z = z_at(np.arange(self.H))[:, None]
        T = np.clip((self.ZE - Z + T_NEG) / T_SPAN, 0.0, 1.0)
        Ev = np.clip(self.E / E_SPAN, 0.0, 1.0)
        rr, cc = np.nonzero(self.own >= 0)
        ks = self.own[rr, cc]
        n = len(marks)
        r_lo = np.full(n, self.H); r_hi = np.full(n, -1); c_lo = np.full(n, self.W); c_hi = np.full(n, -1)
        np.minimum.at(r_lo, ks, rr); np.maximum.at(r_hi, ks, rr); np.minimum.at(c_lo, ks, cc); np.maximum.at(c_hi, ks, cc)
        for k in range(n):
            if r_hi[k] < 0: continue
            a, b, c, d = int(r_lo[k]), int(r_hi[k]), int(c_lo[k]), int(c_hi[k])
            box = self.own[a:b + 1, c:d + 1] == k
            s0 = F.s0 + c * RES + 0.25 * RES; s1 = F.s0 + (d + 1) * RES - 0.25 * RES
            z0 = ATLAS.z0 + a * RES + 0.25 * RES; z1 = ATLAS.z0 + (b + 1) * RES - 0.25 * RES
            for ch, arr in ((0, self.A), (1, T), (2, Ev), (3, self.P)):
                ctx.paint(marks[k], np.where(box, arr[a:b + 1, c:d + 1], 0.0), s0, s1, z0, z1, channel=ch, op="max")


# ---------------------------------------------------------------------------------------------------- build
def bloom_columns(el, gr, f, run, b, n_rows):
    """The columns a site's bloom covers, from its left end to its right: its run's own, as walked, and past them brick
    standing at the run's brick depth (DEPTH_TOL) on the same courses, walked down from the run's edge: a bloom spreads
    through the wall, not only under its own trim. Returns (cols, r0, last, why, z_edge)."""
    lo, hi = b["deep"] - b["half_l"], b["deep"] + b["half_r"]
    j = np.nonzero((run["S"] >= lo) & (run["S"] <= hi))[0]
    cols, r0, last, why, ze = run["cols"][j], run["r0"][j], run["last"][j], run["why"][j], run["zs"][j]
    c_lo = max(runoff.col_of(f, lo), 0); c_hi = min(runoff.col_of(f, hi), el.width(f) - 1)
    ext = np.setdiff1d(np.arange(c_lo, c_hi + 1), run["cols_all"])      # not under the run's own trim
    if len(ext):
        r_e = runoff.row_below(run["ze"])
        D0, C0, I0, M0 = el.cells4(f, np.full(len(ext), r_e), ext)
        ok = ((C0 == classes.BRICK) & (np.abs(np.nan_to_num(gr.of(I0, M0), nan=9.0) - run["ph"]) < 1e-3)
              & (np.abs(np.nan_to_num(D0, nan=9.0) - run["db"]) <= DEPTH_TOL))
        ext = ext[ok]
    if len(ext):
        le, we = walk(el, gr, f, ext, np.full(len(ext), r_e), np.full(len(ext), run["ph"]), n_rows)
        deep = (le + 1) * RES >= MIN_DROP - 1e-9
        n = int(deep.sum())
        cols = np.concatenate([cols, ext[deep]]); r0 = np.concatenate([r0, np.full(n, r_e)])
        last = np.concatenate([last, le[deep]]); why = np.concatenate([why, we[deep]])
        ze = np.concatenate([ze, np.full(n, run["ze"])])
    o = np.argsort(cols, kind="stable")
    return cols[o], r0[o], last[o], why[o], ze[o]


def build(ctx):
    import time
    t0 = time.time()
    blk = ctx.block
    mats, grid, level, other = course_grid(blk)
    assert mats, "efflorescence: no brick material with a height map and a level mapping"
    for nm, md in mats.items():
        assert abs(md["course"] - COURSE_H) < 1e-6, f"efflorescence: {nm}'s course is {md['course']:.6f}, not {COURSE_H:.6f}"
        assert abs(md["half"] - (JOINT_HALF - 0.0005)) < 0.0015, f"efflorescence: {nm}'s bed joints are {md['half']:.4f} half"
    assert grid, "efflorescence: no object's brick lies on level courses"
    phases = sorted({round(v, 3) for v in grid.values()})
    ctx.log(f"   efflorescence: level brick in {len(grid)} object(s) of " + ", ".join(
        f"{nm} (tile {1.0 / md['sy']:.3f} m, {md['n']} courses of {md['course'] * 100:.3f} cm, joints {md['half'] * 2000:.1f} mm, "
        f"within {md['spread'] * 1000:.1f} mm of the grid)" for nm, md in mats.items())
        + f"; phases {phases}; not level (the arch rings): {len(other)}")
    gr = Grid(blk, grid)
    el = Elevation(blk)
    found, skipped = find_edges(ctx, el, gr)
    # the field as float64 once (soiling.sample converts what it is given at every call)
    wetf = ctx.field("runoff", "field"); wetf = dict(wetf, data=np.asarray(wetf["data"], np.float64))
    streams = {x["source"]: x for x in ctx.field("runoff", "streaks")}      # 564's streams, by their source
    anchors = ctx.field("rust", "anchors")
    rust_streaks = ctx.field("rust", "streaks")
    H = el.H
    n_rows = int(math.ceil((REACH_MAX + COURSE_H) / RES)) + 2
    faces, marks, pub_src, pub_sites, stops = {}, [], [], [], {}
    n_runs = 0
    # the fixings into the sills: their water gets into the sill they are fixed to, and out of it into the brick below
    sill_fix = [a for a in anchors if a["wall_class"] in ("terracotta", "stone")]

    def edge_wet(f, S, zs):
        # the water crossing an edge: the runoff's deposit just under it
        return np.clip(np.maximum(soiling.sample(wetf, f, S, zs - 0.02), soiling.sample(wetf, f, S, zs - 0.05)), 0.0, 1.0)

    def stop(w):
        stops[STOP_NAMES[int(w)]] = stops.get(STOP_NAMES[int(w)], 0) + 1

    def bloom(fc, run, site, b):
        """One leaking site's bloom, laid on its face as the mark of a source of its own (the leak: a point, or the
        stretch of the edge it runs along). Returns its entry for `sources`, or None where no brick takes it."""
        f, F, kind = run["f"], run["F"], site["kind"]
        cols, r0, last, why, ze = bloom_columns(el, gr, f, run, b, n_rows)
        if not len(cols): return None
        S = s_at(f, cols)
        # across it: its e-fold and its amount fall from the leak to nothing at its ends, the amount a little slower
        tp = bell(S, b, b["round"]); pk = bell(S, b, fade(b)); sw = spread(b["half"])
        fix = site.get("fix")
        we = edge_wet(f, S, ze)
        if fix: we = np.maximum(we, fix * pk)
        if site.get("anchor"):
            a = next(x for x in sill_fix if x["id"] == site["anchor"])
            pts, kw = [F.world(a["s"], a["d_wall"], a["z"])], dict(anchor=a["id"])
        elif site["point"]:
            pts, kw = [F.world(b["deep"], run["db"] + 0.03, run["ze"])], {}
        else:
            s0 = max(b["deep"] - b["half_l"], float(S.min())); s1 = min(b["deep"] + b["half_r"], float(S.max()))
            pts, kw = [F.world(s0, run["db"] + 0.03, run["ze"]), F.world(s1, run["db"] + 0.03, run["ze"])], {}
        src = ctx.source(site["key"], "point" if len(pts) == 1 else "line", pts, facade=f, what=kind,
                         object=run["trim"], wall=run["brick"], phase=round(run["ph"], 4), **kw)
        mk = ctx.mark(src, f, what=kind); k = len(marks); marks.append(mk)
        for j in range(len(cols)):
            r_hi = int(r0[j]) + PAD_UP; r_lo = int(r0[j]) - int(last[j])
            # down the wall the water is the runoff's there (a stream's widens and fades as it runs down) or the
            # fixing's spreading; above the edge (the course the edge cuts) the edge's own
            zc = z_at(np.arange(r_lo, r_hi + 1)); t = ze[j] - zc
            wr = soiling.sample(wetf, f, np.full(len(zc), S[j]), np.minimum(zc, ze[j] - 0.02))
            if fix: wr = np.maximum(wr, fix * pk[j] * np.exp(-np.maximum(t, 0.0) / FIX_E))
            wr = np.clip(np.maximum(wr, np.where(t < 0.02, we[j], 0.0)), 0.0, 1.0)
            fc.lay(k, int(cols[j]), r_lo, r_hi, np.clip(b["amount"] * sw * (A_BASE + A_WET * wr) * pk[j], 0.0, 1.0),
                   float(ze[j]), E_BASE * (1.0 + E_WET * wr) * b["reach"] * tp[j], run["ph"])
            stop(why[j])
        # the path the debug view draws: from the edge at its deepest point down to where its joints stop
        jd = int(np.argmin(np.abs(S - b["deep"])))
        rch = float(reach_of(E_BASE * (1.0 + E_WET * we[jd]) * b["reach"] * tp[jd]))
        zb = max(float(ze[jd]) - rch, float(z_at(int(r0[jd]) - int(last[jd]))) - 0.5 * RES)
        ctx.path(mk, [F.world(float(S[jd]), run["db"] + 0.02, float(ze[jd])), F.world(float(S[jd]), run["db"] + 0.02, zb)])
        return dict(id=site["key"], kind=kind, facade=f, s0=round(float(S.min()) - 0.5 * RES, 3),
                    s1=round(float(S.max()) + 0.5 * RES, 3), z=round(run["ze"], 3), d_edge=round(run["dt"], 3),
                    d_wall=round(run["db"], 3), phase=round(run["ph"], 4), wet=round(site["wet"], 3),
                    amp=round(float(np.clip(b["amount"] * sw * (A_BASE + A_WET * max(site["wet"], fix or 0.0)), 0.0,
                                            1.0)), 3),
                    reach=round(rch, 3), **outline(b), object=run["trim"], wall=run["brick"], **kw)

    n_joined = 0
    for F in FACADES:
        f = F.idx
        fc = Face(f, H, el.width(f)); faces[f] = fc
        drawn = []                                          # the face's sites and their draws: (run, site, p, bloom)
        for run in group_runs(found.get(f, [])):
            cols = np.array([e["c"] for e in run]); r0 = np.array([e["r0"] for e in run])
            zs = np.array([refine(blk, f, e) for e in run])
            ph = run[0]["phase"]
            fam = run[0]["fam"]
            S = s_at(f, cols)
            last, why = walk(el, gr, f, cols, r0, np.full(len(cols), ph), n_rows)
            # the brick must run on under the edge: the gaps between a cornice's dentils are not a source
            deep = (last + 1) * RES >= MIN_DROP - 1e-9
            if not deep.any():
                skipped["drop"] += len(cols); continue
            skipped["drop"] += int((~deep).sum())
            keep = np.nonzero(deep)[0]
            rn = dict(f=f, F=F, fam=fam, ph=ph, sa=float(S[keep].min()) - 0.5 * RES, sb=float(S[keep].max()) + 0.5 * RES,
                      ze=float(np.median(zs[keep])), db=float(np.median([run[j]["d_brick"] for j in keep])),
                      dt=float(np.median([run[j]["d_trim"] for j in keep])),
                      trim=blk.inst[run[keep[0]]["trim"]]["object"], brick=blk.inst[run[keep[0]]["brick"]]["object"],
                      cols=cols[keep], cols_all=np.unique(cols), r0=r0[keep], last=last[keep], why=why[keep],
                      zs=zs[keep], S=S[keep])
            n_runs += 1

            def wet_at(s0, s1, rn=rn):
                # the most water crossing the run's edge between s0 and s1
                s = np.arange(s0, s1 + 1e-9, RES) if s1 > s0 else np.array([s0])
                return float(edge_wet(rn["f"], s, np.full(len(s), rn["ze"])).max())

            # the sites along the run: each leaks or not, from its own seed; a leak's bloom is its own
            for site in sites_of(rn, wet_at, streams, sill_fix):
                p, b = site_draw(site["key"], site["kind"], site["wet"], site["lo"], site["hi"], site.get("span"))
                drawn.append((rn, site, p, b))
        # one wet stretch, one bloom; then each leak that keeps its own bloom lays it
        n_joined += join(drawn)
        for rn, site, p, b in drawn:
            entry = bloom(fc, rn, site, b) if b is not None and not b.get("joined") else None
            if entry is not None: pub_src.append(entry)
            pub_sites.append(dict(key=site["key"], kind=site["kind"], facade=f, s0=round(site["lo"], 3),
                                  s1=round(site["hi"], 3), z=round(rn["ze"], 3), wet=round(site["wet"], 3),
                                  p=round(p, 4), leaks=b is not None, laid=entry is not None,
                                  **(dict(joined=b["joined"]) if b is not None and b.get("joined") else {})))
    # the fixings into brick: each leaks or not, and a leak's bloom lies round the fixing, kept off the rust stain its
    # streak draws
    for a in anchors:
        if a["wall_class"] != "brick": continue
        f = a["facade"]; F = FACADES[f]; fc = faces[f]
        key = f"fixing:{a['id']}"
        p, b = site_draw(key, "anchor", a["wet"], a["s"], a["s"])
        entry = dict(key=key, kind="anchor", facade=f, s0=round(a["s"], 3), s1=round(a["s"], 3), z=round(a["z"], 3),
                     wet=round(a["wet"], 3), p=round(p, 4), leaks=b is not None, laid=False)
        pub_sites.append(entry)
        if b is None: continue
        c_lo = runoff.col_of(f, b["deep"] - b["half_l"]); c_hi = runoff.col_of(f, b["deep"] + b["half_r"])
        cols = np.arange(max(c_lo, 0), min(c_hi, fc.W - 1) + 1)
        ze = a["z"] + ANC_UP
        r0 = runoff.row_below(ze)
        D0, C0, I0, M0 = el.cells4(f, np.full(len(cols), r0), cols)
        ph_c = gr.of(I0, M0)
        ok = np.isfinite(ph_c) & (np.abs(np.nan_to_num(D0, nan=9.0) - a["d_wall"]) <= DEPTH_TOL)
        if not ok.any(): continue
        ph = float(np.median(ph_c[ok]))
        cols = cols[ok]
        S = s_at(f, cols)
        # no trim here: the salt is the brick's and the mortar's own, brought out by the water the fixing lets in, so
        # the amount is the water's alone, spreading from the fixing as the bell does
        tp = bell(S, b, b["round"]); pk = bell(S, b, fade(b)); sw = spread(b["half"])
        lat = a["wet"] * pk
        last, why = walk(el, gr, f, cols, np.full(len(cols), r0), np.full(len(cols), ph), n_rows)
        src = ctx.source(key, "point", [F.world(a["s"], a["d_wall"], a["z"])], facade=f, what="anchor",
                         anchor=a["id"], wall=a["wall"])
        mk = ctx.mark(src, f, what="anchor"); k = len(marks); marks.append(mk)
        for j in range(len(cols)):
            r_lo, r_hi = r0 - int(last[j]), r0 + PAD_UP
            t = ze - z_at(np.arange(r_lo, r_hi + 1))
            wr = np.clip(lat[j] * np.exp(-np.maximum(t, 0.0) / ANC_E), 0.0, 1.0)
            fc.lay(k, int(cols[j]), r_lo, r_hi, np.clip(b["amount"] * sw * A_WET * wr, 0.0, 1.0), ze,
                   E_BASE * (1.0 + E_WET * wr) * b["reach"] * tp[j], ph)
            stop(why[j])
        jd = int(np.argmin(np.abs(S - b["deep"])))
        rch = float(reach_of(E_BASE * (1.0 + E_WET * lat[jd]) * b["reach"] * tp[jd]))
        ctx.path(mk, [F.world(float(S[jd]), a["d_wall"] + 0.02, ze), F.world(float(S[jd]), a["d_wall"] + 0.02, ze - rch)])
        pub_src.append(dict(id=key, kind="anchor", facade=f, s0=round(float(S.min()) - 0.5 * RES, 3),
                            s1=round(float(S.max()) + 0.5 * RES, 3), z=round(ze, 3), d_edge=round(a["d_wall"], 3),
                            d_wall=round(a["d_wall"], 3), phase=round(ph, 4), wet=round(a["wet"], 3),
                            amp=round(float(np.clip(b["amount"] * sw * A_WET * lat.max(), 0.0, 1.0)), 3),
                            reach=round(rch, 3), **outline(b), object=None, wall=a["wall"], anchor=a["id"]))
        entry["laid"] = True
    # the rust stain is kept clear, then every face is padded for the lookup's filter and painted
    field = np.zeros(ATLAS.shape(RES), np.float32)
    conflicts = 0
    for f, fc in faces.items():
        F = FACADES[f]
        rr, cc = np.nonzero(fc.own >= 0)
        if len(rr): fc.A[rr, cc] *= rust_keep(rust_streaks, f, s_at(f, cc), z_at(rr))
        conflicts += fc.conflicts
        # the bloom as the joints take it, per course, for any feature that follows
        if len(rr):
            inside, pf, pj = course_values(z_at(rr), fc.ZE[rr, cc], fc.P[rr, cc], fc.E[rr, cc])
            a0, _ = ATLAS.cols(F, RES)
            field[rr, a0 + cc] = np.maximum(field[rr, a0 + cc], (fc.A[rr, cc] * np.maximum(pj, pf)).astype(np.float32))
        fc.pad()
        fc.paint(ctx, marks)
    H2, W2 = field.shape[0] // 2, field.shape[1] // 2
    pooled = field[:H2 * 2, :W2 * 2].reshape(H2, 2, W2, 2).max(axis=(1, 3)).astype(np.float16)
    ctx.publish("sources", pub_src)
    ctx.publish("sites", pub_sites)
    ctx.publish("courses", dict(course=COURSE_H, joint_half=JOINT_HALF, phases={f"{o}|{m}": round(p, 4) for (o, m), p in
                                                                             sorted(grid.items())},
                                materials={nm: dict(tile=round(1.0 / md["sy"], 6), courses=md["n"],
                                                    joint_mm=round(md["half"] * 2000, 2)) for nm, md in mats.items()},
                                note=("the wall brick's level courses: its bed joints stand at z = (k + phase) * course "
                                      "for integer k, the phase per (object|material); the arch rings have none")))
    ctx.publish("field", dict(res=2 * RES, z0=ATLAS.z0, data=pooled, atlas=ATLAS.to_dict(), note=(
        "the bloom as the mortar joints take it (0..1: its amount times the joints' per-course profile), max-pooled to "
        "4 cm, rows from z0 up")))
    ctx.log(f"   efflorescence: {n_runs} trim runs, {len(pub_sites)} sites (with the fixings), "
            f"{sum(1 for s in pub_sites if s['leaks'])} leak, {n_joined} joined into a neighbour's bloom, "
            f"{len(pub_src)} bloom; {el.rays} rays; "
            f"{skipped['ring']} edge columns over the arch rings and {skipped['drop']} over too little brick left out; "
            f"{conflicts} texels claimed twice; {time.time() - t0:.1f} s")
    for k in ("sill_end", "sill_bed", "anchor_sill", "bracket", "capital", "springing", "band", "impost", "crown", "trim",
              "anchor"):
        ss = [s for s in pub_sites if s["kind"] == k]
        if not ss: continue
        bb = [s for s in pub_src if s["kind"] == k]
        line = (f"   efflorescence {KIND_LABEL.get(k, k):<22} {len(ss):4d} sites, wet {np.median([s['wet'] for s in ss]):.2f} "
                f"({min(s['wet'] for s in ss):.2f}..{max(s['wet'] for s in ss):.2f}), chance "
                f"{np.median([s['p'] for s in ss]):.3f} ({min(s['p'] for s in ss):.3f}..{max(s['p'] for s in ss):.3f}); "
                f"{len(bb)} bloom")
        if bb:
            line += (f": amount {np.median([s['amp'] for s in bb]):.2f} ({min(s['amp'] for s in bb):.2f}.."
                     f"{max(s['amp'] for s in bb):.2f}), half-width {min(s['half'] for s in bb):.2f}.."
                     f"{max(s['half'] for s in bb):.2f} m, joints reach {min(s['reach'] for s in bb):.2f}.."
                     f"{max(s['reach'] for s in bb):.2f} m")
        ctx.log(line)
    ctx.log("   efflorescence blooms by face: " + ", ".join(
        f"{G.name} {sum(1 for s in pub_src if s['facade'] == G.idx)}" for G in FACADES))
    for s in sorted(pub_src, key=lambda s: (s["facade"], s["z"], s["s0"])):
        ctx.log(f"   efflorescence bloom {FACADES[s['facade']].name:<2} {s['id']:<52} s {s['s0']:6.2f}..{s['s1']:6.2f} "
                f"z {s['z']:6.2f}  wet {s['wet']:.2f} amount {s['amp']:.2f} half {s['half_l']:.2f}|{s['half_r']:.2f} "
                f"reach {s['reach']:.2f} round {s['round']:.2f} leak at {s['deepest']:.2f}"
                + (f" (joins {', '.join(s['joins'])})" if s.get("joins") else ""))
    ctx.log("   efflorescence column stops: " + ", ".join(f"{k} {v}" for k, v in sorted(stops.items())))


def elevation(canvas):
    """What the elevation images draw of the mask: each bloom as its joints take it, at the debug view's gain, at each
    texel's own depth below its edge, so a bloom shows as far down and across as it reaches rather than over all the
    brick its mark was walked on (the shader steps it by courses)."""
    t = canvas[:, :, 1] * T_SPAN - T_NEG
    e = np.maximum(canvas[:, :, 2] * E_SPAN, 0.005)
    tp = np.maximum(t, 0.0)
    pf = np.exp(-tp / e); pj = np.exp(-tp / (e * JOINT_REACH))
    pf = pf * smooth(CUT_FACE, CUT_FACE * CUT_SOFT, pf)
    pj = np.maximum(pj * smooth(CUT_JOINT, CUT_JOINT * CUT_SOFT, pj), pf)
    inside = t > -(1.0 + JH_U) * COURSE_H
    return np.clip(canvas[:, :, 0] * pj * inside * DEBUG_GAIN, 0.0, 1.0)


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    import bpy
    img = bpy.data.images.get("WEAR_mask_" + NAME)
    assert img is not None, f"{NAME}: its mask image is not in the node library"
    here = g.sep(g.i("Mask"))[0]                    # the amount here: the bloom lies only where its mark is painted
    ph = g.i("Mask Alpha")                          # the phase of the brick's level courses here
    # the course this point lies in -- its brick row and the bed joint under it -- and the centre of its top joint
    u = g.sub(g.div(g.i("Z"), COURSE_H), ph)
    k = g.math('FLOOR', g.add(u, JH_U))
    z_top = g.mul(g.add(g.add(k, 1.0), ph), COURSE_H)
    # the bloom is read once per course, at that joint: every brick of the course and its joints bloom together
    col_top, _ = g.image(img, g.vec(g.i("U"), g.div(g.sub(z_top, ATLAS.z0), ATLAS.height), 0.0))
    amp, tn, en = g.sep(col_top)
    t = g.sub(g.mul(tn, T_SPAN), T_NEG)            # how far that joint lies below the trim's edge
    e = g.mx(g.mul(en, E_SPAN), 0.005)
    inside = g.gt(t, -(1.0 + JH_U) * COURSE_H)      # the course starts below the edge (above it, the trim hides it)
    tp = g.mx(t, 0.0)
    pf = g.math('EXPONENT', g.div(g.mul(tp, -1.0), e))
    pj = g.math('EXPONENT', g.div(g.mul(tp, -1.0), g.mul(e, JOINT_REACH)))
    # each ends at the course where it falls below its cut, so at a joint; sideways it fades out from the cut up
    pf = g.mul(pf, g.smooth(CUT_FACE, CUT_FACE * CUT_SOFT, pf))
    pj = g.mx(g.mul(pj, g.smooth(CUT_JOINT, CUT_JOINT * CUT_SOFT, pj)), pf)
    # brick walls and returns only: never a top or a soffit, never the trim, the stone, glass or metal
    where = g.mul(g.is_class(classes.BRICK), g.mul(g.one_minus(g.upward()), g.one_minus(g.downward())))
    where = g.mul(g.mul(where, inside), g.smooth(0.0, 0.04, here))
    # the mortar: the joints (the brick set's own map, 1 in a joint, 0 on a brick's face) and the lip of brick under
    # each bed joint, where the salt spreads out of it (w runs from 0 at this course's joint to 1 at the next one up)
    w = g.sub(g.add(u, JH_U), k)
    lip = g.mul(g.smooth(1.0 - LIP, 1.0 - 0.25 * LIP, w), LIP_SHARE)
    jt = g.clamp(g.mx(g.i("Joint"), lip))
    # each brick takes its share by its own porosity, read from its own tone as the material draws it (before any
    # deposit): the lighter, less fired bricks more, the darker, harder ones less
    porous = g.map(g.lum(g.i("Clean Color")), POROUS[0], POROUS[1], POROUS_SHARE[0], POROUS_SHARE[1])
    face = g.mul(g.mul(g.mul(g.mn(amp, FACE_CAP), pf), porous), FACE_AMOUNT)
    joint = g.mul(g.mul(amp, pj), JOINT_AMOUNT)
    amt = g.mul(g.mul(g.mix(face, joint, jt), where), g.i("Strength"))
    col = g.i("Color")
    clean = g.i("Clean Color")
    # the veil's lift on the clean brick (at amt 1): toward the salt's white, and SALT_HUE of it along the brick's own hue
    # instead, the same rise in luminance with the brick's colour kept
    white = g.rgb(*SALT)
    toward = g.vmath('SUBTRACT', white, clean)
    along = g.vmath('SCALE', clean, scale=g.sub(g.div(g.lum(white), g.mx(g.lum(clean), CLEAN_FLOOR)), 1.0))
    lift = g.mix(toward, along, SALT_HUE, 'VECTOR')
    # the salt comes out under the deposits: each channel's lift is dimmed as the square root of how far the soiling, the
    # streaks and the grime dimmed that channel of the clean brick, and is never more than the clean brick takes
    floor = g.vec(CLEAN_FLOOR, CLEAN_FLOOR, CLEAN_FLOOR)
    kept = g.xyz(g.vmath('MINIMUM', g.vmath('DIVIDE', col, g.vmath('MAXIMUM', clean, floor)), g.vec(1.0, 1.0, 1.0)))
    under = g.vec(*(g.pow(g.mx(c, 0.0), UNDER_POW) for c in kept))
    veiled = g.vmath('ADD', col, g.vmath('MULTIPLY', lift, under))
    g.o("Color", g.mix(col, veiled, amt, 'RGBA'))
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), MATTE), amt))
    g.o("Debug", g.mul(g.clamp(g.mul(g.mul(amp, g.mix(pf, pj, jt)), DEBUG_GAIN)), where))
