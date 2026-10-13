# compose_massing.py -- AI 642 phase 1: lay the massing renders (massing.py) over the references for the option choice.
#
#   python -I compose_massing.py        (system Python with Pillow)
#
# Writes, under tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/:
#   massing_b8_sheet.png       b8 | each option's massing over b8 (from the calibrated b8 camera)
#   massing_aerial_sheet.png   the aerial | each option over the aerial (from the fitted aerial camera)
#   massing_rear_sheet.png     each option from the rear three-quarter camera, above its dimensioned plan
#   massing/<k>_b8_overlay.png full-size overlays for close checking
#   option_<CHOSEN>_sheet.png  the chosen option: over b8, its roof over the aerial, rear three-quarter + plan
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

PLAN_DIR = os.path.join(C.ROOT, "tests", "artifacts", "screens", "buildings", C.BUILDING_ID, "rebuild", "plan")
MASS = os.path.join(PLAN_DIR, "massing")
AERIAL = os.path.join(C.REFERENCES, "aerial-unannotated.png")
KEYS = "ABCDE"
CHOSEN = "E"            # the user's pick (annotated top view, 2026-10-12)
LABELS = {"A": "A mirrored octagon", "B": "B squared rear", "C": "C rounded rear", "D": "D aerial (shallow)", "E": "E long rear chamfers (chosen)"}


def font(size, bold=False):
    path = "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"
    return ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default()


def overlay(ref, render, tint=0.18):
    """The reference with the massing's edges (silhouette, slab and block lines) in magenta over a light tint of its
    coverage -- a grey wash alone vanishes over the pale stone."""
    m = render.convert("RGBA")
    a = m.getchannel("A")
    lum = Image.composite(m.convert("L"), Image.new("L", m.size, 0), a)
    e = ImageChops.lighter(lum.filter(ImageFilter.FIND_EDGES), a.filter(ImageFilter.FIND_EDGES))
    e = e.point(lambda v: 255 if v > 28 else 0).filter(ImageFilter.MaxFilter(3))
    out = ref.convert("RGB")
    out = Image.composite(Image.new("RGB", m.size, (0, 190, 255)), out, a.point(lambda v: int(v * tint)))
    return Image.composite(Image.new("RGB", m.size, (255, 0, 190)), out, e)


def labelled(im, text, scale):
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    out = Image.new("RGB", (im.width, im.height + 44), (255, 255, 255))
    out.paste(im, (0, 44))
    ImageDraw.Draw(out).text((8, 8), text, fill=(20, 20, 20), font=font(24, True))
    return out


def row(images, gap=12):
    w = sum(i.width for i in images) + gap * (len(images) - 1)
    h = max(i.height for i in images)
    out = Image.new("RGB", (w, h), (255, 255, 255))
    x = 0
    for i in images:
        out.paste(i, (x, 0))
        x += i.width + gap
    return out


def stack(images, gap=12):
    w = max(i.width for i in images)
    out = Image.new("RGB", (w, sum(i.height for i in images) + gap * (len(images) - 1)), (255, 255, 255))
    y = 0
    for i in images:
        out.paste(i, (0, y))
        y += i.height + gap
    return out


def red_pixels(path):
    """Count of red-dominant pixels (the massing's penthouse colour; every other block is grey)."""
    r, g, b, a = Image.open(path).convert("RGBA").split()
    over = lambda x, y: ImageChops.subtract(x, y).point(lambda v: 255 if v > 15 else 0)  # noqa: E731
    mask = ImageChops.multiply(ImageChops.multiply(over(r, g), over(r, b)), a.point(lambda v: 255 if v else 0))
    return mask.histogram()[255]


def chosen_sheet(k, b8, aerial):
    h = b8.height
    rear = Image.open(os.path.join(MASS, f"{k}_rear.png")).convert("RGBA")
    r = Image.new("RGB", rear.size, (255, 255, 255))
    r.paste(rear, mask=rear.getchannel("A"))
    r = r.resize((int(r.width * h * 0.62 / r.height), int(h * 0.62)), Image.LANCZOS)
    plan = Image.open(os.path.join(PLAN_DIR, f"plan_option_{k}.png")).convert("RGB")
    plan = plan.resize((int(plan.width * (h - r.height) / plan.height), h - r.height), Image.LANCZOS)
    col = Image.new("RGB", (max(r.width, plan.width), h), (255, 255, 255))
    col.paste(r, (0, 0))
    col.paste(plan, (0, r.height))
    tiles = [(overlay(b8, Image.open(os.path.join(MASS, f"{k}_b8.png"))), f"{k} over b8 (calibrated camera)"),
             (overlay(aerial, Image.open(os.path.join(MASS, f"{k}_aerial.png"))), f"{k} roof over the aerial (roof-plane fit)"),
             (col, f"{k} rear three-quarter + plan")]
    out = Image.new("RGB", (sum(i.width for i, _ in tiles) + 12 * (len(tiles) - 1), h + 50), (255, 255, 255))
    x = 0
    for im, text in tiles:
        out.paste(im, (x, 50))
        ImageDraw.Draw(out).text((x + 8, 10), text, fill=(20, 20, 20), font=font(26, True))
        x += im.width + 12
    out.save(os.path.join(PLAN_DIR, f"option_{k}_sheet.png"))


def main():
    b8 = Image.open(C.B8).convert("RGB")
    aerial = Image.open(AERIAL).convert("RGB")
    for ref, name, title in ((b8, "b8", "b8 (target)"), (aerial, "aerial", "aerial (supplementary)")):
        tiles = [labelled(ref, title, 0.5)]
        for k in KEYS:
            path = os.path.join(MASS, f"{k}_{name}.png")
            if not os.path.exists(path):
                continue
            ov = overlay(ref, Image.open(path))
            if name == "b8":
                ov.save(os.path.join(MASS, f"{k}_b8_overlay.png"))
            tiles.append(labelled(ov, LABELS[k], 0.5))
        row(tiles).save(os.path.join(PLAN_DIR, f"massing_{name}_sheet.png"))
    cols = []
    for k in KEYS:
        rear = os.path.join(MASS, f"{k}_rear.png")
        plan = os.path.join(PLAN_DIR, f"plan_option_{k}.png")
        if not (os.path.exists(rear) and os.path.exists(plan)):
            continue
        im = Image.open(rear).convert("RGBA")
        r = Image.new("RGB", im.size, (255, 255, 255))
        r.paste(im, mask=im.getchannel("A"))
        r = labelled(r, LABELS[k] + " -- rear three-quarter", 0.42)
        p = Image.open(plan).convert("RGB")
        p = p.resize((r.width, int(p.height * r.width / p.width)), Image.LANCZOS)
        cols.append(stack([r, p]))
    if cols:
        row(cols).save(os.path.join(PLAN_DIR, "massing_rear_sheet.png"))
    chosen_sheet(CHOSEN, b8, aerial)
    # the kept penthouse is red in the massing: none of it may show from the b8 camera
    print("PENTHOUSE PIXELS VISIBLE FROM B8", red_pixels(os.path.join(MASS, f"{CHOSEN}_b8.png")),
          "(rear view, as a check:", red_pixels(os.path.join(MASS, f"{CHOSEN}_rear.png")), ")")
    print("SHEETS", [f for f in os.listdir(PLAN_DIR) if f.startswith("massing_")])


if __name__ == "__main__":
    main()
