# layer_materials.py -- AI 648: the materials pass of the Terra & Mar rebuild, from plan["materials"].
#
# Run through build.py, which appends it after any geometry layer it rebuilds (layers=materials alone re-dresses the
# materials; materials=0 skips it). It owns no collection of its own: it dresses the other layers' objects.
#   materials   every TM_RB_* face set is re-dressed by slot name from its family in the plan:
#                 roof_paving      the same limestone as 600 mm square tiles with thin joints, a per-tile map offset
#                                  (the roof terrace deck's walking face, AI 630)
#                 stone / paving   the kit limestone (AI 640, assets/public/pbr/terramar_continuous_limestone: basecolor,
#                                  arm = AO / roughness / metallic, normal_gl) through the node group TM_RB_limestone,
#                                  4 m repeat, a calibrated linear tone on the base colour
#                 wood             the calibrated warm tone of AI 645 (no wood texture is installed), flat
#                 glass            clear Principled glass whose shadow rays pass (lit rooms behind the glazing)
#                 steel / plaster / partition / interior_floor / concrete    plain Principled settings
#               The sign letters keep the kit's own sign sets (the podium layer's TM_RB_sign_* materials).
#   joints      the stone's panel joints cut as geometry into every object carrying a slot of joints.rules:
#                 course joints  z-planes from joints.course_planes, cut into the course faces whose height holds the
#                                groove with clearance (a lintel whose soffit sits on a plane is not cut there)
#                 vertical joints per flat vertical face at least vertical_min_height tall: equal panels of at most
#                                panel_max across its width, carried on over the faces they meet square (the stone
#                                soffit or top, an eased arris and the stone return past it: joints.carry_hops)
#                 seam joints    (2026-10-14) where two stone pieces meet flush (coplanar faces of different solids or
#                                objects sharing an edge: a lintel beside a pier, a band under a slab fascia, a jamb
#                                beside a pier) a joint centred on the seam, over the stretch the two faces share
#                 objects        (2026-10-14) joints.objects joints named objects in whichever part holds them, on a
#                                face set the rules leave alone elsewhere (the site's limestone tree pits on
#                                TM_RB_paving); `base` adds a joint at the foot of their sides, where they meet the paving
#               A joint is a groove `width` wide and `depth` deep with a `bevel` each side; its floor takes the joint
#               material (TM_RB_stone_joint). Each panel (a region bounded by joint floors) gets its own UV offset,
#               seeded, so the kit's 4 m repeat does not line up from panel to panel. An object is cut once: it is
#               tagged rb_joints and skipped until its layer rebuilds it.
#   writes      tests/artifacts/blender/terramar_recessed/rebuild/joint_layout.json (every original stone face with
#               the joint centre lines on it, world space, for compose_joint_layout.py's per-run elevations)
# joint_slot() gives the geometry layers TM_RB_stone_joint for the shadow gaps they model (2026-10-14: the stone
# returns' gaps between stone and wood); this pass dresses it with the joints' colour.
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


def joint_slot():
    """TM_RB_stone_joint for a layer's modelled shadow gaps: made dark if missing (this pass dresses it later)."""
    if bpy.data.materials.get(JOINT_MATERIAL) is None:
        mat = bpy.data.materials.new(JOINT_MATERIAL)
        mat.diffuse_color = (0.20, 0.185, 0.165, 1.0)
    return JOINT_MATERIAL


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


def dress_tiles(mat, folder, fam):
    """Square stone tiles from the kit maps: object x / y split into tile_m cells, each cell sampling the 4 m map at its
    own seeded offset (a white-noise value per cell), joints of joint_m darkened and rougher."""
    nt, out = fresh_tree(mat)
    n, links = nt.nodes, nt.links

    def math(op, a, b=None):
        m = n.new("ShaderNodeMath")
        m.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                links.new(m.inputs[i], v)
        return m.outputs[0]
    tc = n.new("ShaderNodeTexCoord")
    xyz = n.new("ShaderNodeSeparateXYZ")
    links.new(xyz.inputs[0], tc.outputs["Object"])
    t, w = fam["tile_m"], fam["joint_m"]
    u, v = math("DIVIDE", xyz.outputs["X"], t), math("DIVIDE", xyz.outputs["Y"], t)
    cell = n.new("ShaderNodeCombineXYZ")
    links.new(cell.inputs["X"], math("FLOOR", u))
    links.new(cell.inputs["Y"], math("FLOOR", v))
    rnd = n.new("ShaderNodeTexWhiteNoise")
    rnd.noise_dimensions = "3D"
    links.new(rnd.inputs["Vector"], cell.outputs[0])
    uvw = n.new("ShaderNodeCombineXYZ")                                # metres / repeat + the cell's offset
    links.new(uvw.inputs["X"], math("DIVIDE", xyz.outputs["X"], fam["repeat_m"]))
    links.new(uvw.inputs["Y"], math("DIVIDE", xyz.outputs["Y"], fam["repeat_m"]))
    coords = n.new("ShaderNodeVectorMath")
    coords.operation = "ADD"
    links.new(coords.inputs[0], uvw.outputs[0])
    links.new(coords.inputs[1], rnd.outputs["Color"])

    def tex(name, colorspace):
        node = n.new("ShaderNodeTexImage")
        node.image = kit_image(folder, name, colorspace)
        node.extension = "REPEAT"
        links.new(node.inputs["Vector"], coords.outputs[0])
        return node
    base, arm, nrm = tex("basecolor.png", "sRGB"), tex("arm.png", "Non-Color"), tex("normal_gl.png", "Non-Color")
    sep = n.new("ShaderNodeSeparateColor")
    links.new(sep.inputs["Color"], arm.outputs["Color"])

    def joint_of(c):                                                  # 1 within w/2 of a cell edge
        f = math("FRACT", c)
        d = math("MULTIPLY", math("MINIMUM", f, math("SUBTRACT", 1.0, f)), t)
        return math("LESS_THAN", d, w / 2)
    joint = math("MAXIMUM", joint_of(u), joint_of(v))
    tone = n.new("ShaderNodeVectorMath")
    tone.operation = "MULTIPLY"
    links.new(tone.inputs[0], base.outputs["Color"])
    tone.inputs[1].default_value = fam["tone"]
    colour = n.new("ShaderNodeMix")
    colour.data_type = "RGBA"
    links.new(colour.inputs["Factor"], joint)
    links.new(colour.inputs[6], tone.outputs["Vector"])
    colour.inputs[7].default_value = (*fam["joint_rgb"], 1.0)
    rough = n.new("ShaderNodeMix")
    links.new(rough.inputs["Factor"], joint)
    links.new(rough.inputs[2], math("MULTIPLY", sep.outputs["Green"], fam["roughness_gain"]))
    rough.inputs[3].default_value = fam["joint_roughness"]
    nm = n.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = fam["normal_strength"]
    links.new(nm.inputs["Color"], nrm.outputs["Color"])
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.inputs["Base Color"], colour.outputs[2])
    links.new(bsdf.inputs["Roughness"], rough.outputs[0])
    links.new(bsdf.inputs["Metallic"], sep.outputs["Blue"])
    links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mean = (227 / 255, 215 / 255, 202 / 255)
    mat.diffuse_color = (*[c * k for c, k in zip(mean, fam["tone"])], 1.0)


def dress_glass(mat, fam):
    """Clear glass whose shadow rays pass (a transparent BSDF, tinted, for Light Path's shadow rays): Cycles' glass
    otherwise blocks the sun's shadow rays and the rooms behind the glazing go dark (AI 634)."""
    nt, out = fresh_tree(mat)
    glass = nt.nodes.new("ShaderNodeBsdfPrincipled")
    glass.inputs["Base Color"].default_value = (*fam["rgb"], 1.0)
    glass.inputs["Roughness"].default_value = fam["roughness"]
    glass.inputs["Transmission Weight"].default_value = 1.0
    glass.inputs["IOR"].default_value = fam["ior"]
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    clear.inputs["Color"].default_value = (*fam["rgb"], 1.0)
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mix.inputs["Fac"], path.outputs["Is Shadow Ray"])
    nt.links.new(mix.inputs[1], glass.outputs["BSDF"])
    nt.links.new(mix.inputs[2], clear.outputs["BSDF"])
    nt.links.new(out.inputs["Surface"], mix.outputs["Shader"])
    mat.diffuse_color = (*fam["rgb"], 0.35)


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
            elif "tile_m" in fam:                                     # roof_paving, site_paving
                dress_tiles(mat, folder, fam)
            elif fam_name == "glass":
                dress_glass(mat, fam)
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


def rules_for(ob, jt):
    """The joint rules by slot for one object: joints.rules, plus its own rule from joints.objects (2026-10-14)."""
    rules = dict(jt["rules"])
    own = jt.get("objects", {}).get(ob.name)
    if own:
        rules[own["slot"]] = own
    return rules


def solid_ids(me):
    """The solid (connected vertex set) each polygon belongs to: pieces() builds every solid from its own vertices."""
    parent = list(range(len(me.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    return [find(p.vertices[0]) for p in me.polygons]


def seam_joints(objects, jt):
    """Seams between flush stone pieces: coplanar stone faces of different solids (or objects) facing the same way and
    sharing a stretch of a boundary edge. Returns {object name: {face index: [(t, s, e, e0, e1)]}}: the joint plane
    t . p = s through the seam (t in the face's plane, square to the edge) and the shared stretch e0..e1 along e."""
    tol, tol_c = 2e-4, 2e-4
    recs, buckets = [], {}
    for ob in objects:
        me = ob.data
        rules = rules_for(ob, jt)
        names = [m.name if m else "" for m in me.materials]
        if not any(n in rules for n in names):
            continue
        mw = ob.matrix_world
        rot = mw.to_3x3()
        sid = solid_ids(me)
        for p in me.polygons:
            if p.material_index >= len(names) or names[p.material_index] not in rules:
                continue
            n = (rot @ p.normal).normalized()
            pts = [mw @ me.vertices[v].co for v in p.vertices]
            c = n.dot(pts[0])
            rec = (ob.name, p.index, sid[p.index], n, c, pts)
            nk = tuple(round(x, 3) for x in n)
            buckets.setdefault((nk, round(c / tol_c)), []).append(len(recs))
            recs.append(rec)
    out = {}
    min_len = jt.get("seam_min_length", 0.02)
    done = set()
    for i, (oa, fa, sa, na, ca, pa) in enumerate(recs):
        nk = tuple(round(x, 3) for x in na)
        ck = round(ca / tol_c)
        for j in [j for k in (ck - 1, ck, ck + 1) for j in buckets.get((nk, k), [])]:
            if j <= i or (i, j) in done:
                continue
            ob_, fb, sb, nb, cb, pb = recs[j]
            if (ob_ == oa and sb == sa) or na.dot(nb) < 1 - 1e-6 or abs(ca - cb) > tol_c:
                continue
            done.add((i, j))
            ctr_a, ctr_b = sum(pa, Vector()) / len(pa), sum(pb, Vector()) / len(pb)
            for k in range(len(pa)):
                p0, p1 = pa[k], pa[(k + 1) % len(pa)]
                if (p1 - p0).length < min_len:
                    continue
                e = (p1 - p0).normalized()
                t = na.cross(e)
                s = t.dot(p0)
                for m in range(len(pb)):
                    q0, q1 = pb[m], pb[(m + 1) % len(pb)]
                    if abs(t.dot(q0) - s) > tol or abs(t.dot(q1) - s) > tol:
                        continue                                       # not on the same line
                    if (t.dot(ctr_a) - s) * (t.dot(ctr_b) - s) >= 0:
                        continue                                       # not on opposite sides of it
                    lo = max(min(e.dot(p0), e.dot(p1)), min(e.dot(q0), e.dot(q1)))
                    hi = min(max(e.dot(p0), e.dot(p1)), max(e.dot(q0), e.dot(q1)))
                    if hi - lo < min_len:
                        continue
                    tc, sc = canonical(t, s)
                    for name, face in ((oa, fa), (ob_, fb)):       # a face may share one line with several pieces
                        lst = out.setdefault(name, {}).setdefault(face, [])
                        if all((tc - t2).length > 1e-4 or abs(sc - s2) > tol or abs(lo - a0) > tol or abs(hi - a1) > tol
                               for t2, s2, _, a0, a1 in lst):
                            lst.append((tc, sc, e.copy(), lo, hi))
    return out


def merge_stretches(recs, tol):
    """One face's seams with the stretches along one line merged where they meet or overlap (a fascia over a pier and the
    lintel beside it is one seam: no ramp, no doubled cut at the meeting point)."""
    norm = []
    for t, s, e, e0, e1 in recs:                                       # one spelling of each line's direction
        ec, _ = canonical(e, 0.0)
        norm.append((t, s, ec, e0, e1) if ec.dot(e) > 0 else (t, s, ec, -e1, -e0))
    out = []
    for t, s, e, e0, e1 in sorted(norm, key=lambda r: r[3]):
        for k, (t2, s2, e2, a0, a1) in enumerate(out):
            if (t - t2).length < 1e-4 and abs(s - s2) < tol and e.dot(e2) > 0.9999 and e0 <= a1 + tol and e1 >= a0 - tol:
                out[k] = (t2, s2, e2, min(a0, e0), max(a1, e1))
                break
        else:
            out.append((t, s, e, e0, e1))
    return out


def cut_joints(ob, jt, joint_mat, seams=None):
    """Cut the stone joints into one object; returns its stats and its layout record (or None if it has no stone).
    seams: {face index: [(t, s, e, e0, e1)]} from seam_joints()."""
    me = ob.data
    names = [m.name if m else "" for m in me.materials]
    rules = rules_for(ob, jt)
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
    foot = min((v.co.z for v in bm.verts), default=0.0)               # the paving a `base` object stands on (a coping
    orig = bm.faces.layers.int.new("rb_orig")                          # on its own body meets it in a seam instead)
    faces = {}                    # orig id -> record of the original stone face
    for i, f in enumerate(bm.faces):
        f[orig] = i
        if f.material_index not in stone_idx:
            continue
        n = f.normal.copy()
        pts = [v.co.copy() for v in f.verts]
        rec = {"n": n, "pts": pts, "slot": names[f.material_index], "z": [], "v": [],     # v: [(t, s)] vertical joint planes
               "s": merge_stretches((seams or {}).get(i, []), tol)}                     # s: [(t, s, e, e0, e1)] seams
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
        if abs(n.z) < 0.1 and rules[rec["slot"]].get("base") and min(p.z for p in pts) < foot + tol:
            e = Vector((-n.y, n.x, 0.0)).normalized()                  # a joint at the foot: its strip from the foot up
            ext = [p.dot(e) for p in pts]
            rec["s"].append((Vector((0.0, 0.0, 1.0)), foot + half, e, min(ext), max(ext)))
        faces[i] = rec
    # a vertical joint carries on over the stone faces it meets square (the soffit or top of a lintel; 2026-10-14: an
    # eased arris and the stone return past it): one face past its own, further only across narrow faces (a bevel, a
    # return), up to joints.carry_hops faces
    adj = {i: {h[orig] for e in f.edges for h in e.link_faces} - {i} for i, f in enumerate(bm.faces) if i in faces}
    narrow = 0.1
    for i in [i for i in faces if faces[i]["v"]]:
        for t, sj in list(faces[i]["v"]):
            front, seen = [i], {i}
            for hop in range(jt.get("carry_hops", 1)):
                nxt = []
                for fid in front:
                    for hid in adj[fid]:
                        if hid in seen or hid not in faces or abs(faces[hid]["n"].dot(t)) > 0.02:
                            continue
                        seen.add(hid)
                        rec = faces[hid]
                        s = [p.dot(t) for p in rec["pts"]]
                        if not (min(s) < sj - clear and max(s) > sj + clear):
                            continue
                        if all(abs(sj - s2) > tol or (t - t2).length > 1e-4 for t2, s2 in rec["v"]):
                            rec["v"].append((t, sj))       # a soffit can meet the same plane from two faces
                        run = rec["n"].cross(t)                     # the joint's direction across this face
                        w = [p.dot(run) for p in rec["pts"]]
                        if max(w) - min(w) <= narrow:
                            nxt.append(hid)
                front = nxt

    def bisect(fs, co, no):
        """Cut faces fs; returns every face they became (bisect_plane's output holds the cut and the uncut ones)."""
        geom = fs + list({e for f in fs for e in f.edges}) + list({v for f in fs for v in f.verts})
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no)    # float32: a vertex an
        # earlier cut put on this plane (a neighbour's cut along a shared edge) reads ~1e-6 off it on a diagonal run
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
    for oid, rec in faces.items():                                     # seams, face by face: the groove's lines, and
        done = []                                                      # where a shared stretch ends inside the face, a
        for t, sj, e, e0, e1 in rec["s"]:                              # short ramp `bevel` long out of it
            if not any((t - t2).length < 1e-4 and abs(sj - s2) < tol for t2, s2 in done):
                done.append((t, sj))
                for off in offsets:
                    by_orig[oid] = bisect(by_orig[oid], t * (sj + off), t)
                    cuts += 1
            ext = [p.dot(e) for p in rec["pts"]]
            for at, step in ((e0, -bev), (e1, bev)):
                if min(ext) + tol < at + min(step, 0.0) and at + max(step, 0.0) < max(ext) - tol:
                    for c in (at, at + step):
                        by_orig[oid] = bisect(by_orig[oid], e * c, e)
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
                or any(abs(co.dot(t) - sj) <= half + tol for t, sj in rec["v"])
                or any(abs(co.dot(t) - sj) <= half + tol and e0 - tol <= co.dot(e) <= e1 + tol for t, sj, e, e0, e1 in rec["s"]))
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
        c0 = rec["n"].dot(rec["pts"][0])
        lines += [seg(t * sj + e * e0 + rec["n"] * c0, t * sj + e * e1 + rec["n"] * c0) for t, sj, e, e0, e1 in rec["s"]]
        layout_faces.append({"slot": rec["slot"], "n": [round(c, 4) for c in rec["n"]],
                             "pts": [[round(c, 4) for c in p] for p in rec["pts"]], "joints": lines})
    stats = {"stone_faces": len(faces), "course_planes": len(planes), "vertical_joints": sum(len(r["v"]) for r in faces.values()),
             "seam_joints": sum(len(r["s"]) for r in faces.values()),
             "bisects": cuts, "joint_floor_faces": floors, "panels": len(panels), "non_manifold": non_manifold,
             "degenerate_faces": degenerate, "non_planar_faces": non_planar}
    return stats, {"object": ob.name, "faces": layout_faces}


def build(plan):
    m = plan["materials"]
    dressed, missing, joint_mat = dress_materials(m)
    jt = dict(m["joints"], repeat_m=m["stone"]["repeat_m"])
    per_object, layout, skipped = {}, [], []
    root = bpy.data.collections.get(L.ROOT)
    named = [bpy.context.scene.objects.get(n) for n in jt.get("objects", {})]      # joints.objects, in any part
    todo = []
    for ob in sorted({*(root.all_objects if root else []), *[o for o in named if o is not None]}, key=lambda o: o.name):
        if ob.type != "MESH":
            continue
        if ob.get("rb_joints"):
            skipped.append(ob.name)
            continue
        todo.append(ob)
    # seams pair the objects cut in this run only: a piece already cut has moved its edges, so a layer rebuilt alone
    # gets its own half of a seam with a piece of another layer (target= rebuilds the whole part and cuts both halves)
    seams = seam_joints(todo, jt) if jt.get("seams") else {}
    for ob in todo:
        stats, rec = cut_joints(ob, jt, joint_mat, seams.get(ob.name))
        if stats is None:
            continue
        per_object[ob.name] = stats
        layout.append(rec)
        for key in ("non_manifold", "degenerate_faces", "non_planar_faces"):
            if stats[key]:
                print(f"WARNING {ob.name}: {stats[key]} {key.replace('_', ' ')} after the joints")
    if layout:                                  # records are per part (the site's tree pits since 2026-10-14): keep the
        part = os.environ.get("TM_RB_PART", "building")         # other parts' and this part's pieces not cut again
        for rec in layout:
            rec["part"] = part
        old = L.C.load_json(JOINT_LAYOUT) if os.path.exists(JOINT_LAYOUT) else {"objects": []}
        keep = [o for o in old.get("objects", []) if o.get("part", "building") != part or o["object"] in skipped]
        os.makedirs(os.path.dirname(JOINT_LAYOUT), exist_ok=True)
        with open(JOINT_LAYOUT, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"joints": {k: jt[k] for k in ("width", "bevel", "depth", "panel_max", "course_target", "seed")},
                       "objects": keep + layout}, fh)
    totals = {k: sum(s[k] for s in per_object.values())
              for k in ("vertical_joints", "seam_joints", "joint_floor_faces", "panels", "non_manifold", "degenerate_faces",
                        "non_planar_faces")}
    return {"layer": LAYER, "dressed": len(dressed), "missing_slots": missing, "jointed_objects": len(per_object),
            "skipped_already_jointed": len(skipped), **totals, "per_object": per_object,
            "names": sorted(per_object)}
