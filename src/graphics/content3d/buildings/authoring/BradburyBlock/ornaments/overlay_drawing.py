"""Draw an ornament's line drawing over its reference photo, to check the trace.

    python overlay_drawing.py DRAWING.svg PHOTO.png OUT.png [--axis 767] [--scale 2]

Left: the photo, dimmed, with the drawing on top in its layer colours and the traced right half mirrored about the
axis (thin) onto the left half, which checks the symmetry the build assumes. Right: the drawing alone on white.
Reads the drawing with carving.read_drawing, the same reader the build uses.
"""
import sys, os, argparse
from PIL import Image, ImageDraw, ImageEnhance
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carving import read_drawing

COL = {"guide": (58, 160, 255), "outline": (15, 15, 15), "ridge": (232, 89, 12), "groove": (0, 150, 110),
       "eye": (30, 30, 90), "path": (200, 20, 150), "point": (34, 85, 221)}
WIDTH = {"guide": 1, "outline": 3, "ridge": 3, "groove": 3, "eye": 2, "path": 3, "point": 2}

def draw(d, drawing, S, mirror_axis=None, thin=False):
    mx = (lambda x: 2 * mirror_axis - x) if mirror_axis is not None else (lambda x: x)
    for el, kinds in drawing.items():
        for kind, items in kinds.items():
            c = COL.get(kind, (0, 0, 0)); w = 1 if thin else WIDTH.get(kind, 2)
            if kind == "point":
                for cx, cy, rx, ry in items:
                    box = [(mx(cx) - rx) * S, (cy - ry) * S, (mx(cx) + rx) * S, (cy + ry) * S]
                    d.ellipse([min(box[0], box[2]), box[1], max(box[0], box[2]), box[3]], outline=c, width=w)
                continue
            for pts, closed in items:
                P = [(mx(x) * S, y * S) for x, y in pts]
                if closed: P = P + [P[0]]
                if kind == "eye" and closed and not thin:
                    d.polygon(P, fill=c + (110,))
                d.line(P, fill=c + (255,), width=w, joint="curve")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("drawing"); ap.add_argument("photo"); ap.add_argument("out")
    ap.add_argument("--axis", type=float, default=767.0); ap.add_argument("--scale", type=float, default=2.0)
    a = ap.parse_args()
    drawing = read_drawing(a.drawing)
    photo = Image.open(a.photo).convert("RGB")
    S = a.scale
    W, H = int(photo.width * S), int(photo.height * S)
    left = ImageEnhance.Brightness(ImageEnhance.Color(photo.resize((W, H), Image.LANCZOS)).enhance(0.35)).enhance(1.15).convert("RGBA")
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    draw(d, drawing, S, mirror_axis=a.axis, thin=True)
    draw(d, drawing, S)
    left = Image.alpha_composite(left, ov)
    right = Image.new("RGBA", (W, H), (255, 255, 255, 255)); d2 = ImageDraw.Draw(right)
    draw(d2, drawing, S, mirror_axis=a.axis, thin=True)
    draw(d2, drawing, S)
    sheet = Image.new("RGB", (W * 2 + 20, H), (255, 255, 255))
    sheet.paste(left.convert("RGB"), (0, 0)); sheet.paste(right.convert("RGB"), (W + 20, 0))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    sheet.save(a.out)
    n = sum(len(v) for k in drawing.values() for v in k.values())
    print("overlay", a.out, len(drawing), "elements", n, "items")

if __name__ == "__main__":
    main()
