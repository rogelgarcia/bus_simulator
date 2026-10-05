"""The quad card type, Card: verts (N, 2) mm, quads [(a, b, c, d)] and the boundary loop (vertex indices, ccw);
and the polyline helpers the layouts share: arc lengths, even resampling, arcs of a closed outline.
Frame: mm, x right, y up."""
import numpy as np


class Card:
    def __init__(self):
        self.verts = []; self.quads = []; self.key = {}
    def v(self, p, tag=None):
        """Vertex at p (mm), merged with an existing one within 0.05 mm."""
        k = (round(float(p[0]) * 20) / 20, round(float(p[1]) * 20) / 20)
        if k in self.key: return self.key[k]
        self.key[k] = len(self.verts); self.verts.append((float(p[0]), float(p[1])))
        return self.key[k]
    def q(self, a, b, c, d):
        if len({a, b, c, d}) < 4: return
        self.quads.append((a, b, c, d))
    def finish(self):
        """Orient every quad counter-clockwise, drop degenerate ones, find the boundary loop."""
        V = np.array(self.verts)
        out = []
        for (a, b, c, d) in self.quads:
            P = V[[a, b, c, d]]
            area = 0.5 * np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1])
            if abs(area) < 1e-6: continue
            out.append((a, b, c, d) if area > 0 else (a, d, c, b))
        self.quads = out
        self.boundary = boundary_loop(self.quads)
        return self


def boundary_loop(quads):
    """The outer loop of a quad patch as an ordered vertex list (edges used by one face only)."""
    cnt = {}
    for f in quads:
        for i in range(4):
            e = (f[i], f[(i + 1) % 4]); cnt[e] = cnt.get(e, 0) + 1
    nxt = {}
    for (a, b), n in cnt.items():
        if (b, a) not in cnt: nxt[a] = b
    if not nxt: return []
    start = next(iter(nxt)); loop = [start]; cur = nxt[start]
    while cur != start and len(loop) <= len(nxt):
        loop.append(cur); cur = nxt.get(cur)
        if cur is None: break
    return loop


# ---------------------------------------------------------------- polyline helpers
def arc_len(P):
    d = np.hypot(*(np.diff(P, axis=0)).T)
    return np.concatenate([[0.0], np.cumsum(d)])

def resample(P, n):
    """n points evenly spaced by arc length along polyline P (n >= 2), keeping both ends."""
    P = np.asarray(P, float)
    if len(P) == 1: return np.repeat(P, n, axis=0)
    s = arc_len(P); L = s[-1]
    if L < 1e-9: return np.repeat(P[:1], n, axis=0)
    t = np.linspace(0, L, n)
    return np.column_stack([np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])])

def arc(poly, i, j):
    """The closed outline's points from index i to j inclusive, going forward (ccw)."""
    n = len(poly)
    if j >= i: return poly[i:j + 1]
    return np.vstack([poly[i:], poly[:j + 1]])
