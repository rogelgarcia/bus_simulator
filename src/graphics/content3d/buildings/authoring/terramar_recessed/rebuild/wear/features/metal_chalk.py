# metal_chalk -- the black powder coat chalking along the exposed arrises of the metal members (the wear module,
# 2026-10-14; reworked the same day to act at the edges only: the user rejected wear over whole surfaces).
#
# A powder coat flows thin over a sharp arris when it cures, and the arris is where the sun's ultraviolet, the rain
# and every touch reach from two sides. The resin there breaks down first and its pigment and filler come loose as a
# fine pale bloom, the "chalk". On black aluminium and steel it reads as a fine lighter line along the edges of the
# exposed members (a slat's top arris, a frame's head, a guard rail's top edges, a lantern cap's rim), a little more at
# a member's exposed ends, while the faces keep their deep colour. The first version greyed whole faces, which "has no
# value" (the user, 2026-10-14). Where the line runs and how strong it is comes from the geometry, never from noise:
#   arris    an edge of a steel face that folds at least ARRIS_DEG to a steel neighbour face, convex (the neighbour
#            folds behind the face's plane, tested along each face's inward direction, so a U-shaped rail top counts
#            too). The members are closed boxes and mitred strips, so every box edge is convex: an edge is an arris
#            only where BOTH its faces are free of anything touching them. Each face is probed INSET in from the edge
#            at up to three points along it; a probe PROBE out along the face's normal is covered when a surface lies
#            within NEAR in front of it, or when it sits inside a solid (the first hit along the normal is a back
#            face). So a mullion's edges where it butts into the head rail, a sill's on the stone, a frame's against
#            the wall and a slat's ends in the side rails are junctions, not arrises
#   dose     the sky the arris sees: of SKY_RAYS cosine-weighted directions about its bisector, from SKY_OUT out, the
#            share that leaves the ray scene ABOVE the horizon. An open top arris reads about 0.8, an open vertical one
#            about 0.45, a bottom one about 0.15, a sheltered one under a slab less; then smooth(DOSE[0], DOSE[1])
#   member   each member (an island of steel faces) takes MEMBER of it (two seeded uniforms on the object and its
#            rounded world corner): coats age differently, a replaced bar is fresher
#   end      the arrises round an exposed end face of a member take END_BOOST more. An end face folds to its neighbours
#            all round, is no larger than END_MAX across and sits on a member at least END_RATIO times longer (a slat's
#            or a rail's cut end)
#   corners  each member corner (a vertex where every steel face turns) takes VARY of it, seeded: a line fades and
#            swells from one corner to the next. A strip's arc points take the middle of VARY, so a curved rail stays
#            smooth
#   sides    each face's boundary is split into sides where it turns by TURN_DEG or more (a box face has four; a
#            U-shaped rail top three outer, three inner and its two caps). A side's strength is the length-weighted
#            mean of its edges' (arris * dose * end), times the member's share. Each face keeps its CHANNELS strongest
#            sides (6: the most any face here has)
# This feature's attributes, chalk_a .. chalk_f (CORNER), one per side kept: 1 + the corner's distance (m) to that side
# - LINE_W * ln(strength * corner share), or 1 + FAR for no side. A distance to a straight side is linear over the face,
# so the corner values interpolate exactly, and the shader draws exp(-d / LINE_W) at any distance: the line is a few
# millimetres wide wherever the camera is. The offset folds the strength in (exp(-(d + o) / LINE_W) = strength *
# exp(-d / LINE_W)); the leading 1 marks the attribute present (absent reads 0).
# The look at strength 1 (k = the sides' lines screened, times Strength): the colour CHALK_MIX * k of the way toward
# the chalk's pale grey CHALK_RGB, roughness + ROUGH * k (a little only: more makes a top arris that mirrors the sky
# read darker, not lighter); both capped. Classes: steel (TM_RB_frame: window and storefront frames, guard rails and
# shoes, lantern bodies, the balcony furniture's frames; TM_RB_louvre; TM_RB_awning, the storefront canopies). Interior
# uses of the frame material stay clean (tm_wear_exposed, the indoor gate).
import math

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from .. import classes

NAME = "metal_chalk"
LABEL = "black powder coat chalking in a fine pale line along the exposed arrises, a little more at exposed ends"
ORDER = 50
CLASSES = ("steel",)
SIGNALS = ()
CHANNELS = 6
LETTERS = "abcdef"[:CHANNELS]
ATTRIBUTES = {f"chalk_{c}": 1.02 for c in LETTERS}
DEBUG_RGB = (0.95, 0.85, 0.10)            # yellow (debug colours are distinct across the features)
DEFAULT_STRENGTH = 1.0

SEED = "metal_chalk_edges"
TURN_DEG = 30.0                # a face's boundary turning at least this starts a new side
ARRIS_DEG = 30.0               # an edge folding at least this to its neighbour face can be an arris
INSET = 0.004                  # the burial probes sit this far in from the edge on each face (at most 0.3 of its width)
PROBE = 0.0015                 # ... and this far out along the face's normal
NEAR = 0.0025                  # a surface within this in front of a probe covers the face there
INSIDE = 1.0                   # a back face within this along the normal: the probe is inside a solid
SKY_RAYS = 24                  # cosine-weighted directions about the arris's bisector
SKY_OUT = 0.01                 # the dose is sampled this far out along the bisector
DOSE = (0.06, 0.80)            # the arris's sky from no chalk to full (smoothstep)
MEMBER = (0.65, 1.30)          # a member's share (mean of two seeded uniforms)
END_MAX = 0.13                 # an end face is at most this across ...
END_RATIO = 4.0                # ... on a member at least this many times longer
END_BOOST = 1.5
VARY = (0.50, 1.25)            # each vertex's share (seeded): a line fades and swells from one corner to the next
STRENGTH_MIN = 0.03            # weaker sides are dropped
FAR = 9.0                      # the stored distance of no side

LINE_W = 0.0024                # the line's e-fold (m): dense over the first ~3 mm, gone by ~8 mm
CHALK_RGB = (0.16, 0.156, 0.148)   # the bloom's pale grey (linear), against the coat's 0.018 / the canopies' 0.032
CHALK_MIX = 0.70               # per unit of line at strength 1: the colour this far toward CHALK_RGB ...
CHALK_MIX_MAX = 0.80
ROUGH = 0.12                   # ... and the roughness up this much (the coat's own is 0.38)
ROUGH_MAX = 0.20


def hemisphere(n=SKY_RAYS):
    """n cosine-weighted directions about +z on a golden-angle spiral (fixed: rebuilds are exact)."""
    golden = math.pi * (3.0 - math.sqrt(5.0))
    out = []
    for i in range(n):
        u = (i + 0.5) / n
        r, phi = math.sqrt(u), golden * i
        out.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1.0 - u))))
    return np.array(out)


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def frame(n):
    """An orthonormal (t, b, n) about the unit normal n."""
    a = np.array((1.0, 0.0, 0.0)) if abs(n[0]) < 0.9 else np.array((0.0, 1.0, 0.0))
    t = np.cross(n, a)
    t /= np.linalg.norm(t)
    return t, np.cross(n, t), n


def key(co):
    return tuple(round(float(x), 2) + 0.0 for x in co)


def members(me, steel):
    """{face index: member root} over the steel faces, connected through shared vertices."""
    parent = {}

    def find(i):
        while parent.setdefault(i, i) != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    faces = [p for p in me.polygons if p.material_index in steel]
    for p in faces:
        vs = list(p.vertices)
        for v in vs[1:]:
            a, b = find(vs[0]), find(v)
            if a != b:
                parent[a] = b
    return {p.index: find(p.vertices[0]) for p in faces}


def seg_dist(p, a, b):
    """Distance from point p to the segment a-b (numpy 3-vectors)."""
    ab = b - a
    t = float(np.clip((p - a) @ ab / max(float(ab @ ab), 1e-18), 0.0, 1.0))
    return float(np.linalg.norm(p - (a + ab * t)))


def sides_of(loop_co):
    """A face's boundary split into sides where it turns by TURN_DEG or more: [[edge positions k (k -> k+1)]]; [] for
    a face that never turns that much (a disc: its rim is not a straight side)."""
    n = len(loop_co)
    d = np.roll(loop_co, -1, axis=0) - loop_co
    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-12)
    cos_turn = math.cos(math.radians(TURN_DEG))
    breaks = [k for k in range(n) if float(d[k - 1] @ d[k]) < cos_turn]      # a side starts at edge k
    if not breaks:
        return []
    out = []
    for i, k0 in enumerate(breaks):
        k1 = breaks[(i + 1) % len(breaks)]
        span = (k1 - k0) % n or n
        out.append([(k0 + j) % n for j in range(span)])
    return out


class Probe:
    """Ray tests against the part's ray scene and the object's own geometry (a movable piece is not in the scene)."""

    def __init__(self, ctx, co, polys):
        self.trees = [ctx.ray_scene(), BVHTree.FromPolygons([tuple(c) for c in co], polys, epsilon=0.0)]

    def first(self, o, d, dist):
        best = None
        for t in self.trees:
            loc, nrm, _, dd = t.ray_cast(o, d, dist)
            if loc is not None and (best is None or dd < best[1]):
                best = (nrm, dd)
        return best

    def covered(self, p, n):
        """Whether the face point p (normal n) is touched: a surface within NEAR in front, or inside a solid."""
        nv = Vector(n)
        hit = self.first(Vector(p + n * PROBE), nv, INSIDE)
        return hit is not None and (hit[1] < NEAR or hit[0].dot(nv) > 0.0)

    def sky(self, o, bis, dirs):
        """The share of the cosine-weighted directions about bis that leave both trees above the horizon."""
        t, b, n = frame(bis)
        world = dirs[:, :1] * t + dirs[:, 1:2] * b + dirs[:, 2:3] * n
        ov = Vector(o)
        esc = sum(1 for d in world if d[2] > 0.0 and self.first(ov, Vector(d), 120.0) is None)
        return esc / len(world)


def attributes(ctx):
    """tm_wear_chalk_a .. _f per face corner of the feature's meshes (1 + FAR where there is no side)."""
    dirs = hemisphere()
    stats, totals = [], {"faces": 0, "arrises": 0, "edges": 0, "end_faces": 0}
    hist = {}
    lines = []
    for ob in ctx.meshes(CLASSES):
        me = ob.data
        steel = {i for i, m in enumerate(me.materials) if m is not None and classes.classify(m)[1] in CLASSES}
        root = members(me, steel)
        if not root:
            continue
        co, _ = ctx.world(ob)
        mw = np.array(ob.matrix_world, dtype=np.float64)
        nf = len(me.polygons)
        fn = np.empty(nf * 3)
        me.polygons.foreach_get("normal", fn)
        fn = fn.reshape(nf, 3) @ np.linalg.inv(mw[:3, :3])
        fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
        polys = [tuple(p.vertices) for p in me.polygons]
        probe = Probe(ctx, co, polys)
        by_edge = {}
        for p in me.polygons:
            for ek in p.edge_keys:
                by_edge.setdefault(ek, []).append(p.index)
        # members: share and extent; end faces
        lo, hi = {}, {}
        for fi, r in root.items():
            pts = co[list(polys[fi])]
            lo[r] = pts.min(axis=0) if r not in lo else np.minimum(lo[r], pts.min(axis=0))
            hi[r] = pts.max(axis=0) if r not in hi else np.maximum(hi[r], pts.max(axis=0))
        share = {r: MEMBER[0] + (MEMBER[1] - MEMBER[0]) * 0.5 * (ctx.seed(SEED, "a", ob.name, key(lo[r]))
                                                                   + ctx.seed(SEED, "b", ob.name, key(lo[r])))
                 for r in lo}
        extent = {r: float(np.max(hi[r] - lo[r])) for r in lo}
        cos_arris = math.cos(math.radians(ARRIS_DEG))
        face_sides = {}
        is_end = {}
        for fi in root:
            lc = co[list(polys[fi])]
            sd = sides_of(lc)
            face_sides[fi] = sd
            span = float(np.max(lc.max(axis=0) - lc.min(axis=0)))
            folds = all(len(by_edge[ek]) == 2 and float(fn[fi] @ fn[sum(by_edge[ek]) - fi]) < cos_arris
                        for ek in me.polygons[fi].edge_keys)          # a box's end: folds all round, not a segment
            is_end[fi] = bool(sd) and folds and span <= END_MAX and extent[root[fi]] >= END_RATIO * span
        inward = {}                      # (face, edge) -> the in-plane direction into the face (left of a CCW loop)
        for fi in root:
            vs = polys[fi]
            for k, a in enumerate(vs):
                b = vs[(k + 1) % len(vs)]
                t = np.cross(fn[fi], co[b] - co[a])
                inward[(fi, (min(a, b), max(a, b)))] = t / max(float(np.linalg.norm(t)), 1e-12)
        cache = {}

        def arris(fi, ek):
            """The strength (0 for no arris) of edge ek of steel face fi."""
            if ek in cache:
                return cache[ek]
            s = 0.0
            fl = by_edge.get(ek, [])
            if len(fl) == 2:
                g = fl[1] if fl[0] == fi else fl[0]
                a, b = co[ek[0]], co[ek[1]]
                mid = 0.5 * (a + b)
                nf_, ng = fn[fi], fn[g]
                tf, tg = inward[(fi, ek)], inward.get((g, ek))
                if (g in root and tg is not None and float(nf_ @ ng) < cos_arris
                        and float(tg @ nf_) < -1e-3 and float(tf @ ng) < -1e-3):        # convex: g folds behind f
                    length = float(np.linalg.norm(b - a))
                    ins = []
                    for f, n, t in ((fi, nf_, tf), (g, ng, tg)):
                        width = max(float((co[v] - a) @ t) for v in polys[f])
                        ins.append((t * min(INSET, 0.3 * width), n))
                    ts = (0.25, 0.5, 0.75) if length > 0.06 else (0.5,)
                    bis = nf_ + ng
                    bis /= max(float(np.linalg.norm(bis)), 1e-12)
                    open_pts = []
                    for tt in ts:
                        p = a + (b - a) * tt
                        if not any(probe.covered(p + off, n) for off, n in ins):
                            open_pts.append(p)
                    if open_pts:
                        dose = float(np.mean([probe.sky(p + bis * SKY_OUT, bis, dirs) for p in open_pts]))
                        s = len(open_pts) / len(ts) * float(smooth(*DOSE, dose))
                        s *= END_BOOST if (is_end[fi] or is_end[g]) else 1.0
            cache[ek] = s
            return s

        nl = len(me.loops)
        vals = np.full((CHANNELS, nl), 1.0 + FAR, dtype=np.float32)
        corner = {}                      # a member's corner: every steel face turns there (not a strip's arc point)
        cos_turn = math.cos(math.radians(TURN_DEG))
        for fi in root:
            vs = polys[fi]
            for j, v in enumerate(vs):
                a, b, c = co[vs[j - 1]], co[v], co[vs[(j + 1) % len(vs)]]
                d0, d1 = b - a, c - b
                turn = float(d0 @ d1) / max(float(np.linalg.norm(d0) * np.linalg.norm(d1)), 1e-18) < cos_turn
                corner[v] = corner.get(v, True) and turn
        vary = {v: VARY[0] + (VARY[1] - VARY[0]) * (ctx.seed(SEED, "vary", ob.name, key(co[v])) if is_c else 0.5)
                for v, is_c in corner.items()}
        n_arr = 0
        for fi in sorted(root):
            p = me.polygons[fi]
            vs = list(p.vertices)
            lc = co[vs]
            n = len(vs)
            sides = []
            for side in face_sides[fi]:
                w_sum = s_sum = 0.0
                segs = []
                for k in side:
                    a, b = vs[k], vs[(k + 1) % n]
                    ek = (min(a, b), max(a, b))
                    length = float(np.linalg.norm(co[b] - co[a]))
                    s = arris(fi, ek)
                    w_sum += length
                    s_sum += length * s
                    segs.append((co[a], co[b]))
                strength = s_sum / max(w_sum, 1e-12) * share[root[fi]]
                if strength >= STRENGTH_MIN:
                    sides.append((strength, segs))
            sides.sort(key=lambda t: -t[0])
            n_arr += len(sides)
            hist[min(len(sides), 9)] = hist.get(min(len(sides), 9), 0) + 1
            for c, (strength, segs) in enumerate(sides[:CHANNELS]):
                for j in range(n):
                    d = min(seg_dist(lc[j], a, b) for a, b in segs)
                    vals[c, p.loop_start + j] = 1.0 + d - LINE_W * math.log(strength * vary[vs[j]])
        ctx.own_mesh(ob)
        for c in range(CHANNELS):
            ctx.set_attribute(ob, f"chalk_{LETTERS[c]}", vals[c], 'CORNER')
        n_end = sum(1 for v in is_end.values() if v)
        arr = [s for s in cache.values() if s > 0.0]
        totals["faces"] += len(root)
        totals["edges"] += len(cache)
        totals["arrises"] += len(arr)
        totals["end_faces"] += n_end
        lines += arr
        stats.append((ob.name, len(share), len(root), len(cache), len(arr), n_end,
                      round(float(np.mean(arr)), 3) if arr else 0.0))
    if not lines:
        return {"faces": 0}
    return dict(totals, sides_per_face={k: hist[k] for k in sorted(hist)},
                strength_mean_max=[round(float(np.mean(lines)), 3), round(float(np.max(lines)), 3)],
                **{"objects (members, faces, edges, arrises, end faces, arris mean)": stats})


def shader(b, ins):
    first = b.signal("chalk_a")
    gate = b.mul(b.gt(first, 0.5), b.is_class(*CLASSES))
    clear = None
    for c in LETTERS:
        d = b.mx(b.sub(b.signal(f"chalk_{c}") if c != "a" else first, 1.0), -0.01)
        line = b.clamp(b.math('EXPONENT', b.mul(d, -1.0 / LINE_W)))
        term = b.one_minus(line)
        clear = term if clear is None else b.mul(clear, term)
    m = b.mul(b.one_minus(clear), gate)
    k = b.mul(m, ins["Strength"])
    col = b.mix(ins["Color"], CHALK_RGB, b.mn(b.mul(CHALK_MIX, k), CHALK_MIX_MAX), 'RGBA')
    rough = b.add(ins["Roughness"], b.mn(b.mul(ROUGH, k), ROUGH_MAX))
    return {"Color": col, "Roughness": rough, "Mask": m}
