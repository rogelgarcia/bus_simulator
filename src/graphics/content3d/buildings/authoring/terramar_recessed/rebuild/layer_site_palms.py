# layer_site_palms.py -- AI 633: street palms, entrance planters and street lamps, site dressing from
# plan["props"]["street_dressing"].
#
# Run through build.py (layers=site_palms; needs site_cafe for the sidewalk). Builds RB_SITE/RB_SITE_PALMS beside the
# building (the street, not the building):
#   rb_site_tree_pits        raised limestone tree-pit planters (TM_RB_paving, soil TM_RB_soil 40 mm below the rim)
#   rb_site_palm_<n>         tall procedural street palms (proc_plants.py "street_palm") in the pits, low viburnum round
#                            each trunk (rb_site_pit_green_<n>)
#   rb_site_entrance_pots    charcoal pots at the entrance (AI 627's tapered pot) with cycads (rb_site_entrance_plant_<n>)
#   rb_site_lamp_<n>         the installed CC0 street_lamp_01 (assets/props, Poly Haven, read-only), imported once as the
#                            prototype RBP_street_lamp_01 and instanced
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
import layer_roof_planters as RP  # noqa: E402  (proc / game prototypes, instances, island boxes)

for mod in (L, BP, RP):
    importlib.reload(mod)

SITE = "RB_SITE"
COLLECTION = "RB_SITE_PALMS"
LAYER = "site_palms"
LAMP_PROTO = "RBP_street_lamp_01"


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": SITE, "tm_role": element, "rb_name": name}


def lamp_prototype(rel_path):
    """The installed glTF lamp, imported once into RB_PROP_PROTOTYPES (the asset files are only read)."""
    coll = bpy.data.collections.get(LAMP_PROTO)
    if coll is not None and len(coll.objects):
        return coll
    path = os.path.join(L.C.ROOT, rel_path)
    if not os.path.exists(path):
        raise SystemExit(f"layer_site_palms: {path} missing (the CC0 street_lamp_01 under assets/props)")
    root = BP.prototype_root()
    coll = coll or bpy.data.collections.new(LAMP_PROTO)
    if coll.name not in root.children:
        root.children.link(coll)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in [o for o in bpy.data.objects if o not in before]:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        o.name = f"{LAMP_PROTO}_{o.name}"
    zs = [(o.matrix_world @ v.co).z for o in coll.objects if o.type == "MESH" for v in o.data.vertices]
    coll["rb_model"] = "assets/props/street_lamp_01"
    coll["rb_height"] = max(zs) - min(zs)
    coll["rb_base_z"] = min(zs)
    BP.exclude(BP.PROTOTYPES)
    return coll


def pit_pieces(loop, z, height, mat, rim=0.06, soil_drop=0.04):
    """A raised square planter: the body up to the soil, then four rim walls (two full sides, two between them), so no
    region with a hole is needed (a turned square's hole meets rb_lib's cut line at its corners)."""
    q = [tuple(p) for p in loop]
    z1 = z + height
    items = [L.piece(q, [(z, z1 - soil_drop)], mat, mat_top="TM_RB_soil")]
    c = (sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4)              # the square's own frame
    side = math.dist(q[0], q[1])
    eu = ((q[1][0] - q[0][0]) / side, (q[1][1] - q[0][1]) / side)
    ev = ((q[3][0] - q[0][0]) / side, (q[3][1] - q[0][1]) / side)
    h = side / 2
    at = lambda u, v: (c[0] + eu[0] * u + ev[0] * v, c[1] + eu[1] * u + ev[1] * v)  # noqa: E731
    walls = [(-h, h, -h, -h + rim), (-h, h, h - rim, h),                         # two full sides
             (-h, -h + rim, -h + rim, h - rim), (h - rim, h, -h + rim, h - rim)]   # two between them
    for u0, u1, v0, v1 in walls:
        foot = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
        area = sum(p[0] * r[1] - r[0] * p[1] for p, r in zip(foot, foot[1:] + foot[:1]))
        items.append(L.piece(foot if area > 0 else list(reversed(foot)), [(z1 - soil_drop, z1)], mat))
    return items


def build(plan):
    site = L.ensure_collection(SITE)
    coll = L.ensure_collection(COLLECTION, site)
    L.clear_collection(coll)
    BP.prop_materials()
    sd = plan["props"]["street_dressing"]
    made = []
    pits = [pit_pieces(p["loop"], p["z"], p["height"], "TM_RB_paving") for p in sd["pits"]]
    made.append(L.pieces("rb_site_tree_pits", coll, [i for pit in pits for i in pit], tags("tree_pit", "tree_pits")))
    bm = bmesh.new()
    slots = [f"TM_RB_pot_{c}" for c in BP.POT_RGB] + ["TM_RB_soil"]
    for p in sd["pots"]:
        BP.pot(bm, slots, p["at"], p["z"], p["radius"], p["height"], p["colour"])
    made.append(L.finish("rb_site_entrance_pots", coll, bm, slots, tags("pot", "entrance_pots"), smooth_deg=40.0))
    models = sorted({p["model"] for p in sd["palms"] + sd["pit_greens"] + sd["entrance_plants"]})
    protos = {m: RP.prototype(m) for m in models}
    BP.exclude(BP.PROTOTYPES)
    for group, items in (("palm", sd["palms"]), ("pit_green", sd["pit_greens"]), ("entrance_plant", sd["entrance_plants"])):
        for i, p in enumerate(items):
            for ob, _, _ in RP.instances(coll, p, protos, f"rb_site_{group}_{i + 1}"):
                for k, v in tags(group, ob.name).items():
                    ob[k] = v
                made.append(ob)
    lamp = lamp_prototype(sd["lamp_model"])
    for i, lp in enumerate(sd["lamps"]):
        ob = bpy.data.objects.new(f"rb_site_lamp_{i + 1}", None)
        ob.instance_type = "COLLECTION"
        ob.instance_collection = lamp
        ob.matrix_world = (Matrix.Translation((lp["at"][0], lp["at"][1], lp["z"] - lamp["rb_base_z"]))
                           @ Matrix.Rotation(math.radians(lp["rot_deg"]), 4, "Z"))
        for k, v in tags("lamp", ob.name).items():
            ob[k] = v
        coll.objects.link(ob)
        made.append(ob)
    return {"collection": COLLECTION, "objects": len(made), "palms": len(sd["palms"]), "pits": len(sd["pits"]),
            "entrance_pots": len(sd["pots"]), "lamps": len(sd["lamps"]), "lamp_height": round(lamp["rb_height"], 2),
            "palm_prototypes": {m: [round(protos[m]["rb_height"], 2), round(protos[m]["rb_radius"], 2)] for m in models
                                if "street_palm" in m},
            "names": [o.name for o in made]}
