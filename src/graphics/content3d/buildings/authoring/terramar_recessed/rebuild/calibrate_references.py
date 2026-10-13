# calibrate_references.py -- AI 642 phase 1: measure the front from b8.png and rectify the aerial's roof outline.
#
#   python -I calibrate_references.py        (system Python with numpy + Pillow; not Blender)
#
# Inputs: the picked image points in reference_points.json (b8.png and aerial-unannotated.png pixel coordinates,
# read on gridded crops; each point says what it is). Outputs, under
# tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/:
#   - calibration.json: the b8 camera (horizon, focal length, distances), the front-plane measurements in metres,
#     the chamfer estimate, the level heights, the aerial roof-plane homography and the rectified side edges;
#   - b8_calibration_overlay.png, aerial_rectified_overlay.png: what was measured, drawn on the images.
#
# Method (memory "measure camera match, not overlay"):
#   b8: an eye-height camera with vertical verticals (lens shift) facing the front. The front face is parallel to the
#   image, so ratios on it are true proportions; the scale is the residential storey (3.35 m, the spec; b8's own
#   centre bay then reads 5.3 m against the spec's 5.5 m). The horizon is the pedestrians' eye line. The chamfer slab
#   lines meet the horizon at the vanishing point x_v; for a chamfer at angle t to the front, f * cot(t) = x_v - cx.
#   The storey pitch at the chamfer's far end against the front gives that end's depth ratio, so the chamfer angle
#   and length follow (checked against the 45-degree assumption).
#   aerial: four roof-slab corners whose plan positions come from the b8 front (front corners, front-chamfer ends)
#   define the roof-plane homography (plan -> image); the picked points along the side edges, mapped back through
#   it, give the sides' plan direction and visible extent.
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
POINTS = os.path.join(HERE, "reference_points.json")


def font(size):
    for f in ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def homography(src, dst):
    """DLT: 3x3 H with dst ~ H @ src (points as (x, y))."""
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        rows.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, vt = np.linalg.svd(np.asarray(rows, dtype=float))
    h = vt[-1].reshape(3, 3)
    return h / h[2, 2]


def apply(h, pts):
    pts = np.asarray(pts, dtype=float)
    q = np.c_[pts, np.ones(len(pts))] @ h.T
    return q[:, :2] / q[:, 2:3]


def project(cam, pts):
    """Pinhole camera at (0, y, z) looking along +y, pitched down by `pitch` degrees, principal point at the centre."""
    y_c, z_c, pitch, f, w, h = cam
    t = math.radians(pitch)
    fwd = np.array([0.0, math.cos(t), -math.sin(t)])
    up = np.array([0.0, math.sin(t), math.cos(t)])
    out = []
    for p in pts:
        d = np.asarray(p, dtype=float) - np.array([0.0, y_c, z_c])
        zc = d @ fwd
        out.append((w / 2 + f * d[0] / zc, h / 2 - f * (d @ up) / zc))
    return np.asarray(out)


def fit_aerial_camera(plan_corners, img_corners, roof_z, size):
    """Least-squares camera (distance, height, pitch, focal) that puts the roof corners where the aerial shows them."""
    w, h = size
    pts = [(x, y, roof_z) for x, y in plan_corners]
    target = np.asarray(img_corners, dtype=float)
    best = None
    for y_c in np.arange(-120, -20, 4.0):
        for z_c in np.arange(40, 160, 4.0):
            for pitch in np.arange(25, 70, 2.5):
                for f in (900, 1100, 1300, 1500, 1800, 2200, 2700):
                    err = float(np.abs(project((y_c, z_c, pitch, f, w, h), pts) - target).mean())
                    if best is None or err < best[0]:
                        best = (err, [y_c, z_c, pitch, f])
    x = np.array(best[1], dtype=float)
    steps = np.array([2.0, 2.0, 1.0, 50.0])
    for _ in range(60):                     # coordinate descent refinement
        improved = False
        for i in range(4):
            for sgn in (1, -1):
                x2 = x.copy()
                x2[i] += sgn * steps[i]
                e2 = float(np.abs(project((*x2, w, h), pts) - target).mean())
                if e2 < best[0]:
                    best, x, improved = (e2, list(x2)), x2, True
        if not improved:
            steps /= 2
    y_c, z_c, pitch, f = x
    return {"location": [0.0, round(y_c, 2), round(z_c, 2)], "pitch_down_deg": round(pitch, 2), "focal_px": round(f, 1),
            "vfov_deg": round(math.degrees(2 * math.atan(h / 2 / f)), 2), "resolution": [w, h], "mean_error_px": round(best[0], 2)}


def main():
    P = C.load_json(POINTS)
    b8 = P["b8"]
    os.makedirs(OUT, exist_ok=True)
    W, H = b8["image_size"]
    cx = W / 2.0
    y_h = float(np.mean(b8["horizon_heads_y"]))
    storey_m = P["scale"]["storey_m"]
    bands = b8["front_band_bottoms_y"]
    pitch = float(np.mean(np.diff(sorted(bands))))
    px_per_m = pitch / storey_m                                   # on the front (pier) plane
    # vanishing point of the right chamfer on the horizon, from each picked chamfer line
    vps = []
    for (x0, y0), (x1, y1) in b8["right_chamfer_lines"]:
        s = (y1 - y0) / (x1 - x0)
        vps.append(x0 + (y_h - y0) / s)
    x_v = float(np.median(vps))
    f_cot = x_v - cx
    # chamfer far end: storey pitch there -> depth ratio
    far_pitch = float(np.mean(np.diff(sorted(b8["far_end_rail_y"]))))
    ratio = pitch / far_pitch
    # solve f, chamfer angle self-consistently: Z_t = f / px_per_m is the distance of the measured bands; the front corner
    # (balcony edge) sits front_setback_m nearer (0: the approved plan's flat front)
    proj = P["scale"].get("front_setback_m", P["scale"]["balcony_projection_m"])
    x_corner, x_far = b8["front_corner_x"], b8["far_end_x"]
    best = None
    for t_deg in np.arange(30.0, 60.01, 0.05):
        f = f_cot * math.tan(math.radians(t_deg))
        zt = f / px_per_m
        zc = zt - proj
        zf = zt * ratio
        xc = (x_corner - cx) * zc / f
        xf = (x_far - cx) * zf / f
        t_geo = math.degrees(math.atan2(zf - zc, xf - xc))
        err = abs(t_geo - t_deg)
        if best is None or err < best[0]:
            best = (err, t_deg, f, zt, zc, zf, xc, xf)
    _, t_deg, f, zt, zc, zf, xc, xf = best
    chamfer_len = math.hypot(xf - xc, zf - zc)
    piers = b8["front_piers_x"]
    m = lambda px: px / px_per_m  # noqa: E731
    front = {
        "pier_width_m": round(m(np.mean([p[1] - p[0] for p in piers])), 3),
        "pier_centres_m": [round(m((p[0] + p[1]) / 2 - cx), 3) for p in piers],
        "centre_bay_m": round(m(piers[1][0] - piers[0][1]), 3),
        "front_half_at_balcony_edge_m": round(xc, 3),
        "corner_radius_m": round(b8["corner_tangent_px"] / (f / zc) / math.tan(math.radians(t_deg / 2)), 3),
    }
    base_y, podium_top_y, roof_top_y = b8["base_y"], b8["podium_top_y"], b8["roof_top_y"]
    zp = zt - proj
    levels = {
        "storey_m": storey_m,
        "podium_top_m": round((base_y - podium_top_y) * zp / f, 3),
        "ground_floor_m": round((base_y - b8["upper_podium_floor_y"]) * zp / f, 3),
        "roof_slab_top_m": round((base_y - podium_top_y) * zp / f + (podium_top_y - roof_top_y) / px_per_m, 3),
        "slab_edge_m": round(b8["band_px"] / px_per_m, 3),
        "roof_edge_m": round(b8["roof_band_px"] / px_per_m, 3),
    }
    band_plane_y = P["scale"]["plan_front_y"] + proj
    cam = {"location": [0.0, round(band_plane_y - zt, 3), round((base_y - y_h) * zp / f, 3)], "band_plane_y": band_plane_y,
           "horizon_y": round(y_h, 1), "cx": cx, "focal_px": round(f, 1), "vfov_deg": round(math.degrees(2 * math.atan(H / 2 / f)), 2),
           "shift_y": round((y_h - H / 2) / H, 4), "pier_plane_distance_m": round(zt, 2),
           "camera_height_m": round((base_y - y_h) * zp / f, 3), "vanishing_x": round(x_v, 1), "vanishing_samples": [round(v, 1) for v in vps]}
    chamfer = {"angle_deg": round(t_deg, 2), "length_at_balcony_edge_m": round(chamfer_len, 2),
               "end_half_width_m": round(xf, 2), "end_depth_from_front_m": round(zf - zc, 2), "pitch_front_px": round(pitch, 2),
               "pitch_far_px": round(far_pitch, 2)}

    # aerial: homography from 4 roof corners (plan from the b8 front, chamfers at 45 degrees on the measured length)
    a = P["aerial"]
    half = front["front_half_at_balcony_edge_m"]
    dx, dy = chamfer_len * math.cos(math.radians(t_deg)), chamfer_len * math.sin(math.radians(t_deg))
    y_front = P["scale"]["plan_front_y"]
    plan_corners = [(-half, y_front), (half, y_front), (-(half + dx), y_front + dy), (half + dx, y_front + dy)]
    img_corners = [a["front_left"], a["front_right"], a["chamfer_end_left"], a["chamfer_end_right"]]
    h = homography(plan_corners, img_corners)
    hinv = np.linalg.inv(h)
    sides = {}
    for side in ("left_side_edge", "right_side_edge"):
        pts = apply(hinv, a[side])
        d = pts[-1] - pts[0]
        sides[side] = {"plan_points": [[round(p[0], 2), round(p[1], 2)] for p in pts],
                       "direction_deg_from_front": round(math.degrees(math.atan2(d[1], d[0])), 1),
                       "visible_length_m": round(float(np.linalg.norm(d)), 2)}
    rear = {}
    for k, v in a.get("rear_hints", {}).items():
        rear[k] = [round(c, 2) for c in apply(hinv, [v])[0]]
    aerial_camera = fit_aerial_camera(plan_corners, img_corners, levels["roof_slab_top_m"], a.get("image_size", [1122, 1402]))
    result = {"camera_b8": cam, "front_m": front, "chamfer": chamfer, "levels_m": levels,
              "aerial": {"plan_corners": plan_corners, "image_corners": img_corners, "rectified": sides, "rear_hints_plan": rear,
                         "camera": aerial_camera},
              "notes": P.get("notes", [])}
    with open(os.path.join(OUT, "calibration.json"), "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    # overlays
    im = Image.open(os.path.join(C.REFERENCES, "b8.png")).convert("RGB")
    d = ImageDraw.Draw(im, "RGBA")
    d.line([(0, y_h), (W, y_h)], fill=(255, 40, 40, 200), width=2)
    for y in bands:
        d.line([(430, y), (700, y)], fill=(40, 120, 255, 220), width=2)
    for p in piers:
        for x in p:
            d.line([(x, 250), (x, 840)], fill=(40, 200, 80, 220), width=2)
    for (x0, y0), (x1, y1) in b8["right_chamfer_lines"]:
        s = (y1 - y0) / (x1 - x0)
        d.line([(x0, y0), (W, y0 + s * (W - x0))], fill=(255, 160, 0, 200), width=2)
    d.line([(x_corner, 380), (x_corner, 560)], fill=(255, 0, 200, 220), width=2)
    d.line([(x_far, 380), (x_far, 880)], fill=(255, 0, 200, 220), width=2)
    for y in (base_y, podium_top_y, roof_top_y):
        d.line([(300, y), (820, y)], fill=(255, 255, 0, 200), width=2)
    d.rectangle([0, 0, W, 120], fill=(0, 0, 0, 170))
    fnt = font(17)
    d.text((10, 8), f"horizon y {y_h:.0f} | storey {pitch:.1f} px = {storey_m} m | VP x {x_v:.0f} | f {f:.0f} px | chamfer {t_deg:.1f} deg",
           fill=(255, 255, 255), font=fnt)
    d.text((10, 34), f"front half (balcony edge) {xc:.2f} m | chamfer {chamfer_len:.2f} m | end half-width {xf:.2f} m | piers {front['pier_centres_m']}",
           fill=(255, 255, 255), font=fnt)
    d.text((10, 60), f"podium top {levels['podium_top_m']} m | roof slab top {levels['roof_slab_top_m']} m | slab edge {levels['slab_edge_m']} m | camera {cam['camera_height_m']} m high, {zt:.1f} m from the piers",
           fill=(255, 255, 255), font=fnt)
    im.save(os.path.join(OUT, "b8_calibration_overlay.png"))

    ia = Image.open(os.path.join(C.REFERENCES, "aerial-unannotated.png")).convert("RGB")
    d = ImageDraw.Draw(ia, "RGBA")
    poly = [img_corners[0], img_corners[2], img_corners[3], img_corners[1]]
    for p in img_corners:
        d.ellipse([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6], outline=(255, 40, 40), width=3)
    for side in ("left_side_edge", "right_side_edge"):
        d.line([tuple(p) for p in a[side]], fill=(40, 200, 255, 230), width=3)
    # the plan grid (every 2 m) projected onto the roof plane
    for gx in np.arange(-16, 16.01, 2):
        q = apply(h, [(gx, y_front), (gx, y_front + 26)])
        d.line([tuple(q[0]), tuple(q[1])], fill=(255, 255, 255, 60), width=1)
    for gy in np.arange(y_front, y_front + 26.01, 2):
        q = apply(h, [(-16, gy), (16, gy)])
        d.line([tuple(q[0]), tuple(q[1])], fill=(255, 255, 255, 60), width=1)
    d.rectangle([0, 0, ia.width, 64], fill=(0, 0, 0, 170))
    d.text((10, 8), "roof plane rectified from 4 corners (red); side edges (cyan); 2 m plan grid", fill=(255, 255, 255), font=fnt)
    txt = " | ".join(f"{k}: {v['direction_deg_from_front']} deg, {v['visible_length_m']} m visible" for k, v in sides.items())
    d.text((10, 34), txt, fill=(255, 255, 255), font=fnt)
    ia.save(os.path.join(OUT, "aerial_rectified_overlay.png"))
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
