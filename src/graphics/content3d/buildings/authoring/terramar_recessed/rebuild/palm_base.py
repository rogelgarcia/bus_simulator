# palm_base.py -- palm detail upgrade: the root base where a palm's trunk meets the soil, built into a caller's
# bmesh for the palm composer to weld under palm_trunk.py's trunk.
#
# A palm has no woody taproot flare. Its trunk widens toward the soil into a root boss (the root initiation zone) made
# of fused root bases; many thin adventitious roots of near-even thickness break out of its lower part, radially, at
# the soil line (some a little higher, running down the boss first), arch low over the soil and dive in; small root
# initials dot the boss above them. b8 hides its palms' feet behind the pit planting, so the base is restrained: it
# must read in a close-up at the pit, not compete with it.
#   build_base(bm, rng, r_trunk=, height=, flare=, roots=, sides=, slot0=)   the base, centred on the origin with the
#           soil surface at z 0, from below the soil (z -0.04 .. -0.08, closed) up to z = height (default 2.2 r_trunk):
#     boss      rings whose radius grows from r_trunk to flare * r_trunk at the soil, most of it low down (a swollen
#               foot, not a bell), with an irregular outline: seeded harmonics that twist a little with height, a broad
#               buttress lobe under each root cluster, narrower ridges (the fused root bases) rising out of the soil, a
#               slight bulb above the soil. The top share is a straight cylinder, so the surface runs tangent-continuous
#               into the trunk. Its top is an OPEN ring of exactly `sides` vertices at radius r_trunk, the first at
#               angle 0 (+X), counter-clockwise: the trunk starts with the identical ring and the composer welds the two
#               (it lifts the trunk by height)
#     roots     cords of 5-13 mm at street size, spread round the boss and drawn toward its ridges and root clusters.
#               Half leave it straight at the soil line, half break out a little higher, thin, and swell as they run
#               down it; each then arches low over the soil (one smooth cubic, bending a little sideways) and dives in:
#               every end below z 0, within ROOT_REACH * the soil radius (a street pit's inner half-width is 0.54 m)
#     initials  small low bumps in groups of 2-4 on the lower boss, their blunt tips turned down along it
#     returns {"top_z", "top_radius", "sides", "max_radius" (horizontal, roots included), "tris"}
#   materials()   RBP_palm_root (procedural nodes): a copy of palm_trunk.py's bark (RBP_palm_bark: its colour,
#           striations, streaks and bump read on object coordinates and on its own attributes, which are 0 here as at
#           the trunk's base), so the weld does not show; down the boss it blends by rb_root_t into the root zone,
#           darker and warmer with a coarser fibre grain, each root a seeded shade apart; natural variation only, no
#           soiling spots. Without palm_trunk.py it starts from a plain bark of the same tone.
# Faces take material_index slot0 and are smooth. The UV layer (the active one) follows palm_trunk.py's convention on
# the boss (U 0..1 around from +X, counter-clockwise; V metres, 0 at the top ring, so it runs on into the trunk's),
# around and along on the roots and bumps. Two face-corner float attributes drive the material: rb_root_t (0 at the top
# ring -> 1 at the soil and below; the welded trunk reads 0, the default) and rb_root_var (per-root tone, 0 on the
# boss). Corner layers, not vertex layers: adding a vertex layer to a bmesh invalidates the Python references held to
# the vertices made before it (palm_trunk.py's vertex layers do that to anything built before the trunk). A street base
# (r_trunk 0.24) is ~5.4k triangles, a roof base (0.10) ~2.5k.
#
# Test renders (the composition lighting; the .blend is never saved; renders go to out=):
#   blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_building.blend --python <this file> -- \
#       out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/palm_detail/base [samples=96] [seed=1] \
#       [shots=street_eye,street_low,street_above,roof,seam,seam_clay]
# builds a street base in a tree-pit planter and a roof base in a trough near x 40, y -45, each under a plain cylinder
# trunk welded on its top ring (wearing RBP_palm_bark), and renders the eye-level, low close-up, top-down, roof, weld
# and clay-weld views.
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

MATERIAL_NAMES = ("RBP_palm_root",)     # slot order
ROOT_T, ROOT_VAR = "rb_root_t", "rb_root_var"

STRAIGHT = 0.10          # the top share of the base that stays a plain cylinder of r_trunk (tangent into the trunk)
RING_S = (0.0, 0.08, 0.18, 0.30, 0.42, 0.53, 0.63, 0.72, 0.80, 0.87, 0.93, 0.97, 1.0)   # rings, 0 top -> 1 soil
SPLIT = 6                # rings from RING_S[SPLIT] down carry 3 * sides vertices (2 * on small bases): lobes and ridges
ROOT_REACH = 1.3         # roots end within this * flare * r_trunk of the axis (tips included)
BARK_RGB = (0.31, 0.27, 0.215)      # the fallback bark (palm_trunk.py's tone at the trunk base)
SOIL_RGB = (0.16, 0.12, 0.083)      # the root zone at the soil: darker and warmer
TAU = 2.0 * math.pi
GOLDEN = 2.399963229728653          # the golden angle: roots spread evenly before the pull
Z = Vector((0.0, 0.0, 1.0))


def _wrap(a):
    return (a + math.pi) % TAU - math.pi


def _smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


class _Boss:
    """The boss surface r = R(z, theta): a profile from r_trunk (top) to flare * r_trunk (soil), seeded harmonics, a
    broad lobe per root cluster, narrow ridges low down and a slight bulb, all zero on the straight top share."""

    def __init__(self, rng, r_trunk, height, flare, clusters, ridges):
        self.r_trunk, self.height, self.flare = r_trunk, height, flare
        self.harm = [(k, 0.07 * rng.uniform(0.35, 1.0) / k ** 0.7, rng.uniform(0.0, TAU), rng.uniform(-0.6, 0.6))
                     for k in range(2, 7)]
        self.lobes = [(c, rng.uniform(0.05, 0.1), rng.uniform(0.2, 0.32)) for c in clusters]
        self.ridges = [(c, rng.uniform(0.06, 0.12), rng.uniform(0.07, 0.12)) for c in ridges]
        self.bulb = rng.uniform(0.0, 0.05)

    def q(self, z):
        """0 on the straight top share -> 1 at the soil (and below)."""
        s = 1.0 - z / self.height
        return min(1.0, max(0.0, (s - STRAIGHT) / (1.0 - STRAIGHT)))

    def radius(self, z, th):
        q = self.q(z)
        if q <= 0.0:
            return self.r_trunk
        prof = 1.0 + (self.flare - 1.0) * (0.25 * q * q * (3.0 - 2.0 * q) + 0.75 * q ** 3)   # C1 at the top, swell low
        prof += self.bulb * math.exp(-((q - 0.84) / 0.12) ** 2)
        h = sum(a * math.cos(k * th + ph + tw * q) for k, a, ph, tw in self.harm)
        bump = lambda items: sum(b * math.exp(-(_wrap(th - c) / wd) ** 2) for c, b, wd in items)  # noqa: E731
        return self.r_trunk * (prof * (1.0 + q ** 1.3 * h) + q ** 1.7 * bump(self.lobes)
                               + _smooth(0.4, 1.0, q) ** 1.5 * bump(self.ridges))

    def point(self, z, th):
        r = self.radius(z, th)
        return Vector((r * math.cos(th), r * math.sin(th), z))

    def normal(self, z, th, e=1e-3):
        dz = self.point(z + e, th) - self.point(z - e, th)
        dth = self.point(z, th + e) - self.point(z, th - e)
        return dth.cross(dz).normalized()


class _Writer:
    """New verts/faces into the caller's bmesh with the slot, smooth shading, UVs and the two material attributes.
    The attributes are face-corner layers: a new vertex layer would invalidate the caller's Python references to the
    vertices it already made (a trunk ring kept for the weld), a corner layer only its loop references."""

    def __init__(self, bm, slot):
        self.bm, self.slot = bm, slot
        self.uv = bm.loops.layers.uv.verify()
        self.t = bm.loops.layers.float.get(ROOT_T) or bm.loops.layers.float.new(ROOT_T)
        self.var = bm.loops.layers.float.get(ROOT_VAR) or bm.loops.layers.float.new(ROOT_VAR)
        self.verts, self.faces, self.tv = [], [], {}

    def vert(self, co, t, var=0.0):
        v = self.bm.verts.new(co)
        self.tv[v] = (t, var)
        self.verts.append(v)
        return v

    def face(self, vs, uvs):
        f = self.bm.faces.new(vs)
        f.material_index, f.smooth = self.slot, True
        for lp, uv in zip(f.loops, uvs):
            lp[self.uv].uv = uv
            lp[self.t], lp[self.var] = self.tv[lp.vert]
        self.faces.append(f)
        return f


def _boss_mesh(w, boss, sides, z_bot, mult):
    """Rings top -> bottom (sides vertices above SPLIT, mult * sides below), quads between, a 1:mult row at the split,
    and a fan closing the bottom below the soil."""
    h = boss.height
    zs = [h * (1.0 - s) for s in RING_S] + [0.45 * z_bot, z_bot]
    rings = []
    for i, z in enumerate(zs):
        n = sides if i < SPLIT else mult * sides
        below = 1.0 if z >= 0.0 else (1.02 if i == len(zs) - 2 else 0.97)
        ring = []
        for k in range(n):
            th = TAU * k / n
            r = boss.radius(z, th) * below
            ring.append(w.vert((r * math.cos(th), r * math.sin(th), z), boss.q(z)))
        rings.append((ring, z - h))
    for (up, vu), (lo, vl) in zip(rings, rings[1:]):
        nu, nl = len(up), len(lo)
        m = nl // nu
        for k in range(nu):
            k1 = (k + 1) % nu
            uu = lambda j: ((k + j) / nu, vu)  # noqa: E731  (U 0..1 round from +X; k = n closes the seam at 1)
            ul = lambda j: ((m * k + j) / nl, vl)  # noqa: E731
            low = lambda j: lo[(m * k + j) % nl]  # noqa: E731
            for j in range(m):
                if j + 1 <= m / 2:
                    w.face((low(j), low(j + 1), up[k]), (ul(j), ul(j + 1), uu(0)))
                elif j >= m / 2:
                    w.face((low(j), low(j + 1), up[k1]), (ul(j), ul(j + 1), uu(1)))
                else:
                    w.face((low(j), low(j + 1), up[k1], up[k]), (ul(j), ul(j + 1), uu(1), uu(0)))
            if m % 2 == 0:
                w.face((low(m // 2), up[k1], up[k]), (ul(m // 2), uu(1), uu(0)))
    last = rings[-1][0]
    centre = w.vert((0.0, 0.0, z_bot), 1.0)
    for k in range(len(last)):
        a, b = last[(k + 1) % len(last)], last[k]
        w.face((centre, a, b), ((0.5, z_bot - h - 0.1), ((k + 1) / len(last), z_bot - h), (k / len(last), z_bot - h)))


def _tube(w, pts, radii, sides, t_of, var, tip=1.5):
    """A closed tube along pts (parallel-transported frame): a cap at the start, a cone tip past the end."""
    n = len(pts)
    tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    N = tans[0].cross(Z)
    N = N.normalized() if N.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    rings, along = [], 0.0
    for i, (p, T, r) in enumerate(zip(pts, tans, radii)):
        if i:
            along += (p - pts[i - 1]).length
        N = (N - T * N.dot(T)).normalized()
        B = T.cross(N)
        rings.append(([w.vert(p + (N * math.cos(TAU * j / sides) + B * math.sin(TAU * j / sides)) * r, t_of(p.z), var)
                       for j in range(sides)], along))
    circ = TAU * radii[0]
    for (a, la), (b, lb) in zip(rings, rings[1:]):
        for j in range(sides):
            j1 = (j + 1) % sides
            u0, u1 = circ * j / sides, circ * (j + 1) / sides
            w.face((a[j], a[j1], b[j1], b[j]), ((u0, la), (u1, la), (u1, lb), (u0, lb)))
    w.face(list(reversed(rings[0][0])),
           [(math.cos(-TAU * j / sides) * radii[0], math.sin(-TAU * j / sides) * radii[0]) for j in range(sides)])
    last, end = rings[-1]
    p = w.vert(pts[-1] + tans[-1] * radii[-1] * tip, t_of(pts[-1].z), var)
    for j in range(sides):
        w.face((last[j], last[(j + 1) % sides], p), ((circ * j / sides, end), (circ * (j + 1) / sides, end),
                                                      (circ * (j + 0.5) / sides, end + radii[-1] * tip)))


def _root(w, boss, rng, th, emerge, z_bot, cap, sides, segs):
    """One adventitious root at angle th. It leaves the boss just above the soil, either straight out of it or after
    breaking out a little higher and running down it (rising out of the surface), then arches low over the soil and
    dives into it (one smooth cubic, bending a little sideways)."""
    rt = boss.r_trunk
    r0 = max(0.0025, rt * (rng.uniform(0.022, 0.04) if rng.random() < 0.85 else rng.uniform(0.04, 0.055)))
    pts = []
    z_f = r0 * rng.uniform(0.3, 1.4)                           # where it leaves the boss
    radial = Vector((math.cos(th), math.sin(th), 0.0))
    out = radial
    if emerge:
        z_e = z_f + boss.height * rng.uniform(0.05, 0.22)
        drift = rng.uniform(-0.1, 0.1)
        for i in range(segs[0]):
            u = i / segs[0]
            z, a = z_e + (z_f - z_e) * u, th + drift * u
            pts.append(boss.point(z, a) + boss.normal(z, a) * r0 * (-1.0 + 1.6 * u))   # thin, rising out of it
        th += drift
        radial = Vector((math.cos(th), math.sin(th), 0.0))
        p0 = boss.point(z_f, th) + boss.normal(z_f, th) * 0.6 * r0
        out = (radial * 0.7 + (p0 - pts[-1]).normalized() * 0.3).normalized()   # turning out from down the boss
    else:
        p0 = boss.point(z_f, th) - boss.normal(z_f, th) * 1.2 * r0
    th3 = th + rng.uniform(-0.12, 0.12)
    radial3 = Vector((math.cos(th3), math.sin(th3), 0.0))
    r_end = min(boss.radius(0.0, th3) + rt * rng.uniform(0.2, 0.9), 0.94 * cap - 2.0 * r0)
    r_end = max(r_end, math.hypot(p0.x, p0.y) + 4.0 * r0)
    p3 = radial3 * r_end + Z * (z_bot * rng.uniform(0.4, 0.8))
    span = (p3 - p0).length
    p1 = p0 + out * span * 0.35 + Z * r0 * rng.uniform(0.3, 2.5)          # a low arch over the soil
    p2 = p3 - radial3 * span * 0.25 + Z * (r0 * rng.uniform(0.0, 1.0) - p3.z)   # then down into it
    side = Vector((-math.sin(th), math.cos(th), 0.0)) * r0 * rng.uniform(-1.2, 1.2)
    n = segs[1]
    for i in range(n + 1):
        u = i / n
        m = 1.0 - u
        pts.append(p0 * m ** 3 + p1 * 3 * m * m * u + p2 * 3 * m * u * u + p3 * u ** 3 + side * math.sin(math.pi * u))
    k, e = len(pts) - 1, segs[0] if emerge else 0
    radii = [r0 * (1.0 - 0.25 * i / k) * (0.3 + 0.7 * _smooth(0.0, 0.8 * e, i) if e else 1.0) for i in range(k + 1)]
    _tube(w, pts, radii, sides, boss.q, rng.uniform(-1.0, 1.0))


def _initial(w, boss, rng, th, z):
    """A root initial: a small low bump on the lower boss (its base ring on the tangent plane, a narrower ring and a
    blunt tip turned down along the surface)."""
    rt = boss.r_trunk
    zf = min(1.0, z / (0.4 * boss.height))
    rb = rt * rng.uniform(0.013, 0.026) * (1.1 - 0.3 * zf)
    prot = rb * rng.uniform(0.35, 0.6)
    p, n = boss.point(z, th), boss.normal(z, th)
    up = (Z - n * Z.dot(n)).normalized()
    phi = math.radians(rng.uniform(25.0, 55.0))
    d = n * math.cos(phi) - up * math.sin(phi)                  # down along the boss, never into it
    N = up.cross(n).normalized()
    B = n.cross(N)
    t, var, k = boss.q(z), rng.uniform(-0.3, 0.3), 6
    dirs = [N * math.cos(TAU * (j + 0.5) / k) + B * math.sin(TAU * (j + 0.5) / k) for j in range(k)]
    ring = lambda c, r: [w.vert(c + q * r, t, var) for q in dirs]  # noqa: E731
    base, mid = ring(p - n * rb * 0.2, rb), ring(p + d * prot * 0.6, rb * 0.6)
    tip = w.vert(p + d * prot, t, var)
    uv = lambda v: ((v.co - p).dot(N), (v.co - p).dot(B))  # noqa: E731
    for j in range(k):
        j1 = (j + 1) % k
        w.face((base[j], base[j1], mid[j1], mid[j]), [uv(v) for v in (base[j], base[j1], mid[j1], mid[j])])
        w.face((mid[j], mid[j1], tip), [uv(v) for v in (mid[j], mid[j1], tip)])
    w.face(list(reversed(base)), [uv(v) for v in reversed(base)])


def build_base(bm, rng, *, r_trunk, height=None, flare=None, roots=None, sides=24, slot0=0):
    """The palm's root base into bm (see the header); returns its top ring, horizontal extent and triangle count."""
    height = 2.2 * r_trunk if height is None else height
    flare = rng.uniform(1.5, 1.7) if flare is None else flare
    roots = max(6, round(r_trunk * rng.uniform(130.0, 150.0))) if roots is None else roots
    z_bot = -max(0.04, min(0.08, 0.33 * r_trunk))
    street = r_trunk >= 0.15
    n_cl = max(3, round(roots / 6))
    a0 = rng.uniform(0.0, TAU)
    clusters = [a0 + TAU * (i + rng.uniform(-0.3, 0.3)) / n_cl for i in range(n_cl)]
    ridges = [rng.choice(clusters) + rng.gauss(0.0, 0.3) if rng.random() < 0.3 else rng.uniform(0.0, TAU)
              for _ in range(rng.randint(10, 14) if street else rng.randint(6, 8))]
    boss = _Boss(rng, r_trunk, height, flare, clusters, ridges)
    w = _Writer(bm, slot0)
    _boss_mesh(w, boss, sides, z_bot, 3 if street else 2)
    cap = ROOT_REACH * flare * r_trunk
    pulls = ridges + clusters
    for i in range(roots):                                     # spread round the boss, drawn toward ridges and clusters
        th = a0 + i * GOLDEN + rng.gauss(0.0, 0.08)
        near = min(pulls, key=lambda c: abs(_wrap(c - th)))
        if abs(_wrap(near - th)) < 0.35:
            th += _wrap(near - th) * rng.uniform(0.4, 0.85)
        _root(w, boss, rng, th, rng.random() < 0.5, z_bot, cap, 5, (3, 7) if street else (2, 6))
    for _ in range(max(2, roots // 3)):                      # root initials come in small groups
        th = rng.choice(ridges) + rng.gauss(0.0, 0.1) if rng.random() < 0.5 else rng.uniform(0.0, TAU)
        z = height * (0.06 + 0.32 * rng.random() ** 1.4)
        for _ in range(rng.randint(2, 4)):
            _initial(w, boss, rng, th + rng.gauss(0.0, 0.05), max(0.015 * height, z + rng.gauss(0.0, 0.05 * height)))
    return {"top_z": height, "top_radius": r_trunk, "sides": sides,
            "max_radius": max(math.hypot(v.co.x, v.co.y) for v in w.verts),
            "tris": sum(len(f.verts) - 2 for f in w.faces)}


# ---------------------------------------------------------------- material


class _Nodes:
    """A small node-tree writer: math, map ranges, mixes and noise on object coordinates."""

    def __init__(self, nt):
        self.nt = nt

    def new(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def feed(self, sock, v):
        if hasattr(v, "is_output"):
            self.nt.links.new(v, sock)
        else:
            rgba = isinstance(v, tuple) and len(v) == 3 and len(sock.default_value) == 4
            sock.default_value = (*v, 1.0) if rgba else v

    def math(self, op, a, b=None, c=None):
        n = self.new("ShaderNodeMath", operation=op)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.feed(n.inputs[i], v)
        return n.outputs[0]

    def lerp(self, a, b, f):
        return self.math("MULTIPLY_ADD", self.math("SUBTRACT", b, a), f, a)

    def map_range(self, v, f0, f1, t0, t1):
        n = self.new("ShaderNodeMapRange", data_type="FLOAT", interpolation_type="SMOOTHSTEP")
        for i, x in enumerate((v, f0, f1, t0, t1)):
            self.feed(n.inputs[i], x)
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type="MIX", clamp_factor=True)
        self.feed(n.inputs["Factor"], fac)
        self.feed(next(s for s in n.inputs if s.name == "A" and s.type == "RGBA"), a)
        self.feed(next(s for s in n.inputs if s.name == "B" and s.type == "RGBA"), b)
        return next(s for s in n.outputs if s.type == "RGBA")

    def scale(self, vec, f):
        n = self.new("ShaderNodeVectorMath", operation="SCALE")
        self.feed(n.inputs[0], vec)
        self.feed(n.inputs["Scale"], f)
        return n.outputs["Vector"]

    def noise(self, sx, sy, sz, detail, rough):
        tc = self.new("ShaderNodeVectorMath", operation="MULTIPLY")
        self.feed(tc.inputs[0], self.new("ShaderNodeTexCoord").outputs["Object"])
        tc.inputs[1].default_value = (sx, sy, sz)
        n = self.new("ShaderNodeTexNoise", noise_dimensions="3D")
        self.feed(n.inputs["Vector"], tc.outputs[0])
        n.inputs["Scale"].default_value, n.inputs["Detail"].default_value = 1.0, detail
        n.inputs["Roughness"].default_value = rough
        return n.outputs["Fac"]


def _bark_source():
    """palm_trunk.py's bark (refreshed), or a plain bark of its tone (long fibre streaks, matte) without that module."""
    try:
        import palm_trunk
        return palm_trunk.materials()[0].copy()
    except Exception as exc:  # noqa: BLE001 - the base still renders, with its own bark
        print("palm_base: palm_trunk unavailable, RBP_palm_root starts from a plain bark:", exc)
    mat = bpy.data.materials.new(MATERIAL_NAMES[0] + "_src")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    w = _Nodes(nt)
    streak = w.map_range(w.noise(30.0, 30.0, 1.1, 4.0, 0.6), 0.33, 0.67, 0.0, 1.0)
    bsdf = w.new("ShaderNodeBsdfPrincipled")
    w.feed(bsdf.inputs["Base Color"], w.scale(BARK_RGB, w.math("MULTIPLY_ADD", streak, 0.13, 0.935)))
    w.feed(bsdf.inputs["Roughness"], w.math("MULTIPLY_ADD", streak, -0.06, 0.88))
    bump = w.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value, bump.inputs["Distance"].default_value = 0.45, 0.004
    w.feed(bump.inputs["Height"], w.math("MULTIPLY", streak, 0.2))
    w.feed(bsdf.inputs["Normal"], bump.outputs["Normal"])
    w.feed(w.new("ShaderNodeOutputMaterial").inputs["Surface"], bsdf.outputs["BSDF"])
    return mat


def _source(sock):
    """What feeds an input: the output linked to it, else its own value (a colour as RGB)."""
    if sock.is_linked:
        return sock.links[0].from_socket
    v = sock.default_value
    return tuple(v)[:3] if hasattr(v, "__len__") else v


def _root_zone(nt):
    """Blend the bark's colour, roughness and bump height into the root zone by rb_root_t, at the Principled BSDF."""
    w = _Nodes(nt)
    bsdf = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    src = _source
    colour, rough = src(bsdf.inputs["Base Color"]), src(bsdf.inputs["Roughness"])
    nrm = bsdf.inputs["Normal"]
    bump = nrm.links[0].from_node if nrm.is_linked and nrm.links[0].from_node.bl_idname == "ShaderNodeBump" else None
    if bump is None:
        bump = w.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value, bump.inputs["Distance"].default_value = 0.45, 0.004
        w.feed(nrm, bump.outputs["Normal"])
    height = src(bump.inputs["Height"])
    t = w.new("ShaderNodeAttribute", attribute_type="GEOMETRY", attribute_name=ROOT_T).outputs["Fac"]
    var = w.new("ShaderNodeAttribute", attribute_type="GEOMETRY", attribute_name=ROOT_VAR).outputs["Fac"]
    zone = w.map_range(t, 0.3, 1.0, 0.0, 1.0)                  # 0 on the upper boss (pure bark) -> 1 at the soil
    tex = w.map_range(t, 0.2, 0.85, 0.0, 1.0)
    grain = w.map_range(w.noise(55.0, 55.0, 7.0, 5.0, 0.6), 0.25, 0.75, 0.0, 1.0)   # coarser fibres, running up
    root_f = w.math("MULTIPLY", w.math("MULTIPLY_ADD", grain, 0.26, 0.87), w.math("MULTIPLY_ADD", var, 0.13, 1.0))
    root_col = w.scale(SOIL_RGB, root_f)
    w.feed(bsdf.inputs["Base Color"], w.mix(tex, colour, w.mix(zone, w.scale(colour, root_f), root_col)))
    w.feed(bsdf.inputs["Roughness"], w.lerp(rough, 0.92, zone))
    w.feed(bump.inputs["Height"], w.lerp(height, w.math("MULTIPLY", grain, 0.45), tex))


def materials() -> list:
    """RBP_palm_root, created or refreshed (its users kept): palm_trunk.py's bark blended into the root zone."""
    name = MATERIAL_NAMES[0]
    mat = _bark_source()
    old = bpy.data.materials.get(name)
    if old is not None and old != mat:
        old.user_remap(mat)
        bpy.data.materials.remove(old)
    mat.name = name
    _root_zone(mat.node_tree)
    mat.diffuse_color = (*BARK_RGB, 1.0)
    mat.roughness = 0.9
    return [mat]


# ---------------------------------------------------------------- module tests (headless, never saved)
def _plain(name, rgb, rough):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    return mat


def _box(bm, x0, x1, y0, y1, z0, z1, slot_top=0):
    vs = [bm.verts.new((x, y, z)) for z in (z0, z1) for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f]).material_index = slot_top if f == (4, 5, 6, 7) else 0


def _planter(name, coll, at, hx, hy, height, rim, drop):
    """A raised planter like the site's tree pits / roof troughs: a body to the soil, rim walls above it."""
    bm = bmesh.new()
    _box(bm, -hx, hx, -hy, hy, 0.0, height - drop, slot_top=1)
    z0, z1 = height - drop, height
    for x0, x1, y0, y1 in ((-hx, hx, -hy, -hy + rim), (-hx, hx, hy - rim, hy), (-hx, -hx + rim, -hy + rim, hy - rim),
                           (hx - rim, hx, -hy + rim, hy - rim)):
        _box(bm, x0, x1, y0, y1, z0, z1)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    paving = bpy.data.materials.get("TM_RB_paving") or _plain("TEST_paving", (0.62, 0.58, 0.52), 0.7)
    me.materials.append(paving)
    me.materials.append(_plain("TEST_soil", (0.10, 0.075, 0.055), 0.95))
    ob = bpy.data.objects.new(name, me)
    ob.location = (at[0], at[1], 0.0)
    coll.objects.link(ob)
    return height - drop


def _palm_foot(name, coll, at, soil_z, r_trunk, seed, trunk_len, sides=24):
    """build_base + a plain cylinder trunk welded on its top ring as the composer does (wearing palm_trunk.py's bark
    when it imports); returns the info and the weld."""
    bm = bmesh.new()
    info = build_base(bm, random.Random(f"palm_base:{seed}"), r_trunk=r_trunk, sides=sides)
    h = info["top_z"]
    before = [v for v in bm.verts if abs(v.co.z - h) < 1e-7 and abs(math.hypot(v.co.x, v.co.y) - r_trunk) < 1e-7]
    rings = [[bm.verts.new((r_trunk * math.cos(TAU * k / sides), r_trunk * math.sin(TAU * k / sides), h + z))
              for k in range(sides)] for z in [trunk_len * i / 8 for i in range(9)]]
    uv = bm.loops.layers.uv.verify()
    for lo, up in zip(rings, rings[1:]):
        for k in range(sides):
            f = bm.faces.new((lo[k], lo[(k + 1) % sides], up[(k + 1) % sides], up[k]))
            f.smooth, f.material_index = True, 1
            for lp, du in zip(f.loops, (0, 1, 1, 0)):
                lp[uv].uv = ((k + du) / sides, lp.vert.co.z - h)
    bm.faces.new(rings[-1]).material_index = 1
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=before + rings[0], dist=1e-5)
    welded = n0 - len(bm.verts)
    bm.normal_update()
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(materials()[0])
    bark = bpy.data.materials.get("RBP_palm_bark")
    me.materials.append(bark or me.materials[0])
    ob = bpy.data.objects.new(name, me)
    ob.location = (at[0], at[1], soil_z)
    coll.objects.link(ob)
    return dict(info, welded=welded, open_edges=boundary, trunk_material=me.materials[1].name)


def _aim(cam, loc, target, vfov):
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(vfov)


def _test(argv):
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    if os.path.dirname(HERE) not in sys.path:
        sys.path.insert(0, os.path.dirname(HERE))
    import tm_common as C  # noqa: E402
    from render_inspection import use_gpu  # noqa: E402
    if "INSPECTION_RIG" not in bpy.data.collections:
        bpy.ops.wm.open_mainfile(filepath=os.path.join(C.ROOT, "tests/artifacts/blender/terramar_recessed/rebuild/"
                                                               "terramar_building.blend"))
    out = os.path.abspath(opts.get("out", os.path.join(C.ROOT, "tests/artifacts/screens/buildings/terramar_recessed/"
                                                               "rebuild/palm_detail/base")))
    os.makedirs(out, exist_ok=True)
    scene = bpy.context.scene
    coll = bpy.data.collections.new("PALM_BASE_TEST")
    scene.collection.children.link(coll)
    sx, sy, rx, seed = 40.0, -45.0, 43.0, int(opts.get("seed", 1))
    soil = _planter("test_pit", coll, (sx, sy), 0.6, 0.6, 0.40, 0.06, 0.04)          # the street tree pit
    street = _palm_foot("test_base_street", coll, (sx, sy), soil, 0.24, seed, 1.6)
    roof_soil = _planter("test_trough", coll, (rx, sy), 0.7, 0.315, 0.30, 0.03, 0.04)  # a roof trough
    roof = _palm_foot("test_base_roof", coll, (rx, sy), roof_soil, 0.10, seed + 1, 0.9)
    for tag, info in (("street", street), ("roof", roof)):
        print(f"PALM_BASE {tag}: " + " ".join(f"{k}={round(v, 4) if isinstance(v, float) else v}"
                                              for k, v in info.items()))
    hs = soil + street["top_z"]
    shots = {"street_eye": ((sx + 1.0, sy - 3.4, 1.55), (sx, sy, 0.78), 32.0),
             "street_low": ((sx + 0.42, sy - 1.12, 0.56), (sx, sy, 0.47), 40.0),
             "street_above": ((sx + 0.35, sy - 0.85, 1.55), (sx, sy, soil), 50.0),
             "roof": ((rx + 0.38, sy - 1.0, 0.60), (rx, sy, roof_soil + 0.08), 34.0),
             "seam": ((sx + 0.5, sy - 1.6, hs + 0.1), (sx, sy, hs), 30.0),
             "seam_clay": ((sx + 0.5, sy - 1.6, hs + 0.1), (sx, sy, hs), 30.0)}
    pick = [s for s in opts.get("shots", ",".join(shots)).split(",") if s]
    device = use_gpu(scene)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    cam = bpy.data.objects.new("PALM_BASE_CAM", bpy.data.cameras.new("PALM_BASE_CAM"))
    cam.data.clip_start = 0.02
    coll.objects.link(cam)
    scene.camera = cam
    clay = _plain("TEST_clay", (0.5, 0.5, 0.5), 0.6)
    for name in pick:
        loc, target, vfov = shots[name]
        _aim(cam, loc, target, vfov)
        bpy.context.view_layer.material_override = clay if name.endswith("_clay") else None
        scene.render.filepath = os.path.join(out, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"PALM_BASE rendered {name} ({device}) -> {scene.render.filepath}")
    bpy.context.view_layer.material_override = None


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
