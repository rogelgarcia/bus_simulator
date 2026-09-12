"""Reference / current pair, aligned on two horizontal lines: A = the band bottom, B = the sidewalk.

    python overlay_pair.py PHOTO MODEL.png OUT_DIR

Writes OUT_DIR/pair_reference.png and OUT_DIR/pair_current.png: the same crop
and size, the model (opaque frontal from `overlay_portal.py --opaque`) scaled
uniformly and placed so that its band bottom and sidewalk (from
overlay_features.json) sit on the photo's rows A and B, centred on the
portal's axis. Thin red lines mark A and B on both images; nothing else is
drawn, so the two can be flipped or overlaid directly.
"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont

photo_p, model_p, out_dir = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
OVD = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", "..", "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "overlay"))
feat = json.load(open(os.path.join(OVD, "overlay_features.json")))["features"]
photo = Image.open(photo_p).convert("RGB"); PW, PH = photo.size
model = Image.open(model_p).convert("RGB")

A_ROW, B_ROW, CENTRE = 500, 1180, 515          # photo rows of the band bottom / sidewalk, portal axis column (user_entrance_frontal.png)
fa, fb = feat["band_bottom"], feat["sidewalk_left"]; fr = feat["sidewalk_right"]
s = (B_ROW - A_ROW) / (fb[1] - fa[1])          # uniform scale from the two lines
oy = B_ROW - s * fb[1]; ox = CENTRE - s * (fb[0] + fr[0]) / 2.0

def model_in_photo_frame():
    box = tuple(int(round(v)) for v in ((0 - ox) / s, (0 - oy) / s, (PW - ox) / s, (PH - oy) / s))
    canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (140, 143, 150))
    part = model.crop((max(0, box[0]), max(0, box[1]), min(model.width, box[2]), min(model.height, box[3])))
    canvas.paste(part, (max(0, box[0]) - box[0], max(0, box[1]) - box[1]))
    return canvas.resize((PW, PH), Image.LANCZOS)

CROP = (40, 240, 990, 1260)                    # portal with the cornice above and the sidewalk below
try: font = ImageFont.truetype("arialbd.ttf", 22)
except Exception: font = ImageFont.load_default()
def finish(im, title):
    im = im.crop(CROP); d = ImageDraw.Draw(im)
    for label, row in (("A", A_ROW), ("B", B_ROW)):
        y = row - CROP[1]; d.line([(0, y), (im.width, y)], fill=(255, 40, 40), width=2)
        d.text((8, y - 26), label, fill=(255, 40, 40), font=font)
    d.text((im.width - 8 - d.textlength(title, font=font), 8), title, fill=(255, 255, 255), font=font)
    return im
os.makedirs(out_dir, exist_ok=True)
finish(photo, "reference").save(os.path.join(out_dir, "pair_reference.png"))
finish(model_in_photo_frame(), "current").save(os.path.join(out_dir, "pair_current.png"))
print("pair -> %s (scale %.1f px/m, crop %s)" % (out_dir, s * (fr[0] - fb[0]) / 4.66, CROP))
