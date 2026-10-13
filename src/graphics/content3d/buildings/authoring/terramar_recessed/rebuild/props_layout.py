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
