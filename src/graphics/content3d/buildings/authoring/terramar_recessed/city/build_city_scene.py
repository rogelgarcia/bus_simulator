# build_city_scene.py -- Terra & Mar in the Bradbury's city (2026-10-16; user: "create a copy of the city scenario from
# bradbury, replace the bradbury building with the terra & mar building").
#
#   blender -b --factory-startup -P build_city_scene.py -- [src=<bradbury scene .blend>] [out=<.blend>] [wear=on|off]
#
# Opens the Bradbury's saved render scene (city_common.BRADBURY_SCENE: the sky, sun, haze, streets, kerbs, context,
# neighbour, furniture and city, everything BradburyBlock/build_scene.py builds), and in memory:
#   1. removes the BRADBURY_BLOCK collection (the linked worn block, its wear-only children) and the Bradbury's own
#      cameras, then purges what nothing uses any more (the block's library);
#   2. rebuilds the block's sidewalk and worn kerb in the Bradbury's own materials round a parking lot at the back
#      (city_ground.py);
#   3. LINKS the Terra & Mar part collections (city_common.PARTS) and stands each one as a collection instance in a
#      TERRAMAR collection, turned and moved by the placement (city_common: the entrance on the Broadway / 3rd Street
#      corner). Linking whole collections, not objects, means a part rebuilt with new objects shows up the next time
#      the copy is opened -- the trap the Bradbury's object-linked scene had. Every site prop (café sets, palms, pots,
#      lamps) is checked to stand on the sidewalk, clear of the kerb's top and of the lot;
#   4. sets the Terra & Mar wear switch on the scene (rebuild/wear/controls.apply, every feature at its default);
#   5. rescales the light (city_common's light scale): exposure -4.29 and every Bradbury light source x 2^4.29;
#   6. saves the copy as city_common.CITY_BLEND (relative paths). The Bradbury's file is never saved.
# Rerun it after the Bradbury's build_scene.py rebuilds its scene; Terra & Mar part rebuilds need no rerun.
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, "..", "rebuild")):
    if p not in sys.path:
        sys.path.insert(0, os.path.normpath(p))
import city_common as C  # noqa: E402
import city_ground  # noqa: E402

args, _ = C.parse_args(sys.argv)
SRC = os.path.abspath(args.get("src", C.BRADBURY_SCENE))
OUT = os.path.abspath(args.get("out", C.CITY_BLEND))
WEAR = args.get("wear", "on").lower()
assert os.path.isfile(SRC), f"no Bradbury scene at {SRC}: build it with BradburyBlock/build_scene.py"
assert os.path.normcase(SRC) != os.path.normcase(OUT), "never write over the Bradbury's scene"

bpy.ops.wm.open_mainfile(filepath=SRC)
S = bpy.context.scene
print(f"CITY: opened {SRC} (scene {S.name})")

# ---------------------------------------------------------------- 1. the Bradbury out
block = bpy.data.collections.get("BRADBURY_BLOCK")
assert block is not None, "the Bradbury scene has no BRADBURY_BLOCK collection"
n_obj = len(block.all_objects)
for ch in list(block.children_recursive):
    bpy.data.collections.remove(ch)
bpy.data.collections.remove(block)
n_cam = 0
for o in list(bpy.data.objects):
    if o.type == 'CAMERA' and o.library is None:
        bpy.data.objects.remove(o, do_unlink=True); n_cam += 1
for _ in range(3):
    bpy.context.view_layer.update()       # the view layer's bases still name the removed objects until updated
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
# The purge leaves the block's linked objects in memory (users 0 yet still named by the scene's bases), and with them
# the whole library chain the worn block pulled in. Those libraries are removed outright, once nothing LOCAL uses any of
# their data: the scene's own context library (trees, the lantern post) stays.
KEEP_LIBS = ("context_library",)
drop = [lib for lib in bpy.data.libraries if not any(k in lib.filepath for k in KEEP_LIBS)]
umap = bpy.data.user_map()
for lib in drop:
    for ids in (bpy.data.materials, bpy.data.node_groups, bpy.data.images, bpy.data.meshes, bpy.data.objects, bpy.data.collections):
        for idb in ids:
            if idb.library is lib:
                local = [u for u in umap.get(idb, ()) if getattr(u, "library", None) is None and not isinstance(u, bpy.types.Scene)]
                assert not local, f"{idb.name} of {lib.filepath} is still used by {[u.name for u in local][:5]}"
for lib in drop:
    print(f"CITY: removing library {lib.filepath}")
    bpy.data.libraries.remove(lib)
bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
left = [lib.filepath for lib in bpy.data.libraries]
print(f"CITY: removed the Bradbury block ({n_obj} objects) and {n_cam} cameras; libraries left: {left}")
assert not any("bradbury_block" in p for p in left), f"the block's library is still in use: {left}"

# ---------------------------------------------------------------- 2. the block's sidewalk, kerb and parking lot
LOT, KERB_RECT = city_ground.build(S, log=lambda m: print("CITY: " + m))

# ---------------------------------------------------------------- 3. Terra & Mar in
S.name = "TERRAMAR_CITY"
tm = bpy.data.collections.new("TERRAMAR")
S.collection.children.link(tm)
protos = bpy.data.collections.new("TERRAMAR_PARTS")   # the linked sources, excluded: they render only as the instances
S.collection.children.link(protos)
n_parts = 0
for name, fname in C.PARTS.items():
    path = os.path.join(C.REBUILD_DIR, fname)
    if not os.path.isfile(path):
        assert name in C.OPTIONAL_PARTS, f"missing part {path} (rebuild/build.py)"
        print(f"CITY: no {fname}; {name} left out"); continue
    with bpy.data.libraries.load(path, link=True, relative=True) as (src, dst):
        assert name in src.collections, f"{fname} has no collection {name}"
        dst.collections = [name]
    coll = dst.collections[0]
    protos.children.link(coll)
    inst = bpy.data.objects.new(f"TM_{name}", None)
    inst.instance_type = 'COLLECTION'; inst.instance_collection = coll
    inst.rotation_euler = (0.0, 0.0, math.radians(C.ROT_DEG))
    inst.location = C.OFFSET
    tm.objects.link(inst); n_parts += 1
    print(f"CITY: {name} from {fname}: {len(coll.all_objects)} objects, instanced at {tuple(round(v, 3) for v in inst.location)} "
          f"turned {C.ROT_DEG:g}")
protos.hide_render = True
for vl in S.view_layers:
    for lc in vl.layer_collection.children:
        if lc.collection is protos:
            lc.exclude = True

# every site prop on the sidewalk: each object's vertices (its box when large), through the instance, inside the pavement
bpy.context.view_layer.update()
off = 0
for inst in tm.objects:
    if not inst.name.startswith("TM_RB_SITE"):
        continue
    for o in inst.instance_collection.all_objects:
        if o.type not in {'MESH', 'EMPTY', 'CURVE', 'LIGHT'}:
            continue
        mw = inst.matrix_world @ o.matrix_world
        if o.type == 'MESH' and len(o.data.vertices) < 50000:   # the vertices themselves: one mesh may hold many pits or pots
            pts = [mw @ v.co for v in o.data.vertices]
        else:
            pts = [mw @ C.Vector(c) for c in o.bound_box] if o.type != 'LIGHT' else [mw.translation]
        bad = [q for q in pts if not city_ground.inside_sidewalk(q.x, q.y, *KERB_RECT, LOT, margin=0.1)]
        if bad and o.type == 'MESH' and len(o.data.vertices) and max(o.dimensions) < 60:
            off += 1
            print(f"CITY: WARNING site prop {o.name} leaves the sidewalk at ({bad[0].x:.2f}, {bad[0].y:.2f})")
print(f"CITY: site props checked against the sidewalk: {off} off it")

# ---------------------------------------------------------------- 4. the wear switch
from wear import controls as wear_controls  # noqa: E402
if WEAR == "off":
    wear_controls.clear(S)
else:
    wear_controls.apply(S, WEAR)

# ---------------------------------------------------------------- 5. the light scale
k = C.LIGHT_SCALE
S.view_settings.exposure = C.EXPOSURE
scaled = []
for o in bpy.data.objects:
    if o.type == 'LIGHT' and o.library is None and o.data.library is None:
        o.data.energy *= k; scaled.append(o.name)
for nt in [S.world.node_tree] + [g for g in bpy.data.node_groups if g.library is None and g.bl_idname == 'ShaderNodeTree']:
    for n in nt.nodes:
        if n.type in ('BACKGROUND', 'EMISSION') and not n.inputs["Strength"].is_linked:
            n.inputs["Strength"].default_value *= k; scaled.append(f"{nt.name}:{n.name}")
for m in bpy.data.materials:
    if m.library is None and m.node_tree is not None:
        for n in m.node_tree.nodes:
            if n.type == 'EMISSION' or (n.type == 'BSDF_PRINCIPLED' and n.inputs["Emission Strength"].default_value > 0.0
                                        and any(n.inputs["Emission Color"].default_value[:3])):
                print(f"CITY: WARNING a local emissive material not scaled: {m.name}")
print(f"CITY: exposure {C.EXPOSURE:.4f}, light sources x {k:.3f}: {', '.join(scaled)}")

# ---------------------------------------------------------------- 6. save the copy
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, relative_remap=True, compress=True)
print(f"CITY: {n_parts} Terra & Mar parts placed; saved {OUT}")
print("CITY DONE")
