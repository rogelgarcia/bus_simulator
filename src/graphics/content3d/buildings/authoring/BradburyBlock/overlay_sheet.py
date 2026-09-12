"""Element-by-element comparison sheet: reference photo | model, base-aligned, same scale.

    python overlay_sheet.py PHOTO MODEL.png OUT.png

MODEL.png is the opaque frontal from `overlay_portal.py --opaque` (camera
calibrated to the photo's perspective), mapped into the photo's pixel frame
(scale from the pilaster shafts' outer edges, vertical offset from the
sidewalk line, using overlay_features.json). Every entry pairs ONE element
of the photo (measured pixel row / column, PHOTO_H / PHOTO_W below) with
THE SAME element of the model (its projected position from the features
file, taken from the model's real geometry): red = photo, traced across both
panels; yellow = the model's position on the model panel; the offset (model
minus photo, metres at the pilaster face) is written beside each label.
Elements on the recessed door plane are tagged "(recessed)": their apparent
size depends on the camera distance, so treat those offsets with care.
"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont

photo_p, after_p, out_p = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
OVD = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", "..", "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "overlay"))
J = json.load(open(os.path.join(OVD, "overlay_features.json"))); feat = J["features"]; cam = J.get("camera", {})
photo = Image.open(photo_p).convert("RGB"); PW, PH = photo.size
after = Image.open(after_p).convert("RGB")

# ---------------------------------------------------------------- the photo's elements (pixels, user_entrance_frontal.png 1080 x 1440)
# heights: (label, photo row, model feature, tag)   tag: "" face/arch plane, "rec" recessed door plane, "none" not built
PHOTO_H = [
    ("cornice top", 300, None, "none"),
    ("dentil course bottom", 375, None, "none"),
    ("band top", 398, "band_top", ""),
    ("letters top", 422, "letters_top", ""),
    ("letters bottom", 478, "letters_bottom", ""),
    ("band bottom", 500, "band_bottom", ""),
    ("pilaster capital top", 500, "capital_top", ""),
    ("keystone top", 500, "keystone_top", ""),
    ("ring outer crown", 548, "ring_outer_crown", ""),
    ("pilaster capital bottom", 553, "capital_bottom", ""),
    ("keystone bottom", 583, "keystone_bottom", ""),
    ("pilaster panel top", 583, "panel_top", ""),
    ("ring inner (bead) crown", 585, "ring_inner_crown", ""),
    ("arch intrados apex", 600, "arch_apex", ""),
    ("transom bottom", 760, "transom_bottom", "rec"),
    ("door head (leaf top)", 795, "door_head", "rec"),
    ("spring line / pier capital top", 805, "pier_capital_top", ""),
    ("pier capital bottom", 850, "pier_capital_bottom", ""),
    ("pilaster panel bottom", 1008, "panel_bottom", ""),
    ("plinth top", 1081, "plinth_top", ""),
    ("door sill", 1145, "door_sill", "rec"),
    ("sidewalk", 1180, "sidewalk_left", ""),
]
# widths: (label, photo column L, photo column R, model feature L, model feature R, tag)
PHOTO_W = [
    ("pilaster outer edge", 140, 890, "pilaster_L_outer_top", "pilaster_R_outer_top", ""),
    ("pilaster capital extent", 118, 912, "capital_L_outer", "capital_R_outer", ""),
    ("pilaster panel outer edge", 158, 872, "panel_L_outer", "panel_R_outer", ""),
    ("pilaster panel inner edge", 243, 787, "panel_L_inner", "panel_R_inner", ""),
    ("pilaster inner edge", 256, 776, "pilaster_L_inner", "pilaster_R_inner", ""),
    ("ring outer edge at the spring", 258, 772, "ring_outer_spring_L", "ring_outer_spring_R", ""),
    ("pier inner face", 310, 720, "pier_inner_L", "pier_inner_R", ""),
    ("pier capital inner extent", 300, 730, "pier_capital_L_inner", "pier_capital_R_inner", ""),
    ("door set", 332, 698, "door_L", "door_R", "rec"),
    ("letters extent", 430, 742, "letters_L", "letters_R", ""),
    ("keystone at the top", 492, 537, "keystone_L_top", "keystone_R_top", ""),
    ("keystone at the bottom", 505, 525, "keystone_L_bot", "keystone_R_bot", ""),
]
X_L, X_R, SIDEWALK = 140, 890, 1180

# ---------------------------------------------------------------- model -> photo frame (uniform scale on the pilaster face plane)
rl, rr = feat["sidewalk_left"], feat["sidewalk_right"]
s = (X_R - X_L) / (rr[0] - rl[0]); ox = (X_R + X_L) / 2.0 - s * (rr[0] + rl[0]) / 2.0; oy = SIDEWALK - s * rl[1]
px_per_m = (rr[0] - rl[0]) * s / 4.66
def to_photo(p): return (s * p[0] + ox, s * p[1] + oy)
def crop_like_photo(im):
    x0, y0 = (0 - ox) / s, (0 - oy) / s; x1, y1 = (PW - ox) / s, (PH - oy) / s
    box = (int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1)))
    canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (140, 143, 150))
    part = im.crop((max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3])))
    canvas.paste(part, (max(0, box[0]) - box[0], max(0, box[1]) - box[1]))
    return canvas.resize((PW, PH), Image.LANCZOS)
panels = [("reference photo", photo), ("model (camera: %.1f m away, %.2f m high, %.0f mm)" % (cam.get("dist", 0), cam.get("height", 0), cam.get("lens", 0)), crop_like_photo(after))]

# ---------------------------------------------------------------- sheet layout
MARGIN_L, MARGIN_R, GAP, TOP, TABLE_H = 300, 330, 16, 60, 16 + 22 * len(PHOTO_W) + 30
W = MARGIN_L + 2 * PW + 3 * GAP + MARGIN_R; H = TOP + PH + TABLE_H + 40
sheet = Image.new("RGB", (W, H), (22, 24, 28)); d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype("arialbd.ttf", 24); fs = ImageFont.truetype("arial.ttf", 17); fb = ImageFont.truetype("arialbd.ttf", 17)
except Exception: font = fs = fb = ImageFont.load_default()
xs = []; x = MARGIN_L + GAP
for title, im in panels:
    sheet.paste(im, (x, TOP)); d.text((x + 6, 18), title, fill=(255, 255, 255), font=font); xs.append(x); x += PW + GAP
RED, YEL, ORA, GRY = (255, 60, 60), (255, 230, 60), (255, 150, 40), (170, 170, 170)

def place_labels(items, min_gap=21):
    """items: list of (y, ...) sorted by y -> label rows pushed apart so they never overlap."""
    rows = []; last = -1e9
    for it in items:
        y = max(it[0], last + min_gap); rows.append(y); last = y
    return rows

# ---------------------------------------------------------------- heights
hs = sorted(PHOTO_H, key=lambda e: e[1])
label_rows = place_labels([(TOP + e[1],) for e in hs])
for (label, y, key, tag), ly in zip(hs, label_rows):
    Y = TOP + y; col = ORA if tag == "rec" else (GRY if tag == "none" else RED)
    d.line([(xs[0], Y), (xs[-1] + PW, Y)], fill=col, width=2)
    d.line([(MARGIN_L - 8, ly), (xs[0], Y)], fill=col, width=1)
    txt = label + (" (recessed)" if tag == "rec" else "")
    d.text((MARGIN_L - 12 - d.textlength(txt, font=fs), ly - 10), txt, fill=col, font=fs)
    if key is None:
        d.text((xs[1] + PW + 10, ly - 10), "not built", fill=GRY, font=fs); continue
    ym = to_photo(feat[key])[1]; Ym = TOP + ym
    for xx in range(xs[1], xs[1] + PW, 22): d.line([(xx, Ym), (xx + 11, Ym)], fill=YEL, width=3)
    d.line([(xs[1] + PW, Ym), (xs[1] + PW + 8, ly)], fill=YEL, width=1)
    dz = (y - ym) / px_per_m
    d.text((xs[1] + PW + 10, ly - 10), "%+.2f m" % dz, fill=YEL, font=fb)

# ---------------------------------------------------------------- widths (vertical lines through the band-to-plinth zone, table underneath)
y_top, y_bot = TOP + 380, TOP + 1190
for label, xl, xr, fl, fr, tag in PHOTO_W:
    col = ORA if tag == "rec" else RED
    for px in (xl, xr):
        for panel_x in xs:
            for yy in range(y_top, y_bot, 14): d.line([(panel_x + px, yy), (panel_x + px, yy + 7)], fill=col, width=2)
    for k in (fl, fr):
        xm = to_photo(feat[k])[0]
        for yy in range(y_top, y_bot, 22): d.line([(xs[1] + xm, yy), (xs[1] + xm, yy + 11)], fill=YEL, width=3)
ty = TOP + PH + 16
d.text((MARGIN_L + GAP, ty), "widths (photo columns -> model, offsets model minus photo, + = further right)", fill=(255, 255, 255), font=fb)
for i, (label, xl, xr, fl, fr, tag) in enumerate(PHOTO_W):
    xml, xmr = to_photo(feat[fl])[0], to_photo(feat[fr])[0]
    dl, dr = (xml - xl) / px_per_m, (xmr - xr) / px_per_m
    wp, wm = (xr - xl) / px_per_m, (xmr - xml) / px_per_m
    col = ORA if tag == "rec" else RED
    row = ty + 24 + 22 * i
    d.text((MARGIN_L + GAP, row), label + (" (recessed)" if tag == "rec" else ""), fill=col, font=fs)
    d.text((MARGIN_L + GAP + 330, row), "photo %4d .. %4d px  = %.2f m" % (xl, xr, wp), fill=col, font=fs)
    d.text((MARGIN_L + GAP + 700, row), "model %.2f m   left %+.2f m   right %+.2f m" % (wm, dl, dr), fill=YEL, font=fb)
leg = ("red = the photo's element (traced across both panels) | yellow = the model's position of the same element | offsets in metres at the pilaster face "
       "(%.0f px/m) | orange = elements on the recessed door plane, whose apparent size depends on the camera distance | grey = not built yet" % px_per_m)
d.text((MARGIN_L + GAP, H - 30), leg, fill=(230, 230, 230), font=fs)
sheet.save(out_p); print("sheet", sheet.size, "->", out_p)
