# Dust in the carving's recesses (AI 606, the second step of the weathering-realism group AI 605-610): the darker dirt
# that settles in the hollows of an old facade's relief and stays there, which is what gives carving its depth. On the
# owner's suggested weathered version of the top floor (2026-10-10) the frieze's scrolls, the gaps between the dentils
# and the undersides of the brackets hold grime while the faces around them stay clean; on the model every hollow was
# as clean as the faces.
#
# THE SOURCES are the relief itself, of two kinds, with one rule (dust in a hollow, none on a face or an outer edge):
#   MODELLED relief -- the dentils and the cornice's mouldings, the brackets, the archivolts' and the sills' mouldings,
#     every inner corner where a moulding meets the wall -- from the geometry at render time: Cycles' ambient
#     occlusion over a few centimetres (REACH_M), so only a tight hollow reads as one, never a wall under a cornice.
#   TEXTURE relief -- the frieze's flower tiles, the medallion band, the portal's lettering and frieze flowers, whose
#     carving is drawn in their maps -- from the set's own height map (the layer's Grain input: 0 at the set's deepest
#     5%, 1 at its highest): the lowest of it is a recess. Only on those sets (ORNAMENT, tagged per face by apply() as
#     this feature's attribute), since every other set's height holds pores and grain, which as dirt would speckle.
# The carved stage-2 capitals are an unclassed material the layer leaves alone, so they keep their own baked AO.
#
# NO PATTERN: nothing here is placed; the dirt is wherever the relief is hollow, and its irregularity is the relief's
# own (and, at a moulding's corner, the joints' and the maps' under it).
#
# THE LOOK is soiling's deposit (AI 565), the dirt of the same city: the surface's own colour darkened and greyed toward
# a warm grey-brown, a little matter. A hollow that faces up (dust settles) or down (out of the rain) holds a little
# more than one that faces the street, which the rain reaches.
#
# CONTROLS: the strength wear_cavity (0: off, the look before AI 606 exactly), how far into the relief it reaches
# wear_cavity_reach (a scale of REACH_M; 0 also turns the modelled side off), and the group switch wear_realism.
import re
from .. import classes

NAME = "cavity"
AI = 606
LABEL = "dust in the carving's recesses"
ORDER = 205                      # a deposit, right after soiling (200), whose dirt it is; under runoff and the rest
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.95, 0.45, 0.10)
CONTROLS = {"reach": 1.0}

ORNAMENT = re.compile(r"^(PBR_bradbury_(flower_tiles|top_band_terracotta_ornament)|PORTAL_(lettering|frieze_flowers))(\.\d+)?$")

# ---------------------------------------------------------------------------------------------------- the hollows
REACH_M = 0.06                   # the occlusion's reach at wear_cavity_reach 1: a dentil gap, a moulding's quirk
AO_SAMPLES = 8
GEO = (0.12, 0.65)               # a point occluded this much (1 - AO) starts to hold dust, and holds it fully here
TEX = (0.38, 0.10)               # an ornament set's Grain: dust starts below the first, full at the second
CLASS_SHARE = {classes.TERRACOTTA: 1.0, classes.STONE: 1.0, classes.BRICK: 0.55}   # the brick's corners hold less
ORIENT = (0.75, 1.0)             # a hollow facing the street takes the first share, one facing up or down the second

# ---------------------------------------------------------------------------------------------------- the look
AMOUNT = 0.22                    # at strength 1 a full hollow goes this far toward DIRT: the owner, on the sweep of
                                 # 2026-10-11 (0.55 x 0.6 / 1 / 1.6), "use a more subtle approach; value 1 or even less": 0.8 x 0.55;
                                 # halved 2026-10-12 ("some dark black powder ... like asphalt ... reduce the effect by 50%")
DIRT_DARK = 0.45                 # soiling's deposit: DIRT keeps this share of the surface's own colour ...
DIRT_GREY = 0.45                 # ... after losing this much of its saturation toward a warm grey-brown
DIRT_TINT = (1.00, 0.95, 0.88)
MATTE = 0.85


def build(ctx):
    # the relief is the model's own and is read at render time: nothing to measure or paint here
    ctx.log("   cavity: modelled relief by render-time occlusion (reach "
            f"{REACH_M * 100:.0f} cm), texture relief on the ornament sets' height maps")


def _tag(actx, objs, where):
    n_obj = n_face = 0
    for o in objs:
        if o.type != 'MESH' or o.library is not None or o.data is None: continue
        names = [s.material.name if s.material else "" for s in o.material_slots]
        hits = {i for i, nm in enumerate(names) if ORNAMENT.match(nm)}
        if not hits: continue
        vals = [1.0 if p.material_index in hits else 0.0 for p in o.data.polygons]
        actx.set_attribute(o, vals, domain='FACE')
        n_obj += 1; n_face += int(sum(vals))
    actx.log(f"   cavity: {n_obj} objects in the {where} carry an ornament set ({n_face} faces tagged)")


def apply(actx):
    import bpy
    _tag(actx, [o for o in bpy.data.objects if o.library is None], "block")


def apply_portal(actx):
    import bpy
    _tag(actx, [o for o in bpy.data.objects if o.library is None], "portal")


def shader(g):
    # the modelled hollows: occlusion over REACH_M x reach (absent or 0: no reach, no occlusion)
    ao = g.node('ShaderNodeAmbientOcclusion', samples=AO_SAMPLES, inside=False, only_local=False)
    g.set(ao.inputs['Color'], (1.0, 1.0, 1.0, 1.0))
    g.set(ao.inputs['Distance'], g.mul(g.control("reach"), REACH_M))
    geo = g.smooth(GEO[0], GEO[1], g.one_minus(ao.outputs['AO']))
    # the drawn hollows: the low of an ornament set's own height, on the faces apply() tagged
    tex = g.mul(g.clamp(g.i("Attr")), g.smooth(TEX[0], TEX[1], g.i("Grain")))
    cav = g.mx(geo, tex)
    share = None
    for c, k in CLASS_SHARE.items():
        term = g.mul(g.eq(g.i("Class"), float(c)), k)
        share = term if share is None else g.add(share, term)
    orient = g.add(ORIENT[0], g.mul(ORIENT[1] - ORIENT[0], g.mx(g.upward(0.3, 0.7), g.downward(0.3, 0.7))))
    v = g.mul(g.mul(cav, share), orient)
    amt = g.mul(v, g.mul(g.mul(g.i("Strength"), g.attr("wear_realism")), AMOUNT))
    col = g.i("Color")
    y = g.lum(col)
    deposit = g.rgb(g.mul(y, DIRT_TINT[0]), g.mul(y, DIRT_TINT[1]), g.mul(y, DIRT_TINT[2]))
    dirt = g.scale_rgb(g.mix(col, deposit, DIRT_GREY, 'RGBA'), DIRT_DARK)
    g.o("Color", g.mix(col, dirt, amt, 'RGBA'))
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), MATTE), amt))
    g.o("Debug", g.clamp(g.mul(cav, g.gt(share, 0.0))))
