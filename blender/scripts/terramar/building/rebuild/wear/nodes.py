# The wear module's shader side.
#
# One node group, TM_WEAR_layer, stands in each worn material between the material's own outputs and its Principled
# BSDF. The state (base colour, roughness, and where a feature needs them metallic, normal, alpha, transmission,
# specular) goes in, passes through every feature's group TM_WEAR_F_<name> in ORDER, and comes out to the BSDF:
#   out = mix(original, worn, active)          active = (tm_wear > 0.5) * tm_wear_exposed * (1 - indoor)
# and inside each feature group every output is mix(input, the feature's result, Strength > 0). A mix by 0 returns its
# first input exactly, so with the switch off (or absent), or a feature's strength 0, the shading is bit for bit what
# the material gave before. Only the sockets some feature writes on a class are routed in that class's materials (and
# DEBUG_ROUTES, which only the debug view changes).
#
# A material whose Principled BSDF sits inside a node group of its own (the kit limestone, TM_RB_limestone, shared by
# the stone and paving slots) gets a worn copy of that group per class, TM_WEAR~<group>~<class>, with the layer
# spliced in inside; the material's group node points at the copy. remove() points it back and drops the copy.
#
# Debug (tm_wear 2): every worn surface turns to clay, DEBUG_CLAY, and each feature paints its Mask in its DEBUG_RGB
# over it; tm_wear_signal k > 0 shows the k-th signal (signals.SIGNALS, then the features' ATTRIBUTES) as a ramp.
import json

import bpy

from . import classes, signals

LAYER = "TM_WEAR_layer"
FEATURE = "TM_WEAR_F_"
COPY = "TM_WEAR~"              # worn copies of a material's own groups: TM_WEAR~<group>~<class>
NODE = "TM_WEAR"               # the spliced group node; every node the splice adds is named TM_WEAR*
F, V, C = 'NodeSocketFloat', 'NodeSocketVector', 'NodeSocketColor'
STATE = [("Color", C, (0.8, 0.8, 0.8, 1.0)), ("Roughness", F, 0.5), ("Metallic", F, 0.0),
         ("Normal", V, (0.0, 0.0, 1.0)), ("Alpha", F, 1.0), ("Transmission", F, 0.0), ("Specular", F, 0.5)]
STATE_NAMES = [s[0] for s in STATE]
KIND = {"Color": 'RGBA', "Normal": 'VECTOR'}
BSDF_INPUT = {"Color": "Base Color", "Roughness": "Roughness", "Metallic": "Metallic", "Normal": "Normal",
              "Alpha": "Alpha", "Transmission": "Transmission Weight", "Specular": "Specular IOR Level"}
LAYER_IN = STATE + [("Class", F, 0.0)]
FEATURE_IN = STATE + [("Class", F, 0.0), ("Strength", F, 0.0)]
FEATURE_OUT = STATE + [("Mask", F, 0.0)]
DEBUG_CLAY = (0.40, 0.40, 0.40, 1.0)
DEBUG_VALUE = {"Roughness": 0.85, "Metallic": 0.0, "Alpha": 1.0, "Transmission": 0.0, "Specular": 0.5}
# sockets routed on a class (once some feature acts on it) only so the debug view can set them: the exterior glass's
# transmission, so a worn pane shows as clay with its mask instead of a tinted window (off and on pass it through)
DEBUG_ROUTES = {"glass_ext": ("Transmission",)}


# ------------------------------------------------------------------------------------------------ expression builder
class Builder:
    """A small expression builder over a node tree: every call adds nodes and returns an output socket; any argument
    may be a socket or a plain number / tuple. Inside a feature group, `ins` holds the group inputs (FEATURE_IN).

        g = b.signal("ground")                                  # tm_wear_ground on the mesh (0 where absent)
        band = b.one_minus(b.smooth(0.3, 0.5, g))               # 1 below 0.3 m, 0 above 0.5 m
        k = b.mul(b.mul(band, b.is_class("stone")), ins["Strength"])
        return {"Color": b.scale_rgb(ins["Color"], b.one_minus(b.mul(k, 0.1))), "Mask": band}
    """

    def __init__(self, nt, feature=None):
        self.nt, self.k, self.feature = nt, 0, feature
        self.gi = next((n for n in nt.nodes if n.bl_idname == 'NodeGroupInput'), None)
        self.go = next((n for n in nt.nodes if n.bl_idname == 'NodeGroupOutput'), None)
        self._geo = self._tc = None

    # ---- plumbing
    def node(self, idname, **props):
        n = self.nt.nodes.new(idname)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (200 + 200 * (self.k // 14), 400 - 140 * (self.k % 14))
        self.k += 1
        return n

    def set(self, sock, v):
        if v is None:
            return
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
            return
        if sock.type == 'RGBA':
            v = (v, v, v, 1.0) if isinstance(v, (int, float)) else (tuple(v) + (1.0,))[:4] if len(v) == 3 else tuple(v)
        elif sock.type == 'VECTOR' and isinstance(v, (int, float)):
            v = (v, v, v)
        sock.default_value = v

    def o(self, name, v):
        sock = self.go.inputs[name]
        for link in list(sock.links):
            self.nt.links.remove(link)
        self.set(sock, v)

    # ---- scalars (Cycles' math is safe: x / 0 = 0, pow / sqrt of a negative = 0)
    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        if c is not None:
            self.set(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b): return self.math('ADD', a, b)
    def sub(self, a, b): return self.math('SUBTRACT', a, b)
    def mul(self, a, b): return self.math('MULTIPLY', a, b)
    def div(self, a, b): return self.math('DIVIDE', a, b)
    def mn(self, a, b): return self.math('MINIMUM', a, b)
    def mx(self, a, b): return self.math('MAXIMUM', a, b)
    def pow(self, a, b): return self.math('POWER', a, b)
    def absf(self, a): return self.math('ABSOLUTE', a)
    def gt(self, a, b): return self.math('GREATER_THAN', a, b)     # 1 where a > b
    def lt(self, a, b): return self.math('LESS_THAN', a, b)
    def eq(self, a, b, eps=0.5): return self.math('COMPARE', a, b, eps)
    def one_minus(self, a): return self.math('SUBTRACT', 1.0, a)

    def clamp(self, x, lo=0.0, hi=1.0):
        n = self.node('ShaderNodeClamp', clamp_type='MINMAX')
        self.set(n.inputs['Value'], x)
        self.set(n.inputs['Min'], lo)
        self.set(n.inputs['Max'], hi)
        return n.outputs[0]

    def map(self, x, a0, a1, b0=0.0, b1=1.0, interp='LINEAR', clamp=True):
        """x from [a0, a1] onto [b0, b1]."""
        n = self.node('ShaderNodeMapRange', data_type='FLOAT', interpolation_type=interp, clamp=clamp)
        for k, v in (('Value', x), ('From Min', a0), ('From Max', a1), ('To Min', b0), ('To Max', b1)):
            self.set(n.inputs[k], v)
        return n.outputs['Result']

    def smooth(self, e0, e1, x):
        """0 below e0, 1 above e1, smoothstep between (e0 > e1 gives the falling step)."""
        return self.map(x, e0, e1, 0.0, 1.0, 'SMOOTHSTEP')

    # ---- colours and vectors
    def mix(self, a, b, t, kind='FLOAT', blend='MIX'):
        """a where t = 0, b where t = 1 (kind FLOAT | RGBA | VECTOR); t = 0 returns a exactly."""
        n = self.node('ShaderNodeMix', data_type=kind, blend_type=blend, clamp_factor=True)
        suf = {'FLOAT': 'Float', 'RGBA': 'Color', 'VECTOR': 'Vector'}[kind]
        self.set(next(s for s in n.inputs if s.identifier == 'Factor_Float'), t)
        self.set(next(s for s in n.inputs if s.identifier == 'A_' + suf), a)
        self.set(next(s for s in n.inputs if s.identifier == 'B_' + suf), b)
        return next(s for s in n.outputs if s.identifier == 'Result_' + suf)

    def rgb(self, r, g, b):
        n = self.node('ShaderNodeCombineColor', mode='RGB')
        for i, v in enumerate((r, g, b)):
            self.set(n.inputs[i], v)
        return n.outputs[0]

    def sep(self, col):
        n = self.node('ShaderNodeSeparateColor', mode='RGB')
        self.set(n.inputs[0], col)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def scale_rgb(self, col, k):
        """colour times a scalar (a socket or a number)."""
        n = self.node('ShaderNodeVectorMath', operation='SCALE')
        self.set(n.inputs[0], col)
        self.set(n.inputs['Scale'], k)
        return n.outputs['Vector']

    def tint(self, col, rgb):
        """colour times (r, g, b) channel by channel (a socket or a tuple)."""
        n = self.node('ShaderNodeVectorMath', operation='MULTIPLY')
        self.set(n.inputs[0], col)
        self.set(n.inputs[1], tuple(rgb)[:3] if not isinstance(rgb, bpy.types.NodeSocket) else rgb)
        return n.outputs['Vector']

    def lum(self, col):
        n = self.node('ShaderNodeRGBToBW')
        self.set(n.inputs[0], col)
        return n.outputs[0]

    def desaturate(self, col, t):
        """toward the colour's own luminance by t (0 keeps it)."""
        y = self.lum(col)
        return self.mix(col, self.rgb(y, y, y), t, 'RGBA')

    def vec(self, x, y, z):
        n = self.node('ShaderNodeCombineXYZ')
        for i, v in enumerate((x, y, z)):
            self.set(n.inputs[i], v)
        return n.outputs[0]

    def xyz(self, v):
        n = self.node('ShaderNodeSeparateXYZ')
        self.set(n.inputs[0], v)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def dot(self, a, b):
        n = self.node('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs['Value']

    # ---- lookups
    def attr(self, name, kind='GEOMETRY'):
        """An Attribute node's factor: GEOMETRY a mesh attribute, OBJECT an object property, VIEW_LAYER a property of
        the rendering view layer / scene / world. Absent reads 0."""
        return self.node('ShaderNodeAttribute', attribute_type=kind, attribute_name=name).outputs['Fac']

    def signal(self, name):
        """A framework signal or a feature attribute: tm_wear_<name> on the mesh."""
        return self.attr("tm_wear_" + name, 'GEOMETRY')

    def object(self, name):
        """An object flag: tm_wear_<name> on the object (exposed, seed)."""
        return self.attr("tm_wear_" + name, 'OBJECT')

    def scene(self, name):
        """A scene control: tm_wear_<name> (a feature's extra control)."""
        return self.attr("tm_wear_" + name, 'VIEW_LAYER')

    def geometry(self, out):
        """Position | Normal | True Normal | Incoming ... of the shading point (world space)."""
        if self._geo is None:
            self._geo = self.node('ShaderNodeNewGeometry')
        return self._geo.outputs[out]

    def ao(self, distance, samples=4):
        """Cycles' Ambient Occlusion (inside off, the whole scene) over `distance` metres: 1 open, toward 0 occluded.
        Render-time geometry, not noise; at strength 0 the feature's mix by 0 lets Cycles fold the node away."""
        n = self.node('ShaderNodeAmbientOcclusion', samples=samples, inside=False, only_local=False)
        self.set(n.inputs['Color'], (1.0, 1.0, 1.0, 1.0))
        self.set(n.inputs['Distance'], distance)
        return n.outputs['AO']

    def coords(self, space='Object'):
        """The shading point's texture coordinates: Object (object space, metres), Generated, UV ..."""
        if self._tc is None:
            self._tc = self.node('ShaderNodeTexCoord')
        return self._tc.outputs[space]

    def nz(self):
        """The true normal's z: 1 on tops, 0 on walls, -1 on soffits."""
        return self.xyz(self.geometry('True Normal'))[2]

    def vertical(self, lo=0.35, hi=0.75):
        """1 on walls and returns (|Nz| small), 0 on tops and soffits."""
        return self.smooth(lo, hi, self.one_minus(self.absf(self.nz())))

    def upward(self, lo=0.5, hi=0.8):
        return self.smooth(lo, hi, self.nz())

    def is_class(self, *names):
        """1 where the material's class is one of names (classes.NAMES), else 0."""
        cls = self.gi.outputs["Class"]
        acc = None
        for nm in names:
            e = self.eq(cls, float(classes.ID[nm]))
            acc = e if acc is None else self.add(acc, e)
        return self.clamp(acc) if acc is not None else 0.0


# ------------------------------------------------------------------------------------------------ groups
def _new_group(name, inputs, outputs):
    old = bpy.data.node_groups.get(name)
    if old is not None:
        bpy.data.node_groups.remove(old)
    ng = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    for nm, typ, dv in inputs:
        s = ng.interface.new_socket(nm, in_out='INPUT', socket_type=typ)
        s.default_value = dv
    for nm, typ, dv in outputs:
        s = ng.interface.new_socket(nm, in_out='OUTPUT', socket_type=typ)
        s.default_value = dv
    ng.nodes.new('NodeGroupInput').location = (-300, 0)
    ng.nodes.new('NodeGroupOutput').location = (3600, 0)
    return ng


def build_feature_group(mod):
    """TM_WEAR_F_<name>: the feature's shader(b, ins) wrapped so a strength of 0 passes the state through exactly.
    Returns (group, the state sockets the feature writes)."""
    ng = _new_group(FEATURE + mod.NAME, FEATURE_IN, FEATURE_OUT)
    b = Builder(ng, feature=mod)
    ins = {nm: b.gi.outputs[nm] for nm, _, _ in FEATURE_IN}
    res = dict(mod.shader(b, ins) or {})
    unknown = sorted(set(res) - set(STATE_NAMES) - {"Mask"})
    assert not unknown, f"wear feature {mod.NAME}: shader() returned unknown outputs {unknown}"
    on = b.gt(ins["Strength"], 0.0)
    writes = [nm for nm in STATE_NAMES if nm in res]
    for nm in STATE_NAMES:
        if nm in res:
            b.o(nm, b.mix(ins[nm], res[nm], on, KIND.get(nm, 'FLOAT')))
        else:
            ng.links.new(b.gi.outputs[nm], b.go.inputs[nm])
    b.o("Mask", b.mul(b.clamp(res["Mask"]), on) if "Mask" in res else 0.0)
    ng["tm_wear_writes"] = writes
    return ng, writes


def debug_signals(features):
    """The debug view's signal list: the framework's signals, then each feature's own ATTRIBUTES (name -> scale)."""
    out = [(n, signals.DEBUG_SCALE[n]) for n in signals.SIGNALS]
    for f in features:
        out += list(getattr(f, "ATTRIBUTES", {}).items())
    return out


def build_layer(features):
    """TM_WEAR_layer: the switch, every feature group in ORDER, the debug view."""
    ng = _new_group(LAYER, LAYER_IN, STATE)
    b = Builder(ng)
    mode = b.attr("tm_wear", 'VIEW_LAYER')
    exposed = b.attr("tm_wear_exposed", 'OBJECT')
    # a face corner looking into a room (signals indoor) stays unworn, but the glass (its film shows from both sides)
    outdoors = b.one_minus(b.mul(b.signal("indoor"), b.one_minus(b.is_class("glass_ext"))))
    exposed = b.mul(exposed, outdoors)
    active = b.mul(b.gt(mode, 0.5), exposed)
    dbg = b.mul(b.gt(mode, 1.5), exposed)
    state = {nm: b.gi.outputs[nm] for nm in STATE_NAMES}
    dcol = DEBUG_CLAY
    for f in features:
        fn = b.node('ShaderNodeGroup')
        fn.node_tree = bpy.data.node_groups[FEATURE + f.NAME]
        fn.name = fn.label = FEATURE + f.NAME
        for nm in STATE_NAMES:
            b.set(fn.inputs[nm], state[nm])
        b.set(fn.inputs["Class"], b.gi.outputs["Class"])
        b.set(fn.inputs["Strength"], b.attr("tm_wear_" + f.NAME, 'VIEW_LAYER'))
        state = {nm: fn.outputs[nm] for nm in STATE_NAMES}
        dcol = b.mix(dcol, tuple(f.DEBUG_RGB), fn.outputs["Mask"], 'RGBA')
    sigs = debug_signals(features)
    idx = b.attr("tm_wear_signal", 'VIEW_LAYER')
    val = None
    for i, (nm, scale) in enumerate(sigs):
        term = b.mul(b.eq(idx, float(i + 1)), b.div(b.signal(nm), float(scale)))
        val = term if val is None else b.add(val, term)
    ramp = b.node('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.02, 0.05, 0.35, 1.0)
    els[1].position, els[1].color = 1.0, (0.95, 0.85, 0.10, 1.0)
    mid = els.new(0.5)
    mid.color = (0.10, 0.55, 0.45, 1.0)
    b.set(ramp.inputs["Fac"], b.clamp(val))
    dcol = b.mix(dcol, ramp.outputs["Color"], b.gt(idx, 0.5), 'RGBA')
    for nm in STATE_NAMES:
        kind = KIND.get(nm, 'FLOAT')
        out = b.mix(b.gi.outputs[nm], state[nm], active, kind)          # off: the input, exactly
        if nm == "Color":
            out = b.mix(out, dcol, dbg, kind)
        elif nm in DEBUG_VALUE:
            out = b.mix(out, DEBUG_VALUE[nm], dbg, kind)
        b.o(nm, out)
    ng["tm_wear_features"] = [f.NAME for f in features]
    ng["tm_wear_signals"] = [nm for nm, _ in sigs]
    return ng


def build_groups(features):
    """Every feature group, then the layer. Returns {feature name: the state sockets it writes}."""
    writes = {}
    for f in features:
        _, writes[f.NAME] = build_feature_group(f)
    build_layer(features)
    return writes


# ------------------------------------------------------------------------------------------------ materials
def _principled(sock, path=()):
    """The Principled BSDFs feeding a shader socket, through Mix / Add shaders and node groups:
    [(group node path, bsdf)]."""
    if not sock.is_linked:
        return []
    n = sock.links[0].from_node
    if n.type == 'BSDF_PRINCIPLED':
        return [(path, n)]
    if n.type in ('MIX_SHADER', 'ADD_SHADER'):
        return [r for s in n.inputs if s.type == 'SHADER' for r in _principled(s, path)]
    if n.type == 'GROUP' and n.node_tree is not None:
        out = next((x for x in n.node_tree.nodes if x.bl_idname == 'NodeGroupOutput' and x.is_active_output), None)
        if out is None:
            return []
        return [r for s in out.inputs if s.type == 'SHADER' for r in _principled(s, path + (n,))]
    return []


def _splice(tree, bsdf, cls, routes, layer):
    gn = tree.nodes.new('ShaderNodeGroup')
    gn.node_tree = layer
    gn.name = gn.label = NODE
    gn.location = (bsdf.location.x - 260, bsdf.location.y + 300)
    for s in routes:
        bi = bsdf.inputs[BSDF_INPUT[s]]
        if bi.is_linked:
            tree.links.new(bi.links[0].from_socket, gn.inputs[s])
        elif s == "Normal":            # the BSDF's own shading normal, which it used unlinked
            geo = tree.nodes.new('ShaderNodeNewGeometry')
            geo.name = geo.label = NODE + "_normal"
            geo.location = (gn.location.x - 220, gn.location.y - 300)
            tree.links.new(geo.outputs['Normal'], gn.inputs[s])
        else:
            dv = bi.default_value
            gn.inputs[s].default_value = tuple(dv) if hasattr(dv, "__len__") else dv
        tree.links.new(gn.outputs[s], bi)
    gn.inputs["Class"].default_value = float(cls)
    return gn


def _wear_tree(ng):
    return ng is not None and (ng.name == LAYER or ng.name.startswith(COPY))


def is_worn(mat):
    return mat.node_tree is not None and ("tm_wear_class" in mat or any(
        n.type == 'GROUP' and _wear_tree(n.node_tree) for n in mat.node_tree.nodes))


def insert(mat, cls, routes):
    """Splice TM_WEAR_layer before every Principled BSDF the material's surface uses, routing `routes` (state names).
    Returns (done, why)."""
    if not routes:
        return False, "no feature writes this class"
    nt = mat.node_tree
    if nt is None:
        return False, "no node tree"
    if is_worn(mat):
        return False, "already worn (run remove first)"
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if out is None or not out.inputs['Surface'].is_linked:
        return False, "no active surface output"
    found = _principled(out.inputs['Surface'])
    if not found:
        return False, "no Principled BSDF on the surface"
    layer = bpy.data.node_groups[LAYER]
    record = {}
    for path, bsdf in found:
        if not path:
            _splice(nt, bsdf, cls, routes, layer)
            continue
        assert len(path) == 1, f"{mat.name}: a Principled BSDF nested {len(path)} groups deep"
        gnode = path[0]
        orig = gnode.node_tree
        name = f"{COPY}{orig.name}~{classes.NAMES[cls]}"
        copy = bpy.data.node_groups.get(name)
        if copy is None:
            copy = orig.copy()
            copy.name = name
            _splice(copy, copy.nodes[bsdf.name], cls, routes, layer)
        gnode.node_tree = copy
        record[gnode.name] = orig.name
    _eevee_output(nt, out, record)
    mat["tm_wear_class"] = classes.NAMES[cls]
    mat["tm_wear_groups"] = json.dumps(record)
    mat["tm_wear_eevee"] = out.name
    return True, "+".join(routes)


# EEVEE reads at most 16 mesh attributes per material and the features read about 40, so a worn material fails to
# compile there (pink in Material Preview). The worn output turns Cycles-only and an EEVEE-only output gets the
# material's clean surface: a copy of the shader path (Principled BSDFs, Mix / Add shaders, the groups holding them)
# fed by the sockets the layer's inputs had, the groups pointing at their unworn originals. EEVEE compiles only what
# its output reaches, so Material Preview shows the building unworn and Cycles renders the wear.
EEVEE = NODE + "_eevee"        # every node of the clean EEVEE surface: TM_WEAR_eevee* (remove() drops TM_WEAR*)


def _unworn_source(link):
    """The socket a link stands for without the wear: through the layer node, the socket feeding its matching input.
    Returns (socket or None, the socket whose default applies when None)."""
    fn = link.from_node
    if fn.type == 'GROUP' and fn.node_tree is not None and fn.node_tree.name == LAYER:
        gi = fn.inputs[link.from_socket.name]
        src = gi.links[0].from_socket if gi.is_linked else None
        if src is not None and src.node.name.startswith(NODE):      # the splice's own stand-in (its normal node)
            src = None
        return src, gi
    return link.from_socket, None


def _clean_shader(nt, sock, record, made):
    """The output socket giving `sock`'s shader unworn: copies of the worn path's nodes, other nodes shared."""
    link = sock.links[0]
    n = link.from_node
    if n.type not in ('BSDF_PRINCIPLED', 'MIX_SHADER', 'ADD_SHADER') and not (n.type == 'GROUP' and n.name in record):
        return link.from_socket
    if n.name not in made:
        dup = nt.nodes.new(n.bl_idname)
        dup.name = dup.label = f"{EEVEE}_{n.name}"
        dup.location = (n.location.x, n.location.y - 900)
        if n.type == 'BSDF_PRINCIPLED':
            dup.distribution, dup.subsurface_method = n.distribution, n.subsurface_method
        elif n.type == 'GROUP':
            dup.node_tree = bpy.data.node_groups[record[n.name]]
        made[n.name] = dup
        for i, s in enumerate(n.inputs):
            d = dup.inputs[i]
            if s.is_linked:
                if s.type == 'SHADER':
                    nt.links.new(_clean_shader(nt, s, record, made), d)
                    continue
                src, gi = _unworn_source(s.links[0])
                if src is not None:
                    nt.links.new(src, d)
                    continue
                s = gi
            if hasattr(s, "default_value") and hasattr(d, "default_value"):
                dv = s.default_value
                d.default_value = tuple(dv) if hasattr(dv, "__len__") else dv
    return made[n.name].outputs[list(n.outputs).index(link.from_socket)]


def _eevee_output(nt, out, record):
    clean = nt.nodes.new('ShaderNodeOutputMaterial')
    clean.name = clean.label = EEVEE + "_output"
    clean.location = (out.location.x, out.location.y - 900)
    clean.target = 'EEVEE'
    nt.links.new(_clean_shader(nt, out.inputs['Surface'], record, {}), clean.inputs['Surface'])
    for nm in ('Volume', 'Displacement'):
        if out.inputs[nm].is_linked:
            nt.links.new(out.inputs[nm].links[0].from_socket, clean.inputs[nm])
    out.target = 'CYCLES'


def _unsplice(tree):
    for gn in [n for n in tree.nodes if n.type == 'GROUP' and n.node_tree is not None and n.node_tree.name == LAYER]:
        for out in gn.outputs:
            for link in list(out.links):
                to = link.to_socket
                src = gn.inputs.get(out.name)
                frm = src.links[0].from_socket if src is not None and src.is_linked else None
                tree.links.remove(link)
                if frm is not None and not frm.node.name.startswith(NODE):
                    tree.links.new(frm, to)
        tree.nodes.remove(gn)
    for n in [n for n in tree.nodes if n.name.startswith(NODE)]:
        tree.nodes.remove(n)


def remove(mat):
    """Undo insert(): the original links back exactly, the group copies dropped. Returns True if anything was worn."""
    nt = mat.node_tree
    if nt is None or not is_worn(mat):
        return False
    _unsplice(nt)
    worn_out = nt.nodes.get(mat.get("tm_wear_eevee", ""))
    if worn_out is not None:
        worn_out.target = 'ALL'
    record = json.loads(mat.get("tm_wear_groups", "{}"))
    for n in nt.nodes:
        if n.type == 'GROUP' and n.node_tree is not None and n.node_tree.name.startswith(COPY):
            orig = record.get(n.name) or n.node_tree.name[len(COPY):].rsplit("~", 1)[0]
            copy = n.node_tree
            if orig in bpy.data.node_groups:
                n.node_tree = bpy.data.node_groups[orig]
                if copy.users == 0:
                    bpy.data.node_groups.remove(copy)
            else:
                # the original had no users once every material pointed at copies, so the saved file dropped it:
                # the copy without its splice is the original, node for node
                _unsplice(copy)
                copy.name = orig
    for k in ("tm_wear_class", "tm_wear_groups", "tm_wear_eevee"):
        if k in mat:
            del mat[k]
    return True


def purge_groups():
    """Drop every TM_WEAR node group (the layer, the features, stale copies). Returns how many."""
    gone = 0
    ours = [g for g in bpy.data.node_groups
            if g.library is None and (g.name == LAYER or g.name.startswith((FEATURE, COPY)))]
    for ng in ours:
        bpy.data.node_groups.remove(ng)
        gone += 1
    return gone


# ------------------------------------------------------------------------------------------------ overlay materials
def overlay_material(name, feature, rgb, roughness=0.8, image=None):
    """A material for an overlay object of `feature` (decals): Principled with alpha = 1 - (1 - a) ** s, a the image's
    alpha (or 1) and s the feature's strength tm_wear_<feature> (s layers of the decal: 0 clear, 1 the image's own
    alpha, 2 twice as dense, never past opaque), times (tm_wear > 0.5), so the overlay scales with its strength and
    vanishes when the switch or the feature is off even if its collection is still rendered (controls excludes it
    then)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    b = Builder(nt)
    alpha = 1.0
    if image is not None:
        tex = b.node('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        alpha = tex.outputs['Alpha']
    s = b.mx(b.attr("tm_wear_" + feature, 'VIEW_LAYER'), 0.0)
    dense = b.one_minus(b.pow(b.one_minus(b.clamp(alpha)), s))          # pow(x, 0) = 1: strength 0 is clear
    gate = b.mul(b.gt(b.attr("tm_wear", 'VIEW_LAYER'), 0.5), b.gt(s, 0.0))
    b.set(bsdf.inputs['Alpha'], b.mul(dense, gate))
    mat.surface_render_method = 'DITHERED'
    mat["tm_wear_overlay"] = feature
    return mat
