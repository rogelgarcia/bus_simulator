# layer_awnings.py -- AI 631: the storefront canopies, from plan["props"]["storefront_awnings"].
#
# Run through build.py (layers=awnings; needs the podium layer). Builds RB_PROPS/RB_AWNINGS under its part root:
#   rb_awnings   every canopy in one object (TM_RB_awning, dark charcoal metal): as hexahedra the wall plate on the
#                storefront head panel, two sloping side rails, the transverse slats between them and the front fascia;
#                and the tie rods with their hardware (user fix 6, 2026-10-15): each round rod is pinned at both ends,
#                to an eye tab on a bolted anchor plate on the stone lintel's face (the plate's back flat on the stone,
#                nothing into it) and to a smaller tab on a saddle on the fascia's top, through a clevis fork with a jam
#                nut at each end of the rod; the pins have a head and a nut. Hex heads and nuts are turned per instance.
# One canopy per podium bay (13): the chamfers' and the sides' and rear storefronts, none over the entrance (b8).
import importlib
import math
import os
import random
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (PARENT, plain materials)

importlib.reload(L)
importlib.reload(BP)

import bmesh  # noqa: E402

COLLECTION = "RB_AWNINGS"
LAYER = "awnings"
MATERIAL = ("TM_RB_awning", (0.032, 0.032, 0.035), 0.5, 0.4)          # name, colour, roughness, metallic
SEG = 16                       # sides of the round parts (rod, clevis bodies, pins, washers): 22.5 deg, shaded smooth
EYE_SEG = 24                   # sides of a tab's eye and a cheek's round end
TAB_ROOT = 2.3                 # a tab's root, either side of its pin's line, in eye radii (wall tab; the fascia's spans
                               # the fascia's depth less 2 mm each side)
SEED = 631


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


class Canopy:
    def __init__(self, c, cfg):
        self.p, self.U, self.N = c["p"], c["along"], c["outward"]
        self.v0, self.v1 = c["v"]
        self.z0, self.z1 = c["z_top"]
        self.cfg = c, cfg
        self.U3, self.N3 = Vector((self.U[0], self.U[1], 0.0)), Vector((self.N[0], self.N[1], 0.0))

    def pt(self, s, v, z):
        return (self.p[0] + self.U[0] * s + self.N[0] * v, self.p[1] + self.U[1] * s + self.N[1] * v, z)

    def top(self, v):
        """The slat plane's top at v (falls linearly from the back to the front)."""
        return self.z0 + (self.z1 - self.z0) * (v - self.v0) / (self.v1 - self.v0)

    def sloped(self, s0, s1, v0, v1, below, above):
        """A box following the slope: from below to above the slat plane's top, between v0 and v1."""
        b = [self.pt(s0, v0, self.top(v0) - below), self.pt(s1, v0, self.top(v0) - below),
             self.pt(s1, v1, self.top(v1) - below), self.pt(s0, v1, self.top(v1) - below)]
        t = [self.pt(s0, v0, self.top(v0) + above), self.pt(s1, v0, self.top(v0) + above),
             self.pt(s1, v1, self.top(v1) + above), self.pt(s0, v1, self.top(v1) + above)]
        return b + t

    def flat(self, s0, s1, v0, v1, z0, z1):
        return ([self.pt(s0, v0, z0), self.pt(s1, v0, z0), self.pt(s1, v1, z0), self.pt(s0, v1, z0)]
                + [self.pt(s0, v0, z1), self.pt(s1, v0, z1), self.pt(s1, v1, z1), self.pt(s0, v1, z1)])


def canopy_hexas(c, cfg):
    k = Canopy(c, cfg)
    (s0, s1), (v0, v1) = c["s"], c["v"]
    plate_t, plate_h = cfg["plate"]
    rail_w, rail_h = cfg["rail"]
    fas_d, fas_h = cfg["fascia"]
    slat_w, slat_t = cfg["slat"]
    out = [k.flat(s0, s1, v0, v0 + plate_t, k.top(v0) - plate_h + 0.02, k.top(v0) + 0.02)]           # wall plate
    for a, b in ((s0, s0 + rail_w), (s1 - rail_w, s1)):                                             # side rails
        out.append(k.sloped(a, b, v0 + plate_t, v1 - fas_d, rail_h - 0.02, 0.02))
    fz = k.top(v1)
    out.append(k.flat(s0, s1, v1 - fas_d, v1, fz - fas_h + 0.04, fz + 0.04))                        # front fascia
    v = v0 + plate_t + 0.02
    while v + slat_w <= v1 - fas_d - 0.01:                                                          # slats
        out.append(k.sloped(s0 + rail_w, s1 - rail_w, v, v + slat_w, slat_t, 0.0))
        v += cfg["slat_pitch"]
    return out


# ---------------------------------------------------------------------------------------------- tie-rod hardware
def circle(c, r, n, a0=0.0):
    angles = [a0 + 2 * math.pi * i / n for i in range(n)]
    return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in angles]


def hull(points):
    """The 2D convex hull, counter-clockwise (monotone chain)."""
    pts = sorted(set((round(x, 7), round(y, 7)) for x, y in points))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 1e-12:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 1e-12:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def rounded_rect(w, h, r, seg=4):
    out = []
    for cx, cy, a in ((w / 2 - r, h / 2 - r, 0.0), (-w / 2 + r, h / 2 - r, 90.0), (-w / 2 + r, -h / 2 + r, 180.0),
                      (w / 2 - r, -h / 2 + r, 270.0)):
        for i in range(seg + 1):
            t = math.radians(a + 90.0 * i / seg)
            out.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return out


def prism(bm, loop, origin, e1, e2, axis, a0, a1):
    """A closed prism: the 2D loop in the plane (origin, e1, e2), extruded along axis from a0 to a1."""
    bot = [bm.verts.new(origin + e1 * x + e2 * y + axis * a0) for x, y in loop]
    top = [bm.verts.new(origin + e1 * x + e2 * y + axis * a1) for x, y in loop]
    bm.faces.new(bot[::-1])
    bm.faces.new(top)
    n = len(loop)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bot[i], bot[j], top[j], top[i]])


def clevis(bm, pin, d, w, U, hw, tab_t, rng):
    """A rod's clevis fork over a tab at `pin`, its body running along d: two cheeks either side of the tab, the body,
    a jam nut, and the pin (head on +U, nut on -U). Returns the rod's start (the nut's far face) along d."""
    cheek, gap, fork_r, body_r, body_len = hw["clevis"]
    t_in = tab_t / 2 + gap
    t_out = t_in + cheek
    u_body = fork_r + 0.009                                   # the body starts clear of the tab's eye
    u_end = u_body + 0.008                                    # the cheeks run into the body
    w_end = math.sqrt(max(body_r ** 2 - t_out ** 2, 1e-8)) - 0.0005
    prof = hull(circle((0.0, 0.0), fork_r, EYE_SEG) + [(u_end, -w_end), (u_end, w_end)])
    for a, b in ((t_in, t_out), (-t_out, -t_in)):
        prism(bm, prof, pin, d, w, U, a, b)
    prism(bm, circle((0.0, 0.0), body_r, SEG), pin, U, w, d, u_body, body_len)
    prism(bm, circle((0.0, 0.0), body_r, 6, rng.uniform(0, math.pi / 3)), pin, U, w, d, body_len, body_len + hw["nut"])
    r = hw["pin"]
    prism(bm, circle((0.0, 0.0), r, SEG), pin, d, w, U, -t_out - 0.0055 - 0.002, t_out)                # shaft
    prism(bm, circle((0.0, 0.0), r * 1.6, SEG), pin, d, w, U, t_out, t_out + 0.003)                    # head
    prism(bm, circle((0.0, 0.0), r * 1.65, 6, rng.uniform(0, math.pi / 3)), pin, d, w, U, -t_out - 0.0055, -t_out)
    return body_len


def rod_hardware(bm, k, s, c, cfg, rng):
    """One tie rod at s: the wall anchor (plate, bolts, eye tab), the fascia saddle and tab, both clevises, the rod."""
    hw = cfg["hardware"]
    Z = Vector((0.0, 0.0, 1.0))
    U, N = k.U3, k.N3
    v1 = c["v"][1]
    fas_d = cfg["fascia"][0]
    fz = k.top(v1) + 0.04                                     # the fascia's top
    za = cfg["rod_anchor_z"]
    pw_, ph, pt = hw["plate"]
    tab_t, reach, eye_r = hw["tab"]
    base = Vector(k.pt(s, 0.0, 0.0))
    # wall: the plate's back on the lintel's face (v 0), bolts with washers, the eye tab
    prism(bm, rounded_rect(pw_, ph, hw["plate_corner"]), base + Z * za, U, Z, N, 0.0, pt)
    wr, wt = hw["washer"]
    br, bh = hw["bolt"]
    for bs in (-1, 1):
        for bz in (-1, 1):
            at = base + U * (bs * hw["bolt_at"][0]) + Z * (za + bz * hw["bolt_at"][1])
            prism(bm, circle((0.0, 0.0), wr, SEG), at, U, Z, N, pt - 0.0005, pt + wt)
            prism(bm, circle((0.0, 0.0), br, 6, rng.uniform(0, math.pi / 3)), at, U, Z, N, pt + wt - 0.0003,
                  pt + wt + bh)
    root = eye_r * TAB_ROOT
    W2 = (pt + reach, za)                                     # the wall pin in (v, z)
    prism(bm, hull(circle(W2, eye_r, EYE_SEG) + [(pt - 0.001, za - root), (pt - 0.001, za + root)]), base, N, Z, U,
          -tab_t / 2, tab_t / 2)
    # fascia: the saddle on its top (as deep as the fascia), two bolt heads, the tab
    sa_l, sa_t = hw["saddle"]
    vf = v1 - fas_d / 2
    prism(bm, [(-sa_l / 2, -fas_d / 2), (sa_l / 2, -fas_d / 2), (sa_l / 2, fas_d / 2), (-sa_l / 2, fas_d / 2)],
          Vector(k.pt(s, vf, fz)), U, N, Z, 0.0, sa_t)
    for bs in (-1, 1):
        at = Vector(k.pt(s + bs * hw["saddle_bolt_at"], vf, fz))
        prism(bm, circle((0.0, 0.0), br * 0.7, 6, rng.uniform(0, math.pi / 3)), at, U, N, Z, sa_t - 0.0003,
              sa_t + 0.004)
    F2 = (vf, fz + sa_t + hw["fascia_pin"])                   # the fascia pin in (v, z)
    fr = hw["fascia_tab_r"]
    half = fas_d / 2 - 0.002
    prism(bm, hull(circle(F2, fr, EYE_SEG) + [(vf - half, fz + sa_t - 0.001), (vf + half, fz + sa_t - 0.001)]), base,
          N, Z, U, -tab_t / 2, tab_t / 2)
    # the rod between the two pins, a clevis at each end
    W, F = base + N * W2[0] + Z * W2[1], base + N * F2[0] + Z * F2[1]
    d = (F - W).normalized()
    w = U.cross(d).normalized()
    a = clevis(bm, W, d, w, U, hw, tab_t, rng)
    b = clevis(bm, F, -d, -w, U, hw, tab_t, rng)
    prism(bm, circle((0.0, 0.0), cfg["rod"] / 2, SEG), W, U, w, d, a, (F - W).length - b)
    return W, F


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    L.clear_collection(coll)
    name, rgb, rough, metal = MATERIAL
    mat = BP.plain_material(name, rgb, rough)
    next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = metal
    aw = plan["props"]["storefront_awnings"]
    cfg = aw["config"]
    hexas = [h for c in aw["canopies"] for h in canopy_hexas(c, cfg)]
    bm = bmesh.new()
    for pts in hexas:                                         # as L.boxes
        v = [bm.verts.new(p) for p in pts]
        for f in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            bm.faces.new([v[i] for i in f])
    rng = random.Random(SEED)
    pins = []
    for c in aw["canopies"]:
        k = Canopy(c, cfg)
        for s in c["rods"]:
            pins.append(rod_hardware(bm, k, s, c, cfg, rng))
    ob = L.finish("rb_awnings", coll, bm, [name], tags("awning", "storefront_awnings"))
    lowest = min(c["z_top"][1] for c in aw["canopies"])
    slope = [math.degrees(math.atan2(w.z - f.z, (w - f).to_2d().length)) for w, f in pins]
    return {"collection": COLLECTION, "objects": 1, "canopies": len(aw["canopies"]), "hexahedra": len(hexas),
            "rods": len(pins), "rod_slope_deg": [round(min(slope), 2), round(max(slope), 2)],
            "triangles": sum(len(p.vertices) - 2 for p in ob.data.polygons), "front_top_z": round(lowest, 3),
            "clear_of_lintel_m": round(aw["lintel_bottom"] - max(c["z_top"][0] + 0.02 for c in aw["canopies"]), 3),
            "names": [ob.name]}
