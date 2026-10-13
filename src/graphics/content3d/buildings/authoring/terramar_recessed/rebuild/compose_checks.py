# compose_checks.py -- AI 643+: the check sheet from check_layers.py's renders (system Python with Pillow).
#
#   python -I compose_checks.py <dir> [--title "..."]
#
# Writes into <dir>: check_b8_overlay.png (the layer's edges in magenta over b8.png, from CAM_B8), check_sheet.png
# ([b8 overlay | top cut-away with the plan outlines | rear]) and checks.json, which counts the red (core) pixels
# CAM_B8 sees over the roof with stand-in walls in place (check_b8_sightline.png) -- the core must stay out of b8's view.
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402
from compose_massing import font, labelled, overlay, red_pixels, row  # noqa: E402


def on_white(path):
    im = Image.open(path).convert("RGBA")
    out = Image.new("RGB", im.size, (255, 255, 255))
    out.paste(im, mask=im.getchannel("A"))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--title", default="")
    args = ap.parse_args()
    d = args.dir
    b8 = Image.open(C.B8).convert("RGB")
    tiles = []
    checks = {}
    if os.path.exists(os.path.join(d, "check_b8.png")):
        ov = overlay(b8, Image.open(os.path.join(d, "check_b8.png")))
        ov.save(os.path.join(d, "check_b8_overlay.png"))
        tiles.append(labelled(ov, "CAM_B8 over b8.png (edges)", 0.6))
    if os.path.exists(os.path.join(d, "check_b8_sightline.png")):
        checks["core_pixels_visible_from_b8_over_the_roof"] = red_pixels(os.path.join(d, "check_b8_sightline.png"))
    if os.path.exists(os.path.join(d, "check_top.png")):
        top = on_white(os.path.join(d, "check_top.png"))
        tiles.append(labelled(top, "CAM_TOP, roof cut away; plan outlines", 0.6 * b8.height / top.height))
    if os.path.exists(os.path.join(d, "check_rear.png")):
        rear = on_white(os.path.join(d, "check_rear.png"))
        tiles.append(labelled(rear, "CAM_REAR", 0.6 * b8.height / rear.height))
    if os.path.exists(os.path.join(d, "check_rear.png")):
        checks["rear_core_pixels"] = red_pixels(os.path.join(d, "check_rear.png"))
    sheet = row(tiles)
    if args.title:
        framed = Image.new("RGB", (sheet.width, sheet.height + 56), (255, 255, 255))
        framed.paste(sheet, (0, 56))
        ImageDraw.Draw(framed).text((10, 10), args.title, fill=(20, 20, 20), font=font(30, True))
        sheet = framed
    sheet.save(os.path.join(d, "check_sheet.png"))
    with open(os.path.join(d, "checks.json"), "w", encoding="utf-8") as fh:
        json.dump(checks, fh, indent=2)
    print("CHECKS", json.dumps(checks), "->", os.path.join(d, "check_sheet.png"))


if __name__ == "__main__":
    main()
