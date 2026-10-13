# exterior_616_chamfer_balconies.py -- AI 616: the deep wrap-around chamfer balconies and the rounded chamfer columns.
#
#   headed Blender (MCP):  exec(compile(open(p).read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})
#   headless:              blender -b --factory-startup -P exterior_616_chamfer_balconies.py
#
# Runs on the edit copy only, rebuilds TERRAMAR/TM_EDIT_EXTERIOR/616_CHAMFER_BALCONIES from scratch on every run, and
# sets the game guards it replaces aside in TM_REPLACED/REPLACED_616_CHAMFER_BALCONIES. Builds on AI 615's slab rings.
#
# What b8.png shows (right side, read at 3.5x on 2026-10-12):
#   - the front side bay, the A-B corner and B's front-adjacent bay form one shallow, continuously curved balcony --
#     already the game's linked corner, kept as extracted;
#   - beyond a rounded column, B's outer bay is a DEEP projecting balcony: its wood soffit reads 4-5x deeper than the
#     shallow bay's (about 2.8 m from slab edge to glazing at the b8 stand), its front runs straight along B and turns
#     the B-C corner on a radius of about 1 m; the supplementary aerial shows these deep balconies wrapping around onto
#     the sides;
#   - the roof slab overhangs the top floor's deep balcony the same way;
#   - the column between the two bays is rounded.
# The game has every residential bay as a 1.5 m loggia with its guard on the facade line; on the sides (C, G) the
# recessed conversion left a solid brick prow at the facade line with the side window buried behind it.
#
# User correction (2026-10-12, annotated render): "the balcony should be same depth around the building" -- one
# slab-edge line and one glazing line all around. So each side's deep balcony is ONE continuous run from the front
# pier to the rear pier (right: A from the right front pier -> A-B -> B -> B-C -> C -> C-D -> D -> D-E -> E to the
# rear-right pier; left mirrored through H, G, F), passing in front of the rounded chamfer columns; it replaces the
# game's shallow linked-corner balconies too. The front A and rear E centre loggias between the full-height piers
# stay flush, as b8 shows them.
#
# What this builds, per side (see the correction above for the path):
#   - a slab on floors 2-5 projecting 1.5 m beyond the facade line (its outer edge on the podium silhouette, as the
#     spec and the original config have it), 0.509 m deep, its top AT the walking surface (top faces in the platform
#     material), rounded at every corner it turns (radius 1.2 m at the slab edge), ending square against the front
#     and rear piers;
#   - the same slab at the roof line (top 4 mm above the roof surface) overhanging the top floor's balcony;
#   - on floors 2-5 a glass guard (0.012 m, 0.96 m of glass) with a slim charcoal top rail along the slab edge
#     (inset 0.05 m), glass returns at both ends back to the pier, posts at no more than 1.6 m on the straight
#     parts and none on the curves;
#   - a rounded casing on each chamfer pier (B, D, F, H): 0.90 m wide, its front 0.18 m proud of the facade line,
#     front corners on a 0.40 m radius, from the podium roof to the roof line; the 615 bands die into it, and the
#     balcony passes in front of it.
# The glazing stays at the back of the loggias everywhere: loggia (1.5 m) plus projection (1.5 m), the same depth all
# around, which is b8's deep outer bay.
# Floor 1 is the podium roof (its guards are AI 621's). The buried side windows on C/G are left as extracted
# (reported; opening them needs the side cavity rebuilt).
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import edit_lib as L  # noqa: E402

PIECE = "616_CHAMFER_BALCONIES"

# Facade-line run starts (Blender x/y) in the config's order A, H, G, F, E, D, C, B; run k goes from point k to k+1.
P = {"A": (6.4, -9.5), "H": (-6.4, -9.5), "G": (-12.5, -3.4), "F": (-12.5, 3.4),
     "E": (-6.4, 9.5), "D": (6.4, 9.5), "C": (12.5, 3.4), "B": (12.5, -3.4)}
NEXT = {"A": "H", "H": "G", "G": "F", "F": "E", "E": "D", "D": "C", "C": "B", "B": "A"}
PIER_CENTRE_T = 4.313        # chamfer piers at t 3.988 .. 4.638 on B, D, F, H
FRONT_PIERS_T = (3.0, 9.8)   # outer sides of the full-height piers on A and E (t 3.0 .. 3.65 and 9.15 .. 9.8; 0.06 m proud)
INTO_PIER = 0.01             # slab ends run 1 cm into the pier (no coplanar end caps)
CASING_HALF, CASING_FRONT, CASING_BACK, CASING_R = 0.45, 0.18, -0.40, 0.40

S_OUT = 1.50                 # slab edge beyond the facade line
S_IN = 0.03                  # slab back edge, 1 cm into AI 615's ring front (0.04)
R_OUT = 1.20                 # corner radius at the slab edge
ARC = 14                     # segments per 45-degree corner
SLAB_DEPTH = 0.509
GUARD_INSET, GLASS_T, RAIL_W, RAIL_H = 0.05, 0.012, 0.05, 0.04
GLASS_Z0, GLASS_Z1 = 0.02, 0.98          # above the walking surface
POST_MAX, POST_W = 1.6, 0.04
RETURN_TO = 0.08                         # end returns stop just in front of the front/rear piers (0.06 m proud)

FLOOR_SURFACES = [13.622, 17.192, 20.762, 24.332]      # walking surfaces of floors 2-5 (game platform tops)
ROOF_TOP, ROOF_BOTTOM = 27.866, 27.353                  # 4 mm above the roof surface / clear of AI 615's ring faces


def run_frame(r):
    a, b = Vector(P[r]), Vector(P[NEXT[r]])
    d = (b - a)
    length = d.length
    d.normalize()
    n = Vector((-d.y, d.x))
    if n.dot((a + b) / 2) < 0:
        n = -n
    return a, d, n, length


def point_on(r, t):
    a, d, n, _ = run_frame(r)
    return a + d * t


# Each side path: (start point on the first run, [interior corners], end point on the last run), with the run of each
# leg so the outward normals are known. One continuous balcony per side, front pier to rear pier.
def side_paths():
    # Run A starts at the A-B corner and runs toward H; run E starts at the E-F corner and runs toward D.
    t_right_front, t_left_front = FRONT_PIERS_T[0] + INTO_PIER, FRONT_PIERS_T[1] - INTO_PIER
    right = {"legs": ["A", "B", "C", "D", "E"], "start": point_on("A", t_right_front),
             "corners": [Vector(P["A"]), Vector(P["B"]), Vector(P["C"]), Vector(P["D"])],
             "end": point_on("E", FRONT_PIERS_T[1] - INTO_PIER)}
    left = {"legs": ["A", "H", "G", "F", "E"], "start": point_on("A", t_left_front),
            "corners": [Vector(P["H"]), Vector(P["G"]), Vector(P["F"]), Vector(P["E"])],
            "end": point_on("E", FRONT_PIERS_T[0] + INTO_PIER)}
    return {"RIGHT": right, "LEFT": left}


def leg_normals(path):
    return [run_frame(r)[2] for r in path["legs"]]


def mitre(na, nb):
    return (na + nb) / (1.0 + na.dot(nb))


def offset_groups(path, s, rounded=True):
    """Point groups along a side path at offset s: [start], arcs (or mitre points) at the corners, [end]."""
    ns = leg_normals(path)
    groups = [[path["start"] + ns[0] * s]]
    for k, v in enumerate(path["corners"]):
        na, nb = ns[k], ns[k + 1]
        m = mitre(na, nb)
        r = R_OUT - (S_OUT - s)
        if rounded and r > 1e-4:
            centre = v + m * (S_OUT - R_OUT)
            a0, a1 = math.atan2(na.y, na.x), math.atan2(nb.y, nb.x)
            da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
            groups.append([centre + r * Vector((math.cos(a0 + da * i / ARC), math.sin(a0 + da * i / ARC))) for i in range(ARC + 1)])
        else:
            groups.append([v + m * s])
    groups.append([path["end"] + ns[-1] * s])
    return groups


def solid_between(name, outer, inner, z0, z1, mats, top_mat=0, uv_mode="along"):
    """Closed solid between two open point-group paths (outer, inner) from z0 to z1; corner groups may differ in size
    (fans). Top faces get material index top_mat, everything else 0. UVs: sides along the path (metres) x z; top and
    bottom plan x/y."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    fo = [q for g in outer for q in g]
    fi = [q for g in inner for q in g]
    vo = {z: [bm.verts.new((q.x, q.y, z)) for q in fo] for z in (z0, z1)}
    vi = {z: [bm.verts.new((q.x, q.y, z)) for q in fi] for z in (z0, z1)}
    io, ii = [], []
    at = 0
    for g in outer:
        io.append(list(range(at, at + len(g))))
        at += len(g)
    at = 0
    for g in inner:
        ii.append(list(range(at, at + len(g))))
        at += len(g)
    faces = []

    def add(verts, kind):
        faces.append((bm.faces.new(verts), kind))
    for z, kind in ((z1, "top"), (z0, "bottom")):
        for k in range(len(outer)):
            go, gi = io[k], ii[k]
            if len(go) == len(gi) and len(go) > 1:
                for j in range(len(go) - 1):
                    add([vo[z][go[j]], vo[z][go[j + 1]], vi[z][gi[j + 1]], vi[z][gi[j]]], kind)
            elif len(go) > 1:
                for j in range(len(go) - 1):
                    add([vo[z][go[j]], vo[z][go[j + 1]], vi[z][gi[0]]], kind)
            if k + 1 < len(outer):
                add([vo[z][go[-1]], vo[z][io[k + 1][0]], vi[z][ii[k + 1][0]], vi[z][gi[-1]]], kind)
    for verts, kind in ((vo, "outer"), (vi, "inner")):
        m = len(verts[z0])
        for t in range(m - 1):
            add([verts[z0][t], verts[z0][t + 1], verts[z1][t + 1], verts[z1][t]], kind)
    add([vo[z0][0], vi[z0][0], vi[z1][0], vo[z1][0]], "cap")
    add([vo[z0][-1], vo[z1][-1], vi[z1][-1], vi[z0][-1]], "cap")
    bmesh.ops.recalc_face_normals(bm, faces=[f for f, _ in faces])

    def cum(points):
        s, out = 0.0, [0.0]
        for a, b in zip(points, points[1:]):
            s += (b - a).length
            out.append(s)
        return out
    co, ci = cum(fo), cum(fi)
    base_o, base_i = vo[z0][0].index, vi[z0][0].index
    n_o, n_i = len(fo), len(fi)
    for f, kind in faces:
        f.material_index = top_mat if kind == "top" else 0
        for lp in f.loops:
            v = lp.vert
            if kind in ("top", "bottom"):
                lp[uv].uv = (v.co.x, v.co.y)
            elif kind == "outer":
                lp[uv].uv = (co[(v.index - base_o) % n_o], v.co.z)
            elif kind == "inner":
                lp[uv].uv = (ci[(v.index - base_i) % n_i], v.co.z)
            else:
                lp[uv].uv = (v.co.x + v.co.y, v.co.z)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(30.0))
    except AttributeError:
        for p in me.polygons:
            p.use_smooth = False
    for m in mats:
        me.materials.append(m)
    obj = bpy.data.objects.new(name, me)
    return obj


def box(name, centre, along, up, width, depth, z0, z1, mat):
    """An upright box: width along `along`, depth along `up` (both horizontal unit vectors), from z0 to z1."""
    bm = bmesh.new()
    corners = []
    for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        p = centre + along * (sa * width / 2) + up * (sb * depth / 2)
        corners.append(p)
    vb = [bm.verts.new((p.x, p.y, z0)) for p in corners]
    vt = [bm.verts.new((p.x, p.y, z1)) for p in corners]
    bm.faces.new(vb[::-1])
    bm.faces.new(vt)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([vb[i], vb[j], vt[j], vt[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    L.box_uvs(me)
    me.materials.append(mat)
    return bpy.data.objects.new(name, me)


def merge(objs, name):
    """Join helper objects (all identity transforms) into one mesh object."""
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data
        offset = len(mats)
        for m in me.materials:
            mats.append(m)
        tmp = bmesh.new()
        tmp.from_mesh(me)
        for f in tmp.faces:
            f.material_index += offset
        me2 = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(me2)
        tmp.free()
        bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    # collapse duplicate materials into unique slots
    unique = []
    remap = []
    for m in mats:
        if m not in unique:
            unique.append(m)
        remap.append(unique.index(m))
    for p in me.polygons:
        p.material_index = remap[p.material_index]
    for m in unique:
        me.materials.append(m)
    return bpy.data.objects.new(name, me)


def guard(name, path, z_surface, mat_glass, mat_rail):
    parts = []
    s_g = S_OUT - GUARD_INSET
    glass = solid_between(name + "_glass", offset_groups(path, s_g + GLASS_T / 2), offset_groups(path, s_g - GLASS_T / 2),
                          z_surface + GLASS_Z0, z_surface + GLASS_Z1, [mat_glass])
    parts.append(glass)
    rail = solid_between(name + "_rail", offset_groups(path, s_g + RAIL_W / 2), offset_groups(path, s_g - RAIL_W / 2),
                         z_surface + GLASS_Z1, z_surface + GLASS_Z1 + RAIL_H, [mat_rail])
    parts.append(rail)
    ns = leg_normals(path)
    # end returns: from the guard line back toward the column, inset along the path into the balcony
    for end, n, inward in ((path["start"], ns[0], None), (path["end"], ns[-1], None)):
        legs_dir = (path["corners"][0] - path["start"]).normalized() if end is path["start"] else (path["corners"][-1] - path["end"]).normalized()
        c0 = end + legs_dir * GUARD_INSET
        mid = c0 + n * ((s_g + RETURN_TO) / 2)
        length = s_g - RETURN_TO
        parts.append(box(name + "_ret_glass", mid, n, legs_dir, length, GLASS_T, z_surface + GLASS_Z0, z_surface + GLASS_Z1, mat_glass))
        parts.append(box(name + "_ret_rail", mid, n, legs_dir, length, RAIL_W, z_surface + GLASS_Z1, z_surface + GLASS_Z1 + RAIL_H, mat_rail))
        for s in (RETURN_TO + POST_W / 2, s_g):
            parts.append(box(name + "_post", c0 + n * s, n, legs_dir, POST_W, POST_W, z_surface, z_surface + GLASS_Z1, mat_rail))
    # posts on the straight legs only, at most POST_MAX apart
    pts_legs = [path["start"]] + list(path["corners"]) + [path["end"]]
    for k in range(len(pts_legs) - 1):
        a, b = pts_legs[k], pts_legs[k + 1]
        n = ns[k]
        d = (b - a).normalized()
        # the straight part of the leg at the guard offset: trimmed by the corner tangent lengths
        trim = (R_OUT - GUARD_INSET) * math.tan(math.radians(22.5))
        t0 = GUARD_INSET if k == 0 else trim
        t1 = (b - a).length - (GUARD_INSET if k == len(pts_legs) - 2 else trim)
        a2 = a + n * s_g + d * t0
        length = t1 - t0
        count = max(1, math.ceil(length / POST_MAX))
        # interior posts only: the leg ends are either a curve (no posts) or an end return (its own post)
        for i in range(1, count):
            parts.append(box(name + "_post", a2 + d * (length * i / count), d, n, POST_W, POST_W, z_surface, z_surface + GLASS_Z1, mat_rail))
    obj = merge(parts, name)
    return obj


def casing(name, run, mat):
    a, d, n, _ = run_frame(run)
    c = a + d * PIER_CENTRE_T
    # (lateral, offset) around a rounded-rectangle profile: square back corners, front corners on CASING_R.
    cy = CASING_FRONT - CASING_R
    prof = [(-CASING_HALF, CASING_BACK), (CASING_HALF, CASING_BACK)]
    for i in range(ARC + 1):     # front-right corner, from facing +lateral to facing +offset
        ang = (math.pi / 2) * i / ARC
        prof.append((CASING_HALF - CASING_R + CASING_R * math.cos(ang), cy + CASING_R * math.sin(ang)))
    for i in range(ARC + 1):     # front-left corner, from facing +offset to facing -lateral
        ang = math.pi / 2 + (math.pi / 2) * i / ARC
        prof.append((-CASING_HALF + CASING_R + CASING_R * math.cos(ang), cy + CASING_R * math.sin(ang)))
    bm = bmesh.new()
    pts = [c + d * u + n * v for u, v in prof]
    z0, z1 = 10.0, 27.86
    vb = [bm.verts.new((p.x, p.y, z0)) for p in pts]
    vt = [bm.verts.new((p.x, p.y, z1)) for p in pts]
    bm.faces.new(vb)
    bm.faces.new(vt[::-1])
    m = len(pts)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new([vb[i], vb[j], vt[j], vt[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    uvl = bm.loops.layers.uv.new("UVMap")
    perim = [0.0]
    for i in range(1, m + 1):
        perim.append(perim[-1] + (pts[i % m] - pts[i - 1]).length)
    for f in bm.faces:
        horizontal = abs(f.normal.z) > 0.7
        idx = [lp.vert.index % m for lp in f.loops]
        wrap = max(idx) - min(idx) > 1
        for lp, i in zip(f.loops, idx):
            if horizontal:
                lp[uvl].uv = (lp.vert.co.x, lp.vert.co.y)
            else:
                u = perim[m] if (wrap and i == 0) else perim[i]
                lp[uvl].uv = (u, lp.vert.co.z)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(30.0))
    except AttributeError:
        pass
    me.materials.append(mat)
    return bpy.data.objects.new(name, me)


def replaced_guards():
    """Every game railing and guard glass on floors 2-5 except the front A / rear E centre loggias between the piers
    (the continuous deep balconies' guards replace them, the shallow linked corners included)."""
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.get("tm_role") not in ("balcony_railing", "balcony_infill_glass"):
            continue
        if "front_balcony_center" in str(o.get("tm_tags", "")):
            continue
        vs = [o.matrix_basis @ v.co for v in o.data.vertices]
        if 13.5 < min(v.z for v in vs) < 25.0:
            out.append(o)
    return out


def tag(o, role):
    o["tm_piece"] = PIECE
    o["tm_role"] = role
    o["tm_element"] = f"TM_EDIT_EXTERIOR/{PIECE}"
    return o


def main():
    L.open_edit_copy()
    assert "615_SLAB_EDGE_FASCIA" in bpy.data.collections, "AI 615 first (the slab rings this piece builds on)"
    coll = L.piece_collection("exterior", PIECE)
    stone, plain = L.material("TM_limestone"), L.material("TM_limestone_plain")
    glass_m, rail_m = L.material("TM_glass_balcony_guard"), L.material("TM_rail_charcoal")
    keep = [o.name for o in replaced_guards()]
    L.restore_set_aside(PIECE, keep)
    built = []
    for side, path in side_paths().items():
        outer, inner = offset_groups(path, S_OUT), offset_groups(path, S_IN)
        for surface in FLOOR_SURFACES:
            built.append(tag(solid_between(f"TM616_slab_{side}_{surface:.3f}", outer, inner, surface - SLAB_DEPTH, surface,
                                           [stone, plain], top_mat=1), "balcony_slab"))
            built.append(tag(guard(f"TM616_guard_{side}_{surface:.3f}", path, surface, glass_m, rail_m), "balcony_guard"))
        built.append(tag(solid_between(f"TM616_roof_overhang_{side}", outer, inner, ROOF_BOTTOM, ROOF_TOP, [stone, plain], top_mat=1),
                         "roof_overhang"))
    for run in ("B", "D", "F", "H"):
        built.append(tag(casing(f"TM616_column_{run}", run, stone), "column_casing"))
    for o in built:
        coll.objects.link(o)
    L.set_aside([bpy.data.objects[n] for n in keep], PIECE)
    L.save()
    print("PIECE 616 DONE", len(built), "objects;", "set aside:", sorted(keep))


if __name__ == "__main__":
    main()
