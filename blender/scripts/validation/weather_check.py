# weather_check.py -- the weathering namespaces of a composition, one switch at a time (AI 651, 2026-10-17).
#
#   blender -b <composition .blend> -P weather_check.py -- hero=bradbury|terramar cam=x,y,z:tx,ty,tz:lens
#                                     [res=960] [samples=128] [out=<dir>] [check=1] [bounces=<n>]
#
# Renders one close view in every state below (OptiX alone, fixed seed), the base state twice for the noise floor,
# and labels every pixel by what the camera ray through it hits first: HERO (the hero's own objects, instanced or
# linked), NEIGHBOUR (the modelled front line, nb_*: NB_weather), CITY (everything else). For each state it prints
# how many pixels changed by more than THRESH levels against the base and where they lie. A switch keeps to its own
# system when its changed pixels lie on its label (the hero's wear on HERO; city_weather on NEIGHBOUR) and the other
# namespaces' switches change nothing beyond the noise floor. States:
#   base           as saved (every system on)
#   <hero>_off     the hero's own switch off (Bradbury: wear 0; Terra & Mar: tm_wear 0), properties only, plus the
#                  wear-only collections the switch shows and hides (Bradbury) or the overlay instances (Terra & Mar)
#   <hero>_debug   the hero's switch in debug
#   city_weather0  the neighbours' weathering off
#   other_off      the OTHER hero's namespace switched off on this scene (it has no such system: nothing may change)
# Writes <out>/<state>.png, <out>/labels.png and a [base | state | difference] composite per state.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import os
import subprocess
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import city_site as CS  # noqa: E402

args, _ = CS.parse_args(sys.argv)
S = bpy.context.scene
HERO = args.get("hero", S.get("composition", "terramar"))
RES = int(args.get("res", 960))
OUT = os.path.abspath(args.get("out", os.path.join(CS.SCREENS, f"weather_{HERO}")))
THRESH = 3
os.makedirs(OUT, exist_ok=True)

if HERO == "bradbury":
    sys.path.insert(0, BP.script('bradbury/building/.'))
    from wear import controls as hero_wear  # noqa: E402
    manifest = hero_wear.read_manifest()
    base_mode, base_st = hero_wear.current(S, manifest)

    def hero_switch(mode):
        hero_wear.apply(S, mode, base_st, log=lambda m: None); hero_wear.apply_realism(S, float(S.get("wear_realism", 1.0)), log=lambda m: None)
    hero_objects = {o.name for o in bpy.data.collections["BRADBURY_BLOCK"].all_objects}
    OTHER = "tm_wear"
else:
    TMC = BP.script('terramar/composition/.')
    for p in (TMC, BP.script('terramar/building/rebuild')):
        sys.path.insert(0, os.path.normpath(p))
    import composition_wear  # noqa: E402
    from wear import controls as hero_wear  # noqa: E402
    base_mode, base_st, _ = hero_wear.current(S)

    def hero_switch(mode):
        composition_wear.switch(S, mode, base_st if mode != "off" else None, log=lambda m: None)
    hero_objects = set()
    for inst in list(bpy.data.collections["TERRAMAR"].objects) + list(bpy.data.collections[composition_wear.WEAR_INSTANCES].objects):
        hero_objects |= {o.name for o in inst.instance_collection.all_objects}
    OTHER = "wear"

# the camera
loc, tgt, lens = args["cam"].split(":")
loc = Vector(tuple(float(v) for v in loc.split(","))); tgt = Vector(tuple(float(v) for v in tgt.split(",")))
cd = bpy.data.cameras.new("weather_cam"); cd.lens = float(lens); cd.sensor_fit = 'AUTO'; cd.sensor_width = 36.0
cd.clip_start = 0.05; cd.clip_end = 7000.0
cam = bpy.data.objects.new("weather_cam", cd); S.collection.objects.link(cam); S.camera = cam
cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
W, H = RES, RES * 9 // 16
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = W, H, 100
bpy.context.view_layer.update()

# the labels: a ray per pixel of a quarter-resolution grid
dg = bpy.context.evaluated_depsgraph_get()
f = (tgt - loc).normalized(); r = f.cross(Vector((0, 0, 1))).normalized(); u = r.cross(f)
half = 18.0 / float(lens); hx, hy = half, half * H / W
LW, LH = W // 4, H // 4
labels = []
for j in range(LH):
    row = []
    for i in range(LW):
        d = (f + r * (((i + 0.5) / LW * 2 - 1) * hx) + u * ((1 - (j + 0.5) / LH * 2) * hy)).normalized()
        hit, _, _, _, ob, _ = S.ray_cast(dg, loc, d, distance=5000.0)
        name = ob.name if (hit and ob is not None) else ""
        row.append(1 if name in hero_objects else 2 if name.startswith("nb_") else 0 if hit else 3)
    labels.append(row)
counts = [sum(row.count(k) for row in labels) for k in range(4)]
print(f"WEATHER labels: hero {counts[1]}, neighbour {counts[2]}, city {counts[0]}, sky {counts[3]} of {LW * LH}")
import json  # noqa: E402
with open(os.path.join(OUT, "labels.json"), "w") as fh:
    json.dump(labels, fh)
if args.get("check") == "1":
    raise SystemExit

cp = bpy.context.preferences.addons["cycles"].preferences
cp.compute_device_type = "OPTIX"; cp.get_devices()
for d in cp.devices:
    d.use = d.type == 'OPTIX'
S.cycles.device = 'GPU'; S.cycles.samples = int(args.get("samples", 128))
S.cycles.seed = 0; S.cycles.use_animated_seed = False; S.cycles.use_denoising = True; S.cycles.denoiser = 'OPTIX'
S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_depth = '8'
if "bounces" in args:   # bounces=0: direct light only, so a switch's spill onto other surfaces by bounced light drops out
    S.cycles.max_bounces = int(args["bounces"])


def render(state):
    S.render.filepath = os.path.join(OUT, f"{state}.png")
    bpy.ops.render.render(write_still=True)
    print(f"WEATHER rendered {state}")


render("base"); render("base_repeat")
hero_switch("off"); render(f"{HERO}_off")
hero_switch("debug"); render(f"{HERO}_debug")
hero_switch(base_mode)
had = S.get(CS.WEATHER_PROP)
S[CS.WEATHER_PROP] = 0.0; render("city_weather0")
if had is None:
    del S[CS.WEATHER_PROP]
else:
    S[CS.WEATHER_PROP] = had
had = S.get(OTHER)
S[OTHER] = 0.0; render("other_off")
print("WEATHER RENDERS DONE")
subprocess.run(["python", BP.script('validation/weather_report.py'), OUT, HERO], check=False)
