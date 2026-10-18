# proc_plants.py -- AI 629: procedural plants the game's vegetation lacks, as prototypes for collection instances.
#
# The game ships trees and one shrub (assets/public/vegetation_lod0); b8's roof shows small palms and spiky rosettes
# (yucca / cycad-like) against the sky, its street tall palms and its entrance leafy pot plants. All are built here from
# detailed part modules (real leaves, no textures), deterministic per kind and variant:
#   spiky   plant_spiky.py (user fix 12, 2026-10-15): a yucca / dracaena-like head of 70-90 keeled sword leaves (pale
#           clasping bases, brown terminal spines, the oldest drooping, 1-3 dead hanging) on a 0.5-0.75 m leaf-scarred
#           trunk; about 1.2-1.3 m tall, radius 0.5 m
#   palm    the detailed palm (palm_tree.py, 2026-10-14) at roof scale: a 1.2-1.45 m trunk with its root base and boots
#           under a narrow shuttlecock crown of 12-14 upright fronds with real leaflets, about 2.3-2.45 m tall, radius
#           0.51-0.56 m (no longer instanced on the roof since 2026-10-15)
#   street_palm  the detailed palm at street scale (AI 633, detailed 2026-10-14): a slender 7 m leaning trunk under a
#           crown of 26-30 fronds of up to 2.75 m, the young upright, the mature arching, the old drooping below level,
#           1-2 dead ones hanging under it; about 10 m tall, radius 2.1-2.3 m (b8's frontage palms)
#   cycad   plant_cycad.py (user fix 12): 28-34 stiff pinnate fronds (palm_frond.py's frond with 40-60 keeled leaflets
#           per side) in two flushes out of a felt dome on a short trunk armoured with diamond leaf bases; about 1.45-1.5 m
#           tall, radius 0.92-0.97 m (the roof's corner clusters and the entrance pots outside the portal)
#   broadleaf  plant_broadleaf.py (user fix 12): a bird-of-paradise clump, 5-6 fans of paddle leaves on long petioles,
#           split along their veins, leaning to one side (local -x, the open side of a portal corner); about 1.7 m tall
#           (the pots inside the entrance portal)
# ensure(kind, k) builds (or rebuilds) collection RBP_proc_<kind>_<k> under RB_PROP_PROTOTYPES with the same custom
# properties the game prototypes carry (rb_model, rb_height, rb_radius), so the layers fit them to target sizes the same
# way; their leaf material names end with _foliage (the clearance checks sample those vertices). Every kind carries
# rb_fit_aniso: layer_roof_planters.fit_scales keeps an instance's xy / z scale ratio within it (never past either
# target), so the fitting cannot squash a crown or stretch a trunk -- real leaves would show it. The rosettes and
# cycads (0.25) leave the layouts' slender targets more room than the palms (0.10) and the broadleaf (0.15).
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
import palm_tree  # noqa: E402
import plant_shading  # noqa: E402
import plant_cycad  # noqa: E402
import plant_spiky  # noqa: E402
import plant_broadleaf  # noqa: E402

for _mod in (palm_tree, plant_shading, plant_cycad, plant_spiky, plant_broadleaf):
    importlib.reload(_mod)

PROTOTYPES = "RB_PROP_PROTOTYPES"
DETAILED = {"palm": "roof", "street_palm": "street"}      # kind -> palm_tree.py scale
# kind -> (builder, materials, xy / z fitting tolerance)
PLANTS = {"cycad": (plant_cycad.build_cycad, plant_cycad.materials, 0.30),
          "spiky": (plant_spiky.build_spiky, plant_spiky.materials, 0.25),
          "broadleaf": (plant_broadleaf.build_broadleaf, plant_broadleaf.materials, 0.15)}
FIT_ANISO = 0.10                                         # the detailed palms' xy / z fitting tolerance


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
    if kind in DETAILED:                       # one welded mesh with its own UVs, creases and attributes
        info = palm_tree.build_palm(bm, rng, scale=DETAILED[kind])
        me = palm_tree.to_mesh(name, bm, palm_tree.materials())
        coll["rb_fit_aniso"] = FIT_ANISO
    elif kind in PLANTS:
        build, mats, aniso = PLANTS[kind]
        info = build(bm, rng)
        me = palm_tree.to_mesh(name, bm, mats())
        coll["rb_fit_aniso"] = aniso
    else:
        bm.free()
        raise SystemExit(f"proc_plants: unknown kind {kind!r} (known: {sorted(DETAILED) + sorted(PLANTS)})")
    bm.free()
    coll["rb_tris"] = info["tris"]
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    leaf = [v.co for v in me.vertices]
    coll["rb_model"] = f"proc/{kind}_{k}"
    coll["rb_height"] = max(c.z for c in leaf)
    coll["rb_radius"] = max(math.hypot(c.x, c.y) for c in leaf)
    return coll
