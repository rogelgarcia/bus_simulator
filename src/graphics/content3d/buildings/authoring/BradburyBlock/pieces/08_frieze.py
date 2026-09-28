"""Piece 08 — the BRADBURY frieze band.

A plain stone band over the arch block and the pilaster capitals (z 4.16 ..
4.83), flush with the pilasters' faces and ending 5 cm past their outer
edges (user 2026-09-27: "widen the frieze band just a bit, 5cm; to allow
more room"; the ground-floor entablature over it follows, in
assemble_building.py, P_FRIEZE_HALF).
Between the capitals the inscription "BRADBURY.", the lettering PBR decal
(assets/public/pbr/bradbury_lettering, user 2026-09-22) on a flat mesh 1 mm
proud of the band, cut to the letters' own silhouette. Above each pilaster
capital a flower panel, the frieze flowers PBR decal (assets/public/pbr/
bradbury_frieze_flowers, user 2026-09-27): terracotta acanthus scrolls with
flowers, mirrored on the left and as delivered on the right, laid the same
way as the inscription. The dentil course and cornice above are not part of
this piece.

Frame: x across, y depth (band face at y = -2.90), z up. Collection: FRIEZE.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

FRIEZE_WIDEN = 0.05              # the band runs this much past the pilasters' outer edges on each side (2026-09-27; it ended with them)
BAND_HALF = 2.33 + FRIEZE_WIDEN  # piece 07's X1 plus the widening; assemble_building.py's P_FRIEZE_HALF must match it
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
# The flower panels (user 2026-09-27: "in the download folder there is flowers_pbr, we should use that PBR in place of
# the current 3d flowers. the opposite side should be flipped horizontally"): the pack, installed by
# make_flowers_pbr.py, replaces the procedural foliage relief (a rosette, wavy branches, curling branchlets and lobed
# leaves built as layered flat prisms) that stood over each pilaster since 2026-09-10. They are tinted onto the wall's
# stone like the letters and centred on the band's height like them. The left panel is the image mirrored, the right one
# as delivered, so the scroll that ends in the tall curl stands at the band's ends on both sides (user, same day: "flip
# both images"; they first faced the other way, the curl at the inscription).
# Their size (same day: "increase the size so it uses the same height [as] the writing; a bit higher actually"): each
# panel is FLOWER_HEIGHT_VS_LETTERS the letters' height and runs from FLOWER_LETTER_GAP past the letters to
# FLOWER_END_MARGIN inside the band's end. At the pack's own 3.05 aspect that height would need 1.2 m of width where the
# panel has 0.91, so the ornament is drawn taller than its proportions by the ratio printed below (about 1.33; the
# user: "distorted is ok, just make it really close to the edge; touching the edge"), and its outer leaf tips touch the
# band's end, the mesh clipped there so nothing overhangs it in the Solid view. The first size, the capital's inner
# edge to 3 cm inside the band's end at the pack's aspect, was 0.816 x 0.269 m.
FLOWER_SET = "bradbury_frieze_flowers"
FLOWER_HEIGHT_VS_LETTERS = 1.08  # the panels' height against the letters' (0.368 m): a bit taller than the writing
FLOWER_LETTER_GAP = 0.15         # the panels' inner ends stand this far out from the letters' ends: 0.05 first, then 0.10 ("add a bit more padding
                                 # to the writing"), then 0.15 when the band widened, so the panels kept their size and moved out to its corners
FLOWER_END_MARGIN = 0.0          # and their outer ends this far inside the band's ends: none, the ornament touches them
FLOWER_CELL_PX = 4               # the flower decal's mesh grid, texels (about 2 mm at its size): as CELL_PX, over a larger shape

COLL = ensure_collection("FRIEZE")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)

# ---------------------------------------------------------------- band
bm = bmesh.new(); cube(bm, -BAND_HALF, BAND_HALF, Y_FACE, Y_BACK, Z0, Z1); mesh_from_bm("frieze_band", bm, STONE, COLL)

# ---------------------------------------------------------------- PBR decals on the band: the inscription and the flowers
# (user 2026-09-22: "is there a bradbury pbr texture in the downloads? if so, replace the writing with that pbr image")
# The extruded Arial Black letters and their rims gave way to downloads/bradbury_lettering_PBR.zip, imported as
# assets/public/pbr/bradbury_lettering: a single decal, its relief (bevels, a raised rim, a slightly sunk clay face) in
# the normal map, its letters cut out on the base colour's alpha at 0.5 as its README asks. The row is centred in the
# band and as wide as puts its ends CAP_GAP inside the capitals below (its letters respaced in the image itself, by
# make_lettering_pbr.py), and the mesh follows the letters themselves on
# a CELL_PX grid, dilated a cell past the alpha so the texture, not the mesh, draws the edge; a quad would do for a
# render, but it draws as a solid rectangle in the Solid viewport, where this way the letters show in their own colour.
# The flower panels (2026-09-27) are the same kind of decal and are built by the same two functions.
import numpy as np
cap_in = min(min(abs((o.matrix_world @ v.co).x) for v in o.data.vertices) for o in (bpy.data.objects["pilaster_L_capital"], bpy.data.objects["pilaster_R_capital"]))

def _decal_material(set_name, mat_name):
    """A cut-out PBR decal material from one of the catalog's sets: base colour tinted onto the wall's sandstone (the
    image's opaque texels' mean, linearised, gained per channel onto SANDSTONE_SRGB x LETTER_TONE), AO multiplied in,
    roughness and metalness from arm.png, the OpenGL normal map, and the alpha cut at 0.5. Returns the material, the
    image's size and its alpha, bottom row first as Blender stores it."""
    d = os.path.join(_repo_root(), "assets", "public", "pbr", set_name)
    m = bpy.data.materials.get(mat_name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(mat_name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs[0], out.inputs[0])
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UVMap"
    def tex(fn, cs):
        fp = os.path.join(d, fn); assert os.path.isfile(fp), f"missing {fp}"
        im = bpy.data.images.load(fp, check_existing=True); im.name = "pbr_" + set_name + "_" + os.path.splitext(fn)[0]
        im.colorspace_settings.name = cs
        try: im.filepath = bpy.path.relpath(fp)
        except ValueError: pass
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = im; tn.extension = 'EXTEND'
        nt.links.new(uvn.outputs["UV"], tn.inputs["Vector"]); return tn, im
    base, base_im = tex("basecolor.png", 'sRGB'); arm, _ = tex("arm.png", 'Non-Color'); nrm, _ = tex("normal_gl.png", 'Non-Color')
    # the image, bottom row first as Blender stores it: its alpha gives the decal's box and the mesh's cells, and the
    # opaque texels' mean colour, linearised (the pixels of a byte image come back sRGB encoded), gives the tint
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
    m.diffuse_color = tuple(float(v) for v in wall * 0.8) + (1.0,)                                     # the Solid viewport: a shade under the wall's, or the flat decal vanishes there
    return m, W, H, A

def _alpha_box(A):
    """The opaque texels' box (alpha over 0.5): first column, end column, first row, end row, bottom row first."""
    rows, cols = np.nonzero(A > 0.5)
    return int(cols.min()), int(cols.max()) + 1, int(rows.min()), int(rows.max()) + 1

def _decal_mesh(name, m, W, H, A, k, x_mid, z_mid, cell_px, mirror=False, kz=None, clip_x=None):
    """The decal's mesh, DECAL_PROUD in front of the band: cells of cell_px texels a side over the alpha box and two
    cells beyond it, kept where any texel shows and grown a cell, merged into flat n-gons; k metres a texel across (kz
    up, k unless given), the box's centre at (x_mid, z_mid). mirror lays the image right to left: the geometry mirrored
    in x, the UVs as they were, so the tangent space follows the UVs and the relief mirrors with the picture. clip_x
    cuts the mesh at that x and drops the side away from x_mid, where the dilated cells would overhang an edge."""
    kz = k if kz is None else kz
    c0, c1, r0, r1 = _alpha_box(A)
    s = -1.0 if mirror else 1.0
    g0c, g0r = c0 - 2 * cell_px, r0 - 2 * cell_px
    nc, nr = -(-(c1 - c0 + 4 * cell_px) // cell_px), -(-(r1 - r0 + 4 * cell_px) // cell_px)
    pad = np.zeros((nr * cell_px, nc * cell_px), dtype=np.float32)
    rs, cs_ = slice(max(g0r, 0), min(g0r + nr * cell_px, H)), slice(max(g0c, 0), min(g0c + nc * cell_px, W))
    pad[rs.start - g0r:rs.stop - g0r, cs_.start - g0c:cs_.stop - g0c] = A[rs, cs_]
    keep = pad.reshape(nr, cell_px, nc, cell_px).max(axis=(1, 3)) > 0.02
    grown = keep.copy()
    for dr in (-1, 0, 1):                                                                              # the eight neighbours, without wrapping round the grid
        for dc in (-1, 0, 1):
            grown[max(0, dr):nr + min(0, dr), max(0, dc):nc + min(0, dc)] |= keep[max(0, -dr):nr - max(0, dr), max(0, -dc):nc - max(0, dc)]
    xc, zc = (c0 + c1) / 2.0, (r0 + r1) / 2.0                                                          # the box's centre, texels
    uv_of = lambda q: ((s * (q.x - x_mid) / k + xc) / W, ((q.z - z_mid) / kz + zc) / H)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); vid = {}
    def vert(i, j):                                                                                    # lattice corner (row i, column j)
        if (i, j) not in vid:
            tx, ty = g0c + j * cell_px, g0r + i * cell_px
            vid[(i, j)] = bm.verts.new((x_mid + s * (tx - xc) * k, Y_FACE - DECAL_PROUD, z_mid + (ty - zc) * kz))
        return vid[(i, j)]
    for i, j in zip(*np.nonzero(grown)):
        f = bm.faces.new((vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j)))           # +x then +z: the face looks along -y, out of the wall (turned below when mirrored)
        for l in f.loops: l[uvl].uv = uv_of(l.vert.co)
    n0 = len(bm.faces)
    bm.normal_update()                                                                                 # new faces carry no normal until asked, and the dissolve compares normals: without this it merges nothing
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.1), verts=bm.verts[:], edges=bm.edges[:])   # coplanar cells into a few n-gons; the UVs are linear in place, so they stay exact
    if clip_x is not None:                                                                             # cut at the edge; the part beyond it goes
        out_no = (1.0 if clip_x > x_mid else -1.0, 0.0, 0.0)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(clip_x, 0.0, 0.0), plane_no=out_no, clear_outer=True)
    for f in bm.faces:
        for l in f.loops: l[uvl].uv = uv_of(l.vert.co)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    if sum(p.normal.y for p in me.polygons) > 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); COLL.objects.link(o)
    return o, n0

def _lettering():
    m, W, H, A = _decal_material(LETTER_SET, "PORTAL_lettering")
    c0, c1, r0, r1 = _alpha_box(A)                                                                     # the letters' box, texels
    k = 2.0 * (cap_in - CAP_GAP) / (c1 - c0)                                                            # metres per texel: the row's ends CAP_GAP inside the capitals
    assert (r1 - r0) * k <= (Z1 - Z0) - 2 * LETTER_MARGIN_MIN, f"letters {(r1 - r0) * k:.3f} tall leave the band less than {LETTER_MARGIN_MIN} above and below"
    o, n0 = _decal_mesh("frieze_letters", m, W, H, A, k, 0.0, ZC, CELL_PX)
    print(f"the inscription: {LETTER_SET} on {len(o.data.polygons)} faces ({n0} cells of {CELL_PX} texels before merging), "
          f"letters {(c1 - c0) * k:.3f} x {(r1 - r0) * k:.3f} m, {k * 1000:.3f} mm a texel, their ends {CAP_GAP:.4f} inside the capitals' "
          f"inner edges at +-{cap_in:.4f}, {DECAL_PROUD * 1000:.0f} mm proud of the band")
    return o, (c1 - c0) * k / 2.0, (r1 - r0) * k
letters, letters_half, letters_h = _lettering()

def _flowers():
    m, W, H, A = _decal_material(FLOWER_SET, "PORTAL_frieze_flowers")
    c0, c1, r0, r1 = _alpha_box(A)                                                                     # the ornament's box, texels
    x0, x1 = letters_half + FLOWER_LETTER_GAP, BAND_HALF - FLOWER_END_MARGIN
    k = (x1 - x0) / (c1 - c0)                                                                          # metres per texel across: the letters' gap to the margin at the band's end
    kz = FLOWER_HEIGHT_VS_LETTERS * letters_h / (r1 - r0)                                              # and up: the letters' height, a bit more
    assert (r1 - r0) * kz <= (Z1 - Z0) - 2 * LETTER_MARGIN_MIN, f"the flowers {(r1 - r0) * kz:.3f} tall leave the band less than {LETTER_MARGIN_MIN} above and below"
    xm = (x0 + x1) / 2.0
    left, n0 = _decal_mesh("frieze_flowers_L", m, W, H, A, k, -xm, ZC, FLOWER_CELL_PX, mirror=True, kz=kz, clip_x=-BAND_HALF)   # mirrored horizontally
    right, _ = _decal_mesh("frieze_flowers_R", m, W, H, A, k, xm, ZC, FLOWER_CELL_PX, kz=kz, clip_x=BAND_HALF)                # as delivered
    print(f"the flowers: {FLOWER_SET} on {len(left.data.polygons)} + {len(right.data.polygons)} faces ({n0} cells of "
          f"{FLOWER_CELL_PX} texels a panel before merging), each {(c1 - c0) * k:.3f} x {(r1 - r0) * kz:.3f} m against the "
          f"letters' {letters_h:.3f}, drawn {kz / k:.3f} times taller than the pack's proportions, from +-{x0:.4f} "
          f"({FLOWER_LETTER_GAP:.2f} past the letters) to +-{x1:.3f}; the left mirrored, the right as delivered")
    return left, right
flowers = _flowers()
_lx = max(abs(v.co.x) for v in letters.data.vertices); _px = min(min(abs(v.co.x) for v in o.data.vertices) for o in flowers)
assert _lx < _px, f"the inscription's mesh (to +-{_lx:.3f}) runs into the flower panels' (from +-{_px:.3f})"

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
