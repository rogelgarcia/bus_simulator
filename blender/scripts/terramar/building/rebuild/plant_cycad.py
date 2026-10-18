# plant_cycad.py -- user fix 12 (2026-10-15): the cycad (sago-palm look) with real pinnate leaves, for proc_plants.py.
#
# Replaces proc_plants.py's folded-strip cycad (each frond one strip), which stands in the entrance pots outside the
# portal (site) and in the roof's feature clusters (props). The user (fix 12): "keep them but improve the geometry; use
# actual leaves, and not simplified geometry (just like you did for the palm trees)". One mesh per plant, base at the
# origin (the soil at z 0):
#   trunk    a short stout trunk armoured with diamond leaf bases (a lattice of two parastichy families, each base a
#            low pyramid between grooves; the geometry writes each vertex's relief into the point attribute rb_relief,
#            so the bark material darkens the grooves), slightly bulging and leaning, closed by a woolly felt dome
#   fronds   palm_frond.build_frond with the "cycad" age registered below: a stiff arching rachis with a short bare
#            petiole and 40-60 narrow, keeled, sharply pointed leaflets per side, set forward in a shallow V and barely
#            drooping (Cycas leaflets are stiff), short at both ends; 2 flushes on a golden-angle spiral out of the felt:
#            the young flush near upright and paler, the mature fronds arching out, the oldest lowest and limpest;
#            seeded lengths, angles, jitter and tints, the bases inside the felt dome so nothing floats
# Faces: slot0 + 0 leaflets (RBP_cycad_leaflet_foliage: glossy dark green, paler midrib, paler duller underside, a
# little translucent), + 1 rachis (RBP_cycad_rachis), + 2 trunk (RBP_cycad_bark), + 3 felt (RBP_cycad_felt). UVs as
# palm_frond.py on the fronds; u round, v up (metres) on the trunk. About 47-54k triangles (leaflets ~95 %).
#   build_cycad(bm, rng, slot0=0)   returns {"tris", "height", "radius", "fronds", "trunk"}
#   materials()   the four slot materials (MATERIAL_NAMES order)
#   armoured_trunk(bm, ...)   the trunk builder, shared with plant_spiky.py
import math

from mathutils import Matrix, Vector

import palm_frond as PF
import plant_shading as SH

MATERIAL_NAMES = ("RBP_cycad_leaflet_foliage", "RBP_cycad_rachis", "RBP_cycad_bark", "RBP_cycad_felt")
TINT = SH.TINT
GOLDEN = 2.399963229728653
# palm_frond's per-age leaflet behaviour for a cycad frond (see palm_frond.AGES): leaflets keeled in a shallow V,
# set well forward, stiff (little gravity bend), finely creased, hardly twisted, almost none missing or split.
CYCAD_AGE = {"v": 28.0, "spread": 0.85, "droop": 9.0, "fold": 0.42, "len": 1.0, "width": 1.0, "twist": 3.0,
             "missing": 0.004, "split": 0.0, "tint": (0.20, 0.70), "curl": 1.5, "roll": 10.0}
PF.AGES.setdefault("cycad", CYCAD_AGE)


def materials():
    """Create or refresh the slot materials (MATERIAL_NAMES order)."""
    leaflet = SH.leaf_material(MATERIAL_NAMES[0],
                               ((0.0, (0.022, 0.045, 0.012)), (0.5, (0.038, 0.068, 0.018)), (1.0, (0.070, 0.098, 0.026))),
                               midrib_rgb=(0.10, 0.14, 0.05), rough=(0.26, 0.55), translucency=0.10,
                               viewport_rgb=(0.04, 0.07, 0.02), midrib_width=0.06, under=(0.70, 1.20), bump=0.05)
    rachis = SH.stem_material(MATERIAL_NAMES[1], ((0.0, (0.16, 0.12, 0.07)), (0.12, (0.09, 0.10, 0.04)),
                                                  (1.0, (0.055, 0.085, 0.025))), rough=0.45,
                              viewport_rgb=(0.06, 0.09, 0.03))
    bark = SH.bark_material(MATERIAL_NAMES[2], ((0.0, (0.035, 0.028, 0.022)), (0.45, (0.11, 0.085, 0.060)),
                                                (1.0, (0.22, 0.18, 0.13))), rough=0.9, grain=90.0, bump=0.6)
    felt = SH.bark_material(MATERIAL_NAMES[3], ((0.0, (0.12, 0.07, 0.035)), (1.0, (0.30, 0.19, 0.10))), rough=1.0,
                            grain=260.0, bump=0.3, viewport_rgb=(0.25, 0.16, 0.08))
    return [leaflet, rachis, bark, felt]


def armoured_trunk(bm, rng, *, height, r0, r1, lean, slot, around=13, pitch=0.035, relief=0.08, sides=40,
                   bulge=0.06):
    """A trunk from z 0 to height (r0 -> r1, bulging by bulge mid-way, its top offset lean along a seeded direction),
    its surface a diamond lattice of leaf bases: `around` bases round it, one row every `pitch` metres up each spiral,
    each base raised by relief x r between grooves. No caps. Returns (top centre, top radius, triangles, top ring)."""
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
    tint = bm.faces.layers.float.get(TINT) or bm.faces.layers.float.new(TINT)
    relief_l = bm.verts.layers.float.get(SH.RELIEF) or bm.verts.layers.float.new(SH.RELIEF)
    az = rng.uniform(0.0, 2.0 * math.pi)
    lean_dir = Vector((math.cos(az), math.sin(az), 0.0))
    phase = rng.uniform(0.0, 1.0)
    rings_n = max(6, int(height / (pitch * 0.5)))
    zs = [height * j / rings_n for j in range(rings_n + 1)]

    def bump(a, c):
        fp = (a + c + phase) % 1.0 - 0.5
        fq = (a - c) % 1.0 - 0.5
        return max(0.0, 1.0 - 2.0 * max(abs(fp), abs(fq)))

    rings = []
    for z in zs:
        t = z / height
        r = (r0 + (r1 - r0) * t) * (1.0 + bulge * math.sin(math.pi * t))
        ctr = lean_dir * (lean * t * t) + Vector((0.0, 0.0, z))
        row = []
        for k in range(sides):
            th = 2.0 * math.pi * k / sides
            a = around * th / (2.0 * math.pi)
            b = bump(a, z / pitch) ** 0.8
            rr = r * (1.0 + relief * (b - 0.5) * min(1.0, 4.0 * t + 0.3))
            v = bm.verts.new(ctr + Vector((rr * math.cos(th), rr * math.sin(th), 0.0)))
            v[relief_l] = b
            row.append(v)
        rings.append(row)
    tris = 0
    for j in range(rings_n):
        for k in range(sides):
            k1 = (k + 1) % sides
            f = bm.faces.new((rings[j][k], rings[j][k1], rings[j + 1][k1], rings[j + 1][k]))
            f.material_index = slot
            f.smooth = True
            th = 2.0 * math.pi * (k + 0.5) / sides
            f[tint] = 0.5
            for lp, (u, v) in zip(f.loops, ((k / sides, zs[j]), ((k + 1) / sides, zs[j]), ((k + 1) / sides, zs[j + 1]),
                                            (k / sides, zs[j + 1]))):
                lp[uv].uv = (u, v)
            tris += 2
    top_r = r1 * (1.0 + relief * 0.5)
    return lean_dir * lean + Vector((0.0, 0.0, height)), top_r, tris, rings[-1]


def _dome(bm, ring, centre, height, slot, shade):
    """Close a trunk's top ring with a low dome (two rings and a pole)."""
    uv = bm.loops.layers.uv.active
    tint = bm.faces.layers.float.get(TINT)
    relief_l = bm.verts.layers.float.get(SH.RELIEF)
    prev, tris = ring, 0
    for f_r, f_z in ((0.75, 0.55), (0.40, 0.90)):
        row = [bm.verts.new(centre + (v.co - centre) * f_r + Vector((0.0, 0.0, height * f_z))) for v in ring]
        for v in row:
            v[relief_l] = shade
        for k in range(len(ring)):
            k1 = (k + 1) % len(ring)
            f = bm.faces.new((prev[k], prev[k1], row[k1], row[k]))
            f.material_index, f.smooth, f[tint] = slot, True, shade
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x * 4.0, lp.vert.co.y * 4.0)
            tris += 2
        prev = row
    pole = bm.verts.new(centre + Vector((0.0, 0.0, height)))
    pole[relief_l] = shade
    for k in range(len(ring)):
        f = bm.faces.new((prev[k], prev[(k + 1) % len(ring)], pole))
        f.material_index, f.smooth, f[tint] = slot, True, shade
        for lp in f.loops:
            lp[uv].uv = (lp.vert.co.x * 4.0, lp.vert.co.y * 4.0)
        tris += 1
    return tris


def build_cycad(bm, rng, slot0=0):
    """One cycad into bm (see the module header)."""
    ht = rng.uniform(0.30, 0.42)
    r0, r1 = rng.uniform(0.13, 0.15), rng.uniform(0.11, 0.125)
    top, r_top, tris, ring = armoured_trunk(bm, rng, height=ht, r0=r0, r1=r1, lean=rng.uniform(0.0, 0.05),
                                            slot=slot0 + 2)
    tris += _dome(bm, ring, top, 0.07, slot0 + 3, 0.6)
    n = rng.randint(28, 34)
    young = rng.randint(5, 7)
    fronds = 0
    for i in range(n):
        f = i / (n - 1)
        az = i * GOLDEN + rng.uniform(-0.18, 0.18)
        if i < young:                                         # the young flush: near upright, barely arching
            elev, droop, ln = rng.uniform(78.0, 85.0), rng.uniform(12.0, 22.0), rng.uniform(0.95, 1.12)
            rc, z = 0.25 * r_top, top.z + 0.05
        else:                                                 # mature to old: lower, arching out, the oldest limpest
            g = (i - young) / max(1, n - young - 1)
            elev = 74.0 - 26.0 * g + rng.uniform(-3.0, 3.0)
            droop = 24.0 + 30.0 * g + rng.uniform(-4.0, 4.0)
            ln = rng.uniform(0.95, 1.15) * (1.0 - 0.12 * g)
            rc, z = (0.45 + 0.3 * g) * r_top, top.z + 0.04 - 0.035 * g
        radial = Vector((math.cos(az), math.sin(az), 0.0))
        M = Matrix.Translation(Vector((top.x, top.y, z)) + radial * rc) @ Matrix.Rotation(az, 4, "Z")
        tp = 0.20
        info = PF.build_frond(bm, rng, M, length=ln, base_elev_deg=elev, droop_deg=droop, age="cycad",
                              leaflets=max(30, round(50.0 * ln * (1.0 - tp))), leaflet_max=0.17 * ln,
                              leaflet_width=0.0075, petiole_frac=tp, slot0=slot0)
        tris += info["tris"]
        fronds += 1
    pts = [v.co for v in bm.verts]
    return {"tris": tris, "height": round(max(p.z for p in pts), 3),
            "radius": round(max(math.hypot(p.x, p.y) for p in pts), 3), "fronds": fronds, "trunk": round(ht, 3)}
