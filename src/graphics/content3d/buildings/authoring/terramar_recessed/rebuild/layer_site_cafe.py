# layer_site_cafe.py -- AI 632: the sidewalk café and its sidewalk, site dressing from plan["props"]["sidewalk_cafe"].
#
# Run through build.py (layers=site_cafe; needs the structure and podium layers). Builds RB_SITE, a scene collection
# as the site part's root (the street, not the building: a city scene can keep or drop it):
#   RB_SITE_GROUND/rb_site_sidewalk   the sidewalk slab along the front runs (H, A, B), 6 m wide, from the street (z 0) up
#                                     to the ground floor level; its inner edge follows the balcony edge and the
#                                     entrance's bump; its top is TM_RB_site_paving (the materials pass lays the pavers)
#   RB_SITE_CAFE/rb_cafe_umbrella_<n> cafe_umbrella.py's octagonal market umbrella (2026-10-14), one object per set:
#                                     8 sagging canvas panels with seam ridges and a turned hem, a raised vent cap
#                                     and finial, 8 valance flaps, wood ribs and struts on a runner, a two-section
#                                     wood pole (sleeve, pulley, halyard, cleat) down through the table's hole to the
#                                     sidewalk; each seeded by its set (sag, scallop, flaps, the halyard's side)
#   RB_SITE_CAFE/rb_cafe_table_<n>_cafe_table   furniture_tables_seating.py's café table: a round teak top with an open
#                                     centre hole the pole runs through, a hollow charcoal column, four cast arms
#   RB_SITE_CAFE/rb_cafe_chair_<n>_cafe_chair   furniture_chairs.py's rattan bistro chairs facing their table (b8:
#                                     mostly armchairs; a seeded one set in four side chairs), a table's chairs matching
# The tables and chairs are placed by layer_roof_furniture.furnish: one object each, identical ones sharing a mesh.
# The audit's rebuild root does not see the site; audit it with root=RB_SITE.
import importlib
import os
import sys
import zlib

import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import cafe_umbrella as CU  # noqa: E402  (the detailed market umbrella)
import layer_roof_furniture as RF  # noqa: E402  (the detailed furniture's placement and materials)

importlib.reload(L)
importlib.reload(CU)
importlib.reload(RF)

SITE = "RB_SITE"
LAYER = "site_cafe"
SIDE_CHAIRS_EVERY = 4                                                  # one set in this many has side chairs (seeded)


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": SITE, "tm_role": element, "rb_name": name}


def umbrellas(cafe, c):
    """One cafe_umbrella per set, its own object (the audit pairs it with its table, chairs and neighbours), seeded by
    the café's seed and the set; returns (objects, stats)."""
    z0, um = c["z"], c["config"]["umbrella"]
    obs, tris, worst = [], 0, 0.0
    for i, s in enumerate(c["sets"]):
        bm = bmesh.new()
        slots = []

        def slot(name, slots=slots):
            if name not in slots:
                slots.append(name)
            return slots.index(name)
        res = CU.build(bm, slot, s["at"], s["along"], um, z0, seed=f"{c['seed']}:{i}")
        obs.append(CU.to_object(f"rb_cafe_umbrella_{i}", cafe, bm, slots, tags("umbrella", f"umbrella_{i}")))
        tris += res["tris"]
        worst = max(worst, res["extent_u"], res["extent_v"])
        if res["low_r"] >= c["config"]["table"]["hole"]:
            raise SystemExit(f"layer_site_cafe: umbrella {i} is {res['low_r']:.4f} m wide in the table's hole")
    return obs, {"umbrella_tris": tris, "umbrella_extent": round(worst, 4)}


def furniture_items(c):
    """The café's tables and chairs as furniture items: (tables, chairs). A set's chairs share its seed key, so they
    match; one set in SIDE_CHAIRS_EVERY (seeded) has side chairs, the rest b8's armchairs."""
    tc, ch = c["config"]["table"], c["config"]["chair"]
    tables, chairs = [], []
    for i, s in enumerate(c["sets"]):
        tables.append({"kind": "cafe_table", "at": s["at"], "face": s["along"], "size": [2 * tc["r"], 2 * tc["r"]],
                       "top_r": tc["r"], "hole_r": tc["hole"], "h": tc["h"]})
        variant = "side" if zlib.crc32(f"cafe:{c['seed']}:{i}".encode()) % SIDE_CHAIRS_EVERY == 0 else "arm"
        for it in s["chairs"]:
            chairs.append({"kind": "cafe_chair", "at": it["at"], "face": it["face"], "size": [ch["w"], ch["d"]],
                           "seat_h": ch["seat"], "back_h": ch["back"], "variant": variant, "set": f"cafe_{i}"})
    return tables, chairs


def build(plan):
    site = L.ensure_collection(SITE)
    ground = L.ensure_collection("RB_SITE_GROUND", site)
    cafe = L.ensure_collection("RB_SITE_CAFE", site)
    L.clear_collection(ground)
    RF.clear(cafe)
    CU.materials()                                                     # the canvas, wood, metal and rope
    RF.materials()                                                     # the furniture's
    c = plan["props"]["sidewalk_cafe"]
    sw = c["sidewalk"]
    foot = [tuple(q) for q in sw["footprint"]]
    walk = L.solid("rb_site_sidewalk", ground, [tuple(sw["z"])], [(foot, "TM_RB_site_paving")],
                   [([foot], "TM_RB_site_paving", "TM_RB_hidden")], tags("sidewalk", "sidewalk"))
    z0 = c["z"]
    obs_u, st_u = umbrellas(cafe, c)
    made = [walk] + obs_u
    tables, chairs = furniture_items(c)
    obs_t, st_t = RF.furnish(cafe, tables, "rb_cafe_table", lambda e, n: tags("table", n), z0)
    obs_c, st_c = RF.furnish(cafe, chairs, "rb_cafe_chair", lambda e, n: tags("chair", n), z0)
    made += obs_t + obs_c
    return {"collection": SITE, "objects": len(made), "sets": len(c["sets"]), "chairs": len(chairs),
            "variants": {v: sum(1 for it in chairs if it["variant"] == v) for v in ("arm", "side")},
            "furniture_meshes": st_t["meshes"] + st_c["meshes"],
            "tris_placed": st_t["tris_placed"] + st_c["tris_placed"],
            "tris_stored": st_t["tris_stored"] + st_c["tris_stored"], **st_u, "sidewalk_points": len(foot),
            "names": [o.name for o in made]}
