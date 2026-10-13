# proc_plants.py -- AI 629: procedural plants the game's vegetation lacks, as prototypes for collection instances.
#
# The game ships trees and one shrub (assets/public/vegetation_lod0); b8's roof shows small palms and spiky rosettes
# (yucca / cycad-like) against the sky. Both are built here as plain geometry (no textures), deterministic per variant:
#   spiky   a short trunk under a rosette of ~40 narrow arching blades (golden-angle spiral, older blades lower and
#           drooping), about 1.0 m tall, 0.6-0.8 m across
#   palm    a slim leaning trunk (1.0-1.4 m) under a crown of ~15 fronds, each a folded tapered strip curving down along
#           its rachis, about 2.2 m tall, 1.8 m across
#   cycad   the palm's build with a short stout trunk and a dense crown of ~21 fronds from upright to level (sago palm /
#           pygmy date-like): the bushy spiky masses b8 shows at the roof corners, about 1.4 m tall, 1.6 m across
# ensure(kind, k) builds (or rebuilds) collection RBP_proc_<kind>_<k> under RB_PROP_PROTOTYPES with the same custom
# properties the game prototypes carry (rb_model, rb_height, rb_radius), so the layers fit them to target sizes the same
# way; their leaf material names end with _foliage (the clearance checks sample those vertices).
import math
import random

import bmesh
import bpy
from mathutils import Vector

PROTOTYPES = "RB_PROP_PROTOTYPES"
LOOKS = {"RBP_proc_spiky_foliage": ((0.15, 0.27, 0.07), 0.50), "RBP_proc_palm_foliage": ((0.13, 0.25, 0.06), 0.45),
         "RBP_proc_cycad_foliage": ((0.11, 0.23, 0.05), 0.40),
         "RBP_proc_trunk": ((0.21, 0.165, 0.12), 0.90)}


def material(name):
    rgb, rough = LOOKS[name]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def trunk(bm, slot, height, r0, r1, lean, sides=8, rings=6):
    """A tapered trunk from z 0 to height, leaning along +x by lean * (z / height)^2."""
    loops = []
    for j in range(rings + 1):
        t = j / rings
        z, r = height * t, r0 + (r1 - r0) * t
        cx = lean * t * t
        loops.append([bm.verts.new((cx + r * math.cos(2 * math.pi * k / sides), r * math.sin(2 * math.pi * k / sides), z))
                      for k in range(sides)])
    for a, b in zip(loops, loops[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])).material_index = slot
    bm.faces.new(list(reversed(loops[0]))).material_index = slot
    bm.faces.new(loops[-1]).material_index = slot
    return Vector((lean, 0.0, height))


def direction(elev, az):
    return Vector((math.cos(elev) * math.cos(az), math.cos(elev) * math.sin(az), math.sin(elev)))


def spiky(bm, rng):
    top = trunk(bm, 1, rng.uniform(0.15, 0.55), 0.07, 0.05, rng.uniform(-0.04, 0.04), sides=6, rings=3)
    n = rng.randint(34, 46)
    for i in range(n):
        frac = i / (n - 1)
        az = i * 2.39996 + rng.uniform(-0.15, 0.15)
        elev = math.radians(82.0 - 72.0 * frac ** 0.9 + rng.uniform(-6.0, 6.0))
        length = rng.uniform(0.55, 0.85) * (1.0 - 0.15 * frac)
        droop = math.radians(5.0 + 28.0 * frac)
        side = Vector((-math.sin(az), math.cos(az), 0.0))
        p0 = top + direction(0.0, az) * 0.03
        p1 = p0 + direction(elev, az) * length * 0.5
        p2 = p1 + direction(elev - droop, az) * length * 0.5
        w0, w1 = 0.045, 0.034
        vs = [bm.verts.new(p0 - side * w0 / 2), bm.verts.new(p0 + side * w0 / 2), bm.verts.new(p1 + side * w1 / 2),
              bm.verts.new(p1 - side * w1 / 2), bm.verts.new(p2)]
        bm.faces.new((vs[0], vs[1], vs[2], vs[3])).material_index = 0
        bm.faces.new((vs[3], vs[2], vs[4])).material_index = 0


PALMS = {"palm": {"trunk": (1.0, 1.4), "r": (0.10, 0.075), "lean": 0.15, "fronds": (14, 17), "length": (1.0, 1.3),
                  "elev": (62.0, 72.0), "curl": 38.0},
         "cycad": {"trunk": (0.25, 0.6), "r": (0.13, 0.11), "lean": 0.04, "fronds": (18, 24), "length": (0.85, 1.1),
                   "elev": (72.0, 70.0), "curl": 30.0}}


def palm(bm, rng, kind="palm"):
    c = PALMS[kind]
    top = trunk(bm, 1, rng.uniform(*c["trunk"]), c["r"][0], c["r"][1], rng.uniform(-c["lean"], c["lean"]), sides=8, rings=6)
    n = rng.randint(*c["fronds"])
    stations = 6
    for i in range(n):
        frac = i / (n - 1)
        az = i * 2.39996 + rng.uniform(-0.2, 0.2)
        elev0 = math.radians(c["elev"][0] - c["elev"][1] * frac + rng.uniform(-8.0, 8.0))
        length = rng.uniform(*c["length"])
        side = Vector((-math.sin(az), math.cos(az), 0.0))
        p = top + direction(0.0, az) * 0.05
        rows = []
        for j in range(stations + 1):
            t = j / stations
            if j:
                elev = elev0 - math.radians(c["curl"]) * t ** 1.5
                p = p + direction(elev, az) * length / stations
            w = 0.02 if t < 0.08 else 0.32 * math.sin(math.pi * min(t * 1.08, 1.0)) ** 0.6
            fold = Vector((0.0, 0.0, -0.18 * w))                     # the leaflets hang either side of the rachis
            rows.append([bm.verts.new(p - side * w / 2 + fold), bm.verts.new(p), bm.verts.new(p + side * w / 2 + fold)])
        for a, b in zip(rows, rows[1:]):
            bm.faces.new((a[0], a[1], b[1], b[0])).material_index = 0
            bm.faces.new((a[1], a[2], b[2], b[1])).material_index = 0


def ensure(kind, k):
    """Collection RBP_proc_<kind>_<k> with the plant (rebuilt every call: deterministic per kind and k)."""
    name = f"RBP_proc_{kind}_{k}"
    root = bpy.data.collections.get(PROTOTYPES) or bpy.data.collections.new(PROTOTYPES)
    if root.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(root)
    coll = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if coll.name not in root.children:
        root.children.link(coll)
    for ob in list(coll.objects):
        me = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
    rng = random.Random(f"proc:{kind}:{k}")
    bm = bmesh.new()
    if kind == "spiky":
        spiky(bm, rng)
    else:
        palm(bm, rng, kind)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uv].uv = (lp.vert.co.x + lp.vert.co.y, lp.vert.co.z)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(f"RBP_proc_{kind}_foliage"))
    me.materials.append(material("RBP_proc_trunk"))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    leaf = [v.co for v in me.vertices]
    coll["rb_model"] = f"proc/{kind}_{k}"
    coll["rb_height"] = max(c.z for c in leaf)
    coll["rb_radius"] = max(math.hypot(c.x, c.y) for c in leaf)
    return coll
