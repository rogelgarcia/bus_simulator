# build.py -- build the Terra & Mar part files from the plan: the base scene, then a part's layers in order (AI 643+).
#
#   blender -b --factory-startup --python build.py -- target=all [save=1]                 every part, then the composition
#   blender -b --factory-startup --python build.py -- target=props                        one part from scratch
#   blender -b blender_files/terramar/parts/terramar_part_shell.blend --python build.py -- layers=roof
#   blender -b blender_files/terramar/parts/terramar_part_site.blend --python build.py -- target=site layers=wear [wear=0]
#   headed (MCP): open a part file (or File > New), then exec this file with the same argv after "--"
#
# The model is split into part files (2026-10-14), each owning one root collection; compose.py links the roots into
# terramar_composition.blend, the file the poses, the audit and the checks open:
#   terramar_building.blend   TM_BUILDING   structure, envelope, balconies, podium, roof (penthouse, annex, solar), and
#                                           the interior base (partitions, downlights)
#   terramar_props.blend      TM_PROPS      the props on the building: balcony plants, podium planters, the entrance
#                                           portal's pot plants (user fix 12), roof planters, roof furniture, storefront
#                                           awnings
#   terramar_site.blend       RB_SITE       the street: sidewalk, cafe, palms, lamps, entrance planters
#   terramar_interiors.blend  TM_INTERIORS  the furnished interiors: restaurant, upper dining room, residential curtains and
#                                           furniture, penthouse
#   terramar_wear.blend       TM_WEAR       the wear module's overlay geometry (2026-10-14; empty until a feature adds some)
# Every layer is rebuild/layer_<name>.py with build(plan) (or LAYER_MODULES' module and function) and owns one collection
# under its part's root, which a rerun empties and rebuilds; nothing else is touched. layers= alone picks the part its
# layers belong to. Two finishing passes own no collection and run after any geometry layer rebuilt (PART_FINISHING):
#   materials  (layer_materials.py, AI 648) re-dresses the file's TM_RB_* slots and cuts the stone joints into the root's
#              objects (materials=0 skips it; layers=materials with target= re-dresses a part already cut)
#   wear       (layer_wear.py, 2026-10-14; building, props, site) splices the wear module into the exterior materials and
#              writes its signals; it follows every materials pass (layers=wear re-applies it alone; wear=0 strips it,
#              giving the part exactly as it was without the wear module)
# The base scene, in every part, is refreshed each run:
#   INSPECTION_RIG    the baseline's calibrated sky, sun, ground and rig cameras, appended once from the baseline .blend,
#                     with its film settings (AgX, the game's calibrated exposure) -- the lighting render_poses.py uses
#   RB_CAMERAS        CAM_B8 (fitted to the plan), CAM_AERIAL, CAM_REAR, CAM_TOP, from plan["cameras"]
#   RB_PLAN_GUIDES    the plan's layer outlines as curves at z 0 (viewport guides; not rendered)
# The script only ever works inside an unsaved session or the part file it builds.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
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
# part -> (its root collection, the layers it builds in order; a later layer may stand on an earlier one). The site's
# layers own RB_SITE themselves; its rebuild root is never created, so the materials pass only dresses it (no joints).
# The wear part (2026-10-14) holds the wear module's overlay geometry, built from the features' overlays().
PARTS = {"building": ("TM_BUILDING", ["structure", "envelope", "balconies", "podium", "roof", "interior_base"]),
         "props": ("TM_PROPS", ["balcony_plants", "podium_planters", "entrance_plants", "roof_planters", "roof_furniture",
                                "awnings"]),
         "site": ("RB_SITE", ["site_cafe", "site_palms"]),
         "interiors": ("TM_INTERIORS", ["restaurant_l0", "dining_l1", "residential", "penthouse"]),
         "wear": ("TM_WEAR", ["wear_overlays"])}
LAYER_ROOT = {"site": "TM_SITE"}                                                # the root the site's layers never use
LAYER_MODULES = {"wear_overlays": ("layer_wear", "build_overlays")}            # (module, function); else layer_<name>.build
# The finishing passes, in order, after any geometry layer: materials dresses (and cuts joints into) what the others
# built; wear (layer_wear.py) splices the wear module into the exterior materials, so it follows every materials pass.
# materials=0 skips the materials pass; wear=0 makes the wear pass strip the wear instead (the part as before it).
FINISHING = ["materials", "wear"]
PART_FINISHING = {"building": FINISHING, "props": FINISHING, "site": FINISHING, "interiors": ["materials"], "wear": []}


def part_path(part):
    return C.REBUILD_PARTS[part]


def finishing(part, layers, opts):
    """The requested layers with the finishing passes the part runs after them, in order."""
    fin = PART_FINISHING[part]
    geo = [s for s in layers if s not in FINISHING]
    want = {s for s in layers if s in fin}
    if "materials" in fin:
        if opts.get("materials", "1") == "0":
            want.discard("materials")
        elif geo:
            want.add("materials")
    if "wear" in fin and ("materials" in want or (geo and opts.get("wear", "1") == "0")):
        want.add("wear")                         # the materials pass rebuilt the trees the wear sits in
    return geo + [s for s in fin if s in want]


def part_of(layers):
    layers = [s for s in layers if s not in FINISHING]
    parts = {p for p, (_, names) in PARTS.items() for s in layers if s in names}
    if len(parts) != 1:
        raise SystemExit(f"layers {layers} span parts {sorted(parts) or 'none'}; give target= (one of {sorted(PARTS)})")
    return parts.pop()


def guard(path):
    fp = bpy.data.filepath
    if fp and os.path.normcase(os.path.abspath(fp)) != os.path.normcase(path):
        raise SystemExit(f"build.py: refusing to build inside {fp}; open {path} or start from File > New")
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


def base_scene(plan):
    bpy.context.scene.unit_settings.system = "METRIC"
    inspection_rig()
    cameras(plan)
    plan_guides(plan)


def save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fp = bpy.context.preferences.filepaths
    versions, fp.save_version = fp.save_version, 0           # no .blend1 copies (the plan rebuilds any part); the
    try:                                                      # user's preference is restored right after
        bpy.ops.wm.save_as_mainfile(filepath=path)
        bpy.ops.file.make_paths_relative()      # image and library paths relative to the file, then save again
        bpy.ops.wm.save_mainfile()
    finally:
        fp.save_version = versions


def build_part(part, layers, opts):
    """Build the part's layers (and its finishing passes) into the open session; save it to the part's file."""
    root, names = PARTS[part]
    os.environ["TM_RB_ROOT"] = LAYER_ROOT.get(part, root)
    os.environ["TM_RB_PART"] = part
    importlib.reload(L)                             # pick up the part's root
    layers = finishing(part, layers, opts)
    path = part_path(part)
    guard(path)
    plan = L.load_plan()
    if part not in LAYER_ROOT:
        L.ensure_collection(L.ROOT)
    base_scene(plan)
    summary = {}
    for name in [s for s in names + FINISHING if s in layers]:
        modname, fn = LAYER_MODULES.get(name, (f"layer_{name}", "build"))
        mod = importlib.import_module(modname)
        importlib.reload(mod)
        t0 = time.time()
        summary[name] = {**getattr(mod, fn)(plan), "seconds": round(time.time() - t0, 2)}
    for img in list(bpy.data.images):                  # images a rebuilt layer no longer uses
        if img.users == 0:
            bpy.data.images.remove(img)
    if opts.get("save", "1") == "1":
        save(path)
    for name, s in summary.items():
        s = dict(s)
        s.pop("names", None)
        print("LAYER", name, json.dumps(s))
    print("BUILD", part, path if opts.get("save", "1") == "1" else "(not saved)")
    return summary


def main():
    opts = L.args()
    target = opts.get("target")
    if target == "all":
        if bpy.data.filepath:
            raise SystemExit("target=all starts every part from scratch: run it with --factory-startup and no file")
        summary = {}
        for part in PARTS:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            summary[part] = build_part(part, list(PARTS[part][1]), opts)
        if opts.get("save", "1") == "1":
            import compose                                                     # noqa: E402
            importlib.reload(compose)
            bpy.ops.wm.read_factory_settings(use_empty=True)
            compose.main()
        return summary
    layers = [s for s in opts.get("layers", "").split(",") if s]
    if target is None:
        if not [s for s in layers if s not in FINISHING]:
            raise SystemExit(f"give target= (one of {sorted(PARTS)} or all), or layers= of one part")
        target = part_of(layers)
    if target not in PARTS:
        raise SystemExit(f"unknown target {target}; known: {sorted(PARTS)} or all")
    known = PARTS[target][1] + PART_FINISHING[target]
    unknown = [s for s in layers if s not in known]
    if unknown:
        raise SystemExit(f"layer(s) {unknown} are not in part {target}; its layers: {known}")
    return build_part(target, layers or list(PARTS[target][1]), opts)


if __name__ == "__main__":
    main()
