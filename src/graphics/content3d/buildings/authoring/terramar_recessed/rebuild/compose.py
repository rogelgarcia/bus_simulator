# compose.py -- the Terra & Mar composition (2026-10-14): links the part files' roots into terramar_composition.blend.
#
#   blender -b --factory-startup --python compose.py              (build.py target=all runs it after the parts)
#
# The composition owns no geometry: it links each part's root collection (build.py PARTS), so it follows the parts
# whenever they are rebuilt and saved; rerun this only if the parts or their roots change. Its collections:
#   TERRAMAR_REBUILD  local, holding the linked TM_BUILDING, TM_PROPS, TM_INTERIORS and (when built) TM_WEAR, the wear
#                     module's overlays: the audit's and the checks' root
#   RB_SITE           linked from the site part beside it (audit it with root=RB_SITE)
#   INSPECTION_RIG, RB_CAMERAS, RB_PLAN_GUIDES   the base scene, local (build.py base_scene)
# The wear switch (wear/controls.py) is set ON on the composition's scene with every feature at its default strength
# (the env TM_WEAR_MODE=off|on|debug overrides); wear.py switches a saved composition without recomposing.
# The poses (render_poses.py, tag "rebuild"), the audit and check_layers.py open this file. Linked data is read-only
# here: edit a part, never the composition.
import importlib
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import build as B  # noqa: E402
import rb_lib as L  # noqa: E402
import wear  # noqa: E402
from wear import controls  # noqa: E402

for mod in (L, B):
    importlib.reload(mod)
wear.reload_all()

ROOT = "TERRAMAR_REBUILD"
OPTIONAL = ("wear",)              # composed when built: the wear part (overlays) may not exist yet
WEAR_DEFAULT = "on"               # the user wants the building weathered; wear.py switches a saved composition


def main():
    if bpy.data.filepath:
        raise SystemExit("compose.py builds the composition from scratch: run it with --factory-startup and no file")
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    plan = L.load_plan()
    B.base_scene(plan)
    scene = bpy.context.scene
    local = bpy.data.collections.new(ROOT)
    scene.collection.children.link(local)
    linked = {}
    for part, (root, _) in B.PARTS.items():
        path = B.part_path(part)
        if not os.path.exists(path):
            if part in OPTIONAL:
                print(f"COMPOSE: no {os.path.basename(path)} yet (build.py target={part}); composed without it")
                continue
            raise SystemExit(f"missing part {path}: build it first (build.py target={part})")
        with bpy.data.libraries.load(path, link=True) as (src, dst):
            if root not in src.collections:
                raise SystemExit(f"{path} has no collection {root}")
            dst.collections = [root]
        coll = dst.collections[0]
        (scene.collection if part == "site" else local).children.link(coll)
        linked[part] = {"file": os.path.basename(path), "root": root, "objects": len(coll.all_objects)}
    mode = os.environ.get("TM_WEAR_MODE", WEAR_DEFAULT)
    linked["wear_switch"] = {"mode": mode, "strengths": controls.apply(scene, mode)}
    B.save(L.C.REBUILD_BLEND)
    print("COMPOSE", json.dumps(linked))
    print("BUILD composition", L.C.REBUILD_BLEND)
    return linked


if __name__ == "__main__":
    main()
