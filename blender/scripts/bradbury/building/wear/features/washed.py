# Rain-washed exposed zones (AI 566): the parts of the facade the rain keeps cleaner than the rest, and the light
# streaks runoff rinses into soiled surfaces -- the washed counterpart of the sheltered soiling (AI 565). Dirt from the
# air settles on a facade fairly evenly; what makes one place cleaner or dirtier than another is the rain. Wind-driven
# rain hits a facade hardest at its top edge and top corners (Blocken & Carmeliet 2013), and it reaches the fronts of
# whatever stands out past nothing, so those keep less of the deposit. Where runoff runs through a soiled zone it rinses
# its path light: "white washing", which with the dirt washing of AI 564 makes the "differential surface soiling" of an
# old facade (the review's own terms, after Robinson & Baker).
#
# THE EXPOSURE is AI 565's own measure, from the same sweep that finds its shelter: `open`, the share of the wind-driven
# rain that reaches a surface past everything standing out, times `catch`, the wind's catch across the face (its height
# law, raised at the top edge and near the block's corners). It is refined here in one respect only: a front standing
# proud of the recessed brick field catches up to PROUD_GAIN more of the rain than the field does, as the catch rises at
# the edges of anything that stands out, so the fronts of the projecting piers, columns and corner pavilions measure as
# more exposed than the recessed bays between them. 565's own mask and fields are untouched.
#
# THE WASH is a matter of degree against the general facade, the materials as they are drawn. A deposit settles at the
# balance between what the air brings, the same everywhere, and what the rain rinses off, so the dirt a surface keeps
# goes as 1 / exposure: against the general facade (the median exposure of the open masonry, measured on the model) a
# surface receiving E is cleaner by 1 - E_gen / E, normalised to 1 at the most exposed masonry there is (an open, proud
# top corner). Below the general level nothing changes. The same balance settles where this feature and 565 meet: 565
# soils by the share of the rain the overhangs keep off, and the crown's members, each standing under the one above,
# keep a fifth to a third of it off their fascias; but up at the top edge the wind drives so much more rain that those
# fascias still take more than the general facade, and a surface that takes more rain than the general facade cannot
# hold more dirt. So the wash takes 565's soiling back off in proportion to how washed a surface is. Where the shelter is
# heavy -- under the corona, the band and the heads, every soffit -- the exposure is well below the general level and
# the soiling stands whole; the two never disagree. The field is smooth, the geometry's own; nothing in it is noise.
#
# THE RINSE. A stream of runoff -- the water a sill end, a bracket's foot or a capital sheds from one place, AI 564's
# streams -- that runs through a heavily soiled zone keeps the core of its path clean there: the wall is dirtier than
# anything the water brings, the flow keeps it wet and moving, and the dirt it takes is left at the stream's edges and
# below the zone, where the water slows and soaks into drier wall (Robinson & Baker's white-washed fingers with
# dirt-washed edges, the review's Fig. 10). So each needs its own reason for where it is: DIRT WASHING (564) is where
# the water lays down what it carries -- on open or lightly sheltered wall, which the rain keeps cleaner than the water
# arriving from a ledge; WHITE WASHING (here) is where a stream crosses a zone 565 soils heavily. A curtain, the thin
# spread flow along a whole drip line, carries too little water per metre to rinse and soaks into the dry sheltered wall
# instead (the dark streaks under the portal's cornice in the colour photos), so it stays 564's. On this building the
# rinse lies under the band between floors 4 and 5, below each bracket, and under the fire escapes' platforms on 3rd
# Street, where the sill ends' streams cross the platforms' shelter. A stream's rinse starts at its source, runs up over
# the conduit that carries the water to it (a bracket's own front) and down its path while the zone stays soiled.
#
# ONE STREAM AT A TIME (the rework of 2026-09-23). Every bracket under the band is the same shape, so the rule alone
# rinsed the same light tongue under each of them, at the same strength and to the same depth, a trickle as fully as a
# heavy stream (user 2026-09-23: marks must not repeat identically from one instance to the next). Two things set a
# rinse apart. Its WATER, which 564 now draws per source: a stream's e-fold over its kind's is its scale, k, and the
# more water, the cleaner it keeps its core (POWER) and the further into the fringe of the zone it keeps rinsing (the
# zone's soiling counted as soiling x its water, k squared), so a trickle does not rinse at all, a light stream rinses
# faintly and briefly, and a heavy one long and clean. And its LINE, which nothing on the model says: whether the water
# keeps one line down the wall from rain to rain or shifts about (a foot that drips from one point or several, a joint
# that channels it), drawn per stream from its own seed (stream_line): a steady stream keeps a narrow core with a firm
# edge, a wandering one spreads the same water over a broader, softer, lighter and shorter one. The core's edge is a
# ramp, never a cut: the dirt 564 leaves at the stream's rims deepens toward the streak's own edge instead of lying there
# as a band of its own. The conduit is the bracket's whole front, which the film of its water covers, gathering down it
# into the stream at the exit on its foot.
#
# THE LOOK. Washed masonry takes its own colour a little brighter and a little more saturated, the deposit that greys
# and dulls it rinsed off; the mortar joints keep a share of theirs, so the brick reads crisper rather than bleached.
# It goes toward that look of the surface as the deposits found it (the layer's Clean inputs), which takes 565's
# soiling off as above; inside one of 564's streaks it brightens what it finds instead, so a streak keeps its contrast
# on a washed wall (the mask's alpha says where 564 lies). The rinse takes a stream's core back toward the surface as
# the deposits found it, soiling and the stream's own deposit alike, as far as its water keeps it clean, with a soft
# edge that reaches further along the brick's bed joints, as 564's does; 564's deposit stays at the stream's rims,
# deepening toward the streak's edge, and below the soiled zone. So this feature stands AFTER soiling and runoff in the
# chain (ORDER 225): it takes deposits off, and must come after the ones it takes off. The crown's upper faces take the
# rain square on whatever the elevation shows, so the shader washes the tops in the crown's own height by their
# orientation, as 565 soils the undersides. Glass, metal, paint and wood are left alone.
#
# THE FILM. Optional, off by default (wear_washed_film): a very light, uniform atmospheric film over everything the rain
# does not rinse -- a greying veil, never mottled -- which the washed zones and the rinse take off, for a dirtier general
# facade with something visible to remove.
#
# PUBLISHED for the features that follow (573 erodes the mortar where the rain beats): the refined `exposure`, the
# `wash` field, the `rinse` streams and the projecting `fronts` (see the README's "Rain-washed exposed zones (AI 566)").
import hashlib, math
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS, Z_GROUND, facade_of
from . import soiling, runoff

NAME = "washed"
AI = 566
LABEL = "rain-washed exposed zones"
ORDER = 225                      # after soiling (200) and runoff (220): the wash and the rinse take their deposits off
NEEDS = ("soiling", "runoff")
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.10, 0.95, 0.95)
MASK = dict(res=0.02, channels=4, bits=8)   # R: the wash; G: the rinse a stream brings; B: how far inside its core;
RES = MASK["res"]                           # A: 564's deposit, where the wash brightens a streak instead of taking it off
CONTROLS = {"film": 0.0}         # wear_washed_film: the optional atmospheric film, off by default

# ---------------------------------------------------------------------------------------------------- the exposure
D_FIELD = -0.10         # the recessed brick field's plane (the built model's modal field depth, checked at build time)
PROUD = (0.05, 0.25)    # a front standing this far in front of the field starts to count as projecting, fully from here
PROUD_GAIN = 0.35       # a projecting front catches this much more of the wind-driven rain than the field (565's
                        # CATCH_EDGE: the catch rises as much at a projection's edges as at the block's own)
GENERAL = soiling.SHOW[0]   # the general facade: the open masonry, sheltered less than where 565's soiling starts
MARGIN = 1              # 5 cm texels: a face's own texels reach this far past its corner bisector, for the lookup
CROWN = (19.10, soiling.Z_TOP)   # the crown, from the underside of its moulding to its top: its upper faces are washed

# ---------------------------------------------------------------------------------------------------- the marks
FRONT_TOL = 0.03        # the texels of one projecting front stand within this of their neighbours' depth
FRONT_MIN = 20          # 5 cm texels (0.05 m2): a smaller front (a dentil) is part of its face's top edge or corner
LINE_D = 0.02           # the debug view's source and path lines stand this far in front of the surface they mark
STREAK = 0.02           # 564's deposit from which a surface counts as inside a streak (its field, 0..1)

# ---------------------------------------------------------------------------------------------------- the rinse
STREAMS = ("sill_end", "bracket", "capital", "springing")   # 564's streams; its curtains (drip lines) do not rinse
RINSE_SOIL = (0.45, 0.85)  # a stream rinses where 565's soiling (its smoothstep of the shelter, 0..1) passes from here to
                           # here: a zone soiled at least about half as heavily as it gets, not a sill's own shelter
                           # (which streams rinse is the zone's alone; how far each goes is its water's, below)
VIS = 0.5 * runoff.LAT_HALF   # 564 cuts a streak's edge this share of its width out from its axis (a corner-hugging
                              # one twice as far out from the jamb): the streak's visible half-width, h
CORE_INSET = 0.175      # for a capital's flat curtain, the core stops this share of its width short of either side
CONDUIT_MAX = 0.60      # the conduit above a source (a bracket's own front) reaches at most this far up, to the drip
                        # line of the course it carries the water from
RINSE_MIN = 0.05        # a stream whose rinse never reaches this is not rinsing anything: no mark

# ---------------------------------------------------------------------------------------------------- one stream at a time
KIND_EFOLD = dict(sill_end=runoff.SILL_EFOLD, bracket=runoff.BRACKET_EFOLD, capital=runoff.CAPITAL_EFOLD,
                  springing=runoff.SPRING_EFOLD)   # a stream's e-fold over its kind's is its water's scale k (564 sets
                                                   # the e-fold by the square root of the water it drew), held to K_MAX
POWER = (0.30, 1.15)    # how clean a stream keeps its core: the smoothstep of k between these (0.92 at k = 1, the
                        # geometry's measure; 0.47 at k 0.71, water 0.5, the least a wet source draws). A stream whose
                        # water times its line's keep is under RINSE_SOIL[0] cannot outdo the zone's dirt anywhere: it
                        # rinses nothing
CORE_STEADY = (0.45, 0.85)   # a steady stream's core is clean out to CORE_STEADY[0] of the streak's visible half-width
                             # and rinses nothing past CORE_STEADY[1] (a ramp between: the shader cuts its edge inside it)
CORE_WANDER = (0.20, 1.00)   # a wandering one's, broader and softer: the same water over more wall ...
WANDER_KEEP = 0.75      # ... which it keeps this much as clean, and rinses as if it carried this much of its water
                        # (reach_gate)
CONDUIT_CORE = (0.35, 1.00)  # the conduit, a bracket's own front, is clean at the drip line out to this share of the
                             # foot's half-width, its film thinning toward the console's arrises; down the front the film
                             # gathers into the stream's own core at the exit on the foot

# ---------------------------------------------------------------------------------------------------- the look
BRIGHT = 0.25           # at a full wash, masonry is this much brighter ...
SAT = 0.06              # ... and this much more saturated (its own colour, the deposit that greys it rinsed off)
JOINT_KEEP = 0.40       # a mortar joint keeps this share of its dirt through the wash and the rinse
RINSE = 0.90            # a full rinse takes the core this far back toward the surface as the deposits found it
RIM = (0.25, 0.85)      # the rinsed core's edge: where its inside-ness (a ramp, 1 in the clean core) passes from RIM[1]
                        # down to RIM[0], a soft edge, never a cut ...
RIM_LIP = 0.20          # ... reaching this much further out along a bed joint and the lip of brick under it, as 564's
                        # streak edge does (RIM[0] - RIM_LIP stays above 0: nothing is rinsed outside the ramp)
CLASS_WASH = {classes.BRICK: 1.0, classes.TERRACOTTA: 1.0, classes.STONE: 1.0}
FILM = 0.35             # the film at wear_washed_film 1: this far toward FILM_DARK x its own colour ...
FILM_GREY = 0.35        # ... greyed this much toward a dust grey ...
FILM_DARK = 0.80        # ... kept at this share of its brightness
FILM_TINT = (1.00, 0.97, 0.92)
FILM_MATTE = 0.75       # and at least this rough
CLASS_FILM = soiling.CLASS_AMOUNT   # the film settles as the soiling does: masonry in full, metal and paint in part
DEBUG_GAIN = 2.0        # the debug view shows the wash at full colour from half of the most there is


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def s_at(f, c, res):             # a face-local column's centre
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * res


def z_at(r, res):                # a row's centre
    return ATLAS.z0 + (np.asarray(r) + 0.5) * res


# ---------------------------------------------------------------------------------------------------- the exposure
def owned_texels(D, surf, f, a0, a1, fres):
    """The texels of face f whose surface belongs to it by the bisector rule, grown MARGIN texels."""
    F = FACADES[f]; H = D.shape[0]
    S = np.broadcast_to(s_at(f, np.arange(a1 - a0), fres)[None, :], (H, a1 - a0))
    d = np.where(surf[:, a0:a1], D[:, a0:a1], 0.0)
    X, Y = F.a[0] + S * F.t[0] + d * F.n[0], F.a[1] + S * F.t[1] + d * F.n[1]
    own = surf[:, a0:a1] & (facade_of(X, Y) == f)
    return soiling.dilate(own, MARGIN) & surf[:, a0:a1]


def measure(ctx):
    """The refined exposure and the wash on 565's 5 cm atlas: dict of arrays (H, W) and the general level."""
    ex, sh, fr = ctx.field("soiling", "exposure"), ctx.field("soiling", "shelter"), ctx.field("soiling", "front")
    fres = ex["res"]
    D = np.asarray(fr["depth"], np.float64); C = np.asarray(fr["cls"], np.int32)
    OPEN = np.asarray(ex["open"], np.float64); CATCH = np.asarray(ex["catch"], np.float64)
    SH = np.asarray(sh["data"], np.float64)
    assert D.shape == ATLAS.shape(fres), (D.shape, ATLAS.shape(fres))
    surf = np.isfinite(D)
    masonry = surf & np.isin(C, classes.MASONRY)
    own = np.zeros(D.shape, bool)
    for F in FACADES:
        a0, a1 = ATLAS.cols(F, fres)
        own[:, a0:a1] = owned_texels(D, surf, F.idx, a0, a1, fres)
    # the field's plane, as the model has it: the masonry within 5 cm of D_FIELD
    near = masonry & own & (np.abs(np.where(surf, D, 9.0) - D_FIELD) < 0.05)
    d_field = float(np.median(D[near]))
    assert abs(d_field - D_FIELD) < 0.02, f"washed: the brick field reads {d_field:.3f}, not {D_FIELD}"
    proud = np.where(surf, np.clip((np.where(surf, D, D_FIELD) - D_FIELD - PROUD[0]) / (PROUD[1] - PROUD[0]), 0.0, 1.0),
                     0.0)
    catch = CATCH * (1.0 + PROUD_GAIN * proud) / (1.0 + PROUD_GAIN)
    E = np.where(surf, OPEN * catch, 0.0)
    general = masonry & own & (SH < GENERAL)
    e_gen = float(np.median(E[general]))
    e_max = float(E[masonry & own].max())
    rise = np.where(E > 0.0, 1.0 - e_gen / np.maximum(E, 1e-9), 0.0)
    wash = np.clip(rise / (1.0 - e_gen / e_max), 0.0, 1.0) * (masonry & own)
    return dict(res=fres, D=D, C=C, surf=surf, masonry=masonry, own=own, proud=proud, catch=catch, E=E, open=OPEN,
                shelter=SH, wash=wash, e_gen=e_gen, e_max=e_max, d_field=d_field, n_general=int(general.sum()))


# ---------------------------------------------------------------------------------------------------- the marks
def label_fronts(cand, D):
    """The projecting fronts of one face: 4-connected runs of candidate texels whose neighbours stand within FRONT_TOL
    of their depth, so a column, the band crossing it and the sill beside it come apart. Returns a label per texel
    (-1 elsewhere) and the number of labels."""
    H, W = cand.shape
    segs = []
    for r in np.nonzero(cand.any(axis=1))[0]:
        cols = np.nonzero(cand[r])[0]
        brk = np.where((np.diff(cols) > 1) | (np.abs(np.diff(D[r, cols])) > FRONT_TOL))[0]
        for part in np.split(cols, brk + 1):
            segs.append((int(r), int(part[0]), int(part[-1])))
    parent = list(range(len(segs)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    by_row = {}
    for k, sg in enumerate(segs): by_row.setdefault(sg[0], []).append(k)
    for k, (r, a0, a1) in enumerate(segs):             # join a run to the runs below it it touches at a like depth
        for j in by_row.get(r - 1, []):
            _, b0, b1 = segs[j]
            lo, hi = max(a0, b0), min(a1, b1)
            if lo > hi: continue
            cc = np.arange(lo, hi + 1)
            if np.any(np.abs(D[r, cc] - D[r - 1, cc]) <= FRONT_TOL):
                ra, rb = root(k), root(j)
                if ra != rb: parent[max(ra, rb)] = min(ra, rb)
    lab = np.full((H, W), -1, np.int32)
    roots = {}
    for k, (r, a0, a1) in enumerate(segs):
        lab[r, a0:a1 + 1] = roots.setdefault(root(k), len(roots))
    return lab, len(roots)


def corner_point(k, d):
    """The block's corner k (between face k-1 and face k) pushed out d from both faces: the arris a front at depth d
    makes there."""
    A, B = FACADES[(k - 1) % len(FACADES)], FACADES[k]
    nx, ny = A.n[0] + B.n[0], A.n[1] + B.n[1]
    k_ = d / (1.0 + A.n[0] * B.n[0] + A.n[1] * B.n[1])
    return (B.a[0] + nx * k_, B.a[1] + ny * k_)


def paint_labels(ctx, F, lab5, wash5, streak, marks, fres):
    """Paint face F's wash at the mask's resolution: each texel takes its 5 cm cell's mark (grown one texel into the
    unwashed cells around, so the bilinear edge of the field stays whole), the field's bilinear value there, and in the
    alpha how far inside one of 564's streaks it lies."""
    f = F.idx; H5, W5 = lab5.shape
    S, Z, (r0, r1, c0, c1) = ctx.grid(f, F.s0, F.s1, ATLAS.z0, ATLAS.z1)
    grown = lab5.copy()                                           # 8-connected, one texel
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0: continue
            sh = np.full_like(lab5, -1)
            rs, re_ = max(dr, 0), H5 + min(dr, 0); cs, ce = max(dc, 0), W5 + min(dc, 0)
            sh[rs:re_, cs:ce] = lab5[rs - dr:re_ - dr, cs - dc:ce - dc]
            grown = np.where((grown < 0) & (sh >= 0), sh, grown)
    rr = np.clip(np.floor((Z - ATLAS.z0) / fres).astype(np.int64), 0, H5 - 1)
    cc = np.clip(np.floor((S - F.s0) / fres).astype(np.int64), 0, W5 - 1)
    lab = grown[rr, cc]
    val = np.where(lab >= 0, soiling.sample(dict(res=fres, z0=ATLAS.z0, data=wash5), f, S, Z), 0.0)
    inside = np.where(lab >= 0, np.clip(soiling.sample(streak, f, S, Z) / STREAK, 0.0, 1.0), 0.0)
    ys, xs = np.nonzero(lab >= 0); ks = lab[ys, xs]
    nk = len(marks)
    r_lo = np.full(nk, lab.shape[0]); r_hi = np.full(nk, -1); c_lo = np.full(nk, lab.shape[1]); c_hi = np.full(nk, -1)
    np.minimum.at(r_lo, ks, ys); np.maximum.at(r_hi, ks, ys); np.minimum.at(c_lo, ks, xs); np.maximum.at(c_hi, ks, xs)
    for k in range(nk):
        if r_hi[k] < 0: continue
        a, b, c, d = int(r_lo[k]), int(r_hi[k]), int(c_lo[k]), int(c_hi[k])
        box = lab[a:b + 1, c:d + 1] == k
        s0 = F.s0 + c * RES + 0.25 * RES; s1 = F.s0 + (d + 1) * RES - 0.25 * RES
        z0 = ATLAS.z0 + a * RES + 0.25 * RES; z1 = ATLAS.z0 + (b + 1) * RES - 0.25 * RES
        ctx.paint(marks[k], np.where(box, val[a:b + 1, c:d + 1], 0.0), s0, s1, z0, z1, channel=0, op="max")
        ctx.paint(marks[k], np.where(box, inside[a:b + 1, c:d + 1], 0.0), s0, s1, z0, z1, channel=3, op="max")


def streak_field(ctx):
    """564's deposit (its published field, 4 cm, max-pooled) grown one texel more, so a streak's whole visible width
    and its bed-joint lips count as inside it."""
    fd = ctx.field("runoff", "field")
    a = np.asarray(fd["data"], np.float64)
    g = a.copy()
    g[1:] = np.maximum(g[1:], a[:-1]); g[:-1] = np.maximum(g[:-1], a[1:])
    h = g.copy()
    h[:, 1:] = np.maximum(h[:, 1:], g[:, :-1]); h[:, :-1] = np.maximum(h[:, :-1], g[:, 1:])
    return dict(res=fd["res"], z0=fd["z0"], data=h)


def wash_marks(ctx, m):
    """Every washed texel belongs to one mark, from the source whose rain makes it washed: a projecting front it lies
    on, else the block's corner it is near (within 565's CATCH_SIDE, below the top edge's zone), else its face's top
    edge (the catch rising toward the top of the face). Returns the fronts published and the counts."""
    fres = m["res"]; H = m["D"].shape[0]
    streak = streak_field(ctx)
    fronts, n = [], dict(front=0, corner=0, top_edge=0)
    corner_src = {}
    for k in range(len(FACADES)):             # one source per corner of the block, up its arris at the fronts' depth
        x, y = corner_point(k, D_FIELD + 0.30)
        corner_src[k] = ctx.source(f"corner:{FACADES[(k - 1) % len(FACADES)].name}{FACADES[k].name}", "line",
                                   [(x, y, Z_GROUND), (x, y, soiling.Z_TOP)], facade=k, what="corner",
                                   sharpness=round(soiling.corner_sharpness(k, 0), 3))
    for F in FACADES:
        f = F.idx; a0, a1 = ATLAS.cols(F, fres)
        W5 = a1 - a0
        wash = m["wash"][:, a0:a1]; D = m["D"][:, a0:a1]; P = m["proud"][:, a0:a1]
        washed = wash > 0.0
        if not washed.any(): continue
        S5 = np.broadcast_to(s_at(f, np.arange(W5), fres)[None, :], (H, W5))
        Z5 = np.broadcast_to(z_at(np.arange(H), fres)[:, None], (H, W5))
        lab = np.full((H, W5), -1, np.int32)
        marks = []
        # the projecting fronts
        cand = washed & (P >= 0.5) & m["masonry"][:, a0:a1]
        fl, nf = label_fronts(cand, np.where(np.isfinite(D), D, -9.0))
        sizes = np.bincount(fl[fl >= 0], minlength=nf) if nf else np.zeros(0, int)
        for j in range(nf):
            if sizes[j] < FRONT_MIN: continue
            sel = fl == j
            rows, cols = np.nonzero(sel.any(axis=1))[0], np.nonzero(sel.any(axis=0))[0]
            s0 = float(s_at(f, cols[0], fres)) - 0.5 * fres; s1 = float(s_at(f, cols[-1], fres)) + 0.5 * fres
            z0 = float(z_at(rows[0], fres)) - 0.5 * fres; z1 = float(z_at(rows[-1], fres)) + 0.5 * fres
            d = float(np.median(D[sel])) + LINE_D
            info = dict(id=f"front:{F.name}:{len(fronts)}", facade=f, s0=round(s0, 3), s1=round(s1, 3),
                        z0=round(z0, 3), z1=round(z1, 3), depth=round(d - LINE_D, 3), texels=int(sizes[j]),
                        wash=round(float(wash[sel].max()), 3))
            src = ctx.source(info["id"], "area", [F.world(s0, d, z0), F.world(s1, d, z0), F.world(s1, d, z1),
                                                  F.world(s0, d, z1)], facade=f, what="front", depth=info["depth"])
            lab[sel] = len(marks); marks.append(ctx.mark(src, f, what="front")); fronts.append(info)
            n["front"] += 1
        # the rest: a corner's zone, else the face's top edge
        rest = washed & (lab < 0)
        top = np.clip((Z5 - (soiling.Z_TOP - soiling.CATCH_TOP)) / soiling.CATCH_TOP, 0.0, 1.0)
        near = []
        for end in (0, 1):
            dist = S5 if end == 0 else F.L - S5
            near.append(np.clip(1.0 - dist / soiling.CATCH_SIDE, 0.0, 1.0) * soiling.corner_sharpness(f, end))
        side = np.maximum(near[0], near[1])
        for end, k in ((0, f), (1, (f + 1) % len(FACADES))):
            sel = rest & (side > top) & (near[end] >= near[1 - end]) & (near[end] > 0.0)
            if not sel.any(): continue
            lab[sel] = len(marks); marks.append(ctx.mark(corner_src[k], f, what="corner")); rest &= ~sel
            n["corner"] += 1
        if rest.any():
            # the top edge: along the crown's front at the top of the face
            top_rows = np.nonzero(z_at(np.arange(H), fres) > soiling.Z_TOP - 0.20)[0]
            dt = D[top_rows][:, (S5[0] > 0.0) & (S5[0] < F.L)]
            d_top = float(np.nanmax(dt)) if np.isfinite(dt).any() else 0.0
            src = ctx.source(f"top_edge:{F.name}", "line", [F.world(0.0, d_top + LINE_D, soiling.Z_TOP),
                                                            F.world(F.L, d_top + LINE_D, soiling.Z_TOP)],
                             facade=f, what="top_edge")
            lab[rest] = len(marks); marks.append(ctx.mark(src, f, what="top_edge"))
            n["top_edge"] += 1
        paint_labels(ctx, F, lab, m["wash"], streak, marks, fres)
    return fronts, n


# ---------------------------------------------------------------------------------------------------- the rinse
def draw(key, n):
    """n uniforms in 0..1 from a stream's own seed: the sha256 of `washed:` and its key, two bytes each, as 564 draws its
    sources' own, so every rebuild draws the same values and nothing drawn for one stream moves when another changes."""
    h = hashlib.sha256(("washed:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def stream_water(st):
    # the stream's water scale k: its e-fold over its kind's (564 sets the e-fold by the square root of the water a
    # source drew, and a sill end's by its sill's length too), held to 564's K_MAX
    return min(st["efold"] / KIND_EFOLD[st["kind"]], runoff.K_MAX)


def stream_line(source_id):
    """A stream's own line, 0 (it shifts about from rain to rain) to 1 (it keeps one line), the mean of two uniforms
    seeded by 564's source id, so the middle is likelier than either end: (line, the share of the streak's visible
    half-width its core is clean out to, the share it rinses nothing past, how clean it keeps that core)."""
    u = draw("rinse:" + source_id, 2)
    line = 0.5 * (u[0] + u[1])
    a = CORE_WANDER[0] + (CORE_STEADY[0] - CORE_WANDER[0]) * line
    b = CORE_WANDER[1] + (CORE_STEADY[1] - CORE_WANDER[1]) * line
    return line, a, b, WANDER_KEEP + (1.0 - WANDER_KEEP) * line


def bracket_feet(ctx):
    """Each bracket's foot along its face, (s0, s1), by 564's source id for it (its bay mesh and index, the brackets
    grouped along each bay mesh as 564 groups them): the conduit above its stream is the bracket's own front, which the
    water it carries covers, as wide as its foot. 564 publishes the part of the foot its water leaves over."""
    feet = {}
    for rec in sorted(ctx.block.instances("ge_bracket45"), key=lambda r: r["object"]):
        _, S, _, Z = runoff._points_sdz(ctx.block, rec)
        order = np.argsort(S)
        for k, g in enumerate(np.split(order, np.where(np.diff(S[order]) > 0.20)[0] + 1)):
            Sg, Zg = S[g], Z[g]
            foot = Zg < float(Zg.min()) + 0.005
            feet[f"{rec['object']}#{k}"] = (float(Sg[foot].min()), float(Sg[foot].max()))
    return feet


def stream_shape(st, w0, t_max, a, b):
    """The rinsed core across one of 564's streams, as a function of (S, t): 1 out to the share `a` of the streak's
    visible half-width h (564's cut, VIS of its width either side of its axis), falling linearly to 0 at the share `b`
    of it, a ramp inside which the shader cuts a soft edge; and the span along the face it can reach within t_max."""
    side, axis = st["side"], st["axis"]
    w_max = w0 + runoff.SPREAD * t_max
    if side == "corner":                        # hugging a jamb: the streak runs one way from the sill's end and its
        s_end = st["s0"]; sg = 1.0 if axis >= s_end else -1.0     # half-width is all of it, 2 VIS of its width

        def shape(S, t):
            h = 2.0 * VIS * (w0 + runoff.SPREAD * t)
            u = sg * (S - s_end)
            return np.where(u >= 0.25 * RES, np.clip((b * h - u) / ((b - a) * h), 0.0, 1.0), 0.0)
        half = 2.0 * VIS * b * w_max
        lo, hi = (s_end, s_end + half) if sg > 0 else (s_end - half, s_end)
    elif side == "centred":
        def shape(S, t):
            h = VIS * (w0 + runoff.SPREAD * t)
            return np.clip((b * h - np.abs(S - axis)) / ((b - a) * h), 0.0, 1.0)
        half = VIS * b * w_max
        lo, hi = axis - half, axis + half
    else:                                       # a capital's flat curtain, as wide as its foot
        s0, s1 = st["s0"], st["s1"]; inset = CORE_INSET * (s1 - s0)

        def shape(S, t):
            return np.clip((np.minimum(S - s0, s1 - S) - inset) / runoff.END_SOFT, 0.0, 1.0) + 0.0 * t
        lo, hi = s0, s1
    return shape, lo, hi


def stream_width(st):
    # the stream's width at its source, as 564 draws it (a bracket's or a capital's: the part of its foot the water
    # leaves over)
    if st["kind"] == "sill_end":
        return runoff.SILL_W0 * st["efold"] / runoff.SILL_EFOLD
    return st["s1"] - st["s0"]


def reach_gate(soil, k, keep):
    """Where along its path a stream of water scale k still rinses: 565's soiling through RINSE_SOIL counted as soiling x
    its water, k squared (the dirt a stream can carry off goes with the water itself: the wall holds more than a trickle
    can take and less than a heavy stream can, so a heavy one rinses on into the zone's fringe and a trickle only its
    heart), and x `keep`, its line's (the same water spread over more wall carries off less of it, and not as far);
    normalised to 1 where the zone is at its heaviest: how clean the core is there is the stream's POWER."""
    water = k * k * keep
    top = smooth(RINSE_SOIL[0], RINSE_SOIL[1], water)
    return np.clip(smooth(RINSE_SOIL[0], RINSE_SOIL[1], np.asarray(soil) * water) / max(float(top), 1e-6), 0.0, 1.0) \
        if top > 0.0 else np.zeros(np.shape(soil))


def rinse_streams(ctx, m):
    """The white-washed cores: every stream of 564 that runs through a zone 565 soils heavily, from the drip line of
    the course its conduit hangs from (a bracket's own front) down its path while the zone stays soiled for its water,
    each as clean as its water keeps it, and as broad and as soft as its line."""
    fres = m["res"]
    streaks = ctx.field("runoff", "streaks"); sources = {s["id"]: s for s in ctx.field("runoff", "sources")}
    drips = ctx.field("runoff", "drip_lines")
    shel = dict(res=fres, z0=ATLAS.z0, data=m["shelter"])
    cls5 = m["C"]; own5 = m["own"]
    feet = bracket_feet(ctx)
    out, by, faint = [], {}, {}
    for st in streaks:
        if st["kind"] not in STREAMS: continue
        f = st["facade"]; F = FACADES[f]
        w0 = stream_width(st)
        z_top, z_stop = st["z_top"], st["z_stop"]
        # the conduit: up to the lowest drip line above the source within CONDUIT_MAX, beside it along the face
        above = [d["z"] for d in drips if d["facade"] == f and z_top + 0.02 < d["z"] <= z_top + CONDUIT_MAX
                 and d["s0"] - 0.6 <= st["axis"] <= d["s1"] + 0.6]
        z_head = min(above) if above else z_top
        # which streams rinse is the zone's: 565's soiling along the path, through RINSE_SOIL, from the source down
        zs = np.arange(z_top - 0.5 * RES, z_stop, -RES)
        if not len(zs): continue
        soil = smooth(soiling.SHOW[0], soiling.SHOW[1], soiling.sample(shel, f, np.full(len(zs), st["axis"]), zs))
        g_axis = smooth(RINSE_SOIL[0], RINSE_SOIL[1], soil)
        if g_axis[0] < 0.01 or g_axis.max() < RINSE_MIN: continue
        # how clean and how far is the stream's own: its water, and its line. It rinses while the zone stays soiled for
        # its water (a soiled zone further down, a window's head, is not its to rinse)
        k = stream_water(st)
        power = float(smooth(POWER[0], POWER[1], k))
        line, a, b, keep = stream_line(st["source"])
        g_k = reach_gate(soil, k, keep)
        if power * keep * float(g_k.max()) < RINSE_MIN or g_k[0] < 0.01:
            faint[st["kind"]] = faint.get(st["kind"], 0) + 1    # a trickle: the zone keeps its dirt, 564 its streak
            continue
        k_end = int(np.argmax(g_k < 0.01)) - 1 if (g_k < 0.01).any() else len(zs) - 1
        z_end = float(zs[k_end]) - 0.5 * RES
        shape, lo, hi = stream_shape(st, w0, max(z_top - z_end, 0.0), a, b)
        foot = feet.get(st["source"]) if st["kind"] == "bracket" and z_head > z_top else None
        if foot is not None: lo, hi = min(lo, foot[0]), max(hi, foot[1])
        S, Z, _ = ctx.grid(f, lo, hi, z_end, z_head)
        if S.size == 0: continue
        t = np.clip(z_top - Z, 0.0, None)
        B = np.clip(shape(S, t), 0.0, 1.0)
        soil2 = smooth(soiling.SHOW[0], soiling.SHOW[1], soiling.sample(shel, f, S, Z))
        G = power * keep * reach_gate(soil2, k, keep)
        if foot is not None:
            # the conduit is the bracket's own front, which the film of its water covers: clean across it at the drip
            # line (thinning to the console's arrises), gathering down it into the stream at the exit on its foot
            q = np.clip((Z - z_top) / max(z_head - z_top, RES), 0.0, 1.0)      # 0 at the foot, 1 at the drip line
            fc, hc, h0 = 0.5 * (foot[0] + foot[1]), 0.5 * (foot[1] - foot[0]), VIS * w0
            cen = st["axis"] + (fc - st["axis"]) * q; hq = h0 + (hc - h0) * q
            aq = a + (CONDUIT_CORE[0] - a) * q; bq = b + (CONDUIT_CORE[1] - b) * q
            Bc = np.clip((bq * hq - np.abs(S - cen)) / ((bq - aq) * hq), 0.0, 1.0)
            B = np.where(Z > z_top, Bc, B)
            G = np.where(Z > z_top, power * (keep + (1.0 - keep) * q), G)
        # masonry the stream runs on (not the glass or frame of the window below a head), on this face's own texels
        rr = np.clip(np.floor((Z - ATLAS.z0) / fres).astype(np.int64), 0, cls5.shape[0] - 1)
        cc = np.clip(np.floor((F.off + S - F.s0) / fres).astype(np.int64), 0, cls5.shape[1] - 1)
        ok = np.isin(cls5[rr, cc], classes.MASONRY) & own5[rr, cc] & (Z <= z_head) & (Z >= z_end)
        G = np.where(ok & (B > 0.01), G, 0.0); B = np.where(ok, B, 0.0)
        if G.max() < RINSE_MIN:
            faint[st["kind"]] = faint.get(st["kind"], 0) + 1
            continue
        rs = sources.get(st["source"])
        kind = "point" if st["kind"] == "sill_end" else "line"
        d_src = rs["d"] if rs else 0.0
        pts = ([F.world(rs["s0"], d_src, rs["z"])] if kind == "point" else
               [F.world(rs["s0"], d_src, rs["z"]), F.world(rs["s1"], d_src, rs["z"])]) if rs else \
              [F.world(st["axis"], d_src, z_top)]
        src = ctx.source(f"rinse:{st['source']}", kind, pts, facade=f, what=st["kind"], runoff=st["source"],
                         water=round(k, 3), power=round(power, 3), line=round(line, 3))
        mk = ctx.mark(src, f, what=st["kind"])
        s0g, s1g = float(S[0, 0]) - 0.25 * RES, float(S[0, -1]) + 0.25 * RES
        z0g, z1g = float(Z[0, 0]) - 0.25 * RES, float(Z[-1, 0]) + 0.25 * RES
        ctx.paint(mk, G, s0g, s1g, z0g, z1g, channel=1, op="max")
        ctx.paint(mk, B, s0g, s1g, z0g, z1g, channel=2, op="max")
        # the path: up the conduit and down the rinsed core, just in front of the wall there
        d5 = m["D"]
        c5 = int(np.clip(math.floor((F.off + st["axis"] - F.s0) / fres), 0, d5.shape[1] - 1))
        r5 = int(np.clip(math.floor((z_top - 0.5 * fres - ATLAS.z0) / fres), 0, d5.shape[0] - 1))
        d_path = (float(d5[r5, c5]) if np.isfinite(d5[r5, c5]) else d_src) + LINE_D
        ctx.path(mk, [F.world(st["axis"], d_path, z_head), F.world(st["axis"], d_path, z_end)])
        peak = float(G[Z <= z_top].max()) if (Z <= z_top).any() else 0.0
        info = dict(id=src.id, source=st["source"], kind=st["kind"], facade=f, axis=st["axis"], side=st["side"],
                    s0=round(min(lo, hi), 3), s1=round(max(lo, hi), 3), z_head=round(z_head, 3), z_top=z_top,
                    z_end=round(z_end, 3), width=round(w0, 3), soil=round(float(soil.max()), 3), water=round(k, 3),
                    power=round(power, 3), line=round(line, 3), core=[round(a, 3), round(b, 3)], peak=round(peak, 3),
                    conduit=[round(foot[0], 3), round(foot[1], 3)] if foot is not None else None)
        out.append(info)
        bk = by.setdefault(st["kind"], dict(n=0, run=[], conduit=[], peak=[], line=[]))
        bk["n"] += 1; bk["run"].append(z_top - z_end); bk["conduit"].append(z_head - z_top)
        bk["peak"].append(peak); bk["line"].append(line)
    return out, by, faint


# ---------------------------------------------------------------------------------------------------- build
def build(ctx):
    import time
    t0 = time.time()
    m = measure(ctx)
    fronts, n = wash_marks(ctx, m)
    rinse, by, faint = rinse_streams(ctx, m)
    fres = m["res"]
    meta = dict(res=fres, z0=ATLAS.z0, atlas=ATLAS.to_dict())
    ctx.publish("exposure", dict(meta, data=(m["E"] / m["e_max"]).astype(np.float16), open=m["open"].astype(np.float16),
                                 catch=m["catch"].astype(np.float16), proud=m["proud"].astype(np.float16),
                                 general=round(m["e_gen"] / m["e_max"], 4), note=(
        "565's rain-exposure measure refined for the projecting fronts: data = open * catch, catch = 565's catch * (1 + "
        f"{PROUD_GAIN} proud) / {1 + PROUD_GAIN}, proud the share a surface stands in front of the brick field (0 at "
        f"{PROUD[0]} m, 1 from {PROUD[1]} m); normalised to 1 at the most exposed masonry; `general` is the open "
        "masonry's median, the general facade")))
    ctx.publish("wash", dict(meta, data=m["wash"].astype(np.float16), note=(
        "how much cleaner than the general facade the surface the street sees at (s, z) is, 0..1: 1 - general / "
        "exposure, normalised to 1 at the most exposed masonry; 0 at or below the general level and on anything but "
        "masonry (the crown's upper faces are washed in the shader, by orientation)")))
    ctx.publish("rinse", rinse)
    ctx.publish("fronts", fronts)
    wm = m["wash"][m["masonry"] & m["own"]]
    ctx.log(f"   washed: the field at d {m['d_field']:.3f}; the general facade's exposure {m['e_gen']:.3f} (the median of "
            f"{m['n_general']} open masonry texels), the most exposed {m['e_max']:.3f}; masonry washed "
            + ", ".join(f">= {q}: {float((wm >= q).mean()) * 100:.1f}%" for q in (0.05, 0.25, 0.5, 0.75)))
    ctx.log(f"   washed marks: {n['front']} projecting fronts, {n['corner']} corner zones, {n['top_edge']} top edges; "
            f"{len(rinse)} rinsed streams in {time.time() - t0:.1f} s"
            + (f"; too little water to rinse: " + ", ".join(f"{runoff.KIND_LABEL.get(k, k)} {v}" for k, v in
                                                            sorted(faint.items())) if faint else ""))
    for k, b in by.items():
        pk = np.array(b["peak"])
        ctx.log(f"   washed rinse {runoff.KIND_LABEL.get(k, k):<18} {b['n']:4d}: rinsed {np.median(b['run']):.2f} m down "
                f"({min(b['run']):.2f}..{max(b['run']):.2f}), conduit {np.median(b['conduit']):.2f} m; its core as clean "
                f"as {np.median(pk):.2f} ({pk.min():.2f}..{pk.max():.2f}), a quarter below {np.quantile(pk, 0.25):.2f} and "
                f"above {np.quantile(pk, 0.75):.2f}; line {np.median(b['line']):.2f} "
                f"({min(b['line']):.2f}..{max(b['line']):.2f})")


# ---------------------------------------------------------------------------------------------------- shader
def look(g, col):
    # the surface's own colour, cleaner: a little more saturated and a little brighter, never below black
    ys = g.mul(g.lum(col), SAT)
    c = g.vmath('MAXIMUM', g.vmath('SUBTRACT', g.vmath('SCALE', col, scale=1.0 + SAT), g.vec(ys, ys, ys)),
                (0.0, 0.0, 0.0))
    return g.vmath('SCALE', c, scale=1.0 + BRIGHT)


def shader(g):
    R, Gm, Bm = g.sep(g.i("Mask"))
    in_streak = g.i("Mask Alpha")
    k = None                                                # masonry only: glass, metal, paint and wood keep theirs
    for c, share in CLASS_WASH.items():
        term = g.mul(g.eq(g.i("Class"), float(c)), share)
        k = term if k is None else g.add(k, term)
    # the wash: the mask on surfaces facing the street; the crown's upper faces, which take the rain square on, by their
    # orientation; never an underside, which takes none
    tops = g.mul(g.upward(), g.map(g.i("Z"), CROWN[0], CROWN[1]))
    w = g.mul(g.mx(g.mul(R, g.facing()), tops), k)
    joint = g.clamp(g.i("Joint"))
    keep = g.one_minus(g.mul(joint, JOINT_KEEP))            # the joints keep a share of their dirt
    amt = g.mul(g.mul(w, keep), g.i("Strength"))
    col, clean = g.i("Color"), g.i("Clean Color")
    # toward the cleaner look of the surface as the deposits found it (565's soiling taken off as far as the rain here
    # outdoes the general facade's), but inside one of 564's streaks brightening what is there, so the streak stays
    col1 = g.mix(col, g.mix(look(g, clean), look(g, col), in_streak, 'RGBA'), amt, 'RGBA')
    rough1 = g.mix(g.i("Roughness"), g.i("Clean Roughness"), g.mul(amt, g.one_minus(in_streak)))
    # the rinse: a stream's core where it crosses a heavily soiled zone goes back toward the surface as the deposits
    # found it, as far as its water keeps it (the mask's G). Its edge is soft, inside the ramp the mask's B draws, and
    # reaches further out along a bed joint and its lip, as a streak's does
    hold = g.clamp(g.mx(g.i("Joint"), g.i("Bed")))
    reach = g.mul(hold, RIM_LIP)
    core = g.smooth(g.sub(RIM[0], reach), g.sub(RIM[1], reach), Bm)
    r = g.mul(g.mul(g.mul(Gm, core), g.mul(k, g.facing())), keep)
    ramt = g.mul(r, g.mul(g.i("Strength"), RINSE))
    col2 = g.mix(col1, clean, ramt, 'RGBA')
    rough = g.mix(rough1, g.i("Clean Roughness"), ramt)
    # the optional film over everything the rain does not rinse, greying and dulling it a little, uniformly
    fk = None
    for c, share in CLASS_FILM.items():
        term = g.mul(g.eq(g.i("Class"), float(c)), share)
        fk = term if fk is None else g.add(fk, term)
    left = g.mul(g.one_minus(g.clamp(w)), g.one_minus(g.clamp(r)))
    famt = g.mul(g.mul(g.mul(g.control("film"), FILM), g.mul(left, fk)), g.i("Strength"))
    y2 = g.lum(col2)
    dust = g.rgb(g.mul(y2, FILM_TINT[0]), g.mul(y2, FILM_TINT[1]), g.mul(y2, FILM_TINT[2]))
    veil = g.scale_rgb(g.mix(col2, dust, FILM_GREY, 'RGBA'), FILM_DARK)
    g.o("Color", g.mix(col2, veil, famt, 'RGBA'))
    g.o("Roughness", g.mix(rough, g.mx(rough, FILM_MATTE), famt))
    g.o("Debug", g.mx(g.clamp(g.mul(w, DEBUG_GAIN)), g.clamp(r)))


def elevation(canvas):
    """What the elevation images draw of the mask: the wash, and each stream's rinse as clean as its water keeps its core
    (the core cut as the shader cuts it on a brick's face), so the streams read apart from one another."""
    rim = smooth(RIM[0], RIM[1], canvas[:, :, 2])
    return np.clip(np.maximum(canvas[:, :, 0], canvas[:, :, 1] * rim), 0.0, 1.0)
