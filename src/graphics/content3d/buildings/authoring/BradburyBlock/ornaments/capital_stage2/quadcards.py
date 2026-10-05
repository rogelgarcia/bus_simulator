"""Geometry helpers for the quad cards: segment and ray crossings (seg_array, ray_params), the nearest point of a
polyline (project_on), a card mirrored and welded about a vertical axis (mirror_merge), and a card's boundary edges
(boundary_edges), from which the walls are built."""
import math
import numpy as np
from layout import Card
from trace import signed_area


def ccw(p):
    p = np.asarray(p, float)
    return p if signed_area(p) > 0 else p[::-1].copy()


def seg_array(polys=(), segments=()):
    out = []
    for P in polys:
        P = np.asarray(P, float); out.append(np.stack([P, np.roll(P, -1, axis=0)], axis=1))
    for a, b in segments:
        out.append(np.array([[a, b]], float))
    return np.concatenate(out, axis=0) if out else np.zeros((0, 2, 2))


def ray_params(p, d, S):
    """Sorted parameters t of the crossings of the line p + t d with the segments S (N, 2, 2)."""
    a = S[:, 0]; e = S[:, 1] - S[:, 0]
    den = d[0] * e[:, 1] - d[1] * e[:, 0]
    ok = np.abs(den) > 1e-12
    den_s = np.where(ok, den, 1.0)
    w = a - p
    t = (w[:, 0] * e[:, 1] - w[:, 1] * e[:, 0]) / den_s
    u = (w[:, 0] * d[1] - w[:, 1] * d[0]) / den_s
    m = ok & (u >= -1e-9) & (u <= 1 + 1e-9)
    return np.sort(t[m])


# ---------------------------------------------------------------- polylines and cards
def project_on(M, sM, p):
    """Arc-length parameter, signed side (+1 left of travel) and distance of the point of polyline M nearest to p."""
    a = M[:-1]; b = M[1:]; ab = b - a; L2 = np.einsum("ij,ij->i", ab, ab)
    t = np.clip(np.einsum("ij,ij->i", p - a, ab) / np.maximum(L2, 1e-12), 0, 1)
    q = a + ab * t[:, None]; d = np.hypot(*(p - q).T)
    k = int(np.argmin(d))
    side = float(np.sign(ab[k][0] * (p[1] - a[k][1]) - ab[k][1] * (p[0] - a[k][0])))
    return sM[k] + t[k] * math.sqrt(L2[k]), side, float(d[k])


def mirror_merge(card, x0):
    out = Card()
    V = np.array(card.verts)
    ids = [out.v(p) for p in V]
    mids = [out.v((2 * x0 - p[0], p[1])) for p in V]
    for f in card.quads:
        out.q(*[ids[i] for i in f])
        out.q(*[mids[i] for i in reversed(f)])
    out.finish()
    return out


def boundary_edges(quads):
    cnt = {}
    for f in quads:
        for i in range(len(f)):
            e = (f[i], f[(i + 1) % len(f)]); cnt[e] = cnt.get(e, 0) + 1
    return [(a, b) for (a, b) in cnt if (b, a) not in cnt]
