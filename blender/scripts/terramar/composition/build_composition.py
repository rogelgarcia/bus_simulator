# build_composition.py -- Terra & Mar in the REUSABLE CITY (AI 651, 2026-10-17; user: "the composition will put the
# city (as import) and the building (as import) ... the composition will also finish the block, adding the sidewalk
# curbs etc"). It replaces build_city_scene.py, which copied the Bradbury's whole scene; that script stays the legacy
# path until the user retires it.
#
#   blender -b --factory-startup -P build_composition.py -- [wear=on|off|debug] [wear_strengths=name:v,...] [out=<.blend>]
#                                                          [furniture=1]  (the Bradbury's site furniture, as the legacy copy had it)
#
# In a fresh file:
#   1. LINKS the city (city/build_city.py -> blender_files/city/city.blend): its GROUND, CONTEXT, CITY and
#      NEIGHBOURS collections and its world, by the names in site.json; the Bradbury's site furniture is not linked;
#   2. finishes the site with city/block_kit.py: the sidewalk and worn kerb round the rear parking lot and its
#      driveway, the bays painted in the city's line paint (the legacy city_ground.py, moved into the kit);
#   3. LINKS the Terra & Mar part collections (city_common.PARTS) and stands each one as a collection instance in
#      TERRAMAR, turned and moved by the placement (city_common: the entrance on the Broadway / 3rd Street corner), and
#      instances each of TM_WEAR's feature collections on its own (composition_wear.py), so the wear module's strength
#      0 removes an overlay as it does in the module's own scenes; every site prop is checked to stand on the sidewalk;
#   4. sets the light units (city_site: city_light_scale 2^4.2905, exposure -4.2905, the sun 8 x that), the film and
#      the wear switch (rebuild/wear/controls.apply, every feature at its default), and saves
#      city_common.COMPOSITION_BLEND.
# A rebuilt city or rebuilt part needs no rerun: both are linked. render_city_shots.py, render_flyover.py and
# front_line.py open the composition.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import math
import os
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CITY_DIR = BP.script('city/.')
for p in (HERE, CITY_DIR, BP.script('terramar/building/rebuild')):
    if p not in sys.path:
        sys.path.insert(0, os.path.normpath(p))
import city_common as C  # noqa: E402
import city_site as CS  # noqa: E402
import city_compose as compose  # noqa: E402
import block_kit  # noqa: E402
import composition_wear  # noqa: E402

args, _ = C.parse_args(sys.argv)
OUT = os.path.abspath(args.get("out", C.COMPOSITION_BLEND))
WEAR = args.get("wear", "on").lower()
FURNITURE = args.get("furniture", "0") == "1"   # the Bradbury's vault covers and lantern post too (the legacy copy kept them)
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
S.name = "TERRAMAR_COMPOSITION"
site = CS.read_site()

# ---------------------------------------------------------------- 1-2. the city, and the site's ground with its lot
compose.link_city(S, site, furniture=FURNITURE, log=lambda m: print("COMP: " + m))
LOT, KERB_RECT = block_kit.lotted_block(S, site, log=lambda m: print("COMP: " + m))

# ---------------------------------------------------------------- 3. Terra & Mar in
tm = bpy.data.collections.new("TERRAMAR"); S.collection.children.link(tm)
protos = bpy.data.collections.new("TERRAMAR_PARTS")   # the linked sources, excluded: they render only as the instances
S.collection.children.link(protos)
wear_col = bpy.data.collections.new(composition_wear.WEAR_INSTANCES); S.collection.children.link(wear_col)
with bpy.data.libraries.load(C.BUILDING_ENTRY, link=True, relative=True) as (src, dst):
    assert "TERRAMAR_BUILDING" in src.collections, f"missing TERRAMAR_BUILDING in {C.BUILDING_ENTRY}"
    dst.collections = ["TERRAMAR_BUILDING"]
entry = dst.collections[0]
protos.children.link(entry)
entry_collections = {}
pending = [entry]
while pending:
    collection = pending.pop()
    entry_collections[collection.name] = collection
    pending.extend(collection.children)


def instance(name, coll, col):
    inst = bpy.data.objects.new(name, None)
    inst.instance_type = 'COLLECTION'; inst.instance_collection = coll
    inst.rotation_euler = (0.0, 0.0, math.radians(C.ROT_DEG))
    inst.location = C.OFFSET
    col.objects.link(inst)
    return inst


n_parts = 0
for name, fname in C.PARTS.items():
    if name not in entry_collections:
        assert name in C.OPTIONAL_PARTS, f"missing collection {name} in {C.BUILDING_ENTRY}"
        print(f"COMP: no {fname}; {name} left out"); continue
    coll = entry_collections[name]
    if name == "TM_WEAR":
        # one instance per overlay collection (composition_wear.py): the switch shows and hides them one by one
        kids = list(coll.children)
        assert not coll.objects, f"TM_WEAR holds objects of its own: {[o.name for o in coll.objects][:5]}"
        for k in kids:
            instance(k.name, k, wear_col)
        print(f"COMP: TM_WEAR from {fname}: {', '.join(f'{k.name} ({len(k.all_objects)})' for k in kids)}, each instanced on its own")
    else:
        instance(f"TM_{name}", coll, tm)
        print(f"COMP: {name} from {fname}: {len(coll.all_objects)} objects, instanced at "
              f"{tuple(round(v, 3) for v in C.OFFSET)} turned {C.ROT_DEG:g}")
    n_parts += 1
protos.hide_render = True
compose.layer_collection(S, protos.name).exclude = True

# every site prop on the sidewalk: each object's vertices (its box when large), through the instance
bpy.context.view_layer.update()
off = 0
for inst in tm.objects:
    if not inst.name.startswith("TM_RB_SITE"):
        continue
    for o in inst.instance_collection.all_objects:
        if o.type not in {'MESH', 'EMPTY', 'CURVE', 'LIGHT'}:
            continue
        mw = inst.matrix_world @ o.matrix_world
        if o.type == 'MESH' and len(o.data.vertices) < 50000:
            pts = [mw @ v.co for v in o.data.vertices]
        else:
            pts = [mw @ Vector(c) for c in o.bound_box] if o.type != 'LIGHT' else [mw.translation]
        bad = [q for q in pts if not block_kit.inside_sidewalk(q.x, q.y, *KERB_RECT, LOT, margin=0.1)]
        if bad and o.type == 'MESH' and len(o.data.vertices) and max(o.dimensions) < 60:
            off += 1
            print(f"COMP: WARNING site prop {o.name} leaves the sidewalk at ({bad[0].x:.2f}, {bad[0].y:.2f})")
print(f"COMP: site props checked against the sidewalk: {off} off it")

# ---------------------------------------------------------------- 4. light, film, wear
compose.light_units(S, site, "terramar", log=lambda m: print("COMP: " + m))
compose.film(S, 128, (3840, 2160))
composition_wear.switch(S, WEAR, args.get("wear_strengths"), log=lambda m: print("COMP: " + m))
S["composition"] = "terramar"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0  # external verified backup is required before replacement
bpy.ops.wm.save_as_mainfile(filepath=OUT, relative_remap=True, compress=True)
print(f"COMP: {n_parts} Terra & Mar parts placed; saved {OUT} in {time.time() - t0:.0f} s")
print("COMP DONE")
