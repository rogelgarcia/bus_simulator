# layer_dining_l1.py -- AI 636: the upper-podium dining room, from plan["interior"]["dining_l1"].
#
# Run through build.py (layers=dining_l1; needs the podium, podium_planters and interior_base layers). It reuses AI 635's
# pieces and materials (layer_restaurant_l0.py) and builds RB_INTERIOR/RB_DINING_L1 under its part root:
#   RB_DINING_L1_FURNITURE/rb_dining_furn_<n>_<kind>  the tables, caned dining chairs and banquettes, and the two tables
#                            on the entrance terrace: one object per item, the detailed furniture placed by
#                            layer_roof_furniture.furnish (identical pieces share one mesh)
#   rb_dining_sideboard      on the core's front: the teak-panelled wall, a cabinet and three shelves with LED strips
#   rb_dining_pendants       a pendant over every indoor table: cord, dark bronze drum shade, warm glowing diffuser
#   rb_dining_pots, rb_dining_plant_<n>  potted plants at the dining bands' ends, by the sideboard and the loggia glazing
#   rb_dining_fill_<n>       warm area lights under the ceiling over every zone, out of camera and reflection rays
# The layer checks every footprint against every other and against the core.
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (pots, plain materials)
import layer_restaurant_l0 as RL  # noqa: E402  (AI 635's pieces, lights, checks)
import layer_roof_furniture as RF  # noqa: E402  (clear: the furniture shares meshes)

for mod in (L, BP, RL, RF):
    importlib.reload(mod)

PARENT = "RB_INTERIOR"
COLLECTION = "RB_DINING_L1"
LAYER = "dining_l1"
CHAIR = "cane"                                                          # the room's dining chairs: caned backs


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(PARENT, root))
    RF.clear(coll)
    RL.materials()
    BP.prop_materials()
    rl = plan["interior"]["dining_l1"]
    z = rl["z"]
    made, st = RL.furniture(L.ensure_collection(f"{COLLECTION}_FURNITURE", coll), rl, "rb_dining_furn", tags, CHAIR)
    made.append(L.pieces("rb_dining_sideboard", coll, RL.back_pieces(rl["sideboard"], z, rl["core"], rl["ceiling"]),
                         tags("sideboard", "sideboard")))
    pend = [q for p in rl["pendants"] for q in RL.pendant_pieces(p, rl["config"]["pendant"], z)]
    made.append(L.pieces("rb_dining_pendants", coll, pend, tags("light", "pendants")))
    fills = RL.fill_lights(coll, rl, "rb_dining_fill", tags)
    made += RL.potted_plants(coll, rl, "rb_dining", tags)
    problems = RL.checks(rl)
    for p in problems[:20]:
        print("WARNING dining:", p)
    return RL.report(rl, made, fills, problems, COLLECTION, st)
