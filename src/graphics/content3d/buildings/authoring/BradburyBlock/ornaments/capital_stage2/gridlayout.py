"""The silhouette's boundary pixels (outline_points), from which build.py fits the horn's roll circle.
Frame: pixels, x right, y down (image rows)."""
import numpy as np


def outline_points(mask):
    """Pixel centres of the mask's boundary pixels (inside pixels with an outside 4-neighbour), as (x, y_down)."""
    m = mask
    pad = np.zeros((m.shape[0] + 2, m.shape[1] + 2), bool); pad[1:-1, 1:-1] = m
    inner = pad[1:-1, 1:-1]
    nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    edge = inner & ~nb
    ys, xs = np.nonzero(edge)
    return np.column_stack([xs + 0.5, ys + 0.5]).astype(float)
