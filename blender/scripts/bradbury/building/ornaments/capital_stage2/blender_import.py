"""Stage 2 into Blender: stage2_mesh.json (build.py) -> one object per piece, `s2_<piece>`, with the atlas materials
(basecolor x AO, tangent normal map, roughness, alpha clipped at 0.5), the blank's textured mouldings and plain clay
bell, the cards' walls in a darker plain clay and the drum's face on its own filled roll texture. The pieces every
placement shares (the front, the blank) go into the given collection, each placement's side faces into a child
collection `<collection>_<placement>` (build.py SIDES) that records its wall (`side_wall_mm`) and its crest
(`side_crest`, the atlas piece over its leaves, or empty). The images are packed into the .blend, so the capital file does not depend on the build cache. Used by
../capital.py."""
import bpy, bmesh, json, os, math

PREFIX = "capital_s2_"                                                    # materials and images


def _image(path, name, data_map=False):
    im = bpy.data.images.load(path, check_existing=False); im.name = PREFIX + name
    if data_map: im.colorspace_settings.name = "Non-Color"
    im.pack()
    return im


def _mat_atlas(name, imgs, clip, sides=False):
    """An atlas material from (basecolor, ao, normal, roughness); `sides` is the walls' variant: the picture's colour
    darkened to the shadowed side of the carving, no normal map."""
    m = bpy.data.materials.new(PREFIX + name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    def tex(img, loc):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.extension = "EXTEND"; t.interpolation = "Linear"; t.location = loc; return t
    bi, ai, ni, ri = imgs
    tb = tex(bi, (-700, 400)); tao = tex(ai, (-700, 100)); tn = tex(ni, (-700, -250)); tr = tex(ri, (-700, -550))
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.location = (-350, 350)
    mix.inputs["Factor"].default_value = 0.7
    nt.links.new(tb.outputs["Color"], mix.inputs[6]); nt.links.new(tao.outputs["Color"], mix.inputs[7])
    if sides:
        dark = nt.nodes.new("ShaderNodeMix"); dark.data_type = "RGBA"; dark.blend_type = "MULTIPLY"; dark.location = (-150, 350)
        dark.inputs["Factor"].default_value = 1.0; dark.inputs[7].default_value = (0.66, 0.60, 0.56, 1.0)
        nt.links.new(mix.outputs[2], dark.inputs[6]); nt.links.new(dark.outputs[2], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.9
    else:
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.space = "TANGENT"; nm.inputs["Strength"].default_value = 1.0; nm.location = (-350, -250)
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    if clip:
        gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.5; gt.location = (-350, 100)
        nt.links.new(tb.outputs["Alpha"], gt.inputs[0]); nt.links.new(gt.outputs[0], bsdf.inputs["Alpha"])
        if hasattr(m, "surface_render_method"): m.surface_render_method = "DITHERED"
        if hasattr(m, "blend_method"): m.blend_method = "CLIP"
    m.diffuse_color = (0.62, 0.42, 0.33, 1.0)
    return m


def _mat_flat_clay(name, img, dark):
    """A flat clay texture tiled (mirrored) at the UVs' scale, darkened a little: the carving's walls."""
    m = bpy.data.materials.new(PREFIX + name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.extension = "MIRROR"; t.location = (-600, 300)
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.location = (-300, 300)
    mix.inputs["Factor"].default_value = 1.0; mix.inputs[7].default_value = (dark, dark, dark, 1.0)
    nt.links.new(t.outputs["Color"], mix.inputs[6]); nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    m.diffuse_color = (0.55, 0.36, 0.27, 1.0)
    return m


def _mat_textured(name, img, roughness=0.8):
    m = bpy.data.materials.new(PREFIX + name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.extension = "MIRROR"; t.location = (-400, 300)
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (0.62, 0.42, 0.33, 1.0)
    return m


def materials(T):
    """The build's material slots (build.py MATS) as Blender materials."""
    A, R = T["atlas_dir"], T["roll_dir"]
    base = _image(os.path.join(A, T["basecolor"]), "basecolor"); base.alpha_mode = "CHANNEL_PACKED"
    atlas = (base, _image(os.path.join(A, T["ao"]), "ao", True), _image(os.path.join(A, T["normal"]), "normal", True),
             _image(os.path.join(A, T["roughness"]), "roughness", True))
    roll = (_image(os.path.join(R, "roll_basecolor.png"), "roll_basecolor"), _image(os.path.join(R, "roll_ao.png"), "roll_ao", True),
            _image(os.path.join(R, "roll_normal.png"), "roll_normal", True), _image(os.path.join(R, "roll_roughness.png"), "roll_roughness", True))
    bell = _image(T["bell"], "bell")
    F = T["flower_dir"]
    fbase = _image(os.path.join(F, "basecolor_rgba.png"), "flower_basecolor"); fbase.alpha_mode = "CHANNEL_PACKED"
    flower = (fbase, _image(os.path.join(F, "ambient_occlusion.png"), "flower_ao", True),
              _image(os.path.join(F, "normal_opengl.png"), "flower_normal", True), _image(os.path.join(F, "roughness.png"), "flower_roughness", True))
    return {
        "atlas": _mat_atlas("atlas", atlas, clip=True),                   # the cards' faces, cut out by the picture's alpha
        "atlas_noclip": _mat_atlas("atlas_noclip", atlas, clip=False),
        "abacus": _mat_textured("abacus", _image(T["abacus"], "abacus")),
        "neck": _mat_textured("neck", _image(T["neck"], "neck")),
        "bell": _mat_textured("bell", bell),
        "sides": _mat_flat_clay("sides", bell, 0.82),                     # the walls: the bell's plain clay, 1:1, a little darker
        "roll": _mat_atlas("roll", roll, clip=False),                     # the drum's face: its own filled texture, unclipped
        "flower": _mat_atlas("flower", flower, clip=True),                # the sides' scroll (wall_flower): its own maps, cut out by its alpha
    }


def import_stage2(json_path, coll, parent=None):
    """Build the stage-2 objects into `coll` (linked to the scene) and its placements' child collections, parented to
    `parent`; returns (objects, triangles, {placement: collection})."""
    data = json.load(open(json_path))
    mats = materials(data["textures"])
    mat_list = [mats[k] for k in data["materials"]]
    sides = {}
    for name, spec in data.get("sides", {}).items():
        c = bpy.data.collections.new("%s_%s" % (coll.name, name)); coll.children.link(c)
        c["side_wall_mm"] = float(spec["wall"]); c["side_crest"] = spec.get("crest", "")
        sides[name] = c
    objs, tris = [], 0
    for ob in data["objects"]:
        name = "s2_" + ob["name"]
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in ob["verts"]], [], [tuple(f) for f in ob["faces"]])
        me.update()
        uv = me.uv_layers.new(name="UVMap")
        for f, fuv in zip(me.polygons, ob["uvs"]):
            for k, li in enumerate(f.loop_indices): uv.data[li].uv = fuv[k]
        for m in mat_list: me.materials.append(m)
        for f, mi in zip(me.polygons, ob["mats"]): f.material_index = mi
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        o = bpy.data.objects.new(name, me); (sides[ob["variant"]] if ob.get("variant") else coll).objects.link(o); o.parent = parent
        objs.append(o); tris += sum(len(p.vertices) - 2 for p in me.polygons)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs:                                                        # creases sharp past 35 degrees, on the mesh itself
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35.0))
        o.select_set(False)
    return objs, tris, sides
