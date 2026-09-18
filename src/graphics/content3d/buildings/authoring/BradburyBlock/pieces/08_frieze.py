"""Piece 08 — the BRADBURY frieze band.

A plain stone band over the arch block and the pilaster capitals (z 4.08 ..
4.50), flush with the pilasters' faces and ending at their outer edges.
Between the capitals the letters "BRADBURY." (bold sans capitals 0.28 m
tall, no serifs) extruded 1.2 cm out of the band, with a 5 mm half-round rim
running along each letter's outline, raised from the letter face. Above each
pilaster a foliage panel of leaves on curved branchlets, in layered relief:
a small rosette in the middle, a wavy main branch to each side with three
curling branchlets, edged leaves along the branches and at the branchlet
ends (leaves 2 cm, branches 2.6 cm, rosette to 3.8 cm).
The dentil course and cornice above are not part of this piece.

Frame: x across, y depth (band face at y = -2.90), z up. Collection: FRIEZE.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

BAND_HALF = 2.33                 # ends with the pilasters' outer edges (piece 07 X1)
Y_FACE, Y_BACK = -2.90, -2.05    # flush with the pilasters
Z0, Z1 = 4.16, 4.83              # right above the pilaster capitals (piece 07 CAP_TOP) and the arch block (piece 06), 0.67 tall as measured on the reference
ZC = (Z0 + Z1) / 2
CAP_H = 0.36                     # letter height
TEXT_MAX_W = 2.30
TEXT_PROUD = 0.012               # letters extruded out of the band
RIM_R = 0.005                    # ridge along each letter's outline, raised from the letter face (set inside the edge)
FONT_PATH = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "ariblk.ttf")   # Arial Black: bold wide sans like the reference (no serifs)
PANEL_X = 1.9675                 # decal panels centred over the pilasters (x 1.605 .. 2.33)
RELIEF = 0.020                   # base relief of the foliage panels (leaves); ribbons, rosette and buds stand higher

COLL = ensure_collection("FRIEZE")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)

# ---------------------------------------------------------------- band
bm = bmesh.new(); cube(bm, -BAND_HALF, BAND_HALF, Y_FACE, Y_BACK, Z0, Z1); mesh_from_bm("frieze_band", bm, STONE, COLL)

# ---------------------------------------------------------------- letters: extruded, with a rim ridge raised from the letter faces along their outline
fnt = bpy.data.fonts.load(FONT_PATH) if os.path.exists(FONT_PATH) else None
def text_mesh(name, y_plane, fill, extrude=0.0, bevel=0.0, offset=0.0):
    cu = bpy.data.curves.new(name + "_cu", 'FONT'); cu.body = "BRADBURY."; cu.size = 1.0
    cu.align_x = 'CENTER'; cu.align_y = 'BOTTOM_BASELINE'; cu.resolution_u = 12
    cu.fill_mode = 'BOTH' if fill else 'NONE'; cu.extrude = extrude; cu.bevel_depth = bevel; cu.bevel_resolution = 3; cu.offset = offset
    if fnt: cu.font = fnt
    tmp = bpy.data.objects.new(name + "_tmp", cu); COLL.objects.link(tmp)
    tmp.rotation_euler = (math.pi/2, 0.0, 0.0); tmp.location = (0.0, y_plane, ZC)      # local +Z -> world -Y (out of the wall)
    bpy.context.view_layer.update(); deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps)); me.name = name
    o = bpy.data.objects.new(name, me); COLL.objects.link(o); o.matrix_world = tmp.matrix_world.copy()
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.curves.remove(cu)
    me.materials.append(STONE)
    return o
letters = text_mesh("frieze_letters", Y_FACE, True, extrude=TEXT_PROUD)                          # solid letters, TEXT_PROUD out of the band
rims = text_mesh("frieze_letter_rims", Y_FACE - TEXT_PROUD, False, bevel=RIM_R, offset=-RIM_R)  # ridge along the outline on the letter faces
me = letters.data
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]                  # local: x across, y up
f = CAP_H / (max(ys) - min(ys)); wx = min(1.0, TEXT_MAX_W / ((max(xs) - min(xs)) * f))
for o, y in ((letters, Y_FACE), (rims, Y_FACE - TEXT_PROUD)):
    o.scale = (f * wx, f, 1.0); o.location = (0.0, y, ZC - CAP_H/2 - min(ys) * f)       # centred in the band

# ---------------------------------------------------------------- flat relief helpers (decal-like)
def prism_xz(bm, pts, y0, y1):
    v0 = [bm.verts.new((x, y0, z)) for x, z in pts]; v1 = [bm.verts.new((x, y1, z)) for x, z in pts]
    n = len(pts); caps = [bm.faces.new(v0), bm.faces.new(tuple(reversed(v1)))]
    for i in range(n): bm.faces.new((v0[i], v1[i], v1[(i+1) % n], v0[(i+1) % n]))
    bmesh.ops.triangulate(bm, faces=caps)
def ribbon_xz(bm, pts, widths, y_face, h):
    """Flat strip of varying width along a polyline in the XZ plane, h proud of the face."""
    n = len(pts); L = []; R = []
    for i, (x, z) in enumerate(pts):
        if i == 0: d = (pts[1][0] - x, pts[1][1] - z)
        elif i == n - 1: d = (x - pts[i-1][0], z - pts[i-1][1])
        else: d = (pts[i+1][0] - pts[i-1][0], pts[i+1][1] - pts[i-1][1])
        l = math.hypot(*d) or 1.0; nx, nz = -d[1]/l, d[0]/l; w = widths[i]/2
        L.append((x + nx*w, z + nz*w)); R.append((x - nx*w, z - nz*w))
    yF, yB = y_face - h, y_face + 0.002
    Lf = [bm.verts.new((x, yF, z)) for x, z in L]; Rf = [bm.verts.new((x, yF, z)) for x, z in R]
    Lb = [bm.verts.new((x, yB, z)) for x, z in L]; Rb = [bm.verts.new((x, yB, z)) for x, z in R]
    for i in range(n - 1):
        bm.faces.new((Lf[i], Rf[i], Rf[i+1], Lf[i+1])); bm.faces.new((Lb[i+1], Rb[i+1], Rb[i], Lb[i]))
        bm.faces.new((Lf[i], Lf[i+1], Lb[i+1], Lb[i])); bm.faces.new((Rf[i+1], Rf[i], Rb[i], Rb[i+1]))
    bm.faces.new((Rf[0], Lf[0], Lb[0], Rb[0])); bm.faces.new((Lf[-1], Rf[-1], Rb[-1], Lb[-1]))
def leaf_xz(bm, base, tip, width, bend, y_face, h, lobes=3, n=28, serr=0.30):
    """Flat lobed leaf: quadratic midline base->tip bowed by `bend`, serrated half-width envelope."""
    bx, bz = base; tx, tz = tip; dx, dz = tx - bx, tz - bz; L = math.hypot(dx, dz); ux, uz = dx/L, dz/L; nx, nz = -uz, ux
    cx, cz = (bx + tx)/2 + nx*bend, (bz + tz)/2 + nz*bend
    def mid(t): return ((1-t)**2*bx + 2*(1-t)*t*cx + t**2*tx, (1-t)**2*bz + 2*(1-t)*t*cz + t**2*tz)
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        x0, z0 = mid(max(0.0, t - 0.01)); x1, z1 = mid(min(1.0, t + 0.01)); l = math.hypot(x1 - x0, z1 - z0) or 1.0
        px, pz = -(z1 - z0)/l, (x1 - x0)/l
        env = math.sin(math.pi * t**0.75) * (1.0 + serr*math.cos(2*math.pi*lobes*t + math.pi)) if 0 < t < 1 else 0.0
        hw = width/2 * max(0.0, env); x, z = mid(t)
        left.append((x + px*hw, z + pz*hw)); right.append((x - px*hw, z - pz*hw))
    outline = left + right[::-1][1:-1]
    prism_xz(bm, outline, y_face + 0.002, y_face - h)
    return [mid(i / n) for i in range(n + 1)]
def dome_xz(bm, c, r, y_face, h):
    ellipsoid(bm, (c[0], y_face, c[1]), r, h, r, u=16, v=8)                     # half embedded: h proud of the face
def bezier2(p0, c, p1, n=24):
    return [((1-t)**2*p0[0] + 2*(1-t)*t*c[0] + t**2*p1[0], (1-t)**2*p0[1] + 2*(1-t)*t*c[1] + t**2*p1[1]) for t in (i/n for i in range(n + 1))]
def disk_xz(bm, c, r, y_face, h, segs=24):
    prism_xz(bm, [(c[0] + r*math.cos(2*math.pi*i/segs), c[1] + r*math.sin(2*math.pi*i/segs)) for i in range(segs)], y_face + 0.002, y_face - h)
def petal_xz(bm, c, ang, a, b, y_face, h, segs=20):
    """Flat ellipse (a along the petal direction, b across) whose inner end sits at c."""
    ux, uz = math.cos(ang), math.sin(ang); px, pz = -uz, ux; cx, cz = c[0] + ux*a, c[1] + uz*a
    prism_xz(bm, [(cx + ux*a*math.cos(2*math.pi*i/segs) + px*b*math.sin(2*math.pi*i/segs), cz + uz*a*math.cos(2*math.pi*i/segs) + pz*b*math.sin(2*math.pi*i/segs)) for i in range(segs)], y_face + 0.002, y_face - h)

def catmull(pts, seg=10):
    """Smooth polyline through 2D control points (Catmull-Rom)."""
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        for j in range(seg):
            t = j / seg; t2, t3 = t*t, t*t*t
            out.append(tuple(0.5 * ((2*p1[k]) + (-p0[k] + p2[k])*t + (2*p0[k] - 5*p1[k] + 4*p2[k] - p3[k])*t2 + (-p0[k] + 3*p1[k] - 3*p2[k] + p3[k])*t3) for k in range(2)))
    out.append(tuple(pts[-1])); return out
def taper(a, b, n): return [a + (b - a) * i / (n - 1) for i in range(n)]
def at(path, t):
    """Point and unit direction at parameter t (0..1) along a polyline."""
    i = min(len(path) - 2, int(t * (len(path) - 1))); p, q = path[i], path[i+1]
    d = (q[0] - p[0], q[1] - p[1]); l = math.hypot(*d) or 1.0
    return p, (d[0]/l, d[1]/l)
def decal(cx, cz, tag):
    """Leaves on curved branchlets: a small rosette in the middle, a wavy main branch to each side with three
    curling branchlets, edged leaves along the branches and at the branchlet ends; layered relief."""
    bm = bmesh.new(); H = RELIEF
    disk_xz(bm, (cx, cz), 0.05, Y_FACE, H)
    for k in range(8): petal_xz(bm, (cx, cz), 2*math.pi*k/8, 0.03, 0.012, Y_FACE, H + 0.008)
    dome_xz(bm, (cx, cz), 0.016, Y_FACE, H + 0.018)
    for s in (-1, 1):
        main = catmull([(cx + s*0.05, cz + 0.01), (cx + s*0.12, cz + 0.07), (cx + s*0.21, cz + 0.01), (cx + s*0.29, cz - 0.06), (cx + s*0.375, cz - 0.01)], 10)
        ribbon_xz(bm, main, taper(0.016, 0.008, len(main)), Y_FACE, H + 0.006)
        # branchlets curving off the main branch, ending in a curl with a leaf
        for t_at, side, L in ((0.22, 1, 0.07), (0.50, -1, 0.08), (0.78, 1, 0.07)):
            P, d = at(main, t_at); nx, nz = -d[1]*side, d[0]*side
            c = (P[0] + d[0]*L*0.5 + nx*L*0.5, P[1] + d[1]*L*0.5 + nz*L*0.5)
            e = (P[0] + d[0]*L*0.35 + nx*L, P[1] + d[1]*L*0.35 + nz*L)
            br = bezier2(P, c, e, 12)
            dd = (br[-1][0] - br[-2][0], br[-1][1] - br[-2][1]); l = math.hypot(*dd) or 1.0; dd = (dd[0]/l, dd[1]/l)
            cc = Vector((e[0] + dd[0]*0.022, 0.0, e[1] + dd[1]*0.022))
            sp = spiral_points(cc, Vector((-dd[0], 0.0, -dd[1])), Vector((-dd[1], 0.0, dd[0])), 0.022, 0.8, 0.5, 14, 0.0, 1.0)
            path = br + [(q.x, q.z) for q in sp[1:]]
            ribbon_xz(bm, path, taper(0.010, 0.005, len(path)), Y_FACE, H + 0.006)
            tip = (e[0] + nx*0.05 + d[0]*0.03, e[1] + nz*0.05 + d[1]*0.03)
            mid = leaf_xz(bm, e, tip, 0.042, 0.012*side, Y_FACE, H, lobes=3)
            ribbon_xz(bm, mid, taper(0.007, 0.003, len(mid)), Y_FACE, H + 0.006)
        # leaves along the main branch, alternating sides
        for t_at, side in ((0.12, -1), (0.36, 1), (0.62, -1), (0.9, 1)):
            P, d = at(main, t_at); nx, nz = -d[1]*side, d[0]*side
            tip = (P[0] + nx*0.06 + d[0]*0.03, P[1] + nz*0.06 + d[1]*0.03)
            mid = leaf_xz(bm, P, tip, 0.048, 0.010*side, Y_FACE, H, lobes=3)
            ribbon_xz(bm, mid, taper(0.008, 0.003, len(mid)), Y_FACE, H + 0.006)
    # keep the panel inside the band: its outer leaves overshoot the end otherwise (4.6 cm on the left); slide it inward
    over = max(abs(v.co.x) for v in bm.verts) - (BAND_HALF - 0.03)
    if over > 0: bmesh.ops.translate(bm, verts=bm.verts, vec=(-math.copysign(over, cx), 0.0, 0.0))
    mesh_from_bm(f"frieze_decal_{tag}", bm, STONE, COLL)
decal(-PANEL_X, ZC, "L"); decal(PANEL_X, ZC, "R")

# ---------------------------------------------------------------- cameras, renders, save
rig = setup_scene()
camera("PortalFront", (0.0, -11.0, 2.0), (0.0, -2.4, 2.9), 35)
camera("FriezeFront", (0.0, -9.0, 4.25), (0.0, -2.9, 4.29), 50)
camera("FriezeDecal", (-1.1, -4.6, 4.4), (-2.0, -2.9, 4.29), 60)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
S = bpy.context.scene; S.render.resolution_x = 1400; S.render.resolution_y = 1600
render("PortalFront", os.path.join(OUT, "08_frieze_front.png"))
render("FriezeFront", os.path.join(OUT, "08_frieze_band.png"))
render("FriezeDecal", os.path.join(OUT, "08_frieze_decal.png"))
S.camera = bpy.data.objects["PortalFront"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("FRIEZE DONE", len(COLL.objects), "objects")
