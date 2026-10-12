# Hand-set lines (AI 610, the sixth and last step of the weathering-realism group AI 605-610). Every long line of the
# block's trim ran ruler-straight for 50 m, which only a computer draws; a facade of 1893 was set by hand, block by block,
# and has settled since, so its long lines undulate a little. The owner, on the suggested weathered top floor
# (2026-10-10): "the lines are not straight, they are like 'waves' not perfectly flat (on the edges)". A texture cannot
# do it (the waves show in the silhouettes and at grazing angles), so -- the owner's choice, "lets use geometry copies"
# -- every long run of trim gets a worn copy with the waves in its geometry, switched with the original at render time.
#
# THE PIECES are AI 607's: blocks of BLOCK_L along each facade on the courses (the same joints, so a block's tone and its
# set go together), three blocks to a sill. The members of one course move together, as one hand-set block -- the
# crown (its members, frieze and dentils), the band between floors 4 and 5 (its mouldings, field, dentils and the
# brackets under it), the impost course -- each course its own seeds; each sill on its own.
#
# THE SET of a block, drawn from its own seed (sha256 of "hand_set:" and the course, the facade and the block): it has
# settled by up to SETTLE, one end a little lower than the other by up to ROLL, its nose dropped by up to PITCH about
# the wall line (the back stays against the wall), and turned in plan by up to YAW, the back again held at the wall.
# Over the whole course a slow settlement, three long waves of unrelated lengths and seeded phases, up to WAVE. Every
# movement is downward or about the wall, so no gap opens above a course or behind it. Between two blocks the set
# blends over JOINT_T, so the line has no kinks or gaps; within CORNER of a facade's end it fades out, the corner
# blocks staying where the corners anchor them. A sill moves only in front of the wall (its back stays under the
# window frame).
#
# THE GEOMETRY: the runs carry vertices only at their ends, so each copy first has its long horizontal edges cut every
# STEP; then every vertex moves by the field at its place (its facade, its distance along it and out of it). The copies
# are this feature's own objects (WEAR_hand_<object>), the originals kept and switched: shown while the feature and
# the group switch are on. A piece AI 609 also chipped exists in the four combinations (original, chipped, uneven,
# chipped and uneven: controls.COMBO).
#
# CONTROLS: the strength wear_hand_set (0 or the group switch off: the originals, the straight lines before AI 610
# exactly). The amplitude and the seeds are build parameters (a wear-layer rebuild).
import hashlib, math, re
import numpy as np
from ..geometry import FACADES, facade_of
from .piece_tone import BLOCK_L

NAME = "hand_set"
AI = 610
LABEL = "hand-set uneven lines"
ORDER = 400                       # its apply runs after every other feature has tagged the originals it copies
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.35, 0.95, 0.35)

GROUPS = (("crown", r"^ge_crown_"), ("band", r"^(ge_cornice45_|ge_teeth45|ge_band45|ge_bracket45)"),
          ("impost", r"^impost_course"))
STEP = BLOCK_L / 6.0              # long edges cut this often
LONG = 1.5 * STEP                 # an edge this long or longer, and level, is cut

SETTLE = 0.003                    # a block's settlement, 0 .. this
ROLL = 0.0025                     # one end lower than the other by 0 .. this
PITCH = 0.006                     # its nose dropped about the wall line, 0 .. this (radians)
YAW = 0.004                       # turned in plan, either way (radians), its back held at the wall
WAVE = 0.004                      # the course's slow settlement, 0 .. this
WAVES = (3.7, 7.3, 11.9)          # its waves' lengths (m), each x a draw in WAVE_STRETCH
WAVE_STRETCH = (0.85, 1.20)
JOINT_T = 0.08                    # two blocks' sets blend over this across their joint
CORNER = 0.6                      # within this of a facade's end the set fades out
PROJ = 0.30                       # the part of a piece in front of the wall moves fully this far out of it
SILL = dict(ROLL=0.0015, PITCH=0.010, YAW=0.003, PROJ=0.05)   # a sill is ~5 cm deep: its own ramp out of the wall


def draw(key, n):
    out, i = [], 0
    while len(out) < n:
        h = hashlib.sha256(("hand_set:" + key + (f"#{i}" if i else "")).encode()).digest()
        out += [int.from_bytes(h[2 * j:2 * j + 2], "big") / 65535.0 for j in range(16)]
        i += 1
    return out[:n]


def build(ctx):
    ctx.log(f"   hand_set: blocks of {BLOCK_L} m (AI 607's), settle {SETTLE * 1000:g} mm, roll {ROLL * 1000:g} mm, pitch "
            f"{PITCH:g} rad, yaw {YAW:g} rad, waves {WAVE * 1000:g} mm; copies made in apply()")


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _subdivide(me, M):
    """Cut the mesh's long level edges every STEP (in place), and triangulate the faces that became n-gons."""
    import bmesh
    R = np.array(M.to_3x3())
    bm = bmesh.new(); bm.from_mesh(me)
    groups = {}
    for e in bm.edges:
        v = R @ np.array(e.verts[1].co - e.verts[0].co)
        L = float(np.linalg.norm(v))
        if L < LONG or abs(v[2]) > 1e-3 * L: continue
        groups.setdefault(int(math.ceil(L / STEP)) - 1, []).append(e)
    for cuts, es in groups.items():
        bmesh.ops.subdivide_edges(bm, edges=es, cuts=cuts, use_grid_fill=False)
    big = [f for f in bm.faces if len(f.verts) > 4]
    if big: bmesh.ops.triangulate(bm, faces=big, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(me); bm.free()


class Course:
    """The set of one course: per facade its wall line and its blocks' draws."""
    def __init__(self, key, sill=None):
        self.key, self.sill, self.d_wall, self.blocks, self.waves = key, sill, {}, {}, {}

    def block(self, f, k):
        kk = (f, k)
        if kk not in self.blocks:
            u = draw(f"{self.key}:{FACADES[f].name}:{k}", 6)
            if self.sill:
                self.blocks[kk] = (0.0, SILL["ROLL"] * u[1], u[2] < 0.5, SILL["PITCH"] * u[3], SILL["YAW"] * (2 * u[4] - 1))
            else:
                self.blocks[kk] = (SETTLE * u[0], ROLL * u[1], u[2] < 0.5, PITCH * u[3], YAW * (2 * u[4] - 1))
        return self.blocks[kk]

    def wave(self, f, s):
        if self.sill: return np.zeros_like(s)
        if f not in self.waves:
            u = draw(f"{self.key}:{FACADES[f].name}:waves", 2 * len(WAVES))
            self.waves[f] = [(lam * (WAVE_STRETCH[0] + (WAVE_STRETCH[1] - WAVE_STRETCH[0]) * u[2 * i]), 2 * math.pi * u[2 * i + 1])
                             for i, lam in enumerate(WAVES)]
        acc = sum(np.sin(2 * np.pi * s / lam + ph) for lam, ph in self.waves[f]) / len(WAVES)
        return WAVE * (0.5 + 0.5 * acc)


def _field(course, P, f, origin, BL):
    """The displacement (n, 3) of world points P (n, 3) on facade f, blocks of BL from `origin` along it."""
    F = FACADES[f]
    s, d, _ = F.sdz(P[:, 0], P[:, 1], P[:, 2])
    s = np.asarray(s, float); d = np.asarray(d, float)
    r = s - origin
    k0 = np.floor(r / BL).astype(int)
    frac = r / BL - k0
    w_d = np.clip((d - course.d_wall[f]) / (SILL["PROJ"] if course.sill else PROJ), 0.0, 1.0)

    def block_val(k, rr):
        out_z, out_n = np.zeros(len(rr)), np.zeros(len(rr))
        for kk in np.unique(k):
            m = k == kk
            settle, roll, side, pitch, yaw = course.block(f, int(kk))
            t = (rr[m] - kk * BL) / BL
            z = -(settle + roll * (t if side else 1.0 - t)) - pitch * np.clip(d[m] - course.d_wall[f], 0.0, None)
            if course.sill: z = z * w_d[m]
            out_z[m] = z; out_n[m] = yaw * (rr[m] - (kk + 0.5) * BL) * w_d[m]
        return out_z, out_n
    z0, n0 = block_val(k0, r)
    lo = frac < 0.5
    kn = np.where(lo, k0 - 1, k0 + 1)
    z1, n1 = block_val(kn, r)
    j = np.where(lo, k0, k0 + 1) * BL
    w = _smooth(j - JOINT_T / 2, j + JOINT_T / 2, r)
    # w is the share of the block after the joint: before it k0 - 1 (lo) or k0, after it k0 or k0 + 1
    zz = np.where(lo, z1 * (1 - w) + z0 * w, z0 * (1 - w) + z1 * w)
    nn = np.where(lo, n1 * (1 - w) + n0 * w, n0 * (1 - w) + n1 * w)
    zz = zz - course.wave(f, s) * (1.0 if not course.sill else 0.0)
    fade = np.ones(len(s)) if course.sill else _smooth(0.0, CORNER, np.minimum(s, F.L - s))
    nvec = np.array([F.n[0], F.n[1], 0.0])
    return (np.outer(nn, nvec) + np.outer(zz, [0.0, 0.0, 1.0])) * fade[:, None]


def _world(o, me=None):
    me = me or o.data
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    M = np.array(o.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3], M


def _facades(P):
    return np.array([facade_of(float(x), float(y)) for x, y in P[:, :2]])


def _displace(course, o, me, sill_frame=None):
    """Move the vertices of mesh `me` (placed by object o's matrix) by the course's field."""
    P, M = _world(o, me)
    fs = _facades(P) if sill_frame is None else np.full(len(P), sill_frame[0])
    D = np.zeros_like(P)
    for f in np.unique(fs):
        m = fs == f
        origin, BL = (0.0, BLOCK_L) if sill_frame is None else (sill_frame[1], sill_frame[2])
        D[m] = _field(course, P[m], int(f), origin, BL)
    Q = P + D
    loc = (Q - M[:3, 3]) @ np.linalg.inv(M[:3, :3]).T
    me.vertices.foreach_set("co", loc.ravel())
    me.update()
    return float(np.abs(D).max()) if len(D) else 0.0


def apply(actx):
    import bpy
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.library is None and not o.name.startswith("WEAR_")]
    courses, members = {}, {}
    for o in objs:
        for g, rx in GROUPS:
            if re.match(rx, o.name): members.setdefault(g, []).append(o); break
    for g, os_ in members.items():
        c = Course(g); courses[g] = c
        for o in os_:                                        # the wall line: per facade the course's innermost d
            P, _ = _world(o)
            fs = _facades(P)
            for f in np.unique(fs):
                s, d, _ = FACADES[int(f)].sdz(P[fs == f, 0], P[fs == f, 1], P[fs == f, 2])
                c.d_wall[int(f)] = min(c.d_wall.get(int(f), 1e9), float(np.min(d)))
    jobs = [(o, courses[g], None) for g, os_ in members.items() for o in os_]
    for o in objs:
        if not o.name.startswith("sill_"): continue
        P, _ = _world(o)
        cx, cy = float(P[:, 0].mean()), float(P[:, 1].mean())
        f = facade_of(cx, cy); F = FACADES[f]
        s, d, _ = F.sdz(P[:, 0], P[:, 1], P[:, 2])
        c = Course("sill:" + o.name, sill=True); c.d_wall[f] = float(np.min(d))
        jobs.append((o, c, (f, float(np.min(s)), (float(np.max(s)) - float(np.min(s))) / 3.0)))
    n_u = n_cu = 0; d_max = 0.0; n_vert = 0
    for o, course, sf in jobs:
        chipped = bpy.data.objects.get("WEAR_upper_" + o.name)
        variants = [(o, "WEAR_hand_" + o.name)] + ([(chipped, "WEAR_hand_" + chipped.name)] if chipped else [])
        made = []
        for src, name in variants:
            me = src.data.copy(); me.name = name
            _subdivide(me, src.matrix_world)
            d_max = max(d_max, _displace(course, src, me, sf)); n_vert += len(me.vertices)
            nm = "wear_" + NAME
            if nm in me.attributes: me.attributes.remove(me.attributes[nm])
            c = actx.add_object(name, me, replaces=None if chipped else o.name)
            c.matrix_world = src.matrix_world.copy()
            from .edge_wear import _copy_flags
            _copy_flags(src, c)
            made.append(c)
        if chipped:
            o["wear_combo"] = "upper_chips=0,hand_set=0"; chipped["wear_combo"] = "upper_chips=1,hand_set=0"
            made[0]["wear_combo"] = "upper_chips=0,hand_set=1"; made[1]["wear_combo"] = "upper_chips=1,hand_set=1"
            n_cu += 1
        n_u += 1
    actx.log(f"   hand_set: {n_u} pieces copied uneven ({n_cu} of them also chipped: four combinations), {n_vert} vertices, "
             f"the largest movement {d_max * 1000:.1f} mm; courses: " + ", ".join(f"{g} {len(v)}" for g, v in members.items()))


def shader(g):
    g.o("Debug", 0.0)
