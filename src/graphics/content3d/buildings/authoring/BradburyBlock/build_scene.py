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
# map's sun at azimuth 33.9 -- over Broadway's shoulder, so that facade is lit and 3rd Street's is in shade -- which
# is what makes the block read as standing on its ground. `rot=0 sun=0 hdri=1` gives the plain map back.
#
#   keys: hdri (strength, 0.75), rot (the map turned about z, degrees, 250), sun (a lamp on the map's own sun, 8),
#         ground (street | catch | none), block (fixed | game: the untouched export, its own scene and shots),
#         exposure, samples, pct, res, views listed by name (see VIEWS).
import bpy, os, sys, math, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
names = [a for a in argv if "=" not in a]
HDRI_STRENGTH = float(args.get("hdri", 0.75))
HDRI_ROT = float(args.get("rot", 250.0))        # degrees about z: turns the whole sky, sun included (see the sweep below)
SUN = float(args.get("sun", 8.0))               # 0: the map lights the block by itself
EXPO = float(args.get("exposure", 0.0))
SAMPLES = int(args.get("samples", 128))
PCT = int(args.get("pct", 100))
RES = int(args.get("res", 1920))
GROUND = args.get("ground", "street").lower()
BLOCK_KIND = args.get("block", "fixed").lower()
assert BLOCK_KIND in ("fixed", "game"), f"block: fixed | game, not {BLOCK_KIND}"
assert GROUND in ("street", "catch", "none"), f"ground: street | catch | none, not {GROUND}"

HERE = os.path.dirname(os.path.abspath(__file__))
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
for p in (BLOCK, HDRI): assert os.path.isfile(p), f"missing: {p}"
os.makedirs(SHOTS, exist_ok=True)

# The block's ground is its sidewalk top, Z_GROUND 0.201 in assemble_building.py; a standing eye is EYE above it.
Z_GROUND, EYE = 0.201, 1.62
# (from, to, lens). The east face is Broadway (x about 17), the south face 3rd Street (y about -17.9), the chamfer
# between them; the portals stand on the east and south faces and on the chamfer's flank.
VIEWS = {
    "st_corner":  ((41.0, -41.0, Z_GROUND + EYE), (14.6, -15.6, 11.0), 28),   # from the far pavement across the crossing, the chamfer whole
    "st_portal":  ((30.0, 1.40, Z_GROUND + EYE), (17.0, 1.40, 6.5), 35),      # from the middle of Broadway, square to its portal
    "st_along":   ((24.5, -21.0, Z_GROUND + EYE), (16.9, 6.0, 9.0), 35),      # out in the crossing, the facade running away up Broadway
    "st_up":      ((21.5, -6.0, Z_GROUND + EYE), (16.9, -5.0, 16.0), 24),     # on the pavement under the wall, looking up its whole height
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

# ---------------------------------------------------------------- the ground: a shadow catcher, and a real street
# The block's own outline, as assemble_building.py lays it out, is the thing everything here is measured from: the
# pavement is that outline pushed out PAVE_W and filled (filled, not a ring, so it runs on under the walls and closes
# the floor of every recessed shopfront), its kerb drops PAVE_H to the roadway, the roadway is ST_W wide kerb to kerb,
# and the pavement on the far side of both streets carries on to the field's edge, where the map takes over. Past
# GND_R there is no geometry at all, only the catcher: at that distance the map's own ground is a blur on the horizon
# and a seam in it does not read. The catcher lies just under the roadway, so in street mode it shows only out there;
# in catch mode it stands at the block's own pavement level instead and is the whole of the ground.
SHRINK, BAY_GROW = (0.502, 4.465) if BLOCK_KIND == "fixed" else (0.0, 0.0)   # as assemble_building.py has them,
                                                # and neither of them applied to the game's own outline
HULL = [(-36.529 + SHRINK, -17.879), (9.7 + BAY_GROW, -17.879), (12.529 + BAY_GROW, -15.05),
        (12.529 + BAY_GROW, 17.879 - SHRINK), (-36.529 + SHRINK, 17.879 - SHRINK)]   # the block's outline, anticlockwise
ROAD_Z = 0.0                                    # the roadway; the block's own base height is the kerb
PAVE_W, PAVE_H = 4.20, Z_GROUND - ROAD_Z        # the pavement, wall to kerb, and the kerb's face
ST_W = 13.00                                    # the roadway, kerb to kerb
GND_R = 150.0                                   # the real ground's half extent
CATCH_R = 600.0                                 # the catcher's, under and beyond it
PBR_DIR = os.path.join(ROOT, "assets", "public", "pbr")
GND_TILE = 4.0                                  # every ground set's own tileMeters (its pbr.material.config.js)
GND_MIN_PARTS = 40                              # how many of the block's parts must still stand on Z_GROUND

bpy.context.view_layer.update()   # a freshly linked object still carries the matrix_world it had in the library
bases = [min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.objects if o.type == 'MESH']
tops = [max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in linked.objects if o.type == 'MESH']
on_ground = sum(1 for b in bases if abs(b - Z_GROUND) < 0.03)
print(f"the block reads {min(bases):.3f} at its lowest and {max(tops):.3f} at its highest, with {on_ground} parts "
      f"standing on {Z_GROUND}")
assert on_ground >= GND_MIN_PARTS, (f"only {on_ground} of the block's parts start at {Z_GROUND}: its base has moved, "
                                    f"and ground laid at that height would not meet it")

def ground_material(name, folder, mottle_m=0.0, mottle=0.0):
    # the catalog's own maps, read the way the game reads them -- base colour, the packed AO / roughness / metal, and
    # the OpenGL normal -- tiled by the set's tileMeters over UVs that are metres. A 4 m tile over a street shows its
    # repeat from any wide lens, so a slow noise mottle_m across lifts and drops the tone by mottle, which breaks the
    # grid up without touching the surface itself.
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
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (200, 250)
    mix.inputs["Factor"].default_value = 1.0                  # the packed AO darkens the base colour, as on the walls
    nt.links.new(col, next(i for i in mix.inputs if i.identifier == "A_Color"))
    nt.links.new(sep.outputs["Red"], next(i for i in mix.inputs if i.identifier == "B_Color"))
    nt.links.new(next(o for o in mix.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (200, -300)
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m

gnd = bpy.data.collections.new("GROUND"); S.collection.children.link(gnd)
def ground_mesh(name, verts, faces, mat, uvs):
    # uvs: a function of the vertex, or one pair per vertex
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    me.uv_layers.new(name="UVMap"); uvl = me.uv_layers.active.data
    for pl in me.polygons:
        for li in pl.loop_indices:
            vi = me.loops[li].vertex_index
            uvl[li].uv = uvs(me.vertices[vi].co) if callable(uvs) else uvs[vi]
    me.materials.append(mat)
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
def band(name, pts, z0, z1, mat, closed=False):
    # a vertical ribbon along a run of points, facing the run's own right hand -- outward on an anticlockwise outline
    ps = list(pts) + ([pts[0]] if closed else [])
    verts, uvw, faces, s = [], [], [], 0.0
    for i, q in enumerate(ps):
        if i: s += (Vector(q) - Vector(ps[i - 1])).length
        verts += [(q[0], q[1], z0), (q[0], q[1], z1)]; uvw += [(s, z0), (s, z1)]
    for i in range(len(ps) - 1):
        a, b = 2 * i, 2 * i + 2; faces.append((a, b, b + 1, a + 1))
    return ground_mesh(name, verts, faces, mat, uvw)

n_gnd = 0
if GROUND == "street":
    PAVE = offset_poly(HULL, PAVE_W)
    X0, X1 = min(q[0] for q in PAVE) - ST_W, max(q[0] for q in PAVE) + ST_W    # the streets' far kerbs, all four sides
    Y0, Y1 = min(q[1] for q in PAVE) - ST_W, max(q[1] for q in PAVE) + ST_W
    M_ROAD = ground_material("GND_asphalt", "clean_asphalt", mottle_m=22.0, mottle=0.10)
    M_PAVE = ground_material("GND_pavement", "concrete_pavement", mottle_m=14.0, mottle=0.07)
    M_KERB = ground_material("GND_kerb", "concrete")
    ground_mesh("scn_road", [(q[0], q[1], ROAD_Z) for q in rect(-GND_R, GND_R, -GND_R, GND_R)], [(0, 1, 2, 3)], M_ROAD, FLAT)
    ground_mesh("scn_pavement", [(q[0], q[1], Z_GROUND) for q in PAVE], [tuple(range(len(PAVE)))], M_PAVE, FLAT)
    band("scn_kerb", PAVE, ROAD_Z, Z_GROUND, M_KERB, closed=True)
    # the far pavements, a pinwheel of four so that they tile the outside of the streets without ever overlapping
    far = [rect(-GND_R, GND_R, -GND_R, Y0), rect(X1, GND_R, Y0, GND_R), rect(-GND_R, X1, Y1, GND_R), rect(-GND_R, X0, Y0, Y1)]
    ground_mesh("scn_pavement_far", [(q[0], q[1], Z_GROUND) for r in far for q in r],
                [tuple(range(4 * k, 4 * k + 4)) for k in range(4)], M_PAVE, FLAT)
    for nm, run in (("s", [(X1, Y0), (-GND_R, Y0)]), ("e", [(X1, GND_R), (X1, Y0)]),
                    ("n", [(-GND_R, Y1), (X1, Y1)]), ("w", [(X0, Y0), (X0, Y1)])):
        band("scn_kerb_far_" + nm, run, ROAD_Z, Z_GROUND, M_KERB)             # each facing in, over its own street
    n_gnd = len(gnd.objects)
    print(f"the ground: a pavement {PAVE_W:.2f} m wide on a {PAVE_H * 100:.0f} cm kerb, a {ST_W:.1f} m roadway, and the "
          f"pavement beyond it to {GND_R:.0f} m ({n_gnd} objects); the streets' far kerbs at x {X0:.2f} / {X1:.2f}, "
          f"y {Y0:.2f} / {Y1:.2f}")
if GROUND != "none":
    # Cycles renders a shadow catcher as whatever lies behind it, but still darkened by everything the block hides --
    # the sun and the sky both -- so the map's own road takes the block's shadow. In street mode it lies just under the
    # roadway and shows only past the real ground's edge; in catch mode it stands at the block's own pavement level
    # and is the only ground there is.
    z = ROAD_Z - 0.05 if GROUND == "street" else Z_GROUND
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
print(f"SCENE SAVED {SCENE} | {len(VIEWS)} cameras: {', '.join(VIEWS)} | ground: {GROUND} | block: {BLOCK_KIND}")

for nm in names:
    if nm not in cams: print(f"  no such view: {nm} (have {', '.join(VIEWS)})"); continue
    S.camera = cams[nm]; S.render.filepath = os.path.join(SHOTS, nm + ".png")
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"  {nm}: {time.time() - t:.0f}s -> {S.render.filepath}")
print("SCENE DONE")
