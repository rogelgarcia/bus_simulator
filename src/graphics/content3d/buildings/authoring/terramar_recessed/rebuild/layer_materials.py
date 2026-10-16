# layer_materials.py -- AI 648: the materials pass of the Terra & Mar rebuild, from plan["materials"].
#
# Run through build.py, which appends it after any geometry layer it rebuilds (layers=materials alone re-dresses the
# materials; materials=0 skips it). It owns no collection of its own: it dresses the other layers' objects.
#   materials   every TM_RB_* face set is re-dressed by slot name from its family in the plan:
#                 roof_paving      the same limestone as 600 mm square tiles with thin joints, a per-tile map offset
#                                  (the roof terrace deck's walking face, AI 630)
#                 stone / paving   the kit limestone (AI 640, assets/public/pbr/terramar_continuous_limestone: basecolor,
#                                  arm = AO / roughness / metallic, normal_gl) through the node group TM_RB_limestone,
#                                  4 m repeat, a calibrated linear tone on the base colour
#                 wood             the calibrated warm tone of AI 645 (no wood texture is installed), flat
#                 veneer           (user fix 4c, 2026-10-15) the entrance and loggia wood: a procedural book-matched
#                                  quarter-cut teak-walnut veneer under a satin clear coat (dress_veneer); since user
#                                  fix 15 laid per plate (the podium layer's veneer plates carry their own map), each
#                                  plate with its own grain, tone and hue; veneer_reveal: the plates' dark reveals;
#                                  since user fix 17 also the balcony soffits' long plates (TM_RB_soffit_veneer, the
#                                  balconies layer's plates, their own slot for the wear's soffit class)
#                 soil             (user fix 23, 2026-10-16) TM_RB_soil as a game ground set read in place
#                                  (assets/public/pbr/<soil.set>, brown_mud: basecolor, arm, normal_gl) at world scale,
#                                  each mound its own map offset, a quarter-turned second sample blended in (dress_soil)
#                 glass            clear Principled glass whose shadow rays pass (lit rooms behind the glazing)
#                 steel / plaster / partition / interior_floor / concrete    plain Principled settings
#               The sign letters keep the kit's own sign sets (the podium layer's TM_RB_sign_* materials).
#   joints      the stone's panel joints cut as geometry into every object carrying a slot of joints.rules:
#                 course joints  z-planes from joints.course_planes, cut into the course faces whose height holds the
#                                groove with clearance (a lintel whose soffit sits on a plane is not cut there)
#                 vertical joints per flat vertical face at least vertical_min_height tall: equal panels of at most
#                                panel_max across its width, carried on over the faces they meet square (the stone
#                                soffit or top, an eased arris and the stone return past it: joints.carry_hops)
#                 seam joints    (2026-10-14) where two stone pieces meet flush (coplanar faces of different solids or
#                                objects sharing an edge: a lintel beside a pier, a band under a slab fascia, a jamb
#                                beside a pier) a joint centred on the seam, over the stretch the two faces share
#                 objects        (2026-10-14) joints.objects joints named objects in whichever part holds them, on a
#                                face set the rules leave alone elsewhere (the site's limestone tree pits on
#                                TM_RB_paving); `base` adds a joint at the foot of their sides, where they meet the paving
#                 grids          (user fix 11, 2026-10-15) joints.grids lays a region out as one regular grid of blocks
#                                across its pieces (the front centre: portal, front and corner piers, their fascias):
#                                its own course planes, equal within each band between its datums; vertical joints per
#                                plane, shared by every course; flush seams inside it off its course planes left uncut,
#                                and a block running over such a seam takes one map offset in both pieces; the slab
#                                fascias and plinth meeting it flush take their vertical joints from the stone they meet;
#                                since user fix 13 the grid is the whole podium (its `slots` only), so the storefront head
#                                bands, the piers and the returns on every run share one set of course planes;
#                                since user fix 19 a `module` grid (the penthouse) stretches nothing: one block size,
#                                courses from its datum, lines at the block pitch centred on each wall's run (its inner
#                                face, reveals and soffits on the outer face's lines), the blocks cut at the ends, the
#                                openings and the cap; its flush vertical seams off those lines are not cut either
#                 corners       (user fix 18 addendum, 2026-10-16) every outside corner of the stone (a fold of at
#                                least corners.min_angle_deg; a narrow eased or rounded arris closed up into it first)
#                                gets a mitre joint: a bevel symmetric about the corner easing both block ends and a slit
#                                along the bisector (find_corners, sharpen, corner_profile); not where the corner touches
#                                another piece (Contacts)
#                 arrises       (user fix 18d, 2026-10-16) the slab fascias' arrises to the other materials of their
#                                slab (the top, the floor, the ceiling, the canopy's soffit) chamfered by joints.arrises
#                                before anything else is cut (bevel_arrises); the chamfer is stone, shaded round, and
#                                its edge on the other material stays in that material's plane when a joint crosses it
#                 inside        (user fix 18d addendum) every inside corner where two stone faces meet (one solid or two)
#                                gets a joint of the standard section along it, half on each face (inside_corners)
#               A joint is a groove `width` wide and `depth` deep; since user fix 18 its side walls rise `wall` to
#               `bevel_depth` and each lip is an eased arris `bevel` across (profile), shaded round by custom normals
#               (arris_normals, also for a layer's rounded faces: ROUND_ATTR); its floor and walls take the joint
#               material (TM_RB_stone_joint). Each panel (a region bounded by joint floors) gets its own UV offset,
#               seeded, so the kit's 4 m repeat does not line up from panel to panel. An object is cut once: it is
#               tagged rb_joints and skipped until its layer rebuilds it.
#   writes      tests/artifacts/blender/terramar_recessed/rebuild/joint_layout.json (every original stone face with
#               the joint centre lines on it, world space, for compose_joint_layout.py's per-run elevations)
# joint_slot() gives the geometry layers TM_RB_stone_joint for the shadow gaps they model (2026-10-14: the stone
# returns' gaps between stone and wood); this pass dresses it with the joints' colour.
import hashlib
import importlib
import json
import math
import os
import random
import sys
from bisect import bisect_right

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

LAYER = "materials"
STONE_GROUP = "TM_RB_limestone"
JOINT_MATERIAL = "TM_RB_stone_joint"
JOINT_LAYOUT = os.path.join(L.C.REBUILD_DIR, "joint_layout.json")
ROUND_ATTR = "rb_round"           # face attribute: a layer's rounded edge (user fix 18 addendum 2: the tree pits)
TAU = 2.0 * math.pi


def joint_slot():
    """TM_RB_stone_joint for a layer's modelled shadow gaps: made dark if missing (this pass dresses it later)."""
    if bpy.data.materials.get(JOINT_MATERIAL) is None:
        mat = bpy.data.materials.new(JOINT_MATERIAL)
        mat.diffuse_color = (0.20, 0.185, 0.165, 1.0)
    return JOINT_MATERIAL


# ---------------------------------------------------------------- materials


def kit_image(folder, name, colorspace):
    img = bpy.data.images.load(os.path.join(folder, name), check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def stone_group(folder, repeat_m):
    """TM_RB_limestone: the kit's maps through UV / repeat; inputs Tone (linear multiplier), AO Strength, Roughness Gain,
    Normal Strength; output BSDF."""
    ng = bpy.data.node_groups.get(STONE_GROUP)
    if ng is not None:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new(STONE_GROUP, "ShaderNodeTree")
    ng.interface.new_socket(name="BSDF", in_out="OUTPUT", socket_type="NodeSocketShader")
    s = ng.interface.new_socket(name="Tone", in_out="INPUT", socket_type="NodeSocketColor")
    s.default_value = (1.0, 1.0, 1.0, 1.0)
    for name, val in (("AO Strength", 0.5), ("Roughness Gain", 1.0), ("Normal Strength", 1.0)):
        s = ng.interface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketFloat")
        s.default_value = val
    nodes, links = ng.nodes, ng.links
    gin, gout = nodes.new("NodeGroupInput"), nodes.new("NodeGroupOutput")
    tc = nodes.new("ShaderNodeTexCoord")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0 / repeat_m, 1.0 / repeat_m, 1.0)
    links.new(mp.inputs["Vector"], tc.outputs["UV"])

    def tex(name, colorspace):
        n = nodes.new("ShaderNodeTexImage")
        n.image = kit_image(folder, name, colorspace)
        n.interpolation = "Linear"
        n.extension = "REPEAT"
        links.new(n.inputs["Vector"], mp.outputs["Vector"])
        return n
    base, arm, nrm = tex("basecolor.png", "sRGB"), tex("arm.png", "Non-Color"), tex("normal_gl.png", "Non-Color")
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(sep.inputs["Color"], arm.outputs["Color"])
    tone = nodes.new("ShaderNodeVectorMath")
    tone.operation = "MULTIPLY"
    links.new(tone.inputs[0], base.outputs["Color"])
    links.new(tone.inputs[1], gin.outputs["Tone"])
    ao = nodes.new("ShaderNodeMath")                                   # mix(1, AO, s) = AO * s + (1 - s)
    ao.operation = "MULTIPLY_ADD"
    one_minus = nodes.new("ShaderNodeMath")
    one_minus.operation = "SUBTRACT"
    one_minus.inputs[0].default_value = 1.0
    links.new(one_minus.inputs[1], gin.outputs["AO Strength"])
    links.new(ao.inputs[0], sep.outputs["Red"])
    links.new(ao.inputs[1], gin.outputs["AO Strength"])
    links.new(ao.inputs[2], one_minus.outputs[0])
    shade = nodes.new("ShaderNodeVectorMath")
    shade.operation = "SCALE"
    links.new(shade.inputs[0], tone.outputs["Vector"])
    links.new(shade.inputs["Scale"], ao.outputs[0])
    rough = nodes.new("ShaderNodeMath")
    rough.operation = "MULTIPLY"
    rough.use_clamp = True
    links.new(rough.inputs[0], sep.outputs["Green"])
    links.new(rough.inputs[1], gin.outputs["Roughness Gain"])
    nm = nodes.new("ShaderNodeNormalMap")
    links.new(nm.inputs["Color"], nrm.outputs["Color"])
    links.new(nm.inputs["Strength"], gin.outputs["Normal Strength"])
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.inputs["Base Color"], shade.outputs["Vector"])
    links.new(bsdf.inputs["Roughness"], rough.outputs[0])
    links.new(bsdf.inputs["Metallic"], sep.outputs["Blue"])
    links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    links.new(gout.inputs["BSDF"], bsdf.outputs["BSDF"])
    return ng


def fresh_tree(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return nt, out


def dress_stone(mat, ng, fam):
    nt, out = fresh_tree(mat)
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = ng
    g.inputs["Tone"].default_value = (*fam["tone"], 1.0)
    g.inputs["AO Strength"].default_value = fam["ao_strength"]
    g.inputs["Roughness Gain"].default_value = fam["roughness_gain"]
    g.inputs["Normal Strength"].default_value = fam["normal_strength"]
    nt.links.new(out.inputs["Surface"], g.outputs["BSDF"])
    mean = (227 / 255, 215 / 255, 202 / 255)                          # the kit's mean base colour, for Solid view
    mat.diffuse_color = (*[c * t for c, t in zip(mean, fam["tone"])], 1.0)


def dress_tiles(mat, folder, fam):
    """Square stone tiles from the kit maps: object x / y split into tile_m cells, each cell sampling the 4 m map at its
    own seeded offset (a white-noise value per cell), joints of joint_m darkened and rougher."""
    nt, out = fresh_tree(mat)
    n, links = nt.nodes, nt.links

    def math(op, a, b=None):
        m = n.new("ShaderNodeMath")
        m.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                links.new(m.inputs[i], v)
        return m.outputs[0]
    tc = n.new("ShaderNodeTexCoord")
    xyz = n.new("ShaderNodeSeparateXYZ")
    links.new(xyz.inputs[0], tc.outputs["Object"])
    t, w = fam["tile_m"], fam["joint_m"]
    u, v = math("DIVIDE", xyz.outputs["X"], t), math("DIVIDE", xyz.outputs["Y"], t)
    cell = n.new("ShaderNodeCombineXYZ")
    links.new(cell.inputs["X"], math("FLOOR", u))
    links.new(cell.inputs["Y"], math("FLOOR", v))
    rnd = n.new("ShaderNodeTexWhiteNoise")
    rnd.noise_dimensions = "3D"
    links.new(rnd.inputs["Vector"], cell.outputs[0])
    uvw = n.new("ShaderNodeCombineXYZ")                                # metres / repeat + the cell's offset
    links.new(uvw.inputs["X"], math("DIVIDE", xyz.outputs["X"], fam["repeat_m"]))
    links.new(uvw.inputs["Y"], math("DIVIDE", xyz.outputs["Y"], fam["repeat_m"]))
    coords = n.new("ShaderNodeVectorMath")
    coords.operation = "ADD"
    links.new(coords.inputs[0], uvw.outputs[0])
    links.new(coords.inputs[1], rnd.outputs["Color"])

    def tex(name, colorspace):
        node = n.new("ShaderNodeTexImage")
        node.image = kit_image(folder, name, colorspace)
        node.extension = "REPEAT"
        links.new(node.inputs["Vector"], coords.outputs[0])
        return node
    base, arm, nrm = tex("basecolor.png", "sRGB"), tex("arm.png", "Non-Color"), tex("normal_gl.png", "Non-Color")
    sep = n.new("ShaderNodeSeparateColor")
    links.new(sep.inputs["Color"], arm.outputs["Color"])

    def joint_of(c):                                                  # 1 within w/2 of a cell edge
        f = math("FRACT", c)
        d = math("MULTIPLY", math("MINIMUM", f, math("SUBTRACT", 1.0, f)), t)
        return math("LESS_THAN", d, w / 2)
    joint = math("MAXIMUM", joint_of(u), joint_of(v))
    tone = n.new("ShaderNodeVectorMath")
    tone.operation = "MULTIPLY"
    links.new(tone.inputs[0], base.outputs["Color"])
    tone.inputs[1].default_value = fam["tone"]
    colour = n.new("ShaderNodeMix")
    colour.data_type = "RGBA"
    links.new(colour.inputs["Factor"], joint)
    links.new(colour.inputs[6], tone.outputs["Vector"])
    colour.inputs[7].default_value = (*fam["joint_rgb"], 1.0)
    rough = n.new("ShaderNodeMix")
    links.new(rough.inputs["Factor"], joint)
    links.new(rough.inputs[2], math("MULTIPLY", sep.outputs["Green"], fam["roughness_gain"]))
    rough.inputs[3].default_value = fam["joint_roughness"]
    nm = n.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = fam["normal_strength"]
    links.new(nm.inputs["Color"], nrm.outputs["Color"])
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.inputs["Base Color"], colour.outputs[2])
    links.new(bsdf.inputs["Roughness"], rough.outputs[0])
    links.new(bsdf.inputs["Metallic"], sep.outputs["Blue"])
    links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mean = (227 / 255, 215 / 255, 202 / 255)
    mat.diffuse_color = (*[c * k for c, k in zip(mean, fam["tone"])], 1.0)


def dress_veneer(mat, fam):
    """A luxury quarter-cut veneer (user fix 4c, 2026-10-15), procedural on the box UVs (1 m, V = z on walls): the grain
    runs along V on the walls and along x on the soffits and the band (U and V swapped where the face looks up or down,
    whose box UVs are (x, y)). Across the grain the face is cut into pairs of leaves 2 * leaf wide; each pair mirrors
    its grain about its centre seam (book-matched) and draws its own seed, so its tone, hue and figure differ from its
    neighbours, mirrored left / right of the building's centre line but never identical (the side and the face's plane
    feed the seed). The grain: growth lines ~pitch apart wavering along the board, most faint and a few strong, broad
    colour bands and darker ribbon stripes, fine elongated pores; a fine dark V-joint `joint` wide between pairs; a
    faint bump under a satin clear coat. User fix 15: on a veneer plate (face attributes rb_veneer_w / rb_veneer_seed
    from layer_podium.dress_panels, its UVs starting at the plate's edge) the pairs divide the plate evenly, so the book
    match stays inside it, without the V-joint (the plate's modelled reveal is the joint); the plate draws its own grain
    scale (panel_jitter), tone (panel_vary) and hue and its pairs vary less (pair_vary_in_panel), so the grain restarts
    at every reveal. Faces without the attributes keep the layout above."""
    nt, out = fresh_tree(mat)
    n, links = nt.nodes, nt.links

    def math(op, a, b=None, c=None, clamp=False):
        m = n.new("ShaderNodeMath")
        m.operation = op
        m.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                links.new(m.inputs[i], v)
        return m.outputs[0]

    def mix(t, a, b, kind="FLOAT"):
        m = n.new("ShaderNodeMix")
        m.data_type = kind
        sock = {"FLOAT": (2, 3, 0), "RGBA": (6, 7, 2)}[kind]
        if isinstance(t, (int, float)):
            m.inputs["Factor"].default_value = t
        else:
            links.new(m.inputs["Factor"], t)
        for i, v in zip(sock[:2], (a, b)):
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            elif isinstance(v, (tuple, list)):
                m.inputs[i].default_value = (*v, 1.0)
            else:
                links.new(m.inputs[i], v)
        return m.outputs[sock[2]]

    def comb(x, y, z=0.0):
        c = n.new("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            if isinstance(v, (int, float)):
                c.inputs[i].default_value = v
            else:
                links.new(c.inputs[i], v)
        return c.outputs[0]

    def noise(vec, w, detail=2.0, rough=0.5):
        t = n.new("ShaderNodeTexNoise")
        t.noise_dimensions = "4D"
        t.inputs["Scale"].default_value = 1.0
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        links.new(t.inputs["Vector"], vec)
        links.new(t.inputs["W"], w)
        return t.outputs["Fac"]

    def smooth(x, e0, e1):
        m = n.new("ShaderNodeMapRange")
        m.interpolation_type = "SMOOTHSTEP"
        m.inputs["From Min"].default_value, m.inputs["From Max"].default_value = e0, e1
        links.new(m.inputs["Value"], x)
        return m.outputs["Result"]

    tc = n.new("ShaderNodeTexCoord")
    uv = n.new("ShaderNodeSeparateXYZ")
    links.new(uv.inputs[0], tc.outputs["UV"])
    geo = n.new("ShaderNodeNewGeometry")
    nrm = n.new("ShaderNodeSeparateXYZ")
    links.new(nrm.inputs[0], geo.outputs["True Normal"])
    horiz = math("GREATER_THAN", math("ABSOLUTE", nrm.outputs["Z"]), 0.5)
    across = mix(horiz, uv.outputs["X"], uv.outputs["Y"])               # a: across the grain, b: along it
    along = mix(horiz, uv.outputs["Y"], uv.outputs["X"])
    dot = n.new("ShaderNodeVectorMath")                                  # the face's plane, for the seed
    dot.operation = "DOT_PRODUCT"
    links.new(dot.inputs[0], geo.outputs["Position"])
    links.new(dot.inputs[1], geo.outputs["True Normal"])
    plane = math("ROUND", math("MULTIPLY", dot.outputs["Value"], 20.0))
    # user fix 15: a plate (layer_podium.dress_panels) carries its width across the grain and a seed as face attributes,
    # and its UVs start at its edge: its leaves divide it evenly (book-matched inside it only, no V-joint: the plate's
    # reveal is the joint) and it draws its own grain scale, tone and hue; elsewhere (has = 0) the 4c layout as before
    att_w, att_s = n.new("ShaderNodeAttribute"), n.new("ShaderNodeAttribute")
    for att, name in ((att_w, "rb_veneer_w"), (att_s, "rb_veneer_seed")):
        att.attribute_type = "GEOMETRY"
        att.attribute_name = name
    pw_plate = att_w.outputs["Fac"]
    has = math("GREATER_THAN", pw_plate, 0.01)
    leaves = math("MAXIMUM", math("ROUND", math("DIVIDE", pw_plate, 2.0 * fam["leaf"])), 1.0)
    pw = mix(has, 2.0 * fam["leaf"], math("DIVIDE", pw_plate, leaves))
    prnd = n.new("ShaderNodeTexWhiteNoise")                              # the plate's own draws
    prnd.noise_dimensions = "3D"
    links.new(prnd.inputs["Vector"], comb(math("MULTIPLY", att_s.outputs["Fac"], 1000.0), 3.0, float(fam["seed"])))
    prgb = n.new("ShaderNodeSeparateColor")
    links.new(prgb.inputs["Color"], prnd.outputs["Color"])
    centred = lambda r: math("SUBTRACT", math("MULTIPLY", r, 2.0), 1.0)  # noqa: E731
    jit = math("ADD", 1.0, math("MULTIPLY", has, math("MULTIPLY", centred(prnd.outputs["Value"]), fam["panel_jitter"])))
    k_plate = math("ADD", 1.0, math("MULTIPLY", has, math("MULTIPLY", centred(prgb.outputs["Red"]), fam["panel_vary"])))
    q = math("DIVIDE", math("ABSOLUTE", across), pw)
    pair, f = math("FLOOR", q), math("FRACT", q)
    s_m = math("MULTIPLY", math("ABSOLUTE", math("SUBTRACT", f, 0.5)), pw)  # metres from the pair's centre seam
    s = math("DIVIDE", s_m, jit)                                          # the plate's grain scale
    along = math("DIVIDE", along, jit)
    edge = math("MULTIPLY", math("MINIMUM", f, math("SUBTRACT", 1.0, f)), pw)
    groove = math("SUBTRACT", 1.0, smooth(edge, fam["joint"] * 0.3, fam["joint"] * 0.5))
    groove = math("MULTIPLY", groove, math("SUBTRACT", 1.0, has))
    side = math("SIGN", across)
    rnd = n.new("ShaderNodeTexWhiteNoise")
    rnd.noise_dimensions = "3D"
    links.new(rnd.inputs["Vector"], comb(pair, math("ADD", math("ADD", math("MULTIPLY", side, 7.0), plane),
                                                    math("MULTIPLY", att_s.outputs["Fac"], 1000.0)), float(fam["seed"])))
    r1 = rnd.outputs["Value"]
    rgb = n.new("ShaderNodeSeparateColor")
    links.new(rgb.inputs["Color"], rnd.outputs["Color"])
    w = math("MULTIPLY", r1, 97.0)                                       # the pair's own figure
    warp = noise(comb(math("MULTIPLY", s, 6.0), math("MULTIPLY", along, 0.6)), w, 2.0, 0.5)
    pitch = noise(comb(math("MULTIPLY", s, 3.0), math("MULTIPLY", along, 0.1)), math("ADD", w, 5.0), 1.0, 0.5)
    rings = math("MULTIPLY", math("DIVIDE", s, fam["pitch"]), math("ADD", 0.8, math("MULTIPLY", pitch, 0.4)))
    phase = math("ADD", rings, math("MULTIPLY", warp, 4.0))             # growth lines, wavering along the board
    line = math("ADD", 0.5, math("MULTIPLY", 0.5, math("COSINE", math("MULTIPLY", phase, TAU))))
    late = smooth(line, 0.55, 0.97)                                      # narrow dark latewood lines
    amp = smooth(noise(comb(math("MULTIPLY", s, 90.0), math("MULTIPLY", along, 0.5)), w, 2.0, 0.6), 0.35, 0.75)
    late = math("MULTIPLY", late, math("ADD", 0.1, math("MULTIPLY", amp, 0.9)))   # most lines faint, a few strong
    band = smooth(noise(comb(math("MULTIPLY", s, 18.0), math("MULTIPLY", along, 0.25)), math("ADD", w, 13.0), 3.0,
                        0.55), 0.3, 0.75)                                # broad honey / brown colour bands
    ribbon = smooth(noise(comb(math("MULTIPLY", s, 32.0), math("MULTIPLY", along, 0.12)), math("ADD", w, 29.0), 2.0,
                          0.5), 0.42, 0.62)                              # the quarter-cut's darker ribbon stripes
    pore = smooth(noise(comb(math("MULTIPLY", s, 1400.0), math("MULTIPLY", along, 40.0)), w, 1.0, 0.5), 0.66, 0.8)
    body = mix(band, tuple(fam["mid"]), tuple(fam["light"]), "RGBA")
    col = mix(math("MULTIPLY", ribbon, fam["ribbon"]), body, tuple(fam["dark"]), "RGBA")
    col = mix(math("MULTIPLY", late, 0.8), col, tuple(fam["dark"]), "RGBA")
    col = mix(math("MULTIPLY", pore, 0.35), col, tuple(fam["dark"]), "RGBA")
    vary = mix(has, fam["vary"], fam["vary"] * fam["pair_vary_in_panel"])  # a plate's leaves: one flitch
    k = math("ADD", 1.0, math("MULTIPLY", math("SUBTRACT", math("MULTIPLY", r1, 2.0), 1.0), vary))
    k = math("MULTIPLY", k, k_plate)
    tone = n.new("ShaderNodeVectorMath")                                  # the pair's (and plate's) tone ...
    tone.operation = "SCALE"
    links.new(tone.inputs[0], col)
    links.new(tone.inputs["Scale"], k)
    warm = n.new("ShaderNodeVectorMath")                                  # ... and its hue, warmer or cooler
    warm.operation = "MULTIPLY"
    links.new(warm.inputs[0], tone.outputs["Vector"])
    warm.inputs[1].default_value = (1.05, 0.99, 0.92)
    hue = mix(has, rgb.outputs["Green"], math("ADD", math("MULTIPLY", rgb.outputs["Green"], 0.3),
                                              math("MULTIPLY", prgb.outputs["Green"], 0.7)))   # a plate's hue
    col = mix(math("MULTIPLY", hue, 0.8), tone.outputs["Vector"], warm.outputs["Vector"], "RGBA")
    col = mix(groove, col, tuple(fam["joint_rgb"]), "RGBA")
    rough = math("ADD", fam["roughness"], math("ADD", math("MULTIPLY", late, 0.06), math("MULTIPLY", pore, 0.15)))
    rough = mix(groove, rough, 0.75)
    height = math("SUBTRACT", math("ADD", math("MULTIPLY", late, 0.15), math("MULTIPLY", pore, 0.6)), groove)
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = fam["bump"]
    bump.inputs["Distance"].default_value = 0.001
    links.new(bump.inputs["Height"], height)
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.inputs["Base Color"], col)
    links.new(bsdf.inputs["Roughness"], rough)
    links.new(bsdf.inputs["Normal"], bump.outputs["Normal"])
    bsdf.inputs["Coat Weight"].default_value = fam["coat"]
    bsdf.inputs["Coat Roughness"].default_value = fam["coat_roughness"]
    bsdf.inputs["Coat IOR"].default_value = 1.5
    links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (*fam["mid"], 1.0)


def dress_glass(mat, fam):
    """Clear glass whose shadow rays pass (a transparent BSDF, tinted, for Light Path's shadow rays): Cycles' glass
    otherwise blocks the sun's shadow rays and the rooms behind the glazing go dark (AI 634)."""
    nt, out = fresh_tree(mat)
    glass = nt.nodes.new("ShaderNodeBsdfPrincipled")
    glass.inputs["Base Color"].default_value = (*fam["rgb"], 1.0)
    glass.inputs["Roughness"].default_value = fam["roughness"]
    glass.inputs["Transmission Weight"].default_value = 1.0
    glass.inputs["IOR"].default_value = fam["ior"]
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    clear.inputs["Color"].default_value = (*fam["rgb"], 1.0)
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mix.inputs["Fac"], path.outputs["Is Shadow Ray"])
    nt.links.new(mix.inputs[1], glass.outputs["BSDF"])
    nt.links.new(mix.inputs[2], clear.outputs["BSDF"])
    nt.links.new(out.inputs["Surface"], mix.outputs["Shader"])
    mat.diffuse_color = (*fam["rgb"], 0.35)


def dress_plain(mat, rgb, roughness, metallic=0.0, transmission=0.0, ior=1.5):
    nt, out = fresh_tree(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = ior
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (*rgb, 0.35 if transmission else 1.0)


def soil_maps(folder):
    """A game ground set's maps (basecolor, normal_gl, arm; png or jpg), read in place."""
    found = {}
    for key in ("basecolor", "normal_gl", "arm"):
        name = next((f"{key}.{ext}" for ext in ("png", "jpg") if os.path.exists(os.path.join(folder, f"{key}.{ext}"))), None)
        if name is None:
            raise SystemExit(f"layer_materials: {folder} has no {key}.png / .jpg (the soil's set, plan materials.soil)")
        found[key] = name
    return found


def mean_srgb(img):
    """The image's mean colour, linear (a small copy is averaged; the image's own pixels are sRGB-encoded)."""
    tmp = img.copy()
    tmp.scale(32, 32)
    px = np.empty(32 * 32 * 4, dtype=np.float32)
    tmp.pixels.foreach_get(px)
    bpy.data.images.remove(tmp)
    rgb = px.reshape(-1, 4)[:, :3].mean(axis=0)
    return [float(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in rgb]


def dress_soil(mat, fam):
    """User fix 23: the soil as a game ground set (plan materials.soil.set) at world scale: UV (x / y in metres, the
    soil layers' mounds) / repeat_m plus a per-mound offset (white noise of the face attribute rb_soil_seed); a second
    sample turned 90 degrees (its normal turned back) blended in by a soft noise mask, so the repeat never lines up;
    the ARM's AO (ao_strength) and roughness (roughness_gain, high for earth), no metal."""
    folder = os.path.join(L.C.ROOT, "assets", "public", "pbr", fam["set"])
    files = soil_maps(folder)
    nt, out = fresh_tree(mat)
    n, links = nt.nodes, nt.links

    def node(kind, **inputs):
        x = n.new(kind)
        for k, v in inputs.items():
            if isinstance(v, bpy.types.NodeSocket):
                links.new(x.inputs[k], v)
            else:
                x.inputs[k].default_value = v
        return x

    def vmath(op, a, b):
        x = n.new("ShaderNodeVectorMath")
        x.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, bpy.types.NodeSocket):
                links.new(x.inputs[i], v)
            else:
                x.inputs[i].default_value = v
        return x.outputs[0]
    tc = n.new("ShaderNodeTexCoord")
    uv = vmath("SCALE", tc.outputs["UV"], (0.0, 0.0, 0.0))
    uv.node.inputs["Scale"].default_value = 1.0 / fam["repeat_m"]
    seed = n.new("ShaderNodeAttribute")
    seed.attribute_type = "GEOMETRY"
    seed.attribute_name = "rb_soil_seed"

    def offset(w):                                                    # a per-mound offset in [0, 1) x [0, 1)
        wn = n.new("ShaderNodeTexWhiteNoise")
        wn.noise_dimensions = "1D"
        add = n.new("ShaderNodeMath")
        add.operation = "ADD"
        links.new(add.inputs[0], seed.outputs["Fac"])
        add.inputs[1].default_value = w
        links.new(wn.inputs["W"], add.outputs[0])
        return wn.outputs["Color"]
    coords_a = vmath("ADD", uv, offset(0.0))
    sep = n.new("ShaderNodeSeparateXYZ")
    links.new(sep.inputs[0], uv)
    turned = n.new("ShaderNodeCombineXYZ")                             # (u, v) -> (v, -u): a quarter turn
    links.new(turned.inputs["X"], sep.outputs["Y"])
    neg = node("ShaderNodeMath", Value=sep.outputs["X"])
    neg.operation = "MULTIPLY"
    neg.inputs[1].default_value = -1.0
    links.new(turned.inputs["Y"], neg.outputs[0])
    coords_b = vmath("ADD", turned.outputs[0], offset(0.5))

    def tex(name, colorspace, coords):
        t = n.new("ShaderNodeTexImage")
        t.image = kit_image(folder, name, colorspace)
        t.interpolation = "Linear"
        t.extension = "REPEAT"
        links.new(t.inputs["Vector"], coords)
        return t.outputs["Color"]
    base = [tex(files["basecolor"], "sRGB", c) for c in (coords_a, coords_b)]
    arm = [tex(files["arm"], "Non-Color", c) for c in (coords_a, coords_b)]
    nrm_a, nrm_b = (tex(files["normal_gl"], "Non-Color", c) for c in (coords_a, coords_b))
    sb = n.new("ShaderNodeSeparateColor")                              # the turned sample's normal turned back:
    links.new(sb.inputs["Color"], nrm_b)                               # (x, y) = (1 - g, r)
    inv = node("ShaderNodeMath", Value=sb.outputs["Green"])
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    links.new(inv.inputs[1], sb.outputs["Green"])
    nb = n.new("ShaderNodeCombineColor")
    links.new(nb.inputs["Red"], inv.outputs[0])
    links.new(nb.inputs["Green"], sb.outputs["Red"])
    links.new(nb.inputs["Blue"], sb.outputs["Blue"])
    noise = n.new("ShaderNodeTexNoise")                                 # the soft mask between the two samples
    noise.inputs["Scale"].default_value = fam["blend_scale"] * fam["repeat_m"]
    noise.inputs["Detail"].default_value = 1.0
    links.new(noise.inputs["Vector"], uv)
    mask = n.new("ShaderNodeMapRange")
    mask.interpolation_type = "SMOOTHSTEP"
    links.new(mask.inputs["Value"], noise.outputs["Fac"])
    mask.inputs["From Min"].default_value, mask.inputs["From Max"].default_value = 0.42, 0.58

    def blend(a, b):
        mx = n.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        links.new(mx.inputs["Factor"], mask.outputs["Result"])
        links.new(mx.inputs[6], a)
        links.new(mx.inputs[7], b)
        return mx.outputs[2]
    col, arm_c, nrm = blend(*base), blend(*arm), blend(nrm_a, nb.outputs["Color"])
    sa = n.new("ShaderNodeSeparateColor")
    links.new(sa.inputs["Color"], arm_c)
    ao = n.new("ShaderNodeMath")                                       # mix(1, AO, s) = AO * s + (1 - s)
    ao.operation = "MULTIPLY_ADD"
    links.new(ao.inputs[0], sa.outputs["Red"])
    ao.inputs[1].default_value = fam["ao_strength"]
    ao.inputs[2].default_value = 1.0 - fam["ao_strength"]
    tone = vmath("MULTIPLY", col, tuple(fam["tone"]))
    shade = vmath("SCALE", tone, (0.0, 0.0, 0.0))
    links.new(shade.node.inputs["Scale"], ao.outputs[0])
    rough = node("ShaderNodeMath", Value=sa.outputs["Green"])
    rough.operation = "MULTIPLY"
    rough.use_clamp = True
    rough.inputs[1].default_value = fam["roughness_gain"]
    nm = n.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = fam["normal_strength"]
    links.new(nm.inputs["Color"], nrm)
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.inputs["Base Color"], shade)
    links.new(bsdf.inputs["Roughness"], rough.outputs[0])
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mean = mean_srgb(kit_image(folder, files["basecolor"], "sRGB"))  # Solid view: the map's mean, toned
    mat.diffuse_color = (*[c * t for c, t in zip(mean, fam["tone"])], 1.0)


def dress_materials(m):
    folder = os.path.join(L.C.ROOT, "assets", "public", "pbr", m["stone"]["set"])
    if not os.path.isdir(folder):
        raise SystemExit(f"layer_materials: the kit set {folder} is missing -- run make_terramar_kit_pbr.py (AI 640)")
    ng = stone_group(folder, m["stone"]["repeat_m"])
    dressed, missing = {}, []
    for fam_name, fam in m.items():
        if not isinstance(fam, dict) or "slots" not in fam:
            continue
        for slot in fam["slots"]:
            mat = bpy.data.materials.get(slot)
            if mat is None:
                missing.append(slot)
                continue
            if fam_name in ("stone", "paving"):
                dress_stone(mat, ng, fam)
            elif "tile_m" in fam:                                     # roof_paving, site_paving
                dress_tiles(mat, folder, fam)
            elif fam_name == "glass":
                dress_glass(mat, fam)
            elif fam_name in ("veneer", "soffit_veneer"):             # user fix 4c / 17: the luxury wood
                dress_veneer(mat, fam)
            elif fam_name == "soil":                                  # user fix 23: the game's ground set
                dress_soil(mat, fam)
            else:
                dress_plain(mat, fam["rgb"], fam["roughness"], fam.get("metallic", 0.0))
            dressed[slot] = fam_name
    jt = m["joints"]
    joint = bpy.data.materials.get(JOINT_MATERIAL) or bpy.data.materials.new(JOINT_MATERIAL)
    dress_plain(joint, jt["rgb"], jt["roughness"])
    dressed[JOINT_MATERIAL] = "joints"
    return dressed, missing, joint


# ---------------------------------------------------------------- joints


def reach(jt):
    """A joint's half-opening on the face: from its centre line out to the lip of its eased arris (user fix 18)."""
    return jt["width"] / 2 + jt.get("wall", 0.0) + jt["bevel"]


def profile(jt):
    """The groove's section (user fix 18), from the centre line out: [(offset, depth)]. The floor `width` wide at
    `depth`; each side wall rises `wall` outwards to `bevel_depth` deep; then the eased arris, a chamfer `bevel` across
    and `bevel_depth` deep, to the face. Before fix 18 the bevel was a 3 mm slope straight from the floor to the face: a
    sharp lip."""
    half, wall, bev = jt["width"] / 2, jt.get("wall", 0.0), jt["bevel"]
    return [(half, jt["depth"]), (half + wall, jt.get("bevel_depth", bev)), (half + wall + bev, 0.0)]


def depth_at(dist, prof, tol=2e-4):
    """The groove's depth at `dist` from its centre line (piecewise linear through the profile, 0 past the lip)."""
    if dist <= prof[0][0] + tol:
        return prof[0][1]
    for (o0, d0), (o1, d1) in zip(prof, prof[1:]):
        if dist <= o1:
            return d0 + (d1 - d0) * (dist - o0) / (o1 - o0)
    return 0.0


def push_vector(pairs):
    """The smallest v with v . n = d for every (face normal n, groove depth d) (the same normal twice: the deeper), so a
    groove keeps its section on every face it crosses, round a corner too."""
    uniq = []
    for n, d in pairs:
        for k, (u, du) in enumerate(uniq):
            if n.dot(u) >= 0.9995:
                uniq[k] = (u, max(du, d))
                break
        else:
            uniq.append((n, d))
    if len(uniq) == 1:
        return uniq[0][0] * uniq[0][1]
    if len(uniq) == 2 and 1.0 - uniq[0][0].dot(uniq[1][0]) ** 2 > 1e-6:
        (a, da), (b, db) = uniq
        c = a.dot(b)
        det = 1.0 - c * c
        return a * ((da - c * db) / det) + b * ((db - c * da) / det)
    N = np.array([tuple(u) for u, _ in uniq])                          # 3+ faces: least squares, minimum norm
    v = np.linalg.lstsq(N, np.array([d for _, d in uniq]), rcond=None)[0]
    return Vector(tuple(v))


class Contacts:
    """Where a stone face is buried against another piece (user fix 18): every mesh of the part as world-space BVH trees
    with the solid of each polygon, built once before any cut. A corner whose faces touch another solid or object is a
    flush seam or a buried edge, not an outside corner, and gets no corner joint."""

    def __init__(self, objects, reach_m):
        from mathutils.bvhtree import BVHTree
        self.trees, self.r = [], reach_m
        for ob in objects:
            me = ob.data
            if not len(me.polygons):
                continue
            mw = ob.matrix_world
            verts = [mw @ v.co for v in me.vertices]
            lo = Vector([min(v[i] for v in verts) - 0.01 for i in range(3)])
            hi = Vector([max(v[i] for v in verts) + 0.01 for i in range(3)])
            tree = BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons], epsilon=0.0)
            self.trees.append((ob.name, tree, solid_ids(me), lo, hi))

    def touches(self, name, sid, p, r=None, excl=None):
        """True if a polygon of another solid lies within r (default the contact reach) of p. excl: the (object, solid)
        pairs that do not count (default the one solid (name, sid))."""
        r = self.r if r is None else r
        excl = excl or {(name, sid)}
        for other, tree, sids, lo, hi in self.trees:
            if not all(lo[i] - r <= p[i] <= hi[i] + r for i in range(3)):
                continue
            for hit in tree.find_nearest_range(p, r):
                if (other, sids[hit[2]]) not in excl:
                    return True
        return False

    def exposed(self, name, sid, probes, e0, e1, step=0.03, r=None, excl=None):
        """The stretches of e0..e1 along a corner that touch nothing: probes(x) gives the test points at x (just
        outside the corner); sampled every `step`, each change refined by bisection to 0.1 mm."""
        if e1 - e0 < 1e-6:
            return []
        n = max(2, math.ceil((e1 - e0) / step))
        xs = [e0 + (e1 - e0) * (k + 0.5) / n for k in range(n)]
        free = lambda x: not any(self.touches(name, sid, p, r, excl) for p in probes(x))  # noqa: E731
        state = [free(x) for x in xs]
        out, start = [], (e0 if state[0] else None)
        for k in range(1, n):
            if state[k] == state[k - 1]:
                continue
            a, b = xs[k - 1], xs[k]
            while b - a > 1e-4:
                m = (a + b) / 2
                if free(m) == state[k - 1]:
                    a = m
                else:
                    b = m
            if state[k]:
                start = (a + b) / 2
            else:
                out.append((start, (a + b) / 2))
                start = None
        if start is not None:
            out.append((start, e1))
        return out


def find_corners(bm, stone, orig, jt, contacts, name, sids, chamfers=frozenset()):
    """User fix 18 addendum: the outside corners of one object's stone, before any cut. A corner is a convex fold
    between two wide stone faces A and B turning at least corners.min_angle_deg, across zero or more narrow faces
    between them (an eased or rounded arris: each narrower than corners.narrow across the fold, every fold convex and
    parallel, at most corners.arris_max across in all; a broader rounded corner, such as the slabs' fillets, stays one
    curved stone). Only the stretches along it whose probes touch no other solid (Contacts: not a flush seam, not a
    buried edge) are kept. stone: the original ids of the stone faces. Returns [{"a", "b": original ids, "chain":
    [narrow original ids], "verts": the vertices on the arris, "e": its direction, "spans": [(e0, e1)]}].
    chamfers: the original ids of fix 18d's arris chamfers (bevel_arrises); a face beside one (a fascia's return strip,
    its own chamfer taking a few mm of it) is a face of its own, never a narrow face of an arris."""
    cj = jt["corners"]
    min_turn, narrow = math.radians(cj["min_angle_deg"]), cj["narrow"]

    def is_narrow(f, e):
        if width(f, e) >= narrow:
            return False
        return f[orig] in chamfers or not any(h[orig] in chamfers for x in f.edges for h in x.link_faces if h is not f)

    def across(f, e):                                                # in-plane direction across a fold of direction e
        return f.normal.cross(e).normalized()

    def width(f, e):
        w = [v.co.dot(across(f, e)) for v in f.verts]
        return max(w) - min(w)

    def along(ed, e):
        return abs((ed.verts[1].co - ed.verts[0].co).normalized().dot(e)) > 0.9995

    found, out = set(), []
    for ed in bm.edges:
        if len(ed.link_faces) != 2 or not ed.is_convex or ed.calc_length() < jt["seam_min_length"]:
            continue
        a, b = ed.link_faces
        if a[orig] not in stone or b[orig] not in stone or a.normal.angle(b.normal, 0.0) < math.radians(1.0):
            continue
        e = (ed.verts[1].co - ed.verts[0].co).normalized()
        for A, cur in ((a, b), (b, a)):
            if width(A, e) < narrow:
                continue
            path, chain, edge, ok = [ed], [], ed, True
            while is_narrow(cur, e):                                # a narrow face of the arris: walk across it
                q = edge.verts[0].co
                nxt = [x for x in cur.edges if x is not edge and along(x, e)]
                if not nxt or len(chain) > 16:
                    ok = False
                    break
                # the far edge across the narrow face; of several in line (the face split along e), the one that
                # overlaps this edge (user fix 18d: a return strip split at the core's cut line, walked from the fascia)
                lo0, hi0 = sorted((edge.verts[0].co.dot(e), edge.verts[1].co.dot(e)))
                far = max(nxt, key=lambda x: (round(abs((x.verts[0].co - q).dot(across(cur, e))), 5),
                                              min(hi0, max(v.co.dot(e) for v in x.verts))
                                              - max(lo0, min(v.co.dot(e) for v in x.verts))))
                nb = far.link_faces[0] if len(far.link_faces) == 2 and far.link_faces[1] is cur else \
                    far.link_faces[1] if len(far.link_faces) == 2 else None
                if nb is None or not far.is_convex or nb[orig] not in stone:
                    ok = False
                    break
                chain.append(cur)
                path.append(far)
                edge, cur = far, nb
            B = cur
            key = frozenset(x.index for x in path)
            if not ok or key in found or A.normal.angle(B.normal, 0.0) < min_turn:
                continue
            found.add(key)
            arc = sum(width(f, e) for f in chain)
            if arc > cj["arris_max"]:
                continue
            ext = [(min(v.co.dot(e) for v in x.verts), max(v.co.dot(e) for v in x.verts)) for x in path]
            e0, e1 = max(x[0] for x in ext), min(x[1] for x in ext)
            if e1 - e0 < jt["seam_min_length"]:
                continue
            ends = [(path[0], A, (chain + [B])[0]), (path[-1], ([A] + chain)[-1], B)]

            def probes(x, ends=ends, e=e):                          # just outside both ends of the arris
                pts = []
                for edge_, f0, f1 in ends:
                    p0 = edge_.verts[0].co
                    pts.append(p0 + e * (x - p0.dot(e)) + (f0.normal + f1.normal).normalized() * 0.001)
                return pts
            spans = contacts.exposed(name, sids[A[orig]], probes, e0, e1) if contacts else [(e0, e1)]
            spans = [(s0, s1) for s0, s1 in spans if s1 - s0 >= jt["seam_min_length"]]
            if chain and sum(s1 - s0 for s0, s1 in spans) < 0.99 * (e1 - e0):
                continue                                             # an arris partly buried: left as it is
            if spans:
                planes = [(A.normal.copy(), A.normal.dot(A.verts[0].co)), (B.normal.copy(), B.normal.dot(B.verts[0].co))]
                # where the arris meets A and B, measured from the sharp corner: the bevel starts there at the least,
                # so it stays inside the arris it replaces (a chord of a round) and the stone never grows
                N = np.array([tuple(n) for n, _ in planes] + [tuple(e)])
                q = Vector(tuple(np.linalg.lstsq(N, np.array([d for _, d in planes] + [0.0]), rcond=None)[0]))
                reach_ = 0.0
                for x in (path[0], path[-1]):
                    p0 = x.verts[0].co
                    p = p0 + e * (q.dot(e) - p0.dot(e))
                    reach_ = max(reach_, (p - q).length)
                out.append({"a": A[orig], "b": B[orig], "chain": [f[orig] for f in chain], "e": e.copy(), "spans": spans,
                            "planes": planes, "ease": max(cj["ease"], reach_ if chain else 0.0),
                            "verts": {v for x in path for v in x.verts} if chain else set()})
    return out


def sharpen(bm, corners):
    """A corner across an eased or rounded arris gets its joint on the sharp corner the two faces make: the arris'
    vertices move onto the line where A's and B's planes meet (the least movement onto every such corner a vertex is
    on) and weld, so its narrow faces close up. The joint's bevel then eases the corner again (user fix 18)."""
    planes = {}
    for c in corners:
        for v in c["verts"]:
            planes.setdefault(v, []).extend(c["planes"])
    if not planes:
        return 0
    for v, pl in planes.items():
        N = np.array([tuple(n) for n, _ in pl])
        r = np.array([d - n.dot(v.co) for n, d in pl])
        v.co += Vector(tuple(np.linalg.lstsq(N, r, rcond=None)[0]))
    bmesh.ops.remove_doubles(bm, verts=list(planes), dist=1e-5)
    return len(planes)


def bevel_arrises(bm, ob, jt, names, orig, sids, contacts):
    """User fix 18d: chamfer the arrises where a stone face of joints.arrises' slots meets one of its partner materials
    on the same solid (a slab fascia and its top, floor, ceiling or shadow gap), turning at least min_angle_deg: a 45
    degree chamfer `size` back on both faces, in the stone's slot. Only the stretches where no other piece of the part
    comes within `contact` (a guard shoe, a cap, a flush seam): an edge partly touched is split there. Runs before any
    cut: each chamfer face gets an original id of its own (after the mesh's), its solid appended to sids. Returns the
    chamfers' original ids and the number of edges chamfered."""
    ar = jt["arrises"]
    slot_idx = {i for i, n in enumerate(names) if n in ar["slots"]}
    partner_idx = {i for i, n in enumerate(names) if n in ar["partners"]}
    if not slot_idx or not partner_idx:
        return set(), 0
    min_turn, tol = math.radians(ar["min_angle_deg"]), 1e-4
    todo = []                                                          # (edge, stone face's slot, exposed spans)
    for ed in bm.edges:
        if len(ed.link_faces) != 2 or not ed.is_convex or ed.calc_length() < jt["seam_min_length"]:
            continue
        a, b = ed.link_faces
        if a.material_index in partner_idx and b.material_index in slot_idx:
            a, b = b, a
        if a.material_index not in slot_idx or b.material_index not in partner_idx:
            continue
        if a.normal.angle(b.normal, 0.0) < min_turn or sids[a[orig]] != sids[b[orig]]:
            continue
        p0 = ed.verts[0].co.copy()
        e = (ed.verts[1].co - p0).normalized()
        out = (a.normal + b.normal).normalized() * 0.001

        def probes(x, p0=p0, e=e, out=out):
            return [p0 + e * (x - p0.dot(e)) + out]
        e0, e1 = sorted((p0.dot(e), ed.verts[1].co.dot(e)))
        spans = contacts.exposed(ob.name, sids[a[orig]], probes, e0, e1, step=0.02, r=ar["contact"]) if contacts \
            else [(e0, e1)]
        spans = [(s0, s1) for s0, s1 in spans if s1 - s0 >= jt["seam_min_length"]]
        if spans:
            todo.append((ed, a.material_index, e, spans))
    by_slot = {}
    for ed, slot, e, spans in todo:                                    # split the edges at their spans' ends
        v0, v1 = ed.verts
        t0, t1 = v0.co.dot(e), v1.co.dot(e)
        cuts = sorted({c for s in spans for c in s if t0 + tol < c < t1 - tol})
        chain, cur, start = [v0], ed, v0
        for c in cuts:
            end = cur.other_vert(start)
            fac = (c - start.co.dot(e)) / (end.co.dot(e) - start.co.dot(e))
            _, nv = bmesh.utils.edge_split(cur, start, fac)
            chain.append(nv)
            cur = next(x for x in nv.link_edges if end in x.verts)
            start = nv
        chain.append(v1)
        for p, q in zip(chain, chain[1:]):
            mid = (p.co.dot(e) + q.co.dot(e)) / 2
            if any(s0 - tol <= mid <= s1 + tol for s0, s1 in spans):
                sub = next(x for x in p.link_edges if q in x.verts)
                by_slot.setdefault(slot, []).append(sub)
    made, count = [], 0
    for slot, edges in by_slot.items():
        res = bmesh.ops.bevel(bm, geom=edges, offset=ar["size"], offset_type="OFFSET", segments=1, profile=0.5,
                              affect="EDGES", clamp_overlap=True, material=slot)
        made += res["faces"]
        count += len(edges)
    chamfers, nxt = set(), len(sids)
    made = [f for f in made if f.is_valid]
    fresh = set(made)
    for f in made:
        near = [h for x in f.edges for h in x.link_faces if h not in fresh]
        sids.append(sids[near[0][orig]] if near else sids[f[orig]])   # the chamfer's solid: its neighbours'
        f[orig] = nxt
        chamfers.add(nxt)
        nxt += 1
    seen = [f[orig] for f in bm.faces if f not in fresh]
    if len(seen) != len(set(seen)):
        print(f"WARNING {ob.name}: the arris bevel duplicated {len(seen) - len(set(seen))} face ids")
    return chamfers, count


def inside_corners(recs, jt, contacts, stats=None):
    """User fix 18d addendum: the inside (concave) corners where two stone faces meet, of one solid or two. A corner is
    an edge of face B lying in face A's plane (or parallel to it, at most inside.gap in front: a piece set off A by
    a thin open gap), B standing in front of A, the normals turning at least min_angle_deg
    (two solids: square, within square_tol), over the stretch where A's polygon runs along it (1 mm into A's side in
    front of B) and nothing else comes within corners.contact of a probe out along the bisector. Each face gets a half
    groove from the corner. Returns {object: {face index: [(t, s, e, e0, e1, neg, pin)]}}: t across the face away from
    the corner (t . p - s: the distance from it), the stretch e0..e1 along e, neg: the face runs on past the corner
    (behind the other piece), pin: the other face's normal when the face's edge is on the corner and the other face is
    another solid (its corner slides along that plane), else None."""
    ic = jt["inside"]
    cos_min, tol, min_len = math.cos(math.radians(ic["min_angle_deg"])), 2e-4, jt["seam_min_length"]
    r = jt["corners"]["contact"] if jt.get("corners") else 0.005
    ok = [rc[7].get("corners", True) and rc[7].get("inside", True) for rc in recs]
    cell, grid = 0.5, {}
    for i, rc in enumerate(recs):                                      # face AABBs hashed on a 0.5 m grid
        if not ok[i]:
            continue
        lo = [math.floor((min(p[k] for p in rc[5]) - tol) / cell) for k in range(3)]
        hi = [math.floor((max(p[k] for p in rc[5]) + tol) / cell) for k in range(3)]
        for cx in range(lo[0], hi[0] + 1):
            for cy in range(lo[1], hi[1] + 1):
                for cz in range(lo[2], hi[2] + 1):
                    grid.setdefault((cx, cy, cz), []).append(i)
    out, n_found = {}, 0

    def add(rc, entry):
        lst = out.setdefault(rc[0], {}).setdefault(rc[1], [])
        t, s, e, e0, e1, neg, pin = entry
        for k, (t2, s2, e2, a0, a1, n2, p2) in enumerate(lst):
            if (t - t2).length < 1e-4 and abs(s - s2) < tol and abs(e.dot(e2)) > 0.9999 and \
                    abs(min(a0, a1) - min(e0, e1)) < tol * 10 and abs(max(a0, a1) - max(e0, e1)) < tol * 10:
                lst[k] = (t2, s2, e2, a0, a1, n2 or neg, p2 if p2 is not None else pin)
                return False
        lst.append(entry)
        return True
    for j, rb in enumerate(recs):
        if not ok[j]:
            continue
        name_b, _, sid_b, nB, _, pts_b = rb[:6]
        cB = sum(pts_b, Vector()) / len(pts_b)
        for m in range(len(pts_b)):
            p0, p1 = pts_b[m], pts_b[(m + 1) % len(pts_b)]
            length = (p1 - p0).length
            if length < min_len:
                continue
            e = canonical((p1 - p0) / length, 0.0)[0]                   # one spelling per line (dedup in add)
            if ic.get("vertical") and abs(e.z) < 0.99:
                continue                                               # the vertical corners only (full height)
            cand = set()
            k_n = max(1, math.ceil(length / cell))
            for q in range(k_n + 1):
                p = p0 + (p1 - p0) * (q / k_n)
                cand.update(grid.get(tuple(math.floor(p[k] / cell) for k in range(3)), ()))
            for i in cand:
                if i == j:
                    continue
                ra = recs[i]
                name_a, _, sid_a, nA, c_a, pts_a = ra[:6]
                same = name_a == name_b and sid_a == sid_b
                c = nA.dot(nB)
                if abs(c) > cos_min or (not same and abs(c) > ic["square_tol"]):
                    continue
                d0, d1 = nA.dot(p0) - c_a, nA.dot(p1) - c_a               # B's edge on A's plane, or a hair in
                if not (-tol <= d0 <= ic["gap"] and abs(d1 - d0) <= tol):  # front of it (a piece set off A by a
                    continue                                           # thin open gap: the casing beside a pier)
                d_b = [nA.dot(p) - c_a for p in pts_b]
                if min(d_b) < -tol or max(d_b) < ic["min_width"] * 0.5:
                    continue                                           # B stands in front of A
                tB = nB.cross(e).normalized()
                if tB.dot(cB - p0) < 0:
                    tB = -tB
                if tB.dot(nA) <= 0.0 or max(tB.dot(p - p0) for p in pts_b) < ic["min_width"]:
                    continue
                tA = nA.cross(e).normalized()
                if tA.dot(nB) < 0:
                    tA = -tA
                u_a = [tA.dot(p - p0) for p in pts_a]
                if max(u_a) < ic["min_width"]:
                    continue
                lo_e, hi_e = sorted((p0.dot(e), p1.dot(e)))
                stretches = []
                for a, b in polygon_line(pts_a, tA, tA.dot(p0) + 0.001):
                    s0, s1 = sorted((a.dot(e), b.dot(e)))
                    s0, s1 = max(s0, lo_e), min(s1, hi_e)
                    if s1 - s0 >= min_len:
                        stretches.append((s0, s1))
                if not stretches:
                    continue
                bis = (tA + tB).normalized() * ic["probe"]
                excl = {(name_a, sid_a), (name_b, sid_b)}

                def probes(x, p0=p0, e=e, bis=bis):
                    return [p0 + e * (x - p0.dot(e)) + bis]
                spans = []
                for s0, s1 in stretches:
                    spans += contacts.exposed(name_a, sid_a, probes, s0, s1, step=0.02, r=r, excl=excl) if contacts \
                        else [(s0, s1)]
                for s0, s1 in spans:
                    if s1 - s0 < min_len:
                        continue
                    new_a = add(ra, (tA, tA.dot(p0), e, s0, s1, min(u_a) < -tol, None))
                    new_b = add(rb, (tB, tB.dot(p0), e, s0, s1, False, None if same else nA.copy()))
                    n_found += new_a or new_b
    if stats is not None:
        stats["inside_corners"] = n_found
    return out


def corner_profile(nA, nB, cj, ease):
    """The corner joint's section on face A (user fix 18 addendum), from the corner out: [(offset, depth)]. The blocks
    meet on a mitre: both ends are eased by one bevel symmetric about the corner (each face's lip `ease` from the
    corner, so a square corner shows a 45 degree bevel), and the joint is a slit `slit` wide along the bisector, sunk
    `slit_depth` below the bevel: the edge, at the slit's root, goes `D` deep into both faces; the slit's lip on A sits
    `u` from the corner, `d` deep. ease: the lip's distance (corners.ease, or more where it replaces a wider arris)."""
    g = (nA + nB).normalized()
    m = (nA - nB).normalized()                                       # across the bisector, towards A
    c = nA.dot(nB)
    a = nA.cross(m.cross(nA)).normalized()                           # A's in-plane direction away from the corner ...
    if a.dot(m) < 0:                                                 # ... is on A's side of the bisector
        a = -a
    lip = a * ease
    mid = g * (lip.dot(g))                                           # the bevel's middle, on the bisector
    p = mid + m * (cj["slit"] / 2)                                   # the slit's lip on A, on the bevel
    root = -(lip.dot(g)) + cj["slit_depth"]                          # the slit's root, along -g
    D = root * (1.0 + c) / (nA + nB).length
    return [(0.0, D), (p.dot(a), -p.dot(nA)), (ease, 0.0)]


def arris_normals(arris, joint_index, rounds=frozenset()):
    """User fix 18: the eased arrises (the chamfers between a stone face and a joint) shade round: each of their corners
    takes the normal of the faces next to it across its edges, the stone face at the lip and the joint's side wall (or a
    corner's slit) at the foot, so a chamfer turns smoothly from the one to the other while the big faces stay flat (the
    bevel modifier's harden normals). arris: the chamfer faces (bmesh, normals current). rounds: faces of a layer's
    rounded edges (ROUND_ATTR, several segments): at the edge of the round a corner takes the flat face's normal, inside
    it the mean of the round's faces there. Returns {face index: [loop normal]}."""
    out, flagged = {}, set(arris)
    for f in arris:
        f.smooth = True
        loops = []
        for lp in f.loops:
            if f in rounds:
                flats = [h.normal for h in lp.vert.link_faces if h not in flagged and h.material_index != joint_index
                         and h.normal.angle(f.normal, math.pi) < math.radians(70.0)]
                if flats:
                    loops.append(flats[0].copy())
                    continue
                uniq = []
                for h in lp.vert.link_faces:
                    if h in rounds and all(h.normal.dot(u) < 0.9999 for u in uniq):
                        uniq.append(h.normal.copy())
                loops.append(sum(uniq, Vector()).normalized())
                continue
            acc = Vector()
            for ed in (lp.edge, lp.link_loop_prev.edge):
                for h in ed.link_faces:
                    if h is f or h in flagged:
                        continue
                    if h.material_index == joint_index or h.normal.angle(f.normal, math.pi) < math.radians(70.0):
                        acc += h.normal
            loops.append(acc.normalized() if acc.length > 1e-9 else f.normal.copy())
        out[f.index] = loops
    return out


def canonical(t, sj):
    """One plane, two spellings: (t, s) and (-t, -s). The spelling whose first non-zero component of t is positive."""
    for c in t:
        if abs(c) > 1e-6:
            return (t.copy(), sj) if c > 0 else (-t, -sj)
    return t.copy(), sj


def polygon_line(points, n, c):
    """Segments where a planar polygon meets the plane n . p = c (pairs of crossings sorted along the line)."""
    out = []
    k = len(points)
    for i in range(k):
        p, q = points[i], points[(i + 1) % k]
        dp, dq = n.dot(p) - c, n.dot(q) - c
        if (dp < 0) != (dq < 0) and abs(dp - dq) > 1e-12:
            out.append(p + (q - p) * (dp / (dp - dq)))
    if len(out) < 2:
        return []
    axis = (out[-1] - out[0]).normalized() if (out[-1] - out[0]).length > 1e-9 else Vector((1, 0, 0))
    out.sort(key=lambda p: p.dot(axis))
    return [(out[i], out[i + 1]) for i in range(0, len(out) - 1, 2)]


def rules_for(ob, jt):
    """The joint rules by slot for one object: joints.rules, plus its own rule from joints.objects (2026-10-14)."""
    rules = dict(jt["rules"])
    own = jt.get("objects", {}).get(ob.name)
    if own:
        rules[own["slot"]] = own
    return rules


def solid_ids(me):
    """The solid (connected vertex set) each polygon belongs to: pieces() builds every solid from its own vertices."""
    parent = list(range(len(me.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    return [find(p.vertices[0]) for p in me.polygons]


def stone_faces(objects, jt):
    """World-space records of the objects' stone faces (a slot of their joint rules), before any cut: (object name, face
    index, solid id, normal, plane offset, points, slot, rule)."""
    recs = []
    for ob in objects:
        me = ob.data
        rules = rules_for(ob, jt)
        names = [m.name if m else "" for m in me.materials]
        if not any(n in rules for n in names):
            continue
        mw = ob.matrix_world
        rot = mw.to_3x3()
        sid = solid_ids(me)
        for p in me.polygons:
            if p.material_index >= len(names) or names[p.material_index] not in rules:
                continue
            n = (rot @ p.normal).normalized()
            pts = [mw @ me.vertices[v].co for v in p.vertices]
            slot = names[p.material_index]
            recs.append((ob.name, p.index, sid[p.index], n, n.dot(pts[0]), pts, slot, rules[slot]))
    return recs


# ---------------------------------------------------------------- grids (user fix 11, 2026-10-15)


def lateral(n):
    """The horizontal direction across a vertical face (the axis its vertical joints are placed along)."""
    return Vector((-n.y, n.x, 0.0)).normalized()


def divide(s0, s1, panel_max):
    """The cuts that split s0..s1 into equal panels of at most panel_max."""
    k = math.ceil((s1 - s0) / panel_max - 1e-9)
    return [s0 + (s1 - s0) * j / k for j in range(1, k)]


def cluster(values, tol):
    """The values sorted, runs closer than tol merged into their mean."""
    runs = []
    for v in sorted(values):
        if runs and v - runs[-1][-1] <= tol:
            runs[-1].append(v)
        else:
            runs.append([v])
    return [sum(r) / len(r) for r in runs]


def module_lines(s0, s1, g):
    """User fix 19: a module grid's vertical joints across one plane's run s0..s1: every g["block"], nothing stretched.
    `layout` centre puts a joint or a block on the run's centre, whichever leaves the larger end pieces (both ends
    alike); the end pieces are the blocks cut at the run's ends. Lines closer than min_panel to an end are dropped."""
    w, mid, half = g["block"], (s0 + s1) / 2, (s1 - s0) / 2
    assert g.get("layout", "centre") == "centre", f"module grid {g['name']}: unknown layout {g.get('layout')}"
    best = None
    for off in (0.0, w / 2):                               # a joint on the centre, or a block
        r = (half - off) % w
        end = r if r > 1e-6 else w
        if best is None or end > best[0] + 1e-9:
            best = (end, off)
    off = best[1]
    lines = {mid + sgn * (off + j * w) for j in range(int((half - off) / w) + 1) for sgn in (-1, 1)}
    return sorted(s for s in lines if s0 + g["min_panel"] < s < s1 - g["min_panel"])


def in_box(p, box, tol=1e-4):
    return all(box[k][0] - tol <= p[i] <= box[k][1] + tol for i, k in enumerate("xyz"))


def plane_groups(recs, idx):
    """recs[i] for i in idx grouped by plane: the same normal (to 1e-3) and offsets within 0.2 mm (float32). Returns
    {(normal key, offset): [i]}, the key's zeros unsigned so it prints the same for every piece."""
    by_n = {}
    for i in idx:
        by_n.setdefault(tuple(round(x, 3) + 0.0 for x in recs[i][3]), []).append(i)
    out = {}
    for nk, ids in by_n.items():
        ids.sort(key=lambda i: recs[i][4])
        run = []
        for i in ids + [None]:
            if run and (i is None or recs[i][4] - recs[run[-1]][4] > 2e-4):
                out[(nk, round(sum(recs[j][4] for j in run) / len(run), 4) + 0.0)] = run
                run = []
            if i is not None:
                run.append(i)
    return out


def grid_layout(recs, jt):
    """The joint grids (joints.grids): {object: {face index: {"z", "v", "cell"}}} for the faces they lay out, and stats.
      region faces   vertical stone faces wholly inside the grid's box: course planes "z" = the grid's own; vertical
                     joints "v" = their plane's lines inside the face, the lines being the plane's face ends (merged
                     within `cluster`) plus each gap between them cut into equal panels of at most panel_max; "cell"
                     (grid, plane, course planes, lines) keys each panel's map offset to its grid cell
      inherit faces  a face set of `inherit` outside the box meeting a region face flush along its top or bottom edge:
                     "v" = the ends and vertical joints of every stone face it meets so, each gap left cut into equal
                     panels; "z" None (its course planes stay the shared ones)
      module grids   (user fix 19) mode "module": a plane's lines run at the grid's `block` pitch across the plane's
                     whole run (module_lines), not fitted to the face ends; jt["module_lines"] keeps them per plane
                     [(grid, normal key, offset, lines)] for seam_joints, which leaves the flush vertical seams off them
                     uncut"""
    out, stats = {}, {"grid_faces": 0, "inherited_faces": 0}
    jt["module_lines"] = []
    pm, vmin = jt["panel_max"], jt["vertical_min_height"]
    clear = reach(jt) + jt["margin"]
    zr = [(min(p.z for p in r[5]), max(p.z for p in r[5])) for r in recs]
    vert = [i for i, r in enumerate(recs) if abs(r[3].z) < 0.1]
    groups = plane_groups(recs, vert)
    group_of = {i: key for key, ids in groups.items() for i in ids}

    def span(i):
        t = lateral(recs[i][3])
        s = [p.dot(t) for p in recs[i][5]]
        return min(s), max(s)

    def tall(i):
        return recs[i][7]["verticals"] and zr[i][1] - zr[i][0] >= vmin

    for g in jt.get("grids", []):
        slots = g.get("slots")                          # fix 13: the stone the grid lays out (not the site's tree pits)
        region = {i for i in vert
                  if all(in_box(p, g["box"]) for p in recs[i][5]) and (not slots or recs[i][6] in slots)}
        lines, own, runs = {}, {}, {}
        for key, ids in groups.items():
            ids = [i for i in ids if i in region]
            if not ids:
                continue
            breaks = cluster([s for i in ids for s in span(i)], g["cluster"])
            if g.get("mode") == "module":                   # user fix 19: the plane's run on a signed world axis
                t = lateral(Vector(key[0]))
                a, sign = canonical(t, 0.0)[0], 1.0
                if a.dot(t) < 0:
                    sign = -1.0
                runs[key] = (a, sign, sorted((sign * breaks[0], sign * breaks[-1])), any(tall(i) for i in ids))
                continue
            lines[key] = sorted(breaks + [c for a, b in zip(breaks, breaks[1:]) for c in divide(a, b, pm)])
        for key, (a, sign, (r0, r1), _) in runs.items():
            # user fix 19: the lines come from the longest parallel wall run (a plane with jointed faces) sharing this
            # run's centre: a wall's outer face, so its inner face and soffits keep the outer joints and the cap
            # follows the wall; at the block pitch, cut at this run's ends
            mid = (r0 + r1) / 2
            walls = [(q0, q1) for b, _, (q0, q1), wall in runs.values()
                     if wall and abs(b.dot(a)) > 0.999 and abs((q0 + q1) / 2 - mid) < g["cluster"]]
            m0, m1 = max(walls, key=lambda q: q[1] - q[0]) if walls else (r0, r1)
            world = [s for s in module_lines(m0, m1, g) if r0 + g["min_panel"] < s < r1 - g["min_panel"]]
            lines[key] = sorted(sign * s for s in world)
            jt["module_lines"].append((g, key[0], key[1], lines[key]))
        for i in region:
            key = group_of[i]
            s0, s1 = span(i)
            own[i] = [s for s in lines[key] if s0 + clear < s < s1 - clear] if tall(i) else []
            out.setdefault(recs[i][0], {})[recs[i][1]] = {"z": g["course_planes"], "v": own[i],
                                                          "cell": (g["name"], key, g["course_planes"], lines[key])}
        stats["grid_faces"] += len(region)
        for key, ids in groups.items():                                 # inherit faces, plane by plane
            for f in ids:
                if f in region or recs[f][6] not in g.get("inherit", []) or not tall(f):
                    continue
                near = [r for r in ids if r != f and (abs(zr[r][1] - zr[f][0]) < 2e-3 or abs(zr[r][0] - zr[f][1]) < 2e-3)
                        and min(span(r)[1], span(f)[1]) - max(span(r)[0], span(f)[0]) > g["min_panel"]]
                if not any(r in region for r in near):
                    continue
                s0, s1 = span(f)
                fixed = []
                for r in near:
                    q0, q1 = span(r)
                    fixed += [q0, q1] + (own[r] if r in region else divide(q0, q1, pm) if tall(r) else [])
                fixed = [s for s in cluster(fixed, g["cluster"]) if s0 + g["min_panel"] < s < s1 - g["min_panel"]]
                cuts = [c for a, b in zip([s0] + fixed, fixed + [s1]) for c in divide(a, b, pm)]
                out.setdefault(recs[f][0], {})[recs[f][1]] = {"z": None, "v": sorted(fixed + cuts)}
                stats["inherited_faces"] += 1
    return out, stats


def off_grid(p0, p1, grids):
    """True where a horizontal seam from p0 to p1 lies inside a grid's box but on none of its course planes: the block
    runs on over the piece boundary there, so the seam is not cut."""
    return any(in_box(p0, g["box"]) and in_box(p1, g["box"]) and all(abs(p0.z - zc) > 1e-3 for zc in g["course_planes"])
               for g in grids)


def off_module(n, c, p0, p1, jt, tol=0.01):
    """User fix 19: True where a vertical seam p0..p1 on the plane n . p = c lies inside a module grid's box but off its
    lines on that plane (grid_layout's jt["module_lines"]): the block runs on over the piece boundary there."""
    nk = tuple(round(x, 3) + 0.0 for x in n)
    for g, gk, off, lines in jt.get("module_lines", []):
        if gk == nk and abs(off - c) <= 2e-4 and in_box(p0, g["box"]) and in_box(p1, g["box"]):
            s = p0.dot(lateral(n))
            return all(abs(s - q) > tol for q in lines)
    return False


def seam_joints(recs_all, jt, stats=None):
    """Seams between flush stone pieces: coplanar stone faces of different solids (or objects) facing the same way and
    sharing a stretch of a boundary edge. Returns {object name: {face index: [(t, s, e, e0, e1)]}}: the joint plane
    t . p = s through the seam (t in the face's plane, square to the edge) and the shared stretch e0..e1 along e.
    A horizontal seam off a grid's course planes inside its box is left uncut (counted in stats["suppressed_seams"]), and
    so is a vertical seam off a module grid's lines (user fix 19, off_module)."""
    tol, tol_c = 2e-4, 2e-4
    grids = jt.get("grids", [])
    recs, buckets = [], {}
    for name, index, sid, n, c, pts, _, _ in recs_all:
        nk = tuple(round(x, 3) for x in n)
        buckets.setdefault((nk, round(c / tol_c)), []).append(len(recs))
        recs.append((name, index, sid, n, c, pts))
    out = {}
    min_len = jt.get("seam_min_length", 0.02)
    done = set()
    for i, (oa, fa, sa, na, ca, pa) in enumerate(recs):
        nk = tuple(round(x, 3) for x in na)
        ck = round(ca / tol_c)
        for j in [j for k in (ck - 1, ck, ck + 1) for j in buckets.get((nk, k), [])]:
            if j <= i or (i, j) in done:
                continue
            ob_, fb, sb, nb, cb, pb = recs[j]
            if (ob_ == oa and sb == sa) or na.dot(nb) < 1 - 1e-6 or abs(ca - cb) > tol_c:
                continue
            done.add((i, j))
            ctr_a, ctr_b = sum(pa, Vector()) / len(pa), sum(pb, Vector()) / len(pb)
            for k in range(len(pa)):
                p0, p1 = pa[k], pa[(k + 1) % len(pa)]
                if (p1 - p0).length < min_len:
                    continue
                e = (p1 - p0).normalized()
                t = na.cross(e)
                s = t.dot(p0)
                for m in range(len(pb)):
                    q0, q1 = pb[m], pb[(m + 1) % len(pb)]
                    if abs(t.dot(q0) - s) > tol or abs(t.dot(q1) - s) > tol:
                        continue                                       # not on the same line
                    if (t.dot(ctr_a) - s) * (t.dot(ctr_b) - s) >= 0:
                        continue                                       # not on opposite sides of it
                    lo = max(min(e.dot(p0), e.dot(p1)), min(e.dot(q0), e.dot(q1)))
                    hi = min(max(e.dot(p0), e.dot(p1)), max(e.dot(q0), e.dot(q1)))
                    if hi - lo < min_len:
                        continue
                    a0, a1 = p0 + e * (lo - e.dot(p0)), p0 + e * (hi - e.dot(p0))
                    if (abs(t.z) > 0.99 and off_grid(a0, a1, grids)) or (abs(e.z) > 0.999 and off_module(na, ca, a0, a1, jt)):
                        if stats is not None:
                            stats["suppressed_seams"] = stats.get("suppressed_seams", 0) + 1
                        continue
                    tc, sc = canonical(t, s)
                    for name, face in ((oa, fa), (ob_, fb)):       # a face may share one line with several pieces
                        lst = out.setdefault(name, {}).setdefault(face, [])
                        if all((tc - t2).length > 1e-4 or abs(sc - s2) > tol or abs(lo - a0) > tol or abs(hi - a1) > tol
                               for t2, s2, _, a0, a1 in lst):
                            lst.append((tc, sc, e.copy(), lo, hi))
    return out


def merge_stretches(recs, tol):
    """One face's seams with the stretches along one line merged where they meet or overlap (a fascia over a pier and the
    lintel beside it is one seam: no ramp, no doubled cut at the meeting point)."""
    norm = []
    for t, s, e, e0, e1 in recs:                                       # one spelling of each line's direction
        ec, _ = canonical(e, 0.0)
        norm.append((t, s, ec, e0, e1) if ec.dot(e) > 0 else (t, s, ec, -e1, -e0))
    out = []
    for t, s, e, e0, e1 in sorted(norm, key=lambda r: r[3]):
        for k, (t2, s2, e2, a0, a1) in enumerate(out):
            if (t - t2).length < 1e-4 and abs(s - s2) < tol and e.dot(e2) > 0.9999 and e0 <= a1 + tol and e1 >= a0 - tol:
                out[k] = (t2, s2, e2, min(a0, e0), max(a1, e1))
                break
        else:
            out.append((t, s, e, e0, e1))
    return out


def cut_joints(ob, jt, joint_mat, seams=None, grid=None, contacts=None, inside=None):
    """Cut the stone joints into one object; returns its stats and its layout record (or None if it has no stone).
    seams: {face index: [(t, s, e, e0, e1)]} from seam_joints(); grid: {face index: {"z", "v", "cell"}} from
    grid_layout(), the faces whose course planes ("z", unless None) and vertical joints ("v") a joint grid lays out;
    contacts: the part's Contacts, which keep the corner joints (user fix 18) off buried edges; inside: {face index:
    [(t, s, e, e0, e1, neg, pin)]} from inside_corners() (user fix 18d addendum)."""
    me = ob.data
    names = [m.name if m else "" for m in me.materials]
    rules = rules_for(ob, jt)
    stone_idx = {i for i, n in enumerate(names) if n in rules}
    if not stone_idx:
        return None, None
    course_idx = {i for i in stone_idx if rules[names[i]]["courses"]}
    vert_idx = {i for i in stone_idx if rules[names[i]]["verticals"]}
    if JOINT_MATERIAL not in names:
        me.materials.append(joint_mat)
        names.append(JOINT_MATERIAL)
    joint_index = names.index(JOINT_MATERIAL)
    half, bev, depth = jt["width"] / 2, jt["bevel"], jt["depth"]
    tol = 2e-4                    # mesh coordinates are float32: ~1e-6 m at 10 m; the next cut line is `bevel` away
    clear = reach(jt) + jt["margin"]
    prof = profile(jt)            # user fix 18: floor, side wall, eased arris; a cut on each side at each break
    offsets = tuple(sorted([-o for o, _ in prof] + [o for o, _ in prof]))
    ramp = reach(jt) - half       # a seam ending inside a face ramps out over this length
    sids = solid_ids(me)

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(ob.matrix_world)
    bm.normal_update()
    foot = min((v.co.z for v in bm.verts), default=0.0)               # the paving a `base` object stands on (a coping
    orig = bm.faces.layers.int.new("rb_orig")                          # on its own body meets it in a seam instead)
    faces = {}                    # orig id -> record of the original stone face
    for i, f in enumerate(bm.faces):
        f[orig] = i
    # user fix 18d: the slab fascias' arrises to the other materials of their slab chamfered first (new faces, new ids)
    chamfers, n_arris = bevel_arrises(bm, ob, jt, names, orig, sids, contacts) if jt.get("arrises") else (set(), 0)
    partner_idx = {i for i, n in enumerate(names) if n in jt.get("arrises", {}).get("partners", [])}
    bm.normal_update()
    # user fix 18 addendum: the outside corners, found before any cut; an eased or rounded arris closes up into the
    # sharp corner its joint is cut on (the corner's faces keep their original ids)
    with_corners = jt.get("corners") and all(rules[names[i]].get("corners", True) for i in stone_idx)
    corners = find_corners(bm, {f[orig] for f in bm.faces if f.material_index in stone_idx}, orig, jt, contacts,
                           ob.name, sids, chamfers) if with_corners else []
    welded = sharpen(bm, corners)
    bm.normal_update()
    for f in bm.faces:
        i = f[orig]
        if f.material_index not in stone_idx:
            continue
        n = f.normal.copy()
        pts = [v.co.copy() for v in f.verts]
        rec = {"n": n, "pts": pts, "slot": names[f.material_index], "z": [], "v": [],     # v: [(t, s)] vertical joint planes
               "s": merge_stretches((seams or {}).get(i, []), tol),                     # s: [(t, s, e, e0, e1)] seams
               "c": [],                                                # c: [(t, s, e, e0, e1, profile)] corners
               "i": list((inside or {}).get(i, []))}                   # i: inside corners (user fix 18d addendum)
        g = (grid or {}).get(i)                                        # a joint grid's layout for this face (fix 11)
        if g and g.get("cell"):
            rec["cell"] = g["cell"]
        if abs(n.z) < 0.5 and f.material_index in course_idx:
            z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
            planes = g["z"] if g and g["z"] is not None else jt["course_planes"]
            rec["z"] = [zc for zc in planes if z0 < zc - clear and z1 > zc + clear]
        tall = max(p.z for p in pts) - min(p.z for p in pts) >= jt["vertical_min_height"]
        if abs(n.z) < 0.1 and f.material_index in vert_idx and tall:
            t = Vector((-n.y, n.x, 0.0)).normalized()
            if g:
                rec["v"] = [canonical(t, s) for s in g["v"]]
            else:
                s = [p.dot(t) for p in pts]
                rec["v"] = [canonical(t, c) for c in divide(min(s), max(s), jt["panel_max"])]
        if abs(n.z) < 0.1 and rules[rec["slot"]].get("base") and min(p.z for p in pts) < foot + tol:
            e = Vector((-n.y, n.x, 0.0)).normalized()                  # a joint at the foot: its strip from the foot up
            ext = [p.dot(e) for p in pts]
            rec["s"].append((Vector((0.0, 0.0, 1.0)), foot + half, e, min(ext), max(ext)))
        faces[i] = rec
    # user fix 18d: an inside corner whose face was chamfered (the fascia's eased top against a pier) runs on over the
    # chamfer's end on the corner, so the groove does not stop at the arris
    if chamfers:
        for f in bm.faces:
            src = faces.get(f[orig])
            if not src or not src["i"] or f[orig] in chamfers:
                continue
            for h in {h for x in f.edges for h in x.link_faces if h[orig] in chamfers and h[orig] in faces}:
                ch = faces[h[orig]]
                for t, sj, e, e0, e1, neg, pin in src["i"]:
                    on = [p for p in ch["pts"] if abs(p.dot(t) - sj) < 1e-4]
                    if len(on) < 2 or not any(e0 - 0.01 <= p.dot(e) <= e1 + 0.01 for p in on):
                        continue
                    a, b = min(on, key=lambda p: p.dot(e)), max(on, key=lambda p: p.dot(e))
                    if (b - a).length < 1e-3:
                        continue
                    ec = canonical((b - a).normalized(), 0.0)[0]
                    tc = ch["n"].cross(ec).normalized()
                    if tc.dot(sum(ch["pts"], Vector()) / len(ch["pts"]) - a) < 0:
                        tc = -tc
                    entry = (tc, tc.dot(a), ec, min(a.dot(ec), b.dot(ec)), max(a.dot(ec), b.dot(ec)), False, pin)
                    if all((tc - r[0]).length > 1e-4 or abs(tc.dot(a) - r[1]) > 2e-4 for r in ch["i"]):
                        ch["i"].append(entry)
    # each corner's joint on its two faces: t across the face, away from the corner (|t . p - s| = the distance from it)
    for c in corners:
        if c["a"] not in faces or c["b"] not in faces:
            continue
        na, nb = faces[c["a"]]["n"], faces[c["b"]]["n"]
        (n0, d0), (n1, d1) = c["planes"]
        q = Vector(tuple(np.linalg.lstsq(np.array([tuple(n0), tuple(n1), tuple(c["e"])]), np.array([d0, d1, 0.0]),
                                         rcond=None)[0]))                  # a point on the corner line
        for me_, other in ((c["a"], nb), (c["b"], na)):
            rec = faces[me_]
            t = rec["n"].cross(c["e"]).normalized()
            centre = sum(rec["pts"], Vector()) / len(rec["pts"])
            if t.dot(centre - q) < 0:
                t = -t
            prof_c = corner_profile(rec["n"], other, jt["corners"], c["ease"])
            ext = [p.dot(c["e"]) for p in rec["pts"]]
            for e0, e1 in c["spans"]:                                  # a stretch ending inside the face (where the
                e0 = e0 + ramp if e0 > min(ext) + tol else e0         # corner meets another piece) ramps out before
                e1 = e1 - ramp if e1 < max(ext) - tol else e1         # that end, never into the buried part
                if e1 - e0 > ramp:
                    rec["c"].append((t, t.dot(q), c["e"], e0, e1, prof_c))
    # a vertical joint carries on over the stone faces it meets square (the soffit or top of a lintel; 2026-10-14: an
    # eased arris and the stone return past it): one face past its own, further only across narrow faces (a bevel, a
    # return), up to joints.carry_hops faces
    adj = {f[orig]: {h[orig] for e in f.edges for h in e.link_faces} - {f[orig]} for f in bm.faces if f[orig] in faces}
    narrow = 0.1
    for i in [i for i in faces if faces[i]["v"]]:
        for t, sj in list(faces[i]["v"]):
            front, seen = [i], {i}
            for hop in range(jt.get("carry_hops", 1)):
                nxt = []
                for fid in front:
                    for hid in adj[fid]:
                        if hid in seen or hid not in faces or abs(faces[hid]["n"].dot(t)) > 0.02:
                            continue
                        seen.add(hid)
                        rec = faces[hid]
                        s = [p.dot(t) for p in rec["pts"]]
                        if not (min(s) < sj - clear and max(s) > sj + clear):
                            continue
                        if all(abs(sj - s2) > tol or (t - t2).length > 1e-4 for t2, s2 in rec["v"]):
                            rec["v"].append((t, sj))       # a soffit can meet the same plane from two faces
                        run = rec["n"].cross(t)                     # the joint's direction across this face
                        w = [p.dot(run) for p in rec["pts"]]
                        if max(w) - min(w) <= narrow:
                            nxt.append(hid)
                front = nxt

    def bisect(fs, co, no):
        """Cut faces fs; returns every face they became (bisect_plane's output holds the cut and the uncut ones)."""
        geom = fs + list({e for f in fs for e in f.edges}) + list({v for f in fs for v in f.verts})
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no)    # float32: a vertex an
        # earlier cut put on this plane (a neighbour's cut along a shared edge) reads ~1e-6 off it on a diagonal run
        return [g for g in res["geom"] if isinstance(g, bmesh.types.BMFace)]

    by_orig = {oid: [] for oid in faces}
    for f in bm.faces:
        if f[orig] in faces:
            by_orig[f[orig]].append(f)
    cuts = 0
    for oid, rec in faces.items():                                     # vertical joints, face by face
        for t, sj in rec["v"]:
            for off in offsets:
                by_orig[oid] = bisect(by_orig[oid], t * (sj + off), t)
                cuts += 1
    for oid, rec in faces.items():                                     # seams, face by face: the groove's lines, and
        done = []                                                      # where a shared stretch ends inside the face, a
        for t, sj, e, e0, e1 in rec["s"]:                              # short ramp `ramp` long out of it
            if not any((t - t2).length < 1e-4 and abs(sj - s2) < tol for t2, s2 in done):
                done.append((t, sj))
                s_face = [p.dot(t) for p in rec["pts"]]
                for off in offsets:
                    if min(s_face) + tol < sj + off < max(s_face) - tol:     # a corner's lines beyond the face: none
                        by_orig[oid] = bisect(by_orig[oid], t * (sj + off), t)
                        cuts += 1
            ext = [p.dot(e) for p in rec["pts"]]
            for at, step in ((e0, -ramp), (e1, ramp)):
                if min(ext) + tol < at + min(step, 0.0) and at + max(step, 0.0) < max(ext) - tol:
                    for c in (at, at + step):
                        by_orig[oid] = bisect(by_orig[oid], e * c, e)
                        cuts += 1
    for oid, rec in faces.items():                                     # corners (user fix 18): the slit's lip and the
        for t, sj, e, e0, e1, pc in rec["c"]:                          # bevel's lip on each of the corner's faces
            s_face = [p.dot(t) for p in rec["pts"]]
            for off, _ in pc[1:]:
                if min(s_face) + tol < sj + off < max(s_face) - tol:
                    by_orig[oid] = bisect(by_orig[oid], t * (sj + off), t)
                    cuts += 1
            ext = [p.dot(e) for p in rec["pts"]]
            for at, step in ((e0, -ramp), (e1, ramp)):
                if min(ext) + tol < at + min(step, 0.0) and at + max(step, 0.0) < max(ext) - tol:
                    for c in (at, at + step):
                        by_orig[oid] = bisect(by_orig[oid], e * c, e)
                        cuts += 1
    for oid, rec in faces.items():                                     # inside corners (user fix 18d addendum): the
        for t, sj, e, e0, e1, neg, _ in rec["i"]:                      # half groove's lines from the corner out; past
            s_face = [p.dot(t) for p in rec["pts"]]                    # it, the corner and the buried ramp's end
            offs = [o for o, _ in prof] + ([0.0, -ramp] if neg else [])
            for off in offs:
                if min(s_face) + tol < sj + off < max(s_face) - tol:
                    by_orig[oid] = bisect(by_orig[oid], t * (sj + off), t)
                    cuts += 1
            ext = [p.dot(e) for p in rec["pts"]]
            for at, step in ((e0, -ramp), (e1, ramp)):
                for c in (at, at + step):
                    if min(ext) + tol < c < max(ext) - tol:
                        by_orig[oid] = bisect(by_orig[oid], e * c, e)
                        cuts += 1
    planes = sorted({zc for rec in faces.values() for zc in rec["z"]})
    for zc in planes:                                                  # course joints, plane by plane
        oids = [oid for oid, rec in faces.items() if zc in rec["z"]]
        fs = [f for oid in oids for f in by_orig[oid]]
        for off in offsets:
            fs = bisect(fs, (0.0, 0.0, zc + off), (0.0, 0.0, 1.0))
            cuts += 1
        for oid in oids:
            by_orig[oid] = []
        for f in fs:
            by_orig[f[orig]].append(f)

    # push every vertex inside a groove into the faces whose joint it lies on, by the groove's depth there (user fix 18:
    # the profile's floor, side walls and eased arrises; where two grooves cross, the deeper)
    inner = prof[1][0]                                                 # the side walls' top: inside it is the joint

    def groove(oid, co):
        """(depth, inside the joint) at co on face oid: the deepest of its grooves there."""
        rec = faces[oid]
        dist = [abs(co.z - zc) for zc in rec["z"]] + [abs(co.dot(t) - sj) for t, sj in rec["v"]]
        dist += [abs(co.dot(t) - sj) for t, sj, e, e0, e1 in rec["s"] if e0 - tol <= co.dot(e) <= e1 + tol]
        best = (depth_at(min(dist), prof, tol), min(dist) <= inner + tol) if dist else (0.0, False)
        for t, sj, e, e0, e1, pc in rec["c"]:
            if e0 - tol <= co.dot(e) <= e1 + tol:
                u = abs(co.dot(t) - sj)
                k = depth_at(u, pc, tol)
                best = (max(best[0], k), best[1] or u <= pc[1][0] + tol)
        for t, sj, e, e0, e1, neg, _ in rec["i"]:                      # inside corners: the half groove from the
            if e0 - tol <= co.dot(e) <= e1 + tol:                      # corner; past it (buried) a ramp out
                u = co.dot(t) - sj
                if u >= -tol:
                    best = (max(best[0], depth_at(max(u, 0.0), prof, tol)), best[1] or u <= inner + tol)
                elif neg and u > -ramp - tol:
                    best = (max(best[0], depth * max(0.0, 1.0 + u / ramp)), True)
        return best

    def pins(v):
        """User fix 18d: the planes a pushed vertex must stay in: an arris chamfer's edge on its partner material (the
        slab top a joint crosses), and a face's edge on an inside corner with another solid (it slides along the other
        face, never into it)."""
        out = []
        if chamfers and any(f[orig] in chamfers for f in v.link_faces):
            out += [h.normal.copy() for h in v.link_faces if h.material_index in partner_idx and h[orig] not in faces]
        for f in v.link_faces:
            for t, sj, e, e0, e1, _, pin in faces.get(f[orig], {}).get("i", ()):
                if pin is not None and abs(v.co.dot(t) - sj) <= tol and e0 - ramp - tol <= v.co.dot(e) <= e1 + ramp + tol:
                    out.append(pin)
        return out
    moves, in_joint = [], set()
    for v in bm.verts:
        hits = [(faces[f[orig]]["n"], *groove(f[orig], v.co)) for f in v.link_faces if f[orig] in faces]
        if any(j for _, _, j in hits):
            in_joint.add(v)
        pairs = [(n, d) for n, d, _ in hits if d > 1e-6]
        if pairs:
            deep = max(d for _, d in pairs)
            # a pin square to the push or against a pushing face (the casing's end face beside the pier, cut by a
            # course joint) would ask for the impossible: such a pin is dropped, and so are all where the solve runs off
            pin = [p for p in pins(v) if all(abs(p.dot(n)) < 0.999 for n, _ in pairs)]
            push = push_vector(pairs + [(n, 0.0) for n in pin]) if pin else push_vector(pairs)
            if pin and push.length > 3.0 * deep:
                push = push_vector(pairs)
            moves.append((v, push, deep))
    strays = sum(1 for _, d, k in moves if d.length > 3.0 * k + 1e-6)   # self-check: no vertex runs off (fix 18d)
    if strays:
        print(f"WARNING {ob.name}: {strays} joint pushes longer than 3x their depth")
    sunk = {}                                                          # vertex -> its depth
    for v, d, k in moves:
        v.co -= d
        sunk[v] = k
    # the joint itself takes the joint material: the faces inside the side walls' tops (the floor and the walls; a
    # corner's slit); the eased arrises above them stay stone and catch the light
    floors = 0
    for f in bm.faces:
        if f[orig] in faces and f.verts and all(v in in_joint for v in f.verts):
            f.material_index = joint_index
            floors += 1

    # where three corner joints meet at a block's tip the pushes can fold a millimetre piece over (its normal turned
    # against its face's): it collapses to its centre
    bm.normal_update()
    for _ in range(2):
        folded = [f for f in bm.faces if f[orig] in faces and f.material_index != joint_index
                  and 1e-10 < f.calc_area() < 1e-4 and f.normal.dot(faces[f[orig]]["n"]) < -0.9]
        if not folded:
            break
        for f in folded:
            if f.is_valid:
                bmesh.ops.pointmerge(bm, verts=list(f.verts), merge_co=f.calc_center_median())
        bm.normal_update()
    # faces the push twisted: where two grooves cross, a quad with three corners at one depth and the fourth at another
    # is split along the mitre through the odd corner; anything else non-planar (over curved facets) is triangulated
    def twisted(f):
        c, n = f.calc_center_median(), f.normal
        return max(abs(n.dot(v.co - c)) for v in f.verts) > 1e-4
    bm.normal_update()
    rest = []
    for f in [f for f in bm.faces if f[orig] in faces and len(f.verts) > 3 and twisted(f)]:
        vs = list(f.verts)
        ds = [round(sunk.get(v, 0.0), 6) for v in vs]
        odd = [k for k in range(len(vs)) if ds.count(ds[k]) == 1]
        if len(vs) == 4 and len(odd) == 1 and len(set(ds)) == 2:
            i = odd[0]
            bmesh.utils.face_split(f, vs[i], vs[(i + 2) % 4])
        else:
            rest.append(f)
    if rest:
        bmesh.ops.triangulate(bm, faces=rest, quad_method="BEAUTY", ngon_method="BEAUTY")
    # slivers where a corner's lines meet another groove's within float32 (three points in a row): collapsed
    slivers = [e for f in bm.faces if f[orig] in faces and f.calc_area() < 1e-8 for e in f.edges]
    if slivers:
        bmesh.ops.dissolve_degenerate(bm, dist=2e-5, edges=list(set(slivers)))
    for _ in range(3):                         # a flat triangle (its corners in a row) joins the face over its long edge
        flat = {max(f.edges, key=lambda e: e.calc_length()) for f in bm.faces if f[orig] in faces and f.calc_area() < 1e-8}
        flat = [e for e in flat if len(e.link_faces) == 2]
        if not flat:
            break
        bmesh.ops.dissolve_edges(bm, edges=flat, use_verts=False)
    bm.normal_update()
    left = [f for f in bm.faces if f[orig] in faces and len(f.verts) > 3 and twisted(f)]
    if left:                                   # a face the merges left twisted (grooves of unequal slopes crossing)
        bmesh.ops.triangulate(bm, faces=left, quad_method="BEAUTY", ngon_method="BEAUTY")
        bm.normal_update()
    bm.faces.index_update()                    # (indices: removing the orig layer below invalidates face references)
    arris = [f.index for f in bm.faces if f[orig] in faces and f.material_index != joint_index
             and max(sunk.get(v, 0.0) for v in f.verts) > 1e-6 and f.normal.angle(faces[f[orig]]["n"], 0.0) > math.radians(8.0)]
    rlay = bm.faces.layers.int.get(ROUND_ATTR)                         # a layer's rounded edges (the tree pits)
    round_ids = {f.index for f in bm.faces if rlay is not None and f[rlay] and f.material_index != joint_index}
    arris = sorted(set(arris) | round_ids | {f.index for f in bm.faces if f[orig] in chamfers   # user fix 18d's chamfers
                                             and f.material_index != joint_index})

    # box UVs from each original face's normal, then one seeded offset per panel (regions bounded by joint floors)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if f[orig] not in faces:
            continue
        n = faces[f[orig]]["n"]
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (co.x, co.y) if ax == 2 else (co.y, co.z) if ax == 0 else (co.x, co.z)
    seen, panels = set(), []
    for f in bm.faces:
        if f in seen or f[orig] not in faces or f.material_index == joint_index:
            continue
        stack, panel = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            panel.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen and h[orig] in faces and h.material_index != joint_index:
                        seen.add(h)
                        stack.append(h)
        panels.append(panel)
    repeat = jt.get("repeat_m", 4.0)

    modules = {g["name"] for g in jt.get("grids", []) if g.get("mode") == "module"}

    def cell_keys(panel):
        """A grid panel's key: its grid cell on the plane holding most of its grid faces (a block whose seam with the
        next piece is not cut takes the same map offset in both pieces), and {plane: key} for each module grid plane
        in it (user fix 19: an uncut soffit joins a lintel's outer and inner faces in one panel, and each face must
        keep its own plane's cell, as the piece beside it does). (None, {}) off the grids."""
        acc = {}
        for g in panel:
            cell = faces[g[orig]].get("cell")
            if cell:
                a = g.calc_area()
                k = acc.setdefault(cell[:2], [0.0, Vector(), cell])
                k[0] += a
                k[1] += g.calc_center_median() * a

        def key(entry):
            a, c, (name, plane, zs, lines) = entry
            c = c / a
            course, column = bisect_right(zs, c.z), bisect_right(lines, c.dot(lateral(Vector(plane[0]))))
            return f"{jt['seed']}:grid:{name}:{plane}:{course}:{column}"
        acc = {k: v for k, v in acc.items() if v[0] >= 1e-8}
        if not acc:
            return None, {}
        return key(max(acc.values(), key=lambda k: k[0])), {k: key(v) for k, v in acc.items() if k[0] in modules}
    for panel in panels:
        key, own = cell_keys(panel)
        if key is None:
            lo = min((tuple(round(c, 3) for c in v.co) for g in panel for v in g.verts))
            key = f"{jt['seed']}:{ob.name}:{lo}"
        shifts = {}
        for g in panel:
            cell = faces[g[orig]].get("cell")
            k = own.get(cell[:2], key) if cell else key
            if k not in shifts:
                rng = random.Random(hashlib.md5(k.encode()).hexdigest())
                shifts[k] = (rng.uniform(0.0, repeat), rng.uniform(0.0, repeat))
            du, dv = shifts[k]
            for lp in g.loops:
                lp[uv].uv = (lp[uv].uv[0] + du, lp[uv].uv[1] + dv)

    bm.normal_update()                                                  # self-checks: no slivers, no twisted faces
    degenerate = sum(1 for f in bm.faces if f[orig] in faces and f.calc_area() < 1e-8)
    flipped = sum(1 for f in bm.faces if f[orig] in faces and f.material_index != joint_index   # no stone face folded
                  and f.calc_area() > 1e-5 and f.normal.dot(faces[f[orig]]["n"]) < -0.5)       # over (user fix 18d)
    if flipped and os.environ.get("TM_RB_JOINT_DEBUG"):         # a stat, not a warning: fix 18's crossings left 444
        print(f"FLIPPED {ob.name}: {flipped} stone faces folded over by the joints")
        for f in [f for f in bm.faces if f[orig] in faces and f.material_index != joint_index
                  and f.calc_area() > 1e-5 and f.normal.dot(faces[f[orig]]["n"]) < -0.5]:
            print("FLIP", ob.name, names[f.material_index], [round(c, 4) for c in f.calc_center_median()],
                  [round(c, 3) for c in f.normal], [round(c, 3) for c in faces[f[orig]]["n"]], round(f.calc_area(), 7))
    if degenerate and os.environ.get("TM_RB_JOINT_DEBUG"):
        for f in bm.faces:
            if f[orig] in faces and f.calc_area() < 1e-8:
                print("DEGENERATE", ob.name, f[orig], [tuple(round(c, 4) for c in v.co) for v in f.verts])
    non_planar = 0
    for f in bm.faces:
        if f[orig] in faces and len(f.verts) > 3 and f.calc_area() >= 1e-8:
            c, n = f.calc_center_median(), f.normal
            non_planar += max(abs(n.dot(v.co - c)) for v in f.verts) > 1e-4
    # user fix 19: a module grid's faces are all flat stone (no curved pieces), and where a corner joint's ramp stops
    # under an uncut seam its pushed corner smoothed into the whole block beside it (a smear in Solid view): their
    # faces outside the arrises and joints shade flat
    flagged_arris = set(arris)
    flat_ids = [f.index for f in bm.faces if modules and f.material_index != joint_index and f.index not in flagged_arris
                and (faces.get(f[orig], {}).get("cell") or ("",))[0] in modules]
    # a round's segments turn less than the 30° sharp angle, so the flats beside it were smoothed into it and a narrow
    # face (the tree pits' corner chamfer) shaded as a bent column: every face touching a round keeps its own normal
    bm.faces.ensure_lookup_table()
    flat_ids += sorted({h.index for i in round_ids for v in bm.faces[i].verts for h in v.link_faces
                        if h.index not in flagged_arris} - set(flat_ids))
    bm.faces.layers.int.remove(orig)
    bm.transform(ob.matrix_world.inverted())
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    rounded = arris_normals([bm.faces[i] for i in arris], joint_index, {bm.faces[i] for i in round_ids})              # user fix 18: the arrises shade round
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    bm.to_mesh(me)
    bm.free()
    me.set_sharp_from_angle(angle=math.radians(30.0))
    if rounded or flat_ids:
        normals = [Vector(c.vector) for c in me.corner_normals]
        for fi, loops in rounded.items():
            for li, n in zip(me.polygons[fi].loop_indices, loops):
                normals[li] = n
        for fi in flat_ids:                                             # user fix 19: the module grid's flat faces
            for li in me.polygons[fi].loop_indices:
                normals[li] = Vector(me.polygons[fi].normal)
        me.normals_split_custom_set(normals)
    ob["rb_joints"] = json.dumps({k: jt[k] for k in ("width", "wall", "bevel", "bevel_depth", "depth", "panel_max", "course_target", "seed")
                                  if k in jt})

    # the layout record: original stone faces and the joint centre lines on them
    layout_faces = []
    seg = lambda a, b: [[round(c, 4) for c in a], [round(c, 4) for c in b]]  # noqa: E731
    for oid, rec in faces.items():
        lines = [seg(a, b) for zc in rec["z"] for a, b in polygon_line(rec["pts"], Vector((0, 0, 1)), zc)]
        lines += [seg(a, b) for t, sj in rec["v"] for a, b in polygon_line(rec["pts"], t, sj)]
        c0 = rec["n"].dot(rec["pts"][0])
        lines += [seg(t * sj + e * e0 + rec["n"] * c0, t * sj + e * e1 + rec["n"] * c0) for t, sj, e, e0, e1 in rec["s"]]
        lines += [seg(t * sj + e * e0 + rec["n"] * c0, t * sj + e * e1 + rec["n"] * c0)          # inside corners
                  for t, sj, e, e0, e1, _, _ in rec["i"] if abs(t.dot(e)) < 1e-6]
        layout_faces.append({"slot": rec["slot"], "n": [round(c, 4) for c in rec["n"]],
                             "pts": [[round(c, 4) for c in p] for p in rec["pts"]], "joints": lines})
    stats = {"stone_faces": len(faces), "course_planes": len(planes), "vertical_joints": sum(len(r["v"]) for r in faces.values()),
             "seam_joints": sum(len(r["s"]) for r in faces.values()),
             "bisects": cuts, "joint_floor_faces": floors, "corners": len(corners), "welded": welded, "arris_faces": len(rounded),
             "arris_edges": n_arris, "inside_faces": sum(1 for r in faces.values() if r["i"]), "strays": strays, "flipped": flipped,
             "panels": len(panels), "non_manifold": non_manifold,
             "degenerate_faces": degenerate, "non_planar_faces": non_planar}
    return stats, {"object": ob.name, "faces": layout_faces}


def build(plan):
    m = plan["materials"]
    dressed, missing, joint_mat = dress_materials(m)
    jt = dict(m["joints"], repeat_m=m["stone"]["repeat_m"])
    per_object, layout, skipped = {}, [], []
    root = bpy.data.collections.get(L.ROOT)
    named = [bpy.context.scene.objects.get(n) for n in jt.get("objects", {})]      # joints.objects, in any part
    todo = []
    for ob in sorted({*(root.all_objects if root else []), *[o for o in named if o is not None]}, key=lambda o: o.name):
        if ob.type != "MESH":
            continue
        if ob.get("rb_joints"):
            skipped.append(ob.name)
            continue
        todo.append(ob)
    # seams pair the objects cut in this run only: a piece already cut has moved its edges, so a layer rebuilt alone
    # gets its own half of a seam with a piece of another layer (target= rebuilds the whole part and cuts both halves)
    recs = stone_faces(todo, jt)
    grids, grid_stats = grid_layout(recs, jt)                  # user fix 11 / 13: the podium's regular block grid
    grid_stats["suppressed_seams"] = 0
    seams = seam_joints(recs, jt, grid_stats) if jt.get("seams") else {}
    contacts = None                             # user fix 18: the part's meshes (not the rig's ground), for the corners
    if (jt.get("corners") or jt.get("arrises") or jt.get("inside")) and todo:
        rig = bpy.data.collections.get("INSPECTION_RIG")
        rigged = set(rig.all_objects) if rig else set()
        contacts = Contacts([o for o in bpy.context.scene.objects if o.type == "MESH" and o not in rigged],
                            jt["corners"]["contact"])
    inside = inside_corners(recs, jt, contacts, grid_stats) if jt.get("inside") else {}   # user fix 18d addendum
    for ob in todo:
        stats, rec = cut_joints(ob, jt, joint_mat, seams.get(ob.name), grids.get(ob.name), contacts, inside.get(ob.name))
        if stats is None:
            continue
        per_object[ob.name] = stats
        layout.append(rec)
        for key in ("non_manifold", "degenerate_faces", "non_planar_faces"):
            if stats[key]:
                print(f"WARNING {ob.name}: {stats[key]} {key.replace('_', ' ')} after the joints")
    if layout:                                  # records are per part (the site's tree pits since 2026-10-14): keep the
        part = os.environ.get("TM_RB_PART", "building")         # other parts' and this part's pieces not cut again
        for rec in layout:
            rec["part"] = part
        old = L.C.load_json(JOINT_LAYOUT) if os.path.exists(JOINT_LAYOUT) else {"objects": []}
        keep = [o for o in old.get("objects", []) if o.get("part", "building") != part or o["object"] in skipped]
        os.makedirs(os.path.dirname(JOINT_LAYOUT), exist_ok=True)
        with open(JOINT_LAYOUT, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"joints": {k: jt[k] for k in ("width", "wall", "bevel", "bevel_depth", "depth", "panel_max", "course_target", "seed")
                                  if k in jt},
                       "objects": keep + layout}, fh)
    totals = {k: sum(s[k] for s in per_object.values())
              for k in ("vertical_joints", "seam_joints", "joint_floor_faces", "corners", "arris_faces", "arris_edges",
                        "inside_faces", "strays", "flipped", "panels",
                        "non_manifold", "degenerate_faces", "non_planar_faces")}
    return {"layer": LAYER, "dressed": len(dressed), "missing_slots": missing, "jointed_objects": len(per_object),
            "skipped_already_jointed": len(skipped), **totals, "grids": grid_stats, "per_object": per_object,
            "names": sorted(per_object)}
