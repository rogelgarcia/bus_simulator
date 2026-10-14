# compose.py -- the Terra & Mar composition (2026-10-14): links the part files' roots into terramar_composition.blend.
#
#   blender -b --factory-startup --python compose.py              (build.py target=all runs it after the parts)
#
# The composition owns no geometry: it links each part's root collection (build.py PARTS), so it follows the parts
# whenever they are rebuilt and saved; rerun this only if the parts or their roots change. Its collections:
#   TERRAMAR_REBUILD  local, holding the linked TM_BUILDING, TM_PROPS and TM_INTERIORS: the audit's and the checks' root
#   RB_SITE           linked from the site part beside it (audit it with root=RB_SITE)
#   INSPECTION_RIG, RB_CAMERAS, RB_PLAN_GUIDES   the base scene, local (build.py base_scene)
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

for mod in (L, B):
    importlib.reload(mod)

ROOT = "TERRAMAR_REBUILD"


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
        path = L.C.REBUILD_PARTS[part]
        if not os.path.exists(path):
            raise SystemExit(f"missing part {path}: build it first (build.py target={part})")
        with bpy.data.libraries.load(path, link=True) as (src, dst):
            if root not in src.collections:
                raise SystemExit(f"{path} has no collection {root}")
            dst.collections = [root]
        coll = dst.collections[0]
        (scene.collection if part == "site" else local).children.link(coll)
        linked[part] = {"file": os.path.basename(path), "root": root, "objects": len(coll.all_objects)}
    B.save(L.C.REBUILD_BLEND)
    print("COMPOSE", json.dumps(linked))
    print("BUILD composition", L.C.REBUILD_BLEND)
    return linked


if __name__ == "__main__":
    main()
