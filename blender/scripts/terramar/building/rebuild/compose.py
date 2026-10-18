# compose.py -- the Terra & Mar building entry: links the five parts into terramar_building.blend.
#
#   blender -b --factory-startup --python compose.py              (build.py target=all runs it after the parts)
#
# The composition owns no geometry: it links each part's root collection (build.py PARTS), so it follows the parts
# whenever they are rebuilt and saved; rerun this only if the parts or their roots change. Its collections:
#   TERRAMAR_BUILDING  the single local root, holding TM_BUILDING, TM_PROPS, TM_INTERIORS, TM_WEAR and RB_SITE
#                     plus the local INSPECTION_RIG, RB_CAMERAS and RB_PLAN_GUIDES from build.py base_scene
# The wear switch (wear/controls.py) is set ON on the composition's scene with every feature at its default strength
# (the env TM_WEAR_MODE=off|on|debug overrides); wear.py switches a saved composition without recomposing.
# The poses (render_poses.py, tag "rebuild"), the audit and check_layers.py open this file. Linked data is read-only
# here: edit a part, never the composition.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
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
from common.collections import building_root
import wear  # noqa: E402
from wear import controls  # noqa: E402

for mod in (L, B):
    importlib.reload(mod)
wear.reload_all()

ROOT = "TERRAMAR_BUILDING"
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
    # EEVEE (Material Preview, Rendered EEVEE) filled the default 512 MB shadow pool (about 2900 of 2048 pages close
    # to the building) and dropped shadows; 1024 MB holds them
    scene.eevee.shadow_pool_size = '1024'
    local = building_root(scene, ROOT)
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
        local.children.link(coll)
        linked[part] = {"file": os.path.basename(path), "root": root, "objects": len(coll.all_objects)}
    mode = os.environ.get("TM_WEAR_MODE", WEAR_DEFAULT)
    linked["wear_switch"] = {"mode": mode, "strengths": controls.apply(scene, mode)}
    B.save(L.C.REBUILD_BLEND)
    print("COMPOSE", json.dumps(linked))
    print("BUILD composition", L.C.REBUILD_BLEND)
    return linked


if __name__ == "__main__":
    main()
