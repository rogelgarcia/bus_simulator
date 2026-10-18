# palm_frond.py -- a detailed feather-palm frond (petiole, tapering rachis, individual leaflets) for the palm crowns.
#
# b8's street palms are tall feather palms (coconut / queen-palm look): long arching pinnate fronds whose many narrow
# leaflets hang from both sides of the rachis, sun-lit yellow-green, the older fronds drooping below level. The first
# palm of proc_plants.py drew each frond as one folded strip; this module builds one real frond for the crown composer:
#   build_frond(bm, rng, matrix, length=, base_elev_deg=, droop_deg=, age=, ...)   one frond into the caller's bmesh, in
#           its local frame (origin at the crown attachment; the rachis leaves along +x rising base_elev_deg above the xy
#           plane and curves down in the xz plane by droop_deg in total; leaflets on +-y), moved by matrix; returns the
#           triangles added and the world base and rachis tip
#   materials()   the three slot materials (MATERIAL_NAMES), procedural nodes: leaflets glossy above, paler and duller
#           below, a little translucent against the light, tinted per leaflet by the face attribute rb_tint; the rachis
#           tan at the base to yellow-green at the tip; dead leaflets straw brown
# The frond: a bare petiole (petiole_frac of the length, flared at its base), then the rachis tapering to the tip with one
# leaflet per side per station (sub-alternate). Leaflets are narrow tapered blades with a midrib crease, set in an
# induplicate V (angled up from the rachis), longest ~40 % along the leaflet zone and short at both ends, bending under
# gravity toward their tips and toward the frond tip, slightly twisted, with seeded irregularity in spacing, angle and
# length and a few split or missing ones. The rachis rolls a little toward the tip, so the leaf plane tilts as on real
# fronds. Ages: young (near-upright spear, leaflets folded forward in a narrow V), mature, old (leaflets hanging), dead
# (straw brown, leaflets collapsed along the hanging rachis, more missing). Faces: material_index slot0 + 0 leaflet,
# 1 rachis, 2 dead (a dead frond's rachis too); UVs across x along each leaflet (midrib at u 0.5) and around x along the
# rachis; the leaflet midribs are sharp edges, everything else smooth. A mature 3.5 m frond is ~3.4k triangles.
#
# Test renders (the .blend is never saved; renders go to out=):
#   blender -b blender_files/terramar/parts/terramar_part_shell.blend --python <this file> -- \
#       out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/palm_detail/frond [samples=96] [shots=row,...]
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

MATERIAL_NAMES = ("RBP_palm_leaflet_foliage", "RBP_palm_rachis", "RBP_palm_dead_foliage")   # slot order
TINT = "rb_tint"

# Per-age leaflet behaviour. v: V angle of the leaflets above the leaf plane (deg); spread: scale on the insertion angle
# to the rachis (1 open, small folded forward); droop: gravity bend at a long leaflet's tip near the frond tip (deg);
# fold: midrib crease (edge rise / half width); len, width: scales on the leaflet size; twist: sd of the twist along a
# leaflet (deg); missing, split: chance per leaflet; tint: rb_tint range; curl: exponent of the rachis droop along t
# (larger: stiffer base, the bend near the tip); roll: max rachis roll at the tip (deg).
AGES = {
    "young": {"v": 50.0, "spread": 0.5, "droop": 10.0, "fold": 0.55, "len": 0.92, "width": 0.9, "twist": 6.0,
              "missing": 0.0, "split": 0.01, "tint": (0.50, 0.85), "curl": 2.0, "roll": 8.0},
    "mature": {"v": 20.0, "spread": 1.0, "droop": 52.0, "fold": 0.28, "len": 1.0, "width": 1.0, "twist": 12.0,
               "missing": 0.025, "split": 0.04, "tint": (0.18, 0.62), "curl": 1.6, "roll": 22.0},
    "old": {"v": 10.0, "spread": 1.0, "droop": 88.0, "fold": 0.26, "len": 1.0, "width": 1.0, "twist": 16.0,
            "missing": 0.05, "split": 0.08, "tint": (0.45, 0.95), "curl": 1.25, "roll": 30.0},
    "dead": {"v": -6.0, "spread": 0.6, "droop": 85.0, "fold": 0.85, "len": 0.88, "width": 0.7, "twist": 35.0,
             "missing": 0.12, "split": 0.06, "tint": (0.0, 1.0), "curl": 1.2, "roll": 25.0},
}
# The rachis cross-section in its (side, up) frame, unit width: a flat-topped, round-bottomed petiole.
SECTION = ((-0.5, 0.18), (0.0, 0.10), (0.5, 0.18), (0.40, -0.20), (0.0, -0.5), (-0.40, -0.20))
TABLE = 160                                                     # rachis curve samples


# ---------------------------------------------------------------- materials


def _mix(nt, blend="MIX"):
    """A colour Mix node and its (factor, A, B, result) sockets."""
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    a = next(s for s in n.inputs if s.name == "A" and s.type == "RGBA")
    b = next(s for s in n.inputs if s.name == "B" and s.type == "RGBA")
    return n.inputs[0], a, b, next(s for s in n.outputs if s.type == "RGBA")


def _map(nt, src, lo, hi, a, b):
    n = nt.nodes.new("ShaderNodeMapRange")
    n.clamp = True
    n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = lo, hi
    n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = a, b
    nt.links.new(n.inputs["Value"], src)
    return n.outputs["Result"]


def _ramp(nt, src, stops):
    n = nt.nodes.new("ShaderNodeValToRGB")
    els = n.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    for pos, rgb in stops[1:]:
        e = els.new(pos)
        e.color = (*rgb, 1.0)
    nt.links.new(n.inputs["Fac"], src)
    return n.outputs["Color"]


def _hsv(nt, src, sat, val):
    n = nt.nodes.new("ShaderNodeHueSaturation")
    n.inputs["Saturation"].default_value, n.inputs["Value"].default_value = sat, val
    nt.links.new(n.inputs["Color"], src)
    return n.outputs["Color"]


def _start(name, viewport_rgb):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    mat.diffuse_color = (*viewport_rgb, 1.0)
    nt = mat.node_tree
    nt.nodes.clear()
    tint = nt.nodes.new("ShaderNodeAttribute")
    tint.attribute_type = "GEOMETRY"
    tint.attribute_name = TINT
    uv = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.inputs[0], nt.nodes.new("ShaderNodeTexCoord").outputs["UV"])
    return mat, nt, tint.outputs["Fac"], uv.outputs["X"], uv.outputs["Y"]


def _leaf_material(name, stops, midrib_rgb, rough, translucency, viewport_rgb):
    """Leaflets: tint ramp by rb_tint, darker at the leaflet base, a pale midrib, a paler duller underside, a little
    light through the blade (a Translucent BSDF mixed in)."""
    mat, nt, tint, across, along = _start(name, viewport_rgb)
    col = _ramp(nt, tint, stops)
    fac, a, b, res = _mix(nt, "MULTIPLY")                         # base of each leaflet a shade darker
    fac.default_value = 1.0
    nt.links.new(a, col)
    nt.links.new(b, _map(nt, along, 0.0, 0.6, 0.80, 1.0))
    col = res
    dist = nt.nodes.new("ShaderNodeMath")                         # |u - 0.5|: the midrib at the crease
    dist.operation = "ABSOLUTE"
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    nt.links.new(sub.inputs[0], across)
    sub.inputs[1].default_value = 0.5
    nt.links.new(dist.inputs[0], sub.outputs[0])
    fac, a, b, res = _mix(nt)
    nt.links.new(fac, _map(nt, dist.outputs[0], 0.0, 0.07, 0.4, 0.0))
    nt.links.new(a, col)
    b.default_value = (*midrib_rgb, 1.0)
    col = res
    back = nt.nodes.new("ShaderNodeNewGeometry").outputs["Backfacing"]
    fac, a, b, res = _mix(nt)                                      # the underside: paler, greyer
    nt.links.new(fac, back)
    nt.links.new(a, col)
    nt.links.new(b, _hsv(nt, col, 0.80, 1.08))             # (2026-10-14 crown pass: was 0.72 / 1.18, too pale in b8)
    col = res
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.inputs["Base Color"], col)
    nt.links.new(bsdf.inputs["Roughness"], _map(nt, back, 0.0, 1.0, rough[0], rough[1]))
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    trans = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(trans.inputs["Color"], _hsv(nt, col, 1.15, 1.5))
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = translucency
    nt.links.new(mix.inputs[1], bsdf.outputs["BSDF"])
    nt.links.new(mix.inputs[2], trans.outputs["BSDF"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(out.inputs["Surface"], mix.outputs["Shader"])
    return mat


def _rachis_material(name):
    """The petiole and rachis: tan at the base, paler yellow-green along, greener at the tip, varied by rb_tint."""
    mat, nt, tint, _, along = _start(name, (0.30, 0.29, 0.14))
    col = _ramp(nt, along, ((0.0, (0.22, 0.17, 0.09)), (0.2, (0.24, 0.22, 0.10)), (1.0, (0.15, 0.20, 0.06))))
    fac, a, b, res = _mix(nt, "MULTIPLY")
    fac.default_value = 1.0
    nt.links.new(a, col)
    nt.links.new(b, _map(nt, tint, 0.0, 1.0, 0.88, 1.10))
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.inputs["Base Color"], res)
    bsdf.inputs["Roughness"].default_value = 0.5
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    return mat


def materials():
    """Create or refresh the three frond materials; returns them in slot order (MATERIAL_NAMES)."""
    leaf = _leaf_material(MATERIAL_NAMES[0],
                          ((0.0, (0.082, 0.112, 0.018)), (0.5, (0.170, 0.170, 0.028)), (1.0, (0.275, 0.237, 0.040))),
                          (0.32, 0.31, 0.11), (0.38, 0.58), 0.14, (0.17, 0.18, 0.04))
    rachis = _rachis_material(MATERIAL_NAMES[1])
    dead = _leaf_material(MATERIAL_NAMES[2],
                          ((0.0, (0.15, 0.095, 0.050)), (0.5, (0.28, 0.19, 0.095)), (1.0, (0.40, 0.30, 0.16))),
                          (0.42, 0.33, 0.19), (0.70, 0.80), 0.08, (0.30, 0.20, 0.10))
    return [leaf, rachis, dead]


# ---------------------------------------------------------------- geometry


def _rachis_table(length, elev, droop, curl):
    """Points and slope angles (rad) of the rachis centre line at TABLE + 1 even steps of arc length."""
    pts, p = [Vector((0.0, 0.0, 0.0))], Vector((0.0, 0.0, 0.0))
    ds = length / TABLE
    for i in range(TABLE):
        a = elev - droop * ((i + 0.5) / TABLE) ** curl
        p = p + Vector((math.cos(a), 0.0, math.sin(a))) * ds
        pts.append(p.copy())
    return pts, [elev - droop * (i / TABLE) ** curl for i in range(TABLE + 1)]


def _sample(table, t):
    pts, angs = table
    x = min(max(t, 0.0), 1.0) * TABLE
    i = min(int(x), TABLE - 1)
    f = x - i
    return pts[i].lerp(pts[i + 1], f), angs[i] + (angs[i + 1] - angs[i]) * f


def _frame(a, roll):
    """Tangent, side (+y rolled) and up of the rachis at slope a (rad) and roll (rad) about the tangent."""
    t = Vector((math.cos(a), 0.0, math.sin(a)))
    up = Vector((-math.sin(a), 0.0, math.cos(a)))
    side = Vector((0.0, 1.0, 0.0))
    return t, side * math.cos(roll) + up * math.sin(roll), up * math.cos(roll) - side * math.sin(roll)


def _toward(a, b, ang, cap=0.95):
    """a turned toward b by ang (rad), never past cap of the angle between them."""
    perp = b - a * a.dot(b)
    if perp.length < 1e-6 or ang <= 0.0:
        return a.copy()
    ang = min(ang, math.acos(max(-1.0, min(1.0, a.dot(b)))) * cap)
    return (a * math.cos(ang) + perp.normalized() * math.sin(ang)).normalized()


def rachis_point(length, base_elev_deg, droop_deg, t, age="mature"):
    """The rachis centre at fraction t of the length, in the frond's local frame (for tests and the composer)."""
    table = _rachis_table(length, math.radians(base_elev_deg), math.radians(droop_deg), AGES[age]["curl"])
    return _sample(table, t)[0]


def build_frond(bm, rng, matrix, *, length, base_elev_deg, droop_deg, age="mature", leaflets=None, leaflet_max=None,
                leaflet_width=None, v_angle_deg=None, petiole_frac=None, slot0=0):
    """One frond into bm (see the module header). leaflets: leaflets per side; leaflet_max / leaflet_width: the longest
    leaflet's length and the widest blade (m); v_angle_deg: leaflet V above the leaf plane; petiole_frac: the bare
    petiole's share of length. None derives each from length and age. Returns {"tris", "tip", "base"} (world)."""
    c = AGES[age]
    dead = age == "dead"
    tp = petiole_frac if petiole_frac is not None else (0.15 if age == "young" else 0.16)
    n_side = leaflets if leaflets is not None else max(8, min(80, round(24.0 * length * (1.0 - tp))))
    l_max = (leaflet_max if leaflet_max is not None else 0.32 * length) * c["len"]
    w_max = (leaflet_width if leaflet_width is not None else 0.012 + 0.011 * length) * c["width"]
    v_ang = math.radians(v_angle_deg if v_angle_deg is not None else c["v"])
    m = 6 if length >= 1.8 else 5                                   # leaflet segments
    table = _rachis_table(length, math.radians(base_elev_deg), math.radians(droop_deg), c["curl"])
    roll_tip = math.radians(rng.uniform(0.35, 1.0) * c["roll"]) * rng.choice((-1.0, 1.0))
    gravity = (matrix.to_3x3().inverted_safe() @ Vector((0.0, 0.0, -1.0))).normalized()
    tint_frond = rng.uniform(-0.08, 0.08)
    droop_frond = rng.uniform(0.85, 1.15)                          # some fronds limper than others
    s_leaf, s_rachis = slot0 + (2 if dead else 0), slot0 + (2 if dead else 1)
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
    tint = bm.faces.layers.float.get(TINT) or bm.faces.layers.float.new(TINT)
    tris = 0

    def vert(p):
        return bm.verts.new(matrix @ p)

    def face(vs, uvs, slot, shade):
        nonlocal tris
        f = bm.faces.new(vs)
        f.material_index = slot
        f.smooth = True
        f[tint] = shade
        for lp, co in zip(f.loops, uvs):
            lp[uv].uv = co
        tris += len(vs) - 2
        return f

    # -- the petiole and rachis: SECTION rings along the centre line, flared at the base, closing to a point at the tip
    w0 = 0.016 + 0.018 * length
    n_r = max(8, int(4.0 * length) + 4)
    ts = [0.0, 0.025, 0.05] + [0.05 + 0.95 * (j / (n_r - 2)) ** 0.9 for j in range(1, n_r - 1)]
    rachis_tint = min(1.0, max(0.0, 0.5 + tint_frond * 3.0))
    rings = []
    for t in ts[:-1]:
        p, a = _sample(table, t)
        _, side, up = _frame(a, roll_tip * t * t)
        w = w0 * (1.0 - 0.88 * t ** 0.75) * (1.0 + 0.35 * max(0.0, 1.0 - t / 0.05))
        h = w * (0.85 - 0.25 * t)
        rings.append([vert(p + side * (sx * w) + up * (sy * h)) for sx, sy in SECTION])
    tip_local = _sample(table, 1.0)[0]
    tip = vert(tip_local)
    k = len(SECTION)
    face(rings[0], [(j / k, 0.0) for j in range(k)], s_rachis, rachis_tint)           # the cut base faces back
    for r, (ra, rb) in enumerate(zip(rings, rings[1:])):
        for j in range(k):
            j1 = (j + 1) % k
            face((ra[j], rb[j], rb[j1], ra[j1]), [(j / k, ts[r]), (j / k, ts[r + 1]), ((j + 1) / k, ts[r + 1]),
                                                   ((j + 1) / k, ts[r])], s_rachis, rachis_tint)
    for j in range(k):
        j1 = (j + 1) % k
        face((rings[-1][j], tip, rings[-1][j1]), [(j / k, ts[-2]), ((j + 0.5) / k, 1.0), ((j + 1) / k, ts[-2])],
             s_rachis, rachis_tint)

    # -- leaflets
    us = [(i / m) ** 0.9 for i in range(m + 1)]

    def blade(p0, d0, fwd, n0, length_l, width, gmax, kappa, twist, shade):
        """A creased blade from p0 along d0, arcing toward fwd by kappa and bending toward gravity by up to gmax at the
        tip; n0 is the leaf-plane normal at the base (the crease opens toward it)."""
        def heading(u):
            return _toward(_toward(d0, fwd, kappa * u), gravity, gmax * u ** 1.5)

        w_dir = d0.cross(n0).normalized()
        pos, rows = p0.copy(), []
        for i, u in enumerate(us):
            if i:
                pos = pos + heading(0.5 * (u + us[i - 1])) * (length_l * (u - us[i - 1]))
            d = heading(u)
            w_dir = (w_dir - d * w_dir.dot(d)).normalized()
            n_dir = w_dir.cross(d)
            tw = twist * u
            wd, nd = w_dir * math.cos(tw) + n_dir * math.sin(tw), n_dir * math.cos(tw) - w_dir * math.sin(tw)
            if i == m:
                rows.append(vert(pos))
                break
            half = 0.5 * width * min(1.0, 0.22 + 5.0 * u) * (1.0 - u ** 2.0)
            lift = nd * (c["fold"] * half)
            rows.append((vert(pos - wd * half + lift), vert(pos), vert(pos + wd * half + lift)))
        for i in range(m - 1):
            a, b = rows[i], rows[i + 1]
            face((a[0], a[1], b[1], b[0]), [(0.0, us[i]), (0.5, us[i]), (0.5, us[i + 1]), (0.0, us[i + 1])], s_leaf,
                 shade)
            face((a[1], a[2], b[2], b[1]), [(0.5, us[i]), (1.0, us[i]), (1.0, us[i + 1]), (0.5, us[i + 1])], s_leaf,
                 shade)
            e = bm.edges.get((a[1], b[1]))
            if e is not None:
                e.smooth = False                                       # the midrib crease stays crisp
        a, t_ = rows[m - 1], rows[m]
        face((a[0], a[1], t_), [(0.0, us[m - 1]), (0.5, us[m - 1]), (0.5, 1.0)], s_leaf, shade)
        face((a[1], a[2], t_), [(0.5, us[m - 1]), (1.0, us[m - 1]), (0.5, 1.0)], s_leaf, shade)

    lo_t, hi_t = c["tint"]
    for side_sign in (-1.0, 1.0):
        for i in range(n_side):
            q = min(0.995, max(0.0, (i + 0.5 + 0.25 * side_sign + rng.uniform(-0.3, 0.3)) / n_side))
            if rng.random() < c["missing"]:
                continue
            t = tp + (0.99 - tp) * q
            p, a = _sample(table, t)
            fwd, side, up = _frame(a, roll_tip * t * t)
            w_r = w0 * (1.0 - 0.88 * t ** 0.75)
            p0 = p + side * (side_sign * 0.32 * w_r) + up * (0.10 * w_r)
            s = math.sin(math.pi * q ** 0.75)                            # longest ~40 % along the leaflet zone
            floor = 0.30 + (0.10 - 0.30) * q
            length_l = l_max * (floor + (1.0 - floor) * s ** 0.9) * rng.uniform(0.9, 1.08)
            if dead and rng.random() < 0.2:
                length_l *= rng.uniform(0.45, 0.9)                       # broken dead leaflets
            phi = math.radians((68.0 - 34.0 * q ** 1.1) * c["spread"] + rng.uniform(-6.0, 6.0))
            beta = v_ang + math.radians(rng.uniform(-9.0, 9.0))
            lateral = side * side_sign
            d0 = (fwd * math.cos(phi) + (lateral * math.cos(beta) + up * math.sin(beta)) * math.sin(phi)).normalized()
            n0 = fwd.cross(d0).normalized()
            if n0.dot(up) < 0.0:
                n0 = -n0
            gmax = math.radians(c["droop"]) * (0.7 + 0.5 * q) * (length_l / max(l_max, 1e-6)) ** 0.45 \
                * rng.uniform(0.9, 1.1) * droop_frond
            kappa = math.radians(rng.uniform(4.0, 12.0))
            twist = math.radians(rng.gauss(0.0, c["twist"]))
            shade = min(1.0, max(0.0, rng.uniform(lo_t, hi_t) + tint_frond))
            if rng.random() < c["split"]:                                # torn: two narrow blades from one base
                for sgn, ls in ((-1.0, 0.97), (1.0, 0.82)):
                    dd = _toward(d0, fwd * sgn, math.radians(rng.uniform(3.0, 6.0)))
                    blade(p0, dd, fwd, n0, length_l * ls, w_max * 0.55, gmax, kappa, twist, shade)
            else:
                blade(p0, d0, fwd, n0, length_l, w_max * rng.uniform(0.9, 1.08), gmax, kappa, twist, shade)
    return {"tris": tris, "tip": matrix @ tip_local, "base": matrix @ Vector((0.0, 0.0, 0.0))}


# ---------------------------------------------------------------- test renders (python palm_frond.py -- out=<dir>)

TEST_COLL = "RBP_palm_frond_test"
ORIGIN = Vector((40.0, -45.0, 0.0))
GOLDEN = math.radians(137.508)


def _test_mesh(name, coll, build, extra_mats=()):
    bm = bmesh.new()
    info = build(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mat in materials() + list(extra_mats):
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob, info


def _pole(bm, at, height, r0, r1, slot, sides=10):
    rings = []
    for j in range(5):
        t = j / 4
        r = r0 + (r1 - r0) * t
        rings.append([bm.verts.new(at + Vector((r * math.cos(2 * math.pi * s / sides),
                                                 r * math.sin(2 * math.pi * s / sides), height * t)))
                      for s in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for s in range(sides):
            bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s])).material_index = slot
    bm.faces.new(rings[-1]).material_index = slot


def _trunk_material():
    name = "RBP_palm_frond_test_trunk"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.20, 0.16, 0.12, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def _crown(bm, rng, top, n=14):
    """A test crown: n fronds on a golden-angle spiral, youngest upright at the top, the oldest hanging dead."""
    total, specs = 0, []
    for i in range(n):
        f = i / (n - 1)
        if i >= n - 2:
            age, elev, droop, ln = "dead", rng.uniform(-78.0, -68.0), rng.uniform(4.0, 10.0), rng.uniform(2.8, 3.2)
        elif f < 0.12:
            age, elev, droop, ln = "young", 82.0 - 6.0 * i, 12.0, rng.uniform(2.9, 3.2)
        elif f < 0.62:
            age, elev, droop, ln = "mature", 66.0 - 60.0 * f, 45.0 + 40.0 * f, rng.uniform(3.2, 3.6)
        else:
            age, elev, droop, ln = "old", 30.0 - 45.0 * f, 85.0 + 20.0 * f, rng.uniform(3.2, 3.5)
        az = i * GOLDEN + rng.uniform(-0.15, 0.15)
        z = top.z - 0.35 * f
        radial = Vector((math.cos(az), math.sin(az), 0.0))
        M = Matrix.Translation(Vector((top.x, top.y, z)) + radial * 0.10) @ Matrix.Rotation(az, 4, "Z")
        info = build_frond(bm, rng, M, length=ln, base_elev_deg=elev, droop_deg=droop, age=age)
        total += info["tris"]
        specs.append((age, round(elev), round(droop), round(ln, 2), info["tris"]))
    return {"tris": total, "fronds": specs}


def _aim(cam, loc, target, vfov):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(vfov)


def _test(argv):
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    assert "INSPECTION_RIG" in bpy.data.collections, "open terramar_building.blend (its INSPECTION_RIG lights the test)"
    out = os.path.abspath(opts.get("out", "."))
    os.makedirs(out, exist_ok=True)
    shots = set(opts.get("shots", "row,sizes,crown_street,crown_side,crown_b8,close,close_back").split(","))
    scene = bpy.context.scene
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from render_inspection import use_gpu                       # the parent folder's GPU picker
    device = use_gpu(scene)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    guides = bpy.context.view_layer.layer_collection.children.get("RB_PLAN_GUIDES")
    if guides is not None:
        guides.exclude = True
    coll = bpy.data.collections.new(TEST_COLL)
    scene.collection.children.link(coll)
    trunk_mat = _trunk_material()
    report = {}

    # (1) the four ages side by side on poles, 3.5 m fronds reaching right and a little away
    row = ORIGIN + Vector((-7.0, 0.0, 0.0))
    ages = ("young", "mature", "old", "dead")
    pose = {"young": (80.0, 12.0), "mature": (40.0, 70.0), "old": (10.0, 100.0), "dead": (-72.0, 6.0)}

    def build_row(bm):
        rng, out_info = random.Random("frond-row"), {}
        for j, age in enumerate(ages):
            base = row + Vector((2.0 + 4.3 * j, 0.0, 4.5))
            _pole(bm, base - Vector((0.0, 0.0, 4.5)), 4.5, 0.07, 0.05, 3)
            M = Matrix.Translation(base) @ Matrix.Rotation(math.radians(25.0), 4, "Z")
            out_info[age] = build_frond(bm, rng, M, length=3.5, base_elev_deg=pose[age][0], droop_deg=pose[age][1],
                                        age=age)["tris"]
        return out_info

    _, report["row_tris"] = _test_mesh("frond_test_row", coll, build_row, [trunk_mat])

    # sizes: mature fronds 0.9 / 1.8 / 2.8 / 4.0 m
    srow = ORIGIN + Vector((-7.0, 14.0, 0.0))

    def build_sizes(bm):
        rng, out_info = random.Random("frond-sizes"), {}
        for x, ln in zip((1.5, 3.5, 6.6, 10.4), (0.9, 1.8, 2.8, 4.0)):
            base = srow + Vector((x, 0.0, 3.0))
            _pole(bm, base - Vector((0.0, 0.0, 3.0)), 3.0, 0.05, 0.04, 3)
            M = Matrix.Translation(base) @ Matrix.Rotation(math.radians(25.0), 4, "Z")
            out_info[str(ln)] = build_frond(bm, rng, M, length=ln, base_elev_deg=35.0, droop_deg=65.0)["tris"]
        return out_info

    _, report["size_tris"] = _test_mesh("frond_test_sizes", coll, build_sizes, [trunk_mat])

    # (2) a test crown on a 9 m stick, well clear of the row
    ctr = ORIGIN + Vector((0.0, 34.0, 0.0))
    top = ctr + Vector((0.0, 0.0, 9.0))

    def build_crown(bm):
        _pole(bm, ctr, 9.05, 0.20, 0.16, 3)
        return _crown(bm, random.Random("frond-crown"), top)

    _, report["crown"] = _test_mesh("frond_test_crown", coll, build_crown, [trunk_mat])

    # (3) a lone mature frond for the leaflet close-ups
    cl = ORIGIN + Vector((14.0, 0.0, 2.2))
    M_cl = Matrix.Translation(cl) @ Matrix.Rotation(math.radians(90.0), 4, "Z")

    def build_close(bm):
        return build_frond(bm, random.Random("frond-close"), M_cl, length=3.5, base_elev_deg=30.0, droop_deg=55.0)

    ob, info = _test_mesh("frond_test_close", coll, build_close)
    report["close_tris"] = info["tris"]
    attr = ob.data.attributes.get(TINT)
    report["rb_tint"] = (attr.domain, attr.data_type) if attr else None
    report["uv"] = [u.name for u in ob.data.uv_layers]
    report["slots"] = sorted({p.material_index for p in ob.data.polygons})
    mid = M_cl @ rachis_point(3.5, 30.0, 55.0, 0.48)

    cam = bpy.data.objects.new("frond_test_cam", bpy.data.cameras.new("frond_test_cam"))
    cam.data.clip_start = 0.02
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {                                                   # name: (subject, camera, target, vfov[, resolution])
        "row": ("row", row + Vector((8.5, -10.0, 5.6)), row + Vector((8.5, 0.0, 4.6)), 48.0),
        "sizes": ("sizes", srow + Vector((7.6, -10.0, 4.0)), srow + Vector((7.6, 0.0, 3.0)), 42.0),
        "crown_street": ("crown", ctr + Vector((-5.0, -15.0, 1.7)), top + Vector((0.0, 0.0, -0.6)), 30.0),
        "crown_side": ("crown", ctr + Vector((3.0, -17.0, 10.0)), top + Vector((0.0, 0.0, -0.8)), 24.0),
        "crown_b8": ("crown", ctr + Vector((-10.0, -44.0, 1.7)), top + Vector((0.0, 0.0, -1.5)), 48.0, (1122, 1402)),
        "close": ("close", mid + Vector((1.6, -2.0, 0.5)), mid + Vector((-0.3, 0.4, -0.25)), 35.0),
        "close_back": ("close", mid + Vector((-0.9, 1.5, -0.6)), mid + Vector((0.0, 0.0, -0.1)), 40.0),
    }
    for name, (subject, loc, target, vfov, *res) in views.items():
        if name not in shots:
            continue
        for ob in coll.objects:                                 # one test subject per shot, the others hidden
            ob.hide_render = ob.name != f"frond_test_{subject}"
        scene.render.resolution_x, scene.render.resolution_y = res[0] if res else (1600, 900)
        _aim(cam, loc, target, vfov)
        scene.render.filepath = os.path.join(out, f"frond_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name} on {device} -> {scene.render.filepath}")
    print("FROND_REPORT", report)


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
