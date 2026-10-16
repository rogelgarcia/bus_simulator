# render_flyover.py -- Terra & Mar in the Bradbury's city as a PORTRAIT FLYOVER for a phone (2026-10-16; user: "render
# the video pass, just like the bradbury"). A copy of BradburyBlock/render_flyover.py (AI 574 items 30-36), adapted:
# the same 1080 x 1920 frame, timing profile, per-shot exposure, optional depth-masked background blur (off, as the
# Bradbury's ended), EEVEE preview, skip-if-exists frames and the sequencer H.264 encode -- only the scene, the shots
# and the output paths are Terra & Mar's. It opens the city copy (build_city_scene.py -> city_common.CITY_BLEND),
# adds its own camera, compositor and output settings in memory and never saves the scene.
#
#   blender -b -P render_flyover.py -- [shot=all|air,facade,...] [frames=all|first,mid,last|<a>-<b>] [pct=100]
#                                      [engine=cycles|eevee] [samples=48] [blur=0] [debug=mask] [encode=1|0]
#                                      [skip=1|0] [check=1] [out=<frames dir>] [mp4=<file>] [expo=<shot>:<stops>,...]
#
#   blender -b -P render_flyover.py -- check=1                       the shots' framing, printed, no render
#   blender -b -P render_flyover.py -- frames=first,mid,last pct=25  every shot's first, middle and last frame at a quarter
#   blender -b -P render_flyover.py --                               every frame of every shot, then the MP4
#   blender -b -P render_flyover.py -- frames=none encode=1          the MP4 from the frames already on disk
#   blender -b -P render_flyover.py -- engine=eevee                  a quick EEVEE preview (own frames folder and MP4)
#
# THE SHOTS (SHOTS below), written in the Terra & Mar frame (front run A faces -Y; city_common.to_world maps them onto
# the Bradbury's site, where the front faces east onto Broadway, sunlit): the building from the air, descending from
# the front-right onto the hero framing; a lateral dolly along the front at balcony height (planters, guards, teak
# soffits); a standing eye on the forecourt tilting up the front; a push-in on the entrance between the potted cycads
# until the restaurant inside reads through the doors; a rise over the roof guard onto the terrace and the penthouse;
# and a closing pull-up orbit from the hero framing that runs on for TAIL_SECS at a creep. The neighbour tower the
# Bradbury's scene stands across Broadway lies 30 m in front of the building (world x 42.5..68.5): check=1 prints
# where it lands in each shot. Timing, exposure, blur, EEVEE and render management: see the Bradbury script's header,
# unchanged here (the EEVEE preview opens the same city scene: Terra & Mar's wear compiles in EEVEE, b85640c4).
import bpy, os, sys, math, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import city_common as C

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)

# ---------------------------------------------------------------- the shots
Z_GROUND, EYE = C.Z_GROUND, C.EYE               # the pavement's top in the city and a standing eye over it
FPS = int(args.get("fps", 24))                  # frames per second
SECS = float(args.get("secs", 5.0))             # every shot's move, seconds (3 until item 32: the user asked for the length, so the
                                                # deceleration is not squeezed into the old three)
TAIL_SECS = 2.0                                 # the closing shot runs on this much longer, all but stopped at its final position (item 32)
WIDTH, HEIGHT = 1080, 1920                      # portrait full HD
BLOCK = C.TM_BOX                                # the building's box, Terra & Mar frame (corners() maps it into the city)
TOWER = C.TOWER_WORLD                           # the Bradbury scene's neighbour tower, world
CENTRE = (0.0, 0.5)                             # the building's plan centre, the orbits' pivot
G = C.Z_GROUND - C.OFFSET[2]                    # the pavement's top in the Terra & Mar frame
E = G + EYE
HERO_EYE, HERO_AIM = (42.0, -64.0, 24.0), (1.0, 0.0, 14.5)   # render_city_shots.py's hero_3q
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
def orbit(az, r, z):                            # a point r out from the plan centre at azimuth az (degrees from +x, Terra & Mar frame), z up
    return (CENTRE[0] + r * math.cos(math.radians(az)), CENTRE[1] + r * math.sin(math.radians(az)), z)
HERO_AZ = math.degrees(math.atan2(HERO_EYE[1] - CENTRE[1], HERO_EYE[0] - CENTRE[0]))
HERO_R = math.hypot(HERO_EYE[0] - CENTRE[0], HERO_EYE[1] - CENTRE[1])
def up_pose(t):
    # a standing eye on the forecourt 4.5 m from the front, rising a little as it tilts from 25 to 72 degrees up: the sign, then the stack
    z = E + 0.5 * t; tilt = math.radians(25.0 + 47.0 * t)
    return (2.6, -16.6, z), (2.6, -16.6 + math.cos(tilt), z + math.sin(tilt))
# (name, lens mm on the frame's long side, pose(p) -> (eye, aim) in the Terra & Mar frame, tail seconds)
SHOTS = [
    ("air", 24, lambda t: (lerp((125.0, -20.0, 70.0), HERO_EYE, t), lerp((0.0, -8.0, 6.0), HERO_AIM, t)), 0.0),
    ("facade", 40, lambda t: (lerp((-7.0, -27.0, 16.5), (7.0, -27.0, 16.5), t), lerp((-7.0, -12.0, 15.0), (7.0, -12.0, 15.0), t)), 0.0),
    ("up", 24, up_pose, 0.0),
    ("entrance", 30, lambda t: (lerp((3.0, -25.0, E + 0.3), (0.7, -17.2, E), t), lerp((0.0, -11.6, 2.6), (0.0, -9.5, 2.0), t)), 0.0),
    ("roof", 24, lambda t: (lerp((15.0, -25.0, 25.5), (9.0, -19.0, 35.0), t), lerp((2.0, -2.0, 28.0), (0.0, 3.0, 28.2), t)), 0.0),
    ("close", 24, lambda t: (orbit(HERO_AZ + 32.0 * t, HERO_R + 24.0 * t, HERO_EYE[2] + 30.0 * t), lerp(HERO_AIM, (0.0, 0.0, 10.0), t)), TAIL_SECS),
]
N_MOVE = int(round(SECS * FPS))                 # frames of a move
def n_frames(shot): return N_MOVE + int(round(shot[3] * FPS))   # a shot's frames: its move and its tail
P = {s[0]: profile(n_frames(s), N_MOVE) for s in SHOTS}         # every frame's path parameter, by shot
# the exposure per shot, stops over the scene's own (THE EXPOSURE PER SHOT above); expo=<shot>:<stops>,... overrides
EXPOSURE_BY_SHOT = {}                           # none: every shot looks at a sunlit face
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
FLY = C.FLYOVER_DIR
OUT = os.path.abspath(args.get("out", os.path.join(FLY, "frames" if ENGINE == "cycles" else "frames_eevee")))
MP4 = os.path.abspath(args.get("mp4", os.path.join(os.path.dirname(OUT), "terramar_city_flyover_portrait_1080x1920.mp4" if ENGINE == "cycles"
                                                    else "terramar_city_flyover_eevee_preview.mp4")))

# ---------------------------------------------------------------- the scene, in memory only
scene_file = args.get("scene") or C.CITY_BLEND
assert os.path.isfile(scene_file), f"no scene at {scene_file}: build it with build_city_scene.py"
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
cd = bpy.data.cameras.new("fly_cam"); cd.clip_end = 7000.0   # the ground runs 3.5 km out (the Bradbury scene's CAM_CLIP)
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

def corners(bb, world=False):
    # a box's eight corners in the city: BLOCK is in the Terra & Mar frame (mapped), TOWER is already the world's
    pts = [(x, y, z) for x in (bb[0][0], bb[1][0]) for y in (bb[0][1], bb[1][1]) for z in (bb[0][2], bb[1][2])]
    return [Vector(p) for p in (pts if world else C.box_corners(bb))]
def pose(shot, k):
    # the camera at frame k (1..n) of a shot: its eye and aim at the frame's path parameter
    name, lens, fn = shot[:3]
    eye, aim = (C.to_world(v) for v in fn(P[name][k - 1]))
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
                pts = [world_to_camera_view(S, cam, c) for c in corners(bb, bb is TOWER)]
                front = [p for p in pts if p.z > 0.0]
                if not front: return "behind the camera"
                return (f"x {min(p.x for p in front):6.3f}..{max(p.x for p in front):6.3f}  y {1 - max(p.y for p in front):6.3f}..{1 - min(p.y for p in front):6.3f}"
                        + ("" if len(front) == 8 else f"  ({8 - len(front)} corners behind)"))
            print(f"  frame {k:3d} (p {P[shot[0]][k - 1]:.3f}): eye ({eye[0]:6.1f}, {eye[1]:6.1f}, {eye[2]:5.1f}) aim ({aim[0]:6.1f}, {aim[1]:6.1f}, {aim[2]:5.1f}); "
                  f"building {span(BLOCK)}; tower {span(TOWER)}; building's far corner {far:.0f} m, blur from {far + BLUR_START_M:.0f} to {far + BLUR_START_M + BLUR_FULL_M:.0f} m"
                  )
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
