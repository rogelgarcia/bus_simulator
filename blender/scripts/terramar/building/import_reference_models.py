# import_reference_models.py -- the user's two AI-generated 3D models of the reference, fitted to the building (AI 615 setup).
#
#   blender -b --factory-startup -P import_reference_models.py
#
# The models were generated automatically from the reference image (user, 2026-10-12): not sharp, invented detail in
# places, an EXTRA source of information only -- never geometry to copy. Sources (zips in the user's Downloads, each
# extracted unmodified into its own folder under tests/artifacts/blender/terramar_recessed/reference_models/):
#   dense/  "modern building 3d model terra mar.zip": 945k vertices, PBR maps (basecolor/normal/roughness/metallic);
#           sharper facade texture, includes the street, cafe umbrellas, palms, lamp posts; invents copies of the sign
#           on other faces and a glass dome on the +x side; no penthouse; flat roof.
#   smart/  "modern+apartment+building+3d+model+terramar_smart.zip" (Tripo): 26k vertices, one texture atlas;
#           storefront awnings, balcony plants, a planted roof ring (open in the middle); no penthouse.
# Both come in normalized to about one unit with the sign side already facing -Y (the baseline's front).
#
# Fit: uniform scale from the residential tower's width (the model's x extent in a horizontal slice at 45-60 % of its
# height, matched to the baseline's 25.4 m over the residential belts), centred on that slice in x and y, the model's
# lowest point on the street (z 0). The result is approximate; the fit report gives the residual heights.
# Writes reference_models/terramar_ai_reference_models.blend (collections REF_AI_DENSE, REF_AI_SMART) + .fit.json.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import json
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402

MODELS = {
    "REF_AI_DENSE": "dense/modern+building+3d+model+terra+mar.obj",
    "REF_AI_SMART": "smart/tripo_convert_c9e2f609-779c-418b-9440-a3fd57c91152.obj",
}
TOWER_WIDTH_M = 25.4                       # baseline residential belts, x -12.7 .. 12.7
BASELINE_ROOF_Z, BASELINE_TOP_Z = 27.862, 32.162


def slice_extent(obj, lo_frac=0.45, hi_frac=0.60):
    mw = obj.matrix_world
    pts = [mw @ v.co for v in obj.data.vertices]
    z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
    a, b = z0 + (z1 - z0) * lo_frac, z0 + (z1 - z0) * hi_frac
    band = [p for p in pts if a <= p.z <= b]
    xs, ys = [p.x for p in band], [p.y for p in band]
    return {"z_min": z0, "z_max": z1, "x": (min(xs), max(xs)), "y": (min(ys), max(ys)), "count": len(band)}


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.scene.name = "TERRAMAR_AI_REFERENCES"
    os.makedirs(C.REF_MODELS_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=C.REF_MODELS_BLEND)        # so image paths can be made relative
    report = {}
    for coll_name, rel in MODELS.items():
        before = set(bpy.data.objects)
        bpy.ops.wm.obj_import(filepath=os.path.join(C.REF_MODELS_DIR, *rel.split("/")))
        objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        assert len(objs) == 1, f"{rel}: expected one mesh, got {len(objs)}"
        o = objs[0]
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        s0 = slice_extent(o)
        scale = TOWER_WIDTH_M / (s0["x"][1] - s0["x"][0])
        cx, cy = (s0["x"][0] + s0["x"][1]) / 2, (s0["y"][0] + s0["y"][1]) / 2
        o.scale = (scale, scale, scale)
        o.location = Vector((-cx * scale, -cy * scale, -s0["z_min"] * scale))
        bpy.context.view_layer.update()
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        s1 = slice_extent(o)
        o.name = o.data.name = coll_name
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        for slot in o.material_slots:
            if slot.material:
                slot.material.name = f"{coll_name}_material"
        report[coll_name] = {
            "source": rel, "vertices": len(o.data.vertices), "faces": len(o.data.polygons),
            "scale_m_per_unit": round(scale, 3),
            "fitted_tower_slice_x": [round(v, 3) for v in s1["x"]], "fitted_tower_slice_y": [round(v, 3) for v in s1["y"]],
            "fitted_top_z": round(s1["z_max"], 3),
            "baseline_roof_z": BASELINE_ROOF_Z, "baseline_top_z": BASELINE_TOP_Z,
            "note": "approximate fit; the model's top includes roof props and planters",
        }
        print(coll_name, json.dumps(report[coll_name]))
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=C.REF_MODELS_BLEND, compress=True)
    with open(C.REF_MODELS_REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print("REFERENCE MODELS DONE", C.REF_MODELS_BLEND)


if __name__ == "__main__":
    main()
