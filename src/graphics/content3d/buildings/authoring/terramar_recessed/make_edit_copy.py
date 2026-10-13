# make_edit_copy.py -- create the EDITABLE copy of the Terra & Mar baseline (AI 615 setup).
#
#   blender -b --factory-startup -P make_edit_copy.py
#
# Opens the as-extracted baseline (tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend,
# never changed) and saves it as tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend, the one
# file the improvement prompts (AI 615+) edit. REFUSES to run when the edit file already exists, so an edited copy is
# never overwritten: delete or rename it by hand to start over.
#
# What the copy adds to the baseline (nothing of the building changes):
#   TERRAMAR/TM_EDIT_EXTERIOR, TM_EDIT_INTERIOR, TM_EDIT_PROPS   empty collections for new building parts (linkable
#                                                                 with TERRAMAR by a future render/city scene)
#   TM_SITE            scene root: street-level dressing in front of the building (cafe, palms); not part of TERRAMAR
#   TM_REPLACED        scene root, hidden: game parts an edit sets aside instead of deleting (reversible, auditable)
#   REFERENCE_AI_MODELS scene root, hidden: REF_AI_SMART linked from reference_models/terramar_ai_reference_models.blend
#                       (the 1.9M-face REF_AI_DENSE stays in that file; open it there when needed)
import datetime
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402


def main():
    if os.path.exists(C.EDIT_BLEND):
        raise SystemExit(f"REFUSED: {C.EDIT_BLEND} already exists (it may hold edits). Delete or rename it by hand to start over.")
    assert os.path.exists(C.BASELINE), "build the baseline first (import_baseline.py)"
    bpy.ops.wm.open_mainfile(filepath=C.BASELINE)
    scene = bpy.context.scene
    scene.name = "TERRAMAR_EDIT"
    scene["tm_edit_source"] = os.path.relpath(C.BASELINE, C.ROOT).replace("\\", "/")
    scene["tm_edit_created"] = datetime.date.today().isoformat()

    root = bpy.data.collections["TERRAMAR"]
    for name in ("TM_EDIT_EXTERIOR", "TM_EDIT_INTERIOR", "TM_EDIT_PROPS"):
        root.children.link(bpy.data.collections.new(name))
    site = bpy.data.collections.new("TM_SITE")
    scene.collection.children.link(site)
    replaced = bpy.data.collections.new("TM_REPLACED")
    scene.collection.children.link(replaced)
    replaced.hide_render = True
    replaced.hide_viewport = True

    os.makedirs(C.EDIT_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=C.EDIT_BLEND, relative_remap=True)   # so the library path below is relative

    refs = bpy.data.collections.new("REFERENCE_AI_MODELS")
    scene.collection.children.link(refs)
    refs.hide_render = True
    if os.path.exists(C.REF_MODELS_BLEND):
        with bpy.data.libraries.load(C.REF_MODELS_BLEND, link=True, relative=True) as (src, dst):
            dst.collections = [n for n in src.collections if n == "REF_AI_SMART"]
        for coll in dst.collections:
            inst = bpy.data.objects.new(coll.name, None)
            inst.instance_type = 'COLLECTION'
            inst.instance_collection = coll
            refs.objects.link(inst)
    bpy.context.view_layer.layer_collection.children["REFERENCE_AI_MODELS"].hide_viewport = True

    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.ops.wm.save_as_mainfile(filepath=C.EDIT_BLEND, compress=True, relative_remap=True)
    print("EDIT COPY DONE", C.EDIT_BLEND, {c.name: len(c.all_objects) for c in scene.collection.children})


if __name__ == "__main__":
    main()
