# render_composition.py -- stills of the Bradbury's city composition (AI 651, 2026-10-17): the stills half of
# build_scene.py's "build and render", without the build. Opens bradbury_city_composition.blend (build_composition.py),
# never saves it, renders the views asked for from its cameras (build_scene.py's VIEWS).
#
#   blender -b -P render_composition.py -- [views=all|ref_3q,st_corner,...] [samples=128] [pct=100] [res=1920]
#                                          [scene=<.blend>] [out=<dir>] [devices=hybrid|gpu] [suffix=<text>]
#
# Before rendering it checks the block: the composition gathered the worn block's objects from its linked collections
# (the BRADBURY_SOURCE shelf) when it was built; a rebuilt block with NEW objects shows them on the shelf but not in
# BRADBURY_BLOCK, and the script says so (rerun build_composition.py).
import bpy, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
from wear import paths

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
scene_file = os.path.abspath(args.get("scene", os.path.join(paths.ART, "bradbury_city_composition.blend")))
assert os.path.isfile(scene_file), f"no composition at {scene_file}: run build_composition.py"
bpy.ops.wm.open_mainfile(filepath=scene_file)
S = bpy.context.scene

shelf, block = bpy.data.collections.get("BRADBURY_SOURCE"), bpy.data.collections.get("BRADBURY_BLOCK")
if shelf is not None and block is not None:
    have = {o.name for o in block.all_objects}
    new = [o.name for o in shelf.all_objects if o.name not in have and o.type not in {'CAMERA', 'LIGHT'}]
    if new:
        print(f"WARNING the block file has {len(new)} object(s) the composition does not hold ({', '.join(new[:6])}...): "
              f"rerun build_composition.py")

cams = {o.name: o for o in S.objects if o.type == 'CAMERA'}
want = args.get("views", "all")
views = sorted(cams) if want == "all" else want.split(",")
missing = [v for v in views if v not in cams]
assert not missing, f"no camera(s) {missing}; have {', '.join(sorted(cams))}"
if "samples" in args: S.cycles.samples = int(args["samples"])
S.render.resolution_percentage = int(args.get("pct", S.render.resolution_percentage))
res = int(args.get("res", S.render.resolution_x))
devices = args.get("devices", "gpu").lower()
try:
    cp = bpy.context.preferences.addons["cycles"].preferences; cp.compute_device_type = "OPTIX"; cp.get_devices()
    for d in cp.devices: d.use = d.type in (('OPTIX', 'CPU') if devices == "hybrid" else ('OPTIX',))
    S.cycles.device = 'GPU'
except Exception:
    S.cycles.device = 'CPU'
out = os.path.abspath(args.get("out", os.path.join(paths.ROOT, "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "composition")))
os.makedirs(out, exist_ok=True)
suffix = args.get("suffix", "")
for v in views:
    S.camera = cams[v]
    fw, fh = cams[v].get("frame", (16, 10))
    S.render.resolution_x = res; S.render.resolution_y = int(round(res * fh / fw))
    S.render.filepath = os.path.join(out, f"{v}{suffix}.png")
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"STILL {v} {time.time() - t:.1f} s {S.render.resolution_x * S.render.resolution_percentage // 100}x"
          f"{S.render.resolution_y * S.render.resolution_percentage // 100} {S.cycles.samples} spp -> {S.render.filepath}")
    sys.stdout.flush()
print("STILLS DONE")
