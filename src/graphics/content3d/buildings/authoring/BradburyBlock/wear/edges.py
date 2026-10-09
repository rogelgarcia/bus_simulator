# Render-time rounded edges (AI 576): a Cycles Bevel node in each exterior material, fed into the BSDF's normal after
# whatever already feeds it (the set's normal map, the wear layer's normal), so the meshes are never touched and every
# texture keeps its detail. Optionally the rounded edge reads a touch worn: slightly rougher and lighter, driven by how
# far the bevelled normal has turned from the unbevelled one -- a clean band along each arris, no noise.
#
# Everything is tuned from here and switched from the scene, as the wear layer's controls are (Attribute nodes of type
# View Layer, so they hold for the linked materials of the worn block):
#   edge_round   scale of every radius below; 0 = razor-sharp edges as before (the Bevel node then costs next to nothing)
#   edge_worn    strength of the worn-edge band (roughness up, colour lift); 0 = off
# build_scene.py sets both on the scene it builds (edges=<scale>, edge_worn=<strength> arguments); render_wear.py sets
# them on a saved scene before a render.
import re

SCENE_ROUND, SCENE_WEAR = "edge_round", "edge_worn"
DEFAULT_ROUND, DEFAULT_WEAR = 1.0, 1.0

# the radius (metres) of each material family's rounded edge at edge_round = 1, by wear/classes.py class name. A masonry
# arris is chipped to a few millimetres; the metal and paint of the frames and shopfronts are thinner sections.
RADIUS = {"brick": 0.010, "terracotta": 0.016, "stone": 0.020, "wood": 0.008, "paint": 0.006, "metal": 0.006, "glazed": 0.006}
# per material name (regex on the material's name) instead of its family: radius in metres, 0 = leave it sharp
OVERRIDE = [
    (r"^PORTAL_sandstone_carved(\.\d+)?$", 0.0),       # the carved capitals: their PBR atlas already breaks the edge
]
SAMPLES = 12                                            # the Bevel node's samples
# the worn band: where the bevelled normal differs from the plain one by more than WEAR_FROM (1 - dot) it starts, at
# WEAR_TO it is full; at edge_worn = 1 it adds ROUGH_ADD to the roughness and makes the colour LIFT brighter in its own hue
WEAR_FROM, WEAR_TO = 0.01, 0.08
ROUGH_ADD, LIFT = 0.12, 0.10

NAME = "EDGE_round"


def radius_for(mat, cls_name):
    for rx, r in OVERRIDE:
        if re.match(rx, mat.name): return r
    return RADIUS.get(cls_name, 0.0)


def round_material(mat, cls_name):
    """Bevel + worn band into mat. Returns (done, why)."""
    nt = mat.node_tree
    r = radius_for(mat, cls_name)
    if nt is None: return False, "no node tree"
    if r <= 0.0: return False, "kept sharp"
    if any(n.name == NAME for n in nt.nodes): return False, "already rounded"
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if out is None or not out.inputs['Surface'].is_linked: return False, "no active surface output"
    bsdf = out.inputs['Surface'].links[0].from_node
    if bsdf.type != 'BSDF_PRINCIPLED': return False, f"surface is a {bsdf.type}, not a Principled BSDF"
    x, y = bsdf.location.x - 900, bsdf.location.y - 600
    def node(t, dx, dy, **kw):
        n = nt.nodes.new(t); n.location = (x + dx, y + dy)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def link(a, b): nt.links.new(a, b)

    scale = node('ShaderNodeAttribute', 0, 0, attribute_type='VIEW_LAYER', attribute_name=SCENE_ROUND)
    rad = node('ShaderNodeMath', 200, 0, operation='MULTIPLY'); rad.inputs[1].default_value = r
    link(scale.outputs['Fac'], rad.inputs[0])
    bev = node('ShaderNodeBevel', 400, 0); bev.name = NAME; bev.label = f"edge round {r * 1000:g} mm"
    bev.samples = SAMPLES
    link(rad.outputs[0], bev.inputs['Radius'])
    ni = bsdf.inputs['Normal']
    if ni.is_linked:
        n0 = ni.links[0].from_socket
        link(n0, bev.inputs['Normal'])
    else:
        n0 = node('ShaderNodeNewGeometry', 200, -200).outputs['Normal']      # the unbevelled shading normal to compare against
    link(bev.outputs['Normal'], ni)

    # the worn band: 1 - dot(unbevelled, bevelled), ramped, times edge_worn
    dot = node('ShaderNodeVectorMath', 600, -200, operation='DOT_PRODUCT')
    link(n0, dot.inputs[0]); link(bev.outputs['Normal'], dot.inputs[1])
    ramp = node('ShaderNodeMapRange', 800, -200, clamp=True)
    ramp.inputs['From Min'].default_value, ramp.inputs['From Max'].default_value = 1.0 - WEAR_FROM, 1.0 - WEAR_TO
    link(dot.outputs['Value'], ramp.inputs['Value'])
    wear = node('ShaderNodeAttribute', 800, -400, attribute_type='VIEW_LAYER', attribute_name=SCENE_WEAR)
    band = node('ShaderNodeMath', 1000, -200, operation='MULTIPLY', use_clamp=True)
    link(ramp.outputs['Result'], band.inputs[0]); link(wear.outputs['Fac'], band.inputs[1])
    # also zero where the radius is zero (edge_round = 0): the dot is then exactly 1 and the band is already 0
    for sock, kind in (("Roughness", 'ROUGH'), ("Base Color", 'COLOR')):
        bi = bsdf.inputs[sock]
        if kind == 'ROUGH':
            add = node('ShaderNodeMath', 1200, -200, operation='MULTIPLY_ADD', use_clamp=True)
            link(band.outputs[0], add.inputs[0]); add.inputs[1].default_value = ROUGH_ADD
            if bi.is_linked: link(bi.links[0].from_socket, add.inputs[2])
            else: add.inputs[2].default_value = bi.default_value
            link(add.outputs[0], bi)
        else:
            # toward the surface's own colour LIFT brighter, not toward white: a mix toward white desaturated the
            # terracotta into a chalky line (2026-10-07, "the line is too white")
            mix = node('ShaderNodeMix', 1200, -500, data_type='RGBA', blend_type='MULTIPLY', clamp_result=True)
            link(band.outputs[0], mix.inputs[0])
            if bi.is_linked: link(bi.links[0].from_socket, mix.inputs[6])
            else: mix.inputs[6].default_value = bi.default_value
            mix.inputs[7].default_value = (1.0 + LIFT, 1.0 + LIFT, 1.0 + LIFT, 1.0)
            link(mix.outputs[2], bi)
    mat["edge_radius_m"] = r
    return True, f"{r * 1000:g} mm"


def round_objects(objs, classify, names, log=print):
    """Round every local material these objects render with, once each. `classify` is wear/classes.classify and `names`
    its NAMES. A linked material (the block's portal) is rounded where it lives. Returns {material: (class, done, why)}."""
    done = {}
    for o in objs:
        for slot in getattr(o, "material_slots", []):
            m = slot.material
            if m is None or m.library is not None or m.name_full in done: continue
            cls, _ = classify(m)
            if cls == 0: continue
            ok, how = round_material(m, names[cls]); done[m.name_full] = (names[cls], ok, how)
    return done


def apply(scene, scale=DEFAULT_ROUND, wear=DEFAULT_WEAR, log=print):
    scene[SCENE_ROUND] = float(scale); scene[SCENE_WEAR] = float(wear)
    log(f"edges: round x{scale:g}, worn band {wear:g}")


def parse(args, scene=None):
    """(round scale, worn strength) from edges=on|off|<scale> and edge_worn=<strength>; unnamed ones keep the scene's."""
    sc = float(scene.get(SCENE_ROUND, DEFAULT_ROUND)) if scene is not None else DEFAULT_ROUND
    wr = float(scene.get(SCENE_WEAR, DEFAULT_WEAR)) if scene is not None else DEFAULT_WEAR
    e = args.get("edges")
    if e is not None:
        sc = {"on": 1.0, "off": 0.0}.get(e.lower()) if e.lower() in ("on", "off") else float(e)
    if "edge_worn" in args: wr = float(args["edge_worn"])
    return sc, wr
