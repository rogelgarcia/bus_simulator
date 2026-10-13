# massing.py -- AI 642 phase 1: plain massing blocks of the silhouette options, seen from the calibrated cameras.
#
#   blender -b --factory-startup --python massing.py -- [options=ABCD] [cams=b8,aerial,rear] [render=1] [save=1]
#   headed: File > New first, then run it (Text editor, or exec through MCP with the same argv after "--")
#
# Builds tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_massing.blend from
# rebuild/terramar_plan_options.json (plan_options.py):
#   PLAN_<k>     the option's balcony-edge and wall-line outlines as closed poly curves at z 0
#   MASSING_<k>  podium on the balcony edge, tower on the wall line, the four balcony slabs and the roof slab on the
#                balcony edge, the two full-height front piers and the entrance -- flat greys, no detail; the approved
#                option also gets the kept penthouse from terramar_plan.json, in red so its b8 visibility can be counted
#   CAM_B8 / CAM_AERIAL   the cameras calibrate_references.py fitted to b8 and the aerial (pixel-exact frame, lens shift)
#   CAM_REAR              a rear three-quarter view, the only place the options really differ
# The aerial is an AI illustration with an impossible perspective (its roof reads as seen from almost straight above,
# its facades as seen almost level), so no camera matches both: CAM_AERIAL is fitted to the roof plane alone and its
# renders show only the roof slab. Shadows are off for the two reference cameras (their edges read as false lines).
# Renders (Workbench, transparent film) go to tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/
# massing/<k>_<cam>.png; compose_massing.py lays them over the references. Only an unsaved file or this script's own
# .blend is ever cleared -- it refuses to run inside any other file.
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

PLAN_OPTIONS = os.path.join(HERE, "terramar_plan_options.json")
PLAN = os.path.join(HERE, "terramar_plan.json")             # the approved plan (make_plan.py), when it exists
PLAN_DIR = os.path.join(C.ROOT, "tests", "artifacts", "screens", "buildings", C.BUILDING_ID, "rebuild", "plan")
CAL = os.path.join(PLAN_DIR, "calibration.json")
OUT_DIR = os.path.join(PLAN_DIR, "massing")
OUT_BLEND = os.path.join(C.ROOT, "tests", "artifacts", "blender", C.BUILDING_ID, "rebuild", "terramar_rebuild_massing.blend")
REF_RES = (1122, 1402)       # b8.png and the aerial
REAR_RES = (1600, 1100)

COLORS = {
    "podium": (0.62, 0.58, 0.53, 1), "tower": (0.42, 0.48, 0.54, 1), "slab": (0.93, 0.92, 0.89, 1),
    "roof": (0.93, 0.92, 0.89, 1), "pier": (0.80, 0.76, 0.70, 1), "entrance": (0.50, 0.45, 0.40, 1),
    "ground": (0.55, 0.55, 0.53, 1), "penthouse": (0.78, 0.36, 0.32, 1),
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = dict(s.split("=", 1) for s in argv if "=" in s)
    return (a.get("options", "ABCD").upper(), [c for c in a.get("cams", "b8,aerial,rear").split(",") if c],
            a.get("render", "1") == "1", a.get("save", "1") == "1")


def clear_file():
    fp = bpy.data.filepath
    if fp and os.path.normcase(os.path.abspath(fp)) != os.path.normcase(OUT_BLEND):
        raise SystemExit(f"massing.py: refusing to clear {fp}; start from File > New (or headless --factory-startup)")
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.materials):
        for d in list(block):
            if d.users == 0:
                block.remove(d)


def collection(name, parent=None):
    coll = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def signed_area(pts):
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))


def prism(name, outline, z0, z1, coll, role):
    """Closed prism over a convex outline (counter-clockwise seen from above after the fix-up)."""
    pts = [tuple(p) for p in outline]
    if signed_area(pts) < 0:
        pts.reverse()
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in pts]
    top = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.color = COLORS[role]
    ob["tm_role"] = role
    coll.objects.link(ob)
    return ob


def box(name, x0, x1, y0, y1, z0, z1, coll, role):
    return prism(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, coll, role)


def poly_curve(name, pts, coll):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, 0.0, 1.0)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    return ob


def camera(name, coll, loc, rot_deg=None, target=None, f_px=None, res=REF_RES, shift_y=0.0, lens_mm=None):
    cam = bpy.data.cameras.new(name)
    cam.clip_start, cam.clip_end = 0.5, 2000.0
    if f_px is not None:            # pixel focal on the vertical axis: lens = f_px * sensor_height / image height
        cam.sensor_fit = "VERTICAL"
        cam.sensor_height = 24.0
        cam.lens = f_px * 24.0 / res[1]
    else:
        cam.sensor_fit = "HORIZONTAL"
        cam.sensor_width = 36.0
        cam.lens = lens_mm
    cam.shift_y = shift_y           # VERTICAL fit: in units of the image height
    ob = bpy.data.objects.new(name, cam)
    ob.location = loc
    if target is not None:
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    else:
        ob.rotation_euler = [math.radians(a) for a in rot_deg]
    ob["tm_resolution"] = list(res)
    coll.objects.link(ob)
    return ob


def build_option(key, opt, plan, levels, root_plan, root_mass):
    edge, wall = opt["balcony_edge"], opt["wall_line"]
    pc = collection(f"PLAN_{key}", root_plan)
    poly_curve(f"plan_{key}_balcony_edge", edge, pc)
    poly_curve(f"plan_{key}_wall_line", wall, pc)
    mc = collection(f"MASSING_{key}", root_mass)
    podium_top, roof_top = levels["podium_top"], levels["roof_slab_top"]
    roof_bot = roof_top - levels["roof_edge"]
    prism(f"m{key}_podium", edge, 0.0, podium_top, mc, "podium")
    prism(f"m{key}_tower", wall, podium_top, roof_bot, mc, "tower")
    for n in range(1, levels["residential_floors"]):
        top = podium_top + n * levels["storey"]
        prism(f"m{key}_slab_{n + 1:02d}", edge, top - levels["slab_edge"], top, mc, "slab")
    prism(f"m{key}_roof", edge, roof_bot, roof_top, mc, "roof")
    f = plan["front"]
    y_edge, y_wall = f["y_front"], f["y_front"] + f["balcony_depth"]
    for i, (x0, x1) in enumerate(f["piers_on_wall_line"]):
        box(f"m{key}_pier_{i}", x0, x1, y_edge, y_wall, podium_top, roof_bot, mc, "pier")
    e = f["entrance"]
    box(f"m{key}_entrance", -e["half_width"], e["half_width"], y_edge - e["projection"], y_edge, 0.0, levels["ground_floor_top"], mc, "entrance")
    return mc


def set_visible(root_name, keep):
    lc = bpy.context.view_layer.layer_collection.children[root_name]
    for child in lc.children:
        child.exclude = child.name not in keep


def setup_render(sc):
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "OBJECT"
    sh.show_shadows = True
    sh.shadow_intensity = 0.45
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    sh.show_object_outline = True
    sh.object_outline_color = (0.08, 0.08, 0.08)
    sc.display.light_direction = (-0.45, -0.55, 0.70)     # from the front-left, high: the front reads lit like b8
    sc.display.render_aa = "8"
    sc.view_settings.view_transform = "Standard"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_percentage = 100


def main():
    keys, cams_wanted, do_render, do_save = parse_args()
    plan = C.load_json(PLAN_OPTIONS)
    cal = C.load_json(CAL)
    levels = plan["levels_m"]
    clear_file()
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    root_plan = collection("TM_REBUILD_PLAN")
    root_mass = collection("TM_REBUILD_MASSING")
    ctx = collection("TM_REBUILD_CONTEXT")
    rig = collection("TM_REBUILD_CAMERAS")
    for key, opt in plan["options"].items():
        build_option(key, opt, plan, levels, root_plan, root_mass)
    if os.path.exists(PLAN):
        approved = C.load_json(PLAN)
        key = approved["approved"]["option"]
        ph = approved["layers"]["penthouse"]
        prism(f"m{key}_penthouse", ph["outline"], ph["z"][0], ph["z"][1], bpy.data.collections[f"MASSING_{key}"], "penthouse")
    box("ground", -60, 60, -70, 60, -0.05, 0.0, ctx, "ground")

    cb, ca = cal["camera_b8"], cal["aerial"]["camera"]
    pier_plane_y = plan["front"]["y_front"] + plan["front"]["balcony_depth"]
    cams = {
        "b8": camera("CAM_B8", rig, (0.0, pier_plane_y - cb["pier_plane_distance_m"], cb["camera_height_m"]), rot_deg=(90, 0, 0),
                     f_px=cb["focal_px"], shift_y=cb["shift_y"]),
        "aerial": camera("CAM_AERIAL", rig, tuple(ca["location"]), rot_deg=(90 - ca["pitch_down_deg"], 0, 0), f_px=ca["focal_px"]),
        "rear": camera("CAM_REAR", rig, (46.0, 52.0, 34.0), target=(0.0, -1.0, 12.5), res=REAR_RES, lens_mm=35.0),
    }
    setup_render(sc)
    os.makedirs(OUT_DIR, exist_ok=True)
    written = []
    if do_render:
        for key in keys:
            set_visible("TM_REBUILD_MASSING", {f"MASSING_{key}"})
            blocks = bpy.data.collections[f"MASSING_{key}"].objects
            for name in cams_wanted:
                ob = cams[name]
                sc.camera = ob
                sc.display.shading.show_shadows = name == "rear"
                for block in blocks:
                    block.hide_render = name == "aerial" and block.get("tm_role") != "roof"
                sc.render.resolution_x, sc.render.resolution_y = ob["tm_resolution"]
                bpy.context.view_layer.layer_collection.children["TM_REBUILD_CONTEXT"].exclude = name != "rear"
                sc.render.filepath = os.path.join(OUT_DIR, f"{key}_{name}.png")
                bpy.ops.render.render(write_still=True)
                written.append(sc.render.filepath)
        for coll in bpy.data.collections:
            for block in coll.objects:
                block.hide_render = False
        sc.display.shading.show_shadows = True
    # leave the file showing the first option from the b8 camera
    set_visible("TM_REBUILD_MASSING", {f"MASSING_{keys[0]}"})
    set_visible("TM_REBUILD_PLAN", {f"PLAN_{k}" for k in plan["options"]})
    bpy.context.view_layer.layer_collection.children["TM_REBUILD_CONTEXT"].exclude = False
    sc.camera = cams["b8"]
    sc.render.resolution_x, sc.render.resolution_y = REF_RES
    if not bpy.app.background:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces[0].shading.type = "SOLID"
                area.spaces[0].shading.color_type = "OBJECT"
                area.spaces[0].region_3d.view_perspective = "CAMERA"
    if do_save:
        os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("MASSING", json.dumps({"options": keys, "renders": len(written), "blend": OUT_BLEND if do_save else None}))
    return written


if __name__ == "__main__":
    main()
