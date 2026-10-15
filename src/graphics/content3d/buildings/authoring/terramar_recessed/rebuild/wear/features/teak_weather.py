# teak_weather -- outdoor teak weathering at its EDGES and ENDS (the wear module, 2026-10-14; reworked to edges only
# after the user's review rejected whole-surface wear: "if the wear or dirt is applied over an entire surface, instead
# of edges, or forming a pattern, then it has no value". The first version greyed whole tops: gone).
#
# Oiled teak left outdoors does not grey all over at once: the oil goes first where the wood is thin and the water gets
# in, so the ARRISES (the corners of slats, rails, legs and arms) and the END GRAIN turn a silvery grey with raised,
# rough fibres while the board faces keep their warm oiled colour; the FEET of legs darken where they stand in water and
# dirt; the narrow GAPS between slats collect grime. Every mark here is one of those four, read from the geometry; no
# noise, no whole faces (but the small end-grain faces themselves):
#   arris band  per face corner, the in-plane distance to the face's arris edges, packed in two pairs of opposite edges
#               so a pixel gets min(distance) exactly across a planar face (the attributes interpolate linearly, and a
#               distance to a fixed line is linear over the face):
#                 teak_ea, teak_eb  (CORNER) a per pair      teak_ha, teak_hb  (FACE) h per pair
#                 distance = min(ha - |ea|, hb - |eb|)
#               both edges of a pair arrises: a = (d0 - d2) / 2, h = the mean of (d0 + d2) / 2 (a tent: min(d0, d2));
#               one: a = H - d, h = H (H > every d); none: a = 0, h = BIG. A quad pairs its opposite edges (0, 2) and
#               (1, 3); a triangle takes its two longest arris edges one-sided; an n-gon two pairs of long, roughly
#               opposite arris edges (a rounded-rectangle top), or none when its edges are short facets of a round top
#               (its eased edge ring of quads carries the band). An edge is an arris where the surface turns CONVEX
#               sharply: at least ARRIS_DEG, or a curvature of ARRIS_RATE degrees per mm across the narrower face (the
#               facets of a rounded corner); a round leg or pole (22.5 deg facets 10 mm wide) has none. An edge toward
#               an end-grain face counts END_REACH times nearer, so the ends of slats and rails grey further back.
#               End grain: a face whose normal runs along the grain of its neighbours (the furniture modules lay the UV
#               U along each member: the grain), i.e. the cut ends of slats, rails, legs and posts, carries ha =
#               END_FLAG (all band, its own darker grey). |teak_ha| > 0 is the feature's presence flag (absent reads 0).
#   teak_end1, teak_end2  (POINT) the distances to the planes of the member's two end-grain faces (a member: a loose
#               island of wood faces); the band runs wider (END_WIDTH) and stronger (MID_SHARE .. 1) within a seeded
#               END_ZONE of an end, where the water wicks in, so a long arris fades toward its middle instead of
#               outlining the piece evenly
#   teak_foot   (POINT) the height (m) over the floor the piece stands on: a movable piece's own lowest point (its feet
#               are cut flat on the floor), a fixed piece's walking surface (context.WearContext.walking_level)
#   teak_gap    (FACE) how closely a face looks at another wood face of its own piece: rays along its normal from five
#               points on it, smooth from GAP_MAX (nothing) to GAP_MIN (full); the sides of slats along an open joint
#   teak_open   (FACE) the share of the sky in front of the face that escapes (kept from the first version): the band
#               silvers by OPEN of it, so top arrises most, open sides less, sheltered ones (under a seat, the umbrella
#               ribs under the canvas) not at all. Movable pieces are sheltered by themselves only (object space, shared
#               meshes keep one value set), fixed wood by the part's ray scene.
# Per instance: the object seed (when the piece was last oiled: PIECE) and the panel signal (a seeded value per loose
# island: a slat, a rail, a leg) shuffled by it, so the eight linked dining chairs never repeat a board; each board
# draws its own band amount (BOARD_AMP), band width (BOARD_WIDTH), end zone and foot height.
# The look at strength 1 on an average board, at an open arris near an end: toward SILVER (its own luminance lifted by
# LIFT, faintly warm) by AMP_SILVER, roughness +ROUGH_SILVER; end grain toward a darker grey (END_LIFT) and rougher; the
# feet FOOT_TONE darker over FOOT_H; a slat gap's sides GAP_TONE darker. Interiors never weather: the interiors part
# gets no pass, and the layer's tm_wear_exposed flag (absent on RB_INTERIOR objects) keeps a shared TM_RB_furn_teak warm
# indoors.
import math

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from .. import classes, context, signals

NAME = "teak_weather"
LABEL = "outdoor teak silvers at its arrises and end grain, its feet darken, its slat gaps hold grime; faces stay warm"
ORDER = 20
CLASSES = ("furn_teak", "cafe_wood", "wood_ext")
SIGNALS = ("panel",)
ATTRIBUTES = {"teak_ea": 0.02, "teak_eb": 0.02, "teak_ha": 0.02, "teak_hb": 0.02, "teak_end1": 0.3, "teak_end2": 0.3,
              "teak_foot": 0.1, "teak_gap": 1.0, "teak_open": 1.0}
DEBUG_RGB = (0.30, 0.80, 0.20)            # green (debug colours are distinct across the features)
DEFAULT_STRENGTH = 1.0

GRAIN_CLASSES = ("furn_teak", "cafe_wood")  # their UV U runs along each member (the grain); wood_ext is box-mapped
AMP_SILVER = {"furn_teak": 0.78, "cafe_wood": 0.42, "wood_ext": 0.45}   # the silver mix at the arris, k = 1
AMP_FOOT = {"furn_teak": 0.55, "cafe_wood": 0.50, "wood_ext": 0.35}
AMP_GAP = {"furn_teak": 0.50, "cafe_wood": 0.35, "wood_ext": 0.35}
SILVER = (1.05, 1.0, 0.90)     # the greyed wood's tint, times its own luminance
LIFT = 1.60                    # a weathered arris reads lighter than the oiled face
END_LIFT = 1.05                # end grain greys darker (it drinks the water and the dirt)
ROUGH_SILVER = 0.24            # roughness added at a full arris (the oil gone, the fibres raised)
ROUGH_END = 0.30
FOOT_TONE = (0.52, 0.50, 0.47)  # the feet: water-dark and dirty, a little greyer
FOOT_H = 0.035                 # m over the floor, around which the foot fades (per board 0.6-1.4 x)
GAP_TONE = (0.60, 0.58, 0.55)
BAND = 0.005                   # m: the arris band's reach onto a face (per board BOARD_WIDTH x, END_WIDTH x)
END_REACH = 2.5                # an edge toward end grain counts this much nearer: the ends grey further back
END_ZONE = (0.08, 0.24)        # m from a member's end within which its arrises grey wider and more (per board)
END_WIDTH = (0.6, 1.35)        # the band's width x this, mid-member .. at the end
MID_SHARE = 0.40               # the band's amount mid-member, against 1 at the ends
OPEN = (0.05, 0.6)             # teak_open -> the silvering: tops fully, open sides most, sheltered faces none
PIECE = (0.6, 1.2)             # per piece (object seed): oiled recently .. a while ago
BOARD_AMP = (0.5, 1.3)         # per board
BOARD_WIDTH = (0.7, 1.3)
END_FLAG = -1.0                # teak_ha on end-grain faces
FAR = 1.0                      # teak_end1 / 2 with no end plane
ARRIS_DEG = 40.0               # a convex edge this sharp is an arris
ARRIS_MIN_DEG = 8.0
ARRIS_RATE = 4.0               # deg per mm across the narrower face: the facets of a rounded or eased corner
END_DOT = 0.7                  # a face is end grain where its neighbours' grain runs within ~45 deg of its normal
GAP_MAX, GAP_MIN = 0.020, 0.003
BIG = 10.0
RAYS = 64
OFFSET = 0.003                 # a face's sky rays start this far out along its normal
MIN_COS = 0.02
MAX_DIST = {"self": 12.0, "scene": 120.0}


def _bvh(me):
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    return BVHTree.FromPolygons([tuple(v) for v in co.reshape(n, 3)], [tuple(p.vertices) for p in me.polygons],
                                all_triangles=False, epsilon=0.0)


def _faces(me, ob=None):
    """(material index, centre, unit normal) per face, numpy; in world space when ob is given, else object space."""
    nf = len(me.polygons)
    mi = np.empty(nf, dtype=np.int64)
    me.polygons.foreach_get("material_index", mi)
    c = np.empty(nf * 3, dtype=np.float64)
    me.polygons.foreach_get("center", c)
    nr = np.empty(nf * 3, dtype=np.float64)
    me.polygons.foreach_get("normal", nr)
    c, nr = c.reshape(nf, 3), nr.reshape(nf, 3)
    if ob is not None:
        mw = np.array(ob.matrix_world, dtype=np.float64)
        c = c @ mw[:3, :3].T + mw[:3, 3]
        nr = nr @ np.linalg.inv(mw[:3, :3])                    # (M^-1)^T applied to row vectors
        ln = np.linalg.norm(nr, axis=1, keepdims=True)
        nr = nr / np.where(ln < 1e-12, 1.0, ln)
    return mi, c, nr


def _openness(bvh, centres, normals, dirs, max_dist):
    """Per face: the d . n weighted share of the directions in front of it whose ray escapes bvh (0 with none)."""
    darr = np.asarray(dirs, dtype=np.float64)
    vecs = [Vector(d) for d in dirs]
    out = np.zeros(len(centres), dtype=np.float32)
    for i, (c, n) in enumerate(zip(centres, normals)):
        cos = darr @ n
        valid = np.nonzero(cos > MIN_COS)[0]
        if not len(valid):
            continue
        o = Vector(c + n * OFFSET)
        tot = esc = 0.0
        for j in valid:
            w = float(cos[j])
            tot += w
            if bvh.ray_cast(o, vecs[j], max_dist)[0] is None:
                esc += w
        out[i] = esc / tot
    return out


def _upright(ob):
    m = ob.matrix_world.to_3x3()
    z = m @ Vector((0.0, 0.0, 1.0))
    return abs(z.length - 1.0) < 1e-4 and z.z > 1.0 - 1e-4


# ---------------------------------------------------------------- the edge geometry (object space, per mesh)
class _Mesh:
    """A mesh's arrays (object space): vertices, faces (loop start / total, normals, centres, materials), the loops'
    vertices and edges, the faces round each edge, and each face's grain direction from the UV layer."""

    def __init__(self, me, cls_slots, grain):
        nv, nf, nl, ne = len(me.vertices), len(me.polygons), len(me.loops), len(me.edges)
        self.co = np.empty(nv * 3)
        me.vertices.foreach_get("co", self.co)
        self.co = self.co.reshape(nv, 3)
        self.fn = np.empty(nf * 3)
        me.polygons.foreach_get("normal", self.fn)
        self.fn = self.fn.reshape(nf, 3)
        self.fc = np.empty(nf * 3)
        me.polygons.foreach_get("center", self.fc)
        self.fc = self.fc.reshape(nf, 3)
        self.ls = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("loop_start", self.ls)
        self.lt = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("loop_total", self.lt)
        mi = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("material_index", mi)
        self.lv = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("vertex_index", self.lv)
        self.le = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("edge_index", self.le)
        self.cls = np.isin(mi, list(cls_slots))
        self.nf, self.nl = nf, nl
        self.edge_faces = [[] for _ in range(ne)]
        for f in np.nonzero(self.cls)[0]:
            for li in range(self.ls[f], self.ls[f] + self.lt[f]):
                self.edge_faces[self.le[li]].append(int(f))
        self.grain = self._grain(me) if grain else None

    def pts(self, f):
        return self.co[self.lv[self.ls[f]:self.ls[f] + self.lt[f]]]

    def _grain(self, me):
        """Per face: the unit 3D direction of the UV U (the grain) or a zero vector where it is undefined."""
        uvl = me.uv_layers.get("UVMap") or me.uv_layers.active
        out = np.zeros((self.nf, 3))
        if uvl is None:
            return out
        uv = np.empty(self.nl * 2)
        uvl.data.foreach_get("uv", uv)
        uv = uv.reshape(self.nl, 2)
        for f in np.nonzero(self.cls)[0]:
            s, n = self.ls[f], self.lt[f]
            p = self.co[self.lv[s:s + n]]
            t = uv[s:s + n]
            best = None
            for k in range(1, n - 1):                                 # the fan triangle with the best UV area
                e1, e2 = p[k] - p[0], p[k + 1] - p[0]
                d1, d2 = t[k] - t[0], t[k + 1] - t[0]
                det = d1[0] * d2[1] - d2[0] * d1[1]
                if best is None or abs(det) > abs(best[0]):
                    best = (det, e1, e2, d1, d2)
            det, e1, e2, d1, d2 = best
            if abs(det) < 1e-12:
                continue
            g = (e1 * d2[1] - e2 * d1[1]) / det                       # dP/du
            ln = np.linalg.norm(g)
            if ln > 1e-9:
                out[f] = g / ln
        return out

    def width(self, f, a, b):
        """How far face f reaches from the line through vertices a, b (its extent across that edge)."""
        p = self.pts(f)
        u = self.co[b] - self.co[a]
        u = u / max(np.linalg.norm(u), 1e-12)
        return float(np.max(np.linalg.norm(np.cross(p - self.co[a], u), axis=1)))


def _arrises(m):
    """{edge index: True} for the arris edges between two class faces (convex and sharp, see the header), and the
    edges on the class faces' open boundary."""
    out = {}
    for e, fs in enumerate(m.edge_faces):
        if len(fs) == 1:
            out[e] = True
            continue
        if len(fs) != 2:
            continue
        f1, f2 = fs
        n1, n2 = m.fn[f1], m.fn[f2]
        ang = math.degrees(math.acos(max(-1.0, min(1.0, float(n1 @ n2)))))
        if ang < ARRIS_MIN_DEG or float((m.fc[f2] - m.fc[f1]) @ n1) > -1e-7:
            continue                                                  # smooth, or concave
        if ang >= ARRIS_DEG:
            out[e] = True
            continue
        li = next(i for i in range(m.ls[f1], m.ls[f1] + m.lt[f1]) if m.le[i] == e)
        a = m.lv[li]
        b = m.lv[m.ls[f1] + (li - m.ls[f1] + 1) % m.lt[f1]]
        w = min(m.width(f1, a, b), m.width(f2, a, b))
        if ang / max(w * 1000.0, 1e-3) >= ARRIS_RATE:
            out[e] = True
    return out


def _ends(m):
    """Per face: 1 where its normal runs along the grain of its neighbours (end grain), else 0."""
    out = np.zeros(m.nf, dtype=np.float32)
    if m.grain is None:
        return out
    for f in np.nonzero(m.cls)[0]:
        s, n = m.ls[f], m.lt[f]
        tot = hit = per = 0.0
        for k in range(n):
            a, b = m.lv[s + k], m.lv[s + (k + 1) % n]
            ln = float(np.linalg.norm(m.co[b] - m.co[a]))
            per += ln
            for h in m.edge_faces[m.le[s + k]]:
                if h != f and np.any(m.grain[h]):
                    tot += ln
                    hit += ln * abs(float(m.fn[f] @ m.grain[h]))
        if per > 0.0 and tot > 0.5 * per and hit / tot > END_DOT:
            out[f] = 1.0
    return out


def _encode(d, pair):
    """One pair's (a per corner, h): d[k] the corners' distances to edge k (None if not an arris)."""
    i, j = pair
    di = d[i] if i is not None else None
    dj = d[j] if j is not None else None
    if di is not None and dj is not None:
        return (di - dj) / 2.0, float(np.mean((di + dj) / 2.0))
    one = di if di is not None else dj
    if one is not None:
        top = float(one.max()) + 1.0
        return top - one, top
    return None, BIG


def _slots(m, arris, ends):
    """The two pairs per class face: (ea, eb) per loop and (ha, hb) per face (see the header)."""
    ea = np.zeros(m.nl, dtype=np.float32)
    eb = np.zeros(m.nl, dtype=np.float32)
    ha = np.zeros(m.nf, dtype=np.float32)
    hb = np.zeros(m.nf, dtype=np.float32)
    for f in np.nonzero(m.cls)[0]:
        s, n = m.ls[f], m.lt[f]
        p = m.pts(f)
        if ends[f]:                                                   # end grain: ha < 0 (distance < 0: all band)
            ha[f], hb[f] = END_FLAG, BIG
            continue
        d, length, direc = [], [], []
        for k in range(n):
            e = m.le[s + k]
            u = p[(k + 1) % n] - p[k]
            ln = float(np.linalg.norm(u))
            u = u / max(ln, 1e-12)
            length.append(ln)
            direc.append(u)
            if not arris.get(e):
                d.append(None)
                continue
            dist = np.linalg.norm(np.cross(p - p[k], u), axis=1)
            if any(h != f and ends[h] for h in m.edge_faces[e]):
                dist = dist / END_REACH                               # toward end grain: the band reaches further
            d.append(dist)
        if n == 4:
            pairs = [(0, 2), (1, 3)]
        else:
            ar = sorted((k for k in range(n) if d[k] is not None), key=lambda k: -length[k])
            if n == 3:
                pairs = [(ar[0] if ar else None, None), (ar[1] if len(ar) > 1 else None, None)]
            else:
                diam = float(np.max(np.linalg.norm(p[:, None, :] - p[None, :, :], axis=2)))
                pairs = [(None, None), (None, None)]
                if ar and length[ar[0]] > 0.25 * diam:
                    k0 = ar[0]
                    opp = [k for k in ar if k != k0 and float(direc[k] @ direc[k0]) < -0.9]
                    pairs[0] = (k0, opp[0] if opp else None)
                    side = [k for k in ar if abs(float(direc[k] @ direc[k0])) < 0.3]
                    if side:
                        k1 = side[0]
                        opp = [k for k in side if k != k1 and float(direc[k] @ direc[k1]) < -0.9]
                        pairs[1] = (k1, opp[0] if opp else None)
        for which, pair in enumerate(pairs):
            a, h = _encode(d, pair)
            (ha if which == 0 else hb)[f] = max(h, 1e-4)
            if a is not None:
                (ea if which == 0 else eb)[s:s + n] = a
    return ea, eb, ha, hb


def _end_planes(m, ends):
    """Per vertex: the distances (m) to the planes of its member's two end-grain faces (FAR where it has fewer). A
    member is a loose island of class faces; a distance to a fixed plane is linear, so it interpolates exactly. An
    island with more than two ends (a bent member) takes, per vertex, its two nearest."""
    nv = len(m.co)
    e1 = np.full(nv, FAR, dtype=np.float32)
    e2 = np.full(nv, FAR, dtype=np.float32)
    parent = list(range(nv))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    cls_faces = np.nonzero(m.cls)[0]
    for f in cls_faces:
        vs = m.lv[m.ls[f]:m.ls[f] + m.lt[f]]
        r0 = find(vs[0])
        for v in vs[1:]:
            r = find(v)
            if r != r0:
                parent[r] = r0
    verts, caps = {}, {}
    for f in cls_faces:
        vs = m.lv[m.ls[f]:m.ls[f] + m.lt[f]]
        root = find(vs[0])
        verts.setdefault(root, set()).update(int(v) for v in vs)
        if ends[f]:
            caps.setdefault(root, []).append(f)
    for root, fs in caps.items():
        vs = np.array(sorted(verts[root]))
        d = np.stack([np.abs((m.co[vs] - m.fc[f]) @ m.fn[f]) for f in fs], axis=1)
        if len(fs) > 2:
            d = np.sort(d, axis=1)
        e1[vs] = d[:, 0]
        if d.shape[1] > 1:
            e2[vs] = d[:, 1]
    return e1, e2


def _gaps(m, bvh):
    """Per class face: how closely it faces another face of its piece (rays along its normal from its centre and from
    four points 60 % of the way to its corners)."""
    out = np.zeros(m.nf, dtype=np.float32)
    for f in np.nonzero(m.cls)[0]:
        p = m.pts(f)
        n = m.fn[f]
        c = m.fc[f]
        idx = np.linspace(0, len(p) - 1, min(4, len(p))).round().astype(int)
        starts = [c] + [c + 0.6 * (p[i] - c) for i in idx]
        d = Vector(n)
        acc = 0.0
        for q in starts:
            loc, nh, _, dist = bvh.ray_cast(Vector(q + n * 0.0015), d, GAP_MAX)
            if loc is not None and nh.dot(d) < 0.0:
                t = min(1.0, max(0.0, (GAP_MAX - dist) / (GAP_MAX - GAP_MIN)))
                acc += t * t * (3.0 - 2.0 * t)
        out[f] = acc / len(starts)
    return out


def attributes(ctx):
    """The feature's attributes on every mesh of its classes (see the header); other faces read 0."""
    dirs = signals.hemisphere(RAYS)
    movable = set()
    for c in context.collection_tree(ctx.root):
        if c.name in context.MOVABLE_COLLECTIONS:
            movable |= {o.name for x in context.collection_tree(c) for o in x.objects}
    done, stats = {}, []
    for ob in ctx.meshes(CLASSES):
        cls_of = {i: classes.classify(m)[1] for i, m in enumerate(ob.data.materials) if m is not None}
        slots = [i for i, c in cls_of.items() if c in CLASSES]
        self_only = ob.name in movable
        if not self_only or not _upright(ob):
            ctx.own_mesh(ob)            # fixed wood: shelter and floor depend on where it stands; a tilted movable too
        me = ob.data
        if me.name in done:
            continue
        # sky openness, as before the rework
        if self_only:
            mi, c, nr = _faces(me)
            bvh_sky, dist = _bvh(me), MAX_DIST["self"]
            if not _upright(ob):
                inv = ob.matrix_world.to_3x3().inverted()
                dirs_here = [tuple((inv @ Vector(d)).normalized()) for d in dirs]
            else:
                dirs_here = dirs
        else:
            mi, c, nr = _faces(me, ob)
            bvh_sky, dist, dirs_here = ctx.ray_scene(), MAX_DIST["scene"], dirs
        sel = np.nonzero(np.isin(mi, slots))[0]
        openv = np.zeros(len(mi), dtype=np.float32)
        openv[sel] = _openness(bvh_sky, c[sel], nr[sel], dirs_here, dist)
        # the edges
        grain = any(cls_of[i] in GRAIN_CLASSES for i in slots)
        m = _Mesh(me, slots, grain)
        arris = _arrises(m)
        ends = _ends(m)
        ea, eb, ha, hb = _slots(m, arris, ends)
        end1, end2 = _end_planes(m, ends)
        wood = [tuple(me.polygons[f].vertices) for f in np.nonzero(m.cls)[0]]
        gap = _gaps(m, BVHTree.FromPolygons([tuple(v) for v in m.co], wood, all_triangles=False, epsilon=0.0))
        # the floor
        if self_only and _upright(ob):
            sz = ob.matrix_world.to_scale().z
            foot = (m.co[:, 2] - m.co[:, 2].min()) * sz
        else:
            co, nrm = ctx.world(ob)
            foot = co[:, 2] - (co[:, 2].min() if self_only else ctx.walking_level(co, nrm))
        for nm, vals, dom in (("teak_ea", ea, 'CORNER'), ("teak_eb", eb, 'CORNER'), ("teak_ha", ha, 'FACE'),
                              ("teak_hb", hb, 'FACE'), ("teak_end1", end1, 'POINT'), ("teak_end2", end2, 'POINT'),
                              ("teak_gap", gap, 'FACE'), ("teak_foot", np.maximum(foot, 0.0), 'POINT'),
                              ("teak_open", openv, 'FACE')):
            ctx.set_attribute(ob, nm, vals, dom)
        done[me.name] = True
        stats.append((ob.name, "self" if self_only else "scene", int(len(sel)), len(arris), int(ends.sum()),
                      int((gap > 0.5).sum()), round(float(openv[sel].mean()), 3) if len(sel) else 0.0))
    return {"meshes": len(done), "faces": int(sum(s[2] for s in stats)), "arris_edges": int(sum(s[3] for s in stats)),
            "end_faces": int(sum(s[4] for s in stats)), "gap_faces": int(sum(s[5] for s in stats)), "objects": stats}


def shader(b, ins):
    def per_class(table):
        acc = None
        for cls, a in table.items():
            term = b.mul(b.is_class(cls), a)
            acc = term if acc is None else b.add(acc, term)
        return acc
    amp_s, amp_f, amp_g = per_class(AMP_SILVER), per_class(AMP_FOOT), per_class(AMP_GAP)
    ha = b.signal("teak_ha")
    present = b.gt(b.absf(ha), 0.0)
    end = b.lt(ha, 0.0)                                       # end grain carries ha = END_FLAG
    seed = b.object("seed")
    piece = b.add(PIECE[0], b.mul(PIECE[1] - PIECE[0], seed))
    board = b.math('FRACT', b.add(b.signal("panel"), b.mul(seed, 7.13)))

    def draw(rng, k, off):
        """a per-board value in rng (a different shuffle of the board value per k, off)"""
        return b.add(rng[0], b.mul(rng[1] - rng[0], b.math('FRACT', b.add(b.mul(board, k), off))))
    bamp = draw(BOARD_AMP, 3.71, 0.13)
    bwid = draw(BOARD_WIDTH, 5.29, 0.57)
    zone = draw(END_ZONE, 1.93, 0.41)
    fh = b.mul(FOOT_H, b.add(0.6, b.mul(0.8, b.math('FRACT', b.add(b.mul(board, 2.17), b.mul(seed, 3.3))))))
    # nearness to the member's ends: the arrises grey wider and more toward the ends (the water wicks in there)
    near = b.smooth(zone, 0.0, b.mn(b.signal("teak_end1"), b.signal("teak_end2")))
    # the arris band: the nearer of the two pairs' distances
    da = b.sub(ha, b.absf(b.signal("teak_ea")))
    db = b.sub(b.signal("teak_hb"), b.absf(b.signal("teak_eb")))
    w = b.mul(b.mul(BAND, bwid), b.add(END_WIDTH[0], b.mul(END_WIDTH[1] - END_WIDTH[0], near)))
    arris = b.smooth(w, b.mul(w, 0.2), b.mn(da, db))
    arris = b.mul(arris, b.add(MID_SHARE, b.mul(1.0 - MID_SHARE, b.mx(near, end))))
    sheltered = b.smooth(OPEN[0], OPEN[1], b.signal("teak_open"))
    silver_m = b.mul(b.mul(arris, sheltered), present)
    ks = b.mul(b.mul(silver_m, b.mul(piece, bamp)), b.mul(amp_s, ins["Strength"]))
    y = b.lum(ins["Color"])
    grey = b.tint(b.rgb(y, y, y), SILVER)
    target = b.scale_rgb(grey, b.add(LIFT, b.mul(END_LIFT - LIFT, end)))
    col = b.mix(ins["Color"], target, ks, 'RGBA')
    rough = b.add(ins["Roughness"], b.mul(ks, b.add(ROUGH_SILVER, b.mul(ROUGH_END - ROUGH_SILVER, end))))
    # the feet: over the floor the piece stands on
    foot_m = b.mul(b.smooth(fh, b.mul(fh, 0.15), b.signal("teak_foot")), present)
    kf = b.mul(b.mul(foot_m, piece), b.mul(amp_f, ins["Strength"]))
    col = b.mix(col, b.tint(b.desaturate(col, 0.3), FOOT_TONE), kf, 'RGBA')
    rough = b.add(rough, b.mul(kf, 0.05))
    # the slat gaps
    gap_m = b.mul(b.signal("teak_gap"), present)
    kg = b.mul(b.mul(gap_m, bamp), b.mul(amp_g, ins["Strength"]))
    col = b.mix(col, b.tint(b.desaturate(col, 0.2), GAP_TONE), kg, 'RGBA')
    rough = b.add(rough, b.mul(kg, 0.05))
    mask = b.mx(b.mx(b.mul(silver_m, bamp), foot_m), gap_m)
    return {"Color": col, "Roughness": rough, "Mask": b.mul(mask, b.div(amp_s, AMP_SILVER["furn_teak"]))}
