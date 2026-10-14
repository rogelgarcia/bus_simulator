# layer_restaurant_l0.py -- AI 635: the ground-floor restaurant, from plan["interior"]["restaurant_l0"].
#
# Run through build.py (layers=restaurant_l0; needs the podium and interior_base layers). Builds
# RB_INTERIOR/RB_RESTAURANT_L0 under TERRAMAR_REBUILD:
#   rb_restaurant_furniture  the tables, chairs and banquettes (AI 630's teak / cushion / charcoal pieces), one object
#   rb_restaurant_bar        the bar against the core's front: a teak counter with a stone top, the back bar (cabinet,
#                            three shelves with LED strips under them) before the core's teak-panelled front, six stools
#   rb_restaurant_wood_ceiling  the slatted teak ceiling hung over the entrance zone (slats, carrier battens, hangers)
#   rb_restaurant_pendants   a pendant over every table: cord, dark bronze drum shade, warm glowing diffuser
#   rb_restaurant_plant_<n>  potted plants (AI 627's pot, the game's viburnum) at the dining bands' ends and by the bar
#   rb_restaurant_fill_<n>   warm area lights under the ceiling over every zone (dining bands, entrance, bar, banquettes):
#                            the ambient light, out of camera and reflection rays; the bar's shelves have LED strips
# The layer checks every footprint against every other and against the core.
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (pots, prototypes, plain materials)
import layer_roof_furniture as RF  # noqa: E402  (furniture pieces, frames)
import layer_roof_planters as RP  # noqa: E402  (prototypes, instances)

for mod in (L, BP, RF, RP):
    importlib.reload(mod)

PARENT = "RB_INTERIOR"
COLLECTION = "RB_RESTAURANT_L0"
LAYER = "restaurant_l0"
LOOKS = {"TM_RB_pendant_metal": ((0.12, 0.085, 0.05), 0.35, 0.8), "TM_RB_bar_top": ((0.70, 0.67, 0.62), 0.30, 0.0)}
GLOW = ("TM_RB_pendant_glow", (1.0, 0.74, 0.48), 400.0)
BAR_GLOW = ("TM_RB_bar_glow", (1.0, 0.78, 0.52), 60.0)                 # the LED strips under the back bar's shelves
PLANT = {"model": "arrowwood_viburnum/mature_02", "height": 1.4, "radius": 0.45, "pot": (0.26, 0.55)}


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def materials():
    for name, (rgb, rough, metal) in LOOKS.items():
        mat = BP.plain_material(name, rgb, rough)
        next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = metal
    for name, (rgb, rough) in RF.LOOKS.items():
        if bpy.data.materials.get(name) is None:
            BP.plain_material(name, rgb, rough)
    for name, rgb, strength in (GLOW, BAR_GLOW):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        b.inputs["Base Color"].default_value = (*rgb, 1.0)
        b.inputs["Emission Color"].default_value = (*rgb, 1.0)
        b.inputs["Emission Strength"].default_value = strength
        nt.links.new(out.inputs["Surface"], b.outputs["BSDF"])
        mat.diffuse_color = (*rgb, 1.0)


def disc(c, r, n=16):
    return [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def rect(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def bar_pieces(bar, z, core, ceiling):
    (x0, x1), (c0, c1), (b0, b1) = bar["x"], bar["counter_y"], bar["back_y"]
    out = [L.piece(rect(core["x"][0], core["x"][1], b1, core["y"][0]), [(z, ceiling)], RF.TEAK),      # teak-panelled wall
           L.piece(rect(x0, x1, c0 + 0.03, c1), [(z, z + bar["counter_h"] - 0.05)], RF.TEAK),           # counter body
           L.piece(rect(x0 - 0.03, x1 + 0.03, c0, c1), [(z + bar["counter_h"] - 0.05, z + bar["counter_h"])], "TM_RB_bar_top"),
           L.piece(rect(x0, x1, b0, b1), [(z, z + 0.9)], RF.TEAK)]                                     # back cabinet
    for h in (1.3, 1.65, 2.0):                                                                          # back shelves,
        out.append(L.piece(rect(x0 + 0.2, x1 - 0.2, b0 + 0.1, b1), [(z + h, z + h + 0.03)], RF.TEAK))
        out.append(L.piece(rect(x0 + 0.25, x1 - 0.25, b0 + 0.12, b0 + 0.15), [(z + h - 0.009, z + h - 0.001)],
                           BAR_GLOW[0]))                                                               # a strip under each
    for sx in (x0 + 0.2, (x0 + x1) / 2, x1 - 0.2):                                                    # shelf uprights
        out.append(L.piece(rect(sx - 0.02, sx + 0.02, b0 + 0.1, b1), [(z + 0.9, z + bar["back_h"])], RF.TEAK))
    for sx in bar["stool_x"]:                                                                           # stools
        c = (sx, c0 - 0.35)
        out.append(L.piece(disc(c, 0.2), [(z, z + 0.02)], RF.METAL))
        out.append(L.piece(disc(c, 0.025, 8), [(z + 0.02, z + 0.70)], RF.METAL))
        out.append(L.piece(disc(c, 0.19), [(z + 0.70, z + 0.76)], RF.TEAK))
    return out


def wood_ceiling_pieces(wc, ceiling):
    (x0, x1), (y0, y1) = wc["x"], wc["y"]
    zb = wc["z"]
    sw, st = wc["slat"]
    out = []
    n = int((x1 - x0 - sw) // wc["pitch"]) + 1
    off = (x1 - x0 - sw - (n - 1) * wc["pitch"]) / 2
    for k in range(n):                                                                                  # slats along y
        xs = x0 + off + k * wc["pitch"]
        out.append(L.piece(rect(xs, xs + sw, y0, y1), [(zb - st, zb)], RF.TEAK))
    battens = [y0 + 0.3, (y0 + y1) / 2, y1 - 0.3]
    for yb in battens:                                                                                  # carrier battens over them
        out.append(L.piece(rect(x0, x1, yb - 0.025, yb + 0.025), [(zb, zb + 0.05)], RF.TEAK))
        for xh in (x0 + 0.3, (x0 + x1) / 2, x1 - 0.3):                                                  # hangers to the ceiling
            out.append(L.piece(disc((xh, yb), 0.006, 6), [(zb + 0.05, ceiling)], RF.METAL))
    return out, [x0 + off + k * wc["pitch"] + sw / 2 for k in range(n)]


def pendant_pieces(p, cfg, z_floor, slat_x=None):
    c = list(p["at"])
    if slat_x is not None and p["top"] < 5.0:                                                           # under the wood ceiling:
        c[0] = min(slat_x, key=lambda x: abs(x - c[0]))                                                 # hang from a slat
    zs = z_floor + cfg["drop_to"]
    sh, sr = cfg["shade_h"], cfg["shade_r"]
    return [L.piece(disc(c, cfg["cord_r"], 6), [(zs + sh, p["top"])], "TM_RB_pendant_metal"),
            L.piece(disc(c, sr, 20), [(zs, zs + sh)], "TM_RB_pendant_metal"),
            L.piece(disc(c, sr - 0.02, 20), [(zs - 0.012, zs)], GLOW[0])]


def fill_zones(rl):
    """Rectangles (centre, width, depth, angle, top) over the zones: dining bands, entrance, bar, banquette strips."""
    cfg = rl["config"]
    out = []
    for zone in rl["zones"]:
        p0, p1, p2 = zone["loop"][0], zone["loop"][1], zone["loop"][2]
        c = [sum(q[0] for q in zone["loop"]) / 4, sum(q[1] for q in zone["loop"]) / 4]
        out.append((c, math.dist(p0, p1), math.dist(p1, p2), math.atan2(p1[1] - p0[1], p1[0] - p0[0]), rl["ceiling"]))
    E, wc, bar = cfg["entrance"], cfg["wood_ceiling"], rl["bar"]
    out.append(([sum(E["x"]) / 2, sum(E["y"]) / 2], E["x"][1] - E["x"][0], E["y"][1] - E["y"][0], 0.0,
                wc["z"] - wc["slat"][1]))                                                               # under the slats
    out.append(([sum(bar["x"]) / 2, (E["y"][1] + bar["back_y"][1]) / 2], bar["x"][1] - bar["x"][0],
                bar["back_y"][1] - E["y"][1], 0.0, rl["ceiling"]))
    (x0, x1), (y0, y1), d = rl["core"]["x"], rl["core"]["y"], cfg["fill"]["strip"]
    out += [([x0 - d / 2, (y0 + y1) / 2], d, y1 - y0, 0.0, rl["ceiling"]),                             # banquette strips
            ([x1 + d / 2, (y0 + y1) / 2], d, y1 - y0, 0.0, rl["ceiling"]),
            ([(x0 + x1) / 2, y1 + d / 2], x1 - x0, d, 0.0, rl["ceiling"])]
    return out


def fill_lights(coll, rl):
    """Warm area lights under the ceiling over every zone: the restaurant's ambient light. They face down and stay out
    of camera and reflection rays, so only their light shows (the pendants are the visible sources)."""
    f = rl["config"]["fill"]
    made = []
    for i, (c, w, d, ang, top) in enumerate(fill_zones(rl)):
        name = f"rb_restaurant_fill_{i + 1}"
        data = bpy.data.lights.get(name) or bpy.data.lights.new(name, "AREA")
        data.shape, data.size, data.size_y = "RECTANGLE", w, d
        data.color, data.energy = f["rgb"], f["w_per_m2"] * w * d
        ob = bpy.data.objects.new(name, data)
        coll.objects.link(ob)
        ob.location = (c[0], c[1], top - f["below"])
        ob.rotation_euler = (0.0, 0.0, ang)
        ob.visible_camera = ob.visible_glossy = ob.visible_transmission = False
        for k, v in tags("light", name).items():
            ob[k] = v
        made.append(ob)
    return made


def poly_overlap(a, b):
    for shape in (a, b):
        for i in range(len(shape)):
            (ax, ay), (bx, by) = shape[i], shape[(i + 1) % len(shape)]
            nx, ny = by - ay, ax - bx
            pa = [nx * x + ny * y for x, y in a]
            pb = [nx * x + ny * y for x, y in b]
            if max(pa) <= min(pb) + 1e-6 or max(pb) <= min(pa) + 1e-6:
                return False
    return True


def checks(rl):
    polys = [(f"{it['group']}:{it['kind']}#{i}", RF.corners(it)) for i, it in enumerate(rl["items"])]
    problems = []
    for i in range(len(polys)):
        for j in range(i + 1, len(polys)):
            if poly_overlap(polys[i][1], polys[j][1]):
                problems.append(f"{polys[i][0]} overlaps {polys[j][0]}")
    c = rl["core"]
    m = rl["config"]["core_clear"]
    core = rect(c["x"][0], c["x"][1], c["y"][0], c["y"][1])
    for name, poly in polys:
        if "banquettes" in name:
            continue                                                  # the banquettes stand against the core
        grown = rect(c["x"][0] - m, c["x"][1] + m, c["y"][0] - m, c["y"][1] + m)
        if poly_overlap(poly, grown):
            problems.append(f"{name} within {m} m of the core")
    del core
    return problems


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(PARENT, root))
    L.clear_collection(coll)
    materials()
    BP.prop_materials()
    rl = plan["interior"]["restaurant_l0"]
    z = rl["z"]
    made = [L.pieces("rb_restaurant_furniture", coll, [p for it in rl["items"] for p in RF.model(it, z)],
                     tags("furniture", "restaurant_furniture"))]
    made.append(L.pieces("rb_restaurant_bar", coll, bar_pieces(rl["bar"], z, rl["core"], rl["ceiling"]), tags("bar", "bar")))
    wood, slat_x = wood_ceiling_pieces(rl["config"]["wood_ceiling"], rl["ceiling"])
    made.append(L.pieces("rb_restaurant_wood_ceiling", coll, wood, tags("ceiling", "wood_ceiling")))
    pend = [q for p in rl["pendants"] for q in pendant_pieces(p, rl["config"]["pendant"], z, slat_x)]
    made.append(L.pieces("rb_restaurant_pendants", coll, pend, tags("light", "pendants")))
    fills = fill_lights(coll, rl)
    bm = bmesh.new()
    slots = [f"TM_RB_pot_{c}" for c in BP.POT_RGB] + ["TM_RB_soil"]
    r_pot, h_pot = PLANT["pot"]
    for p in rl["plants"]:
        BP.pot(bm, slots, p["at"], p["z"], r_pot, h_pot, "charcoal")
    made.append(L.finish("rb_restaurant_pots", coll, bm, slots, tags("pot", "restaurant_pots"), smooth_deg=40.0))
    protos = {PLANT["model"]: RP.prototype(PLANT["model"])}
    BP.exclude(BP.PROTOTYPES)
    for i, p in enumerate(rl["plants"]):
        spec = {"model": PLANT["model"], "at": p["at"], "z": p["z"] + h_pot - 0.05, "height": PLANT["height"],
                "radius": PLANT["radius"], "rot_deg": (i * 137.5) % 360.0, "kind": "shrub"}
        for ob, _, _ in RP.instances(coll, spec, protos, f"rb_restaurant_plant_{i + 1}"):
            for k, v in tags("plant", ob.name).items():
                ob[k] = v
            made.append(ob)
    problems = checks(rl)
    for p in problems[:20]:
        print("WARNING restaurant:", p)
    kinds = {}
    for it in rl["items"]:
        kinds[it["kind"]] = kinds.get(it["kind"], 0) + 1
    return {"collection": COLLECTION, "objects": len(made), "kinds": kinds, "pendants": len(rl["pendants"]),
            "plants": len(rl["plants"]), "fill_lights": len(fills), "fill_watts": round(sum(o.data.energy for o in fills)),
            "footprint_problems": len(problems), "problems": problems[:10], "names": [o.name for o in made]}
