# trace_sign.py -- AI 646: trace the kit's sign opacity masks into letter outlines (system Python, numpy + Pillow).
#
#   python -I trace_sign.py [--scale 0.5] [--tol 0.6]
#
# The user's Terra & Mar PBR kit draws each sign line as an alpha card (4096 x 512); its README asks for real letter
# geometry for close views, with the kit's maps sampled onto it. This traces each line's opacity at the kit's 0.5
# cutoff: marching squares with sub-pixel interpolation (saddles resolved by the cell centre), loops linked edge to
# edge, Douglas-Peucker simplification (tol in traced pixels), dust dropped, and holes nested into their glyphs.
# Reads only the installed catalog opacity map. Writes blender_inputs/terramar/sign/<line>.json:
# glyphs as {outer, holes} in card UV (0..1, v up), outer loops counter-clockwise.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
from common.material_catalog import material
BP.add_import_paths(__file__)
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

OUT = BP.inputs("terramar/sign")


def opacity_path(line):
    return material(line["installed"]).map("opacity")


SEGMENTS = {1: [("L", "B")], 2: [("B", "R")], 3: [("L", "R")], 4: [("T", "R")], 6: [("T", "B")], 7: [("L", "T")],
            8: [("L", "T")], 9: [("T", "B")], 11: [("T", "R")], 12: [("L", "R")], 13: [("B", "R")], 14: [("L", "B")]}


def trace(a, t=0.5):
    """Closed contour loops of the field a at level t (pixel coordinates x right, y down)."""
    a = np.pad(a, 1)
    h, w = a.shape
    inside = a >= t
    case = (inside[:-1, :-1] * 8 + inside[:-1, 1:] * 4 + inside[1:, 1:] * 2 + inside[1:, :-1] * 1).astype(np.int8)
    points = {}

    def point(key):
        if key not in points:
            kind, i, j = key
            if kind == "h":                       # edge between (i, j) and (i, j + 1)
                v0, v1 = a[i, j], a[i, j + 1]
                points[key] = (j + (t - v0) / (v1 - v0), i)
            else:                                 # edge between (i, j) and (i + 1, j)
                v0, v1 = a[i, j], a[i + 1, j]
                points[key] = (j, i + (t - v0) / (v1 - v0))
        return points[key]

    adj = {}
    segs = []
    ii, jj = np.nonzero((case > 0) & (case < 15))
    for i, j in zip(ii.tolist(), jj.tolist()):
        c = int(case[i, j])
        edge = {"T": ("h", i, j), "B": ("h", i + 1, j), "L": ("v", i, j), "R": ("v", i, j + 1)}
        if c in (5, 10):
            centre = (a[i, j] + a[i, j + 1] + a[i + 1, j + 1] + a[i + 1, j]) / 4 >= t
            if (c == 5) == centre:                # b, d joined (5) or a, c joined (10) through the centre
                pairs = [("L", "T"), ("B", "R")] if c == 5 else [("T", "R"), ("L", "B")]
            else:
                pairs = [("T", "R"), ("L", "B")] if c == 5 else [("L", "T"), ("B", "R")]
        else:
            pairs = SEGMENTS[c]
        for e0, e1 in pairs:
            k = len(segs)
            segs.append((edge[e0], edge[e1]))
            adj.setdefault(edge[e0], []).append(k)
            adj.setdefault(edge[e1], []).append(k)
    used = [False] * len(segs)
    loops = []
    for start in range(len(segs)):
        if used[start]:
            continue
        used[start] = True
        k0, k1 = segs[start]
        loop = [point(k0)]
        key = k1
        while key != k0:
            loop.append(point(key))
            nxt = [s for s in adj[key] if not used[s]]
            if not nxt:
                break
            used[nxt[0]] = True
            a0, a1 = segs[nxt[0]]
            key = a1 if a0 == key else a0
        loops.append([(x - 1.0, y - 1.0) for x, y in loop])      # undo the padding
    return loops


def area(loop):
    return 0.5 * sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(loop, loop[1:] + loop[:1]))


def simplify(loop, tol):
    """Douglas-Peucker on a closed loop, anchored at two far-apart points."""
    pts = np.asarray(loop)
    i0 = 0
    i1 = int(np.argmax(((pts - pts[0]) ** 2).sum(axis=1)))

    def dp(seq):
        keep = [True] + [False] * (len(seq) - 2) + [True]
        stack = [(0, len(seq) - 1)]
        while stack:
            s, e = stack.pop()
            if e - s < 2:
                continue
            a, b = seq[s], seq[e]
            ab = b - a
            ln = np.hypot(*ab)
            mid = seq[s + 1:e]
            rel = mid - a
            d = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / ln if ln > 1e-12 else np.hypot(rel[:, 0], rel[:, 1])
            k = int(np.argmax(d))
            if d[k] > tol:
                keep[s + 1 + k] = True
                stack += [(s, s + 1 + k), (s + 1 + k, e)]
        return [tuple(p) for p, kp in zip(seq, keep) if kp]
    first = dp(pts[i0:i1 + 1])
    second = dp(np.vstack([pts[i1:], pts[:1]]))
    return first[:-1] + second[:-1]


def contains(loop, p):
    x, y = p
    inside = False
    for (x0, y0), (x1, y1) in zip(loop, loop[1:] + loop[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


def glyphs(loops, min_area):
    loops = [lp for lp in loops if abs(area(lp)) >= min_area and len(lp) >= 3]
    depth = [sum(1 for j, other in enumerate(loops) if j != i and contains(other, lp[0])) for i, lp in enumerate(loops)]
    outers = [i for i, dpt in enumerate(depth) if dpt % 2 == 0]
    out = []
    for i in outers:
        outer = loops[i] if area(loops[i]) > 0 else list(reversed(loops[i]))
        holes = [j for j, dpt in enumerate(depth) if dpt == depth[i] + 1 and contains(loops[i], loops[j][0])]
        out.append({"outer": outer, "holes": [loops[j] if area(loops[j]) < 0 else list(reversed(loops[j])) for j in holes]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--tol", type=float, default=0.6)
    ap.add_argument("--output", default=OUT, help="Directory for the traced sign JSON files")
    args = ap.parse_args()
    plan = C.load_json(C.REBUILD_PLAN)
    os.makedirs(args.output, exist_ok=True)
    for line in plan["podium"]["sign"]["lines"]:
        src = opacity_path(line)
        im = Image.open(src).convert("L")
        W0, H0 = im.size
        w, h = int(W0 * args.scale), int(H0 * args.scale)
        a = np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float64) / 255.0
        loops = [simplify(lp, args.tol) for lp in trace(a)]
        # to card UV with v up (pixel centres: x + 0.5); flipping y reverses orientation, glyphs() normalises it
        uv = [[((x + 0.5) / w, 1.0 - (y + 0.5) / h) for x, y in lp] for lp in loops]
        g = glyphs(uv, min_area=(6.0 / (w * h)))
        data = {"line": line["name"], "source": os.path.relpath(src, C.ROOT).replace("\\", "/"), "traced_px": [w, h],
                "cutoff": 0.5, "tolerance_px": args.tol, "glyphs": [{"outer": [[round(u, 6), round(v, 6)] for u, v in gl["outer"]],
                "holes": [[[round(u, 6), round(v, 6)] for u, v in hl] for hl in gl["holes"]]} for gl in g]}
        path = os.path.join(args.output, f"{line['name']}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        print("SIGN", line["name"], "glyphs", len(g), "holes", sum(len(x["holes"]) for x in g),
              "points", sum(len(x["outer"]) + sum(len(hh) for hh in x["holes"]) for x in g), "->", path)


if __name__ == "__main__":
    main()
