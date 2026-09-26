# The render scene's CONTEXT LIBRARY: the game's own trees, imported once into context_library.blend beside the
# scene, for build_scene.py to link and place (AI 574 item 28, the near context). The scene wants real trees --
# things at 90 to 130 m that self-shadow and throw a real shadow under a hard sun; a card reads flat and its shadow
# is a sliver -- and the game already owns fifteen: assets/trees/Models/Desktop/SM_H_Tree_1..15.FBX, one mesh each
# with a trunk slot and a leaf slot, textured by T_Trunk_Realistic9 and T_Leaf_Realistic9 (2048 RGBA, the cut-out in
# its alpha), the way src/graphics/assets3d/generators/TreeGenerator.js maps them (a slot is foliage when its
# material's name says leaf; the rest is trunk; the trunk's lowest vertex is the tree's base). Importing fifteen FBX
# files takes half a minute and is the same every time, so it is done here once and the scene links the result.
#
# What the library holds: fifteen mesh objects ctx_tree_01 .. ctx_tree_15, each at the origin in METRES (the pack is
# in centimetres; Blender's importer applies the 0.01 as an object scale, and that scale is baked into the mesh here
# so a linked mesh is metres with nothing left to apply), standing on z = 0 at the trunk's foot, with the tree's
# measured height, crown foot and radius kept as custom properties of the mesh (height, crown_z, radius) so the scene
# can scale a placement to a wanted height; and two Cycles materials, ctx_leaf and ctx_trunk, shared by all fifteen.
# The leaf: the TGA's colour into a Principled BSDF with a share of Translucent BSDF (the sun comes through a crown)
# mixed against a Transparent BSDF by the TGA's alpha -- a cut-out that shadows as a cut-out, both faces rendered as
# Cycles renders every face -- and the leaf normal map; the trunk: its colour, rough, its normal map. The scene wraps
# copies of these in its haze (build_scene.py hazes every material it places; a linked material cannot be edited, so
# the scene copies them local, and every placed tree carries the copies as object-level slots over the linked mesh)
# and sets the leaf material's LEAF_TINT node on its copy (white here: the game's own foliage colour).
# The FBX's own materials point at the author's drives and go.
#
# THE PROPS (AI 574 item 8, the street furniture): CC0 models installed under assets/props/<asset>/ with a source.json
# beside each (page, download URLs, license, author, date, md5s), imported here the same way -- one mesh object
# ctx_prop_<asset> in metres, z up, its foot on z 0, its measured height and radius on the mesh -- with the model's own
# PBR materials kept and renamed ctx_prop_<...> so the scene can find, copy and haze them as it does the trees', and any
# emission the model carries switched off (it is a daylight scene). PROPS lists them: street_lamp_01 (Poly Haven, Josh
# Dean), the black cast-iron lantern post the reference photo has on 3rd Street's far pavement.
#
#   blender -b -P build_context.py --              rebuild the library (about 40 s)
#   blender -b -P build_context.py -- sheet=1      also render the fifteen trees in a row at 10 m, a standing eye,
#                                                  under the scene's sun, to tests/artifacts/screens/bradbury_scene/
#                                                  item28_near_context/tune/library_sheet.png (a check of the import
#                                                  and of the leaf cut-out; the scene's own close-up is the evidence)
import bpy, os, sys, math, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
ART = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury", "portal_project")
LIBRARY = os.path.join(ART, "context_library.blend")
TREE_DIR = os.path.join(ROOT, "assets", "trees", "Models", "Desktop")
TEX_DIR = os.path.join(ROOT, "assets", "trees", "Textures")
TREES = [f"SM_H_Tree_{n}.FBX" for n in range(1, 16)]   # the desktop pack, as TreeConfig.js lists it
LEAF_TEX, LEAF_NRM = "T_Leaf_Realistic9.TGA", "T_Leaf_Realistic9_normal.TGA"
TRUNK_TEX, TRUNK_NRM = "T_Trunk_Realistic9.TGA", "T_Trunk_Realistic9_normal.TGA"
LEAF_TRANSLUCENT = 0.15                         # the share of a leaf's shading that is light through it (sunlit crowns glow at the edges;
                                                # 0.30 lit the shaded side of a crown to sRGB (92, 88, 40) against the reference's (52, 51, 31))
LEAF_ROUGH = 0.55                               # a leaf's roughness: waxy, not wet
LEAF_NORMAL = 0.4                               # the leaf normal map's strength: the cards are flat, the map only breaks their shading
TRUNK_ROUGH = 0.85
TRUNK_NORMAL = 0.7                              # the bark's normal map (the pack is an Unreal one; its green channel is taken as it comes)
PROP_DIR = os.path.join(ROOT, "assets", "props")
PROPS = [("street_lamp_01", "street_lamp_01_1k.gltf")]   # (the asset's folder under assets/props, its glTF): see each folder's source.json
SHEET_H = 10.0                                  # the sheet's trees, all scaled to this height
SHEET_STEP = 8.0                                # ... this far apart
SHEET = os.path.join(ROOT, "tests", "artifacts", "screens", "bradbury_scene", "item28_near_context", "tune")

for p in (TREE_DIR, TEX_DIR): assert os.path.isdir(p), f"missing: {p}"
bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene; S.name = "CONTEXT_LIBRARY"

def image(fn, cs):
    im = bpy.data.images.load(os.path.join(TEX_DIR, fn), check_existing=True)
    im.name = os.path.splitext(fn)[0]; im.colorspace_settings.name = cs
    return im

def leaf_material():
    m = bpy.data.materials.new("ctx_leaf"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (900, 0)
    col = nt.nodes.new('ShaderNodeTexImage'); col.image = image(LEAF_TEX, 'sRGB'); col.location = (-600, 200)
    nrm = nt.nodes.new('ShaderNodeTexImage'); nrm.image = image(LEAF_NRM, 'Non-Color'); nrm.location = (-600, -300)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-300, -300); nm.inputs["Strength"].default_value = LEAF_NORMAL
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    # LEAF_TINT: a constant the TGA's colour is multiplied by, white here (the game's look); a scene that places the
    # trees sets it on its own copy of the material to bring the foliage to its reference (build_scene.py)
    tint = nt.nodes.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.name = tint.label = "LEAF_TINT"
    tint.location = (-350, 200); tint.inputs["Factor"].default_value = 1.0
    nt.links.new(col.outputs["Color"], next(i for i in tint.inputs if i.identifier == "A_Color"))
    next(i for i in tint.inputs if i.identifier == "B_Color").default_value = (1.0, 1.0, 1.0, 1.0)
    leaf_col = next(o for o in tint.outputs if o.identifier == "Result_Color")
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (-100, 200)
    bsdf.inputs["Roughness"].default_value = LEAF_ROUGH
    nt.links.new(leaf_col, bsdf.inputs["Base Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent'); tr.location = (-100, -100)
    nt.links.new(leaf_col, tr.inputs["Color"]); nt.links.new(nm.outputs["Normal"], tr.inputs["Normal"])
    leaf = nt.nodes.new('ShaderNodeMixShader'); leaf.location = (250, 100); leaf.inputs["Fac"].default_value = LEAF_TRANSLUCENT
    nt.links.new(bsdf.outputs["BSDF"], leaf.inputs[1]); nt.links.new(tr.outputs["BSDF"], leaf.inputs[2])
    clear = nt.nodes.new('ShaderNodeBsdfTransparent'); clear.location = (250, -150)
    cut = nt.nodes.new('ShaderNodeMixShader'); cut.location = (550, 0); cut.name = cut.label = "LEAF_CUTOUT"
    nt.links.new(col.outputs["Alpha"], cut.inputs["Fac"])        # alpha 0: clear; 1: the leaf
    nt.links.new(clear.outputs["BSDF"], cut.inputs[1]); nt.links.new(leaf.outputs["Shader"], cut.inputs[2])
    nt.links.new(cut.outputs["Shader"], out.inputs["Surface"])
    return m

def trunk_material():
    m = bpy.data.materials.new("ctx_trunk"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (500, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (200, 0); bsdf.inputs["Roughness"].default_value = TRUNK_ROUGH
    col = nt.nodes.new('ShaderNodeTexImage'); col.image = image(TRUNK_TEX, 'sRGB'); col.location = (-400, 200)
    nrm = nt.nodes.new('ShaderNodeTexImage'); nrm.image = image(TRUNK_NRM, 'Non-Color'); nrm.location = (-400, -300)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-100, -300); nm.inputs["Strength"].default_value = TRUNK_NORMAL
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m

M_LEAF, M_TRUNK = leaf_material(), trunk_material()
lib = bpy.data.collections.new("CONTEXT_TREES"); S.collection.children.link(lib)
t0 = time.time(); rows = []
for k, fn in enumerate(TREES):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(TREE_DIR, fn))
    new = [o for o in bpy.data.objects if o not in before]
    keep = [o for o in new if o.type == 'MESH' and len(o.data.polygons) and not o.name.upper().startswith(("UCX_", "UBX_", "UCP_", "USP_"))]
    assert len(keep) == 1, f"{fn}: expected one render mesh, found {[o.name for o in keep]}"
    ob = keep[0]
    for o in new:
        if o is not ob: bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    me = ob.data
    # bake the importer's scale and orientation into the vertices: the mesh becomes metres, z up, and the object
    # stands at the identity
    me.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
    # which slot is the foliage: the FBX material's name, as the game reads it
    leaf_slots = {i for i, m in enumerate(me.materials) if m is not None and "leaf" in m.name.lower()}
    trunk_slots = set(range(len(me.materials))) - leaf_slots
    assert leaf_slots and trunk_slots, f"{fn}: slots {[m.name if m else None for m in me.materials]}"
    lows = {}
    for p in me.polygons:
        z = min(me.vertices[v].co.z for v in p.vertices)
        lows[p.material_index] = min(lows.get(p.material_index, 1e9), z)
    foot = min(lows[i] for i in trunk_slots)                       # the trunk's lowest vertex is the base, as in the game
    me.transform(Matrix.Translation((0.0, 0.0, -foot)))
    zs = [v.co.z for v in me.vertices]; rs = [math.hypot(v.co.x, v.co.y) for v in me.vertices]
    height, crown_z, radius = max(zs), min(lows[i] for i in leaf_slots) - foot, max(rs)
    old = [m for m in me.materials if m is not None]
    for i in range(len(me.materials)): me.materials[i] = M_LEAF if i in leaf_slots else M_TRUNK
    for m in old:
        if m.users == 0: bpy.data.materials.remove(m)
    name = f"ctx_tree_{k + 1:02d}"
    ob.name = me.name = name
    me["height"] = float(height); me["crown_z"] = float(crown_z); me["radius"] = float(radius); me["source"] = fn
    for c in list(ob.users_collection): c.objects.unlink(ob)
    lib.objects.link(ob)
    rows.append((name, fn, height, crown_z, radius, len(me.polygons), sum(1 for p in me.polygons if p.material_index in leaf_slots)))
# the props: a glTF each, imported with its images referenced where they are installed (not packed), the importer's
# transform baked into the mesh (metres, z up), the lowest vertex put on z 0, its materials kept and renamed
t1 = time.time(); prop_rows, prop_images = [], set()
for asset, fn in PROPS:
    path = os.path.join(PROP_DIR, asset, fn)
    assert os.path.isfile(path), f"missing: {path} (its source.json beside it says where it comes from)"
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, import_pack_images=False)
    new = [o for o in bpy.data.objects if o not in before]
    keep = [o for o in new if o.type == 'MESH' and len(o.data.polygons)]
    assert len(keep) == 1, f"{fn}: expected one mesh, found {[o.name for o in keep]}"
    ob = keep[0]
    bpy.context.view_layer.update()
    me = ob.data
    me.transform(ob.matrix_world); ob.parent = None; ob.matrix_world = Matrix.Identity(4)
    for o in new:
        if o is not ob: bpy.data.objects.remove(o, do_unlink=True)
    foot = min(v.co.z for v in me.vertices)
    me.transform(Matrix.Translation((0.0, 0.0, -foot)))
    height = max(v.co.z for v in me.vertices); radius = max(math.hypot(v.co.x, v.co.y) for v in me.vertices)
    name = f"ctx_prop_{asset}"
    ob.name = me.name = name
    me["height"] = float(height); me["radius"] = float(radius); me["source"] = "/".join(("assets", "props", asset, fn))
    for m in me.materials:
        if m is None: continue
        if not m.name.startswith("ctx_prop_"): m.name = "ctx_prop_" + m.name
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs["Emission Strength"].default_value = 0.0
            if n.type == 'TEX_IMAGE' and n.image is not None: prop_images.add(n.image.name)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    lib.objects.link(ob)
    prop_rows.append((name, fn, height, radius, len(me.polygons), [m.name for m in me.materials if m is not None]))
# the FBX's images pointed at the author's drives; nothing uses them now. The trees' four and the props' stay
keep_images = {os.path.splitext(f)[0] for f in (LEAF_TEX, LEAF_NRM, TRUNK_TEX, TRUNK_NRM)} | prop_images
for im in list(bpy.data.images):
    if im.users == 0 or not im.has_data and im.name not in keep_images:
        bpy.data.images.remove(im)
print(f"{len(rows)} trees imported in {t1 - t0:.0f} s (metres, z up, the trunk's foot on z 0):")
print(f"  {'object':<12} {'source':<18} {'height':>7} {'crown':>6} {'radius':>7} {'polys':>6} {'leaf':>6}")
for name, fn, h, cz, r, n, nl in rows:
    print(f"  {name:<12} {fn:<18} {h:7.2f} {cz:6.2f} {r:7.2f} {n:6d} {nl:6d}")
print(f"{len(prop_rows)} props imported in {time.time() - t1:.0f} s (metres, z up, the foot on z 0):")
for name, fn, h, r, n, mats in prop_rows:
    print(f"  {name:<24} {fn:<24} height {h:5.2f} radius {r:5.2f} polys {n:6d}  materials {', '.join(mats)}")
assert {os.path.splitext(f)[0] for f in (LEAF_TEX, LEAF_NRM, TRUNK_TEX, TRUNK_NRM)} | prop_images <= {im.name for im in bpy.data.images}
bpy.ops.wm.save_as_mainfile(filepath=LIBRARY, compress=True, relative_remap=True)
print(f"LIBRARY SAVED {LIBRARY}: {', '.join(r[0] for r in rows)}; {', '.join(r[0] for r in prop_rows)}; materials ctx_leaf, ctx_trunk, "
      f"{', '.join(m for r in prop_rows for m in r[5])}; images {', '.join(sorted(im.name for im in bpy.data.images))}")

if args.get("sheet", "0") not in ("0", "", "no"):
    # the fifteen in a row at SHEET_H, a standing eye 60 m off, under the scene's sky and sun (the kloofendal map
    # turned as build_scene.py turns it for the photo's sun, +40, and the lamp on its disc), on a grey ground
    os.makedirs(SHEET, exist_ok=True)
    hdri = os.path.join(ROOT, "assets", "public", "lighting", "hdri", "kloofendal_43d_clear_puresky_4k.hdr")
    if not os.path.isfile(hdri): hdri = os.path.join(ROOT, "assets", "public", "lighting", "hdri", "kloofendal_43d_clear_puresky_2k.hdr")
    W = bpy.data.worlds.new("SHEET_SKY"); S.world = W; W.use_nodes = True; nt = W.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); env = nt.nodes.new('ShaderNodeTexEnvironment')
    mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
    env.image = bpy.data.images.load(hdri, check_existing=True); mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(-76.2))
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"]); nt.links.new(bg.outputs["Background"], o.inputs["Surface"])
    az, el = math.radians(40.0), math.radians(42.9)
    sd = bpy.data.lights.new("sheet_sun", 'SUN'); sd.energy = 8.0; sd.angle = math.radians(0.53)
    sun = bpy.data.objects.new("sheet_sun", sd); S.collection.objects.link(sun)
    sun.rotation_euler = (-Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))).to_track_quat('-Z', 'Y').to_euler()
    gm = bpy.data.materials.new("sheet_ground"); gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.3, 0.28, 0.25, 1.0)
    gme = bpy.data.meshes.new("sheet_ground"); gme.from_pydata([(-200, -200, 0), (200, -200, 0), (200, 200, 0), (-200, 200, 0)], [], [(0, 1, 2, 3)])
    gme.materials.append(gm); g = bpy.data.objects.new("sheet_ground", gme); S.collection.objects.link(g)
    n = len(rows); x0 = -SHEET_STEP * (n - 1) / 2.0
    for k, ob in enumerate(sorted(lib.objects, key=lambda o: o.name)):
        s = SHEET_H / ob.data["height"]; ob.scale = (s, s, s); ob.location = (x0 + SHEET_STEP * k, 0.0, 0.0)
        ob.rotation_euler = (0.0, 0.0, math.radians(37.0 * k))
    cd = bpy.data.cameras.new("sheet_cam"); cd.lens = 24.0; cam = bpy.data.objects.new("sheet_cam", cd); S.collection.objects.link(cam)
    cam.location = (0.0, -75.0, 1.62); cam.rotation_euler = (Vector((0.0, 0.0, 5.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    S.camera = cam; S.render.engine = 'CYCLES'
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences; cp.compute_device_type = "OPTIX"; cp.get_devices()
        for d in cp.devices: d.use = d.type in ('OPTIX', 'CPU')
        S.cycles.device = 'GPU'
    except Exception:
        S.cycles.device = 'CPU'
    S.cycles.samples = int(args.get("samples", 96)); S.cycles.use_denoising = True
    S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = 2400, 800, 100
    S.view_settings.view_transform = 'AgX'
    S.render.image_settings.file_format = 'PNG'; S.render.filepath = os.path.join(SHEET, "library_sheet.png")
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f"SHEET {S.render.filepath} in {time.time() - t:.0f} s (not saved into the library)")
print("CONTEXT DONE")
