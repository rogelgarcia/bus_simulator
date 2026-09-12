"""Ornament — the leaf-and-tongue motif of the archivolt, built part by part in its own file.

Reference: the user's front and three-quarter views (screens/.../references/
leaf_ref_a.png, leaf_ref_b.png). The bar across the top of the reference is the band's own tall outer step,
not part of the motif. Parts so far:
  1. the centre stem: a softened rectangle in section (a low domed top, a soft
     seam where the full convex shoulders begin, its base edges on the ground) hanging from the outer step; its top
     surface rises on a smooth quarter-ellipse over the first 45% and then runs level, easing down slightly at the nose; past the
     middle the sides converge in a long taper that closes in a rounded end,
     the top edges meeting at the centre off the ground, where the tongue below
     will take over.
  2. the side leaves: the user's polygon traced on the front view, extruded flat
     and mirrored, joined on the centre line (a blank to be shaped next).
The tongue and the small inner lobes come next (a first tongue was removed on request).

Frame: x across the motif (width W), y from the tongue end (-H/2) up to the
cap top (+H/2), z the relief out of the base plane (z = 0). Built at the
size of the archivolt's middle step: H 0.0595, W 0.027, relief 0.012. The
portal's arch piece links `arch_leaf` and instances it along the band with
the cap at the outer edge.
File: ornaments/arch_leaf.blend; renders: screens .../ornaments/arch_leaf_*.png.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

W, H, RELIEF = 0.027, 0.0675, 0.012      # width across the run, height across the band (the whole middle step: the motif hangs from the band's tall outer step), relief out of the base

bpy.ops.wm.read_homefile(use_empty=True)
COLL = ensure_collection("ARCH_LEAF")
CARVED = mat_sandstone("PORTAL_sandstone_carved", joints=False)
bm = bmesh.new()

# ---------------------------------------------------------------- 1. the centre stem (the bar above it in the reference is the band's own outer step, not part of the motif)
STEM_W = 0.30 * W                        # width of the stem's footprint
STEM_Y0, STEM_Y1 = H/2, H/2 - 0.40 * H   # from the outer step's riser down to its tip
STEM_Z_TOP, STEM_Z_TIP = 0.60 * RELIEF, 1.0 * RELIEF      # relief of the top surface at the outer end and at the tip: one gentle rise, the tip highest
T_TAPER = 0.55                           # where along the stem (0 outer end, 1 tip) the sides start converging
# rows along: dense where the surface curves (the rise at the start, the nose at the end), sparse along the level middle
T_ROWS = [0.0, 0.45, 0.78, 0.93, 1.0]    # 4 intervals: outer end, top of the rise, start of the nose ease, the round-over, the point
NT = len(T_ROWS) - 1
SEAM_S = 0.68                            # where the flat top ends and the shoulder begins (fraction of the half-width)
def shoulder(u):                         # shoulder profile, u 0 at the seam .. 1 at the ground: a full convex curve leaving the top at a soft 9-degree seam
    return (1.0 - 0.02 * u) * max(0.0, 1.0 - u ** 2.4) ** 0.55
TOP_DOME = 0.03                          # the top is curved all the way: a low dome dropping 3% from the centre to the seam
SECTION = [(-1.0, 0.0), (-0.55, 1.0), (0.55, 1.0), (1.0, 0.0)]                # 3 segments across: ground, shoulder, shoulder, ground (a 30-triangle budget)
NS = len(SECTION) - 1
SIDE_BULGE = 0.06                        # the sides bow out a little in plan (just a bit convex)
T_RISE = 0.45                            # the top surface rises over the first 45% of the length, then runs level
NOSE_T, NOSE_DROP = 0.70, 0.18           # over the last 30% the top surface eases down to 82% at the nose (the user's hand edit, made longer and softer)
TIP_T, TIP_END = 0.92, 0.30              # over the last 8% the nose rounds over and the point comes down to 30% of that height
def stem_width(t):                       # footprint half-width: the sides widen smoothly to the start of the taper (widest there), then the taper closes in a rounded end
    if t <= T_TAPER: return STEM_W / 2 * (1.0 + SIDE_BULGE * math.sin(0.5 * math.pi * t / T_TAPER))
    f = (t - T_TAPER) / (1.0 - T_TAPER)
    return STEM_W / 2 * (1.0 + SIDE_BULGE) * max(0.0, 1.0 - f ** 2.2) ** 0.6
def stem_height(t):                      # top surface: a smooth quarter-ellipse rise from the outer end, level along the rest, a slight ease-down at the nose
    f = math.sqrt(max(0.0, 1.0 - (1.0 - min(t, T_RISE) / T_RISE) ** 2))
    z = STEM_Z_TOP + (STEM_Z_TIP - STEM_Z_TOP) * f
    if t > NOSE_T:
        g = (t - NOSE_T) / (1.0 - NOSE_T); z *= 1.0 - NOSE_DROP * (g * g * (3 - 2 * g))      # a smooth ease, gentle at both ends
    if t > TIP_T:
        g = (t - TIP_T) / (1.0 - TIP_T); z *= TIP_END + (1.0 - TIP_END) * math.sqrt(max(0.0, 1.0 - g * g))   # the point itself rounds down
    return z
def lobe_surface(bm, y_top, y_bot, t_rows, width_fn, height_fn, section, cap_top=True):
    """A rib/lobe lying on the base plane: rows along t (0 at y_top .. 1 at y_bot), each row the cross-section (s, z) scaled
    by width_fn(t) across and height_fn(t) up; the last row closes to a point. Open underneath; the top end is capped."""
    rows = []
    for i, t in enumerate(t_rows):
        hw = width_fn(t); hz = height_fn(t); y = y_top + (y_bot - y_top) * t
        if i == len(t_rows) - 1: hw = 1e-4
        rows.append([bm.verts.new((hw * sx, y, hz * sz)) for (sx, sz) in section])
    ns = len(section) - 1
    for i in range(len(t_rows) - 1):
        for j in range(ns): bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    if cap_top:
        base = [bm.verts.new((v.co.x, v.co.y, 0.0)) for v in rows[0]]
        bm.faces.new(tuple(base) + tuple(reversed(rows[0])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
lobe_surface(bm, STEM_Y0, STEM_Y1, T_ROWS, stem_width, stem_height, SECTION)
leaf = mesh_from_bm("arch_leaf", bm, CARVED, COLL, smooth=True); mark_sharp(leaf, 45.0)      # the stem: its own object (the portal links this mesh)

# ---------------------------------------------------------------- 2. the side leaves: the user's polygon (front view), extruded flat, mirrored about the centre; a separate object
bm = bmesh.new()
# (u, v): u across as a fraction of the width (0 = centre), v down from the top as a fraction of the height. Left half, traced
# from the reference: top under the outer step beside the stem, down the stem's edge to its tip, then the centre line down to
# where the tongue will start, out to the lower tip, up the outer edge and back in to the top.
LEAF_POLY_L = [(-0.32, 0.008), (-0.14, 0.008), (-0.14, 0.294), (0.0, 0.401), (0.0, 0.712), (-0.457, 0.825), (-0.488, 0.26), (-0.324, 0.102)]
LEAF_Z = 0.65 * RELIEF                   # extrusion: below the stem, which stands proud of the leaves
left = LEAF_POLY_L
right = [(-u, v) for (u, v) in reversed(left)]
# one outline for both halves, joined on the centre line: left top -> stem edge -> tip -> right stem edge -> right top -> right outer -> bottom centre -> left outer
outline = [left[0], left[1], left[2], left[3], (0.14, 0.294), (0.14, 0.008), (0.32, 0.008), (0.324, 0.102), (0.488, 0.26), (0.457, 0.825), left[4], left[5], left[6], left[7]]
pts = [(u * W, H/2 - v * H) for (u, v) in outline]
v0 = [bm.verts.new((x, y, 0.0)) for (x, y) in pts]; v1 = [bm.verts.new((x, y, LEAF_Z)) for (x, y) in pts]
bm.faces.new(tuple(reversed(v0))); bm.faces.new(tuple(v1))
for i in range(len(pts)): bm.faces.new((v0[i], v0[(i + 1) % len(pts)], v1[(i + 1) % len(pts)], v1[i]))
outer = mesh_from_bm("arch_leaf_outer", bm, CARVED, COLL, smooth=False)                      # the outer part: its own object and mesh

# ---------------------------------------------------------------- cameras, renders, save
rig = setup_scene()
camera("LeafFront", (0.0, 0.0, 0.22), (0.0, 0.0, 0.0), 60)
camera("LeafQuarter", (0.12, -0.10, 0.16), (0.0, 0.0, 0.0), 60)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project\ornaments"
os.makedirs(OUT, exist_ok=True)
S = bpy.context.scene; S.render.resolution_x = 900; S.render.resolution_y = 1200
render("LeafFront", os.path.join(OUT, "arch_leaf_front.png"))
render("LeafQuarter", os.path.join(OUT, "arch_leaf_quarter.png"))
S.camera = bpy.data.objects["LeafQuarter"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\ornaments\arch_leaf.blend", compress=True)
print("ARCH LEAF DONE", len(COLL.objects), "objects", len(leaf.data.polygons), "+", len(outer.data.polygons), "faces")
