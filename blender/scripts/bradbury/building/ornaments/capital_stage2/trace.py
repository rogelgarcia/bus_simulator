"""Alpha cut-out -> simplified outline polygon (numpy only).
Pixel frame: x right, y DOWN (image rows). The callers flip to y-up when they convert to mm."""
import numpy as np


def trace_boundary(mask):
    """Moore neighbour tracing of the outer boundary of the (padded) mask. Returns an (N, 2) array of pixel
    (x, y) centres, in image order (clockwise on screen, y down)."""
    H, W = mask.shape
    dirs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]   # (dy, dx): E, SE, S, SW, W, NW, N, NE
    ys, xs = np.nonzero(mask)
    i0 = np.lexsort((xs, ys))[0]
    p0 = (int(ys[i0]), int(xs[i0]))
    c = p0
    db = 4                                                     # the backtrack is west of the start (background: raster-first pixel)
    pts = [p0]
    first_step = None
    for _ in range(H * W * 4):
        found = False
        for k in range(8):
            d = (db + k) % 8
            ny, nx = c[0] + dirs[d][0], c[1] + dirs[d][1]
            if mask[ny, nx]:
                prev = (db + k - 1) % 8                        # the background neighbour examined just before
                nxt = (ny, nx)
                # the new backtrack is the pixel at `prev` from c; as a direction from nxt:
                by, bx = c[0] + dirs[prev][0], c[1] + dirs[prev][1]
                dy, dx = by - ny, bx - nx
                db = dirs.index((dy, dx)) if (dy, dx) in dirs else (d + 4) % 8
                found = True
                break
        if not found:
            break                                               # isolated pixel
        if first_step is None:
            first_step = nxt
        elif c == p0 and nxt == first_step:
            break
        pts.append(nxt)
        c = nxt
    arr = np.array([(x, y) for (y, x) in pts], float)
    return arr


def douglas_peucker(pts, eps):
    """Ramer-Douglas-Peucker on an open polyline (N, 2)."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = np.hypot(*ab)
    if L < 1e-9:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > eps:
        left = douglas_peucker(pts[:i + 1], eps)
        right = douglas_peucker(pts[i:], eps)
        return np.vstack([left[:-1], right])
    return np.vstack([a, b])


def simplify_closed(pts, eps):
    """DP on a closed contour: split at the two points farthest apart, simplify both halves."""
    n = len(pts)
    i = 0
    j = int(np.argmax(np.hypot(*(pts - pts[0]).T)))
    i = int(np.argmax(np.hypot(*(pts - pts[j]).T)))
    if i > j: i, j = j, i
    h1 = douglas_peucker(pts[i:j + 1], eps)
    h2 = douglas_peucker(np.vstack([pts[j:], pts[:i + 1]]), eps)
    out = np.vstack([h1[:-1], h2[:-1]])
    return out


def signed_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))
