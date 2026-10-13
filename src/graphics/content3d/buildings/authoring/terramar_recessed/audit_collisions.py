# audit_collisions.py -- overlap / z-fight audit of the Terra & Mar baseline (AI 614). REPORT ONLY: changes nothing.
#
#   blender -b <file.blend> -P audit_collisions.py [-- out=<report.json>]
#
# Default report: terramar_recessed_before.audit.json beside the baseline; pass out= when auditing the edit copy.
#
# The Bradbury audit's method, as a script: one world-space BVH per TERRAMAR mesh (hidden shades excluded, the game
# never draws them), candidate pairs from bounding boxes grown by 3 mm, BVHTree.overlap for the intersecting
# triangle pairs, and each pair classified as COPLANAR (|n_a . n_b| > 0.999 and the planes within 3 mm: a z-fight
# candidate) or CROSSING (the faces cut through or touch each other). Designed overlaps show up too (a guard post
# sunk into its platform, a frame seated in a wall), so the report groups pairs by element and role for reading,
# not counting. Writes terramar_recessed_before.audit.json beside the baseline.
import json
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402

GROW = 0.003
COPLANAR_DOT, COPLANAR_DIST = 0.999, 0.003


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
            "bvh": BVHTree.FromPolygons(verts, polys, epsilon=0.0)}


def boxes_overlap(a, b):
    return all(a["lo"][i] <= b["hi"][i] and b["lo"][i] <= a["hi"][i] for i in range(3))


def main():
    bpy.context.view_layer.update()
    root = bpy.data.collections["TERRAMAR"]
    hidden = set(bpy.data.collections["TM_WINDOWS_SHADES_HIDDEN"].objects) if "TM_WINDOWS_SHADES_HIDDEN" in bpy.data.collections else set()
    objs = [o for o in root.all_objects if o.type == 'MESH' and o not in hidden and len(o.data.polygons)]
    data = [world_mesh(o) for o in objs]
    pairs_checked = 0
    groups = defaultdict(lambda: {"object_pairs": 0, "coplanar_faces": 0, "crossing_faces": 0, "examples": []})
    per_pair = []
    for i in range(len(data)):
        a = data[i]
        for j in range(i + 1, len(data)):
            b = data[j]
            if not boxes_overlap(a, b):
                continue
            pairs_checked += 1
            hits = a["bvh"].overlap(b["bvh"])
            if not hits:
                continue
            cop = cross = 0
            for fa, fb in hits:
                na, nb = a["normals"][fa], b["normals"][fb]
                pa = a["verts"][a["polys"][fa][0]]
                pb = b["verts"][b["polys"][fb][0]]
                if abs(na.dot(nb)) > COPLANAR_DOT and abs(na.dot(pb - pa)) < COPLANAR_DIST:
                    cop += 1
                else:
                    cross += 1
            oa, ob = a["obj"], b["obj"]
            ka = (oa.get("tm_element", "?"), oa.get("tm_role", "?"))
            kb = (ob.get("tm_element", "?"), ob.get("tm_role", "?"))
            key = " | ".join(sorted([f"{ka[0]}:{ka[1]}", f"{kb[0]}:{kb[1]}"]))
            g = groups[key]
            g["object_pairs"] += 1
            g["coplanar_faces"] += cop
            g["crossing_faces"] += cross
            if len(g["examples"]) < 4:
                g["examples"].append([oa.name, ob.name, cop, cross])
            per_pair.append({"a": oa.name, "b": ob.name, "coplanar": cop, "crossing": cross})
    ranked = sorted(groups.items(), key=lambda kv: (-kv[1]["coplanar_faces"], -kv[1]["crossing_faces"]))
    report = {
        "objects_audited": len(objs),
        "hidden_shades_skipped": len(hidden),
        "bbox_candidate_pairs": pairs_checked,
        "intersecting_object_pairs": len(per_pair),
        "coplanar_face_pairs_total": sum(p["coplanar"] for p in per_pair),
        "crossing_face_pairs_total": sum(p["crossing"] for p in per_pair),
        "thresholds": {"bbox_grow_m": GROW, "coplanar_dot": COPLANAR_DOT, "coplanar_plane_distance_m": COPLANAR_DIST},
        "groups": [{"elements": k, **v} for k, v in ranked],
        "top_coplanar_pairs": sorted(per_pair, key=lambda p: -p["coplanar"])[:25],
    }
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = dict(a.split("=", 1) for a in argv if "=" in a).get("out", C.AUDIT_REPORT)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"AUDIT {len(objs)} objects, {pairs_checked} candidate pairs, {len(per_pair)} intersecting pairs, "
          f"{report['coplanar_face_pairs_total']} coplanar / {report['crossing_face_pairs_total']} crossing face pairs -> {out}")
    for k, v in ranked[:15]:
        print(f"   {v['object_pairs']:4d} pairs  coplanar {v['coplanar_faces']:6d}  crossing {v['crossing_faces']:6d}  {k}")


if __name__ == "__main__":
    main()
