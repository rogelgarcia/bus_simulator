"""props_layout.py -- the props' layouts of the Terra & Mar rebuild: the balcony planting (AI 627, from the planter slots
AI 645 reserved) and the podium's planter boxes (AI 628, below).

Pure Python (make_plan.py writes the results to plan["props"]["balcony_plants"] and ["podium_planters"]). b8 reads:
  - the front centre loggia (bay A1): a white pot with a leafy shrub at each end, in front of the wood reveal panels, on
    floors 2-4; one small shrub and a lounge set (two low chairs, a low table) on floor 5; a bistro set (a table and two
    chairs) between the pots on floor 3;
  - the other bays: one or two round white or grey pots per bay near its ends, with small olive-like trees, leafy shrubs
    and some low plants spilling over the rim.
Floor 1 is the podium-roof terrace, whose edge planters are AI 628's. Every choice comes from one seeded generator
per (floor, bay), so a bay keeps its planting when another changes, and no two balconies are alike.
"""
import math
import random

KINDS = {
    # target plant size above the soil (m), the pot it takes, the game models it is made from
    "olive": {"height": (1.6, 2.1), "radius": (0.38, 0.46), "models": ["silver_linden/mature_01", "silver_linden/mature_02",
                                                                     "silver_linden/mature_03"],
              "pot": {"radius": (0.22, 0.26), "height": (0.44, 0.54)}},
    "shrub": {"height": (0.85, 1.2), "radius": (0.34, 0.44), "models": ["arrowwood_viburnum/mature_01",
                                                                     "arrowwood_viburnum/mature_02",
                                                                     "arrowwood_viburnum/mature_03"],
              "pot": {"radius": (0.20, 0.25), "height": (0.40, 0.50)}},
    "spill": {"height": (0.30, 0.45), "radius": (0.26, 0.32), "models": ["arrowwood_viburnum/mature_01",
                                                                     "arrowwood_viburnum/mature_02",
                                                                     "arrowwood_viburnum/mature_03"],
              "pot": {"radius": (0.20, 0.23), "height": (0.34, 0.42)}, "tilt_deg": (10.0, 20.0)},
}
POT_COLOURS = [("white", 0.65), ("light_grey", 0.25), ("charcoal", 0.10)]
OTHER_BAY = {"both": 0.75, "one": 0.25}       # b8: a plant at nearly every bay end, and plants over the rail
KIND_WEIGHTS = [("olive", 0.5), ("shrub", 0.35), ("spill", 0.15)]
CENTRE_BAY = "A1"
INWARD = 0.12                 # pots move this far in from the reserved slot, off the guard, so the crowns stay inside


def pick(rng, weighted):
    r, acc = rng.random(), 0.0
    for name, w in weighted:
        acc += w
        if r < acc:
            return name
    return weighted[-1][0]


def uniform(rng, lo_hi):
    return rng.uniform(*lo_hi)


def plant(rng, kind, at, z, outward):
    k = KINDS[kind]
    pot_r, pot_h = uniform(rng, k["pot"]["radius"]), uniform(rng, k["pot"]["height"])
    colour = pick(rng, POT_COLOURS)
    rec = {"kind": kind, "at": [round(at[0], 4), round(at[1], 4)], "z": round(z, 4),
           "pot": {"radius": round(pot_r, 3), "height": round(pot_h, 3), "colour": colour},
           "model": rng.choice(k["models"]), "height": round(uniform(rng, k["height"]), 3),
           "radius": round(uniform(rng, k["radius"]), 3), "rot_deg": round(rng.uniform(0.0, 360.0), 1)}
    if kind == "olive":                    # a second, smaller linden form turned against the first fills the crown
        models = k["models"]
        rec["companion"] = {"model": models[(models.index(rec["model"]) + 1) % len(models)],
                            "rot_deg": round((rec["rot_deg"] + rng.uniform(110.0, 160.0)) % 360.0, 1),
                            "height": round(rec["height"] * rng.uniform(0.82, 0.92), 3), "radius": round(rec["radius"] * 0.95, 3)}
    if "tilt_deg" in k:                                               # lean out over the rim, towards the guard
        rec["tilt_deg"] = round(uniform(rng, k["tilt_deg"]), 1)
        rec["tilt_towards"] = [round(outward[0], 4), round(outward[1], 4)]
    return rec


def balcony_plants(plan, balcony_depth, seed=627, floors=(2, 3, 4, 5)):
    lv = plan["levels_m"]
    tops = {1: lv["podium_top"], **{i + 2: t for i, t in enumerate(lv["balcony_slab_tops"])}}
    paving = plan["balconies"]["paving"]
    bays = {b["id"]: b for b in plan["envelope"]["bays"]}
    by_bay = {}
    for s in plan["balconies"]["planter_slots"]:
        if s["floor"] in floors:
            by_bay.setdefault((s["floor"], s["bay"]), []).append(s)
    pots, sets = [], []
    for (floor, bay_id), slots in sorted(by_bay.items()):
        bay = bays[bay_id]
        N, U = bay["outward"], bay["along"]
        rng = random.Random(f"{seed}:{floor}:{bay_id}")
        z = tops[floor] + paving
        inward = lambda p: (p[0] - N[0] * INWARD, p[1] - N[1] * INWARD)  # noqa: E731
        if bay_id == CENTRE_BAY:
            if floor == 5:                                            # b8: one small plant at the right end
                right = max(slots, key=lambda s: s["at"][0] * U[0] + s["at"][1] * U[1])
                pots.append({"floor": floor, "bay": bay_id, **plant(rng, "shrub", inward(right["at"]), z, N)})
            else:
                for s in slots:
                    rec = plant(rng, "shrub", inward(s["at"]), z, N)
                    rec["pot"]["colour"] = "white"                    # b8: white pots before the wood panels
                    pots.append({"floor": floor, "bay": bay_id, **rec})
            mid = (bay["a"][0] + U[0] * bay["length"] / 2, bay["a"][1] + U[1] * bay["length"] / 2)
            if floor in (3, 5):
                sets.append({"floor": floor, "bay": bay_id, "kind": "lounge" if floor == 5 else "bistro", "z": round(z, 4),
                             "centre": [round(mid[0] + N[0] * 0.70, 4), round(mid[1] + N[1] * 0.70, 4)],
                             "along": U, "outward": N, "rot_deg": round(rng.uniform(-6.0, 6.0), 1)})
            continue
        mode = pick(rng, list(OTHER_BAY.items()))
        chosen = slots if mode == "both" else ([rng.choice(slots)] if mode == "one" else [])
        for s in chosen:
            pots.append({"floor": floor, "bay": bay_id, **plant(rng, pick(rng, KIND_WEIGHTS), inward(s["at"]), z, N)})
    counts = {}
    for p in pots:
        counts[p["kind"]] = counts.get(p["kind"], 0) + 1
    return {"comment": "AI 627 balcony planting: pots at the reserved slots (moved %.2f m in from the guard), floors %s; the "
                       "plant sizes are targets above the soil (height, crown radius) the layer fits the game models to"
                       % (INWARD, list(floors)),
            "seed": seed, "floors": list(floors), "pots": pots, "sets": sets, "counts": counts,
            # the room a plant has, as offsets from the wall line along each bay's outward normal: the guard glass's
            # inner face and the window frames' outer face (the layer's clearance check)
            "guard_inner_v": round(balcony_depth - plan["balconies"]["guard_inset"] - plan["balconies"]["glass"] / 2, 4),
            "frame_outer_v": round(plan["envelope"]["frame_depth"] / 2, 4)}


# ---------------------------------------------------------------- AI 628: the podium's planter boxes
# b8 reads three runs of planting on the podium:
#   upper    long boxes of dense greenery at the base of the upper-podium glazing, behind its guard (every podium bay)
#   edge     low flower troughs behind the floor-1 guard along the podium top (runs H, A, B); the short boxes beside the
#            front pilasters hold taller shrubs
#   terrace  on the entrance roof: a flower trough along the front guard and a tall leafy plant in a square planter at
#            each front corner
# Boxes are modules of at most MODULE_MAX with a small gap between; the edge run's corners stay free (the guard rounds
# them). Each box records the planes its foliage must stay behind (guard glass, glazing frames) for the layer's check.
PODIUM_BOX = {
    "upper": {"height": 0.50, "greens": {"height": (0.45, 0.75), "radius": (0.20, 0.23), "spacing": 0.40, "rows": 2},
              "flowers_per_m": 8},
    "edge": {"depth": 0.42, "height": 0.40, "greens": {"height": (0.24, 0.40), "radius": (0.17, 0.21), "spacing": 0.30},
             "flowers_per_m": 70, "tall": {"height": (0.90, 1.15), "radius": (0.22, 0.26)}},
    "terrace": {"depth": 0.40, "height": 0.40, "corner": 0.55, "corner_height": 0.55, "corner_flowers": 25,
                "greens": {"height": (0.24, 0.40), "radius": (0.15, 0.19), "spacing": 0.30}, "flowers_per_m": 70,
                "tall": {"height": (1.10, 1.40), "radius": (0.28, 0.32)}},
}
MODULE_MAX, MODULE_GAP, END_GAP, CORNER_FREE, GUARD_GAP = 2.4, 0.04, 0.04, 0.70, 0.05
SHRUBS = KINDS["shrub"]["models"]


def _modules(s0, s1):
    """Equal modules of at most MODULE_MAX between s0 and s1, MODULE_GAP apart."""
    n = max(1, math.ceil((s1 - s0 + MODULE_GAP) / (MODULE_MAX + MODULE_GAP)))
    w = (s1 - s0 - (n - 1) * MODULE_GAP) / n
    return [(s0 + k * (w + MODULE_GAP), s0 + k * (w + MODULE_GAP) + w) for k in range(n)]


def _frame(p, U, N):
    """A point at (s along U, v along N) from p."""
    return lambda s, v: (p[0] + U[0] * s + N[0] * v, p[1] + U[1] * s + N[1] * v)


def _box(at, s0, s1, v0, v1):
    loop = [at(s0, v0), at(s1, v0), at(s1, v1), at(s0, v1)]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(loop, loop[1:] + loop[:1]))
    return [[round(x, 4), round(y, 4)] for x, y in (loop if area > 0 else list(reversed(loop)))]


def _plant(rng, xy, z_soil, size):
    return {"model": rng.choice(SHRUBS), "at": [round(xy[0], 4), round(xy[1], 4)], "z": round(z_soil, 4),
            "height": round(uniform(rng, size["height"]), 3), "radius": round(uniform(rng, size["radius"]), 3),
            "rot_deg": round(rng.uniform(0.0, 360.0), 1)}


def _greens(rng, at, s0, s1, v_mid, z_soil, g, depth=0.0):
    """Shrub forms along a box, evenly spaced with a seeded jitter: on its centre line, or in g["rows"] staggered rows
    across its depth."""
    rows = g.get("rows", 1)
    n = max(1, round((s1 - s0) / g["spacing"]))
    step = (s1 - s0) / n
    out = []
    for r in range(rows):
        v = v_mid + (r - (rows - 1) / 2) * depth / (rows + 1)          # rows at thirds of the depth (two rows)
        stagger = 0.5 * r if rows > 1 else 0.0
        for k in range(n - (1 if stagger else 0)):
            s = s0 + (k + 0.5 + stagger + rng.uniform(-0.2, 0.2)) * step
            vv = v + rng.uniform(-0.015, 0.015)
            plant = _plant(rng, at(s, vv), z_soil, g)
            rad = plant["radius"]                                    # the crown stays over the box: clear of its ends
            s = min(max(s, s0 + rad), s1 - rad) if s1 - s0 > 2 * rad else (s0 + s1) / 2
            plant["at"] = [round(c, 4) for c in at(s, vv)]
            out.append(plant)
    return out


def _plane(xy, n):
    return {"p": [round(xy[0], 4), round(xy[1], 4)], "n": [round(n[0], 6), round(n[1], 6)]}


def podium_planters(plan, seed=628):
    pd, b, lv = plan["podium"], plan["balconies"], plan["levels_m"]
    glass_half, shoe_half = b["glass"] / 2, b["shoe"]["width"] / 2
    runs = {r["run"]: r for r in pd["runs"]}
    boxes = []

    def add(kind, box_id, loop, z, height, plants, flowers, guards):
        boxes.append({"id": box_id, "kind": kind, "loop": loop, "z": round(z, 4), "height": height, "plants": plants,
                      "flowers": int(round(flowers)), "keep_behind": guards})

    # upper: the strips AI 646 reserved at the base of the upper-recess glazing
    cfg = PODIUM_BOX["upper"]
    for strip in pd["props"]["upper_planter_boxes_ai628"]:
        r = runs[strip["run"]]
        at = _frame(r["p"], r["along"], r["outward"])
        N = r["outward"]
        (s0, s1), (v0, v1), z = strip["s"], strip["v"], strip["z"]
        rng = random.Random(f"{seed}:upper:{strip['bay']}")
        guards = [_plane(at(0.0, pd["guard_v"] - glass_half), N),                                   # the guard glass
                  _plane(at(0.0, pd["upper"]["plane_v"] + pd["frame_depth"] / 2), (-N[0], -N[1]))]  # the glazing frames
        soil = z + cfg["height"] - 0.04
        for j, (m0, m1) in enumerate(_modules(s0 + END_GAP, s1 - END_GAP)):
            add("upper", f"upper_{strip['bay']}_{j}", _box(at, m0, m1, v0, v1), z, cfg["height"],
                _greens(rng, at, m0, m1, (v0 + v1) / 2, soil, cfg["greens"], depth=v1 - v0),
                cfg["flowers_per_m"] * (m1 - m0), guards)

    # edge: behind the floor-1 guard along the podium top; a strip end met by another run's strip, or the run's open
    # end, is a corner the guard rounds: it stays free
    cfg = PODIUM_BOX["edge"]
    strips = b["podium_planter_strips"]
    z = lv["podium_top"] + b["paving"]
    soil = z + cfg["height"] - 0.04
    v_out, v_in = -(shoe_half + GUARD_GAP), -(shoe_half + GUARD_GAP + cfg["depth"])

    def corner(k, end):
        q = strips[k][end]
        if (k == 0 and end == "from") or (k == len(strips) - 1 and end == "to"):
            return True
        return any(o["run"] != strips[k]["run"] and min(math.dist(q, o["from"]), math.dist(q, o["to"])) < 1e-3
                   for i, o in enumerate(strips) if i != k)
    for k, st in enumerate(strips):
        a, c = st["from"], st["to"]
        length = math.dist(a, c)
        U = ((c[0] - a[0]) / length, (c[1] - a[1]) / length)
        N = runs[st["run"]]["outward"]
        at = _frame(a, U, N)
        rng = random.Random(f"{seed}:edge:{k}")
        guards = [_plane(at(0.0, -glass_half), N)]
        s0 = CORNER_FREE if corner(k, "from") else END_GAP
        s1 = length - (CORNER_FREE if corner(k, "to") else END_GAP)
        short = length < 2.0                                          # the boxes beside the front pilasters
        for j, (m0, m1) in enumerate(_modules(s0, s1)):
            v_mid = (v_out + v_in) / 2
            plants = _greens(rng, at, m0, m1, v_mid, soil, cfg["greens"])
            if short:
                plants.insert(0, _plant(rng, at((m0 + m1) / 2, v_mid), soil, cfg["tall"]))
            add("edge", f"edge_{st['run']}{k}_{j}", _box(at, m0, m1, v_in, v_out), z, cfg["height"], plants,
                cfg["flowers_per_m"] * (m1 - m0), guards)

    # terrace: the entrance roof, inside its guard (sides at x = +-gx, front at y = gy)
    cfg = PODIUM_BOX["terrace"]
    ent = pd["entrance"]
    gx = ent["half_width"] - abs(pd["guard_v"])
    gy = ent["y_front"] + abs(pd["guard_v"])
    z = lv["ground_floor_top"] + pd["paving"]
    rng = random.Random(f"{seed}:terrace")
    x_out = gx - shoe_half - GUARD_GAP
    y0 = gy + shoe_half + GUARD_GAP
    at = _frame((0.0, 0.0), (1.0, 0.0), (0.0, 1.0))
    front = _plane((0.0, gy + glass_half), (0.0, -1.0))
    cw, ch = cfg["corner"], cfg["corner_height"]
    for sgn in (-1, 1):
        x0, x1 = sorted((sgn * x_out, sgn * (x_out - cw)))
        add("terrace", f"terrace_corner_{'left' if sgn < 0 else 'right'}", _box(at, x0, x1, y0, y0 + cw), z, ch,
            [_plant(rng, ((x0 + x1) / 2, y0 + cw / 2), z + ch - 0.04, cfg["tall"])], cfg["corner_flowers"],
            [front, _plane((sgn * (gx - glass_half), 0.0), (float(sgn), 0.0))])
    soil = z + cfg["height"] - 0.04
    for j, (m0, m1) in enumerate(_modules(-x_out + cw + MODULE_GAP, x_out - cw - MODULE_GAP)):
        add("terrace", f"terrace_front_{j}", _box(at, m0, m1, y0, y0 + cfg["depth"]), z, cfg["height"],
            _greens(rng, at, m0, m1, y0 + cfg["depth"] / 2, soil, cfg["greens"]), cfg["flowers_per_m"] * (m1 - m0), [front])

    counts = {}
    for bx in boxes:
        counts[bx["kind"]] = counts.get(bx["kind"], 0) + 1
    return {"comment": "AI 628 podium planters: dark-metal boxes (modules of at most %.1f m) on the upper recesses, behind "
                       "the floor-1 guard (runs H, A, B) and on the entrance terrace. Plants are the game's viburnum forms "
                       "fitted to a target height and crown radius; 'flowers' is the number of seeded flower heads the layer "
                       "scatters over a box; 'keep_behind' lists the planes (point, outward normal) its foliage must stay "
                       "behind: the guard glass and, on the upper recesses, the glazing frames" % MODULE_MAX,
            "seed": seed, "boxes": boxes, "counts": counts, "plants": sum(len(bx["plants"]) for bx in boxes),
            "flowers": sum(bx["flowers"] for bx in boxes), "config": PODIUM_BOX}


# ---------------------------------------------------------------- AI 629: the roof terrace's planters and trees
# b8 shows small palms and spiky rosettes (yucca / cycad-like) behind the roof guard against the sky, in clusters at the
# front corners and along the chamfers, and low planting along the front between them. The aerial shows the perimeter
# band all round and planter islands: one at the penthouse's front-left corner, a row of square planters between the
# front lounge and the penthouse, and one by the right-hand lounge (clear of AI 630's seating zones and the doors).
ROOF_BOX = {"depth": 0.63, "height": 0.30, "guard_gap": 0.03, "island_height": 0.50, "material": "TM_RB_paving",
            "greens": {"height": (0.35, 0.65), "radius": (0.25, 0.31), "spacing": 0.36},
            "inner_greens": {"height": (0.45, 0.80), "radius": (0.32, 0.42), "spacing": 0.55, "v": -0.62},
            "feature_v": -0.58, "fill_every": 2.6, "fill_kinds": [("cycad", 0.5), ("spiky", 0.3), ("olive", 0.2)],
            "island_scale": {"height": 1.15, "radius": 1.5},
            # palm: the detailed palm's compact fan crown (2026-10-14) reads as b8's roof palms on a shorter stem
            "kinds": {"palm": {"height": (1.8, 2.3), "radius": (0.48, 0.54), "models": ["proc/palm_0", "proc/palm_1", "proc/palm_2"]},
                      "cycad": {"height": (1.3, 1.9), "radius": (0.46, 0.54), "models": ["proc/cycad_0", "proc/cycad_1", "proc/cycad_2"]},
                      "spiky": {"height": (1.1, 1.6), "radius": (0.36, 0.46), "models": ["proc/spiky_0", "proc/spiky_1", "proc/spiky_2"]},
                      "olive": {"height": (1.6, 2.1), "radius": (0.40, 0.50), "models": KINDS["olive"]["models"]}}}
# feature clusters by place: corners (named by the runs they join) and straight-run midpoints; A's middle stays low (b8)
# feature clusters by place: corners (named by the runs they join) and straight-run midpoints; A's middle stays low (b8).
# Besides the clusters, every run but A carries a fill plant each fill_every metres (the aerial's continuous band).
ROOF_CLUSTERS = {"HA": ["cycad", "palm", "cycad", "spiky"], "AB": ["spiky", "cycad", "palm", "cycad"], "BC": ["cycad", "olive"],
                 "GH": ["olive", "cycad"], "CD": ["olive", "cycad"], "DE": ["palm", "cycad"], "EF": ["cycad", "palm"],
                 "FG": ["cycad", "olive"], "B": ["cycad", "spiky", "cycad"], "H": ["cycad", "spiky", "cycad"],
                 "D": ["olive", "palm"], "F": ["palm", "olive"], "C": ["cycad"], "G": ["cycad"], "E": ["spiky"]}
ROOF_ISLANDS = [{"id": "penthouse_left", "rect": [-7.6, -5.6, -3.2, -1.7], "kinds": ["palm", "cycad"], "shrubs": 3},
                {"id": "row_1", "rect": [-4.95, -3.85, -4.55, -3.45], "kinds": ["olive"], "shrubs": 2},
                {"id": "row_2", "rect": [-2.15, -1.05, -4.55, -3.45], "kinds": ["cycad"], "shrubs": 2},
                {"id": "row_3", "rect": [1.05, 2.15, -4.55, -3.45], "kinds": ["palm"], "shrubs": 2},
                {"id": "row_4", "rect": [3.85, 4.95, -4.55, -3.45], "kinds": ["olive"], "shrubs": 2},
                {"id": "lounge_right", "rect": [5.6, 7.6, -3.2, -1.7], "kinds": ["cycad", "olive"], "shrubs": 3}]
RUN_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H"]


def _offset_left(path, d):
    """An open polyline moved d to its left (inward for a counter-clockwise loop), mitred at the joints."""
    n = len(path)
    dirs = [((b[0] - a[0]) / math.dist(a, b), (b[1] - a[1]) / math.dist(a, b)) for a, b in zip(path, path[1:])]
    lefts = [(-dy, dx) for dx, dy in dirs]
    out = []
    for i in range(n):
        if i == 0 or i == n - 1:
            m = lefts[0] if i == 0 else lefts[-1]
        else:
            a, b = lefts[i - 1], lefts[i]
            k = 1.0 + a[0] * b[0] + a[1] * b[1]
            m = ((a[0] + b[0]) / k, (a[1] + b[1]) / k)
        out.append((path[i][0] + m[0] * d, path[i][1] + m[1] * d))
    return out


class Ring:
    """The terrace's outer loop (counter-clockwise, just inside the guard shoe) by arc length, from a start vertex."""

    def __init__(self, loop, start):
        self.pts = loop[start:] + loop[:start]
        self.cum = [0.0]
        for a, b in zip(self.pts, self.pts[1:] + self.pts[:1]):
            self.cum.append(self.cum[-1] + math.dist(a, b))
        self.length = self.cum[-1]

    def seg(self, s):
        s %= self.length
        i = max(k for k in range(len(self.pts)) if self.cum[k] <= s)
        return i, s - self.cum[i]

    def at(self, s, v=0.0):
        """The point at arc length s, moved v along the loop's outward normal (v < 0 is inside)."""
        i, ds = self.seg(s)
        a, b = self.pts[i], self.pts[(i + 1) % len(self.pts)]
        L = math.dist(a, b)
        t = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        return (a[0] + t[0] * ds + t[1] * v, a[1] + t[1] * ds - t[0] * v)

    def path(self, s0, s1):
        """The loop's points from arc length s0 to s1 (s1 > s0, both within one turn)."""
        out = [self.at(s0)]
        for k in range(len(self.pts) + 1):
            c = self.cum[k] if k < len(self.pts) else self.length
            if s0 < c < s1:
                out.append(self.pts[k % len(self.pts)])
        out.append(self.at(s1))
        return [q for i, q in enumerate(out) if i == 0 or math.dist(q, out[i - 1]) > 1e-6]


def _feature(rng, kind, xy, z_soil):
    k = ROOF_BOX["kinds"][kind]
    rec = {"kind": kind, "model": rng.choice(k["models"]), "at": [round(xy[0], 4), round(xy[1], 4)], "z": round(z_soil, 4),
           "height": round(uniform(rng, k["height"]), 3), "radius": round(uniform(rng, k["radius"]), 3),
           "rot_deg": round(rng.uniform(0.0, 360.0), 1)}
    if kind == "olive":
        models = k["models"]
        rec["companion"] = {"model": models[(models.index(rec["model"]) + 1) % len(models)],
                            "rot_deg": round((rec["rot_deg"] + rng.uniform(110.0, 160.0)) % 360.0, 1),
                            "height": round(rec["height"] * rng.uniform(0.82, 0.92), 3), "radius": round(rec["radius"] * 0.95, 3)}
    return rec


def roof_planters(plan, seed=629):
    rf = plan["roof"]
    cfg = ROOF_BOX
    loop = [tuple(q) for q in rf["props"]["terrace_planters_ai629"]["outer"]]
    n = len(loop)
    segs = [math.dist(loop[k], loop[(k + 1) % n]) for k in range(n)]
    straight = [k for k in range(n) if segs[k] > 0.5]                 # the eight runs; the short segments are the arcs
    # name the straight runs by their outward normals against the podium runs'
    runs = {r["run"]: r["outward"] for r in plan["podium"]["runs"]}
    names = {}
    for k in straight:
        a, b = loop[k], loop[(k + 1) % n]
        t = ((b[0] - a[0]) / segs[k], (b[1] - a[1]) / segs[k])
        out = (t[1], -t[0])
        names[k] = max(runs, key=lambda r: out[0] * runs[r][0] + out[1] * runs[r][1])
    start = next(k for k in straight if names[k] == "E")              # modules start at the rear
    ring = Ring(loop, start)
    z = rf["roof_top"] + rf["paving"]
    soil = z + cfg["height"] - 0.04
    gap = MODULE_GAP
    # pieces in ring order: each straight run, then the arc after it
    pieces = []
    order = straight[straight.index(start):] + straight[:straight.index(start)]
    for idx, k in enumerate(order):
        s0 = ring.cum[(k - start) % n]
        s1 = s0 + segs[k]
        nxt = order[(idx + 1) % len(order)]
        s2 = ring.cum[(nxt - start) % n] if idx + 1 < len(order) else ring.length
        pieces.append(("run", names[k], s0, s1))
        pieces.append(("corner", names[k] + names[nxt], s1, s2))
    boxes, features = [], []
    rng = random.Random(f"{seed}:ring")
    v_out, v_in = -cfg["guard_gap"], -(cfg["guard_gap"] + cfg["depth"])
    for kind, name, s0, s1 in pieces:
        mods = _modules(s0 + gap / 2, s1 - gap / 2) if kind == "run" else [(s0 + gap / 2, s1 - gap / 2)]
        for j, (m0, m1) in enumerate(mods):
            path = ring.path(m0, m1)
            outer, inner = _offset_left(path, -v_out), _offset_left(path, -v_in)
            foot = [[round(x, 4), round(y, 4)] for x, y in outer + list(reversed(inner))]
            nn = max(1, round((m1 - m0) / cfg["greens"]["spacing"]))
            greens = []
            for g in range(nn):
                s = m0 + (g + 0.5 + rng.uniform(-0.2, 0.2)) * (m1 - m0) / nn
                plant = _plant(rng, ring.at(s, (v_out + v_in) / 2 + rng.uniform(-0.03, 0.03)), soil, cfg["greens"])
                greens.append(plant)
            ig = cfg["inner_greens"]                                  # a fuller inner row, leaning over the terrace
            for g in range(max(1, round((m1 - m0) / ig["spacing"]))):
                s = m0 + (g + 0.5 + rng.uniform(-0.2, 0.2)) * (m1 - m0) / max(1, round((m1 - m0) / ig["spacing"]))
                greens.append(_plant(rng, ring.at(s, ig["v"] + rng.uniform(-0.02, 0.02)), soil, ig))
            boxes.append({"id": f"ring_{name}_{j}", "kind": "ring", "loop": foot, "z": round(z, 4), "height": cfg["height"],
                          "path": [[round(x, 4), round(y, 4)] for x, y in path], "v": [v_in, v_out], "plants": greens})
        cluster = ROOF_CLUSTERS.get(name, [])
        taken = []
        if cluster:
            mid = (s0 + s1) / 2
            spread = 0.55 if kind == "corner" else 0.9
            for i, kd in enumerate(cluster):
                s = mid + (i - (len(cluster) - 1) / 2) * spread + rng.uniform(-0.08, 0.08)
                taken.append(s)
                features.append({"place": name, **_feature(rng, kd, ring.at(s, cfg["feature_v"]), soil)})
        if kind == "run" and name != "A":                             # the fill plants along the run
            nf = max(0, int((s1 - s0) // cfg["fill_every"]))
            for i in range(nf):
                s = s0 + (i + 0.5) * (s1 - s0) / nf
                if any(abs(s - t) < 0.9 for t in taken):
                    continue
                features.append({"place": name, **_feature(rng, pick(rng, cfg["fill_kinds"]), ring.at(s, cfg["feature_v"]), soil)})
    for isl in ROOF_ISLANDS:
        x0, x1, y0, y1 = isl["rect"]
        irng = random.Random(f"{seed}:island:{isl['id']}")
        isoil = z + cfg["island_height"] - 0.04
        plants = []
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        span = max(x1 - x0, y1 - y0)
        for i, kd in enumerate(isl["kinds"]):
            off = (i - (len(isl["kinds"]) - 1) / 2) * span * 0.45
            xy = (cx + off, cy) if x1 - x0 >= y1 - y0 else (cx, cy + off)
            f = _feature(irng, kd, xy, isoil)                         # islands stand in the open: larger plants
            f["height"] = round(f["height"] * cfg["island_scale"]["height"], 3)
            f["radius"] = round(f["radius"] * cfg["island_scale"]["radius"], 3)
            if "companion" in f:
                f["companion"]["height"] = round(f["companion"]["height"] * cfg["island_scale"]["height"], 3)
                f["companion"]["radius"] = round(f["companion"]["radius"] * cfg["island_scale"]["radius"], 3)
            features.append({"place": isl["id"], **f})
        for i in range(isl["shrubs"]):
            plants.append(_plant(irng, (irng.uniform(x0 + 0.2, x1 - 0.2), irng.uniform(y0 + 0.2, y1 - 0.2)), isoil,
                                 {"height": (0.40, 0.65), "radius": (0.22, 0.30)}))
        boxes.append({"id": f"island_{isl['id']}", "kind": "island", "loop": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                      "z": round(z, 4), "height": cfg["island_height"], "plants": plants})
    counts = {}
    for f in features:
        counts[f["kind"]] = counts.get(f["kind"], 0) + 1
    return {"comment": "AI 629 roof planters: a perimeter ring of low limestone troughs (modules of at most %.1f m, one per "
                       "corner arc) just inside the guard, planted with low viburnum; feature clusters (procedural cycads, "
                       "palms and spiky rosettes, linden olives) at the corners and run midpoints and fill plants along the "
                       "runs -- none along the front's middle, as b8 -- and planter islands after the aerial. 'keep_inside' "
                       "is the loop the perimeter foliage must stay inside (the guard shoe's inner line)" % MODULE_MAX,
            "seed": seed, "boxes": boxes, "features": features, "feature_counts": counts,
            "shrubs": sum(len(b["plants"]) for b in boxes), "keep_inside": [list(q) for q in loop], "config": ROOF_BOX,
            "clusters": ROOF_CLUSTERS, "islands": ROOF_ISLANDS}


# ---------------------------------------------------------------- AI 630: the roof terrace's furniture
# The aerial furnishes the terrace with a long dining table and about eight chairs on the west (along the H chamfer), a
# lounge group of sofas and a coffee table on the east (along the B chamfer) and more lounge chairs at the front centre.
# Each group stands in the frame of its run of the terrace loop (u along the run, v inward from the guard shoe's inner
# line), far enough in to stay out of CAM_B8's view and clear of AI 629's planting (its ring reaches about 1.1 m in).
# Every item has a facing (its local front, +v) in world terms; the layer models the pieces.
CUSHIONS = [("offwhite", 0.5), ("ecru", 0.3), ("greige", 0.2)]
ROOF_GROUPS = [
    {"id": "dining", "run": "H", "u": 0.4, "v": 2.6, "items": [
        ("dining_table", 0.0, 0.0, "in")]
        + [("dining_chair", du, -0.80, "in") for du in (-0.8, 0.0, 0.8)]
        + [("dining_chair", du, 0.80, "out") for du in (-0.8, 0.0, 0.8)]
        + [("dining_chair", -1.55, 0.0, "+u"), ("dining_chair", 1.55, 0.0, "-u")]},
    {"id": "lounge", "run": "B", "u": -0.9, "v": 2.7, "items": [                 # an L: the armchairs flank the table
        ("coffee_table", 0.0, 0.0, "in"), ("sofa", 0.0, -1.0, "in"), ("armchair", -1.55, 0.1, "+u"),
        ("armchair", 1.55, 0.1, "-u"), ("side_table", -1.3, -1.0, "in"), ("side_table", 1.3, -1.0, "in")]},
    {"id": "front_centre", "run": "A", "u": 0.0, "v": 3.6, "items": [               # a lounger's front is its foot end
        ("low_table", 0.0, 0.0, "in"), ("armchair", -0.95, 0.0, "+u"), ("armchair", 0.95, 0.0, "-u"),
        ("lounger", -3.4, -0.9, "out"), ("lounger", 3.4, -0.9, "out")]},           # feet towards the view
]
CLEAR_OF_GUARD = 1.2          # every footprint corner at least this far inside the guard shoe's inner line
ITEM_SIZE = {"dining_table": (2.4, 0.95), "dining_chair": (0.48, 0.52), "sofa": (2.1, 0.9), "armchair": (0.85, 0.85),
             "coffee_table": (1.1, 0.6), "low_table": (0.9, 0.55), "side_table": (0.44, 0.44), "lounger": (0.7, 2.0)}


def roof_furniture(plan, seed=630):
    rp = plan["props"]["roof_planters"]
    loop = [tuple(q) for q in rp["keep_inside"]]
    n = len(loop)
    runs = {r["run"]: r["outward"] for r in plan["podium"]["runs"]}
    frames = {}
    for k in range(n):
        a, b = loop[k], loop[(k + 1) % n]
        L = math.dist(a, b)
        if L < 0.5:
            continue
        U = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        out = (U[1], -U[0])
        name = max(runs, key=lambda r: out[0] * runs[r][0] + out[1] * runs[r][1])
        frames[name] = {"mid": ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), "U": U, "N": (-U[1], U[0])}   # N inward
    items = []
    for g in ROOF_GROUPS:
        f = frames[g["run"]]
        U, N = f["U"], f["N"]
        rng = random.Random(f"{seed}:{g['id']}")
        cushion = pick(rng, CUSHIONS)
        c = (f["mid"][0] + U[0] * g["u"] + N[0] * g["v"], f["mid"][1] + U[1] * g["u"] + N[1] * g["v"])
        faces = {"in": N, "out": (-N[0], -N[1]), "+u": U, "-u": (-U[0], -U[1])}
        for kind, du, dv, face in g["items"]:
            jitter = 0.02 if kind in ("dining_chair", "armchair") else 0.0
            at = (c[0] + U[0] * du + N[0] * dv + rng.uniform(-jitter, jitter), c[1] + U[1] * du + N[1] * dv + rng.uniform(-jitter, jitter))
            fx, fy = faces[face]
            turn = math.radians(rng.uniform(-4.0, 4.0)) if jitter else 0.0
            fx, fy = fx * math.cos(turn) - fy * math.sin(turn), fx * math.sin(turn) + fy * math.cos(turn)
            items.append({"group": g["id"], "kind": kind, "at": [round(at[0], 4), round(at[1], 4)],
                          "face": [round(fx, 5), round(fy, 5)], "size": list(ITEM_SIZE[kind]), "cushion": cushion})
    return {"comment": "AI 630 roof furniture after the aerial: groups in the frames of their terrace runs (u along, v in "
                       "from the guard shoe's inner line); 'face' is each item's front (its local +v); 'size' its footprint "
                       "(width along its local u, depth along v). The layer checks every footprint against the guard "
                       "(at least clear_of_guard_m inside), the islands and the penthouse, and tags the pieces "
                       "rb_hide_from_b8 for the CAM_B8 sightline check.",
            "seed": seed, "z": round(plan["roof"]["roof_top"] + plan["roof"]["paving"], 4), "items": items,
            "clear_of_guard_m": CLEAR_OF_GUARD, "groups": [g["id"] for g in ROOF_GROUPS]}


# ---------------------------------------------------------------- AI 631: the storefront canopies
# b8: dark charcoal canopies with a slatted surface sloping down and out over each chamfer storefront, from pier to pier
# (about 24 degrees: at 12 the canopies read edge-on from CAM_B8, where b8 shows a clear slatted band),
# none over the entrance; a dark front fascia and thin diagonal tie rods to the wall; the side faces carry them too (the
# aerial). AI 646 reserved one per podium bay (all 13). Each hangs from a plate on the storefront's head panel just under
# the stone lintel and slopes down and out past the pier faces; its rods end flat on the lintel's face.
AWNING = {"slope_deg": 24.0, "back_top": 4.70, "plate": [0.04, 0.12], "end_gap": 0.02, "rail": [0.04, 0.08],
          "fascia": [0.04, 0.14], "slat": [0.05, 0.02], "slat_pitch": 0.09, "rod": 0.018, "rod_anchor_z": 5.22,
          "rod_end_inset": 0.25, "rod_every": 2.4}


def storefront_awnings(plan):
    pd = plan["podium"]
    runs = {r["run"]: r for r in pd["runs"]}
    v_back = pd["storefront"]["plane_v"] + pd["frame_depth"] / 2         # the storefront frames' outer face
    out = []
    for a in pd["props"]["awnings_ai631"]:
        r = runs[a["run"]]
        s0, s1 = a["s"][0] + AWNING["end_gap"], a["s"][1] - AWNING["end_gap"]
        v_front = a["projection"]
        drop = (v_front - v_back) * math.tan(math.radians(AWNING["slope_deg"]))
        n_rods = max(2, 1 + math.ceil((s1 - s0 - 2 * AWNING["rod_end_inset"]) / AWNING["rod_every"]))
        rods = [round(s0 + AWNING["rod_end_inset"] + k * (s1 - s0 - 2 * AWNING["rod_end_inset"]) / (n_rods - 1), 4)
                for k in range(n_rods)]
        out.append({"run": a["run"], "bay": a["bay"], "p": r["p"], "along": r["along"], "outward": r["outward"],
                    "s": [round(s0, 4), round(s1, 4)], "v": [round(v_back, 4), round(v_front, 4)],
                    "z_top": [AWNING["back_top"], round(AWNING["back_top"] - drop, 4)], "rods": rods})
    return {"comment": "AI 631 storefront canopies, one per podium bay: s along the bay between the pier faces, v from the "
                       "storefront frames' outer face out past the podium outline (v 0), the slat plane's top falling from "
                       "z_top[0] to z_top[1]; tie rods at 'rods' (s) from the fascia to the lintel face at rod_anchor_z",
            "config": AWNING, "lintel_bottom": pd["ground_lintel"][0], "canopies": out}


# ---------------------------------------------------------------- AI 632: the sidewalk café (site dressing)
# b8: cream octagonal market umbrellas on wood poles over round wood tables with brown woven bistro chairs, just in
# front of the chamfer storefronts on both sides of the entrance (about two per bay). It belongs to the street: the site
# layer builds it, with a sidewalk slab along the front runs (H, A, B), outside the building's root collection. The
# umbrella (cafe_umbrella.py, 2026-10-14): its octagon inside the half-width square, the canopy's rim at the rib tips
# and its cone apex on the axis, above the sidewalk (b8's canopy rises 0.27-0.28 of its half-width to the vent cap:
# apex 2.66, not the square shells' 2.75), b8's short valance, the pole through the table's hole.
CAFE = {"sets_per_bay": 2, "v": 2.4, "s_jitter": 0.15, "chair_radius": 0.62, "chairs": [(2, 0.3), (3, 0.3), (4, 0.4)],
        "umbrella": {"half": 1.1, "rim_z": 2.25, "apex_z": 2.66, "valance": 0.06, "pole_r": 0.025},
        "table": {"r": 0.40, "h": 0.75, "hole": 0.035},
        "chair": {"w": 0.44, "d": 0.44, "seat": 0.45, "back": 0.90}}      # the bistro chair's seat / back top, from b8
SIDEWALK = {"width": 6.0, "top": None, "front_y_cut": -2.0}


def sidewalk(plan):
    """The sidewalk slab's footprint: the balcony edge's front part (runs H, A, B; points below front_y_cut) with the
    entrance's bump as the inner edge, and the plain front path moved width outward as the outer edge."""
    loop = [tuple(q) for q in plan["layers"]["balcony_edge"]["outline"]]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(loop, loop[1:] + loop[:1]))
    if area < 0:
        loop.reverse()
    n = len(loop)
    front = [i for i in range(n) if loop[i][1] < SIDEWALK["front_y_cut"]]
    start = next(i for i in front if loop[i - 1][1] >= SIDEWALK["front_y_cut"])   # first front point, after the G side
    path = []
    i = start
    while loop[i % n][1] < SIDEWALK["front_y_cut"]:
        path.append(loop[i % n])
        i += 1
    ent = plan["layers"]["entrance"]["outline"]
    ex = sorted({round(q[0], 4) for q in ent})
    ey = sorted({round(q[1], 4) for q in ent})
    inner = []
    for a, b in zip(path, path[1:] + [None]):
        inner.append(a)
        if b is not None and abs(a[1] - b[1]) < 1e-6 and a[0] < ex[0] < b[0] and abs(a[1] - ey[1]) < 1e-3:
            inner += [(ex[0], ey[1]), (ex[0], ey[0]), (ex[1], ey[0]), (ex[1], ey[1])]   # round the entrance's bump
    outer = _offset_left(path, -SIDEWALK["width"])
    foot = inner + list(reversed(outer))
    return [[round(x, 4), round(y, 4)] for x, y in foot]


def sidewalk_cafe(plan, seed=632):
    pd = plan["podium"]
    runs = {r["run"]: r for r in pd["runs"]}
    z = plan["structure"]["ground_floor_level"]
    sets = []
    for zone in pd["props"]["sidewalk_cafe_ai632"]:
        r = runs[zone["run"]]
        U, N = r["along"], r["outward"]
        s0, s1 = zone["s"]
        rng = random.Random(f"{seed}:{zone['bay']}")
        k = CAFE["sets_per_bay"]
        for j in range(k):
            s = s0 + (j + 0.5) * (s1 - s0) / k + rng.uniform(-CAFE["s_jitter"], CAFE["s_jitter"])
            at = (r["p"][0] + U[0] * s + N[0] * CAFE["v"], r["p"][1] + U[1] * s + N[1] * CAFE["v"])
            n_chairs = pick(rng, [(str(c), w) for c, w in CAFE["chairs"]])
            a0 = rng.uniform(0.0, 360.0)
            chairs = []
            for c in range(int(n_chairs)):
                ang = math.radians(a0 + 360.0 * c / int(n_chairs) + rng.uniform(-8.0, 8.0))
                d = (math.cos(ang), math.sin(ang))
                rr = CAFE["chair_radius"] + rng.uniform(-0.03, 0.05)
                chairs.append({"at": [round(at[0] + d[0] * rr, 4), round(at[1] + d[1] * rr, 4)],
                               "face": [round(-d[0], 5), round(-d[1], 5)]})          # facing the table
            sets.append({"bay": zone["bay"], "at": [round(at[0], 4), round(at[1], 4)], "along": U, "chairs": chairs})
    return {"comment": "AI 632 sidewalk café (site dressing): sets of an octagonal market umbrella over a round table "
                       "and its chairs, %d per reserved bay, v from the podium outline; a sidewalk slab along the "
                       "front runs, its top at the ground floor level" % CAFE["sets_per_bay"],
            "seed": seed, "z": z, "config": CAFE, "sets": sets,
            "sidewalk": {"footprint": sidewalk(plan), "z": [0.0, z], "width": SIDEWALK["width"]}}


# ---------------------------------------------------------------- AI 633: street palms, entrance planters, lamps (site)
# b8: two tall pinnate palms rise before the building's front corners (low planting at their bases), more stand at the
# street corners; a large dark leafy plant in a planter flanks each side of the entrance; dark lamp posts stand at the
# kerb side of the sidewalk. Palms stand in raised limestone tree-pit planters on the sidewalk (clear of
# the café sets' chairs), the entrance planters at the spots AI 646 reserved, the lamps between them on the kerb side.
STREET = {"pit": {"half": 0.6, "height": 0.40}, "crown_clear": 0.4,
          # (run, s, v): b8's two tall palms, where CAM_B8's rays through their trunk bases (b8 x 278 / 845 at the sidewalk)
          # meet the sidewalk -- before the front corners, 4.26 m out from A's face, s beyond A's ends; then the far corners
          "palms": [("A", -2.55, 4.26), ("A", 12.55, 4.26), ("H", 1.4, 4.8), ("B", 10.6, 4.8)],
          "b8_heights": [8.9, 10.4, None, None],      # the b8 palms' measured heights (m above the soil); None: seeded
          # b8's palms through CAM_B8 (2026-10-14, the detailed palms): 8.9 and 10.4 m above the pit soil, crowns
          # 4.0 and 4.6 m across (radius / height 0.21-0.23, as palm_tree.py's street prototypes)
          "palm": {"height": (9.0, 10.8), "radius": (2.0, 2.45), "models": ["proc/street_palm_0", "proc/street_palm_1",
                                                                           "proc/street_palm_2"]},
          "pit_greens": {"height": (0.35, 0.55), "radius": (0.24, 0.30), "spacing": 0.0},
          "entrance_pot": {"radius": 0.45, "height": 0.75, "colour": "charcoal"},
          "entrance_plant": {"height": (1.7, 2.0), "radius": (0.48, 0.55), "models": ["proc/cycad_0", "proc/cycad_1"]},
          "lamps": [("H", 3.4), ("B", 8.6)], "lamp_v": 5.5, "lamp": "assets/props/street_lamp_01/street_lamp_01_1k.gltf"}


def street_dressing(plan, seed=633):
    pd = plan["podium"]
    runs = {r["run"]: r for r in pd["runs"]}
    z = plan["structure"]["ground_floor_level"]
    at = lambda run, s, v: (runs[run]["p"][0] + runs[run]["along"][0] * s + runs[run]["outward"][0] * v,  # noqa: E731
                            runs[run]["p"][1] + runs[run]["along"][1] * s + runs[run]["outward"][1] * v)
    rng = random.Random(f"{seed}:street")
    pits, palms, greens = [], [], []
    h = STREET["pit"]["half"]
    for i, (run, s, v) in enumerate(STREET["palms"]):
        c = at(run, s, v)
        U, N = runs[run]["along"], runs[run]["outward"]
        corner = lambda su, sv, c=c, U=U, N=N: [round(c[0] + (U[0] * su + N[0] * sv) * h, 4), round(c[1] + (U[1] * su + N[1] * sv) * h, 4)]  # noqa: E731
        pits.append({"run": run, "s": s, "loop": [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], "z": z,
                     "height": STREET["pit"]["height"]})
        soil = z + STREET["pit"]["height"] - 0.04
        p = STREET["palm"]
        model = rng.choice(p["models"])
        height = uniform(rng, p["height"])                            # always drawn, so the seeded sequence stays
        palms.append({"kind": "street_palm", "model": model, "at": [round(c[0], 4), round(c[1], 4)],
                      "z": round(soil, 4), "height": round(STREET["b8_heights"][i] or height, 3),
                      "radius": round(min(uniform(rng, p["radius"]), v - STREET["crown_clear"]), 3),   # off the facade
                      "rot_deg": round(rng.uniform(0, 360), 1)})
        for k in range(4):                                            # low planting round the trunk
            a = math.radians(45 + 90 * k + rng.uniform(-15, 15))
            q = (c[0] + 0.38 * math.cos(a), c[1] + 0.38 * math.sin(a))
            greens.append(_plant(rng, q, soil, {"height": STREET["pit_greens"]["height"], "radius": STREET["pit_greens"]["radius"]}))
    pots, entrance_plants = [], []
    for spot in pd["props"]["street_planters_ai633"]:
        ep = STREET["entrance_pot"]
        pots.append({"at": spot["at"], "z": z, "radius": ep["radius"], "height": ep["height"], "colour": ep["colour"]})
        pl = STREET["entrance_plant"]
        entrance_plants.append({"kind": "cycad", "model": rng.choice(pl["models"]), "at": spot["at"],
                                "z": round(z + ep["height"] - 0.05, 4), "height": round(uniform(rng, pl["height"]), 3),
                                "radius": round(uniform(rng, pl["radius"]), 3), "rot_deg": round(rng.uniform(0, 360), 1)})
    lamps = []
    for run, s in STREET["lamps"]:
        c = at(run, s, STREET["lamp_v"])
        N = runs[run]["outward"]
        lamps.append({"at": [round(c[0], 4), round(c[1], 4)], "z": z,
                      "rot_deg": round(math.degrees(math.atan2(-N[1], -N[0])), 1)})   # the lamp head over the sidewalk
    return {"comment": "AI 633 street dressing (site): tall procedural street palms in raised limestone tree pits on the "
                       "sidewalk before the front corners (b8's positions through CAM_B8) and at the far corners, low planting round each "
                       "trunk; charcoal pots with cycads at the entrance spots AI 646 reserved; street lamps (the installed "
                       "CC0 street_lamp_01, read-only) on the kerb side",
            "seed": seed, "z": z, "pits": pits, "palms": palms, "pit_greens": greens, "pots": pots,
            "entrance_plants": entrance_plants, "lamps": lamps, "lamp_model": STREET["lamp"]}


# ---------------------------------------------------------------- AI 634: the interior base (residential floors)
# The structure layer already gives every level its floor plate, ceiling and the core; this adds the partitions that
# divide each residential floor (1-5) into units behind the bays, so the views through the glazing stop at walls, and a
# ceiling downlight grid. Every partition ends on something solid and is cut flush there: behind the front pilasters,
# on the core's faces, on the chamfer columns' flat back faces, on a rear-bay mullion (the frames' inner face).
# Seven units a floor: front centre (behind the pilasters), front left / right (A's short bays and the front chamfers'
# front halves), left / right (the chamfers' rear halves, the sides), rear left / right (split at an E-bay mullion).
INTERIOR = {"partition": 0.12, "downlight": {"spacing": 2.4, "radius": 0.08, "height": 0.015, "clear_wall": 0.9,
                                             "clear_partition": 0.45}}


def _cut(a, b, plane_a, plane_b, half):
    """The footprint of a wall of thickness 2*half along a -> b, its ends cut flush on two planes (point, normal)."""
    d = (b[0] - a[0], b[1] - a[1])
    L = math.hypot(*d)
    t = (d[0] / L, d[1] / L)
    nrm = (-t[1], t[0])

    def meet(off, plane):
        p0 = (a[0] + nrm[0] * off, a[1] + nrm[1] * off)               # the edge line: p0 + t * k
        (px, py), (nx, ny) = plane
        k = ((px - p0[0]) * nx + (py - p0[1]) * ny) / (t[0] * nx + t[1] * ny)
        return (p0[0] + t[0] * k, p0[1] + t[1] * k)
    loop = [meet(-half, plane_a), meet(-half, plane_b), meet(half, plane_b), meet(half, plane_a)]
    area = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(loop, loop[1:] + loop[:1]))
    loop = loop if area > 0 else list(reversed(loop))
    return [[round(x, 4), round(y, 4)] for x, y in loop]


def interior_base(plan):
    st, env = plan["structure"], plan["envelope"]
    core = st["core"]["outer"]
    cx0, cx1, cy0, cy1 = core["x"][0], core["x"][1], core["y"][0], core["y"][1]
    half = INTERIOR["partition"] / 2
    frame_in = env["frame_depth"] / 2
    col = st["columns"]
    pil = plan["markers"]["front_pilasters"]
    y_wall = pil[0]["y"][1]                                          # the A wall line
    cols = {}
    for c in plan["markers"]["chamfer_columns"]:
        cols.setdefault(c["run"], []).append(c)

    def col_back(c):
        """The column's flat back face: (point, normal into the room)."""
        (ax, ay), (nx, ny) = c["at"], c["outward"]
        return (ax - nx * col["behind"], ay - ny * col["behind"]), (-nx, -ny)
    walls = []
    for sgn in (-1, 1):
        side = "left" if sgn < 0 else "right"
        x_p = sgn * (abs(pil[0]["x"][1]) + half)                     # behind the pilaster, off the bay's end jamb
        walls.append({"name": f"front_centre_{side}", "loop": _cut((x_p, y_wall + frame_in), (x_p, cy0),
                                                                 ((0.0, y_wall + frame_in), (0.0, 1.0)), ((0.0, cy0), (0.0, -1.0)), half)})
        front_col = cols["H" if sgn < 0 else "B"][0]
        pt, nrm = col_back(front_col)
        start = (sgn * cx1, cy0 + 0.4)
        walls.append({"name": f"front_{side}", "loop": _cut(start, pt, ((sgn * cx1, 0.0), (-sgn * 1.0, 0.0)), (pt, nrm), half)})
        rear_cols = cols["F" if sgn < 0 else "D"]
        side_col = max(rear_cols, key=lambda c: abs(c["at"][0]))      # the rear chamfer column nearer the side
        pt, nrm = col_back(side_col)
        start = (sgn * cx1, cy1 - 0.4)
        walls.append({"name": f"rear_{side}", "loop": _cut(start, pt, ((sgn * cx1, 0.0), (-sgn * 1.0, 0.0)), (pt, nrm), half)})
    # the rear split, on E's first mullion
    e = next(b for b in env["bays"] if b["run"] == "E")
    panes = e["variants"][0]["panes"]
    s_m = (panes[0][1] + panes[1][0]) / 2
    x_m = e["a"][0] + e["along"][0] * s_m
    y_e = e["a"][1] - frame_in
    walls.append({"name": "rear_split", "loop": _cut((x_m, cy1), (x_m, y_e), ((0.0, cy1), (0.0, 1.0)), ((0.0, y_e), (0.0, -1.0)), half)})
    # downlights: a grid inside the wall line, clear of the walls, the partitions and the core
    wall = [tuple(q) for q in plan["layers"]["tower_wall_line"]["outline"]]
    dl = INTERIOR["downlight"]

    def inside(q, loop):
        c, n = False, len(loop)
        for i in range(n):
            (ax, ay), (bx, by) = loop[i], loop[(i + 1) % n]
            if (ay > q[1]) != (by > q[1]) and q[0] < ax + (q[1] - ay) * (bx - ax) / (by - ay):
                c = not c
        return c

    def seg_dist(q, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        return math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy)
    edges = [(w["loop"][i], w["loop"][(i + 1) % 4]) for w in walls for i in range(4)]
    pts = []
    sp = dl["spacing"]
    wx0, wx1 = min(q[0] for q in wall), max(q[0] for q in wall)
    wy0, wy1 = min(q[1] for q in wall), max(q[1] for q in wall)
    xs = [wx0 + sp / 2 + k * sp for k in range(int((wx1 - wx0) / sp))]
    ys = [wy0 + sp / 2 + k * sp for k in range(int((wy1 - wy0) / sp))]
    for x in xs:
        for y in ys:
            q = (x, y)
            if not inside(q, wall):
                continue
            if min(seg_dist(q, wall[i], wall[(i + 1) % len(wall)]) for i in range(len(wall))) < dl["clear_wall"]:
                continue
            if cx0 - 0.4 < x < cx1 + 0.4 and cy0 - 0.4 < y < cy1 + 0.4:
                continue
            if min(seg_dist(q, a, b) for a, b in edges) < dl["clear_partition"]:
                continue
            pts.append([round(x, 3), round(y, 3)])
    return {"comment": "AI 634 interior base: partitions dividing each residential floor into seven units (footprints cut "
                       "flush on the pilaster line, the core, the chamfer columns' backs and an E-bay mullion), standing on "
                       "each storey's floor up to the slab above; a downlight grid under every residential ceiling",
            "config": INTERIOR, "storeys": st["columns"]["storeys"], "partitions": walls, "downlights": pts}


# ---------------------------------------------------------------- AI 635: the ground-floor restaurant
# b8: a warm-lit restaurant behind the storefronts and the entrance -- wood tables and chairs, banquettes, pendant lights,
# plants, a bar toward the back, a warm wood ceiling near the entrance. Dining bands run behind every storefront bay
# (rows of 2- and 4-tops, an aisle kept behind each storefront door), banquettes line the core's side and rear walls, the
# bar stands against the core's front facing the entrance, a slatted wood ceiling hangs over the entrance zone, and a
# pendant hangs over every table. Items carry a facing (local +v = front) like AI 630's; zones are checked against each
# other and the core.
RESTAURANT = {"band_v": [-1.3, -5.1], "rows": [{"v": -1.75, "table": [0.7, 0.7], "chairs": 2, "beside_door": True},
                                                {"v": -3.95, "table": [1.2, 0.8], "chairs": 4, "pitch": 1.8}],
              "end_inset": 0.5, "door_aisle": 0.15, "behind_door": 0.6, "chair_gap": 0.42, "pendant": {"drop_to": 2.45, "shade_r": 0.17,
                                                                                  "shade_h": 0.22, "cord_r": 0.006},
              "entrance": {"x": [-2.8, 2.8], "y": [-10.4, -3.2], "rows_y": [-9.6, -7.3, -5.0], "cols_x": [-1.65, 0.0, 1.65]},
              "wood_ceiling": {"x": [-2.85, 2.85], "y": [-10.95, -6.0], "z": 4.20, "slat": [0.06, 0.04], "pitch": 0.12},
              "bar": {"x": [-2.6, 2.6], "counter_y": [-0.65, 0.0], "back_y": [0.4, 0.78], "counter_h": 1.08,
                      "back_h": 2.2, "stools": 6},
              "banquette": {"depth": 0.62, "gap": 0.5, "table": [0.7, 0.7], "pitch": 1.5},
              "core_clear": 0.45,
              # the restaurant's ambient light: warm area lights under the ceiling over every zone, unseen by the camera
              # and in reflections (the pendants are the visible sources); power per m2 of zone
              "fill": {"rgb": [1.0, 0.70, 0.42], "w_per_m2": 20.0, "below": 0.12, "strip": 2.4}}


def _footprint(item):
    """An item's footprint (its facing = local +v, size = width along u, depth along v)."""
    (cx, cy), (fx, fy), (w, d) = item["at"], item["face"], item["size"]
    ux, uy = fy, -fx
    return [(cx + ux * su * w / 2 + fx * sv * d / 2, cy + uy * su * w / 2 + fy * sv * d / 2)
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def _overlap(a, b):
    """Convex polygons overlapping by more than a touch (separating axes)."""
    for shape in (a, b):
        for i in range(len(shape)):
            (ax, ay), (bx, by) = shape[i], shape[(i + 1) % len(shape)]
            nx, ny = by - ay, ax - bx
            pa = [nx * x + ny * y for x, y in a]
            pb = [nx * x + ny * y for x, y in b]
            if max(pa) <= min(pb) + 1e-6 or max(pb) <= min(pa) + 1e-6:
                return False
    return True


def _rect_fill(x, y, top):
    """A fill light's rectangle over an axis-aligned zone (centre, width along x, depth along y, angle, top)."""
    return {"c": [round((x[0] + x[1]) / 2, 4), round((y[0] + y[1]) / 2, 4)], "w": round(x[1] - x[0], 4),
            "d": round(y[1] - y[0], 4), "angle": 0.0, "top": top}


_POT_R = 0.26                                                         # layer_restaurant_l0.PLANT["pot"] radius


class _Room:
    """A dining room's items, pendants, plants, zones and fill rectangles. Sets (a table, its chairs, its pendant) are
    placed in priority order: a set is kept only if no footprint overlaps one already placed (AI 635, reused by 636)."""

    def __init__(self, cfg):
        self.R = cfg
        self.items, self.pendants, self.plants, self.zones, self.fills = [], [], [], [], []
        self.kept, self.skipped, self.plant_spots = [], [], []

    @staticmethod
    def face(vec):
        return [round(vec[0], 5), round(vec[1], 5)]

    def place(self, new, pendant=None):
        """Keep a set of items (and its pendant) only if no footprint overlaps one already placed."""
        polys = [_footprint(it) for it in new]
        if any(_overlap(a, b) for a in polys for b in self.kept):
            self.skipped.append(new[0]["group"])
            return False
        self.kept.extend(polys)
        self.items.extend(new)
        if pendant:
            self.pendants.append(pendant)
        return True

    def table_set(self, rng, centre, U, N, size, n_chairs, group, ceiling_z, pendant=True):
        """A table facing N (its local +v), its chairs round it facing in, a pendant over it (indoors)."""
        R, face = self.R, self.face
        new = [{"group": group, "kind": "dining_table", "at": [round(centre[0], 4), round(centre[1], 4)],
                "face": face(N), "size": list(size), "cushion": "greige"}]
        w, d = size
        spots = ([(0.0, d / 2 + R["chair_gap"]), (0.0, -d / 2 - R["chair_gap"])] if n_chairs == 2 else
                 [(-w / 4, d / 2 + R["chair_gap"]), (w / 4, d / 2 + R["chair_gap"]),
                  (-w / 4, -d / 2 - R["chair_gap"]), (w / 4, -d / 2 - R["chair_gap"])])
        for du, dv in spots:
            at = (centre[0] + U[0] * du + N[0] * dv + rng.uniform(-0.02, 0.02),
                  centre[1] + U[1] * du + N[1] * dv + rng.uniform(-0.02, 0.02))
            fv = (-N[0], -N[1]) if dv > 0 else N                      # chairs face the table
            new.append({"group": group, "kind": "dining_chair", "at": [round(at[0], 4), round(at[1], 4)],
                        "face": face(fv), "size": [0.46, 0.5], "cushion": "greige"})
        return self.place(new, {"at": [round(centre[0], 4), round(centre[1], 4)], "top": ceiling_z} if pendant else None)

    def banquettes(self, core, seed, ceiling):
        """Banquettes along the core's sides and rear, tables and a chair before them."""
        R, face, B = self.R, self.face, self.R["banquette"]
        cx0, cx1, cy0, cy1 = core["x"][0], core["x"][1], core["y"][0], core["y"][1]
        sides = [((cx0, cy0), (cx0, cy1), (-1.0, 0.0)), ((cx1, cy1), (cx1, cy0), (1.0, 0.0)), ((cx1, cy1), (cx0, cy1), (0.0, 1.0))]
        for k, (a, b, out) in enumerate(sides):
            rng = random.Random(f"{seed}:banquette:{k}")
            L = math.dist(a, b)
            U = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
            mid = ((a[0] + b[0]) / 2 + out[0] * B["depth"] / 2, (a[1] + b[1]) / 2 + out[1] * B["depth"] / 2)
            self.place([{"group": "banquettes", "kind": "sofa", "at": [round(mid[0], 4), round(mid[1], 4)], "face": face(out),
                         "size": [round(L - 0.2, 3), B["depth"]], "cushion": "ecru"}])
            n = max(1, int((L - 0.4) // B["pitch"]))
            for j in range(n):
                s = (j + 0.5) * L / n
                c = (a[0] + U[0] * s + out[0] * (B["depth"] + B["gap"] + B["table"][1] / 2),
                     a[1] + U[1] * s + out[1] * (B["depth"] + B["gap"] + B["table"][1] / 2))
                ch = (c[0] + out[0] * (B["table"][1] / 2 + R["chair_gap"]), c[1] + out[1] * (B["table"][1] / 2 + R["chair_gap"]))
                self.place([{"group": "banquettes", "kind": "dining_table", "at": [round(c[0], 4), round(c[1], 4)],
                             "face": face(out), "size": list(B["table"]), "cushion": "greige"},
                            {"group": "banquettes", "kind": "dining_chair", "at": [round(ch[0], 4), round(ch[1], 4)],
                             "face": face((-out[0], -out[1])), "size": [0.46, 0.5], "cushion": "greige"}],
                           {"at": [round(c[0], 4), round(c[1], 4)], "top": ceiling})

    def bands(self, pd, seed, z, ceiling, doors):
        """Dining bands behind every bay: rows of tables at fixed depths, a plant at each band's start. With doors, the
        row by the glass takes one table in each gap beside the storefront door and the deeper rows keep off its axis."""
        R = self.R
        runs = {r["run"]: r for r in pd["runs"]}
        order = {"B": 0, "H": 0, "C": 1, "G": 1, "D": 2, "F": 2, "E": 2}   # the bays b8 sees first: they win any overlap
        for bay in sorted(pd["bays"], key=lambda b: order[b["run"]]):
            r = runs[bay["run"]]
            U, N = r["along"], (-r["outward"][0], -r["outward"][1])        # N into the room
            s0, s1 = bay["s"][0] + R["end_inset"], bay["s"][1] - R["end_inset"]
            door = bay.get("storefront_door") if doors else None           # the door pane's index -> its span along the bay
            door = bay["storefront_panes"][door] if door is not None else None
            rng = random.Random(f"{seed}:{bay['id']}")
            pt = lambda s, v, r=r: (r["p"][0] + r["along"][0] * s + r["outward"][0] * v, r["p"][1] + r["along"][1] * s + r["outward"][1] * v)  # noqa: E731
            loop = [list(pt(s0, R["band_v"][0])), list(pt(s1, R["band_v"][0])), list(pt(s1, R["band_v"][1])), list(pt(s0, R["band_v"][1]))]
            self.zones.append({"bay": bay["id"], "loop": loop})
            self.fills.append({"c": [round(sum(q[0] for q in loop) / 4, 4), round(sum(q[1] for q in loop) / 4, 4)],
                               "w": round(math.dist(loop[0], loop[1]), 4), "d": round(math.dist(loop[1], loop[2]), 4),
                               "angle": round(math.atan2(loop[1][1] - loop[0][1], loop[1][0] - loop[0][0]), 6), "top": ceiling})
            d0, d1 = (bay["s"][0] + door[0], bay["s"][0] + door[1]) if door else (None, None)
            for row in R["rows"]:
                if row.get("beside_door") and door:                       # by the glass: one table in each gap beside the door
                    spots = [(a + b) / 2 for a, b in ((s0, d0 - R["door_aisle"]), (d1 + R["door_aisle"], s1))
                             if b - a >= row["table"][0] + 0.1]
                else:                                                     # deeper: evenly, but not straight behind the door
                    n = max(1, int((s1 - s0) // row.get("pitch", 1.8)))
                    spots = [s0 + (k + 0.5) * (s1 - s0) / n for k in range(n)]
                    if door:
                        spots = [s for s in spots if abs(s - (d0 + d1) / 2) >= R["behind_door"]]
                for s in spots:
                    s += rng.uniform(-0.06, 0.06)
                    chairs = row["chairs"] if rng.random() > 0.15 else 2
                    self.table_set(rng, pt(s, row["v"]), U, N, row["table"], chairs, bay["id"], ceiling)
            self.plant_spots.append({"at": [round(c, 4) for c in pt(s0 - 0.2, (R["band_v"][0] + R["band_v"][1]) / 2)], "z": z})

    def settle_plants(self, spots=()):
        """Keep the plant spots whose pot clears every placed footprint (the tables win); dropped ones count as skipped."""
        for p in list(self.plant_spots) + list(spots):
            pot = [(p["at"][0] + _POT_R * math.cos((k + 0.5) * math.pi / 4), p["at"][1] + _POT_R * math.sin((k + 0.5) * math.pi / 4))
                   for k in range(8)]
            if any(_overlap(pot, q) for q in self.kept):
                self.skipped.append("plant")
                continue
            self.kept.append(pot)
            self.plants.append(p)
        self.plant_spots = []

    def grid(self, rng, zone, group, top_at, skip=()):
        """A grid of 2- and 4-tops facing +y (zone: rows_y, cols_x); (x, y) spots in skip stay free."""
        for y in zone["rows_y"]:
            for x in zone["cols_x"]:
                if (x, y) in skip:
                    continue
                two = rng.random() < 0.4
                self.table_set(rng, (x + rng.uniform(-0.05, 0.05), y), (1.0, 0.0), (0.0, 1.0), [0.75, 0.75] if two else [1.2, 0.8],
                               2 if two else 4, group, top_at(y))

    def strips(self, core, top):
        """Fill rectangles over the banquette strips beside and behind the core."""
        (x0, x1), (y0, y1), d = core["x"], core["y"], self.R["fill"]["strip"]
        self.fills += [_rect_fill([x0 - d, x0], [y0, y1], top), _rect_fill([x1, x1 + d], [y0, y1], top),
                       _rect_fill([x0, x1], [y1, y1 + d], top)]


def restaurant_l0(plan, seed=635):
    pd, st = plan["podium"], plan["structure"]
    z = st["ground_floor_level"]
    ceiling = pd["storeys"]["ground"][1]
    core = st["core"]["outer"]
    R = RESTAURANT
    room = _Room(R)
    room.banquettes(core, seed, ceiling)
    room.bands(pd, seed, z, ceiling, doors=True)
    # the entrance zone under the wood ceiling, the way in from the doors kept clear
    E, wc = R["entrance"], R["wood_ceiling"]
    under = wc["z"] - wc["slat"][1]
    room.grid(random.Random(f"{seed}:entrance"), E, "entrance", lambda y: under if wc["y"][0] < y < wc["y"][1] else ceiling,
              skip=[(x, E["rows_y"][0]) for x in E["cols_x"] if abs(x) < 0.1])
    bar = dict(R["bar"])
    bar["stool_x"] = [round(bar["x"][0] + (k + 0.5) * (bar["x"][1] - bar["x"][0]) / bar["stools"], 3) for k in range(bar["stools"])]
    room.settle_plants([{"at": [bar["x"][0] - 0.6, -0.3], "z": z}, {"at": [bar["x"][1] + 0.6, -0.3], "z": z}])
    room.fills.append(_rect_fill(E["x"], E["y"], under))                                     # under the slats
    room.fills.append(_rect_fill(bar["x"], [E["y"][1], bar["back_y"][1]], ceiling))
    room.strips(core, ceiling)
    return {"comment": "AI 635 ground-floor restaurant: dining bands behind every storefront bay (2-top and 4-top rows, an "
                       "aisle behind each storefront door), the entrance zone under a slatted wood ceiling, banquettes on "
                       "the core's side and rear walls, the bar on the core's front facing the entrance, a pendant over "
                       "every table, potted plants at the band ends and the bar",
            "seed": seed, "z": z, "ceiling": ceiling, "config": R, "zones": room.zones, "items": room.items,
            "pendants": room.pendants, "plants": room.plants, "bar": bar, "core": core, "skipped_sets": room.skipped,
            "fills": room.fills}


# ---------------------------------------------------------------- AI 636: the upper-podium dining room
# b8: the upper podium's glazing shows a dining room -- tables, chairs, plants, pendant lights -- and the terrace over the
# entrance continues it outside. AI 635's room logic on the upper storey: dining bands behind every upper bay (the upper
# glazing stands 0.9 m in, so the bands start deeper and have no doors), the loggia room behind the front centre's
# glazing, banquettes on the core's sides and rear, a sideboard with lit shelves on the core's teak-panelled front, and
# tables on the entrance terrace between its planters and the loggia glazing (no pendants outside).
DINING = {"band_v": [-1.9, -5.7], "rows": [{"v": -2.35, "table": [0.7, 0.7], "chairs": 2, "pitch": 1.6},
                                           {"v": -4.55, "table": [1.2, 0.8], "chairs": 4, "pitch": 1.8}],
          "end_inset": 0.5, "chair_gap": 0.42, "pendant": dict(RESTAURANT["pendant"]),
          "loggia_room": {"x": [-2.8, 2.8], "y": [-9.8, -1.2], "rows_y": [-8.6, -6.25, -3.9, -1.55], "cols_x": [-1.65, 0.0, 1.65]},
          "sideboard": {"x": [-2.6, 2.6], "back_y": [0.4, 0.78], "back_h": 2.2},
          "banquette": dict(RESTAURANT["banquette"]),
          "terrace": {"cols_x": [-1.55, 1.55], "y": -10.78, "table": [0.7, 0.7]},
          "core_clear": 0.45,
          # b8 looks up through the loggia and sees mostly the room's ceiling: a hidden warm wash lights it from below
          "fill": dict(RESTAURANT["fill"], up_w_per_m2=12.0, up_below=0.9)}


def dining_l1(plan, seed=636):
    pd, st = plan["podium"], plan["structure"]
    z, ceiling = pd["storeys"]["upper"]
    core = st["core"]["outer"]
    D = DINING
    room = _Room(D)
    room.banquettes(core, seed, ceiling)
    room.bands(pd, seed, z, ceiling, doors=False)
    G = D["loggia_room"]
    room.grid(random.Random(f"{seed}:loggia"), G, "loggia_room", lambda y: ceiling)
    terrace_z = max(b["z"] for b in plan["props"]["podium_planters"]["boxes"] if b["kind"] == "terrace")
    T = D["terrace"]
    rng = random.Random(f"{seed}:terrace")
    for x in T["cols_x"]:                                     # chairs either side along the terrace, facing the table
        room.table_set(rng, (x, T["y"]), (0.0, 1.0), (1.0, 0.0), T["table"], 2, "terrace", None, pendant=False)
    for it in room.items:
        if it["group"] == "terrace":
            it["z"] = terrace_z                               # on the terrace's paving, not the room's floor
    sb = D["sideboard"]
    room.settle_plants([{"at": [sb["x"][0] - 0.6, -0.3], "z": z}, {"at": [sb["x"][1] + 0.6, -0.3], "z": z},
                        {"at": [G["x"][0] + 0.25, G["y"][0] + 0.35], "z": z}, {"at": [G["x"][1] - 0.25, G["y"][0] + 0.35], "z": z}])
    room.fills.append(_rect_fill(G["x"], G["y"], ceiling))
    room.fills.append(_rect_fill(sb["x"], [G["y"][1], sb["back_y"][1]], ceiling))
    room.strips(core, ceiling)
    return {"comment": "AI 636 upper-podium dining room: dining bands behind every upper bay (2-top and 4-top rows), the "
                       "loggia room behind the front centre's glazing, banquettes on the core's side and rear walls, a "
                       "sideboard on the core's front, two tables on the entrance terrace, a pendant over every indoor "
                       "table, potted plants at the band ends, the sideboard and the loggia glazing",
            "seed": seed, "z": z, "ceiling": ceiling, "terrace_z": terrace_z, "config": D, "zones": room.zones,
            "items": room.items, "pendants": room.pendants, "plants": room.plants, "sideboard": sb, "core": core,
            "skipped_sets": room.skipped, "fills": room.fills}


# ---------------------------------------------------------------- AI 637: residential curtains and furniture
# b8: the residential sliders show white sheer curtains, partly drawn, with hints of furniture inside. Every bay's
# glazed span on floors 1-5 gets a ceiling track and sheer panels drawn to seeded positions (a pair from both ends, one
# side drawn, or stacked open), split where a partition meets the glazing; no two floors share a pattern. Each bay of a
# unit (bays of 3 m and more) gets a seeded set near its window: a lounge (sofa facing the window, coffee table, floor
# lamp), a dining table with chairs and a lamp, or a reading corner (two armchairs, side table, lamp). Furniture keeps off
# the partitions, the core and the bay ends; the curtains hang between the frames and the furniture.
RESIDENTIAL = {"curtain": {"v": -0.2, "half_depth": 0.07, "top_gap": 0.04, "hem": 0.015, "fold_pitch": 0.1,
                           "amp": [0.025, 0.05], "end_trim": {"corner": 0.12, "other": 0.03}, "min_panel": 0.3,
                           "styles": {"pair": 0.4, "start": 0.2, "end": 0.2, "open": 0.2}},
               "track": {"depth": 0.04, "height": 0.03},
               "partition_clear": 0.03,
               "furniture": {"min_bay": 3.0, "end_clear": 0.35, "core_clear": 0.45,
                             "layouts": {"lounge": 0.45, "dining": 0.3, "reading": 0.25}, "tries": 12},
               "lamp": {"height": 1.55, "shade_r": 0.19, "shade_h": 0.3, "base_r": 0.15}}


def _line(bay):
    """A bay's wall line: the point at s along it, v off it (outward +)."""
    (ax, ay), (ux, uy), (ox, oy) = bay["a"], bay["along"], bay["outward"]
    return lambda s, v: (ax + ux * s + ox * v, ay + uy * s + oy * v)


def _pick(rng, weights):
    names = sorted(weights)
    return rng.choices(names, [weights[n] for n in names])[0]


def residential(plan, seed=637):
    env, base, st = plan["envelope"], plan["interior"]["base"], plan["structure"]
    R = RESIDENTIAL
    C = R["curtain"]
    walls = [[tuple(q) for q in w["loop"]] for w in base["partitions"]]
    core = st["core"]["outer"]
    m = R["furniture"]["core_clear"]
    core_quad = [(core["x"][0] - m, core["y"][0] - m), (core["x"][1] + m, core["y"][0] - m),
                 (core["x"][1] + m, core["y"][1] + m), (core["x"][0] - m, core["y"][1] + m)]

    def spans(bay, panes):
        """The bay's glazed span trimmed at its ends, split wherever a partition crosses the curtain strip."""
        pt = _line(bay)
        t = C["end_trim"]
        s0 = min(q[0] for q in panes) + (t["corner"] if bay["ends"][0] == "corner" else t["other"])
        s1 = max(q[1] for q in panes) - (t["corner"] if bay["ends"][1] == "corner" else t["other"])
        v0, v1 = C["v"] - C["half_depth"], C["v"] + C["half_depth"]
        step = 0.01
        n = int((s1 - s0) / step)
        free = []
        for k in range(n + 1):
            s = s0 + k * step
            quad = [pt(s - step / 2, v0), pt(s + step / 2, v0), pt(s + step / 2, v1), pt(s - step / 2, v1)]
            free.append(not any(_overlap(quad, w) for w in walls))
        out, k = [], 0
        while k <= n:                                                 # runs of free samples, kept off the partitions
            if not free[k]:
                k += 1
                continue
            i0 = k
            while k <= n and free[k]:
                k += 1
            i1 = k - 1
            a = s0 + i0 * step + (R["partition_clear"] + step if i0 > 0 else 0.0)
            e = s0 + i1 * step - (R["partition_clear"] + step if i1 < n else 0.0)
            if e - a >= C["min_panel"]:
                out.append([round(a, 4), round(e, 4)])
        return out

    def drawn(rng, a, e):
        """Seeded curtain panels over the span [a, e]: (style, [(s0, s1, anchor), ...])."""
        w, mp = e - a, C["min_panel"]
        if w < 2 * mp:                                                # a narrow light: one panel from either side
            f = rng.uniform(0.5, 1.0) * w
            return ("start", [(a, a + f, "start")]) if rng.random() < 0.5 else ("end", [(e - f, e, "end")])
        style = _pick(rng, C["styles"])
        if style == "pair":
            f0, f1 = rng.uniform(0.15, 0.45), rng.uniform(0.15, 0.45)
            return style, [(a, a + max(mp, f0 * w), "start"), (e - max(mp, f1 * w), e, "end")]
        if style in ("start", "end"):
            f = max(mp, rng.uniform(0.4, 0.85) * w)
            return style, [(a, a + f, "start")] if style == "start" else [(e - f, e, "end")]
        f0, f1 = max(mp, rng.uniform(0.1, 0.18) * w), max(mp, rng.uniform(0.1, 0.18) * w)
        return style, [(a, a + f0, "start"), (e - f1, e, "end")]

    def furnish(rng, bay):
        """A seeded set near the bay's window: lounge, dining or reading (items, lamp position)."""
        F = R["furniture"]
        pt, L = _line(bay), bay["length"]
        N, out = (-bay["outward"][0], -bay["outward"][1]), bay["outward"]       # N into the room
        face = lambda vec: [round(vec[0], 5), round(vec[1], 5)]  # noqa: E731
        layout = _pick(rng, F["layouts"])
        c = rng.uniform(0.3, 0.7) * L                                            # the set's centre along the bay
        new = []
        if layout == "lounge":
            sw = min(2.2, L - 1.6)
            new += [{"kind": "sofa", "at": pt(c, -2.55), "face": face(out), "size": [round(sw, 3), 0.9], "cushion": "ecru"},
                    {"kind": "coffee_table", "at": pt(c, -1.65), "face": face(out), "size": [1.0, 0.55], "cushion": "greige"}]
            lamp = pt(c + (sw / 2 + 0.3) * rng.choice((-1, 1)), -2.7)
        elif layout == "dining":
            new.append({"kind": "dining_table", "at": pt(c, -1.75), "face": face(out), "size": [1.4, 0.85], "cushion": "greige"})
            for du in (-0.35, 0.35):
                for dv, fv in ((-0.85, out), (0.85, N)):                              # chairs either long side, facing in
                    new.append({"kind": "dining_chair", "at": pt(c + du, -1.75 + dv), "face": face(fv), "size": [0.46, 0.5],
                                "cushion": "greige"})
            lamp = pt(c + 1.25 * rng.choice((-1, 1)), -2.4)
        else:
            for du in (-0.65, 0.65):
                new.append({"kind": "armchair", "at": pt(c + du, -1.7), "face": face(out), "size": [0.8, 0.8], "cushion": "ecru"})
            new.append({"kind": "side_table", "at": pt(c, -1.75), "face": face(out), "size": [0.45, 0.45], "cushion": "greige"})
            lamp = pt(c, -2.35)
        for it in new:
            it["at"] = [round(it["at"][0], 4), round(it["at"][1], 4)]
        return new, lamp

    curtains, tracks, items, lamps, skipped, patterns = [], [], [], [], [], {}
    for floor in sorted(env["floors"], key=int):
        z0, z1 = env["floors"][floor]
        for attempt in range(20):                                     # re-roll until no earlier floor shares the pattern
            rng = random.Random(f"{seed}:curtains:{floor}:{attempt}")
            fc, ft, sig = [], [], []
            for bay in env["bays"]:
                var = next(v for v in bay["variants"] if int(floor) in v["floors"])
                for a, e in spans(bay, var["panes"]):
                    ft.append({"floor": int(floor), "bay": bay["id"], "s": [a, e]})
                    style, panels = drawn(rng, a, e)
                    sig.append(style)
                    for s0, s1, anchor in panels:
                        fc.append({"floor": int(floor), "bay": bay["id"], "s": [round(s0, 4), round(s1, 4)], "anchor": anchor,
                                   "z": [round(z0 + C["hem"], 4), round(z1 - C["top_gap"], 4)], "phase": round(rng.random(), 4)})
            if tuple(sig) not in patterns.values():
                break
        patterns[floor] = tuple(sig)
        curtains += fc
        tracks += [dict(t, z=z1) for t in ft]
        # furniture near the windows
        F = R["furniture"]
        kept = [list(w) for w in walls] + [core_quad]
        for bay in env["bays"]:
            if bay["length"] < F["min_bay"]:
                continue
            for attempt in range(F["tries"]):                         # another layout or centre until one fits
                rng = random.Random(f"{seed}:furniture:{floor}:{bay['id']}:{attempt}")
                new, lamp = furnish(rng, bay)
                for it in new:
                    it.update(group=f"f{floor}_{bay['id']}", z=z0)
                lr = R["lamp"]["base_r"]
                lamp_quad = [(lamp[0] - lr, lamp[1] - lr), (lamp[0] + lr, lamp[1] - lr), (lamp[0] + lr, lamp[1] + lr),
                             (lamp[0] - lr, lamp[1] + lr)]
                polys = [_footprint(it) for it in new] + [lamp_quad]
                # within the bay (clear of its ends), off the partitions, the core and the other sets
                U, L = bay["along"], bay["length"]
                ends_ok = all(F["end_clear"] <= (x - bay["a"][0]) * U[0] + (y - bay["a"][1]) * U[1] <= L - F["end_clear"]
                              for poly in polys for x, y in poly)
                if ends_ok and not any(_overlap(q, k) for q in polys for k in kept):
                    kept += polys
                    items += new
                    lamps.append({"floor": int(floor), "bay": bay["id"], "at": [round(lamp[0], 4), round(lamp[1], 4)], "z": z0})
                    break
            else:
                skipped.append(f"f{floor}_{bay['id']}")
    lines = {b["id"]: {"a": b["a"], "along": b["along"], "outward": b["outward"]} for b in env["bays"]}
    return {"comment": "AI 637 residential: sheer curtains on a ceiling track behind every bay's glazing on floors 1-5, "
                       "drawn to seeded positions (no two floors share a pattern), split at the partitions; a seeded "
                       "lounge, dining or reading set with a floor lamp near the window of every bay of 3 m and more",
            "seed": seed, "config": R, "lines": lines, "curtains": curtains, "tracks": tracks, "items": items,
            "lamps": lamps, "patterns": {k: list(v) for k, v in patterns.items()}, "skipped_sets": skipped}


# ---------------------------------------------------------------- AI 638: the penthouse
# The penthouse walls (AI 647) wrap the core, which rises to the penthouse roof: inside is a ring, a 1.55 m front strip
# behind the front slider and door, 1.15 m side strips, nothing behind. The glazed annex on the -X side (3.4 x 5.3 m,
# through the left door) is the one real room. A restrained interior that reads through the glazing: the annex holds the
# kitchen (a counter run on the penthouse wall with a lit shelf, an island with three stools and pendants hung from the
# louvres) and a lounge corner behind the front glass; the front strip a sofa facing the slider, a side table and a
# floor lamp; the right strip an armchair at the window. Downlights in the penthouse ceiling, warm fills under both
# ceilings, plants in the corners. Every footprint is checked against the others, the walls, the core, the annex posts
# and the door paths.
PENTHOUSE = {"run": {"y": [2.8, 5.2], "depth": 0.6, "top_over": 0.02, "height": 0.9, "top": 0.04,
                     "shelf": {"z": 1.5, "depth": 0.3, "y": [3.0, 5.0], "thick": 0.03}},
             "island": {"x": [-7.4, -6.5], "y": [3.0, 4.8], "body_inset": [0.25, 0.05], "height": 0.92, "top": 0.04,
                        "stools_x": -7.62, "seat": 0.66},
             "pendant": {"drop_to": 1.75, "shade_r": 0.14, "shade_h": 0.2, "cord_r": 0.006},
             "downlight": {"radius": 0.08, "height": 0.015},
             "door_path": 0.2,
             "fill": {"rgb": [1.0, 0.70, 0.42], "w_per_m2": 15.0, "below": 0.12}}


def penthouse(plan):
    rf, st = plan["roof"], plan["structure"]
    P = PENTHOUSE
    top = rf["roof_top"]
    walk = top + rf["paving"]                                         # the annex stands on the terrace paving
    ph, an = rf["penthouse"], rf["annex"]
    px, py, w = rf["penthouse_rect"]["x"], rf["penthouse_rect"]["y"], ph["wall"]
    ceiling = top + ph["roof_slab"][0]
    core = st["core"]["outer"]
    inner = {"x": [px[0] + w, px[1] - w], "y": [py[0] + w, py[1] - w]}
    p, fd = an["post"], ph["frame"]["depth"] / 2
    annex_in = {"x": [an["x"][0] + p / 2 + fd, an["x"][1]], "y": [an["y"][0] + p / 2 + fd, an["y"][1] - p / 2 - fd]}
    lv = an["louvre"]
    louvre_under = walk + an["height"] + an["beam"] - 0.06 - lv["thickness"]
    blades = []
    yb = an["y"][0] + p + lv["spacing"] / 2
    while yb + lv["width"] / 2 <= an["y"][1] - p - 0.02:
        blades.append(round(yb, 4))
        yb += lv["spacing"]

    def item(kind, at, face, size, z, cushion="ecru"):
        return {"kind": kind, "at": [round(at[0], 4), round(at[1], 4)], "face": list(face), "size": list(size), "z": z,
                "cushion": cushion}

    # the annex: lounge corner behind the front glass, kitchen at the back
    ax0, ax1 = annex_in["x"]
    ay0, ay1 = annex_in["y"]
    items = [item("sofa", (-6.6, ay0 + 0.08 + 0.425), (0.0, 1.0), (2.0, 0.85), walk),
             item("coffee_table", (-6.6, 1.6), (0.0, 1.0), (1.0, 0.55), walk, "greige"),
             item("armchair", (ax0 + 0.14 + 0.4, 1.55), (1.0, 0.0), (0.8, 0.8), walk)]
    lamps = [{"at": [-5.32, 0.55], "z": walk}]
    # the front strip and the right strip of the penthouse
    fy0, fy1 = inner["y"][0], core["y"][0]
    items += [item("sofa", (2.15, fy1 - 0.02 - 0.425), (0.0, -1.0), (2.4, 0.85), top),
              item("side_table", (0.55, 0.45), (0.0, -1.0), (0.45, 0.45), top, "greige"),
              item("armchair", (4.2, 2.1), (1.0, 0.0), (0.8, 0.8), top),
              item("side_table", (4.2, 2.85), (1.0, 0.0), (0.45, 0.45), top, "greige")]
    lamps.append({"at": [3.65, 0.5], "z": top})
    plants = [{"at": [-8.0, 2.55], "z": walk}, {"at": [-4.3, 0.3], "z": top}, {"at": [-4.2, 4.5], "z": top},
              {"at": [4.2, 5.2], "z": top}]
    I, R = P["island"], P["run"]
    stools = [[I["stools_x"], y] for y in blades if I["y"][0] + 0.25 <= y <= I["y"][1] - 0.25][::2]
    pendants = [{"at": [round((I["x"][0] + I["x"][1]) / 2, 4), y], "top": round(louvre_under, 4)} for _, y in stools]
    # footprints: the furniture, the kitchen, the lamps, the pots, against the walls, the core, the posts, the door paths
    sq = lambda c, r: [(c[0] - r, c[1] - r), (c[0] + r, c[1] - r), (c[0] + r, c[1] + r), (c[0] - r, c[1] + r)]  # noqa: E731
    box = lambda x, y: [(x[0], y[0]), (x[1], y[0]), (x[1], y[1]), (x[0], y[1])]  # noqa: E731
    named = [(f"{it['kind']}@{it['at']}", _footprint(it)) for it in items]
    named += [("run", box([an["x"][1] - R["depth"] - R["top_over"], an["x"][1]], R["y"])), ("island", box(I["x"], I["y"]))]
    named += [(f"stool@{c}", sq(c, 0.18)) for c in stools] + [(f"lamp@{q['at']}", sq(q["at"], 0.15)) for q in lamps]
    named += [(f"pot@{q['at']}", sq(q["at"], _POT_R)) for q in plants]
    dp = P["door_path"]
    doors = {o["wall"]: o["s"] for o in ph["openings"] if o["kind"] == "door"}
    blocks = [("core", box(core["x"], core["y"])),
              ("left door path", box([an["x"][1] - 0.9, px[0] + w + 0.9], [doors["left"][0] - dp, doors["left"][1] + dp])),
              ("front door path", box([doors["front"][0] - dp, doors["front"][1] + dp], [py[0], py[0] + w + 0.9]))]
    blocks += [(f"annex post {k}", box([x0, x0 + p], [y0, y0 + p])) for k, (x0, y0) in
               enumerate((x0, y0) for x0 in (an["x"][0], an["x"][1] - p) for y0 in (an["y"][0], an["y"][1] - p))]
    rooms = [box(annex_in["x"], annex_in["y"]), box(inner["x"], inner["y"])]
    problems = [f"{a} overlaps {b}" for i, (a, pa) in enumerate(named) for b, pb in named[i + 1:] if _overlap(pa, pb)]
    problems += [f"{a} overlaps {b}" for a, pa in named for b, pb in blocks if _overlap(pa, pb)]
    problems += [f"{a} outside the rooms" for a, pa in named
                 if not any(all(r[0][0] - 1e-6 <= x <= r[1][0] + 1e-6 and r[0][1] - 1e-6 <= y <= r[2][1] + 1e-6 for x, y in pa)
                            for r in rooms)]
    dl = []
    for x in (-4.0, -2.4, -0.8, 0.8, 2.4, 4.0):                        # downlights: a row along the front strip,
        dl.append([x, round((fy0 + fy1) / 2, 4)])
    for x in (inner["x"][0], inner["x"][1]):                            # and down each side strip
        xm = round((x + (core["x"][0] if x < 0 else core["x"][1])) / 2, 4)
        dl += [[xm, y] for y in (1.6, 3.2, 4.8)]
    fills = [_rect_fill(inner["x"], [fy0, fy1], ceiling),
             _rect_fill([inner["x"][0], core["x"][0]], [fy1, inner["y"][1]], ceiling),
             _rect_fill([core["x"][1], inner["x"][1]], [fy1, inner["y"][1]], ceiling),
             _rect_fill(annex_in["x"], annex_in["y"], round(louvre_under, 4))]
    return {"comment": "AI 638 penthouse: the annex holds the kitchen (counter run with a lit shelf on the penthouse wall, an "
                       "island with stools and pendants from the louvres) and a lounge corner; the penthouse ring a sofa "
                       "at the front slider and an armchair at the right window; downlights, warm fills, plants",
            "config": P, "top": top, "walk": walk, "ceiling": ceiling, "louvre_under": round(louvre_under, 4),
            "annex_in": annex_in, "inner": inner, "core": core, "items": items, "lamps": lamps, "plants": plants,
            "stools": stools, "pendants": pendants, "downlights": dl, "fills": fills, "problems": problems}
