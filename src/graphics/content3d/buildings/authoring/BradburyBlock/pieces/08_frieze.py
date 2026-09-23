"""Piece 08 — the BRADBURY frieze band.

A plain stone band over the arch block and the pilaster capitals (z 4.08 ..
4.50), flush with the pilasters' faces and ending at their outer edges.
Between the capitals the inscription "BRADBURY.", the lettering PBR decal
(assets/public/pbr/bradbury_lettering, user 2026-09-22) on a flat mesh 1 mm
proud of the band, cut to the letters' own silhouette. Above each
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
# The row's size (user 2026-09-22: "make it bigger. it must shorten the distance to the capitals underneath by 50%
# (horizontal distance)"): its ends stand CAP_GAP inside the pilaster capitals' inner edges -- the capitals' own
# vertices, measured below, since their tops overhang the shafts -- half the 0.331 the first decal, 2.307 wide, left.
CAP_GAP = 0.5 * 0.3308
LETTER_MARGIN_MIN = 0.08         # and the letters keep at least this much of the band above and below them
LETTER_SET = "bradbury_lettering"   # the inscription decal: "BRADBURY." on a transparent 2172 x 724 canvas, every map sharing one alpha
DECAL_PROUD = 0.001              # in front of the band's face, so the two never share a plane
CELL_PX = 3                      # the decal mesh's grid, in texels (3.4 mm): it follows the letters, the texture's alpha cuts the exact edge
# The letters' colour (user 2026-09-23: "adjust the tinting of the font so it matches better the color of the wall"):
# the image is warm terracotta, sRGB mean (200, 119, 71) against the band's (178, 111, 86) -- redder, and short of blue
# -- so the material gains it per channel, in linear light, onto the wall's own SANDSTONE_SRGB, as the band's stone is
# gained onto it: the same stone, the texture's variation and relief kept. LETTER_TONE scales that target.
LETTER_TONE = 1.0
PANEL_X = 1.9675                 # decal panels centred over the pilasters (x 1.605 .. 2.33)
RELIEF = 0.020                   # base relief of the foliage panels (leaves); ribbons, rosette and buds stand higher

COLL = ensure_collection("FRIEZE")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)

# ---------------------------------------------------------------- band
bm = bmesh.new(); cube(bm, -BAND_HALF, BAND_HALF, Y_FACE, Y_BACK, Z0, Z1); mesh_from_bm("frieze_band", bm, STONE, COLL)

# ---------------------------------------------------------------- the inscription: the lettering PBR decal
# (user 2026-09-22: "is there a bradbury pbr texture in the downloads? if so, replace the writing with that pbr image")
# The extruded Arial Black letters and their rims gave way to downloads/bradbury_lettering_PBR.zip, imported as
# assets/public/pbr/bradbury_lettering: a single decal, its relief (bevels, a raised rim, a slightly sunk clay face) in
# the normal map, its letters cut out on the base colour's alpha at 0.5 as its README asks. The row is centred in the
# band and as wide as puts its ends CAP_GAP inside the capitals below (its letters respaced in the image itself, by
# make_lettering_pbr.py), and the mesh follows the letters themselves on
# a CELL_PX grid, dilated a cell past the alpha so the texture, not the mesh, draws the edge; a quad would do for a
# render, but it draws as a solid rectangle in the Solid viewport, where this way the letters show in their own colour.
def _lettering():
    import numpy as np
    d = os.path.join(_repo_root(), "assets", "public", "pbr", LETTER_SET)
    m = bpy.data.materials.get("PORTAL_lettering")
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new("PORTAL_lettering"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs[0], out.inputs[0])
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UVMap"
    def tex(fn, cs):
        fp = os.path.join(d, fn); assert os.path.isfile(fp), f"missing {fp}"
        im = bpy.data.images.load(fp, check_existing=True); im.name = "pbr_" + LETTER_SET + "_" + os.path.splitext(fn)[0]
        im.colorspace_settings.name = cs
        try: im.filepath = bpy.path.relpath(fp)
        except ValueError: pass
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = im; tn.extension = 'EXTEND'
        nt.links.new(uvn.outputs["UV"], tn.inputs["Vector"]); return tn, im
    base, base_im = tex("basecolor.png", 'sRGB'); arm, _ = tex("arm.png", 'Non-Color'); nrm, _ = tex("normal_gl.png", 'Non-Color')
    # the image, bottom row first as Blender stores it: its alpha gives the letters' box and the mesh's cells, and the
    # letters' mean colour, linearised (the pixels of a byte image come back sRGB encoded), gives the tint
    W, H = base_im.size; px = np.empty(W * H * 4, dtype=np.float32); base_im.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    A = px[..., 3]
    lin = px[..., :3][A > 0.99].astype(np.float64); lin = np.where(lin <= 0.04045, lin / 12.92, ((lin + 0.055) / 1.055) ** 2.4)
    wall = np.array([_srgb_to_lin(v / 255.0) for v in SANDSTONE_SRGB]) * LETTER_TONE
    tint = nt.nodes.new("ShaderNodeMix"); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.inputs["Factor"].default_value = 1.0
    nt.links.new(base.outputs["Color"], next(i for i in tint.inputs if i.identifier == "A_Color"))
    next(i for i in tint.inputs if i.identifier == "B_Color").default_value = tuple(float(g) for g in wall / lin.mean(0)) + (1.0,)
    sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
    ao = nt.nodes.new("ShaderNodeMix"); ao.data_type = 'RGBA'; ao.blend_type = 'MULTIPLY'; ao.inputs["Factor"].default_value = 1.0
    nt.links.new(next(o for o in tint.outputs if o.identifier == "Result_Color"), next(i for i in ao.inputs if i.identifier == "A_Color"))
    nt.links.new(sep.outputs["Red"], next(i for i in ao.inputs if i.identifier == "B_Color"))
    nt.links.new(next(o for o in ao.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(nrm.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    cut = nt.nodes.new("ShaderNodeMath"); cut.operation = 'GREATER_THAN'; cut.inputs[1].default_value = 0.5
    nt.links.new(base.outputs["Alpha"], cut.inputs[0]); nt.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
    if hasattr(m, "use_transparent_shadow"): m.use_transparent_shadow = True
    rows, cols = np.nonzero(A > 0.5)
    c0, c1, r0, r1 = int(cols.min()), int(cols.max()) + 1, int(rows.min()), int(rows.max()) + 1       # the letters' box, texels
    cap_in = min(min(abs((o.matrix_world @ v.co).x) for v in o.data.vertices) for o in (bpy.data.objects["pilaster_L_capital"], bpy.data.objects["pilaster_R_capital"]))
    k = 2.0 * (cap_in - CAP_GAP) / (c1 - c0)                                                            # metres per texel: the row's ends CAP_GAP inside the capitals
    assert (r1 - r0) * k <= (Z1 - Z0) - 2 * LETTER_MARGIN_MIN, f"letters {(r1 - r0) * k:.3f} tall leave the band less than {LETTER_MARGIN_MIN} above and below"
    m.diffuse_color = tuple(float(v) for v in wall * 0.8) + (1.0,)                                     # the Solid viewport: a shade under the wall's, or the flat decal vanishes there
    # the cells: CELL_PX texels a side over the box and two cells beyond it, kept where any texel shows, then grown a cell
    g0c, g0r = c0 - 2 * CELL_PX, r0 - 2 * CELL_PX
    nc, nr = -(-(c1 - c0 + 4 * CELL_PX) // CELL_PX), -(-(r1 - r0 + 4 * CELL_PX) // CELL_PX)
    pad = np.zeros((nr * CELL_PX, nc * CELL_PX), dtype=np.float32)
    rs, cs_ = slice(max(g0r, 0), min(g0r + nr * CELL_PX, H)), slice(max(g0c, 0), min(g0c + nc * CELL_PX, W))
    pad[rs.start - g0r:rs.stop - g0r, cs_.start - g0c:cs_.stop - g0c] = A[rs, cs_]
    keep = pad.reshape(nr, CELL_PX, nc, CELL_PX).max(axis=(1, 3)) > 0.02
    grown = keep.copy()
    for dr in (-1, 0, 1):                                                                              # the eight neighbours, without wrapping round the grid
        for dc in (-1, 0, 1):
            grown[max(0, dr):nr + min(0, dr), max(0, dc):nc + min(0, dc)] |= keep[max(0, -dr):nr - max(0, dr), max(0, -dc):nc - max(0, dc)]
    xc, zc = (c0 + c1) / 2.0, (r0 + r1) / 2.0                                                          # the letters' centre, texels
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); vid = {}
    def vert(i, j):                                                                                    # lattice corner (row i, column j)
        if (i, j) not in vid:
            tx, ty = g0c + j * CELL_PX, g0r + i * CELL_PX
            vid[(i, j)] = bm.verts.new(((tx - xc) * k, Y_FACE - DECAL_PROUD, ZC + (ty - zc) * k))
        return vid[(i, j)]
    for i, j in zip(*np.nonzero(grown)):
        f = bm.faces.new((vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j)))           # +x then +z: the face looks along -y, out of the wall
        for l in f.loops:
            q = l.vert.co; l[uvl].uv = (q.x / k + xc) / W, ((q.z - ZC) / k + zc) / H
    n0 = len(bm.faces)
    bm.normal_update()                                                                                 # new faces carry no normal until asked, and the dissolve compares normals: without this it merges nothing
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.1), verts=bm.verts[:], edges=bm.edges[:])   # coplanar cells into a few n-gons; the UVs are linear in place, so they stay exact
    for f in bm.faces:
        for l in f.loops:
            q = l.vert.co; l[uvl].uv = (q.x / k + xc) / W, ((q.z - ZC) / k + zc) / H
    me = bpy.data.meshes.new("frieze_letters"); bm.to_mesh(me); bm.free(); me.materials.append(m)
    if sum(p.normal.y for p in me.polygons) > 0: me.flip_normals()
    o = bpy.data.objects.new("frieze_letters", me); COLL.objects.link(o)
    print(f"the inscription: {LETTER_SET} on {len(me.polygons)} faces ({n0} cells of {CELL_PX} texels before merging), "
          f"letters {(c1 - c0) * k:.3f} x {(r1 - r0) * k:.3f} m, {k * 1000:.3f} mm a texel, their ends {CAP_GAP:.4f} inside the capitals' "
          f"inner edges at +-{cap_in:.4f}, {DECAL_PROUD * 1000:.0f} mm proud of the band")
    return o
letters = _lettering()

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
_lx = max(abs(v.co.x) for v in letters.data.vertices); _px = min(min(abs(v.co.x) for v in bpy.data.objects[f"frieze_decal_{t}"].data.vertices) for t in "LR")
assert _lx + 0.05 < _px, f"the inscription (to +-{_lx:.3f}) runs into the foliage panels (from +-{_px:.3f})"

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
