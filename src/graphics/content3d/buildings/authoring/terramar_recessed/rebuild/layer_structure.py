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
# Stone returns (2026-10-14, plan["returns"]): the entrance jambs' front corners wrap into the opening as a stone return
# flush with the wood lining (arris eased, the lining held back by a shadow gap: layer_podium.py); the residential and
# roof slabs' fascias turn under the soffit as a stone strip, then a recessed shadow gap (TM_RB_stone_joint) before the
# soffit. Such a slab is built as two stacked spans welded into one solid, so the fascia stays one face top to bottom.
# Nothing interpenetrates: pieces meet face to face (column on slab, slab notch against pilaster, slab against core).
import importlib
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import layer_materials as M  # noqa: E402
import rb_lib as L  # noqa: E402

importlib.reload(L)

COLLECTION = "RB_STRUCTURE"
LAYER = "structure"
INTERNAL = "__rb_internal__"          # the faces where a slab's two spans meet, deleted before the weld


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


def return_loop(x_out, x_in, y_front, y_back, lip, rt, stone, joint):
    """A jamb's footprint from its outer face x_out to its face to the opening x_in, y_front back to y_back, whose front
    corner wraps into the opening (2026-10-14): a stone return `lip` proud of x_in (flush with the opening's wood lining)
    and rt["return"] deep, its arris eased by rt["arris"]; the return's back face is a wall of the shadow gap before the
    lining. Returns the points and the material of the edge from each point (shared with layer_podium.py's loggia)."""
    d = 1.0 if x_in > x_out else -1.0                                   # towards the opening
    xi, a, r = x_in + d * lip, rt["arris"], rt["return"]
    pts = [(x_out, y_front), (xi - d * a, y_front), (xi, y_front + a), (xi, y_front + r), (x_in, y_front + r),
           (x_in, y_back), (x_out, y_back)]
    return pts, [stone, stone, stone, joint, stone, stone, stone]


def offset_loop(loop, v):
    """A closed counter-clockwise loop offset by v (outward +), mitred at every corner (as rb_lib.band for open paths)."""
    n = len(loop)
    out = []
    for i in range(n):
        p0, p, p1 = loop[i - 1], loop[i], loop[(i + 1) % n]
        a = ((p[1] - p0[1]) / math.dist(p0, p), -(p[0] - p0[0]) / math.dist(p0, p))
        b = ((p1[1] - p[1]) / math.dist(p, p1), -(p1[0] - p[0]) / math.dist(p, p1))
        k = 1.0 + a[0] * b[0] + a[1] * b[1]
        out.append((p[0] + (a[0] + b[0]) / k * v, p[1] + (a[1] + b[1]) / k * v))
    return out


def with_cut(loop, mats, cut):
    """The loop (and its per-edge materials) with the points where it crosses the line x = cut: rb_lib cuts a region with
    a hole there, and both spans of a stacked slab must carry the same points to weld."""
    pts = L._crossings(loop, 0, cut)
    return L._insert_tracked(loop, mats if mats is not None else [None] * len(loop), pts)


def stacked_slab(name, coll, z0, z1, d, upper, lowers, rt, tags):
    """A slab with a recessed shadow gap in its underside (2026-10-14): the upper span (z0 + d .. z1) holds every region,
    the gap's bottom in the joint material; the lower span (z0 .. z0 + d) holds the islands beside the gap (the stone
    return strips, the soffit and interior). The faces where the spans meet (INTERNAL) are deleted and the two welded
    into one closed solid (finish() then merges each fascia's two parts into one face). The return's arris (the edges
    between the fascia and the strip under it) is eased by rt["arris"]. upper / lowers: (boundary, regions) as L.solid."""
    bm = bmesh.new()
    slots = []
    L._add_solid(bm, slots, [(z0 + d, z1)], *upper)
    for boundary, regions in lowers:
        L._add_solid(bm, slots, [(z0, z0 + d)], boundary, regions)
    k = slots.index(INTERNAL)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == k], context="FACES_ONLY")
    for f in bm.faces:
        if f.material_index > k:
            f.material_index -= 1
    slots.pop(k)
    zm = z0 + d
    bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if abs(v.co.z - zm) < 1e-5], dist=1e-5)
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")   # the regions' inner lines
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context="VERTS")
    bm.normal_update()
    fascia = slots.index("TM_RB_slab_fascia")

    def at_bottom(e, kinds):
        return (len(e.link_faces) == 2 and all(f.material_index == fascia for f in e.link_faces)
                and all(abs(v.co.z - z0) < 1e-5 for v in e.verts)
                and sorted(round(abs(f.normal.z)) for f in e.link_faces) == kinds)
    arris = [e for e in bm.edges if at_bottom(e, [0, 1])]                    # a fascia over its return strip
    if arris:
        bmesh.ops.bevel(bm, geom=arris, offset=rt["arris"], offset_type="OFFSET", segments=1, profile=0.5,
                        affect="EDGES", clamp_overlap=True, material=fascia)
    bm.normal_update()
    # the return strip stays one face per fascia face (the materials pass carries each fascia's joints across its own
    # piece of the strip): its pieces' meeting lines are kept out of the coplanar merge, as UV seams, cleared after
    keep = [e for e in bm.edges if at_bottom(e, [1, 1])]
    return finish_kept(name, coll, bm, slots, tags, keep)


def finish_kept(name, coll, bm, slots, tags, keep, smooth_deg=30.0):
    """rb_lib.finish (normals out, coplanar faces merged per face set, box UVs, smooth / sharp) keeping the edges in
    `keep` out of the merge."""
    for e in keep:
        e.seam = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=[], edges=bm.edges[:], delimit={"MATERIAL", "SEAM"})
    for e in bm.edges:
        e.seam = False
    bm.normal_update()
    L.box_uvs(bm)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for s in slots:
        me.materials.append(L.material(s))
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(smooth_deg))
    ob = bpy.data.objects.new(name, me)
    for k, v in tags.items():
        ob[k] = v
    coll.objects.link(ob)
    if non_manifold:
        print(f"WARNING {name}: {non_manifold} non-manifold edges")
    return ob


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

    # the balcony soffits: the C round the building (from the right pilaster's outer side, round the back, to the left
    # pilaster's) and the centre bay between the pilasters. Along their fascias (2026-10-14) the bottom keeps a stone
    # return strip `ret` wide (the cladding's thickness), then a gap `gap` wide and `gd` deep, then the soffit
    rt = plan["returns"]
    joint = M.joint_slot()
    ret, gap, gd = rt["fascia_return"], rt["gap"], rt["gap_depth"]
    cut = round((co["x"][0] + co["x"][1]) / 2, 6)                    # rb_lib cuts the core's region there
    fascia_run = L.path(notched, (r_out, y_front), (l_out, y_front))  # every fascia but the centre bay's
    centre_run = [(l_in, y_front), (r_in, y_front)]
    wall_back = list(reversed(L.path(wall_pil, (r_out, y_wall), (l_out, y_wall))))[1:]

    def strips(run):
        """The fascia's edge, the return strip's inner line and the gap's inner line along a run (rb_lib.band's sides)."""
        side = lambda v: (lambda b: b[:len(b) // 2])(L.band(run, v, v))  # noqa: E731
        return side(0.0), side(-ret), side(-ret - gap)
    P, I, J = strips(fascia_run)
    Pc, Ic, Jc = strips(centre_run)
    end_pts = [I[0], J[0], I[-1], J[-1], Ic[0], Jc[0], Ic[-1], Jc[-1]]
    notched_r, sides_r = L._insert_tracked(notched, notched_sides, end_pts)

    def residential(name, z0, z1, tg):
        """The residential slab with the stone return and shadow gap along its fascias (stacked_slab)."""
        cutl = lambda lp, mats=None: with_cut(lp, mats, cut)  # noqa: E731
        ring_c, gap_c = P + list(reversed(I)), I + list(reversed(J))
        ring_m, gap_m = Pc + list(reversed(Ic)), Ic + list(reversed(Jc))
        soffit_c = J + [(l_out, y_wall)] + wall_back
        soffit_m = Jc + [(r_in, y_wall), (l_in, y_wall)]
        rest = J + [(l_out, y_wall), (l_in, y_wall)] + Jc + [(r_in, y_wall), (r_out, y_wall)]
        rest_mats = [joint] * (len(J) - 1) + ["TM_RB_hidden"] * 3 + [joint] + ["TM_RB_hidden"] * 3
        upper = ([cutl(notched_r, sides_r), (core_loop, "TM_RB_hidden")],
                 [([cutl(ring_c)[0]], "TM_RB_slab_top", INTERNAL), ([cutl(gap_c)[0]], "TM_RB_slab_top", joint),
                  ([cutl(soffit_c)[0]], "TM_RB_slab_top", INTERNAL), ([cutl(ring_m)[0]], "TM_RB_slab_top", INTERNAL),
                  ([cutl(gap_m)[0]], "TM_RB_slab_top", joint), ([cutl(soffit_m)[0]], "TM_RB_slab_top", INTERNAL),
                  ([cutl(wall_pil)[0], core_loop], "TM_RB_floor", INTERNAL)])
        lowers = []
        for ring, out, inn in ((ring_c, P, I), (ring_m, Pc, Ic)):     # sides: fascia, end, gap wall, end
            n = len(out)
            mats = ["TM_RB_slab_fascia"] * (n - 1) + ["TM_RB_hidden"] + [joint] * (n - 1) + ["TM_RB_hidden"]
            lp, mats = cutl(ring, mats)
            quads = [cutl([out[k], out[k + 1], inn[k + 1], inn[k]])[0] for k in range(n - 1)]   # a piece per fascia face
            lowers.append(([(lp, mats)], [([q], INTERNAL, "TM_RB_slab_fascia") for q in quads]))
        lowers.append(([cutl(rest, rest_mats), (core_loop, "TM_RB_hidden")],
                       [([cutl(soffit_c)[0]], INTERNAL, "TM_RB_soffit"), ([cutl(soffit_m)[0]], INTERNAL, "TM_RB_soffit"),
                        ([cutl(wall_pil)[0], core_loop], INTERNAL, "TM_RB_ceiling")]))
        return stacked_slab(name, coll, z0, z1, gd, upper, lowers, rt, tg)

    def roof(name, z0, z1, tg):
        """The roof slab: the stone return and shadow gap all round its closed edge (stacked_slab)."""
        e_r, e_g = offset_loop(edge, -ret), offset_loop(edge, -ret - gap)
        n = len(edge)
        cutl = lambda lp, mats=None: with_cut(lp, mats, cut)  # noqa: E731
        upper = ([cutl(edge, ["TM_RB_slab_fascia"] * n), (core_loop, "TM_RB_hidden")],
                 [([cutl(edge)[0], cutl(e_r)[0]], "TM_RB_roof_top", INTERNAL),
                  ([cutl(e_r)[0], cutl(e_g)[0]], "TM_RB_roof_top", joint),
                  ([cutl(e_g)[0], cutl(wall)[0]], "TM_RB_roof_top", INTERNAL),
                  ([cutl(wall)[0], core_loop], "TM_RB_roof_top", INTERNAL)])
        quads = [cutl([edge[k], edge[(k + 1) % n], e_r[(k + 1) % n], e_r[k]])[0] for k in range(n)]
        lowers = [([cutl(edge, ["TM_RB_slab_fascia"] * n), cutl(e_r, [joint] * n)],
                   [([q], INTERNAL, "TM_RB_slab_fascia") for q in quads]),
                  ([cutl(e_g, [joint] * n), (core_loop, "TM_RB_hidden")],
                   [([cutl(e_g)[0], cutl(wall)[0]], INTERNAL, "TM_RB_soffit"),
                    ([cutl(wall)[0], core_loop], INTERNAL, "TM_RB_ceiling")])]
        return stacked_slab(name, coll, z0, z1, gd, upper, lowers, rt, tg)

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
            ob = residential(name, s["z"][0], s["z"][1], tags("slab", s["name"]))
        elif kind == "roof":
            ob = roof(name, s["z"][0], s["z"][1], tags("slab", s["name"]))
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

    # entrance jambs under the canopy, their front corners wrapping into the opening as stone returns flush with the
    # podium's wood lining (2026-10-14)
    e = st["entrance"]
    lip = plan["podium"]["entrance_detail"]["wood_lining"]
    for side, (x_out, x_in) in (("left", (ex[0], ex[0] + e["side_wall"])), ("right", (ex[1], ex[1] - e["side_wall"]))):
        loop, mats = return_loop(x_out, x_in, ey[0], ey[1], lip, rt, "TM_RB_pilaster", joint)
        made.append(L.solid(f"rb_entrance_jamb_{side}", coll, [tuple(e["z"])], [(loop, mats)],
                            [([loop], "TM_RB_hidden", "TM_RB_hidden")], tags("entrance_jamb", side)))
    return {"collection": COLLECTION, "objects": len(made),
            "faces": sum(len(o.data.polygons) for o in made), "names": [o.name for o in made]}
