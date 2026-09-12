"""Piece 02 — the paired piers flanking the entrance.

Two square stone piers on each side of the door set, standing in front of the
doors at the vestibule mouth, side by side in depth (a front pier and a back
pier, 5 cm apart). Proportions follow the reference with the door leaf as the
2.50 m module: pier 0.26 wide x 0.34 deep, plinth 0.50 m; the capital is the same
ornament as the pilasters', LINKED from ornaments/capital.blend, scaled to
the pier width (0.34 / 0.784) and turned so its front faces the passage;
the capital top is level with the top of the door glass (2.35 m).

Frame: x across (0 = centre), y depth (+ into the building; door faces at
y = 0, piers at negative y), z up from the threshold. Collection: PILLARS.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

DOOR_HALF_W = 1.60           # door set is 3.20 m wide (piece 01)
GLASS_TOP = 2.35             # top of the door glass = capital top
PIER_W, PIER_D = 0.2365, 0.34  # pier width toward the passage (0.26 less the 2.35 cm the arch opening grew on 2026-09-11) and depth along the recess
PIER_X = DOOR_HALF_W - PIER_W/2                      # 1.47: the pier's back sits on the recess wall (x = 1.60, in line with the door edge), it projects inward to 1.34
FRONT_Y, BACK_Y = -2.53, -2.14                         # pier centres in depth: the pair stands at the mouth, under the arch ring (y -2.70 .. -2.08)
PLINTH_H = 0.56                                        # (0.50 + a bit, user request) top of the plinth's cap fillet, level with the pilasters' (piece 07)
CAP_TOP = 2.15                                         # impost: the arch's straight jambs start here and curve from 2.25 (piece 06 STILT)
CAP_H = 0.24                                           # the pier capital still reaches down to 1.91 (the yellow line on the A/B pair)
SHAFT_TOP = CAP_TOP - CAP_H                            # 1.91
CAP_BACK = CAPITAL_DEPTH * 0.725 / 0.85                # 0.68: the ornament's straight back plane as a fraction of the pier width from its passage face

COLL = ensure_collection("PILLARS")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)
CARVED = mat_sandstone("PORTAL_sandstone_carved", joints=False)

cap_me = linked_mesh("capital", "capital.blend")      # same ornament as the pilasters (portal_lib.ORNAMENTS_DIR)
for s, tag in ((-1, "L"), (1, "R")):
    for yc, dtag in ((FRONT_Y, "front"), (BACK_Y, "back")):
        cx = s * PIER_X
        bm = bmesh.new()
        for m, z0, z1 in ((0.05, 0.0, PLINTH_H - 0.08), (0.06, PLINTH_H - 0.08, PLINTH_H - 0.04), (0.04, PLINTH_H - 0.04, PLINTH_H - 0.015), (0.015, PLINTH_H - 0.015, PLINTH_H)):
            cube(bm, cx - PIER_W/2 - m, cx + PIER_W/2 + m, yc - PIER_D/2 - m, yc + PIER_D/2 + m, z0, z1)      # block / cap body / cap top / fillet, as on the pilasters
        cube(bm, cx - PIER_W/2, cx + PIER_W/2, yc - PIER_D/2, yc + PIER_D/2, PLINTH_H, SHAFT_TOP)                                   # shaft (the capital brings its astragal)
        x_b = (cx - s*PIER_W/2) + s*CAP_BACK*PIER_W                                                                                  # the capital's straight back plane
        if CAP_BACK < 0.98: cube(bm, min(x_b - s*0.01, cx + s*PIER_W/2), max(x_b - s*0.01, cx + s*PIER_W/2), yc - PIER_D/2, yc + PIER_D/2, SHAFT_TOP, CAP_TOP)   # the wall-side strip continues up behind the capital (none when the capital reaches the wall)
        # plain faces (the raised strips on the passage and street faces were removed on request, 2026-09-11)
        mesh_from_bm(f"pillar_{tag}_{dtag}", bm, STONE, COLL)
        # the ornament's front (-y) turned to face the passage: +x for the left pier, -x for the right one;
        # its width (local x) runs along the wall = the pier depth, its depth (local y) toward the passage = the pier width
        ornament_instance(f"pillar_{tag}_{dtag}_capital", cap_me, (cx, yc, SHAFT_TOP), COLL, rot_z=-s * math.pi / 2, scale=(PIER_D / 0.725, PIER_W / 0.85, CAP_H / 0.41))

# ---------------------------------------------------------------- rig, renders, save
rig = setup_scene()
camera("PillarsFront", (0.0, -7.5, 1.9), (0.0, -0.5, 1.8), 40)
camera("PillarsQuarter", (3.6, -5.2, 1.7), (0.3, -0.6, 1.7), 40)
camera("PillarDetail", (-1.05, -2.9, 2.05), (-1.83, -1.62, 2.18), 50)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
os.makedirs(OUT, exist_ok=True)
render("PillarsFront", os.path.join(OUT, "02_pillars_front.png"))
render("PillarsQuarter", os.path.join(OUT, "02_pillars_quarter.png"))
render("PillarDetail", os.path.join(OUT, "02_pillars_detail.png"))
bpy.context.scene.camera = bpy.data.objects["PillarsFront"]
purge_orphans()
try: bpy.ops.file.make_paths_relative()
except Exception: pass
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("PILLARS DONE", len(COLL.objects), "objects")
