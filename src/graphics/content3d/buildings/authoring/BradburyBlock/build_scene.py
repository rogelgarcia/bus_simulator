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
# which is what puts the base at the right height and in the right perspective. ground=street (the default) lays the
# real ground and leaves the catcher beyond its edge; ground=catch keeps only the catcher, over the map's own road;
# ground=none is the bare block.
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
# The sky is TURNED 250 degrees by default, and that is a composition choice, not a whim. An environment texture is a
# picture at infinity: everything in it keeps a fixed angular size and never shifts as the camera moves, so a 5.5 m
# sapling that stood 5.8 m from this map's tripod fills 49.6 degrees of sky while the whole 20.5 m block fills 29.8
# from st_corner -- it towers over the building like a 35 m tree (user 2026-09-20: "the tree behind the building, it is
# giant"). Nothing can scale it; only the map's own clean stretch -- the open field its camera looked across -- can be
# turned to stand behind the block instead. A sweep of the whole circle (sweep_rot.py in the scratchpad, one scene
# opened once and only this rotation changed between frames) put that window at 250 to 262 degrees for st_corner,
# which is 65.5 degrees wide, and at 245 or less for st_along; 250 is where all five views agree. It also lands the
# map's sun at azimuth 33.9 as hdri_sun_direction reads it -- over Broadway's shoulder, so that facade is lit and 3rd
# Street's is in shade -- which is what makes the block read as standing on its ground. (That reading is mirrored,
# see the function: the map's sun really stands at 74. The lamp stays on the reading: a lamp on the photo's sun was
# tried on 2026-09-25 and the user had it reverted, "revert the illumination".) `rot=0 sun=0 hdri=1` gives the
# plain map back.
#
#   keys: hdri (strength, 0.75), rot (the map turned about z, degrees, 250), sun (a lamp's strength, 8, 0 = none),
#         sun_az / sun_el (where the lamp stands: map, the default, on the sky's sun as read below; or degrees from
#         +x and up, e.g. -60 / 45 for the photo's sun -- tried as the default on 2026-09-25, reverted by the user),
#         ground (street | catch | none), block (fixed | game: the untouched export, its own scene and shots),
#         wear (on | off | debug, see below), wear_<feature> (that wear feature's strength, 1 = its calibrated look,
#         0 = off), exposure, samples, pct, res, views listed by name (see VIEWS; ref_3q is the reference
#         photo's own stand and renders in its 3:2 frame).
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
HDRI_STRENGTH = float(args.get("hdri", 0.75))
HDRI_ROT = float(args.get("rot", 250.0))        # degrees about z: turns the whole sky, sun included (see the sweep below)
SUN = float(args.get("sun", 8.0))               # 0: the map lights the block by itself
SUN_AZ = args.get("sun_az", "map")              # 'map': the lamp on the sky's sun as read below; or degrees from +x
SUN_EL = float(args.get("sun_el", 45.0))        # its elevation when sun_az is a number
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
HDRI = os.path.join(ROOT, "assets", "public", "lighting", "hdri", "german_town_street_2k.hdr")
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

# ---------------------------------------------------------------- the ground: a shadow catcher, and a real street
# The block's own outline, as assemble_building.py lays it out, is the thing everything here is measured from: the
# pavement is that outline pushed out PAVE_W and filled (filled, not a ring, so it runs on under the walls and closes
# the floor of every recessed shopfront), its kerb drops PAVE_H to the roadway, the roadway is ST_W_EW or ST_W_NS
# wide kerb to kerb (3rd Street one car wide as the photo has it, Broadway wide),
# and the pavement on the far side of both streets carries on to the field's edge, where the map takes over. Every
# corner a street turns is a curb return (AI 574 item 3): the kerb line sweeps round in one arc of KERB_R, at the
# block's chamfer tangent to both streets so the pavement is widest there, as the reference has it; the kerb is a
# profile swept along that line -- a rolled top edge and the face, down to the asphalt -- and the far
# pavement is eight blocks with both streets running on between them, so their corners are curb returns too. Past
# GND_R there is no geometry at all, only the catcher: at that distance the map's own ground is a blur on the horizon
# and a seam in it does not read. The catcher lies just under the roadway, so in street mode it shows only out there;
# in catch mode it stands at the block's own pavement level instead and is the whole of the ground.
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
GND_R = 150.0                                   # the real ground's half extent
CATCH_R = 600.0                                 # the catcher's, under and beyond it
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

bpy.context.view_layer.update()   # a freshly linked object still carries the matrix_world it had in the library
bases = [min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.objects if o.type == 'MESH']
tops = [max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.objects if o.type == 'MESH']
on_ground = sum(1 for b in bases if abs(b - Z_GROUND) < 0.03)
print(f"the block reads {min(bases):.3f} at its lowest and {max(tops):.3f} at its highest, with {on_ground} parts "
      f"standing on {Z_GROUND}")
assert on_ground >= GND_MIN_PARTS, (f"only {on_ground} of the block's parts start at {Z_GROUND}: its base has moved, "
                                    f"and ground laid at that height would not meet it")

def ground_material(name, folder, mottle_m=0.0, mottle=0.0, grime=None):
    # the catalog's own maps, read the way the game reads them -- base colour, the packed AO / roughness / metal, and
    # the OpenGL normal -- tiled by the set's tileMeters over UVs that are metres. A 4 m tile over a street shows its
    # repeat from any wide lens, so a slow noise mottle_m across lifts and drops the tone by mottle, which breaks the
    # grid up without touching the surface itself. grime = (attribute, strength) darkens the base colour by strength
    # where a mesh's float attribute of that name reads 1 (the kerb's foot, the gutter pan).
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

gnd = bpy.data.collections.new("GROUND"); S.collection.children.link(gnd)
def ground_mesh(name, verts, faces, mat, uvs, slots=None, attrs=None, smooth=None):
    # uvs: a function of the vertex, or one pair per vertex; mat: one material or a list, with slots one index per
    # face; attrs: {name: one float per vertex}; smooth: the faces shaded smooth (the rest flat)
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
    ob = bpy.data.objects.new(name, me); gnd.objects.link(ob); return ob
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
        if turn <= 1e-6 or max(abs(v.x), abs(v.y)) > GND_R - 1.0: out.append((v.x, v.y)); continue
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
    # out to the field's edge (their edges lie on the plane the grid's border returns to, so nothing opens between
    # them; no wear, none reaches them)
    trenches = road_trenches(lanes); crossings = road_crossings(lanes)
    n = int(round(2.0 * ROAD_GRID_R / ROAD_GRID_M)); step = 2.0 * ROAD_GRID_R / n
    verts, tones, wears = [], [], []
    for j in range(n + 1):
        for i in range(n + 1):
            x, y = -ROAD_GRID_R + i * step, -ROAD_GRID_R + j * step
            z, tone, wear = road_height(x, y, lanes, trenches, crossings, pads); verts.append((x, y, z)); tones.append(tone); wears.append(wear)
    faces = [(j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i) for j in range(n) for i in range(n)]
    ground_mesh("scn_road", verts, faces, mat, FLAT, attrs={"ptone": tones, "wear": wears}, smooth=range(len(faces)))
    R, G = ROAD_GRID_R, GND_R
    ring = [rect(-G, G, -G, -R), rect(-G, G, R, G), rect(-G, -R, -R, R), rect(R, G, -R, R)]
    ground_mesh("scn_road_far", [(q[0], q[1], ROAD_Z) for r in ring for q in r], [tuple(range(4 * k, 4 * k + 4)) for k in range(4)],
                mat, FLAT, attrs={"ptone": [1.0] * 16, "wear": [0.0] * 16})
    zs = [v[2] for v in verts]
    print(f"the road: a {n}x{n} grid of {step:.2f} m cells over {2 * R:.0f} m, its surface from {min(zs) - ROAD_Z:+.3f} to "
          f"{max(zs) - ROAD_Z:+.3f} m about the plane, {sum(1 for t in tones if t < 0.999)} vertices on sunk or trenched "
          f"patches and {sum(1 for t in tones if t > 1.001)} on proud ones, {sum(1 for w in wears if w > 0.3)} worn past 0.3 "
          f"({len(crossings)} crossings); the flat field beyond to {G:.0f} m")

def kerbed_pavement(pname, kname, poly, mats):
    # a pavement filling an anticlockwise polygon whose corners are curb returns, and its kerb: the profile swept
    # round the kerb line, closed
    m_pave, m_kerb = mats
    K = fillet(poly, KERB_R, ARC_STEP); N = outward_normals(K); n, m = len(K), len(KERB_PROFILE)
    inset = KERB_ROUND + KERB_TOP_W                                   # the slabs end where the kerb's top begins
    top = [(K[i][0] - N[i].x * inset, K[i][1] - N[i].y * inset, Z_GROUND) for i in range(n)]
    ground_mesh(pname, top, [tuple(range(n))], m_pave, FLAT)          # its edge is where the rolled edge begins
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
    M_PAVE = ground_material("GND_pavement", "concrete_pavement", mottle_m=14.0, mottle=0.07)
    # the kerb: a concrete curb in the pavement's own light set (its face stands lighter than the asphalt as the
    # photo's does), poured in segments with joints, its foot grimed where the mesh's attribute reads
    M_KERB = kerb_material("GND_kerb")
    MATS = (M_PAVE, M_KERB)
    # every pavement as a rectangle (its corners round to KERB_R in _pad_dist): the block's and the eight far blocks'
    PADS = [(WX, EX, SY, NY), (WX, EX, -GND_R, Y0), (WX, EX, Y1, GND_R), (X1, GND_R, SY, NY), (-GND_R, X0, SY, NY),
            (X1, GND_R, -GND_R, Y0), (X1, GND_R, Y1, GND_R), (-GND_R, X0, Y1, GND_R), (-GND_R, X0, -GND_R, Y0)]
    road_mesh(M_ROAD, LANES, PADS)
    # The block's pavement is its kerb lines' rectangle, not the chamfered outline: at the chamfer the kerb sweeps
    # round in one arc tangent to both streets, so the pavement is widest there (5.9 m against PAVE_W), as the
    # reference has it; the arc still covers the chamfer's own corners with room to spare.
    kerbed_pavement("scn_pavement", "scn_kerb", rect(WX, EX, SY, NY), MATS)
    # Beyond the streets, eight blocks -- one across from each face, one in each diagonal quadrant -- with both
    # streets running on between them to the field's edge, so every corner that faces a crossing is a curb return.
    far = {"s": rect(WX, EX, -GND_R, Y0), "n": rect(WX, EX, Y1, GND_R), "e": rect(X1, GND_R, SY, NY),
           "w": rect(-GND_R, X0, SY, NY), "se": rect(X1, GND_R, -GND_R, Y0), "ne": rect(X1, GND_R, Y1, GND_R),
           "nw": rect(-GND_R, X0, Y1, GND_R), "sw": rect(-GND_R, X0, -GND_R, Y0)}
    for nm, poly in far.items(): kerbed_pavement("scn_pavement_far_" + nm, "scn_kerb_far_" + nm, poly, MATS)
    n_gnd = len(gnd.objects)
    print(f"the ground: a pavement {PAVE_W:.2f} m wide on a {PAVE_H * 100:.0f} cm kerb with a {KERB_ROUND * 100:.0f} cm "
          f"rolled edge, its corners curb returns of {KERB_R:.1f} m, roadways of {ST_W_EW:.1f} m (east-west) and {ST_W_NS:.1f} m (north-south), "
          f"and eight pavement blocks beyond them to {GND_R:.0f} m ({n_gnd} objects); the streets' far kerbs "
          f"at x {X0:.2f} / {X1:.2f}, y {Y0:.2f} / {Y1:.2f}")
if GROUND != "none":
    # Cycles renders a shadow catcher as whatever lies behind it, but still darkened by everything the block hides --
    # the sun and the sky both -- so the map's own road takes the block's shadow. In street mode it lies just under the
    # roadway and shows only past the real ground's edge; in catch mode it stands at the block's own pavement level
    # and is the only ground there is.
    z = ROAD_Z - 0.12 if GROUND == "street" else Z_GROUND      # under the road's deepest dip (item 19)
    cm = bpy.data.materials.new("GND_catcher"); cm.use_nodes = True
    cat = ground_mesh("scn_shadow_catcher", [(q[0], q[1], z) for q in rect(-CATCH_R, CATCH_R, -CATCH_R, CATCH_R)],
                      [(0, 1, 2, 3)], cm, FLAT)
    cat.is_shadow_catcher = True
    print(f"a shadow catcher at z {z:.3f} out to {CATCH_R:.0f} m: "
          + ("under the roadway, so it shows only past the real ground" if GROUND == "street"
             else "the block's own ground level, with the map's road showing through it"))

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
    # where the map's sun stands, as this scene has read it since 2026-09-20: the brightest texels averaged as
    # directions, u inverted as (atan2(y, -x) + pi) / 2pi and the map's z rotation applied after. That reading is
    # MIRRORED: Cycles maps u = 0.5 - atan2(y, x) / 2pi and its Mapping node turns the lookup, so a texel at azimuth
    # a is seen at a - rot, and this map's sun really stands at 74 where this returns 33.9 (verified by render, AI
    # 574 item 9). It is kept as it is on purpose: the lamp built on it is the light the scene has had all along, the
    # corrected lamp was reverted by the user (2026-09-25, "revert the illumination"), and the sky item replaces the
    # map and will place the lamp explicitly (sun_az / sun_el).
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
    if SUN_AZ.lower() == "map":
        lamp_dir, where = sun_dir, "on the map's sun as read above, for shadows crisper than a 2k map can throw by itself"
    else:
        # an explicit sun, degrees from +x and up: the photo's stands at about -60 / 45, high behind the reference
        # camera's left shoulder, so the block's shadow falls behind it. Tried as the default on 2026-09-25 (AI 574
        # item 9) and reverted the same day at the user's request; the sky item will bring it back with the new map.
        az, el = math.radians(float(SUN_AZ)), math.radians(SUN_EL)
        lamp_dir = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        where = f"at azimuth {float(SUN_AZ):.1f}, {SUN_EL:.1f} degrees up (sun_az / sun_el)"
    sd = bpy.data.lights.new("scene_sun", 'SUN'); sd.energy = SUN; sd.angle = math.radians(0.53)
    sun = bpy.data.objects.new("scene_sun", sd); S.collection.objects.link(sun)
    sun.rotation_euler = (-lamp_dir).to_track_quat('-Z', 'Y').to_euler()
    print(f"a sun lamp of {SUN:.1f} {where}")

# ---------------------------------------------------------------- cameras, film, and the render
cams = {}
for nm, view in VIEWS.items():
    loc, tgt, lens = view[:3]
    cd = bpy.data.cameras.new(nm); cd.lens = lens
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
