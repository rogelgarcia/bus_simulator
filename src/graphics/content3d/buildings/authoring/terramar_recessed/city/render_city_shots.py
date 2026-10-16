# render_city_shots.py -- repeatable stills of Terra & Mar in the Bradbury's city (2026-10-16).
#
#   blender -b -P render_city_shots.py -- [views=all|hero_3q,front_street,...] [check=1] [list=1]
#                                         [res=3840x2160] [pct=100] [samples=128] [scene=<.blend>] [out=<dir>]
#                                         [devices=gpu|hybrid] [suffix=<text>] [wear=on|off]
#
#   blender -b -P render_city_shots.py -- list=1                    the views, printed
#   blender -b -P render_city_shots.py -- check=1                   framing + the first thing each view's centre ray hits, no render
#   blender -b -P render_city_shots.py -- pct=25 samples=32         a quick preview set
#   blender -b -P render_city_shots.py --                           the full UHD set (3840 x 2160, 128 spp, OptiX denoised)
#
# Opens the city copy (build_city_scene.py -> city_common.CITY_BLEND) and never saves it. A view is (eye, aim, lens mm
# [, shift_y]) written in the TERRA & MAR FRAME (front run A faces -Y, x to its right, z up from its street), mapped into
# the city by city_common.to_world(), so the views follow the placement if it ever changes. The lens is on the frame's
# long side (36 mm sensor). shift_y is Blender's lens shift (a fraction of the long side): a level camera lifting its
# frame keeps the verticals vertical, as an architectural photograph does. The neighbour tower the Bradbury's scene puts
# across Broadway stands 30 m in front of the building (world x 42.5..68.5), so street-level front views stay inside it.
# Output: <out>/<view>.png (city_common.SHOTS_DIR, under the gitignored tests/artifacts/screens/buildings/terramar_recessed/city/).
import math
import os
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import city_common as C  # noqa: E402

args, _ = C.parse_args(sys.argv)
G = C.Z_GROUND - C.OFFSET[2]          # the Bradbury pavement's top in the Terra & Mar frame (0.15): a standing eye stands on it
E = G + C.EYE

# name -> (eye, aim, lens[, shift_y]); all in the Terra & Mar frame
VIEWS = {
    # the hero: an elevated three-quarter from the front-right, both sunlit faces (front on Broadway, right side north)
    "hero_3q":        ((42.0, -64.0, 24.0), (1.0, 0.0, 14.5), 32),
    # straight-on front from the far Broadway pavement, standing eye, the frame lifted to take in the whole height
    "front_street":   ((0.0, -38.5, E), (0.0, 0.0, E), 17, 0.22),
    # three-quarter from the front-left, across the crossing (the Bradbury's own reference corner), elevated
    "front_left_3q":  ((-42.0, -48.0, 18.0), (0.0, -2.0, 12.5), 32),
    # low-angle close-up from the base looking up the front toward the top
    "low_up":         ((2.6, -16.0, G + 0.45), (0.6, -11.0, 26.0), 15),
    # the entrance and the café from the forecourt's edge, standing eye
    "entrance":       ((6.5, -22.5, E), (0.0, -11.8, 3.6), 26),
    # the roof terrace and penthouse from above the front-right
    "roof":           ((22.0, -32.0, 48.0), (0.0, 1.5, 28.5), 30),
    # the rear three-quarter (the shaded sides), elevated
    "rear_3q":        ((-46.0, 54.0, 24.0), (0.0, 0.0, 14.5), 32),
    # the building in its city: a high aerial from the south-east
    "aerial_city":    ((95.0, -150.0, 110.0), (0.0, -5.0, 8.0), 40),
}

want = args.get("views", "all")
names = list(VIEWS) if want == "all" else want.split(",")
unknown = [n for n in names if n not in VIEWS]
assert not unknown, f"no such view(s) {unknown}; have {', '.join(VIEWS)}"
if args.get("list") == "1":
    for n, v in VIEWS.items():
        print(f"VIEW {n:14s} eye {v[0]} aim {v[1]} {v[2]} mm" + (f" shift_y {v[3]}" if len(v) > 3 else "")
              + f"  world eye {tuple(round(c, 2) for c in C.to_world(v[0]))}")
    raise SystemExit

SCENE = os.path.abspath(args.get("scene", C.CITY_BLEND))
assert os.path.isfile(SCENE), f"no city scene at {SCENE}: run build_city_scene.py first"
bpy.ops.wm.open_mainfile(filepath=SCENE)
S = bpy.context.scene
if "wear" in args:
    sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "rebuild")))
    from wear import controls as wear_controls  # noqa: E402
    wear_controls.apply(S, args["wear"]) if args["wear"] != "off" else wear_controls.clear(S)
shelf = bpy.data.collections.get("CONTEXT_LIBRARY")   # the context library's prototypes stand at the origin: never rendered
if shelf is not None:
    shelf.hide_render = True

w, h = (int(v) for v in args.get("res", "3840x2160").lower().split("x"))
PCT = int(args.get("pct", 100))
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = w, h, PCT
S.cycles.samples = int(args.get("samples", 128))
S.cycles.use_denoising = True
try:
    S.cycles.denoiser = 'OPTIX'
except Exception:
    pass
devices = args.get("devices", "gpu")
try:
    cp = bpy.context.preferences.addons["cycles"].preferences
    cp.compute_device_type = "OPTIX"; cp.get_devices()
    for d in cp.devices:
        d.use = d.type in (('OPTIX', 'CPU') if devices == "hybrid" else ('OPTIX',))
    S.cycles.device = 'GPU'
except Exception:
    S.cycles.device = 'CPU'
S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_depth = '8'

cd = bpy.data.cameras.new("tm_city_cam"); cd.sensor_fit = 'AUTO'; cd.sensor_width = 36.0
cd.clip_start = 0.05
cd.clip_end = 7000.0                    # the Bradbury's ground runs 3.5 km out (its CAM_CLIP)
cam = bpy.data.objects.new("tm_city_cam", cd); S.collection.objects.link(cam); S.camera = cam


def pose(view):
    eye, aim, lens = (Vector(C.to_world(view[0])), Vector(C.to_world(view[1])), view[2])
    cd.lens = lens; cd.shift_x = 0.0; cd.shift_y = view[3] if len(view) > 3 else 0.0
    cam.location = eye
    cam.rotation_euler = (aim - eye).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    return eye, aim


if args.get("check") == "1":
    dg = bpy.context.evaluated_depsgraph_get()
    for n in names:
        eye, aim = pose(VIEWS[n])
        pts = [world_to_camera_view(S, cam, Vector(p)) for p in C.box_corners(C.TM_BOX)]
        tower = [world_to_camera_view(S, cam, Vector(p)) for p in
                 [(x, y, z) for x in (C.TOWER_WORLD[0][0], C.TOWER_WORLD[1][0]) for y in (C.TOWER_WORLD[0][1], C.TOWER_WORLD[1][1])
                  for z in (C.TOWER_WORLD[0][2], C.TOWER_WORLD[1][2])]]
        d = (aim - eye).normalized()
        hit, loc, _, _, ob, _ = S.ray_cast(dg, eye, d, distance=2000.0)
        tw = [p for p in tower if p.z > 0 and -0.05 < p.x < 1.05 and -0.05 < p.y < 1.05]
        print(f"CHECK {n:14s} building x {min(p.x for p in pts):.3f}..{max(p.x for p in pts):.3f} "
              f"y(top-down) {1 - max(p.y for p in pts):.3f}..{1 - min(p.y for p in pts):.3f}; "
              f"centre ray hits {ob.name if hit else 'nothing'}" + (f" at {(loc - eye).length:.1f} m" if hit else "")
              + ("; TOWER IN FRAME" if tw else ""))
    print("CHECK DONE")
    raise SystemExit

OUT = os.path.abspath(args.get("out", C.SHOTS_DIR))
os.makedirs(OUT, exist_ok=True)
suffix = args.get("suffix", "")
t_all = time.time()
for n in names:
    eye, aim = pose(VIEWS[n])
    fp = os.path.join(OUT, f"{n}{suffix}.png")
    S.render.filepath = fp
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"SHOT {n} {time.time() - t:6.1f} s  {w * PCT // 100}x{h * PCT // 100} {S.cycles.samples} spp -> {fp}")
    sys.stdout.flush()
print(f"SHOTS DONE: {len(names)} in {(time.time() - t_all) / 60.0:.1f} min")
