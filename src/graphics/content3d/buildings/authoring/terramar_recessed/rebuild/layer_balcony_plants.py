# layer_balcony_plants.py -- AI 627: potted plants and the front loggias' table sets, from plan["props"]["balcony_plants"].
#
# Run through build.py (layers=balcony_plants; needs the balconies and envelope layers). Builds RB_PROPS/RB_BALCONY_PLANTS
# under its part root:
#   rb_balcony_pots         every pot as one object: a tapered round pot with a rolled rim (TM_RB_pot_white /
#                           _light_grey / _charcoal) and its soil (TM_RB_soil)
#   rb_plant_<floor>_<bay>_<n>  one collection instance per plant: the game's own vegetation (assets/public/vegetation_lod0,
#                           decoded to PNG maps by decode_vegetation_glb.mjs) scaled to the plan's target height and crown
#                           radius, turned by the plan's seeded angle; the "spill" plants lean out over the rim; an olive
#                           gets a second, smaller linden form (..._<n>b) turned against the first, to fill its crown
#   rb_set_<floor>_<kind>   the front centre loggia's furniture: a bistro table and two chairs (floor 3), a low table and two
#                           lounge chairs (floor 5), cream frames and seats (TM_RB_prop_cream), white tops (TM_RB_prop_white)
# The game models are imported once into RB_PROP_PROTOTYPES (a scene collection outside the rebuild root, excluded from
# the view layer, so only the instances render): one collection per model, its size measured into custom properties.
# The silver linden serves as the olive: its foliage is turned grey-green (LEAF_TONE). The layer reports every plant
# whose foliage would reach the guard or the window frames (clearance check).
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

COLLECTION = "RB_BALCONY_PLANTS"
PARENT = "RB_PROPS"
PROTOTYPES = "RB_PROP_PROTOTYPES"
LAYER = "balcony_plants"
VEGETATION = os.path.join(L.C.REBUILD_DIR, "vegetation")
# leaf colour steps (hue, saturation, value): the linden serves as the olive (greyer, still fresh green as b8's sunlit
# trees); the viburnum shrubs a touch lighter, as b8's
LEAF_TONE = {"silver_linden": (0.49, 0.78, 1.12), "arrowwood_viburnum": (0.5, 1.05, 1.10)}
POT_RGB = {"white": (0.78, 0.77, 0.74), "light_grey": (0.42, 0.42, 0.41), "charcoal": (0.06, 0.06, 0.065)}
PROP_RGB = {"TM_RB_prop_cream": ((0.70, 0.64, 0.54), 0.6), "TM_RB_prop_white": ((0.82, 0.81, 0.78), 0.35),
            "TM_RB_soil": ((0.10, 0.075, 0.055), 0.95)}
SEGMENTS = 28


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


# ---------------------------------------------------------------- materials


def plain_material(name, rgb, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def prop_materials():
    for c, rgb in POT_RGB.items():
        plain_material(f"TM_RB_pot_{c}", rgb, 0.45 if c != "charcoal" else 0.55)
    for name, (rgb, rough) in PROP_RGB.items():
        plain_material(name, rgb, rough)


# ---------------------------------------------------------------- prototypes


def prototype_root():
    root = bpy.data.collections.get(PROTOTYPES)
    if root is None:
        root = bpy.data.collections.new(PROTOTYPES)
    if root.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(root)
    return root


def exclude(coll_name):
    def walk(lc):
        if lc.collection.name == coll_name:
            lc.exclude = True
            return True
        return any(walk(c) for c in lc.children)
    walk(bpy.context.view_layer.layer_collection)


def leaf_tone(mat, hue, saturation, value):
    """A hue / saturation / value step on the leaf colour (one node, updated in place on every build)."""
    nt = mat.node_tree
    hs = nt.nodes.get("rb_leaf_tone") or nt.nodes.get("rb_olive_tint")     # (the first builds named it rb_olive_tint)
    if hs is not None:
        hs.name = "rb_leaf_tone"
    else:
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        link = next((lk for lk in nt.links if lk.to_socket == bsdf.inputs["Base Color"]), None)
        if link is None:
            return
        hs = nt.nodes.new("ShaderNodeHueSaturation")
        hs.name = "rb_leaf_tone"
        src = link.from_socket
        nt.links.remove(link)
        nt.links.new(hs.inputs["Color"], src)
        nt.links.new(bsdf.inputs["Base Color"], hs.outputs["Color"])
    hs.inputs["Hue"].default_value = hue
    hs.inputs["Saturation"].default_value = saturation
    hs.inputs["Value"].default_value = value


def tone_foliage(coll):
    species = coll["rb_model"].split("/")[0]
    doubled = f"{coll.name}_{coll.name}_"                              # names the first builds doubled
    for o in coll.objects:
        for slot in getattr(o, "material_slots", []):
            if slot.material and slot.material.name.startswith(doubled):
                slot.material.name = f"{coll.name}_" + slot.material.name[len(doubled):]
            if slot.material and slot.material.name.endswith("_foliage"):
                leaf_tone(slot.material, *LEAF_TONE.get(species, (0.5, 1.0, 1.0)))


def prototype(model):
    """The collection holding one game model (imported once), with its measured height and crown radius."""
    name = "RBP_" + model.replace("/", "_")
    coll = bpy.data.collections.get(name)
    if coll is not None and len(coll.objects):
        return coll
    path = os.path.join(VEGETATION, model + ".glb")
    if not os.path.exists(path):
        raise SystemExit(f"layer_balcony_plants: {path} missing -- run rebuild/decode_vegetation_glb.mjs first")
    root = prototype_root()
    if coll is None:
        coll = bpy.data.collections.new(name)
    if coll.name not in root.children:
        root.children.link(coll)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    top, radius = 0.0, 0.0
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        o.name = f"{name}_{o.name.split(' / ')[-1].replace(' ', '_')}"
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name.startswith("RBP_"):                # the core and outer cards share one material
                continue
            kind = "foliage" if m.name.startswith("foliage") else "bark" if m.name.startswith("bark") else m.name
            m.name = f"{name}_{kind}"
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            top = max(top, p.z)
            if any(s.material and s.material.name.endswith("_foliage") for s in o.material_slots):
                radius = max(radius, math.hypot(p.x, p.y))
    coll["rb_model"] = model
    coll["rb_height"] = top
    coll["rb_radius"] = radius
    exclude(PROTOTYPES)
    return coll


def foliage_points(coll, step=7):
    """A sample of the prototype's foliage vertices (every step-th), for the clearance check."""
    pts = []
    for o in coll.objects:
        if o.type == "MESH" and any(s.material and s.material.name.endswith("_foliage") for s in o.material_slots):
            mw = o.matrix_world
            vs = o.data.vertices
            pts += [mw @ vs[i].co for i in range(0, len(vs), step)]
    return pts


# ---------------------------------------------------------------- pots and sets


def pot(bm, slots, at, z, r_top, h, colour):
    """A tapered round pot: body (r_bottom = 0.78 r_top), a rolled rim, the inner wall down to the soil, the soil."""
    r_bot, lip, wall, soil = 0.78 * r_top, 0.012, 0.02, 0.05
    profile = [(r_bot, 0.0), (r_top, h - 0.025), (r_top + lip, h - 0.02), (r_top + lip, h), (r_top - wall, h),
               (r_top - wall, h - soil)]
    rings = []
    for r, zz in profile:
        rings.append([bm.verts.new((at[0] + r * math.cos(2 * math.pi * k / SEGMENTS),
                                    at[1] + r * math.sin(2 * math.pi * k / SEGMENTS), z + zz)) for k in range(SEGMENTS)])
    body = slots.index(f"TM_RB_pot_{colour}")
    for a, b in zip(rings, rings[1:]):
        for k in range(SEGMENTS):
            bm.faces.new((a[k], a[(k + 1) % SEGMENTS], b[(k + 1) % SEGMENTS], b[k])).material_index = body
    bm.faces.new(list(reversed(rings[0]))).material_index = body                 # the base
    bm.faces.new(rings[-1]).material_index = slots.index("TM_RB_soil")           # the soil surface


def disc(cx, cy, r, n=20):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def furniture(s):
    """A table and two chairs as prisms (L.pieces items), facing each other across the table along the bay."""
    a = math.radians(s["rot_deg"])
    U = Vector((s["along"][0], s["along"][1])).normalized()
    U = Vector((U.x * math.cos(a) - U.y * math.sin(a), U.x * math.sin(a) + U.y * math.cos(a)))
    N = Vector((-U.y, U.x))
    c = Vector(s["centre"])
    z0 = s["z"]
    to = lambda u, v: (c.x + U.x * u + N.x * v, c.y + U.y * u + N.y * v)  # noqa: E731
    box = lambda u0, u1, v0, v1: [to(u0, v0), to(u1, v0), to(u1, v1), to(u0, v1)]  # noqa: E731
    lounge = s["kind"] == "lounge"
    items = []
    t_r, t_h = (0.28, 0.42) if lounge else (0.30, 0.73)
    items.append(L.piece(disc(c.x, c.y, t_r), [(z0 + t_h - 0.03, z0 + t_h)], "TM_RB_prop_white"))
    items.append(L.piece(disc(c.x, c.y, 0.035, 10), [(z0 + 0.02, z0 + t_h - 0.03)], "TM_RB_frame"))
    items.append(L.piece(disc(c.x, c.y, 0.20 if not lounge else 0.18), [(z0, z0 + 0.02)], "TM_RB_frame"))
    w, d = (0.66, 0.62) if lounge else (0.44, 0.44)
    seat, back_top = (0.40, 0.78) if lounge else (0.46, 0.86)
    leg = 0.03
    for side in (-1, 1):
        u_in = side * (t_r + (0.10 if lounge else 0.14))              # the chair's front edge, near the table
        u_out = u_in + side * d
        u0, u1 = sorted((u_in, u_out))
        for uu in (u0, u1 - leg):
            for vv in (-w / 2, w / 2 - leg):
                items.append(L.piece(box(uu, uu + leg, vv, vv + leg), [(z0, z0 + seat - 0.05)], "TM_RB_prop_cream"))
        items.append(L.piece(box(u0, u1, -w / 2, w / 2), [(z0 + seat - 0.05, z0 + seat)], "TM_RB_prop_cream"))
        bu0, bu1 = sorted((u_out - side * 0.04, u_out))                 # the back, on the side away from the table
        if lounge:                                                     # an upholstered back and low arms
            items.append(L.piece(box(bu0, bu1, -w / 2, w / 2), [(z0 + seat, z0 + back_top)], "TM_RB_prop_cream"))
            for vv in (-w / 2, w / 2 - 0.05):
                items.append(L.piece(box(u0, u1, vv, vv + 0.05), [(z0 + seat, z0 + seat + 0.18)], "TM_RB_prop_cream"))
        else:                                                          # a ladder back: two posts, a top and a middle rail
            for vv in (-w / 2, w / 2 - leg):
                items.append(L.piece(box(bu0, bu1, vv, vv + leg), [(z0 + seat, z0 + back_top - 0.07)], "TM_RB_prop_cream"))
            items.append(L.piece(box(bu0, bu1, -w / 2, w / 2), [(z0 + back_top - 0.07, z0 + back_top)], "TM_RB_prop_cream"))
            items.append(L.piece(box(bu0, bu1, -w / 2 + leg, w / 2 - leg), [(z0 + seat + 0.16, z0 + seat + 0.21)], "TM_RB_prop_cream"))
    return items


# ---------------------------------------------------------------- build


def build(plan):
    root = L.ensure_collection(L.ROOT)
    props = L.ensure_collection(PARENT, root)
    coll = L.ensure_collection(COLLECTION, props)
    L.clear_collection(coll)
    prop_materials()
    bp = plan["props"]["balcony_plants"]
    models = {p["model"] for p in bp["pots"]} | {p["companion"]["model"] for p in bp["pots"] if "companion" in p}
    protos = {m: prototype(m) for m in sorted(models)}
    for proto in protos.values():
        tone_foliage(proto)
    made = []

    # pots: one object
    bm = bmesh.new()
    slots = [f"TM_RB_pot_{c}" for c in POT_RGB] + ["TM_RB_soil"]
    for p in bp["pots"]:
        pot(bm, slots, p["at"], p["z"], p["pot"]["radius"], p["pot"]["height"], p["pot"]["colour"])
    made.append(L.finish("rb_balcony_pots", coll, bm, slots, tags("pot", "balcony_pots"), smooth_deg=40.0))

    # plants: collection instances
    clearance = []
    counts = {}
    for p in bp["pots"]:
        key = (p["floor"], p["bay"])
        counts[key] = counts.get(key, 0) + 1
        made += plant_instances(coll, p, protos, counts[key], plan, clearance)
    guard_inner, frame_face = bp["guard_inner_v"], bp["frame_outer_v"]
    hits_guard = [c for c in clearance if c["out_max"] > guard_inner]
    hits_frame = [c for c in clearance if c["in_min"] < frame_face]

    # table sets
    for s in bp["sets"]:
        made.append(L.pieces(f"rb_set_f{s['floor']}_{s['kind']}", coll, furniture(s), tags("furniture", s["kind"])))
    return {"collection": COLLECTION, "objects": len(made), "pots": len(bp["pots"]), "plants": len(clearance),
            "sets": len(bp["sets"]), "kinds": bp["counts"], "prototypes": {m: [round(c["rb_height"], 2), round(c["rb_radius"], 2)]
                                                                         for m, c in protos.items()},
            "guard_inner_v": round(guard_inner, 3), "foliage_past_guard": len(hits_guard), "foliage_into_frames": len(hits_frame),
            "worst_out": max((c["out_max"] for c in clearance), default=None),
            "worst_in": min((c["in_min"] for c in clearance), default=None),
            "past_guard": [c["plant"] for c in hits_guard], "names": [o.name for o in made]}


def plant_instances(coll, p, protos, n, plan, clearance):
    """The pot's plant (and an olive's companion form) as collection instances; appends their clearance records."""
    forms = [(p["model"], p["rot_deg"], p["height"], p["radius"], "")]
    if "companion" in p:
        c = p["companion"]
        forms.append((c["model"], c["rot_deg"], c["height"], c["radius"], "b"))
    bay = next(b for b in plan["envelope"]["bays"] if b["id"] == p["bay"])
    N = Vector((bay["outward"][0], bay["outward"][1], 0.0))
    a = Vector((bay["a"][0], bay["a"][1], 0.0))
    soil = p["z"] + p["pot"]["height"] - 0.05
    made = []
    for model, rot_deg, height, radius, suffix in forms:
        proto = protos[model]
        s_z, s_xy = height / proto["rb_height"], radius / proto["rb_radius"]
        M = Matrix.Translation((p["at"][0], p["at"][1], soil))
        if "tilt_deg" in p:
            towards = Vector((p["tilt_towards"][0], p["tilt_towards"][1], 0.0))
            M = M @ Matrix.Rotation(math.radians(p["tilt_deg"]), 4, Vector((0, 0, 1)).cross(towards))
        M = M @ Matrix.Rotation(math.radians(rot_deg), 4, "Z") @ Matrix.Diagonal((s_xy, s_xy, s_z, 1.0))
        ob = bpy.data.objects.new(f"rb_plant_f{p['floor']}_{p['bay']}_{n}{suffix}", None)
        ob.instance_type = "COLLECTION"
        ob.instance_collection = proto
        ob.matrix_world = M
        ob.empty_display_size = 0.2
        for k, v in tags("plant", f"{p['kind']}:{model}").items():
            ob[k] = v
        coll.objects.link(ob)
        made.append(ob)
        # clearance: the foliage against the guard glass (outward) and the window frames (inward), as offsets from the
        # bay's wall line along its outward normal
        vs = [(M @ q - a).dot(N) for q in foliage_points(proto)]
        clearance.append({"plant": ob.name, "out_max": round(max(vs), 3), "in_min": round(min(vs), 3)})
    return made
