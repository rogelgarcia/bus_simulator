# layer_awnings.py -- AI 631: the storefront canopies, from plan["props"]["storefront_awnings"].
#
# Run through build.py (layers=awnings; needs the podium layer). Builds RB_PROPS/RB_AWNINGS under TERRAMAR_REBUILD:
#   rb_awnings   every canopy as hexahedra in one object (TM_RB_awning, dark charcoal metal): the wall plate on the
#                storefront head panel, two sloping side rails, the transverse slats between them, the front fascia, and
#                the tie rods from the fascia's top to the stone lintel's face (each rod sheared so its ends are vertical
#                faces: flat on the lintel, standing on the fascia)
# One canopy per podium bay (13): the chamfers' and the sides' and rear storefronts, none over the entrance (b8).
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (PARENT, plain materials)

importlib.reload(L)
importlib.reload(BP)

COLLECTION = "RB_AWNINGS"
LAYER = "awnings"
MATERIAL = ("TM_RB_awning", (0.032, 0.032, 0.035), 0.5, 0.4)          # name, colour, roughness, metallic


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


class Canopy:
    def __init__(self, c, cfg):
        self.p, self.U, self.N = c["p"], c["along"], c["outward"]
        self.v0, self.v1 = c["v"]
        self.z0, self.z1 = c["z_top"]
        self.cfg = c, cfg

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

    def rod(self, s, va, za, vb, zb, h):
        """A square rod from (va, za) up to (vb, zb) at s, its ends vertical faces (sheared, not mitred)."""
        return ([self.pt(s - h, va, za), self.pt(s + h, va, za), self.pt(s + h, vb, zb), self.pt(s - h, vb, zb)]
                + [self.pt(s - h, va, za + 2 * h), self.pt(s + h, va, za + 2 * h), self.pt(s + h, vb, zb + 2 * h),
                   self.pt(s - h, vb, zb + 2 * h)])


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
    for s in c["rods"]:                                                                              # tie rods
        out.append(k.rod(s, v1 - fas_d / 2, fz + 0.04, 0.0, cfg["rod_anchor_z"], cfg["rod"] / 2))
    return out


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    L.clear_collection(coll)
    name, rgb, rough, metal = MATERIAL
    mat = BP.plain_material(name, rgb, rough)
    next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = metal
    aw = plan["props"]["storefront_awnings"]
    hexas = [h for c in aw["canopies"] for h in canopy_hexas(c, aw["config"])]
    ob = L.boxes("rb_awnings", coll, hexas, name, tags("awning", "storefront_awnings"))
    lowest = min(c["z_top"][1] for c in aw["canopies"])
    return {"collection": COLLECTION, "objects": 1, "canopies": len(aw["canopies"]), "hexahedra": len(hexas),
            "rods": sum(len(c["rods"]) for c in aw["canopies"]), "front_top_z": round(lowest, 3),
            "clear_of_lintel_m": round(aw["lintel_bottom"] - max(c["z_top"][0] + 0.02 for c in aw["canopies"]), 3),
            "names": [ob.name]}
