# layer_interior_base.py -- AI 634: the interior base the furnishing items (AI 635-638) build on, from
# plan["interior"]["base"].
#
# Run through build.py (layers=interior_base; needs the structure and envelope layers). The structure layer already
# gives every level its floor plate (TM_RB_floor), ceiling (TM_RB_ceiling) and the core (TM_RB_core, now warm plaster);
# this builds RB_INTERIOR/RB_INTERIOR_BASE under its part root:
#   rb_interior_partitions   the walls dividing each residential floor (1-5) into seven units, floor to slab underside,
#                            their ends cut flush on the pilaster line, the core, the chamfer columns' backs and an E-bay
#                            mullion (TM_RB_partition, warm plaster)
#   rb_interior_downlights   small round ceiling lights under every residential ceiling (TM_RB_ceiling_light, a warm
#                            emitter), clear of the walls, the partitions and the core
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import importlib
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

PARENT = "RB_INTERIOR"
COLLECTION = "RB_INTERIOR_BASE"
LAYER = "interior_base"
LIGHT = ("TM_RB_ceiling_light", (1.0, 0.78, 0.55), 400.0)         # name, warm white (~2700 K), emission strength: bright
                                                                  # enough to light the rooms at the daylight exposure


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def light_material():
    name, rgb, strength = LIGHT
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def disc(c, r, n=12):
    return [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(PARENT, root))
    L.clear_collection(coll)
    light_material()
    base = plan["interior"]["base"]
    storeys = [tuple(z) for z in base["storeys"]]
    walls = [L.piece([tuple(q) for q in w["loop"]], storeys, "TM_RB_partition") for w in base["partitions"]]
    made = [L.pieces("rb_interior_partitions", coll, walls, tags("partition", "partitions"))]
    dl = base["config"]["downlight"]
    lights = [L.piece(disc(p, dl["radius"]), [(z1 - dl["height"], z1)], LIGHT[0]) for p in base["downlights"] for _, z1 in storeys]
    made.append(L.pieces("rb_interior_downlights", coll, lights, tags("light", "downlights")))
    return {"collection": COLLECTION, "objects": len(made), "partitions_per_floor": len(base["partitions"]),
            "floors": len(storeys), "downlights": len(lights), "names": [o.name for o in made]}
