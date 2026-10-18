"""The simplest card that covers a whole picture: a strip of columns between a lower and an upper polyline that bound
the silhouette from outside (user 2026-10-03: the leaf layouts were "too complex" and "cutting away leaves from the
image"). Columns sit where either polyline bends; rows are fractions of each column's height. All quads; the alpha
clip draws the fine silhouette (finger gaps, holes). Frame: card mm, y up, origin at the mask's bottom-left."""
import numpy as np
from layout import Card


def column_bounds(sub, mmpx):
    """Per pixel column: x centre, top (max y) and bottom (min y) of the opaque pixels, in mm. Empty columns dropped."""
    H, W = sub.shape
    xs, tops, bots = [], [], []
    for px in range(W):
        col = np.nonzero(sub[:, px])[0]
        if len(col) == 0: continue
        xs.append((px + 0.5) * mmpx); tops.append((H - col.min()) * mmpx); bots.append((H - col.max() - 1) * mmpx)
    return np.array(xs), np.array(tops), np.array(bots)


def _dp(xs, ys, tol):
    """Douglas-Peucker on a y(x) profile, splitting where it leaves the chord most in EITHER direction, so the polyline
    dips into the notches as well as reaching the tips (the walls then sit on the outline)."""
    keep = {0, len(xs) - 1}
    stack = [(0, len(xs) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1: continue
        t = (xs[i + 1:j] - xs[i]) / max(xs[j] - xs[i], 1e-12)
        line = ys[i] + t * (ys[j] - ys[i])
        ex = np.abs(ys[i + 1:j] - line)
        k = int(np.argmax(ex))
        if ex[k] > tol:
            m = i + 1 + k; keep.add(m); stack += [(i, m), (m, j)]
    return sorted(keep)


# ---------------------------------------------------------------- corners ON the outline (walls on the picture's edge)
def tight_polyline(xs, ys, tol, merge):
    """Vertices on the profile itself: two-sided DP, clusters closer than `merge` in x reduced to their highest
    vertex at its own x (still on the profile). Segments stay within `tol` of the profile, above or below."""
    idx = _dp(xs, ys, tol)
    keep = [idx[0]]
    for i in idx[1:]:
        if i == idx[-1]: keep.append(i); continue
        if xs[i] - xs[keep[-1]] < merge and keep[-1] != idx[0]:
            if ys[i] > ys[keep[-1]]: keep[-1] = i
        else: keep.append(i)
    # repair: wherever the merged polyline trims the profile by more than tol, put the worst sample back as a corner
    keep = sorted(set(keep))
    changed = True
    while changed:
        changed = False
        for a, b in zip(keep[:-1], keep[1:]):
            if b <= a + 1: continue
            t = (xs[a + 1:b] - xs[a]) / max(xs[b] - xs[a], 1e-12)
            ex = ys[a + 1:b] - (ys[a] + t * (ys[b] - ys[a]))         # profile above the line = trimmed
            k = int(np.argmax(ex))
            if ex[k] > tol:
                keep = sorted(set(keep + [a + 1 + k])); changed = True; break
    return xs[keep].astype(float), ys[keep].astype(float)


def _grid(cx, T, B, rows):
    card = Card()
    ids = [[card.v((x, b + (t - b) * k / rows)) for k in range(rows + 1)] for x, t, b in zip(cx, T, B)]
    for i in range(len(cx) - 1):
        for k in range(rows):
            card.q(ids[i][k], ids[i + 1][k], ids[i + 1][k + 1], ids[i][k + 1])
    card.finish()
    card.info = dict(columns=len(cx), rows=rows)
    card.top = np.column_stack([cx, T]); card.bottom = np.column_stack([cx, B])
    return card


def _columns(tx, bx, bxs_profile, merge, max_col):
    """Snap each bottom vertex to a top vertex within merge/2 (re-sampled on the bottom profile), union, split gaps."""
    xs_p, bots_p = bxs_profile
    bx = bx.copy()
    by_v = np.interp(bx, xs_p, bots_p)
    for i in range(1, len(bx) - 1):
        j = int(np.argmin(np.abs(tx - bx[i])))
        if abs(tx[j] - bx[i]) < 0.5 * merge and abs(np.interp(tx[j], xs_p, bots_p) - by_v[i]) < 1.0:
            bx[i] = tx[j]                                         # snapped only where the bottom does not change there
    cols = np.array(sorted(set(np.round(np.concatenate([tx, bx]), 4))))
    out = [cols[0]]
    for c in cols[1:]:
        gap = c - out[-1]; n = int(np.ceil(gap / max_col)); a = out[-1]
        for k in range(1, n): out.append(a + gap * k / n)
        out.append(c)
    return np.array(out), bx


def envelope_card_tight(sub, mmpx, tol=2.0, merge=6.0, max_col=40.0, rows=3):
    xs, tops, bots = column_bounds(sub, mmpx)
    Wm = sub.shape[1] * mmpx
    xs_e = np.concatenate([[0.0], xs, [Wm]]); tops_e = np.concatenate([[tops[0]], tops, [tops[-1]]]); bots_e = np.concatenate([[bots[0]], bots, [bots[-1]]])
    tx, ty = tight_polyline(xs_e, tops_e, tol, merge)
    bx, byn = tight_polyline(xs_e, -bots_e, tol, merge); by = -byn
    cx, bx2 = _columns(tx, bx, (xs_e, bots_e), merge, max_col)
    by2 = np.array([np.interp(x, xs_e, bots_e) if x not in bx else by[list(bx).index(x)] for x in bx2])
    T = np.interp(cx, tx, ty); B = np.interp(cx, bx2, by2)
    return _grid(cx, T, B, rows)


def envelope_card_sym_tight(sub, mmpx, tol=3.0, merge=8.0, max_col=40.0, rows=2):
    sub = sub | sub[:, ::-1]
    xs, tops, bots = column_bounds(sub, mmpx)
    Wm = sub.shape[1] * mmpx; xc = 0.5 * Wm
    m = xs >= xc
    xr = np.concatenate([[xc], xs[m], [Wm]])
    tr_ = np.concatenate([[np.interp(xc, xs, tops)], tops[m], [tops[m][-1]]])
    br_ = np.concatenate([[np.interp(xc, xs, bots)], bots[m], [bots[m][-1]]])
    tx, ty = tight_polyline(xr, tr_, tol, merge)
    bx, byn = tight_polyline(xr, -br_, tol, merge); by = -byn
    half, bx2 = _columns(tx, bx, (xr, br_), merge, max_col)
    by2 = np.array([np.interp(x, xr, br_) if x not in bx else by[list(bx).index(x)] for x in bx2])
    cx = np.concatenate([Wm - half[::-1][:-1], half])
    T = np.interp(np.abs(cx - xc) + xc, tx, ty); B = np.interp(np.abs(cx - xc) + xc, bx2, by2)
    return _grid(cx, T, B, rows)
