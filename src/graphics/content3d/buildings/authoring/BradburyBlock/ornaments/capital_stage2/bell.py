"""The capital blank (neck, bell, abacus) as plain geometry, and the wrap that lays a flat card onto the bell.
Ported from the carving trials' editing copy (capital_edit.py, in git history at e8fafbf7): the photo-proportioned
blank, VSCALE 0.898, 0.463 m tall, in the same frame as stage 1: x across the face, y depth (the street at -y), z up
from the neck bottom, metres. Pieces are described in mm; wrap() converts."""
import math
import numpy as np

W, D = 0.725, 0.85
CAPITAL_DEPTH = 0.85 / 0.725
AXIS_PX, BASE_PX, M_PER_PX = 767.0, 850.0, 0.725 / 1038.0
H_PHOTO, H_PROD = (BASE_PX - 112.0) * M_PER_PX, 0.41
VSCALE = (H_PHOTO + H_PROD) / 2 / H_PHOTO
def px(x, y): return ((x - AXIS_PX) * M_PER_PX, (BASE_PX - y) * M_PER_PX * VSCALE)
def zpx(y): return px(0, y)[1]
Z_COVE, Z_FILLET, Z_BELL, Z_ABACUS, Z_TOP = zpx(800), zpx(785), zpx(730), zpx(163), zpx(150)
H = zpx(112)
BELL_TOP_HALF = 0.455
ABACUS_HALF = px(1516, 0)[0]
YF = -D / 2; YB = YF + CAPITAL_DEPTH * W                   # front face at the neck; the straight back plane


def bell_outline(t, m_side=10, m_front=10, m_cut=4):
    """Plan outline of the bell at height fraction t (0 at its foot, 1 under the abacus), from the back of the right
    side round the front to the back of the left side. Returns the points and the index of the right cut's start."""
    f, s_max, c_max = BELL_TOP_HALF - W / 2, 0.05 * W, 0.09 * W
    fk = f * t ** 0.8; sk = s_max * t * t; c = max(c_max * t * t, 0.002); xr = W / 2 + fk; yk = YF - fk; r2 = math.sqrt(2)
    ys = yk + c
    right = []
    for i in range(m_side):
        v = i / m_side; right.append((xr - sk * math.sin(math.pi * v), YB + (ys - YB) * v))
    cut0 = len(right)
    for i in range(m_cut):
        u = i / (m_cut - 1); bul = 0.10 * c * math.sin(math.pi * u)
        right.append((xr - c * u + bul / r2, ys - c * u - bul / r2))
    xe = xr - c
    for i in range(1, m_front + 1):
        u = 0.5 * i / m_front; right.append((xe - 2 * xe * u, yk + sk * math.sin(math.pi * u)))
    left = [(-x, y) for (x, y) in reversed(right[:-1])]
    return np.array(right + left), cut0


class Frame:
    """The bell's plan outline at one height, parametrised by arc length s: s = 0 at the front's middle, positive
    toward the right (round the right corner and back along the right side)."""
    def __init__(self, t, fine=40):
        pts, cut0 = bell_outline(t, m_side=fine, m_front=fine, m_cut=8)
        # the outline runs right-back -> front -> left-back; reverse so s grows to the right
        P = pts[::-1]                                               # left-back ... front centre ... right-back
        self.P = P
        d = np.hypot(*np.diff(P, axis=0).T)
        s = np.concatenate([[0.0], np.cumsum(d)])
        ic = len(P) // 2                                            # the front's middle (shared centre point)
        self.s = s - s[ic]
        self.s_back = self.s[-1]
        n = len(pts)
        # the right cut: outline indices cut0 .. cut0 + 7 in the original order -> reversed indices
        j0 = n - 1 - (cut0 + 7); j1 = n - 1 - cut0
        self.s_cut_start = self.s[j0]                               # where the front ends and the right cut begins
        self.s_cut_end = self.s[j1]                                 # where the cut ends and the right side begins
        self.s_corner = 0.5 * (self.s_cut_start + self.s_cut_end)
        self.s_side_centre = 0.5 * (self.s_cut_end + self.s_back)
        self.t = t
    def point(self, s):
        """Point and outward unit normal (horizontal) at arc length s; beyond the ends the outline continues straight."""
        S, P = self.s, self.P
        if s <= S[0]: i = 0
        elif s >= S[-1]: i = len(S) - 2
        else: i = int(np.searchsorted(S, s) - 1)
        i = max(0, min(i, len(S) - 2))
        a, b = P[i], P[i + 1]; L = S[i + 1] - S[i]
        u = (s - S[i]) / L if L > 1e-12 else 0.0
        q = a + u * (b - a)
        d = (b - a) / max(L, 1e-12)
        nrm = np.array([d[1], -d[0]])                               # right of travel = outward (travel runs ccw seen from above? check: front runs left->right, outward is -y: d=(1,0) -> (0,-1)) ok
        return q, nrm
    def flat_point(self, s, s_lo, s_hi):
        """Like point(), but outside [s_lo, s_hi] (one face of the bell) the outline is replaced by the face's tangent
        at that end: a volute standing proud of the corner keeps facing its own face."""
        if s_lo <= s <= s_hi: return self.point(s)
        s_end = s_lo if s < s_lo else s_hi
        q0, n0 = self.point(s_end)
        # the face's own direction: the front runs along x, the right side along y (toward the back)
        front = (s_lo < 0)                                           # the front face's range is symmetric about 0
        d = np.array([1.0, 0.0]) if front else np.array([0.0, 1.0])
        n0 = np.array([0.0, -1.0]) if front else np.array([1.0, 0.0])  # the face's own normal, not the cut's 45-degree one at its end
        return q0 + d * (s - s_end), n0


_frames = {}
def frame_at(z):
    """Frame for height z (metres); clamped to the bell's range (the abacus region reuses the bell's top outline,
    the torus the bell's foot)."""
    t = (z - Z_BELL) / (Z_ABACUS - Z_BELL)
    t = min(max(t, 0.0), 1.0)
    key = round(t, 4)
    if key not in _frames: _frames[key] = Frame(key)
    return _frames[key]


def wrap(s_mm, z_mm, w_mm, anchor="centre", sign=1.0, flat="none", uflip=False):
    """A point given in bell-surface coordinates -> 3D (metres). s_mm: arc length along the outline from the anchor
    (centre of the front face, 'corner' = middle of the right corner cut, 'side' = middle of the right side face);
    sign -1 mirrors to the left half. z_mm: height; w_mm: proud of the bell face along its outward normal.
    flat: 'cut' keeps the front plane beyond the right cut's start (volutes)."""
    z = z_mm / 1000.0
    F = frame_at(z)
    base = {"centre": 0.0, "corner": F.s_corner, "side": F.s_side_centre}[anchor]
    s = base + (-s_mm if uflip else s_mm) / 1000.0                  # uflip: mirrored about the anchor along the face
    if flat in ("cut", "face"):
        lo, hi = (-F.s_cut_start, F.s_cut_start) if anchor == "centre" else (F.s_cut_end, F.s_back)
        q, n = F.flat_point(s, lo, hi)
    else: q, n = F.point(s)
    p = q + n * (w_mm / 1000.0)
    x, y = p
    if sign < 0: x = -x
    return (float(x), float(y), float(z))


# ---------------------------------------------------------------- the blank as geometry (verts, quads, uvs, material slot)
def blank_mesh(lod=1):
    """Neck (cove, fillet, torus) swept round the front and sides, bell lofted between outlines, abacus (soffit,
    cove, band, rounded top) swept along the top outline. lod 1: coarse. Returns dict(verts, faces, uvs, mats) with
    mats per face: 0 neck, 1 bell, 2 abacus."""
    verts, faces, uvs, mats = [], [], [], []
    def V(p): verts.append(tuple(float(c) for c in p)); return len(verts) - 1
    def Q(a, b, c, d, uv, m): faces.append((a, b, c, d)); uvs.append(uv); mats.append(m)
    def sweep(path, prof, mat, closed_caps=False):
        """prof: list of (o, z) outward offset / height; path: polyline (x, y) in plan, mitred corners. UV u = path
        arc length, v = profile arc length, both in metres."""
        n = len(path); normals = []
        for i in range(n - 1):
            d = np.array(path[i + 1]) - np.array(path[i]); d = d / np.hypot(*d); normals.append(np.array([-d[1], d[0]]))
        rings = []; su = [0.0]
        for i in range(1, n): su.append(su[-1] + float(np.hypot(*(np.array(path[i]) - np.array(path[i - 1])))))
        for i in range(n):
            if i == 0: m = normals[0]
            elif i == n - 1: m = normals[-1]
            else:
                a, b = normals[i - 1], normals[i]; m = a + b; m = m / max(np.hypot(*m), 1e-9); m = m / max(0.2, float(m @ a))
            P = np.array(path[i]); rings.append([V((P[0] + m[0] * o, P[1] + m[1] * o, z)) for (o, z) in prof])
        sv = [0.0]
        for j in range(1, len(prof)): sv.append(sv[-1] + math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]))
        k = len(prof)
        for i in range(n - 1):
            for j in range(k - 1):
                Q(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j],
                  ((su[i], sv[j]), (su[i], sv[j + 1]), (su[i + 1], sv[j + 1]), (su[i + 1], sv[j])), mat)
        return rings
    # ---- neck
    cove_o = abs(px(227, 0)[0] - px(248, 0)[0]); fil_o = 0.019; tor_o = abs(px(248, 0)[0] - px(208, 0)[0])
    nc, nt = (3, 5) if lod else (8, 11)
    prof = [(0.0, 0.0)]
    for k in range(1, nc + 1):
        t = math.pi / 2 * k / nc; prof.append((cove_o * (1 - math.cos(t)), Z_COVE * math.sin(t)))
    prof += [(fil_o, Z_COVE), (fil_o, Z_FILLET)]
    zc, rz, ro = (Z_FILLET + Z_BELL) / 2, (Z_BELL - Z_FILLET) / 2, tor_o - fil_o
    for k in range(1, nt):
        t = math.pi * k / nt; prof.append((fil_o + ro * math.sin(t), zc - rz * math.cos(t)))
    prof += [(fil_o, Z_BELL), (0.0, Z_BELL)]
    path = [(W / 2, YB), (W / 2, YF), (-W / 2, YF), (-W / 2, YB)]
    sweep(path, prof, 0)
    # neck core (back face, bottom, top)
    v0 = [V((x, y, 0.0)) for x, y in path]; v1 = [V((x, y, Z_BELL)) for x, y in path]
    Q(v0[3], v0[2], v0[1], v0[0], ((0, 0),) * 4, 0); Q(v1[0], v1[1], v1[2], v1[3], ((0, 0),) * 4, 0)
    Q(v0[3], v0[0], v1[0], v1[3], ((0, 0),) * 4, 0)       # back plane
    # ---- bell loft
    K = 6 if lod else 14
    ms, mf = (5, 6) if lod else (10, 10)
    levels = []; cut0 = None
    for k in range(K + 1):
        t = k / K; z = Z_BELL + (Z_ABACUS - Z_BELL) * t
        pts, cut0 = bell_outline(t, m_side=ms, m_front=mf, m_cut=4)
        levels.append(([V((x, y, z)) for x, y in pts], pts, z))
    n = len(levels[0][0])
    for k in range(K):
        A, PA, zA = levels[k]; B, PB, zB = levels[k + 1]
        sA = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(PA, axis=0).T))]); sB = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(PB, axis=0).T))])
        sA = sA - sA[len(sA) // 2]; sB = sB - sB[len(sB) // 2]                     # u = 0 at the front's middle: no shear between rings
        for i in range(n - 1):
            cx = (PA[i][0] + PA[i + 1][0]) / 2
            if abs(cx) > W / 2 + 0.02: uvq = ((PA[i][1], zA), (PA[i + 1][1], zA), (PB[i + 1][1], zB), (PB[i][1], zB))       # side faces: u along y
            else: uvq = ((PA[i][0], zA), (PA[i + 1][0], zA), (PB[i + 1][0], zB), (PB[i][0], zB))                            # front: u along x
            Q(A[i], A[i + 1], B[i + 1], B[i], uvq, 1)
    # bell back plane and bottom/top are hidden; close the back with one quad strip per level pair
    for k in range(K):
        A = levels[k][0]; B = levels[k + 1][0]
        Q(A[0], B[0], B[-1], A[-1], ((0, 0),) * 4, 1)
    # ---- abacus
    top, _ = bell_outline(1.0, m_side=ms, m_front=mf, m_cut=4)
    proj = ABACUS_HALF - BELL_TOP_HALF
    cove, r_top = 0.012, 0.004
    na, nr = (3, 3) if lod else (6, 6)
    aprof = [(0.0, Z_ABACUS), (proj - cove, Z_ABACUS)]
    for k in range(1, na + 1):
        t = math.pi / 2 * k / na
        aprof.append((proj - cove + cove * math.sin(t), Z_ABACUS + (Z_TOP - Z_ABACUS) * (1 - math.cos(t))))
    aprof.append((proj, H - r_top))
    for k in range(1, nr + 1):
        t = math.pi / 2 * k / nr
        aprof.append((proj - r_top + r_top * math.cos(t), H - r_top + r_top * math.sin(t)))
    aprof.append((0.0, H))
    rings = sweep([tuple(p) for p in top], aprof, 2)
    # abacus top slab: close with a fan-free strip: the top ring's last profile vertex per path point + centre line
    topv = [r[-1] for r in rings]
    # a simple cap: triangulate as quads by pairing symmetric points (the outline is symmetric: i <-> n-1-i)
    m = len(topv)                                              # odd: the front's middle is one point
    for i in range((m - 3) // 2):
        Q(topv[i], topv[i + 1], topv[m - 2 - i], topv[m - 1 - i], ((0, 0),) * 4, 2)
    faces.append((topv[(m - 3) // 2], topv[(m - 1) // 2], topv[(m + 1) // 2])); uvs.append(((0, 0),) * 3); mats.append(2)   # the one triangle, on the hidden top
    Q(rings[0][-1], rings[0][0], rings[-1][0], rings[-1][-1], ((0, 0),) * 4, 2)   # back plane of the abacus
    return dict(verts=verts, faces=faces, uvs=uvs, mats=mats, abacus_profile_len=sum(math.hypot(aprof[j][0] - aprof[j - 1][0], aprof[j][1] - aprof[j - 1][1]) for j in range(1, len(aprof))),
                neck_profile_len=sum(math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]) for j in range(1, len(prof))))
