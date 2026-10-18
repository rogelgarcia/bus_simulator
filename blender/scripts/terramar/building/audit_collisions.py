# audit_collisions.py -- overlap / z-fight audit of a Terra & Mar file (AI 614; rebuild switch AI 643). REPORT ONLY.
#
#   blender -b <file.blend> -P audit_collisions.py [-- out=<report.json>] [root=<collection>]
#
# The switch is the file: on the rebuild's composition (terramar_composition.blend, which links the part files) it
# audits TERRAMAR_REBUILD (building, props, interiors; root=RB_SITE for the street) and writes
# terramar_rebuild.audit.json beside it; on the baseline or edit copy it audits TERRAMAR (default report
# terramar_recessed_before.audit.json beside the baseline; pass out= for the edit copy).
#
# The Bradbury audit's method, as a script: one world-space BVH per TERRAMAR mesh (hidden shades excluded, the game
# never draws them), candidate pairs from bounding boxes grown by 3 mm, BVHTree.overlap for the intersecting
# triangle pairs, and each pair classified as COPLANAR (|n_a . n_b| > 0.999 and the planes within 3 mm: a z-fight
# candidate) or CROSSING (the faces cut through or touch each other). Designed overlaps show up too (a guard post
# sunk into its platform, a frame seated in a wall), so the report groups pairs by element and role for reading,
# not counting.
#
# AI 643 splits both classes, so a model built of abutting pieces (a column standing on a slab, a slab notched round
# a pilaster) can be read: COPLANAR is a z-fight only when the two faces face the same way (n_a . n_b > 0.999); facing
# each other it is a CONTACT, two solids touching face to face, never visible; facing the same way but only sharing an
# edge (no point of one strictly inside the other) it is ADJACENT, e.g. two pieces' bottoms side by side, and does not
# flicker either. BVHTree.overlap() never reports exactly coplanar triangles (a face doubled by a twin, two flush
# neighbours), so a second pass hashes every face by its plane and compares same-plane faces of the two objects
# directly (plane_pairs). CROSSING is PENETRATING only when the
# two faces' common line runs strictly inside both faces somewhere (more than 0.2 mm from either boundary); when
# their meeting lies on an edge of either face they merely TOUCH. A clean layered model has zero z-fights and zero
# penetrations. The original totals are kept for comparison.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import json
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402

GROW = 0.003
BVH_EPS = 0.0            # BVHTree.overlap() never reports exactly coplanar triangles: plane_pairs() finds those
PLANE_BUCKET = 0.002
COPLANAR_DOT, COPLANAR_DIST = 0.999, 0.003
STRADDLE_EPS = 0.0002


def plane_key(n, p):
    """A canonical plane (normal sign fixed, 3-decimal normal, 2 mm offset bucket) for hashing same-plane faces."""
    c = (round(n.x, 3), round(n.y, 3), round(n.z, 3))
    sign = 1.0
    for v in c:
        if abs(v) > 1e-9:
            sign = 1.0 if v > 0 else -1.0
            break
    c = tuple(round(v * sign, 3) + 0.0 for v in c)
    return c, int(round(sign * n.dot(p) / PLANE_BUCKET))


def plane_buckets(m):
    buckets = defaultdict(list)
    for i, poly in enumerate(m["polys"]):
        n = m["normals"][i]
        if n.length < 0.5:
            continue
        buckets[plane_key(n, m["verts"][poly[0]])].append(i)
    return buckets


def bbox2(verts, poly, n):
    ax = max(range(3), key=lambda i: abs(n[i]))
    u, v = [i for i in range(3) if i != ax]
    xs = [verts[i][u] for i in poly]
    ys = [verts[i][v] for i in poly]
    return min(xs), max(xs), min(ys), max(ys)


def plane_pairs(a, b, seen):
    """Same-plane face pairs of two objects that touch: (zfight, contact, adjacent) counts, skipping pairs in seen."""
    zfight = contact = adjacent = 0
    for (nrm, off), fa_list in a["buckets"].items():
        fb_list = [fb for d in (-1, 0, 1) for fb in b["buckets"].get((nrm, off + d), [])]
        for fa in fa_list:
            na = a["normals"][fa]
            ba = bbox2(a["verts"], a["polys"][fa], na)
            for fb in fb_list:
                if (fa, fb) in seen:
                    continue
                nb = b["normals"][fb]
                pa, pb = a["verts"][a["polys"][fa][0]], b["verts"][b["polys"][fb][0]]
                if abs(na.dot(nb)) <= COPLANAR_DOT or abs(na.dot(pb - pa)) >= COPLANAR_DIST:
                    continue
                bb = bbox2(b["verts"], b["polys"][fb], na)
                if ba[0] > bb[1] + GROW or bb[0] > ba[1] + GROW or ba[2] > bb[3] + GROW or bb[2] > ba[3] + GROW:
                    continue
                over = overlaps(a["verts"], a["polys"][fa], na, b["verts"], b["polys"][fb])
                if na.dot(nb) > 0:
                    if over:
                        zfight += 1
                    else:
                        adjacent += 1
                elif over:
                    contact += 1
    return zfight, contact, adjacent


def world_mesh(o):
    mw = o.matrix_world
    me = o.data
    verts = [mw @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    normals = []
    for p in me.polygons:
        n = (mw.to_3x3() @ p.normal)
        normals.append(n.normalized() if n.length > 1e-12 else n)
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts))) - Vector((GROW,) * 3)
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts))) + Vector((GROW,) * 3)
    return {"obj": o, "verts": verts, "polys": polys, "normals": normals, "lo": lo, "hi": hi,
            "bvh": BVHTree.FromPolygons(verts, polys, epsilon=BVH_EPS)}


def _section_points(pts, n, p0):
    """Where the polygon meets the plane (n, p0): vertices on it and edge crossings."""
    d = [n.dot(v - p0) for v in pts]
    out = []
    m = len(pts)
    for i in range(m):
        a, b, da, db = pts[i], pts[(i + 1) % m], d[i], d[(i + 1) % m]
        if abs(da) <= STRADDLE_EPS:
            out.append(a)
        elif (da > STRADDLE_EPS and db < -STRADDLE_EPS) or (da < -STRADDLE_EPS and db > STRADDLE_EPS):
            out.append(a + (b - a) * (da / (da - db)))
    return out


def _strictly_inside(q, pts, n):
    """q (on the polygon's plane) inside the polygon and more than STRADDLE_EPS from its boundary."""
    ax = max(range(3), key=lambda i: abs(n[i]))
    u, v = [i for i in range(3) if i != ax]
    inside = False
    m = len(pts)
    for i in range(m):
        a, b = pts[i], pts[(i + 1) % m]
        ab = b - a
        t = max(0.0, min(1.0, (q - a).dot(ab) / ab.length_squared)) if ab.length_squared > 1e-18 else 0.0
        if (a + ab * t - q).length <= STRADDLE_EPS:
            return False
        if (a[v] > q[v]) != (b[v] > q[v]):
            x = a[u] + (q[v] - a[v]) * (b[u] - a[u]) / (b[v] - a[v])
            if x > q[u]:
                inside = not inside
    return inside


def _inner_points(pts):
    """Points surely inside a (possibly concave) planar polygon: its triangles' centroids."""
    if len(pts) == 3:
        return [(pts[0] + pts[1] + pts[2]) / 3]
    tris = geometry.tessellate_polygon([[Vector(p) for p in pts]])
    return [(pts[i] + pts[j] + pts[k]) / 3 for i, j, k in tris]


def overlaps(va, poly_a, n, vb, poly_b):
    """Same-plane faces that really overlap: a vertex or an inner point of one lies strictly inside the other."""
    pa = [va[i] for i in poly_a]
    pb = [vb[i] for i in poly_b]
    return (any(_strictly_inside(q, pb, n) for q in pa + _inner_points(pa)) or
            any(_strictly_inside(q, pa, n) for q in pb + _inner_points(pb)))


def penetrates(va, poly_a, na, vb, poly_b, nb):
    """True when the faces cut through each other: some stretch of their common line lies strictly inside both."""
    pa = [va[i] for i in poly_a]
    pb = [vb[i] for i in poly_b]
    u = na.cross(nb)
    if u.length_squared < 1e-12:
        return False
    d1, d2 = na.dot(pa[0]), nb.dot(pb[0])
    origin = (nb.cross(u) * d1 + u.cross(na) * d2) / u.length_squared
    direction = u.normalized()
    ts = sorted({round((q - origin).dot(direction), 6) for q in _section_points(pa, nb, pb[0]) + _section_points(pb, na, pa[0])})
    for t0, t1 in zip(ts, ts[1:]):
        if t1 - t0 <= 2 * STRADDLE_EPS:
            continue
        mid = origin + direction * ((t0 + t1) / 2)
        if _strictly_inside(mid, pa, na) and _strictly_inside(mid, pb, nb):
            return True
    return False


def boxes_overlap(a, b):
    return all(a["lo"][i] <= b["hi"][i] and b["lo"][i] <= a["hi"][i] for i in range(3))


def main():
    bpy.context.view_layer.update()
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    is_rebuild = bool(bpy.data.filepath) and os.path.normcase(os.path.abspath(bpy.data.filepath)) == os.path.normcase(os.path.abspath(C.REBUILD_BLEND))
    root_name = opts.get("root", "TERRAMAR_BUILDING" if is_rebuild else "TERRAMAR")
    root = bpy.data.collections[root_name]
    hidden = set(bpy.data.collections["TM_WINDOWS_SHADES_HIDDEN"].objects) if "TM_WINDOWS_SHADES_HIDDEN" in bpy.data.collections else set()
    objs = [o for o in root.all_objects if o.type == 'MESH' and o not in hidden and len(o.data.polygons)]
    data = [world_mesh(o) for o in objs]
    for m in data:
        m["buckets"] = plane_buckets(m)
    pairs_checked = 0
    groups = defaultdict(lambda: {"object_pairs": 0, "coplanar_faces": 0, "crossing_faces": 0, "zfight_faces": 0,
                                  "contact_faces": 0, "adjacent_faces": 0, "touching_faces": 0, "penetrating_faces": 0,
                                  "examples": []})
    per_pair = []
    for i in range(len(data)):
        a = data[i]
        for j in range(i + 1, len(data)):
            b = data[j]
            if not boxes_overlap(a, b):
                continue
            pairs_checked += 1
            hits = a["bvh"].overlap(b["bvh"])
            cop = cross = zfight = contact = adjacent = touch = pen = 0
            for fa, fb in hits:
                na, nb = a["normals"][fa], b["normals"][fb]
                pa = a["verts"][a["polys"][fa][0]]
                pb = b["verts"][b["polys"][fb][0]]
                if abs(na.dot(nb)) > COPLANAR_DOT and abs(na.dot(pb - pa)) < COPLANAR_DIST:
                    cop += 1
                    if na.dot(nb) <= 0:
                        contact += 1
                    elif overlaps(a["verts"], a["polys"][fa], na, b["verts"], b["polys"][fb]):
                        zfight += 1
                    else:
                        adjacent += 1
                else:
                    cross += 1
                    if penetrates(a["verts"], a["polys"][fa], na, b["verts"], b["polys"][fb], nb):
                        pen += 1
                    else:
                        touch += 1
            pz, pc, padj = plane_pairs(a, b, set(hits))
            zfight, contact, adjacent, cop = zfight + pz, contact + pc, adjacent + padj, cop + pz + pc + padj
            if not (hits or pz or pc or padj):
                continue
            oa, ob = a["obj"], b["obj"]
            ka = (oa.get("tm_element", "?"), oa.get("tm_role", "?"))
            kb = (ob.get("tm_element", "?"), ob.get("tm_role", "?"))
            key = " | ".join(sorted([f"{ka[0]}:{ka[1]}", f"{kb[0]}:{kb[1]}"]))
            g = groups[key]
            g["object_pairs"] += 1
            g["coplanar_faces"] += cop
            g["crossing_faces"] += cross
            g["zfight_faces"] += zfight
            g["contact_faces"] += contact
            g["adjacent_faces"] += adjacent
            g["touching_faces"] += touch
            g["penetrating_faces"] += pen
            if len(g["examples"]) < 4:
                g["examples"].append([oa.name, ob.name, cop, cross])
            per_pair.append({"a": oa.name, "b": ob.name, "coplanar": cop, "crossing": cross, "zfight": zfight,
                             "contact": contact, "adjacent": adjacent, "touching": touch, "penetrating": pen})
    ranked = sorted(groups.items(), key=lambda kv: (-kv[1]["coplanar_faces"], -kv[1]["crossing_faces"]))
    report = {
        "file": os.path.relpath(bpy.data.filepath, C.ROOT).replace("\\", "/") if bpy.data.filepath else None,
        "root": root_name,
        "objects_audited": len(objs),
        "hidden_shades_skipped": len(hidden),
        "bbox_candidate_pairs": pairs_checked,
        "intersecting_object_pairs": len(per_pair),
        "coplanar_face_pairs_total": sum(p["coplanar"] for p in per_pair),
        "crossing_face_pairs_total": sum(p["crossing"] for p in per_pair),
        "zfight_face_pairs": sum(p["zfight"] for p in per_pair),
        "contact_face_pairs": sum(p["contact"] for p in per_pair),
        "adjacent_face_pairs": sum(p["adjacent"] for p in per_pair),
        "touching_face_pairs": sum(p["touching"] for p in per_pair),
        "penetrating_face_pairs": sum(p["penetrating"] for p in per_pair),
        "thresholds": {"bbox_grow_m": GROW, "coplanar_dot": COPLANAR_DOT, "coplanar_plane_distance_m": COPLANAR_DIST,
                       "straddle_m": STRADDLE_EPS},
        "groups": [{"elements": k, **v} for k, v in ranked],
        "top_coplanar_pairs": sorted(per_pair, key=lambda p: -p["coplanar"])[:25],
        "top_problem_pairs": sorted([p for p in per_pair if p["zfight"] or p["penetrating"]],
                                    key=lambda p: -(p["zfight"] + p["penetrating"]))[:25],
    }
    out = opts.get("out", C.REBUILD_AUDIT if is_rebuild else C.AUDIT_REPORT)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"AUDIT {root_name}: {len(objs)} objects, {pairs_checked} candidate pairs, {len(per_pair)} intersecting pairs, "
          f"{report['coplanar_face_pairs_total']} coplanar / {report['crossing_face_pairs_total']} crossing face pairs -> {out}")
    print(f"      z-fight {report['zfight_face_pairs']}, contact {report['contact_face_pairs']}, adjacent {report['adjacent_face_pairs']}, "
          f"touching {report['touching_face_pairs']}, penetrating {report['penetrating_face_pairs']}")
    for k, v in ranked[:15]:
        print(f"   {v['object_pairs']:4d} pairs  coplanar {v['coplanar_faces']:6d} (z-fight {v['zfight_faces']})  "
              f"crossing {v['crossing_faces']:6d} (penetrating {v['penetrating_faces']})  {k}")


if __name__ == "__main__":
    main()
