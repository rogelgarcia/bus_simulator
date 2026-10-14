# check_layers.py -- AI 643+: Workbench check renders of the rebuild's layers. Headless only; never saves the file.
#
#   blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend --python check_layers.py -- out=<dir>
#           [cams=b8,top,rear]
#
#   check_b8.png    CAM_B8, transparent, no shadows, flat colours per element (the edges compose_checks.py lays on b8)
#   check_b8_sightline.png  CAM_B8 with only the roof and ground slabs, stand-in walls (the tower wall line up to the roof
#                   slab, the podium outline up to the podium top) and, in red, everything that must stay out of b8's view:
#                   the core and every object tagged rb_hide_from_b8 (the penthouse, its annex, solar rows, units).
#                   Every red pixel left is seen over the roof -- compose_checks.py counts them, it must be 0
#   check_aerial.png  CAM_AERIAL (fitted to the aerial's roof plane) with only the roof-level objects
#   check_top.png   CAM_TOP with the roof slab cut away (onto the top residential floor) and the plan outlines drawn
#                   above it: balcony edge blue, tower wall line green, roof guard orange, penthouse magenta
#   check_rear.png  CAM_REAR with shadows
# The rig (sky, sun, ground) is left out: these are geometry checks; render_poses.py gives the lit views. Run on the
# composition (2026-10-14), whose parts are linked and read-only, it first makes their collections and objects local in
# this session (never saved) so it can recolour and hide them.
import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

ELEMENT_COLORS = {
    "slab": (0.82, 0.80, 0.76, 1), "pilaster": (0.60, 0.56, 0.50, 1), "column": (0.52, 0.58, 0.66, 1),
    "core": (0.86, 0.16, 0.14, 1), "entrance_jamb": (0.60, 0.56, 0.50, 1),
    "frame": (0.06, 0.06, 0.07, 1), "glass": (0.55, 0.70, 0.80, 1), "wood": (0.55, 0.32, 0.15, 1),
    "paving": (0.62, 0.60, 0.56, 1), "guard": (0.45, 0.62, 0.72, 1), "threshold": (0.75, 0.73, 0.68, 1),
    "downlight": (0.95, 0.95, 0.90, 1),
    "podium_stone": (0.84, 0.81, 0.75, 1), "podium_frame": (0.06, 0.06, 0.07, 1), "podium_glass": (0.55, 0.70, 0.80, 1),
    "podium_wood": (0.55, 0.32, 0.15, 1), "lantern": (0.10, 0.10, 0.10, 1), "sign": (0.18, 0.14, 0.10, 1),
}
GUIDE_COLORS = {"balcony_edge": (0.10, 0.45, 0.95, 1), "tower_wall_line": (0.10, 0.70, 0.30, 1),
                "roof_guard_line": (0.95, 0.60, 0.10, 1), "penthouse": (0.85, 0.20, 0.65, 1), "entrance": (0.55, 0.30, 0.10, 1)}


def workbench(scene, shadows):
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "OBJECT"
    sh.show_shadows = shadows
    sh.shadow_intensity = 0.45
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    sh.show_object_outline = True
    sh.object_outline_color = (0.08, 0.08, 0.08)
    scene.display.light_direction = (-0.45, -0.55, 0.70)
    scene.display.render_aa = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0.0
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100


def render(scene, cam, path):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = cam["tm_resolution"]
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("CHECK", path)


def sightline(scene, cam, path):
    """CAM_B8 with the roof slab, the core and temporary stand-ins for the envelope; restores visibility after."""
    plan = L.load_plan()
    st, lay = plan["structure"], plan["layers"]
    keep = {"core"}
    hidden, recoloured = [], []
    for ob in bpy.data.collections[L.ROOT].all_objects:
        if ob.get("rb_hide_from_b8"):
            recoloured.append((ob, tuple(ob.color)))
            ob.color = ELEMENT_COLORS["core"]
            continue
        if not (ob.get("rb_element") in keep or (ob.get("rb_element") == "slab" and ob.get("rb_name") in ("roof", "ground"))):
            if not ob.hide_render:
                ob.hide_render = True
                hidden.append(ob)
    tmp = L.ensure_collection("CHECK_STANDINS")
    podium_top, roof_bot = plan["levels_m"]["podium_top"], plan["levels_m"]["roof_slab_bottom"]
    stand = [L.prism("standin_tower", tmp, L.ccw([tuple(p) for p in lay["tower_wall_line"]["outline"]]), [(podium_top, roof_bot)],
                     "TM_RB_hidden", {}),
             L.prism("standin_podium", tmp, L.ccw([tuple(p) for p in lay["podium"]["outline"]]), [(st["ground_floor_level"], podium_top)],
                     "TM_RB_hidden", {})]
    for ob in stand:
        ob.color = (0.75, 0.75, 0.75, 1)
    workbench(scene, shadows=False)
    render(scene, cam, path)
    L.clear_collection(tmp)
    bpy.data.collections.remove(tmp)
    for ob in hidden:
        ob.hide_render = False
    for ob, col in recoloured:
        ob.color = col


def roof_level(scene, cam, path, z_min):
    """Only what stands at roof level or above, from the given camera."""
    hidden = []
    for ob in bpy.data.collections[L.ROOT].all_objects:
        top = max((ob.matrix_world @ v.co).z for v in ob.data.vertices) if ob.type == "MESH" and ob.data.vertices else -1e9
        if top < z_min and not ob.hide_render:
            ob.hide_render = True
            hidden.append(ob)
    workbench(scene, shadows=False)
    render(scene, cam, path)
    for ob in hidden:
        ob.hide_render = False


def localize():
    """Make the linked parts' collections (parents first) and objects local in this session; meshes stay linked."""
    queue, n = list(bpy.context.scene.collection.children), 0
    while queue:
        coll = queue.pop(0)
        if coll.library:
            coll = coll.make_local()
            n += 1
        queue.extend(coll.children)
    for ob in [o for o in bpy.data.objects if o.library]:
        ob.make_local()
        n += 1
    return n


def main():
    if not bpy.app.background:
        raise SystemExit("check_layers.py changes visibility and render settings: run it headless (it never saves)")
    opts = L.args()
    out = os.path.abspath(opts.get("out") or os.path.join(L.C.REBUILD_SCREENS, "checks"))
    cams_wanted = [c for c in opts.get("cams", "b8,top,rear,aerial").split(",") if c]
    os.makedirs(out, exist_ok=True)
    if bpy.data.libraries:
        print("LOCALIZED", localize())
    scene = bpy.context.scene
    vl = bpy.context.view_layer
    if "INSPECTION_RIG" in vl.layer_collection.children:
        vl.layer_collection.children["INSPECTION_RIG"].exclude = True
    for ob in bpy.data.collections[L.ROOT].all_objects:
        ob.color = ELEMENT_COLORS.get(ob.get("rb_element"), (0.7, 0.7, 0.7, 1))
    cams = {k: bpy.data.objects[f"CAM_{k.upper()}"] for k in ("b8", "top", "rear", "aerial")}
    if "b8" in cams_wanted:
        workbench(scene, shadows=False)
        render(scene, cams["b8"], os.path.join(out, "check_b8.png"))
    if "b8" in cams_wanted:
        sightline(scene, cams["b8"], os.path.join(out, "check_b8_sightline.png"))
    if "aerial" in cams_wanted:
        roof_level(scene, cams["aerial"], os.path.join(out, "check_aerial.png"), L.load_plan()["levels_m"]["roof_slab_top"] - 0.01)
    if "rear" in cams_wanted:
        workbench(scene, shadows=True)
        render(scene, cams["rear"], os.path.join(out, "check_rear.png"))
    if "top" in cams_wanted:
        workbench(scene, shadows=False)
        roof_top = L.load_plan()["levels_m"]["roof_slab_top"]
        for ob in bpy.data.collections[L.ROOT].all_objects:
            if ob.get("rb_element") == "slab" and ob.get("rb_name") == "roof":
                ob.hide_render = True
        guides = bpy.data.collections.get(L.PLAN_GUIDES)
        if guides is not None:
            guides.hide_render = False
            for ob in guides.objects:
                key = ob.name.replace("guide_", "")
                ob.data.bevel_depth = 0.07
                ob.location.z = roof_top + 4.0
                ob.color = GUIDE_COLORS.get(key, (0.2, 0.2, 0.2, 1))
        render(scene, cams["top"], os.path.join(out, "check_top.png"))


if __name__ == "__main__":
    main()
