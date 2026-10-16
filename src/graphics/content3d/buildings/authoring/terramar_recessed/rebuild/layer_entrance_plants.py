# layer_entrance_plants.py -- user fix 12 (2026-10-15): the pot plants inside the entrance portal, from
# plan["props"]["entrance_plants"] (props_layout.entrance_plants).
#
# Run through build.py (layers=entrance_plants, props part; it stands in the building's entrance, the podium layer).
# b8 shows a tall, dark, leafy plant in a pot on each side of the entrance, inside the portal against the wood side walls
# (the user's images/14.webp: "add plants on the both sides of the entrance ... use actual leaves"). Builds
# RB_PROPS/RB_ENTRANCE_PLANTS under its part root:
#   rb_entrance_plant_pots   the two pots as one object: tall glazed ceramic cylinders (TM_RB_pot_glazed, a deep
#                            charcoal glaze under a thin clear coat) tapering a little toward a recessed foot (a shadow
#                            reveal over the floor), a slight belly and a rounded lip, the inner wall down to the soil
#                            (TM_RB_soil) 50 mm below the rim; each stands on the entrance floor (contact)
#   rb_entrance_plant_<n>    collection instances of proc_plants' bird-of-paradise clumps (plant_broadleaf.py, real
#                            leaves), fitted to the plan's height and crown radius (layer_roof_planters.fit_scales, within
#                            the prototype's rb_fit_aniso); each is turned from the plan's rot_deg in 7.5 degree steps
#                            (nearest first) to the first turn whose foliage keeps inside the plan's keep_in box (the
#                            lining, the vestibule plane, the doors' way, the head band and its downlights); if none
#                            does, the crown is narrowed in 4 % steps (to 80 %) and the turns tried again
# The layer reports each plant's turn, scale and its clearance to every keep_in side.
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
import layer_balcony_plants as BP  # noqa: E402  (prototype root, exclusion, foliage samples)
import layer_roof_planters as RP  # noqa: E402  (proc prototypes, fit_scales)

for mod in (L, BP, RP):
    importlib.reload(mod)

COLLECTION = "RB_ENTRANCE_PLANTS"
LAYER = "entrance_plants"
GLAZE = "TM_RB_pot_glazed"
SEGMENTS = 48
SOIL_DROP = 0.05
TURN_STEP, TURNS = 7.5, 24                     # degrees per step, steps each way


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def glaze_material():
    """TM_RB_pot_glazed: a deep charcoal ceramic glaze, satin, under a thin clear coat."""
    mat = bpy.data.materials.get(GLAZE) or bpy.data.materials.new(GLAZE)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.042, 0.040, 0.037, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.30
    bsdf.inputs["Coat Weight"].default_value = 0.35
    bsdf.inputs["Coat Roughness"].default_value = 0.10
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (0.042, 0.040, 0.037, 1.0)
    return mat


def pot_profile(r_bot, r_top, h):
    """(r, z) from the foot up the outside, over the lip and down the inside to the soil."""
    prof = [(r_bot - 0.015, 0.0), (r_bot - 0.015, 0.024), (r_bot, 0.03)]               # the recessed foot
    z0, z1 = 0.03, h - 0.03
    for i in range(1, 9):                                                              # the body, a slight belly
        s = i / 8
        prof.append((r_bot + (r_top - r_bot) * s ** 0.85 + 0.008 * math.sin(math.pi * s), z0 + (z1 - z0) * s))
    prof += [(r_top + 0.006, h - 0.018), (r_top + 0.006, h - 0.006), (r_top + 0.001, h),  # the rounded lip
             (r_top - 0.018, h), (r_top - 0.020, h - SOIL_DROP)]                     # the inner wall to the soil
    return prof


def pot(bm, slots, at, z, r_bot, r_top, h):
    rings = []
    for r, zz in pot_profile(r_bot, r_top, h):
        rings.append([bm.verts.new((at[0] + r * math.cos(2 * math.pi * k / SEGMENTS),
                                    at[1] + r * math.sin(2 * math.pi * k / SEGMENTS), z + zz)) for k in range(SEGMENTS)])
    body = slots.index(GLAZE)
    for a, b in zip(rings, rings[1:]):
        for k in range(SEGMENTS):
            bm.faces.new((a[k], a[(k + 1) % SEGMENTS], b[(k + 1) % SEGMENTS], b[k])).material_index = body
    bm.faces.new(list(reversed(rings[0]))).material_index = body                     # the foot on the floor
    bm.faces.new(rings[-1]).material_index = slots.index("TM_RB_soil")               # the soil surface


def clearances(pts, box):
    """The foliage's clearance to each side of the keep_in box (m; negative: outside by that much)."""
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return {"x_lo": min(xs) - box["x"][0], "x_hi": box["x"][1] - max(xs), "y_lo": min(ys) - box["y"][0],
            "y_hi": box["y"][1] - max(ys), "z": box["z_max"] - max(zs)}


def place(p, proto, pts0):
    """The plant's matrix: the turn nearest rot_deg (and the widest crown, narrowed only if needed) keeping inside
    keep_in. Returns (matrix, turn, crown factor, clearances)."""
    best = None
    for narrow in [1.0 - 0.04 * i for i in range(6)]:
        s_z, s_xy = RP.fit_scales(proto, p["height"], p["radius"] * narrow)
        for step in sorted(range(-TURNS, TURNS + 1), key=abs):
            rot = p["rot_deg"] + TURN_STEP * step
            M = (Matrix.Translation((p["at"][0], p["at"][1], p["z"])) @ Matrix.Rotation(math.radians(rot), 4, "Z")
                 @ Matrix.Diagonal((s_xy, s_xy, s_z, 1.0)))
            c = clearances([M @ q for q in pts0], p["keep_in"])
            worst = min(c.values())
            if worst >= 0.0:
                return M, rot, narrow, c
            if best is None or worst > best[0]:
                best = (worst, M, rot, narrow, c)
    return best[1:]


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    L.clear_collection(coll)
    ep = plan["props"]["entrance_plants"]
    glaze_material()
    L.material("TM_RB_soil")
    bm = bmesh.new()
    slots = [GLAZE, "TM_RB_soil"]
    for pt in ep["pots"]:
        pot(bm, slots, pt["at"], pt["z"], pt["radius_bottom"], pt["radius_top"], pt["height"])
    made = [L.finish("rb_entrance_plant_pots", coll, bm, slots, tags("pot", "entrance_plant_pots"), smooth_deg=40.0)]
    models = sorted({p["model"] for p in ep["plants"]})
    protos = {m: RP.prototype(m) for m in models}
    BP.exclude(BP.PROTOTYPES)
    report = []
    for i, p in enumerate(ep["plants"]):
        proto = protos[p["model"]]
        M, rot, narrow, c = place(p, proto, BP.foliage_points(proto, step=1))
        ob = bpy.data.objects.new(f"rb_entrance_plant_{i + 1}", None)
        ob.instance_type = "COLLECTION"
        ob.instance_collection = proto
        ob.matrix_world = M
        ob.empty_display_size = 0.2
        for k, v in tags("plant", f"{p['kind']}:{p['model']}").items():
            ob[k] = v
        coll.objects.link(ob)
        made.append(ob)
        report.append({"plant": ob.name, "model": p["model"], "turn_deg": round(rot, 1), "crown": round(narrow, 2),
                       "scale": RP.palm_fit(M), "clear_m": {k: round(v, 3) for k, v in c.items()}})
    return {"collection": COLLECTION, "objects": len(made), "pots": len(ep["pots"]), "plants": report,
            "prototype_tris": {m: protos[m].get("rb_tris") for m in models},
            "outside_keep_in": sum(1 for r in report if min(r["clear_m"].values()) < 0.0),
            "names": [o.name for o in made]}
