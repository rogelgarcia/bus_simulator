# parity_render.py -- one repeatable still of any scene, for the city-reuse parity gates (AI 651, 2026-10-17).
#
#   blender -b -P parity_render.py -- scene=<.blend> views=a,b,c [table=bradbury|terramar] [res=1280] [samples=128]
#                                     [out=<dir>] [tag=<name>] [set=key:value,...] [tm_wear=on|off|debug] [seed=0]
#
# OptiX alone (a hybrid CPU + GPU frame splits by rows differently every time), a fixed seed, denoised, so two renders
# of the same state repeat. Views: the scene's own cameras by name (table=bradbury: build_scene.py's VIEWS, which both
# the legacy Bradbury scene and its composition carry as cameras), or Terra & Mar's render_city_shots.py VIEWS table
# (table=terramar: the legacy city scene has no cameras of its own). set= writes scene custom properties before the
# render (city_weather:0, wear:0 ...); tm_wear= runs the Terra & Mar wear controls (and its composition's instance
# sync). Writes <out>/<view>_<tag>.png and prints the render time.
import os
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import city_site as CS  # noqa: E402

args, _ = CS.parse_args(sys.argv)
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args["scene"]))
S = bpy.context.scene
TABLE = args.get("table", "bradbury")
RES = int(args.get("res", 1280))
OUT = os.path.abspath(args.get("out", CS.SCREENS))
TAG = args.get("tag", "render")
os.makedirs(OUT, exist_ok=True)

for kv in filter(None, args.get("set", "").split(",")):
    k, v = kv.split(":")
    S[k] = float(v)
    print(f"PARITY set {k} = {v}")
if "tm_wear" in args:
    TMC = os.path.normpath(os.path.join(HERE, "..", "terramar_recessed", "city"))
    for p in (TMC, os.path.join(TMC, "..", "rebuild")):
        if p not in sys.path:
            sys.path.insert(0, os.path.normpath(p))
    import composition_wear  # noqa: E402
    composition_wear.switch(S, args["tm_wear"], args.get("tm_strengths"))

shelf = bpy.data.collections.get("CONTEXT_LIBRARY")
if shelf is not None and shelf.library is None:
    shelf.hide_render = True

views = {}
if TABLE == "terramar":
    src = open(os.path.join(HERE, "..", "terramar_recessed", "city", "render_city_shots.py"), encoding="utf-8").read()
    a = src.index("VIEWS = {"); b = src.index("\n}\n", a) + 3
    ns = {"G": CS.Z_GROUND, "E": CS.Z_GROUND + CS.EYE}
    exec(src[a:b], ns)
    views = ns["VIEWS"]

S.render.engine = 'CYCLES'
cp = bpy.context.preferences.addons["cycles"].preferences
cp.compute_device_type = "OPTIX"; cp.get_devices()
for d in cp.devices:
    d.use = d.type == 'OPTIX'
S.cycles.device = 'GPU'
S.cycles.samples = int(args.get("samples", 128))
S.cycles.seed = int(args.get("seed", 0)); S.cycles.use_animated_seed = False   # seed=1: the decorrelated noise floor
S.cycles.use_denoising = True
S.cycles.denoiser = 'OPTIX'
S.render.resolution_percentage = 100
S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_depth = '8'

cam_tm = None
for name in args["views"].split(","):
    if TABLE == "terramar":
        if cam_tm is None:
            cd = bpy.data.cameras.new("parity_cam"); cd.sensor_fit = 'AUTO'; cd.sensor_width = 36.0
            cd.clip_start = 0.05; cd.clip_end = 7000.0
            cam_tm = bpy.data.objects.new("parity_cam", cd); S.collection.objects.link(cam_tm)
        v = views[name]
        eye, aim = Vector(v[0]), Vector(v[1])
        cam_tm.data.lens = v[2]; cam_tm.data.shift_y = v[3] if len(v) > 3 else 0.0
        cam_tm.location = eye; cam_tm.rotation_euler = (aim - eye).to_track_quat('-Z', 'Y').to_euler()
        S.camera = cam_tm; fw, fh = 16, 9
    else:
        S.camera = bpy.data.objects[name]
        fw, fh = S.camera.get("frame", (16, 10))
    S.render.resolution_x = RES; S.render.resolution_y = int(round(RES * fh / fw))
    S.render.filepath = os.path.join(OUT, f"{name}_{TAG}.png")
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"PARITY {name} {TAG} {time.time() - t:.1f} s {S.render.resolution_x}x{S.render.resolution_y} "
          f"{S.cycles.samples} spp -> {S.render.filepath}")
    sys.stdout.flush()
print("PARITY DONE")
