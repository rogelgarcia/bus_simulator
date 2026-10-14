# layer_structure.py -- AI 643: the structure layer of the Terra & Mar rebuild, built from terramar_plan.json.
#
# Run through build.py (layers=structure). Builds RB_STRUCTURE under its part root:
#   rb_slab_<name>      one solid per slab of plan.structure.slabs. Face sets (material slots):
#                         TM_RB_slab_fascia  the outer edge            TM_RB_hidden   faces in contact (core, pilasters)
#                         TM_RB_slab_top     balcony / terrace top     TM_RB_floor    interior floor plate (inside the wall line)
#                         TM_RB_soffit       balcony underside         TM_RB_ceiling  interior ceiling
#                         TM_RB_roof_top     roof and entrance canopy tops
#                       Residential slabs are notched around the front pilasters; every slab has a hole at the core.
#   rb_pilaster_<side>  the two front pilasters, full height from the podium roof to the roof slab, proud of the slab edge
#   rb_column_<run><n>  the rounded chamfer columns, one object per marker holding its storey-high segments
#   rb_core             stair + two lift shafts, from below the ground slab to the penthouse roof
#   rb_entrance_jamb_<side>  the entrance volume's side walls, under its canopy
# Nothing interpenetrates: pieces meet face to face (column on slab, slab notch against pilaster, slab against core).
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

COLLECTION = "RB_STRUCTURE"
LAYER = "structure"


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def rounded_rect(w, v0, v1, r_front, r_back, n=8):
    """Column section in local (u along the run, v outward): u in [-w/2, w/2], v in [v0, v1], front corners rounded."""
    corners = [((w / 2 - r_front, v1 - r_front), r_front, 0.0), ((-w / 2 + r_front, v1 - r_front), r_front, 90.0),
               ((-w / 2 + r_back, v0 + r_back), r_back, 180.0), ((w / 2 - r_back, v0 + r_back), r_back, 270.0)]
    pts = []
    for (cu, cv), r, a0 in corners:
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((cu + r * math.cos(a), cv + r * math.sin(a)))
    return pts


def build(plan):
    coll = L.layer_collection(COLLECTION)
    st = plan["structure"]
    lay = plan["layers"]
    edge = L.ccw([tuple(p) for p in lay["balcony_edge"]["outline"]])
    wall = L.ccw([tuple(p) for p in lay["tower_wall_line"]["outline"]])
    pil = plan["markers"]["front_pilasters"]
    y_front, y_wall = pil[0]["y"]
    core = st["core"]
    co = core["outer"]
    core_loop = L.rect(co["x"][0], co["x"][1], co["y"][0], co["y"][1])
    ent = lay["entrance"]["outline"]
    ex = sorted({round(p[0], 4) for p in ent})
    ey = sorted({round(p[1], 4) for p in ent})
    ent_rect = L.rect(ex[0], ex[1], ey[0], ey[1])                     # y: front .. the podium line

    # podium outline with the entrance bump (ground and upper podium slabs)
    edge_ent = L.insert_points(edge, [(ex[0], y_front), (ex[1], y_front)])
    i = L.index_of(edge_ent, (ex[0], y_front))
    bumped = edge_ent[:i + 1] + [(ex[0], ey[0]), (ex[1], ey[0])] + edge_ent[i + 1:]

    # residential: notches round the pilasters
    xs = [x for m in pil for x in m["x"]]                             # left outer, left inner, right inner, right outer
    edge_pil = L.insert_points(edge, [(x, y_front) for x in xs])
    wall_pil = L.insert_points(wall, [(x, y_wall) for x in xs])
    notched = []
    notch_corners = set()
    for p in edge_pil:
        notched.append(p)
        for (x0, x1) in [m["x"] for m in pil]:
            if L._key(p) == L._key((x0, y_front)):
                notched += [(x0, y_wall), (x1, y_wall)]
                notch_corners |= {L._key(q) for q in [(x0, y_front), (x0, y_wall), (x1, y_wall), (x1, y_front)]}
    notched_sides = []
    for k in range(len(notched)):
        a, b = L._key(notched[k]), L._key(notched[(k + 1) % len(notched)])
        is_notch = a in notch_corners and b in notch_corners and not (a[1] == b[1] == round(y_front, 5))
        notched_sides.append("TM_RB_hidden" if is_notch else "TM_RB_slab_fascia")
    l_out, l_in, r_in, r_out = xs
    c_loop = L.path(notched, (r_out, y_front), (l_out, y_wall))
    c_loop += list(reversed(L.path(wall_pil, (r_out, y_wall), (l_out, y_wall))))[1:]
    centre = L.rect(l_in, r_in, y_front, y_wall)

    made = []
    for s in st["slabs"]:
        kind, name, span = s["kind"], f"rb_slab_{s['name']}", [tuple(s["z"])]
        hole = (core_loop, "TM_RB_hidden")
        if kind == "ground":
            ob = L.solid(name, coll, span, [(bumped, "TM_RB_slab_fascia"), hole],
                         [([bumped, core_loop], "TM_RB_floor", "TM_RB_hidden")], tags("slab", s["name"]))
        elif kind == "podium_floor":
            ob = L.solid(name, coll, span, [(bumped, "TM_RB_slab_fascia"), hole],
                         [([edge_ent, core_loop], "TM_RB_floor", "TM_RB_ceiling"),
                          ([ent_rect], "TM_RB_roof_top", "TM_RB_soffit")], tags("slab", s["name"]))
        elif kind == "podium_roof":
            ob = L.solid(name, coll, span, [(edge, "TM_RB_slab_fascia"), hole],
                         [([edge, wall], "TM_RB_slab_top", "TM_RB_ceiling"),
                          ([wall, core_loop], "TM_RB_floor", "TM_RB_ceiling")], tags("slab", s["name"]))
        elif kind == "residential":
            ob = L.solid(name, coll, span, [(notched, notched_sides), hole],
                         [([c_loop], "TM_RB_slab_top", "TM_RB_soffit"), ([centre], "TM_RB_slab_top", "TM_RB_soffit"),
                          ([wall_pil, core_loop], "TM_RB_floor", "TM_RB_ceiling")], tags("slab", s["name"]))
        elif kind == "roof":
            ob = L.solid(name, coll, span, [(edge, "TM_RB_slab_fascia"), hole],
                         [([edge, wall], "TM_RB_roof_top", "TM_RB_soffit"),
                          ([wall, core_loop], "TM_RB_roof_top", "TM_RB_ceiling")], tags("slab", s["name"]))
        else:
            raise ValueError(f"unknown slab kind {kind}")
        made.append(ob)

    # front pilasters: proud of the slab edge, back face on the wall line, podium roof to roof slab
    for m, side in zip(pil, ("left", "right")):
        loop = L.rect(m["x"][0], m["x"][1], y_front - st["pilasters"]["proud_m"], y_wall)
        made.append(L.prism(f"rb_pilaster_{side}", coll, loop, [tuple(st["pilasters"]["z"])], "TM_RB_pilaster",
                            tags("pilaster", side), mat_top="TM_RB_hidden", mat_bottom="TM_RB_hidden"))

    # rounded chamfer columns, storey by storey between the slabs
    cs = st["columns"]
    section = rounded_rect(cs["width"], -cs["behind"], cs["proud"], cs["front_radius"], cs["back_radius"])
    counts = {}
    for c in plan["markers"]["chamfer_columns"]:
        counts[c["run"]] = counts.get(c["run"], 0) + 1
        (ax, ay), (ux, uy), (nx, ny) = c["at"], c["along"], c["outward"]
        loop = [(ax + u * ux + v * nx, ay + u * uy + v * ny) for u, v in section]
        made.append(L.prism(f"rb_column_{c['run']}{counts[c['run']]}", coll, L.ccw(loop), [tuple(z) for z in cs["storeys"]],
                            "TM_RB_column", tags("column", f"{c['run']}{counts[c['run']]}"),
                            mat_top="TM_RB_hidden", mat_bottom="TM_RB_hidden"))

    # core: stair + two lift shafts
    shafts = [L.rect(r["x"][0], r["x"][1], r["y"][0], r["y"][1]) for r in core["compartments"]]
    made.append(L.solid("rb_core", coll, [tuple(core["z"])], [(core_loop, "TM_RB_core")] + [(h, "TM_RB_core") for h in shafts],
                        [([core_loop] + shafts, "TM_RB_core", "TM_RB_hidden")], tags("core", "core")))

    # entrance jambs under the canopy
    e = st["entrance"]
    for side, (x0, x1) in (("left", (ex[0], ex[0] + e["side_wall"])), ("right", (ex[1] - e["side_wall"], ex[1]))):
        made.append(L.prism(f"rb_entrance_jamb_{side}", coll, L.rect(x0, x1, ey[0], ey[1]), [tuple(e["z"])],
                            "TM_RB_pilaster", tags("entrance_jamb", side), mat_top="TM_RB_hidden", mat_bottom="TM_RB_hidden"))
    return {"collection": COLLECTION, "objects": len(made),
            "faces": sum(len(o.data.polygons) for o in made), "names": [o.name for o in made]}
