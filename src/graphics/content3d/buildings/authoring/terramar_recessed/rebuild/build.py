# build.py -- build the Terra & Mar rebuild file from the plan: the base scene, then the layers in order (AI 643+).
#
#   blender -b --factory-startup --python build.py -- [layers=structure] [save=1]        first time: creates the file
#   blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend --python build.py -- layers=structure
#   headed (MCP): open the rebuild file (or File > New), then exec this file with the same argv after "--"
#
# Writes tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend. Every layer is
# rebuild/layer_<name>.py with build(plan) and owns one collection under TERRAMAR_REBUILD, which a rerun empties and
# rebuilds; nothing else is touched. The base scene is refreshed each run:
#   INSPECTION_RIG    the baseline's calibrated sky, sun, ground and rig cameras, appended once from the baseline .blend,
#                     with its film settings (AgX, the game's calibrated exposure) -- the lighting render_poses.py uses
#   RB_CAMERAS        CAM_B8 (fitted to the plan), CAM_AERIAL, CAM_REAR, CAM_TOP, from plan["cameras"]
#   RB_PLAN_GUIDES    the plan's layer outlines as curves at z 0 (viewport guides; not rendered)
# The script only ever works inside an unsaved session or the rebuild file itself.
import importlib
import json
import math
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

C = L.C
LAYERS = ["structure", "envelope", "balconies", "podium", "roof"]          # build order; a later layer may stand on an earlier one


def guard():
    fp = bpy.data.filepath
    if fp and os.path.normcase(os.path.abspath(fp)) != os.path.normcase(C.REBUILD_BLEND):
        raise SystemExit(f"build.py: refusing to build inside {fp}; open {C.REBUILD_BLEND} or start from File > New")
    if not fp:                   # a fresh session: drop the startup scene's objects
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for coll in list(bpy.data.collections):
            bpy.data.collections.remove(coll)


def inspection_rig():
    """Append the baseline's INSPECTION_RIG and its world once, and set its film settings."""
    scene = bpy.context.scene
    if "INSPECTION_RIG" not in bpy.data.collections:
        with bpy.data.libraries.load(C.BASELINE, link=False) as (src, dst):
            dst.collections = ["INSPECTION_RIG"]
            dst.worlds = ["TM_WORLD"]
        scene.collection.children.link(dst.collections[0])
        scene.world = dst.worlds[0]
        base_dir = os.path.dirname(C.BASELINE)
        for img in bpy.data.images:          # the sky file was relative to the baseline
            if img.filepath.startswith("//") and not os.path.exists(bpy.path.abspath(img.filepath)):
                img.filepath = os.path.normpath(os.path.join(base_dir, img.filepath[2:]))
    elif scene.world is None and "TM_WORLD" in bpy.data.worlds:
        scene.world = bpy.data.worlds["TM_WORLD"]
    lit = C.load_rig()["lighting"]
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = math.log2(lit["exposure"])
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True


def plan_guides(plan):
    coll = L.ensure_collection(L.PLAN_GUIDES)
    L.clear_collection(coll)
    coll.hide_render = True
    for key in ("balcony_edge", "tower_wall_line", "roof_guard_line", "penthouse", "entrance"):
        pts = plan["layers"][key]["outline"]
        cu = bpy.data.curves.new(f"guide_{key}", "CURVE")
        cu.dimensions = "3D"
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, (x, y) in zip(sp.points, pts):
            p.co = (x, y, 0.0, 1.0)
        sp.use_cyclic_u = True
        coll.objects.link(bpy.data.objects.new(f"guide_{key}", cu))


def cameras(plan):
    coll = L.ensure_collection(L.CAMERAS)
    L.clear_collection(coll)
    cams = L.plan_cameras(coll, plan)
    scene = bpy.context.scene
    scene.camera = cams["b8"]
    scene.render.resolution_x, scene.render.resolution_y = cams["b8"]["tm_resolution"]
    scene.render.resolution_percentage = 100


def main():
    opts = L.args()
    layers = [s for s in opts.get("layers", ",".join(LAYERS)).split(",") if s]
    unknown = [s for s in layers if s not in LAYERS]
    if unknown:
        raise SystemExit(f"unknown layer(s) {unknown}; known: {LAYERS}")
    guard()
    plan = L.load_plan()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    L.ensure_collection(L.ROOT)
    inspection_rig()
    cameras(plan)
    plan_guides(plan)
    summary = {}
    for name in [s for s in LAYERS if s in layers]:
        mod = importlib.import_module(f"layer_{name}")
        importlib.reload(mod)
        t0 = time.time()
        summary[name] = {**mod.build(plan), "seconds": round(time.time() - t0, 2)}
    if opts.get("save", "1") == "1":
        os.makedirs(C.REBUILD_DIR, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=C.REBUILD_BLEND)
    for name, s in summary.items():
        s = dict(s)
        s.pop("names", None)
        print("LAYER", name, json.dumps(s))
    print("BUILD", C.REBUILD_BLEND if opts.get("save", "1") == "1" else "(not saved)")
    return summary


if __name__ == "__main__":
    main()
