"""Carving kit for the ornament scripts: a typed line drawing (SVG) in, relief meshes whose edges follow its lines out.

Why (strategy, 2026-09-28): the lines you see on carved terracotta are mostly shadows -- undercut leaf edges, V-cut
flutes, drilled eyes -- so a line only reads in 3D if the mesh has a step or a crease exactly on it. A displaced grid or
a sculpt puts vertices where the grid is, not on the lines. Here every drawn line becomes a chain of edges, flanked by
support offsets at the knots of its cross-section (their spacing is the sharpness), and the patch between the lines is
filled freely by a constrained Delaunay triangulation (`mathutils.geometry.delaunay_2d_cdt`), whose `orig_edges` keep
each edge's line type. The relief is built flat -- u across, v up the drawing, w out of the face -- and handed to a
wrap function that places it on the blank along the view axis, so the front view stays exactly the drawing.

The drawing: one Inkscape layer per line type (LINE_TYPES); each path's inkscape:label, else its id up to the first
'.', names its element. The SVG reader and the planar helpers are plain Python (overlay_drawing.py runs them outside
Blender); the mesh functions import bpy/bmesh/mathutils when called.
"""
import math, re
import xml.etree.ElementTree as ET

INK = "{http://www.inkscape.org/namespaces/inkscape}"
SODI = "{http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd}"
LINE_TYPES = ("guide", "outline", "ridge", "groove", "eye", "path", "point", "crease")   # crease: a fold line with no section of its own, only a mesh edge to fold on

# ---------------------------------------------------------------- SVG reader
_TOK = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
_IDENT = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)

def _mul(a, b):
    """SVG matrices (a b c d e f): the transform b applied first, then a."""
    return (a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1], a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
            a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5])

def _transform(s):
    m = _IDENT
    for kind, args in re.findall(r"(\w+)\s*\(([^)]*)\)", s or ""):
        v = [float(x) for x in re.split(r"[\s,]+", args.strip()) if x]
        if kind == "matrix": t = tuple(v)
        elif kind == "translate": t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0.0)
        elif kind == "scale": t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif kind == "rotate":
            a = math.radians(v[0]); c, s_ = math.cos(a), math.sin(a); t = (c, s_, -s_, c, 0, 0)
            if len(v) == 3: t = _mul(_mul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        elif kind == "skewX": t = (1, 0, math.tan(math.radians(v[0])), 1, 0, 0)
        elif kind == "skewY": t = (1, math.tan(math.radians(v[0])), 0, 1, 0, 0)
        else: continue
        m = _mul(m, t)
    return m

def _apply(m, p):
    return (m[0]*p[0] + m[2]*p[1] + m[4], m[1]*p[0] + m[3]*p[1] + m[5])

def _arc(p0, rx, ry, phi, large, sweep, p1, seg_deg=6.0):
    """SVG elliptical arc (endpoint form) as points after p0, through the centre form of the SVG spec (F.6.5)."""
    if rx == 0 or ry == 0: return [p1]
    cp, sp = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1, y1 = cp*dx + sp*dy, -sp*dx + cp*dy
    rx, ry = abs(rx), abs(ry)
    lam = x1*x1/(rx*rx) + y1*y1/(ry*ry)
    if lam > 1: rx, ry = rx*math.sqrt(lam), ry*math.sqrt(lam)
    num = rx*rx*ry*ry - rx*rx*y1*y1 - ry*ry*x1*x1
    k = math.sqrt(max(0.0, num / (rx*rx*y1*y1 + ry*ry*x1*x1))) * (-1 if large == sweep else 1)
    cx1, cy1 = k*rx*y1/ry, -k*ry*x1/rx
    cx, cy = cp*cx1 - sp*cy1 + (p0[0] + p1[0])/2, sp*cx1 + cp*cy1 + (p0[1] + p1[1])/2
    def ang(ux, uy, vx, vy):
        a = math.atan2(ux*vy - uy*vx, ux*vx + uy*vy); return a
    t0 = ang(1, 0, (x1 - cx1)/rx, (y1 - cy1)/ry)
    dt = ang((x1 - cx1)/rx, (y1 - cy1)/ry, (-x1 - cx1)/rx, (-y1 - cy1)/ry)
    if not sweep and dt > 0: dt -= 2*math.pi
    elif sweep and dt < 0: dt += 2*math.pi
    n = max(2, int(abs(math.degrees(dt)) / seg_deg))
    out = []
    for i in range(1, n + 1):
        t = t0 + dt*i/n
        ex, ey = rx*math.cos(t), ry*math.sin(t)
        out.append((cp*ex - sp*ey + cx, sp*ex + cp*ey + cy))
    return out

def path_polylines(d, seg=16):
    """An SVG path's subpaths as [(points, closed)], curves flattened (seg points per Bezier)."""
    toks = _TOK.findall(d or ""); i = 0; cmd = None
    cur = start = (0.0, 0.0); pts = []; out = []; ctrl = None; last = None
    def nums(k):
        nonlocal i
        v = [float(t) for t in toks[i:i + k]]; i += k
        return v
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in "Zz":
                if pts: out.append((pts, True)); pts = []
                cur = start; last = cmd; continue
        rel = cmd.islower(); C = cmd.upper()
        ox, oy = cur if rel else (0.0, 0.0)
        if C == "M":
            x, y = nums(2); p = (ox + x, oy + y)
            if pts: out.append((pts, False))
            pts = [p]; cur = start = p; cmd = "l" if rel else "L"
        elif C == "L":
            x, y = nums(2); cur = (ox + x, oy + y); pts.append(cur)
        elif C == "H":
            x, = nums(1); cur = ((cur[0] if rel else 0.0) + x, cur[1]); pts.append(cur)
        elif C == "V":
            y, = nums(1); cur = (cur[0], (cur[1] if rel else 0.0) + y); pts.append(cur)
        elif C in "CS":
            if C == "C":
                x1, y1, x2, y2, x, y = nums(6); c1 = (ox + x1, oy + y1)
            else:
                x2, y2, x, y = nums(4)
                c1 = (2*cur[0] - ctrl[0], 2*cur[1] - ctrl[1]) if last and last.upper() in "CS" else cur
            c2 = (ox + x2, oy + y2); p = (ox + x, oy + y)
            for k in range(1, seg + 1):
                t = k/seg; a, b, c, e = (1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3
                pts.append((a*cur[0] + b*c1[0] + c*c2[0] + e*p[0], a*cur[1] + b*c1[1] + c*c2[1] + e*p[1]))
            ctrl = c2; cur = p
        elif C in "QT":
            if C == "Q":
                x1, y1, x, y = nums(4); c1 = (ox + x1, oy + y1)
            else:
                x, y = nums(2)
                c1 = (2*cur[0] - ctrl[0], 2*cur[1] - ctrl[1]) if last and last.upper() in "QT" else cur
            p = (ox + x, oy + y)
            for k in range(1, seg + 1):
                t = k/seg; a, b, c = (1-t)**2, 2*(1-t)*t, t*t
                pts.append((a*cur[0] + b*c1[0] + c*p[0], a*cur[1] + b*c1[1] + c*p[1]))
            ctrl = c1; cur = p
        elif C == "A":
            rx, ry, phi, large, sweep, x, y = nums(7); p = (ox + x, oy + y)
            pts += _arc(cur, rx, ry, phi, int(large), int(sweep), p); cur = p
        last = cmd
    if len(pts) > 1: out.append((pts, False))
    return out

def read_drawing(path):
    """{element: {type: [(points, closed)], 'point': [(cx, cy, rx, ry)]}} in SVG user units; the layer (an
    Inkscape layer group whose label is a line type) gives the type."""
    root = ET.parse(path).getroot()
    out = {}
    def add(el, kind, item):
        out.setdefault(el, {}).setdefault(kind, []).append(item)
    def walk(node, m, kind):
        tag = node.tag.split("}")[-1]
        m = _mul(m, _transform(node.get("transform")))
        if tag in ("svg", "g"):
            if tag == "g" and node.get(INK + "groupmode") == "layer":
                label = (node.get(INK + "label") or "").strip().lower()
                kind = label if label in LINE_TYPES else None
            for ch in node: walk(ch, m, kind)
            return
        if kind is None: return
        el = node.get(INK + "label") or (node.get("id") or "unnamed").split(".")[0]
        if tag in ("ellipse", "circle") or (tag == "path" and node.get(SODI + "type") == "arc"):
            g = (lambda k, dflt=0.0: float(node.get(k, node.get(SODI + k, dflt))))
            cx, cy = g("cx"), g("cy")
            rx = g("r") if tag == "circle" else g("rx"); ry = g("r") if tag == "circle" else g("ry")
            c = _apply(m, (cx, cy)); sx = math.hypot(m[0], m[1]); sy = math.hypot(m[2], m[3])
            if kind == "point": add(el, "point", (c[0], c[1], rx*sx, ry*sy)); return
            pts = [_apply(m, (cx + rx*math.cos(2*math.pi*k/48), cy + ry*math.sin(2*math.pi*k/48))) for k in range(48)]
            add(el, kind, (pts, True)); return
        if tag == "path": subs = path_polylines(node.get("d"))
        elif tag in ("polyline", "polygon"):
            v = [float(x) for x in re.split(r"[\s,]+", (node.get("points") or "").strip()) if x]
            subs = [(list(zip(v[0::2], v[1::2])), tag == "polygon")]
        elif tag == "line":
            subs = [([(float(node.get("x1", 0)), float(node.get("y1", 0))), (float(node.get("x2", 0)), float(node.get("y2", 0)))], False)]
        elif tag == "rect":
            x, y, w, h = (float(node.get(k, 0)) for k in ("x", "y", "width", "height"))
            subs = [([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], True)]
        else: return
        for pts, closed in subs:
            if len(pts) > 1 and math.dist(pts[0], pts[-1]) < 1e-6 and len(pts) > 2: pts = pts[:-1]; closed = True
            add(el, kind, ([_apply(m, p) for p in pts], closed))
    walk(root, _IDENT, None)
    return out

# ---------------------------------------------------------------- planar helpers (plain tuples)
def signed_area(poly):
    return 0.5 * sum(poly[i-1][0]*poly[i][1] - poly[i][0]*poly[i-1][1] for i in range(len(poly)))

def inside(p, poly):
    x, y = p; c = False; n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i-1], poly[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def resample(pts, closed, step, corner_deg=35.0):
    """Even spacing close to `step`, keeping every corner (a turn sharper than corner_deg) as a vertex."""
    n = len(pts)
    if n < 2: return list(pts)
    def turn(i):
        a, b, c = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        u = (b[0] - a[0], b[1] - a[1]); w = (c[0] - b[0], c[1] - b[1])
        lu, lw = math.hypot(*u), math.hypot(*w)
        if lu < 1e-12 or lw < 1e-12: return 0.0
        return math.degrees(math.acos(max(-1.0, min(1.0, (u[0]*w[0] + u[1]*w[1]) / (lu*lw)))))
    idx = range(n) if closed else range(1, n - 1)
    corners = [i for i in idx if turn(i) > corner_deg]
    if closed:
        s = corners[0] if corners else 0
        seq = pts[s:] + pts[:s] + [pts[s]]
        cut = sorted({(c - s) % n for c in corners} | {0, n})
    else:
        seq = list(pts); cut = sorted({0, n - 1} | set(corners))
    out = []
    for a, b in zip(cut[:-1], cut[1:]):
        run = seq[a:b + 1]
        L = [0.0]
        for i in range(1, len(run)): L.append(L[-1] + math.dist(run[i-1], run[i]))
        k = max(1, int(round(L[-1] / step)))
        j = 0
        for q in range(k):
            t = L[-1] * q / k
            while j < len(run) - 2 and L[j + 1] < t: j += 1
            seg = L[j + 1] - L[j]; f = 0.0 if seg < 1e-12 else (t - L[j]) / seg
            out.append((run[j][0] + (run[j+1][0] - run[j][0]) * f, run[j][1] + (run[j+1][1] - run[j][1]) * f))
    if not closed: out.append(seq[-1])
    return out

def offset(pts, closed, d, miter=2.0):
    """The polyline moved d along its left normal (a CCW loop's inside), mitred, limited to `miter` x d."""
    n = len(pts); out = []
    def nrm(i, j):
        dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]; L = math.hypot(dx, dy) or 1e-12
        return (-dy / L, dx / L)
    for i in range(n):
        if not closed and i == 0: m = nrm(0, 1); s = 1.0
        elif not closed and i == n - 1: m = nrm(n - 2, n - 1); s = 1.0
        else:
            a, b = nrm((i - 1) % n, i), nrm(i, (i + 1) % n)
            m = (a[0] + b[0], a[1] + b[1]); L = math.hypot(*m)
            if L < 1e-9: m, s = a, 1.0
            else:
                m = (m[0] / L, m[1] / L); s = min(miter, 1.0 / max(1e-6, m[0]*a[0] + m[1]*a[1]))
        out.append((pts[i][0] + m[0]*d*s, pts[i][1] + m[1]*d*s))
    return out

class SegIndex:
    """Nearest-segment queries over many polylines (uniform grid). Each segment remembers (line id, arc length)."""
    def __init__(self, cell):
        self.cell = cell; self.g = {}; self.lines = {}
    def add(self, lid, pts, closed):
        segs = list(zip(pts, pts[1:] + ([pts[0]] if closed else [])))
        s0 = 0.0; total = sum(math.dist(a, b) for a, b in segs); self.lines[lid] = (total, closed)
        for a, b in segs:
            L = math.dist(a, b)
            x0, x1 = sorted((a[0], b[0])); y0, y1 = sorted((a[1], b[1]))
            for gx in range(int(math.floor(x0 / self.cell)), int(math.floor(x1 / self.cell)) + 1):
                for gy in range(int(math.floor(y0 / self.cell)), int(math.floor(y1 / self.cell)) + 1):
                    self.g.setdefault((gx, gy), []).append((a, b, lid, s0, L))
            s0 += L
    def ray(self, p, d, length, lids):
        """Distance along unit direction d from p to the first segment of the given lines, or `length` if none."""
        best = length
        ex, ey = p[0] + d[0] * length, p[1] + d[1] * length
        gx0, gx1 = sorted((int(math.floor(p[0] / self.cell)), int(math.floor(ex / self.cell))))
        gy0, gy1 = sorted((int(math.floor(p[1] / self.cell)), int(math.floor(ey / self.cell))))
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                for a, b, lid, s0, L in self.g.get((gx, gy), ()):
                    if lid not in lids: continue
                    sx, sy = b[0] - a[0], b[1] - a[1]
                    den = d[0] * sy - d[1] * sx
                    if abs(den) < 1e-15: continue
                    t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den
                    u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den
                    if 1e-4 < t < best and -1e-9 <= u <= 1 + 1e-9: best = t
        return best
    def near(self, p, r):
        """{line id: (distance, arc length at the foot)} for lines within r of p."""
        best = {}
        gx0, gy0 = int(math.floor((p[0] - r) / self.cell)), int(math.floor((p[1] - r) / self.cell))
        gx1, gy1 = int(math.floor((p[0] + r) / self.cell)), int(math.floor((p[1] + r) / self.cell))
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                for a, b, lid, s0, L in self.g.get((gx, gy), ()):
                    dx, dy = b[0] - a[0], b[1] - a[1]; ll = dx*dx + dy*dy
                    t = 0.0 if ll < 1e-18 else max(0.0, min(1.0, ((p[0] - a[0])*dx + (p[1] - a[1])*dy) / ll))
                    d = math.hypot(p[0] - a[0] - t*dx, p[1] - a[1] - t*dy)
                    if d <= r and (lid not in best or d < best[lid][0]): best[lid] = (d, s0 + t*L)
        return best

def profile(knots, d):
    """Piecewise-linear section: knots [(distance, fraction)], 0 past the last knot."""
    if d >= knots[-1][0]: return 0.0
    for (d0, f0), (d1, f1) in zip(knots, knots[1:]):
        if d <= d1: return f0 + (f1 - f0) * (d - d0) / (d1 - d0 or 1e-12)
    return knots[-1][1]

def smoothstep(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)

def curl_vein(base, tip, curl=2.0, n=96):
    """A leaf spine from `base` to `tip` (u across, v up): it leaves the base straight up and turns steadily toward its
    point, its tangent angle growing as (arc length)**curl -- curl 1 is a circular arc, 2 an Euler spiral (curvature
    growing linearly along it), higher bends later and harder. The length and the end angle are solved so that it lands
    exactly on `tip`; spines to farther-out points come out more curved, as a leaf's do."""
    dx, dy = tip[0] - base[0], tip[1] - base[1]
    target = math.atan2(dx, dy)                                        # the chord's angle from straight up, signed
    def shape(a):
        pts = [(0.0, 0.0)]; x = y = 0.0
        for i in range(n):
            u = (i + 0.5) / n; th = a * u ** curl
            x += math.sin(th) / n; y += math.cos(th) / n; pts.append((x, y))
        return pts
    lo, hi = 0.0, math.copysign(math.pi * 0.95, target)                # the chord's angle grows with the end angle
    for _ in range(60):
        mid = (lo + hi) / 2; ex, ey = shape(mid)[-1]
        if abs(math.atan2(ex, ey)) < abs(target): lo = mid
        else: hi = mid
    pts = shape((lo + hi) / 2); ex, ey = pts[-1]
    L = math.hypot(dx, dy) / math.hypot(ex, ey)                        # scale the unit-length shape onto the chord
    rot = target - math.atan2(ex, ey)                                  # and close the last sliver of angle
    c, s = math.cos(rot), math.sin(rot)
    return [(base[0] + L * (x * c + y * s), base[1] + L * (-x * s + y * c)) for x, y in pts]

# ---------------------------------------------------------------- a leaf grown round its spines (numpy)
def spine_track(points, spine):
    """For an (N, 2) array of points: distance to the spine polyline and where along it (0 at its start, 1 at its end)
    their nearest point lies. Past either end the nearest point is that end, so fields built on it end in round caps."""
    import numpy as np
    S = np.asarray(spine, float); A = S[:-1]; D = S[1:] - S[:-1]
    L = np.hypot(D[:, 0], D[:, 1]); cum = np.concatenate([[0.0], np.cumsum(L)]); total = cum[-1]
    X = np.asarray(points, float)
    best_d = np.full(len(X), np.inf); best_a = np.zeros(len(X))
    for k in range(len(A)):
        ap = X - A[k]; ll = L[k] * L[k]
        t = np.clip((ap @ D[k]) / ll, 0.0, 1.0) if ll > 0 else np.zeros(len(X))
        q = ap - np.outer(t, D[k]); d = np.hypot(q[:, 0], q[:, 1])
        m = d < best_d; best_d[m] = d[m]; best_a[m] = (cum[k] + t[m] * L[k]) / total
    return best_d, best_a

def soft_max(stack, soft):
    """Smooth union of fields (log-sum-exp): equal to the largest where one dominates, rounded where they meet."""
    import numpy as np
    m = stack.max(axis=0)
    return m + soft * np.log(np.exp((stack - m) / soft).sum(axis=0))

def contour_loops(F, xs, ys):
    """Closed zero-level loops of the grid F[j, i] (at xs[i], ys[j]) by marching squares, as lists of (x, y)."""
    import numpy as np
    inside = F > 0; ny, nx = F.shape; pt = {}; nbr = {}
    def cross(key):
        if key not in pt:
            kind, i, j = key
            if kind == "h": f0, f1, p0, p1 = F[j, i], F[j, i + 1], (xs[i], ys[j]), (xs[i + 1], ys[j])
            else: f0, f1, p0, p1 = F[j, i], F[j + 1, i], (xs[i], ys[j]), (xs[i], ys[j + 1])
            t = f0 / (f0 - f1); pt[key] = (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t)
        return key
    TABLE = {1: [(3, 0)], 2: [(0, 1)], 3: [(3, 1)], 4: [(1, 2)], 6: [(0, 2)], 7: [(3, 2)], 8: [(2, 3)], 9: [(0, 2)],
             11: [(1, 2)], 12: [(1, 3)], 13: [(0, 1)], 14: [(0, 3)]}
    cases = inside[:-1, :-1] * 1 + inside[:-1, 1:] * 2 + inside[1:, 1:] * 4 + inside[1:, :-1] * 8
    for j, i in zip(*np.nonzero((cases > 0) & (cases < 15))):
        c = int(cases[j, i]); edges = {0: ("h", i, j), 1: ("v", i + 1, j), 2: ("h", i, j + 1), 3: ("v", i, j)}
        if c in (5, 10):
            centre = (F[j, i] + F[j, i + 1] + F[j + 1, i + 1] + F[j + 1, i]) / 4 > 0
            segs = ([(0, 1), (2, 3)] if centre else [(3, 0), (1, 2)]) if c == 5 else ([(3, 0), (1, 2)] if centre else [(0, 1), (2, 3)])
        else: segs = TABLE[c]
        for e0, e1 in segs:
            k0, k1 = cross(edges[e0]), cross(edges[e1])
            nbr.setdefault(k0, []).append(k1); nbr.setdefault(k1, []).append(k0)
    loops, seen = [], set()
    for k0 in list(nbr):
        if k0 in seen: continue
        loop = [k0]; seen.add(k0); prev, cur = None, k0
        while True:
            nxt = [k for k in nbr[cur] if k != prev and (k not in seen or (k == k0 and len(loop) > 2))]
            if not nxt or nxt[0] == k0: break
            prev, cur = cur, nxt[0]; loop.append(cur); seen.add(cur)
        if len(loop) > 2: loops.append([pt[k] for k in loop])
    return loops

def polygon_field(points, poly):
    """For an (N, 2) array of points: the signed distance to a closed polygon, positive inside."""
    import numpy as np
    X = np.asarray(points, float); P = np.asarray(poly, float); Q = np.roll(P, -1, axis=0)
    best = np.full(len(X), np.inf); inside = np.zeros(len(X), bool)
    for (ax, ay), (bx, by) in zip(P, Q):
        dx, dy = bx - ax, by - ay; ll = dx * dx + dy * dy
        t = np.clip(((X[:, 0] - ax) * dx + (X[:, 1] - ay) * dy) / ll, 0.0, 1.0) if ll > 0 else np.zeros(len(X))
        best = np.minimum(best, np.hypot(X[:, 0] - ax - t * dx, X[:, 1] - ay - t * dy))
        if dy != 0:                                                    # crossing number along +x
            inside ^= ((ay > X[:, 1]) != (by > X[:, 1])) & (X[:, 0] < ax + (X[:, 1] - ay) * dx / dy)
    return np.where(inside, best, -best)

def web_polygon(inner, outer, sinus):
    """The lamina joining two neighbouring leaflets down to a sinus: the inner spine from where it passes the outer
    spine's base up to its point nearest the sinus, the sinus, then the outer spine back down to its base. United with
    the leaflets, it fills the slot between them up to the sinus, which becomes the notch's bottom (its corners rounded
    by grow_leaf's web_soft)."""
    def nearest(sp, p): return min(range(len(sp)), key=lambda i: math.dist(sp[i], p))
    i0, ia, ib = nearest(inner, outer[0]), nearest(inner, sinus), nearest(outer, sinus)
    return list(inner[i0:ia + 1]) + [tuple(sinus)] + list(outer[ib::-1])

def grow_leaf(leaflets, bounds, cell=0.0005, soft=0.0025, foot=None, webs=(), web_soft=0.003, top=None):
    """A leaf as the smooth union of its leaflets, each grown round its spine: half-width `width(a)` (a = 0 at the
    spine's start .. 1 at its end, round cap past the end) and a rounded section `thick(a)` high at the spine, falling
    to nothing at its edge; `webs` (polygons, see web_polygon) join neighbouring leaflets, united more softly
    (`web_soft`) so the notches they leave have rounded bottoms. Returns (outline polygon, sections (u, v) -> w: the
    leaflets' sections united, a surface that follows its spines, depth (u, v) -> how far inside the outline, ~ the
    distance to the edge near it, for a body that ignores the spines); `foot` cuts the leaf flat at v = foot, `top` at
    v = top (a tip trimmed blunt)."""
    import numpy as np
    x0, y0, x1, y1 = bounds
    xs = np.arange(x0, x1 + cell, cell); ys = np.arange(y0, y1 + cell, cell)
    X, Y = np.meshgrid(xs, ys); P = np.stack([X.ravel(), Y.ravel()], 1)
    inside, body = [], []
    for lf in leaflets:
        d, a = spine_track(P, lf["spine"])
        w = np.array([lf["width"](v) for v in a]); t = np.array([lf["thick"](v) for v in a])
        inside.append(w - d); body.append(t * np.sqrt(np.clip(1.0 - (d / w) ** 2, 0.0, 1.0)))
    F = soft_max(np.stack(inside), soft)
    if webs: F = soft_max(np.stack([F] + [polygon_field(P, poly) for poly in webs]), web_soft)
    F = F.reshape(X.shape)
    H = (np.stack(body) ** 4).sum(axis=0).reshape(X.shape) ** 0.25        # p-norm union: a leaflet alone keeps its own height, overlapping ones add up
    if foot is not None: F = np.minimum(F, Y - foot)
    if top is not None: F = np.minimum(F, top - Y)
    H = np.where(F > 0, np.maximum(H, 0.0), 0.0)
    outline = max(contour_loops(F, xs, ys), key=lambda l: abs(signed_area(l)))
    def lookup(G):
        def at(u, v):
            fi = (u - x0) / cell; fj = (v - y0) / cell
            i = int(min(max(math.floor(fi), 0), len(xs) - 2)); j = int(min(max(math.floor(fj), 0), len(ys) - 2))
            tx = min(max(fi - i, 0.0), 1.0); ty = min(max(fj - j, 0.0), 1.0)
            return float(G[j, i] * (1 - tx) * (1 - ty) + G[j, i + 1] * tx * (1 - ty) + G[j + 1, i] * (1 - tx) * ty + G[j + 1, i + 1] * tx * ty)
        return at
    return outline, lookup(H), lookup(np.maximum(F, 0.0))

# ---------------------------------------------------------------- relief patch (Blender)
DEFAULT_SPEC = {
    "step": 0.0025,                                   # spacing along every line
    "fill": 0.0035,                                   # free interior points (hex grid)
    "ridge": (0.0025, [(0.0, 1.0), (0.0015, 0.72), (0.004, 0.0)]),     # height, section knots: a rounded crest
    "groove": (0.006, [(0.0, 1.0), (0.0012, 0.78), (0.004, 0.0)]),     # depth, section knots: a V-cut, eased at the bottom
    "roll": (0.005, [(0.0, 1.0), (0.0015, 0.45), (0.005, 0.0)]),       # drop at outlines and eye rims: a rounded edge
    "cushion": (0.004, 0.008),                        # height, reach: the strip between grooves and edges swells into a pipe
    "fade": 0.008,                                    # open ridges/grooves run out over this length at free ends
    "thickness": 0.009,                               # the leaf's edge, then its underside runs back to the bell
    "undercut": 0.006,                                # how far the underside tucks in under the edge: at least this,
    "undercut_k": 0.6,                                # this fraction of the edge's height off the bell (a leaf that
    "undercut_max": 0.03,                             # leans out is hollow behind), and at most this
    "sink": 0.004,                                    # everything ends this far behind the surface it sits on
}

def _line_mesh(outline, eyes, ridges, grooves, sp, creases=()):
    """The planar mesh of one element: every drawn line (resampled) and the support offsets at the knots of its section
    as constraint edges, the free interior on a hex grid clear of them, triangulated by delaunay_2d_cdt."""
    from mathutils import Vector
    from mathutils.geometry import delaunay_2d_cdt
    step, fill = sp["step"], sp["fill"]
    outline = resample(outline, True, step)
    if signed_area(outline) < 0: outline = outline[::-1]
    eyes = [resample(e, True, step) for e in eyes]
    eyes = [e[::-1] if signed_area(e) > 0 else e for e in eyes]              # clockwise: the material is on their left
    ridges = [resample(r, False, step) for r in ridges]
    grooves = [resample(g, False, step) for g in grooves]
    creases = [resample(c, False, step) for c in creases]

    primary = [("outline", outline, True)] + [("eye", e, True) for e in eyes] + \
              [("ridge", r, False) for r in ridges] + [("groove", g, False) for g in grooves] + \
              [("crease", c, False) for c in creases]
    idx = SegIndex(0.01)
    for k, (t, pts, closed) in enumerate(primary): idx.add(k, pts, closed)
    def in_material(p):
        return inside(p, outline) and not any(inside(p, e) for e in eyes)

    # support offsets at every knot of each line's section, clipped where they would cross another line
    supports = []
    for k, (t, pts, closed) in enumerate(primary):
        if t == "crease": continue                                             # a crease has no section, so no support rows
        knots = sp["roll"][1] if t in ("outline", "eye") else sp[t][1]
        sides = (1.0,) if t in ("outline", "eye") else (1.0, -1.0)
        kind = "edge" if t in ("outline", "eye") else "support"          # rows of an edge's round-over, or of a line's section
        for kd, _ in knots[1:]:
            for s in sides:
                run = []
                for q in offset(pts, closed, s * kd):
                    ok = in_material(q) and all(d >= 0.8 * kd for lid, (d, _) in idx.near(q, kd).items() if lid != k)
                    if ok: run.append(q)
                    else:
                        if len(run) > 1: supports.append((run, kind))
                        run = []
                if len(run) > 1: supports.append((run, kind))

    # constraint vertices/edges; the free interior on a hex grid kept clear of every line
    verts, edges, etype, lines_at = [], [], [], []
    TYPES = ["outline", "eye", "ridge", "groove", "support", "free", "edge", "crease"]
    def add_line(pts, closed, t):
        i0 = len(verts)
        verts.extend(pts)
        for i in range(len(pts) - (0 if closed else 1)):
            edges.append((i0 + i, i0 + (i + 1) % len(pts))); etype.append(TYPES.index(t))
        return list(range(i0, i0 + len(pts)))
    outline_ids = add_line(outline, True, "outline")
    for t, pts, closed in primary[1:]: add_line(pts, closed, t)
    for run, kind in supports: add_line(run, False, kind)
    cons = SegIndex(0.01)
    for k, (t, pts, closed) in enumerate(primary): cons.add(k, pts, closed)
    for j, (run, kind) in enumerate(supports): cons.add(1000 + j, run, False)
    xs = [p[0] for p in outline]; ys = [p[1] for p in outline]
    row = 0; y = min(ys) + fill / 2
    while y < max(ys):
        x = min(xs) + (fill / 2 if row % 2 else 0.0)
        while x < max(xs):
            q = (x, y)
            if in_material(q) and not cons.near(q, 0.6 * fill): verts.append(q)
            x += fill
        y += fill * 0.866; row += 1

    V, E, F, orig_v, orig_e, orig_f = delaunay_2d_cdt([Vector(p) for p in verts], edges, [outline_ids], 1, 1e-7)
    out_type = []
    for srcs in orig_e:
        t = min((etype[s] if s < len(etype) else 0) for s in srcs) if srcs else 5
        out_type.append(t)
    edge_type = {tuple(sorted(e)): out_type[k] for k, e in enumerate(E)}
    tris = [f for f in F if not any(inside(((V[f[0]].x + V[f[1]].x + V[f[2]].x) / 3, (V[f[0]].y + V[f[1]].y + V[f[2]].y) / 3), e) for e in eyes)]
    return {"V": V, "tris": tris, "edge_type": edge_type, "primary": primary, "idx": idx}

def _line_height(lm, base, sp):
    """Height of one element at (u, v): its own surface base(u, v), rounded down at its edges, swelling between cuts,
    ridges added (capped where they bundle, spec ridge_cap), the deepest groove cut."""
    primary, idx, step = lm["primary"], lm["idx"], sp["step"]
    r_h, r_k = sp["ridge"]; g_d, g_k = sp["groove"]; o_d, o_k = sp["roll"]; fade = sp["fade"]
    c_h, c_r = sp["cushion"]
    reach = max(r_k[-1][0], g_k[-1][0], o_k[-1][0], c_r) + 1e-6
    def touches_edge(lid, end):
        return any(d < 1.5 * step for l2, (d, _) in idx.near(end, 1.5 * step).items() if l2 != lid and primary[l2][0] in ("outline", "eye"))
    free_ends = {lid: (not touches_edge(lid, pts[0]), not touches_edge(lid, pts[-1]))
                 for lid, (t, pts, closed) in enumerate(primary) if not closed}
    def free_end_fade(lid, s_at):
        if lid not in free_ends: return 1.0
        total = idx.lines[lid][0]; f = 1.0
        if free_ends[lid][0]: f *= smoothstep(s_at / fade)
        if free_ends[lid][1]: f *= smoothstep((total - s_at) / fade)
        return f
    def height(p):
        w = base(*p); near = idx.near(p, reach); edge_d = reach; cut_d = c_r; ridge = 0.0; groove = 0.0
        for lid, (d, s_at) in near.items():
            t = primary[lid][0]
            if t in ("outline", "eye"): edge_d = min(edge_d, d); cut_d = min(cut_d, d)
            elif t == "crease": continue                                         # only a fold line
            elif t == "ridge": ridge += r_h * profile(r_k, d) * free_end_fade(lid, s_at)
            else:
                fe = free_end_fade(lid, s_at)
                groove = max(groove, g_d * profile(g_k, d) * fe)
                cut_d = min(cut_d, d + (1.0 - fe) * c_r)
        swell = c_h * (1.0 - (1.0 - min(1.0, cut_d / c_r)) ** 2)
        if sp.get("ridge_cap"): ridge = sp["ridge_cap"] * (1.0 - math.exp(-ridge / sp["ridge_cap"]))   # bundled ridges build up, then saturate
        return w - o_d * profile(o_k, edge_d) + swell + ridge - groove
    return height

def relief_patch(name, outline, eyes, ridges, grooves, base, wrap, mat, coll, spec=None):
    """One carved element. outline: closed loop and eyes: closed loops, ridges/grooves: open polylines, all (u, v)
    metres; base(u, v) -> w is the element's own surface before any line (curl, crown); wrap(u, v, w) -> (x, y, z)
    places a relief point in the world. Returns (object, typed 3D lines {type: [[(x, y, z)]]})."""
    import bmesh
    sp = dict(DEFAULT_SPEC); sp.update(spec or {})
    lm = _line_mesh(outline, eyes, ridges, grooves, sp); height = _line_height(lm, base, sp)
    V, tris, edge_type, primary, idx = lm["V"], lm["tris"], lm["edge_type"], lm["primary"], lm["idx"]
    bm = bmesh.new()
    H = [height((v.x, v.y)) for v in V]
    bv = [bm.verts.new(wrap(v.x, v.y, h)) for v, h in zip(V, H)]
    uvw = {bv[i]: (V[i].x, V[i].y, H[i]) for i in range(len(V))}
    for f in tris:
        try: bm.faces.new([bv[i] for i in f])
        except ValueError: pass
    vid = {v: i for i, v in enumerate(bv)}
    typed = {e: edge_type.get(tuple(sorted((vid[e.verts[0]], vid[e.verts[1]]))), 5) for e in bm.edges}

    # walls: each boundary loop drops a thin edge, then its underside runs back under the material to the bell
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    nxt = {}
    for e in boundary:
        f = e.link_faces[0]
        for lp in f.loops:
            if lp.edge == e: nxt[lp.vert] = lp.link_loop_next.vert
    seen = set(); loops = []
    for v0 in list(nxt):
        if v0 in seen: continue
        loop = []; v = v0
        while v not in seen and v in nxt:
            seen.add(v); loop.append(v); v = nxt[v]
        if len(loop) > 2: loops.append(loop)
    wall_edges = []
    edge_lids = {lid for lid, (t, pts, closed) in enumerate(primary) if t in ("outline", "eye")}
    for loop in loops:
        P = [uvw[v][:2] for v in loop]; n = len(P)
        cx = sum(p[0] for p in P) / n; cy = sum(p[1] for p in P) / n
        rim, under = [], []
        for i, v in enumerate(loop):
            a, b = P[i - 1], P[(i + 1) % n]
            tx, ty = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, ty) or 1e-12
            mx, my = -ty / L, tx / L                                           # left of travel = into the faces
            u, vv, w = uvw[v]
            wr = max(w - sp["thickness"], -sp["sink"])
            uc = min(sp["undercut_max"], max(sp["undercut"], sp["undercut_k"] * w))
            uc = min(uc, 0.45 * idx.ray((u, vv), (mx, my), uc / 0.45, edge_lids))     # never past half the material's width
            rim.append(bm.verts.new(wrap(u + mx * 0.0006, vv + my * 0.0006, wr)))
            under.append(bm.verts.new(wrap(u + mx * uc, vv + my * uc, -sp["sink"])))
        for i in range(n):
            j = (i + 1) % n
            for quad in ((loop[i], rim[i], rim[j], loop[j]), (rim[i], under[i], under[j], rim[j])):
                try: bm.faces.new(quad)
                except ValueError: pass
            e = bm.edges.get((rim[i], rim[j]))
            if e: wall_edges.append(e)
    bm.normal_update()
    me = bpy_mesh_from(bm, name, typed, wall_edges)
    import bpy
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    if mat: me.materials.append(mat)

    # the drawn lines themselves in 3D (they run on mesh edges), for the proof renders
    lines3d = {}
    for t, pts, closed in primary:
        seq = pts + ([pts[0]] if closed else [])
        lines3d.setdefault(t, []).append([wrap(p[0], p[1], height(p)) for p in seq])
    return o, lines3d

def leaf_solid(name, outline, ridges, grooves, front, back, place, mat, coll, spec=None, lift=0.0, creases=()):
    """A standalone leaf (user 2026-09-29: an object of its own, not a relief on a surface): a closed solid whose front
    is front(u, v) with its ridge and groove lines' sections (a leaf's spines are carved into its volume, as grooves),
    whose back is back(u, v) (<= 0, behind the leaf's plane), joined round the outline by a thin rim (spec "rim").
    place(u, v, w) -> (x, y, z) puts it in the world. Returns (object, typed 3D lines {type: [[(x, y, z)]]}), the lines
    standing `lift` off the front (for proof tubes). `creases`: open polylines that are only fold lines -- a mesh edge
    marked sharp, no section, no support rows -- for a front whose own height function folds there."""
    import bmesh, bpy
    sp = dict(DEFAULT_SPEC); sp.update(spec or {})
    lm = _line_mesh(outline, [], ridges, grooves, sp, creases); hf = _line_height(lm, front, sp)
    V, tris, edge_type = lm["V"], lm["tris"], lm["edge_type"]
    half = sp.get("rim", 0.0016) / 2
    bm = bmesh.new()
    fv = [bm.verts.new(place(v.x, v.y, hf((v.x, v.y)) + half)) for v in V]
    bk = [bm.verts.new(place(v.x, v.y, back(v.x, v.y) - half)) for v in V]
    uses = {}
    for f in tris:
        bm.faces.new([fv[i] for i in f]); bm.faces.new([bk[i] for i in reversed(f)])
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])): uses[(min(a, b), max(a, b))] = uses.get((min(a, b), max(a, b)), 0) + 1
    rim = []
    for f in tris:                                                     # the rim: a strip under every open edge of the front
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            if uses[(min(a, b), max(a, b))] == 1:
                bm.faces.new((fv[a], bk[a], bk[b], fv[b])); rim += [(fv[a], fv[b]), (bk[a], bk[b])]
    vid = {v: i for i, v in enumerate(fv)}; bid = {v: i for i, v in enumerate(bk)}
    typed = {e: edge_type.get(tuple(sorted((vid[e.verts[0]], vid[e.verts[1]]))), 5) for e in bm.edges if e.verts[0] in vid and e.verts[1] in vid}
    typed.update({e: edge_type.get(tuple(sorted((bid[e.verts[0]], bid[e.verts[1]]))), 5) for e in bm.edges
                  if e.verts[0] in bid and e.verts[1] in bid})       # the back's too: a vein cut into it creases as the front's do
    bm.normal_update()
    sharp = {0, 1, 2, 3, 4, 7} if sp.get("sharp_supports") else {0, 1, 2, 3, 7}   # a flat-bottomed strip creases at its knots too; 7 = crease
    me = bpy_mesh_from(bm, name, typed, [e for e in (bm.edges.get(pair) for pair in rim) if e], sharp)
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    if mat: me.materials.append(mat)
    lines3d = {}
    for t, pts, closed in lm["primary"]:
        seq = pts + ([pts[0]] if closed else [])
        lines3d.setdefault(t, []).append([place(p[0], p[1], hf(p) + half + lift) for p in seq])
    return o, lines3d

def bpy_mesh_from(bm, name, typed, extra_sharp, sharp_types=(0, 1, 2, 3)):
    """bmesh -> mesh: smooth faces, the edges of the line types in sharp_types (by default the drawn lines: outline, eye,
    ridge, groove) and the wall rims marked sharp, and an int edge attribute `line_type` (index into outline, eye,
    ridge, groove, support, free) for inspection."""
    import bpy
    flags = {}
    for e, t in typed.items():
        if e.is_valid: flags[e] = t
    me = bpy.data.meshes.new(name)
    bm.verts.index_update(); bm.edges.index_update()
    key = {tuple(sorted((e.verts[0].index, e.verts[1].index))): t for e, t in flags.items()}
    extra = {tuple(sorted((e.verts[0].index, e.verts[1].index))) for e in extra_sharp if e.is_valid}
    bm.to_mesh(me); bm.free()
    attr = me.attributes.new("line_type", 'INT', 'EDGE')
    vals = [5] * len(me.edges); sharp = [False] * len(me.edges)
    for i, ed in enumerate(me.edges):
        k = tuple(sorted(ed.vertices))
        t = key.get(k, 5); vals[i] = t
        sharp[i] = t in sharp_types or k in extra
    attr.data.foreach_set("value", vals)
    for p in me.polygons: p.use_smooth = True
    for i, ed in enumerate(me.edges): ed.use_edge_sharp = sharp[i]
    me.update()
    return me
