# build_composition.py -- the Bradbury in the REUSABLE CITY (AI 651, 2026-10-17): the composition that replaces
# build_scene.py's one-pass scene. It links the city (city/build_city.py -> tests/artifacts/blender/city/city.blend,
# with its SITE_FURNITURE: the vault covers and the lantern post on the Bradbury's own sidewalk), lays the site's full
# kerb rectangle in the city's materials (city/block_kit.py), links the worn Bradbury block, and adds what the city
# leaves to its compositions: the sun at the Bradbury's light units (city_light_scale 1, exposure 0, sun 8), the
# cameras (build_scene.py's VIEWS), the film and the wear layer's controls. build_scene.py and bradbury_scene.blend
# stay the legacy path.
#
#   blender -b --factory-startup -P build_composition.py -- [wear=on|off|debug] [wear_<feature>=<strength> ...]
#                    [wear_stale=ok] [edges=...] [realism=on|off] [samples=128] [pct=100] [res=1920] [out=<.blend>]
#                    [view ...]
#
# THE BLOCK. The worn block (wear/bradbury_block_worn.blend, as wear_layer.py writes it; wear=off links the untouched
# bradbury_block.blend) is linked BY ITS COLLECTIONS -- every top-level collection of its scene but the inspection
# rig -- onto an excluded shelf, BRADBURY_SOURCE, so the composition holds the block's collections and not a list of
# names. Its objects are then gathered from those collections into the local BRADBURY_BLOCK, and the wear layer's
# controls.organise() sorts the wear-only ones into their local WEAR_* collections, exactly as build_scene.py does:
# the layer switches those collections' visibility (apply(), apply_realism()), which it can only do on local ones.
# A rebuilt block that ADDS objects therefore needs this script rerun (a minute); render_composition.py warns when
# the shelf holds objects BRADBURY_BLOCK does not.
#
# WEAR (the Bradbury's namespace: wear, wear_<feature>, edge_*, wear_realism) is set exactly as build_scene.py sets
# it, the staleness check included; render_composition_wear.py flips a saved composition between the modes.
import bpy, os, sys, time
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CITY_DIR = os.path.normpath(os.path.join(HERE, "..", "city"))
for p in (HERE, CITY_DIR):
    if p not in sys.path: sys.path.insert(0, p)
import city_site as CS
import city_compose as compose
import block_kit
from wear import paths as wear_paths, controls as wear_controls, edges as wear_edges

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
names = [a for a in argv if "=" not in a]
WEAR = args.get("wear", "on").lower()
assert WEAR in ("on", "off", "debug"), f"wear: on | off | debug, not {WEAR}"
SAMPLES = int(args.get("samples", 128)); PCT = int(args.get("pct", 100)); RES = int(args.get("res", 1920))
ART = wear_paths.ART
OUT = os.path.abspath(args.get("out", os.path.join(ART, "bradbury_city_composition.blend" if WEAR == "on"
                                                   else f"bradbury_city_composition_wear_{WEAR}.blend")))
SHOTS = os.path.join(CS.ROOT, "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "composition"
                     + ("" if WEAR == "on" else f"_wear_{WEAR}"))
BLOCK = os.path.join(ART, "bradbury_block.blend")
if WEAR != "off":
    assert os.path.isfile(wear_paths.MANIFEST) and os.path.isfile(wear_paths.WORN_BLOCK), \
        "no worn block yet: run  blender -b -P wear_layer.py  first (or build with wear=off)"
    WEAR_MANIFEST = wear_controls.read_manifest()
    old = wear_controls.stale(WEAR_MANIFEST)
    if old and args.get("wear_stale", "").lower() != "ok":
        raise SystemExit(f"the worn block is older than {', '.join(old)}: rerun  blender -b -P wear_layer.py  "
                         f"(or pass wear_stale=ok to use it as it is)")
    WEAR_MODE, WEAR_STRENGTHS = wear_controls.parse(args, WEAR_MANIFEST, mode_default=WEAR)
    BLOCK = wear_paths.WORN_BLOCK
assert os.path.isfile(BLOCK), f"missing: {BLOCK}"

Z_GROUND, EYE = CS.Z_GROUND, CS.EYE
# build_scene.py's VIEWS, unchanged (from, to, lens[, frame])
VIEWS = {
    "st_corner":  ((41.0, -41.0, Z_GROUND + EYE), (14.6, -15.6, 11.0), 28),
    "st_portal":  ((30.0, 1.40, Z_GROUND + EYE), (17.0, 1.40, 6.5), 35),
    "st_along":   ((24.5, -21.0, Z_GROUND + EYE), (16.9, 6.0, 9.0), 35),
    "st_up":      ((21.5, -6.0, Z_GROUND + EYE), (16.9, -5.0, 16.0), 24),
    "hero_3q":    ((56.0, -50.0, 19.0), (-7.0, 1.0, 9.8), 42),
    "ref_3q":     ((54.12, -38.71, Z_GROUND + 14.4), (17.48, -13.17, 9.76), 40, (3, 2)),
}
GND_MIN_PARTS = 40                              # how many of the block's parts must still stand on Z_GROUND

t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
S.name = "BRADBURY_COMPOSITION"
site = CS.read_site()

# ---------------------------------------------------------------- the city, and the site's own ground
compose.link_city(S, site, furniture=True)
block_kit.full_block(S, site)

# ---------------------------------------------------------------- the block, linked by its collections
# Which collections stand at the top of the block file's scene is read by linking that scene for a moment; its
# collections stay linked (on the shelf) and the linked scene itself is removed again
with bpy.data.libraries.load(BLOCK, link=True, relative=True) as (src, dst):
    dst.scenes = [src.scenes[0]]
lsc = dst.scenes[0]; lib = lsc.library
src_cols = [c for c in lsc.collection.children if c.name != "INSPECTION_RIG"]
rig = [o.name for c in lsc.collection.children if c.name == "INSPECTION_RIG" for o in c.all_objects]
shelf = bpy.data.collections.new("BRADBURY_SOURCE"); S.collection.children.link(shelf)
for c in src_cols:
    shelf.children.link(c)
bpy.data.scenes.remove(lsc)
assert bpy.context.scene == S and len(bpy.data.scenes) == 1, [sc.name for sc in bpy.data.scenes]
compose.layer_collection(S, shelf.name).exclude = True     # the shelf renders nothing: BRADBURY_BLOCK does
seen, objs = set(), []
for c in src_cols:
    for o in c.all_objects:
        if o.name in seen or o.library is not lib: continue
        seen.add(o.name); objs.append(o)
linked = bpy.data.collections.new("BRADBURY_BLOCK"); S.collection.children.link(linked)
n_link = 0
for o in objs:
    if o.type in {'CAMERA', 'LIGHT'}: continue
    linked.objects.link(o); n_link += 1
print(f"BLOCK: {os.path.basename(BLOCK)} linked by {len(src_cols)} collections ({', '.join(c.name for c in src_cols)}): "
      f"{n_link} objects into BRADBURY_BLOCK, the inspection rig's {len(rig)} left out")
if WEAR != "off":
    n_file = WEAR_MANIFEST["objects"]["worn_block_local"]
    assert n_link + len(rig) == n_file, f"gathered {n_link} objects (+ {len(rig)} of the rig) of the worn block's {n_file}"
    wear_controls.organise(linked)
bpy.context.view_layer.update()
bases = [min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.all_objects if o.type == 'MESH']
on_ground = sum(1 for b in bases if abs(b - Z_GROUND) < 0.03)
assert on_ground >= GND_MIN_PARTS, f"only {on_ground} of the block's parts start at {Z_GROUND}: its base has moved"
print(f"BLOCK: {on_ground} parts standing on the pavement top {Z_GROUND}")

# ---------------------------------------------------------------- light, cameras, film, wear
compose.light_units(S, site, "bradbury")
cams = compose.cameras(S, VIEWS, site["cam_clip"])
S.camera = cams["st_corner"]
compose.film(S, SAMPLES, (RES, int(RES * 10 / 16)), PCT)
if WEAR != "off":
    wear_controls.apply(S, WEAR_MODE, WEAR_STRENGTHS)
    wear_edges.apply(S, *wear_edges.parse(args))
    wear_controls.apply_realism(S, wear_controls.parse_realism(args, default=1.0))
S["composition"] = "bradbury"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True, relative_remap=True)
print(f"COMPOSITION SAVED {OUT} | {len(VIEWS)} cameras | wear: {WEAR} | {time.time() - t0:.0f} s")

os.makedirs(SHOTS, exist_ok=True)
for nm in names:
    if nm not in cams: print(f"  no such view: {nm} (have {', '.join(VIEWS)})"); continue
    S.camera = cams[nm]; S.render.filepath = os.path.join(SHOTS, nm + ".png")
    fw, fh = cams[nm].get("frame", (16, 10)); S.render.resolution_y = int(S.render.resolution_x * fh / fw)
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"  {nm}: {time.time() - t:.0f}s -> {S.render.filepath}")
print("COMPOSITION DONE")
