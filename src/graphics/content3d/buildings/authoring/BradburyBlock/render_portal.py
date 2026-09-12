"""Headless renders of the portal — no Blender UI, nothing to load by hand.

    blender -b bradbury_portal.blend -P render_portal.py -- [--eevee] [--samples N] [--size WxH] [--out DIR]

or double-click / run `render_portal.cmd` in this folder (it finds Blender and
passes any arguments through). Three angles are rendered:

    portal_front.png     straight on
    portal_low.png       low three-quarter view from the street
    portal_ornament.png  close-up of the left pilaster capital (the ornament)

Cycles on the GPU (OptiX) with denoising by default; --eevee for a quick
preview. Linked ornaments (ornaments/*.blend) are read fresh from disk when
the file loads, so the renders always show their latest saved version.
Output goes to tests/artifacts/screens/bradbury_fix/portal_project/renders/
unless --out is given.
"""
import bpy, os, sys, time, argparse
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--eevee", action="store_true", help="use EEVEE instead of Cycles")
ap.add_argument("--samples", type=int, default=192, help="Cycles samples (default 192)")
ap.add_argument("--size", default="1400x1600", help="resolution WxH (default 1400x1600)")
ap.add_argument("--out", default=None, help="output folder")
args = ap.parse_args(argv)

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath))
OUT = args.out or os.path.normpath(os.path.join(HERE, "..", "..", "..", "screens", "bradbury_fix", "portal_project", "renders"))
os.makedirs(OUT, exist_ok=True)

VIEWS = [  # name, camera location, aim point, lens (mm)
    ("portal_front",    (0.0, -11.0, 2.0),   (0.0, -2.4, 2.9),   35),
    ("portal_low",      (2.8, -5.6, 0.7),    (0.0, -2.3, 3.4),   26),
    ("portal_ornament", (-3.3, -5.1, 3.3),   (-2.0, -2.9, 3.75), 60),
]

S = bpy.context.scene
w, h = (int(v) for v in args.size.lower().split("x"))
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = w, h, 100
S.render.image_settings.file_format = 'PNG'
if args.eevee:
    S.render.engine = 'BLENDER_EEVEE'
else:
    S.render.engine = 'CYCLES'
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences
        cp.compute_device_type = "OPTIX"; cp.get_devices()
        for d in cp.devices: d.use = d.type in ('OPTIX', 'CPU')
        S.cycles.device = 'GPU'
    except Exception as e:
        print("GPU not available, rendering on the CPU:", e); S.cycles.device = 'CPU'
    S.cycles.samples = args.samples; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.02
    S.cycles.use_denoising = True
    try: S.cycles.denoiser = 'OPTIX' if S.cycles.device == 'GPU' else 'OPENIMAGEDENOISE'
    except Exception: pass

cam_data = bpy.data.cameras.new("render_cam"); cam = bpy.data.objects.new("render_cam", cam_data)
S.collection.objects.link(cam); S.camera = cam
for name, loc, aim, lens in VIEWS:
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = lens
    S.render.filepath = os.path.join(OUT, name + ".png")
    t0 = time.time(); bpy.ops.render.render(write_still=True)
    print(f"{name}: {S.render.filepath} ({time.time() - t0:.1f} s)")
print("RENDERS DONE ->", OUT)
