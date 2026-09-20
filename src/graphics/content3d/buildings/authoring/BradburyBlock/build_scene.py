# The Bradbury block's RENDER SCENE, built as its own file (user 2026-09-20: "keep it a separate scene/file").
#
# assemble_building.py stays a model builder: it writes bradbury_block.blend and nothing else. This script writes
# bradbury_scene.blend beside it, which LINKS that block rather than copying it, so the block can go on being rebuilt
# (three minutes a time) and the scene picks the new geometry up the moment it is opened again. The scene carries what
# a render needs and the model must not: the environment, the light, the cameras and the film settings.
#
# The environment is the game's own: assets/public/lighting/hdri/german_town_street_2k.hdr, the default entry of
# src/graphics/content3d/catalogs/IBLCatalog.js, so a Cycles still and the engine light the block from the same sky.
# The sun's own place in that sky is measured here rather than guessed: the brightest texels of the map are averaged
# into one direction (its equirectangular mapping inverted) and the sun lamp, when one is asked for, is put there, so
# its shadows fall the way the environment's own light does.
#
#   blender -b -P build_scene.py -- [key=value ...] [view ...]
#     build only:            blender -b -P build_scene.py --
#     build and render:      blender -b -P build_scene.py -- samples=192 st_corner st_portal
#   keys: hdri (strength, 1.0), rot (the map turned about z, degrees), sun (a lamp on the map's own sun, 0 = none),
#         exposure, samples, pct, res, views listed by name (see VIEWS).
import bpy, os, sys, math, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
names = [a for a in argv if "=" not in a]
HDRI_STRENGTH = float(args.get("hdri", 1.0))
HDRI_ROT = float(args.get("rot", 0.0))          # degrees about z: turns the whole sky, sun included
SUN = float(args.get("sun", 0.0))               # 0: the map lights the block by itself
EXPO = float(args.get("exposure", 0.0))
SAMPLES = int(args.get("samples", 128))
PCT = int(args.get("pct", 100))
RES = int(args.get("res", 1920))

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))   # the repo (worktree) root, as assemble_building.py finds it
ART = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury", "portal_project")
BLOCK = os.path.join(ART, "bradbury_block.blend")
SCENE = os.path.join(ART, "bradbury_scene.blend")
HDRI = os.path.join(ROOT, "assets", "public", "lighting", "hdri", "german_town_street_2k.hdr")
SHOTS = os.path.join(ROOT, "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "scene")
for p in (BLOCK, HDRI): assert os.path.isfile(p), f"missing: {p}"
os.makedirs(SHOTS, exist_ok=True)

# The block's ground is its sidewalk top, Z_GROUND 0.201 in assemble_building.py; a standing eye is EYE above it.
Z_GROUND, EYE = 0.201, 1.62
# (from, to, lens). The east face is Broadway (x about 17), the south face 3rd Street (y about -17.9), the chamfer
# between them; the portals stand on the east and south faces and on the chamfer's flank.
VIEWS = {
    "st_corner":  ((41.0, -41.0, Z_GROUND + EYE), (14.6, -15.6, 11.0), 28),   # across the crossing, the chamfer corner whole
    "st_portal":  ((30.0, 1.40, Z_GROUND + EYE), (17.0, 1.40, 6.5), 35),      # on the far pavement, square to the Broadway portal
    "st_along":   ((24.5, -21.0, Z_GROUND + EYE), (16.9, 6.0, 9.0), 35),      # down the Broadway pavement, the facade running away
    "st_up":      ((21.5, -6.0, Z_GROUND + EYE), (16.9, -5.0, 16.0), 24),     # close under the wall, looking up its whole height
    "hero_3q":    ((56.0, -50.0, 19.0), (-7.0, 1.0, 9.8), 42),                # the block from the south-east, as the showcase has it
}

# ---------------------------------------------------------------- a fresh file with the block linked into it
bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
S.name = "BRADBURY_SCENE"

with bpy.data.libraries.load(BLOCK, link=True, relative=True) as (src, dst):
    dst.objects = list(src.objects)
linked = bpy.data.collections.new("BRADBURY_BLOCK")
S.collection.children.link(linked)
n_link = 0
for o in dst.objects:
    if o is None: continue
    linked.objects.link(o); n_link += 1
print(f"the block linked from {os.path.basename(BLOCK)}: {n_link} objects (linked, not copied: rebuild the block and "
      f"this scene follows)")
# the model file carries an inspection rig of its own; the scene lights and frames the block itself
for o in list(linked.objects):
    if o.type in {'CAMERA', 'LIGHT'}: linked.objects.unlink(o)

# ---------------------------------------------------------------- the sky: the game's own HDRI
env_img = bpy.data.images.load(HDRI, check_existing=True)
W = bpy.data.worlds.new("BRADBURY_SKY"); S.world = W
W.use_nodes = True; nt = W.node_tree; nt.nodes.clear()
w_out = nt.nodes.new('ShaderNodeOutputWorld'); w_out.location = (600, 0)
w_bg = nt.nodes.new('ShaderNodeBackground'); w_bg.location = (380, 0)
w_bg.inputs["Strength"].default_value = HDRI_STRENGTH
w_env = nt.nodes.new('ShaderNodeTexEnvironment'); w_env.image = env_img; w_env.location = (100, 0)
w_map = nt.nodes.new('ShaderNodeMapping'); w_map.location = (-120, 0)
w_map.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(HDRI_ROT))
w_tc = nt.nodes.new('ShaderNodeTexCoord'); w_tc.location = (-340, 0)
nt.links.new(w_tc.outputs["Generated"], w_map.inputs["Vector"])
nt.links.new(w_map.outputs["Vector"], w_env.inputs["Vector"])
nt.links.new(w_env.outputs["Color"], w_bg.inputs["Color"])
nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

def hdri_sun_direction(img, rot_deg):
    # where the map's own sun stands: the brightest texels, averaged as directions. Blender maps an environment
    # equirectangularly as u = (atan2(y, -x) + pi) / 2pi and v = (atan2(z, hypot(x, y)) + pi/2) / pi, and its pixel
    # rows run from the bottom up; that mapping is inverted here and the map's own z rotation applied after.
    import numpy as np
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(buf)
    rgb = buf.reshape(h, w, 4)[:, :, :3]
    lum = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
    cut = np.quantile(lum, 0.99995)
    rows, cols = np.nonzero(lum >= cut)
    wts = lum[rows, cols]
    u = (cols + 0.5) / w; v = (rows + 0.5) / h                  # row 0 is the bottom of the map
    phi = u * 2.0 * math.pi - math.pi; theta = v * math.pi - math.pi / 2.0
    ct = np.cos(theta)
    d = np.stack([-np.cos(phi) * ct, np.sin(phi) * ct, np.sin(theta)], axis=1)
    v3 = (d * wts[:, None]).sum(axis=0); v3 /= (np.linalg.norm(v3) + 1e-12)
    dr = Matrix.Rotation(math.radians(rot_deg), 3, 'Z') @ Vector((float(v3[0]), float(v3[1]), float(v3[2])))
    return dr.normalized(), int(wts.size), float(lum.max()), float(lum.mean())

sun_dir, n_bright, l_max, l_mean = hdri_sun_direction(env_img, HDRI_ROT)
elev = math.degrees(math.asin(max(-1.0, min(1.0, sun_dir.z))))
azim = math.degrees(math.atan2(sun_dir.y, sun_dir.x))
print(f"the sky: {os.path.basename(HDRI)} {env_img.size[0]}x{env_img.size[1]}, strength {HDRI_STRENGTH:.2f}, turned "
      f"{HDRI_ROT:.0f} degrees; its own sun reads {elev:.1f} degrees up at azimuth {azim:.1f} "
      f"(from {n_bright} texels, peak {l_max:.0f} against a mean of {l_mean:.2f})")
if SUN > 0.0:
    sd = bpy.data.lights.new("scene_sun", 'SUN'); sd.energy = SUN; sd.angle = math.radians(0.53)
    sun = bpy.data.objects.new("scene_sun", sd); S.collection.objects.link(sun)
    sun.rotation_euler = (-sun_dir).to_track_quat('-Z', 'Y').to_euler()
    print(f"a sun lamp of {SUN:.1f} added on that direction, for shadows crisper than a 2k map can throw by itself")

# ---------------------------------------------------------------- cameras, film, and the render
cams = {}
for nm, (loc, tgt, lens) in VIEWS.items():
    cd = bpy.data.cameras.new(nm); cd.lens = lens
    c = bpy.data.objects.new(nm, cd); S.collection.objects.link(c)
    c.location = Vector(loc)
    c.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cams[nm] = c
S.camera = cams["st_corner"]
S.render.engine = 'CYCLES'
try:
    cp = bpy.context.preferences.addons["cycles"].preferences; cp.compute_device_type = "OPTIX"; cp.get_devices()
    for d in cp.devices: d.use = d.type in ('OPTIX', 'CPU')
    S.cycles.device = 'GPU'
except Exception:
    S.cycles.device = 'CPU'
S.cycles.samples = SAMPLES; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.01
S.cycles.use_denoising = True
try: S.cycles.denoiser = 'OPTIX' if S.cycles.device == 'GPU' else 'OPENIMAGEDENOISE'
except Exception: pass
S.render.film_transparent = False                      # the sky is part of the picture
S.render.resolution_x, S.render.resolution_y = RES, int(RES * 10 / 16)
S.render.resolution_percentage = PCT
S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_depth = '8'
S.view_settings.view_transform = 'AgX'; S.view_settings.exposure = EXPO; S.view_settings.gamma = 1.0
try: S.view_settings.look = 'AgX - Medium High Contrast'
except Exception as e: print("look not set:", e)

bpy.ops.wm.save_as_mainfile(filepath=SCENE, compress=True, relative_remap=True)
print(f"SCENE SAVED {SCENE} | {len(VIEWS)} cameras: {', '.join(VIEWS)}")

for nm in names:
    if nm not in cams: print(f"  no such view: {nm} (have {', '.join(VIEWS)})"); continue
    S.camera = cams[nm]; S.render.filepath = os.path.join(SHOTS, nm + ".png")
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"  {nm}: {time.time() - t:.0f}s -> {S.render.filepath}")
print("SCENE DONE")
