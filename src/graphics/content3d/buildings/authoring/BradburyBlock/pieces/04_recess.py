"""Piece 04 — the entrance recess between the piers and the door.

From the low-angle photo: a shallow outer vestibule under the arch. Its side
walls are glazed brick in line with the door set's edges and the piers (the
piers are pilasters against these walls, projecting into the recess), on a
dark stone base; the floor is the same encaustic tile as inside with a dark
border; above the door head an oak frieze runs up to a coffered oak ceiling
(border coffers around a central molded panel with a rosette) from which a
small globe lamp hangs.

Frame: x across, y = depth (door faces at y = 0, the recess at negative y,
its mouth at y = -2.10 where the stone portal will stand), z up.
Collection: RECESS.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

DOOR_HALF_W = 1.60; DOOR_TOP = 3.86
PIER = 0.34
WALL_X = DOOR_HALF_W                        # 1.60: recess wall faces straight in line with the door set's edges; the piers stand against them
WALL_T = 0.30
Y_BACK = DOOR_Y - 0.14                      # outer face of the vestibule's street wall (portal_lib.DOOR_Y: the door plane)
Y_FRONT = -2.10                             # mouth of the recess (facade plane)
BASE_H = 0.35
CEIL_Z = 4.03; BEAM_D = 0.14; BEAM_W = 0.16

COLL = ensure_collection("RECESS")
OAK = mat_oak(); OAK_LIGHT = mat_oak_light()
BRICK_SIDE = mat_glazed_brick("PORTAL_glazed_brick_side", along='Y')
STONE_DARK = mat_plain("PORTAL_dark_stone", (0.05, 0.03, 0.022), roughness=0.4, coat=0.15)
TILE = mat_tile_floor()
BORDER = mat_plain("PORTAL_tile_border", (0.075, 0.04, 0.03), roughness=0.35, coat=0.2)
BRONZE = mat_plain("PORTAL_bronze", (0.42, 0.28, 0.14), roughness=0.35, metallic=1.0)
BIG_MLD = [(-0.10, 0.0), (-0.10, 0.018), (-0.075, 0.042), (-0.04, 0.065), (-0.016, 0.05), (0.0, 0.018), (0.0, 0.0)]

# ---------------------------------------------------------------- floor with border
bm = bmesh.new(); cube(bm, -WALL_X, WALL_X, Y_FRONT - 0.05, Y_BACK, -0.03, 0.0); mesh_from_bm("rec_floor", bm, TILE, COLL)
bm = bmesh.new()
for s in (-1, 1): cube(bm, min(s*WALL_X, s*(WALL_X - 0.32)), max(s*WALL_X, s*(WALL_X - 0.32)), Y_FRONT - 0.05, Y_BACK, 0.0, 0.004)
cube(bm, -WALL_X, WALL_X, Y_BACK - 0.32, Y_BACK, 0.0, 0.004)
mesh_from_bm("rec_floor_border", bm, BORDER, COLL)

# ---------------------------------------------------------------- side walls (glazed brick) on a dark base, joining the street wall
for s, tag in ((-1, "L"), (1, "R")):
    x_in = s*WALL_X; x_out = s*(WALL_X + WALL_T)
    bm = bmesh.new(); cube(bm, min(x_in, x_out), max(x_in, x_out), Y_FRONT, Y_BACK + 0.02, BASE_H, CEIL_Z + 0.10); mesh_from_bm(f"rec_wall_{tag}", bm, BRICK_SIDE, COLL)
    bm = bmesh.new(); cube(bm, min(x_in - s*0.02, x_out), max(x_in - s*0.02, x_out), Y_FRONT, Y_BACK + 0.02, 0.0, BASE_H); mesh_from_bm(f"rec_base_{tag}", bm, STONE_DARK, COLL)

# ---------------------------------------------------------------- oak frieze over the door head and a small oak cornice around the three walls
bm = bmesh.new()
cube(bm, -WALL_X, WALL_X, Y_BACK - 0.06, Y_BACK + 0.02, DOOR_TOP - 0.01, CEIL_Z)                 # frieze board above the door set
cube(bm, -WALL_X, WALL_X, Y_BACK - 0.09, Y_BACK - 0.06, DOOR_TOP + 0.04, DOOR_TOP + 0.08)         # small molding strip on it
for s in (-1, 1): cube(bm, min(s*WALL_X, s*(WALL_X - 0.08)), max(s*WALL_X, s*(WALL_X - 0.08)), Y_FRONT, Y_BACK, CEIL_Z - 0.16, CEIL_Z)
cube(bm, -WALL_X, WALL_X, Y_BACK - 0.08, Y_BACK, CEIL_Z - 0.16, CEIL_Z)
for s in (-1, 1): cube(bm, min(s*WALL_X, s*(WALL_X - 0.14)), max(s*WALL_X, s*(WALL_X - 0.14)), Y_FRONT, Y_BACK, CEIL_Z - 0.06, CEIL_Z)
cube(bm, -WALL_X, WALL_X, Y_BACK - 0.14, Y_BACK, CEIL_Z - 0.06, CEIL_Z)
mesh_from_bm("rec_cornice", bm, OAK, COLL)

# ---------------------------------------------------------------- coffered oak ceiling
bm = bmesh.new(); cube(bm, -WALL_X - 0.05, WALL_X + 0.05, Y_FRONT - 0.05, Y_BACK + 0.02, CEIL_Z, CEIL_Z + 0.10); mesh_from_bm("rec_ceiling_field", bm, OAK_LIGHT, COLL)
bm = bmesh.new()
xs = [-WALL_X + 0.10, -(WALL_X - 0.55), (WALL_X - 0.55), WALL_X - 0.10]
ys = [Y_FRONT + 0.10, Y_BACK - 0.10]                                                       # border beams at the mouth and the door wall
if (Y_BACK - Y_FRONT) > 1.8: ys = [ys[0], Y_FRONT + 0.55, Y_BACK - 0.55, ys[1]]           # only a deep recess gets a row of end coffers; a short one keeps the centre panel whole
for xb in xs: cube(bm, xb - BEAM_W/2, xb + BEAM_W/2, Y_FRONT, Y_BACK, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
for yb in ys: cube(bm, -WALL_X, WALL_X, yb - BEAM_W/2, yb + BEAM_W/2, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
pitch = 0.55
end_rows = [(ys[0], ys[1]), (ys[2], ys[3])] if len(ys) == 4 else []
x = xs[1] + pitch
while x < xs[2] - 0.1:
    for (ya, yb) in end_rows: cube(bm, x - BEAM_W/2, x + BEAM_W/2, ya, yb, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
    x += pitch
mid = len(ys) // 2
for (xa, xb) in ((xs[0], xs[1]), (xs[2], xs[3])):                                          # the side strips are halved by a cross beam at the centre panel's middle
    y = (ys[mid - 1] + ys[mid]) / 2
    cube(bm, xa, xb, y - BEAM_W/2, y + BEAM_W/2, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
mesh_from_bm("rec_ceiling_beams", bm, OAK, COLL)
cx0, cx1, cy0, cy1 = xs[1] + BEAM_W/2, xs[2] - BEAM_W/2, ys[mid - 1] + BEAM_W/2, ys[mid] - BEAM_W/2   # the centre panel
bm = bmesh.new()
rect_molding_xy(bm, cx0 + 0.02, cx1 - 0.02, cy0 + 0.02, cy1 - 0.02, CEIL_Z, BIG_MLD)
cube(bm, cx0 + 0.13, cx1 - 0.13, cy0 + 0.13, cy1 - 0.13, CEIL_Z - 0.015, CEIL_Z + 0.02)
mesh_from_bm("rec_ceiling_center_frame", bm, OAK, COLL)
mx, my = 0.0, (cy0 + cy1) / 2
R_ROS = min(0.30, (cy1 - cy0) / 2 - 0.10, (cx1 - cx0) / 2 - 0.10); k = R_ROS / 0.30       # the rosette fits the centre panel
bm = bmesh.new()
torus(bm, (mx, my, CEIL_Z - 0.025), R_ROS, 0.03 * k, None, 40, 10)
cylinder(bm, (mx, my, CEIL_Z - 0.028), 'Z', R_ROS - 0.01, R_ROS - 0.01, 0.02, 40)
torus(bm, (mx, my, CEIL_Z - 0.045), 0.14 * k, 0.02 * k, None, 28, 8)
for i in range(10):
    a = 2*math.pi*i/10
    ellipsoid(bm, (mx + 0.21*k*math.cos(a), my + 0.21*k*math.sin(a), CEIL_Z - 0.045), 0.05 * k, 0.03 * k, 0.018 * k, 8, 6)
mesh_from_bm("rec_ceiling_rosette", bm, OAK_LIGHT, COLL, smooth=True)

# ---------------------------------------------------------------- small globe lamp near the mouth
LAMP_Y, DROP = my, 0.42                                  # hangs from the rosette centre
bm = bmesh.new()
cylinder(bm, (mx, LAMP_Y, CEIL_Z - DROP/2), 'Z', 0.012, 0.012, DROP, 10)
cylinder(bm, (mx, LAMP_Y, CEIL_Z - DROP + 0.02), 'Z', 0.05, 0.03, 0.05, 16)
mesh_from_bm("rec_lamp", bm, BRONZE, COLL, smooth=True)
bm = bmesh.new(); ellipsoid(bm, (mx, LAMP_Y, CEIL_Z - DROP - 0.11), 0.15, 0.15, 0.13, 20, 10); mesh_from_bm("rec_lamp_globe", bm, mat_plain("PORTAL_lamp_glass", (0.95, 0.85, 0.65), 0.3), COLL, smooth=True)
rig = setup_scene()
o = bpy.data.objects.get("RecessLamp")
if o: bpy.data.objects.remove(o, do_unlink=True)
ld = bpy.data.lights.new("RecessLamp", 'POINT'); ld.energy = 350; ld.color = (1.0, 0.82, 0.6); ld.shadow_soft_size = 0.15
lo = bpy.data.objects.new("RecessLamp", ld); rig.objects.link(lo); lo.location = (mx, LAMP_Y, CEIL_Z - DROP - 0.11)

# ---------------------------------------------------------------- cameras, renders, save
camera("RecessView", (0.0, -7.0, 1.7), (0.0, -1.0, 2.35), 32)
camera("RecessSide", (-1.3, -4.6, 1.6), (1.5, -1.1, 2.2), 30)
camera("RecessCeiling", (0.5, -1.6, 1.0), (0.0, -1.1, 4.1), 24)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
S = bpy.context.scene; S.render.resolution_x = 1400; S.render.resolution_y = 1600
render("RecessView", os.path.join(OUT, "04_recess_view.png"))
render("RecessSide", os.path.join(OUT, "04_recess_side.png"))
render("RecessCeiling", os.path.join(OUT, "04_recess_ceiling.png"))
S.camera = bpy.data.objects["RecessView"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("RECESS DONE", len(COLL.objects), "objects")
