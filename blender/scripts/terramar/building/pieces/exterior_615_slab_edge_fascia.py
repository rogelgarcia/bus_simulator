# exterior_615_slab_edge_fascia.py -- AI 615: the residential slab edges and the podium top band, after b8.png.
#
#   headed Blender (MCP):  exec(compile(open(p).read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})
#   headless:              blender -b --factory-startup -P exterior_615_slab_edge_fascia.py
#
# Runs on the edit copy only (edit_lib.open_edit_copy), rebuilds TERRAMAR/TM_EDIT_EXTERIOR/615_SLAB_EDGE_FASCIA from
# scratch on every run, and sets the six game belts it replaces aside in TM_REPLACED/615_SLAB_EDGE_FASCIA.
#
# What b8.png shows, measured on the front centre bay (2026-10-12): every residential floor ends in a pale slab edge
# about 16 px tall against a 110 px storey (about 0.5 m of the game's 3.57 m storey); the glass guard stands on it;
# the loggia ceiling (wood in b8, AI 617) starts at the band's bottom edge; the two front piers run full height,
# slightly proud, and the bands stop against them; the front-to-chamfer corners are softly rounded.
#
# What the game export has: belts 0.22 m tall (mesh__558 .. mesh__562, tops at the floor levels 13.582 .. 27.862),
# 0.12 m proud of the facade line, faceted; walking-surface platforms 0.04 m above the floor levels; the front piers
# (x +/-2.75 .. 3.4) 0.06 m proud of the facade line; loggias 1.5 m deep; rounded guards and platforms only at the
# three linked corners (A-B, H-A, D-E: 0.42 m runouts, radius about 1.0 m at the facade line); sharp platform corners
# at B-C, C-D, F-G, G-H; a short wall return at E-F; window heads at most 0.24 m under the new band bottoms.
#
# What this builds:
#   - five residential slab rings (floors 2-5 and the roof line), each 0.50 m tall with its top 5 mm under the
#     walking surface (under the roof surface for the roof line). Front face 0.04 m outside the facade line: in front
#     of the guards, 0.02 m behind the front piers' faces, so the piers stay proud and the bands stop against them.
#     The rings reach 1.51 m inside the facade line, so they also form the loggia ceilings at the band's underside,
#     as b8 shows. Rounded at the three linked corners on the guards' own centre (radius 1.0 at the facade line),
#     mitred at the other five corners, where the game's sharp platforms and guards would otherwise stick out (AI 616's
#     curved chamfer balconies take those corners).
#   - the podium top band on the podium outline, rounded at all eight corners (radius 1.0 at the wall line): the game
#     belt's height (9.712 .. 10.007) and projection (0.12 m) are kept, because two tall upper-podium windows reach
#     9.712, under it.
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

PIECE = "615_SLAB_EDGE_FASCIA"
REPLACED_BELTS = ["mesh__553", "mesh__558", "mesh__559", "mesh__560", "mesh__561", "mesh__562"]

# Residential facade line (config loop in Blender x/y), the start of runs A, H, G, F, E, D, C, B in order.
RESIDENTIAL = [(6.4, -9.5), (-6.4, -9.5), (-12.5, -3.4), (-12.5, 3.4), (-6.4, 9.5), (6.4, 9.5), (12.5, 3.4), (12.5, -3.4)]
RESIDENTIAL_ROUND = [True, True, False, False, False, True, False, False]   # corners A-B, H-A, (H-G, G-F, F-E), D-E, (D-C, C-B)
PODIUM = [(7.0, -11.0), (-7.0, -11.0), (-14.0, -4.0), (-14.0, 4.0), (-7.0, 11.0), (7.0, 11.0), (14.0, 4.0), (14.0, -4.0)]
PODIUM_ROUND = [True] * 8

R0 = 1.0                 # corner radius at the facade / wall line (the game's linked guards: 0.42 m runouts)
ARC_SEGMENTS = 12        # per 45-degree corner
BAND_H = 0.50            # b8: about 16 px of a 110 px storey
OUT_RES, IN_RES = 0.04, -1.51       # residential ring: front 4 cm outside the facade line, back 1 cm behind the loggia wall
OUT_POD, IN_POD = 0.12, -0.01       # podium band: the game belt's projection, back 1 cm inside the wall
TOP_GAP = 0.005          # band top under the walking surface / roof surface (no coplanar faces)

# Floor levels from the export: the belts' tops (floor levels) and the platforms 0.04 m above them.
RESIDENTIAL_LEVELS = [   # (belt it replaces, belt top = floor level, surface the band top sits under)
    ("mesh__558", 13.582, 13.622),
    ("mesh__559", 17.152, 17.192),
    ("mesh__560", 20.722, 20.762),
    ("mesh__561", 24.292, 24.332),
    ("mesh__562", 27.862, 27.862),     # the roof line: under the roof surface (AI 620 deepens the roof edge)
]
PODIUM_LEVEL = ("mesh__553", 9.712, 10.012)    # (belt, its bottom, its top = the podium roof)


def outward_normals(pts):
    c = sum((Vector(p) for p in pts), Vector((0, 0))) / len(pts)
    normals = []
    for i in range(len(pts)):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % len(pts)])
        d = (b - a).normalized()
        n = Vector((-d.y, d.x))
        if n.dot((a + b) / 2 - c) < 0:
            n = -n
        normals.append(n)            # normal of edge i (from point i to point i+1)
    return normals


def corner_points(p, na, nb, s, rounded):
    """Offset of a polygon corner by s along the outward normals; an arc of radius R0 + s around the corner's fillet
    centre when rounded (the fillet of radius R0 on the line itself), else the mitre point."""
    p = Vector(p)
    mitre = (na + nb) / (1.0 + na.dot(nb))
    if rounded and R0 + s > 1e-4:
        centre = p - mitre * R0
        r = R0 + s
        a0, a1 = math.atan2(na.y, na.x), math.atan2(nb.y, nb.x)
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        return [centre + r * Vector((math.cos(a0 + da * i / ARC_SEGMENTS), math.sin(a0 + da * i / ARC_SEGMENTS)))
                for i in range(ARC_SEGMENTS + 1)]
    return [p + mitre * s]


def offset_loop(pts, rounds, s):
    normals = outward_normals(pts)
    groups = []
    for k in range(len(pts)):
        na, nb = normals[k - 1], normals[k]        # edge into corner k, edge out of it
        groups.append(corner_points(pts[k], na, nb, s, rounds[k]))
    return groups


def ring_band(name, pts, rounds, s_out, s_in, z0, z1, mat):
    outer, inner = offset_loop(pts, rounds, s_out), offset_loop(pts, rounds, s_in)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    flat_o = [(k, j, q) for k, g in enumerate(outer) for j, q in enumerate(g)]
    flat_i = [(k, j, q) for k, g in enumerate(inner) for j, q in enumerate(g)]
    vo = {z: [bm.verts.new((q.x, q.y, z)) for _, _, q in flat_o] for z in (z0, z1)}
    vi = {z: [bm.verts.new((q.x, q.y, z)) for _, _, q in flat_i] for z in (z0, z1)}
    index_o, index_i, at = {}, {}, 0
    for k, g in enumerate(outer):
        for j in range(len(g)):
            index_o[(k, j)] = at
            at += 1
    at = 0
    for k, g in enumerate(inner):
        for j in range(len(g)):
            index_i[(k, j)] = at
            at += 1
    faces = []        # (face, kind)

    def add(verts, kind):
        f = bm.faces.new(verts)
        faces.append((f, kind))

    n = len(pts)
    for z, kind in ((z1, "top"), (z0, "bottom")):
        for k in range(n):
            go, gi = outer[k], inner[k]
            if len(gi) == len(go):
                for j in range(len(go) - 1):
                    add([vo[z][index_o[(k, j)]], vo[z][index_o[(k, j + 1)]], vi[z][index_i[(k, j + 1)]], vi[z][index_i[(k, j)]]], kind)
            else:
                for j in range(len(go) - 1):
                    add([vo[z][index_o[(k, j)]], vo[z][index_o[(k, j + 1)]], vi[z][index_i[(k, 0)]]], kind)
            k2 = (k + 1) % n
            add([vo[z][index_o[(k, len(go) - 1)]], vo[z][index_o[(k2, 0)]], vi[z][index_i[(k2, 0)]], vi[z][index_i[(k, len(gi) - 1)]]], kind)
    for loop, verts, kind in ((flat_o, vo, "outer"), (flat_i, vi, "inner")):
        m = len(loop)
        for t in range(m):
            add([verts[z0][t], verts[z0][(t + 1) % m], verts[z1][(t + 1) % m], verts[z1][t]], kind)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f, _ in faces])

    # UVs at the game's 1.0 per metre: sides run along the band (cumulative length), top/bottom are plan x/y.
    def cumulative(loop):
        s, out = 0.0, [0.0]
        for t in range(1, len(loop) + 1):
            s += (loop[t % len(loop)][2] - loop[t - 1][2]).length
            out.append(s)
        return out
    cum = {"outer": cumulative(flat_o), "inner": cumulative(flat_i)}
    base = {"outer": vo[z0][0].index, "inner": vi[z0][0].index}
    count = {"outer": len(flat_o), "inner": len(flat_i)}
    for f, kind in faces:
        if kind in ("top", "bottom"):
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x, lp.vert.co.y)
        else:
            idx = [(lp.vert.index - base[kind]) % count[kind] for lp in f.loops]
            wrap = max(idx) - min(idx) > 1           # the closing face from the last point back to the first
            for lp, t in zip(f.loops, idx):
                u = cum[kind][count[kind]] if (wrap and t == 0) else cum[kind][t]
                lp[uv].uv = (u, lp.vert.co.z)
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
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    obj["tm_piece"] = PIECE
    obj["tm_role"] = "slab_edge"
    obj["tm_element"] = f"TM_EDIT_EXTERIOR/{PIECE}"
    return obj


def main():
    L.open_edit_copy()
    coll = L.piece_collection("exterior", PIECE)
    L.restore_set_aside(PIECE, REPLACED_BELTS)
    mat = L.material("TM_limestone")
    built = []
    for belt, floor, surface in RESIDENTIAL_LEVELS:
        b = bpy.data.objects[belt]
        # matrix_basis, not matrix_world: a belt already set aside sits in a disabled collection, which the
        # depsgraph does not evaluate (its matrix_world reads as identity there); the belts have no parent.
        top_seen = max((b.matrix_basis @ v.co).z for v in b.data.vertices)
        assert abs(top_seen - floor) < 0.002, f"{belt}: top {top_seen:.3f}, expected the floor level {floor}"
        top = surface - TOP_GAP
        o = ring_band(f"TM615_slab_edge_{floor:.3f}", RESIDENTIAL, RESIDENTIAL_ROUND, OUT_RES, IN_RES, top - BAND_H, top, mat)
        coll.objects.link(o)
        built.append(o)
    belt, z0, roof = PODIUM_LEVEL
    o = ring_band("TM615_podium_top_band", PODIUM, PODIUM_ROUND, OUT_POD, IN_POD, z0, roof - TOP_GAP, mat)
    coll.objects.link(o)
    built.append(o)
    L.set_aside([bpy.data.objects[n] for n in REPLACED_BELTS], PIECE)
    L.save()
    print("PIECE 615 DONE", [(o.name, len(o.data.polygons)) for o in built], "set aside:", REPLACED_BELTS)


if __name__ == "__main__":
    main()
