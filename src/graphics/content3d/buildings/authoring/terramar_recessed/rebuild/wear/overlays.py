# The wear part's one layer, `wear_overlays` (build.py PARTS["wear"], terramar_wear.blend, root TM_WEAR): geometry
# that only exists when worn (runoff-streak decals, ...), built from each feature's optional overlays(ctx) into its own
# collection TM_WEAR_<NAME> under the root, plus TM_WEAR_DEBUG (markers shown in the debug view only). Every rerun
# empties and rebuilds them. With no feature defining overlays() the part is empty but valid: TM_WEAR and its debug
# child exist, so the composition links and switches them all the same.
#
# The composition links TM_WEAR under TERRAMAR_REBUILD (so the audit sees the overlays) and controls.apply() excludes
# it from the view layer while the switch is off, and a feature's TM_WEAR_<NAME> while its strength is 0; an overlay's
# material (nodes.overlay_material, or a feature's own) also reads the switch and scales with the strength, alpha 0
# when off, in case a scene renders the collection anyway. A rerun drops the collections of features no longer
# registered or without overlays.
#
# Overlay rules: decals sit 4 mm proud of the surface they mark (OverlayContext.PROUD; the audit counts same-facing
# faces within 3 mm as coplanar), never coplanar with it, and must leave the audit at 0 z-fights / 0 penetrations;
# images are generated locally into tests/artifacts/blender/terramar_recessed/rebuild/wear/ (OverlayContext.image_dir)
# and saved with relative paths.
import os

import bpy

from . import controls, registry

LAYER = "wear_overlays"


class OverlayContext:
    """ctx.plan / ctx.feature / ctx.collection (TM_WEAR_<NAME>) / ctx.debug (TM_WEAR_DEBUG)
    ctx.add(name, mesh, debug=False)       link a new object into the feature's collection (or the debug one)
    ctx.material(name, rgb, ...)           nodes.overlay_material for this feature
    ctx.image_dir                          where the feature's generated images go (created on demand)"""
    PROUD = 0.004                  # over the audit's 3 mm coplanar distance

    def __init__(self, plan, feature, collection, debug, rebuild_dir):
        self.plan, self.feature, self.collection, self.debug = plan, feature, collection, debug
        self.image_dir = os.path.join(rebuild_dir, "wear", feature.NAME)

    def add(self, name, mesh, debug=False):
        ob = bpy.data.objects.new(name, mesh)
        (self.debug if debug else self.collection).objects.link(ob)
        ob["tm_wear_overlay"] = self.feature.NAME
        return ob

    def material(self, name, rgb, roughness=0.8, image=None):
        from . import nodes
        return nodes.overlay_material(name, self.feature.NAME, rgb, roughness, image)


def build(plan, L):
    """Rebuild TM_WEAR's children from the features' overlays(); L is rb_lib (its ROOT is TM_WEAR here)."""
    root = L.ensure_collection(L.ROOT)
    debug = L.layer_collection(controls.DEBUG)
    made, names = {}, []
    feats = registry.features()
    keep = {f"{controls.OVERLAYS}_{f.NAME}" for f in feats if hasattr(f, "overlays")} | {controls.DEBUG}
    for old in [c for c in root.children if c.name.startswith(controls.OVERLAYS + "_") and c.name not in keep]:
        L.clear_collection(old)                 # a feature without overlays, or no longer registered: no stale decals
        bpy.data.collections.remove(old)
    for f in feats:
        cname = f"{controls.OVERLAYS}_{f.NAME}"
        if not hasattr(f, "overlays"):
            continue
        coll = L.layer_collection(cname)
        ctx = OverlayContext(plan, f, coll, debug, L.C.REBUILD_DIR)
        made[f.NAME] = f.overlays(ctx) or {}
        made[f.NAME]["objects"] = len(coll.objects)
        names += [o.name for o in coll.objects]
    return {"layer": LAYER, "root": root.name, "features": made, "debug_objects": len(debug.objects), "names": names}
