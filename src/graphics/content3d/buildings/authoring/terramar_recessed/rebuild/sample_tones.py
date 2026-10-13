# sample_tones.py -- AI 648: compare material tones between b8.png and a CAM_B8 render of the rebuild, box by box.
#
#   python -I sample_tones.py <render.png> [out_dir]      (system Python with Pillow)
#
# The boxes sit on plain areas of each material in b8 (no plants, no palm shadows) in CAM_B8's frame, which
# render_poses.py's b8_calibrated pose shares (1122 x 1402). For every box it prints the mean sRGB colour in both
# images; per material family it prints the median linear ratio b8 / render and the tone that ratio suggests from
# plan["materials"] (stone: the tone multiplier; wood and soffit: the base colour). AgX is not linear,
# so the suggestion converges in two or three render passes. Writes <out_dir>/tone_boxes.png (the boxes on both
# pictures) and tone_samples.json.
import json
import os
import statistics
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

# name: (family, box (x0, y0, x1, y1) in the 1122 x 1402 frame[, the render's own box if it must differ]). The wood
# boxes sit on the left reveals above the guards (below them the guard glass tints the wood).
BOXES = {
    "pilaster_left": ("stone", (448, 412, 460, 470)),
    "pilaster_right": ("stone", (656, 412, 668, 470)),
    "pilaster_left_low": ("stone", (448, 690, 460, 740)),
    "podium_upper_left": ("stone", (404, 846, 436, 880)),
    "fascia_front": ("stone", (520, 507, 590, 511)),
    "wood_reveal_f4": ("wood", (476, 428, 486, 455)),
    "wood_reveal_f3": ("wood", (476, 535, 486, 560)),
    "soffit_centre_f5": ("soffit", (490, 292, 630, 300)),
}


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mean(im, box):
    c = im.crop(box)
    px = [c.getpixel((x, y)) for y in range(c.height) for x in range(c.width)]
    return tuple(sum(p[i] for p in px) / len(px) for i in range(3))


def main():
    render = Image.open(sys.argv[1]).convert("RGB")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(sys.argv[1]))
    b8 = Image.open(os.path.join(C.REFERENCES, "b8.png")).convert("RGB")
    if b8.size != render.size:
        raise SystemExit(f"sizes differ: b8 {b8.size}, render {render.size} -- render the b8_calibrated pose at 100%")
    plan = C.load_json(C.REBUILD_PLAN)
    mats = plan["materials"]
    current = {"stone": mats["stone"]["tone"], "wood": mats["wood"]["rgb"], "soffit": mats["soffit"]["rgb"]}
    rows, ratios = {}, {}
    for name, (fam, box, *own) in BOXES.items():
        a, b = mean(b8, box), mean(render, own[0] if own else box)
        r = [lin(x) / max(lin(y), 1e-6) for x, y in zip(a, b)]
        rows[name] = {"family": fam, "box": box, "render_box": own[0] if own else box, "b8_srgb": [round(x) for x in a], "render_srgb": [round(x) for x in b],
                      "linear_ratio": [round(x, 3) for x in r]}
        ratios.setdefault(fam, []).append(r)
        print(f"{name:20s} {fam:7s} b8 {tuple(round(x) for x in a)}  render {tuple(round(x) for x in b)}  ratio {tuple(round(x, 2) for x in r)}")
    suggest = {}
    for fam, rs in ratios.items():
        med = [statistics.median(r[i] for r in rs) for i in range(3)]
        cur = current.get(fam)
        suggest[fam] = {"median_ratio": [round(x, 3) for x in med],
                        "suggested": [round(c * m, 4) for c, m in zip(cur, med)] if cur else None, "current": cur}
        print(f"FAMILY {fam:7s} median ratio {tuple(round(x, 3) for x in med)}  current {cur}  suggested {suggest[fam]['suggested']}")
    vis = Image.new("RGB", (b8.width * 2, b8.height))
    for k, im in enumerate((b8, render)):
        tile = im.copy()
        d = ImageDraw.Draw(tile)
        for name, (fam, box, *own) in BOXES.items():
            d.rectangle(own[0] if (own and k == 1) else box, outline=(255, 0, 255), width=1)
        vis.paste(tile, (k * b8.width, 0))
    os.makedirs(out, exist_ok=True)
    vis.save(os.path.join(out, "tone_boxes.png"))
    with open(os.path.join(out, "tone_samples.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"render": os.path.abspath(sys.argv[1]), "boxes": rows, "families": suggest}, fh, indent=2)


if __name__ == "__main__":
    main()
