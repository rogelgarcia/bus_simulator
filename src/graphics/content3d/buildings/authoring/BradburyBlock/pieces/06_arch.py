"""Piece 06 — the arch: block, archivolt ornament, spandrels, keystone.

A rectangular stone block resting on the pier capitals, square at its outer
borders, with the semicircular arch cut through its centre (intrados radius
1.26 = the piers' inner faces; the block continues the piers' edges at
x +/-1.60, y -2.70 / -1.97). On the street face, from the opening outward:
  4. a continuous 45-degree chamfer along the arris (3 cm on the face, 3 cm
     on the soffit) with small square notches subtracted from it at a close
     pitch: each notch is a 3 x 3 cm square bite out of the corner, 3 cm
     long along the ring, so the chamfer reads as a row of small squares;
  2. a strip of three fine concentric steps rising outward (the "strips
     around the arc") close to the opening (R 1.40 .. 1.46), springing from
     the pier capitals' abaci and interrupted by the keystone; then a plain
     band;
  1. the two sunken spandrel panels (3 cm deep) edged with a three-part
     molding (tiny square step, convex quarter-round, tiny square step): the
     curved edge follows the arch at R 1.56, the straight edges follow the
     block's side, the top border and the keystone, and the panel tapers to
     a thin tip toward the springing;
  3. a sunken panel carved into the soffit (intrados), edged with the same
     three-part molding as the outer pilasters' panels.
The keystone is a tall tapered console bracket (photo: from the band down
over the ring, 0.20 wide at the bottom, 0.30 at the top, projecting more at
the top than at the bottom with an S side profile); its leaf carving comes
later. The spandrel panels keep clear of its outline. The block's top sits 0.10 above the panels' top edge (4.08)
and the pilaster capitals (piece 07) top out at the same height.

Frame: x across, y depth (recess mouth at y = -2.10, the arch's street face
at y = -2.70), z up. Collection: ARCH.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

PIER_IN, PIER_OUT = 1.3635, 1.60 # the piers (piece 02, 0.2365 wide) carry the arch: their inner faces set the intrados (opening grown 2.35 cm so the band and the plain strip could shrink 10% while the band still touches the pilasters)
R_IN = PIER_IN
BLOCK_HALF = 1.61                # the block runs 5 mm into the pilasters (inner faces at 1.605, piece 07): no slit between them
STILT = 0.10                     # the opening rises straight this much above the impost before the curve starts (photo: about three notches read straight)
SPRING = 2.15                    # impost: top of the pier capitals = bottom of the block; the straight jambs run from here
CZ = SPRING + STILT              # 2.25: arch centre = where the curve starts (unchanged, so the crown stays at 3.59)
Y_BACK = -1.97                   # continues the back pier's rear face
Y_FACE = -2.70                   # continues the front pier's front face
# 4. continuous 45-degree chamfer along the arris (CHAMFER on the face and on the soffit), then square notches subtracted
#    from it: each notch is a CHAMFER x CHAMFER bite out of the corner, NOTCH_W long along the ring, NOTCH_PITCH apart
CHAMFER = 0.03
R_BEVEL = R_IN + CHAMFER         # 1.29: opening radius at the face plane
NOTCH_PITCH, NOTCH_W = 0.055, 0.03
# 2. strips: three fine concentric steps rising outward (r0, r1, height proud of the face), close to the opening;
#    they spring from the pier capitals' abaci (x 1.17 .. 1.69 at the springing)
STRIPS = ((1.4925, 1.605, 0.0053),)                               # one band 0.1125 wide (0.125 - 10%) out to 1.605 (its outer edge just touches the pilasters); plain strip to the notched edge 0.099 (0.11 - 10%)
BAND_STEP_H = 0.0053                                              # the tiny inner step, 5.3 mm high over the inner fifth of the width
def band_steps(w):                                                # (width, height) from the inner edge outward
    step = 0.2 * w                                                # every small feature is a fifth of the width: the tiny step's top, both risers, the outer step's top
    return ((step, BAND_STEP_H), (0.6 * w, BAND_STEP_H + step), (step, BAND_STEP_H + 2 * step))   # tiny step, plateau over three fifths, outer step
# 1. spandrel panels: curved triangles between the archivolt, the pilaster and the band, tapering to a tip toward the keystone
R_OUT = 1.76                     # panel's curved edge: concentric with the arch, 0.16 outside the ring (user's curve on the A/B pair)
PILASTER_IN = 1.605              # the pilasters' inner edges (piece 07), beside the block's sides
SIDE_MARGIN, KEY_MARGIN, PANEL_D = 0.09, 0.06, 0.03     # side edge 0.09 in from the pilaster (its foot then sits on the photo's row, z 3.15)
PANEL_TOP = 3.98                 # the panel's flat top, 0.15 under the band (photo)
# keystone outline (the spandrel panels keep KEY_MARGIN clear of it); the corbel is built inside it
KEY_W0, KEY_W1 = 0.20, 0.30                                  # keystone width at the bottom / top (a tapered console)
KEY_Z0 = 3.62                    # the console's bottom sits over the ring band (band 1.48 .. 1.60, crowns 3.73 .. 3.85); photo 3.64
KEY_H = 0.48; KEY_Z1 = KEY_Z0 + KEY_H   # 4.10 = the spandrel panels' top edge, just under the band
KEY_GROOVE_W, KEY_GROOVE_D = 0.008, 0.004
BLOCK_TOP = 4.13                 # the band bottom (piece 08 Z0): the block fills the wall up to it; pilaster capital tops (piece 07) sit at 4.16
# 3. soffit panel: (depth into the soffit, margin from the chamfer and from the back edge, arc margin from the springing),
#    edged with the pilasters' three-part molding SOFFIT_MLD_W wide
SOFFIT = (0.04, 0.10, 0.02); SOFFIT_MLD_W = 0.06                 # the soffit panel starts where the curve starts (0.02 in), not at the impost

COLL = ensure_collection("ARCH")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)

def prism_xz(bm, pts, y0, y1):
    """Polygon (x, z) extruded from y0 to y1 (n-gon caps; never triangulate a cutter: the exact boolean returns nothing)."""
    v0 = [bm.verts.new((x, y0, z)) for x, z in pts]; v1 = [bm.verts.new((x, y1, z)) for x, z in pts]
    n = len(pts); bm.faces.new(v0); bm.faces.new(tuple(reversed(v1)))
    for i in range(n): bm.faces.new((v0[i], v1[i], v1[(i+1) % n], v0[(i+1) % n]))
def sector_prism(bm, r0, r1, a0, a1, y0, y1, segs=96):
    """Annular sector about the arch centre (angles from +x toward +z) extruded from y0 to y1, built from quad strips."""
    def ring(y):
        return ([bm.verts.new((r1*math.cos(a0 + (a1-a0)*i/segs), y, CZ + r1*math.sin(a0 + (a1-a0)*i/segs))) for i in range(segs+1)],
                [bm.verts.new((r0*math.cos(a0 + (a1-a0)*i/segs), y, CZ + r0*math.sin(a0 + (a1-a0)*i/segs))) for i in range(segs+1)])
    (o0, i0), (o1, i1) = ring(y0), ring(y1)
    for i in range(segs):
        bm.faces.new((o0[i], i0[i], i0[i+1], o0[i+1])); bm.faces.new((o1[i], o1[i+1], i1[i+1], i1[i]))
        bm.faces.new((o0[i], o0[i+1], o1[i+1], o1[i])); bm.faces.new((i0[i], i1[i], i1[i+1], i0[i+1]))
    bm.faces.new((o0[0], o1[0], i1[0], i0[0])); bm.faces.new((o0[segs], i0[segs], i1[segs], o1[segs]))
def sector_cutter(name, r0, r1, a0, a1, y0, y1, segs=96):
    bm = bmesh.new(); sector_prism(bm, r0, r1, a0, a1, y0, y1, segs); return mesh_from_bm(name, bm, None, COLL)
def cutter(name, pts, y0, y1):
    bm = bmesh.new(); prism_xz(bm, pts, y0, y1); return mesh_from_bm(name, bm, None, COLL)

# ---------------------------------------------------------------- block with the arch cut through it
bm = bmesh.new(); cube(bm, -BLOCK_HALF, BLOCK_HALF, Y_FACE, Y_BACK, SPRING, BLOCK_TOP); block = mesh_from_bm("arch_block", bm, STONE, COLL)
bm = bmesh.new(); cylinder(bm, (0.0, (Y_FACE + Y_BACK)/2, CZ), 'Y', R_IN, R_IN, 1.4, 96); apply_boolean(block, mesh_from_bm("cut_arc", bm, None, COLL))
bm = bmesh.new(); cube(bm, -R_IN, R_IN, Y_FACE - 0.2, Y_BACK + 0.2, SPRING - 0.05, CZ + 0.01); apply_boolean(block, mesh_from_bm("cut_jambs", bm, None, COLL))   # the straight jambs of the stilt
# 4. chamfer along the arris: revolve a right triangle (hypotenuse on the 45-degree plane) around the arch, then bite
#    square notches out of the corner along it (all notches in one cutter, one boolean)
def revolve_cutter(name, pts_ry, a0, a1, segs=96):
    bm = bmesh.new(); rings = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        rings.append([bm.verts.new((r*math.cos(a), y, CZ + r*math.sin(a))) for (r, y) in pts_ry])
    n = len(pts_ry)
    for i in range(segs):
        A, B = rings[i], rings[i+1]
        for k in range(n): bm.faces.new((A[k], A[(k+1) % n], B[(k+1) % n], B[k]))
    bm.faces.new(tuple(reversed(rings[0]))); bm.faces.new(tuple(rings[-1]))
    return mesh_from_bm(name, bm, None, COLL)
CHAMFER_PROFILE = [(R_IN - 0.05, Y_FACE - 0.10), (R_IN + CHAMFER + 0.10, Y_FACE - 0.10), (R_IN - 0.05, Y_FACE + CHAMFER + 0.05)]   # (r, y): a right triangle, hypotenuse on the 45-degree plane
apply_boolean(block, revolve_cutter("cut_chamfer", CHAMFER_PROFILE, -0.02, math.pi + 0.02))
def prism_xy(bm, pts_xy, z0, z1):
    v0 = [bm.verts.new((x, y, z0)) for (x, y) in pts_xy]; v1 = [bm.verts.new((x, y, z1)) for (x, y) in pts_xy]
    bm.faces.new(tuple(reversed(v0))); bm.faces.new(tuple(v1))
    for i in range(len(pts_xy)): bm.faces.new((v0[i], v0[(i+1) % len(pts_xy)], v1[(i+1) % len(pts_xy)], v1[i]))
bm = bmesh.new()
for sx in (-1, 1): prism_xy(bm, [(sx * r, y) for (r, y) in CHAMFER_PROFILE], SPRING - 0.05, CZ + 0.001)      # the same chamfer straight down the jambs
apply_boolean(block, mesh_from_bm("cut_chamfer_jambs", bm, None, COLL))
bm = bmesh.new()
R_MID = R_IN + CHAMFER/2; ARC_LEN = math.pi * R_MID; PATH_LEN = ARC_LEN + 2 * STILT   # left jamb up, over the arc, right jamb down
N_NOTCH = int(round(PATH_LEN / NOTCH_PITCH))
for i in range(N_NOTCH):
    s_ = PATH_LEN * (i + 0.5) / N_NOTCH
    if s_ < STILT:                                             # left jamb: notch faces +x, runs along z
        u = Vector((-1.0, 0.0, 0.0)); t = Vector((0.0, 0.0, 1.0)); c = Vector((0.0, 0.0, SPRING + s_))
    elif s_ > STILT + ARC_LEN:                                 # right jamb
        u = Vector((1.0, 0.0, 0.0)); t = Vector((0.0, 0.0, 1.0)); c = Vector((0.0, 0.0, SPRING + (PATH_LEN - s_)))
    else:
        a = math.pi - (s_ - STILT) / R_MID
        u = Vector((math.cos(a), 0.0, math.sin(a))); t = Vector((-math.sin(a), 0.0, math.cos(a))); c = Vector((0.0, 0.0, CZ))
    vs = []
    for r in (R_IN - 0.05, R_IN + CHAMFER):
        for sgn in (-1, 1):
            for y in (Y_FACE - 0.10, Y_FACE + CHAMFER):
                q = c + u*r + t*(sgn*NOTCH_W/2); vs.append(bm.verts.new((q.x, y, q.z)))
    # vs order: (r0,s-,y0) (r0,s-,y1) (r0,s+,y0) (r0,s+,y1) (r1,s-,y0) (r1,s-,y1) (r1,s+,y0) (r1,s+,y1)
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[k] for k in f])
apply_boolean(block, mesh_from_bm("cut_notches", bm, None, COLL))
# 3. soffit panel: one carve, then the three-part molding lofted around it on the curved surface
S_DEPTH, S_YM, S_AM = SOFFIT; S_A0, S_A1 = S_AM / R_IN, math.pi - S_AM / R_IN
S_Y0, S_Y1 = Y_FACE + CHAMFER + S_YM, Y_BACK - S_YM
apply_boolean(block, sector_cutter("cut_soffit", R_IN - 0.05, R_IN + S_DEPTH, S_A0, S_A1, S_Y0, S_Y1))
def loft_closed_curved(bm, corners, inward, outs, profile):
    """loft_closed with a per-corner out direction (the local surface normal), for moldings on the curved soffit."""
    k = len(corners); rings = []
    for i in range(k):
        a = inward[(i-1) % k]; b = inward[i]
        m = (a + b).normalized(); m = m / max(0.2, m.dot(a))
        rings.append([bm.verts.new(corners[i] + m*o + outs[i]*n) for (o, n) in profile])
    q = len(profile)
    for i in range(k):
        A = rings[i]; B = rings[(i+1) % k]
        for j in range(q): bm.faces.new((A[j], A[(j+1) % q], B[(j+1) % q], B[j]))
def soffit_outline(n=48):
    """Outline of the soffit panel at the field radius, with the inward direction of each edge and the local normal."""
    R_f = R_IN + S_DEPTH; c = Vector((0.0, 0.0, CZ)); Y = Vector((0.0, 1.0, 0.0))
    u = lambda a: Vector((math.cos(a), 0.0, math.sin(a))); t = lambda a: Vector((-math.sin(a), 0.0, math.cos(a)))
    corners, inward, outs = [], [], []
    for i in range(n):                                                    # front edge, along the arc at y0
        a = S_A0 + (S_A1 - S_A0) * i / n
        corners.append(c + u(a)*R_f + Y*S_Y0); inward.append(Y); outs.append(-u(a))
    corners.append(c + u(S_A1)*R_f + Y*S_Y0); inward.append(-t(S_A1)); outs.append(-u(S_A1))   # end edge, along y
    for i in range(n):                                                    # back edge, along the arc at y1
        a = S_A1 - (S_A1 - S_A0) * i / n
        corners.append(c + u(a)*R_f + Y*S_Y1); inward.append(-Y); outs.append(-u(a))
    corners.append(c + u(S_A0)*R_f + Y*S_Y1); inward.append(t(S_A0)); outs.append(-u(S_A0))     # end edge back to the start
    return corners, inward, outs
bm = bmesh.new(); loft_closed_curved(bm, *soffit_outline(), three_part_profile(S_DEPTH, SOFFIT_MLD_W)); mesh_from_bm("soffit_molding", bm, STONE, COLL)

# ---------------------------------------------------------------- 1. spandrel panels with a molded edge
# The panel is a curved triangle: a straight side edge next to the pilaster, a flat top under the band, and an arc
# concentric with the arch (R_OUT) that meets the top in a sharp tip toward the keystone. Its molding is NOT a
# mitred loft (at the tip's 9 degrees a mitre would run 0.6 m): each profile point (o, n) gets its own exact inset
# outline - the top dropped by o, the side moved in by o, the arc's radius grown by o - so the rings never cross and
# the face-level outline keeps the point; the sunken field simply recedes from the tip as the molding gets deeper.
D = PANEL_D
SPANDREL_MLD = [(-0.003, D), (-0.003, -0.003), (0.05, -0.003), (0.05, 0.008), (0.041, 0.008)]   # back, field, inner square step
for k in range(1, 9):                                                                             # convex quarter-round from (0.041, 0.008) up to (0.011, 0.026): 0.03 wide, wider than the pilaster panels'
    t = math.pi/2 * k / 8
    SPANDREL_MLD.append((0.011 + 0.030*math.cos(t), 0.008 + 0.018*math.sin(t)))
SPANDREL_MLD += [(0.0, 0.026), (0.0, D)]                                                         # outer square step up to the face
N_SIDE, N_TOP, N_ARC = 4, 24, 48

def spandrel_outline(s, o=0.0):
    """Counter-clockwise (x, z) outline of the spandrel panel on side s (-1 left, +1 right), inset by o (metres, may
    be negative): side edge PILASTER_IN - SIDE_MARGIN - o, top PANEL_TOP - o, arc radius R_OUT + o. Sampled with a
    fixed vertex count (N_SIDE + N_TOP + N_ARC) so the insets can be lofted ring to ring."""
    xs = PILASTER_IN - SIDE_MARGIN - o; top = PANEL_TOP - o; R = R_OUT + o
    z_foot = CZ + math.sqrt(R**2 - xs**2)                     # where the arc meets the side edge
    x_tip = math.sqrt(R**2 - (top - CZ)**2)                   # where the arc meets the top: the tip
    a_tip = math.atan2(top - CZ, -x_tip); a_foot = math.atan2(z_foot - CZ, -xs)
    pts = []
    for i in range(N_SIDE): pts.append((-xs, z_foot + (top - z_foot) * i / N_SIDE))               # side edge, foot -> top corner
    for i in range(N_TOP): pts.append((-xs + (xs - x_tip) * i / N_TOP, top))                       # top edge, corner -> tip
    for i in range(N_ARC): pts.append((R*math.cos(a_tip + (a_foot - a_tip) * i / N_ARC), CZ + R*math.sin(a_tip + (a_foot - a_tip) * i / N_ARC)))   # arc, tip -> foot
    if s > 0: pts = [(-x, z) for (x, z) in reversed(pts)]
    return pts
assert math.sqrt(R_OUT**2 - (PANEL_TOP - CZ)**2) > KEY_W1/2 + KEY_MARGIN, "the spandrel tip runs into the keystone"

for s, tag in ((-1, "L"), (1, "R")):
    apply_boolean(block, cutter(f"cut_spandrel_{tag}", spandrel_outline(s), Y_FACE - 0.10, Y_FACE + PANEL_D))
    bm = bmesh.new(); rings = []
    for (o, n) in SPANDREL_MLD:                                                                   # one exact inset outline per profile point
        rings.append([bm.verts.new((x, Y_FACE + PANEL_D - n, z)) for (x, z) in spandrel_outline(s, o)])
    q, m = len(rings), len(rings[0])
    for k in range(q):
        A, B = rings[k], rings[(k + 1) % q]
        for j in range(m): bm.faces.new((A[j], A[(j + 1) % m], B[(j + 1) % m], B[j]))
    mesh_from_bm(f"spandrel_{tag}_molding", bm, STONE, COLL)

# ---------------------------------------------------------------- 2. the archivolt band: one continuous piece from springing to springing; the keystone stands in front of it
def key_half(z): return KEY_W0/2 + (KEY_W1/2 - KEY_W0/2) * (z - KEY_Z0) / KEY_H
for r0, r1, h in STRIPS:
    w = r1 - r0; bm = bmesh.new(); ra = r0
    for width, hh in band_steps(w):                                                  # the steps from the inner edge outward, one piece
        rb = ra + width
        sector_prism(bm, ra, rb, 0.0, math.pi, Y_FACE + 0.002, Y_FACE - hh, 120)
        for sx in (-1, 1): cube(bm, min(sx*ra, sx*rb), max(sx*ra, sx*rb), Y_FACE - hh, Y_FACE + 0.002, SPRING, CZ)   # straight legs down the stilt
        ra = rb
    mesh_from_bm("arch_band", bm, STONE, COLL)                                     # fixed name (the overlay features refer to it)


# ---------------------------------------------------------------- bead-and-reel on the band's tiny inner step (photo: ball, spindle, ball, repeat)
BEAD_R = 0.5 * 0.2 * (STRIPS[0][1] - STRIPS[0][0])   # ball radius = half the tiny step's width (a fifth of the band): 11.25 mm
REEL_L, REEL_R_MID, REEL_R_END = 0.063, BEAD_R, 0.4 * BEAD_R   # the reel: about 63 mm long, as thick as the beads through its flat middle, 40% at its ends
BEAD_SQUASH = 0.75                                # the beads are squashed along the run (a bit oblate): 0.75 of their radius
BR_OVERLAP = 0.002                               # the reels run this far into the balls so they visibly touch (no air between the elements)
R_BR = STRIPS[0][0] + 0.5 * 0.2 * (STRIPS[0][1] - STRIPS[0][0])          # centred on the tiny step (R 1.4925)
Y_BR = Y_FACE - BAND_STEP_H - 0.8 * BEAD_R                                # the elements sink a fifth of their radius into the step
ARC_BR = math.pi * R_BR; PATH_BR = ARC_BR + 2 * STILT                     # left leg up, over the arc, right leg down
BEAD_L = 2 * BEAD_R * BEAD_SQUASH                                         # a bead's length along the run
N_UNIT = int(round(PATH_BR / (2 * BEAD_L + REEL_L)))                      # whole ball-reel-ball units along the path
REEL_L = PATH_BR / N_UNIT - 2 * BEAD_L                                    # the reel length is trimmed so the units fill the path exactly: beads touching, a bead at both imposts
def br_point(s_):
    """Centre and travel direction on the bead ring's path at distance s_ from the left impost."""
    if s_ < STILT: return Vector((-R_BR, Y_BR, SPRING + s_)), Vector((0.0, 0.0, 1.0))
    if s_ > STILT + ARC_BR: return Vector((R_BR, Y_BR, SPRING + (PATH_BR - s_))), Vector((0.0, 0.0, -1.0))
    a = math.pi - (s_ - STILT) / R_BR
    return Vector((R_BR * math.cos(a), Y_BR, CZ + R_BR * math.sin(a))), Vector((math.sin(a), 0.0, -math.cos(a)))
def spindle(bm, c, t, L, r_mid, r_end, segs=12, rings=8):
    """A reel revolved about the direction t: radius r_end at both ends swelling to r_mid in the middle."""
    n = t.normalized(); u = n.cross(Vector((0.0, 1.0, 0.0))).normalized(); v = n.cross(u)
    loops = []
    for i in range(rings + 1):
        f = i / rings; r = r_end + (r_mid - r_end) * (1.0 - abs(2.0 * f - 1.0) ** 3); q = c + n * (L * (f - 0.5))   # rises fast at the ends, flat through the middle
        loops.append([bm.verts.new(q + (u * math.cos(2 * math.pi * k / segs) + v * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    for i in range(rings):
        A, B = loops[i], loops[i + 1]
        for k in range(segs): bm.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]))
    bm.faces.new(tuple(reversed(loops[0]))); bm.faces.new(tuple(loops[-1]))
bm = bmesh.new(); s0 = 0.0
for i in range(N_UNIT):
    for kind, length in (("ball", BEAD_L), ("reel", REEL_L), ("ball", BEAD_L)):
        c, t = br_point(s0 + length / 2)
        if kind == "ball":
            n = t.normalized(); u = n.cross(Vector((0.0, 1.0, 0.0))).normalized(); v = n.cross(u)
            frame = Matrix((u, v, n)).transposed().to_4x4()                                    # local z along the run
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=BEAD_R, matrix=Matrix.Translation(c) @ frame @ Matrix.Diagonal((1.0, 1.0, BEAD_SQUASH, 1.0)))
        else: spindle(bm, c, t, length + 2 * BR_OVERLAP, REEL_R_MID, REEL_R_END)
        s0 += length
beads = mesh_from_bm("arch_beads", bm, STONE, COLL, smooth=True); mark_sharp(beads, 40.0)

# ---------------------------------------------------------------- leaf-and-tongue motifs on the band's middle step (ornaments/arch_leaf.blend, linked)
leaf_me = linked_mesh("arch_leaf", "arch_leaf.blend"); leaf_outer_me = linked_mesh("arch_leaf_outer", "arch_leaf.blend")   # the stem and the outer part, separate objects
R_LF = 0.5 * (STRIPS[0][0] + 0.2 * (STRIPS[0][1] - STRIPS[0][0]) + STRIPS[0][1] - 0.2 * (STRIPS[0][1] - STRIPS[0][0]))   # middle of the plateau (R 1.549)
Y_LF = Y_FACE - band_steps(STRIPS[0][1] - STRIPS[0][0])[1][1]              # the plateau's surface: the motifs stand on it
LEAF_W, LEAF_PITCH = 0.027, 0.033                                         # motif width across the run and its nominal pitch (about a fifth of air between motifs)
ARC_LF = math.pi * R_LF; PATH_LF = ARC_LF + 2 * STILT
N_LEAF = int(round(PATH_LF / LEAF_PITCH)); pitch_lf = PATH_LF / N_LEAF
def lf_frame(s_):
    """Centre, run direction and outward radial direction on the plateau path at distance s_ from the left impost."""
    if s_ < STILT: return Vector((-R_LF, Y_LF, SPRING + s_)), Vector((0.0, 0.0, 1.0)), Vector((-1.0, 0.0, 0.0))
    if s_ > STILT + ARC_LF: return Vector((R_LF, Y_LF, SPRING + (PATH_LF - s_))), Vector((0.0, 0.0, -1.0)), Vector((1.0, 0.0, 0.0))
    a = math.pi - (s_ - STILT) / R_LF
    return Vector((R_LF * math.cos(a), Y_LF, CZ + R_LF * math.sin(a))), Vector((math.sin(a), 0.0, -math.cos(a))), Vector((math.cos(a), 0.0, math.sin(a)))
for i in range(N_LEAF):
    c, t, r = lf_frame(pitch_lf * (i + 0.5))
    M = Matrix((t, r, t.cross(r))).transposed().to_4x4()                   # local x along the run, y outward across the band (cap at the outer edge), z out of the wall
    M.translation = c
    o = bpy.data.objects.new(f"arch_leaf_{i:03d}", leaf_me); COLL.objects.link(o); o.matrix_world = M
    o2 = bpy.data.objects.new(f"arch_leaf_outer_{i:03d}", leaf_outer_me); COLL.objects.link(o2); o2.matrix_world = M.copy()

# ---------------------------------------------------------------- keystone: a tall tapered console bracket (base shape; its leaf carving comes later)
# front: a trapezoid KEY_W0 wide at the bottom, KEY_W1 at the top, from just over the ring up to the band;
# side: an S-profile projecting KEY_D0 at the bottom and KEY_D1 at the top, embedded 2 cm into the block
CARVED = mat_sandstone("PORTAL_sandstone_carved", joints=False)
KEY_D0, KEY_D1, KEY_LEVELS = 0.03, 0.14, 14
bm = bmesh.new(); levels = []
for k in range(KEY_LEVELS + 1):
    t = k / KEY_LEVELS; z = KEY_Z0 + KEY_H * t
    hw = KEY_W0/2 + (KEY_W1/2 - KEY_W0/2) * t
    dd = KEY_D0 + (KEY_D1 - KEY_D0) * (3*t*t - 2*t*t*t)                 # smooth S from the bottom to the top projection
    levels.append([bm.verts.new(p) for p in ((-hw, Y_FACE + 0.02, z), (hw, Y_FACE + 0.02, z), (hw, Y_FACE - dd, z), (-hw, Y_FACE - dd, z))])
for k in range(KEY_LEVELS):
    A, B = levels[k], levels[k+1]
    for i in range(4): bm.faces.new((A[i], A[(i+1) % 4], B[(i+1) % 4], B[i]))
bm.faces.new(tuple(reversed(levels[0]))); bm.faces.new(tuple(levels[-1]))
keystone = mesh_from_bm("arch_keystone", bm, CARVED, COLL, smooth=True)
mark_sharp(keystone, 18.0)

# ---------------------------------------------------------------- cameras, renders, save
rig = setup_scene()
camera("PortalFront", (0.0, -11.0, 2.0), (0.0, -2.4, 2.9), 35)
camera("PortalLow", (2.8, -5.6, 0.7), (0.0, -2.3, 3.4), 26)
camera("ArchDetail", (-1.7, -6.8, 3.5), (-0.85, -2.7, 3.45), 45)
camera("ArchBevel", (1.35, -4.3, 3.0), (0.62, -2.70, 3.45), 85)
camera("ArchSoffit", (-0.35, -2.45, 1.3), (1.05, -2.35, 2.95), 45)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
S = bpy.context.scene; S.render.resolution_x = 1400; S.render.resolution_y = 1600
render("PortalFront", os.path.join(OUT, "06_arch_front.png"))
render("PortalLow", os.path.join(OUT, "06_arch_low.png"))
render("ArchDetail", os.path.join(OUT, "06_arch_detail.png"))
render("ArchBevel", os.path.join(OUT, "06_arch_bevel.png"))
render("ArchSoffit", os.path.join(OUT, "06_arch_soffit.png"))
S.camera = bpy.data.objects["PortalFront"]
purge_orphans()
bpy.ops.file.make_paths_relative()                                 # the linked ornament files stay relative to the portal file
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("ARCH DONE", len(COLL.objects), "objects")
