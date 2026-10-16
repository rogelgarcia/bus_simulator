# layer_roof_planters.py -- AI 629: the roof terrace's planters and trees, from plan["props"]["roof_planters"].
#
# Run through build.py (layers=roof_planters; needs the roof layer, and the vegetation decoded by
# decode_vegetation_glb.mjs). Builds RB_PROPS/RB_ROOF_PLANTERS under its part root:
#   rb_roof_planter_boxes  every box as one object, soil (TM_RB_soil) 40 mm below the rim: the perimeter ring's low
#                          limestone troughs (TM_RB_paving, dressed by the materials pass; straight modules and one mitred
#                          L module per sharp corner, user fix 8b), each a body with thin rim walls and end caps, and
#                          the islands' dark-metal boxes (TM_RB_planter_metal, a body and a rim with a hole)
#   rb_roof_centre_box     the low limestone box in the middle of the front terrace (2026-10-15), built like an island
#                          with its vertical corners chamfered (plan box "chamfer", like the street's tree pits)
#   rb_roof_pots           the large tapered pots (layer_balcony_plants.pot, light grey, charcoal or white) at the ring's
#                          corners and by the penthouse doors (2026-10-15)
#   rb_roof_tree_stems     the clear stems of the viburnum standards (TM_RB_tree_stem), in pots, the centre box and troughs
#   rb_roof_flowers        flower heads over the centre box's viburnum (layer_podium_planters' heads and TM_RB_flower_*)
#   rb_roof_plant_<place>_<n>  collection instances: the ring's low viburnum, the feature clusters and fill plants
#                          (procedural cycads and spiky rosettes from proc_plants.py, linden olives with a companion form,
#                          viburnum standards), the islands', the pots' and the centre box's plants. No palms on the roof
#                          since 2026-10-15 (the user: "no palm tree at the roof top"): linden olives and standards instead
# Instances are fitted to their target height and crown radius (fit_scales); a prototype with rb_fit_aniso keeps its
# xy / z scale ratio within it, and the summary lists those scales.
# Every plant's foliage must stay inside the guard shoe's inner line (plan "keep_inside"): the layer counts every point
# outside it. The pots and the centre box are checked against the islands, each other, the paths before the penthouse's
# doors, the penthouse and its annex, and the ring's troughs; they and the flowers are tagged rb_hide_from_b8 (the
# CAM_B8 sightline check must find 0 px of them).
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
import layer_balcony_plants as BP  # noqa: E402  (game prototypes, leaf tone, foliage samples, plain materials)
import layer_podium_planters as PP  # noqa: E402  (the planter metal, inset)
import proc_plants  # noqa: E402
import props_layout as PL  # noqa: E402

for mod in (L, BP, PP, proc_plants, PL):
    importlib.reload(mod)

COLLECTION = "RB_ROOF_PLANTERS"
LAYER = "roof_planters"
RIM, SOIL_DROP = 0.03, 0.04
STEM = ("TM_RB_tree_stem", (0.19, 0.15, 0.11), 0.85)                  # a standard's clear stem: grey-brown bark


def tags(element, name, hidden=False):
    t = {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}
    if hidden:
        t["rb_hide_from_b8"] = True
    return t


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
    """A box: the body up to the soil and a rim with a hole. A box with a chamfer (the limestone centre box, 2026-10-15,
    like the street's tree pits) has its vertical corners cut, the rim's soil side following them."""
    outer = L.ccw(L.chamfer(L.ccw([tuple(q) for q in bx["loop"]]), bx.get("chamfer", 0.0)))
    inner = PP.inset(outer, RIM)
    z0, z1 = bx["z"], bx["z"] + bx["height"]
    return [([(z0, z1 - SOIL_DROP)], [(outer, m)], [([outer], "TM_RB_soil", m)]),
            ([(z1 - SOIL_DROP, z1)], [(outer, m), (inner, m)], [([outer, inner], m, m)])]


def stem(bm, st, slot, sides=10):
    """A standard's stem: a slightly tapered, leaning cylinder from its foot on the soil to its top inside the crown,
    with a little flare at the foot; closed at both ends."""
    (fx, fy), (tx, ty), (z0, z1), r = st["foot"], st["top"], st["z"], st["r"]
    rings = []
    for t, rr in ((0.0, 1.35 * r), (0.04, 1.1 * r), (0.5, 0.95 * r), (1.0, 0.75 * r)):
        cx, cy, z = fx + (tx - fx) * t, fy + (ty - fy) * t, z0 + (z1 - z0) * t
        rings.append([bm.verts.new((cx + rr * math.cos(2 * math.pi * k / sides), cy + rr * math.sin(2 * math.pi * k / sides), z))
                      for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])).material_index = slot
    bm.faces.new(list(reversed(rings[0]))).material_index = slot
    bm.faces.new(rings[-1]).material_index = slot


def flowers(coll, bx, seed):
    """Flower heads over the box's low viburnum, inside its rim: three colours of layer_podium_planters' mix."""
    bm = bmesh.new()
    slots = list(PP.FLOWERS)
    weights = [PP.FLOWERS[k][1] for k in slots]
    rng = random.Random(f"{seed}:flowers:{bx['id']}")
    colours = rng.sample(range(len(slots)), k=3)
    inner = PP.inset([tuple(q) for q in bx["loop"]], RIM + 0.02)
    placed = 0
    for _ in range(bx["flowers"] * 4):
        if placed == bx["flowers"]:
            break
        p = rng.choice(bx["plants"])
        k = math.sqrt(rng.uniform(0.0, 1.0)) * 0.8                    # on the crown's dome, just inside its leaves
        ang, rr = rng.uniform(0, 2 * math.pi), p["radius"] * k
        h = p["height"] * (0.5 + 0.42 * (1.0 - k * k)) * rng.uniform(0.92, 1.0)
        c = Vector((p["at"][0] + rr * math.cos(ang), p["at"][1] + rr * math.sin(ang), p["z"] + h))
        if not PP.inside(inner, c):
            continue
        PP.flower_head(bm, c, rng.uniform(0.014, 0.024), rng.choices(colours, weights=[weights[i] for i in colours])[0], rng)
        placed += 1
    for name, (rgb, _) in PP.FLOWERS.items():
        BP.plain_material(name, rgb, 0.6)
    return L.finish("rb_roof_flowers", coll, bm, slots, tags("flowers", "roof_flowers", hidden=True), smooth_deg=1.0), placed


def layout_checks(plan, rp):
    """The pots and the centre box against the islands, each other, the door paths, the penthouse and its annex (by
    rp["pot_config"]["clear"]) and the ring's troughs (their inner line, keep_inside 0.66 m in): (problems, closest)."""
    import layer_roof_furniture as RF                                 # its overlaps / edge distance helpers
    rf = plan["roof"]
    clear = rp["pot_config"]["clear"]
    trough_in = rp["config"]["guard_gap"] + rp["config"]["depth"]
    loop = [tuple(q) for q in rp["keep_inside"]]
    px, py, an = rf["penthouse_rect"]["x"], rf["penthouse_rect"]["y"], rf["annex"]
    rects = [(f"island {i['id']}", i["rect"]) for i in rp["islands"]] + [(f"path {k}", p) for k, p in enumerate(rp["paths"])]
    rects += [("penthouse", [px[0], px[1], py[0], py[1]]), ("annex", [an["x"][0], an["x"][1], an["y"][0], an["y"][1]])]
    centre = rp["centre"]["rect"]
    shapes = [(f"pot {p['id']}", [(p["at"][0] + p["radius"] * math.cos(2 * math.pi * k / 16),
                                   p["at"][1] + p["radius"] * math.sin(2 * math.pi * k / 16)) for k in range(16)])
              for p in rp["pots"]]
    shapes.append(("centre box", [(centre[0], centre[2]), (centre[1], centre[2]), (centre[1], centre[3]), (centre[0], centre[3])]))
    problems, closest = [], 1e9
    for i, (name, poly) in enumerate(shapes):
        for other, rect in rects:
            # the door pots stand beside the doors and against the penthouse: only their path strips and the wall line
            # itself count for them (the 0.55 m from the wall is the layout's)
            margin = 0.0 if other == "penthouse" else clear
            if RF.overlaps(poly, rect, margin):
                problems.append(f"{name} within {margin} m of {other}")
        for other, poly2 in shapes[i + 1:]:
            gap = min(math.dist(a, b) for a in poly for b in poly2)
            if gap < clear:
                problems.append(f"{name} within {clear} m of {other}")
        d = min(RF.edge_distance(loop, q) for q in poly)
        closest = min(closest, d)
        if d < trough_in + clear or not all(RF.inside(loop, q) for q in poly):
            problems.append(f"{name} {d:.2f} m from the guard line (the troughs end {trough_in:.2f} m in)")
    return problems, closest


def drop_unused_palms():
    """Remove the roof palm prototypes (RBP_proc_palm_*) nothing instances any more (2026-10-15: no palms on the roof),
    so an in-place rebuild leaves the part as a fresh build would: their objects, meshes and collections."""
    used = {ob.instance_collection.name for ob in bpy.data.objects if ob.instance_type == "COLLECTION" and ob.instance_collection}
    dropped = []
    for c in [c for c in bpy.data.collections if c.name.startswith("RBP_proc_palm_") and c.name not in used]:
        datas = [ob.data for ob in c.all_objects if ob.data is not None]
        for ob in list(c.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for d in datas:
            if not d.users and isinstance(d, bpy.types.Mesh):
                bpy.data.meshes.remove(d)
        dropped.append(c.name)
        bpy.data.collections.remove(c)
    return dropped


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
    BP.plain_material(*STEM)
    rp = plan["props"]["roof_planters"]
    items, centre = [], []
    for bx in rp["boxes"]:
        if bx["kind"] == "centre":
            centre += island(bx, bx["material"])
        else:
            items += ring_module(bx, rp["config"]["material"]) if bx["kind"] == "ring" else island(bx, PP.METAL[0])
    made = [L.pieces("rb_roof_planter_boxes", coll, items, tags("planter_box", "roof_planter_boxes"))]
    if centre:
        made.append(L.pieces("rb_roof_centre_box", coll, centre, tags("planter_box", "roof_centre_box", hidden=True)))
    bm = bmesh.new()                                                  # the pots
    slots = [f"TM_RB_pot_{c}" for c in BP.POT_RGB] + ["TM_RB_soil"]
    for p in rp["pots"]:
        BP.pot(bm, slots, p["at"], p["z"], p["radius"], p["height"], p["colour"])
    if rp["pots"]:
        made.append(L.finish("rb_roof_pots", coll, bm, slots, tags("pot", "roof_pots", hidden=True), smooth_deg=40.0))
    else:
        bm.free()
    stems = [f["stem"] for f in rp["features"] if "stem" in f]
    if stems:
        bm = bmesh.new()
        for st in stems:
            stem(bm, st, 0)
        made.append(L.finish("rb_roof_tree_stems", coll, bm, [STEM[0]], tags("stem", "roof_tree_stems"), smooth_deg=60.0))
    n_flowers = 0
    for bx in rp["boxes"]:
        if bx.get("flowers"):
            ob, n = flowers(coll, bx, rp["seed"])
            made.append(ob)
            n_flowers += n
    models = sorted({p["model"] for bx in rp["boxes"] for p in bx["plants"]} | {f["model"] for f in rp["features"]}
                    | {f["companion"]["model"] for f in rp["features"] if "companion" in f})
    protos = {m: prototype(m) for m in models}
    BP.exclude(BP.PROTOTYPES)
    placed = []
    for bx in rp["boxes"]:
        for i, p in enumerate(bx["plants"]):
            placed += [(bx["kind"] == "ring", x) for x in instances(coll, p, protos, f"rb_roof_plant_{bx['id']}_{i + 1}")]
    counts = {}
    for f in rp["features"]:                                          # every tree and feature plant is checked
        counts[f["place"]] = counts.get(f["place"], 0) + 1
        placed += [(True, x) for x in instances(coll, f, protos, f"rb_roof_plant_{f['place']}_{counts[f['place']]}")]
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
    dropped = drop_unused_palms()
    problems, closest_pot = layout_checks(plan, rp)
    for p in problems:
        print("WARNING roof planters:", p)
    palms = [ob.name for _, (ob, M, proto) in placed if "palm" in proto.name]
    return {"collection": COLLECTION, "objects": len(made), "boxes": len(rp["boxes"]), "shrubs": rp["shrubs"],
            "features": len(rp["features"]), "feature_kinds": rp["feature_counts"], "instances": len(placed),
            "pots": len(rp["pots"]), "stems": len(stems), "flowers": n_flowers, "palms": len(palms),
            "palm_prototypes_dropped": dropped,
            "layout_problems": problems, "pots_closest_to_guard_m": round(closest_pot, 3),
            "foliage_outside_guard": len(crossing), "closest_m": round(-worst, 3), "crossing": crossing[:10],
            "prototypes": {m: [round(c["rb_height"], 2), round(c["rb_radius"], 2)] for m, c in protos.items()},
            "palm_fit": fits,
            "palm_aniso_max": round(max((abs(f[0] / f[1] - 1.0) for f in fits.values()), default=0.0), 3),
            "names": [o.name for o in made]}
