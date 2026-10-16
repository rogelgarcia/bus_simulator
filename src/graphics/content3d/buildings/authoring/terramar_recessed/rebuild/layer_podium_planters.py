# layer_podium_planters.py -- AI 628: the podium's planter boxes and their planting, from plan["props"]["podium_planters"].
#
# Run through build.py (layers=podium_planters; needs the podium and balconies layers, and the vegetation decoded by
# decode_vegetation_glb.mjs). Builds RB_PROPS/RB_PODIUM_PLANTERS under its part root:
#   rb_podium_planter_boxes   every box as one object: a dark-metal trough (TM_RB_planter_metal) with a 30 mm rim and
#                             its soil (TM_RB_soil) 40 mm below the rim, since user fix 23 a mound (soil.mound_pockets:
#                             lowest at the rim, higher in the middle; the shrubs and flowers stand on it, soil.lift)
#   rb_podium_plant_<box>_<n> one collection instance per shrub form (the game's arrowwood viburnum, the prototypes the
#                             balcony layer imports into RB_PROP_PROTOTYPES), fitted to the plan's height and crown radius
#   rb_podium_flowers         the boxes' flower heads as one object: small faceted heads scattered over the shrubs' crowns
#                             and within the box's rim (seeded per box), pink, white, yellow, coral and violet
#                             (TM_RB_flower_*)
# The layer checks every shrub's foliage against the planes its box keeps behind (the guard glass; on the upper recesses
# also the glazing frames) and reports any that cross.
import importlib
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (prototypes, leaf tone, foliage samples, plain materials)
import soil as S  # noqa: E402  (user fix 23: the soil's mound, plants re-seated on it)

importlib.reload(L)
importlib.reload(BP)
importlib.reload(S)

COLLECTION = "RB_PODIUM_PLANTERS"
LAYER = "podium_planters"
RIM, SOIL_DROP = 0.03, 0.04
FLOWERS = {"TM_RB_flower_pink": ((0.80, 0.22, 0.42), 0.30), "TM_RB_flower_white": ((0.86, 0.85, 0.82), 0.25),
           "TM_RB_flower_yellow": ((0.92, 0.70, 0.12), 0.20), "TM_RB_flower_coral": ((0.90, 0.32, 0.22), 0.15),
           "TM_RB_flower_violet": ((0.45, 0.22, 0.70), 0.10)}                    # colour, share
METAL = ("TM_RB_planter_metal", (0.035, 0.033, 0.031), 0.45)


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def inset(loop, d):
    """A convex counter-clockwise loop moved inward by d (each edge offset, neighbours intersected)."""
    n = len(loop)
    lines = []
    for i in range(n):
        p, q = Vector(loop[i]), Vector(loop[(i + 1) % n])
        t = (q - p).normalized()
        nrm = Vector((t.y, -t.x))                                     # outward for a counter-clockwise loop
        lines.append((p - nrm * d, t))
    out = []
    for i in range(n):
        (p1, t1), (p2, t2) = lines[i - 1], lines[i]
        den = t1.x * t2.y - t1.y * t2.x
        k = ((p2.x - p1.x) * t2.y - (p2.y - p1.y) * t2.x) / den
        out.append((p1.x + t1.x * k, p1.y + t1.y * k))
    return out


def boxes_object(coll, boxes):
    items, soils = [], []
    for bx in boxes:
        outer = [tuple(q) for q in bx["loop"]]
        inner = inset(outer, RIM)
        z0, z1 = bx["z"], bx["z"] + bx["height"]
        items.append((([(z0, z1 - SOIL_DROP)]), [(outer, METAL[0])], [([outer], "TM_RB_soil", METAL[0])]))
        items.append((([(z1 - SOIL_DROP, z1)]), [(outer, METAL[0]), (inner, METAL[0])], [([outer, inner], METAL[0], METAL[0])]))
        soils.append((inner, z1 - SOIL_DROP, SOIL_DROP))
    ob = L.pieces("rb_podium_planter_boxes", coll, items, tags("planter_box", "podium_planter_boxes"))
    S.mound_pockets(ob, soils, METAL[0])                               # user fix 23: the soil's mound in every box
    return ob


def inside(loop, q):
    """q within a convex counter-clockwise loop."""
    n = len(loop)
    return all((loop[(i + 1) % n][0] - loop[i][0]) * (q[1] - loop[i][1]) - (loop[(i + 1) % n][1] - loop[i][1]) * (q[0] - loop[i][0]) >= 0
               for i in range(n))


def flower_head(bm, centre, r, mat_index, rng):
    """A small faceted head (an octahedron, squashed and turned)."""
    sx, sy, sz = r, r * rng.uniform(0.8, 1.2), r * rng.uniform(0.55, 0.8)
    a = rng.uniform(0.0, math.pi)
    ca, sa = math.cos(a), math.sin(a)
    pts = [(sx, 0, 0), (-sx, 0, 0), (0, sy, 0), (0, -sy, 0), (0, 0, sz), (0, 0, -sz)]
    vs = [bm.verts.new((centre.x + x * ca - y * sa, centre.y + x * sa + y * ca, centre.z + z)) for x, y, z in pts]
    for f in ((0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)):
        bm.faces.new([vs[i] for i in f]).material_index = mat_index


def flowers_object(coll, boxes, seed):
    bm = bmesh.new()
    slots = list(FLOWERS)
    weights = [FLOWERS[k][1] for k in slots]
    for bx in boxes:
        if not bx["flowers"] or not bx["plants"]:
            continue
        rng = random.Random(f"{seed}:flowers:{bx['id']}")
        colours = rng.sample(range(len(slots)), k=3 if bx["kind"] != "upper" else 1)   # each box its own mix
        inner = inset([tuple(q) for q in bx["loop"]], RIM)
        placed = 0
        for _ in range(bx["flowers"] * 4):                              # heads only over the box (not into a pier)
            if placed == bx["flowers"]:
                break
            p = rng.choice(bx["plants"])
            ang, rr = rng.uniform(0, 2 * math.pi), p["radius"] * math.sqrt(rng.uniform(0.0, 1.0)) * 0.85
            h = p["height"] * rng.uniform(0.55, 1.0)
            c = Vector((p["at"][0] + rr * math.cos(ang), p["at"][1] + rr * math.sin(ang), p["z"] + S.lift(p["at"], p["z"]) + h))
            if not inside(inner, c):
                continue
            k = rng.choices(colours, weights=[weights[i] for i in colours])[0]
            flower_head(bm, c, rng.uniform(0.018, 0.032), k, rng)
            placed += 1
    for name, (rgb, _) in FLOWERS.items():
        BP.plain_material(name, rgb, 0.6)
    return L.finish("rb_podium_flowers", coll, bm, slots, tags("flowers", "podium_flowers"), smooth_deg=1.0)


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    L.clear_collection(coll)
    BP.prop_materials()
    BP.plain_material(METAL[0], METAL[1], METAL[2])
    S.begin()
    pp = plan["props"]["podium_planters"]
    models = sorted({p["model"] for bx in pp["boxes"] for p in bx["plants"]})
    protos = {m: BP.prototype(m) for m in models}
    for proto in protos.values():
        BP.tone_foliage(proto)
    made = [boxes_object(coll, pp["boxes"])]
    crossings, n_plants, worst = [], 0, -1e9
    for bx in pp["boxes"]:
        for i, p in enumerate(bx["plants"]):
            proto = protos[p["model"]]
            s_z, s_xy = p["height"] / proto["rb_height"], p["radius"] / proto["rb_radius"]
            z = p["z"] + S.lift(p["at"], p["z"])                       # user fix 23: on the mound
            M = (Matrix.Translation((p["at"][0], p["at"][1], z)) @ Matrix.Rotation(math.radians(p["rot_deg"]), 4, "Z")
                 @ Matrix.Diagonal((s_xy, s_xy, s_z, 1.0)))
            ob = bpy.data.objects.new(f"rb_podium_plant_{bx['id']}_{i + 1}", None)
            ob.instance_type = "COLLECTION"
            ob.instance_collection = proto
            ob.matrix_world = M
            ob.empty_display_size = 0.15
            for k, v in tags("plant", f"{bx['kind']}:{p['model']}").items():
                ob[k] = v
            coll.objects.link(ob)
            made.append(ob)
            n_plants += 1
            pts = [M @ q for q in BP.foliage_points(proto)]
            for plane in bx["keep_behind"]:
                c, n = Vector((*plane["p"], 0.0)), Vector((*plane["n"], 0.0))
                d = max((q - c).dot(n) for q in pts)
                worst = max(worst, d)
                if d > 0.0:
                    crossings.append({"plant": ob.name, "by_m": round(d, 3)})
    made.append(flowers_object(coll, pp["boxes"], pp["seed"]))
    return {"collection": COLLECTION, "objects": len(made), "boxes": len(pp["boxes"]), "kinds": pp["counts"],
            "plants": n_plants, "flowers": pp["flowers"], "foliage_crossing_guard_or_glazing": len(crossings),
            "closest_m": round(-worst, 3), "crossings": crossings[:10], "soil": S.report(), "names": [o.name for o in made]}
