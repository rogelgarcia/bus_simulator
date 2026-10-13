# compose_pose_sheets.py -- comparison sheets from rendered poses (AI 639). System Python with Pillow, not Blender.
#
#   python -I compose_pose_sheets.py [--before baseline] [--after edit] [--poses a,b] [--items 615,621] [--groups full]
#                                    [--contact <tag>] [--out <dir>]
#
# Pairs: for every selected pose rendered under both tags (render_poses.py writes poses/<tag>/<pose>.png), one sheet
# [before | after], with b8.png first for the b8_target pose, into poses/sheets/<before>_vs_<after>/<pose>.png.
# Contact: --contact <tag> lays every rendered pose of one tag on a single labelled grid, poses/sheets/contact_<tag>.png
# (no pairs are made when only --contact is given).
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402

LABEL_H, GAP = 52, 10


def font(size):
    for f in ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf"):
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
        h = min(p["resolution"][1], 1080)
        tiles = []
        if p["name"] == "b8_target" and os.path.exists(C.B8):
            tiles.append(labelled(Image.open(C.B8), "TARGET  b8.png", h))
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
