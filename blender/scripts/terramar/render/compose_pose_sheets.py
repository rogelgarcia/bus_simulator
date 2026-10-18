# compose_pose_sheets.py -- comparison sheets from rendered poses (AI 639). System Python with Pillow, not Blender.
#
#   python -I compose_pose_sheets.py [--before baseline] [--after edit] [--poses a,b] [--items 615,621] [--groups full]
#                                    [--contact <tag>] [--out <dir>]
#
# Pairs: for every selected pose rendered under both tags (render_poses.py writes poses/<tag>/<pose>.png), one sheet
# [before | after], with the reference first for the poses framed like it (b8_target and "reference": "b8", such as
# b8_calibrated, put b8.png first; "reference": "aerial" puts the supplementary aerial first, for the CAM_AERIAL pose),
# into poses/sheets/<before>_vs_<after>/<pose>.png. The rebuild's tag is "rebuild":
#   python -I compose_pose_sheets.py --before edit --after rebuild --items 643
# Contact: --contact <tag> lays every rendered pose of one tag on a single labelled grid, poses/sheets/contact_<tag>.png
# (no pairs are made when only --contact is given).
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402

LABEL_H, GAP = 52, 10
REFERENCES = {"b8": C.B8, "aerial": os.path.join(C.REFERENCES, "aerial-unannotated.png")}   # "reference" of a pose


def font(size):
    for f in (BP.font_path("segoeuib.ttf"), BP.font_path("arialbd.ttf"), BP.font_path("arial.ttf")):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def labelled(img, text, height=None, width=None):
    img = img.convert("RGB")
    if height:
        img = img.resize((round(img.width * height / img.height), height), Image.LANCZOS)
    elif width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    tile = Image.new("RGB", (img.width, img.height + LABEL_H), (24, 24, 24))
    tile.paste(img, (0, LABEL_H))
    ImageDraw.Draw(tile).text((14, 12), text, fill=(240, 240, 240), font=font(24))
    return tile


def hstack(tiles):
    out = Image.new("RGB", (sum(t.width for t in tiles) + GAP * (len(tiles) - 1), max(t.height for t in tiles)), (255, 255, 255))
    x = 0
    for t in tiles:
        out.paste(t, (x, 0))
        x += t.width + GAP
    return out


def selected(poses, args):
    names = [s for s in (args.poses or "").split(",") if s]
    items = [int(s) for s in (args.items or "").split(",") if s]
    groups = [s for s in (args.groups or "").split(",") if s]
    if not (names or items or groups):
        return poses
    return [p for p in poses if p["name"] in names or p["group"] in groups or any(i in p.get("items", []) for i in items)]


def pairs(poses, args):
    out_dir = os.path.join(args.out, f"{args.before}_vs_{args.after}")
    os.makedirs(out_dir, exist_ok=True)
    for p in poses:
        a = os.path.join(C.POSES_DIR, args.before, f"{p['name']}.png")
        b = os.path.join(C.POSES_DIR, args.after, f"{p['name']}.png")
        if not (os.path.exists(a) and os.path.exists(b)):
            print(f"skip {p['name']}: missing {'before' if not os.path.exists(a) else 'after'}")
            continue
        h = min(Image.open(b).height, 1080)
        tiles = []
        ref = "b8" if p["name"] == "b8_target" else p.get("reference")
        ref_path = REFERENCES.get(ref)
        if ref_path and os.path.exists(ref_path):
            tiles.append(labelled(Image.open(ref_path), f"{'TARGET' if ref == 'b8' else 'REFERENCE'}  {os.path.basename(ref_path)}", h))
        tiles += [labelled(Image.open(a), f"BEFORE  {args.before}  -  {p['name']}", h),
                  labelled(Image.open(b), f"AFTER  {args.after}  -  {p['name']}", h)]
        path = os.path.join(out_dir, f"{p['name']}.png")
        hstack(tiles).save(path)
        print("sheet", path)


def contact(poses, args):
    tiles = []
    for p in poses:
        f = os.path.join(C.POSES_DIR, args.contact, f"{p['name']}.png")
        if os.path.exists(f):
            tiles.append(labelled(Image.open(f), f"{p['name']}  ({p['group']}; items {','.join(map(str, p.get('items', [])))})", height=420))
    if not tiles:
        raise SystemExit(f"no renders under poses/{args.contact}/")
    rows, row, width_limit = [], [], 2600
    for t in tiles:
        if row and sum(x.width for x in row) + GAP * len(row) + t.width > width_limit:
            rows.append(hstack(row))
            row = []
        row.append(t)
    rows.append(hstack(row))
    sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows) + GAP * (len(rows) - 1)), (255, 255, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + GAP
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"contact_{args.contact}.png")
    sheet.save(path)
    print("contact", path, sheet.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default="baseline")
    ap.add_argument("--after", default="edit")
    ap.add_argument("--poses")
    ap.add_argument("--items")
    ap.add_argument("--groups")
    ap.add_argument("--contact")
    ap.add_argument("--out", default=os.path.join(C.POSES_DIR, "sheets"))
    args = ap.parse_args()
    poses = selected(C.load_json(C.POSES_JSON)["poses"], args)
    if args.contact:
        contact(poses, args)
    else:
        pairs(poses, args)


if __name__ == "__main__":
    main()
