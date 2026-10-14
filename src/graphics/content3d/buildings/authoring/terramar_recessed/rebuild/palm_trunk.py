# palm_trunk.py -- palm detail upgrade: the palm trunk with its crown boot zone, built into a caller's bmesh.
#
# Replaces proc_plants.py's tapered 8-10 sided prism (trunk()) for the street palms (8-10.5 m, r 0.24 -> 0.17) and the
# small roof palms (1.0-1.4 m, r 0.10 -> 0.075). b8's street palms are tall slender grey-brown trunks with fine
# leaf-scar rings, slightly curved and leaning, clean up to a compact brown boot zone under the crown:
#   shaft   `sides`-gon rings along a smooth seeded axis (a soft single bend or a slight S, the top offset `lean` metres
#           along +X, the base vertical); a fast taper low on the trunk, a subtle seeded swelling and a slightly
#           irregular cross-section; ring 0 is the exact circle the root base ends in (z 0, r_base, first vertex at +X,
#           counter-clockwise, no bottom cap) and the composer welds the two rings
#   scars   leaf-scar rings two vertex rings each (a shallow groove ring and a crest ring between grooves), spaced
#           irregularly (about 18 cm low, 9 cm under the crown, scaled down for small trunks), each groove tilted a
#           little in its own direction and of its own depth, fainter near the base: rings, not a coiled spring
#   boots   the crown boot zone (about 5 x r_top long: 0.8-1.0 m on a street palm, 0.3-0.4 m on a roof palm): a fibrous
#           core under a golden-angle spiral of old frond bases, each a thick crescent sheath clasping the core and
#           rising along it to an angled cut (short pineapple-cut knobs low, the cut facing out; longer upright
#           sheaths at the top, the cup the fronds leave from); about 1.4 x r_top across, compact as b8; below it the
#           spiral fades out as a few low bark knobs, so the bark meets the boots without a hard edge
#   cap     a low dome closing the core above the crown attachment, hidden by the frond bases
# Materials (slot order MATERIAL_NAMES, faces at slot0 + 0 bark / + 1 boot): procedural node shaders, no textures. The
# bark draws its rings from the vertex attributes below (aligned with the groove geometry): each groove a zigzag of old
# leaf-base scars (b8's staggered diamond texture, seeded per scar), the band above it lighter, finer rings, faint
# striations, vertical fibre streaks and slow tonal bands (natural variation, no soiling spots); the boot is a dark
# fibrous brown with dark crevices (local AO), lighter at the cut faces.
# Mesh data written (keep it: rb_lib.finish would box-project the UVs and dissolve the rings):
#   UV layer (the active one)   U around the trunk (0..1 from +X, counter-clockwise), V the height in metres
#   rbp_scar     float, the scar phase (integer at a groove ring); rbp_scar_k its contrast (0 off the bark)
#   rbp_along    float, the bark's fraction up the shaft (0 base, 1 at the boot zone and above)
#   rbp_tip      float, along each boot (0 base, 1 cut end); 0 elsewhere
#   rbp_var      float, a seeded 0..1 per trunk (bark) and per boot
# Triangles (sides 24): a 10 m street trunk 8.8-9.4k (10.5 m up to ~9.7k), a 1.2 m roof trunk 2.5-2.7k.
# Test renders (the composition lighting, never saved):
#   blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_building.blend --python palm_trunk.py --
#           [out=<dir>] [samples=96] [shots=pair,rings,boots,small] [pct=100]
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

MATERIAL_NAMES = ("RBP_palm_bark", "RBP_palm_boot")      # slot order
GOLDEN = 2.399963229728653                               # the golden angle (rad): the boots' phyllotaxis
ATTRS = ("rbp_scar", "rbp_scar_k", "rbp_along", "rbp_tip", "rbp_var")
SCAR_BOTTOM, SCAR_TOP = 0.18, 0.09                       # leaf-scar spacing (m) on a street trunk, base and top
U5 = (-1.0, -0.5, 0.0, 0.5, 1.0)                         # a boot's outer cross-section samples, edge to edge
INNER = (-0.5, 0.0, 0.5)                                 # and its inner (trunk side) ones
CHEVRONS = 5.0                                           # leaf-base scar cells round the trunk (the zigzag rings)


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- materials


class _Nodes:
    """A small node-tree writer: nodes by type with inputs set or linked by name / index."""

    def __init__(self, tree):
        self.tree = tree
        self.x = -1600

    def new(self, kind, **props):
        n = self.tree.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (self.x, 0)
        self.x += 60
        return n

    def socket(self, node, key, outputs=False):
        sockets = node.outputs if outputs else node.inputs
        if isinstance(key, int):
            return sockets[key]
        for s in sockets:
            if s.identifier == key and s.enabled:
                return s
        for s in sockets:
            if s.name == key and s.enabled:
                return s
        raise KeyError(f"{node.bl_idname}: no socket {key}")

    def set(self, node, **inputs):
        for k, v in inputs.items():
            k = k.replace("_", " ") if k not in ("A_Color", "B_Color", "Factor_Float") else k
            self.feed(node, k, v)
        return node

    def feed(self, node, key, v):
        dst = self.socket(node, key)
        if isinstance(v, tuple) and len(v) == 2 and hasattr(v[0], "outputs"):
            self.tree.links.new(self.socket(v[0], v[1], outputs=True), dst)
        elif hasattr(v, "outputs"):
            self.tree.links.new(v.outputs[0], dst)
        elif hasattr(v, "is_output"):
            self.tree.links.new(v, dst)
        else:
            dst.default_value = v

    def attr(self, name):
        return self.new("ShaderNodeAttribute", attribute_type="GEOMETRY", attribute_name=name).outputs["Fac"]

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.feed(n, i, v)
        return n.outputs[0]

    def map_range(self, v, f0, f1, t0, t1, smooth=True):
        n = self.new("ShaderNodeMapRange", data_type="FLOAT", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR")
        for i, x in enumerate((v, f0, f1, t0, t1)):
            self.feed(n, i, x)
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type="MIX", clamp_factor=True)
        for key, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
            self.feed(n, key, (*v, 1.0) if isinstance(v, tuple) and len(v) == 3 else v)
        return self.socket(n, "Result_Color", outputs=True)

    def scaled_coords(self, sx, sy, sz):
        tc = self.new("ShaderNodeTexCoord")
        n = self.new("ShaderNodeVectorMath", operation="MULTIPLY")
        self.feed(n, 0, tc.outputs["Object"])
        n.inputs[1].default_value = (sx, sy, sz)
        return n.outputs[0]

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0):
        n = self.new("ShaderNodeTexNoise", noise_dimensions="3D")
        self.feed(n, "Vector", vec)
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Distortion"].default_value = distortion
        return n.outputs["Fac"]


def _shader_tail(w, mat, color, rough, height, bump_strength, bump_distance, spec=0.3):
    bsdf = w.new("ShaderNodeBsdfPrincipled")
    w.feed(bsdf, "Base Color", color)
    w.feed(bsdf, "Roughness", rough)
    w.feed(bsdf, "Specular IOR Level", spec)
    bump = w.new("ShaderNodeBump")
    w.feed(bump, "Strength", bump_strength)
    w.feed(bump, "Distance", bump_distance)
    w.feed(bump, "Height", height)
    w.feed(bsdf, "Normal", bump.outputs["Normal"])
    out = w.new("ShaderNodeOutputMaterial")
    w.feed(out, "Surface", bsdf.outputs["BSDF"])


def _bark(mat):
    """Grey-brown matte bark: leaf-scar grooves from rbp_scar, each a zigzag of old leaf-base scars (CHEVRONS cells
    around, a random stagger and depth per scar: b8's staggered diamond texture), wavy, partly broken, per-scar
    contrast; each band lighter just above its groove with its own tone, finer rings between, faint striations, long
    vertical fibre streaks, slow tonal bands up the trunk; greyer low on the trunk, browner just under the boots."""
    w = _Nodes(mat.node_tree)
    phase, k, along, var = w.attr("rbp_scar"), w.attr("rbp_scar_k"), w.attr("rbp_along"), w.attr("rbp_var")
    wob = w.noise(w.scaled_coords(2.2, 2.2, 1.4), 1.0, detail=1.0)                  # rings not perfectly level
    jag = w.noise(w.scaled_coords(10.0, 10.0, 2.0), 1.0, detail=1.0)                 # nor perfectly smooth
    row = w.math("FLOOR", w.math("ADD", phase, 0.5))                                 # the scar this band belongs to
    rnd = w.new("ShaderNodeTexWhiteNoise", noise_dimensions="1D")
    w.feed(rnd, "W", row)
    rgb = w.new("ShaderNodeSeparateColor")
    w.feed(rgb, "Color", rnd.outputs["Color"])
    u = w.new("ShaderNodeSeparateXYZ")
    w.feed(u, "Vector", w.new("ShaderNodeUVMap").outputs["UV"])
    cell_u = w.math("MULTIPLY_ADD", u.outputs["X"], CHEVRONS, w.math("MULTIPLY_ADD", jag, 0.15, rnd.outputs["Value"]))
    tri = w.math("ABSOLUTE", w.math("SUBTRACT", w.math("FRACT", cell_u), 0.5))       # 0 mid-cell .. 0.5 at its edges
    amp = w.math("MULTIPLY_ADD", rgb.outputs["Red"], 0.5, 0.25)                      # zigzag depth (phase per unit)
    near = w.math("ABSOLUTE", w.math("SUBTRACT", phase, row))                        # 0 at the groove, .5 mid-band
    zig = w.math("MULTIPLY", w.math("MULTIPLY", w.math("SUBTRACT", tri, 0.25), amp),
                 w.map_range(near, 0.28, 0.48, 1.0, 0.0))                            # gone where the rows meet
    ph0 = w.math("MULTIPLY_ADD", wob, 0.16, w.math("MULTIPLY_ADD", jag, 0.10, w.math("SUBTRACT", phase, 0.13)))
    ph = w.math("ADD", ph0, zig)
    band = w.new("ShaderNodeTexWhiteNoise", noise_dimensions="1D")
    w.feed(band, "W", w.math("FLOOR", ph))
    cell_tone = w.math("MULTIPLY_ADD", w.math("MULTIPLY", band.outputs["Value"], k), 0.16, 0.94)  # per band
    fa = w.math("FRACT", ph)
    dist = w.math("MINIMUM", fa, w.math("SUBTRACT", 1.0, fa))
    line = w.map_range(dist, 0.0, 0.05, 1.0, 0.0)                                  # the scar line
    dark = w.math("MULTIPLY_ADD", w.map_range(dist, 0.0, 0.26, 1.0, 0.0), 0.75,     # and the recess round it
                  w.math("MULTIPLY", line, 0.25))
    saw = w.map_range(fa, 0.06, 1.0, 1.0, 0.0, smooth=False)                       # the band: light above the groove
    ph3 = w.math("MULTIPLY_ADD", zig, 0.25, ph0)                                     # the finer rings barely zigzag
    fb = w.math("FRACT", w.math("MULTIPLY_ADD", ph3, 3.0, w.math("MULTIPLY", wob, 0.6)))
    minor = w.map_range(w.math("MINIMUM", fb, w.math("SUBTRACT", 1.0, fb)), 0.0, 0.08, 1.0, 0.0)  # finer rings
    broken = w.map_range(w.noise(w.scaled_coords(14.0, 14.0, 3.0), 1.0, detail=2.0), 0.32, 0.68, 0.35, 1.0)
    broken2 = w.map_range(w.noise(w.scaled_coords(22.0, 22.0, 9.0), 1.0, detail=2.0), 0.38, 0.62, 0.0, 1.0)
    kk = w.math("MULTIPLY", k, broken)
    k2 = w.math("MULTIPLY", w.math("ADD", k, 0.35, clamp=True), broken2)
    ring_f = w.math("MULTIPLY_ADD", w.math("MULTIPLY", dark, kk), -0.5,
                    w.math("MULTIPLY_ADD", w.math("MULTIPLY", minor, k2), -0.12,
                           w.math("MULTIPLY_ADD", w.math("MULTIPLY", w.math("SUBTRACT", saw, 0.5), k), 0.48, 1.0)))
    wave = w.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z", wave_profile="SIN")
    w.feed(wave, "Vector", w.new("ShaderNodeTexCoord").outputs["Object"])
    w.set(wave, Scale=27.0, Distortion=2.6, Detail=2.0, Detail_Scale=1.4)
    fine = w.math("MULTIPLY", wave.outputs["Fac"], w.map_range(w.noise(w.scaled_coords(6.0, 6.0, 2.0), 1.0), 0.4, 0.6,
                                                                0.0, 1.0))
    fine_f = w.math("MULTIPLY_ADD", fine, -0.025, 1.012)
    streak = w.map_range(w.noise(w.scaled_coords(9.0, 9.0, 0.5), 1.0, detail=3.0, rough=0.55, distortion=0.8),
                         0.34, 0.66, 0.0, 1.0)
    streak_f = w.math("MULTIPLY_ADD", streak, 0.16, 0.92)
    tone = w.map_range(w.noise(w.scaled_coords(0.6, 0.6, 2.6), 1.0, detail=1.0), 0.35, 0.65, 0.93, 1.06)
    factor = w.math("MULTIPLY", w.math("MULTIPLY", ring_f, fine_f), w.math("MULTIPLY", streak_f, tone))
    factor = w.math("MULTIPLY", factor, cell_tone)
    base = w.mix(var, (0.240, 0.164, 0.104), (0.222, 0.160, 0.114))                # per-trunk tint
    base = w.mix(w.map_range(along, 0.0, 0.22, 0.35, 0.0), base, (0.228, 0.198, 0.164))   # older and greyer low
    base = w.mix(w.map_range(along, 0.78, 1.0, 0.0, 0.70), base, (0.180, 0.122, 0.080))   # browner under the boots
    vm = w.new("ShaderNodeVectorMath", operation="SCALE")
    w.feed(vm, 0, base)
    w.feed(vm, "Scale", factor)
    rough = w.math("MULTIPLY_ADD", streak, -0.06, 0.88)
    height = w.math("MULTIPLY_ADD", w.math("MULTIPLY", dark, kk), -0.8,
                    w.math("MULTIPLY_ADD", w.math("MULTIPLY", minor, k2), -0.25,
                           w.math("MULTIPLY_ADD", w.math("MULTIPLY", saw, k), 0.45,
                                  w.math("MULTIPLY_ADD", streak, 0.2, w.math("MULTIPLY", fine, 0.1)))))
    _shader_tail(w, mat, vm.outputs[0], rough, height, 0.6, 0.006, spec=0.3)


def _boot(mat):
    """Dark fibrous brown frond bases: fibres along the boot (object z), per-boot tone, lighter greyed cut faces."""
    w = _Nodes(mat.node_tree)
    tip, var = w.attr("rbp_tip"), w.attr("rbp_var")
    fibre = w.map_range(w.noise(w.scaled_coords(85.0, 85.0, 3.0), 1.0, detail=5.0, rough=0.6, distortion=0.4),
                        0.28, 0.72, 0.0, 1.0)
    coarse = w.map_range(w.noise(w.scaled_coords(9.0, 9.0, 2.5), 1.0, detail=2.0), 0.3, 0.7, 0.0, 1.0)
    base = w.mix(var, (0.058, 0.039, 0.024), (0.112, 0.073, 0.042))
    base = w.mix(w.map_range(tip, 0.6, 1.0, 0.0, 0.45), base, (0.205, 0.160, 0.115))
    ao = w.new("ShaderNodeAmbientOcclusion", samples=12, only_local=True)
    w.feed(ao, "Distance", 0.12)
    cavity = w.math("MULTIPLY_ADD", ao.outputs["AO"], 0.7, 0.3)                    # dark crevices between the bases
    factor = w.math("MULTIPLY", w.math("MULTIPLY_ADD", fibre, 0.48, 0.70), w.math("MULTIPLY_ADD", coarse, 0.18, 0.91))
    factor = w.math("MULTIPLY", factor, cavity)
    vm = w.new("ShaderNodeVectorMath", operation="SCALE")
    w.feed(vm, 0, base)
    w.feed(vm, "Scale", factor)
    height = w.math("MULTIPLY_ADD", fibre, 0.7, w.math("MULTIPLY", coarse, 0.3))
    _shader_tail(w, mat, vm.outputs[0], 0.93, height, 0.6, 0.005, spec=0.25)


def materials():
    """Create or refresh RBP_palm_bark and RBP_palm_boot (procedural node shaders); return them in slot order."""
    made = []
    for name, build, rgb in ((MATERIAL_NAMES[0], _bark, (0.30, 0.26, 0.21)),
                             (MATERIAL_NAMES[1], _boot, (0.15, 0.10, 0.06))):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        build(mat)
        mat.diffuse_color = (*rgb, 1.0)
        mat.roughness = 0.9
        made.append(mat)
    return made


# ---------------------------------------------------------------- geometry


def _axis(rng, height, lean):
    """The trunk's centre line at t (0 base .. 1 top, z = height * t): vertical at the base, top offset (lean, 0)."""
    p = rng.uniform(1.4, 2.0)
    w = rng.uniform(0.0, 0.7)                                # 0 a single bend, toward 1 a slight S
    bx = rng.uniform(-1.0, 1.0) * 0.004 * height            # an S wobble in the lean plane
    by = rng.uniform(-1.0, 1.0) * 0.006 * height            # a bow across it

    def at(t):
        g = (1.0 - w) * t ** p + w * (3.0 * t * t - 2.0 * t ** 3) if t > 0.0 else 0.0
        return Vector((lean * g + bx * math.sin(2.0 * math.pi * t) * t, by * 6.75 * t * t * (1.0 - t), height * t))
    return at


def _frames(at, ts):
    """Parallel-transported (centre, tangent, normal, binormal) at each t: (0, z, x, y) at t 0, no twist."""
    out = []
    n = Vector((1.0, 0.0, 0.0))
    for t in ts:
        e = 1e-4
        tan = Vector((0.0, 0.0, 1.0)) if t <= 0.0 else (at(t + e) - at(t - e)).normalized()
        n = (n - tan * n.dot(tan)).normalized()
        out.append((at(t), tan, n, tan.cross(n)))
    return out


def _frame_at(at, frames, ts, t):
    """The frame at any t, from the ring frame below it (projected onto the plane across the local tangent)."""
    j = max(i for i, x in enumerate(ts) if x <= t + 1e-9)
    tan = (at(t + 1e-4) - at(t - 1e-4)).normalized()
    n = frames[j][2]
    n = (n - tan * n.dot(tan)).normalized()
    return at(t), tan, n, tan.cross(n)


def _scar_rings(rng, z_boot, scale):
    """The shaft's vertex rings (z, phase, groove index, crest neighbours) up to the boot zone, and the grooves
    (depth, tilt)."""
    grooves = []
    z = 0.5 * SCAR_BOTTOM * scale * rng.uniform(0.8, 1.2)
    while True:
        s = z / z_boot
        sp = (SCAR_BOTTOM + (SCAR_TOP - SCAR_BOTTOM) * s ** 0.8) * scale
        if z > z_boot - 0.6 * sp:
            break
        roll = rng.random()
        k = (0.5 + 0.5 * smoothstep(0.0, 0.45, s)) * rng.uniform(0.5, 1.0)
        k = k * 0.25 if roll < 0.10 else (min(k * 1.3, 1.0) if roll > 0.92 else k)   # a few faint, a few strong
        k *= 1.0 + 0.15 * smoothstep(0.82, 1.0, s)
        tilt = max(-1.0, min(1.0, rng.gauss(0.0, 0.5))) * min(0.03, 0.22 * sp)     # rise per unit radius
        grooves.append({"z": z, "k": k, "tilt": tilt, "az": rng.uniform(0.0, 2.0 * math.pi)})
        z += sp * rng.uniform(0.65, 1.4)
    rings = [(0.0, 0.5, None, None)]
    for i, g in enumerate(grooves):
        rings.append((g["z"], float(i + 1), i, None))
        z_next = grooves[i + 1]["z"] if i + 1 < len(grooves) else z_boot
        rings.append((0.5 * (g["z"] + z_next), i + 1.5, None, (i, i + 1)))
    rings.append((z_boot, len(grooves) + 0.5, None, None))
    return rings, grooves


def build_trunk(bm, rng, *, height, r_base, r_top, lean, sides=24, slot0=0):
    """The trunk with its crown boot zone into bm (see the header); returns its attachment data."""
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
    lay = {n: bm.verts.layers.float.get(n) or bm.verts.layers.float.new(n) for n in ATTRS}
    faces = []
    size = min(max(r_base / 0.24, 0.65), 1.0)                # small trunks: closer scars, smaller grooves, fewer boots
    L_boot = min(r_top * rng.uniform(4.4, 5.6), 0.3 * height)
    z_boot = height - L_boot
    at = _axis(rng, height, lean)
    var_trunk = rng.random()

    # radius: fast taper low on the trunk, a subtle seeded swelling, an irregular section (none at ring 0)
    k_taper = rng.uniform(1.15, 1.6)
    sw_t, sw_w, sw_a = rng.uniform(0.3, 0.65), rng.uniform(0.12, 0.22), rng.uniform(0.025, 0.06)
    harm = [(m, rng.uniform(0.005, 0.012) / (m - 1), rng.uniform(0.0, 2.0 * math.pi), rng.uniform(-0.5, 0.5))
            for m in (2, 3, 5)]

    def shaft_r(s):
        swell = sw_a * r_base * (math.exp(-((s - sw_t) / sw_w) ** 2) - math.exp(-(sw_t / sw_w) ** 2) * (1.0 - s))
        return r_top + (r_base - r_top) * (1.0 - s) ** k_taper + swell

    def section(theta, z, fade):
        return 1.0 + fade * sum(a * math.cos(m * theta + ph + om * z) for m, a, ph, om in harm)

    rings, grooves = _scar_rings(rng, z_boot, size)
    n_core = max(4, round(L_boot / (0.11 * max(size, 0.7))))
    core = [z_boot + L_boot * (j / n_core) for j in range(1, n_core + 1)]
    r_crown = r_top * rng.uniform(1.04, 1.09)

    def core_r(u):
        return r_top + (r_crown - r_top) * u + r_top * 0.10 * max(math.sin(math.pi * u), 0.0) ** 0.8

    ts = [z / height for z, *_ in rings] + [z / height for z in core]
    frames = _frames(at, ts)
    thetas = [2.0 * math.pi * k / sides for k in range(sides)]
    loops = []
    for j, (z, phase, gi, crest) in enumerate(rings):
        c, tan, n, b = frames[j]
        s = z / z_boot
        fade = smoothstep(0.0, 0.05, s)
        r = shaft_r(s)
        off, kval, dz = 0.0, 0.0, [0.0] * sides
        if gi is not None:
            g = grooves[gi]
            off, kval = -0.022 * g["k"] * size ** 0.5 * fade, g["k"] * fade
            dz = [g["tilt"] * r * math.cos(th - g["az"]) for th in thetas]
        elif crest is not None:
            gs = [grooves[i] for i in crest if i < len(grooves)]
            kval = sum(g["k"] for g in gs) / len(gs) * fade
            off = 0.006 * kval
            dz = [sum(g["tilt"] * r * math.cos(th - g["az"]) for g in gs) / 2.0 for th in thetas]
        ring = []
        for k, th in enumerate(thetas):
            rk = r * (1.0 + off) * section(th, z, fade)
            v = bm.verts.new(c + (n * math.cos(th) + b * math.sin(th)) * rk + tan * dz[k])
            v[lay["rbp_scar"]], v[lay["rbp_scar_k"]], v[lay["rbp_along"]] = phase, kval, min(s, 1.0)
            v[lay["rbp_tip"]], v[lay["rbp_var"]] = 0.0, var_trunk
            ring.append(v)
        loops.append((ring, z, 0))
    for jj, z in enumerate(core):
        c, tan, n, b = frames[len(rings) + jj]
        u = (z - z_boot) / L_boot
        r = core_r(u)
        ring = []
        for th in thetas:
            v = bm.verts.new(c + (n * math.cos(th) + b * math.sin(th)) * r * section(th, z, 1.0 - u))
            v[lay["rbp_along"]], v[lay["rbp_var"]] = 1.0, var_trunk
            ring.append(v)
        loops.append((ring, z, 1))

    # the cap: a low dome over the crown attachment, then a fan to the apex
    c_top, t_top, n_top, b_top = frames[-1]
    for h, f in ((0.28, 0.72), (0.46, 0.36)):
        ring = []
        for th in thetas:
            radial = n_top * math.cos(th) + b_top * math.sin(th)
            v = bm.verts.new(c_top + t_top * (h * r_crown) + radial * (f * r_crown))
            v[lay["rbp_along"]], v[lay["rbp_var"]] = 1.0, var_trunk
            ring.append(v)
        loops.append((ring, height + h * r_crown, 1))
    apex = bm.verts.new(c_top + t_top * (0.54 * r_crown))
    apex[lay["rbp_along"]], apex[lay["rbp_var"]] = 1.0, var_trunk

    for (a, za, _), (bb, zb, mb) in zip(loops, loops[1:]):
        for k in range(sides):
            f = bm.faces.new((a[k], a[(k + 1) % sides], bb[(k + 1) % sides], bb[k]))
            f.material_index, f.smooth = slot0 + mb, True
            for lp, (uu, vv) in zip(f.loops, ((k, za), (k + 1, za), (k + 1, zb), (k, zb))):
                lp[uv].uv = (uu / sides, vv)
            faces.append(f)
    last, z_last, _ = loops[-1]
    for k in range(sides):
        f = bm.faces.new((last[k], last[(k + 1) % sides], apex))
        f.material_index, f.smooth = slot0 + 1, True
        for lp, (uu, vv) in zip(f.loops, ((k, z_last), (k + 1, z_last), (k + 0.5, height + 0.54 * r_crown))):
            lp[uv].uv = (uu / sides, vv)
        faces.append(f)

    # the boots: a golden-angle spiral of cut frond bases over the boot zone (b8: compact, knobby, dark), short
    # pineapple-cut knobs low (the cut faces outward), longer upright sheaths at the top: the cup the fronds leave from
    n_boots = int(min(max(round(L_boot / (r_top * 0.14) * size ** 0.6), 12), 40))
    az0 = rng.uniform(0.0, 2.0 * math.pi)
    outer_r = r_crown
    for i in range(n_boots):
        q = i / (n_boots - 1)
        cup = smoothstep(0.68, 1.0, q)                       # the youngest bases
        hb = z_boot + L_boot * (-0.06 + 0.86 * q ** 0.95)
        az = az0 + i * GOLDEN + rng.uniform(-0.15, 0.15)
        shape = {"elev": math.radians(70.0 + 16.0 * q + rng.uniform(-6.0, 6.0)),
                 "length": r_top * rng.uniform(0.5, 0.95) * (1.0 + 1.5 * cup),
                 "cut": rng.uniform(0.8, 2.6) * (1.0 - 0.75 * cup),
                 "w0": rng.uniform(0.5, 0.75) + 0.2 * cup,
                 "tau0": r_top * rng.uniform(0.07, 0.12) * (1.0 - 0.3 * cup),
                 "roll": rng.uniform(-0.25, 0.25)}
        rc = core_r(min(max((hb - z_boot) / L_boot, 0.0), 1.0))
        boot = _boot_mesh(bm, at, frames, ts, height, hb, az, shape, rc, r_top, rng, lay)
        outer_r = max(outer_r, boot["reach"])
        for f in boot["faces"]:
            f.material_index = slot0 + 1
        faces.extend(boot["faces"])
    # below them, the spiral continues as a few low bark knobs (old bases worn down): a knobby transition, no edge
    n_rem = max(3, round(n_boots * 0.15))
    for j in range(n_rem):
        hb = z_boot - L_boot * (0.04 + 0.30 * (j / (n_rem - 1)) ** 1.2)
        shape = {"elev": math.radians(82.0), "length": r_top * rng.uniform(0.22, 0.34), "cut": rng.uniform(1.0, 1.6),
                 "w0": rng.uniform(0.35, 0.5), "tau0": r_top * rng.uniform(0.06, 0.09) * (1.0 - 0.4 * j / n_rem),
                 "roll": rng.uniform(-0.2, 0.2)}
        az = az0 - (j + 1) * GOLDEN + rng.uniform(-0.15, 0.15)
        knob = _boot_mesh(bm, at, frames, ts, height, hb, az, shape, shaft_r(hb / z_boot), r_top, rng, lay)
        for f in knob["faces"]:
            f.material_index = slot0
        faces.extend(knob["faces"])

    bm.normal_update()
    _boot_uvs(uv, at, frames, ts, height, [f for f in faces if f.tag])
    for f in faces:
        f.tag = False
    return {"top": c_top.copy(), "axis": t_top.copy(), "crown_radius": r_crown, "base_radius": r_base, "sides": sides,
            "tris": sum(len(f.verts) - 2 for f in faces), "crown_outer_radius": outer_r, "boot_zone": L_boot}


def _boot_mesh(bm, at, frames, ts, height, hb, az, shape, rc, r_top, rng, lay):
    """One frond base: a thick crescent sheath clasping the core at hb, rising along it and leaning out a little to an
    angled cut (shape: elev, length, cut, w0 half-width / rc, tau0 thickness)."""
    c, tan, n, b = _frame_at(at, frames, ts, hb / height)
    radial = n * math.cos(az) + b * math.sin(az)
    across = -n * math.sin(az) + b * math.cos(az)
    across = across * math.cos(shape["roll"]) + tan * math.sin(shape["roll"])   # a little askew
    length, elev = shape["length"], shape["elev"]
    sink = r_top * 0.06
    p0 = c + radial * (rc - sink)
    p1 = p0 + tan * (length * 0.45) + radial * (length * 0.03)
    p2 = p1 + (radial * math.cos(elev) + tan * math.sin(elev)) * (length * 0.6)
    w0, tau0, tau_min = rc * shape["w0"], shape["tau0"], r_top * 0.02
    seg = 0.5 * length
    var = rng.random()
    loops, reach = [], 0.0
    for s in (0.0, 0.5, 1.0):
        p = p0 * (1 - s) ** 2 + p1 * (2 * s * (1 - s)) + p2 * (s * s)
        d = ((p1 - p0) * (2 * (1 - s)) + (p2 - p1) * (2 * s)).normalized()
        o = across.cross(d).normalized()
        a = d.cross(o).normalized()
        rho = rc * (1.0 + 1.5 * s * s)
        w = w0 * (1.0 - 0.3 * s)
        tau = tau0 * (0.45 + 0.55 * smoothstep(0.0, 0.5, s))
        outer, inner = [], []
        for u in U5:
            al = u * w / rho
            q = p + a * (rho * math.sin(al)) + o * (rho * math.cos(al) - rho)
            nrm = a * math.sin(al) + o * math.cos(al)
            outer.append(q + nrm * (tau * (1.0 - u * u) ** 0.6 + tau_min))
            if u in INNER:
                inner.append(q)
        pts = outer + inner[::-1]
        if s == 1.0:                                          # the angled cut: the outer face ends lower
            pts = [x - d * max(min(shape["cut"] * (x - p).dot(o), 0.45 * seg), -0.3 * seg) for x in pts]
        ring = []
        for x in pts:
            v = bm.verts.new(x)
            v[lay["rbp_tip"]], v[lay["rbp_var"]], v[lay["rbp_along"]] = s, var, 1.0
            ring.append(v)
            rel = x - at(min(max(x.z / height, 0.0), 1.0))
            reach = max(reach, (rel - tan * rel.dot(tan)).length)
        loops.append(ring)
    m = len(loops[0])
    faces = []
    for la, lb in zip(loops, loops[1:]):
        for k in range(m):
            f = bm.faces.new((la[k], la[(k + 1) % m], lb[(k + 1) % m], lb[k]))
            f.smooth = True
            faces.append(f)
    tip = bm.faces.new(loops[-1])
    base = bm.faces.new(loops[0][::-1])
    for f in (tip, base):
        f.smooth = False
        for e in f.edges:
            e.smooth = False
    faces += [tip, base]
    for f in faces:
        f.tag = True
    return {"faces": faces, "reach": reach}


def _boot_uvs(uv, at, frames, ts, height, faces):
    """Cylindrical UVs (U around the trunk axis from its frame's +N, V the height) for the boot faces."""
    for f in faces:
        us = []
        for lp in f.loops:
            co = lp.vert.co
            c, tan, n, b = _frame_at(at, frames, ts, min(max(co.z / height, 0.0), 1.0))
            rel = co - c
            us.append((math.atan2(rel.dot(b), rel.dot(n)) / (2.0 * math.pi)) % 1.0)
        if max(us) - min(us) > 0.5:
            us = [x + 1.0 if x < 0.5 else x for x in us]
        for lp, x in zip(f.loops, us):
            lp[uv].uv = (x, lp.vert.co.z)


# ---------------------------------------------------------------- test renders


def _test(argv):
    """Build a 10 m and a 1.2 m trunk at (40, -45) in the open file's composition lighting and render the test views."""
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.normpath(os.path.join(here, *[".."] * 7))
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    out = os.path.abspath(opts.get("out", os.path.join(root, "tests", "artifacts", "screens", "buildings",
                                                       "terramar_recessed", "rebuild", "palm_detail", "trunk")))
    os.makedirs(out, exist_ok=True)
    shots = [s for s in opts.get("shots", "pair,rings,boots,small").split(",") if s]
    scene = bpy.context.scene
    assert "INSPECTION_RIG" in bpy.data.collections, "open terramar_building.blend (its INSPECTION_RIG lights the test)"
    sys.path.insert(0, os.path.dirname(here))
    from render_inspection import use_gpu  # noqa: E402
    scene.render.engine = "CYCLES"
    device = use_gpu(scene)
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    mats = materials()
    x0, y0 = 40.0, -45.0
    specs = (("tall", 10.0, 0.24, 0.17, 0.45, (x0, y0)), ("small", 1.2, 0.10, 0.075, 0.08, (x0 + 2.2, y0)))
    info = {}
    for name, h, rb, rt, lean, (x, y) in specs:
        bm = bmesh.new()
        info[name] = build_trunk(bm, random.Random(f"palm_trunk_test:{name}"), height=h, r_base=rb, r_top=rt, lean=lean)
        me = bpy.data.meshes.new(f"RBP_trunk_test_{name}")
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(f"RBP_trunk_test_{name}", me)
        ob.location = (x, y, 0.0)
        scene.collection.objects.link(ob)
        top = info[name]["top"]
        print(f"TRUNK {name}: h {h} tris {info[name]['tris']} top {tuple(round(v, 3) for v in top)} "
              f"crown_r {info[name]['crown_radius']:.3f} outer {info[name]['crown_outer_radius']:.3f} "
              f"boot_zone {info[name]['boot_zone']:.2f}")
    tall_top = info["tall"]["top"] + Vector((x0, y0, 0.0))
    small_top = info["small"]["top"] + Vector((x0 + 2.2, y0, 0.0))
    cams = {   # name: (location, target, vfov_deg, resolution)
        "pair": ((x0 + 1.4, y0 - 21.0, 1.7), (x0 + 1.4, y0, 5.6), 31.0, (1200, 1600)),
        "rings": ((x0 + 0.55, y0 - 1.25, 3.05), (x0 + 0.05, y0, 2.9), 38.0, (1600, 900)),
        "boots": ((tall_top.x + 1.2, tall_top.y - 2.6, tall_top.z - 1.4), (tall_top.x, tall_top.y, tall_top.z - 0.35),
                  42.0, (1600, 900)),
        "small": ((small_top.x + 0.6, small_top.y - 2.3, 1.0), (small_top.x, small_top.y, 0.75), 36.0, (1600, 900)),
    }
    cam_data = bpy.data.cameras.new("RBP_trunk_test_cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 0.02
    cam = bpy.data.objects.new("RBP_trunk_test_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name in shots:
        loc, target, vfov, res = cams[name]
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam_data.angle_y = math.radians(vfov)
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = os.path.join(out, f"trunk_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name} on {device} -> {scene.render.filepath}")
    print("TRUNK TEST DONE (the .blend is not saved)")


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
