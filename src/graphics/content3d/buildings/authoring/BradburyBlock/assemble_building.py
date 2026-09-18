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
# fifth floor's sills stand on that: everything from the game's mid cornice up is lifted UPPER_LIFT for it, and the
# raised bays' wall of floors 2 to 4 runs on up to the band's top to close the gap the lift opens beside the band.
B45_STEP = 0.06                                    # = RECESS_D, the window recess (asserted where that is defined)
B45_FRONT = COL_OUT - B45_STEP                     # +0.14: the band's face
B45_STEPS_H = 0.18                                 # the moulding over the capitals and the brackets (user 2026-09-17, photo of the bracket course): a
                                                   # taller band 0.10, a step 0.03, a smaller step 0.02 and an edge ring 0.03 (C45_*, with the cornices);
                                                   # a thin plate under it was tried and taken out again (user), the moulding let down onto the brackets
B45_H = 0.55                                       # the band itself over the moulding (photos 1, 4, 5: about 0.3 of the fourth floor's window height)
B45_TOPC_H = 0.28                                  # the top cornice on it: dentils, a small step, a convex curve, an edge
B45_Z0 = WALL24_TOP                                # 15.632: the band's foot, on the capitals' top
B45_Z1 = B45_Z0 + B45_STEPS_H + B45_H              # 16.362: the band's top, the top cornice's foot, the raised bays' wall extension's top
B45_TOP = B45_Z1 + B45_TOPC_H                      # 16.642: the fifth floor's sills stand here
SILL5_GAME = 15.990                                # the top floor's sills' underside as the game has them (asserted at the lift)
UPPER_LIFT = B45_TOP - SILL5_GAME                  # 0.652: how far everything from the mid cornice up is lifted (0.300 of it for the capitals)
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
def sweep(bm, path, profile, zbase):
    # closed (o, z) profile swept along an open polyline (world XY) with mitred corners; o = left of travel = outward
    # on this clockwise loop. A mitre carries a point |o| from the path |o|*tan(half the turn) ALONG it as well, so a
    # break shallower than the moulding's own projection -- the edge capitals' 0.08 against the crown's 0.165 -- cannot
    # be wrapped by it and folds a sliver of the strip at its corners (see README: tried and rejected fixes).
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
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)   # the loop closes on itself (path[0] == path[-1]): no end caps
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
# A three-pane storefront stands on the deep plane and the stone zone over it steps back with it. Two of the 3rd
# Street face's two-pane fillers do the same (user 2026-09-16): the pair between the centre pavilion and the corner
# bay. Only the depth changes -- they keep their two panes and the pair of windows over them -- so they are named
# here by where they stand, counting the bays along the face in order.
DEEP_BAYS = {0: (6, 7)}
BAY_ORDER = {fi: sorted((n for n in bays if bays[n][0] == fi), key=lambda n: targets[n][0]) for fi in range(len(FACES))}
for fi, ks in DEEP_BAYS.items():
    assert max(ks) < len(BAY_ORDER[fi]), f"face {fi} has {len(BAY_ORDER[fi])} bays, not {max(ks) + 1}"
DEEP = {BAY_ORDER[fi][k] for fi, ks in DEEP_BAYS.items() for k in ks}
for n in sorted(DEEP, key=lambda q: targets[q][0]):
    print(f"face {bays[n][0]}: the bay at {targets[n][0]:.2f}..{targets[n][1]:.2f} ({bay_type(n)}) set as deep as a three-pane storefront")
recesses = {}                                                  # face -> [(t0, t1, F, tu0, tu1)]: the storefronts the stone zone above steps back over (user)
n_bays = 0
for name, (fi, s0, s1, F, u0, u1, v0, v1, parts) in bays.items():
    inv = F.inverted(); A, d = FACES[fi][0], FACES[fi][1]; t0, t1 = targets[name]
    pa, pb = (inv @ (A + d * t0)).x, (inv @ (A + d * t1)).x; tu0, tu1 = min(pa, pb), max(pa, pb)   # the opening in the bay's frame
    ku = (tu1 - tu0) / (u1 - u0)
    # out of the game's deep recess to the bay's inset behind the pier face (the three-pane storefronts twice as deep), stretched
    # from the fascia's extents onto the opening, then up into the band. Each part moves by its own front (the wall plane is where
    # the face's hull line sits in the frame); the glazing parts move together, keeping the game's spacing behind their frame.
    inset = INSET_WIDE if (s1 - s0) > WIDE_BAY or name in DEEP else INSET
    if inset == INSET_WIDE: recesses.setdefault(fi, []).append((t0, t1, F, tu0, tu1))
    v_front = (inv @ FACES[fi][0]).y + STRIP_OUT - inset
    def front(o): return max((inv @ (o.matrix_world @ v.co)).y for v in o.data.vertices)
    glazing = [o for o in parts if not o.name.startswith("storefront_")]
    g_front = front(max(glazing, key=lambda o: wbbox(o)[1].z - wbbox(o)[0].z)) if glazing else v_front   # the tallest part's front (the frame), not a handle sticking out of a door leaf
    for o in parts:
        dv = (v_front - front(o)) if o.name.startswith("storefront_") else (v_front - GLAZING_BEHIND - g_front)
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
                fbox(f"sf_frame_{n_bays:02d}_{nm}", x0, x1, vf - 0.005, vf + 0.01, z0, z1, SF_METAL)
    for t in (wall, shell):
        carve_faces(t, lo, hi, v0 - 0.4, v1 + 0.4, STOREFRONT_TOP - 0.0005, BAND_BOTTOM + 0.003, frame=F)
    n_bays += 1
# above the storefronts next to the portal, the game's portal-cutout lips between its 5.6 m opening and the pilaster go too
for tag, yc, xw, s in (("C", YC, W_C, 1), ("E", YE, W_E, -1)):
    for side in (-1, 1):
        carve_faces(wall, *sorted((xw - s * 0.25, xw + s * 0.06)), *sorted((yc + side * (GAME_HALF + 0.02), yc + side * P_HALF)), STOREFRONT_TOP - 0.0005, WALL_TOP + 0.01)   # 2 cm past the cutout edge: its reveal face sits exactly there
print(f"{n_bays} storefronts laid out between {PIER_W:.3f} piers, {INSET} / {INSET_WIDE} (three-pane) behind the pier face, raised to the band strip, their lintels carved")
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
# the bottom: a convex bulge running into a concave cove that rises more than it projects, a short vertical fillet and
# the square top edge; its top at the frame's bottom like the box's, its back on the wall plane the box floated 1.1 cm off.
SILL_OUT = 0.05                                                # the cap's projection from the wall: the top edge stands furthest out (user)
SILL_STEP = 0.01                                               # the cap overhangs the fillet below it by this
RECESS_SIDE = 0.03                                             # the sill runs this much past the set's boxes on each side; the recess around the set is exactly as wide as the sill (user)
SILL_A0, SILL_A1, SILL_A2 = 10.0, 70.0, 15.0                   # tangent angles from horizontal: the convex starts at 10 degrees, not flat; the curves meet at 70; the cove ends at 15, short of flat (user)
SILL_M, SILL_B = (0.028, 0.032), (SILL_OUT - SILL_STEP, 0.065) # where the convex turns concave, where the cove ends (under the cap's overhang)
SILL_FILLET, SILL_FILLET2 = 0.015, 0.02                        # the vertical fillet over the cove, the cap's own rise to the top edge
SILL_JOIN_R, SILL_EDGE_R = 0.005, 0.004                        # small rounds: where the cove meets the fillet (user: bevelled, not pointy) and on the cap's two front edges
SILL_H = SILL_B[1] + SILL_FILLET + SILL_FILLET2                # 0.10
def round_corner(prev, corner, nxt, r, n=3):
    # the sharp corner prev -> corner -> nxt replaced by an arc of radius r tangent to both segments
    d_in = (corner - prev).normalized(); d_out = (nxt - corner).normalized()
    turn = math.atan2(d_in.x * d_out.y - d_in.y * d_out.x, d_in.dot(d_out)); t = r * math.tan(abs(turn) / 2)
    p_in = corner - d_in * t; C = p_in + Vector((-d_in.y, d_in.x)) * (r if turn > 0 else -r)
    a0 = math.atan2(p_in.y - C.y, p_in.x - C.x)
    return [C + Vector((math.cos(a0 + turn * i / n), math.sin(a0 + turn * i / n))) * r for i in range(n + 1)]
def sill_profile():
    # closed (o outward from the wall face, z up from the sill's bottom): bottom, convex, concave, fillet, the cap stepping out, top; the back closes it on the wall plane
    def cubic(P0, a0, P3, a3, n=6):
        # a cubic from P0 to P3 leaving at a0 degrees and arriving at a3 degrees from horizontal (handles 40% of the chord: gentle, large-radius arcs)
        d0 = Vector((math.cos(math.radians(a0)), math.sin(math.radians(a0)))); d3 = Vector((math.cos(math.radians(a3)), math.sin(math.radians(a3))))
        h = 0.4 * (P3 - P0).length; P1, P2 = P0 + d0 * h, P3 - d3 * h
        return [(1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * P1 + 3 * (1 - t) * t * t * P2 + t ** 3 * P3 for t in (i / n for i in range(1, n + 1))]
    A, M, B = Vector((0.0, 0.0)), Vector(SILL_M), Vector(SILL_B); z1 = B.y + SILL_FILLET; z2 = z1 + SILL_FILLET2
    nodes = [(A, 0.0)]                                                                   # the back on the wall plane: nothing of the sill inside the wall (user: reduced depth)
    nodes += [(q, 0.0) for q in cubic(A, SILL_A0, M, SILL_A1)]                          # convex: rising from the start, on a large radius
    cove = cubic(M, SILL_A1, B, SILL_A2); nodes += [(q, 0.0) for q in cove[:-1]] + [(cove[-1], SILL_JOIN_R)]   # concave, ending short of flat, rounded into the fillet
    nodes += [(Vector((B.x, z1)), 0.0), (Vector((SILL_OUT, z1)), SILL_EDGE_R), (Vector((SILL_OUT, z2)), SILL_EDGE_R), (Vector((0.0, z2)), 0.0)]
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
TOP_Z0, TOP_Z1, TOP_T = 15.592, 19.592, 0.32       # the top floor's wall: its foot, its head, and its thickness
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
RIM_MARGIN = 0.15                                  # the brick a top-floor panel keeps beside its windows
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
# The arcade's impost band is a course of blocks along each face at the springing of the arches, broken only by the
# openings. The game's blocks stand where its windows stood, so the course is taken down here and laid again at the
# end, once every set has found its place (user 2026-09-14: no block left stranded on the plain wall).
BAND_Z, BAND_IN, BAND_OUT = (18.472, 18.612), -0.04, 0.07     # the course's height, how deep it sits in the wall and how far it stands out
band_old = [o for o in bpy.data.objects if o.name.startswith("bay_arcade_impost") and TOP_Z[0] < sum(wbbox(o)[i].z for i in (0, 1)) / 2 < TOP_Z[1]]
BAND_MAT = band_old[0].data.materials[0]
print(f"the impost band: {len(band_old)} blocks taken down, to be laid again once the sets have moved")
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
        if not (TOP_Z0 - 0.1 < q.z < TOP_Z1 + 0.3): continue
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
        bmesh.ops.delete(_bm, geom=wall_faces_in(_bm, fi, a, b, TOP_Z0 - 0.01, TOP_Z1 + 0.01, game - 0.6, COL_OUT + 0.4), context='FACES')
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

# The top floor's wall now takes a hole for every panel where it finally stands, and the impost band is laid again
# along each face, one block per stretch between the openings and at the depth the wall has there, so the course runs
# on over the plain wall and stops at each window as the game had it.
def band_runs(fi):
    # the wall's plane along the whole face as (s0, s1, depth) runs, the outermost slab winning at every place:
    # the pavilions at the ends and centre, the field between them
    items = wall_slabs(fi); L = FACES[fi][3]; lo, hi = -BAND_OUT, L + BAND_OUT
    xs = sorted({min(max(x, lo), hi) for a, b, _ in items for x in (a, b)} | {lo, hi})
    runs = []
    for a, b in zip(xs, xs[1:]):
        if b - a < 1e-4: continue
        d = [dv for q0, q1, dv in items if q0 - 1e-6 <= (a + b) / 2 <= q1 + 1e-6]
        if not d: continue
        if runs and abs(runs[-1][2] - max(d)) < 1e-4 and abs(runs[-1][1] - a) < 1e-6: runs[-1][1] = b
        else: runs.append([a, b, max(d)])
    assert runs, f"face {fi}: no wall to lay the impost band on"
    return runs
def top_openings(fi):
    # the arched openings of the top floor on this face: the window frames, as spans along it
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith("mesh__"): continue
        a, b = wbbox(o)
        if not (TOP_Z[0] < (a.z + b.z) / 2 < TOP_Z[1]) or b.z - a.z < 1.5 or face_of(o) != fi: continue
        ds = [face_sd(fi, o.matrix_world @ Vector(q))[1] for q in o.bound_box]
        if 0.05 < max(ds) - min(ds) < 0.12: out.append(s_extent(o, fi))
    return sorted(out)
panels = [o for o in bpy.data.objects if o.name.startswith("top_panel")]
holes = []
for o in panels:
    fi = face_of(o); a, b = wbbox(o); s0, s1 = s_extent(o, fi)
    holes.append((fi, s0, s1, a.z, b.z, wall_plane(fi, s0, s1)))
_me = W21.data; _mw = W21.matrix_world
_bm = bmesh.new(); _bm.from_mesh(_me); bmesh.ops.transform(_bm, matrix=_mw, verts=_bm.verts)
for fi, s0, s1, z0, z1, front in holes:
    bmesh.ops.delete(_bm, geom=wall_faces_in(_bm, fi, s0, s1, z0, z1, front - 0.6, front + 0.3), context='FACES')
bmesh.ops.transform(_bm, matrix=_mw.inverted(), verts=_bm.verts); _bm.to_mesh(_me); _bm.free(); _me.update()
n_band = 0
for fi in range(len(FACES)):
    runs = band_runs(fi); openings = top_openings(fi)                # the runs already reach a little past both corners, where two faces' courses meet
    bm = bmesh.new()
    for a, b, dv in runs:
        x = a
        for o0, o1 in [w for w in openings if w[1] > a and w[0] < b]:
            if o0 - x > 0.02:
                r = bmesh.ops.create_cube(bm, size=1.0); n_band += 1
                bmesh.ops.transform(bm, matrix=rh_frame(fi) @ Matrix.Translation((-(x + o0) / 2, dv + (BAND_IN + BAND_OUT) / 2, sum(BAND_Z) / 2))
                                    @ Matrix.Diagonal((o0 - x, BAND_OUT - BAND_IN, BAND_Z[1] - BAND_Z[0], 1)), verts=r["verts"])
            x = max(x, o1)
        if b - x > 0.02:
            r = bmesh.ops.create_cube(bm, size=1.0); n_band += 1
            bmesh.ops.transform(bm, matrix=rh_frame(fi) @ Matrix.Translation((-(x + b) / 2, dv + (BAND_IN + BAND_OUT) / 2, sum(BAND_Z) / 2))
                                @ Matrix.Diagonal((b - x, BAND_OUT - BAND_IN, BAND_Z[1] - BAND_Z[0], 1)), verts=r["verts"])
    o = mesh_from_bm(f"impost_band_{PORTAL_TAG.get(fi, fi)}", bm, BAND_MAT, FIT)
    me = o.data; me.uv_layers.new(name="UVMap"); uv = me.uv_layers.active.data       # the game's mapping: the block's own place, flat on each side
    for pl in me.polygons:
        for li in pl.loop_indices:
            q = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (q.x, 1.0 - q.y) if abs(pl.normal.z) > 0.7 else ((q.y, q.z - BAND_Z[0]) if abs(pl.normal.x) >= abs(pl.normal.y) else (q.x, q.z - BAND_Z[0]))
        pl.use_smooth = False
print(f"top floor: {len(holes)} holes cut in the plain wall ({len(W21.data.polygons)} faces left), the impost band laid again in {n_band} blocks")

# The brick wall of floors 2 to 4, built from scratch (user 2026-09-12: the game's layered wall, once its columns, panels,
# separators and the patch over the portal had been worked over, was a mess of seams and slivers): one closed ring around
# the hull on the field plane, FIELD_IN behind the hull and WALL_T thick, with a rectangular hole cut for every window frame
# on those floors, 1 cm inside the frame's edges so the frame hides behind the reveal. It takes the game's brick material
# and the texture scale of the old wall, mapped along each face and up, and the game's wall__8 goes.
WALL_T = 0.25
RECESS_D, RECESS_ABOVE = 0.06, 0.30                            # the recessed panel around each window set: its depth, how far it runs above the frames; as wide as the sill
assert abs(B45_STEP - RECESS_D) < 1e-9, "the band between floors 4 and 5 steps back from the raised bays by the window recess's depth"
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
def reveal_faces(o, F, x0, x1, y0, y1, z0, z1):
    # the recess's reveal, added to a window panel: four faces standing from its front (y0) out to the wall's plane
    # (y1) around the hole, each wound so it faces into the recess (a new face's normal is not computed yet, so the
    # winding is worked out from the corners themselves rather than read back off the face)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for q, inward in ((((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)), (1, 0, 0)),
                      (((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)), (-1, 0, 0)),
                      (((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)), (0, 0, 1)),
                      (((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), (0, 0, -1))):
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
        fr = COL_OUT if in_corner(fi, (s0 + s1) / 2) else BRICK_OUT       # the wall's plane there: the field, or a corner's
        drop = z_top - FOOT_TOP if z_top < FOOT_TOP + 1.0 else 0.0                 # the second floor comes down onto the foot
        sets.append((fi, s0, s1, z_top - drop, max(h[4] for k, h in mine) + RECESS_ABOVE, mine, sl.name, fr, drop))
    bm = bmesh.new(); bm.from_mesh(wall.data)
    for fi, s0, s1, z_top, z1p, mine, nm, fr, drop in sets:
        bmesh.ops.delete(bm, geom=wall_faces_in(bm, fi, s0, s1, z_top, z1p, BRICK_OUT - WALL_T - 0.05, fr + 0.05), context='FACES')
    bm.to_mesh(wall.data); bm.free(); wall.data.update()
    for fi, s0, s1, z_top, z1p, mine, nm, fr, drop in sets:
        F = rh_frame(fi)
        panel = frame_box("panel_" + nm.split("_")[-1], F, -s1, -s0, BRICK_OUT - WALL_T, fr - RECESS_D, z_top, z1p, mat)
        for k, (f2, sa, sb, za, zb, _) in mine:
            cut_world_box(panel, -(sb - 0.01), -(sa + 0.01), BRICK_OUT - WALL_T - 0.05, fr - RECESS_D + 0.05, za - drop + 0.005, zb - 0.005, frame=F); covered.add(k)
        reveal_faces(panel, F, -s1, -s0, fr - RECESS_D, fr, z_top, z1p)
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
          and o.name.startswith(("cornice__", "cornice_ornament__", "parapet_block", "roof__", "mesh__")) and in_band(o)]
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
# A foot stands on the crown's top, the last member of the ground-floor entablature (user 2026-09-16): a square band
# 0.20 tall taking 60% of the crown's projection, so 40% of the top ledge still shows outside it, with its top 2 cm
# rounded over convex. It rises past the second floor line, standing against the foot of the brick rather than under it.
M_FOOT_R, M_FOOT_TAKE = 0.02, 0.60                 # M_FOOT_H is up with the floor lines: the second floor's windows stand on this foot
M_FOOT_OUT = M_FOOT_TAKE * (M_OUT + M_EDGE_STEP)
def crown_profile():
    # closed (outward o, z up from M_BOTTOM): an S -- a long hollow out of the wall, a short convex crest over it --
    # then the square edge, the top ledge, the foot standing on it, and back into the wall
    P = [(-E_IN, 0.0), (0.0, 0.0)]
    A = Vector((0.0, 0.0)); B = Vector((M_OUT, M_CURVE_H)); T = A + (B - A) * M_S_TURN      # the S turns at T
    ch = T - A; C1 = (A + T) / 2 + Vector((-ch.y, ch.x)).normalized() * M_HOLLOW            # control point inward-up: concave
    for i in range(1, 9):
        t = i / 8; Q = (1 - t) ** 2 * A + 2 * (1 - t) * t * C1 + t * t * T; P.append((Q.x, Q.y))
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
# its cornices, so the fifth floor's sills come to stand on the top cornice at B45_TOP.
_s5 = min(wbbox(o)[0].z for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("sill_") and wbbox(o)[0].z > 15.5)
assert abs(_s5 - SILL5_GAME) < 0.002, f"the top floor's sills stand at {_s5:.3f}, not {SILL5_GAME:.3f}: UPPER_LIFT is measured from them"
_up = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.vertices and wbbox(o)[0].z > CORNICE_UNDER - 1e-4]
for o in _up: o.matrix_world = Matrix.Translation(Vector((0.0, 0.0, UPPER_LIFT))) @ o.matrix_world
print(f"the upper floor lifted {UPPER_LIFT:+.3f} for the capitals and the band between floors 4 and 5: {len(_up)} meshes, "
      f"from {CORNICE_UNDER:.3f} up; the fifth floor's sills now stand at {_s5 + UPPER_LIFT:.3f}")
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
n_b45 = []
for fi in range(len(FACES)):
    outs = out_stretches(fi); F = rh_frame(fi); tag = PORTAL_TAG.get(fi, fi)
    for k in range(1, len(outs)):
        a, b = outs[k - 1][1], outs[k][0]
        if b - a < 0.05: continue
        o = frame_box(f"ge_band45_{tag}_{k}", F, -b, -a, BRICK_OUT - WALL_T, B45_FRONT, B45_Z0, B45_Z1, B45_MAT)
        brick_uvs(o.data, *BRICK_UV); n_b45.append(f"{tag}:{a:.2f}..{b:.2f}")
print(f"the band between floors 4 and 5: {len(n_b45)} runs {B45_Z0:.3f}..{B45_Z1:.3f} at {B45_FRONT:+.2f} ({B45_STEP:.2f} behind the raised bays, "
      f"{B45_FRONT - BRICK_OUT:.2f} proud of the field): " + ", ".join(n_b45))
# the entablature in the portal's own stone (the frieze band's material, no ashlar joint lines), now that the link brought it in
band = bpy.data.objects.get("frieze_band")
portal_stone = band.data.materials[0] if band and band.data.materials else None
if portal_stone:
    for o in list(GCOLL.objects) + [f for f in FIT.objects if f.name.startswith(("fit_band_top", "fit_pier_", "fit_inset", "fit_bar", "fit_cap_", "fit_zone_"))]:
        o.data.materials.clear(); o.data.materials.append(portal_stone)
else:
    print("WARNING: the portal's frieze_band material was not found; the entablature keeps the ashlar material")
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
BRK_MAT = _me.materials[0] if _me.materials else (portal_stone or CARVED)
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
# floor's sills 2 cm over it.
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
assert T45_H < B45_TOPC_H, "the top cornice is taller than the room left for it under the fifth floor's sills"
C45_MAT = portal_stone or STONE
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
mesh_from_bm("ge_teeth45", bm, portal_stone or CARVED, FIT)
print(f"the cornices of the band between floors 4 and 5: the bottom moulding {B45_Z0:.3f}..{B45_Z0 + B45_STEPS_H:.3f} "
      f"and the top cornice {B45_Z1:.3f}..{B45_Z1 + T45_H:.3f}, both on the band's outline, "
      f"one mitred sweep each round {len(band45_path)} points; {n_teeth} dentils at pitch {pitch45:.2f}")
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
