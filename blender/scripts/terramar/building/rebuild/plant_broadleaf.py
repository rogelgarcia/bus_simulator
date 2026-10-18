# plant_broadleaf.py -- user fix 12 (2026-10-15): a lush broad-leaf pot plant (bird-of-paradise / strelitzia) with real
# leaves, for the pots inside the entrance portal.
#
# b8 shows a tall, dark, leafy plant in a pot on each side of the entrance, inside the portal against the wood walls
# (the user's images/14.webp: "use actual leaves, and not simplified geometry, just like you did for the palm trees").
# This module builds one clump into the caller's bmesh, base at the origin (the pot soil at z 0):
#   shoots   5-6 fans of distichous leaves (strelitzia: the leaves of a shoot stand in one plane, alternating sides), a few
#            centimetres apart, each fan turned a little; the inner leaves near upright and longest, the outer ones
#            leaning out and drooping more. lean (local -x) is the open side: leaves leaning toward +x (the wall side
#            when placed) stand more upright, so the clump fits a portal corner
#   leaf     a long petiole (round, flattened into an overlapping sheath at the base, bending gently outward) carrying an
#            oblong paddle blade: widest ~45 % along, acute tip, a V-fold about the midrib with the margins rolling
#            down, a slight undulation along the margins, arching down toward the tip under its own weight, rolled and
#            twisted a little. The blade's rows follow the lateral veins (slanting from the midrib toward the tip), so
#            the splits real strelitzia leaves get (along the veins, from the margin toward the midrib) are cut along a
#            row: the strips either side drop by different amounts and the slit opens. Older leaves split more
#   spear    0-1 young rolled leaf per shoot, a slim tapering cone standing up out of the fan
# Each leaf gets a seeded rb_tint (its tone on the material's ramp; older leaves a little yellower). Faces: slot0 + 0 the
# blades and spears (RBP_broadleaf_leaf_foliage: pinnate veins as faint lines and a bump, a pale midrib, a thin darker
# margin, a paler waxy underside, translucency), slot0 + 1 the petioles (RBP_broadleaf_stem, red-brown at the sheath to
# green). UVs: u across the blade (midrib 0.5), v along it; u round a petiole, v along it. The midrib edges are sharp,
# everything else smooth. A clump is ~20-23k triangles.
#   build_broadleaf(bm, rng, slot0=0, lean=True)   returns {"tris", "height", "radius", "leaves", "shoots", "splits"}
#   materials()   the two slot materials in slot order (MATERIAL_NAMES)
import math

from mathutils import Matrix, Vector

import plant_shading as SH

MATERIAL_NAMES = ("RBP_broadleaf_leaf_foliage", "RBP_broadleaf_stem")
TINT = SH.TINT
ROWS, COLS = 22, 10                   # blade rows (base to tip) and quads across (COLS / 2 each side of the midrib)
SIDES = 8                             # petiole ring


def materials():
    """Create or refresh the slot materials (MATERIAL_NAMES order)."""
    leaf = SH.leaf_material(MATERIAL_NAMES[0],
                            ((0.0, (0.030, 0.062, 0.022)), (0.55, (0.050, 0.092, 0.030)), (1.0, (0.095, 0.125, 0.036))),
                            midrib_rgb=(0.16, 0.20, 0.08), rough=(0.38, 0.62), translucency=0.24,
                            viewport_rgb=(0.05, 0.09, 0.03), veins="pinnate", vein_count=70.0, vein_slant=0.08,
                            vein_strength=0.05, bump=0.10, midrib_width=0.018, margin_rgb=(0.10, 0.07, 0.035),
                            under=(0.62, 1.18))
    stem = SH.stem_material(MATERIAL_NAMES[1],
                            ((0.0, (0.13, 0.065, 0.035)), (0.12, (0.10, 0.085, 0.040)), (0.35, (0.065, 0.10, 0.035)),
                             (1.0, (0.075, 0.115, 0.040))), rough=0.45, viewport_rgb=(0.07, 0.10, 0.04))
    return [leaf, stem]


def _toward(a, b, ang):
    """Unit vector a turned toward b by ang (rad), never past b."""
    perp = b - a * a.dot(b)
    if perp.length < 1e-6 or ang <= 0.0:
        return a.copy()
    ang = min(ang, math.acos(max(-1.0, min(1.0, a.dot(b)))) * 0.97)
    return (a * math.cos(ang) + perp.normalized() * math.sin(ang)).normalized()


def _centre_line(p0, d0, length, n, bend_to, bend, curl):
    """Points, tangents of a curve from p0 leaving along d0, its heading turned toward bend_to by bend * t^curl."""
    pts, tans, p = [p0.copy()], [d0.copy()], p0.copy()
    for i in range(n):
        tm = (i + 0.5) / n
        p = p + _toward(d0, bend_to, bend * tm ** curl) * (length / n)
        pts.append(p.copy())
        tans.append(_toward(d0, bend_to, bend * ((i + 1) / n) ** curl))
    return pts, tans


def _sample(curve, t):
    pts, tans = curve
    n = len(pts) - 1
    x = min(max(t, 0.0), 1.0) * n
    i = min(int(x), n - 1)
    f = x - i
    return pts[i].lerp(pts[i + 1], f), tans[i].lerp(tans[i + 1], f).normalized()


class _Mesh:
    """Face helper: material slot, rb_tint, UVs, smooth, triangle count."""

    def __init__(self, bm):
        self.bm = bm
        self.uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
        self.tint = bm.faces.layers.float.get(TINT) or bm.faces.layers.float.new(TINT)
        self.tris = 0

    def face(self, vs, uvs, slot, shade):
        f = self.bm.faces.new(vs)
        f.material_index = slot
        f.smooth = True
        f[self.tint] = shade
        for lp, co in zip(f.loops, uvs):
            lp[self.uv].uv = co
        self.tris += len(vs) - 2
        return f


def _petiole(m, base, d0, out_dir, length, r0, flat_dir, slot, shade, bend):
    """A petiole from base along d0, bending toward out_dir by bend; round, flattened along flat_dir into the sheath
    over its first 18 %. Returns the curve (for the blade's start)."""
    n = 12
    curve = _centre_line(base, d0, length, n, out_dir, bend, 1.3)
    rings, ts = [], [i / n for i in range(n + 1)]
    for t in ts:
        p, tan = _sample(curve, t)
        a = (flat_dir - tan * flat_dir.dot(tan)).normalized()
        b = tan.cross(a).normalized()
        r = r0 * (1.0 - 0.5 * t)
        sheath = max(0.0, 1.0 - t / 0.18)
        ra, rb = r * (1.0 + 2.2 * sheath), r * (1.0 - 0.35 * sheath)
        rings.append([m.bm.verts.new(p + a * (ra * math.cos(2 * math.pi * k / SIDES))
                                     + b * (rb * math.sin(2 * math.pi * k / SIDES))) for k in range(SIDES)])
    for i in range(n):
        for k in range(SIDES):
            k1 = (k + 1) % SIDES
            m.face((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]),
                   [(k / SIDES, ts[i]), ((k + 1) / SIDES, ts[i]), ((k + 1) / SIDES, ts[i + 1]), (k / SIDES, ts[i + 1])],
                   slot, shade)
    m.face(list(reversed(rings[0])), [(0.5, 0.0)] * SIDES, slot, shade)
    return curve


def _blade(m, rng, p0, d0, length, width, droop, roll, twist, slot, shade, splits, fold=0.20, curl=0.30, wave=0.008):
    """One paddle blade from p0 along d0 (module header). splits: chance of each candidate split row per side.
    Returns (number of splits, the points)."""
    down = Vector((0.0, 0.0, -1.0))
    curve = _centre_line(p0, d0, length, 40, down, droop, 1.35)
    w0 = d0.cross(Vector((0.0, 0.0, 1.0)))
    if w0.length < 1e-4:
        w0 = Vector((1.0, 0.0, 0.0))
    w0 = (Matrix.Rotation(roll, 3, d0) @ w0.normalized())
    phase = rng.uniform(0.0, 2.0 * math.pi)
    ts = [0.5 - 0.5 * math.cos(math.pi * i / ROWS) for i in range(ROWS + 1)]
    us = [j / COLS for j in range(COLS + 1)]
    slant = 0.08
    # strips: per side, split rows and each strip's extra drop at the margin (a share of the half width)
    cuts = {}
    drops = {}
    for side in (-1, 1):
        rows = [i for i in range(4, ROWS - 3) if rng.random() < splits]
        cuts[side] = {i: rng.randint(1, COLS // 2 - 1) for i in rows}      # columns from the midrib kept whole
        drops[side] = [rng.uniform(0.0, 0.15) if k else rng.uniform(0.0, 0.06) for k in range(len(rows) + 1)]

    def frame(t):
        """Centre, tangent, width and normal directions at t (the width vector carried along, then twisted)."""
        p, tan = _sample(curve, t)
        w = (w0 - tan * w0.dot(tan)).normalized()
        w = Matrix.Rotation(twist * t, 3, tan) @ w
        return p, tan, w, w.cross(tan).normalized()

    def half(t):
        return 0.5 * width * max(0.05, math.sin(math.pi * min(1.0, t) ** 0.85) ** 0.62 * (1.0 - 0.12 * t))

    def point(t, u, drop):
        p, _, w, nrm = frame(t)
        s = 2.0 * u - 1.0
        d = abs(s)
        h = half(t)
        lift = fold * d - curl * d ** 3 - drop * d ** 1.5 + wave / max(h, 1e-3) * d ** 2 * math.sin(phase + 31.0 * t)
        return p + w * (s * h) + nrm * (lift * h)

    def t_of(i, j, extra=0.0):
        t = ts[i]
        return min(1.0, t + slant * abs(2.0 * us[j] - 1.0) * (1.0 - t) * min(1.0, t / 0.15) + extra)

    # vertices: row i, column j; split rows get duplicates beyond their cut for the strip above
    strip_of = {side: [] for side in (-1, 1)}
    for side in (-1, 1):
        k = 0
        for i in range(ROWS + 1):
            strip_of[side].append(k)                       # the strip below row i (a split row's duplicates: k + 1)
            if i in cuts[side]:
                k += 1
    grid, dup = [], {}
    for i in range(ROWS):
        row = []
        for j in range(COLS + 1):
            side = -1 if j < COLS // 2 else 1
            row.append(m.bm.verts.new(point(t_of(i, j), us[j], drops[side][strip_of[side][i]])))
            if i in cuts[side] and abs(j - COLS // 2) > cuts[side][i]:
                opening = 0.006 + 0.022 * abs(2.0 * us[j] - 1.0)            # the slit opens toward the margin
                dup[(i, j)] = m.bm.verts.new(point(t_of(i, j, opening), us[j], drops[side][strip_of[side][i] + 1]))
        grid.append(row)
    tip = m.bm.verts.new(frame(1.0)[0])
    mid = COLS // 2
    for i in range(ROWS - 1):
        for j in range(COLS):
            a = dup.get((i, j), grid[i][j])
            b = dup.get((i, j + 1), grid[i][j + 1])
            f = m.face((a, b, grid[i + 1][j + 1], grid[i + 1][j]),
                       [(us[j], ts[i]), (us[j + 1], ts[i]), (us[j + 1], ts[i + 1]), (us[j], ts[i + 1])], slot, shade)
        e = m.bm.edges.get((grid[i][mid], grid[i + 1][mid]))
        if e is not None:
            e.smooth = False                                                 # the midrib crease stays crisp
    i = ROWS - 1
    for j in range(COLS):
        a = dup.get((i, j), grid[i][j])
        b = dup.get((i, j + 1), grid[i][j + 1])
        m.face((a, b, tip), [(us[j], ts[i]), (us[j + 1], ts[i]), (0.5, 1.0)], slot, shade)
    n_split = len(cuts[-1]) + len(cuts[1])
    return n_split, [v.co.copy() for v in grid[ROWS // 2]] + [tip.co.copy()]


def _spear(m, base, d0, length, r0, slot, shade):
    """A young rolled leaf: a slim cone along d0, closed at the tip."""
    n, k = 8, 6
    rings = []
    for i in range(n):
        t = i / n
        r = r0 * (1.0 - t) ** 0.8
        side = d0.cross(Vector((1.0, 0.0, 0.0))).normalized()
        up = d0.cross(side).normalized()
        c = base + d0 * (length * t)
        rings.append([m.bm.verts.new(c + side * (r * math.cos(2 * math.pi * q / k)) + up * (r * math.sin(2 * math.pi * q / k)))
                      for q in range(k)])
    tip = m.bm.verts.new(base + d0 * length)
    for i in range(n - 1):
        for q in range(k):
            q1 = (q + 1) % k
            m.face((rings[i][q], rings[i][q1], rings[i + 1][q1], rings[i + 1][q]),
                   [(q / k, i / n), ((q + 1) / k, i / n), ((q + 1) / k, (i + 1) / n), (q / k, (i + 1) / n)], slot, shade)
    for q in range(k):
        m.face((rings[-1][q], rings[-1][(q + 1) % k], tip), [(q / k, 1 - 1 / n), ((q + 1) / k, 1 - 1 / n), (0.5, 1.0)],
               slot, shade)


def build_broadleaf(bm, rng, slot0=0, lean=True):
    """One clump into bm (see the module header)."""
    m = _Mesh(bm)
    s_leaf, s_stem = slot0, slot0 + 1
    up = Vector((0.0, 0.0, 1.0))
    open_dir = Vector((-1.0, 0.0, 0.0))
    shoots = rng.randint(5, 6)
    leaves = splits = 0
    pts = []
    base_az = rng.uniform(0.0, 2.0 * math.pi)
    for s in range(shoots):
        az = (math.radians(rng.uniform(-30.0, 30.0)) if lean else base_az + s * math.pi / shoots + rng.uniform(-0.3, 0.3))
        fan = Vector((math.cos(az), math.sin(az), 0.0))                      # the fan's in-plane horizontal
        ang = rng.uniform(0.0, 2.0 * math.pi)
        rr = rng.uniform(0.02, 0.06)
        base = Vector((rr * math.cos(ang), rr * math.sin(ang), -0.03))
        n = rng.randint(5, 7)
        first = rng.choice((-1.0, 1.0))
        for k in range(n):
            sign = first * (1.0 if k % 2 == 0 else -1.0)
            age = k / max(1, n - 1)                                          # 0 inner / young, 1 outer / old
            out = fan * sign
            lf = out.dot(open_dir) if lean else 0.0                         # +1 toward the open side
            alpha = math.radians((3.0 + 30.0 * age + rng.uniform(-3.0, 3.0)) * max(0.2, 0.6 + 0.5 * lf))
            out = (Matrix.Rotation(math.radians(rng.uniform(-9.0, 9.0)), 3, up) @ out).normalized()
            d0 = (up * math.cos(alpha) + out * math.sin(alpha)).normalized()
            shade = min(1.0, max(0.0, rng.uniform(0.25, 0.7) + 0.25 * age))
            lp = rng.uniform(0.72, 0.98) * (1.0 - 0.30 * age)
            curve = _petiole(m, base, d0, out, lp, rng.uniform(0.0085, 0.010), fan, s_stem,
                             shade, math.radians(4.0 + 12.0 * age))
            p_end, t_end = _sample(curve, 1.0)
            lb = rng.uniform(0.62, 0.82) * (1.0 - 0.12 * age)
            wb = lb * rng.uniform(0.33, 0.40)
            droop = (math.radians(18.0 + 42.0 * age + rng.uniform(-6.0, 6.0)) * (0.75 + 0.35 * max(0.0, lf))
                     * (1.0 + 0.6 * min(0.0, lf)))                          # the wall side's blades stay up
            d_blade = _toward(t_end, -up, math.radians(rng.uniform(2.0, 8.0)))
            n_split, bp = _blade(m, rng, p_end, d_blade, lb, wb, droop, math.radians(rng.uniform(-18.0, 18.0)),
                                 math.radians(rng.gauss(0.0, 12.0)), s_leaf, shade,
                                 0.0 if age < 0.25 else 0.02 + 0.09 * age)
            leaves += 1
            splits += n_split
            pts += bp
        if rng.random() < 0.65:                                              # a young rolled leaf out of the fan
            d0 = _toward(up, fan * rng.choice((-1.0, 1.0)), math.radians(rng.uniform(2.0, 7.0)))
            ln = rng.uniform(1.05, 1.3)
            _petiole(m, base, d0, d0, ln * 0.72, 0.008, fan, s_stem, 0.3, 0.0)
            _spear(m, base + d0 * (ln * 0.72), d0, ln * 0.28, 0.011, s_leaf, rng.uniform(0.55, 0.85))
    allp = [v.co for v in bm.verts]
    return {"tris": m.tris, "height": round(max(p.z for p in allp), 3),
            "radius": round(max(math.hypot(p.x, p.y) for p in allp), 3), "leaves": leaves, "shoots": shoots,
            "splits": splits}
