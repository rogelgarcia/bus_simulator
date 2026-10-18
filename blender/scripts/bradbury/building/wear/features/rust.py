# Rust stains from the fire escapes (AI 568): what the iron of the two fire escapes on 3rd Street does to itself and to
# the wall it is fixed into. Iron rusts where it enters masonry and where water sits on it; the water that runs off the
# ironwork carries the rust down the wall below ("stain bleeding", Chen et al. 2005, modelled from a point source), and a
# corroding fixing can burst the masonry round it (the ICOMOS-ISCS glossary's "bursting"). Every stain has a source on
# the model and a path from it; nothing here is placed by noise, and the mask and the attributes come out the same from
# one build to the next.
#
# THE IRONWORK is read from the fire escapes' own meshes. The export splits every face's corners, so the triangles are
# welded back into members (a platform, a rail, a baluster, a stringer, a tread, a rung) and paired into faces. Each
# stair stands in its window strip, and its BACK PLANE -- where the ironwork stops toward the wall -- lies 2 cm proud of
# the piers, 6 cm in front of the sills and 11 cm in front of the strip's panels: the fixings bridge that gap.
#
# THE ANCHORS are where the members that reach back to that plane are fixed into the masonry behind them: the end of each
# side top rail, and each platform's rear edge at its two ends (a plate is carried at its corners), wherever masonry
# stands straight behind within ANCHOR_REACH. Nothing else is an anchor. From each one a narrow streak runs straight down
# the masonry, the film of water followed down the elevation as runoff (AI 564) follows it, the fire escapes looked
# through: strongest at the anchor, fading as it descends, until a ledge catches it, an edge throws it off or it fades
# out; a halo round the fixing is the rust spreading in the wet masonry. The stain is a filter over the wall's own colour,
# stronger in the mortar, and its edge reaches along the bed joints, so the courses stay readable under it.
#
# THE DRIPS. Water leaves the iron at the free lower arrises of the platforms and the stair stringers and falls straight
# down: onto the platform, rail or tread below, which rusts in the drip's footprint; onto the ground floor's crown under
# the lowest platform, masonry, where the footprint is painted; or past everything onto the pavement, which belongs to the
# render scene and not to the layer.
#
# THE IRON'S OWN RUST is an attribute on its mesh. The paint fails first where water stays: at a joint, where a member
# ends against another (water is trapped in the crevice), at an end fixed into the wall (the fixing corrodes: wider
# still), along the upper arrises of the level members (water standing on a top wicks over the arris, where the paint
# film is thinnest) and along their drip edges (water hangs there), each band as wide as its face allows and widened by
# the drips that land along it. A face that faces up holds standing water and rusts a little all over. A vertical arris
# and the downhill arrises of the stringers and handrails shed their water and keep their paint, and so does a vertical
# face but for its edges. Every band is a distance to an edge, linear over the face, so it is exact at any resolution on
# the ironwork's plain boxes. The wind-driven rain each member takes (565's rain, from the street side) scales its
# arrises: the platforms under the upper ones rust less.
#
# ONE AT A TIME (the rework of 2026-09-23). The two stairs are one mesh placed twice, and every fixing, member and joint
# on them is the same shape, so the rules above stamped the same rust on each: four identical chains of streaks down the
# stairs' margins, and the same tick of rust at the head and the foot of every baluster (user 2026-09-23: marks must not
# repeat identically from one instance to the next). What makes one differ from the next on a real fire escape is what
# the model does not carry -- a fixing whose joint with the wall has held and one that has opened, a member repainted and
# one left, a crevice the paint has bridged, a plate set a few millimetres out of level -- so each fixing, member, joint
# and platform draws its own, seeded from its own name (a rebuild draws the same values, and nothing drawn for one moves
# when another changes), within bounds. A fixing lets through its own share of the water its member brings it: a sound
# one next to nothing, most about the geometry's measure, a rare failed one more. Its streak's value, e-fold and width go
# as the square root of that water, and the rust it carries, how far down it carries it, how fast the film spreads and
# the rust round the fixing itself vary on their own. The iron round a fixing rusts with the fixing; each member's paint
# scales every band on it; each joint's crevice is sealed or open; and each platform's deck falls toward one side, where
# most of its water drips off.
#
# PUBLISHED for the features that follow (569 blooms round the anchors, where water enters the wall): `anchors`,
# `streaks`, `drips`, `footprints`, `iron` and `field` (see the README's "Rust stains from the fire escapes (AI 568)").
import hashlib, math
from collections import defaultdict
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS, facade_of
from . import runoff, soiling

NAME = "rust"
AI = 568
LABEL = "rust stains from the fire escapes"
ORDER = 250
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (1.00, 0.40, 0.00)
MASK = dict(res=0.02, channels=4, bits=8)   # R the stain; G the streak's axis offset; B its half-width (a footprint's
RES = MASK["res"]                           # half-depth); A a footprint's depth. Streaks: G, B; footprints: B, A
assert RES == runoff.RES, "the streaks walk on runoff's elevation grid"

FIRE_ESCAPE = "attachment_fire_escape"

# ---------------------------------------------------------------------------------------------------- the ironwork
WELD = 1.0e-4           # corners this close are one vertex (the export splits every face's corners)
REAR_TOL = 0.005        # a member whose rear reaches this close to the back plane runs back to the wall
PLATFORM_AREA = 0.5     # a member facing up over this much area is a platform (565's rule)
JOINT_GAP = 0.05        # a member edge within this of another member is joined to it (the export leaves 1 to 4 cm gaps)
PROBE = 0.003           # the probes stand this far past an edge, in the face's plane
WEDGE = 0.5             # ... and a member counts as beyond the edge when it lies within 60 degrees of straight past it

# ---------------------------------------------------------------------------------------------------- the anchors
ANCHOR_REACH = 0.20     # the fixing bridges at most this much between the back plane and the masonry behind it
PLATE_W = 0.30          # a rear member wider than this along the face is a plate, fixed at both ends of its rear edge
ANCHOR_R = 0.08         # the ironwork round a fixing, this far from it, rusts with it

# ---------------------------------------------------------------------------------------------------- the streaks
W0 = 0.030              # a streak's width at the anchor: a narrow rivulet
SPREAD = 0.05           # it widens this much per metre of descent
HALO_W, HALO_R = 0.015, 0.04   # round the fixing it is up to HALO_W wider on each side, within HALO_R of it ...
UP = 0.02               # ... and reaches this far above it (the wet masonry round a fixing)
AMP = dict(platform=1.00, rail=0.85)        # the stain at the anchor: a platform's corner carries the deck's water
EFOLD = dict(platform=0.40, rail=0.30)      # and fades over this (e-fold, metres); LEN_CAP e-folds down it is gone
LEN_CAP = 3.0
SAME_WALL = 0.03        # a streak starts on the surface within this of the masonry behind its anchor
PAD = 2                 # texels: the axis and width channels run on this far past a stain, for the lookup's filtering
OFF_SPAN = 0.10         # G: the axis offset s_axis - s over -OFF_SPAN .. +OFF_SPAN (0 means no streak here)
HW_SPAN = 0.25          # B: a half-width over 0 .. HW_SPAN
D_LO, D_SPAN = -1.0, 2.0   # A: a footprint's depth d over D_LO .. D_LO + D_SPAN (0 means none)

# ---------------------------------------------------------------------------------------------------- the rain and drips
RAIN_THETA, RAIN_PHI = soiling.RAIN_THETA, soiling.RAIN_PHI   # 565's wind-driven rain, from the street side
WET_FLOOR = 0.40        # a member the rain never reaches still rusts this share of its full amount (dew, splash)
DRIP_STEP = 0.02        # drips are cast every this much along a drip edge ...
DRIP_INSET = 0.002      # ... from just inside the arris, where a drop hangs
DRIP_REACH = 30.0
DRIP_TOUCH = 0.004      # a drip that meets something within this below its edge is running into a joint, not falling
FP_EDGE = 0.03          # a drip landing within this of a face's edge rusts that edge's band ...
FP_NARROW = 0.08        # ... unless the face is narrower than this (a rail's top): then the whole face
FP_EDGE_REF, FP_EDGE_GAIN = 0.10, 1.5      # an edge's footprint: gain x (1 - exp(-catch per metre / ref))
FP_FACE_REF, FP_FACE_GAIN = 0.50, 0.80     # a face's footprint: gain x (1 - exp(-catch per m2 / ref))
FP_MAS_REF, FP_MAS_GAIN = 0.10, 0.85       # a masonry footprint: gain x (1 - exp(-catch per metre / ref))
SPLASH = 0.015          # a footprint on masonry reaches this far past its drips, across the drip line

# ---------------------------------------------------------------------------------------------------- the iron's bands
# per edge kind: (peak p, where it is gone Z, metres, and for an arris the share of the face across it Z may take).
# Along an edge's band the rust is smoothstep(p - d / R) with R = Z / p: full to (p - 1) R from the edge when p > 1,
# gone at Z. An arris's band is as wide as its face allows (a platform's 6 cm front loses more paint along its arris than
# a 16 mm baluster) and its peak is scaled by the rain its member takes (paint fails where it stays wet); a joint's and
# a fixing's are not (water is trapped there whatever).
INTERIOR, WALL, JOINT, TOP, DRIP, SIDE = range(6)
EDGE_NAMES = ("interior", "wall", "joint", "top", "drip", "side")
BAND = {WALL: (4.0, 0.060, None), JOINT: (3.0, 0.040, None), TOP: (1.4, 0.012, 0.20), DRIP: (1.8, 0.018, 0.25),
        SIDE: (0.0, 0.005, None)}
SLOPE = 0.35            # an arris that runs downhill (a stringer's, a handrail's) sheds its water: this share of the band
CORNER = (4.0, 0.080)   # the platform's plate round a fixing at its corner: a diamond (L1) band round the corner
A_UP = 0.45             # a face turned up holds standing water: this much rust all over it (from Nz 0.3, full at 0.9)

# ---------------------------------------------------------------------------------------------------- one at a time
# Each fixing, member, joint and platform draws its own from its own seed (the mean of two uniforms where a range is
# given: the middle likelier than the ends). 1.0 is the geometry's measure, what every one of them had before
SOUND_P = 0.40          # a fixing is sound this often: its joint with the wall holds and lets through SOUND of the water
SOUND = (0.00, 0.12)    # its member brings it ...
LEAK = (0.35, 1.50)     # ... and otherwise this much, a failed one the most
WATER_MIN = 0.06        # a fixing that lets through less than this sheds no streak at all
LOAD = (0.80, 1.15)     # the rust that water carries out of the fixing: the stain's value only
STRETCH = (0.60, 1.50)  # how far down the wall it carries it: the e-fold only
FAN = (0.60, 1.60)      # how fast the film spreads as it runs down the wall below this fixing: SPREAD x this
HALO = (0.50, 1.40)     # the rust round the fixing itself (a corroding bolt's head, its plate): k x this, never past 1
# every streak keeps its fixing's axis: the rail's end and the platform's corner below it share a column, and where their
# pads meet the mask's axis channel is combined by max, so a streak moved to one side would kink the halo under it
WALL_FLOOR = 0.40       # the iron round a fixing: its band x (WALL_FLOOR + (1 - WALL_FLOOR) k), k the fixing's (a sound
                        # fixing's crevice still holds some water)
PAINT = (0.55, 1.30)    # a member's paint (repainted, or not, a member at a time): every band on it and its rust all over
JOINT_SOUND_P = 0.40    # a joint's crevice is bridged by the paint this often: its band x JOINT_SOUND ...
JOINT_SOUND = (0.00, 0.30)
JOINT_OPEN = (0.45, 1.50)   # ... and otherwise this
FALL = (0.30, 1.20)     # a platform's deck falls toward one side: a drop's water x exp(FALL x), x from -1 on the high side
                        # to 1 on the low, the platform's catch kept

# ---------------------------------------------------------------------------------------------------- the look
FILTER = (0.58, 0.36, 0.22)   # the masonry's colour through a rust stain at full strength: a warm filter, not a paint
AMOUNT = 1.00           # at strength 1 a full stain goes this far through FILTER
JOINT_HOLD = 0.30       # the mortar joints take this much more of it (porous)
JOINT_GAMMA = 0.5       # and hold it further down: v ** JOINT_GAMMA in a joint
EDGE_SOFT = 0.25        # a streak's edge is soft over +-this share of its half-width ...
EDGE_LIP = 0.35         # ... and reaches this much further along a bed joint and the lip of brick under it
CORE = 0.35             # its edges are this much lighter than its axis
MATTE = 0.85            # a stained surface is at least this rough
RUST_DARK = (0.095, 0.040, 0.016)   # thin rust through failing black paint (linear)
RUST_LIGHT = (0.27, 0.095, 0.032)   # bare rust, an orange-brown oxide
RUST_ROUGH = 0.92
LOSS = (0.20, 0.55)     # the paint is gone where the rust passes from LOSS[0] to LOSS[1]: it holds, or it has failed
HEAVY = (0.5, 1.2)      # and the rust turns from RUST_DARK to RUST_LIGHT over this
DEBUG_GAIN = 4.0        # the debug view shows a stain at full colour from a quarter of its most


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def enc_off(x):
    return np.clip(0.5 + 0.5 * np.asarray(x, np.float64) / OFF_SPAN, 0.0, 1.0)


def enc_w(w):
    return np.clip(np.asarray(w, np.float64) / HW_SPAN, 0.0, 1.0)


def enc_d(d):
    return np.clip((np.asarray(d, np.float64) - D_LO) / D_SPAN, 0.0, 1.0)


# ---------------------------------------------------------------------------------------------------- one at a time
def draw(key, n):
    """n uniforms in 0..1 from an instance's own seed: the sha256 of its key, two bytes each, so every rebuild draws the
    same values and nothing drawn for one instance moves when another changes."""
    h = hashlib.sha256(("rust:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def either(u, p_low, low, high):
    # (value, low?): anywhere in `low` p_low of the time, else in `high`, its middle likelier (u: three uniforms)
    if u[0] < p_low: return low[0] + (low[1] - low[0]) * u[1], True
    return mid(high, u[1], u[2]), False


def fixing_draw(aid):
    """A fixing's own: the share of its member's water it lets through (1 = the geometry's measure), whether it is sound,
    the rust that water carries, how far down the wall it carries it, how fast it spreads and the rust round the fixing
    itself."""
    u = draw(aid, 11)
    leak, sound = either(u[:3], SOUND_P, SOUND, LEAK)
    return dict(leak=leak, sound=sound, load=mid(LOAD, u[3], u[4]), stretch=mid(STRETCH, u[5], u[6]),
                fan=mid(FAN, u[7], u[8]), halo=mid(HALO, u[9], u[10]))


def paint_draw(fe, m):
    # a member's paint: every band on it, and its rust all over, times this
    u = draw(f"member:{fe}:{m['i']}", 2)
    return mid(PAINT, u[0], u[1])


def joint_draw(fe, i, j):
    # a joint between members i and j (one draw for the joint, whichever member's band it is): sealed or open
    return either(draw(f"joint:{fe}:{min(i, j)}:{max(i, j)}", 3), JOINT_SOUND_P, JOINT_SOUND, JOINT_OPEN)


def fall_draw(fe, floor):
    # a platform's deck: the direction it falls toward (radians in the face's (s, d) plane) and how much
    u = draw(f"platform:{fe}:{floor}", 3)
    return 2.0 * math.pi * u[0], mid(FALL, u[1], u[2])


def k_of(water):
    # a fixing's water to its streak's scale: the square root, as a sill's length sets runoff's streaks
    return math.sqrt(max(water, 0.0))


def fix_share(a):
    # the iron round a fixing rusts with the fixing
    return WALL_FLOOR + (1.0 - WALL_FLOOR) * a["k"]


# ---------------------------------------------------------------------------------------------------- the ironwork
class Iron:
    """One fire escape: its triangles (in its mesh's loop-triangle order) welded into members and paired into faces, its
    back plane, and a BVH of its own triangles for the joint probes."""

    def __init__(self, blk, rec):
        from mathutils.bvhtree import BVHTree
        self.rec, self.name = rec, rec["object"]
        self.fe = self.name.split("__")[-1]                  # its own number, the seed of everything drawn on it
        sel = np.nonzero(blk.tri_inst == rec["i"])[0]
        self.glob = sel
        self.T = blk.T[sel]
        P = blk.V[self.T]
        self.P = P
        cr = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); ln = np.linalg.norm(cr, axis=1)
        self.N = cr / np.maximum(ln, 1e-12)[:, None]; self.A = 0.5 * ln
        c = P.reshape(-1, 3).mean(axis=0)
        self.f = int(facade_of(c[0], c[1])); F = FACADES[self.f]; self.F = F
        self.S, self.D, self.Z = F.sdz(P[..., 0], P[..., 1], P[..., 2])
        self.d_back = float(self.D.min())
        self.members = self._weld()
        self.boxes = []                                  # the axis-aligned members' boxes, for the joint probes
        for m in self.members:
            if m["inclined"]: continue
            Q = self.P[m["tris"]].reshape(-1, 3)
            self.boxes.append((m["i"], (Q.min(axis=0), Q.max(axis=0))))
        self.faces = self._pair()
        ids = np.unique(self.T); loc = {int(g): i for i, g in enumerate(ids)}
        self.bvh = BVHTree.FromPolygons(blk.V[ids].tolist(), [[loc[int(v)] for v in t] for t in self.T],
                                        all_triangles=True)

    def _weld(self):
        key = np.round(self.P.reshape(-1, 3) / WELD).astype(np.int64)
        _, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.reshape(-1, 3)
        parent = list(range(int(inv.max()) + 1))

        def root(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for a, b, c in inv.tolist():
            for x, y in ((a, b), (b, c)):
                rx, ry = root(x), root(y)
                if rx != ry: parent[max(rx, ry)] = min(rx, ry)
        comp = np.array([root(int(v)) for v in inv[:, 0]])
        groups = defaultdict(list)
        for t, cpt in enumerate(comp.tolist()): groups[cpt].append(t)
        members = []
        for tris in groups.values():
            t = np.array(tris)
            S, D, Z = self.S[t], self.D[t], self.Z[t]
            nz = self.N[t, 2]
            up = float((self.A[t] * np.clip(nz, 0.0, None) * (nz > 0.3)).sum())
            # its principal axes: an elongated member (a bar, a rail, a tread) has a long axis its ends lie across
            Q = self.P[t].reshape(-1, 3); Q = Q - Q.mean(axis=0)
            _, _, vt = np.linalg.svd(Q, full_matrices=False)
            ext = np.ptp(Q @ vt.T, axis=0)
            members.append(dict(tris=t, s0=float(S.min()), s1=float(S.max()), d0=float(D.min()), d1=float(D.max()),
                                z0=float(Z.min()), z1=float(Z.max()), up=up, axis=vt[0].copy(),
                                elongated=bool(ext[0] > 2.0 * ext[1]),
                                inclined=bool(((np.abs(nz) > 0.05) & (np.abs(nz) < 0.95)).any())))
        members.sort(key=lambda m: (round(m["z0"], 4), round(m["s0"], 4), round(m["d0"], 4), round(m["z1"], 4)))
        self.tri_member = np.full(len(self.T), -1, np.int32)
        for i, m in enumerate(members):
            m["i"] = i; self.tri_member[m["tris"]] = i
        return members

    def _pair(self):
        """Faces: the two triangles of each quad (they share an edge, a member and a plane), else lone triangles.
        Each face: its corner vertex ids in order round it, its triangles, member and normal."""
        n = len(self.T)
        edge_tris = defaultdict(list)
        for t, (a, b, c) in enumerate(self.T.tolist()):
            for x, y in ((a, b), (b, c), (c, a)):
                edge_tris[(min(x, y), max(x, y))].append(t)
        mate = [-1] * n
        for key in sorted(edge_tris):
            ts = edge_tris[key]
            if len(ts) != 2: continue
            t0, t1 = ts
            if mate[t0] >= 0 or mate[t1] >= 0: continue
            if self.tri_member[t0] != self.tri_member[t1] or float(np.dot(self.N[t0], self.N[t1])) < 0.9999: continue
            mate[t0], mate[t1] = t1, t0
        faces = []; self.tri_face = np.full(n, -1, np.int32)
        for t in range(n):
            if self.tri_face[t] >= 0: continue
            u = mate[t]
            A_ = [int(v) for v in self.T[t]]
            if u < 0:
                ids, tris = A_, [t]
            else:
                B_ = [int(v) for v in self.T[u]]; sh = set(A_) & set(B_)
                ua = next(v for v in A_ if v not in sh); ub = next(v for v in B_ if v not in sh)
                x, y = [v for v in A_ if v in sh]
                ids, tris = [ua, x, ub, y], [t, u]
            for tt in tris: self.tri_face[tt] = len(faces)
            faces.append(dict(ids=ids, tris=tris, m=int(self.tri_member[t]), n=self.N[t].copy(),
                              area=float(self.A[tris].sum())))
        return faces


def classify(iron, blk):
    """What every member is (platform, stringer, rail, other), the rear members and their anchors (with the masonry
    behind each), and every face edge's kind."""
    from mathutils import Vector
    F = iron.F
    fe_tri = np.zeros(len(blk.T), bool)
    for d in blk.inst:
        if d["object"].startswith(FIRE_ESCAPE): fe_tri[blk.tri_inst == d["i"]] = True
    ms = iron.members
    plats = [m for m in ms if m["up"] >= PLATFORM_AREA]
    for m in ms:
        across, tall = max(m["s1"] - m["s0"], m["d1"] - m["d0"]), m["z1"] - m["z0"]
        if m["up"] >= PLATFORM_AREA: m["kind"] = "platform"
        elif m["inclined"] and tall > 1.0:
            # an inclined member whose foot stands on a platform is a stringer; a handrail's foot is in the air
            foot = any(abs(m["z0"] - p["z1"]) <= JOINT_GAP and m["s1"] > p["s0"] and m["s0"] < p["s1"]
                       and m["d1"] > p["d0"] and m["d0"] < p["d1"] for p in plats)
            m["kind"] = "stringer" if foot else "handrail"
        elif m["up"] >= 0.1 and min(m["s1"] - m["s0"], m["d1"] - m["d0"]) > 0.15: m["kind"] = "tread"
        elif tall > 0.5 and across < 0.1: m["kind"] = "post"         # the balusters, posts, ladder rails
        elif across > 0.5: m["kind"] = "rail"
        else: m["kind"] = "other"                                    # the ladder's rungs
        m["rear"] = m["d0"] <= iron.d_back + REAR_TOL
        m["anchors"] = []
    # the anchors: each rear member's rear face, fixed at its centre (a rail's end) or at both ends (a plate)
    dirv = Vector((-F.n[0], -F.n[1], 0.0))
    anchors = []
    for m in ms:
        if not m["rear"]: continue
        rear = [fc for fc in iron.faces if fc["m"] == m["i"] and float(fc["n"][0] * F.n[0] + fc["n"][1] * F.n[1]) < -0.9
                and max(iron.D[t].max() for t in fc["tris"]) <= iron.d_back + REAR_TOL]
        if not rear: continue
        tt = np.concatenate([fc["tris"] for fc in rear])
        s0, s1 = float(iron.S[tt].min()), float(iron.S[tt].max())
        z0, z1 = float(iron.Z[tt].min()), float(iron.Z[tt].max())
        zc = 0.5 * (z0 + z1); h = z1 - z0
        spots = [0.5 * (s0 + s1)] if s1 - s0 <= PLATE_W else [s0 + 0.5 * h, s1 - 0.5 * h]
        for sa in spots:
            o = Vector(F.world(sa, iron.d_back + 0.002, zc)); left = ANCHOR_REACH + 0.002; hit = None
            while left > 0.0:
                loc, nor, t, dist = blk.bvh.ray_cast(o, dirv, left)
                if loc is None: break
                if not fe_tri[t]:
                    hit = (loc, t); break
                o = loc + dirv * 0.002; left -= dist + 0.002
            if hit is None or blk.tri_class[hit[1]] not in classes.MASONRY:
                continue                                 # glass or nothing behind: not fixed there
            loc, t = hit
            d_wall = F.n[0] * loc.x + F.n[1] * loc.y - F.c_n
            a = dict(member=m["i"], kind="platform" if m["kind"] == "platform" else "rail", s=sa, z=zc,
                     d_iron=iron.d_back, d_wall=float(d_wall), gap=float(iron.d_back - d_wall),
                     wall=blk.inst[blk.tri_inst[t]]["object"], wall_class=classes.NAMES[blk.tri_class[t]],
                     p=np.array(F.world(sa, iron.d_back, zc)))
            m["anchors"].append(a); anchors.append(a)
    # every face edge's kind, and what it belongs to: a joint's other member, a fixing's anchor
    P_of = {}
    for t in range(len(iron.T)):
        for k in range(3): P_of[int(iron.T[t, k])] = iron.P[t, k]
    for fc in iron.faces:
        pos = np.array([P_of[v] for v in fc["ids"]]); fc["pos"] = pos
        k = len(pos); cen = pos.mean(axis=0); n = fc["n"]; m = ms[fc["m"]]
        kinds, refs, lens, outs = [], [], [], []
        for e in range(k):
            p, q = pos[e], pos[(e + 1) % k]
            L = float(np.linalg.norm(q - p)); ev = (q - p) / max(L, 1e-12)
            o = np.cross(ev, n); o /= max(float(np.linalg.norm(o)), 1e-12)
            if float(np.dot(o, 0.5 * (p + q) - cen)) < 0.0: o = -o
            kd, ref = edge_kind(iron, m, p, q, o, n)
            kinds.append(kd); refs.append(ref); lens.append(L); outs.append(o)
        fc["kinds"], fc["refs"], fc["lens"], fc["outs"] = kinds, refs, lens, outs
    return anchors


def edge_kind(iron, m, p, q, o, n):
    """What the edge p-q of a face of member m (normal n, o pointing out of the face past the edge) is: (kind, what it
    belongs to -- the anchor of a fixing's edge, the other member of a joint's, else None)."""
    from mathutils import Vector
    pm = 0.5 * (p + q)
    # the member's own face continues past this edge in the same plane: not an edge at all
    for loc, nor, idx, dist in iron.bvh.find_nearest_range(Vector(pm + o * PROBE), 0.6 * PROBE):
        if iron.tri_member[idx] == m["i"] and abs(float(np.dot(iron.N[idx], n))) > 0.999: return INTERIOR, None
    # the member's end at the wall, round one of its fixings
    dp = [float(np.dot(x[:2], iron.F.n)) - iron.F.c_n for x in (p, q)]
    if m["rear"] and max(dp) <= iron.d_back + REAR_TOL:
        for a in m["anchors"]:
            if max(np.linalg.norm(p - a["p"]), np.linalg.norm(q - a["p"])) <= ANCHOR_R: return WALL, a
    # a joint: the member ends against another one along the whole edge -- each of three probes past it lands inside
    # another member (a rung's end in its rail, a post's top in its rail), or finds another member's surface just
    # beyond it, facing back at it (a baluster's end under its rail, a tread's end at its stringer). An edge that runs
    # along a bar's length is not an end; a member that only runs past (a stringer crossing a baluster) or alongside (a
    # baluster beside a post) is not joined to it
    ev = (q - p) / max(float(np.linalg.norm(q - p)), 1e-12)
    along = m["elongated"] and abs(float(np.dot(ev, m["axis"]))) > 0.7
    hits = 0; others = []
    for j in ((1, 2, 3) if not along else ()):
        a = p + (q - p) * (j / 4.0); Q = a + o * PROBE
        inside = [i for i, b in iron.boxes if i != m["i"] and np.all(Q >= b[0] - 0.001) and np.all(Q <= b[1] + 0.001)]
        if inside:
            hits += 1; others.append(min(inside)); continue
        best = None
        for loc, nor, idx, dist in iron.bvh.find_nearest_range(Vector(Q), JOINT_GAP):
            if iron.tri_member[idx] == m["i"]: continue
            if best is None or dist < best[0]: best = (dist, np.array(loc), idx)
        if best is None: break
        v = best[1] - a; lv = float(np.linalg.norm(v))
        if lv > 1e-9 and (float(np.dot(v, o)) < WEDGE * lv or float(np.dot(iron.N[best[2]], o)) > -0.5): break
        hits += 1; others.append(int(iron.tri_member[best[2]]))
    if hits == 3: return JOINT, min(set(others), key=lambda x: (-others.count(x), x))   # the member most probes found
    if n[2] > 0.3: return TOP, None
    if n[2] < -0.3: return DRIP, None
    if o[2] > 0.3: return TOP, None           # a vertical face's upper arris
    if o[2] < -0.3: return DRIP, None         # ... its lower arris
    return SIDE, None


# ---------------------------------------------------------------------------------------------------- the rain
def rain_open(iron, blk):
    """Per member, the share of 565's wind-driven rain (its inclinations and azimuths, from the street side, each taken
    by a surface facing up by its vertical component) that reaches the member's upper faces past everything."""
    from mathutils import Vector
    F = iron.F
    dirs = []
    for th in RAIN_THETA:
        for ph in RAIN_PHI:
            t, p = math.radians(th), math.radians(ph)
            h = math.sin(t)
            v = (h * (math.cos(p) * F.n[0] + math.sin(p) * F.t[0]), h * (math.cos(p) * F.n[1] + math.sin(p) * F.t[1]),
                 math.cos(t))
            dirs.append((Vector(v), math.cos(t)))
    for m in iron.members:
        faces = [fc for fc in iron.faces if fc["m"] == m["i"] and fc["n"][2] > 0.3]
        if not faces:                                   # no face up: its highest face stands for it
            faces = [max((fc for fc in iron.faces if fc["m"] == m["i"]), key=lambda fc: iron.Z[fc["tris"]].mean())]
        tot = acc = 0.0
        for fc in faces:
            c = iron.P[fc["tris"]].reshape(-1, 3).mean(axis=0) + fc["n"] * 0.002
            wa = fc["area"] * max(float(fc["n"][2]), 0.2)
            for v, w in dirs:
                loc, _, _, _ = blk.bvh.ray_cast(Vector(c), v, 60.0)
                acc += wa * w * (loc is None); tot += wa * w
        m["open"] = acc / max(tot, 1e-12)
        m["wet"] = WET_FLOOR + (1.0 - WET_FLOOR) * m["open"]


# ---------------------------------------------------------------------------------------------------- the drips
def drip_edges(iron, m):
    """A member's free drip edges: the edges of its faces turned down that are neither joints nor interior."""
    out = []
    for fc in iron.faces:
        if fc["m"] != m["i"] or fc["n"][2] >= -0.3: continue
        for e, kd in enumerate(fc["kinds"]):
            if kd != DRIP: continue
            k = len(fc["pos"])
            out.append((fc["pos"][e], fc["pos"][(e + 1) % k], fc["outs"][e], fc["n"]))
    return out


def chain(edges):
    """The drip edges as one polyline where they close into a loop (a platform's outline), else None."""
    key = lambda x: tuple(np.round(x / 1e-3).astype(np.int64))
    nb = defaultdict(list)
    for p, q, _, _ in edges: nb[key(p)].append(q); nb[key(q)].append(p)
    if not edges or any(len(v) != 2 for v in nb.values()): return None
    start = edges[0][0]; pts = [start]; prev = None; cur = start
    for _ in range(len(edges)):
        nxt = [x for x in nb[key(cur)] if prev is None or key(x) != key(prev)]
        if not nxt: return None
        prev, cur = cur, nxt[0]
        if key(cur) == key(start): break
        pts.append(cur)
    return pts if len(pts) >= 3 else None


def cast_drips(iron, m, edges, blk, fe_objects, fall=None):
    """Drops falling from the edges, every DRIP_STEP: where each one lands. Every drop carries its share of the rain the
    member's upper faces catch (their area facing up, times the rain it takes), spread along its drip edges, or, given
    the deck's fall (direction, strength), more of it toward the low side. Returns (hits, catch m2, drip edge length m):
    hits as dicts (kind iron | masonry | other | ground, weight m2, and where)."""
    from mathutils import Vector
    L = sum(float(np.linalg.norm(q - p)) for p, q, _, _ in edges)
    ups = [fc for fc in iron.faces if fc["m"] == m["i"] and fc["n"][2] > 0.3]
    catch = sum(fc["area"] * float(fc["n"][2]) for fc in ups) * m["wet"]
    per_m = catch / max(L, 1e-9)
    drops = []
    for p, q, o, n in edges:
        seg = float(np.linalg.norm(q - p)); k = max(1, int(math.ceil(seg / DRIP_STEP)))
        for j in range(k):
            drops.append((p + (q - p) * ((j + 0.5) / k) - o * DRIP_INSET + n * 0.001, per_m * seg / k))
    ws = np.array([w for _, w in drops])
    if fall is not None:
        # the deck falls toward one side: a drop's water x exp(g x), x its place along the fall from -1 at the high side
        # to 1 at the low, and the whole catch kept
        th, g = fall
        S, D, _ = iron.F.sdz(np.array([a[0] for a, _ in drops]), np.array([a[1] for a, _ in drops]), 0.0)
        c, s = math.cos(th), math.sin(th)
        half = 0.5 * (abs(c) * (m["s1"] - m["s0"]) + abs(s) * (m["d1"] - m["d0"]))
        x = ((S - 0.5 * (m["s0"] + m["s1"])) * c + (D - 0.5 * (m["d0"] + m["d1"])) * s) / max(half, 1e-9)
        e = np.exp(g * np.clip(x, -1.0, 1.0))
        ws = ws * e * (ws.sum() / (ws * e).sum())
    hits = []
    down = Vector((0.0, 0.0, -1.0))
    for (a, _), w in zip(drops, ws.tolist()):
        loc, nor, t, dist = blk.bvh.ray_cast(Vector(a), down, DRIP_REACH)
        if loc is None:
            hits.append(dict(kind="ground", w=w)); continue
        if dist < DRIP_TOUCH: continue
        inst = blk.inst[blk.tri_inst[t]]["object"]; cls = int(blk.tri_class[t])
        if inst in fe_objects:
            hits.append(dict(kind="iron", w=w, fe=inst, tri=int(t), p=np.array(loc)))
        elif cls in classes.MASONRY and nor.z > 0.5:
            f = int(facade_of(loc.x, loc.y)); s, d, z = FACADES[f].sdz(loc.x, loc.y, loc.z)
            hits.append(dict(kind="masonry", w=w, facade=f, s=float(s), d=float(d), z=float(z), object=inst))
        else:
            hits.append(dict(kind="other", w=w, object=inst))
    return hits, catch, L


def land_on_iron(iron, hits):
    """The drips that land on this fire escape's own faces: near an edge they widen its band, inside a face they rust it
    all over (a narrow face, a rail's top, takes them all over)."""
    for h in hits:
        t = int(np.searchsorted(iron.glob, h["tri"]))
        if t >= len(iron.glob) or iron.glob[t] != h["tri"]: continue
        fc = iron.faces[iron.tri_face[t]]
        pos = fc["pos"]; k = len(pos)
        narrow = min(fc["lens"]) < FP_NARROW
        dist = [float(np.linalg.norm(np.cross(h["p"] - pos[e], (pos[(e + 1) % k] - pos[e]) / max(fc["lens"][e], 1e-12))))
                for e in range(k)]
        e = int(np.argmin(dist))
        if not narrow and dist[e] <= FP_EDGE and fc["kinds"][e] != INTERIOR:
            fc.setdefault("fp_edge", defaultdict(float))[e] += h["w"]
        else:
            fc["fp_face"] = fc.get("fp_face", 0.0) + h["w"]


# ---------------------------------------------------------------------------------------------------- the iron's attribute
def iron_values(iron):
    """Per triangle corner: the face's rust all over (wear_rust) and its bands, six linear fields (wear_rust_e: edges 0-2,
    wear_rust_f: edge 3 and two corner diamonds round fixings). A band's field is p - d / R, d the distance to its edge
    (or the sum of the distances to a corner's two edges), which is linear over a planar face and so exact wherever the
    renderer interpolates it. Also, per face, the area the shader draws past half rust (a band is past half for (p - 0.5)
    R from its edge), for the build's account. Each member's paint scales everything on it, each joint's band takes its
    joint's own state and each fixing's band and diamond its fixing's (the draws, one at a time)."""
    n = len(iron.T)
    base = np.zeros((n, 3)); ys = np.zeros((n, 3, 6))
    ms = iron.members
    stats = defaultdict(int)
    iron.joints = {}                                     # (i, j) -> (its band x this, sealed?)
    for fc in iron.faces:
        fc["rusty"] = 0.0
        m = ms[fc["m"]]; pos = fc["pos"]; k = len(pos); nz = float(fc["n"][2])
        paint = m["paint"]
        b = A_UP * float(smooth(0.3, 0.9, nz)) * m["wet"]
        if fc.get("fp_face"):
            b += FP_FACE_GAIN * (1.0 - math.exp(-fc["fp_face"] / max(fc["area"], 1e-9) / FP_FACE_REF))
        b *= paint
        nd = float(fc["n"][0] * iron.F.n[0] + fc["n"][1] * iron.F.n[1])
        at = [a for a in m["anchors"] if np.linalg.norm(pos - a["p"], axis=1).max() <= ANCHOR_R + 0.02]
        if m["rear"] and nd < -0.9 and at:
            b = min(1.0, paint * fix_share(at[0]))       # the end of a rail at its fixing, as the fixing goes
        # the bands: per edge, p and R, and each corner's distance to each edge's line
        for e in range(4):
            if e >= k: continue
            kd = fc["kinds"][e]; stats[EDGE_NAMES[kd]] += 1
            a0, a1 = pos[e], pos[(e + 1) % k]; ev = (a1 - a0) / max(fc["lens"][e], 1e-12)
            if kd == INTERIOR: p, R = 0.0, 1.0
            else:
                p0, Z, share = BAND[kd]
                if share is not None:                    # as wide as the face across the arris allows
                    across = max(float(np.linalg.norm(np.cross(x - a0, ev))) for x in pos)
                    Z = min(Z, share * across)
                p = p0
                if kd in (TOP, DRIP, SIDE):
                    p *= m["wet"] * (SLOPE if abs(float(ev[2])) > 0.3 else 1.0)
                elif kd == JOINT:                        # sealed or open, one draw per joint
                    key = (min(m["i"], fc["refs"][e]), max(m["i"], fc["refs"][e]))
                    if key not in iron.joints: iron.joints[key] = joint_draw(iron.fe, *key)
                    p *= iron.joints[key][0]
                elif kd == WALL:                         # the iron round a fixing rusts with the fixing
                    p *= fix_share(fc["refs"][e])
                fe = fc.get("fp_edge", {}).get(e, 0.0)
                if fe > 0.0:
                    p += FP_EDGE_GAIN * (1.0 - math.exp(-fe / fc["lens"][e] / FP_EDGE_REF))
                p *= paint
                R = Z / max(p0, 1.0)
            fc["rusty"] += max(p - 0.5, 0.0) * R * fc["lens"][e]
            for t in fc["tris"]:
                for c in range(3):
                    d = float(np.linalg.norm(np.cross(iron.P[t, c] - a0, ev)))
                    ys[t, c, e] = p - d / R
        # the diamonds round the fixings at this member's corners (a platform's plate), as each fixing goes
        slot = 4
        for a in m["anchors"]:
            if slot > 5 or k < 4: break
            dc = np.linalg.norm(pos - a["p"], axis=1); ci = int(np.argmin(dc))
            if dc[ci] > ANCHOR_R: continue
            e1, e2 = (ci - 1) % k, ci                   # the two edges meeting at that corner
            p, R = CORNER[0] * fix_share(a) * paint, CORNER[1] / CORNER[0]
            fc["rusty"] += 0.5 * (max(p - 0.5, 0.0) * R) ** 2
            for t in fc["tris"]:
                for c in range(3):
                    d = 0.0
                    for e in (e1, e2):
                        a0 = pos[e]; ev = (pos[(e + 1) % k] - a0) / max(fc["lens"][e], 1e-12)
                        d += float(np.linalg.norm(np.cross(iron.P[t, c] - a0, ev)))
                    ys[t, c, slot] = p - d / R
            slot += 1
        for t in fc["tris"]: base[t, :] = b
        fc["rusty"] = fc["area"] if b > 0.5 else min(fc["rusty"], fc["area"])
    return base, ys, stats


# ---------------------------------------------------------------------------------------------------- the streaks
def paint_streak(ctx, el, mark, f, a, amp, efold, w0, spread, halo):
    """The streak below one anchor: the film followed down from it (runoff's walk, the fire escapes looked through) on
    the masonry behind it, and the halo round it: w0 wide at the fixing and widening `spread` a metre, the halo `halo`
    of the most (HALO_W wider, HALO_R round, UP above). R the stain, G the axis offset, B the half-width. Returns
    (z_stop, stop reason) on its axis."""
    F = FACADES[f]
    s_a, z_a, d_wall = a["s"], a["z"], a["d_wall"]
    hw_max = 0.5 * (w0 + spread * LEN_CAP * efold) + HALO_W * halo
    reach = hw_max + 1.5 * RES
    c_lo = runoff.col_of(f, s_a - reach) - PAD; c_hi = runoff.col_of(f, s_a + reach) + PAD
    cols = np.arange(max(c_lo, 0), min(c_hi, el.width(f) - 1) + 1)
    r_start = runoff.row_below(z_a)
    n_rows = int(math.ceil(LEN_CAP * efold / RES)) + 1
    D0, C0, _ = el.cells(f, np.full(len(cols), r_start), cols)
    first = np.isfinite(D0) & (np.abs(np.nan_to_num(D0, nan=9.0) - d_wall) <= SAME_WALL) & runoff._masonry(C0)
    last, why, _ = runoff.walk(el, f, cols, r_start, n_rows, first)
    up, h_r = UP * halo, HALO_R * halo
    n_up = int(math.ceil(2 * up / RES)) + 1
    Du, Cu, _ = el.rows(f, r_start + 1, r_start + 1 + n_up, cols)       # the halo above: the same wall only
    up_ok = np.isfinite(Du) & (np.abs(np.nan_to_num(Du, nan=9.0) - d_wall) <= SAME_WALL) & runoff._masonry(Cu)
    k_max = int(max(last.max(), 0))
    r_lo, r_hi = r_start - k_max - PAD, r_start + n_up + PAD
    rows = np.arange(r_lo, r_hi + 1)
    t = z_a - runoff.z_at(rows)                                          # the descent of each row (up is negative)
    S = runoff.s_at(f, cols)
    hw = 0.5 * (w0 + spread * np.clip(t, 0.0, None)) + HALO_W * halo * np.exp(-(t / h_r) ** 2)
    prof = np.where(t >= 0.0, runoff.along(np.clip(t, 0.0, None), efold), np.exp(-(t / up) ** 2))
    on = np.zeros((len(rows), len(cols)), bool)
    for j in range(len(cols)):
        if last[j] >= 0:
            on[(rows <= r_start) & (rows >= r_start - last[j]), j] = True
    for i in range(n_up):
        on[rows == r_start + 1 + i, :] |= up_ok[i]
    near = np.abs(S[None, :] - s_a) <= hw[:, None] + 1.5 * RES
    R = np.where(on & near, np.clip(amp * prof[:, None], 0.0, 1.0), 0.0)
    G = np.broadcast_to(enc_off(s_a - S)[None, :], R.shape)
    B = np.broadcast_to(enc_w(hw)[:, None], R.shape)
    s0 = F.s0 + cols[0] * RES + 0.25 * RES; s1 = F.s0 + (cols[-1] + 1) * RES - 0.25 * RES
    z0 = ATLAS.z0 + r_lo * RES + 0.25 * RES; z1 = ATLAS.z0 + (r_hi + 1) * RES - 0.25 * RES
    for ch, vals in ((0, R), (1, G), (2, B)):
        ctx.paint(mark, vals, s0, s1, z0, z1, channel=ch, op="max")
    j = int(np.argmin(np.abs(S - s_a)))
    if last[j] < 0 and (last >= 0).any(): j = int(np.argmax(last))
    z_stop = float(runoff.z_at(r_start - max(int(last[j]), 0))) - 0.5 * RES
    return z_stop, runoff.STOP_NAMES[int(why[j])]


def paint_footprint(ctx, mark, f, hits):
    """A drip footprint on a masonry top: per texel column, the catch that lands there (R), and the depth band the drops
    fall in (A its centre, B its half-depth); on the row the top lies in and the row above it, which its lookup blends."""
    F = FACADES[f]
    z = float(np.median([h["z"] for h in hits]))
    cols = np.array([runoff.col_of(f, h["s"]) for h in hits])
    c_lo, c_hi = int(cols.min()) - 1, int(cols.max()) + 1
    nc = c_hi - c_lo + 1
    wsum = np.zeros(nc); dlo = np.full(nc, np.inf); dhi = np.full(nc, -np.inf)
    for h, c in zip(hits, cols):
        j = c - c_lo; wsum[j] += h["w"]; dlo[j] = min(dlo[j], h["d"]); dhi[j] = max(dhi[j], h["d"])
    has = np.isfinite(dlo)
    for j in range(nc):                                  # the columns beside the footprint carry its band on
        if not has[j]:
            nb = [x for x in (j - 1, j + 1) if 0 <= x < nc and np.isfinite(dlo[x])]
            if nb: dlo[j], dhi[j] = min(dlo[x] for x in nb), max(dhi[x] for x in nb)
    ok = np.isfinite(dlo)
    R = np.where(has, FP_MAS_GAIN * (1.0 - np.exp(-wsum / RES / FP_MAS_REF)), 0.0)
    dc = np.where(ok, 0.5 * (dlo + dhi), D_LO); hd = np.where(ok, 0.5 * (dhi - dlo) + SPLASH, 0.0)
    r0 = runoff.row_below(z)
    s0 = F.s0 + c_lo * RES + 0.25 * RES; s1 = F.s0 + (c_hi + 1) * RES - 0.25 * RES
    z0 = ATLAS.z0 + r0 * RES + 0.25 * RES; z1 = ATLAS.z0 + (r0 + 2) * RES - 0.25 * RES
    for ch, vals in ((0, R), (2, np.where(ok, enc_w(hd), 0.0)), (3, np.where(ok, enc_d(dc), 0.0))):
        ctx.paint(mark, np.broadcast_to(vals[None, :], (2, nc)), s0, s1, z0, z1, channel=ch, op="max")
    return dict(facade=f, s0=round(float(runoff.s_at(f, c_lo + 1)) - 0.5 * RES, 3),
                s1=round(float(runoff.s_at(f, c_hi - 1)) + 0.5 * RES, 3), z=round(z, 3),
                d0=round(float(np.min(dlo[has])), 3), d1=round(float(np.max(dhi[has])), 3),
                amount=round(float(R.max()), 3), catch=round(float(wsum.sum()), 4), drops=len(hits))


# ---------------------------------------------------------------------------------------------------- build
def build(ctx):
    import time
    t0 = time.time()
    blk = ctx.block
    recs = sorted((r for r in blk.instances(FIRE_ESCAPE) if r["instancer"] is None), key=lambda r: r["object"])
    assert recs, "rust: no fire escapes on the model"
    fe_objects = {r["object"] for r in recs}
    irons = [Iron(blk, r) for r in recs]
    by_name = {ir.name: ir for ir in irons}
    el = runoff.Elevation(blk)
    pub = dict(anchors=[], streaks=[], drips=[], footprints=[], iron=[])
    for ir in irons:
        anchors = classify(ir, blk)
        rain_open(ir, blk)
        F = ir.F; f = ir.f; fe = ir.fe
        for m in ir.members: m["paint"] = paint_draw(fe, m)
        floors = sorted({round(m["z0"], 1) for m in ir.members if m["kind"] == "platform"})
        floor_of = lambda z: 2 + int(np.argmin([abs(z - (fz + 0.03)) for fz in floors]))
        s0, s1 = float(ir.S.min()), float(ir.S.max())
        # the anchors and their streaks (the ironwork's own paint loss is its mesh's attribute, not a mark: the debug
        # view shows it on the iron itself)
        for a in sorted(anchors, key=lambda a: (-a["z"], a["s"])):
            m = ir.members[a["member"]]
            fl = floor_of(a["z"] - (1.0 if a["kind"] == "rail" else 0.0))
            side = "W" if a["s"] < 0.5 * (s0 + s1) else "E"
            aid = f"anchor:{fe}:{fl}{side}:{a['kind']}"
            # the fixing's own: the share of its member's water it lets through, and what that water does. Its value,
            # e-fold and width go as the water's square root, and the rust round the fixing with it, never past the most
            dr = fixing_draw(aid)
            leak = dr["leak"]; k = a["k"] = k_of(leak); a["leak"] = leak
            amp = AMP[a["kind"]] * m["wet"] * k * dr["load"]; efold = EFOLD[a["kind"]] * k * dr["stretch"]
            w0 = W0 * k; spread = SPREAD * dr["fan"]; halo = min(k * dr["halo"], 1.0)
            src = ctx.source(aid, "point", [F.world(a["s"], a["d_wall"], a["z"])], facade=f, what="anchor",
                             member=a["kind"], fire_escape=ir.name, floor=fl, wall=a["wall"], leak=round(leak, 3))
            info = dict(id=aid, fire_escape=ir.name, member=m["kind"], anchor=a["kind"], floor=fl, side=side, facade=f,
                        s=round(a["s"], 3), z=round(a["z"], 3), d_iron=round(a["d_iron"], 3),
                        d_wall=round(a["d_wall"], 3), gap=round(a["gap"], 3), wall=a["wall"],
                        wall_class=a["wall_class"], rain=round(m["wet"], 3), leak=round(leak, 3), sound=dr["sound"],
                        wet=round(min(m["wet"] * leak, 1.0), 3))
            pub["anchors"].append(info)
            if leak < WATER_MIN: continue                # sound: it keeps its marker and sheds nothing
            mk = ctx.mark(src, f, what="streak")
            z_stop, stop = paint_streak(ctx, el, mk, f, a, amp, efold, w0, spread, halo)
            # the path the debug view draws is the fixing, from the iron to the wall: drawn down the streak, its tube
            # would hide a stain barely wider than itself, which the debug colour shows on its own
            ctx.path(mk, [F.world(a["s"], a["d_iron"], a["z"]), F.world(a["s"], a["d_wall"], a["z"])])
            pub["streaks"].append(dict(mark=mk.id, source=aid, facade=f, axis=round(a["s"], 3), z_top=round(a["z"], 3),
                                       z_stop=round(z_stop, 3), amp=round(amp, 3), efold=round(efold, 3),
                                       width=round(w0, 4), spread=round(spread, 4), halo=round(halo, 3), stop=stop))
        # the drips from the platforms' and the stringers' free lower edges
        for m in ir.members:
            if m["kind"] not in ("platform", "stringer"): continue
            edges = drip_edges(ir, m)
            if not edges: continue
            fl = floor_of(m["z0"])
            did = f"drip:{fe}:{m['kind']}:{fl}:{m['i']}"
            fall = fall_draw(fe, fl) if m["kind"] == "platform" else None     # a plate is never quite level
            if m["kind"] == "platform":
                # its outline, the loop its free lower edges close into (else its plan's rectangle)
                loop = chain(edges)
                pts = ([tuple(p) for p in loop] if loop is not None else
                       [F.world(m["s0"], m["d0"], m["z0"]), F.world(m["s1"], m["d0"], m["z0"]),
                        F.world(m["s1"], m["d1"], m["z0"]), F.world(m["s0"], m["d1"], m["z0"])])
                src = ctx.source(did, "area", pts, facade=f, what="drip edge", member=m["kind"])
            else:
                # a stringer: from its foot to its head along its lower edge
                lo = min((p for e in edges for p in e[:2]), key=lambda x: x[2])
                hi = max((p for e in edges for p in e[:2]), key=lambda x: x[2])
                src = ctx.source(did, "line", [tuple(lo), tuple(hi)], facade=f, what="drip edge", member=m["kind"])
            hits, catch, L = cast_drips(ir, m, edges, blk, fe_objects, fall)
            count = defaultdict(int)
            for h in hits: count[h["kind"]] += 1
            iron_hits = defaultdict(list)
            for h in hits:
                if h["kind"] == "iron": iron_hits[h["fe"]].append(h)
            for nm, hs in sorted(iron_hits.items()):
                land_on_iron(by_name[nm], hs)
                ctx.mark(src, by_name[nm].f, what="footprint on iron", onto=nm, drops=len(hs))
            mas = defaultdict(list)
            for h in hits:
                if h["kind"] == "masonry": mas[(h["facade"], round(h["z"], 2))].append(h)
            for (mf, _), hs in sorted(mas.items()):
                mk = ctx.mark(src, mf, what="footprint on masonry", onto=hs[0]["object"], drops=len(hs))
                fp = paint_footprint(ctx, mk, mf, hs)
                fp.update(mark=mk.id, source=did, onto=hs[0]["object"])
                pub["footprints"].append(fp)
            pub["drips"].append(dict(id=did, fire_escape=ir.name, member=m["kind"], floor=fl, facade=f,
                                     length=round(L, 3), catch=round(catch, 4), drops=len(hits),
                                     landed={k: count[k] for k in sorted(count)},
                                     fall=None if fall is None else dict(toward=round(math.degrees(fall[0]), 1),
                                                                         strength=round(fall[1], 3))))
    # the iron's own rust, now that every drip has landed
    stash = {}
    for ir in irons:
        base, ys, stats = iron_values(ir)
        stash[ir.name] = dict(n=len(ir.T), cen=ir.P.mean(axis=1).astype(np.float64), base=base.astype(np.float32),
                              ys=ys.astype(np.float32))
        fa = np.array([fc["area"] for fc in ir.faces]); fr = np.array([fc["rusty"] for fc in ir.faces])
        nz = np.array([fc["n"][2] for fc in ir.faces])
        share = {k: round(float(fr[sel].sum() / max(fa[sel].sum(), 1e-12)), 3)
                 for k, sel in (("up", nz > 0.3), ("vertical", np.abs(nz) <= 0.3), ("down", nz < -0.3),
                                ("all", nz > -9.0))}
        pv = np.array([m["paint"] for m in ir.members])
        pub["iron"].append(dict(object=ir.name, facade=ir.f, members=len(ir.members), faces=len(ir.faces),
                                kinds={k: sum(1 for m in ir.members if m["kind"] == k)
                                       for k in sorted({m["kind"] for m in ir.members})},
                                rear=[m["i"] for m in ir.members if m["rear"]],
                                anchors=sum(len(m["anchors"]) for m in ir.members), d_back=round(ir.d_back, 3),
                                edges=dict(stats),
                                wet=dict(min=round(min(m["wet"] for m in ir.members), 3),
                                         max=round(max(m["wet"] for m in ir.members), 3)),
                                paint=dict(min=round(float(pv.min()), 3), median=round(float(np.median(pv)), 3),
                                           max=round(float(pv.max()), 3)),
                                joints=dict(n=len(ir.joints), sealed=sum(1 for v in ir.joints.values() if v[1])),
                                rusty=share))
    ctx.stash["iron"] = stash
    cv = ctx.canvas[:, :, 0]
    H2, W2 = cv.shape[0] // 2, cv.shape[1] // 2
    field = cv[:H2 * 2, :W2 * 2].reshape(H2, 2, W2, 2).max(axis=(1, 3)).astype(np.float16)
    for k in ("anchors", "streaks", "drips", "footprints", "iron"): ctx.publish(k, pub[k])
    ctx.publish("field", dict(res=2 * RES, z0=ATLAS.z0, data=field, atlas=ATLAS.to_dict(), note=(
        "the rust stains on the masonry (0..1: the anchors' streaks and the drip footprints), max-pooled to 4 cm, rows "
        "from z0 up")))
    ctx.log(f"   rust: {len(irons)} fire escapes, {sum(len(ir.members) for ir in irons)} members, "
            f"{len(pub['anchors'])} anchors ({len(pub['streaks'])} shed a streak), {len(pub['drips'])} drip edges, "
            f"{len(pub['footprints'])} masonry footprints; {el.rays} rays for the streaks, {time.time() - t0:.1f} s")
    lk = np.array([a["leak"] for a in pub["anchors"]])
    ctx.log(f"   rust drawn: fixings sound {sum(1 for a in pub['anchors'] if a['sound'])} of {len(lk)}, leak median "
            f"{np.median(lk):.2f} ({lk.min():.2f}..{lk.max():.2f}); "
            + "; ".join(f"{it['object'][-4:]} paint {it['paint']['min']:.2f}..{it['paint']['max']:.2f}, joints sealed "
                        f"{it['joints']['sealed']} of {it['joints']['n']}" for it in pub["iron"])
            + "; platforms fall " + ", ".join(f"{d['id'].split(':')[1]}/{d['floor']} {d['fall']['toward']:.0f} deg "
                                             f"x{d['fall']['strength']:.2f}" for d in pub["drips"] if d["fall"]))
    streak_of = {s["source"]: s for s in pub["streaks"]}
    for a in pub["anchors"]:
        s = streak_of.get(a["id"])
        ctx.log(f"   rust {a['id']:<34} s {a['s']:7.3f} z {a['z']:6.3f}: wall {a['wall']} ({a['wall_class']}) "
                f"{a['gap']:.3f} behind, rain {a['rain']:.2f}, leak {a['leak']:.2f}{' (sound)' if a['sound'] else ''}; "
                + (f"stain {s['amp']:.2f}, {s['width'] * 100:.1f} cm wide, widening {s['spread'] * 100:.1f} cm a "
                   f"metre, halo {s['halo']:.2f}, e-fold {s['efold']:.2f}, runs {s['z_top'] - s['z_stop']:.2f} m "
                   f"({s['stop']})" if s else "no streak"))
    for d in pub["drips"]:
        ctx.log(f"   rust {d['id']:<34} {d['length']:6.2f} m of drip edge, catch {d['catch']:.3f} m2: "
                + ", ".join(f"{k} {v}" for k, v in d["landed"].items()))
    for it in pub["iron"]:
        ctx.log(f"   rust {it['object']}: {it['members']} members {it['kinds']}, anchors {it['anchors']}, edges "
                f"{it['edges']}, rain {it['wet']['min']:.2f}..{it['wet']['max']:.2f}; rusty past half: "
                + ", ".join(f"{k} {v * 100:.1f}%" for k, v in it["rusty"].items()) + " of the area")


# ---------------------------------------------------------------------------------------------------- apply
def apply(actx):
    """The iron's rust as attributes on the fire escapes' meshes in the worn block: wear_rust (the Attr the shader reads,
    a face's rust all over) and the bands' linear fields wear_rust_e and wear_rust_f, per face corner."""
    for name, st in sorted(actx.stash["iron"].items()):
        o = actx.object(name)
        me = actx.own_mesh(o)
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        assert n == st["n"], f"rust: {name} has {n} triangles, the build measured {st['n']}"
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
        M = np.array(o.matrix_world)
        W = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        tv = np.empty(n * 3, np.int64); me.loop_triangles.foreach_get("vertices", tv)
        cen = W[tv.reshape(-1, 3)].mean(axis=1)
        assert np.abs(cen - st["cen"]).max() < 1e-4, f"rust: {name}'s triangles are not the ones the build measured"
        loops = np.empty(n * 3, np.int64); me.loop_triangles.foreach_get("loops", loops)
        nl = len(me.loops)
        base = np.zeros(nl); base[loops] = st["base"].reshape(-1)
        actx.set_attribute(o, base, 'CORNER')
        for nm, sl in (("wear_rust_e", slice(0, 3)), ("wear_rust_f", slice(3, 6))):
            v = np.zeros((nl, 3)); v[loops] = st["ys"][:, :, sl].reshape(-1, 3)
            if nm in me.attributes: me.attributes.remove(me.attributes[nm])
            a = me.attributes.new(nm, 'FLOAT_VECTOR', 'CORNER')
            a.data.foreach_set("vector", v.reshape(-1).tolist())
        actx.log(f"rust: {name} carries its rust on {n} triangles")


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    R, Gc, Bc = g.sep(g.i("Mask"))
    Ac = g.i("Mask Alpha")
    col, rough = g.i("Color"), g.i("Roughness")
    # ---- the masonry: a streak on the wall, a footprint on a top
    masonry = g.is_class(*classes.MASONRY)
    hold = g.clamp(g.mx(g.i("Joint"), g.i("Bed")))
    delta = g.absf(g.mul(g.sub(Gc, 0.5), 2.0 * OFF_SPAN))           # |s_axis - s|, exact between texels
    hw = g.mul(Bc, HW_SPAN)
    hwe = g.mul(hw, g.add(1.0, g.mul(hold, EDGE_LIP)))               # further along a bed joint and its lip
    lat = g.one_minus(g.smooth(g.mul(hwe, 1.0 - EDGE_SOFT), g.mul(hwe, 1.0 + EDGE_SOFT), delta))
    core = g.one_minus(g.mul(g.pow(g.clamp(g.div(delta, g.mx(hwe, 1e-4))), 2.0), CORE))
    v = g.mix(R, g.pow(g.mx(R, 0.0), JOINT_GAMMA), hold)             # the joints hold it further down
    wall = g.mul(g.mul(v, g.mul(lat, core)), g.facing())
    dc = g.add(g.mul(Ac, D_SPAN), D_LO)
    fp = g.mul(g.mul(R, g.one_minus(g.smooth(hw, g.add(hw, 0.01), g.absf(g.sub(g.i("D"), dc))))), g.upward())
    stain = g.mul(g.mx(wall, fp), masonry)
    amt = g.clamp(g.mul(g.mul(stain, g.add(1.0, g.mul(g.clamp(g.i("Joint")), JOINT_HOLD))),
                        g.mul(g.i("Strength"), AMOUNT)))
    filt = g.mix(col, g.mix(col, g.rgb(*FILTER), 1.0, 'RGBA', 'MULTIPLY'), amt, 'RGBA')
    rough1 = g.mix(rough, g.mx(rough, MATTE), amt)
    # ---- the iron: its paint lost at its edges, joints and fixings, over its tops and in the drips' footprints
    metal = g.is_class(classes.METAL)
    ae = g.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name="wear_rust_e")
    af = g.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name="wear_rust_f")
    st = g.i("Strength")
    r = g.mul(g.i("Attr"), st)
    for vec in (ae.outputs['Vector'], af.outputs['Vector']):
        for y in g.xyz(vec):
            r = g.mx(r, g.smooth(0.0, 1.0, g.mul(y, st)))          # the strength widens the bands
    r = g.mul(r, metal)
    loss = g.smooth(LOSS[0], LOSS[1], r)
    rust = g.mix(g.rgb(*RUST_DARK), g.rgb(*RUST_LIGHT), g.smooth(HEAVY[0], HEAVY[1], r), 'RGBA')
    g.o("Color", g.mix(filt, rust, loss, 'RGBA'))
    g.o("Roughness", g.mix(rough1, RUST_ROUGH, loss))
    g.o("Metallic", g.mix(g.i("Metallic"), 0.0, loss))                 # rust is an oxide, not a metal
    # the debug view: where a stain lies (from a quarter of its most) and where the paint is going
    ri = g.i("Attr")
    for vec in (ae.outputs['Vector'], af.outputs['Vector']):
        for y in g.xyz(vec):
            ri = g.mx(ri, g.smooth(0.0, 1.0, y))
    g.o("Debug", g.mx(g.clamp(g.mul(stain, DEBUG_GAIN)), g.mul(g.smooth(0.05, 0.5, ri), metal)))
