# rb_lib.py -- shared Blender helpers of the Terra & Mar rebuild (AI 643+): the plan, collections, the rebuild
# materials, solids built from plan regions, and the comparison cameras.
#
# Face sets are material slots: a layer script gives each face set its own TM_RB_* material (slab fascia, soffit,
# interior ceiling, balcony top, interior floor ...), so later layers find and re-dress them by slot name.
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if os.path.dirname(HERE) not in sys.path:
    sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

importlib.reload(C)        # a headed session keeps modules imported by earlier runs

ROOT = "TERRAMAR_REBUILD"           # every layer's collection lives under it (the audit's root)
CAMERAS = "RB_CAMERAS"
PLAN_GUIDES = "RB_PLAN_GUIDES"

# Placeholder looks, distinct in Solid view; the materials layer (AI 648) re-dresses them by name.
MATERIALS = {
    "TM_RB_slab_fascia": (0.78, 0.75, 0.69),
    "TM_RB_slab_top": (0.55, 0.54, 0.52),
    "TM_RB_floor": (0.46, 0.44, 0.41),
    "TM_RB_soffit": (0.62, 0.50, 0.38),
    "TM_RB_ceiling": (0.86, 0.86, 0.84),
    "TM_RB_roof_top": (0.52, 0.52, 0.50),
    "TM_RB_pilaster": (0.80, 0.77, 0.71),
    "TM_RB_column": (0.74, 0.72, 0.68),
    "TM_RB_core": (0.60, 0.60, 0.58),
    "TM_RB_hidden": (0.35, 0.35, 0.35),
}


def args(argv=None):
    argv = sys.argv if argv is None else argv
    tail = argv[argv.index("--") + 1:] if "--" in argv else []
    return dict(a.split("=", 1) for a in tail if "=" in a)


def load_plan():
    return C.load_json(C.REBUILD_PLAN)


# ---------------------------------------------------------------- collections


def ensure_collection(name, parent=None):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    parent = parent or bpy.context.scene.collection
    if coll.name not in parent.children:
        parent.children.link(coll)
    return coll


def clear_collection(coll):
    """Delete the collection's objects (and child collections) and the data they leave without users."""
    for child in list(coll.children):
        clear_collection(child)
        bpy.data.collections.remove(child)
    datas = []
    for ob in list(coll.objects):
        datas.append(ob.data)
        bpy.data.objects.remove(ob, do_unlink=True)
    blocks = ((bpy.types.Mesh, bpy.data.meshes), (bpy.types.Curve, bpy.data.curves),
              (bpy.types.Camera, bpy.data.cameras), (bpy.types.Light, bpy.data.lights))
    for d in datas:
        if d is None or d.users:
            continue
        for kind, block in blocks:
            if isinstance(d, kind):
                block.remove(d)
                break


def layer_collection(name):
    """A layer's own collection under the rebuild root, emptied for a fresh build."""
    coll = ensure_collection(name, ensure_collection(ROOT))
    clear_collection(coll)
    return coll


# ---------------------------------------------------------------- materials


def material(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        rgb = MATERIALS[name]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.8
        mat.diffuse_color = (*rgb, 1.0)
    return mat


# ---------------------------------------------------------------- solids


def _key(p):
    return (round(float(p[0]), 5), round(float(p[1]), 5))


def _area(loop):
    return 0.5 * sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(loop, loop[1:] + loop[:1]))


def _crossings(loop, axis, c, eps=1e-9):
    """Points where the loop meets the line {axis} = c (vertices on it, and edge crossings)."""
    out = []
    n = len(loop)
    for i in range(n):
        p, q = loop[i], loop[(i + 1) % n]
        dp, dq = p[axis] - c, q[axis] - c
        if abs(dp) <= eps:
            out.append(tuple(p))
        elif dp * dq < 0 and abs(dq) > eps:
            t = dp / (dp - dq)
            r = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
            r[axis] = c
            out.append(tuple(r))
    return out


def _insert_tracked(loop, mats, points):
    """insert_points that also carries a per-edge list (each new piece of an edge keeps the edge's entry)."""
    keys = {_key(q) for q in loop}
    points = [r for r in points if _key(r) not in keys]
    if not points:
        return list(loop), list(mats) if mats is not None else None
    out, out_m = [], []
    n = len(loop)
    for i in range(n):
        p, q = loop[i], loop[(i + 1) % n]
        dx, dy = q[0] - p[0], q[1] - p[1]
        ln2 = dx * dx + dy * dy
        on = []
        if ln2 > 1e-12:
            for r in points:
                t = ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / ln2
                if 1e-9 < t < 1 - 1e-9 and abs((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / math.sqrt(ln2) < 1e-6:
                    on.append((t, tuple(r)))
        seg = [tuple(p)] + [r for _, r in sorted(on)]
        out += seg
        if mats is not None:
            out_m += [mats[i]] * len(seg)
    return out, (out_m if mats is not None else None)


def _split(outer, holes, axis, c):
    """Cut a region with holes along {axis} = c into two hole-free loops. Every loop must cross the line exactly twice
    (the crossing points already inserted) and the holes lie stacked along the line."""
    def ends(loop):
        on = [q for q in loop if abs(q[axis] - c) < 1e-9]
        if len(on) != 2:
            raise ValueError(f"loop crosses the cut {('x', 'y')[axis]}={c} {len(on)} times, not twice")
        return sorted(on, key=lambda q: q[1 - axis])
    o_lo, o_hi = ends(outer)
    hs = sorted(((h,) + tuple(ends(h)) for h in holes), key=lambda t: t[1][1 - axis])
    # piece on the low side of the axis: for a vertical cut (axis 0) the -x side, CCW from the top crossing down
    side_a = path(outer, o_hi, o_lo)
    for h, h_lo, h_hi in hs:
        side_a += list(reversed(path(h, h_hi, h_lo)))
    side_b = path(outer, o_lo, o_hi)
    for h, h_lo, h_hi in reversed(hs):
        side_b += list(reversed(path(h, h_lo, h_hi)))
    return [side_a, side_b]


def solid(name, coll, spans, boundary, regions, tags):
    """A closed solid for every (z0, z1) in spans, all in one object (e.g. a column's storey-high segments).

    boundary -- [(loop, side_material or [per-edge materials])]: the outer loop and every hole loop; side faces follow
                each loop's edges.
    regions  -- [(loops, top_material, bottom_material)]: loops[0] outer, loops[1:] holes. The regions tile the area
                inside the boundary exactly; wherever two regions (or a region and the boundary) meet they share the
                same points.
    Tops and bottoms are n-gons, not triangles (a triangulator drops points that lie on a straight run and leaves
    T-junctions). A region with holes is first cut into two hole-free n-gons along a line through its first hole;
    every loop gets the points where it crosses every cut line, so neighbours keep sharing their vertices.
    """
    regions = [([ccw(list(map(tuple, lp))) for lp in loops], mt, mb) for loops, mt, mb in regions]
    cuts = []
    for loops, _, _ in regions:
        if len(loops) > 1:
            hx = [q[0] for q in loops[1]]
            hy = [q[1] for q in loops[1]]
            x_mid, y_mid = (min(hx) + max(hx)) / 2, (min(hy) + max(hy)) / 2
            vertical_ok = all(min(q[0] for q in h) < x_mid < max(q[0] for q in h) for h in loops[1:])
            cuts.append((0, round(x_mid, 6)) if vertical_ok else (1, round(y_mid, 6)))
    cuts = sorted(set(cuts))

    def with_cuts(loop, mats=None):
        pts = [r for axis, c in cuts for r in _crossings(loop, axis, c)]
        return _insert_tracked(loop, mats, pts)

    pieces = []
    for loops, mt, mb in regions:
        loops = [with_cuts(lp)[0] for lp in loops]
        if len(loops) == 1:
            pieces.append((loops[0], mt, mb))
            continue
        hx = [q[0] for q in loops[1]]
        hy = [q[1] for q in loops[1]]
        x_mid, y_mid = round((min(hx) + max(hx)) / 2, 6), round((min(hy) + max(hy)) / 2, 6)
        axis, c = (0, x_mid) if (0, x_mid) in cuts else (1, y_mid)
        for piece in _split(loops[0], loops[1:], axis, c):
            pieces.append((piece, mt, mb))
    bounds = []
    for loop, side in boundary:
        loop = list(map(tuple, loop))
        mats = list(side) if isinstance(side, (list, tuple)) else [side] * len(loop)
        bounds.append(with_cuts(loop, mats))

    bm = bmesh.new()
    slots = []

    def vert(table, p, z):
        k = _key(p)
        v = table.get(k)
        if v is None:
            v = table[k] = bm.verts.new((k[0], k[1], z))
        return v

    def slot(mat_name):
        if mat_name not in slots:
            slots.append(mat_name)
        return slots.index(mat_name)

    for z0, z1 in spans:
        top, bot = {}, {}
        for loop, mt, mb in pieces:
            loop = [q for i, q in enumerate(loop) if _key(q) != _key(loop[i - 1])]
            if _area(loop) < 0:
                loop.reverse()
            bm.faces.new([vert(top, q, z1) for q in loop]).material_index = slot(mt)
            bm.faces.new([vert(bot, q, z0) for q in reversed(loop)]).material_index = slot(mb)
        for loop, mats in bounds:
            n = len(loop)
            for i in range(n):
                p, q = loop[i], loop[(i + 1) % n]
                if _key(p) == _key(q):
                    continue
                bm.faces.new([vert(bot, p, z0), vert(bot, q, z0), vert(top, q, z1), vert(top, p, z1)]).material_index = slot(mats[i])
    return finish(name, coll, bm, slots, tags)


def finish(name, coll, bm, slots, tags, smooth_deg=30.0):
    """Normals out, coplanar faces merged per face set (vertices kept), box UVs (1 m), smooth with sharp edges over smooth_deg."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=[], edges=bm.edges[:], delimit={'MATERIAL'})
    bm.normal_update()
    box_uvs(bm)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for s in slots:
        me.materials.append(material(s))
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(smooth_deg))
    ob = bpy.data.objects.new(name, me)
    for k, v in tags.items():
        ob[k] = v
    coll.objects.link(ob)
    if non_manifold:
        print(f"WARNING {name}: {non_manifold} non-manifold edges")
    return ob


def box_uvs(bm, scale=1.0):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 2:
                loop[uv].uv = (co.x * scale, co.y * scale)
            elif ax == 0:
                loop[uv].uv = (co.y * scale, co.z * scale)
            else:
                loop[uv].uv = (co.x * scale, co.z * scale)


def prism(name, coll, loop, spans, mat, tags, mat_top=None, mat_bottom=None):
    return solid(name, coll, spans, [(loop, mat)], [([loop], mat_top or mat, mat_bottom or mat)], tags)


# ---------------------------------------------------------------- 2D helpers


def ccw(loop):
    a = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(loop, loop[1:] + loop[:1]))
    return loop if a > 0 else list(reversed(loop))


def rect(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def insert_points(loop, points, eps=1e-6):
    """Insert points that lie on the loop's edges (each into the edge it falls on, in order along the edge)."""
    out = []
    n = len(loop)
    for i in range(n):
        p, q = loop[i], loop[(i + 1) % n]
        out.append(tuple(p))
        dx, dy = q[0] - p[0], q[1] - p[1]
        ln2 = dx * dx + dy * dy
        if ln2 < 1e-12:
            continue
        on = []
        for r in points:
            t = ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / ln2
            if eps < t < 1 - eps and abs((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / math.sqrt(ln2) < 1e-5:
                on.append((t, tuple(r)))
        out += [r for _, r in sorted(on)]
    return out


def index_of(loop, p):
    k = _key(p)
    for i, q in enumerate(loop):
        if _key(q) == k:
            return i
    raise ValueError(f"point {p} not on the loop")


def path(loop, a, b):
    """The loop's points from point a to point b, following the loop's own direction (both included)."""
    i, j = index_of(loop, a), index_of(loop, b)
    out = [loop[i]]
    while i != j:
        i = (i + 1) % len(loop)
        out.append(loop[i])
    return out


# ---------------------------------------------------------------- cameras


def camera(name, coll, spec):
    """A camera from a plan camera spec (location + rotation_deg or target, focal_px or lens_mm or ortho_scale)."""
    cam = bpy.data.cameras.new(name)
    cam.clip_start, cam.clip_end = 0.1, 2000.0
    res = spec["resolution"]
    if "ortho_scale" in spec:
        cam.type = "ORTHO"
        cam.ortho_scale = spec["ortho_scale"]
        cam.sensor_fit = "HORIZONTAL" if res[0] >= res[1] else "VERTICAL"
    elif "focal_px" in spec:                 # pixel focal on the vertical axis
        cam.sensor_fit = "VERTICAL"
        cam.sensor_height = 24.0
        cam.lens = spec["focal_px"] * 24.0 / res[1]
    else:
        cam.sensor_fit = "HORIZONTAL"
        cam.sensor_width = 36.0
        cam.lens = spec["lens_mm"]
    cam.shift_y = spec.get("shift_y", 0.0)    # VERTICAL fit: in units of the image height
    ob = bpy.data.objects.new(name, cam)
    ob.location = spec["location"]
    if "target" in spec:
        ob.rotation_euler = (Vector(spec["target"]) - Vector(spec["location"])).to_track_quat("-Z", "Y").to_euler()
    else:
        ob.rotation_euler = [math.radians(a) for a in spec["rotation_deg"]]
    ob["tm_resolution"] = list(res)
    coll.objects.link(ob)
    return ob


def plan_cameras(coll, plan):
    """CAM_B8 (fitted to the plan), CAM_AERIAL (roof plane), CAM_REAR, CAM_TOP (orthographic plan view)."""
    return {key: camera(f"CAM_{key.upper()}", coll, spec) for key, spec in plan["cameras"].items()}
