"""props_layout.py -- AI 627: the balcony planting of the Terra & Mar rebuild, from the planter slots AI 645 reserved.

Pure Python (make_plan.py writes the result to plan["props"]["balcony_plants"]). b8 reads:
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
