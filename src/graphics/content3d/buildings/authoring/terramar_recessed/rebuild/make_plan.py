# make_plan.py -- AI 642: write the approved plan, rebuild/terramar_plan.json, the single source every layer script reads.
#
#   python -I make_plan.py        (system Python with numpy + Pillow; run plan_options.py first)
#
# Takes the approved silhouette option (APPROVED, from plan_options.py's construction) and derives every phase-1 layer
# from it: podium + entrance, tower wall line, balcony slab edge (with the flush front centre loggia), roof edge and its
# guard line, the penthouse kept out of b8's view, and the plan markers for the front pilasters and the rounded chamfer
# columns. Also draws the dimensioned approved plan: tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/
# plan_approved.png. The layers' own parameters follow in the same file: structure, envelope, balconies, podium, roof
# (AI 643-647), materials with the stone joint layout (AI 648) and the props (AI 627+).
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
import balcony_layout  # noqa: E402
import podium_layout  # noqa: E402
import props_layout  # noqa: E402

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
ENTRANCE_SIDE_WALL = 0.57    # b8: the portal's stone jambs (AI 646; was 0.4)
# Envelope layer (AI 644): b8's black-framed sliders, ~1.0 m panes, transom ~0.4 m below the head; the front centre
# bay's wood reveals (~0.66 m) on floors 1-4 with four panes between, glazed on floor 5
ENVELOPE = {"frame_depth": 0.12, "member": 0.06, "head": 0.08, "sill": 0.05, "transom": 0.06, "transom_below_head": 0.40,
            "glass": 0.024, "post_ext": 0.03, "column_gap": 0.003, "pane_target": 1.0, "wood_reveal": 0.66,
            "wood_floors": [1, 2, 3, 4], "centre_panes": 4}
# Balconies layer (AI 645): b8's frameless glass guards (slim dark top rail ~1.0 m above the floor, dark base shoe
# behind the slab fascia), stone walking surfaces, warm wood soffits with small downlights
BALCONIES = {"guard_inset": GUARD_INSET, "shoe": {"width": 0.06, "height": 0.10}, "glass": 0.015,
             "rail": {"width": 0.04, "height": 0.04}, "guard_height": 1.0, "panel_max": 1.6, "panel_gap": 0.01,
             "paving": 0.03, "threshold": {"depth": 0.28, "height": 0.015}, "column_gap": 0.003,
             "downlight": {"radius": 0.06, "height": 0.012, "spacing": 2.2},
             "soffit_rgb": [0.31, 0.125, 0.085]}
# Podium layer (AI 646): b8's stone piers and bands, black-steel storefronts, deep upper recesses with guards, the
# entrance portal, lanterns and the kit sign; heights read through the plan-fitted CAM_B8
PODIUM = {"depth": 0.95, "pier_ext": 0.45, "column_pier": 0.9, "member": 0.06, "frame_depth": 0.12,
          "storefront_pane": 1.8, "upper_pane": 1.5,
          "storefront": {"plane_v": -0.30, "sill": 0.05, "transom_bar": [3.40, 3.46], "panel": [4.00, 4.65], "head": [4.65, 4.75]},
          "ground_lintel": [4.75, None], "upper": {"plane_v": -0.90, "head": 9.15, "transom_bar": [8.52, 8.58], "sill": 0.05},
          "guard_v": -0.08, "paving": 0.03,
          "entrance_detail": {"lintel_bottom": 4.0, "vestibule_y": [-11.12, -11.0], "grid_x": [-2.0, -1.0, 0.0, 1.0, 2.0],
                              "doors": [[-1.0, 0.0], [0.0, 1.0]], "transom_bar": [2.92, 2.98], "wood_lining": 0.03,
                              "loggia": {"half_width": 2.95, "back_y": [-10.06, -9.94], "head": 9.37, "transom_bar": [8.76, 8.82]}},
          "lantern": {"z": [2.70, 3.02], "body": 0.16, "offset": 0.10, "bracket": 0.04},
          "sign": {"depth": 0.03, "standoff": 0.015, "lines": [
              {"name": "terra_and_mar", "kit": "01_TERRA_AND_MAR", "installed": "terramar_sign_terra_and_mar", "card_width": 4.12, "centre_z": 5.01},
              {"name": "coastal_kitchen", "kit": "02_COASTAL_KITCHEN", "installed": "terramar_sign_coastal_kitchen", "card_width": 2.73, "centre_z": 4.47}],
              "note": "sized from b8 through CAM_B8 (visible glyph widths 3.85 and 2.54 m); the kit's 3.2 / 2.1 m are its suggested working scale, not a survey"}}
# Roof layer (AI 647): b8's deep rounded roof edge with a frameless glass guard all round; the penthouse kept out of
# b8's view (AI 642) with the aerial's openings, louvred annex, solar array and mechanical units
ROOF = {"paving": 0.05,
        "penthouse": {"wall": 0.25, "parapet_top": 3.8, "roof_slab": [3.2, 3.5], "cap": {"overhang": 0.03, "height": 0.06},
                      "openings": [{"wall": "front", "kind": "door", "s": [-3.6, -2.6], "z": [0.0, 2.4]},
                                   {"wall": "front", "kind": "slider", "s": [0.5, 3.8], "z": [0.0, 2.6]},
                                   {"wall": "right", "kind": "window", "s": [1.5, 2.7], "z": [0.0, 2.6]},
                                   {"wall": "left", "kind": "door", "s": [1.5, 2.5], "z": [0.0, 2.4]},
                                   {"wall": "rear", "kind": "window", "s": [-3.0, -1.0], "z": [0.9, 2.6]},
                                   {"wall": "rear", "kind": "window", "s": [1.0, 3.0], "z": [0.9, 2.6]}],
                      "frame": {"member": 0.06, "depth": 0.08}},
        "annex": {"x": [-8.5, -5.0], "y": [0.0, 5.5], "height": 2.75, "post": 0.15, "beam": 0.25,
                  "louvre": {"width": 0.15, "thickness": 0.03, "spacing": 0.30}, "pane": 1.5},
        "solar": {"margin": 0.35, "panel": 1.0, "gap": 0.45, "tilt_deg": 10.0, "clearance": 0.15, "thickness": 0.04,
                  "module": 1.0, "module_gap": 0.02, "rail": 0.05},
        "units": [{"x": [-4.3, -2.7], "y": [-0.45, 0.55], "h": 1.1}, {"x": [-2.5, -1.1], "y": [-0.45, 0.45], "h": 0.95},
                  {"x": [-4.3, -3.3], "y": [0.75, 1.45], "h": 0.7}],
        "units_zone": {"x": [-4.4, -0.9], "y": [-0.45, 1.5]}}
# Materials layer (AI 648): the kit limestone (AI 640) on every stone face set, its panel joints cut as geometry
# (b8: courses of storey / 5 on the pilasters, three courses across the sign band; large-format 1200 x ~670 mm panels),
# warm wood, black steel, clear glass. tone = linear multiplier on the kit's base colour, calibrated against b8 boxes
# under the calibrated rig (sample_tones.py): the stone's red is held at albedo ~0.95 (b8's lit stone is brighter
# than the rig's AgX shoulder allows a physical albedo to reach) and green / blue set b8's warm hue
MATERIALS = {
    "stone": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [1.24, 1.113, 1.115], "ao_strength": 0.5,
              "roughness_gain": 1.0, "normal_strength": 1.0,
              "slots": ["TM_RB_slab_fascia", "TM_RB_pilaster", "TM_RB_column", "TM_RB_podium_stone", "TM_RB_penthouse_stone"]},
    "paving": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [0.86, 0.86, 0.86], "ao_strength": 0.5,
               "roughness_gain": 1.0, "normal_strength": 1.0, "slots": ["TM_RB_paving", "TM_RB_threshold", "TM_RB_slab_top"]},
    # AI 630: the roof terrace's stone paving tiles (the aerial): the same limestone in 600 mm square tiles, each tile its
    # own region of the 4 m map (a per-tile offset), thin dark joints -- a material on the deck's own face set
    "roof_paving": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [0.84, 0.83, 0.81], "tile_m": 0.60,
                    "joint_m": 0.005, "joint_rgb": [0.30, 0.28, 0.25], "joint_roughness": 0.9, "roughness_gain": 1.0,
                    "normal_strength": 0.8, "slots": ["TM_RB_roof_paving"]},
    # AI 632: the sidewalk's pavers (site dressing), the same tiles a shade greyer
    "site_paving": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [0.74, 0.73, 0.71], "tile_m": 0.60,
                    "joint_m": 0.006, "joint_rgb": [0.27, 0.26, 0.24], "joint_roughness": 0.9, "roughness_gain": 1.0,
                    "normal_strength": 0.8, "slots": ["TM_RB_site_paving"]},
    "joints": {"width": 0.008, "bevel": 0.003, "depth": 0.006, "panel_max": 1.2, "course_target": 0.67, "margin": 0.004,
               "vertical_min_height": 0.2,
               "seed": 648, "rgb": [0.20, 0.185, 0.165], "roughness": 0.9,
               "rules": {"TM_RB_pilaster": {"courses": True, "verticals": True},
                         "TM_RB_column": {"courses": True, "verticals": False},
                         "TM_RB_slab_fascia": {"courses": False, "verticals": True},
                         "TM_RB_podium_stone": {"courses": True, "verticals": True},
                         "TM_RB_penthouse_stone": {"courses": True, "verticals": True}}},
    "wood": {"rgb": [0.46, 0.25, 0.10], "roughness": 0.5, "slots": ["TM_RB_wood"],
             "note": "warm teak reveals and linings, flat: no wood texture is installed"},
    "soffit": {"roughness": 0.5, "slots": ["TM_RB_soffit"],
               "note": "the soffits keep AI 645's tone calibrated on b8's soffits (balconies.soffit_rgb), flat"},
    "steel": {"rgb": [0.018, 0.018, 0.020], "roughness": 0.38, "metallic": 0.0, "slots": ["TM_RB_frame", "TM_RB_louvre"],
              "note": "black powder-coated steel"},
    "glass": {"rgb": [0.94, 0.97, 0.97], "roughness": 0.02, "ior": 1.5, "slots": ["TM_RB_glass"]},
    "plaster": {"rgb": [0.80, 0.78, 0.74], "roughness": 0.9, "slots": ["TM_RB_ceiling"]},
    "interior_floor": {"rgb": [0.42, 0.33, 0.24], "roughness": 0.55, "slots": ["TM_RB_floor"]},
    "concrete": {"rgb": [0.48, 0.47, 0.45], "roughness": 0.85, "slots": ["TM_RB_roof_top", "TM_RB_core", "TM_RB_hidden"]},
}
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
    core_top = round(roof_top + ROOF["penthouse"]["roof_slab"][0], 3)      # under the penthouse roof slab (AI 647)
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
                 "note": "stair + two lifts under the penthouse rectangle, rising to the underside of the penthouse roof slab, "
                         "which covers it; CAM_B8 sees over the roof edge at the core's front wall only above hidden_from_b8_up_to_m"},
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


def balconies(plan, poly, radii):
    """The balconies layer's layout (balcony_layout.py): walking-surface pieces, guard runs, downlights, planter slots."""
    b = BALCONIES
    env = plan["envelope"]
    col = plan["structure"]["columns"]
    half_frame = env["frame_depth"] / 2
    shoe = b["shoe"]["width"]

    def loop(inset_m, radius_rule):
        return P.dedupe(P.rounded(P.inset(poly, inset_m), [radius_rule(r) if r > 0 else 0.0 for r in radii]))
    outer = loop(b["guard_inset"] + shoe / 2, lambda r: max(r - b["guard_inset"] - shoe / 2, 0.25))
    inner = loop(P.BALCONY - half_frame, lambda r: env["wall_radius"] + half_frame)      # the frames' outer face
    inner = balcony_layout.bulge_columns(inner, plan["markers"]["chamfer_columns"], col, half_frame, b["column_gap"])
    pil = [tuple(m["x"]) for m in plan["markers"]["front_pilasters"]]
    pil_pairs = ((pil[0][0], pil[0][1]), (pil[1][0], pil[1][1]))
    y_out, y_in = P.Y_FRONT + b["guard_inset"] + shoe / 2, P.Y_FRONT + P.BALCONY - half_frame
    long_piece, centre, _, _ = balcony_layout.split_at_pilasters(outer, inner, pil_pairs, y_out, y_in)
    guard = loop(b["guard_inset"], lambda r: max(r - b["guard_inset"], 0.25))
    yg = P.Y_FRONT + b["guard_inset"]
    (l_out, l_in), (r_in, r_out) = pil_pairs
    guard_ins = balcony_layout._insert(guard, [(x, yg) for x in (l_out, l_in, r_in, r_out)])
    long_run = balcony_layout._path(guard_ins, (r_out, yg), (l_out, yg))
    centre_run = [(l_in, yg), (r_in, yg)]
    centre_line = loop(P.BALCONY / 2, lambda r: max(r - P.BALCONY / 2, 0.25))
    lights = balcony_layout.downlights(centre_line, pil, P.Y_FRONT, b["downlight"]["spacing"], 0.25)
    guard_v = P.BALCONY - b["guard_inset"] - shoe / 2 - 0.32                              # pot centre from the wall line
    slots = balcony_layout.planter_slots(env["bays"], [1, 2, 3, 4, 5], guard_v, env["wood_reveal"])
    sharp = plan["runs"]["sharp_corners"]
    g_sharp = {k: v for k, v in zip(["H/A", "A/B", "B/C", "C/D", "D/E", "E/F", "F/G", "G/H"], P.inset(poly, b["guard_inset"]))}
    strips = [{"run": "H", "from": [round(c, 4) for c in g_sharp["G/H"]], "to": [round(c, 4) for c in g_sharp["H/A"]]},
              {"run": "A", "from": [round(c, 4) for c in g_sharp["H/A"]], "to": [l_out, yg]},
              {"run": "A", "from": [l_in, yg], "to": [r_in, yg]},
              {"run": "A", "from": [r_out, yg], "to": [round(c, 4) for c in g_sharp["A/B"]]},
              {"run": "B", "from": [round(c, 4) for c in g_sharp["A/B"]], "to": [round(c, 4) for c in g_sharp["B/C"]]}]
    rd = lambda pts: [[round(x, 4), round(y, 4)] for x, y in pts]  # noqa: E731
    return {**b, "comment": "AI 645 balconies: the walking surface from the frames' outer face to the guard shoe, split at "
                            "the pilasters and stepping round the column fronts; guard runs on the guard line, stopping "
                            "against the pilasters; soffit tone for TM_RB_soffit; downlights on the soffit centre line; "
                            "planter slots (pots per bay and floor) and the podium-edge planter strips (floor 1) are "
                            "reserved for props AI 627 / 628.",
            "paving_pieces": [rd(long_piece), rd(centre)], "guard_runs": [rd(long_run), rd(centre_run)],
            "downlight_points": lights, "planter_slots": slots,
            "podium_planter_strips": [{**st, "floor": 1, "depth": 0.45} for st in strips]}


def podium(plan, poly, radii):
    """The podium layer's layout (podium_layout.py): piers, bays, the entrance, lanterns, the sign and prop slots."""
    cfg = dict(PODIUM)
    st, lv = plan["structure"], plan["levels_m"]
    slabs = {sl["name"]: sl for sl in st["slabs"]}
    e = plan["layers"]["entrance"]["outline"]
    entrance = {"half_width": max(x for x, _ in e), "y_front": min(y for _, y in e), "y_back": max(y for _, y in e),
                "jamb": st["entrance"]["side_wall"]}
    cols = [{**c, "at": [c["at"][0] + c["outward"][0] * P.BALCONY, c["at"][1] + c["outward"][1] * P.BALCONY]}
            for c in plan["markers"]["chamfer_columns"]]                  # the columns projected onto the podium outline
    lay = podium_layout.layout([tuple(q) for q in poly], radii, RUNS, cols, entrance, cfg)
    ground = [st["ground_floor_level"], slabs["upper_podium"]["z"][0]]
    upper = [slabs["upper_podium"]["z"][1], slabs["podium_roof"]["z"][0]]
    cfg["ground_lintel"] = [cfg["storefront"]["head"][1], ground[1]]
    props = {
        "awnings_ai631": [{"run": b["run"], "bay": b["id"], "s": b["s"], "z": [cfg["storefront"]["panel"][0], cfg["storefront"]["head"][1]],
                           "projection": 1.2} for b in lay["bays"]],
        "upper_planter_boxes_ai628": [{"run": b["run"], "bay": b["id"], "s": b["s"], "v": [round(cfg["upper"]["plane_v"] + 0.12, 3), round(cfg["guard_v"] - 0.06, 3)],
                                       "z": upper[0] + cfg["paving"]} for b in lay["bays"]],
        "sidewalk_cafe_ai632": [{"run": b["run"], "bay": b["id"], "s": b["s"], "v": [0.4, 4.0]} for b in lay["bays"] if b["run"] in ("B", "H")],
        "street_planters_ai633": [{"at": [round(sgn * (entrance["half_width"] + 0.6), 3), round(entrance["y_front"] - 0.5, 3)], "radius": 0.45}
                                  for sgn in (-1, 1)],
    }
    return {**cfg, **lay, "entrance": entrance, "storeys": {"ground": ground, "upper": upper}, "props": props,
            "comment": "AI 646 podium on the podium outline (the balcony-edge line): positions along each run from its "
                       "sharp start corner, v from the outline (outward +, the walls go to -depth). Corner piers wrap the "
                       "rounded corners; on run A they reach the entrance volume. The props lists are reservations for "
                       "AI 628, 631, 632 and 633."}


def roof(plan, poly, radii):
    """The roof layer: guard halves on the roof guard line, the terrace outline, the penthouse, annex, solar rows and
    units, the b8 sightline limits they must stay under, and the terrace prop zones (AI 629 / 630)."""
    cfg = json.loads(json.dumps(ROOF))
    b = plan["balconies"]
    lv = plan["levels_m"]
    top = lv["roof_slab_top"]
    shoe = b["shoe"]["width"]

    def loop(inset_m):
        return P.dedupe(P.rounded(P.inset(poly, inset_m), [max(r - inset_m, 0.25) if r > 0 else 0.0 for r in radii]))
    guard = loop(b["guard_inset"])
    yf = min(y for _, y in guard)
    yr = max(y for _, y in guard)
    guard = balcony_layout._insert(guard, [(0.0, yf), (0.0, yr)])
    halves = [balcony_layout._path(guard, (0.0, yf), (0.0, yr)), balcony_layout._path(guard, (0.0, yr), (0.0, yf))]
    pr = plan["layers"]["penthouse"]["outline"]
    px = sorted({q[0] for q in pr})
    py = sorted({q[1] for q in pr})
    ph = cfg["penthouse"]
    sol, zone = cfg["solar"], cfg["units_zone"]
    inner = [px[0] + ph["wall"] + sol["margin"], px[1] - ph["wall"] - sol["margin"],
             py[0] + ph["wall"] + sol["margin"], py[1] - ph["wall"] - sol["margin"]]
    depth = sol["panel"] * math.cos(math.radians(sol["tilt_deg"]))
    rows, y = [], inner[2]
    while y + depth <= inner[3] + 1e-6:
        x0, x1 = inner[0], inner[1]
        if y < zone["y"][1] and y + depth > zone["y"][0]:
            x0 = zone["x"][1] + 0.1                       # leave the units' corner free
        rows.append({"x": [round(x0, 4), round(x1, 4)], "y": [round(y, 4), round(y + depth, 4)]})
        y += depth + sol["gap"]
    cam = plan["cameras"]["b8"]
    y_c, z_c = cam["location"][1], cam["location"][2]
    y_edge = P.Y_FRONT
    limit = lambda yy: round(z_c + (top - z_c) * (yy - y_c) / (y_edge - y_c) - top, 3)  # noqa: E731
    tilt = math.radians(sol["tilt_deg"])
    highest = {"penthouse_front_wall": [py[0], ph["parapet_top"] + ph["cap"]["height"]],
               "solar_front_row": [rows[0]["y"][0], ph["roof_slab"][1] + sol["clearance"] + depth * math.tan(tilt) + sol["thickness"]],
               "units": [min(u["y"][0] for u in cfg["units"]), ph["roof_slab"][1] + max(u["h"] for u in cfg["units"])],
               "annex": [cfg["annex"]["y"][0], cfg["paving"] + cfg["annex"]["height"] + cfg["annex"]["beam"]]}
    sightline = {k: {"y": round(v[0], 3), "height_above_roof_m": round(v[1], 3), "hidden_up_to_m": limit(v[0]),
                     "hidden": v[1] < limit(v[0])} for k, v in highest.items()}
    rd = lambda pts: [[round(x, 4), round(y, 4)] for x, y in pts]  # noqa: E731
    planter_ring = loop(b["guard_inset"] + shoe / 2 + 0.7)
    return {**cfg, "comment": "AI 647 roof: heights are above the roof slab top (z %.3f). Guard halves meet at the front "
                              "and rear centres; the terrace runs from the guard shoe to the penthouse walls; every part "
                              "above the roof stays under CAM_B8's sightline over the roof edge (sightline)." % top,
            "roof_top": top, "guard_halves": [rd(h) for h in halves], "terrace_outer": rd(loop(b["guard_inset"] + shoe / 2)),
            "penthouse_rect": {"x": px, "y": py}, "solar_rows": rows, "sightline": sightline,
            "props": {"terrace_planters_ai629": {"outer": rd(loop(b["guard_inset"] + shoe / 2)), "inner": rd(planter_ring),
                                                 "note": "planters and small trees behind the guard (b8), all round"},
                      "terrace_furniture_ai630": [{"name": "dining", "x": [-10.0, -6.0], "y": [-8.5, -4.5]},
                                                  {"name": "lounge", "x": [6.0, 10.0], "y": [-8.5, -4.5]},
                                                  {"name": "front_centre", "x": [-3.0, 3.0], "y": [-8.5, -5.5]}]}}


def materials(plan):
    """The materials layer: the families and their slots, and the stone's joint layout. Course joints are z-planes:
    the datums (podium storey and band levels, the slab tops, the roof slab, the penthouse parapet) split the height
    into bands, each band divided into equal courses near course_target. Vertical joints are laid per flat stone face
    by layer_materials.py (equal panels of at most panel_max)."""
    cfg = json.loads(json.dumps(MATERIALS))
    lv, st, pd, rf = plan["levels_m"], plan["structure"], plan["podium"], plan["roof"]
    slabs = {s["name"]: s["z"] for s in st["slabs"]}
    datums = [st["ground_floor_level"], pd["entrance_detail"]["lintel_bottom"], pd["ground_lintel"][0],
              slabs["upper_podium"][0], slabs["upper_podium"][1], pd["upper"]["head"], slabs["podium_roof"][0],
              lv["podium_top"]] + lv["balcony_slab_tops"] + [lv["roof_slab_bottom"], lv["roof_slab_top"],
                                                             round(rf["roof_top"] + rf["penthouse"]["parapet_top"], 3)]
    datums = sorted({round(z, 4) for z in datums})
    jt = cfg["joints"]
    planes, bands = [], []
    for a, b in zip(datums, datums[1:]):
        n = max(1, round((b - a) / jt["course_target"]))
        bands.append({"z": [a, b], "courses": n, "course_m": round((b - a) / n, 4)})
        planes += [round(a + (b - a) * k / n, 4) for k in range(n + 1)]
    jt["datums"] = datums
    jt["bands"] = bands
    jt["course_planes"] = sorted(set(planes))
    cfg["soffit"]["rgb"] = plan["balconies"]["soffit_rgb"]
    cfg["comment"] = ("AI 648 materials: families -> TM_RB_* slots (re-dressed by name). Stone = the kit limestone "
                      "(assets/public/pbr/<set>, 4 m repeat) with joints cut as geometry: a groove of width w and depth d "
                      "with a bevel b each side, its floor in the joint material; course planes from the datums' bands, "
                      "vertical joints per flat face. Each panel gets its own UV offset (seeded) so the repeat does not show.")
    return cfg


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
    plan["balconies"] = balconies(plan, poly, radii)
    plan["podium"] = podium(plan, poly, radii)
    plan["roof"] = roof(plan, poly, radii)
    plan["materials"] = materials(plan)
    plan["props"] = {"balcony_plants": props_layout.balcony_plants(plan, P.BALCONY),       # AI 627
                     "podium_planters": props_layout.podium_planters(plan),               # AI 628
                     "roof_planters": props_layout.roof_planters(plan)}                   # AI 629
    plan["props"]["roof_furniture"] = props_layout.roof_furniture(plan)                    # AI 630 (needs roof_planters)
    plan["props"]["storefront_awnings"] = props_layout.storefront_awnings(plan)            # AI 631
    plan["props"]["sidewalk_cafe"] = props_layout.sidewalk_cafe(plan)                      # AI 632 (site dressing)
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
