"""Compose the portal render over a reference photo so differences stand out, and draw proportion arrows.

    python overlay_compose.py PHOTO OUT.png [--alpha 0.5] [--no-arrows]

Uses overlay_surfaces.png, overlay_lines.png and overlay_features.json from
overlay_portal.py. The render is aligned on the photo by the pilaster shafts'
outer edges (horizontal scale + centre) and the sidewalk line (vertical
offset), uniform scale.

Treatment: both images become edge-emphasised, tinted layers, the photo in
cyan and the model in orange, blended 50/50 (--alpha) where the model has
pixels; where the two agree the tints cancel to a neutral grey, where they
disagree the colour shows which one is where. On top, solid edges: the
model's silhouette and crease lines (Freestyle pass minus surfaces pass) in
magenta, 3 px, and the photo's detected edges in cyan. The photo's measured
feature pixels are the PHOTO_PX table; each arrow goes from where the model
has a feature to where the photo has it.
"""
import sys, os, json, argparse, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument("photo"); ap.add_argument("out")
ap.add_argument("--alpha", type=float, default=0.5, help="weight of the model layer in the blend (0..1)")
ap.add_argument("--no-arrows", action="store_true")
ap.add_argument("--overlay_dir", default=None)
args = ap.parse_args()

HERE = os.path.dirname(os.path.abspath(__file__))
OVD = args.overlay_dir or os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", "..", "tests", "artifacts", "screens", "bradbury_fix", "portal_project", "overlay"))
feat = json.load(open(os.path.join(OVD, "overlay_features.json")))["features"]
surf = Image.open(os.path.join(OVD, "overlay_surfaces.png")).convert("RGBA")
lines = Image.open(os.path.join(OVD, "overlay_lines.png")).convert("RGBA")
photo = Image.open(args.photo).convert("RGBA")
PW, PH = photo.size

# ---------------------------------------------------------------- photo features (pixels) for the user's frontal photo (1080 x 1440)
PHOTO_PX = {
    "pilaster_L_outer": 140, "pilaster_R_outer": 890, "pilaster_L_inner": 255, "pilaster_R_inner": 775,
    "sidewalk": 1172, "spring": 800, "arch_apex": 590, "keystone_top": 500, "keystone_bottom": 590,
    "band_bottom": 500, "band_top": 395, "capital_bottom": 590, "capital_top": 500,
    "cornice_top": 300, "dentils_top": 340, "strips_crown": 562,
}
rl, rr = feat["sidewalk_left"], feat["sidewalk_right"]
s = (PHOTO_PX["pilaster_R_outer"] - PHOTO_PX["pilaster_L_outer"]) / (rr[0] - rl[0])
ox = (PHOTO_PX["pilaster_R_outer"] + PHOTO_PX["pilaster_L_outer"]) / 2.0 - s * (rr[0] + rl[0]) / 2.0
oy = PHOTO_PX["sidewalk"] - s * rl[1]
def to_photo(p): return (s * p[0] + ox, s * p[1] + oy)
px_per_m = (rr[0] - rl[0]) * s / 4.66
def metres(dpx): return dpx / px_per_m

def warp(im):
    w2, h2 = int(round(im.width * s)), int(round(im.height * s))
    im2 = im.resize((w2, h2), Image.LANCZOS)
    canvas = Image.new("RGBA", (PW, PH), (0, 0, 0, 0)); canvas.paste(im2, (int(round(ox)), int(round(oy)))); return canvas
S2, L2 = warp(surf), warp(lines)

# ---------------------------------------------------------------- tinted, edge-emphasised layers
def emphasise(gray):
    g = ImageOps.autocontrast(gray, cutoff=1)
    return g.filter(ImageFilter.EDGE_ENHANCE_MORE)
p_gray = emphasise(photo.convert("L"))
photo_tint = ImageOps.colorize(p_gray, black=(0, 30, 50), white=(140, 235, 255)).convert("RGBA")      # photo in cyan
m_alpha = S2.split()[3]
m_gray = emphasise(S2.convert("L"))
model_tint = ImageOps.colorize(m_gray, black=(60, 20, 0), white=(255, 200, 90)).convert("RGBA")       # model in orange
a = m_alpha.point(lambda v: int(v * args.alpha)); model_tint.putalpha(a)
out = Image.alpha_composite(photo_tint, model_tint)

# ---------------------------------------------------------------- solid edges: model lines (lines pass minus surfaces pass), photo edges
diff = ImageChops.difference(L2.convert("RGB"), S2.convert("RGB")).convert("L")
line_mask = diff.point(lambda v: 255 if v > 28 else 0).filter(ImageFilter.MaxFilter(3))
magenta = Image.new("RGBA", (PW, PH), (255, 40, 230, 255)); magenta.putalpha(line_mask)
edges = photo.convert("L").filter(ImageFilter.GaussianBlur(1.0)).filter(ImageFilter.FIND_EDGES)
edge_mask = edges.point(lambda v: 255 if v > 34 else 0).filter(ImageFilter.MaxFilter(3))
cyan = Image.new("RGBA", (PW, PH), (0, 245, 255, 255)); cyan.putalpha(edge_mask.point(lambda v: int(v * 0.85)))
out = Image.alpha_composite(out, cyan)
out = Image.alpha_composite(out, magenta)

# ---------------------------------------------------------------- arrows: model feature -> photo feature
d = ImageDraw.Draw(out)
try: font = ImageFont.truetype("arialbd.ttf", 20); font_s = ImageFont.truetype("arial.ttf", 16)
except Exception: font = font_s = ImageFont.load_default()
def arrow(p0, p1, color, label, side="right", label_dy=0):
    x0, y0 = p0; x1, y1 = p1
    d.line([p0, p1], fill=color, width=5)
    ang = math.atan2(y1 - y0, x1 - x0); L = 18
    for da in (2.6, -2.6):
        d.line([(x1, y1), (x1 + L * math.cos(ang + da), y1 + L * math.sin(ang + da))], fill=color, width=5)
    d.ellipse([x0 - 6, y0 - 6, x0 + 6, y0 + 6], fill=color)
    tx = x1 + 12 if side == "right" else x1 - 12 - d.textlength(label, font=font)
    ty = (y0 + y1) / 2 - 12 + label_dy
    bb = d.textbbox((tx, ty), label, font=font); d.rectangle([bb[0] - 4, bb[1] - 3, bb[2] + 4, bb[3] + 3], fill=(0, 0, 0, 210))
    d.text((tx, ty), label, fill=color, font=font)
RED, YEL, WHT = (255, 70, 70, 255), (255, 225, 60, 255), (255, 255, 255, 255)
ms = lambda k: to_photo(feat[k])
def move(name, key, dx_off, dy_off, axis, color, label, side="right", min_m=0.05, label_dy=0):
    p = ms(name); x0, y0 = p[0] + dx_off, p[1] + dy_off
    if axis == "y": x1, y1 = x0, PHOTO_PX[key]
    else: x1, y1 = PHOTO_PX[key], y0
    dpx = (y1 - y0) if axis == "y" else (x1 - x0)
    m = abs(metres(dpx))
    if m < min_m: return
    if axis == "y": word = "down" if dpx > 0 else "up"
    else: word = "in" if (dpx > 0) == (x0 < PW / 2) else "out"
    arrow((x0, y0), (x1, y1), color, "%s %s %.2f m" % (label, word, m), side=side, label_dy=label_dy)
if not args.no_arrows:
    move("band_top", "band_top", -120, 0, "y", RED, "band top")
    move("capital_bottom_L", "capital_bottom", 0, 0, "y", RED, "capital bottom", side="right")
    move("pilaster_L_inner_top", "pilaster_L_inner", 0, 150, "x", YEL, "pilaster inner edge", side="right", label_dy=-30)
    move("pilaster_R_inner_top", "pilaster_R_inner", 0, 150, "x", YEL, "pilaster inner edge", side="left", label_dy=30)
    move("spandrel_top", "keystone_top", 60, 0, "y", WHT, "keystone / spandrel top")
    move("arch_spring_L", "spring", -30, 0, "y", WHT, "spring line", side="right")
    move("strips_crown", "strips_crown", -60, 0, "y", WHT, "outer ring", side="left")
    xb = PHOTO_PX["pilaster_L_outer"] - 30
    d.line([(xb, PHOTO_PX["cornice_top"]), (xb, PHOTO_PX["band_top"])], fill=RED, width=4)
    for yy in (PHOTO_PX["cornice_top"], PHOTO_PX["band_top"]): d.line([(xb - 10, yy), (xb + 10, yy)], fill=RED, width=4)
    lab = "missing above the band: dentils + cornice, %.2f m" % metres(PHOTO_PX["band_top"] - PHOTO_PX["cornice_top"])
    ty = (PHOTO_PX["cornice_top"] + PHOTO_PX["band_top"]) / 2 - 10
    bb = d.textbbox((xb + 16, ty), lab, font=font); d.rectangle([bb[0] - 4, bb[1] - 3, bb[2] + 4, bb[3] + 3], fill=(0, 0, 0, 210))
    d.text((xb + 16, ty), lab, fill=RED, font=font)
leg = "cyan = photo (edges bright cyan) | orange = model at %d%% (edges magenta) | grey = agreement | arrows: model -> photo (%.0f px/m)" % (int(args.alpha * 100), px_per_m)
bb = d.textbbox((10, PH - 34), leg, font=font_s); d.rectangle([bb[0] - 4, bb[1] - 3, bb[2] + 4, bb[3] + 3], fill=(0, 0, 0, 210)); d.text((10, PH - 34), leg, fill=WHT, font=font_s)
out.convert("RGB").save(args.out)
print("scale px/m", round(px_per_m, 1), "->", args.out)
