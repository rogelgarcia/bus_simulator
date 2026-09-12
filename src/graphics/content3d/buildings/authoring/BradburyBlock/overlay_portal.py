"""Headless overlay render of the portal for reference comparison.

    blender -b bradbury_portal.blend -P overlay_portal.py -- [--out DIR] [--dist D] [--height H] [--lens L] [--size WxH]

Renders a straight frontal view (camera at street level, no tilt, vertical
shift to frame the portal; the default distance / height / lens reproduce the
reference photo's perspective, see README) twice with a transparent film: surfaces only, and
surfaces plus Freestyle edge lines (purple, 3 px). Also writes
`overlay_features.json` with the pixel position of named model features, so
overlay_compose.py can align the render on a photo and draw arrows.
"""
import bpy, os, sys, json, argparse
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", default=None)
ap.add_argument("--dist", type=float, default=6.75, help="camera distance in front of the pilaster faces (m); 6.75 = the model's 3.20 m door set (2.6 m deep) appears as wide as the photo's")
ap.add_argument("--height", type=float, default=1.66, help="camera height above the threshold (m); 1.66 = the reference photo (door sill row)")
ap.add_argument("--lens", type=float, default=32.0)
ap.add_argument("--size", default="1600x2000")
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--opaque", action="store_true", help="render one opaque frontal image (frontal.png) instead of the overlay passes")
args = ap.parse_args(argv)

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath))
OUT = args.out or os.path.normpath(os.path.join(HERE, "..", "..", "..", "screens", "bradbury_fix", "portal_project", "overlay"))
os.makedirs(OUT, exist_ok=True)

S = bpy.context.scene
w, h = (int(v) for v in args.size.lower().split("x"))
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = w, h, 100
S.render.film_transparent = not args.opaque
S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_mode = 'RGBA'
S.render.engine = 'CYCLES'
try:
    cp = bpy.context.preferences.addons["cycles"].preferences
    cp.compute_device_type = "OPTIX"; cp.get_devices()
    for d in cp.devices: d.use = d.type in ('OPTIX', 'CPU')
    S.cycles.device = 'GPU'
except Exception:
    S.cycles.device = 'CPU'
S.cycles.samples = args.samples; S.cycles.use_denoising = True

# frontal camera: level, shifted up so the whole portal (sidewalk to band) sits in frame
FACE_Y = -2.90
cam_data = bpy.data.cameras.new("overlay_cam"); cam = bpy.data.objects.new("overlay_cam", cam_data)
S.collection.objects.link(cam); S.camera = cam
cam.location = Vector((0.0, FACE_Y - args.dist, args.height))
cam.rotation_euler = (1.5707963, 0.0, 0.0)          # looking along +y, level
cam_data.lens = args.lens; cam_data.sensor_fit = 'VERTICAL'; cam_data.sensor_height = 36.0
# vertical shift so the frame centre is at mid-height of the portal (about 2.3 m)
mid_z = 2.3
cam_data.shift_y = (mid_z - args.height) / (2.0 * args.dist * (18.0 / args.lens))

# features to project: world points, or ("bbox", object, sx, sy, sz) = a corner/mid of that object's world bounding box,
# so the sheet compares the model's actual geometry (min/max/mid per axis; y min = the street-side face)
FEATURES = {
    # pilaster face plane (y -2.90)
    "sidewalk_left": (-2.33, FACE_Y, -0.12), "sidewalk_right": (2.33, FACE_Y, -0.12),
    "pilaster_L_outer_top": (-2.33, FACE_Y, 4.13), "pilaster_R_outer_top": (2.33, FACE_Y, 4.13),
    "pilaster_L_inner": (-1.605, FACE_Y, 2.0), "pilaster_R_inner": (1.605, FACE_Y, 2.0),
    "panel_L_outer": ("bbox", "pilaster_L_panel_molding", "min", "min", "mid"), "panel_L_inner": ("bbox", "pilaster_L_panel_molding", "max", "min", "mid"),
    "panel_R_outer": ("bbox", "pilaster_R_panel_molding", "max", "min", "mid"), "panel_R_inner": ("bbox", "pilaster_R_panel_molding", "min", "min", "mid"),
    "panel_top": ("bbox", "pilaster_L_panel_molding", "mid", "min", "max"), "panel_bottom": ("bbox", "pilaster_L_panel_molding", "mid", "min", "min"),
    "capital_bottom": ("bbox", "pilaster_L_capital", "mid", "min", "min"), "capital_top": ("bbox", "pilaster_L_capital", "mid", "min", "max"),
    "capital_L_outer": ("bbox", "pilaster_L_capital", "min", "min", "max"), "capital_R_outer": ("bbox", "pilaster_R_capital", "max", "min", "max"),
    "band_bottom": (0.0, FACE_Y, 4.13), "band_top": (0.0, FACE_Y, 4.80),
    "letters_top": ("bbox", "frieze_letters", "mid", "min", "max"), "letters_bottom": ("bbox", "frieze_letters", "mid", "min", "min"),
    "letters_L": ("bbox", "frieze_letters", "min", "min", "mid"), "letters_R": ("bbox", "frieze_letters", "max", "min", "mid"),
    "plinth_top": (-2.33, FACE_Y, 0.56), "plinth_step": (-2.33, FACE_Y, 0.48),
    # arch face plane (y -2.70)
    "ring_outer_crown": ("bbox", "arch_band", "mid", "min", "max"), "ring_inner_crown": (0.0, -2.724, 3.73),
    "arch_apex": (0.0, -2.70, 3.6135), "soffit_apex": ("bbox", "soffit_molding", "mid", "min", "max"),
    "keystone_top": ("bbox", "arch_keystone", "mid", "min", "max"), "keystone_bottom": ("bbox", "arch_keystone", "mid", "min", "min"),
    "keystone_L_top": ("bbox", "arch_keystone", "min", "min", "max"), "keystone_R_top": ("bbox", "arch_keystone", "max", "min", "max"),
    "keystone_L_bot": (-0.10, -2.73, 3.62), "keystone_R_bot": (0.10, -2.73, 3.62),
    "ring_outer_spring_L": ("bbox", "arch_band", "min", "min", "min"), "ring_outer_spring_R": ("bbox", "arch_band", "max", "min", "min"),
    "arch_spring_L": (-1.3635, -2.70, 2.25), "arch_spring_R": (1.3635, -2.70, 2.25),
    # piers (front face y -2.53)
    "pier_inner_L": ("bbox", "pillar_L_front", "max", "min", "mid"), "pier_inner_R": ("bbox", "pillar_R_front", "min", "min", "mid"),
    "pier_outer_L": ("bbox", "pillar_L_front", "min", "min", "mid"), "pier_outer_R": ("bbox", "pillar_R_front", "max", "min", "mid"),
    "pier_capital_top": ("bbox", "pillar_L_front_capital", "mid", "min", "max"), "pier_capital_bottom": ("bbox", "pillar_L_front_capital", "mid", "min", "min"),
    "pier_capital_L_inner": ("bbox", "pillar_L_front_capital", "max", "min", "max"), "pier_capital_R_inner": ("bbox", "pillar_R_front_capital", "min", "min", "max"),
    "pier_plinth_top": (-1.43, -2.53, 0.44),
    # door plane (recessed: its apparent size depends on the camera distance)
    "door_L": ("bbox", "door_frame", "min", "min", "mid"), "door_R": ("bbox", "door_frame", "max", "min", "mid"),
    "door_sill": ("bbox", "door_frame", "mid", "min", "min"), "door_head": ("bbox", "door_1", "mid", "min", "max"),
    "transom_bottom": ("bbox", "door_transom_glass", "mid", "min", "min"), "transom_top": ("bbox", "door_transom_glass", "mid", "min", "max"),
    "door_plane": ("bbox", "door_frame", "mid", "min", "min"),
    "step_front": ("bbox", "slab_step", "mid", "min", "max"),
}
def bbox_point(obj_name, sx, sy, sz):
    o = bpy.data.objects[obj_name]
    pts = [o.matrix_world @ Vector(b) for b in o.bound_box]
    pick = lambda vals, how: min(vals) if how == "min" else max(vals) if how == "max" else (min(vals) + max(vals)) / 2.0
    return Vector((pick([p.x for p in pts], sx), pick([p.y for p in pts], sy), pick([p.z for p in pts], sz)))
bpy.context.view_layer.update()                      # the new camera's matrix must be evaluated before projecting
feat_px, feat_world = {}, {}
for name, spec in FEATURES.items():
    P = bbox_point(*spec[1:]) if spec[0] == "bbox" else Vector(spec)
    v = world_to_camera_view(S, cam, P)
    feat_px[name] = [round(v.x * w, 1), round((1.0 - v.y) * h, 1)]
    feat_world[name] = [round(P.x, 3), round(P.y, 3), round(P.z, 3)]
json.dump({"size": [w, h], "camera": {"dist": args.dist, "height": args.height, "lens": args.lens}, "features": feat_px, "world": feat_world},
          open(os.path.join(OUT, "overlay_features.json"), "w"), indent=1)

if args.opaque:
    S.render.filepath = os.path.join(OUT, "frontal.png"); bpy.ops.render.render(write_still=True)
    print("FRONTAL DONE ->", OUT); sys.exit(0)
# hide the wide sidewalk slab so only the portal is rendered
for o in bpy.data.objects:
    if o.type == 'MESH' and (o.dimensions.x > 6.0 or "sidewalk" in o.name.lower()): o.hide_render = True
# pass 1: surfaces only
S.render.use_freestyle = False
S.render.filepath = os.path.join(OUT, "overlay_surfaces.png"); bpy.ops.render.render(write_still=True)
# pass 2: with Freestyle edge lines (purple, 2 px)
S.render.use_freestyle = True; S.render.line_thickness_mode = 'ABSOLUTE'; S.render.line_thickness = 3.0
vl = bpy.context.view_layer; vl.use_freestyle = True
fs = vl.freestyle_settings; fs.crease_angle = 2.0943951   # 120 degrees
if not fs.linesets: fs.linesets.new("edges")
ls = fs.linesets[0]; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True; ls.select_edge_mark = False
style = ls.linestyle or bpy.data.linestyles.get("overlay_purple") or bpy.data.linestyles.new("overlay_purple")
ls.linestyle = style
style.color = (0.55, 0.05, 0.85); style.thickness = 3.0; style.alpha = 1.0
S.render.filepath = os.path.join(OUT, "overlay_lines.png"); bpy.ops.render.render(write_still=True)
print("OVERLAY DONE ->", OUT)
