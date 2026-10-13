# layer_site_cafe.py -- AI 632: the sidewalk café and its sidewalk, site dressing from plan["props"]["sidewalk_cafe"].
#
# Run through build.py (layers=site_cafe; needs the structure and podium layers). Builds RB_SITE, a scene collection
# beside TERRAMAR_REBUILD (the street, not the building: a city scene can keep or drop it):
#   RB_SITE_GROUND/rb_site_sidewalk   the sidewalk slab along the front runs (H, A, B), 6 m wide, from the street (z 0) up
#                                     to the ground floor level; its inner edge follows the balcony edge and the
#                                     entrance's bump; its top is TM_RB_site_paving (the materials pass lays the pavers)
#   RB_SITE_CAFE/rb_cafe_umbrellas    square market umbrellas: a thin pyramid shell canopy with a short valance
#                                     (TM_RB_cafe_canopy, cream) on a wood pole (TM_RB_teak)
#   RB_SITE_CAFE/rb_cafe_tables       round wood tables on a charcoal pedestal and base, each with a hole the pole runs
#                                     through
#   RB_SITE_CAFE/rb_cafe_chairs       woven bistro chairs (TM_RB_cafe_rattan), facing their table
# The audit's rebuild root does not see the site; audit it with root=RB_SITE.
import importlib
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (plain materials)
import layer_roof_furniture as RF  # noqa: E402  (item frames)

importlib.reload(L)
importlib.reload(BP)
importlib.reload(RF)

SITE = "RB_SITE"
LAYER = "site_cafe"
LOOKS = {"TM_RB_cafe_canopy": ((0.80, 0.77, 0.69), 0.90), "TM_RB_cafe_rattan": ((0.30, 0.19, 0.10), 0.80),
         "TM_RB_teak": ((0.30, 0.165, 0.085), 0.55), "TM_RB_charcoal_metal": ((0.045, 0.045, 0.05), 0.40)}


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": SITE, "tm_role": element, "rb_name": name}


def disc(c, r, n=24):
    return [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def ring(c, r_out, r_in, spans, mat):
    """A round slab with a hole in its middle (the umbrella pole runs through)."""
    outer, inner = disc(c, r_out), disc(c, r_in, 12)
    return (spans, [(outer, mat), (inner, mat)], [([outer, inner], mat, mat)])


def canopy(bm, slot, centre, U, cfg, z0):
    """A square pyramid shell: outer and inner surfaces `shell` apart, joined at the rim; then the valance below the rim."""
    h, t = cfg["half"], cfg["shell"]
    V = (-U[1], U[0])
    corners = [(su, sv) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    pt = lambda su, sv, z: (centre[0] + (U[0] * su + V[0] * sv) * h, centre[1] + (U[1] * su + V[1] * sv) * h, z)  # noqa: E731
    rim, apex = z0 + cfg["rim_z"], z0 + cfg["apex_z"]
    o_apex, i_apex = bm.verts.new((centre[0], centre[1], apex)), bm.verts.new((centre[0], centre[1], apex - t))
    o_rim = [bm.verts.new(pt(su, sv, rim)) for su, sv in corners]
    i_rim = [bm.verts.new(pt(su, sv, rim - t)) for su, sv in corners]
    for k in range(4):
        a, b = k, (k + 1) % 4
        bm.faces.new((o_apex, o_rim[a], o_rim[b])).material_index = slot
        bm.faces.new((i_apex, i_rim[b], i_rim[a])).material_index = slot
        bm.faces.new((o_rim[a], i_rim[a], i_rim[b], o_rim[b])).material_index = slot
    # the valance: four thin bands hanging from the rim's underside, flush with its outer edge
    d, vh = 0.006, cfg["valance"]
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        inset = 1.0 - d / h
        pts = [pt(a[0], a[1], rim - t - vh), pt(b[0], b[1], rim - t - vh), pt(b[0] * inset, b[1] * inset, rim - t - vh),
               pt(a[0] * inset, a[1] * inset, rim - t - vh)]
        bottom = [bm.verts.new(q) for q in pts]
        top = [bm.verts.new((q[0], q[1], rim - t)) for q in pts]
        for f in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            bm.faces.new([(bottom + top)[i] for i in f]).material_index = slot


def chair(item, z0, cfg, out):
    fr = RF.Frame({"at": item["at"], "face": item["face"]})
    w, d = cfg["w"], cfg["d"]
    m = "TM_RB_cafe_rattan"
    for su in (-1, 1):                                                 # woven legs
        for sv in (-1, 1):
            cu, cv = su * (w / 2 - 0.03), sv * (d / 2 - 0.03)
            out.append(L.piece(fr.box(cu - 0.015, cu + 0.015, cv - 0.015, cv + 0.015), [(z0, z0 + cfg["seat"] - 0.03)], m))
    out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, d / 2), [(z0 + cfg["seat"] - 0.03, z0 + cfg["seat"])], m))
    out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, -d / 2 + 0.035), [(z0 + cfg["seat"], z0 + cfg["back"])], m))


def build(plan):
    site = L.ensure_collection(SITE)
    ground = L.ensure_collection("RB_SITE_GROUND", site)
    cafe = L.ensure_collection("RB_SITE_CAFE", site)
    L.clear_collection(ground)
    L.clear_collection(cafe)
    for name, (rgb, rough) in LOOKS.items():
        if bpy.data.materials.get(name) is None or name.startswith("TM_RB_cafe"):
            BP.plain_material(name, rgb, rough)
    c = plan["props"]["sidewalk_cafe"]
    sw = c["sidewalk"]
    foot = [tuple(q) for q in sw["footprint"]]
    walk = L.solid("rb_site_sidewalk", ground, [tuple(sw["z"])], [(foot, "TM_RB_site_paving")],
                   [([foot], "TM_RB_site_paving", "TM_RB_hidden")], tags("sidewalk", "sidewalk"))
    z0, cfg = c["z"], c["config"]
    um, tc = cfg["umbrella"], cfg["table"]
    poles, tables, chairs = [], [], []
    bm = bmesh.new()
    for s in c["sets"]:
        canopy(bm, 0, s["at"], s["along"], um, z0)
        poles.append(L.piece(disc(s["at"], um["pole_r"], 10), [(z0, z0 + um["apex_z"] - um["shell"] - 0.03)], "TM_RB_teak"))
        tables.append(ring(s["at"], tc["r"], tc["hole"], [(z0 + tc["h"] - 0.03, z0 + tc["h"])], "TM_RB_teak"))
        tables.append(ring(s["at"], tc["hole"] + 0.012, tc["hole"], [(z0 + 0.03, z0 + tc["h"] - 0.03)], "TM_RB_charcoal_metal"))
        tables.append(ring(s["at"], 0.26, tc["hole"], [(z0, z0 + 0.03)], "TM_RB_charcoal_metal"))
        for ch in s["chairs"]:
            chair(ch, z0, cfg["chair"], chairs)
    canopies = L.finish("rb_cafe_canopies", cafe, bm, ["TM_RB_cafe_canopy"], tags("umbrella", "umbrella_canopies"), smooth_deg=5.0)
    made = [walk, canopies,
            L.pieces("rb_cafe_poles", cafe, poles, tags("umbrella", "umbrella_poles")),
            L.pieces("rb_cafe_tables", cafe, tables, tags("table", "cafe_tables")),
            L.pieces("rb_cafe_chairs", cafe, chairs, tags("chair", "cafe_chairs"))]
    return {"collection": SITE, "objects": len(made), "sets": len(c["sets"]),
            "chairs": sum(len(s["chairs"]) for s in c["sets"]), "sidewalk_points": len(foot), "names": [o.name for o in made]}
