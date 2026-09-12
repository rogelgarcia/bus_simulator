"""Piece 01 — the entrance door set (Bradbury Building, 304 S Broadway).

Two two-piece doors: each door = an operating leaf plus a fixed side panel, so
four oak leaves in a row [side | door | door | side] with a carved centre post.
Each leaf: stiles and rails, a tall glazed panel with a bolection molding, a
raised bottom panel with an oval boss inside a molded frame, a brass kick
plate; the doors carry brass pull handles. Above: head rail, a row of transom
lights (glass) with a carved block over the centre post, and a top rail.

Frame: x across (0 = centre), y depth (+ into the building; leaf faces at y=0),
z up from the threshold. Collection: DOOR.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

# ---------------------------------------------------------------- dimensions (m)
JAMB_W = 0.10; DOOR_W = 0.70; POST_W = 0.20          # four equal leaves in two pairs, a column between the pairs
LEAF_H = 2.50; T = 0.06                       # leaf height 2.50 m (the reference module), leaf thickness
KICK_H = 0.28                                 # brass kick plate
RAIL_BOT = (0.28, 0.36)                       # bottom rail visible strip above the kick plate
PANEL = (0.36, 0.78)                          # carved bottom panel
RAIL_LOCK = (0.78, 0.94)
GLASS = (0.94, 2.35)
RAIL_TOP = (2.35, 2.50)
HEAD = (2.50, 2.62); TRANSOM = (2.62, 3.73); TOP = (3.73, 3.86)   # transom lights 1.37 x 1.11 per pair (6% under square)
HALF_W = JAMB_W + 2*DOOR_W + POST_W/2         # 1.60 -> total 3.20

COLL = ensure_collection("DOOR")
OAK = mat_oak(); GLS = mat_glass(); BRASS = mat_brass(); DARK = mat_dark_wood(); IRON = mat_iron()

# bolection molding around the glass: sits on the leaf face, crest 2 cm proud, dies into the rebate
BOLECTION = [(-0.045, 0.0), (-0.045, 0.006), (-0.032, 0.014), (-0.018, 0.020), (-0.006, 0.012), (0.0, 0.004), (0.0, 0.0)]
# panel molding: a smaller ogee around the raised bottom panel
PANEL_MLD = [(-0.03, 0.0), (-0.03, 0.005), (-0.018, 0.012), (-0.006, 0.008), (0.0, 0.0)]

def raised_panel(bm, x0, x1, z0, z1, y_face=0.0, boss=True, margin=0.05):
    """Raised panel with an ogee edge (and an oval boss), like the door bottoms (opening x0..x1, z0..z1 on the face y_face)."""
    cube(bm, x0, x1, y_face + 0.028, y_face + 0.06, z0, z1)                         # recessed field
    px0, px1, pz0, pz1 = x0 + margin, x1 - margin, z0 + margin, z1 - margin
    cube(bm, px0, px1, y_face - 0.006, y_face + 0.03, pz0, pz1)                     # raised panel, 6 mm proud
    rect_molding(bm, px0, px1, pz0, pz1, y_face - 0.006, PANEL_MLD)
    rect_molding(bm, x0, x1, z0, z1, y_face, BOLECTION)
    if not boss: return
    cx, cz = (px0 + px1)/2, (pz0 + pz1)/2
    ew, eh = min(0.14, (px1 - px0)*0.34), min(0.10, (pz1 - pz0)*0.30)
    torus(bm, (cx, y_face - 0.006, cz), 1.0, 0.012, Matrix.Rotation(math.pi/2, 4, 'X'), 28, 8, scale_xy=(ew, eh))
    ellipsoid(bm, (cx, y_face + 0.003, cz), ew*0.92, 0.014, eh*0.92, 24, 8)
    ellipsoid(bm, (cx, y_face - 0.012, cz), 0.025, 0.012, 0.018, 10, 6)

def build_leaf(name, xa, xb, stile_l, stile_r, is_door, hinge_side):
    """One oak leaf between xa..xb. stile_l/stile_r = stile widths; hinge_side -1 (hinges at xa) or +1."""
    bm = bmesh.new()
    gx0, gx1 = xa + stile_l, xb - stile_r
    cube(bm, xa, xa + stile_l, 0.0, T, 0.0, LEAF_H)                       # stiles
    cube(bm, xb - stile_r, xb, 0.0, T, 0.0, LEAF_H)
    cube(bm, gx0, gx1, 0.0, T, 0.0, PANEL[0])                              # bottom rail (kick plate covers its lower part)
    cube(bm, gx0, gx1, 0.0, T, RAIL_LOCK[0], RAIL_LOCK[1])                 # lock rail
    cube(bm, gx0, gx1, 0.0, T, RAIL_TOP[0], LEAF_H)                        # top rail
    raised_panel(bm, gx0, gx1, PANEL[0], PANEL[1])                         # carved bottom panel with the oval boss
    rect_molding(bm, gx0, gx1, GLASS[0], GLASS[1], 0.0, BOLECTION)         # bolection around the glass
    # carved foliage band on the top rail: a row of small leaves with a centre rosette
    n_leaf = 4; span = (gx1 - gx0) - 0.10
    for i in range(n_leaf):
        lx = gx0 + 0.05 + span * (i + 0.5) / n_leaf
        leaf(bm, Vector((lx, -0.004, RAIL_TOP[0] + 0.02)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)), 0.075, 0.105, curl=0.35, thick=0.012, lobes=3)
    torus(bm, ((gx0 + gx1)/2, -0.006, (RAIL_TOP[0] + LEAF_H)/2), 0.028, 0.008, Matrix.Rotation(math.pi/2, 4, 'X'), 16, 6)
    wood = mesh_from_bm(name, bm, OAK, COLL, smooth=False)
    for p in wood.data.polygons:                                            # smooth only the curved carvings
        if p.normal.length > 0 and abs(p.normal.y) < 0.999 and p.area < 0.0008: p.use_smooth = True
    # glass pane in the rebate
    bm = bmesh.new(); cube(bm, gx0 + 0.004, gx1 - 0.004, 0.026, 0.032, GLASS[0] + 0.004, GLASS[1] - 0.004); mesh_from_bm(name + "_glass", bm, GLS, COLL)
    # brass kick plate
    bm = bmesh.new(); cube(bm, xa + 0.015, xb - 0.015, -0.004, 0.0, 0.015, KICK_H); mesh_from_bm(name + "_kick", bm, BRASS, COLL)
    if is_door:                                                             # black vertical pull at mid-height on the meeting stile
        hx = xb - stile_r/2 if hinge_side < 0 else xa + stile_l/2
        bm = bmesh.new()
        cube(bm, hx - 0.022, hx + 0.022, -0.010, 0.0, 0.92, 1.36)             # backplate
        cylinder(bm, (hx, -0.062, 1.14), 'Z', 0.014, 0.014, 0.36, 14)         # grip
        for zz in (0.99, 1.29): cylinder(bm, (hx, -0.036, zz), 'Y', 0.011, 0.011, 0.052, 10)   # stand-offs
        mesh_from_bm(name + "_pull", bm, IRON, COLL, smooth=True)
    return wood

# ---------------------------------------------------------------- four equal leaves: [1 | 2] column [3 | 4]; each pair meets in its middle
x = -HALF_W + JAMB_W
build_leaf("door_1", x, x + DOOR_W, 0.11, 0.09, True, -1); x += DOOR_W      # hinged on the left jamb
build_leaf("door_2", x, x + DOOR_W, 0.09, 0.11, True, +1); x += DOOR_W      # hinged on the column
x += POST_W
build_leaf("door_3", x, x + DOOR_W, 0.11, 0.09, True, -1); x += DOOR_W      # hinged on the column
build_leaf("door_4", x, x + DOOR_W, 0.09, 0.11, True, +1)                   # hinged on the right jamb

# ---------------------------------------------------------------- centre post (fixed mullion) with a recessed panel and a carved block at the transom
bm = bmesh.new()
cube(bm, -POST_W/2, POST_W/2, -0.02, 0.12, 0.0, TRANSOM[1])
cube(bm, -POST_W/2 - 0.015, POST_W/2 + 0.015, -0.03, 0.12, 0.0, 0.32)                  # foot block
cube(bm, -POST_W/2 - 0.03, POST_W/2 + 0.03, -0.04, 0.12, HEAD[0] - 0.02, HEAD[1] + 0.02)   # cap at the head rail
post = mesh_from_bm("door_post", bm, OAK, COLL)
bm = bmesh.new()                                                                                                                             # two stacked recessed panels on the column face
for (za, zb) in ((0.40, 1.25), (1.33, 2.30)):
    cube(bm, -POST_W/2 + 0.03, POST_W/2 - 0.03, -0.021, -0.008, za, zb)
    rect_molding(bm, -POST_W/2 + 0.03, POST_W/2 - 0.03, za, zb, -0.02, [(o*0.6, n*0.6) for (o, n) in PANEL_MLD])
mesh_from_bm("door_post_panels", bm, OAK, COLL)
bm = bmesh.new()                                                                                                                             # column top at the transom: a small plain raised panel
cube(bm, -0.13, 0.13, -0.02, 0.12, TRANSOM[0], TRANSOM[1])
raised_panel(bm, -0.13 + 0.045, 0.13 - 0.045, TRANSOM[0] + 0.36, TRANSOM[1] - 0.36, -0.02, boss=False, margin=0.035)
mesh_from_bm("door_post_top_panel", bm, OAK, COLL)

# ---------------------------------------------------------------- frame: jambs, head rail, transom lights, top rail
bm = bmesh.new()
for s in (-1, 1): cube(bm, s*(HALF_W - JAMB_W) if s < 0 else s*(HALF_W - JAMB_W), s*HALF_W, -0.02, 0.16, 0.0, TOP[1]) if False else None
cube(bm, -HALF_W, -HALF_W + JAMB_W, -0.02, 0.16, 0.0, TOP[1])                          # jambs
cube(bm, HALF_W - JAMB_W, HALF_W, -0.02, 0.16, 0.0, TOP[1])
cube(bm, -HALF_W + JAMB_W, HALF_W - JAMB_W, -0.012, 0.16, HEAD[0], HEAD[1])             # head rail
cube(bm, -HALF_W + JAMB_W, HALF_W - JAMB_W, -0.03, 0.0, HEAD[0] + 0.035, HEAD[0] + 0.075)   # head molding strip
cube(bm, -HALF_W + JAMB_W, HALF_W - JAMB_W, -0.012, 0.16, TOP[0], TOP[1])               # top rail
cube(bm, -HALF_W + JAMB_W, HALF_W - JAMB_W, -0.03, 0.0, TOP[0] + 0.03, TOP[0] + 0.07)  # top molding strip
mesh_from_bm("door_frame", bm, OAK, COLL)
# transom lights: one wide pane over each pair (the "304" lights), the carved block over the column between them
panes = [(-HALF_W + JAMB_W, -0.13), (0.13, HALF_W - JAMB_W)]
bm = bmesh.new(); bmm = bmesh.new()
for (a, b) in panes:
    cube(bm, a + 0.006, b - 0.006, 0.026, 0.032, TRANSOM[0] + 0.006, TRANSOM[1] - 0.006)
    rect_molding(bmm, a, b, TRANSOM[0], TRANSOM[1], -0.012, [(o*0.7, n*0.7) for (o, n) in BOLECTION])
mesh_from_bm("door_transom_glass", bm, GLS, COLL)
mesh_from_bm("door_transom_moldings", bmm, OAK, COLL)

# ---------------------------------------------------------------- rig, renders, save
for o in COLL.objects: o.location.y += DOOR_Y                    # the set is modelled with the leaf faces at y 0; the door plane is portal_lib.DOOR_Y
rig = setup_scene()
camera("DoorFront", (0.0, DOOR_Y - 6.0, 1.95), (0.0, DOOR_Y, 1.95), 40)
camera("DoorQuarter", (2.6, DOOR_Y - 4.0, 1.7), (0.1, DOOR_Y + 0.05, 1.85), 40)
camera("DoorDetail", (-0.55, DOOR_Y - 1.35, 0.95), (-0.35, DOOR_Y, 0.95), 45)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
os.makedirs(OUT, exist_ok=True)
render("DoorFront", os.path.join(OUT, "01_door_front.png"))
render("DoorQuarter", os.path.join(OUT, "01_door_quarter.png"))
render("DoorDetail", os.path.join(OUT, "01_door_detail.png"))
bpy.context.scene.camera = bpy.data.objects["DoorFront"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("DOOR DONE", len(COLL.objects), "objects")
