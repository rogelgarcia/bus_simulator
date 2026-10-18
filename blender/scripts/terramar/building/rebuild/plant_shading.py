# plant_shading.py -- user fix 12 (2026-10-15): procedural leaf, stem and bark materials for the detailed pot plants.
#
# The detailed plants (plant_broadleaf.py, plant_cycad.py, plant_spiky.py) share one UV convention with palm_frond.py:
# on a leaf or leaflet u runs across the blade (0 one margin, 0.5 the midrib, 1 the other margin) and v along it (0 the
# base, 1 the tip); on a stem or trunk u runs round it and v along it. Each face carries rb_tint (a float in 0..1, seeded
# per leaf), which picks the leaf's tone on the material's ramp, so no two leaves repeat. Built here, node trees only:
#   leaf_material(name, ...)   a blade: tone ramp by rb_tint, a paler midrib, optional veins (pinnate: lateral veins
#           slanting from the midrib toward the tip, as banana / strelitzia leaves; parallel: fine lines along the blade,
#           as yucca / dracaena leaves) as a faint colour line and a bump, an optional margin colour, base and tip
#           colours, a paler duller underside, a little light through the blade (Translucent BSDF mixed in)
#   stem_material(name, ...)   a petiole / rachis / stem: colour ramp along v, scaled by rb_tint, a faint length-wise
#           striation bump
#   bark_material(name, ...)   a trunk: a ramp by a relief attribute (the geometry writes its leaf-base relief into the
#           point attribute rb_relief, smooth across faces), noise grain and a bump
# Names of leaf materials must end with _foliage (the clearance checks sample those vertices).
import bpy

TINT = "rb_tint"
RELIEF = "rb_relief"


def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, s in enumerate((a, b)):
        if s is None:
            continue
        if isinstance(s, (int, float)):
            n.inputs[i].default_value = s
        else:
            nt.links.new(n.inputs[i], s)
    return n.outputs[0]


def _map(nt, src, lo, hi, a, b):
    n = nt.nodes.new("ShaderNodeMapRange")
    n.clamp = True
    n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = lo, hi
    n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = a, b
    nt.links.new(n.inputs["Value"], src)
    return n.outputs["Result"]


def _ramp(nt, src, stops):
    n = nt.nodes.new("ShaderNodeValToRGB")
    els = n.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    for pos, rgb in stops[1:]:
        e = els.new(pos)
        e.color = (*rgb, 1.0)
    nt.links.new(n.inputs["Fac"], src)
    return n.outputs["Color"]


def _mix(nt, fac, a, b, blend="MIX"):
    """A colour Mix node: fac, a, b are sockets or values; returns the result socket."""
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    fs = n.inputs[0]
    sa = next(s for s in n.inputs if s.name == "A" and s.type == "RGBA")
    sb = next(s for s in n.inputs if s.name == "B" and s.type == "RGBA")
    for sock, v in ((fs, fac), (sa, a), (sb, b)):
        if isinstance(v, (int, float)):
            sock.default_value = v
        elif isinstance(v, tuple):
            sock.default_value = (*v[:3], 1.0)
        else:
            nt.links.new(sock, v)
    return next(s for s in n.outputs if s.type == "RGBA")


def _hsv(nt, src, sat, val, hue=0.5):
    n = _node(nt, "ShaderNodeHueSaturation", Hue=hue, Saturation=sat, Value=val)
    nt.links.new(n.inputs["Color"], src)
    return n.outputs["Color"]


def _start(name, viewport_rgb, attr=TINT):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    mat.diffuse_color = (*viewport_rgb, 1.0)
    nt = mat.node_tree
    nt.nodes.clear()
    tint = nt.nodes.new("ShaderNodeAttribute")
    tint.attribute_type = "GEOMETRY"
    tint.attribute_name = attr
    uv = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.inputs[0], nt.nodes.new("ShaderNodeTexCoord").outputs["UV"])
    return mat, nt, tint.outputs["Fac"], uv.outputs["X"], uv.outputs["Y"]


def _line(nt, phase, width):
    """1 on thin lines where phase crosses an integer (width: the line's share of a period), 0 between."""
    f = _math(nt, "FRACT", phase)
    d = _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", f, 0.5))          # 0.5 at the line, 0 mid-period
    return _map(nt, d, 0.5 - width, 0.5, 0.0, 1.0)


def _out(nt, shader):
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(out.inputs["Surface"], shader)


def leaf_material(name, stops, *, midrib_rgb, rough=(0.42, 0.62), translucency=0.15, viewport_rgb=(0.1, 0.15, 0.05),
                  veins=None, vein_count=60.0, vein_slant=0.08, vein_strength=0.06, bump=0.12, midrib_width=0.02,
                  margin_rgb=None, base_rgb=None, base_len=0.0, tip_rgb=None, tip_len=0.0, under=(0.75, 1.10),
                  specular=0.5):
    """A leaf blade (see the module header). stops: (position, rgb) along rb_tint; veins: None, "pinnate" or
    "parallel"; vein_count: veins per unit v (pinnate) or across the blade (parallel); vein_slant: how far a lateral vein
    climbs toward the tip from the midrib to the margin (in v); margin_rgb: a thin margin line's colour; base_rgb /
    tip_rgb over the first base_len / last tip_len of v; under: the underside's (saturation, value) scale."""
    mat, nt, tint, across, along = _start(name, viewport_rgb)
    col = _ramp(nt, tint, stops)
    d = _math(nt, "MULTIPLY", _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", across, 0.5)), 2.0)   # 0 midrib, 1 margin
    height = None
    if veins == "pinnate":
        phase = _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", along, _math(nt, "MULTIPLY", d, vein_slant)), vein_count)
        vl = _line(nt, phase, 0.22)
        col = _mix(nt, _math(nt, "MULTIPLY", vl, vein_strength * 4.0), col, _hsv(nt, col, 0.85, 1.35))
        height = _math(nt, "MULTIPLY", vl, 0.5)
    elif veins == "parallel":
        phase = _math(nt, "MULTIPLY", across, vein_count)
        vl = _line(nt, phase, 0.30)
        col = _mix(nt, _math(nt, "MULTIPLY", vl, vein_strength * 4.0), col, _hsv(nt, col, 0.9, 1.25))
        height = _math(nt, "MULTIPLY", vl, 0.5)
    rib = _map(nt, d, 0.0, midrib_width * 2.0, 1.0, 0.0)                 # the midrib band
    col = _mix(nt, _math(nt, "MULTIPLY", rib, 0.75), col, midrib_rgb)
    rib_h = _math(nt, "MULTIPLY", rib, 1.0)
    height = rib_h if height is None else _math(nt, "MAXIMUM", height, rib_h)
    if margin_rgb is not None:
        col = _mix(nt, _map(nt, d, 0.93, 1.0, 0.0, 0.8), col, margin_rgb)
    if base_rgb is not None and base_len > 0.0:
        col = _mix(nt, _map(nt, along, 0.0, base_len, 1.0, 0.0), col, base_rgb)
    if tip_rgb is not None and tip_len > 0.0:
        col = _mix(nt, _map(nt, along, 1.0 - tip_len, 1.0 - 0.3 * tip_len, 0.0, 1.0), col, tip_rgb)
    back = nt.nodes.new("ShaderNodeNewGeometry").outputs["Backfacing"]
    col = _mix(nt, back, col, _hsv(nt, col, under[0], under[1]))       # the underside: paler, greyer
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.inputs["Base Color"], col)
    nt.links.new(bsdf.inputs["Roughness"], _map(nt, back, 0.0, 1.0, rough[0], rough[1]))
    bsdf.inputs["Specular IOR Level"].default_value = specular
    bn = _node(nt, "ShaderNodeBump", Strength=bump, Distance=0.0015)
    nt.links.new(bn.inputs["Height"], height)
    nt.links.new(bsdf.inputs["Normal"], bn.outputs["Normal"])
    trans = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(trans.inputs["Color"], _hsv(nt, col, 1.2, 1.6))
    nt.links.new(trans.inputs["Normal"], bn.outputs["Normal"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = translucency
    nt.links.new(mix.inputs[1], bsdf.outputs["BSDF"])
    nt.links.new(mix.inputs[2], trans.outputs["BSDF"])
    _out(nt, mix.outputs["Shader"])
    return mat


def stem_material(name, stops, *, rough=0.5, viewport_rgb=(0.1, 0.12, 0.05), tint_range=(0.88, 1.10)):
    """A stem: a ramp along v (stops), scaled by rb_tint over tint_range, a faint length-wise striation bump."""
    mat, nt, tint, across, along = _start(name, viewport_rgb)
    col = _ramp(nt, along, stops)
    k = _map(nt, tint, 0.0, 1.0, tint_range[0], tint_range[1])
    scale = nt.nodes.new("ShaderNodeCombineXYZ")
    for i in range(3):
        nt.links.new(scale.inputs[i], k)
    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY"
    nt.links.new(mul.inputs[0], col)
    nt.links.new(mul.inputs[1], scale.outputs[0])
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.inputs["Base Color"], mul.outputs[0])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    bn = _node(nt, "ShaderNodeBump", Strength=0.15, Distance=0.001)
    nt.links.new(bn.inputs["Height"], _line(nt, _math(nt, "MULTIPLY", across, 16.0), 0.35))
    nt.links.new(bsdf.inputs["Normal"], bn.outputs["Normal"])
    _out(nt, bsdf.outputs["BSDF"])
    return mat


def bark_material(name, stops, *, rough=0.85, viewport_rgb=(0.2, 0.15, 0.1), grain=60.0, bump=0.5):
    """A trunk: a ramp by rb_relief (0 deep grooves, 1 the proud leaf bases), a fine noise grain and a bump from both."""
    mat, nt, tint, _, _ = _start(name, viewport_rgb, RELIEF)
    noise = _node(nt, "ShaderNodeTexNoise", Scale=grain, Detail=6.0, Roughness=0.6)
    nt.links.new(noise.inputs["Vector"], nt.nodes.new("ShaderNodeTexCoord").outputs["Object"])
    fac = _math(nt, "ADD", _math(nt, "MULTIPLY", tint, 0.8), _math(nt, "MULTIPLY", noise.outputs["Fac"], 0.25))
    col = _ramp(nt, _math(nt, "SUBTRACT", fac, 0.05, clamp=True), stops)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.inputs["Base Color"], col)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    bn = _node(nt, "ShaderNodeBump", Strength=bump, Distance=0.004)
    nt.links.new(bn.inputs["Height"], fac)
    nt.links.new(bsdf.inputs["Normal"], bn.outputs["Normal"])
    _out(nt, bsdf.outputs["BSDF"])
    return mat
