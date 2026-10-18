# roof_units.py -- 2026-10-15: the penthouse roof's mechanical plant, detailed (the user: "improve the quality of the
# machines on top of penthouse"). Replaces AI 647's plain unit boxes; layer_roof.py calls it for plan["roof"]["units"],
# ["pipe_tray"] and ["roof_hood"].
#
# Pieces, all built into a caller's bmesh in world coordinates (every one a closed solid; box UVs in metres):
#   unit(m, u, z, seed)   one condensing unit inside its plan rect u["x"] x u["y"], no higher than z + u["h"]:
#       kind "top_fan"    a top-discharge unit: galvanised rails on rubber pads, four feet, a base pan, corner posts,
#                         finned coil faces behind a wire guard on its coil sides, a service side of seamed panels
#                         (screws, a handle, a nameplate), a top deck with u["fans"] bell mouths, each holding a fan
#                         (hub, motor, 4-5 pitched and swept blades, a motor bracket) under a domed wire guard (rings
#                         and spokes), and a pipe cover where the refrigerant lines leave
#       kind "side_fan"   a side-discharge condenser: the fan and its round guard on u["fan_side"], a service panel
#                         beside it, coil faces on the other sides, a plain lid
#   pipes(m, path, r)     an insulated refrigerant line along a polyline (bends rounded)
#   tray(m, ...)          the covered galvanised pipe tray on rubber blocks, ending at the roof hood
#   hood(m, ...)          the roof penetration: a galvanised curb with a hipped cap the lines drop through
#   lift / stair door pieces are layer_roof.py's; materials() also makes their brushed steel.
# Materials (procedural, no textures): TM_RB_unit_casing / TM_RB_unit_casing_cool (light grey powder coat with a fine
# orange peel; the units alternate), TM_RB_unit_coil (aluminium fins at 2.2 mm, dark gaps), TM_RB_unit_grille (dark
# wire), TM_RB_unit_fan (blades), TM_RB_unit_galv (galvanised steel with a faint spangle), TM_RB_unit_pipe (black
# closed-cell insulation, also the rubber pads), TM_RB_lift_steel (brushed stainless).
# Test render (never saved): blender -b terramar_building.blend --python roof_units.py -- out=<dir>
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
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
import furniture_materials as FM  # noqa: E402  (the node writer)

CASING, CASING_COOL = "TM_RB_unit_casing", "TM_RB_unit_casing_cool"
COIL, GRILLE, FAN = "TM_RB_unit_coil", "TM_RB_unit_grille", "TM_RB_unit_fan"
GALV, PIPE, LIFT_STEEL = "TM_RB_unit_galv", "TM_RB_unit_pipe", "TM_RB_lift_steel"
SLOTS = [CASING, CASING_COOL, COIL, GRILLE, FAN, GALV, PIPE, LIFT_STEEL]
DIM = {"rail": 0.08, "rail_w": 0.08, "pad": 0.02, "foot": 0.05, "inset": 0.01, "post": 0.05, "pan": 0.09,
       "deck": 0.05, "dome": 0.03, "coil_back": 0.02, "wire": 0.0035, "wire_pitch": 0.05, "seam": 0.005,
       "panel": 0.012}


# ---------------------------------------------------------------- mesh writer


class Frame:
    """A local frame: a along e1, b along e2, d along n (outward)."""

    def __init__(self, origin, e1, e2, n):
        self.o, self.e1, self.e2, self.n = Vector(origin), Vector(e1), Vector(e2), Vector(n)

    def __call__(self, a, b, d=0.0):
        return self.o + self.e1 * a + self.e2 * b + self.n * d


WORLD = Frame((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1))


class Mesh:
    """Faces into a bmesh with material indices from the slot list, smooth flags per piece."""

    def __init__(self, bm, slots=SLOTS):
        self.bm, self.slots = bm, list(slots)

    def mat(self, name):
        if name not in self.slots:
            self.slots.append(name)
        return self.slots.index(name)

    def face(self, pts, mat, smooth=False):
        f = self.bm.faces.new(pts)
        f.material_index = self.mat(mat)
        f.smooth = smooth
        return f

    def verts(self, pts):
        return [self.bm.verts.new(p) for p in pts]

    def box(self, F, a0, a1, b0, b1, d0, d1, mat):
        v = self.verts([F(a, b, d) for d in (d0, d1) for b in (b0, b1) for a in (a0, a1)])
        for q in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
            self.face([v[i] for i in q], mat)

    def frustum(self, x0, x1, y0, y1, z0, z1, inset, mat):
        """A box whose top is inset on every side (a hipped cap)."""
        v = self.verts([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                        (x0 + inset, y0 + inset, z1), (x1 - inset, y0 + inset, z1), (x1 - inset, y1 - inset, z1),
                        (x0 + inset, y1 - inset, z1)])
        self.face([v[3], v[2], v[1], v[0]], mat)
        self.face(v[4:], mat)
        for k in range(4):
            self.face([v[k], v[(k + 1) % 4], v[4 + (k + 1) % 4], v[4 + k]], mat)

    def cylinder(self, F, ca, cb, r, d0, d1, mat, n=16):
        """A capped cylinder along the frame's n."""
        ring = [(ca + r * math.cos(2 * math.pi * k / n), cb + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        lo = self.verts([F(a, b, d0) for a, b in ring])
        hi = self.verts([F(a, b, d1) for a, b in ring])
        self.face(lo[::-1], mat)
        self.face(hi, mat)
        for k in range(n):
            self.face([lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]], mat, smooth=True)

    def annulus(self, F, ca, cb, r0, r1, d0, d1, mat, n=32):
        """A ring solid (a shroud) along the frame's n."""
        def pts(r, d):
            return self.verts([F(ca + r * math.cos(2 * math.pi * k / n), cb + r * math.sin(2 * math.pi * k / n), d)
                               for k in range(n)])
        il, ih, ol, oh = pts(r0, d0), pts(r0, d1), pts(r1, d0), pts(r1, d1)
        for k in range(n):
            j = (k + 1) % n
            self.face([ol[k], ol[j], oh[j], oh[k]], mat, smooth=True)
            self.face([il[j], il[k], ih[k], ih[j]], mat, smooth=True)
            self.face([ih[k], oh[k], oh[j], ih[j]], mat)
            self.face([il[j], ol[j], ol[k], il[k]], mat)

    def holed_plate(self, F, a0, a1, b0, b1, ca, cb, r, d0, d1, mat, n=40):
        """A plate over [a0, a1] x [b0, b1] with a round hole: the rectangle's corners join the circle's points."""
        corners = [(a1, b1), (a0, b1), (a0, b0), (a1, b0)]
        angs = sorted({2 * math.pi * k / n for k in range(n)} |
                      {math.atan2(cy - cb, cx - ca) % (2 * math.pi) for cx, cy in corners})
        outer, inner = [], []
        for t in angs:
            c, s = math.cos(t), math.sin(t)
            ka = (a1 - ca) / c if c > 1e-9 else (a0 - ca) / c if c < -1e-9 else 1e9
            k = min(ka, (b1 - cb) / s if s > 1e-9 else (b0 - cb) / s if s < -1e-9 else 1e9)
            outer.append((ca + k * c, cb + k * s))
            inner.append((ca + r * c, cb + r * s))
        m = len(angs)
        ot, ob = self.verts([F(a, b, d1) for a, b in outer]), self.verts([F(a, b, d0) for a, b in outer])
        it, ib = self.verts([F(a, b, d1) for a, b in inner]), self.verts([F(a, b, d0) for a, b in inner])
        for k in range(m):
            j = (k + 1) % m
            self.face([it[k], ot[k], ot[j], it[j]], mat)
            self.face([ib[j], ob[j], ob[k], ib[k]], mat)
            self.face([ob[k], ob[j], ot[j], ot[k]], mat)
            self.face([ib[k], it[k], it[j], ib[j]], mat, smooth=True)

    def tube(self, pts, r, mat, n=10, cyclic=False, caps=True):
        """A round tube along a polyline of Vectors (parallel-transported rings, no twist)."""
        P = [Vector(p) for p in pts]
        m = len(P)
        tans = []
        for i in range(m):
            if cyclic:
                t = (P[(i + 1) % m] - P[i - 1])
            else:
                t = P[min(i + 1, m - 1)] - P[max(i - 1, 0)]
            tans.append(t.normalized())
        ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
        u = (ref - tans[0] * ref.dot(tans[0])).normalized()
        rings = []
        for i in range(m):
            u = (u - tans[i] * u.dot(tans[i])).normalized()
            w = tans[i].cross(u)
            rings.append(self.verts([P[i] + (u * math.cos(2 * math.pi * k / n) + w * math.sin(2 * math.pi * k / n)) * r
                                     for k in range(n)]))
        for i in range(m if cyclic else m - 1):
            a, b = rings[i], rings[(i + 1) % m]
            for k in range(n):
                self.face([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]], mat, smooth=True)
        if caps and not cyclic:
            self.face(rings[0][::-1], mat)
            self.face(rings[-1], mat)

    def sheet(self, top, bottom, mat, smooth=True):
        """A thin solid between two point grids [i][j] (a blade)."""
        T = [self.verts(row) for row in top]
        B = [self.verts(row) for row in bottom]
        ni, nj = len(T), len(T[0])
        for i in range(ni - 1):
            for j in range(nj - 1):
                self.face([T[i][j], T[i + 1][j], T[i + 1][j + 1], T[i][j + 1]], mat, smooth)
                self.face([B[i][j + 1], B[i + 1][j + 1], B[i + 1][j], B[i][j]], mat, smooth)
        ring = [(i, 0) for i in range(ni)] + [(ni - 1, j) for j in range(1, nj)] + \
               [(i, nj - 1) for i in range(ni - 2, -1, -1)] + [(0, j) for j in range(nj - 2, 0, -1)]
        for k in range(len(ring)):
            (i0, j0), (i1, j1) = ring[k], ring[(k + 1) % len(ring)]
            self.face([T[i0][j0], B[i0][j0], B[i1][j1], T[i1][j1]], mat, smooth)


def rounded(path, radius, steps=4):
    """A polyline with its inner corners replaced by quadratic arcs of about `radius`."""
    P = [Vector(p) for p in path]
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, c, b = P[i - 1], P[i], P[i + 1]
        r = min(radius, (c - a).length * 0.45, (b - c).length * 0.45)
        p0, p1 = c + (a - c).normalized() * r, c + (b - c).normalized() * r
        for s in range(steps + 1):
            t = s / steps
            out.append(p0 * (1 - t) ** 2 + c * 2 * t * (1 - t) + p1 * t * t)
    out.append(P[-1])
    return out


# ---------------------------------------------------------------- the fan and its guard


def fan(m, F, R, depth, dome, blades, seed):
    """A fan in frame F centred on (0, 0), its opening of radius R at d = 0: a shroud down to -depth closed by a dark
    plenum disc, a motor on a two-bar bracket, a hub and `blades` pitched, swept blades, and over the opening a guard
    domed `dome` high (seven rings and eight spokes on a rim ring)."""
    rng = random.Random(f"fan:{seed}")
    m.annulus(F, 0.0, 0.0, R, R + 0.008, -depth, 0.0, GRILLE)
    m.cylinder(F, 0.0, 0.0, R + 0.008, -depth - 0.012, -depth, GRILLE, 40)
    d_bl = -0.10                                                        # the blade plane, below the rim
    m.cylinder(F, 0.0, 0.0, 0.10, -depth * 0.62, d_bl - 0.045, GRILLE, 20)      # the motor
    for sb in (-0.07, 0.07):                                            # its bracket, across the shroud
        m.box(F, -R + 0.004, R - 0.004, sb - 0.012, sb + 0.012, -depth * 0.62 - 0.03, -depth * 0.62, GALV)
    m.cylinder(F, 0.0, 0.0, 0.075, d_bl - 0.045, d_bl + 0.02, FAN, 20)          # the hub
    m.cylinder(F, 0.0, 0.0, 0.035, d_bl + 0.02, d_bl + 0.032, FAN, 12)
    r0, r1 = 0.07, R - 0.025
    sweep, phase = 0.42, rng.uniform(0.0, 2 * math.pi)
    for k in range(blades):
        phi0 = phase + 2 * math.pi * k / blades
        top, bot = [], []
        for i in range(7):
            s = i / 6
            r = r0 + (r1 - r0) * s
            chord = 0.07 + (0.19 - 0.07) * s ** 0.8 * (1.0 - 0.25 * s ** 4)
            pitch = math.radians(34.0 - 16.0 * s)
            phi = phi0 + sweep * s * s
            half = chord / 2 / r
            rt, rb = [], []
            for j in range(5):
                c = j / 4
                t = phi + (c - 0.5) * 2 * half
                rise = (c - 0.5) * chord * math.tan(pitch) + 0.008 * (1 - (2 * c - 1) ** 2)
                rt.append(F(r * math.cos(t), r * math.sin(t), d_bl + rise + 0.002))
                rb.append(F(r * math.cos(t), r * math.sin(t), d_bl + rise - 0.002))
            top.append(rt)
            bot.append(rb)
        m.sheet(top, bot, FAN)
    # the guard: rim ring on the deck, rings rising to the dome, spokes over them, a centre badge
    z = lambda r: 0.004 + dome * max(0.0, 1.0 - (r / (R + 0.02)) ** 2) * 0.96  # noqa: E731
    w = DIM["wire"] / 2
    m.tube([F((R + 0.02) * math.cos(2 * math.pi * k / 48), (R + 0.02) * math.sin(2 * math.pi * k / 48), 0.007)
            for k in range(48)], 0.007, GRILLE, n=6, cyclic=True)
    for i in range(1, 8):
        r = (R + 0.02) * i / 8
        nseg = max(16, int(48 * i / 8))
        ring = [F(r * math.cos(2 * math.pi * k / nseg), r * math.sin(2 * math.pi * k / nseg), z(r) + w)
                for k in range(nseg)]
        m.tube(ring, w, GRILLE, n=5, cyclic=True)
    for k in range(8):
        t = 2 * math.pi * (k + 0.5) / 8
        radii = [0.05 + (R + 0.02 - 0.05) * s / 6 for s in range(7)]
        m.tube([F(r * math.cos(t), r * math.sin(t), z(r) + 3 * w) for r in radii], w * 1.2, GRILLE, n=5)
    m.cylinder(F, 0.0, 0.0, 0.065, z(0.0) + 2 * w, z(0.0) + 5 * w, GRILLE, 20)


# ---------------------------------------------------------------- cabinet sides


def side_frame(side, x0, x1, y0, y1):
    """The frame of one cabinet side: a along it (increasing x or y), b = z, d outward from the side's plane; and its
    a range."""
    if side == "-y":
        return Frame((0, y0, 0), (1, 0, 0), (0, 0, 1), (0, -1, 0)), (x0, x1)
    if side == "+y":
        return Frame((0, y1, 0), (1, 0, 0), (0, 0, 1), (0, 1, 0)), (x0, x1)
    if side == "-x":
        return Frame((x0, 0, 0), (0, 1, 0), (0, 0, 1), (-1, 0, 0)), (y0, y1)
    return Frame((x1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 0, 0)), (y0, y1)


def coil_side(m, F, a0, a1, z0, z1):
    """Finned coil recessed behind a wire guard: verticals behind, horizontals in front."""
    D = DIM
    m.box(F, a0, a1, z0, z1, -D["coil_back"] - 0.04, -D["coil_back"], COIL)
    w = D["wire"] / 2
    n = max(2, round((a1 - a0) / D["wire_pitch"]))
    for k in range(1, n):
        a = a0 + (a1 - a0) * k / n
        m.box(F, a - w, a + w, z0, z1, -0.016, -0.016 + 2 * w, GRILLE)
    nz = max(2, round((z1 - z0) / (2 * D["wire_pitch"])))
    for k in range(1, nz):
        b = z0 + (z1 - z0) * k / nz
        m.box(F, a0, a1, b - w, b + w, -0.016 + 2 * w, -0.016 + 4 * w, GRILLE)


def service_side(m, F, a0, a1, z0, z1, casing, rng, split_a=None):
    """Seamed service panels flush with the cabinet face on a backing plate, screws at their corners, a handle on the
    upper panel and a nameplate."""
    D = DIM
    m.box(F, a0, a1, z0, z1, -0.035, -0.02, casing)                     # backing, seen in the seams
    cuts_a = [a0] + ([split_a] if split_a else []) + [a1]
    zs = z0 + (z1 - z0) * rng.uniform(0.42, 0.5)
    for i in range(len(cuts_a) - 1):
        for j, (b0, b1) in enumerate(((z0, zs), (zs, z1))):
            pa0 = cuts_a[i] + (D["seam"] / 2 if i > 0 else 0.0)
            pa1 = cuts_a[i + 1] - (D["seam"] / 2 if i < len(cuts_a) - 2 else 0.0)
            pb0 = b0 + (D["seam"] / 2 if j == 1 else 0.0)
            pb1 = b1 - (D["seam"] / 2 if j == 0 else 0.0)
            m.box(F, pa0, pa1, pb0, pb1, -D["panel"], 0.0, casing)
            for sa in (pa0 + 0.025, pa1 - 0.025):
                for sb in (pb0 + 0.025, pb1 - 0.025):
                    m.cylinder(F, sa, sb, 0.006, 0.0, 0.003, GALV, 8)
            if j == 1 and i == 0:
                ha = (pa0 + pa1) / 2
                m.box(F, ha - 0.07, ha + 0.07, pb0 + 0.08, pb0 + 0.11, 0.0, 0.012, GRILLE)
                m.box(F, ha - 0.06, ha + 0.06, pb1 - 0.15, pb1 - 0.07, 0.0, 0.002, GALV)


def cabinet_base(m, x0, x1, y0, y1, z, along_x, rng):
    """Rubber pads, two galvanised rails along the unit's long axis and four feet; returns the cabinet's bottom z."""
    D = DIM
    zr0, zr1 = z + D["pad"], z + D["pad"] + D["rail"]
    if along_x:
        rails = [(y0 + 0.09, y0 + 0.09 + D["rail_w"]), (y1 - 0.09 - D["rail_w"], y1 - 0.09)]
        for r0, r1 in rails:
            m.box(WORLD, x0, x1, r0, r1, zr0, zr1, GALV)
            for px in (x0 + 0.02, (x0 + x1) / 2 - 0.06, x1 - 0.14):
                m.box(WORLD, px, px + 0.12, r0 - 0.02, r1 + 0.02, z, zr0, PIPE)
            for fx in (x0 + 0.05, x1 - 0.15):
                m.box(WORLD, fx, fx + 0.10, r0 - 0.005, r1 + 0.005, zr1, zr1 + D["foot"], GALV)
    else:
        rails = [(x0 + 0.09, x0 + 0.09 + D["rail_w"]), (x1 - 0.09 - D["rail_w"], x1 - 0.09)]
        for r0, r1 in rails:
            m.box(WORLD, r0, r1, y0, y1, zr0, zr1, GALV)
            for py in (y0 + 0.02, (y0 + y1) / 2 - 0.06, y1 - 0.14):
                m.box(WORLD, r0 - 0.02, r1 + 0.02, py, py + 0.12, z, zr0, PIPE)
            for fy in (y0 + 0.05, y1 - 0.15):
                m.box(WORLD, r0 - 0.005, r1 + 0.005, fy, fy + 0.10, zr1, zr1 + D["foot"], GALV)
    return zr1 + D["foot"]


def posts(m, x0, x1, y0, y1, z0, z1, casing):
    p = DIM["post"]
    for px in (x0, x1 - p):
        for py in (y0, y1 - p):
            m.box(WORLD, px, px + p, py, py + p, z0, z1, casing)


def sides(m, u, x0, x1, y0, y1, z0, z1, casing, rng, skip=()):
    """Every cabinet side between the posts: service on u["service"], coil on the others (bar `skip`)."""
    p = DIM["post"]
    for side in ("-y", "+y", "-x", "+x"):
        if side in skip:
            continue
        F, (a0, a1) = side_frame(side, x0, x1, y0, y1)
        if side == u["service"]:
            service_side(m, F, a0 + p, a1 - p, z0, z1, casing, rng, split_a=(a0 + a1) / 2 if a1 - a0 > 1.2 else None)
        else:
            coil_side(m, F, a0 + p, a1 - p, z0, z1)


def pipe_cover(m, u, x0, x1, y0, y1, zp, casing):
    """The cover over the refrigerant outlets on u["pipes"]["side"]; returns its outer face's frame and a range."""
    pc = u["pipes"]
    F, (a0, a1) = side_frame(pc["side"], x0, x1, y0, y1)
    c0, c1 = pc["a"]
    m.box(F, c0, c1, zp, zp + 0.26, 0.0, 0.04, casing)
    return F, (c0, c1)


# ---------------------------------------------------------------- the units


def unit(m, u, z, seed):
    """One unit (see the header) inside u["x"] x u["y"], from z up to z + u["h"]; returns the outlets' world points
    (start, direction) for the pipes."""
    rng = random.Random(f"unit:{seed}")
    D = DIM
    casing = CASING_COOL if u.get("tone") == "cool" else CASING
    e = D["inset"]
    x0, x1, y0, y1 = u["x"][0] + e, u["x"][1] - e, u["y"][0] + e, u["y"][1] - e
    along_x = (x1 - x0) >= (y1 - y0)
    zc0 = cabinet_base(m, x0, x1, y0, y1, z, along_x, rng)
    zp = zc0 + D["pan"]
    m.box(WORLD, x0, x1, y0, y1, zc0, zp, casing)                       # base pan
    top = z + u["h"]
    if u["kind"] == "top_fan":
        zt1 = top - D["dome"] - 0.008
        zt0 = zt1 - D["deck"]
        posts(m, x0, x1, y0, y1, zp, zt0, casing)
        sides(m, u, x0, x1, y0, y1, zp, zt0, casing, rng)
        n = u.get("fans", 1)
        if along_x:
            cells = [(x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n, y0, y1) for k in range(n)]
        else:
            cells = [(x0, x1, y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n) for k in range(n)]
        for k, (a0, a1, b0, b1) in enumerate(cells):
            ca, cb = (a0 + a1) / 2, (b0 + b1) / 2
            R = min(a1 - a0, b1 - b0) / 2 - 0.055
            m.holed_plate(WORLD, a0, a1, b0, b1, ca, cb, R + 0.008, zt0, zt1, casing)
            fan(m, Frame((ca, cb, zt1), (1, 0, 0), (0, 1, 0), (0, 0, 1)), R, min(0.42, zt1 - zp - 0.05),
                D["dome"], u.get("blades", 4), f"{seed}:{k}")
    else:
        zt1 = top
        zt0 = zt1 - 0.03
        m.box(WORLD, x0 - 0.008, x1 + 0.008, y0 - 0.008, y1 + 0.008, zt0, zt1, casing)   # the lid, a touch proud
        posts(m, x0, x1, y0, y1, zp, zt0, casing)
        sides(m, u, x0, x1, y0, y1, zp, zt0, casing, rng, skip=(u["fan_side"],))
        F, (a0, a1) = side_frame(u["fan_side"], x0, x1, y0, y1)
        p = D["post"]
        R = min((zt0 - zp) / 2 - 0.035, (a1 - a0) * 0.36)
        ca = a0 + p + 0.03 + R + 0.01
        cb = (zp + zt0) / 2
        split = ca + R + 0.05
        m.holed_plate(F, a0 + p, split, zp, zt0, ca, cb, R + 0.008, -D["panel"], 0.0, casing)
        service_side(m, F, split + D["seam"], a1 - p, zp, zt0, casing, rng)
        fan(m, Frame(F(ca, cb, 0.0), F.e1, F.e2, F.n), R, min(0.3, (x1 - x0 if F.n.x else y1 - y0) * 0.45),
            0.012, u.get("blades", 3), f"{seed}:side")
    return pipe_cover(m, u, x0, x1, y0, y1, zp, casing)


def pipes(m, path, r, bend=0.06):
    """An insulated refrigerant line along a polyline (bends rounded)."""
    m.tube(rounded(path, bend), r, PIPE, n=12)


def tray(m, x0, x1, y0, y1, z, support_every=0.8):
    """The covered pipe tray: rubber blocks, a galvanised U channel with an end plate at x0, a lid with drip lips."""
    t, zb, zw, lid = 0.012, z + 0.04, z + 0.15, 0.012
    k = max(2, round((x1 - x0) / support_every) + 1)
    for i in range(k):
        cx = x0 + 0.06 + (x1 - x0 - 0.12) * i / (k - 1)
        m.box(WORLD, cx - 0.04, cx + 0.04, y0 - 0.05, y1 + 0.05, z, zb, PIPE)
    m.box(WORLD, x0, x1, y0, y1, zb, zb + t, GALV)
    m.box(WORLD, x0, x1, y0, y0 + t, zb + t, zw, GALV)
    m.box(WORLD, x0, x1, y1 - t, y1, zb + t, zw, GALV)
    m.box(WORLD, x0, x0 + t, y0 + t, y1 - t, zb + t, zw, GALV)
    m.box(WORLD, x0 - 0.01, x1, y0 - 0.01, y1 + 0.01, zw, zw + lid, GALV)
    m.box(WORLD, x0 - 0.01, x1, y0 - 0.01, y0, zw - 0.02, zw, GALV)
    m.box(WORLD, x0 - 0.01, x1, y1, y1 + 0.01, zw - 0.02, zw, GALV)


def hood(m, x0, x1, y0, y1, z, h=0.32):
    """The roof penetration the lines drop through: a galvanised curb with a hipped cap."""
    m.box(WORLD, x0, x1, y0, y1, z, z + h, GALV)
    m.box(WORLD, x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, z + h, z + h + 0.02, GALV)
    m.frustum(x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, z + h + 0.02, z + h + 0.09, 0.2, GALV)


def plant(bm, rf, z):
    """The roof plant of plan["roof"]: the units, their lines into the tray, the tray, the hood. Returns stats."""
    m = Mesh(bm)
    outlets = []
    for i, u in enumerate(rf["units"]):
        F, (c0, c1) = unit(m, u, z, u.get("seed", i))
        outlets.append((u, F, c0, c1))
    tr, hd = rf["pipe_tray"], rf["roof_hood"]
    ty0, ty1 = tr["y"]
    zc = z + 0.095                                                       # the lines enter the tray's side at mid height
    for u, F, c0, c1 in outlets:
        side_y = ty1 if F.n.y < 0 else ty0                               # the tray wall facing the outlet
        zp = z + DIM["pad"] + DIM["rail"] + DIM["foot"] + DIM["pan"]
        for k, (da, r) in enumerate(((0.07, 0.024), (0.15, 0.016))):
            start = F((c0 + c1) / 2 + (da - 0.11), zp + 0.13 - 0.05 * k, 0.04)
            reach = (side_y - start.y)
            mid_y = start.y + reach * 0.45
            path = [start, Vector((start.x, mid_y, start.z)), Vector((start.x, mid_y, zc)),
                    Vector((start.x, side_y, zc))]
            pipes(m, path, r, bend=min(0.05, abs(reach) * 0.3))
    tray(m, tr["x"][0], tr["x"][1], ty0, ty1, z)
    hood(m, hd["x"][0], hd["x"][1], hd["y"][0], hd["y"][1], z)
    box_uvs(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return m.slots


def box_uvs(bm, scale=1.0):
    uv = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    bm.normal_update()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.x * scale, co.y * scale) if ax == 2 else (co.y * scale, co.z * scale) if ax == 0 else \
                (co.x * scale, co.z * scale)


def to_object(name, coll, bm, slots, tags=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for s in slots:
        me.materials.append(bpy.data.materials.get(s) or bpy.data.materials.new(s))
    ob = bpy.data.objects.new(name, me)
    for k, v in (tags or {}).items():
        ob[k] = v
    coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------- materials


def _powder(mat, rgb):
    w = FM.Nodes(mat)
    uv = w.uv()
    drift = w.noise(w.scale(uv, (3.0, 3.0, 3.0)), 1.0, 2.0, 0.5)
    peel = w.noise(w.scale(uv, (300.0, 300.0, 300.0)), 1.0, 1.0, 0.5)
    w.tail(w.tint(tuple(rgb), w.math("MULTIPLY_ADD", drift, 0.04, 0.98)), w.math("MULTIPLY_ADD", drift, 0.08, 0.40),
           peel, 0.03, 0.0006, Specular_IOR_Level=0.5)
    mat.diffuse_color = (*rgb, 1.0)


def _coil(mat):
    """Aluminium fins at 2.2 mm (vertical: the stripes run along the face's U), dark gaps between them."""
    w = FM.Nodes(mat)
    uv = w.new("ShaderNodeUVMap", uv_map=FM.UV_LAYER).outputs["UV"]
    fins = w.wave(uv, 143.0, "X")
    f = w.map(fins, 0.25, 0.75, 0.0, 1.0)
    col = w.mix(f, (0.025, 0.026, 0.028), (0.30, 0.31, 0.32))
    w.tail(col, w.math("MULTIPLY_ADD", f, -0.15, 0.55), f, 0.25, 0.001, Metallic=0.5)
    mat.diffuse_color = (0.16, 0.17, 0.18, 1.0)


def _galv(mat):
    """Galvanised steel: a faint spangle (cells of slightly different tone and roughness)."""
    w = FM.Nodes(mat)
    uv = w.uv()
    vor = w.new("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1")
    w.feed(vor, "Vector", uv)
    vor.inputs["Scale"].default_value = 120.0
    cell = vor.outputs["Color"]
    sep = w.new("ShaderNodeSeparateColor")
    w.feed(sep, 0, cell)
    v = sep.outputs[0]
    w.tail(w.tint((0.52, 0.53, 0.54), w.math("MULTIPLY_ADD", v, 0.05, 0.975)), w.math("MULTIPLY_ADD", v, 0.08, 0.40),
           v, 0.004, 0.0003, Metallic=1.0)
    mat.diffuse_color = (0.6, 0.61, 0.62, 1.0)


def _brushed(mat):
    """Brushed stainless: fine vertical streaks in the roughness."""
    w = FM.Nodes(mat)
    uv = w.new("ShaderNodeUVMap", uv_map=FM.UV_LAYER).outputs["UV"]
    streak = w.noise(w.scale(uv, (600.0, 6.0, 1.0)), 1.0, 2.0, 0.5)
    w.tail((0.62, 0.62, 0.63, 1.0), w.math("MULTIPLY_ADD", streak, 0.12, 0.20), streak, 0.02, 0.0003, Metallic=1.0)
    mat.diffuse_color = (0.62, 0.62, 0.63, 1.0)


def _plain(mat, rgb, rough, metallic=0.0, bump_scale=0.0):
    w = FM.Nodes(mat)
    uv = w.uv()
    grain = w.noise(w.scale(uv, (bump_scale or 1.0,) * 3), 1.0, 2.0, 0.5)
    w.tail((*rgb, 1.0), rough, grain, 0.04 if bump_scale else 0.0, 0.0005, Metallic=metallic)
    mat.diffuse_color = (*rgb, 1.0)


def materials():
    """Create or refresh the plant's materials (and the lift doors' brushed steel)."""
    get = lambda n: bpy.data.materials.get(n) or bpy.data.materials.new(n)  # noqa: E731
    _powder(get(CASING), (0.62, 0.63, 0.62))
    _powder(get(CASING_COOL), (0.57, 0.59, 0.61))
    _coil(get(COIL))
    _galv(get(GALV))
    _brushed(get(LIFT_STEEL))
    _plain(get(GRILLE), (0.025, 0.025, 0.028), 0.45, 0.2)
    _plain(get(FAN), (0.045, 0.047, 0.05), 0.6)
    _plain(get(PIPE), (0.03, 0.03, 0.03), 0.85, 0.0, 260.0)


# ---------------------------------------------------------------- test render


def _test(out):
    """The plan's plant moved to a free spot near x 40, y -45 on the rig's ground, lit by the rig; never saved."""
    import json
    plan = json.load(open(BP.script('terramar/building/rebuild/terramar_plan.json'), encoding="utf-8"))
    rf = json.loads(json.dumps(plan["roof"]))
    dx, dy = 40.0 - rf["units_zone"]["x"][0], -45.0 - rf["units_zone"]["y"][0]
    for u in rf["units"]:
        u["x"] = [v + dx for v in u["x"]]
        u["y"] = [v + dy for v in u["y"]]
        u["pipes"]["a"] = [v + (dx if u["pipes"]["side"].endswith("y") else dy) for v in u["pipes"]["a"]]
    for k in ("pipe_tray", "roof_hood"):
        rf[k]["x"] = [v + dx for v in rf[k]["x"]]
        rf[k]["y"] = [v + dy for v in rf[k]["y"]]
    materials()
    bm = bmesh.new()
    slots = plant(bm, rf, 0.0)
    ob = to_object("roof_units_test", bpy.context.scene.collection, bm, slots)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print("ROOF_UNITS tris", tris, "faces", len(ob.data.polygons))
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1600, 900, 100
    cx, cy = 40.0 + 1.7, -45.0 + 1.2
    for name, loc, tgt, lens in (("front_left", (cx - 3.6, cy - 4.2, 2.6), (cx, cy, 0.45), 40),
                                 ("top_close", (cx - 1.4, cy - 2.2, 2.2), (cx - 1.0, cy - 0.6, 0.6), 35),
                                 ("rear", (cx + 0.6, cy + 3.2, 1.7), (cx - 0.6, cy + 0.1, 0.25), 30)):
        cam = bpy.data.objects.new("cam_" + name, bpy.data.cameras.new("cam_" + name))
        sc.collection.objects.link(cam)
        cam.data.lens = lens
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sc.render.filepath = os.path.join(out, f"units_test_{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    import rb_lib as L
    a = L.args()
    if "out" in a:
        os.makedirs(a["out"], exist_ok=True)
        _test(a["out"])
