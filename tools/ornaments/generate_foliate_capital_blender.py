# tools/ornaments/generate_foliate_capital_blender.py
# AI 510 prep: procedurally models the stylized Corinthian (foliate) capital
# test ornament and exports assets/ornaments/foliate_capital.glb.
#
# Run headless from the repo root (Blender 4/5):
#   blender -b -P tools/ornaments/generate_foliate_capital_blender.py
#
# Anatomy (meters, origin at the base center, +Z up in Blender -> Y-up GLB):
#   bell (kalathos) 0.44 tall, two staggered rows of 8 acanthus leaves with
#   scalloped edges and out-curling tips, astragal neck ring, corner scroll
#   volutes (drum + spiral ridge) under the abacus corners, chamfered flared
#   abacus with an 8-petal rosette on each face. ~13k tris, one material
#   ("OrnamentStone") for the engine to re-skin per part config.
import bpy
import math
import os
from mathutils import Vector

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'assets', 'ornaments')

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
COL = bpy.context.collection

mat = bpy.data.materials.new('OrnamentStone')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (0.55, 0.42, 0.33, 1.0)
bsdf.inputs['Roughness'].default_value = 0.85


def make_mesh(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    COL.objects.link(ob)
    return ob


def style(ob):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True


def catmull(points, t):
    n = len(points) - 1
    f = min(max(t, 0.0), 1.0) * n
    i = min(int(f), n - 1)
    u = f - i
    p0 = points[max(i - 1, 0)]
    p1 = points[i]
    p2 = points[i + 1]
    p3 = points[min(i + 2, n)]

    def cr(a, b, c, d):
        return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3)

    return (cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]))


# ---- acanthus leaves: parametric grids wrapped around the capital axis ----
def leaf(name, spine, half_arc, lobes=3, cup=0.022, nT=12, nS=7):
    verts = []
    faces = []
    for it in range(nT + 1):
        t = it / nT
        r, y = catmull(spine, t)
        w = math.sin(math.pi * min(1.0, 0.12 + t * 0.82)) ** 0.75
        for isv in range(nS + 1):
            s = isv / nS * 2.0 - 1.0
            ripple = 1.0 + 0.14 * math.sin(t * lobes * math.pi * 2.0) * t * abs(s)
            ang = s * half_arc * w * ripple
            rr = r + cup * (s * s) * (0.35 + 0.65 * t)
            rr += 0.006 * math.sin(s * 3.0 * math.pi) * t
            yy = y - 0.014 * (s * s) * (0.3 + 0.7 * t)
            verts.append((rr * math.sin(ang), rr * math.cos(ang), yy))
    for it in range(nT):
        for isv in range(nS):
            a = it * (nS + 1) + isv
            faces.append((a, a + 1, a + nS + 2, a + nS + 1))
    ob = make_mesh(name, verts, faces)
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.010
    mod.offset = 0.0
    return ob


SPINE_LOW = [(0.135, 0.00), (0.146, 0.09), (0.158, 0.17), (0.186, 0.235), (0.232, 0.265), (0.262, 0.245)]
SPINE_TALL = [(0.135, 0.00), (0.148, 0.13), (0.163, 0.245), (0.192, 0.335), (0.238, 0.385), (0.272, 0.362)]
for i in range(8):
    leaf(f'leaf_lo_{i}', SPINE_LOW, half_arc=0.42, lobes=3).rotation_euler = (0, 0, i * math.tau / 8.0)
for i in range(8):
    leaf(f'leaf_hi_{i}', SPINE_TALL, half_arc=0.34, lobes=4).rotation_euler = (0, 0, (i + 0.5) * math.tau / 8.0)

# ---- bell (kalathos) ----
profile = [(0.125, 0.00), (0.132, 0.04), (0.138, 0.14), (0.150, 0.26), (0.168, 0.35), (0.186, 0.41), (0.196, 0.435)]
NSEG = 24
verts = []
faces = []
for j, (r, z) in enumerate(profile):
    for i in range(NSEG):
        a = i * math.tau / NSEG
        verts.append((r * math.sin(a), r * math.cos(a), z))
for j in range(len(profile) - 1):
    for i in range(NSEG):
        a = j * NSEG + i
        b = j * NSEG + (i + 1) % NSEG
        faces.append((a, b, (j + 1) * NSEG + (i + 1) % NSEG, (j + 1) * NSEG + i))
bi = len(verts)
verts.append((0, 0, 0.0))
ti = len(verts)
verts.append((0, 0, 0.435))
for i in range(NSEG):
    faces.append((bi, (i + 1) % NSEG, i))
    top0 = (len(profile) - 1) * NSEG
    faces.append((ti, top0 + i, top0 + (i + 1) % NSEG))
make_mesh('bell', verts, faces)

# ---- astragal neck ring ----
bpy.ops.mesh.primitive_torus_add(major_radius=0.135, minor_radius=0.016, major_segments=28, minor_segments=10, location=(0, 0, 0.015))
style(bpy.context.active_object)
bpy.context.active_object.name = 'astragal'

# ---- abacus: flared chamfered slab ----
ab_h = 0.075
ab_z = 0.44
half = 0.235
av = []
for (hh, zz) in [(half - 0.028, ab_z), (half, ab_z + ab_h)]:
    av += [(-hh, -hh, zz), (hh, -hh, zz), (hh, hh, zz), (-hh, hh, zz)]
af = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (3, 2, 1, 0), (4, 5, 6, 7)]
abacus = make_mesh('abacus', av, af)
bev = abacus.modifiers.new('bev', 'BEVEL')
bev.width = 0.012
bev.segments = 2


# ---- corner volutes: scroll drum + spiral ridge on its outward face ----
def volute(name, corner_angle):
    diag = Vector((math.sin(corner_angle), math.cos(corner_angle), 0.0))
    side = Vector((math.cos(corner_angle), -math.sin(corner_angle), 0.0))
    center = diag * 0.252 + Vector((0, 0, 0.385))

    bpy.ops.mesh.primitive_cylinder_add(radius=0.048, depth=0.045, vertices=20, location=center)
    drum = bpy.context.active_object
    drum.name = f'{name}_drum'
    drum.rotation_mode = 'QUATERNION'
    drum.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(diag)
    style(drum)

    NT = 36
    NC = 8
    verts = []
    faces = []
    face_center = center + diag * 0.028
    for i in range(NT + 1):
        th = i / NT * math.tau * 1.9
        rho = 0.004 + 0.040 * (1.0 - i / NT)
        lp = face_center + side * (rho * math.sin(th + 1.2)) + Vector((0, 0, rho * math.cos(th + 1.2)))
        rr = 0.011 - 0.005 * (i / NT)
        for c in range(NC):
            ca = c * math.tau / NC
            rad_dir = side * math.sin(th + 1.2) + Vector((0, 0, math.cos(th + 1.2)))
            p = lp + diag * (rr * math.cos(ca)) + rad_dir * (rr * math.sin(ca))
            verts.append((p.x, p.y, p.z))
    for i in range(NT):
        for c in range(NC):
            a = i * NC + c
            b = i * NC + (c + 1) % NC
            faces.append((a, b, (i + 1) * NC + (c + 1) % NC, (i + 1) * NC + c))
    make_mesh(f'{name}_spiral', verts, faces)


for i in range(4):
    volute(f'volute_{i}', (i + 0.5) * math.tau / 4.0)


# ---- rosette on each abacus face ----
def rosette(name, face_angle):
    n = Vector((math.sin(face_angle), math.cos(face_angle), 0.0))
    t = Vector((math.cos(face_angle), -math.sin(face_angle), 0.0))
    center = n * 0.242 + Vector((0, 0, 0.474))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.017, segments=10, ring_count=8, location=center)
    core = bpy.context.active_object
    core.name = f'{name}_core'
    core.scale = (1 - abs(n.x) * 0.55, 1 - abs(n.y) * 0.55, 1.0)
    style(core)
    for pnum in range(8):
        pa = pnum * math.tau / 8.0
        pc = center + t * (0.030 * math.cos(pa)) + Vector((0, 0, 0.030 * math.sin(pa)))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.013, segments=8, ring_count=6, location=pc)
        pet = bpy.context.active_object
        pet.name = f'{name}_p{pnum}'
        pet.scale = (1 - abs(n.x) * 0.6, 1 - abs(n.y) * 0.6, 1.0)
        style(pet)


for i in range(4):
    rosette(f'rosette_{i}', i * math.tau / 4.0)

# ---- join, apply, export ----
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
cap = bpy.context.active_object
cap.name = 'foliate_capital'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.join(OUT_DIR, 'foliate_capital.glb')
bpy.ops.object.select_all(action='DESELECT')
cap.select_set(True)
bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_yup=True)
print('exported', out_path)
