"""Shared helpers for the standalone Bradbury portal project (Blender 5.x, bpy/bmesh).

Coordinate frame of the project: x across the facade (right = +x), y = depth
(+y into the building, the street is at -y), z up, origin at the portal centre
on the threshold. Each piece script `exec`s this file, builds into its own
collection and can be re-run (it clears its collection first).
"""
import bpy, os, os, bmesh, math
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- scene / collections
ROOT_COLLECTIONS = ("RIG", "PROPS")   # review-only collections (cameras/sun, sidewalk context) stay at the scene root
def portal_root():
    # `PORTAL` holds every piece collection: it is what the building file (assemble_building.py) links and instances
    root = bpy.data.collections.get("PORTAL")
    if not root:
        root = bpy.data.collections.new("PORTAL"); bpy.context.scene.collection.children.link(root)
    return root
def ensure_collection(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(name)
    parent = bpy.context.scene.collection if name in ROOT_COLLECTIONS else portal_root()
    if c.name not in parent.children:
        for p in [bpy.context.scene.collection] + list(bpy.data.collections):   # older files had every piece at the scene root
            if p is not parent and c.name in p.children: p.children.unlink(c)
        parent.children.link(c)
    return c

def purge_orphans():
    for me in [m for m in bpy.data.meshes if m.users == 0]: bpy.data.meshes.remove(me)
    for m in [m for m in bpy.data.materials if m.users == 0 and not m.name.startswith("PORTAL_")]: bpy.data.materials.remove(m)

# ---------------------------------------------------------------- materials (procedural, object coordinates: no UVs needed)
def _base(name):
    m = bpy.data.materials.get(name)
    if m: return m, None
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m, bsdf

def mat_oak():
    m, bsdf = _base("PORTAL_oak")
    if not bsdf: return m
    nt = m.node_tree; tc = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping"); mapping.inputs["Scale"].default_value = (1.0, 1.0, 0.18)   # grain runs vertically
    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    wave = nt.nodes.new("ShaderNodeTexWave"); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs["Scale"].default_value = 30.0; wave.inputs["Distortion"].default_value = 6.0; wave.inputs["Detail"].default_value = 3.0; wave.inputs["Detail Scale"].default_value = 2.0
    nt.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")                                # dark stained oak, grain barely visible
    ramp.color_ramp.elements[0].position = 0.15; ramp.color_ramp.elements[0].color = (0.060, 0.024, 0.010, 1)
    ramp.color_ramp.elements[1].position = 0.90; ramp.color_ramp.elements[1].color = (0.082, 0.034, 0.014, 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.6; noise.inputs["Detail"].default_value = 4
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = 'MULTIPLY'; mix.inputs["Fac"].default_value = 0.25
    nt.links.new(ramp.outputs["Color"], mix.inputs["Color1"]); nt.links.new(noise.outputs["Color"], mix.inputs["Color2"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.40
    if "Coat Weight" in bsdf.inputs: bsdf.inputs["Coat Weight"].default_value = 0.3
    return m

# The glass (2026-09-28, the user: "there is still ghost in the glass"): the panes are closed 6 mm boxes and must be
# glass through and through. They were Alpha 0.35 over a 0.9 transmission at IOR 1.5, an Eevee "blended" setup that
# Cycles renders stochastically: at each of a pane's two faces a ray either passed straight on (the alpha's 65%) or was
# refracted, so a ray refracted at one face and passed straight at the other left the pane bent by the IOR and saw the
# lobby from a few degrees off -- a second, displaced image over the first. For Cycles it is now Alpha 1 and full
# transmission: every ray is refracted in and out, parallel, one image, with the faces' own faint reflections. Nearly
# clear, a trace of green-blue. The wear layer's grime raises the alpha toward 1 and lowers the transmission where dust
# covers the pane, which this base keeps working (it wears the ACTIVE output's BSDF: the Cycles one).
# Eevee, which the editor's Material Preview uses, cannot see through full transmission without ray-traced refraction
# and showed the world's HDRI in the panes (the user: "in the editor, it now shows the environment reflection, before
# it was a clear glass, which i preferred"), so the material has a second output for Eevee alone with the old
# see-through setup: plain alpha blending at 0.25, no transmission (Eevee's approximate transmission speckled), which
# in Eevee has no ghost. Each engine takes its
# own output. Rebuilt in place when the recipe changes, so every pane using it follows.
GLASS_TINT = (0.95, 0.975, 0.975)
GLASS_ROUGH = 0.02
def mat_glass():
    name = "PORTAL_glass"
    recipe = f"clear glass: cycles tint {GLASS_TINT} rough {GLASS_ROUGH} ior 1.5 transmission 1 alpha 1; eevee alpha 0.25 no transmission blended"
    m = bpy.data.materials.get(name)
    if m is not None and m.get("recipe") == recipe: return m
    if m is None: m = bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    # Cycles: real glass
    out_c = nt.nodes.new("ShaderNodeOutputMaterial"); out_c.target = 'CYCLES'; out_c.location = (300, 200)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.location = (0, 200); nt.links.new(b.outputs[0], out_c.inputs[0])
    b.inputs["Base Color"].default_value = (*GLASS_TINT, 1)
    b.inputs["Roughness"].default_value = GLASS_ROUGH
    b.inputs["IOR"].default_value = 1.5
    if "Transmission Weight" in b.inputs: b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Alpha"].default_value = 1.0
    # Eevee (the editor's Material Preview): plain see-through glass
    out_e = nt.nodes.new("ShaderNodeOutputMaterial"); out_e.target = 'EEVEE'; out_e.location = (300, -300)
    e = nt.nodes.new("ShaderNodeBsdfPrincipled"); e.location = (0, -300); nt.links.new(e.outputs[0], out_e.inputs[0])
    e.inputs["Base Color"].default_value = (0.75, 0.82, 0.85, 1)
    e.inputs["Roughness"].default_value = 0.04
    e.inputs["IOR"].default_value = 1.5
    e.inputs["Alpha"].default_value = 0.25                            # plain alpha blending: Eevee's own transmission speckles in the viewport
    out_e.is_active_output = False; out_c.is_active_output = True        # the wear layer wears the active (Cycles) output's BSDF
    try: m.surface_render_method = 'BLENDED'                             # Eevee only; Cycles ignores it
    except Exception: pass
    m.diffuse_color = (0.55, 0.62, 0.64, 0.35)                          # the Solid view: a see-through blue-grey
    m["recipe"] = recipe
    return m

def mat_brass():
    m, bsdf = _base("PORTAL_brass")
    if not bsdf: return m
    bsdf.inputs["Base Color"].default_value = (0.80, 0.58, 0.22, 1)
    bsdf.inputs["Metallic"].default_value = 1.0; bsdf.inputs["Roughness"].default_value = 0.32
    return m

def mat_iron():
    m, bsdf = _base("PORTAL_iron")
    if not bsdf: return m
    bsdf.inputs["Base Color"].default_value = (0.02, 0.018, 0.016, 1)
    bsdf.inputs["Metallic"].default_value = 0.6; bsdf.inputs["Roughness"].default_value = 0.45
    return m

def mat_dark_wood():
    m, bsdf = _base("PORTAL_dark_wood")
    if not bsdf: return m
    bsdf.inputs["Base Color"].default_value = (0.10, 0.045, 0.02, 1); bsdf.inputs["Roughness"].default_value = 0.5
    return m

def mat_glazed_brick(name, along='Y'):
    """Glossy glazed brick; `along` = world axis the courses run along ('X' for walls facing +/-y, 'Y' for walls facing +/-x)."""
    m, bsdf = _base(name)
    if not bsdf: return m
    nt = m.node_tree; tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs["X" if along == 'X' else "Y"], comb.inputs["X"]); nt.links.new(sep.outputs["Z"], comb.inputs["Y"])
    brick = nt.nodes.new("ShaderNodeTexBrick"); brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Brick Width"].default_value = 0.23; brick.inputs["Row Height"].default_value = 0.068; brick.inputs["Mortar Size"].default_value = 0.008
    brick.inputs["Color1"].default_value = (0.19, 0.095, 0.042, 1); brick.inputs["Color2"].default_value = (0.13, 0.06, 0.028, 1); brick.inputs["Mortar"].default_value = (0.10, 0.07, 0.05, 1)
    brick.inputs["Bias"].default_value = 0.0
    nt.links.new(comb.outputs[0], brick.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = 'MULTIPLY'; mix.inputs["Fac"].default_value = 0.3
    nt.links.new(brick.outputs["Color"], mix.inputs["Color1"]); nt.links.new(noise.outputs["Color"], mix.inputs["Color2"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35; bump.inputs["Distance"].default_value = 0.01
    nt.links.new(brick.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.22
    if "Coat Weight" in bsdf.inputs: bsdf.inputs["Coat Weight"].default_value = 0.6
    return m

# The tile floors (recess and vestibule): the project owner's octagon-and-dot tile image (user 2026-09-28: "one is the
# floor texture to use ... do not distort the images; keep the floor shiny"), installed as
# assets/public/textures/bradbury_portal/floor_octagon_tiles.png. It tiles seamlessly as a square of two octagons each
# way, so it is laid in the floor objects' own metres at one scale on both axes, FLOOR_REPEAT_M a repeat: 0.20 m
# octagons, read off the owner's atrium photo, whose octagons repeat at about the height of the staircase's bottom
# step. The polish is the diagonal checker's that it replaced (a procedural checker at 0.15 m, turned 45 degrees).
# The material is rebuilt IN PLACE when its recipe changes, so every floor already using it follows.
FLOOR_TEX = ("textures", "bradbury_portal", "floor_octagon_tiles.png")
FLOOR_REPEAT_M = 0.40            # the image's repeat in metres, both ways alike: two 0.20 m octagons
FLOOR_ROUGH, FLOOR_COAT = 0.18, 0.5   # polished encaustic tile, as the checker had it
def mat_tile_floor():
    name = "PORTAL_tile_floor"; recipe = f"image {'/'.join(FLOOR_TEX)} repeat {FLOOR_REPEAT_M} rough {FLOOR_ROUGH} coat {FLOOR_COAT}"
    m = bpy.data.materials.get(name)
    if m is not None and m.get("recipe") == recipe: return m
    if m is None: m = bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs[0], out.inputs[0])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping"); mapping.inputs["Scale"].default_value = (1.0 / FLOOR_REPEAT_M, 1.0 / FLOOR_REPEAT_M, 1.0)
    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    fp = os.path.join(_repo_root(), "assets", "public", *FLOOR_TEX); assert os.path.isfile(fp), f"missing {fp}"
    im = bpy.data.images.load(fp, check_existing=True); im.colorspace_settings.name = 'sRGB'
    try: im.filepath = bpy.path.relpath(fp)
    except ValueError: pass
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = im; tex.extension = 'REPEAT'; tex.interpolation = 'Cubic'
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"]); nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = FLOOR_ROUGH
    if "Coat Weight" in bsdf.inputs: bsdf.inputs["Coat Weight"].default_value = FLOOR_COAT
    m.diffuse_color = (0.73, 0.57, 0.42, 1.0)                      # the Solid view: the image's mean colour, linear
    m["recipe"] = recipe
    return m

def mat_photo_projection(name, rel, strength, cx, cy, f):
    """A photograph projected from its own camera onto stand-in geometry: camera projection mapping, done per shaded
    point so it stays exact on faces of any size. The object carrying it has its origin AT the photo's camera, its
    local axes x right, y the viewing direction, z up, so a point's Object coordinates (x, y, z) image at pixel
    u = cx + f x / y, v = cy - f z / y of the photo (from its top-left corner): the photo's vanishing point (cx, cy)
    and focal length f in pixels. Emitted at strength, lit by nothing; back faces are transparent, so the stand-in
    only shows from its own camera's side. rel is a path under assets/public. Rebuilt on every call."""
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    fp = os.path.join(_repo_root(), "assets", "public", *rel); assert os.path.isfile(fp), f"missing {fp}"
    im = bpy.data.images.load(fp, check_existing=True); im.colorspace_settings.name = 'sRGB'
    try: im.filepath = bpy.path.relpath(fp)
    except ValueError: pass
    W, H = im.size
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    def op(kind, a, b):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = kind
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)): n.inputs[i].default_value = float(v)
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    U = op('ADD', op('MULTIPLY', op('DIVIDE', sep.outputs["X"], sep.outputs["Y"]), f / W), cx / W)            # u / W
    V = op('ADD', op('MULTIPLY', op('DIVIDE', sep.outputs["Z"], sep.outputs["Y"]), f / H), 1.0 - cy / H)      # 1 - v / H (Blender's V runs up)
    uvw = nt.nodes.new("ShaderNodeCombineXYZ"); nt.links.new(U, uvw.inputs["X"]); nt.links.new(V, uvw.inputs["Y"])
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = im; tex.extension = 'EXTEND'; tex.interpolation = 'Cubic'
    nt.links.new(uvw.outputs[0], tex.inputs["Vector"])
    em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(tex.outputs["Color"], em.inputs["Color"]); em.inputs["Strength"].default_value = strength
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); geo = nt.nodes.new("ShaderNodeNewGeometry")
    mix = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(em.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(mix.outputs[0], out.inputs[0])
    m.diffuse_color = (0.45, 0.30, 0.20, 1.0)
    return m, im

def mat_matte_copy(src, name, roughness):
    """src with its clear coat taken off and its roughness raised: a satin finish that does not mirror at grazing
    angles. Rebuilt on every call."""
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = src.copy(); m.name = name
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = 0.0
    return m

def mat_plain(name, color, roughness=0.5, metallic=0.0, coat=0.0):
    m, bsdf = _base(name)
    if not bsdf: return m
    bsdf.inputs["Base Color"].default_value = (*color, 1); bsdf.inputs["Roughness"].default_value = roughness; bsdf.inputs["Metallic"].default_value = metallic
    if coat and "Coat Weight" in bsdf.inputs: bsdf.inputs["Coat Weight"].default_value = coat
    return m

def mat_oak_light():
    m, bsdf = _base("PORTAL_oak_light")
    if not bsdf: return m
    nt = m.node_tree; tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave"); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs["Scale"].default_value = 30.0; wave.inputs["Distortion"].default_value = 6.0; wave.inputs["Detail"].default_value = 3.0
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.15; ramp.color_ramp.elements[0].color = (0.22, 0.10, 0.04, 1)
    ramp.color_ramp.elements[1].position = 0.90; ramp.color_ramp.elements[1].color = (0.36, 0.19, 0.08, 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.45
    if "Coat Weight" in bsdf.inputs: bsdf.inputs["Coat Weight"].default_value = 0.25
    return m

# The portal's stone (user 2026-09-18): the block's dressed-sandstone PBR set, assets/public/pbr/bradbury_sandstone_dressed
# (made by make_sandstone_pbr.py next to this file), box-projected on object coordinates and gained per channel onto
# SANDSTONE_SRGB, the tone of the block's ground-floor moulding (assemble_building.py, STONE_RATIO on the brick's mean),
# with the set's roughness, occlusion and normal map. The pieces exec this file, so the repository is found from the
# piece's LIB path, from __file__ when there is one, or from the open .blend's place under tests/artifacts; if the set
# is not there, the old noise ramp stands in, about the same tone.
SANDSTONE_SRGB = (178, 111, 86)
def _repo_root():
    cands = []
    g = globals()
    if "__file__" in g: cands.append(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(g["__file__"])), *([".."] * 6))))
    if "LIB" in g: cands.append(os.path.abspath(os.path.join(os.path.dirname(g["LIB"]), *([".."] * 6))))
    if bpy.data.filepath: cands.append(os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), *([".."] * 5))))
    for c in cands:
        if os.path.isdir(os.path.join(c, "assets", "public", "pbr")): return c
    return cands[-1] if cands else os.getcwd()
def sandstone_dir(): return os.path.join(_repo_root(), "assets", "public", "pbr", "bradbury_sandstone_dressed")
def _srgb_to_lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def fill_sandstone(m, joints=False):
    # builds the material's nodes afresh (also used to rebuild an existing material in place)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs[0], out.inputs[0])
    tc = nt.nodes.new("ShaderNodeTexCoord"); d = sandstone_dir(); target = tuple(_srgb_to_lin(v / 255.0) for v in SANDSTONE_SRGB)
    if os.path.exists(os.path.join(d, "basecolor.jpg")):
        mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.5, 0.5, 0.5)     # the set is 2 m a side
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        def tex(fn, cs):
            fp = os.path.join(d, fn); im = bpy.data.images.load(fp, check_existing=True); im.name = "pbr_bradbury_sandstone_dressed_" + os.path.splitext(fn)[0]
            im.colorspace_settings.name = cs
            try: im.filepath = bpy.path.relpath(fp)
            except ValueError: pass
            tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = im; tn.projection = 'BOX'; tn.projection_blend = 0.25
            nt.links.new(mp.outputs["Vector"], tn.inputs["Vector"]); return tn, im
        base, base_im = tex("basecolor.jpg", 'sRGB'); arm, _ = tex("arm.png", 'Non-Color'); nrm, _ = tex("normal_gl.png", 'Non-Color')
        import numpy as np
        a = np.empty(base_im.size[0] * base_im.size[1] * 4, dtype=np.float32); base_im.pixels.foreach_get(a); a = a.reshape(-1, 4)[:, :3].astype(np.float64)
        mean = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4).mean(0)
        g = nt.nodes.new("ShaderNodeMix"); g.data_type = 'RGBA'; g.blend_type = 'MULTIPLY'; g.inputs["Factor"].default_value = 1.0
        nt.links.new(base.outputs["Color"], next(i for i in g.inputs if i.identifier == "A_Color"))
        next(i for i in g.inputs if i.identifier == "B_Color").default_value = (float(target[0] / mean[0]), float(target[1] / mean[1]), float(target[2] / mean[2]), 1.0)
        sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
        ao = nt.nodes.new("ShaderNodeMix"); ao.data_type = 'RGBA'; ao.blend_type = 'MULTIPLY'; ao.inputs["Factor"].default_value = 1.0
        nt.links.new(next(o for o in g.outputs if o.identifier == "Result_Color"), next(i for i in ao.inputs if i.identifier == "A_Color"))
        nt.links.new(sep.outputs["Red"], next(i for i in ao.inputs if i.identifier == "B_Color"))
        col = next(o for o in ao.outputs if o.identifier == "Result_Color")
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 1.0
        nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 0.9; noise.inputs["Detail"].default_value = 8; noise.inputs["Roughness"].default_value = 0.62
        nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (target[0] * 0.75, target[1] * 0.75, target[2] * 0.75, 1)
        ramp.color_ramp.elements[1].position = 0.70; ramp.color_ramp.elements[1].color = (target[0] * 1.25, target[1] * 1.25, target[2] * 1.25, 1)
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"]); col = ramp.outputs["Color"]; bsdf.inputs["Roughness"].default_value = 0.88
    if joints:
        brick = nt.nodes.new("ShaderNodeTexBrick"); brick.inputs["Scale"].default_value = 1.0; brick.inputs["Mortar Size"].default_value = 0.006
        brick.inputs["Color1"].default_value = (1, 1, 1, 1); brick.inputs["Color2"].default_value = (0.96, 0.96, 0.96, 1); brick.inputs["Mortar"].default_value = (0.45, 0.45, 0.45, 1)
        brick.inputs["Brick Width"].default_value = 1.5; brick.inputs["Row Height"].default_value = 0.6
        nt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
        jm = nt.nodes.new("ShaderNodeMixRGB"); jm.blend_type = 'MULTIPLY'; jm.inputs["Fac"].default_value = 1.0
        nt.links.new(col, jm.inputs["Color1"]); nt.links.new(brick.outputs["Color"], jm.inputs["Color2"]); col = jm.outputs["Color"]
    nt.links.new(col, bsdf.inputs["Base Color"])
    m.diffuse_color = (target[0], target[1], target[2], 1.0)
    return m
def mat_sandstone(name="PORTAL_sandstone", joints=False):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    return fill_sandstone(m, joints)

# ---------------------------------------------------------------- bmesh primitives (world coordinates)
def mesh_from_bm(name, bm, mat, coll, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    return o
def tf(bm, verts, M): bmesh.ops.transform(bm, matrix=M, verts=verts)
def cube(bm, x0, x1, y0, y1, z0, z1):
    r = bmesh.ops.create_cube(bm, size=1.0)
    tf(bm, r["verts"], Matrix.Translation(((x0+x1)/2, (y0+y1)/2, (z0+z1)/2)) @ Matrix.Diagonal((x1-x0, y1-y0, z1-z0, 1)))
    return r["verts"]
def ellipsoid(bm, c, rx, ry, rz, u=12, v=8):
    r = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    tf(bm, r["verts"], Matrix.Translation(c) @ Matrix.Diagonal((rx, ry, rz, 1)))
    return r["verts"]
def frustum(bm, c, r0, r1, h, segs=24):
    """Vertical cone frustum, r0 at the bottom, r1 at the top, base centre c."""
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r0, radius2=r1, depth=h)
    tf(bm, r["verts"], Matrix.Translation((c[0], c[1], c[2] + h/2)))
    return r["verts"]
def cylinder(bm, c, axis, r0, r1, length, segs=16):
    """Cylinder/frustum along `axis` ('X','Y','Z'), centred at c."""
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r0, radius2=r1, depth=length)
    rot = {'X': Matrix.Rotation(math.pi/2, 4, 'Y'), 'Y': Matrix.Rotation(-math.pi/2, 4, 'X'), 'Z': Matrix.Identity(4)}[axis]
    tf(bm, r["verts"], Matrix.Translation(c) @ rot)
    return r["verts"]
def torus(bm, c, R, r, M=None, useg=24, vseg=10, a0=0.0, a1=2*math.pi, scale_xy=(1.0, 1.0)):
    closed = abs((a1 - a0) - 2*math.pi) < 1e-6
    n = useg if closed else useg + 1
    verts = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / useg
        ring = []
        for j in range(vseg):
            b = 2*math.pi * j / vseg
            p = Vector(((R + r*math.cos(b)) * math.cos(a) * scale_xy[0], (R + r*math.cos(b)) * math.sin(a) * scale_xy[1], r*math.sin(b)))
            if M: p = M @ p
            ring.append(bm.verts.new(p + Vector(c)))
        verts.append(ring)
    for i in range(n if closed else n - 1):
        A = verts[i]; B = verts[(i+1) % n]
        for j in range(vseg): bm.faces.new((A[j], B[j], B[(j+1) % vseg], A[(j+1) % vseg]))
    if not closed:
        bm.faces.new(tuple(reversed(verts[0]))); bm.faces.new(tuple(verts[-1]))
def loft_closed(bm, corners, inward, out_dir, profile):
    """Molding around a closed polygon. corners: 3D points in order; inward[i]: unit vector pointing into
    the polygon for the edge corners[i]->corners[i+1]; out_dir: unit vector for the profile's second axis;
    profile: closed list of (o, n): o along the mitred inward direction, n along out_dir."""
    k = len(corners); rings = []
    for i in range(k):
        a = inward[(i-1) % k]; b = inward[i]
        m = (a + b).normalized(); m = m / max(0.2, m.dot(a))
        P = Vector(corners[i])
        rings.append([bm.verts.new(P + m*o + out_dir*n) for (o, n) in profile])
    q = len(profile)
    for i in range(k):
        A = rings[i]; B = rings[(i+1) % k]
        for j in range(q): bm.faces.new((A[j], A[(j+1)%q], B[(j+1)%q], B[j]))
def rect_molding(bm, x0, x1, z0, z1, y_face, profile):
    """Molding around a rectangle in the XZ plane (door face at y_face); profile (o inward, n toward -y)."""
    corners = [Vector((x0, y_face, z0)), Vector((x1, y_face, z0)), Vector((x1, y_face, z1)), Vector((x0, y_face, z1))]
    inward = [Vector((0, 0, 1)), Vector((-1, 0, 0)), Vector((0, 0, -1)), Vector((1, 0, 0))]
    loft_closed(bm, corners, inward, Vector((0, -1, 0)), profile)
def sweep(bm, path, profile, zbase):
    """Closed (o, z) profile swept along an open polyline in the XY plane with mitred corners; o = left of travel."""
    n = len(path); normals = []
    for i in range(n-1):
        d = (Vector(path[i+1]) - Vector(path[i])).normalized(); normals.append(Vector((-d.y, d.x)))
    rings = []
    for i in range(n):
        if i == 0: m = normals[0]
        elif i == n-1: m = normals[-1]
        else:
            a, b = normals[i-1], normals[i]; m = (a + b).normalized(); m = m / max(0.2, m.dot(a))
        P = Vector(path[i]); rings.append([bm.verts.new((P.x + m.x*o, P.y + m.y*o, zbase + z)) for (o, z) in profile])
    k = len(profile)
    for i in range(n-1):
        for j in range(k): bm.faces.new((rings[i][j], rings[i][(j+1)%k], rings[i+1][(j+1)%k], rings[i+1][j]))
    bm.faces.new(tuple(reversed(rings[0]))); bm.faces.new(tuple(rings[-1]))
def spiral_tube(bm, center, normal_dir, tangent_dir, up_dir, r0, turns=1.75, tube=0.02, decay=0.60, segs=44):
    pts = []
    for i in range(segs + 1):
        t = turns * 2*math.pi * i / segs; r = r0 * decay ** (t / (2*math.pi))
        pts.append(Vector(center) + tangent_dir * (r*math.cos(t)) + up_dir * (r*math.sin(t)))
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i+1, segs)] - pts[max(i-1, 0)]).normalized(); a = normal_dir; b = d.cross(a).normalized()
        rr = tube * (0.35 + 0.65 * (1 - i/segs))
        rings.append([bm.verts.new(p + (a*math.cos(ph) + b*math.sin(ph)) * rr) for ph in [2*math.pi*k/6 for k in range(6)]])
    for i in range(segs):
        for k in range(6): bm.faces.new((rings[i][k], rings[i][(k+1)%6], rings[i+1][(k+1)%6], rings[i+1][k]))
    bm.faces.new(tuple(reversed(rings[0]))); bm.faces.new(tuple(rings[-1]))
def leaf(bm, base, tangent, up, normal, width, height, curl=1.0, thick=0.018, lobes=3, n=22, serration=0.16):
    prof = []
    for i in range(n + 1):
        v = i / n
        wv = math.sin(math.pi * v ** 0.62) * 0.5 * (1 + serration * abs(math.sin(math.pi * lobes * v)))
        prof.append((wv * width, v * height))
    outline = prof + [(-u, vv) for (u, vv) in reversed(prof[1:-1])]
    pivot = 0.52 * height
    def pos(u, v, off):
        if v <= pivot: return Vector(base) + tangent*u + up*v + normal*off
        th = curl * ((v - pivot) / (height - pivot)) ** 1.4; dv = v - pivot
        return Vector(base) + tangent*u + up*pivot + up*(dv*math.cos(th)) + normal*(dv*math.sin(th) + off)
    front = [bm.verts.new(pos(u, v, thick)) for (u, v) in outline]; back = [bm.verts.new(pos(u, v, 0.0)) for (u, v) in outline]
    m = len(outline); bm.faces.new(front); bm.faces.new(tuple(reversed(back)))
    for i in range(m): bm.faces.new((back[i], back[(i+1)%m], front[(i+1)%m], front[i]))

# ---------------------------------------------------------------- carved capital (composite): used at several sizes across the portal
def capital_mesh(name, w, h, mat, coll):
    """Origin at the base centre, +y = toward the viewer side is irrelevant (4-way symmetric). Leaf bell with two
    staggered rows of curling acanthus leaves, Ionic corner volutes, egg-and-dart echinus, molded abacus with rosettes."""
    bm = bmesh.new()
    frustum(bm, (0, 0, 0.02), 0.30*w, 0.40*w, 0.84*h, 28)
    torus(bm, (0, 0, 0.035), 0.33*w, 0.03*h, None, 28, 8)
    for row, (z0, lh, lw, n, off, rad) in enumerate(((0.04, 0.42*h, 0.19*w, 10, 0.0, 0.31*w), (0.30*h, 0.48*h, 0.20*w, 10, math.pi/10, 0.36*w))):
        for i in range(n):
            a = off + 2*math.pi*i/n
            nrm = Vector((math.cos(a), math.sin(a), 0)); tan = Vector((-math.sin(a), math.cos(a), 0))
            base = nrm * rad + Vector((0, 0, z0))
            leaf(bm, base, tan, (Vector((0, 0, 1)) + nrm*0.10).normalized(), nrm, lw, lh, curl=0.95 if row else 0.8, thick=0.025*w/0.78 + 0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            nrm = Vector((sx, sy, 0)).normalized(); tan = Vector((-nrm.y, nrm.x, 0))
            spiral_tube(bm, Vector((sx*0.41*w, sy*0.41*w, 0.72*h)), nrm, tan, Vector((0, 0, 1)), 0.11*w, 1.75, 0.022*w)
    torus(bm, (0, 0, 0.845*h), 0.42*w, 0.022*h, None, 32, 8)
    for i in range(16):
        a = 2*math.pi*(i + 0.5)/16
        ellipsoid(bm, (0.44*w*math.cos(a), 0.44*w*math.sin(a), 0.875*h), 0.03*w, 0.03*w, 0.028*h, 8, 6)
    cube(bm, -0.56*w, 0.56*w, -0.56*w, 0.56*w, 0.90*h, 0.97*h)
    cube(bm, -0.59*w, 0.59*w, -0.59*w, 0.59*w, 0.96*h, 1.0*h)
    for a in (0, math.pi/2, math.pi, -math.pi/2):
        c = Vector((0.57*w*math.cos(a), 0.57*w*math.sin(a), 0.935*h))
        M = Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi/2, 4, 'Y')
        torus(bm, c, 0.045*w, 0.018*w, M, 16, 6); ellipsoid(bm, c + Vector((0.02*w*math.cos(a), 0.02*w*math.sin(a), 0)), 0.03*w, 0.03*w, 0.03*w, 8, 6)
    return mesh_from_bm(name, bm, mat, coll, smooth=True)
def tube_from_points(bm, points, radii, bevel_res=3, close=False):
    """Append a beveled tube following `points` (world coords) with per-point radii, via a temporary POLY curve."""
    cu = bpy.data.curves.new("_tube", 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = bevel_res; cu.fill_mode = 'FULL'
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1); sp.use_cyclic_u = close
    for p, (x, y, z), r in zip(sp.points, points, radii): p.co = (x, y, z, 1.0); p.radius = r
    o = bpy.data.objects.new("_tube", cu); bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update(); deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    bm.from_mesh(me)
    bpy.data.objects.remove(o, do_unlink=True); bpy.data.curves.remove(cu); bpy.data.meshes.remove(me)
def spiral_points(center, u_dir, v_dir, r0, turns, decay, segs, start_angle=0.0, direction=1.0):
    """Logarithmic spiral in the plane (u_dir, v_dir): starts at radius r0 and winds inward."""
    pts = []
    for i in range(segs + 1):
        t = turns * 2*math.pi * i / segs
        r = r0 * decay ** (t / (2*math.pi))
        a = start_angle + direction * t
        pts.append(Vector(center) + u_dir * (r*math.cos(a)) + v_dir * (r*math.sin(a)))
    return pts
def s_scroll_points(p0, p1, p2, u_dir, v_dir, spiral_r, turns, segs=40):
    """An S-shaped stem (quadratic Bezier p0->p1->p2, in the (u,v) plane through 3D points) ending in a spiral at p2."""
    pts = []
    for i in range(segs + 1):
        t = i / segs
        pts.append((1-t)**2 * Vector(p0) + 2*(1-t)*t * Vector(p1) + t**2 * Vector(p2))
    # spiral tangent-continuous-ish: start on the far side of the centre and wind in
    tangent = (pts[-1] - pts[-2]).normalized()
    centre = Vector(p2) + tangent * spiral_r
    a0 = math.atan2((-tangent).dot(v_dir), (-tangent).dot(u_dir))
    sign = 1.0 if (u_dir.cross(v_dir)).dot((Vector(p2) - Vector(p0)).cross(tangent)) >= 0 else -1.0
    pts += spiral_points(centre, u_dir, v_dir, spiral_r, turns, 0.62, int(28*turns), a0, sign)[1:]
    return pts

def capital_pilaster(name, w, h, mat, coll):
    """Three-sided pilaster capital traced from the reference: a square leaf bell with a row of acanthus leaves,
    two mirrored S-scrolls per face curling into snail spirals under the abacus corners, big corner volutes,
    and a molded abacus with chamfered corners (front + two angled sides). Origin at the base centre."""
    bm = bmesh.new()
    torus(bm, (0, 0, 0.025), 0.50*w, 0.022*h, None, 32, 8)                                   # neck astragal
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.62*w, radius2=0.72*w, depth=0.78*h)   # square bell
    tf(bm, r["verts"], Matrix.Translation((0, 0, 0.03 + 0.39*h)) @ Matrix.Rotation(math.pi/4, 4, 'Z'))
    faces = [(Vector((1, 0, 0)), Vector((0, 1, 0))), (Vector((-1, 0, 0)), Vector((0, -1, 0))), (Vector((0, 1, 0)), Vector((-1, 0, 0))), (Vector((0, -1, 0)), Vector((1, 0, 0)))]
    for nrm, tan in faces:
        face_at = lambda u, v, out=0.0: nrm * (0.46*w + 0.04*w*(v/h) + out) + tan * u + Vector((0, 0, v))
        # acanthus leaves along the bottom of the face (three per face), the outer two leaning to the corners
        for k, u in enumerate((-0.30*w, 0.0, 0.30*w)):
            lean = (k - 1) * 0.35
            up = (Vector((0, 0, 1)) + tan * lean + nrm * 0.12).normalized()
            leaf(bm, face_at(u, 0.04, 0.0), tan, up, nrm, 0.24*w, 0.36*h, curl=0.9, thick=0.02, lobes=3)
        # the two mirrored S-scrolls: bold stems from the face centre under the abacus, out and down into snails at the corners
        for s in (-1, 1):
            p0 = face_at(s*0.03*w, 0.66*h, 0.03*w); p1 = face_at(s*0.24*w, 0.74*h, 0.07*w); p2 = face_at(s*0.40*w, 0.56*h, 0.07*w)
            pts = s_scroll_points(p0, p1, p2, tan * s, Vector((0, 0, 1)), 0.10*w, 1.4)
            radii = [0.034*w * (1.0 - 0.5 * i/len(pts)) for i in range(len(pts))]
            tube_from_points(bm, pts, radii)
            # a small leaf sprouting from the stem
            leaf(bm, face_at(s*0.15*w, 0.44*h, 0.03*w), tan, (Vector((0, 0, 1)) + tan*s*0.5).normalized(), nrm, 0.14*w, 0.24*h, curl=0.6, thick=0.014, lobes=3)
    # big corner volutes: bold vertical snail spirals in the diagonal planes, hanging from the abacus corners
    for sx in (-1, 1):
        for sy in (-1, 1):
            nrm = Vector((sx, sy, 0)).normalized(); tan = Vector((-nrm.y, nrm.x, 0))
            centre = nrm * 0.70*w + Vector((0, 0, 0.60*h))
            pts = spiral_points(centre, tan, Vector((0, 0, 1)), 0.17*w, 1.5, 0.58, 52, math.pi/2, -1.0)
            radii = [0.048*w * (1.0 - 0.55 * i/len(pts)) for i in range(len(pts))]
            tube_from_points(bm, pts, radii)
            leaf(bm, nrm * 0.60*w + Vector((0, 0, 0.06)), tan, (Vector((0, 0, 1)) + nrm*0.25).normalized(), nrm, 0.22*w, 0.44*h, curl=1.0, thick=0.02, lobes=3)
    # abacus: two molded tiers with chamfered corners (front face + two angled faces), a small rosette centred on each face
    def chamfered(bm, half, z0, z1, c):
        pts = [(half - c, -half), (half, -half + c), (half, half - c), (half - c, half), (-half + c, half), (-half, half - c), (-half, -half + c), (-half + c, -half)]
        vb = [bm.verts.new((x, y, z0)) for (x, y) in pts]; vt = [bm.verts.new((x, y, z1)) for (x, y) in pts]
        bm.faces.new(tuple(reversed(vb))); bm.faces.new(tuple(vt))
        for i in range(8): bm.faces.new((vb[i], vb[(i+1)%8], vt[(i+1)%8], vt[i]))
    chamfered(bm, 0.66*w, 0.82*h, 0.89*h, 0.20*w)
    chamfered(bm, 0.72*w, 0.89*h, 0.95*h, 0.22*w)
    chamfered(bm, 0.76*w, 0.95*h, 1.00*h, 0.24*w)
    for nrm, tan in faces:
        c = nrm * 0.76*w + Vector((0, 0, 0.92*h))
        M = Matrix.Rotation(math.atan2(nrm.y, nrm.x), 4, 'Z') @ Matrix.Rotation(math.pi/2, 4, 'Y')
        torus(bm, c, 0.045*w, 0.016*w, M, 16, 6); ellipsoid(bm, c + nrm*0.02*w, 0.03*w, 0.03*w, 0.03*w, 8, 6)
    return mesh_from_bm(name, bm, mat, coll, smooth=True)
def capital_volute(name, w, h, mat, coll):
    """Capital redrawn from the entablature photo: a row of edged acanthus leaves at the bottom, bold snail volutes
    at the corners rising on the diagonal, a crown on each face (a curved band from the middle up to small curls at
    the top corners, with a bud and a small palmette), and a plain two-tier abacus with a boss. Origin at the base centre."""
    bm = bmesh.new()
    torus(bm, (0, 0, 0.025), 0.50*w, 0.022*h, None, 32, 8)                                   # neck astragal
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.62*w, radius2=0.74*w, depth=0.80*h)   # square bell
    tf(bm, r["verts"], Matrix.Translation((0, 0, 0.03 + 0.40*h)) @ Matrix.Rotation(math.pi/4, 4, 'Z'))
    Z = Vector((0, 0, 1))
    faces = [(Vector((1, 0, 0)), Vector((0, 1, 0))), (Vector((-1, 0, 0)), Vector((0, -1, 0))), (Vector((0, 1, 0)), Vector((-1, 0, 0))), (Vector((0, -1, 0)), Vector((1, 0, 0)))]
    for nrm, tan in faces:
        face_at = lambda u, v, out=0.0: nrm * (0.44*w + 0.06*w*(v/h) + out) + tan * u + Z * v
        # bottom row: three edged acanthus leaves per face, tips curling out; the outer ones lean to the corners
        for k, u in enumerate((-0.30*w, 0.0, 0.30*w)):
            lean = (k - 1) * 0.25
            up = (Z + tan*lean + nrm*0.10).normalized()
            leaf(bm, face_at(u, 0.05*h), tan, up, nrm, 0.27*w, 0.46*h, curl=1.1, thick=0.02, lobes=3, n=30, serration=0.24)
        # crown: a curved band on the face, from the middle up to both top corners where it curls into small snails,
        # with a bud and a small palmette of edged leaves in the middle
        for s in (-1, 1):
            p0 = face_at(s*0.02*w, 0.50*h, 0.04*w); p1 = face_at(s*0.22*w, 0.56*h, 0.07*w); p2 = face_at(s*0.36*w, 0.74*h, 0.07*w)
            pts = s_scroll_points(p0, p1, p2, tan * s, Z, 0.075*w, 1.3)
            radii = [0.030*w * (1.0 - 0.55 * i/len(pts)) for i in range(len(pts))]
            tube_from_points(bm, pts, radii)
        for ang in (-0.45, 0.0, 0.45):
            up = (Z*math.cos(ang) + tan*math.sin(ang)).normalized(); tn = (tan*math.cos(ang) - Z*math.sin(ang)).normalized()
            leaf(bm, face_at(0.0, 0.52*h, 0.05*w), tn, up, nrm, 0.10*w, 0.32*h, curl=0.55, thick=0.014, lobes=2, n=16, serration=0.25)
        ellipsoid(bm, face_at(0.0, 0.55*h, 0.09*w), 0.05*w, 0.045*w, 0.05*w, 10, 6)
    # corner volutes rising on the diagonal: a bold stem climbs from the leaf ring at each corner, out along the
    # diagonal, and winds into a snail eye under the abacus corner (in the plane facing the diagonal)
    for sx in (-1, 1):
        for sy in (-1, 1):
            nrm = Vector((sx, sy, 0)).normalized(); tan = Vector((-nrm.y, nrm.x, 0))
            p0 = nrm * 0.50*w + Z * 0.14*h; p1 = nrm * 0.66*w + Z * 0.42*h; p2 = nrm * 0.74*w + Z * 0.62*h
            pts = s_scroll_points(p0, p1, p2, tan, Z, 0.15*w, 1.4)
            radii = [0.052*w * (1.0 - 0.6 * i/len(pts)) for i in range(len(pts))]
            tube_from_points(bm, pts, radii)
    # abacus: plain fillet + slab, a boss centred on each face
    cube(bm, -0.56*w, 0.56*w, -0.56*w, 0.56*w, 0.85*h, 0.92*h)
    cube(bm, -0.61*w, 0.61*w, -0.61*w, 0.61*w, 0.92*h, 1.00*h)
    for nrm, tan in faces:
        ellipsoid(bm, nrm*0.61*w + Z*0.96*h, 0.045*w, 0.045*w, 0.03*h, 10, 6)
    return mesh_from_bm(name, bm, mat, coll, smooth=True)
def mark_sharp(obj, angle_deg=30.0):
    """Split the smooth shading at creases: mark every edge whose two faces meet at more than angle_deg as sharp,
    on the mesh itself (bmesh edge flags do not survive to_mesh in Blender 5.x)."""
    me = obj.data
    bm2 = bmesh.new(); bm2.from_mesh(me); bm2.edges.ensure_lookup_table()
    sharp = [e.index for e in bm2.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(angle_deg)]
    bm2.free()
    for i in sharp: me.edges[i].use_edge_sharp = True
    me.update()
    return len(sharp)
DOOR_Y = -0.55                                                   # street-side plane of the door leaves, 2.35 m behind the pilaster face: the pier-to-door gap (1.67 from the back piers) cut by 15% on request; pieces 01/03 are built at y 0 and shifted here, 04 ends its recess against it
CAPITAL_DEPTH = 0.85 / 0.725                                     # 1.17: the capital runs the full depth of its pillar (0.85 on the pilasters; on the piers its back touches the pilaster). The capital's depth as a fraction of its front width
def capital_v2(name, w, h, mat, coll, d=None, stage=1):
    """Engaged pilaster capital rebuilt from scratch (ornaments/capital.py). Stage 1, base and support only.
    Base (neck): a straight band curving outward at its top, a vertical riser, a round bead; one profile swept
    around the front and both sides with sharp mitred corners. Bell: flares from the pilaster footprint (w wide,
    d deep); its faces are straight at the bottom and become concave in plan toward the top. Support (abacus):
    a straight band standing proud of the face that curves out, a riser and a round top, following the bell's concave
    outline, whose front corners are cut at 45 degrees with a slight convex bulge. The capital runs back CAPITAL_DEPTH x w along the sides and ends in a straight back plane.
    Origin at the neck centre; the front is -y."""
    d = d or w
    bm = bmesh.new()
    yf = -d/2; yb = yf + CAPITAL_DEPTH*w                         # front face at the neck; straight back plane
    # ---------------------------------------------------------------- base (neck)
    band, cove, riser, bead = 0.035*h, 0.022*w, 0.015*h, 0.030*w
    o1, o2 = 0.005*w, 0.005*w + cove
    z1 = band; z2 = z1 + cove; z3 = z2 + riser; z4 = z3 + 2*bead
    prof = [(0.0, 0.0), (o1, 0.0), (o1, z1)]
    for k in range(1, 9):                                        # cove: vertical at the start, horizontal at the end
        t = math.pi/2 * k / 8
        prof.append((o2 - cove*math.cos(t), z1 + cove*math.sin(t)))
    prof.append((o2, z3))
    for k in range(1, 12):                                       # bead: half-round bulging outward
        t = math.pi * k / 12
        prof.append((o2 + bead*math.sin(t), z3 + bead - bead*math.cos(t)))
    prof += [(o2, z4), (0.0, z4)]
    path = [(w/2, yb), (w/2, yf), (-w/2, yf), (-w/2, yb)]        # sharp 90-degree mitred corners at the front
    sweep(bm, path, prof, 0.0)
    v0 = [bm.verts.new((x, y, 0.0)) for x, y in path]; v1 = [bm.verts.new((x, y, z4)) for x, y in path]   # neck core
    bm.faces.new(tuple(reversed(v0))); bm.faces.new(tuple(v1))
    for i in range(len(path)): bm.faces.new((v0[i], v0[(i+1) % len(path)], v1[(i+1) % len(path)], v1[i]))
    # ---------------------------------------------------------------- support (abacus) profile, bottom to top
    st = 0.012*w                                                 # (1) the straight band stands slightly proud of the bell face (flat underside)
    a_band, a_cove, a_riser, a_bead = 0.040*h, 0.022*w, 0.015*h, 0.030*w
    a_h = a_band + a_cove + a_riser + 2*a_bead
    zt = h - a_h                                                 # bell top = abacus bottom
    # ---------------------------------------------------------------- bell: lofted, straight at the bottom, concave in plan toward the top
    f, s_max, c_max, K, m = 0.10*w, 0.05*w, 0.09*w, 8, 10
    def outline(t):
        """Plan outline at height fraction t, built from the right half and mirrored about the centre so both sides
        are identical: flare f, concave bow s and the 45-degree corner cut c all grow with t; the cut is slightly
        convex; the bows go to zero exactly at the cut. Runs from the right-back around the front to the left-back."""
        fk = f*t; sk = s_max*t*t; c = max(c_max*t*t, 0.002); xr = w/2 + fk; yk = yf - fk; r2 = math.sqrt(2)
        ys = yk + c                                                                                       # where the cut starts on the side
        right = []
        for i in range(m):                                                                                # side: back -> cut start (excluded)
            v = i/m; right.append((xr - sk*math.sin(math.pi*v), yb + (ys - yb)*v))
        for i in range(4):                                                                                # corner cut, u = 0 .. 1, a little convex
            u = i/3; bul = 0.10*c*math.sin(math.pi*u)
            right.append((xr - c*u + bul/r2, ys - c*u - bul/r2))
        xe = xr - c                                                                                       # front: cut end (excluded) -> centre (included)
        for i in range(1, m + 1):
            u = 0.5 * i/m; right.append((xe - 2*xe*u, yk + sk*math.sin(math.pi*u)))
        left = [(-x, y) for (x, y) in reversed(right[:-1])]                                              # mirror, without repeating the centre
        return right + left
    levels = []
    for k in range(K + 1):
        t = k/K; z = z4 + (zt - z4)*t
        levels.append([bm.verts.new((x, y, z)) for x, y in outline(t)])
    n = len(levels[0])
    for k in range(K):
        A, B = levels[k], levels[k+1]
        for i in range(n): bm.faces.new((A[i], A[(i+1) % n], B[(i+1) % n], B[i]))
    bm.faces.new(tuple(reversed(levels[0]))); bm.faces.new(tuple(levels[-1]))
    # ---------------------------------------------------------------- support (abacus): swept along the concave top outline
    top = outline(1.0)
    zA = zt + a_band; zB = zA + a_cove + a_riser; zTop = zB + 2*a_bead
    ob = st; oc = ob + a_cove
    aprof = [(0.0, zt), (st, zt), (ob, zA)]
    for k in range(1, 9):                                        # (2) straight band, then curving out
        t = math.pi/2 * k / 8
        aprof.append((oc - a_cove*math.cos(t), zA + a_cove*math.sin(t)))
    aprof.append((oc, zB))                                       # (3) straight up
    for k in range(1, 12):                                       # (4) round top
        t = math.pi * k / 12
        aprof.append((oc + a_bead*math.sin(t), zB + a_bead - a_bead*math.cos(t)))
    aprof += [(oc, zTop), (0.0, zTop)]
    sweep(bm, top, aprof, 0.0)
    c0 = [bm.verts.new((x, y, zt)) for x, y in top]; c1 = [bm.verts.new((x, y, zTop)) for x, y in top]   # abacus core
    bm.faces.new(tuple(reversed(c0))); bm.faces.new(tuple(c1))
    for i in range(n): bm.faces.new((c0[i], c0[(i+1) % n], c1[(i+1) % n], c1[i]))
    o = mesh_from_bm(name, bm, mat, coll, smooth=True)
    mark_sharp(o, 18.0)                                          # creases at the corners and the 45-degree corner cuts; the 15-degree bead facets stay smooth
    return o
ORNAMENTS_DIR = "C:/Users/rogel/Projects/bus_simulator_worktrees/buildings/tests/artifacts/blender/bradbury/portal_project/ornaments"   # generated ornament files (tests/artifacts); their scripts are next to this one
def linked_mesh(name, blend):
    """Mesh datablock LINKED (not appended) from an ornament file in ORNAMENTS_DIR: a live reference that follows
    the ornament file on reload. Returns the already-linked datablock when the file was linked before."""
    path = ORNAMENTS_DIR + "/" + blend
    for me in bpy.data.meshes:
        if me.name == name and me.library and os.path.normcase(os.path.abspath(bpy.path.abspath(me.library.filepath))) == os.path.normcase(os.path.abspath(path)):
            return me
    with bpy.data.libraries.load(path, link=True) as (data_from, data_to):
        data_to.meshes = [name]
    return data_to.meshes[0]
def ornament_instance(name, me, loc, coll, rot_z=0.0, scale=1.0):
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    o.location = loc; o.rotation_euler = (0.0, 0.0, rot_z)
    o.scale = tuple(scale) if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    return o
def apply_boolean(target, cutters):
    """Difference booleans through the depsgraph (works inside exec'd scripts), one cutter at a time; cut faces keep slot 0."""
    if not isinstance(cutters, (list, tuple)): cutters = [cutters]
    for cutter in cutters:
        mod = target.modifiers.new("cut", 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cutter; mod.solver = 'EXACT'
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        new_me = bpy.data.meshes.new_from_object(target.evaluated_get(deps))
        old = target.data
        target.modifiers.clear(); target.data = new_me
        new_me.materials.clear()
        for m in old.materials: new_me.materials.append(m)
        for p in new_me.polygons: p.material_index = 0
        bpy.data.meshes.remove(old); bpy.data.objects.remove(cutter, do_unlink=True)
def half_ring_xz(bm, cx, cz, r_in, r_out, y0, y1, segs=64):
    """Semicircular ring (springing to springing, opening upward) in the XZ plane, extruded from y0 to y1."""
    rings = []
    for y in (y0, y1):
        outer = [bm.verts.new((cx + r_out*math.cos(math.pi*i/segs), y, cz + r_out*math.sin(math.pi*i/segs))) for i in range(segs+1)]
        inner = [bm.verts.new((cx + r_in*math.cos(math.pi*i/segs), y, cz + r_in*math.sin(math.pi*i/segs))) for i in range(segs+1)]
        rings.append((outer, inner))
    (o0, i0), (o1, i1) = rings
    for i in range(segs):
        bm.faces.new((o0[i], o0[i+1], i0[i+1], i0[i])); bm.faces.new((o1[i], i1[i], i1[i+1], o1[i+1]))
        bm.faces.new((o0[i], o1[i], o1[i+1], o0[i+1])); bm.faces.new((i0[i], i0[i+1], i1[i+1], i1[i]))
    bm.faces.new((o0[0], i0[0], i1[0], o1[0])); bm.faces.new((o0[segs], o1[segs], i1[segs], i0[segs]))
def three_part_profile(D, w):
    """Sunken-panel edge used on the pilasters and the arch soffit (o inward, n toward the face; the field is n = 0,
    the face n = D): a tiny square step at the face, a convex quarter-round curving outward, a tiny square step to the field."""
    s_in, step_w, s_out = 0.010, 0.015, 0.012
    c_o, c_n = step_w, s_in
    r_o, r_n = w - 2*step_w, D - s_out - s_in
    prof = [(-0.003, D), (-0.003, -0.003), (w, -0.003), (w, s_in), (c_o + r_o, s_in)]
    for k in range(1, 9):
        t = math.pi/2 * k / 8
        prof.append((c_o + r_o*math.cos(t), c_n + r_n*math.sin(t)))
    prof += [(0.0, c_n + r_n), (0.0, D)]
    return prof
def rect_molding_xy(bm, x0, x1, y0, y1, z_face, profile):
    """Molding around a rectangle on a ceiling (XY plane at z_face); profile (o inward, n downward)."""
    corners = [Vector((x0, y0, z_face)), Vector((x1, y0, z_face)), Vector((x1, y1, z_face)), Vector((x0, y1, z_face))]
    inward = [Vector((0, 1, 0)), Vector((-1, 0, 0)), Vector((0, -1, 0)), Vector((1, 0, 0))]
    loft_closed(bm, corners, inward, Vector((0, 0, -1)), profile)
def place(src, name, loc, coll, rot_z=0.0, scale=1.0):
    o = bpy.data.objects.new(name, src.data); coll.objects.link(o)
    o.location = loc; o.rotation_euler = (0, 0, rot_z); o.scale = (scale, scale, scale)
    return o

# ---------------------------------------------------------------- scene rig
def setup_scene():
    S = bpy.context.scene
    S.unit_settings.system = 'METRIC'; S.unit_settings.scale_length = 1.0
    S.render.engine = 'BLENDER_EEVEE'; S.render.resolution_x = 1400; S.render.resolution_y = 1600; S.render.resolution_percentage = 100
    S.render.image_settings.file_format = 'PNG'
    world = S.world or bpy.data.worlds.new("World"); S.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg: bg.inputs[0].default_value = (0.62, 0.68, 0.78, 1.0); bg.inputs[1].default_value = 0.7
    rig = bpy.data.collections.get("RIG") or bpy.data.collections.new("RIG")
    if rig.name not in [c.name for c in S.collection.children]: S.collection.children.link(rig)
    if not bpy.data.objects.get("Sun"):
        sd = bpy.data.lights.new("Sun", 'SUN'); sd.energy = 3.0; sun = bpy.data.objects.new("Sun", sd); rig.objects.link(sun)
        sun.rotation_euler = Vector((0.45, 0.55, -0.7)).normalized().to_track_quat('-Z', 'Y').to_euler()
    return rig
def camera(name, loc, tgt, lens):
    rig = bpy.data.collections.get("RIG")
    o = bpy.data.objects.get(name)
    if not o:
        cd = bpy.data.cameras.new(name); o = bpy.data.objects.new(name, cd); rig.objects.link(o); cd.clip_end = 200
    o.location = Vector(loc); o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); o.data.lens = lens
    return o
def render(cam_name, path):
    S = bpy.context.scene; S.camera = bpy.data.objects[cam_name]; S.render.filepath = path; bpy.ops.render.render(write_still=True)
