# furniture_chairs.py -- detailed chairs and stools for the Terra & Mar rebuild, one item at a time into a caller's
# bmesh.
#
# The layers drew every seat as box prisms (layer_roof_furniture.model, layer_site_cafe.chair, the stools of
# layer_restaurant_l0 / layer_penthouse). b8's sidewalk café shows woven rattan bistro chairs (tan bent round frames,
# curved backs, arms, lighter woven seats and backs) and the restaurant behind the glass wooden dining chairs; this
# module models them as real furniture for the integrating layers:
#   KINDS          ("dining_chair", "cafe_chair", "bar_stool")
#   materials()    creates or refreshes the TM_RB_furn_* materials (procedural nodes, all UV driven, each shifted per
#                  object so linked duplicates differ): the shared ones from furniture_materials.py -- TM_RB_furn_teak
#                  (the grain along every member: u = along the member, metres), TM_RB_furn_metal (the stool's
#                  footrest), TM_RB_furn_fabric_<colour> (the dining-chair pads and stool cushions, as the sofas) --
#                  and the chairs' own:
#                    TM_RB_furn_rattan        round rattan poles: honey tan, fibre streaks, darker growth nodes, a
#                                             light lacquer coat
#                    TM_RB_furn_rattan_wrap   the cane binding wound round the frame joints (a helix of strips)
#                    TM_RB_furn_weave         the woven seats and backs of the bistro chairs (over-under strands with a
#                                             tint per strand and dark gaps)
#                    TM_RB_furn_cane          open cane webbing (pairs of straight strands, diagonals, see-through
#                                             octagonal holes) for the caned dining-chair backs
#   build(bm, item, z, slot) -> {"tris", "variant", "fit", "parts"} (fit: the footprint fit's u / v scales, 1.0 when
#                  none was needed; parts: triangles per part)
#                  one item into bm in world coordinates. item: {"kind", "at": [x, y], "face": [fx, fy] (the item's
#                  front, its local +v; u = (fy, -fx)), "size": [w along u, d along v], "cushion": "offwhite" | "ecru"
#                  | "greige"}, optional "seat_h" (bar_stool 0.66 / 0.76, default 0.76; cafe_chair default 0.45),
#                  "back_h" (cafe_chair, default 0.90), "variant" (forces one), "set" (any value: the seed key, e.g. the
#                  table, so a set matches).
#                  z: the floor. slot(name) -> the caller's material index. Faces carry material indices, smooth
#                  flags and sharp edges (rounded sections keep flat faces flat) and UVs in the layer "UVMap".
#   finish_object(name, coll, bm, names, tags)   a mesh object from such a bmesh WITHOUT rb_lib.finish's box UVs and
#                  coplanar dissolve (those would wipe the member UVs the shaders need)
# Every vertex stays inside the item's footprint rectangle (u in +-w/2, v in +-d/2: a last fit pass scales an item in
# if a part pokes out, and reports it), the feet are cut flat exactly at z and nothing goes below it; a sitter looks
# along +v, the back is at -v. Parts meet inside one another only where a real joint hides it.
# Kinds and variants (the variant from item["variant"], else a hash of item["set"], else of item["at"] on a 1.6 m grid,
# so the chairs round one table mostly match):
#   dining_chair   teak: tapered legs, rear legs bent back at the seat into raked back posts, seat rails, an H
#                  stretcher, an upholstered seat pad with rounded edges in the item's cushion colour; backs: "slat"
#                  (curved top rail, three slats, lower rail), "cane" (a caned panel between curved rails), "band" (one
#                  wide curved band). 1158 (band) / 1406 (slat) / 1490 (cane) triangles.
#   cafe_chair     a Parisian rattan bistro chair: one bent pole from foot to foot forms the rear legs and the back hoop
#                  (flaring, raked, curved in plan), the front legs rise through the seat ring into the arms ("arm") or
#                  stop at it ("side"); legs drop from the seat and flare out to the feet; a seat ring with an apron
#                  ring close under it (b8's thick seat edge), a low ring stretcher, a back rail, cane binding wraps at
#                  the joints, a domed woven seat and a curved woven back. 3722 (arm) / 3306 (side) triangles.
#   bar_stool      a round upholstered seat on a teak pan, four splayed tapered teak legs, a charcoal footrest ring
#                  (raised until the round ring clears the footprint's sides). 922 triangles.
#
# Test renders (the .blend is never saved; renders go to out=):
#   blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_building.blend --python <this file> -- \
#       out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/furniture_detail/chairs [samples=96] [shots=...]
import bisect
import importlib
import math
import os
import random
import sys
import zlib

import bmesh
import bpy
from mathutils import Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import furniture_materials as FM  # noqa: E402  (the shared furniture materials)

importlib.reload(FM)

KINDS = ("dining_chair", "cafe_chair", "bar_stool")
TEAK, METAL = FM.TEAK, FM.METAL
RATTAN, WRAP, WEAVE, CANE = "TM_RB_furn_rattan", "TM_RB_furn_rattan_wrap", "TM_RB_furn_weave", "TM_RB_furn_cane"
VARIANTS = {"dining_chair": ("slat", "cane", "band"), "cafe_chair": ("arm", "side"), "bar_stool": ("stool",)}
SET_CELL = 1.6                                   # m: the seed grid when an item names no set
CAFE_SEAT, CAFE_BACK = 0.45, 0.90                # bistro defaults: b8 reads a low seat and a tall back (seat ~0.40,
                                                 # back ~1.0 against its 0.75 m tables); the old boxes were 0.47 / 0.84
UV_LAYER = "UVMap"


# ---------------------------------------------------------------- local mesh


class _Geo:
    """An item's mesh in its local frame (u, v, h above the floor) before it goes into the caller's bmesh."""

    def __init__(self):
        self.co, self.faces, self.sharp, self.parts = [], [], set(), []

    def mark(self, name):
        """Note the triangles added since the last mark under name (the per-part budget in the test report)."""
        n = sum(len(f[0]) - 2 for f in self.faces)
        self.parts.append((name, n - sum(p[1] for p in self.parts)))

    def v(self, p):
        self.co.append(Vector(p))
        return len(self.co) - 1

    def f(self, idx, uvs, mat, smooth=True):
        self.faces.append((tuple(idx), tuple(uvs), mat, smooth))

    def edge_sharp(self, a, b):
        self.sharp.add((min(a, b), max(a, b)))


def _perp(t):
    ref = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    return (ref - t * ref.dot(t)).normalized()


def _frames(pts, closed, hint=None):
    """Tangent, normal and binormal (B = T x N) per path point: N is the hint made normal to T, else
    parallel-transported (a closed loop spreads its closing twist)."""
    n = len(pts)
    T = []
    for i in range(n):
        a, b = (pts[i - 1], pts[(i + 1) % n]) if closed else (pts[max(i - 1, 0)], pts[min(i + 1, n - 1)])
        T.append((b - a).normalized())
    N = []
    if hint is not None:
        h = Vector(hint)
        for t in T:
            q = h - t * h.dot(t)
            N.append(q.normalized() if q.length > 1e-9 else _perp(t))
    else:
        N.append(_perp(T[0]))
        for i in range(1, n):
            q = T[i - 1].rotation_difference(T[i]) @ N[-1]
            N.append((q - T[i] * q.dot(T[i])).normalized())
        if closed:
            end = T[-1].rotation_difference(T[0]) @ N[-1]
            end = (end - T[0] * end.dot(T[0])).normalized()
            ang = math.atan2(T[0].dot(N[0].cross(end)), N[0].dot(end))
            N = [Quaternion(T[i], -ang * i / n) @ N[i] for i in range(n)]
    return T, N, [t.cross(q) for t, q in zip(T, N)]


def _fillet(pts, radii, closed=False, step_deg=9.0):
    """A polyline with round bends: each vertex with a radius becomes a circular arc tangent to both its segments (the
    radius shrinks if the arc would pass a segment's midpoint). Returns the points and each vertex's arc midpoint."""
    n = len(pts)
    out, mids = [], {}
    for i in range(n):
        p, r = pts[i], radii[i]
        if r <= 0.0 or (not closed and i in (0, n - 1)):
            out.append(p.copy())
            mids[i] = p.copy()
            continue
        d1, d2 = p - pts[i - 1], pts[(i + 1) % n] - p
        l1, l2 = d1.length, d2.length
        d1, d2 = d1 / l1, d2 / l2
        cphi = max(-1.0, min(1.0, d1.dot(d2)))
        phi = math.acos(cphi)
        if phi < 1e-4:
            out.append(p.copy())
            mids[i] = p.copy()
            continue
        t = min(r * math.tan(phi / 2), 0.5 * min(l1, l2))
        r = t / math.tan(phi / 2)
        t1 = p - d1 * t
        centre = t1 + (d2 - d1 * cphi).normalized() * r
        axis = d1.cross(d2).normalized()
        k = max(2, int(math.ceil(math.degrees(phi) / step_deg)))
        v0 = t1 - centre
        out += [centre + Quaternion(axis, phi * j / k) @ v0 for j in range(k + 1)]
        mids[i] = centre + Quaternion(axis, phi / 2) @ v0
    return out, mids


def _densify(pts, step=0.01, closed=False):
    out = []
    n = len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        k = max(1, int(math.ceil((b - a).length / step)))
        out += [a.lerp(b, j / k) for j in range(k)]
    if not closed:
        out.append(pts[-1].copy())
    return out


def _arc(pts):
    s = [0.0]
    for i in range(1, len(pts)):
        s.append(s[-1] + (pts[i] - pts[i - 1]).length)
    return s


def _at_height(pts, h):
    """The first point where a dense polyline crosses height h."""
    for a, b in zip(pts, pts[1:]):
        if (a.z - h) * (b.z - h) <= 0.0 and abs(b.z - a.z) > 1e-12:
            return a.lerp(b, (h - a.z) / (b.z - a.z))
    raise ValueError(f"path never reaches h {h}")


def _nearest(pts, p):
    return min(range(len(pts)), key=lambda i: (pts[i] - p).length_squared)


def _smooth_near(pts, p, half_len, iters):
    """Round a kink: repeated 1-2-1 averaging of the dense points within half_len of the one nearest p."""
    c, s = _nearest(pts, p), _arc(pts)
    idx = [i for i in range(1, len(pts) - 1) if abs(s[i] - s[c]) <= half_len]
    for _ in range(iters):
        new = {i: (pts[i - 1] + pts[i] * 2.0 + pts[i + 1]) * 0.25 for i in idx}
        for i, q in new.items():
            pts[i] = q


def _resample(dense, closed=False, force=(), tol_deg=6.0, max_len=0.10):
    """(points, arc lengths, total) of a dense polyline kept where it turns (tol_deg) or every max_len, with extra
    points at the forced arc lengths (wrap edges)."""
    pts = [dense[0]]
    for p in dense[1:]:
        if (p - pts[-1]).length > 1e-6:
            pts.append(p)
    if closed and (pts[0] - pts[-1]).length < 1e-6:
        pts.pop()
    n = len(pts)
    s = _arc(pts)
    total = s[-1] + ((pts[0] - pts[-1]).length if closed else 0.0)
    keep, turn = [0], 0.0
    for i in range(1, n if closed else n - 1):
        a, b = pts[i] - pts[i - 1], pts[(i + 1) % n] - pts[i]
        turn += a.angle(b, 0.0)
        if math.degrees(turn) >= tol_deg or s[i] - s[keep[-1]] >= max_len:
            keep.append(i)
            turn = 0.0
    if not closed and keep[-1] != n - 1:
        keep.append(n - 1)
    out = [(pts[i], s[i]) for i in keep]
    end = total if closed else s[-1]
    for fs in force:
        if not 0.001 < fs < end - 0.001:
            continue
        j = min(bisect.bisect_right(s, fs) - 1, n - 1)
        if j == n - 1:
            p = pts[-1].lerp(pts[0], (fs - s[-1]) / (total - s[-1]))
        else:
            p = pts[j].lerp(pts[j + 1], (fs - s[j]) / (s[j + 1] - s[j]))
        out = [q for q in out if q[1] in (0.0, end) or abs(q[1] - fs) > 0.0008]
        out.append((p, fs))
    out.sort(key=lambda q: q[1])
    return [q[0] for q in out], [q[1] for q in out], total


def _circle(r, n):
    return [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def _rrect(ha, hb, rc, k=3):
    """A rounded rectangle, half extents ha (along N) and hb (along B), corner radius rc, k points per corner; CCW."""
    rc = min(rc, ha * 0.9, hb * 0.9)
    pts = []
    for sa, sb, a0 in ((1, 1, 0.0), (-1, 1, 90.0), (-1, -1, 180.0), (1, -1, 270.0)):
        for j in range(k):
            t = math.radians(a0 + 90.0 * j / (k - 1))
            pts.append((sa * (ha - rc) + rc * math.cos(t), sb * (hb - rc) + rc * math.sin(t)))
    return pts


RR_SHARP = (0, 2, 3, 5, 6, 8, 9, 11)             # _rrect(k=3): the corner arcs' ends, so its flat faces shade flat


def _sweep(g, path, prof, mat, closed=False, caps=(True, True), floor=(False, False), hint=None, mat_at=None,
           uvoff=(0.0, 0.0), sharp_cols=()):
    """A profile swept along path = (points, arc lengths, total). prof(s, p) -> [(a, b)] CCW (a along N, b along B), the
    same count everywhere. floor: cut that end flat at h 0 along the tangent. UVs: u = arc length (m), v = round the
    profile (m). Returns the ring vertex indices."""
    pts, ss, total = path
    n = len(pts)
    T, N, B = _frames(pts, closed, hint)
    rings = [[pts[i] + N[i] * a + B[i] * b for a, b in prof(ss[i], pts[i])] for i in range(n)]
    m = len(rings[0])
    for end, flag in ((0, floor[0]), (n - 1, floor[1])):
        if flag and not closed:
            t = T[end]
            for k, p in enumerate(rings[end]):
                q = p - t * (p.z / t.z) if abs(t.z) > 1e-6 else p.copy()
                q.z = 0.0
                rings[end][k] = q
    pr = prof(ss[n // 2], pts[n // 2])
    per = [0.0]
    for j in range(1, m + 1):
        per.append(per[-1] + math.hypot(pr[j % m][0] - pr[j - 1][0], pr[j % m][1] - pr[j - 1][1]))
    ids = [[g.v(p) for p in ring] for ring in rings]
    for i in range(n if closed else n - 1):
        i2 = (i + 1) % n
        s0, s1 = ss[i], (ss[i2] if i2 else total)
        mm = mat_at(0.5 * (s0 + s1)) if mat_at else mat
        u0, u1 = s0 + uvoff[0], s1 + uvoff[0]
        for j in range(m):
            j2 = (j + 1) % m
            v0, v1 = per[j] + uvoff[1], per[j + 1] + uvoff[1]
            g.f((ids[i][j], ids[i][j2], ids[i2][j2], ids[i2][j]), ((u0, v0), (u0, v1), (u1, v1), (u1, v0)), mm)
        for j in sharp_cols:
            g.edge_sharp(ids[i][j], ids[i2][j])
    if not closed:
        for end, flag, order in ((0, caps[0], -1), (n - 1, caps[1], 1)):
            if not flag:
                continue
            ring = ids[end][::order]
            prc = prof(ss[end], pts[end])[::order]
            g.f(ring, [(a + uvoff[0], b + uvoff[1]) for a, b in prc], mat_at(ss[end]) if mat_at else mat, smooth=False)
            for j in range(m):
                g.edge_sharp(ring[j], ring[(j + 1) % m])
    return ids


def _lathe(g, prof, n, mat, uvoff=(0.0, 0.0), caps=(True, True), centre=(0.0, 0.0)):
    """prof [(r, h)] (bottom to top) revolved about the vertical axis through centre; a ring at r 0 closes to a point.
    UVs: u round (m at the outer radius), v along the profile (m)."""
    cx, cy = centre
    rmax = max(r for r, _ in prof)
    rings = []
    for r, h in prof:
        if r <= 1e-9:
            rings.append([g.v((cx, cy, h))])
        else:
            rings.append([g.v((cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), h))
                          for k in range(n)])
    lv = [0.0]
    for i in range(1, len(prof)):
        lv.append(lv[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(n):
            k2 = (k + 1) % n
            u0, u1 = 2 * math.pi * rmax * k / n + uvoff[0], 2 * math.pi * rmax * (k + 1) / n + uvoff[0]
            v0, v1 = lv[i] + uvoff[1], lv[i + 1] + uvoff[1]
            quad = [(A[k % len(A)], (u0, v0)), (A[k2 % len(A)], (u1, v0)), (B[k2 % len(B)], (u1, v1)),
                    (B[k % len(B)], (u0, v1))]
            seen, face = set(), []
            for vi, uv in quad:
                if vi not in seen:
                    seen.add(vi)
                    face.append((vi, uv))
            g.f([q[0] for q in face], [q[1] for q in face], mat)
    for ring, flag, order, (r, _) in ((rings[0], caps[0], -1, prof[0]), (rings[-1], caps[1], 1, prof[-1])):
        if flag and len(ring) > 1:
            loop = ring[::order]
            g.f(loop, [((g.co[i].x - cx) + uvoff[0], (g.co[i].y - cy) + uvoff[1]) for i in loop], mat, smooth=False)
            for j in range(n):
                g.edge_sharp(loop[j], loop[(j + 1) % n])


def _pad(g, loop_at, levels, crown, mat, uvoff=(0.0, 0.0)):
    """An upholstered pad: loop_at(inset) -> [(u, v)] CCW with a fixed count; levels [(inset, h)] from the bottom up the
    rounded edge; the top domes by crown through two inner rings to a centre point; the bottom is flat."""
    rings = [[g.v((u, v, h)) for u, v in loop_at(inset)] for inset, h in levels]
    top = loop_at(levels[-1][0])
    cu, cv = sum(p[0] for p in top) / len(top), sum(p[1] for p in top) / len(top)
    h0 = levels[-1][1]
    for f, dh in ((0.72, 0.6), (0.38, 0.9)):
        rings.append([g.v((cu + (u - cu) * f, cv + (v - cv) * f, h0 + crown * dh)) for u, v in top])
    centre = g.v((cu, cv, h0 + crown))
    uv = lambda i: (g.co[i].x + uvoff[0], g.co[i].y + uvoff[1] + 0.5 * g.co[i].z)  # noqa: E731
    m = len(rings[0])
    for A, B in zip(rings, rings[1:]):
        for k in range(m):
            q = (A[k], A[(k + 1) % m], B[(k + 1) % m], B[k])
            g.f(q, [uv(i) for i in q], mat)
    for k in range(m):
        q = (rings[-1][k], rings[-1][(k + 1) % m], centre)
        g.f(q, [uv(i) for i in q], mat)
    bottom = rings[0][::-1]
    g.f(bottom, [uv(i) for i in bottom], mat, smooth=False)
    for j in range(m):
        g.edge_sharp(bottom[j], bottom[(j + 1) % m])


def _sheet(g, fn, rows, ncol, th, mat, uvfn, uvoff=(0.0, 0.0)):
    """A thin curved panel th thick: rows [(h, a_left, a_right)] bottom to top, ncol columns each, fn(a, h) -> the mid
    surface point; the front face (+v side) and the back are offset along the surface normal and joined round the
    edge. UVs uvfn(a, h) on both faces."""
    grid = []
    for h, a0, a1 in rows:
        grid.append([(a0 + (a1 - a0) * c / ncol, h) for c in range(ncol + 1)])
    F, Bk, UV = [], [], []
    for row in grid:
        fr, br, ur = [], [], []
        for a, h in row:
            p = fn(a, h)
            da, dh = fn(a + 1e-4, h) - fn(a - 1e-4, h), fn(a, h + 1e-4) - fn(a, h - 1e-4)
            nf = -da.cross(dh).normalized()
            if nf.y < 0:
                nf = -nf
            fr.append(g.v(p + nf * (th / 2)))
            br.append(g.v(p - nf * (th / 2)))
            uu = uvfn(a, h)
            ur.append((uu[0] + uvoff[0], uu[1] + uvoff[1]))
        F.append(fr)
        Bk.append(br)
        UV.append(ur)
    nr = len(grid)
    for r in range(nr - 1):
        for c in range(ncol):
            q = (F[r][c], F[r + 1][c], F[r + 1][c + 1], F[r][c + 1])
            g.f(q, (UV[r][c], UV[r + 1][c], UV[r + 1][c + 1], UV[r][c + 1]), mat)
            q = (Bk[r][c], Bk[r][c + 1], Bk[r + 1][c + 1], Bk[r + 1][c])
            g.f(q, (UV[r][c], UV[r][c + 1], UV[r + 1][c + 1], UV[r + 1][c]), mat)
    edge = lambda q, uv: g.f(q, uv, mat, smooth=False)  # noqa: E731
    for c in range(ncol):
        edge((F[0][c], F[0][c + 1], Bk[0][c + 1], Bk[0][c]), (UV[0][c], UV[0][c + 1], UV[0][c + 1], UV[0][c]))
        L = nr - 1
        edge((F[L][c], Bk[L][c], Bk[L][c + 1], F[L][c + 1]), (UV[L][c], UV[L][c], UV[L][c + 1], UV[L][c + 1]))
    for r in range(nr - 1):
        edge((F[r][0], Bk[r][0], Bk[r + 1][0], F[r + 1][0]), (UV[r][0], UV[r][0], UV[r + 1][0], UV[r + 1][0]))
        edge((F[r][ncol], F[r + 1][ncol], Bk[r + 1][ncol], Bk[r][ncol]),
             (UV[r][ncol], UV[r + 1][ncol], UV[r + 1][ncol], UV[r][ncol]))


def _loop_through(poly, radii, targets, iters=10):
    """A closed filleted loop whose arc midpoints at the target vertices land on the targets (the corners move out)."""
    poly = [p.copy() for p in poly]
    for _ in range(iters):
        _, mids = _fillet(poly, radii, closed=True)
        err = 0.0
        for i, t in targets.items():
            d = t - mids[i]
            poly[i] = poly[i] + d
            err = max(err, d.length)
        if err < 1e-5:
            break
    return _fillet(poly, radii, closed=True)


class _Wraps:
    """Binding wraps along one member: arc-length intervals where the section swells by `bump` and wears WRAP."""

    def __init__(self, spans, bump, ramp=0.002):
        self.spans, self.bump, self.ramp = [s for s in spans if s[1] > s[0]], bump, ramp

    def inside(self, s, pad=0.0):
        return any(a - pad <= s <= b + pad for a, b in self.spans)

    def radius(self, s, r):
        return r + self.bump if self.inside(s) else r

    def mat(self, base):
        return lambda s: WRAP if self.inside(s, self.ramp * 0.999) else base

    def force(self):
        out = []
        for a, b in self.spans:
            out += [a - self.ramp, a, b, b + self.ramp] + ([0.5 * (a + b)] if b - a > 0.03 else [])
        return out


def _tube(g, dense, r, mat, rng, closed=False, wraps=None, sides=8, floor=(False, False), caps=(True, True),
          tol_deg=7.0, max_len=0.10, taper=None, hint=None, force=()):
    """A round pole along a dense polyline, radius r (taper(s, total) -> scale), with optional binding wraps. A hint
    keeps the profile from rolling along the path, so the low-poly silhouette (and its cast shadow) stays steady."""
    w = wraps or _Wraps([], 0.0)
    path = _resample(dense, closed, list(w.force()) + list(force), tol_deg, max_len)
    total = path[2]
    prof = lambda s, p: _circle(w.radius(s, r * (taper(s, total) if taper else 1.0)), sides)  # noqa: E731
    _sweep(g, path, prof, mat, closed=closed, caps=caps, floor=floor, mat_at=w.mat(mat), hint=hint,
           uvoff=(rng.uniform(0, 30), rng.uniform(0, 30)))
    return path


# ---------------------------------------------------------------- the café chair


def _cafe(g, item, rng, variant):
    W, D = item["size"][0] / 2, item["size"][1] / 2
    su, sv = W / 0.22, D / 0.22
    S, BK = item.get("seat_h", CAFE_SEAT), item.get("back_h", CAFE_BACK)
    R, R2, WB = 0.0125, 0.0085, 0.0022             # frame pole, thin canes, wrap swell (m)
    TOL = 11.0                                     # bend sampling (deg)
    hs, ht = S - R, BK - R                         # seat ring and back hoop top centre lines
    P = lambda u, v, h: Vector((u * su, v * sv, h))  # noqa: E731

    # the back: a surface curved in plan (radius Rc, its middle furthest back), raked back as it rises; (a, h) on it
    Rc, rake, vmid = 0.40, 0.13, -0.140
    A = lambda h: 0.170 + 0.032 * (h - hs) / (ht - hs)  # noqa: E731   the upright's half arc: flares toward the top
    M = lambda a, h: P(Rc * math.sin(a / Rc), vmid - (h - hs) * rake + Rc * (1 - math.cos(a / Rc)), h)  # noqa: E731

    # seat ring: a rounded D, front wide, the rear corners where the hoop's uprights stand
    poly = [P(0.186, 0.170, hs), P(0.0, 0.188, hs), P(-0.186, 0.170, hs), P(-0.172, -0.118, hs), P(0.0, -0.140, hs),
            P(0.172, -0.118, hs)]
    radii = [0.075, 0.6, 0.075, 0.04, 0.6, 0.04]
    ring, mids = _loop_through(poly, radii, {3: M(-A(hs), hs), 5: M(A(hs), hs)})
    j_fr, j_fl, j_rl, j_rr = mids[0], mids[2], mids[3], mids[5]
    feet = {"fr": P(0.205, 0.205, 0.0), "fl": P(-0.205, 0.205, 0.0), "rl": P(-0.198, -0.205, 0.0),
            "rr": P(0.198, -0.205, 0.0)}
    joints = {"fr": j_fr, "fl": j_fl, "rl": j_rl, "rr": j_rr}
    h_st, h_ap, h_arm, h_br, h_knee = 0.10, hs - 0.036, S + 0.195, hs + 0.045, 0.24

    def knee(k):
        """The legs drop nearly straight from the seat to the knee, then flare out to the foot (bent rattan)."""
        q = joints[k].lerp(feet[k], 0.15)
        return Vector((q.x, q.y, h_knee))

    # the back hoop: rear left foot, up the left upright, the top rail, down the right one to the rear right foot
    hoop2d, _ = _fillet([Vector((-A(hs), hs, 0)), Vector((-A(ht), ht, 0)), Vector((A(ht), ht, 0)),
                         Vector((A(hs), hs, 0))], [0, 0.085, 0.085, 0])
    hoop2d = _densify(hoop2d, 0.01)
    mapped = [M(q.x, q.y) for q in hoop2d]
    left = _densify(_fillet([feet["rl"], knee("rl"), mapped[0]], [0, 0.3, 0])[0], 0.01)
    right = _densify(_fillet([mapped[-1], knee("rr"), feet["rr"]], [0, 0.3, 0])[0], 0.01)
    hoop = left[:-1] + mapped + right[1:]
    for j in (j_rl, j_rr):
        _smooth_near(hoop, j, 0.07, 14)
    legs = {"rl": hoop, "rr": hoop[::-1]}
    # front legs: up through the seat ring into the arm, which runs back into the upright ("arm"), or up to the ring
    for k, sg in (("fl", -1), ("fr", 1)):
        jf = joints[k]
        if variant == "arm":
            pts, _ = _fillet([feet[k], knee(k), jf, Vector((jf.x, jf.y - 0.012 * sv, h_arm)), M(sg * A(h_arm), h_arm)],
                             [0, 0.3, 0.25, 0.065, 0])
        else:
            pts, _ = _fillet([feet[k], knee(k), jf], [0, 0.3, 0])
        legs[k] = _densify(pts, 0.01)
    pos = lambda k, h: _at_height(legs[k], h)  # noqa: E731

    s = _arc(hoop)
    sj = [s[_nearest(hoop, j)] for j in (j_rl, j_rr)]
    sst = [s[_nearest(hoop, pos(k, h_st))] for k in ("rl", "rr")]
    spans = [(sj[0] - 0.024, sj[0] + 0.032), (sj[1] - 0.032, sj[1] + 0.024)] + [(x - 0.012, x + 0.012) for x in sst]
    if variant == "arm":
        sa = [s[_nearest(hoop, M(sg * A(h_arm), h_arm))] for sg in (-1, 1)]
        spans += [(x - 0.022, x + 0.022) for x in sa]
    # the top rail curves in plan over the woven back: sampled every 3 cm, or its chords cast a scalloped shadow on it
    top = [s[i] for i, q in enumerate(hoop) if q.z > ht - 0.03]
    fine = [top[0] + 0.03 * k for k in range(1, int((top[-1] - top[0]) / 0.03))] if top else []
    fine = [x for x in fine if not any(a - 0.006 <= x <= b + 0.006 for a, b in spans)]
    _tube(g, hoop, R, RATTAN, rng, wraps=_Wraps(spans, WB), floor=(True, True), tol_deg=TOL, hint=(0, 1, 0), force=fine)
    g.mark("hoop")
    for k in ("fl", "fr"):
        dense = legs[k]
        s = _arc(dense)
        x_j, x_st = s[_nearest(dense, joints[k])], s[_nearest(dense, pos(k, h_st))]
        spans = [(x_j - 0.026, min(x_j + 0.032, s[-1] - 0.004)), (x_st - 0.012, x_st + 0.012)]
        _tube(g, dense, R, RATTAN, rng, wraps=_Wraps(spans, WB), floor=(True, False), tol_deg=TOL, hint=(1, 0, 0))
    g.mark("front legs")

    # seat ring; an apron ring close under it (the thick woven seat edge of b8's chairs); a low ring stretcher
    _tube(g, _densify(ring, 0.01, closed=True), R, RATTAN, rng, closed=True, tol_deg=TOL, hint=(0, 0, 1))
    g.mark("seat ring")
    order = ("fr", "fl", "rl", "rr")
    apron = [p.copy() for p in poly]
    for p in apron:
        p.z = h_ap
    ap, _ = _loop_through(apron, radii, {i: pos(k, h_ap) for i, k in zip((0, 2, 3, 5), order)})
    _tube(g, _densify(ap, 0.01, closed=True), R2, RATTAN, rng, closed=True, sides=6, tol_deg=TOL, hint=(0, 0, 1))
    st, _ = _loop_through([pos(k, h_st) for k in order], [0.035] * 4, {i: pos(k, h_st) for i, k in enumerate(order)})
    _tube(g, _densify(st, 0.01, closed=True), 0.0075, RATTAN, rng, closed=True, sides=6, tol_deg=TOL, hint=(0, 0, 1))
    g.mark("apron+stretcher")

    # back rail closing the woven back at the bottom
    rail = _densify([Vector((-A(h_br), h_br, 0)), Vector((A(h_br), h_br, 0))], 0.03)
    _tube(g, [M(q.x, q.y) for q in rail], R2, RATTAN, rng, sides=6, hint=(0, 0, 1))
    g.mark("back rail")

    # woven back: between the uprights, the top rail and the back rail, its edges inside the poles
    def edge_a(h):
        best = 0.0
        for a, b in zip(hoop2d, hoop2d[1:]):
            if (a.y - h) * (b.y - h) <= 0 and abs(b.y - a.y) > 1e-9:
                best = max(best, a.x + (b.x - a.x) * (h - a.y) / (b.y - a.y))
        return best - 0.006

    hc, htop = ht - 0.085, ht - 0.006
    hrows = [h_br + 0.004 + (hc - h_br - 0.004) * k / 4 for k in range(5)] + [hc + (htop - hc) * f for f in
                                                                               (0.4, 0.75, 1.0)]
    _sheet(g, M, [(h, -edge_a(h), edge_a(h)) for h in hrows], 10, 0.010, WEAVE, lambda a, h: (a, h),
           (rng.uniform(0, 5), rng.uniform(0, 5)))
    g.mark("back weave")

    # woven seat: the ring's loop drawn in 6 mm, domed 4 mm
    loop2 = [Vector((p.x, p.y, 0.0)) for p in _densify(ring, 0.01, closed=True)]
    n = len(loop2)
    inset = []
    for i in range(n):
        d = (loop2[(i + 1) % n] - loop2[i - 1]).normalized()
        inset.append(loop2[i] + Vector((-d.y, d.x, 0.0)) * 0.006)
    pts, _, _ = _resample(inset + [inset[0]], closed=True, tol_deg=9.0, max_len=0.05)
    ou = (rng.uniform(0, 5), rng.uniform(0, 5))
    loop_at = lambda ins: [(p.x, p.y) for p in pts]  # noqa: E731
    _pad(g, loop_at, [(0.0, hs - 0.006), (0.0, hs + 0.006)], 0.004, WEAVE, ou)
    g.mark("seat weave")


# ---------------------------------------------------------------- the dining chair


def _dining(g, item, rng, variant):
    W, D = item["size"][0] / 2, item["size"][1] / 2
    su, sv = W / 0.23, D / 0.25
    P = lambda u, v, h: Vector((u * su, v * sv, h))  # noqa: E731
    off = lambda: (rng.uniform(0, 30), rng.uniform(0, 30))  # noqa: E731
    hf, hb, up = 0.425, 0.86, 0.198                # seat frame top, back top, back posts' u

    # rear legs: kick back to the foot, bend at the seat, rake back up to the top (path in (v, h), unscaled)
    rear, _ = _fillet([Vector((-0.228, 0.0, 0)), Vector((-0.176, 0.40, 0)), Vector((-0.226, hb, 0))], [0, 0.30, 0])
    rear = _densify(rear, 0.01)

    def v_post(h):
        for a, b in zip(rear, rear[1:]):
            if a.y <= h <= b.y:
                return a.x + (b.x - a.x) * (h - a.y) / max(b.y - a.y, 1e-9)
        return rear[-1].x if h > rear[-1].y else rear[0].x

    def post_half(h):
        return 0.013 + 0.0045 * h / 0.40 if h <= 0.40 else 0.0175 - 0.003 * (h - 0.40) / (hb - 0.40)

    sq = lambda half: _rrect(half, half, 0.005)  # noqa: E731
    for sg in (-1, 1):
        dense = [P(sg * up, q.x, q.y) for q in rear]
        path = _resample(dense, tol_deg=5.0, max_len=0.16)
        _sweep(g, path, lambda s, p: sq(post_half(p.z)), TEAK, floor=(True, False), hint=(1, 0, 0), uvoff=off(),
               sharp_cols=RR_SHARP)
        # front legs, tapered toward the foot
        a, b = P(sg * 0.200, 0.2175, 0.0), P(sg * 0.200, 0.2175, hf)
        path = ([a, b], [0.0, hf], hf)
        _sweep(g, path, lambda s, p: sq(0.0125 + 0.005 * p.z / hf), TEAK, floor=(True, False), hint=(1, 0, 0),
               uvoff=off(), sharp_cols=RR_SHARP)

    g.mark("legs")

    def bar(a, b, ha, hb_, hint=(0, 0, 1), mat=TEAK):
        _sweep(g, ([a, b], [0.0, (b - a).length], (b - a).length), lambda s, p: _rrect(ha, hb_, 0.004), mat, hint=hint,
               uvoff=off(), sharp_cols=RR_SHARP)

    # seat rails just inside the legs' faces, an H stretcher low down
    hr = hf - 0.002 - 0.031
    bar(P(-0.200, 0.220, hr), P(0.200, 0.220, hr), 0.031, 0.011)
    bar(P(-up, v_post(hr), hr), P(up, v_post(hr), hr), 0.031, 0.011)
    for sg in (-1, 1):
        bar(P(sg * 0.2025, 0.2175, hr), P(sg * 0.2025, v_post(hr), hr), 0.031, 0.011)
        bar(P(sg * 0.200, 0.2175, 0.15), P(sg * up, v_post(0.15), 0.15), 0.010, 0.008)
    vm = (0.2175 + v_post(0.15)) / 2
    bar(P(-0.199, vm, 0.15), P(0.199, vm, 0.15), 0.0085, 0.007)
    g.mark("rails+stretchers")

    # upholstered seat pad on the frame, clear of the back posts
    v_rear = max(v_post(hf + 0.005 * k) + post_half(hf + 0.005 * k) for k in range(12)) + 0.004
    v_front, hw = 0.2175 + 0.0175 + 0.007, 0.224
    cv, hd = (v_front + v_rear) / 2, (v_front - v_rear) / 2

    def loop_at(ins):
        pts = []
        for cu_, cv_, r, a0 in ((1, 1, 0.045, 0.0), (-1, 1, 0.045, 90.0), (-1, -1, 0.02, 180.0), (1, -1, 0.02, 270.0)):
            rr = max(r - ins, 0.003)
            for j in range(5):
                t = math.radians(a0 + 90.0 * j / 4)
                pts.append(((cu_ * (hw - ins - rr) + rr * math.cos(t)) * su,
                            (cv + cv_ * (hd - ins - rr) + rr * math.sin(t)) * sv))
        return pts

    _pad(g, loop_at, [(0.010, hf), (0.003, hf + 0.004), (0.0, hf + 0.016), (0.0, hf + 0.030), (0.006, hf + 0.044),
                      (0.016, hf + 0.050)], 0.006, FM.fabric(item.get('cushion', 'greige')), off())
    g.mark("pad")

    # the back: members on a surface between the posts, curved in plan (sag at the middle) and raked like the posts
    sag = 0.010 if variant == "band" else 0.013

    def back(sx, h):
        return P(sx * up, v_post(h) - sag * (1 - sx * sx), h)

    def rake(h):
        return (back(0, h + 0.01) - back(0, h - 0.01)).normalized()

    def rail(h, ha, hb_):
        dense = [back(-1 + 2 * k / 16, h) for k in range(17)]
        _sweep(g, _resample(dense, tol_deg=3.0, max_len=0.2), lambda s, p: _rrect(ha, hb_, 0.005), TEAK,
               hint=rake(h), uvoff=off(), sharp_cols=RR_SHARP)

    if variant == "band":
        rail(0.785, 0.058, 0.011)
    else:
        h_low = 0.585 if variant == "slat" else 0.56
        rail(0.805, 0.034, 0.010)
        rail(h_low, 0.017, 0.009)
        if variant == "slat":
            for sx in (-0.36, 0.0, 0.36):
                dense = [back(sx, h_low + (0.805 - h_low) * k / 6) for k in range(7)]
                d = back(sx + 1e-3, 0.7) - back(sx - 1e-3, 0.7)
                nrm = Vector((-d.y, d.x, 0.0)).normalized()
                _sweep(g, _resample(dense, tol_deg=3.0, max_len=0.3), lambda s, p: _rrect(0.0065, 0.021, 0.003), TEAK,
                       hint=nrm, uvoff=off(), sharp_cols=RR_SHARP)
        else:
            sx_e = (up - 0.006) / up
            h0, h1 = h_low + 0.010, 0.805 - 0.026
            rows = [(h0 + (h1 - h0) * k / 4, -sx_e, sx_e) for k in range(5)]
            _sheet(g, back, rows, 10, 0.003, CANE, lambda a, h: (a * up * su, h), off())
    g.mark("back")


# ---------------------------------------------------------------- the bar stool


def _stool(g, item, rng):
    W, D = item["size"][0] / 2, item["size"][1] / 2
    half = min(W, D)
    SH = item.get("seat_h", 0.76)
    rs = min(0.18, half - 0.008)
    hpt = SH - 0.050                                # pan top = cushion bottom
    hpb = hpt - 0.028
    off = lambda: (rng.uniform(0, 30), rng.uniform(0, 30))  # noqa: E731
    _lathe(g, [(rs - 0.010, hpb), (rs - 0.002, hpb + 0.004), (rs, hpb + 0.012), (rs, hpt - 0.006), (rs - 0.005, hpt)],
           22, TEAK, off())
    _lathe(g, [(rs - 0.006, hpt), (rs - 0.001, hpt + 0.006), (rs, hpt + 0.018), (rs - 0.004, hpt + 0.034),
               (rs - 0.016, hpt + 0.045), (rs * 0.62, hpt + 0.049), (rs * 0.25, SH), (0.0, SH)], 22,
           FM.fabric(item.get('cushion', 'greige')), off(), caps=(True, False))
    f = half - 0.024                                # foot centres on the diagonals
    top_r, h_top = 0.10 / math.sqrt(2.0), hpb + 0.010
    # the footrest ring passes through the legs; it is round, so it rises until it clears the footprint's sides
    rho_at = lambda h: math.sqrt(2.0) * (f + (top_r - f) * h / h_top)  # noqa: E731
    h_ring = max(SH - 0.43, h_top * (math.sqrt(2.0) * f - (half - 0.012)) / (math.sqrt(2.0) * (f - top_r)))
    for su_, sv_ in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        a, b = Vector((su_ * f, sv_ * f, 0.0)), Vector((su_ * top_r, sv_ * top_r, h_top))
        ln = (b - a).length
        _sweep(g, ([a, b], [0.0, ln], ln), lambda s, p: _circle(0.0135 + 0.003 * s / ln, 8), TEAK,
               floor=(True, False), uvoff=off())
    g.mark("seat+legs")
    rho = rho_at(h_ring)
    ring = [Vector((rho * math.cos(math.pi * k / 12), rho * math.sin(math.pi * k / 12), h_ring)) for k in range(24)]
    _tube(g, ring, 0.009, METAL, rng, closed=True, sides=6, tol_deg=0.0, max_len=1.0, hint=(0, 0, 1))
    g.mark("footrest")


# ---------------------------------------------------------------- build


def variant(item):
    """The item's variant: item["variant"] if valid, else a hash of item["set"] or of item["at"] on the SET_CELL
    grid."""
    names = VARIANTS[item["kind"]]
    if item.get("variant") in names:
        return item["variant"]
    key = item.get("set")
    if key is None:
        key = (round(item["at"][0] / SET_CELL), round(item["at"][1] / SET_CELL))
    return names[zlib.crc32(f"{item['kind']}:{key}".encode()) % len(names)]


def _fit(g, W, D):
    """Keep every vertex inside the footprint (scale u / v in about the centre if needed), nothing under the floor."""
    um = max(abs(p.x) for p in g.co)
    vm = max(abs(p.y) for p in g.co)
    ku, kv = min(1.0, W / um), min(1.0, D / vm)
    for p in g.co:
        p.x *= ku
        p.y *= kv
        if p.z < 0.0:
            p.z = 0.0
    return ku, kv


def _emit(bm, g, item, z, slot):
    c, f = item["at"], item["face"]
    fl = math.hypot(f[0], f[1])
    vx, vy = f[0] / fl, f[1] / fl
    ux, uy = vy, -vx
    uvl = bm.loops.layers.uv.get(UV_LAYER) or bm.loops.layers.uv.new(UV_LAYER)
    vs = [bm.verts.new((c[0] + ux * p.x + vx * p.y, c[1] + uy * p.x + vy * p.y, z + p.z)) for p in g.co]
    idx, tris = {}, 0
    for ids, uvs, mat, smooth in g.faces:
        try:
            face = bm.faces.new([vs[i] for i in ids])
        except ValueError:                          # a duplicate face: never expected, skipped rather than fatal
            continue
        if mat not in idx:
            idx[mat] = slot(mat)
        face.material_index = idx[mat]
        face.smooth = smooth
        for lp, uv in zip(face.loops, uvs):
            lp[uvl].uv = uv
        tris += len(ids) - 2
    for a, b in g.sharp:
        e = bm.edges.get((vs[a], vs[b]))
        if e is not None:
            e.smooth = False
    return tris


def build(bm, item, z, slot):
    """One chair or stool into bm (world coordinates, floor at z); slot(name) -> material index. Returns
    {"tris", "variant", "fit"} (fit: the u / v scales the footprint fit needed, 1.0 when none)."""
    kind = item["kind"]
    if kind not in KINDS:
        raise ValueError(f"unknown chair kind {kind}")
    g = _Geo()
    var = variant(item)
    rng = random.Random(f"{kind}:{item['at'][0]:.3f}:{item['at'][1]:.3f}")
    if kind == "dining_chair":
        _dining(g, item, rng, var)
    elif kind == "cafe_chair":
        _cafe(g, item, rng, var)
    else:
        _stool(g, item, rng)
    fit = _fit(g, item["size"][0] / 2, item["size"][1] / 2)
    return {"tris": _emit(bm, g, item, z, slot), "variant": var, "fit": (round(fit[0], 4), round(fit[1], 4)),
            "parts": g.parts}


def finish_object(name, coll, bm, names, tags=None):
    """A mesh object from a bmesh of build() items, keeping their UVs, smooth flags and sharp edges."""
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for n in names:
        me.materials.append(bpy.data.materials.get(n) or bpy.data.materials.new(n))
    ob = bpy.data.objects.new(name, me)
    for k, v in (tags or {}).items():
        ob[k] = v
    coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------- materials


class _X:
    """A float node socket; arithmetic on it adds Math nodes to its tree."""

    def __init__(self, nt, sock):
        self.nt, self.s = nt, sock

    def __add__(self, o):
        return _math(self.nt, "ADD", self, o)

    __radd__ = __add__

    def __sub__(self, o):
        return _math(self.nt, "SUBTRACT", self, o)

    def __rsub__(self, o):
        return _math(self.nt, "SUBTRACT", o, self)

    def __mul__(self, o):
        return _math(self.nt, "MULTIPLY", self, o)

    __rmul__ = __mul__

    def __truediv__(self, o):
        return _math(self.nt, "DIVIDE", self, o)


def _feed(nt, inp, a):
    if isinstance(a, _X):
        nt.links.new(inp, a.s)
    elif isinstance(a, bpy.types.NodeSocket):
        nt.links.new(inp, a)
    else:
        inp.default_value = a


def _math(nt, op, *args):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, a in enumerate(args):
        _feed(nt, n.inputs[i], a)
    return _X(nt, n.outputs[0])


def _fn(op):
    return lambda x, *more: _math(x.nt, op, x, *more)


_floor, _fract, _abs, _sin, _cos, _sqrt = (_fn(o) for o in ("FLOOR", "FRACT", "ABSOLUTE", "SINE", "COSINE", "SQRT"))
_min, _max, _gt = _fn("MINIMUM"), _fn("MAXIMUM"), _fn("GREATER_THAN")


def _smooth(nt, e0, e1, x):
    n = nt.nodes.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP"
    n.clamp = True
    for i, a in enumerate((x, e0, e1, 0.0, 1.0)):
        _feed(nt, n.inputs[i], a)
    return _X(nt, n.outputs[0])


def _vop(nt, op, a, b=None, scale=None):
    n = nt.nodes.new("ShaderNodeVectorMath")
    n.operation = op
    _feed(nt, n.inputs[0], a)
    if b is not None:
        _feed(nt, n.inputs[1], b)
    if scale is not None:
        _feed(nt, n.inputs[3], scale)
    return n.outputs[0]


def _lerp(nt, a, b, f):
    return _vop(nt, "ADD", a, _vop(nt, "SCALE", _vop(nt, "SUBTRACT", b, a), scale=f))


def _combine(nt, x, y, z=0.0):
    n = nt.nodes.new("ShaderNodeCombineXYZ")
    for i, a in enumerate((x, y, z)):
        _feed(nt, n.inputs[i], a)
    return n.outputs[0]


def _noise(nt, vec, scale, detail, rough=0.5, w=None):
    n = nt.nodes.new("ShaderNodeTexNoise")
    if w is not None:
        n.noise_dimensions = "1D"
        _feed(nt, n.inputs["W"], w)
    else:
        _feed(nt, n.inputs["Vector"], vec)
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    return _X(nt, n.outputs["Fac"])


def _white(nt, w):
    n = nt.nodes.new("ShaderNodeTexWhiteNoise")
    n.noise_dimensions = "1D"
    _feed(nt, n.inputs["W"], w)
    return _X(nt, n.outputs["Value"])


def _fresh(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out, bsdf = nt.nodes.new("ShaderNodeOutputMaterial"), nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(out.inputs["Surface"], bsdf.outputs["BSDF"])
    return mat, nt, bsdf


def _uv(nt):
    """U and V of the UV layer (metres), shifted per object (FM.object_shift) so linked duplicates differ."""
    m = nt.nodes.new("ShaderNodeUVMap")
    m.uv_map = UV_LAYER
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(sep.inputs[0], FM.object_shift(nt, m.outputs["UV"]))
    return _X(nt, sep.outputs[0]), _X(nt, sep.outputs[1])


def _bump(nt, bsdf, height, strength, distance):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = distance
    _feed(nt, b.inputs["Height"], height)
    nt.links.new(bsdf.inputs["Normal"], b.outputs["Normal"])


def _rattan():
    """Rattan poles: honey tan with fibre streaks along u, darker raised growth nodes every ~30 cm, a light lacquer."""
    mat, nt, bsdf = _fresh(RATTAN)
    U, V = _uv(nt)
    wv = U * (1 / 0.30) + (_noise(nt, None, 1.0, 1.0, w=U * 1.7) - 0.5) * 1.2
    f = _fract(wv)
    node = 1.0 - _smooth(nt, 0.0012, 0.006, _min(f, 1.0 - f) * 0.30)
    streak = _noise(nt, _combine(nt, U * 1.5, V * 110.0), 1.0, 6.0, 0.6)
    tone = _noise(nt, _combine(nt, U * 0.35, V * 0.35), 1.0, 1.0)
    mix = _max(_min(_smooth(nt, 0.30, 0.75, streak) * 0.6 + (tone - 0.5) * 0.7, 1.0), 0.0)
    base = _lerp(nt, (0.34, 0.195, 0.08), (0.245, 0.135, 0.054), mix)
    nt.links.new(bsdf.inputs["Base Color"], _lerp(nt, base, (0.17, 0.095, 0.04), node * 0.5))
    _feed(nt, bsdf.inputs["Roughness"], streak * 0.12 + node * 0.15 + 0.34)
    bsdf.inputs["Coat Weight"].default_value = 0.3
    bsdf.inputs["Coat Roughness"].default_value = 0.18
    _bump(nt, bsdf, node * 0.8 + streak * 0.15, 0.25, 0.0012)
    mat.diffuse_color = (0.30, 0.17, 0.07, 1.0)


def _wrap():
    """Cane binding: a helix of flat strips (one strip's advance per turn), slightly darker than the poles."""
    mat, nt, bsdf = _fresh(WRAP)
    U, V = _uv(nt)
    f = _fract((U + V * 0.042) * (1 / 0.0034))
    prof = _sqrt(_sin(f * math.pi))
    tone = _noise(nt, _combine(nt, U * 2.0, V * 2.0), 1.0, 2.0)
    col = _lerp(nt, (0.12, 0.065, 0.028), (0.34, 0.20, 0.083), prof * (0.85 + (tone - 0.5) * 0.3))
    nt.links.new(bsdf.inputs["Base Color"], col)
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs["Coat Weight"].default_value = 0.2
    _bump(nt, bsdf, prof, 0.45, 0.0008)
    mat.diffuse_color = (0.30, 0.175, 0.072, 1.0)


def _weave():
    """The bistro weave: strands along u and v (8.5 mm pitch) going over and under, each strand its own tint, dark
    gaps where both dip."""
    mat, nt, bsdf = _fresh(WEAVE)
    U, V = _uv(nt)
    p = 0.0085
    x, y = U * (1 / p), V * (1 / p)
    ix, iy = _floor(x), _floor(y)
    fx, fy = x - ix, y - iy
    qh, qv = (fy - 0.5) * 2.25, (fx - 0.5) * 2.25
    ph, pv = _sqrt(_max(1.0 - qh * qh, 0.0)), _sqrt(_max(1.0 - qv * qv, 0.0))
    hh = ph * (_cos((x - 0.5 - iy) * math.pi) * 0.25 + 0.75)       # the u strand rises over every other v strand
    hv = pv * (0.75 - _cos((y - 0.5 - ix) * math.pi) * 0.25)
    h = _max(hh, hv)
    top_u = _gt(hh, hv)
    tu, tv = _white(nt, iy + 0.5), _white(nt, ix + 71.3)
    tint = tv + (tu - tv) * top_u
    shade = (h * 0.28 + 0.72) * (tint * 0.2 + 0.9) * (_smooth(nt, 0.0, 0.3, h) * 0.72 + 0.28)
    nt.links.new(bsdf.inputs["Base Color"], _vop(nt, "SCALE", (0.54, 0.355, 0.165), scale=shade))
    bsdf.inputs["Roughness"].default_value = 0.55
    _bump(nt, bsdf, h, 0.7, 0.0012)
    mat.diffuse_color = (0.43, 0.27, 0.12, 1.0)


def _cane():
    """Open cane webbing: strand pairs along u and v, diagonals crossing on them, octagonal holes see-through."""
    mat, nt, bsdf = _fresh(CANE)
    U, V = _uv(nt)
    p = 0.0135
    x, y = U * (1 / p), V * (1 / p)
    fx, fy = _fract(x), _fract(y)
    dhv = _min(_min(fx, 1.0 - fx), _min(fy, 1.0 - fy))
    d1 = _abs(_fract(x - y) - 0.5) * 0.7071
    d2 = _abs(_fract(x + y) - 0.5) * 0.7071
    hv = 1.0 - _smooth(nt, 0.155, 0.185, dhv)                       # strand pairs; octagon flats ~0.33 from the centre
    dg = 1.0 - _smooth(nt, 0.036, 0.056, _min(d1, d2))              # diagonals; their flats ~0.31
    mask = _max(hv, dg)
    groove = 1.0 - _smooth(nt, 0.006, 0.02, dhv)
    tone = _noise(nt, _combine(nt, U * 3.0, V * 3.0), 1.0, 2.0)
    shade = (mask * 0.15 + 0.85) * (1.0 - groove * hv * 0.35) * ((tone - 0.5) * 0.2 + 1.0)
    nt.links.new(bsdf.inputs["Base Color"], _vop(nt, "SCALE", (0.54, 0.39, 0.19), scale=shade))
    _feed(nt, bsdf.inputs["Alpha"], mask)
    bsdf.inputs["Roughness"].default_value = 0.32
    _bump(nt, bsdf, mask * 0.6 + dg * 0.3, 0.3, 0.0006)
    mat.diffuse_color = (0.52, 0.39, 0.20, 1.0)


def _plain(name, rgb, rough):
    mat, nt, bsdf = _fresh(name)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    mat.diffuse_color = (*rgb, 1.0)


def materials():
    """Create or refresh the shared furniture materials (furniture_materials.py) and the chairs' own TM_RB_furn_*."""
    FM.materials()
    for f in (_rattan, _wrap, _weave, _cane):
        f()


# ---------------------------------------------------------------- test renders

TEST_COLL = "RB_furniture_chairs_test"
ORIGIN = Vector((40.0, -45.0, 0.0))


def _slotter(names):
    def slot(n):
        if n not in names:
            names.append(n)
        return names.index(n)
    return slot


def _check(item, z=0.0):
    """Build one item alone and measure it in its own frame: footprint, floor contact (to float32: bmesh stores single
    precision), triangles."""
    bm = bmesh.new()
    info = build(bm, item, z, _slotter([]))
    c, f = item["at"], item["face"]
    fl = math.hypot(*f)
    vx, vy = f[0] / fl, f[1] / fl
    us = [(p.co.x - c[0]) * vy - (p.co.y - c[1]) * vx for p in bm.verts]
    vs = [(p.co.x - c[0]) * vx + (p.co.y - c[1]) * vy for p in bm.verts]
    zs = [p.co.z for p in bm.verts]
    w, d = item["size"]
    rep = {"kind": item["kind"], "variant": info["variant"], "tris": info["tris"], "fit": info["fit"],
           "u": (round(min(us), 4), round(max(us), 4)), "v": (round(min(vs), 4), round(max(vs), 4)),
           "z_min": round(min(zs) - z, 6), "at_floor": sum(1 for q in zs if abs(q - z) < 1e-6), "parts": info["parts"],
           "ok": max(abs(q) for q in us) <= w / 2 + 1e-6 and max(abs(q) for q in vs) <= d / 2 + 1e-6
                 and abs(min(zs) - z) < 1e-6,
           "non_manifold": sum(1 for e in bm.edges if not e.is_manifold)}
    bm.normal_update()
    before = [f.normal.copy() for f in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])          # outward by construction: nothing should flip
    rep["flipped"] = sum(1 for f, n in zip(bm.faces, before) if f.normal.dot(n) < 0.0)
    rep["ok"] = rep["ok"] and rep["flipped"] == 0 and rep["non_manifold"] == 0
    bm.free()
    return rep


def _aim(cam, loc, target, vfov):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(vfov)


def _placeholder_tables(bm, slot, specs):
    """Test-only stand-in tables: ("round", centre) a café table, ("square", centre) a dining table."""
    for kind, c in specs:
        g = _Geo()
        if kind == "round":
            _lathe(g, [(0.0, 0.72), (0.40, 0.72), (0.40, 0.75), (0.0, 0.75)], 32, TEAK)
            _lathe(g, [(0.035, 0.03), (0.035, 0.72)], 12, METAL, caps=(False, False))
            _lathe(g, [(0.0, 0.0), (0.26, 0.0), (0.26, 0.03), (0.0, 0.03)], 32, METAL)
        else:
            for u0, u1, v0, v1, h0, h1 in [(-0.45, 0.45, -0.45, 0.45, 0.70, 0.74)] + [
                    (su * 0.40 - 0.025, su * 0.40 + 0.025, sv * 0.40 - 0.025, sv * 0.40 + 0.025, 0.0, 0.70)
                    for su in (-1, 1) for sv in (-1, 1)]:
                pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
                bot = [g.v((x, y, h0)) for x, y in pts]
                top = [g.v((x, y, h1)) for x, y in pts]
                g.f(bot[::-1], [(0, 0)] * 4, TEAK, False)
                g.f(top, [(0, 0)] * 4, TEAK, False)
                for k in range(4):
                    g.f((bot[k], bot[(k + 1) % 4], top[(k + 1) % 4], top[k]), [(0, 0)] * 4, TEAK, False)
        _emit(bm, g, {"at": (c.x, c.y), "face": (0.0, 1.0)}, 0.0, slot)


def _test(argv):
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    assert "INSPECTION_RIG" in bpy.data.collections, "open terramar_building.blend (its INSPECTION_RIG lights the test)"
    out = os.path.abspath(opts.get("out", "."))
    os.makedirs(out, exist_ok=True)
    scene = bpy.context.scene
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from render_inspection import use_gpu                       # the parent folder's GPU picker
    device = use_gpu(scene)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    guides = bpy.context.view_layer.layer_collection.children.get("RB_PLAN_GUIDES")
    if guides is not None:
        guides.exclude = True
    materials()
    coll = bpy.data.collections.new(TEST_COLL)
    scene.collection.children.link(coll)
    ground = bpy.data.objects.get("RIG_GROUND")                # the rig's grass: a paving tone under the test instead
    if ground is not None:
        ground.hide_render = True
    _plain("chairs_test_paving", (0.50, 0.47, 0.42), 0.85)
    gm = bpy.data.meshes.new("chairs_test_ground")
    gm.from_pydata([(ORIGIN.x + x, ORIGIN.y + y, 0.0) for x, y in ((-30, -70), (30, -70), (30, 40), (-30, 40))], [],
                   [(0, 1, 2, 3)])
    gm.materials.append(bpy.data.materials["chairs_test_paving"])
    coll.objects.link(bpy.data.objects.new("chairs_test_ground", gm))
    report = {"checks": []}

    # footprint / floor / triangle checks: every kind and variant, two sizes, odd orientations, a raised floor
    for kind, sizes in (("dining_chair", ([0.46, 0.50], [0.48, 0.52])), ("cafe_chair", ([0.44, 0.44], [0.42, 0.44])),
                        ("bar_stool", ([0.40, 0.40], [0.36, 0.36]))):
        for var in VARIANTS[kind]:
            for size in sizes:
                for ang in (0.0, 37.0):
                    it = {"kind": kind, "variant": var, "at": [3.1, -2.7], "size": size, "cushion": "ecru",
                          "face": [math.sin(math.radians(ang)), math.cos(math.radians(ang))], "seat_h": 0.76}
                    if kind == "bar_stool" and ang:
                        it["seat_h"] = 0.66
                    if kind == "cafe_chair":
                        it.pop("seat_h")
                    report["checks"].append(_check(it, z=4.15))

    def face_to(a, b):
        d = (Vector(b) - Vector(a)).xy.normalized()
        return [d.x, d.y]

    def build_obj(name, items, tables=()):
        bm, names = bmesh.new(), []
        slot = _slotter(names)
        info = [build(bm, it, 0.0, slot) for it in items]
        if tables:
            _placeholder_tables(bm, slot, tables)
        finish_object(name, coll, bm, names)
        return info

    # (1) lineup: every kind and variant in a row, turned a little toward the camera
    row = ORIGIN
    face = [-math.sin(math.radians(28.0)), -math.cos(math.radians(28.0))]
    line = [("dining_chair", "slat", "offwhite", [0.46, 0.50]), ("dining_chair", "cane", "ecru", [0.46, 0.50]),
            ("dining_chair", "band", "greige", [0.46, 0.50]), ("cafe_chair", "arm", "ecru", [0.44, 0.44]),
            ("cafe_chair", "side", "ecru", [0.44, 0.44]), ("bar_stool", "stool", "greige", [0.40, 0.40]),
            ("bar_stool", "stool", "offwhite", [0.36, 0.36])]
    items = []
    for k, (kind, var, cush, size) in enumerate(line):
        it = {"kind": kind, "variant": var, "cushion": cush, "size": size, "face": face,
              "at": [row.x + (k - 3) * 0.78, row.y]}
        if kind == "bar_stool":
            it["seat_h"] = 0.76 if k == 5 else 0.66
        items.append(it)
    report["lineup"] = [(i["kind"], i["variant"], i["tris"]) for i in
                        [{**it, **inf} for it, inf in zip(items, build_obj("chairs_test_lineup", items))]]

    # (2) café set: four armchairs / side chairs round a stand-in table
    cafe_c = ORIGIN + Vector((0.0, 8.0, 0.0))
    items = []
    for k, ang in enumerate((40.0, 130.0, 222.0, 312.0)):
        a = math.radians(ang)
        at = cafe_c + Vector((0.62 * math.cos(a), 0.62 * math.sin(a), 0.0))
        items.append({"kind": "cafe_chair", "variant": "arm" if k % 2 == 0 else "side", "size": [0.44, 0.44],
                      "at": [at.x, at.y], "face": face_to(at, cafe_c), "cushion": "ecru"})
    report["cafe"] = [i["tris"] for i in build_obj("chairs_test_cafe", items, [("round", cafe_c)])]

    # (3) dining sets: one table per back variant, four chairs each
    dsets = []
    for j, var in enumerate(VARIANTS["dining_chair"]):
        tc = ORIGIN + Vector(((j - 1) * 2.3, 16.0, 0.0))
        items = []
        for du, dv in ((0, -0.68), (0, 0.68), (-0.68, 0), (0.68, 0)):
            at = tc + Vector((du, dv, 0.0))
            items.append({"kind": "dining_chair", "set": f"t{j}", "variant": var, "size": [0.46, 0.50],
                          "at": [at.x, at.y], "face": face_to(at, tc), "cushion": ("offwhite", "ecru", "greige")[j]})
        dsets.append(build_obj(f"chairs_test_dining_{var}", items, [("square", tc)]))
    report["dining"] = [[i["tris"] for i in s] for s in dsets]

    # (4) close-up subjects: a café armchair and a caned dining chair with their backs to the camera, a stool
    close_c = ORIGIN + Vector((0.0, 24.0, 0.0))
    items = [{"kind": "cafe_chair", "variant": "arm", "size": [0.44, 0.44], "at": [close_c.x, close_c.y],
              "face": [0.0, -1.0], "cushion": "ecru"},
             {"kind": "cafe_chair", "variant": "arm", "size": [0.44, 0.44], "at": [close_c.x + 1.2, close_c.y],
              "face": [0.0, 1.0], "cushion": "ecru"},
             {"kind": "dining_chair", "variant": "cane", "size": [0.46, 0.50], "at": [close_c.x + 2.6, close_c.y],
              "face": [0.25, 0.97], "cushion": "ecru"},
             {"kind": "bar_stool", "size": [0.40, 0.40], "at": [close_c.x + 3.8, close_c.y], "face": [0.0, -1.0],
              "cushion": "greige", "seat_h": 0.76},
             {"kind": "dining_chair", "variant": "slat", "size": [0.46, 0.50], "at": [close_c.x + 5.2, close_c.y],
              "face": [-0.45, -0.89], "cushion": "ecru"}]
    build_obj("chairs_test_close", items)

    cam = bpy.data.objects.new("chairs_test_cam", bpy.data.cameras.new("chairs_test_cam"))
    cam.data.clip_start = 0.02
    scene.collection.objects.link(cam)
    scene.camera = cam
    b8_vfov = math.degrees(2 * math.atan(157.5 / 1712.0))  # b8's focal (1712 px) over a 315 px tall window
    C = close_c
    views = {   # name: (camera, target, vfov, resolution)
        "lineup": (row + Vector((0.3, -6.4, 1.5)), row + Vector((0.0, 0.0, 0.45)), 26.0, (1600, 900)),
        "lineup_low": (row + Vector((0.3, -4.6, 0.55)), row + Vector((0.0, 0.0, 0.45)), 34.0, (1600, 900)),
        "cafe_street": (cafe_c + Vector((-6.0, -50.0, 1.54)), cafe_c + Vector((0.0, 0.0, 0.5)), b8_vfov, (560, 315)),
        "cafe_mid": (cafe_c + Vector((-2.4, -6.0, 1.6)), cafe_c + Vector((0.0, 0.0, 0.45)), 26.0, (1600, 900)),
        "cafe_close": (cafe_c + Vector((-1.1, -2.1, 1.05)), cafe_c + Vector((-0.25, -0.35, 0.5)), 42.0, (1600, 900)),
        "dining": (ORIGIN + Vector((0.4, 11.3, 1.65)), ORIGIN + Vector((0.0, 16.0, 0.45)), 38.0, (1600, 900)),
        "joint": (C + Vector((0.42, -0.62, 0.58)), C + Vector((0.17, -0.17, 0.45)), 32.0, (1600, 900)),
        "weave": (C + Vector((0.25, -0.95, 0.95)), C + Vector((0.0, -0.05, 0.60)), 34.0, (1600, 900)),
        "back": (C + Vector((1.55, -0.85, 0.95)), C + Vector((1.2, -0.15, 0.62)), 36.0, (1600, 900)),
        "cane": (C + Vector((2.35, -0.85, 0.95)), C + Vector((2.6, -0.2, 0.68)), 30.0, (1600, 900)),
        "stool": (C + Vector((3.5, -1.3, 1.0)), C + Vector((3.8, 0.0, 0.45)), 36.0, (1600, 900)),
        "dining_front": (C + Vector((4.75, -1.25, 1.05)), C + Vector((5.2, 0.0, 0.5)), 38.0, (1600, 900)),
    }
    subjects = {"lineup": "lineup", "lineup_low": "lineup", "cafe_street": "cafe", "cafe_mid": "cafe",
                "cafe_close": "cafe", "dining": "dining", "joint": "close", "weave": "close", "back": "close",
                "cane": "close", "stool": "close", "dining_front": "close"}
    shots = set(opts.get("shots", ",".join(views)).split(","))
    for name, (loc, target, vfov, res) in views.items():
        if name not in shots:
            continue
        for ob in coll.objects:
            ob.hide_render = not ob.name.startswith((f"chairs_test_{subjects[name]}", "chairs_test_ground"))
        scene.render.resolution_x, scene.render.resolution_y = res
        _aim(cam, loc, target, vfov)
        scene.render.filepath = os.path.join(out, f"chairs_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name} on {device} -> {scene.render.filepath}")
    bad = [c for c in report["checks"] if not c["ok"] or c["fit"] != (1.0, 1.0)]
    print("CHAIRS_REPORT", {k: v for k, v in report.items() if k != "checks"})
    for c in report["checks"]:
        print("CHAIRS_CHECK", c)
    print("CHAIRS_BAD", len(bad), bad)


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
