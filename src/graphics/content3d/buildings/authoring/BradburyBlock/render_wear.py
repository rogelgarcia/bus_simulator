# Render the saved render scene with the wear layer switched however is asked, from any pose, without rebuilding
# anything (AI 563). It opens the scene (bradbury_scene.blend unless another is given), applies the layer's controls
# (wear/controls.py: the switch, the strengths, the wear-only collections), frames the view and renders one still.
#
#   blender -b -P render_wear.py -- [scene=<file.blend>] [wear=on|off|debug] [wear_<feature>=<strength> ...]
#                                   [view=<camera>] [cam=x,y,z:tx,ty,tz:lens] [shift=<x>,<y>] [frame=<w>:<h>]
#                                   [edges=on|off|<scale>] [edge_worn=<strength>]
#                                   [gf_top=r,g,b] [gf_pier=r,g,b] [gf_tone=off]
#                                   [pct=100] [samples=128] [res=1920] [exposure=0] [devices=hybrid|gpu] [out=<png>]
#
#   blender -b -P render_wear.py -- wear=debug wear_probe=1 view=st_up
#   blender -b -P render_wear.py -- wear=debug cam=19.5,-3.2,8.4:16.9,-3.2,9.2:50 pct=50 samples=32
#
# view= is one of the scene's cameras (st_corner, st_portal, st_along, st_up, hero_3q, ref_3q -- the last in its own
# 3:2 frame); cam= is a camera at x,y,z
# looking at tx,ty,tz with a lens in mm, as build_scene.py's VIEWS are written; shift= moves that camera's frame
# (Blender's lens shift, in fractions of the frame's larger side) so a level camera can frame a facade above its eye
# with the verticals kept vertical, as an architectural photograph does; frame= renders any view in that width:height
# (res= stays the width). Strengths not given keep the scene's
# own. The still goes to out=, or to tests/artifacts/screens/bradbury_wear/render_wear/<view>_<mode>.png. Nothing is
# saved back into the scene.
#
# devices= hybrid (the default) renders on OptiX and the CPU together, as the scene is set; gpu on OptiX alone. A
# hybrid still is not repeatable: Cycles splits the frame between the devices by rows and rebalances the split by how
# long each took, so the CPU's band (the top tenth or so of the frame) ends at another row every time, and wherever the
# two devices disagree -- faces of two objects lying in one plane, the arch's soffit moulding against its panel wall --
# two renders of one state differ. OptiX alone repeats to within one 8-bit level at every pixel: the way to compare
# two states of the layer.
import bpy, os, sys, time
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
from wear import paths, controls, edges

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)

scene_file = args.get("scene")
if scene_file:
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(scene_file))
elif not bpy.data.filepath:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(paths.ART, "bradbury_scene.blend"))
S = bpy.context.scene
here = os.path.dirname(bpy.data.filepath)
manifest = controls.read_manifest(os.path.join(here, "wear", os.path.basename(paths.MANIFEST)))
_, base = controls.current(S, manifest)
mode, strengths = controls.parse(args, manifest, base=base)
if mode != "off" and not any(c.name.startswith("WEAR_") or c.name == controls.SOURCES for c in bpy.data.collections) \
        and "wear" not in S:
    raise SystemExit("this scene was built with wear=off (it links the untouched block); render the worn scene instead")
controls.apply(S, mode, strengths)
edge_scale, edge_worn = edges.parse(args, S)      # AI 576: edges=on|off|<scale>, edge_worn=<strength>; a saved scene's own otherwise
edges.apply(S, edge_scale, edge_worn)
# the ground floor's tone, to try one without a rebuild (assemble_building.gf_tone_override, portal_lib.fill_sandstone):
# gf_top=r,g,b the moulding and the portal, gf_pier=r,g,b the piers, sRGB 0..255; one not given keeps the built tone;
# gf_tone=off renders the built tones whatever the scene holds
def _lin(v):
    v = float(v) / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
if "gf_top" in args or "gf_pier" in args:
    for key in ("top", "pier"):
        if f"gf_{key}" in args:
            S[f"gf_tone_{key}"] = [_lin(v) for v in args[f"gf_{key}"].split(",")]
        else:
            m = next((mm for mm in bpy.data.materials if mm.get("gf_tone_key") == key), None)
            assert m is not None, f"no material carries the built {key} tone: rebuild the block (assemble_building.py)"
            S[f"gf_tone_{key}"] = list(m["gf_tone_default"])
    S["gf_tone"] = 1.0
if args.get("gf_tone", "").lower() == "off": S["gf_tone"] = 0.0

view = args.get("view")
if "cam" in args:
    loc, tgt, lens = args["cam"].split(":")
    loc = Vector(tuple(float(v) for v in loc.split(","))); tgt = Vector(tuple(float(v) for v in tgt.split(",")))
    cd = bpy.data.cameras.new("wear_cam"); cd.lens = float(lens)
    # as far as the scene's own cameras see: the ground runs kilometres (AI 574 item 2) and a new camera's default
    # far clip of 1000 m would cut it off short of the horizon
    cd.clip_end = max((o.data.clip_end for o in bpy.data.objects if o.type == 'CAMERA'), default=cd.clip_end)
    cam = bpy.data.objects.new("wear_cam", cd); S.collection.objects.link(cam)
    cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
    if "shift" in args: cd.shift_x, cd.shift_y = (float(v) for v in args["shift"].split(","))
    S.camera = cam; view = view or "custom"
elif view:
    S.camera = bpy.data.objects[view]
else:
    view = S.camera.name
if "samples" in args: S.cycles.samples = int(args["samples"])
if "pct" in args: S.render.resolution_percentage = int(args["pct"])
if "res" in args:
    S.render.resolution_x = int(args["res"]); S.render.resolution_y = int(int(args["res"]) * 10 / 16)
fw, fh = S.camera.get("frame", (16, 10))       # a view's own frame (build_scene.py's VIEWS: ref_3q is 3:2), else the scene's 16:10
if "frame" in args: fw, fh = (float(v) for v in args["frame"].split(":"))
S.render.resolution_y = int(S.render.resolution_x * fh / fw)
if "exposure" in args: S.view_settings.exposure = float(args["exposure"])
devices = args.get("devices", "hybrid").lower()
assert devices in ("hybrid", "gpu"), f"devices: hybrid | gpu, not {devices}"
try:   # the scene asks for OptiX; a fresh process needs its devices enabled again
    cp = bpy.context.preferences.addons["cycles"].preferences; cp.compute_device_type = "OPTIX"; cp.get_devices()
    for d in cp.devices: d.use = d.type in (('OPTIX', 'CPU') if devices == "hybrid" else ('OPTIX',))
    S.cycles.device = 'GPU'
except Exception:
    S.cycles.device = 'CPU'
out = args.get("out") or os.path.join(paths.SCREENS, "render_wear", f"{view}_{mode}.png")
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
S.render.filepath = os.path.abspath(out)
t = time.time()
bpy.ops.render.render(write_still=True)
print(f"RENDERED {view} wear={mode} ({', '.join(f'{k} {v:g}' for k, v in strengths.items())}) "
      f"{S.render.resolution_x * S.render.resolution_percentage // 100}x"
      f"{S.render.resolution_y * S.render.resolution_percentage // 100} {S.cycles.samples} spp "
      f"({devices if S.cycles.device == 'GPU' else 'cpu'}) in {time.time() - t:.0f}s -> {out}")
