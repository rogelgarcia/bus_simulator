# The Bradbury block's RENDER SCENE, built as its own file (user 2026-09-20: "keep it a separate scene/file").
#
# assemble_building.py stays a model builder: it writes bradbury_block.blend and nothing else. This script writes
# bradbury_scene.blend beside it, which LINKS that block rather than copying it, so the block can go on being rebuilt
# (three minutes a time) and the scene picks the new geometry up the moment it is opened again. The scene carries what
# a render needs and the model must not: the environment, the light, the cameras and the film settings.
#
# The block stands on ground of its own. An HDRI is a picture at infinity: it lights the block beautifully but gives
# it nothing to meet and nothing to take its shadow, so on the map alone the block floats (user 2026-09-20). Both
# halves of the cure are here. A SHADOW CATCHER renders as whatever lies behind it yet still darkens where the block
# hides the sun and the sky, so the map's own road takes the contact shadow; and REAL GROUND -- the pavement, kerb and
# roadway the block would actually stand on -- is laid from the block's own outline in the game's catalog materials,
# which is what puts the base at the right height and in the right perspective, and runs out to the horizon (AI 574
# item 2): beyond the streets the far blocks are vacant lots with a sidewalk strip along their kerbs, the streets run
# on between them to GND_FAR, and every ground material hazes toward the sky at the horizon with the camera's
# distance (scn_haze, the sky section), so nothing ends in a seam. ground=street (the default) lays that ground over
# the catcher; ground=catch keeps only the catcher, over the map's own road; ground=none is the bare block. On the
# street ground stands the NEAR CONTEXT (AI 574 item 28, the context section): the walls, fence, hedge and dry tufts
# the photo has on the lots either side, and the game's own trees, linked from context_library.blend (which
# build_context.py writes once from the game's FBX pack) and placed from the TREES table; and beyond it the FAR
# CONTEXT (AI 574 item 29, the far context section): the photo's white and brick buildings, its trailer row, its
# tree lines and its hazy skyline, as grid-aligned boxes and more of the same trees out to 2 km, where the haze
# turns them into the photo's pale silhouettes by distance alone; and the STREET FURNITURE (AI 574 item 8, the
# furniture section): the photo's three lamp posts -- two high-mast lot lights whose heads stand over the horizon
# line, built here, and a black lantern post that is a CC0 model linked from the context library -- and its four
# vault covers set into the block's pavement by the kerb, each where the photo's is, measured and unprojected; and
# across Broadway the OFF-FRAME NEIGHBOUR (AI 574 item 7, the neighbour section): a twelve-storey tower on the E lot
# that no camera sees, stood where its shadow crosses the frame's bottom exactly as the photo's second shadow does.
# The SIDEWALK itself (AI 574 item 4, pavement_material in the ground section) is poured concrete scored into slabs
# from world metres -- transverse and longitudinal joints along the streets, a fan of radials with an arc joint on
# every corner apron, every slab its own tone, dirt in the joints and a grime line along the wall base read off the
# walls as occlusion -- lifted to the photo's warm sunlit tone.
#
# The environment is a sky from the game's own catalog: assets/public/lighting/hdri/kloofendal_43d_clear_puresky
# (Poly Haven, CC0, provenance in the .source.json beside it; the 2k copy is the IBLCatalog.js entry, the 4k copy is
# what this scene shows, because the reference stand sees 40 px of frame per degree of sky and a 2k map holds 6). It
# is a PURE SKY -- a clear midday sky with a crisp unclipped sun and nothing under the horizon -- chosen on 2026-09-25
# from five candidates against the reference photo (AI 574 item 1): every street-level map stood its own lamp posts
# and fields behind the block at the wrong scale, and this one lights the block the way the photo's afternoon does.
# Where its sun stands is measured, not guessed (hdri_sun_direction: the brightest texels averaged as directions, in
# Cycles' own equirectangular convention), and the map is TURNED so that sun stands where the photo's does, azimuth
# SUN_AZ_PHOTO +40, high behind the reference camera's right shoulder (measured from the photo, see the constant);
# the sun lamp is put exactly on the disc (its elevation is the map's own, 42.9), so the lamp and the map's sun throw
# one crisp shadow: Broadway's face sunlit, 3rd Street's in shade, and the block's own shadow lying across 3rd
# Street's road, as the photo has them. What the CAMERA sees of the sky is graded toward the photo's
# deeper blue on Light Path's camera-ray branch alone (SKY_SAT / SKY_VAL below); the light that reaches the block is
# the map's, untouched. Under the horizon a pure sky is flat grey, so the ground runs out to the horizon (item 2).
#
#   blender -b -P build_scene.py -- [key=value ...] [view ...]
#     build only:            blender -b -P build_scene.py --
#     build and render:      blender -b -P build_scene.py -- samples=192 st_corner st_portal
# History. From 2026-09-20 to 2026-09-26 the sky was the game's default german_town_street_2k.hdr, turned 250 degrees:
# an environment texture is a picture at infinity, so the 5.5 m sapling 5.8 m from that map's tripod towered over the
# 20.5 m block like a 35 m tree from every stand (user: "the tree behind the building, it is giant"), and 250 was the
# one turn (a sweep of the circle, sweep_rot.py) that stood the map's open field behind the block in all five views.
# The lamp stood on a MIRRORED reading of that map's sun (azimuth 33.9, 18.7 degrees up, the block's shadow lying
# across 3rd Street); the reading Cycles really makes of it is azimuth 74 at that turn (AI 574 item 9, verified by
# render). hdri=german rot=250 sun_az=map gives that scene back on the corrected reading.
#
#   keys: hdri (the sky: kloofendal, the default, its 4k copy or else the 2k; kloofendal_2k; german; or a .hdr path;
#         a NUMBER is the sky's strength, as this key meant before), strength (the sky's strength, 1.0), rot (auto,
#         the default: the map turned about z so its own sun stands at sun_az; or degrees), sun (a lamp's strength,
#         8, 0 = none), sun_az (where the lamp stands, degrees from +x: +40, the photo's as measured; -60, the
#         prompt's reading; map: on the sky's own sun wherever the turn put it), sun_el (map, the default: the
#         sky's sun's own elevation; or degrees up),
#         sky_sat / sky_val (the camera-ray grade of the visible sky, see the sky section), ground (street | catch |
#         none), context (on | off: the near context's walls, hedge, tufts and trees and the far context's boxes,
#         tree lines and skyline, on the street ground only), furniture (on | off: the lamp posts and the vault
#         covers, with the context), neighbour (on | off: the off-frame tower across Broadway whose shadow crosses
#         the crossing, with the context),
#         block (fixed | game: the untouched export, its own scene and shots), wear (on | off | debug, see
#         below), wear_<feature> (that wear feature's strength, 1 = its calibrated look, 0 = off), exposure, samples,
#         pct, res, views listed by name (see VIEWS; ref_3q is the reference photo's own stand and renders in its
#         3:2 frame).
#
# THE WEAR LAYER (AI 563, the README's "The wear layer"). wear=on, the default, links the WORN block that wear_layer.py
# writes (wear/bradbury_block_worn.blend) instead of the block itself and sets the layer's controls on this scene: the
# custom properties every worn material reads (`wear`, `wear_<feature>`) and the wear-only collections (the debug
# view's source markers, geometry a feature adds). wear=off links the untouched block exactly as before the layer
# existed and writes bradbury_scene_wear_off.blend; wear=debug colours every mark by its feature over clay-grey
# surfaces, shows the sources, and writes bradbury_scene_wear_debug.blend. The canonical bradbury_scene.blend is the
# wear=on scene. A worn block older than the block or portal it was built from is refused (rerun wear_layer.py, or
# pass wear_stale=ok to render it anyway). render_wear.py flips a saved scene between the modes without a rebuild.
import bpy, os, sys, math, time
from mathutils import Vector, Matrix
from mathutils import noise as mnoise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
names = [a for a in argv if "=" not in a]
def _number(s):
    try: float(s); return True
    except ValueError: return False
SKY = args.get("hdri", "kloofendal")            # the sky map by name (SKIES below) or path; a number is its strength
HDRI_STRENGTH = float(args.get("strength", 1.0))   # the sky's strength; 1 is the map as photographed
if _number(SKY): HDRI_STRENGTH, SKY = float(SKY), "kloofendal"   # hdri=<number> was the strength key until item 1
HDRI_ROT = args.get("rot", "auto")              # auto: turned about z so the map's sun stands at sun_az; or degrees
SUN = float(args.get("sun", 8.0))               # the lamp on the sky's sun disc; 0: the map lights the block by itself
# The photo's sun, degrees from +x, MEASURED from the photo on 2026-09-26 (AI 574 item 1): its east face (Broadway)
# is the sunlit one and its south face (3rd Street) in shade -- hue-masked brick sRGB (196, 147, 115) against (101,
# 66, 51), and no fire-escape shadows on the south face at all -- and the block's own shadow across 3rd Street's
# road, its edge unprojected through the ref_3q camera, runs from the corner base at azimuth -136: a sun at about
# +40 (+-4), behind the camera's RIGHT shoulder, 42.9 degrees up as the map has it (the review's scripts/brick_mean.py,
# shadow_edge.py and unproject_ground.py; the numbers in tests/artifacts/screens/bradbury_scene/item1_sky/
# item1_numbers.md). The prompt's -60, behind the left shoulder, was a hand reading of 2026-09-25 that lit the
# wrong face; +40 is also the side the light came from in the scene the user kept that day when the -60 lamp was
# reverted (item 10: the mirrored reading's lamp stood at 33.9). sun_az=-60 still gives that lighting on demand.
SUN_AZ_PHOTO = 40.0
SUN_AZ = args.get("sun_az", str(SUN_AZ_PHOTO))  # where the lamp stands, degrees from +x; 'map': on the sky's own sun
SUN_EL = args.get("sun_el", "map")              # its elevation: 'map', the sky's sun's own; or degrees up
SKY_SAT = float(args.get("sky_sat", 1.55))      # the visible sky's saturation, camera rays only (see the sky section)
SKY_VAL = float(args.get("sky_val", 2.4))       # its value, likewise; 1 / 1 shows the map as it lights the block
EXPO = float(args.get("exposure", 0.0))
SAMPLES = int(args.get("samples", 128))
PCT = int(args.get("pct", 100))
RES = int(args.get("res", 1920))
GROUND = args.get("ground", "street").lower()
BLOCK_KIND = args.get("block", "fixed").lower()
assert BLOCK_KIND in ("fixed", "game"), f"block: fixed | game, not {BLOCK_KIND}"
assert GROUND in ("street", "catch", "none"), f"ground: street | catch | none, not {GROUND}"
WEAR = args.get("wear", "on" if BLOCK_KIND == "fixed" else "off").lower()
assert WEAR in ("on", "off", "debug"), f"wear: on | off | debug, not {WEAR}"
assert BLOCK_KIND == "fixed" or WEAR == "off", "block=game is the untouched game export: it has no wear layer (wear=off)"

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
from wear import paths as wear_paths, controls as wear_controls
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))   # the repo (worktree) root, as assemble_building.py finds it
# block=game stands the UNTOUCHED game export in the same scene, on the same cameras, for a before and after from one
# pose. It is the file assemble_building.py itself opens, so nothing has to be kept in step by hand; it writes its own
# scene and its own shot folder so neither clobbers the other, and its ground is laid on the game's own outline, which
# is neither shrunk at the corner nor grown by a bay.
BRAD = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury")
ART = os.path.join(BRAD, "portal_project")
BLOCK = os.path.join(ART, "bradbury_block.blend") if BLOCK_KIND == "fixed" else os.path.join(BRAD, "before", "bradbury_block_before.blend")
SCENE = os.path.join(ART, "bradbury_scene.blend" if BLOCK_KIND == "fixed" else "bradbury_scene_before.blend")
# The sky maps by name, each a list of files in the game's HDRI folder, the first that exists taken: kloofendal is the
# 4k copy for the backdrop with the 2k catalog copy as its stand-in (the same map, its sun in the same place); german
# is the map the scene had until 2026-09-26. Anything else is a path.
HDRI_DIR = os.path.join(ROOT, "assets", "public", "lighting", "hdri")
SKIES = {
    "kloofendal":    ["kloofendal_43d_clear_puresky_4k.hdr", "kloofendal_43d_clear_puresky_2k.hdr"],
    "kloofendal_2k": ["kloofendal_43d_clear_puresky_2k.hdr"],
    "german":        ["german_town_street_2k.hdr"],
}
def sky_path(name):
    files = SKIES.get(name.lower(), [name])
    found = [p for p in (f if os.path.isabs(f) else os.path.join(HDRI_DIR, f) for f in files) if os.path.isfile(p)]
    assert found, f"no sky map for {name}: looked for {', '.join(files)} in {HDRI_DIR}"
    return found[0]
HDRI = sky_path(SKY)
SHOTS = os.path.join(ROOT, "tests", "artifacts", "screens", "bradbury_fix", "portal_project",
                     "scene" if BLOCK_KIND == "fixed" else "scene_before")
if BLOCK_KIND == "fixed" and WEAR != "on":           # the canonical scene and shot folder are the worn ones
    SCENE = os.path.join(ART, f"bradbury_scene_wear_{WEAR}.blend")
    SHOTS = SHOTS + f"_wear_{WEAR}"
if WEAR != "off":
    # the worn block, as wear_layer.py last wrote it, and only while it still matches what it was built from
    assert os.path.isfile(wear_paths.MANIFEST) and os.path.isfile(wear_paths.WORN_BLOCK), \
        "no worn block yet: run  blender -b -P wear_layer.py  first (or build with wear=off)"
    WEAR_MANIFEST = wear_controls.read_manifest()
    old = wear_controls.stale(WEAR_MANIFEST)
    if old and args.get("wear_stale", "").lower() != "ok":
        raise SystemExit(f"the worn block is older than {', '.join(old)}: rerun  blender -b -P wear_layer.py  "
                         f"(or pass wear_stale=ok to use it as it is)")
    WEAR_MODE, WEAR_STRENGTHS = wear_controls.parse(args, WEAR_MANIFEST, mode_default=WEAR)
    BLOCK = wear_paths.WORN_BLOCK
for p in (BLOCK, HDRI): assert os.path.isfile(p), f"missing: {p}"
os.makedirs(SHOTS, exist_ok=True)

# The block's ground is its sidewalk top, Z_GROUND 0.201 in assemble_building.py; a standing eye is EYE above it.
Z_GROUND, EYE = 0.201, 1.62
# (from, to, lens[, frame]). The east face is Broadway (x about 17), the south face 3rd Street (y about -17.9), the
# chamfer between them; the portals stand on the east and south faces and on the chamfer's flank. A view's frame is
# its width:height where that is not the scene's 16:10; it is kept on the camera object (`frame`), so render_wear.py
# renders the view in it too.
VIEWS = {
    "st_corner":  ((41.0, -41.0, Z_GROUND + EYE), (14.6, -15.6, 11.0), 28),   # from the far pavement across the crossing, the chamfer whole
    "st_portal":  ((30.0, 1.40, Z_GROUND + EYE), (17.0, 1.40, 6.5), 35),      # from the middle of Broadway, square to its portal
    "st_along":   ((24.5, -21.0, Z_GROUND + EYE), (16.9, 6.0, 9.0), 35),      # out in the crossing, the facade running away up Broadway
    "st_up":      ((21.5, -6.0, Z_GROUND + EYE), (16.9, -5.0, 16.0), 24),     # on the pavement under the wall, looking up its whole height
    "hero_3q":    ((56.0, -50.0, 19.0), (-7.0, 1.0, 9.8), 42),                # the block from the south-east, as the showcase has it
    # The reference photo's own stand (AI 574, 2026-09-25): the aerial corner view the scene is now judged against,
    # whose horizon sits 32% from the top, whose chamfer corner stands at 44% of the width and whose block fills 88%
    # of a 3:2 frame. First set by eye on an overlay (16 m up, 40 m off at azimuth -34, 35 mm; item 6), then measured
    # (item 12): a hue mask of the brick in the photo and in the render gives the wall ends, the cornice top, the
    # corner base and the corner column as fractions of the frame, and the stand that matches all five within 0.7%
    # is the eye 14.4 m over the pavement (the horizon crosses the block a floor lower than it seemed), 44.5 m from
    # the chamfer's midpoint (15.58, -16.46) at azimuth -30 (30 degrees south of east, so Broadway is seen squarer
    # than 3rd Street), 40 mm on the 36 mm sensor (the longer lens from further back is what lengthens both wall ends
    # to the photo's), aimed 3.8 m to the camera's right of the corner and down to z 9.76 (6.2 degrees), which puts
    # the horizon 32% down. Evidence tests/artifacts/screens/bradbury_scene/item12_camera/.
    "ref_3q":     ((54.12, -38.71, Z_GROUND + 14.4), (17.48, -13.17, 9.76), 40, (3, 2)),
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
if WEAR != "off":
    # the worn block's own objects (the debug view's source markers, geometry a wear feature adds) go into child
    # collections that the layer's controls show and hide; everything else stays as the block has it
    n_file = WEAR_MANIFEST["objects"]["worn_block_local"]
    assert n_link == n_file, f"linked {n_link} objects of the worn block's {n_file}"
    wear_controls.organise(linked)

# ---------------------------------------------------------------- the sky: a pure-sky map, turned to the photo's sun
# One map does two jobs and the world's tree keeps them apart. The LIGHT is the map as photographed: Generated
# coordinates, turned about z by the Mapping node, look the environment up and feed a Background of HDRI_STRENGTH,
# and that is what every ray but the camera's sees -- the block, the ground, the windows' reflections are lit and
# mirrored by the real sky. What the CAMERA sees is a second Background fed the same lookup through a Hue/Saturation
# node (SKY_SAT, SKY_VAL), and a Mix Shader driven by Light Path's Is Camera Ray picks it for camera rays only. The
# grade exists because the frame's sky lies 3 to 10 degrees over the horizon (the horizon is 32% down the frame and
# the camera tilts 6.2 degrees down), where this map is hazy and pale, while the photo's sky is a deep blue up to its
# top edge: ungraded, the frame's top-left corner (x 0.15, y 0.03) renders sRGB (135, 159, 184) against the photo's
# (130, 176, 225) -- the same brightness at half the blue. Turning the map or raising its strength changes the light
# on the block; the grade changes only the picture behind it. Saturation alone cannot reach the photo's blue: AgX
# desaturates as it compresses, and pushing the saturation drives red to zero (x2 gives (10, 130, 187)) while green
# and blue never rise, because the photo's blue is a BRIGHTER blue, linear (0.22, 0.43, 0.75) against the map's
# (0.21, 0.33, 0.55) at that point. Value and saturation together do reach it: the review's scripts/sky_tune.py
# swept both on the saved scene (2 s a render of the sky band) and measure_sky.py sampled the frame points, and
# saturation x1.55 with value x2.4 lands the top-left corner at (131, 182, 223) with the map turned to -60, where
# it was swept, and (132, 181, 222) turned to +40, within 6 levels on every channel either way, the horizon staying
# pale (x 0.96, y 0.20: (199, 204, 212); the photo's (209, 228, 240)). The photo's sky pales from left to right,
# toward the anti-solar point, and turned to +40 the map does too, less: the top-right corner (162, 195, 225)
# against the photo's (186, 211, 237). That residual is left alone.
SKY_HUE = 0.5                                   # the Hue/Saturation node's neutral hue: the grade never turns the hue
env_img = bpy.data.images.load(HDRI, check_existing=True)
W = bpy.data.worlds.new("BRADBURY_SKY"); S.world = W
W.use_nodes = True; nt = W.node_tree; nt.nodes.clear()
w_out = nt.nodes.new('ShaderNodeOutputWorld'); w_out.location = (900, 0)
w_tc = nt.nodes.new('ShaderNodeTexCoord'); w_tc.location = (-340, 0)
w_map = nt.nodes.new('ShaderNodeMapping'); w_map.location = (-120, 0)
w_env = nt.nodes.new('ShaderNodeTexEnvironment'); w_env.image = env_img; w_env.location = (100, 0)
w_bg = nt.nodes.new('ShaderNodeBackground'); w_bg.name = w_bg.label = "SKY_LIGHT"; w_bg.location = (380, 120)
w_bg.inputs["Strength"].default_value = HDRI_STRENGTH
w_hsv = nt.nodes.new('ShaderNodeHueSaturation'); w_hsv.name = w_hsv.label = "SKY_GRADE"; w_hsv.location = (380, -120)
w_hsv.inputs["Hue"].default_value = SKY_HUE
w_hsv.inputs["Saturation"].default_value = SKY_SAT
w_hsv.inputs["Value"].default_value = SKY_VAL
w_seen = nt.nodes.new('ShaderNodeBackground'); w_seen.name = w_seen.label = "SKY_SEEN"; w_seen.location = (600, -120)
w_seen.inputs["Strength"].default_value = HDRI_STRENGTH
w_lp = nt.nodes.new('ShaderNodeLightPath'); w_lp.location = (380, 400)
w_mix = nt.nodes.new('ShaderNodeMixShader'); w_mix.name = w_mix.label = "SKY_MIX"; w_mix.location = (760, 0)
nt.links.new(w_tc.outputs["Generated"], w_map.inputs["Vector"])
nt.links.new(w_map.outputs["Vector"], w_env.inputs["Vector"])
nt.links.new(w_env.outputs["Color"], w_bg.inputs["Color"])
nt.links.new(w_env.outputs["Color"], w_hsv.inputs["Color"])
nt.links.new(w_hsv.outputs["Color"], w_seen.inputs["Color"])
nt.links.new(w_lp.outputs["Is Camera Ray"], w_mix.inputs["Fac"])
nt.links.new(w_bg.outputs["Background"], w_mix.inputs[1])       # Fac 0: every other ray lights by the map itself
nt.links.new(w_seen.outputs["Background"], w_mix.inputs[2])     # Fac 1: the camera sees the graded copy
nt.links.new(w_mix.outputs["Shader"], w_out.inputs["Surface"])

def hdri_sun_direction(img):
    # Where the map's own sun stands: the brightest 0.005% of texels averaged as directions, read in Cycles' own
    # equirectangular convention -- u = 0.5 - atan2(y, x) / 2pi (the centre column faces +x, u grows toward -y),
    # v = 0.5 + asin(z) / pi, row 0 at the bottom of the image. Poly Haven keeps its suns near u 0.6, azimuth -36.
    # The map's turn is not applied here: the Mapping node rotates the LOOKUP vector, so a texel at azimuth a is seen
    # at a - rot, and the caller derives the seen direction from the turn it chose.
    import numpy as np
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(buf)
    rgb = buf.reshape(h, w, 4)[:, :, :3]
    lum = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
    cut = np.quantile(lum, 0.99995)
    rows, cols = np.nonzero(lum >= cut)
    wts = lum[rows, cols]
    u = (cols + 0.5) / w; v = (rows + 0.5) / h                  # row 0 is the bottom of the map
    phi = (0.5 - u) * 2.0 * math.pi; theta = (v - 0.5) * math.pi
    ct = np.cos(theta)
    d = np.stack([np.cos(phi) * ct, np.sin(phi) * ct, np.sin(theta)], axis=1)
    v3 = (d * wts[:, None]).sum(axis=0); v3 /= (np.linalg.norm(v3) + 1e-12)
    return Vector((float(v3[0]), float(v3[1]), float(v3[2]))), int(wts.size), float(lum.max()), float(lum.mean())

map_sun, n_bright, l_max, l_mean = hdri_sun_direction(env_img)
map_el = math.degrees(math.asin(max(-1.0, min(1.0, map_sun.z))))
map_az = math.degrees(math.atan2(map_sun.y, map_sun.x))
# The turn. rot=auto stands the map's sun at sun_az (or at the photo's sun when the lamp is told to follow the map):
# a texel at azimuth a is seen at a - rot, so rot = a - target. An explicit rot turns the map as asked and the seen
# sun lands wherever that puts it.
target_az = float(SUN_AZ) if SUN_AZ.lower() != "map" else SUN_AZ_PHOTO
rot = (map_az - target_az) if HDRI_ROT.lower() == "auto" else float(HDRI_ROT)
w_map.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(rot))
seen_sun = Matrix.Rotation(math.radians(-rot), 3, 'Z') @ map_sun
seen_az = math.degrees(math.atan2(seen_sun.y, seen_sun.x))
print(f"the sky: {os.path.basename(HDRI)} {env_img.size[0]}x{env_img.size[1]}, strength {HDRI_STRENGTH:.2f}; its own "
      f"sun stands {map_el:.1f} degrees up at azimuth {map_az:.1f} (from {n_bright} texels, peak {l_max:.0f} against a "
      f"mean of {l_mean:.2f}); turned {rot:.1f} degrees, so it is seen at azimuth {seen_az:.1f}; the camera's sky "
      f"graded saturation x{SKY_SAT:.2f}, value x{SKY_VAL:.2f}")
if SUN > 0.0:
    # The lamp: on the sky's own disc by default (sun_az the photo's +40, where the auto turn stood the map's sun,
    # sun_el the map's own elevation), so the lamp's crisp shadow and the map's soft one fall together and the
    # sunlit ground reads as one sun. At strength 1 this map's sun carries 6.1 W/m2 facing it and the rest of the
    # sky 1.3 on the horizontal (sky_stats.py), so a lamp of 8 on top makes the sun-to-sky ratio on the ground about
    # 7.6:1, a clear afternoon's, and the photo's shadows are that crisp. sun_az=map follows the seen sun wherever an
    # explicit rot put it; degrees stand the lamp off the disc, as asked, and the print says by how far.
    lamp_az = seen_az if SUN_AZ.lower() == "map" else float(SUN_AZ)
    lamp_el = map_el if SUN_EL.lower() == "map" else float(SUN_EL)
    az, el = math.radians(lamp_az), math.radians(lamp_el)
    lamp_dir = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    off_disc = math.degrees(lamp_dir.angle(seen_sun))
    sd = bpy.data.lights.new("scene_sun", 'SUN'); sd.energy = SUN; sd.angle = math.radians(0.53)
    sun = bpy.data.objects.new("scene_sun", sd); S.collection.objects.link(sun)
    sun.rotation_euler = (-lamp_dir).to_track_quat('-Z', 'Y').to_euler()
    on_disc = "on the sky's sun disc" if off_disc < 0.5 else f"{off_disc:.1f} degrees off the sky's sun"
    print(f"a sun lamp of {SUN:.1f} at azimuth {lamp_az:.1f}, {lamp_el:.1f} degrees up, {on_disc}")

# THE HAZE (AI 574 item 2). Everything far mixes toward the sky at the horizon: a node group, scn_haze, that any
# material's final shader passes through (hazed(m) below wraps a material's output; the ground section wraps the lots,
# the pavement, the kerb and the road, and later items wrap their walls, trees and cards the same way). The factor is
# the camera's own distance to the point (Camera Data's View Distance) mapped from HAZE_NEAR, where it is nothing, to
# HAZE_FAR, where the surface is all sky -- the block, 45 to 65 m from the reference stand, is untouched -- and it
# acts on camera rays only (Light Path), so the light stays physical, as the sky's grade does. The colour is not one
# constant: the horizon pales toward the frame's right (the step-1 render reads (185, 195, 209) at the left horizon
# and (200, 205, 213) at the right), so the group looks the sky up in the ray's own azimuth flattened to the horizon
# -- the same map, the same turn, the same grade the camera's sky gets -- and a plain that ends fully hazed meets the
# map behind it without a step in any direction (the map runs on through its horizon: the row under it renders
# within a level of the row over it). Not a world volume, which would haze the sky itself and cost samples. Emission
# sampling is switched off on every hazed material, or the ground would become a mesh light whose shadow rays
# evaluate to nothing off the camera's path.
HAZE_NEAR = 150.0                               # the camera's distance where the haze begins; the block stands at 45-65 m
HAZE_FAR = 3000.0                               # where it is complete: the surface is the horizon's own colour (GND_FAR lies beyond)
HAZE = bpy.data.node_groups.new("scn_haze", 'ShaderNodeTree')
for nm, kind, default in (("Shader", 'NodeSocketShader', None), ("Near", 'NodeSocketFloat', HAZE_NEAR),
                          ("Far", 'NodeSocketFloat', HAZE_FAR), ("Amount", 'NodeSocketFloat', 1.0)):
    sk = HAZE.interface.new_socket(name=nm, in_out='INPUT', socket_type=kind)
    if default is not None: sk.default_value = default
HAZE.interface.new_socket(name="Shader", in_out='OUTPUT', socket_type='NodeSocketShader')
HAZE.interface.new_socket(name="Haze", in_out='OUTPUT', socket_type='NodeSocketFloat')   # the factor itself, for a debug render
hn, hl = HAZE.nodes, HAZE.links
h_in = hn.new('NodeGroupInput'); h_in.location = (-1100, 0)
h_out = hn.new('NodeGroupOutput'); h_out.location = (800, 0)
# the factor: the camera's distance, Near..Far to 0..1, on camera rays, times Amount
h_cam = hn.new('ShaderNodeCameraData'); h_cam.location = (-900, 300)
h_mr = hn.new('ShaderNodeMapRange'); h_mr.location = (-650, 300); h_mr.clamp = True
h_mr.inputs["To Min"].default_value = 0.0; h_mr.inputs["To Max"].default_value = 1.0
hl.new(h_cam.outputs["View Distance"], h_mr.inputs["Value"])
hl.new(h_in.outputs["Near"], h_mr.inputs["From Min"]); hl.new(h_in.outputs["Far"], h_mr.inputs["From Max"])
h_lp = hn.new('ShaderNodeLightPath'); h_lp.location = (-650, 650)
h_cam_only = hn.new('ShaderNodeMath'); h_cam_only.operation = 'MULTIPLY'; h_cam_only.location = (-400, 300)
hl.new(h_mr.outputs["Result"], h_cam_only.inputs[0]); hl.new(h_lp.outputs["Is Camera Ray"], h_cam_only.inputs[1])
h_fac = hn.new('ShaderNodeMath'); h_fac.operation = 'MULTIPLY'; h_fac.location = (-200, 300)
hl.new(h_cam_only.outputs["Value"], h_fac.inputs[0]); hl.new(h_in.outputs["Amount"], h_fac.inputs[1])
# the colour: the sky in the ray's azimuth at the horizon. Incoming points from the surface back to the camera, so
# the ray's direction is its negative; z dropped and the rest normalised, turned as the sky is, looked up in the
# same map and graded as the camera's sky is, at the sky's strength
h_geo = hn.new('ShaderNodeNewGeometry'); h_geo.location = (-1100, -350)
h_flat = hn.new('ShaderNodeVectorMath'); h_flat.operation = 'MULTIPLY'; h_flat.location = (-900, -350)
h_flat.inputs[1].default_value = (-1.0, -1.0, 0.0)
hl.new(h_geo.outputs["Incoming"], h_flat.inputs[0])
h_norm = hn.new('ShaderNodeVectorMath'); h_norm.operation = 'NORMALIZE'; h_norm.location = (-700, -350)
hl.new(h_flat.outputs["Vector"], h_norm.inputs[0])
h_map = hn.new('ShaderNodeMapping'); h_map.name = h_map.label = "HAZE_TURN"; h_map.location = (-500, -350)
h_map.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(rot))
hl.new(h_norm.outputs["Vector"], h_map.inputs["Vector"])
h_env = hn.new('ShaderNodeTexEnvironment'); h_env.image = env_img; h_env.location = (-280, -350)
hl.new(h_map.outputs["Vector"], h_env.inputs["Vector"])
h_hsv = hn.new('ShaderNodeHueSaturation'); h_hsv.name = h_hsv.label = "HAZE_GRADE"; h_hsv.location = (0, -350)
h_hsv.inputs["Hue"].default_value = SKY_HUE; h_hsv.inputs["Saturation"].default_value = SKY_SAT; h_hsv.inputs["Value"].default_value = SKY_VAL
hl.new(h_env.outputs["Color"], h_hsv.inputs["Color"])
h_em = hn.new('ShaderNodeEmission'); h_em.location = (250, -350); h_em.inputs["Strength"].default_value = HDRI_STRENGTH
hl.new(h_hsv.outputs["Color"], h_em.inputs["Color"])
h_mix = hn.new('ShaderNodeMixShader'); h_mix.location = (550, 0)
hl.new(h_fac.outputs["Value"], h_mix.inputs["Fac"]); hl.new(h_in.outputs["Shader"], h_mix.inputs[1]); hl.new(h_em.outputs["Emission"], h_mix.inputs[2])
hl.new(h_mix.outputs["Shader"], h_out.inputs["Shader"]); hl.new(h_fac.outputs["Value"], h_out.inputs["Haze"])
print(f"the haze: scn_haze, nothing to {HAZE_NEAR:.0f} m, all sky by {HAZE_FAR:.0f} m -- the sky looked up at the horizon in the "
      f"ray's own azimuth, turned {rot:.1f} and graded as the camera's sky is; camera rays only")

def hazed(m, near=HAZE_NEAR, far=HAZE_FAR, amount=1.0, at=None):
    # a material's final shader passed through scn_haze: whatever fed the output's Surface feeds the group instead.
    # at = (node name, input index) hazes the shader feeding THAT socket instead: a cut-out material (the leaves, the
    # fence lattice) mixes its shader against a Transparent BSDF by an alpha, and the transparent branch must stay
    # clear -- hazed at the output, every clear texel a ray passes adds its share of sky, and a crown a few hundred
    # metres off, crossed by a ray through dozens of cards, rendered as a pale ghost (item 29)
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    sock = nt.nodes[at[0]].inputs[at[1]] if at else out.inputs["Surface"]
    lk = next(l for l in nt.links if l.to_socket == sock)
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = HAZE; g.name = g.label = "scn_haze"
    g.location = (sock.node.location.x - 60, sock.node.location.y - 220)
    g.inputs["Near"].default_value = near; g.inputs["Far"].default_value = far; g.inputs["Amount"].default_value = amount
    src = lk.from_socket; nt.links.remove(lk)
    nt.links.new(src, g.inputs["Shader"]); nt.links.new(g.outputs["Shader"], sock)
    m.cycles.emission_sampling = 'NONE'
    return m

# ---------------------------------------------------------------- the ground: a shadow catcher, and a real street
# The block's own outline, as assemble_building.py lays it out, is the thing everything here is measured from: the
# pavement is that outline pushed out PAVE_W and filled (filled, not a ring, so it runs on under the walls and closes
# the floor of every recessed shopfront), its kerb drops PAVE_H to the roadway, the roadway is ST_W_EW or ST_W_NS
# wide kerb to kerb (3rd Street one car wide as the photo has it, Broadway wide),
# and beyond both streets the ground carries on to the horizon. Every
# corner a street turns is a curb return (AI 574 item 3): the kerb line sweeps round in one arc of KERB_R, at the
# block's chamfer tangent to both streets so the pavement is widest there, as the reference has it; the kerb is a
# profile swept along that line -- a rolled top edge and the face, down to the asphalt -- and beyond the streets
# stand eight far blocks with both streets running on between them, so their corners are curb returns too. Each far
# block is a VACANT LOT as the photo has them (AI 574 item 2; the one across 3rd Street is the clearest): a sidewalk
# strip PAVE_W wide inside its kerb round an interior of dry dirt (LOT_SETS), and lot, strip and street all run to
# GND_FAR, kilometres off, at the same world-space tiling throughout, so nothing ends in a seam from any stand -- a
# pure sky is flat grey under its horizon, and any edge nearer than the horizon showed against it (150 m, until item
# 2; extending the blocks and their kerbs was chosen over a plain taking over past 150 m, whose kerb ends and strip
# ends would have been seams of their own). Every ground material passes through scn_haze (the sky section), so the
# plain fades into the sky at the horizon. The catcher lies just under the roadway: in street mode the ground now
# covers it entirely (it stays for the mode's sake and costs nothing); in catch mode it stands at the block's own
# pavement level and is the whole of the ground.
SHRINK, BAY_GROW = (0.502, 4.465) if BLOCK_KIND == "fixed" else (0.0, 0.0)   # as assemble_building.py has them,
                                                # and neither of them applied to the game's own outline
HULL = [(-36.529 + SHRINK, -17.879), (9.7 + BAY_GROW, -17.879), (12.529 + BAY_GROW, -15.05),
        (12.529 + BAY_GROW, 17.879 - SHRINK), (-36.529 + SHRINK, 17.879 - SHRINK)]   # the block's outline, anticlockwise
ROAD_Z = -0.08                                  # the roadway's plane. The block's base, Z_GROUND 0.201, is the kerb's top, so this sets
                                                # the kerb's height (item 23: the photo's kerb face reads taller than 20 cm)
PAVE_W, PAVE_H = 4.20, Z_GROUND - ROAD_Z        # the pavement, wall to kerb, and the kerb's face
ST_W_EW = 13.00                                 # the roadways running east-west (3rd Street and its northern twin), kerb to kerb.
                                                # Item 17 had cut this to 6 m after reading the photo's far kerb; the user had not
                                                # asked for a narrower street ("that was not the objective; make the side street
                                                # larger", 2026-09-26) and item 21 put the width back
ST_W_NS = 13.00                                 # the roadways running north-south (Broadway and its western twin): the photo's
                                                # Broadway is at least 8 m, its far kerb out of the frame
GND_FAR = 3500.0                                # the ground's half extent: lots, strips and streets run this far, to the horizon (from the
                                                # reference stand 14.4 m up this edge lies 0.24 degrees under the level line, 9 px, and by
                                                # then the haze has made it the sky's own colour). Was GND_R 150 until item 2
CATCH_R = 600.0                                 # the catcher's, under the road (covered, in street mode; the whole ground in catch mode)
PBR_DIR = os.path.join(ROOT, "assets", "public", "pbr")
GND_TILE = 4.0                                  # every ground set's own tileMeters (its pbr.material.config.js)
GND_MIN_PARTS = 40                              # how many of the block's parts must still stand on Z_GROUND
KERB_R = 5.0                                    # the curb return: the kerb line's radius at every street corner
KERB_ROUND = 0.05                               # the kerb's rolled top edge
KERB_TOP_W = 0.30                               # the kerb's flat top, from the sidewalk slabs to the rolled edge (item 26)
KERB_TOP_PROUD = 0.008                          # the top stands this much above the slabs, a step at the joint
KERB_TONE = 0.88                                # the kerb's stone against the slabs: a shade darker
ARC_STEP = 0.30                                 # how finely a curb return is sampled, metres along the arc
# The road (AI 574 item 5). The photo's asphalt is old and sun-bleached: a warm pale grey (about sRGB 150 in the sun
# against the kerb's 220), alligator cracking in patches, repairs lighter and darker than the field, a dirt line
# along the kerb. clean_asphalt is dark, even and cool; asphalt_02 is pale and carries cracks of its own, so the road
# is built on it and the rest is added over it, in metres.
ROAD_SET = "asphalt_02"
ROAD_TINT = (1.08, 1.02, 0.94)                  # the bleached warm cast, applied to the set's colour
ROAD_LIFT = 1.12                                # and the set's colour raised toward the photo's pale grey
ROAD_BLEND_M = 9.0                              # the two samples of the set trade places over noise this size
ROAD_PATCH_M = 9.0                              # repairs: Voronoi cells about this size across
ROAD_PATCH_DARK, ROAD_PATCH_LIGHT = 0.88, 1.07  # the darkest and the palest cell's tone; most cells stay as they are
ROAD_CRACK_M = 0.7                              # alligator cracking: cell size
ROAD_CRACK_W = 0.045                            # its cracks' width, metres (sub-pixel from the reference stand: width is visibility there)
ROAD_CRACK_DARK = 0.55                          # how much a crack darkens
ROAD_CRACK_RIM = 0.10                           # how much the band beside it pales
ROAD_CRACK_COVER = 0.85                         # the share of the road that is cracked, in regions of ROAD_CRACK_REGION_M
ROAD_CRACK_REGION_M = 16.0
ROAD_CRACK_SKIP = 0.22                          # the share of a network's cells that carry no cracks (item 13)
ROAD_CRACK_VARY = 0.60                          # the faintest crack's strength against the strongest's
ROAD_BLOCK_M = 3.5                              # the sparse block-crack network's cell size
ROAD_BLOCK_DARK = 0.30                          # how much a block crack darkens
ROAD_TILE_M = 7.0                               # the set is laid per random cell this size, turned and slid per cell
# Tire wear (AI 574 item 14, reworked by items 16-18 and 20): where the tires usually run the asphalt is polished --
# a shade darker and flatter in tone, smoother, its bumps worn down -- and the field of that wear, 0..1, is
# `road_wear`, computed with the road's geometry and handed to the material as the `wear` attribute. Every travel
# lane of every street (LANES, in the ground section: a lane each way between parking strips) wears two wheel
# paths ROAD_TRACK_M apart, each a Gaussian across, so it has no edge at all -- the two of a lane meet at about a
# quarter of their strength between them, and a lane reads as one soft zone with two stronger lines; the paths run
# dead straight (a wander made them snake, user 2026-09-26), only their strength and width drifting slowly along the
# street. At every crossing the wear is the traffic's movements (item 24): each incoming lane's right turn and left
# turn are fillet arcs tangent to the straight wheel paths at both ends, so a turn peels off the straight line and
# merges into the next street's, the left turns sweeping through the centre where everything crosses; a softer
# merged zone lies over the middle. Everything fades out, wide, toward the grid's edge.
ROAD_TRACK_M = 1.80                             # a car's track: the two wheel paths of a lane are this far apart
ROAD_PARK_M = 2.20                              # a parking strip along each kerb: no wear there (the paths' tails reach into it)
ROAD_WEAR_SIGMA = 0.65                          # a wheel path's width scale across; its profile is a narrow peak on wide skirts (item 25):
ROAD_WEAR_PEAK = 0.55                           #   the peak's share, a Gaussian of ROAD_WEAR_CORE times the sigma ...
ROAD_WEAR_CORE = 0.45                           #   ... 0.29 m: half strength 0.34 m out
ROAD_WEAR_SKIRT = 2.0                           #   the skirt, the rest, a Gaussian of this times the sigma: 1.3 m, a tenth 2.8 m out
ROAD_WEAR_GAIN = 0.65                           # the whole field scaled down (item 25: "reduce the strength")
ROAD_WEAR_FADE_M = 20.0                         # the wear fades out over this much inside the grid's edge (wider than the geometry's)
ROAD_WEAR_WIDTH_M = 25.0                        # the width drifts along the street over noise this size ...
ROAD_WEAR_WIDTH_VARY = 0.25                     # ... by this much either way
ROAD_WEAR_VARY_M = 30.0                         # the strength drifts along the street over noise this size, 0.6 to 1
ROAD_MERGE_IN, ROAD_MERGE_OUT = 0.20, 1.20      # the crossing's merged zone: full inside this fraction of its half width, gone at that
ROAD_MERGE_STRENGTH = 0.45                      # the merged zone's wear ...
ROAD_MERGE_FADE = 0.35                          # ... and how much the straight paths give way to it there
ROAD_TURN_R_RIGHT = 7.0                         # a right turn's centre-line radius (the fillet between the two lane lines)
ROAD_TURN_R_LEFT = 11.0                         # a left turn's
ROAD_TURN_RIGHT, ROAD_TURN_LEFT = 0.50, 0.40    # the turning paths' wear, right and left
ROAD_TURN_SIGMA = 0.80                          # a turning wheel path's Gaussian sigma: turning cars spread more than through ones
# The road's surface (AI 574 item 19, graded by item 22): not a plane. Near the block the road is a grid displaced
# by a crown per street -- the two crowns of a crossing meeting in a smooth valley, which is what makes the bellies
# at the corners -- with broad low waves on top, pinned to the gutter line (a fixed grade: nothing moves at the
# kerb), shallow ruts where the wheel paths run and a dip into the gutter that follows the curb returns; it fades
# to the plane at the grid's edge, where the flat field carries on. Item 19 also had fine noise and patch steps;
# they read as islands on the height map (user 2026-09-26) and went.
ROAD_GRID_M = 0.20                              # the grid's cell, metres
ROAD_GRID_R = 55.0                              # the grid's half extent (every street in the reference view); beyond it the road is the flat plane
ROAD_GRID_FADE = 10.0                           # the displacement fades to nothing over this much inside the edge
ROAD_UNDULATE = ((18.0, 0.030), (8.0, 0.015))   # (wavelength m, amplitude m) of the waves: broad and low, nothing finer (item 22)
ROAD_PIN_M = 2.0                                # the waves fade to nothing this close to a kerb: the gutter line is a fixed grade
ROAD_CROWN_SMOOTH = 0.03                        # where two crowns meet, the softmax's temperature (m): the crease becomes a smooth valley
ROAD_BUMP = ((0.25, 0.0025), (0.08, 0.0012), (0.025, 0.0004))   # below the grid, in the shader as a bump: (wavelength m, height m)
ROAD_ROUGH_SCALE = 1.10                         # the set's roughness (mean 0.77) raised: 0.85 had eased it to show the waves, and it
                                                # read as plastic (item 25); the crown and the bellies show without the sheen
ROAD_NORMAL_GAIN = 1.4                          # the set's normal map strengthened: the aggregate's grain
# repair patches (the cells of ROAD_PATCH_M the material's tone follows) sit proud or sunk, their edge softening over
# ROAD_PATCH_EDGE; settled utility trenches cross each street, ROAD_TRENCH_N of them within the grid, sunk and darker
ROAD_PATCH_SUNK = (0.0, 0.0)                    # the sunk cells' depth range (the darker fifth of the cells); 8-15 mm read as islands (item 22)
ROAD_PATCH_PROUD = (0.0, 0.0)                   # the proud cells' height range (the palest fifth); 5-10 mm likewise
ROAD_PATCH_EDGE = 0.45                          # a patch's step softens over this much of Voronoi edge distance
ROAD_TRENCH_N = 3                               # trenches per street within the grid
ROAD_TRENCH_W = 1.2                             # a trench's width
ROAD_TRENCH_DEPTH = 0.010                       # how far it has settled
ROAD_TRENCH_TONE = 0.90                         # its fill, newer and darker
ROAD_CROWN = 0.015                              # the crown: this much rise per metre of half width, parabolic
ROAD_RUT = 0.010                                # the ruts' depth along the wheel paths
ROAD_GUTTER_DIP = 0.025                         # the road settles this much into the gutter at each kerb ...
ROAD_GUTTER_M = 1.0                             # ... over this much from the kerb, following the curb returns
KERB_BURY = 0.08                                # the kerb's foot goes this far under the road, so the road may dip
ROAD_POLISH_FLAT = 0.15                         # how far the polished colour goes toward one flat tone
ROAD_POLISH_TONE = (0.24, 0.22, 0.20)           # that tone, linear: the road's own mean
ROAD_POLISH_LIGHT = 0.95                        # the polished surface a shade DARKER (item 20: lightened 1.05 it read as bright stripes)
ROAD_WEAR_SMOOTH = 0.15                         # how much full wear lowers the roughness
ROAD_WEAR_FLATTEN = 0.30                        # how much it lowers the normal map's strength
# The curbs (AI 574 item 15): a concrete curb poured in segments, a joint every KERB_JOINT_M, every segment its own
# tone, its face a shade greyer than its rolled top, and the foot's grime.
KERB_JOINT_M = 1.00                             # segment length along the kerb line: the photo's kerb is stone blocks about a metre long (item 23)
KERB_JOINT_W = 0.02                             # a joint's width
KERB_JOINT_DARK = 0.45                          # how much a joint darkens
KERB_SEG_VARY = 0.07                            # how far a segment's tone strays from the mean, either way
KERB_FACE_TONE = 0.90                           # the face against the top (the top is worn paler)
KERB_V_FACE = KERB_TOP_W + KERB_TOP_PROUD + KERB_ROUND * 1.2   # where along the profile the face begins (past the top and the round)
# Weathering of the kerb (AI 574 item 27), in h = the height above the gutter and u = the run along the kerb:
KERB_FOOT_H = 0.10                              # dirt at the foot reaches this high on average ...
KERB_FOOT_VARY = 0.05                           # ... plus or minus this, over 1.7 m along the kerb, its edge ragged
KERB_FOOT_DARK = 0.50                           # how much darker, at the foot, on top of the dirt's tint
KERB_DIRT_TINT = (0.55, 0.42, 0.30)             # the dirt's colour, linear, multiplied in: a warm brown grime
KERB_DIRT_AMT = 0.85                            # how far the foot dirt and the tide lines go to that colour
KERB_GRIME = 0.30                               # a grime mottle over the whole face, irregular, by this much
KERB_TIDE_H = (0.10, 0.16)                      # two tide lines from standing water, their mean heights ...
KERB_TIDE_VARY = 0.03                           # ... wobbling by this along the kerb
KERB_TIDE_DARK = 0.50                           # a line's darkening, sharp above, fading down over KERB_TIDE_FADE
KERB_TIDE_FADE = 0.04
KERB_STREAK_P = 0.15                            # the share of blocks with a drip streak down the face
KERB_STREAK_W = 0.02                            # a streak's width
KERB_STREAK_DARK = 0.22
KERB_EDGE_WEAR = 0.25                           # the arris worn pale by this, where it is worn ...
KERB_EDGE_BAND = 0.04                           # ... over this much of top and face either side of the round
KERB_CHIP_P = 0.10                              # the share of 0.25 m cells along the arris with a chip
KERB_CHIP_R = 0.03                              # a chip's radius
KERB_CHIP_LIGHT = 0.25                          # a chip's fresh stone, paler
ROAD_DIRT_M = 0.6                               # the kerb's dirt line: how far out from the kerb's face it reaches
ROAD_DIRT = 0.50                                # how dark it gets at the foot
# The sidewalk (AI 574 item 4). The photo's pavement is poured concrete scored into large slabs, not the small pavers
# of the concrete_pavement set's own 4 m tile (which showed through between the slab joints as a second, finer grid
# when the joints were first laid over it), so the slabs are the game's rough_concrete set -- the one plain poured
# surface among its sets: an even sandy grain, no grid; concrete and concrete_layers_02 are board-formed walls,
# limestone_smooth and the plasters featureless, burnt_cement_panel near black (the review's
# item4_sidewalk/tune/concrete_sets_sheet.png) -- tinted to the photo's tone. The kerb keeps the paver set (item 26).
# The photo: along each street a transverse joint about every 2 m (the photo laid
# back onto the ground plane through the reference stand and profiled along the strip, the review's
# scripts/pavement_profiles.py: on Broadway the dips stand 1.95-2.0 m apart where consecutive, on 3rd Street the
# strong ones about 4 m apart with fainter ones between) and a longitudinal joint about a metre inside the kerb's
# top course (it passes just inside the vault cover C3); on the corner apron a FAN of radial joints from the curb
# return's centre, five to the quadrant (about 1.5 m apart at the kerb), and an arc joint across them that carries
# the longitudinal joint round the corner; the slabs pale and warm in the sun -- the photo's apron reads sRGB
# (215, 192, 169) where the set rendered (192, 183, 173) after item 7, and item 1 left that shortfall to the albedo;
# a dark warm line along the wall base where dirt collects against the plinths (the photo's slabs about 15 levels
# darker in the first 10 cm, gone by 0.3 m out); dirt gathered in the joints and against the kerb top's step; and
# every slab a shade off its neighbours. All of it is pavement_material, written in world metres from each piece's
# own kerb rectangle -- the pad_lo / pad_hi properties kerbed_pavement puts on every pavement object, read by an
# Object Attribute node -- so one material serves the block's pavement and the eight far strips, and nothing is cut:
# the covers of item 8 keep sitting on the slabs. No mottle (rejected twice): the variation is the slabs' own tones
# from their indices, the joints, and the occlusion read off the real walls.
PAVE_SET = "rough_concrete"                     # the slabs' set (its tileMeters is GND_TILE, as every ground set's)
PAVE_SET_MEAN = (0.481, 0.462, 0.334)           # its mean albedo, linear (item4_sidewalk/tune/concrete_sets_sheet.png)
PAVE_GRAIN = 0.45                               # the share of the set's own colour variation kept, the rest going to its mean: as it comes
                                                # the set is a pebbled face and read as stucco from a 6 m stand; a broom-finished sidewalk is calmer
PAVE_NORMAL = 0.35                              # the set's normal map's strength, calmed for the same reason
PAVE_PITCH = 2.0                                # the transverse joints' pitch along a street; each side's straight run (between its two
                                                # curb returns) is cut into whole slabs, so its pitch is the nearest fit: the block's
                                                # south side is 51.4 m, 26 slabs of 1.98
PAVE_LONG = 1.1                                 # the longitudinal joint, this far in from the slabs' edge (the kerb top's inner edge)
PAVE_FAN_N = 5                                  # radial joints per curb-return quadrant: 18 degrees, 1.46 m apart at the slabs' edge
PAVE_ARC_R = KERB_R - (KERB_ROUND + KERB_TOP_W) - PAVE_LONG   # the arc joint's radius about the return's centre: the longitudinal
                                                # joint carried round the corner (3.55 m; the slabs' edge is at 4.65)
PAVE_JOINT_W = 0.012                            # a scored joint's width
PAVE_JOINT_DARK = 0.55                          # how much the groove darkens
PAVE_JOINT_DIRT_M = 0.05                        # the dirt gathered beside a joint reaches this far out, fading ...
PAVE_JOINT_DIRT = 0.35                          # ... from this much darkening at the joint's lip
PAVE_JOINT_ROUGH = 0.20                         # ... and the roughness rises by this much there
PAVE_JOINT_BEVEL = (0.006, 0.003)               # the groove's edges: a chamfer this wide and this deep, in the normal, so the sun catches them
PAVE_JOINT_VARY = (0.45, 1.0)                   # a transverse or radial joint's strength, its own from a white noise of its index (the
                                                # photo's strong and faint joints alternate loosely); the longitudinal and arc joints at 1
PAVE_KERB_JOINT_M = 0.05                        # dirt against the kerb top's step, on the slab side, over this much from the joint
PAVE_SLAB_VARY = 0.04                           # a slab's tone strays this far from the mean, either way
PAVE_TINT = (0.96, 0.60, 0.41)                  # the set's colour multiplied, linear: what the sunlit apron must reflect. Through the
                                                # film's own curve (scripts/agx_curve.py: 192 on the film is 0.67 linear, 215 is 1.24) the
                                                # paver set's apron (192, 183, 173) -> the photo's (215, 192, 169) asked (1.85, 1.21, 0.92)
                                                # on its (0.214, 0.176, 0.134) albedo, tempered in red to (1.7, 1.25, 0.97) so the slabs in
                                                # the block's shade, lit by the sky alone, stay a neutral grey instead of turning brown: an
                                                # albedo of (0.364, 0.22, 0.13), (0.76, 0.48, 0.39) over rough_concrete's mean; rendered,
                                                # that set's packed AO and rough face gave (205, 181, 165) on the apron, so (1.29, 1.26, 1.06)
                                                # more (the same curve) is this
PAVE_GRIME_M = 0.7                              # the wall-base grime: ambient occlusion read off the block's walls and plinths within this far
PAVE_GRIME_OCC = (0.04, 0.24)                   # the occlusion (1 - AO) mapped to the grime, 0 to 1: nothing on open slabs, full at a wall's
                                                # foot. Measured by rendering the occlusion itself (scripts/debug_pave.py at=): a pier's foot
                                                # reads 0.27, a shopfront's 0.19 -- Cycles' AO rays pass through the glass, which casts no
                                                # opaque shadow, to the recess floor behind it -- so a map to 0.45 left the line at 3 levels
PAVE_GRIME_SAMPLES = 6                          # the AO node's rays per shading point (the denoiser takes the rest)
PAVE_GRIME = 0.60                               # how far the slabs go toward the grime's colour at a wall's foot (0.4 with a paler tint
                                                # gave a line of 6 levels against the photo's 15) ...
PAVE_GRIME_TINT = (0.50, 0.40, 0.31)            # ... that colour multiplied in: a warm dark dirt, the kerb's KERB_DIRT_TINT a shade greyer
PAVE_GRIME_ROUGH = 0.15                         # the roughness rises with the grime
# The vacant lots (AI 574 item 2). Beyond the streets the photo has dry lots: pale, nearly neutral dirt with dark
# specks -- sunlit across 3rd Street it reads sRGB (176, 164, 154), 64-78% of the slabs' brightness in linear light
# at saturation 0.13 -- bounded by low walls with dry tufts at their feet (the walls and tufts are item 28's). None
# of the game's ground sets is dry grass (every grass set is lush green), so the lot is dirt; and judged by what each
# set would render as beside the slabs (its mean albedo against the pavement set's, the review's
# scripts/lot_colours.py), brown_mud (fine bare earth, albedo (104, 93, 75)) lands nearest the photo's dirt in tone
# and rock_ground (grey gravelly scree, (114, 106, 95)) nearest in its greyness, while gravelly_sand ((146, 111, 76))
# is far too bright and orange. The lot is the two traded over a slow noise -- patches of earth and of gravel, as a
# trodden lot has them -- each laid per random cell as the road's asphalt is, so neither set's tile repeats over a
# lot that runs to the horizon. No mottle: the variation is the two sets' own.
LOT_SETS = (("brown_mud", 1.3), ("rock_ground", 4.0))   # (the set, its tileMeters as its pbr.material.config.js has it)
LOT_TILE_M = 9.0                                # each set is laid per random cell this size, turned and slid per cell
LOT_BLEND_M = 30.0                              # the two sets trade places over noise this size ...
LOT_BLEND = (0.44, 0.56)                        # ... across this band of the noise (Perlin's Fac lives near 0.5): about half each

bpy.context.view_layer.update()   # a freshly linked object still carries the matrix_world it had in the library
bases = [min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.objects if o.type == 'MESH']
tops = [max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.objects if o.type == 'MESH']
on_ground = sum(1 for b in bases if abs(b - Z_GROUND) < 0.03)
print(f"the block reads {min(bases):.3f} at its lowest and {max(tops):.3f} at its highest, with {on_ground} parts "
      f"standing on {Z_GROUND}")
assert on_ground >= GND_MIN_PARTS, (f"only {on_ground} of the block's parts start at {Z_GROUND}: its base has moved, "
                                    f"and ground laid at that height would not meet it")

def ground_material(name, folder, mottle_m=0.0, mottle=0.0, grime=None, tint=None):
    # the catalog's own maps, read the way the game reads them -- base colour, the packed AO / roughness / metal, and
    # the OpenGL normal -- tiled by the set's tileMeters over UVs that are metres. A 4 m tile over a street shows its
    # repeat from any wide lens, so a slow noise mottle_m across lifts and drops the tone by mottle, which breaks the
    # grid up without touching the surface itself. grime = (attribute, strength) darkens the base colour by strength
    # where a mesh's float attribute of that name reads 1 (the kerb's foot, the gutter pan). tint multiplies the
    # base colour by a constant (the context's tan warehouse is the plaster set turned ochre, item 28).
    d = os.path.join(PBR_DIR, folder)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (700, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (420, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0)
    mp.inputs["Scale"].default_value = (1.0 / GND_TILE, 1.0 / GND_TILE, 1.0)
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
    def tex(fn, cs, y):
        fp = os.path.join(d, fn); assert os.path.isfile(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{folder}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs                      # the save below turns its path relative, as for the sky
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.location = (-450, y); t.extension = 'REPEAT'
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"]); return t
    base = tex("basecolor.jpg", 'sRGB', 300); arm = tex("arm.png", 'Non-Color', 0); nrm = tex("normal_gl.png", 'Non-Color', -300)
    sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-150, 0); nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
    col = base.outputs["Color"]
    if tint is not None:
        tn = nt.nodes.new('ShaderNodeMix'); tn.data_type = 'RGBA'; tn.blend_type = 'MULTIPLY'; tn.location = (-40, 700)
        tn.inputs["Factor"].default_value = 1.0
        nt.links.new(col, next(i for i in tn.inputs if i.identifier == "A_Color"))
        next(i for i in tn.inputs if i.identifier == "B_Color").default_value = (*tint, 1.0)
        col = next(o for o in tn.outputs if o.identifier == "Result_Color")
    if mottle > 0.0:
        ns = nt.nodes.new('ShaderNodeTexNoise'); ns.location = (-450, 580)
        ns.inputs["Scale"].default_value = 1.0 / mottle_m; ns.inputs["Detail"].default_value = 2.0
        nt.links.new(uv.outputs["UV"], ns.inputs["Vector"])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = (-250, 580); mr.clamp = True
        mr.inputs["From Min"].default_value = 0.35; mr.inputs["From Max"].default_value = 0.65
        mr.inputs["To Min"].default_value = 1.0 - mottle; mr.inputs["To Max"].default_value = 1.0 + mottle
        nt.links.new(ns.outputs["Fac"], mr.inputs["Value"])
        mm = nt.nodes.new('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'; mm.location = (-40, 480)
        mm.inputs["Factor"].default_value = 1.0
        nt.links.new(col, next(i for i in mm.inputs if i.identifier == "A_Color"))
        nt.links.new(mr.outputs["Result"], next(i for i in mm.inputs if i.identifier == "B_Color"))
        col = next(o for o in mm.outputs if o.identifier == "Result_Color")
    if grime:
        an, strength = grime
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = an; at.location = (-450, -600)
        gr = nt.nodes.new('ShaderNodeMapRange'); gr.location = (-250, -600); gr.clamp = True
        gr.inputs["From Min"].default_value = 0.0; gr.inputs["From Max"].default_value = 1.0
        gr.inputs["To Min"].default_value = 1.0; gr.inputs["To Max"].default_value = 1.0 - strength
        nt.links.new(at.outputs["Fac"], gr.inputs["Value"])
        mg = nt.nodes.new('ShaderNodeMix'); mg.data_type = 'RGBA'; mg.blend_type = 'MULTIPLY'; mg.location = (-40, -480)
        mg.inputs["Factor"].default_value = 1.0
        nt.links.new(col, next(i for i in mg.inputs if i.identifier == "A_Color"))
        nt.links.new(gr.outputs["Result"], next(i for i in mg.inputs if i.identifier == "B_Color"))
        col = next(o for o in mg.outputs if o.identifier == "Result_Color")
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (200, 250)
    mix.inputs["Factor"].default_value = 1.0                  # the packed AO darkens the base colour, as on the walls
    nt.links.new(col, next(i for i in mix.inputs if i.identifier == "A_Color"))
    nt.links.new(sep.outputs["Red"], next(i for i in mix.inputs if i.identifier == "B_Color"))
    nt.links.new(next(o for o in mix.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (200, -300)
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def road_material(name):
    # Pale worn asphalt (AI 574 item 5, its cracks randomised by item 13), over UVs that are metres. The set's colour
    # is laid per random cell: a Voronoi of ROAD_TILE_M cells gives every cell its own feature point and random
    # number, and the set is sampled turned about that point by the cell's own angle and slid by its own offset, so
    # no crack of the set repeats anywhere; two such layouts trade places over a slow noise, which also softens the
    # seams between cells. That colour is tinted and lifted to the photo's bleached grey; Voronoi cells the size of a
    # repair make some patches darker and some paler; alligator cracking comes from two Voronoi networks whose
    # cell size drifts across the road, with cells that keep no cracks, each crack at its own strength, gaps along
    # every crack, a pale rim beside it, in ragged regions, plus a sparse third network of larger block cracks; and
    # an ambient-occlusion read from the kerb's own face darkens the road beside it, following every curb return by
    # itself. The normal and roughness are the set's, from the first layout.
    d = os.path.join(PBR_DIR, ROAD_SET)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    def node(t, x, y, **props):
        n = nt.nodes.new(t); n.location = (x, y)
        for k, v in props.items(): setattr(n, k, v)
        return n
    def link(a, b): nt.links.new(a, b)
    def sock(n, ident):   # a ShaderNodeMix socket by identifier (A_Color, B_Color, Result_Color)
        return next(sk for sk in (list(n.inputs) + list(n.outputs)) if sk.identifier == ident)
    def fmath(op, x, y, a=None, b=None, clamp=False):
        n = node('ShaderNodeMath', x, y, operation=op, use_clamp=clamp)
        for i, v in ((0, a), (1, b)):
            if v is None: continue
            if hasattr(v, "is_output"): link(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs["Value"]
    def mrange(x, y, v, fmin, fmax, tmin, tmax):
        n = node('ShaderNodeMapRange', x, y, clamp=True)
        n.inputs["From Min"].default_value = fmin; n.inputs["From Max"].default_value = fmax
        n.inputs["To Min"].default_value = tmin; n.inputs["To Max"].default_value = tmax
        link(v, n.inputs["Value"]); return n.outputs["Result"]
    def scale_col(x, y, col, fac):   # a colour times a float
        n = node('ShaderNodeVectorMath', x, y, operation='SCALE'); link(col, n.inputs[0])
        if hasattr(fac, "is_output"): link(fac, n.inputs["Scale"])
        else: n.inputs["Scale"].default_value = fac
        return n.outputs["Vector"]
    def tex(fn, cs, x, y, vec):
        fp = os.path.join(d, fn); assert os.path.isfile(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{ROAD_SET}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs
        t = node('ShaderNodeTexImage', x, y, image=im, extension='REPEAT'); link(vec, t.inputs["Vector"]); return t
    uv = node('ShaderNodeUVMap', -2600, 0); UV = uv.outputs["UV"]
    def noise(x, y, size_m, detail=2.0, vec=None, rough=None):
        n = node('ShaderNodeTexNoise', x, y); n.inputs["Scale"].default_value = 1.0 / size_m; n.inputs["Detail"].default_value = detail
        if rough is not None: n.inputs["Roughness"].default_value = rough
        link(vec if vec is not None else UV, n.inputs["Vector"]); return n
    def random_tile(x, y, cell_m, shift):
        # the set laid per Voronoi cell of cell_m: turned about the cell's feature point by the cell's own angle and
        # slid by its own offset, then scaled to the set's tile
        sh = node('ShaderNodeVectorMath', x, y, operation='ADD'); link(UV, sh.inputs[0]); sh.inputs[1].default_value = (shift[0], shift[1], 0.0)
        vor = node('ShaderNodeTexVoronoi', x + 200, y, voronoi_dimensions='2D', feature='F1')
        vor.inputs["Scale"].default_value = 1.0 / cell_m; vor.inputs["Randomness"].default_value = 1.0; link(sh.outputs["Vector"], vor.inputs["Vector"])
        rnd = node('ShaderNodeSeparateColor', x + 400, y - 200); link(vor.outputs["Color"], rnd.inputs["Color"])
        local = node('ShaderNodeVectorMath', x + 400, y, operation='SUBTRACT'); link(sh.outputs["Vector"], local.inputs[0]); link(vor.outputs["Position"], local.inputs[1])
        rot = node('ShaderNodeVectorRotate', x + 600, y, rotation_type='AXIS_ANGLE'); rot.inputs["Axis"].default_value = (0.0, 0.0, 1.0)
        link(local.outputs["Vector"], rot.inputs["Vector"]); link(fmath('MULTIPLY', x + 600, y - 200, rnd.outputs["Red"], 2.0 * math.pi), rot.inputs["Angle"])
        off = node('ShaderNodeCombineXYZ', x + 800, y - 200)
        link(fmath('MULTIPLY', x + 600, y - 350, rnd.outputs["Green"], 37.0), off.inputs["X"]); link(fmath('MULTIPLY', x + 600, y - 500, rnd.outputs["Blue"], 53.0), off.inputs["Y"])
        pos = node('ShaderNodeVectorMath', x + 800, y, operation='ADD'); link(rot.outputs["Vector"], pos.inputs[0]); link(off.outputs["Vector"], pos.inputs[1])
        sc = node('ShaderNodeVectorMath', x + 1000, y, operation='SCALE'); link(pos.outputs["Vector"], sc.inputs[0]); sc.inputs["Scale"].default_value = 1.0 / GND_TILE
        return sc.outputs["Vector"]
    out = node('ShaderNodeOutputMaterial', 2600, 0); bsdf = node('ShaderNodeBsdfPrincipled', 2300, 0)
    link(bsdf.outputs["BSDF"], out.inputs["Surface"])
    # the two layouts of the set
    vecA = random_tile(-2400, 400, ROAD_TILE_M, (0.0, 0.0)); vecB = random_tile(-2400, -200, ROAD_TILE_M * 1.23, (3.1, 4.7))
    baseA = tex("basecolor.jpg", 'sRGB', -1200, 500, vecA); baseB = tex("basecolor.jpg", 'sRGB', -1200, 200, vecB)
    arm = tex("arm.png", 'Non-Color', -1200, -100, vecA); nrm = tex("normal_gl.png", 'Non-Color', -1200, -400, vecA)
    nbf = mrange(-1000, 800, noise(-1200, 800, ROAD_BLEND_M).outputs["Fac"], 0.42, 0.58, 0.0, 1.0)
    mix = node('ShaderNodeMix', -800, 400, data_type='RGBA', blend_type='MIX')
    link(nbf, mix.inputs["Factor"]); link(baseA.outputs["Color"], sock(mix, "A_Color")); link(baseB.outputs["Color"], sock(mix, "B_Color"))
    # bleached: tinted and lifted
    tint = node('ShaderNodeMix', -600, 400, data_type='RGBA', blend_type='MULTIPLY'); tint.inputs["Factor"].default_value = 1.0
    link(sock(mix, "Result_Color"), sock(tint, "A_Color")); sock(tint, "B_Color").default_value = (*ROAD_TINT, 1.0)
    col = scale_col(-400, 400, sock(tint, "Result_Color"), ROAD_LIFT)
    # repairs: the patch tone the road's geometry computed per vertex (road_height: the cells whose steps the mesh
    # carries, and the trenches), read back from the mesh's `ptone` attribute so colour and step coincide (item 19)
    at_p = node('ShaderNodeAttribute', -800, -900, attribute_name="ptone")
    col = scale_col(50, 400, col, at_p.outputs["Fac"])
    # the slow mottle, as every ground set has it
    col = scale_col(250, 400, col, mrange(-600, 1000, noise(-800, 1000, 22.0).outputs["Fac"], 0.35, 0.65, 0.90, 1.10))
    # alligator cracking, irregular: two networks, each with cells that keep no cracks (their own random number);
    # every crack at its own strength (a 2.2 m noise); gaps along every crack; a pale rim beside it; all in regions
    # ragged by a 16 m noise times a 5 m one. (Drifting the cells' size by feeding a noise into the Voronoi's scale
    # was tried and shreds the network: the scale multiplies world metres, so 30 m out the cells swirl or stretch.)
    nw = noise(-1200, -1500, 1.4, detail=3.0)      # a rougher warp (detail 5, 0.45 m) shredded the cells into specks
    warp = node('ShaderNodeVectorMath', -1000, -1500, operation='MULTIPLY_ADD'); link(nw.outputs["Color"], warp.inputs[0])
    warp.inputs[1].default_value = (0.35, 0.35, 0.0); link(UV, warp.inputs[2]); W = warp.outputs["Vector"]
    crack, rim = None, None
    for k, cell_m in enumerate((ROAD_CRACK_M, ROAD_CRACK_M * 1.7)):
        y = -1500 - 250 * k
        vc = node('ShaderNodeTexVoronoi', -600, y, voronoi_dimensions='2D', feature='DISTANCE_TO_EDGE'); vc.inputs["Randomness"].default_value = 1.0
        vc.inputs["Scale"].default_value = 1.0 / cell_m; link(W, vc.inputs["Vector"])
        vk = node('ShaderNodeTexVoronoi', -600, y - 120, voronoi_dimensions='2D', feature='F1'); vk.inputs["Randomness"].default_value = 1.0
        vk.inputs["Scale"].default_value = 1.0 / cell_m; link(W, vk.inputs["Vector"])
        kc = node('ShaderNodeSeparateColor', -450, y - 120); link(vk.outputs["Color"], kc.inputs["Color"])
        keep = mrange(-300, y - 120, kc.outputs["Red"], ROAD_CRACK_SKIP, ROAD_CRACK_SKIP + 0.12, 0.0, 1.0)    # the cells that carry cracks
        c = fmath('MULTIPLY', -150, y, mrange(-300, y, vc.outputs["Distance"], 0.0, ROAD_CRACK_W, 1.0, 0.0), keep)
        r = fmath('MULTIPLY', -150, y - 60, mrange(-300, y - 60, vc.outputs["Distance"], ROAD_CRACK_W, ROAD_CRACK_W * 3.0, 1.0, 0.0), keep)
        crack = c if crack is None else fmath('MAXIMUM', 0, -1600, crack, c)
        rim = r if rim is None else fmath('MAXIMUM', 0, -1660, rim, r)
    strength = mrange(-300, -2000, noise(-600, -2000, 2.2).outputs["Fac"], 0.3, 0.7, ROAD_CRACK_VARY, 1.0)
    gaps = mrange(-300, -2150, noise(-600, -2150, 0.25).outputs["Fac"], 0.38, 0.5, 0.0, 1.0)           # open along about a third of every crack
    lo = 0.5 + 0.12 * (1.0 - ROAD_CRACK_COVER * 2.0)
    reg1 = mrange(-300, -2300, noise(-600, -2300, ROAD_CRACK_REGION_M).outputs["Fac"], lo, lo + 0.08, 0.0, 1.0)
    reg2 = mrange(-300, -2450, noise(-600, -2450, 5.0).outputs["Fac"], 0.35, 0.6, 0.6, 1.0)
    where = fmath('MULTIPLY', -100, -2200, fmath('MULTIPLY', -100, -2300, reg1, reg2), fmath('MULTIPLY', -100, -2100, gaps, strength))
    # a sparse third network of block cracks, larger cells, over everything cracked or not
    vb = node('ShaderNodeTexVoronoi', -600, -2650, voronoi_dimensions='2D', feature='DISTANCE_TO_EDGE'); vb.inputs["Randomness"].default_value = 1.0
    vb.inputs["Scale"].default_value = 1.0 / ROAD_BLOCK_M; link(W, vb.inputs["Vector"])
    blk = fmath('MULTIPLY', -150, -2650, mrange(-300, -2650, vb.outputs["Distance"], 0.0, ROAD_CRACK_W * 1.3, 1.0, 0.0),
                fmath('MULTIPLY', -300, -2800, mrange(-450, -2800, noise(-600, -2800, 25.0).outputs["Fac"], 0.45, 0.6, 0.0, 1.0), gaps))
    darken = fmath('ADD', 200, -1800, fmath('MULTIPLY', 100, -1700, fmath('MULTIPLY', 50, -1700, crack, where), ROAD_CRACK_DARK),
                   fmath('MULTIPLY', 100, -1900, blk, ROAD_BLOCK_DARK))
    pale = fmath('MULTIPLY', 100, -2000, fmath('MULTIPLY', 50, -2000, rim, where), ROAD_CRACK_RIM)
    crk = fmath('MULTIPLY', 350, -1850, fmath('SUBTRACT', 300, -1800, 1.0, darken), fmath('ADD', 300, -1950, 1.0, pale))
    col = scale_col(450, 400, col, crk)
    # tire wear (items 14 and 16-18, reworked by item 20): the wear field is computed with the road's geometry
    # (road_wear: Gaussian wheel paths, turning arcs round the curb returns, the merged zone at each crossing) and
    # read back from the mesh's `wear` attribute; where it reads, the colour goes ROAD_POLISH_FLAT of the way to
    # one flat tone and a shade darker, and further down the roughness and the normal map's strength drop with it
    at_w = node('ShaderNodeAttribute', -800, -3600, attribute_name="wear"); wear = at_w.outputs["Fac"]
    flat = node('ShaderNodeMix', -500, -3600, data_type='RGBA', blend_type='MIX'); flat.inputs["Factor"].default_value = ROAD_POLISH_FLAT
    link(col, sock(flat, "A_Color")); sock(flat, "B_Color").default_value = (*ROAD_POLISH_TONE, 1.0)
    polished = scale_col(-300, -3600, sock(flat, "Result_Color"), ROAD_POLISH_LIGHT)
    worn = node('ShaderNodeMix', 550, 400, data_type='RGBA', blend_type='MIX')
    link(wear, worn.inputs["Factor"]); link(col, sock(worn, "A_Color")); link(polished, sock(worn, "B_Color"))
    col = sock(worn, "Result_Color")
    smooth = fmath('SUBTRACT', -500, -3850, 1.0, fmath('MULTIPLY', -600, -3850, wear, ROAD_WEAR_SMOOTH))
    flatten = fmath('SUBTRACT', -500, -4000, 1.0, fmath('MULTIPLY', -600, -4000, wear, ROAD_WEAR_FLATTEN))
    # the kerb's dirt line: what the kerb's face shades within ROAD_DIRT_M, read as occlusion, broken up by a noise
    ao = node('ShaderNodeAmbientOcclusion', -800, -3100, samples=4, inside=False, only_local=False)
    ao.inputs["Distance"].default_value = ROAD_DIRT_M
    occ = fmath('SUBTRACT', -600, -3100, 1.0, ao.outputs["AO"])
    ndf = mrange(-600, -3250, noise(-800, -3250, 0.9, detail=3.0).outputs["Fac"], 0.3, 0.7, 0.55, 1.0)
    col = scale_col(650, 400, col, mrange(-250, -3100, fmath('MULTIPLY', -400, -3100, occ, ndf), 0.0, 0.5, 1.0, 1.0 - ROAD_DIRT))
    # the packed AO, roughness and metal, and the normal, from the first layout
    sep = node('ShaderNodeSeparateColor', -800, -100); link(arm.outputs["Color"], sep.inputs["Color"])
    aoc = node('ShaderNodeMix', 900, 400, data_type='RGBA', blend_type='MULTIPLY'); aoc.inputs["Factor"].default_value = 1.0
    link(col, sock(aoc, "A_Color")); link(sep.outputs["Red"], sock(aoc, "B_Color"))
    link(sock(aoc, "Result_Color"), bsdf.inputs["Base Color"])
    link(fmath('MULTIPLY', 1100, -100, fmath('MULTIPLY', 1000, -100, sep.outputs["Green"], ROAD_ROUGH_SCALE), smooth), bsdf.inputs["Roughness"])
    link(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = node('ShaderNodeNormalMap', 1300, -300); link(nrm.outputs["Color"], nmap.inputs["Color"]); link(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    link(fmath('MULTIPLY', 1200, -400, flatten, ROAD_NORMAL_GAIN), nmap.inputs["Strength"])
    # the irregularity below the grid (item 19): two noises as a bump on top of the set's normal, a couple of
    # millimetres over 25 cm and less over 8 cm, worn down in the wheel bands with the normal map
    bh = None
    for k, (wl, h) in enumerate(ROAD_BUMP):
        term = fmath('MULTIPLY', 1100, -700 - 150 * k, noise(900, -700 - 150 * k, wl, detail=2.0).outputs["Fac"], h)
        bh = term if bh is None else fmath('ADD', 1250, -750, bh, term)
    bump = node('ShaderNodeBump', 1450, -600); bump.inputs["Distance"].default_value = 1.0
    link(bh, bump.inputs["Height"]); link(flatten, bump.inputs["Strength"]); link(nmap.outputs["Normal"], bump.inputs["Normal"])
    link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def kerb_material(name):
    # A concrete curb (AI 574 item 15), over the kerb mesh's UVs: u metres along the kerb line, v metres down the
    # profile. The pavement's light set tiles along it; a joint every KERB_JOINT_M (a dark line KERB_JOINT_W wide,
    # the distance to the nearest joint read off u wrapped to the segment); every segment its own tone from a white
    # noise of its index; the face (v past the rolled edge) a shade greyer than the top; and the foot's grime, the
    # mesh's own attribute, as before.
    d = os.path.join(PBR_DIR, "concrete_pavement")
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    def node(t, x, y, **props):
        n = nt.nodes.new(t); n.location = (x, y)
        for k, v in props.items(): setattr(n, k, v)
        return n
    def link(a, b): nt.links.new(a, b)
    def sock(n, ident): return next(sk for sk in (list(n.inputs) + list(n.outputs)) if sk.identifier == ident)
    def fmath(op, x, y, a=None, b=None):
        n = node('ShaderNodeMath', x, y, operation=op)
        for i, v in ((0, a), (1, b)):
            if v is None: continue
            if hasattr(v, "is_output"): link(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs["Value"]
    def mrange(x, y, v, fmin, fmax, tmin, tmax):
        n = node('ShaderNodeMapRange', x, y, clamp=True)
        n.inputs["From Min"].default_value = fmin; n.inputs["From Max"].default_value = fmax
        n.inputs["To Min"].default_value = tmin; n.inputs["To Max"].default_value = tmax
        link(v, n.inputs["Value"]); return n.outputs["Result"]
    def scale_col(x, y, col, fac):
        n = node('ShaderNodeVectorMath', x, y, operation='SCALE'); link(col, n.inputs[0]); link(fac, n.inputs["Scale"]); return n.outputs["Vector"]
    out = node('ShaderNodeOutputMaterial', 1400, 0); bsdf = node('ShaderNodeBsdfPrincipled', 1100, 0); link(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uv = node('ShaderNodeUVMap', -1600, 0); UV = uv.outputs["UV"]
    mp = node('ShaderNodeMapping', -1400, 200); mp.inputs["Scale"].default_value = (1.0 / GND_TILE, 1.0 / GND_TILE, 1.0); link(UV, mp.inputs["Vector"])
    def tex(fn, cs, y):
        fp = os.path.join(d, fn); assert os.path.isfile(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_concrete_pavement_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs
        t = node('ShaderNodeTexImage', -1100, y, image=im, extension='REPEAT'); link(mp.outputs["Vector"], t.inputs["Vector"]); return t
    base = tex("basecolor.jpg", 'sRGB', 300); arm = tex("arm.png", 'Non-Color', 0); nrm = tex("normal_gl.png", 'Non-Color', -300)
    xyz = node('ShaderNodeSeparateXYZ', -1400, -400); link(UV, xyz.inputs["Vector"])
    u, v = xyz.outputs["X"], xyz.outputs["Y"]
    # joints
    wrap = node('ShaderNodeMath', -1000, -600, operation='WRAP'); link(u, wrap.inputs[0]); wrap.inputs[1].default_value = KERB_JOINT_M; wrap.inputs[2].default_value = 0.0
    tojoint = fmath('MINIMUM', -800, -600, wrap.outputs["Value"], fmath('SUBTRACT', -900, -700, KERB_JOINT_M, wrap.outputs["Value"]))
    joint = mrange(-600, -600, tojoint, KERB_JOINT_W * 0.5, KERB_JOINT_W * 0.5 + 0.008, 1.0, 0.0)
    # the segment's own tone
    seg = fmath('FLOOR', -1000, -850, fmath('DIVIDE', -1200, -850, u, KERB_JOINT_M))
    sv = node('ShaderNodeCombineXYZ', -800, -850); link(seg, sv.inputs["X"]); sv.inputs["Y"].default_value = 0.5
    wn = node('ShaderNodeTexWhiteNoise', -600, -850, noise_dimensions='2D'); link(sv.outputs["Vector"], wn.inputs["Vector"])
    segtone = mrange(-400, -850, wn.outputs["Value"], 0.0, 1.0, 1.0 - KERB_SEG_VARY, 1.0 + KERB_SEG_VARY)
    # the face greyer than the top: v runs 0 at the slabs' edge, up the step, across the top, round the rolled edge
    # (a quarter of KERB_ROUND * pi) and down the face
    face = mrange(-400, -1050, v, KERB_V_FACE, KERB_V_FACE + 0.03, 1.0, KERB_FACE_TONE)
    # the joint along the slabs: the step's face and the first centimetre of the top, dark (item 26)
    sjoint = mrange(-400, -1150, v, KERB_TOP_PROUD + 0.008, KERB_TOP_PROUD + 0.022, 1.0 - KERB_JOINT_DARK, 1.0)
    # the foot's grime, the mesh's attribute
    at = node('ShaderNodeAttribute', -600, -1250, attribute_name="grime")
    grime = mrange(-400, -1250, at.outputs["Fac"], 0.0, 1.0, 1.0, 0.60)
    col = scale_col(-200, 300, base.outputs["Color"], fmath('MULTIPLY', -300, 200, fmath('MULTIPLY', -400, 200, segtone, sjoint), KERB_TONE))
    col = scale_col(0, 300, col, fmath('SUBTRACT', -200, -600, 1.0, fmath('MULTIPLY', -400, -600, joint, KERB_JOINT_DARK)))
    col = scale_col(200, 300, col, face); col = scale_col(400, 300, col, grime)
    # ---- weathering (item 27), in h = the height above the gutter's foot (0 there) and u along the kerb
    def noise_at(x, y, size, vec, detail=2.0):
        n = node('ShaderNodeTexNoise', x, y); n.inputs["Scale"].default_value = 1.0 / size; n.inputs["Detail"].default_value = detail
        link(vec, n.inputs["Vector"]); return n.outputs["Fac"]
    def along(x, y, k):        # a vector that varies along the kerb only, on its own row so no two noises agree
        c = node('ShaderNodeCombineXYZ', x, y); link(u, c.inputs["X"]); c.inputs["Y"].default_value = k; return c.outputs["Vector"]
    h = fmath('SUBTRACT', -1200, -1500, KERB_V_ROUND_END + KERB_H_FACE, v)
    onface = mrange(-1000, -1450, v, KERB_V_ROUND_END - 0.01, KERB_V_ROUND_END + 0.01, 0.0, 1.0)
    uh = node('ShaderNodeCombineXYZ', -1200, -1650); link(u, uh.inputs["X"]); link(h, uh.inputs["Y"])
    # dirt at the foot: a band up to an irregular height, darkest at the foot, mottled, heavier on some stretches
    foot_h = mrange(-800, -1500, noise_at(-1000, -1500, 1.7, along(-1200, -1750, 3.3)), 0.3, 0.7, KERB_FOOT_H - KERB_FOOT_VARY, KERB_FOOT_H + KERB_FOOT_VARY)
    foot_h = fmath('ADD', -750, -1500, foot_h, mrange(-800, -1440, noise_at(-1000, -1440, 0.3, along(-1200, -1440, 5.9)), 0.3, 0.7, -0.015, 0.015))   # a finer raggedness
    fe = node('ShaderNodeMapRange', -600, -1500, clamp=True); link(h, fe.inputs["Value"])
    link(fmath('SUBTRACT', -700, -1560, foot_h, 0.02), fe.inputs["From Min"]); link(fmath('ADD', -700, -1620, foot_h, 0.01), fe.inputs["From Max"])
    fe.inputs["To Min"].default_value = 1.0; fe.inputs["To Max"].default_value = 0.0
    foot_var = mrange(-800, -1800, noise_at(-1000, -1800, 4.0, along(-1200, -1850, 7.1)), 0.3, 0.7, 0.8, 1.0)
    foot_tex = mrange(-800, -1950, noise_at(-1000, -1950, 0.08, uh.outputs["Vector"], detail=3.0), 0.3, 0.7, 0.8, 1.0)
    foot = fmath('MULTIPLY', -400, -1500, fmath('MULTIPLY', -500, -1500, fe.outputs["Result"], foot_var), fmath('MULTIPLY', -500, -1560, foot_tex, onface))
    weather = fmath('SUBTRACT', -200, -1500, 1.0, fmath('MULTIPLY', -300, -1500, foot, KERB_FOOT_DARK))
    # a grime mottle over the whole face, in irregular patches (two noises), heavier low down
    gm = fmath('MULTIPLY', -400, -1300, mrange(-600, -1300, noise_at(-800, -1300, 0.18, uh.outputs["Vector"], detail=3.0), 0.35, 0.65, 0.0, 1.0),
               mrange(-600, -1360, noise_at(-800, -1360, 0.9, uh.outputs["Vector"]), 0.35, 0.65, 0.3, 1.0))
    gm = fmath('MULTIPLY', -300, -1300, gm, fmath('MULTIPLY', -350, -1240, onface, mrange(-500, -1240, h, 0.0, 0.25, 1.0, 0.45)))
    weather = fmath('MULTIPLY', -150, -1300, weather, fmath('SUBTRACT', -250, -1300, 1.0, fmath('MULTIPLY', -300, -1360, gm, KERB_GRIME)))
    # tide lines: a dark line with a sharp upper edge fading down, at a wobbling height, on part of the length only
    tide_all = None
    for k, th in enumerate(KERB_TIDE_H):
        y = -2100 - 320 * k
        line_h = mrange(-800, y, noise_at(-1000, y, 2.3 + 0.8 * k, along(-1200, y, 11.3 + 2.7 * k)), 0.3, 0.7, th - KERB_TIDE_VARY, th + KERB_TIDE_VARY)
        d = fmath('SUBTRACT', -700, y - 70, line_h, h)                                     # positive below the line
        top = mrange(-600, y, d, -0.006, 0.0, 0.0, 1.0); down = mrange(-600, y - 120, d, 0.0, KERB_TIDE_FADE, 1.0, 0.0)
        cover = mrange(-800, y - 200, noise_at(-1000, y - 200, 3.0, along(-1200, y - 200, 21.7 + 3.1 * k)), 0.42, 0.50, 0.0, 1.0)   # Perlin's Fac lives near 0.5: about two thirds of the length
        tide = fmath('MULTIPLY', -400, y, fmath('MULTIPLY', -500, y, top, down), fmath('MULTIPLY', -500, y - 60, cover, onface))
        weather = fmath('MULTIPLY', -200, y, weather, fmath('SUBTRACT', -300, y, 1.0, fmath('MULTIPLY', -350, y - 60, tide, KERB_TIDE_DARK)))
        tide_all = tide if tide_all is None else fmath('MAXIMUM', -150, y, tide_all, tide)
    # drip streaks down the face: a share of the blocks, each at its own place in the block, broken along its length
    streak_on = mrange(-800, -2800, wn.outputs["Value"], KERB_STREAK_P, KERB_STREAK_P + 0.02, 1.0, 0.0)
    spos = fmath('ADD', -700, -2860, fmath('MULTIPLY', -800, -2860, fmath('FRACT', -900, -2860, fmath('MULTIPLY', -1000, -2860, wn.outputs["Value"], 7.0)), KERB_JOINT_M - 0.1), 0.05)
    du = fmath('ABSOLUTE', -600, -2860, fmath('SUBTRACT', -650, -2920, wrap.outputs["Value"], spos))
    sbrk = mrange(-800, -3000, noise_at(-1000, -3000, 0.05, uh.outputs["Vector"]), 0.3, 0.7, 0.4, 1.0)
    streak = fmath('MULTIPLY', -400, -2800, fmath('MULTIPLY', -500, -2800, mrange(-550, -2740, du, KERB_STREAK_W * 0.5, KERB_STREAK_W * 0.5 + 0.008, 1.0, 0.0), streak_on),
                   fmath('MULTIPLY', -500, -2860, sbrk, onface))
    weather = fmath('MULTIPLY', -200, -2800, weather, fmath('SUBTRACT', -300, -2800, 1.0, fmath('MULTIPLY', -350, -2860, streak, KERB_STREAK_DARK)))
    # the arris worn pale where tires and feet scuff it, coming and going along the kerb; the odd chip, paler still
    dv = fmath('ABSOLUTE', -1000, -3200, fmath('SUBTRACT', -1100, -3200, v, KERB_V_ROUND_MID))
    edge_band = mrange(-800, -3200, dv, KERB_ROUND * 0.8, KERB_ROUND * 0.8 + KERB_EDGE_BAND, 1.0, 0.0)
    edge_var = mrange(-800, -3350, noise_at(-1000, -3350, 0.9, along(-1200, -3350, 31.7)), 0.4, 0.6, 0.0, 1.0)
    edgewear = fmath('MULTIPLY', -600, -3200, edge_band, edge_var)
    cell = fmath('FLOOR', -1100, -3550, fmath('DIVIDE', -1200, -3550, u, 0.25))
    cv = node('ShaderNodeCombineXYZ', -1000, -3550); link(cell, cv.inputs["X"]); cv.inputs["Y"].default_value = 2.5
    wc = node('ShaderNodeTexWhiteNoise', -900, -3550, noise_dimensions='2D'); link(cv.outputs["Vector"], wc.inputs["Vector"])
    chip_on = mrange(-800, -3550, wc.outputs["Value"], KERB_CHIP_P, KERB_CHIP_P + 0.01, 1.0, 0.0)
    cu = fmath('MULTIPLY', -700, -3650, fmath('ADD', -800, -3650, cell, fmath('ADD', -900, -3700, fmath('MULTIPLY', -1000, -3700, fmath('FRACT', -1100, -3700, fmath('MULTIPLY', -1200, -3700, wc.outputs["Value"], 13.0)), 0.6), 0.2)), 0.25)
    pa = node('ShaderNodeCombineXYZ', -600, -3600); link(u, pa.inputs["X"]); link(v, pa.inputs["Y"])
    pb = node('ShaderNodeCombineXYZ', -600, -3700); link(cu, pb.inputs["X"]); pb.inputs["Y"].default_value = KERB_V_ROUND_MID
    dist = node('ShaderNodeVectorMath', -500, -3650, operation='DISTANCE'); link(pa.outputs["Vector"], dist.inputs[0]); link(pb.outputs["Vector"], dist.inputs[1])
    rag = fmath('MULTIPLY', -500, -3800, noise_at(-700, -3800, 0.03, pa.outputs["Vector"], detail=1.0), 0.02)
    chip = fmath('MULTIPLY', -300, -3650, mrange(-400, -3650, fmath('ADD', -450, -3700, dist.outputs["Value"], rag), KERB_CHIP_R * 0.6, KERB_CHIP_R + 0.01, 1.0, 0.0), chip_on)
    weather = fmath('MULTIPLY', -200, -3200, weather, fmath('ADD', -300, -3200, 1.0, fmath('ADD', -350, -3260, fmath('MULTIPLY', -400, -3200, edgewear, KERB_EDGE_WEAR), fmath('MULTIPLY', -400, -3260, chip, KERB_CHIP_LIGHT))))
    col = scale_col(600, 300, col, weather)
    # the dirt's colour: the foot band and the tide lines go toward a warm brown grime, not just darker
    dirt_amt = fmath('MULTIPLY', 650, -500, fmath('MINIMUM', 600, -500, fmath('ADD', 550, -500, foot, fmath('MULTIPLY', 500, -560, tide_all, 0.7)), 1.0), KERB_DIRT_AMT)
    tinted = node('ShaderNodeMix', 700, -400, data_type='RGBA', blend_type='MULTIPLY'); tinted.inputs["Factor"].default_value = 1.0
    link(col, sock(tinted, "A_Color")); sock(tinted, "B_Color").default_value = (*KERB_DIRT_TINT, 1.0)
    dirty = node('ShaderNodeMix', 850, 300, data_type='RGBA', blend_type='MIX')
    link(dirt_amt, dirty.inputs["Factor"]); link(col, sock(dirty, "A_Color")); link(sock(tinted, "Result_Color"), sock(dirty, "B_Color"))
    col = sock(dirty, "Result_Color")
    rough_mul = fmath('MULTIPLY', 600, -200, fmath('SUBTRACT', 500, -200, 1.0, fmath('MULTIPLY', 400, -200, edgewear, 0.25)), fmath('ADD', 500, -260, 1.0, fmath('MULTIPLY', 400, -260, foot, 0.15)))
    sep = node('ShaderNodeSeparateColor', -800, 0); link(arm.outputs["Color"], sep.inputs["Color"])
    aoc = node('ShaderNodeMix', 700, 300, data_type='RGBA', blend_type='MULTIPLY'); aoc.inputs["Factor"].default_value = 1.0
    link(col, sock(aoc, "A_Color")); link(sep.outputs["Red"], sock(aoc, "B_Color")); link(sock(aoc, "Result_Color"), bsdf.inputs["Base Color"])
    link(fmath('MULTIPLY', 800, -100, sep.outputs["Green"], rough_mul), bsdf.inputs["Roughness"]); link(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = node('ShaderNodeNormalMap', 800, -300); link(nrm.outputs["Color"], nmap.inputs["Color"]); link(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def pavement_material(name):
    # Scored concrete slabs (AI 574 item 4), over UVs that are world metres, on the PAVE_SET set tinted to the
    # photo's tone. The piece's kerb rectangle (pad_lo, pad_hi: x0, y0 / x1, y1, object properties written by
    # kerbed_pavement) gives every point its distances to the four kerb lines; the nearest one says which strip the
    # point is on, and a point within KERB_R of two kerb lines lies in a curb return's corner square, whose fan is
    # laid about the return's centre. Straight strips: transverse joints along the strip at PAVE_PITCH fitted to the
    # run between the two returns (so the first and last joint are the returns' tangent lines, which are also the
    # fans' first and last radials), and the longitudinal joint PAVE_LONG in from the slabs' edge. The corner: radial
    # joints every quarter turn over PAVE_FAN_N, the arc joint at PAVE_ARC_R. Every joint is a groove PAVE_JOINT_W
    # wide (darkened, its lips chamfered in the normal) with dirt fading out beside it over PAVE_JOINT_DIRT_M, the
    # transverse and radial ones each at their own strength; the kerb top's step gets the same dirt on the slab
    # side. Each slab's tone comes from a white noise of its index (along, across, which strip, which piece). The
    # grime along the wall base is an ambient-occlusion read of the walls and plinths within PAVE_GRIME_M, gone
    # toward a warm dirt, loosened along the wall by a noise as the road's kerb dirt is.
    d = os.path.join(PBR_DIR, PAVE_SET)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    def node(t, x, y, **props):
        n = nt.nodes.new(t); n.location = (x, y)
        for k, v in props.items(): setattr(n, k, v)
        return n
    def link(a, b): nt.links.new(a, b)
    def sock(n, ident): return next(sk for sk in (list(n.inputs) + list(n.outputs)) if sk.identifier == ident)
    def fmath(op, x, y, a=None, b=None, c=None):
        n = node('ShaderNodeMath', x, y, operation=op)
        for i, v in ((0, a), (1, b), (2, c)):
            if v is None: continue
            if hasattr(v, "is_output"): link(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs["Value"]
    def mrange(x, y, v, fmin, fmax, tmin, tmax, smooth=False):
        n = node('ShaderNodeMapRange', x, y, clamp=True, interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR')
        for k, val in (("From Min", fmin), ("From Max", fmax), ("To Min", tmin), ("To Max", tmax)):
            if hasattr(val, "is_output"): link(val, n.inputs[k])
            else: n.inputs[k].default_value = val
        link(v, n.inputs["Value"]); return n.outputs["Result"]
    def fmix(x, y, fac, a, b):   # b where fac is 1, a where 0
        n = node('ShaderNodeMix', x, y, data_type='FLOAT'); link(fac, n.inputs["Factor"])
        for ident, v in (("A_Float", a), ("B_Float", b)):
            if hasattr(v, "is_output"): link(v, sock(n, ident))
            else: sock(n, ident).default_value = v
        return sock(n, "Result_Float")
    def scale_col(x, y, col, fac):
        n = node('ShaderNodeVectorMath', x, y, operation='SCALE'); link(col, n.inputs[0]); link(fac, n.inputs["Scale"]); return n.outputs["Vector"]
    def xyz(x, y, a, b, c=0.0):
        n = node('ShaderNodeCombineXYZ', x, y)
        for k, v in (("X", a), ("Y", b), ("Z", c)):
            if hasattr(v, "is_output"): link(v, n.inputs[k])
            else: n.inputs[k].default_value = v
        return n.outputs["Vector"]
    def white(x, y, vec):
        n = node('ShaderNodeTexWhiteNoise', x, y, noise_dimensions='3D'); link(vec, n.inputs["Vector"]); return n.outputs["Value"]
    out = node('ShaderNodeOutputMaterial', 2600, 0); bsdf = node('ShaderNodeBsdfPrincipled', 2300, 0); link(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uv = node('ShaderNodeUVMap', -4200, 0); UV = uv.outputs["UV"]
    mp = node('ShaderNodeMapping', -4000, 300); mp.inputs["Scale"].default_value = (1.0 / GND_TILE, 1.0 / GND_TILE, 1.0); link(UV, mp.inputs["Vector"])
    def tex(fn, cs, y):
        fp = os.path.join(d, fn); assert os.path.isfile(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{PAVE_SET}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs
        t = node('ShaderNodeTexImage', -3700, y, image=im, extension='REPEAT'); link(mp.outputs["Vector"], t.inputs["Vector"]); return t
    base = tex("basecolor.jpg", 'sRGB', 600); arm = tex("arm.png", 'Non-Color', 300); nrm = tex("normal_gl.png", 'Non-Color', 0)
    P = node('ShaderNodeSeparateXYZ', -4000, -300); link(UV, P.inputs["Vector"]); X, Y = P.outputs["X"], P.outputs["Y"]
    # ---- the piece's kerb rectangle, and the point's place in it
    lo = node('ShaderNodeAttribute', -4200, -600, attribute_type='OBJECT', attribute_name="pad_lo")
    hi = node('ShaderNodeAttribute', -4200, -800, attribute_type='OBJECT', attribute_name="pad_hi")
    LO = node('ShaderNodeSeparateXYZ', -4000, -600); link(lo.outputs["Vector"], LO.inputs["Vector"])
    HI = node('ShaderNodeSeparateXYZ', -4000, -800); link(hi.outputs["Vector"], HI.inputs["Vector"])
    x0, y0, x1, y1 = LO.outputs["X"], LO.outputs["Y"], HI.outputs["X"], HI.outputs["Y"]
    dW = fmath('SUBTRACT', -3700, -600, X, x0); dE = fmath('SUBTRACT', -3700, -700, x1, X)
    dS = fmath('SUBTRACT', -3700, -800, Y, y0); dN = fmath('SUBTRACT', -3700, -900, y1, Y)
    dx = fmath('MINIMUM', -3500, -650, dW, dE); dy = fmath('MINIMUM', -3500, -850, dS, dN)
    west = fmath('LESS_THAN', -3500, -1000, dW, dE); south = fmath('LESS_THAN', -3500, -1100, dS, dN)   # which pair of kerb lines is nearer
    yside = fmath('LESS_THAN', -3300, -700, dx, dy)                # nearer a west or east kerb: the strip runs along y
    in_corner = fmath('MULTIPLY', -3300, -900, fmath('LESS_THAN', -3400, -900, dx, KERB_R), fmath('LESS_THAN', -3400, -960, dy, KERB_R))
    INSET = KERB_ROUND + KERB_TOP_W
    # ---- the straight strips: the transverse pitch fitted to the run between the returns, the longitudinal joint
    along = fmix(-3100, -600, yside, fmath('SUBTRACT', -3300, -560, X, fmath('ADD', -3400, -560, x0, KERB_R)),
                 fmath('SUBTRACT', -3300, -640, Y, fmath('ADD', -3400, -640, y0, KERB_R)))
    run = fmath('SUBTRACT', -3100, -750, fmix(-3200, -750, yside, fmath('SUBTRACT', -3300, -740, x1, x0), fmath('SUBTRACT', -3300, -800, y1, y0)), 2.0 * KERB_R)
    pitch = fmath('DIVIDE', -2900, -750, run, fmath('MAXIMUM', -3000, -750, fmath('ROUND', -3000, -800, fmath('DIVIDE', -3050, -800, run, PAVE_PITCH)), 1.0))
    a = fmath('WRAP', -2800, -600, along, pitch, 0.0)
    d_tr = fmath('MINIMUM', -2650, -600, a, fmath('SUBTRACT', -2700, -660, pitch, a))          # to the nearest transverse joint
    k_tr = fmath('FLOOR', -2650, -520, fmath('DIVIDE', -2700, -520, fmath('ADD', -2750, -520, along, fmath('MULTIPLY', -2800, -520, pitch, 0.5)), pitch))   # that joint's index
    i_tr = fmath('FLOOR', -2650, -460, fmath('DIVIDE', -2700, -460, along, pitch))              # the slab's index along
    across = fmath('SUBTRACT', -3300, -1200, fmath('MINIMUM', -3400, -1200, dx, dy), INSET)    # 0 at the slabs' edge, PAVE_W - INSET at the wall
    d_lo = fmath('ABSOLUTE', -3100, -1200, fmath('SUBTRACT', -3200, -1200, across, PAVE_LONG))
    j_tr = fmath('GREATER_THAN', -3100, -1280, across, PAVE_LONG)                                # which side of the longitudinal joint
    # ---- the corner square: the fan about the return's centre, the arc joint
    cx = fmix(-3100, -1500, west, fmath('SUBTRACT', -3300, -1500, x1, KERB_R), fmath('ADD', -3300, -1560, x0, KERB_R))
    cy = fmix(-3100, -1650, south, fmath('SUBTRACT', -3300, -1650, y1, KERB_R), fmath('ADD', -3300, -1710, y0, KERB_R))
    qx = fmath('SUBTRACT', -2900, -1500, X, cx); qy = fmath('SUBTRACT', -2900, -1650, Y, cy)
    rad = node('ShaderNodeVectorMath', -2700, -1580, operation='LENGTH'); link(xyz(-2800, -1580, qx, qy), rad.inputs[0]); r = rad.outputs["Value"]
    theta = fmath('ARCTAN2', -2700, -1450, qy, qx)
    step = math.pi / 2.0 / PAVE_FAN_N
    ta = fmath('WRAP', -2500, -1450, theta, step, 0.0)
    d_rad = fmath('MULTIPLY', -2300, -1450, fmath('MINIMUM', -2400, -1450, ta, fmath('SUBTRACT', -2450, -1510, step, ta)), r)   # to the nearest radial, in metres
    k_rad = fmath('FLOOR', -2300, -1370, fmath('DIVIDE', -2400, -1370, fmath('ADD', -2450, -1370, theta, step * 0.5), step))
    i_fan = fmath('FLOOR', -2300, -1310, fmath('DIVIDE', -2400, -1310, theta, step))
    d_arc = fmath('ABSOLUTE', -2300, -1650, fmath('SUBTRACT', -2400, -1650, r, PAVE_ARC_R))
    j_fan = fmath('GREATER_THAN', -2300, -1730, r, PAVE_ARC_R)
    across_c = fmath('SUBTRACT', -2300, -1800, KERB_R - INSET, r)                                # 0 at the slabs' edge on the arc
    # ---- the point's joints: the pitched family (transverse or radial) and the long one (longitudinal or arc)
    d_a = fmix(-2000, -600, in_corner, d_tr, d_rad); d_b = fmix(-2000, -700, in_corner, d_lo, d_arc)
    k = fmix(-2000, -800, in_corner, k_tr, k_rad); i = fmix(-2000, -900, in_corner, i_tr, i_fan); j = fmix(-2000, -1000, in_corner, j_tr, j_fan)
    acr = fmix(-2000, -1100, in_corner, across, across_c)
    # the strip's or the corner's code: 0-3 a straight side (yside, and which of its pair), 4-7 a corner; and the piece's seed
    side = fmath('ADD', -2000, -1250, fmath('MULTIPLY', -2100, -1250, yside, 2.0), fmix(-2100, -1320, yside, south, west))
    code = fmix(-1900, -1250, in_corner, side, fmath('ADD', -2000, -1400, 4.0, fmath('ADD', -2100, -1400, fmath('MULTIPLY', -2200, -1400, west, 2.0), south)))
    seed = fmath('MULTIPLY_ADD', -2000, -1500, x0, 0.173, fmath('MULTIPLY', -2100, -1560, y0, 0.291))
    # ---- the joints: a groove, its lips' chamfer, the dirt beside it; the pitched family at its own strength
    strength = mrange(-1500, -800, white(-1650, -800, xyz(-1800, -800, k, fmath('ADD', -1900, -860, code, 100.0), seed)), 0.0, 1.0, PAVE_JOINT_VARY[0], PAVE_JOINT_VARY[1])
    W2 = PAVE_JOINT_W * 0.5
    def groove(x, y, dist):   # (the line, the dirt beside it) of one joint family at distance dist
        line = mrange(x, y, dist, W2, W2 + 0.004, 1.0, 0.0)
        dirt = mrange(x, y - 80, dist, W2, W2 + PAVE_JOINT_DIRT_M, 1.0, 0.0, smooth=True)
        return line, dirt
    la, da = groove(-1500, -500, d_a); lb, db = groove(-1500, -650, d_b)
    line = fmath('MAXIMUM', -1200, -500, fmath('MULTIPLY', -1300, -500, la, strength), lb)
    dirt = fmath('MAXIMUM', -1200, -650, fmath('MULTIPLY', -1300, -650, da, strength), db)
    # the kerb top's step: a joint along the slabs' edge, dark, with dirt on the slab side
    lk = mrange(-1500, -1000, acr, 0.0, 0.006, 1.0, 0.0); dk = mrange(-1500, -1080, acr, 0.0, PAVE_KERB_JOINT_M, 1.0, 0.0, smooth=True)
    line = fmath('MAXIMUM', -1000, -500, line, lk); dirt = fmath('MAXIMUM', -1000, -650, dirt, dk)
    d_min = fmath('MINIMUM', -1500, -1200, d_a, d_b)
    bevel = fmath('MULTIPLY', -1200, -1200, mrange(-1350, -1200, d_min, W2, W2 + PAVE_JOINT_BEVEL[0], 1.0, 0.0, smooth=True), -PAVE_JOINT_BEVEL[1])   # the height: the groove dips
    # ---- the slab's own tone
    tone = mrange(-1200, -900, white(-1350, -900, xyz(-1500, -900, i, fmath('MULTIPLY_ADD', -1650, -900, code, 8.0, j), seed)), 0.0, 1.0, 1.0 - PAVE_SLAB_VARY, 1.0 + PAVE_SLAB_VARY)
    # ---- the wall-base grime: the occlusion by the walls and plinths, mapped, loosened along the wall by a noise
    ao = node('ShaderNodeAmbientOcclusion', -1650, -1600, samples=PAVE_GRIME_SAMPLES, inside=False, only_local=False); ao.inputs["Distance"].default_value = PAVE_GRIME_M
    occ = fmath('SUBTRACT', -1450, -1600, 1.0, ao.outputs["AO"])
    ns = node('ShaderNodeTexNoise', -1650, -1800); ns.inputs["Scale"].default_value = 1.0 / 0.9; ns.inputs["Detail"].default_value = 3.0; link(UV, ns.inputs["Vector"])
    grime = fmath('MULTIPLY', -1000, -1600, mrange(-1200, -1600, occ, PAVE_GRIME_OCC[0], PAVE_GRIME_OCC[1], 0.0, 1.0, smooth=True),
                  mrange(-1200, -1800, ns.outputs["Fac"], 0.3, 0.7, 0.6, 1.0))
    # ---- the colour: the set tinted, the slab's tone, the joints and their dirt, the grime, the packed AO
    tint = node('ShaderNodeMix', -900, 600, data_type='RGBA', blend_type='MULTIPLY'); tint.inputs["Factor"].default_value = 1.0
    link(base.outputs["Color"], sock(tint, "A_Color")); sock(tint, "B_Color").default_value = (*PAVE_TINT, 1.0)
    # the set's grain calmed: its colour part way to its own (tinted) mean
    calm = node('ShaderNodeMix', -700, 600, data_type='RGBA', blend_type='MIX'); calm.inputs["Factor"].default_value = 1.0 - PAVE_GRAIN
    link(sock(tint, "Result_Color"), sock(calm, "A_Color")); sock(calm, "B_Color").default_value = (*(a * b for a, b in zip(PAVE_SET_MEAN, PAVE_TINT)), 1.0)
    col = scale_col(-500, 600, sock(calm, "Result_Color"), tone)
    col = scale_col(-300, 600, col, fmath('SUBTRACT', -500, 400, 1.0, fmath('MULTIPLY', -600, 400, line, PAVE_JOINT_DARK)))
    col = scale_col(-100, 600, col, fmath('SUBTRACT', -300, 400, 1.0, fmath('MULTIPLY', -400, 400, dirt, PAVE_JOINT_DIRT)))
    tinted = node('ShaderNodeMix', 100, 400, data_type='RGBA', blend_type='MULTIPLY'); tinted.inputs["Factor"].default_value = 1.0
    link(col, sock(tinted, "A_Color")); sock(tinted, "B_Color").default_value = (*PAVE_GRIME_TINT, 1.0)
    grimed = node('ShaderNodeMix', 300, 600, data_type='RGBA', blend_type='MIX')
    link(fmath('MULTIPLY', 100, 200, grime, PAVE_GRIME), grimed.inputs["Factor"]); link(col, sock(grimed, "A_Color")); link(sock(tinted, "Result_Color"), sock(grimed, "B_Color"))
    sep = node('ShaderNodeSeparateColor', -3400, 300); link(arm.outputs["Color"], sep.inputs["Color"])
    aoc = node('ShaderNodeMix', 600, 600, data_type='RGBA', blend_type='MULTIPLY'); aoc.inputs["Factor"].default_value = 1.0
    link(sock(grimed, "Result_Color"), sock(aoc, "A_Color")); link(sep.outputs["Red"], sock(aoc, "B_Color")); link(sock(aoc, "Result_Color"), bsdf.inputs["Base Color"])
    rough = fmath('MULTIPLY', 900, 200, sep.outputs["Green"], fmath('ADD', 700, 200, 1.0, fmath('MULTIPLY_ADD', 500, 200, dirt, PAVE_JOINT_ROUGH, fmath('MULTIPLY', 300, 200, grime, PAVE_GRIME_ROUGH))))
    link(rough, bsdf.inputs["Roughness"]); link(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = node('ShaderNodeNormalMap', 900, -300); link(nrm.outputs["Color"], nmap.inputs["Color"]); nmap.inputs["Strength"].default_value = PAVE_NORMAL
    bump = node('ShaderNodeBump', 1200, -300); bump.inputs["Distance"].default_value = 1.0; bump.inputs["Strength"].default_value = 1.0
    link(bevel, bump.inputs["Height"]); link(nmap.outputs["Normal"], bump.inputs["Normal"]); link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def lot_material(name):
    # Dry lot ground (AI 574 item 2), over UVs that are metres: each of LOT_SETS laid per random Voronoi cell of
    # LOT_TILE_M -- turned about the cell's feature point by the cell's own angle, slid by its own offset, scaled to
    # the set's own tile, as road_material lays the asphalt -- and the two traded over a LOT_BLEND_M noise, colour,
    # packed AO / roughness / metal and normal each mixed by the same factor. No tint, no lift: the sets as they are.
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    def node(t, x, y, **props):
        n = nt.nodes.new(t); n.location = (x, y)
        for k, v in props.items(): setattr(n, k, v)
        return n
    def link(a, b): nt.links.new(a, b)
    def sock(n, ident): return next(sk for sk in (list(n.inputs) + list(n.outputs)) if sk.identifier == ident)
    def fmath(op, x, y, a, b):
        n = node('ShaderNodeMath', x, y, operation=op)
        for i, v in ((0, a), (1, b)):
            if hasattr(v, "is_output"): link(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs["Value"]
    uv = node('ShaderNodeUVMap', -2400, 0); UV = uv.outputs["UV"]
    def random_tile(x, y, cell_m, shift, tile_m):
        sh = node('ShaderNodeVectorMath', x, y, operation='ADD'); link(UV, sh.inputs[0]); sh.inputs[1].default_value = (shift[0], shift[1], 0.0)
        vor = node('ShaderNodeTexVoronoi', x + 200, y, voronoi_dimensions='2D', feature='F1')
        vor.inputs["Scale"].default_value = 1.0 / cell_m; vor.inputs["Randomness"].default_value = 1.0; link(sh.outputs["Vector"], vor.inputs["Vector"])
        rnd = node('ShaderNodeSeparateColor', x + 400, y - 200); link(vor.outputs["Color"], rnd.inputs["Color"])
        local = node('ShaderNodeVectorMath', x + 400, y, operation='SUBTRACT'); link(sh.outputs["Vector"], local.inputs[0]); link(vor.outputs["Position"], local.inputs[1])
        rot = node('ShaderNodeVectorRotate', x + 600, y, rotation_type='AXIS_ANGLE'); rot.inputs["Axis"].default_value = (0.0, 0.0, 1.0)
        link(local.outputs["Vector"], rot.inputs["Vector"]); link(fmath('MULTIPLY', x + 600, y - 200, rnd.outputs["Red"], 2.0 * math.pi), rot.inputs["Angle"])
        off = node('ShaderNodeCombineXYZ', x + 800, y - 200)
        link(fmath('MULTIPLY', x + 600, y - 350, rnd.outputs["Green"], 37.0), off.inputs["X"]); link(fmath('MULTIPLY', x + 600, y - 500, rnd.outputs["Blue"], 53.0), off.inputs["Y"])
        pos = node('ShaderNodeVectorMath', x + 800, y, operation='ADD'); link(rot.outputs["Vector"], pos.inputs[0]); link(off.outputs["Vector"], pos.inputs[1])
        sc = node('ShaderNodeVectorMath', x + 1000, y, operation='SCALE'); link(pos.outputs["Vector"], sc.inputs[0]); sc.inputs["Scale"].default_value = 1.0 / tile_m
        return sc.outputs["Vector"]
    def tex(folder, fn, cs, x, y, vec):
        fp = os.path.join(PBR_DIR, folder, fn); assert os.path.isfile(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{folder}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs
        t = node('ShaderNodeTexImage', x, y, image=im, extension='REPEAT'); link(vec, t.inputs["Vector"]); return t
    maps = []
    for k, (folder, tile_m) in enumerate(LOT_SETS):
        y = 500 - 900 * k
        vec = random_tile(-2200, y, LOT_TILE_M * (1.0 + 0.23 * k), (3.1 * k, 4.7 * k), tile_m)
        maps.append((tex(folder, "basecolor.jpg", 'sRGB', -1000, y + 100, vec), tex(folder, "arm.png", 'Non-Color', -1000, y - 200, vec),
                     tex(folder, "normal_gl.png", 'Non-Color', -1000, y - 500, vec)))
    ns = node('ShaderNodeTexNoise', -1000, 1000); ns.inputs["Scale"].default_value = 1.0 / LOT_BLEND_M; ns.inputs["Detail"].default_value = 2.0
    link(UV, ns.inputs["Vector"])
    mr = node('ShaderNodeMapRange', -800, 1000, clamp=True)
    mr.inputs["From Min"].default_value = LOT_BLEND[0]; mr.inputs["From Max"].default_value = LOT_BLEND[1]
    mr.inputs["To Min"].default_value = 0.0; mr.inputs["To Max"].default_value = 1.0
    link(ns.outputs["Fac"], mr.inputs["Value"]); fac = mr.outputs["Result"]
    def traded(x, y, a, b):   # the first set's map where the noise is low, the second's where it is high
        n = node('ShaderNodeMix', x, y, data_type='RGBA', blend_type='MIX'); link(fac, n.inputs["Factor"]); link(a, sock(n, "A_Color")); link(b, sock(n, "B_Color"))
        return sock(n, "Result_Color")
    col = traded(-600, 500, maps[0][0].outputs["Color"], maps[1][0].outputs["Color"])
    armc = traded(-600, 200, maps[0][1].outputs["Color"], maps[1][1].outputs["Color"])
    nrmc = traded(-600, -100, maps[0][2].outputs["Color"], maps[1][2].outputs["Color"])
    out = node('ShaderNodeOutputMaterial', 700, 0); bsdf = node('ShaderNodeBsdfPrincipled', 420, 0); link(bsdf.outputs["BSDF"], out.inputs["Surface"])
    sep = node('ShaderNodeSeparateColor', -300, 200); link(armc, sep.inputs["Color"])
    aoc = node('ShaderNodeMix', 200, 250, data_type='RGBA', blend_type='MULTIPLY'); aoc.inputs["Factor"].default_value = 1.0
    link(col, sock(aoc, "A_Color")); link(sep.outputs["Red"], sock(aoc, "B_Color")); link(sock(aoc, "Result_Color"), bsdf.inputs["Base Color"])
    link(sep.outputs["Green"], bsdf.inputs["Roughness"]); link(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = node('ShaderNodeNormalMap', 200, -300); link(nrmc, nm.inputs["Color"]); link(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m

gnd = bpy.data.collections.new("GROUND"); S.collection.children.link(gnd)
def ground_mesh(name, verts, faces, mat, uvs, slots=None, attrs=None, smooth=None, col=None):
    # uvs: a function of the vertex, or one pair per vertex; mat: one material or a list, with slots one index per
    # face; attrs: {name: one float per vertex}; smooth: the faces shaded smooth (the rest flat); col: the collection
    # the object goes into, the ground's unless another is named (the context's, item 28)
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    me.uv_layers.new(name="UVMap"); uvl = me.uv_layers.active.data
    for pl in me.polygons:
        for li in pl.loop_indices:
            vi = me.loops[li].vertex_index
            uvl[li].uv = uvs(me.vertices[vi].co) if callable(uvs) else uvs[vi]
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]): me.materials.append(m)
    if slots:
        for pl, k in zip(me.polygons, slots): pl.material_index = k
    for an, vals in (attrs or {}).items():
        me.attributes.new(an, 'FLOAT', 'POINT').data.foreach_set("value", vals)
    for k in (smooth or ()): me.polygons[k].use_smooth = True
    ob = bpy.data.objects.new(name, me); (col or gnd).objects.link(ob); return ob
FLAT = lambda q: (q.x, q.y)                      # a horizontal surface takes the world's own metres

def offset_poly(poly, w):
    # a convex anticlockwise outline pushed out w: each edge slides along its outward normal and the neighbours meet again
    n, out = len(poly), []
    for i in range(n):
        a0, a1, a2 = (Vector(poly[(i + k) % n]) for k in (-1, 0, 1))
        d0 = (a1 - a0).normalized(); d1 = (a2 - a1).normalized()
        p0 = a1 + Vector((d0.y, -d0.x)) * w; p1 = a1 + Vector((d1.y, -d1.x)) * w
        den = d0.x * d1.y - d0.y * d1.x
        if abs(den) < 1e-9: out.append((p0.x, p0.y)); continue
        t = ((p1 - p0).x * d1.y - (p1 - p0).y * d1.x) / den
        q = p0 + d0 * t; out.append((q.x, q.y))
    return out
def rect(x0, x1, y0, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]     # anticlockwise seen from above: face up
def fillet(poly, r, step):
    # every corner of an anticlockwise polygon that stands inside the field, replaced by an arc of radius r tangent
    # to both its edges (the tangent points r * tan(turn / 2) back from the corner); corners on the field's edge and
    # concave ones keep their point
    n, out = len(poly), []
    for i in range(n):
        p, v, q = (Vector(poly[(i + k) % n]) for k in (-1, 0, 1))
        d0 = (v - p).normalized(); d1 = (q - v).normalized()
        turn = math.atan2(d0.x * d1.y - d0.y * d1.x, d0.dot(d1))       # a left turn is positive
        if turn <= 1e-6 or max(abs(v.x), abs(v.y)) > GND_FAR - 1.0: out.append((v.x, v.y)); continue
        t = r * math.tan(turn / 2.0)
        t0 = v - d0 * t; c = t0 + Vector((-d0.y, d0.x)) * r           # the arc's centre, in from the first edge
        a0 = math.atan2(t0.y - c.y, t0.x - c.x)
        k = max(4, int(math.ceil(r * turn / step)))
        out += [(c.x + r * math.cos(a0 + turn * j / k), c.y + r * math.sin(a0 + turn * j / k)) for j in range(k + 1)]
    return out

def outward_normals(pts):
    # one offset direction per vertex of a closed anticlockwise line: the mitre of its two edges' outward normals,
    # scaled so that it moves each edge by exactly one unit
    n, out = len(pts), []
    for i in range(n):
        p, v, q = (Vector(pts[(i + k) % n]) for k in (-1, 0, 1))
        e0 = (v - p).normalized(); e1 = (q - v).normalized()
        n0 = Vector((e0.y, -e0.x)); n1 = Vector((e1.y, -e1.x))
        d = 1.0 + n0.dot(n1)
        out.append((n0 + n1) / d if d > 1e-6 else n0)
    return out

# the kerb's profile as (out from the kerb line, height, grime): the pavement's edge, the rolled top edge, the face
# down to its foot on the asphalt; the face itself stands on the kerb line (o = 0). The grime is what the kerb
# material darkens by: the foot, none from 45% up the face. (A gutter pan out to the asphalt was swept too at first,
# in a darker set; it read as a light stripe painted along the kerb -- user 2026-09-25, "decal" -- and went.)
# (out from the kerb line, height, grime): the slabs' edge, the step up onto the kerb's top, the flat top, the rolled
# edge, the face down to the foot on the asphalt, the buried foot. The face stands on the kerb line (o = 0).
KERB_TOP_Z = Z_GROUND + KERB_TOP_PROUD
KERB_PROFILE = [(-(KERB_ROUND + KERB_TOP_W), Z_GROUND, 0.0), (-(KERB_ROUND + KERB_TOP_W), KERB_TOP_Z, 0.0), (-KERB_ROUND, KERB_TOP_Z, 0.0)]
KERB_PROFILE += [(-KERB_ROUND + KERB_ROUND * math.cos(a), KERB_TOP_Z - KERB_ROUND + KERB_ROUND * math.sin(a), 0.0)
                 for a in (math.radians(90.0 - 22.5 * j) for j in range(1, 5))]
KERB_PROFILE += [(0.0, ROAD_Z + (KERB_TOP_Z - ROAD_Z) * 0.45, 0.0), (0.0, ROAD_Z, 0.6), (0.0, ROAD_Z - KERB_BURY, 0.6)]   # the foot, then buried
KERB_ROUND_FIRST, KERB_ROUND_FACES = 2, 4       # the rolled edge's quads (after the step's and the top's), shaded smooth
KERB_V_ROUND_MID = KERB_TOP_PROUD + KERB_TOP_W + KERB_ROUND * math.pi / 4.0    # v of the arris, the round's middle
KERB_V_ROUND_END = KERB_TOP_PROUD + KERB_TOP_W + KERB_ROUND * math.pi / 2.0    # v where the face begins
KERB_H_FACE = KERB_TOP_Z - KERB_ROUND - ROAD_Z + ROAD_GUTTER_DIP               # the face's height, the round's end to the gutter's foot

def _cell_random(q):
    # a number in 0..1 fixed by a Voronoi feature point
    h = (int(round(q[0] * 1000.0)) * 73856093) ^ (int(round(q[1] * 1000.0)) * 19349663)
    return ((h * 2654435761) & 0xFFFFFF) / float(0xFFFFFF)

def _smooth(t):
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)

def road_trenches(lanes):
    # per street, ROAD_TRENCH_N positions along it within the grid, from a fixed seed
    import random
    rng = random.Random(574)
    return [[rng.uniform(-ROAD_GRID_R * 0.8, ROAD_GRID_R * 0.8) for _ in range(ROAD_TRENCH_N)] for _ in lanes]

def road_crossings(lanes):
    # every crossing of a street along x with one along y: its rectangle and its turning movements. Right-hand
    # traffic: on the street along x the south lane runs east and the north lane west, on the street along y the
    # east lane runs north and the west lane south; each of the crossing's four arms brings one lane in, and that
    # lane turns right into the lane leaving on its right and left into the lane leaving on its left. A turn is the
    # fillet arc between the two lane lines: for an incoming direction d1 and an outgoing d2 meeting at P, the arc of
    # radius r has its centre at P - r d1 + r d2 and runs from the tangent point r before P to the one r after it,
    # a quarter circle from direction -d2 to direction d1 about the centre; tangent at both ends, so the wheel paths
    # along it leave the straight wheel paths and rejoin the next street's without a break. (centre, r, d1, d2,
    # strength) per movement.
    xs = [l for l in lanes if l[0] == "y"]; ys = [l for l in lanes if l[0] == "x"]
    out = []
    for _, y0, y1, ny, py in xs:
        for _, x0, x1, nx, px in ys:
            assert ny == 2 and nx == 2, "the crossing's movements are written for a lane each way"
            oy = py + (y1 - y0 - 2.0 * py) / 4.0; ox = px + (x1 - x0 - 2.0 * px) / 4.0   # a lane centre's offset from its kerb
            east, west = y0 + oy, y1 - oy                                                # the lanes along x: their y
            north, south = x1 - ox, x0 + ox                                              # the lanes along y: their x
            moves = []
            def fillet(P, d1, d2, r, strength):
                moves.append(((P[0] - r * d1[0] + r * d2[0], P[1] - r * d1[1] + r * d2[1]), r, d1, d2, strength))
            E, W, N, S = (1.0, 0.0), (-1.0, 0.0), (0.0, 1.0), (0.0, -1.0)
            fillet((south, east), E, S, ROAD_TURN_R_RIGHT, ROAD_TURN_RIGHT); fillet((north, east), E, N, ROAD_TURN_R_LEFT, ROAD_TURN_LEFT)   # from the west arm
            fillet((north, west), W, N, ROAD_TURN_R_RIGHT, ROAD_TURN_RIGHT); fillet((south, west), W, S, ROAD_TURN_R_LEFT, ROAD_TURN_LEFT)   # from the east arm
            fillet((north, east), N, E, ROAD_TURN_R_RIGHT, ROAD_TURN_RIGHT); fillet((north, west), N, W, ROAD_TURN_R_LEFT, ROAD_TURN_LEFT)   # from the south arm
            fillet((south, west), S, W, ROAD_TURN_R_RIGHT, ROAD_TURN_RIGHT); fillet((south, east), S, E, ROAD_TURN_R_LEFT, ROAD_TURN_LEFT)   # from the north arm
            out.append(((x0, x1, y0, y1), moves))
    return out

def _gauss(d, sigma):
    return math.exp(-(d * d) / (2.0 * sigma * sigma))

def _path(d, sigma):
    # a wheel path across: a narrow peak on wide skirts (item 25), two Gaussians of the same sigma scale
    return ROAD_WEAR_PEAK * _gauss(d, sigma * ROAD_WEAR_CORE) + (1.0 - ROAD_WEAR_PEAK) * _gauss(d, sigma * ROAD_WEAR_SKIRT)

def road_wear(x, y, lanes, crossings):
    # the wear field, 0..1: where the tires run. For every travel lane of every street the point lies in, two wheel
    # paths ROAD_TRACK_M apart, each a Gaussian of ROAD_WEAR_SIGMA across (no edge; the two of a lane meet at about
    # a quarter between them, the outer one's tail reaches into the parking strip and dies), their strength and
    # width drifting slowly along the street. At every crossing the paths coming in give way, over the crossing's
    # middle, to one merged zone; and round each of its four curb returns a right turn's two wheel paths run as
    # arcs concentric with the kerb, over the kerb's quadrant and a little past each end, so they run into the
    # straight paths of both streets. The caller fades it with the grid's edge.
    w = 0.0
    for k, (axis, lo_e, hi_e, n_lanes, park) in enumerate(lanes):
        c = y if axis == "y" else x; a = x if axis == "y" else y
        if not (lo_e - 1.0 <= c <= hi_e + 1.0): continue
        lane_w = (hi_e - lo_e - 2.0 * park) / n_lanes
        use = 0.6 + 0.4 * (0.5 + 0.5 * mnoise.noise(Vector((a / ROAD_WEAR_VARY_M, 5.13 + 0.71 * k, 2.2))))
        wid = 1.0 + ROAD_WEAR_WIDTH_VARY * mnoise.noise(Vector((a / ROAD_WEAR_WIDTH_M, 0.37 + 0.71 * k, 1.3)))
        for i in range(n_lanes):
            centre = lo_e + park + lane_w * (i + 0.5)
            lane = sum(_path(c - (centre + sgn * ROAD_TRACK_M / 2.0), ROAD_WEAR_SIGMA * wid) for sgn in (-1.0, 1.0))
            w = max(w, use * min(1.0, lane))                  # a lane's two paths add (their skirts overlap between them)
    for (x0, x1, y0, y1), moves in crossings:
        cx, cy, hx, hy = (x0 + x1) / 2.0, (y0 + y1) / 2.0, (x1 - x0) / 2.0, (y1 - y0) / 2.0
        r = (abs(x - cx) / hx) ** 3.0 + (abs(y - cy) / hy) ** 3.0       # a rounded square: 1 at the kerb lines' rectangle, its corners cut
        r = r ** (1.0 / 3.0)
        if r > 2.2: continue
        merge = 1.0 - _smooth((r - ROAD_MERGE_IN) / (ROAD_MERGE_OUT - ROAD_MERGE_IN))
        w = max(w * (1.0 - ROAD_MERGE_FADE * merge), ROAD_MERGE_STRENGTH * merge)
        for (ccx, ccy), rr, d1, d2, strength in moves:
            qx, qy = x - ccx, y - ccy
            if qx * (-d2[0]) + qy * (-d2[1]) < 0.0 or qx * d1[0] + qy * d1[1] < 0.0: continue   # outside the arc's quarter
            rho = math.hypot(qx, qy)
            if abs(rho - rr) > ROAD_TRACK_M / 2.0 + 3.0 * ROAD_TURN_SIGMA * ROAD_WEAR_SKIRT: continue
            turn = sum(_path(rho - (rr + sgn * ROAD_TRACK_M / 2.0), ROAD_TURN_SIGMA) for sgn in (-1.0, 1.0))
            w = max(w, strength * min(1.0, turn))
    return min(1.0, w) * ROAD_WEAR_GAIN

def _pad_dist(x, y, pads):
    # the distance from a point on the road to the nearest pavement, each pad a rectangle whose corners are rounded
    # to KERB_R (the curb returns), so the distance follows the kerb round every corner; 0 under a pavement
    best = 1e9
    for x0, x1, y0, y1 in pads:
        dx = max(x0 + KERB_R - x, 0.0, x - (x1 - KERB_R)); dy = max(y0 + KERB_R - y, 0.0, y - (y1 - KERB_R))
        d = math.hypot(dx, dy) - KERB_R
        if d < best: best = d
    return max(best, 0.0)

def road_height(x, y, lanes, trenches, crossings, pads):
    # the road's surface at (x, y) as (height about the plane, patch tone, wear): undulation at four scales (Perlin
    # noise, -1..1, each scale on its own offset); repair patches from a Manhattan Voronoi of ROAD_PATCH_M cells --
    # the darker fifth of cells sunk, the palest fifth proud, the step softening toward the cell's edge -- whose
    # tone the material reads back as the `ptone` attribute so colour and step coincide; a parabolic crown across
    # every street band the point lies in (the highest wins at a crossing); a rut as deep as the wear (road_wear,
    # handed to the material as the `wear` attribute); a dip toward each kerb; settled trenches across the street;
    # all faded to nothing over ROAD_GRID_FADE inside the grid's edge
    dk = _pad_dist(x, y, pads)
    pin = _smooth(dk / ROAD_PIN_M)                       # the gutter line is a fixed grade: the waves die at the kerb
    z = 0.0
    for k, (wl, amp) in enumerate(ROAD_UNDULATE):
        z += amp * mnoise.noise(Vector((x / wl + 7.3 * k, y / wl + 3.1 * k, 0.5 * k)))
    z *= pin
    d, pts = mnoise.voronoi(Vector((x / ROAD_PATCH_M, y / ROAD_PATCH_M, 0.0)), distance_metric='MANHATTAN')
    r = _cell_random(pts[0]); edge = _smooth((d[1] - d[0]) * ROAD_PATCH_M / ROAD_PATCH_EDGE)
    soft = 0.6 + 0.4 * (0.5 + 0.5 * mnoise.noise(Vector((x / 2.5 + 31.0, y / 2.5 + 17.0, 0.7))))
    if r < 0.22:
        t = r / 0.22; tone = ROAD_PATCH_DARK + (1.0 - ROAD_PATCH_DARK) * t
        step = -(ROAD_PATCH_SUNK[0] + (ROAD_PATCH_SUNK[1] - ROAD_PATCH_SUNK[0]) * (1.0 - t))
    elif r > 0.80:
        t = (r - 0.80) / 0.20; tone = 1.0 + (ROAD_PATCH_LIGHT - 1.0) * t
        step = ROAD_PATCH_PROUD[0] + (ROAD_PATCH_PROUD[1] - ROAD_PATCH_PROUD[0]) * t
    else:
        tone, step = 1.0, 0.0
    tone = 1.0 + (tone - 1.0) * soft; step *= edge
    e = max(abs(x), abs(y)); fade = min(1.0, max(0.0, (ROAD_GRID_R - e) / ROAD_GRID_FADE))
    wear = road_wear(x, y, lanes, crossings) * _smooth((ROAD_GRID_R - e) / ROAD_WEAR_FADE_M)   # the wear fades out wider than the geometry
    crowns, trench, ttone = [], 0.0, 1.0
    dip = ROAD_GUTTER_DIP * (1.0 - _smooth(dk / ROAD_GUTTER_M))     # into the gutter, round the curb returns too
    for k, (axis, lo_e, hi_e, n_lanes, park) in enumerate(lanes):
        c = y if axis == "y" else x; a = x if axis == "y" else y
        if not (lo_e <= c <= hi_e): continue
        half = (hi_e - lo_e) / 2.0; t = (c - (lo_e + half)) / half
        crowns.append(ROAD_CROWN * half * (1.0 - t * t))
        for tp in trenches[k]:
            dt = abs(a - tp) - ROAD_TRENCH_W / 2.0
            if dt < 0.25:
                f = _smooth((0.25 - dt) / 0.35) if dt > -0.1 else 1.0
                trench = max(trench, ROAD_TRENCH_DEPTH * f); ttone = min(ttone, 1.0 + (ROAD_TRENCH_TONE - 1.0) * f)
    # one crown, or at a crossing the two combined by a softmax: max where they differ, their mean where they meet,
    # so the crease a plain max would leave along the crossing's diagonals is a smooth valley -- the bellies
    crown = 0.0
    if crowns:
        m = max(crowns); ws = [math.exp((c - m) / ROAD_CROWN_SMOOTH) for c in crowns]
        crown = sum(c * w for c, w in zip(crowns, ws)) / sum(ws)
    z += crown + step - ROAD_RUT * wear - dip - trench
    return ROAD_Z + z * fade, 1.0 + (tone * ttone - 1.0) * fade, wear

def road_mesh(mat, lanes, pads):
    # the road: a grid of ROAD_GRID_M cells over the square of half extent ROAD_GRID_R, every vertex at road_height,
    # shaded smooth, its patch tone and its wear in the `ptone` and `wear` attributes, and four flat quads round it
    # out to GND_FAR (their edges lie on the plane the grid's border returns to, so nothing opens between them; no
    # wear, none reaches them)
    trenches = road_trenches(lanes); crossings = road_crossings(lanes)
    n = int(round(2.0 * ROAD_GRID_R / ROAD_GRID_M)); step = 2.0 * ROAD_GRID_R / n
    verts, tones, wears = [], [], []
    for j in range(n + 1):
        for i in range(n + 1):
            x, y = -ROAD_GRID_R + i * step, -ROAD_GRID_R + j * step
            z, tone, wear = road_height(x, y, lanes, trenches, crossings, pads); verts.append((x, y, z)); tones.append(tone); wears.append(wear)
    faces = [(j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i) for j in range(n) for i in range(n)]
    ground_mesh("scn_road", verts, faces, mat, FLAT, attrs={"ptone": tones, "wear": wears}, smooth=range(len(faces)))
    R, G = ROAD_GRID_R, GND_FAR
    ring = [rect(-G, G, -G, -R), rect(-G, G, R, G), rect(-G, -R, -R, R), rect(R, G, -R, R)]
    ground_mesh("scn_road_far", [(q[0], q[1], ROAD_Z) for r in ring for q in r], [tuple(range(4 * k, 4 * k + 4)) for k in range(4)],
                mat, FLAT, attrs={"ptone": [1.0] * 16, "wear": [0.0] * 16})
    zs = [v[2] for v in verts]
    print(f"the road: a {n}x{n} grid of {step:.2f} m cells over {2 * R:.0f} m, its surface from {min(zs) - ROAD_Z:+.3f} to "
          f"{max(zs) - ROAD_Z:+.3f} m about the plane, {sum(1 for t in tones if t < 0.999)} vertices on sunk or trenched "
          f"patches and {sum(1 for t in tones if t > 1.001)} on proud ones, {sum(1 for w in wears if w > 0.3)} worn past 0.3 "
          f"({len(crossings)} crossings); the flat field beyond to {G:.0f} m")

def kerbed_pavement(pname, kname, poly, mats, lot=None):
    # a pavement filling an anticlockwise polygon whose corners are curb returns, and its kerb: the profile swept
    # round the kerb line, closed. With lot = (material, strip width) the pavement is a sidewalk strip that wide
    # inside the kerb, and the interior it rings is the lot's (item 2: the far blocks are vacant lots)
    m_pave, m_kerb = mats
    K = fillet(poly, KERB_R, ARC_STEP); N = outward_normals(K); n, m = len(K), len(KERB_PROFILE)
    inset = KERB_ROUND + KERB_TOP_W                                   # the slabs end where the kerb's top begins
    top = [(K[i][0] - N[i].x * inset, K[i][1] - N[i].y * inset, Z_GROUND) for i in range(n)]
    if lot is None:
        pav = ground_mesh(pname, top, [tuple(range(n))], m_pave, FLAT)      # its edge is where the rolled edge begins
    else:
        m_lot, strip = lot
        assert inset + strip < KERB_R, "the strip's inner edge would cross itself round the curb returns"
        inner = [(K[i][0] - N[i].x * (inset + strip), K[i][1] - N[i].y * (inset + strip), Z_GROUND) for i in range(n)]
        ring = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]   # the strip, quad by quad, facing up
        pav = ground_mesh(pname, top + inner, ring + [tuple(range(n, 2 * n))], [m_pave, m_lot], FLAT, slots=[0] * n + [1])
    # the piece's kerb rectangle, for the slab joints pavement_material lays from it (item 4): the corner squares and
    # the strips are read off these two properties
    pav["pad_lo"] = (float(min(q[0] for q in poly)), float(min(q[1] for q in poly)), 0.0)
    pav["pad_hi"] = (float(max(q[0] for q in poly)), float(max(q[1] for q in poly)), 0.0)
    verts, uvw, grime, faces, smooth, s = [], [], [], [], [], 0.0
    for i in range(n):
        if i: s += (Vector(K[i]) - Vector(K[i - 1])).length
        t = 0.0
        for j, (o, z, g) in enumerate(KERB_PROFILE):
            if j: t += math.hypot(o - KERB_PROFILE[j - 1][0], z - KERB_PROFILE[j - 1][1])
            verts.append((K[i][0] + N[i].x * o, K[i][1] + N[i].y * o, z)); uvw.append((s, t)); grime.append(g)
    for i in range(n):
        a, b = i * m, ((i + 1) % n) * m
        for j in range(m - 1):
            if KERB_ROUND_FIRST <= j < KERB_ROUND_FIRST + KERB_ROUND_FACES: smooth.append(len(faces))
            faces.append((a + j, a + j + 1, b + j + 1, b + j))
    return ground_mesh(kname, verts, faces, m_kerb, uvw, attrs={"grime": grime}, smooth=smooth)

n_gnd = 0
if GROUND == "street":
    PAVE = offset_poly(HULL, PAVE_W)
    WX, EX = min(q[0] for q in PAVE), max(q[0] for q in PAVE)          # the block's kerb lines
    SY, NY = min(q[1] for q in PAVE), max(q[1] for q in PAVE)
    X0, X1 = WX - ST_W_NS, EX + ST_W_NS                                 # the streets' far kerbs, all four sides
    Y0, Y1 = SY - ST_W_EW, NY + ST_W_EW
    # the streets' lane bands for the tire wear and the road's surface: along x (lanes read off y) south and north
    # of the block, along y (read off x) east and west; each with its two kerb lines, how many travel lanes its
    # width holds and the parking strip along each kerb -- a lane each way between parking strips on all four
    LANES = (("y", Y0, SY, 2, ROAD_PARK_M), ("y", NY, Y1, 2, ROAD_PARK_M),   # 3rd Street and its northern twin
             ("x", EX, X1, 2, ROAD_PARK_M), ("x", X0, WX, 2, ROAD_PARK_M))   # Broadway and its western twin
    M_ROAD = road_material("GND_asphalt")
    # the sidewalk: poured concrete scored into slabs, with its joints, its per-slab tones and the wall-base grime
    # (item 4); until then it was ground_material's plain tiling of the paver set with a 14 m mottle
    M_PAVE = pavement_material("GND_pavement")
    # the kerb: a concrete curb in the pavement's own light set (its face stands lighter than the asphalt as the
    # photo's does), poured in segments with joints, its foot grimed where the mesh's attribute reads
    M_KERB = kerb_material("GND_kerb")
    # the vacant lots' ground (item 2), and every ground material hazed toward the horizon (scn_haze, the sky section)
    M_LOT = lot_material("GND_lot")
    for mm in (M_ROAD, M_PAVE, M_KERB, M_LOT): hazed(mm)
    MATS = (M_PAVE, M_KERB)
    # every pavement as a rectangle (its corners round to KERB_R in _pad_dist): the block's and the eight far blocks'
    F = GND_FAR
    PADS = [(WX, EX, SY, NY), (WX, EX, -F, Y0), (WX, EX, Y1, F), (X1, F, SY, NY), (-F, X0, SY, NY),
            (X1, F, -F, Y0), (X1, F, Y1, F), (-F, X0, Y1, F), (-F, X0, -F, Y0)]
    road_mesh(M_ROAD, LANES, PADS)
    # The block's pavement is its kerb lines' rectangle, not the chamfered outline: at the chamfer the kerb sweeps
    # round in one arc tangent to both streets, so the pavement is widest there (5.9 m against PAVE_W), as the
    # reference has it; the arc still covers the chamfer's own corners with room to spare.
    kerbed_pavement("scn_pavement", "scn_kerb", rect(WX, EX, SY, NY), MATS)
    # Beyond the streets, eight blocks -- one across from each face, one in each diagonal quadrant -- with both
    # streets running on between them to GND_FAR, so every corner that faces a crossing is a curb return; each a
    # vacant lot behind a sidewalk strip of the pavement's own width (item 2)
    far = {"s": rect(WX, EX, -F, Y0), "n": rect(WX, EX, Y1, F), "e": rect(X1, F, SY, NY), "w": rect(-F, X0, SY, NY),
           "se": rect(X1, F, -F, Y0), "ne": rect(X1, F, Y1, F), "nw": rect(-F, X0, Y1, F), "sw": rect(-F, X0, -F, Y0)}
    for nm, poly in far.items(): kerbed_pavement("scn_pavement_far_" + nm, "scn_kerb_far_" + nm, poly, MATS, lot=(M_LOT, PAVE_W))
    n_gnd = len(gnd.objects)
    print(f"the ground: a pavement {PAVE_W:.2f} m wide on a {PAVE_H * 100:.0f} cm kerb with a {KERB_ROUND * 100:.0f} cm "
          f"rolled edge, its corners curb returns of {KERB_R:.1f} m, roadways of {ST_W_EW:.1f} m (east-west) and {ST_W_NS:.1f} m (north-south), "
          f"and eight vacant lots beyond them, each behind a {PAVE_W:.2f} m sidewalk strip, lots and streets running to "
          f"{GND_FAR:.0f} m ({n_gnd} objects, every ground material hazed from {HAZE_NEAR:.0f} to {HAZE_FAR:.0f} m); the streets' "
          f"far kerbs at x {X0:.2f} / {X1:.2f}, y {Y0:.2f} / {Y1:.2f}")
if GROUND != "none":
    # Cycles renders a shadow catcher as whatever lies behind it, but still darkened by everything the block hides --
    # the sun and the sky both -- so the map's own road takes the block's shadow. In street mode it lies just under the
    # roadway, covered entirely now that the ground runs to GND_FAR (it showed past 150 m until item 2); in catch mode
    # it stands at the block's own pavement level and is the only ground there is.
    z = ROAD_Z - 0.12 if GROUND == "street" else Z_GROUND      # under the road's deepest dip (item 19)
    cm = bpy.data.materials.new("GND_catcher"); cm.use_nodes = True
    cat = ground_mesh("scn_shadow_catcher", [(q[0], q[1], z) for q in rect(-CATCH_R, CATCH_R, -CATCH_R, CATCH_R)],
                      [(0, 1, 2, 3)], cm, FLAT)
    cat.is_shadow_catcher = True
    print(f"a shadow catcher at z {z:.3f} out to {CATCH_R:.0f} m: "
          + ("under the roadway, covered by the ground out to its edge" if GROUND == "street"
             else "the block's own ground level, with the map's road showing through it"))

# ---------------------------------------------------------------- the near context: walls, hedges and the game's trees
# What stands 90 to 170 m behind the block on both sides (AI 574 item 28), as geometry: under this sun a card reads
# flat and its shadow is a sliver. The photo, unprojected through the reference stand (the review's
# scripts/context_frame.py, the numbers in item28_near_context/item28_numbers.md): on the Broadway side a grey
# concrete wall about 2 m tall with a chain-link fence along its top, whose base lands on the N lot's interior edge
# (the sidewalk strip's inner line) to within a hundredth of the frame -- the photo's wall spans frame y 0.564-0.608,
# a 2 m wall on that line 0.562-0.601 -- a hedge in front of it, three tree crowns behind it with their tops at frame
# y 0.41-0.42 (8.5-9.5 m trees at 98-118 m) and a shaded tan warehouse wall 6 m tall further back (top 0.44, base
# 0.52); on the 3rd Street side a low wall with dry tufts along it, a sunlit cream wall 2.4 m tall behind it and
# trees 12-14 m tall whose tops reach the horizon line (0.32-0.34). The left side cannot land where the photo has it:
# the photo's Bradbury has its vacant lot right against the block's west end, so its low wall and tufts (frame y
# 0.57-0.64) unproject onto the block's OWN south pavement and 3rd Street's road here (x -25 to -38, y -20 to -24,
# 82-94 m), and the scene's 13 m west street and its strip put the nearest lot edge 113 m off, 0.05 of the frame
# higher: the low wall rings the W lot on its interior edge, as a lot's boundary wall would (base 0.554, top 0.528
# at the frame's left edge), and the cream wall is a walled yard's 3.5 m east face 2 m behind it, rising from the
# low wall's top line to 0.49 as the photo's cream wall rises from its dark wall's top (0.55) to 0.495; the trees
# stand behind the yard, their feet hidden by it as the photo's are. Below the low wall the frame shows the west
# street and the block's own pavement in the block's shadow, dark where the photo's shaded wall is dark. Every wall
# keeps the street grid, and the sun (+40, 42.9 up) lights it as it does the block: the N lot's south faces are in
# shade, as the photo's grey and tan walls read, the W lot's east faces in sun, as the photo's cream wall reads; the
# low wall's east face is sunlit here where the photo's south-facing one is shaded, so it is a dark plaster. Nothing
# here shadows the block or a road: every shadow runs to the west-south-west at 1.08 times the height, everything
# stands north or west of the streets, and the hedge keeps HEDGE_OFF inside its kerb so its shadow ends on the kerb.
# THE TREES are the game's own (assets/trees/Models/Desktop/SM_H_Tree_1..15 with the Realistic9 leaf and trunk
# textures), imported once by build_context.py into context_library.blend beside the scene -- metres, z up, the
# trunk's foot on z 0, the leaf cut-out in the material's alpha with a share of translucency, the tree's measured
# height on the mesh. This script LINKS those objects (as it links the block; the prototypes sit on a hidden shelf
# collection) and places instances from TREES: each a local object sharing the linked mesh, carrying the scene's own
# hazed copies of the library's leaf and trunk materials as object-level slots, since a linked material cannot be
# edited. The hedge is the same trees, the ones whose crowns reach the ground, scaled to a bush and stood every
# metre along the kerb. The fence's lattice is one card with a procedural diamond mesh in its alpha: a 6 cm diamond
# of 2.7 mm wire is far under a pixel from 90 m and reads as a 12% grey veil, as the photo's does; its posts and rail
# are geometry. The tufts are blades: thin triangles leaning out of a root, in one mesh, dry straw.
CONTEXT = args.get("context", "on").lower()     # on | off: the near context stands only on the street ground (it needs the lots)
assert CONTEXT in ("on", "off"), f"context: on | off, not {CONTEXT}"
CTX_LIBRARY = os.path.join(ART, "context_library.blend")   # the game's trees as build_context.py imports them; rebuild it with
                                                #   blender -b -P build_context.py --   (metres, z up, the trunk's foot on z 0)
LOT_IN = KERB_ROUND + KERB_TOP_W + PAVE_W        # a lot's interior begins this far inside its kerb line: the kerb's top, then the strip
LOT_W_DEPTH = 75.0                              # the W lot's walled depth westward from its interior edge ...
LOT_N_DEPTH = 40.0                              # ... and the N lot's northward
LOW_WALL_H, LOW_WALL_T = 1.2, 0.25              # the W lot's low wall, ringing its interior edge (the photo's, about 1.2 m)
RET_WALL_H, RET_WALL_T = 2.0, 0.30              # the N lot's retaining wall along its south edge and up its east edge (the photo's, about
                                                # 2 m: its top lands at frame y 0.562 against the photo's 0.564, its base 0.601 against 0.608)
FENCE_H = 1.8                                   # the chain-link fence on the retaining wall's top (its top at 0.527; the photo's about 0.53)
FENCE_POST_M, FENCE_POST_R = 3.0, 0.03          # a post every so far, and the posts' and the rail's radius
FENCE_PITCH, FENCE_WIRE = 0.06, 0.0027          # the lattice: diamonds of this pitch (the wires of a family 4.2 cm apart) in wire this wide
CREAM_YARD = (-72.0, -60.0, -17.2, -2.2)        # a walled yard on the W lot (x0, x1, y0, y1), 2 m behind the low wall: its sunlit east face
                                                # is the photo's cream wall, standing over the low wall's top as the photo's stands over its
                                                # dark wall (the photo's cream band spans frame y 0.495-0.55 at x 0-0.03, 3.5 m at 112 m)
CREAM_WALL_H, CREAM_WALL_T = 3.5, 0.30
SHED_N = (-30.0, -9.0, 68.0, 80.0, 6.0)         # the tan warehouse on the N lot (x0, x1, y0, y1, height): its shaded south face at the frame's
                                                # right edge, its top at 0.44 and base 0.524 against the photo's 0.44 / 0.52
HEDGE_OFF = 2.1                                 # the hedge's centre line this far inside the N lot's kerb: a parkway planting between the kerb
                                                # and the sidewalk. At the wall's foot it hid the wall's face the photo shows (the photo's
                                                # hedge stands on nearer, lower ground); here the shadow of its 1.4 m of crown, 1.5 m long,
                                                # ends on the kerb's top (the crown's south edge stands 1.0 m inside the kerb line)
HEDGE_STEP, HEDGE_H = (0.5, 0.7), (1.3, 1.7)    # a bush every so far along it, so tall: the crowns are airy, so they stand closer than their
                                                # radius and overlap into one mass (at 0.6-0.85 m and 1.1-1.4 m they read as a row of saplings)
HEDGE_SINK = 0.30                               # a bush goes this far under the ground: the bare stem of a scaled tree is buried, the crown sits
                                                # on the ground as a hedge does
HEDGE_MODELS = (4, 1, 3)                        # the library trees the bushes are: crowns that reach the ground, scaled to a bush
TUFT_STEP, TUFT_P = 0.35, 0.55                  # dry tufts along the low wall's foot on both sides: a place every so far, this share taken
TUFT_OFF = (0.12, 0.55)                         # ... this far out from the wall's face
TUFT_BLADES, TUFT_LEN, TUFT_LEAN = (14, 22), (0.25, 0.50), (15.0, 45.0)   # blades per tuft; a blade's length; its lean from vertical, degrees
TUFT_W = 0.015                                  # a blade's width at the root
TUFT_COLOUR = (0.32, 0.23, 0.12)                # dry straw, linear (the photo's tufts read sRGB (135, 111, 86) in sun) ...
TUFT_VARY = 0.20                                # ... every blade straying this much either way
TREE_SINK = 0.05                                # a tree's foot goes this far under the ground, as the game plants them (TreeGenerator's sink)
LEAF_TINT = (0.50, 0.42, 0.42)                  # the library's leaf colour multiplied, linear: the game's TGA rendered here sunlit at sRGB
                                                # (163, 172, 111) against the photo's crowns (110, 104, 63), a yellower green half again as
                                                # bright; the tint lands the sunlit foliage at about (118, 115, 73)
CTX_SEED = 28                                   # the hedge's and the tufts' random numbers
# The walls' sets: the game's PBR folders, chosen by what a face renders as here, measured on the first pass: a
# south face in shade renders at (0.28, 0.20, 0.16) of its albedo times its AO in linear light (the sky and the warm
# bounce off the sunlit strip), a sunlit east face at about 1.6; the photo's grey wall face reads (135, 120, 108)
# in shade, its tan warehouse (130, 115, 90) in shade, its cream wall (223-245, 208-235, 193-220) in sun, its low
# wall (64-91, 63-89, 68-92), a shaded face. (folder, tint): the tint multiplies the set's colour, over 1 a lift
WALL_SETS = {"ret": ("plastered_wall_02", (1.45, 1.6, 1.8)),    # a pale concrete, lifted toward white and cooled: rough_concrete rendered
                                                                # (92, 75, 56), too dark and brown, the plaster lifted evenly by 1.5
                                                                # (132, 104, 90), pink under the strip's warm bounce; this lands (130, 109, 101)
             "low": ("plastered_wall_05", (0.6, 0.55, 0.5)),    # dark plaster, darker still: a sunlit east face here takes about 4.3 times
                                                                # its albedo, and the set alone rendered (140, 142, 144); the photo's wall
                                                                # reads (64-91) because it faces south into the shade
             "cream": ("plastered_wall_02", None),              # rendered (218, 214, 209) in sun
             "tan": ("plastered_wall_02", (1.15, 0.95, 0.65)),  # predicted (128, 113, 85) in shade
             "roof": ("corrugated_iron_02", None)}              # the warehouse's roof
# The trees: (x, y, library tree 1-15, height m, turn degrees). The reference stand sees the W lot through the wedge
# left of the block's west end (azimuth 166.7 to 169.4 from the eye: at x -92 that is y -11.4 to -4.2, at x -118
# y -6.5 to 2.0) and the N lot through the wedge right of its east end (121 to 123.5: at y 44 x -1.2 to 3.8, at y 60
# x -11.2 to -5.2); the rest stand for the other cameras. Heights from the photo: the left crowns' tops reach frame
# y 0.33-0.34 (13-14 m at 130-155 m), the right three 0.41-0.42 (8.5-9.5 m at 98-118 m).
TREES = [
    # the W lot, behind the cream yard, in the wedge (the game's crowns are airy: two or three overlap where the
    # photo has one solid mass). The photo's crowns are tallest right behind the block's west end (one crown's top
    # at frame y 0.33 at x 0.04-0.055, narrow) and lower toward the frame's edge (0.385-0.405 at x 0.01-0.03, 0.40
    # at x 0-0.02), with the white and brick buildings of item 29 showing over them (y 0.355-0.41). Item 28 stood
    # four 13-14 m trees at x 0.033-0.038 and 10-11 m ones at x 0-0.033; their crowns, 4-7 m across at 130-175 m,
    # spread over the whole wedge from y 0.33 down and hid every building behind them, so item 29 re-graded them to
    # the photo's own rows: 7.5-9 m where the stand sees x 0-0.035 (tops 0.39-0.40 at 130-150 m), and the two tall
    # ones (narrow-crowned models 2 and 7) with their trunks at x 0.067, behind the block's edge, so only the west
    # half of each crown shows, at x 0.035-0.055, its top at 0.323-0.33
    (-77.0, -11.0, 9, 8.5, 65.0), (-83.0, -14.0, 3, 7.5, 200.0), (-86.0, -9.0, 6, 8.5, 140.0), (-92.0, -3.0, 2, 13.5, 310.0),
    (-97.0, -11.0, 2, 7.5, 95.0), (-100.0, -5.5, 1, 9.0, 20.0), (-104.0, -4.0, 12, 9.0, 250.0), (-111.0, -8.0, 7, 8.0, 30.0),
    (-113.0, -2.5, 9, 9.0, 190.0), (-116.0, 2.8, 7, 14.0, 110.0), (-125.0, -5.0, 3, 7.5, 260.0),
    # the W lot further north, behind the block from the reference stand
    (-63.0, 6.0, 6, 11.0, 20.0), (-72.0, 4.0, 5, 12.0, 0.0), (-84.0, 10.0, 6, 11.0, 300.0), (-96.0, 8.0, 15, 13.0, 180.0),
    (-108.0, 14.0, 1, 12.0, 75.0),
    # the N lot: the crowns the frame sees right of the block's east end (three in the photo, more here to close the
    # gaps between the game's airy crowns), and company
    (2.0, 44.0, 6, 9.0, 40.0), (-4.0, 52.0, 1, 9.5, 160.0), (-10.0, 60.0, 9, 8.5, 280.0), (1.5, 48.0, 10, 9.5, 300.0),
    (-7.0, 56.0, 6, 9.0, 80.0), (-1.0, 42.5, 3, 8.0, 210.0), (3.5, 46.0, 2, 9.0, 150.0), (0.0, 50.0, 9, 8.5, 20.0),
    (10.0, 46.5, 3, 8.0, 100.0), (-18.0, 48.0, 10, 10.0, 220.0), (-28.0, 44.0, 2, 9.0, 10.0), (14.0, 58.0, 13, 9.0, 130.0),
    (-22.0, 58.0, 5, 10.0, 330.0),
]

ctx = bpy.data.collections.new("CONTEXT"); S.collection.children.link(ctx)
n_ctx = {}
if CONTEXT == "on" and GROUND != "street":
    print("the near context stands on the street ground only: none built")
elif CONTEXT == "on":
    assert os.path.isfile(CTX_LIBRARY), f"no context library at {CTX_LIBRARY}: run  blender -b -P build_context.py --  first"
    import random
    rng = random.Random(CTX_SEED)
    # ---- the library: its objects linked onto a hidden shelf, their meshes shared by every placement, its two
    # materials copied local and hazed
    with bpy.data.libraries.load(CTX_LIBRARY, link=True, relative=True) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith(("ctx_tree_", "ctx_prop_"))]
    shelf = bpy.data.collections.new("CONTEXT_LIBRARY"); ctx.children.link(shelf)
    shelf.hide_render = True; shelf.hide_viewport = True
    LIB, PROPS = {}, {}                          # the trees by number; the props (item 8) by asset name, both meshes
    for o in dst.objects:
        if o is None: continue
        shelf.objects.link(o)
        if o.name.startswith("ctx_tree_"): LIB[int(o.name.rsplit("_", 1)[1])] = o.data
        else: PROPS[o.name[len("ctx_prop_"):]] = o.data
    assert len(LIB) == 15, f"the context library holds {len(LIB)} trees, not 15: rebuild it with build_context.py"
    lib_mats = {m.name: m for m in bpy.data.materials if m.library is not None and m.name in ("ctx_leaf", "ctx_trunk")}
    assert set(lib_mats) == {"ctx_leaf", "ctx_trunk"}, f"the library's materials: {sorted(lib_mats)}"
    M_TREE = {}
    for nm, m in lib_mats.items():
        # the leaf is hazed inside its cut-out (LEAF_CUTOUT's leaf input), never its transparent branch (item 29)
        c = m.copy(); c.name = "CTX_" + nm[4:]; M_TREE[nm] = hazed(c, at=("LEAF_CUTOUT", 2) if nm == "ctx_leaf" else None)
    tint = M_TREE["ctx_leaf"].node_tree.nodes.get("LEAF_TINT")
    assert tint is not None, "the library's leaf material has no LEAF_TINT node: rebuild it with build_context.py"
    next(i for i in tint.inputs if i.identifier == "B_Color").default_value = (*LEAF_TINT, 1.0)
    def place_tree(name, x, y, model, height, turn, sink=TREE_SINK, mats=None):
        # mats: the object-level materials by library name, the scene's hazed copies unless another set is given
        # (the far tree lines carry a darker leaf, item 29)
        me = LIB[model]; s = height / me["height"]
        ob = bpy.data.objects.new(name, me); ctx.objects.link(ob)
        ob.location = (x, y, Z_GROUND - sink); ob.scale = (s, s, s); ob.rotation_euler = (0.0, 0.0, math.radians(turn))
        for slot, lm in zip(ob.material_slots, me.materials):
            slot.link = 'OBJECT'; slot.material = (mats or M_TREE)[lm.name]
        return ob
    # ---- the materials
    M_WALL = {k: hazed(ground_material("CTX_" + k, folder, tint=tint)) for k, (folder, tint) in WALL_SETS.items()}
    def metal_material(name, grey, metallic, rough):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
        b = nt.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (grey, grey, grey, 1.0)
        b.inputs["Metallic"].default_value = metallic; b.inputs["Roughness"].default_value = rough
        return m
    M_POST = hazed(metal_material("CTX_fence_post", 0.25, 0.8, 0.5))
    def fence_material(name):
        # galvanised wire where the UV (u along the run, v up, metres) lies within half a wire of either diagonal
        # family of the diamond mesh, clear elsewhere: PINGPONG of (u +- v) / pitch is the distance to the nearest
        # line of a family in pitches, and a wire of FENCE_WIRE across a diagonal is FENCE_WIRE / sqrt 2 of the pitch
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (900, 0)
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.location = (-1100, 0)
        xyz = nt.nodes.new('ShaderNodeSeparateXYZ'); xyz.location = (-900, 0); nt.links.new(uv.outputs["UV"], xyz.inputs["Vector"])
        def fm(op, a, b, x, y):
            n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.location = (x, y)
            for i, v in ((0, a), (1, b)):
                if hasattr(v, "is_output"): nt.links.new(v, n.inputs[i])
                else: n.inputs[i].default_value = v
            return n.outputs["Value"]
        u, v = xyz.outputs["X"], xyz.outputs["Y"]
        wire = None
        for k, sgn in enumerate((1.0, -1.0)):
            d = fm('DIVIDE', fm('ADD', u, fm('MULTIPLY', v, sgn, -700, -200 * k), -550, -200 * k), FENCE_PITCH, -400, -200 * k)
            w = fm('LESS_THAN', fm('PINGPONG', d, 0.5, -250, -200 * k), FENCE_WIRE / math.sqrt(2.0) / FENCE_PITCH, -100, -200 * k)
            wire = w if wire is None else fm('MAXIMUM', wire, w, 50, -100)
        metal = nt.nodes.new('ShaderNodeBsdfPrincipled'); metal.location = (250, 150)
        metal.inputs["Base Color"].default_value = (0.55, 0.55, 0.55, 1.0); metal.inputs["Metallic"].default_value = 0.9; metal.inputs["Roughness"].default_value = 0.45
        clear = nt.nodes.new('ShaderNodeBsdfTransparent'); clear.location = (250, -100)
        mix = nt.nodes.new('ShaderNodeMixShader'); mix.location = (600, 0); mix.name = mix.label = "FENCE_WIRE"
        nt.links.new(wire, mix.inputs["Fac"]); nt.links.new(clear.outputs["BSDF"], mix.inputs[1]); nt.links.new(metal.outputs["BSDF"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
        return m
    M_FENCE = hazed(fence_material("CTX_fence_lattice"), at=("FENCE_WIRE", 2))   # the wire hazed, the clear diamonds left clear
    def tuft_material(name):
        # dry straw, each blade's own tone from the mesh, a share of translucency (backlit grass glows)
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = "tone"; at.location = (-400, 0)
        col = nt.nodes.new('ShaderNodeVectorMath'); col.operation = 'SCALE'; col.location = (-200, 0)
        col.inputs[0].default_value = TUFT_COLOUR; nt.links.new(at.outputs["Fac"], col.inputs["Scale"])
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (0, 100); bsdf.inputs["Roughness"].default_value = 0.8
        tr = nt.nodes.new('ShaderNodeBsdfTranslucent'); tr.location = (0, -150)
        nt.links.new(col.outputs["Vector"], bsdf.inputs["Base Color"]); nt.links.new(col.outputs["Vector"], tr.inputs["Color"])
        mix = nt.nodes.new('ShaderNodeMixShader'); mix.location = (300, 0); mix.inputs["Fac"].default_value = 0.35
        nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1]); nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
        return m
    M_TUFT = hazed(tuft_material("CTX_tufts"))
    # ---- the geometry
    def box(x0, x1, y0, y1, z0, z1):
        # a closed box facing outward, every face its own four vertices so each carries UVs in metres: u along the
        # face and v up on the sides, x and y on the top and the bottom
        V, F, U = [], [], []
        def quad(pts, uvs):
            k = len(V); V.extend(pts); U.extend(uvs); F.append((k, k + 1, k + 2, k + 3))
        quad([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], [(y0, z0), (y1, z0), (y1, z1), (y0, z1)])        # +x
        quad([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], [(-y1, z0), (-y0, z0), (-y0, z1), (-y1, z1)])    # -x
        quad([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], [(-x1, z0), (-x0, z0), (-x0, z1), (-x1, z1)])    # +y
        quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], [(x0, z0), (x1, z0), (x1, z1), (x0, z1)])        # -y
        quad([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])        # top
        quad([(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)], [(x0, y1), (x1, y1), (x1, y0), (x0, y0)])        # bottom
        return V, F, U
    def prism(cx, cy, z0, z1, r, n=6):
        # a post: an n-sided column, its sides quads, capped
        ring0 = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
        ring1 = [(p[0], p[1], z1) for p in ring0]
        V = ring0 + ring1; F = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        F.append(tuple(range(n, 2 * n))); F.append(tuple(reversed(range(n))))
        return V, F, [(0.0, 0.0)] * len(V)
    def mesh_of(name, parts, mats, slots=None):
        # one mesh from a list of (verts, faces, uvs) parts; slots, if given, one material index per part
        V, F, U, SL = [], [], [], []
        for j, (v, f, u) in enumerate(parts):
            k = len(V); V.extend(v); U.extend(u); F.extend([tuple(i + k for i in face) for face in f])
            SL.extend([slots[j] if slots else 0] * len(f))
        return ground_mesh(name, V, F, mats, U, slots=SL if slots else None, col=ctx)
    z_foot = Z_GROUND - 0.05                                          # every wall's foot, a little under the ground
    def ring(x0, x1, y0, y1, t, h):
        # four walls of thickness t on the inside of a rectangle: the south and north run the full width, the east
        # and west fill between them (no two faces coincide)
        z1 = Z_GROUND + h
        return [box(x1 - t, x1, y0 + t, y1 - t, z_foot, z1), box(x0, x1, y0, y0 + t, z_foot, z1),
                box(x0, x1, y1 - t, y1, z_foot, z1), box(x0, x0 + t, y0 + t, y1 - t, z_foot, z1)]
    # the lots' interior edges: a lot's kerb is the street's far kerb, its interior begins LOT_IN inside it
    W_E, W_S, W_N = X0 - LOT_IN, SY + LOT_IN, NY - LOT_IN            # the W lot's east, south and north edges
    N_S, N_E, N_W = Y1 + LOT_IN, EX - LOT_IN, WX + LOT_IN            # the N lot's south, east and west edges
    # the W lot: the low wall ringing it, the cream yard inside it, the tufts along the wall's foot
    mesh_of("ctx_wall_low", ring(W_E - LOT_W_DEPTH, W_E, W_S, W_N, LOW_WALL_T, LOW_WALL_H), M_WALL["low"])
    mesh_of("ctx_wall_cream", ring(*CREAM_YARD, CREAM_WALL_T, CREAM_WALL_H), M_WALL["cream"])
    V, F, tones = [], [], []
    for a, b, nrm in (((W_E, W_S), (W_E, W_N), (1.0, 0.0)), ((W_E - LOW_WALL_T, W_S), (W_E - LOW_WALL_T, W_N), (-1.0, 0.0)),
                      ((W_E - LOT_W_DEPTH, W_S), (W_E, W_S), (0.0, -1.0)), ((W_E - LOT_W_DEPTH, W_S + LOW_WALL_T), (W_E, W_S + LOW_WALL_T), (0.0, 1.0))):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        s = rng.uniform(0.0, TUFT_STEP)
        while s < L:
            if rng.random() < TUFT_P:
                off = rng.uniform(*TUFT_OFF); cx = a[0] + d[0] * s + nrm[0] * off; cy = a[1] + d[1] * s + nrm[1] * off
                for _ in range(rng.randint(*TUFT_BLADES)):
                    az = rng.uniform(0.0, 2.0 * math.pi); lean = math.radians(rng.uniform(*TUFT_LEAN)); ln = rng.uniform(*TUFT_LEN)
                    ux, uy = math.cos(az), math.sin(az); px, py = -uy * TUFT_W / 2.0, ux * TUFT_W / 2.0
                    k = len(V)
                    V += [(cx - px, cy - py, Z_GROUND - 0.02), (cx + px, cy + py, Z_GROUND - 0.02),
                          (cx + ux * ln * math.sin(lean), cy + uy * ln * math.sin(lean), Z_GROUND + ln * math.cos(lean))]
                    F.append((k, k + 1, k + 2)); tones += [1.0 + rng.uniform(-TUFT_VARY, TUFT_VARY)] * 3
            s += TUFT_STEP
    ground_mesh("ctx_tufts", V, F, M_TUFT, FLAT, attrs={"tone": tones}, col=ctx)
    n_ctx["tufts"] = len(F)
    # the N lot: the retaining wall along its south edge and up its east edge, the fence on its top, the warehouse
    t, z1 = RET_WALL_T, Z_GROUND + RET_WALL_H
    mesh_of("ctx_wall_retaining", [box(N_W, N_E, N_S, N_S + t, z_foot, z1), box(N_E - t, N_E, N_S + t, N_S + LOT_N_DEPTH, z_foot, z1)], M_WALL["ret"])
    posts, lattice = [], []
    for a, b in (((N_W, N_S + t / 2.0), (N_E - t / 2.0, N_S + t / 2.0)), ((N_E - t / 2.0, N_S + t / 2.0), (N_E - t / 2.0, N_S + LOT_N_DEPTH))):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L); n = int(L // FENCE_POST_M)
        for i in range(n + 1):
            s = min(L, i * FENCE_POST_M) if i < n else L
            posts.append(prism(a[0] + d[0] * s, a[1] + d[1] * s, z1, z1 + FENCE_H, FENCE_POST_R))
        rail_r = FENCE_POST_R * 0.7                                   # the top rail: a square bar along the run
        rx, ry = -d[1] * rail_r, d[0] * rail_r
        rv = [(a[0] - rx, a[1] - ry, z1 + FENCE_H - rail_r), (b[0] - rx, b[1] - ry, z1 + FENCE_H - rail_r), (b[0] + rx, b[1] + ry, z1 + FENCE_H - rail_r), (a[0] + rx, a[1] + ry, z1 + FENCE_H - rail_r)]
        rv += [(p[0], p[1], z1 + FENCE_H + rail_r) for p in rv]
        posts.append((rv, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], [(0.0, 0.0)] * 8))
        lattice.append(([(a[0], a[1], z1), (b[0], b[1], z1), (b[0], b[1], z1 + FENCE_H), (a[0], a[1], z1 + FENCE_H)],
                        [(0, 1, 2, 3)], [(0.0, 0.0), (L, 0.0), (L, FENCE_H), (0.0, FENCE_H)]))
    mesh_of("ctx_fence_posts", posts, M_POST); mesh_of("ctx_fence_lattice", lattice, M_FENCE)
    n_ctx["posts"] = len(posts) - 2
    x0, x1, y0, y1, h = SHED_N
    mesh_of("ctx_shed_tan", [box(x0, x1, y0, y1, z_foot, Z_GROUND + h)], [M_WALL["tan"], M_WALL["roof"]], slots=[0])
    shed = bpy.data.objects["ctx_shed_tan"]
    for p in shed.data.polygons: p.material_index = 1 if p.normal.z > 0.5 else 0
    # the hedge: a parkway planting inside the N lot's kerb, along the north street and up Broadway
    k = 0
    for a, b in (((WX + KERB_R, Y1 + HEDGE_OFF), (EX - KERB_R, Y1 + HEDGE_OFF)), ((EX - HEDGE_OFF, Y1 + KERB_R), (EX - HEDGE_OFF, N_S + LOT_N_DEPTH))):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        s = rng.uniform(0.0, 0.5)
        while s < L:
            place_tree(f"ctx_hedge_{k:03d}", a[0] + d[0] * s + rng.uniform(-0.15, 0.15), a[1] + d[1] * s + rng.uniform(-0.15, 0.15),
                       HEDGE_MODELS[k % len(HEDGE_MODELS)], rng.uniform(*HEDGE_H), rng.uniform(0.0, 360.0), sink=HEDGE_SINK)
            k += 1; s += rng.uniform(*HEDGE_STEP)
    n_ctx["bushes"] = k
    # the trees
    for k, (x, y, model, height, turn) in enumerate(TREES):
        place_tree(f"ctx_tree_place_{k + 1:02d}", x, y, model, height, turn)
    n_ctx["trees"] = len(TREES)
    print(f"the near context: the W lot ringed by a {LOW_WALL_H:.1f} m wall {LOT_W_DEPTH:.0f} m deep with {n_ctx['tufts']} dry blades along "
          f"its foot and a {CREAM_WALL_H:.1f} m cream yard inside it; the N lot's {RET_WALL_H:.1f} m retaining wall with a {FENCE_H:.1f} m "
          f"fence ({n_ctx['posts']} posts) and a {SHED_N[4]:.0f} m warehouse; {n_ctx['bushes']} bushes along its kerb; {n_ctx['trees']} of "
          f"the game's trees linked from {os.path.basename(CTX_LIBRARY)}; every material hazed")

# ---------------------------------------------------------------- the far context: boxes, tree lines and the skyline
# What stands beyond the near context, from a few hundred metres to the horizon (AI 574 item 29), read off the photo
# by column (the review's scripts/column_edges.py, zoom_crop.py) and unprojected through the reference stand
# (context_frame.py; the numbers in item29_far_context/item29_numbers.md). LEFT of the block, over the near crowns: a
# red-brick low building cut by the frame's edge (x 0-0.02, y 0.38-0.41; 7 m at 231 m), behind it a white
# two-storey building with dark windows (x 0.015-0.045, y 0.355-0.385; 10 m at 245 m -- the brick hides its foot, so
# the brick stands in front) running on west as a pale wing to x 0, a cream one beside it, a white sliver far off at
# x 0.025-0.035 whose top shows at 0.33 (10 m at 1.1 km), a blue-grey band of low scrub at 650-1000 m (y
# 0.345-0.36), and on the horizon a pale far city (y 0.325-0.345, (136-182) grey) with a darker block whose top
# stands just under the level line at x 0-0.02 ((112, 125, 133): 12 m at 800 m). RIGHT of the block, above the near
# warehouse's top (0.44): a pale band of road (0.43-0.44), the shaded ochre wall of a second warehouse (x 0.93-1.0,
# y 0.395-0.43; 5 m at 231 m), a row of white box trailers with one blue near the east end (y 0.385-0.395, 4 m
# overall: the body over its wheels, at 300 m, their wheels hidden by that wall as the photo's are), a dense dark
# tree line behind them (y 0.335-0.375: 9-12 m crowns at 360 m, more rows at 520 and 700 m), two sunlit crowns
# breaking the horizon at the frame's right edge (x 0.975-1.0, y 0.31-0.325: 19-22 m at 600 m), a hazy white
# low-rise skyline whose tops stand at 0.322-0.327 (8-12 m at 1.2 km, lower ones at 1.45 km) and, over it, a far
# tree line at 1.3 km whose crowns reach 0.311 through the skyline's gaps. Everything is GEOMETRY on the lots --
# grid-aligned boxes and the game's trees placed by place_tree, instances sharing the linked meshes, 500 of them for
# nothing (the far section builds in 0.03 s, the full-size render takes 34 s) -- so the sun lights it as it lights
# the block (east faces bright, south faces in shade) and the haze group turns it into the photo's pale silhouettes
# by distance alone: no card stands anywhere (a card would need a Track To on the reference camera so the
# street-level views never saw it edge-on; boxes and trees need nothing), and nothing is tuned for distance -- a
# box that reads wrong at the horizon moves, the haze stays (the tall block came from 1.2 km to 800 m that way). The
# mid-distance walls are the game's sets (the white a lifted plaster, the brick the red_brick set darkened, the
# second warehouse the near one's ochre plaster lifted for the lot's weaker bounce); the far city, the trailers and
# every roof are plain colours, since a 4 m plaster tile is under a pixel from a kilometre; the tree lines carry a
# darker leaf and bark than the lot's open crowns, as the photo's dense windbreaks are darker than its crowns. Every
# shadow runs west-south-west at 1.08 times the height and every box stands far enough inside its lot that it falls
# on the lot: nothing here shadows a strip, a road or the block. The trailers' wheels and the parapets are for the
# record: from the reference stand the roofs are seen at a degree or two and vanish (the second warehouse has none,
# and is shallow: a 30 m roof seen from 14 m up filled the rows where the trailers show).
FAR_SEED = 29                                   # the tree lines' and the skyline's random numbers (their own, so step 28's stay)
FAR_PARAPET, FAR_PARAPET_T = 0.7, 0.3           # a mid-distance building's parapet: the wall rises this much over its dark flat roof, this thick
FAR_SETS = {"plaster": ("plastered_wall_02", (1.25, 1.27, 1.30)),   # the white buildings at 250 m: the photo's read (224-242, 221-235, 209-227) in sun;
                                                                    # the plaster as it is renders (216, 211, 206) (the cream yard), so a quarter lifted,
                                                                    # a touch cool
            "brick": ("red_brick", (0.45, 0.42, 0.42)),             # the game's brick, albedo (142, 103, 80) sRGB, rendered (205, 174, 158) in sun as it
                                                                    # is (the film compresses a sunlit red); the photo's brick building reads (131-194,
                                                                    # 97-156, 83-136), mean (165, 130, 105), so the set is darkened to about (176, 142, 118)
            "tan2": ("plastered_wall_02", (1.9, 1.3, 0.78))}        # the second warehouse: the near one's ochre (1.15, 0.95, 0.65) rendered (102, 92, 83)
                                                                    # at 231 m, on the lot's dirt bounce, against the photo's (137, 110, 92); lifted to it
# The plain materials' linear albedos. What a far face renders as was worked out with the film's own curve
# (scripts/agx_curve.py: AgX Medium High Contrast is no sRGB curve -- linear 0.2 shows as 125, 0.5 as 178, 1.0 as
# 208): a sunlit east face takes about 3.4 times its albedo in radiance (the lamp and the map's sun at 56% on a
# vertical face, the sky, the lot's bounce) plus about 0.06 of sun sheen from the Principled BSDF's 4% specular at
# this roughness -- the camera stands between the sun and these faces -- so even a black box reads 130 at a
# kilometre, and the haze's floor (the sky's share) is (129, 140, 162) at 1.2 km on the left, (170, 176, 187) at
# 1.6 km on the right; the photo's far hill reads (166, 175, 182), so 1.4-1.6 km is where dark far things belong.
FAR_PLAIN = {"white": (0.60, 0.60, 0.62),       # the far skyline's white, neutral (the warm plaster hazed read pink at a kilometre)
             "grey": (0.12, 0.12, 0.13),        # a grey concrete for the far city: about 180 sunlit at 1.2 km, 160 in shade
             "dark": (0.03, 0.03, 0.035),       # a dark block there (155 sunlit at 1.2 km), and the trailers' wheels
             "black": (0.015, 0.015, 0.018),    # the tall dark block, matte (see FAR_SPEC): the photo's reads (112, 125, 133)
             "roof": (0.04, 0.04, 0.04),        # every flat roof: dark felt
             "trailer": (0.62, 0.62, 0.62),     # a white trailer body and its roof: its sunlit end about 230, the photo's (207-218)
             "blue": (0.10, 0.18, 0.36)}        # the blue one: the photo's reads (115, 130, 148) at x 0.98-0.995
FAR_ROUGH = 0.7                                 # the plain materials' roughness: matte
FAR_SPEC = {"black": 0.1}                       # a material's Specular IOR Level where not the default 0.5: the tall block's sheen cut, or
                                                # the sun's highlight alone lifts it to a mid-grey
FAR_LEAF_TINT = (0.28, 0.25, 0.22)              # the tree lines' leaf tint (LEAF_TINT is the near crowns' (0.50, 0.42, 0.42)): the photo's
                                                # far lines are dense dark windbreaks, (44-104) over the trailers, where the lot's open crowns
                                                # read (110, 104, 63); with the near tint the line rendered (138, 139, 130) at 450 m, the haze's
                                                # floor there being (74, 81, 95) for black
FAR_TRUNK_TINT = (0.40, 0.38, 0.36)             # and their bark's: the game's crowns are airy, and the sunlit pale trunks showed through the
                                                # line as light verticals from 360 m
# The mid-distance boxes: (name, x0, x1, y0, y1, height, material, parapet), grid-aligned, each on a lot's interior
# with its shadow inside it. Where the photo's element unprojects is in each comment; the left ones stand on the W lot
# (its interior runs y -17.5 to 17.0) and past 420 m on the NW lot (y over 39.1), the right ones on the NW lot.
FAR_BOXES = [
    # the left, front to back: the photo's brick stands in front of the white building (the white's foot is hidden by
    # the brick's top, 0.38); the white runs on west past the frame's edge, as the photo's pale wing does at x 0-0.012,
    # so its shaded south face never shows (it did, a grey patch at x 0.001-0.011, when the box began at y 8.8)
    ("brick",  -184.0, -172.0,   -1.0,   7.7,  7.0, "brick", True),     # the red-brick low building, cut by the frame's left edge: x 0-0.02, top 0.38, 231 m
    ("white",  -196.0, -186.0,    6.5,  14.5, 10.0, "plaster", True),   # the white two-storey building behind it: x 0-0.038, top 0.362 at 10 m, 245 m
    ("cream",  -196.0, -186.0,   14.8,  17.0,  8.0, "cream", True),     # the cream one beside it, x 0.038-0.045 (the block hides the rest), its south face
                                                                        # behind the white; the W lot's interior ends at y 17
    ("white2", -1035.0, -1015.0, 183.0, 195.0, 10.0, "white", True),    # the white sliver over the scrub at x 0.025-0.035, y 0.33-0.335: 10 m at 1.1 km,
                                                                        # its foot behind the scrub (12 m at 412 m showed a whole white wall where the
                                                                        # photo has none)
    ("tan2",    -92.0,  -60.0,  155.0, 163.0,  5.2, "tan2", False),     # the second warehouse on the right, its shaded south face x 0.93-1.0, y 0.395-0.43:
                                                                        # 231 m, its east face just off the frame's right edge; shallow and without a
                                                                        # parapet, since from 14 m up a 30 m roof and then the far parapet's inner face
                                                                        # filled the rows where the trailers show
    ("tall",   -750.0, -731.0,  106.0, 124.0, 12.0, "black", True),     # the darker taller block at x 0-0.02, its top 0.325 just under the horizon, its
                                                                        # foot behind the scrub: 800 m (at 1.2 km the haze's floor alone read (160, 169, 180))
]
TRAILERS = (-105.0, 200.0, 10, 3.0)             # the trailer row: the x of the east ends, the y of the southmost body's south side, how many,
                                                # the pitch northward; 300 m from the stand, side by side with their long axes EAST-WEST, so
                                                # the camera sees a row of sunlit east ends with a sliver of shaded side between (north-south
                                                # axes, side by side, showed only their shaded south ends: the row read grey)
TRAILER = (2.5, 12.5, 2.6)                      # a trailer body's width, length and height ...
TRAILER_DECK = 1.3                              # ... over the ground on its wheels (the photo's band is 0.01-0.02 of the frame: 4 m at 300 m)
TRAILER_BLUE = 7                                # which trailer is the blue one, counted from the south: the one at x 0.98-0.995
# The tree lines: ((x0, y0), (x1, y1), step m, (height min, max)), a line of the game's trees a step apart (jittered),
# each its own model (1-10, the crowns that reach the ground: a line shows no trunks), height and turn, in the
# darker leaf. A line is two rows a few metres apart, staggered, or the airy crowns let the hazed plain through and
# the line read as pale saplings (pass 2).
FAR_ROW_PAIR = 8.0                              # the second row of a line stands this far behind the first
FAR_TREE_ROWS = [
    # the right: the dark tree line over the trailers (x 0.93-1.0, y 0.335-0.375): 360 m, 520 m and 700 m
    ((-200.0, 268.0), (-110.0, 268.0), 4.5, (9.0, 12.0)),
    ((-290.0, 400.0), (-190.0, 400.0), 5.0, (8.0, 11.0)),
    ((-400.0, 560.0), (-280.0, 560.0), 6.0, (7.0, 10.0)),
    # the far tree line that breaks the horizon over the white skyline on the right (y 0.305-0.32; the photo's band
    # reads (116-155)): 18-26 m crowns at 1.3 km, behind the skyline's first row, showing through its gaps. Nearer it
    # would hide the white buildings; at 1.5 km, in bare-trunked models, it rendered pale pink (hazed bark); sparse
    # 600 m emergents read as lollipops against the sky. Here the haze's floor makes it the photo's far hill's tone
    ((-800.0, 1080.0), (-560.0, 1080.0), 8.0, (14.0, 20.0)),
    # and two sunlit crowns at the frame's right edge (x 0.975-1.0, y 0.31-0.325, olive (105-124) in the photo): 600 m
    ((-268.0, 470.0), (-258.0, 476.0), 5.0, (19.0, 22.0)),
    # the left: the blue-grey band of low scrub at 650-1000 m (y 0.335-0.36), three lines across the wedge
    ((-660.0, 60.0), (-660.0, 200.0), 3.0, (3.5, 7.0)),
    ((-800.0, 90.0), (-800.0, 250.0), 3.0, (3.5, 7.0)),
    ((-950.0, 120.0), (-950.0, 300.0), 3.0, (4.0, 8.0)),
]
# The skyline: (axis, at, from, to, (width min, max), (gap min, max), (height min, max), palette): a row of boxes
# along x at y = at (their south faces toward the stand) or along y at x = at (their east faces), each a random
# width, gap and height, its depth FAR_DEPTH away from the stand, its material drawn from the palette's shares.
FAR_DEPTH = (15.0, 30.0)                        # a skyline box's depth, the side the stand never sees
SKYLINE_ROWS = [
    # the right: the hazy white low-rise skyline, its tops at 0.322-0.327 (x 0.93-0.975): 1.2 km, and lower ones behind at 1.45 km
    ("x", 1000.0, -730.0, -520.0, (15.0, 35.0), (4.0, 12.0), (8.0, 12.0), (("white", 0.7), ("grey", 0.3))),
    ("x", 1450.0, -1010.0, -770.0, (20.0, 45.0), (5.0, 15.0), (6.0, 12.0), (("white", 0.5), ("grey", 0.5))),
    # the left: the far city (y 0.325-0.34, the photo's (136-182) with white slivers): 1.2 km, 1.65 km and 2.1 km, greyer
    # than the right's since the stand sees their sunlit east faces almost square
    ("y", -1130.0, 80.0, 330.0, (15.0, 40.0), (3.0, 12.0), (6.0, 11.0), (("grey", 0.5), ("dark", 0.3), ("white", 0.2))),
    ("y", -1600.0, 130.0, 450.0, (20.0, 50.0), (4.0, 15.0), (8.0, 14.0), (("grey", 0.5), ("white", 0.3), ("dark", 0.2))),
    ("y", -2050.0, 200.0, 560.0, (25.0, 60.0), (5.0, 20.0), (8.0, 14.0), (("white", 0.4), ("grey", 0.6))),
]

n_far = {}
if CONTEXT == "on" and GROUND == "street":
    t_far = time.time()
    rng = random.Random(FAR_SEED)
    # ---- the materials: the game's sets for the mid-distance walls, the near context's cream and ochre plaster
    # shared, plain colours for the rest; every one hazed
    def plain_material(name, rgb, rough=FAR_ROUGH, spec=0.5):
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*rgb, 1.0); b.inputs["Roughness"].default_value = rough
        b.inputs["Specular IOR Level"].default_value = spec
        return m
    M_FAR = {k: hazed(ground_material("CTX_far_" + k, folder, tint=tint)) for k, (folder, tint) in FAR_SETS.items()}
    M_FAR.update({k: hazed(plain_material("CTX_far_" + k, rgb, spec=FAR_SPEC.get(k, 0.5))) for k, rgb in FAR_PLAIN.items()})
    M_FAR["cream"], M_FAR["tan"] = M_WALL["cream"], M_WALL["tan"]
    # the tree lines' leaf and bark: the library's materials copied again, the leaf hazed inside its cut-out with the
    # darker tint, the trunk with a multiply put before its base colour
    far_leaf = lib_mats["ctx_leaf"].copy(); far_leaf.name = "CTX_leaf_far"
    next(i for i in far_leaf.node_tree.nodes["LEAF_TINT"].inputs if i.identifier == "B_Color").default_value = (*FAR_LEAF_TINT, 1.0)
    far_trunk = lib_mats["ctx_trunk"].copy(); far_trunk.name = "CTX_trunk_far"; ft = far_trunk.node_tree
    ft_bsdf = next(n for n in ft.nodes if n.type == 'BSDF_PRINCIPLED')
    ft_link = next(l for l in ft.links if l.to_socket == ft_bsdf.inputs["Base Color"])
    ft_tint = ft.nodes.new('ShaderNodeMix'); ft_tint.data_type = 'RGBA'; ft_tint.blend_type = 'MULTIPLY'; ft_tint.name = ft_tint.label = "TRUNK_TINT"
    ft_tint.location = (ft_bsdf.location.x - 220, ft_bsdf.location.y + 250); ft_tint.inputs["Factor"].default_value = 1.0
    ft.links.new(ft_link.from_socket, next(i for i in ft_tint.inputs if i.identifier == "A_Color")); ft.links.remove(ft_link)
    next(i for i in ft_tint.inputs if i.identifier == "B_Color").default_value = (*FAR_TRUNK_TINT, 1.0)
    ft.links.new(next(o for o in ft_tint.outputs if o.identifier == "Result_Color"), ft_bsdf.inputs["Base Color"])
    M_TREE_FAR = {"ctx_leaf": hazed(far_leaf, at=("LEAF_CUTOUT", 2)), "ctx_trunk": hazed(far_trunk)}
    # ---- the geometry
    def boxes_mesh(name, parts, mats, slots):
        # one mesh of boxes: every part's walls in its slot's material, the top of every part the roof, mats' last
        ob = mesh_of(name, parts, mats, slots=slots)
        for j in range(len(parts)): ob.data.polygons[6 * j + 4].material_index = len(mats) - 1   # box() lays the top fifth
        return ob
    def building(name, x0, x1, y0, y1, h, mat, parapet=True):
        # a box of walls with a dark flat roof; with a parapet the roof lies FAR_PARAPET below the top inside a ring
        zr, t = Z_GROUND + h - (FAR_PARAPET if parapet else 0.0), FAR_PARAPET_T
        parts = [box(x0, x1, y0, y1, z_foot, zr)]
        if parapet:
            parts += [box(x0, x1, y0, y0 + t, zr, zr + FAR_PARAPET), box(x0, x1, y1 - t, y1, zr, zr + FAR_PARAPET),
                      box(x1 - t, x1, y0 + t, y1 - t, zr, zr + FAR_PARAPET), box(x0, x0 + t, y0 + t, y1 - t, zr, zr + FAR_PARAPET)]
        ob = mesh_of(name, parts, [mat, M_FAR["roof"]], slots=[0] * len(parts))
        ob.data.polygons[4].material_index = 1                            # the walls' top is the roof; the parapet's tops stay wall
        return ob
    for name, x0, x1, y0, y1, h, mat, parapet in FAR_BOXES:
        building("ctx_far_" + name, x0, x1, y0, y1, h, M_FAR[mat], parapet)
    n_far["boxes"] = len(FAR_BOXES)
    # the trailers: a body on its wheels, one mesh, the blue one its own slot; the row runs north from the first
    # body's south side, every body's east end on x = tx
    tx, ty, n_tr, pitch = TRAILERS; w, L, h = TRAILER
    parts, slots = [], []
    for k in range(n_tr):
        y0 = ty + k * pitch
        parts.append(box(tx - L, tx, y0, y0 + w, Z_GROUND + TRAILER_DECK, Z_GROUND + TRAILER_DECK + h)); slots.append(1 if k + 1 == TRAILER_BLUE else 0)
        parts.append(box(tx - L + 1.0, tx - 1.0, y0 + w * 0.2, y0 + w * 0.8, z_foot, Z_GROUND + TRAILER_DECK)); slots.append(2)
    boxes_mesh("ctx_far_trailers", parts, [M_FAR["trailer"], M_FAR["blue"], M_FAR["dark"], M_FAR["trailer"]], slots)   # white roofs
    n_far["trailers"] = n_tr
    # the tree lines: each two staggered rows, the second FAR_ROW_PAIR behind the first (away from the stand: +y on
    # the right's rows, -x on the left's), the sparse emergent row alone
    k = 0
    for (xa, ya), (xb, yb), step, (h0, h1) in FAR_TREE_ROWS:
        L = math.hypot(xb - xa, yb - ya); d = ((xb - xa) / L, (yb - ya) / L)
        back = (0.0, 1.0) if abs(d[0]) > abs(d[1]) else (-1.0, 0.0)       # the row's far side: north of a row along x, west of one along y
        rows = 1 if step >= 15.0 else 2                                    # the sparse emergents stand in one row
        for r in range(rows):
            s = rng.uniform(0.0, step) + (step / 2.0 if r else 0.0)
            while s < L:
                j = rng.uniform(-0.3, 0.3) * step                                  # a little off the line, either side
                bx, by = back[0] * FAR_ROW_PAIR * r, back[1] * FAR_ROW_PAIR * r
                place_tree(f"ctx_far_tree_{k:03d}", xa + d[0] * s - d[1] * j + bx, ya + d[1] * s + d[0] * j + by,
                           rng.randint(1, 10), rng.uniform(h0, h1), rng.uniform(0.0, 360.0), mats=M_TREE_FAR)
                k += 1; s += step * rng.uniform(0.8, 1.2)
    n_far["trees"] = k
    # the skyline: every row one mesh
    sky_names = ("white", "grey", "dark"); sky_mats = [M_FAR[m] for m in sky_names] + [M_FAR["roof"]]
    def pick(palette):
        # a material drawn from (name, share) pairs
        u = rng.random()
        for m, share in palette:
            u -= share
            if u < 0.0: return m
        return palette[-1][0]
    n_far["skyline"] = 0
    for r, (axis, at, a, b, (w0, w1), (g0, g1), (h0, h1), palette) in enumerate(SKYLINE_ROWS):
        parts, slots, s = [], [], a + rng.uniform(0.0, g1)
        while True:
            w = rng.uniform(w0, w1)
            if s + w > b: break
            depth, h = rng.uniform(*FAR_DEPTH), rng.uniform(h0, h1)
            if axis == "x": parts.append(box(s, s + w, at, at + depth, z_foot, Z_GROUND + h))     # the south face at y = at
            else: parts.append(box(at - depth, at, s, s + w, z_foot, Z_GROUND + h))               # the east face at x = at
            slots.append(sky_names.index(pick(palette))); s += w + rng.uniform(g0, g1)
        boxes_mesh(f"ctx_far_skyline_{r + 1:02d}", parts, sky_mats, slots); n_far["skyline"] += len(parts)
    print(f"the far context: {n_far['boxes']} boxes at 231 m to 1.1 km, {n_far['trailers']} trailers at 300 m, "
          f"{n_far['trees']} more of the game's trees in {len(FAR_TREE_ROWS)} lines at 360 m to 1.3 km, {n_far['skyline']} skyline boxes in "
          f"{len(SKYLINE_ROWS)} rows at 1.2-2.1 km; no cards; every material hazed; built in {time.time() - t_far:.2f} s")

# ---------------------------------------------------------------- the off-frame neighbour: the second shadow across the crossing
# The photo has a SECOND shadow across the crossing (AI 574 item 7): a dark band along the frame's bottom from its
# left edge to x 0.53, parallel to the block's own shadow and 7-8 m south-east of it, with sunlit road between. Its
# north-west edge, scanned column by column (the review's scripts/band_edge.py: the last step from lit road to dark
# on 21 columns, x 0.08-0.48) and unprojected through the stand, is a straight line on the ground from (22.4, -22) to
# (10.1, -30.5) at azimuth -144 (0.16 m scatter): a VERTICAL edge's shadow, running away from the sun, so it is the
# shadow of another building's north-west corner standing north-east of the crossing, across Broadway, and the band
# has no other edge in the frame -- south-east of that line it runs to the frame's bottom and left edges (what looked
# like a south end at y -30.8 is the photo's far kerb of 3rd Street, whose pale pavement reads (116, 121, 131) in the
# same shadow; item 28: the photo's far kerb lies inside our 13 m roadway). The band's road reads (49, 53, 64) against
# (35, 40, 50) in the block's shadow and (127, 115, 108) in the sun: a shadow with more sky over it than the block's own.
# The caster follows from geometry alone. Every shadow in this scene runs along the lamp's azimuth, so the line is
# laid at the scene's sun, +40, not the photo's 36 (the same 4 degrees item 1 measured on the block's own shadow):
# slid across the measured points to the offset where its frame crossing sits nearest the photo's on every column
# (scripts/fit_neighbour.py), it passes NEIGHBOUR_EDGE and lands within 0.006 of the frame on the middle columns and
# 0.011 at the ends. The corner stands where that line meets the tower's west face, NEIGHBOUR_X: not at the E lot's
# interior edge (38.74), because the tower's south-west vertical edge, base below the frame and top above it, passed
# through the frame's bottom-right corner there (0.002 outside at x 41.6); at 42.5 it crosses the bottom row 0.044
# right of the corner and every corner of the tower lies right of the frame at every height. Its HEIGHT is what
# carries the shadow to the frame's left edge: the line leaves the frame at (10.8, -31.1), 41.4 m from the corner,
# and a shadow runs 1.08 x height at this sun, so the tower is twelve storeys, 39.6 m, its edge reaching 1.2 m past
# the frame -- the class of building that stands across Broadway from the real Bradbury, not the brief's three to
# six storeys, which from 42 m out would have ended the band 20 m short of the frame's left edge. Nothing of it
# shadows the block: the sun ray from the block's south-east base corner reaches the tower's west face 30 m up and
# 10 m north of its north face, and the shadow's north-west line passes 0.22 m south-east of the pavement's own
# south-east corner and 2.3 m clear of the curb return, so the apron, the kerb and Broadway's face stay in the sun
# as the photo has them. The stand itself sees the tower's shadow and not the tower. A two-storey wing along
# Broadway north of the tower (NEIGHBOUR_WING) makes a building of it; its own 8 m shadow ends on the E lot's strip
# 0.08 of the frame below the bottom-right corner. The tower wears the game's plaster as the cream yard does, the
# wing the far brick; both hazed like everything on the lots. The st_corner stand, on the SE lot's interior, lies
# 1 m outside the tower's shadow (its south-east line crosses y -41 at x 39.9) and looks across a crossing whose
# south-east quarter is now in shade, as a street corner under a tall neighbour is.
NEIGHBOUR = args.get("neighbour", "on").lower()   # on | off: the tower and its wing (with the context, on the street ground)
assert NEIGHBOUR in ("on", "off"), f"neighbour: on | off, not {NEIGHBOUR}"
NEIGHBOUR_EDGE = (19.38, -23.89)                # a ground point on the photo's second shadow edge: the 21 columns' centroid (19.44, -23.97)
                                                # slid 0.10 m north-west, where the scene's line sits nearest the photo's edge in the frame
NEIGHBOUR_X = 42.5                              # the tower's west face, 3.8 m inside the E lot's interior edge: the least x at which its
                                                # south-west vertical edge clears the frame's bottom-right corner (by 0.044 of the frame)
NEIGHBOUR_S = -17.0                             # its south face, 0.5 m inside the lot's south interior edge (-17.53)
NEIGHBOUR_W = 26.0                              # its width eastward: the shadow's south-east line then passes 1 m east of the st_corner stand
NEIGHBOUR_STOREYS, NEIGHBOUR_STOREY_H = 12, 3.3 # twelve storeys, 39.6 m to the parapet's top: the shadow's edge must run 41.4 m from the
                                                # corner to leave the frame's left edge, and a shadow is 1.08 x height at this sun
NEIGHBOUR_WING = (0.25, 0.5, 20.0, 20.0, 7.5)   # the wing along Broadway north of the tower: set back this far east of the tower's west face,
                                                # overlapping the tower this far (no two faces coincide), this deep east, this long north, this tall

n_nb = {}
if CONTEXT == "on" and GROUND == "street" and NEIGHBOUR == "on":
    # the shadow runs along the lamp's azimuth (the map's own if there is no lamp), 1 / tan(elevation) per metre up
    nb_az = lamp_az if SUN > 0.0 else seen_az; nb_el = lamp_el if SUN > 0.0 else map_el
    nb_h = NEIGHBOUR_STOREYS * NEIGHBOUR_STOREY_H
    nb_n = NEIGHBOUR_EDGE[1] + (NEIGHBOUR_X - NEIGHBOUR_EDGE[0]) * math.tan(math.radians(nb_az))   # the north face: the corner on the line
    assert NEIGHBOUR_S < nb_n, f"the tower's north face at y {nb_n:.2f} lies south of its south face {NEIGHBOUR_S}: the sun's azimuth moved the line"
    building("ctx_neighbour_tower", NEIGHBOUR_X, NEIGHBOUR_X + NEIGHBOUR_W, NEIGHBOUR_S, nb_n, nb_h, M_WALL["cream"], True)
    back, lap, wd, wl, wh = NEIGHBOUR_WING
    building("ctx_neighbour_wing", NEIGHBOUR_X + back, NEIGHBOUR_X + back + wd, nb_n - lap, nb_n + wl, wh, M_FAR["brick"], True)
    reach = nb_h / math.tan(math.radians(nb_el))
    tip = (NEIGHBOUR_X - reach * math.cos(math.radians(nb_az)), nb_n - reach * math.sin(math.radians(nb_az)))
    # how far the block's pavement corner stands north-west of the shadow's edge (positive: in the sun)
    clear = (EX - NEIGHBOUR_X) * -math.sin(math.radians(nb_az)) + (SY - nb_n) * math.cos(math.radians(nb_az))
    n_nb["tower"], n_nb["wing"] = nb_h, wh
    print(f"the off-frame neighbour: a {NEIGHBOUR_STOREYS}-storey tower {nb_h:.1f} m tall on the E lot, x {NEIGHBOUR_X:.1f}-{NEIGHBOUR_X + NEIGHBOUR_W:.1f}, "
          f"y {NEIGHBOUR_S:.1f}-{nb_n:.2f}, with a {wh:.1f} m wing to y {nb_n + wl:.1f}; its north-west edge's shadow runs {reach:.1f} m at azimuth "
          f"{nb_az - 180.0:.0f} to ({tip[0]:.1f}, {tip[1]:.1f}), passing {clear:.2f} m south-east of the pavement's corner ({EX:.2f}, {SY:.2f})")

# ---------------------------------------------------------------- the street furniture: lamp posts and vault covers
# What the photo has standing on its streets and set into its pavement (AI 574 item 8), read off it at 6-8x (the
# review's scripts/zoom_crop.py), each pole traced row by row (pole_extent.py), each cover found by local contrast
# (find_covers.py) and sized from its pixel box at its distance (cover_size.py); the numbers in
# item8_furniture/item8_numbers.md. THREE LAMP POSTS. Two tall ones with a twin-luminaire T head about a metre
# across, one at each edge of the frame, and both with their heads ABOVE the horizon line (0.32): a point over the
# horizon is over the eye, 14.4 m up, whatever its distance, so these are high-mast lot lights, not 10-12 m street
# lights, and a post's height is not a guess but what its head's ray gives at its foot's distance (post_height.py).
# The west one (x 0.036, head 0.260) shows against the sky, the white and brick boxes and the wedge trees' crowns,
# and vanishes at 0.49-0.50 behind the photo's tan wall: it stands between that wall and the trees, which here is
# inside the cream yard, 123 m out, 18.4 m tall, a pale grey pole (it reads paler than the brick behind it). The
# north one (x 0.980, head 0.225) is a DARK pole (sRGB (43, 38, 39) where it crosses the white trailers) that ends at
# 0.4425, the near warehouse's top and the crowns' edge, with no trace against the tan wall below: it stands behind
# SHED_N, 8 m past its north wall, 149 m out, 22.1 m tall, its foot hidden by the warehouse and the N lot's crowns.
# Neither foot shows in the photo and neither shows here. The third is a short black lantern post on the photo's
# far pavement of 3rd Street (x 0.027, lantern top 0.5375, foot 0.645: 5 m at 79 m). That pavement lies where this
# scene's 3rd Street ROADWAY is (item 28: the photo's Bradbury has its lot against its west end and its far kerb a
# metre past our block's own), and the S lot's strip never enters the frame, so it stands on the block's own south
# pavement on the same ray, COVER_GAP-and-a-bit inside the slabs' edge, where its lantern lands on the photo's spot
# (0.026, 0.539) and its foot 0.026 higher (0.619); on that ray, 86.6 m out, the photo's lantern height comes to
# 3.96 m, which is Poly Haven's street_lamp_01 (Josh Dean, CC0: a black cast-iron post with a lantern and a crossbar
# under it, the photo's own silhouette) at its own 3.87 m, so the model stands as it is, linked from the context
# library where build_context.py imports it from assets/props/street_lamp_01/ (its source.json beside it), its
# materials copied local and hazed like the trees'. The tall posts are built here: a tapered twelve-sided pole on a
# flange, a square crossbar and a luminaire box at each end turned broadside to the stand, matte paint, no lamp (a
# daylight scene). FOUR VAULT COVERS on the block's pavement by the kerb, rusty dark steel plates -- the brief's
# reading had three; the fourth sits at the frame's right edge -- two on 3rd Street's side (one on the corner
# apron), two on Broadway's. Broadway's two unproject 1.7 and 3.3 m INTO the road: the photo's Broadway pavement
# runs wider than ours toward the right edge (its kerb reaches the edge at 0.775, ours at 0.73), so they stand at
# COVER_GAP inside our slabs' edge at their measured stations along the street; the apron one is pulled 0.16 m in for
# the same gap; the 3rd Street one is where it unprojects. A cover is two thin closed boxes, a near-black frame 1 mm
# proud of the slabs (the hairline recess) and the plate 3 mm proud inside it: nothing is cut from the slabs and
# nothing lies in their plane. NO STORM DRAIN and NO HYDRANT: the kerb feet were searched along both streets, round
# the corner and at the far kerb bottom-left (find_covers.py by local contrast, the zooms under
# item8_furniture/tune/), and every dark mark there is a kerb block's shaded face, the gutter's dirt, a crack, the
# corner door's glass or a shopfront's plinth; the photo has none, so none stands. Every shadow runs west-south-west
# at 1.08 x height: the west post's over the yard's south wall onto the W lot's strip and 3rd Street's westward
# road, outside the frame's left edge; the north post's over the N lot onto its west strip and the west street's
# road 90 m north of the block, behind the block from every camera; the black post's 4 m into the block's own
# shadow. Nothing new falls on the block or on a road the stand sees.
FURNITURE = args.get("furniture", "on").lower()  # on | off: the posts and the covers (with the context, on the street ground)
assert FURNITURE in ("on", "off"), f"furniture: on | off, not {FURNITURE}"
POST_TALL_R = (0.11, 0.05)                      # a high-mast pole's radius at its foot and at its top: a tapered tube (the photo's poles
                                                # are 2-2.5 px wide at 1536, about 0.16 m where they show; 0.14 / 0.07 rendered 5 px) ...
POST_TALL_SIDES = 12                            # ... of this many sides
POST_FLANGE = (0.30, 0.10)                      # its base flange's radius and height (for a standing eye; the stand never sees a foot)
POST_BAR = 1.0                                  # the T head: a square crossbar this long across the pole's top (the photo's heads
                                                # are 0.9-1.0 m across at their distances) ...
POST_BAR_R = 0.045                              # ... this much half a side
POST_LUM = (0.50, 0.28, 0.14)                   # a luminaire box at each end of the bar: along the bar, across it, tall; it straddles
                                                # the bar's height, the two dark blobs the photo shows either side of the pole's top
POST_PAINT = {"grey": (0.22, 0.55),             # (linear grey, roughness), matte: the west pole, paler than the brick behind it
              "dark": (0.028, 0.60),            # the north pole, (43, 38, 39) where it crosses the trailers: a sunlit side of about
                                                # 80 and a shaded side of 10 on the film, which a two-pixel pole blends to the photo's
                                                # (0.015 blended to (66, 72, 80) against the sky where the photo's reads (102, 116, 124))
              "head": (0.03, 0.50)}             # the bars and the luminaires of both
# (name, x, y, kind, paint, height m, turn degrees): 'tall' is built here, the pole this tall over the pavement, its bar
# along azimuth turn (broadside to the stand: the head's ray less 90); a library prop's name is that prop at its own
# height, turned so. Each foot stands on the photo's head ray where post_height.py puts it:
LAMP_POSTS = [
    ("ctx_post_west",  -66.1, -12.3, "tall", "grey", 18.4, 77.6),   # head (0.036, 0.260) at 123 m: in the cream yard, 6 m behind its east
                                                                    # wall (which hides the foot, as the photo's tan wall hides its own) and
                                                                    # before the wedge trees; the pole shows from 3.1 m up (frame 0.49)
    ("ctx_post_north", -25.1,  88.0, "tall", "dark", 22.1, 32.0),   # head (0.980, 0.225) at 149 m: 8 m behind SHED_N's north wall, whose top
                                                                    # ends the photo's pole at 0.4425; the N lot's crowns end ours at 0.41
    ("ctx_post_black", -30.7, -21.3, "street_lamp_01", None, None, 78.4),   # the black lantern post: lantern top (0.026, 0.539) against
                                                                    # the photo's (0.027, 0.5375), foot (0.028, 0.619) against 0.645 (the
                                                                    # photo's far pavement is our roadway); 0.43 m inside the slabs' edge
]
COVER_GAP = 0.35                                # a cover's outer edge keeps this far inside the slabs' edge (the kerb's top begins there)
COVER_PROUD = (0.001, 0.003)                    # the frame's top and the plate's top over the slabs: nothing shares the slabs' plane
COVER_RIM = 0.025                               # the frame shows this much round the plate: the hairline recess
COVER_DEPTH = 0.03                              # both boxes reach this far under the slabs (closed boxes; their sides are never seen)
COVER_STEEL = (0.072, 0.055, 0.042)             # the plate, linear: weathered steel, rusty. The photo's sunlit plates read (144, 118, 100)
                                                # and (165, 134, 113) against slabs of (210, 187, 163) and (218, 192, 164), 0.66-0.72 of
                                                # them on the film, and AgX compresses a ratio (the film's curve, scripts/agx_curve.py: 0.55
                                                # linear shows as 183, 0.2 as 125), so the plate's light must be a third of the slabs':
                                                # a third of the pavement set's mean albedo (0.216, 0.178, 0.136), warmer. At the sRGB
                                                # ratio, (0.16, 0.13, 0.105) with a 0.4 metallic sheen, the plates rendered 0.93 of the
                                                # slabs and all but vanished; at (0.10, 0.07, 0.05) matte, 0.82: the Principled's
                                                # default specular alone lays 0.04 of sky on a horizontal plate, a fifth of its light
COVER_STEEL_ROUGH, COVER_STEEL_METAL = 0.8, 0.1 # matte: the photo's plates carry no sky reflection ...
COVER_STEEL_SPEC = 0.25                         # ... so the specular is cut to a half of Principled's default (0.5 is 4% of the sky)
COVER_RECESS = (0.012, 0.012, 0.012)            # the recess: near black, matte
# (x, y, along m, across m, turn degrees): the plate's centre, its size along the kerb and across it, the kerb's direction
# there. Centres are the photo's covers unprojected (find_covers.py, cover_size.py), moved only where COVER_GAP asks:
COVERS = [
    (11.66, -21.03, 0.70, 0.50,  0.0),   # 3rd Street, (0.265, 0.841): as measured, 0.45 m inside the slabs' edge
    (17.44, -20.96, 0.90, 0.45, 17.8),   # the corner apron, (0.326, 0.902): measured (17.49, -21.11), 0.19 m from the edge, pulled 0.16 m in
    (20.24,  -4.59, 0.80, 0.50, 90.0),   # Broadway, (0.697, 0.857): measured (22.89, -7.26), 1.7 m out in the road, so at the gap and
                                         # slid along the kerb to the photo's frame x (at the road point's station it fell at 0.652);
                                         # it lands at (0.697, 0.816)
    (20.19,  16.50, 0.90, 0.60, 90.0),   # Broadway, (0.979, 0.770): measured (24.45, 10.12), 3.3 m out in the road, likewise: on the
                                         # photo's frame x the slab edge is at y 16.9, the NE curb return's start, so just short of it,
                                         # (0.975, 0.718); the photo's kerb reaches the frame's edge 0.045 lower than ours
]

n_fur = {}
if CONTEXT == "on" and GROUND == "street" and FURNITURE == "on":
    t_fur = time.time()
    # ---- the materials: plain paints for the tall posts, a warm steel and a near black for the covers, and the
    # library prop's own, copied local and hazed as the trees' are
    M_PAINT = {k: hazed(plain_material("CTX_post_" + k, (g, g, g), rough=r)) for k, (g, r) in POST_PAINT.items()}
    def steel_material(name, rgb, metallic, rough, spec):
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*rgb, 1.0)
        b.inputs["Metallic"].default_value = metallic; b.inputs["Roughness"].default_value = rough
        b.inputs["Specular IOR Level"].default_value = spec
        return m
    M_COVER = hazed(steel_material("CTX_cover_steel", COVER_STEEL, COVER_STEEL_METAL, COVER_STEEL_ROUGH, COVER_STEEL_SPEC))
    M_RECESS = hazed(plain_material("CTX_cover_recess", COVER_RECESS, rough=0.9))
    prop_mats = {m.name: m for m in bpy.data.materials if m.library is not None and m.name.startswith("ctx_prop_")}
    M_PROP = {}
    for nm, m in prop_mats.items():
        c = m.copy(); c.name = "CTX_" + nm[4:]; M_PROP[nm] = hazed(c)
    # ---- the geometry
    def turned(parts, cx, cy, deg):
        # the parts' vertices turned about the vertical through (cx, cy)
        c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
        return [([(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c, z) for x, y, z in V], F, U) for V, F, U in parts]
    def frustum(cx, cy, z0, z1, r0, r1, n):
        # a tapered post: an n-sided tube from radius r0 at z0 to r1 at z1, capped
        ring0 = [(cx + r0 * math.cos(2 * math.pi * i / n), cy + r0 * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
        ring1 = [(cx + r1 * math.cos(2 * math.pi * i / n), cy + r1 * math.sin(2 * math.pi * i / n), z1) for i in range(n)]
        V = ring0 + ring1; F = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        F.append(tuple(range(n, 2 * n))); F.append(tuple(reversed(range(n))))
        return V, F, [(0.0, 0.0)] * len(V)
    def tall_post(name, x, y, h, paint, turn):
        # the flange and the pole in the paint, the bar and its two luminaires in the head's: one mesh, two slots.
        # The pole starts inside the flange and the luminaires straddle the bar, so no two faces share a plane
        z_top = Z_GROUND + h; r0, r1 = POST_TALL_R; fr, fh = POST_FLANGE
        pole = [frustum(x, y, z_foot, Z_GROUND + fh, fr, fr, POST_TALL_SIDES), frustum(x, y, Z_GROUND + fh - 0.02, z_top, r0, r1, POST_TALL_SIDES)]
        L, br = POST_BAR / 2.0, POST_BAR_R; la, lc, lh = POST_LUM
        head = [box(x - L, x + L, y - br, y + br, z_top - 2.0 * br, z_top)]
        for sgn in (-1.0, 1.0):
            hx = x + sgn * (L - la / 2.0)
            head.append(box(hx - la / 2.0, hx + la / 2.0, y - lc / 2.0, y + lc / 2.0, z_top - 0.02 - lh, z_top - 0.02))
        return mesh_of(name, pole + turned(head, x, y, turn), [M_PAINT[paint], M_PAINT["head"]], slots=[0] * len(pole) + [1] * len(head))
    def place_prop(name, x, y, prop, turn, height=None):
        # a library prop on the pavement: a local object sharing the linked mesh, the scene's hazed material copies as
        # object-level slots, scaled to a height if one is given, else the model's own
        assert prop in PROPS, f"the context library has no ctx_prop_{prop}: rebuild it with build_context.py"
        me = PROPS[prop]; s = 1.0 if height is None else height / me["height"]
        ob = bpy.data.objects.new(name, me); ctx.objects.link(ob)
        ob.location = (x, y, Z_GROUND); ob.scale = (s, s, s); ob.rotation_euler = (0.0, 0.0, math.radians(turn))
        for slot, lm in zip(ob.material_slots, me.materials):
            slot.link = 'OBJECT'; slot.material = M_PROP[lm.name]
        return ob
    def cover(name, x, y, along, across, turn):
        # the frame, a rim wider than the plate all round and 1 mm proud, and the plate inside it, 3 mm proud
        pf, pp = COVER_PROUD; rim = COVER_RIM
        frame = box(x - along / 2.0 - rim, x + along / 2.0 + rim, y - across / 2.0 - rim, y + across / 2.0 + rim, Z_GROUND - COVER_DEPTH, Z_GROUND + pf)
        plate = box(x - along / 2.0, x + along / 2.0, y - across / 2.0, y + across / 2.0, Z_GROUND - COVER_DEPTH + 0.005, Z_GROUND + pp)
        return mesh_of(name, turned([frame, plate], x, y, turn), [M_RECESS, M_COVER], slots=[0, 1])
    for name, x, y, kind, paint, h, turn in LAMP_POSTS:
        if kind == "tall": tall_post(name, x, y, h, paint, turn)
        else: place_prop(name, x, y, kind, turn, h)
    n_fur["posts"] = len(LAMP_POSTS)
    for k, (x, y, along, across, turn) in enumerate(COVERS): cover(f"ctx_cover_{k + 1:02d}", x, y, along, across, turn)
    n_fur["covers"] = len(COVERS)
    tall = [p for p in LAMP_POSTS if p[3] == "tall"]
    print(f"the street furniture: {len(tall)} high-mast posts of {' and '.join(f'{p[5]:.1f}' for p in tall)} m and "
          f"{len(LAMP_POSTS) - len(tall)} lantern post from the library ({', '.join(sorted(PROPS))}), {n_fur['covers']} vault covers on "
          f"the block's pavement; no drains, no hydrant (the photo has none); every material hazed; built in {time.time() - t_fur:.2f} s")

# ---------------------------------------------------------------- cameras, film, and the render
CAM_CLIP = 2.0 * GND_FAR                        # every camera's far clip. Blender's default, 1000 m, cut the plain off at 1 km -- 0.6
                                                # degrees under the reference horizon, a band of sky between the ground and the
                                                # horizon that read as the plain ending (item 2, found by ray-casting the rows)
cams = {}
for nm, view in VIEWS.items():
    loc, tgt, lens = view[:3]
    cd = bpy.data.cameras.new(nm); cd.lens = lens; cd.clip_end = CAM_CLIP
    c = bpy.data.objects.new(nm, cd); S.collection.objects.link(c)
    c.location = Vector(loc)
    c.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if len(view) > 3: c["frame"] = list(view[3])
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

if WEAR != "off":
    wear_controls.apply(S, WEAR_MODE, WEAR_STRENGTHS)
bpy.ops.wm.save_as_mainfile(filepath=SCENE, compress=True, relative_remap=True)
print(f"SCENE SAVED {SCENE} | {len(VIEWS)} cameras: {', '.join(VIEWS)} | ground: {GROUND} | block: {BLOCK_KIND} | "
      f"wear: {WEAR}")

for nm in names:
    if nm not in cams: print(f"  no such view: {nm} (have {', '.join(VIEWS)})"); continue
    S.camera = cams[nm]; S.render.filepath = os.path.join(SHOTS, nm + ".png")
    fw, fh = cams[nm].get("frame", (16, 10)); S.render.resolution_y = int(S.render.resolution_x * fh / fw)
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"  {nm}: {time.time() - t:.0f}s -> {S.render.filepath}")
print("SCENE DONE")
