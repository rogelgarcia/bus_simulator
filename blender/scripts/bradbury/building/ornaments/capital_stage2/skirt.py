"""Skirts: the walls of a cut-out card, built from the picture's own outline (outer boundary and holes, traced from
the mask and simplified) instead of the lattice's stair-stepped edge. Frame: card mm, y up, origin at the mask
bbox's bottom-left (the cards' frame)."""
import numpy as np
import trace


def hole_components(sub):
    """Background pixels of `sub` (bool, rows = y down) not connected to the border, as a list of bool masks."""
    H, W = sub.shape
    bg = ~sub
    reach = np.zeros_like(bg)
    stack = [(y, x) for x in range(W) for y in (0, H - 1) if bg[y, x]] + [(y, x) for y in range(H) for x in (0, W - 1) if bg[y, x]]
    for y, x in stack: reach[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < H and 0 <= nx < W and bg[ny, nx] and not reach[ny, nx]:
                reach[ny, nx] = True; stack.append((ny, nx))
    holes = bg & ~reach
    comps = []
    seen = np.zeros_like(holes)
    ys, xs = np.nonzero(holes)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]: continue
        comp = np.zeros_like(holes); stack = [(y0, x0)]; seen[y0, x0] = True; comp[y0, x0] = True
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < H and 0 <= nx < W and holes[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; comp[ny, nx] = True; stack.append((ny, nx))
        comps.append(comp)
    return comps


def outlines(sub, mm_per_px, eps_mm=2.5, min_hole_px=60):
    """Simplified closed outlines (list of (N, 2) arrays, card mm, y up) of the mask's outer boundary and its holes."""
    H, W = sub.shape
    out = []
    def to_mm(px):
        return np.column_stack([(px[:, 0] + 0.5) * mm_per_px, (H - px[:, 1] - 0.5) * mm_per_px])
    def tracemask(m):
        pad = np.zeros((m.shape[0] + 2, m.shape[1] + 2), bool); pad[1:-1, 1:-1] = m
        px = trace.trace_boundary(pad) - 1.0
        if len(px) < 4: return None
        poly = trace.simplify_closed(px, eps_mm / mm_per_px)
        return to_mm(poly) if len(poly) >= 3 else None
    # outer boundary of every blob (the mask may be more than one piece)
    seen = np.zeros_like(sub)
    ys, xs = np.nonzero(sub)
    order = np.lexsort((xs, ys))
    for k in order:
        y0, x0 = ys[k], xs[k]
        if seen[y0, x0]: continue
        comp = np.zeros_like(sub); stack = [(y0, x0)]; seen[y0, x0] = True; comp[y0, x0] = True
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1), (y + 1, x + 1), (y - 1, x - 1), (y + 1, x - 1), (y - 1, x + 1)):
                if 0 <= ny < H and 0 <= nx < W and sub[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; comp[ny, nx] = True; stack.append((ny, nx))
        if comp.sum() < min_hole_px: continue
        p = tracemask(comp)
        if p is not None: out.append(p)
    for hole in hole_components(sub):
        if hole.sum() < min_hole_px: continue
        p = tracemask(hole)
        if p is not None: out.append(p)
    return out
