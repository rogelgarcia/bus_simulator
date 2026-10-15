# The Terra & Mar wear and weathering module (2026-10-14): non-destructive, switchable, one switch for every part.
#
# Three layers, none of which changes a layer's geometry or a material's own look:
#   shader     one node group, TM_WEAR_layer, spliced into each exterior material between its own outputs and its
#              Principled BSDF by the finishing pass layer_wear.py (after layer_materials.py); it passes the surface
#              through every feature's group TM_WEAR_F_<name> in ORDER and mixes the result back by a factor that is 0
#              when the switch is off, so off is today's shading bit for bit
#   signals    per-vertex / per-face FLOAT attributes tm_wear_<signal> the pass writes on the exterior meshes (extra
#              data only): ground, level, sky, panel, and a feature's own attributes
#   overlays   geometry that only exists when worn, in the wear part terramar_wear.blend (root TM_WEAR); the
#              composition excludes it from the view layer while the switch is off
# The switch and the strengths are custom properties of the RENDERING scene (tm_wear 0 off / 1 on / 2 debug, and
# tm_wear_<feature>), read by Attribute nodes of type View Layer: absent reads 0, so a scene that sets nothing renders
# exactly as before, and the composition's scene drives every linked part.
#
#   controls.py   the switch, the strengths, the overlay visibility (apply / clear / parse)
#   classes.py    material slot -> wear class (stone, paving, joint, ...); interior materials get no group
#   context.py    WearContext: the part being worn, its exterior objects, the plan's walking surfaces, the ray scene
#                 (the part's own geometry + plan proxies of the other parts), per-object mesh copies
#   signals.py    the framework's geometry signals (ground, level, sky, panel) written as tm_wear_<signal>
#   nodes.py      the node expression builder, TM_WEAR_layer / TM_WEAR_F_<name>, insert(mat, cls) / remove(mat), the
#                 debug clay view, the overlay material helper
#   registry.py   the features, in ORDER (the contract a feature module follows is in the README and registry.py)
#   overlays.py   the wear part's one layer: TM_WEAR built from the features' overlays()
#   scratch.py    a private copy of the part files for trying a feature (relative paths remapped)
#   sheets.py     [b8 crop | off | on | debug] sheets and exact-difference numbers between two render tags
#   features/     one module per feature
#
# Rule #1 (the user's, rejected twice otherwise): no noise, no random scatter. Every mark has a physical reason and a
# place (where water drips, splashes, collects or rinses, where dust settles, where sun bleaches); variation between
# instances comes from deterministic per-instance seeds (a stone panel, a pane, a post), never from a noise texture.
import importlib
import sys

BASE = ("classes", "context", "signals", "nodes")         # what a feature module may import
REST = ("registry", "controls", "overlays")               # what imports the features


def reload_all():
    """A headed Blender session keeps modules imported by earlier runs: reload the package's modules in dependency
    order (the base, then the features, then what imports them)."""
    def again(name):
        mod = sys.modules.get(f"{__name__}.{name}")
        if mod is not None:
            importlib.reload(mod)
    for name in BASE:
        again(name)
    for name in sorted(n for n in list(sys.modules) if n.startswith(__name__ + ".features.")):
        importlib.reload(sys.modules[name])
    for name in REST:
        again(name)
