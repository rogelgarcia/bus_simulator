# Edge wear and chips at street level (AI 570): what people, bags, carts, doors and wheels do to the corners of the
# stone within their reach. The ICOMOS-ISCS glossary names both results: ROUNDING, "preferential erosion of originally
# angular stone edges leading to a distinctly rounded profile", and CHIPPING, "breaking off of pieces, called chips,
# from the edges of a block". Every mark here comes from the model's own geometry -- the convex arrises of the stone
# the pavement reaches, read from its meshes; how exposed each is to the traffic on the pavement, measured with rays
# from the block; the weak points where a chip comes off, found where a joint, a plinth's corner or the ground meets an
# arris -- and nothing is placed by noise: which of the like places took a knock, and how, is each place's own draw
# (below), so the attributes and the chipped meshes come out the same from one build to the next.
#
# THE ARRISES. Every convex edge of the street-level stone within REACH_TOP of the pavement: the pier ring's corners at
# every opening and at the block's corners, the portal pilasters and their stepped plinths, the portal piers at the
# mouth, the facets of the granite step's rounded nose. An edge hidden inside another solid, lying on the ground, the
# lip of a joint groove, the inner corner of a groove, or one no ray from the street can reach is not an arris the
# street wears.
#
# EXPOSURE. How much traffic an arris takes: the traffic along its stretch of pavement (a base flow everywhere, more
# toward the entrances and the block's corners, where people turn, slow down, carry things in and out), how open it is
# toward the street (rays from it), how far it stands back behind the street line (a corner set back in a recess is
# reached only by what swerves into it; inside an entrance's mouth, by what walks in), how sharp it is (a 135 degree
# corner is blunt) and, along a wall, whether the flow nearest the wall meets it first: Los Angeles walks on the right,
# so the flow nearest a facade keeps it on its right hand and runs toward the face's left end as the street sees it,
# and the arris each pier presents to that flow -- its right-hand one -- takes the knocks head on.
#
# THE WEAR (the shader, from attributes on the stone's own meshes, like AI 568's iron): along every worn arris, a band
# on both of its faces where the stone is abraded -- lighter, as its weathered skin is rubbed off, and rougher -- and
# its shading normal turned over the edge as a rounded arris's would be, both scaled by the arris's wear (its exposure
# times its own draw) and by the height over the pavement (P_FOOT at the foot, all of it from cart to hip height, gone
# by REACH_TOP). The fields are distances to the arris lines, linear over each planar face, so they are exact at any
# distance.
#
# THE CHIPS (real geometry): a chip is an event, a piece knocked off an arris: a conchoidal scoop cut with an exact
# boolean, lighter stone inside. The arris's places set how often they come: its weak points -- where a joint meets it
# (the pier ring's joint grooves, a shaft's foot on its plinth), a plinth's stepped corners, its foot on the ground --
# each by its risk (exposure x the height's share of the knocks x the point's weakness), and every stretch of it
# within reach, less weak, by its own. The chipped meshes are this feature's own objects, shown while it is on, the
# originals while it is off: the pier ring as a chipped copy, and each of the three portals (one collection instanced
# three times) as an instance of its own copy of that collection, with its own copies of the worn pieces in place of
# the originals.
#
# ONE AT A TIME (the rework of 2026-09-23). The geometry says where a chip can come off and how exposed each arris is,
# but a model whose piers and portals are all alike stamped the same chips at the same places on each: every door jamb
# chipped at both of its joint grooves, three portals chipped alike, always on the same side (user 2026-09-23: marks
# must not repeat identically from one instance to the next). What decides which of the like places did lose a piece
# is what the model does not carry -- a cart that caught one jamb, a flaw in one block, a portal used more than
# another. So each portal draws its own use and each arris its own share of the knocks its exposure says (its band,
# its rounding, its risk); each element -- a portal as a whole, and on the pier ring each entrance's and each block
# corner's stretch and the rest of each face -- draws how many pieces it lost, about as many as its places' rates add
# up to, and where each one fell, by those rates; and each chip draws its own size, outline, shape and age. The seed
# is the place's own (sha256 of "edge_wear:" and a key made of the instance, the object and the place in the object's
# coordinates, or of the element): a rebuild draws the same, and a change elsewhere reshuffles nothing.
#
# PUBLISHED for the features that follow: `arrises`, `chips`, `sites`, `elements`, `entrances`, `profile` (see the
# README's "Edge wear and chips at street level (AI 570)").
import hashlib, math
from collections import defaultdict
import numpy as np
from .. import classes
from ..geometry import FACADES, Z_GROUND, facade_of

NAME = "edge_wear"
AI = 570
LABEL = "edge wear and chips at street level"
ORDER = 110                     # a fabric feature: before the deposits, which lie over the worn arrises in proportion
NEEDS = ("street_grime",)       # its portal mouths (`runs`, kind step) and its corner inventory (`corners`)
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.15, 0.85, 0.15)
# no MASK: the wear lies on the stone's own meshes, as attributes, and in the chipped geometry

# ---------------------------------------------------------------------------------------------------- reach
REACH_TOP = 2.00                # nothing higher than this over the pavement takes wear
P_FOOT = 0.55                   # the knocks by height: this share at the foot (feet, wheels, brooms), ...
P_RISE = 0.35                   # ... all of them from this height (a cart's bed, a knee) ...
P_HIP = 1.10                    # ... to this one (hips, bags carried at the side), falling to none at REACH_TOP

# ---------------------------------------------------------------------------------------------------- the arrises
TURN_MIN = 30.0                 # degrees: a convex edge turning at least this much is an arris ...
NOSE_TURN = 12.0                # ... and from this much, a facet of an already rounded nose (the step's): worn, not rounded
MIN_LEN = 0.015                 # an arris shorter than this within reach is a groove's inner corner, not a knockable edge
SAMPLE = 0.05                   # exposure is measured this often along an arris
PROBE = 0.003                   # the probes start this far out from the arris, along its bisector
OPEN_LEN, OPEN_MIN = 0.35, 0.45     # open: rays leave it this far in at least this share of its outward directions
STREET_LEN = 1.5                # toward the street: level and rising rays that get this far
GROOVE_PROBE = 0.03             # a horizontal edge whose ledge meets the opposite lip of a groove within this is a lip
K_MIN = 0.06                    # an arris whose exposure never reaches this is left alone
ALONG = 0.45                    # an edge running with the flow (a moulding's ledge along the facade) is grazed, not
                                # struck: it takes this share (the flow along the pavement; in a mouth, the flow walking in)

# ---------------------------------------------------------------------------------------------------- the street
PROFILE_H = 0.30                # the street line is read at this height over the pavement ...
PROFILE_RES = 0.02              # ... every this much along each face ...
LINE_W = 0.60                   # ... as the most forward stone within this along the face
LINE_FAR = 3.00                 # in front of an opening wider than that, the stone's front within this either side
T_BASE = 0.45                   # the traffic along a face far from any entrance or corner, against theirs
T_REACH = 2.0                   # an entrance's or a corner's own traffic falls off over this along the pavement (e-fold)
SET_E = 0.35                    # behind the street line an arris loses its exposure over this (e-fold), ...
IN_E = 1.20                     # ... inside an entrance's mouth over this: the people walking in reach it
LEAD_TRAIL = 0.70               # an arris the flow nearest the wall meets last (keep right) takes this share
CORNER_END = 0.50               # an arris this close to a face's end is the block's corner: both streets' flows meet it
MOUTH_PAD = 0.10                # an entrance's jambs: the arrises within this of its mouth (a shaft 5 cm off the step)
PULL_Z = (0.80, 2.00)           # a door: a small part at hand height in an opening of the stone (a pull), ...
PULL_H = 0.60                   # ... no taller than this
OPENING_MIN = 1.0               # an opening of the pier ring at least this wide

# ---------------------------------------------------------------------------------------------------- the chips
WEAK = dict(corner=1.00, joint=0.90, foot=1.00, knock=0.70)   # how weak each kind of point is: a trihedral corner the
                                # most; a stretch of arris between its joints, held on both sides, the least
GRANITE = 0.50                  # the granite step: this much of the sandstone's weakness
R_LO, R_HI = 0.30, 0.95         # chips are events at the rate their places give: none below R_LO of risk, rising (a
RATE = dict(corner=0.40, joint=0.38, foot=0.22)     # smoothstep) to this many at a weak point from R_HI ...
KNOCK_RATE = 0.40               # ... and to this many per metre of an arris between its weak points
ZONE = 1.50                     # the pier ring's arrises within this of an entrance or a block corner are its element's
COUNT = (0.60, 1.40)            # an element took its places' expected count times this (rounded by a draw) ...
N_CAP = 12                      # ... and no more than this; a weak point loses one piece at most
H_PEAK = 0.75                   # a joint below this chips the block above it, above it the block below ...
TOWARD_PEAK = 0.75              # ... this often, and the other block otherwise
JOINT_GAP = 0.03                # two runs of one arris line apart by at most this meet at a joint (a groove)
SUPPORT = 0.02                  # an arris's end rests on (or under) another block when a probe meets one within this
STEP_TOP = 0.20                 # a support no higher than this over the pavement is the ground (the portal's step)
CHIP_LEN = (0.012, 0.048)       # a chip's length along the arris, from R_LO of risk to all of it, times its SIZE x ASPECT
CHIP_DEPTH = (0.004, 0.017)     # and its depth into each face, times its SIZE / ASPECT
SIZE, ASPECT = (0.70, 1.40), (0.75, 1.30)
KNOCK_SIZE = 0.80               # a knock between the joints takes a smaller piece
LEN_CLIP, DEPTH_CLIP = (0.010, 0.060), (0.0035, 0.022)
ASYM = (-0.30, 0.55)            # the face turned to the street loses this much more, the other this much less ...
TILT = (-0.35, 0.35)            # ... and that share changes by this much from one end of the chip to the other
Q = (1.10, 1.80)                # the scar's section: a superellipse bulging a little into the stone (a shallow conchoidal
                                # fracture: 1 would be flat across the corner, 2 an elliptic scoop)
END = (0.90, 3.20)              # its outline along the arris: (1 - u^p)^(1/p) of its depth at u of the way to its end, so
                                # a pointed end near 1, a round one at 2, a blunt break (a hinge) past it; each end its own,
                                # drawn evenly across the bounds (every outline as likely as any other)
PEAK = (0.00, 0.35)             # from a joint or a foot the scar runs this share of its length at full depth first
BACK = (0.35, 0.90)             # a knock's scar also runs out behind its deepest point, over this share of its length
ARC_SEG, LEN_SEG = (2, 4), (3, 5)   # facets of the scar, across and along: coarse and angular, as a fracture is
JITTER = 0.18                   # each facet's corner set in or out by up to this share ...
JITTER_ALONG = 0.15             # ... and each section's depth along the arris by up to this
FRESH = (0.55, 1.00)            # how fresh the scar still is: 1 a recent break, less one the weather has had for years
CHIP_SPACING = 0.12             # chips on one object keep at least this apart (the stronger stays)
G_MIN = 0.04                    # the scar's section at its far end, a sliver
MARGIN = 0.004                  # the cutter reaches this far outside the stone, tapering toward the arris (a corner chip
TAPER = 0.5                     # at a moulding's step must not notch the block it sits on)
EXT_JOINT, EXT_FOOT = 0.004, 0.010      # and this far past the joint (into the groove) or under the ground
PAD = 0.003                     # two chips' cutters on one object keep at least this apart

# ---------------------------------------------------------------------------------------------------- one at a time
USE = (0.80, 1.20)              # a portal's own use: its arrises' wear and its chips' risk, times this
WEAR = (0.60, 1.20)             # an arris's own share of the knocks its exposure says: its band, its rounding, its risk
K_CAP = 1.00                    # ... held within the calibrated most

# ---------------------------------------------------------------------------------------------------- the look
FIELDS = 2                      # the arrises one face corner carries (a pier's front: its two; the nearest two elsewhere)
W_MAX = 0.06                    # a face takes an arris's field only if it comes this close to it
BAND_W = 0.010                  # the abraded band reaches this far onto each face at full wear (x sqrt of the wear),
                                # falling off as the square of a smoothstep: most of it in the first few millimetres
ROUND_R = 0.005                 # the arris reads rounded over this radius at full wear
LIGHT_GAIN = 1.50               # abraded stone: its own colour this much lighter ...
LIGHT_DESAT = 0.20              # ... and this much paler (toward its own grey) ...
WORN_ROUGH = 0.85               # ... and at least this rough
FRESH_L = 0.34                  # a chip's fresh fracture: the stone's colour lifted toward this luminance (fresh sandstone
FRESH_GAIN = (1.25, 2.60)       # is pale whatever its weathered skin), by a gain held within these, ...
FRESH_DESAT = 0.35              # ... this much paler, toward a warm grey ...
FRESH_TINT = (1.00, 0.93, 0.86)
FRESH_ROUGH = 0.92              # ... and at least this rough
DEBUG_W, DEBUG_GAIN = 0.035, 2.5    # the debug view draws the band this wide, at full colour from 1 / DEBUG_GAIN of wear
DBG_OFF = 0.10                  # the debug markers stand this far off the arris, along its bisector (a chip's twice)

PORTAL_COPY = "WEAR_edge_"      # the worn copies carry this prefix: the pier ring's, each portal's pieces (then its
                                # instancer's name) and each portal's copy of the collection
TWIN_Z = -1000.0                # the portal copies' second, unseen instance stands this far under the block (apply())


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def knocks(H):
    """The share of the knocks at a height H over the pavement: P_FOOT at the foot, all of them from P_RISE to P_HIP,
    none from REACH_TOP."""
    H = np.asarray(H, np.float64)
    return (P_FOOT + (1.0 - P_FOOT) * smooth(0.0, P_RISE, H)) * (1.0 - smooth(P_HIP, REACH_TOP, H))


def unit(v):
    v = np.asarray(v, np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def draw(key, n):
    """n uniforms in 0..1 from a place's own seed: the sha256 of "edge_wear:" and its key, two bytes each (more than
    sixteen carry on in the sha256 of the key and "#1", "#2", ...), so every rebuild draws the same values and nothing
    drawn for one place moves when another changes."""
    out, i = [], 0
    while len(out) < n:
        h = hashlib.sha256(("edge_wear:" + key + (f"#{i}" if i else "")).encode("utf-8")).digest()
        out += [int.from_bytes(h[2 * j:2 * j + 2], "big") / 65535.0 for j in range(16)]
        i += 1
    return out[:n]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def pick(bounds, u):
    # a whole number within the bounds, both included
    return bounds[0] + min(int(u * (bounds[1] - bounds[0] + 1)), bounds[1] - bounds[0])


def pkey(p):
    # a place in an object's own coordinates, to the millimetre: the key of what stands there
    return ",".join(f"{float(v):.3f}" for v in p)


def instance_stats(blk):
    """Per render instance of the block: its lowest and highest z, its centre, and whether any of it is stone."""
    ni = len(blk.inst)
    masonry = np.zeros(len(classes.NAMES), bool); masonry[list(classes.MASONRY)] = True
    zlo = np.full(ni, np.inf); zhi = np.full(ni, -np.inf); cen = np.zeros((ni, 3))
    for k in range(3):
        c = blk.V[:, k][blk.T]                                   # (triangles, 3): one coordinate of each corner
        cen[:, k] = np.bincount(blk.tri_inst, weights=c.mean(axis=1), minlength=ni)
        if k == 2:
            np.minimum.at(zlo, blk.tri_inst, c.min(axis=1)); np.maximum.at(zhi, blk.tri_inst, c.max(axis=1))
    cnt = np.bincount(blk.tri_inst, minlength=ni).astype(np.float64)
    cen /= np.maximum(cnt, 1.0)[:, None]
    stone = np.bincount(blk.tri_inst, weights=masonry[np.clip(blk.tri_class, 0, None)].astype(np.float64),
                        minlength=ni) > 0
    return dict(zlo=zlo, zhi=zhi, cen=cen, cnt=cnt, stone=stone)


# ---------------------------------------------------------------------------------------------------- the meshes
def mesh_arrays(me):
    """A mesh's vertices, polygons (loop start, loop count), loop vertices, polygon normals and centres and material
    indices, as numpy arrays in the mesh's own coordinates."""
    nv, npoly, nl = len(me.vertices), len(me.polygons), len(me.loops)
    V = np.empty(nv * 3); me.vertices.foreach_get("co", V)
    ls = np.empty(npoly, np.int64); me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(npoly, np.int64); me.polygons.foreach_get("loop_total", lt)
    lv = np.empty(nl, np.int64); me.loops.foreach_get("vertex_index", lv)
    N = np.empty(npoly * 3); me.polygons.foreach_get("normal", N)
    C = np.empty(npoly * 3); me.polygons.foreach_get("center", C)
    mi = np.empty(npoly, np.int64); me.polygons.foreach_get("material_index", mi)
    return V.reshape(-1, 3), ls, lt, lv, N.reshape(-1, 3), C.reshape(-1, 3), mi


def components(ls, lt, lv, nv):
    """How many connected pieces a mesh is (the portal's pieces are stacked boxes)."""
    parent = np.arange(nv)

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for p in range(len(ls)):
        vs = lv[ls[p]:ls[p] + lt[p]]
        r0 = root(int(vs[0]))
        for v in vs[1:]:
            r = root(int(v))
            if r != r0: parent[max(r, r0)] = min(r, r0); r0 = min(r, r0)
    used = np.unique(lv)
    return len({root(int(v)) for v in used})


def find_lines(V, ls, lt, lv, N, C):
    """The convex edges of a mesh, joined into arris lines: every edge between two faces turning at least NOSE_TURN,
    convex, grouped by the pair of face planes it lies between (two planes meet in one line), its runs merged along
    the line. Each line: its direction t and a point p0 (the mesh's coordinates), its runs [t0, t1] along t, the two
    faces' normals and plane offsets, the in-face directions uA, uB from the line into each face, a polygon of each,
    the turn in degrees and whether it is a nose facet (turning less than TURN_MIN)."""
    npoly = len(ls)
    off = np.einsum("ij,ij->i", N, C)
    pid = {}
    plane = np.empty(npoly, np.int64)
    for p in range(npoly):
        key = (int(round(N[p, 0] * 1e4)), int(round(N[p, 1] * 1e4)), int(round(N[p, 2] * 1e4)), int(round(off[p] * 1e4)))
        plane[p] = pid.setdefault(key, len(pid))
    edges = defaultdict(list)                # (a, b) -> the polygons along the edge
    for p in range(npoly):
        vs = [int(v) for v in lv[ls[p]:ls[p] + lt[p]]]
        n = len(vs)
        for i in range(n):
            a, b = vs[i], vs[(i + 1) % n]
            edges[(a, b) if a < b else (b, a)].append(p)
    lines = {}
    for (a, b), fs in edges.items():
        if len(fs) != 2: continue
        fa, fb = fs
        if plane[fa] == plane[fb]: continue
        nA, nB = N[fa], N[fb]
        turn = math.degrees(math.acos(float(np.clip(nA @ nB, -1.0, 1.0))))
        if turn < NOSE_TURN: continue
        pa, pb = V[a], V[b]
        e = unit(pb - pa)
        # from the edge into each face (toward its centre, square to the edge): convex when face B runs behind face A
        into_a = C[fa] - pa; into_a = into_a - (into_a @ e) * e
        into_b = C[fb] - pa; into_b = into_b - (into_b @ e) * e
        if not (into_b @ nA < -1e-7 and into_a @ nB < -1e-7): continue
        key = (min(plane[fa], plane[fb]), max(plane[fa], plane[fb]))
        if plane[fa] > plane[fb]: fa, fb, nA, nB, into_a, into_b = fb, fa, nB, nA, into_b, into_a
        L = lines.get(key)
        if L is None:
            t = unit(np.cross(nA, nB))
            p0 = pa - (pa @ t) * t
            uA = unit(np.cross(nA, t)); uA = uA if into_a @ uA > 0 else -uA
            uB = unit(np.cross(nB, t)); uB = uB if into_b @ uB > 0 else -uB
            L = lines[key] = dict(t=t, p0=p0, runs=[], nA=nA.copy(), nB=nB.copy(), offA=float(off[fa]),
                                  offB=float(off[fb]), uA=uA, uB=uB, fa=int(fa), fb=int(fb), turn=turn,
                                  nose=turn < TURN_MIN)
        ta, tb = float(pa @ L["t"]), float(pb @ L["t"])
        L["runs"].append((min(ta, tb), max(ta, tb)))
    out = []
    for key in sorted(lines):
        L = lines[key]
        runs = sorted(L["runs"]); merged = [list(runs[0])]
        for r0, r1 in runs[1:]:
            if r0 <= merged[-1][1] + 1e-4: merged[-1][1] = max(merged[-1][1], r1)
            else: merged.append([r0, r1])
        L["runs"] = [tuple(r) for r in merged]
        out.append(L)
    return out


# ---------------------------------------------------------------------------------------------------- the street
class Street:
    """The pavement's side of the block: per face the street line (the most forward stone within LINE_W along it, at
    PROFILE_H over the pavement), the perimeter the pavement runs round (the block's corners on it), and the
    entrances: the portals' mouths (567's step runs) and the doors (openings of the pier ring with a pull at hand
    height). traffic(f, s) is the pavement's traffic there, against the most at an entrance or a corner."""

    def __init__(self, blk, steps, stats, d_ring, log=print):
        from mathutils import Vector
        self.blk, self.stats, self.d_ring = blk, stats, float(d_ring)
        self.cum = np.concatenate([[0.0], np.cumsum([F.L for F in FACADES])])
        self.perimeter = float(self.cum[-1])
        masonry = np.zeros(len(classes.NAMES), bool); masonry[list(classes.MASONRY)] = True
        self.prof = {}
        n_rays = 0
        for F in FACADES:
            n = int(round(F.width / PROFILE_RES))
            S = F.s0 + (np.arange(n) + 0.5) * PROFILE_RES
            D = np.full(n, np.nan); stone = np.zeros(n, bool)
            dirv = Vector((-F.n[0], -F.n[1], 0.0))
            for i, s in enumerate(S):
                loc, nor, ti, dist = blk.bvh.ray_cast(Vector(F.world(float(s), 4.0, Z_GROUND + PROFILE_H)), dirv, 12.0)
                n_rays += 1
                if loc is None: continue
                D[i] = 4.0 - dist; stone[i] = masonry[max(int(blk.tri_class[ti]), 0)]
            Ds = np.where(stone, D, -99.0)
            k = int(round(LINE_W / PROFILE_RES))
            line = np.array([Ds[max(0, i - k):i + k + 1].max() for i in range(n)])
            self.prof[F.idx] = dict(s=S, d=D, stone=stone, line=np.where(line > -98.0, line, np.nan))
        self.entrances = []
        for r in steps:
            self.entrances.append(dict(id=f"portal:{FACADES[r['facade']].name}:{r['s0']:.2f}", kind="portal",
                                       facade=r["facade"], s0=float(r["s0"]), s1=float(r["s1"]), object=r["object"]))
        self.entrances += self._doors(masonry)
        for e in self.entrances:
            e["p0"], e["p1"] = self.perim(e["facade"], e["s0"]), self.perim(e["facade"], e["s1"])
        log(f"   edge_wear: the street line from {n_rays} level rays; entrances: "
            + ", ".join(f"{e['kind']} {FACADES[e['facade']].name} {e['s0']:.2f}..{e['s1']:.2f}" for e in self.entrances))

    def _doors(self, masonry):
        # the small parts at hand height in the block itself (not the portals'), not stone: door pulls
        blk, st = self.blk, self.stats
        zlo, zhi, cen, cnt, stone = st["zlo"], st["zhi"], st["cen"], st["cnt"], st["stone"]
        doors = {}
        for i, d in enumerate(blk.inst):
            if d["instancer"] is not None or stone[i] or cnt[i] == 0: continue
            if zlo[i] < Z_GROUND + PULL_Z[0] or zhi[i] > Z_GROUND + PULL_Z[1] or zhi[i] - zlo[i] > PULL_H: continue
            c = cen[i]
            f = int(facade_of(c[0], c[1])); F = FACADES[f]
            s, dd, _ = F.sdz(c[0], c[1], c[2])
            pr = self.prof[f]
            j = int(np.argmin(np.abs(pr["s"] - s)))
            if not (-1.5 < dd < self.line(f, s) + 0.1): continue
            # the opening round it: out along the face to where the stone front stands at the street line again
            front = pr["stone"] & (pr["d"] > np.where(np.isfinite(pr["line"]), pr["line"], self.d_ring) - 0.05)
            if front[j]: continue
            a = j
            while a > 0 and not front[a - 1]: a -= 1
            b = j
            while b < len(front) - 1 and not front[b + 1]: b += 1
            s0, s1 = float(pr["s"][a] - 0.5 * PROFILE_RES), float(pr["s"][b] + 0.5 * PROFILE_RES)
            if s1 - s0 < OPENING_MIN: continue
            doors.setdefault((f, round(s0, 2), round(s1, 2)), []).append(d["object"])
        return [dict(id=f"door:{FACADES[f].name}:{s0:.2f}", kind="door", facade=f, s0=s0, s1=s1,
                     object=",".join(sorted(obs))) for (f, s0, s1), obs in sorted(doors.items())]

    def perim(self, f, s):
        return float(self.cum[f] + s)

    def pdist(self, p, q):
        d = abs(p - q) % self.perimeter
        return min(d, self.perimeter - d)

    def span_dist(self, p, p0, p1):
        if (p - p0) % self.perimeter <= (p1 - p0) % self.perimeter: return 0.0
        return min(self.pdist(p, p0), self.pdist(p, p1))

    def traffic(self, f, s):
        p = self.perim(f, s)
        near = [self.span_dist(p, e["p0"], e["p1"]) for e in self.entrances] + [self.pdist(p, c) for c in self.cum[:-1]]
        return T_BASE + (1.0 - T_BASE) * math.exp(-min(near) / T_REACH)

    def mouth(self, f, s, pad=MOUTH_PAD):
        # the entrance whose mouth (a portal's) or opening (a door's) this point of face f stands in, if any
        for e in self.entrances:
            if e["facade"] == f and e["s0"] - pad <= s <= e["s1"] + pad: return e
        return None

    def line(self, f, s):
        # the street line at s: the most forward stone within LINE_W; in front of a wide opening, the nearest stone's
        # front within LINE_FAR (the piers either side: the pavement runs along them), else the pier ring's front
        pr = self.prof[f]
        j = int(np.clip(np.searchsorted(pr["s"], s), 0, len(pr["s"]) - 1))
        v = pr["line"][j]
        if np.isfinite(v): return float(v)
        k = int(round(LINE_FAR / PROFILE_RES))
        near = pr["stone"][max(0, j - k):j + k + 1]
        if near.any():
            return float(np.nanmax(np.where(near, pr["d"][max(0, j - k):j + k + 1], np.nan)))
        return self.d_ring


# ---------------------------------------------------------------------------------------------------- measuring
def _dirs26():
    out = []
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            for z in (-1, 0, 1):
                if x or y or z: out.append(unit((x, y, z)))
    return np.array(out)


DIRS26 = _dirs26()


class Probe:
    """Rays from one arris point: inside another solid, open, reachable from the street."""

    def __init__(self, blk):
        from mathutils import Vector
        self.blk, self.V, self.rays = blk, Vector, 0

    def hit(self, o, d, dist):
        self.rays += 1
        return self.blk.bvh.ray_cast(self.V(o), self.V(d), dist)

    def inside(self, P, b):
        loc, nor, ti, dd = self.hit(P, b, 1.0)
        return loc is not None and (nor.x * b[0] + nor.y * b[1] + nor.z * b[2]) > 0.0

    def openness(self, P, nA, nB):
        ext = [d for d in DIRS26 if d @ nA > -0.05 or d @ nB > -0.05]
        free = 0
        for d in ext:
            if P[2] + OPEN_LEN * d[2] < Z_GROUND: continue                 # the pavement
            if self.hit(P, d, OPEN_LEN)[0] is None: free += 1
        return free / max(len(ext), 1)

    def street(self, P, nA, nB, F):
        n = np.array([F.n[0], F.n[1], 0.0]); t = np.array([F.t[0], F.t[1], 0.0])
        free = tot = 0
        for az in (-70, -50, -30, -10, 10, 30, 50, 70):
            h = math.cos(math.radians(az)) * n + math.sin(math.radians(az)) * t
            for el in (0.0, 25.0):
                d = math.cos(math.radians(el)) * h + np.array([0.0, 0.0, math.sin(math.radians(el))])
                if d @ nA < -0.05 and d @ nB < -0.05: continue             # into the stone itself
                tot += 1
                if self.hit(P, d, STREET_LEN)[0] is None: free += 1
        return free / max(tot, 1)

    def groove_lip(self, P, nV, nH):
        # a horizontal edge whose ledge nH meets the opposite lip of a groove just past it: a joint's lip
        o = P - 0.004 * nV + 0.004 * nH
        loc, nor, ti, dd = self.hit(o, nH, GROOVE_PROBE)
        return loc is not None and (nor.x * nH[0] + nor.y * nH[1] + nor.z * nH[2]) < -0.5

    def support(self, P, d):
        # what rests under (d down) or over (d up) an arris's end: its height and object, from a little inside the
        # end's own level
        loc, nor, ti, dd = self.hit(P - 0.002 * d, d, SUPPORT + 0.002)
        return None if loc is None else (float(loc.z), self.blk.inst[self.blk.tri_inst[ti]]["object"])


def world_frame(M):
    M = np.asarray(M, np.float64)
    return M[:3, :3], M[:3, 3]


def measure(L, M, street, probe):
    """One arris line, one instance: its samples within reach, each with its world point, height, exposure and the
    readings behind it; or None where it is not an arris the street wears."""
    R, T = world_frame(M)
    tw, nA, nB = unit(R @ L["t"]), unit(R @ L["nA"]), unit(R @ L["nB"])
    b = unit(nA + nB)
    vertical, horizontal = abs(tw[2]) > 0.9, abs(tw[2]) < 0.1
    zp0, tz = float((R @ L["p0"] + T)[2]), float((R @ L["t"])[2])
    if horizontal and not L["nose"]:
        # a ledge's edge: on the ground, or a joint groove's lip, is no arris. One line may hold the lips of several
        # piers (they share the face's planes), so the groove is probed on a run of it, not between two
        nV, nH = (nA, nB) if abs(nA[2]) < abs(nB[2]) else (nB, nA)
        if nH[2] < -0.9 and zp0 - Z_GROUND < 0.01: return None
        r0, r1 = max(L["runs"], key=lambda r: (r[1] - r[0], -r[0]))
        P = R @ (L["p0"] + 0.5 * (r0 + r1) * L["t"]) + T
        if abs(nH[2]) > 0.9 and abs(nV[2]) < 0.1 and probe.groove_lip(P, nV, nH): return None
    samples, length = [], 0.0
    for t0, t1 in L["runs"]:
        a, c = t0, t1
        if abs(tz) > 1e-6:                   # the part of the run within reach
            lim = (Z_GROUND + REACH_TOP + 0.5 * SAMPLE - zp0) / tz
            if tz > 0: c = min(c, lim)
            else: a = max(a, lim)
        elif zp0 - Z_GROUND > REACH_TOP: continue
        if c - a < 1e-4: continue
        length += c - a
        n = max(1, int(math.ceil((c - a) / SAMPLE - 1e-9)))
        for i in range(n):
            tt = a + (i + 0.5) * (c - a) / n
            P = R @ (L["p0"] + tt * L["t"]) + T
            H = float(P[2] - Z_GROUND)
            if H < -0.02 or H > REACH_TOP + SAMPLE: continue
            samples.append((tt, P, H))
    if not samples or length < MIN_LEN: return None
    sharp = 1.0 if L["nose"] else min(1.0, L["turn"] / 90.0)
    rows = []
    for tt, P, H in samples:
        Pp = P + PROBE * b
        f = int(facade_of(Pp[0], Pp[1])); F = FACADES[f]
        s, d, _ = F.sdz(Pp[0], Pp[1], Pp[2])
        row = dict(tt=tt, P=P, H=H, facade=f, s=float(s), d=float(d), inside=False, open=0.0, street=0.0,
                   traffic=0.0, depth=0.0, lead=1.0, orient=1.0, k=0.0, mouth=None)
        if probe.inside(Pp, b):
            row["inside"] = True; rows.append(row); continue
        row["open"] = probe.openness(Pp, nA, nB)
        if row["open"] < OPEN_MIN: rows.append(row); continue
        row["street"] = probe.street(Pp, nA, nB, F)
        row["traffic"] = street.traffic(f, s)
        e = street.mouth(f, s)
        row["mouth"] = e["id"] if e else None
        line = street.line(f, s)
        setback = max(0.0, (line - d) if line is not None else 0.0)
        row["depth"] = math.exp(-setback / (IN_E if e else SET_E))
        tf, nf = np.array([F.t[0], F.t[1], 0.0]), np.array([F.n[0], F.n[1], 0.0])
        if vertical and e is None:
            # the flow nearest the wall runs toward -s (keep right): a pier's right-hand arris (its return faces +s)
            # meets it first; a block corner, at a face's end, meets both streets' flows
            ret = nA if abs(nA @ tf) > abs(nB @ tf) else nB
            corner = s < CORNER_END or s > F.L - CORNER_END
            row["lead"] = 1.0 if corner or ret @ tf > 0.0 else LEAD_TRAIL
        # an edge running with a flow is grazed by it, one across it struck: the flow along the pavement everywhere,
        # and in an entrance's mouth the flow walking in (the step's nose runs across it)
        row["orient"] = max(1.0 - (1.0 - ALONG) * float(tw @ tf) ** 2,
                            (1.0 - (1.0 - ALONG) * float(tw @ nf) ** 2) if e else 0.0)
        row["k"] = sharp * row["street"] * row["traffic"] * row["depth"] * row["lead"] * row["orient"]
        rows.append(row)
    # an arris partly hidden (a plinth's side edge running back into the pier ring) is worn where it shows
    if not any(not r["inside"] and r["open"] >= OPEN_MIN for r in rows): return None
    return dict(rows=rows, tw=tw, nA=nA, nB=nB, b=b, vertical=vertical, horizontal=horizontal, sharp=sharp,
                length=length)


# ---------------------------------------------------------------------------------------------------- chips
def spow(v, e):
    return max(v, 0.0) ** e


def chip_shape(key, risk, kind):
    """A chip's own size and shape, drawn from its weak point's seed: its length along the arris and its depth into the
    faces (the risk's measure, times its own size and aspect), which face loses more and how that share changes along
    it, how round the scar's section is and how each of its ends runs out, how many facets the fracture broke into and
    how each facet's corner sits, and how fresh the scar still is."""
    u = draw("shape:" + key, 24)
    t = float(np.clip((risk - R_LO) / (1.0 - R_LO), 0.0, 1.0))
    size, aspect = mid(SIZE, u[0], u[1]) * (KNOCK_SIZE if kind == "knock" else 1.0), mid(ASPECT, u[2], u[3])
    return dict(L=float(np.clip((CHIP_LEN[0] + t * (CHIP_LEN[1] - CHIP_LEN[0])) * size * aspect, *LEN_CLIP)),
                D=float(np.clip((CHIP_DEPTH[0] + t * (CHIP_DEPTH[1] - CHIP_DEPTH[0])) * size / aspect, *DEPTH_CLIP)),
                asym=mid(ASYM, u[4], u[5]), tilt=mid(TILT, u[6], u[7]), q=mid(Q, u[8], u[9]),
                end=(END[0] + (END[1] - END[0]) * u[10], END[0] + (END[1] - END[0]) * u[20]), arc=pick(ARC_SEG, u[12]),
                seg=pick(LEN_SEG, u[13]), peak=mid(PEAK, u[14], u[15]), back=mid(BACK, u[16], u[17]),
                fresh=mid(FRESH, u[18], u[19]),
                along=[1.0 + JITTER_ALONG * (2.0 * v - 1.0) for v in draw("along:" + key, 16)],
                jit=[1.0 + JITTER * (2.0 * v - 1.0) for v in draw("facets:" + key, 64)])


def lens_points(O, tc, uA, uB, DA, DB, sh, ext, back):
    """An edge chip: sections of a superellipse scoop DA into face A (along uA) and DB into face B (along uB) where it
    is deepest, feathering out over sh["L"] along tc: from a joint or a foot after running sh["peak"] of that length at
    full depth, with `ext` more before O (into the groove, under the ground) at full depth; from a knock between the
    joints, over `back` behind O as well. The faces' shares change along it by sh["tilt"], its section is as round as
    sh["q"], each end runs out as sh["end"] says, each section a little deeper or shallower (sh["along"]), in sh["arc"]
    x sh["seg"] facets whose corners sit in or out by sh["jit"]; and a margin outside the stone, so the cutter crosses
    its faces cleanly."""
    L, n = sh["L"], sh["seg"]
    wob = iter(sh["along"])

    def fall(k, p):                                  # k sections of n toward an end whose outline runs out as p says
        g = spow(1.0 - (k / n) ** p, 1.0 / p) * (next(wob) if 0 < k < n else 1.0)
        return max(min(g, 1.0), G_MIN)
    if back > 0.0:                                   # a knock: deepest at O, running out both ways
        secs = ([(-back * k / n, fall(k, sh["end"][1]), -k / n) for k in range(n, 0, -1)]
                + [(L * k / n, fall(k, sh["end"][0]), k / n) for k in range(n + 1)])
    else:                                            # from a joint or a foot, the groove's or the ground's side first
        xp = sh["peak"] * L
        secs = ([(-ext, 1.0, 0.0)] + ([(0.0, 1.0, 0.0)] if xp > 5e-4 else [])
                + [(xp + (L - xp) * k / n, fall(k, sh["end"][0]), (xp + (L - xp) * k / n) / L) for k in range(n + 1)])
    jit = iter(sh["jit"])
    pts = []
    for i, (along, g, w) in enumerate(secs):
        base = O + along * tc
        a1, b1 = DA * g * (1.0 + sh["tilt"] * w), DB * g * (1.0 - sh["tilt"] * w)
        for j in range(sh["arc"] + 1):
            psi = 0.5 * math.pi * j / sh["arc"]
            f = 1.0 if (back == 0.0 and i == 0) else next(jit)     # the part in the groove or the ground stays whole
            a = a1 * spow(math.cos(psi), 2.0 / sh["q"]) if j < sh["arc"] else 0.0
            b = b1 * spow(math.sin(psi), 2.0 / sh["q"]) if j > 0 else 0.0
            pts.append(base + f * (a * uA + b * uB))
        pts += [base - MARGIN * (uA + uB), base + TAPER * a1 * uA - MARGIN * uB, base - MARGIN * uA + TAPER * b1 * uB]
    return pts


def corner_points(O, e, A, sh):
    """A corner chip: the octant of a superellipsoid as round as sh["q"], with semi-axes A along the three edges e
    meeting at the corner O, in sh["arc"] + 1 facets each way whose corners sit in or out by sh["jit"]; and the same
    surface pushed out across each face it lies on, so the cutter crosses the faces cleanly."""
    n, x = sh["arc"] + 1, 2.0 / sh["q"]
    jit = iter(sh["jit"])
    pts = [O - MARGIN * (e[0] + e[1] + e[2])]
    for i in range(n + 1):
        th = 0.5 * math.pi * i / n
        for j in range(n + 1):
            ph = 0.5 * math.pi * j / n
            f = next(jit)
            c = [f * A[0] * spow(math.sin(th) * math.cos(ph), x), f * A[1] * spow(math.sin(th) * math.sin(ph), x),
                 f * A[2] * spow(math.cos(th), x)]
            pts.append(O + c[0] * e[0] + c[1] * e[1] + c[2] * e[2])
            for ax in range(3):
                if c[ax] < 1e-9:
                    cc = [TAPER * v for v in c]; cc[ax] = -MARGIN
                    pts.append(O + cc[0] * e[0] + cc[1] * e[1] + cc[2] * e[2])
    return pts


def street_face(L, m, R):
    # which of an arris's two faces is turned to the street more: it takes the deeper scar
    F = FACADES[m["rows"][0]["facade"]]
    n = np.array([F.n[0], F.n[1], 0.0])
    return (unit(R @ L["nA"]) @ n) >= (unit(R @ L["nB"]) @ n)


def weak_points(obj, lines, meas, M0, probe, tag, hard):
    """The weak points of one object's worn arrises in one instance, in the object's own coordinates: where a joint
    meets a vertical arris (a gap between two runs of one line: a groove; or an end resting on, or under, another
    block), a corner where three worn arrises meet, an arris's foot on the ground. Each with its kind, place and
    height, its key, the risk of a chip there (from the instance's own wear, `kw`) and the rate of chips it adds to its
    arris (`mass`)."""
    R, T = world_frame(M0)
    sites = []

    def k_at(li, tt):
        rows = [r for r in meas[li]["rows"] if not r["inside"]]
        if not rows: return 0.0
        return float(np.interp(tt, [r["tt"] for r in rows], [r["kw"] for r in rows]))

    def H_of(p):
        return float((R @ p + T)[2] - Z_GROUND)

    def add(kind, at, **kw):
        sites.append(dict(kind=kind, key=f"{tag}:{obj}:{kind}:{pkey(at)}", **kw))

    ends = defaultdict(list)                 # rounded vertex -> [(line, run end t, direction into the run)]
    for li, L in enumerate(lines):
        for a, c in L["runs"]:
            for tt, into in ((a, 1.0), (c, -1.0)):
                p = L["p0"] + tt * L["t"]
                if H_of(p) > REACH_TOP: continue
                ends[tuple(np.round(p, 4))].append((li, tt, into))
    for li, L in enumerate(lines):
        m = meas[li]
        if not m["vertical"] or L["nose"]: continue
        up = 1.0 if (R @ L["t"])[2] > 0 else -1.0          # the line's t, turned to run upward in the world
        runs = sorted(L["runs"], key=lambda r: up * r[0])
        # joints between two runs of the line: the groove. A chip there takes the block toward the knocks' peak most
        # often, and now and then the other
        for (a0, c0), (a1, c1) in zip(runs[:-1], runs[1:]):
            lo_end = c0 if up > 0 else a0                  # the lower run's upper end
            hi_start = a1 if up > 0 else c1                # the upper run's lower end
            gap = abs(hi_start - lo_end)
            if gap > JOINT_GAP: continue
            tm = 0.5 * (lo_end + hi_start)
            H = H_of(L["p0"] + tm * L["t"])
            if H > REACH_TOP: continue
            key = f"{tag}:{obj}:joint:{pkey(L['p0'] + tm * L['t'])}"
            above = (H < H_PEAK) == (draw(key, 1)[0] < TOWARD_PEAK)
            O_t = hi_start if above else lo_end
            sites.append(dict(kind="joint", key=key, line=li, t=O_t, dir=(up if above else -up), ext=0.5 * gap + 1e-4,
                              H=H, k=k_at(li, O_t), side="above" if above else "below"))
        # the ends: on the ground, on (or under) another block
        bot = runs[0][0] if up > 0 else runs[0][1]
        top = runs[-1][1] if up > 0 else runs[-1][0]
        for tt, sgn in ((bot, up), (top, -up)):             # sgn: from the end into the line, as t runs
            p = L["p0"] + tt * L["t"]
            H = H_of(p)
            if H > REACH_TOP: continue
            P = R @ p + T + PROBE * m["b"]
            downward = sgn * up > 0                         # this end is the line's bottom
            if downward and H < 0.02:
                add("foot", p, line=li, t=tt, dir=sgn, ext=EXT_FOOT, H=H, k=k_at(li, tt)); continue
            sup = probe.support(P, np.array([0.0, 0.0, -1.0 if downward else 1.0]))
            if sup is None: continue
            zs, other = sup
            if downward and zs - Z_GROUND <= STEP_TOP and other != obj:
                add("foot", p, line=li, t=tt, dir=sgn, ext=EXT_JOINT, H=H, k=k_at(li, tt))
            elif other == obj:
                continue                                    # a step of the same stone (a moulding): its corners count
            elif downward and H < H_PEAK:                   # resting on the block below: chips this block, above
                add("joint", p, line=li, t=tt, dir=sgn, ext=EXT_JOINT, H=H, k=k_at(li, tt), side="above")
            elif not downward and H >= H_PEAK:              # under the block above: chips this block, below
                add("joint", p, line=li, t=tt, dir=sgn, ext=EXT_JOINT, H=H, k=k_at(li, tt), side="below")
    # corners: three worn arrises meeting at a vertex (counted on the most upright of them)
    for key, es in ends.items():
        if len({e[0] for e in es}) < 3: continue
        es = sorted(es, key=lambda e: (-abs((R @ lines[e[0]]["t"])[2]), e[0]))[:3]
        p = np.array(key)
        axes = [unit(e[2] * lines[e[0]]["t"]) for e in es]
        if abs(np.linalg.det(np.array(axes))) < 0.3: continue
        add("corner", p, lines=[e[0] for e in es], p=p, axes=axes, H=H_of(p),
            k=float(np.mean([k_at(e[0], e[1]) for e in es])),
            lens=[min(c - a for a, c in lines[e[0]]["runs"] if a - 1e-4 <= e[1] <= c + 1e-4) for e in es])
    for s in sites:
        s["risk"] = float(s["k"] * knocks(s["H"]) * WEAK[s["kind"]] * hard)
        s["mass"] = RATE[s["kind"]] * float(smooth(R_LO, R_HI, s["risk"]))
        s["object"], s["fate"] = obj, "none"
    return sites


def stretches(obj, lines, meas, tag, hard):
    """Every worn arris that is not a nose's facet as a place of its own between its weak points: its samples within
    reach, each with its risk of a knock (a cart's wheel, a dolly, the corner of a case: where they caught it, the model
    does not carry) and its rate of chips, KNOCK_RATE x smoothstep(R_LO, R_HI, that risk) per metre."""
    out = []
    for li, L in enumerate(lines):
        if L["nose"]: continue
        rows = [r for r in meas[li]["rows"] if not r["inside"] and r["open"] >= OPEN_MIN]
        if not rows: continue
        H = np.array([r["H"] for r in rows]); kw = np.array([r["kw"] for r in rows])
        risk = kw * knocks(H) * WEAK["knock"] * hard
        dens = KNOCK_RATE * smooth(R_LO, R_HI, risk) * SAMPLE          # each sample stands for SAMPLE of the arris
        j = int(np.argmax(dens))
        out.append(dict(kind="knock", key=f"{tag}:{obj}:knock:{L['key']}", tag=tag, object=obj, line=li,
                        t=float(rows[j]["tt"]), H=float(H[j]), k=float(kw[j]), risk=float(risk[j]),
                        mass=float(dens.sum()), fate="none",
                        rows=dict(tt=np.array([r["tt"] for r in rows]), H=H, kw=kw, risk=risk, dens=dens)))
    return out


def zone_of(street, f, s):
    """The element a stretch of the pier ring belongs to: the entrance or the block corner within ZONE of it along the
    pavement (the nearest), or else its face."""
    p = street.perim(f, s)
    best, eid = ZONE, f"face:{FACADES[f].name}"
    for e in street.entrances:
        dd = street.span_dist(p, e["p0"], e["p1"])
        if dd < best: best, eid = dd, e["id"]
    for i, c in enumerate(street.cum[:-1]):
        dd = street.pdist(p, c)
        if dd < best: best, eid = dd, f"corner:{FACADES[i - 1].name}/{FACADES[i].name}"
    return eid


def allocate(elements, lines_of):
    """How many chips each element took and where. An element -- a portal, an entrance's or a block corner's stretch of
    the pier ring, the rest of a face -- takes its places' expected count (their rates summed), times its own draw
    within COUNT, rounded by one more draw; each chip falls on one of its places by their rates, a weak point or a
    stretch's sample once at most, a knock anywhere within its sample. Marks the weak points and stretches that took
    one (`fate`) and returns the knocks' places; per element, its expected and drawn counts."""
    knocks_at, counts = [], {}
    for eid in sorted(elements):
        items = [(s, j, m) for s in elements[eid] for j, m in
                 (enumerate(s["rows"]["dens"]) if s["kind"] == "knock" else [(-1, s["mass"])])]
        mass = np.array([m for _, _, m in items], np.float64)
        lam = float(mass.sum())
        if lam <= 0.0: continue
        u = draw(f"chips:{eid}", 3 + 3 * N_CAP)
        n = min(int(lam * mid(COUNT, u[0], u[1]) + u[2]), N_CAP)
        counts[eid] = (round(lam, 3), n)
        for e in range(n):
            tot = float(mass.sum())
            if tot <= 0.0: break
            j = min(int(np.searchsorted(np.cumsum(mass), u[3 + 3 * e] * tot, side="right")), len(mass) - 1)
            s, i, _ = items[j]; mass[j] = 0.0
            s["fate"] = "chip"
            if i < 0: continue
            L, rw = lines_of[(s["object"], s["tag"])][s["line"]], s["rows"]
            a, c = next(r for r in L["runs"] if r[0] - 1e-6 <= rw["tt"][i] <= r[1] + 1e-6)
            t = float(np.clip(rw["tt"][i] + (u[4 + 3 * e] - 0.5) * SAMPLE, a, c))
            knocks_at.append(dict(kind="knock", key=f"{s['key']}:{i}", tag=s["tag"], object=s["object"], line=s["line"],
                                  t=t, dir=(1.0 if u[5 + 3 * e] < 0.5 else -1.0), ext=0.0,
                                  H=float(rw["H"][i] + (t - rw["tt"][i]) * L["tz"]), k=float(rw["kw"][i]),
                                  risk=float(rw["risk"][i]), mass=float(rw["dens"][i]), fate="chip"))
    return knocks_at, counts


def choose(obj, lines, meas, places, M0):
    """The chips of one object in one instance, from the places allocate() drew: the strongest first, none within
    CHIP_SPACING of a stronger one on the object nor with its cutter against another's; each with its cutter's
    points (the object's own coordinates), its shape and what it is. A place that yields keeps why (`fate`: spaced
    out, no room)."""
    R, T = world_frame(M0)
    chosen = []

    def where(s):
        return s["p"] if s["kind"] == "corner" else lines[s["line"]]["p0"] + s["t"] * lines[s["line"]]["t"]
    for s in sorted(places, key=lambda s: (-round(s["risk"], 6), s["key"])):
        p = where(s)
        sh = chip_shape(s["key"], s["risk"], s["kind"])
        Lc, Dc, back = sh["L"], sh["D"], 0.0
        if s["kind"] == "corner":
            A = [min(0.55 * Lc, 0.8 * s["lens"][0]), min(1.3 * Dc * (1.0 + sh["asym"]), 0.8 * s["lens"][1]),
                 min(1.3 * Dc * (1.0 - sh["asym"]), 0.8 * s["lens"][2])]
            pts = corner_points(p, s["axes"], A, sh)
            mat_line = lines[s["lines"][0]]
        else:
            L = lines[s["line"]]
            if s["kind"] == "knock":                     # the scar keeps short of the ends of the run it lies on
                a, c = next(r for r in L["runs"] if r[0] - 1e-6 <= s["t"] <= r[1] + 1e-6)
                fwd, bwd = (c - s["t"], s["t"] - a) if s["dir"] > 0 else (s["t"] - a, c - s["t"])
                Lc = min(Lc, 0.8 * fwd); back = min(sh["back"] * Lc, 0.8 * bwd)
                if Lc < LEN_CLIP[0] or back < 0.4 * LEN_CLIP[0]:
                    s["fate"] = "no room"; continue
                sh = dict(sh, L=Lc)
            deeper_a = street_face(L, meas[s["line"]], R)
            DA = Dc * (1.0 + sh["asym"] if deeper_a else 1.0 - sh["asym"])
            DB = Dc * (1.0 - sh["asym"] if deeper_a else 1.0 + sh["asym"])
            pts = lens_points(p, s["dir"] * L["t"], L["uA"], L["uB"], DA, DB, sh, s["ext"], back)
            mat_line = L
        pts = np.array(pts, np.float64)
        lo, hi = pts.min(axis=0) - PAD, pts.max(axis=0) + PAD
        if any(np.linalg.norm(p - c["at"]) < CHIP_SPACING or not (np.any(hi < c["lo"]) or np.any(lo > c["hi"]))
               for c in chosen):
            s["fate"] = "spaced out"; continue
        Pw = R @ p + T
        f = int(facade_of(Pw[0], Pw[1])); F = FACADES[f]
        sw, dw, _ = F.sdz(Pw[0], Pw[1], Pw[2])
        chosen.append(dict(object=obj, kind=s["kind"], key=s["key"], at=p, H=round(s["H"], 3), risk=round(s["risk"], 4),
                           length=round(Lc + back, 4), depth=round(Dc, 4), fresh=round(sh["fresh"], 3),
                           side=s.get("side"),
                           shape=dict(q=round(sh["q"], 2), ends=(round(sh["end"][0], 2), round(sh["end"][1], 2)),
                                      facets=(sh["arc"], sh["seg"]), asym=round(sh["asym"], 2),
                                      tilt=round(sh["tilt"], 2)),
                           points=pts, lo=lo, hi=hi, fa=mat_line["fa"], b_local=unit(mat_line["nA"] + mat_line["nB"]),
                           facade=f, s=round(float(sw), 3), d=round(float(dw), 3)))
    return chosen


# ---------------------------------------------------------------------------------------------------- build
def build(ctx):
    import time, bpy
    t0 = time.time()
    blk = ctx.block
    steps = [r for r in ctx.field("street_grime", "runs") if r["kind"] == "step"]
    corners567 = ctx.field("street_grime", "corners")
    stats = instance_stats(blk)
    street = Street(blk, steps, stats, ctx.field("street_grime", "ground")["d_ring"], log=ctx.log)
    probe = Probe(blk)

    # the street-level stone: every mesh reaching below REACH_TOP that is stone, the block's own and the portal's
    targets = defaultdict(list)              # (object name, from the portal?) -> its instance records
    for i, d in enumerate(blk.inst):
        if stats["stone"][i] and stats["zlo"][i] < Z_GROUND + REACH_TOP:
            targets[(d["object"], d["instancer"] is not None)].append(d)
    stash = dict(block={}, portal={}, portal_instancers=[])
    pub_arrises, pub_chips, pub_sites = [], [], []
    n_lines = n_worn = 0
    # 1. every object's worn arrises, and per instance: the portal's use, every arris's own share of the knocks, its
    #    weak points and the stretches between them
    work = []
    for (obj, linked), recs in sorted(targets.items()):
        ob = next(o for o in bpy.data.objects if o.name == obj and ((o.library is not None) == linked))
        if ob.type != 'MESH' or ob.modifiers:
            ctx.log(f"   edge_wear {obj}: not a plain mesh, left alone"); continue
        me = ob.data
        V, ls, lt, lv, N, C, mi = mesh_arrays(me)
        lines = find_lines(V, ls, lt, lv, N, C)
        n_lines += len(lines)
        recs = sorted(recs, key=lambda r: (r["instancer"] or "", r["name"]))
        worn, meas_all = [], []
        for L in lines:
            ms = [measure(L, r["matrix"], street, probe) for r in recs]
            if any(m is None for m in ms): continue
            # an arris is worn where the instances' mean exposure reaches K_MIN; each instance then wears it its own way
            k = np.mean([[row["k"] for row in m["rows"]] for m in ms], axis=0)
            if k.max() < K_MIN: continue
            L = dict(L)
            L["tt"] = np.array([row["tt"] for row in ms[0]["rows"]])
            L["lo"] = float(L["tt"].min() - 0.5 * SAMPLE); L["hi"] = float(L["tt"].max() + 0.5 * SAMPLE)
            L["th"] = 0.0 if L["nose"] else min(math.radians(0.5 * L["turn"]), 1.2)
            L["key"] = pkey(L["p0"] + 0.5 * (L["lo"] + L["hi"]) * L["t"])        # its place, for its own draws
            L["tz"] = float((np.asarray(recs[0]["matrix"])[:3, :3] @ L["t"])[2])   # how fast it climbs, per metre
            worn.append(L); meas_all.append(ms)
        n_worn += len(worn)
        if not worn: continue
        kind = kind_of(obj)
        hard = GRANITE if kind == "step" else 1.0
        per = {}
        for ri, r in enumerate(recs):
            tag = r["instancer"] or "block"
            use = mid(USE, *draw(f"portal:{tag}", 2)) if linked else 1.0
            meas = [ms[ri] for ms in meas_all]
            lines_i = []
            for L, m in zip(worn, meas):
                u = draw(f"{tag}:{obj}:arris:{L['key']}", 2)
                wear = mid(WEAR, u[0], u[1]) * use
                for row in m["rows"]: row["kw"] = min(row["k"] * wear, K_CAP)
                kw = np.array([row["kw"] for row in m["rows"]])
                lines_i.append(dict(L, k=kw, kmax=float(kw.max()), wear=wear,
                                    exposure=float(max(row["k"] for row in m["rows"]))))
            sites = weak_points(obj, lines_i, meas, r["matrix"], probe, tag, hard)
            for s in sites: s["tag"] = tag
            per[tag] = dict(rec=r, use=use, lines=lines_i, meas=meas,
                            sites=sites + stretches(obj, lines_i, meas, tag, hard))
        work.append(dict(obj=obj, linked=linked, recs=recs, lines=lines, kind=kind, per=per, mi=mi,
                         check=(len(V), len(ls), round(float(V.sum()), 4)), use_self=components(ls, lt, lv, len(V)) > 1))
    # 2. how many chips each element took and where: each portal as a whole; the pier ring by the entrances' and the
    #    block corners' zones and the rest of each face
    elements, lines_of = defaultdict(list), {}
    for w in work:
        for tag, d in w["per"].items():
            lines_of[(w["obj"], tag)] = d["lines"]
            for s in d["sites"]:
                if w["linked"]: eid = tag
                else:
                    li = s["lines"][0] if s["kind"] == "corner" else s["line"]
                    ok = [row for row in d["meas"][li]["rows"] if not row["inside"] and row["open"] >= OPEN_MIN]
                    eid = zone_of(street, ok[0]["facade"], ok[0]["s"]) if ok else "face:?"
                s["element"] = eid
                elements[eid].append(s)
    knocks_at, counts = allocate(elements, lines_of)
    # 3. per object and instance: its chips (the strongest first, kept apart), the stash, and the debug view's sources,
    #    marks and paths in the world
    for w in work:
        obj, linked, kind, mi = w["obj"], w["linked"], w["kind"], w["mi"]
        for tag, d in w["per"].items():
            places = [s for s in d["sites"] if s["fate"] == "chip" and s["kind"] != "knock"]
            places += [k for k in knocks_at if k["object"] == obj and k["tag"] == tag]
            d["chips"] = choose(obj, d["lines"], d["meas"], places, d["rec"]["matrix"])
            for k in places:
                if k["kind"] == "knock" and k["fate"] != "chip":        # a knock that yielded: its stretch keeps why
                    st = next(s for s in d["sites"] if s["kind"] == "knock" and s["line"] == k["line"])
                    if st["fate"] == "chip": st["fate"] = k["fate"]
        insts = {tag: dict(lines=[dict(t=L["t"], p0=L["p0"], nA=L["nA"], nB=L["nB"], offA=L["offA"], offB=L["offB"],
                                       uA=L["uA"], uB=L["uB"], nose=L["nose"], th=L["th"], tt=L["tt"], k=L["k"],
                                       kmax=L["kmax"], lo=L["lo"], hi=L["hi"], turn=L["turn"]) for L in d["lines"]],
                           chips=[dict(points=c["points"], fa=c["fa"], kind=c["kind"], at=c["at"], risk=c["risk"],
                                       fresh=c["fresh"]) for c in d["chips"]],
                           mat_index=[int(mi[c["fa"]]) for c in d["chips"]])
                 for tag, d in w["per"].items()}
        entry = dict(check=w["check"], use_self=w["use_self"])
        if linked:
            stash["portal"][obj] = dict(entry, instances=insts)
            for r in w["recs"]:
                if r["instancer"] not in stash["portal_instancers"]: stash["portal_instancers"].append(r["instancer"])
        else:
            stash["block"][obj] = dict(entry, **insts["block"])
        for tag, d in w["per"].items():
            R, T = world_frame(d["rec"]["matrix"])
            for li, (L, m) in enumerate(zip(d["lines"], d["meas"])):
                ok = [row for row in m["rows"] if not row["inside"] and row["open"] >= OPEN_MIN]
                p_lo, p_hi = R @ (L["p0"] + L["lo"] * L["t"]) + T, R @ (L["p0"] + L["hi"] * L["t"]) + T
                f = ok[0]["facade"] if ok else int(facade_of(p_lo[0], p_lo[1]))
                label = line_kind(kind, m, L, f, p_lo, corners567)
                src = ctx.source(f"arris:{tag}:{obj}:{li}", "line", [p_lo + DBG_OFF * m["b"], p_hi + DBG_OFF * m["b"]],
                                 facade=f, what=label, object=obj, instance=tag, turn=round(L["turn"], 1),
                                 exposure=round(L["exposure"], 3), wear=round(L["kmax"], 3))
                ctx.mark(src, f, what="worn arris", exposure=round(L["exposure"], 3), wear=round(L["kmax"], 3))
                pub_arrises.append(dict(id=src.id, object=obj, instance=tag, kind=label, facade=f,
                                        s=round(ok[0]["s"], 3) if ok else None, d=round(ok[0]["d"], 3) if ok else None,
                                        x=round(float(p_lo[0]), 3), y=round(float(p_lo[1]), 3),
                                        z0=round(float(min(p_lo[2], p_hi[2])), 3), z1=round(float(max(p_lo[2], p_hi[2])), 3),
                                        turn=round(L["turn"], 1), nose=bool(L["nose"]), vertical=bool(m["vertical"]),
                                        exposure=round(L["exposure"], 3), draw=round(L["wear"], 3),
                                        wear=round(L["kmax"], 3),
                                        open=round(float(np.mean([row["open"] for row in ok])), 3) if ok else 0.0,
                                        street=round(float(np.mean([row["street"] for row in ok])), 3) if ok else 0.0,
                                        traffic=round(float(np.mean([row["traffic"] for row in ok])), 3) if ok else 0.0,
                                        depth=round(float(np.mean([row["depth"] for row in ok])), 3) if ok else 0.0,
                                        lead=round(float(min(row["lead"] for row in ok)), 2) if ok else 1.0,
                                        orient=round(float(np.mean([row["orient"] for row in ok])), 3) if ok else 1.0,
                                        mouth=next((row["mouth"] for row in ok if row["mouth"]), None)))
            for s in d["sites"]:
                L = d["lines"][s["lines"][0] if s["kind"] == "corner" else s["line"]]
                Pw = R @ (s["p"] if s["kind"] == "corner" else L["p0"] + s["t"] * L["t"]) + T
                Fw = FACADES[int(facade_of(Pw[0], Pw[1]))]
                sw, dw, _ = Fw.sdz(Pw[0], Pw[1], Pw[2])
                pub_sites.append(dict(key=s["key"], object=obj, instance=tag, element=s["element"], kind=s["kind"],
                                      facade=Fw.idx, s=round(float(sw), 3), d=round(float(dw), 3), z=round(float(Pw[2]), 3),
                                      H=round(s["H"], 3), risk=round(s["risk"], 4), rate=round(s["mass"], 4),
                                      fate=s["fate"]))
            for ci, c in enumerate(d["chips"]):
                Pw = R @ c["at"] + T
                bw = unit(R @ c["b_local"])
                src = ctx.source(f"chip:{tag}:{obj}:{ci}", "point", [Pw + 2.0 * DBG_OFF * bw], facade=c["facade"],
                                 what=c["kind"], object=obj, instance=tag, risk=c["risk"])
                mk = ctx.mark(src, c["facade"], what="chip", risk=c["risk"], length=c["length"], depth=c["depth"],
                              fresh=c["fresh"])
                ctx.path(mk, [Pw + 2.0 * DBG_OFF * bw, Pw + 0.025 * bw])
                Fw = FACADES[int(facade_of(Pw[0], Pw[1]))]
                sw, dw, _ = Fw.sdz(Pw[0], Pw[1], Pw[2])
                pub_chips.append(dict(id=src.id, key=c["key"], object=obj, instance=tag, kind=c["kind"], facade=Fw.idx,
                                      s=round(float(sw), 3), d=round(float(dw), 3), z=round(float(Pw[2]), 3), H=c["H"],
                                      risk=c["risk"], length=c["length"], depth=c["depth"], fresh=c["fresh"],
                                      side=c["side"], shape=c["shape"]))
            ks = [L["kmax"] for L in d["lines"]]
            ctx.log(f"   edge_wear {obj}{' (' + tag + ', use ' + format(d['use'], '.2f') + ')' if linked else ''}: "
                    f"{len(w['lines'])} convex lines, {len(d['lines'])} worn (wear {min(ks):.2f}..{max(ks):.2f}), "
                    f"{sum(1 for s in d['sites'] if s['kind'] != 'knock')} weak points, {len(d['chips'])} chips"
                    + (": " + ", ".join(f"{c['kind']} H {c['H']:.2f} risk {c['risk']:.2f} {c['length'] * 100:.1f}x"
                                        f"{c['depth'] * 100:.1f} cm fresh {c['fresh']:.2f}" for c in d["chips"])
                       if d["chips"] else ""))
    ctx.stash.update(stash)
    ctx.log("   edge_wear elements, chips expected and drawn: " + ", ".join(f"{eid} {lam:.2f} {n}"
                                                                         for eid, (lam, n) in sorted(counts.items())))
    # 567's corners, found again among the worn arrises (a check of the inventory; 567 lists a block corner once for
    # each street it fronts, this feature once)
    found = 0
    for c in corners567:
        cx, cy, _ = FACADES[c["facade"]].world(c["s"], c["d"], 0.0)
        if any(a["vertical"] and math.hypot(a["x"] - cx, a["y"] - cy) < 0.06 for a in pub_arrises): found += 1
    ctx.publish("arrises", pub_arrises)
    ctx.publish("chips", pub_chips)
    ctx.publish("sites", pub_sites)
    ctx.publish("elements", [dict(id=eid, expected=lam, drawn=n) for eid, (lam, n) in sorted(counts.items())])
    ctx.publish("entrances", [dict((k, v) for k, v in e.items()) for e in street.entrances])
    ctx.publish("profile", dict(reach_top=REACH_TOP, p_foot=P_FOOT, p_rise=P_RISE, p_hip=P_HIP, band_w=BAND_W,
                                round_r=ROUND_R, weak=dict(WEAK), granite=GRANITE, r_lo=R_LO, r_hi=R_HI,
                                rate=dict(RATE), knock_rate=KNOCK_RATE, count=COUNT, zone=ZONE, use=USE, wear=WEAR,
                                k_cap=K_CAP, note=(
        "the knocks by height H over the pavement: (p_foot + (1 - p_foot) smoothstep(0, p_rise, H)) x (1 - smoothstep("
        "p_hip, reach_top, H)); an arris's wear = min(its exposure x its own draw (`wear` bounds, x its portal's `use`), "
        "k_cap) x that; the abraded band reaches band_w x sqrt(wear) onto each face and the arris reads rounded over "
        "round_r x wear; a weak point's risk = wear x knocks x weakness (x granite on the step), its rate of chips "
        "rate[kind] x smoothstep(r_lo, r_hi, risk), and a stretch of arris knock_rate x smoothstep(r_lo, r_hi, risk of "
        "a knock) per metre; an element (a portal; on the pier ring an entrance's or a block corner's zone, within zone "
        "of it, or the rest of a face) took its rates' sum x its own draw within `count`, rounded by another, each "
        "placed by those rates, a weak point once at most")))
    by = defaultdict(int)
    for c in pub_chips: by[c["kind"]] += 1
    ctx.log(f"   edge_wear: {n_lines} convex lines on {len(targets)} stone objects, {n_worn} worn; {len(pub_arrises)} "
            f"arrises, {sum(1 for s in pub_sites if s['kind'] != 'knock')} weak points and {len(pub_chips)} chips over "
            f"all instances ({', '.join(f'{k} {v}' for k, v in sorted(by.items()))}; "
            f"{sum(lam for lam, _ in counts.values()):.1f} expected, {sum(n for _, n in counts.values())} drawn); "
            f"567's {len(corners567)} corners found among them: {found}; {probe.rays} rays, {time.time() - t0:.1f} s")


def kind_of(obj):
    for prefix, k in (("fit_piers", "pier"), ("pilaster_", "pilaster"), ("pillar_", "portal pier"),
                      ("slab_step", "step"), ("rec_base", "recess base")):
        if obj.startswith(prefix): return k
    return "stone"


def line_kind(kind, m, L, f, p, corners567):
    if L["nose"]: return kind + " nose"
    if m["horizontal"]: return kind + " ledge edge"
    if m["vertical"]:
        s, d, _ = FACADES[f].sdz(p[0], p[1], p[2])
        for c in corners567:
            if c["facade"] == f and abs(c["s"] - s) < 0.06 and abs(c["d"] - d) < 0.06: return c["kind"]
    return kind + " arris"


# ---------------------------------------------------------------------------------------------------- apply
def _chipped(obj, entry, log):
    """A copy of obj's mesh with its chips cut (one exact boolean with every chip's cutter, disjoint convex hulls) and,
    per face, how fresh the scar it belongs to is (0 off the scars). Everything temporary is removed again."""
    import bpy, bmesh
    scn = bpy.context.scene
    src = obj.data
    tmp_me = src.copy()
    tgt = bpy.data.objects.new("WEAR_tmp_edge_target", tmp_me); scn.collection.objects.link(tgt)
    bm = bmesh.new()
    boxes = []
    for ch in entry["chips"]:
        pts = np.asarray(ch["points"])
        lo, hi = pts.min(axis=0), pts.max(axis=0)
        for b0, b1 in boxes:
            assert np.any(hi < b0) or np.any(lo > b1), f"edge_wear: two chips on {obj.name} overlap"
        boxes.append((lo, hi))
        vs = [bm.verts.new(tuple(p)) for p in pts]
        bmesh.ops.convex_hull(bm, input=vs)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bm.normal_update()
    cme = bpy.data.meshes.new("WEAR_tmp_edge_cutter"); bm.to_mesh(cme); bm.free()
    scar_mat = bpy.data.materials.new("WEAR_tmp_edge_scar"); cme.materials.append(scar_mat)
    cut = bpy.data.objects.new("WEAR_tmp_edge_cutter", cme); scn.collection.objects.link(cut)
    mod = tgt.modifiers.new("chips", 'BOOLEAN')
    mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', cut
    mod.use_self, mod.material_mode = bool(entry["use_self"]), 'TRANSFER'
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tgt.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    k = next((i for i, m in enumerate(me.materials) if m == scar_mat), None)
    mi = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get("material_index", mi)
    scar = (mi == k) if k is not None else np.zeros(len(me.polygons), bool)
    fresh = np.zeros(len(me.polygons))
    # the scar faces are stone: the material of the face each chip was cut from, and that chip's freshness
    if k is not None:
        C = np.empty(len(me.polygons) * 3); me.polygons.foreach_get("center", C); C = C.reshape(-1, 3)
        for p in np.nonzero(scar)[0]:
            j = int(np.argmin([np.linalg.norm(C[p] - np.asarray(ch["at"])) for ch in entry["chips"]]))
            mi[p] = entry["mat_index"][j]; fresh[p] = entry["chips"][j]["fresh"]
        me.polygons.foreach_set("material_index", mi)
        me.materials.pop(index=k)
    for o in (tgt, cut): bpy.data.objects.remove(o)
    for m in (tmp_me, cme): bpy.data.meshes.remove(m)
    bpy.data.materials.remove(scar_mat)
    # every chip cut something
    C = np.empty(len(me.polygons) * 3); me.polygons.foreach_get("center", C); C = C.reshape(-1, 3)
    for ch in entry["chips"]:
        pts = np.asarray(ch["points"]); lo, hi = pts.min(axis=0) - 1e-4, pts.max(axis=0) + 1e-4
        n = int(np.count_nonzero(scar & np.all((C >= lo) & (C <= hi), axis=1)))
        assert n > 0, f"edge_wear: a {ch['kind']} chip on {obj.name} at {np.round(ch['at'], 3)} cut nothing"
    area = np.empty(len(me.polygons)); me.polygons.foreach_get("area", area)
    log(f"edge_wear: {obj.name} chipped: {len(entry['chips'])} chips, {int(scar.sum())} scar faces, "
        f"{area[scar].sum() * 1e4:.1f} cm2 of broken stone; {len(src.polygons)} -> {len(me.polygons)} faces")
    return me, fresh


def _fields(me, lines, fresh):
    """The shader's fields per face corner: the distance to each of up to FIELDS worn arrises (in the face's plane,
    linear over it; for a nose facet the distance to the facet's edge), that arris's wear along it, and the direction
    from it into the face (the mesh's coordinates), as long as the tangent of half the arris's turn (0 on a nose); the
    scar faces (fresh above 0) take none, only their freshness."""
    V, ls, lt, lv, N, C, mi = mesh_arrays(me)
    npoly, nl = len(ls), len(lv)
    P = V[lv]
    loop_poly = np.repeat(np.arange(npoly), lt)
    off = np.einsum("ij,ij->i", N, C)
    scar = np.asarray(fresh) > 0.0
    cand = defaultdict(list)
    for li, L in enumerate(lines):
        t, p0 = np.asarray(L["t"]), np.asarray(L["p0"])
        lo, hi = L["lo"] - 0.02, L["hi"] + 0.02
        if L["nose"]:
            rel = P - p0; a = rel @ t
            dd = np.linalg.norm(rel - np.outer(a, t), axis=1)
            for p in np.unique(loop_poly[(dd < 1e-5) & (a > lo) & (a < hi)]):
                if not scar[p]: cand[int(p)].append((0.0, -L["kmax"], li, "N"))
            continue
        for side in ("A", "B"):
            n_s, off_s, u_s = np.asarray(L["n" + side]), L["off" + side], np.asarray(L["u" + side])
            for p in np.nonzero((N @ n_s > 1.0 - 1e-4) & (np.abs(off - off_s) < 3e-4) & ~scar)[0]:
                rel = P[ls[p]:ls[p] + lt[p]] - p0
                a = rel @ t
                if a.max() < lo or a.min() > hi: continue
                dist = rel @ u_s
                if dist.min() < -1e-4 or dist.min() > W_MAX: continue
                cand[int(p)].append((float(max(dist.min(), 0.0)), -L["kmax"], li, side))
    D = np.ones((nl, 3)); K = np.zeros((nl, 3)); U = np.zeros((FIELDS, nl, 3))
    n_faces = 0
    for p, cs in cand.items():
        seen, keep = set(), []
        for c in sorted(cs):
            if c[2] in seen: continue
            seen.add(c[2]); keep.append(c)
        sl = slice(ls[p], ls[p] + lt[p])
        rel_all = P[sl]
        n_faces += 1
        for j, (_, _, li, side) in enumerate(keep[:FIELDS]):
            L = lines[li]
            t, p0 = np.asarray(L["t"]), np.asarray(L["p0"])
            rel = rel_all - p0; a = rel @ t
            if side == "N":
                D[sl, j] = np.linalg.norm(rel - np.outer(a, t), axis=1)
            else:
                u = np.asarray(L["u" + side])
                # the direction into the face, as long as the tangent of half the arris's turn: the tilt at the arris
                D[sl, j] = np.maximum(rel @ u, 0.0); U[j, sl] = u * math.tan(L["th"])
            K[sl, j] = np.interp(a, L["tt"], L["k"])
    return dict(d=D, k=K, u=U, fresh=np.asarray(fresh, np.float64)[loop_poly], faces=n_faces)


def _write_fields(actx, obj, me, f):
    obj.data = me
    actx.set_attribute(obj, f["fresh"], 'CORNER')
    for nm, arr in (("wear_edge_d", f["d"]), ("wear_edge_k", f["k"])):
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
        me.attributes.new(nm, 'FLOAT_VECTOR', 'CORNER').data.foreach_set("vector", arr.reshape(-1).tolist())
    for j in range(FIELDS):
        nm = f"wear_edge_u{j}"
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
        me.attributes.new(nm, 'FLOAT_VECTOR', 'CORNER').data.foreach_set("vector", f["u"][j].reshape(-1).tolist())


def _check(obj, entry):
    V, ls, lt, lv, N, C, mi = mesh_arrays(obj.data)
    got = (len(V), len(ls), round(float(V.sum()), 4))
    assert got == tuple(entry["check"]), f"edge_wear: {obj.name} is not the mesh the build measured ({got} vs {entry['check']})"


def _same_place(src, dst):
    # dst stands exactly where src does: the same parent and the same stored transform, copied value by value. An
    # assigned matrix_world is decomposed again, and a quarter turn (PORTAL_C, PORTAL_E) comes back an ulp off: every
    # ray then enters the portal's space a hair apart from where it did, and the portal's pieces, which touch and
    # interpenetrate, z-fight at their coplanar faces another way
    dst.parent = src.parent
    dst.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    dst.rotation_mode = src.rotation_mode
    for a in ("location", "rotation_euler", "rotation_quaternion", "scale", "delta_location", "delta_rotation_euler",
              "delta_rotation_quaternion", "delta_scale"):
        setattr(dst, a, getattr(src, a).copy())
    dst.rotation_axis_angle = tuple(src.rotation_axis_angle)


def _check_place(pairs):
    # every copy stands exactly where its original does, bit for bit: the same parent, parent inverse and basis (what
    # the render's own evaluation builds matrix_world from; a copy in a collection no scene holds is never evaluated)
    for src, dst in pairs:
        same = (src.parent == dst.parent
                and (np.array(src.matrix_parent_inverse) == np.array(dst.matrix_parent_inverse)).all()
                and (np.array(src.matrix_basis) == np.array(dst.matrix_basis)).all())
        assert same, f"edge_wear: {dst.name} does not stand exactly where {src.name} does"


def _copy_flags(src, dst):
    for a in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter",
              "visible_shadow", "hide_render"):
        setattr(dst, a, getattr(src, a))
    for i, slot in enumerate(src.material_slots):
        if slot.link == 'OBJECT':
            dst.material_slots[i].link = 'OBJECT'; dst.material_slots[i].material = slot.material


def _worn_copy(actx, o, entry, name):
    """A copy of object o carrying one instance's wear: its chips cut (or its mesh as it is), its fields written."""
    if entry["chips"]:
        me, fresh = _chipped(o, entry, actx.log)
    else:
        me, fresh = o.data.copy(), np.zeros(len(o.data.polygons))
    me.name = name
    return me, _fields(me, entry["lines"], fresh)


def apply_portal(actx):
    """In the worn portal, for each of the portal's instances: a copy of every worn stone piece carrying that
    instance's own fields and chips, and a copy of the PORTAL collection with them in place of their originals
    (WEAR_edge_PORTAL_A, ...), which the worn block instances in place of that portal while the feature is on. The
    originals are left exactly as they are."""
    import bpy
    entries = actx.stash.get("portal", {})
    portal = bpy.data.collections["PORTAL"]

    def copy_of(coll, replaced, pre, name=None):
        new = bpy.data.collections.new(name or pre + coll.name)
        new.hide_render, new.instance_offset = coll.hide_render, coll.instance_offset
        for o in coll.objects: new.objects.link(replaced.get(o.name, o))
        for ch in coll.children:
            new.children.link(copy_of(ch, replaced, pre) if any(o.name in replaced for o in ch.all_objects) else ch)
        return new
    for inst in actx.stash.get("portal_instancers", []):
        pre = PORTAL_COPY + inst + "_"
        replaced, n_chips = {}, 0
        for name, entry in sorted(entries.items()):
            o = actx.object(name)
            _check(o, entry)
            ie = dict(entry["instances"][inst], use_self=entry["use_self"])
            me, f = _worn_copy(actx, o, ie, pre + name)
            c = bpy.data.objects.new(pre + name, me)
            _same_place(o, c)
            _copy_flags(o, c)
            _write_fields(actx, c, me, f)
            replaced[name] = c; n_chips += len(ie["chips"])
        top = copy_of(portal, replaced, pre, PORTAL_COPY + inst)
        top.use_fake_user = True
        _check_place([(actx.object(name), c) for name, c in replaced.items()])
        actx.log(f"edge_wear: {top.name} instances the portal with its own copies of the {len(replaced)} worn stone "
                 f"pieces, {n_chips} chips among them")


def apply(actx):
    """In the worn block: the pier ring's chipped copy with its fields, in place of the ring while the feature is on;
    each portal instance replaced by an instance of its own worn copy of the collection, standing exactly where the
    original does; and those copies instanced a second time where no ray meets them (below)."""
    import bpy
    from .. import paths
    for name, entry in sorted(actx.stash.get("block", {}).items()):
        o = actx.object(name)
        _check(o, entry)
        me, f = _worn_copy(actx, o, entry, PORTAL_COPY + name)
        c = actx.add_object(PORTAL_COPY + name, me, replaces=name)
        _same_place(o, c)
        _copy_flags(o, c)
        _write_fields(actx, c, me, f)
        _check_place([(o, c)])
        actx.log(f"edge_wear: {c.name} replaces {name} while the feature is on: {f['faces']} faces carry the fields")
    insts = actx.stash.get("portal_instancers", [])
    if actx.stash.get("portal") and insts:
        names = [PORTAL_COPY + inst for inst in insts]
        with bpy.data.libraries.load(paths.WORN_PORTAL, link=True, relative=True) as (src, dst):
            missing = [n for n in names if n not in src.collections]
            assert not missing, f"edge_wear: the worn portal has no worn copy {missing}"
            dst.collections = list(names)
        placed = []
        for inst, coll in zip(insts, dst.collections):
            x = actx.object(inst)
            e = actx.add_object(PORTAL_COPY + inst, None, replaces=inst)
            e.instance_type, e.instance_collection = 'COLLECTION', coll
            _same_place(x, e)
            e.empty_display_size = x.empty_display_size
            e.hide_render = x.hide_render
            placed.append((x, e))
        _check_place(placed)
        # A second user of every copy, which no ray meets. Cycles bakes an object's transform into a mesh it renders only
        # once, and the portal's own pieces are each rendered three times, so they stay in the portal's space; a copy
        # rendered once would be baked into the world, its vertices rounded another way round the quarter turn, and the
        # pieces, which touch and interpenetrate at coplanar faces, would z-fight into dashes and open hairline cracks
        # there. Instanced again by this empty, TWIN_Z under the block and seen by volume scatter rays alone (there are no
        # volumes), each copy is rendered twice and stays in the portal's space too: with the feature on the portal
        # renders exactly as it does off, but for the wear
        twins = bpy.data.collections.new(PORTAL_COPY + "PORTAL_twins")
        for coll in dst.collections: twins.children.link(coll)
        t = actx.add_object(PORTAL_COPY + "PORTAL_twins", None)
        t.instance_type, t.instance_collection = 'COLLECTION', twins
        t.location = (0.0, 0.0, TWIN_Z)
        for a in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_shadow"):
            setattr(t, a, False)
        actx.log(f"edge_wear: {', '.join(insts)} each instance their own worn copy of the portal while the feature is on; "
                 f"{t.name} holds a second, unseen instance of each, {-TWIN_Z:.0f} m down")


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    col, rough, nrm = g.i("Color"), g.i("Roughness"), g.i("Normal")
    st = g.i("Strength")
    stone = g.is_class(*classes.MASONRY)
    H = g.i("H")
    knock = g.mul(g.add(P_FOOT, g.mul(1.0 - P_FOOT, g.smooth(0.0, P_RISE, H))), g.one_minus(g.smooth(P_HIP, REACH_TOP, H)))

    def attr(nm):
        return g.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name=nm).outputs['Vector']
    D, K = g.xyz(attr("wear_edge_d")), g.xyz(attr("wear_edge_k"))
    band, wmax, dmin = 0.0, 0.0, 1.0
    tilt = None
    for j in range(FIELDS):
        w = g.mul(K[j], knock)                                           # this arris's wear here
        bw = g.add(g.mul(g.pow(g.mx(w, 0.0), 0.5), BAND_W), 1e-4)
        fall = g.one_minus(g.map(D[j], 0.0, bw, interp='SMOOTHSTEP'))
        band = g.mx(band, g.mul(w, g.mul(fall, fall)))                   # most of it right at the arris
        # the rounding: within ROUND_R x wear of the arris the normal turns over the edge, by the stored tangent of half
        # the turn at the arris itself (45 degrees at a square arris), easing in as the square of the way still to go
        u = g.clamp(g.one_minus(g.div(D[j], g.add(g.mul(w, ROUND_R), 1e-5))))
        vt = g.node('ShaderNodeVectorTransform', vector_type='VECTOR', convert_from='OBJECT', convert_to='WORLD')
        g.set(vt.inputs[0], attr(f"wear_edge_u{j}"))
        tj = g.vmath('SCALE', vt.outputs[0], scale=g.mul(g.mul(u, u), -1.0))
        tilt = tj if tilt is None else g.vmath('ADD', tilt, tj)
        wmax, dmin = g.mx(wmax, w), g.mn(dmin, D[j])
    # the abraded band: lighter and paler, rougher
    amt = g.clamp(g.mul(g.mul(band, st), stone))
    y = g.lum(col)
    worn = g.scale_rgb(g.mix(col, g.rgb(y, y, y), LIGHT_DESAT, 'RGBA'), LIGHT_GAIN)
    col1 = g.mix(col, worn, amt, 'RGBA')
    rough1 = g.mix(rough, g.mx(rough, WORN_ROUGH), amt)
    # the chips' broken stone: paler, and lifted toward FRESH_L whatever the skin's own tone, as far as the scar is
    # still fresh (the Attr: 1 a recent break, less one the weather has had for years)
    fresh = g.mul(g.clamp(g.i("Attr")), stone)
    famt = g.clamp(g.mul(fresh, st))
    tint = g.rgb(g.mul(y, FRESH_TINT[0]), g.mul(y, FRESH_TINT[1]), g.mul(y, FRESH_TINT[2]))
    gain = g.clamp(g.div(FRESH_L, g.mx(y, 1e-3)), FRESH_GAIN[0], FRESH_GAIN[1])
    fcol = g.scale_rgb(g.mix(col, tint, FRESH_DESAT, 'RGBA'), gain)
    g.o("Color", g.mix(col1, fcol, famt, 'RGBA'))
    g.o("Roughness", g.mix(rough1, g.mx(rough1, FRESH_ROUGH), famt))
    # the rounding, on materials that route their normal
    g.o("Normal", g.mix(nrm, g.vmath('NORMALIZE', g.vmath('ADD', nrm, tilt)), g.mul(g.clamp(st), stone), 'VECTOR'))
    # the debug view: the nearest worn arris's band, drawn DEBUG_W wide, full from 1 / DEBUG_GAIN of wear; every chip's
    # scar in full, however fresh
    dbg = g.mul(g.clamp(g.mul(wmax, DEBUG_GAIN)), g.one_minus(g.smooth(DEBUG_W, 1.4 * DEBUG_W, dmin)))
    g.o("Debug", g.mx(g.mul(dbg, stone), g.gt(fresh, 0.0)))
