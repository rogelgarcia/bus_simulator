# furniture_materials.py -- the furniture's shared materials for the Terra & Mar rebuild (2026-10-14): one source for
# both detail modules (furniture_chairs.py, furniture_tables_seating.py) and the layers that place their pieces.
#
# Procedural node materials, no textures, UV driven: the modules write the UV layer "UVMap" in metres with the wood
# grain along U. Each adds a per-object shift of its UVs (Object Info > Random), so the linked duplicates of one mesh
# that layer_roof_furniture.furnish() places never repeat their grain or weave:
#   TM_RB_furn_teak               oiled teak: broad tone bands and fine dark latewood lines along U, fine pores
#   TM_RB_furn_metal              charcoal satin powder coat: a slow roughness drift and a fine orange peel
#   TM_RB_furn_fabric_<colour>    upholstery (offwhite, ecru, greige): a fine linen-like weave with slubs and sheen.
#                                 The dining-chair pads and stool cushions use it as well as the sofas, banquettes,
#                                 armchairs and lounger mattresses, so a chair and a sofa in one room match
# and the plain slots the box-built teak and charcoal pieces keep (the bar and back bars, the wood ceiling, the kitchen,
# the umbrella poles, the lamps): TM_RB_teak and TM_RB_charcoal_metal, in the node materials' mean tones.
#   materials()          create or refresh every one of them
#   TEAK, METAL, PLAIN_TEAK, PLAIN_METAL, FABRIC_RGB   the names and the fabric tones
#   fabric(colour)       the fabric material's name for a cushion colour (greige when unknown)
#   object_shift(nt, uv) a UV socket shifted by the object's random value (for the modules' own materials)
#   Nodes                the small node-tree writer the materials here are written with
import bpy

TEAK, METAL = "TM_RB_furn_teak", "TM_RB_furn_metal"
FABRIC_RGB = {"offwhite": (0.78, 0.76, 0.71), "ecru": (0.74, 0.69, 0.59), "greige": (0.60, 0.57, 0.52)}
PLAIN_TEAK, PLAIN_METAL = "TM_RB_teak", "TM_RB_charcoal_metal"
LEGACY = {PLAIN_TEAK: ((0.30, 0.165, 0.085), 0.55, 0.0), PLAIN_METAL: ((0.045, 0.045, 0.05), 0.40, 0.3)}
UV_LAYER = "UVMap"
SHIFT = (17.0, 29.0, 0.0)                                # m: the UV shift at an object random of 1


def fabric(colour):
    """The fabric material name for a cushion colour (greige when unknown)."""
    return f"TM_RB_furn_fabric_{colour if colour in FABRIC_RGB else 'greige'}"


def object_shift(nt, uv):
    """uv + the object's random value (0..1) times SHIFT: a vector socket in nt."""
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mad = nt.nodes.new("ShaderNodeVectorMath")
    mad.operation = "MULTIPLY_ADD"
    nt.links.new(mad.inputs[0], info.outputs["Random"])
    mad.inputs[1].default_value = SHIFT
    nt.links.new(mad.inputs[2], uv)
    return mad.outputs[0]


class Nodes:
    """A small node-tree writer: nodes by type, inputs set or linked by name or index."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.tree = mat.node_tree
        self.tree.nodes.clear()
        self.x = -1600

    def new(self, kind, **props):
        n = self.tree.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (self.x, 0)
        self.x += 70
        return n

    def feed(self, node, key, v):
        dst = node.inputs[key] if isinstance(key, int) else next(s for s in node.inputs if s.name == key and s.enabled)
        if hasattr(v, "is_output"):
            self.tree.links.new(v, dst)
        elif hasattr(v, "outputs"):
            self.tree.links.new(v.outputs[0], dst)
        else:
            dst.default_value = v

    def math(self, op, a, b=None, c=None):
        n = self.new("ShaderNodeMath", operation=op)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.feed(n, i, v)
        return n.outputs[0]

    def scale(self, vec, s):
        n = self.new("ShaderNodeVectorMath", operation="MULTIPLY")
        self.feed(n, 0, vec)
        n.inputs[1].default_value = s
        return n.outputs[0]

    def noise(self, vec, scale=1.0, detail=2.0, rough=0.5, distortion=0.0):
        n = self.new("ShaderNodeTexNoise", noise_dimensions="3D")
        self.feed(n, "Vector", vec)
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Distortion"].default_value = distortion
        return n.outputs["Fac"]

    def wave(self, vec, scale, direction, distortion=0.0, detail=0.0, detail_scale=1.0):
        n = self.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction=direction, wave_profile="SIN")
        self.feed(n, "Vector", vec)
        n.inputs["Scale"].default_value = scale
        n.inputs["Distortion"].default_value = distortion
        n.inputs["Detail"].default_value = detail
        n.inputs["Detail Scale"].default_value = detail_scale
        return n.outputs["Fac"]

    def map(self, v, f0, f1, t0, t1):
        n = self.new("ShaderNodeMapRange", data_type="FLOAT", interpolation_type="SMOOTHSTEP")
        for i, x in enumerate((v, f0, f1, t0, t1)):
            self.feed(n, i, x)
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type="MIX", clamp_factor=True)
        self.feed(n, 0, fac)
        self.feed(n, 6, (*a, 1.0) if isinstance(a, tuple) else a)
        self.feed(n, 7, (*b, 1.0) if isinstance(b, tuple) else b)
        return n.outputs[2]

    def tint(self, col, f):
        n = self.new("ShaderNodeVectorMath", operation="SCALE")
        self.feed(n, 0, col)
        self.feed(n, "Scale", f)
        return n.outputs[0]

    def uv(self):
        """The UV layer in metres, shifted per object."""
        return object_shift(self.tree, self.new("ShaderNodeUVMap", uv_map=UV_LAYER).outputs["UV"])

    def tail(self, color, rough, height, strength, distance, **extra):
        bsdf = self.new("ShaderNodeBsdfPrincipled")
        self.feed(bsdf, "Base Color", color)
        self.feed(bsdf, "Roughness", rough)
        for k, v in extra.items():
            self.feed(bsdf, k.replace("_", " "), v)
        bump = self.new("ShaderNodeBump")
        self.feed(bump, "Strength", strength)
        self.feed(bump, "Distance", distance)
        self.feed(bump, "Height", height)
        self.feed(bsdf, "Normal", bump.outputs["Normal"])
        out = self.new("ShaderNodeOutputMaterial")
        self.feed(out, "Surface", bsdf.outputs["BSDF"])


def _teak(mat):
    """Oiled teak: broad tone bands and fine dark latewood lines along U (straight, slightly wavy), fine pores."""
    w = Nodes(mat)
    uv = w.uv()
    streak = w.noise(w.scale(uv, (0.5, 14.0, 1.0)), 1.0, 4.0, 0.6)                  # tone bands across the grain
    lines = w.wave(w.scale(uv, (0.2, 1.0, 1.0)), 48.0, "Y", 2.6, 3.0, 1.4)        # latewood lines, long and straight
    fine = w.wave(w.scale(uv, (0.3, 1.0, 1.0)), 140.0, "Y", 5.0, 2.0, 1.2)        # finer figure between them
    pores = w.noise(w.scale(uv, (30.0, 700.0, 1.0)), 1.0, 2.0, 0.5)
    col = w.mix(w.map(streak, 0.25, 0.75, 0.0, 1.0), (0.205, 0.118, 0.054), (0.335, 0.200, 0.096))
    f = w.math("MULTIPLY", w.math("MULTIPLY_ADD", w.map(lines, 0.72, 1.0, 0.0, 1.0), -0.15, 1.0),
               w.math("MULTIPLY_ADD", w.map(fine, 0.72, 1.0, 0.0, 1.0), -0.07, 1.0))
    f = w.math("MULTIPLY", f, w.math("MULTIPLY_ADD", w.map(pores, 0.56, 0.74, 0.0, 1.0), -0.08, 1.0))
    rough = w.math("MULTIPLY_ADD", pores, 0.10, 0.40)
    height = w.math("MULTIPLY_ADD", lines, 0.5, w.math("MULTIPLY", pores, 0.5))
    w.tail(w.tint(col, f), rough, height, 0.05, 0.001, Specular_IOR_Level=0.45)
    mat.diffuse_color = (0.30, 0.165, 0.085, 1.0)


def _metal(mat):
    """Charcoal satin powder coat: a slow roughness drift and a fine orange peel."""
    w = Nodes(mat)
    uv = w.uv()
    drift = w.noise(w.scale(uv, (4.0, 4.0, 4.0)), 1.0, 2.0, 0.5)
    peel = w.noise(w.scale(uv, (320.0, 320.0, 320.0)), 1.0, 1.0, 0.5)
    w.tail((0.040, 0.040, 0.044, 1.0), w.math("MULTIPLY_ADD", drift, 0.08, 0.36), peel, 0.035, 0.0006,
           Metallic=0.25, Specular_IOR_Level=0.5)
    mat.diffuse_color = (0.045, 0.045, 0.05, 1.0)


def _fabric(mat, rgb):
    """Upholstery: a fine linen-like weave (about 1.5 mm threads, slightly irregular) with thread slubs, sheen, matte;
    faint enough not to beat into moire at a distance."""
    w = Nodes(mat)
    uv = w.uv()
    jitter = w.noise(w.scale(uv, (25.0, 25.0, 25.0)), 1.0, 2.0, 0.5)
    wu = w.wave(uv, 210.0, "X", 1.2, 1.0, 2.0)
    wv = w.wave(uv, 210.0, "Y", 1.2, 1.0, 2.0)
    weave = w.math("ADD", w.math("MULTIPLY", wu, wv),
                   w.math("MULTIPLY", w.math("SUBTRACT", 1.0, wu), w.math("SUBTRACT", 1.0, wv)))
    slub = w.map(w.noise(w.scale(uv, (110.0, 8.0, 1.0)), 1.0, 2.0, 0.5), 0.35, 0.65, 0.0, 1.0)
    f = w.math("MULTIPLY", w.math("MULTIPLY_ADD", weave, 0.04, 0.965), w.math("MULTIPLY_ADD", slub, 0.05, 0.975))
    f = w.math("MULTIPLY", f, w.math("MULTIPLY_ADD", jitter, 0.03, 0.985))
    height = w.math("MULTIPLY_ADD", weave, 0.6, w.math("MULTIPLY", slub, 0.4))
    w.tail(w.tint(tuple(rgb), f), 0.9, height, 0.12, 0.0006, Sheen_Weight=0.5, Sheen_Roughness=0.35,
           Specular_IOR_Level=0.3)
    mat.diffuse_color = (*rgb, 1.0)


def _plain(name, rgb, rough, metallic):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    w = Nodes(mat)
    bsdf = w.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    w.feed(w.new("ShaderNodeOutputMaterial"), "Surface", bsdf.outputs["BSDF"])
    mat.diffuse_color = (*rgb, 1.0)


def materials():
    """Create or refresh the shared furniture materials: TM_RB_furn_teak, TM_RB_furn_metal, TM_RB_furn_fabric_<colour>,
    and the plain TM_RB_teak / TM_RB_charcoal_metal."""
    for name, make in ((TEAK, _teak), (METAL, _metal)):
        make(bpy.data.materials.get(name) or bpy.data.materials.new(name))
    for colour, rgb in FABRIC_RGB.items():
        name = fabric(colour)
        _fabric(bpy.data.materials.get(name) or bpy.data.materials.new(name), rgb)
    for name, (rgb, rough, metallic) in LEGACY.items():
        _plain(name, rgb, rough, metallic)
