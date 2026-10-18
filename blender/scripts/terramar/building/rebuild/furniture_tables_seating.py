# furniture_tables_seating.py -- furniture detail upgrade: detailed tables and soft seating, into a caller's bmesh.
#
# Replaces the box prisms of layer_roof_furniture.py's model() (the roof terrace, the restaurant and its banquettes, the
# upper dining room, the residential units, the penthouse) and layer_site_cafe.py's café tables. After b8 (round café
# tables with dark pedestals and wood tops; a warm restaurant with wood tables) with realistic proportions, eased edges
# and upholstered cushions:
#   dining_table   0.74 m: a 36 mm top with rounded corners, an eased top edge and an undercut chamfer (it reads thin),
#                  a slim apron, four legs tapered on their inner faces, chamfered arrises (teak)
#   coffee_table   0.38 m: the same top, thinner, on tapered legs with an apron and a lower shelf
#   low_table      0.40 m: an outdoor slatted top (slats along the long side, eased top arrises, open joints) on an
#                  apron frame and four chamfered legs
#   side_table     0.51 m: a round top with an eased edge on a slim charcoal stem and a domed weighted disc
#   cafe_table     0.75 m: a round wood top with an open centre hole (the umbrella pole runs through it), a hollow
#                  charcoal column with a hub and a collar, four cast arms on pads, a cross spider under the top
#   sofa           upholstered: tapered wood legs, a fabric deck and back frame, welted arms at the ends; one seat
#                  cushion and one leaning back cushion per module, the module count from the length (3 on a 2.1 m
#                  sofa, 8 on a 5 m banquette); every cushion puffy (domed top, sides bulging at mid-side, corners
#                  pulled in and lower) with a piping bead at its welts, each seeded (crown, sag, bead, dome centre,
#                  a lean)
#   armchair       one sofa module with arms
#   (sofa / armchair with item["frame"] = "teak": the same cushions on an open teak frame -- corner posts, arm boards on
#                  two rails, aprons, a slatted back with a top rail -- for the roof terrace)
#   lounger        a teak frame (rails, a slatted bed, a slatted back raised 40 deg over the head third on two struts,
#                  wheels at the head end) and a mattress in two sections, the head one raised with the back
# Interface (the integrator depends on it):
#   KINDS; materials() creates or refreshes the node materials below; build(bm, item, z, slot) -> {"tris": n}.
#   item  {"kind", "at": [x, y], "face": [fx, fy] (unit, the front), "size": [w along u, d along v], "cushion":
#         offwhite | ecru | greige}; cafe_table also "top_r", "hole_r", "h"; optional "seed" (variation), "h" (a height
#         other than the kind's), "frame": "teak" (sofa / armchair). slot(name) -> the caller's material index.
#   Geometry goes into bm in world coordinates (u = (face.y, -face.x), as layer_roof_furniture.Frame); every vertex
#   inside |u| <= w/2, |v| <= d/2 (round tables inside their square); the lowest points exactly at z; seating faces +v
#   (seat fronts at +v, backs at -v; the lounger's raised back at -v, its foot end at +v).
# Materials (procedural, no textures; defined once in furniture_materials.py, shared with furniture_chairs.py):
# TM_RB_furn_teak (oiled teak, grain along U), TM_RB_furn_metal (charcoal powder coat),
# TM_RB_furn_fabric_<offwhite|ecru|greige> (a fine plain weave with sheen).
# Mesh data written: the UV layer "UVMap" (metres; box projection per piece, the wood grain along U following each
# piece's long axis, a seeded offset per item), face smooth flags and sharp edges (rounded parts smooth, flat faces
# flat, sharp where they meet). Keep them: rb_lib.finish would dissolve the profiles, box-project the UVs and
# re-smooth by angle; finish_object() writes a filled bmesh as an object without touching them.
# Triangles (measured by the test): dining_table 604, coffee_table 760, low_table 300, side_table 664, cafe_table 1160;
# sofa 2.1 m 4444 (3 modules, ~1480 each; teak frame 4072), 5 m banquette 10248 (8 modules, ~1280 each); armchair 1988
# (teak frame 1712); lounger 1908.
# Test renders (the composition lighting, never saved):
#   blender -b blender_files/terramar/parts/terramar_part_shell.blend \
#           --python furniture_tables_seating.py --
#           [out=<dir>] [samples=96] [shots=tables,seating,lounge,banquette,cafe_street,cafe_close,cushion_close,
#           table_close,lounger,sofa_rear,roof,roof_close] [pct=100]
#   (the before / after shots against the old prisms went with the prisms; the integration's pose sheets replace them)
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import importlib
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import furniture_materials as FM  # noqa: E402  (the shared furniture materials)

importlib.reload(FM)

KINDS = ("dining_table", "coffee_table", "low_table", "side_table", "cafe_table", "sofa", "armchair", "lounger")
WOOD, METAL = FM.TEAK, FM.METAL
FABRIC_RGB = FM.FABRIC_RGB
HEIGHT = {"dining_table": 0.74, "coffee_table": 0.38, "low_table": 0.40, "side_table": 0.51, "cafe_table": 0.75}
MARGIN = 0.0005                                          # every part keeps this far inside the footprint's edges
fabric = FM.fabric                                       # the fabric material name for a cushion colour


def _clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


# ---------------------------------------------------------------- materials


def materials():
    """Create or refresh this module's materials (furniture_materials.py): TM_RB_furn_teak, TM_RB_furn_metal,
    TM_RB_furn_fabric_<colour>."""
    FM.materials()


# ---------------------------------------------------------------- outlines


def _alloc(ha, hb, rc, q, arc=3):
    """Points per quadrant segment (right half-side, corner arc, top half-side) of a rounded rectangle, q in all: `arc`
    on the corner (so it stays round), the rest on the half-sides by length, at least one on each."""
    lens = [hb - rc, ha - rc]
    live = [i for i in range(2) if lens[i] > 1e-4]
    arc = min(arc, q - len(live))
    n = [0, 0]
    for i in live:
        n[i] = max(1, round((q - arc) * lens[i] / sum(lens[k] for k in live)))
    while sum(n) > q - arc and max(n) > 1:
        n[max(live, key=lambda k: n[k])] -= 1
    while sum(n) < q - arc:
        n[max(live, key=lambda k: lens[k] / n[k])] += 1
    return [n[0], arc, n[1]]


def rr_outline(ha, hb, rc, alloc):
    """[(point, outward normal)] round a rounded rectangle (half sizes ha along a, hb along b, corner radius rc):
    4 * sum(alloc) points counter-clockwise from (+ha, 0); point i mirrors point P - i across b = 0."""
    rc = _clamp(rc, 0.0, min(ha, hb) - 0.003)          # every segment keeps a length: the points stay distinct
    n1, n2, n3 = alloc
    quad = [((ha, (hb - rc) * k / n1), (1.0, 0.0)) for k in range(1, n1 + 1)]
    for k in range(1, n2 + 1):
        t = 0.5 * math.pi * k / n2
        quad.append(((ha - rc + rc * math.cos(t), hb - rc + rc * math.sin(t)), (math.cos(t), math.sin(t))))
    quad += [((ha - rc - (ha - rc) * k / n3, hb), (0.0, 1.0)) for k in range(1, n3 + 1)]
    q = len(quad)
    pts = [((ha, 0.0), (1.0, 0.0))] + quad
    pts += [((-p[0], p[1]), (-n[0], n[1])) for p, n in reversed(pts[:q])]
    pts += [((p[0], -p[1]), (n[0], -n[1])) for p, n in reversed(pts[1:2 * q])]
    return pts


def circle(r, n, phase=0.0):
    """[(point, outward normal)] round a circle of radius r, n points counter-clockwise from angle `phase`."""
    out = []
    for k in range(n):
        t = phase + 2 * math.pi * k / n
        out.append(((r * math.cos(t), r * math.sin(t)), (math.cos(t), math.sin(t))))
    return out


def _inset(outline, inset, h, centre=(0.0, 0.0)):
    return [(centre[0] + p[0] - n[0] * inset, centre[1] + p[1] - n[1] * inset, h) for p, n in outline]


# ---------------------------------------------------------------- the item and its pieces


class _Item:
    """An item's frame and the faces it adds: local (u, v, h) -> world, +v the item's front, h above the floor z."""

    def __init__(self, bm, item, z, slot):
        self.bm, self.slot, self.z = bm, slot, float(z)
        fx, fy = item["face"]
        n = math.hypot(fx, fy) or 1.0
        self.V = (fx / n, fy / n)
        self.U = (self.V[1], -self.V[0])
        self.c = (float(item["at"][0]), float(item["at"][1]))
        self.uv = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
        self.tris = 0
        self.rng = random.Random(f"furn:{item['kind']}:{self.c[0]:.3f}:{self.c[1]:.3f}:{item.get('seed', 0)}")
        self.off = (self.rng.uniform(0.0, 20.0), self.rng.uniform(0.0, 20.0))     # the item's grain offset

    def world(self, p):
        u, v, h = p
        return Vector((self.c[0] + self.U[0] * u + self.V[0] * v, self.c[1] + self.U[1] * u + self.V[1] * v,
                       self.z + h))


class _Piece:
    """One closed solid of one material. Rings are lists of part points (xf maps them to item coordinates); done() turns
    the normals out, makes edges sharp wherever a flat face meets, and writes UVs from the part points: a box
    projection in metres with the grain axis first when it lies in the face."""

    def __init__(self, it, mat, grain=0, xf=None, uv_off=None):
        self.it, self.mat, self.grain, self.xf = it, mat, grain, xf
        self.off = it.off if uv_off is None else uv_off
        self.faces, self.part = [], {}

    def ring(self, pts):
        out = []
        for p in pts:
            v = self.it.bm.verts.new(self.it.world(self.xf(p) if self.xf else p))
            self.part[v] = p
            out.append(v)
        return out

    def face(self, vs, smooth):
        f = self.it.bm.faces.new(vs)
        f.material_index = self.it.slot(self.mat)
        f.smooth = smooth
        self.faces.append(f)
        return f

    def bands(self, rings, smooth=True, cyclic=False, edge_smooth=None):
        """Quads between consecutive rings; smooth per band (bool or list), edge_smooth per ring edge (list or None)."""
        n = len(rings)
        for k in range(n if cyclic else n - 1):
            r0, r1 = rings[k], rings[(k + 1) % n]
            s = smooth[k] if isinstance(smooth, (list, tuple)) else smooth
            for i in range(len(r0)):
                j = (i + 1) % len(r0)
                self.face((r0[i], r0[j], r1[j], r1[i]), s and (edge_smooth is None or edge_smooth[i]))

    def cap(self, ring, centre=None):
        """A flat n-gon over the ring, or (centre given) a smooth fan to a pole at that part point."""
        if centre is None:
            self.face(list(ring), False)
            return
        c = self.ring([centre])[0]
        for i in range(len(ring)):
            self.face((ring[i], ring[(i + 1) % len(ring)], c), True)

    def done(self):
        bmesh.ops.recalc_face_normals(self.it.bm, faces=self.faces)
        for e in {e for f in self.faces for e in f.edges}:
            e.smooth = all(f.smooth for f in e.link_faces)
        uv, g, (o0, o1) = self.it.uv, self.grain, self.off
        for f in self.faces:
            pts = [self.part[v] for v in f.verts]
            nx = ny = nz = 0.0
            for i, p in enumerate(pts):                                   # Newell normal in part space
                q = pts[(i + 1) % len(pts)]
                nx += (p[1] - q[1]) * (p[2] + q[2])
                ny += (p[2] - q[2]) * (p[0] + q[0])
                nz += (p[0] - q[0]) * (p[1] + q[1])
            ax = max(range(3), key=lambda i: abs((nx, ny, nz)[i]))
            others = [i for i in range(3) if i != ax]
            if g in others:
                others = [g] + [i for i in others if i != g]
            for loop in f.loops:
                p = self.part[loop.vert]
                loop[uv].uv = (p[others[0]] + o0, p[others[1]] + o1)
        self.it.tris += sum(len(f.verts) - 2 for f in self.faces)


def _box_xf(u0, u1, v0, v1, h0):
    """A cushion frame for an axis-aligned box: a along u, b along v, t up from h0; returns (xf, A, B)."""
    uc, vc = 0.5 * (u0 + u1), 0.5 * (v0 + v1)
    return (lambda p: (uc + p[0], vc + p[1], h0 + p[2])), u1 - u0, v1 - v0


def _frame_xf(origin, ea, eb, et):
    """A cushion frame from an origin and three item-space axes (a, b, t)."""
    o = Vector(origin)
    ea, eb, et = Vector(ea), Vector(eb), Vector(et)
    return lambda p: tuple(o + ea * p[0] + eb * p[1] + et * p[2])


# ---------------------------------------------------------------- upholstery


def _cushion(it, xf, A, B, T, mat, *, rc=0.05, e_top=0.04, e_bot=0.025, crown=0.015, bulge=0.006, bead=0.004,
             bead_bottom=False, angles=(60, 52, 45, 38, 22), mid=True, q=6, dome=2, power=3.0, sag=0.0, drop=0.004,
             vary=True):
    """An upholstered box cushion in its own frame (a, b, t): inside |a| <= A/2, |b| <= B/2, 0 <= t <= T + crown, the
    top +t. Rounded welts (radius e_top above, e_bot below; `angles` the top welt's rings, deg from the cap) with a
    piping bead at 45 deg (pinched by rings at 52 and 38 when present) and optionally at the bottom welt; sides bulging
    `bulge` at mid-side, corners pulled in and `drop` lower; a domed top (`power` flattens it, `sag` a seated dip)
    closed by a fan, or a flat cap without a crown; a flat n-gon below. Seeded by the item's rng."""
    rng = it.rng
    ha, hb = 0.5 * A, 0.5 * B
    e_top = max(0.004, min(e_top, hb - bulge - 0.008, 0.45 * T))
    e_bot = max(0.004, min(e_bot, hb - bulge - 0.008, 0.45 * T))
    rc = _clamp(max(rc, max(e_top, e_bot) + bulge + 0.006), 0.0, min(ha, hb) - 0.003)
    alloc = _alloc(ha, hb, rc, q)
    outer = rr_outline(ha, hb, rc, alloc)
    if vary:
        crown *= rng.uniform(0.80, 1.20)
        bead *= rng.uniform(0.85, 1.15)
        sag *= rng.uniform(0.5, 1.2)
    ca = rng.uniform(-0.05, 0.05) * ha if vary else 0.0          # the dome's crest, a little off centre
    cb = rng.uniform(-0.05, 0.05) * hb if vary else 0.0
    hac, hbc = ha - e_top, hb - e_top

    def side(p, n):                                                # 1 at mid-side, 0 at the corners
        return n[0] ** 2 * max(0.0, 1 - (p[1] / hb) ** 2) + n[1] ** 2 * max(0.0, 1 - (p[0] / ha) ** 2)

    def corner(a, b):                                              # smooth: 1 in the corners, 0 elsewhere
        sa, sb = _clamp((abs(a) / ha - 0.55) / 0.45, 0.0, 1.0), _clamp((abs(b) / hb - 0.55) / 0.45, 0.0, 1.0)
        return (sa * sa * (3 - 2 * sa)) * (sb * sb * (3 - 2 * sb))

    def lift(a, b):
        ra, rb = min(1.0, abs(a - ca) / hac), min(1.0, abs(b - cb) / hbc)
        dip = sag * math.exp(-((a / (0.55 * ha)) ** 2 + ((b - 0.15 * hb) / (0.5 * hb)) ** 2))
        return crown * (1 - ra ** power) * (1 - rb ** power) - dip

    # (inset, t, bulge weight) up the side: bottom welt, side, top welt with its bead, the top cap boundary
    s45 = math.sin(math.radians(45))
    prof = [(e_bot, 0.0, 0.0)]
    if bead_bottom:
        prof.append((e_bot * (1 - s45) - bead * s45, max(0.002, e_bot * (1 - s45) - bead * s45), 0.4))
    prof.append((0.0, e_bot, 0.75))
    if mid:
        prof.append((0.0, 0.5 * (e_bot + T - e_top), 1.0))
    prof.append((0.0, T - e_top, 0.75))
    for deg in angles:
        a = math.radians(deg)
        inset, t = e_top * (1 - math.sin(a)), T - e_top * (1 - math.cos(a))
        if deg == 45:
            inset, t = inset - bead * math.sin(a), t + bead * math.cos(a)
        elif deg in (52, 38):
            inset, t = inset + 0.45 * bead * math.sin(a), t - 0.45 * bead * math.cos(a)
        prof.append((inset, t, 0.6 * deg / 60.0))
    prof.append((e_top, T, 0.0))
    rings = []
    for inset, t, wgt in prof:
        ring = []
        for p, n in outer:
            sf = side(p, n)
            ins = inset + bulge * (1 - wgt * sf)
            hh = t + (lift(p[0] - n[0] * ins, p[1] - n[1] * ins) if t >= T - 1e-9 else 0.0)
            a, b = p[0] - n[0] * ins, p[1] - n[1] * ins
            hh -= drop * corner(a, b) * max(0.0, (t - 0.5 * T) / (0.5 * T))
            ring.append((a, b, hh))
        rings.append(ring)
    centre = None
    if crown > 0:
        # the dome: copies of the cap boundary ring scaled towards the centre (an even inset on both axes), so every
        # point keeps its place round the cushion; a fan closes the small innermost ring
        cap = rings[-1]
        for f in ((0.3, 0.58, 0.84) if dome >= 3 else (0.34, 0.72) if dome == 2 else (0.55,)):
            d = f * 0.92 * min(hac, hbc)
            sa, sb = (hac - d) / hac, (hbc - d) / hbc
            ring = []
            for c in cap:
                a, b = c[0] * sa, c[1] * sb
                ring.append((a, b, T + lift(a, b) - drop * corner(a, b)))
            rings.append(ring)
        centre = (0.0, 0.0, T + lift(0.0, 0.0))
    pc = _Piece(it, mat, 0, xf, uv_off=(rng.uniform(0, 5), rng.uniform(0, 5)))
    vs = [pc.ring(r) for r in rings]
    pc.bands(vs, True)
    pc.cap(vs[0])
    pc.cap(vs[-1], centre)
    pc.done()


def _round_leg(it, cu, cv, h, r_top, r_bot, segs=8, mat=WOOD):
    """A short tapered round leg standing on the floor (flat caps, smooth sides, the grain up the leg)."""
    _revolve(it, cu, cv, [(r_bot, 0.0), (r_top, h)], segs, mat, True)


def _revolve(it, cu, cv, prof, segs, mat, smooth, cyclic=False, phase=0.0):
    """A solid of revolution about the vertical through (cu, cv) from a (r, h) profile; open profiles get flat caps."""
    pc = _Piece(it, mat, 2)
    angles = [phase + 2 * math.pi * k / segs for k in range(segs)]
    vs = [pc.ring([(cu + r * math.cos(t), cv + r * math.sin(t), h) for t in angles]) for r, h in prof]
    pc.bands(vs, smooth, cyclic)
    if not cyclic:
        pc.cap(vs[0])
        pc.cap(vs[-1])
    pc.done()


def _teak_frame(it, w, d, arm_w, back_h, v_f, z_deck):
    """The open teak frame of an outdoor sofa / armchair: corner posts (the back ones up to the top rail), arm boards
    on two side rails, front and back aprons, a slatted back, a platform under the cushions; middle posts on long
    runs."""
    post, ch = 0.05, 0.004
    spans = max(1, math.ceil((w - post) / 1.8))
    us = [-w / 2 + post / 2 + (w - post) * i / spans for i in range(spans + 1)]
    vb, vf = -d / 2 + post / 2, d / 2 - post / 2
    top = back_h - 0.07
    for i, u in enumerate(us):
        end = i in (0, spans)
        su = -1 if u < 0 else 1
        _sq_leg(it, u, vf, 0.0, 0.57 if end else z_deck - 0.03, post, post * 0.8, ch, (su, 1))
        _sq_leg(it, u, vb, 0.0, top, post, post * 0.8, ch, (su, -1))
    for sgn in (-1, 1):                                             # the arms: a board on two rails between the posts
        uc = sgn * (w / 2 - post / 2)
        for zr in (0.25, 0.42):
            _bar(it, (uc, vb + post / 2, zr), (uc, vf - post / 2, zr), 0.03, 0.05, 0.003)
        ab = w / 2 - arm_w / 2 if sgn > 0 else -w / 2 + arm_w / 2
        _top(it, _shift(rr_outline(arm_w / 2, d / 2, 0.022, (1, 2, 1)), ab, 0.0), 0.60, 0.03, 0.007, 0.006, grain=1,
             angles=(45,))
    span_u = w - 2 * post
    for v in (vb, vf):                                              # aprons
        _bar(it, (-span_u / 2, v, z_deck - 0.065), (span_u / 2, v, z_deck - 0.065), 0.03, 0.09, 0.003)
    _bar(it, (-span_u / 2, 0.0, z_deck - 0.01), (span_u / 2, 0.0, z_deck - 0.01), d - 2 * post, 0.02, 0.0)
    for z0 in (0.38, 0.50, top - 0.12):                             # back slats and the top rail
        _bar(it, (-span_u / 2, vb, z0), (span_u / 2, vb, z0), 0.022, 0.07, 0.003)
    _bar(it, (-span_u / 2, vb, top - 0.035), (span_u / 2, vb, top - 0.035), 0.04, 0.07, 0.004)


def _shift(outline, du, dv):
    return [((p[0] + du, p[1] + dv), n) for p, n in outline]


def _cushions(it, mat, rng, d, n, inner, mod, gap, v_f, z_deck, seat_t, cush_t, back_h, s, one):
    """One seat cushion and one leaning back cushion per module, between the arms, in front of v_f, on z_deck."""
    tilt = math.radians(8.0 + 5.0 * s)
    for k in range(n):
        uc = -inner / 2 + mod * (k + 0.5) + rng.uniform(-0.004, 0.004)
        # seat cushion: from just in front of the back frame to the front edge (its rear under the back cushion)
        xf, A, B = _box_xf(uc - (mod - gap) / 2, uc + (mod - gap) / 2, v_f + 0.008, d / 2, z_deck)
        _cushion(it, xf, A, B, seat_t, mat, rc=0.055, e_top=0.045, e_bot=0.03, crown=0.016, bulge=0.008,
                 bead=0.005, bead_bottom=True, q=5 if one else 6, dome=2, power=2.6, sag=0.006, drop=0.006)
        # back cushion: leaning on the frame's front at its top, its foot on the seat cushion's rear
        a = tilt + math.radians(rng.uniform(-1.2, 1.2))
        z_r = z_deck + seat_t - 0.016
        bb = (back_h - z_r - cush_t * math.sin(a) - 0.012) / math.cos(a)
        origin = (uc, v_f + bb * math.sin(a) + 0.004, z_r)
        ea, eb, et = (1.0, 0.0, 0.0), (0.0, -math.sin(a), math.cos(a)), (0.0, math.cos(a), math.sin(a))
        base = _frame_xf(origin, ea, eb, et)
        xf = (lambda bxf, half: (lambda p: bxf((p[0], p[1] + half, p[2]))))(base, bb / 2)
        _cushion(it, xf, mod - gap, bb, cush_t, mat, rc=0.06, e_top=0.05, e_bot=0.035, crown=0.022, bulge=0.009,
                 bead=0.005, q=5, dome=2, power=2.2, drop=0.008)


def _sofa(it, w, d, colour, one=False, frame="upholstered"):
    """Sofa / banquette / armchair: seat and back cushions per module on an upholstered body (legs, deck, back frame,
    welted arms) or, with frame="teak", on an open teak frame."""
    mat = fabric(colour)
    rng = it.rng
    teak = frame == "teak"
    s = _clamp((d - 0.6) / 0.3, 0.0, 1.0)                          # 0 a banquette (0.6 deep) .. 1 a lounge sofa
    leg_h = 0.085
    arm_w = 0.10 if teak else min(0.11 + 0.05 * s, 0.2 * w)
    arm_h = 0.58 + 0.03 * s
    back_h = 0.80
    frame_t = 0.04 if teak else 0.065 + 0.075 * s
    cush_t = 0.10 + 0.065 * s
    z_deck, seat_t = (0.29, 0.14) if teak else (0.275, 0.15)
    inner = w - 2 * arm_w
    n = 1 if one else max(1, round(inner / (0.6 + 0.08 * s)))
    mod, gap = inner / n, 0.006
    long_q = 4 + min(4, int(inner / 1.2))
    if teak:
        _teak_frame(it, w, d, arm_w, back_h, -d / 2 + frame_t, z_deck)
        _cushions(it, mat, rng, d, n, inner, mod, gap, -d / 2 + frame_t, z_deck, seat_t, cush_t, back_h, s, one)
        return
    # arms: welted, a crown so slight it reads as a padded top
    for sgn in (-1, 1):
        u0, u1 = (w / 2 - arm_w, w / 2) if sgn > 0 else (-w / 2, -w / 2 + arm_w)
        xf, A, B = _box_xf(u0, u1, -d / 2, d / 2, leg_h)
        _cushion(it, xf, A, B, arm_h - leg_h, mat, rc=0.035, e_top=0.048, e_bot=0.012, crown=0.0, bulge=0.004,
                 bead=0.0035, angles=(60, 45, 28, 10), mid=False, q=4, drop=0.0, vary=False)
    # the back frame (between the arms, tucked into them) and the deck under the seat cushions
    v_f = -d / 2 + frame_t
    xf, A, B = _box_xf(-inner / 2 - 0.012, inner / 2 + 0.012, -d / 2, v_f, leg_h)
    _cushion(it, xf, A, B, back_h - 0.11 - leg_h, mat, rc=0.02, e_top=min(0.045, frame_t / 2 - 0.01), e_bot=0.012,
             crown=0.0, bulge=0.003, bead=0.0035, angles=(60, 45, 20), mid=False, q=long_q, drop=0.0, vary=False)
    xf, A, B = _box_xf(-inner / 2 - 0.01, inner / 2 + 0.01, v_f - 0.02, d / 2 - 0.006, leg_h)
    _cushion(it, xf, A, B, z_deck - leg_h, mat, rc=0.025, e_top=0.016, e_bot=0.01, crown=0.0, bulge=0.002, bead=0.0,
             angles=(45,), mid=False, q=long_q, drop=0.0, vary=False)
    _cushions(it, mat, rng, d, n, inner, mod, gap, v_f, z_deck, seat_t, cush_t, back_h, s, one)
    # legs under the arms' corners and along a long run
    spans = max(1, math.ceil((w - 0.11) / 1.6))
    for i in range(spans + 1):
        u = -w / 2 + 0.055 + (w - 0.11) * i / spans
        for v in (-d / 2 + 0.055, d / 2 - 0.055):
            _round_leg(it, u, v, leg_h, 0.021, 0.0145)


def _lounger(it, w, d, colour):
    """A teak sun lounger: rails, chamfered legs at the foot, wheels at the head (-v), a slatted bed, a slatted back
    raised 40 deg over the head third on two struts; a mattress in two sections."""
    mat = fabric(colour)
    rail_w, rail_h = 0.035, 0.10
    wheel_r, wheel_w = 0.065, 0.022
    u_r = w / 2 - wheel_w - 0.004 - rail_w / 2                       # rail centre line: the wheels sit outboard
    z_r0, z_r1 = 0.17, 0.27
    for sgn in (-1, 1):
        zc = 0.5 * (z_r0 + z_r1)
        _bar(it, (sgn * u_r, -d / 2, zc), (sgn * u_r, d / 2, zc), rail_w, rail_h, 0.005)
        _sq_leg(it, sgn * u_r, d / 2 - 0.055, 0.0, z_r0 + 0.01, 0.045, 0.040, 0.004, (sgn, 1))
        _sq_leg(it, sgn * u_r, -d / 2 + 0.085, wheel_r - 0.012, z_r0 + 0.01, 0.045, 0.045, 0.004, (sgn, -1))
        _wheel(it, sgn * (w / 2 - wheel_w / 2), -d / 2 + 0.085, wheel_r, wheel_w)
    span = 2 * u_r - rail_w
    for v in (-d / 2 + 0.03, d / 2 - 0.03):                          # cross rails at both ends
        _bar(it, (-span / 2, v, 0.22), (span / 2, v, 0.22), 0.035, 0.06, 0.004)
    _bar(it, (-w / 2 + wheel_w / 2, -d / 2 + 0.085, wheel_r), (w / 2 - wheel_w / 2, -d / 2 + 0.085, wheel_r),
         0.018, 0.018, 0.003, mat=METAL)                             # the axle through the head legs into the wheels
    # the bed: slats across the rails from the hinge to the foot
    alpha, lb = math.radians(40.0), d / 3
    v_h = -d / 2 + 0.05 + lb * math.cos(alpha)
    z_s = z_r1 + 0.018
    width = 2 * u_r + rail_w - 0.004
    pitch, slat = 0.085, 0.064
    nb = int((d / 2 - 0.035 - v_h) / pitch)
    for i in range(nb):
        v = v_h + 0.03 + i * pitch + slat / 2
        _bar(it, (-width / 2, v, z_r1 + 0.009), (width / 2, v, z_r1 + 0.009), slat, 0.018, 0.0)   # under the mattress
    # the raised back: two side bars hinged at v_h, slats across them, two struts down to the rails
    eb = Vector((0.0, -math.cos(alpha), math.sin(alpha)))
    et = Vector((0.0, math.sin(alpha), math.cos(alpha)))
    hinge = Vector((0.0, v_h, z_r1 + 0.02))
    for sgn in (-1, 1):
        p0 = hinge + Vector((sgn * (u_r - 0.004), 0.0, 0.0))
        _bar(it, tuple(p0), tuple(p0 + eb * lb), 0.03, 0.04, 0.004, up=tuple(et))
        foot = Vector((sgn * (u_r - 0.03), -d / 2 + 0.16, z_r1 + 0.012))
        top = hinge + Vector((sgn * (u_r - 0.03), 0.0, 0.0)) + eb * (0.62 * lb) - et * 0.02
        _bar(it, tuple(foot), tuple(top), 0.024, 0.024, 0.003, up=(1.0, 0.0, 0.0))
    nbk = int((lb - 0.05) / pitch)
    for i in range(nbk):
        c = hinge + eb * (0.04 + i * pitch + slat / 2) + et * 0.029
        half = Vector((width / 2 - 0.006, 0, 0))
        _bar(it, tuple(c - half), tuple(c + half), slat, 0.018, 0.004, up=tuple(et), bottom=False)
    # the mattress: the flat section from the hinge to the foot, the head section on the raised back
    mw = width - 0.01
    xf, A, B = _box_xf(-mw / 2, mw / 2, v_h - 0.01, d / 2 - 0.03, z_s)
    _cushion(it, xf, A, B, 0.07, mat, rc=0.05, e_top=0.028, e_bot=0.018, crown=0.009, bulge=0.005, bead=0.003,
             angles=(60, 45, 25), mid=False, q=7, dome=2, power=4.0, drop=0.003)
    base = hinge + et * 0.038
    lbm = lb - 0.01
    xf = (lambda o: (lambda p: tuple(o + Vector((p[0], 0, 0)) + eb * (p[1] + lbm / 2) + et * p[2])))(base)
    _cushion(it, xf, mw, lbm, 0.065, mat, rc=0.05, e_top=0.028, e_bot=0.018, crown=0.008, bulge=0.005, bead=0.003,
             angles=(60, 45, 25), mid=False, q=6, dome=2, power=4.0, drop=0.003)


# ---------------------------------------------------------------- wood and metal members


def _bar(it, p0, p1, wdt, hgt, ch, up=(0.0, 0.0, 1.0), mat=WOOD, bottom=True):
    """A straight member from p0 to p1 (item coordinates, its centre line), wdt x hgt with chamfered arrises (the
    bottom ones square when bottom is False; a plain box when ch is 0), flat faces, the grain along it."""
    a, b = Vector(p0), Vector(p1)
    ax = (b - a).normalized()
    sv = ax.cross(Vector(up)).normalized()
    uv = sv.cross(ax).normalized()
    hw, hh = wdt / 2, hgt / 2
    if ch <= 0:
        sect = [(hw, hh), (-hw, hh), (-hw, -hh), (hw, -hh)]
    else:
        sect = [(hw, hh - ch), (hw - ch, hh), (-hw + ch, hh), (-hw, hh - ch)]
        sect += ([(-hw, -hh + ch), (-hw + ch, -hh), (hw - ch, -hh), (hw, -hh + ch)] if bottom
                 else [(-hw, -hh), (hw, -hh)])
    grain = max(range(3), key=lambda i: abs(ax[i]))
    pc = _Piece(it, mat, grain)
    rings = [pc.ring([tuple(c + sv * x + uv * y) for x, y in sect]) for c in (a, b)]
    pc.bands(rings, False)
    pc.cap(rings[0])
    pc.cap(rings[1])
    pc.done()


def _sq_leg(it, cu, cv, h0, h1, s_top, s_bot, ch, outward, mat=WOOD):
    """A square leg from h0 to h1, s_top square at the top tapering to s_bot on its inner faces (the outer faces,
    towards `outward` = (su, sv), stay plumb), chamfered arrises."""
    su, sv = outward
    def sect(s):
        h = s / 2
        return [(h, h - ch), (h - ch, h), (-h + ch, h), (-h, h - ch), (-h, -h + ch), (-h + ch, -h), (h - ch, -h),
                (h, -h + ch)]
    sh = 0.5 * (s_top - s_bot)
    pc = _Piece(it, mat, 2)
    bot = pc.ring([(cu + su * sh + x, cv + sv * sh + y, h0) for x, y in sect(s_bot)])
    top = pc.ring([(cu + x, cv + y, h1) for x, y in sect(s_top)])
    pc.bands([bot, top], False)
    pc.cap(bot)
    pc.cap(top)
    pc.done()


def _wheel(it, cu, cv, r, wdt, segs=12):
    """A lounger wheel turning about the u axis: a tyre with eased shoulders (the lowest vertex on the floor), recessed
    hub faces."""
    pc = _Piece(it, METAL, 0)
    prof = [(r * 0.5, -wdt / 2 + 0.004), (r - 0.004, -wdt / 2), (r, -wdt / 2 + 0.005), (r, wdt / 2 - 0.005),
            (r - 0.004, wdt / 2), (r * 0.5, wdt / 2 - 0.004)]
    rings = []
    for rad, x in prof:
        rings.append(pc.ring([(cu + x, cv + rad * math.cos(-0.5 * math.pi + 2 * math.pi * k / segs),
                               r + rad * math.sin(-0.5 * math.pi + 2 * math.pi * k / segs)) for k in range(segs)]))
    pc.bands(rings, [False, True, True, True, False])
    pc.cap(rings[0])
    pc.cap(rings[-1])
    pc.done()


def _top(it, outline, h1, thick, e, under, mat=WOOD, grain=0, hole=None, angles=(55, 25, 7)):
    """A table top over an outline (rounded rectangle or circle): an undercut chamfer `under` below, plumb sides, an
    eased top edge of radius e, flat caps; with hole = (r, n) a round hole through the centre (n points, every second
    outline point: pentagons join the caps to it)."""
    h0 = h1 - thick
    prof = [(under, h0), (0.0, h0 + 0.7 * under), (0.0, h1 - e)]
    prof += [(e * (1 - math.sin(math.radians(a))), h1 - e * (1 - math.cos(math.radians(a)))) for a in angles]
    prof.append((e, h1))
    pc = _Piece(it, mat, grain)
    rings = [pc.ring(_inset(outline, i, h)) for i, h in prof]
    pc.bands(rings, [False] + [True] * (len(rings) - 2))
    if hole is None:
        pc.cap(rings[0])
        pc.cap(rings[-1])
    else:
        r_h, n_h = hole
        hp = [(r_h * math.cos(2 * math.pi * k / n_h), r_h * math.sin(2 * math.pi * k / n_h)) for k in range(n_h)]
        ht = pc.ring([(x, y, h1) for x, y in hp])
        hb = pc.ring([(x, y, h0) for x, y in hp])
        pc.bands([ht, hb], True)
        P = len(outline)
        for ring, hr in ((rings[-1], ht), (rings[0], hb)):
            for i in range(n_h):
                pc.face((ring[2 * i], ring[(2 * i + 1) % P], ring[(2 * i + 2) % P], hr[(i + 1) % n_h], hr[i]), False)
    pc.done()


# ---------------------------------------------------------------- tables


def _rect_top(it, w, d, h, thick, rc, e, under):
    grain = 0 if w >= d else 1
    _top(it, rr_outline(w / 2, d / 2, rc, (1, 6, 1)), h, thick, e, under, grain=grain)


def _apron(it, w, d, h_top, height, inset, t):
    """Four apron rails under a top, their outer faces `inset` in from its edges."""
    hu, hv = w / 2 - inset - t / 2, d / 2 - inset - t / 2
    hm = h_top - height / 2
    _bar(it, (-hu - t / 2, hv, hm), (hu + t / 2, hv, hm), t, height, 0.0)
    _bar(it, (-hu - t / 2, -hv, hm), (hu + t / 2, -hv, hm), t, height, 0.0)
    _bar(it, (hu, -hv + t / 2, hm), (hu, hv - t / 2, hm), t, height, 0.0)
    _bar(it, (-hu, -hv + t / 2, hm), (-hu, hv - t / 2, hm), t, height, 0.0)


def _legs4(it, w, d, h1, inset, s_top, s_bot, ch=0.003):
    for su in (-1, 1):
        for sv in (-1, 1):
            cu, cv = su * (w / 2 - inset - s_top / 2), sv * (d / 2 - inset - s_top / 2)
            _sq_leg(it, cu, cv, 0.0, h1, s_top, s_bot, ch, (su, sv))


def _dining_table(it, w, d, h):
    thick = 0.036
    _rect_top(it, w, d, h, thick, 0.04 if min(w, d) > 0.75 else 0.03, 0.008, 0.014)
    inset = 0.05 if min(w, d) > 0.75 else 0.04
    _apron(it, w, d, h - thick, 0.075, inset, 0.022)
    _legs4(it, w, d, h - thick, inset, 0.052, 0.034)


def _coffee_table(it, w, d, h):
    thick = 0.032
    _rect_top(it, w, d, h, thick, 0.035, 0.007, 0.011)
    _apron(it, w, d, h - thick, 0.05, 0.045, 0.02)
    s_top, s_bot, z_shelf = 0.044, 0.03, 0.125
    _legs4(it, w, d, h - thick, 0.045, s_top, s_bot)
    s_at = s_bot + (s_top - s_bot) * (z_shelf - 0.009) / (h - thick)      # the legs' size at the shelf
    ha, hb = w / 2 - 0.045 - s_at + 0.002, d / 2 - 0.045 - s_at + 0.002   # the shelf, meeting the legs' inner faces
    _top(it, rr_outline(ha, hb, 0.012, _alloc(ha, hb, 0.012, 4)), z_shelf, 0.018, 0.004, 0.004,
         grain=0 if w >= d else 1, angles=(45,))


def _low_table(it, w, d, h):
    """Outdoor slatted table: slats along the long side, an apron frame, four chamfered legs."""
    along = 0 if w >= d else 1
    la, lc = (w, d) if along == 0 else (d, w)
    P = (lambda a, c, z: (a, c, z)) if along == 0 else (lambda a, c, z: (c, a, z))
    t_slat, n = 0.022, max(4, round((lc + 0.012) / 0.082))
    gap = 0.010
    sw = (lc - gap * (n - 1)) / n
    for i in range(n):
        c = -lc / 2 + sw / 2 + i * (sw + gap)
        _bar(it, P(-la / 2, c, h - t_slat / 2), P(la / 2, c, h - t_slat / 2), sw, t_slat, 0.004, bottom=False,
             up=(0.0, 0.0, 1.0))
    h_ap = h - t_slat
    _apron(it, w, d, h_ap, 0.06, 0.035, 0.024)
    _legs4(it, w, d, h_ap, 0.035, 0.046, 0.046, 0.004)


def _side_table(it, w, d, h):
    r = 0.5 * min(w, d)
    thick = 0.026
    _top(it, circle(r, 32), h, thick, 0.007, 0.007, grain=0, angles=(50, 15))
    rb = min(0.17, r - 0.02)
    prof = [(rb - 0.004, 0.0), (rb, 0.005), (rb - 0.006, 0.016), (rb * 0.55, 0.026), (0.03, 0.032), (0.0155, 0.05),
            (0.0135, h - thick - 0.03), (0.04, h - thick - 0.012), (0.05, h - thick)]
    _revolve(it, 0.0, 0.0, prof, 16, METAL, [True, True, True, True, True, True, True, True])


def _cafe_table(it, w, d, item):
    """Round wood top with the umbrella hole, hollow charcoal column, four cast arms, a spider under the top."""
    h = float(item.get("h", HEIGHT["cafe_table"]))
    r = min(float(item.get("top_r", 0.40)), 0.5 * min(w, d))
    r_h = float(item.get("hole_r", 0.035))
    thick = 0.03
    P = 36
    _top(it, circle(r, P), h, thick, 0.008, 0.009, grain=0, hole=(r_h, P // 2), angles=(50, 15))
    ht = h - thick
    wall = r_h + 0.011                                              # the column's outer radius (a 11 mm wall)
    prof = [(0.07, 0.0), (0.07, 0.016), (0.055, 0.038), (wall + 0.002, 0.07), (wall, 0.11), (wall, ht - 0.07),
            (wall + 0.016, ht - 0.035), (wall + 0.016, ht), (r_h, ht), (r_h, 0.0)]
    _revolve(it, 0.0, 0.0, prof, 14, METAL, [True, True, True, True, True, True, True, False, True, False], cyclic=True)
    reach = min(0.30, 0.5 * min(w, d) - 0.02)
    for k in range(4):
        _cast_arm(it, math.pi / 4 + k * math.pi / 2, 0.05, reach)
    for k in range(2):                                              # the spider: two crossed bars under the top
        t = k * math.pi / 2 + math.pi / 4
        c, s = math.cos(t), math.sin(t)
        L = min(0.27, r - 0.06)
        for sgn in (-1, 1):
            p0 = (sgn * c * (wall + 0.012), sgn * s * (wall + 0.012), ht - 0.009)
            p1 = (sgn * c * L, sgn * s * L, ht - 0.009)
            _bar(it, p0, p1, 0.026, 0.018, 0.003, mat=METAL)


def _cast_arm(it, ang, r0, r1, n=7):
    """One cast foot of the café base: a tapering arm with a rounded top, arched off the floor between the hub and its
    pad (the pad's underside on the floor)."""
    c, s = math.cos(ang), math.sin(ang)
    secs = [(r0, 0.026, 0.055, 0.0), (r0 + 0.3 * (r1 - r0), 0.021, 0.04, 0.012),
            (r0 + 0.75 * (r1 - r0), 0.017, 0.03, 0.011), (r1 - 0.025, 0.017, 0.026, 0.0), (r1, 0.016, 0.022, 0.0)]
    pc = _Piece(it, METAL, 0)
    rings = []
    for rr, hw, top, bot in secs:
        ht = min(0.6 * (top - bot), hw)
        pts = [(hw, bot)] + [(hw * math.cos(math.pi * k / (n - 3)), top - ht + ht * math.sin(math.pi * k / (n - 3)))
                             for k in range(n - 2)] + [(-hw, bot)]
        rings.append(pc.ring([(rr * c - x * s, rr * s + x * c, y) for x, y in pts]))
    pc.bands(rings, True, edge_smooth=[True] * (n - 1) + [False])
    pc.cap(rings[0])
    pc.cap(rings[-1])
    pc.done()


# ---------------------------------------------------------------- entry


def build(bm, item, z, slot):
    """Add one item (tables, café table, sofa, armchair, lounger) to bm in world coordinates; returns {"tris": n}."""
    kind = item["kind"]
    if kind not in KINDS:
        raise ValueError(f"furniture_tables_seating: unknown kind {kind}")
    it = _Item(bm, item, z, slot)
    if "size" in item:
        w, d = float(item["size"][0]), float(item["size"][1])
    else:
        w = d = 2 * float(item.get("top_r", 0.40))
    w, d = w - 2 * MARGIN, d - 2 * MARGIN           # float32 world coordinates stay inside the footprint
    h = float(item.get("h", HEIGHT.get(kind, 0.0)))
    colour = item.get("cushion", "greige")
    if kind == "dining_table":
        _dining_table(it, w, d, h)
    elif kind == "coffee_table":
        _coffee_table(it, w, d, h)
    elif kind == "low_table":
        _low_table(it, w, d, h)
    elif kind == "side_table":
        _side_table(it, w, d, h)
    elif kind == "cafe_table":
        _cafe_table(it, w, d, item)
    elif kind in ("sofa", "armchair"):
        _sofa(it, w, d, colour, one=kind == "armchair", frame=item.get("frame", "upholstered"))
    else:
        _lounger(it, w, d, colour)
    return {"tris": it.tris}


def finish_object(name, coll, bm, slot_names, tags=None):
    """Write a bmesh filled by build() as an object: materials in slot order; the UVs, smooth flags and sharp edges
    kept."""
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for s in slot_names:
        me.materials.append(bpy.data.materials.get(s) or bpy.data.materials.new(s))
    ob = bpy.data.objects.new(name, me)
    for k, v in (tags or {}).items():
        ob[k] = v
    coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------- test renders


def _check(ob, item, z):
    """Footprint, floor contact and (café) hole checks on a test object; returns a list of problems."""
    w, d = (item["size"] if "size" in item else (2 * item.get("top_r", 0.4),) * 2)
    fx, fy = item["face"]
    V = (fx, fy)
    U = (fy, -fx)
    cx, cy = item["at"]
    problems, zmin = [], 1e9
    worst = 0.0
    for v in ob.data.vertices:
        p = ob.matrix_world @ v.co
        du, dv = (p.x - cx) * U[0] + (p.y - cy) * U[1], (p.x - cx) * V[0] + (p.y - cy) * V[1]
        worst = max(worst, abs(du) - w / 2, abs(dv) - d / 2)
        zmin = min(zmin, p.z)
        if item["kind"] == "cafe_table" and math.hypot(p.x - cx, p.y - cy) < item.get("hole_r", 0.035) - 1e-5:
            problems.append(f"vertex inside the pole hole at {tuple(round(c, 3) for c in p)}")
            break
    if item["kind"] == "cafe_table":                                  # the pole's path through the hole stays open
        bpy.context.view_layer.update()
        r = item.get("hole_r", 0.035) - 0.009
        for k in range(12):
            o = Vector((cx + r * math.cos(k * math.pi / 6), cy + r * math.sin(k * math.pi / 6), z - 0.5))
            if ob.ray_cast(ob.matrix_world.inverted() @ o, Vector((0.0, 0.0, 1.0)))[0]:
                problems.append("something blocks the pole's path")
                break
    if worst > 1e-5:                                                  # float32 at ~50 m
        problems.append(f"outside the footprint by {worst * 1000:.2f} mm")
    if abs(zmin - z) > 1e-6:
        problems.append(f"lowest point {zmin - z:+.4f} m from the floor")
    return problems


SHOTS = ("tables", "seating", "lounge", "banquette", "cafe_street", "cafe_close", "cushion_close", "table_close",
         "lounger", "sofa_rear", "roof", "roof_close")


def _test(argv):
    """Build the test sets near (40, -45) in the open file's composition lighting and render the views."""
    here = os.path.dirname(os.path.abspath(__file__))
    root = BP.ROOT
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    out = os.path.abspath(opts.get("out", BP.screens('buildings/terramar_recessed/rebuild/furniture_detail/tables_seating')))
    os.makedirs(out, exist_ok=True)
    shots = [s for s in opts.get("shots", ",".join(SHOTS)).split(",") if s]
    scene = bpy.context.scene
    assert "INSPECTION_RIG" in bpy.data.collections, "open terramar_building.blend (its INSPECTION_RIG lights the test)"
    sys.path.insert(0, os.path.dirname(here))
    from render_inspection import use_gpu  # noqa: E402
    scene.render.engine = "CYCLES"
    device = use_gpu(scene)
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    materials()
    coll = bpy.data.collections.new("FURN_TEST")
    scene.collection.children.link(coll)
    S = (0.0, -1.0)                                                  # the test fronts face the cameras (-y)
    items = [
        # tables lineup (y -55)
        {"kind": "dining_table", "at": [35.6, -55.0], "face": S, "size": [1.4, 0.85]},
        {"kind": "coffee_table", "at": [37.3, -55.0], "face": S, "size": [1.0, 0.55]},
        {"kind": "low_table", "at": [38.65, -55.0], "face": S, "size": [0.9, 0.55]},
        {"kind": "side_table", "at": [39.75, -55.0], "face": S, "size": [0.45, 0.45]},
        {"kind": "cafe_table", "at": [40.85, -55.0], "face": S, "size": [0.8, 0.8], "top_r": 0.40, "hole_r": 0.035,
         "h": 0.75},
        {"kind": "dining_table", "at": [42.4, -55.0], "face": S, "size": [0.7, 0.7]},
        # seating lineup (y -48)
        {"kind": "sofa", "at": [36.4, -48.0], "face": S, "size": [2.1, 0.9], "cushion": "ecru"},
        {"kind": "armchair", "at": [38.3, -48.0], "face": S, "size": [0.85, 0.85], "cushion": "offwhite"},
        {"kind": "lounger", "at": [40.0, -48.0], "face": (1.0, 0.0), "size": [0.7, 2.0], "cushion": "offwhite"},
        {"kind": "sofa", "at": [42.6, -48.0], "face": S, "size": [2.0, 0.85], "cushion": "greige"},
        # residential lounge (y -40)
        {"kind": "sofa", "at": [40.0, -39.2], "face": S, "size": [2.2, 0.9], "cushion": "ecru"},
        {"kind": "coffee_table", "at": [40.0, -40.3], "face": S, "size": [1.0, 0.55]},
        {"kind": "armchair", "at": [41.55, -40.35], "face": (-1.0, 0.0), "size": [0.8, 0.8], "cushion": "ecru"},
        {"kind": "side_table", "at": [38.6, -39.2], "face": S, "size": [0.45, 0.45]},
        # banquette (y -35)
        {"kind": "sofa", "at": [40.0, -34.69], "face": S, "size": [5.0, 0.62], "cushion": "ecru"},
        {"kind": "dining_table", "at": [38.3, -35.85], "face": S, "size": [0.7, 0.7]},
        {"kind": "dining_table", "at": [40.0, -35.85], "face": S, "size": [0.7, 0.7]},
        {"kind": "dining_table", "at": [41.7, -35.85], "face": S, "size": [0.7, 0.7]},
        # café (y -41, x 47)
        {"kind": "cafe_table", "at": [47.0, -41.0], "face": S, "size": [0.8, 0.8], "top_r": 0.40, "hole_r": 0.035,
         "h": 0.75},
        # roof terrace, teak frames (x 52, y -48)
        {"kind": "sofa", "at": [52.0, -47.4], "face": S, "size": [2.1, 0.9], "cushion": "greige", "frame": "teak"},
        {"kind": "low_table", "at": [52.0, -48.55], "face": S, "size": [0.9, 0.55]},
        {"kind": "armchair", "at": [50.55, -48.6], "face": (1.0, 0.0), "size": [0.85, 0.85], "cushion": "greige",
         "frame": "teak"},
        {"kind": "armchair", "at": [53.45, -48.6], "face": (-1.0, 0.0), "size": [0.85, 0.85], "cushion": "greige",
         "frame": "teak"},
        {"kind": "side_table", "at": [50.55, -47.45], "face": S, "size": [0.44, 0.44]},
        {"kind": "lounger", "at": [55.6, -48.2], "face": S, "size": [0.7, 2.0], "cushion": "offwhite"},
    ]
    report = []
    for i, item in enumerate(items):
        bm = bmesh.new()
        slots = []

        def slot(name, slots=slots):
            if name not in slots:
                slots.append(name)
            return slots.index(name)
        res = build(bm, item, 0.0, slot)
        ob = finish_object(f"FURN_TEST_{i:02d}_{item['kind']}", coll, bm, slots)
        problems = _check(ob, item, 0.0)
        report.append((item["kind"], tuple(item.get("size", ())), res["tris"], problems))
        print(f"FURN {item['kind']:13s} {str(tuple(item.get('size', ()))):14s} tris {res['tris']:6d} "
              f"{'OK' if not problems else '; '.join(problems)}")
    # the umbrella poles through the café tables (r 0.025)
    for x, y in ((40.85, -55.0), (47.0, -41.0)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.025, depth=2.4, location=(x, y, 1.2))
        pole = bpy.context.active_object
        pole.data.materials.append(bpy.data.materials.get(WOOD))
        for c in pole.users_collection:
            c.objects.unlink(pole)
        coll.objects.link(pole)
    cams = {   # name: (location, target, vfov_deg, resolution)
        "tables": ((38.8, -63.2, 1.7), (38.8, -55.0, 0.45), 30.0, (1600, 900)),
        "seating": ((39.5, -53.6, 1.6), (39.5, -48.0, 0.4), 33.0, (1600, 900)),
        "lounge": ((37.6, -43.6, 1.55), (40.1, -39.7, 0.42), 36.0, (1600, 900)),
        "banquette": ((36.6, -39.6, 1.6), (40.0, -35.2, 0.45), 38.0, (1600, 900)),
        "cafe_street": ((49.5, -53.0, 1.6), (47.0, -41.0, 0.6), 9.0, (1600, 900)),
        "cafe_close": ((47.85, -42.35, 1.25), (47.0, -41.0, 0.5), 40.0, (1600, 900)),
        "cushion_close": ((41.05, -40.55, 0.78), (40.75, -39.35, 0.45), 34.0, (1600, 900)),
        "table_close": ((36.55, -56.05, 0.95), (36.25, -55.4, 0.66), 34.0, (1600, 900)),
        "lounger": ((38.3, -50.4, 1.3), (40.0, -48.0, 0.35), 34.0, (1600, 900)),
        "sofa_rear": ((41.9, -37.0, 1.75), (40.0, -39.3, 0.45), 38.0, (1600, 900)),
        "roof": ((49.7, -52.6, 1.65), (52.6, -48.1, 0.4), 38.0, (1600, 900)),
        "roof_close": ((52.9, -49.35, 0.95), (53.3, -48.3, 0.5), 40.0, (1600, 900)),
    }
    cam_data = bpy.data.cameras.new("FURN_TEST_cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 0.02
    cam = bpy.data.objects.new("FURN_TEST_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name in shots:
        loc, target, vfov, res = cams[name]
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam_data.angle_y = math.radians(vfov)
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = os.path.join(out, f"ts_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name} on {device} -> {scene.render.filepath}")
    bad = [r for r in report if r[3]]
    print(f"FURN TEST DONE: {len(report)} items, {len(bad)} with problems (the .blend is not saved)")


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
