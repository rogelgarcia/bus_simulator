# layer_balconies.py -- AI 645: the balconies layer of the Terra & Mar rebuild, from plan["balconies"].
#
# Run through build.py (layers=balconies; needs the structure and the envelope). Builds RB_BALCONIES under
# its part root, per floor (1-5; floor 1 is the terrace on the podium roof, out to the podium edge):
#   rb_paving_f<n>      the walking surface (TM_RB_paving, 30 mm) from the window frames to the guard shoe, a piece
#                       per room between the piers (user fix 10)
#   rb_guard_f<n>       the guard: a dark base shoe and top rail (TM_RB_frame) and flat glass panels (TM_RB_glass,
#                       <= 1.6 m), on the guard line; one run round the building from pilaster to pilaster and the
#                       centre loggia's run between them; on floor 1 one closed run in front of the pilasters, which
#                       stand inside the terrace there (user fix 3, 2026-10-15). User fix 8 (2026-10-15): no curved
#                       glass: every panel is flat, and a slim charcoal post (TM_RB_frame) stands at every
#                       glass-to-glass junction, from the shoe up to the continuous rail (balcony_layout.guard_layout);
#                       fix 8b: the guard line's corners are sharp, so each run is even full panels meeting at one post.
#                       User fix 10 (2026-10-15): the room-dividing piers cut the guard into runs between them; a run
#                       stops against a pier's side with an end post (plan guard_run_ends / terrace_guard_run_ends)
#   rb_thresholds_f<n>  a stone threshold (TM_RB_threshold) before every sliding pane of plan["envelope"]: the step
#                       from the balcony (paving top) to the door sill
#   rb_soffit_plates_f<n>  (user fix 17, 2026-10-15: "use the wood material in the ceiling of all floors replacing the
#                       orange finish. favor larger wood pieces; horizontally larger (and layout as if it is luxury)")
#                       the soffit above the floor's balcony laid with long veneer plates (TM_RB_soffit_veneer, dressed
#                       as the entrance's veneer) along the facade, in three courses, 5 mm reveals onto the slab's dark
#                       core (plan balconies.soffit_veneer, balcony_layout.soffit_plates); each plate's face carries its
#                       own map and the attributes rb_veneer_w / rb_veneer_seed, so its grain restarts at every joint
#   rb_downlight_f<n>_<k>  the small downlights b8 shows in that soffit, one at the centre of each light-course plate
#                       (fix 17 addendum: "use one light source on each plate, centralized"): linked copies of the
#                       building's one fitting mesh (fitting(): "those small spotlights, should have a black casing
#                       around them, really small"), shared with the entrance head band (layer_podium.py)
# It also sets the soffit tone: TM_RB_soffit (left on the entrance volume's covered top) takes
# plan["balconies"]["soffit_rgb"], matched to b8 under the calibrated rig.
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
import random
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import balcony_layout  # noqa: E402
import rb_lib as L  # noqa: E402

importlib.reload(L)
importlib.reload(balcony_layout)

COLLECTION = "RB_BALCONIES"
LAYER = "balconies"


def tags(element, name, floor):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name,
            "rb_floor": floor}


def _unit(v):
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n)


def ribbon(path, half):
    """Footprint of a strip of half-width `half` along an open polyline, mitred at the joints."""
    pts = [tuple(p) for i, p in enumerate(path) if i == 0 or math.dist(p, path[i - 1]) > 1e-6]
    n = len(pts)
    segs = [_unit((pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])) for i in range(n - 1)]
    normals = [(d[1], -d[0]) for d in segs]
    left, right = [], []
    for i in range(n):
        if i == 0:
            m = normals[0]
        elif i == n - 1:
            m = normals[-1]
        else:
            a, b = normals[i - 1], normals[i]
            k = 1.0 + a[0] * b[0] + a[1] * b[1]
            m = ((a[0] + b[0]) / k, (a[1] + b[1]) / k)
        right.append((pts[i][0] + m[0] * half, pts[i][1] + m[1] * half))
        left.append((pts[i][0] - m[0] * half, pts[i][1] - m[1] * half))
    return right + list(reversed(left))


def ring(path, half):
    """The outer and inner loops of a strip of half-width `half` along a closed polyline (path[0] == path[-1]), mitred
    at every vertex: the floor-1 guard's shoe and rail (user fix 3)."""
    pts = [tuple(p) for i, p in enumerate(path[:-1]) if i == 0 or math.dist(p, path[i - 1]) > 1e-6]
    # drop the points on straight runs (the run's start mid-front): pieces() cuts the ring along a line through its
    # middle, and a vertex a hair off that line would be lost
    pts = [p for i, p in enumerate(pts) if abs((p[0] - pts[i - 1][0]) * (pts[(i + 1) % len(pts)][1] - p[1])
                                               - (p[1] - pts[i - 1][1]) * (pts[(i + 1) % len(pts)][0] - p[0])) > 1e-9]
    n = len(pts)
    normals = [(lambda d: (d[1], -d[0]))(_unit((pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1])))
               for i in range(n)]
    sides = ([], [])
    for i in range(n):
        a, b = normals[i - 1], normals[i]
        k = 1.0 + a[0] * b[0] + a[1] * b[1]
        m = ((a[0] + b[0]) / k, (a[1] + b[1]) / k)
        sides[0].append((pts[i][0] + m[0] * half, pts[i][1] + m[1] * half))
        sides[1].append((pts[i][0] - m[0] * half, pts[i][1] - m[1] * half))
    return sorted(sides, key=lambda lp: -abs(L._area(lp)))


def strip(path, half, span, mat):
    """A pieces() item: the strip of half-width `half` along an open path, or round a closed one."""
    if math.dist(path[0], path[-1]) > 1e-6:
        return L.piece(ribbon(path, half), [span], mat)
    outer, inner = ring(path, half)
    return ([span], [(outer, mat), (inner, mat)], [([outer, inner], mat, mat)])


FITTING = "rb_downlight_fitting"
LENS, TRIM = "TM_RB_downlight", "TM_RB_downlight_trim"


def slot(name):
    """A material slot by name: rb_lib's placeholder palette, else a bare material the materials pass dresses."""
    if name in L.MATERIALS:
        return L.material(name)
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def fitting_materials(dl):
    """The fitting's slots, made here (no materials-pass family dresses them): the lens a warm emitter (the head band's
    old light, user fix 4c), the trim ring matte black."""
    mats = []
    for name, rgb, rough, emit in ((LENS, (0.9, 0.88, 0.85), 0.3, True), (TRIM, dl["trim_rgb"], dl["trim_roughness"], False)):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        if emit:
            bsdf.inputs["Emission Color"].default_value = (*dl["rgb"], 1.0)
            bsdf.inputs["Emission Strength"].default_value = dl["strength"]
        nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
        mat.diffuse_color = (*(dl["rgb"] if emit else rgb), 1.0)
        mats.append(mat)
    return mats


def fitting(dl):
    """User fix 17 (2026-10-15, addendum 2: "replace the circle gray dots for light sources on each floor; those small
    spotlights, should have a black casing around them, really small; just for the light to not simply appear on the
    wood"): the building's one downlight fitting mesh, rebuilt in place (every downlight object links it). A turned
    solid, its origin at the top centre, set on the dark core in the veneer plate's hole (punch(): `seat` = the plate's
    depth, a `gap` wide shadow gap round it): a matte-black trim ring lens_radius + trim in radius standing `proud` below
    the wood, and the warm emitting lens `recess` up inside the ring. Faces: the top (TM_RB_hidden, contact with the
    core), the ring's outer wall, bottom and inner wall (trim), the lens (emitter)."""
    rl, ro, h = dl["lens_radius"], dl["lens_radius"] + dl["trim"], dl["seat"] + dl["proud"]
    lz = -h + dl["recess"]
    n = dl["segments"]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()

    def ring(r, z):
        return [bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    top, ob, ib, il = ring(ro, 0.0), ring(ro, -h), ring(rl, -h), ring(rl, lz)
    faces = [(top, 2)]
    for a, b in ((top, ob), (ob, ib), (ib, il)):
        for k in range(n):
            faces.append(([a[k], b[k], b[(k + 1) % n], a[(k + 1) % n]], 1))
    faces.append((list(reversed(il)), 0))
    for vs, mi in faces:
        f = bm.faces.new(vs)
        f.material_index = mi
        for lp in f.loops:
            lp[uv].uv = (lp.vert.co.x / (2 * ro) + 0.5, lp.vert.co.y / (2 * ro) + 0.5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.get(FITTING) or bpy.data.meshes.new(FITTING)
    me.materials.clear()                                # before the geometry: clearing resets the faces' slots
    for m in fitting_materials(dl) + [L.material("TM_RB_hidden")]:
        me.materials.append(m)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(30.0))
    return me


def place_fittings(me, coll, prefix, points, z, tg):
    """Linked copies of the fitting mesh at (x, y, z) (z = the dark core over the holed plate): one per downlight."""
    made = []
    for k, (x, y) in enumerate(points):
        ob = bpy.data.objects.new(f"{prefix}_{k:02d}", me)
        ob.location = (x, y, z)
        for key, v in tg.items():
            ob[key] = v
        coll.objects.link(ob)
        made.append(ob)
    return made


def _inside(p, loop):
    c = False
    for a, b in zip(loop, loop[1:] + loop[:1]):
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < a[0] + (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]):
            c = not c
    return c


def punch(bm, centre, z_bottom, z_top, dl, wall_index):
    """User fix 17: a round hole through a horizontal plate of a bmesh (its bottom face at z_bottom, its top at z_top,
    both containing `centre`) for a downlight fitting: radius lens_radius + trim + gap (the shadow gap round the trim),
    its segments aligned with the fitting's. Each face is replaced by the triangulated face around the hole (material
    and face layers kept, normal kept), and the hole's wall (wall_index) joins the two circles. Returns True when both
    faces were found."""
    r, n = dl["lens_radius"] + dl["trim"] + dl["gap"], dl["segments"]
    circles = []
    for z, up in ((z_bottom, False), (z_top, True)):
        face = None
        for f in bm.faces:
            if abs(f.normal.z) > 0.99 and (f.normal.z > 0) == up and all(abs(v.co.z - z) < 1e-5 for v in f.verts) \
                    and _inside(centre, [(v.co.x, v.co.y) for v in f.verts]):
                face = f
                break
        if face is None:
            return False
        keep = {"mat": face.material_index, "normal": face.normal.copy(), "smooth": face.smooth,
                "float": {lay: face[lay] for lay in bm.faces.layers.float.values()},
                "int": {lay: face[lay] for lay in bm.faces.layers.int.values()}}
        edges = list(face.edges)
        bm.faces.remove(face)
        ring = [bm.verts.new((centre[0] + r * math.cos(2 * math.pi * k / n), centre[1] + r * math.sin(2 * math.pi * k / n), z))
                for k in range(n)]
        edges += [bm.edges.new((ring[k], ring[(k + 1) % n])) for k in range(n)]
        made = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)["geom"]
        for f in [g for g in made if isinstance(g, bmesh.types.BMFace)]:
            f.normal_update()
            if f.normal.dot(keep["normal"]) < 0:
                f.normal_flip()
            f.material_index, f.smooth = keep["mat"], keep["smooth"]
            for lay, v in keep["float"].items():
                f[lay] = v
            for lay, v in keep["int"].items():
                f[lay] = v
        circles.append(ring)
    bot, top = circles
    for k in range(n):                                                  # the hole's wall, facing the hole's axis
        f = bm.faces.new((bot[k], top[k], top[(k + 1) % n], bot[(k + 1) % n]))
        f.material_index = wall_index
        f.normal_update()
        mid = (bot[k].co + bot[(k + 1) % n].co) / 2
        if f.normal.x * (centre[0] - mid.x) + f.normal.y * (centre[1] - mid.y) < 0:
            f.normal_flip()
    return True


def soffit_plates(name, coll, sv, z1, floor, lights, dl, tg):
    """User fix 17: one floor's soffit veneer plates (plan balconies.soffit_veneer, the same loops under every soffit)
    as prisms sv["depth"] thick hanging from the slab's underside at z1 (top on its dark core: TM_RB_hidden; faces:
    the outer one the veneer slot, the sides the reveal slot), each light-course plate holed for its downlight (punch:
    the fitting sits in the hole on the core, a shadow gap round its trim). Each plate's outer face gets its own map,
    along the grain from the leg's corner plus a seeded offset and across from the plate's course line, and the face
    attributes rb_veneer_w / rb_veneer_seed that dress_veneer() reads; the floor shifts the seed, so no two floors
    repeat. Returns the object and the holes punched."""
    z0 = z1 - sv["depth"]
    bm = bmesh.new()
    att_w = bm.faces.layers.float.new("rb_veneer_w")
    att_s = bm.faces.layers.float.new("rb_veneer_seed")
    att_i = bm.faces.layers.int.new("rb_plate")
    shift = random.Random(f"{sv['seed']}:floor:{floor}").random()
    for i, pl in enumerate(sv["plates"]):
        loop = pl["loop"]
        bot = [bm.verts.new((x, y, z0)) for x, y in loop]
        top = [bm.verts.new((x, y, z1)) for x, y in loop]
        faces = [(list(reversed(bot)), 0), (top, 2)]
        m = len(loop)
        faces += [((bot[k], bot[(k + 1) % m], top[(k + 1) % m], top[k]), 1) for k in range(m)]
        for vs, mi in faces:
            f = bm.faces.new(vs)
            f.material_index = mi
            f[att_i] = i
            if mi == 0:
                f[att_w] = pl["w"]
                f[att_s] = (pl["seed"] + shift) % 1.0
    bm.normal_update()
    holes = sum(punch(bm, p, z0, z1, dl, 1) for p in lights)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        pl = sv["plates"][f[att_i]]
        (ux, uy), (px, py), (nx, ny) = pl["u"], pl["p0"], pl["n"]
        for lp in f.loops:
            x, y, z = lp.vert.co.x - px, lp.vert.co.y - py, lp.vert.co.z
            if f.material_index == 0:                                   # (along the grain, across from the course line)
                lp[uv].uv = (x * ux + y * uy + pl["dv"], x * nx + y * ny - pl["t0"])
            else:
                lp[uv].uv = (x * ux + y * uy, z if abs(f.normal.z) < 0.5 else x * nx + y * ny)
    bm.faces.layers.int.remove(att_i)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for s in (sv["slot"], sv["core"], "TM_RB_hidden"):
        me.materials.append(slot(s))
    me.shade_flat()
    ob = bpy.data.objects.new(name, me)
    for k, v in tg.items():
        ob[k] = v
    coll.objects.link(ob)
    return ob, holes


def build(plan):
    coll = L.layer_collection(COLLECTION)
    b, env = plan["balconies"], plan["envelope"]
    half_frame = env["frame_depth"] / 2
    shoe_h, shoe_w = b["shoe"]["height"], b["shoe"]["width"]
    rail_h, rail_w = b["rail"]["height"], b["rail"]["width"]
    soffit = L.material("TM_RB_soffit")
    bsdf = soffit.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*b["soffit_rgb"], 1.0)
    soffit.diffuse_color = (*b["soffit_rgb"], 1.0)
    made, glass_panels, posts, lamps, holes = [], 0, 0, [], 0
    me = fitting(b["downlight"])                                    # user fix 17: the building's one fitting mesh
    for floor, (top, above) in enumerate(env["storeys"], start=1):
        walk = top + b["paving"]
        paving = [L.piece(loop, [(top, walk)], "TM_RB_paving", mat_bottom="TM_RB_hidden") for loop in b["paving_pieces"]]
        made.append(L.pieces(f"rb_paving_f{floor}", coll, paving, tags("paving", f"paving_f{floor}", floor)))

        rail_top = walk + b["guard_height"]
        guard = []
        runs = b["terrace_guard_runs"] if floor == 1 else b["guard_runs"]
        ends = b.get("terrace_guard_run_ends" if floor == 1 else "guard_run_ends", [("open", "open")] * len(runs))
        for run, end in zip(runs, ends):
            guard.append(strip(run, shoe_w / 2, (top, top + shoe_h), "TM_RB_frame"))
            guard.append(strip(run, rail_w / 2, (rail_top - rail_h, rail_top), "TM_RB_frame"))
            lay = balcony_layout.guard_layout(run, b, tuple(end))        # user fix 8: flat panels, posts between
            for pan in lay["panels"]:
                guard.append(L.piece(ribbon(pan, b["glass"] / 2), [(top + shoe_h, rail_top - rail_h)], "TM_RB_glass"))
            for post in lay["posts"]:
                guard.append(L.piece(balcony_layout.post_loop(post, b), [(top + shoe_h, rail_top - rail_h)], "TM_RB_frame"))
            glass_panels += len(lay["panels"])
            posts += len(lay["posts"])
        made.append(L.pieces(f"rb_guard_f{floor}", coll, guard, tags("guard", f"guard_f{floor}", floor)))

        sills = []
        for bay in env["bays"]:
            var = next(v for v in bay["variants"] if floor in v["floors"])
            a, U, N = bay["a"], bay["along"], bay["outward"]
            for i in var["doors"]:
                s0, s1 = var["panes"][i]
                v0, v1 = half_frame, half_frame + b["threshold"]["depth"]
                loop = [(a[0] + U[0] * s + N[0] * v, a[1] + U[1] * s + N[1] * v) for s, v in ((s0, v0), (s1, v0), (s1, v1), (s0, v1))]
                sills.append(L.piece(loop, [(walk, walk + b["threshold"]["height"])], "TM_RB_threshold", mat_bottom="TM_RB_hidden"))
        made.append(L.pieces(f"rb_thresholds_f{floor}", coll, sills, tags("threshold", f"thresholds_f{floor}", floor)))

        sv = b["soffit_veneer"]                  # user fix 17: the soffit's veneer plates and one light per plate
        ob, n = soffit_plates(f"rb_soffit_plates_f{floor}", coll, sv, above, floor, b["downlight_points"],
                              b["downlight"], tags("soffit_veneer", f"soffit_plates_f{floor}", floor))
        made.append(ob)
        holes += n
        lamps += place_fittings(me, coll, f"rb_downlight_f{floor}", b["downlight_points"], above,
                                tags("downlight", f"downlights_f{floor}", floor))
    return {"collection": COLLECTION, "objects": len(made) + len(lamps), "faces": sum(len(o.data.polygons) for o in made),
            "glass_panels": glass_panels, "guard_posts": posts, "soffit_plates": len(b["soffit_veneer"]["plates"]),
            "downlights": len(lamps), "plate_holes": holes, "fitting_tris": sum(len(q.vertices) - 2 for q in me.polygons),
            "names": [o.name for o in made]}
