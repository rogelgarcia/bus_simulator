# make_plan.py -- AI 642: write the approved plan, rebuild/terramar_plan.json, the single source every layer script reads.
#
#   python -I make_plan.py        (system Python with numpy + Pillow; run plan_options.py first)
#
# Takes the approved silhouette option (APPROVED, from plan_options.py's construction) and derives every phase-1 layer
# from it: podium + entrance, tower wall line, balcony slab edge (with the flush front centre loggia), roof edge and its
# guard line, the penthouse kept out of b8's view, and the plan markers for the front pilasters and the rounded chamfer
# columns. Also draws the dimensioned approved plan: tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/
# plan_approved.png.
#
# Runs (faces) of the approved plan, counter-clockwise from the front (the game's lettering): A front, B front-right
# chamfer, C right side, D right rear chamfer, E rear, F left rear chamfer, G left side, H front-left chamfer.
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan_options as P  # noqa: E402  (shares the geometry helpers and the measured constants)
import b8_camera_fit  # noqa: E402
import envelope_layout  # noqa: E402

C = P.C
APPROVED = "E"
PLAN = os.path.join(HERE, "terramar_plan.json")
GUARD_INSET = 0.15          # roof glass guard line inside the roof edge
PENTHOUSE = {"x": [-5.0, 5.0], "y": [-1.0, 6.5], "height_m": 3.5}   # the game's 10 x 7.5 m, at the rear of the roof
COLUMN_WIDTH = 0.9          # rounded chamfer column casing (AI 616: 0.9 wide)
# Structure layer (AI 643)
GROUND_FLOOR_LEVEL = 0.15   # one step above the street (the game stands the building on a 0.2 m base)
GROUND_SLAB_BOTTOM = -0.25
PILASTER_PROUD = 0.05       # the front pilasters stand this far proud of the slab edge (AI 615 read b8's piers 0.06 proud)
COLUMN = {"width": COLUMN_WIDTH, "proud": 0.18, "behind": 0.30, "front_radius": 0.40, "back_radius": 0.05}  # AI 616's casing
CORE = {"outer": {"x": [-3.6, 3.6], "y": [0.8, 6.0]}, "wall": 0.3, "partition": 0.2,
        "compartments": [{"name": "stair", "x": [-3.3, -0.7], "y": [1.1, 5.7]},
                         {"name": "lift_1", "x": [-0.5, 1.4], "y": [1.1, 5.7]},
                         {"name": "lift_2", "x": [1.6, 3.3], "y": [1.1, 5.7]}]}
ENTRANCE_SIDE_WALL = 0.4
# Envelope layer (AI 644): b8's black-framed sliders, ~1.0 m panes, transom ~0.4 m below the head; the front centre
# bay's wood reveals (~0.66 m) on floors 1-4 with four panes between, glazed on floor 5
ENVELOPE = {"frame_depth": 0.12, "member": 0.06, "head": 0.08, "sill": 0.05, "transom": 0.06, "transom_below_head": 0.40,
            "glass": 0.024, "post_ext": 0.03, "column_gap": 0.003, "pane_target": 1.0, "wood_reveal": 0.66,
            "wood_floors": [1, 2, 3, 4], "centre_panes": 4}
RUNS = ["A", "B", "C", "D", "E", "F", "G", "H"]


def pts(poly):
    return [[round(float(x), 4), round(float(y), 4)] for x, y in poly]


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def penthouse_hidden_up_to(cal, plan_front_y, pier_plane_y, roof_top, y_front_wall):
    """Height above the roof top a penthouse wall at y_front_wall can reach before CAM_B8 sees it over the roof edge."""
    cb = cal["camera_b8"]
    cam_y, cam_z = pier_plane_y - cb["pier_plane_distance_m"], cb["camera_height_m"]
    slope = (roof_top - cam_z) / (plan_front_y - cam_y)
    return cam_z + slope * (y_front_wall - cam_y) - roof_top


def structure(lv, slab_tops, podium_top, roof_bot, roof_top, ph, cal, y_front, y_wall, rear_bay_check):
    """The structure layer's parameters (AI 643): every slab with its kind (the region and face-set rules live in
    layer_structure.py), the pilasters, the storey-high chamfer column segments, the core and the entrance walls."""
    t = lv["slab_edge"]
    gft = lv["ground_floor_top"]
    slabs = [{"name": "ground", "kind": "ground", "z": [GROUND_SLAB_BOTTOM, GROUND_FLOOR_LEVEL]},
             {"name": "upper_podium", "kind": "podium_floor", "z": [round(gft - t, 3), gft]},
             {"name": "podium_roof", "kind": "podium_roof", "z": [round(podium_top - t, 3), podium_top]}]
    slabs += [{"name": f"floor{n + 2}", "kind": "residential", "z": [round(top - t, 3), top]} for n, top in enumerate(slab_tops)]
    slabs.append({"name": "roof", "kind": "roof", "z": [roof_bot, roof_top]})
    storeys = [[podium_top, round(slab_tops[0] - t, 3)]]
    storeys += [[slab_tops[i], round(slab_tops[i + 1] - t, 3)] for i in range(len(slab_tops) - 1)]
    storeys.append([slab_tops[-1], roof_bot])
    core_top = round(roof_top + ph["height_m"], 3)
    core_hidden = penthouse_hidden_up_to(cal, y_front, y_wall, roof_top, CORE["outer"]["y"][0])
    return {
        "comment": "AI 643 structure layer. Slab kinds: ground (podium outline + entrance), podium_floor (podium + entrance "
                   "canopy), podium_roof (balcony edge, split at the wall line), residential (balcony edge notched around the "
                   "front pilasters, split at the wall line), roof (balcony edge). Every slab has a hole at the core.",
        "ground_floor_level": GROUND_FLOOR_LEVEL,
        "slab_thickness": t,
        "slabs": slabs,
        "pilasters": {"proud_m": PILASTER_PROUD, "z": [podium_top, roof_bot], "notch_kinds": ["residential"]},
        "columns": {**COLUMN, "storeys": storeys, "rear_bay_check": rear_bay_check},
        "core": {**CORE, "z": [GROUND_SLAB_BOTTOM, core_top],
                 "hidden_from_b8_up_to_m": round(core_hidden, 2),
                 "note": "stair + two lifts under the penthouse rectangle, rising to the penthouse roof; CAM_B8 sees over the "
                         "roof edge at the core's front wall only above hidden_from_b8_up_to_m"},
        "entrance": {"side_wall": ENTRANCE_SIDE_WALL, "z": [GROUND_FLOOR_LEVEL, round(gft - t, 3)]},
    }


def envelope(plan, wall_sharp, columns):
    """The envelope layer's layout (envelope_layout.py): storeys, bays and panes per run, door panes, corner posts."""
    env = dict(ENVELOPE)
    env["storeys"] = plan["structure"]["columns"]["storeys"]
    bays, corners = envelope_layout.layout([tuple(p) for p in wall_sharp], 0.25, P.PIERS, columns,
                                           plan["structure"]["columns"], env, RUNS)
    return {**env, "comment": "AI 644 glazing on the tower wall line: positions in metres along each bay from a; v = offset "
                              "from the wall line (outward +). Floors 1-5 = the storeys above the podium roof. Panes listed "
                              "in doors slide (the balconies layer puts thresholds there).",
            "floors": {str(i + 1): z for i, z in enumerate(env["storeys"])}, "bays": bays, "corners": corners,
            "wall_radius": 0.25}


def cameras(cal, plan):
    """The comparison cameras every layer renders its evidence from. CAM_B8 is fitted to this plan (b8_camera_fit.py),
    starting from calibrate_references.py's camera; the aerial camera fits the aerial's roof plane only."""
    picks = C.load_json(os.path.join(HERE, "reference_points.json"))
    cb, ca = cal["camera_b8"], cal["aerial"]["camera"]
    return {
        "b8": b8_camera_fit.fit(picks["b8"], plan, (cb["location"][1], cb["location"][2], cb["focal_px"])),
        "aerial": {"location": ca["location"], "rotation_deg": [round(90 - ca["pitch_down_deg"], 3), 0.0, 0.0],
                   "focal_px": ca["focal_px"], "shift_y": 0.0, "resolution": ca["resolution"],
                   "note": "fitted to the aerial's roof plane only: its facades cannot share one camera"},
        "rear": {"location": [46.0, 52.0, 34.0], "target": [0.0, -1.0, 12.5], "lens_mm": 35.0, "resolution": [1600, 1100]},
        "top": {"location": [0.0, 0.7, 80.0], "rotation_deg": [0.0, 0.0, 0.0], "ortho_scale": 32.0, "resolution": [1600, 1500]},
    }


def main():
    cal = C.load_json(P.CAL)
    opts = C.load_json(P.PLAN_OPTIONS)
    lv = opts["levels_m"]
    rear_line = P.aerial_rear_line(cal)
    poly, radii, dims = P.option_outline(APPROVED, rear_line)
    edge = P.dedupe(P.rounded(poly, radii))
    wall_sharp = P.inset(poly, P.BALCONY)
    wall = P.dedupe(P.rounded(wall_sharp, [max(r - P.BALCONY, 0.25) if r > 0 else 0.0 for r in radii]))
    guard = P.dedupe(P.rounded(P.inset(poly, GUARD_INSET), [max(r - GUARD_INSET, 0.25) if r > 0 else 0.0 for r in radii]))

    podium_top, roof_top = lv["podium_top"], lv["roof_slab_top"]
    roof_bot = round(roof_top - lv["roof_edge"], 3)
    slab_tops = [round(podium_top + n * lv["storey"], 3) for n in range(1, lv["residential_floors"])]
    y_front, y_wall = P.Y_FRONT, P.Y_FRONT + P.BALCONY
    e = P.ENTRANCE
    entrance = [(-e["half_width"], y_front - e["projection"]), (e["half_width"], y_front - e["projection"]),
                (e["half_width"], y_front), (-e["half_width"], y_front)]
    ph = PENTHOUSE
    penthouse = [(ph["x"][0], ph["y"][0]), (ph["x"][1], ph["y"][0]), (ph["x"][1], ph["y"][1]), (ph["x"][0], ph["y"][1])]
    hidden = penthouse_hidden_up_to(cal, y_front, y_wall, roof_top, ph["y"][0])

    # sharp corner order: A/B, B/C, C/D, D/E, E/F, F/G, G/H, H/A
    ha, ab, bc, cd, de, ef, fg, gh = [tuple(p) for p in poly]
    w = [tuple(p) for p in wall_sharp]
    columns = [
        {"run": "B", "at": lerp(w[1], w[2], 0.5), "source": "b8: the right chamfer's two bays meet at a rounded column (reads 0.9 m past mid-run, within the calibration error)"},
        {"run": "H", "at": lerp(w[7], w[0], 0.5), "source": "mirror of B"},
        {"run": "D", "at": lerp(w[3], w[4], 1 / 3), "source": "proposed: the rear chamfers in three bays, close to the front chamfer bay width"},
        {"run": "D", "at": lerp(w[3], w[4], 2 / 3), "source": "proposed"},
        {"run": "F", "at": lerp(w[5], w[6], 1 / 3), "source": "proposed"},
        {"run": "F", "at": lerp(w[5], w[6], 2 / 3), "source": "proposed"},
    ]
    for c, (i, j) in zip(columns, [(1, 2), (7, 0), (3, 4), (3, 4), (5, 6), (5, 6)]):
        d = np.subtract(w[j], w[i])
        d = d / np.linalg.norm(d)
        c["along"], c["outward"] = (float(d[0]), float(d[1])), (float(d[1]), float(-d[0]))   # CCW: outward = right normal
    front_bay = math.dist(w[1], w[2]) / 2
    rear_run = math.dist(w[3], w[4])
    sharp = [ha, ab, bc, cd, de, ef, fg, gh]
    run_len = {r: round(math.dist(sharp[i], sharp[(i + 1) % 8]), 3) for i, r in enumerate(RUNS)}
    xs, ys = [p[0] for p in edge], [p[1] for p in edge]

    plan = {
        "comment": "Terra & Mar rebuild (AI 642): the approved plan. Blender frame, metres: front faces -Y, z up, street z 0, the "
                   "front balcony edge at y -11. Every layer script reads its outlines and levels from here; nothing is hard-coded.",
        "approved": {"option": APPROVED, "date": "2026-10-12",
                     "by": "user: annotated top view of option A -- drop the rear face, run the rear chamfers on to one square "
                           "corner (\"more aligned to the aerial view\"); then cut that point with a rear face as short as the sides; "
                           "every junction rounded with the same small curvature"},
        "decisions": {
            "penthouse": "keep, set back out of b8's view (about 10 x 7.5 m at the rear of the roof, as in the aerial)",
            "front_centre_bay": "flush loggias between the two full-height pilasters, as b8: slab edges flush with the pilaster faces, glazing at the wall line",
            "footprint": "the rebuild's own (27.0 x 24.5 m); the game's 28 x 22 m podium is a comparison only -- no city spec places Terra & Mar yet",
            "superseded_prompts": "exterior AI 617-626 and 641 (written against the game shells); props AI 627-633 and interiors AI 634-638 retargeted to the rebuild; AI 639 and 640 unchanged",
        },
        "runs": {"order": RUNS, "names": {"A": "front", "B": "front-right chamfer", "C": "right side", "D": "right rear chamfer",
                                          "E": "rear", "F": "left rear chamfer", "G": "left side", "H": "front-left chamfer"},
                 "lengths_at_balcony_edge_sharp_m": run_len,
                 "sharp_corners": {lbl: [round(c[0], 4), round(c[1], 4)] for lbl, c in
                                   zip(["H/A", "A/B", "B/C", "C/D", "D/E", "E/F", "F/G", "G/H"], sharp)}},
        "dimensions_m": {"width": round(max(xs) - min(xs), 3), "depth": round(max(ys) - min(ys), 3), "front": 2 * P.FRONT_HALF,
                         "front_chamfer": f"{P.CHAMFER_DEPTH} x {P.CHAMFER_DEPTH} at 45 degrees", "side": dims["side_m"],
                         "balcony_depth": P.BALCONY, "corner_radius_front": P.R_FRONT, "corner_radius_other": P.R_SIDE,
                         "wall_line_corner_radius": 0.25},
        "levels_m": {"street": 0.0, "ground_floor_top": lv["ground_floor_top"], "podium_top": podium_top, "storey": lv["storey"],
                     "residential_floors": lv["residential_floors"], "balcony_slab_tops": slab_tops, "slab_edge": lv["slab_edge"],
                     "roof_slab_bottom": roof_bot, "roof_slab_top": roof_top},
        "measured": {
            "source": "calibrate_references.py -> calibration.json, from the points in reference_points.json (b8 camera: horizon from the "
                      "pedestrians' heads, focal from the chamfer rails' vanishing point, scale from the 3.35 m storey)",
            "front_half_at_balcony_edge": cal["front_m"]["front_half_at_balcony_edge_m"], "pier_centres": cal["front_m"]["pier_centres_m"],
            "pier_width": cal["front_m"]["pier_width_m"], "chamfer_angle_deg": cal["chamfer"]["angle_deg"],
            "chamfer_end_half_width": cal["chamfer"]["end_half_width_m"], "front_corner_radius": cal["front_m"]["corner_radius_m"],
            "podium_top": cal["levels_m"]["podium_top_m"], "roof_slab_top": cal["levels_m"]["roof_slab_top_m"],
            "rounded_to": "front 10.0, chamfers 45 degrees to a 27.0 m width, radius 0.64; b8 and the aerial are AI images (+/-5-10 %)",
        },
        "layers": {
            "podium": {"outline": pts(edge), "z": [0.0, podium_top], "note": "ground + upper podium; outline = the balcony edge line"},
            "entrance": {"outline": pts(entrance), "z": [0.0, lv["ground_floor_top"]], "note": "projecting entrance volume on run A"},
            "tower_wall_line": {"outline": pts(wall), "z": [podium_top, roof_bot], "note": "glazing / wall line, 1.5 m inside the balcony edge"},
            "balcony_edge": {"outline": pts(edge), "slab_tops": slab_tops, "slab_edge": lv["slab_edge"],
                             "centre_bay": {"run": "A", "x": [P.PIERS[0][1], P.PIERS[1][0]], "mode": "flush_loggia",
                                            "note": "between the pilasters the slab edge is flush with the pilaster faces; the loggia is the 1.5 m behind"}},
            "roof_edge": {"outline": pts(edge), "z": [roof_bot, roof_top]},
            "roof_guard_line": {"outline": pts(guard), "inset_m": GUARD_INSET, "z": [roof_top, round(roof_top + 1.1, 3)]},
            "penthouse": {"outline": pts(penthouse), "z": [roof_top, round(roof_top + ph["height_m"], 3)],
                          "hidden_from_b8_up_to_m": round(hidden, 2),
                          "note": "kept out of b8's view: CAM_B8 sees over the roof edge only above this height at its front wall"},
        },
        "markers": {
            "front_pilasters": [{"x": list(xr), "y": [y_front, y_wall], "z": [podium_top, roof_bot]} for xr in P.PIERS],
            "chamfer_columns": [{"run": c["run"], "at": [round(c["at"][0], 3), round(c["at"][1], 3)], "width_m": COLUMN_WIDTH,
                                 "along": [round(v, 6) for v in c["along"]], "outward": [round(v, 6) for v in c["outward"]],
                                 "on": "tower_wall_line", "source": c["source"]} for c in columns],
        },
        "structure": structure(lv, slab_tops, podium_top, roof_bot, roof_top, ph, cal, y_front, y_wall,
                               {"front_chamfer_bay_m": round(front_bay, 3), "rear_chamfer_wall_run_m": round(rear_run, 3),
                                "rear_three_bays_m": round(rear_run / 3, 3), "rear_two_bays_m": round(rear_run / 2, 3),
                                "chosen_bays": 3, "why": "three bays (-11 %) sit much closer to the front chamfers' bay than two (+33 %)"}),
        "game_comparison": {"podium_m": [28, 22], "tower_m": [25, 19], "depth_difference_m": round(max(ys) - min(ys) - 22, 2)},
    }
    plan["cameras"] = cameras(cal, plan)
    plan["envelope"] = envelope(plan, wall_sharp, columns)
    with open(PLAN, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(plan, fh, indent=2)
    draw(plan, poly, edge, wall, guard, entrance, penthouse, columns, cal)
    print("PLAN", json.dumps({"option": APPROVED, "size_m": [plan["dimensions_m"]["width"], plan["dimensions_m"]["depth"]],
                              "runs": run_len, "penthouse_hidden_up_to_m": round(hidden, 2)}))


def draw(plan, poly, edge, wall, guard, entrance, penthouse, columns, cal, scale=30, pad=80):
    top_y, bottom_y, half_w = 18.0, -14.0, 17.5
    w, h = int(2 * half_w * scale + 2 * pad), int((top_y - bottom_y) * scale + 2 * pad + 110)
    im = Image.new("RGB", (w, h), (250, 249, 246))
    d = ImageDraw.Draw(im, "RGBA")
    ox, oy = w / 2, pad + 110
    to = lambda p: (ox + p[0] * scale, oy + (top_y - p[1]) * scale)  # noqa: E731
    for g in range(-16, 17, 2):
        d.line([to((g, bottom_y)), to((g, top_y))], fill=(0, 0, 0, 16))
    for g in range(-14, 19, 2):
        d.line([to((-half_w, g)), to((half_w, g))], fill=(0, 0, 0, 16))
    pod, _ = P.game_outlines()
    d.polygon([to(p) for p in pod], outline=(170, 170, 170))
    d.polygon([to(p) for p in edge], fill=(214, 200, 182, 255), outline=(60, 50, 40))
    d.polygon([to(p) for p in wall], fill=(236, 230, 220, 255), outline=(120, 100, 80))
    for a, b in zip(guard, guard[1:] + guard[:1]):
        d.line([to(a), to(b)], fill=(40, 120, 170, 200), width=1)
    d.polygon([to(p) for p in entrance], fill=(170, 150, 120, 255), outline=(90, 80, 70))
    for xr in P.PIERS:
        d.rectangle([to((xr[0], P.Y_FRONT + P.BALCONY)), to((xr[1], P.Y_FRONT))], fill=(90, 80, 70))
    for c in columns:
        x, y = to(c["at"])
        r = COLUMN_WIDTH / 2 * scale
        proposed = c["source"].startswith("proposed")
        d.ellipse([x - r, y - r, x + r, y + r], fill=None if proposed else (90, 80, 70), outline=(90, 80, 70), width=2)
    d.polygon([to(p) for p in penthouse], outline=(180, 60, 60), fill=(200, 90, 90, 40))
    f, fb, fs = P.font(17), P.font(28, True), P.font(15)
    dm, lv = plan["dimensions_m"], plan["levels_m"]
    d.text((pad, 20), f"Terra & Mar rebuild -- approved plan (option {plan['approved']['option']}, 2026-10-12)", fill=(25, 25, 25), font=fb)
    d.text((pad, 62), f"{dm['width']:.1f} m wide x {dm['depth']:.1f} m deep at the balcony edge (= podium = roof edge)  |  balcony 1.5 m all around  |  "
                      f"corners R {dm['corner_radius_other']} (front {dm['corner_radius_front']}), wall line R 0.25", fill=(60, 60, 60), font=f)
    d.text((pad, 86), f"levels: podium top {lv['podium_top']}, storey {lv['storey']} x {lv['residential_floors']}, roof slab {lv['roof_slab_bottom']}-{lv['roof_slab_top']}  |  "
                      f"penthouse 10.0 x 7.5 m, hidden from b8 up to {plan['layers']['penthouse']['hidden_from_b8_up_to_m']} m", fill=(60, 60, 60), font=f)
    # run labels with lengths, outside each run
    cen = np.mean(np.asarray(poly, dtype=float), axis=0)
    lens = plan["runs"]["lengths_at_balcony_edge_sharp_m"]
    for r, a, b in zip(RUNS, poly, poly[1:] + poly[:1]):
        mid = (np.asarray(a) + np.asarray(b)) / 2
        n = mid - cen
        n = n / np.linalg.norm(n)
        x, y = to(tuple(mid + n * 2.0))
        text = f"{r}  {lens[r]:.1f} m"
        d.text((x - 34, y - 10), text, fill=(25, 25, 25), font=f)
    x, y = to((0, -11.9))
    d.text((x - 52, y - 2), "entrance 6.9 m", fill=(60, 50, 40), font=fs)
    x, y = to((0, -8.6))
    d.text((x - 92, y), "flush centre loggia", fill=(60, 50, 40), font=fs)
    x, y = to((0, 2.6))
    d.text((x - 58, y), "penthouse (kept)", fill=(160, 50, 50), font=fs)
    d.text((pad, h - 34), "dark rectangles: front pilasters (b8: 0.83 m at +/-3.07) | filled circles: chamfer columns (b8) | open circles: proposed rear "
                          "columns | blue: roof guard line | grey: game podium | 2 m grid", fill=(90, 90, 90), font=P.font(14))
    im.save(os.path.join(P.OUT, "plan_approved.png"))


if __name__ == "__main__":
    main()
