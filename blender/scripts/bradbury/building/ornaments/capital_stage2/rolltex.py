"""The volute's own texture set: the horn's roll cropped from the atlas maps around its fitted circle, every pixel
the picture leaves transparent (where the circle runs past the drawn roll) filled from the opaque ones, so the drum
can use an unclipped material and show no holes. Writes roll_<map>.png into `out_dir` and returns the crop box."""
import os
import numpy as np
from PIL import Image

MAPS = {"basecolor": "basecolor_rgba.png", "normal": "normal_opengl.png", "roughness": "roughness.png", "ao": "ambient_occlusion.png"}


def _spread(arr, filled, iters):
    for _ in range(iters):
        if filled.all(): break
        acc = np.zeros_like(arr); cnt = np.zeros(filled.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sh = np.roll(np.roll(arr, dy, 0), dx, 1); fm = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += sh * fm[:, :, None]; cnt += fm
        new = (~filled) & (cnt > 0)
        arr[new] = acc[new] / cnt[new][:, None]
        filled = filled | new
    return arr, filled


def fill(arr, opaque, coarse=8):
    """Fill the non-opaque pixels of `arr` (H, W, C float) from the opaque ones: a fine spread, then a coarse one."""
    arr = arr.copy()
    arr, f2 = _spread(arr, opaque.copy(), 24)
    if not f2.all():
        H, W, C = arr.shape; c = coarse
        Hc, Wc = (H + c - 1) // c, (W + c - 1) // c
        pad = np.zeros((Hc * c, Wc * c, C), np.float32); pad[:H, :W] = arr * opaque[:, :, None]
        pm = np.zeros((Hc * c, Wc * c), np.float32); pm[:H, :W] = opaque
        sm = pad.reshape(Hc, c, Wc, c, C).sum(axis=(1, 3)); cm = pm.reshape(Hc, c, Wc, c).sum(axis=(1, 3))
        fc = cm > 0
        rc = np.zeros((Hc, Wc, C), np.float32); rc[fc] = sm[fc] / cm[fc][:, None]
        rc, _ = _spread(rc, fc, 10000)
        up = np.repeat(np.repeat(rc, c, axis=0), c, axis=1)[:H, :W]
        arr[~f2] = up[~f2]
    return arr


def build(atlas_dir, centre_px, r_px, out_dir, margin=10):
    cx, cy = centre_px
    x0, y0 = int(cx - r_px - margin), int(cy - r_px - margin)
    x1, y1 = int(cx + r_px + margin) + 1, int(cy + r_px + margin) + 1
    base = np.array(Image.open(os.path.join(atlas_dir, MAPS["basecolor"])).convert("RGBA"))
    A = base.shape[0]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(A, x1), min(A, y1)
    opaque = base[y0:y1, x0:x1, 3] >= 128
    os.makedirs(out_dir, exist_ok=True)
    for key, fname in MAPS.items():
        im = Image.open(os.path.join(atlas_dir, fname))
        if key == "basecolor": arr = np.array(im.convert("RGBA"))[y0:y1, x0:x1, :3].astype(np.float32)
        elif key == "normal": arr = np.array(im.convert("RGB"))[y0:y1, x0:x1].astype(np.float32)
        else: arr = np.array(im.convert("L"))[y0:y1, x0:x1].astype(np.float32)[:, :, None]
        out = np.clip(fill(arr, opaque), 0, 255).astype(np.uint8)
        if out.shape[2] == 1: Image.fromarray(out[:, :, 0], "L").save(os.path.join(out_dir, "roll_%s.png" % key))
        else: Image.fromarray(out, "RGB").save(os.path.join(out_dir, "roll_%s.png" % key))
    return (x0, y0, x1, y1)
