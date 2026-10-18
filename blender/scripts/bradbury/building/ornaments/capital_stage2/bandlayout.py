"""The volute's roll as an all-quad disc patch (disc_patch: a Coons lattice of quads inside the outline's arc round
the roll, or inside a given circle), and catmull_rom, the smooth polyline the arm's spine uses. Companion of
layout.py (same Card type)."""
import math
import numpy as np
from layout import arc, resample


def catmull_rom(P, samples_per_seg=12):
    """Smooth polyline through the control points P (Catmull-Rom, clamped ends)."""
    P = np.asarray(P, float)
    if len(P) < 3: return P
    Q = np.vstack([P[0], P, P[-1]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for k in range(samples_per_seg):
            t = k / samples_per_seg
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return np.array(out)


def disc_patch(card, poly, attach, tail_point, k=4, circle=None):
    """Add an all-quad roll (volute disc) to `card`, bounded by the outline's arc round the roll and closed across the
    band's open end row `attach` = (left, mid, right vertex ids). The roll's boundary arc runs from the right vertex
    round to the left one, the long way away from `tail_point` (any point of the band). Interior: a (k+1)x(k+1)
    lattice as a Coons patch of its four boundary sides (4k boundary points in all)."""
    poly = np.asarray(poly, float); n = len(poly)
    V = lambda i: np.array(card.verts[i])
    m = 4 * k
    if attach is None:                                          # a free disc on the given circle
        c, r = circle
        ids = [card.v(c + r * np.array([math.cos(a), math.sin(a)])) for a in np.linspace(0, 2 * math.pi, m, endpoint=False)]
        return _disc_fill(card, ids, k)
    Lv, Mv, Rv = attach
    iL = int(np.argmin(np.hypot(*(poly - V(Lv)).T))); iR = int(np.argmin(np.hypot(*(poly - V(Rv)).T)))
    iT = int(np.argmin(np.hypot(*(poly - np.asarray(tail_point)).T)))
    A1 = arc(poly, iR, iL); A2 = arc(poly, iL, iR)
    idx1 = set(range(iR, iL + 1)) if iL >= iR else set(list(range(iR, n)) + list(range(0, iL + 1)))
    A = A2 if iT in idx1 else A1                                 # the arc that does not contain the tail
    reverse = A is A2                                           # A2 runs L -> R; we want R -> L
    if reverse: A = A[::-1]
    A = A.copy(); A[0] = V(Rv); A[-1] = V(Lv)                    # snap the arc's ends to the band's end vertices
    m = 4 * k
    B = resample(A, m - 1)                                      # R ... L: m-1 points; plus M closes the loop (m points)
    ids = [Rv] + [card.v(p) for p in B[1:-1]] + [Lv, Mv]
    return _disc_fill(card, ids, k)


def _disc_fill(card, ids, k):
    """Fill the loop `ids` (4k boundary vertices, in order) with a (k+1)x(k+1) Coons lattice of quads."""
    # the lattice perimeter (ccw from corner (0,0)); the disc boundary runs R -> ... -> L -> M which is ccw if the
    # outline is ccw and the band leaves the roll to the right of travel... orientation is fixed by Card.finish anyway
    per = [(i, 0) for i in range(k)] + [(k, j) for j in range(k)] + [(k - i, k) for i in range(k)] + [(0, k - j) for j in range(k)]
    grid = {}
    for (i, j), vid in zip(per, ids): grid[(i, j)] = vid
    P = lambda i, j: np.array(card.verts[grid[(i, j)]])
    for i in range(1, k):
        for j in range(1, k):
            u, v = i / k, j / k
            # Coons: sides bottom (j=0), top (j=k), left (i=0), right (i=k)
            p = ((1 - v) * P(i, 0) + v * P(i, k) + (1 - u) * P(0, j) + u * P(k, j)
                 - ((1 - u) * (1 - v) * P(0, 0) + u * (1 - v) * P(k, 0) + (1 - u) * v * P(0, k) + u * v * P(k, k)))
            grid[(i, j)] = card.v(p)
    for i in range(k):
        for j in range(k):
            card.q(grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)])
    card.finish()
    return card
