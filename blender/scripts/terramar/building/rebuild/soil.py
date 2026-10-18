# soil.py -- user fix 23 (2026-10-16): the soil of every pot, planter, trough and tree pit as a gentle mound, and the
# plants re-seated on it, from plan["props"]["soil"] (props_layout.SOIL). The user: "create a small curvature, at the
# edges it is lower, and higher in the center".
#
# Used by the layers that build soil (balcony_plants, podium_planters, roof_planters, entrance_plants, site_palms, and
# the interiors' pots through layer_restaurant_l0.potted_plants), on the object they have just finished:
#   mound_pots(ob)                every flat, up-facing TM_RB_soil face of ob whose edge is the pot's own inner wall (a
#                                 round pot): the edge ring is lowered rim_drop (the inner wall follows it down, so no gap
#                                 opens), the face is replaced by a dome over the same ring
#   mound_pockets(ob, regions, wall_slot)
#                                 a planter built from rb_lib solids, whose body top (TM_RB_soil, under the rim walls too)
#                                 carries the rims: each region (the visible soil outline, the rims' inner line, and the
#                                 body top's z) is cut out of that face, a pocket wall rim_drop deep (wall_slot, the
#                                 planter's own material; the hidden band under the rims stays TM_RB_soil) and the dome
#                                 over the pocket's floor, so the planter's outside is unchanged
#   lift(xy, z, r=0)              how far a plant standing at xy on the old flat soil at z moves to stand on the mound (0
#                                 if xy is on no mound built this session); with r, the highest point under a foot of that
#                                 radius (a stem's flared foot then sits on the mound and never cuts into it)
#   report()                      the mounds built and the plants re-seated, for the layers' summaries
# The dome: z = z_soil - rim_drop + rise * (1 - (1 - t)^2), t = d / d_max, where d is a soft minimum of the distances to
# the outline's edges (so a box's corners round off without a crease) and d_max its largest value inside; rise is
# rise_frac of the region's width (twice its inradius), clamped to [rise_min, rise_max], and the peak always stays at
# least rim_clear under the old rim. The dome is triangulated (constrained Delaunay) over the outline and a grid of
# `step` (finer for a small pot), shaded smooth, its edge to the walls sharp. Each mound carries the face attribute
# rb_soil_seed (0..1, seeded by its place), which the materials pass turns into the soil map's offset, and UVs = world
# x / y in metres (the soil's map is laid at world scale).
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import hashlib
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

import rb_lib as L

SLOT = "TM_RB_soil"
SEED_ATTR = "rb_soil_seed"
LEVEL_TOL = 0.004                  # a plant's z within this of a mound's old flat level stands on it
EDGE_BAND = 0.035                  # ... and one this close outside its outline (over the rim band) on its edge
REGIONS = globals().get("REGIONS", [])     # the mounds built this session (kept over importlib.reload, for lift())
STATS = globals().get("STATS", {"lifted": 0, "missed": 0, "first": 0, "misses": []})
_CFG = {}


def cfg():
    """The plan's soil settings (read once per session)."""
    if not _CFG:
        _CFG.update(L.load_plan()["props"]["soil"])
    return _CFG


# ---------------------------------------------------------------- 2D helpers


def _seg_dist(p, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    dx, dy = bx - ax, by - ay
    ln2 = dx * dx + dy * dy
    t = 0.0 if ln2 < 1e-18 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / ln2))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def _edges(poly):
    return list(zip(poly, poly[1:] + poly[:1]))


def _inside(poly, p):
    c = False
    for a, b in _edges(poly):
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            c = not c
    return c


def _dist(poly, p):
    return min(_seg_dist(p, a, b) for a, b in _edges(poly))


def _soft(poly, p, k):
    """A soft minimum of the distances to the outline's edges (p-norm of order -k)."""
    s = sum(max(_seg_dist(p, a, b), 1e-7) ** -k for a, b in _edges(poly))
    return s ** (-1.0 / k)


def _area(poly):
    return 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in _edges(poly))


def _resample(poly, step):
    """The outline with every edge split into pieces of at most step (its corners kept)."""
    out = []
    for a, b in _edges(poly):
        n = max(1, math.ceil(math.dist(a, b) / step - 1e-9))
        out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
    return out


def _seed(poly, z):
    key = "%.3f:%.3f:%.3f:%s" % (sum(q[0] for q in poly) / len(poly), sum(q[1] for q in poly) / len(poly), z, cfg()["seed"])
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


# ---------------------------------------------------------------- regions


def region(poly, z, rim_height):
    """A mound over the outline poly (CCW) whose old flat soil is at z under a rim rim_height above it: its rise, the
    soft distance's largest value and the interior grid the dome is triangulated over. Registered for lift()."""
    c = cfg()
    poly = [tuple(q) for q in poly]
    if _area(poly) < 0:
        poly.reverse()
    xs, ys = [q[0] for q in poly], [q[1] for q in poly]
    pts = [(sum(xs) / len(xs), sum(ys) / len(ys))]
    inr = max(_dist(poly, pts[0]), 0.0) if _inside(poly, pts[0]) else 0.0
    coarse = 0.02                                                       # the inradius from a fine probe grid
    for i in range(int((max(xs) - min(xs)) / coarse) + 1):
        for j in range(int((max(ys) - min(ys)) / coarse) + 1):
            q = (min(xs) + i * coarse, min(ys) + j * coarse)
            if _inside(poly, q):
                inr = max(inr, _dist(poly, q))
    width = 2.0 * inr
    rise = min(max(c["rise_frac"] * width, c["rise_min"]), c["rise_max"], rim_height + c["rim_drop"] - c["rim_clear"])
    step = min(c["step"], max(width / c["min_cells"], 0.01))
    grid = []
    for i in range(int((max(xs) - min(xs)) / step) + 2):
        for j in range(int((max(ys) - min(ys)) / step) + 2):
            q = (min(xs) + (i + 0.5) * step, min(ys) + (j + 0.5) * step)
            if _inside(poly, q) and _dist(poly, q) > 0.45 * step:
                grid.append(q)
    k = c["softness"]
    dmax = max([_soft(poly, q, k) for q in grid + pts if _inside(poly, q)] or [1e-6])
    reg = {"poly": poly, "z": z, "rise": rise, "dmax": dmax, "width": width, "step": step, "grid": grid,
           "seed": _seed(poly, z), "box": (min(xs), max(xs), min(ys), max(ys))}
    REGIONS.append(reg)
    return reg


def height(reg, p):
    """The mound's z at p (inside its outline)."""
    c = cfg()
    t = min(_soft(reg["poly"], p, c["softness"]) / reg["dmax"], 1.0)
    return reg["z"] - c["rim_drop"] + reg["rise"] * (1.0 - (1.0 - t) ** 2)


def find(xy, z):
    for reg in reversed(REGIONS):
        x0, x1, y0, y1 = reg["box"]
        if abs(z - reg["z"]) <= LEVEL_TOL and x0 <= xy[0] <= x1 and y0 <= xy[1] <= y1 and _inside(reg["poly"], xy):
            return reg
    return None


def lift(xy, z, r=0.0):
    """The rise from the old flat soil at z to the mound at xy (the highest under a foot of radius r); a plant whose
    origin sits in the rim band just outside a mound's outline (within EDGE_BAND) takes the mound's edge; 0 off any
    mound."""
    reg = find(xy, z)
    if reg is None:
        for near in reversed(REGIONS):
            x0, x1, y0, y1 = near["box"]
            if (abs(z - near["z"]) <= LEVEL_TOL and x0 - EDGE_BAND <= xy[0] <= x1 + EDGE_BAND
                    and y0 - EDGE_BAND <= xy[1] <= y1 + EDGE_BAND and _dist(near["poly"], xy) <= EDGE_BAND):
                STATS["lifted"] += 1
                return -cfg()["rim_drop"]
    if reg is None:
        STATS["missed"] += 1
        STATS["misses"].append([round(xy[0], 3), round(xy[1], 3), round(z, 3)])
        return 0.0
    STATS["lifted"] += 1
    probes = [tuple(xy)] + ([(xy[0] + r * math.cos(a * math.pi / 4), xy[1] + r * math.sin(a * math.pi / 4)) for a in range(8)]
                            if r > 0 else [])
    return max(height(reg, q) for q in probes if _inside(reg["poly"], q)) - z


def begin():
    """Start a layer's count (its report covers the mounds and lifts from here on)."""
    STATS.update(lifted=0, missed=0, first=len(REGIONS), misses=[])


def report():
    rises = [r["rise"] for r in REGIONS[STATS["first"]:]]
    return {"mounds": len(rises), "rise_mm": [round(1000 * min(rises), 1), round(1000 * max(rises), 1)] if rises else None,
            "plants_lifted": STATS["lifted"], "lift_misses": STATS["missed"], "misses_at": STATS["misses"][:6]}


# ---------------------------------------------------------------- mesh


def _layers(bm):
    seed = bm.faces.layers.float.get(SEED_ATTR) or bm.faces.layers.float.new(SEED_ATTR)
    return seed, bm.loops.layers.uv.verify()


def _slot(me, name):
    names = [m.name if m else "" for m in me.materials]
    if name not in names:
        me.materials.append(bpy.data.materials.get(name) or L.material(name))
        names.append(name)
    return names.index(name)


def _triangulate(outer, holes=(), extra=()):
    """Constrained Delaunay triangles over 2D points: outer loop (CCW), hole loops, free points. Returns (index
    triples, CCW, into outer + holes + extra) inside outer and outside every hole."""
    pts, edges, loops = [], [], []
    for lp in [outer, *holes]:
        i0 = len(pts)
        pts += lp
        edges += [(i0 + i, i0 + (i + 1) % len(lp)) for i in range(len(lp))]
        loops.append(lp)
    pts += list(extra)
    out = delaunay_2d_cdt([Vector(q) for q in pts], edges, [], 0, 1e-7, True)
    coords, faces, orig = out[0], out[2], out[3]
    remap = []
    for i, o in enumerate(orig):
        if not o:
            raise ValueError(f"soil: the triangulation added a point {tuple(coords[i])} (crossing outline?)")
        remap.append(o[0])
    tris = []
    for f in faces:
        a, b, c = (remap[i] for i in f)
        P = [pts[a], pts[b], pts[c]]
        m = ((P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3)
        if not _inside(outer, m) or any(_inside(h, m) for h in holes):
            continue
        cross = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0])
        if abs(cross) < 1e-14:
            continue
        tris.append((a, b, c) if cross > 0 else (a, c, b))
    return tris


def _dome(bm, edge_verts, reg, soil_index):
    """The dome over reg with edge_verts (CCW, already at the rim's z) as its edge: new faces."""
    seed_l, uv_l = _layers(bm)
    outer = [(v.co.x, v.co.y) for v in edge_verts]
    tris = _triangulate(outer, extra=reg["grid"])
    verts = list(edge_verts) + [bm.verts.new((q[0], q[1], height(reg, q))) for q in reg["grid"]]
    made = []
    for a, b, c in tris:
        f = bm.faces.new((verts[a], verts[b], verts[c]))
        f.material_index = soil_index
        f.smooth = True
        f[seed_l] = reg["seed"]
        for lp in f.loops:
            lp[uv_l].uv = (lp.vert.co.x, lp.vert.co.y)
        made.append(f)
    for v in edge_verts:                                                # its edge against the walls: sharp
        for e in v.link_edges:
            mats = {f.material_index == soil_index for f in e.link_faces}
            if len(mats) == 2:
                e.smooth = False
    return made


def _sharpen(edges, deg):
    lim = math.radians(deg)
    for e in edges:
        fs = e.link_faces
        e.smooth = len(fs) == 2 and fs[0].material_index == fs[1].material_index and fs[0].normal.angle(fs[1].normal, 0.0) < lim


def mound_pots(ob):
    """Every flat up-facing soil face of ob bounded by its pot's own inner wall becomes a mound (see the header)."""
    me = ob.data
    names = [m.name if m else "" for m in me.materials]
    if SLOT not in names:
        return 0
    si = names.index(SLOT)
    c = cfg()
    bm = bmesh.new()
    bm.from_mesh(me)
    _layers(bm)                                      # (adding a layer invalidates the faces held: add it first)
    bm.normal_update()
    faces = [f for f in bm.faces if f.material_index == si and f.normal.z > 0.999]
    for f in faces:
        ring = list(f.verts)
        z = sum(v.co.z for v in ring) / len(ring)
        rim = max(v.co.z for e in f.edges for g in e.link_faces if g is not f for v in g.verts) - z
        reg = region([(v.co.x, v.co.y) for v in ring], z, rim)
        bm.faces.remove(f)
        for v in ring:
            v.co.z = z - c["rim_drop"]
        _dome(bm, ring, reg, si)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(faces)


def mound_pockets(ob, regions, wall_slot):
    """regions: [(outline CCW, z of the body top, rim height above it)], each cut out of the TM_RB_soil body top under
    it as a pocket with its dome (see the header). Returns the number of mounds."""
    me = ob.data
    names = [m.name if m else "" for m in me.materials]
    if SLOT not in names or not regions:
        return 0
    si, wi = names.index(SLOT), _slot(me, wall_slot)
    c = cfg()
    bm = bmesh.new()
    bm.from_mesh(me)
    _layers(bm)
    bm.normal_update()
    new_edges = []
    for poly, z, rim in regions:
        reg = region(poly, z, rim)
        poly = reg["poly"]
        top = [f for f in bm.faces if f.material_index == si and f.normal.z > 0.999 and abs(f.verts[0].co.z - z) < 1e-4
               and _inside([(v.co.x, v.co.y) for v in f.verts], poly[0])]
        if len(top) != 1:
            raise ValueError(f"soil: {ob.name}: {len(top)} soil faces at z {z:.3f} under the outline at {poly[0]}")
        f = top[0]
        outer_v = list(f.verts)
        outer = [(v.co.x, v.co.y) for v in outer_v]
        if _area(outer) < 0:
            outer_v.reverse()
            outer.reverse()
        edge = _resample(poly, reg["step"])
        up = [bm.verts.new((q[0], q[1], z)) for q in edge]
        down = [bm.verts.new((q[0], q[1], z - c["rim_drop"])) for q in edge]
        bm.faces.remove(f)
        allv = outer_v + up
        for a, b, cc in _triangulate(outer, holes=[edge]):                # the hidden band under the rims
            g = bm.faces.new((allv[a], allv[b], allv[cc]))
            g.material_index, g.smooth = si, False
        n = len(edge)
        for i in range(n):                                              # the pocket wall, facing the soil
            j = (i + 1) % n
            g = bm.faces.new((up[i], up[j], down[j], down[i]))
            g.material_index, g.smooth = wi, False
        bm.normal_update()
        _dome(bm, down, reg, si)
        new_edges += [e for v in up for e in v.link_edges]
    bm.normal_update()
    _sharpen(set(new_edges), 30.0)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(regions)
