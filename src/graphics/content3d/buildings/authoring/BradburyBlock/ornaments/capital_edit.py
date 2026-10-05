"""Ornament -- the pilaster capital, EDITING COPY (2026-09-28): the carving is developed here while the production
capital (ornaments/capital.py -> capital.blend, mesh `capital`, linked by the portal and by every column and springing
capital of the building) stays untouched. Once approved, the carving moves into capital.py.

Stage 2, in progress: the carving from the line drawing ornaments/capital_drawing.svg, a trace of the reference photo
tests/artifacts/screens/bradbury_fix/references/capital_ref.png, built by carving.py (every drawn line becomes a chain
of mesh edges with its own cross-section). Built so far: the seven-point leaf (the inner leaves' model, flat beside the
capital) and the corner leaf, wrapped round the bell's right front corner.

The blank is photo-proportioned, not the production one. The photo is a true elevation (the shaft edges sit at x 248
and 1286 on every row, the abacus top at y 112, everything centres on x 767), so the trace needs no straightening; at
the pilaster's width (1038 px of shaft = 0.725 m, 0.698 mm/px) the photo's capital is 0.515 m tall with a 0.396 m bell,
against 0.41 and 0.248 m for capital_v2. The user split the difference 50/50: the whole design (blank and drawing) is
scaled vertically by VSCALE 0.898, so the capital is 0.463 m tall, half-way between the two. Depth is not in the photo:
the relief heights below are readings, to be adjusted.

Frame: x across the face, y depth (the street at -y), z up from the neck bottom (the photo's y 850).
File: ornaments/capital_edit.blend; renders: screens .../ornaments/capital_edit_*.png.
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\ornaments"
LIB = os.path.join(os.path.dirname(HERE), "portal_lib.py")
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))
CARVING = os.path.join(HERE, "carving.py")
exec(compile(open(CARVING, encoding="utf-8").read(), CARVING, "exec"))

DRAWING = os.path.join(HERE, "capital_drawing.svg")
AXIS_PX, BASE_PX, M_PER_PX = 767.0, 850.0, 0.725 / 1038.0
H_PHOTO, H_PROD = (BASE_PX - 112.0) * M_PER_PX, 0.41    # 0.515: the photo's capital at the pilaster's width; the production one
VSCALE = (H_PHOTO + H_PROD) / 2 / H_PHOTO               # 0.898, the user's 50/50 (2026-09-28): half a taller capital, half a squashed design -> 0.463 m
W, D = 0.725, 0.85                                      # pilaster footprint, as the production capital
def px(x, y): return ((x - AXIS_PX) * M_PER_PX, (BASE_PX - y) * M_PER_PX * VSCALE)
def zpx(y): return px(0, y)[1]

# levels read off the photo (pixel rows): neck bottom 850, fillet 800..785, torus 785..730, bell 730..163, abacus 163..112
Z_COVE, Z_FILLET, Z_BELL, Z_ABACUS, Z_TOP = zpx(800), zpx(785), zpx(730), zpx(163), zpx(150)
H = zpx(112)
BELL_TOP_HALF = 0.455                                   # the bell under the abacus; the volutes and leaves stand past it
ABACUS_HALF = px(1516, 0)[0]                            # 0.523: the abacus band's face

bpy.ops.wm.read_homefile(use_empty=True)
COLL = ensure_collection("CAPITAL_EDIT")
CARVED = mat_plain("EDIT_terracotta", (0.46, 0.20, 0.12), 0.72)   # plain clay while the carving is judged: the portal's sandstone bump drowns fine relief
CARVED.diffuse_color = (0.62, 0.42, 0.33, 1.0)

BELL_K = 14                                             # the bell's loft: rings at t = k / BELL_K, straight between them
def bell_outline(t, half=False):
    """The bell's plan outline at t (0 at its foot on the torus .. 1 under the abacus): concave faces, flaring from the
    pilaster's footprint to BELL_TOP_HALF, with 45-degree corner cuts growing as t**2. From the back of the right side
    face round the front to the back of the left one; `half`: only as far as the front's middle (the right corner)."""
    yf = -D / 2; yb = yf + CAPITAL_DEPTH * W
    f, s_max, c_max, m = BELL_TOP_HALF - W / 2, 0.05 * W, 0.09 * W, 10
    fk = f * t ** 0.8; sk = s_max * t * t; c = max(c_max * t * t, 0.002); xr = W / 2 + fk; yk = yf - fk; r2 = math.sqrt(2)
    ys = yk + c
    right = []
    for i in range(m):
        v = i / m; right.append((xr - sk * math.sin(math.pi * v), yb + (ys - yb) * v))
    for i in range(4):
        u = i / 3; bul = 0.10 * c * math.sin(math.pi * u)
        right.append((xr - c * u + bul / r2, ys - c * u - bul / r2))
    xe = xr - c
    for i in range(1, m + 1):
        u = 0.5 * i / m; right.append((xe - 2 * xe * u, yk + sk * math.sin(math.pi * u)))
    if half: return right
    left = [(-x, y) for (x, y) in reversed(right[:-1])]
    return right + left

# ---------------------------------------------------------------- blank: capital_v2's construction at the photo's levels
def blank(name):
    """Neck (cove, fillet, torus) swept round the front and both sides; bell lofted from the footprint, flaring from
    low down as the photo's leaves do, concave in plan with 45-degree corner cuts; abacus (soffit, cove, band with a rounded top edge)
    swept along the bell's top outline. Returns the object and a BVH of the bell alone (the wrap's surface)."""
    bm = bmesh.new()
    yf = -D / 2; yb = yf + CAPITAL_DEPTH * W
    cove_o, fil_o, tor_o = px(227, 0)[0] - px(248, 0)[0], 0.019, px(248, 0)[0] - px(208, 0)[0]
    cove_o = abs(cove_o); tor_o = abs(tor_o)
    prof = [(0.0, 0.0)]
    for k in range(1, 9):
        t = math.pi / 2 * k / 8
        prof.append((cove_o * (1 - math.cos(t)), Z_COVE * math.sin(t)))
    prof += [(fil_o, Z_COVE), (fil_o, Z_FILLET)]
    zc, rz, ro = (Z_FILLET + Z_BELL) / 2, (Z_BELL - Z_FILLET) / 2, tor_o - fil_o
    for k in range(1, 12):
        t = math.pi * k / 12
        prof.append((fil_o + ro * math.sin(t), zc - rz * math.cos(t)))
    prof += [(fil_o, Z_BELL), (0.0, Z_BELL)]
    path = [(W / 2, yb), (W / 2, yf), (-W / 2, yf), (-W / 2, yb)]
    sweep(bm, path, prof, 0.0)
    v0 = [bm.verts.new((x, y, 0.0)) for x, y in path]; v1 = [bm.verts.new((x, y, Z_BELL)) for x, y in path]
    bm.faces.new(tuple(reversed(v0))); bm.faces.new(tuple(v1))
    for i in range(len(path)): bm.faces.new((v0[i], v0[(i + 1) % len(path)], v1[(i + 1) % len(path)], v1[i]))

    K, outline = BELL_K, bell_outline
    bb = bmesh.new()
    levels = []
    for k in range(K + 1):
        t = k / K; z = Z_BELL + (Z_ABACUS - Z_BELL) * t
        levels.append([bb.verts.new((x, y, z)) for x, y in outline(t)])
    n = len(levels[0])
    for k in range(K):
        A, B = levels[k], levels[k + 1]
        for i in range(n): bb.faces.new((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
    bb.faces.new(tuple(reversed(levels[0]))); bb.faces.new(tuple(levels[-1]))
    bb.normal_update()
    bvh = BVHTree.FromBMesh(bb)
    tmp = bpy.data.meshes.new("_bell"); bb.to_mesh(tmp); bb.free(); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)

    top = outline(1.0); proj = ABACUS_HALF - BELL_TOP_HALF
    cove, r_top = 0.012, 0.004
    aprof = [(0.0, Z_ABACUS), (proj - cove, Z_ABACUS)]
    for k in range(1, 7):
        t = math.pi / 2 * k / 6
        aprof.append((proj - cove + cove * math.sin(t), Z_ABACUS + (Z_TOP - Z_ABACUS) * (1 - math.cos(t))))
    aprof.append((proj, H - r_top))
    for k in range(1, 7):
        t = math.pi / 2 * k / 6
        aprof.append((proj - r_top + r_top * math.cos(t), H - r_top + r_top * math.sin(t)))
    aprof.append((0.0, H))
    sweep(bm, top, aprof, 0.0)
    c0 = [bm.verts.new((x, y, Z_ABACUS)) for x, y in top]; c1 = [bm.verts.new((x, y, H)) for x, y in top]
    bm.faces.new(tuple(reversed(c0))); bm.faces.new(tuple(c1))
    for i in range(n): bm.faces.new((c0[i], c0[(i + 1) % n], c1[(i + 1) % n], c1[i]))
    o = mesh_from_bm(name, bm, CARVED, COLL, smooth=True)
    mark_sharp(o, 18.0)
    return o, bvh

BLANK, BELL = blank("capital_edit")

# ---------------------------------------------------------------- wrap: along the view axis onto the bell
_cache = {}
FLAT_PAST = 0.025                                       # the photo's corner leaves face front a little past the bell's edge
def surf_y(u, v):
    """The bell's front surface at (u, v) seen from the street. Past its silhouette the surface runs on flat for
    FLAT_PAST (the corner leaf stands proud of the corner there), then turns back round the corner at 45 degrees, so
    the part of a leaf drawn on the return follows it."""
    key = (round(u, 4), round(v, 4))
    if key in _cache: return _cache[key]
    hit = BELL.ray_cast(Vector((u, -5.0, v)), Vector((0.0, 1.0, 0.0)))
    if hit[0] is not None: y = hit[0].y
    else:
        lo, hi = 0.0, u
        for _ in range(24):
            mid = (lo + hi) / 2
            if BELL.ray_cast(Vector((mid, -5.0, v)), Vector((0.0, 1.0, 0.0)))[0] is not None: lo = mid
            else: hi = mid
        y = BELL.ray_cast(Vector((lo, -5.0, v)), Vector((0.0, 1.0, 0.0)))[0].y + max(0.0, abs(u) - abs(lo) - FLAT_PAST)
    _cache[key] = y
    return y
def wrap(u, v, w): return (u, surf_y(u, v) - w, v)

# ---------------------------------------------------------------- leaves: standalone objects grown round their spines (user 2026-09-29)
# Built from the spines outward. Each spine is `curl_vein`: it leaves its base straight up and turns steadily toward its
# point, its tangent angle growing as (length)**VEIN_CURL (the user chose 2.5, curling late and hard). Round each spine
# grows a leaflet (`grow_leaf`), and the leaflets fuse by a tight smooth union into the leaf's outline; the body is a
# somewhat flat plate (not contoured round its veins, user) with its veins cut in as fine lines; the leaf is its own
# closed object (user: not on a plane). Flat frame: s across (0 = midrib), t up from the foot, w out of the leaf.
DRAW = read_drawing(DRAWING)                            # the capital's line drawing, for the front-face elements still to come
VEIN_CURL = 2.5
TIP_CAP = 1.3                                           # a leaflet runs on past its spine's end for this many times its tip half-width
LINE_COL = {"outline": (0.02, 0.02, 0.02), "eye": (0.10, 0.10, 0.45), "ridge": (0.95, 0.35, 0.05), "groove": (0.0, 0.62, 0.45), "crease": (0.9, 0.8, 0.05)}
def proof_mat(name, rgb):
    m = mat_plain(name, rgb, 0.6); m.diffuse_color = (*rgb, 1.0); return m
def leaflet_thick(a): return 0.006 * (1.0 - 0.35 * a)  # the leaflet's body at its spine: 6 mm at the foot, thinner toward its end
def leaflet(spine, wmax, rise, peak, tip):
    """One leaflet round its spine. Its field runs on past the spine's end along the end's direction: half-width 4 mm at
    the spine's base, staying narrow low down (`rise`) and swelling to wmax at `peak` of the way along the spine (so the
    notches between leaflets cut deep, user: "carve the leaves a bit more"), easing to tip x wmax at the spine's end, then
    closing over the run-on to a point, its sides only slightly convex (user: "a bit less rounded", then "make all edges
    more pointy"), thinning with it."""
    L = sum(math.dist(p, q) for p, q in zip(spine, spine[1:]))
    w_tip = tip * wmax; cap = TIP_CAP * w_tip; a_end = L / (L + cap)
    (px, py), (ex, ey) = spine[-2], spine[-1]; d = math.dist(spine[-2], spine[-1]); tx, ty = (ex - px) / d, (ey - py) / d
    run_on = spine + [(ex + tx * cap * k / 8, ey + ty * cap * k / 8) for k in range(1, 9)]
    def width(a):
        if a <= a_end:
            u = a / a_end
            if u <= peak: return 0.004 + (wmax - 0.004) * math.sin(0.5 * math.pi * u / peak) ** rise
            return wmax - (wmax - w_tip) * ((u - peak) / (1.0 - peak)) ** 2
        c = (a - a_end) / (1.0 - a_end)
        return max(0.0005, w_tip * (1.0 - c ** 1.25) ** 0.85)
    def thick(a):
        return leaflet_thick(a / a_end) if a <= a_end else leaflet_thick(1.0) * (width(a) / w_tip) ** 0.7
    return {"spine": run_on, "width": width, "thick": thick}
def cut_below(spine, t_stop):
    """The part of a spine above height t_stop (the spine rises from its base to its point)."""
    if t_stop <= 0.0: return spine
    for i in range(1, len(spine)):
        if spine[i][1] >= t_stop:
            (u0, v0), (u1, v1) = spine[i - 1], spine[i]; f = (t_stop - v0) / ((v1 - v0) or 1e-12)
            return [(u0 + (u1 - u0) * f, t_stop)] + spine[i:]
    return spine[-2:]
LEAF_EDGE = 0.0035                                      # the plate rounds over this far in from its edge
LEAF_SOLID_SPEC = {"cushion": (0.0, 0.004), "fade": 0.012, "rim": 0.0016, "sharp_supports": True,
                   "roll": (0.0, [(0.0, 1.0), (0.0012, 0.5), (0.0025, 0.2), (0.0035, 0.0)]),   # the roll carries no depth: its knots only lay rows for the plate's round-over
                   "groove": (0.0010, [(0.0, 1.0), (0.0003, 0.75), (0.0008, 0.0)])}         # each vein a fine incised line: a V 1.6 mm across and 1 mm deep, crisp-edged (user: "the vein is too thick" -- the photo's veins are hairline cuts)

def make_leaf(name, points, bases, shape, vein_stop, foot, place, coll, proof_coll, location=(0.0, 0.0, 0.0), sinus=None,
              depth=1.0, taper=None, back_vein=None, back_extra=None, cut=None, carve=None, strip=None):
    """One leaf. points / bases / shape / vein_stop, per spine key, for the right-hand spine (the left one mirrors it;
    key "centre" is on the midrib): the spine's end, its base (s, t), its leaflet's shape (greatest half-width, rise,
    peak, tip), the height below which its carved vein is cut off (0 = its whole spine). foot: (half-width at the foot,
    the half-width it narrows to, its height) for a trumpet flare at the foot, a straight stem when the two are equal,
    or None. sinus: {(inner key, outer key): (s, t)} -- neighbouring leaflets joined by a web down to a notch whose bottom
    is at (s, t) (right side; the left mirrors), or None for notches cut as deep as the leaflets leave them. depth scales
    the plate's thickness; taper(s, t), a factor on it (a rolled tip thins); back_vein (t from, t to): the
    midrib's vein cut into the back too, where the back shows (a rolled tip's outside); back_extra(t): thickness added
    to the back (a rolled tip swelling to fill its coil); cut: the outline trimmed flat at this height (a tip that
    would end in a point inside a coil ends blunt); carve: the relief cut as a carver would (user 2026-09-30: "think
    this as a manual work of art ... the leaves follow a superposition. and their sides may be flatten, or carved
    inside in a triangle shape"), a dict: "crest" -- every vein runs along the crest of a pipe standing that high off
    the plate, whose flanks are PLANES sloping to the V valley midway to the next pipe (a chisel cut, not a rounded
    rib); "spread" ({key: s at the foot}, merge height) -- the pipes fan across the stem at the foot and merge into
    their veins by that height; "profile" -- a leaflet's side toward the leaf's edge is "flat" (the plane runs on
    down to the edge) or "hollow" (scooped: the plane dives to a V "hollow_at" of the way to the edge, then rises to
    a rim "rim" high at it: the side carved in a triangle); "over" -- None, or "in" (the centre pipe lies over the
    next outward, and so on) or "out" (the outer lobes lie over the inner), each pipe "stack" higher than the one
    under it, its ledge running "overlap" past their valley before stepping down, the steps fading in above
    "stack_from" (the stem's pipes stay level); "tip_fade" -- the fraction of each pipe's height over which it eases
    out at its leaflet's tip. The valleys are drawn as hairline grooves and the steps and hollows as creases, so
    every plane meets the next on a mesh edge. Or "mode": "strips" (user: "think of each leaflet is a strip, that was
    molded to become a leaflet. and they merge at the center bottom. the deeper carvings come from those
    superpositioned strips ... work one strip at a time"): one strip per leaflet along its spine ("spread" at the
    foot), "w_foot" half-wide at the foot and its leaflet's own width in the leaflet, a moulded half-round section
    "thick" high (thinning to half at the tip), laid one at a time in the order "over" ("out": the centre strip first,
    the upper pair over it, the lower pair over those; "in": the reverse), each riding on the strips beneath it at its
    crest, so its edges lie over its neighbours with a step and a crease (the deep carvings); "count" lays only the
    first strips (a progression). The strips' visible edges and crests are drawn lines (creases and veins).
    strip (half-width at the foot, thickness at the crest, section "round" | "roof"): the leaf built as a moulded STRIP
    (user 2026-09-30, "lets start new. create just the center leaf with the scroll"): its leaflet field is at least that
    half-wide, so the strip runs up from the foot at that width and swells into the leaflet, and its body is not the
    plate but a moulded section that thick at the spine, falling to the edges.
    place(s, t, w) -> (x, y, z); the object and its proof lines (the carved veins as tubes, standing just off the face,
    and the wireframe) go to `location`. Returns (object, outline)."""
    keys, spines, by = [], [], {}
    for k in points:
        for sd in ((1,) if k == "centre" else (-1, 1)):
            (bs, bt), (ps, pt) = bases[k], points[k]
            keys.append(k); spines.append(curl_vein((sd * bs, bt), (sd * ps, pt), VEIN_CURL)); by[(k, sd)] = spines[-1]
    leaflets = [leaflet(sp, *shape[k]) for sp, k in zip(spines, keys)]
    if strip:                                            # a strip: at least this wide all the way up, until the leaflet's own width takes over
        for lf in leaflets:
            w0 = lf["width"]; lf["width"] = (lambda a, w0=w0: max(w0(a), strip[0]) if a < 0.9 else w0(a))
    if foot:
        fw0, fw1, fh = foot
        leaflets.append({"spine": [(0.0, 0.0), (0.0, fh / 2), (0.0, fh)],
                         "width": lambda a: fw1 + (fw0 - fw1) * (1.0 - a) ** 2.2, "thick": lambda a: 0.006})
    webs = [web_polygon(by[(a, 1 if a == "centre" else sd)], by[(b, sd)], (sd * ss, st))
            for (a, b), (ss, st) in (sinus or {}).items() for sd in (-1, 1)]
    top = max(pt for ps, pt in points.values()) + 0.05; reach = max(0.12, max(ps for ps, pt in points.values()) + 0.05)
    outline, _, _ = grow_leaf(leaflets, (-reach, -0.002, reach, top), cell=0.0005, soft=0.0008, foot=0.0, webs=webs, top=cut)   # a tight union: the notches stay cut, not filleted up
    edge = SegIndex(0.01); edge.add(0, resample(outline, True, 0.001), True)
    O = np.array(outline); Q = np.roll(O, -1, axis=0); _xcache = {}
    def crossings(t):
        """The outline's s where it crosses height t, sorted."""
        key = round(t, 4)
        if key not in _xcache:
            m = (O[:, 1] <= t) != (Q[:, 1] <= t)          # half-open: a crossing on a vertex counts once
            f = (t - O[m, 1]) / (Q[m, 1] - O[m, 1]); _xcache[key] = np.sort(O[m, 0] + f * (Q[m, 0] - O[m, 0]))
        return _xcache[key]
    def edge_beyond(t, s0, direction):
        """The outline's first crossing beyond s0 in `direction` at height t, or None."""
        x = crossings(t); x = x[x > s0 + 1e-6] if direction > 0 else x[x < s0 - 1e-6]
        if len(x) == 0: return None
        return float(x[0] if direction > 0 else x[-1])
    veins = [cut_below(sp, vein_stop[k]) for sp, k in zip(spines, keys)]
    valley_lines, crease_lines = [], []                  # the carving's own lines: valleys (hairline grooves), steps and hollows (creases)
    carve_h = lambda s, t: 0.0
    if carve:
        def s_at(line, t):
            """A rising polyline's s at height t (its first point's s below its start, its last point's above its end)."""
            if t <= line[0][1]: return line[0][0]
            for (u0, v0), (u1, v1) in zip(line, line[1:]):
                if v0 <= t <= v1: return u0 + (u1 - u0) * (t - v0) / ((v1 - v0) or 1e-12)
            return line[-1][0]
        H = carve.get("crest", 0.0); prof = carve.get("profile", "flat"); a_h = carve.get("hollow_at", 0.45); rim = carve.get("rim", 0.0)
        over = carve.get("over"); stack = carve.get("stack", 0.0); ovl = carve.get("overlap", 0.0); s_from = carve.get("stack_from", 0.0)
        tip_fade = carve.get("tip_fade", 0.15); spread, t_merge = carve.get("spread") or ({}, 0.0)
        rank = {k: i for i, k in enumerate(sorted(points, key=lambda k: bases[k][0]))}   # 0 = the centre, outward
        n_lv = len(rank)
        def level(k): return (n_lv - 1 - rank[k]) if over == "in" else rank[k] if over == "out" else 0
        pipes = []                                       # (key, side, line, t_base, t_top): one pipe under each vein, fanned toward the foot
        for (k, sd), sp in by.items():
            foot_s = sd * spread.get(k, bases[k][0]) - sd * bases[k][0]
            line = [(s_at(sp, t) + foot_s * (1.0 - (smoothstep(t / t_merge) if t_merge > 0 else 1.0)), t) for t in np.arange(0.0, sp[-1][1], 0.002)] + [sp[-1]]
            pipes.append((k, sd, line, sp[0][1], sp[-1][1]))
        veins = [cut_below(p[2], vein_stop[p[0]]) for p in pipes]     # the veins run along the pipes' crests (fanned with them at the foot) ...
        for p in pipes:                                              # ... and below each vein's start the crest is a crease, so the fold has a mesh edge
            below = [q for q in p[2] if q[1] <= vein_stop[p[0]]]
            if len(below) > 1: crease_lines.append(below)
        def pipes_at(t): return sorted(((s_at(p[2], t), i) for i, p in enumerate(pipes) if t <= p[4]), key=lambda x: x[0])
        strip_mode = carve.get("mode") == "strips"
        if strip_mode:
            w_foot, thick0, count = carve.get("w_foot", 0.008), carve.get("thick", 0.004), carve.get("count", 99)
            section = carve.get("section", "round"); hol_at, rim = carve.get("hollow_at", 0.45), carve.get("rim", 0.0015)
            band0, band_len = carve.get("foot_band", (0.025, 0.035)); fade_above = carve.get("fade_above"); riser = carve.get("riser", 0.0007)
            order = sorted(range(len(pipes)), key=lambda i: (rank[pipes[i][0]] if over != "in" else -rank[pipes[i][0]], pipes[i][1]))
            laid = order[:count]                         # the strips in laying order: the first is under all the others
            def leaf_of(i):
                k, sd = pipes[i][0], pipes[i][1]
                for j, (kk, sp) in enumerate(zip(keys, spines)):
                    if kk == k and (k == "centre" or (sp[-1][0] > 0) == (sd > 0)): return leaflets[j]
            crest = {}                                   # each strip's crest: ONE natural curve from its foot point to its spine's end, then the leaflet's run-on
            for i, (k, sd, line, tb, tt) in enumerate(pipes):
                lf = leaf_of(i); run = lf["spine"]; sp = by[(k, sd)]
                c = curl_vein((sd * spread.get(k, bases[k][0]), 0.0), sp[-1], VEIN_CURL) + run[len(sp):]
                cum = [0.0]
                for a_, b_ in zip(c, c[1:]): cum.append(cum[-1] + math.dist(a_, b_))
                crest[i] = (c, cum, lf["width"]); pipes[i] = (k, sd, c, 0.0, c[-1][1])   # the pipe line is the crest: veins and creases follow it
            def frac_at(i, t):
                c, cum, _ = crest[i]
                if t <= c[0][1]: return 0.0
                for n, ((u0, v0), (u1, v1)) in enumerate(zip(c, c[1:])):
                    if v0 <= t <= v1: return (cum[n] + (cum[n + 1] - cum[n]) * (t - v0) / ((v1 - v0) or 1e-12)) / cum[-1]
                return 1.0
            def strip_w(i, t):
                m = smoothstep(t / t_merge) if t_merge > 0 else 1.0
                return w_foot * (1.0 - m) + crest[i][2](frac_at(i, t)) * m
            def run_out(t):
                """The plain band at the foot, the cuts running out above it (both photos); nothing enters the roll."""
                r = smoothstep((t - band0) / band_len)
                if fade_above: r *= smoothstep((fade_above[0] + fade_above[1] - t) / fade_above[1])
                return r
            def strip_thick(i, t):
                tt = pipes[i][4]
                return thick0 * (1.0 - 0.5 * smoothstep(t / (tt or 1e-9))) * smoothstep((tt - t) / (tip_fade * tt or 1e-9))
            def strip_section(u):
                """The moulded strip's section across its half-width (u = 0 at the crest, 1 at the edge), as a fraction of its
                thickness: "round" (a half-round), "roof" (a sharp crest, planar flanks: the sides flattened) or "hollow"
                (the flank dives to a V at hol_at, then rises to a rim: the sides carved in a triangle)."""
                if section == "round": return math.sqrt(max(0.0, 1.0 - u * u))
                if section == "hollow": return (1.0 - u / hol_at) if u <= hol_at else (rim / thick0) * (u - hol_at) / (1.0 - hol_at)
                return max(0.0, 1.0 - u)
            _bcache = {}
            def h_upto(n, s, t):
                """The strips laid[:n] composed at (s, t): a rigid strip rests on the highest point beneath its width and keeps
                its own section, so its edges stand as steps over its neighbours (never dipping under them)."""
                h = 0.0
                for m_, i in enumerate(laid[:n]):
                    tt = pipes[i][4]
                    if t > tt: continue
                    sc = s_at(pipes[i][2], t); w = strip_w(i, t); d = abs(s - sc)
                    if d > w: continue
                    key = (i, round(t, 4))
                    if key not in _bcache: _bcache[key] = max(h_upto(m_, sc + w * j / 4, t) for j in range(-4, 5))
                    h = max(h, _bcache[key] + strip_thick(i, t) * strip_section(d / w))
                return h
            def strips_h(s, t): return run_out(t) * h_upto(len(laid), s, t)
            def covered_later(m_, s, t):
                """Is (s, t) inside a strip laid after the m_-th?"""
                for i in laid[m_ + 1:]:
                    if t <= pipes[i][4] and abs(s - s_at(pipes[i][2], t)) <= strip_w(i, t): return True
                return False
        def stackf(t): return smoothstep((t - s_from) / 0.03) if over else 0.0
        def base(i, t): return stack * level(pipes[i][0]) * stackf(t)
        def section(i, t, d, W, to_edge):
            """Pipe i's height at distance d from its crest, its flank W long (to the valley, or to the edge)."""
            u = d / W if W > 1e-6 else 1.0
            if to_edge and prof == "hollow": h = H * (1.0 - u / a_h) if u <= a_h else rim * (u - a_h) / (1.0 - a_h)
            else: h = H * (1.0 - min(u, 1.0))
            k, sd, line, tb, tt = pipes[i]
            return max(h, 0.0) * smoothstep((tt - t) / (tip_fade * (tt - tb) or 1e-9))
        def carve_h(s, t):
            if strip_mode: return strips_h(s, t)
            P = pipes_at(t)
            if not P: return 0.0
            left = [q for q in P if q[0] <= s]; right = [q for q in P if q[0] >= s]
            if left and right:
                (sa, ia), (sb, ib) = left[-1], right[0]
                if ia == ib: return base(ia, t) + section(ia, t, 0.0, 1.0, False)
                xa = edge_beyond(t, sa, 1)
                if xa is not None and xa < sb:           # the outline passes between the two pipes (a notch): each faces the edge
                    if s <= xa: return base(ia, t) + section(ia, t, s - sa, xa - sa, True)
                    xb = edge_beyond(t, sb, -1)
                    return base(ib, t) + section(ib, t, sb - s, sb - xb, True)
                mid = (sa + sb) / 2; Wa, Wb = mid - sa, sb - mid; da, db = s - sa, sb - s
                la, lb = level(pipes[ia][0]), level(pipes[ib][0])
                if over and la != lb:                    # superposed: the upper pipe's ledge runs `overlap` past the valley, then steps down
                    top, oth, d_top, W_top, d_oth, W_oth = (ia, ib, da, Wa, db, Wb) if la > lb else (ib, ia, db, Wb, da, Wa)
                    if d_top <= W_top + ovl * stackf(t): return base(top, t) + section(top, t, min(d_top, W_top), W_top, False)
                    return base(oth, t) + section(oth, t, d_oth, W_oth, False)
                i, d, W = (ia, da, Wa) if da / Wa <= db / Wb else (ib, db, Wb)
                return base(i, t) + section(i, t, d, W, False)
            sp_, i = left[-1] if left else right[0]; direction = 1 if left else -1
            xe = edge_beyond(t, sp_, direction); W = abs(xe - sp_) if xe is not None else 0.03
            return base(i, t) + section(i, t, abs(s - sp_), W, True)
        if strip_mode:                                   # the strips' visible edges are creases; the veins run along the laid strips' crests
            veins = [cut_below(pipes[i][2], vein_stop[pipes[i][0]]) for i in laid]
            del crease_lines[:]                          # the crest creases were added for every pipe; only the laid strips get them
            for i in laid:
                below = [q for q in pipes[i][2] if band0 <= q[1] <= vein_stop[pipes[i][0]]]
                if len(below) > 1: crease_lines.append(below)
            for m_, i in enumerate(laid):                # each visible strip edge, and the wall's foot just outside it
                k, sd, line, tb, tt = pipes[i]
                for direction in (-1, 1):
                    for off in (0.0, riser):
                        run = []
                        for t in np.arange(band0, tt - tip_fade * tt, 0.0025):
                            q = (s_at(line, t) + direction * (strip_w(i, t) + off), t)
                            if inside(q, outline) and not covered_later(m_, q[0], t) and edge.near(q, 0.002) == {}: run.append(q)
                            else:
                                if len(run) > 1: crease_lines.append(run)
                                run = []
                        if len(run) > 1: crease_lines.append(run)
        # the lines: valleys between the sinus pairs (hairline grooves), the steps beside them and the hollows' bottoms (creases)
        for (a, b), (ss, st) in ({} if strip_mode else (sinus or {})).items():
            for sd in (-1, 1):
                A = next(p for p in pipes if p[0] == a and (p[1] == sd or a == "centre")); B = next(p for p in pipes if p[0] == b and p[1] == sd)
                ts = np.arange(0.0, st - 0.006, 0.0025)
                mids = [((s_at(A[2], t) + s_at(B[2], t)) / 2, t) for t in ts]
                valley_lines.append(mids)
                if over and level(a) != level(b) and ovl > 0:
                    toward = (1 if s_at(B[2], st / 2) > s_at(A[2], st / 2) else -1) * (1 if level(a) > level(b) else -1)   # from the valley toward the lower pipe
                    run = [(m + toward * ovl * stackf(t), t) for (m, t) in mids if stackf(t) > 0.02]
                    if len(run) > 1: crease_lines.append(run)
        if prof == "hollow" and not strip_mode:
            for i, (k, sd, line, tb, tt) in enumerate(pipes):
                for direction in (-1, 1):
                    run = []
                    for (sp_, t) in line[::2]:
                        P = pipes_at(t); nb = [q for q in P if (q[0] - sp_) * direction > 1e-6]
                        xe = edge_beyond(t, sp_, direction)
                        faces_edge = xe is not None and (not nb or abs(nb[0][0] - sp_) > abs(xe - sp_))
                        if faces_edge and t < tt - tip_fade * (tt - tb): run.append((sp_ + direction * a_h * abs(xe - sp_), t))
                        else:
                            if len(run) > 1: crease_lines.append(run)
                            run = []
                    if len(run) > 1: crease_lines.append(run)
    if strip:
        def body(s, t):
            """A moulded strip: a section `thick` high at its crest (the midrib), falling to its edges, whatever width the
            outline gives it at that height; "round" is a half-ellipse, "roof" two planes. Through its head (from the
            shoulder up, strip[3]) the section becomes the accepted plate -- uniform, rounded over its last 3.5 mm --
            so the rolled leaflet and its scroll are exactly the accepted ones (a section thinning to the edges made
            the coiled edges a thin cone that the knob's tips poked through: "that ball on the sides")."""
            xe = edge_beyond(t, 0.0, 1 if s >= 0 else -1); w = abs(xe) if xe is not None else 1e-6
            u = min(1.0, abs(s) / w)
            h = math.sqrt(max(0.0, 1.0 - u * u)) if strip[2] == "round" else max(0.0, 1.0 - u)
            t0, t1 = strip[3]; m = smoothstep((t - t0) / (t1 - t0))
            return strip[1] * (h * (1.0 - m) + edge_shape(s, t) * m) * (taper(s, t) if taper else 1.0)
    else:
      def body(s, t):
        """A somewhat flat plate (user: the shape must not contour round its veins): 5 mm thick, 6.5 mm at the foot
        easing to 5 by 10 cm up, rounded over its last 3.5 mm by the true distance to the outline; with `carve`, the
        carving's pipes stand on it."""
        h0 = (0.005 + 0.0015 * (1.0 - smoothstep(t / 0.10))) * depth * (taper(s, t) if taper else 1.0)
        return (h0 + carve_h(s, t) * (taper(s, t) if taper else 1.0)) * edge_shape(s, t)
    def edge_shape(s, t):
        e = min(1.0, edge.near((s, t), LEAF_EDGE).get(0, (LEAF_EDGE, 0))[0] / LEAF_EDGE)
        return math.sqrt(max(0.0, 1.0 - (1.0 - e) ** 2))
    depth_v, knots = LEAF_SOLID_SPEC["groove"]
    def back(s, t):
        b = -0.4 * body(s, t) - (back_extra(t) * edge_shape(s, t) if back_extra else 0.0)
        if back_vein and abs(s) < knots[-1][0]:
            t0, t1 = back_vein; f = smoothstep((t - t0) / 0.012) * smoothstep((t1 - t) / 0.012)
            b += depth_v * profile(knots, abs(s)) * f       # the same fine V as the front's veins, cut into the back
        return b
    spec = dict(LEAF_SOLID_SPEC)
    if strip: spec.update({"fill": 0.002, "step": 0.002})   # a finer mesh, so the strip's round section is not faceted
    o, l3 = leaf_solid(name, outline, [], veins + valley_lines, body, back, place, CARVED, coll, spec, lift=0.0004, creases=crease_lines)
    o.location = location
    for t, polys in l3.items():
        cu = bpy.data.curves.new(name + "_" + t, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0004; cu.bevel_resolution = 1
        for pl in polys:
            spl = cu.splines.new('POLY'); spl.points.add(len(pl) - 1)
            for pp, q in zip(spl.points, pl): pp.co = (q[0], q[1], q[2], 1.0)
        ob = bpy.data.objects.new(name + "_" + t, cu); ob.location = location
        cu.materials.append(proof_mat("PROOF_" + t, LINE_COL[t])); proof_coll.objects.link(ob)
    fw = bpy.data.objects.new(name + "_wire", o.data); fw.location = location; proof_coll.objects.link(fw)
    md = fw.modifiers.new("wire", 'WIREFRAME'); md.thickness = 0.00022; md.use_replace = True; md.material_offset = 1
    md.use_even_offset = False                           # even thickness spikes out at the leaflets' sharp points
    o.data.materials.append(proof_mat("PROOF_wire", (0.18, 0.18, 0.2)))
    print("LEAF", name, len(o.data.vertices), "verts, width %.3f height %.3f" % (max(q[0] for q in outline) - min(q[0] for q in outline), max(q[1] for q in outline)))
    return o, outline

# the seven-point leaf (the inner leaves' model): spines all from the foot, side by side; tuned to the user's outlines --
# the notches fall at centre/upper 0.186 m up (bolder centre leaflet, 30 mm wide, point at 0.257), upper/middle 0.157,
# middle/lower ~0.121; only the main vein reaches the foot, the next pair stops where its leaflets join (0.160), the next
# finishes beside the main vein (0.070), the last stops where its leaflets join (0.110); a trumpet flare makes the bottom
# part larger (50 mm at the foot).
LEAF_POINTS = {"centre": (0.0, 0.242), "upper": (0.044, 0.214), "middle": (0.067, 0.170), "lower": (0.064, 0.125)}
LEAF_BASES = {"centre": (0.0, 0.0), "upper": (0.0022, 0.0), "middle": (0.0044, 0.0), "lower": (0.0066, 0.0)}
LEAF_SHAPE = {"centre": (0.0150, 10.0, 0.92, 0.80), "upper": (0.0130, 7.0, 0.92, 0.80),
              "middle": (0.0128, 8.0, 0.93, 0.80), "lower": (0.0108, 10.0, 0.93, 0.80)}
VEIN_STOP = {"centre": 0.0, "upper": 0.160, "middle": 0.070, "lower": 0.110}
LEAF_FOOT = (0.025, 0.017, 0.11)
FLAT = ensure_collection("LEAF_FLAT")
FLAT_PROOF = ensure_collection("LEAF_FLAT_PROOF")
FLAT_X = 1.5                                            # shown beside the capital, facing the street as the capital does
flat_obj, LEAF_OUTLINE = make_leaf("leaf", LEAF_POINTS, LEAF_BASES, LEAF_SHAPE, VEIN_STOP, LEAF_FOOT,
                                   lambda s, t, w: (s, -w, t), FLAT, FLAT_PROOF, (FLAT_X, 0.0, 0.0))

# the corner leaf (user 2026-09-29): a copy of it adjusted for the corner -- five leaflets, the top one longer and larger
# (it is to roll over into the turnover), the side ones short and turned up rather than out, on a straight stem (user:
# "the bottom doesn't afunilate"). Its shape comes from the user's outlines drawn over the renders, each fitted by the
# model's own rules (curl-2.5 spines, pointed caps): the first (the screens folder's corner_v1/user_notes_corner_v1.webp)
# set the leaflets; "twice as large" made it twice as wide ("larger" = wide; the bell caps the height); "make the
# leaflets connect more" added webs joining neighbouring leaflets up to a sinus point (CORNER_SINUS); then "the
# silhouette is more squeezed as well", an outline over that version, squeezed it to 0.75 of its width -- the top
# leaflet narrower, the side points drawn in and a little higher, the notch between them deep again -- fitted within
# 1.3 mm each way (the drawing's halves differ by 3.8). The lower side spines rise from the foot beside the midrib, the
# upper ones from 0.031 m up; their veins are cut in from 0.07 and 0.145 m. Flat, 0.128 m wide and 0.327 m tall.
CORNER_POINTS = {"centre": (0.0, 0.2928), "upper": (0.0529, 0.2250), "lower": (0.0532, 0.1730)}
CORNER_BASES = {"centre": (0.0, 0.0), "upper": (0.0084, 0.0308), "lower": (0.0137, 0.0)}
CORNER_SHAPE = {"centre": (0.0323, 11.4, 0.883, 0.80), "upper": (0.0152, 4.79, 0.838, 0.75), "lower": (0.0117, 0.8, 0.722, 0.75)}
CORNER_STOP = {"centre": 0.0, "upper": 0.145, "lower": 0.07}
CORNER_STEM = (0.0374, 0.0374, 0.132)                   # a straight stem: the same half-width at the foot and at its top
CORNER_CARVE = None                                     # the carving (user's front view, 2026-09-30): make_leaf's `carve` dict, or None for the flat plate; the 'carve*' variants try it
CORNER_BUILD = "strips"                                 # "leaf": the accepted five-leaflet leaf on the plate; "strips": the leaf rebuilt strip by strip (user 2026-09-30: "lets start new. create just the center leaf with the scroll"), so far the centre strip alone
CENTRE_STRIP = (0.012, 0.015, "round", (0.15, 0.21))    # the centre strip: half-width at the foot (24 mm wide, it swells into the accepted top leaflet), thickness at its crest (the accepted depth), section, the heights over which the section becomes the accepted plate (the head and the scroll)
ROLL_T0_DEFAULT = 0.218                                 # where the accepted leaf's roll starts (its notch); a single strip has no notch
if CORNER_BUILD == "strips":
    C_POINTS, C_BASES, C_SHAPE, C_STOP, C_STEM, C_SINUS, C_STRIP = ({"centre": CORNER_POINTS["centre"]}, {"centre": CORNER_BASES["centre"]},
                                                                    {"centre": CORNER_SHAPE["centre"]}, {"centre": 0.0}, None, None, CENTRE_STRIP)
else:
    C_POINTS, C_BASES, C_SHAPE, C_STOP, C_STEM, C_SINUS, C_STRIP = (CORNER_POINTS, CORNER_BASES, CORNER_SHAPE, CORNER_STOP, CORNER_STEM, CORNER_SINUS, None)
CARVE_SPREAD = ({"upper": 0.014, "lower": 0.028}, 0.12) # the pipes 14 mm apart at the foot (five across the 75 mm stem), merging into their veins by 0.12 m up
CORNER_SINUS = {("centre", "upper"): (0.0512, 0.2150), ("upper", "lower"): (0.0373, 0.1300)}   # the notches' bottoms

# Wrapped round the bell's edge (user 2026-09-29: "curve the leaves so that it wraps the edge of the capital, both
# vertically and horizontally"; before, it stood flat on the corner at 45 degrees, "it must be in the corner"). The flat
# frame is laid onto the bell: s -> arc length round the bell's plan outline at that height, from the corner cut's
# midline (which stays in the diagonal plane through the pilaster's corner; +s toward the side face); t -> arc length up
# that midline's profile from the foot on the torus; w -> along the surface's normal. The outline's sections are the bell's
# own outline at every 0.5 mm of height (lofted straight between its 14 rings and sampled every 2 mm, the kinks beat
# with the mesh's rows and showed as horizontal bands on the wrapped stalk -- user: "the horizontal strips. remove
# them"), their corners rounded over WRAP_ROUND so the leaf bends round the arris instead of creasing on it; the leaf's
# mid-plane rides WRAP_LIFT off the surface, so its back sinks in and its edge lips it.
import numpy as np
R2 = math.sqrt(2.0)
CN, CU, UP = Vector((1 / R2, -1 / R2, 0.0)), Vector((1 / R2, 1 / R2, 0.0)), Vector((0.0, 0.0, 1.0))
CORNER_U = (W / 2 - D / 2) / R2                         # the cut's midline, across the corner
WRAP_ROUND, WRAP_LIFT = 0.004, 0.0005
def corner_reach(z):
    """How far out of the corner (along CN) the bell reaches at height z, on the cut's midline."""
    return BELL.ray_cast(CU * CORNER_U + CN * 3.0 + UP * z, -CN)[0].dot(CN)
def corner_surface():
    """The bell's surface round its right front corner, as grids over (s across, z up): points and outward normals, and
    the arc length up the midline at each z."""
    S = np.arange(-0.14, 0.14 + 1e-9, 0.001); Zs = np.arange(Z_BELL, Z_ABACUS + 1e-9, 0.0005)
    g = np.exp(-0.5 * (np.arange(-4 * WRAP_ROUND, 4 * WRAP_ROUND + 1e-9, 0.0005) / WRAP_ROUND) ** 2); g /= g.sum()
    P = np.zeros((len(Zs), len(S), 3))
    for j, z in enumerate(Zs):
        ring = np.array(bell_outline(min(1.0, (z - Z_BELL) / (Z_ABACUS - Z_BELL)), half=True))   # the bell's outline itself at this height
        cum = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(ring, axis=0).T))])
        L = np.arange(0.0, cum[-1], 0.0005)
        dense = np.stack([np.interp(L, cum, ring[:, 0]), np.interp(L, cum, ring[:, 1])], 1)
        sm = np.stack([np.convolve(np.pad(dense[:, i], len(g) // 2, mode="edge"), g, mode="valid") for i in (0, 1)], 1)
        cum = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(sm, axis=0).T))])
        u = (sm[:, 0] + sm[:, 1]) / R2 - CORNER_U                          # > 0 on the side face, < 0 on the front
        i = int(np.nonzero((u[:-1] > 0) & (u[1:] <= 0))[0][0]); fi = u[i] / (u[i] - u[i + 1])
        sv = (cum[i] + fi * (cum[i + 1] - cum[i])) - cum                   # arc length from the midline, + toward the side face
        P[j, :, 0] = np.interp(S, sv[::-1], sm[::-1, 0]); P[j, :, 1] = np.interp(S, sv[::-1], sm[::-1, 1]); P[j, :, 2] = z
    n = np.cross(np.gradient(P, axis=1), np.gradient(P, axis=0))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    mid = P[:, np.argmin(np.abs(S)), :]
    sigma = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(mid, axis=0), axis=1))])
    return S, Zs, P, n, sigma
WRAP_S, WRAP_Z, WRAP_P, WRAP_N, WRAP_SIGMA = corner_surface()
def corner_place(s, t, w):
    """The flat leaf's (s, t, w) laid onto the bell round its right front corner."""
    fj = float(np.interp(t, WRAP_SIGMA, np.arange(len(WRAP_Z)))); fi = (s - WRAP_S[0]) / (WRAP_S[1] - WRAP_S[0])
    j = min(max(int(fj), 0), len(WRAP_Z) - 2); i = min(max(int(fi), 0), len(WRAP_S) - 2)
    a, b = min(max(fj - j, 0.0), 1.0), min(max(fi - i, 0.0), 1.0)
    def lerp(G): return (G[j, i] * (1 - b) + G[j, i + 1] * b) * (1 - a) + (G[j + 1, i] * (1 - b) + G[j + 1, i + 1] * b) * a
    nv = lerp(WRAP_N); nv = nv / np.linalg.norm(nv)
    p = lerp(WRAP_P) + nv * (w + WRAP_LIFT)
    return (float(p[0]), float(p[1]), float(p[2]))
# Its top rolls over (user 2026-09-29: "roll the top of the leaf", with the reference photo, where each corner leaf's tip
# rolls forward and down into a thick lump past the bell, ~0.16-0.24 m up). Only the top leaflet rolls: above the notch
# between it and the upper side points (ROLL_T0, found on the outline), the part on its side of the gap leaves the bell,
# while the side points stay wrapped on it. Each section turns with the midrib, so the leaf's back becomes the roll's
# outside, and relaxes from the wrap's V to flat over ROLL_FLAT (kept rigid, the V's sides rose like tulip petals).
# The roll is a scroll that closes on itself (user 2026-09-30, over the profile view: "it basically crawls inside of
# itself, you'll need to expand the material a bit to create volume", the drawn loop centred 16 mm up and 29 mm out
# from the roll's start, its outside ~29 mm round, curling in to ~19 at the bottom): the midrib rises ROLL_STRAIGHT,
# then spirals a full turn round that centre, its radius shrinking from ROLL_R0 to ROLL_R1, so the tip ends inside the
# coil. The rolled part is stretched along its length (ROLL_STRETCH, computed) to have the material for the turn, and
# keeps its full thickness until late in the turn, thinning at the tip to fit inside. Seen from the front it is round
# (user: "make it more rounded when seen from the front"): the leaf's edges coil tighter than its midrib (ROLL_DOME),
# drawn in toward the coil's centre as they go over, so the scroll is barrel-shaped with an arched top; the midrib's
# vein is cut into its outside too ("and add the vein in the center").
# The decoration is three times deeper (user: "make this decoration 3x deeper"): a 15 mm plate, 19.5 at the foot.
CORNER_DEPTH = 3.0
ROLL_STRAIGHT, ROLL_R0, ROLL_R1, ROLL_TURN, ROLL_SHRINK, ROLL_FLAT = 0.0163, 0.0289, 0.004, 590 / 180 * math.pi, 1.0, 0.030   # an even spiral, 18 mm pitch, reaching 4 mm from the axis at ROLL_SHRINK_END, then a quarter-turn HOOK at that radius (the user's small hook at the centre of their line): the tip's inner face, aimed at the centre and reaching past it (ROLL_CORE), wraps round the axis and covers it -- ending at the closest approach it only grazed the centre (a pinhole); through the axis it made a knot of facets; faded to nothing, a pinhole
ROLL_SHRINK_END = 500 / 180 * math.pi                   # the angle at which the radius reaches ROLL_R1; constant after   # a turn and a half at an even pitch (user 2026-09-30, the seam drawn as one smooth spiral into the centre: "this is how the lines should go"); R1 was 6 mm with a knob, the tip now spirals to the axis and is the eye's centre itself
ROLL_END_FADE = 0.0                                   # the tip's body fades out over its last 12 mm, so it vanishes into the eye's centre instead of ending in a blunt face there (a dark pit)
ROLL_SHEET = 0.8                                        # the rolled sheet's thickness as a fraction of the plate's: 17 mm against the spiral's 19 mm pitch, so each turn clears the one under it and the seam between them reads
ROLL_CORE = 0.005                                       # the tip keeps at least this much body near its midrib as it reaches the axis, so the eye's centre is solid (the coiled edges alone were a paper-thin shell there: a pinhole)
ROLL_DOME, ROLL_DOME_RAMP = 0.995, 0.080                # the edges' coil shrinks to 0.5% of the midrib's, completing at the front of the turn (~180 degrees; at ~100 the apex formed at the leaf's full width, flush with the dome's shoulders, two points from the front), and stays in: the strip's edges spiral into the eye's centre and close it themselves (at 4% a pinhole showed through)
ROLL_TUCK = 0.20                                        # the coiled edges also draw in ALONG the axis, as (s / half-width)**2 with the coil's ramp (at most a fifth: the map stays monotone, no strip folds under another -- a stronger, steeper draw crumpled the roll): the eye's apex sits inside the roll like the photo's funnel instead of at the leaf's full width like a spindle, so from the front the sides come straight down from the dome's shoulders
ROLL_KNOB = False                                       # no knob in the eye (user 2026-09-30, the strip's edges drawn spiralling into the centre: "that ball should not exist. it must curl inside"); True restores fill_eye's ellipsoid, which plugged the eye while the edges stopped at 12%
EYE_R, EYE_HALF, EYE_BLEND = 0.016, 0.020, 0.004       # the knob in the coil's eye: radius, half-length along the axis (its tapering tips just past the coiled edges, ~19 mm out at the inner turn), blend
ROLL_DOME_FROM = ROLL_STRAIGHT                          # the coil starts where the roll leaves the straight, as accepted (tried from the top: a square-topped block from the front)
ROLL_PINCH_END = 0.60                                   # the rolled leaflet's axial half-width is HELD to the dome's own width below the top of the turn and narrows to this fraction of it by the bottom (roll_width): the leaflet itself widens down the front (32 mm at the shoulder, 65 deep in the coil), and left alone its coiled rim hung out beside the dome as two lumps from the front (user 2026-09-30: "that ball on the sides", a U drawn from the dome's widest points down to the stalk)
# Verdict on a rework (user, 2026-09-30 evening, over three photos of a real terracotta corner leaf and its curl):
# "the before version was actually better, except for the small defect on the side" -- so this scroll (the whorl of
# the coiled-in edges, the thick sheet, the knob at the centre) is the one kept. The defect: at the whorl's centre the
# coiled edges converged past the old ellipsoid's tip (its half-length 27 mm, the edges at 32) and left a small pocket
# with a lip, seen from the side. A capsule knob with blunt domed ends closed it but bulged out of the coiled edges at
# the roll's sides from the front ("the before version is still better", with an arrow at the roll's top edge), so the
# knob is the ellipsoid again, only 6 mm longer each way: its tapering tips stay inside the whorl's cone and just plug
# the pocket (5.6 mm round where the edges are 3.5 mm from the axis), so the front silhouette is the accepted one. The rework's trials (a curled sheet round a knob at the front-bottom) are kept in the screens
# folder, corner_v7a .. corner_v7klm, with their composites; the ROLL_VARIANT switch and the ribs option stay.
ROLL_VARIANTS = {                                       # ROLL_VARIANT=<key> in the environment: a trial rendered beside the default (files suffixed _<key>)
    "carveA": {"CORNER_CARVE": {"crest": 0.006, "profile": "flat", "spread": CARVE_SPREAD}},                    # pipes 6 mm high, planar flanks, V valleys, flat sides to the edge
    "carveB": {"CORNER_CARVE": {"crest": 0.006, "profile": "hollow", "hollow_at": 0.45, "rim": 0.002, "spread": CARVE_SPREAD}},   # the leaflets' sides scooped in a triangle, a 2 mm rim at the edge
    "carveC": {"CORNER_CARVE": {"crest": 0.006, "profile": "flat", "spread": CARVE_SPREAD, "over": "out", "stack": 0.0025, "overlap": 0.0025, "stack_from": 0.06}},   # superposed: the outer lobes lie over the inner pipes, 2.5 mm steps
    "carveD": {"CORNER_CARVE": {"crest": 0.006, "profile": "hollow", "hollow_at": 0.45, "rim": 0.002, "spread": CARVE_SPREAD, "over": "in", "stack": 0.0025, "overlap": 0.0025, "stack_from": 0.06}},   # hollow sides and the centre over the next outward
    "stripsR": {"CORNER_CARVE": {"mode": "strips", "section": "round", "over": "in", "w_foot": 0.008, "thick": 0.004, "spread": CARVE_SPREAD, "fade_above": (0.203, 0.015)}},    # moulded half-round strips, the centre laid last (on top)
    "stripsF": {"CORNER_CARVE": {"mode": "strips", "section": "roof", "over": "in", "w_foot": 0.008, "thick": 0.004, "spread": CARVE_SPREAD, "fade_above": (0.203, 0.015)}},     # the strips' sides flattened: a sharp crest, planar flanks
    "stripsH": {"CORNER_CARVE": {"mode": "strips", "section": "hollow", "over": "in", "w_foot": 0.008, "thick": 0.004, "spread": CARVE_SPREAD, "fade_above": (0.203, 0.015)}},   # the strips' sides carved in a triangle: a V along each flank, a rim at the edge
    "stripsFo": {"CORNER_CARVE": {"mode": "strips", "section": "roof", "over": "out", "w_foot": 0.008, "thick": 0.004, "spread": CARVE_SPREAD, "fade_above": (0.203, 0.015)}},   # flattened, the reverse order: the outer strips laid last
}
VARIANT = os.environ.get("ROLL_VARIANT", "")
if VARIANT: globals().update(ROLL_VARIANTS[VARIANT]); print("ROLL variant", VARIANT, ROLL_VARIANTS[VARIANT])
CORNER_TIP_T = CORNER_POINTS["centre"][1] + TIP_CAP * CORNER_SHAPE["centre"][3] * CORNER_SHAPE["centre"][0]
CORNER_FLAT = ensure_collection("CORNER_FLAT")          # its flat pattern beside the seven-point leaf, facing the street, to
CORNER_FLAT_PROOF = ensure_collection("CORNER_FLAT_PROOF")  # compare with the user's drawings
CORNER_FLAT_X = FLAT_X + 0.45
_, CORNER_OUTLINE = make_leaf("corner_leaf_flat", C_POINTS, C_BASES, C_SHAPE, C_STOP, C_STEM,
                              lambda s, t, w: (s, -w, t), CORNER_FLAT, CORNER_FLAT_PROOF, (CORNER_FLAT_X, 0.0, 0.0),
                              sinus=C_SINUS, depth=CORNER_DEPTH, carve=CORNER_CARVE, strip=C_STRIP)
def lobe_split(outline):
    """Where the top leaflet parts from the upper side points: the notch's height, and by height above it, the middle of
    the gap between them across (s) on the right half -- held at its last value above the side points' tips (a jump to
    "no gap" there would pull their tips into the roll)."""
    O = np.array(outline); Q = np.roll(O, -1, axis=0)
    ts = np.arange(0.15, O[:, 1].max(), 0.0005); split = []
    for t in ts:
        m = (O[:, 1] - t) * (Q[:, 1] - t) < 0
        f = (t - O[m, 1]) / (Q[m, 1] - O[m, 1]); xs = np.sort((O[m, 0] + f * (Q[m, 0] - O[m, 0]))[(O[m, 0] + f * (Q[m, 0] - O[m, 0])) > 0])
        split.append((xs[0] + xs[1]) / 2 if len(xs) >= 3 else np.inf)
    split = np.array(split); two = np.isfinite(split)
    if not two.any(): return ROLL_T0_DEFAULT, ts, np.full(len(ts), np.inf)   # no notch (a single strip): the accepted roll start, everything above it rolls
    top = np.nonzero(two)[0].max()                      # scanning down from the point: the side points' region ...
    k = top
    while k > 0 and two[k - 1]: k -= 1                  # ... down to where the notch closes
    split[top + 1:] = split[top]
    return ts[k], ts, np.where(np.arange(len(ts)) >= k, split, np.inf)
ROLL_T0, _SPLIT_T, _SPLIT_S = lobe_split(CORNER_OUTLINE)
def roll_curve():
    """The rolled midrib from ROLL_T0, every 0.1 mm of its length, in the plane of the midrib's tangent T0 and the
    surface's normal N0 there: its tangent's angle turned from T0 toward N0, and its point (along T0, out along N0).
    Straight up for ROLL_STRAIGHT, then a spiral round (ROLL_STRAIGHT, ROLL_R0): up, forward, down, back in."""
    th = np.linspace(0.0, ROLL_TURN, 4000)
    R = ROLL_R0 - (ROLL_R0 - ROLL_R1) * (np.minimum(th, ROLL_SHRINK_END) / ROLL_SHRINK_END) ** ROLL_SHRINK
    a = np.concatenate([np.linspace(0.0, ROLL_STRAIGHT, 200)[:-1], ROLL_STRAIGHT + R * np.sin(th)])
    b = np.concatenate([np.zeros(199), ROLL_R0 - R * np.cos(th)])
    seg = np.hypot(np.diff(a), np.diff(b)); L = np.concatenate([[0.0], np.cumsum(seg)])
    phi = np.unwrap(np.arctan2(np.gradient(b), np.gradient(a)))
    rad = np.concatenate([np.full(199, ROLL_R0), np.maximum(R, 0.0)]); theta = np.concatenate([np.zeros(199), th])   # past the axis the radius is negative; the edges' coil uses 0 there
    tau = np.arange(0.0, L[-1], 0.0001)
    return (tau, np.interp(tau, L, phi), np.interp(tau, L, a), np.interp(tau, L, b), np.interp(tau, L, rad),
            np.interp(tau, L, theta))
ROLL_TAU, ROLL_PHI, ROLL_ALONG, ROLL_OUT, ROLL_RAD, ROLL_THETA = roll_curve()
CORNER_CUT = 0.300                                      # the rolled leaflet ends blunt, 45 mm wide, in the coil's eye (its point made a cusp there)
ROLL_STRETCH = ROLL_TAU[-1] / (CORNER_CUT - ROLL_T0)             # the rolled leaflet, lengthened to make the turn
# The coil's eye is filled by the leaf itself, blended in (user: "fill but not with a separate object, blend them
# together in a smooth way"): the spiral runs on past its start, its inner end thickening toward the centre (short of
# it, so the leaf never passes through itself), and a round knob in the eye is united with the leaf and smoothed in
# (fill_eye); the leaflet is trimmed blunt (CORNER_CUT) so no point is left in the eye.
FULL = 0.005 * CORNER_DEPTH                             # the plate's thickness above the foot
def spiral_r(th): return ROLL_R0 - (ROLL_R0 - ROLL_R1) * (min(max(th, 0.0), ROLL_SHRINK_END) / ROLL_SHRINK_END) ** ROLL_SHRINK
def corner_fill_taper(s, t):
    """The rolled leaf's thickness toward the coil's centre, as a factor on the plate's: each strip across it short of
    the centre by its own radius -- the edges coil tighter (ROLL_DOME), so their thickness is capped tighter too, or the
    leaf would pass through itself round the eye."""
    if t <= ROLL_T0 or abs(s) > float(np.interp(t, _SPLIT_T, _SPLIT_S)): return 1.0
    tau = (t - ROLL_T0) * ROLL_STRETCH; th = float(np.interp(tau, ROLL_TAU, ROLL_THETA))
    dome = ROLL_DOME * min(1.0, (s / CORNER_SHAPE["centre"][0]) ** 2) * smoothstep((tau - ROLL_DOME_FROM) / ROLL_DOME_RAMP)
    core = ROLL_CORE * max(0.0, 1.0 - (s / (0.5 * CORNER_SHAPE["centre"][0])) ** 2)   # the solid core along the midrib at the eye's centre
    end = smoothstep((ROLL_TAU[-1] - tau) / ROLL_END_FADE) if ROLL_END_FADE > 0 else 1.0   # (a tip fading to nothing at the centre left a pinhole through the eye; off)
    return min(FULL * ROLL_SHEET, max(core, 0.85 * spiral_r(th) * (1.0 - dome))) * end / FULL if th > 0 else 1.0

_m0 = np.array(corner_place(0.0, ROLL_T0, 0.0)); _t0 = np.array(corner_place(0.0, ROLL_T0 + 0.001, 0.0)) - np.array(corner_place(0.0, ROLL_T0 - 0.001, 0.0))
_t0 /= np.linalg.norm(_t0); _n0 = np.array(corner_place(0.0, ROLL_T0, 0.001)) - _m0; _n0 -= _n0.dot(_t0) * _t0; _n0 /= np.linalg.norm(_n0)
_a0 = np.cross(_t0, _n0)
_C3 = _m0 + _t0 * ROLL_STRAIGHT + _n0 * ROLL_R0         # the spiral's centre
_O, _Q = np.array(CORNER_OUTLINE), np.roll(np.array(CORNER_OUTLINE), -1, axis=0)
def _half_at(t):
    """The leaf outline's half-width at height t."""
    m = (_O[:, 1] <= t) != (_Q[:, 1] <= t)          # half-open: a crossing on a vertex counts once (a product test missed it, and the outline's vertices sit on the sampling grid)
    if not m.any(): return 0.0
    f = (t - _O[m, 1]) / (_Q[m, 1] - _O[m, 1]); return float(np.max(np.abs(_O[m, 0] + f * (_Q[m, 0] - _O[m, 0]))))
_HALF_T = np.arange(0.0, CORNER_TIP_T + 0.01, 0.0005); _HALF_S = np.array([_half_at(t) for t in _HALF_T])
def tau_at(deg): return float(ROLL_TAU[min(len(ROLL_TAU) - 1, int(np.searchsorted(ROLL_THETA, math.radians(deg))))])
ROLL_W_TOP = float(np.interp(ROLL_T0 + tau_at(90) / ROLL_STRETCH, _HALF_T, _HALF_S))   # the dome's half-width: the leaflet's at the top of the turn
def roll_width(tau):
    """The rolled leaflet's axial half-width: held to the dome's own width down the front of the turn, then narrowing
    to ROLL_PINCH_END of it by the bottom (and on, inside), so that from the front nothing below the dome stands out
    beyond it and the roll's sides curve in to the stalk (the user's U)."""
    return ROLL_W_TOP * (1.0 - (1.0 - ROLL_PINCH_END) * smoothstep((tau - tau_at(120)) / (tau_at(270) - tau_at(120))))
print("ROLL width: the dome %.1f mm half-wide at the top of the turn; the turn's bottom held to %.1f" % (1000 * ROLL_W_TOP, 1000 * roll_width(tau_at(270))))
def corner_place_rolled(s, t, w):
    """corner_place, with the top leaflet rolled over from ROLL_T0 (the side points beside it stay on the bell)."""
    if t <= ROLL_T0 or abs(s) > float(np.interp(t, _SPLIT_T, _SPLIT_S)): return corner_place(s, t, w)
    tau = (t - ROLL_T0) * ROLL_STRETCH
    phi = float(np.interp(tau, ROLL_TAU, ROLL_PHI))
    c = _m0 + _t0 * float(np.interp(tau, ROLL_TAU, ROLL_ALONG)) + _n0 * float(np.interp(tau, ROLL_TAU, ROLL_OUT))
    pinch = min(1.0, roll_width(tau) / max(1e-6, float(np.interp(t, _HALF_T, _HALF_S))))   # the leaflet held to the dome's width below the top, narrowing to the bottom ...
    pinch *= 1.0 - ROLL_TUCK * min(1.0, abs(s) / CORNER_SHAPE["centre"][0]) ** 2 * smoothstep((tau - ROLL_DOME_FROM) / ROLL_DOME_RAMP)   # ... and the coiled edges drawing in along the axis
    d = np.array(corner_place(s * pinch, ROLL_T0, w)) - _m0            # the point in its section at ROLL_T0, relaxing flat ...
    f = smoothstep(tau / ROLL_FLAT)
    dome = ROLL_DOME * min(1.0, (s / CORNER_SHAPE["centre"][0]) ** 2) * float(np.interp(tau, ROLL_TAU, ROLL_RAD))            * smoothstep((tau - ROLL_DOME_FROM) / ROLL_DOME_RAMP)       # ... its edges drawn in toward the coil's centre ...
    d = d * (1 - f) + (_a0 * s * pinch + _n0 * (w + dome)) * f
    d = d * math.cos(phi) + np.cross(_a0, d) * math.sin(phi) + _a0 * _a0.dot(d) * (1 - math.cos(phi))   # ... turned with the roll
    th = float(np.interp(tau, ROLL_TAU, ROLL_THETA)); b = smoothstep((th - math.radians(250)) / math.radians(60))
    if b > 0:                                           # inside, its thickness aims at the coil's centre, not along the normal:
        nv = _n0 * math.cos(phi) - _t0 * math.sin(phi)  # a tightening spiral's normals miss the centre and left the eye open
        rv = _C3 - c; rv = rv / np.linalg.norm(rv) if np.linalg.norm(rv) > 1e-6 else nv   # at the axis itself the normal will do
        nb = nv * (1 - b) + rv * b; nb /= np.linalg.norm(nb)
        d = d + (nb - nv) * d.dot(nv)
    p = c + d
    return (float(p[0]), float(p[1]), float(p[2]))
CORNER = ensure_collection("CORNER_LEAF")
CORNER_PROOF = ensure_collection("CORNER_LEAF_PROOF")
corner_obj, _ = make_leaf("corner_leaf", C_POINTS, C_BASES, C_SHAPE, C_STOP, C_STEM,
                          corner_place_rolled, CORNER, CORNER_PROOF, sinus=C_SINUS, depth=CORNER_DEPTH,
                          taper=corner_fill_taper, back_vein=(ROLL_T0 - 0.01, 0.29), cut=CORNER_CUT,
                          carve=CORNER_CARVE, strip=C_STRIP)
def fill_eye(obj):
    """The coil's eye filled and blended in (user: "fill but not with a separate object, blend them together in a smooth
    way", then a photo of a real scroll whose centre is a big rounded knob, ~60% of its radius, bulging from its sides):
    an ellipsoid knob along the roll's axis through the spiral's centre, united with the leaf (exact boolean), then the
    vertices along the join smoothed so the groove between knob and coil is soft, not a crease."""
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1.0)   # the knob: the coil's end swollen round
    for v in bm.verts:
        x, y, z = v.co; v.co = Vector(_C3 + _a0 * (z * EYE_HALF) + _t0 * (x * EYE_R) + _n0 * (y * EYE_R))
    for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new("_eye"); bm.to_mesh(me); bm.free()
    if CARVED.name not in [m.name for m in me.materials]: me.materials.append(CARVED)
    eye = bpy.data.objects.new("_eye", me); bpy.context.scene.collection.objects.link(eye)
    bpy.context.view_layer.update()
    leaf_bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())   # the leaf before the fill, to find the join
    eye_bvh = BVHTree.FromObject(eye, bpy.context.evaluated_depsgraph_get())
    mod = obj.modifiers.new("fill", 'BOOLEAN'); mod.operation = 'UNION'; mod.solver = 'EXACT'; mod.object = eye
    mod.use_self = True                                  # the coil's turns may touch
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    joined = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear(); old = obj.data; obj.data = joined
    for o in bpy.data.objects:
        if o.data == old: o.data = joined               # the wire proof shares the mesh
    bpy.data.meshes.remove(old); bpy.data.objects.remove(eye); bpy.data.meshes.remove(me)
    vg = obj.vertex_groups.new(name="eye_blend"); band = 0
    for v in obj.data.vertices:                          # the join: near both the ellipsoid's surface and the leaf's
        wv = obj.matrix_world @ v.co; q = Vector(wv) - Vector(_C3)
        d_eye = eye_bvh.find_nearest(wv)[3]; d_leaf = leaf_bvh.find_nearest(wv)[3]
        w = (1.0 - min(1.0, d_eye / EYE_BLEND)) * (1.0 - min(1.0, d_leaf / EYE_BLEND))
        if w > 0: vg.add([v.index], w, 'REPLACE'); band += 1
    sm = obj.modifiers.new("blend", 'SMOOTH'); sm.factor = 0.6; sm.iterations = 15; sm.vertex_group = "eye_blend"
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    smoothed = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear(); old = obj.data; obj.data = smoothed
    for o in bpy.data.objects:
        if o.data == old: o.data = smoothed
    bpy.data.meshes.remove(old)
    bm = bmesh.new(); bm.from_mesh(obj.data)             # the merged mesh checked round the knob: open or non-manifold edges
    reach = EYE_HALF + 0.01; kn = Vector(_C3)
    bad = sum(1 for e in bm.edges if (len(e.link_faces) != 2) and ((obj.matrix_world @ e.verts[0].co) - kn).length < reach)
    bm.free()
    print("EYE filled: %d verts, %d along the join blended, %d open/non-manifold edges within %.0f mm of the knob" % (len(obj.data.vertices), band, bad, 1000 * reach))
if ROLL_KNOB: fill_eye(corner_obj)
else: print("EYE: no knob; the strip's edges close the eye (ROLL_DOME %.2f)" % ROLL_DOME)
top_t = CORNER_CUT
_V = [corner_obj.matrix_world @ v.co for v in corner_obj.data.vertices]
_top = max(v.z for v in _V); _reach = max(v.dot(CN) for v in _V if v.z > Z_BELL + ROLL_T0 - 0.02)
print("ROLL: a full turn round a centre %.1f mm up and %.1f mm out, the rolled leaflet stretched x%.2f" % (1000 * ROLL_STRAIGHT, 1000 * ROLL_R0, ROLL_STRETCH))
print("CORNER leaf wrapped, its top leaflet rolled from its notch at t %.3f: the roll from %.3f m up the bell to its top at "
      "%.3f (the abacus soffit at %.3f); its point at %.3f, %.1f mm out from the bell's corner there; the roll reaches %.1f "
      "mm out of the corner past the bell's at its start" % (ROLL_T0, corner_place(0.0, ROLL_T0, 0.0)[2] - Z_BELL, _top - Z_BELL,
      Z_ABACUS - Z_BELL, corner_place_rolled(0.0, top_t, 0.0)[2] - Z_BELL,
      1000 * (Vector(corner_place_rolled(0.0, top_t, 0.0)).dot(CN) - corner_reach(corner_place_rolled(0.0, top_t, 0.0)[2])),
      1000 * (_reach - corner_reach(corner_place(0.0, ROLL_T0, 0.0)[2]))))

# ---------------------------------------------------------------- cameras, renders, save
rig = setup_scene()
S = bpy.context.scene
SUN = bpy.data.objects["Sun"]; SUN.data.angle = math.radians(18); SUN.data.energy = 3.2   # soft key from the upper left, as the photo's studio light
bg = S.world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.50, 0.50, 0.52, 1.0); bg.inputs[1].default_value = 0.85
def use_cycles(samples=96):
    S.render.engine = 'CYCLES'
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences
        cp.compute_device_type = "OPTIX"; cp.get_devices()
        for d in cp.devices: d.use = d.type in ('OPTIX', 'CPU')
        S.cycles.device = 'GPU'
    except Exception as e:
        print("GPU not available, rendering on the CPU:", e); S.cycles.device = 'CPU'
    S.cycles.samples = samples; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.02
    S.cycles.use_denoising = True
    try: S.cycles.denoiser = 'OPTIX' if S.cycles.device == 'GPU' else 'OPENIMAGEDENOISE'
    except Exception: pass
OUT =r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project\ornaments"
os.makedirs(OUT, exist_ok=True)
VC = zpx(512)
front = camera("EditFront", (px(768, 0)[0], -6.0, VC), (px(768, 0)[0], 0.0, VC), 50)
front.data.type = 'ORTHO'; front.data.ortho_scale = 1536 * M_PER_PX
camera("EditQuarter", (1.25, -1.55, 0.62), (0.16, -0.45, 0.27), 55)
fcam = camera("FlatFront", (FLAT_X, -3.0, 0.12), (FLAT_X, 0.0, 0.12), 50)
fcam.data.type = 'ORTHO'; fcam.data.ortho_scale = 0.30
camera("FlatQuarter", (FLAT_X + 0.34, -0.42, 0.30), (FLAT_X, 0.0, 0.11), 60)
camera("FlatSide", (FLAT_X + 0.40, 0.22, 0.20), (FLAT_X, 0.0, 0.11), 55)                # from the side and behind: the leaf is a solid of its own
ccam = camera("CornerFront", (0.27, -6.0, 0.27), (0.27, 0.0, 0.27), 50)                 # the capital's right half and the corner leaf on its corner
ccam.data.type = 'ORTHO'; ccam.data.ortho_scale = 0.66
camera("CornerQuarter", (1.05, -1.35, 0.46), (0.36, -0.47, 0.22), 50)
C_MID = CU * CORNER_U + CN * corner_reach(Z_BELL + 0.15) + UP * 0.23
dcam = camera("CornerDiagonal", C_MID + CN * 6.0, C_MID, 50)                            # level, straight out of the corner
dcam.data.type = 'ORTHO'; dcam.data.ortho_scale = 0.66
pcam = camera("CornerProfile", C_MID - CU * 6.0, C_MID, 50)                             # along the corner cut: the leaf edge-on against the bell's profile
print("ROLL frame m0 %s t0 %s n0 %s" % (",".join("%.6f" % x for x in _m0), ",".join("%.6f" % x for x in _t0), ",".join("%.6f" % x for x in _n0)))
print("PROFILE view centre (N %.5f, z %.5f); roll start (N %.5f, z %.5f), T0 (N %.4f, z %.4f), N0 (N %.4f, z %.4f)" % (
      C_MID.dot(CN), C_MID.z, Vector(_m0).dot(CN), _m0[2], Vector(_t0).dot(CN), _t0[2], Vector(_n0).dot(CN), _n0[2]))
pcam.data.type = 'ORTHO'; pcam.data.ortho_scale = 0.56
kcam = camera("CornerFlatFront", (CORNER_FLAT_X, -3.0, 0.165), (CORNER_FLAT_X, 0.0, 0.165), 50)   # the flat pattern, face on
kcam.data.type = 'ORTHO'; kcam.data.ortho_scale = 0.36
R_MID = Vector(corner_place(0.0, ROLL_T0, 0.0)) + CN * 0.02
camera("CornerLow", R_MID + CN * 0.80 - CU * 0.22 - UP * 0.30, R_MID, 50)                 # low, from the front: up under the roll
L_MID = Vector(corner_place(0.0, 0.165, 0.0))
lcam = camera("CornerLeafFront", L_MID + CN * 6.0, L_MID, 50)                           # the leaf alone, straight out of the corner
lcam.data.type = 'ORTHO'; lcam.data.ortho_scale = 0.36
E_MID = Vector(_C3)
ecam = camera("CornerEye", E_MID - CU * 2.0, E_MID, 50)                                 # the scroll's open end, along the roll's axis (the user's "desired shape" view)
ecam.data.type = 'ORTHO'; ecam.data.ortho_scale = 0.14

GROUPS = {"capital": [COLL], "leaf": [FLAT], "leaf_proof": [FLAT_PROOF], "corner": [CORNER], "corner_proof": [CORNER_PROOF],
          "corner_flat": [CORNER_FLAT], "corner_flat_proof": [CORNER_FLAT_PROOF]}
def shoot(cam, name, rx, ry, show, engine='CYCLES'):
    """Render with only the named groups visible."""
    for key, colls in GROUPS.items():
        for c in colls: c.hide_render = key not in show
    if engine == 'CYCLES': use_cycles()
    else: S.render.engine = engine
    S.render.resolution_x = rx; S.render.resolution_y = ry
    if engine == 'BLENDER_WORKBENCH':
        sh = S.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_shadows = False
    if VARIANT: name = name.replace(".png", "_" + VARIANT + ".png")
    render(cam, os.path.join(OUT, name))

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []      # `-- flat` / `-- corner` / `-- eye`: only that stage's renders
if "eye" in ARGS:                                        # the scroll alone, quickly: its side, profile, front, low and three-quarter views
    shoot("CornerEye", "capital_edit_corner_eye.png", 1100, 1100, ("capital", "corner"))
    shoot("CornerProfile", "capital_edit_corner_profile.png", 1000, 1300, ("capital", "corner"))
    shoot("CornerFront", "capital_edit_corner_front.png", 1300, 1300, ("capital", "corner"))
    shoot("CornerLow", "capital_edit_corner_low.png", 1300, 1300, ("capital", "corner"))
    shoot("CornerQuarter", "capital_edit_corner_quarter.png", 1400, 1100, ("capital", "corner"))
if not ARGS or "flat" in ARGS:
    shoot("FlatFront", "capital_edit_leaf.png", 1000, 1300, ("leaf",))
    shoot("FlatQuarter", "capital_edit_leaf_quarter3.png", 1100, 1100, ("leaf",))
    shoot("FlatSide", "capital_edit_leaf_side.png", 1100, 1100, ("leaf",))
    shoot("FlatFront", "capital_edit_leaf_wire.png", 1000, 1300, ("leaf", "leaf_proof"), engine="BLENDER_WORKBENCH")
if not ARGS or "corner" in ARGS:
    shoot("CornerFront", "capital_edit_corner_front.png", 1300, 1300, ("capital", "corner"))
    shoot("CornerDiagonal", "capital_edit_corner_diagonal.png", 1300, 1300, ("capital", "corner"))
    shoot("CornerQuarter", "capital_edit_corner_quarter.png", 1400, 1100, ("capital", "corner"))
    shoot("CornerProfile", "capital_edit_corner_profile.png", 1000, 1300, ("capital", "corner"))
    shoot("CornerLow", "capital_edit_corner_low.png", 1300, 1300, ("capital", "corner"))
    shoot("CornerEye", "capital_edit_corner_eye.png", 1100, 1100, ("capital", "corner"))
    shoot("CornerEye", "capital_edit_corner_eye_wire.png", 1100, 1100, ("corner", "corner_proof"), engine="BLENDER_WORKBENCH")   # the mesh (user: "a render with the quads showing"; the kit's mesh is triangulated)
    shoot("CornerLeafFront", "capital_edit_corner_leaf.png", 1000, 1300, ("corner",))
    shoot("CornerFlatFront", "capital_edit_corner_flat.png", 1000, 1300, ("corner_flat",))
    shoot("CornerFlatFront", "capital_edit_corner_flat_wire.png", 1000, 1300, ("corner_flat", "corner_flat_proof"), engine="BLENDER_WORKBENCH")
    shoot("CornerLeafFront", "capital_edit_corner_leaf_wire.png", 1000, 1300, ("corner", "corner_proof"), engine="BLENDER_WORKBENCH")
if not ARGS:
    shoot("EditFront", "capital_edit_blank_front.png", 1536, 1024, ("capital",))
    shoot("EditFront", "capital_edit_front.png", 1536, 1024, ("capital", "corner"))
    shoot("EditQuarter", "capital_edit_quarter.png", 1400, 1100, ("capital", "corner"))
    shoot("EditQuarter", "capital_edit_solid.png", 1400, 1100, ("capital", "corner"), engine='BLENDER_WORKBENCH')
for key, colls in GROUPS.items():
    for c in colls: c.hide_render = key.endswith("_proof")
S.camera = bpy.data.objects["CornerQuarter"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\ornaments\capital_edit%s.blend" % ("_" + VARIANT if VARIANT else ""), compress=True)
print("CAPITAL_EDIT DONE", len(COLL.objects), "objects")
