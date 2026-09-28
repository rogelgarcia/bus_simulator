"""Piece 03 — the vestibule behind the doors.

From the interior photo: a tall rectangular hall lined with glossy glazed
brick on a dark stone base, one round-arched opening in each side wall, the
door set in the street wall with oak paneling beside it and a big glazed
fanlight above it, a dark oak cornice band, a coffered oak ceiling with a
raised central panel and a round medallion carrying a pendant lamp, and an
encaustic tile floor with a dark border: the owner's octagon-and-dot tile image
since 2026-09-28 (portal_lib.mat_tile_floor), and at the open far end the
owner's photo of the Bradbury's atrium on an emissive card.

Frame: x across, y = depth (+y into the building; the door set sits at
y 0..0.16), z up. Collection: VESTIBULE. The far (+y) end is left open toward
the lobby.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

# ---------------------------------------------------------------- dimensions (m), door leaf 2.50 as the module
DOOR_HALF_W = 1.60; DOOR_TOP = 3.86                  # door set (piece 01): 3.20 wide, top rail at 3.86
HW = 2.95                                            # hall half width (5.90 m between the brick walls)
L = 6.30                                             # hall depth from the door wall (7.00 - 10%, user request 2026-09-11)
WALL_T = 0.30
BASE_H = 0.35                                        # dark stone base course
TRANSOM_TOP = 3.73                                   # top of the transom lights: the room ceiling starts here
CORN_Z0, CORN_Z1 = 3.73, 4.03                        # oak cornice band (takes in the door set's top rail)
CEIL_Z = 4.03                                        # ceiling (coffer field) plane
BEAM_D = 0.16; BEAM_W = 0.18                         # coffer beams hang BEAM_D below the field
ARCH_Y, ARCH_HW, ARCH_SPRING = 2.70, 0.85, 2.30      # side openings: centre depth, half width, springing height
WALL_Y0 = -0.14; WALL_Y1 = 0.16                      # street wall thickness (the door jambs span -0.02..0.16)

COLL = ensure_collection("VESTIBULE")
OAK = mat_oak(); OAK_LIGHT = mat_oak_light(); GLS = mat_glass()
BRICK_SIDE = mat_glazed_brick("PORTAL_glazed_brick_side", along='Y')
BRICK_END = mat_glazed_brick("PORTAL_glazed_brick_end", along='X')
STONE_DARK = mat_plain("PORTAL_dark_stone", (0.05, 0.03, 0.022), roughness=0.4, coat=0.15)
TILE = mat_tile_floor()
BORDER = mat_plain("PORTAL_tile_border", (0.075, 0.04, 0.03), roughness=0.35, coat=0.2)
# The ceiling in satin oak (2026-09-28): the doors' and panels' varnished oak carries a clear coat that at the grazing
# angle seen through the transom from the street mirrored the lit lobby over the ceiling's own dark coffers, beams and
# lamp -- the lobby "ghosted", two images over each other (the user). The ceiling, its beams, frame and medallion and the
# cornice band under it take matte copies without the coat.
OAK_CEIL = mat_matte_copy(OAK, "PORTAL_oak_ceiling", 0.6)
OAK_LIGHT_CEIL = mat_matte_copy(OAK_LIGHT, "PORTAL_oak_light_ceiling", 0.6)
DARK = mat_plain("PORTAL_niche_dark", (0.05, 0.035, 0.025), roughness=0.8)
BRONZE = mat_plain("PORTAL_bronze", (0.42, 0.28, 0.14), roughness=0.35, metallic=1.0)
PANEL_MLD = [(-0.03, 0.0), (-0.03, 0.005), (-0.018, 0.012), (-0.006, 0.008), (0.0, 0.0)]
BIG_MLD = [(-0.12, 0.0), (-0.12, 0.02), (-0.09, 0.05), (-0.05, 0.08), (-0.02, 0.06), (0.0, 0.02), (0.0, 0.0)]

# ---------------------------------------------------------------- floor: tiles + dark border band
bm = bmesh.new(); cube(bm, -HW, HW, WALL_Y1, L, -0.03, 0.0); mesh_from_bm("vest_floor", bm, TILE, COLL)
bm = bmesh.new()
for s in (-1, 1): cube(bm, min(s*HW, s*(HW - 0.42)), max(s*HW, s*(HW - 0.42)), WALL_Y1, L, 0.0, 0.004)
cube(bm, -HW, HW, WALL_Y1, WALL_Y1 + 0.42, 0.0, 0.004)
cube(bm, -HW + 0.42, HW - 0.42, L - 0.42, L, 0.0, 0.004)                                  # across the open end too (2026-09-28): the threshold into the lobby
mesh_from_bm("vest_floor_border", bm, BORDER, COLL)
bm = bmesh.new()                                                                              # thin black line inside the border
for s in (-1, 1): cube(bm, min(s*(HW - 0.42), s*(HW - 0.48)), max(s*(HW - 0.42), s*(HW - 0.48)), WALL_Y1 + 0.42, L - 0.42, 0.0, 0.005)
cube(bm, -HW + 0.42, HW - 0.42, WALL_Y1 + 0.42, WALL_Y1 + 0.48, 0.0, 0.005)
cube(bm, -HW + 0.42, HW - 0.42, L - 0.48, L - 0.42, 0.0, 0.005)                           # and across the open end
mesh_from_bm("vest_floor_line", bm, mat_plain("PORTAL_tile_black", (0.02, 0.015, 0.012), 0.2, coat=0.5), COLL)

# ---------------------------------------------------------------- side walls with the arched openings
for s, tag in ((-1, "L"), (1, "R")):
    x_in = s*HW; x_out = s*(HW + WALL_T)
    bm = bmesh.new(); cube(bm, min(x_in, x_out), max(x_in, x_out), WALL_Y0, L, BASE_H, CEIL_Z + 0.10)   # walls rise to the top of the ceiling slab
    wall = mesh_from_bm(f"vest_wall_{tag}", bm, BRICK_SIDE, COLL)
    bm = bmesh.new(); cylinder(bm, (x_in, ARCH_Y, ARCH_SPRING), 'X', ARCH_HW, ARCH_HW, WALL_T*2 + 0.4, 64); cyl = mesh_from_bm("cut_cyl", bm, None, COLL)
    bm = bmesh.new(); cube(bm, min(x_in, x_out) - 0.2, max(x_in, x_out) + 0.2, ARCH_Y - ARCH_HW, ARCH_Y + ARCH_HW, BASE_H - 0.1, ARCH_SPRING); slot = mesh_from_bm("cut_slot", bm, None, COLL)
    apply_boolean(wall, [cyl, slot])
    bm = bmesh.new()                                                                          # dark stone base course, slightly proud, broken at the opening
    cube(bm, min(x_in - s*0.02, x_out), max(x_in - s*0.02, x_out), WALL_Y0, ARCH_Y - ARCH_HW, 0.0, BASE_H)
    cube(bm, min(x_in - s*0.02, x_out), max(x_in - s*0.02, x_out), ARCH_Y + ARCH_HW, L, 0.0, BASE_H)
    mesh_from_bm(f"vest_base_{tag}", bm, STONE_DARK, COLL)
    bm = bmesh.new()                                                                          # the passage behind the arch: a dark recess with its own floor
    d0, d1 = x_out, s*(HW + WALL_T + 0.9)
    for (a, b, c, d, e, f) in ((min(d0, d1), max(d0, d1), ARCH_Y - ARCH_HW - 0.05, ARCH_Y - ARCH_HW, 0.0, 3.4),
                               (min(d0, d1), max(d0, d1), ARCH_Y + ARCH_HW, ARCH_Y + ARCH_HW + 0.05, 0.0, 3.4),
                               (min(d0, d1), max(d0, d1), ARCH_Y - ARCH_HW - 0.05, ARCH_Y + ARCH_HW + 0.05, 3.4, 3.45),
                               (min(d0, d1), max(d0, d1), ARCH_Y - ARCH_HW - 0.05, ARCH_Y + ARCH_HW + 0.05, -0.03, 0.0),
                               (min(d1, d1 + s*0.05), max(d1, d1 + s*0.05), ARCH_Y - ARCH_HW - 0.05, ARCH_Y + ARCH_HW + 0.05, 0.0, 3.45)):
        cube(bm, a, b, c, d, e, f)
    mesh_from_bm(f"vest_niche_{tag}", bm, DARK, COLL)
    bm = bmesh.new()                                                                          # molded brick edge around the arch (room side)
    ring = bmesh.new()
    segs = 48
    for yy in (x_in - s*0.02, x_in):
        pass
    # build the arch edge as a half ring in the YZ plane by rotating an XZ half ring
    half_ring_xz(bm, 0.0, 0.0, ARCH_HW, ARCH_HW + 0.09, 0.0, 0.03, 48)
    edge = mesh_from_bm(f"vest_arch_edge_{tag}", bm, BRICK_SIDE, COLL)
    edge.rotation_euler = (0, 0, math.pi/2 if s < 0 else -math.pi/2)                       # XZ ring -> YZ plane
    edge.location = (x_in - s*0.02 + (0.0 if s > 0 else 0.0), ARCH_Y, ARCH_SPRING)
    if s > 0: edge.location.x = x_in - 0.03
    bm = bmesh.new()                                                                          # jamb strips continuing the edge to the base
    for yy in (ARCH_Y - ARCH_HW - 0.09, ARCH_Y + ARCH_HW):
        cube(bm, min(x_in - s*0.02, x_in), max(x_in - s*0.02, x_in), yy, yy + 0.09, BASE_H, ARCH_SPRING)
    mesh_from_bm(f"vest_arch_jambs_{tag}", bm, BRICK_SIDE, COLL)

# ---------------------------------------------------------------- street wall: opening for the door set (no arch inside), oak paneling beside it
bm = bmesh.new(); cube(bm, -HW - WALL_T, HW + WALL_T, WALL_Y0, WALL_Y1, 0.0, CEIL_Z + 0.10); swall = mesh_from_bm("vest_wall_street", bm, BRICK_END, COLL)   # covers the door head up to the ceiling slab
bm = bmesh.new(); cube(bm, -DOOR_HALF_W, DOOR_HALF_W, WALL_Y0 - 0.3, WALL_Y1 + 0.3, -0.1, DOOR_TOP); c1 = mesh_from_bm("cut_door", bm, None, COLL)   # opening up to the door set's top rail, so its molding stays visible from the street
apply_boolean(swall, c1)
bm = bmesh.new()
for s in (-1, 1):
    x0, x1 = (DOOR_HALF_W, HW) if s > 0 else (-HW, -DOOR_HALF_W)
    cube(bm, x0, x1, WALL_Y1, WALL_Y1 + 0.05, BASE_H, CORN_Z0)                                # panel backing
    for (za, zb) in ((BASE_H + 0.12, 2.05), (2.20, CORN_Z0 - 0.10)):
        px0, px1 = x0 + 0.10, x1 - 0.10
        cube(bm, px0, px1, WALL_Y1 + 0.05, WALL_Y1 + 0.065, za, zb)
        rect_molding(bm, px0, px1, za, zb, WALL_Y1 + 0.065, [(o, -n) for (o, n) in PANEL_MLD])   # molding faces +y (into the room)
side_panels = mesh_from_bm("vest_paneling", bm, OAK, COLL)

# ---------------------------------------------------------------- oak cornice band around the room (frieze + projecting moldings)
bm = bmesh.new()
for s in (-1, 1): cube(bm, min(s*HW, s*(HW - 0.06)), max(s*HW, s*(HW - 0.06)), WALL_Y1, L, CORN_Z0, CORN_Z1)
cube(bm, -HW, HW, WALL_Y1, WALL_Y1 + 0.06, CORN_Z0, CORN_Z1)
# stepped moldings (three courses) under the ceiling
for k, (proud, za, zb) in enumerate(((0.10, CORN_Z0 + 0.06, CORN_Z0 + 0.11), (0.16, CORN_Z0 + 0.18, CORN_Z0 + 0.22), (0.24, CORN_Z1 - 0.08, CORN_Z1))):
    for s in (-1, 1): cube(bm, min(s*HW, s*(HW - proud)), max(s*HW, s*(HW - proud)), WALL_Y1, L, za, zb)
    cube(bm, -HW, HW, WALL_Y1, WALL_Y1 + proud, za, zb)
mesh_from_bm("vest_cornice", bm, OAK_CEIL, COLL)

# ---------------------------------------------------------------- coffered ceiling
bm = bmesh.new(); cube(bm, -HW - 0.05, HW + 0.05, WALL_Y1 - 0.02, L, CEIL_Z, CEIL_Z + 0.10); mesh_from_bm("vest_ceiling_field", bm, OAK_LIGHT_CEIL, COLL)   # slab tucked inside the street wall
bm = bmesh.new()
xs_long = [-HW + 0.24, -(HW - 0.75), (HW - 0.75), HW - 0.24]                                 # longitudinal beams (x)
for xb in xs_long: cube(bm, xb - BEAM_W/2, xb + BEAM_W/2, WALL_Y1, L, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
ys_cross = [WALL_Y1 + 0.24, WALL_Y1 + 0.24 + 0.75, L - 0.24 - 0.75, L - 0.24]                # transverse beams bounding the end rows
for yb in ys_cross: cube(bm, -HW, HW, yb - BEAM_W/2, yb + BEAM_W/2, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
# small coffers in the side rows and end rows
pitch = 0.75
y = WALL_Y1 + 0.24 + 0.75
while y < L - 0.24 - 0.75 - 0.1:
    for (xa, xb) in ((xs_long[0], xs_long[1]), (xs_long[2], xs_long[3])): cube(bm, xa, xb, y - BEAM_W/2, y + BEAM_W/2, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
    y += pitch
x = xs_long[1] + pitch
while x < xs_long[2] - 0.1:
    for (ya, yb) in ((ys_cross[0], ys_cross[1]), (ys_cross[2], ys_cross[3])): cube(bm, x - BEAM_W/2, x + BEAM_W/2, ya, yb, CEIL_Z - BEAM_D, CEIL_Z + 0.01)
    x += pitch
mesh_from_bm("vest_ceiling_beams", bm, OAK_CEIL, COLL)
# central raised panel with a heavy molded frame and the round medallion
cx0, cx1, cy0, cy1 = xs_long[1] + BEAM_W/2, xs_long[2] - BEAM_W/2, ys_cross[1] + BEAM_W/2, ys_cross[2] - BEAM_W/2
bm = bmesh.new()
rect_molding_xy(bm, cx0 + 0.02, cx1 - 0.02, cy0 + 0.02, cy1 - 0.02, CEIL_Z, BIG_MLD)
cube(bm, cx0 + 0.16, cx1 - 0.16, cy0 + 0.16, cy1 - 0.16, CEIL_Z - 0.02, CEIL_Z + 0.02)          # inner field slightly lower
mesh_from_bm("vest_ceiling_center_frame", bm, OAK_CEIL, COLL)
mx, my = 0.0, (cy0 + cy1)/2
bm = bmesh.new()
torus(bm, (mx, my, CEIL_Z - 0.03), 0.62, 0.05, None, 48, 12)
cylinder(bm, (mx, my, CEIL_Z - 0.035), 'Z', 0.60, 0.60, 0.03, 48)
torus(bm, (mx, my, CEIL_Z - 0.06), 0.30, 0.03, None, 36, 10)
cylinder(bm, (mx, my, CEIL_Z - 0.07), 'Z', 0.16, 0.16, 0.04, 24)
for i in range(12):                                                                            # rosette petals
    a = 2*math.pi*i/12
    ellipsoid(bm, (mx + 0.42*math.cos(a), my + 0.42*math.sin(a), CEIL_Z - 0.06), 0.09, 0.05, 0.025, 8, 6)
mesh_from_bm("vest_ceiling_medallion", bm, OAK_LIGHT_CEIL, COLL, smooth=True)

# ---------------------------------------------------------------- the lobby beyond: the atrium photo, projected with parallax
# (user 2026-09-28: "the other is a photo to use at the end of the portal entrance; do not distort the images"; then
# "bradbury_internal_2 is available in downloads. it could be preferable because it is wider; if blender supports
# paralax and the image can be used for that, implement; we need to dial down the light even further"). The owner's
# wide photograph of the Bradbury's atrium -- the arcaded corridor with its sconces on the left, the marble staircase
# under its iron balustrades, the handrailed wall on the right -- installed as
# assets/public/textures/bradbury_portal/lobby_atrium_photo_wide.png, is PROJECTED from its own camera onto a stand-in
# of the room it shows (camera projection mapping; portal_lib.mat_photo_projection), so seen from anywhere else it
# moves as a room does: the stair against the far wall, the corridor receding.
# The photo's camera, measured on the photo itself (1536 x 1024, one-point perspective): the vanishing point
# (PHOTO_CX, PHOTO_CY) where its wall bases meet and its floor's tile lattice aligns, the camera PHOTO_CAM_H over its
# floor and the focal length PHOTO_F, both from the floor's dot lattice (0.20 m tiles, as this hall's own) -- the dot
# spacing across a row grows with the row's drop below the horizon as 0.20 (v - cy) / h, and the rows step 0.20 m in
# depth -- which the bottom step's 16 cm riser confirms. The room then follows from the image: the wall bases at
# ROOM_XL and ROOM_XR, the stair's left edge at ROOM_STAIR_X, its bottom step's front at ROOM_STAIR_Y0, its flight
# rising ROOM_STAIR_SLOPE to the top tread at image row ROOM_STAIR_TOP_ROW, the corridor's far wall at ROOM_FAR_Y.
# The whole photographed scene is scaled about its camera by PHOTO_SCALE -- a projection is unchanged by that -- so the
# room is exactly as wide as this hall and continues its walls; the camera then stands at eye height and the photo's
# tiles are larger than this floor's, which a border across the hall's end separates. The camera stands on the hall's
# axis-line at the depth where the photo's frame still covers the opening up to the lintel across the hall's end (and
# its walls are in frame); the stand-in closes at ROOM_CEIL_Z, under the block's own ground-floor ceiling.
# The stand-in emits the photo at PHOTO_EMISSION -- 1.0 first, 0.4, then down again ("dial down the light even
# further") -- lights nothing (invisible to diffuse rays, no shadow) and shows only its inner faces; the camera, the door
# glass and the polished floor see it.
PHOTO_TEX = ("textures", "bradbury_portal", "lobby_atrium_photo_wide.png")
PHOTO_CX, PHOTO_CY = 694.0, 517.0   # the photo's vanishing point, pixels from its top-left corner
PHOTO_F = 1621.0                 # its focal length, pixels
PHOTO_CAM_H = 1.056              # its camera's height over its floor, metres at 0.20 m tiles
ROOM_XL, ROOM_XR = -1.72, 2.18   # the room's left and right wall bases, lateral from the photo's camera
ROOM_STAIR_X = 0.055             # the stair's left edge
ROOM_STAIR_Y0 = 4.99             # its bottom step's front, depth from the photo's camera
ROOM_STAIR_SLOPE = 0.60          # its flight's rise per metre (31 degrees)
ROOM_STAIR_TOP_ROW = 298.0       # the image row of its top tread
ROOM_FAR_Y = 14.03               # the corridor's far wall (its base at row 639)
PHOTO_SCALE = 2.0 * HW / (ROOM_XR - ROOM_XL)   # 1.513: the room as wide as the hall
ROOM_CEIL_Z = 4.20               # the stand-in's ceiling over the floor: just under the block's ground-floor ceiling (4.25 here)
LINTEL_Z = CORN_Z0               # the lintel across the hall's open end: its underside on the cornice's line
PHOTO_EMISSION = 0.2             # the photo's own light (1.0, then 0.4, both too bright from the street)
PHOTO_MAT, photo_im = mat_photo_projection("PORTAL_lobby_photo", PHOTO_TEX, PHOTO_EMISSION, PHOTO_CX, PHOTO_CY, PHOTO_F)
PW, PH = photo_im.size
_s = PHOTO_SCALE
cam_h = PHOTO_CAM_H * _s                                                          # 1.60: the projector at eye height
xl, xr, xs = ROOM_XL * _s, ROOM_XR * _s, ROOM_STAIR_X * _s                        # relative to the projector
ys0 = ROOM_STAIR_Y0 * _s
t_rise = (PHOTO_CY - ROOM_STAIR_TOP_ROW) / PHOTO_F                                # the top tread's (z - h) / y
y_top = (ROOM_STAIR_SLOPE * ROOM_STAIR_Y0 + PHOTO_CAM_H) / (ROOM_STAIR_SLOPE - t_rise) * _s
z_top = ROOM_STAIR_SLOPE * (y_top - ys0)                                          # the flight's top over the floor
y_far = ROOM_FAR_Y * _s
d_end = max((LINTEL_Z - cam_h) * PHOTO_F / PHOTO_CY,                              # the frame covers the opening up to the lintel
            -xl * PHOTO_F / PHOTO_CX, xr * PHOTO_F / (PW - PHOTO_CX)) + 0.02      # and both walls are in frame
proj = Vector((-(xl + xr) / 2.0, L - d_end, cam_h))                               # the projector, in the hall's frame
fz, cz = -cam_h, ROOM_CEIL_Z - cam_h
faces = [
    [(xl, d_end, fz), (xr, d_end, fz), (xr, y_far, fz), (xl, y_far, fz)],                     # floor
    [(xl, d_end, cz), (xr, d_end, cz), (xr, y_far, cz), (xl, y_far, cz)],                     # ceiling
    [(xl, d_end, fz), (xl, y_far, fz), (xl, y_far, cz), (xl, d_end, cz)],                     # left wall
    [(xr, d_end, fz), (xr, y_far, fz), (xr, y_far, cz), (xr, d_end, cz)],                     # right wall
    [(xl, y_far, fz), (xr, y_far, fz), (xr, y_far, cz), (xl, y_far, cz)],                     # far wall
    [(xs, ys0, fz), (xr, ys0, fz), (xr, y_top, fz + z_top), (xs, y_top, fz + z_top)],         # the stair's flight
    [(xs, y_top, fz + z_top), (xr, y_top, fz + z_top), (xr, y_top, cz), (xs, y_top, cz)],     # the wall over its top
    [(xs, ys0, fz), (xs, y_top, fz), (xs, y_top, fz + z_top)],                                # its side, toward the corridor
]
bm = bmesh.new()
for fc in faces:
    f = bm.faces.new([bm.verts.new(p) for p in fc]); f.normal_update()
    c = f.calc_center_median()
    if f.normal.dot(-c) < 0: f.normal_flip()                                      # every face looks toward the projector
me = bpy.data.meshes.new("vest_lobby_room"); bm.to_mesh(me); bm.free(); me.materials.append(PHOTO_MAT)
room = bpy.data.objects.new("vest_lobby_room", me); COLL.objects.link(room); room.location = proj
room.visible_shadow = False; room.visible_diffuse = False                         # seen, reflected, seen through glass; lighting nothing
bm = bmesh.new(); cube(bm, -HW - 0.05, HW + 0.05, L - 0.12, L + 0.02, LINTEL_Z, ROOM_CEIL_Z + 0.02)   # the lintel over the opening
mesh_from_bm("vest_end_lintel", bm, OAK_CEIL, COLL)
print(f"the lobby: {PW}x{PH} projected from ({proj.x:.3f}, {proj.y:.3f}, {proj.z:.3f}) at {PHOTO_SCALE:.3f} times the photo's "
      f"scale onto a room {xr - xl:.2f} wide, the hall's end {d_end:.2f} ahead of the projector, the stair from {ys0:.2f} "
      f"to {y_top:.2f} rising to {z_top:.2f}, the far wall at {y_far:.2f}, the ceiling at {ROOM_CEIL_Z:.2f}; emission {PHOTO_EMISSION}")

# ---------------------------------------------------------------- pendant lamp
bm = bmesh.new()
LAMP_DROP = 0.75
cylinder(bm, (mx, my, CEIL_Z - LAMP_DROP/2), 'Z', 0.018, 0.018, LAMP_DROP, 12)
ellipsoid(bm, (mx, my, CEIL_Z - LAMP_DROP - 0.05), 0.36, 0.36, 0.08, 32, 10)
cylinder(bm, (mx, my, CEIL_Z - LAMP_DROP + 0.03), 'Z', 0.06, 0.06, 0.08, 16)
mesh_from_bm("vest_lamp", bm, BRONZE, COLL, smooth=True)
bm = bmesh.new(); ellipsoid(bm, (mx, my, CEIL_Z - LAMP_DROP - 0.22), 0.24, 0.24, 0.19, 24, 10); mesh_from_bm("vest_lamp_globe", bm, mat_plain("PORTAL_lamp_glass", (0.95, 0.85, 0.65), 0.3), COLL, smooth=True)
for o in COLL.objects: o.location.y += DOOR_Y                    # the hall follows the door plane (portal_lib.DOOR_Y)
rig = setup_scene()
for n in ("VestLamp", "VestFill"):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
if not bpy.data.objects.get("VestLamp"):
    ld = bpy.data.lights.new("VestLamp", 'POINT'); ld.energy = 1100; ld.color = (1.0, 0.80, 0.55); ld.shadow_soft_size = 0.3
    lo = bpy.data.objects.new("VestLamp", ld); rig.objects.link(lo); lo.location = (mx, my, CEIL_Z - LAMP_DROP - 0.22)
if not bpy.data.objects.get("VestFill"):
    ad = bpy.data.lights.new("VestFill", 'AREA'); ad.energy = 700; ad.size = 4.0; ad.color = (1.0, 0.9, 0.8)
    ao = bpy.data.objects.new("VestFill", ad); rig.objects.link(ao); ao.location = (0.0, L + 0.6, 2.8)
    ao.rotation_euler = (Vector((0, 0.5, 1.8)) - Vector((0, L + 0.6, 2.8))).to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- cameras, renders, save
camera("HallView", (0.0, DOOR_Y + 6.7, 1.45), (0.0, DOOR_Y + 0.3, 2.0), 22)
camera("HallSide", (-1.9, DOOR_Y + 5.6, 1.5), (2.95, DOOR_Y + 2.7, 1.9), 30)
camera("HallCeiling", (0.0, DOOR_Y + 4.6, 1.1), (0.0, DOOR_Y + 2.4, 4.1), 24)
camera("HallOutsideTop", (1.6, DOOR_Y - 2.2, 4.6), (0.0, DOOR_Y + 0.2, 3.7), 32)
camera("HallToLobby", (0.0, DOOR_Y + 0.6, 1.6), (0.0, DOOR_Y + 6.3, 1.7), 24)                   # from just inside the doors, toward the lobby photo
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
S = bpy.context.scene; S.render.resolution_x = 1400; S.render.resolution_y = 1600
bg = S.world.node_tree.nodes.get("Background"); old_strength = bg.inputs[1].default_value if bg else None
if bg: bg.inputs[1].default_value = 0.30                                                    # interior shots: dim the sky so the glossy darks stay dark
render("HallView", os.path.join(OUT, "03_vestibule_view.png"))
render("HallSide", os.path.join(OUT, "03_vestibule_side.png"))
render("HallCeiling", os.path.join(OUT, "03_vestibule_ceiling.png"))
render("HallToLobby", os.path.join(OUT, "03_vestibule_to_lobby.png"))
if bg: bg.inputs[1].default_value = old_strength
render("HallOutsideTop", os.path.join(OUT, "03_vestibule_door_head_outside.png"))
S.camera = bpy.data.objects["HallView"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("VESTIBULE DONE", len(COLL.objects), "objects")
