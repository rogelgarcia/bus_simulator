# Each pane its own glass (AI 608, the fourth step of the weathering-realism group AI 605-610). Every pane of the block
# was perfectly flat, aligned with its neighbours and of one glass, so a run of windows reflected one continuous
# gradient of sky. In an old building no two panes are coplanar: each sits at its own slight angle in its sash and has
# its own faint tint and polish, so each reflects a slightly different piece of the sky and the street. The owner's
# suggested weathered version of the top floor (2026-10-10) asks for "more natural glass reflections".
#
# THE PANES: the glass faces of every window object, a pane being a connected piece of glass (apply() numbers them per
# mesh, the game's window meshes being shared by many windows) and its window the object it belongs to (Cycles' Object
# Info Random, one value per object and per instance). Their pair is the pane's key, so every pane on the block draws its
# own values, the same in every render.
#
# THE VARIATION, per pane and seeded: its normal tilted by up to TILT either way about two axes in its own plane (the
# geometry stays flat; only what it reflects moves), its roughness by up to ROUGH either way, its tint by up to TINT on
# green against blue (old glass runs from greenish to neutral). The glass grime (AI 571), the transmission and the
# interiors behind the panes are untouched.
#
# CONTROLS: the strength wear_pane_glass (scales all three; 0: off, the look before AI 608 exactly), wear_pane_glass_tilt
# and wear_pane_glass_vary (the tilt alone, roughness and tint alone), and the group switch wear_realism.
import math
from .. import classes

NAME = "pane_glass"
AI = 608
LABEL = "each pane its own glass"
ORDER = 290                       # the glass as glazed, under the glass grime (300)
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.20, 0.85, 0.95)
CONTROLS = {"tilt": 1.0, "vary": 1.0}

# Calibrated 2026-10-11 from a sweep (0.6 deg, 0.015, 3 % x 0 / 1 / 2 / 3): about x2, the tint a little under, the
# owner's rule for these effects being a balance that changes the look without being clearly visible or outstanding
TILT = math.radians(1.2)          # a pane's tilt either way about each of two axes in its plane, at strength 1
ROUGH = 0.03                      # its roughness, either way
TINT = 0.045                      # its tint: green x (1 + t), blue x (1 - t)


def build(ctx):
    ctx.log(f"   pane_glass: per pane (connected glass of a window object) a tilt up to {math.degrees(TILT):.2f} deg, "
            f"roughness +-{ROUGH}, tint +-{TINT:.0%}; numbered in apply()")


def _number_panes(objs, log, where):
    done, n_mesh, n_pane = set(), 0, 0
    for o in objs:
        if o.type != 'MESH' or o.library is not None or o.data is None: continue
        me = o.data
        if me.library is not None or me.name in done: continue
        glass = {i for i, s in enumerate(o.material_slots) if s.material and classes.classify(s.material)[0] == classes.GLASS}
        if not glass: continue
        done.add(me.name)
        parent = list(range(len(me.vertices)))
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        polys = [p for p in me.polygons if p.material_index in glass]
        for p in polys:
            vs = list(p.vertices)
            for v in vs[1:]:
                a, b = find(vs[0]), find(v)
                if a != b: parent[a] = b
        ids, vals = {}, [0.0] * len(me.polygons)
        for p in polys:
            r = find(p.vertices[0])
            vals[p.index] = float(ids.setdefault(r, len(ids) + 1))
        nm = "wear_" + NAME                          # on the mesh itself: shared meshes keep one numbering, the object
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])      # random tells their windows apart
        at = me.attributes.new(nm, 'FLOAT', 'FACE'); at.data.foreach_set("value", vals)
        n_mesh += 1; n_pane += len(ids)
    log(f"   pane_glass: {n_pane} panes numbered on {n_mesh} glass meshes in the {where}")


def apply(actx):
    import bpy
    _number_panes([o for o in bpy.data.objects if o.library is None], actx.log, "block")


def apply_portal(actx):
    import bpy
    _number_panes([o for o in bpy.data.objects if o.library is None], actx.log, "portal")


def shader(g):
    pane = g.i("Attr")
    rnd = g.node('ShaderNodeObjectInfo').outputs['Random']
    wn = g.node('ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    g.set(wn.inputs['Vector'], g.vec(pane, g.mul(rnd, 1000.0), 17.0))
    r1, r2, r3 = g.sep(wn.outputs['Color'])
    wn2 = g.node('ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    g.set(wn2.inputs['Vector'], g.vec(pane, g.mul(rnd, 1000.0), 41.0))
    r4 = wn2.outputs['Value']
    sgn = lambda r: g.sub(g.mul(r, 2.0), 1.0)
    on = g.mul(g.mul(g.gt(pane, 0.5), g.is_class(classes.GLASS)), g.attr("wear_realism"))
    k = g.mul(g.i("Strength"), on)
    kt = g.mul(k, g.control("tilt")); kv = g.mul(k, g.control("vary"))
    # the tilt: two axes in the pane's own plane, a level one and the one across it
    N = g.i("Normal")
    t1 = g.vmath('NORMALIZE', g.vmath('CROSS_PRODUCT', N, g.vec(0.0, 0.0, 1.0)))
    t2 = g.vmath('CROSS_PRODUCT', t1, N)
    off = g.vmath('ADD', g.vmath('SCALE', t1, scale=g.mul(sgn(r1), g.mul(kt, TILT))),
                  g.vmath('SCALE', t2, scale=g.mul(sgn(r2), g.mul(kt, TILT))))
    tilted = g.vmath('NORMALIZE', g.vmath('ADD', N, off))
    g.o("Normal", g.mix(N, tilted, g.gt(kt, 0.0), 'VECTOR'))         # a factor of 0 hands the normal on exactly
    R = g.i("Roughness")
    g.o("Roughness", g.mix(R, g.mx(g.add(R, g.mul(sgn(r3), g.mul(kv, ROUGH))), 0.0), g.gt(kv, 0.0)))
    col = g.i("Color")
    t = g.mul(sgn(r4), g.mul(kv, TINT))
    tinted = g.mix(col, g.rgb(1.0, g.add(1.0, t), g.sub(1.0, t)), 1.0, 'RGBA', 'MULTIPLY')
    g.o("Color", g.mix(col, tinted, g.gt(kv, 0.0), 'RGBA'))
    g.o("Debug", g.mul(g.gt(pane, 0.5), r1))
