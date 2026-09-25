# The wear layer's shader side.
#
# One node group, WEAR_layer, stands in every exterior material between the material's own texture reads and its
# Principled BSDF: base colour, roughness and (where the material has a normal map) the normal go in, pass through each
# feature's group in chain order, and come out to the BSDF. Glass routes its alpha, transmission and specular level
# (AI 571) the same way, metal its metallic (AI 568). The material's own maps, normal map and relief are untouched; a
# feature darkens, lightens, tints or roughens what they give, under the same lighting.
#
# The switch and the strengths are not stored in the materials at all. They are custom properties of the SCENE that
# renders, read by Attribute nodes of type View Layer: `wear` (0 off, 1 on, 2 debug) and `wear_<feature>` (the
# feature's strength, 1.0 its calibrated default, 0 off). A property that is absent reads 0, so a scene that sets none
# renders the materials exactly as they were. Every output is mixed from the untouched input by a factor that is 0 when
# the layer is off, and a mix by 0 returns its first input exactly: off is bit-for-bit today's shading.
#
# The groups and the mask images live in wear/wear_nodes.blend, which the worn block and the worn portal both link, so
# the render loads each mask once and every material runs the same group.
import os
import numpy as np
import bpy
from . import classes, geometry as geo

LAYER = "WEAR_layer"
FRAME = "WEAR_frame"
FEATURE = "WEAR_F_"
F, V, C = 'NodeSocketFloat', 'NodeSocketVector', 'NodeSocketColor'
# Metallic (added by AI 568) is routed on the metal class only: rust turns painted iron into an oxide, a dielectric.
# Specular (the BSDF's Specular IOR Level, added by AI 571's rework of 2026-09-23) is routed on the glass class only:
# where dust covers a pane there is no glass to reflect, so its reflection weakens
STATE = [("Color", C, (0.8, 0.8, 0.8, 1.0)), ("Roughness", F, 0.5), ("Normal", V, (0.0, 0.0, 1.0)),
         ("Alpha", F, 1.0), ("Transmission", F, 0.0), ("Metallic", F, 0.0), ("Specular", F, 0.5)]
SURFACE = [("Class", F, 0.0), ("Joint", F, 0.0), ("Grain", F, 0.5), ("Bed", F, 0.0), ("Joint Wide", F, 0.0)]
BED_LIP = 0.12            # Bed reaches this share of a brick course below each bed joint (see surface_signals)
JOINT_GROW = 0.025        # Joint Wide (added by AI 573) reaches this share of a brick course past every joint's edge:
                          # 2 mm on the wall's 7.875 cm courses, the arris a joint's mortar exposes as it recedes
FRAME_OUT = [("Facade", F, 0.0), ("S", F, 0.0), ("D", F, 0.0), ("Z", F, 0.0), ("H", F, 0.0), ("U", F, 0.0),
             ("V", F, 0.0), ("Nt", F, 0.0), ("Nd", F, 0.0), ("Nz", F, 0.0), ("Position", V, (0.0, 0.0, 0.0)),
             ("True Normal", V, (0.0, 0.0, 1.0))]
# The surface as the deposits find it: the state entering the first feature at DEPOSITS or later in the chain (after
# the fabric features, mortar erosion and edge wear, before any soiling, streak or grime). A feature that takes deposits
# OFF again (the washed zones' rinse, AI 566) mixes back toward it; before the deposits it is the feature's own input.
CLEAN = [("Clean Color", C, (0.8, 0.8, 0.8, 1.0)), ("Clean Roughness", F, 0.5)]
DEPOSITS = 200
FEATURE_IN = STATE + [("Mask", C, (0.0, 0.0, 0.0, 1.0)), ("Mask Alpha", F, 0.0), ("Attr", F, 0.0),
                      ("Strength", F, 0.0)] + SURFACE + FRAME_OUT + CLEAN
FEATURE_OUT = STATE + [("Debug", F, 0.0)]
DEBUG_BASE = (0.40, 0.40, 0.40, 1.0)      # the clay every worn surface turns in the debug view
DEBUG_ROUGH = 0.85


# ------------------------------------------------------------------------------------------------ expression builder
class G:
    """A small expression builder over a node tree. Every call adds nodes and returns an output socket; any argument
    may be a socket or a plain number / tuple (set as the input's value). Inside a feature group, g.i(name) is a group
    input and g.o(name, value) drives a group output (see FEATURE_IN / FEATURE_OUT for the names).

        m   = g.sep(g.i("Mask"))[0]                       # the mask's red channel
        amt = g.mul(g.mul(m, g.i("Strength")), g.is_class(classes.BRICK, classes.STONE))
        g.o("Color", g.mix(g.i("Color"), g.scale_rgb(g.i("Color"), 0.8), amt, "RGBA"))
        g.o("Debug", m)

    Inside a feature group g.result is the feature's own build Result (its sources, marks, fields and stash, fresh or
    from the cache), for a shader whose constants are what its build found (added by AI 572's rework: the few roosts
    it chose, each read from a block of its own); None elsewhere.
    """

    def __init__(self, nt, feature=None, result=None):
        self.nt = nt; self.k = 0; self.feature = feature; self.result = result
        self.gi = next((n for n in nt.nodes if n.bl_idname == 'NodeGroupInput'), None)
        self.go = next((n for n in nt.nodes if n.bl_idname == 'NodeGroupOutput'), None)

    def control(self, name):
        # one of the feature's own extra controls (its module's CONTROLS), a scene property wear_<feature>_<name>
        assert self.feature is not None and name in getattr(self.feature, "CONTROLS", {}), \
            f"{getattr(self.feature, 'NAME', '?')}: no control {name} in its CONTROLS"
        return self.attr(f"wear_{self.feature.NAME}_{name}")

    # ---- plumbing
    def node(self, idname, **props):
        n = self.nt.nodes.new(idname)
        for k, v in props.items(): setattr(n, k, v)
        n.location = (240 + 190 * (self.k // 16), 300 - 150 * (self.k % 16)); self.k += 1
        return n

    def set(self, sock, v):
        if v is None: return
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock); return
        if sock.type == 'RGBA':
            if isinstance(v, (int, float)): v = (v, v, v, 1.0)
            elif len(v) == 3: v = (v[0], v[1], v[2], 1.0)
        elif sock.type == 'VECTOR':
            if isinstance(v, (int, float)): v = (v, v, v)
        sock.default_value = v

    def _in(self, n, ident):
        return next(s for s in n.inputs if s.identifier == ident)

    def _out(self, n, ident):
        return next(s for s in n.outputs if s.identifier == ident)

    def i(self, name):
        return self.gi.outputs[name]

    def o(self, name, v):
        sock = self.go.inputs[name]
        for l in list(sock.links): self.nt.links.remove(l)
        self.set(sock, v)

    # ---- scalars
    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.set(n.inputs[0], a)
        if b is not None: self.set(n.inputs[1], b)
        if c is not None: self.set(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b): return self.math('ADD', a, b)
    def sub(self, a, b): return self.math('SUBTRACT', a, b)
    def mul(self, a, b): return self.math('MULTIPLY', a, b)
    def div(self, a, b): return self.math('DIVIDE', a, b)      # Cycles divides safely: x / 0 = 0
    def mn(self, a, b): return self.math('MINIMUM', a, b)
    def mx(self, a, b): return self.math('MAXIMUM', a, b)
    def pow(self, a, b): return self.math('POWER', a, b)
    def absf(self, a): return self.math('ABSOLUTE', a)
    def gt(self, a, b): return self.math('GREATER_THAN', a, b)   # 1 where a > b
    def lt(self, a, b): return self.math('LESS_THAN', a, b)
    def eq(self, a, b, eps=0.5): return self.math('COMPARE', a, b, eps)
    def one_minus(self, a): return self.math('SUBTRACT', 1.0, a)

    def clamp(self, x, lo=0.0, hi=1.0):
        n = self.node('ShaderNodeClamp', clamp_type='MINMAX')
        self.set(n.inputs['Value'], x); self.set(n.inputs['Min'], lo); self.set(n.inputs['Max'], hi)
        return n.outputs[0]

    def map(self, x, a0, a1, b0=0.0, b1=1.0, interp='LINEAR', clamp=True):
        # x from [a0, a1] onto [b0, b1] (a0 > a1 maps a falling input onto a rising output)
        n = self.node('ShaderNodeMapRange', data_type='FLOAT', interpolation_type=interp, clamp=clamp)
        self.set(n.inputs['Value'], x); self.set(n.inputs['From Min'], a0); self.set(n.inputs['From Max'], a1)
        self.set(n.inputs['To Min'], b0); self.set(n.inputs['To Max'], b1)
        return n.outputs['Result']

    def smooth(self, e0, e1, x):
        return self.map(x, e0, e1, 0.0, 1.0, 'SMOOTHSTEP')

    # ---- colours and vectors
    def mix(self, a, b, t, kind='FLOAT', blend='MIX'):
        # a where t = 0, b where t = 1; kind FLOAT | RGBA | VECTOR. t = 0 returns a exactly.
        n = self.node('ShaderNodeMix', data_type=kind, blend_type=blend, clamp_factor=True)
        suf = {'FLOAT': 'Float', 'RGBA': 'Color', 'VECTOR': 'Vector'}[kind]
        self.set(self._in(n, 'Factor_Float'), t)
        self.set(self._in(n, 'A_' + suf), a); self.set(self._in(n, 'B_' + suf), b)
        return self._out(n, 'Result_' + suf)

    def rgb(self, r, g, b):
        n = self.node('ShaderNodeCombineColor', mode='RGB')
        self.set(n.inputs[0], r); self.set(n.inputs[1], g); self.set(n.inputs[2], b)
        return n.outputs[0]

    def sep(self, col):
        n = self.node('ShaderNodeSeparateColor', mode='RGB'); self.set(n.inputs[0], col)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def scale_rgb(self, col, k):
        # colour times a scalar (a darkening below 1, a lightening above)
        return self.mix(col, self.rgb(k, k, k), 1.0, 'RGBA', 'MULTIPLY')

    def lum(self, col):
        n = self.node('ShaderNodeRGBToBW'); self.set(n.inputs[0], col); return n.outputs[0]

    def vec(self, x, y, z):
        n = self.node('ShaderNodeCombineXYZ')
        self.set(n.inputs[0], x); self.set(n.inputs[1], y); self.set(n.inputs[2], z)
        return n.outputs[0]

    def xyz(self, v):
        n = self.node('ShaderNodeSeparateXYZ'); self.set(n.inputs[0], v)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def vmath(self, op, a, b=None, scale=None):
        n = self.node('ShaderNodeVectorMath', operation=op)
        self.set(n.inputs[0], a)
        if b is not None: self.set(n.inputs[1], b)
        if scale is not None: self.set(n.inputs[3], scale)
        return n.outputs[1] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs[0]

    def dot(self, a, b): return self.vmath('DOT_PRODUCT', a, b)

    # ---- lookups
    def attr(self, name, kind='VIEW_LAYER'):
        # VIEW_LAYER: a custom property of the rendering view layer / scene / world; GEOMETRY: a mesh attribute.
        # Absent reads 0.
        n = self.node('ShaderNodeAttribute', attribute_type=kind, attribute_name=name)
        return n.outputs['Fac']

    def image(self, img, vec, interp='Linear', ext='CLIP'):
        n = self.node('ShaderNodeTexImage', interpolation=interp, extension=ext)
        n.image = img; self.set(n.inputs['Vector'], vec)
        return n.outputs['Color'], n.outputs['Alpha']

    def is_class(self, *cls):
        # 1 where the material's class is one of cls (see classes.py), else 0
        acc = None
        for c in cls:
            e = self.eq(self.i("Class"), float(c))
            acc = e if acc is None else self.add(acc, e)
        return self.clamp(acc) if acc is not None else 0.0

    # ---- orientation, from the geometric normal in the face's frame. A mask is painted on the elevation (s, z), so
    # every surface at that (s, z) samples it: the wall, but also a column's return, a reveal's side, a sill's top.
    # These say which of them a feature means.
    def facing(self, lo=0.3, hi=0.7):
        # 1 on surfaces that face the street (walls, fronts), 0 on returns, tops and soffits
        return self.smooth(lo, hi, self.i("Nd"))

    def upward(self, lo=0.5, hi=0.8):
        # 1 on tops (ledges, sills, cornice tops), 0 elsewhere
        return self.smooth(lo, hi, self.i("Nz"))

    def downward(self, lo=0.5, hi=0.8):
        # 1 on soffits and undersides, 0 elsewhere
        return self.smooth(lo, hi, self.mul(self.i("Nz"), -1.0))


# ------------------------------------------------------------------------------------------------ groups
def _new_group(name, inputs, outputs):
    ng = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    for nm, typ, dv in inputs:
        s = ng.interface.new_socket(nm, in_out='INPUT', socket_type=typ)
        try: s.default_value = dv
        except (AttributeError, TypeError): pass
    for nm, typ, dv in outputs:
        s = ng.interface.new_socket(nm, in_out='OUTPUT', socket_type=typ)
        try: s.default_value = dv
        except (AttributeError, TypeError): pass
    gi = ng.nodes.new('NodeGroupInput'); gi.location = (-400, 0)
    go = ng.nodes.new('NodeGroupOutput'); go.location = (4200, 0)
    return ng


def build_frame():
    """WEAR_frame: where the shading point is in the layer's terms. The face it belongs to (the one whose plane it
    stands furthest in front of), its (s, d, z) on that face, its height H above the pavement, the atlas (U, V) every
    feature's mask is read at, and the geometric normal in the face's frame (Nt along, Nd out, Nz up)."""
    ng = _new_group(FRAME, [], FRAME_OUT)
    g = G(ng)
    geom = g.node('ShaderNodeNewGeometry')
    P, N = geom.outputs['Position'], geom.outputs['True Normal']
    ds = [g.sub(g.dot(P, (f.n[0], f.n[1], 0.0)), f.c_n) for f in geo.FACADES]
    ss = [g.sub(g.dot(P, (f.t[0], f.t[1], 0.0)), f.c_t) for f in geo.FACADES]
    best, sel = ds[0], 0.0
    for i in range(1, len(ds)):
        up = g.gt(ds[i], best)
        sel = g.add(sel, g.mul(up, g.sub(float(i), sel)))
        best = g.mx(best, ds[i])
    onehot = [g.eq(sel, float(i)) for i in range(len(ds))]

    def pick(vals):
        acc = None
        for w, v in zip(onehot, vals):
            term = g.mul(w, v)
            acc = term if acc is None else g.add(acc, term)
        return acc
    S, D = pick(ss), pick(ds)
    Sc = g.node('ShaderNodeClamp', clamp_type='MINMAX')
    g.set(Sc.inputs['Value'], S)
    g.set(Sc.inputs['Min'], pick([f.s0 for f in geo.FACADES])); g.set(Sc.inputs['Max'], pick([f.s1 for f in geo.FACADES]))
    U = g.div(g.add(pick([f.off - f.s0 for f in geo.FACADES]), Sc.outputs[0]), geo.ATLAS.width)
    _, _, Z = g.xyz(P)
    Vv = g.div(g.sub(Z, geo.ATLAS.z0), geo.ATLAS.height)
    _, _, Nz = g.xyz(N)
    Nt = pick([g.dot(N, (f.t[0], f.t[1], 0.0)) for f in geo.FACADES])
    Nd = pick([g.dot(N, (f.n[0], f.n[1], 0.0)) for f in geo.FACADES])
    for nm, v in (("Facade", sel), ("S", S), ("D", D), ("Z", Z), ("H", g.sub(Z, geo.Z_GROUND)), ("U", U), ("V", Vv),
                  ("Nt", Nt), ("Nd", Nd), ("Nz", Nz), ("Position", P), ("True Normal", N)):
        g.o(nm, v)
    return ng


def build_feature_group(spec, result=None):
    """WEAR_F_<name>: the feature's own shading. It starts as a pass-through (state in = state out, Debug 0) and the
    feature's shader(g) rewires what it changes; `result` (its build's Result) is g.result there."""
    ng = _new_group(FEATURE + spec.NAME, FEATURE_IN, FEATURE_OUT)
    g = G(ng, feature=spec, result=result)
    for nm, _, _ in STATE: ng.links.new(g.gi.outputs[nm], g.go.inputs[nm])
    g.go.inputs["Debug"].default_value = 0.0
    spec.shader(g)
    return ng


def build_layer(specs, images):
    """WEAR_layer: the frame, then every feature's group in chain order, then the switch."""
    ng = _new_group(LAYER, STATE + SURFACE, STATE)
    g = G(ng)
    fr = g.node('ShaderNodeGroup'); fr.node_tree = bpy.data.node_groups[FRAME]
    mode = g.attr("wear")
    on = g.mul(g.gt(mode, 0.5), g.lt(mode, 1.5))
    dbg = g.gt(mode, 1.5)
    uv = g.vec(fr.outputs["U"], fr.outputs["V"], 0.0)
    state = {nm: g.i(nm) for nm, _, _ in STATE}
    dcol = DEBUG_BASE
    clean = None
    for spec in specs:
        if clean is None and spec.ORDER >= DEPOSITS: clean = dict(state)    # the surface as the deposits find it
        fn = g.node('ShaderNodeGroup'); fn.node_tree = bpy.data.node_groups[FEATURE + spec.NAME]
        for nm, _, _ in STATE: g.set(fn.inputs[nm], state[nm])
        cs = state if clean is None else clean
        g.set(fn.inputs["Clean Color"], cs["Color"]); g.set(fn.inputs["Clean Roughness"], cs["Roughness"])
        strength = g.attr("wear_" + spec.NAME)
        img = images.get(spec.NAME)
        if img is not None:
            col, alpha = g.image(img, uv)
            g.set(fn.inputs["Mask"], col); g.set(fn.inputs["Mask Alpha"], alpha)
        g.set(fn.inputs["Attr"], g.attr("wear_" + spec.NAME, 'GEOMETRY'))
        g.set(fn.inputs["Strength"], strength)
        for nm, _, _ in SURFACE: g.set(fn.inputs[nm], g.i(nm))
        for nm, _, _ in FRAME_OUT: g.set(fn.inputs[nm], fr.outputs[nm])
        state = {nm: fn.outputs[nm] for nm, _, _ in STATE}
        shown = g.mul(fn.outputs["Debug"], g.gt(strength, 0.0))
        dcol = g.mix(dcol, tuple(spec.DEBUG_COLOR), shown, 'RGBA')
    kinds = {"Color": 'RGBA', "Roughness": 'FLOAT', "Normal": 'VECTOR', "Alpha": 'FLOAT', "Transmission": 'FLOAT',
             "Metallic": 'FLOAT', "Specular": 'FLOAT'}
    # the debug view's clay is matte on metal too, so a mark on the ironwork shows in its own colour
    debug_value = {"Color": dcol, "Roughness": DEBUG_ROUGH, "Alpha": 1.0, "Transmission": 0.0, "Metallic": 0.0}
    for nm, _, _ in STATE:
        out = g.mix(g.i(nm), state[nm], on, kinds[nm])          # off: the input, exactly
        if nm in debug_value: out = g.mix(out, debug_value[nm], dbg, kinds[nm])
        g.o(nm, out)
    ng.use_fake_user = True
    return ng


def build_library(specs, results, mask_paths, log=print):
    """In an empty file: the mask images, WEAR_frame, one WEAR_F_ group per feature and WEAR_layer."""
    images = {}
    for spec in specs:
        p = mask_paths.get(spec.NAME)
        if p is None: continue
        img = bpy.data.images.load(p, check_existing=False)
        img.name = "WEAR_mask_" + spec.NAME
        img.colorspace_settings.name = 'Non-Color'
        img.alpha_mode = 'CHANNEL_PACKED'
        images[spec.NAME] = img
    build_frame()
    for spec in specs: build_feature_group(spec, results.get(spec.NAME))
    layer = build_layer(specs, images)
    log(f"node library: {LAYER} with {len(specs)} feature group(s), {len(images)} mask image(s), "
        f"{len(layer.nodes)} nodes in the layer, {len(bpy.data.node_groups[FRAME].nodes)} in the frame")
    return layer


def link_layer(nodes_path):
    # WEAR_layer from the node library. In the block the worn portal has already brought it in indirectly; linking it
    # again directly (Blender notes "already linked") is what gives the worn block its own direct, relative link.
    with bpy.data.libraries.load(nodes_path, link=True, relative=True) as (src, dst):
        assert LAYER in src.node_groups, f"{nodes_path} has no {LAYER}"
        dst.node_groups = [LAYER]
    return next(ng for ng in bpy.data.node_groups if ng.name == LAYER and ng.library is not None)


# ------------------------------------------------------------------------------------------------ materials
_quant_cache = {}


def _quantiles(img, qs):
    key = (img.name_full, tuple(qs))
    if key not in _quant_cache:
        w, h = img.size
        buf = np.empty(w * h * img.channels, np.float32); img.pixels.foreach_get(buf)
        v = buf.reshape(-1, img.channels)[:, 0]
        _quant_cache[key] = [float(x) for x in np.quantile(v, qs)]
    return _quant_cache[key]


def _image_file(img):
    try: p = bpy.path.abspath(img.filepath, library=img.library)
    except TypeError: p = bpy.path.abspath(img.filepath)
    return os.path.normpath(p) if p else None


def _bed_joints(img, level):
    # how many bed joints one tile of a brick height map holds: its rows that are almost all joint (below `level`),
    # counted as runs (a run through the image's edge counts once)
    key = (img.name_full, "bed", round(level, 4))
    if key not in _quant_cache:
        w, h = img.size
        buf = np.empty(w * h * img.channels, np.float32); img.pixels.foreach_get(buf)
        bed = (buf.reshape(h, w, img.channels)[:, :, 0] < level).mean(axis=1) > 0.5
        _quant_cache[key] = int(np.count_nonzero(bed & ~np.roll(bed, 1)))
    return _quant_cache[key]


def _bed_signal(nt, h, img, q, joint, x, y):
    """Bed: 1 in a bed joint and on the lip of brick just below it, BED_LIP of a course deep, where water that hangs at
    a bed joint spreads along it. The joint map read again a little higher in the texture: a point just under a bed
    joint finds that joint there, while a head joint, vertical, is found only in itself. The set's own courses are
    counted in its height map, so the lip is a share of a course whatever the tile size."""
    n = _bed_joints(img, q[2] - 0.04)
    if n < 2 or h.projection != 'FLAT': return joint
    if h.inputs['Vector'].is_linked:
        vec = h.inputs['Vector'].links[0].from_socket
    else:
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.location = (x - 500, y - 400); vec = uvn.outputs['UV']
    add = nt.nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'; add.location = (x - 250, y - 400)
    nt.links.new(vec, add.inputs[0]); add.inputs[1].default_value = (0.0, BED_LIP / n, 0.0)
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.label = "wear: the height just above"
    t.location = (x, y - 400)
    t.projection, t.projection_blend = h.projection, h.projection_blend
    t.interpolation, t.extension = h.interpolation, h.extension
    nt.links.new(add.outputs['Vector'], t.inputs['Vector'])
    above = nt.nodes.new('ShaderNodeMapRange'); above.location = (x + 300, y - 400)
    above.inputs['From Min'].default_value = q[2] - 0.04
    above.inputs['From Max'].default_value = q[0] + 0.03
    nt.links.new(t.outputs['Color'], above.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.location = (x + 500, y - 300)
    nt.links.new(joint, mx.inputs[0]); nt.links.new(above.outputs['Result'], mx.inputs[1])
    return mx.outputs[0]


def _wide_signal(nt, h, img, q, joint, x, y):
    """Joint Wide (AI 573): 1 in a mortar joint and within JOINT_GROW of a course past its edge, for a joint that reads
    wider as its mortar recedes and its arrises are exposed. The set's joints are a one-pixel step in its height map, so
    no remapping of Joint can widen them: the map is read twice more, a little up and along and a little down and back.
    A bed joint does not change along the texture's U nor a head joint along its V, so that one diagonal pair widens
    both, on both sides; the most of the three is the widened joint. The set's own courses are counted in its height map,
    so the width is a share of a course whatever the tile size, as Bed's lip is."""
    n = _bed_joints(img, q[2] - 0.04)
    if n < 2 or h.projection != 'FLAT': return joint
    if h.inputs['Vector'].is_linked:
        vec = h.inputs['Vector'].links[0].from_socket
    else:
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.location = (x - 500, y - 700); vec = uvn.outputs['UV']
    acc, g = joint, JOINT_GROW / n
    for k, sg in enumerate((1.0, -1.0)):
        yy = y - 700 - 250 * k
        add = nt.nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'; add.location = (x - 250, yy)
        nt.links.new(vec, add.inputs[0]); add.inputs[1].default_value = (sg * g, sg * g, 0.0)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.label = "wear: the height beside"
        t.location = (x, yy)
        t.projection, t.projection_blend = h.projection, h.projection_blend
        t.interpolation, t.extension = h.interpolation, h.extension
        nt.links.new(add.outputs['Vector'], t.inputs['Vector'])
        jr = nt.nodes.new('ShaderNodeMapRange'); jr.location = (x + 300, yy)
        jr.inputs['From Min'].default_value = q[2] - 0.04
        jr.inputs['From Max'].default_value = q[0] + 0.03
        nt.links.new(t.outputs['Color'], jr.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.location = (x + 500, yy)
        nt.links.new(acc, mx.inputs[0]); nt.links.new(jr.outputs['Result'], mx.inputs[1])
        acc = mx.outputs[0]
    return acc


def surface_signals(nt, cls, x, y):
    """(Joint, Grain, Bed, Joint Wide) sockets or values from the material's OWN maps, for joint-following and
    grain-following edges. Joint is 1 in a mortar joint and 0 on a brick's face; Grain is the surface's own relief
    spread over about 0..1; Bed is 1 in a bed joint and on the lip of brick just under it (brick only, see _bed_signal);
    Joint Wide is the joint grown JOINT_GROW of a course past its edges (brick only, see _wide_signal; added by AI 573).
    From, in order: a procedural Brick Texture's mortar factor; the set's height.png beside its base colour, read with
    the base colour's own coordinates and projection; the packed AO; else constants (no joints, flat grain)."""
    brick = next((n for n in nt.nodes if n.type == 'TEX_BRICK'), None)
    if brick is not None:
        return brick.outputs['Fac'], 0.5, brick.outputs['Fac'], brick.outputs['Fac']
    texs = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image]
    base = next((n for n in texs if 'basecolor' in n.image.name.lower()), None)
    if base is not None:
        f = _image_file(base.image)
        hp = os.path.join(os.path.dirname(f), "height.png") if f else None
        if hp and os.path.isfile(hp):
            img = bpy.data.images.load(hp, check_existing=True)
            img.colorspace_settings.name = 'Non-Color'
            h = nt.nodes.new('ShaderNodeTexImage'); h.image = img; h.label = "wear: the set's own height"
            h.location = (x, y)
            h.projection, h.projection_blend = base.projection, base.projection_blend
            h.interpolation, h.extension = base.interpolation, base.extension
            if base.inputs['Vector'].is_linked:
                nt.links.new(base.inputs['Vector'].links[0].from_socket, h.inputs['Vector'])
            q = _quantiles(img, [0.04, 0.05, 0.5, 0.95])
            grain = nt.nodes.new('ShaderNodeMapRange'); grain.location = (x + 300, y)
            grain.inputs['From Min'].default_value, grain.inputs['From Max'].default_value = q[1], max(q[3], q[1] + 1e-3)
            nt.links.new(h.outputs['Color'], grain.inputs['Value'])
            if cls == classes.BRICK:
                # the brick set's height holds its faces high and its joints low: faces at the median, joints in the
                # low tail. Joint rises from 0 just under the face level to 1 at the joint floor.
                joint = nt.nodes.new('ShaderNodeMapRange'); joint.location = (x + 300, y - 200)
                joint.inputs['From Min'].default_value = q[2] - 0.04
                joint.inputs['From Max'].default_value = q[0] + 0.03
                nt.links.new(h.outputs['Color'], joint.inputs['Value'])
                bed = _bed_signal(nt, h, img, q, joint.outputs['Result'], x, y)
                wide = _wide_signal(nt, h, img, q, joint.outputs['Result'], x, y)
                return joint.outputs['Result'], grain.outputs['Result'], bed, wide
            return 0.0, grain.outputs['Result'], 0.0, 0.0
    arm = next((n for n in texs if n.image.name.lower().endswith('_arm') or '_arm' in n.image.name.lower()), None)
    if arm is not None:
        q = _quantiles(arm.image, [0.05, 0.95])
        if q[1] - q[0] < 0.02:
            # a flat AO (the terracotta trim's reads 0.984 to 0.985): spread over 0..1 it would turn the map's last-bit
            # quantisation into a speckle, so it gives no grain at all
            return 0.0, 0.5, 0.0, 0.0
        sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (x, y)
        nt.links.new(arm.outputs['Color'], sep.inputs['Color'])
        grain = nt.nodes.new('ShaderNodeMapRange'); grain.location = (x + 300, y)
        grain.inputs['From Min'].default_value, grain.inputs['From Max'].default_value = q[0], max(q[1], q[0] + 1e-3)
        nt.links.new(sep.outputs['Red'], grain.inputs['Value'])
        return 0.0, grain.outputs['Result'], 0.0, 0.0
    return 0.0, 0.5, 0.0, 0.0


def wear_material(mat, cls, layer):
    """Put WEAR_layer between the material's texture reads and its BSDF. Returns (done, why)."""
    nt = mat.node_tree
    if nt is None: return False, "no node tree"
    if any(n.type == 'GROUP' and n.node_tree is not None and n.node_tree.name == LAYER for n in nt.nodes):
        return False, "already worn"
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if out is None or not out.inputs['Surface'].is_linked: return False, "no active surface output"
    bsdf = out.inputs['Surface'].links[0].from_node
    if bsdf.type != 'BSDF_PRINCIPLED': return False, f"surface is a {bsdf.type}, not a Principled BSDF"
    gn = nt.nodes.new('ShaderNodeGroup'); gn.node_tree = layer
    gn.name = gn.label = "WEAR"
    gn.location = (bsdf.location.x - 300, bsdf.location.y + 360)
    routes = [("Base Color", "Color"), ("Roughness", "Roughness")]
    if bsdf.inputs["Normal"].is_linked: routes.append(("Normal", "Normal"))
    if cls == classes.GLASS: routes += [("Alpha", "Alpha"), ("Transmission Weight", "Transmission"),
                                        ("Specular IOR Level", "Specular")]
    if cls == classes.METAL: routes.append(("Metallic", "Metallic"))
    for bs, gs in routes:
        bi = bsdf.inputs[bs]
        if bi.is_linked:
            nt.links.new(bi.links[0].from_socket, gn.inputs[gs])
        else:
            dv = bi.default_value
            gn.inputs[gs].default_value = tuple(dv) if hasattr(dv, "__len__") else dv
        nt.links.new(gn.outputs[gs], bi)
    gn.inputs["Class"].default_value = float(cls)
    joint, grain, bed, wide = surface_signals(nt, cls, gn.location.x - 700, gn.location.y + 400)
    for nm, v in (("Joint", joint), ("Grain", grain), ("Bed", bed), ("Joint Wide", wide)):
        if isinstance(v, bpy.types.NodeSocket): nt.links.new(v, gn.inputs[nm])
        else: gn.inputs[nm].default_value = float(v)
    mat["wear_class"] = classes.NAMES[cls]
    return True, "+".join(r[1] for r in routes)
