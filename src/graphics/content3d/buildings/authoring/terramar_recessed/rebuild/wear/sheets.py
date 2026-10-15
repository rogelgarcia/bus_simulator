# sheets.py -- the wear module's evidence (2026-10-14): per-feature sheets and exact-difference numbers. System Python:
#
#   python -I <R>/wear/sheets.py sheet --feature splash_zone --poses wear_base_front,wear_base_corner,b8_calibrated \
#          --off wear_off --on wear_on --debug wear_debug [--reference-crop 150,1000,980,1235] [--out <dir>]
#   python -I <R>/wear/sheets.py diff --a pre_wear --b wear_off --poses b8_calibrated,wear_base_front [--root <dir>]
#
# Renders are read from the poses folder (render_poses.py: tests/artifacts/screens/buildings/terramar_recessed/poses/
# <tag>/<pose>.png) or --root <dir>/<tag>/<pose>.png. A sheet row per pose: [b8 crop | off | on | debug]; for a pose that
# renders b8's own frame (b8_calibrated, 1122 x 1402) the same crop is taken from every panel, else the panels are the
# whole renders and the b8 crop stands for the reference look. Every pose also gets an [off | on | debug] detail row,
# enlarged, of the box DETAIL gives it (where the feature lives; --detail overrides): a subtle change is judged there. Sheets go to
# tests/artifacts/screens/buildings/terramar_recessed/rebuild/wear/<feature>/ unless --out.
# diff prints, per pose, max and mean |a - b| over all channels in 8-bit levels and the count of pixels that differ at
# all (8-bit PNGs, as render_poses.py writes them).
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.normpath(os.path.join(R, "..", "..", "..", "..", "..", "..", ".."))
POSES = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", "terramar_recessed", "poses")
B8 = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", "terramar_recessed", "references", "b8.png")
OUT = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", "terramar_recessed", "rebuild", "wear")
B8_SIZE = (1122, 1402)
B8_BASE = (150, 1000, 980, 1235)          # b8's building base: the piers' feet, the entrance, the sidewalk edge
# the detail row's box per pose (fractions of the render), where the base of the walls is; --detail overrides
DETAIL = {"wear_base_front": (0.47, 0.38, 0.71, 0.76), "wear_base_corner": (0.12, 0.30, 0.48, 0.66)}
DETAIL_DEFAULT = (0.18, 0.40, 0.82, 0.80)


def load(root, tag, pose):
    p = os.path.join(root, tag, f"{pose}.png")
    if not os.path.exists(p):
        raise SystemExit(f"missing {p}")
    return Image.open(p)


def read_rgb(path):
    """Float RGB of an 8-bit PNG (render_poses.py writes 8-bit). PIL would silently drop a 16-bit PNG's low byte, so
    16-bit files are refused: compare those in Blender (bpy.data.images, float pixels)."""
    with open(path, "rb") as fh:
        head = fh.read(26)
    if head[24] != 8:
        raise SystemExit(f"{path}: {head[24]}-bit PNG; diff reads 8-bit PNGs only")
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)


def label(im, text, size=26):
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("arial.ttf", size)
    except OSError:
        font = ImageFont.load_default()
    d.rectangle((0, 0, im.width, size + 14), fill=(0, 0, 0))
    d.text((10, 6), text, fill=(255, 255, 255), font=font)
    return im


def fit(im, h):
    return im.convert("RGB").resize((round(im.width * h / im.height), h), Image.LANCZOS)


def row(panels, h):
    ims = [label(fit(im, h), t) for t, im in panels]
    out = Image.new("RGB", (sum(i.width for i in ims) + 8 * (len(ims) - 1), h), (24, 24, 24))
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width + 8
    return out


def stack(rows):
    w = max(r.width for r in rows)
    out = Image.new("RGB", (w, sum(r.height for r in rows) + 8 * (len(rows) - 1)), (24, 24, 24))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + 8
    return out


def sheet(args):
    root = args.root or POSES
    b8 = Image.open(B8).convert("RGB")
    crop = tuple(int(v) for v in args.reference_crop.split(",")) if args.reference_crop else B8_BASE
    out = args.out or os.path.join(OUT, args.feature)
    os.makedirs(out, exist_ok=True)
    made = []
    for pose in [p for p in args.poses.split(",") if p]:
        ims = {k: load(root, getattr(args, k), pose).convert("RGB") for k in ("off", "on", "debug")}
        own_frame = ims["off"].size == B8_SIZE
        ref = b8.crop(crop)
        panels = [("b8 (reference) base crop", ref)]
        for k in ("off", "on", "debug"):
            im = ims[k].crop(crop) if own_frame else ims[k]
            panels.append((f"{k}  ({getattr(args, k)})", im))
        h = 420 if own_frame else 540
        rows = [row(panels, h)]
        w, hh = ims["off"].size
        frac = tuple(float(v) for v in args.detail.split(",")) if args.detail else DETAIL.get(pose, DETAIL_DEFAULT)
        box = (int(w * frac[0]), int(hh * frac[1]), int(w * frac[2]), int(hh * frac[3]))
        if own_frame and not args.detail:
            box = crop                                                  # b8's own frame: the base crop again, larger
        dh = 2 * h if own_frame else h + h // 2
        rows.append(row([(f"{k} detail", ims[k].crop(box)) for k in ("off", "on", "debug")], dh))
        s = stack(rows)
        path = os.path.join(out, f"{args.feature}_{pose}.png")
        s.save(path)
        made.append(path)
        print("SHEET", path)
    return made


def diff(args):
    root = args.root or POSES
    res = {}
    for pose in [p for p in args.poses.split(",") if p]:
        a = read_rgb(os.path.join(root, args.a, f"{pose}.png"))
        b = read_rgb(os.path.join(root, args.b, f"{pose}.png"))
        assert a.shape == b.shape, f"{pose}: {a.shape} vs {b.shape}"
        d = np.abs(a - b)
        res[pose] = {"max": round(float(d.max()), 4), "mean": round(float(d.mean()), 6),
                     "pixels_differing": int(np.count_nonzero(d.max(axis=2) > 0)),
                     "pixels": int(d.shape[0] * d.shape[1])}
        print(f"DIFF {pose}: {args.a} vs {args.b}: max {res[pose]['max']} mean {res[pose]['mean']} "
              f"({res[pose]['pixels_differing']} of {res[pose]['pixels']} pixels differ)")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"a": args.a, "b": args.b, "root": root, "poses": res}, fh, indent=2)
    return res


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sheet")
    s.add_argument("--feature", required=True)
    s.add_argument("--poses", required=True)
    for k in ("off", "on", "debug"):
        s.add_argument(f"--{k}", required=True)
    s.add_argument("--reference-crop")
    s.add_argument("--detail", help="x0,y0,x1,y1 fractions of the render for the detail row")
    s.add_argument("--root")
    s.add_argument("--out")
    d = sub.add_parser("diff")
    d.add_argument("--a", required=True)
    d.add_argument("--b", required=True)
    d.add_argument("--poses", required=True)
    d.add_argument("--root")
    d.add_argument("--json")
    args = ap.parse_args()
    (sheet if args.cmd == "sheet" else diff)(args)


if __name__ == "__main__":
    main()
