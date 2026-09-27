# Render the Bradbury render scene as a PORTRAIT FLYOVER for a phone (AI 574 item 30; user 2026-09-26: "create a
# flyover animation, vertical orientation for cellphone, fullHD ... blur the background a bit like the reference ...
# make poses that show the entire building, but also make some that show details, and one pose that shows bottom
# up ... one that shows the portal, in a way that we can see the door inside"). It opens the saved scene
# (bradbury_scene.blend, as render_wear.py does), adds its own camera, compositor and output settings in memory,
# renders the shots' frames as PNGs, and assembles them into one H.264 MP4 with Blender's own FFmpeg output; the scene
# file is never saved. Everything the scene holds -- the sky and sun, the film (AgX, the look, exposure 0), the block,
# the streets, the context -- renders exactly as the stills do.
#
#   blender -b -P render_flyover.py -- [shot=all|air,cornice,...] [frames=all|first,mid,last|<a>-<b>] [pct=100]
#                                      [engine=cycles|eevee] [samples=48] [blur=7] [debug=mask] [encode=1|0]
#                                      [skip=1|0] [check=1] [out=<frames dir>] [mp4=<file>] [expo=<shot>:<stops>,...]
#
#   blender -b -P render_flyover.py -- check=1                       the shots' framing, printed, no render
#   blender -b -P render_flyover.py -- frames=first,mid,last pct=25  every shot's first, middle and last frame at a quarter
#   blender -b -P render_flyover.py -- shot=portal frames=1-24       one shot's first second
#   blender -b -P render_flyover.py --                               every frame of every shot, then the MP4
#   blender -b -P render_flyover.py -- frames=none encode=1          the MP4 from the frames already on disk
#   blender -b -P render_flyover.py -- engine=eevee                  the whole flyover as a quick EEVEE preview (item 33; its own
#                                                                    frames folder and MP4, see THE EEVEE PREVIEW below)
#
# THE SHOTS (SHOTS below): six slow continuous camera moves of SECS seconds each at FPS, cut hard: the whole block
# from the air, descending from the south-south-east onto the reference stand's own framing; the cornice, top band
# and arched windows in a lateral dolly along the sunlit Broadway face; the fire escapes on the shaded 3rd Street
# face in a slow rise; the facade from a standing eye on Broadway's pavement tilting up to the cornice and the sky;
# the Broadway portal pushed into from the roadway, a little off its axis so the door inside the recess shows past
# the arch; and a closing pull-up from the reference framing, rising to 30 m over the crossing with the far context
# soft behind the block, which runs on for TAIL_SECS more at a creep. A pose is a function of the path parameter p in
# 0..1 returning (eye, aim) in world metres; the lens is full-frame equivalent on the frame's LONG side, as a phone's
# is (Blender's AUTO sensor fit puts the 36 mm sensor across the larger render dimension, the height here: a 24 mm
# lens sees 73.7 degrees tall and 45.9 wide at 1080 x 1920).
#
# THE TIMING (AI 574 item 32; user 2026-09-27: "on each pose it slows down towards the end, stretch the very end like
# 2 seconds almost stopped at the final position ... extend the length of the video if needed (it is needed)"). The
# path parameter was a symmetric smoothstep of time over 3 s shots (item 30); now every shot is SECS 5 s and
# decelerates into its end: the camera eases in briefly, over EASE_IN of the move's time, then slows
# on a power law whose exponent EASE_OUT_LAST sets -- the last 20% of the move's time covers 5% of its path -- so it
# visibly slows through the second half and all but settles before the cut. The closing shot then runs on for
# TAIL_SECS at a creep: a constant crawl over the last TAIL_SHARE of its path, so the video ends holding the final
# framing without freezing (a true hold would read as a stuck frame; a 1% creep over 2 s moves the block's edges by
# a few pixels). profile() integrates that velocity and hands each frame its p; the share of the path covered in
# each quarter of a shot's time is printed at the head of every run and by check=1.
#
# THE EXPOSURE PER SHOT (AI 574 item 35; user 2026-09-27: "quando for fazer a tomada na escada de incendio, aumente a
# exposicao em 1"). The fire-escape shot looks at the shaded 3rd Street face, dark by the sun's own geometry (the
# escape's iron read 14 on the film against the brick's 48, item 30), so EXPOSURE_BY_SHOT lifts that shot one stop
# over the scene's own exposure (0, item 1) and every other shot keeps the scene's. The value goes onto the scene's
# view transform for that shot's frames only and is put back before the next shot, in both engines; expo=<shot>:<stops>
# [,<shot>:<stops>] overrides the table for one run (how the item's 0-against-+1 stills were made). The encode reads
# display-referred PNGs on the Standard view and is untouched.
#
# THE BACKGROUND SOFTENED, as the photo's is. Not depth of field: a 40 mm lens at f/2 blurs nothing at these
# distances, and the photo's softness is not optical. A depth mask drives a Bokeh Blur in the compositor: the Depth
# pass mapped from BLUR_START_M past the block's farthest corner from the camera (set per frame, so the block is at
# 0 in every shot) to BLUR_FULL_M further out, softened by MASK_SOFT_PX (the pass is one sample a pixel, so its
# silhouette is aliased), times BLUR_PX into the blur's per-pixel size -- 0 on the block, at most BLUR_PX at the
# horizon at 1080 wide, so the trees, the lots and the skyline go a little soft while the block stays sharp. Not the
# Mist pass, which was the first design: a window pane passes a share of the camera's samples through to whatever
# lies behind, and the mist pass writes every hit weighted by its throughput, so it speckled on every pane (up to
# 0.45 with the mist starting past the block) and the panes would have shimmered under the blur from frame to
# frame; the Depth pass is written once, at the first hit whose alpha passes the film's threshold, and is 0 on the
# panes. The compositing node group is built here and assigned to the scene in memory; debug=mask renders the
# mask itself.
#
# THE EEVEE PREVIEW (AI 574 item 33; user 2026-09-27: "gere uma versao rapida (eevee is fine) para verificarmos").
# engine=eevee renders the same shots, timing, compositor, film and view transform on Blender's real-time engine
# (BLENDER_EEVEE in 5.2), so the whole 32 s cut can be judged in minutes before a Cycles run is started: EEVEE_SAMPLES
# TAA samples a frame, shadows on (EEVEE_SHADOW_RAYS rays a pixel, EEVEE_SHADOW_STEPS steps, the shadow maps' pool
# EEVEE_SHADOW_POOL MB for the thousands of crowns in the wide frames), screen-space ray tracing for the glass, the
# horizon scan for the ambient light, the world's sun disc extracted into a shadowing sun light (use_sun_shadow over
# EEVEE_SUN_THRESHOLD, so the map's sun throws a shadow here as it does in Cycles instead of lighting every shaded
# face from the light probe), and every local material with a Transparent BSDF -- the leaves, the fence lattice --
# set to cast its cut-out's shadow, not its card's. The Depth pass and the Bokeh Blur work as they do in Cycles. What
# Eevee renders DIFFERENTLY, so it is not judged on the preview: the haze (scn_haze reads the camera's distance and
# the sky map in the shader, which Eevee honours, but the light probe's sky under the hazed plain is flatter than
# Cycles' bounced light), the grime lines (the Ambient Occlusion node reads the horizon scan, a screen-space guess
# of the walls' occlusion, so the wall-base line and the kerb's dirt come and go with the framing), the glass (the
# window panes reflect the screen or the probe, not the real scene behind the camera), the block's own shading
# (no light bounced off the ground and the walls: the shaded 3rd Street face and the recesses read darker and
# flatter), the foliage's translucency, and the far tree lines' cut-outs at a few pixels (dithered, not
# integrated). And THE BLOCK IS THE UNTOUCHED EXPORT, without its wear layer: the worn block's materials read more
# named mesh attributes than an Eevee shader may ("uses too many attributes", GPU_MAX_ATTR 15; every one of them
# compiled to the error magenta and the whole block rendered pink, measured 2026-09-27), so engine=eevee opens the
# wear=off scene that build_scene.py writes beside the canonical one (blender -b -P build_scene.py -- wear=off:
# bradbury_scene_wear_off.blend, the same city, streets, sun and sky from the same seeds, the plain block linked
# instead of the worn one) unless scene= names another. The frames go to <out>/frames_eevee/<shot>/ and the MP4 to
# bradbury_flyover_eevee_preview.mp4, so nothing of the Cycles run is touched.
#
# RENDER MANAGEMENT. Frames go to <out>/<shot>/<shot>_NNNN.png; a frame already there is skipped (skip=1), so a
# crash loses nothing and the run resumes; persistent data keeps the scene on the device between frames (the first
# frame syncs in about 10 s; then a wide frame renders in 8-9 s at 64 samples and a close-up that fills the frame
# with the block's own shading in 13-17 s, measured 2026-09-26, which is why the 32 s cut of item 32 renders at
# SAMPLES 48: 64 would have run past two and a half hours); OptiX alone (repeatable), the OptiX denoiser, adaptive
# sampling as the scene has it. encode=1 assembles every shot's frames in SHOTS order
# into the MP4 through a sequencer-only scene (image strips, MPEG-4 container, H.264 at the HIGH constant-rate
# quality, no audio; the strips are display-referred PNGs, so that scene's view transform is Standard and nothing
# is graded twice). debug=mask writes the blur's mask as the image instead of the picture, the way to prove where
# the blur acts. check=1 projects the block's and the neighbour tower's corners into each shot's first, middle and
# last frame and prints where they land, with the camera's distance to the block and the blur's start: the way the
# shots were placed so the whole block fits and the tower stays out of the wide frames.
import bpy, os, sys, math, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
from wear import paths

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)

# ---------------------------------------------------------------- the shots
Z_GROUND, EYE = 0.201, 1.62                     # the block's ground (its sidewalk top) and a standing eye over it, as build_scene.py has them
FPS = int(args.get("fps", 24))                  # frames per second
SECS = float(args.get("secs", 5.0))             # every shot's move, seconds (3 until item 32: the user asked for the length, so the
                                                # deceleration is not squeezed into the old three)
TAIL_SECS = 2.0                                 # the closing shot runs on this much longer, all but stopped at its final position (item 32)
WIDTH, HEIGHT = 1080, 1920                      # portrait full HD
BLOCK = ((-36.88, -18.74, 0.13), (17.85, 18.23, 20.77))   # the block's bounding box in the scene (its cornice overhangs the outline)
TOWER = ((42.5, -17.0, 0.15), (68.5, -4.49, 39.8))        # the neighbour tower's (build_scene.py's neighbour section)
CORNER = (15.58, -16.46)                        # the chamfer's midpoint: the reference stand's pivot, 44.5 m off at azimuth -30
REF_EYE = (54.12, -38.71, Z_GROUND + 14.4)      # the reference photo's own stand (VIEWS["ref_3q"]) ...
REF_AIM = (17.48, -13.17, 9.76)                 # ... and its aim
WALL_E, WALL_S = 17.0, -17.9                    # the Broadway (east) face's plane and 3rd Street's (south)
PORTAL = (15.0, 0.88, 2.2)                      # the Broadway portal's door: 2 m inside the arch (its opening y -0.73..2.49, z 2.47..4.48), the
                                                # four leaves at x 15.0, y -0.62..2.38, z 0.32..2.82 with a transom to 4.05
DOOR = ((14.98, -0.62, 0.32), (15.08, 2.38, 2.82))        # those leaves' box, for check=1's door reading
ESCAPE_X = 3.9                                  # the eastern fire escape on 3rd Street's face: x 2.56..5.26, z 2.4..13.64
CORNICE_Z = 19.6                                # the crown: its mouldings z 19.1-20.7, the arched windows' archivolts 18.05-18.9 below it
# the timing profile (item 32): a short ease-in, a long hard ease-out, and the closing shot's creeping tail
EASE_IN = 0.10                                  # the share of a move's time spent accelerating from rest (a smoothstep of the velocity)
EASE_OUT_LAST = (0.20, 0.05)                    # the deceleration: the last 20% of a move's time covers 5% of its path -- an ease-out
                                                # p = 1 - (1 - x)^POW of the move's time x, POW solved below (1.86 for the bare power
                                                # law; 1.90 once the ease-in's share is taken out of the whole)
TAIL_SHARE = 0.01                               # the tail's share of the closing shot's path: a constant crawl over the last 1%
PROFILE_STEPS = 4000                            # the velocity's integration steps over a move
def move_cumulative(pow_):
    # the move's path against its time, 0..1 in PROFILE_STEPS steps, normalised: the velocity is smoothstep(x /
    # EASE_IN) times the power law's (1 - x)^(pow_ - 1), integrated by the trapezoid rule
    def w(x):
        r = min(1.0, x / EASE_IN); return r * r * (3.0 - 2.0 * r) * (1.0 - x) ** (pow_ - 1.0)
    cum, acc = [0.0], 0.0
    for i in range(PROFILE_STEPS):
        acc += 0.5 * (w(i / PROFILE_STEPS) + w((i + 1) / PROFILE_STEPS)) / PROFILE_STEPS; cum.append(acc)
    return [c / acc for c in cum]
def solve_pow():
    # the exponent at which the last EASE_OUT_LAST[0] of the move's time covers EASE_OUT_LAST[1] of its path, by
    # bisection (the share falls as the exponent rises)
    lo, hi = 1.0, 6.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        last = 1.0 - move_cumulative(mid)[int(round((1.0 - EASE_OUT_LAST[0]) * PROFILE_STEPS))]
        lo, hi = (mid, hi) if last > EASE_OUT_LAST[1] else (lo, mid)
    return 0.5 * (lo + hi)
EASE_OUT_POW = solve_pow()
def profile(n, n_move):
    # the path parameter of each of a shot's n frames, 0 to 1: the eased move over its first n_move frames, then, if
    # the shot has a tail, the creep over the rest; the move takes its share of the path (1, or 1 - TAIL_SHARE before
    # a tail), the tail's p runs linearly from there to 1
    cum = move_cumulative(EASE_OUT_POW)
    share = 1.0 - TAIL_SHARE if n > n_move else 1.0
    ps = []
    for k in range(n):
        if k < n_move:
            x = k / max(1, n_move - 1) * PROFILE_STEPS; i = min(PROFILE_STEPS - 1, int(x)); f = x - i
            ps.append(share * (cum[i] + (cum[i + 1] - cum[i]) * f))
        else:
            ps.append(share + TAIL_SHARE * (k - n_move + 1) / (n - n_move))
    return ps
def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def orbit(az, r, z):                            # a point r out from the chamfer's midpoint at azimuth az (degrees from +x), z up
    return (CORNER[0] + r * math.cos(math.radians(az)), CORNER[1] + r * math.sin(math.radians(az)), z)
def up_pose(t):
    # a standing eye on Broadway's pavement 3.8 m from the wall, rising a little as it tilts from 58 to 68 degrees up
    z = Z_GROUND + EYE + 0.5 * t; tilt = math.radians(58.0 + 10.0 * t)
    return (20.8, -6.0, z), (WALL_E, -6.0, z + 3.8 * math.tan(tilt))
# (name, lens mm, pose(p) -> (eye, aim), tail seconds). The wide shots keep the neighbour tower out of the frame (check=1). The
# approach comes in from the south-south-east, where the tower lies right of the frame's edge all the way in, and
# ends on the reference stand's own framing: on the stand the tower clears the frame by 27 degrees and the whole
# block fills 42 of the frame's 46, and that stand is the one pose on its axis that does both -- further back or
# higher (a steeper tilt) the tower's base corner enters the frame's right edge, nearer the block overflows the
# width. The close is the brief's other option, a pull-up from that framing, swinging south as it rises so the
# tower's bearing keeps clear of the frame while the tilt steepens.
SHOTS = [
    ("air", 24, lambda t: (lerp((36.0, -103.0, 60.0), REF_EYE, t), lerp((-17.0, -2.0, 8.0), REF_AIM, t)), 0.0),
    ("cornice", 50, lambda t: (lerp((31.0, -8.0, CORNICE_Z), (31.0, -2.0, CORNICE_Z), t), lerp((WALL_E, -8.0, CORNICE_Z - 1.6), (WALL_E, -2.0, CORNICE_Z - 1.6), t)), 0.0),
    ("escapes", 40, lambda t: (lerp((ESCAPE_X, -32.0, 4.0), (ESCAPE_X, -32.0, 9.0), t), lerp((ESCAPE_X, WALL_S, 6.0), (ESCAPE_X, WALL_S, 10.5), t)), 0.0),
    ("up", 24, up_pose, 0.0),
    ("portal", 35, lambda t: (lerp((29.2, 4.4, 2.2), (25.2, 3.0, 1.9), t), lerp(PORTAL, (PORTAL[0], PORTAL[1], 2.4), t)), 0.0),
    ("close", 24, lambda t: (orbit(-30.0 - 12.0 * t, 44.5 + 5.5 * t, 14.6 + 15.4 * t), lerp(REF_AIM, (-4.5, -1.5, 8.0), t)), TAIL_SECS),
]
N_MOVE = int(round(SECS * FPS))                 # frames of a move
def n_frames(shot): return N_MOVE + int(round(shot[3] * FPS))   # a shot's frames: its move and its tail
P = {s[0]: profile(n_frames(s), N_MOVE) for s in SHOTS}         # every frame's path parameter, by shot
# the exposure per shot, stops over the scene's own (THE EXPOSURE PER SHOT above); expo=<shot>:<stops>,... overrides
EXPOSURE_BY_SHOT = {"escapes": 1.0}
for tok in args.get("expo", "").split(","):
    if ":" in tok:
        k, v = tok.split(":", 1); assert k in {s[0] for s in SHOTS}, f"expo: no such shot {k}"; EXPOSURE_BY_SHOT[k] = float(v)
EXPOSURE_BY_SHOT = {k: v for k, v in EXPOSURE_BY_SHOT.items() if v != 0.0}
def quarters(name):
    # the share of the path covered in each quarter of the shot's time, the last fifth of its move, and its tail
    ps, n = P[name], n_frames(next(s for s in SHOTS if s[0] == name))
    at = lambda u: ps[min(n - 1, int(round(u * (n - 1))))]
    q = [at((i + 1) / 4.0) - at(i / 4.0) for i in range(4)]
    last_fifth = ps[N_MOVE - 1] - ps[int(round(0.8 * (N_MOVE - 1)))]
    return q, last_fifth, (ps[-1] - ps[N_MOVE - 1]) if n > N_MOVE else 0.0
print(f"PROFILE ease-in over {EASE_IN:.2f} of a move, ease-out exponent {EASE_OUT_POW:.3f} (the last {EASE_OUT_LAST[0]:.0%} of a move's time "
      f"covers {EASE_OUT_LAST[1]:.0%} of its path), the closing tail {TAIL_SECS:g} s over the last {TAIL_SHARE:.0%}")
for s in SHOTS:
    q, lf, tail = quarters(s[0])
    print(f"PROFILE {s[0]:8s} {n_frames(s):4d} frames: path per quarter of its time {q[0]:.3f} {q[1]:.3f} {q[2]:.3f} {q[3]:.3f}; "
          f"the last fifth of the move {lf:.3f}" + (f"; the tail's {n_frames(s) - N_MOVE} frames {tail:.3f}" if tail else "")
          + (f"; exposure {EXPOSURE_BY_SHOT[s[0]]:+.1f} over the scene's" if s[0] in EXPOSURE_BY_SHOT else ""))
# the softening
BLUR_PX = float(args.get("blur", 0.0))          # the Bokeh Blur's size where the mask is 1, pixels at 1080 wide (scaled with pct);
                                                # 0 since AI 574 item 36 (user 2026-09-27: the softened background "is giving the
                                                # impression of a maquete"); blur=7 gives the earlier look back
BLUR_START_M = 2.0                              # the mask starts this far past the block's farthest corner from the camera
BLUR_FULL_M = 400.0                             # and is 1 this much further out: 500-600 m from the stands, the tree lines and lots
MASK_SOFT_PX = 2.0                              # the mask blurred by this much: the Depth pass is one sample a pixel, its edge aliased
BOKEH_FLAPS, BOKEH_ROUND = 6, 0.6               # the bokeh shape: a rounded hexagon
# the render
ENGINE = args.get("engine", "cycles").lower()   # cycles: the flyover as shipped; eevee: the quick preview (THE EEVEE PREVIEW above)
assert ENGINE in ("cycles", "eevee"), f"engine: cycles | eevee, not {ENGINE}"
EEVEE_SAMPLES = 8                               # the preview's TAA samples a frame (samples= overrides, as it does Cycles' 48). The
                                                # samples are the cost, not the pixels: measured 2026-09-27 on the approach's frame 60,
                                                # 3.1 s at 50% with 12, 7.1 s with 24, 5.5 s at full size with 12 (the portal 4.6 s at
                                                # 50% with 12); at 50% and 8 the 768 frames fit the half hour asked for
EEVEE_SHADOW_RAYS, EEVEE_SHADOW_STEPS = 2, 6    # the shadows' rays a pixel and steps a ray: the sun's soft edge without noise
EEVEE_SHADOW_POOL = '1024'                      # the shadow maps' pool, MB: the wide frames hold thousands of crowns
EEVEE_SUN_THRESHOLD = 10.0                      # the world's texels over this luminance become a shadowing sun light: the map's disc
                                                # (its peak is over 1e5) and nothing of its sky (under 2)
PCT = int(args.get("pct", 100))
SAMPLES = int(args.get("samples", 48 if ENGINE == "cycles" else EEVEE_SAMPLES))   # 64 until item 32 lengthened the cut (see RENDER MANAGEMENT above)
FLY = os.path.join(paths.ROOT, "tests", "artifacts", "screens", "bradbury_scene", "flyover")
OUT = os.path.abspath(args.get("out", os.path.join(FLY, "frames" if ENGINE == "cycles" else "frames_eevee")))
MP4 = os.path.abspath(args.get("mp4", os.path.join(os.path.dirname(OUT), "bradbury_flyover_portrait_1080x1920.mp4" if ENGINE == "cycles"
                                                    else "bradbury_flyover_eevee_preview.mp4")))

# ---------------------------------------------------------------- the scene, in memory only
scene_file = args.get("scene") or os.path.join(paths.ART, "bradbury_scene.blend" if ENGINE == "cycles" else "bradbury_scene_wear_off.blend")
assert os.path.isfile(scene_file), (f"no scene at {scene_file}" + (": build it with  blender -b -P build_scene.py -- wear=off  (THE EEVEE PREVIEW above)"
                                                                     if ENGINE == "eevee" and "scene" not in args else ""))
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(scene_file))
print(f"SCENE {scene_file} on {ENGINE}")
S = bpy.context.scene
# the composing-only shelf: the context library's prototypes stand at the origin, inside the block; the collection
# is already hidden from the render, and the view layer excludes it here too
shelf = bpy.data.collections.get("CONTEXT_LIBRARY")
if shelf is not None:
    shelf.hide_render = True
    def exclude(lc):
        if lc.name == "CONTEXT_LIBRARY": lc.exclude = True
        for c in lc.children: exclude(c)
    exclude(bpy.context.view_layer.layer_collection)
cd = bpy.data.cameras.new("fly_cam"); cd.clip_end = max(o.data.clip_end for o in bpy.data.objects if o.type == 'CAMERA')   # the ground runs kilometres
cd.sensor_fit = 'AUTO'; cd.sensor_width = 36.0
cam = bpy.data.objects.new("fly_cam", cd); S.collection.objects.link(cam); S.camera = cam
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = WIDTH, HEIGHT, PCT
S.render.fps, S.render.fps_base = FPS, 1.0
S.render.use_persistent_data = True
if ENGINE == "cycles":
    S.cycles.samples = SAMPLES; S.cycles.use_denoising = True
    try: S.cycles.denoiser = 'OPTIX'
    except Exception: pass
    try:   # OptiX alone: repeatable frame to frame (render_wear.py's note on hybrid rendering)
        cp = bpy.context.preferences.addons["cycles"].preferences; cp.compute_device_type = "OPTIX"; cp.get_devices()
        for d in cp.devices: d.use = d.type == 'OPTIX'
        S.cycles.device = 'GPU'
    except Exception:
        S.cycles.device = 'CPU'
else:
    # the Eevee preview (THE EEVEE PREVIEW above): the engine, its samples, its shadows, its ray tracing and horizon
    # scan; the world's sun disc extracted into a shadowing light; every local cut-out material shadowing as a cut-out
    S.render.engine = 'BLENDER_EEVEE'
    ee = S.eevee; ee.taa_render_samples = SAMPLES
    ee.use_shadows = True; ee.shadow_ray_count = EEVEE_SHADOW_RAYS; ee.shadow_step_count = EEVEE_SHADOW_STEPS; ee.shadow_resolution_scale = 1.0
    try: ee.shadow_pool_size = EEVEE_SHADOW_POOL
    except Exception: ee.shadow_pool_size = int(EEVEE_SHADOW_POOL)
    ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
    ee.use_fast_gi = True; ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
    if S.world is not None:
        S.world.use_sun_shadow = True; S.world.sun_threshold = EEVEE_SUN_THRESHOLD; S.world.sun_angle = math.radians(0.53)
    n_cut = 0
    for m in bpy.data.materials:
        if m.library is None and m.node_tree is not None and any(n.type == 'BSDF_TRANSPARENT' for n in m.node_tree.nodes):
            m.surface_render_method = 'DITHERED'; m.use_transparent_shadow = True; n_cut += 1
    print(f"EEVEE: {SAMPLES} samples a frame, shadows {EEVEE_SHADOW_RAYS} rays x {EEVEE_SHADOW_STEPS} steps in a {EEVEE_SHADOW_POOL} MB pool, screen-space "
          f"ray tracing, the horizon scan, the world's sun over {EEVEE_SUN_THRESHOLD:g} as a shadowing light, {n_cut} cut-out materials shadowing as cut-outs")
S.render.image_settings.media_type = 'IMAGE'; S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_depth = '8'
# the compositor: Render Layers' Depth mapped to the mask, softened, times BLUR_PX into the Bokeh Blur's per-pixel size
vl = bpy.context.view_layer; vl.use_pass_z = True
ng = bpy.data.node_groups.new("FLY_comp", 'CompositorNodeTree')
ng.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
rl = ng.nodes.new('CompositorNodeRLayers'); rl.scene = S; rl.layer = vl.name; rl.location = (-900, 0)
mask = ng.nodes.new('ShaderNodeMapRange'); mask.name = mask.label = "FLY_mask"; mask.clamp = True; mask.location = (-600, 200)
mask.inputs["To Min"].default_value = 0.0; mask.inputs["To Max"].default_value = 1.0       # From Min / Max are set per frame
soft = ng.nodes.new('CompositorNodeBlur'); soft.name = soft.label = "FLY_mask_soft"; soft.location = (-400, 200)
soft.inputs["Size"].default_value = (MASK_SOFT_PX * PCT / 100.0,) * 2     # a 2D size in pixels; the type stays Gaussian
px = ng.nodes.new('ShaderNodeMath'); px.operation = 'MULTIPLY'; px.name = px.label = "FLY_blur_px"; px.location = (-200, 200)
px.inputs[1].default_value = BLUR_PX * PCT / 100.0
bokeh = ng.nodes.new('CompositorNodeBokehImage'); bokeh.location = (-300, -300)
bokeh.inputs["Flaps"].default_value = BOKEH_FLAPS; bokeh.inputs["Roundness"].default_value = BOKEH_ROUND
blur = ng.nodes.new('CompositorNodeBokehBlur'); blur.location = (0, 0)
gout = ng.nodes.new('NodeGroupOutput'); gout.location = (300, 0)
ng.links.new(rl.outputs["Depth"], mask.inputs["Value"]); ng.links.new(mask.outputs["Result"], soft.inputs["Image"])
ng.links.new(soft.outputs["Image"], px.inputs[0]); ng.links.new(px.outputs["Value"], blur.inputs["Size"])
ng.links.new(rl.outputs["Image"], blur.inputs["Image"]); ng.links.new(bokeh.outputs["Image"], blur.inputs["Bokeh"])
if args.get("debug") == "mask": ng.links.new(soft.outputs["Image"], gout.inputs["Image"])
else: ng.links.new(blur.outputs["Image"], gout.inputs["Image"])
S.compositing_node_group = ng; S.render.use_compositing = BLUR_PX > 0.0 or args.get("debug") == "mask"

def corners(bb):
    lo, hi = bb
    return [Vector((x, y, z)) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
def pose(shot, k):
    # the camera at frame k (1..n) of a shot: its eye and aim at the frame's path parameter
    name, lens, fn = shot[:3]
    eye, aim = fn(P[name][k - 1])
    cd.lens = lens; cam.location = Vector(eye)
    cam.rotation_euler = (Vector(aim) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    far = max((Vector(eye) - c).length for c in corners(BLOCK))
    mask.inputs["From Min"].default_value = far + BLUR_START_M; mask.inputs["From Max"].default_value = far + BLUR_START_M + BLUR_FULL_M
    return eye, aim, far

def frame_list(spec, n):
    if spec == "none": return []
    if spec == "all": return list(range(1, n + 1))
    if "-" in spec and "," not in spec:
        a, b = spec.split("-"); return list(range(int(a), int(b) + 1))
    named = {"first": 1, "mid": (n + 1) // 2, "last": n}
    return [named[s] if s in named else int(s) for s in spec.split(",") if s]

if args.get("check") == "1":
    bpy.context.view_layer.update()
    for shot in SHOTS:
        n = n_frames(shot)
        print(f"--- {shot[0]}: {shot[1]} mm, {n} frames")
        for k in (1, (n + 1) // 2, n):
            eye, aim, far = pose(shot, k); bpy.context.view_layer.update()
            def span(bb):
                pts = [world_to_camera_view(S, cam, c) for c in corners(bb)]
                front = [p for p in pts if p.z > 0.0]
                if not front: return "behind the camera"
                return (f"x {min(p.x for p in front):6.3f}..{max(p.x for p in front):6.3f}  y {1 - max(p.y for p in front):6.3f}..{1 - min(p.y for p in front):6.3f}"
                        + ("" if len(front) == 8 else f"  ({8 - len(front)} corners behind)"))
            print(f"  frame {k:3d} (p {P[shot[0]][k - 1]:.3f}): eye ({eye[0]:6.1f}, {eye[1]:6.1f}, {eye[2]:5.1f}) aim ({aim[0]:6.1f}, {aim[1]:6.1f}, {aim[2]:5.1f}); "
                  f"block {span(BLOCK)}; tower {span(TOWER)}; block's far corner {far:.0f} m, blur from {far + BLUR_START_M:.0f} to {far + BLUR_START_M + BLUR_FULL_M:.0f} m"
                  + (f"; door {span(DOOR)}" if shot[0] == "portal" else ""))
    print("CHECK DONE"); sys.stdout.flush()
    raise SystemExit

# ---------------------------------------------------------------- the frames
want = args.get("shot", "all")
shots = SHOTS if want == "all" else [s for s in SHOTS if s[0] in want.split(",")]
assert shots, f"no such shot: {want} (have {', '.join(s[0] for s in SHOTS)})"
skip = args.get("skip", "1") == "1"
BASE_EXPOSURE = S.view_settings.exposure        # the scene's own (0, item 1); a shot's EXPOSURE_BY_SHOT goes on top of it
t_all, n_done, n_skip, frames = time.time(), 0, 0, []
for shot in shots:
    d = os.path.join(OUT, shot[0]); os.makedirs(d, exist_ok=True)
    n = n_frames(shot); frames = frame_list(args.get("frames", "all"), n)
    expo = EXPOSURE_BY_SHOT.get(shot[0], 0.0); S.view_settings.exposure = BASE_EXPOSURE + expo
    for k in frames:
        fp = os.path.join(d, f"{shot[0]}_{k:04d}.png")
        if skip and os.path.isfile(fp): n_skip += 1; continue
        eye, aim, far = pose(shot, k)
        S.render.filepath = fp
        t = time.time(); bpy.ops.render.render(write_still=True); n_done += 1
        print(f"FRAME {shot[0]} {k:4d}/{n}  {time.time() - t:5.1f} s  p {P[shot[0]][k - 1]:.3f}  eye ({eye[0]:.1f}, {eye[1]:.1f}, {eye[2]:.1f}) blur from {far + BLUR_START_M:.0f} m"
              + (f"  exposure {expo:+.1f}" if expo else "") + f" -> {fp}")
        sys.stdout.flush()
    S.view_settings.exposure = BASE_EXPOSURE
if frames:
    print(f"FRAMES DONE: {n_done} rendered, {n_skip} already there, {S.render.resolution_x * PCT // 100}x{S.render.resolution_y * PCT // 100} "
          f"{ENGINE} {SAMPLES} {'spp' if ENGINE == 'cycles' else 'samples'}, blur {BLUR_PX:g} px, {(time.time() - t_all) / 60.0:.1f} min "
          f"({(time.time() - t_all) / max(1, n_done):.1f} s a frame)")
    sys.stdout.flush()

# ---------------------------------------------------------------- the MP4
if args.get("encode", "1" if want == "all" and args.get("frames", "all") in ("all", "none") and PCT == 100 else "0") == "1":
    E = bpy.data.scenes.new("FLY_encode")
    E.render.engine = 'BLENDER_WORKBENCH'                  # never used: the sequencer's strips cover every frame
    E.render.resolution_x, E.render.resolution_y, E.render.resolution_percentage = WIDTH * PCT // 100, HEIGHT * PCT // 100, 100
    E.render.fps, E.render.fps_base = FPS, 1.0
    E.view_settings.view_transform = 'Standard'          # the frames are graded already
    try: E.view_settings.look = 'None'
    except Exception: pass
    se = E.sequence_editor_create(); cursor, total = 1, 0
    for shot in SHOTS:
        d = os.path.join(OUT, shot[0])
        files = sorted(f for f in os.listdir(d) if f.startswith(shot[0] + "_") and f.endswith(".png")) if os.path.isdir(d) else []
        assert len(files) == n_frames(shot), f"{shot[0]}: {len(files)} frames of {n_frames(shot)} in {d}"
        st = se.strips.new_image(name=shot[0], filepath=os.path.join(d, files[0]), channel=1, frame_start=cursor)
        for f in files[1:]: st.elements.append(f)
        cursor += len(files); total += len(files)
    E.frame_start, E.frame_end = 1, total
    E.render.use_sequencer = True; E.render.use_compositing = False
    E.render.image_settings.media_type = 'VIDEO'; E.render.image_settings.file_format = 'FFMPEG'
    ff = E.render.ffmpeg
    ff.format = 'MPEG4'; ff.codec = 'H264'; ff.constant_rate_factor = 'HIGH'; ff.ffmpeg_preset = 'GOOD'
    ff.audio_codec = 'NONE'; ff.gopsize = FPS
    os.makedirs(os.path.dirname(MP4), exist_ok=True); E.render.filepath = MP4
    t = time.time(); bpy.ops.render.render(animation=True, scene=E.name)
    print(f"MP4 DONE: {total} frames of {len(SHOTS)} shots, {total / FPS:.1f} s at {FPS} fps, H.264 {ff.constant_rate_factor}, no audio, "
          f"{os.path.getsize(MP4) / 1e6:.1f} MB in {time.time() - t:.0f} s -> {MP4}")
    sys.stdout.flush()
print("FLYOVER DONE")
