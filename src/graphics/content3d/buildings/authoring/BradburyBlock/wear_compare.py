# Evidence helpers for the wear layer (AI 563 and its features): side-by-side sheets and pixel differences. Plain
# Python with Pillow and NumPy (not Blender's):
#
#   python wear_compare.py side OUT.png A.png B.png [C.png ...] --labels "off|on|debug" [--scale 0.5] [--title "..."]
#   python wear_compare.py diff A.png B.png [--heat OUT.png] [--gain 8] [--json OUT.json]
#   python wear_compare.py regions IMG.png clean:x0,y0,x1,y1 mark:x0,y0,x1,y1 [...]
#   python wear_compare.py lighter OFF.png ON.png [--again ON2.png] [--block 8] [--ratio 1.02] [--step 0.003]
#                                 [--heat OUT.png] [--json OUT.json]
#
# `regions` is for calibration: the mean colour and relative luminance of each named pixel box, and each one's
# luminance as a ratio of the FIRST box's. Measure the same pair -- clean wall beside a mark, and the mark -- in a
# reference photo (the 1960 HABS corner, loc_habs_ca0212_001, is black and white) and in a render, and set a feature's
# strength so the two ratios agree. Luminance is taken in linear light from sRGB.
#
# `lighter` is a deposit's check (added by AI 565's critique fix, 2026-09-24): a deposit darkens what it lies on and
# never lights it up. It compares a still with the feature off (OFF) and on (ON) block by block (linear luminance,
# `block` pixels square) and lists the blocks ON is lighter in by more than `ratio` AND by more than `step`; --again,
# the ON still rendered a second time, leaves out the blocks the renderer itself does not repeat within those margins
# (and counts them). It exits with status 1 when any block is lighter; --heat paints the lighter blocks orange and the
# darker ones blue over ON, dimmed.
#
# `side` lays the images left to right, each under its own label, at `scale` of their size. `diff` prints how far B is
# from A over the whole frame: the mean absolute difference in 8-bit levels, the largest, the share of pixels off by
# more than 2, 8 and 24 levels (render noise sits in the first), and the PSNR; --heat writes |B - A| times `gain` as
# an image, bright where they differ.
import argparse, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def _font(size):
    for fn in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try: return ImageFont.truetype(fn, size)
        except OSError: continue
    return ImageFont.load_default()


def side(out, images, labels=None, scale=1.0, title=None):
    ims = [Image.open(p).convert("RGB") for p in images]
    if scale != 1.0: ims = [im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS) for im in ims]
    h = max(im.height for im in ims)
    bar = max(28, round(h * 0.045)); tbar = bar if title else 0; gap = max(4, round(h * 0.006))
    W = sum(im.width for im in ims) + gap * (len(ims) - 1)
    sheet = Image.new("RGB", (W, h + bar + tbar), (18, 18, 18))
    d = ImageDraw.Draw(sheet); f = _font(round(bar * 0.62))
    if title: d.text((gap * 2, round(tbar * 0.18)), title, fill=(235, 235, 235), font=f)
    x = 0
    for i, im in enumerate(ims):
        sheet.paste(im, (x, tbar + bar))
        lab = labels[i] if labels and i < len(labels) else os.path.basename(images[i])
        d.text((x + gap * 2, tbar + round(bar * 0.16)), lab, fill=(255, 214, 90), font=f)
        x += im.width + gap
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out)
    return out


def diff(a_path, b_path, heat=None, gain=8.0):
    a = np.asarray(Image.open(a_path).convert("RGB"), dtype=np.int16)
    b = np.asarray(Image.open(b_path).convert("RGB"), dtype=np.int16)
    assert a.shape == b.shape, f"sizes differ: {a.shape} vs {b.shape}"
    d = np.abs(b - a); dm = d.max(axis=2)
    mse = float((d.astype(np.float64) ** 2).mean())
    st = dict(a=a_path, b=b_path, size=[int(a.shape[1]), int(a.shape[0])],
              mean_abs=round(float(d.mean()), 4), max_abs=int(d.max()),
              pct_over_2=round(float((dm > 2).mean() * 100), 4), pct_over_8=round(float((dm > 8).mean() * 100), 4),
              pct_over_24=round(float((dm > 24).mean() * 100), 4),
              psnr=round(10 * math.log10(255.0 ** 2 / mse), 2) if mse > 0 else float("inf"),
              identical=bool(mse == 0))
    if heat:
        h = np.clip(dm.astype(np.float32) * gain, 0, 255).astype(np.uint8)
        os.makedirs(os.path.dirname(os.path.abspath(heat)), exist_ok=True)
        Image.fromarray(h, "L").save(heat)
    return st


def regions(path, boxes):
    im = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64) / 255.0
    lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    out, ref = [], None
    for spec in boxes:
        name, xy = spec.split(":", 1)
        x0, y0, x1, y1 = (int(v) for v in xy.split(","))
        y = float(Y[y0:y1, x0:x1].mean()); srgb = (im[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0) * 255).round(1)
        ref = y if ref is None else ref
        out.append(dict(name=name, box=[x0, y0, x1, y1], srgb=srgb.tolist(), luminance=round(y, 5),
                        ratio=round(y / ref, 4) if ref > 0 else None))
    return out


def _lin_luminance(path):
    im = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64) / 255.0
    lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
    return lin @ np.array([0.2126, 0.7152, 0.0722])


def lighter(off_path, on_path, again=None, block=8, ratio=1.02, step=0.003, heat=None):
    def blocks(path):
        y = _lin_luminance(path); h, w = y.shape[0] // block * block, y.shape[1] // block * block
        return y[:h, :w].reshape(h // block, block, w // block, block).mean(axis=(1, 3))

    def over(a, b):                             # b above a by more than both margins
        return (b > a * ratio) & (b - a > step)
    b0, b1 = blocks(off_path), blocks(on_path)
    assert b0.shape == b1.shape, f"sizes differ: {off_path} vs {on_path}"
    shaky = np.zeros(b0.shape, bool)
    if again:
        b2 = blocks(again)
        shaky = over(b1, b2) | over(b2, b1)
    up = over(b0, b1) & ~shaky
    down = over(b1, b0) & ~shaky
    r = b1 / np.maximum(b0, 1e-6)
    st = dict(off=off_path, on=on_path, again=again, block=block, ratio=ratio, step=step, blocks=int(b0.size),
              lighter=int(up.sum()), darker=int(down.sum()), not_repeatable=int(shaky.sum()))
    if up.any():
        ys, xs = np.nonzero(up)
        worst = np.argsort(-(b1 - b0)[up])[:10]
        st["bbox"] = [int(xs.min() * block), int(ys.min() * block), int((xs.max() + 1) * block),
                      int((ys.max() + 1) * block)]
        st["worst"] = [dict(x=int(xs[i] * block), y=int(ys[i] * block), off=round(float(b0[ys[i], xs[i]]), 5),
                            on=round(float(b1[ys[i], xs[i]]), 5), ratio=round(float(r[ys[i], xs[i]]), 3))
                       for i in worst]
    if heat:
        im = np.asarray(Image.open(on_path).convert("RGB"), dtype=np.float64) * 0.45
        k = np.ones((block, block))
        u = np.kron(up * np.clip((r - 1.0) / 0.2, 0.25, 1.0), k)
        d = np.kron(down * np.clip((1.0 - r) / 0.2, 0.25, 1.0), k)
        h, w = u.shape
        im[:h, :w, 0] += 255 * u; im[:h, :w, 1] += 140 * u + 60 * d; im[:h, :w, 2] += 255 * d
        os.makedirs(os.path.dirname(os.path.abspath(heat)), exist_ok=True)
        Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(heat)
    return st


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("side"); s.add_argument("out"); s.add_argument("images", nargs="+")
    s.add_argument("--labels"); s.add_argument("--scale", type=float, default=1.0); s.add_argument("--title")
    q = sub.add_parser("diff"); q.add_argument("a"); q.add_argument("b"); q.add_argument("--heat")
    q.add_argument("--gain", type=float, default=8.0); q.add_argument("--json")
    r = sub.add_parser("regions"); r.add_argument("image"); r.add_argument("boxes", nargs="+")
    li = sub.add_parser("lighter"); li.add_argument("off"); li.add_argument("on"); li.add_argument("--again")
    li.add_argument("--block", type=int, default=8); li.add_argument("--ratio", type=float, default=1.02)
    li.add_argument("--step", type=float, default=0.003); li.add_argument("--heat"); li.add_argument("--json")
    ns = ap.parse_args()
    if ns.cmd == "side":
        print(side(ns.out, ns.images, ns.labels.split("|") if ns.labels else None, ns.scale, ns.title))
    elif ns.cmd == "regions":
        for row in regions(ns.image, ns.boxes): print(json.dumps(row))
    elif ns.cmd == "lighter":
        st = lighter(ns.off, ns.on, ns.again, ns.block, ns.ratio, ns.step, ns.heat)
        print(json.dumps(st))
        if ns.json:
            with open(ns.json, "w", encoding="utf-8") as fh: json.dump(st, fh, indent=1)
        sys.exit(1 if st["lighter"] else 0)
    else:
        st = diff(ns.a, ns.b, ns.heat, ns.gain)
        print(json.dumps(st))
        if ns.json:
            with open(ns.json, "w", encoding="utf-8") as fh: json.dump(st, fh, indent=1)
