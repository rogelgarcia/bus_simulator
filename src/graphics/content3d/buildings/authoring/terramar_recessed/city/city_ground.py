# city_ground.py -- the Terra & Mar block's own ground in the city copy (2026-10-16; user: "complete the side walk in
# the scene using the same materials. and also create the curb with wear ... we can put a parking lot at the back").
#
# The Bradbury's build_scene.py lays the block's pavement as one filled polygon (scn_pavement, GND_pavement: scored
# slabs, per-slab tone, joint dirt, the wall-base grime read as occlusion) inside a swept kerb (scn_kerb, GND_kerb:
# rolled edge, 1 m blocks with joints, foot dirt, tide lines, chips -- the worn kerb), its corners curb returns of 5 m.
# Here that pavement and kerb are REBUILT with the very same materials round a new outline: the block's kerb rectangle
# with a PARKING LOT cut into its back (west) half at road level, opening onto the west street through a driveway
# across the west sidewalk. The kerb runs on round the lot and the driveway, so the lot is edged by the same worn
# kerb as the streets. The lot's floor is the scene's own road grid (scn_road), which under the block already lies
# flat at the gutter's level, in the streets' asphalt (GND_asphalt: patches, cracks; no wheel wear there); its bays
# are painted in the city's own faint line paint (CTX_city_paint), as the city's parking lots are.
#
# The profile and the corner construction are copied from build_scene.py (KERB_PROFILE, fillet, outward_normals,
# kerbed_pavement) so the new kerb is the Bradbury's kerb exactly; fillet here takes a radius per corner and rounds
# concave corners too (the lot's inside corners).
import math

import bpy
from mathutils import Vector

# ---- copied from BradburyBlock/build_scene.py (keep in step if the Bradbury's kerb changes)
Z_GROUND = 0.201
ROAD_Z = -0.08
KERB_R = 5.0
KERB_ROUND = 0.05
KERB_TOP_W = 0.30
KERB_TOP_PROUD = 0.008
KERB_BURY = 0.08
ARC_STEP = 0.30
KERB_TOP_Z = Z_GROUND + KERB_TOP_PROUD
KERB_PROFILE = [(-(KERB_ROUND + KERB_TOP_W), Z_GROUND, 0.0), (-(KERB_ROUND + KERB_TOP_W), KERB_TOP_Z, 0.0), (-KERB_ROUND, KERB_TOP_Z, 0.0)]
KERB_PROFILE += [(-KERB_ROUND + KERB_ROUND * math.cos(a), KERB_TOP_Z - KERB_ROUND + KERB_ROUND * math.sin(a), 0.0)
                 for a in (math.radians(90.0 - 22.5 * j) for j in range(1, 5))]
KERB_PROFILE += [(0.0, ROAD_Z + (KERB_TOP_Z - ROAD_Z) * 0.45, 0.0), (0.0, ROAD_Z, 0.6), (0.0, ROAD_Z - KERB_BURY, 0.6)]
KERB_ROUND_FIRST, KERB_ROUND_FACES = 2, 4
PAVE_W = 4.20

# ---- the lot (block kerb lines read from the scene's scn_pavement: WX, EX, SY, NY)
LOT_X_IN = -12.0              # the lot's east edge (kerb line): 4.4 m clear of the building's west face (x -7.6)
LOT_SIDE_WALK = 5.5           # the sidewalk kept along the south and north streets, kerb line to the lot's kerb line
DRIVE_W = 7.0                 # the driveway across the west sidewalk, centred on the lot
DRIVE_Y = 0.0
R_FLARE = 1.5                 # the driveway's flares at the street kerb (convex for the pavement)
R_DRIVE_IN = 1.0              # the driveway's inner corners (the west sidewalk's tips)
R_LOT = 1.5                   # the lot's own corners (concave for the pavement)
BAY = (2.7, 5.0, 7.0, 0.12)   # pitch, depth, aisle, line width (the city's CITY_BAY, lines a touch finer)
BAY_KEEP = 1.0                # bays keep this far from the lot's kerb lines
PAINT_LIFT = 0.002            # the lines lie this much over the lot's floor


def fillet(poly, radii, step=ARC_STEP):
    # every corner of an anticlockwise polygon replaced by an arc of its radius tangent to both edges: convex corners
    # (left turns) as build_scene.py rounds them, concave ones (right turns) the other way; radius 0 keeps the point
    n, out = len(poly), []
    for i in range(n):
        p, v, q = (Vector(poly[(i + k) % n]) for k in (-1, 0, 1))
        r = radii[i]
        d0 = (v - p).normalized(); d1 = (q - v).normalized()
        turn = math.atan2(d0.x * d1.y - d0.y * d1.x, d0.dot(d1))
        if abs(turn) <= 1e-6 or r <= 0.0:
            out.append((v.x, v.y)); continue
        s = 1.0 if turn > 0.0 else -1.0
        t = r * math.tan(abs(turn) / 2.0)
        t0 = v - d0 * t; c = t0 + Vector((-d0.y, d0.x)) * r * s
        a0 = math.atan2(t0.y - c.y, t0.x - c.x)
        k = max(4, int(math.ceil(r * abs(turn) / step)))
        out += [(c.x + r * math.cos(a0 + turn * j / k), c.y + r * math.sin(a0 + turn * j / k)) for j in range(k + 1)]
    return out


def outward_normals(pts):
    n, out = len(pts), []
    for i in range(n):
        p, v, q = (Vector(pts[(i + k) % n]) for k in (-1, 0, 1))
        e0 = (v - p).normalized(); e1 = (q - v).normalized()
        n0 = Vector((e0.y, -e0.x)); n1 = Vector((e1.y, -e1.x))
        d = 1.0 + n0.dot(n1)
        out.append((n0 + n1) / d if d > 1e-6 else n0)
    return out


def _mesh(name, verts, faces, mat, uvs, col, attrs=None, smooth=()):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    me.uv_layers.new(name="UVMap"); uvl = me.uv_layers.active.data
    for pl in me.polygons:
        for li in pl.loop_indices:
            vi = me.loops[li].vertex_index
            uvl[li].uv = uvs(me.vertices[vi].co) if callable(uvs) else uvs[vi]
    me.materials.append(mat)
    for an, vals in (attrs or {}).items():
        me.attributes.new(an, 'FLOAT', 'POINT').data.foreach_set("value", vals)
    for k in smooth:
        me.polygons[k].use_smooth = True
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    return ob


def outline(WX, EX, SY, NY):
    """The block's pavement outline (anticlockwise) and each corner's radius: the kerb rectangle with the lot and its
    driveway cut into the west half."""
    yb, yt = SY + LOT_SIDE_WALK, NY - LOT_SIDE_WALK
    xl = WX + PAVE_W                       # the lot's west kerb line: the west sidewalk is a normal sidewalk wide
    d0, d1 = DRIVE_Y - DRIVE_W / 2.0, DRIVE_Y + DRIVE_W / 2.0
    pts = [((WX, SY), KERB_R), ((EX, SY), KERB_R), ((EX, NY), KERB_R), ((WX, NY), KERB_R),
           ((WX, d1), R_FLARE), ((xl, d1), R_DRIVE_IN), ((xl, yt), R_LOT), ((LOT_X_IN, yt), R_LOT),
           ((LOT_X_IN, yb), R_LOT), ((xl, yb), R_LOT), ((xl, d0), R_DRIVE_IN), ((WX, d0), R_FLARE)]
    return [p for p, _ in pts], [r for _, r in pts], (xl, LOT_X_IN, yb, yt, d0, d1)


def build(S, log=print):
    """Replace scn_pavement / scn_kerb with the lotted outline, paint the bays, clear the lot's wear. Returns the lot's
    box (x0, x1, y0, y1) and the kerb rectangle."""
    old_p, old_k = bpy.data.objects["scn_pavement"], bpy.data.objects["scn_kerb"]
    lo, hi = tuple(old_p["pad_lo"]), tuple(old_p["pad_hi"])
    WX, SY, EX, NY = lo[0], lo[1], hi[0], hi[1]
    col = old_p.users_collection[0]
    m_pave, m_kerb = old_p.data.materials[0], old_k.data.materials[0]
    for o in (old_p, old_k):
        me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
    poly, radii, (xl, xr, yb, yt, d0, d1) = outline(WX, EX, SY, NY)
    K = fillet(poly, radii); N = outward_normals(K); n, m = len(K), len(KERB_PROFILE)
    inset = KERB_ROUND + KERB_TOP_W
    top = [(K[i][0] - N[i].x * inset, K[i][1] - N[i].y * inset, Z_GROUND) for i in range(n)]
    pav = _mesh("scn_pavement", top, [tuple(range(n))], m_pave, lambda q: (q.x, q.y), col)
    pav["pad_lo"] = (float(WX), float(SY), 0.0)          # the slab joints keep the block's own kerb rectangle
    pav["pad_hi"] = (float(EX), float(NY), 0.0)
    verts, uvw, grime, faces, smooth, s = [], [], [], [], [], 0.0
    for i in range(n):
        if i:
            s += (Vector(K[i]) - Vector(K[i - 1])).length
        t = 0.0
        for j, (o, z, g) in enumerate(KERB_PROFILE):
            if j:
                t += math.hypot(o - KERB_PROFILE[j - 1][0], z - KERB_PROFILE[j - 1][1])
            verts.append((K[i][0] + N[i].x * o, K[i][1] + N[i].y * o, z)); uvw.append((s, t)); grime.append(g)
    for i in range(n):
        a, b = i * m, ((i + 1) % n) * m
        for j in range(m - 1):
            if KERB_ROUND_FIRST <= j < KERB_ROUND_FIRST + KERB_ROUND_FACES:
                smooth.append(len(faces))
            faces.append((a + j, a + j + 1, b + j + 1, b + j))
    _mesh("scn_kerb", verts, faces, m_kerb, uvw, col, attrs={"grime": grime}, smooth=smooth)
    log(f"GROUND: block pavement + kerb rebuilt round a {xr - xl:.1f} x {yt - yb:.1f} m parking lot (x {xl:.1f}..{xr:.1f}, "
        f"y {yb:.1f}..{yt:.1f}) with a {DRIVE_W:.0f} m driveway onto the west street; kerb {s:.0f} m long, {n} stations")

    # the lot's floor: the road grid, flat at the gutter's level under the block; no wheel wear on it
    road = bpy.data.objects["scn_road"].data
    co = [0.0] * (len(road.vertices) * 3); road.vertices.foreach_get("co", co)
    wear = road.attributes["wear"].data
    zs, nw = [], 0
    for vi in range(len(road.vertices)):
        x, y, z = co[3 * vi], co[3 * vi + 1], co[3 * vi + 2]
        if WX - 0.5 < x < xr + 0.5 and yb - 0.5 < y < yt + 0.5:
            zs.append(z)
            if wear[vi].value != 0.0:
                wear[vi].value = 0.0; nw += 1
    log(f"GROUND: the lot's floor = scn_road at z {min(zs):.3f}..{max(zs):.3f}; wear cleared on {nw} vertices")
    z_floor = max(zs)

    # the bays: two rows facing a central aisle, north-south, skipping the driveway's mouth
    pitch, depth, aisle, lw = BAY
    x0 = xl + BAY_KEEP
    rows = [(x0, x0 + depth), (x0 + depth + aisle, x0 + 2 * depth + aisle)]
    if x0 + 2 * depth + aisle + aisle + depth <= xr - BAY_KEEP:     # room for a third row along the east kerb
        rows.append((xr - BAY_KEEP - depth, xr - BAY_KEEP))
    quads = []
    ya, yz = yb + BAY_KEEP, yt - BAY_KEEP
    nb = 0
    for ri, (ra, rb) in enumerate(rows):
        y = ya
        while y + pitch <= yz + 1e-6:
            in_drive = ri == 0 and (y < d1 + 1.0 and y + pitch > d0 - 1.0)
            if not in_drive:
                nb += 1
            y += pitch
        # the lines: one across every bay boundary
        y = ya
        while y <= yz + 1e-6:
            if not (ri == 0 and d0 - 1.0 - pitch < y < d1 + 1.0 + pitch):
                quads.append((ra, rb, y - lw / 2.0, y + lw / 2.0))
            y += pitch
    z = z_floor + PAINT_LIFT
    verts, faces = [], []
    for (a, b, c, d) in quads:
        k = len(verts); verts += [(a, c, z), (b, c, z), (b, d, z), (a, d, z)]; faces.append((k, k + 1, k + 2, k + 3))
    city_lines = bpy.data.objects.get("city_bay_lines")       # the city's own parking lines: their paint, whatever its name
    assert city_lines is not None and city_lines.data.materials, "the scene has no city_bay_lines (the Bradbury city's bay paint)"
    paint = city_lines.data.materials[0]
    _mesh("tm_lot_bay_lines", verts, faces, paint, lambda q: (q.x, q.y), col)
    log(f"GROUND: {nb} bays in {len(rows)} rows, {len(quads)} lines in CTX_city_paint")
    return (xl, xr, yb, yt), (WX, EX, SY, NY)


def inside_sidewalk(x, y, WX, EX, SY, NY, lot, margin=0.4):
    """Is the point on the block's pavement (not past the kerb's top, not in the lot)? The four outer corners are curb
    returns of KERB_R."""
    inset = KERB_ROUND + KERB_TOP_W + margin
    if not (WX + inset < x < EX - inset and SY + inset < y < NY - inset):
        return False
    for cx, cy in ((WX + KERB_R, SY + KERB_R), (EX - KERB_R, SY + KERB_R), (EX - KERB_R, NY - KERB_R), (WX + KERB_R, NY - KERB_R)):
        if (x - cx) * (cx - (WX + EX) / 2) > 0 and (y - cy) * (cy - (SY + NY) / 2) > 0 and math.hypot(x - cx, y - cy) > KERB_R - inset:
            return False
    xl, xr, yb, yt = lot
    return not (xl - inset < x < xr + inset and yb - inset < y < yt + inset)
