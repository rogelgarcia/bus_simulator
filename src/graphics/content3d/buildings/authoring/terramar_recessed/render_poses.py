# render_poses.py -- render the Terra & Mar comparison poses (AI 639).
#
#   blender -b <file.blend> -P render_poses.py -- [poses=a,b] [items=615,621] [groups=full,check] [list=1]
#                                                 [samples=96] [pct=100] [engine=cycles|eevee] [out=<dir>] [tag=<name>]
#
#   ... -- list=1                          print the poses (name, group, items, label) and render nothing
#   ... -- groups=target,full              the b8 stand and the two full-building poses
#   ... -- items=616                       every pose that serves edit prompt AI 616
#   ... -- poses=b8_target pct=50          one pose at half resolution
#
# The poses live in poses.json (one place to add or adjust them); with no poses=/items=/groups= every pose renders,
# and the three selectors combine as a union. Each pose renders through a temporary camera at the pose's own
# resolution, lit by the file's INSPECTION_RIG (the game's calibrated sky, its sun, the ground plane). The .blend is
# never saved: run it headless on the baseline (the fixed "before" set) or on the edit copy (the "after").
#
# Output: tests/artifacts/screens/buildings/terramar_recessed/poses/<tag>/<pose>.png + poses_manifest.json, where the
# tag is "baseline" for the as-extracted file, "edit" for the edit copy, "rebuild" for the from-scratch rebuild
# (its composition terramar_composition.blend, AI 643+; 2026-10-14), else the file's name (or tag=).
#
# A pose is either a look-at camera (location, target, vfov_deg, resolution) or "plan_camera": <key>, which takes the
# camera from the rebuild plan's cameras (terramar_plan.json: CAM_B8 fitted to the plan with its lens shift, the
# orthographic top view, the rear view), so the pose follows the plan when the camera is refitted.
# compose_pose_sheets.py turns two tags into before/after sheets (b8.png beside the target pose) and a contact sheet.
import datetime
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402
from render_inspection import use_gpu  # noqa: E402


def parse(argv):
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    split = lambda key: [s.strip() for s in opts.get(key, "").split(",") if s.strip()]  # noqa: E731
    return opts, split("poses"), [int(i) for i in split("items")], split("groups")


def select(all_poses, names, items, groups):
    known = {p["name"] for p in all_poses}
    unknown = [n for n in names if n not in known]
    if unknown:
        raise SystemExit(f"unknown pose(s) {unknown}; known: {sorted(known)}")
    if not (names or items or groups):
        return list(all_poses)
    return [p for p in all_poses
            if p["name"] in names or p["group"] in groups or any(i in p.get("items", []) for i in items)]


def file_tag(opts):
    if opts.get("tag"):
        return opts["tag"]
    path = os.path.normcase(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else ""
    if path == os.path.normcase(os.path.abspath(C.BASELINE)):
        return "baseline"
    if path == os.path.normcase(os.path.abspath(C.EDIT_BLEND)):
        return "edit"
    if path == os.path.normcase(os.path.abspath(C.REBUILD_BLEND)):
        return "rebuild"
    return os.path.splitext(os.path.basename(path))[0] or "untitled"


def camera_spec(p, plan_cameras):
    """The pose's camera: its own look-at fields, or the rebuild plan's camera it names."""
    if "plan_camera" not in p:
        return p
    if plan_cameras is None:
        raise SystemExit(f"pose {p['name']} uses plan_camera but {C.REBUILD_PLAN} is missing")
    return plan_cameras[p["plan_camera"]]


def aim(cam, cam_data, spec):
    """Point the temporary camera as the spec says (perspective by vfov or pixel focal, or orthographic)."""
    res = spec["resolution"]
    cam_data.type = 'ORTHO' if "ortho_scale" in spec else 'PERSP'
    cam_data.shift_x, cam_data.shift_y = spec.get("shift_x", 0.0), spec.get("shift_y", 0.0)
    if "ortho_scale" in spec:
        cam_data.sensor_fit = 'HORIZONTAL' if res[0] >= res[1] else 'VERTICAL'
        cam_data.ortho_scale = spec["ortho_scale"]
    elif "focal_px" in spec:
        cam_data.sensor_fit = 'VERTICAL'
        cam_data.sensor_height = 24.0
        cam_data.lens = spec["focal_px"] * 24.0 / res[1]
    elif "lens_mm" in spec:
        cam_data.sensor_fit = 'HORIZONTAL'
        cam_data.sensor_width = 36.0
        cam_data.lens = spec["lens_mm"]
    else:
        cam_data.sensor_fit = 'VERTICAL'
        cam_data.angle_y = math.radians(spec["vfov_deg"])
    loc = Vector(spec["location"])
    cam.location = loc
    if "target" in spec:
        cam.rotation_euler = (Vector(spec["target"]) - loc).to_track_quat('-Z', 'Y').to_euler()
    else:
        cam.rotation_euler = [math.radians(a) for a in spec["rotation_deg"]]


def main(argv):
    opts, names, items, groups = parse(argv)
    poses = select(C.load_json(C.POSES_JSON)["poses"], names, items, groups)
    if opts.get("list") in ("1", "true", "yes"):
        for p in poses:
            print(f"POSE {p['name']:28s} {p['group']:9s} items {','.join(map(str, p.get('items', []))):40s} {p['label']}")
        return
    assert bpy.data.filepath, "open a Terra & Mar .blend first: blender -b <file.blend> -P render_poses.py -- ..."
    assert "INSPECTION_RIG" in bpy.data.collections, "the file has no INSPECTION_RIG (calibrated sky and sun)"
    scene = bpy.context.scene
    engine = opts.get("engine", "cycles").lower()
    if engine == "eevee":
        scene.render.engine = 'BLENDER_EEVEE'
        device = "EEVEE"
    else:
        scene.render.engine = 'CYCLES'
        device = use_gpu(scene)
        scene.cycles.samples = int(opts.get("samples", 96))
        scene.cycles.use_denoising = True
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    tag = file_tag(opts)
    out_dir = os.path.abspath(opts.get("out", os.path.join(C.POSES_DIR, tag)))
    os.makedirs(out_dir, exist_ok=True)

    cam_data = bpy.data.cameras.new("TM_POSE_CAMERA")
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.clip_start, cam_data.clip_end = 0.05, 2000.0
    cam = bpy.data.objects.new("TM_POSE_CAMERA", cam_data)
    scene.collection.objects.link(cam)
    previous_camera = scene.camera
    rendered = []
    plan_cameras = C.load_json(C.REBUILD_PLAN)["cameras"] if os.path.exists(C.REBUILD_PLAN) else None
    try:
        for p in poses:
            spec = camera_spec(p, plan_cameras)
            aim(cam, cam_data, spec)
            scene.camera = cam
            scene.render.resolution_x, scene.render.resolution_y = spec["resolution"]
            scene.render.filepath = os.path.join(out_dir, f"{p['name']}.png")
            t0 = time.time()
            bpy.ops.render.render(write_still=True)
            seconds = round(time.time() - t0, 1)
            rendered.append({"name": p["name"], "group": p["group"], "items": p.get("items", []), "label": p["label"],
                             "camera": {k: v for k, v in spec.items() if k != "fit"}, "plan_camera": p.get("plan_camera"),
                             "resolution": spec["resolution"], "seconds": seconds})
            print(f"rendered {p['name']} {spec['resolution'][0]}x{spec['resolution'][1]} in {seconds}s -> {scene.render.filepath}")
    finally:
        scene.camera = previous_camera
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cam_data)

    manifest_path = os.path.join(out_dir, "poses_manifest.json")
    previous = C.load_json(manifest_path) if os.path.exists(manifest_path) else {}
    merged = {r["name"]: r for r in previous.get("poses", [])}
    merged.update({r["name"]: r for r in rendered})
    order = [p["name"] for p in C.load_json(C.POSES_JSON)["poses"]]
    manifest = {"file": os.path.relpath(bpy.data.filepath, C.ROOT).replace("\\", "/"), "tag": tag,
                "engine": engine, "device": device, "samples": scene.cycles.samples if engine != "eevee" else None,
                "pct": scene.render.resolution_percentage, "updated": datetime.datetime.now().isoformat(timespec="seconds"),
                "poses": sorted(merged.values(), key=lambda r: order.index(r["name"]) if r["name"] in order else 999)}
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"POSES DONE {len(rendered)} rendered into {out_dir}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
