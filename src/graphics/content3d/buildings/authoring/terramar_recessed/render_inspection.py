# render_inspection.py -- render the Terra & Mar baseline from its INSPECTION_RIG cameras (AI 614).
#
#   blender -b <file.blend> -P render_inspection.py -- [camera ...] [samples=64] [pct=100] [out=<dir>]
#
# Renders each named camera of the open file (all of INSPECTION_RIG's when none is named) at the resolution the
# camera carries (tm_resolution, the same as rig_cameras.json and the game capture) into <dir>/<camera>.png --
# by default tests/artifacts/screens/buildings/terramar_recessed/blender_export/blender/. Works on the baseline and
# on the edit copy alike (pass out= for the edit's evidence). The .blend is never saved.
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402


def use_gpu(scene):
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = 'GPU'
                return kind
    except Exception as exc:  # noqa: BLE001 - fall back to the CPU, the render still works
        print("GPU setup failed, rendering on the CPU:", exc)
    scene.cycles.device = 'CPU'
    return "CPU"


def main(argv):
    names = [a for a in argv if "=" not in a]
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    scene = bpy.context.scene
    device = use_gpu(scene)
    scene.cycles.samples = int(opts.get("samples", 64))
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    rig = bpy.data.collections["INSPECTION_RIG"]
    cams = [o for o in rig.objects if o.type == 'CAMERA' and (not names or o.name in names)]
    out_dir = os.path.abspath(opts.get("out", C.SCREENS_BLENDER))
    os.makedirs(out_dir, exist_ok=True)
    for cam in cams:
        w, h = cam.get("tm_resolution", (1920, 1080))
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = int(w), int(h)
        scene.render.filepath = os.path.join(out_dir, f"{cam.name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {cam.name} {w}x{h} on {device} -> {scene.render.filepath}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
