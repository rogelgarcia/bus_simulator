# layer_site_palms.py -- AI 633: street palms, entrance planters and street lamps, site dressing from
# plan["props"]["street_dressing"].
#
# Run through build.py (layers=site_palms; needs site_cafe for the sidewalk). Builds RB_SITE/RB_SITE_PALMS beside the
# building (the street, not the building):
#   rb_site_tree_pits        raised limestone tree-pit planters (TM_RB_paving, soil TM_RB_soil 40 mm below the rim, a
#                            mound since user fix 23: soil.mound_pockets, its pocket wall in soil.pit_wall_slot):
#                            a body and a coping of four L-shaped corner stones; the vertical corners chamfered
#                            (plan pits[].chamfer, 2026-10-15); every exposed convex edge rounded (pits[].round in
#                            round_segments segments: user fix 18 addendum 2, round_edges)
#   rb_site_palm_<n>         tall detailed street palms (proc_plants.py "street_palm", palm_tree.py since 2026-10-14)
#                            in the pits, fitted within 10 % xy / z (layer_roof_planters.fit_scales), low viburnum round
#                            each trunk (rb_site_pit_green_<n>)
#   rb_site_entrance_pots    charcoal pots at the entrance (AI 627's tapered pot) with cycads (rb_site_entrance_plant_<n>;
#                            plant_cycad.py's pinnate-leaved cycad since user fix 12, fitted within its rb_fit_aniso)
#   rb_site_lamp_<n>         the installed CC0 street_lamp_01 (assets/props, Poly Haven, read-only), imported once as the
#                            prototype RBP_street_lamp_01 and instanced
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
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
import layer_podium_planters as PP  # noqa: E402  (inset)
import layer_roof_planters as RP  # noqa: E402  (proc / game prototypes, instances, island boxes)
import soil as S  # noqa: E402  (user fix 23: the soil's mound; RP.instances re-seats the plants on it)

for mod in (L, BP, PP, RP, S):
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


def pit_pieces(loop, z, height, mat, chamfer=0.0, rim=0.06, soil_drop=0.04, overhang=0.0):
    """A raised square planter: the body up to the soil, then the coping as four L-shaped corner stones, each wrapping
    one corner and meeting its neighbours mid-side, so no region with a hole is needed (a turned square's hole meets
    rb_lib's cut line at its corners). chamfer (2026-10-15, the user's fix 5: "make the flower pots chamfered on the
    corner"): the vertical corners are cut with legs this long; body and coping follow the chamfered outline, the
    coping's soil side the same outline `rim` in, so the materials pass's coping seam and foot joint run round it.
    overhang (2026-10-16): the coping stands this far proud of the body, a drip edge; flush, the seam between them was
    a joint groove the materials pass cut across the body's rounded corners into notches (the user: "damaged")."""
    outer = L.ccw(L.chamfer(L.ccw([tuple(p) for p in loop]), chamfer))
    z1 = z + height
    items = [L.piece(outer, [(z, z1 - soil_drop)], mat, mat_top="TM_RB_soil")]
    inner = PP.inset(outer, rim)
    k = len(outer) // 4                                                # points per corner: 1 square, 2 chamfered
    def mid(lp, i):
        p, q = lp[i], lp[(i + 1) % len(lp)]
        return ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    cope = PP.inset(outer, -overhang) if overhang else outer
    for corner in range(4):
        first, last = corner * k, corner * k + k - 1                   # the corner's points; the sides run last -> next
        ids = range(first, last + 1)
        m0, m1 = mid(cope, (first - 1) % len(cope)), mid(cope, last)
        n0, n1 = mid(inner, (first - 1) % len(inner)), mid(inner, last)
        foot = [m0] + [cope[i] for i in ids] + [m1, n1] + [inner[i] for i in reversed(ids)] + [n0]
        items.append(L.piece(L.ccw(foot), [(z1 - soil_drop, z1)], mat))
    return items


def pit_soil(p, rim=0.06, soil_drop=0.04):
    """A pit's visible soil inside its coping (user fix 23; pit_pieces' outline `rim` in), as (outline, body top z, rim
    height) for soil.mound_pockets."""
    outer = L.ccw(L.chamfer(L.ccw([tuple(q) for q in p["loop"]]), p.get("chamfer", 0.0)))
    return PP.inset(outer, rim), p["z"] + p["height"] - soil_drop, soil_drop


def round_edges(ob, others, radius, segments, slot="TM_RB_paving", min_turn_deg=25.0):
    """User fix 18 addendum 2 ("bevel the hard edges of the palm bases; just a small rounded edge. 2 loops"): every
    exposed convex edge between two `slot` faces of ob turning at least min_turn_deg is rounded to `radius` in
    `segments` segments. An edge whose probes touch another solid (layer_materials.Contacts over ob's own solids and
    `others`: the coping on the body, the stones meeting mid-side, the paving under the body) is buried and stays as it
    is, as do inside corners. The round's faces get the face attribute rb_round, by which the materials pass shades
    them smooth while the flats stay flat. Returns the edges rounded."""
    import layer_materials as LM                                        # noqa: E402  (Contacts, ROUND_ATTR)
    contacts = LM.Contacts([ob] + others, 0.0015)
    me = ob.data
    sids = LM.solid_ids(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    stone = {i for i, m in enumerate(me.materials) if m and m.name == slot}
    lay = bm.faces.layers.int.get(LM.ROUND_ATTR) or bm.faces.layers.int.new(LM.ROUND_ATTR)
    picked = []
    for e in bm.edges:
        if len(e.link_faces) != 2 or not e.is_convex:
            continue
        a, b = e.link_faces
        if a.material_index not in stone or b.material_index not in stone:
            continue
        if a.normal.angle(b.normal, 0.0) < math.radians(min_turn_deg):
            continue
        p0, p1 = e.verts[0].co, e.verts[1].co
        d = (p1 - p0).normalized()
        out = (a.normal + b.normal).normalized() * 0.001
        probes = lambda x, p0=p0, d=d, out=out: [p0 + d * (x - p0.dot(d)) + out]  # noqa: E731
        lo, hi = sorted((p0.dot(d), p1.dot(d)))
        spans = contacts.exposed(ob.name, sids[a.index], probes, lo, hi, step=0.02)
        if sum(s1 - s0 for s0, s1 in spans) >= 0.98 * (hi - lo):
            picked.append(e)
    if picked:
        res = bmesh.ops.bevel(bm, geom=picked, offset=radius, offset_type="OFFSET", segments=segments, profile=0.5,
                              affect="EDGES", clamp_overlap=True)
        for f in res["faces"]:                  # (bevel may pick the soil's slot for its new faces)
            f[lay] = 1
            f.material_index = min(stone)
    bm.to_mesh(me)
    bm.free()
    me.set_sharp_from_angle(angle=math.radians(30.0))
    return len(picked)


def build(plan):
    site = L.ensure_collection(SITE)
    coll = L.ensure_collection(COLLECTION, site)
    L.clear_collection(coll)
    BP.prop_materials()
    S.begin()
    sd = plan["props"]["street_dressing"]
    made = []
    pits = [pit_pieces(p["loop"], p["z"], p["height"], "TM_RB_paving", chamfer=p.get("chamfer", 0.0),
                       overhang=p.get("overhang", 0.0))
            for p in sd["pits"]]
    made.append(L.pieces("rb_site_tree_pits", coll, [i for pit in pits for i in pit], tags("tree_pit", "tree_pits")))
    p0 = sd["pits"][0] if sd["pits"] else {}
    rounded = round_edges(made[-1], [o for o in [bpy.data.objects.get("rb_site_sidewalk")] if o is not None],
                          p0.get("round", 0.0), p0.get("round_segments", 2)) if p0.get("round") else 0
    S.mound_pockets(made[0], [pit_soil(p) for p in sd["pits"]], S.cfg()["pit_wall_slot"])          # user fix 23
    bm = bmesh.new()
    slots = [f"TM_RB_pot_{c}" for c in BP.POT_RGB] + ["TM_RB_soil"]
    for p in sd["pots"]:
        BP.pot(bm, slots, p["at"], p["z"], p["radius"], p["height"], p["colour"])
    made.append(L.finish("rb_site_entrance_pots", coll, bm, slots, tags("pot", "entrance_pots"), smooth_deg=40.0))
    S.mound_pots(made[-1])                                             # user fix 23
    models = sorted({p["model"] for p in sd["palms"] + sd["pit_greens"] + sd["entrance_plants"]})
    protos = {m: RP.prototype(m) for m in models}
    BP.exclude(BP.PROTOTYPES)
    fits = {}
    for group, items in (("palm", sd["palms"]), ("pit_green", sd["pit_greens"]), ("entrance_plant", sd["entrance_plants"])):
        for i, p in enumerate(items):
            for ob, M, proto in RP.instances(coll, p, protos, f"rb_site_{group}_{i + 1}"):
                for k, v in tags(group, ob.name).items():
                    ob[k] = v
                made.append(ob)
                if proto.get("rb_fit_aniso"):
                    fits[ob.name] = RP.palm_fit(M)
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
            "pit_edges_rounded": rounded, "entrance_pots": len(sd["pots"]), "lamps": len(sd["lamps"]), "lamp_height": round(lamp["rb_height"], 2),
            "palm_prototypes": {m: [round(protos[m]["rb_height"], 2), round(protos[m]["rb_radius"], 2)] for m in models
                                if "street_palm" in m},
            "palm_fit": fits, "palm_tris": {m: protos[m].get("rb_tris") for m in models if "street_palm" in m},
            "soil": S.report(), "names": [o.name for o in made]}
