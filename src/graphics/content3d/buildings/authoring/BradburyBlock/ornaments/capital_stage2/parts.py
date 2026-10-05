"""Cut the PBR atlas into per-part alpha PNGs (the silhouettes), the two leaf banks separately, and write parts.json
with each part's crop offset in the atlas, so a card's local pixel maps back to atlas UVs (build.py)."""
import os, json
import numpy as np
from PIL import Image


def cut(atlas_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ids = np.array(Image.open(os.path.join(atlas_dir, "part_ids.png")))
    op = np.array(Image.open(os.path.join(atlas_dir, "opacity.png")))
    base = np.array(Image.open(os.path.join(atlas_dir, "basecolor_rgba.png")).convert("RGBA"))
    A = ids.shape[0]
    parts = {}

    def one(name, mask, pad=6):
        ys, xs = np.nonzero(mask)
        x0, x1, y0, y1 = max(0, xs.min() - pad), min(A, xs.max() + 1 + pad), max(0, ys.min() - pad), min(A, ys.max() + 1 + pad)
        a = np.where(mask, op, 0).astype(np.uint8)[y0:y1, x0:x1]
        rgb = base[y0:y1, x0:x1, :3]
        Image.fromarray(np.dstack([rgb, a]), "RGBA").save(os.path.join(out_dir, name + ".png"))
        parts[name] = dict(crop=[int(x0), int(y0), int(x1), int(y1)], px=int(mask.sum()))
        print("%-8s crop x %4d..%4d y %4d..%4d  (%d x %d)" % (name, x0, x1, y0, y1, x1 - x0, y1 - y0))

    m1 = ids == 1                                                         # the two leaf banks share id 1: split at the gap
    col = m1.sum(axis=0); xs = np.nonzero(col)[0]
    gap = [(xs[i], xs[i + 1]) for i in range(len(xs) - 1) if xs[i + 1] - xs[i] > 5][0]
    mid = (gap[0] + gap[1]) // 2
    left = m1.copy(); left[:, mid:] = False
    right = m1.copy(); right[:, :mid] = False
    one("bank_L", left); one("bank_R", right)
    one("horn", ids == 2); one("heart", ids == 3); one("pendant", ids == 4); one("crown", ids == 5)
    json.dump(dict(atlas=A, parts=parts), open(os.path.join(out_dir, "parts.json"), "w"), indent=1)
    return parts
