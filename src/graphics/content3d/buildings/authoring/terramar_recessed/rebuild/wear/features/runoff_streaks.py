# runoff_streaks -- faint rain-runoff streaks below the places where water leaves an edge (wear feature, 2026-10-14).
#
# Rain that collects on a ledge leaves it at a few particular places and runs down the stone below, picking up the dust
# that settled there and leaving a faint, darker, dirt-laden streak behind. On this building the water leaves:
#   glass_joint    a balcony slab's fascia (floors 1-5) below a joint between two guard glass panels: the glass sheds
#                  its rain down the joint onto the 0.15 m ledge outside the guard shoe, which spills it over the fascia
#   roof_joint     the same below the roof guard's panel joints, down the roof slab's taller fascia
#   corner         a slab fascia on a rounded corner, where the ledge's water gathers on the turn
#   shoe_end       the fascia beside a front pilaster, where the guard shoe stops and the balcony floor's water gets out
#                  past its end
#   planter_drain  the podium edge (floor 1) below an edge planter box's weep hole: over the podium roof fascia and on
#                  down the stone below it (a pier, or the lintel band down to an upper recess's head)
#   sill_corner    a lower corner of an upper podium recess: the recess floor and its planter box drain over the front
#                  edge where it meets the pier, down the slab edge and the ground lintel to the storefront head
#   lantern        rust: one or two of the four wall lanterns' fixings bleed a short orange-brown streak
# Most drip points carry nothing, as on a real building: each candidate is kept with its kind's probability (a little
# higher up the building, where wind-driven rain is heavier), drawn from a seed on its stable id (level, run, joint,
# box, bay), so rebuilds are exact and a change elsewhere reshuffles nothing.
#
# ONE STREAK AT A TIME. Every kept source draws its own streak from its seed: how much dirt it carries (most light, a
# few heavier), its length (0.3-1.6 m; a fascia's lower arris ends it sooner), its width at the drip and how much it
# widens as it falls, how it fades, where under the drip point it starts, a slight wander (a slow meander of a few
# millimetres, one smooth curve per streak) and the one to three rivulets inside it. No noise texture anywhere.
#
# THE PATH comes from the built geometry: the building part (terramar_building.blend, the one beside the wear part) is
# linked read-only and ray-cast. A streak runs down while the face under it stays stone (or a stone joint) and stays
# within TOL of the face it started on (a joint groove is crossed, a small set-back crept round); it stops where an
# edge throws the water off (a fascia's lower arris, a recess head, the storefront head) or something stands in front
# (a pilaster, a lantern, an awning tie rod's anchor). Where it stops at an edge, the water hangs there before
# dripping, so the last centimetre is a touch darker. Along the way the stone's own joints shape it: a vertical joint
# near the drip point draws the water into it, and at a bed joint the water hangs and spreads a little before running
# on.
#
# THE OVERLAYS. One thin decal per streak in TM_WEAR_runoff_streaks, conforming to the ray hits PROUD off the face (the
# nearest face of each 3 x 3 neighbourhood, so it bridges joint grooves and never dips into a step), its mask a tile of
# one atlas image generated here (ctx.image_dir/runoff_streaks_atlas.png, 3 mm per pixel). The decals see camera rays
# only (shadow, diffuse, glossy, transmission off) and their material is a tinted Transparent BSDF: what the camera sees
# through it is the stone's own shaded colour times 1 - k * DIRT (or RUST), k = mask * strength, so the streak darkens
# and greys the stone's own texture and leaves the lighting untouched. The material reads the switch: k is 0 with
# tm_wear off and with the strength at 0 (the decal is then a clear surface); debug paints the mask in DEBUG_RGB. Off
# is exact (the switch excludes TM_WEAR); at strength 0 the camera rays still cross the clear decals, which shifts the
# path tracer's sampling sequence in those pixels: the same picture, noise-level differences there.
# Why overlays and not the shader: the streaks are a few centimetres wide and the facade vertices are 0.6-1.2 m apart,
# so a per-vertex signal cannot carry them; one decal per streak keeps each one unique and touches no material.
#
# No rinsed (lighter) streaks: b8's stone is clean, so there is no dust film for the runoff to wash off.
import math
import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from .. import classes, context, nodes

NAME = "runoff_streaks"
LABEL = ("faint rain-runoff streaks below drip points: slab fascias, the podium edge, recess sill corners, rust under "
         "lanterns")
ORDER = 220
CLASSES = ()                   # no shader part: the streaks are overlays
SIGNALS = ()
DEBUG_RGB = (0.10, 0.35, 1.00)
DEFAULT_STRENGTH = 1.0

SEED = 220
BUILDING_FILE, BUILDING_ROOT = "terramar_building.blend", "TM_BUILDING"
INTERIOR = ("RB_INTERIOR",)
ATLAS = "runoff_streaks_atlas.png"
MATERIAL = "TM_WEAR_runoff_streaks"
PROUD = 0.004                  # off the face; the audit counts same-facing faces within 3 mm as a z-fight, so not 2 mm

# ---------------------------------------------------------------------------------------------------- the sources
# kind: p = the share of candidates that carry a streak (times the height factor), amount = the dirt it carries
# (drawn as u ** 1.6 across the range: most light, a few heavier), length (m), w0 = half-width at the drip (m)
KINDS = {
    "glass_joint": dict(p=0.045, amount=(0.30, 0.85), length=(0.30, 1.60), w0=(0.018, 0.040)),
    "roof_joint": dict(p=0.060, amount=(0.30, 0.90), length=(0.30, 1.60), w0=(0.020, 0.045)),
    "corner": dict(p=0.070, amount=(0.30, 0.90), length=(0.30, 1.60), w0=(0.025, 0.055)),
    "shoe_end": dict(p=0.200, amount=(0.35, 1.00), length=(0.30, 1.60), w0=(0.020, 0.045)),
    "planter_drain": dict(p=0.400, amount=(0.35, 0.90), length=(0.60, 1.60), w0=(0.020, 0.045)),
    "sill_corner": dict(p=0.200, amount=(0.30, 0.85), length=(0.50, 1.20), w0=(0.020, 0.045)),
    "lantern": dict(count=(1, 2), amount=(0.65, 0.95), length=(0.25, 0.55), w0=(0.012, 0.020)),
}
HEIGHT = (5.0, 27.0, 0.75, 1.25)   # the probability factor: HEIGHT[2] at z HEIGHT[0] rising to HEIGHT[3] at HEIGHT[1]
ARC_SEG = 0.25                 # guard-line segments shorter than this belong to a rounded corner
END_IN = (0.03, 0.10)          # a shoe end's streak sits this far in from the pilaster
SILL_IN = (0.03, 0.12)         # a sill corner's streak sits this far in from the pier face
STACK = 0.25                   # the same joint, corner or shoe end on another floor carries one this much less often:
                               # the guards repeat floor to floor, their streaks must not stack into a pattern

# ---------------------------------------------------------------------------------------------------- the path
D = 0.5                        # rays start this far out from the face
DX, DZ = 0.01, 0.02            # decal grid: columns across, rows down (m)
FINE = 0.003                   # the fine scans (joints, the end) step
TOL = 0.025                    # a face within this of the start face (curvature, joint grooves, set-backs) carries on
FORWARD = 0.012                # something standing further forward than this is an obstacle (the streak stops at it)
GROOVE = 0.0015                # deeper than this behind the face is a joint groove
ATTRACT = 0.03                 # a vertical joint this close to the drip point draws the streak into it
ROD_BOX = (0.03, 0.05, 0.04)   # awning tie-rod anchors on the lintel face: half-width, depth, half-height (obstacles)

# ---------------------------------------------------------------------------------------------------- the look
PX = 0.003                     # mask resolution (m per pixel)
ATLAS_W = 2048
LAT_P = 2.2                    # across a streak: exp(-(x / hw) ** LAT_P), a soft edge
RIV_SHARE = 0.35               # the rivulets carry this share of the streak's value
JOINT_HOLD, JOINT_SPREAD = 0.25, 0.15   # at a bed joint: this much darker along it, this much wider just below it
LIP = 0.30                     # this much darker in the last ~1.2 cm above an edge the water drips off
DIRT = (0.58, 0.56, 0.50)      # at k = 1 the stone keeps 1 - DIRT of its colour: darker and a touch greyer (AgX
                               # compresses the pale stone: 8 % darker in linear light reads as only ~4 of 255)
RUST = (0.28, 0.58, 0.85)      # rust: warm orange-brown


# ---------------------------------------------------------------------------------------------------- helpers
def _seed(*parts):
    return context.WearContext.seed(SEED, *parts)


def _lerp(rng, u):
    return rng[0] + (rng[1] - rng[0]) * u


def _height_factor(z):
    z0, z1, f0, f1 = HEIGHT
    return f0 + (f1 - f0) * min(max((z - z0) / (z1 - z0), 0.0), 1.0)


def _length(path):
    return sum(math.dist(a, b) for a, b in zip(path, path[1:]))


def _at(path, s):
    """(point, outward normal) at arc length s along a CCW polyline (outward = its right-hand side)."""
    acc = 0.0
    for a, b in zip(path, path[1:]):
        seg = math.dist(a, b)
        if seg > 1e-9 and acc + seg >= s:
            t = (s - acc) / seg
            dx, dy = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), (dy, -dx)
        acc += seg
    a, b = path[-2], path[-1]
    seg = math.dist(a, b)
    return tuple(b), ((b[1] - a[1]) / seg, -(b[0] - a[0]) / seg)


def _arcs(path):
    """Arc-length ranges of the rounded corners: maximal runs of segments shorter than ARC_SEG."""
    out, acc, start = [], 0.0, None
    for a, b in zip(path, path[1:]):
        seg = math.dist(a, b)
        if seg < ARC_SEG:
            start = acc if start is None else start
        elif start is not None:
            out.append((start, acc))
            start = None
        acc += seg
    if start is not None:
        out.append((start, acc))
    return [r for r in out if r[1] - r[0] > 0.3]


def _source(kind, sid, p, n, z, **extra):
    return {"kind": kind, "id": sid, "p": (float(p[0]), float(p[1])), "n": (float(n[0]), float(n[1])), "z": float(z),
            **extra}


# ---------------------------------------------------------------------------------------------------- candidates
def candidates(plan):
    """Every place water can leave an edge onto the stone, with a stable id."""
    b, env, pd = plan["balconies"], plan["envelope"], plan["podium"]
    out = []
    guards = [(f"f{floor}", r, top, run) for floor, (top, _) in enumerate(env["storeys"], start=1)
              for r, run in enumerate(b["guard_runs"])]
    guards += [("roof", h, plan["roof"]["roof_top"], half) for h, half in enumerate(plan["roof"]["guard_halves"])]
    for level, r, top, run in guards:
        total = _length(run)
        n = max(1, math.ceil(total / b["panel_max"]))
        kind = "roof_joint" if level == "roof" else "glass_joint"
        for k in range(1, n):                                   # the joints between the guard's glass panels
            p, nr = _at(run, total * k / n)
            out.append(_source(kind, f"{level}:{r}:joint{k}", p, nr, top))
        for k, (s0, s1) in enumerate(_arcs(run)):                # the rounded corners
            sid = f"{level}:{r}:corner{k}"
            p, nr = _at(run, _lerp((s0, s1), _lerp((0.2, 0.8), _seed(sid, "at"))))
            out.append(_source("corner", sid, p, nr, top))
        if level != "roof":                                     # the shoe's ends at the pilasters
            for end in (0, 1):
                sid = f"{level}:{r}:end{end}"
                d = _lerp(END_IN, _seed(sid, "in"))
                p, nr = _at(run, d if end == 0 else total - d)
                out.append(_source("shoe_end", sid, p, nr, top))
    for box in plan["props"]["podium_planters"]["boxes"]:       # the podium edge boxes' weep holes
        if box["kind"] != "edge":
            continue
        a, c = box["loop"][0], box["loop"][1]                   # the box's outer side
        sid = f"box:{box['id']}"
        p, nr = _at([a, c], math.dist(a, c) * _lerp((0.1, 0.9), _seed(sid, "at")))
        out.append(_source("planter_drain", sid, p, nr, plan["levels_m"]["podium_top"]))
    runs = {r["run"]: r for r in pd["runs"]}
    for bay in pd["bays"]:                                      # the upper recesses' lower corners
        r = runs[bay["run"]]
        for end in (0, 1):
            sid = f"bay:{bay['id']}:{end}"
            d = _lerp(SILL_IN, _seed(sid, "in"))
            s = bay["s"][0] + d if end == 0 else bay["s"][1] - d
            p = (r["p"][0] + r["along"][0] * s, r["p"][1] + r["along"][1] * s)
            out.append(_source("sill_corner", sid, p, r["outward"], pd["storeys"]["upper"][0]))
    for k, ln in enumerate(pd["lanterns"]):                     # the lanterns' wall fixings
        out.append(_source("lantern", f"lantern:{k}:{ln['kind']}", (ln["x"], ln["y"]), ln["outward"],
                           pd["lantern"]["z"][0]))
    return out


def select(cands):
    """The candidates that carry a streak: each kept with its kind's probability (lanterns: one or two of them). A
    joint, corner or shoe end repeats on every floor's guard: once one floor's carries a streak, the same place on the
    floors above carries one only STACK as often."""
    keep, stacked = [], set()
    for c in cands:
        k = KINDS[c["kind"]]
        if "p" not in k:
            continue
        column = c["id"].split(":", 1)[1] if c["kind"] in ("glass_joint", "corner", "shoe_end") else None
        p = k["p"] * _height_factor(c["z"]) * (STACK if column in stacked else 1.0)
        if _seed(c["id"], "keep") < p:
            keep.append(c)
            if column is not None:
                stacked.add(column)
    lanterns = sorted([c for c in cands if c["kind"] == "lantern"], key=lambda c: _seed(c["id"], "keep"))
    lo, hi = KINDS["lantern"]["count"]
    keep += lanterns[:lo + int(_seed("lantern", "count") * (hi - lo + 1))]
    return keep


def params(c):
    """A streak's own shape, drawn from its seed."""
    k, sid = KINDS[c["kind"]], c["id"]
    r = lambda key: _seed(sid, key)                             # noqa: E731
    length = _lerp(k["length"], r("length"))
    rivs = [(_lerp((-0.6, 0.6), r(f"riv_at{i}")), _lerp((0.15, 0.35), r(f"riv_w{i}")),
             _lerp((0.5, 1.0), r(f"riv_k{i}")))
            for i in range(1 + min(2, int(3 * r("rivulets"))))]
    return {"amount": _lerp(k["amount"], r("amount") ** 1.6), "length": length,
            "efold": max(0.15, length * _lerp((0.25, 0.60), r("efold"))), "w0": _lerp(k["w0"], r("w0")),
            "spread": _lerp((0.00, 0.90), r("spread")), "off": _lerp((-0.015, 0.015), r("off")),
            "drift": _lerp((-0.02, 0.02), r("drift")), "wander": _lerp((0.001, 0.004), r("wander")),
            "wave": _lerp((0.50, 1.40), r("wave")), "phase": 2 * math.pi * r("phase"),
            "head": _lerp((0.05, 0.30), r("head")), "rivulets": rivs, "rust": c["kind"] == "lantern"}


# ---------------------------------------------------------------------------------------------------- the geometry
STONE, JOINT, OTHER = 1, 2, 0


def _box_tris(centre, U, N, hw, depth, hh, verts, tris):
    c, U, N = Vector(centre), Vector((*U, 0.0)), Vector((*N, 0.0))
    Z = Vector((0.0, 0.0, 1.0))
    base = len(verts)
    for su in (-hw, hw):
        for sv in (0.0, depth):
            for sz in (-hh, hh):
                verts.append(tuple(c + U * su + N * sv + Z * sz))
    quads = ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))
    for q in quads:
        tris.append((base + q[0], base + q[1], base + q[2]))
        tris.append((base + q[0], base + q[2], base + q[3]))
    return 12


def building_path(ctx):
    here = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else ""
    rebuild = os.path.dirname(os.path.dirname(ctx.image_dir))
    for d in (here, rebuild):
        p = os.path.join(d, BUILDING_FILE) if d else ""
        if p and os.path.exists(p):
            return p
    raise SystemExit(f"{NAME}: no {BUILDING_FILE} beside the wear part or in {rebuild}: build the building first")


def surfaces(path, plan):
    """(BVH, per-triangle code STONE | JOINT | OTHER) of the building part's exterior, linked read-only and dropped
    again, plus the awning tie rods' anchors on the lintels (props, from the plan) as obstacles."""
    with bpy.data.libraries.load(path, link=True) as (src, dst):
        dst.collections = [BUILDING_ROOT]
    root = dst.collections[0]
    lib = root.library
    verts, tris, codes = [], [], []
    try:
        hidden = set()
        for c in [root] + list(root.children_recursive):
            if c.name in INTERIOR:
                hidden |= {o.name for o in c.all_objects}
        for ob in sorted(root.all_objects, key=lambda o: o.name):
            if ob.type != 'MESH' or ob.name in hidden or not ob.data.polygons:
                continue
            me = ob.data
            n = len(me.vertices)
            co = np.empty(n * 3)
            me.vertices.foreach_get("co", co)
            mw = np.array(ob.matrix_world, dtype=np.float64)
            co = co.reshape(n, 3) @ mw[:3, :3].T + mw[:3, 3]
            lt = me.loop_triangles
            tv = np.empty(len(lt) * 3, dtype=np.int64)
            lt.foreach_get("vertices", tv)
            mi = np.empty(len(lt), dtype=np.int64)
            lt.foreach_get("material_index", mi)
            slot = []
            for m in me.materials:
                cls = classes.classify(m)[1] if m is not None else "none"
                slot.append(JOINT if m is not None and classes.base_name(m.name) == "TM_RB_stone_joint"
                            else STONE if cls == "stone" else OTHER)
            base = len(verts)
            verts.extend(map(tuple, co))
            tris.extend(map(tuple, tv.reshape(-1, 3) + base))
            codes.extend(slot[i] if i < len(slot) else OTHER for i in mi)
    finally:
        bpy.data.libraries.remove(lib)
    aw = plan["props"]["storefront_awnings"]
    rod_z = aw["config"]["rod_anchor_z"]
    for c in aw["canopies"]:
        for s in c["rods"]:
            at = (c["p"][0] + c["along"][0] * s, c["p"][1] + c["along"][1] * s, rod_z)
            codes.extend([OTHER] * _box_tris(at, c["along"], c["outward"], *ROD_BOX, verts, tris))
    return BVHTree.FromPolygons(verts, tris, all_triangles=True), np.array(codes, dtype=np.int8)


class Frame:
    """A streak's frame on its face: B the face point under the drip, n out of the face, t across (to the right seen
    from outside), z0 the drip's height; sample(x, y) casts at x across, y below z0 -> (distance, code) or None."""

    def __init__(self, bvh, codes, base, n):
        self.bvh, self.codes = bvh, codes
        self.n = Vector((n[0], n[1], 0.0)).normalized()
        self.t = Vector((-self.n.y, self.n.x, 0.0))
        self.B = Vector(base)

    def origin(self, x, y):
        return self.B + self.n * D + self.t * x - Vector((0.0, 0.0, y))

    def sample(self, x, y):
        loc, _, idx, dist = self.bvh.ray_cast(self.origin(x, y), -self.n, D + 0.5)
        if loc is None:
            return None
        return dist, int(self.codes[idx])


def locate(bvh, codes, c):
    """The face point under a source's drip, or None when the drip is not over stone."""
    n = Vector((c["n"][0], c["n"][1], 0.0)).normalized()
    z = c["z"] - PROUD
    o = Vector((c["p"][0], c["p"][1], z)) + n * (D + 0.3)
    loc, _, idx, dist = bvh.ray_cast(o, -n, D + 0.8)
    if loc is None or codes[idx] == OTHER:
        return None
    return Frame(bvh, codes, (loc.x, loc.y, z), c["n"])


def fine_scans(fr, P, ymax):
    """Along the drip line: where the face ends (an edge or an obstacle) and its bed joints; across, near the top: the
    vertical joints. Returns (y_end, stop, bed joint descents, the vertical joint the streak follows or None)."""
    ref = fr.sample(P["off"], 0.0)
    if ref is None or ref[1] == OTHER:
        return 0.0, "none", [], None
    d0 = ref[0]
    beds, run, y_end, stop = [], None, ymax, "length"
    for i in range(int(ymax / FINE) + 1):
        y = i * FINE
        s = fr.sample(P["off"] + P["drift"] * y, y)
        if s is not None and s[0] < d0 - FORWARD:
            y_end, stop = max(y - FINE, 0.0), "obstacle"            # something stands in front: a lantern, a rod
            break
        if s is None or s[1] == OTHER or s[0] > d0 + TOL:
            y_end, stop = max(y - FINE, 0.0), "edge"                # an arris, a recess, the storefront head
            break
        groove = s[1] == JOINT or s[0] > d0 + GROOVE
        if groove and run is None:
            run = y
        elif not groove and run is not None:
            beds.append((run + y - FINE) / 2)
            run = None
    verts = []
    run = None
    y = min(0.03, y_end / 2)
    for i in range(int(2 * ATTRACT / FINE) + 1):
        x = P["off"] - ATTRACT + i * FINE
        s = fr.sample(x, y)
        groove = s is not None and s[1] != OTHER and (s[1] == JOINT or d0 + GROOVE < s[0] < d0 + TOL)
        if groove and run is None:
            run = x
        elif not groove and run is not None:
            verts.append((run + x - FINE) / 2)
            run = None
    vj = min(verts, key=lambda x: abs(x - P["off"])) if verts else None
    return y_end, stop, [b for b in beds if 0.02 < b < y_end - 0.01], vj


# ---------------------------------------------------------------------------------------------------- the streak
def centre(P, vj, y):
    meander = np.sin(2 * math.pi * y / P["wave"] + P["phase"]) * np.minimum(1.0, y / 0.1)
    c = P["off"] + P["drift"] * y + P["wander"] * meander
    if vj is not None:
        c = c + (vj - P["off"]) * (1.0 - np.exp(-y / 0.12))
    return c


def half_width(P, beds, y):
    hw = P["w0"] * np.maximum(0.35, 1.0 + P["spread"] * y)
    for b in beds:
        hw = hw * (1.0 + JOINT_SPREAD * np.where(y > b, np.exp(-np.maximum(y - b, 0.0) / 0.06), 0.0))
    return hw


def extent(P, vj, beds, y_end):
    y = np.linspace(0.0, y_end, 64)
    c, hw = centre(P, vj, y), half_width(P, beds, y)
    return float(np.max(np.abs(c) + 2.6 * hw)) + DX


def mask(P, vj, beds, y_end, stop, X, Y):
    """The streak's value (0..1) on a grid of lateral offsets X and descents Y (m)."""
    c, hw = centre(P, vj, Y), half_width(P, beds, Y)
    lat = np.exp(-(np.abs(X - c) / hw) ** LAT_P)
    riv, wsum = np.zeros_like(X), 0.0
    for at, w, k in P["rivulets"]:
        riv = np.maximum(riv, k / (1.0 + (np.abs(X - c - at * hw) / (w * hw)) ** 4))
        wsum = max(wsum, k)
    lat = lat * ((1.0 - RIV_SHARE) + RIV_SHARE * riv / wsum)
    L = P["length"]
    dep = np.clip(Y / 0.012, 0.0, 1.0) * np.exp(-Y / P["efold"]) * (1.0 + P["head"] * np.exp(-Y / 0.03))
    t = np.clip((Y - 0.7 * L) / (0.3 * L), 0.0, 1.0)
    dep = dep * (1.0 - t * t * (3.0 - 2.0 * t))
    for b in beds:
        dep = dep * (1.0 + JOINT_HOLD * np.exp(-((Y - b) / 0.008) ** 2))
    if stop == "edge" and y_end < L:
        dep = dep * (1.0 + LIP * np.exp(-np.maximum(y_end - Y, 0.0) / 0.012))
    return np.clip(P["amount"] * dep * lat, 0.0, 1.0)


def trace(fr, P, vj, beds, y_end, X):
    """The decal grid: rows down to y_end, columns across +-X; per sample the distance to the face (nan = not on it).
    The vertex distance is the nearest face of its 3 x 3 neighbourhood (bridging joint grooves, never inside a step)."""
    ys = list(np.arange(0.0, y_end - 1e-6, DZ)) + [y_end]
    xs = np.linspace(-X, X, max(3, int(math.ceil(2 * X / DX)) + 1))
    d0 = fr.sample(P["off"], 0.0)[0]
    dist = np.full((len(ys), len(xs)), np.nan)
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            s = fr.sample(float(x), float(y))
            if s is not None and s[1] != OTHER and d0 - FORWARD <= s[0] <= d0 + TOL:
                dist[i, j] = s[0]
    near = dist.copy()
    pad = np.pad(dist, 1, constant_values=np.nan)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            near = np.fmin(near, pad[1 + di:1 + di + len(ys), 1 + dj:1 + dj + len(xs)])
    near[np.isnan(dist)] = np.nan
    return np.array(ys), xs, near


# ---------------------------------------------------------------------------------------------------- atlas, material
def pack(sizes, width):
    """Shelf packing: [(w, h)] -> ([(x, y)] from the bottom-left, atlas height)."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    at, x, y, shelf = [None] * len(sizes), 0, 0, 0
    for i in order:
        w, h = sizes[i]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 2, 0
        at[i] = (x, y)
        x += w + 2
        shelf = max(shelf, h)
    return at, y + shelf


def write_atlas(path, tiles, sizes, at, height):
    """The atlas as an 8-bit PNG (R = G = B = mask), loaded back as a file image (Non-Color)."""
    H = 1 << max(6, int(math.ceil(math.log2(max(height, 1)))))
    img = np.zeros((H, ATLAS_W), dtype=np.float32)
    for tile, (x, y) in zip(tiles, at):
        img[y:y + tile.shape[0], x:x + tile.shape[1]] = tile
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = bpy.data.images.get(os.path.basename(path))
    if old is not None:
        bpy.data.images.remove(old)
    gen = bpy.data.images.new("runoff_streaks_tmp", ATLAS_W, H, alpha=False)
    px = np.ones((H, ATLAS_W, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = img
    gen.pixels.foreach_set(px.ravel())
    gen.filepath_raw = path
    gen.file_format = 'PNG'
    gen.save()
    bpy.data.images.remove(gen)
    image = bpy.data.images.load(path, check_existing=False)
    image.name = os.path.basename(path)
    image.colorspace_settings.name = 'Non-Color'
    return image, H


def material(image):
    """The decals' material: a Transparent BSDF tinted 1 - k * DIRT (RUST on a rust streak), k = mask * strength, for
    camera rays only; k = 0 with the switch off or the strength 0. Debug: the mask in DEBUG_RGB."""
    mat = bpy.data.materials.get(MATERIAL) or bpy.data.materials.new(MATERIAL)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    b = nodes.Builder(nt)
    out = b.node('ShaderNodeOutputMaterial')
    tex = b.node('ShaderNodeTexImage', interpolation='Linear', extension='CLIP')
    tex.image = image
    m = b.sep(tex.outputs['Color'])[0]
    mode = b.attr("tm_wear", 'VIEW_LAYER')
    strength = b.attr("tm_wear_" + NAME, 'VIEW_LAYER')
    cam = b.node('ShaderNodeLightPath').outputs['Is Camera Ray']
    on = b.mul(b.mul(b.gt(mode, 0.5), b.one_minus(b.gt(mode, 1.5))), cam)
    k = b.mul(b.mul(m, strength), on)
    dark = b.mix(DIRT, RUST, b.attr("tm_wear_runoff_rust", 'OBJECT'), 'VECTOR')
    shade = b.node('ShaderNodeVectorMath', operation='SCALE')
    b.set(shade.inputs[0], dark)
    b.set(shade.inputs['Scale'], k)
    filt = b.node('ShaderNodeVectorMath', operation='SUBTRACT')
    b.set(filt.inputs[0], (1.0, 1.0, 1.0))
    b.set(filt.inputs[1], shade.outputs['Vector'])
    floor = b.node('ShaderNodeVectorMath', operation='MAXIMUM')         # a strength well over 1 never goes negative
    b.set(floor.inputs[0], filt.outputs['Vector'])
    b.set(floor.inputs[1], (0.0, 0.0, 0.0))
    clear = b.node('ShaderNodeBsdfTransparent')
    b.set(clear.inputs['Color'], floor.outputs['Vector'])
    dbg = b.node('ShaderNodeBsdfPrincipled')
    dbg.inputs['Base Color'].default_value = (*DEBUG_RGB, 1.0)
    dbg.inputs['Roughness'].default_value = 0.85
    dfac = b.mul(b.mul(b.clamp(b.mul(m, 6.0)), b.gt(strength, 0.0)), b.mul(b.gt(mode, 1.5), cam))
    mix = b.node('ShaderNodeMixShader')
    b.set(mix.inputs['Fac'], dfac)
    nt.links.new(clear.outputs['BSDF'], mix.inputs[1])
    nt.links.new(dbg.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    mat.surface_render_method = 'DITHERED'
    mat["tm_wear_overlay"] = NAME
    return mat


def decal_mesh(name, fr, ys, xs, near, uv_rect):
    """The decal from the trace grid: a vertex per sample on the face (PROUD off its nearest neighbourhood face), a quad
    where all four corners are on the face, UVs into the atlas tile."""
    u0, v0, u1, v1 = uv_rect
    idx = -np.ones(near.shape, dtype=np.int64)
    verts, uvs = [], []
    X, Y = xs[-1], ys[-1]
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            if np.isnan(near[i, j]):
                continue
            idx[i, j] = len(verts)
            p = fr.origin(float(x), float(y)) - fr.n * (near[i, j] - PROUD)
            verts.append(tuple(p))
            uvs.append((u0 + (u1 - u0) * (x + X) / (2 * X), v1 - (v1 - v0) * y / Y))
    faces = []
    for i in range(len(ys) - 1):
        for j in range(len(xs) - 1):
            q = (idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1])
            if min(q) >= 0:
                faces.append(q)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    used = sorted({v for f in faces for v in f})
    lay = me.uv_layers.new(name="UVMap")
    loop_v = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loop_v)
    uv = np.array(uvs, dtype=np.float32)[loop_v]
    lay.data.foreach_set("uv", uv.ravel())
    if len(used) < len(verts):                       # samples on the face that no quad uses
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(me)
        bm.free()
    me.update()
    return me


# ---------------------------------------------------------------------------------------------------- the feature
def shader(b, ins):
    """No shader part: the streaks are overlays (see the header)."""
    return {}


def overlays(ctx):
    plan = ctx.plan
    bvh, codes = surfaces(building_path(ctx), plan)
    cands = candidates(plan)
    kept = select(cands)
    built, skipped, tiles, sizes, items = [], [], [], [], []
    for c in kept:
        fr = locate(bvh, codes, c)
        if fr is None:
            skipped.append((c["id"], "not over stone"))
            continue
        P = params(c)
        y_end, stop, beds, vj = fine_scans(fr, P, P["length"] * 1.02)
        if y_end < 0.08:
            skipped.append((c["id"], f"face ends after {y_end:.2f} m"))
            continue
        X = extent(P, vj, beds, y_end)
        ys, xs, near = trace(fr, P, vj, beds, y_end, X)
        w, h = int(math.ceil(2 * X / PX)), int(math.ceil(y_end / PX))
        gx = -X + (np.arange(w) + 0.5) * (2 * X / w)
        gy = y_end * (1.0 - (np.arange(h) + 0.5) / h)          # tile rows from the bottom: the streak's end first
        tile = mask(P, vj, beds, y_end, stop, gx[None, :], gy[:, None])
        tiles.append(tile.astype(np.float32))
        sizes.append((w, h))
        items.append((c, P, fr, ys, xs, near, y_end, stop, beds, vj))
    at, height = pack(sizes, ATLAS_W)
    image, H = write_atlas(os.path.join(ctx.image_dir, ATLAS), tiles, sizes, at, height)
    mat = material(image)
    for (c, P, fr, ys, xs, near, y_end, stop, beds, vj), (w, h), (x, y) in zip(items, sizes, at):
        name = "wear_runoff_" + c["id"].replace(":", "_")
        me = decal_mesh(name, fr, ys, xs, near, (x / ATLAS_W, y / H, (x + w) / ATLAS_W, (y + h) / H))
        me.materials.append(mat)
        ob = ctx.add(name, me)
        ob["tm_wear_runoff_rust"] = 1.0 if P["rust"] else 0.0
        ob["tm_wear_runoff_kind"] = c["kind"]
        ob["tm_element"], ob["tm_role"] = "TM_WEAR", f"runoff_{c['kind']}"
        for flag in ("visible_shadow", "visible_diffuse", "visible_glossy", "visible_transmission",
                     "visible_volume_scatter"):
            setattr(ob, flag, False)
        built.append({"id": c["id"], "kind": c["kind"], "amount": round(P["amount"], 3),
                      "length": round(P["length"], 2),
                      "ran_m": round(y_end, 3), "stop": stop, "width_m": round(2 * P["w0"], 3),
                      "beds": len(beds), "follows_joint": vj is not None, "faces": len(me.polygons)})
    by_kind = {}
    for c in cands:
        by_kind.setdefault(c["kind"], [0, 0, 0])[0] += 1
    for c in kept:
        by_kind[c["kind"]][1] += 1
    for s in built:
        by_kind[s["kind"]][2] += 1
    return {"candidates_kept_built": by_kind, "streaks": len(built), "skipped": skipped,
            "atlas": [ATLAS_W, H], "faces": sum(s["faces"] for s in built), "built": built}
