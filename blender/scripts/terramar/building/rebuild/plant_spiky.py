# plant_spiky.py -- user fix 12 (2026-10-15): the spiky rosette (yucca / dracaena look) with real keeled leaves, for
# proc_plants.py.
#
# Replaces proc_plants.py's spiky rosette (each blade two flat faces) in the roof's feature clusters: b8 shows spiky
# rosettes (yucca-like) behind the roof guard against the sky. One mesh per plant, base at the origin (the soil at z 0):
#   trunk    a short trunk (plant_cycad.armoured_trunk with fine, shallow leaf-scar cells), closed under the head
#   head     70-90 sword leaves on a golden-angle spiral round a short head: the youngest near upright in the centre,
#            the mature ones spreading, the oldest lower, shorter and drooping, 1-3 dead ones (straw brown) hanging under
#            the head; seeded lengths, angles, droops, twists and tints
#   leaf     a long tapered blade: a pale clasping base, widest about a quarter along, tapering straight to a sharp
#            brown terminal spine; keeled (a V cross-section, the keel below, the margins raised into a channel that
#            flattens toward the tip), stiff near the base and bending under its weight toward the tip, slightly twisted
# Faces: slot0 + 0 leaves (RBP_spiky_leaf_foliage: parallel veins, a paler base, a faint pale margin, a brown spine, a
# paler duller underside, translucency), + 1 dead leaves (RBP_spiky_dead_foliage), + 2 trunk (plant_cycad's
# RBP_cycad_bark). UVs u across the blade (keel at 0.5), v along. About 9-12k triangles.
#   build_spiky(bm, rng, slot0=0)   returns {"tris", "height", "radius", "leaves", "dead", "trunk"}
#   materials()   the three slot materials (MATERIAL_NAMES order)
import math

from mathutils import Matrix, Vector

import plant_cycad as PC
import plant_shading as SH

MATERIAL_NAMES = ("RBP_spiky_leaf_foliage", "RBP_spiky_dead_foliage", PC.MATERIAL_NAMES[2])
TINT = SH.TINT
GOLDEN = 2.399963229728653
US = (0.0, 0.2, 0.38, 0.5, 0.62, 0.8, 1.0)         # across the blade (keel 0.5)
STATIONS = 11                                      # rows along a leaf


def materials():
    """Create or refresh the slot materials (MATERIAL_NAMES order); the bark is plant_cycad's."""
    leaf = SH.leaf_material(MATERIAL_NAMES[0],
                            ((0.0, (0.030, 0.062, 0.030)), (0.5, (0.055, 0.092, 0.036)), (1.0, (0.105, 0.130, 0.040))),
                            midrib_rgb=(0.085, 0.11, 0.045), rough=(0.36, 0.60), translucency=0.14,
                            viewport_rgb=(0.06, 0.09, 0.04), veins="parallel", vein_count=22.0, vein_strength=0.05,
                            bump=0.08, midrib_width=0.03, margin_rgb=(0.17, 0.16, 0.07), base_rgb=(0.20, 0.19, 0.11),
                            base_len=0.10, tip_rgb=(0.16, 0.10, 0.05), tip_len=0.05, under=(0.75, 1.15))
    dead = SH.leaf_material(MATERIAL_NAMES[1],
                            ((0.0, (0.11, 0.075, 0.040)), (0.5, (0.22, 0.16, 0.085)), (1.0, (0.33, 0.25, 0.14))),
                            midrib_rgb=(0.30, 0.23, 0.13), rough=(0.70, 0.80), translucency=0.06,
                            viewport_rgb=(0.25, 0.18, 0.09), veins="parallel", vein_count=22.0, vein_strength=0.08,
                            bump=0.10, midrib_width=0.03)
    bark = PC.materials()[2]
    return [leaf, dead, bark]


def _toward(a, b, ang):
    perp = b - a * a.dot(b)
    if perp.length < 1e-6 or ang <= 0.0:
        return a.copy()
    ang = min(ang, math.acos(max(-1.0, min(1.0, a.dot(b)))) * 0.97)
    return (a * math.cos(ang) + perp.normalized() * math.sin(ang)).normalized()


def _leaf(bm, uv, tint, p0, d0, length, width, droop, twist, fold, slot, shade):
    """One sword leaf from p0 along d0 (module header). Returns its triangles."""
    down = Vector((0.0, 0.0, -1.0))
    w = d0.cross(Vector((0.0, 0.0, 1.0)))
    w = w.normalized() if w.length > 1e-4 else Vector((1.0, 0.0, 0.0))
    pos, rows = p0.copy(), []
    ts = [(i / STATIONS) ** 0.85 for i in range(STATIONS + 1)]
    for i, t in enumerate(ts):
        d = _toward(d0, down, droop * t ** 1.6)
        if i:
            dm = _toward(d0, down, droop * (0.5 * (t + ts[i - 1])) ** 1.6)
            pos = pos + dm * (length * (t - ts[i - 1]))
        if i == STATIONS:
            rows.append(bm.verts.new(pos))
            break
        wd = (w - d * w.dot(d)).normalized()
        wd = Matrix.Rotation(twist * t, 3, d) @ wd
        nd = wd.cross(d).normalized()
        if nd.z < 0.0 and d.z > -0.7:
            nd, wd = -nd, -wd                                                # the channel opens upward
        half = 0.5 * width * (0.55 + 0.45 * min(1.0, t / 0.22)) * (1.0 if t < 0.22 else (1.0 - t) / 0.78) ** 0.9
        f = fold * (1.0 - 0.6 * t)
        rows.append([bm.verts.new(pos + wd * ((2.0 * u - 1.0) * half) + nd * (f * abs(2.0 * u - 1.0) * half))
                     for u in US])
    tris = 0

    def face(vs, uvs):
        nonlocal tris
        fc = bm.faces.new(vs)
        fc.material_index, fc.smooth, fc[tint] = slot, True, shade
        for lp, co in zip(fc.loops, uvs):
            lp[uv].uv = co
        tris += len(vs) - 2

    k = len(US) - 1
    for i in range(STATIONS - 1):
        for j in range(k):
            face((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]),
                 [(US[j], ts[i]), (US[j + 1], ts[i]), (US[j + 1], ts[i + 1]), (US[j], ts[i + 1])])
        e = bm.edges.get((rows[i][k // 2], rows[i + 1][k // 2]))
        if e is not None:
            e.smooth = False                                                 # the keel stays crisp
    i = STATIONS - 1
    for j in range(k):
        face((rows[i][j], rows[i][j + 1], rows[STATIONS]), [(US[j], ts[i]), (US[j + 1], ts[i]), (0.5, 1.0)])
    return tris


def build_spiky(bm, rng, slot0=0):
    """One rosette into bm (see the module header)."""
    ht = rng.uniform(0.50, 0.75)
    top, r_top, tris, ring = PC.armoured_trunk(bm, rng, height=ht, r0=rng.uniform(0.06, 0.07),
                                               r1=rng.uniform(0.048, 0.055), lean=rng.uniform(0.0, 0.05),
                                               slot=slot0 + 2, around=17, pitch=0.018, relief=0.05, sides=24,
                                               bulge=0.03)
    tris += PC._dome(bm, ring, top, 0.05, slot0 + 2, 0.5)
    uv = bm.loops.layers.uv.active
    tint = bm.faces.layers.float.get(TINT)
    n = rng.randint(70, 90)
    n_dead = rng.randint(1, 3)
    for i in range(n + n_dead):
        dead = i >= n
        f = min(1.0, i / (n - 1))
        az = i * GOLDEN + rng.uniform(-0.12, 0.12)
        radial = Vector((math.cos(az), math.sin(az), 0.0))
        if dead:
            elev, droop = rng.uniform(-62.0, -42.0), rng.uniform(0.0, 10.0)
            ln, z = rng.uniform(0.38, 0.5), top.z - 0.02
        else:
            elev = 86.0 - 80.0 * f ** 1.2 + rng.uniform(-5.0, 5.0)
            droop = 5.0 + 45.0 * f ** 1.5 + rng.uniform(-5.0, 5.0)
            ln = rng.uniform(0.50, 0.65) * (1.0 - 0.40 * f ** 2) * (0.75 if f < 0.08 else 1.0)
            z = top.z + 0.05 - 0.07 * f
        d0 = (radial * math.cos(math.radians(elev)) + Vector((0.0, 0.0, 1.0)) * math.sin(math.radians(elev))).normalized()
        p0 = Vector((top.x, top.y, z)) + radial * (r_top * (0.3 + 0.5 * f))
        width = rng.uniform(0.045, 0.06)
        shade = min(1.0, max(0.0, rng.uniform(0.2, 0.75) + 0.2 * f))
        tris += _leaf(bm, uv, tint, p0, d0, ln, width, math.radians(droop), math.radians(rng.gauss(0.0, 14.0)),
                      0.45 if not dead else 0.2, slot0 + (1 if dead else 0), shade)
    pts = [v.co for v in bm.verts]
    return {"tris": tris, "height": round(max(p.z for p in pts), 3),
            "radius": round(max(math.hypot(p.x, p.y) for p in pts), 3), "leaves": n, "dead": n_dead,
            "trunk": round(ht, 3)}
