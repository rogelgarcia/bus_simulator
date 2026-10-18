# plan_options.py -- AI 642 phase 1: the top-view silhouette options of the Terra & Mar rebuild.
#
#   python -I plan_options.py        (system Python with numpy + Pillow; not Blender)
#
# The front is b8's (calibrate_references.py -> calibration.json): a 10.0 m front at the balcony edge with 0.64 m
# rounded corners, the two 0.83 m piers at +/-3.07 m, and 45-degree chamfers out to 13.5 m off-centre, 8.5 m behind
# the front (b8 reads 44.2 degrees, 11.8 m). b8 cannot see the sides or the rear, so they are OPTIONS:
#   A  mirrored octagon   -- short sides (5.0 m), rear chamfers and a 10 m rear mirroring the front; 27.0 x 22.0 m
#   B  squared rear       -- straight sides running back to square (rounded) rear corners;           27.0 x 22.0 m
#   C  rounded rear       -- short sides, then an elliptical rear (the user's curved-face idea);      27.0 x 22.0 m
#   D  aerial             -- the only reference that sees anything behind the chamfer ends: the aerial's roof guard turns
#                            inward ~12 degrees right behind them, with the street visible beyond it (rectified points,
#                            least-squares line); a 0.7 m side, then that line to x = +/-4 and a straight rear;
#                            27.0 x ~11 m (the tower behind the front balconies is then ~8 m deep)
#   E  long rear chamfers -- CHOSEN by the user (annotated top views, 2026-10-12, "more aligned to the aerial view"): A
#                            with longer rear chamfers -- equal front chamfers, equal 5 m sides, the rear chamfers run on
#                            at 45 degrees until the rear face is as short as a side (5 m; the first sketch's sharp point
#                            was rejected), every corner rounded like the side corners; 27.0 x 24.5 m
# Every option shares one balcony-edge line = podium outline = roof edge (the uniform 1.5 m balcony depth, user
# 2026-10-12), with the tower wall / glazing line 1.5 m inside it. The 22 m depth of A-C matches the game footprint.
#
# Writes rebuild/terramar_plan_options.json (dense outlines per option, key dimensions, shared items) and, under
# tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/, one dimensioned top view per option and a sheet.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

OUT = os.path.join(C.ROOT, "tests", "artifacts", "screens", "buildings", C.BUILDING_ID, "rebuild", "plan")
CAL = os.path.join(OUT, "calibration.json")
PLAN_OPTIONS = BP.script('terramar/building/rebuild/terramar_plan_options.json')

Y_FRONT = -11.0          # balcony edge / podium front (the game's podium front)
FRONT_HALF = 5.0         # b8: 5.01
END_HALF = 13.5          # b8: 13.51
CHAMFER_DEPTH = 8.5      # 45 degrees: END_HALF - FRONT_HALF
R_FRONT = 0.64           # b8 front corner radius at the balcony edge
R_SIDE = 1.0             # chamfer-to-side corners (b8's outer bay end reads about 1 m)
R_REAR = R_SIDE          # option E's rear corners: the same curvature as the other connections (user, 2026-10-12)
BALCONY = 1.5            # uniform balcony depth (wall line inside the balcony edge)
DEPTH = 22.0             # options A-C: the game's podium depth
PIERS = [(-3.485, -2.655), (2.655, 3.485)]       # front piers on the wall line (b8: 0.83 m at +/-3.07)
ENTRANCE = {"half_width": 3.45, "projection": 1.15}  # b8: 6.9 m wide; spec: 1.15 m
PENTHOUSE = {"x": [-5.0, 5.0], "y": [-2.25, 5.25]}   # the game's 10 x 7.5 m, shifted to the rear (undecided)
PENTHOUSE_D = {"x": [-5.5, 5.5], "y": [-4.0, 0.1]}    # the aerial's: ~11 m wide, front wall ~7 m behind the roof front
D_REAR_HALF = 4.0                                     # option D: the straight rear's half-width


def fillet(p_prev, p, p_next, r, n=12):
    """Points of a circular fillet of radius r replacing the sharp corner p (polygon order p_prev -> p -> p_next)."""
    a, b = np.subtract(p_prev, p), np.subtract(p_next, p)
    la, lb = np.linalg.norm(a), np.linalg.norm(b)
    a, b = a / la, b / lb
    ang = math.acos(max(-1.0, min(1.0, float(a @ b))))
    t = r / math.tan(ang / 2)
    t = min(t, la * 0.49, lb * 0.49)
    r = t * math.tan(ang / 2)
    p1, p2 = np.asarray(p) + a * t, np.asarray(p) + b * t
    bis = (a + b) / np.linalg.norm(a + b)
    centre = np.asarray(p) + bis * (r / math.sin(ang / 2))
    a1 = math.atan2(*(p1 - centre)[::-1])
    a2 = math.atan2(*(p2 - centre)[::-1])
    da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
    return [tuple(centre + r * np.array([math.cos(a1 + da * i / n), math.sin(a1 + da * i / n)])) for i in range(n + 1)]


def rounded(poly, radii):
    out = []
    for i, p in enumerate(poly):
        r = radii[i]
        if r <= 0:
            out.append(tuple(p))
        else:
            out += fillet(poly[i - 1], p, poly[(i + 1) % len(poly)], r)
    return out


def front_half_path():
    """Front corner points shared by all options: front-left .. front-right, then the chamfer ends (sharp)."""
    return [(-FRONT_HALF, Y_FRONT), (FRONT_HALF, Y_FRONT), (END_HALF, Y_FRONT + CHAMFER_DEPTH), (-END_HALF, Y_FRONT + CHAMFER_DEPTH)]


def option_outline(key, rear_line):
    """Sharp corner polygon (dense points along curves), the fillet radius at each corner (0 = none) and key dimensions."""
    fl, fr, er, el = front_half_path()
    y_end = Y_FRONT + CHAMFER_DEPTH
    y_rear = Y_FRONT + DEPTH
    if key == "A":       # mirrored octagon
        side = DEPTH - 2 * CHAMFER_DEPTH
        poly = [fl, fr, er, (END_HALF, y_end + side), (FRONT_HALF, y_rear), (-FRONT_HALF, y_rear), (-END_HALF, y_end + side), el]
        radii = [R_FRONT, R_FRONT, R_SIDE, R_SIDE, R_FRONT, R_FRONT, R_SIDE, R_SIDE]
        return poly, radii, {"side_m": side, "rear_m": 2 * FRONT_HALF}
    if key == "B":       # squared rear
        poly = [fl, fr, er, (END_HALF, y_rear), (-END_HALF, y_rear), el]
        radii = [R_FRONT, R_FRONT, R_SIDE, R_SIDE, R_SIDE, R_SIDE]
        return poly, radii, {"side_m": DEPTH - CHAMFER_DEPTH, "rear_m": 2 * END_HALF}
    if key == "C":       # rounded rear: short sides, then a half ellipse
        side = 5.0
        y_s = y_end + side
        ellipse = [(END_HALF * math.cos(t), y_s + (y_rear - y_s) * math.sin(t)) for t in np.linspace(0, math.pi, 48)]
        poly = [fl, fr, er] + ellipse + [el]
        radii = [R_FRONT, R_FRONT, R_SIDE] + [0.0] * len(ellipse) + [R_SIDE]
        return poly, radii, {"side_m": side, "rear_arc_depth_m": y_rear - y_s}
    if key == "E":       # the user's sketches: A's rear chamfers run on until the rear face is as short as a side
        side = DEPTH - 2 * CHAMFER_DEPTH
        y_s = y_end + side
        rear_half = side / 2
        y_r = y_s + (END_HALF - rear_half)
        poly = [fl, fr, er, (END_HALF, y_s), (rear_half, y_r), (-rear_half, y_r), (-END_HALF, y_s), el]
        radii = [R_FRONT, R_FRONT, R_SIDE, R_SIDE, R_REAR, R_REAR, R_SIDE, R_SIDE]
        return poly, radii, {"side_m": side, "rear_chamfer_m": (END_HALF - rear_half) * math.sqrt(2), "rear_m": side}
    if key == "D":       # aerial: a short side, then the rectified rear guard line to x = +/-4, then a straight rear
        a, b = rear_line
        line = lambda x: a + b * abs(x)  # noqa: E731
        poly = [fl, fr, er, (END_HALF, line(END_HALF)), (D_REAR_HALF, line(D_REAR_HALF)), (-D_REAR_HALF, line(D_REAR_HALF)),
                (-END_HALF, line(END_HALF)), el]
        radii = [R_FRONT, R_FRONT, R_SIDE, R_SIDE, 2.0, 2.0, R_SIDE, R_SIDE]
        return poly, radii, {"rear_edges_deg": math.degrees(math.atan(-b)), "depth_m": line(D_REAR_HALF) - Y_FRONT}
    raise KeyError(key)


def aerial_rear_line(cal):
    """Least-squares y = a + b|x| through both rectified aerial rear guard lines (mirrored onto one side)."""
    pts = [p for side in cal["aerial"]["rectified"].values() for p in side["plan_points"]]
    x = np.array([abs(p[0]) for p in pts])
    y = np.array([p[1] for p in pts])
    b, a = np.polyfit(x, y, 1)
    return float(a), float(b)


def inset(poly, d):
    """Inward offset of a convex closed polyline (dense curves) by d, mitred at sharp corners."""
    pts = np.asarray(poly, dtype=float)
    n = len(pts)
    cen = pts.mean(axis=0)
    normals = []
    for i in range(n):
        e = pts[(i + 1) % n] - pts[i]
        nn = np.array([e[1], -e[0]]) / (np.linalg.norm(e) + 1e-12)
        if nn @ ((pts[i] + pts[(i + 1) % n]) / 2 - cen) < 0:
            nn = -nn
        normals.append(nn)
    out = []
    for i in range(n):
        na, nb = normals[i - 1], normals[i]
        m = (na + nb) / (1.0 + float(na @ nb))
        out.append(tuple(pts[i] - m * d))
    return out


def dedupe(poly, eps=1e-4):
    out = []
    for p in poly:
        if not out or math.dist(out[-1], p) > eps:
            out.append(p)
    if math.dist(out[0], out[-1]) <= eps:
        out.pop()
    return out


def game_outlines():
    pod = [(7, -11), (-7, -11), (-14, -4), (-14, 4), (-7, 11), (7, 11), (14, 4), (14, -4)]
    res = [(6.4, -9.5), (-6.4, -9.5), (-12.5, -3.4), (-12.5, 3.4), (-6.4, 9.5), (6.4, 9.5), (12.5, 3.4), (12.5, -3.4)]
    return pod, res


def font(size, bold=False):
    for f in ((BP.font_path("segoeuib.ttf") if bold else BP.font_path("segoeui.ttf")), BP.font_path("arial.ttf")):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def draw_option(key, label, outline, wall, dims, cal, penthouse, scale=26, pad=70):
    top_y, bottom_y = 17.5, -13.5                  # plan y range drawn
    w, h = int(34 * scale + 2 * pad), int((top_y - bottom_y) * scale + 2 * pad + 90)
    im = Image.new("RGB", (w, h), (250, 249, 246))
    d = ImageDraw.Draw(im, "RGBA")
    ox, oy = w / 2, pad + 90                       # plan +y (rear) drawn upward, front at the bottom
    to = lambda p: (ox + p[0] * scale, oy + (top_y - p[1]) * scale)  # noqa: E731
    for g in range(-16, 17, 2):                    # 2 m grid
        d.line([to((g, -13)), to((g, 17))], fill=(0, 0, 0, 18))
    for g in range(-13, 18, 2):
        d.line([to((-16, g)), to((16, g))], fill=(0, 0, 0, 18))
    pod, res = game_outlines()
    d.polygon([to(p) for p in pod], outline=(150, 150, 150))
    d.polygon([to(p) for p in res], outline=(190, 190, 190))
    d.polygon([to(p) for p in outline], fill=(214, 200, 182, 255), outline=(60, 50, 40))
    d.polygon([to(p) for p in wall], fill=(236, 230, 220, 255), outline=(120, 100, 80))
    e = ENTRANCE
    d.rectangle([to((-e["half_width"], Y_FRONT)), to((e["half_width"], Y_FRONT - e["projection"]))][::1], fill=(170, 150, 120, 255))
    for x0, x1 in PIERS:
        d.rectangle([to((x0, Y_FRONT + BALCONY + 0.06)), to((x1, Y_FRONT + BALCONY - 0.10))], fill=(90, 80, 70))
    ph = penthouse
    pts = [to((ph["x"][0], ph["y"][0])), to((ph["x"][1], ph["y"][0])), to((ph["x"][1], ph["y"][1])), to((ph["x"][0], ph["y"][1]))]
    for a, b in zip(pts, pts[1:] + pts[:1]):
        d.line([a, b], fill=(180, 60, 60, 160), width=2)
    # aerial rear edges (rectified), for reference
    for side in cal["aerial"]["rectified"].values():
        d.line([to(p) for p in side["plan_points"]], fill=(0, 150, 220, 220), width=3)
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    width, depth = max(xs) - min(xs), max(ys) - min(ys)
    f = font(16)
    fb = font(26, True)
    d.text((pad, 18), f"Option {key} -- {label}", fill=(30, 30, 30), font=fb)
    meta = f"{width:.1f} m wide x {depth:.1f} m deep (balcony edge = podium = roof)   |   tower wall line 1.5 m inside   |   " + \
        ", ".join(f"{k} {v:.1f}" for k, v in dims.items())
    d.text((pad, 56), meta, fill=(60, 60, 60), font=f)
    d.text((pad, h - 30), "front (b8) at the bottom | grey: game podium and tower | cyan: aerial rear edges (rectified) | red dashed: penthouse (undecided) | 2 m grid",
           fill=(90, 90, 90), font=font(14))
    # dimension: front and width
    d.line([to((-FRONT_HALF, Y_FRONT - 2.2)), to((FRONT_HALF, Y_FRONT - 2.2))], fill=(30, 30, 30), width=2)
    d.text(to((-1.4, Y_FRONT - 2.4)), f"front {2 * FRONT_HALF:.1f} m", fill=(30, 30, 30), font=f)
    d.line([to((-END_HALF, max(ys) + 0.5)), to((END_HALF, max(ys) + 0.5))], fill=(30, 30, 30), width=1)
    d.text(to((-1.2, max(ys) + 1.4)), f"{width:.1f} m", fill=(30, 30, 30), font=f)
    return im


def main():
    cal = C.load_json(CAL)
    rear_line = aerial_rear_line(cal)
    labels = {"A": "mirrored octagon", "B": "squared rear", "C": "rounded rear", "D": "aerial (shallow)", "E": "long rear chamfers (chosen)"}
    options = {}
    images = []
    for key in "ABCDE":
        poly, radii, dims = option_outline(key, rear_line)
        penthouse = PENTHOUSE_D if key == "D" else PENTHOUSE
        outline = dedupe(rounded(poly, radii))
        # the wall line: the SHARP polygon offset 1.5 m, then rounded concentrically (never offset a fillet tighter than
        # the offset -- it folds into swallowtails); at least 0.25 m so the glazing corners stay soft
        wall = dedupe(rounded(inset(poly, BALCONY), [max(r - BALCONY, 0.25) if r > 0 else 0.0 for r in radii]))
        options[key] = {"label": labels[key], "balcony_edge": [[round(x, 4), round(y, 4)] for x, y in outline],
                        "wall_line": [[round(x, 4), round(y, 4)] for x, y in wall], "dims_m": {k: round(v, 3) for k, v in dims.items()},
                        "penthouse_optional": penthouse}
        im = draw_option(key, labels[key], outline, wall, dims, cal, penthouse)
        path = os.path.join(OUT, f"plan_option_{key}.png")
        im.save(path)
        images.append(im)
    data = {
        "comment": "AI 642 phase 1 silhouette options (Blender frame, metres; front faces -Y). balcony_edge = podium outline = roof edge; wall_line = tower wall / glazing line 1.5 m inside. Approve one -> terramar_plan.json.",
        "source": {"calibration": os.path.relpath(CAL, C.ROOT).replace("\\", "/")},
        "front": {"y_front": Y_FRONT, "front_half": FRONT_HALF, "end_half": END_HALF, "chamfer_depth": CHAMFER_DEPTH,
                  "corner_radius_front": R_FRONT, "corner_radius_side": R_SIDE, "balcony_depth": BALCONY,
                  "piers_on_wall_line": PIERS, "entrance": ENTRANCE},
        "levels_m": {"street": 0.0, "podium_top": round(cal["levels_m"]["podium_top_m"], 2),
                     "ground_floor_top": round(cal["levels_m"]["ground_floor_m"], 2), "storey": cal["levels_m"]["storey_m"],
                     "residential_floors": 5, "roof_slab_top": round(cal["levels_m"]["roof_slab_top_m"], 2),
                     "slab_edge": round(cal["levels_m"]["slab_edge_m"], 2), "roof_edge": round(cal["levels_m"]["roof_edge_m"], 2)},
        "aerial_rear_line": {"y_at_x0": round(rear_line[0], 3), "slope_per_abs_x": round(rear_line[1], 4),
                             "comment": "least-squares y = a + b|x| through the rectified aerial rear roof-guard points (option D)"},
        "options": options,
    }
    with open(PLAN_OPTIONS, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=2)
    w = max(i.width for i in images)
    rows = (len(images) + 1) // 2
    sheet = Image.new("RGB", (w * 2 + 20, images[0].height * rows + 20 * (rows - 1)), (255, 255, 255))
    for k, im in enumerate(images):
        sheet.paste(im, ((k % 2) * (w + 20), (k // 2) * (im.height + 20)))
    sheet.save(os.path.join(OUT, "plan_options_sheet.png"))
    print("PLAN OPTIONS", {k: (round(max(p[0] for p in v["balcony_edge"]) - min(p[0] for p in v["balcony_edge"]), 2),
                               round(max(p[1] for p in v["balcony_edge"]) - min(p[1] for p in v["balcony_edge"]), 2)) for k, v in options.items()})


if __name__ == "__main__":
    main()
