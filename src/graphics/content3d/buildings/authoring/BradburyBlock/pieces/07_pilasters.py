"""Piece 07 — the big side pilasters flanking the arch.

One tall pilaster on each side of the arch block, standing on the sidewalk:
the piers' stepped plinth (top at 0.44) in the same pink stone, a shaft
0.76 m wide (reference photo) with a sunken panel whose edge is a three-part molding (tiny
square step at the face, convex quarter-round, tiny square step down to the
field) running straight up to the capital, which is LINKED from the
ornament file ornaments/capital.blend (mesh `capital`, built by
ornaments/capital.py at the 0.725 x 0.85 footprint in the stage portal_lib.CAPITAL_STAGE
picks -- 0.41 tall plain, 0.463 carved -- engaged: it runs back
80% of its width along the sides, the plain pilaster continuing up behind
its straight back): both pilasters are instances of
that linked mesh, so saving a new version of the ornament shows up here on
reload. The capital's top (4.16, 0.03 over the arch block's, piece 06) stays put whatever
the stage: the shaft stops where the capital starts, so a taller capital shortens it
(rerun this piece after a stage change). The pilasters project 0.20 m beyond the arch
block's face and cover the ends of the recess walls.

Frame: x across, y depth (arch face at y = -2.70), z up (sidewalk at -0.12).
Collection: PILASTERS.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

ARCH_HALF = 1.60                         # arch block sides (piece 06)
GAP = 0.005                              # hairline between the block and the pilaster (no coincident faces)
PW = 0.725                               # pilaster width (reference photo in the A/B pair frame: shaft 0.725 m, plinth 0.05 wider each side)
X0 = ARCH_HALF + GAP; X1 = X0 + PW       # 1.605 .. 2.33
Y_FACE, Y_BACK = -2.90, -2.05            # 0.20 proud of the arch face; the back overlaps the recess wall ends
SIDEWALK = -0.12
PLINTH_TOP = 0.56                        # (0.50 + a bit, user request) top of the plinth's cap fillet (photo row 1080); same foot as the inner piers (piece 02)
CAP_TOP = 4.16                           # the capital's top contour ends 0.03 above the band bottom (4.13 = piece 06 BLOCK_TOP)

COLL = ensure_collection("PILASTERS")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)
CARVED = mat_sandstone("PORTAL_sandstone_carved", joints=False)

SIDE_WALL = 0.18                         # the wall beside the pilaster starts 0.18 behind its face (the block's; the user's line, 2026-10-05); on its inner side the arch block, 0.20
cap_me, CAP_H = linked_capital("pilaster", wall=SIDE_WALL)   # mesh `capital` (portal_lib.ORNAMENTS_DIR): 0.41 tall plain (0.39 + 5%, the shaft gave up the same 0.02), 0.463 carved, its sides' leaves ending at that wall
SHAFT_TOP = CAP_TOP - CAP_H                           # 3.75 with the plain capital (its baseline in the photo), 3.697 with the carved one
CAP_BACK_Y = Y_FACE + CAPITAL_DEPTH * PW              # -2.29: the capital's straight back (80% of the front width behind the face)
for s, tag in ((-1, "L"), (1, "R")):
    x0, x1 = (X0, X1) if s > 0 else (-X1, -X0)
    cx = (x0 + x1) / 2
    # plinth: the piers' foot (block / recessed neck / cap as wide as the block) from the sidewalk up to the piers' plinth top
    bm = bmesh.new()
    cube(bm, x0 - 0.05, x1 + 0.05, Y_FACE - 0.05, Y_BACK, SIDEWALK, PLINTH_TOP - 0.08)                 # block
    cube(bm, x0 - 0.06, x1 + 0.06, Y_FACE - 0.06, Y_BACK, PLINTH_TOP - 0.08, PLINTH_TOP - 0.04)      # cap body, a little wider than the block
    cube(bm, x0 - 0.04, x1 + 0.04, Y_FACE - 0.04, Y_BACK, PLINTH_TOP - 0.04, PLINTH_TOP - 0.015)     # cap top (the rounding, stepped)
    cube(bm, x0 - 0.015, x1 + 0.015, Y_FACE - 0.015, Y_BACK, PLINTH_TOP - 0.015, PLINTH_TOP)        # fillet under the shaft
    mesh_from_bm(f"pilaster_{tag}_plinth", bm, STONE, COLL)
    # shaft with a sunken panel on the street face; its edge is the three-part molding
    bm = bmesh.new(); cube(bm, x0, x1, Y_FACE, Y_BACK, PLINTH_TOP, SHAFT_TOP); shaft = mesh_from_bm(f"pilaster_{tag}_shaft", bm, STONE, COLL)
    px0, px1, pz0, pz1 = x0 + 0.115, x1 - 0.115, PLINTH_TOP + 0.36, SHAFT_TOP - 0.17              # panel 0.495 wide, 0.86 .. 3.60 (user's box on the A/B pair)
    D = 0.05                                                                                  # panel depth
    bm = bmesh.new(); cube(bm, px0, px1, Y_FACE - 0.1, Y_FACE + D, pz0, pz1); c_a = mesh_from_bm("cut_a", bm, None, COLL)
    apply_boolean(shaft, c_a)
    prof = three_part_profile(D, 0.065)                                                       # shared with the arch soffit panel (portal_lib)
    bm = bmesh.new(); rect_molding(bm, px0, px1, pz0, pz1, Y_FACE + D, prof); mesh_from_bm(f"pilaster_{tag}_panel_molding", bm, STONE, COLL)
    # capital: an instance of the linked ornament, centred on the shaft in plan
    ornament_instance(f"pilaster_{tag}_capital", cap_me, (cx, (Y_FACE + Y_BACK) / 2, SHAFT_TOP), COLL)
    # the plain pilaster continues straight up behind the capital's back plane
    if CAP_BACK_Y < Y_BACK - 0.02:
        bm = bmesh.new(); cube(bm, x0, x1, CAP_BACK_Y - 0.01, Y_BACK, SHAFT_TOP, CAP_TOP); mesh_from_bm(f"pilaster_{tag}_back", bm, STONE, COLL)

# ---------------------------------------------------------------- cameras, renders, save
rig = setup_scene()
camera("PortalFront", (0.0, -11.0, 2.0), (0.0, -2.4, 2.9), 35)
camera("PortalLow", (2.8, -5.6, 0.7), (0.0, -2.3, 3.4), 26)
camera("PilasterDetail", (-3.4, -5.2, 3.9), (-1.9, -2.9, 3.85), 50)
camera("PanelDetail", (-1.35, -3.55, 2.75), (-2.28, -2.90, 2.45), 85)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
S = bpy.context.scene; S.render.resolution_x = 1400; S.render.resolution_y = 1600
render("PortalFront", os.path.join(OUT, "07_pilasters_front.png"))
render("PortalLow", os.path.join(OUT, "07_pilasters_low.png"))
render("PilasterDetail", os.path.join(OUT, "07_pilasters_capital.png"))
render("PanelDetail", os.path.join(OUT, "07_pilasters_panel.png"))
S.camera = bpy.data.objects["PortalFront"]
purge_orphans()
try: bpy.ops.file.make_paths_relative()                 # keep the link to ornaments/capital.blend relative to the portal file
except Exception: pass
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("PILASTERS DONE", len(COLL.objects), "objects")
