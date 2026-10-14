# layer_roof_planters.py -- AI 629: the roof terrace's planters and trees, from plan["props"]["roof_planters"].
#
# Run through build.py (layers=roof_planters; needs the roof layer, and the vegetation decoded by
# decode_vegetation_glb.mjs). Builds RB_PROPS/RB_ROOF_PLANTERS under its part root:
#   rb_roof_planter_boxes  every box as one object, soil (TM_RB_soil) 40 mm below the rim: the perimeter ring's low
#                          limestone troughs (TM_RB_paving, dressed by the materials pass; straight modules and one curved
#                          module per corner arc), each a body with thin rim walls and end caps, and the islands'
#                          dark-metal boxes (TM_RB_planter_metal, a body and a rim with a hole)
#   rb_roof_plant_<place>_<n>  collection instances: the ring's low viburnum, the feature clusters and fill plants
#                          (procedural cycads, detailed palms (palm_tree.py) and spiky rosettes from proc_plants.py,
#                          linden olives with a companion form) and the islands' plants
# Instances are fitted to their target height and crown radius (fit_scales); the detailed palms keep their xy / z scale
# ratio within rb_fit_aniso (10 %), never past either target, and the summary lists their scales.
# The perimeter foliage must stay inside the guard shoe's inner line (plan "keep_inside"): the layer counts every point
# outside it.
import importlib
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (game prototypes, leaf tone, foliage samples, plain materials)
import layer_podium_planters as PP  # noqa: E402  (the planter metal, inset)
import proc_plants  # noqa: E402
import props_layout as PL  # noqa: E402

for mod in (L, BP, PP, proc_plants, PL):
    importlib.reload(mod)

COLLECTION = "RB_ROOF_PLANTERS"
LAYER = "roof_planters"
RIM, SOIL_DROP = 0.03, 0.04


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def ring_module(bx, m):
    """A curved or straight trough: the body up to the soil, then the outer and inner rim walls and the end caps."""
    path = [tuple(q) for q in bx["path"]]
    v_in, v_out = bx["v"]
    z0, z1 = bx["z"], bx["z"] + bx["height"]
    band = lambda a, b: PL._offset_left(path, -b) + list(reversed(PL._offset_left(path, -a)))  # noqa: E731
    items = [L.piece(band(v_in, v_out), [(z0, z1 - SOIL_DROP)], m, mat_top="TM_RB_soil")]
    rim = [(z1 - SOIL_DROP, z1)]
    items.append(L.piece(band(v_out - RIM, v_out), rim, m))
    items.append(L.piece(band(v_in, v_in + RIM), rim, m))
    for end in (0, -1):                                               # end caps between the walls, along the path
        p, q = (path[0], path[1]) if end == 0 else (path[-2], path[-1])
        d = math.dist(p, q)
        t = ((q[0] - p[0]) / d * RIM, (q[1] - p[1]) / d * RIM)
        cap = [p, (p[0] + t[0], p[1] + t[1])] if end == 0 else [(q[0] - t[0], q[1] - t[1]), q]
        foot = PL._offset_left(cap, -(v_out - RIM)) + list(reversed(PL._offset_left(cap, -(v_in + RIM))))
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(foot, foot[1:] + foot[:1]))
        items.append(L.piece(foot if area > 0 else list(reversed(foot)), rim, m))
    return items


def island(bx, m):
    outer = [tuple(q) for q in bx["loop"]]
    inner = PP.inset(outer, RIM)
    z0, z1 = bx["z"], bx["z"] + bx["height"]
    return [([(z0, z1 - SOIL_DROP)], [(outer, m)], [([outer], "TM_RB_soil", m)]),
            ([(z1 - SOIL_DROP, z1)], [(outer, m), (inner, m)], [([outer, inner], m, m)])]


def prototype(model):
    if model.startswith("proc/"):
        kind, k = model.split("/")[1].rsplit("_", 1)
        return proc_plants.ensure(kind, int(k))
    proto = BP.prototype(model)
    BP.tone_foliage(proto)
    return proto


def fit_scales(proto, height, radius):
    """(s_z, s_xy) fitting the prototype to the target height and crown radius. A prototype with rb_fit_aniso (the
    detailed palms) keeps s_xy / s_z within 1 -+ it, never past either target: the crown is narrowed first, then the
    height lowered, so a palm is never squashed into a shuttlecock nor its trunk stretched."""
    s_z, s_xy = height / proto["rb_height"], radius / proto["rb_radius"]
    cap = proto.get("rb_fit_aniso")
    if cap:
        s_xy = min(s_xy, s_z * (1.0 + cap))
        s_z = min(s_z, s_xy / (1.0 - cap))
    return s_z, s_xy


def instances(coll, p, protos, name):
    forms = [(p["model"], p["rot_deg"], p["height"], p["radius"], "")]
    if "companion" in p:
        c = p["companion"]
        forms.append((c["model"], c["rot_deg"], c["height"], c["radius"], "b"))
    made = []
    for model, rot, height, radius, suffix in forms:
        proto = protos[model]
        s_z, s_xy = fit_scales(proto, height, radius)
        M =(Matrix.Translation((p["at"][0], p["at"][1], p["z"])) @ Matrix.Rotation(math.radians(rot), 4, "Z")
             @ Matrix.Diagonal((s_xy, s_xy, s_z, 1.0)))
        ob = bpy.data.objects.new(name + suffix, None)
        ob.instance_type = "COLLECTION"
        ob.instance_collection = proto
        ob.matrix_world = M
        ob.empty_display_size = 0.2
        for k, v in tags("plant", f"{p.get('kind', 'shrub')}:{model}").items():
            ob[k] = v
        coll.objects.link(ob)
        made.append((ob, M, proto))
    return made


def palm_fit(M):
    """An instance's (s_xy, s_z) from its matrix, rounded."""
    m = M.to_3x3()
    return [round(m.col[0].length, 3), round(m.col[2].length, 3)]


def outside(loop, pts):
    """How far the points reach outside a counter-clockwise loop (<= 0: all inside), by crossing parity + distance."""
    import numpy as np
    P = np.array([(q.x, q.y) for q in pts])
    A = np.array(loop)
    B = np.roll(A, -1, axis=0)
    inside = np.zeros(len(P), dtype=bool)
    for (ax, ay), (bx, by) in zip(A, B):
        cond = (ay > P[:, 1]) != (by > P[:, 1])
        x = ax + (P[:, 1] - ay) * (bx - ax) / np.where(by - ay == 0, 1e-12, by - ay)
        inside ^= cond & (P[:, 0] < x)
    # distance to the loop for every point (segments), signed: positive outside
    d = np.full(len(P), np.inf)
    for (ax, ay), (bx, by) in zip(A, B):
        ab = np.array([bx - ax, by - ay])
        t = np.clip(((P[:, 0] - ax) * ab[0] + (P[:, 1] - ay) * ab[1]) / max(ab @ ab, 1e-12), 0.0, 1.0)
        dx, dy = P[:, 0] - (ax + t * ab[0]), P[:, 1] - (ay + t * ab[1])
        d = np.minimum(d, np.hypot(dx, dy))
    signed = np.where(inside, -d, d)
    return float(signed.max())


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    L.clear_collection(coll)
    BP.prop_materials()
    BP.plain_material(PP.METAL[0], PP.METAL[1], PP.METAL[2])
    rp = plan["props"]["roof_planters"]
    items = []
    for bx in rp["boxes"]:
        items += ring_module(bx, rp["config"]["material"]) if bx["kind"] == "ring" else island(bx, PP.METAL[0])
    made = [L.pieces("rb_roof_planter_boxes", coll, items, tags("planter_box", "roof_planter_boxes"))]
    models = sorted({p["model"] for bx in rp["boxes"] for p in bx["plants"]} | {f["model"] for f in rp["features"]}
                    | {f["companion"]["model"] for f in rp["features"] if "companion" in f})
    protos = {m: prototype(m) for m in models}
    BP.exclude(BP.PROTOTYPES)
    placed = []
    for bx in rp["boxes"]:
        for i, p in enumerate(bx["plants"]):
            placed += [(bx["kind"] == "ring", x) for x in instances(coll, p, protos, f"rb_roof_plant_{bx['id']}_{i + 1}")]
    counts = {}
    for f in rp["features"]:
        counts[f["place"]] = counts.get(f["place"], 0) + 1
        perimeter = not f["place"].startswith(("penthouse", "row_", "lounge"))
        placed += [(perimeter, x) for x in instances(coll, f, protos, f"rb_roof_plant_{f['place']}_{counts[f['place']]}")]
    fits = {ob.name: palm_fit(M) for _, (ob, M, proto) in placed if proto.get("rb_fit_aniso")}
    loop = [tuple(q) for q in rp["keep_inside"]]
    worst, crossing = -1e9, []
    for perimeter, (ob, M, proto) in placed:
        made.append(ob)
        if not perimeter:
            continue
        reach = outside(loop, [M @ q for q in BP.foliage_points(proto, step=5)])
        worst = max(worst, reach)
        if reach > 0.0:
            crossing.append({"plant": ob.name, "by_m": round(reach, 3)})
    return {"collection": COLLECTION, "objects": len(made), "boxes": len(rp["boxes"]), "shrubs": rp["shrubs"],
            "features": len(rp["features"]), "feature_kinds": rp["feature_counts"], "instances": len(placed),
            "perimeter_foliage_outside_guard": len(crossing), "closest_m": round(-worst, 3), "crossing": crossing[:10],
            "prototypes": {m: [round(c["rb_height"], 2), round(c["rb_radius"], 2)] for m, c in protos.items()},
            "palm_fit": fits,
            "palm_aniso_max": round(max((abs(f[0] / f[1] - 1.0) for f in fits.values()), default=0.0), 3),
            "names": [o.name for o in made]}
