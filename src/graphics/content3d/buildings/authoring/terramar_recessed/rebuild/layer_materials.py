# layer_materials.py -- AI 648: the materials pass of the Terra & Mar rebuild, from plan["materials"].
#
# Run through build.py, which appends it after any geometry layer it rebuilds (layers=materials alone re-dresses the
# materials; materials=0 skips it). It owns no collection of its own: it dresses the other layers' objects.
#   materials   every TM_RB_* face set is re-dressed by slot name from its family in the plan:
#                 stone / paving   the kit limestone (AI 640, assets/public/pbr/terramar_continuous_limestone: basecolor,
#                                  arm = AO / roughness / metallic, normal_gl) through the node group TM_RB_limestone,
#                                  4 m repeat, a calibrated linear tone on the base colour
#                 wood             the calibrated warm tone of AI 645 (no wood texture is installed), flat
#                 steel / glass / plaster / interior_floor / concrete    plain Principled settings
#               The sign letters keep the kit's own sign sets (the podium layer's TM_RB_sign_* materials).
#   joints      the stone's panel joints cut as geometry into every object carrying a slot of joints.rules:
#                 course joints  z-planes from joints.course_planes, cut into the course faces whose height holds the
#                                groove with clearance (a lintel whose soffit sits on a plane is not cut there)
#                 vertical joints per flat vertical face at least vertical_min_height tall: equal panels of at most
#                                panel_max across its width, carried on over the stone soffit or top they meet
#               A joint is a groove `width` wide and `depth` deep with a `bevel` each side; its floor takes the joint
#               material (TM_RB_stone_joint). Each panel (a region bounded by joint floors) gets its own UV offset,
#               seeded, so the kit's 4 m repeat does not line up from panel to panel. An object is cut once: it is
#               tagged rb_joints and skipped until its layer rebuilds it.
#   writes      tests/artifacts/blender/terramar_recessed/rebuild/joint_layout.json (every original stone face with
#               the joint centre lines on it, world space, for compose_joint_layout.py's per-run elevations)
import hashlib
import importlib
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

LAYER = "materials"
STONE_GROUP = "TM_RB_limestone"
JOINT_MATERIAL = "TM_RB_stone_joint"
JOINT_LAYOUT = os.path.join(L.C.REBUILD_DIR, "joint_layout.json")


# ---------------------------------------------------------------- materials


def kit_image(folder, name, colorspace):
    img = bpy.data.images.load(os.path.join(folder, name), check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def stone_group(folder, repeat_m):
    """TM_RB_limestone: the kit's maps through UV / repeat; inputs Tone (linear multiplier), AO Strength, Roughness Gain,
    Normal Strength; output BSDF."""
    ng = bpy.data.node_groups.get(STONE_GROUP)
    if ng is not None:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new(STONE_GROUP, "ShaderNodeTree")
    ng.interface.new_socket(name="BSDF", in_out="OUTPUT", socket_type="NodeSocketShader")
    s = ng.interface.new_socket(name="Tone", in_out="INPUT", socket_type="NodeSocketColor")
    s.default_value = (1.0, 1.0, 1.0, 1.0)
    for name, val in (("AO Strength", 0.5), ("Roughness Gain", 1.0), ("Normal Strength", 1.0)):
        s = ng.interface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketFloat")
        s.default_value = val
    nodes, links = ng.nodes, ng.links
    gin, gout = nodes.new("NodeGroupInput"), nodes.new("NodeGroupOutput")
    tc = nodes.new("ShaderNodeTexCoord")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0 / repeat_m, 1.0 / repeat_m, 1.0)
    links.new(mp.inputs["Vector"], tc.outputs["UV"])

    def tex(name, colorspace):
        n = nodes.new("ShaderNodeTexImage")
        n.image = kit_image(folder, name, colorspace)
        n.interpolation = "Linear"
        n.extension = "REPEAT"
        links.new(n.inputs["Vector"], mp.outputs["Vector"])
        return n
    base, arm, nrm = tex("basecolor.png", "sRGB"), tex("arm.png", "Non-Color"), tex("normal_gl.png", "Non-Color")
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(sep.inputs["Color"], arm.outputs["Color"])
    tone = nodes.new("ShaderNodeVectorMath")
    tone.operation = "MULTIPLY"
    links.new(tone.inputs[0], base.outputs["Color"])
    links.new(tone.inputs[1], gin.outputs["Tone"])
    ao = nodes.new("ShaderNodeMath")                                   # mix(1, AO, s) = AO * s + (1 - s)
    ao.operation = "MULTIPLY_ADD"
    one_minus = nodes.new("ShaderNodeMath")
    one_minus.operation = "SUBTRACT"
    one_minus.inputs[0].default_value = 1.0
    links.new(one_minus.inputs[1], gin.outputs["AO Strength"])
    links.new(ao.inputs[0], sep.outputs["Red"])
    links.new(ao.inputs[1], gin.outputs["AO Strength"])
    links.new(ao.inputs[2], one_minus.outputs[0])
    shade = nodes.new("ShaderNodeVectorMath")
    shade.operation = "SCALE"
    links.new(shade.inputs[0], tone.outputs["Vector"])
    links.new(shade.inputs["Scale"], ao.outputs[0])
    rough = nodes.new("ShaderNodeMath")
    rough.operation = "MULTIPLY"
    rough.use_clamp = True
    links.new(rough.inputs[0], sep.outputs["Green"])
    links.new(rough.inputs[1], gin.outputs["Roughness Gain"])
    nm = nodes.new("ShaderNodeNormalMap")
    links.new(nm.inputs["Color"], nrm.outputs["Color"])
    links.new(nm.inputs["Strength"], gin.outputs["Normal Strength"])
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.inputs["Base Color"], shade.outputs["Vector"])
    links.new(bsdf.inputs["Roughness"], rough.outputs[0])
    links.new(bsdf.inputs["Metallic"], sep.outputs["Blue"])
    links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    links.new(gout.inputs["BSDF"], bsdf.outputs["BSDF"])
    return ng


def fresh_tree(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return nt, out


def dress_stone(mat, ng, fam):
    nt, out = fresh_tree(mat)
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = ng
    g.inputs["Tone"].default_value = (*fam["tone"], 1.0)
    g.inputs["AO Strength"].default_value = fam["ao_strength"]
    g.inputs["Roughness Gain"].default_value = fam["roughness_gain"]
    g.inputs["Normal Strength"].default_value = fam["normal_strength"]
    nt.links.new(out.inputs["Surface"], g.outputs["BSDF"])
    mean = (227 / 255, 215 / 255, 202 / 255)                          # the kit's mean base colour, for Solid view
    mat.diffuse_color = (*[c * t for c, t in zip(mean, fam["tone"])], 1.0)


def dress_plain(mat, rgb, roughness, metallic=0.0, transmission=0.0, ior=1.5):
    nt, out = fresh_tree(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = ior
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (*rgb, 0.35 if transmission else 1.0)


def dress_materials(m):
    folder = os.path.join(L.C.ROOT, "assets", "public", "pbr", m["stone"]["set"])
    if not os.path.isdir(folder):
        raise SystemExit(f"layer_materials: the kit set {folder} is missing -- run make_terramar_kit_pbr.py (AI 640)")
    ng = stone_group(folder, m["stone"]["repeat_m"])
    dressed, missing = {}, []
    for fam_name, fam in m.items():
        if not isinstance(fam, dict) or "slots" not in fam:
            continue
        for slot in fam["slots"]:
            mat = bpy.data.materials.get(slot)
            if mat is None:
                missing.append(slot)
                continue
            if fam_name in ("stone", "paving"):
                dress_stone(mat, ng, fam)
            elif fam_name == "glass":
                dress_plain(mat, fam["rgb"], fam["roughness"], transmission=1.0, ior=fam["ior"])
            else:
                dress_plain(mat, fam["rgb"], fam["roughness"], fam.get("metallic", 0.0))
            dressed[slot] = fam_name
    jt = m["joints"]
    joint = bpy.data.materials.get(JOINT_MATERIAL) or bpy.data.materials.new(JOINT_MATERIAL)
    dress_plain(joint, jt["rgb"], jt["roughness"])
    dressed[JOINT_MATERIAL] = "joints"
    return dressed, missing, joint


# ---------------------------------------------------------------- joints


def push_direction(normals):
    """The smallest v with v . n = 1 for every distinct normal n (a groove of the same depth on every face it crosses)."""
    uniq = []
    for n in normals:
        if all(n.dot(u) < 0.9995 for u in uniq):
            uniq.append(n)
    if len(uniq) == 1:
        return uniq[0].copy()
    if len(uniq) == 2:
        a, b = uniq
        return (a + b) / (1.0 + a.dot(b))
    import numpy as np                                                  # 3+ faces: least squares, minimum norm
    N = np.array([tuple(u) for u in uniq])
    v = np.linalg.lstsq(N, np.ones(len(uniq)), rcond=None)[0]
    return Vector(tuple(v))


def canonical(t, sj):
    """One plane, two spellings: (t, s) and (-t, -s). The spelling whose first non-zero component of t is positive."""
    for c in t:
        if abs(c) > 1e-6:
            return (t.copy(), sj) if c > 0 else (-t, -sj)
    return t.copy(), sj


def polygon_line(points, n, c):
    """Segments where a planar polygon meets the plane n . p = c (pairs of crossings sorted along the line)."""
    out = []
    k = len(points)
    for i in range(k):
        p, q = points[i], points[(i + 1) % k]
        dp, dq = n.dot(p) - c, n.dot(q) - c
        if (dp < 0) != (dq < 0) and abs(dp - dq) > 1e-12:
            out.append(p + (q - p) * (dp / (dp - dq)))
    if len(out) < 2:
        return []
    axis = (out[-1] - out[0]).normalized() if (out[-1] - out[0]).length > 1e-9 else Vector((1, 0, 0))
    out.sort(key=lambda p: p.dot(axis))
    return [(out[i], out[i + 1]) for i in range(0, len(out) - 1, 2)]


def cut_joints(ob, jt, joint_mat):
    """Cut the stone joints into one object; returns its stats and its layout record (or None if it has no stone)."""
    me = ob.data
    names = [m.name if m else "" for m in me.materials]
    rules = jt["rules"]
    stone_idx = {i for i, n in enumerate(names) if n in rules}
    if not stone_idx:
        return None, None
    course_idx = {i for i in stone_idx if rules[names[i]]["courses"]}
    vert_idx = {i for i in stone_idx if rules[names[i]]["verticals"]}
    if JOINT_MATERIAL not in names:
        me.materials.append(joint_mat)
        names.append(JOINT_MATERIAL)
    joint_index = names.index(JOINT_MATERIAL)
    half, bev, depth = jt["width"] / 2, jt["bevel"], jt["depth"]
    tol = 2e-4                    # mesh coordinates are float32: ~1e-6 m at 10 m; the next cut line is `bevel` away
    clear = half + bev + jt["margin"]
    offsets = (-half - bev, -half, half, half + bev)

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(ob.matrix_world)
    bm.normal_update()
    orig = bm.faces.layers.int.new("rb_orig")
    faces = {}                    # orig id -> record of the original stone face
    for i, f in enumerate(bm.faces):
        f[orig] = i
        if f.material_index not in stone_idx:
            continue
        n = f.normal.copy()
        pts = [v.co.copy() for v in f.verts]
        rec = {"n": n, "pts": pts, "slot": names[f.material_index], "z": [], "v": []}     # v: [(t, s)] vertical joint planes
        if abs(n.z) < 0.5 and f.material_index in course_idx:
            z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
            rec["z"] = [zc for zc in jt["course_planes"] if z0 < zc - clear and z1 > zc + clear]
        tall = max(p.z for p in pts) - min(p.z for p in pts) >= jt["vertical_min_height"]
        if abs(n.z) < 0.1 and f.material_index in vert_idx and tall:
            t = Vector((-n.y, n.x, 0.0)).normalized()
            s = [p.dot(t) for p in pts]
            s0, s1 = min(s), max(s)
            k = math.ceil((s1 - s0) / jt["panel_max"] - 1e-9)
            rec["v"] = [canonical(t, s0 + (s1 - s0) * j / k) for j in range(1, k)]
        faces[i] = rec
    for i, f in enumerate(bm.faces):                                   # a vertical joint carries on over the stone soffit
        if i not in faces or not faces[i]["v"]:                        # or top it meets (a lintel's underside)
            continue
        for e in f.edges:
            for h in e.link_faces:
                hid = h[orig]
                if hid == i or hid not in faces or abs(faces[hid]["n"].z) < 0.9:
                    continue
                for t, sj in faces[i]["v"]:                         # a soffit can meet the same plane from two faces
                    s = [p.dot(t) for p in faces[hid]["pts"]]
                    if min(s) < sj - clear and max(s) > sj + clear and all(abs(sj - s2) > tol or (t - t2).length > 1e-4
                                                                        for t2, s2 in faces[hid]["v"]):
                        faces[hid]["v"].append((t, sj))

    def bisect(fs, co, no):
        """Cut faces fs; returns every face they became (bisect_plane's output holds the cut and the uncut ones)."""
        geom = fs + list({e for f in fs for e in f.edges}) + list({v for f in fs for v in f.verts})
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-7, plane_co=co, plane_no=no)
        return [g for g in res["geom"] if isinstance(g, bmesh.types.BMFace)]

    by_orig = {oid: [] for oid in faces}
    for f in bm.faces:
        if f[orig] in faces:
            by_orig[f[orig]].append(f)
    cuts = 0
    for oid, rec in faces.items():                                     # vertical joints, face by face
        for t, sj in rec["v"]:
            for off in offsets:
                by_orig[oid] = bisect(by_orig[oid], t * (sj + off), t)
                cuts += 1
    planes = sorted({zc for rec in faces.values() for zc in rec["z"]})
    for zc in planes:                                                  # course joints, plane by plane
        oids = [oid for oid, rec in faces.items() if zc in rec["z"]]
        fs = [f for oid in oids for f in by_orig[oid]]
        for off in offsets:
            fs = bisect(fs, (0.0, 0.0, zc + off), (0.0, 0.0, 1.0))
            cuts += 1
        for oid in oids:
            by_orig[oid] = []
        for f in fs:
            by_orig[f[orig]].append(f)

    # push every vertex inside a groove floor strip `depth` into the faces whose joint it lies on
    def strips(oid, co):
        rec = faces[oid]
        return (any(abs(co.z - zc) <= half + tol for zc in rec["z"])
                or any(abs(co.dot(t) - sj) <= half + tol for t, sj in rec["v"]))
    moves = []
    for v in bm.verts:
        normals = [faces[f[orig]]["n"] for f in v.link_faces if f[orig] in faces and strips(f[orig], v.co)]
        if normals:
            moves.append((v, push_direction(normals)))
    pushed = set()
    for v, d in moves:
        v.co -= d * depth
        pushed.add(v)
    floors = 0
    for f in bm.faces:
        if f[orig] in faces and f.verts and all(v in pushed for v in f.verts):
            f.material_index = joint_index
            floors += 1

    # faces the push twisted: where two bevels cross (three corners pushed, one not) split along the mitre through the
    # odd corner; anything else non-planar (bevels over curved facets) is triangulated
    def twisted(f):
        c, n = f.calc_center_median(), f.normal
        return max(abs(n.dot(v.co - c)) for v in f.verts) > 1e-4
    bm.normal_update()
    rest = []
    for f in [f for f in bm.faces if f[orig] in faces and len(f.verts) > 3 and twisted(f)]:
        vs = list(f.verts)
        odd = [v for v in vs if (v in pushed) != (sum(w in pushed for w in vs) > len(vs) / 2)]
        if len(vs) == 4 and len(odd) == 1:
            i = vs.index(odd[0])
            bmesh.utils.face_split(f, vs[i], vs[(i + 2) % 4])
        else:
            rest.append(f)
    if rest:
        bmesh.ops.triangulate(bm, faces=rest, quad_method="BEAUTY", ngon_method="BEAUTY")

    # box UVs from each original face's normal, then one seeded offset per panel (regions bounded by joint floors)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if f[orig] not in faces:
            continue
        n = faces[f[orig]]["n"]
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (co.x, co.y) if ax == 2 else (co.y, co.z) if ax == 0 else (co.x, co.z)
    seen, panels = set(), []
    for f in bm.faces:
        if f in seen or f[orig] not in faces or f.material_index == joint_index:
            continue
        stack, panel = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            panel.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen and h[orig] in faces and h.material_index != joint_index:
                        seen.add(h)
                        stack.append(h)
        panels.append(panel)
    repeat = jt.get("repeat_m", 4.0)
    for panel in panels:
        lo = min((tuple(round(c, 3) for c in v.co) for g in panel for v in g.verts))
        rng = random.Random(hashlib.md5(f"{jt['seed']}:{ob.name}:{lo}".encode()).hexdigest())
        du, dv = rng.uniform(0.0, repeat), rng.uniform(0.0, repeat)
        for g in panel:
            for lp in g.loops:
                lp[uv].uv = (lp[uv].uv[0] + du, lp[uv].uv[1] + dv)

    bm.normal_update()                                                  # self-checks: no slivers, no twisted faces
    degenerate = sum(1 for f in bm.faces if f[orig] in faces and f.calc_area() < 1e-8)
    non_planar = 0
    for f in bm.faces:
        if f[orig] in faces and len(f.verts) > 3 and f.calc_area() >= 1e-8:
            c, n = f.calc_center_median(), f.normal
            non_planar += max(abs(n.dot(v.co - c)) for v in f.verts) > 1e-4
    bm.faces.layers.int.remove(orig)
    bm.transform(ob.matrix_world.inverted())
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    bm.to_mesh(me)
    bm.free()
    me.set_sharp_from_angle(angle=math.radians(30.0))
    ob["rb_joints"] = json.dumps({k: jt[k] for k in ("width", "bevel", "depth", "panel_max", "course_target", "seed")})

    # the layout record: original stone faces and the joint centre lines on them
    layout_faces = []
    seg = lambda a, b: [[round(c, 4) for c in a], [round(c, 4) for c in b]]  # noqa: E731
    for oid, rec in faces.items():
        lines = [seg(a, b) for zc in rec["z"] for a, b in polygon_line(rec["pts"], Vector((0, 0, 1)), zc)]
        lines += [seg(a, b) for t, sj in rec["v"] for a, b in polygon_line(rec["pts"], t, sj)]
        layout_faces.append({"slot": rec["slot"], "n": [round(c, 4) for c in rec["n"]],
                             "pts": [[round(c, 4) for c in p] for p in rec["pts"]], "joints": lines})
    stats = {"stone_faces": len(faces), "course_planes": len(planes), "vertical_joints": sum(len(r["v"]) for r in faces.values()),
             "bisects": cuts, "joint_floor_faces": floors, "panels": len(panels), "non_manifold": non_manifold,
             "degenerate_faces": degenerate, "non_planar_faces": non_planar}
    return stats, {"object": ob.name, "faces": layout_faces}


def build(plan):
    m = plan["materials"]
    dressed, missing, joint_mat = dress_materials(m)
    jt = dict(m["joints"], repeat_m=m["stone"]["repeat_m"])
    per_object, layout, skipped = {}, [], []
    root = bpy.data.collections.get(L.ROOT)
    for ob in sorted(root.all_objects if root else [], key=lambda o: o.name):
        if ob.type != "MESH":
            continue
        if ob.get("rb_joints"):
            skipped.append(ob.name)
            continue
        stats, rec = cut_joints(ob, jt, joint_mat)
        if stats is None:
            continue
        per_object[ob.name] = stats
        layout.append(rec)
        for key in ("non_manifold", "degenerate_faces", "non_planar_faces"):
            if stats[key]:
                print(f"WARNING {ob.name}: {stats[key]} {key.replace('_', ' ')} after the joints")
    if layout:
        old = L.C.load_json(JOINT_LAYOUT) if os.path.exists(JOINT_LAYOUT) and skipped else {"objects": []}
        keep = [o for o in old.get("objects", []) if o["object"] in skipped]
        os.makedirs(os.path.dirname(JOINT_LAYOUT), exist_ok=True)
        with open(JOINT_LAYOUT, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"joints": {k: jt[k] for k in ("width", "bevel", "depth", "panel_max", "course_target", "seed")},
                       "objects": keep + layout}, fh)
    totals = {k: sum(s[k] for s in per_object.values())
              for k in ("vertical_joints", "joint_floor_faces", "panels", "non_manifold", "degenerate_faces", "non_planar_faces")}
    return {"layer": LAYER, "dressed": len(dressed), "missing_slots": missing, "jointed_objects": len(per_object),
            "skipped_already_jointed": len(skipped), **totals, "per_object": per_object,
            "names": sorted(per_object)}
