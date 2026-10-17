# block_kit.py -- the site block's ground, as a composition lays it in the city's own materials (AI 651, 2026-10-17).
#
# The city leaves its site empty; every composition finishes it with this kit: a sidewalk filling the kerb outline and
# the swept kerb round it, in the city's linked GND_pavement and GND_kerb. Two outlines:
#   full_block()    the kerb rectangle, every corner a curb return of KERB_R (the Bradbury: build_scene.py's
#                   kerbed_pavement("scn_pavement", "scn_kerb", rect(WX, EX, SY, NY)))
#   lotted_block()  the rectangle with a parking lot cut into its back (west) half at road level and a driveway onto
#                   the west street, the kerb running round both, the bays painted in the city's line paint (Terra &
#                   Mar: city_ground.py)
# The pavement reads the object's pad_lo / pad_hi (the kerb rectangle) for its slab joints and the walls' occlusion
# for its grime, so a hero's walls weather its own sidewalk; the kerb carries the `grime` point attribute its
# material reads. The lot's floor is the city's road grid, whose wheel wear the city already clears under the site.
#
# The profile and the corner construction are build_scene.py's (KERB_PROFILE, fillet, outward_normals,
# kerbed_pavement), with fillet taking a radius per corner and rounding concave corners too (city_ground.py).
import math

import bpy
from mathutils import Vector

import city_site as CS

Z_GROUND = CS.Z_GROUND
ROAD_Z = CS.ROAD_Z
PAVE_W = CS.PAVE_W
KERB_R = 5.0                  # the curb return: the kerb line's radius at every street corner
KERB_ROUND = 0.05             # the kerb's rolled top edge
KERB_TOP_W = 0.30             # the kerb's flat top, from the slabs to the rolled edge
KERB_TOP_PROUD = 0.008        # the top stands this much above the slabs
KERB_BURY = 0.08              # the kerb's foot goes this far under the road
ARC_STEP = 0.30               # how finely a curb return is sampled, metres along the arc
KERB_TOP_Z = Z_GROUND + KERB_TOP_PROUD
# (out from the kerb line, height, grime): the slabs' edge, the step up onto the kerb's top, the flat top, the rolled
# edge, the face down to the foot on the asphalt, the buried foot. The face stands on the kerb line (o = 0).
KERB_PROFILE = [(-(KERB_ROUND + KERB_TOP_W), Z_GROUND, 0.0), (-(KERB_ROUND + KERB_TOP_W), KERB_TOP_Z, 0.0), (-KERB_ROUND, KERB_TOP_Z, 0.0)]
KERB_PROFILE += [(-KERB_ROUND + KERB_ROUND * math.cos(a), KERB_TOP_Z - KERB_ROUND + KERB_ROUND * math.sin(a), 0.0)
                 for a in (math.radians(90.0 - 22.5 * j) for j in range(1, 5))]
KERB_PROFILE += [(0.0, ROAD_Z + (KERB_TOP_Z - ROAD_Z) * 0.45, 0.0), (0.0, ROAD_Z, 0.6), (0.0, ROAD_Z - KERB_BURY, 0.6)]
KERB_ROUND_FIRST, KERB_ROUND_FACES = 2, 4       # the rolled edge's quads (after the step's and the top's), shaded smooth

# ---- the parking lot (Terra & Mar, city_ground.py)
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


def city_material(name):
    """A material of the linked city (the library's own, never a local copy of the same name)."""
    m = next((m for m in bpy.data.materials if m.name == name and m.library is not None), None)
    m = m or bpy.data.materials.get(name)
    assert m is not None, f"the city has no material {name}: link the city first"
    return m


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
    # one offset direction per vertex of a closed anticlockwise line: the mitre of its two edges' outward normals,
    # scaled so that it moves each edge by exactly one unit
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


def kerbed(poly, radii, col, kerb_rect, pname="scn_pavement", kname="scn_kerb"):
    """The pavement filling the outline (corners rounded by radii) and its kerb swept round it. kerb_rect is the
    block's kerb rectangle (WX, EX, SY, NY), which the slab joints are laid from."""
    m_pave, m_kerb = city_material("GND_pavement"), city_material("GND_kerb")
    K = fillet(poly, radii); N = outward_normals(K); n, m = len(K), len(KERB_PROFILE)
    inset = KERB_ROUND + KERB_TOP_W                                   # the slabs end where the kerb's top begins
    top = [(K[i][0] - N[i].x * inset, K[i][1] - N[i].y * inset, Z_GROUND) for i in range(n)]
    pav = _mesh(pname, top, [tuple(range(n))], m_pave, lambda q: (q.x, q.y), col)
    WX, EX, SY, NY = kerb_rect
    pav["pad_lo"] = (float(WX), float(SY), 0.0)
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
    kerb = _mesh(kname, verts, faces, m_kerb, uvw, col, attrs={"grime": grime}, smooth=smooth)
    return pav, kerb, s, n


def site_collection(S, name="SITE_GROUND"):
    col = bpy.data.collections.get(name)
    if col is None or col.library is not None:
        col = bpy.data.collections.new(name); S.collection.children.link(col)
    return col


def full_block(S, site, log=print):
    """The Bradbury's block: the whole kerb rectangle, its four corners curb returns."""
    r = site["kerb_rect"]; WX, EX, SY, NY = r["WX"], r["EX"], r["SY"], r["NY"]
    col = site_collection(S)
    _, _, length, n = kerbed([(WX, SY), (EX, SY), (EX, NY), (WX, NY)], [KERB_R] * 4, col, (WX, EX, SY, NY))
    log(f"BLOCK: the full kerb rectangle x {WX:.3f}..{EX:.3f}, y {SY:.3f}..{NY:.3f}; kerb {length:.0f} m, {n} stations")
    return (WX, EX, SY, NY)


def outline(WX, EX, SY, NY):
    """The lotted pavement outline (anticlockwise) and each corner's radius: the kerb rectangle with the lot and its
    driveway cut into the west half."""
    yb, yt = SY + LOT_SIDE_WALK, NY - LOT_SIDE_WALK
    xl = WX + PAVE_W                       # the lot's west kerb line: the west sidewalk is a normal sidewalk wide
    d0, d1 = DRIVE_Y - DRIVE_W / 2.0, DRIVE_Y + DRIVE_W / 2.0
    pts = [((WX, SY), KERB_R), ((EX, SY), KERB_R), ((EX, NY), KERB_R), ((WX, NY), KERB_R),
           ((WX, d1), R_FLARE), ((xl, d1), R_DRIVE_IN), ((xl, yt), R_LOT), ((LOT_X_IN, yt), R_LOT),
           ((LOT_X_IN, yb), R_LOT), ((xl, yb), R_LOT), ((xl, d0), R_DRIVE_IN), ((WX, d0), R_FLARE)]
    return [p for p, _ in pts], [r for _, r in pts], (xl, LOT_X_IN, yb, yt, d0, d1)


def lot_floor_z(x0, x1, y0, y1):
    """The highest point of the linked city's road grid over a box (the lot's floor: the bays lie on it)."""
    road = next(o for o in bpy.data.objects if o.name == "scn_road")
    co = [0.0] * (len(road.data.vertices) * 3); road.data.vertices.foreach_get("co", co)
    zs = [co[3 * i + 2] for i in range(len(road.data.vertices)) if x0 < co[3 * i] < x1 and y0 < co[3 * i + 1] < y1]
    return min(zs), max(zs)


def lotted_block(S, site, log=print):
    """Terra & Mar's block: the outline with the parking lot, and its bays. Returns the lot (x0, x1, y0, y1) and the
    kerb rectangle."""
    r = site["kerb_rect"]; WX, EX, SY, NY = r["WX"], r["EX"], r["SY"], r["NY"]
    col = site_collection(S)
    poly, radii, (xl, xr, yb, yt, d0, d1) = outline(WX, EX, SY, NY)
    _, _, length, n = kerbed(poly, radii, col, (WX, EX, SY, NY))
    log(f"BLOCK: pavement + kerb round a {xr - xl:.1f} x {yt - yb:.1f} m parking lot (x {xl:.1f}..{xr:.1f}, "
        f"y {yb:.1f}..{yt:.1f}) with a {DRIVE_W:.0f} m driveway onto the west street; kerb {length:.0f} m, {n} stations")
    z_lo, z_floor = lot_floor_z(WX - 0.5, xr + 0.5, yb - 0.5, yt + 0.5)
    log(f"BLOCK: the lot's floor = the city's scn_road at z {z_lo:.3f}..{z_floor:.3f}")
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
            if not (ri == 0 and (y < d1 + 1.0 and y + pitch > d0 - 1.0)):
                nb += 1
            y += pitch
        y = ya
        while y <= yz + 1e-6:
            if not (ri == 0 and d0 - 1.0 - pitch < y < d1 + 1.0 + pitch):
                quads.append((ra, rb, y - lw / 2.0, y + lw / 2.0))
            y += pitch
    z = z_floor + PAINT_LIFT
    verts, faces = [], []
    for (a, b, c, d) in quads:
        k = len(verts); verts += [(a, c, z), (b, c, z), (b, d, z), (a, d, z)]; faces.append((k, k + 1, k + 2, k + 3))
    lines = next((o for o in bpy.data.objects if o.name == "city_bay_lines"), None)   # the city's own parking lines: their paint
    assert lines is not None and lines.data.materials, "the linked city has no city_bay_lines (its bay paint)"
    paint = lines.data.materials[0]
    _mesh("tm_lot_bay_lines", verts, faces, paint, lambda q: (q.x, q.y), col)
    log(f"BLOCK: {nb} bays in {len(rows)} rows, {len(quads)} lines in {paint.name}")
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
    if lot is None:
        return True
    xl, xr, yb, yt = lot
    return not (xl - inset < x < xr + inset and yb - inset < y < yt + inset)
