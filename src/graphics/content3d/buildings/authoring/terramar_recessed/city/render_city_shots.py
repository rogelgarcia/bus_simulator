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
# Opens the composition (build_composition.py -> city_common.CITY_BLEND; scene=<legacy copy> for the old one) and never saves it. A view is (eye, aim, lens mm
# [, shift_y]) in the world, at the Bradbury's own stands round the Broadway / 3rd Street corner, which Terra & Mar's
# entrance faces. The lens is on the frame's long side (36 mm sensor). shift_y is Blender's lens shift (a fraction of the
# long side): a level camera lifting its frame keeps the verticals vertical, as an architectural photograph does.
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
G = C.Z_GROUND                          # the pavement's top: a standing eye stands on it
E = G + C.EYE

# name -> (eye, aim, lens[, shift_y]), in the WORLD: the Bradbury's own stands round the Broadway / 3rd Street corner
# (build_scene.py's VIEWS), re-aimed at Terra & Mar's entrance face and its 32 m height; behind the block lie the city's
# open parking parcels (user 2026-10-16), which the Bradbury's stands never show, so only the two rear views (asked for
# 2026-10-17) look from the back, over the block's own parking lot, with the neighbour tower behind the building.
VIEWS = {
    # the Bradbury's reference stand (ref_3q: 14.4 m up, 44.5 m off the corner at azimuth -30), the whole building
    "ref_3q":         ((54.12, -38.71, G + 14.4), (2.75, -10.65, 14.5), 28),
    # the Bradbury's hero stand (hero_3q), from the south-east, higher
    "hero_3q":        ((56.0, -50.0, 19.0), (0.05, -9.0, 14.0), 30),
    # the Bradbury's st_corner: standing on the far pavement across the crossing, the entrance face whole
    "st_corner":      ((41.0, -41.0, E), (9.0, -10.0, 14.0), 20),
    # the Bradbury's st_along: out in the crossing, the Broadway face running away north
    "st_along":       ((26.0, -26.0, E), (14.0, 6.0, 12.0), 24),
    # the entrance and the corner café from the kerb's corner, standing eye
    "entrance":       ((18.5, -19.5, E), (11.2, -12.1, 3.4), 26),
    # low-angle close-up from the base of the entrance face looking up toward the top
    "low_up":         ((13.6, -14.6, G + 0.45), (9.4, -9.0, 28.0), 15),
    # the roof terrace and penthouse from above the corner
    "roof":           ((36.0, -40.0, 50.0), (4.0, -5.0, 28.0), 30),
    # the building in its city: a high aerial from the south-east, over the crossing
    "aerial_city":    ((100.0, -125.0, 95.0), (2.0, -6.0, 8.0), 40),
    # from behind (user 2026-10-17): an elevated rear three-quarter from the north-west, over the parking lot
    "rear_3q":        ((-48.0, 42.0, 22.0), (3.0, -4.0, 13.5), 30),
    # from behind at street level: standing on the parking lot's edge, looking up at the rear faces
    "rear_street":    ((-30.0, 24.0, E), (3.5, -4.4, 15.0), 18),
    # from behind, over the parking lot (user 2026-10-17, an arrow drawn on rear_3q): elevated over the lot's west bays,
    # looking down the arrow's line straight at the lot's south-east corner, where the building's shadow falls on the
    # lot and the 3rd Street sidewalk; then (user: "show the full building", "more to the right") moved south and back so
    # the whole building stands over the shaded corner
    "rear_lot_shadow": ((-52.0, -8.0, 16.0), (0.0, -9.0, 14.0), 20),
}

want = args.get("views", "all")
names = list(VIEWS) if want == "all" else want.split(",")
unknown = [n for n in names if n not in VIEWS]
assert not unknown, f"no such view(s) {unknown}; have {', '.join(VIEWS)}"
if args.get("list") == "1":
    for n, v in VIEWS.items():
        print(f"VIEW {n:14s} eye {v[0]} aim {v[1]} {v[2]} mm" + (f" shift_y {v[3]}" if len(v) > 3 else "")
)
    raise SystemExit

SCENE = os.path.abspath(args.get("scene", C.CITY_BLEND))
assert os.path.isfile(SCENE), f"no city scene at {SCENE}: run build_composition.py first"
bpy.ops.wm.open_mainfile(filepath=SCENE)
S = bpy.context.scene
if "wear" in args:
    import composition_wear  # noqa: E402   (the module's switch, and the composition's overlay instances)
    composition_wear.switch(S, args["wear"], args.get("wear_strengths"))
shelf = bpy.data.collections.get("CONTEXT_LIBRARY")   # the context library's prototypes stand at the origin: never rendered
if shelf is not None and shelf.library is None:   # a linked city's shelf is hidden in the city itself
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
    eye, aim, lens = (Vector(view[0]), Vector(view[1]), view[2])
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
