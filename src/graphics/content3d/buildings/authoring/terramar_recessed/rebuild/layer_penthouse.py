# layer_penthouse.py -- AI 638: the penthouse interior, from plan["interior"]["penthouse"].
#
# Run through build.py (layers=penthouse; needs the roof layer, and reuses AI 634/635/637's materials and pieces). Builds
# RB_INTERIOR/RB_PENTHOUSE under TERRAMAR_REBUILD; every object carries rb_hide_from_b8 like the penthouse itself:
#   rb_penthouse_furniture  the annex's lounge corner, the sofa at the front slider, the armchair at the right window
#                           (AI 630's teak / cushion pieces), one object
#   rb_penthouse_kitchen    in the annex: a teak counter run with a stone top on the penthouse wall and a lit shelf over
#                           it, the island (teak body, stone top overhanging the stool side) and three stools
#   rb_penthouse_pendants   pendants over the island, hung from the louvre blades
#   rb_penthouse_downlights small warm lights in the penthouse ceiling (AI 634's TM_RB_ceiling_light)
#   rb_penthouse_lamps      floor lamps by both sofas (AI 637's)
#   rb_penthouse_pots, rb_penthouse_plant_<n>  potted plants in the corners (AI 635's)
#   rb_penthouse_fill_<n>   warm area lights under both ceilings, out of camera and reflection rays
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (plain materials, pots)
import layer_interior_base as IB  # noqa: E402  (the ceiling light material)
import layer_residential as LR  # noqa: E402  (floor lamps, their materials)
import layer_restaurant_l0 as RL  # noqa: E402  (pendants, fills, plants, glow materials)
import layer_roof_furniture as RF  # noqa: E402  (furniture pieces)

for mod in (L, BP, IB, LR, RL, RF):
    importlib.reload(mod)

PARENT = "RB_INTERIOR"
COLLECTION = "RB_PENTHOUSE"
LAYER = "penthouse"


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name,
            "rb_hide_from_b8": 1}


def rect(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def disc(c, r, n=16):
    return [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def kitchen_pieces(ph, annex_x1, z):
    """The counter run on the penthouse wall with its lit shelf, the island and its stools."""
    R, I = ph["config"]["run"], ph["config"]["island"]
    x1 = annex_x1
    x0 = x1 - R["depth"]
    (y0, y1), h, t = R["y"], R["height"], R["top"]
    out = [L.piece(rect(x0, x1, y0, y1), [(z, z + h - t)], RF.TEAK),                                      # run body
           L.piece(rect(x0 - R["top_over"], x1, y0, y1), [(z + h - t, z + h)], "TM_RB_bar_top")]           # stone top
    sh = R["shelf"]
    out.append(L.piece(rect(x1 - sh["depth"], x1, sh["y"][0], sh["y"][1]), [(z + sh["z"], z + sh["z"] + sh["thick"])], RF.TEAK))
    out.append(L.piece(rect(x1 - sh["depth"] + 0.02, x1 - sh["depth"] + 0.05, sh["y"][0] + 0.05, sh["y"][1] - 0.05),
                       [(z + sh["z"] - 0.009, z + sh["z"] - 0.001)], RL.BAR_GLOW[0]))                         # strip under it
    (ix0, ix1), (iy0, iy1) = I["x"], I["y"]
    (b0, b1), h, t = I["body_inset"], I["height"], I["top"]
    out += [L.piece(rect(ix0 + b0, ix1 - b1, iy0 + 0.05, iy1 - 0.05), [(z, z + h - t)], RF.TEAK),          # island body
            L.piece(rect(ix0, ix1, iy0, iy1), [(z + h - t, z + h)], "TM_RB_bar_top")]
    for c in ph["stools"]:                                                                               # stools
        out.append(L.piece(disc(c, 0.18), [(z, z + 0.02)], RF.METAL))
        out.append(L.piece(disc(c, 0.022, 8), [(z + 0.02, z + I["seat"] - 0.06)], RF.METAL))
        out.append(L.piece(disc(c, 0.17), [(z + I["seat"] - 0.06, z + I["seat"])], RF.TEAK))
    return out


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(PARENT, root))
    L.clear_collection(coll)
    RL.materials()
    LR.materials()
    IB.light_material()
    BP.prop_materials()
    ph = plan["interior"]["penthouse"]
    made = [L.pieces("rb_penthouse_furniture", coll, [p for it in ph["items"] for p in RF.model(it, it["z"])],
                     tags("furniture", "penthouse_furniture"))]
    annex_x1 = plan["roof"]["annex"]["x"][1]
    made.append(L.pieces("rb_penthouse_kitchen", coll, kitchen_pieces(ph, annex_x1, ph["walk"]), tags("kitchen", "kitchen")))
    pend = [q for p in ph["pendants"] for q in RL.pendant_pieces(p, ph["config"]["pendant"], ph["walk"])]
    made.append(L.pieces("rb_penthouse_pendants", coll, pend, tags("light", "pendants")))
    dl = ph["config"]["downlight"]
    lights = [L.piece(disc(c, dl["radius"], 12), [(ph["ceiling"] - dl["height"], ph["ceiling"])], IB.LIGHT[0]) for c in ph["downlights"]]
    made.append(L.pieces("rb_penthouse_downlights", coll, lights, tags("light", "downlights")))
    lamp_cfg = plan["interior"]["residential"]["config"]["lamp"]
    made.append(L.pieces("rb_penthouse_lamps", coll, [p for q in ph["lamps"] for p in LR.lamp_pieces(q, lamp_cfg)],
                         tags("lamp", "lamps")))
    fills = RL.fill_lights(coll, ph, "rb_penthouse_fill", tags)
    made += RL.potted_plants(coll, ph, "rb_penthouse", tags)
    for p in ph["problems"][:20]:
        print("WARNING penthouse:", p)
    kinds = {}
    for it in ph["items"]:
        kinds[it["kind"]] = kinds.get(it["kind"], 0) + 1
    return {"collection": COLLECTION, "objects": len(made), "kinds": kinds, "stools": len(ph["stools"]),
            "pendants": len(ph["pendants"]), "downlights": len(ph["downlights"]), "lamps": len(ph["lamps"]),
            "plants": len(ph["plants"]), "fill_lights": len(fills), "fill_watts": round(sum(o.data.energy for o in fills)),
            "footprint_problems": len(ph["problems"]), "problems": ph["problems"][:10], "names": [o.name for o in made]}
