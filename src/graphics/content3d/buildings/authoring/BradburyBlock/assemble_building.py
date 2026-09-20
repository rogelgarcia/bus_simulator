# Assemble the whole Bradbury block with the hand-modelled portal.
#
#     blender -b -P assemble_building.py [-- --no-render] [--samples N]
#
# Opens the as-exported game baseline (tests/artifacts/blender/bradbury/before/bradbury_block_before.blend),
# strips the game's portal parts, doors and steps on both portal faces (C = the Broadway entry looking +x at
# x 12.529, E = the game's mirrored copy looking -x at x -36.529), adds a third portal on the 3rd Street face A
# (looking -y at y -17.879, as far from the west corner as C's is from its north corner, with C's bay composition read
# from that far corner: 2, 3, 2, portal, 2, 3, fillers, the door bay at the chamfer; user 2026-09-12: face A equals
# face B), gives the ground floor the pink sandstone
# (as build_portal_v3 did), fills the game's 5.6 m opening down to the 4.66 m the portal needs, lays the storefronts
# out between equal piers (the pilaster's width plus the narrow strip on both sides), LINKS the
# `PORTAL` collection from bradbury_portal.blend as two collection instances (the building always shows the
# portal's latest saved state) and builds the ground-floor entablature around the building on the frieze band's
# top (from the photos: a small half-round bead, the teeth, a convex ovolo right above them, a small squared top
# step with a tiny bevel), jogging out over the portal's proud frieze band on both portal faces and stepping back,
# with the zone wall and the crown above, over every three-pane storefront (the game's band wall carved and lined).
#
# Output: tests/artifacts/blender/bradbury/portal_project/bradbury_block.blend (next to the portal file, which
# it links as //bradbury_portal.blend) and review renders in
# tests/artifacts/screens/bradbury_fix/portal_project/building/.
import bpy, bmesh, math, os, sys, time, argparse
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--no-render", action="store_true", help="skip the review renders")
ap.add_argument("--samples", type=int, default=96, help="Cycles samples for the review renders")
args = ap.parse_args(argv)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))            # the repo (worktree) root
ART = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury")
BASE = os.path.join(ART, "before", "bradbury_block_before.blend")
PORTAL = os.path.join(ART, "portal_project", "bradbury_portal.blend")
OUT = os.path.join(ART, "portal_project", "bradbury_block.blend")
SHOTS = os.path.join(ROOT, "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "building")
os.makedirs(SHOTS, exist_ok=True)

# ---------------------------------------------------------------- the building (Blender axes: x = three x, y = -three z, z = up)
SHRINK = 0.502                    # the corner bays beside the chamfer go from the game's door bay (2.733 laid out) to the chamfer bay's 2.231 (user 2026-09-13): everything beyond their fourth pier, and the building's north and west faces, move in by this
CORNER_KEEP = 4.001               # the corner's four metres on each side of the chamfer (corner pier, bay, fourth pier; the single windows above) stay where they are
BAY_GROW = 4.465                  # the building grows one bay and its pier (user 2026-09-16, and the reference's own facade): a new
BAY_CUT_S, BAY_CUT_N = -2.43, -0.87   # two-window column on each long face. The two faces' window rhythms are staggered, so there is no
BAY_CUT_X = -1.60                 # one place clear on both: each takes its own cut, in its own gap, and the runs that wrap the building
                                  # take a third between them, slid per mesh so it lands clear of that mesh's own small elements
W_C, W_E = 12.529 + BAY_GROW, -36.529 + SHRINK   # wall planes of the two portal faces (the west one moved in, the east one out with the growth)
YC, YE = 1.379 - SHRINK, -1.379   # the game's opening centres on those faces (the Broadway one moved with its face)
Z_GROUND, Z_STEP = 0.201, 0.321   # the building's base (sidewalk top) and the top of the game's 12 cm step
GAME_HALF = 2.80                  # the game's opening: 5.6 m wide, the full ground-floor wall height
WALL_TOP = 4.572                  # top of the ground-floor wall (its cornice 4.572 .. 4.842, then the plain band to 5.842)
WALL_BAND_BOTTOM, WALL_BAND_TOP, FLOOR2_BOTTOM = 4.842, 5.842, 6.092   # the game's plain band between its two ground-floor cornices, and the second floor's start
M_FOOT_H = 0.20                                    # the foot on the crown's top (crown_profile, far below); the second floor's windows stand on it
FOOT_TOP = FLOOR2_BOTTOM + M_FOOT_H                # 6.292
CORNICE_UNDER = 15.332                             # where the game's mid cornice's underside was
CAP_LIFT = 0.300                                   # the room made over the fourth floor's window heads for the capitals (user 2026-09-16)
WALL24_TOP = CORNICE_UNDER + CAP_LIFT              # 15.632: the brick of floors 2 to 4 runs right up to it, the capitals' top and the
                                                   # foot of the band between floors 4 and 5 (B45_*, below)
HULL_GAME = [(-36.529, -17.879), (9.7 + BAY_GROW, -17.879), (12.529 + BAY_GROW, -15.05), (12.529 + BAY_GROW, 17.879), (-36.529, 17.879)]   # the game's ground floor outline (chamfered SE corner), grown by the new bay
HULL = [(-36.529 + SHRINK, -17.879), (9.7 + BAY_GROW, -17.879), (12.529 + BAY_GROW, -15.05), (12.529 + BAY_GROW, 17.879 - SHRINK), (-36.529 + SHRINK, 17.879 - SHRINK)]   # the outline built here: the north and west faces moved in, the east end out

# ---------------------------------------------------------------- the portal (bradbury_portal.blend frame: x across, y depth + into the building, z up from the threshold)
P_SPANDREL_Y = -2.70              # the arch block's street face: goes on the wall plane
P_FACE_Y = -2.90                  # pilasters and frieze band: 0.20 proud of the wall
P_HALF = 2.33                     # frieze band / pilaster shafts half width (the portal is 4.66 m wide)
P_SIDEWALK_Z = -0.12              # the portal's sidewalk level (its own 12 cm step ends at the threshold, z = 0)
P_FRIEZE_TOP = 4.83               # top of the BRADBURY band (piece 08 Z1): the entablature sits on it
JOG = P_SPANDREL_Y - P_FACE_Y     # 0.20
FRIEZE_TOP = Z_GROUND - P_SIDEWALK_Z + P_FRIEZE_TOP    # 5.151 world
BAND_BOTTOM = FRIEZE_TOP - 0.67                        # the portal's frieze band is 0.67 tall (4.16 .. 4.83 in its frame): 4.481 world
TINY_W = 0.08                     # the narrow wall strip beside each pilaster, between it and the storefront (user, reference photo); ends 4 cm inside the capital's 0.12 overhang
WALL_OUT = JOG                    # 0.20: the plane the whole elevation stands on, out from the hull (user 2026-09-15: the wall
                                  # over a storefront may not stand behind the corner wall, so every wall, its support and its
                                  # pier come onto the one plane the corners and the portal's own columns already had). Only
                                  # the storefronts stay where the game left them, which makes them that much deeper.
BRICK_BACK = 0.30                 # and the brick of floors 2 to 5 sits this much behind that plane (user 2026-09-15,
BRICK_OUT = WALL_OUT - BRICK_BACK # deeper again 2026-09-16): the ground floor's stone reads as the base it is, each
COL_RELIEF = 0.30                 # course standing further out than the wall it carries -- the brick field, its columns
COL_OUT = BRICK_OUT + COL_RELIEF  # and the building's edges COL_RELIEF proud of it, then the cornice and crown over
                                  # them, then the portal's own. The whole brick mass moves on BRICK_BACK alone, columns
                                  # and edges with it, so their relief over the field does not change with its depth.
# The band between floors 4 and 5 (user 2026-09-17, reference photos 1-7): a rectangular band on every deep run of every
# face -- the field between the corner stretches and the centre pavilions, which do not carry it -- standing on the
# capitals' top. Its face is B45_STEP behind the raised bays' plane, the depth of the window recess (photo 2: "same
# depth"), so it makes a small step with them and stands 0.24 proud of the field. The bottom cornice with its brackets
# (to come) takes the B45_STEPS_H over the capitals, the top cornice (to come) B45_TOPC_H on the band's top, and the
# fifth floor's windows stand on that: everything from the game's mid cornice up is lifted UPPER_LIFT for it, and the
# raised bays' wall of floors 2 to 4 runs on up to the band's top to close the gap the lift opens beside the band.
B45_STEP = 0.06                                    # = BAY_D, the bay inset's depth (asserted where that is defined); the window recess itself was halved later
B45_FRONT = COL_OUT - B45_STEP                     # +0.14: the band's face
B45_STEPS_H = 0.18                                 # the moulding over the capitals and the brackets (user 2026-09-17, photo of the bracket course): a
                                                   # taller band 0.10, a step 0.03, a smaller step 0.02 and an edge ring 0.03 (C45_*, with the cornices);
                                                   # a thin plate under it was tried and taken out again (user), the moulding let down onto the brackets
B45_FIELD_H = 0.55                                 # the ornament field (photos 1, 4, 5: about 0.3 of the fourth floor's window height)
B45_MARGIN = 0.06                                  # a plain margin round the field, the same on all four sides (user 2026-09-17)
B45_H = B45_FIELD_H + 2 * B45_MARGIN               # 0.67: the band itself over the moulding, grown for the margin, not the field shrunk
B45_TOPC_H = 0.26                                  # the top cornice on it: dentils, a small step, a convex curve, an edge (= T45_H, asserted with the cornice: the fifth floor's windows stand on its very top, no sill of their own, user 2026-09-18)
B45_Z0 = WALL24_TOP                                # 15.632: the band's foot, on the capitals' top
B45_Z1 = B45_Z0 + B45_STEPS_H + B45_H              # 16.482: the band's top, the top cornice's foot, the raised bays' wall extension's top
B45_TOP = B45_Z1 + B45_TOPC_H                      # 16.742: the top cornice's top; the fifth floor's windows stand here
SILL5_GAME = 15.990                                # the top floor's sills' underside as the game has them (asserted at the lift)
UPPER_LIFT = B45_TOP - SILL5_GAME                  # 0.752: how far everything from the mid cornice up is lifted (0.300 of it for the capitals)
STRIP_OUT, STRIP_IN = 0.02, 0.55 + WALL_OUT  # the band strip and the pier ring around the building: 2 cm proud of the wall plane, and far enough into it to reach past the deepest storefront inset, so every reveal and soffit stays closed; the narrow strip shares its face

def portal_matrix(face_x, yc, angle):
    # local +x (across, viewer's right) -> along the face; local +y (into the building) -> into the wall; the spandrel face on the wall plane
    R = Matrix.Rotation(angle, 4, 'Z')
    M = R.copy(); M.translation = Vector((face_x, yc, Z_GROUND)) - (R @ Vector((0.0, P_SPANDREL_Y, P_SIDEWALK_Z)))
    return M

# ---------------------------------------------------------------- baseline
bpy.ops.wm.open_mainfile(filepath=BASE)
S = bpy.context.scene
FIT = bpy.data.collections.new("PORTAL_FIT"); S.collection.children.link(FIT)   # everything built to fit the portal and the references
def wbbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
def mesh_from_bm(name, bm, mat, coll, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); coll.objects.link(o); return o
def tf(bm, verts, M): bmesh.ops.transform(bm, matrix=M, verts=verts)
def cube(bm, x0, x1, y0, y1, z0, z1):
    r = bmesh.ops.create_cube(bm, size=1.0)
    tf(bm, r["verts"], Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)))
def sweep(bm, path, profile, zbase, caps=False):
    # closed (o, z) profile swept along an open polyline (world XY) with mitred corners; o = left of travel = outward
    # on this clockwise loop. A mitre carries a point |o| from the path |o|*tan(half the turn) ALONG it as well, so a
    # break shallower than the moulding's own projection -- the edge capitals' 0.08 against the crown's 0.165 -- cannot
    # be wrapped by it and folds a sliver of the strip at its corners (see README: tried and rejected fixes).
    # caps: the path is a piece that stops short (the impost course between two windows), closed at both its ends.
    n = len(path); normals = []
    for i in range(n - 1):
        d = (Vector(path[i + 1]) - Vector(path[i])).normalized(); normals.append(Vector((-d.y, d.x)))
    rings = []
    for i in range(n):
        if i == 0: m = normals[0]
        elif i == n - 1: m = normals[-1]
        else:
            a, b = normals[i - 1], normals[i]; m = (a + b).normalized(); m = m / max(0.2, m.dot(a))
        P = Vector(path[i]); rings.append([bm.verts.new((P.x + m.x * o, P.y + m.y * o, zbase + z)) for (o, z) in profile])
    k = len(profile)
    for i in range(n - 1):
        for j in range(k): bm.faces.new((rings[i][j], rings[i][(j + 1) % k], rings[i + 1][(j + 1) % k], rings[i + 1][j]))
    if caps: bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)   # a loop closes on itself (path[0] == path[-1]): no end caps
def remove(objs):
    for o in objs:
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0: bpy.data.meshes.remove(me)

# The corner bays beside the chamfer become as wide as the chamfer bay (further down), which moves the fourth pier and
# everything beyond it toward the corner by SHRINK on both faces; the building follows: its north and west faces move in
# by SHRINK (HULL above is the moved outline) and every game object beyond the corner's CORNER_KEEP moves with its face
# here, object by object, or vertex by vertex for the meshes that run around the building (walls, cornices, roofs, the
# coping). The corner's four metres stay. On the top floor the corner's single window on each of those faces, with its
# arched hole in the game's wall__21, slides toward the corner to centre where the window below it is (like the
# chamfer's, centred on its face) (user 2026-09-13).
# The building grows one bay before anything is measured off it (user 2026-09-16): everything east of BAY_CUT_X moves
# out by BAY_GROW and the runs that cross the cut -- the walls, the cornices, the coping, the roof -- stretch with it,
# vertex by vertex. Done here, on the game's own geometry, so the outline, the excess strips, the bay layout and every
# ring built later simply follow the two longer faces; the cut falls in the gap between two window columns, so nothing
# small is sliced. A run that shares its mesh takes a copy of its own first.
def run_cut(me, mw):
    # the cut for one run, slid off BAY_CUT_X until it falls clear of every small element the mesh carries there (a
    # cornice's modillions, the ornament's blocks): the same trick the excess strips use
    spans = []
    for pl in me.polygons:
        xs = [(mw @ me.vertices[i].co).x for i in pl.vertices]
        if max(xs) - min(xs) < 0.35: spans.append((min(xs) - 0.02, max(xs) + 0.02))
    return next((BAY_CUT_X + 0.01 * k for k in sorted(range(-60, 61), key=abs)
                 if not any(a < BAY_CUT_X + 0.01 * k < b for a, b in spans)), BAY_CUT_X)
n_grow_o = n_grow_v = 0
for o in [q for q in bpy.data.objects if q.type == 'MESH' and q.data.vertices]:
    a, b = wbbox(o)
    if b.x - a.x > 8.0:
        if o.data.users > 1: o.data = o.data.copy()
        me = o.data; mw = o.matrix_world; inv = mw.inverted(); cut = run_cut(me, mw)
        for v in me.vertices:
            w = mw @ v.co
            # each vertex cuts where its own face is clear: one cut for the whole mesh slices a window bay on the other
            # face, and the panel it stretches comes out lopsided, its rim tighter than its lights (user 2026-09-16)
            c = BAY_CUT_S if w.y < -16.5 else (BAY_CUT_N if w.y > 16.5 else cut)
            if w.x > c: v.co = inv @ Vector((w.x + BAY_GROW, w.y, w.z)); n_grow_v += 1
        me.update()
    else:
        y = (a.y + b.y) / 2
        cut = BAY_CUT_S if y < -16.5 else (BAY_CUT_N if y > 16.5 else BAY_CUT_X)     # each face cuts in its own gap
        if (a.x + b.x) / 2 > cut:
            o.matrix_world = Matrix.Translation(Vector((BAY_GROW, 0.0, 0.0))) @ o.matrix_world; n_grow_o += 1
bpy.context.view_layer.update()                        # the bounding boxes everything below is measured by are cached
print(f"the building grown one bay ({BAY_GROW:+.3f}) at x {BAY_CUT_S:+.2f} on 3rd Street, {BAY_CUT_N:+.2f} on the north face, "
      f"{BAY_CUT_X:+.2f} for the runs: {n_grow_o} objects moved, {n_grow_v} vertices stretched")
# and the gap it opened is filled with a copy of the two-window column just west of it -- its storefront, its window
# sets on every floor, everything but the fire escape -- set down one bay east, so the layout below simply counts one
# more bay and one more set on each long face and spaces them all again (user 2026-09-16).
def xmid(o): a, b = wbbox(o); return (a.x + b.x) / 2
for cut, y_lo, y_hi, tag in ((BAY_CUT_S, -19.0, -16.5, "3rd Street"), (BAY_CUT_N, 16.5, 19.0, "the north face")):
    frames = []                                                        # the window frames of floors 2 to 4, as x spans
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith("mesh__") or not o.data.vertices: continue
        a, b = wbbox(o)
        if not (y_lo < (a.y + b.y) / 2 < y_hi) or not (6.0 < a.z and b.z < 15.2 and b.z - a.z > 1.5): continue
        frames.append((a.x, b.x))
    groups = []                                                        # merged into the columns they stand in
    for a, b in sorted(frames):
        if groups and a <= groups[-1][1] + 0.35: groups[-1][1] = max(groups[-1][1], b)
        else: groups.append([a, b])
    src = max((g for g in groups if g[1] < cut and g[1] - g[0] < 3.0), key=lambda g: g[1])   # the two-window column west of the cut
    take = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.vertices
            and not o.name.startswith("attachment")                                  # the copy has no fire escape (user)
            and wbbox(o)[1].z < 6.2                                                  # its storefront only: the windows on
            and (wbbox(o)[1].x - wbbox(o)[0].x) < 5.0                                # every floor come from the fill below
            and y_lo < (wbbox(o)[0].y + wbbox(o)[1].y) / 2 < y_hi
            and src[0] - 0.15 < xmid(o) < src[1] + 0.15]
    made = []
    for o in take:
        c = o.copy(); c.data = o.data.copy()
        for coll in o.users_collection: coll.objects.link(c)
        c.matrix_world = Matrix.Translation(Vector((BAY_GROW, 0.0, 0.0))) @ o.matrix_world
        made.append(c)
    print(f"the new bay on {tag}: {len(made)} storefront parts copied from the column at x {src[0]:.2f}..{src[1]:.2f}, one bay east")
HULL_GAME_E = [(Vector(HULL_GAME[i]), Vector(HULL_GAME[(i + 1) % 5])) for i in range(5)]
def game_frames(fi, z_lo, z_hi):
    # the window frames on a game face between two heights (8 cm deep boxes over 1.5 m tall) as (s0, s1) along the face
    A, B = HULL_GAME_E[fi]; t = (B - A).normalized(); n = Vector((t.y, -t.x)); out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith("mesh__"): continue
        a, b = wbbox(o)
        if a.z < z_lo or b.z > z_hi or b.z - a.z < 1.5: continue
        cs = [o.matrix_world @ Vector(q) for q in o.bound_box]
        ds = [(Vector((q.x, q.y)) - A).dot(n) for q in cs]; ss = [(Vector((q.x, q.y)) - A).dot(t) for q in cs]
        if abs(sum(ds) / 8) < 0.7 and 0.05 < max(ds) - min(ds) < 0.12 and -0.1 < min(ss) and max(ss) < (B - A).length + 0.1: out.append((min(ss), max(ss)))
    return sorted(out)
L0_GAME = (HULL_GAME_E[0][1] - HULL_GAME_E[0][0]).length
_cham = game_frames(1, 15.5, 20.0); TOP_CENTRE = (_cham[0][0] + _cham[0][1]) / 2     # the chamfer's top-floor window: centred on its face, over the one below
TOP_C, TOP_S = game_frames(2, 15.5, 20.0)[0], game_frames(0, 15.5, 20.0)[-1]           # the top-floor windows nearest the chamfer on the two faces beside it
TOP_ALIGN_C = TOP_CENTRE - (TOP_C[0] + TOP_C[1]) / 2                # along the Broadway face: negative is toward the corner
TOP_ALIGN_S = (L0_GAME - TOP_CENTRE) - (TOP_S[0] + TOP_S[1]) / 2   # along the 3rd Street face: positive is toward the corner
def top_pilaster(fi, lo, hi):
    # the top floor's pilaster closing the corner bay on a face beside the chamfer: the flush strip (its two seams on the
    # wall plane within lo .. hi) before the wall steps down to its field
    w = bpy.data.objects["wall__21"]; A, B = HULL_GAME_E[fi]; t = (B - A).normalized(); n = Vector((t.y, -t.x)); ss = set()
    for v in w.data.vertices:
        q = (w.matrix_world @ v.co).xy; s_ = (q - A).dot(t)
        if lo < s_ < hi and abs((q - A).dot(n)) < 0.005: ss.add(round(s_, 3))
    assert len(ss) == 2, (fi, sorted(ss)); return min(ss), max(ss)
PIL_C = top_pilaster(2, CORNER_KEEP - 0.5, CORNER_KEEP + 1.0)                          # the game's 3.929 .. 4.429
PIL_S = top_pilaster(0, L0_GAME - CORNER_KEEP - 1.0, L0_GAME - CORNER_KEEP + 0.5)
PIL_MOVE_C, PIL_MOVE_S = CORNER_KEEP - PIL_C[1], (L0_GAME - CORNER_KEEP) - PIL_S[0]   # the pilaster moves whole, to end on the marker
ZONE = 0.9                                                         # the NW corner: the game's geometry within this of it moves with it
L3_GAME, L4_GAME = (HULL_GAME_E[3][1] - HULL_GAME_E[3][0]).length, (HULL_GAME_E[4][1] - HULL_GAME_E[4][0]).length
# The excess on each moving face: a SHRINK-long strip along it, (lo, hi, side), that the moving zone (beyond hi when side is
# +1, below lo when -1) slides over. Vertices in the zone shift by SHRINK; vertices inside the strip go to its far end, so a
# wall face spanning it shrinks and nothing turns inside out; small elements standing entirely inside it (a cornice's
# modillion blocks) collapse and are removed. Each mesh slides the strip along the face until neither end cuts one of
# its small elements, so the blocks on both sides stay whole.
EXCESS = {2: (CORNER_KEEP, CORNER_KEEP + SHRINK, 1), 0: (L0_GAME - CORNER_KEEP - SHRINK, L0_GAME - CORNER_KEEP, -1),
          3: (L3_GAME - ZONE - SHRINK, L3_GAME - ZONE, 1), 4: (ZONE, ZONE + SHRINK, -1)}
def home_face(q):
    # the game face a point belongs to (the nearest, within 0.9 of it) and its place along it
    best = None
    for i, (A, B) in enumerate(HULL_GAME_E):
        t = (B - A).normalized(); n = Vector((t.y, -t.x)); d = (q - A).dot(n); s_ = (q - A).dot(t); L = (B - A).length
        if abs(d) > 0.9 or s_ < -0.9 or s_ > L + 0.9: continue
        if best is None or abs(d) < best[1]: best = (i, abs(d), s_)
    return best
def s_move(fi, s_, exc):
    # the move along the face and whether the point stood inside the excess
    if fi not in exc: return 0.0, False
    lo, hi, side = exc[fi]
    if side > 0: return (-SHRINK, False) if s_ > hi else ((lo - s_, True) if s_ > lo else (0.0, False))
    return (SHRINK, False) if s_ < lo else ((hi - s_, True) if s_ < hi else (0.0, False))
def move_of(hf, exc, top, pil):
    # the move of a point of the game's geometry; `top`: the top floor's wall or one of its window parts, where the corner
    # window's hole slides too; `pil`: the top floor's wall, caps and fittings, where the corner bay's pilaster (with its
    # impost and the parapet pedestal over it) moves whole to end on the marker instead of collapsing in the excess
    if hf is None: return 0.0, 0.0, False
    fi, d, s_ = hf; A, B = HULL_GAME_E[fi]; t = (B - A).normalized()
    if pil and fi == 2 and PIL_C[0] - 0.01 < s_ < PIL_C[1] + 0.01: ds, inside = PIL_MOVE_C, False
    elif pil and fi == 0 and PIL_S[0] - 0.01 < s_ < PIL_S[1] + 0.01: ds, inside = PIL_MOVE_S, False
    else: ds, inside = s_move(fi, s_, exc)
    dx, dy = t.x * ds, t.y * ds
    if fi == 3: dy = -SHRINK                                                          # the whole north face comes in
    elif fi == 4: dx = SHRINK                                                         # the whole west face comes in
    elif top and fi == 2 and TOP_C[0] - 0.5 < s_ < TOP_C[1] + 0.5: dy = TOP_ALIGN_C
    elif top and fi == 0 and TOP_S[0] - 0.5 < s_ < TOP_S[1] + 0.5: dx = TOP_ALIGN_S
    return dx, dy, inside
def object_excess(me, hf):
    # the mesh's own excess strips: the nominal ones slid along their face until neither end cuts a small element
    exc = {}
    for fi, (lo, hi, side) in EXCESS.items():
        spans = []
        for pl in me.polygons:
            hs = [hf[i] for i in pl.vertices]
            if any(h is None or h[0] != fi for h in hs): continue
            ss = [h[2] for h in hs]
            if max(ss) - min(ss) < 0.35: spans.append((min(ss) - 0.01, max(ss) + 0.01))
        def free(c): return not any(a < c < b for a, b in spans)
        k = next((k for k in sorted(range(-30, 31), key=abs) if free(lo + 0.01 * k) and free(hi + 0.01 * k)), 0)
        exc[fi] = (lo + 0.01 * k, hi + 0.01 * k, side)
    return exc
n_obj = n_vert = n_del = 0; top_parts = []; squeezed = []; pil_parts = []
for o in list(bpy.data.collections["Collection"].all_objects):
    if o.type != 'MESH': continue
    a, b = wbbox(o)
    if max(b.x - a.x, b.y - a.y) > 8.0 and o.data.users == 1:            # runs around the building: vertex by vertex
        me = o.data; mw = o.matrix_world; inv = mw.inverted(); top = o.name == "wall__21"; pil = o.name.startswith(("wall__21", "roof__2"))
        hf = [home_face((mw @ v.co).xy) for v in me.vertices]; exc = object_excess(me, hf); ins = [False] * len(me.vertices)
        for i, v in enumerate(me.vertices):
            w = mw @ v.co; dx, dy, ins[i] = move_of(hf[i], exc, top, pil and w.z > 15.5)
            if dx or dy: v.co = inv @ Vector((w.x + dx, w.y + dy, w.z)); n_vert += 1
        if o.name.startswith("cornice_ornament"):                        # the blocks that stood in the excess, collapsed onto its end: gone
            bm = bmesh.new(); bm.from_mesh(me); gone = [f for f in bm.faces if all(ins[v.index] for v in f.verts)]
            bmesh.ops.delete(bm, geom=gone, context='FACES'); bm.to_mesh(me); bm.free(); n_del += len(gone)
        me.update()
    else:
        c = (a + b) / 2; top = 15.6 < c.z < 19.5; pil = 15.6 < c.z < 20.8; hf = home_face(c.xy); dx, dy, inside = move_of(hf, EXCESS, top, pil)
        if inside: squeezed.append(o.name)
        if dx or dy:
            o.matrix_world = Matrix.Translation((dx, dy, 0.0)) @ o.matrix_world; n_obj += 1
            if abs(abs(dx) + abs(dy) - abs(PIL_MOVE_C)) < 0.001: pil_parts.append(o.name)
            elif top and abs(dx) + abs(dy) < SHRINK - 0.01: top_parts.append(o.name)
print(f"the game's geometry moved onto the new outline: {n_obj} objects, {n_vert} vertices, {n_del} ornament faces in the excess removed, objects squeezed in it: {squeezed}; the top floor's corner-bay pilasters moved whole by {PIL_MOVE_C:+.3f} / {PIL_MOVE_S:+.3f} with {pil_parts}; the top-floor corner windows centred by {TOP_ALIGN_C:+.3f} (Broadway) / {TOP_ALIGN_S:+.3f} (3rd Street): {top_parts}")
# the game's portal parts on both faces (same list as build_portal_v3), the facade lettering, the steps
names = ([f"portal_box__{i}" for i in (60, 111)] + [f"portal_panel__{i}" for i in (61, 62, 112, 113)]
         + [f"portal_level__{i}" for i in (63, 64, 114, 115)] + [f"portal_order__{i}" for i in (65, 116)]
         + [f"portal_impost__{i}" for i in range(66, 70)] + [f"portal_impost__{i}" for i in range(117, 121)]
         + [f"portal_base__{i}" for i in range(70, 74)] + [f"portal_base__{i}" for i in range(121, 125)]
         + [f"portal_ornament__{i}" for i in (74, 75, 125, 126)] + ["facade_lettering__2243"])
remove([o for n in names if (o := bpy.data.objects.get(n))])
remove([o for o in bpy.data.objects if o.name.startswith("portal_steps")])
KEEP = ("wall", "interior", "cornice", "roof", "parapet", "storefront", "bay_", "bf2_", "attachment")
def parts_in_opening(x_lo, x_hi, yc):
    # the game's door set (leaves, frame, fanlight, handles) sits inside the opening, just behind the wall plane
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith(KEEP): continue
        a, b = wbbox(o)
        if x_lo <= a.x and b.x <= x_hi and abs(0.5 * (a.y + b.y) - yc) < 1.5 and b.z < 4.6: out.append(o)
    return out
doors = parts_in_opening(W_C - 1.2, W_C + 0.1, YC) + parts_in_opening(W_E - 0.1, W_E + 1.2, YE)
print("removing the game's door parts:", [o.name for o in doors]); remove(doors)
# The upper floors' windows are backed by two flat planes: a grey pane over the glazed area and, behind it, one covering
# the whole opening with a photo atlas of furnished rooms. The atlas never shows (the grey pane hides it) and the building
# has no interiors, so those planes go (user 2026-09-13). The atlas is found by what it is rather than by name: the one
# image in the file whose every user is a flat four-vertex backdrop plane and which is not the dark shop silhouette
# behind the storefront glass (mean brightness tells the photos from the silhouette).
def backdrop_atlas():
    import numpy as np
    mats = {}
    for m in bpy.data.materials:
        if not m.node_tree: continue
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image: mats.setdefault(nd.image.name, set()).add(m.name)
    users = {}
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        for m in o.data.materials:
            if m: users.setdefault(m.name, []).append(o)
    out = []
    for im in bpy.data.images:
        if im.size[0] == 0 or im.name not in mats: continue
        objs = [o for m in mats[im.name] for o in users.get(m, ())]
        if not objs or any(len(o.data.vertices) != 4 for o in objs): continue      # a backdrop plane, not a frame or a wall
        a = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(a)
        if float(a.reshape(-1, 4)[:, :3].mean()) < 0.25: continue                  # the shop silhouette is nearly black
        out.append((im, objs))
    assert len(out) == 1, [im.name for im, objs in out]
    return out[0]
_atlas, _planes = backdrop_atlas()
print(f"removing the window backdrops with the interior photo atlas ({_atlas.name}, {tuple(_atlas.size)}): {len(_planes)} planes on floors "
      f"{min(wbbox(o)[0].z for o in _planes):.2f} .. {max(wbbox(o)[1].z for o in _planes):.2f}")
remove(_planes); bpy.data.images.remove(_atlas)
# The top floor's windows read pale beside the ones below: the pane behind their glass carries the same grey noise
# texture as floors 2 to 4 but tinted near white, where those tint it nearly black (user 2026-09-13). The top floor's
# panes take the material of the floors below, so every window above the storefronts shares one pane and one look. The
# storefronts keep their own, which is a different texture. The pane is found by what it is: the plane behind the glass,
# the glass being the only alpha-blended part of a window.
def tex_of(m):
    return next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None) if m and m.node_tree else None
def band(o, z_lo, z_hi):
    a, b = wbbox(o); return z_lo < (a.z + b.z) / 2 < z_hi
FLOOR_24, FLOOR_5 = (6.0, 15.2), (15.5, 19.5)
_cand = {}
for o in bpy.data.objects:
    if o.type != 'MESH' or not o.name.startswith("mesh__") or len(o.data.vertices) != 4 or not band(o, *FLOOR_24): continue
    _ms = [m for m in o.data.materials if m]
    if len(_ms) == 1 and _ms[0].blend_method != 'BLEND': _cand[_ms[0].name] = _cand.get(_ms[0].name, 0) + 1
PANE = bpy.data.materials[max(_cand, key=_cand.get)]; PANE_TEX = tex_of(PANE)
assert PANE_TEX is not None, PANE.name
_users = {}
for o in bpy.data.objects:
    if o.type == 'MESH': _users.setdefault(o.data.name, []).append(o)
n_pane = 0
for o in bpy.data.objects:
    if o.type != 'MESH' or not o.name.startswith("mesh__") or not band(o, *FLOOR_5): continue
    for i, m in enumerate(o.data.materials):
        if m is PANE or tex_of(m) is not PANE_TEX: continue
        assert all(band(u, *FLOOR_5) for u in _users[o.data.name]), o.name      # the mesh is not shared with a floor below
        o.data.materials[i] = PANE; n_pane += 1
print(f"top-floor window panes given the material of floors 2 to 4 ({PANE.name}, texture {PANE_TEX.name}): {n_pane} slots")

# ---------------------------------------------------------------- materials: the ground floor in pink sandstone (from build_portal_v3)
def sandstone(name, joints, dark=(0.33, 0.17, 0.11), light=(0.60, 0.36, 0.25)):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs[0], out.inputs[0])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 0.9; noise.inputs["Detail"].default_value = 8; noise.inputs["Roughness"].default_value = 0.62
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.70; ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    fine = nt.nodes.new("ShaderNodeTexNoise"); fine.inputs["Scale"].default_value = 40; fine.inputs["Detail"].default_value = 4
    nt.links.new(tc.outputs["Object"], fine.inputs["Vector"])
    grain = nt.nodes.new("ShaderNodeMixRGB"); grain.blend_type = 'MULTIPLY'; grain.inputs["Fac"].default_value = 0.18
    nt.links.new(ramp.outputs["Color"], grain.inputs["Color1"]); nt.links.new(fine.outputs["Color"], grain.inputs["Color2"])
    col = grain.outputs["Color"]
    if joints:
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.inputs["Scale"].default_value = 1.0; brick.inputs["Mortar Size"].default_value = 0.006
        brick.inputs["Color1"].default_value = (1, 1, 1, 1); brick.inputs["Color2"].default_value = (0.96, 0.96, 0.96, 1); brick.inputs["Mortar"].default_value = (0.45, 0.45, 0.45, 1)
        brick.inputs["Brick Width"].default_value = 1.5; brick.inputs["Row Height"].default_value = 0.6
        nt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
        jm = nt.nodes.new("ShaderNodeMixRGB"); jm.blend_type = 'MULTIPLY'; jm.inputs["Fac"].default_value = 1.0
        nt.links.new(col, jm.inputs["Color1"]); nt.links.new(brick.outputs["Color"], jm.inputs["Color2"]); col = jm.outputs["Color"]
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.25; bump.inputs["Distance"].default_value = 0.01
        nt.links.new(brick.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(col, bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.88
    return m
STONE = sandstone("Sandstone_Pink_Ashlar", True)
CARVED = sandstone("Sandstone_Pink_Carved", False)
PIER_STONE = sandstone("Sandstone_Pier", False, dark=(0.26, 0.11, 0.08), light=(0.46, 0.22, 0.15))   # the ground-floor piers: a darker, redder stone (user, reference)
def plain(name, color, roughness, metallic=0.0, transmission=0.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0); b.inputs["Roughness"].default_value = roughness; b.inputs["Metallic"].default_value = metallic
    if transmission: b.inputs["Transmission Weight"].default_value = transmission; b.inputs["IOR"].default_value = 1.5
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try: m.surface_render_method = "BLENDED"
        except Exception: pass
    return m
SF_METAL = plain("Storefront_Black_Metal", (0.02, 0.02, 0.02), 0.4, metallic=0.7)        # the sign band and the transom border (user: black metal)
SF_PAPER = plain("Storefront_White_Paper", (0.92, 0.90, 0.86), 0.9)                        # white paper behind the transom glass
SF_GLASS = plain("Storefront_Transom_Glass", (0.85, 0.9, 0.9), 0.05, transmission=1.0, alpha=0.35)
def images_of(mat):
    return {nd.image.name for nd in mat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image} if mat and mat.use_nodes else set()
keys = set()
for mn in ("MAT_31_MeshStandardMaterial", "MAT_132_MeshStandardMaterial"):
    if (m := bpy.data.materials.get(mn)): keys |= images_of(m)
for on in ("wall__7", "cornice__2245"):
    if (o := bpy.data.objects.get(on)):
        for m in o.data.materials: keys |= images_of(m)
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for i, m in enumerate(o.data.materials):
        if m and (images_of(m) & keys): o.data.materials[i] = STONE

# ---------------------------------------------------------------- fit the wall to the portal
wall = bpy.data.objects["wall__0"]
def world_box(name, x0, x1, y0, y1, z0, z1, mat, like, frame=None):
    # a box given in world coordinates (or in `frame`), stored in `like`'s local space so the object-space stone pattern continues from it
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1.0)
    M = like.matrix_world.inverted() @ (frame or Matrix.Identity(4)) @ Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r["verts"])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    o = bpy.data.objects.new(name, me); FIT.objects.link(o); o.matrix_world = like.matrix_world.copy(); return o
def cut_world_box(target, x0, x1, y0, y1, z0, z1, frame=None, op='DIFFERENCE'):
    # subtract a box (axis-aligned in world space, or in `frame`) from `target`: exact boolean through the depsgraph, one cutter at a time
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=(frame or Matrix.Identity(4)) @ Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)), verts=r["verts"])
    me = bpy.data.meshes.new("_cutter"); bm.to_mesh(me); bm.free()
    cutter = bpy.data.objects.new("_cutter", me); S.collection.objects.link(cutter)
    mod = target.modifiers.new("cut", 'BOOLEAN'); mod.operation = op; mod.object = cutter; mod.solver = 'EXACT'
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(target.evaluated_get(deps))
    old = target.data; target.modifiers.clear(); target.data = new_me
    new_me.materials.clear()
    for m in old.materials: new_me.materials.append(m)
    for p in new_me.polygons: p.material_index = 0
    bpy.data.meshes.remove(old); bpy.data.objects.remove(cutter, do_unlink=True); bpy.data.meshes.remove(me)
    assert len(new_me.vertices) > 8, f"the boolean cut emptied {target.name}"
def carve_faces(target, x0, x1, y0, y1, z0, z1, frame=None, keep_across=False):
    # remove the target's faces inside a box (axis-aligned in world space, or in `frame` when given). For the game's open
    # wall shells, where an exact boolean is unreliable (it left a cutter-shaped slab on one side and cut the other): the
    # mesh is bisected along the box's six planes first, so faces crossing them keep their outside part, then everything
    # whose centre is inside goes. keep_across: faces standing across the box's x axis (the piers' side returns) stay.
    bm = bmesh.new(); bm.from_mesh(target.data); mw = target.matrix_world
    to_box = (frame.inverted() @ mw) if frame else mw
    bmesh.ops.transform(bm, matrix=to_box, verts=bm.verts)
    for co, no in (((0, 0, z0), (0, 0, 1)), ((0, 0, z1), (0, 0, 1)), ((0, y0, 0), (0, 1, 0)), ((0, y1, 0), (0, 1, 0)), ((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, dist=1e-5)
    bm.normal_update()
    kill = [f for f in bm.faces if (lambda c: x0 < c.x < x1 and y0 < c.y < y1 and z0 < c.z < z1)(f.calc_center_median()) and not (keep_across and abs(f.normal.x) > 0.7)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bmesh.ops.transform(bm, matrix=to_box.inverted(), verts=bm.verts)
    bm.to_mesh(target.data); bm.free(); target.data.update()
    return len(kill)
# The storefronts around the building (user, 2026-09-12): equal piers everywhere, as wide as the portal's pilaster
# shaft plus the narrow strip on both sides, and the storefronts rearranged to fit between them. The game's bays are
# read off each hull face in order; between two fixed edges (a building corner, where the corner column shows a face
# of that width on each street, or the strip beside a portal pilaster, where the storefront starts right at the strip)
# they are scaled by one common factor so the piers take exactly their width. Then each bay's parts (fascia, transom,
# glass, frame, backdrops, divider) are moved out of the game's deep recess to the bay's inset behind the pier face
# (0.20; the three-pane storefronts 0.40, user) and stretched onto their opening in the bay's own frame (along the
# face, outward, up), so the chamfered corner's bay works the same way, and the
# game's lintel between the old storefront top and the band (wall and interior shell, both hidden for now) is carved
# away. The storefronts next to the portal run straight into its pilasters (user, from the reference): only the
# narrow strip stays between them.
STOREFRONT_TOP = 4.111                                         # top of the game's storefront openings (the transom's top)
STOREFRONT_SPLAY = 0.125                                       # the game's reveal: the opening is this much wider in its front zone than at the glass line
INSET, INSET_WIDE = 0.20, 0.40                                 # the storefront's front plane (sign band, transom, glazing frame) behind the pier face: doubled from 0.10 (user), and twice that again for the three-pane storefronts
WIDE_BAY = 3.5                                                 # the game's three-pane storefronts: fascias wider than this (4.06; the others 2.86 and the door bays 2.10)
GLAZING_BEHIND = 0.01                                          # the glazing's frame just behind the sign band's plane; glass, backdrops and divider keep the game's spacing behind it
SF_BORDER = 0.01                                               # the transom's metal border stands this much proud of the storefront plane, and the sign band stands out with it (user 2026-09-18)
PILASTER_W = 0.725                                             # the portal's pilaster shaft (piece 07, PW): the widest pillar of the portal
PIER_W = PILASTER_W + 2 * TINY_W                               # 0.885: every pier between the storefronts, and each street face of the corner columns (user)
STRUCTURE = tuple(k for k in KEEP if k != "storefront")       # the storefront parts are exactly what we move here
def game_parts_in(x_lo, x_hi, y_lo, y_hi, z_max=4.3):
    out = []
    for o in bpy.data.collections["Collection"].all_objects:
        if o.type != 'MESH' or o.name.startswith(STRUCTURE): continue
        a, b = wbbox(o)
        if x_lo <= a.x and b.x <= x_hi and y_lo <= a.y and b.y <= y_hi and b.z < z_max: out.append(o)
    return out
shell = bpy.data.objects["interior__1"]
KZ = (BAND_BOTTOM + 0.003 - Z_GROUND) / (STOREFRONT_TOP - Z_GROUND)      # 1.095: the storefront grows into the band
CENTRE = Vector((-11.9, 0.0, 0.0))                                        # the plan's centre: bays face away from it
MZ = Matrix.Translation((0, 0, Z_GROUND)) @ Matrix.Diagonal((1, 1, KZ, 1)) @ Matrix.Translation((0, 0, -Z_GROUND))
def bay_frame(fascia):
    a, b = wbbox(fascia); c = (a + b) / 2; ext = b - a
    if ext.x < 0.5 < ext.y:   d = Vector((0, 1, 0))                      # a bay on an x-facing face runs along y
    elif ext.y < 0.5 < ext.x: d = Vector((1, 0, 0))
    else:                     d = Vector((1, 1, 0)).normalized()          # the chamfered corner
    n = Vector((d.y, -d.x, 0))
    if n.dot(c - CENTRE) < 0: n = -n                                      # outward
    d = n.cross(Vector((0, 0, 1)))                                        # along the face, so (d, n, z) is right-handed: a mirrored frame turns the boolean cutters inside out
    F = Matrix((d, n, Vector((0, 0, 1)))).transposed().to_4x4(); F.translation = Vector((c.x, c.y, 0))
    assert F.to_3x3().determinant() > 0
    inv = F.inverted(); loc = [inv @ (fascia.matrix_world @ v.co) for v in fascia.data.vertices]
    return F, min(p.x for p in loc), max(p.x for p in loc), min(p.y for p in loc), max(p.y for p in loc)
def bay_parts(fascia):
    # the bay's frame, the fascia's extents in it, and the bay's own parts: bbox centre within the fascia's footprint
    F, u0, u1, v0, v1 = bay_frame(fascia); inv = F.inverted(); parts = []
    for o in game_parts_in(-1e9, 1e9, -1e9, 1e9):
        a, b = wbbox(o); c = inv @ ((a + b) / 2)
        if u0 - 0.05 <= c.x <= u1 + 0.05 and v0 - 0.6 <= c.y <= v1 + 0.4: parts.append(o)
    return F, u0, u1, v0, v1, parts
# the hull's faces, counter-clockwise: start, unit direction, outward normal, length. A bay belongs to the face whose
# line it is closest to; its place on the face is the distance s along it from the face's start.
FACES = []
for i in range(len(HULL)):
    A = Vector((*HULL[i], 0.0)); B = Vector((*HULL[(i + 1) % len(HULL)], 0.0)); d = B - A; L = d.length; d.normalize()
    FACES.append((A, d, Vector((d.y, -d.x, 0.0)), L))
def face_of(o):
    a, b = wbbox(o); c = Vector(((a.x + b.x) / 2, (a.y + b.y) / 2, 0.0))
    return min(range(len(FACES)), key=lambda i: abs((c - FACES[i][0]).cross(FACES[i][1]).z))
def s_extent(o, i):
    s = [((o.matrix_world @ v.co) - FACES[i][0]).dot(FACES[i][1]) for v in o.data.vertices]
    return min(s), max(s)
# The NW corner: the game's mirrored copy left a 4 m blank on each side of it (where its chamfer bay would be, but the
# hull is square there), so the E face north of its portal would get only three bays over 16.8 m: a fourth, a copy of
# that face's standard bay, goes into the blank and keeps the rhythm of the other faces.
EXTRA_BAYS = [(4, "storefront_fascia__108", 0.95)]            # (face, the bay to copy, where the copy starts along the face before the layout)
for fi, src_name, s_new in EXTRA_BAYS:
    src = bpy.data.objects[src_name]; s0, _ = s_extent(src, fi); T = Matrix.Translation(FACES[fi][1] * (s_new - s0))
    for o in bay_parts(src)[5]:
        c = o.copy(); src.users_collection[0].objects.link(c); c.matrix_world = T @ o.matrix_world
    print(f"extra bay on face {fi}: a copy of {src_name} at s {s_new:.2f}")
# The corner bays beside the chamfer (user 2026-09-13): the game's double-door bays there become single-glass storefronts
# as wide as the chamfer bay, so that the corner pier, the bay and the fourth pier together span the chamfer's length
# (the marker line on the floors above): each is a copy of the nearest two-pane storefront on its face without the
# divider between its panes (the game's two-pane bay is one glass plane with a divider in front), held at that width by
# the layout below. The chamfer's own door bay stays.
CORNER_BAY_W = (Vector(HULL[2]) - Vector(HULL[1])).length - 2 * PIER_W       # 2.231, the chamfer bay's opening
CORNER_BAYS, FIXED_W = set(), {}
def corner_single_glass(fi, at_end):
    fasc = sorted([o for o in bpy.data.collections["Collection"].all_objects if o.type == 'MESH' and o.name.startswith("storefront_fascia") and face_of(o) == fi], key=lambda o: s_extent(o, fi)[0])
    door = fasc[-1] if at_end else fasc[0]; door_name = door.name; dc = sum(s_extent(door, fi)) / 2
    def width(o): a, b = s_extent(o, fi); return b - a
    src = min((o for o in fasc if 2.5 < width(o) < WIDE_BAY), key=lambda o: abs(sum(s_extent(o, fi)) / 2 - dc))
    T = Matrix.Translation(FACES[fi][1] * (dc - sum(s_extent(src, fi)) / 2))
    remove(bay_parts(door)[5]); n = 0
    for o in bay_parts(src)[5]:
        a, b = s_extent(o, fi); z0, z1 = wbbox(o)[0].z, wbbox(o)[1].z
        if b - a < 0.1 and z1 - z0 > 1.0: continue                          # the divider between the two panes
        c = o.copy(); src.users_collection[0].objects.link(c); c.matrix_world = T @ o.matrix_world; n += 1
        if c.name.startswith("storefront_fascia"): CORNER_BAYS.add(c.name); FIXED_W[c.name] = CORNER_BAY_W
    print(f"corner bay on face {fi}: {door_name} replaced by a single-glass copy of {src.name} ({n} parts) at s {dc:.3f}, to be laid out {CORNER_BAY_W:.3f} wide")
corner_single_glass(2, False); corner_single_glass(0, True)
# The portals along their faces: the game's two (C, the Broadway entry; E, its mirrored copy) and, on the 3rd Street face
# A, a third one as far from the west corner as C's is from its north corner (user 2026-09-12: "A face should be equal
# to B", the sequence 2, 3, 2, portal, 2, 3 read from the back corner on both faces).
def s_on(fi, x, y): return (Vector((x, y, 0.0)) - FACES[fi][0]).dot(FACES[fi][1])
PORTAL_S = {2: s_on(2, W_C, YC), 4: s_on(4, W_E, YE)}         # the portals' centres along their faces
def mitre_out(n, m, t): return (n + m) * (t / (1.0 + n.dot(m)))     # where two planes t out from the hull cross at a corner
def face_at(q):
    # the hull face a point belongs to: the outermost of the faces it stands over, or, past a corner, the one whose run
    # reaches it (the game's bands butt one run against the next face's plane rather than mitring on the corner itself)
    near = [((q - A).dot(nrm), i) for i, (A, d, nrm, L) in enumerate(FACES) if -1e-6 <= (q - A).dot(d) <= L + 1e-6]
    if near: return max(near)[1]
    for i, (A, d, nrm, L) in enumerate(FACES):
        B, e, m, _ = FACES[(i + 1) % len(FACES)]
        if (q - A).dot(d) > L and (q - B).dot(e) < 0: return i
    return max(range(len(FACES)), key=lambda i: (q - FACES[i][0]).dot(FACES[i][2]))
def plan_offset(p, t=WALL_OUT): return FACES[face_at(Vector((p.x, p.y, 0.0)))][2] * t
def push_out(objs, t=WALL_OUT, verts=False, skin=None):
    # whole objects along their own face's normal, or (for something that wraps the building) vertex by vertex. A vertex
    # is moved by the face its own polygons belong to, and one the polygons of two faces share goes to where their two
    # offset planes cross: the mitre, which keeps both runs on their planes instead of dragging one back to the corner.
    # `skin` moves only the vertices within that much of the outside, leaving the mass behind them where it is.
    n = 0
    for o in objs:
        mw = o.matrix_world; inv = mw.inverted()
        if not verts:
            c = sum((mw @ Vector(q) for q in o.bound_box), Vector()) / 8
            o.matrix_world = Matrix.Translation(plan_offset(c, t)) @ o.matrix_world; n += 1; continue
        me = o.data; own = {}
        key = lambda q: (round(q.x, 4), round(q.y, 4), round(q.z, 4))   # the runs are not welded where they meet: the
        for pl in me.polygons:                                         # two copies of a joint's vertex must move alike
            k = face_at(mw @ pl.center)
            for vi in pl.vertices: own.setdefault(key(mw @ me.vertices[vi].co), set()).add(k)
        for v in me.vertices:
            w = mw @ v.co
            if skin is not None and max((w - A).dot(nrm) for (A, d, nrm, L) in FACES) < skin: continue
            fs = own.get(key(w), set())
            pair = next(((i, j) for i in fs for j in fs if j == (i + 1) % len(FACES)), None)
            if pair is None:                                           # a run that stops just short of, or just past,
                for i in range(len(FACES)):                            # the corner still ends there: it is mitred too,
                    if (Vector((w.x, w.y, 0.0)) - FACES[i][0]).length < 0.12: pair = (i - 1, i); break   # or the two runs would part
            if pair: u = mitre_out(FACES[pair[0]][2], FACES[pair[1]][2], t)
            elif fs: u = FACES[max(fs, key=lambda i: (w - FACES[i][0]).dot(FACES[i][2]))][2] * t
            else: u = plan_offset(w, t)
            v.co = inv @ (w + u)
        me.update(); n += 1
    return n
PORTAL_S[0] = FACES[2][3] - PORTAL_S[2]                       # C's portal is 16.5 from its north corner: A's is 16.5 from its west corner
PORTAL_TAG = {2: "C", 4: "E", 0: "A"}
MIRROR = {0: 2}                                                # face A repeats face C's composition read from the far corner (user: 2-glass, 3-glass, 2-glass, portal, 2-glass, 3-glass, then 2-glass fillers and the door bay at the chamfer)
PORTAL_EDGES = {fi: (sc - P_HALF - TINY_W, sc + P_HALF + TINY_W) for fi, sc in PORTAL_S.items()}   # the strips beside the pilasters, outer edges
# the layout: the bays of each face in order between its fixed edges, one scale per stretch
bays = {}                                                      # fascia name -> (face, s0, s1, F, u0, u1, v0, v1, parts), all read before anything moves
for f in [o for o in bpy.data.collections["Collection"].all_objects if o.type == 'MESH' and o.name.startswith("storefront_fascia")]:
    fi = face_of(f); s0, s1 = s_extent(f, fi); bays[f.name] = (fi, s0, s1) + bay_parts(f)
def bay_type(n):
    w = bays[n][2] - bays[n][1]; return "door" if w < 2.5 else ("2p" if w < WIDE_BAY else "3p")
def nominal(n): return bays[n][2] - bays[n][1] + 2 * STOREFRONT_SPLAY   # the game's opening at its front
def stretches(fi):
    edges = [(0.0, "corner")] + [(e, "portal") for e in PORTAL_EDGES.get(fi, ())] + [(FACES[fi][3], "corner")]
    return [(sa, ka, sb, kb) for (sa, ka), (sb, kb) in zip(edges[:-1], edges[1:]) if not (ka == kb == "portal")]
def natural_runs(fi):
    # the face's bays as the game placed them, per stretch, in order along the face
    return [sorted((n for n, b in bays.items() if b[0] == fi and sa < (b[1] + b[2]) / 2 < sb), key=lambda n: bays[n][1]) for (sa, ka, sb, kb) in stretches(fi)]
def run_widths(stretch, run):
    # the bays' openings in a stretch: the corner bays keep their fixed width, the others share the rest in proportion
    sa, ka, sb, kb = stretch; piers = len(run) - 1 + (ka == "corner") + (kb == "corner")
    fixed = sum(FIXED_W.get(n, 0.0) for n in run); flex = sum(nominal(n) for n in run if n not in FIXED_W)
    k = (sb - sa - piers * PIER_W - fixed) / flex if flex else 1.0
    return k, [FIXED_W.get(n, k * nominal(n)) for n in run]
runs = {fi: natural_runs(fi) for fi in range(len(FACES)) if fi not in MIRROR}
for fi, m in MIRROR.items():
    # this face's bays by type, its corner bay kept aside for the corner end; the model's composition read from its far
    # corner (the north one) is laid onto this face from its own far corner (the west one): the run up to this portal is
    # the model's run from its portal to its far corner, reversed; the run from this portal to the shared chamfer corner
    # is the model's run from that corner to its portal, reversed, with 2-glass fillers before the corner bay, as many as
    # bring its scale closest to the model's; the bays left over go
    pool = {}; corner = [n for n, b in bays.items() if b[0] == fi and n in CORNER_BAYS]
    for n in sorted((n for n, b in bays.items() if b[0] == fi and n not in CORNER_BAYS), key=lambda n: bays[n][1]): pool.setdefault(bay_type(n), []).append(n)
    st, mst, mruns = stretches(fi), stretches(m), runs[m]
    assert len(st) == 2 and len(mst) == 2, "a mirrored face and its model must each hold one portal"
    before = [pool[t].pop(0) for t in [bay_type(n) for n in reversed(mruns[1]) if n not in CORNER_BAYS]]
    after_types = [bay_type(n) for n in reversed(mruns[0]) if n not in CORNER_BAYS]
    k_model = run_widths(mst[0], mruns[0])[0]; width = {t: nominal(ns[0]) for t, ns in pool.items() if ns}; fixed = sum(FIXED_W[n] for n in corner)
    def k_of(nf):
        types = after_types + ["2p"] * nf; sa, ka, sb, kb = st[1]; piers = len(types) + len(corner) - 1 + (ka == "corner") + (kb == "corner")
        return (sb - sa - piers * PIER_W - fixed) / sum(width[t] for t in types)
    best = min(range(len(pool.get("2p", [])) - after_types.count("2p") + 1), key=lambda nf: abs(k_of(nf) - k_model))
    after = [pool[t].pop(0) for t in after_types + ["2p"] * best] + corner
    runs[fi] = [before, after]
    for n in [n for ns in pool.values() for n in ns]:
        print(f"face {fi}: {n} ({bay_type(n)}) not needed for the mirrored composition, removed"); remove(bays[n][8]); del bays[n]
targets = {}                                                   # fascia name -> (t0, t1): the bay's opening along its face
for fi in range(len(FACES)):
    for stretch, run in zip(stretches(fi), runs[fi]):
        sa, ka, sb, kb = stretch
        assert run, f"no storefront on face {fi} between {sa:.2f} and {sb:.2f}"
        k, widths = run_widths(stretch, run); assert k > 0.5, (fi, sa, sb, k)
        cur = sa + (PIER_W if ka == "corner" else 0.0)
        for n, w in zip(run, widths):
            targets[n] = (cur, cur + w); cur += w + PIER_W
        assert abs((cur - PIER_W if kb == "portal" else cur) - sb) < 1e-6
        print(f"face {fi} {sa:7.3f} .. {sb:7.3f}: {len(run)} bays x{k:.3f}, openings " + ", ".join(f"{w:.2f}" for w in widths) + f", piers {PIER_W:.3f}")
# A three-pane storefront stands on the deep plane and the stone zone over it steps back with it. The 3rd Street
# face's two-pane fillers between the centre pavilion and the corner bay do the same: the pair nearest the pavilion
# (user 2026-09-16) and, since 2026-09-18, the third one beside the corner bay too, whose moulding had no recess where
# its two neighbours' did (user, a viewport screenshot). Only the depth changes -- they keep their two panes and the
# pair of windows over them -- so they are named here by where they stand, counting the bays along the face in order.
DEEP_BAYS = {0: (6, 7, 8)}
BAY_ORDER = {fi: sorted((n for n in bays if bays[n][0] == fi), key=lambda n: targets[n][0]) for fi in range(len(FACES))}
for fi, ks in DEEP_BAYS.items():
    assert max(ks) < len(BAY_ORDER[fi]), f"face {fi} has {len(BAY_ORDER[fi])} bays, not {max(ks) + 1}"
DEEP = {BAY_ORDER[fi][k] for fi, ks in DEEP_BAYS.items() for k in ks}
for n in sorted(DEEP, key=lambda q: targets[q][0]):
    print(f"face {bays[n][0]}: the bay at {targets[n][0]:.2f}..{targets[n][1]:.2f} ({bay_type(n)}) set as deep as a three-pane storefront")
recesses = {}                                                  # face -> [(t0, t1, F, tu0, tu1)]: the storefronts the stone zone above steps back over (user)
bay_inset = {}                                                 # fascia name -> its storefront's inset (its front is WALL_OUT + inset behind the pier face: the piers' joints run back to it)
n_bays = 0
for name, (fi, s0, s1, F, u0, u1, v0, v1, parts) in bays.items():
    inv = F.inverted(); A, d = FACES[fi][0], FACES[fi][1]; t0, t1 = targets[name]
    pa, pb = (inv @ (A + d * t0)).x, (inv @ (A + d * t1)).x; tu0, tu1 = min(pa, pb), max(pa, pb)   # the opening in the bay's frame
    ku = (tu1 - tu0) / (u1 - u0)
    # out of the game's deep recess to the bay's inset behind the pier face (the three-pane storefronts twice as deep), stretched
    # from the fascia's extents onto the opening, then up into the band. Each part moves by its own front (the wall plane is where
    # the face's hull line sits in the frame); the glazing parts move together, keeping the game's spacing behind their frame.
    inset = INSET_WIDE if (s1 - s0) > WIDE_BAY or name in DEEP else INSET
    bay_inset[name] = inset
    if inset == INSET_WIDE: recesses.setdefault(fi, []).append((t0, t1, F, tu0, tu1))
    v_front = (inv @ FACES[fi][0]).y + STRIP_OUT - inset
    def front(o): return max((inv @ (o.matrix_world @ v.co)).y for v in o.data.vertices)
    glazing = [o for o in parts if not o.name.startswith("storefront_")]
    g_front = front(max(glazing, key=lambda o: wbbox(o)[1].z - wbbox(o)[0].z)) if glazing else v_front   # the tallest part's front (the frame), not a handle sticking out of a door leaf
    for o in parts:
        # the sign band comes SF_BORDER further out than the storefront plane, flush with the transom's metal border
        # above it (user 2026-09-18: the black panel sat a centimetre deeper than the white panel's border, and the
        # pier's return showed the step between them); the transom itself stays on the plane, its border stands proud
        dv = (v_front + (SF_BORDER if o.name.startswith("storefront_fascia") else 0.0) - front(o)) if o.name.startswith("storefront_") else (v_front - GLAZING_BEHIND - g_front)
        o.matrix_world = F @ (Matrix.Translation((tu0 - ku * u0, dv, 0)) @ Matrix.Diagonal((ku, 1, 1, 1))) @ inv @ o.matrix_world
    for o in parts: o.matrix_world = MZ @ o.matrix_world
    # the game's wall and interior shell opened over the old opening and the new one, so nothing of them shows in the bay
    lo, hi = min(u0 - STOREFRONT_SPLAY - 0.001, tu0), max(u1 + STOREFRONT_SPLAY + 0.001, tu1)
    carve_faces(wall, lo, hi, v0 - 0.6, v1 + 0.4, Z_GROUND - 0.02, STOREFRONT_TOP - 0.0005, frame=F)
    carve_faces(shell, lo, hi, v0 - 0.6, v1 + 0.4, 0.3005, 4.1305, frame=F)
    # the transom is a glass pane with white paper behind it in a small black metal border (user): the game's solid box
    # becomes the paper, set 2 cm back; the pane and the four border bars go in front, in the bay's frame
    def fbox(name, x0, x1, y0, y1, z0, z1, mat):
        bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.transform(bm, matrix=F @ Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)), verts=r["verts"])
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
        o = bpy.data.objects.new(name, me); FIT.objects.link(o); return o
    for o in parts:
        if o.name.startswith("storefront_fascia"):
            for i in range(len(o.data.materials)): o.data.materials[i] = SF_METAL
        elif o.name.startswith("storefront_transom"):
            loc = [inv @ (o.matrix_world @ v.co) for v in o.data.vertices]
            tu0, tu1 = min(q.x for q in loc), max(q.x for q in loc); tz0, tz1 = min(q.z for q in loc), max(q.z for q in loc); vf = max(q.y for q in loc)
            o.matrix_world = F @ Matrix.Translation((0, -0.03, 0)) @ inv @ o.matrix_world
            for i in range(len(o.data.materials)): o.data.materials[i] = SF_PAPER
            b = 0.04
            fbox(f"sf_glass_{n_bays:02d}", tu0 + b, tu1 - b, vf - 0.008, vf - 0.002, tz0 + b, tz1 - b, SF_GLASS)
            for nm, (x0, x1, z0, z1) in (("top", (tu0, tu1, tz1 - b, tz1)), ("bottom", (tu0, tu1, tz0, tz0 + b)), ("left", (tu0, tu0 + b, tz0 + b, tz1 - b)), ("right", (tu1 - b, tu1, tz0 + b, tz1 - b))):
                fbox(f"sf_frame_{n_bays:02d}_{nm}", x0, x1, vf - 0.005, vf + SF_BORDER, z0, z1, SF_METAL)
    for t in (wall, shell):
        carve_faces(t, lo, hi, v0 - 0.4, v1 + 0.4, STOREFRONT_TOP - 0.0005, BAND_BOTTOM + 0.003, frame=F)
    n_bays += 1
# above the storefronts next to the portal, the game's portal-cutout lips between its 5.6 m opening and the pilaster go too
for tag, yc, xw, s in (("C", YC, W_C, 1), ("E", YE, W_E, -1)):
    for side in (-1, 1):
        carve_faces(wall, *sorted((xw - s * 0.25, xw + s * 0.06)), *sorted((yc + side * (GAME_HALF + 0.02), yc + side * P_HALF)), STOREFRONT_TOP - 0.0005, WALL_TOP + 0.01)   # 2 cm past the cutout edge: its reveal face sits exactly there
print(f"{n_bays} storefronts laid out between {PIER_W:.3f} piers, {INSET} / {INSET_WIDE} (three-pane) behind the pier face, raised to the band strip, their lintels carved; the sign bands {SF_BORDER * 100:.0f} cm proud with the transom borders")
# the entablature now ends at 5.861: the game's upper cornice (5.842 .. 6.092) goes, the plain band continues up to the second floor
# and the game's lower cornice (4.572 .. 4.842) does not exist on the real building either (user): the plain band also extends down to the wall top
w7 = bpy.data.objects["wall__7"]                  # the game's band wall; `ge_upper_band` replaces it further down
remove([o for n in ("cornice__2244", "cornice__2245") if (o := bpy.data.objects.get(n))])
# the game's flat cap planes on the ground-floor wall top (roof__5, roof__6: zero-thickness rings from the wall plane 0.18 in,
# at z 4.572) hide inside the band strip everywhere but in the recess pockets over the three-pane storefronts, where their
# outer strip showed as a lip (user): removed. roof__4, the inner floor plate 0.28 inside the wall plane, stays.
caps = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("roof") and abs(wbbox(o)[1].z - WALL_TOP) < 0.01 and wbbox(o)[1].x > W_C - 0.01]
print("removing the game's wall-top cap planes:", [o.name for o in caps]); remove(caps)
# The game's brick wall of floors 2 to 4 (wall__8) is layered: the field between the windows sits 0.20 behind the hull,
# columns and end piers stand proud of it with stepped capitals under the mid cornice (bay_capital__*), and every window
# sits in a recessed panel. It is replaced below by a wall built from scratch on the field plane (user 2026-09-12). Here
# the parts that stay are set up for that: the sills of the end bays (set for the proud piers) and the chamfer bay's
# window parts (set 0.05 out like its wall) come onto the field's depths, and the capitals go. The top floor (wall__21,
# its own flat layer 0.08 in with piers at the corners) is left as the game made it.
FIELD_IN = 0.20
def hull_lines(inset):
    # the hull's edges offset inward by `inset` as (a, b) segments meeting at the offset corners (the hull is convex, CCW)
    n = len(HULL); A = [Vector(HULL[i]) for i in range(n)]; lines = []
    for i in range(n):
        a, b = A[i], A[(i + 1) % n]; t = (b - a).normalized(); nrm = Vector((t.y, -t.x)); lines.append((a - nrm * inset, t))
    pts = []
    for i in range(n):
        (p0, t0), (p1, t1) = lines[i - 1], lines[i]                 # the corner where edge i-1 meets edge i
        m = t0.x * t1.y - t0.y * t1.x; d = p1 - p0; u = (d.x * t1.y - d.y * t1.x) / m; pts.append(p0 + t0 * u)
    return [(pts[i], pts[(i + 1) % n]) for i in range(n)]
FIELD_EDGES = hull_lines(FIELD_IN)
def outside_of(edges, x, y):
    # the outward distance of (x, y) from the polygon `edges` (0 inside) and the nearest point on its boundary
    p = Vector((x, y)); out = 0.0; best = None
    for a, b in edges:
        t = b - a; L = t.length; t /= L; out = max(out, (p - a).dot(Vector((t.y, -t.x))))
        q = a + t * min(max((p - a).dot(t), 0.0), L)
        if best is None or (p - q).length < (p - best).length: best = q
    return out, best
w8 = bpy.data.objects["wall__8"]
def pull_back(o, edges, collapse=True):
    # every vertex of `o` outside the polygon goes to the nearest point on its boundary; collapse: the faces that fold flat go
    bm = bmesh.new(); bm.from_mesh(o.data); mw = o.matrix_world; inv = mw.inverted(); moved = 0
    for v in bm.verts:
        w = mw @ v.co; out, q = outside_of(edges, w.x, w.y)
        if out > 0.005: v.co = inv @ Vector((q.x, q.y, w.z)); moved += 1
    if moved and collapse:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bm.to_mesh(o.data); bm.free(); o.data.update(); return moved
# the window sills (bf2_window_decoration) of those floors that were set for the proud end bays go back with them (their
# backs 1.1 cm in front of the field, like the middle bays' sills), and the chamfer bay's window parts (mesh__*), which
# the game set 0.05 further out like its wall, come back by that
SILL_BACK, CHAMFER_OUT = -0.189, 0.05
def edge_frame(i):
    a, b = FIELD_EDGES[i]; t = (b - a).normalized(); return a, t, Vector((t.y, -t.x))
def depth_of(c, i):
    a, t, nrm = edge_frame(i); return (Vector((c.x, c.y)) - a).dot(nrm) - FIELD_IN     # outward of the hull plane
n_sills = n_frames = 0
for o in bpy.data.objects:
    if o.type != 'MESH' or not o.name.startswith(("bf2_window_decoration", "mesh__")): continue
    a, b = wbbox(o)
    if a.z < 6.05 or b.z > 15.1: continue
    corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
    fi = max(range(len(FIELD_EDGES)), key=lambda i: depth_of(corners[0], i))          # the object's face
    back = min(depth_of(c, fi) for c in corners); nrm = edge_frame(fi)[2]; nrm = Vector((nrm.x, nrm.y, 0.0))
    if o.name.startswith("bf2_window_decoration") and back > SILL_BACK + 0.02:
        o.matrix_world = Matrix.Translation(nrm * (SILL_BACK - back)) @ o.matrix_world; n_sills += 1
    elif o.name.startswith("mesh__") and fi == 1:
        o.matrix_world = Matrix.Translation(nrm * -CHAMFER_OUT) @ o.matrix_world; n_frames += 1
print(f"upper-floor sills moved back onto the field: {n_sills}; chamfer window parts: {n_frames}")
caps = [o for o in bpy.data.objects if o.name.startswith("bay_capital")]
print("removing the columns' capitals:", len(caps)); remove(caps)
# The game's window sills (bf2_window_decoration__*: a plain box under every window) are each replaced in place by a
# molded sill of the same length and position (user 2026-09-12, reference photo; per window for now). The profile, from
# the bottom (user 2026-09-18): a small square edge with a half-round bead on it, a plain face straight up, a cove opening
# out under the cap and the cap's square edge; its top at the frame's bottom like the box's, its back on the wall plane the box floated 1.1 cm off.
SILL_OUT = 0.05                                                # the cap's projection from the wall: the top edge stands furthest out (user)
RECESS_SIDE = 0.03                                             # the sill runs this much past the set's boxes on each side; the recess around the set is exactly as wide as the sill (user)
SILL_LISTEL, SILL_LISTEL_H = 0.012, 0.008                      # the small square edge at the bottom (user 2026-09-18)
SILL_BEAD_R = 0.014                                            # the half-round bead on it: the convex part, at the very bottom
SILL_FASCIA_H = 0.02                                           # the plain face straight up over the bead
SILL_COVE_R = 0.024                                            # the cove at the top, a quarter circle opening out under the cap
SILL_CAP_H = 0.02                                              # the cap's square edge over the cove, overhanging it: a small edge like the one at the bottom
SILL_EDGE_R = 0.004                                            # small rounds on the cap's two front edges
SILL_H = SILL_LISTEL_H + 2 * SILL_BEAD_R + SILL_FASCIA_H + SILL_COVE_R + SILL_CAP_H   # 0.10, as before: nothing above or below the sills moves
assert SILL_OUT > SILL_LISTEL + SILL_COVE_R, "the cap must overhang the cove"
def round_corner(prev, corner, nxt, r, n=3):
    # the sharp corner prev -> corner -> nxt replaced by an arc of radius r tangent to both segments
    d_in = (corner - prev).normalized(); d_out = (nxt - corner).normalized()
    turn = math.atan2(d_in.x * d_out.y - d_in.y * d_out.x, d_in.dot(d_out)); t = r * math.tan(abs(turn) / 2)
    p_in = corner - d_in * t; C = p_in + Vector((-d_in.y, d_in.x)) * (r if turn > 0 else -r)
    a0 = math.atan2(p_in.y - C.y, p_in.x - C.x)
    return [C + Vector((math.cos(a0 + turn * i / n), math.sin(a0 + turn * i / n))) * r for i in range(n + 1)]
def sill_profile():
    # closed (o outward from the wall face, z up from the sill's bottom), bottom to top (user 2026-09-18): a small
    # square edge, a half-round bead on it -- the convex part, at the very bottom -- a plain face straight up, a cove
    # opening out under the cap, and the cap's square edge overhanging it, a small edge like the one at the bottom;
    # the back closes it on the wall plane. The earlier cut had a big convex belly turning into the cove (too convex).
    def arc(c, r, a0, a1, n):
        return [Vector((c[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), c[1] + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))) for i in range(1, n + 1)]
    b = SILL_LISTEL; z_bead = SILL_LISTEL_H + 2 * SILL_BEAD_R; z_fascia = z_bead + SILL_FASCIA_H; z_cove = z_fascia + SILL_COVE_R; z2 = z_cove + SILL_CAP_H
    nodes = [(Vector((0.0, 0.0)), 0.0), (Vector((b, 0.0)), 0.0), (Vector((b, SILL_LISTEL_H)), 0.0)]
    nodes += [(q, 0.0) for q in arc((b, SILL_LISTEL_H + SILL_BEAD_R), SILL_BEAD_R, -90.0, 90.0, 8)]        # the bead: out and back, convex
    nodes += [(Vector((b, z_fascia)), 0.0)]                                                                # straight up
    nodes += [(q, 0.0) for q in arc((b + SILL_COVE_R, z_fascia), SILL_COVE_R, 180.0, 90.0, 6)]             # the cove: concave, opening out
    nodes += [(Vector((SILL_OUT, z_cove)), SILL_EDGE_R), (Vector((SILL_OUT, z2)), SILL_EDGE_R), (Vector((0.0, z2)), 0.0)]
    P = []
    for i, (q, r) in enumerate(nodes):
        P += round_corner(nodes[i - 1][0], q, nodes[i + 1][0], r) if r else [q]
    return [(q.x, q.y) for q in P]
HULL_E = [(Vector(HULL[i]), Vector(HULL[(i + 1) % len(HULL)])) for i in range(len(HULL))]
def face_frame(fi):
    A, B = HULL_E[fi]; t = (B - A).normalized(); return A, t, Vector((t.y, -t.x))
def rh_frame(fi):
    # a right-handed frame on a hull face for the boolean cutters: x runs against the face (x = -s), y outward, z up, origin at the face's start
    A, t, nrm = face_frame(fi)
    F = Matrix((Vector((-t.x, -t.y, 0.0)), Vector((nrm.x, nrm.y, 0.0)), Vector((0.0, 0.0, 1.0)))).transposed().to_4x4(); F.translation = Vector((A.x, A.y, 0.0))
    return F
def frame_boxes():
    # the window frames of floors 2 to 4: the game's 8 cm deep boxes over 1.5 m tall (glass, bars and backdrops are planes)
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith("mesh__"): continue
        a, b = wbbox(o)
        if a.z < 6.0 or b.z > 15.2 or b.z - a.z < 1.5: continue
        c = (a + b) / 2; fi = max(range(len(HULL_E)), key=lambda i: (Vector((c.x, c.y)) - HULL_E[i][0]).dot(face_frame(i)[2]))
        A, t, nrm = face_frame(fi); cs = [o.matrix_world @ Vector(q) for q in o.bound_box]
        ds = [(Vector((q.x, q.y)) - A).dot(nrm) for q in cs]; ss = [(Vector((q.x, q.y)) - A).dot(t) for q in cs]
        if 0.05 < max(ds) - min(ds) < 0.12: out.append((fi, min(ss), max(ss), a.z, b.z, max(ds)))
    return out
# The corner's three single windows (the chamfer bay's and the end bay's on each side of it, floors 2 to 4) get the same
# margin from the corner edge (user 2026-09-12): the chamfer's window is centred on its face, so its margin sets the rule,
# and the two end-bay windows slide along their faces, with their frames, glass, backdrops, bars and sill boxes, to sit
# that far from the corner too. A marker line on the wall, a window's width plus twice the margin from each corner, shows
# where the corner's wall area ends: on the ground floor's fourth pier.
def shift_window(fi, s0, s1, delta):
    A, t, nrm = face_frame(fi); T = Matrix.Translation(Vector((t.x, t.y, 0.0)) * delta); n = 0
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith(("mesh__", "bf2_window_decoration")): continue
        a, b = wbbox(o)
        if b.z < 6.0 or a.z > 15.2: continue
        c = (a + b) / 2; sv, d = (Vector((c.x, c.y)) - A).dot(t), (Vector((c.x, c.y)) - A).dot(nrm)
        if s0 - 0.3 < sv < s1 + 0.3 and -0.8 < d < 0.3: o.matrix_world = T @ o.matrix_world; n += 1
    return n
_fb = frame_boxes(); L1 = (HULL_E[1][1] - HULL_E[1][0]).length; L0 = (HULL_E[0][1] - HULL_E[0][0]).length
_cham = [(s0, s1) for fi, s0, s1, za, zb, d in _fb if fi == 1]
CORNER_W = max(s1 - s0 for s0, s1 in _cham); CORNER_A = min(min(s0 for s0, s1 in _cham), min(L1 - s1 for s0, s1 in _cham))
_cw = min(((s0, s1) for fi, s0, s1, za, zb, d in _fb if fi == 2), key=lambda w: w[0])       # the C face's window nearest the chamfer corner
_sw = max(((s0, s1) for fi, s0, s1, za, zb, d in _fb if fi == 0), key=lambda w: w[1])       # the south face's window nearest it
_dc, _ds = CORNER_A - _cw[0], (L0 - CORNER_A) - _sw[1]
print(f"corner windows: margin {CORNER_A:.3f} like the chamfer's, C window moved {_dc:+.3f} ({shift_window(2, _cw[0], _cw[1], _dc)} parts), south window moved {_ds:+.3f} ({shift_window(0, _sw[0], _sw[1], _ds)} parts)")
def box_on_face(old):
    # a game sill box: its face, its extent along it, the wall plane behind it (the box floated 1.1 cm off it), its top
    corners = [old.matrix_world @ Vector(c) for c in old.bound_box]; c = sum(corners, Vector()) / 8
    fi = max(range(len(HULL_E)), key=lambda i: (Vector((c.x, c.y)) - HULL_E[i][0]).dot(face_frame(i)[2]))
    A, t, nrm = face_frame(fi)
    ss = [(Vector((q.x, q.y)) - A).dot(t) for q in corners]; ds = [(Vector((q.x, q.y)) - A).dot(nrm) for q in corners]
    return fi, min(ss), max(ss), min(ds) - 0.011, max(q.z for q in corners)
def molded_sill(name, fi, s0, s1, o0, z1, mat):
    A, t, nrm = face_frame(fi)
    bm = bmesh.new(); prof = sill_profile(); k = len(prof); rings = []
    for sv in (s0, s1):
        rings.append([bm.verts.new((A.x + t.x * sv + nrm.x * (o0 + o), A.y + t.y * sv + nrm.y * (o0 + o), z1 - SILL_H + z)) for (o, z) in prof])
    for j in range(k): bm.faces.new((rings[0][j], rings[0][(j + 1) % k], rings[1][(j + 1) % k], rings[1][j]))
    bm.faces.new(tuple(reversed(rings[0]))); bm.faces.new(tuple(rings[1]))
    o = mesh_from_bm(name, bm, mat, FIT, smooth=True)
    if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
    return o
# The sets of windows: the game's sill boxes on one face and level, neighbours closer than 0.5 m sharing a set. One molded
# sill spans each set (user 2026-09-12: with the separators gone the molding is one piece over the two or three windows).
old_sills = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("bf2_window_decoration")]
boxes = {}
for o in old_sills:
    fi, s0, s1, o0, z_top = box_on_face(o)
    boxes.setdefault((fi, round(z_top, 2)), []).append((s0, s1, o0, o.name, o.data.materials[0] if o.data.materials else None))
SILL_SETS = []                                                 # (face, z_top, [(s0, s1, o0, name, mat) ...] in order along the face)
for (fi, z_top), items in sorted(boxes.items()):
    items.sort(); group = [items[0]]
    for it in items[1:]:
        if it[0] - group[-1][1] < 0.5: group.append(it)
        else: SILL_SETS.append((fi, z_top, group)); group = [it]
    SILL_SETS.append((fi, z_top, group))
for fi, z_top, group in SILL_SETS:
    molded_sill("sill_" + group[0][3].split("__")[-1], fi, group[0][0] - RECESS_SIDE, group[-1][1] + RECESS_SIDE, group[0][2], z_top, group[0][4])
print(f"window sills: {len(old_sills)} boxes replaced by {len(SILL_SETS)} molded sills, one per set of windows"); remove(old_sills)
# Above each portal the game sets two single windows with a strip of wall between them (floors 2 to 4); the reference has
# a pair of windows there like the ones over the storefronts (user 2026-09-12). The game's parts over the portal go and a
# copy of the pair beside it (frames, glass, backdrops, merged sill) is moved along the face onto the portal's centre; the
# wall built below gets its holes from these frames. The south face's windows sit differently around its portal (a pair
# straddles the stretch), so it is left as the game made it.
UP_BANDS = ((6.0, 15.2), (15.5, 19.5))             # floors 2 to 4, then the top floor
def face_sets(fi, z_lo, z_hi):
    # the face's window sets at that height, as spans along it: the sills, merged where they touch (one per set and floor)
    A, d = FACES[fi][0], FACES[fi][1]; items = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith("sill_"): continue
        a, b = wbbox(o)
        if not (z_lo < (a.z + b.z) / 2 < z_hi) or face_of(o) != fi: continue
        ss = [((o.matrix_world @ v.co) - A).dot(d) for v in o.data.vertices]
        items.append((min(ss), max(ss)))
    out = []
    for s0, s1 in sorted(items):
        if out and s0 - out[-1][1] < 0.5: out[-1][1] = max(out[-1][1], s1)
        else: out.append([s0, s1])
    return out
def parts_between(fi, s0, s1, z_lo, z_hi, prefixes=("mesh__", "bf2_", "sill_", "top_panel")):
    A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]; out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith(prefixes): continue
        a, b = wbbox(o); c = (a + b) / 2
        if not (z_lo < c.z < z_hi): continue
        sv, dv = (c - A).dot(d), (c - A).dot(nrm)
        if -0.9 < dv < 0.35 and s0 - 0.25 < sv < s1 + 0.25: out.append(o)
    return out
# ---------------------------------------------------------------- the corners stand out
# The corner bays project to the plane the columns stand on (user 2026-09-15): from each corner to the far edge of the
# pier beyond the end bay -- the pier the ground floor has there, the same one a column would stand on -- the whole
# wall comes forward with its windows, on every face and on both of the upper walls, so a corner reads as one mass and
# the top floor lines up with the floors below it. The chamfer is one bay wide: all of it is corner.
def corner_reach(fi, at_end, t=WALL_OUT):
    # how far past the hull's corner a face standing WALL_OUT out must run to meet the next one: where the two planes
    # cross (0.20 at a square corner, 0.083 at the chamfer's 135 degrees). Stopping at the corner itself would leave a
    # step between the two masses instead of one arris (user 2026-09-15).
    n = FACES[fi][2]; d = FACES[fi][1]; m = FACES[(fi + 1) % len(FACES) if at_end else fi - 1][2]
    return t * m.dot(d) / (1.0 + n.dot(m))
def full_face(fi, t=WALL_OUT): return corner_reach(fi, False, t), FACES[fi][3] + corner_reach(fi, True, t)
def end_stretches(fi):
    # The building's edges come out to the columns' plane (user 2026-09-16), each stretch running from the corner back
    # to the second pier the ground floor has there -- the pillar the extrusion starts at -- and carried past the
    # corner to where the two faces' projecting planes cross, so the edge is one mass and not a step. The chamfer is
    # one bay wide, so the whole of it is corner.
    spans = sorted(targets[n] for n in bays if bays[n][0] == fi); L = FACES[fi][3]
    a, b = corner_reach(fi, False, COL_OUT), L + corner_reach(fi, True, COL_OUT)
    if len(spans) < 2: return [(a, b)]
    return [(a, spans[1][0]), (spans[-2][1], b)]
# The middle of each long face carries the same pavilion its corners do: the game's wall stands proud there and three
# parapet pedestals stand on it, the outer two deep and the middle one shallow, exactly as at a corner. Putting the top
# floor back as one slab per face had flattened it, leaving the wall plain under its own crown, so it is read again from
# the game's wall here and comes out to the columns' plane with the corners (user 2026-09-16).
#
# Where it goes is the seventh bay in from the start of the face, MID_BAY. The game's own s is no use: the window sets
# have since moved onto the ground floor's bays, and the game's pavilion is left standing in the gap between two of
# them. On the north face the wall followed its sets and lands on that seventh bay; on the 3rd Street face the pairing
# crosses, so the wall could not follow and stayed where the game left it -- and the user marked the same seventh bay.
# Its stretch then runs from the middle of the pier on one side to the middle of the pier on the other, so it breaks
# between two window groups and never across one, as the corners' stretches do.
MID_PROUD = 0.04                                   # a pavilion stands at least this much proud of the field beside it
MID_BAY = 6                                        # and stands on this bay, counted from the start of its face
MID_STRETCHES = {}                                 # face -> [(s0, s1)] on the bays, read before the top floor is put back
GAME_MIDS = {}                                     # face -> [(s0, s1)] where the game had them, for the pedestals to follow
def wall_runs(fi):
    # the game's wall along the whole face as (s0, s1, depth) runs, the outermost slab winning at every place
    items = wall_slabs(fi); L = FACES[fi][3]
    xs = sorted({min(max(x, 0.0), L) for a, b, _ in items for x in (a, b)} | {0.0, L})
    runs = []
    for a, b in zip(xs, xs[1:]):
        if b - a < 1e-4: continue
        d = [dv for q0, q1, dv in items if q0 - 1e-6 <= (a + b) / 2 <= q1 + 1e-6]
        if not d: continue
        if runs and abs(runs[-1][2] - max(d)) < 1e-4 and abs(runs[-1][1] - a) < 1e-6: runs[-1][1] = b
        else: runs.append([a, b, max(d)])
    assert runs, f"face {fi}: no wall to read the pavilions from"
    return runs
def game_mids(fi):
    # the proud stretches that are not the face's own ends: those two are the corners' and are worked out from the bays
    runs = wall_runs(fi); L = FACES[fi][3]; field = min(dv for _, _, dv in runs)
    return [(a, b) for a, b, dv in runs if dv > field + MID_PROUD and a > 0.5 and b < L - 0.5]
def read_mid_stretches(fi):
    # it reaches from the far edge of the pillar on one side to the far edge of the pillar on the other, so its own
    # edges stand on them and not half way across them (user 2026-09-16), the way a corner stretch ends on its pier
    groups = sorted(face_sets(fi, *UP_BANDS[0]))
    spans = sorted(targets[n] for n in bays if bays[n][0] == fi); out = []
    for a, b in GAME_MIDS.get(fi, []):
        assert MID_BAY + 1 < len(groups), f"face {fi}: no bay {MID_BAY} for its centre pavilion to stand on"
        g0, g1 = groups[MID_BAY]; c = (g0 + g1) / 2
        k = next(i for i, (q0, q1) in enumerate(spans) if q0 - 1e-6 <= c <= q1 + 1e-6)
        lo = spans[k - 1][1] if k else spans[k][0] - PIER_W
        hi = spans[k + 1][0] if k + 1 < len(spans) else spans[k][1] + PIER_W
        out.append((lo, hi))
        print(f"face {fi}: the centre pavilion, the game's wall proud at {a:.2f}..{b:.2f}, laid on the bay at "
              f"{spans[k][0]:.2f}..{spans[k][1]:.2f} as the stretch {lo:.2f}..{hi:.2f}, pillar face to pillar face")
    return out
def mid_stretches(fi): return MID_STRETCHES.get(fi, [])
def out_stretches(fi): return sorted(end_stretches(fi) + mid_stretches(fi))
def in_corner(fi, sv): return any(a - 1e-6 < sv < b + 1e-6 for a, b in out_stretches(fi))

# ---------------------------------------------------------------- the top floor put together like the floors below
# Floors 2 to 4 keep the wall plain and set each window group into a hole of its own, with the recess and its
# decoration on a panel inside it (build_upper_wall, below). The top floor is given the same construction here (user
# 2026-09-14): the game's wall__21 carries the arched openings, their stepped reveals and the recessed panel around
# each window, so every set's piece of that wall is cut out as a panel of its own, plain brick closes the wall behind
# it, and a hole is cut again wherever the set finally stands. A set -- sill, frames, glass, panel -- then travels as
# one piece, like the sets below, and the two windows the game left over each portal can be replaced by a proper pair.
W21 = bpy.data.objects["wall__21"]
TOP_Z = UP_BANDS[1]
TOP_HEAD_GAME = 19.592                             # the head of the game's top-floor wall (asserted here, before anything is cut from it)
assert abs(max((W21.matrix_world @ v.co).z for v in W21.data.vertices) - TOP_HEAD_GAME) < 1e-3, "the game's top floor head moved"
TOP_DROP = 1.242                                   # how much shorter the top floor is made than the game's (user 2026-09-18: the real windows are smaller and the building's height follows): the one lever
TOP_Z0, TOP_Z1, TOP_T = 15.592, TOP_HEAD_GAME - TOP_DROP, 0.32   # the top floor's wall: its foot, its head, and its thickness
TOP_FOOT = SILL5_GAME                              # the top floor's frames' foot (user 2026-09-18, the photos: the sash stands straight on the string course, no sill of its own): the game's sills' underside, the cornice's top B45_TOP once lifted
TOP_LIP = 0.002                                    # the ledge under a frame and a ring's floor sit this over the cornice's top and over the springing: no coincident faces with the cornice, the impost band or the capitals
TOP_RECT_H = 1.31                                  # the cornice's top to the springing (HABS 011973, the chamfer window: 214 px on a 171 px opening, 1.25 W)
TOP_SPRING = TOP_FOOT + TOP_RECT_H                 # 17.300 game: the springing, the impost band's top, the arches' centre
RING_W, RING_D = 0.15, 0.08                        # the one ring of brick round each arch, springing to springing: its width, and how far its face sits behind the wall
REVEAL_D = 0.31                                    # the wall's plane to the frame's front, a plain reveal (the game's 0.309: FRAME_FRONT behind the hull, BRICK_OUT taken off)
TOP_OVER = 0.525                                   # the arch's intrados apex to the wall's head (011973: 85-90 px on 171): the head the top floor is to have
TOP_W_MAX = 1.05                                   # the widest window: the pairs' and the singles' (the triples' are 1.00), asserted where the panels are rebuilt
TOP_HEAD_WANT = TOP_SPRING + TOP_W_MAX / 2 + TOP_OVER   # 18.350 game: the head the windows ask for; TOP_DROP is what brings TOP_Z1 down to it
assert TOP_DROP == 0.0 or abs(TOP_Z1 - TOP_HEAD_WANT) < 1e-6, f"TOP_DROP {TOP_DROP:.3f} puts the top floor's head at {TOP_Z1:.3f}, the windows ask for {TOP_HEAD_WANT:.3f}"
FRAME_D, FRAME_W, FRAME_BURY = 0.08, 0.06, 0.005   # the new frame: its depth, the width of its face, and how far its outer edge is buried in the reveal (no light round it)
TRANSOM_H, TRANSOM_BELOW = 0.16, 0.14              # the transom bar, and its top under the springing (the photos: a thick dentilled bar 0.13-0.2 W under it)
TOP_GLASS_IN, TOP_PANE_IN = 0.06, 0.12             # the glass and the backdrop pane behind the frame's front, as the game spaced them (the glass inside the frame's depth)
RIM_MARGIN = 0.15                                  # the brick a panel keeps beside its outer windows and over their rings: its rim; = RING_W, so an outer window's ring reaches the rim's edge exactly
def face_sd(fi, q):
    A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]; return (q - A).dot(d), (q - A).dot(nrm)
def on_face(q): return max(range(len(FACES)), key=lambda i: face_sd(i, q)[1])
def wall_loops(fi, s0=-1e9, s1=1e9):
    # the loops of the top floor's own wall plane over a stretch of a face: (place along it, height, u, v)
    me = W21.data; mw = W21.matrix_world; R = mw.to_3x3(); uv = me.uv_layers.active.data; nrm = FACES[fi][2]; pts = []
    for pl in me.polygons:
        c = mw @ pl.center
        if not (TOP_Z[0] < c.z < TOP_Z[1]) or (R @ pl.normal).dot(nrm) < 0.7 or face_sd(fi, c)[1] < -0.12 or on_face(c) != fi: continue
        if not (s0 - 1.2 < face_sd(fi, c)[0] < s1 + 1.2): continue
        for li in pl.loop_indices:
            q = mw @ me.vertices[me.loops[li].vertex_index].co
            pts.append((face_sd(fi, q)[0], q.z, uv[li].uv[0], uv[li].uv[1]))
    return pts
def brick_map(fi):
    # how the top floor's brick runs on a face: about one texture unit per metre along it and up. Read from the
    # differences within each polygon, because the geometry the corner's shrink moved carried its own brick along,
    # so the face has more than one offset; each patch reads its offset from the wall right beside it instead.
    nu = du = nv = dv = 0.0
    me = W21.data; mw = W21.matrix_world; R = mw.to_3x3(); uv = me.uv_layers.active.data; nrm = FACES[fi][2]
    for pl in me.polygons:
        c = mw @ pl.center
        if not (TOP_Z[0] < c.z < TOP_Z[1]) or (R @ pl.normal).dot(nrm) < 0.7 or face_sd(fi, c)[1] < -0.12 or on_face(c) != fi: continue
        q = [(face_sd(fi, mw @ me.vertices[me.loops[li].vertex_index].co)[0], (mw @ me.vertices[me.loops[li].vertex_index].co).z,
              uv[li].uv[0], uv[li].uv[1]) for li in pl.loop_indices]
        for i in range(len(q)):
            a, b = q[i], q[(i + 1) % len(q)]
            nu += (b[0] - a[0]) * (b[2] - a[2]); du += (b[0] - a[0]) ** 2
            nv += (b[1] - a[1]) * (b[3] - a[3]); dv += (b[1] - a[1]) ** 2
    assert du > 1.0 and dv > 1.0, f"face {fi}: no top-floor wall to read the brick from"
    return nu / du, nv / dv
BRICK = {fi: brick_map(fi) for fi in range(len(FACES))}
U_SLOPE = {fi: BRICK[fi][0] for fi in range(len(FACES))}
def brick_near(fi, s0, s1):
    # where the brick stands beside a stretch: the offsets its neighbours carry, so a patch continues their courses
    au, av = BRICK[fi]; pts = wall_loops(fi, s0, s1)
    assert pts, f"face {fi}: no wall beside {s0:.2f}..{s1:.2f} to read the brick from"
    us = sorted(q[2] - au * q[0] for q in pts); vs = sorted(q[3] - av * q[1] for q in pts)
    return us[len(us) // 2], vs[len(vs) // 2]
TOP_READ = (19.0, 19.45)                           # a clear band of wall over the windows, where its own plane can be read
def wall_slabs(fi):
    # the wall's plane up there, as (s0, s1, depth) for every polygon that reaches that height: the end and centre
    # pavilions stand 0.08 proud of the field. The polygons are read by what they span, not by where their centre is:
    # the game's wall is a soup of triangles of every size, and the big ones over the piers have theirs far below.
    me = W21.data; mw = W21.matrix_world; R = mw.to_3x3(); nrm = FACES[fi][2]; out = []
    for pl in me.polygons:
        if (R @ pl.normal).dot(nrm) < 0.7: continue
        c = mw @ pl.center; dv = face_sd(fi, c)[1]
        if dv < -0.6 or on_face(c) != fi: continue
        q = [mw @ me.vertices[me.loops[li].vertex_index].co for li in pl.loop_indices]
        if max(w.z for w in q) < TOP_READ[0] or min(w.z for w in q) > TOP_READ[1]: continue
        es = [face_sd(fi, w)[0] for w in q]; out.append((min(es), max(es), dv))
    assert out, f"face {fi}: no top-floor wall to read"
    return out
def wall_plane(fi, s0, s1):
    # the wall's plane over a stretch, read at its middle so a pavilion's edge nearby cannot be mistaken for it
    sm = (s0 + s1) / 2
    d = [dv for a, b, dv in wall_slabs(fi) if a - 1e-6 <= sm <= b + 1e-6]
    assert d, f"face {fi}: no top-floor wall over {s0:.2f}..{s1:.2f}"
    return max(d)
def top_rim(fi, s0, s1):
    # the panel around a set: everything between its sill's ends that steps back from the wall's plane, as a rectangle
    me = W21.data; mw = W21.matrix_world; front = wall_plane(fi, s0, s1); ss, zs = [], []
    for pl in me.polygons:
        c = mw @ pl.center
        if not (TOP_Z[0] < c.z < TOP_Z[1]) or on_face(c) != fi: continue
        sv, dv = face_sd(fi, c)
        if not (front - 0.30 < dv < front - 0.05) or not (s0 - 0.35 < sv < s1 + 0.35): continue
        q = [mw @ me.vertices[me.loops[li].vertex_index].co for li in pl.loop_indices]
        es = [face_sd(fi, w)[0] for w in q]
        if min(es) < s0 - 0.35 or max(es) > s1 + 0.35: continue
        ss += es; zs += [w.z for w in q]
    assert ss, f"face {fi}: no recessed panel around the set at {s0:.2f}..{s1:.2f}"
    return front, min(ss), max(ss), min(zs), max(zs)
def wall_faces_in(bm, fi, s0, s1, z0, z1, y0, y1):
    # the wall's faces inside a rectangle on one face, the mesh bisected on the rectangle's own planes first so
    # nothing is taken or left by halves (the game's wall is a face soup: every triangle keeps its own vertices)
    A, d = FACES[fi][0], FACES[fi][1]
    def near(f):
        # by what the face spans, not by where its vertices are: the game's wall has triangles the whole floor tall,
        # and one of those must still be cut on the rectangle's planes rather than taken or left whole
        es = [face_sd(fi, v.co)[0] for v in f.verts]; ds = [face_sd(fi, v.co)[1] for v in f.verts]; zs = [v.co.z for v in f.verts]
        return (min(es) < s1 + 0.6 and max(es) > s0 - 0.6 and min(zs) < z1 + 0.4 and max(zs) > z0 - 0.4
                and min(ds) < y1 + 0.3 and max(ds) > y0 - 0.3)
    for co, no in ((A + d * s0, d), (A + d * s1, d), (Vector((0.0, 0.0, z0)), Vector((0.0, 0.0, 1.0))), (Vector((0.0, 0.0, z1)), Vector((0.0, 0.0, 1.0)))):
        reg = [f for f in bm.faces if near(f)]
        bmesh.ops.bisect_plane(bm, geom=reg + list({e for f in reg for e in f.edges}) + list({v for f in reg for v in f.verts}),
                               plane_co=co, plane_no=no, dist=1e-5)
    out = []
    for f in bm.faces:                                 # the rectangle's own edges count as inside: the ledge under a
        c = f.calc_center_median()                     # window, the one over its arch and the returns at its sides lie
        if not (z0 - 1e-3 < c.z < z1 + 1e-3): continue # exactly on them, and they belong to the panel
        sv, dv = face_sd(fi, c)
        if s0 - 1e-3 < sv < s1 + 1e-3 and y0 < dv < y1 and on_face(c) == fi: out.append(f)
    return out
def wall_quad(bm, uvl, fi, s0, s1, z0, z1, depth, outward, brick):
    # plain wall over a rectangle, carrying the brick its neighbours have
    A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]; au, av = BRICK[fi]; cu, cv = brick
    corners = [(s0, z0), (s1, z0), (s1, z1), (s0, z1)]
    if not outward: corners.reverse()
    f = bm.faces.new([bm.verts.new(A + d * sv + nrm * depth + Vector((0.0, 0.0, zz))) for sv, zz in corners]); f.smooth = False
    for l in f.loops:
        sv, dv = face_sd(fi, l.vert.co); l[uvl].uv = (au * sv + cu, av * l.vert.co.z + cv)
top_sills = {}                                     # the top floor's sets, one molded sill each
for o in bpy.data.objects:
    if o.type != 'MESH' or not o.name.startswith("sill_"): continue
    a, b = wbbox(o)
    if TOP_Z[0] < (a.z + b.z) / 2 < TOP_Z[1]:
        fi = face_of(o); top_sills.setdefault(fi, []).append(s_extent(o, fi) + (o.name,))
_me, _mw = W21.data, W21.matrix_world
_bm = bmesh.new(); _bm.from_mesh(_me); bmesh.ops.transform(_bm, matrix=_mw, verts=_bm.verts)
_uvl = _bm.loops.layers.uv.active; _wmat = _me.materials[0] if _me.materials else None
n_panels = n_pf = 0
for fi, items in sorted(top_sills.items()):
    for s0, s1, nm in sorted(items):
        front, r0, r1, z0, z1 = top_rim(fi, s0, s1)
        take = wall_faces_in(_bm, fi, r0, r1, z0, z1, front - 0.6, front + 0.3)
        pbm = bmesh.new(); puv = pbm.loops.layers.uv.new("UVMap"); vm = {}
        for f in take:
            vs = []
            for v in f.verts:
                if v not in vm: vm[v] = pbm.verts.new(v.co)
                vs.append(vm[v])
            try: g = pbm.faces.new(vs)
            except ValueError: continue
            g.smooth = f.smooth
            for l, nl in zip(f.loops, g.loops): nl[puv].uv = l[_uvl].uv
        pname = "top_panel_" + nm.split("_")[-1]
        pme = bpy.data.meshes.new(pname); pbm.to_mesh(pme); pbm.free()
        if _wmat: pme.materials.append(_wmat)
        FIT.objects.link(bpy.data.objects.new(pname, pme)); n_panels += 1; n_pf += len(pme.polygons)
        bmesh.ops.delete(_bm, geom=take, context='FACES')
        brick = brick_near(fi, r0, r1)
        wall_quad(_bm, _uvl, fi, r0, r1, z0, z1, front, True, brick)      # plain wall where the set stood, outside and in
        wall_quad(_bm, _uvl, fi, r0, r1, z0, z1, front - TOP_T, False, brick)
bmesh.ops.transform(_bm, matrix=_mw.inverted(), verts=_bm.verts); _bm.to_mesh(_me); _bm.free(); _me.update()
print(f"top floor: {n_panels} window panels ({n_pf} faces) cut out of wall__21, which keeps {len(_me.polygons)} faces of plain wall")
def slide(objs, fi, delta):
    # a set moves along its face; a panel's brick belongs to the wall, so its u travels with it and the courses still line up
    T = Matrix.Translation(FACES[fi][1] * delta)
    for o in objs:
        o.matrix_world = T @ o.matrix_world
        if o.name.startswith("top_panel"):
            if o.data.users > 1: o.data = o.data.copy()          # a copied panel keeps its own brick
            for l in o.data.uv_layers.active.data: l.uv = (l.uv[0] + U_SLOPE[fi] * delta, l.uv[1])
# The arcade's impost band is the game's course of blocks along each face at the springing of the arches, broken
# only by the openings. Its blocks stand where the game's windows stood, so the course is taken down here (user
# 2026-09-14: no block left stranded on the plain wall) and the impost course is built afresh at the end, once every
# set has found its place: one moulding swept along the wall (the top floor's impost course, after the band's cornices).
band_old = [o for o in bpy.data.objects if o.name.startswith("bay_arcade_impost") and TOP_Z[0] < sum(wbbox(o)[i].z for i in (0, 1)) / 2 < TOP_Z[1]]
print(f"the impost band: {len(band_old)} of the game's blocks taken down; the impost course is swept afresh at the end")
remove(band_old)

# Over each portal the windows the game happened to leave there (two single ones on the Broadway and E faces, two
# pairs on the 3rd Street face, which never had an entrance) are replaced by a copy of the nearest pair, centred on
# the portal, so every entrance carries the same pair (user 2026-09-12; the top floor too, 2026-09-14, where the game
# left two single windows standing wide apart over each doorway).
PAIR_OFF = 4.954                                   # where the source pair stands before the portal, along the face
def n_windows(fi, s0, s1, z_lo, z_hi):
    # how many windows a set has: the game's frame boxes, 8 cm deep and over 1.5 m tall, counted by their places
    # along the face, since a set on floors 2 to 4 is the same windows stacked on three floors
    out = set()
    for o in parts_between(fi, s0, s1, z_lo, z_hi, ("mesh__",)):
        a, b = wbbox(o)
        if b.z - a.z < 1.5: continue
        ds = [face_sd(fi, o.matrix_world @ Vector(q))[1] for q in o.bound_box]
        if 0.05 < max(ds) - min(ds) < 0.12: out.add(round(s_extent(o, fi)[0], 2))
    return len(out)
for z_lo, z_hi in UP_BANDS:
    top = z_lo > 15.0; floors = "5" if top else "2-4"
    for fi in (2, 4, 0):
        sc = PORTAL_S[fi]; tag = PORTAL_TAG[fi]
        groups = face_sets(fi, z_lo, z_hi)
        over = [g for g in groups if g[1] > sc - P_HALF and g[0] < sc + P_HALF]
        pairs = [g for g in groups if g not in over and n_windows(fi, g[0], g[1], z_lo, z_hi) == 2
                 and (not top or abs(wall_plane(fi, g[0], g[1]) - wall_plane(fi, sc - P_HALF, sc + P_HALF)) < 0.01)]
        assert pairs, f"portal {tag}, floors {floors}: no pair of windows to copy over the entrance"
        src = min(pairs, key=lambda g: abs((g[0] + g[1]) / 2 - (sc - PAIR_OFF)))
        gone = [o for g in over for o in parts_between(fi, g[0], g[1], z_lo, z_hi)]
        src_parts = parts_between(fi, src[0], src[1], z_lo, z_hi)
        remove(gone); copied = []
        for o in src_parts:
            c = o.copy(); c.data = o.data.copy() if c.name.startswith("top_panel") else o.data
            FIT.objects.link(c); copied.append(c)
        slide(copied, fi, sc - (src[0] + src[1]) / 2)
        print(f"over portal {tag}, floors {floors}: the {len(over)} sets there ({len(gone)} parts) removed, "
              f"the pair at {(src[0] + src[1]) / 2:.2f} copied onto the portal's centre ({len(copied)} parts)")
# ---------------------------------------------------------------- the upper floors follow the ground floor
# Every window set on floors 2 to 5 is centred on the storefront bay under it (user 2026-09-13): the ground floor's
# layout is the building's rhythm, and the sets, which the game had spaced evenly, slide along their face to sit over
# it. A set is a sill and everything standing on it (frames, glass, bars, backdrops). Sets and bays are paired in order
# along the face by the pairing that moves the least in total, so a face with more bays than sets (the extra bay by the
# NW corner) simply leaves one bay blank. The sets standing over a portal travel together, centred on it; where they
# cannot fit between their neighbours, the one furthest from the portal goes, which is what happens on the top floor of
# the 3rd Street face, whose two pairs came from a stretch that never had an entrance.
#
# The top floor's openings are cut in the game's own wall, so that wall follows the move: each set's band travels with
# it and the wall between bands stretches to suit, one linear ramp per gap, anchored at the corners where the wall must
# not move. Every vertex carries its u the same distance, so the brick keeps its place on the moved bands and is neither
# stretched nor sheared in between. Where a set is dropped, the wall from its neighbour's band to the next is carved out
# and a plain slab of the same brick takes its place.
MIN_PIER = 0.40                                    # the least wall left standing between two window openings
PANES = {"door": 1, "2p": 2, "3p": 3}               # how many windows a bay of each kind carries above it
def pair_up(centres, sizes, slots, slot_sizes, pin=None):
    # every set on the bay it belongs to: the set of three windows over the three-pane storefront, the pair over a
    # two-pane one, the single over the corner bay -- and among the bays that fit, the pairing that moves the least.
    # Not in order along the face: on the 3rd Street face the game's triple stood before its three-pane bay and has
    # to cross the pair to reach it (user 2026-09-15). A set over a portal is pinned to the portal's own place.
    m, n = len(centres), len(slots); INF = float("inf"); MISFIT = 1000.0
    assert m <= n, f"more window sets than bays: {m} > {n}"
    def cost(i, j):
        if pin and ((i == pin[0]) != (j == pin[1])): return INF
        return abs(centres[i] - slots[j]) + (0.0 if sizes[i] == slot_sizes[j] else MISFIT)
    best = [INF] * (1 << n); back = [None] * (1 << n); best[0] = 0.0
    for mask in range(1 << n):
        c0 = best[mask]
        if c0 == INF: continue
        i = bin(mask).count("1")                       # the sets are placed in order, the bays taken in any order
        if i >= m: continue
        for j in range(n):
            if mask & (1 << j): continue
            c = cost(i, j)
            if c == INF: continue
            nm = mask | (1 << j)
            if c0 + c < best[nm]: best[nm] = c0 + c; back[nm] = (mask, i, j)
    end = min((k for k in range(1 << n) if bin(k).count("1") == m and best[k] < INF), key=lambda k: best[k], default=None)
    assert end is not None, "no way to put the window sets on the bays"
    out = []
    while back[end]: pm, i, j = back[end]; out.append((i, j)); end = pm
    return sorted(out)
def wall_warp(fi, knots):
    # the top floor's wall follows the sets: rigid inside each band, a linear ramp between, still at the corners
    me = W21.data; mw = W21.matrix_world; inv = mw.inverted(); uv = me.uv_layers.active.data
    A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]; L = FACES[fi][3]
    xs = [0.0] + [x for k in knots for x in (k[0], k[1])] + [L]
    ys = [0.0] + [k[2] for k in knots for _ in (0, 1)] + [0.0]
    def f(sv):
        if sv <= xs[0] or sv >= xs[-1]: return 0.0
        for i in range(1, len(xs)):
            if sv <= xs[i]:
                a, b = xs[i - 1], xs[i]
                return ys[i - 1] if b - a < 1e-9 else ys[i - 1] + (ys[i] - ys[i - 1]) * (sv - a) / (b - a)
        return 0.0
    moved = {}
    for v in me.vertices:
        q = mw @ v.co
        if not (TOP_Z0 - 0.1 < q.z < TOP_HEAD_GAME + 0.3): continue
        sv, dv = (q - A).dot(d), (q - A).dot(nrm)
        if abs(dv) > 0.9 or not (-0.2 < sv < L + 0.2): continue
        delta = f(sv)
        if abs(delta) < 1e-9: continue
        v.co = inv @ (q + d * delta); moved[v.index] = delta
    for pl in me.polygons:
        for li in pl.loop_indices:
            i = me.loops[li].vertex_index
            if i in moved: uv[li].uv[0] += U_SLOPE[fi] * moved[i]
    me.update()
    return len(moved)
GAME_MIDS.update({fi: game_mids(fi) for fi in range(len(FACES))})   # before the wall follows its sets
for fi in range(len(FACES)):
    slot_list = sorted([(sum(targets[n]) / 2, PANES[bay_type(n)]) for n in bays if bays[n][0] == fi]
                       + ([(PORTAL_S[fi], 2)] if fi in PORTAL_S else []))
    slots = [q[0] for q in slot_list]; slot_sizes = [q[1] for q in slot_list]
    p0, p1 = (PORTAL_S[fi] - P_HALF, PORTAL_S[fi] + P_HALF) if fi in PORTAL_S else (1e9, 1e9)
    for z_lo, z_hi in UP_BANDS:
        top = z_lo > 15.0
        units = []                                               # [[sets], over a portal]: a portal's sets move as one
        for g in face_sets(fi, z_lo, z_hi):
            over = g[1] > p0 and g[0] < p1
            if over and units and units[-1][1]: units[-1][0].append(g)
            else: units.append([[g], over])
        if not units: continue
        centre = lambda u: (u[0][0][0] + u[0][-1][1]) / 2
        sizes = [n_windows(fi, u[0][0][0], u[0][-1][1], z_lo, z_hi) for u in units]
        pin = next(((i, min(range(len(slots)), key=lambda j: abs(slots[j] - PORTAL_S[fi]))) for i, u in enumerate(units) if u[1]), None)
        chosen = pair_up([centre(u) for u in units], sizes, slots, slot_sizes, pin); target = dict(chosen)
        for i, j in chosen:
            assert not units[i][1] or abs(slots[j] - PORTAL_S[fi]) < 1e-6, f"the set over portal {PORTAL_TAG[fi]} was paired with a bay"
        shift_of = lambda k: slots[target[k]] - centre(units[k]) if k in target else 0.0
        dropped = []                                             # the sets a portal has no room for
        for k, (gs, over) in enumerate(units):
            while len(gs) > 1:
                lo = (units[k - 1][0][-1][1] + shift_of(k - 1)) if k else -1e9
                hi = (units[k + 1][0][0][0] + shift_of(k + 1)) if k + 1 < len(units) else 1e9
                if sum(g[1] - g[0] for g in gs) + MIN_PIER * (len(gs) - 1) <= hi - lo - 2 * MIN_PIER: break
                far = max(gs, key=lambda g: abs((g[0] + g[1]) / 2 - slots[target[k]]))
                dropped.append((k, far)); gs.remove(far)
        plans = []                                               # (set, its move) for every set that stays
        for k, (gs, over) in enumerate(units):
            delta = shift_of(k)
            lo = (units[k - 1][0][-1][1] + shift_of(k - 1) + MIN_PIER) if k else -1e9
            hi = (units[k + 1][0][0][0] + shift_of(k + 1) - MIN_PIER) if k + 1 < len(units) else 1e9
            if len(gs) > 1 and (gs[0][0] + delta < lo or gs[-1][1] + delta > hi):
                widths = [g[1] - g[0] for g in gs]; gap = max(MIN_PIER, (hi - lo - sum(widths)) / (len(gs) - 1)); x = lo
                for g, w in zip(gs, widths): plans.append((g, x - g[0])); x += w + gap
            else:
                for g in gs: plans.append((g, delta))
        picked = []; claimed = set()                             # everything is picked before anything moves
        for n, (g, delta) in enumerate(plans):
            lo = plans[n - 1][0][1] if n else -1e9; hi = plans[n + 1][0][0] if n + 1 < len(plans) else 1e9
            margin = max(0.05, min(0.45, (g[0] - lo) / 2, (hi - g[1]) / 2))
            objs = parts_between(fi, g[0], g[1], z_lo, z_hi)
            keys = {o.name for o in objs}
            assert not (keys & claimed), f"face {fi}: two sets claim {sorted(keys & claimed)[:4]}"
            claimed |= keys; picked.append((g, delta, margin, objs))
        gone = [o for k, g in dropped for o in parts_between(fi, g[0], g[1], z_lo, z_hi)]
        if top:                                                  # the plain wall follows its sets, unless two of them cross
            knots = sorted((b[0] - m, b[1] + m, d) for b, d, m, o in picked)
            if all(knots[i][1] + knots[i][2] <= knots[i + 1][0] + knots[i + 1][2] for i in range(len(knots) - 1)):
                wall_warp(fi, knots)
            else: print(f"face {fi}: sets cross on the top floor, so the wall stays where it is")
        remove(gone)
        moves = []
        for g, delta, margin, objs in picked:
            if abs(delta) < 1e-6: continue
            slide(objs, fi, delta)
            moves.append(f"{(g[0] + g[1]) / 2:.2f}{delta:+.2f}({len(objs)}p)")
        blank = [f"{slots[j]:.2f}" for j in range(len(slots)) if j not in target.values()]
        print(f"face {fi} floors {'2-4' if z_lo < 15 else '5':3s}: {len(picked)} sets over {len(slots)} bays, moved " + ", ".join(moves)
              + (f"; {len(dropped)} set(s) with no room over the portal removed" if dropped else "")
              + (f"; no set over the bay at {', '.join(blank)}" if blank else ""))
        # A bay the game has no set for -- the new one the building grew, and the spare by the NW corner -- takes a copy
        # of the nearest set of its own size, slid onto it, so every bay carries the same windows on every floor
        # (user 2026-09-16). Copied after the move, so the source is already where it belongs.
        for j in [q for q in range(len(slots)) if q not in target.values()]:
            if fi in PORTAL_S and abs(slots[j] - PORTAL_S[fi]) < 1e-6: continue          # the portal's own slot is not a bay
            same = [(i, jj) for i, jj in target.items() if sizes[i] == slot_sizes[j]]
            if not same: continue
            i, jj = min(same, key=lambda t: abs(slots[t[1]] - slots[j]))
            g = units[i][0]; a0 = g[0][0] + shift_of(i); a1 = g[-1][1] + shift_of(i)
            made = []
            for o in [q for q in parts_between(fi, a0, a1, z_lo, z_hi) if not q.name.startswith("attachment")]:
                c = o.copy(); c.data = o.data.copy()
                for coll in o.users_collection: coll.objects.link(c)
                made.append(c)
            slide(made, fi, slots[j] - slots[jj])
            print(f"face {fi} floors {'2-4' if z_lo < 15 else '5':3s}: the bay at {slots[j]:.2f} had no set of its own; "
                  f"a copy of the one at {slots[jj]:.2f} ({len(made)} parts) put on it")

# The fire escapes (user 2026-09-15): the game hung three of them on the 3rd Street face and they stayed where it put
# them while the window sets moved onto the bays, so one was left over blank wall. The middle one goes; each of the
# others slides onto the set nearest it, so a stair always stands in front of windows.
remove([o for n in ("attachment_fire_escape__2462",) if (o := bpy.data.objects.get(n))])
for o in [o for o in bpy.data.objects if o.name.startswith("attachment_fire_escape")]:
    fi = face_of(o); s0, s1 = s_extent(o, fi); c = (s0 + s1) / 2
    groups = face_sets(fi, *UP_BANDS[0])
    if not groups: continue
    g = min(groups, key=lambda q: abs((q[0] + q[1]) / 2 - c)); delta = (g[0] + g[1]) / 2 - c
    o.matrix_world = Matrix.Translation(FACES[fi][1] * delta + FACES[fi][2] * (BRICK_OUT + FIELD_IN)) @ o.matrix_world
    print(f"fire escape {o.name.split('__')[-1]} moved {delta:+.2f} onto the windows at {(g[0] + g[1]) / 2:.2f}, out with the wall")

def plain_box(bm, uvl, fi, s0, s1, z0, z1, y0, y1, brick, rets=(True, True)):
    # a block of plain wall: front, back, the caps, and a return at each end that `rets` asks for -- none where the
    # block runs into the next face's mass round a corner, or into the deeper block beside it, whose own return
    # closes the step there (two returns in one plane would only fight with each other)
    A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]; au, av = BRICK[fi]; cu, cv = brick; L = FACES[fi][3]
    c0, c1 = max(s0, 0.0), min(s1, L)                                  # the caps stop at the corner, the fronts run on
    def P(sv, yv, zv): return A + d * sv + nrm * yv + Vector((0.0, 0.0, zv))
    quads = [(((s0, y1, z0), (s1, y1, z0), (s1, y1, z1), (s0, y1, z1)), (0, 1, 0)),
             (((s0, y0, z0), (s1, y0, z0), (s1, y0, z1), (s0, y0, z1)), (0, -1, 0)),
             (((c0, y0, z1), (c1, y0, z1), (c1, y1, z1), (c0, y1, z1)), (0, 0, 1)),
             (((c0, y0, z0), (c1, y0, z0), (c1, y1, z0), (c0, y1, z0)), (0, 0, -1))]
    if rets[0]: quads.append((((s0, y0, z0), (s0, y1, z0), (s0, y1, z1), (s0, y0, z1)), (-1, 0, 0)))
    if rets[1]: quads.append((((s1, y0, z0), (s1, y1, z0), (s1, y1, z1), (s1, y0, z1)), (1, 0, 0)))
    for q, want in quads:
        pts = [P(*c) for c in q]; w = d * want[0] + nrm * want[1] + Vector((0.0, 0.0, want[2]))
        if (pts[1] - pts[0]).cross(pts[2] - pts[1]).dot(w) < 0: pts.reverse()
        f = bm.faces.new([bm.verts.new(c) for c in pts]); f.smooth = False
        for l in f.loops:
            sv, dv = face_sd(fi, l.vert.co); zz = l.vert.co.z
            if abs(w.z) > 0.5: l[uvl].uv = (au * sv + cu, av * dv)
            elif abs(w.dot(nrm)) > 0.5: l[uvl].uv = (au * sv + cu, av * zz + cv)
            else: l[uvl].uv = (au * dv + cu, av * zz + cv)
# The top floor's wall is put back as plain slabs (user 2026-09-15): the field on the same BRICK_OUT plane as the brick
# below it, and a slab on the columns' plane for every stretch that stands proud -- the two corners and, on the long
# faces, the centre pavilion, which is read off the game's own wall here while it is still standing and laid again on
# the bay the sets have moved onto (user 2026-09-16). Then every set comes out onto it, panel, frames, glass and sill.
MID_STRETCHES.update({fi: read_mid_stretches(fi) for fi in range(len(FACES))})
_me, _mw = W21.data, W21.matrix_world
_bm = bmesh.new(); _bm.from_mesh(_me); bmesh.ops.transform(_bm, matrix=_mw, verts=_bm.verts)
_uvl = _bm.loops.layers.uv.active
for fi in range(len(FACES)):
    outs = out_stretches(fi); game = wall_plane(fi, 0.0, FACES[fi][3])   # where the game left it, so nothing of it is left behind
    runs = []                                                            # the corners, the centre pavilion, the field between them
    for k, (a, b) in enumerate(outs):
        if k and a - outs[k - 1][1] > 1e-6: runs.append((outs[k - 1][1], a, BRICK_OUT, (False, False)))
        runs.append((a, b, COL_OUT, (k > 0, k < len(outs) - 1)))
    # The game's wall goes first and the slabs are laid afterwards, all of them: clearing a run took out the return the
    # run before it had just built on their shared edge, which left the wall open along its whole height wherever the
    # plane changes -- one could see straight through it into the roof (user 2026-09-16). And every slab is given the
    # same back, the deepest one, so that a step's return closes the whole of the thinner slab's end beside it and not
    # just the part in front of it.
    for a, b, front, rets in runs:
        bmesh.ops.delete(_bm, geom=wall_faces_in(_bm, fi, a, b, TOP_Z0 - 0.01, TOP_HEAD_GAME + 0.01, game - 0.6, COL_OUT + 0.4), context='FACES')
    # a raised slab -- a corner's, a centre pavilion's -- starts at the band's top (as it will stand once lifted), where
    # the wall of floors 2 to 4, run on up past the band on those stretches, hands over to it; the field slabs start
    # at the floor line as before, their feet behind the band (user 2026-09-17)
    for a, b, front, rets in runs:
        plain_box(_bm, _uvl, fi, a, b, TOP_Z0 if front < COL_OUT - 1e-6 else B45_Z1 - UPPER_LIFT, TOP_Z1, BRICK_OUT - TOP_T, front, brick_near(fi, a, b), rets)
bmesh.ops.transform(_bm, matrix=_mw.inverted(), verts=_bm.verts); _bm.to_mesh(_me); _bm.free(); _me.update()
n_out = 0
for o in [x for x in bpy.data.objects if x.name.startswith("top_panel")]:
    fi = face_of(o); s0, s1 = s_extent(o, fi)
    rim = max(face_sd(fi, o.matrix_world @ v.co)[1] for v in o.data.vertices)
    want = COL_OUT if in_corner(fi, (s0 + s1) / 2) else BRICK_OUT
    if abs(want - rim) < 1e-4: continue
    T = Matrix.Translation(FACES[fi][2] * (want - rim))
    for q in parts_between(fi, s0, s1, TOP_Z[0], TOP_Z[1]):
        q.matrix_world = T @ q.matrix_world; n_out += 1
print(f"the top floor's wall put back in slabs, its field at {BRICK_OUT:+.2f} and its corners and centre pavilions at "
      f"{COL_OUT:+.2f}; {n_out} parts brought onto their stretch's plane")

# ---------------------------------------------------------------- the top floor's windows rebuilt (user 2026-09-18, the reference photos)
# The game's top-floor window -- two square lights and a segmental arch over a transom bar, in a hole with three stepped
# rings, a sill of its own on the cornice -- is not the building's. The photos (HABS 011973 and 011982, Highsmith)
# show one rectangular light under a true semicircular arch, one course of ring bricks stepping back once into a deep
# reveal, the sash standing straight on the string course with no sill, and a thick transom a little under the
# springing. So every set's panel is built again here, where it finally stands and before the wall takes its hole: a
# plain box on the wall's plane, its brick continuing the slab's own courses; one opening per window cut through it,
# a rectangle from a ledge a lip over the cornice's top up to the springing and a half circle of the window's own
# width over that; and one ring RING_W wide let RING_D into the wall round the arch alone, springing to springing, its
# floor a lip over the springing, where the impost band and the capitals end. Behind the plain REVEAL_D reveal stand a
# new frame of the same shape, its transom, its glass and its backdrop. The game's parts go, sill and all: the frames
# stand on the cornice's very top once lifted, and they are what the lift is measured from.
def cut_world_prism(target, outline, y0, y1, frame=None, op='DIFFERENCE'):
    # subtract a prism -- a closed (x, z) outline in `frame`, extruded from y0 to y1 -- from `target`: cut_world_box
    # with its cutter built as two n-gon caps and a quad per outline edge
    bm = bmesh.new(); n = len(outline)
    A = [bm.verts.new((x, y0, z)) for x, z in outline]; B = [bm.verts.new((x, y1, z)) for x, z in outline]
    bm.faces.new(A); bm.faces.new(B[::-1])
    for i in range(n): bm.faces.new((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if frame: bmesh.ops.transform(bm, matrix=frame, verts=bm.verts)
    me = bpy.data.meshes.new("_cutter"); bm.to_mesh(me); bm.free()
    cutter = bpy.data.objects.new("_cutter", me); S.collection.objects.link(cutter)
    mod = target.modifiers.new("cut", 'BOOLEAN'); mod.operation = op; mod.object = cutter; mod.solver = 'EXACT'
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(target.evaluated_get(deps))
    old = target.data; target.modifiers.clear(); target.data = new_me
    new_me.materials.clear()
    for m in old.materials: new_me.materials.append(m)
    for p in new_me.polygons: p.material_index = 0
    bpy.data.meshes.remove(old); bpy.data.objects.remove(cutter, do_unlink=True); bpy.data.meshes.remove(me)
    assert len(new_me.vertices) > 8, f"the boolean cut emptied {target.name}"
def arch_outline(xc, half, z0, z_spr, n=32):
    # a window's outline in a face's frame: a rectangle from z0 up to the springing z_spr and a true half circle of
    # radius `half` over it, centred (xc, z_spr); counter-clockwise
    pts = [(xc - half, z0), (xc + half, z0), (xc + half, z_spr)]
    pts += [(xc + half * math.cos(math.pi * i / n), z_spr + half * math.sin(math.pi * i / n)) for i in range(1, n)]
    pts.append((xc - half, z_spr)); return pts
def ring_outline(xc, r, z_spr, z_floor, x_lo, x_hi, n=32):
    # the ring's D: the arc of radius r about (xc, z_spr) from the floor up, over and down again, and the floor across;
    # an end that reaches the panel's side (an outer window's ring is exactly as wide as the rim) is set on it, so no
    # sliver of wall is left standing between the ring and the panel's edge
    a0 = math.asin((z_floor - z_spr) / r); xe = min(xc + r, x_hi); xw = max(xc - r, x_lo)
    if abs(xe - x_hi) < 1e-6: xe = x_hi
    if abs(xw - x_lo) < 1e-6: xw = x_lo
    arc = [(xc + r * math.cos(a0 + (math.pi - 2 * a0) * i / n), z_spr + r * math.sin(a0 + (math.pi - 2 * a0) * i / n)) for i in range(1, n)]
    return [(xe, z_floor)] + arc + [(xw, z_floor)]
def slab_brick(fi, sv, pl):
    # the brick offsets the slab's own front carries where a panel stands, so the panel's courses run on from the
    # slab's without a break at its rim. The wall is plain slabs now, one front quad per run: brick_near, which looks
    # for the game's wall beside a stretch, finds nothing on them.
    me = W21.data; mw = W21.matrix_world; R = mw.to_3x3(); uv = me.uv_layers.active.data; au, av = BRICK[fi]; nrm = FACES[fi][2]
    for p in me.polygons:
        if (R @ p.normal).dot(nrm) < 0.7 or on_face(mw @ p.center) != fi: continue
        q = [mw @ me.vertices[me.loops[li].vertex_index].co for li in p.loop_indices]
        ss = [face_sd(fi, w)[0] for w in q]
        if not (min(ss) - 1e-6 <= sv <= max(ss) + 1e-6) or abs(face_sd(fi, q[0])[1] - pl) > 0.01: continue
        if not (TOP_Z[0] < sum(w.z for w in q) / len(q) < TOP_Z[1]): continue
        li = p.loop_indices[0]; return uv[li].uv[0] - au * ss[0], uv[li].uv[1] - av * q[0].z
    assert False, f"face {fi}: no slab front at s {sv:.2f} on the plane {pl:+.2f} to read the brick from"
def top_uvs(me, fi, cu, cv):
    # a rebuilt panel's brick, the wall's own mapping (brick_uvs' structure with the slab's offsets in place of a scale
    # read off the game's wall): along the face and up on its wall faces and the ring's face, across the reveal and up
    # on the reveals and the ring's arc, along and across on the flats (the ledge, the ring's floor, the caps)
    nrm = FACES[fi][2]; au, av = BRICK[fi]
    lay = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap"); me.uv_layers.active = lay; uv = lay.data
    for p in me.polygons:
        nn = p.normal
        for li in p.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co; sv, dv = face_sd(fi, q)
            if abs(nn.z) > 0.5: uv[li].uv = (au * sv + cu, av * dv)
            elif abs(Vector((nn.x, nn.y, 0.0)).dot(nrm)) > 0.7: uv[li].uv = (au * sv + cu, av * q.z + cv)
            else: uv[li].uv = (au * dv + cu, av * q.z + cv)
        p.use_smooth = False
def part_uvs(me, x0, y0, z0):
    # a window part's mapping in its own frame: metres from the part's corner on each side, as the game's frames carry
    uv = me.uv_layers.new(name="UVMap").data
    for p in me.polygons:
        nn = p.normal
        for li in p.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co
            if abs(nn.y) >= max(abs(nn.x), abs(nn.z)): uv[li].uv = (q.x - x0, q.z - z0)
            elif abs(nn.x) >= abs(nn.z): uv[li].uv = (q.y - y0, q.z - z0)
            else: uv[li].uv = (q.x - x0, q.y - y0)
        p.use_smooth = False
def plane_uvs(me):
    # the glass and the pane: the game's 0..1 over the plane
    xs = [v.co.x for v in me.vertices]; zs = [v.co.z for v in me.vertices]; x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    uv = me.uv_layers.new(name="UVMap").data
    for p in me.polygons:
        for li in p.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co; uv[li].uv = ((q.x - x0) / (x1 - x0), (q.z - z0) / (z1 - z0))
        p.use_smooth = False
def top_window(F, name, sc, W, pl, frame_mat, glass_mat):
    # one window's new parts in its face's frame (x = -s, y outward, z up; the objects carry the frame, so their boxes
    # stay tight on the chamfer too, for parts_between and the openings' filters): the frame, an arched ring FRAME_W
    # wide and FRAME_D deep of the window's own shape, its outer edge FRAME_BURY into the reveal, its foot at TOP_FOOT;
    # the transom, a bar across the light with its top TRANSOM_BELOW under the springing; the glass on the frame's inner
    # outline TOP_GLASS_IN behind its front, in the frame's own depth; the backdrop pane TOP_PANE_IN behind it
    xc = -sc; R = W / 2; yf = pl - REVEAL_D; yb = yf - FRAME_D; ins = FRAME_W + FRAME_BURY
    outer = arch_outline(xc, R + FRAME_BURY, TOP_FOOT, TOP_SPRING, 24); inner = arch_outline(xc, R - FRAME_W, TOP_FOOT + ins, TOP_SPRING, 24)
    n = len(outer); bm = bmesh.new()
    Of = [bm.verts.new((x, yf, z)) for x, z in outer]; If = [bm.verts.new((x, yf, z)) for x, z in inner]
    Ob = [bm.verts.new((x, yb, z)) for x, z in outer]; Ib = [bm.verts.new((x, yb, z)) for x, z in inner]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((Of[i], Of[j], If[j], If[i])); bm.faces.new((Ob[j], Ob[i], Ib[i], Ib[j]))
        bm.faces.new((Of[j], Of[i], Ob[i], Ob[j])); bm.faces.new((If[i], If[j], Ib[j], Ib[i]))
    frame = mesh_from_bm(name + "_frame", bm, frame_mat, FIT)
    bm = bmesh.new(); cube(bm, xc - (R - FRAME_W), xc + (R - FRAME_W), yb, yf, TOP_SPRING - TRANSOM_BELOW - TRANSOM_H, TOP_SPRING - TRANSOM_BELOW)
    transom = mesh_from_bm(name + "_transom", bm, frame_mat, FIT)
    parts = [frame, transom]
    for q in parts: part_uvs(q.data, xc - R, yb, TOP_FOOT)
    for suffix, y, mat in (("_glass", yf - TOP_GLASS_IN, glass_mat), ("_pane", yf - TOP_PANE_IN, PANE)):
        bm = bmesh.new(); bm.faces.new([bm.verts.new((x, y, z)) for x, z in inner[::-1]])
        q = mesh_from_bm(name + suffix, bm, mat, FIT); plane_uvs(q.data); parts.append(q)
        if q.data.polygons[0].normal.y < 0: q.data.flip_normals()          # a lone face: wound to look outward
    for q in parts: q.matrix_world = F
    return parts
TOP_WINDOWS = []                                   # (face, panel, its plane, [(s centre, W) ...] along the face): what the impost course and its capitals go by
n_t5 = n_gone = 0
for o in sorted([x for x in bpy.data.objects if x.name.startswith("top_panel")], key=lambda x: x.name):
    fi = face_of(o); r0_old, r1_old = s_extent(o, fi); F = rh_frame(fi)
    pl = max(face_sd(fi, o.matrix_world @ v.co)[1] for v in o.data.vertices)          # the panel's plane: its stretch's
    parts = [q for q in parts_between(fi, r0_old - 0.05, r1_old + 0.05, TOP_Z[0], TOP_Z[1], ("mesh__",)) if not q.name.startswith("mesh__t5_")]
    sills = parts_between(fi, r0_old - 0.05, r1_old + 0.05, TOP_Z[0], TOP_Z[1], ("sill_",))
    assert len(sills) == 1, f"{o.name}: {len(sills)} sills under the set, not one"
    wins, planes = [], []                          # the game's frames as [s centre, W, frame material, glass material]; its glass and panes
    for q in parts:
        a, b = wbbox(q); ds = [face_sd(fi, q.matrix_world @ Vector(c))[1] for c in q.bound_box]; sa, sb = s_extent(q, fi)
        if b.z - a.z < 1.5: continue
        if 0.05 < max(ds) - min(ds) < 0.12: wins.append([(sa + sb) / 2, sb - sa, q.data.materials[0], None])
        elif max(ds) - min(ds) < 0.02: planes.append(((sa + sb) / 2, max(ds), q))
    wins.sort()
    for w in wins:                                 # of a window's two planes the glass stands nearer the wall, the pane behind it
        mine = sorted([q for q in planes if abs(q[0] - w[0]) < 0.05], key=lambda q: -q[1])
        assert len(mine) == 2, f"{o.name}: the window at {w[0]:.2f} has {len(mine)} planes behind its frame, not a glass and a pane"
        assert mine[0][2].data.materials[0].blend_method == 'BLEND' and mine[1][2].data.materials[0] is PANE, f"{o.name}: the window at {w[0]:.2f}: glass {mine[0][2].name}, pane {mine[1][2].name}"
        w[3] = mine[0][2].data.materials[0]
    assert wins, f"{o.name}: no window frames in the set"
    w_max = max(w[1] for w in wins); assert w_max < TOP_W_MAX + 0.002, f"{o.name}: a window {w_max:.3f} wide, wider than TOP_W_MAX"
    r0 = wins[0][0] - wins[0][1] / 2 - RIM_MARGIN; r1 = wins[-1][0] + wins[-1][1] / 2 + RIM_MARGIN    # the rim from the windows themselves: the game's, and exact
    assert abs(r0 - r0_old) < 0.01 and abs(r1 - r1_old) < 0.01, f"{o.name}: its rim was not RIM_MARGIN beyond the outer frames ({r0 - r0_old:+.3f}, {r1 - r1_old:+.3f})"
    z_p0 = TOP_Z0 if pl < COL_OUT - 1e-6 else B45_Z1 - UPPER_LIFT        # the slab's own foot on this stretch (as plain_box has it)
    z_p1 = TOP_SPRING + w_max / 2 + RING_W + RIM_MARGIN                  # the rim over the widest ring
    remove(parts + sills); n_gone += len(parts) + len(sills)
    old_me = o.data; mats = list(old_me.materials)
    bm = bmesh.new(); cube(bm, -r1, -r0, pl - TOP_T, pl, z_p0, z_p1); tf(bm, bm.verts[:], F)
    me = bpy.data.meshes.new(o.name + "_box"); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o.data = me; o.matrix_world = Matrix.Identity(4)
    if old_me.users == 0: bpy.data.meshes.remove(old_me)
    me.name = o.name
    for sc, W, fmat, gmat in wins:                 # the reveal first, then the ring: the two cutters share the arch's centre and never touch
        cut_world_prism(o, arch_outline(-sc, W / 2, TOP_FOOT + TOP_LIP, TOP_SPRING), pl - TOP_T - 0.05, pl + 0.05, F)
        cut_world_prism(o, ring_outline(-sc, W / 2 + RING_W, TOP_SPRING, TOP_SPRING + TOP_LIP, -r1, -r0), pl - RING_D, pl + 0.05, F)
    top_uvs(o.data, fi, *slab_brick(fi, (r0 + r1) / 2, pl))
    for k, (sc, W, fmat, gmat) in enumerate(wins):
        top_window(F, f"mesh__t5_{o.name[len('top_panel_'):]}_{k}", sc, W, pl, fmat, gmat); n_t5 += 1
    TOP_WINDOWS.append((fi, o.name, pl, [(w[0], w[1]) for w in wins]))
assert abs(max(w for fi, nm, pl, ws in TOP_WINDOWS for s, w in ws) - TOP_W_MAX) < 0.002, "the widest top-floor window is not TOP_W_MAX"
print(f"the top floor's windows rebuilt: {len(TOP_WINDOWS)} panels as plain boxes with {n_t5} arched openings "
      f"(W {', '.join(f'{w:.2f}' for w in sorted({round(w, 2) for fi, nm, pl, ws in TOP_WINDOWS for s, w in ws}, reverse=True))}), "
      f"a ring {RING_W:.2f} wide {RING_D:.2f} into the wall round each arch, the frames' feet on the cornice's top at {TOP_FOOT:.3f} "
      f"(no sills), the springing at {TOP_SPRING:.3f}, the arches' apexes at {TOP_SPRING + TOP_W_MAX / 2:.3f}; {n_gone} game parts and sills removed")

# The top floor's wall now takes a hole for every panel where it finally stands.
panels = [o for o in bpy.data.objects if o.name.startswith("top_panel")]
holes = []
for o in panels:
    fi = face_of(o); a, b = wbbox(o); s0, s1 = s_extent(o, fi)
    holes.append((fi, s0, s1, a.z, b.z, max(face_sd(fi, o.matrix_world @ v.co)[1] for v in o.data.vertices)))   # the panel's own plane, which it was brought onto; the hole runs from the slab's foot, whose cap piece the panel's own bottom replaces
_me = W21.data; _mw = W21.matrix_world
_bm = bmesh.new(); _bm.from_mesh(_me); bmesh.ops.transform(_bm, matrix=_mw, verts=_bm.verts)
for fi, s0, s1, z0, z1, front in holes:
    bmesh.ops.delete(_bm, geom=wall_faces_in(_bm, fi, s0, s1, z0, z1, front - 0.6, front + 0.3), context='FACES')
bmesh.ops.transform(_bm, matrix=_mw.inverted(), verts=_bm.verts); _bm.to_mesh(_me); _bm.free(); _me.update()
print(f"top floor: {len(holes)} holes cut in the plain wall ({len(W21.data.polygons)} faces left)")

# The brick wall of floors 2 to 4, built from scratch (user 2026-09-12: the game's layered wall, once its columns, panels,
# separators and the patch over the portal had been worked over, was a mess of seams and slivers): one closed ring around
# the hull on the field plane, FIELD_IN behind the hull and WALL_T thick, with a rectangular hole cut for every window frame
# on those floors, 1 cm inside the frame's edges so the frame hides behind the reveal. It takes the game's brick material
# and the texture scale of the old wall, mapped along each face and up, and the game's wall__8 goes.
WALL_T = 0.25
RECESS_D, RECESS_ABOVE = 0.03, 0.30                            # the recessed panel around each window set: its depth (halved from 0.06, user 2026-09-18: the window's own step inside the bay inset), how far it runs above the frames; as wide as the sill
BAY_D = 0.06                                                   # the bay inset's depth (user 2026-09-18): the window recess's depth as it was when the inset was asked for; the window's own step was halved afterwards, the inset keeps this
assert abs(B45_STEP - BAY_D) < 1e-9, "the band between floors 4 and 5 steps back from the raised bays by the bay inset's depth"
BAY_OUT = BRICK_OUT - BAY_D                                    # -0.16: the inset walls' plane inside their bay panels
COL_W = 0.80                                                   # a brick column's width: the pier blocks' (a bit more than the pilasters' 0.725)
# The storefronts flanking each portal, and the one span the three tiers over the pier each of them shares with the bay
# beyond all take: the edge capital, the break the entablature makes over it and (on the Broadway face) the brick column
# above are every one of them COL_W wide and sit on it (user 2026-09-16). It runs out to the pier's far edge, where the
# recess beside it begins, so no strip of pier is left between the two for the cornice to have to step across twice.
PORTAL_BAYS = {fi: (next(n for n in bays if bays[n][0] == fi and abs(targets[n][1] - (sc - P_HALF - TINY_W)) < 1e-6),
                    next(n for n in bays if bays[n][0] == fi and abs(targets[n][0] - (sc + P_HALF + TINY_W)) < 1e-6))
               for fi, sc in PORTAL_S.items()}
CAP_SPANS = {fi: [(targets[lo][0] - PIER_W, targets[lo][0] - PIER_W + COL_W),
                  (targets[hi][1] + PIER_W - COL_W, targets[hi][1] + PIER_W)] for fi, (lo, hi) in PORTAL_BAYS.items()}
def pier_spans(fi):
    # the piers this face has between its storefronts; the portal's own gap is wider than a pier and is not one
    spans = sorted(targets[n] for n in bays if bays[n][0] == fi)
    return [(a[1], b[0]) for a, b in zip(spans, spans[1:]) if b[0] - a[1] < PIER_W + 1e-3]
def column_spans(fi):
    # Every storefront pier carries a brick column up the wall of floors 2 to 4 (user 2026-09-16): the columns line up
    # with the pillars under them, as the Broadway face already had them. Three of them are already standing: the pair
    # that continues a portal's pilasters, at the portal's own edges; the pier beside each of those storefronts, which
    # takes the capitals' span so the three tiers over it line up (CAP_SPANS); and any pier the wall is already proud
    # over -- inside a corner stretch or under a centre pavilion -- where that mass is the column. What is left gets one
    # of its own, centred on its pier. On the Broadway face this adds nothing, which is what makes it the model.
    taken = list(CAP_SPANS.get(fi, []))
    if fi in PORTAL_S:
        sc = PORTAL_S[fi]; taken += [(sc - P_HALF, sc - P_HALF + COL_W), (sc + P_HALF - COL_W, sc + P_HALF)]
    def hit(a, b, qs): return any(q0 < b - 1e-6 and q1 > a + 1e-6 for q0, q1 in qs)
    out = list(taken)
    for a, b in pier_spans(fi):
        if hit(a, b, taken) or hit(a, b, out_stretches(fi)): continue
        c = (a + b) / 2; out.append((c - COL_W / 2, c + COL_W / 2))
    return sorted(out)
def bay_spans(fi):
    # the bays of an inset wall: the runs between what stands proud of it -- its corner and centre stretches and its
    # columns -- each one a window area the second recess frames (user 2026-09-18). The stretches reach past the
    # face's ends, so a sweep from 0 to L finds nothing before the first block or after the last.
    L = FACES[fi][3]; out = []; s = 0.0
    for a, b in sorted(out_stretches(fi) + column_spans(fi)):
        if a - s > 0.3: out.append((s, a))
        s = max(s, b)
    if L - s > 0.3: out.append((s, L))
    return out
def over_portal(fi, s0, s1):
    # a run centred on a portal. The crown jogs out there with the portal's band, so its top ledge does not reach behind
    # the wall as it does everywhere else (E_IN 0.44 back from its base, to -0.24): the bay and the window panel over a
    # portal close their own foot, and nowhere else, where such a face would lie in the crown's top's own plane.
    return fi in PORTAL_S and abs((s0 + s1) / 2 - PORTAL_S[fi]) < P_HALF
# The game set the frames of the end bays 0.20 nearer the street than the others, to match its proud end piers; on the one
# wall plane every window gets the same reveal: those frames and their glass, bars and backdrops go back to the common depth.
FRAME_FRONT = -0.41                                              # the frames' front behind the hull, as the middle bays have it
def unify_window_depths():
    moved = 0
    for fi, s0, s1, za, zb, d_front in frame_boxes():
        if d_front < FRAME_FRONT + 0.05: continue
        A, t, nrm = face_frame(fi); shift = Matrix.Translation(Vector((nrm.x, nrm.y, 0.0)) * (FRAME_FRONT - d_front))
        for o in bpy.data.objects:
            if o.type != 'MESH' or not o.name.startswith("mesh__"): continue
            a, b = wbbox(o)
            if b.z < za - 0.2 or a.z > zb + 0.2: continue
            cs = [o.matrix_world @ Vector(q) for q in o.bound_box]; c = sum(cs, Vector()) / 8
            sv, d = (Vector((c.x, c.y)) - A).dot(t), (Vector((c.x, c.y)) - A).dot(nrm)
            if s0 - 0.2 < sv < s1 + 0.2 and -0.7 < d < 0.0: o.matrix_world = shift @ o.matrix_world; moved += 1
    return moved
def uv_scale_of(old):
    # the old wall's brick mapping: texture units per metre along the wall and up, from its own edges
    me = old.data; uv = me.uv_layers.active.data; h = Vector((0.0, 0.0)); v = Vector((0.0, 0.0)); nh = nv = 0
    for pl in me.polygons:
        li = list(pl.loop_indices)
        for k in range(len(li)):
            l0, l1 = li[k], li[(k + 1) % len(li)]
            d = me.vertices[me.loops[l1].vertex_index].co - me.vertices[me.loops[l0].vertex_index].co
            if d.length < 0.3: continue
            duv = Vector((abs(uv[l1].uv.x - uv[l0].uv.x), abs(uv[l1].uv.y - uv[l0].uv.y))) / d.length
            if abs(d.z) < 1e-4: h += duv; nh += 1
            elif abs(d.x) < 1e-4 and abs(d.y) < 1e-4: v += duv; nv += 1
    h /= max(nh, 1); v /= max(nv, 1)
    return (h.x, v.y, False) if h.x + v.y >= h.y + v.x else (h.y, v.x, True)      # (scale along, scale up, u and v swapped)
def frame_box(name, F, x0, x1, y0, y1, z0, z1, mat):
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=F @ Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)), verts=r["verts"])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    o = bpy.data.objects.new(name, me); FIT.objects.link(o); return o
def brick_uvs(me, su, sv, swapped):
    # the brick mapping: along the nearest face and up for the wall faces, across the reveal and up for the reveals, along and across for the flat ones
    me.uv_layers.new(name="UVMap"); uv = me.uv_layers.active.data
    for pl in me.polygons:
        c = Vector(pl.center); fi = max(range(len(HULL_E)), key=lambda i: (Vector((c.x, c.y)) - HULL_E[i][0]).dot(face_frame(i)[2]))
        A, t, nrm = face_frame(fi); nn = pl.normal
        for li in pl.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co; s_ = (Vector((q.x, q.y)) - A).dot(t); d_ = (Vector((q.x, q.y)) - A).dot(nrm)
            if abs(nn.z) > 0.5: u, v = s_ * su, d_ * su
            elif abs(Vector((nn.x, nn.y)).dot(nrm)) > 0.7: u, v = s_ * su, q.z * sv
            else: u, v = d_ * su, q.z * sv
            uv[li].uv = (v, u) if swapped else (u, v)
        pl.use_smooth = False
def reveal_faces(o, F, x0, x1, y0, y1, z0, z1, bottom=True):
    # the recess's reveal, added to a window panel: four faces standing from its front (y0) out to the wall's plane
    # (y1) around the hole, each wound so it faces into the recess (a new face's normal is not computed yet, so the
    # winding is worked out from the corners themselves rather than read back off the face)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for q, inward in ((((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)), (1, 0, 0)),
                      (((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)), (-1, 0, 0)),
                      (((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)), (0, 0, 1)),
                      (((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), (0, 0, -1))):
        if inward == (0, 0, 1) and not bottom: continue            # no foot: a ledge below is that face already (the crown's top)
        c = [Vector(v) for v in q]
        if (c[1] - c[0]).cross(c[2] - c[1]).dot(Vector(inward)) < 0: c.reverse()
        f = bm.faces.new([bm.verts.new(F @ v) for v in c]); f.smooth = False
    bm.to_mesh(o.data); bm.free(); o.data.update()
def build_upper_wall(old):
    su, sv, swapped = uv_scale_of(old); mat = old.data.materials[0] if old.data.materials else None
    outer, inner = hull_lines(-BRICK_OUT), hull_lines(-BRICK_OUT + WALL_T); n = len(outer); z0, z1 = FLOOR2_BOTTOM, WALL24_TOP
    bm = bmesh.new()
    O = [[bm.verts.new((outer[i][0].x, outer[i][0].y, z)) for i in range(n)] for z in (z0, z1)]
    I = [[bm.verts.new((inner[i][0].x, inner[i][0].y, z)) for i in range(n)] for z in (z0, z1)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((O[0][i], O[0][j], O[1][j], O[1][i])); bm.faces.new((I[0][j], I[0][i], I[1][i], I[1][j]))
        bm.faces.new((O[1][i], O[1][j], I[1][j], I[1][i])); bm.faces.new((O[0][j], O[0][i], I[0][i], I[0][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("wall_floors_2_4"); bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    wall = bpy.data.objects.new("wall_floors_2_4", me); FIT.objects.link(wall)
    # the brick columns (user 2026-09-12 and 2026-09-16, reference): one over every storefront pier, `column_spans`,
    # continuing the pillar under it up through the zone's blocks to the mid cornice, as wide as those blocks and flush
    # with them, part of the wall itself so the brick runs on
    cap_bot = max(h[4] for h in frame_boxes() if h[4] < 15.2) + RECESS_ABOVE   # where the window recesses end: the capitals stand there
    for fi in range(len(FACES)):
        F = rh_frame(fi); spans = column_spans(fi)
        for a, b in spans:
            cut_world_box(wall, -b, -a, BRICK_OUT - 0.10, COL_OUT, z0 + 0.001, cap_bot, frame=F, op='UNION')
        print(f"face {PORTAL_TAG.get(fi, fi)}: {len(spans)} brick columns at " + ", ".join(f"{a:.2f}" for a, b in spans))
    # The whole wall stands on the one plane now (user 2026-09-15), so every window on these floors travels the same
    # BRICK_OUT + FIELD_IN with it -- frames, glass, bars, backdrops and sills -- and keeps the reveal it had.
    moved = {}
    for fi in range(len(FACES)):
        for o in parts_between(fi, *full_face(fi), 6.0, 15.2, ("mesh__", "bf2_", "sill_")): moved.setdefault(o.name, (o, fi))
    for o, fi in moved.values():
        o.matrix_world = Matrix.Translation(FACES[fi][2] * (BRICK_OUT + FIELD_IN)) @ o.matrix_world
    print(f"floors 2 to 4 brought out to {BRICK_OUT:+.2f}: {len(moved)} window parts came with the wall")
    # and then the corners and each face's centre pavilion come on out to the columns' plane, the wall and everything
    # standing in it together
    # ... and those stretches run on up past the wall's top to the band's top, B45_Z1 (user 2026-09-17): the raised bays
    # carry no band, so their own wall closes the gap the lift opens beside it, up to where the top floor's raised
    # slabs take over
    for fi in range(len(FACES)):
        for a, b in out_stretches(fi):
            cut_world_box(wall, -b, -a, BRICK_OUT - 0.10, COL_OUT, z0 + 0.001, B45_Z1, frame=rh_frame(fi), op='UNION')
    corner = {}
    for fi in range(len(FACES)):
        for a, b in out_stretches(fi):
            for o in parts_between(fi, a, b, 6.0, 15.2, ("mesh__", "bf2_", "sill_")): corner.setdefault(o.name, (o, fi))
    for o, fi in corner.values():
        o.matrix_world = Matrix.Translation(FACES[fi][2] * (COL_OUT - BRICK_OUT)) @ o.matrix_world
    print(f"the corners and centre pavilions of floors 2 to 4 out to {COL_OUT:+.2f}: {len(corner)} parts came with them")
    # The bay recess (user 2026-09-18, two photos, a screenshot, a third photo, a second screenshot): on the inset
    # walls the window area of each bay -- its window sets, which stand one over the other on the three floors, and
    # the wall between them, from the crown's foot up to the capitals' foot -- steps back BAY_D, the window recess's
    # depth again, and its windows, their panels and sills go back with it, so a window now stands two steps into the
    # wall. The user's picture of it: take the windows and the wall between them out, which leaves a rectangular hole
    # three floors tall; make an inset round that hole; put the windows and the wall back in it. So the inset is
    # exactly as wide as the window sets (the sills give the extent) and its edge runs down the sets' own edges with
    # no padding; the field between it and the columns stays standing. A first cut had recessed each run from column
    # to column, which folded into the columns' returns and showed nothing new; a second framed the sets with 0.20 of
    # wall, which the user marked as padding. The raised corner and centre stretches keep their windows where they
    # are; a blank bay, one without window sets, gets no inset. The wall's own front inside the inset goes and comes
    # back BAY_D deeper, with its reveal round it: the top one, facing down, under the strip the brackets hang from;
    # the two sides, facing into the inset, in the same planes as the window panels' own side reveals, which continue
    # them a step further in; and at the foot nothing, since the crown's top ledge at FOOT_TOP is that face already
    # (it reaches E_IN back from its base, to -0.24), so a face there would lie in the same plane and fight it --
    # except over the portals, where the crown jogs out and its ledge stops short of the wall (over_portal).
    bays = {}; up = Vector((0.0, 0.0, 1.0))
    for fi in range(len(FACES)):
        A, d = FACES[fi][0], FACES[fi][1]; A2, t2 = Vector((A.x, A.y)), Vector((d.x, d.y))
        for r0, r1 in bay_spans(fi):
            ext = []
            for sl in parts_between(fi, r0, r1, 6.0, 15.2, ("sill_",)):                   # the sills say where the window area is
                ss = [(Vector(((sl.matrix_world @ v.co).x, (sl.matrix_world @ v.co).y)) - A2).dot(t2) for v in sl.data.vertices]
                ext.append((min(ss), max(ss)))
            if not ext: continue
            w0, w1 = min(e[0] for e in ext), max(e[1] for e in ext)
            spread = max(max(e[0] for e in ext) - w0, w1 - min(e[1] for e in ext))     # how far the floors' sets disagree
            assert spread < 0.03, f"face {fi} run {r0:.2f}..{r1:.2f}: the sets' edges differ by {spread:.3f}"
            bays.setdefault(fi, []).append((w0, w1, r0, r1))
    def in_bay(fi, sv): return any(a - 1e-6 < sv < b + 1e-6 for a, b, r0, r1 in bays.get(fi, []))
    bm = bmesh.new(); bm.from_mesh(wall.data); n_bay = n_foot = 0
    for fi, spans in bays.items():
        A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]
        def P(sv, dv, zv): return A + d * sv + nrm * dv + Vector((0.0, 0.0, zv))
        def quad(c, want):
            pts = [P(*q) for q in c]
            if (pts[1] - pts[0]).cross(pts[2] - pts[1]).dot(want) < 0: pts.reverse()
            f = bm.faces.new([bm.verts.new(q) for q in pts]); f.smooth = False
        for s0, s1, r0, r1 in spans:
            bmesh.ops.delete(bm, geom=wall_faces_in(bm, fi, s0, s1, FOOT_TOP, cap_bot, BRICK_OUT - 0.02, BRICK_OUT + 0.02), context='FACES')
            quad([(s0, BAY_OUT, FOOT_TOP), (s1, BAY_OUT, FOOT_TOP), (s1, BAY_OUT, cap_bot), (s0, BAY_OUT, cap_bot)], nrm)
            quad([(s0, BAY_OUT, cap_bot), (s1, BAY_OUT, cap_bot), (s1, BRICK_OUT, cap_bot), (s0, BRICK_OUT, cap_bot)], -up)
            if over_portal(fi, s0, s1): quad([(s0, BAY_OUT, FOOT_TOP), (s1, BAY_OUT, FOOT_TOP), (s1, BRICK_OUT, FOOT_TOP), (s0, BRICK_OUT, FOOT_TOP)], up); n_foot += 1
            quad([(s0, BAY_OUT, FOOT_TOP), (s0, BRICK_OUT, FOOT_TOP), (s0, BRICK_OUT, cap_bot), (s0, BAY_OUT, cap_bot)], d)
            quad([(s1, BAY_OUT, FOOT_TOP), (s1, BRICK_OUT, FOOT_TOP), (s1, BRICK_OUT, cap_bot), (s1, BAY_OUT, cap_bot)], -d)
            n_bay += 1
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(wall.data); bm.free(); wall.data.update()
    inbay = {}
    for fi, spans in bays.items():
        for s0, s1, r0, r1 in spans:
            for o in parts_between(fi, s0, s1, 6.0, 15.2, ("mesh__", "bf2_", "sill_")): inbay.setdefault(o.name, (o, fi))
    for o, fi in inbay.values():
        o.matrix_world = Matrix.Translation(FACES[fi][2] * -BAY_D) @ o.matrix_world
    print(f"the bay recess: {n_bay} bay insets on the inset walls step back {BAY_D:.2f} to {BAY_OUT:+.2f}, from the crown's foot {FOOT_TOP:.3f} to the capitals' foot {cap_bot:.3f}, "
          f"each exactly its window sets' width; {len(inbay)} window parts went back with them; the field left beside the columns, per inset: "
          + ", ".join(f"{PORTAL_TAG.get(fi, fi)}: " + " ".join(f"{a - r0:.2f}|{r1 - b:.2f}" for a, b, r0, r1 in sp) for fi, sp in bays.items())
          + f"; the crown's top is the ledge under {n_bay - n_foot} of them, the {n_foot} over the portals close their own foot")
    # The window sets (user 2026-09-12): the wall keeps only a rectangular hole per set, from the sill's top to a lintel's
    # height over the frames and a little past the sill's ends; a separate panel mesh sits in each hole, set RECESS_D into
    # it and filling the rest of the wall's thickness, with the set's window holes cut through it 1 cm inside the frames.
    # One panel per sill present (the sills over the portals were swapped for the pair's after the sets were read).
    # The recess belongs to the window, not to the wall (user 2026-09-14, as the top floor is built): the hole is cut
    # out of the wall's own faces, leaving no reveal on it, and the panel brings its own -- four faces standing from its
    # front out to the wall's plane -- so a window and its recess are one object and the wall is only wall.
    # The second floor's windows stand on the crown's foot (user 2026-09-16): the foot is their sill, so they have none
    # of their own, and each is that much taller -- its head where it was, its feet let down onto the foot. The set is
    # read and its panel cut where the game left it, `drop` says how far that one has to come down, and the windows
    # themselves are let down at the end, once nothing reads a bounding box again (they are cached, and editing a mesh
    # does not refresh them).
    holes = frame_boxes(); panels = []; covered = set(); sets = []
    for sl in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("sill_")]:
        a, b = wbbox(sl)
        if b.z > 15.0: continue
        c = (a + b) / 2; fi = max(range(len(HULL_E)), key=lambda i: (Vector((c.x, c.y)) - HULL_E[i][0]).dot(face_frame(i)[2]))
        A, t, nrm = face_frame(fi); ss = [(Vector(((sl.matrix_world @ v.co).x, (sl.matrix_world @ v.co).y)) - A).dot(t) for v in sl.data.vertices]
        s0, s1, z_top = min(ss), max(ss), b.z                                          # the hole exactly as wide as the sill
        mine = [(k, h) for k, h in enumerate(holes) if h[0] == fi and s0 < (h[1] + h[2]) / 2 < s1 and abs(h[3] - z_top) < 0.05]
        if not mine: continue
        fr = COL_OUT if in_corner(fi, (s0 + s1) / 2) else (BAY_OUT if in_bay(fi, (s0 + s1) / 2) else BRICK_OUT)   # the wall's plane there: a corner's, the bay panel's, or the field
        drop = z_top - FOOT_TOP if z_top < FOOT_TOP + 1.0 else 0.0                 # the second floor comes down onto the foot
        sets.append((fi, s0, s1, z_top - drop, max(h[4] for k, h in mine) + RECESS_ABOVE, mine, sl.name, fr, drop))
    bm = bmesh.new(); bm.from_mesh(wall.data)
    for fi, s0, s1, z_top, z1p, mine, nm, fr, drop in sets:
        bmesh.ops.delete(bm, geom=wall_faces_in(bm, fi, s0, s1, z_top, z1p, BRICK_OUT - WALL_T - 0.05, fr + 0.02), context='FACES')   # + 0.02, not 0.05: the bay's reveals, centred 0.03 out from its plane, stay
    bm.to_mesh(wall.data); bm.free(); wall.data.update()
    for fi, s0, s1, z_top, z1p, mine, nm, fr, drop in sets:
        F = rh_frame(fi)
        panel = frame_box("panel_" + nm.split("_")[-1], F, -s1, -s0, BRICK_OUT - WALL_T, fr - RECESS_D, z_top, z1p, mat)
        for k, (f2, sa, sb, za, zb, _) in mine:
            cut_world_box(panel, -(sb - 0.01), -(sa + 0.01), BRICK_OUT - WALL_T - 0.05, fr - RECESS_D + 0.05, za - drop + 0.005, zb - 0.005, frame=F); covered.add(k)
        reveal_faces(panel, F, -s1, -s0, fr - RECESS_D, fr, z_top, z1p, bottom=(drop <= 0.0 or over_portal(fi, s0, s1)))   # let down onto the foot: the crown's top is its foot face
        panels.append(panel)
    for k, (fi, sa, sb, za, zb, _) in enumerate(holes):                                # a window outside any panel keeps a plain hole
        if k in covered: continue
        cut_world_box(wall, -(sb - 0.01), -(sa + 0.01), BRICK_OUT - WALL_T - 0.05, BRICK_OUT + 0.05, za + 0.005, zb - 0.005, frame=rh_frame(fi))
    for o in [wall] + panels: brick_uvs(o.data, su, sv, swapped)
    # and now the second floor's windows are let down onto the foot and their sills go: only what is below the meeting
    # rail moves, so every rail keeps its thickness and the lower sash alone grows
    n_low, gone, done = 0, [], set()
    for fi, s0, s1, z_top, z1p, mine, nm, fr, drop in sets:
        if drop <= 0.0: continue
        zs = z_top + drop
        for o in parts_between(fi, s0, s1, zs, zs + 2.9, ("mesh__", "bf2_")):
            if o.name in done: continue                                 # the game's windows share their meshes, so each
            done.add(o.name); o.data = o.data.copy()                    # one takes a copy of its own before it is let down
            mw = o.matrix_world; inv = mw.inverted()
            for v in o.data.vertices:
                w = mw @ v.co
                if w.z < zs + 0.6: v.co = inv @ Vector((w.x, w.y, w.z - drop))
            o.data.update(); n_low += 1
        if (sl := bpy.data.objects.get(nm)): gone.append(sl)
    remove(gone)
    print(f"the second floor's windows let down onto the crown's foot at {FOOT_TOP:.3f}: {n_low} parts stretched, {len(gone)} sills removed")
    return wall, panels, len(holes) - len(covered)
print(f"end-bay window parts brought to the common depth: {unify_window_depths()}")
wall_upper, window_panels, n_loose = build_upper_wall(w8)
print(f"wall of floors 2 to 4 rebuilt: one ring with {len(window_panels)} set holes and {n_loose} single window holes, {len(wall_upper.data.polygons)} faces; {len(window_panels)} window panels; the game's wall__8 removed")
BRICK_UV = uv_scale_of(w8)                         # the brick's texture scale, for the band between floors 4 and 5 below
remove([w8])

# The mid cornice's ornament is off for now, to come back with a different design (user 2026-09-16): the carved band
# between the top floor and the one below it, on the mid cornice at floor five's foot. The top cornice keeps its own,
# the rich course at the head of the building under the parapet.
_orn = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("cornice_ornament") and wbbox(o)[0].z < 19.0]
remove(_orn); print(f"the mid cornice's ornament off for now: {len(_orn)} mesh removed, the top cornice keeps its own")
# and the mid cornice itself, the game's cornice__2465 (user 2026-09-17): the band between floors 4 and 5 takes its
# place, and new cornices at the band's foot and head are to come
_mid = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("cornice__") and CORNICE_UNDER - 0.01 < wbbox(o)[0].z < CORNICE_UNDER + 0.5]
_midn = sorted(o.name for o in _mid); remove(_mid)
print(f"the game's mid cornice removed: {len(_midn)} mesh " + ", ".join(_midn))
_r20 = [o for o in bpy.data.objects if o.name in ("roof__18", "roof__19", "roof__20")]   # not needed, and they put a lip over the fourth floor's window heads (user 2026-09-16)
_r20n = sorted(o.name for o in _r20); remove(_r20)
print(f"the unused roof slabs removed: {len(_r20n)} meshes " + ", ".join(_r20n))

# The parapet has no pedestals on it (user 2026-09-16, and HABS CA-334's general view): the game stood a 1.10 m square
# post with a 1.22 m coping slab on it at each end and in the middle of every corner stretch and pavilion, and each of
# them reached 0.48 back over the roof deck, so from above they read as boxes left standing on the roof. The real
# building's parapet is a plain band with one straight coping from corner to corner (`parapet_coping`), which is what
# is left once they go. The blocks were doubled, too -- a second post and coping 8 cm behind the first, hidden on every
# side but the top, where the two lids were coincident and rendered as a black patch -- so both copies go with them.
remove([o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("parapet_block")])
print("the parapet's pedestals removed: it keeps its one straight coping, as the building has it")

# The game's two cornice bands and the parapet crown the walls, so they come out the same WALL_OUT (user 2026-09-15):
# the mid cornice would otherwise sit flush with the wall it caps, and the top one would lose as much of its projection.
# Each is one mesh wrapping the building, so it moves vertex by vertex through `plan_offset`, which mitres the corners.
BAND_Z_OUT = ((19.30, 23.00),)                                 # the top cornice with its parapet (the mid cornice is gone)
def in_band(o):
    zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
    return any(z0 <= min(zs) and max(zs) <= z1 for z0, z1 in BAND_Z_OUT)
crowns = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.vertices
          and o.name.startswith(("cornice__", "cornice_ornament__", "parapet_block", "parapet_coping", "roof__", "mesh__")) and in_band(o)]   # the coping too (2026-09-18): it caps the parapet band and was left behind it
print(f"the game's cornices and parapet brought out to {WALL_OUT:+.2f}: {push_out(crowns, verts=True)} meshes "
      + ", ".join(sorted({n.split('__')[0] for n in (o.name for o in crowns)})))

# ---------------------------------------------------------------- ground-floor entablature around the building (frontal photo, user 2026-09-12)
# On the frieze band's top, bottom to top: a small half-round bead, the teeth (dentils) right above it on a barely
# proud backing, the convex ovolo starting right at the teeth's top, and a small squared step on top with a bevel
# so small it only softens the corner. One mitred sweep (everything but the teeth) around the ground floor, jogging
# out over the portal's proud frieze band on both faces, plus arrayed teeth per run. Sized from the user's review
# (2026-09-12: teeth at half size, no band over them, tiny top step); about 0.33 m in all.
E_BEAD_H = 0.03                                                          # half-round on the frieze top (radius 0.015)
E_TEETH_HALF, E_GAP_RATIO = 44, 0.6                                      # 44 teeth from the band's edge to the middle of the lettering; gaps 60% of a tooth (user count)
E_TOOTH_W = 2 * P_HALF / (2 * E_TEETH_HALF + (2 * E_TEETH_HALF - 1) * E_GAP_RATIO)   # 0.033: 88 teeth flush across the 4.66 band, a gap centred on the lettering
E_TOOTH_GAP = E_GAP_RATIO * E_TOOTH_W                                    # 0.020 (pitch 0.053), the same tooth and pitch around the building
E_TOOTH_H = 0.06                                                         # the small course in the frontal photo (15 px at 240 px/m)
E_TOOTH_FACE = 0.04                                                      # teeth faces; their backs are in the wall plane (over the portal: the band's face carried up by a block)
E_BAND_H = 0.03                                                          # small wall above the teeth, flush with their faces, that they connect to (user)
E_OVOLO_H, E_OVOLO_OUT, E_OVOLO_BULGE = 0.12, 0.10, 0.04                 # convex molding: a shallow arc 0.12 tall and 0.10 out (user: less convex, then wider); bulge = its control-point offset
E_CORONA_H, E_CORONA_OUT, E_EDGE_R = 0.025, 0.02, 0.006                  # thin squared top step just past the ovolo; its outer top corner softened by a 6 mm round
E_CORNICE_OUT = 0.05                                                     # the cornice reaches this much further out than the course of teeth it covers (user 2026-09-16): its whole front moves, its back does not, so it oversails them
E_SOFFIT = E_TOOTH_FACE + E_CORNICE_OUT                                  # where its soffit ends, and the foot of everything above it
E_IN = JOG + 0.04 + WALL_OUT                                             # cornice back edge inside the wall even over the jog: closed on top, no coplanar faces
E_TOP = FRIEZE_TOP + E_BEAD_H + E_TOOTH_H + E_BAND_H + E_OVOLO_H + E_CORONA_H     # 5.411 world
Z_TEETH_TOP = FRIEZE_TOP + E_BEAD_H + E_TOOTH_H                          # the cornice sweep starts here; below it the teeth stand on the wall itself
GCOLL = bpy.data.collections.new("GROUND_ENTABLATURE"); S.collection.children.link(GCOLL)
def bead_profile():
    # closed (outward o, z up from the frieze top): the small half-round, its back 3 cm into the wall
    P = [(-0.03, 0.0), (0.0, 0.0)]
    r = E_BEAD_H / 2
    for i in range(1, 8):
        a = -math.pi / 2 + math.pi * i / 8; P.append((r * math.cos(a), r + r * math.sin(a)))
    P += [(0.0, E_BEAD_H), (-0.03, E_BEAD_H)]
    return P
def cornice_profile():
    # closed (outward o, z up from the teeth's top): soffit over the teeth, small band, ovolo, top step, top, back.
    # The front sits E_CORNICE_OUT past the teeth and the whole of it -- soffit, band, ovolo, step -- moves out with
    # that, each moulding keeping its own shape; only the back stays where it is (user 2026-09-16).
    P = [(-E_IN, 0.0), (E_SOFFIT, 0.0), (E_SOFFIT, E_BAND_H)]
    A = Vector((E_SOFFIT, E_BAND_H)); B = Vector((E_SOFFIT + E_OVOLO_OUT, E_BAND_H + E_OVOLO_H))
    ch = B - A; nrm = Vector((ch.y, -ch.x)).normalized()               # chord normal pointing outward and down
    C = (A + B) / 2 + nrm * E_OVOLO_BULGE                               # a gentle convex arc (quadratic bezier), not a quarter-round
    for i in range(1, 7):
        t = i / 6; Q = (1 - t) ** 2 * A + 2 * (1 - t) * t * C + t * t * B; P.append((Q.x, Q.y))
    z3 = E_BAND_H + E_OVOLO_H; o3 = E_SOFFIT + E_OVOLO_OUT + E_CORONA_OUT; r = E_EDGE_R
    P.append((o3 - r, z3))                                             # the step's outer edges, bottom and top, softened by the same small round
    for i in range(1, 3):
        t = -math.pi / 2 + (math.pi / 2) * i / 3; P.append((o3 - r + r * math.cos(t), z3 + r + r * math.sin(t)))
    P += [(o3, z3 + r), (o3, z3 + E_CORONA_H - r)]
    for i in range(1, 3):
        t = (math.pi / 2) * i / 3; P.append((o3 - r + r * math.cos(t), z3 + E_CORONA_H - r + r * math.sin(t)))
    P += [(o3 - r, z3 + E_CORONA_H), (-E_IN, z3 + E_CORONA_H)]
    return P
# ---- the plan: the loops the moldings are swept along. Along each face (counter-clockwise, s from its start) a jog is a
# list of (s, offset) points, offset outward from the wall plane: the portal's frieze band jogs out 0.20 on the portal faces
# (the crown also steps back to the inset between its pier blocks), and over every three-pane storefront the whole stone
# zone from the band strip to the crown steps BACK by 0.20: the portal band's step, and the storefront's own extra inset,
# so the edge over the storefront reads like the two-pane bays' (user 2026-09-12, reference photos). The teeth runs and
# their short returns follow the same jogs.
RECESS = 0.15                                                            # how far the stone zone over a three-pane storefront steps back: it used to be the storefront's own extra inset
                                                                         # (0.20), but on the one wall plane the crown has to carry the brick over the pocket too, so it is capped just
                                                                         # under the crown's own projection -- its square edge stands 1.5 cm proud of the brick instead of 6.5 cm behind it
def portal_jog(sc, inner=None):
    j = [(sc - P_HALF, 0.0), (sc - P_HALF, JOG)]
    if inner: j += [(sc - inner[0], JOG), (sc - inner[0], inner[1]), (sc + inner[0], inner[1]), (sc + inner[0], JOG)]
    return j + [(sc + P_HALF, JOG), (sc + P_HALF, 0.0)]
def jogs_of(portal=True, recess=True, inner=None):
    J = {}
    if portal:
        for fi, sc in PORTAL_S.items(): J.setdefault(fi, []).append(portal_jog(sc, inner))
    if recess:
        for fi, rs in recesses.items(): J.setdefault(fi, []).extend([[(t0, 0.0), (t0, -RECESS), (t1, -RECESS), (t1, 0.0)] for (t0, t1, F, tu0, tu1) in rs])
    return {fi: sorted(js, key=lambda j: j[0][0]) for fi, js in J.items()}
def P_on(fi, s, off=0.0):
    A, d, n, L = FACES[fi]; p = A + d * s + n * off; return (p.x, p.y)
_f0 = sorted((n for n in targets if bays[n][0] == 0), key=lambda n: targets[n][0])
FACE0_PIERS = [(targets[a][1], targets[b][0]) for a, b in zip(_f0, _f0[1:])]    # the gaps between the south face's storefronts
def closure_s(J):
    # where a loop opens and closes: a pier on the south face that no jog of that loop runs over (they differ from
    # loop to loop, and the corner bays' jogs now reach the first pier, so it is looked up rather than fixed)
    for a, b in FACE0_PIERS:
        m = (a + b) / 2
        if all(not (j[0][0] - 1e-6 < m < j[-1][0] + 1e-6) for j in J.get(0, [])): return m
    raise AssertionError("no pier on the south face is clear of every jog: the loop cannot close")
def portal_frame(fi):
    # the portal's frame on its face: x along the face (so that (x, outward, up) is right-handed), y outward, origin at its centre on the wall plane
    A, d, n, L = FACES[fi]; c = A + d * PORTAL_S[fi] + n * WALL_OUT; u = n.cross(Vector((0, 0, 1)))
    F = Matrix((u, n, Vector((0, 0, 1)))).transposed().to_4x4(); F.translation = Vector((c.x, c.y, 0.0)); assert F.to_3x3().determinant() > 0
    return F
PF = {fi: portal_frame(fi) for fi in PORTAL_S}
def u_of(fi, s): return (PF[fi].inverted() @ Vector((*P_on(fi, s), 0.0))).x     # a position along the face in the portal's frame
def loop(J, base=WALL_OUT):
    # a closed clockwise loop around the hull at `base` out from it, with the jogs J (face -> jogs) on top of that, for
    # the sweeps (outward = left of travel). Every face's run is offset, so the two runs meeting at a corner cross past
    # it: they are joined by the one mitred point where their lines meet, not by the hull's own corner.
    s_mid = closure_s(J); pts = []
    spans = [(0, s_mid, FACES[0][3])] + [(i, 0.0, FACES[i][3]) for i in range(1, len(FACES))] + [(0, 0.0, s_mid)]
    def out_start(fi): return base + next((j[0][1] for j in J.get(fi, []) if abs(j[0][0]) < 1e-6 and j[0][1] > 0), 0.0)
    def out_end(fi): return base + next((j[-1][1] for j in J.get(fi, []) if abs(j[-1][0] - FACES[fi][3]) < 1e-6 and j[-1][1] > 0), 0.0)
    for k, (fi, sa, sb) in enumerate(spans):
        o0 = out_start(fi) if abs(sa) < 1e-6 else base
        if k and o0 > 0 and out_end(spans[k - 1][0]) > 0:
            n0, n1 = FACES[spans[k - 1][0]][2], FACES[fi][2]          # the corner both runs step out over: one mitre
            c = FACES[fi][0] + (n0 + n1) * (o0 / (1.0 + n0.dot(n1))); pts.append((c.x, c.y))
        else:
            pts.append(P_on(fi, sa, o0))
        for jog in J.get(fi, []):
            if sa - 1e-6 <= jog[0][0] < sb:
                assert jog[-1][0] < sb + 1e-6, "a jog crosses the loop's closure point"
                pts += [P_on(fi, s, off + base) for (s, off) in jog]
    pts.append(P_on(0, s_mid, base))
    out = []                                       # a jog may start where the previous one ends (an edge capital at a recess's edge): one point, not two
    for q in pts:
        if not out or abs(out[-1][0] - q[0]) > 1e-6 or abs(out[-1][1] - q[1]) > 1e-6: out.append(q)
    # and a point in line with its neighbours, going the same way, adds nothing but a ring whose profile lies flat
    # against the path: where an edge capital's return runs straight on into the recess's beside it, that ring sat
    # between two mitred ones and folded the sweep, tearing a hole in the crown's top (user 2026-09-15)
    keep = [out[0]]
    for i in range(1, len(out) - 1):
        u = Vector(out[i]) - Vector(keep[-1]); v = Vector(out[i + 1]) - Vector(out[i])
        if u.length > 1e-9 and v.length > 1e-9 and abs(u.x * v.y - u.y * v.x) < 1e-9 and u.dot(v) > 0: continue
        keep.append(out[i])
    keep.append(out[-1])
    return keep[::-1]
ENT_JOGS = jogs_of()
segments = []                                  # (a, d, n, L, off, flush): the teeth runs along every face, split at the jogs
returns = []                                   # (a, d, n, L, salient_at_end, flush): the jogs' short returns, teeth on them too (user)
for fi in range(len(FACES)):
    A, d, n, L = FACES[fi]; A = A + n * WALL_OUT                 # the plane the whole elevation stands on
    s0_face, L = full_face(fi); s_ = s0_face                     # the run carries on round each corner to the mitre
    for jog in ENT_JOGS.get(fi, []):
        s0, s1, off = jog[0][0], jog[-1][0], jog[1][1]
        flush = off > 0 and fi in PORTAL_S and abs(s0 - (PORTAL_S[fi] - P_HALF)) < 1e-6      # the portal's own band
        wrap0, wrap1 = s0 <= s0_face + 1e-6, s1 >= L - 1e-6          # a run into a corner has no return there
        if s0 - s_ > 1e-6: segments.append((A + d * s_, d, n, s0 - s_, 0.0, False))
        segments.append((A + d * s0, d, n, s1 - s0, off, flush))
        if off > 0:
            if not wrap0: returns.append((A + d * s0, n, -d, off, True, flush))
            if not wrap1: returns.append((A + d * s1 + n * off, -n, d, off, False, flush))
        else:
            if not wrap0: returns.append((A + d * s0, -n, d, -off, False, False))
            if not wrap1: returns.append((A + d * s1 + n * off, n, -d, -off, True, False))
        s_ = s1
    if L - s_ > 1e-6: segments.append((A + d * s_, d, n, L - s_, 0.0, False))
def run_mesh(name, bm, seg, mat):
    a, d, n, L, off = seg[:5]
    o = mesh_from_bm(name, bm, mat, GCOLL)
    o.location = (a.x + n.x * off, a.y + n.y * off, 0.0); o.rotation_euler = (0, 0, math.atan2(d.y, d.x)); return o
def lcube(bm, x0, x1, o0, o1, z0, z1): cube(bm, x0, x1, -o1, -o0, z0, z1)     # outward = local -y
Z_T0 = FRIEZE_TOP + E_BEAD_H + 0.002; Z_T1 = Z_TEETH_TOP     # 2 mm off the bead's ledge; top exactly at the soffit: the tooth faces share the band's plane, so any overlap z-fights
pitch = E_TOOTH_W + E_TOOTH_GAP
for si, seg in enumerate(segments):
    a, d, n, L, off, flush = seg
    if L < E_TOOTH_W + 0.02: continue
    if flush:                                      # over the portal: exactly 2 x 44 teeth, flush with the band's ends
        cnt, x0 = 2 * E_TEETH_HALF, 0.0
    else:                                          # the wall runs and the recesses: as many as fit at that pitch, a small margin at the corners
        x0 = 0.03; cnt = max(1, int((L - 2 * x0 - E_TOOTH_W) // pitch) + 1)
    span = L - 2 * x0 - E_TOOTH_W; step = span / (cnt - 1) if cnt > 1 else 0
    bm = bmesh.new(); lcube(bm, x0, x0 + E_TOOTH_W, -0.01, E_TOOTH_FACE, Z_T0, Z_T1); teeth = run_mesh(f"ge_teeth_{si}", bm, seg, CARVED)
    m = teeth.modifiers.new("arr", 'ARRAY'); m.count = cnt; m.use_relative_offset = False; m.use_constant_offset = True; m.constant_offset_displace = (step, 0, 0)
# teeth on the jogs' short returns too (user): on the portal's band flush at the salient corner, where they share the corner
# block with the run's end tooth; on the recesses' returns at the regular pitch with the runs' small margin
for ri, (a, d, n, L, salient_at_end, flush) in enumerate(returns):
    x0 = 0.0 if flush else 0.03
    cnt = int((L - 2 * x0 - E_TOOTH_W) // pitch) + 1
    bm = bmesh.new()
    for k in range(cnt):
        x = (L - x0 - E_TOOTH_W - k * pitch) if salient_at_end else (x0 + k * pitch)
        lcube(bm, x, x + E_TOOTH_W, -0.01, E_TOOTH_FACE, Z_T0, Z_T1)
    run_mesh(f"ge_teeth_return_{ri}", bm, (a, d, n, L, 0.0), CARVED)
ent_path = loop(ENT_JOGS)                      # the bead and the cornice: out over the portal's band, back over the three-pane bays
# The BRADBURY band's strip continues around the building (user): a plain band at the band's height on the wall plane,
# 2 cm proud so it covers the game's jointed wall zone, in the portal's stone; over the portal it lies inside the frieze band.
hull_path = loop(jogs_of(portal=False))   # the band strip: no jog over the portal (it lies inside the frieze band), back over the three-pane bays
# The strip carries its own crown -- the bead, the course of teeth and the cornice all stand on the band, so the wall
# behind them belongs to it and not to the ring above (user 2026-09-16). It runs up to where the zone above the cornice
# begins, stepping back from its own STRIP_OUT face to the wall plane at the band's top so the teeth keep their full
# 4 cm of relief against it rather than the 2 cm they would have against the strip's own face.
strip_h = FRIEZE_TOP - BAND_BOTTOM                 # the band itself
strip_top = E_TOP - 0.005 - BAND_BOTTOM            # and on up behind the bead, the teeth and the cornice
bm = bmesh.new(); sweep(bm, hull_path, [(-STRIP_IN, 0.0), (STRIP_OUT, 0.0), (STRIP_OUT, strip_h),
                                        (0.0, strip_h), (0.0, strip_top), (-STRIP_IN, strip_top)], BAND_BOTTOM)
mesh_from_bm("ge_band_strip", bm, STONE, GCOLL)
# The ground-floor piers (user, reference): plain stone piers between the storefronts, in the band strip's plane and
# depth, from the ground to the band. One ring around the hull with every storefront and both portals cut out of it: the
# piers between storefronts, the corner piers with a face on each street, and the narrow strips beside the portal
# pilasters (the storefronts stop TINY_W short of the pilasters) all come out of it.
# the pier ring: a plain rectangle swept round the loop; its joints are grooved into it below, once the openings are cut
bm = bmesh.new(); sweep(bm, loop({}), [(-STRIP_IN, 0.0), (STRIP_OUT, 0.0), (STRIP_OUT, BAND_BOTTOM + 0.005 - Z_GROUND), (-STRIP_IN, BAND_BOTTOM + 0.005 - Z_GROUND)], Z_GROUND)
piers = mesh_from_bm("fit_piers", bm, PIER_STONE, FIT)
for fascia in [o for o in bpy.data.collections["Collection"].all_objects if o.type == 'MESH' and o.name.startswith("storefront_fascia")]:
    F, u0, u1, v0, v1 = bay_frame(fascia)
    cut_world_box(piers, u0, u1, v0 - 1.0, v1 + 1.0, Z_GROUND - 0.05, BAND_BOTTOM + 0.05, frame=F)
for fi, F in PF.items():
    cut_world_box(piers, -P_HALF, P_HALF, -STRIP_IN - 0.2, 0.4, Z_GROUND - 0.05, BAND_BOTTOM + 0.05, frame=F)
    # the game's wall and interior shell (hidden) opened for the portal too, where the game had none (face A)
    carve_faces(wall, -P_HALF - 0.02, P_HALF + 0.02, -3.0, 0.06, Z_GROUND - 0.02, WALL_TOP + 0.01, frame=F)
    carve_faces(shell, -P_HALF - 0.02, P_HALF + 0.02, -3.0, 0.06, 0.3005, 4.1305, frame=F)
print("pier ring:", len(piers.data.polygons), "faces after the openings")
# The piers' joints (user 2026-09-18, a photo of a storefront pier, then a screenshot): the real piers are clad in
# horizontal stone panels with a joint between them. The joints wrap each pier -- its front and both returns into the
# storefronts -- as a square groove PIER_JOINT_H tall and PIER_JOINT_D deep, at the five course lines (six courses over
# the ring's height) and once more right under the band strip, so a pier reads as stacked panels parted from the
# moulding above. A first cut had V-notches in the ring's own profile, on the fronts only and too shallow. These are
# booleans on the ring now that its openings exist, a box at a time, one exact boolean each (a cutter of many boxes in
# one boolean, overlapping where a front box met its return boxes and at the corners, left the exact solver only their
# intersection: the ring came out as a slab one joint tall) -- a front box over each pier, running on past a hull
# corner as far as the front does, so the groove turns the corner with it, and along each
# return that meets a storefront a box back to that storefront's plane, where its frame covers the groove's end. The
# returns against the portals' pilasters, which stand proud of the piers, get none. The top groove lies wholly in the
# ring's last centimetre, so its ceiling is the strip's own underside.
PIER_COURSES, PIER_JOINT_H, PIER_JOINT_D = 6, 0.010, 0.015
PIER_FRONT = WALL_OUT + STRIP_OUT                  # the ring's front, out from the HULL the cutter frames stand on (the ring's own profile is on the wall plane, WALL_OUT out from it; v81 measured the boxes from the hull with STRIP_OUT alone and cut 696 voids inside the ring)
PIER_H = BAND_BOTTOM + 0.005 - Z_GROUND
joint_bands = [(Z_GROUND + k * PIER_H / PIER_COURSES - PIER_JOINT_H / 2, Z_GROUND + k * PIER_H / PIER_COURSES + PIER_JOINT_H / 2) for k in range(1, PIER_COURSES)]
joint_bands.append((BAND_BOTTOM - PIER_JOINT_H, BAND_BOTTOM + 0.01))
pier_runs = []                                     # (face, a, b, the inset of the storefront at a or None, the same at b)
for fi in range(len(FACES)):
    L = FACES[fi][3]
    opens = sorted((targets[n][0], targets[n][1], bay_inset[n]) for n in bays if bays[n][0] == fi)
    if fi in PORTAL_S: opens = sorted(opens + [(PORTAL_S[fi] - P_HALF, PORTAL_S[fi] + P_HALF, None)])   # the pilasters stand proud: no reveal
    prev_end, prev_ins = 0.0, None
    for a, b, ins in opens + [(L, L, None)]:
        if a - prev_end > 0.03: pier_runs.append((fi, prev_end, a, prev_ins, ins))
        prev_end, prev_ins = b, ins
n_boxes = 0
for zb0, zb1 in joint_bands:
    boxes = []
    for fi, s0, s1, ins0, ins1 in pier_runs:
        F = rh_frame(fi); L = FACES[fi][3]
        e0 = corner_reach(fi, False, PIER_FRONT) - 0.005 if s0 <= 1e-6 else s0 - 0.02       # past the hull corner as far as the front runs, or a little into the opening
        e1 = L + corner_reach(fi, True, PIER_FRONT) + 0.005 if s1 >= L - 1e-6 else s1 + 0.02
        boxes.append((F, -e1, -e0, PIER_FRONT - PIER_JOINT_D, PIER_FRONT + 0.02, zb0, zb1))
        # the return boxes run back to the storefront's front plane, hull + STRIP_OUT - inset as the layout places it
        # (v_front above): WALL_OUT + inset behind the pier face, the storefronts having stayed where the game left them
        # when the wall plane moved out. v82 took them back by the inset alone and stopped halfway along the exposed return.
        if ins0 is not None: boxes.append((F, -(s0 + PIER_JOINT_D), -(s0 - 0.02), STRIP_OUT - ins0, PIER_FRONT + 0.02, zb0, zb1))
        if ins1 is not None: boxes.append((F, -(s1 + 0.02), -(s1 - PIER_JOINT_D), STRIP_OUT - ins1, PIER_FRONT + 0.02, zb0, zb1))
    for bx in boxes: cut_world_box(piers, *bx[1:], frame=bx[0])
    n_boxes += len(boxes)
print(f"the piers' joints: {len(pier_runs)} piers, square grooves {PIER_JOINT_H * 1000:.0f} mm tall and {PIER_JOINT_D * 1000:.0f} mm deep at "
      + ", ".join(f"{(a + b) / 2:.3f}" for a, b in joint_bands[:-1]) + f" and under the strip at {BAND_BOTTOM:.3f}, wrapping the fronts and the storefront returns back to the storefronts' fronts ({WALL_OUT + INSET:.2f} / {WALL_OUT + INSET_WIDE:.2f} behind the pier face): "
      f"{n_boxes} boxes cut one by one; the ring {len(piers.data.polygons)} faces")
assert len(piers.data.polygons) > 2000, f"the pier ring has only {len(piers.data.polygons)} faces after its joints: the cuts went wrong"
# Over each three-pane storefront the wall steps back with the mouldings: the band strip and the ring above it both jog
# there on the same path, so the pocket is part of each of them and needs no lining of its own.
print("recesses over the deep storefronts:", {fi: len(rs) for fi, rs in recesses.items()})
for name, prof, zb in (("ge_bead", bead_profile(), FRIEZE_TOP), ("ge_cornice", cornice_profile(), Z_TEETH_TOP)):
    bm = bmesh.new(); sweep(bm, ent_path, prof, zb); o = mesh_from_bm(name, bm, STONE, GCOLL, smooth=True)
    if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
# over the portal the band's face and end faces carry on up to the cornice: a block between the wall plane and the band plane
for fi, F in PF.items():
    world_box(f"fit_band_top_{PORTAL_TAG[fi]}", -P_HALF, P_HALF, -0.01, JOG, FRIEZE_TOP, Z_TEETH_TOP + 0.005, CARVED, wall, frame=F)

# ---------------------------------------------------------------- the zone above the cornice, up to the second floor (user 2026-09-12, reference crop)
# The wall of this zone follows the ground floor's silhouette (proud over the portal, like the frieze band) and a crown
# molding runs around the building at its top: a small convex curve turning into a concave sweep, with a square edge
# on top that carries the second floor's window sills. The big tooth blocks over the three central bays come later.
# The stack from the cornice step to the second floor (user 2026-09-12: nothing of the plain wall band shows above the
# crown, whose square edge sits right under the brick as in the reference): the openings on the step, the bar over them,
# the crown over the bar up to the floor line, sharing the 0.68 in the reference's proportion (zone 0.44, crown 0.23).
BAR_H, BAR_OUT = 0.08, 0.03                        # the small bar under the crown, across the inset
HOLE_W, HOLE_H, HOLE_D, N_HOLES = 0.18, 0.34, 0.25, 11        # 11 openings across the inset, the first and last starting right at the pier blocks; deep (user)
Z_HOLE0 = E_TOP + 0.003                            # the openings start right on the cornice step: no plain strip below them (user)
Z_HOLE1 = Z_HOLE0 + HOLE_H
M_BOTTOM = Z_HOLE1 + 0.02 + BAR_H                  # about 5.86: the bar sits right over the openings and the crown right over the bar
Z2_TOP = FLOOR2_BOTTOM                             # 6.092: the crown's top edge on the second floor line, the brick right on it (user)
M_EDGE_H, M_EDGE_STEP = 0.06, 0.015                # the square edge on top, stepping 1.5 cm past the curve
M_CURVE_H = Z2_TOP - M_BOTTOM - M_EDGE_H           # about 0.17: the curve fills the rest
M_OUT = 0.15                                       # the curve's reach: it rises M_CURVE_H over this, from the wall plane to under the square edge
assert RECESS < M_OUT + M_EDGE_STEP + BRICK_BACK, "the stone zone steps back further than the crown reaches out: the brick would hang over the pocket"
# The curve is an S (user 2026-09-16): a hollow sweeping up out of the wall and a small convex crest rolling over into
# the square edge above it, with the turn between them M_S_TURN of the way up the chord -- most of it is the hollow.
# M_BULGE is how far the crest bellies out of its own chord (0.05 to start, halved, then 40% off that again, all user);
# M_HOLLOW is how far the sweep below hollows in from its own.
M_S_TURN, M_HOLLOW, M_BULGE = 0.70, 0.028, 0.015
M_BEAD_OUT, M_BEAD_R = 0.022, 0.012                # the lip at the foot (user 2026-09-18): its reach, and the round at its bottom corner
M_HOLLOW_RISE = 0.05                               # the hollow leaves the round straight up: its first handle's length (the second is the old control point's, at the turn)
# A foot stands on the crown's top, the last member of the ground-floor entablature (user 2026-09-16): a square band
# 0.20 tall taking 60% of the crown's projection, so 40% of the top ledge still shows outside it, with its top 2 cm
# rounded over convex. It rises past the second floor line, standing against the foot of the brick rather than under it.
M_FOOT_R, M_FOOT_TAKE = 0.02, 0.60                 # M_FOOT_H is up with the floor lines: the second floor's windows stand on this foot
M_FOOT_OUT = M_FOOT_TAKE * (M_OUT + M_EDGE_STEP)
def crown_profile():
    # closed (outward o, z up from M_BOTTOM): an S -- a long hollow out of the wall, a short convex crest over it --
    # then the square edge, the top ledge, the foot standing on it, and back into the wall
    # a small convex edge at the foot (user 2026-09-18, three times): a lip M_BEAD_OUT proud whose bottom corner is
    # the convex part, the underside rounding up on M_BEAD_R to the vertical, and the hollow leaving the top of the
    # round straight up, tangent to it, bending outward as it rises: convex running into concave with no step between.
    # A first cut put a square step at the corner with the round on top; a second put the round at the corner but a
    # short face and a shelf over it, from which the hollow rose -- a step above the convex curve (the user's red line).
    P = [(-E_IN, 0.0), (M_BEAD_OUT - M_BEAD_R, 0.0)]
    for i in range(1, 5):
        a = -math.pi / 2 + (i / 4) * (math.pi / 2); P.append((M_BEAD_OUT - M_BEAD_R + M_BEAD_R * math.cos(a), M_BEAD_R + M_BEAD_R * math.sin(a)))
    A = Vector((M_BEAD_OUT, M_BEAD_R)); B = Vector((M_OUT, M_CURVE_H)); T = A + (B - A) * M_S_TURN   # the S turns at T
    ch = T - A; Cq = (A + T) / 2 + Vector((-ch.y, ch.x)).normalized() * M_HOLLOW            # the old control point, inward-up (concave): it still sets the tangent into the turn
    H1 = A + Vector((0.0, M_HOLLOW_RISE)); H2 = T + (Cq - T) * (2.0 / 3.0)                  # a cubic: straight up off the round, into the turn as before
    for i in range(1, 9):
        t = i / 8; Q = (1 - t) ** 3 * A + 3 * (1 - t) ** 2 * t * H1 + 3 * (1 - t) * t * t * H2 + t ** 3 * T; P.append((Q.x, Q.y))
    ch2 = B - T; C2 = (T + B) / 2 + Vector((ch2.y, -ch2.x)).normalized() * M_BULGE          # control point outward-down: convex
    for i in range(1, 5):
        t = i / 4; Q = (1 - t) ** 2 * T + 2 * (1 - t) * t * C2 + t * t * B; P.append((Q.x, Q.y))
    P += [(M_OUT + M_EDGE_STEP, M_CURVE_H), (M_OUT + M_EDGE_STEP, M_CURVE_H + M_EDGE_H)]
    zl = M_CURVE_H + M_EDGE_H; zt = zl + M_FOOT_H                                  # the crown's top ledge, and the foot's top
    P += [(M_FOOT_OUT, zl), (M_FOOT_OUT, zt - M_FOOT_R)]                           # in along the ledge, then up the foot's face
    cx, cy = M_FOOT_OUT - M_FOOT_R, zt - M_FOOT_R                                  # the top centimetre rounded over, convex
    for i in range(1, 7):
        a = (i / 6) * (math.pi / 2); P.append((cx + M_FOOT_R * math.cos(a), cy + M_FOOT_R * math.sin(a)))
    P.append((-E_IN, zt))
    return P
# Over the portal (user 2026-09-12): a pier block above each pilaster, a bit wider than it (flush with the band's outer
# end, the extra width inward), standing on the cornice step and capped by the crown; between the blocks the zone is
# INSET behind their faces. The crown molding jogs out over the blocks and back over the inset.
Z2_BLOCK_W = COL_W                                 # the pilasters are 0.725; the brick columns above share this width
Z2_INSET = 0.12                                    # the inset's face behind the block faces (0.08 proud of the wall plane)
Z2_IN, Z2_OUT = P_HALF - Z2_BLOCK_W, JOG - Z2_INSET   # 1.53: the inset's half width; 0.08: its offset from the wall
# The three central bays (user 2026-09-12, reference photo): the pier blocks are repeated at the far edge of the storefront
# on each side of the portal, over the pier it shares with the three-pane bay (the edge capitals), and the row of openings
# with its bar runs over those two storefronts as well, from the portal's block to the edge capital. The edge capitals stand
# only a bit proud of the wall (the cornice's top ledge is just 0.16 deep there, user) and their extra width goes inward,
# like the portal's blocks'. The zone between is a slab at the wall plane (the game's band wall carved away there) so the
# openings have their depth.
CAP_OUT = 0.08                                     # the edge capitals' projection from the wall plane (the portal's blocks stand 0.20 out, on the band)
                                                   # an edge capital is as wide as the column standing on it and as the portal's
                                                   # own blocks (CAP_SPANS above), so the break in the entablature lines up with
                                                   # the brick over it and the two meet the recess beside them in one step
ZONE_IN = 0.30                                     # the inset and the side zones' slabs reach this far into the wall: the openings end inside them
# The wall of the level above the band strip is one swept ring of its own, exactly as the strip is for the level below
# (user 2026-09-16): it runs from the strip's top -- above the cornice, which the strip itself carries -- to the second
# floor, so the two meet instead of overlapping, and it
# steps back over the three-pane storefronts on the same path, which makes the recess pockets part of it rather than a
# lining fitted into the game's wall. The game's `wall__7`, which had done both jobs and overlapped the strip by 0.58,
# goes with it. Over the three central bays of a portal face the blocks and slabs are the wall, so the ring is cut away
# there -- only across the zone's own height, since the course of teeth below still stands against it.
UPPER_Z0, UPPER_Z1 = E_TOP - 0.005, FLOOR2_BOTTOM
bm = bmesh.new(); sweep(bm, hull_path, [(-ZONE_IN, 0.0), (0.0, 0.0), (0.0, UPPER_Z1 - UPPER_Z0), (-ZONE_IN, UPPER_Z1 - UPPER_Z0)], UPPER_Z0)
upper_band = mesh_from_bm("ge_upper_band", bm, w7.data.materials[0] if w7.data.materials else STONE, GCOLL)
HOLE_PITCH = (2 * Z2_IN - HOLE_W) / (N_HOLES - 1)  # 0.288: the portal row's pitch, kept over the side storefronts
SIDE_ZONES = {}                                    # face -> [(cap_s0, cap_s1, zone_s0, zone_s1)] along the face, before and after the portal
for fi, sc in PORTAL_S.items():
    (a0, b0), (a1, b1) = CAP_SPANS[fi]             # the capitals; the slab beside each runs from it to the portal's block
    SIDE_ZONES[fi] = [(a0, b0, b0, sc - P_HALF), (a1, b1, sc + P_HALF, a1)]
J = jogs_of(inner=(Z2_IN, Z2_OUT))
for fi, zs in SIDE_ZONES.items(): J[fi] = sorted(J.get(fi, []) + [[(a, 0.0), (a, CAP_OUT), (b, CAP_OUT), (b, 0.0)] for (a, b, _, _) in zs], key=lambda j: j[0][0])
crown_path = loop(J)                               # the crown: out over the pier blocks, back over the inset, a bit out over the edge capitals, back over the three-pane bays
bm = bmesh.new(); sweep(bm, crown_path, crown_profile(), M_BOTTOM); o = mesh_from_bm("ge_crown", bm, STONE, GCOLL, smooth=True)
if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
z0, z1 = E_TOP - 0.005, M_BOTTOM + 0.005           # from the cornice step up into the molding
def hole_row(target, F, v_face, u0, u1, n=None):
    # a row of openings HOLE_W wide and HOLE_D deep into the face at v_face (in the portal's frame), across u0..u1 at the
    # portal row's pitch: the first and the last flush against the blocks at both ends (user)
    if n is None: n = max(2, round((u1 - u0 - HOLE_W) / HOLE_PITCH) + 1)
    pitch = (u1 - u0 - HOLE_W) / (n - 1)
    for k in range(n):
        uk = u0 + k * pitch
        cut_world_box(target, uk - (0.005 if k == 0 else 0.0), uk + HOLE_W + (0.005 if k == n - 1 else 0.0), v_face - HOLE_D, v_face + 0.01, Z_HOLE0, Z_HOLE1, frame=F)
    return n
for fi, F in PF.items():
    tag = PORTAL_TAG[fi]
    # the blocks reach as deep into the wall as the slabs: the rows' end openings are cut 5 mm into them, so a block face
    # must close each open end (a shallow block left them open into the void behind the wall)
    world_box(f"fit_pier_{tag}_L", -P_HALF, -Z2_IN, -ZONE_IN, JOG, z0, z1, CARVED, wall, frame=F)
    world_box(f"fit_pier_{tag}_R", Z2_IN, P_HALF, -ZONE_IN, JOG, z0, z1, CARVED, wall, frame=F)
    inset = world_box(f"fit_inset_{tag}", -Z2_IN, Z2_IN, -ZONE_IN, Z2_OUT, z0, z1, CARVED, wall, frame=F)
    # under the crown, across the inset: the small bar; right below it the row of rectangular openings, taller than wide,
    # cut into the inset face (the reference's dark openings over the portal bay), with a pocket in the game's wall band
    # behind them so its face never shows at their bottom
    world_box(f"fit_bar_{tag}", -Z2_IN - 0.005, Z2_IN + 0.005, Z2_OUT - 0.005, Z2_OUT + BAR_OUT, M_BOTTOM - BAR_H, M_BOTTOM + 0.005, CARVED, wall, frame=F)
    # the game's band wall goes from behind the whole run, capitals included: the blocks and the slabs are the wall
    # here, with nothing of the game's left under them or behind the openings' backs (user 2026-09-15)
    us = [u_of(fi, v) for zs in SIDE_ZONES[fi] for v in zs]
    cut_world_box(upper_band, min(us) - 0.001, max(us) + 0.001, -ZONE_IN - 0.05, 0.05, z0 - 0.01, z1 + 0.01, frame=F)
    hole_row(inset, F, Z2_OUT, -Z2_IN, Z2_IN, N_HOLES)
    # the side storefronts: the edge capital over the far pier (its back a hair inside the wall plane, clear of the recess
    # liner beside it), the zone slab at the wall plane in place of the band wall's face, its bar, its row of openings
    for side, (a, b, q0, q1) in zip(("lo", "hi"), SIDE_ZONES[fi]):
        ua, ub = sorted((u_of(fi, a), u_of(fi, b))); uq0, uq1 = sorted((u_of(fi, q0), u_of(fi, q1)))
        # one block, the full depth of the slabs beside it, exactly as the portal's own blocks are built (user 2026-09-15):
        # it closes the zone row's end opening, which is cut 5 mm into it, and its outer face is the recess pocket's wall
        world_box(f"fit_cap_{tag}_{side}", ua, ub, -ZONE_IN, CAP_OUT, z0, z1, CARVED, wall, frame=F)
        zone = world_box(f"fit_zone_{tag}_{side}", uq0, uq1, -ZONE_IN, 0.0, z0, z1, CARVED, wall, frame=F)   # ends exactly at the blocks: the end openings cut 5 mm past it (a cutter face on the slab end would leave the hole open)
        world_box(f"fit_bar_{tag}_{side}", uq0 - 0.005, uq1 + 0.005, -0.005, BAR_OUT, M_BOTTOM - BAR_H, M_BOTTOM + 0.005, CARVED, wall, frame=F)
        n = hole_row(zone, F, 0.0, uq0, uq1)
        print(f"side zone {tag}_{side}: capital u {ua:.3f}..{ub:.3f} ({ub - ua:.3f} wide), zone u {uq0:.3f}..{uq1:.3f} with {n} openings")
print(f"the level above the band strip: one ring {UPPER_Z0:.3f} .. {UPPER_Z1:.3f}, {len(upper_band.data.polygons)} faces; the game's band wall removed")
remove([w7])

# ---------------------------------------------------------------- cameras (build_portal_v3's inspection rig) and a daylight world for the review renders
rig = bpy.data.collections.get("INSPECTION_RIG")
if not rig: rig = bpy.data.collections.new("INSPECTION_RIG"); S.collection.children.link(rig)
def cam(name, loc, tgt, lens):
    o = bpy.data.objects.get(name)
    if not o:
        cd = bpy.data.cameras.new(name); o = bpy.data.objects.new(name, cd); rig.objects.link(o); cd.clip_end = 500
    o.location = Vector(loc); o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); o.data.lens = lens; return o
cam("PortalCam", (12.6 + 11.5, YC, 3.0), (12.6, YC, 3.2), 38)
cam("PortalQuarterCam", (12.6 + 8.0, YC + 7.0, 2.0), (12.6, YC + 0.2, 3.6), 30)
cam("EntablatureCam", (12.6 + 6.0, YC + 1.5, 4.4), (12.6, YC + 0.4, 5.0), 45)
cam("ArchDetailCam", (12.6 + 4.2, YC + 2.2, 3.2), (12.6, YC + 0.6, 3.8), 45)
cam("CapitalCam", (12.6 + 3.2, YC + 4.2, 3.7), (12.75, YC + 2.4, 4.3), 45)
cam("PiersCam", (12.6 + 4.5, YC - 2.6, 1.6), (12.2, YC - 1.0, 2.5), 40)
cam("HallCam", (12.6 + 4.8, YC + 2.9, 1.7), (11.4, YC + 0.2, 2.3), 32)
cam("BackPortalCam", (W_E - 11.5, YE, 3.0), (W_E, YE, 3.2), 38)
xa, ya = P_on(0, PORTAL_S[0])
cam("SouthPortalCam", (xa, ya - 11.5, 3.0), (xa, ya, 3.2), 38)
cam("SouthQuarterCam", (xa + 7.0, ya - 8.0, 2.0), (xa + 0.2, ya, 3.6), 30)
sun = bpy.data.objects.get("InspectSun")
if not sun:
    ld = bpy.data.lights.new("InspectSun", 'SUN'); sun = bpy.data.objects.new("InspectSun", ld); rig.objects.link(sun)
sun.rotation_euler = Vector((-0.7, 0.35, -0.65)).normalized().to_track_quat('-Z', 'Y').to_euler(); sun.data.energy = 3.5
if not S.world: S.world = bpy.data.worlds.new("World")
S.world.use_nodes = True
bg = next((nd for nd in S.world.node_tree.nodes if nd.type == 'BACKGROUND'), None)
if bg: bg.inputs["Color"].default_value = (0.62, 0.72, 0.88, 1.0); bg.inputs["Strength"].default_value = 1.0
S.camera = bpy.data.objects["PortalCam"]

# ---------------------------------------------------------------- the textures: back to the game's own files
# The glTF export packed every texture into the .blend, 31 MB of PNG, and they are the game's own PBR maps: the six the
# building's config names (brick, brownstone, terracotta, the two red sandstones, rough concrete) and the painted
# plaster of the floor plates. link_game_textures.py puts each file in place of the packed copy, with a path relative
# to this .blend, so the block carries geometry and nothing else (user 2026-09-13). It does nothing when the baseline
# file has already been through the same tool: the images are then linked from the start and arrive here that way.
sys.path.insert(0, HERE)
from link_game_textures import link_to_game_assets
link_to_game_assets(ROOT)

# ---------------------------------------------------------------- save, then link the portal (relative to the saved file) and instance it on both faces
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
with bpy.data.libraries.load(PORTAL, link=True, relative=True) as (data_from, data_to):
    assert "PORTAL" in data_from.collections, "bradbury_portal.blend has no PORTAL collection (regenerate it with the current scripts)"
    data_to.collections = ["PORTAL"]
portal = data_to.collections[0]
PC = bpy.data.collections.new("BRADBURY_PORTAL"); S.collection.children.link(PC)
# the three portals stand on the wall plane like every other wall, so their own band keeps its JOG ahead of it
PM = {fi: portal_matrix(*P_on(fi, PORTAL_S[fi], WALL_OUT), a) for fi, a in ((0, 0.0), (2, math.pi / 2), (4, -math.pi / 2))}
for name, M in (("PORTAL_C", PM[2]), ("PORTAL_E", PM[4]), ("PORTAL_A", PM[0])):
    e = bpy.data.objects.new(name, None); e.instance_type = 'COLLECTION'; e.instance_collection = portal; e.empty_display_size = 0.5
    PC.objects.link(e); e.matrix_world = M
# A capital at the top of every brick column, the portal's own pilaster capital (user 2026-09-16). It fills the band
# between the fourth floor's window heads and the mid cornice -- the room the removed ornament and the raised wall
# leave -- so it starts where those windows end, is scaled whole to that height so the carving keeps its proportions,
# is centred on its column and stands its own flare proud of it. Its back runs on into the wall, where nothing sees it.
# Everything from the mid cornice up -- that cornice, the top floor with its windows, the top cornice, the parapet and
# the roof -- is lifted UPPER_LIFT to make room for them (user 2026-09-16). The brick of floors 2 to 4 was built to the
# lifted underside already, so the band the lift opens over the fourth floor's windows is plain wall, not a hole.
# The lift is UPPER_LIFT now (user 2026-09-17): the capitals' 0.300 and, over that, the band between floors 4 and 5 with
# its cornices, so the fifth floor's windows come to stand on the top cornice's top at B45_TOP. The head group -- the
# roof deck, the dentil course, the top cornice, the parapet wall and its coping, everything from the game's wall head
# up -- comes down TOP_DROP less, so a shorter top floor (user 2026-09-18) keeps its head closed against them.
_s5 = min(wbbox(o)[0].z for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("mesh__t5_") and o.name.endswith("_frame"))
assert abs(_s5 - SILL5_GAME) < 0.002, f"the top floor's frames stand at {_s5:.3f}, not {SILL5_GAME:.3f}: they stand where the game's sills' underside was, and UPPER_LIFT is measured from them"
_up = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.vertices and wbbox(o)[0].z > CORNICE_UNDER - 1e-4]
_head = [o for o in _up if wbbox(o)[0].z > TOP_HEAD_GAME - 1e-3]
assert len(_head) == 8 and all(o.name.startswith(("roof__", "cornice_ornament__", "cornice__", "mesh__2635", "parapet_coping__")) for o in _head), sorted(o.name for o in _head)
for o in _up: o.matrix_world = Matrix.Translation(Vector((0.0, 0.0, UPPER_LIFT - (TOP_DROP if o in _head else 0.0)))) @ o.matrix_world
# Two of the game's head pieces, seen closer now that the top floor is shorter (review 2026-09-19): the roof deck's
# three planes lay in the parapet band's foot plane, pushed out to the pavilions' face, so from below, between the
# dentils, their backfaces fought the band's soffit; they ride DECK_LIFT over it, inside the band's own solid (the
# fourth deck piece already stood 2 mm up). And the top cornice carried a few smooth-shaded polygons among its flat
# ones, a dark triangle at the pavilion's jog: all flat.
DECK_LIFT = 0.003
_deck = [o for o in _head if o.name.startswith("roof__") and abs(wbbox(o)[0].z - (TOP_HEAD_GAME + UPPER_LIFT - TOP_DROP)) < 1e-3]
assert len(_deck) == 3, [o.name for o in _deck]
for o in _deck: o.matrix_world = Matrix.Translation(Vector((0.0, 0.0, DECK_LIFT))) @ o.matrix_world
for o in _head:
    if o.name.startswith("cornice__"):
        for q in o.data.polygons: q.use_smooth = False
print(f"the upper floor lifted {UPPER_LIFT:+.3f} for the capitals and the band between floors 4 and 5: {len(_up)} meshes, "
      f"from {CORNICE_UNDER:.3f} up, the head group of {len(_head)} {UPPER_LIFT - TOP_DROP:+.3f}; the fifth floor's windows' foot now at {_s5 + UPPER_LIFT:.3f}")
# The game's crown goes: the four courses built at the end of this file replace it (user 2026-09-19). It is taken down
# here, after the lift, so that BAND_Z_OUT and the `crowns` push-out, the head group's own assert and the deck lift all
# still see the eight objects they were written for. The roof deck stays -- it is the only thing closing the top -- and
# the new courses stand round it as the parapet; its own planes are brought in behind them with the crown.
_gone = [o for o in bpy.data.objects
         if o.name.startswith(("cornice__2636", "cornice_ornament__2637", "parapet_coping__2730", "mesh__2635"))]
assert len(_gone) == 4, sorted(o.name for o in _gone)
remove(_gone)
_tall = sorted(o.name for o in bpy.data.objects if o.type == 'MESH' and o.data.vertices and wbbox(o)[1].z > 19.11
               and not o.name.startswith("interior__"))     # the game's inner shells reach the old head; they are removed at the end
assert not _tall, f"something still stands over the wall head, where the crown is to be built: {_tall}"
print("the game's crown taken down (the cornice, its dentil course, the parapet band and its coping, 19.102..19.802): "
      "the roof deck is the top of the block until the four courses are built on it")
CAP_SRC = "pilaster_L_capital"
def capital_mesh():
    src = bpy.data.objects[CAP_SRC]; mw = src.matrix_world
    pts = [mw @ v.co for v in src.data.vertices]
    x0, x1 = min(q.x for q in pts), max(q.x for q in pts)
    y0, y1 = min(q.y for q in pts), max(q.y for q in pts)                 # the portal faces -y, so y0 is its front
    z0 = min(q.z for q in pts); z1 = max(q.z for q in pts); cx = (x0 + x1) / 2
    base = min(q.y for q in pts if q.z < z0 + 0.02) - y0                  # how far back the capital's own base sits
    me = src.data.copy(); me.name = "ge_capital"
    for v, q in zip(me.vertices, pts): v.co = Vector((q.x - cx, q.y - y0, q.z - z0))   # across, back from the front, up
    me.update()
    return me, (x1 - x0), (y1 - y0), (z1 - z0), base
CAP_BOT = max(wbbox(q)[1].z for q in window_panels)                       # where the window recesses end, the capitals' foot
_me, _w, _d, _h, _base = capital_mesh(); _k = (WALL24_TOP - CAP_BOT) / _h
_flare = (_w * _k - COL_W) / 2; _front = COL_OUT + _k * _base             # its base flush with the column, the rest proud of it
n_cap = 0
for fi in range(len(FACES)):
    A, d, nrm, L = FACES[fi]
    for a, b in column_spans(fi):
        o = bpy.data.objects.new("ge_capital", _me); FIT.objects.link(o)
        base = A + d * ((a + b) / 2) + nrm * _front
        o.matrix_world = Matrix(((d.x * _k, -nrm.x * _k, 0.0, base.x),
                                 (d.y * _k, -nrm.y * _k, 0.0, base.y),
                                 (0.0, 0.0, _k, CAP_BOT),
                                 (0.0, 0.0, 0.0, 1.0)))
        n_cap += 1
print(f"a capital on each of the {n_cap} brick columns: the portal's own, scaled {_k:.3f} to {CAP_BOT:.3f}..{WALL24_TOP:.3f} "
      f"({_w * _k:.3f} wide on a {COL_W:.2f} column, its base on the column's face at {COL_OUT:+.2f} and its front {_front:+.3f})")
# The band between floors 4 and 5 (user 2026-09-17, photos 1-3): one box per deep run of every face -- from a corner
# stretch's end to the centre pavilion, from the pavilion to the far corner -- standing on the capitals' top, B45_Z0 to
# B45_Z1 -- on the brackets' and capitals' tops, its foot behind the bottom moulding, which takes the first B45_STEPS_H of that (below) -- its back in the wall and
# its face at B45_FRONT, the window recess's depth behind the raised bays' plane, so
# it steps with them and not past them. Separate geometry from the wall (user), in the wall's own brick for now, its
# courses mapped like the wall's. The raised bays carry none: their wall runs on up behind it (build_upper_wall).
B45_MAT = wall_upper.data.materials[0] if wall_upper.data.materials else None
B45_COL_W = B45_FIELD_H * 4.0 / 3.0 / 4.0          # one medallion column: the 4:3 field is four columns wide
def band_panel(name, fi, a, b, back, front, z0, z1, mat):
    # the band run as a framed panel (user 2026-09-17): the ornament field sits inside a plain margin B45_MARGIN on all
    # four sides, exactly the same size at the ends as above and below. Along the run the field's UVs are scaled by the
    # nearest whole number of medallion columns over its length -- a stretch of under half a column in a hundred, which
    # the eye cannot see -- so no medallion is cut at the ends either and the margin stays B45_MARGIN. The front is
    # nine faces, the field (material slot 0, with UVs in metres from its own corner) and eight margin faces (slot 1),
    # and the box's other five faces are slot 1 too. The slots are filled once the materials exist, below.
    A, d, nrm = FACES[fi][0], FACES[fi][1], FACES[fi][2]; up = Vector((0.0, 0.0, 1.0))
    L = b - a; ms = B45_MARGIN; fw = L - 2 * ms; n_cols = max(1, round(fw / B45_COL_W)); k = n_cols * B45_COL_W / fw
    ss = [a, a + ms, b - ms, b]; zs = [z0, z0 + B45_MARGIN, z1 - B45_MARGIN, z1]
    def P(sv, dv, zv): return A + d * sv + nrm * dv + Vector((0.0, 0.0, zv))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    def quad(c, want, slot, uv=None):
        pts = [P(*q) for q in c]
        if (pts[1] - pts[0]).cross(pts[2] - pts[1]).dot(want) < 0: pts.reverse(); c = c[::-1]
        f = bm.faces.new([bm.verts.new(q) for q in pts]); f.material_index = slot; f.smooth = False
        for l, q in zip(f.loops, c): l[uvl].uv = uv(q) if uv else (0.0, 0.0)
    for i in range(3):
        for j in range(3):
            field = (i == 1 and j == 1)
            quad([(ss[i], front, zs[j]), (ss[i + 1], front, zs[j]), (ss[i + 1], front, zs[j + 1]), (ss[i], front, zs[j + 1])], nrm,
                 0 if field else 1, (lambda q: ((q[0] - ss[1]) * k, q[2] - zs[1])) if field else None)
    quad([(a, back, z0), (b, back, z0), (b, back, z1), (a, back, z1)], -nrm, 1)
    quad([(a, back, z1), (b, back, z1), (b, front, z1), (a, front, z1)], up, 1)
    quad([(a, back, z0), (b, back, z0), (b, front, z0), (a, front, z0)], -up, 1)
    quad([(a, back, z0), (a, front, z0), (a, front, z1), (a, back, z1)], -d, 1)
    quad([(b, back, z0), (b, front, z0), (b, front, z1), (b, back, z1)], d, 1)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat); me.materials.append(mat)
    o = bpy.data.objects.new(name, me); FIT.objects.link(o); o["band_cols"] = n_cols; o["band_side_margin"] = ms; o["band_stretch"] = k; return o
n_b45 = []
for fi in range(len(FACES)):
    outs = out_stretches(fi); F = rh_frame(fi); tag = PORTAL_TAG.get(fi, fi)
    for k in range(1, len(outs)):
        a, b = outs[k - 1][1], outs[k][0]
        if b - a < 0.05: continue
        o = band_panel(f"ge_band45_{tag}_{k}", fi, a, b, BRICK_OUT - WALL_T, B45_FRONT, B45_Z0 + B45_STEPS_H, B45_Z1, B45_MAT)
        n_b45.append(f"{tag}:{a:.2f}..{b:.2f}")
print(f"the band between floors 4 and 5: {len(n_b45)} runs {B45_Z0 + B45_STEPS_H:.3f}..{B45_Z1:.3f} at {B45_FRONT:+.2f} ({B45_STEP:.2f} behind the raised bays, "
      f"{B45_FRONT - BRICK_OUT:.2f} proud of the field), the field {B45_FIELD_H:.2f} tall in a {B45_MARGIN:.2f} margin: " + ", ".join(n_b45))
# The game's own Bradbury textures (user 2026-09-17): its `pbr.bradbury_wall_terracotta_brick_tileable` on every brick
# surface -- the export had drawn them all in the generic red brick -- and its `pbr.bradbury_top_band_terracotta_ornament`
# on the band. Each is a PBR material built here from the catalog's own files (base colour, OpenGL normal, and the
# packed AO / roughness / metal map, read as the game reads them) with paths relative to the .blend, tiled by the
# catalog's tileMeters on the metre-based UVs every brick surface already carries. The ornament is no repeat vertically
# -- the central field of medallions, four columns by three rows on a 4:3 patch, meant for clamped band placement --
# so it is mapped once over the band's field, B45_FIELD_H tall inside the band's margin, and repeats every 4/3 of that
# along it, which keeps the medallions round; the bricks tile at the catalog's BRICK_TILE_M both ways (1.26: the 1.4 m
# tile made the bricks 10% too big, user 2026-09-17). The catalog's height maps are not used, as the game does not use
# them. The brick is tiled in bands (user 2026-09-17, to fight the repeat): every row of tiles, one tile tall, is
# shifted along the wall by its own whole number of strips -- a hash of the row -- so the bond runs on unbroken (a
# strip is a quarter of the tile) but the tile's repeats no longer line up from one row to the next.
PBR_DIR = os.path.join(ROOT, "assets", "public", "pbr")
BRICK_TILE_M = 1.26                                # the brick set's tileMeters (kept in step with its pbr.material.config.js)
def pbr_material(name, folder, tile_u, tile_v, v0=0.0, clamp=False, band_shift=0):
    d = os.path.join(PBR_DIR, folder)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (300, 0); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0)
    mp.inputs["Scale"].default_value = (1.0 / tile_u, 1.0 / tile_v, 1.0); mp.inputs["Location"].default_value = (0.0, -v0 / tile_v, 0.0)
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"]); vec = mp.outputs["Vector"]
    if band_shift:
        # in tile units now: the row of tiles is floor(v); a white-noise hash of it picks 0..band_shift-1 strips, and that
        # many quarter tiles are added to u
        sp = nt.nodes.new('ShaderNodeSeparateXYZ'); sp.location = (-640, 200); nt.links.new(vec, sp.inputs["Vector"])
        fl = nt.nodes.new('ShaderNodeMath'); fl.operation = 'FLOOR'; fl.location = (-560, 320); nt.links.new(sp.outputs["Y"], fl.inputs[0])
        wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '1D'; wn.location = (-480, 320); nt.links.new(fl.outputs[0], wn.inputs["W"])
        m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; m1.inputs[1].default_value = float(band_shift); m1.location = (-400, 320)
        nt.links.new(wn.outputs["Value"], m1.inputs[0])
        f2 = nt.nodes.new('ShaderNodeMath'); f2.operation = 'FLOOR'; f2.location = (-320, 320); nt.links.new(m1.outputs[0], f2.inputs[0])
        m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.inputs[1].default_value = 1.0 / band_shift; m2.location = (-240, 320)
        nt.links.new(f2.outputs[0], m2.inputs[0])
        ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; ad.location = (-160, 260); nt.links.new(sp.outputs["X"], ad.inputs[0]); nt.links.new(m2.outputs[0], ad.inputs[1])
        cb = nt.nodes.new('ShaderNodeCombineXYZ'); cb.location = (-80, 200)
        nt.links.new(ad.outputs[0], cb.inputs["X"]); nt.links.new(sp.outputs["Y"], cb.inputs["Y"]); nt.links.new(sp.outputs["Z"], cb.inputs["Z"])
        vec = cb.outputs["Vector"]
    if clamp:
        # one field vertically, a repeat along the band: V is clamped to the image and U left to repeat (an image's own
        # extension mode clamps both axes at once, which smeared the ornament's edge column along the whole band)
        sp = nt.nodes.new('ShaderNodeSeparateXYZ'); sp.location = (-640, -220); nt.links.new(vec, sp.inputs["Vector"])
        cl = nt.nodes.new('ShaderNodeClamp'); cl.location = (-560, -220); nt.links.new(sp.outputs["Y"], cl.inputs["Value"])
        cb = nt.nodes.new('ShaderNodeCombineXYZ'); cb.location = (-480, -220)
        nt.links.new(sp.outputs["X"], cb.inputs["X"]); nt.links.new(cl.outputs["Result"], cb.inputs["Y"]); nt.links.new(sp.outputs["Z"], cb.inputs["Z"])
        vec = cb.outputs["Vector"]
    def tex(fn, cs, y):
        fp = os.path.join(d, fn); assert os.path.exists(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{folder}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs; im.filepath = bpy.path.relpath(fp)                   # relative to the .blend, like the game's other maps
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.location = (-450, y); t.extension = 'REPEAT'
        nt.links.new(vec, t.inputs["Vector"]); return t
    base = tex("basecolor.jpg", 'sRGB', 300); arm = tex("arm.png", 'Non-Color', 0); nrm = tex("normal_gl.png", 'Non-Color', -300)
    sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-150, 0); nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (50, 250)
    mix.inputs["Factor"].default_value = 1.0                                                   # the packed AO darkens the base colour
    nt.links.new(base.outputs["Color"], next(i for i in mix.inputs if i.identifier == "A_Color"))
    nt.links.new(sep.outputs["Red"], next(i for i in mix.inputs if i.identifier == "B_Color"))
    nt.links.new(next(o for o in mix.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (50, -300); nm.inputs["Strength"].default_value = 1.0
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m
def band_uvs(me, fi):
    # the band's own mapping: metres along its face and metres up, for the material's mapping to place the ornament on
    A, t, nrm = face_frame(fi); uv = me.uv_layers.active.data
    for pl in me.polygons:
        for li in pl.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co; uv[li].uv = ((Vector((q.x, q.y)) - A).dot(t), q.z)
BRICK_PBR = pbr_material("PBR_bradbury_wall_terracotta_brick_tileable", "bradbury_wall_terracotta_brick_tileable", BRICK_TILE_M, BRICK_TILE_M, band_shift=4)
BAND_PBR = pbr_material("PBR_bradbury_top_band_terracotta_ornament", "bradbury_top_band_terracotta_ornament", B45_FIELD_H * 4.0 / 3.0, B45_FIELD_H,
                        v0=0.0, clamp=True)                             # the field's UVs start at its own corner
old_brick = [m for m in bpy.data.materials if m.node_tree and any(n.type == 'TEX_IMAGE' and n.image and "red_brick" in n.image.filepath.replace("\\", "/")
                                                                 for n in m.node_tree.nodes)]
n_brick, done_me = 0, set()
for o in bpy.data.objects:
    if o.type != 'MESH' or o.data.name in done_me: continue
    done_me.add(o.data.name)
    for i, m in enumerate(o.data.materials):
        if m in old_brick: o.data.materials[i] = BRICK_PBR; n_brick += 1
n_band = 0
for o in [q for q in bpy.data.objects if q.name.startswith("ge_band45")]:
    o.data.materials[0] = BAND_PBR; n_band += 1                          # the field; the margins take the trim below
# The trim -- the band's two mouldings with their dentils and brackets, and every window sill -- in the band's own
# colour (user 2026-09-17): the band's own mean colour, measured in linear light from its file, as the base, with the
# normal and ORM maps of the game's `terracotta_smooth` set, the material the game's config already gives the sills,
# for the surface (its base colour is not used: nearly flat, it still carried soft patches that showed on the ledges
# once gained up). A slight tone variation goes over it the way terracotta varies: piece by piece, since the trim is
# made of blocks each fired a little differently -- a cell noise TRIM_CELL_M across gives every piece its own tone,
# TRIM_VAR_CELL either way -- with a fine grain over that (a metre-scale noise was tried first and read as blobs,
# user 2026-09-17). Its maps are box-projected on object coordinates, so the swept mouldings, which carry no UVs,
# take it as the sills do; and it is tiled every TRIM_TILE_M, closer than the catalog's 4 m, so its surface detail
# shows at a moulding's scale.
TRIM_TILE_M = 2.0
TRIM_CELL_M, TRIM_VAR_CELL = 0.7, 0.015           # the pieces, and their tone either way (0.04 still showed as patches, user)
TRIM_GRAIN_PER_M, TRIM_VAR_GRAIN = 40.0, 0.008     # the grain's frequency, and its tone either way
def linear_mean(im):
    # the mean of an sRGB image in linear light, from its own pixels (bpy hands them over as the raw bytes over 255)
    import numpy as _np
    a = _np.empty(im.size[0] * im.size[1] * 4, dtype=_np.float32); im.pixels.foreach_get(a); a = a.reshape(-1, 4)[:, :3].astype(_np.float64)
    return _np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4).mean(0)
def trim_material(name, folder, tile, target_linear, cell_var=None, grain_var=None):
    cell_var = TRIM_VAR_CELL if cell_var is None else cell_var; grain_var = TRIM_VAR_GRAIN if grain_var is None else grain_var
    d = os.path.join(PBR_DIR, folder)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (300, 0); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0); mp.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0 / tile)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    def tex(fn, cs, y):
        fp = os.path.join(d, fn); assert os.path.exists(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{folder}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs; im.filepath = bpy.path.relpath(fp)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.location = (-450, y); t.projection = 'BOX'; t.projection_blend = 0.25
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"]); return t, im
    # the colour is the band's own mean, flat: the set's base colour, nearly flat itself, still carried soft patches
    # that showed on the ledges once gained up (user 2026-09-17), so only its normal and ORM maps are used
    arm, _ = tex("arm.png", 'Non-Color', 0); nrm, _ = tex("normal_gl.png", 'Non-Color', -300)
    g = nt.nodes.new('ShaderNodeRGB'); g.location = (-450, 300)
    g.outputs[0].default_value = (float(target_linear[0]), float(target_linear[1]), float(target_linear[2]), 1.0)
    gain = target_linear
    # the tone variation, on the same object coordinates (in tile units here): one tone per piece from a cell noise, a
    # fine grain over it, each remapped to 1 -/+ its own spread and multiplied in
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.location = (-450, 700); vo.feature = 'F1'; vo.inputs["Scale"].default_value = tile / TRIM_CELL_M
    nt.links.new(mp.outputs["Vector"], vo.inputs["Vector"])
    vs = nt.nodes.new('ShaderNodeSeparateColor'); vs.location = (-300, 700); nt.links.new(vo.outputs["Color"], vs.inputs["Color"])
    r1 = nt.nodes.new('ShaderNodeMath'); r1.operation = 'MULTIPLY_ADD'; r1.location = (-150, 700)
    r1.inputs[1].default_value = 2.0 * cell_var; r1.inputs[2].default_value = 1.0 - cell_var; nt.links.new(vs.outputs["Red"], r1.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.location = (-450, 520); nz.inputs["Scale"].default_value = TRIM_GRAIN_PER_M * tile; nz.inputs["Detail"].default_value = 2.0
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    r2 = nt.nodes.new('ShaderNodeMath'); r2.operation = 'MULTIPLY_ADD'; r2.location = (-150, 520)
    r2.inputs[1].default_value = 2.0 * grain_var; r2.inputs[2].default_value = 1.0 - grain_var; nt.links.new(nz.outputs["Fac"], r2.inputs[0])
    both = nt.nodes.new('ShaderNodeMath'); both.operation = 'MULTIPLY'; both.location = (0, 600); nt.links.new(r1.outputs[0], both.inputs[0]); nt.links.new(r2.outputs[0], both.inputs[1])
    v = nt.nodes.new('ShaderNodeMix'); v.data_type = 'RGBA'; v.blend_type = 'MULTIPLY'; v.location = (-50, 450); v.inputs["Factor"].default_value = 1.0
    nt.links.new(g.outputs[0], next(i for i in v.inputs if i.identifier == "A_Color"))
    nt.links.new(both.outputs[0], next(i for i in v.inputs if i.identifier == "B_Color"))
    sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-150, 0); nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
    ao = nt.nodes.new('ShaderNodeMix'); ao.data_type = 'RGBA'; ao.blend_type = 'MULTIPLY'; ao.location = (50, 250); ao.inputs["Factor"].default_value = 1.0
    nt.links.new(next(o for o in v.outputs if o.identifier == "Result_Color"), next(i for i in ao.inputs if i.identifier == "A_Color"))
    nt.links.new(sep.outputs["Red"], next(i for i in ao.inputs if i.identifier == "B_Color"))
    nt.links.new(next(o for o in ao.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (50, -300); nm.inputs["Strength"].default_value = 1.0
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m, gain
_band_im = next(n.image for n in BAND_PBR.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image.colorspace_settings.name == 'sRGB')
TRIM_PBR, _trim_gain = trim_material("PBR_bradbury_terracotta_trim", "terracotta_smooth", TRIM_TILE_M, linear_mean(_band_im))
n_sill = 0
for o in [q for q in bpy.data.objects if q.type == 'MESH' and q.name.startswith("sill_")]:
    o.data.materials.clear(); o.data.materials.append(TRIM_PBR); n_sill += 1
n_capm = 0
for o in [q for q in bpy.data.objects if q.type == 'MESH' and q.name.startswith("ge_capital")]:   # the capitals too (user 2026-09-17)
    o.data.materials.clear(); o.data.materials.append(TRIM_PBR); n_capm += 1
for o in [q for q in bpy.data.objects if q.name.startswith("ge_band45")]:                         # the band's margins and its other faces
    o.data.materials[1] = TRIM_PBR
print("the band's margins: " + ", ".join(f"{o.name} {o['band_cols']} columns, side margins {o['band_side_margin']:.3f}, the columns stretched {(o['band_stretch'] - 1) * 100:+.2f}%" for o in bpy.data.objects if o.name.startswith("ge_band45")))
# A stone with a real surface (user 2026-09-18: "a pbr texture on the moulding and portal, so it behaves according to
# light"): the dressed-sandstone set made for this block (assets/public/pbr/bradbury_sandstone_dressed, from
# authoring/BradburyBlock/make_sandstone_pbr.py) box-projected on object coordinates -- its albedo, with its mottle,
# grain and specks, gained per channel onto the tone asked for; its roughness and occlusion from arm.png; its normal
# map as is -- where the flat colour over brownstone's maps read as paint.
STONE_SET, STONE_SET_TILE = "bradbury_sandstone_dressed", 2.0
def stone_material(name, target_linear):
    d = os.path.join(PBR_DIR, STONE_SET)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (300, 0); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0); mp.inputs["Scale"].default_value = (1.0 / STONE_SET_TILE,) * 3
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    def tex(fn, cs, y):
        fp = os.path.join(d, fn); assert os.path.exists(fp), fp
        im = bpy.data.images.load(fp, check_existing=True); im.name = f"pbr_{STONE_SET}_{os.path.splitext(fn)[0]}"
        im.colorspace_settings.name = cs; im.filepath = bpy.path.relpath(fp)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.location = (-450, y); t.projection = 'BOX'; t.projection_blend = 0.25
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"]); return t, im
    base, base_im = tex("basecolor.jpg", 'sRGB', 300); arm, _ = tex("arm.png", 'Non-Color', 0); nrm, _ = tex("normal_gl.png", 'Non-Color', -300)
    gain = target_linear / linear_mean(base_im)
    g = nt.nodes.new('ShaderNodeMix'); g.data_type = 'RGBA'; g.blend_type = 'MULTIPLY'; g.location = (-150, 300); g.inputs["Factor"].default_value = 1.0
    nt.links.new(base.outputs["Color"], next(i for i in g.inputs if i.identifier == "A_Color"))
    next(i for i in g.inputs if i.identifier == "B_Color").default_value = (float(gain[0]), float(gain[1]), float(gain[2]), 1.0)
    sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-150, 0); nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
    ao = nt.nodes.new('ShaderNodeMix'); ao.data_type = 'RGBA'; ao.blend_type = 'MULTIPLY'; ao.location = (50, 250); ao.inputs["Factor"].default_value = 1.0
    nt.links.new(next(o for o in g.outputs if o.identifier == "Result_Color"), next(i for i in ao.inputs if i.identifier == "A_Color"))
    nt.links.new(sep.outputs["Red"], next(i for i in ao.inputs if i.identifier == "B_Color"))
    nt.links.new(next(o for o in ao.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (50, -300); nm.inputs["Strength"].default_value = 1.0
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m.diffuse_color = (float(target_linear[0]), float(target_linear[1]), float(target_linear[2]), 1.0)
    return m, gain
# The ground floor's stone (user 2026-09-17, a photo of the corner; 2026-09-18, a photo of the portal): the moulding
# under the brick -- the entablature, the band strip, the zone above it with its blocks, the crown, the band tops over
# the portals -- is a smooth sandstone in the reference, pale, a little pinker and brighter than the brick, and the
# portal's stone is the same; the storefront piers are a darker red-brown. A first cut (2026-09-17) put the whole
# ground floor in one dark red-brown, which the user found too dark against the brick. So two flat colours now, each
# set against the brick's own sRGB mean per channel: STONE_RATIO lifts the moulding above the brick and toward it,
# PIER_RATIO keeps the piers red-brown but a fifth lighter than that first cut (the pillars are the pier ring alone;
# the six fit_pier_* boxes are the zone's blocks beside the pilasters, at the zone's height, and so moulding). Both take the game's `brownstone`
# surface, the smoothest stone in the catalog (its base colour is not used), as a flat base with a whisper of
# per-block and grain variation. The linked portal's own sandstone is retuned to the moulding's tone in portal_lib.
# The tones (user 2026-09-18, two more photos): the moulding and the portal are the same stone, a little darker than
# the brick and redder, not a paler beige; the piers are the same stone again, only fresher, so a touch lighter and no
# stronger in colour than the rest. A second cut had the moulding paler than the brick (1.08, 1.22, 1.36) and the
# piers a strong dark red (0.77, 0.72, 0.89), which read as two different materials.
# The order (user 2026-09-18, once more): the moulding and the portal stand above the piers in brightness, not below
# them, all three still under the brick -- a third cut had them the other way round.
STONE_RATIO = (1.005, 0.965, 1.04)                 # the moulding: sRGB about (178, 111, 86) from the brick's (177, 115, 83), the brick's own tone a hair redder, 2% under it
PIER_RATIO = (0.94, 0.835, 0.94)                   # the piers: about (166, 96, 78), the same stone a tenth darker than the moulding
def srgb_to_linear(c): return _np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
import numpy as _np
_brick_im = next(n.image for n in BRICK_PBR.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image.colorspace_settings.name == 'sRGB')
_a = _np.empty(_brick_im.size[0] * _brick_im.size[1] * 4, dtype=_np.float32); _brick_im.pixels.foreach_get(_a)
_brick_srgb = _a.reshape(-1, 4)[:, :3].astype(_np.float64).mean(0)
STONE_PBR, _ = stone_material("PBR_bradbury_ground_stone", srgb_to_linear(_brick_srgb * _np.array(STONE_RATIO)))
PIER_PBR, _ = stone_material("PBR_bradbury_pier_stone", srgb_to_linear(_brick_srgb * _np.array(PIER_RATIO)))
n_gs = n_gp = 0
for o in list(GCOLL.objects) + [f for f in FIT.objects if f.name.startswith(("fit_band_top", "fit_inset", "fit_bar", "fit_cap_", "fit_zone_", "fit_pier_"))]:   # fit_pier_*: the zone's blocks beside the pilasters, in the moulding
    if o.type != 'MESH': continue
    o.data.materials.clear(); o.data.materials.append(STONE_PBR); n_gs += 1
for o in [f for f in FIT.objects if f.type == 'MESH' and f.name == "fit_piers"]:                          # the pier ring alone is the pillars
    o.data.materials.clear(); o.data.materials.append(PIER_PBR); n_gp += 1
def _srgb(ratio): return tuple(int(round(v * 255)) for v in _brick_srgb * _np.array(ratio))
print(f"the ground floor's stone: the moulding sRGB about {_srgb(STONE_RATIO)} on {n_gs} meshes (the entablature, the strip, the zone and its blocks, the crown, the band tops), "
      f"the piers about {_srgb(PIER_RATIO)} on {n_gp}; the brick's {tuple(int(round(v * 255)) for v in _brick_srgb)}, the {STONE_SET} set's surface on both, tiled every {STONE_SET_TILE} m")
print(f"the trim terracotta: the band's mean colour ({_trim_gain[0]:.3f}, {_trim_gain[1]:.3f}, {_trim_gain[2]:.3f} linear) with terracotta_smooth's normal and ORM, "
      f"a tone per {TRIM_CELL_M} m piece (+-{TRIM_VAR_CELL:.1%}) and a grain (+-{TRIM_VAR_GRAIN:.1%}), box-projected every {TRIM_TILE_M} m; "
      f"on {n_sill} sills and {n_capm} capitals now, and on the band's mouldings, dentils and brackets below")
print(f"the game's Bradbury textures: the terracotta brick on {n_brick} meshes in place of {len(old_brick)} red-brick materials "
      f"({', '.join(sorted(m.name for m in old_brick))}), tiled every {BRICK_TILE_M} m in rows shifted by whole strips; the ornament on {n_band} band runs, "
      f"{B45_H:.2f} tall from {B45_Z0 + B45_STEPS_H:.3f}, repeating every {B45_H * 4 / 3:.3f} m")
# The entablature used to take the portal's own stone here (the frieze band's material, no ashlar joint lines) once the
# link had brought it in. That handed the pink back to everything the ground floor's stone had just been put on, which
# is why builds v64 and v65 still rendered the entablature pink (found 2026-09-18): the ground floor keeps
# PBR_bradbury_ground_stone, and only the linked portal itself is in its own stone.
# The wall's hidden faces in flat colours (user 2026-09-18): the wall of floors 2 to 4 is a solid ring, and from inside
# its thickness its inner skin looked just like its outer one. So the faces that never show from outside carry solid
# colours near the brick's own tone, each kind its own, to be told apart at a glance in the viewport: the ring's
# inner skin a shade darker, the ring's top and bottom (under the band and inside the crown) a shade lighter, and the
# window panels' backs and box sides, which sit between the two skins, a shade pinker. Everything that shows -- the
# outer skin, the insets, every reveal and jamb, the panels' fronts -- keeps the brick. The colour is set on the
# node tree and on the material's viewport colour, so the solid viewport shows it as well as a render.
def flat_material(name, srgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    lin = tuple(float(v) for v in srgb_to_linear(_np.array(srgb, dtype=float) / 255.0)) + (1.0,)
    bsdf = m.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Base Color"].default_value = lin; bsdf.inputs["Roughness"].default_value = 0.9
    m.diffuse_color = lin
    return m
HIDE_INNER = flat_material("WALL_inner_skin", (152, 100, 76))      # the brick's mean is about (177, 115, 83)
HIDE_TOPBOT = flat_material("WALL_top_bottom", (196, 132, 98))
HIDE_PANEL = flat_material("WALL_panel_hidden", (172, 116, 104))
def hide_faces(o, pick):
    # pick(centre, normal), both in world space, names the material a face takes, or None to leave it
    me = o.data; names = [q.name if q else None for q in me.materials]
    for m in (HIDE_INNER, HIDE_TOPBOT, HIDE_PANEL):
        if m.name not in names: me.materials.append(m); names.append(m.name)
    R = o.matrix_world.to_3x3(); n = 0
    for pl in me.polygons:
        k = pick(o.matrix_world @ pl.center, (R @ pl.normal).normalized())
        if k: pl.material_index = names.index(k); n += 1
    return n
def wall_pick(c, nrm):
    if abs(nrm.z) > 0.9:
        return HIDE_TOPBOT.name if (abs(c.z - WALL24_TOP) < 0.002 or abs(c.z - FLOOR2_BOTTOM) < 0.002) else None
    fi = on_face(c); sv, dv = face_sd(fi, c)
    return HIDE_INNER.name if (dv < BRICK_OUT - WALL_T + 0.02 and nrm.dot(FACES[fi][2]) < -0.5) else None
n_hide_wall = hide_faces(wall_upper, wall_pick)
def panel_pick(o, recess=RECESS_D):
    # recess: how deep a reveal on the panel's rim may be before a rim face counts as a box side (the top floor's
    # panels have no reveal on their rim at all, their openings lie inside it)
    cs = [o.matrix_world @ Vector(q) for q in o.bound_box]; fi = on_face(sum(cs, Vector()) / 8); nf = FACES[fi][2]
    ss = [face_sd(fi, q)[0] for q in cs]; ds = [face_sd(fi, q)[1] for q in cs]; zs = [q.z for q in cs]
    s0, s1, z0, z1, dback, dfront = min(ss), max(ss), min(zs), max(zs), min(ds), max(ds)
    def pick(c, nrm):
        sv, dv = face_sd(fi, c)
        if nrm.dot(nf) < -0.5 and dv < dback + 0.02: return HIDE_PANEL.name                              # the back, on the inner skin's plane
        on_rim = min(abs(sv - s0), abs(sv - s1), abs(c.z - z0), abs(c.z - z1)) < 0.002
        if on_rim and abs(nrm.dot(nf)) < 0.5 and dv < dfront - recess - 0.001: return HIDE_PANEL.name  # a box side between the skins, not a reveal
        return None
    return pick
n_hide_panel = sum(hide_faces(o, panel_pick(o)) for o in window_panels)
top_panels = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("top_panel")]
n_hide_top = sum(hide_faces(o, panel_pick(o, 0.0)) for o in top_panels)   # the top floor's rebuilt panels: their backs and box sides too (2026-09-18)
print(f"the wall's hidden faces coloured: {n_hide_wall} on the wall (inner skin, top and bottom), {n_hide_panel} on the {len(window_panels)} window panels (backs and box sides), {n_hide_top} on the {len(top_panels)} top-floor panels")
# The brackets under the band (user 2026-09-17, photos 4 and 5; "dentils"): consoles hanging from the band's soffit
# between the brick columns only -- nine over a three-window bay, six over a two-window bay, three over a single --
# spaced evenly across the bay from column face to column face; none over the raised bays, which carry no band. Each
# is a block flush with the band's face: a small rectangular head, BRK_HEAD tall (user 2026-09-17: a few centimetres, not
# half the bracket), then a hollow taper back and down to a foot that still stands BRK_FOOT out, a little narrower at its
# foot than at its head, in the capitals' stone. Its top is on the moulding's foot at B45_Z0, wholly under it (a thin
# plate between the two was tried and taken out again, user). One mesh per bay, so a bay's row can be picked up as one.
BRK_H, BRK_W_TOP, BRK_W_BOT, BRK_IN = 0.34, 0.14, 0.10, 0.15
BRK_HEAD, BRK_FOOT, BRK_HOLLOW = 0.04, 0.05, 0.6   # the head's height, the foot's projection, how far the taper hollows toward the wall
BRK_N = {3: 9, 2: 6, 1: 3}                         # brackets per bay, by the windows the bay carries (user: 9 and 6)
def add_bracket(bm, sc):
    # one bracket in the face's right-handed frame (x = -s, y outward from the hull, z up from its own foot), centred on sc
    F = B45_FRONT - BRICK_OUT; H = BRK_H; zA = H - BRK_HEAD
    A = Vector((F, zA)); B = Vector((BRK_FOOT, 0.0)); M = (A + B) / 2
    C = M + (Vector((BRK_FOOT, zA)) - M) * BRK_HOLLOW                          # control point toward the wall-top corner: hollow
    prof = [(-BRK_IN, H), (F, H), (F, zA)]                                     # back, the top, down the head's face
    for i in range(1, 8):                                                       # then the taper, a hollow curve from the head's
        t = i / 8; Q = (1 - t) ** 2 * A + 2 * (1 - t) * t * C + t * t * B      # foot to the bracket's foot
        prof.append((Q.x, Q.y))
    prof += [(BRK_FOOT, 0.0), (0.0, 0.0), (-BRK_IN, 0.0)]
    def w(z): return (BRK_W_BOT + (BRK_W_TOP - BRK_W_BOT) * z / H) / 2
    L = [bm.verts.new((-sc - w(z), BRICK_OUT + y, z)) for y, z in prof]
    R = [bm.verts.new((-sc + w(z), BRICK_OUT + y, z)) for y, z in prof]
    n = len(prof)
    for i in range(n): bm.faces.new((L[i], L[(i + 1) % n], R[(i + 1) % n], R[i]))
    bm.faces.new(L[::-1]); bm.faces.new(R)                                       # the sides are planar: the taper is linear in z
BRK_MAT = TRIM_PBR                                 # the band's own terracotta (user 2026-09-17); the capitals keep the portal's stone
n_brk, brk_bays = 0, []
for fi in range(len(FACES)):
    outs = out_stretches(fi); cols = column_spans(fi); tag = PORTAL_TAG.get(fi, fi)
    for k in range(1, len(outs)):
        a, b = outs[k - 1][1], outs[k][0]
        if b - a < 0.05: continue
        edges = [a] + [x for c0, c1 in cols if c0 > a - 1e-6 and c1 < b + 1e-6 for x in (c0, c1)] + [b]
        for j, (s0, s1) in enumerate(zip(edges[::2], edges[1::2])):
            n = BRK_N.get(n_windows(fi, s0, s1, 12.3, 15.25), 0)
            if not n: continue
            bm = bmesh.new(); pitch = (s1 - s0) / n
            for i in range(n): add_bracket(bm, s0 + pitch * (i + 0.5))
            o = mesh_from_bm(f"ge_bracket45_{tag}_{k}_{j}", bm, BRK_MAT, FIT, smooth=True)
            o.matrix_world = rh_frame(fi) @ Matrix.Translation((0.0, 0.0, B45_Z0 - BRK_H))
            if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
            n_brk += n; brk_bays.append(f"{tag}:{s0:.2f}..{s1:.2f}x{n}")
print(f"the brackets under the band: {n_brk} in {len(brk_bays)} bays, {BRK_H:.2f} tall from {B45_Z0:.3f} down with a {BRK_HEAD:.2f} head, "
      f"{BRK_W_TOP:.2f}/{BRK_W_BOT:.2f} wide, flush with the band at {B45_FRONT:+.2f}: " + ", ".join(brk_bays))
# The cornices at the band's foot and head (user 2026-09-17, photos 6 and 7). Both go right round the building, over the
# raised bays as well, and follow the silhouette: the loop they are swept on is the wall's own outline at their height,
# stepping out over every raised stretch (`silhouette_jogs`), so neither is interrupted where the band ends.
#   The bottom moulding (user 2026-09-17, second round, photos of the bracket course and a corner), from bottom to
# top: a taller band C45_BAND_H, only C45_BAND 0.5 cm proud of the wall it is on; a step; a smaller step; an edge ring
# with its corners rounded like the other mouldings' (`ge_cornice45_bottom`). It runs on the band's outline -- the
# band's face on the deep bays, where the band itself is the extrusion and the brackets hang under it, and the raised
# bays' wall, 0.06 apart -- so on a pavilion it is a plain band with a small ledge over it and
# on a deep bay the same members stand on the band's foot, the ornament carried above them.
#   The top cornice, on the band's top (`ge_cornice45_top`): a course of dentils on a backing plate 0.5 cm proud of
# the band (`ge_teeth45`, boxes at one pitch along every run, a small margin at every break and corner, as the ground
# floor's teeth are laid), a very small step over them, a convex curve, and a square edge; 0.26 in all, the fifth
# floor's windows standing on its very top.
#   Both are ONE mitred sweep each round the band's outline (user 2026-09-17, third round): at every break the
# profile turns the corner with the wall, twice, a double L in plan, and is never two pieces meeting at the wall's
# edge. (A first cut built them as capped pieces per run, out of respect for the crown's fold at the edge capitals;
# but that fold comes from a segment shorter than the mitre reaches of the two corners bounding it -- the 0.80
# capital against a 0.44 back, so the two convex corners' back points cross and the soffit quad between them turns
# inside out -- and not from a break shallower than the projection. A break's 0.06 return is bounded by a concave and
# a convex corner, whose mitres shift the same way and never cross; the raised runs and the deep runs between them
# are metres long. The probes confirm it: no first-hit backface at any height through either moulding.)
C45_IN = 0.30                                      # how far the sweeps reach back into the wall behind them
C45_BAND, C45_BAND_H = 0.005, 0.10                 # the moulding's taller band: proud of the wall by this, and this tall
C45_STEP1_OUT, C45_STEP1_H = 0.03, 0.03            # the step over it
C45_STEP2_OUT, C45_STEP2_H = 0.045, 0.02           # the smaller step
C45_EDGE_OUT, C45_EDGE_H = 0.06, 0.03              # the edge ring on top, its outer corners rounded E_EDGE_R like the ground cornice's
assert abs(C45_BAND_H + C45_STEP1_H + C45_STEP2_H + C45_EDGE_H - B45_STEPS_H) < 1e-9, "the moulding must fill B45_STEPS_H"
T45_TOOTH_W, T45_TOOTH_GAP, T45_TOOTH_H, T45_TOOTH_FACE = 0.07, 0.05, 0.08, 0.05
T45_BACK = 0.005                                   # the dentils' backing plate, proud of the band
T45_STEP_OUT, T45_STEP_H = 0.06, 0.02              # the very small step over the dentils: a centimetre past their faces
T45_OVOLO_OUT, T45_OVOLO_H, T45_OVOLO_BULGE = 0.08, 0.12, 0.035   # the convex curve (a gentle arc like the ground cornice's)
T45_EDGE_OUT, T45_EDGE_H = 0.02, 0.04              # the edge on top
T45_H = T45_TOOTH_H + T45_STEP_H + T45_OVOLO_H + T45_EDGE_H       # 0.26
assert abs(T45_H - B45_TOPC_H) < 1e-9, "the top cornice must fill the room under the fifth floor's windows exactly: they stand on its top"
C45_MAT = TRIM_PBR                                 # the band's own terracotta (user 2026-09-17), not the portal's stone
def silhouette_jogs(off):
    # every raised stretch of every face as a jog `off` out: a corner stretch opens at the face's start or closes at its
    # end, which is what makes `loop` mitre that corner at the offset
    J = {}
    for fi in range(len(FACES)):
        L = FACES[fi][3]
        for a, b in out_stretches(fi):
            j = ([(a, 0.0)] if a > 1e-6 else []) + [(max(a, 0.0), off), (min(b, L), off)] + ([(b, 0.0)] if b < L - 1e-6 else [])
            J.setdefault(fi, []).append(j)
    return J
def moulding45_profile():
    # closed (outward o from the loop, z up from the brackets' tops): the taller band, the step, the smaller step, the edge
    # ring with a small round on its outer corners, bottom and top, then back into the wall
    ha = C45_BAND_H; z1 = ha + C45_STEP1_H; z2 = z1 + C45_STEP2_H; z3 = z2 + C45_EDGE_H; e = C45_EDGE_OUT; r = E_EDGE_R
    P = [(-C45_IN, 0.0), (C45_BAND, 0.0), (C45_BAND, ha), (C45_STEP1_OUT, ha), (C45_STEP1_OUT, z1),
         (C45_STEP2_OUT, z1), (C45_STEP2_OUT, z2), (e - r, z2)]
    for i in range(1, 3):
        t = -math.pi / 2 + (math.pi / 2) * i / 3; P.append((e - r + r * math.cos(t), z2 + r + r * math.sin(t)))
    P += [(e, z2 + r), (e, z3 - r)]
    for i in range(1, 3):
        t = (math.pi / 2) * i / 3; P.append((e - r + r * math.cos(t), z3 - r + r * math.sin(t)))
    P += [(e - r, z3), (-C45_IN, z3)]
    return P
def top45_profile():
    zt = T45_TOOTH_H; P = [(-C45_IN, 0.0), (T45_BACK, 0.0), (T45_BACK, zt), (T45_STEP_OUT, zt), (T45_STEP_OUT, zt + T45_STEP_H)]
    A = Vector((T45_STEP_OUT, zt + T45_STEP_H)); B = Vector((T45_STEP_OUT + T45_OVOLO_OUT, zt + T45_STEP_H + T45_OVOLO_H))
    ch = B - A; C = (A + B) / 2 + Vector((ch.y, -ch.x)).normalized() * T45_OVOLO_BULGE          # control point outward and down: convex
    for i in range(1, 7):
        t = i / 6; Q = (1 - t) ** 2 * A + 2 * (1 - t) * t * C + t * t * B; P.append((Q.x, Q.y))
    P += [(B.x + T45_EDGE_OUT, B.y), (B.x + T45_EDGE_OUT, B.y + T45_EDGE_H), (-C45_IN, B.y + T45_EDGE_H)]
    return P
band45_path = loop(silhouette_jogs(COL_OUT - B45_FRONT), B45_FRONT)    # the band's outline: its face, and the raised bays' wall
bm = bmesh.new(); sweep(bm, band45_path, moulding45_profile(), B45_Z0); o = mesh_from_bm("ge_cornice45_bottom", bm, C45_MAT, FIT, smooth=True)
if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
bm = bmesh.new(); sweep(bm, band45_path, top45_profile(), B45_Z1); o = mesh_from_bm("ge_cornice45_top", bm, C45_MAT, FIT, smooth=True)
if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
# the dentils: along every run of the band's outline -- the deep runs at the band's face, the raised runs at the wall's,
# the corner ones out to the mitre -- at one pitch, a small margin at each end, 2 mm into the band below and the step above
pitch45 = T45_TOOTH_W + T45_TOOTH_GAP; n_teeth = 0
bm = bmesh.new()
for fi in range(len(FACES)):
    A, d, nrm, L = FACES[fi]; outs = out_stretches(fi); runs = []
    for k, (a, b) in enumerate(outs):
        if k and a - outs[k - 1][1] > 1e-6: runs.append((outs[k - 1][1], a, B45_FRONT))
        runs.append((a, b, COL_OUT))
    for a, b, off in runs:
        x0 = 0.03; span = b - a - 2 * x0 - T45_TOOTH_W
        if span < 0: continue
        cnt = int(span // pitch45) + 1; step = span / (cnt - 1) if cnt > 1 else 0.0
        M = Matrix((Vector((-d.x, -d.y, 0.0)), Vector((nrm.x, nrm.y, 0.0)), Vector((0.0, 0.0, 1.0)))).transposed().to_4x4()   # right-handed, x = -s
        for k in range(cnt):
            x = a + x0 + k * step
            r = bmesh.ops.create_cube(bm, size=1.0); n_teeth += 1
            c = A + d * (x + T45_TOOTH_W / 2) + nrm * (off + (T45_TOOTH_FACE - 0.01) / 2)
            M.translation = Vector((c.x, c.y, B45_Z1 + T45_TOOTH_H / 2))
            bmesh.ops.transform(bm, matrix=M @ Matrix.Diagonal((T45_TOOTH_W, T45_TOOTH_FACE + 0.01, T45_TOOTH_H + 0.004, 1)), verts=r["verts"])
mesh_from_bm("ge_teeth45", bm, TRIM_PBR, FIT)
print(f"the cornices of the band between floors 4 and 5: the bottom moulding {B45_Z0:.3f}..{B45_Z0 + B45_STEPS_H:.3f} "
      f"and the top cornice {B45_Z1:.3f}..{B45_Z1 + T45_H:.3f}, both on the band's outline, "
      f"one mitred sweep each round {len(band45_path)} points; {n_teeth} dentils at pitch {pitch45:.2f}")
# The top floor's impost course (user 2026-09-18, the top windows' points 3 and 6; photos 011973, 011982, Highsmith):
# a moulding hanging under the springing with its top edge on it, running along every wall and round the corner
# piers, stopping at each window and returning into its reveal, and missing on the narrow piers between grouped
# arches, which carry a foliate capital as tall as it with its top on the same line. One moulding, IMP_H tall with its
# top on the springing, is swept along the wall's own outline at that height -- the field at BRICK_OUT, the corner and
# centre pavilions at COL_OUT, the corners and the pavilions' jogs mitred like the band's cornices below -- and cut at
# every set's masonry span, first jamb to last, so the narrow piers inside a set carry none; each piece returns
# IMP_RET into the two outer jamb reveals it stops at, toward the frame, and is capped there. Its profile, bottom up
# (user): a very small square edge, a face straight up, another small edge, the tall face straight up, an edge rising
# on a convex bevel and the top edge ring, the back IMP_IN inside the wall. The narrow piers get the portal's own
# capital (ge_capital, as the brick columns have), its neck as wide as the pier, CAP5_H tall with its top on the
# springing, its abacus proud of the pier, its back kept inside the panel. The game's course of blocks
# (bay_arcade_impost*, taken down with the sets) is not laid again.
IMP_IN = 0.04                                      # how far the moulding's back sits in the wall
IMP_LISTEL_OUT, IMP_LISTEL_H = 0.020, 0.012        # the very small square edge at its foot
IMP_FACE1_OUT, IMP_FACE1_H = 0.010, 0.050          # the face straight up over it, a centimetre proud
IMP_EDGE2_OUT, IMP_EDGE2_H = 0.035, 0.015          # the second small edge
IMP_FACE2_OUT, IMP_FACE2_H = 0.025, 0.140          # the tall face straight up
IMP_OVOLO_OUT, IMP_OVOLO_H = 0.060, 0.055          # the edge rising on a convex bevel: a quarter ellipse out from the tall face's top, up to vertical
IMP_RING_OUT, IMP_RING_H = 0.100, 0.048            # the top edge ring, its two front corners rounded IMP_EDGE_R
IMP_EDGE_R = 0.004
IMP_H = IMP_LISTEL_H + IMP_FACE1_H + IMP_EDGE2_H + IMP_FACE2_H + IMP_OVOLO_H + IMP_RING_H   # 0.320: 0.30 W (the photos read 0.28..0.37 W)
IMP_RET = REVEAL_D - 0.01                          # the return along each outer jamb's reveal: to a centimetre before the frame
CAP5_H = IMP_H                                     # the narrow piers' capitals are as tall as the moulding (photo)
CAP5_SINK = 0.005                                  # the neck stands this much inside the pier's face: no face of it within a millimetre of the brick (review 2026-09-19)
IMP_Z0 = TOP_SPRING + UPPER_LIFT - IMP_H           # the moulding's foot, world: 17.732, up to the springing 18.052
assert IMP_FACE2_OUT + IMP_OVOLO_OUT < IMP_RING_OUT and IMP_RING_OUT < IMP_RET < REVEAL_D, "the ring must overhang the bevel, the return be longer than the ring's projection and stop short of the frame"
def impost_profile():
    # closed (o outward from the wall plane, z up from the moulding's foot), bottom to top, the back closing it
    z1 = IMP_LISTEL_H; z2 = z1 + IMP_FACE1_H; z3 = z2 + IMP_EDGE2_H; z4 = z3 + IMP_FACE2_H; z5 = z4 + IMP_OVOLO_H
    P = [(-IMP_IN, 0.0), (IMP_LISTEL_OUT, 0.0), (IMP_LISTEL_OUT, z1), (IMP_FACE1_OUT, z1), (IMP_FACE1_OUT, z2),
         (IMP_EDGE2_OUT, z2), (IMP_EDGE2_OUT, z3), (IMP_FACE2_OUT, z3), (IMP_FACE2_OUT, z4)]
    for i in range(1, 7):                          # the bevel: out from the tall face's top and curving up to vertical, convex
        t = math.radians(15.0 * i); P.append((IMP_FACE2_OUT + IMP_OVOLO_OUT * math.sin(t), z5 - IMP_OVOLO_H * math.cos(t)))
    ring = [Vector((IMP_RING_OUT, z5)), Vector((IMP_RING_OUT, IMP_H))]
    P += [(q.x, q.y) for q in round_corner(Vector(P[-1]), ring[0], ring[1], IMP_EDGE_R)]
    P += [(q.x, q.y) for q in round_corner(ring[0], ring[1], Vector((-IMP_IN, IMP_H)), IMP_EDGE_R)]
    P.append((-IMP_IN, IMP_H))
    return P
def top_windows_from_frames():
    # the top floor's sets as the frames standing in the panels give them -- the boxes 0.05..0.12 deep and over 1.5
    # tall, the game's or the rebuilt ones -- per panel: (face, panel, its plane, [(centre along the face, width) ...])
    out = []; z_lo, z_hi = TOP_Z[0] + UPPER_LIFT, TOP_Z[1] + UPPER_LIFT
    for o in sorted((q for q in bpy.data.objects if q.type == 'MESH' and q.name.startswith("top_panel")), key=lambda q: q.name):
        fi = face_of(o); r0, r1 = s_extent(o, fi); pl = max(face_sd(fi, o.matrix_world @ v.co)[1] for v in o.data.vertices); ws = []
        for q in parts_between(fi, r0, r1, z_lo, z_hi, ("mesh__",)):
            a, b = wbbox(q); ds = [face_sd(fi, q.matrix_world @ Vector(c))[1] for c in q.bound_box]
            if b.z - a.z < 1.5 or not (0.05 < max(ds) - min(ds) < 0.12): continue
            s0, s1 = s_extent(q, fi)
            if r0 - 1e-3 < s0 and s1 < r1 + 1e-3: ws.append(((s0 + s1) / 2, s1 - s0))
        assert ws, f"{o.name}: no window frame stands in the panel"
        out.append((fi, o.name, pl, sorted(ws)))
    return out
imp_sets = TOP_WINDOWS                             # the sets as block R rebuilt them
_fs = {n: (fi, pl, ws) for fi, n, pl, ws in top_windows_from_frames()}   # and as the frames now standing in the panels give them: the same sets (a frame may be buried 5 mm in its reveal)
for fi, n, pl, ws in imp_sets:
    assert n in _fs and _fs[n][0] == fi and abs(_fs[n][1] - pl) < 2e-3 and len(_fs[n][2]) == len(ws) and all(abs(a[0] - b[0]) < 5e-3 and abs(a[1] - b[1]) < 0.015 for a, b in zip(ws, _fs[n][2])), f"{n}: TOP_WINDOWS and the frames in the panel disagree"
assert len(imp_sets) == len(_fs), "TOP_WINDOWS misses a panel"
imp_spans = {}                                     # face -> [(s0, s1, plane)]: every set's masonry span, first jamb to last
for fi, pname, pl, ws in imp_sets: imp_spans.setdefault(fi, []).append((ws[0][0] - ws[0][1] / 2, ws[-1][0] + ws[-1][1] / 2, pl))
def impost_pieces(path, spans):
    # the closed loop cut at every span into open pieces with their returns. Walking it clockwise, s falls along every
    # face: a span on an along-face run is left at its lower edge, where a piece starts by coming out of that reveal
    # (travelling outward, so its left -- the profile's outward -- looks into the opening), and the next span is met
    # at its upper edge, where the piece turns into that reveal and stops IMP_RET in. The vertex the loop only passes
    # straight through (its closure) goes first, so no span has to keep clear of it; a span across a jog, a corner or
    # a face's end is refused, since a return would have nowhere to go there.
    pts = [Vector((x, y, 0.0)) for x, y in path[:-1]]; n = len(pts)
    def turns(i):
        u = (pts[i] - pts[i - 1]).normalized(); v = (pts[(i + 1) % n] - pts[i]).normalized(); return abs(u.cross(v).z) > 1e-9 or u.dot(v) < 0
    pts = [q for i, q in enumerate(pts) if turns(i)]; n = len(pts); walk = []
    for i, a in enumerate(pts):
        b = pts[(i + 1) % n]; fi = on_face((a + b) / 2); (sa, oa), (sb, ob) = face_sd(fi, a), face_sd(fi, b)
        walk.append(('pt', (a.x, a.y)))
        if abs(oa - ob) > 1e-6: continue           # a jog's leg, across the face
        assert sa > sb, "the loop must run clockwise, s falling along every face"
        for s0, s1, pl in sorted(spans.get(fi, []), reverse=True):
            if s1 <= sb + 1e-6 or s0 >= sa - 1e-6: continue
            assert sb + 1e-6 < s0 and s1 < sa - 1e-6, f"face {fi}: the set at {s0:.2f}..{s1:.2f} crosses a jog or a corner of the wall's outline"
            assert abs(pl - oa) < 2e-3, f"face {fi}: the set at {s0:.2f}..{s1:.2f} stands at {pl:+.3f}, the wall's outline there at {oa:+.3f}"
            walk.append(('cut', fi, s0, s1, oa))
    assert any(w[0] == 'cut' for w in walk), "no window set on the loop"
    k = next(i for i, w in enumerate(walk) if w[0] == 'cut'); walk = walk[k + 1:] + walk[:k + 1]   # start right after a cut and end on it
    pieces = []; cur = None; last = walk[-1]
    for w in walk:
        if cur is None: fi, s0, s1, off = last[1:]; cur = [P_on(fi, s0, off - IMP_RET), P_on(fi, s0, off)]
        if w[0] == 'pt': cur.append(w[1]); continue
        fi, s0, s1, off = w[1:]; cur += [P_on(fi, s1, off), P_on(fi, s1, off - IMP_RET)]; pieces.append(cur); cur = None; last = w
    return pieces
imp_path = loop(silhouette_jogs(COL_OUT - BRICK_OUT), BRICK_OUT)   # the wall's own outline at the springing: the field, the pavilions with their jogs, the corners
imp_pieces = impost_pieces(imp_path, imp_spans)
bm = bmesh.new(); imp_prof = impost_profile()
for piece in imp_pieces: sweep(bm, piece, imp_prof, IMP_Z0, caps=True)
o = mesh_from_bm("impost_course5", bm, TRIM_PBR, FIT, smooth=True)
if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
cap_me = bpy.data.meshes["ge_capital"]             # the brick columns' capital: x across, y from the abacus's front into the wall, z up from its foot
cap_foot = [v.co for v in cap_me.vertices if v.co.z < 0.02]
CAP_NECK, CAP_BACK = 2 * max(abs(q.x) for q in cap_foot), min(q.y for q in cap_foot)   # the neck's width (0.733) and how far behind the abacus's front it stands (0.117)
CAP_D, CAP_H = max(v.co.y for v in cap_me.vertices), max(v.co.z for v in cap_me.vertices)   # its depth (0.971) and height (0.410)
n_cap5 = 0
for fi, pname, pl, ws in imp_sets:
    A, d, nrm, L = FACES[fi]
    for (sa, wa), (sb, wb) in zip(ws, ws[1:]):
        a, b = sa + wa / 2, sb - wb / 2            # the narrow pier between two of the set's windows, jamb to jamb
        kx, ky, kz = (b - a) / CAP_NECK, (TOP_T - 0.02) / CAP_D, CAP5_H / CAP_H   # the neck as wide as the pier; the back inside the panel; as tall as the moulding
        o = bpy.data.objects.new("ge_capital5", cap_me); FIT.objects.link(o)
        base = A + d * ((a + b) / 2) + nrm * (pl + ky * CAP_BACK - CAP5_SINK)  # the neck's front just inside the pier's face (its setback behind the abacus scales with the depth, ky): the abacus ky * CAP_BACK proud, the neck flush with the shaft it stands on
        o.matrix_world = Matrix(((d.x * kx, -nrm.x * ky, 0.0, base.x), (d.y * kx, -nrm.y * ky, 0.0, base.y), (0.0, 0.0, kz, IMP_Z0), (0.0, 0.0, 0.0, 1.0)))
        n_cap5 += 1
print(f"the top floor's impost course: one moulding {IMP_Z0:.3f}..{IMP_Z0 + IMP_H:.3f} on the wall's outline ({len(imp_path)} points), cut at "
      f"{len(imp_sets)} window sets into {len(imp_pieces)} pieces returning {IMP_RET:.2f} into their reveals; {n_cap5} capitals on the narrow piers, "
      f"{CAP5_H:.2f} tall with their tops on the springing")
# ---------------------------------------------------------------- the roof crown (user 2026-09-19, the reference photos)
# Four courses on the top floor's wall head, in the place of the game's crown (taken down with the lift, above): a
# two-step corbelled moulding, a frieze of flower tiles, a dentil course on its own plinth, and a cornice of three
# fasciae with an angular edge. Their heights come from the user's photos, measured against the top floor's widest
# window TOP_W_MAX: 0.230 + 0.550 + (0.100 + 0.230) + (0.145 + 0.135 + 0.155 + 0.085) = RC_H 1.630, about 1.55 W, and
# the block's top comes to 20.732. The frieze is 0.550 because the installed flower set repeats every 1.100 m: two
# square tiles of exactly the course's height, so no tile is oblong and none is cut short vertically.
#
# SEVEN thin rings, not one deep sweep. `sweep` mitres a break by carrying a profile point |o| ALONG the path as well
# as out -- probed on the band's own cornices, where ge_cornice45_top (max o 0.160) breaks at y 12.068 and wall__21
# breaks at 12.225 -- so a single sweep projecting 0.620 would put its break 0.62 m off the wall's silhouette and the
# four courses would stagger against each other. Each ring instead rides its own `loop` base (`front`) and projects at
# most 0.120 over it, and each ring's jogs are padded by its own projection (`rc_jogs`), which puts the break of every
# course's outermost face back on the wall's own line. Every profile reaches RC_IN back behind the FIELD's wall plane
# whatever its front (b = -(front + RC_IN)), so the seven rings are one 0.280-thick parapet standing 1.63 m over the
# roof deck and not seven ledges, and ring 4c's top face closes it.
RC_IN  = 0.30                                      # how far every profile reaches back behind the field's wall plane (cf. C45_IN)
RC_JOG = COL_OUT - BRICK_OUT                       # 0.300: the wall's own silhouette step, field to pavilion
RC_Z0  = TOP_Z1 + UPPER_LIFT                       # 19.102: the top floor's wall head. Nothing drops below it: 0.225 over the top panels' heads
RC_M_S1_H, RC_M_S1_O = 0.105, 0.045                # course 1, the lower corbelled step: its soffit is the wall head itself
RC_M_S2_H, RC_M_S2_O = 0.125, 0.090                # the upper step; its face IS the frieze's plane, so the frieze sits straight on it
RC_M_H = RC_M_S1_H + RC_M_S2_H                     # 0.230
RC_ANCHOR = RC_M_S1_O                              # 0.045: the projection the whole crown's returns are anchored on -- the corbel's first step, which lands on the wall's own line where the wall changes depth
RC_FR_H = 0.550                                    # course 2, the flower frieze (user 2026-09-19)
RC_FR_F = RC_M_S2_O                                # 0.090: it stands on the moulding's top step
RC_FR_TILE_U = 2.0 * RC_FR_H                       # 1.100: the set is a seamless 2:1 image of two square tiles, and 1.100 is its catalog tileMeters
RC_PL_H, RC_PL_SPLAY, RC_PL_O = 0.100, 0.035, 0.090   # course 3a, the dentil plinth: a splay off the frieze face, then a plinth face
RC_PL_F = RC_FR_F                                  # 0.090: on the frieze's own base
RC_CF_H, RC_CF_F = 0.230, 0.130                    # course 3b, the coffer back the teeth stand against (0.050 of the plinth's top is left as their shelf)
RC_T_W, RC_T_GAP = 0.140, 0.200                    # course 3c, the teeth: pitch 0.340
RC_T_H, RC_T_FACE = 0.230, 0.110                   # as tall as the coffer, and this much proud of it -> front 0.240
RC_C1_H, RC_C1_F = 0.145, 0.320                    # course 4a, the cornice bed: its soffit oversails the teeth by 0.080
RC_C2_H, RC_C2_F = 0.135, 0.410                    # 4b, the middle fascia: a 0.090 ledge over the bed
RC_C3_H, RC_C3_F = 0.155, 0.500                    # 4c, the upper fascia: another 0.090 ledge
RC_E_H, RC_E_O   = 0.085, 0.120                    # and the ANGULAR edge on it: a straight splay out and up, not an ogee (user: "3 level + edge angular")
RC_H = RC_M_H + RC_FR_H + RC_PL_H + RC_CF_H + RC_C1_H + RC_C2_H + RC_C3_H + RC_E_H   # 1.630
RC_T_Z = RC_M_H + RC_FR_H + RC_PL_H                # 0.880: the teeth stand on the plinth's top, with the coffer
RC_DECK_OUT = BRICK_OUT + (RC_M_S1_O + RC_JOG - RC_IN) / 2     # -0.0775: where the roof deck's planes are brought in to (below)
assert abs(RC_H - 1.55 * TOP_W_MAX) < 0.02, "the four courses are sized off the reference's ratios to the top floor's widest window"
assert abs(RC_FR_TILE_U - 2.0 * RC_FR_H) < 1e-9, "a 2:1 two-tile image: the course must be half the horizontal repeat or the tiles go oblong"
assert abs(RC_FR_TILE_U - 1.1) < 1e-9, "1.100 is the flower set's own tileMeters (its pbr.material.config.js): the tiles are exactly square at 0.550"
assert abs(RC_Z0 - (TOP_Z1 + UPPER_LIFT)) < 1e-9 and RC_Z0 - 18.877 > 0.20, "the crown stands on the wall head, clear of the top panels' heads"
assert RC_Z0 + RC_H - 19.105 > 1.0, "the parapet must stand clear above the roof deck"
assert BRICK_OUT + RC_JOG - RC_IN < RC_DECK_OUT < BRICK_OUT + RC_M_S1_O, "the deck must end inside the moulding over a field run and past the parapet's back over a pavilion"
_rc_runs = []
for fi in range(len(FACES)):
    _o = out_stretches(fi)
    _rc_runs += [b - a for a, b in _o] + [_o[k][0] - _o[k - 1][1] for k in range(1, len(_o))]
assert min(_rc_runs) > 2 * (RC_IN + RC_C3_F), "a run shorter than twice the deepest profile's own reach folds the sweep (README)"
def rc_jogs(pad):
    # silhouette_jogs(RC_JOG) with every raised stretch's FREE ends pulled back `pad`. A mitre carries a profile point
    # |o| along the path as well as out, so the jog of the face at offset o lands `o` short of the stretch's own end:
    # padding a ring by its own projection puts the break of its outermost face back on the wall's line. A CORNER
    # stretch's outer end is not free -- it opens at s = 0 or closes at s = L, which is what makes `loop` mitre that
    # corner at the offset -- and is left alone. rc_jogs(0) is silhouette_jogs(RC_JOG) exactly (asserted below).
    J = {}
    for fi in range(len(FACES)):
        L = FACES[fi][3]
        for a, b in out_stretches(fi):
            o0, o1 = a > 1e-6, b < L - 1e-6
            a2, b2 = (a + pad if o0 else a), (b - pad if o1 else b)
            J.setdefault(fi, []).append(([(a2, 0.0)] if o0 else []) + [(max(a2, 0.0), RC_JOG), (min(b2, L), RC_JOG)]
                                        + ([(b2, 0.0)] if o1 else []))
    return J
def rc_inline(p):
    # `loop` drops a point that lies on the line of its neighbours (a flat ring folds the sweep, README), but it tests
    # the RAW cross product against 1e-9, and mathutils is single precision: at x 17 with a 4 m run the rounding is
    # already 3e-6, so whether the point goes depends on how the ring's own base happens to round. The chamfer's two
    # corner points survive on some bases, leaving a 0.12..0.29 m segment there -- and a back reaching RC_IN behind a
    # face this deep folds over one (measured: -0.041 m on the frieze, the plinth, c1 and c3). Dropped here, on the
    # NORMALISED cross, which no real turn of this outline (45, 90, 135 degrees) comes near. The outline is the same.
    out = [p[0]]
    for i in range(1, len(p) - 1):
        u = Vector(p[i]) - Vector(out[-1]); v = Vector(p[i + 1]) - Vector(p[i])
        if u.length > 1e-9 and v.length > 1e-9 and abs(u.normalized().cross(v.normalized())) < 1e-5 and u.dot(v) > 0: continue
        out.append(p[i])
    out.append(p[-1])
    return out
def rc_path(front, pad): return rc_inline(loop(rc_jogs(pad), BRICK_OUT + front))
_p0 = rc_path(0.0, 0.0); _pi = rc_inline(loop(silhouette_jogs(COL_OUT - BRICK_OUT), BRICK_OUT))
_same = len(_p0) == len(_pi) and all(abs(q[0] - r[0]) < 1e-9 and abs(q[1] - r[1]) < 1e-9 for q, r in zip(_p0, _pi))
assert _same, "rc_jogs(0) must be silhouette_jogs(RC_JOG): the padding is the only thing the crown's outline adds"
for _q in (rc_path(f, p) for f, p in ((0.0, 0.090), (RC_FR_F, 0.0), (RC_CF_F, 0.0), (RC_C3_F, RC_E_O))):
    assert len(_q) == len(_p0), f"the crown's outline came out with {len(_q)} points, not {len(_p0)}: a ring's base rounds differently"
def crown_moulding_profile():
    # closed (o outward from the ring's base, z up from its foot): two corbelled steps, each with a free soffit. No
    # buried foot: this ring sits ON the wall head, like the game's parapet band, which had its bottom cap there too.
    b = -RC_IN; z1 = RC_M_S1_H; z2 = z1 + RC_M_S2_H
    return [(b, 0.0), (RC_M_S1_O, 0.0), (RC_M_S1_O, z1), (RC_M_S2_O, z1), (RC_M_S2_O, z2), (b, z2)]
def crown_frieze_profile(front):
    # a plain rectangle, so max o = 0: no mitre rake at all, and the frieze breaks exactly on the wall's break with its
    # 0.300 returns carrying the tiles round with it. The -0.005 foot buries the bottom face inside the course below --
    # every ring but the moulding gets it, or consecutive rings' horizontal faces are coplanar and z-fight.
    b = -(front + RC_IN)
    return [(b, -0.005), (0.0, -0.005), (0.0, RC_FR_H), (b, RC_FR_H)]
def crown_plinth_profile(front):
    b = -(front + RC_IN)
    return [(b, -0.005), (0.0, -0.005), (RC_PL_O, RC_PL_SPLAY), (RC_PL_O, RC_PL_H), (b, RC_PL_H)]
def crown_fascia_profile(front, h):
    b = -(front + RC_IN)
    return [(b, -0.005), (0.0, -0.005), (0.0, h), (b, h)]
def crown_top_profile(front):
    # the upper fascia and the angular edge: straight up, then a straight splay out and up (RC_E_O over RC_E_H, 55
    # degrees off the vertical) to the top face that closes the parapet
    b = -(front + RC_IN)
    return [(b, -0.005), (0.0, -0.005), (0.0, RC_C3_H), (RC_E_O, RC_C3_H + RC_E_H), (b, RC_C3_H + RC_E_H)]
def crown_frieze_uvs(me, z0):
    # metres along the face and metres up from the frieze's foot, per polygon on its own horizontal tangent (band_uvs
    # generalised, so the chamfer and every jog return get their own correct plane). The tangent is the face normal
    # turned a quarter left, which is the viewer's right on every face: no face comes out mirrored.
    uvl = me.uv_layers.active or me.uv_layers.new(name="UVMap"); uv = uvl.data
    for pl in me.polygons:
        h = Vector((pl.normal.x, pl.normal.y))
        t = Vector((1.0, 0.0)) if h.length < 1e-4 else Vector((-h.normalized().y, h.normalized().x))
        for li in pl.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (Vector((q.x, q.y)).dot(t), q.z - z0)
def crown_ring(name, front, prof, z_local, mat=None, pad=None):
    # pad: how far the ring's jogs are pulled back where the wall changes depth. ONE rule for the whole crown (user
    # 2026-09-20, three times over: the corbel's first step must line up with the wall under it, each course with the
    # one it stands on, and the cornice's edge must carry on past them in proportion): a mitre carries a profile point
    # |o| ALONG the path as well as across it, so a face at `o` on a ring based `front` out returns at the wall's
    # corner + pad + front - p, where p = front + o is what that face projects. Taking pad = RC_ANCHOR - front makes
    # every face of every ring return at the corner offset outward by (p - RC_ANCHOR): the corbel's first step, which
    # projects RC_ANCHOR, lands exactly on the wall's line, each course's own foot lands on the face it stands on, and
    # each proud lip -- the corbel's upper step, the plinth, the cornice's weathered edge -- oversails the break by
    # just what it projects, as a cornice does. Padding each ring by its own outermost point instead (the first cut)
    # anchored every ring on a different face and left each course's foot recessed behind what it sat on.
    if pad is None: pad = RC_ANCHOR - front
    bm = bmesh.new(); sweep(bm, rc_path(front, pad), prof, RC_Z0 + z_local)
    o = mesh_from_bm(name, bm, mat or TRIM_PBR, FIT, smooth=True)
    o["rc_out"] = BRICK_OUT + front + max(q for (q, z) in prof)   # the ring's outermost face on a field stretch: where its tongue is cut off
    if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=math.radians(40.0))
    return o
def crown_teeth(bm, zbase, W, GAP, H, FACE, front):
    # the dentil generator of the band's own top cornice, with the crown's runs: along every run of the wall's outline
    # -- the field runs at BRICK_OUT + front, the raised runs at COL_OUT + front, the corner ones out to the mitre --
    # at one pitch, 0.03 clear of each run's own end, biting 2 mm into the course below and the one above and 0.010
    # into the coffer behind. Corners are not turned: `out_stretches` already carries the raised run past the corner.
    pitch = W + GAP; n = 0
    for fi in range(len(FACES)):
        A, d, nrm, L = FACES[fi]; outs = out_stretches(fi); runs = []
        for k, (a, b) in enumerate(outs):
            if k and a - outs[k - 1][1] > 1e-6: runs.append((outs[k - 1][1], a, BRICK_OUT + front))
            runs.append((a, b, COL_OUT + front))
        for a, b, off in runs:
            x0 = 0.03; span = b - a - 2 * x0 - W
            if span < 0: continue
            cnt = int(span // pitch) + 1; step = span / (cnt - 1) if cnt > 1 else 0.0
            M = Matrix((Vector((-d.x, -d.y, 0.0)), Vector((nrm.x, nrm.y, 0.0)), Vector((0.0, 0.0, 1.0)))).transposed().to_4x4()   # right-handed, x = -s
            for k in range(cnt):
                x = a + x0 + k * step
                r = bmesh.ops.create_cube(bm, size=1.0); n += 1
                c = A + d * (x + W / 2) + nrm * (off + (FACE - 0.01) / 2)
                M.translation = Vector((c.x, c.y, zbase + H / 2))
                bmesh.ops.transform(bm, matrix=M @ Matrix.Diagonal((W, FACE + 0.01, H + 0.004, 1)), verts=r["verts"])
    return n
def rc_corner(fi, off):
    # where the offset lines of face fi-1 and face fi cross: `loop`'s own mitre, which holds for a NEGATIVE offset too
    # (a plane brought in behind the wall), unlike loop itself, whose mitre branch only fires for a positive one
    n0, n1 = FACES[fi - 1][2], FACES[fi][2]
    return FACES[fi][0] + (n0 + n1) * (off / (1.0 + n0.dot(n1)))
# The roof deck comes in behind the new parapet. The game's four planes lie out at the PAVILION outline, which the
# 0.460-thick parapet band buried; with the band gone they would stand 0.255 out of the new moulding's soffit along
# every field run, a razor-thin flange all round the building. So the wall head's own 0.080 cap ring (roof__26,
# roof__27) goes with the band it capped -- the moulding covers the head now -- and the two deck planes are laid again
# on the hull's own outline at RC_DECK_OUT: behind the moulding's field face (BRICK_OUT + RC_M_S1_O) and still past the
# parapet's back over a pavilion (BRICK_OUT + RC_JOG - RC_IN). Their five corners are moved onto the five mitred
# corners of that outline, one for one, so the mesh, its UVs and its material stay as they are; pushing each corner
# back off the faces it stands over will not do, because the game's outline is not a plan offset of the hull at all
# (its chamfer corner already sits 0.080 INSIDE the east face, so that face's edge would come out slanting by 0.19 over
# its 32 m). (This is the one thing the crown's plan had wrong: the decks sit inside ring 1 over a pavilion only.)
_cap = [bpy.data.objects[n] for n in ("roof__26", "roof__27") if n in bpy.data.objects]
assert len(_cap) == 2, "the wall head's cap ring roof__26/roof__27 is not there"
remove(_cap)
_decks = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.vertices and o.name.startswith("roof__") and wbbox(o)[1].z > 19.0]
assert sorted(o.name for o in _decks) == ["roof__25", "roof__28"], sorted(o.name for o in _decks)
_corners = [rc_corner(fi, RC_DECK_OUT) for fi in range(len(FACES))]
n_dv = 0
for o in _decks:
    mw = o.matrix_world; inv = mw.inverted(); taken = set()
    assert len(o.data.vertices) == len(FACES), f"{o.name}: {len(o.data.vertices)} corners, the hull has {len(FACES)}"
    for v in o.data.vertices:
        p = mw @ v.co; f = Vector((p.x, p.y, 0.0))
        k = min(range(len(FACES)), key=lambda i: (f - FACES[i][0]).length)
        assert k not in taken and (f - FACES[k][0]).length < 0.6, f"{o.name}: a deck corner does not answer to one hull corner"
        taken.add(k); q = _corners[k]; v.co = inv @ Vector((q.x, q.y, p.z)); n_dv += 1
    o.data.update()
FLOWER_PBR = pbr_material("PBR_bradbury_flower_tiles", "bradbury_flower_tiles", RC_FR_TILE_U, RC_FR_H, v0=0.0, clamp=False)
_rc_rings = [crown_ring("ge_crown_moulding", 0.000, crown_moulding_profile(), 0.000)]
_fz = crown_ring("ge_crown_frieze", RC_FR_F, crown_frieze_profile(RC_FR_F), RC_M_H, mat=FLOWER_PBR); _rc_rings.append(_fz)
crown_frieze_uvs(_fz.data, RC_Z0 + RC_M_H)
_rc_rings.append(crown_ring("ge_crown_plinth", RC_PL_F, crown_plinth_profile(RC_PL_F), RC_M_H + RC_FR_H))
_rc_rings.append(crown_ring("ge_crown_coffer", RC_CF_F, crown_fascia_profile(RC_CF_F, RC_CF_H), RC_T_Z))
bm = bmesh.new(); n_rc_teeth = crown_teeth(bm, RC_Z0 + RC_T_Z, RC_T_W, RC_T_GAP, RC_T_H, RC_T_FACE, RC_CF_F)
mesh_from_bm("ge_crown_teeth", bm, TRIM_PBR, FIT)
_rc_rings.append(crown_ring("ge_crown_c1", RC_C1_F, crown_fascia_profile(RC_C1_F, RC_C1_H), RC_T_Z + RC_CF_H))
_rc_rings.append(crown_ring("ge_crown_c2", RC_C2_F, crown_fascia_profile(RC_C2_F, RC_C2_H), RC_T_Z + RC_CF_H + RC_C1_H))
_rc_rings.append(crown_ring("ge_crown_c3", RC_C3_F, crown_top_profile(RC_C3_F), RC_T_Z + RC_CF_H + RC_C1_H + RC_C2_H))
assert len(_rc_rings) == 7, [o.name for o in _rc_rings]
# The rings' inner faces where the wall changes depth (user 2026-09-20). A ring's outer face is padded onto the wall's
# own line, but its back, front + RC_IN from its own path, is carried that much further along the path by the same
# mitre, so each course stepped onto a raised stretch at its own line (0.39 apart over the seven) instead of the wall's.
# The outer faces must not move, so the overshoot is cut off instead: at each FREE jog -- a raised stretch's end that
# does not wrap a building corner, where all the rings share one mitre and already agree -- everything behind that
# stretch's own inner plane RC_BACK_IN is subtracted, over the metre inside the jog that the deepest ring can reach.
RC_BACK_IN = BRICK_OUT + RC_JOG - RC_IN            # -0.10: the inner face of any ring standing on a raised stretch
RC_TRIM_S = RC_C3_F + RC_IN + RC_E_O + 0.28        # 1.20: past the furthest a back is carried (the top ring's 0.50 + 0.30 + its own 0.12 pad = 0.92)
assert 2 * RC_TRIM_S < min(b - a for fi in range(len(FACES)) for a, b in out_stretches(fi)), "the trim boxes of a stretch's two ends must not meet"
n_rc_trim = 0
for _ob in _rc_rings:
    _f0 = len(_ob.data.polygons)
    for fi in range(len(FACES)):
        L = FACES[fi][3]; F = rh_frame(fi)
        for a, b in out_stretches(fi):
            for s0, into in ((a, +RC_TRIM_S), (b, -RC_TRIM_S)):
                if not (1e-6 < s0 < L - 1e-6): continue     # an end on a corner has no jog: the ring wraps it there
                lo, hi = sorted((s0, s0 + into))
                cut_world_box(_ob, -hi, -lo, RC_BACK_IN - 0.60, RC_BACK_IN, RC_Z0 - 0.01, RC_Z0 + RC_H + 0.01, frame=F)
                # The outer side is NOT squared off (user 2026-09-20): every course's main face returns on the wall's
                # line, and each course's own proud lip -- the corbel's upper step, the plinth's, the cornice's
                # weathered edge -- carries on past it by its own projection, as a cornice oversails a break.
                n_rc_trim += 1
    assert len(_ob.data.polygons) > _f0 / 2, f"{_ob.name}: {len(_ob.data.polygons)} faces after the jog trim, was {_f0}"
    _ob.data.shade_smooth()                         # the boolean returns a plain mesh: the sweep's own shading again
    if hasattr(_ob.data, "set_sharp_from_angle"): _ob.data.set_sharp_from_angle(angle=math.radians(40.0))
print(f"the roof crown: seven rings on the wall's own outline ({len(_p0)} points), {RC_Z0:.3f}..{RC_Z0 + RC_H:.3f} "
      f"({RC_H:.3f} = {RC_H / TOP_W_MAX:.2f} W), projecting {RC_M_S2_O:.3f} at the moulding to {RC_C3_F + RC_E_O:.3f} at "
      f"the cornice's edge; the frieze {RC_FR_H:.3f} tall on square {RC_FR_H:.3f} flower tiles ({RC_FR_TILE_U:.3f} repeat); "
      f"{n_rc_teeth} dentils at pitch {RC_T_W + RC_T_GAP:.3f}, {RC_T_FACE:.3f} proud of the coffer; the wall head's cap "
      f"ring taken down and the roof deck's {n_dv} corners laid again at {RC_DECK_OUT:+.4f}, behind the parapet. "
      f"The block's top is now {RC_Z0 + RC_H:.3f}. Every ring's inner face trimmed onto the wall's line at the "
      f"{n_rc_trim // len(_rc_rings)} jogs where it changes depth")
# for now (user, 2026-09-12): the game's ground-floor wall (cut up by all the openings) is hidden, not deleted; the wall is
# to be replaced by pillars later. Eye and render toggles, so the outliner can bring it back.
for n in ("wall__0",):
    o = bpy.data.objects.get(n)
    if o: o.hide_set(True); o.hide_render = True
# The game's interior shells (interior__*: a box 1 cm behind the wall on every floor, with its floor planes) are not needed:
# the windows carry their own backdrops, and the shells showed as white strips wherever the brick wall steps back from
# the field, a few centimetres above every floor line (user 2026-09-12): all of them go, on every floor.
shells = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("interior__")]
print("removing the game's interior shells:", len(shells)); remove(shells)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("ASSEMBLED", OUT, "| library:", portal.library.filepath, "| objects:", len(bpy.data.objects))

# ---------------------------------------------------------------- review renders
if not args.no_render:
    S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = 1600, 1000, 100
    S.render.image_settings.file_format = 'PNG'; S.render.engine = 'CYCLES'
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences
        cp.compute_device_type = "OPTIX"; cp.get_devices()
        for d in cp.devices: d.use = d.type in ('OPTIX', 'CPU')
        S.cycles.device = 'GPU'
    except Exception as e:
        print("GPU not available, rendering on the CPU:", e); S.cycles.device = 'CPU'
    S.cycles.samples = args.samples; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.02; S.cycles.use_denoising = True
    try: S.cycles.denoiser = 'OPTIX' if S.cycles.device == 'GPU' else 'OPENIMAGEDENOISE'
    except Exception: pass
    for cname, fn in (("PortalCam", "block_portal"), ("PortalQuarterCam", "block_portal_quarter"), ("EntablatureCam", "block_entablature"), ("CornerCam", "block_corner"), ("BackPortalCam", "block_back_portal"), ("SouthPortalCam", "block_south_portal"), ("SouthQuarterCam", "block_south_quarter")):
        if cname not in bpy.data.objects: continue
        S.camera = bpy.data.objects[cname]; S.render.filepath = os.path.join(SHOTS, fn + ".png")
        t0 = time.time(); bpy.ops.render.render(write_still=True); print(f"{fn}: {S.render.filepath} ({time.time() - t0:.1f} s)")
    S.camera = bpy.data.objects["PortalCam"]
print("BUILDING DONE")
