# b8_camera_fit.py -- AI 643: fit CAM_B8 to the approved plan's own geometry (system Python; used by make_plan.py).
#
# calibrate_references.py solves b8's camera together with the plan measurements, and that solve only closes if the
# centre bay sits 1.5 m behind the front corners. b8 itself shows the front flat: the slab bands and guard rails stand
# level on both sides of the right pilaster (2026-10-13 crop), which a 1.5 m step would raise by about 20 px. The step
# is b8's AI perspective, not architecture. So once the plan is fixed, the camera is fitted to the plan instead: a
# horizontal pinhole at x 0 (b8's verticals are vertical), the lens shift fixed by the horizon, and its distance,
# height and focal length found by least squares over the points picked on b8 (reference_points.json), each paired
# with the plan point it shows.
import math


def project(cam, x, y, z, cx, horizon_y):
    yc, zc, f = cam
    d = y - yc
    return cx + f * x / d, horizon_y - f * (z - zc) / d


def features(b8, plan):
    """(label, axis, picked pixel, plan point) for every feature the fit uses."""
    st = plan["structure"]
    slabs = {s["name"]: s for s in st["slabs"]}
    y_front = plan["markers"]["front_pilasters"][0]["y"][0]
    y_pilaster = y_front - st["pilasters"]["proud_m"]
    (l0, l1), (r0, r1) = [m["x"] for m in plan["markers"]["front_pilasters"]]
    corner_ab = plan["runs"]["sharp_corners"]["A/B"]
    corner_bc = plan["runs"]["sharp_corners"]["B/C"]
    lv = plan["levels_m"]
    out = []
    for (px0, px1), (x0, x1), name in zip(b8["front_piers_x"], [(l0, l1), (r0, r1)], ("left", "right")):
        out.append((f"pilaster {name} outer edge", "x", px0 if name == "left" else px1, (x0 if name == "left" else x1, y_pilaster, 15.0)))
        out.append((f"pilaster {name} inner edge", "x", px1 if name == "left" else px0, (x1 if name == "left" else x0, y_pilaster, 15.0)))
    out.append(("front corner A/B", "x", b8["front_corner_x"], (corner_ab[0], corner_ab[1], 15.0)))
    out.append(("chamfer end B/C", "x", b8["far_end_x"], (corner_bc[0], corner_bc[1], 15.0)))
    bands = sorted(b8["front_band_bottoms_y"])                     # top of the image first: floor 5 .. floor 2
    for py, name in zip(bands, ["floor5", "floor4", "floor3", "floor2"]):
        out.append((f"centre-bay band bottom {name}", "y", py, (0.0, y_front, slabs[name]["z"][0])))
    out.append(("podium top", "y", b8["podium_top_y"], (0.0, y_front, lv["podium_top"])))
    out.append(("roof slab top", "y", b8["roof_top_y"], (0.0, y_front, lv["roof_slab_top"])))
    out.append(("base", "y", b8["base_y"], (0.0, y_front, 0.0)))
    rails = sorted(b8["far_end_rail_y"])
    for py, name in zip(rails, ["floor5", "floor4", "floor3", "floor2"]):
        out.append((f"chamfer-end guard rail {name}", "y", py, (corner_bc[0], corner_bc[1], slabs[name]["z"][1] + GUARD_RAIL_M)))
    return out


GUARD_RAIL_M = 1.0          # guard top rail above the walking surface (AI 616: 0.96 m glass + the rail)


def errors(cam, feats, cx, horizon_y):
    out = []
    for label, axis, px, (x, y, z) in feats:
        u, v = project(cam, x, y, z, cx, horizon_y)
        out.append((label, (u if axis == "x" else v) - px))
    return out


def fit(b8, plan, start):
    """Least squares (grid, then coordinate descent) from start = (y, z, f); returns the camera and its residuals."""
    W, H = b8["image_size"]
    cx = W / 2.0
    horizon_y = sum(b8["horizon_heads_y"]) / len(b8["horizon_heads_y"])
    feats = features(b8, plan)
    cost = lambda cam: sum(e * e for _, e in errors(cam, feats, cx, horizon_y))  # noqa: E731
    best = None
    y0, z0, f0 = start
    for dy in range(-16, 17):
        for dz in range(-10, 11):
            for df in range(-20, 21):
                cam = (y0 + dy * 0.5, z0 + dz * 0.05, f0 + df * 10.0)
                c = cost(cam)
                if best is None or c < best[0]:
                    best = (c, cam)
    cam = list(best[1])
    steps = [0.25, 0.025, 5.0]
    for _ in range(200):
        improved = False
        for i in range(3):
            for sgn in (1, -1):
                trial = list(cam)
                trial[i] += sgn * steps[i]
                c = cost(trial)
                if c < best[0]:
                    best, cam, improved = (c, tuple(trial)), trial, True
        if not improved:
            steps = [s / 2 for s in steps]
            if steps[0] < 1e-4:
                break
    res = errors(cam, feats, cx, horizon_y)
    start_res = errors(start, feats, cx, horizon_y)
    rms = lambda r: math.sqrt(sum(e * e for _, e in r) / len(r))  # noqa: E731
    yc, zc, f = cam
    return {
        "location": [0.0, round(yc, 3), round(zc, 3)], "rotation_deg": [90.0, 0.0, 0.0], "focal_px": round(f, 1),
        "vfov_deg": round(math.degrees(2 * math.atan(H / 2 / f)), 2), "shift_y": round((horizon_y - H / 2) / H, 4),
        "resolution": [W, H],
        "fit": {"method": "least squares over the b8 picks, each paired with its plan point (b8_camera_fit.py)",
                "rms_px": round(rms(res), 2), "max_px": round(max(abs(e) for _, e in res), 2),
                "calibration_camera_rms_px": round(rms(start_res), 2),
                "residuals_px": {label: round(e, 1) for label, e in res}},
    }
